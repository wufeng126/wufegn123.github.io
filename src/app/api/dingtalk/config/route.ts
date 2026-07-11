/**
 * 钉钉配置管理 API
 * GET  - 获取脱敏配置（安全，可返回给前端）
 * 仅服务端管理员可访问，AppSecret 永不返回给前端
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDingTalkConfigMasked, isDingTalkConfigured } from '@/lib/dingtalk-config';

export async function GET(request: NextRequest) {
  try {
    const configured = isDingTalkConfigured();
    const maskedConfig = getDingTalkConfigMasked();

    return NextResponse.json({
      success: true,
      data: {
        configured,
        config: maskedConfig,
      },
    });
  } catch (error) {
    console.error('[DingTalk Config API] Error:', error);
    return NextResponse.json(
      { success: false, error: '获取钉钉配置失败' },
      { status: 500 }
    );
  }
}
