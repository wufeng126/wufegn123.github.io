import type { SupabaseClient } from '@supabase/supabase-js';
import { getReadableDate } from '@/lib/construction-log-deadline';
import { createLLMClient, getAIConfig } from '@/lib/ai-service';
import { getUserDisplayName } from '@/lib/user-display-name';
import { detectConstructionLogRisk, loadConstructionRiskEvents, type RiskEventRow } from '@/lib/construction-log-risk';

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
  risk_count: number;
  risk_high_count: number;
  risk_summary_text?: string;
  ai_sections?: DailyReportSections;
};

/** 单项目近 7 日趋势数据 */
export type DailyReportProjectTrend = {
  project_id: number;
  project_name: string;
  log_days: number; // 近 7 日有日志的天数
  total_logs: number; // 近 7 日日志总数
  risk_count: number; // 近 7 日风险事件数
  risk_high_count: number; // 近 7 日高风险事件数
  unresolved_risk_count: number; // 未闭环风险（pending/confirmed）
  recent_3d_logs: number; // 前 3 日（含当日）日志数
  prev_3d_logs: number; // 再前 3 日日志数
  recent_3d_risks: number; // 前 3 日风险事件数
  prev_3d_risks: number; // 再前 3 日风险事件数
  log_trend: 'up' | 'down' | 'flat'; // 日志活跃趋势
  risk_trend: 'worse' | 'better' | 'flat'; // 风险趋势
};

export type ConstructionDailyReportSummary = {
  report_date: string;
  report_type?: 'daily_report';
  report_version?: number;
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
    risk_count: number;
    risk_high_count: number;
    risk_unresolved_count?: number;
    narrative?: string;
    key_points?: string[];
    risk_summary?: string;
  };
  projects: DailyReportProjectDetail[];
  /** 近 7 日趋势（N 日趋势对比） */
  trends?: DailyReportProjectTrend[];
};

type DailyReportSections = {
  construction_content: string;
  labor_teams: string;
  materials_machinery: string;
  quality_safety: string;
  progress_risks: string;
  tomorrow_plan: string;
};

