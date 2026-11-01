import { NextRequest } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requirePermission } from '@/lib/api-auth';
import { apiServerError, apiSuccess, getErrorMessage } from '@/lib/api-utils';
import { fetchAllRows } from '@/lib/fetch-all-rows';

/**
 * GET /api/system/data-health/details?type=salary-dup|salary-orphan|salary-zero
 * 数据健康检查的明细下钻：把问题行取出来，供人工确认或一键修复。
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermission(request, 'system:manage');
    if (!auth.ok) return auth.response;

    const type = new URL(request.url).searchParams.get('type') || '';
    const client = getSupabaseClient();

    const salaries = await fetchAllRows<Record<string, unknown>>((from, to) =>
      client
        .from('worker_salaries')
        .select('id, worker_id, project_id, year_month, gross_pay, net_pay, payment_status, source, created_at')
        .order('id', { ascending: true })
        .range(from, to));

    const workerIds = Array.from(new Set(salaries.map((row) => Number(row.worker_id)).filter(Boolean)));
    const projectIds = Array.from(new Set(salaries.map((row) => Number(row.project_id)).filter(Boolean)));
    const workerNameMap = new Map<number, string>();
    if (workerIds.length > 0) {
      for (let i = 0; i < workerIds.length; i += 200) {
        const chunk = workerIds.slice(i, i + 200);
        const { data } = await client.from('workers').select('id, name, project_id').in('id', chunk);
        (data || []).forEach((row: { id?: unknown; name?: unknown }) => {
          workerNameMap.set(Number(row.id), String(row.name || ''));
        });
      }
    }
    const projectNameMap = new Map<number, string>();
    if (projectIds.length > 0) {
      const { data } = await client.from('projects').select('id, name').in('id', projectIds);
      (data || []).forEach((row: { id?: unknown; name?: unknown }) => {
        projectNameMap.set(Number(row.id), String(row.name || ''));
      });
    }
    const { data: allProjects } = await client.from('projects').select('id');
    const validProjectIds = new Set((allProjects || []).map((row: { id: unknown }) => Number(row.id)));

    if (type === 'salary-dup') {
      const groups = new Map<string, Array<Record<string, unknown>>>();
      salaries.forEach((row) => {
        const key = `${Number(row.worker_id)}|${Number(row.project_id)}|${String(row.year_month || '')}`;
        const list = groups.get(key) || [];
        list.push(row);
        groups.set(key, list);
      });
      const duplicates = Array.from(groups.entries())
        .filter(([, rows]) => rows.length > 1)
        .map(([key, rows]) => ({
          key,
          workerName: workerNameMap.get(Number(rows[0].worker_id)) || `工人#${rows[0].worker_id}`,
          projectName: projectNameMap.get(Number(rows[0].project_id)) || (rows[0].project_id ? `项目#${rows[0].project_id}` : '未分配项目'),
          yearMonth: String(rows[0].year_month || ''),
          rows: rows.map((row) => ({
            id: Number(row.id),
            grossPay: Number(row.gross_pay || 0),
            netPay: Number(row.net_pay || 0),
            paymentStatus: String(row.payment_status || ''),
            source: String(row.source || ''),
            createdAt: String(row.created_at || ''),
          })),
        }));
      return apiSuccess({ type, groups: duplicates, totalRows: duplicates.reduce((sum, g) => sum + g.rows.length, 0) });
    }

    if (type === 'salary-orphan') {
      const rows = salaries
        .filter((row) => {
          const pid = Number(row.project_id) || 0;
          return !pid || !validProjectIds.has(pid);
        })
        .map((row) => ({
          id: Number(row.id),
          workerName: workerNameMap.get(Number(row.worker_id)) || `工人#${row.worker_id}`,
          workerId: Number(row.worker_id),
          projectId: Number(row.project_id) || 0,
          yearMonth: String(row.year_month || ''),
          grossPay: Number(row.gross_pay || 0),
          netPay: Number(row.net_pay || 0),
          paymentStatus: String(row.payment_status || ''),
        }));
      return apiSuccess({ type, rows });
    }

    if (type === 'salary-zero') {
      const rows = salaries
        .filter((row) => Number(row.net_pay || 0) <= 0)
        .map((row) => ({
          id: Number(row.id),
          workerName: workerNameMap.get(Number(row.worker_id)) || `工人#${row.worker_id}`,
          projectName: projectNameMap.get(Number(row.project_id)) || (row.project_id ? `项目#${row.project_id}` : '未分配项目'),
          yearMonth: String(row.year_month || ''),
          grossPay: Number(row.gross_pay || 0),
          netPay: Number(row.net_pay || 0),
          paymentStatus: String(row.payment_status || ''),
        }));
      return apiSuccess({ type, rows });
    }

    return apiSuccess({ type, rows: [] });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '查询数据问题明细失败'));
  }
}
