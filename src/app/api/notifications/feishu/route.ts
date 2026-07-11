import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { 
  sendFeishuTextMessage, 
  sendFeishuNotification,
  sendVisaExpiryReminder,
  sendSettlementReminder,
  sendPaymentWarning,
  sendCostWarning,
  sendNewRecordNotification
} from '@/lib/feishu';

// 获取飞书设置
async function getFeishuSettings(client: any) {
  const { data, error } = await client
    .from('notification_settings')
    .select('setting_key, setting_value, enabled')
    .in('setting_key', ['feishu_webhook', 'feishu_enabled', 'feishu_receive_users']);

  if (error) {
    throw new Error(`获取设置失败: ${error.message}`);
  }

  const settings: Record<string, any> = {};
  data?.forEach((item: any) => {
    settings[item.setting_key] = {
      value: item.setting_value,
      enabled: item.enabled
    };
  });

  return settings;
}

// 发送通知到飞书
async function sendNotificationToFeishu(
  webhookUrl: string, 
  type: string, 
  data: Record<string, any>,
  baseUrl: string
) {
  switch (type) {
    case 'visa_expiry':
      return sendVisaExpiryReminder(
        webhookUrl,
        data.projectName || '',
        data.visaType || '签证',
        data.expiryDate || '',
        data.projectManager || ''
      );

    case 'settlement_pending':
      return sendSettlementReminder(
        webhookUrl,
        data.contractNo || '',
        data.settlementNo || '',
        data.amount || '0',
        data.settlementType || '履约中',
        data.submitter || ''
      );

    case 'payment_warning':
      return sendPaymentWarning(
        webhookUrl,
        data.contractNo || '',
        data.supplierName || '',
        data.pendingAmount || '0',
        data.dueDate
      );

    case 'payment_overdue':
      return sendPaymentWarning(
        webhookUrl,
        data.contractNo || '',
        data.supplierName || '',
        data.pendingAmount || '0'
      );

    case 'cost_warning':
      return sendCostWarning(
        webhookUrl,
        data.projectName || '',
        data.workItemName || '',
        data.budgetAmount || '0',
        data.actualAmount || '0',
        data.overAmount || '0'
      );

    case 'new_report':
      return sendNewRecordNotification(
        webhookUrl,
        '甲方报量',
        data.projectName || '',
        `报量金额：${data.amount || 0} 元，报量月份：${data.month || ''}`,
        data.creator || ''
      );

    case 'new_payment':
      return sendNewRecordNotification(
        webhookUrl,
        '付款记录',
        data.projectName || '',
        `付款金额：${data.amount || 0} 元，付款日期：${data.date || ''}`,
        data.creator || ''
      );

    case 'new_worker':
      return sendNewRecordNotification(
        webhookUrl,
        '工人入职',
        data.projectName || '',
        `姓名：${data.workerName || ''}，工种：${data.workType || ''}`,
        data.creator || ''
      );

    case 'certificate_expiry':
    case 'certificate_expired':
      return sendFeishuNotification(
        webhookUrl,
        '证件到期提醒',
        type === 'certificate_expired' 
          ? `证件已过期！请立即处理！` 
          : `证件即将到期，请及时处理！`,
        [
          { label: '工人姓名', value: data.workerName || '' },
          { label: '证件类型', value: data.certificateType || '' },
          { label: '到期日期', value: data.expiryDate || '' },
          { label: '剩余天数', value: data.daysLeft > 0 ? `${data.daysLeft} 天` : `已过期 ${Math.abs(data.daysLeft)} 天` },
        ]
      );

    default:
      return sendFeishuNotification(
        webhookUrl,
        '系统通知',
        data.message || '有新的系统消息',
        data.extraInfo
      );
  }
}

// 发送测试消息
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { test, notificationId, type, data } = body;

    const client = getSupabaseClient();

    // 获取飞书设置
    const settings = await getFeishuSettings(client);

    if (!settings.feishu_webhook?.value) {
      return NextResponse.json({ error: '未配置飞书Webhook地址' }, { status: 400 });
    }

    if (settings.feishu_enabled?.enabled === false) {
      return NextResponse.json({ error: '飞书通知已禁用' }, { status: 400 });
    }

    const webhookUrl = settings.feishu_webhook.value;
    const baseUrl = process.env.COZE_PROJECT_DOMAIN_DEFAULT || 'http://localhost:5000';

    let result;

    if (test) {
      // 发送测试消息
      result = await sendFeishuNotification(
        webhookUrl,
        '飞书消息推送测试',
        `这是一条测试消息，用于验证飞书机器人配置是否正确。\n\n发送时间：${new Date().toLocaleString('zh-CN')}\n\n如果收到此消息，说明配置成功！`,
        [
          { label: '系统名称', value: '建筑劳务管理系统' },
          { label: '访问地址', value: baseUrl, href: baseUrl },
        ]
      );
    } else if (notificationId) {
      // 发送已有通知
      const { data: notification, error: notifError } = await client
        .from('notifications')
        .select('*')
        .eq('id', notificationId)
        .single();

      if (notifError || !notification) {
        return NextResponse.json({ error: '通知不存在' }, { status: 404 });
      }

      result = await sendNotificationToFeishu(
        webhookUrl,
        notification.type,
        notification.metadata || {},
        baseUrl
      );

      // 更新通知发送状态
      if (result.success) {
        await client
          .from('notifications')
          .update({
            is_sent: true,
            sent_at: new Date().toISOString(),
          })
          .eq('id', notificationId);
      }
    } else if (type && data) {
      // 发送自定义消息
      result = await sendNotificationToFeishu(webhookUrl, type, data, baseUrl);
    } else {
      return NextResponse.json({ error: '请提供测试参数或通知ID' }, { status: 400 });
    }

    if (result.success) {
      return NextResponse.json({ success: true, message: result.message });
    } else {
      return NextResponse.json({ error: result.message }, { status: 500 });
    }
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error.message || '发送失败' },
      { status: 500 }
    );
  }
}

// 获取飞书配置状态
export async function GET() {
  try {
    const client = getSupabaseClient();
    const settings = await getFeishuSettings(client);

    return NextResponse.json({
      feishu_webhook: !!settings.feishu_webhook?.value,
      feishu_enabled: settings.feishu_enabled?.enabled !== false,
      feishu_receive_users: settings.feishu_receive_users?.value || '',
    });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error.message || '获取配置失败' },
      { status: 500 }
    );
  }
}
