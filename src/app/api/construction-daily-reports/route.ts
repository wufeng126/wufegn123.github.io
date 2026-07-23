import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { apiBadRequest, apiServerError, apiSuccess, getErrorMessage } from '@/lib/api-utils';
import { getDefaultDailyReportDate } from '@/lib/construction-log-deadline';
import { generateConstructionDailyReport } from '@/lib/construction-daily-report';
import { getSupabaseClient } from '@/storage/database/supabase-client';

type DailyReportReadStatus = {
  read_count: number;
  total_count: number;
};

function isMissingReadTableError(error: unknown) {
  const err = error as { code?: string; message?: string } | null;
  const message = String(err?.message || '').toLowerCase();
  return err?.code === '42P01' || err?.code === '42703' || message.includes('construction_daily_report_reads') || message.includes('schema cache');
}

async function markReportReadAndGetStatus(
  supabase: ReturnType<typeof getSupabaseClient>,
  reportId: number,
  userId: number,
): Promise<DailyReportReadStatus> {
  const now = new Date().toISOString();

  const { error: readError } = await supabase
    .from('construction_daily_report_reads')
    .upsert(
      { report_id: reportId, user_id: userId, read_at: now },
      { onConflict: 'report_id,user_id' },
    );

  if (readError) throw readError;

  const [{ count: readCount, error: countError }, { count: totalCount, error: totalError }] = await Promise.all([
    supabase
      .from('construction_daily_report_reads')
      .select('id', { count: 'exact', head: true })
      .eq('report_id', reportId),
    supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .neq('role', 'pending')
      .eq('is_disabled', false),
  ]);

  if (countError) throw countError;
  if (totalError) throw totalError;

  return {
    read_count: readCount || 0,
    total_count: totalCount || 0,
  };
}

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
    let readStatus: DailyReportReadStatus = { read_count: 0, total_count: 0 };
    try {
      if (report?.id) {
        readStatus = await markReportReadAndGetStatus(supabase, Number(report.id), Number(auth.user.id));
      }
    } catch (error) {
      if (!isMissingReadTableError(error)) throw error;
      console.warn('[ConstructionDailyReports] read status skipped:', error);
    }

    return apiSuccess({ ...report, read_status: readStatus });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '项目日报汇总加载失败'));
  }
}
