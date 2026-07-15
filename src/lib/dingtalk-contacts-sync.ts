/**
 * 钉钉通讯录同步服务。
 *
 * 同步原则：
 * 1. 钉钉是普通员工账号的唯一来源。
 * 2. 同步到通讯录缓存表后，同步生成或更新系统账号。
 * 3. 新人员默认是待分配账号，超级管理员分配岗位和项目后才允许登录。
 * 4. 钉钉离职/停用人员自动禁用系统账号，不删除历史业务数据。
 */

import { callDingTalkApi } from './dingtalk-service';
import { isDingTalkConfigured } from './dingtalk-config';
import { dingtalkApiLogger } from './dingtalk-logger';
import { hashPassword } from './auth-db';
import { getSupabaseClient } from '@/storage/database/supabase-client';

interface DingTalkDept {
  dept_id: number;
  name: string;
  parent_id: number;
}

interface DingTalkUserSimple {
  userid: string;
  name: string;
}

interface DingTalkUserDetail {
  userid: string;
  unionid: string;
  name: string;
  mobile: string;
  dept_id_list: number[];
  title: string;
  avatar: string;
  active: boolean;
}

type DingTalkDepartmentListResponse = {
  result?: DingTalkDept[] | {
    list?: DingTalkDept[];
    has_more?: boolean;
    next_cursor?: number;
  };
  has_more?: boolean;
  next_cursor?: number;
};

type DingTalkSimpleUserListResponse = {
  result?: {
    list?: DingTalkUserSimple[];
    has_more?: boolean;
    next_cursor?: number;
  };
};

type DingTalkUserDetailResponse = {
  result?: Partial<DingTalkUserDetail>;
};

