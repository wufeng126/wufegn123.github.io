import { NextRequest } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { auditLog, insertWithSequenceFix } from '@/lib/audit-log';
import { requireApiWritePermission, requireAuth } from '@/lib/api-auth';
import { apiBadRequest, apiForbidden, apiServerError, apiSuccess, getErrorMessage } from '@/lib/api-utils';
import { getAccessibleProjectIds } from '@/lib/api-project-access';
import { getProjectActiveWorkers } from '@/lib/project-workers';
import { getSettlementPeriod } from '@/lib/settlement-period';

type TeamSettlementItemInput = {
  content?: string;
  unit?: string;
  quantity?: number | string;
  unit_price?: number | string;
};

type TeamSettlementSplitInput = {
  worker_id?: number | string;
  unit_price?: number | string;
};

type LogRow = {
  id: number;
  log_date?: string | null;
};

type AttendanceRow = {
  log_id: number;
  worker_id: number;
  work_hours?: number | string | null;
};

function parseId(value: unknown) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function toNumber(value: unknown) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function isMissingTableError(error: { message?: string; code?: string } | null) {
  const message = (error?.message || '').toLowerCase();
  return (
    error?.code === '42P01' ||
    error?.code === 'PGRST205' ||
    message.includes('does not exist') ||
    message.includes('relation') ||
    message.includes('could not find') ||
    message.includes('schema cache')
  );
}

async function assertProjectAccess(supabase: ReturnType<typeof getSupabaseClient>, user: Parameters<typeof getAccessibleProjectIds>[1], projectId: number) {
  const accessibleProjectIds = await getAccessibleProjectIds(supabase, user);
  if (Array.isArray(accessibleProjectIds) && !accessibleProjectIds.includes(projectId)) {
    return false;
  }
  return true;
}

function normalizeItems(items: unknown): Array<TeamSettlementItemInput & { amount: number }> {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => {
      const row = item as TeamSettlementItemInput;
      const content = String(row.content || '').trim();
      const unit = String(row.unit || '').trim();
      const quantity = toNumber(row.quantity);
      const unitPrice = toNumber(row.unit_price);
      return {
        content,
        unit,
        quantity,
        unit_price: unitPrice,
        amount: round2(quantity * unitPrice),
      };
    })
    .filter((item) => item.content && item.quantity > 0);
}

function normalizeSplits(splits: unknown): TeamSettlementSplitInput[] {
  if (!Array.isArray(splits)) return [];
  const seen = new Set<number>();
  const result: TeamSettlementSplitInput[] = [];
  splits.forEach((split) => {
    const row = split as TeamSettlementSplitInput;
    const workerId = parseId(row.worker_id);
    if (!workerId || seen.has(workerId)) return;
    seen.add(workerId);
    result.push({
      worker_id: workerId,
      unit_price: toNumber(row.unit_price),
    });
  });
  return result;
}

async function loadAttendanceTotals(
  supabase: ReturnType<typeof getSupabaseClient>,
  projectId: number,
  start: string,
  end: string,
  workerIds?: number[],
) {
  let logQuery = supabase
    .from('construction_logs')
    .select('id,log_date')
    .eq('project_id', projectId)
    .gte('log_date', start)
    .lte('log_date', end);

  const { data: logs, error: logError } = await logQuery;
  if (logError) throw new Error(logError.message);

  const logIds = ((logs || []) as LogRow[]).map((log) => Number(log.id)).filter(Boolean);
  if (logIds.length === 0) return new Map<number, number>();

  let attendanceQuery = supabase
    .from('construction_log_attendance')
    .select('log_id,worker_id,work_hours')
    .in('log_id', logIds);
  if (workerIds && workerIds.length > 0) attendanceQuery = attendanceQuery.in('worker_id', workerIds);

  const { data, error } = await attendanceQuery;
  if (error) throw new Error(error.message);

  const totals = new Map<number, number>();
  ((data || []) as AttendanceRow[]).forEach((row) => {
    const workerId = Number(row.worker_id);
    if (!workerId) return;
    totals.set(workerId, round2((totals.get(workerId) || 0) + toNumber(row.work_hours)));
  });
  return totals;
}

