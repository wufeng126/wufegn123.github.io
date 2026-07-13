import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { auditLog, insertWithSequenceFix } from '@/lib/audit-log';
import { logSecurityEvent } from '@/lib/security-log';
import { requireApiWritePermission, requireAuth } from '@/lib/api-auth';
import { validateSupplierPayment, validateSupplierSettlementPayment } from '@/lib/business-logic';

// GET /api/supplier-contracts/payments - 获取付款记录列表
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const supabase = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const contractId = searchParams.get('contract_id');
    const settlementId = searchParams.get('settlement_id');

    let query = supabase
      .from('supplier_payments')
      .select(`
        *,
        contract:contract_id(id, contract_name, contract_no, supplier_id),
        settlement:settlement_id(id, settlement_no, settlement_type, payable_amount)
      `)
      .order('payment_date', { ascending: false });

    if (contractId && contractId !== 'all') {
      query = query.eq('contract_id', parseInt(contractId));
    }
    if (settlementId && settlementId !== 'all') {
      query = query.eq('settlement_id', parseInt(settlementId));
    }

    const { data, error } = await query;
    if (error) throw error;

    const supplierIds = [...new Set((data || []).map((p: any) => p.contract?.supplier_id).filter(Boolean))];
    const suppliersMap: Record<number, any> = {};

    if (supplierIds.length > 0) {
      const { data: suppliers } = await supabase
        .from('suppliers')
        .select('id, name')
        .in('id', supplierIds);

      (suppliers || []).forEach((s: any) => {
        suppliersMap[s.id] = s;
      });
    }

    const paymentsWithDetails = (data || []).map((payment: any) => ({
      ...payment,
      supplier_name: suppliersMap[payment.contract?.supplier_id]?.name || '',
    }));

    const summary = {
      totalPayments: paymentsWithDetails.length,
      totalAmount: paymentsWithDetails.reduce((sum: number, p: any) => sum + Number(p.payment_amount || 0), 0),
    };

    return NextResponse.json({
      payments: paymentsWithDetails,
      summary,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/supplier-contracts/payments - 新增付款记录
export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const supabase = getSupabaseClient();
    const body = await request.json();
    const { contract_id, settlement_id, payment_amount, payment_date, payment_method, payment_account, remark, payment_type } = body;

    if (!contract_id) {
      return NextResponse.json({ error: '请选择合同' }, { status: 400 });
    }
    if (!payment_amount || Number(payment_amount) <= 0) {
      return NextResponse.json({ error: '请输入有效的付款金额' }, { status: 400 });
    }

    const contractId = Number(contract_id);
    const settlementId = settlement_id ? Number(settlement_id) : null;
    const paymentAmount = Number(payment_amount);

    const contractValidation = await validateSupplierPayment({
      contract_id: contractId,
      payment_amount: paymentAmount,
    });
    if (!contractValidation.valid) {
      return NextResponse.json({ error: contractValidation.message }, { status: 400 });
    }

    if (settlementId) {
      const settlementValidation = await validateSupplierSettlementPayment({
        settlement_id: settlementId,
        payment_amount: paymentAmount,
      });
      if (!settlementValidation.valid) {
        return NextResponse.json({ error: settlementValidation.message }, { status: 400 });
      }
    }

    const now = new Date();
    const paymentNo = `FK${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getTime()).slice(-6)}`;

    let finalPaymentType = payment_type || 'progress';
    if (!payment_type && settlementId) {
      const { data: settlement } = await supabase
        .from('supplier_settlements')
        .select('settlement_type')
        .eq('id', settlementId)
        .single();
      if (settlement?.settlement_type) {
        finalPaymentType = settlement.settlement_type;
      }
    }

    const { data: paymentArr, error } = await insertWithSequenceFix('supplier_payments', {
      contract_id: contractId,
      settlement_id: settlementId,
      payment_no: paymentNo,
      payment_amount: paymentAmount,
      payment_date: payment_date || null,
      payment_method: payment_method || '银行转账',
      payment_account: payment_account || null,
      remark: remark || null,
      payment_type: finalPaymentType,
      created_by: auth.user.id,
      created_by_name: auth.user.name || auth.user.username,
    }, supabase);

    const paymentData = Array.isArray(paymentArr) ? paymentArr[0] : paymentArr;

    if (error) throw error;

    await auditLog({
      operationType: 'create',
      resourceType: 'supplier_payment',
      resourceId: paymentData?.id,
      details: { contract_id: contractId, payment_amount: paymentAmount },
      request,
    });

    await logSecurityEvent({
      event_type: 'supplier_payment_create',
      ip_address: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown',
      user_agent: request.headers.get('user-agent') || 'unknown',
      result: 'success',
      details: { payment_id: paymentData?.id, contract_id: contractId, payment_amount: paymentAmount, payment_type: finalPaymentType },
    });

    return NextResponse.json({ payment: paymentData });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
