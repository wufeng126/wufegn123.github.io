import { NextRequest, NextResponse } from 'next/server';
import { syncDingTalkContacts } from '@/lib/dingtalk-contacts-sync';

function formatSyncMessage(data: {
  deptCount: number;
  userCount: number;
  createdPendingAccounts: number;
  updatedSystemUsers: number;
  disabledSystemUsers: number;
}) {
  return `同步成功：${data.deptCount} 个部门，${data.userCount} 名钉钉人员，新增待分配 ${data.createdPendingAccounts} 个，更新账号 ${data.updatedSystemUsers} 个，自动禁用 ${data.disabledSystemUsers} 个`;
}

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
          createdPendingAccounts: result.createdPendingAccounts,
          updatedSystemUsers: result.updatedSystemUsers,
          disabledSystemUsers: result.disabledSystemUsers,
          duration: result.duration,
        },
        message: formatSyncMessage(result),
      });
    } else {
      return NextResponse.json(
        {
          success: false,
          error: result.error || '同步失败',
          data: {
            deptCount: result.deptCount,
            userCount: result.userCount,
            createdPendingAccounts: result.createdPendingAccounts,
            updatedSystemUsers: result.updatedSystemUsers,
            disabledSystemUsers: result.disabledSystemUsers,
            duration: result.duration,
          },
        },
        { status: 400 }
      );
    }
  } catch (error: unknown) {
    console.error('[DingTalk Contacts] Sync POST error:', error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { success: false, error: message || '同步异常' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/dingtalk/contacts/sync
 * 给部署平台定时任务调用。建议每天执行一次。
 * 需要配置 DINGTALK_CONTACTS_SYNC_CRON_SECRET，并通过 ?secret= 或 x-cron-secret 传入。
 */
export async function GET(request: NextRequest) {
  const configuredSecret = process.env.DINGTALK_CONTACTS_SYNC_CRON_SECRET;
  const requestSecret = request.headers.get('x-cron-secret') || request.nextUrl.searchParams.get('secret');

  if (!configuredSecret) {
    return NextResponse.json(
      { success: false, error: '未配置钉钉通讯录同步定时任务密钥' },
      { status: 403 }
    );
  }

  if (!requestSecret || requestSecret !== configuredSecret) {
    return NextResponse.json(
      { success: false, error: '定时任务密钥不正确' },
      { status: 403 }
    );
  }

  return POST(request);
}
