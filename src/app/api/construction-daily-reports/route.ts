import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { apiBadRequest, apiServerError, apiSuccess, getErrorMessage } from '@/lib/api-utils';
import { getDefaultDailyReportDate } from '@/lib/construction-log-deadline';
import { generateConstructionDailyReport } from '@/lib/construction-daily-report';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const reportDate = searchParams.get('date') || getDefaultDailyReportDate();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) {
      return apiBadRequest('日报日期格式不正确');
    }

    const supabase = getSupabaseClient();
    const report = await generateConstructionDailyReport(supabase, reportDate, { force: false, push: false });
    return apiSuccess(report);
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '项目日报汇总加载失败'));
  }
}
