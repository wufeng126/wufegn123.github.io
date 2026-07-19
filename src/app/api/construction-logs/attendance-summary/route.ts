import { NextRequest } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAuth } from '@/lib/api-auth';
import { apiForbidden, apiServerError, apiSuccess, getErrorMessage } from '@/lib/api-utils';
import { getConstructionLogAccessibleProjectIds } from '@/lib/public-log-project';
import { getSettlementPeriod } from '@/lib/settlement-period';

type LogRow = {
  id: number;
  project_id: number;
  log_date?: string | null;
};

type AttendanceRow = {
  log_id: number;
  project_id: number;
  worker_id: number;
  worker_name?: string | null;
  work_type?: string | null;
  team_name?: string | null;
  work_hours?: number | string | null;
};

type SummaryRow = {
  project_id: number;
  project_name: string;
  worker_id: number;
  worker_name: string;
  work_type: string;
  team_name: string;
  attendance_days: number;
  total_hours: number;
  last_date: string;
};

function getMonthRange(month: string) {
  return getSettlementPeriod(month);
}

function includesKeyword(row: SummaryRow, keyword: string) {
  if (!keyword) return true;
  const value = keyword.toLowerCase();
  return [
    row.project_name,
    row.worker_name,
    row.work_type,
    row.team_name,
  ].some(item => item.toLowerCase().includes(value));
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const supabase = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const { month, start, end } = getMonthRange(searchParams.get('month') || '');
    const projectId = searchParams.get('projectId') || 'all';
    const workType = (searchParams.get('workType') || '').trim();
    const keyword = (searchParams.get('keyword') || '').trim();

    const accessibleProjectIds = await getConstructionLogAccessibleProjectIds(supabase, auth.user);
    const parsedProjectId = projectId !== 'all' ? Number(projectId) : null;
    if (parsedProjectId && Array.isArray(accessibleProjectIds) && !accessibleProjectIds.includes(parsedProjectId)) {
      return apiForbidden('无权查看该项目出勤统计');
    }
    if (!parsedProjectId && Array.isArray(accessibleProjectIds) && accessibleProjectIds.length === 0) {
      return apiSuccess([], {
        meta: {
          month,
          summary: { worker_count: 0, project_count: 0, total_hours: 0, attendance_days: 0 },
          work_types: [],
        },
      });
    }

    let logQuery = supabase
      .from('construction_logs')
      .select('id,project_id,log_date')
      .gte('log_date', start)
      .lte('log_date', end);
    if (parsedProjectId) logQuery = logQuery.eq('project_id', parsedProjectId);
    else if (Array.isArray(accessibleProjectIds)) logQuery = logQuery.in('project_id', accessibleProjectIds);

    const { data: logs, error: logError } = await logQuery;
    if (logError) throw new Error(logError.message);

    const logRows = (logs || []) as LogRow[];
    const logIds = logRows.map(log => Number(log.id)).filter(Boolean);
    if (logIds.length === 0) {
      return apiSuccess([], {
        meta: {
          month,
          summary: { worker_count: 0, project_count: 0, total_hours: 0, attendance_days: 0 },
          work_types: [],
        },
      });
    }

    let attendanceQuery = supabase
      .from('construction_log_attendance')
      .select('log_id,project_id,worker_id,worker_name,work_type,team_name,work_hours')
      .in('log_id', logIds);
    if (workType) attendanceQuery = attendanceQuery.eq('work_type', workType);

    const { data: attendance, error: attendanceError } = await attendanceQuery;
    if (attendanceError) throw new Error(attendanceError.message);

    const projectIds = Array.from(new Set(logRows.map(log => Number(log.project_id)).filter(Boolean)));
    const { data: projects } = await supabase
      .from('projects')
      .select('id,name')
      .in('id', projectIds);
    const projectNameMap = new Map((projects || []).map(project => [Number(project.id), String(project.name || '')]));
    const logDateMap = new Map(logRows.map(log => [Number(log.id), log.log_date || '']));

    const aggregateMap = new Map<string, SummaryRow & { dates: Set<string> }>();
    ((attendance || []) as AttendanceRow[]).forEach((row) => {
      const rowProjectId = Number(row.project_id);
      const workerId = Number(row.worker_id);
      if (!rowProjectId || !workerId) return;
      const date = logDateMap.get(Number(row.log_id)) || '';
      const key = `${rowProjectId}:${workerId}`;
      const current = aggregateMap.get(key) || {
        project_id: rowProjectId,
        project_name: projectNameMap.get(rowProjectId) || `项目${rowProjectId}`,
        worker_id: workerId,
        worker_name: row.worker_name || `工人${workerId}`,
        work_type: row.work_type || '未填写',
        team_name: row.team_name || '',
        attendance_days: 0,
        total_hours: 0,
        last_date: '',
        dates: new Set<string>(),
      };
      if (date) current.dates.add(date);
      current.total_hours += Number(row.work_hours || 0);
      if (date && (!current.last_date || date > current.last_date)) current.last_date = date;
      aggregateMap.set(key, current);
    });

    let list = Array.from(aggregateMap.values()).map((row) => ({
      project_id: row.project_id,
      project_name: row.project_name,
      worker_id: row.worker_id,
      worker_name: row.worker_name,
      work_type: row.work_type,
      team_name: row.team_name,
      attendance_days: row.dates.size,
      total_hours: Math.round(row.total_hours * 100) / 100,
      last_date: row.last_date,
    }));
    if (keyword) list = list.filter(row => includesKeyword(row, keyword));
    list.sort((a, b) => b.total_hours - a.total_hours || a.project_name.localeCompare(b.project_name, 'zh-Hans-CN'));

    const workTypes = Array.from(new Set(((attendance || []) as AttendanceRow[])
      .map(row => (row.work_type || '').trim())
      .filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
    const summary = {
      worker_count: list.length,
      project_count: new Set(list.map(row => row.project_id)).size,
      total_hours: Math.round(list.reduce((sum, row) => sum + row.total_hours, 0) * 100) / 100,
      attendance_days: list.reduce((sum, row) => sum + row.attendance_days, 0),
    };

    return apiSuccess(list, {
      meta: {
        month,
        summary,
        work_types: workTypes,
      },
    });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '人员出勤统计加载失败'));
  }
}
