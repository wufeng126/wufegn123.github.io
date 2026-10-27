import { getDingTalkConfig } from '@/lib/dingtalk-config';
import { callDingTalkApi, type DingTalkApiResponse } from '@/lib/dingtalk-service';
import { type NotificationParams } from '@/lib/dingtalk';
import { getNotificationRouteRule } from '@/lib/notification-routing';
import { toAbsoluteNotificationHref } from '@/lib/notification-link';

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
  if (severity === 'danger') return '严重';
  if (severity === 'warning') return '警告';
  return '通知';
}

function compactText(value: string, maxLength = 220) {
  const text = value.replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function normalizeTitle(categoryLabel: string, title: string) {
  const cleanTitle = title.replace(/^【[^】]+】/, '').trim();
  return `【${categoryLabel}】${cleanTitle}`;
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
  const routeRule = getNotificationRouteRule(params.type);
  const categoryLabel = params.extra?.消息分类 || routeRule?.categoryLabel || getSeverityLabel(params.severity);
  const summary = params.extra?.业务摘要 || compactText(params.content);
  const responsibility = params.extra?.责任人 || params.extra?.提醒对象 || routeRule?.target || '';
  const actionLabel = params.extra?.建议动作 || routeRule?.actionLabel || '';
  const actionHref = toAbsoluteNotificationHref(params.extra?.处理入口 || routeRule?.href || '');
  const amount = params.extra?.金额 || '';
  const shownKeys = new Set(['消息分类', '业务摘要', '责任人', '提醒对象', '金额', '建议动作', '处理入口']);

  const lines = [
    normalizeTitle(categoryLabel, params.title),
    `摘要：${summary}`,
    `消息分类：${categoryLabel}`,
    `级别：${getSeverityLabel(params.severity)}`,
    params.projectName ? `项目：${params.projectName}` : '',
    amount ? `金额：${amount}` : '',
    responsibility ? `责任人：${responsibility}` : '',
    actionLabel ? `建议动作：${actionLabel}` : '',
    actionHref ? `处理入口：${actionHref}` : '',
    compactText(params.content) !== summary ? `详情：${compactText(params.content, 300)}` : '',
    ...(params.extra
      ? Object.entries(params.extra)
        .filter(([key, value]) => !shownKeys.has(key) && value)
        .map(([key, value]) => `${key}：${value}`)
      : []),
    `时间：${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`,
  ].filter((line) => line !== '');

  return lines.join('\n').slice(0, 4900);
}

// ===== 互动卡片（actionCard）=====

function severityMeta(severity: Severity) {
  if (severity === 'danger') return { icon: '❗', color: '#FF4D4F', label: '严重' };
  if (severity === 'warning') return { icon: '⚠️', color: '#FAAD14', label: '警告' };
  return { icon: 'ℹ️', color: '#1890FF', label: '通知' };
}

/** 把系统内 H5 处理链接包装为钉钉客户端内可跳转的协议链接 */
function toCardActionUrl(href: string) {
  if (!href) return '';
  return `dingtalk://dingtalkclient/page/link?url=${encodeURIComponent(href)}&pc_slide=true`;
}

interface DingTalkActionCardMessage {
  msgtype: 'actionCard';
  actionCard: {
    title: string;
    text: string;
    btnOrientation: '0' | '1';
    btnJSONList: Array<{ title: string; actionURL: string }>;
  };
}

export function formatDingTalkWorkCard(params: NotificationParams): DingTalkActionCardMessage {
  const routeRule = getNotificationRouteRule(params.type);
  const categoryLabel = params.extra?.消息分类 || routeRule?.categoryLabel || getSeverityLabel(params.severity);
  const summary = params.extra?.业务摘要 || compactText(params.content);
  const responsibility = params.extra?.责任人 || params.extra?.提醒对象 || routeRule?.target || '';
  const actionLabel = params.extra?.建议动作 || routeRule?.actionLabel || '查看详情';
  const actionHref = toAbsoluteNotificationHref(params.extra?.处理入口 || routeRule?.href || '');
  const amount = params.extra?.金额 || '';
  const shownKeys = new Set(['消息分类', '业务摘要', '责任人', '提醒对象', '金额', '建议动作', '处理入口']);
  const severity = severityMeta(params.severity);

  const title = normalizeTitle(categoryLabel, params.title);

  // 正文 markdown
  const mdLines = [
    `### ${severity.icon} ${title}`,
    ``,
    `<font color="${severity.color}">**${severity.label}**</font>${
      actionLabel ? `　|　📌 ${actionLabel}` : ''
    }`,
    ``,
    params.projectName ? `🏗️ **项目**：${params.projectName}` : '',
    amount ? `💰 **金额**：${amount}` : '',
    responsibility ? `👤 **责任人**：${responsibility}` : '',
    `🏷️ **消息分类**：${categoryLabel}`,
    ``,
    `📋 **摘要**`,
    summary,
    ``,
    compactText(params.content) !== summary ? `📎 **详情**\n${compactText(params.content, 300)}` : '',
    ...(params.extra
      ? Object.entries(params.extra)
        .filter(([key, value]) => !shownKeys.has(key) && value)
        .map(([key, value]) => `• **${key}**：${value}`)
      : []),
    ``,
    `———`,
    `⏰ ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`,
  ].filter((line) => line !== '');

  const btnJSONList = actionHref ? [{ title: actionLabel, actionURL: toCardActionUrl(actionHref) }] : [];

  return {
    msgtype: 'actionCard',
    actionCard: {
      title,
      text: mdLines.join('\n'),
      btnOrientation: '1',
      btnJSONList,
    },
  };
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
  const useCard = process.env.DINGTALK_CARD_MODE !== 'off';
  const sentUserIds: string[] = [];
  const failedUserIds: string[] = [];
  let lastError = '';

  for (const group of chunk(uniqueUserIds, 100)) {
    let result: DingTalkApiResponse<DingTalkAsyncSendResponse>;

    if (useCard) {
      // 优先发送互动卡片（actionCard + 跳转按钮）
      result = await callDingTalkApi<DingTalkAsyncSendResponse>(
        '/topapi/message/corpconversation/asyncsend_v2',
        {
          method: 'POST',
          body: {
            agent_id: agentId,
            userid_list: group.join(','),
            msg: formatDingTalkWorkCard(params),
          },
        }
      );

      // 卡片发送失败 → 自动回退纯文本，保证通知不丢失
      if (!result.success) {
        lastError = result.errmsg || '互动卡片发送失败，已回退文本';
        result = await callDingTalkApi<DingTalkAsyncSendResponse>(
          '/topapi/message/corpconversation/asyncsend_v2',
          {
            method: 'POST',
            body: {
              agent_id: agentId,
              userid_list: group.join(','),
              msg: { msgtype: 'text', text: { content: text } },
            },
          }
        );
      }
    } else {
      result = await callDingTalkApi<DingTalkAsyncSendResponse>(
        '/topapi/message/corpconversation/asyncsend_v2',
        {
          method: 'POST',
          body: {
            agent_id: agentId,
            userid_list: group.join(','),
            msg: { msgtype: 'text', text: { content: text } },
          },
        }
      );
    }

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
