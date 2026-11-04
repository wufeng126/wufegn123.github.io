import { NextRequest } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAuth } from '@/lib/api-auth';
import { apiServerError, apiSuccess, getErrorMessage } from '@/lib/api-utils';
import { getAccessibleProjectIds } from '@/lib/api-project-access';
import { fetchAllRows } from '@/lib/fetch-all-rows';

/**
 * GET /api/trade-cost?project_id=
 * 各项目「从入场以来」按工种累计的应发工资（生产工人；管理人员单列为“管理人员”）。
 * 数据源：worker_salaries（应发）+ workers.work_type（工种）
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const client = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const projectId = Number(searchParams.get('project_id')) || 0;
    const scope = await getAccessibleProjectIds(client, auth.user);

    if (projectId > 0 && scope !== null && !scope.includes(projectId)) {
      return apiSuccess({ projects: [], trades: [] });
    }

    const salaryRows = await fetchAllRows<{
      project_id?: unknown;
      worker_id?: unknown;
      gross_pay?: unknown;
      work_hours?: unknown;
      year_month?: unknown;
      person_category?: unknown;
    }>((from, to) => {
      let q = client
        .from('worker_salaries')
        .select('project_id, worker_id, gross_pay, work_hours, year_month, person_category')
        .order('id', { ascending: true })
        .range(from, to);
      if (projectId > 0) q = q.eq('project_id', projectId);
      else if (scope !== null) {
        if (scope.length === 0) return q.limit(0);
        q = q.in('project_id', scope);
      }
      return q;
    });

    const workerIds = Array.from(new Set(salaryRows.map((row) => Number(row.worker_id)).filter(Boolean)));
    const workerTypeMap = new Map<number, string>();
    if (workerIds.length > 0) {
      for (let i = 0; i < workerIds.length; i += 500) {
        const chunk = workerIds.slice(i, i + 500);
        const { data: workers } = await client.from('workers').select('id, work_type').in('id', chunk);
        (workers || []).forEach((worker: { id?: unknown; work_type?: unknown }) => {
          workerTypeMap.set(Number(worker.id), String(worker.work_type || '').trim() || '未填工种');
        });
      }
    }

    const projectIds = Array.from(new Set(salaryRows.map((row) => Number(row.project_id)).filter(Boolean)));
    const projectNameMap = new Map<number, string>();
    if (projectIds.length > 0) {
      const { data: projects } = await client.from('projects').select('id, name').in('id', projectIds);
      (projects || []).forEach((project: { id?: unknown; name?: unknown }) => {
        projectNameMap.set(Number(project.id), String(project.name || ''));
      });
    }

    const toNumber = (value: unknown) => {
      const n = Number(String(value ?? '').replace(/,/g, ''));
      return Number.isFinite(n) ? n : 0;
    };

    type TradeBucket = { gross: number; hours: number };
    const projectMap = new Map<number, { total: number; trades: Map<string, TradeBucket>; months: Set<string> }>();

    salaryRows.forEach((row) => {
      const pid = Number(row.project_id) || 0;
      if (!pid) return;
      const isManagement = String(row.person_category || 'production') === 'management';
      const trade = isManagement ? '管理人员' : (workerTypeMap.get(Number(row.worker_id)) || '未填工种');
      const gross = toNumber(row.gross_pay);
      const hours = toNumber(row.work_hours);

      const bucket = projectMap.get(pid) || { total: 0, trades: new Map<string, TradeBucket>(), months: new Set<string>() };
      bucket.total += gross;
      const tradeBucket = bucket.trades.get(trade) || { gross: 0, hours: 0 };
      tradeBucket.gross += gross;
      tradeBucket.hours += hours;
      bucket.trades.set(trade, tradeBucket);
      if (row.year_month) bucket.months.add(String(row.year_month).slice(0, 7));
      projectMap.set(pid, bucket);
    });

    const tradeTotals = new Map<string, number>();
    projectMap.forEach((bucket) => {
      bucket.trades.forEach((value, trade) => {
        tradeTotals.set(trade, (tradeTotals.get(trade) || 0) + value.gross);
      });
    });

    const projects = Array.from(projectMap.entries())
      .map(([pid, bucket]) => ({
        projectId: pid,
        projectName: projectNameMap.get(pid) || `项目#${pid}`,
        total: Number(bucket.total.toFixed(2)),
        months: bucket.months.size,
        trades: Array.from(bucket.trades.entries())
          .map(([trade, value]) => ({
            trade,
            gross: Number(value.gross.toFixed(2)),
            hours: Number(value.hours.toFixed(2)),
            ratio: bucket.total > 0 ? Math.round((value.gross / bucket.total) * 1000) / 10 : 0,
          }))
          .sort((a, b) => b.gross - a.gross),
      }))
      .sort((a, b) => b.total - a.total);

    return apiSuccess({
      projects,
      trades: Array.from(tradeTotals.entries())
        .map(([trade, gross]) => ({ trade, gross: Number(gross.toFixed(2)) }))
        .sort((a, b) => b.gross - a.gross)
        .map((item) => item.trade),
    });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '加载工种费用失败'));
  }
}
