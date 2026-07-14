import { NextRequest } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAuth } from '@/lib/api-auth';
import { apiServerError, apiSuccess, getErrorMessage } from '@/lib/api-utils';
import { getAccessibleProjectIds } from '@/lib/api-project-access';
import { detectConstructionLogRisk, getRiskTypeLabel, type ConstructionRiskLevel, type ConstructionRiskType } from '@/lib/construction-log-risk';
import { getUserDisplayName } from '@/lib/user-display-name';

type LogStatRow = {
  project_id: number;
  user_id: number;
  user_name: string | null;
  log_date: string;
  content?: string | null;
  issues?: string | null;
};

type UserLogStats = {
  name: string;
  count: number;
  submittedDays: Set<string>;
  lastDate: string;
  riskCount: number;
  highRiskCount: number;
  costRiskCount: number;
};

type ProjectLogStats = {
  projectId: number;
  projectName: string;
  count: number;
  submittedDays: Set<string>;
  lastDate: string;
  riskCount: number;
  highRiskCount: number;
};

type ProjectRow = {
  id: number;
  name: string;
};

type UserRow = {
  id: number;
  username?: string | null;
  name?: string | null;
  dingtalk_name?: string | null;
};

async function fetchUserNameMap(supabase: ReturnType<typeof getSupabaseClient>, userIds: number[]) {
  if (userIds.length === 0) return new Map<number, string>();

  const primary = await supabase
    .from('users')
    .select('id,username,name,dingtalk_name')
    .in('id', userIds);

  if (!primary.error) {
    return new Map(((primary.data || []) as UserRow[]).map(user => [Number(user.id), getUserDisplayName(user)]));
  }

  const fallback = await supabase
    .from('users')
    .select('id,username,name')
    .in('id', userIds);

  if (fallback.error) return new Map<number, string>();
  return new Map(((fallback.data || []) as UserRow[]).map(user => [Number(user.id), getUserDisplayName(user)]));
}

function getMonthRange(month?: string | null) {
  const now = new Date();
  const target = month && /^\d{4}-\d{2}$/.test(month)
    ? new Date(`${month}-01T00:00:00`)
    : new Date(now.getFullYear(), now.getMonth(), 1);
  const year = target.getFullYear();
  const monthIndex = target.getMonth();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const start = `${year}-${String(monthIndex + 1).padStart(2, '0')}-01`;
  const end = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
  const isCurrentMonth = year === now.getFullYear() && monthIndex === now.getMonth();
  const expectedDays = isCurrentMonth ? now.getDate() : daysInMonth;
  return { start, end, expectedDays };
}

function getExpectedDays(month: string | null, dateFrom: string | null, dateTo: string | null) {
  if (dateFrom && dateTo) {
    const start = new Date(`${dateFrom}T00:00:00`);
    const end = new Date(`${dateTo}T00:00:00`);
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end >= start) {
      return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
    }
  }
  return getMonthRange(month).expectedDays;
}

