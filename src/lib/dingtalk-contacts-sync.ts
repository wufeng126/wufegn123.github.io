/**
 * 钉钉通讯录同步服务
 * 
 * 功能：
 * 1. 同步部门列表（/topapi/v2/department/listsub）
 * 2. 获取部门用户ID列表（/topapi/user/listsimple）— 仅需"通讯录部门成员读权限"
 * 3. 获取用户详情（/topapi/v2/user/get）— 仅需"通讯录个人信息读权限"
 * 4. 全量 upsert 到 dingtalk_contacts 缓存表
 * 
 * 注意：不使用 /topapi/v2/user/list，因为该接口需要
 *       "qyapi_get_department_member" 权限，多数应用默认未授权。
 *       改用 listsimple + user/get 组合，权限要求更低。
 * 
 * 安全：不直接覆盖系统用户权限，仅同步到缓存表
 */

import { callDingTalkApi } from './dingtalk-service';
import { isDingTalkConfigured } from './dingtalk-config';
import { dingtalkApiLogger } from './dingtalk-logger';
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

interface SyncResult {
  success: boolean;
  deptCount: number;
  userCount: number;
  error?: string;
  duration: number;
}

/**
 * 递归获取所有部门列表
 */
async function fetchAllDepartments(): Promise<DingTalkDept[]> {
  const departments: DingTalkDept[] = [];
  const queue: number[] = [1]; // 根部门 ID 为 1
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
      
      // 钉钉 API /topapi/v2/department/listsub 返回 result 为数组，has_more/next_cursor 在 result 同级
      const rawData = response.data as any;
      const deptList = Array.isArray(rawData?.result) ? rawData.result : (rawData?.result?.list || []);
      for (const dept of deptList) {
        departments.push(dept);
        queue.push(dept.dept_id);
      }
      
      hasMore = rawData?.result?.has_more || rawData?.has_more || false;
      const nextCursor = rawData?.result?.next_cursor || rawData?.next_cursor || 0;
      if (!hasMore) break;
      cursor = nextCursor;
    }
  }
  
  return departments;
}

/**
 * 获取部门下的所有用户ID列表（使用 listsimple 接口）
 * 该接口仅需"通讯录部门成员读权限"，比 /topapi/v2/user/list 权限要求低
 */
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
    
    // listsimple API 返回 result.list（result 为 dict，含 list 和 has_more）
    const rawData = response.data as any;
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

/**
 * 获取用户详情（使用 /topapi/v2/user/get 接口）
 * 该接口仅需"通讯录个人信息读权限"
 */
