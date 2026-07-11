import { NextRequest, NextResponse } from 'next/server';
import { syncAllBusinessData, getSyncStatus } from '@/lib/ai-knowledge-sync';
import { extractForwardHeaders } from '@/lib/ai-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/ai/knowledge/sync - 同步业务数据到知识库
 */
export async function POST(request: NextRequest) {
  try {
    // 权限检查：仅管理员可手动触发同步
    const userRole = request.headers.get('x-user-role') || 'team_leader';
    if (!['super_admin', 'admin'].includes(userRole)) {
      return NextResponse.json({ success: false, error: '仅管理员可触发数据同步' }, { status: 403 });
    }

    const forwardHeaders = extractForwardHeaders(request.headers);
    const result = await syncAllBusinessData(forwardHeaders);

    return NextResponse.json({
      success: result.success,
      data: result.synced,
      errors: result.errors.length > 0 ? result.errors : undefined,
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

/**
 * GET /api/ai/knowledge/sync - 获取同步状态
 */
export async function GET(request: NextRequest) {
  try {
    const status = await getSyncStatus();
    return NextResponse.json({ success: true, data: status });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
