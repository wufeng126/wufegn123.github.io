/**
 * 安全审计日志模块
 * 记录所有安全相关操作：登录、初始化、用户/角色/权限修改、导出、删除、付款等
 */

import { getSupabaseClient } from '@/storage/database/supabase-client';

export interface SecurityLogEntry {
  id?: number;
  event_type: string;
  user_id?: number;
  username?: string;
  ip_address?: string;
  user_agent?: string;
  result: string; // 'success' | 'failed' | 'blocked'
  error_message?: string;
  metadata?: Record<string, unknown>;
  details?: Record<string, unknown>;
  created_at?: string;
}

/**
 * 记录安全事件
 * 写入失败不阻塞主流程，仅控制台警告
 * 同时接受 details 和 metadata 字段，统一写入 metadata 列
 */
export async function logSecurityEvent(log: Omit<SecurityLogEntry, 'id' | 'created_at'>): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from('security_logs')
      .insert({
        event_type: log.event_type,
        user_id: log.user_id || null,
        username: log.username || null,
        ip_address: log.ip_address || null,
        user_agent: log.user_agent || null,
        result: log.result,
        error_message: log.error_message || null,
        metadata: log.details || log.metadata || null,
      });

    if (error) {
      // 安全日志写入失败不应阻塞主流程
      console.warn('[SecurityLog] 写入失败:', error.message);
    }
  } catch (err) {
    console.warn('[SecurityLog] 异常:', err);
  }
}

/**
 * 查询安全日志
 */
export async function querySecurityLogs(options: {
  eventType?: string;
  userId?: number;
  result?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}): Promise<{ data: SecurityLogEntry[]; total: number }> {
  const { eventType, userId, result, startDate, endDate, limit = 50, offset = 0 } = options;

  const supabase = getSupabaseClient();
  let query = supabase
    .from('security_logs')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (eventType) query = query.eq('event_type', eventType);
  if (userId) query = query.eq('user_id', userId);
  if (result) query = query.eq('result', result);
  if (startDate) query = query.gte('created_at', startDate);
  if (endDate) query = query.lte('created_at', endDate);

  const { data, error, count } = await query;

  if (error) {
    console.warn('[SecurityLog] 查询失败:', error.message);
    return { data: [], total: 0 };
  }

  return { data: (data || []) as SecurityLogEntry[], total: count || 0 };
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

/**
 * 从请求中提取 User-Agent
 */
export function getUserAgent(request: Request): string {
  return request.headers.get('user-agent') || 'unknown';
}
