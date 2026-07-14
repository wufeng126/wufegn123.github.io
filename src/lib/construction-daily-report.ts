import type { SupabaseClient } from '@supabase/supabase-js';
import { getReadableDate } from '@/lib/construction-log-deadline';
import { getUserDisplayName } from '@/lib/user-display-name';

type UserRow = {
  id: number;
  username?: string | null;
  name?: string | null;
  dingtalk_name?: string | null;
  managed_projects?: unknown;
  is_disabled?: boolean | null;
  role?: string | null;
};

type ProjectRow = {
  id: number;
  name?: string | null;
};

type LogRow = {
  id: number;
  project_id: number;
  user_id: number;
  user_name?: string | null;
  log_date: string;
  location?: string | null;
  content?: string | null;
  headcount?: number | null;
  issues?: string | null;
  submission_status?: string | null;
  submitted_at?: string | null;
  created_at?: string | null;
};

type ConstructionDailyReportRow = {
  id: number;
  report_date: string;
  summary: ConstructionDailyReportSummary;
  content?: string | null;
  ai_summary?: string | null;
  ai_status?: string | null;
  generated_at?: string | null;
  pushed_at?: string | null;
  updated_at?: string | null;
};

export type DailyReportProjectDetail = {
  project_id: number;
  project_name: string;
  expected_users: { id: number; name: string }[];
  submitted_users: { id: number; name: string; status: string }[];
  late_users: { id: number; name: string }[];
  missing_users: { id: number; name: string }[];
  log_count: number;
  headcount_total: number;
  issue_count: number;
  contents: string[];
  issues: string[];
};

export type ConstructionDailyReportSummary = {
  report_date: string;
  company: {
    total_projects: number;
    submitted_projects: number;
    expected_user_count: number;
    submitted_user_count: number;
    late_user_count: number;
    missing_assignment_count: number;
    log_count: number;
    issue_count: number;
    headcount_total: number;
  };
  projects: DailyReportProjectDetail[];
};

function parseManagedProjects(value: unknown): number[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map(Number).filter(projectId => Number.isInteger(projectId));
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parseManagedProjects(parsed);
    } catch {
      return value
        .split(',')
        .map(item => Number(item.trim()))
        .filter(projectId => Number.isInteger(projectId));
    }
  }
  return [];
}

function getUserName(user: UserRow) {
  const displayName = getUserDisplayName(user);
  if (displayName) return displayName;
  return `用户${user.id}`;
}

function uniqById<T extends { id: number }>(items: T[]) {
  const map = new Map<number, T>();
  items.forEach(item => map.set(item.id, item));
  return Array.from(map.values());
}

function shortText(value?: string | null, maxLength = 120) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}

function buildReportContent(summary: ConstructionDailyReportSummary) {
  const readableDate = getReadableDate(summary.report_date);
  const lines = [
    `${readableDate} 项目日报汇总`,
    '',
    `公司总览：共 ${summary.company.total_projects} 个项目，${summary.company.submitted_projects} 个项目有日志；应交 ${summary.company.expected_user_count} 人，已交 ${summary.company.submitted_user_count} 人，逾期 ${summary.company.late_user_count} 人，未交 ${summary.company.missing_assignment_count} 个项目人员项。`,
    `当日日志 ${summary.company.log_count} 条，现场出勤合计 ${summary.company.headcount_total} 人，问题/异常 ${summary.company.issue_count} 条。`,
    '',
    '项目明细：',
  ];

  summary.projects.forEach((project, index) => {
    lines.push(
      `${index + 1}. ${project.project_name}`,
      `   已交：${project.submitted_users.map(user => user.name).join('、') || '无'}；逾期：${project.late_users.map(user => user.name).join('、') || '无'}；未交：${project.missing_users.map(user => user.name).join('、') || '无'}`,
      `   日志 ${project.log_count} 条，出勤 ${project.headcount_total} 人，问题 ${project.issue_count} 条。`,
    );
    if (project.contents.length > 0) {
      lines.push(`   施工内容：${project.contents.slice(0, 3).join('；')}`);
    }
    if (project.issues.length > 0) {
      lines.push(`   问题异常：${project.issues.slice(0, 3).join('；')}`);
    }
  });

  return lines.join('\n');
}

