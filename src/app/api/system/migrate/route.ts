import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/api-auth';
import { getMigrationManualUrl, MIGRATION_SQL, runMigrations } from '@/lib/db-migration';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  // 迁移 SQL 含完整表结构与策略，仅超管可查看（防止普通账号获取 schema）
  const auth = await requireSuperAdmin(request);
  if (!auth.ok) return auth.response;

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
