import { NextRequest } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { auditLog } from '@/lib/audit-log';
import { requirePermission } from '@/lib/api-auth';
import {
  apiBadRequest,
  apiForbidden,
  apiNotFound,
  apiServerError,
  apiSuccess,
  getErrorMessage,
} from '@/lib/api-utils';
import { assertProjectAccess } from '@/lib/api-project-scope';
import { generateWorkerSalariesFromSplits } from '@/lib/team-settlement-salary';
import { invalidateAggregationCache } from '@/lib/data-aggregation';
import { pushBusinessNotification } from '@/lib/business-notification';
import { isDingTalkCardConfigured, sendTeamSettlementApprovalCard } from '@/lib/dingtalk-card';

/**
 * 班组结算审批流转
 * POST /api/team-settlements/workflow
 * body: { settlement_id, action: 'submit' | 'withdraw' | 'approve' | 'reject' | 'unapprove', reason? }
 *
 * - submit   ：预算员提交审批（draft / rejected → pending），需 team_settlements:submit
 * - withdraw ：预算员撤回（pending → draft），需 team_settlements:submit
 * - approve  ：老板审批通过（pending → reviewed），需 team_settlements:approve（仅超管/老板）
 *              通过后生成分账应发工资并计入成本
 * - reject   ：老板驳回（pending → rejected），需 team_settlements:approve，必须填驳回原因
 * - unapprove：老板反审核（reviewed → pending），需 team_settlements:approve，同时撤销该结算生成的工资
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const settlementId = Number(body?.settlement_id);
    const action = String(body?.action || '');
    const reason = body?.reason ? String(body.reason).trim() : '';
    const approverUserId = Number(body?.approverUserId) || 0;
    const approverName = String(body?.approverName || '').trim().slice(0, 100);

    if (!Number.isInteger(settlementId) || settlementId <= 0) {
      return apiBadRequest('结算单ID无效');
    }
    if (!['submit', 'withdraw', 'approve', 'reject', 'unapprove'].includes(action)) {
      return apiBadRequest('不支持的操作');
    }

    // 权限：提交/撤回需 submit；审批/驳回/反审核需 approve（老板/超管）
    const requiredPermission = action === 'approve' || action === 'reject' || action === 'unapprove'
      ? 'team_settlements:approve'
      : 'team_settlements:submit';
    const auth = await requirePermission(request, requiredPermission);
    if (!auth.ok) return auth.response;

    const supabase = getSupabaseClient();

    const { data: settlement, error } = await supabase
      .from('team_settlements')
      .select('*')
      .eq('id', settlementId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!settlement) return apiNotFound('结算单不存在');

    // 提交时指定的审批人只能处理自己那一单（老板/超管仍可代为审批）
    const designatedApproverId = Number((settlement as Record<string, unknown>).approver_user_id) || 0;
    const isBossOrSuper = Boolean(auth.user.is_super_admin) || auth.user.role === 'boss';
    if (['approve', 'reject', 'unapprove'].includes(action)
      && designatedApproverId > 0
      && Number(auth.user.id) !== designatedApproverId
      && !isBossOrSuper) {
      return apiForbidden('你不是本结算单指定的审批人，无法审批');
    }

    const projectId = Number(settlement.project_id);
    const access = await assertProjectAccess(supabase, auth.user, projectId);
    if (!access.ok) return apiForbidden('无权操作该项目班组结算');

    const currentStatus = String(settlement.status || 'draft');
    const now = new Date().toISOString();
    const operatorName = auth.user.name || auth.user.username || 'system';

    // 状态流转校验
    if (action === 'submit' && !['draft', 'rejected'].includes(currentStatus)) {
      return apiBadRequest('当前状态不能提交审批（仅草稿/已驳回可提交）');
    }
    if (action === 'withdraw' && currentStatus !== 'pending') {
      return apiBadRequest('只有待审批的结算单可以撤回');
    }
    if ((action === 'approve' || action === 'reject') && currentStatus !== 'pending') {
      return apiBadRequest('只有待审批的结算单可以审批');
    }
    if (action === 'unapprove' && currentStatus !== 'reviewed') {
      return apiBadRequest('只有已审批通过的结算单可以反审核');
    }
    if (action === 'reject' && !reason) {
      return apiBadRequest('请填写驳回原因');
    }

    // 更新状态与流转字段
    const patch: Record<string, unknown> = { status: '', updated_at: now };
    if (action === 'submit') {
      patch.status = 'pending';
      patch.submitted_at = now;
      patch.submitted_by = operatorName;
      patch.reject_reason = null;
    } else if (action === 'withdraw') {
      patch.status = 'draft';
      patch.submitted_at = null;
      patch.submitted_by = null;
    } else if (action === 'approve') {
      patch.status = 'reviewed';
      patch.reviewed_at = now;
      patch.reviewed_by = operatorName;
    } else if (action === 'unapprove') {
      patch.status = 'pending';
      patch.reviewed_at = null;
      patch.reviewed_by = null;
    } else {
      patch.status = 'rejected';
      patch.reject_reason = reason;
      patch.reviewed_at = now;
      patch.reviewed_by = operatorName;
    }

    // 乐观锁：仅当状态仍为读取时的状态才更新，防止并发审批/撤回互相覆盖
    const { data: updatedRows, error: updateError } = await supabase
      .from('team_settlements')
      .update(patch)
      .eq('id', settlementId)
      .eq('status', currentStatus)
      .select('id');
    if (updateError) throw new Error(updateError.message);
    if (!updatedRows || updatedRows.length === 0) {
      return apiBadRequest('结算单状态已变化（可能已被他人处理），请刷新后重试');
    }

    // 提交时记录「下一级审批人」（幂等：列缺失时降级为不指定审批人，不影响提交流程）
    if (action === 'submit' && approverUserId > 0) {
      const { error: approverError } = await supabase
        .from('team_settlements')
        .update({ approver_user_id: approverUserId, approver_name: approverName || null })
        .eq('id', settlementId);
      if (approverError && !String(approverError.message || '').includes('approver_user_id')) {
        throw new Error(approverError.message);
      }
    }
    // 撤回时清空指定审批人
    if (action === 'withdraw') {
      const { error: clearError } = await supabase
        .from('team_settlements')
        .update({ approver_user_id: null, approver_name: null })
        .eq('id', settlementId);
      if (clearError && !String(clearError.message || '').includes('approver_user_id')) {
        throw new Error(clearError.message);
      }
    }

    // 审批通过：生成分账应发工资（失败不阻断审批结果，但记录错误）
    let salaryResult: { created: number; skipped: number; conflicts: number[] } | null = null;
    if (action === 'approve') {
      const { data: splits } = await supabase
        .from('team_settlement_splits')
        .select('worker_id, work_hours, hourly_rate, amount')
        .eq('settlement_id', settlementId);
      if (splits && splits.length > 0) {
        try {
          salaryResult = await generateWorkerSalariesFromSplits({
            settlementId,
            settlementMonth: String(settlement.settlement_month),
            projectId,
            teamId: Number(settlement.team_id) || 0,
            splits,
          });
          if (salaryResult.conflicts.length > 0) {
            console.warn(
              `[team-settlement-workflow] 结算单 #${settlementId} 有 ${salaryResult.conflicts.length} 名工人本月已有工资记录，未生成分账应发: workerIds=${salaryResult.conflicts.join(',')}`,
            );
          }
        } catch (genError) {
          console.error(`[team-settlement-workflow] 审批通过但生成分账工资失败 settlementId=${settlementId}:`, genError);
        }
      }
    }

    // 反审核：撤销该结算单生成的分账应发工资（被生活费核对引用时保留并告警，避免破坏下游）
    let revokedSalaryCount = 0;
    if (action === 'unapprove') {
      const { data: salaryRows } = await supabase
        .from('worker_salaries')
        .select('id')
        .eq('settlement_id', settlementId);
      const salaryIds = (salaryRows || []).map((row: { id?: unknown }) => Number(row.id)).filter(Boolean);
      if (salaryIds.length > 0) {
        const { data: referenced } = await supabase
          .from('living_allowance_receipt_items')
          .select('id')
          .in('matched_salary_id', salaryIds)
          .limit(1);
        if (referenced && referenced.length > 0) {
          console.warn(`[team-settlement-workflow] 结算单 #${settlementId} 反审核：分账工资已被生活费核对引用，未删除，请人工核对`);
        } else {
          const { error: deleteSalaryError } = await supabase
            .from('worker_salaries')
            .delete()
            .in('id', salaryIds);
          if (deleteSalaryError) {
            console.error(`[team-settlement-workflow] 反审核撤销分账工资失败 settlementId=${settlementId}:`, deleteSalaryError);
          } else {
            revokedSalaryCount = salaryIds.length;
          }
        }
      }
    }

    // 失效聚合缓存（审批通过/反审核后成本口径变化）
    try {
      invalidateAggregationCache();
    } catch {
      // 缓存失效非致命
    }

    // 审批流转通知（系统通知 + 钉钉按通知设置推送；失败不阻断审批主流程）
    try {
      if (action === 'submit') {
        // 提交审批 → 通知老板（超管）审批
        const { data: bosses } = await supabase
          .from('users')
          .select('id')
          .eq('role', 'super_admin')
          .eq('is_disabled', false);
        const bossIds = (bosses || []).map((row: { id?: unknown }) => Number(row.id)).filter(Boolean);
        await pushBusinessNotification({
          type: 'team_settlement_approval',
          title: `班组结算待审批：${settlement.settlement_no || `#${settlementId}`}`,
          content: `项目 #${projectId} 的 ${settlement.settlement_month} 班组结算单已提交审批，审批通过后计入成本。`,
          severity: 'warning',
          projectId,
          relatedId: settlementId,
          relatedType: 'team_settlement',
          recipientUserIds: bossIds.length > 0 ? bossIds : undefined,
          metadata: {
            消息分类: '班组结算审批',
            业务摘要: `${settlement.settlement_month} 结算单待审批`,
            责任人: '老板',
            建议动作: '打开结算单核对后通过或驳回',
            处理入口: `/team-management/settlements/${settlementId}`,
          },
        });

        // 互动卡片：老板在钉钉卡片上直接点「通过/驳回」，回调自动回写系统
        if (isDingTalkCardConfigured()) {
          try {
            const { data: bossCardRows } = await supabase
              .from('users')
              .select('dingtalk_user_id')
              .eq('role', 'super_admin')
              .eq('is_disabled', false)
              .not('dingtalk_user_id', 'is', null);
            const receiverUserIds = Array.from(new Set(
              (bossCardRows || [])
                .map((row: { dingtalk_user_id?: string | null }) => String(row.dingtalk_user_id || '').trim())
                .filter(Boolean),
            ));
            if (receiverUserIds.length > 0) {
              const [{ data: projectRow }, { data: teamRow }, { data: itemRows }] = await Promise.all([
                supabase.from('projects').select('name').eq('id', projectId).maybeSingle(),
                supabase.from('team_groups').select('name').eq('id', Number(settlement.team_id) || 0).maybeSingle(),
                supabase.from('team_settlement_items').select('amount').eq('settlement_id', settlementId),
              ]);
              const quantityAmount = (itemRows || []).reduce((sum, row) => sum + Number(row.amount || 0), 0);
              const deductionTotal =
                Number(settlement.advance_deduct || 0) +
                Number(settlement.labor_insurance_deduct || 0) +
                Number(settlement.helper_deduct || 0) +
                Number(settlement.safety_fund_deduct || 0);
              const payableAmount = Math.max(0, quantityAmount - deductionTotal);
              const cardResult = await sendTeamSettlementApprovalCard({
                settlementId,
                settlementNo: settlement.settlement_no,
                projectName: projectRow?.name,
                teamName: teamRow?.name,
                month: String(settlement.settlement_month),
                amount: payableAmount,
                receiverUserIds,
              });
              if (!cardResult.success) {
                console.warn('[team-settlement-workflow] 互动卡片发送失败：', cardResult.message);
              }
            }
          } catch (cardError) {
            console.error('[team-settlement-workflow] 发送互动卡片异常:', cardError);
          }
        }
      } else if (action === 'approve' || action === 'reject' || action === 'unapprove') {
        // 审批结果 → 通知提交人（预算员）
        const creatorId = Number(settlement.created_by);
        const actionLabel = action === 'approve' ? '已通过' : action === 'reject' ? '被驳回' : '被反审核退回';
        await pushBusinessNotification({
          type: action === 'approve' ? 'team_settlement_approved' : action === 'reject' ? 'team_settlement_rejected' : 'team_settlement_unapproved',
          title: `班组结算${actionLabel}：${settlement.settlement_no || `#${settlementId}`}`,
          content: action === 'approve'
            ? `${settlement.settlement_month} 班组结算单已审批通过并计入成本。`
            : action === 'reject'
              ? `${settlement.settlement_month} 班组结算单被驳回：${reason}`
              : `${settlement.settlement_month} 班组结算单已被老板反审核，退回待审批状态，请核对后重新提交。`,
          severity: action === 'approve' ? 'info' : 'warning',
          projectId,
          relatedId: settlementId,
          relatedType: 'team_settlement',
          recipientUserIds: creatorId > 0 ? [creatorId] : undefined,
          metadata: {
            消息分类: '班组结算审批',
            业务摘要: action === 'approve' ? '审批通过' : `驳回：${reason}`,
            建议动作: action === 'approve' ? '查看结算单' : '修改后重新提交',
            处理入口: `/team-management/settlements/${settlementId}`,
          },
        });
      }
    } catch (notifyError) {
      console.error('[team-settlement-workflow] 审批通知发送失败:', notifyError);
    }

    await auditLog({
      operationType: 'update',
      resourceType: 'team_settlement',
      resourceId: settlementId,
      details: {
        action,
        from_status: currentStatus,
        to_status: patch.status,
        reason: reason || undefined,
        settlement_no: settlement.settlement_no,
        settlement_month: settlement.settlement_month,
        generated_salary: salaryResult || undefined,
        revoked_salary_count: revokedSalaryCount || undefined,
      },
      request,
    });

    return apiSuccess({
      settlement_id: settlementId,
      status: patch.status,
      generated_salary: salaryResult,
      revoked_salary_count: revokedSalaryCount,
    });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '班组结算审批操作失败'));
  }
}
