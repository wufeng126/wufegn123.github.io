/**
 * 钉钉公开配置 API（无需登录）
 * 返回前端钉钉 JSAPI 所需的 corpId 等非敏感配置
 */

import { NextResponse } from 'next/server';
import { getDingTalkConfig, isDingTalkSsoConfigured } from '@/lib/dingtalk-config';

export async function GET() {
  try {
    const configured = isDingTalkSsoConfigured();

    if (!configured) {
      return NextResponse.json({
        success: true,
        data: {
          configured: false,
          corpId: '',
          agentId: '',
        },
      });
    }

    const config = getDingTalkConfig()!;

    // corpId 和 agentId 是公开信息，钉钉 JSAPI 必须使用 corpId
    return NextResponse.json({
      success: true,
      data: {
        configured: true,
        corpId: config.corpId,
        agentId: config.agentId,
      },
    });
  } catch (error) {
    console.error('[DingTalk Public Config API] Error:', error);
    return NextResponse.json(
      { success: false, error: '获取钉钉配置失败' },
      { status: 500 }
    );
  }
}
