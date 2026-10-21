import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAuth } from '@/lib/api-auth';
import { getAccessibleProjectIds } from '@/lib/api-project-access';
import { apiBadRequest, apiServerError, apiSuccess, getErrorMessage } from '@/lib/api-utils';

/**
 * 班组工人工资台账
 *
 * 以班组分账生成的工人应发工资(worker_salaries, source=team_settlement)为基础，
 * 联查该应发对应的发放记录(salary_payments)，得到：
 *   应得(应发实发金额) / 已发(按付款主体: 公司支付/甲方代付拆分) / 未发
 *
 * 支持按班组(team_id)或按项目(project_id)过滤，默认返回全部班组。
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const searchParams = request.nextUrl.searchParams;
    const teamIdRaw = searchParams.get('team_id');
    const projectIdRaw = searchParams.get('project_id');
    const teamId = teamIdRaw ? Number(teamIdRaw) : null;
    const projectId = projectIdRaw ? Number(projectIdRaw) : null;

    if (teamId !== null && (!Number.isInteger(teamId) || teamId <= 0)) {
      return apiBadRequest('无效的班组ID');
    }
    if (projectId !== null && (!Number.isInteger(projectId) || projectId <= 0)) {
      return apiBadRequest('无效的项目ID');
    }

    const client = getSupabaseClient();
    const accessibleProjectIds = await getAccessibleProjectIds(client, auth.user);
    const isSuperAdmin = accessibleProjectIds === null;

    // 权限过滤：需可访问项目
    if (!isSuperAdmin) {
      if (projectId !== null && !accessibleProjectIds.includes(projectId)) {
        return NextResponse.json({ error: '无权查看该项目下班组工资台账' }, { status: 403 });
      }
      if (accessibleProjectIds.length === 0) {
        return apiSuccess({ teams: [] });
      }
    }

    // 1) 班组分账应发工资
    let salaryQuery = client
      .from('worker_salaries')
      .select('id, worker_id, project_id, team_id, year_month, gross_pay, net_pay, payment_status, workers(name)')
      .eq('source', 'team_settlement')
      .not('team_id', 'is', null);

    if (teamId !== null) salaryQuery = salaryQuery.eq('team_id', teamId);
    if (projectId !== null) salaryQuery = salaryQuery.eq('project_id', projectId);
    if (!isSuperAdmin) salaryQuery = salaryQuery.in('project_id', accessibleProjectIds);

    const { data: salaries, error: salaryError } = await salaryQuery;
    if (salaryError) throw new Error(`查询班组应发工资失败: ${salaryError.message}`);

    // 班组名称映射（worker_salaries 无 team_groups 外键，单独查询 name）
    const teamIds = [...new Set((salaries || []).map((s: any) => Number(s.team_id)).filter(Boolean))];
    const { data: teamRows } = await client.from('team_groups').select('id, name').in('id', teamIds);
    const teamNameMap = new Map<number, string>();
    (teamRows || []).forEach((t: any) => teamNameMap.set(Number(t.id), String(t.name || '')));

    const salaryMap = new Map<number, any>();
    (salaries || []).forEach((s: any) => salaryMap.set(Number(s.id), s));

    const salaryIds = (salaries || []).map((s: any) => Number(s.id)).filter(Boolean);

    // 2) 对应发放记录（按 salary_id 核销；也兼容该工人同一项目月份的无关联发放，避免漏算）
    const { data: linkedPayments, error: linkedError } =
      salaryIds.length > 0
        ? await client
            .from('salary_payments')
            .select('salary_id, worker_id, project_id, team_id, year_month, payment_amount, payer_type, payment_date')
            .in('salary_id', salaryIds)
        : { data: [], error: null };
    if (linkedError) throw new Error(`查询班组已发工资失败: ${linkedError.message}`);

    // 汇总: 按 工人 维度（同一工人可能多条分账应发，合并计算）
    const workerRows = new Map<number, {
      worker_id: number;
      worker_name: string;
      team_id: number | null;
      team_name: string | null;
      year_month: string;
      due: number; // 应得 = 分账应发 net_pay 合计
      paid: number; // 已发合计
      paid_company: number; // 公司支付
      paid_client: number; // 甲方代付
    }>();

    (salaries || []).forEach((s: any) => {
      const wid = Number(s.worker_id);
      const key = `${wid}`;
      const existing = workerRows.get(Number(key)) || {
        worker_id: wid,
        worker_name: (s.workers as any)?.name || '未知工人',
        team_id: s.team_id != null ? Number(s.team_id) : null,
        team_name: s.team_id != null ? (teamNameMap.get(Number(s.team_id)) || null) : null,
        year_month: s.year_month || '',
        due: 0,
        paid: 0,
        paid_company: 0,
        paid_client: 0,
      };
      existing.due = sum(existing.due, toNum(s.net_pay ?? s.gross_pay));
      workerRows.set(Number(key), existing);
    });

    (linkedPayments || []).forEach((p: any) => {
      const salary = salaryMap.get(Number(p.salary_id));
      if (!salary) return;
      const wid = Number(salary.worker_id);
      const row = workerRows.get(wid);
      if (!row) return;
      const amt = toNum(p.payment_amount);
      row.paid = sum(row.paid, amt);
      if (String(p.payer_type || '') === '甲方代付') {
        row.paid_client = sum(row.paid_client, amt);
      } else {
        row.paid_company = sum(row.paid_company, amt);
      }
    });

    const workers = [...workerRows.values()].map((w) => ({
      ...w,
      due: round2(w.due),
      paid: round2(w.paid),
      paid_company: round2(w.paid_company),
      paid_client: round2(w.paid_client),
      unpaid: round2(Math.max(0, w.due - w.paid)),
    }));

    // 按班组分组
    const teamAgg = new Map<string, any>();
    workers.forEach((w) => {
      const key = `${w.team_id}`;
      const group = teamAgg.get(key) || {
        team_id: w.team_id,
        team_name: w.team_name || '未分组',
        worker_count: 0,
        due_total: 0,
        paid_total: 0,
        unpaid_total: 0,
      };
      group.worker_count += 1;
      group.due_total = sum(group.due_total, w.due);
      group.paid_total = sum(group.paid_total, w.paid);
      group.unpaid_total = sum(group.unpaid_total, w.unpaid);
      teamAgg.set(key, group);
    });

    const teams = [...teamAgg.values()].map((t) => ({
      ...t,
      due_total: round2(t.due_total),
      paid_total: round2(t.paid_total),
      unpaid_total: round2(t.unpaid_total),
    }));

    return apiSuccess({ teams, workers });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '查询班组工资台账失败'));
  }
}

function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function sum(a: number, b: number): number {
  return (Math.round((a + b) * 100) / 100);
}

function round2(n: number): number {
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}