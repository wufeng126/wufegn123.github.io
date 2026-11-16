import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireApiWritePermission } from '@/lib/api-auth';
import { assertProjectAccess } from '@/lib/api-project-scope';
import { syncSalaryPaymentStatus } from '@/lib/business-logic';
import { auditLog } from '@/lib/audit-log';

function parseAmount(value: unknown) {
  const n = Number(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/** PUT /api/worker-payments/[id] —— 单笔修改工资发放记录 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const paymentId = Number(id);
    if (!Number.isInteger(paymentId) || paymentId <= 0) {
      return NextResponse.json({ error: '无效的发放记录ID' }, { status: 400 });
    }

    const client = getSupabaseClient();
    const { data: current, error } = await client
      .from('salary_payments')
      .select('id, salary_id, worker_id, project_id, year_month, payment_amount, payment_date, payment_type, payer_type, remark')
      .eq('id', paymentId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!current) return NextResponse.json({ error: '发放记录不存在' }, { status: 404 });

    const access = await assertProjectAccess(client, auth.user, Number(current.project_id));
    if (!access.ok) return access.response;

    const body = await request.json().catch(() => ({}));
    const amount = parseAmount(body.payment_amount ?? body.amount);
    if (amount <= 0) return NextResponse.json({ error: '发放金额必须大于 0' }, { status: 400 });

    const update: Record<string, unknown> = {
      payment_amount: Number(amount.toFixed(2)),
      payment_date: String(body.payment_date || current.payment_date || '').slice(0, 10) || null,
      payment_type: String(body.payment_type || current.payment_type || '银行转账'),
      payer_type: ['公司支付', '甲方代付'].includes(String(body.payer_type)) ? String(body.payer_type) : (current.payer_type || '公司支付'),
      remark: body.remark !== undefined ? String(body.remark || '') : current.remark,
    };
    if (body.year_month) update.year_month = String(body.year_month).slice(0, 7);

    const { error: updateError } = await client.from('salary_payments').update(update).eq('id', paymentId);
    if (updateError) throw new Error(updateError.message);

    if (current.salary_id) {
      try {
        await syncSalaryPaymentStatus(Number(current.salary_id));
      } catch {
        // 状态同步失败不影响本次修改
      }
    }

    await auditLog({
      operationType: 'update',
      resourceType: 'salary_payment',
      resourceId: paymentId,
      details: { before: { amount: current.payment_amount, date: current.payment_date }, after: update },
      request,
    });

    return NextResponse.json({ success: true, data: update });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '修改发放记录失败' }, { status: 500 });
  }
}