async function fetchUserDetail(userid: string): Promise<DingTalkUserDetail | null> {
  const response = await callDingTalkApi('/topapi/v2/user/get', {
    method: 'POST',
    body: { userid },
  });
  
  if (!response.success) return null;
  
  const data = response.data as any;
  const result = data?.result;
  if (!result) return null;
  
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

/**
 * 批量获取用户详情（带并发控制）
 */
async function fetchUserDetailsBatch(
  userids: string[],
  concurrency: number = 5
): Promise<Map<string, DingTalkUserDetail>> {
  const result = new Map<string, DingTalkUserDetail>();
  
  // 分批并发请求
  for (let i = 0; i < userids.length; i += concurrency) {
    const batch = userids.slice(i, i + concurrency);
    const details = await Promise.all(
      batch.map(userid => fetchUserDetail(userid))
    );
    
    for (const detail of details) {
      if (detail) {
        result.set(detail.userid, detail);
      }
    }
  }
  
  return result;
}

/**
 * 执行全量同步
 */
export async function syncDingTalkContacts(): Promise<SyncResult> {
  const startTime = Date.now();
  
  if (!isDingTalkConfigured()) {
    return {
      success: false,
      deptCount: 0,
      userCount: 0,
      error: '钉钉企业内部应用未配置',
      duration: Date.now() - startTime,
    };
  }
  
  try {
    // 1. 同步部门列表
    console.log('[DingTalk Contacts] step 1: fetching departments...');
    const departments = await fetchAllDepartments();
    const deptNameMap = new Map<number, string>();
    for (const dept of departments) {
      deptNameMap.set(dept.dept_id, dept.name);
    }
    deptNameMap.set(1, '根部门');
    console.log(`[DingTalk Contacts] found ${departments.length} departments`);
    
    // 2. 获取所有部门下的用户ID（去重）
    console.log('[DingTalk Contacts] step 2: fetching user IDs from all departments...');
    const userIdSet = new Set<string>();
    const deptIds = [1, ...departments.map(d => d.dept_id)];
    
    for (const deptId of deptIds) {
      const simpleUsers = await fetchDepartmentUserIds(deptId);
      for (const user of simpleUsers) {
        userIdSet.add(user.userid);
      }
    }
    
    const allUserIds = Array.from(userIdSet);
    console.log(`[DingTalk Contacts] found ${allUserIds.length} unique users across ${deptIds.length} departments`);
    
    // 3. 批量获取用户详情
    console.log('[DingTalk Contacts] step 3: fetching user details...');
    const userDetailsMap = await fetchUserDetailsBatch(allUserIds, 5);
    console.log(`[DingTalk Contacts] fetched details for ${userDetailsMap.size} users`);
    
    // 4. Upsert 到数据库
    const supabase = getSupabaseClient();
    const now = new Date().toISOString();
    const records = Array.from(userDetailsMap.values()).map(user => {
      // 补充部门名称
      const deptNames = (user.dept_id_list || [])
        .map((id: number) => deptNameMap.get(id) || String(id))
        .filter(Boolean)
        .join(',');
      
      const activeValue = user.active !== false;
      
      return {
        dingtalk_user_id: user.userid,
        union_id: user.unionid || null,
        name: user.name,
        mobile: user.mobile || null,
        dept_id_list: user.dept_id_list.join(','),
        dept_name_list: deptNames || null,
        avatar: user.avatar || null,
        active: activeValue,
        title: user.title || null,
        sync_time: now,
        updated_at: now,
      };
    });
    
    // 批量 upsert（每次最多 100 条）
    let upsertedCount = 0;
    for (let i = 0; i < records.length; i += 100) {
      const batch = records.slice(i, i + 100);
      const { data: upsertData, error } = await supabase
        .from('dingtalk_contacts')
        .upsert(batch, { onConflict: 'dingtalk_user_id' })
        .select();
      
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
    
    // 标记不在最新同步中的用户为 inactive
    const activeUserIds = Array.from(userDetailsMap.keys());
    let deactivatedSystemUsers = 0;
    if (activeUserIds.length > 0) {
      await supabase
        .from('dingtalk_contacts')
        .update({ active: false, updated_at: now })
        .not('dingtalk_user_id', 'in', activeUserIds);

      // 自动禁用离职/停用钉钉用户绑定的系统账号
      const { data: inactiveContacts, error: inactiveError } = await supabase
        .from('dingtalk_contacts')
        .select('dingtalk_user_id, name')
        .eq('active', false);

      if (!inactiveError && inactiveContacts && inactiveContacts.length > 0) {
        const inactiveDingTalkIds = inactiveContacts.map((c: any) => c.dingtalk_user_id);
        const { data: disabledResult, error: disableError } = await supabase
          .from('users')
          .update({ is_disabled: true })
          .in('dingtalk_user_id', inactiveDingTalkIds)
          .eq('is_disabled', false)
          .select('id, username');

        if (!disableError && disabledResult) {
          deactivatedSystemUsers = disabledResult.length;
          if (deactivatedSystemUsers > 0) {
            console.log(`[DingTalk Contacts] auto-disabled ${deactivatedSystemUsers} system users due to DingTalk deactivation`);
          }
        }
      }
    }
    
    const duration = Date.now() - startTime;
    console.log(`[DingTalk Contacts] sync completed: ${departments.length} depts, ${upsertedCount} users, ${duration}ms`);
    
    dingtalkApiLogger.log({
      api: 'contacts_sync',
      method: 'POST',
      timestamp: new Date().toISOString(),
      success: true,
      requestBody: { deptCount: departments.length, userCount: upsertedCount },
    });
    
    return {
      success: true,
      deptCount: departments.length,
      userCount: upsertedCount,
      duration,
    };
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error('[DingTalk Contacts] sync error:', error);
    
    dingtalkApiLogger.log({
      api: 'contacts_sync',
      method: 'POST',
      timestamp: new Date().toISOString(),
      success: false,
      errorCode: -1,
      errorMessage: error.message || String(error),
    });
    
    return {
      success: false,
      deptCount: 0,
      userCount: 0,
      error: error.message || '同步失败',
      duration,
    };
  }
}

/**
 * 查询通讯录列表
 */
export async function getDingTalkContacts(options?: {
  keyword?: string;
  activeOnly?: boolean;
  limit?: number;
  offset?: number;
}): Promise<{ data: any[]; total: number }> {
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

/**
 * 获取同步状态
 */
export async function getDingTalkContactsSyncStatus(): Promise<{
  totalContacts: number;
  activeContacts: number;
  lastSyncTime: string | null;
}> {
  const supabase = getSupabaseClient();
  
  const [totalResult, activeResult, latestResult] = await Promise.all([
    supabase.from('dingtalk_contacts').select('id', { count: 'exact', head: true }),
    supabase.from('dingtalk_contacts').select('id', { count: 'exact', head: true }).eq('active', true),
    supabase.from('dingtalk_contacts').select('sync_time').order('sync_time', { ascending: false }).limit(1),
  ]);
  
  return {
    totalContacts: totalResult.count || 0,
    activeContacts: activeResult.count || 0,
    lastSyncTime: latestResult.data?.[0]?.sync_time || null,
  };
}
