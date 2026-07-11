import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getCurrentUser } from '@/lib/auth';

// 获取用户的负责项目列表
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("user_id");
    
    const client = getSupabaseClient();
    const currentUser = await getCurrentUser();
    
    if (!currentUser) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }
    
    // 获取指定用户的负责项目
    const targetUserId = userId ? parseInt(userId) : currentUser.id;
    
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
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error.message || '获取失败' },
      { status: 500 }
    );
  }
}

// 支持POST请求（等同于PUT）
export { PUT as POST };

// 更新用户的负责项目列表
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { user_id, managed_projects } = body;
    
    const client = getSupabaseClient();
    const currentUser = await getCurrentUser();
    
    if (!currentUser) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }
    
    if (!user_id) {
      return NextResponse.json({ error: '用户ID不能为空' }, { status: 400 });
    }
    
    // 更新用户的负责项目
    const { data, error } = await client
      .from('users')
      .update({ managed_projects: managed_projects || [] })
      .eq('id', user_id)
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
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error.message || '更新失败' },
      { status: 500 }
    );
  }
}
