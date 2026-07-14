import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { sendDingTalkNotification, formatDingTalkMessage, type NotificationParams } from '@/lib/dingtalk';
import { notifyVisaWorkflow } from '@/lib/visa-workflow';

// 计算天数差
function getDaysDiff(dateStr: string): number {
  const targetDate = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  targetDate.setHours(0, 0, 0, 0);
  const diffTime = targetDate.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

// 格式化日期
function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('zh-CN');
}

async function createAndPushNotification(client: any, type: string, title: string, content: string, severity: string, metadata: Record<string, any>, projectId?: number, relatedId?: number, relatedType?: string) {
  // 检查是否已存在相同通知（避免重复）
  const { data: existingNotif } = await client
    .from('notifications')
    .select('id')
    .eq('type', type)
    .eq('related_id', relatedId || 0)
    .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .single();

  if (existingNotif) {
    return null; // 已存在，不重复发送
  }

  // 创建通知记录
  const { data: notification, error } = await client
    .from('notifications')
    .insert({
      type,
      title,
      content,
      severity,
      project_id: projectId || null,
      related_id: relatedId || null,
      related_type: relatedType || null,
      metadata,
    })
    .select()
    .single();

  if (error) {
    console.error('创建通知失败:', error);
    return null;
  }

  // 获取钉钉设置并推送
  const { data: dingtalkSetting } = await client
    .from('notification_settings')
    .select('setting_value, enabled')
    .eq('setting_key', 'dingtalk_webhook')
    .single();

  const { data: secretSetting } = await client
    .from('notification_settings')
    .select('setting_value')
    .eq('setting_key', 'dingtalk_secret')
    .single();

  if (dingtalkSetting?.setting_value && dingtalkSetting.enabled) {
    // 检查各类通知开关
    const typeSettings = await client
      .from('notification_settings')
      .select('setting_key, enabled')
      .in('setting_key', [
        'certificate_reminder_enabled',
        'visa_reminder_enabled',
        'new_record_reminder_enabled',
        'cost_warning_enabled',
        'settlement_reminder_enabled',
        'payment_warning_enabled',
      ]);

    const typeEnabledMap: Record<string, boolean> = {};
    typeSettings.data?.forEach((s: any) => {
      typeEnabledMap[s.setting_key] = s.enabled;
    });

    let shouldSend = false;
    if (type.includes('certificate') && typeEnabledMap['certificate_reminder_enabled']) shouldSend = true;
    if (type.includes('visa') && typeEnabledMap['visa_reminder_enabled']) shouldSend = true;
    if (['new_report', 'new_payment', 'new_worker', 'new_settlement', 'new_salary', 'new_client_payment', 'new_supplier_payment'].includes(type) && typeEnabledMap['new_record_reminder_enabled']) shouldSend = true;
    if (type === 'cost_warning' && typeEnabledMap['cost_warning_enabled']) shouldSend = true;
    if (type === 'new_settlement' && typeEnabledMap['settlement_reminder_enabled']) shouldSend = true;
    if (['new_client_payment', 'new_supplier_payment'].includes(type) && typeEnabledMap['payment_warning_enabled']) shouldSend = true;

    if (shouldSend) {
      try {
        // 获取项目名称
        let projectName: string | undefined;
        if (projectId) {
          const { data: proj } = await client
            .from('projects')
            .select('name')
            .eq('id', projectId)
            .single();
          projectName = proj?.name;
        }

        const params: NotificationParams = {
          type,
          title,
          content,
          severity: severity as 'info' | 'warning' | 'danger',
          projectName,
        };
        const { title: msgTitle, text } = formatDingTalkMessage(params);
        const result = await sendDingTalkNotification(dingtalkSetting.setting_value, secretSetting?.setting_value, msgTitle, text);

        if (result.success) {
          await client
            .from('notifications')
            .update({ is_sent: true, sent_at: new Date().toISOString() })
            .eq('id', notification.id);
        }
      } catch (e) {
        console.error('发送钉钉消息失败:', e);
      }
    }
  }

  return notification;
}