type AiDailyReportResult = {
  company?: {
    narrative?: string;
    key_points?: string[];
    risk_summary?: string;
  };
  projects?: Array<{
    project_id: number;
    sections?: Partial<DailyReportSections>;
  }>;
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

function emptySectionText(text: string) {
  return text.trim() || '日志中未单独记录。';
}

function buildFallbackProjectSections(project: DailyReportProjectDetail, trend?: DailyReportProjectTrend): DailyReportSections {
  const content = project.contents.slice(0, 4).join('；');
  const issues = project.issues.slice(0, 4).join('；');
  const missingText = project.missing_users.length > 0
    ? `未提交人员：${project.missing_users.map(user => user.name).join('、')}。`
    : '';
  const lateText = project.late_users.length > 0
    ? `逾期提交人员：${project.late_users.map(user => user.name).join('、')}。`
    : '';
  const riskText = project.risk_count > 0
    ? `检测到风险 ${project.risk_count} 条（高风险 ${project.risk_high_count} 条）：${project.risk_summary_text || ''}`
    : '未检测到风险。';
  const trendText = trend
    ? [
      trend.unresolved_risk_count > 0 ? `仍有 ${trend.unresolved_risk_count} 条风险未闭环。` : '',
      trend.risk_trend === 'worse' ? '风险呈上升趋势（近 3 日较前 3 日增多）。' : '',
      trend.risk_trend === 'better' ? '风险较前期缓解。' : '',
      trend.log_trend === 'down' ? '近 3 日日志活跃度较前 3 日下降。' : '',
    ].filter(Boolean).join('')
    : '';

  return {
    construction_content: emptySectionText(content),
    labor_teams: `当日提交 ${project.submitted_users.length}/${project.expected_users.length} 人，现场出勤合计 ${project.headcount_total} 人。${lateText}${missingText}`.trim(),
    materials_machinery: '日志中未单独记录材料、机械使用情况。',
    quality_safety: issues ? `记录问题/异常：${issues}` : '未记录质量、安全异常。',
    progress_risks: `${riskText}${trendText ? ` ${trendText}` : ''}${project.missing_users.length > 0 ? ` 另有 ${project.missing_users.length} 个未提交人员项。` : ''}`,
    tomorrow_plan: '日志中未单独记录明日计划。',
  };
}

function normalizeSections(project: DailyReportProjectDetail, aiSections?: Partial<DailyReportSections>, trend?: DailyReportProjectTrend): DailyReportSections {
  const fallback = buildFallbackProjectSections(project, trend);
  return {
    construction_content: emptySectionText(aiSections?.construction_content || fallback.construction_content),
    labor_teams: emptySectionText(aiSections?.labor_teams || fallback.labor_teams),
    materials_machinery: emptySectionText(aiSections?.materials_machinery || fallback.materials_machinery),
    quality_safety: emptySectionText(aiSections?.quality_safety || fallback.quality_safety),
    progress_risks: emptySectionText(aiSections?.progress_risks || fallback.progress_risks),
    tomorrow_plan: emptySectionText(aiSections?.tomorrow_plan || fallback.tomorrow_plan),
  };
}

function buildFallbackCompanyNarrative(summary: ConstructionDailyReportSummary) {
  const unresolvedText = summary.company.risk_unresolved_count && summary.company.risk_unresolved_count > 0
    ? `另有 ${summary.company.risk_unresolved_count} 条风险未闭环。`
    : '';
  const keyPoints = [
    `当日 ${summary.company.submitted_projects}/${summary.company.total_projects} 个项目有施工日志。`,
    `应交 ${summary.company.expected_user_count} 人，已交 ${summary.company.submitted_user_count} 人，未交 ${summary.company.missing_assignment_count} 个项目人员项。`,
    `日志共 ${summary.company.log_count} 条，出勤合计 ${summary.company.headcount_total} 人，问题异常 ${summary.company.issue_count} 条，风险 ${summary.company.risk_count} 条（高风险 ${summary.company.risk_high_count} 条）。`,
  ];
  const riskTrendInfo = (summary.trends || []).filter(trend => trend.risk_trend === 'worse').length > 0
    ? '部分项目近 3 日风险呈上升趋势，需重点关注。'
    : '';

  return {
    narrative: `当日公司项目日报覆盖 ${summary.company.submitted_projects} 个有日志项目，现场出勤合计 ${summary.company.headcount_total} 人。${summary.company.issue_count > 0 ? `共记录 ${summary.company.issue_count} 条问题异常，需相关项目负责人跟进。` : '未记录明显问题异常。'}${summary.company.risk_count > 0 ? `风险检测 ${summary.company.risk_count} 条（高风险 ${summary.company.risk_high_count} 条），需重点关注。` : ''}${unresolvedText}${riskTrendInfo}`,
    key_points: keyPoints,
    risk_summary: summary.company.risk_count > 0 || summary.company.issue_count > 0 || summary.company.missing_assignment_count > 0
      ? `存在 ${summary.company.risk_count} 条风险（高风险 ${summary.company.risk_high_count} 条）${summary.company.risk_unresolved_count ? `、${summary.company.risk_unresolved_count} 条未闭环` : ''}、${summary.company.issue_count} 条问题异常、${summary.company.missing_assignment_count} 个未提交项目人员项。${riskTrendInfo}`
      : '未识别到明显日报风险。',
  };
}

function extractJsonObject(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const source = fenced?.[1] || trimmed;
  const start = source.indexOf('{');
  const end = source.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(source.slice(start, end + 1));
  } catch {
    return null;
  }
}

function isTextPart(value: unknown): value is { text?: unknown; content?: unknown } {
  return typeof value === 'object' && value !== null && ('text' in value || 'content' in value);
}

function getChunkText(chunk: unknown) {
  if (typeof chunk === 'string') return chunk;
  if (typeof chunk !== 'object' || chunk === null) return '';

  const record = chunk as { content?: unknown; text?: unknown };
  if (Array.isArray(record.content)) {
    return record.content
      .map(part => (isTextPart(part) ? String(part.text || part.content || '') : ''))
      .join('');
  }
  if (record.content != null) return String(record.content);
  if (record.text != null) return String(record.text);
  return '';
}

