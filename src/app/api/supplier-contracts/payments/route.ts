import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { auditLog, insertWithSequenceFix } from '@/lib/audit-log';
import { logSecurityEvent } from '@/lib/security-log';

// GET /api/supplier-contracts/payments - 获取付款记录列表
export async function GET(request: NextRequest) {
  try {
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

    // 获取供应商信息
    const supplierIds = [...new Set((data || []).map((p: any) => p.contract?.supplier_id).filter(Boolean))];
    let suppliersMap: Record<number, any> = {};

    if (supplierIds.length > 0) {
      const { data: suppliers } = await supabase
        .from('suppliers')
        .select('id, name')
        .in('id', supplierIds);

      (suppliers || []).forEach((s: any) => {
        suppliersMap[s.id] = s;
      });
    }

    // 格式化数据
    const paymentsWithDetails = (data || []).map((payment: any) => ({
      ...payment,
      supplier_name: suppliersMap[payment.contract?.supplier_id]?.name || '',
    }));

    // 计算汇总
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
    const supabase = getSupabaseClient();
    const body = await request.json();
    const { contract_id, settlement_id, payment_amount, payment_date, payment_method, payment_account, remark, payment_type } = body;

    if (!contract_id) {
      return NextResponse.json({ error: '请选择合同' }, { status: 400 });
    }
    if (!payment_amount || payment_amount <= 0) {
      return NextResponse.json({ error: '请输入有效的付款金额' }, { status: 400 });
    }

    // 验证合同存在
    const { data: contract, error: contractError } = await supabase
      .from('supplier_contracts')
      .select('*')
      .eq('id', contract_id)
      .single();

    if (contractError || !contract) {
      return NextResponse.json({ error: '合同不存在' }, { status: 400 });
    }

    // 超额检查：累计付款不能超过合同应付金额
    const contractTotal = Number(contract.total_amount || 0);
    const { data: existingPayments } = await supabase
      .from('supplier_payments')
      .select('payment_amount')
      .eq('contract_id', contract_id);
    
    const totalPaid = (existingPayments || []).reduce((sum, p) => sum + Number(p.payment_amount || 0), 0);
    
    if (contractTotal > 0 && totalPaid + Number(payment_amount) > contractTotal) {
      return NextResponse.json({ 
        error: `付款超额：已付 ¥${totalPaid.toLocaleString()} + 本次 ¥${Number(payment_amount).toLocaleString()} = ¥${(totalPaid + Number(payment_amount)).toLocaleString()}，超过合同金额 ¥${contractTotal.toLocaleString()}` 
      }, { status: 400 });
    }

    // 如果关联结算单，检查付款不超过结算单应付金额
    if (settlement_id) {
      const { data: settlement } = await supabase
        .from('supplier_contract_settlements')
        .select('payable_amount, settlement_type')
        .eq('id', settlement_id)
        .single();
      
      if (settlement?.payable_amount) {
        const settlementPayable = Number(settlement.payable_amount);
        const { data: settlementPayments } = await supabase
          .from('supplier_payments')
          .select('payment_amount')
          .eq('settlement_id', settlement_id);
        
        const settlementPaid = (settlementPayments || []).reduce((sum, p) => sum + Number(p.payment_amount || 0), 0);
        
        if (settlementPaid + Number(payment_amount) > settlementPayable) {
          return NextResponse.json({ 
            error: `付款超额：该结算单已付 ¥${settlementPaid.toLocaleString()} + 本次 ¥${Number(payment_amount).toLocaleString()} 超过应付金额 ¥${settlementPayable.toLocaleString()}` 
          }, { status: 400 });
        }
      }
    }

    // 生成付款单号
    const now = new Date();
    const paymentNo = `FK${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getTime()).slice(-6)}`;

    // 获取用户信息
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;

    // 确定付款类型：优先使用传入的类型，否则根据结算单判断
    let finalPaymentType = payment_type || 'progress';
    if (!payment_type && settlement_id) {
      const { data: settlement } = await supabase
        .from('supplier_contract_settlements')
        .select('settlement_type')
        .eq('id', settlement_id)
        .single();
      if (settlement?.settlement_type) {
        finalPaymentType = settlement.settlement_type;
      }
    }

    const { data: paymentArr, error } = await insertWithSequenceFix('supplier_payments', {
        contract_id,
        settlement_id: settlement_id || null,
        payment_no: paymentNo,
        payment_amount,
        payment_date: payment_date || null,
        payment_method: payment_method || '银行转账',
        payment_account: payment_account || null,
        remark: remark || null,
        payment_type: finalPaymentType,
        created_by: user?.id,
        created_by_name: user?.user_metadata?.username || user?.email,
      }, supabase);

    const paymentData = Array.isArray(paymentArr) ? paymentArr[0] : paymentArr;

    if (error) throw error;

    await auditLog({
      operationType: 'create',
      resourceType: 'supplier_payment',
      resourceId: paymentData?.id,
      details: { contract_id: body.contract_id, payment_amount: body.payment_amount },
      request,
    });

    await logSecurityEvent({
      event_type: 'supplier_payment_create',
      ip_address: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown',
      user_agent: request.headers.get('user-agent') || 'unknown',
      result: 'success',
      details: { payment_id: paymentData?.id, contract_id, payment_amount, payment_type: finalPaymentType },
    });

    return NextResponse.json({ payment: paymentData });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
