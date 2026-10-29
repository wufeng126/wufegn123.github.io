import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { auditLog } from '@/lib/audit-log';
import { buildDingTalkCardUpdate, verifyDingTalkCardCallbackSignature } from '@/lib/dingtalk-card';
import { generateWorkerSalariesFromSplits } from '@/lib/team-settlement-salary';
import { invalidateAggregationCache } from '@/lib/data-aggregation';

/**
 * 钉钉互动卡片回调（钉钉服务器调用，无登录态，依靠 api_secret 验签）
 *
 * 回调体：{ corpId, outTrackId, userId, content: '{"cardPrivateData":{"actionIds":["approve"]}}' }
 * - outTrackId = team_settlement_{结算单ID}（发送卡片时指定）
 * - actionIds  = 按钮 Action ID（通过=approve / 驳回=reject）
 *
 * 处理：approve → 结算单 pending → reviewed（计入成本 + 生成分账应发工资）
 *      reject  → 结算单 pending → rejected（退回预算员修改）
 * 返回：更新后的卡片数据（同步刷新点击人看到的状态）
 */
export async function POST(request: NextRequest) {
  try {
    // 验签：x-ddpaas-signature = Base64(HmacSHA256(api_secret, timestamp))
    if (!verifyDingTalkCardCallbackSignature(request.headers)) {
      return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const outTrackId = String(body?.outTrackId || '');
    const dingUserId = String(body?.userId || '');

    let actionIds: string[] = [];
    try {
      const content = typeof body?.content === 'string' ? JSON.parse(body.content) : body?.content;
      actionIds = content?.cardPrivateData?.actionIds || [];
    } catch {
      // content 解析失败按未知操作处理
    }
    const action = String(actionIds[0] || '');

    // 卡片 outTrackId → 结算单
    const match = /^team_settlement_(\d+)$/.exec(outTrackId);
    if (!match) {
      return NextResponse.json(buildDingTalkCardUpdate(outTrackId, '卡片已失效'));
    }
    const settlementId = Number(match[1]);

    const supabase = getSupabaseClient();

    // 操作人：钉钉 userId → 系统用户（用于审计与卡片显示）
    const { data: operatorUser } = await supabase
      .from('users')
      .select('id, name, username')
      .eq('dingtalk_user_id', dingUserId)
      .maybeSingle();
    const operatorName =
      operatorUser?.name || operatorUser?.username || `钉钉用户(${dingUserId || '未知'})`;

    const { data: settlement, error: settlementError } = await supabase
      .from('team_settlements')
      .select('id, project_id, team_id, settlement_month, status, settlement_no')
      .eq('id', settlementId)
      .maybeSingle();
    if (settlementError) throw new Error(settlementError.message);
    if (!settlement) {
      return NextResponse.json(buildDingTalkCardUpdate(outTrackId, '结算单不存在'));
    }

    const currentStatus = String(settlement.status || 'draft');
    if (currentStatus !== 'pending') {
      return NextResponse.json(buildDingTalkCardUpdate(outTrackId, '该结算单已处理'));
    }

    const now = new Date().toISOString();

    if (action === 'approve') {
      const { error: updateError } = await supabase
        .from('team_settlements')
        .update({
          status: 'reviewed',
          reviewed_at: now,
          reviewed_by: operatorName,
          updated_at: now,
        })
        .eq('id', settlementId);
      if (updateError) throw new Error(updateError.message);

      // 审批通过 → 生成分账应发工资（失败记录日志，不阻断审批结果）
      const { data: splits } = await supabase
        .from('team_settlement_splits')
        .select('worker_id, work_hours, hourly_rate, amount')
        .eq('settlement_id', settlementId);
      if (splits && splits.length > 0) {
        try {
          await generateWorkerSalariesFromSplits({
            settlementId,
            settlementMonth: String(settlement.settlement_month),
            projectId: Number(settlement.project_id),
            teamId: Number(settlement.team_id) || 0,
            splits,
          });
        } catch (genError) {
          console.error('[dingtalk-card-callback] 生成分账应发工资失败:', genError);
        }
      }

      try {
        invalidateAggregationCache();
      } catch {
        // 缓存失效非致命
      }

      await auditLog({
        operationType: 'update',
        resourceType: 'team_settlement',
        resourceId: settlementId,
        details: {
          action: 'approve',
          source: 'dingtalk_card',
          operator: operatorName,
          dingtalk_user_id: dingUserId || undefined,
          from_status: currentStatus,
          to_status: 'reviewed',
          settlement_no: settlement.settlement_no,
        },
        request,
      });

      return NextResponse.json(buildDingTalkCardUpdate(outTrackId, `已通过（${operatorName}）`));
    }

    if (action === 'reject') {
      const reason = '钉钉卡片审批驳回';
      const { error: updateError } = await supabase
        .from('team_settlements')
        .update({
          status: 'rejected',
          reject_reason: reason,
          reviewed_at: now,
          reviewed_by: operatorName,
          updated_at: now,
        })
        .eq('id', settlementId);
      if (updateError) throw new Error(updateError.message);

      try {
        invalidateAggregationCache();
      } catch {
        // 缓存失效非致命
      }

      await auditLog({
        operationType: 'update',
        resourceType: 'team_settlement',
        resourceId: settlementId,
        details: {
          action: 'reject',
          source: 'dingtalk_card',
          operator: operatorName,
          dingtalk_user_id: dingUserId || undefined,
          from_status: currentStatus,
          to_status: 'rejected',
          reason,
          settlement_no: settlement.settlement_no,
        },
        request,
      });

      return NextResponse.json(buildDingTalkCardUpdate(outTrackId, `已驳回（${operatorName}）`));
    }

    return NextResponse.json(buildDingTalkCardUpdate(outTrackId, '未知操作'));
  } catch (error) {
    console.error('[dingtalk-card-callback] error:', error);
    return NextResponse.json({ error: '处理失败' }, { status: 500 });
  }
}