async function collectLLMText(stream: AsyncIterable<unknown>) {
  let text = '';
  for await (const chunk of stream) {
    text += getChunkText(chunk);
  }
  return text;
}

function buildAiPrompt(summary: ConstructionDailyReportSummary) {
  const source = summary.projects.map(project => {
    const trend = summary.trends?.find(item => item.project_id === project.project_id);
    return {
      project_id: project.project_id,
      project_name: project.project_name,
      log_count: project.log_count,
      headcount_total: project.headcount_total,
      submitted_users: project.submitted_users.map(user => user.name),
      late_users: project.late_users.map(user => user.name),
      missing_users: project.missing_users.map(user => user.name),
      contents: project.contents.slice(0, 8),
      issues: project.issues.slice(0, 8),
      risk_count: project.risk_count,
      risk_high_count: project.risk_high_count,
      risk_summary_text: project.risk_summary_text,
      trend: trend
        ? {
          log_days: trend.log_days,
          total_logs: trend.total_logs,
          risk_count: trend.risk_count,
          risk_high_count: trend.risk_high_count,
          unresolved_risk_count: trend.unresolved_risk_count,
          recent_3d_logs: trend.recent_3d_logs,
          prev_3d_logs: trend.prev_3d_logs,
          recent_3d_risks: trend.recent_3d_risks,
          prev_3d_risks: trend.prev_3d_risks,
          log_trend: trend.log_trend,
          risk_trend: trend.risk_trend,
        }
        : undefined,
    };
  });

  return `你是建筑劳务公司项目日报助手。请把施工日志萃取成正式项目日报，不要逐条罗列原始日志。

要求：
1. 每个项目固定输出六个段落：今日施工内容、人员/班组情况、材料机械情况、质量安全问题、进度风险、明日计划。
2. 如果日志未记录某项，写“日志中未单独记录”，不要编造。
3. 语言要像公司内部日报，简洁、客观、可直接给全员查看。
4. 只返回 JSON，不要输出解释。
5. "进度风险"段落必须结合风险检测结果（risk_count / risk_high_count / risk_summary_text）如实呈现，高风险项目要突出提示。
6. "进度风险"段落还需结合近 7 日趋势（trend 字段）：
   - risk_trend=worse 时提示"风险呈上升趋势"，risk_trend=better 时提示"风险较前期缓解"，flat 则不强调；
   - 有未闭环风险（unresolved_risk_count > 0）时提示"仍有 N 条风险未闭环";
   - log_trend=down 时提示"近 3 日日志活跃度下降"（可能是施工放缓或记录减少）。

JSON 格式：
{
  "company": {
    "narrative": "公司总览段落",
    "key_points": ["要点1", "要点2"],
    "risk_summary": "风险提醒"
  },
  "projects": [
    {
      "project_id": 1,
      "sections": {
        "construction_content": "今日施工内容",
        "labor_teams": "人员/班组情况",
        "materials_machinery": "材料机械情况",
        "quality_safety": "质量安全问题",
        "progress_risks": "进度风险",
        "tomorrow_plan": "明日计划"
      }
    }
  ]
}

日报日期：${summary.report_date}
公司统计：${JSON.stringify(summary.company)}
项目日志数据：${JSON.stringify(source)}`;
}

async function buildAiDailyReport(summary: ConstructionDailyReportSummary): Promise<AiDailyReportResult | null> {
  try {
    const config = await getAIConfig();
    if (!config?.enabled || (!config.module_doc_generation && !config.module_report_analysis)) return null;

    const client = createLLMClient();
    const stream = await client.stream([
      { role: 'system', content: '你只输出严格 JSON，用中文生成建筑项目日报。' },
      { role: 'user', content: buildAiPrompt(summary) },
    ], {
      model: config.model_id,
      temperature: Math.min(Number(config.temperature || 0.2), 0.4),
    });
    const text = await collectLLMText(stream);
    return extractJsonObject(text) as AiDailyReportResult | null;
  } catch (error) {
    console.error('[ConstructionDailyReport] AI summary failed:', error);
    return null;
  }
}

