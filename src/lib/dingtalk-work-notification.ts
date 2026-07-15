import { getDingTalkConfig } from '@/lib/dingtalk-config';
import { callDingTalkApi } from '@/lib/dingtalk-service';
import { type NotificationParams } from '@/lib/dingtalk';

type Severity = NotificationParams['severity'];

export interface DingTalkWorkNotificationResult {
  success: boolean;
  sentUserIds: string[];
  failedUserIds: string[];
  errmsg?: string;
  missingConfig?: boolean;
}

interface DingTalkAsyncSendResponse {
  errcode?: number;
  errmsg?: string;
  task_id?: number;
  request_id?: string;
}

function getSeverityLabel(severity: Severity) {
  if (severity === 'danger') return '紧急';
  if (severity === 'warning') return '重要';
  return '通知';
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export function isDingTalkWorkNotificationConfigured() {
  const config = getDingTalkConfig();
  return Boolean(config?.appKey && config?.appSecret && config?.agentId);
}

export function formatDingTalkWorkText(params: NotificationParams) {
  const lines = [
    `【${getSeverityLabel(params.severity)}】${params.title}`,
    params.projectName ? `项目：${params.projectName}` : '',
    '',
    params.content,
    '',
    ...(params.extra
      ? Object.entries(params.extra).map(([key, value]) => `${key}：${value}`)
      : []),
    `时间：${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`,
  ].filter((line) => line !== '');

  return lines.join('\n').slice(0, 4900);
}

export async function sendDingTalkWorkNotification(
  userIds: string[],
  params: NotificationParams
): Promise<DingTalkWorkNotificationResult> {
  const config = getDingTalkConfig();
  const uniqueUserIds = Array.from(new Set(userIds.map((id) => String(id).trim()).filter(Boolean)));

  if (uniqueUserIds.length === 0) {
    return { success: false, sentUserIds: [], failedUserIds: [], errmsg: '没有可推送的钉钉用户' };
  }

  if (!config?.appKey || !config.appSecret || !config.agentId) {
    return {
      success: false,
      sentUserIds: [],
      failedUserIds: uniqueUserIds,
      errmsg: '钉钉企业内部应用未完整配置，缺少 AppKey、AppSecret 或 AgentId',
      missingConfig: true,
    };
  }

  const agentId = Number(config.agentId);
  if (!Number.isFinite(agentId)) {
    return {
      success: false,
      sentUserIds: [],
      failedUserIds: uniqueUserIds,
      errmsg: 'DINGTALK_AGENT_ID 必须是数字',
      missingConfig: true,
    };
  }

  const text = formatDingTalkWorkText(params);
  const sentUserIds: string[] = [];
  const failedUserIds: string[] = [];
  let lastError = '';

  for (const group of chunk(uniqueUserIds, 100)) {
    const result = await callDingTalkApi<DingTalkAsyncSendResponse>(
      '/topapi/message/corpconversation/asyncsend_v2',
      {
        method: 'POST',
        body: {
          agent_id: agentId,
          userid_list: group.join(','),
          msg: {
            msgtype: 'text',
            text: { content: text },
          },
        },
      }
    );

    if (result.success) {
      sentUserIds.push(...group);
    } else {
      failedUserIds.push(...group);
      lastError = result.errmsg || '钉钉工作通知发送失败';
    }
  }

  return {
    success: sentUserIds.length > 0,
    sentUserIds,
    failedUserIds,
    errmsg: failedUserIds.length > 0 ? lastError : undefined,
  };
}
