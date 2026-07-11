import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { syncAllSalaryPaymentStatus, parseNumeric } from '@/lib/business-logic';
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

    // 批量超额检查：每个 salary_id 的累计发放不能超过实发工资
    const salaryIds = [...new Set(payments.map((p: any) => p.salary_id).filter(Boolean))];
    if (salaryIds.length > 0) {
      // 获取工资记录
      const { data: salaryRecords } = await client
        .from('worker_salaries')
        .select('id, net_pay')
        .in('id', salaryIds.map((id: any) => parseInt(String(id))));

      // 获取已有发放
      const { data: existingPayments } = await client
        .from('salary_payments')
        .select('salary_id, payment_amount')
        .in('salary_id', salaryIds.map((id: any) => parseInt(String(id))));

      // 汇总已有发放
      const paidMap = new Map<number, number>();
      (existingPayments || []).forEach((p: any) => {
        const current = paidMap.get(p.salary_id) || 0;
        paidMap.set(p.salary_id, current + parseNumeric(p.payment_amount));
      });

      // 汇总本次发放
      const newPayMap = new Map<number, number>();
      payments.forEach((p: any) => {
        if (p.salary_id) {
          const sid = parseInt(String(p.salary_id));
          const current = newPayMap.get(sid) || 0;
          newPayMap.set(sid, current + Number(p.payment_amount || 0));
        }
      });

      // 校验
      const salaryMap = new Map<number, number>();
      (salaryRecords || []).forEach((s: any) => {
        salaryMap.set(s.id, parseNumeric(s.net_pay));
      });

      for (const [sid, newAmount] of newPayMap) {
        const netPay = salaryMap.get(sid) || 0;
        const alreadyPaid = paidMap.get(sid) || 0;
        if (alreadyPaid + newAmount > netPay) {
          return NextResponse.json({
            error: `发放超额：工资记录#${sid} 实发 ¥${netPay.toLocaleString()}，已发 ¥${alreadyPaid.toLocaleString()}，本次 ¥${newAmount.toLocaleString()} 超出余额`
          }, { status: 400 });
        }
      }
    }
    
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