// 检测证件到期
async function checkCertificateExpiry(client: any) {
  const results = { expiring30: 0, expiring15: 0, expiring7: 0, expired: 0 };

  const { data: certificates, error } = await client
    .from('certificates')
    .select(`
      id,
      worker_id,
      certificate_type,
      expiry_date,
      workers(name)
    `)
    .order('expiry_date');

  if (error || !certificates) return results;

  for (const cert of certificates) {
    if (!cert.expiry_date) continue;
    
    const daysLeft = getDaysDiff(cert.expiry_date);
    const workerName = (cert.workers as any)?.name || '未知';
    const certType = cert.certificate_type || '未知证件';

    if (daysLeft < 0) {
      // 已过期
      await createAndPushNotification(
        client,
        'certificate_expired',
        '证件已过期预警',
        `工人：${workerName}\n证件类型：${certType}\n过期日期：${formatDate(cert.expiry_date)}\n已过期 ${Math.abs(daysLeft)} 天`,
        'danger',
        { workerName, certificateType: certType, expiryDate: cert.expiry_date, daysLeft },
        undefined,
        cert.id,
        'certificate'
      );
      results.expired++;
    } else if (daysLeft <= 7) {
      // 7天内到期
      await createAndPushNotification(
        client,
        'certificate_expiry_7',
        '证件即将到期（7天内）',
        `工人：${workerName}\n证件类型：${certType}\n到期日期：${formatDate(cert.expiry_date)}\n剩余 ${daysLeft} 天`,
        'danger',
        { workerName, certificateType: certType, expiryDate: cert.expiry_date, daysLeft },
        undefined,
        cert.id,
        'certificate'
      );
      results.expiring7++;
    } else if (daysLeft <= 15) {
      // 15天内到期
      await createAndPushNotification(
        client,
        'certificate_expiry_15',
        '证件即将到期（15天内）',
        `工人：${workerName}\n证件类型：${certType}\n到期日期：${formatDate(cert.expiry_date)}\n剩余 ${daysLeft} 天`,
        'warning',
        { workerName, certificateType: certType, expiryDate: cert.expiry_date, daysLeft },
        undefined,
        cert.id,
        'certificate'
      );
      results.expiring15++;
    } else if (daysLeft <= 30) {
      // 30天内到期
      await createAndPushNotification(
        client,
        'certificate_expiry_30',
        '证件即将到期（30天内）',
        `工人：${workerName}\n证件类型：${certType}\n到期日期：${formatDate(cert.expiry_date)}\n剩余 ${daysLeft} 天`,
        'warning',
        { workerName, certificateType: certType, expiryDate: cert.expiry_date, daysLeft },
        undefined,
        cert.id,
        'certificate'
      );
      results.expiring30++;
    }
  }

  return results;
}

// 检测签证流转超期
async function checkVisaExpiry(client: any) {
  const results = { expiring30: 0, expiring15: 0, expiring7: 0, expired: 0, workflowOverdue: 0 };

  const overdueBefore = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const remindedBefore = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: visas, error } = await client
    .from('visas')
    .select(`
      id,
      visa_number,
      visa_name,
      project_id,
      status,
      current_responsible_user_id,
      current_responsible_name,
      workflow_step_updated_at,
      workflow_last_reminded_at,
      projects(name)
    `)
    .in('status', ['已提交', '已签字'])
    .lte('workflow_step_updated_at', overdueBefore)
    .not('current_responsible_user_id', 'is', null);

  if (error || !visas) return results;

  for (const visa of visas) {
    if (visa.workflow_last_reminded_at && visa.workflow_last_reminded_at > remindedBefore) {
      continue;
    }

    const projectName = (visa.projects as any)?.name || '未知项目';
    const stageText = visa.status === '已提交' ? '甲方工程部签字' : '甲方商务确认';
    await notifyVisaWorkflow({
      type: 'visa_workflow_overdue',
      title: '签证办理超期提醒',
      content: `项目：${projectName}\n签证：${visa.visa_number} ${visa.visa_name || ''}\n当前环节：${stageText}\n已超过 7 天未推进，请及时处理。`,
      severity: 'warning',
      projectId: visa.project_id,
      visaId: visa.id,
      recipientUserId: visa.current_responsible_user_id,
      metadata: {
        visaNumber: visa.visa_number,
        status: visa.status,
        targetNames: [visa.current_responsible_name],
      },
    });

    await client
      .from('visas')
      .update({ workflow_last_reminded_at: new Date().toISOString() })
      .eq('id', visa.id);

    results.workflowOverdue++;
  }

  return results;
}

