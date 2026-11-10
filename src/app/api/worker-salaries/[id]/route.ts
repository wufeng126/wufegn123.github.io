import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { auditLog } from '@/lib/audit-log';
import { requireApiWritePermission } from '@/lib/api-auth';
import { isSalaryPaymentLocked } from '@/lib/business-logic';
import { getAccessibleProjectIds } from '@/lib/api-project-access';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const salaryId = Number(id);
    if (!Number.isInteger(salaryId) || salaryId <= 0) {
      return NextResponse.json({ error: '无效的工资记录ID' }, { status: 400 });
    }

    const client = getSupabaseClient();
    
    // 先查询记录信息用于审计日志
    const { data: salaryData, error: salaryQueryError } = await client
      .from('worker_salaries')
      .select('id, worker_id, project_id, year_month, net_pay, payment_status')
      .eq('id', salaryId)
      .maybeSingle();

    if (salaryQueryError) {
      throw new Error(`查询工资记录失败: ${salaryQueryError.message}`);
    }

    if (!salaryData) {
      return NextResponse.json({ error: 'Salary record not found' }, { status: 404 });
    }

    const accessibleProjectIds = await getAccessibleProjectIds(client, auth.user);
    if (
      accessibleProjectIds !== null &&
      (!salaryData.project_id || !accessibleProjectIds.includes(Number(salaryData.project_id)))
    ) {
      return NextResponse.json({ error: '无权操作该项目下的工资记录' }, { status: 403 });
    }

    if (isSalaryPaymentLocked(salaryData.payment_status)) {
      return NextResponse.json({ error: '该工资记录已有发放，不能删除（请先删除发放记录）' }, { status: 400 });
    }

    // 状态可能滞后（异步同步失败/延迟）：再实时查一次发放记录，避免级联删掉已发流水
    {
      const { count: paymentCount } = await client
        .from('salary_payments')
        .select('id', { count: 'exact', head: true })
        .eq('salary_id', salaryId);
      if ((paymentCount || 0) > 0) {
        return NextResponse.json({ error: `该工资记录已有 ${paymentCount} 条发放记录，不能删除` }, { status: 400 });
      }
    }

    const { error } = await client
      .from('worker_salaries')
      .delete()
      .eq('id', salaryId);

    if (error) {
      throw new Error(`删除工资记录失败: ${error.message}`);
    }

    await auditLog({
      operationType: 'delete',
      resourceType: 'worker_salary',
      resourceId: salaryId,
      details: { deleted: salaryData },
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

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const salaryId = Number(id);
    if (!Number.isInteger(salaryId) || salaryId <= 0) {
      return NextResponse.json({ error: '无效的工资记录ID' }, { status: 400 });
    }

    const client = getSupabaseClient();
    const { data: current, error: queryError } = await client
      .from('worker_salaries')
      .select('*')
      .eq('id', salaryId)
      .maybeSingle();
    if (queryError) throw new Error(queryError.message);
    if (!current) return NextResponse.json({ error: '工资记录不存在' }, { status: 404 });

    const accessibleProjectIds = await getAccessibleProjectIds(client, auth.user);
    if (accessibleProjectIds !== null && !accessibleProjectIds.includes(Number(current.project_id))) {
      return NextResponse.json({ error: '无权修改该项目的工资记录' }, { status: 403 });
    }
    if (isSalaryPaymentLocked(current.payment_status)) {
      return NextResponse.json({ error: '该工资记录已有发放，不能直接修改；请先在「工资发放」中删除对应发放记录后再改' }, { status: 400 });
    }

    const body = await request.json();
    const num = (value: unknown, fallback: number) => {
      const n = Number(String(value ?? '').replace(/,/g, ''));
      return Number.isFinite(n) ? n : fallback;
    };
    const workHours = num(body.work_hours, Number(current.work_hours) || 0);
    const hourlyRate = num(body.hourly_rate, Number(current.hourly_rate) || 0);
    const contractWorkPay = num(body.contract_work_pay, Number(current.contract_work_pay) || 0);
    const incomeTax = num(body.income_tax, Number(current.income_tax) || 0);
    const advancePay = num(body.advance_pay, Number(current.advance_pay) || 0);
    const laborInsurance = num(body.labor_insurance, Number(current.labor_insurance) || 0);
    const fine = num(body.fine, Number(current.fine) || 0);
    const grossPay = body.gross_pay !== undefined && body.gross_pay !== null && body.gross_pay !== ''
      ? num(body.gross_pay, 0)
      : workHours * hourlyRate + contractWorkPay;
    const netPay = body.net_pay !== undefined && body.net_pay !== null && body.net_pay !== ''
      ? num(body.net_pay, 0)
      : grossPay - incomeTax - advancePay - laborInsurance - fine;

    const category = String(body.person_category || current.person_category || 'production');
    const updateData = {
      work_hours: workHours,
      hourly_rate: hourlyRate,
      contract_work_pay: contractWorkPay,
      gross_pay: Number(grossPay.toFixed(2)),
      income_tax: incomeTax,
      advance_pay: advancePay,
      labor_insurance: laborInsurance,
      fine,
      net_pay: Number(netPay.toFixed(2)),
      person_category: ['production', 'management', 'support'].includes(category) ? category : 'production',
      remark: body.remark !== undefined ? String(body.remark || '') : current.remark,
    };

    const { error: updateError } = await client.from('worker_salaries').update(updateData).eq('id', salaryId);
    if (updateError) throw new Error(updateError.message);

    await auditLog({
      operationType: 'update',
      resourceType: 'worker_salary',
      resourceId: salaryId,
      details: { before: { gross_pay: current.gross_pay, net_pay: current.net_pay }, after: { gross_pay: updateData.gross_pay, net_pay: updateData.net_pay } },
      request,
    });

    return NextResponse.json({ success: true, data: updateData });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '修改工资失败' }, { status: 500 });
  }
}