function toCompleteness(submittedDays: number, expectedDays: number) {
  if (expectedDays <= 0) return 0;
  return Math.min(100, Math.round((submittedDays / expectedDays) * 100));
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const supabase = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const month = searchParams.get('month');
    const parsedProjectId = projectId ? parseInt(projectId, 10) : null;
    const accessibleProjectIds = await getAccessibleProjectIds(supabase, auth.user);

    if (parsedProjectId && Array.isArray(accessibleProjectIds) && !accessibleProjectIds.includes(parsedProjectId)) {
      return apiSuccess([], {
        meta: {
          total: 0,
          expected_days: getExpectedDays(month, dateFrom, dateTo),
          project_stats: [],
          risk_summary: { total: 0, by_type: [], by_level: { low: 0, medium: 0, high: 0 } },
        },
      });
    }

    if (!parsedProjectId && Array.isArray(accessibleProjectIds) && accessibleProjectIds.length === 0) {
      return apiSuccess([], {
        meta: {
          total: 0,
          expected_days: getExpectedDays(month, dateFrom, dateTo),
          project_stats: [],
          risk_summary: { total: 0, by_type: [], by_level: { low: 0, medium: 0, high: 0 } },
        },
      });
    }

    let projectsQuery = supabase.from('projects').select('id,name').order('year', { ascending: false }).order('created_at', { ascending: false });
    if (parsedProjectId) projectsQuery = projectsQuery.eq('id', parsedProjectId);
    else if (Array.isArray(accessibleProjectIds)) projectsQuery = projectsQuery.in('id', accessibleProjectIds);

    const { data: projectRows, error: projectError } = await projectsQuery;
    if (projectError) throw new Error(projectError.message);

    let query = supabase.from('construction_logs').select('project_id, user_id, user_name, log_date, content, issues');
    if (parsedProjectId) query = query.eq('project_id', parsedProjectId);
    else if (Array.isArray(accessibleProjectIds)) query = query.in('project_id', accessibleProjectIds);
    if (dateFrom) query = query.gte('log_date', dateFrom);
    if (dateTo) query = query.lte('log_date', dateTo);
    if (month) {
      const range = getMonthRange(month);
      query = query.gte('log_date', range.start).lte('log_date', range.end);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const rows = (data || []) as LogStatRow[];
    const userIds = Array.from(new Set(rows.map(row => Number(row.user_id)).filter(Boolean)));
    const userNameMap = await fetchUserNameMap(supabase, userIds);
    const stats: Record<string, UserLogStats> = {};
    const projectStats: Record<string, ProjectLogStats> = {};
    const expectedDays = getExpectedDays(month, dateFrom, dateTo);
    ((projectRows || []) as ProjectRow[]).forEach(project => {
      projectStats[String(project.id)] = {
        projectId: Number(project.id),
        projectName: project.name,
        count: 0,
        submittedDays: new Set<string>(),
        lastDate: '',
        riskCount: 0,
        highRiskCount: 0,
      };
    });
    const riskByType: Record<ConstructionRiskType, number> = {
      change: 0,
      visa: 0,
      delay: 0,
      quality: 0,
      safety: 0,
      cost: 0,
    };
    const riskByLevel: Record<ConstructionRiskLevel, number> = {
      low: 0,
      medium: 0,
      high: 0,
    };

    rows.forEach(row => {
      const key = String(row.user_id);
      if (!stats[key]) {
        stats[key] = {
          name: userNameMap.get(Number(row.user_id)) || row.user_name || `用户${row.user_id}`,
          count: 0,
          submittedDays: new Set<string>(),
          lastDate: '',
          riskCount: 0,
          highRiskCount: 0,
          costRiskCount: 0,
        };
      }
      const projectKey = String(row.project_id || 0);
      if (!projectStats[projectKey]) {
        projectStats[projectKey] = {
          projectId: Number(row.project_id || 0),
          projectName: `项目${row.project_id || 0}`,
          count: 0,
          submittedDays: new Set<string>(),
          lastDate: '',
          riskCount: 0,
          highRiskCount: 0,
        };
      }
      stats[key].count++;
      stats[key].submittedDays.add(row.log_date);
      if (row.log_date > stats[key].lastDate) stats[key].lastDate = row.log_date;
      projectStats[projectKey].count++;
      projectStats[projectKey].submittedDays.add(row.log_date);
      if (row.log_date > projectStats[projectKey].lastDate) projectStats[projectKey].lastDate = row.log_date;

      const risk = detectConstructionLogRisk(row);
      if (!risk.hasRisk) return;

      stats[key].riskCount++;
      if (risk.level === 'high') stats[key].highRiskCount++;
      if (risk.types.includes('cost')) stats[key].costRiskCount++;
      projectStats[projectKey].riskCount++;
      if (risk.level === 'high') projectStats[projectKey].highRiskCount++;
      risk.types.forEach(type => { riskByType[type]++; });
      if (risk.level) riskByLevel[risk.level]++;
    });

    const list = Object.entries(stats).map(([userId, val]) => ({
      user_id: parseInt(userId),
      user_name: val.name,
      count: val.count,
      submitted_days: val.submittedDays.size,
      expected_days: expectedDays,
      completeness_rate: toCompleteness(val.submittedDays.size, expectedDays),
      last_date: val.lastDate,
      risk_count: val.riskCount,
      high_risk_count: val.highRiskCount,
      cost_risk_count: val.costRiskCount,
    })).sort((a, b) => b.count - a.count);

    const riskTypeList = Object.entries(riskByType)
      .map(([type, count]) => ({ type, label: getRiskTypeLabel(type as ConstructionRiskType), count }))
      .filter(item => item.count > 0)
      .sort((a, b) => b.count - a.count);

    const projectList = Object.values(projectStats).map(val => ({
      project_id: val.projectId,
      project_name: val.projectName,
      count: val.count,
      submitted_days: val.submittedDays.size,
      expected_days: expectedDays,
      completeness_rate: toCompleteness(val.submittedDays.size, expectedDays),
      last_date: val.lastDate,
      risk_count: val.riskCount,
      high_risk_count: val.highRiskCount,
    })).sort((a, b) => b.completeness_rate - a.completeness_rate || b.count - a.count);

    return apiSuccess(list, {
      meta: {
        total: list.length,
        expected_days: expectedDays,
        project_stats: projectList,
        risk_summary: {
          total: rows.reduce((sum, row) => sum + (detectConstructionLogRisk(row).hasRisk ? 1 : 0), 0),
          by_type: riskTypeList,
          by_level: riskByLevel,
        },
      },
    });
  } catch (e: unknown) {
    return apiServerError(getErrorMessage(e, '统计查询失败'));
  }
}