async function getReportSourceData(supabase: SupabaseClient, reportDate: string) {
  const [projectsRes, usersRes, logsRes] = await Promise.all([
    supabase.from('projects').select('id,name').order('id', { ascending: true }),
    supabase.from('users').select('id,username,name,dingtalk_name,managed_projects,is_disabled,role'),
    supabase.from('construction_logs').select('*').eq('log_date', reportDate),
  ]);

  if (projectsRes.error) throw new Error(projectsRes.error.message);
  if (usersRes.error) throw new Error(usersRes.error.message);
  if (logsRes.error) throw new Error(logsRes.error.message);

  const projects = (projectsRes.data || []) as ProjectRow[];
  const users = ((usersRes.data || []) as UserRow[]).filter(user => user.is_disabled !== true && user.role !== 'pending');
  const logs = (logsRes.data || []) as LogRow[];

  return { projects, users, logs };
}

export async function buildConstructionDailyReportSummary(
  supabase: SupabaseClient,
  reportDate: string,
): Promise<ConstructionDailyReportSummary> {
  const { projects, users, logs } = await getReportSourceData(supabase, reportDate);
  const projectNameMap = new Map(projects.map(project => [Number(project.id), project.name || `项目${project.id}`]));
  const userNameMap = new Map(users.map(user => [Number(user.id), getUserName(user)]));
  const expectedByProject = new Map<number, { id: number; name: string }[]>();

  users.forEach(user => {
    parseManagedProjects(user.managed_projects).forEach(projectId => {
      const list = expectedByProject.get(projectId) || [];
      list.push({ id: Number(user.id), name: getUserName(user) });
      expectedByProject.set(projectId, list);
    });
  });

  const logsByProject = new Map<number, LogRow[]>();
  logs.forEach(log => {
    const projectId = Number(log.project_id);
    const list = logsByProject.get(projectId) || [];
    list.push(log);
    logsByProject.set(projectId, list);
  });

  const allProjectIds = Array.from(new Set([
    ...projects.map(project => Number(project.id)),
    ...Array.from(expectedByProject.keys()),
    ...Array.from(logsByProject.keys()),
  ])).sort((a, b) => a - b);

  const projectDetails = allProjectIds.map((projectId) => {
    const projectLogs = logsByProject.get(projectId) || [];
    const expectedUsers = uniqById(expectedByProject.get(projectId) || []);
    const submittedUsers = uniqById(projectLogs.map(log => ({
      id: Number(log.user_id),
      name: userNameMap.get(Number(log.user_id)) || log.user_name || `用户${log.user_id}`,
      status: log.submission_status === 'late' ? 'late' : 'normal',
    })));
    submittedUsers.forEach(user => {
      const liveName = userNameMap.get(user.id);
      if (liveName) user.name = liveName;
    });
    const submittedUserIds = new Set(submittedUsers.map(user => user.id));
    const lateUsers = uniqById(projectLogs
      .filter(log => log.submission_status === 'late')
      .map(log => ({
        id: Number(log.user_id),
        name: userNameMap.get(Number(log.user_id)) || log.user_name || `用户${log.user_id}`,
      })));
    lateUsers.forEach(user => {
      const liveName = userNameMap.get(user.id);
      if (liveName) user.name = liveName;
    });
    const missingUsers = expectedUsers.filter(user => !submittedUserIds.has(user.id));
    const issueTexts = projectLogs.map(log => shortText(log.issues, 100)).filter(Boolean);

    return {
      project_id: projectId,
      project_name: projectNameMap.get(projectId) || `项目${projectId}`,
      expected_users: expectedUsers,
      submitted_users: submittedUsers,
      late_users: lateUsers,
      missing_users: missingUsers,
      log_count: projectLogs.length,
      headcount_total: projectLogs.reduce((sum, log) => sum + Number(log.headcount || 0), 0),
      issue_count: issueTexts.length,
      contents: projectLogs.map(log => shortText(log.content, 120)).filter(Boolean),
      issues: issueTexts,
    };
  });

  const expectedUserIds = uniqById(projectDetails.flatMap(project => project.expected_users)).map(user => user.id);
  const submittedUserIds = uniqById(projectDetails.flatMap(project => project.submitted_users)).map(user => user.id);
  const lateUserIds = uniqById(projectDetails.flatMap(project => project.late_users)).map(user => user.id);

  return {
    report_date: reportDate,
    company: {
      total_projects: projectDetails.length,
      submitted_projects: projectDetails.filter(project => project.log_count > 0).length,
      expected_user_count: expectedUserIds.length,
      submitted_user_count: submittedUserIds.length,
      late_user_count: lateUserIds.length,
      missing_assignment_count: projectDetails.reduce((sum, project) => sum + project.missing_users.length, 0),
      log_count: logs.length,
      issue_count: projectDetails.reduce((sum, project) => sum + project.issue_count, 0),
      headcount_total: projectDetails.reduce((sum, project) => sum + project.headcount_total, 0),
    },
    projects: projectDetails,
  };
}

