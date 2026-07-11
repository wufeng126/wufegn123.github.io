import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const isRead = searchParams.get('isRead');
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '20');

    const client = getSupabaseClient();

    let query = client
      .from('notifications')
      .select('*', { count: 'exact' });

    if (type && type !== 'all') {
      query = query.eq('type', type);
    }
    if (isRead !== null && isRead !== 'all') {
      query = query.eq('is_read', isRead === 'true');
    }

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await query
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      throw new Error(`查询通知失败: ${error.message}`);
    }

    // 统计数据
    const { data: statsData } = await client
      .from('notifications')
      .select('type, is_read, severity, created_at');

    const stats = {
      total: statsData?.length || 0,
      unread: statsData?.filter((n: { is_read: boolean }) => !n.is_read).length || 0,
      today: statsData?.filter((n: { created_at: string }) => {
        const today = new Date().toDateString();
        return new Date(n.created_at).toDateString() === today;
      }).length || 0,
      danger: statsData?.filter((n: { severity: string }) => n.severity === 'danger').length || 0,
      warning: statsData?.filter((n: { severity: string }) => n.severity === 'warning').length || 0,
      info: statsData?.filter((n: { severity: string }) => n.severity === 'info').length || 0,
    };

    return NextResponse.json({
      notifications: data,
      pagination: {
        page,
        pageSize,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / pageSize),
      },
      stats,
    });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error.message || '查询失败' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      type,
      title,
      content,
      severity = 'info',
      project_id,
      related_id,
      related_type,
      metadata,
    } = body;

    if (!type || !title || !content) {
      return NextResponse.json(
        { error: '通知类型、标题和内容不能为空' },
        { status: 400 }
      );
    }

    const client = getSupabaseClient();

    const { data, error } = await client
      .from('notifications')
      .insert({
        type,
        title,
        content,
        severity,
        project_id: project_id || null,
        related_id: related_id || null,
        related_type: related_type || null,
        metadata: metadata || null,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`创建通知失败: ${error.message}`);
    }

    return NextResponse.json({ notification: data });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error.message || '创建失败' },
      { status: 500 }
    );
  }
}

// 标记已读
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, markAllRead } = body;

    const client = getSupabaseClient();

    if (markAllRead) {
      // 标记全部已读
      const { error } = await client
        .from('notifications')
        .update({
          is_read: true,
          read_at: new Date().toISOString(),
        })
        .eq('is_read', false);

      if (error) {
        throw new Error(`标记已读失败: ${error.message}`);
      }

      return NextResponse.json({ success: true, message: '已全部标记为已读' });
    } else if (id) {
      // 标记单条已读
      const { error } = await client
        .from('notifications')
        .update({
          is_read: true,
          read_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) {
        throw new Error(`标记已读失败: ${error.message}`);
      }

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: '请提供通知ID或标记全部已读' }, { status: 400 });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error.message || '操作失败' },
      { status: 500 }
    );
  }
}

// 删除通知
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: '请提供通知ID' }, { status: 400 });
    }

    const client = getSupabaseClient();

    const { error } = await client
      .from('notifications')
      .delete()
      .eq('id', parseInt(id));

    if (error) {
      throw new Error(`删除通知失败: ${error.message}`);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error.message || '删除失败' },
      { status: 500 }
    );
  }
}
