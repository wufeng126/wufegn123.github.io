/**
 * 钉钉安全日志模块
 * 记录钉钉登录时间、IP、绑定用户、登录结果
 */

import { getSupabaseClient } from '@/storage/database/supabase-client';

export interface DingTalkSecurityLog {
  id?: number;
  event_type: 'dingtalk_login_success' | 'dingtalk_login_failed' | 'dingtalk_user_disabled' | 'dingtalk_user_enabled' | 'dingtalk_bind' | 'dingtalk_unbind';
  dingtalk_user_id?: string;
  dingtalk_name?: string;
  system_user_id?: number;
  system_username?: string;
  ip_address?: string;
  user_agent?: string;
  result: 'success' | 'failed' | 'disabled';
  error_message?: string;
  metadata?: Record<string, unknown>;
  created_at?: string;
}

/**
 * 记录钉钉安全日志
 */
export async function logDingTalkSecurityEvent(log: DingTalkSecurityLog): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from('dingtalk_security_logs')
      .insert({
        event_type: log.event_type,
        dingtalk_user_id: log.dingtalk_user_id || null,
        dingtalk_name: log.dingtalk_name || null,
        system_user_id: log.system_user_id || null,
        system_username: log.system_username || null,
        ip_address: log.ip_address || null,
        user_agent: log.user_agent || null,
        result: log.result,
        error_message: log.error_message || null,
        metadata: log.metadata || null,
      });

    if (error) {
      // 安全日志写入失败不应阻塞主流程，仅控制台警告
      console.warn('[DingTalkSecurityLog] 写入失败:', error.message);
    }
  } catch (err) {
    console.warn('[DingTalkSecurityLog] 异常:', err);
  }
}

/**
 * 查询安全日志
 */
export async function queryDingTalkSecurityLogs(options: {
  eventType?: string;
  systemUserId?: number;
  result?: string;
  limit?: number;
  offset?: number;
}): Promise<{ data: DingTalkSecurityLog[]; total: number }> {
  const { eventType, systemUserId, result, limit = 50, offset = 0 } = options;

  const supabase = getSupabaseClient();
  let query = supabase
    .from('dingtalk_security_logs')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (eventType) query = query.eq('event_type', eventType);
  if (systemUserId) query = query.eq('system_user_id', systemUserId);
  if (result) query = query.eq('result', result);

  const { data, error, count } = await query;

  if (error) {
    console.warn('[DingTalkSecurityLog] 查询失败:', error.message);
    return { data: [], total: 0 };
  }

  return { data: (data || []) as DingTalkSecurityLog[], total: count || 0 };
}

/**
 * 从请求中提取客户端 IP
 */
export function getClientIP(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  const realIP = request.headers.get('x-real-ip');
  if (realIP) {
    return realIP.trim();
  }
  return 'unknown';
}
