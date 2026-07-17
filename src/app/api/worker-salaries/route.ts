import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getCurrentUser } from '@/lib/auth';
import { auditLog, insertWithSequenceFix } from '@/lib/audit-log';
import { pushBusinessNotification } from '@/lib/business-notification';
import { SALARY_PAYMENT_TOLERANCE, calculateSalaryPaymentStatus, calculateSalaryUnpaidAmount, syncSalaryPaymentStatus } from '@/lib/business-logic';

type RelatedNameEntity = {
  name?: string | null;
};

type RelatedName = RelatedNameEntity | RelatedNameEntity[] | null;

type SalaryPaymentRow = {
  salary_id?: number | null;
  worker_id?: number | null;
  project_id?: number | null;
  year_month?: string | null;
  payment_amount?: unknown;
};

type WorkerSalaryRow = {
  id: number;
  worker_id: number;
  project_id: number;
  year_month?: string | null;
  work_hours?: unknown;
  hourly_rate?: unknown;
  contract_work_pay?: unknown;
  gross_pay?: unknown;
  income_tax?: unknown;
  advance_pay?: unknown;
  labor_insurance?: unknown;
  fine?: unknown;
  net_pay?: unknown;
  remark?: string | null;
  payment_status?: string | null;
  workers?: RelatedName;
  projects?: RelatedName;
};

function normalizeProjectIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(
    value
      .map((projectId) => Number(projectId))
      .filter((projectId) => Number.isInteger(projectId))
  ));
}

