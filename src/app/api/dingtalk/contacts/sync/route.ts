import { NextRequest, NextResponse } from 'next/server';
import { syncDingTalkContacts } from '@/lib/dingtalk-contacts-sync';

/**
 * POST /api/dingtalk/contacts/sync
 * 手动触发钉钉通讯录同步（管理员操作）
 */
export async function POST(request: NextRequest) {
  try {
    console.log('[DingTalk Contacts] Manual sync triggered');
    const result = await syncDingTalkContacts();

    if (result.success) {
      return NextResponse.json({
        success: true,
        data: {
          deptCount: result.deptCount,
          userCount: result.userCount,
          duration: result.duration,
        },
        message: `同步成功：${result.deptCount} 个部门，${result.userCount} 名人员`,
      });
    } else {
      return NextResponse.json(
        {
          success: false,
          error: result.error || '同步失败',
          data: {
            deptCount: result.deptCount,
            userCount: result.userCount,
            duration: result.duration,
          },
        },
        { status: 400 }
      );
    }
  } catch (error: any) {
    console.error('[DingTalk Contacts] Sync POST error:', error);
    return NextResponse.json(
      { success: false, error: error.message || '同步异常' },
      { status: 500 }
    );
  }
}
