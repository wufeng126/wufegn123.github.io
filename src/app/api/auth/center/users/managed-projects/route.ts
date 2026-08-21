import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { hasPermission, requireAuth, requirePermission } from '@/lib/api-auth';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizePositiveInteger(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeProjectIds(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const parsed = value.map((item) => Number(item));
  if (!parsed.every((item) => Number.isInteger(item) && item > 0)) return null;
  return Array.from(new Set(parsed));
}

// 获取用户的负责项目列表
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("user_id");
    
    const client = getSupabaseClient();
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;
    const currentUser = auth.user;
    
    // 获取指定用户的负责项目
    const targetUserId = userId ? normalizePositiveInteger(userId) : currentUser.id;

    if (!targetUserId) {
      return NextResponse.json({ error: '用户ID参数不正确' }, { status: 400 });
    }

    // 本人可查自己的；他人仅权限管理员可查（防 IDOR 越权读取）
    if (targetUserId !== currentUser.id && !hasPermission(currentUser, 'system:permission_manage')) {
      return NextResponse.json({ error: '无权查看其他用户的负责项目' }, { status: 403 });
    }
    
    const { data, error } = await client
      .from('users')
      .select('id, username, name, managed_projects')
      .eq('id', targetUserId)
      .single();
    
    if (error) {
      throw new Error(`获取用户负责项目失败: ${error.message}`);
    }
    
    return NextResponse.json({
      user: {
        id: data.id,
        username: data.username,
        name: data.name,
        managed_projects: data.managed_projects || []
      }
    });
  } catch (error: unknown) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: getErrorMessage(error) || '获取失败' },
      { status: 500 }
    );
  }
}

// 支持POST请求（等同于PUT）
export { PUT as POST };

// 更新用户的负责项目列表
export async function PUT(request: NextRequest) {
  try {
    const auth = await requirePermission(request, 'system:permission_manage');
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const { user_id, managed_projects } = body;
    const targetUserId = normalizePositiveInteger(user_id);
    const normalizedProjectIds = normalizeProjectIds(managed_projects);
    
    const client = getSupabaseClient();
    
    if (!targetUserId) {
      return NextResponse.json({ error: '用户ID不能为空' }, { status: 400 });
    }
    if (normalizedProjectIds === null) {
      return NextResponse.json({ error: '负责项目参数不正确' }, { status: 400 });
    }
    
    // 更新用户的负责项目
    const { data, error } = await client
      .from('users')
      .update({ managed_projects: normalizedProjectIds })
      .eq('id', targetUserId)
      .select('id, username, name, managed_projects')
      .single();
    
    if (error) {
      throw new Error(`更新用户负责项目失败: ${error.message}`);
    }
    
    return NextResponse.json({
      success: true,
      message: '负责项目已更新',
      user: {
        id: data.id,
        username: data.username,
        name: data.name,
        managed_projects: data.managed_projects || []
      }
    });
  } catch (error: unknown) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: getErrorMessage(error) || '更新失败' },
      { status: 500 }
    );
  }
}
