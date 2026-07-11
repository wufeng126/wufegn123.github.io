import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { createClient } from '@supabase/supabase-js';
import { getCurrentUser } from '@/lib/auth';
import { auditLog } from '@/lib/audit-log';

// 绑定日志表（使用 audit_logs 表记录）
type BindingAction = 'bind_auto' | 'bind_manual' | 'unbind';

/**
 * GET /api/dingtalk/bindings
 * 查询绑定状态，支持 tab 切换
 * ?tab=bound - 已绑定用户
 * ?tab=unbound_users - 未绑定系统用户
 * ?tab=unbound_dingtalk - 未绑定钉钉人员
 * ?tab=logs - 绑定日志
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ success: false, error: '未登录' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const tab = searchParams.get('tab') || 'bound';
    const keyword = searchParams.get('keyword') || '';
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const offset = parseInt(searchParams.get('offset') || '0');

    const supabase = getSupabaseClient();

    if (tab === 'bound') {
      // 已绑定用户：系统用户 + 钉钉信息
      let query = supabase
        .from('users')
        .select(`
          id, username, name, role, managed_projects,
          dingtalk_user_id, dingtalk_union_id, dingtalk_mobile,
          dingtalk_name, dingtalk_dept_id, dingtalk_avatar,
          dingtalk_active, last_dingtalk_sync_at
        `)
        .not('dingtalk_user_id', 'is', null)
        .order('id', { ascending: true });

      const { data: users, error } = await query;
      if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

      // 获取角色
      const { data: roles } = await supabase.from('roles').select('id, name, code');
      const { data: userRoles } = await supabase.from('user_roles').select('user_id, role_id');

      const result = (users || []).map((u: Record<string, unknown>) => {
        const uRoles = (userRoles || [])
          .filter((ur: Record<string, unknown>) => ur.user_id === u.id)
          .map((ur: Record<string, unknown>) => roles?.find((r: Record<string, unknown>) => r.id === ur.role_id))
          .filter(Boolean);
        return {
          ...u,
          role_names: uRoles.map((r) => r?.name ?? '').filter(Boolean).join(', ') || '未分配',
          project_count: Array.isArray(u.managed_projects) ? u.managed_projects.length : 0,
        };
      }).filter((u: Record<string, unknown>) => {
        if (!keyword) return true;
        const kw = keyword.toLowerCase();
        return (
          (u.username as string || '').toLowerCase().includes(kw) ||
          (u.name as string || '').toLowerCase().includes(kw) ||
          (u.dingtalk_name as string || '').toLowerCase().includes(kw) ||
          (u.dingtalk_mobile as string || '').includes(kw)
        );
      });

      return NextResponse.json({ success: true, data: result, total: result.length });

    } else if (tab === 'unbound_users') {
      // 未绑定系统用户
      let query = supabase
        .from('users')
        .select('id, username, name, role')
        .is('dingtalk_user_id', null)
        .order('id', { ascending: true });

      const { data: users, error } = await query;
      if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

      const { data: roles } = await supabase.from('roles').select('id, name, code');
      const { data: userRoles } = await supabase.from('user_roles').select('user_id, role_id');

      const result = (users || []).map((u: Record<string, unknown>) => {
        const uRoles = (userRoles || [])
          .filter((ur: Record<string, unknown>) => ur.user_id === u.id)
          .map((ur: Record<string, unknown>) => roles?.find((r: Record<string, unknown>) => r.id === ur.role_id))
          .filter(Boolean);
        return {
          ...u,
          role_names: uRoles.map((r) => r?.name ?? '').filter(Boolean).join(', ') || '未分配',
        };
      }).filter((u: Record<string, unknown>) => {
        if (!keyword) return true;
        const kw = keyword.toLowerCase();
        return (
          (u.username as string || '').toLowerCase().includes(kw) ||
          (u.name as string || '').toLowerCase().includes(kw)
        );
      });

      return NextResponse.json({ success: true, data: result, total: result.length });

    } else if (tab === 'unbound_dingtalk') {
      // 未绑定钉钉人员（在 dingtalk_contacts 中但不在 users.dingtalk_user_id 中）
      const { data: boundIds, error: boundError } = await supabase
        .from('users')
        .select('dingtalk_user_id')
        .not('dingtalk_user_id', 'is', null);

      if (boundError) return NextResponse.json({ success: false, error: boundError.message }, { status: 500 });

      const boundSet = new Set((boundIds || []).map((b: Record<string, unknown>) => b.dingtalk_user_id));

      let contactsQuery = supabase
        .from('dingtalk_contacts')
        .select('*')
        .eq('active', true)
        .order('name', { ascending: true });

      const { data: contacts, error } = await contactsQuery;
      if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

      const result = (contacts || [])
        .filter((c: Record<string, unknown>) => !boundSet.has(c.dingtalk_user_id))
        .filter((c: Record<string, unknown>) => {
          if (!keyword) return true;
          const kw = keyword.toLowerCase();
          return (
            (c.name as string || '').toLowerCase().includes(kw) ||
            (c.mobile as string || '').includes(kw) ||
            (c.dingtalk_user_id as string || '').includes(kw)
          );
        })
        .map((c: Record<string, unknown>) => ({
          id: c.id,
          dingtalkUserId: c.dingtalk_user_id,
          name: c.name,
          mobile: c.mobile,
          deptName: c.dept_name_list,
          active: c.active,
          bound: false,
          syncTime: c.sync_time || c.updated_at || c.created_at,
        }));

      return NextResponse.json({ success: true, data: result, total: result.length });

    } else if (tab === 'logs') {
      // 绑定日志（从 operation_logs 查询绑定相关记录）
      const { data: logs, error } = await supabase
        .from('operation_logs')
        .select('*')
        .in('operation_type', ['bind_auto', 'bind_manual', 'unbind'])
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

      const { count } = await supabase
        .from('operation_logs')
        .select('*', { count: 'exact', head: true })
        .in('operation_type', ['bind_auto', 'bind_manual', 'unbind']);

      // 映射字段为前端期望的 camelCase
      const mappedLogs = (logs || []).map((l: Record<string, unknown>) => ({
        id: l.id,
        operationType: l.operation_type,
        username: l.username,
        details: typeof l.details === 'string' ? l.details : JSON.stringify(l.details || ''),
        dingtalkName: (l.details as Record<string, unknown>)?.dingtalkName || '',
        createdAt: l.created_at,
      }));

      return NextResponse.json({ success: true, data: mappedLogs, total: count || 0 });

    } else {
      return NextResponse.json({ success: false, error: '无效的 tab 参数' }, { status: 400 });
    }
  } catch (err) {
    console.error('[DingTalk Bindings API] Error:', err);
    return NextResponse.json({ success: false, error: '服务器错误' }, { status: 500 });
  }
}

/**
 * POST /api/dingtalk/bindings
 * 操作：bind / unbind / auto_match
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ success: false, error: '未登录' }, { status: 401 });
    }

    const body = await request.json();
    const { action, userId, dingtalkUserId, mobile } = body as {
      action: 'bind' | 'unbind' | 'auto_match';
      userId?: number;
      dingtalkUserId?: string;
      mobile?: string;
    };

    const supabase = getSupabaseClient();

    if (action === 'bind') {
      // 手动绑定
      if (!userId || !dingtalkUserId) {
        return NextResponse.json({ success: false, error: '缺少 userId 或 dingtalkUserId' }, { status: 400 });
      }

      // 校验：系统用户是否已绑定
      const { data: existingUser } = await supabase
        .from('users')
        .select('id, username, name, dingtalk_user_id')
        .eq('id', userId)
        .single();

      if (!existingUser) {
        return NextResponse.json({ success: false, error: '系统用户不存在' }, { status: 404 });
      }
      if (existingUser.dingtalk_user_id) {
        return NextResponse.json({ success: false, error: `用户 ${existingUser.name} 已绑定钉钉账号，请先解绑` }, { status: 400 });
      }

      // 校验：钉钉账号是否已绑定其他用户
      const { data: boundUser } = await supabase
        .from('users')
        .select('id, name')
        .eq('dingtalk_user_id', dingtalkUserId)
        .single();

      if (boundUser) {
        return NextResponse.json({ success: false, error: `该钉钉账号已绑定用户 ${boundUser.name}` }, { status: 400 });
      }

      // 获取钉钉联系人信息
      const { data: contact } = await supabase
        .from('dingtalk_contacts')
        .select('*')
        .eq('dingtalk_user_id', dingtalkUserId)
        .single();

      const updateData: Record<string, unknown> = {
        dingtalk_user_id: dingtalkUserId,
        dingtalk_active: true,
        last_dingtalk_sync_at: new Date().toISOString(),
      };

      if (contact) {
        updateData.dingtalk_union_id = contact.union_id;
        updateData.dingtalk_mobile = contact.mobile;
        updateData.dingtalk_name = contact.name;
        updateData.dingtalk_dept_id = contact.dept_id_list;
        updateData.dingtalk_avatar = contact.avatar;
      }

      const { error } = await supabase
        .from('users')
        .update(updateData)
        .eq('id', userId);

      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }

      // 记录审计日志
      await auditLog({
        operationType: 'bind_manual',
        resourceType: 'dingtalk_binding',
        resourceId: userId,
        details: {
          user_id: userId,
          user_name: existingUser.name,
          dingtalk_user_id: dingtalkUserId,
          dingtalk_name: contact?.name,
          operator: user.name || user.username,
        },
        request,
      });

      return NextResponse.json({
        success: true,
        data: { message: `已将 ${existingUser.name} 与钉钉账号 ${contact?.name || dingtalkUserId} 绑定` },
      });

    } else if (action === 'unbind') {
      // 解绑
      if (!userId) {
        return NextResponse.json({ success: false, error: '缺少 userId' }, { status: 400 });
      }

      const { data: existingUser } = await supabase
        .from('users')
        .select('id, username, name, dingtalk_user_id, dingtalk_name')
        .eq('id', userId)
        .single();

      if (!existingUser) {
        return NextResponse.json({ success: false, error: '系统用户不存在' }, { status: 404 });
      }
      if (!existingUser.dingtalk_user_id) {
        return NextResponse.json({ success: false, error: '该用户未绑定钉钉账号' }, { status: 400 });
      }

      const { error } = await supabase
        .from('users')
        .update({
          dingtalk_user_id: null,
          dingtalk_union_id: null,
          dingtalk_mobile: null,
          dingtalk_name: null,
          dingtalk_dept_id: null,
          dingtalk_avatar: null,
          dingtalk_active: null,
          last_dingtalk_sync_at: null,
        })
        .eq('id', userId);

      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }

      // 记录审计日志（解绑不删除历史业务数据）
      await auditLog({
        operationType: 'unbind',
        resourceType: 'dingtalk_binding',
        resourceId: userId,
        details: {
          user_id: userId,
          user_name: existingUser.name,
          dingtalk_user_id: existingUser.dingtalk_user_id,
          dingtalk_name: existingUser.dingtalk_name,
          operator: user.name || user.username,
          note: '解绑不删除历史业务数据',
        },
        request,
      });

      return NextResponse.json({
        success: true,
        data: { message: `已将 ${existingUser.name} 与钉钉账号 ${existingUser.dingtalk_name || existingUser.dingtalk_user_id} 解绑` },
      });

    } else if (action === 'auto_match') {
      // 按手机号自动匹配绑定
      // 查找所有未绑定钉钉的系统用户
      const { data: unboundUsers, error: usersError } = await supabase
        .from('users')
        .select('id, username, name, dingtalk_user_id, dingtalk_mobile')
        .is('dingtalk_user_id', null);

      if (usersError) {
        return NextResponse.json({ success: false, error: usersError.message }, { status: 500 });
      }

      // 通过 Supabase Auth Admin API 获取用户手机号（public.users 无 phone 列）
      const supabaseUrl = process.env.COZE_SUPABASE_URL || '';
      const serviceRoleKey = process.env.COZE_SUPABASE_SERVICE_ROLE_KEY || '';
      let authUserPhones: Record<string, string> = {};
      if (serviceRoleKey && supabaseUrl) {
        try {
          const adminClient = createClient(supabaseUrl, serviceRoleKey, {
            auth: { autoRefreshToken: false, persistSession: false },
          });
          // 使用 auth.admin.listUsers 获取 auth.users 中的手机号
          const { data: authData } = await adminClient.auth.admin.listUsers();
          if (authData?.users) {
            for (const au of authData.users) {
              const phone = au.phone || au.user_metadata?.phone || au.user_metadata?.mobile;
              if (phone) {
                // auth.users.id 是 UUID，public.users.id 是 integer
                // 通过 user_metadata 中的 id 或 email 关联
                const pubId = au.user_metadata?.id;
                if (pubId) authUserPhones[pubId] = phone;
              }
            }
          }
        } catch {
          // auth 查询失败时继续使用 dingtalk_mobile 兜底
        }
      }

      // 查找所有已绑定的钉钉用户ID
      const { data: boundIds } = await supabase
        .from('users')
        .select('dingtalk_user_id')
        .not('dingtalk_user_id', 'is', null);

      const boundSet = new Set((boundIds || []).map((b: Record<string, unknown>) => b.dingtalk_user_id));

      const { data: contacts, error: contactsError } = await supabase
        .from('dingtalk_contacts')
        .select('*')
        .eq('active', true);

      if (contactsError) {
        return NextResponse.json({ success: false, error: contactsError.message }, { status: 500 });
      }

      const unboundContacts = (contacts || []).filter((c: Record<string, unknown>) => !boundSet.has(c.dingtalk_user_id));

      // 按手机号匹配：优先使用 auth.users.phone，其次使用 dingtalk_mobile
      const matched: Array<{ userId: number; userName: string; dingtalkUserId: string; dingtalkName: string; mobile: string }> = [];
      const errors: string[] = [];

      for (const u of unboundUsers || []) {
        const phone = authUserPhones[u.id] || u.dingtalk_mobile;
        if (!phone) continue;
        const contact = unboundContacts.find((c: Record<string, unknown>) => c.mobile === phone);
        if (contact) {
          const { error: updateError } = await supabase
            .from('users')
            .update({
              dingtalk_user_id: contact.dingtalk_user_id,
              dingtalk_union_id: contact.union_id,
              dingtalk_mobile: contact.mobile,
              dingtalk_name: contact.name,
              dingtalk_dept_id: contact.dept_id_list,
              dingtalk_avatar: contact.avatar,
              dingtalk_active: true,
              last_dingtalk_sync_at: new Date().toISOString(),
            })
            .eq('id', u.id);

          if (updateError) {
            errors.push(`${u.name}: ${updateError.message}`);
          } else {
            matched.push({
              userId: u.id,
              userName: u.name as string,
              dingtalkUserId: contact.dingtalk_user_id as string,
              dingtalkName: contact.name as string,
              mobile: contact.mobile as string,
            });

            // 记录审计日志
            await auditLog({
              operationType: 'bind_auto',
              resourceType: 'dingtalk_binding',
              resourceId: u.id,
              details: {
                user_id: u.id,
                user_name: u.name,
                dingtalk_user_id: contact.dingtalk_user_id,
                dingtalk_name: contact.name,
                match_by: 'mobile',
                mobile: contact.mobile,
                operator: user.name || user.username,
              },
              request,
            });
          }
        }
      }

      return NextResponse.json({
        success: true,
        data: {
          matched,
          matchCount: matched.length,
          errors,
          message: `自动匹配完成：成功 ${matched.length} 条${errors.length > 0 ? `，失败 ${errors.length} 条` : ''}`,
        },
      });

    } else if (action === 'disable' || action === 'enable') {
      // 启用/禁用系统用户
      if (!userId) {
        return NextResponse.json({ success: false, error: '缺少 userId' }, { status: 400 });
      }
      const { error: updateError } = await supabase
        .from('users')
        .update({ is_disabled: action === 'disable' })
        .eq('id', userId);

      if (updateError) {
        return NextResponse.json({ success: false, error: updateError.message }, { status: 500 });
      }

      await auditLog({
        operationType: action === 'disable' ? 'user_disable' : 'user_enable',
        resourceType: 'dingtalk_binding',
        resourceId: userId,
        details: {
          user_id: userId,
          action,
          operator: user.name || user.username,
        },
        request,
      });

      return NextResponse.json({
        success: true,
        data: { message: action === 'disable' ? '已禁用该用户' : '已启用该用户' },
      });

    } else {
      return NextResponse.json({ success: false, error: '无效的操作类型' }, { status: 400 });
    }
  } catch (err) {
    console.error('[DingTalk Bindings API] Error:', err);
    return NextResponse.json({ success: false, error: '服务器错误' }, { status: 500 });
  }
}
