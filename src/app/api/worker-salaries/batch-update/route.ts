import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { syncSalaryPaymentStatus } from '@/lib/business-logic';
import { requireApiWritePermission } from '@/lib/api-auth';

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const { ids, field, value } = body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: '请提供要修改的工资记录ID' }, { status: 400 });
    }

    if (!field) {
      return NextResponse.json({ error: '请提供要修改的字段' }, { status: 400 });
    }

    // 允许批量修改的字段
    const allowedFields = ['work_hours', 'hourly_rate', 'contract_work_pay', 'income_tax', 'advance_pay', 'labor_insurance', 'fine'];
    if (!allowedFields.includes(field)) {
      return NextResponse.json({ error: '不支持批量修改此字段' }, { status: 400 });
    }

    const client = getSupabaseClient();
    
    // 先获取原有记录
    const { data: existingRecords, error: fetchError } = await client
      .from('worker_salaries')
      .select('*')
      .in('id', ids);

    if (fetchError) {
      throw new Error(`查询工资记录失败: ${fetchError.message}`);
    }

    // 更新字段并重新计算
    const updatePromises = existingRecords?.map(async (record) => {
      const nextValue = value ?? '0';
      const updateData: Record<string, string> = { [field]: nextValue };
      
      // 获取更新后的值
      const workHours = field === 'work_hours' ? parseFloat(nextValue) : parseFloat(record.work_hours || '0');
      const hourlyRate = field === 'hourly_rate' ? parseFloat(nextValue) : parseFloat(record.hourly_rate || '0');
      const contractWorkPay = field === 'contract_work_pay' ? parseFloat(nextValue) : parseFloat(record.contract_work_pay || '0');
      const incomeTax = field === 'income_tax' ? parseFloat(nextValue) : parseFloat(record.income_tax || '0');
      const advancePay = field === 'advance_pay' ? parseFloat(nextValue) : parseFloat(record.advance_pay || '0');
      const laborInsurance = field === 'labor_insurance' ? parseFloat(nextValue) : parseFloat(record.labor_insurance || '0');
      const fine = field === 'fine' ? parseFloat(nextValue) : parseFloat(record.fine || '0');
      
      // 重新计算
      const grossPay = workHours * hourlyRate + contractWorkPay;
      const netPay = grossPay - incomeTax - advancePay - laborInsurance - fine;
      
      updateData.gross_pay = grossPay.toFixed(2);
      updateData.net_pay = netPay.toFixed(2);
      
      return client
        .from('worker_salaries')
        .update(updateData)
        .eq('id', record.id);
    }) || [];

    await Promise.all(updatePromises);

    for (const id of ids) {
      await syncSalaryPaymentStatus(Number(id));
    }

    return NextResponse.json({ success: true, count: ids.length });
  } catch (error: unknown) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: getErrorMessage(error, '修改失败') },
      { status: 500 }
    );
  }
}
