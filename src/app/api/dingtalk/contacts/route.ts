import { NextRequest, NextResponse } from 'next/server';
import { syncDingTalkContacts, getDingTalkContacts, getDingTalkContactsSyncStatus } from '@/lib/dingtalk-contacts-sync';

/**
 * GET /api/dingtalk/contacts
 * 查询钉钉通讯录列表
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const keyword = searchParams.get('keyword') || undefined;
    const activeOnly = searchParams.get('active_only') !== 'false';
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const statusOnly = searchParams.get('status') === 'true';

    // 仅查询同步状态
    if (statusOnly) {
      const syncStatus = await getDingTalkContactsSyncStatus();
      return NextResponse.json({
        success: true,
        data: syncStatus,
      });
    }

    const result = await getDingTalkContacts({
      keyword,
      activeOnly,
      limit,
      offset,
    });

    return NextResponse.json({
      success: true,
      data: result.data,
      total: result.total,
      limit,
      offset,
    });
  } catch (error: any) {
    console.error('[DingTalk Contacts] GET error:', error);
    return NextResponse.json(
      { success: false, error: '查询通讯录失败' },
      { status: 500 }
    );
  }
}
