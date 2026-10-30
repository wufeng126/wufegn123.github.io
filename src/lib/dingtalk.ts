/**
 * 钉钉消息推送工具
 * 支持通过 Webhook 地址向钉钉群发送消息
 * 使用自定义机器人 Webhook（加签安全模式）
 */

import * as crypto from 'crypto';
import { getNotificationRouteRule } from '@/lib/notification-routing';
import { toAbsoluteNotificationHref } from '@/lib/notification-link';

// 钉钉消息签名（加签模式）
function sign(secret: string): { timestamp: string; sign: string } {
  const timestamp = Date.now().toString();
  const stringToSign = `${timestamp}\n${secret}`;
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(stringToSign);
  const sign = encodeURIComponent(hmac.digest('base64'));
  return { timestamp, sign };
}

// 钉钉文本消息
interface DingTalkTextMessage {
  msgtype: 'text';
  text: { content: string };
}

// 钉钉 Markdown 消息
interface DingTalkMarkdownMessage {
  msgtype: 'markdown';
  markdown: { title: string; text: string };
}

// 钉钉 ActionCard 卡片（群机器人，带跳转按钮）
interface DingTalkActionCardMessage {
  msgtype: 'actionCard';
  actionCard: {
    title: string;
    text: string;
    btnOrientation?: '0' | '1';
    btns?: Array<{ title: string; actionURL: string }>;
  };
}

type DingTalkMessage = DingTalkTextMessage | DingTalkMarkdownMessage | DingTalkActionCardMessage;

/**
 * 发送钉钉消息
 * @param webhookUrl Webhook 地址（不含加签参数）
 * @param secret 加签密钥（可选，不填则不加签）
 * @param message 消息内容
 */