async function pushReportNotification(
  supabase: SupabaseClient,
  report: ConstructionDailyReportRow,
  summary: ConstructionDailyReportSummary,
) {
  const { data: users, error } = await supabase
    .from('users')
    .select('id,is_disabled,role');

  if (error) throw new Error(error.message);
  const recipientUserIds = ((users || []) as UserRow[])
    .filter(user => user.is_disabled !== true && user.role !== 'pending')
    .map(user => Number(user.id))
    .filter(Boolean);

  if (recipientUserIds.length === 0) return report;

  const { pushBusinessNotification } = await import('@/lib/business-notification');
  await pushBusinessNotification({
    type: 'construction_daily_report',
    title: `${getReadableDate(summary.report_date)} 项目日报汇总`,
    content: `已生成公司所有项目日报：${summary.company.submitted_projects}/${summary.company.total_projects} 个项目有日志，未交 ${summary.company.missing_assignment_count} 个项目人员项，问题异常 ${summary.company.issue_count} 条。`,
    severity: summary.company.issue_count > 0 || summary.company.missing_assignment_count > 0 ? 'warning' : 'info',
    relatedId: Number(report.id),
    relatedType: 'construction_daily_report',
    recipientUserIds,
    metadata: {
      reportDate: summary.report_date,
      targetLabel: '全员',
      targetUserIds: recipientUserIds,
    },
  });

  const pushedAt = new Date().toISOString();
  const { data: updated, error: updateError } = await supabase
    .from('construction_daily_reports')
    .update({ pushed_at: pushedAt, updated_at: pushedAt })
    .eq('id', report.id)
    .select()
    .single();

  if (updateError) throw new Error(updateError.message);
  return (updated as ConstructionDailyReportRow | null) || { ...report, pushed_at: pushedAt };
}

export async function generateConstructionDailyReport(
  supabase: SupabaseClient,
  reportDate: string,
  options: { force?: boolean; push?: boolean } = {},
) {
  const { force = false, push = false } = options;

  if (!force) {
    const { data: existing, error: existingError } = await supabase
      .from('construction_daily_reports')
      .select('*')
      .eq('report_date', reportDate)
      .maybeSingle();

    if (existingError) throw new Error(existingError.message);
    if (existing) {
      const existingReport = existing as ConstructionDailyReportRow;
      if (push && !existing.pushed_at) {
        return pushReportNotification(supabase, existingReport, existingReport.summary);
      }
      return existingReport;
    }
  }

  const summary = await buildConstructionDailyReportSummary(supabase, reportDate);
  const now = new Date().toISOString();
  const payload = {
    report_date: reportDate,
    summary,
    content: buildReportContent(summary),
    ai_summary: null,
    ai_status: 'pending',
    generated_at: now,
    updated_at: now,
  };

  const { data: report, error } = await supabase
    .from('construction_daily_reports')
    .upsert(payload, { onConflict: 'report_date' })
    .select()
    .single();

  if (error) throw new Error(error.message);
  const savedReport = report as ConstructionDailyReportRow;
  if (push) return pushReportNotification(supabase, savedReport, summary);
  return savedReport;
}
