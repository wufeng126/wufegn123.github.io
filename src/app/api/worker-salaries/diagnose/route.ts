import { NextRequest } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAuth } from '@/lib/api-auth';
import { apiServerError, apiSuccess, getErrorMessage } from '@/lib/api-utils';
import { fetchAllRows } from '@/lib/fetch-all-rows';

/**
 * GET /api/worker-salaries/diagnose
 * 「工人成本看板 应付/实发 = 0」自查：返回当前账号的项目范围与工资数据统计。
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const client = getSupabaseClient();
    const user = auth.user;
    const userId = Number(user.id) || 0;

    const { data: userRow } = await client
      .from('users')
      .select('id, role, managed_projects')
      .eq('id', userId)
      .maybeSingle();

    const { data: roleRows } = await client
      .from('user_project_roles')
      .select('project_id, role_code')
      .eq('user_id', userId);

    const salaries = await fetchAllRows<{ project_id?: number | null; gross_pay?: unknown; net_pay?: unknown }>((from, to) =>
      client.from('worker_salaries').select('project_id, gross_pay, net_pay').range(from, to));

    const payments = await fetchAllRows<{ project_id?: number | null; payment_amount?: unknown }>((from, to) =>
      client.from('salary_payments').select('project_id, payment_amount').range(from, to));

    const toNumber = (value: unknown) => {
      const n = Number(String(value ?? '').replace(/,/g, ''));
      return Number.isFinite(n) ? n : 0;
    };

    const projects = await fetchAllRows<{ id: number; name: string }>((from, to) =>
      client.from('projects').select('id, name').range(from, to));
    const projectMap = new Map(projects.map((p) => [Number(p.id), String(p.name || '')]));

    const salaryByProject = new Map<number, { rows: number; gross: number; net: number }>();
    salaries.forEach((row) => {
      const pid = Number(row.project_id) || 0;
      const item = salaryByProject.get(pid) || { rows: 0, gross: 0, net: 0 };
      item.rows += 1;
      item.gross += toNumber(row.gross_pay);
      item.net += toNumber(row.net_pay);
      salaryByProject.set(pid, item);
    });

    const paymentByProject = new Map<number, { rows: number; amount: number }>();
    payments.forEach((row) => {
      const pid = Number(row.project_id) || 0;
      const item = paymentByProject.get(pid) || { rows: 0, amount: 0 };
      item.rows += 1;
      item.amount += toNumber(row.payment_amount);
      paymentByProject.set(pid, item);
    });

    const managed = (() => {
      try {
        const raw = (userRow as { managed_projects?: unknown } | null)?.managed_projects;
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return Array.isArray(parsed) ? parsed.map(Number).filter(Number.isInteger) : [];
      } catch {
        return [];
      }
    })();

    return apiSuccess({
      account: {
        id: userId,
        role: String((userRow as { role?: unknown } | null)?.role || user.role || ''),
        is_super_admin: Boolean(user.is_super_admin),
        managed_projects: managed,
        project_role_assignments: (roleRows || []).map((row) => ({
          project_id: Number((row as { project_id?: unknown }).project_id),
          role_code: String((row as { role_code?: unknown }).role_code || ''),
        })),
      },
      totals: {
        salary_rows: salaries.length,
        salary_gross: Number(salaries.reduce((sum, row) => sum + toNumber(row.gross_pay), 0).toFixed(2)),
        salary_net: Number(salaries.reduce((sum, row) => sum + toNumber(row.net_pay), 0).toFixed(2)),
        payment_rows: payments.length,
        payment_amount: Number(payments.reduce((sum, row) => sum + toNumber(row.payment_amount), 0).toFixed(2)),
      },
      byProject: Array.from(new Set([...salaryByProject.keys(), ...paymentByProject.keys()]))
        .map((pid) => ({
          projectId: pid,
          projectName: projectMap.get(pid) || (pid ? `项目#${pid}` : '未分配项目'),
          salaryRows: salaryByProject.get(pid)?.rows || 0,
          salaryGross: Number((salaryByProject.get(pid)?.gross || 0).toFixed(2)),
          salaryNet: Number((salaryByProject.get(pid)?.net || 0).toFixed(2)),
          paymentRows: paymentByProject.get(pid)?.rows || 0,
          paymentAmount: Number((paymentByProject.get(pid)?.amount || 0).toFixed(2)),
        }))
        .sort((a, b) => b.salaryGross - a.salaryGross)
        .slice(0, 20),
    });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '工资诊断失败'));
  }
}