export async function sendDingTalkMessage(
  webhookUrl: string,
  secret: string | undefined,
  message: DingTalkMessage
): Promise<{ success: boolean; errcode?: number; errmsg?: string }> {
  try {
    let url = webhookUrl;
    if (secret) {
      const { timestamp, sign: signStr } = sign(secret);
      const separator = webhookUrl.includes('?') ? '&' : '?';
      url = `${webhookUrl}${separator}timestamp=${timestamp}&sign=${signStr}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });

    const data = await response.json();
    if (data.errcode === 0) {
      return { success: true };
    }
    console.error('[DingTalk] Send failed:', data);
    return { success: false, errcode: data.errcode, errmsg: data.errmsg };
  } catch (error) {
    console.error('[DingTalk] Send error:', error);
    return { success: false, errmsg: String(error) };
  }
}

/**
 * 发送 Markdown 格式的钉钉通知
 * @param webhookUrl Webhook 地址
 * @param secret 加签密钥
 * @param title 消息标题
 * @param content Markdown 内容
 */
export async function sendDingTalkNotification(
  webhookUrl: string,
  secret: string | undefined,
  title: string,
  content: string
): Promise<{ success: boolean; errcode?: number; errmsg?: string }> {
  return sendDingTalkMessage(webhookUrl, secret, {
    msgtype: 'markdown',
    markdown: { title, text: content },
  });
}

/**
 * 发送纯文本钉钉通知
 */
export async function sendDingTalkText(
  webhookUrl: string,
  secret: string | undefined,
  text: string
): Promise<{ success: boolean; errcode?: number; errmsg?: string }> {
  return sendDingTalkMessage(webhookUrl, secret, {
    msgtype: 'text',
    text: { content: text },
  });
}

/**
 * 发送 ActionCard 卡片消息（群机器人，带跳转按钮）
 */
export async function sendDingTalkActionCard(
  webhookUrl: string,
  secret: string | undefined,
  params: { title: string; markdown: string; buttonText?: string; buttonUrl?: string }
): Promise<{ success: boolean; errcode?: number; errmsg?: string }> {
  const btn =
    params.buttonText && params.buttonUrl
      ? [{ title: params.buttonText, actionURL: params.buttonUrl }]
      : undefined;
  return sendDingTalkMessage(webhookUrl, secret, {
    msgtype: 'actionCard',
    actionCard: {
      title: params.title,
      text: params.markdown,
      btnOrientation: '0',
      ...(btn ? { btns: btn } : {}),
    },
  });
}

// ===== 通知类型模板 =====

export interface NotificationParams {
  type: string;
  title: string;
  content: string;
  severity: 'info' | 'warning' | 'danger';
  projectName?: string;
  extra?: Record<string, string>;
}

function getSeverityLabel(severity: NotificationParams['severity']) {
  if (severity === 'danger') return '严重';
  if (severity === 'warning') return '警告';
  return '普通';
}

function compactMessageText(value: string, maxLength = 180) {
  const text = value.replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function normalizeTitle(categoryLabel: string, title: string) {
  const cleanTitle = title.replace(/^【[^】]+】/, '').trim();
  return `【${categoryLabel}】${cleanTitle}`;
}

function getFallbackCategoryLabel(severity: NotificationParams['severity']) {
  if (severity === 'danger' || severity === 'warning') return '风险';
  return '通知';
}

/**
 * 根据通知类型生成钉钉 Markdown 内容
 */
export function formatDingTalkMessage(params: NotificationParams): { title: string; text: string } {
  const { type, title, content, severity, projectName, extra } = params;
  const routeRule = getNotificationRouteRule(type);
  const categoryLabel = extra?.消息分类 || routeRule?.categoryLabel || getFallbackCategoryLabel(severity);
  const messageTitle = normalizeTitle(categoryLabel, title);
  const severityLabel = getSeverityLabel(severity);
  const summary = extra?.业务摘要 || compactMessageText(content);
  const responsibility = extra?.责任人 || extra?.提醒对象 || routeRule?.target || '';
  const actionLabel = extra?.建议动作 || routeRule?.actionLabel || '';
  const actionHref = toAbsoluteNotificationHref(extra?.处理入口 || routeRule?.href || '');
  const amount = extra?.金额 || '';

  const severityEmoji = severity === 'danger' ? '❗' : severity === 'warning' ? '⚠️' : 'ℹ️';
  let md = `**${severityEmoji} ${messageTitle}**\n\n`;
  md += `${summary}\n\n`;

  if (projectName) {
    md += `**项目**：${projectName}\n`;
  }
  if (amount) {
    md += `**金额**：${amount}\n`;
  }

  const compactContent = compactMessageText(content, 300);
  if (compactContent && compactContent !== summary) {
    md += `\n${compactContent}\n`;
  }

  md += `\n> ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`;

  return { title: messageTitle, text: md };
}

// ===== 业务通知快捷方法 =====

/** 新增结算通知 */
export function formatSettlementNotification(data: {
  projectName: string;
  contractName: string;
  settlementAmount: string;
  operator?: string;
}): NotificationParams {
  return {
    type: 'new_settlement',
    title: '新增结算记录',
    content: `供应商合同 ${data.contractName} 新增结算，金额：${data.settlementAmount} 元`,
    severity: 'info',
    projectName: data.projectName,
    extra: data.operator ? { 操作人: data.operator } : undefined,
  };
}

/** 新增工资发放通知 */
export function formatSalaryNotification(data: {
  projectName: string;
  yearMonth: string;
  totalAmount: string;
  workerCount?: number;
  operator?: string;
}): NotificationParams {
  return {
    type: 'new_salary',
    title: '新增工资发放',
    content: `${data.yearMonth} 工资已发放，总金额：${data.totalAmount} 元${data.workerCount ? `，共 ${data.workerCount} 人` : ''}`,
    severity: 'info',
    projectName: data.projectName,
    extra: data.operator ? { 操作人: data.operator } : undefined,
  };
}

/** 新增甲方回款通知 */
export function formatClientPaymentNotification(data: {
  projectName: string;
  paymentAmount: string;
  paymentDate?: string;
  paymentMethod?: string;
  operator?: string;
}): NotificationParams {
  return {
    type: 'new_client_payment',
    title: '新增甲方回款',
    content: `收到甲方回款 ${data.paymentAmount} 元${data.paymentDate ? `，日期：${data.paymentDate}` : ''}`,
    severity: 'info',
    projectName: data.projectName,
    extra: {
      ...(data.paymentMethod ? { 付款方式: data.paymentMethod } : {}),
      ...(data.operator ? { 操作人: data.operator } : {}),
    },
  };
}

/** 新增甲方报量通知 */
export function formatClientReportNotification(data: {
  projectName: string;
  reportAmount: string;
  reportDate?: string;
  operator?: string;
}): NotificationParams {
  return {
    type: 'new_report',
    title: '新增甲方报量',
    content: `新增甲方报量 ${data.reportAmount} 元${data.reportDate ? `，日期：${data.reportDate}` : ''}`,
    severity: 'info',
    projectName: data.projectName,
    extra: data.operator ? { 操作人: data.operator } : undefined,
  };
}

/** 新增供应商付款通知 */
export function formatSupplierPaymentNotification(data: {
  projectName: string;
  supplierName: string;
  paymentAmount: string;
  operator?: string;
}): NotificationParams {
  return {
    type: 'new_supplier_payment',
    title: '新增供应商付款',
    content: `向供应商 ${data.supplierName} 支付 ${data.paymentAmount} 元`,
    severity: 'info',
    projectName: data.projectName,
    extra: data.operator ? { 操作人: data.operator } : undefined,
  };
}

/** 新增工人入场通知 */
export function formatNewWorkerNotification(data: {
  projectName: string;
  workerName: string;
  workType?: string;
  operator?: string;
}): NotificationParams {
  return {
    type: 'new_worker',
    title: '新增工人入场',
    content: `工人 ${data.workerName}${data.workType ? `（${data.workType}）` : ''} 已加入项目`,
    severity: 'info',
    projectName: data.projectName,
    extra: data.operator ? { 操作人: data.operator } : undefined,
  };
}

/** 成本预警通知 */
export function formatCostWarningNotification(data: {
  projectName: string;
  warningType: string;
  detail: string;
}): NotificationParams {
  return {
    type: 'cost_warning',
    title: `成本预警 - ${data.warningType}`,
    content: data.detail,
    severity: 'danger',
    projectName: data.projectName,
  };
}

/** 证件到期通知 */
export function formatCertificateExpiryNotification(data: {
  projectName?: string;
  certName: string;
  daysLeft: number;
  holderName?: string;
}): NotificationParams {
  const isExpired = data.daysLeft <= 0;
  const severity = isExpired ? 'danger' : data.daysLeft <= 7 ? 'danger' : data.daysLeft <= 15 ? 'warning' : 'info';
  const timeDesc = isExpired ? '已过期' : `还剩 ${data.daysLeft} 天`;

  return {
    type: isExpired ? 'certificate_expired' : `certificate_expiry_${data.daysLeft <= 7 ? '7' : data.daysLeft <= 15 ? '15' : '30'}`,
    title: `证件${isExpired ? '已过期' : '即将到期'}`,
    content: `${data.holderName ? data.holderName + ' 的' : ''}${data.certName} ${timeDesc}`,
    severity,
    projectName: data.projectName,
  };
}