type DingTalkContactCacheRow = {
  id: number;
  dingtalk_user_id: string;
  union_id?: string | null;
  name: string;
  mobile?: string | null;
  dept_id_list?: string | null;
  dept_name_list?: string | null;
  avatar?: string | null;
  active?: boolean | null;
  title?: string | null;
  sync_time?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

interface SyncResult {
  success: boolean;
  deptCount: number;
  userCount: number;
  createdPendingAccounts: number;
  updatedSystemUsers: number;
  disabledSystemUsers: number;
  error?: string;
  duration: number;
}

type SyncUserRecord = {
  id: number;
  username: string;
  dingtalk_user_id?: string | null;
  dingtalk_mobile?: string | null;
  role?: string | null;
  is_disabled?: boolean | null;
};

async function fetchAllDepartments(): Promise<DingTalkDept[]> {
  const departments: DingTalkDept[] = [];
  const queue: number[] = [1];
  const visited = new Set<number>();

  while (queue.length > 0) {
    const parentId = queue.shift()!;
    if (visited.has(parentId)) continue;
    visited.add(parentId);

    let cursor = 0;
    let hasMore = true;

    while (hasMore) {
      const response = await callDingTalkApi('/topapi/v2/department/listsub', {
        method: 'POST',
        body: { dept_id: parentId, cursor, size: 100 },
      });

      if (!response.success) break;

      const rawData = response.data as DingTalkDepartmentListResponse | null;
      const resultData = rawData?.result;
      const deptList = Array.isArray(resultData) ? resultData : (resultData?.list || []);
      for (const dept of deptList) {
        departments.push(dept);
        queue.push(dept.dept_id);
      }

      hasMore = Array.isArray(resultData) ? Boolean(rawData?.has_more) : Boolean(resultData?.has_more || rawData?.has_more);
      cursor = Array.isArray(resultData) ? (rawData?.next_cursor || 0) : (resultData?.next_cursor || rawData?.next_cursor || 0);
    }
  }

  return departments;
}

async function fetchDepartmentUserIds(deptId: number): Promise<DingTalkUserSimple[]> {
  const users: DingTalkUserSimple[] = [];
  let cursor = 0;
  let hasMore = true;

  while (hasMore) {
    const response = await callDingTalkApi('/topapi/user/listsimple', {
      method: 'POST',
      body: { dept_id: deptId, cursor, size: 100 },
    });

    if (!response.success) break;

      const rawData = response.data as DingTalkSimpleUserListResponse | null;
    const userList = rawData?.result?.list || [];
    for (const user of userList) {
      users.push({
        userid: user.userid,
        name: user.name,
      });
    }

    hasMore = rawData?.result?.has_more || false;
    cursor = rawData?.result?.next_cursor || 0;
  }

  return users;
}

async function fetchUserDetail(userid: string): Promise<DingTalkUserDetail | null> {
  const response = await callDingTalkApi('/topapi/v2/user/get', {
    method: 'POST',
    body: { userid },
  });

  if (!response.success) return null;

  const data = response.data as DingTalkUserDetailResponse | null;
  const result = data?.result;
  if (!result?.userid) return null;

  return {
    userid: result.userid,
    unionid: result.unionid || '',
    name: result.name || '',
    mobile: result.mobile || '',
    dept_id_list: result.dept_id_list || [],
    title: result.title || '',
    avatar: result.avatar || '',
    active: result.active !== false,
  };
}

async function fetchUserDetailsBatch(
  userids: string[],
  concurrency = 5
): Promise<Map<string, DingTalkUserDetail>> {
  const result = new Map<string, DingTalkUserDetail>();

  for (let i = 0; i < userids.length; i += concurrency) {
    const batch = userids.slice(i, i + concurrency);
    const details = await Promise.all(batch.map((userid) => fetchUserDetail(userid)));

    for (const detail of details) {
      if (detail) result.set(detail.userid, detail);
    }
  }

  return result;
}

function normalizeUsername(value: string) {
  return value
    .replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
    .slice(0, 40);
}

async function getUniqueUsername(
  supabase: ReturnType<typeof getSupabaseClient>,
  baseName: string,
  dingtalkUserId: string,
  usedUsernames: Set<string>
) {
  const normalizedBase = normalizeUsername(baseName) || `dt_${dingtalkUserId}`;
  let username = normalizedBase;
  let suffix = 1;

  while (usedUsernames.has(username)) {
    username = `${normalizedBase}_${suffix}`;
    suffix += 1;
  }

  while (true) {
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('username', username)
      .maybeSingle();

    if (!existing) {
      usedUsernames.add(username);
      return username;
    }

    username = `${normalizedBase}_${suffix}`;
    suffix += 1;
  }
}

function buildUserUpdateFromContact(user: DingTalkUserDetail, now: string) {
  return {
    name: user.name,
    dingtalk_user_id: user.userid,
    dingtalk_union_id: user.unionid || null,
    dingtalk_mobile: user.mobile || null,
    dingtalk_name: user.name,
    dingtalk_dept_id: user.dept_id_list?.join(',') || null,
    dingtalk_avatar: user.avatar || null,
    dingtalk_active: user.active !== false,
    last_dingtalk_sync_at: now,
  };
}

async function syncContactsToSystemUsers(
  supabase: ReturnType<typeof getSupabaseClient>,
  contacts: DingTalkUserDetail[],
  now: string
) {
  const activeContacts = contacts.filter((contact) => contact.active !== false);
  const activeDingTalkIds = activeContacts.map((contact) => contact.userid);

  const { data: existingUsers } = await supabase
    .from('users')
    .select('id,username,dingtalk_user_id,dingtalk_mobile,role,is_disabled');

  const users = (existingUsers || []) as SyncUserRecord[];
  const usersByDingTalkId = new Map(
    users
      .filter((user) => user.dingtalk_user_id)
      .map((user) => [String(user.dingtalk_user_id), user])
  );
  const unboundUsersByMobile = new Map<string, SyncUserRecord>();
  users.forEach((user) => {
    if (!user.dingtalk_user_id && user.dingtalk_mobile) {
      unboundUsersByMobile.set(String(user.dingtalk_mobile), user);
    }
  });

  const usedUsernames = new Set(users.map((user) => user.username));
  let createdPendingAccounts = 0;
  let updatedSystemUsers = 0;

  for (const contact of activeContacts) {
    const matchedById = usersByDingTalkId.get(contact.userid);
    const matchedByMobile = contact.mobile ? unboundUsersByMobile.get(contact.mobile) : undefined;
    const matchedUser = matchedById || matchedByMobile;
    const updateData = buildUserUpdateFromContact(contact, now);

    if (matchedUser) {
      const { error } = await supabase
        .from('users')
        .update({
          ...updateData,
          is_disabled: matchedUser.role === 'pending' ? true : Boolean(matchedUser.is_disabled),
        })
        .eq('id', matchedUser.id);

      if (!error) {
        updatedSystemUsers += 1;
        usersByDingTalkId.set(contact.userid, { ...matchedUser, dingtalk_user_id: contact.userid });
      }
      continue;
    }

    const username = await getUniqueUsername(supabase, contact.name || contact.userid, contact.userid, usedUsernames);
    const passwordHash = hashPassword(`dt_${Math.random().toString(36).slice(2, 14)}`);
    const { error } = await supabase
      .from('users')
      .insert({
        username,
        password_hash: passwordHash,
        role: 'pending',
        is_disabled: true,
        managed_projects: [],
        ...updateData,
      });

    if (error) {
      console.warn('[DingTalk Contacts] create pending user failed:', contact.userid, error.message);
    } else {
      createdPendingAccounts += 1;
    }
  }

  let disabledSystemUsers = 0;
  const activeDingTalkIdSet = new Set(activeDingTalkIds);
  const usersToDisable = users.filter(
    (user) => user.dingtalk_user_id && !activeDingTalkIdSet.has(String(user.dingtalk_user_id))
  );

  if (usersToDisable.length > 0) {
    const { data: disabledResult, error: disableError } = await supabase
      .from('users')
      .update({ is_disabled: true, dingtalk_active: false, last_dingtalk_sync_at: now })
      .in('id', usersToDisable.map((user) => user.id))
      .select('id');

    if (!disableError) {
      disabledSystemUsers = disabledResult?.length || 0;
    }
  }

  return {
    createdPendingAccounts,
    updatedSystemUsers,
    disabledSystemUsers,
  };
}

export async function syncDingTalkContacts(): Promise<SyncResult> {
  const startTime = Date.now();

  if (!isDingTalkConfigured()) {
    return {
      success: false,
      deptCount: 0,
      userCount: 0,
      createdPendingAccounts: 0,
      updatedSystemUsers: 0,
      disabledSystemUsers: 0,
      error: '钉钉企业内部应用未配置',
      duration: Date.now() - startTime,
    };
  }

  try {
    const departments = await fetchAllDepartments();
    const deptNameMap = new Map<number, string>();
    for (const dept of departments) {
      deptNameMap.set(dept.dept_id, dept.name);
    }
    deptNameMap.set(1, '根部门');

    const userIdSet = new Set<string>();
    const deptIds = [1, ...departments.map((dept) => dept.dept_id)];
    for (const deptId of deptIds) {
      const simpleUsers = await fetchDepartmentUserIds(deptId);
      for (const user of simpleUsers) {
        userIdSet.add(user.userid);
      }
    }

    const userDetailsMap = await fetchUserDetailsBatch(Array.from(userIdSet), 5);
    const supabase = getSupabaseClient();
    const now = new Date().toISOString();

    const records = Array.from(userDetailsMap.values()).map((user) => {
      const deptNames = (user.dept_id_list || [])
        .map((id: number) => deptNameMap.get(id) || String(id))
        .filter(Boolean)
        .join(',');

      return {
        dingtalk_user_id: user.userid,
        union_id: user.unionid || null,
        name: user.name,
        mobile: user.mobile || null,
        dept_id_list: user.dept_id_list.join(','),
        dept_name_list: deptNames || null,
        avatar: user.avatar || null,
        active: user.active !== false,
        title: user.title || null,
        sync_time: now,
        updated_at: now,
      };
    });

    let upsertedCount = 0;
    for (let i = 0; i < records.length; i += 100) {
      const batch = records.slice(i, i + 100);
      const { error } = await supabase
        .from('dingtalk_contacts')
        .upsert(batch, { onConflict: 'dingtalk_user_id' });

      if (error) {
        console.error('[DingTalk Contacts] upsert batch error:', error);
        dingtalkApiLogger.log({
          api: 'contacts_sync_upsert',
          method: 'POST',
          timestamp: new Date().toISOString(),
          success: false,
          errorCode: -1,
          errorMessage: error.message,
        });
      } else {
        upsertedCount += batch.length;
      }
    }

    const activeUserIds = Array.from(userDetailsMap.keys());
    if (activeUserIds.length > 0) {
      await supabase
        .from('dingtalk_contacts')
        .update({ active: false, updated_at: now })
        .not('dingtalk_user_id', 'in', `(${activeUserIds.join(',')})`);
    }

    const accountSyncResult = await syncContactsToSystemUsers(
      supabase,
      Array.from(userDetailsMap.values()),
      now
    );

    dingtalkApiLogger.log({
      api: 'contacts_sync',
      method: 'POST',
      timestamp: new Date().toISOString(),
      success: true,
      requestBody: {
        deptCount: departments.length,
        userCount: upsertedCount,
        ...accountSyncResult,
      },
    });

    return {
      success: true,
      deptCount: departments.length,
      userCount: upsertedCount,
      ...accountSyncResult,
      duration: Date.now() - startTime,
    };
  } catch (error: unknown) {
    const duration = Date.now() - startTime;
    console.error('[DingTalk Contacts] sync error:', error);
    const message = error instanceof Error ? error.message : String(error);

    dingtalkApiLogger.log({
      api: 'contacts_sync',
      method: 'POST',
      timestamp: new Date().toISOString(),
      success: false,
      errorCode: -1,
      errorMessage: message,
    });

    return {
      success: false,
      deptCount: 0,
      userCount: 0,
      createdPendingAccounts: 0,
      updatedSystemUsers: 0,
      disabledSystemUsers: 0,
      error: message || '同步失败',
      duration,
    };
  }
}

export async function getDingTalkContacts(options?: {
  keyword?: string;
  activeOnly?: boolean;
  limit?: number;
  offset?: number;
}): Promise<{ data: DingTalkContactCacheRow[]; total: number }> {
  const supabase = getSupabaseClient();
  let query = supabase
    .from('dingtalk_contacts')
    .select('*', { count: 'exact' });

  if (options?.keyword) {
    query = query.or(`name.ilike.%${options.keyword}%,mobile.ilike.%${options.keyword}%,dingtalk_user_id.ilike.%${options.keyword}%`);
  }

  if (options?.activeOnly !== false) {
    query = query.eq('active', true);
  }

  const limit = options?.limit || 50;
  const offset = options?.offset || 0;
  query = query.order('name', { ascending: true }).range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) {
    console.error('[DingTalk Contacts] query error:', error);
    return { data: [], total: 0 };
  }

  return { data: data || [], total: count || 0 };
}

