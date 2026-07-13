/**
 * 钉钉企业内部应用配置模块
 * 所有敏感信息（AppSecret 等）仅在服务端使用，绝不返回给前端
 */

/** 钉钉企业内部应用配置 */
export interface DingTalkAppConfig {
  /** 企业内部应用的 AppKey */
  appKey: string;
  /** 企业内部应用的 AppSecret（仅服务端） */
  appSecret: string;
  /** 应用 AgentId，用于发工作通知 */
  agentId: string;
  /** 企业 CorpId */
  corpId: string;
  /** 回调 Token（用于事件订阅验签） */
  callbackToken: string;
  /** 回调 AES Key（用于事件订阅数据解密） */
  callbackAesKey: string;
}

/**
 * 从环境变量读取钉钉配置
 * 所有 AppSecret 只在服务端环境变量中存放，不暴露给前端
 */
export function getDingTalkConfig(): DingTalkAppConfig | null {
  const appKey = process.env.DINGTALK_APP_KEY?.trim();
  const appSecret = process.env.DINGTALK_APP_SECRET?.trim();
  const agentId = process.env.DINGTALK_AGENT_ID?.trim();
  const corpId = process.env.DINGTALK_CORP_ID?.trim();
  const callbackToken = process.env.DINGTALK_CALLBACK_TOKEN?.trim();
  const callbackAesKey = process.env.DINGTALK_CALLBACK_AES_KEY?.trim();

  // AppKey 和 AppSecret 是必需的，缺失则视为未配置
  if (!appKey || !appSecret) {
    return null;
  }

  return {
    appKey,
    appSecret,
    agentId: agentId || '',
    corpId: corpId || '',
    callbackToken: callbackToken || '',
    callbackAesKey: callbackAesKey || '',
  };
}

/**
 * 检查钉钉企业内部应用是否已配置
 */
export function isDingTalkConfigured(): boolean {
  return getDingTalkConfig() !== null;
}

/**
 * 检查钉钉免登所需配置是否完整
 * 获取 authCode 必须使用 CorpId，仅配置 AppKey/AppSecret 还不足以完成免登。
 */
export function isDingTalkSsoConfigured(): boolean {
  const config = getDingTalkConfig();
  return !!(config?.appKey && config?.appSecret && config?.corpId);
}

/**
 * 获取脱敏配置（可安全返回给前端）
 * 所有敏感字段用 * 遮盖
 */
export function getDingTalkConfigMasked(): Record<string, string | boolean> {
  const config = getDingTalkConfig();
  if (!config) {
    return { configured: false };
  }

  return {
    configured: true,
    appKey: maskSecret(config.appKey, 4),
    appSecret: '******',
    agentId: config.agentId || '(未配置)',
    corpId: config.corpId ? maskSecret(config.corpId, 4) : '(未配置)',
    callbackToken: config.callbackToken ? '******' : '(未配置)',
    callbackAesKey: config.callbackAesKey ? '******' : '(未配置)',
  };
}

/** 对字符串做脱敏处理，保留前 n 位明文 */
function maskSecret(value: string, keepFirst: number): string {
  if (value.length <= keepFirst) return '******';
  return value.slice(0, keepFirst) + '******';
}
