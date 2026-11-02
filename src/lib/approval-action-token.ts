import crypto from 'node:crypto';

/**
 * 审批快捷操作链接（用于钉钉卡片按钮"通过/驳回"）
 *
 * 为什么用签名链接：钉钉互动卡片模板需要后台配置，普通工作通知卡片按钮只能跳转。
 * 这里生成带签名的 URL，钉钉里点一下即可打开「快捷审批页」，登录后自动执行审批。
 *
 * 安全：
 * - HMAC-SHA256 签名，密钥取 APPROVAL_LINK_SECRET（推荐）→ DINGTALK_APP_SECRET → SUPABASE_SERVICE_ROLE_KEY
 * - 带过期时间（默认 72 小时）
 * - 打开后仍要求登录，并在服务端校验「是老板/超管或该单据指定审批人」
 */

export type ApprovalActionType = 'team_settlement' | 'monthly_report';
export type ApprovalAction = 'approve' | 'reject';

function getSecret(): string | null {
  const secret = String(
    process.env.APPROVAL_LINK_SECRET
    || process.env.DINGTALK_APP_SECRET
    || process.env.SUPABASE_SERVICE_ROLE_KEY
    || '',
  ).trim();
  // 不允许使用可猜测的默认值：没有密钥时直接拒绝生成/校验，避免伪造审批链接
  return secret.length >= 16 ? secret : null;
}

export function getAppBaseUrl(): string {
  const raw = String(process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'https://sxshhy.top').trim();
  return raw.replace(/\/+$/, '');
}

function sign(payload: string): string | null {
  const secret = getSecret();
  if (!secret) return null;
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

export function createApprovalActionUrl(params: {
  type: ApprovalActionType;
  id: number;
  action: ApprovalAction;
  hours?: number;
  /** 月报用：归属月份 YYYY-MM */
  month?: string;
  /** 月报用：项目范围 all | 项目ID */
  scope?: string;
}): string {
  const payload = {
    t: params.type,
    i: Number(params.id),
    a: params.action,
    e: Date.now() + (params.hours ?? 72) * 60 * 60 * 1000,
    ...(params.month ? { m: params.month } : {}),
    ...(params.scope ? { s: params.scope } : {}),
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = sign(body);
  if (!signature) return '';
  const token = `${body}.${signature}`;
  return `${getAppBaseUrl()}/api/approvals/quick-action?token=${encodeURIComponent(token)}`;
}

export function verifyApprovalActionToken(token: string): {
  ok: boolean;
  type?: ApprovalActionType;
  id?: number;
  action?: ApprovalAction;
  month?: string;
  scope?: string;
  reason?: string;
} {
  const raw = String(token || '');
  const [body, signature] = raw.split('.');
  if (!body || !signature) return { ok: false, reason: '链接格式不正确' };
  const expected = sign(body);
  if (!expected) return { ok: false, reason: '审批链接密钥未配置，请到系统中处理' };
  if (expected.length !== signature.length
    || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) {
    return { ok: false, reason: '链接签名校验失败' };
  }
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as {
      t?: ApprovalActionType; i?: number; a?: ApprovalAction; e?: number; m?: string; s?: string;
    };
    if (!payload.e || payload.e < Date.now()) return { ok: false, reason: '链接已过期，请到系统中处理' };
    if (!payload.t || !payload.i || !payload.a) return { ok: false, reason: '链接参数不完整' };
    return {
      ok: true,
      type: payload.t,
      id: Number(payload.i),
      action: payload.a,
      month: payload.m,
      scope: payload.s,
    };
  } catch {
    return { ok: false, reason: '链接内容无法解析' };
  }
}
