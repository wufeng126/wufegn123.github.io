import { NextRequest } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requirePermission } from '@/lib/api-auth';
import { apiServerError, apiSuccess, getErrorMessage } from '@/lib/api-utils';
import { getDingTalkConfig } from '@/lib/dingtalk-config';
import { isDingTalkWorkNotificationConfigured, sendDingTalkWorkNotification } from '@/lib/dingtalk-work-notification';
import { getNotificationRouteRule } from '@/lib/notification-routing';
import { getUnionIdByDingUserId } from '@/lib/dingtalk-todo';

/**
 * GET/POST /api/dingtalk/self-test
 * 钉钉自检：一次性看清「配置是否完整 / 本人是否绑定 / 消息路由是否存在 / 实际发送返回什么」。
 * 解决"没收到通知、日志也没有"这类无法定位的问题。
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermission(request, 'system:manage');
    if (!auth.ok) return auth.response;

    const supabase = getSupabaseClient();
    const userId = Number(auth.user.id);
    const { data: userRow } = await supabase
      .from('users')
      .select('id, name, role, dingtalk_user_id')
      .eq('id', userId)
      .maybeSingle();

    const config = getDingTalkConfig();
    const dingUserId = String(userRow?.dingtalk_user_id || '').trim();
    const rule = getNotificationRouteRule('team_settlement_approval');

    return apiSuccess({
      config: {
        configured: isDingTalkWorkNotificationConfigured(),
        has_app_key: Boolean(config?.appKey),
        has_app_secret: Boolean(config?.appSecret),
        has_agent_id: Boolean(config?.agentId),
        corp_id: config?.corpId ? `${String(config.corpId).slice(0, 6)}***` : '',
        card_mode_enabled: process.env.DINGTALK_CARD_MODE !== 'off',
        card_template_configured: Boolean(process.env.DINGTALK_CARD_TEMPLATE_ID?.trim()),
      },
      me: {
        id: userId,
        name: userRow?.name || '',
        role: userRow?.role || '',
        dingtalk_bound: Boolean(dingUserId),
        dingtalk_user_id: dingUserId ? `${dingUserId.slice(0, 4)}***` : '',
      },
      routing: {
        team_settlement_approval: rule
          ? { channel: rule.channel, label: rule.label, href: rule.href }
          : null,
      },
      hints: [
        !isDingTalkWorkNotificationConfigured() ? '钉钉应用未配置完整（AppKey/AppSecret/AgentId）→ 收不到任何通知' : '',
        !dingUserId ? '当前账号未绑定钉钉 userid → 无法定向推送' : '',
        !rule ? '通知类型未在路由表中登记 → 不会推送' : '',
      ].filter(Boolean),
    });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '钉钉自检失败'));
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission(request, 'system:manage');
    if (!auth.ok) return auth.response;

    const body = await request.json().catch(() => ({}));
    const action = String(body.action || 'send-test');
    const supabase = getSupabaseClient();
    const userId = Number(auth.user.id);

    const { data: userRow } = await supabase
      .from('users')
      .select('id, name, dingtalk_user_id')
      .eq('id', userId)
      .maybeSingle();
    const dingUserId = String(userRow?.dingtalk_user_id || '').trim();
    if (!dingUserId) {
      return apiSuccess({
        success: false,
        step: 'binding',
        message: '当前账号没有绑定钉钉 userid，请先去「钉钉绑定」绑定后再测',
      });
    }

    if (action === 'check-union-id') {
      const unionId = await getUnionIdByDingUserId(dingUserId);
      return apiSuccess({
        success: Boolean(unionId),
        step: 'union-id',
        message: unionId
          ? `unionId 获取成功（${unionId.slice(0, 6)}***），待办权限基本可用`
          : 'unionId 获取失败：通常是「通讯录个人信息读」权限未开通，或 AppKey/AppSecret 不对',
      });
    }

    // 默认：发送一条测试工作通知
    const result = await sendDingTalkWorkNotification([dingUserId], {
      type: 'team_settlement_approval',
      title: '【测试】钉钉通知自检',
      content: `这是一条来自系统的测试通知（${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}）。收到说明通知链路正常。`,
      severity: 'info',
      extra: {
        消息分类: '自检',
        业务摘要: '测试钉钉通知是否可达',
        建议动作: '无需处理，收到即可',
        处理入口: '/workspace',
      },
    });

    return apiSuccess({
      success: result.success,
      step: 'send',
      sent: result.sentUserIds?.length || 0,
      failed: result.failedUserIds?.length || 0,
      errmsg: result.errmsg || '',
      message: result.success
        ? `已提交发送（${result.sentUserIds?.length || 0} 人），请查看钉钉工作通知`
        : `发送失败：${result.errmsg || '未知原因'}`,
    });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '钉钉自检发送失败'));
  }
}