function applyDailyReportNarrative(
  summary: ConstructionDailyReportSummary,
  aiResult: AiDailyReportResult | null,
): ConstructionDailyReportSummary {
  const fallbackCompany = buildFallbackCompanyNarrative(summary);
  const aiProjectMap = new Map<number, Partial<DailyReportSections>>();
  (aiResult?.projects || []).forEach(project => {
    if (project?.project_id) aiProjectMap.set(Number(project.project_id), project.sections || {});
  });
  const trendByProject = new Map<number, DailyReportProjectTrend>();
  (summary.trends || []).forEach(trend => trendByProject.set(trend.project_id, trend));

  return {
    ...summary,
    report_type: 'daily_report',
    report_version: 4,
    company: {
      ...summary.company,
      narrative: emptySectionText(aiResult?.company?.narrative || fallbackCompany.narrative),
      key_points: Array.isArray(aiResult?.company?.key_points) && aiResult.company.key_points.length > 0
        ? aiResult.company.key_points.map(item => String(item)).filter(Boolean).slice(0, 6)
        : fallbackCompany.key_points,
      risk_summary: emptySectionText(aiResult?.company?.risk_summary || fallbackCompany.risk_summary),
    },
    projects: summary.projects.map(project => ({
      ...project,
      ai_sections: normalizeSections(project, aiProjectMap.get(project.project_id), trendByProject.get(project.project_id)),
    })),
  };
}

function buildReportContent(summary: ConstructionDailyReportSummary) {
  const readableDate = getReadableDate(summary.report_date);
  const trendByProject = new Map<number, DailyReportProjectTrend>();
  (summary.trends || []).forEach(trend => trendByProject.set(trend.project_id, trend));
  const lines = [
    `${readableDate} 项目施工日报`,
    '',
    '一、公司整体情况',
    summary.company.narrative || buildFallbackCompanyNarrative(summary).narrative,
    `统计：共 ${summary.company.total_projects} 个项目，${summary.company.submitted_projects} 个项目有日志；应交 ${summary.company.expected_user_count} 人，已交 ${summary.company.submitted_user_count} 人，逾期 ${summary.company.late_user_count} 人，未交 ${summary.company.missing_assignment_count} 个项目人员项。`,
    `风险提醒：${summary.company.risk_summary || buildFallbackCompanyNarrative(summary).risk_summary}`,
    '',
    '二、各项目情况',
  ];

  summary.projects.forEach((project, index) => {
    const trend = trendByProject.get(project.project_id);
    const sections = project.ai_sections || buildFallbackProjectSections(project, trend);
    lines.push(
      `${index + 1}. ${project.project_name}`,
      `   今日施工内容：${sections.construction_content}`,
      `   人员/班组情况：${sections.labor_teams}`,
      `   材料机械情况：${sections.materials_machinery}`,
      `   质量安全问题：${sections.quality_safety}`,
      `   进度风险：${sections.progress_risks}`,
      `   明日计划：${sections.tomorrow_plan}`,
    );
  });

  return lines.join('\n');
}