// 检测新增记录
async function checkNewRecords(client: any, lastCheckTime: string) {
  const results = { reports: 0, payments: 0, workers: 0, settlements: 0, salaries: 0, supplierPayments: 0 };

  // 检测新增甲方报量
  const { data: newReports } = await client
    .from('client_reports')
    .select(`
      id,
      project_id,
      report_amount,
      year_month,
      created_at,
      projects(name)
    `)
    .gte('created_at', lastCheckTime);

  if (newReports && newReports.length > 0) {
    for (const report of newReports) {
      const projectName = (report.projects as any)?.name || '未知项目';
      await createAndPushNotification(
        client,
        'new_report',
        '新增甲方报量',
        `项目：${projectName}\n报量金额：${parseFloat(report.report_amount || '0').toLocaleString()} 元\n报量月份：${report.year_month}`,
        'info',
        { projectName, amount: report.report_amount, month: report.year_month },
        report.project_id,
        report.id,
        'client_report'
      );
      results.reports++;
    }
  }

  // 检测新增付款记录
  const { data: newPayments } = await client
    .from('client_payments')
    .select(`
      id,
      project_id,
      payment_amount,
      payment_date,
      created_at,
      projects(name)
    `)
    .gte('created_at', lastCheckTime);

  if (newPayments && newPayments.length > 0) {
    for (const payment of newPayments) {
      const projectName = (payment.projects as any)?.name || '未知项目';
      await createAndPushNotification(
        client,
        'new_payment',
        '新增付款记录',
        `项目：${projectName}\n付款金额：${parseFloat(payment.payment_amount || '0').toLocaleString()} 元\n付款日期：${payment.payment_date}`,
        'info',
        { projectName, amount: payment.payment_amount, date: payment.payment_date },
        payment.project_id,
        payment.id,
        'client_payment'
      );
      results.payments++;
    }
  }

  // 检测新增工人
  const { data: newWorkers } = await client
    .from('workers')
    .select('id, name, work_type, created_at')
    .gte('created_at', lastCheckTime);

  if (newWorkers && newWorkers.length > 0) {
    for (const worker of newWorkers) {
      await createAndPushNotification(
        client,
        'new_worker',
        '新增工人入职',
        `姓名：${worker.name}\n工种：${worker.work_type || '未指定'}`,
        'info',
        { workerName: worker.name, workType: worker.work_type },
        undefined,
        worker.id,
        'worker'
      );
      results.workers++;
    }
  }

  // 检测新增供应商结算
  const { data: newSettlements } = await client
    .from('settlements')
    .select(`
      id,
      project_id,
      contract_id,
      settlement_amount,
      created_at,
      supplier_contracts(contract_name)
    `)
    .gte('created_at', lastCheckTime);

  if (newSettlements && newSettlements.length > 0) {
    for (const settlement of newSettlements) {
      const contractName = (settlement.supplier_contracts as any)?.contract_name || '未知合同';
      // 获取项目名称
      let projectName = '未知项目';
      if (settlement.project_id) {
        const { data: proj } = await client.from('projects').select('name').eq('id', settlement.project_id).single();
        projectName = proj?.name || projectName;
      }
      await createAndPushNotification(
        client,
        'new_settlement',
        '新增结算记录',
        `项目：${projectName}\n合同：${contractName}\n结算金额：${parseFloat(settlement.settlement_amount || '0').toLocaleString()} 元`,
        'info',
        { projectName, contractName, amount: settlement.settlement_amount },
        settlement.project_id,
        settlement.id,
        'settlement'
      );
      results.settlements++;
    }
  }

  // 检测新增工资发放
  const { data: newSalaryPayments } = await client
    .from('salary_payments')
    .select('id, project_id, total_amount, payment_date, created_at')
    .gte('created_at', lastCheckTime);

  if (newSalaryPayments && newSalaryPayments.length > 0) {
    for (const salary of newSalaryPayments) {
      let projectName = '未知项目';
      if (salary.project_id) {
        const { data: proj } = await client.from('projects').select('name').eq('id', salary.project_id).single();
        projectName = proj?.name || projectName;
      }
      const yearMonth = salary.payment_date ? new Date(salary.payment_date).toISOString().slice(0, 7) : '未知';
      await createAndPushNotification(
        client,
        'new_salary',
        '新增工资发放',
        `项目：${projectName}\n发放月份：${yearMonth}\n发放金额：${parseFloat(salary.total_amount || '0').toLocaleString()} 元`,
        'info',
        { projectName, yearMonth, amount: salary.total_amount },
        salary.project_id,
        salary.id,
        'salary_payment'
      );
      results.salaries++;
    }
  }

  // 检测新增供应商付款
  const { data: newSupplierPayments } = await client
    .from('supplier_payments')
    .select(`
      id,
      project_id,
      supplier_name,
      payment_amount,
      created_at
    `)
    .gte('created_at', lastCheckTime);

  if (newSupplierPayments && newSupplierPayments.length > 0) {
    for (const sp of newSupplierPayments) {
      let projectName = '未知项目';
      if (sp.project_id) {
        const { data: proj } = await client.from('projects').select('name').eq('id', sp.project_id).single();
        projectName = proj?.name || projectName;
      }
      await createAndPushNotification(
        client,
        'new_supplier_payment',
        '新增供应商付款',
        `项目：${projectName}\n供应商：${sp.supplier_name || '未知'}\n付款金额：${parseFloat(sp.payment_amount || '0').toLocaleString()} 元`,
        'info',
        { projectName, supplierName: sp.supplier_name, amount: sp.payment_amount },
        sp.project_id,
        sp.id,
        'supplier_payment'
      );
      results.supplierPayments++;
    }
  }

  return results;
}

