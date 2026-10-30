/**
 * 钉钉互动卡片（interactiveCard）—— 支持按钮真回调的审批卡片
 *
 * 与「消息卡片 actionCard」的区别：actionCard 按钮只能跳转；interactiveCard 按钮可「回传请求」，
 * 用户点按钮后钉钉直接 POST 回调地址，后端可回写系统状态并同步更新卡片。
 *
 * 相关钉钉接口：
 * - 发送：POST https://api.dingtalk.com/v1.0/im/interactiveCards/instances（header 传 access_token）
 * - 注册回调地址：POST /topapi/im/chat/scencegroup/interactivecard/callback/register（oapi，query 传 token）
 * - 回调验签：Header x-ddpaas-signature-timestamp + x-ddpaas-signature
 *   签名 = Base64(HmacSHA256(api_secret, timestamp))
 */
import crypto from 'node:crypto';
import { callDingTalkApi, getAccessToken } from '@/lib/dingtalk-service';

export interface DingTalkCardConfig {
  /** 卡片模板 ID（钉钉卡片搭建平台发布后生成） */
  templateId: string;
  /** 回调签名密钥（注册回调地址时提供的 api_secret） */
  callbackSecret: string;
  /** 回调地址（公网 HTTPS） */
  callbackUrl: string;
  /** 回调路由 Key（可选，多回调地址时区分） */
  routeKey: string;
}

export function getDingTalkCardConfig(): DingTalkCardConfig {
  return {
    templateId: process.env.DINGTALK_CARD_TEMPLATE_ID?.trim() || '',
    callbackSecret: process.env.DINGTALK_CARD_CALLBACK_SECRET?.trim() || '',
    callbackUrl: process.env.DINGTALK_CARD_CALLBACK_URL?.trim() || '',
    routeKey: process.env.DINGTALK_CARD_ROUTE_KEY?.trim() || '',
  };
}

/** 是否已配置互动卡片（缺模板 ID 视为未配置，自动回退现有工作通知） */
export function isDingTalkCardConfigured(): boolean {
  return Boolean(getDingTalkCardConfig().templateId);
}

