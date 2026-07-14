import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getSupabaseClient } from '@/storage/database/supabase-client';

type SupabaseErrorLike = { message?: string; details?: string } | null;

function isMissingRecipientColumn(error: unknown) {
  const err = error as SupabaseErrorLike;
  const message = String(err?.message || err?.details || '');
  return message.includes('recipient_user_id') || message.includes('recipient_role');
}

function isUnread(value: unknown) {
  return value === false || value === 'false' || value === 0 || value === null;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const isRead = searchParams.get('isRead');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || searchParams.get('limit') || '20', 10);
    const client = getSupabaseClient();

    const fetchNotifications = async (useRecipientScope: boolean) => {
      let query = client.from('notifications').select('*', { count: 'exact' });

      if (type && type !== 'all') query = query.eq('type', type);
      if (isRead !== null && isRead !== 'all') query = query.eq('is_read', isRead === 'true');
      if (useRecipientScope && !auth.user.is_super_admin) {
        query = query.or(`recipient_user_id.eq.${auth.user.id},recipient_user_id.is.null`);
      }

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      return query
        .order('priority', { ascending: false })
        .order('created_at', { ascending: false })
        .range(from, to);
    };

    let usedRecipientScope = true;
    let { data, error, count } = await fetchNotifications(true);
    if (error && isMissingRecipientColumn(error)) {
      usedRecipientScope = false;
      const fallback = await fetchNotifications(false);
      data = fallback.data;
      error = fallback.error;
      count = fallback.count;
    }
    if (error) throw new Error(`查询通知失败: ${error.message}`);

    const fetchStats = async (useRecipientScope: boolean) => {
      let statsQuery = client
        .from('notifications')
        .select('type, is_read, severity, created_at');
      if (useRecipientScope && !auth.user.is_super_admin) {
        statsQuery = statsQuery.or(`recipient_user_id.eq.${auth.user.id},recipient_user_id.is.null`);
      }
      return statsQuery;
    };

    let statsResult = await fetchStats(usedRecipientScope);
    if (statsResult.error && isMissingRecipientColumn(statsResult.error)) {
      statsResult = await fetchStats(false);
    }

    const statsData = statsResult.data || [];
    const today = new Date().toDateString();
    const stats = {
      total: statsData.length,
      unread: statsData.filter((notification: { is_read: unknown }) => isUnread(notification.is_read)).length,
      today: statsData.filter((notification: { created_at: string }) => new Date(notification.created_at).toDateString() === today).length,
      danger: statsData.filter((notification: { severity: string }) => notification.severity === 'danger').length,
      warning: statsData.filter((notification: { severity: string }) => notification.severity === 'warning').length,
      info: statsData.filter((notification: { severity: string }) => notification.severity === 'info').length,
    };

    return NextResponse.json({
      success: true,
      notifications: data || [],
      pagination: {
        page,
        pageSize,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / pageSize),
      },
      stats,
    });
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error('API Error:', error);
    return NextResponse.json(
      { error: err.message || '查询失败' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const {
      type,
      title,
      content,
      severity = 'info',
      project_id,
      related_id,
      related_type,
      recipient_user_id,
      recipient_role,
      metadata,
    } = body;

    if (!type || !title || !content) {
      return NextResponse.json(
        { error: '通知类型、标题和内容不能为空' },
        { status: 400 }
      );
    }

    const client = getSupabaseClient();
    const insertPayload = {
      type,
      title,
      content,
      severity,
      project_id: project_id || null,
      related_id: related_id || null,
      related_type: related_type || null,
      recipient_user_id: recipient_user_id || null,
      recipient_role: recipient_role || null,
      metadata: metadata || null,
    };

    let { data, error } = await client
      .from('notifications')
      .insert(insertPayload)
      .select()
      .single();

    if (error && isMissingRecipientColumn(error)) {
      const { recipient_user_id: _recipientUserId, recipient_role: _recipientRole, ...fallbackPayload } = insertPayload;
      const fallback = await client
        .from('notifications')
        .insert(fallbackPayload)
        .select()
        .single();
      data = fallback.data;
      error = fallback.error;
    }

    if (error) throw new Error(`创建通知失败: ${error.message}`);

    return NextResponse.json({ notification: data });
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error('API Error:', error);
    return NextResponse.json(
      { error: err.message || '创建失败' },
      { status: 500 }
    );
  }
}

async function updateReadStatus(
  client: ReturnType<typeof getSupabaseClient>,
  user: { id: number; is_super_admin: boolean },
  readValue: boolean,
  id?: number
) {
  const run = async (useRecipientScope: boolean) => {
    let query = client
      .from('notifications')
      .update({
        is_read: readValue,
        read_at: readValue ? new Date().toISOString() : null,
      });

    if (id) query = query.eq('id', id);
    else query = query.eq('is_read', !readValue);
    if (useRecipientScope && !user.is_super_admin) {
      query = query.or(`recipient_user_id.eq.${user.id},recipient_user_id.is.null`);
    }
    return query;
  };

  let result = await run(true);
  if (result.error && isMissingRecipientColumn(result.error)) {
    result = await run(false);
  }
  return result;
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const { id, markAllRead } = body;
    const client = getSupabaseClient();

    if (markAllRead) {
      const { error } = await updateReadStatus(client, auth.user, true);
      if (error) throw new Error(`标记已读失败: ${error.message}`);
      return NextResponse.json({ success: true, message: '已全部标记为已读' });
    }

    if (id) {
      const { error } = await updateReadStatus(client, auth.user, true, Number(id));
      if (error) throw new Error(`标记已读失败: ${error.message}`);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: '请提供通知ID或标记全部已读' }, { status: 400 });
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error('API Error:', error);
    return NextResponse.json(
      { error: err.message || '操作失败' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const { id, all, markAllRead, isRead } = body;
    const client = getSupabaseClient();
    const readValue = isRead !== undefined ? Boolean(isRead) : true;

    if (all || markAllRead) {
      const { error } = await updateReadStatus(client, auth.user, readValue);
      if (error) throw new Error(`标记已读失败: ${error.message}`);
      return NextResponse.json({ success: true });
    }

    if (id) {
      const { error } = await updateReadStatus(client, auth.user, readValue, Number(id));
      if (error) throw new Error(`标记已读失败: ${error.message}`);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, error: '请提供通知ID或标记全部已读' }, { status: 400 });
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error('API Error:', error);
    return NextResponse.json(
      { success: false, error: err.message || '操作失败' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: '请提供通知ID' }, { status: 400 });

    const client = getSupabaseClient();
    const run = async (useRecipientScope: boolean) => {
      let query = client.from('notifications').delete().eq('id', parseInt(id, 10));
      if (useRecipientScope && !auth.user.is_super_admin) {
        query = query.or(`recipient_user_id.eq.${auth.user.id},recipient_user_id.is.null`);
      }
      return query;
    };

    let result = await run(true);
    if (result.error && isMissingRecipientColumn(result.error)) {
      result = await run(false);
    }
    if (result.error) throw new Error(`删除通知失败: ${result.error.message}`);

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error('API Error:', error);
    return NextResponse.json(
      { error: err.message || '删除失败' },
      { status: 500 }
    );
  }
}
