import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getUserDisplayName } from '@/lib/user-display-name';

type UserRow = {
  id: number;
  username?: string | null;
  name?: string | null;
  role?: string | null;
  is_disabled?: boolean | null;
  dingtalk_user_id?: string | null;
  dingtalk_name?: string | null;
  dingtalk_active?: boolean | null;
};

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('users')
      .select('id,username,name,role,is_disabled,dingtalk_user_id,dingtalk_name,dingtalk_active')
      .order('id', { ascending: true });

    if (error) throw new Error(error.message);

    const users = ((data || []) as UserRow[])
      .filter((user) => user.is_disabled !== true && user.role !== 'pending')
      .map((user) => ({
        id: Number(user.id),
        username: user.username || '',
        name: getUserDisplayName(user),
        role: user.role || '',
        dingtalkBound: Boolean(user.dingtalk_user_id),
        dingtalkActive: user.dingtalk_active !== false,
      }));

    return NextResponse.json({ success: true, users });
  } catch (error) {
    console.error('[Notification recipient users] Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '获取接收人失败' },
      { status: 500 },
    );
  }
}
