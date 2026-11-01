import { NextRequest } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requirePermission } from '@/lib/api-auth';
import { apiBadRequest, apiServerError, apiSuccess, getErrorMessage } from '@/lib/api-utils';
import { auditLog } from '@/lib/audit-log';
import { fetchAllRows } from '@/lib/fetch-all-rows';

type FixAction = 'dedupe-salary' | 'relink-salary-project' | 'delete-empty-salary';

/**
 * POST /api/system/data-health/fix
 * 数据问题一键修复（只做"安全可判定"的修复，其余返回需人工处理）：
 * - dedupe-salary：同工人+同项目+同月重复工资，保留一条，删除没有任何发放记录的重复行
 * - relink-salary-project：工资的 project_id 为空/无效时，按工人当前项目回填
 * - delete-empty-salary：删除"应发=0 且实发=0 且无发放记录"的空工资行
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission(request, 'system:manage');
    if (!auth.ok) return auth.response;

    const body = await request.json().catch(() => ({}));
    const action = String(body.action || '') as FixAction;
    if (!['dedupe-salary', 'relink-salary-project', 'delete-empty-salary'].includes(action)) {
      return apiBadRequest('不支持的修复动作');
    }

    const client = getSupabaseClient();
    const salaries = await fetchAllRows<Record<string, unknown>>((from, to) =>
      client
        .from('worker_salaries')
        .select('id, worker_id, project_id, year_month, gross_pay, net_pay, payment_status, created_at')
        .order('id', { ascending: true })
        .range(from, to));

    const salaryIds = salaries.map((row) => Number(row.id)).filter(Boolean);
    const paidSalaryIds = new Set<number>();
    for (let i = 0; i < salaryIds.length; i += 200) {
      const chunk = salaryIds.slice(i, i + 200);
      const { data } = await client.from('salary_payments').select('salary_id').in('salary_id', chunk);
      (data || []).forEach((row: { salary_id?: unknown }) => paidSalaryIds.add(Number(row.salary_id)));
    }

    const report: Array<{ action: string; detail: string }> = [];
    let fixed = 0;
    let skipped = 0;

    if (action === 'dedupe-salary') {
      const groups = new Map<string, Array<Record<string, unknown>>>();
      salaries.forEach((row) => {
        const key = `${Number(row.worker_id)}|${Number(row.project_id)}|${String(row.year_month || '')}`;
        const list = groups.get(key) || [];
        list.push(row);
        groups.set(key, list);
      });

      for (const [key, rows] of groups) {
        if (rows.length <= 1) continue;
        const withPayments = rows.filter((row) => paidSalaryIds.has(Number(row.id)));
        if (withPayments.length > 1) {
          skipped += rows.length;
          report.push({ action: key, detail: `组内有 ${withPayments.length} 条已有发放记录，需人工核对，未自动处理` });
          continue;
        }
        // 保留规则：有发放记录的优先保留；否则保留应发金额最大的一条；再相同保留 id 最小
        const keeper = withPayments[0]
          || [...rows].sort((a, b) => (Number(b.gross_pay || 0) - Number(a.gross_pay || 0)) || (Number(a.id) - Number(b.id)))[0];
        const toDelete = rows.filter((row) => Number(row.id) !== Number(keeper.id));
        const deletable = toDelete.filter((row) => !paidSalaryIds.has(Number(row.id)));
        skipped += toDelete.length - deletable.length;
        if (deletable.length === 0) continue;
        const { error } = await client
          .from('worker_salaries')
          .delete()
          .in('id', deletable.map((row) => Number(row.id)));
        if (error) {
          skipped += deletable.length;
          report.push({ action: key, detail: `删除失败：${error.message}` });
        } else {
          fixed += deletable.length;
          report.push({ action: key, detail: `保留 #${keeper.id}，删除重复 ${deletable.length} 条` });
        }
      }
    }

    if (action === 'relink-salary-project') {
      const { data: projectRows } = await client.from('projects').select('id');
      const validProjects = new Set((projectRows || []).map((row: { id: unknown }) => Number(row.id)));
      const orphanRows = salaries.filter((row) => {
        const pid = Number(row.project_id) || 0;
        return !pid || !validProjects.has(pid);
      });
      const workerIds = Array.from(new Set(orphanRows.map((row) => Number(row.worker_id)).filter(Boolean)));
      const workerProjectMap = new Map<number, number>();
      for (let i = 0; i < workerIds.length; i += 200) {
        const chunk = workerIds.slice(i, i + 200);
        const { data } = await client.from('workers').select('id, project_id').in('id', chunk);
        (data || []).forEach((row: { id?: unknown; project_id?: unknown }) => {
          workerProjectMap.set(Number(row.id), Number(row.project_id) || 0);
        });
      }

      for (const row of orphanRows) {
        const workerId = Number(row.worker_id) || 0;
        const targetProject = workerProjectMap.get(workerId) || 0;
        if (!targetProject || !validProjects.has(targetProject)) {
          skipped += 1;
          report.push({ action: `salary#${row.id}`, detail: '工人本身没有有效项目，需人工指定项目' });
          continue;
        }
        const { error } = await client
          .from('worker_salaries')
          .update({ project_id: targetProject })
          .eq('id', Number(row.id));
        if (error) {
          skipped += 1;
          report.push({ action: `salary#${row.id}`, detail: `回填失败：${error.message}` });
        } else {
          fixed += 1;
        }
      }
    }

    if (action === 'delete-empty-salary') {
      const emptyRows = salaries.filter((row) => {
        const gross = Number(row.gross_pay || 0);
        const net = Number(row.net_pay || 0);
        return gross === 0 && net === 0 && !paidSalaryIds.has(Number(row.id));
      });
      if (emptyRows.length > 0) {
        const { error } = await client
          .from('worker_salaries')
          .delete()
          .in('id', emptyRows.map((row) => Number(row.id)));
        if (error) {
          skipped += emptyRows.length;
          report.push({ action: 'delete-empty-salary', detail: `删除失败：${error.message}` });
        } else {
          fixed += emptyRows.length;
          report.push({ action: 'delete-empty-salary', detail: `删除金额全为 0 且无发放的工资 ${emptyRows.length} 条` });
        }
      }
    }

    await auditLog({
      operationType: 'update',
      resourceType: 'data_health_fix',
      details: { action, fixed, skipped, report: report.slice(0, 50) },
      request,
    });

    return apiSuccess({ action, fixed, skipped, report: report.slice(0, 100) });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '数据修复失败'));
  }
}
