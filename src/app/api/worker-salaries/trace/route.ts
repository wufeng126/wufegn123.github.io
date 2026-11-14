import { NextRequest } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAuth } from '@/lib/api-auth';
import { apiBadRequest, apiServerError, apiSuccess, getErrorMessage } from '@/lib/api-utils';

/**
 * GET /api/worker-salaries/trace?name=李新武&month=2026-04
 * 追溯某条工资的来源：工资行（含 source/备注/创建时间）、班组结算分账、发放记录。
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;
    if (!auth.user.is_super_admin && !['admin', 'boss'].includes(String(auth.user.role || ''))) {
      return apiBadRequest('只有管理员可以使用该追溯');
    }

    const params = new URL(request.url).searchParams;
    const name = String(params.get('name') || '').trim();
    const month = String(params.get('month') || '').trim();
    if (!name) return apiBadRequest('请提供姓名，例如 ?name=李新武&month=2026-04');

    const client = getSupabaseClient();
    const { data: workers } = await client
      .from('workers')
      .select('id, name, project_id, person_id, status, projects(name)')
      .ilike('name', `%${name}%`)
      .limit(50);
    const workerIds = (workers || []).map((w: { id?: unknown }) => Number(w.id)).filter(Boolean);

    let salaryQuery = client
      .from('worker_salaries')
      .select('id, worker_id, project_id, year_month, work_hours, hourly_rate, contract_work_pay, gross_pay, income_tax, advance_pay, net_pay, remark, source, created_at, updated_at, person_category, projects(name)')
      .in('worker_id', workerIds.length ? workerIds : [-1])
      .order('year_month', { ascending: false })
      .limit(100);
    if (/^\d{4}-\d{2}$/.test(month)) salaryQuery = salaryQuery.ilike('year_month', `${month}%`);
    const { data: salaries, error: salaryError } = await salaryQuery;
    if (salaryError) throw new Error(salaryError.message);

    const salaryIds = (salaries || []).map((row: { id?: unknown }) => Number(row.id)).filter(Boolean);

    const { data: splits } = await client
      .from('team_settlement_splits')
      .select('id, settlement_id, worker_id, amount, created_at, team_settlements(settlement_no, settlement_month, status, created_at, team_id)')
      .in('worker_id', workerIds.length ? workerIds : [-1])
      .limit(100);

    const { data: payments } = await client
      .from('salary_payments')
      .select('id, salary_id, worker_id, project_id, year_month, payment_amount, payment_date, payer_type, created_at')
      .in('salary_id', salaryIds.length ? salaryIds : [-1])
      .limit(100);

    return apiSuccess({
      name,
      month: month || null,
      workers: workers || [],
      salaries: salaries || [],
      teamSettlementSplits: splits || [],
      payments: payments || [],
      notes: [
        '工资行 source=team_settlement 表示由班组结算分账自动生成；为空/其他一般是手工录入或导入。',
        '若 salaries 的 contract_work_pay 与某个 team_settlement_splits.amount 相同，且结算月份一致，基本可确认来自班组结算。',
      ],
    });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '追溯工资来源失败'));
  }
}
