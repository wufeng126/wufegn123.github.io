import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { insertWithSequenceFix, auditLog } from '@/lib/audit-log';
import { pushBusinessNotification } from '@/lib/business-notification';
import { syncSalaryPaymentStatus } from '@/lib/business-logic';

function parseAmount(value: any): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isStandalonePaymentType(paymentType?: string | null) {
  return ['预支款', '借支款', '其他'].includes(paymentType || '');
}

async function resolveSalaryForPayment(
  client: ReturnType<typeof getSupabaseClient>,
  params: {
    salary_id?: number | string | null;
    worker_id: number;
    project_id: number;
    year_month?: string | null;
    payment_type?: string | null;
    amount: number;
  }
) {
  let salaryId = params.salary_id ? parseInt(String(params.salary_id)) : null;
  let yearMonth = params.year_month || null;

  if (!salaryId && yearMonth) {
    const { data: salaryRows, error } = await client
      .from('worker_salaries')
      .select('id, net_pay, year_month')
      .eq('worker_id', params.worker_id)
      .eq('project_id', params.project_id)
      .eq('year_month', yearMonth);

    if (error) {
      throw new Error(`匹配工资核算单失败: ${error.message}`);
    }

    if ((salaryRows || []).length > 1) {
      throw new Error('该工人在当前项目、当前月份存在多张工资核算单，请先处理重复工资记录');
    }

    if (salaryRows && salaryRows.length === 1) {
      salaryId = salaryRows[0].id;
      yearMonth = salaryRows[0].year_month;
    }
  }

  if (!salaryId && !isStandalonePaymentType(params.payment_type)) {
    throw new Error('月度工资发放必须先有对应的工资核算单，请确认工人、项目和年月是否正确');
  }

  if (!salaryId) {
    return { salaryId: null, yearMonth };
  }

  const { data: salaryRecord, error: salaryError } = await client
    .from('worker_salaries')
    .select('id, worker_id, project_id, year_month, net_pay')
    .eq('id', salaryId)
    .single();

  if (salaryError || !salaryRecord) {
    throw new Error('未找到对应的工资核算单');
  }

  if (
    salaryRecord.worker_id !== params.worker_id ||
    salaryRecord.project_id !== params.project_id ||
    (yearMonth && salaryRecord.year_month !== yearMonth)
  ) {
    throw new Error('工资发放信息与工资核算单不一致，请检查工人、项目和年月');
  }

  const { data: existingPayments, error: paymentError } = await client
    .from('salary_payments')
    .select('payment_amount')
    .eq('salary_id', salaryId);

  if (paymentError) {
    throw new Error(`查询已发金额失败: ${paymentError.message}`);
  }

  const paidAmount = (existingPayments || []).reduce(
    (sum: number, payment: any) => sum + parseAmount(payment.payment_amount),
    0
  );
  const netPay = parseAmount(salaryRecord.net_pay);

  if (paidAmount + params.amount > netPay) {
    throw new Error(
      `发放超额：实发工资 ¥${netPay.toLocaleString()}，已发放 ¥${paidAmount.toLocaleString()}，本次 ¥${params.amount.toLocaleString()} 超出余额`
    );
  }

  return { salaryId, yearMonth: salaryRecord.year_month };
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const workerId = searchParams.get('worker_id');
    const status = searchParams.get('status');
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');

    const client = getSupabaseClient();
    
    // 查询工资发放记录
    let query = client
      .from('salary_payments')
      .select(`
        id,
        salary_id,
        worker_id,
        project_id,
        year_month,
        payment_amount,
        payment_date,
        payment_type,
        remark,
        created_at,
        workers (
          name
        ),
        projects (
          name
        )
      `)
      .order('payment_date', { ascending: false });

    if (workerId && workerId !== 'all') {
      query = query.eq('worker_id', parseInt(workerId));
    }

    if (startDate) {
      query = query.gte('payment_date', startDate);
    }

    if (endDate) {
      query = query.lte('payment_date', endDate);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`查询工资发放记录失败: ${error.message}`);
    }

    // 格式化返回数据
    const payments = data?.map(record => ({
      id: record.id,
      salary_id: record.salary_id,
      worker_id: record.worker_id,
      worker_name: (record.workers as any)?.name || '未知工人',
      project_id: record.project_id,
      project_name: (record.projects as any)?.name || '未知项目',
      year_month: record.year_month,
      payment_date: record.payment_date,
      payment_type: record.payment_type || '甲方代付',
      amount: record.payment_amount,
      payment_method: record.payment_type === '甲方代付' ? '甲方代付' : '银行转账',
      status: 'completed', // 已发放
      remark: record.remark,
      created_at: record.created_at,
    })) || [];

    // 根据 status 过滤（在获取数据后过滤）
    let filteredPayments = payments;
    if (status && status !== 'all') {
      filteredPayments = payments.filter(p => p.status === status);
    }

    return NextResponse.json({ payments: filteredPayments });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error.message || '查询失败' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { salary_id, worker_id, project_id, year_month, amount, payment_date, payment_type, remark } = body;

    if (worker_id == null || project_id == null || amount == null || !payment_date) {
      return NextResponse.json({ error: '请填写完整信息' }, { status: 400 });
    }

    const client = getSupabaseClient();
    const workerId = parseInt(worker_id);
    const projectId = parseInt(project_id);
    const paymentAmount = parseAmount(amount);

    if (paymentAmount <= 0) {
      return NextResponse.json({ error: '发放金额必须大于0' }, { status: 400 });
    }

    const matchedSalary = await resolveSalaryForPayment(client, {
      salary_id,
      worker_id: workerId,
      project_id: projectId,
      year_month,
      payment_type,
      amount: paymentAmount,
    });
    
    const insertData: any = {
      salary_id: matchedSalary.salaryId,
      worker_id: workerId,
      project_id: projectId,
      payment_amount: paymentAmount,
      payment_date,
      payment_type: payment_type || '甲方代付',
      year_month: matchedSalary.yearMonth || year_month || null,
      remark,
    };

    const result = await insertWithSequenceFix('salary_payments', insertData, client);

    if (result.error) {
      throw new Error(`创建发放记录失败: ${result.error.message}`);
    }

    const payment = Array.isArray(result.data) ? result.data[0] : result.data;

    if (matchedSalary.salaryId) {
      await syncSalaryPaymentStatus(matchedSalary.salaryId);
    }

    await auditLog({
      operationType: 'create',
      resourceType: 'salary_payment',
      resourceId: payment?.id || 0,
      details: { salary_id: matchedSalary.salaryId, worker_id, project_id, amount, payment_date, payment_type },
      request,
    });

    // 钉钉推送通知
    await pushBusinessNotification({
      type: 'new_worker_payment',
      title: '新增工资发放',
      content: `新增工资发放记录，金额: ¥${Number(amount).toLocaleString()}，发放日期: ${payment_date}`,
      severity: 'info',
      projectId: project_id ? parseInt(String(project_id)) : undefined,
      relatedId: payment?.id,
      relatedType: 'salary_payment',
      metadata: { worker_id, project_id, amount, payment_date, payment_type },
    });

    return NextResponse.json({ payment });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error.message || '创建失败' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: '缺少记录ID' }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 删除前获取关联的 salary_id，用于后续同步状态
    const { data: recordToDelete } = await client
      .from('salary_payments')
      .select('id, salary_id')
      .eq('id', parseInt(id))
      .single();

    const { error } = await client
      .from('salary_payments')
      .delete()
      .eq('id', parseInt(id));

    if (error) {
      throw new Error(`删除发放记录失败: ${error.message}`);
    }

    // 同步关联工资记录的发放状态
    if (recordToDelete?.salary_id) {
      const { syncSalaryPaymentStatus } = await import('@/lib/business-logic');
      await syncSalaryPaymentStatus(recordToDelete.salary_id);
    }

    await auditLog({
      operationType: 'delete',
      resourceType: 'salary_payment',
      resourceId: parseInt(id),
      details: {},
      request,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error.message || '删除失败' },
      { status: 500 }
    );
  }
}
