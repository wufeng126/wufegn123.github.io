import { NextRequest } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAuth } from '@/lib/api-auth';
import { apiServerError, apiSuccess, getErrorMessage } from '@/lib/api-utils';
import { detectConstructionLogRisk, getRiskTypeLabel, type ConstructionRiskLevel, type ConstructionRiskType } from '@/lib/construction-log-risk';

type LogStatRow = {
  user_id: number;
  user_name: string | null;
  log_date: string;
  content?: string | null;
  issues?: string | null;
};

type UserLogStats = {
  name: string;
  count: number;
  lastDate: string;
  riskCount: number;
  highRiskCount: number;
  costRiskCount: number;
};

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

    let query = supabase.from('construction_logs').select('user_id, user_name, log_date, content, issues');
    if (projectId) query = query.eq('project_id', parseInt(projectId));
    if (dateFrom) query = query.gte('log_date', dateFrom);
    if (dateTo) query = query.lte('log_date', dateTo);
    if (month) {
      query = query.gte('log_date', `${month}-01`).lte('log_date', `${month}-31`);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const rows = (data || []) as LogStatRow[];
    const stats: Record<string, UserLogStats> = {};
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
          name: row.user_name || `用户${row.user_id}`,
          count: 0,
          lastDate: '',
          riskCount: 0,
          highRiskCount: 0,
          costRiskCount: 0,
        };
      }
      stats[key].count++;
      if (row.log_date > stats[key].lastDate) stats[key].lastDate = row.log_date;

      const risk = detectConstructionLogRisk(row);
      if (!risk.hasRisk) return;

      stats[key].riskCount++;
      if (risk.level === 'high') stats[key].highRiskCount++;
      if (risk.types.includes('cost')) stats[key].costRiskCount++;
      risk.types.forEach(type => { riskByType[type]++; });
      if (risk.level) riskByLevel[risk.level]++;
    });

    const list = Object.entries(stats).map(([userId, val]) => ({
      user_id: parseInt(userId),
      user_name: val.name,
      count: val.count,
      last_date: val.lastDate,
      risk_count: val.riskCount,
      high_risk_count: val.highRiskCount,
      cost_risk_count: val.costRiskCount,
    })).sort((a, b) => b.count - a.count);

    const riskTypeList = Object.entries(riskByType)
      .map(([type, count]) => ({ type, label: getRiskTypeLabel(type as ConstructionRiskType), count }))
      .filter(item => item.count > 0)
      .sort((a, b) => b.count - a.count);

    return apiSuccess(list, {
      meta: {
        total: list.length,
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
