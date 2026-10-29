import { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/api-auth';
import { apiServerError, apiSuccess, getErrorMessage } from '@/lib/api-utils';
import { isDingTalkCardConfigured, registerDingTalkCardCallback } from '@/lib/dingtalk-card';

/**
 * 注册钉钉互动卡片回调地址（仅超管）。
 * POST /api/dingtalk/card/register?force=1 强制覆盖
 *
 * 前置：环境变量 DINGTALK_CARD_CALLBACK_URL 已配置为公网地址（如 https://sxshhy.top/api/dingtalk/card-callback）
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission(request, 'system:manage');
    if (!auth.ok) return auth.response;

    if (!isDingTalkCardConfigured()) {
      return apiSuccess({
        success: false,
        message: '未配置 DINGTALK_CARD_TEMPLATE_ID，请先在环境变量中配置卡片模板 ID',
      });
    }

    const forceUpdate = request.nextUrl.searchParams.get('force') === '1';
    const result = await registerDingTalkCardCallback(forceUpdate);
    return apiSuccess(result);
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '注册卡片回调地址失败'));
  }
}