async function loadProjectNames(supabase: ReturnType<typeof getSupabaseClient>, projectIds: number[]) {
  if (projectIds.length === 0) return new Map<number, string>();
  const { data } = await supabase
    .from('projects')
    .select('id,name')
    .in('id', Array.from(new Set(projectIds)));
  return new Map((data || []).map((project) => [Number(project.id), String(project.name || '')]));
}

async function loadTeamNames(supabase: ReturnType<typeof getSupabaseClient>, teamIds: number[]) {
  if (teamIds.length === 0) return new Map<number, string>();
  const { data } = await supabase
    .from('team_groups')
    .select('id,name,work_type')
    .in('id', Array.from(new Set(teamIds)));
  return new Map((data || []).map((team) => [Number(team.id), `${team.name || ''}${team.work_type ? ` / ${team.work_type}` : ''}`]));
}

async function loadItemTotals(supabase: ReturnType<typeof getSupabaseClient>, projectId?: number | null, teamId?: number | null) {
  let query = supabase
    .from('team_settlement_items')
    .select('project_id,team_id,content,unit,quantity,amount');
  if (projectId) query = query.eq('project_id', projectId);
  if (teamId) query = query.eq('team_id', teamId);

  const { data, error } = await query;
  if (error) {
    if (isMissingTableError(error)) return [];
    throw new Error(error.message);
  }

  const map = new Map<string, { project_id: number; team_id: number | null; content: string; unit: string; quantity: number; amount: number }>();
  (data || []).forEach((row) => {
    const key = `${row.project_id}:${row.team_id || ''}:${row.content || ''}:${row.unit || ''}`;
    const current = map.get(key) || {
      project_id: Number(row.project_id),
      team_id: row.team_id ? Number(row.team_id) : null,
      content: String(row.content || ''),
      unit: String(row.unit || ''),
      quantity: 0,
      amount: 0,
    };
    current.quantity = round2(current.quantity + toNumber(row.quantity));
    current.amount = round2(current.amount + toNumber(row.amount));
    map.set(key, current);
  });

  return Array.from(map.values());
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const supabase = getSupabaseClient();
    const mode = request.nextUrl.searchParams.get('mode');
    const projectId = parseId(request.nextUrl.searchParams.get('projectId'));
    const teamId = parseId(request.nextUrl.searchParams.get('teamId'));
    const month = request.nextUrl.searchParams.get('month');

    if (mode === 'attendance') {
      if (!projectId) return apiBadRequest('请选择项目');

      const hasAccess = await assertProjectAccess(supabase, auth.user, projectId);
      if (!hasAccess) return apiForbidden('无权查看该项目出勤人员');

      const { month: normalizedMonth, start, end } = getSettlementPeriod(month || '');
      const workers = await getProjectActiveWorkers(supabase, projectId, {
        fields: 'id,name,id_card,work_type,team_name,status,project_id,entry_date,phone',
      });
      const workerIds = workers.map((worker) => Number(worker.id)).filter(Boolean);
      const attendanceTotals = await loadAttendanceTotals(supabase, projectId, start, end, workerIds);
      const workTypes = Array.from(new Set(
        workers
          .map((worker) => String(worker.work_type || '').trim())
          .filter(Boolean),
      )).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));

      return apiSuccess({
        month: normalizedMonth,
        period_start: start,
        period_end: end,
        workers: workers.map((worker) => ({
          id: worker.id,
          name: worker.name,
          id_card: worker.id_card || '',
          work_type: worker.work_type || '',
          team_name: worker.team_name || '',
          status: worker.status || 'in_service',
          project_id: worker.project_id,
          attendance_hours: round2(attendanceTotals.get(Number(worker.id)) || 0),
        })),
        work_types: workTypes,
      });
    }

    if (projectId) {
      const hasAccess = await assertProjectAccess(supabase, auth.user, projectId);
      if (!hasAccess) return apiForbidden('无权查看该项目班组结算');
    }

    const accessibleProjectIds = await getAccessibleProjectIds(supabase, auth.user);
    if (!projectId && Array.isArray(accessibleProjectIds) && accessibleProjectIds.length === 0) {
      return apiSuccess({
        settlements: [],
        summary: { count: 0, quantity_amount: 0, split_amount: 0, total_hours: 0 },
        item_totals: [],
      });
    }

    let query = supabase
      .from('team_settlements')
      .select('*')
      .order('created_at', { ascending: false });
    if (projectId) query = query.eq('project_id', projectId);
    else if (Array.isArray(accessibleProjectIds)) query = query.in('project_id', accessibleProjectIds);
    if (teamId) query = query.eq('team_id', teamId);
    if (month) query = query.eq('settlement_month', month);

    const { data: settlements, error } = await query;
    if (error) {
      if (isMissingTableError(error)) {
        return apiSuccess({
          settlements: [],
          summary: { count: 0, quantity_amount: 0, split_amount: 0, total_hours: 0 },
          item_totals: [],
          needs_migration: true,
        });
      }
      throw new Error(error.message);
    }

    const settlementIds = (settlements || []).map((row) => Number(row.id)).filter(Boolean);
    const [{ data: items }, { data: splits }] = settlementIds.length > 0
      ? await Promise.all([
          supabase.from('team_settlement_items').select('*').in('settlement_id', settlementIds),
          supabase.from('team_settlement_splits').select('*').in('settlement_id', settlementIds),
        ])
      : [{ data: [] }, { data: [] }];

    const itemMap = new Map<number, Array<Record<string, unknown>>>();
    const splitMap = new Map<number, Array<Record<string, unknown>>>();
    (items || []).forEach((item) => {
      const list = itemMap.get(Number(item.settlement_id)) || [];
      list.push(item);
      itemMap.set(Number(item.settlement_id), list);
    });
    (splits || []).forEach((split) => {
      const list = splitMap.get(Number(split.settlement_id)) || [];
      list.push(split);
      splitMap.set(Number(split.settlement_id), list);
    });

    const projectNameMap = await loadProjectNames(supabase, (settlements || []).map((row) => Number(row.project_id)).filter(Boolean));
    const teamNameMap = await loadTeamNames(supabase, (settlements || []).map((row) => Number(row.team_id)).filter(Boolean));
    const itemTotals = await loadItemTotals(supabase, projectId, teamId);

    const rows = (settlements || []).map((settlement) => {
      const settlementItems = itemMap.get(Number(settlement.id)) || [];
      const settlementSplits = splitMap.get(Number(settlement.id)) || [];
      const quantityAmount = settlementItems.reduce<number>((sum, item) => sum + toNumber(item.amount), 0);
      const splitAmount = settlementSplits.reduce<number>((sum, split) => sum + toNumber(split.amount), 0);
      const totalHours = settlementSplits.reduce<number>((sum, split) => sum + toNumber(split.work_hours), 0);
      return {
        ...settlement,
        project_name: projectNameMap.get(Number(settlement.project_id)) || '',
        team_name: settlement.team_id ? teamNameMap.get(Number(settlement.team_id)) || '' : '',
        items: settlementItems,
        splits: settlementSplits,
        quantity_amount: round2(quantityAmount),
        split_amount: round2(splitAmount),
        total_hours: round2(totalHours),
      };
    });

    return apiSuccess({
      settlements: rows,
      summary: {
        count: rows.length,
        quantity_amount: round2(rows.reduce((sum, row) => sum + row.quantity_amount, 0)),
        split_amount: round2(rows.reduce((sum, row) => sum + row.split_amount, 0)),
        total_hours: round2(rows.reduce((sum, row) => sum + row.total_hours, 0)),
      },
      item_totals: itemTotals,
    });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '班组结算加载失败'));
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const projectId = parseId(body?.project_id);
    const teamId = parseId(body?.team_id);
    const { month, start, end } = getSettlementPeriod(body?.settlement_month);
    const items = normalizeItems(body?.items);
    const splits = normalizeSplits(body?.splits);

    if (!projectId) return apiBadRequest('请选择所属项目');
    if (!teamId) return apiBadRequest('请选择班组');
    if (items.length === 0) return apiBadRequest('请至少录入一条结算工程量');

    const supabase = getSupabaseClient();
    const hasAccess = await assertProjectAccess(supabase, auth.user, projectId);
    if (!hasAccess) return apiForbidden('无权维护该项目班组结算');

    const { data: team, error: teamError } = await supabase
      .from('team_groups')
      .select('id,project_id,name')
      .eq('id', teamId)
      .maybeSingle();
    if (teamError) throw new Error(teamError.message);
    if (!team || Number(team.project_id) !== projectId) return apiBadRequest('班组不属于当前项目');

    const splitWorkerIds = splits.map((split) => Number(split.worker_id)).filter(Boolean);
    const activeWorkers = splitWorkerIds.length > 0
      ? await getProjectActiveWorkers(supabase, projectId, {
          workerIds: splitWorkerIds,
          fields: 'id,name,work_type,team_name,status,project_id',
        })
      : [];
    if (activeWorkers.length !== splitWorkerIds.length) return apiBadRequest('分账人员必须是当前项目在场工人');

    const workerMap = new Map(activeWorkers.map((worker) => [Number(worker.id), worker]));
    const attendanceTotals = await loadAttendanceTotals(supabase, projectId, start, end, splitWorkerIds);

    const now = new Date();
    const settlementNo = `BZJS-${month.replace('-', '')}-${String(now.getTime()).slice(-6)}`;

    const { data: settlementRows, error: settlementError } = await insertWithSequenceFix('team_settlements', {
      project_id: projectId,
      team_id: teamId,
      settlement_no: settlementNo,
      settlement_month: month,
      period_start: start,
      period_end: end,
      status: body?.status || 'confirmed',
      remark: body?.remark || null,
      created_by: auth.user.id,
      created_by_name: auth.user.name || auth.user.username,
      updated_at: now.toISOString(),
    }, supabase);
    if (settlementError) throw new Error(settlementError.message);

    const settlement = Array.isArray(settlementRows) ? settlementRows[0] : settlementRows;
    const settlementId = Number(settlement?.id);

    const itemRows = items.map((item) => ({
      settlement_id: settlementId,
      project_id: projectId,
      team_id: teamId,
      content: item.content,
      unit: item.unit || null,
      quantity: item.quantity,
      unit_price: item.unit_price,
      amount: item.amount,
    }));

    const splitRows = splits.map((split) => {
      const workerId = Number(split.worker_id);
      const worker = workerMap.get(workerId);
      const workHours = round2(attendanceTotals.get(workerId) || 0);
      const unitPrice = toNumber(split.unit_price);
      return {
        settlement_id: settlementId,
        project_id: projectId,
        team_id: teamId,
        worker_id: workerId,
        worker_name: worker?.name || null,
        work_type: worker?.work_type || null,
        team_name: worker?.team_name || null,
        work_hours: workHours,
        unit_price: unitPrice,
        amount: round2(workHours * unitPrice),
      };
    });

    const [{ error: itemError }, { error: splitError }] = await Promise.all([
      supabase.from('team_settlement_items').insert(itemRows),
      splitRows.length > 0
        ? supabase.from('team_settlement_splits').insert(splitRows)
        : Promise.resolve({ error: null }),
    ]);
    if (itemError) throw new Error(itemError.message);
    if (splitError) throw new Error(splitError.message);

    await auditLog({
      operationType: 'create',
      resourceType: 'team_settlement',
      resourceId: settlementId,
      details: {
        project_id: projectId,
        team_id: teamId,
        settlement_month: month,
        item_amount: round2(itemRows.reduce((sum, item) => sum + toNumber(item.amount), 0)),
        split_amount: round2(splitRows.reduce((sum, split) => sum + toNumber(split.amount), 0)),
      },
      request,
    });

    return apiSuccess({
      settlement: {
        ...settlement,
        items: itemRows,
        splits: splitRows,
        quantity_amount: round2(itemRows.reduce((sum, item) => sum + toNumber(item.amount), 0)),
        split_amount: round2(splitRows.reduce((sum, split) => sum + toNumber(split.amount), 0)),
      },
    });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '班组结算保存失败'));
  }
}
