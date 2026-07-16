import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { syncAllSalaryPaymentStatus } from '@/lib/business-logic';
import { auditLog } from '@/lib/audit-log';
import { logSecurityEvent } from '@/lib/security-log';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { payments } = body;

    if (!payments || !Array.isArray(payments) || payments.length === 0) {
      return NextResponse.json({ error: '请提供有效的发放数据' }, { status: 400 });
    }

    const client = getSupabaseClient();

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
      details: { count: data?.length, totalAmount: payments.reduce((sum: number, p: any) => sum + Number(p.payment_amount || 0), 0) },
      request,
    });

    await logSecurityEvent({
      event_type: 'salary_payment_batch',
      ip_address: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown',
      user_agent: request.headers.get('user-agent') || 'unknown',
      result: 'success',
      details: { count: data?.length, totalAmount: payments.reduce((sum: number, p: any) => sum + Number(p.payment_amount || 0), 0) },
    });

    return NextResponse.json({ payments: data, count: data?.length || 0 });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error.message || '创建失败' },
      { status: 500 }
    );
  }
}
