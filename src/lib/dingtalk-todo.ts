import { getAccessToken } from '@/lib/dingtalk-service';
import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * 钉钉待办（Todo）集成
 *
 * 为什么用待办而不是消息：消息一刷就没，待办会一直挂在对方"待办"里，处理完自动完成。
 *
 * 依赖：
 * - 钉钉应用已开通「待办任务」权限
 * - 用户表有 dingtalk_user_id（钉钉 userid），待办 API 需要 unionId，这里自动换取并缓存
 * - 数据表 dingtalk_todo_tasks 记录"业务单据 ↔ 待办任务 ID"，用于处理完成后关闭待办
 *
 * 所有失败都只记日志，不影响审批主流程。
 */

type TodoSourceType = 'team_settlement' | 'monthly_report' | 'visa';

const unionIdCache = new Map<string, { unionId: string; loadedAt: number }>();
const UNION_ID_TTL_MS = 6 * 60 * 60 * 1000;

/** 钉钉 userid → unionId（带 6 小时缓存） */
export async function getUnionIdByDingUserId(dingUserId: string): Promise<string | null> {
  const key = String(dingUserId || '').trim();
  if (!key) return null;
  const cached = unionIdCache.get(key);
  if (cached && Date.now() - cached.loadedAt < UNION_ID_TTL_MS) return cached.unionId;

  try {
    const token = await getAccessToken();
    const res = await fetch(`https://oapi.dingtalk.com/topapi/v2/user/get?access_token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userid: key, language: 'zh_CN' }),
    });
    const json = await res.json().catch(() => ({}));
    const unionId = String(json?.result?.unionid || '');
    if (!unionId) {
      console.warn('[dingtalk-todo] 换取 unionId 失败:', json?.errmsg || json?.message || json);
      return null;
    }
    unionIdCache.set(key, { unionId, loadedAt: Date.now() });
    return unionId;
  } catch (error) {
    console.warn('[dingtalk-todo] 获取 unionId 异常:', error);
    return null;
  }
}

/**
 * 给某个系统用户创建钉钉待办。
 * @param params.userId 系统用户 ID（内部会查 dingtalk_user_id）
 * @param params.sourceType/sourceId 业务单据，用于后续关闭待办
 */
export async function createApprovalTodo(params: {
  userId: number;
  sourceType: TodoSourceType;
  sourceId: number;
  subject: string;
  description?: string;
  detailUrl?: string;
  dueHours?: number;
}): Promise<{ success: boolean; taskId?: string; message?: string }> {
  const userId = Number(params.userId) || 0;
  if (!userId) return { success: false, message: '缺少接收人' };

  try {
    const supabase = getSupabaseClient();
    const { data: userRow } = await supabase
      .from('users')
      .select('id, dingtalk_user_id')
      .eq('id', userId)
      .maybeSingle();
    const dingUserId = String(userRow?.dingtalk_user_id || '').trim();
    if (!dingUserId) return { success: false, message: '该用户未绑定钉钉' };

    const unionId = await getUnionIdByDingUserId(dingUserId);
    if (!unionId) return { success: false, message: '无法获取钉钉 unionId（请检查待办权限/通讯录权限）' };

    const token = await getAccessToken();
    const dueTime = Date.now() + (params.dueHours ?? 48) * 60 * 60 * 1000;
    const description = [params.description, params.detailUrl ? `处理入口：${params.detailUrl}` : '']
      .filter(Boolean)
      .join('\n');

    const res = await fetch(`https://api.dingtalk.com/v1.0/todo/users/${encodeURIComponent(unionId)}/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-acs-dingtalk-access-token': token,
      },
      body: JSON.stringify({
        subject: params.subject.slice(0, 100),
        description,
        dueTime,
        done: false,
        creatorId: unionId,
        executorIds: [unionId],
      }),
    });
    const json = await res.json().catch(() => ({}));
    const taskId = String(json?.id || json?.taskId || '');
    if (!res.ok || !taskId) {
      console.warn('[dingtalk-todo] 创建待办失败:', json);
      return { success: false, message: json?.message || '创建待办失败' };
    }

    // 记录映射，便于处理完成后关闭待办（表缺失时静默跳过，不影响主流程）
    try {
      await supabase.from('dingtalk_todo_tasks').insert({
        source_type: params.sourceType,
        source_id: params.sourceId,
        dingtalk_user_id: dingUserId,
        union_id: unionId,
        task_id: taskId,
        done: false,
      });
    } catch (error) {
      console.warn('[dingtalk-todo] 记录待办映射失败（不影响流程）:', error);
    }

    return { success: true, taskId };
  } catch (error) {
    console.warn('[dingtalk-todo] 创建待办异常:', error);
    return { success: false, message: error instanceof Error ? error.message : '创建待办异常' };
  }
}

/** 单据处理完成后，关闭相关钉钉待办（幂等：已完成的跳过） */
export async function completeApprovalTodo(params: {
  sourceType: TodoSourceType;
  sourceId: number;
}): Promise<{ success: boolean; completed: number }> {
  try {
    const supabase = getSupabaseClient();
    const { data: rows } = await supabase
      .from('dingtalk_todo_tasks')
      .select('id, union_id, task_id, done')
      .eq('source_type', params.sourceType)
      .eq('source_id', params.sourceId)
      .eq('done', false);
    if (!rows || rows.length === 0) return { success: true, completed: 0 };

    const token = await getAccessToken();
    let completed = 0;
    for (const row of rows as Array<{ id: number; union_id: string; task_id: string }>) {
      try {
        const res = await fetch(
          `https://api.dingtalk.com/v1.0/todo/users/${encodeURIComponent(row.union_id)}/tasks/${encodeURIComponent(row.task_id)}`,
          {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'x-acs-dingtalk-access-token': token,
            },
            body: JSON.stringify({ done: true }),
          },
        );
        if (res.ok) {
          completed += 1;
          await supabase.from('dingtalk_todo_tasks').update({ done: true, done_at: new Date().toISOString() }).eq('id', row.id);
        } else {
          const json = await res.json().catch(() => ({}));
          console.warn('[dingtalk-todo] 关闭待办失败:', json);
        }
      } catch (error) {
        console.warn('[dingtalk-todo] 关闭待办异常:', error);
      }
    }
    return { success: true, completed };
  } catch (error) {
    console.warn('[dingtalk-todo] 关闭待办流程异常:', error);
    return { success: false, completed: 0 };
  }
}
