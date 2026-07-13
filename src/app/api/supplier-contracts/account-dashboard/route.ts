import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { isVoidedStatus } from '@/lib/business-logic';

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const supplierId = searchParams.get('supplier_id');
    const projectId = searchParams.get('project_id');

    // 获取所有合同及汇总数据
    let query = supabase
      .from('supplier_contracts')
      .select(`
        id, contract_name, contract_no, total_amount, status, locked,
        supplier:supplier_id(id, name, type),
        project:project_id(id, name)
      `);

    if (supplierId) query = query.eq('supplier_id', supplierId);
    if (projectId) query = query.eq('project_id', projectId);

    const { data: contracts, error: contractError } = await query;
    if (contractError) throw contractError;

    if (!contracts || contracts.length === 0) {
      return NextResponse.json({ items: [], summary: {} });
    }

    // 获取所有结算记录
    const contractIds = contracts.map((c: any) => c.id);
    const { data: settlements, error: settlementError } = await supabase
      .from('supplier_settlements')
      .select('*')
      .in('contract_id', contractIds);
    if (settlementError) throw settlementError;

    // 获取所有付款记录
    const { data: payments, error: paymentError } = await supabase
      .from('supplier_payments')
      .select('*')
      .in('contract_id', contractIds);
    if (paymentError) throw paymentError;

    // 计算汇总数据
    const items = contracts.map((contract: any) => {
      const contractSettlements = (settlements || []).filter((s: any) => (
        s.contract_id === contract.id && !isVoidedStatus(s.status)
      ));
      const contractPayments = (payments || []).filter((p: any) => p.contract_id === contract.id);

      // 统计结算
      const totalSettlement = contractSettlements.reduce((sum: number, s: any) => sum + Number(s.settlement_amount || 0), 0);
      const totalPayable = contractSettlements.reduce((sum: number, s: any) => sum + Number(s.payable_amount || 0), 0);
      const totalWarranty = contractSettlements.reduce((sum: number, s: any) => sum + Number(s.warranty_amount || 0), 0);

      // 统计付款
      const totalPaid = contractPayments.reduce((sum: number, p: any) => sum + Number(p.payment_amount || 0), 0);

      // 计算未付
      const pendingAmount = totalPayable - totalPaid;

      // 尾款 = 质保金返还
      const finalPayment = contractPayments
        .filter((p: any) => p.payment_type === 'warranty')
        .reduce((sum: number, p: any) => sum + Number(p.payment_amount || 0), 0);

      return {
        supplier_id: contract.supplier?.id,
        supplier_name: contract.supplier?.name,
        supplier_type: contract.supplier?.type,
        project_id: contract.project?.id,
        project_name: contract.project?.name,
        contract_id: contract.id,
        contract_name: contract.contract_name,
        contract_no: contract.contract_no,
        total_amount: Number(contract.total_amount || 0),
        total_settlement: totalSettlement,
        payable_amount: totalPayable,
        paid_amount: totalPaid,
        pending_amount: pendingAmount,
        warranty_amount: totalWarranty,
        final_payment: finalPayment,
        contract_status: contract.locked ? '已完结' : '履约中',
      };
    });

    // 全局汇总
    const summary = {
      totalContracts: items.length,
      totalAmount: items.reduce((sum: number, i: any) => sum + i.total_amount, 0),
      totalSettlement: items.reduce((sum: number, i: any) => sum + i.total_settlement, 0),
      totalPayable: items.reduce((sum: number, i: any) => sum + i.payable_amount, 0),
      totalPaid: items.reduce((sum: number, i: any) => sum + i.paid_amount, 0),
      totalPending: items.reduce((sum: number, i: any) => sum + i.pending_amount, 0),
      totalWarranty: items.reduce((sum: number, i: any) => sum + i.warranty_amount, 0),
      totalFinalPayment: items.reduce((sum: number, i: any) => sum + i.final_payment, 0),
    };

    return NextResponse.json({ items, summary });
  } catch (error: any) {
    console.error('Account dashboard error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