function getRelatedName(value?: RelatedName, fallback = '未知') {
  if (Array.isArray(value)) return value[0]?.name || fallback;
  return value?.name || fallback;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function paymentMatchKey(params: {
  worker_id?: number | null;
  project_id?: number | null;
  year_month?: string | null;
}) {
  return `${Number(params.worker_id || 0)}:${Number(params.project_id || 0)}:${params.year_month || ''}`;
}

// 安全解析 numeric 类型
function parseNumeric(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return isNaN(parsed) ? 0 : parsed;
  }
  // 处理 Decimal.js 对象格式
  if (typeof value === 'object') {
    const numericObject = value as Record<string, unknown>;
    if ('$numberDecimal' in numericObject) {
      const parsed = parseFloat(String(numericObject.$numberDecimal));
      return isNaN(parsed) ? 0 : parsed;
    }
    // 处理 { "0": "-", "1": "2", ... } 格式
    const str = Object.keys(numericObject)
      .filter(k => !isNaN(Number(k)))
      .sort((a, b) => Number(a) - Number(b))
      .map(k => String(numericObject[k]))
      .join('');
    const parsed = parseFloat(str);
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

// 获取可访问的项目ID列表
async function getAccessibleProjectIds(userId: number, userRole: string) {
  const client = getSupabaseClient();
  
  // 超级管理员可以访问所有项目
  if (userRole === 'super_admin') {
    const { data } = await client.from('projects').select('id');
    return normalizeProjectIds((data || []).map((project) => project.id));
  }
  
  // 获取用户直接分配的项目
  const { data: userData } = await client
    .from('users')
    .select('managed_projects')
    .eq('id', userId)
    .single();
  
  return normalizeProjectIds(userData?.managed_projects);
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const workerId = searchParams.get('worker_id');
    const projectId = searchParams.get('project_id');
    const month = searchParams.get('month');

    const client = getSupabaseClient();
    
    // 获取当前用户
    const user = await getCurrentUser();
    
    // 获取可访问的项目ID
    const accessibleProjects = await getAccessibleProjectIds(user?.id || 0, user?.role || 'admin');
    const isSuperAdmin = user?.role === 'super_admin';
    
    let query = client
      .from('worker_salaries')
      .select(`
        id,
        worker_id,
        project_id,
        year_month,
        work_hours,
        hourly_rate,
        contract_work_pay,
        gross_pay,
        income_tax,
        advance_pay,
        labor_insurance,
        fine,
        net_pay,
        remark,
        payment_status,
        workers (
          name
        ),
        projects (
          name
        )
      `)
      .order('year_month', { ascending: false });

    if (workerId) {
      query = query.eq('worker_id', parseInt(workerId));
    }
    
    if (projectId) {
      query = query.eq('project_id', parseInt(projectId));
    }

    if (month) {
      // 使用 ilike 进行模糊匹配，支持 YYYY-MM 和 YYYY-MM-DD 格式
      query = query.ilike('year_month', `${month}%`);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`查询工资记录失败: ${error.message}`);
    }

    // 数据权限过滤
    let filteredData = ((data || []) as WorkerSalaryRow[]);
    if (!isSuperAdmin && accessibleProjects.length === 0) {
      filteredData = [];
    } else if (accessibleProjects.length > 0) {
      filteredData = filteredData.filter((record) => accessibleProjects.includes(Number(record.project_id)));
    }

    // 查询工资发放记录（salary_payments）
    const { data: salaryPaymentsData } = await client
      .from('salary_payments')
      .select('salary_id, worker_id, project_id, year_month, payment_amount');

    const paidAmountBySalaryId = new Map<number, number>();
    const unlinkedPaidAmountByMatchKey = new Map<string, number>();
    ((salaryPaymentsData || []) as SalaryPaymentRow[]).forEach((payment) => {
      const amount = parseNumeric(payment.payment_amount);

      if (payment.salary_id) {
        paidAmountBySalaryId.set(
          payment.salary_id,
          (paidAmountBySalaryId.get(payment.salary_id) || 0) + amount
        );
        return;
      }

      if (payment.worker_id && payment.project_id && payment.year_month) {
        const key = paymentMatchKey(payment);
        unlinkedPaidAmountByMatchKey.set(
          key,
          (unlinkedPaidAmountByMatchKey.get(key) || 0) + amount
        );
      }
    });

    const getPaidAmount = (record: WorkerSalaryRow) => {
      const linkedPaid = paidAmountBySalaryId.get(record.id) || 0;
      const unlinkedPaid = unlinkedPaidAmountByMatchKey.get(paymentMatchKey(record)) || 0;
      return linkedPaid + unlinkedPaid;
    };

    // 格式化返回数据，关联已付金额，确保所有金额字段为数字类型
    const salaries = filteredData.map(record => {
      const netPay = parseNumeric(record.net_pay);
      const paidAmount = getPaidAmount(record);
      return {
        id: record.id,
        worker_id: record.worker_id,
        project_id: record.project_id,
        worker_name: getRelatedName(record.workers, '未知工人'),
        project_name: getRelatedName(record.projects, '未知项目'),
        year_month: record.year_month,
        work_hours: parseNumeric(record.work_hours),
        hourly_rate: parseNumeric(record.hourly_rate),
        contract_work_pay: parseNumeric(record.contract_work_pay),
        gross_pay: parseNumeric(record.gross_pay),
        income_tax: parseNumeric(record.income_tax),
        advance_pay: parseNumeric(record.advance_pay),
        labor_insurance: parseNumeric(record.labor_insurance),
        fine: parseNumeric(record.fine),
        net_pay: netPay,
        paid_amount: paidAmount,
        unpaid_amount: calculateSalaryUnpaidAmount(netPay, paidAmount),
        payment_status: calculateSalaryPaymentStatus(netPay, paidAmount),
        payment_warning: Math.round((paidAmount - netPay) * 100) / 100 > SALARY_PAYMENT_TOLERANCE ? '已发金额超过当月实发工资，请核实工资发放记录' : null,
        remark: record.remark,
      };
    });

    // 计算总金额
    const totalGrossPay = filteredData.reduce((sum: number, record) => {
      return sum + parseNumeric(record.gross_pay || '0');
    }, 0);

    const totalNetPay = filteredData.reduce((sum: number, record) => {
      return sum + parseNumeric(record.net_pay || '0');
    }, 0);

    const totalPaid = filteredData.reduce((sum: number, record) => {
      return sum + getPaidAmount(record);
    }, 0);

    // 按项目汇总
    const projectSummaryMap = new Map<string, {
      project_id: number | null;
      project_name: string;
      total_gross_pay: number;
      total_income_tax: number;
      total_advance_pay: number;
      total_labor_insurance: number;
      total_fine: number;
      total_net_pay: number;
      total_paid: number;
      worker_count: number;
    }>();

    filteredData.forEach((record) => {
      const projectName = getRelatedName(record.projects, '未分配项目');
      const projectId = record.project_id;
      const grossPay = parseNumeric(record.gross_pay || '0');
      const incomeTax = parseNumeric(record.income_tax || '0');
      const advancePay = parseNumeric(record.advance_pay || '0');
      const laborInsurance = parseNumeric(record.labor_insurance || '0');
      const fine = parseNumeric(record.fine || '0');
      const netPay = parseNumeric(record.net_pay || '0');
      const paidAmount = getPaidAmount(record);

      const key = String(projectId || 'null');
      
      if (!projectSummaryMap.has(key)) {
        projectSummaryMap.set(key, {
          project_id: projectId,
          project_name: projectName,
          total_gross_pay: 0,
          total_income_tax: 0,
          total_advance_pay: 0,
          total_labor_insurance: 0,
          total_fine: 0,
          total_net_pay: 0,
          total_paid: 0,
          worker_count: 0,
        });
      }

      const summary = projectSummaryMap.get(key)!;
      summary.total_gross_pay += grossPay;
      summary.total_income_tax += incomeTax;
      summary.total_advance_pay += advancePay;
      summary.total_labor_insurance += laborInsurance;
      summary.total_fine += fine;
      summary.total_net_pay += netPay;
      summary.total_paid += paidAmount;
      summary.worker_count += 1;
    });

    const projectSummary = Array.from(projectSummaryMap.values());

    return NextResponse.json({ 
      salaries,
      totalGrossPay: totalGrossPay.toFixed(2),
      totalNetPay: totalNetPay.toFixed(2),
      totalPaid: totalPaid.toFixed(2),
      projectSummary,
    });
  } catch (error: unknown) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: getErrorMessage(error, '查询失败') },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      worker_id, 
      project_id, 
      year_month,
      work_hours,
      hourly_rate,
      contract_work_pay,
      gross_pay,
      income_tax,
      advance_pay,
      labor_insurance,
      fine,
      net_pay,
      remark 
    } = body;

    // 计算应发工资和实发工资（前端可能未传入，由后端自动计算）
    const calculatedGrossPay = gross_pay != null ? gross_pay : (parseFloat(work_hours || '0') * parseFloat(hourly_rate || '0') + parseFloat(contract_work_pay || '0'));
    const calculatedNetPay = net_pay != null ? net_pay : (calculatedGrossPay - parseFloat(income_tax || '0') - parseFloat(advance_pay || '0') - parseFloat(labor_insurance || '0') - parseFloat(fine || '0'));

    if (worker_id == null || project_id == null || !year_month) {
      return NextResponse.json({ error: '请填写完整信息' }, { status: 400 });
    }

    const client = getSupabaseClient();
    
    // 获取当前用户并验证权限
    const user = await getCurrentUser();
    const accessibleProjects = await getAccessibleProjectIds(user?.id || 0, user?.role || 'admin');
    const isSuperAdmin = user?.role === 'super_admin';
    
    if (!isSuperAdmin && (accessibleProjects.length === 0 || !accessibleProjects.includes(project_id))) {
      return NextResponse.json({ error: '无权在该项目下创建工资记录' }, { status: 403 });
    }

    const { data: existingSalary, error: existingError } = await client
      .from('worker_salaries')
      .select('id')
      .eq('worker_id', parseInt(worker_id))
      .eq('project_id', parseInt(project_id))
      .eq('year_month', year_month)
      .maybeSingle();

    if (existingError) {
      throw new Error(`检查重复工资记录失败: ${existingError.message}`);
    }

    if (existingSalary) {
      return NextResponse.json(
        { error: '该工人在当前项目、当前月份已有工资核算记录，请编辑原记录或先删除重复记录' },
        { status: 400 }
      );
    }
    
    const { data, error } = await insertWithSequenceFix('worker_salaries', { 
        worker_id: parseInt(worker_id),
        project_id: parseInt(project_id),
        year_month,
        work_hours: work_hours || '0',
        hourly_rate: hourly_rate || '0',
        contract_work_pay: contract_work_pay || '0',
        gross_pay: calculatedGrossPay,
        income_tax: income_tax || '0',
        advance_pay: advance_pay || '0',
        labor_insurance: labor_insurance || '0',
        fine: fine || '0',
        net_pay: calculatedNetPay,
        remark 
      }, client);

    const salaryData = Array.isArray(data) ? data[0] : data;

    if (error) {
      throw new Error(`创建工资记录失败: ${error.message}`);
    }

    if (salaryData?.id) {
      await syncSalaryPaymentStatus(Number(salaryData.id));
    }

    await auditLog({
      operationType: 'create',
      resourceType: 'worker_salary',
      resourceId: salaryData?.id,
      details: { worker_id, project_id, year_month, gross_pay, net_pay },
      request,
    });

    const { data: worker } = worker_id
      ? await client.from('workers').select('name').eq('id', Number(worker_id)).maybeSingle()
      : { data: null };

    // 钉钉推送通知
    await pushBusinessNotification({
      type: 'new_worker_salary',
      title: '新增月度工资',
      content: `新增月度工资记录，核算周期: ${year_month}，应发: ¥${Number(gross_pay).toLocaleString()}，实发: ¥${Number(net_pay).toLocaleString()}`,
      severity: 'info',
      projectId: project_id ? parseInt(String(project_id)) : undefined,
      relatedId: salaryData?.id,
      relatedType: 'worker_salary',
      metadata: {
        worker_id,
        project_id,
        year_month,
        yearMonth: year_month,
        gross_pay,
        net_pay,
        amount: Number(net_pay || gross_pay || 0),
        workerName: worker?.name,
        businessSummary: `${worker?.name || '工人'} ${year_month} 工资核算，实发 ¥${Number(net_pay || 0).toLocaleString()}，应发 ¥${Number(gross_pay || 0).toLocaleString()}`,
      },
    });

    return NextResponse.json({ salary: salaryData });
  } catch (error: unknown) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: getErrorMessage(error, '创建失败') },
      { status: 500 }
    );
  }
}
