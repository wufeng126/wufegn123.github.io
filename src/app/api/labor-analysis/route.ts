import { NextRequest } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAuth, requireApiWritePermission } from '@/lib/api-auth';
import { apiBadRequest, apiForbidden, apiServerError, apiSuccess, getErrorMessage } from '@/lib/api-utils';
import { getAccessibleProjectIds } from '@/lib/api-project-access';
import { fetchAllRows } from '@/lib/fetch-all-rows';
import { auditLog } from '@/lib/audit-log';

/**
 * 月度用工分析
 * GET  /api/labor-analysis?project_id=&month=   读取某项目某月的用工分析（含工资/考勤对账）
 * POST /api/labor-analysis                      保存或提交（items 全量覆盖）
 */

const CATEGORIES = [
  '文明施工', '装卸车', '清理搬运', '材料倒运', '辅助配合',
  '返工修补', '临时设施', '安全防护', '其他',
];

function normalizeMonth(value: unknown) {
  const text = String(value || '').trim();
  return /^\d{4}-\d{2}$/.test(text) ? text : null;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const client = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const projectId = Number(searchParams.get('project_id')) || 0;
    const month = normalizeMonth(searchParams.get('month'));
    const scope = await getAccessibleProjectIds(client, auth.user);

    // 列表模式：只给筛选条件（项目/月份），返回按项目+月份汇总的清单
    if (!projectId || !month) {
      const filterProject = Number(searchParams.get('filter_project_id')) || 0;
      const filterMonth = normalizeMonth(searchParams.get('filter_month'));

      let listQuery = client
        .from('monthly_labor_analyses')
        .select('id, project_id, year_month, total_hours, total_amount, status, submitted_by_name, submitted_at, confirmed_by_name, confirmed_at, updated_at')
        .order('year_month', { ascending: false })
        .order('id', { ascending: false });

      if (filterProject > 0) listQuery = listQuery.eq('project_id', filterProject);
      else if (scope !== null) {
        if (scope.length === 0) return apiSuccess({ list: [] });
        listQuery = listQuery.in('project_id', scope);
      }
      if (filterMonth) listQuery = listQuery.eq('year_month', filterMonth);

      const { data: rows, error } = await listQuery.limit(500);
      if (error) throw new Error(error.message);

      const projectIds = Array.from(new Set((rows || []).map((row: { project_id?: unknown }) => Number(row.project_id))));
      const projectMap = new Map<number, string>();
      if (projectIds.length > 0) {
        const { data: projects } = await client.from('projects').select('id, name').in('id', projectIds);
        (projects || []).forEach((project: { id?: unknown; name?: unknown }) => {
          projectMap.set(Number(project.id), String(project.name || ''));
        });
      }

      return apiSuccess({
        list: (rows || []).map((row: Record<string, unknown>) => ({
          ...row,
          project_name: projectMap.get(Number(row.project_id)) || `项目#${row.project_id}`,
        })),
      });
    }

    if (scope !== null && !scope.includes(projectId)) return apiForbidden('无权查看该项目');

    const { data: analysis } = await client
      .from('monthly_labor_analyses')
      .select('*')
      .eq('project_id', projectId)
      .eq('year_month', month)
      .maybeSingle();

    let items: Record<string, unknown>[] = [];
    if (analysis) {
      const { data: itemRows } = await client
        .from('monthly_labor_items')
        .select('*')
        .eq('analysis_id', Number(analysis.id))
        .order('sort_order', { ascending: true });
      items = (itemRows || []) as Record<string, unknown>[];
    }

    // 对账：当月工资表总工时与总金额
    const salaries = await fetchAllRows<{ work_hours?: unknown; gross_pay?: unknown; net_pay?: unknown }>((from, to) =>
      client
        .from('worker_salaries')
        .select('work_hours, gross_pay, net_pay')
        .eq('project_id', projectId)
        .ilike('year_month', `${month}%`)
        .range(from, to));

    const toNumber = (value: unknown) => {
      const n = Number(String(value ?? '').replace(/,/g, ''));
      return Number.isFinite(n) ? n : 0;
    };
    const salaryHours = salaries.reduce((sum, row) => sum + toNumber(row.work_hours), 0);
    const salaryGross = salaries.reduce((sum, row) => sum + toNumber(row.gross_pay), 0);

    // 按类别汇总
    const byCategory = new Map<string, { hours: number; amount: number }>();
    items.forEach((item) => {
      const key = String(item.category || '其他');
      const bucket = byCategory.get(key) || { hours: 0, amount: 0 };
      bucket.hours += toNumber(item.hours);
      bucket.amount += toNumber(item.amount);
      byCategory.set(key, bucket);
    });

    return apiSuccess({
      analysis: analysis || null,
      items,
      categories: CATEGORIES,
      reconciliation: {
        salaryHours: Number(salaryHours.toFixed(2)),
        salaryGross: Number(salaryGross.toFixed(2)),
        analysisHours: Number(items.reduce((sum, item) => sum + toNumber(item.hours), 0).toFixed(2)),
        analysisAmount: Number(items.reduce((sum, item) => sum + toNumber(item.amount), 0).toFixed(2)),
      },
      byCategory: Array.from(byCategory.entries()).map(([category, value]) => ({
        category,
        hours: Number(value.hours.toFixed(2)),
        amount: Number(value.amount.toFixed(2)),
      })).sort((a, b) => b.hours - a.hours),
    });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '读取用工分析失败'));
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const body = await request.json().catch(() => ({}));
    const projectId = Number(body?.project_id);
    const month = normalizeMonth(body?.year_month);
    const status = String(body?.status || 'draft');
    if (!Number.isInteger(projectId) || projectId <= 0) return apiBadRequest('请选择项目');
    if (!month) return apiBadRequest('请选择月份');
    if (!['draft', 'submitted'].includes(status)) return apiBadRequest('状态参数不正确');

    const client = getSupabaseClient();
    const scope = await getAccessibleProjectIds(client, auth.user);
    if (scope !== null && !scope.includes(projectId)) return apiForbidden('无权维护该项目');

    const rawItems = Array.isArray(body?.items) ? body.items : [];
    const items = rawItems
      .map((item: Record<string, unknown>, index: number) => {
        const hours = Number(String(item.hours ?? 0).replace(/,/g, '')) || 0;
        const rate = Number(String(item.hourly_rate ?? 0).replace(/,/g, '')) || 0;
        const amountRaw = Number(String(item.amount ?? '').replace(/,/g, ''));
        const amount = Number.isFinite(amountRaw) && amountRaw > 0 ? amountRaw : hours * rate;
        return {
          category: String(item.category || '其他').slice(0, 50),
          work_content: String(item.work_content || '').slice(0, 200) || null,
          worker_type: String(item.worker_type || '普工').slice(0, 30),
          hours,
          hourly_rate: rate,
          amount,
          remark: String(item.remark || '').slice(0, 200) || null,
          sort_order: index,
        };
      })
      .filter((item: { hours: number; amount: number; work_content: string | null }) => item.hours > 0 || item.amount > 0 || item.work_content);

    const totalHours = Number(items.reduce((sum: number, item: any) => sum + item.hours, 0).toFixed(2));
    const totalAmount = Number(items.reduce((sum: number, item: any) => sum + item.amount, 0).toFixed(2));

    const { data: existing } = await client
      .from('monthly_labor_analyses')
      .select('id, status')
      .eq('project_id', projectId)
      .eq('year_month', month)
      .maybeSingle();

    if (existing && String(existing.status) === 'confirmed') {
      return apiBadRequest('已确认的用工分析不能修改，如需调整请联系管理员');
    }

    const now = new Date().toISOString();
    const payload = {
      project_id: projectId,
      year_month: month,
      total_hours: totalHours,
      total_amount: totalAmount,
      status,
      remark: String(body?.remark || '').slice(0, 500) || null,
      updated_at: now,
      ...(status === 'submitted'
        ? { submitted_by: Number(auth.user.id), submitted_by_name: String(auth.user.name || auth.user.username || ''), submitted_at: now }
        : {}),
    };

    let analysisId: number;
    if (existing) {
      const { error } = await client.from('monthly_labor_analyses').update(payload).eq('id', Number(existing.id));
      if (error) throw new Error(error.message);
      analysisId = Number(existing.id);
      await client.from('monthly_labor_items').delete().eq('analysis_id', analysisId);
    } else {
      const { data: created, error } = await client.from('monthly_labor_analyses').insert(payload).select('id').single();
      if (error) throw new Error(error.message);
      analysisId = Number(created.id);
    }

    if (items.length > 0) {
      const rows = items.map((item: Record<string, unknown>) => ({ ...item, analysis_id: analysisId }));
      const { error } = await client.from('monthly_labor_items').insert(rows);
      if (error) throw new Error(error.message);
    }

    await auditLog({
      operationType: existing ? 'update' : 'create',
      resourceType: 'monthly_labor_analysis',
      resourceId: analysisId,
      details: { projectId, month, status, totalHours, totalAmount, itemCount: items.length },
      request,
    });

    return apiSuccess({ id: analysisId, status, totalHours, totalAmount });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '保存用工分析失败'));
  }
}
