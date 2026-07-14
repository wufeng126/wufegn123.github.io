import { NextRequest } from 'next/server';
import { requireApiWritePermission } from '@/lib/api-auth';
import { apiBadRequest, apiForbidden, apiServerError, apiSuccess, getErrorMessage } from '@/lib/api-utils';
import { getDefaultDailyReportDate } from '@/lib/construction-log-deadline';
import { generateConstructionDailyReport } from '@/lib/construction-daily-report';
import { getSupabaseClient } from '@/storage/database/supabase-client';

async function authorizeGenerate(request: NextRequest) {
  const configuredSecret = process.env.CONSTRUCTION_DAILY_REPORT_CRON_SECRET;
  const requestSecret = request.headers.get('x-cron-secret') || request.nextUrl.searchParams.get('secret');

  if (configuredSecret && requestSecret && requestSecret === configuredSecret) {
    return { ok: true as const };
  }

  const auth = await requireApiWritePermission(request);
  if (!auth.ok) return { ok: false as const, response: auth.response };
  return { ok: true as const };
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authorizeGenerate(request);
    if (!auth.ok) return auth.response;

    const body = await request.json().catch(() => ({}));
    const reportDate = body.date || request.nextUrl.searchParams.get('date') || getDefaultDailyReportDate();
    const force = Boolean(body.force || request.nextUrl.searchParams.get('force') === '1');
    const shouldPush = body.push !== false && request.nextUrl.searchParams.get('push') !== '0';

    if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) {
      return apiBadRequest('日报日期格式不正确');
    }

    const supabase = getSupabaseClient();
    const report = await generateConstructionDailyReport(supabase, reportDate, { force, push: shouldPush });
    return apiSuccess(report);
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '项目日报汇总生成失败'));
  }
}

export async function GET(request: NextRequest) {
  if (!process.env.CONSTRUCTION_DAILY_REPORT_CRON_SECRET) {
    return apiForbidden('未配置定时任务密钥');
  }
  return POST(request);
}