// 检测成本预警
async function checkCostWarnings(client: any) {
  const results = { warnings: 0 };

  // 获取项目成本数据
  const { data: projects } = await client
    .from('projects')
    .select('id, name, status');

  if (!projects) return results;

  // 获取甲方报量
  const { data: reports } = await client
    .from('client_reports')
    .select('project_id, report_amount');

  const projectIncome: Record<number, number> = {};
  reports?.forEach((r: { project_id: number; report_amount: string }) => {
    projectIncome[r.project_id] = (projectIncome[r.project_id] || 0) + parseFloat(r.report_amount || '0');
  });

  // 获取供应商结算
  const { data: settlements } = await client
    .from('settlements')
    .select('project_id, settlement_amount');

  const projectSettlement: Record<number, number> = {};
  settlements?.forEach((s: { project_id: number; settlement_amount: string }) => {
    projectSettlement[s.project_id] = (projectSettlement[s.project_id] || 0) + parseFloat(s.settlement_amount || '0');
  });

  // 获取工人工资
  const { data: salaries } = await client
    .from('worker_salaries')
    .select('project_id, gross_pay');

  const projectSalary: Record<number, number> = {};
  salaries?.forEach((s: { project_id: number; gross_pay: string }) => {
    projectSalary[s.project_id] = (projectSalary[s.project_id] || 0) + parseFloat(s.gross_pay || '0');
  });

  // 检查每个项目
  for (const project of projects) {
    const income = projectIncome[project.id] || 0;
    const cost = (projectSettlement[project.id] || 0) + (projectSalary[project.id] || 0);
    const profit = income - cost;
    const profitRate = income > 0 ? (profit / income) * 100 : 0;

    // 利润为负或成本超支
    if (profit < 0 || (income > 0 && cost > income)) {
      await createAndPushNotification(
        client,
        'cost_warning',
        '成本预警',
        `项目：${project.name}\n当前状态：${profit < 0 ? '亏损' : '成本超支'}\n利润：${(profit / 10000).toFixed(2)} 万元\n利润率：${profitRate.toFixed(1)}%`,
        'danger',
        { projectName: project.name, status: profit < 0 ? '亏损' : '成本超支', profit: (profit / 10000).toFixed(2), profitRate: profitRate.toFixed(1) },
        project.id,
        project.id,
        'project'
      );
      results.warnings++;
    }
  }

  return results;
}

// 主检测函数
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const forceCheck = searchParams.get('force') === 'true';

    const client = getSupabaseClient();

    // 获取上次检测时间
    const { data: lastCheckSetting } = await client
      .from('notification_settings')
      .select('setting_value')
      .eq('setting_key', 'last_check_time')
      .single();

    const lastCheckTime = lastCheckSetting?.setting_value || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const now = new Date().toISOString();

    // 执行检测
    const certificateResults = await checkCertificateExpiry(client);
    const visaResults = await checkVisaExpiry(client);
    const newRecordResults = await checkNewRecords(client, lastCheckTime);
    const costResults = await checkCostWarnings(client);

    // 更新最后检测时间
    await client
      .from('notification_settings')
      .update({ setting_value: now, updated_at: now })
      .eq('setting_key', 'last_check_time');

    // 获取当前未读消息统计
    const { data: unreadCount } = await client
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('is_read', false);

    return NextResponse.json({
      success: true,
      checkTime: now,
      results: {
        certificates: certificateResults,
        visas: visaResults,
        newRecords: newRecordResults,
        costs: costResults,
      },
      totalNotifications: (certificateResults.expired + certificateResults.expiring7 + certificateResults.expiring15 + certificateResults.expiring30) +
        visaResults.expired + visaResults.expiring7 + visaResults.expiring15 + visaResults.expiring30 + visaResults.workflowOverdue +
        newRecordResults.reports + newRecordResults.payments + newRecordResults.workers +
        newRecordResults.settlements + newRecordResults.salaries + newRecordResults.supplierPayments +
        costResults.warnings,
      unreadCount: unreadCount || 0,
    });
  } catch (error: any) {
    console.error('自动检测任务错误:', error);
    return NextResponse.json(
      { error: error.message || '检测失败' },
      { status: 500 }
    );
  }
}
