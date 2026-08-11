import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAuth } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const client = getSupabaseClient();

    // 1. 查询所有工资记录
    const { data: salaries, error: salariesError } = await client
      .from('worker_salaries')
      .select('id, worker_id, project_id, year_month, gross_pay, net_pay, payment_status')
      .limit(10);

    if (salariesError) {
      throw new Error(`查询工资记录失败：${salariesError.message}`);
    }

    // 2. 查询所有发放记录
    const { data: payments, error: paymentsError } = await client
      .from('salary_payments')
      .select('id, salary_id, worker_id, project_id, year_month, payment_amount');

    if (paymentsError) {
      throw new Error(`查询发放记录失败：${paymentsError.message}`);
    }

    // 3. 按 salary_id 聚合发放金额
    const paidBySalaryId = new Map<number, number>();
    const paidByMatchKey = new Map<string, number>();

    (payments || []).forEach((p: any) => {
      const amount = parseFloat(String(p.payment_amount)) || 0;
      if (p.salary_id) {
        paidBySalaryId.set(p.salary_id, (paidBySalaryId.get(p.salary_id) || 0) + amount);
      } else if (p.worker_id && p.project_id && p.year_month) {
        const key = `${p.worker_id}:${p.project_id}:${p.year_month}`;
        paidByMatchKey.set(key, (paidByMatchKey.get(key) || 0) + amount);
      }
    });

    // 4. 计算每条工资记录的已发金额
    const salaryDetails = (salaries || []).map((s: any) => {
      const linkedPaid = paidBySalaryId.get(s.id) || 0;
      const matchKey = `${s.worker_id}:${s.project_id}:${s.year_month}`;
      const unlinkedPaid = paidByMatchKey.get(matchKey) || 0;
      const totalPaid = linkedPaid + unlinkedPaid;

      return {
        salary_id: s.id,
        worker_id: s.worker_id,
        project_id: s.project_id,
        year_month: s.year_month,
        gross_pay: parseFloat(String(s.gross_pay)) || 0,
        net_pay: parseFloat(String(s.net_pay)) || 0,
        payment_status: s.payment_status,
        linked_paid: linkedPaid,
        unlinked_paid: unlinkedPaid,
        total_paid: totalPaid,
        unpaid: (parseFloat(String(s.net_pay)) || 0) - totalPaid,
      };
    });

    // 5. 统计汇总
    const totalGrossPay = salaryDetails.reduce((sum, s) => sum + s.gross_pay, 0);
    const totalNetPay = salaryDetails.reduce((sum, s) => sum + s.net_pay, 0);
    const totalPaid = salaryDetails.reduce((sum, s) => sum + s.total_paid, 0);
    const totalUnpaid = totalNetPay - totalPaid;

    return NextResponse.json({
      success: true,
      summary: {
        total_salaries: salaries?.length || 0,
        total_payments: payments?.length || 0,
        total_gross_pay: totalGrossPay,
        total_net_pay: totalNetPay,
        total_paid: totalPaid,
        total_unpaid: totalUnpaid,
      },
      salary_details: salaryDetails,
      payment_records: payments || [],
    });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error.message || '查询失败' },
      { status: 500 }
    );
  }
}