function addDays(dateStr: string, days: number) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function getReportSourceData(supabase: SupabaseClient, reportDate: string) {
  const trendStart = addDays(reportDate, -6); // 近 7 日窗口（含当日）
  const recent3dStart = addDays(reportDate, -2); // 前 3 日窗口起点
  const prev3dStart = addDays(reportDate, -5); // 再前 3 日窗口起点
  const [projectsRes, usersRes, logsRes, trendLogsRes] = await Promise.all([
    supabase.from('projects').select('id,name').order('id', { ascending: true }),
    supabase.from('users').select('id,username,name,dingtalk_name,managed_projects,is_disabled,role'),
    supabase
      .from('construction_logs')
      .select('*')
      .eq('log_date', reportDate)
      .neq('status', 'pending')
      .neq('status', 'cancelled'),
    supabase
      .from('construction_logs')
      .select('id,project_id,log_date,content,issues')
      .gte('log_date', trendStart)
      .lte('log_date', reportDate)
      .neq('status', 'pending')
      .neq('status', 'cancelled'),
  ]);

  if (projectsRes.error) throw new Error(projectsRes.error.message);
  if (usersRes.error) throw new Error(usersRes.error.message);
  if (logsRes.error) throw new Error(logsRes.error.message);
  if (trendLogsRes.error) throw new Error(trendLogsRes.error.message);

  const projects = (projectsRes.data || []) as ProjectRow[];
  const users = ((usersRes.data || []) as UserRow[]).filter(user => user.is_disabled !== true && user.role !== 'pending');
  const logs = (logsRes.data || []) as LogRow[];
  const trendLogs = (trendLogsRes.data || []) as LogRow[];

  // 近 7 日风险事件（事件流表不存在时返回空数组，向后兼容）
  let riskEvents = await loadConstructionRiskEvents(supabase, {
    startDate: trendStart,
    endDate: reportDate,
    limit: 2000,
  });

  // 事件流表尚无数据时（新表刚建/历史日志未回填），用规则检测近 7 日日志兜底，
  // 保证趋势统计从第一天起就可用。
  if (riskEvents.length === 0) {
    riskEvents = (trendLogs as LogRow[])
      .map((log): RiskEventRow => {
        const risk = detectConstructionLogRisk({ content: log.content, issues: log.issues });
        return {
          id: 0,
          project_id: Number(log.project_id),
          log_id: Number(log.id),
          risk_type: risk.primaryType || 'quality',
          risk_types: risk.types,
          level: risk.level || 'low',
          status: risk.hasRisk ? 'pending' : 'resolved',
          occurred_date: log.log_date,
          content: log.content || null,
          issues: log.issues ? JSON.stringify(log.issues) : null,
          summary: risk.summary || null,
          recommendation: risk.recommendation || null,
          matched_keywords: risk.matchedKeywords,
          confirmed_by: null,
          confirmed_at: null,
          resolved_by: null,
          resolved_at: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      })
      .filter(event => event.status !== 'resolved');
  }

  return {
    projects,
    users,
    logs,
    trendLogs,
    riskEvents,
    windows: { trendStart, recent3dStart, prev3dStart },
  };
}

function computeProjectTrend(
  projectId: number,
  projectName: string,
  trendLogs: LogRow[],
  riskEvents: Array<{ project_id: number; level: string; status: string; occurred_date: string }>,
  windows: { trendStart: string; recent3dStart: string; prev3dStart: string },
): DailyReportProjectTrend {
  const projectLogs = trendLogs.filter(log => Number(log.project_id) === projectId);
  const projectRisks = riskEvents.filter(event => Number(event.project_id) === projectId);
  const logDays = new Set(projectLogs.map(log => log.log_date)).size;

  const recent3dLogs = projectLogs.filter(log => log.log_date >= windows.recent3dStart).length;
  const prev3dLogs = projectLogs.filter(
    log => log.log_date >= windows.prev3dStart && log.log_date < windows.recent3dStart,
  ).length;

  const recent3dRisks = projectRisks.filter(event => event.occurred_date >= windows.recent3dStart).length;
  const prev3dRisks = projectRisks.filter(
    event => event.occurred_date >= windows.prev3dStart && event.occurred_date < windows.recent3dStart,
  ).length;

  const riskHighCount = projectRisks.filter(event => event.level === 'high').length;
  const unresolvedRiskCount = projectRisks.filter(
    event => event.status === 'pending' || event.status === 'confirmed',
  ).length;

  return {
    project_id: projectId,
    project_name: projectName,
    log_days: logDays,
    total_logs: projectLogs.length,
    risk_count: projectRisks.length,
    risk_high_count: riskHighCount,
    unresolved_risk_count: unresolvedRiskCount,
    recent_3d_logs: recent3dLogs,
    prev_3d_logs: prev3dLogs,
    recent_3d_risks: recent3dRisks,
    prev_3d_risks: prev3dRisks,
    log_trend: recent3dLogs > prev3dLogs ? 'up' : recent3dLogs < prev3dLogs ? 'down' : 'flat',
    risk_trend: recent3dRisks > prev3dRisks ? 'worse' : recent3dRisks < prev3dRisks ? 'better' : 'flat',
  };
}

export async function buildConstructionDailyReportSummary(
  supabase: SupabaseClient,
  reportDate: string,
): Promise<ConstructionDailyReportSummary> {
  const { projects, users, logs, trendLogs, riskEvents, windows } = await getReportSourceData(supabase, reportDate);
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

    // 风险闭环数据：对每项目当日日志做风险检测，汇总风险数量与高风险数量（P0-1 日报消费风险状态）
    const projectRisks = projectLogs
      .map(log => ({ log, risk: detectConstructionLogRisk({ content: log.content, issues: log.issues }) }))
      .filter(item => item.risk.hasRisk);
    const riskCount = projectRisks.length;
    const riskHighCount = projectRisks.filter(item => item.risk.level === 'high').length;
    const riskSummaryText = projectRisks.length > 0
      ? projectRisks.slice(0, 5).map(item => `${item.log.log_date} ${item.risk.summary}`).join('；')
      : '';

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
      risk_count: riskCount,
      risk_high_count: riskHighCount,
      risk_summary_text: riskSummaryText,
    };
  });

  // 近 7 日趋势对比（P1-2：日报 N 日趋势）
  const trends: DailyReportProjectTrend[] = projectDetails.map(project =>
    computeProjectTrend(project.project_id, project.project_name, trendLogs, riskEvents, windows),
  );

  const expectedUserIds = uniqById(projectDetails.flatMap(project => project.expected_users)).map(user => user.id);
  const submittedUserIds = uniqById(projectDetails.flatMap(project => project.submitted_users)).map(user => user.id);
  const lateUserIds = uniqById(projectDetails.flatMap(project => project.late_users)).map(user => user.id);

  const totalRiskCount = projectDetails.reduce((sum, project) => sum + project.risk_count, 0);
  const totalRiskHighCount = projectDetails.reduce((sum, project) => sum + project.risk_high_count, 0);
  const totalUnresolvedRiskCount = trends.reduce((sum, trend) => sum + trend.unresolved_risk_count, 0);

  return {
    report_date: reportDate,
    report_type: 'daily_report',
    report_version: 4,
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
      risk_count: totalRiskCount,
      risk_high_count: totalRiskHighCount,
      risk_unresolved_count: totalUnresolvedRiskCount,
    },
    projects: projectDetails,
    trends,
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
      submittedProjects: summary.company.submitted_projects,
      totalProjects: summary.company.total_projects,
      missingAssignmentCount: summary.company.missing_assignment_count,
      issueCount: summary.company.issue_count,
      businessSummary: `${getReadableDate(summary.report_date)}项目日报汇总：${summary.company.submitted_projects}/${summary.company.total_projects} 个项目有日志，未交 ${summary.company.missing_assignment_count} 个项目人员项，问题异常 ${summary.company.issue_count} 条`,
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
      const needsRegeneration = existingReport.summary?.report_version !== 4;
      if (!needsRegeneration) {
        if (push && !existing.pushed_at) {
          return pushReportNotification(supabase, existingReport, existingReport.summary);
        }
        return existingReport;
      }
    }
  }

  const summary = await buildConstructionDailyReportSummary(supabase, reportDate);
  const aiResult = await buildAiDailyReport(summary);
  const reportSummary = applyDailyReportNarrative(summary, aiResult);
  const now = new Date().toISOString();
  const payload = {
    report_date: reportDate,
    summary: reportSummary,
    content: buildReportContent(reportSummary),
    ai_summary: reportSummary.company.narrative || null,
    ai_status: aiResult ? 'done' : 'fallback',
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
  if (push) return pushReportNotification(supabase, savedReport, reportSummary);
  return savedReport;
}
