import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const contractId = searchParams.get('contract_id');

  const supabase = getSupabaseClient();

  // 如果没有合同ID，返回所有合同的汇总
  if (!contractId) {
    // 获取所有结算记录
    const { data: settlements, error: settlementsError } = await supabase
      .from('supplier_settlements')
      .select('*');

    if (settlementsError) {
      return Response.json({ error: settlementsError.message }, { status: 500 });
    }

    // 获取所有付款记录
    const { data: payments, error: paymentsError } = await supabase
      .from('supplier_payments')
      .select('*');

    if (paymentsError) {
      return Response.json({ error: paymentsError.message }, { status: 500 });
    }

    // 计算全局汇总
    const totalSettlementAmount = settlements.reduce((sum: number, s: any) => sum + Number(s.settlement_amount || 0), 0);
    const totalPayable = settlements.reduce((sum: number, s: any) => sum + Number(s.payable_amount || 0), 0);
    const totalPaid = payments.reduce((sum: number, p: any) => sum + Number(p.payment_amount || 0), 0);

    return Response.json({
      supplierCost: totalSettlementAmount,
      supplierPaid: totalPaid,
      supplierPending: totalPayable - totalPaid,
    });
  }

  // 获取该合同的所有结算记录
  const { data: settlements, error: settlementsError } = await supabase
    .from('supplier_settlements')
    .select('*')
    .eq('contract_id', contractId)
    .order('settlement_date', { ascending: true });

  if (settlementsError) {
    return Response.json({ error: settlementsError.message }, { status: 500 });
  }

  // 获取该合同的所有付款记录
  const { data: payments, error: paymentsError } = await supabase
    .from('supplier_payments')
    .select('payment_amount')
    .eq('contract_id', contractId);

  if (paymentsError) {
    return Response.json({ error: paymentsError.message }, { status: 500 });
  }

  // 计算汇总数据
  const totalSettlementAmount = settlements.reduce((sum: number, s: any) => sum + Number(s.settlement_amount || 0), 0);
  const totalPayable = settlements.reduce((sum: number, s: any) => sum + Number(s.payable_amount || 0), 0);
  const totalPaid = payments.reduce((sum: number, p: any) => sum + Number(p.payment_amount || 0), 0);
  
  // 决算应付金额 = 累计结算金额（固定100%）
  const totalFinalPayable = totalSettlementAmount;
  
  // 进度未付 = 履约应付 - 已付
  const totalProgressPending = totalPayable - totalPaid;
  
  // 决算未付 = 决算应付 - 已付
  const totalFinalPending = totalFinalPayable - totalPaid;

  // 检查是否有决算
  const hasFinalSettlement = settlements.some((s: any) => s.settlement_type === 'final');

  const summary = {
    contractId: Number(contractId),
    totalSettlements: settlements.length,
    totalAmount: totalSettlementAmount,
    totalPayable,
    totalFinalPayable,
    totalPaid,
    totalProgressPending,
    totalFinalPending,
    hasFinalSettlement,
    settlements: settlements.map((s: any) => ({
      id: s.id,
      type: s.settlement_type,
      amount: s.settlement_amount,
      payable: s.payable_amount,
      date: s.settlement_date,
    })),
  };

  return Response.json({ summary });
}
