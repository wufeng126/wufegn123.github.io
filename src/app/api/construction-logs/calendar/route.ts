import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAuth } from '@/lib/api-auth';
import { apiBadRequest, apiServerError, getErrorMessage } from '@/lib/api-utils';
import { detectConstructionLogRisk } from '@/lib/construction-log-risk';
import { getConstructionLogAccessibleProjectIds } from '@/lib/public-log-project';

type CalendarLogRow = {
  id: number;
  log_date: string;
  status: string;
  headcount: number | null;
  weather_condition: string | null;
  weather_temperature: string | null;
  user_name: string | null;
  content: string;
  issues: string | null;
  location: string | null;
  submission_status: string | null;
};

// GET /api/construction-logs/calendar?project_id=1&month=2026-06
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const projectIdStr = searchParams.get('project_id');
    const month = searchParams.get('month'); // YYYY-MM format

    if (!projectIdStr) return apiBadRequest('缺少 project_id');
    if (!month || !/^\d{4}-\d{2}$/.test(month)) return apiBadRequest('month 格式应为 YYYY-MM');

    const projectId = Number(projectIdStr);
    if (Number.isNaN(projectId)) return apiBadRequest('project_id 无效');

    const supabase = getSupabaseClient();

    // 检查权限：超管（null）放行；普通用户校验项目归属（与其他路由 Array.isArray 语义一致）
    const allowedProjectIds = await getConstructionLogAccessibleProjectIds(supabase, auth.user);
    if (Array.isArray(allowedProjectIds) && !allowedProjectIds.includes(projectId)) {
      return apiBadRequest('无权访问该项目的施工日志');
    }

    // 计算月份的起止日期
    const [year, monthNum] = month.split('-').map(Number);
    const startDate = `${month}-01`;
    const lastDay = new Date(year, monthNum, 0).getDate();
    const endDate = `${month}-${String(lastDay).padStart(2, '0')}`;

    // 查询该月的所有施工日志
    const { data: logs, error } = await supabase
      .from('construction_logs')
      .select('id, log_date, status, headcount, weather_condition, weather_temperature, user_name, content, issues, location, submission_status')
      .eq('project_id', projectId)
      .gte('log_date', startDate)
      .lte('log_date', endDate)
      .order('log_date', { ascending: true });

    if (error) throw new Error(error.message);

    // 按日期分组
    const logsByDate: Record<string, CalendarLogRow[]> = {};
    (logs || []).forEach((log) => {
      if (!logsByDate[log.log_date]) {
        logsByDate[log.log_date] = [];
      }
      logsByDate[log.log_date].push(log);
    });

    // 生成日历数据
    const calendarDays = [];
    for (let day = 1; day <= lastDay; day++) {
      const dateStr = `${month}-${String(day).padStart(2, '0')}`;
      const dayLogs = logsByDate[dateStr] || [];
      const dayRisks = dayLogs.map((log) => detectConstructionLogRisk({ content: log.content, issues: log.issues }));
      const hasLog = dayLogs.length > 0;
      const hasRisk = dayRisks.some((risk) => risk.hasRisk);
      const isLate = dayLogs.some((l) => l.submission_status === 'late');
      const riskCount = dayRisks.filter((risk) => risk.hasRisk).length;
      const totalHeadcount = dayLogs.reduce((sum, l) => sum + (l.headcount || 0), 0);
      const primaryLog = dayLogs[0];
      const weatherTemperature = primaryLog?.weather_temperature == null
        ? null
        : Number(primaryLog.weather_temperature);

      calendarDays.push({
        date: dateStr,
        day,
        weekday: new Date(dateStr).getDay(),
        hasLog,
        hasRisk,
        isLate,
        logId: primaryLog?.id,
        logCount: dayLogs.length,
        headcount: totalHeadcount,
        totalHeadcount,
        riskCount,
        weather: primaryLog?.weather_condition || null,
        weatherCondition: primaryLog?.weather_condition || null,
        temperature: Number.isFinite(weatherTemperature) ? weatherTemperature : null,
        weatherTemperature: Number.isFinite(weatherTemperature) ? weatherTemperature : null,
        logs: dayLogs.map((l) => ({
          id: l.id,
          content: l.content?.slice(0, 50) || '',
          headcount: l.headcount,
          userName: l.user_name,
          location: l.location,
          status: l.status,
          submissionStatus: l.submission_status,
          hasRisk: detectConstructionLogRisk({ content: l.content, issues: l.issues }).hasRisk,
        })),
      });
    }

    // 统计信息
    const totalLogs = (logs || []).length;
    const daysWithLogs = Object.keys(logsByDate).length;
    const totalHeadcount = (logs || []).reduce((sum, l) => sum + (l.headcount || 0), 0);
    const riskCount = (logs || []).filter((log) => detectConstructionLogRisk({ content: log.content, issues: log.issues }).hasRisk).length;

    return NextResponse.json({
      success: true,
      data: {
        month,
        year,
        monthNum,
        lastDay,
        calendarDays,
        stats: {
          totalLogs,
          daysWithLogs,
          daysWithoutLogs: lastDay - daysWithLogs,
          totalHeadcount,
          riskCount,
        },
      },
    });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '获取日历数据失败'));
  }
}
