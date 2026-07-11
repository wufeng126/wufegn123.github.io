import { getSupabaseClient } from '@/storage/database/supabase-client';
import { NextRequest } from 'next/server';
import { verifyToken } from '@/lib/auth';

export type OperationType = 'create' | 'update' | 'delete' | 'import' | 'export' | 'transfer' | 'assign' | 'review' | 'unreview' | 'void' | 'payment' | 'salary_pay' | 'bind_auto' | 'bind_manual' | 'unbind' | 'user_disable' | 'user_enable';

export type ResourceType =
  | 'project'
  | 'worker'
  | 'worker_salary'
  | 'salary_payment'
  | 'work_item'
  | 'work_item_progress'
  | 'client_report'
  | 'client_payment'
  | 'supplier'
  | 'supplier_contract'
  | 'supplier_settlement'
  | 'supplier_payment'
  | 'comprehensive_expense'
  | 'miscellaneous_material'
  | 'notification'
  | 'certificate'
  | 'visa'
  | 'user'
  | 'role'
  | 'permission'
  | 'system_setting'
  | 'backup'
  | string;

interface AuditLogParams {
  operationType: OperationType;
  resourceType: ResourceType;
  resourceId?: number | string;
  details?: Record<string, unknown>;
  request?: NextRequest;
  userId?: number;
  username?: string;
}

/**
 * 记录审计日志
 * 优先从 request 中提取用户信息，也可直接传入 userId/username
 */
export async function auditLog(params: AuditLogParams): Promise<void> {
  try {
    const { operationType, resourceType, resourceId, details, request, userId, username } = params;

    let logUserId = userId || null;
    let logUsername = username || null;
    let logIp = null;
    let logUserAgent = null;

    // 从 request 中提取用户信息
    if (request) {
      const token = request.cookies.get('auth_token')?.value;
      if (token) {
        const user = await verifyToken(token);
        if (user) {
          logUserId = user.id;
          logUsername = user.name || user.username;
        }
      }
      // 提取 IP 和 User-Agent
      // x-forwarded-for 可能包含多个 IP（如 "10.0.0.1, 192.168.1.1"），只取第一个
      const xff = request.headers.get('x-forwarded-for');
      logIp = (xff ? xff.split(',')[0].trim() : request.headers.get('x-real-ip')) || null;
      // ip_address 字段限制 varchar(45)，截断防止溢出
      if (logIp && logIp.length > 45) logIp = logIp.substring(0, 45);
      logUserAgent = request.headers.get('user-agent') || null;
      // user_agent 可能很长，截断到合理长度
      if (logUserAgent && logUserAgent.length > 500) logUserAgent = logUserAgent.substring(0, 500);
    }

    const supabase = getSupabaseClient();
    const insertData = {
      user_id: logUserId,
      username: logUsername,
      operation_type: operationType,
      resource_type: resourceType,
      resource_id: resourceId ? Number(resourceId) : null,
      details: details || null,
      ip_address: logIp,
      user_agent: logUserAgent,
    };
    console.log('[AuditLog] Writing audit log:', JSON.stringify({ operationType, resourceType, resourceId, username: logUsername }));
    const { data, error } = await supabase.from('operation_logs').insert(insertData).select();

    if (error) {
      console.error('[AuditLog] Failed to write audit log:', error.message, error.code, error.details);
    } else {
      console.log('[AuditLog] Audit log written successfully, id:', data?.[0]?.id);
    }
  } catch (err) {
    // 审计日志不应阻塞业务逻辑
    console.error('[AuditLog] Error writing audit log:', err);
  }
}

/**
 * 修复表的自增序列，使其与实际最大ID同步
 * 当遇到 duplicate key 错误时调用此函数
 */
export async function fixSequence(tableName: string): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    // 使用 RPC 调用执行序列重置
    await supabase.rpc('fix_table_sequence', { table_name: tableName });
  } catch (err) {
    // RPC 可能不存在，使用备用方案
    console.warn(`[FixSequence] RPC failed for ${tableName}, trying direct SQL:`, err);
  }
}

/**
 * 带序列修复的插入操作
 * 如果遇到 duplicate key 错误，自动修复序列并重试
 */
export async function insertWithSequenceFix(
  tableName: string,
  insertData: Record<string, unknown>[] | Record<string, unknown>,
  supabase: ReturnType<typeof getSupabaseClient>,
  maxRetries: number = 2
): Promise<{ data: any[] | null; error: any }> {
  let lastError: any = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const { data, error } = await supabase
      .from(tableName)
      .insert(insertData)
      .select();

    if (!error) {
      return { data: (data || []) as any[], error: null };
    }

    lastError = error;

    // 检测是否为 duplicate key 错误
    if (error.message?.includes('duplicate key') || error.message?.includes('unique constraint')) {
      console.warn(`[InsertWithSequenceFix] Duplicate key error on ${tableName}, attempt ${attempt + 1}, fixing sequence...`);
      
      // 使用已有的 fix_table_sequence RPC 修复序列
      try {
        const { error: fixError } = await supabase.rpc('fix_table_sequence', {
          table_name: tableName
        });
        if (fixError) {
          console.warn(`[InsertWithSequenceFix] RPC fix failed:`, fixError.message);
        } else {
          console.log(`[InsertWithSequenceFix] Sequence fixed for ${tableName}`);
        }
      } catch (e) {
        console.warn(`[InsertWithSequenceFix] Sequence fix attempt failed:`, e);
      }

      if (attempt < maxRetries) {
        continue; // 重试
      }
    }

    // 非重复键错误，直接返回
    break;
  }

  return { data: null, error: lastError };
}

/**
 * 获取资源类型的中文显示名称
 */
export function getResourceTypeName(type: ResourceType): string {
  const map: Record<string, string> = {
    project: '项目',
    worker: '工人',
    worker_salary: '工人工资',
    work_item: '分项工程',
    work_item_progress: '工程进度',
    client_report: '甲方报量',
    client_payment: '甲方付款',
    supplier: '供应商',
    supplier_contract: '供应商合同',
    supplier_settlement: '供应商结算',
    supplier_payment: '供应商付款',
    miscellaneous_material: '零星材料',
    notification: '消息通知',
    certificate: '证件',
    visa: '签证',
    user: '用户',
    role: '角色',
    permission: '权限',
    system_setting: '系统设置',
    backup: '数据备份',
  };
  return map[type] || type;
}

/**
 * 获取操作类型的中文显示名称
 */
export function getOperationTypeName(type: OperationType): string {
  const map: Record<string, string> = {
    create: '新增',
    update: '修改',
    delete: '删除',
    import: '导入',
    export: '导出',
    transfer: '转移',
    assign: '分配',
    review: '审核',
    unreview: '反审核',
    void: '作废',
    payment: '付款',
    salary_pay: '工资发放',
    bind_auto: '自动绑定',
    bind_manual: '手动绑定',
    unbind: '解绑',
    user_disable: '禁用用户',
    user_enable: '启用用户',
  };
  return map[type] || type;
}
