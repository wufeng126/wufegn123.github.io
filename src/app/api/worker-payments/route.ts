import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { insertWithSequenceFix, auditLog } from '@/lib/audit-log';
import { pushBusinessNotification } from '@/lib/business-notification';
import { SALARY_PAYMENT_TOLERANCE, syncSalaryPaymentStatus } from '@/lib/business-logic';
import { requireAuth, requireApiWritePermission } from '@/lib/api-auth';
import { invalidateAggregationCache } from '@/lib/data-aggregation';
import { getAccessibleProjectIds } from '@/lib/api-project-access';
import { getWorkerProjectRelations } from '@/lib/worker-project-access';

function parseAmount(value: any): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parsePositiveId(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function isStandalonePaymentType(paymentType?: string | null) {
  return ['预支款', '借支款', '其他'].includes(paymentType || '');
}

function normalizeText(value?: string | null) {
  return String(value || '').trim().replace(/\s+/g, '');
}

function duplicatePaymentKey(params: {
  workerName?: string | null;
  projectName?: string | null;
  yearMonth?: string | null;
  amount?: number | string | null;
}) {
  return [
    normalizeText(params.workerName),
    normalizeText(params.projectName),
    normalizeText(params.yearMonth),
    parseAmount(params.amount).toFixed(2),
  ].join('|');
}

async function ensurePaymentIsNotDuplicate(
  client: ReturnType<typeof getSupabaseClient>,
  params: { worker_id: number; project_id: number; year_month: string; amount: number }
) {
  const [{ data: worker }, { data: project }] = await Promise.all([
    client.from('workers').select('name').eq('id', params.worker_id).single(),
    client.from('projects').select('name').eq('id', params.project_id).single(),
  ]);

  const currentKey = duplicatePaymentKey({
    workerName: (worker as any)?.name,
    projectName: (project as any)?.name,
    yearMonth: params.year_month,
    amount: params.amount,
  });

  const { data: existingPayments, error } = await client
    .from('salary_payments')
    .select('payment_amount, year_month, workers(name), projects(name)')
    .eq('project_id', params.project_id)
    .eq('year_month', params.year_month);

  if (error) {
    throw new Error(`检查重复工资发放失败: ${error.message}`);
  }

  const duplicated = (existingPayments || []).some((payment: any) => (
    duplicatePaymentKey({
      workerName: payment.workers?.name,
      projectName: payment.projects?.name,
      yearMonth: payment.year_month,
      amount: payment.payment_amount,
    }) === currentKey
  ));

  if (duplicated) {
    throw new Error('该工资发放记录已存在（姓名、项目、工资所属月份、实发金额相同），已拦截重复导入');
  }
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
  let warning: string | null = null;

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

  if (!salaryId) {
    if (!isStandalonePaymentType(params.payment_type)) {
      warning = '该人员当月无工资，请核实';
    }
    return { salaryId: null, yearMonth, warning };
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

  if (Math.round((paidAmount + params.amount - netPay) * 100) / 100 > SALARY_PAYMENT_TOLERANCE) {
    warning = `发放超额：实发工资 ¥${netPay.toLocaleString()}，已发放 ¥${paidAmount.toLocaleString()}，本次 ¥${params.amount.toLocaleString()}，请核实`;
  }

  return { salaryId, yearMonth: salaryRecord.year_month, warning };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const searchParams = request.nextUrl.searchParams;
    const workerId = searchParams.get('worker_id');
    const status = searchParams.get('status');
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');
    const parsedWorkerId = workerId && workerId !== 'all' ? parsePositiveId(workerId) : null;

    if (workerId && workerId !== 'all' && !parsedWorkerId) {
      return NextResponse.json({ error: '无效的工人ID' }, { status: 400 });
    }

    const client = getSupabaseClient();
    const accessibleProjectIds = await getAccessibleProjectIds(client, auth.user);
    const isSuperAdmin = accessibleProjectIds === null;

    if (!isSuperAdmin && accessibleProjectIds.length === 0) {
      return NextResponse.json({ payments: [] });
    }
    
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

    if (parsedWorkerId !== null) {
      query = query.eq('worker_id', parsedWorkerId);
    }

    if (startDate) {
      query = query.gte('payment_date', startDate);
    }

    if (endDate) {
      query = query.lte('payment_date', endDate);
    }

    if (!isSuperAdmin) {
      query = query.in('project_id', accessibleProjectIds);
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
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const { salary_id, worker_id, project_id, year_month, amount, payment_date, payment_type, remark } = body;

    if (worker_id == null || project_id == null || amount == null || !payment_date || !year_month) {
      return NextResponse.json({ error: '请填写完整信息：工人、项目、工资所属月份、实发金额和发放日期均为必填' }, { status: 400 });
    }

    const client = getSupabaseClient();
    const workerId = parsePositiveId(worker_id);
    const projectId = parsePositiveId(project_id);
    const salaryId = salary_id == null || salary_id === '' ? null : parsePositiveId(salary_id);
    const paymentAmount = parseAmount(amount);

    if (!workerId || !projectId) {
      return NextResponse.json({ error: '工人ID或项目ID无效' }, { status: 400 });
    }
    if (salary_id != null && salary_id !== '' && !salaryId) {
      return NextResponse.json({ error: '工资核算单ID无效' }, { status: 400 });
    }
    if (paymentAmount <= 0) {
      return NextResponse.json({ error: '发放金额必须大于0' }, { status: 400 });
    }

    const accessibleProjectIds = await getAccessibleProjectIds(client, auth.user);
    if (accessibleProjectIds !== null && !accessibleProjectIds.includes(projectId)) {
      return NextResponse.json({ error: '无权在该项目下新增工资发放记录' }, { status: 403 });
    }

    const [{ data: workerRecord, error: workerError }, { data: projectRecord, error: projectError }] = await Promise.all([
      client.from('workers').select('id, project_id').eq('id', workerId).maybeSingle(),
      client.from('projects').select('id').eq('id', projectId).maybeSingle(),
    ]);

    if (workerError) {
      throw new Error(`查询工人信息失败: ${workerError.message}`);
    }
    if (projectError) {
      throw new Error(`查询项目信息失败: ${projectError.message}`);
    }
    if (!workerRecord) {
      return NextResponse.json({ error: '工人不存在' }, { status: 404 });
    }
    if (!projectRecord) {
      return NextResponse.json({ error: '项目不存在' }, { status: 404 });
    }

    const workerProjectRelations = await getWorkerProjectRelations(client, [workerId]);
    if (!workerProjectRelations.get(workerId)?.has(projectId)) {
      return NextResponse.json({ error: '该工人与所选项目不匹配，无法创建工资发放记录' }, { status: 400 });
    }

    await ensurePaymentIsNotDuplicate(client, {
      worker_id: workerId,
      project_id: projectId,
      year_month,
      amount: paymentAmount,
    });

    const matchedSalary = await resolveSalaryForPayment(client, {
      salary_id: salaryId,
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

    // 写入后失效聚合缓存
    invalidateAggregationCache();

    const payment = Array.isArray(result.data) ? result.data[0] : result.data;

    if (matchedSalary.salaryId) {
      await syncSalaryPaymentStatus(matchedSalary.salaryId);
    }

    await auditLog({
      operationType: 'create',
      resourceType: 'salary_payment',
      resourceId: payment?.id || 0,
      details: {
        salary_id: matchedSalary.salaryId,
        worker_id: workerId,
        project_id: projectId,
        amount: paymentAmount,
        payment_date,
        payment_type,
      },
      request,
    });

    const [{ data: worker }, { data: project }] = await Promise.all([
      client.from('workers').select('name').eq('id', workerId).maybeSingle(),
      client.from('projects').select('name').eq('id', projectId).maybeSingle(),
    ]);
    const workerName = (worker as any)?.name || '工人';
    const projectName = (project as any)?.name || '项目';
    const resolvedYearMonth = matchedSalary.yearMonth || year_month || '';

    // 钉钉推送通知
    await pushBusinessNotification({
      type: 'new_worker_payment',
      title: '新增工资发放',
      content: `新增工资发放记录，金额: ¥${paymentAmount.toLocaleString()}，发放日期: ${payment_date}`,
      severity: 'info',
      projectId,
      relatedId: payment?.id,
      relatedType: 'salary_payment',
      metadata: {
        payment_id: payment?.id,
        paymentId: payment?.id,
        worker_id: workerId,
        project_id: projectId,
        workerName,
        projectName,
        year_month: resolvedYearMonth,
        yearMonth: resolvedYearMonth,
        amount: paymentAmount,
        paymentAmount,
        payment_date,
        paymentDate: payment_date,
        payment_type,
        businessSummary: `${workerName} ${resolvedYearMonth} 工资发放，项目 ${projectName}，金额 ¥${paymentAmount.toLocaleString()}，发放日期 ${payment_date}`,
      },
    });

    return NextResponse.json({ payment, warnings: matchedSalary.warning ? [matchedSalary.warning] : [] });
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
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: '缺少记录ID' }, { status: 400 });
    }

    const client = getSupabaseClient();
    const paymentId = parsePositiveId(id);
    if (!paymentId) {
      return NextResponse.json({ error: '无效的记录ID' }, { status: 400 });
    }

    const { data: existingPayment, error: fetchError } = await client
      .from('salary_payments')
      .select('id, salary_id, worker_id, project_id')
      .eq('id', paymentId)
      .maybeSingle();

    if (fetchError) {
      throw new Error(`查询工资发放记录失败: ${fetchError.message}`);
    }
    if (!existingPayment) {
      return NextResponse.json({ error: '工资发放记录不存在' }, { status: 404 });
    }

    const accessibleProjectIds = await getAccessibleProjectIds(client, auth.user);
    if (accessibleProjectIds !== null && !accessibleProjectIds.includes(Number(existingPayment.project_id))) {
      return NextResponse.json({ error: '无权删除该项目下的工资发放记录' }, { status: 403 });
    }

    const { error } = await client
      .from('salary_payments')
      .delete()
      .eq('id', paymentId);

    if (error) {
      throw new Error(`删除发放记录失败: ${error.message}`);
    }

    // 删除后全量重算，覆盖未直接挂 salary_id 但按工人/项目/月匹配的发放记录
    const { syncAllSalaryPaymentStatus } = await import('@/lib/business-logic');
    await syncAllSalaryPaymentStatus();
    invalidateAggregationCache();

    await auditLog({
      operationType: 'delete',
      resourceType: 'salary_payment',
      resourceId: paymentId,
      details: {
        salary_id: existingPayment.salary_id,
        worker_id: existingPayment.worker_id,
        project_id: existingPayment.project_id,
      },
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
