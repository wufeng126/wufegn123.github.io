import { NextRequest } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requirePermission } from '@/lib/api-auth';
import { apiServerError, apiSuccess, getErrorMessage } from '@/lib/api-utils';
import { fetchAllRows } from '@/lib/fetch-all-rows';
import { isReviewedStatus, isVoidedStatus } from '@/lib/review-status';

/**
 * GET /api/reports/daily/company?date=YYYY-MM-DD
 * 公司项目总览日报：按天汇总全部在建项目的施工日志、出勤、报量、问题与缺报情况。
 * 数字全部由数据库直算（不经过 AI），保证可直接对账。
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermission(request, 'reports:monthly_view');
    if (!auth.ok) return auth.response;

    const client = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const dateParam = String(searchParams.get('date') || '').trim();
    const today = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : today;

    const { data: projectRows } = await client
      .from('projects')
      .select('id, name, status, is_archived')
      .order('id', { ascending: true });
    const projects = ((projectRows || []) as Array<{ id: number; name: string; status?: string | null; is_archived?: boolean | null }>)
      .filter((project) => !project.is_archived);

    // 施工日志（当天；排除待提交/已作废，NULL 状态按历史有效处理）
    const logs = await fetchAllRows<Record<string, unknown>>((from, to) =>
      client
        .from('construction_logs')
        .select('id, project_id, headcount, content, issues, status, log_date, weather_condition')
        .eq('log_date', date)
        .range(from, to));

    const validLogs = logs.filter((row) => {
      const status = String(row.status || '');
      return !status || (!/pending|cancelled/i.test(status) && !isVoidedStatus(status));
    });

    const logIds = validLogs.map((row) => Number(row.id)).filter(Boolean);
    const attendanceRows: Array<{ log_id: number; worker_id: number; work_hours: number }> = [];
    for (let i = 0; i < logIds.length; i += 200) {
      const chunk = logIds.slice(i, i + 200);
      const rows = await fetchAllRows<{ log_id: number; worker_id: number; work_hours: number }>((from, to) =>
        client
          .from('construction_log_attendance')
          .select('log_id, worker_id, work_hours')
          .in('log_id', chunk)
          .range(from, to));
      attendanceRows.push(...rows);
    }

    // 当天甲方报量（有效状态）
    const reportRows = await fetchAllRows<Record<string, unknown>>((from, to) =>
      client
        .from('client_reports')
        .select('project_id, invoice_amount, settlement_amount, report_amount, status, report_date')
        .eq('report_date', date)
        .range(from, to));
    const validReports = reportRows.filter((row) => {
      const status = String(row.status || '');
      return !status || (!isVoidedStatus(status) && isReviewedStatus(status));
    });

    const hoursByLog = new Map<number, number>();
    const workersByLog = new Set<string>();
    const workerCountByLog = new Map<number, Set<number>>();
    attendanceRows.forEach((row) => {
      const logId = Number(row.log_id);
      const hours = Number(row.work_hours) || 0;
      hoursByLog.set(logId, (hoursByLog.get(logId) || 0) + hours);
      if (!workerCountByLog.has(logId)) workerCountByLog.set(logId, new Set());
      workerCountByLog.get(logId)?.add(Number(row.worker_id));
      workersByLog.add(`${logId}:${Number(row.worker_id)}`);
    });

    const logsByProject = new Map<number, Array<Record<string, unknown>>>();
    validLogs.forEach((row) => {
      const pid = Number(row.project_id);
      if (!logsByProject.has(pid)) logsByProject.set(pid, []);
      logsByProject.get(pid)?.push(row);
    });
    const reportAmountByProject = new Map<number, number>();
    validReports.forEach((row) => {
      const pid = Number(row.project_id);
      const amount = Number(row.invoice_amount ?? row.settlement_amount ?? row.report_amount ?? 0) || 0;
      reportAmountByProject.set(pid, (reportAmountByProject.get(pid) || 0) + amount);
    });

    const round2 = (value: number) => Math.round(value * 100) / 100;
    const truncate = (text: unknown, max = 80) => {
      const value = String(text || '').replace(/\s+/g, ' ').trim();
      return value.length > max ? `${value.slice(0, max)}…` : value;
    };
    const isActiveProject = (status?: string | null) => {
      const raw = String(status || '').trim();
      if (!raw) return true;
      return !['已完成', '已完工', '竣工结算', '已归档', 'archived', 'completed'].includes(raw);
    };

    const rows = projects.map((project) => {
      const projectLogs = logsByProject.get(Number(project.id)) || [];
      const headcount = projectLogs.reduce((sum, row) => sum + (Number(row.headcount) || 0), 0);
      const hours = projectLogs.reduce((sum, row) => {
        const perLog = hoursByLog.get(Number(row.id)) || 0;
        const computed = perLog > 0 ? perLog : 0;
        return sum + computed;
      }, 0);
      // 出勤人数：优先考勤去重人数，没有考勤则用日志填报人数
      let attendanceWorkers = 0;
      projectLogs.forEach((row) => {
        attendanceWorkers += workerCountByLog.get(Number(row.id))?.size || 0;
      });
      const issues = projectLogs
        .map((row) => String(row.issues || '').trim())
        .filter(Boolean);
      return {
        project_id: Number(project.id),
        project_name: String(project.name || ''),
        project_status: String(project.status || ''),
        has_log: projectLogs.length > 0,
        log_count: projectLogs.length,
        headcount: attendanceWorkers > 0 ? attendanceWorkers : headcount,
        headcount_source: attendanceWorkers > 0 ? '考勤' : (headcount > 0 ? '日志填报' : '-'),
        hours: round2(hours),
        issue_count: issues.length,
        issues: issues.slice(0, 3).map((text) => truncate(text, 60)),
        report_amount: round2(reportAmountByProject.get(Number(project.id)) || 0),
        summary: projectLogs.length > 0 ? truncate(projectLogs.map((row) => row.content).filter(Boolean).join('；'), 100) : '',
        weather: projectLogs.length > 0 ? String(projectLogs[0].weather_condition || '') : '',
      };
    });

    const activeRows = rows.filter((row) => isActiveProject(row.project_status));
    const loggedRows = activeRows.filter((row) => row.has_log);
    const missingRows = activeRows.filter((row) => !row.has_log);

    return apiSuccess({
      date,
      summary: {
        total_projects: activeRows.length,
        logged_projects: loggedRows.length,
        missing_projects: missingRows.length,
        coverage_rate: activeRows.length > 0 ? round2((loggedRows.length / activeRows.length) * 100) : 0,
        total_headcount: activeRows.reduce((sum, row) => sum + row.headcount, 0),
        total_hours: round2(activeRows.reduce((sum, row) => sum + row.hours, 0)),
        total_issues: activeRows.reduce((sum, row) => sum + row.issue_count, 0),
        total_report_amount: round2(activeRows.reduce((sum, row) => sum + row.report_amount, 0)),
        log_count: activeRows.reduce((sum, row) => sum + row.log_count, 0),
      },
      rows: activeRows,
      missing: missingRows.map((row) => ({ project_id: row.project_id, project_name: row.project_name })),
    });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '生成公司日报失败'));
  }
}
