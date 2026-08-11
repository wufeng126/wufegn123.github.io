import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { syncAllSalaryPaymentStatus } from '@/lib/business-logic';
import { auditLog } from '@/lib/audit-log';
import { logSecurityEvent } from '@/lib/security-log';
import { requireApiWritePermission } from '@/lib/api-auth';

type SalaryPaymentBatchRow = {
  salary_id?: number | string | null;
  worker_id: number | string;
  project_id: number | string;
  year_month: string;
  payment_amount: number | string;
  payment_date: string;
  payment_type?: string | null;
  remark?: string | null;
};

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

async function validateSalaryPaymentRows(
  client: ReturnType<typeof getSupabaseClient>,
  payments: SalaryPaymentBatchRow[]
) {
  for (const [index, payment] of payments.entries()) {
    if (!payment.worker_id || !payment.project_id || !payment.year_month || !payment.payment_amount || !payment.payment_date) {
      throw new Error(`第 ${index + 1} 条发放记录缺少工人、项目、月份、金额或发放日期`);
    }
  }

  const salaryIds = [
    ...new Set(
      payments
        .map((payment) => Number(payment.salary_id || 0))
        .filter((id) => Number.isInteger(id) && id > 0)
    ),
  ];

  if (salaryIds.length === 0) return;

  const { data: salaryRows, error } = await client
    .from('worker_salaries')
    .select('id, worker_id, project_id, year_month')
    .in('id', salaryIds);

  if (error) {
    throw new Error(`校验工资核算单失败: ${error.message}`);
  }

  const salaryMap = new Map((salaryRows || []).map((salary) => [Number(salary.id), salary]));

  for (const [index, payment] of payments.entries()) {
    const salaryId = Number(payment.salary_id || 0);
    if (!salaryId) continue;

    const salary = salaryMap.get(salaryId);
    if (!salary) {
      throw new Error(`第 ${index + 1} 条发放记录未找到对应的工资核算单`);
    }

    if (
      Number(salary.worker_id) !== Number(payment.worker_id) ||
      Number(salary.project_id) !== Number(payment.project_id) ||
      String(salary.year_month || '') !== String(payment.year_month || '')
    ) {
      throw new Error(`第 ${index + 1} 条发放记录与工资核算单不一致，请检查工人、项目和工资月份`);
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const payments = (body as { payments?: SalaryPaymentBatchRow[] }).payments;

    if (!payments || !Array.isArray(payments) || payments.length === 0) {
      return NextResponse.json({ error: '请提供有效的发放数据' }, { status: 400 });
    }

    const client = getSupabaseClient();

    await validateSalaryPaymentRows(client, payments);

    const { data, error } = await client
      .from('salary_payments')
      .insert(payments.map(p => ({
        salary_id: p.salary_id || null,
        worker_id: p.worker_id,
        project_id: p.project_id,
        year_month: p.year_month,
        payment_amount: p.payment_amount.toString(),
        payment_date: p.payment_date,
        payment_type: p.payment_type || '甲方代付',
        remark: p.remark || null,
      })))
      .select();

    if (error) {
      throw new Error(`批量创建工资发放记录失败: ${error.message}`);
    }

    // 批量同步所有工资发放状态
    await syncAllSalaryPaymentStatus();

    // 审计日志
    await auditLog({
      operationType: 'salary_pay',
      resourceType: 'salary_payment',
      details: { count: data?.length, totalAmount: payments.reduce((sum, p) => sum + Number(p.payment_amount || 0), 0) },
      request,
    });

    await logSecurityEvent({
      event_type: 'salary_payment_batch',
      ip_address: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown',
      user_agent: request.headers.get('user-agent') || 'unknown',
      result: 'success',
      details: { count: data?.length, totalAmount: payments.reduce((sum, p) => sum + Number(p.payment_amount || 0), 0) },
    });

    return NextResponse.json({ payments: data, count: data?.length || 0 });
  } catch (error: unknown) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: getErrorMessage(error, '创建失败') },
      { status: 500 }
    );
  }
}
