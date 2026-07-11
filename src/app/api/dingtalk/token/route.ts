/**
 * 钉钉 access_token 管理 API
 * GET  - 检查当前 token 状态（缓存情况、是否过期）
 * POST - 强制刷新 token
 *
 * 仅返回脱敏信息，不暴露实际 token 值
 */

import { NextRequest, NextResponse } from 'next/server';
import { isDingTalkConfigured } from '@/lib/dingtalk-config';
import { getAccessToken, refreshAccessToken, clearTokenCache } from '@/lib/dingtalk-service';

export async function GET(request: NextRequest) {
  try {
    if (!isDingTalkConfigured()) {
      return NextResponse.json({
        success: true,
        data: {
          configured: false,
          tokenStatus: 'not_configured',
          message: '钉钉企业内部应用未配置',
        },
      });
    }

    // 尝试获取 token 以检查状态
    try {
      const token = await getAccessToken();
      // 只返回前4位 + 掩码
      const maskedToken = token.slice(0, 4) + '******';

      return NextResponse.json({
        success: true,
        data: {
          configured: true,
          tokenStatus: 'valid',
          tokenPreview: maskedToken,
          message: 'access_token 有效',
        },
      });
    } catch {
      return NextResponse.json({
        success: true,
        data: {
          configured: true,
          tokenStatus: 'error',
          message: 'access_token 获取失败，请检查配置',
        },
      });
    }
  } catch (error) {
    console.error('[DingTalk Token API] Error:', error);
    return NextResponse.json(
      { success: false, error: '获取 token 状态失败' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!isDingTalkConfigured()) {
      return NextResponse.json(
        { success: false, error: '钉钉企业内部应用未配置' },
        { status: 400 }
      );
    }

    // 强制刷新 token
    clearTokenCache();
    const newToken = await refreshAccessToken();
    const maskedToken = newToken.slice(0, 4) + '******';

    return NextResponse.json({
      success: true,
      data: {
        tokenStatus: 'refreshed',
        tokenPreview: maskedToken,
        message: 'access_token 已刷新',
      },
    });
  } catch (error) {
    console.error('[DingTalk Token API] Refresh error:', error);
    return NextResponse.json(
      { success: false, error: '刷新 access_token 失败，请检查 AppKey 和 AppSecret 配置' },
      { status: 500 }
    );
  }
}
