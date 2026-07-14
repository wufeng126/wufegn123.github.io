import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { extractWpsWorkerRecords, syncWpsWorkerRecord } from '@/lib/wps-worker-sync';

function getRequestToken(request: NextRequest): string {
  const queryToken = request.nextUrl.searchParams.get('token') || '';
  const headerToken = request.headers.get('x-wps-sync-token') || '';
  const authHeader = request.headers.get('authorization') || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  return queryToken || headerToken || bearerToken;
}

function validateToken(request: NextRequest): { ok: true } | { ok: false; response: NextResponse } {
  const expectedToken = process.env.WPS_WORKER_SYNC_TOKEN || process.env.WPS_SYNC_TOKEN || '';
  const requestToken = getRequestToken(request);

  if (!expectedToken) {
    if (process.env.COZE_PROJECT_ENV === 'PROD') {
      return {
        ok: false,
        response: NextResponse.json(
          { success: false, error: 'WPS同步Token未配置，请先配置 WPS_WORKER_SYNC_TOKEN' },
          { status: 500 }
        ),
      };
    }
    return { ok: true };
  }

  if (!requestToken || requestToken !== expectedToken) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: 'WPS同步Token不正确' },
        { status: 401 }
      ),
    };
  }

  return { ok: true };
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-wps-sync-token',
    },
  });
}

export async function GET(request: NextRequest) {
  const tokenCheck = validateToken(request);
  if (!tokenCheck.ok) return tokenCheck.response;

  return NextResponse.json({
    success: true,
    message: 'WPS工人花名册同步接口可用',
    tokenConfigured: Boolean(process.env.WPS_WORKER_SYNC_TOKEN || process.env.WPS_SYNC_TOKEN),
  });
}

export async function POST(request: NextRequest) {
  const tokenCheck = validateToken(request);
  if (!tokenCheck.ok) return tokenCheck.response;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: '请求体不是有效JSON' }, { status: 400 });
  }

  const records = extractWpsWorkerRecords(payload);
  if (records.length === 0) {
    return NextResponse.json({ success: false, error: '未识别到WPS表单记录' }, { status: 400 });
  }

  const client = getSupabaseClient();
  const results = [];
  for (const record of records) {
    results.push(await syncWpsWorkerRecord(client, record));
  }

  const successCount = results.filter((item) => item.success).length;
  const errorCount = results.filter((item) => item.status === 'error').length;
  const warningCount = results.filter((item) => item.status === 'warning').length;

  return NextResponse.json(
    {
      success: successCount > 0 && errorCount === 0,
      total: records.length,
      successCount,
      warningCount,
      errorCount,
      results,
    },
    { status: successCount > 0 ? 200 : 400 }
  );
}