export async function getDingTalkContactsSyncStatus(): Promise<{
  totalContacts: number;
  activeContacts: number;
  lastSyncTime: string | null;
  pendingAccounts: number;
  enabledAccounts: number;
  disabledAccounts: number;
  boundAccounts: number;
}> {
  const supabase = getSupabaseClient();

  const [
    totalResult,
    activeResult,
    latestResult,
    pendingResult,
    enabledResult,
    disabledResult,
    boundResult,
  ] = await Promise.all([
    supabase.from('dingtalk_contacts').select('id', { count: 'exact', head: true }),
    supabase.from('dingtalk_contacts').select('id', { count: 'exact', head: true }).eq('active', true),
    supabase.from('dingtalk_contacts').select('sync_time').order('sync_time', { ascending: false }).limit(1),
    supabase.from('users').select('id', { count: 'exact', head: true }).eq('role', 'pending'),
    supabase.from('users').select('id', { count: 'exact', head: true }).not('dingtalk_user_id', 'is', null).eq('is_disabled', false),
    supabase.from('users').select('id', { count: 'exact', head: true }).not('dingtalk_user_id', 'is', null).eq('is_disabled', true),
    supabase.from('users').select('id', { count: 'exact', head: true }).not('dingtalk_user_id', 'is', null),
  ]);

  return {
    totalContacts: totalResult.count || 0,
    activeContacts: activeResult.count || 0,
    lastSyncTime: latestResult.data?.[0]?.sync_time || null,
    pendingAccounts: pendingResult.count || 0,
    enabledAccounts: enabledResult.count || 0,
    disabledAccounts: disabledResult.count || 0,
    boundAccounts: boundResult.count || 0,
  };
}
