import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/api-auth';
import { getMigrationManualUrl, MIGRATION_SQL, runMigrations } from '@/lib/db-migration';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    success: true,
    auto: false,
    message: '迁移接口已启用。为避免误触发，只有超级管理员使用 POST /api/system/migrate 才会执行自动迁移。',
    sql: MIGRATION_SQL,
    manualUrl: getMigrationManualUrl(),
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireSuperAdmin(request);
  if (!auth.ok) return auth.response;

  const result = await runMigrations();
  return NextResponse.json({
    success: result.ok,
    auto: result.ok,
    mode: result.mode,
    message: result.message,
    error: result.error,
    sql: result.sql,
    manualUrl: result.manualUrl,
  }, { status: result.ok ? 200 : 503 });
}
