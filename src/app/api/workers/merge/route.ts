import { NextRequest } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireApiWritePermission } from '@/lib/api-auth';
import { apiBadRequest, apiNotFound, apiServerError, apiSuccess, getErrorMessage } from '@/lib/api-utils';
import { auditLog } from '@/lib/audit-log';
import { assertProjectAccess } from '@/lib/api-project-scope';

/**
 * POST /api/workers/merge
 * body: { keepId: number, mergeIds: number[] }
 *
 * 合并重复工人：
 *  1) 已发放工资（salary_payments）、考勤、班组分账等引用改挂到保留人员
 *  2) 月度工资（worker_salaries）：同项目同月份则金额合并到保留人员那条，避免唯一键冲突
 *  3) 保留人员缺身份证/手机号时用被合并人员的补齐
 *  4) 删除被合并人员
 */

const REFERENCE_TABLES: Array<{ table: string; column: string }> = [
  { table: 'salary_payments', column: 'worker_id' },
  { table: 'worker_assignments', column: 'worker_id' },
  { table: 'construction_log_attendance', column: 'worker_id' },
  { table: 'living_allowance_records', column: 'worker_id' },
  { table: 'living_allowance_receipt_items', column: 'worker_id' },
  { table: 'team_settlement_splits', column: 'worker_id' },
  { table: 'site_manager_worker_scopes', column: 'worker_id' },
  { table: 'wps_worker_sync_logs', column: 'worker_id' },
];

const SUM_FIELDS = ['work_hours', 'contract_work_pay', 'gross_pay', 'income_tax', 'advance_pay', 'labor_insurance', 'fine', 'net_pay'];

export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const body = await request.json().catch(() => ({}));
    const keepId = Number(body?.keepId);
    const mergeIds = Array.isArray(body?.mergeIds)
      ? Array.from(new Set(body.mergeIds.map((id: unknown) => Number(id)).filter((id: number) => Number.isInteger(id) && id > 0 && id !== keepId)))
      : [];

    if (!Number.isInteger(keepId) || keepId <= 0) return apiBadRequest('请选择要保留的人员');
    if (mergeIds.length === 0) return apiBadRequest('请选择要合并的人员');

    const client = getSupabaseClient();

    const { data: keepWorker } = await client
      .from('workers')
      .select('id, name, phone, id_card, person_id, project_id, work_type')
      .eq('id', keepId)
      .maybeSingle();
    if (!keepWorker) return apiNotFound('保留的人员不存在');

    const { data: mergeWorkers } = await client
      .from('workers')
      .select('id, name, phone, id_card, person_id, project_id, work_type')
      .in('id', mergeIds);
    if (!mergeWorkers || mergeWorkers.length === 0) return apiNotFound('要合并的人员不存在');

    // 项目范围校验：不能合并自己无权限项目的人员
    const projectIds = Array.from(new Set(
      [keepWorker, ...mergeWorkers]
        .map((worker) => Number((worker as { project_id?: unknown }).project_id) || 0)
        .filter(Boolean),
    ));
    for (const projectId of projectIds) {
      const access = await assertProjectAccess(client, auth.user, projectId);
      if (!access.ok) return access.response;
    }

    let movedPayments = 0;
    let movedSalaries = 0;
    let mergedSalaries = 0;
    const failures: string[] = [];

    // 1) 其他引用表直接改挂
    for (const ref of REFERENCE_TABLES) {
      try {
        const { error } = await client.from(ref.table).update({ worker_id: keepId }).in('worker_id', mergeIds);
        if (error) failures.push(`${ref.table}: ${error.message}`);
      } catch (error) {
        failures.push(`${ref.table}: ${error instanceof Error ? error.message : '未知错误'}`);
      }
    }

    // 2) 月度工资：同项目同月份合并金额，否则改挂
    for (const sourceId of mergeIds) {
      const { data: sourceSalaries } = await client
        .from('worker_salaries')
        .select('*')
        .eq('worker_id', sourceId);

      for (const salary of sourceSalaries || []) {
        const { data: existing } = await client
          .from('worker_salaries')
          .select('*')
          .eq('worker_id', keepId)
          .eq('project_id', Number(salary.project_id))
          .eq('year_month', String(salary.year_month))
          .maybeSingle();

        if (existing) {
          const merged: Record<string, number> = {};
          SUM_FIELDS.forEach((field) => {
            const current = Number(existing[field] ?? 0) || 0;
            const add = Number(salary[field] ?? 0) || 0;
            merged[field] = Number((current + add).toFixed(2));
          });
          const { error: updateError } = await client
            .from('worker_salaries')
            .update(merged)
            .eq('id', Number(existing.id));
          if (updateError) {
            failures.push(`合并工资行失败: ${updateError.message}`);
          } else {
            await client.from('worker_salaries').delete().eq('id', Number(salary.id));
            mergedSalaries += 1;
          }
        } else {
          const { error: moveError } = await client
            .from('worker_salaries')
            .update({ worker_id: keepId })
            .eq('id', Number(salary.id));
          if (moveError) failures.push(`迁移工资行失败: ${moveError.message}`);
          else movedSalaries += 1;
        }
      }
    }

    const { count: paymentCount } = await client
      .from('salary_payments')
      .select('id', { count: 'exact', head: true })
      .eq('worker_id', keepId);
    movedPayments = Number(paymentCount || 0);

    // 3) 补齐保留人员的身份证/手机号/人员主档
    const patch: Record<string, unknown> = {};
    const keepCard = String(keepWorker.id_card || '').trim();
    const keepPhone = String(keepWorker.phone || '').trim();
    const sourceWithCard = mergeWorkers.find((worker) => String(worker.id_card || '').trim().length >= 15);
    const sourceWithPhone = mergeWorkers.find((worker) => String(worker.phone || '').trim().length >= 7);
    if (!keepCard && sourceWithCard?.id_card) patch.id_card = sourceWithCard.id_card;
    if (!keepPhone && sourceWithPhone?.phone) patch.phone = sourceWithPhone.phone;
    if (!keepWorker.person_id) {
      const sourcePerson = mergeWorkers.find((worker) => worker.person_id);
      if (sourcePerson?.person_id) patch.person_id = sourcePerson.person_id;
    }
    if (Object.keys(patch).length > 0) {
      await client.from('workers').update(patch).eq('id', keepId);
    }

    // 4) 删除被合并人员
    const { error: deleteError } = await client.from('workers').delete().in('id', mergeIds);
    if (deleteError) failures.push(`删除重复人员失败: ${deleteError.message}`);

    await auditLog({
      operationType: 'update',
      resourceType: 'worker',
      resourceId: keepId,
      details: {
        action: 'merge_duplicates',
        keepId,
        mergeIds,
        movedSalaries,
        mergedSalaries,
        paymentsNow: movedPayments,
        failures,
      },
      request,
    });

    return apiSuccess({
      keepId,
      mergedCount: mergeIds.length,
      movedSalaries,
      mergedSalaries,
      paymentsNow: movedPayments,
      failures,
    });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '合并人员失败'));
  }
}