function formatAmount(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0.00';
  return n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * 注册互动卡片回调地址（幂等）。
 * 钉钉要求先注册回调地址，卡片回调才会打到我们的服务端。
 */
export async function registerDingTalkCardCallback(
  forceUpdate = false,
): Promise<{ success: boolean; message: string }> {
  const config = getDingTalkCardConfig();
  if (!config.callbackUrl) {
    return { success: false, message: '缺少 DINGTALK_CARD_CALLBACK_URL（回调地址）' };
  }
  const body: Record<string, unknown> = { callback_url: config.callbackUrl };
  if (config.callbackSecret) body.api_secret = config.callbackSecret;
  if (config.routeKey) body.callbackRouteKey = config.routeKey;
  if (forceUpdate) body.forceUpdate = true;

  const result = await callDingTalkApi<unknown>(
    '/topapi/im/chat/scencegroup/interactivecard/callback/register',
    { method: 'POST', body },
  );
  if (!result.success) {
    return { success: false, message: result.errmsg || '注册回调地址失败' };
  }
  return { success: true, message: '回调地址注册成功' };
}

/**
 * 发送「班组结算待审批」互动卡片（单聊，逐个审批人发送）。
 * outTrackId = team_settlement_{结算单ID}，回调时据此定位结算单。
 */
export async function sendTeamSettlementApprovalCard(params: {
  settlementId: number;
  settlementNo?: string | null;
  projectName?: string | null;
  teamName?: string | null;
  month: string;
  amount?: number | null;
  receiverUserIds: string[];
}): Promise<{ success: boolean; sent: number; message?: string }> {
  const config = getDingTalkCardConfig();
  if (!config.templateId) {
    return { success: false, sent: 0, message: '未配置 DINGTALK_CARD_TEMPLATE_ID' };
  }
  const receivers = Array.from(new Set((params.receiverUserIds || []).filter(Boolean)));
  if (receivers.length === 0) {
    return { success: false, sent: 0, message: '没有可接收的钉钉用户（请确认老板账号已绑定钉钉）' };
  }

  let accessToken: string;
  try {
    accessToken = await getAccessToken();
  } catch (error) {
    return {
      success: false,
      sent: 0,
      message: error instanceof Error ? error.message : '获取钉钉 access_token 失败',
    };
  }

  const cardParamMap = {
    settlementNo: String(params.settlementNo || `#${params.settlementId}`),
    projectName: String(params.projectName || '-'),
    teamName: String(params.teamName || '-'),
    month: String(params.month || ''),
    amount: formatAmount(params.amount),
    statusText: '待审批',
  };

  let sent = 0;
  for (const userId of receivers) {
    try {
      const response = await fetch('https://api.dingtalk.com/v1.0/im/interactiveCards/instances', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-acs-dingtalk-access-token': accessToken,
        },
        body: JSON.stringify({
          cardTemplateId: config.templateId,
          outTrackId: `team_settlement_${params.settlementId}`,
          receiverUserIdList: [userId],
          conversationType: 0,
          ...(config.routeKey ? { callbackRouteKey: config.routeKey } : {}),
          cardData: { cardParamMap },
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (response.ok && !json?.code) {
        sent += 1;
      } else {
        console.warn('[dingtalk-card] 卡片发送失败', { userId, json });
      }
    } catch (error) {
      console.warn('[dingtalk-card] 卡片发送异常', userId, error);
    }
  }

  return { success: sent > 0, sent };
}

/** 是否已配置日报互动卡片模板 */
export function isDingTalkDailyCardConfigured(): boolean {
  return Boolean(process.env.DINGTALK_CARD_DAILY_TEMPLATE_ID?.trim());
}

/**
 * 发送「项目日报」互动卡片（逐个员工单聊发送）。
 * outTrackId = daily_report_{日报ID}，回调时据此标记已阅。
 */
export async function sendDailyReportCard(params: {
  reportId: number;
  reportDate: string;
  projectCount: number;
  headcount: number;
  riskCount: number;
  highlights: string[];
  receiverUserIds: string[];
}): Promise<{ success: boolean; sent: number; message?: string }> {
  const config = getDingTalkCardConfig();
  const templateId = process.env.DINGTALK_CARD_DAILY_TEMPLATE_ID?.trim();
  if (!templateId) {
    return { success: false, sent: 0, message: '未配置 DINGTALK_CARD_DAILY_TEMPLATE_ID' };
  }
  const receivers = Array.from(new Set((params.receiverUserIds || []).filter(Boolean)));
  if (receivers.length === 0) {
    return { success: false, sent: 0, message: '没有可接收的钉钉用户' };
  }

  let accessToken: string;
  try {
    accessToken = await getAccessToken();
  } catch (error) {
    return {
      success: false,
      sent: 0,
      message: error instanceof Error ? error.message : '获取钉钉 access_token 失败',
    };
  }

  const highlightsText = (params.highlights || [])
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, 3)
    .join('\n') || '当日无重点事项';
  const markdown = [
    `**${params.reportDate} 共 ${params.projectCount} 个项目有日志，出勤 ${params.headcount} 人，风险 ${params.riskCount} 条**`,
    '',
    '**今日重点**',
    highlightsText,
  ].join('\n');
  const cardParamMap = {
    title: `项目日报 ${params.reportDate}`,
    tag: '项目日报',
    markdown,
    statusText: '待查看',
  };

  let sent = 0;
  let lastError = '';
  for (const userId of receivers) {
    try {
      const response = await fetch('https://api.dingtalk.com/v1.0/im/interactiveCards/instances', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-acs-dingtalk-access-token': accessToken,
        },
        body: JSON.stringify({
          cardTemplateId: templateId,
          outTrackId: `daily_report_${params.reportId}`,
          receiverUserIdList: [userId],
          conversationType: 0,
          ...(config.routeKey ? { callbackRouteKey: config.routeKey } : {}),
          cardData: { cardParamMap },
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (response.ok && !json?.code) {
        sent += 1;
      } else {
        lastError = String(
          json?.message || json?.code || `HTTP ${response.status}`,
        );
        console.warn('[dingtalk-card] 日报卡片发送失败', { userId, json });
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : '请求异常';
      console.warn('[dingtalk-card] 日报卡片发送异常', userId, error);
    }
  }

  return {
    success: sent > 0,
    sent,
    message: sent > 0 ? undefined : (lastError || '卡片发送失败'),
  };
}

/**
 * 回调验签：x-ddpaas-signature = Base64(HmacSHA256(api_secret, x-ddpaas-signature-timestamp))
 *
 * 安全策略：
 * - 未配置回调密钥时拒绝（防止任何人伪造回调篡改审批状态）；开发环境例外。
 * - 校验时间戳有效期（±5 分钟），防止截获旧请求重放。
 */
export function verifyDingTalkCardCallbackSignature(headers: Headers): boolean {
  const secret = getDingTalkCardConfig().callbackSecret;
  if (!secret) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[dingtalk-card] 未配置 DINGTALK_CARD_CALLBACK_SECRET，开发环境跳过验签');
      return true;
    }
    console.warn('[dingtalk-card] 未配置 DINGTALK_CARD_CALLBACK_SECRET，拒绝卡片回调');
    return false;
  }

  const timestamp = headers.get('x-ddpaas-signature-timestamp') || '';
  const signature = headers.get('x-ddpaas-signature') || '';
  if (!timestamp || !signature) return false;

  // 时效校验：timestamp 支持秒/毫秒，超出 ±5 分钟视为重放
  const rawTs = Number(timestamp);
  if (!Number.isFinite(rawTs)) return false;
  const tsMs = rawTs < 1e12 ? rawTs * 1000 : rawTs;
  if (Math.abs(Date.now() - tsMs) > 5 * 60 * 1000) {
    console.warn('[dingtalk-card] 卡片回调时间戳过期（疑似重放）:', timestamp);
    return false;
  }

  const expected = crypto.createHmac('sha256', secret).update(timestamp).digest('base64');
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);
  return (
    expectedBuffer.length === actualBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, actualBuffer)
  );
}

/** 构建回调响应：同步刷新点击人看到的卡片状态（statusText 变量） */
export function buildDingTalkCardUpdate(
  outTrackId: string,
  statusText: string,
): Record<string, unknown> {
  const config = getDingTalkCardConfig();
  if (!config.templateId) return {};
  return {
    cardTemplateId: config.templateId,
    outTrackId,
    cardOptions: { updateCardDataByKey: true, updatePrivateDataByKey: true },
    cardData: { cardParamMap: { statusText } },
  };
}
