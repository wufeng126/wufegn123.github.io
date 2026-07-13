import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { auditLog, insertWithSequenceFix } from '@/lib/audit-log';
import { isVoidedStatus } from '@/lib/business-logic';

// GET /api/supplier-contracts - 获取合同列表
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const supplierId = searchParams.get('supplier_id');
    const status = searchParams.get('status');
    const projectId = searchParams.get('project_id');

    let query = supabase
      .from('supplier_contracts')
      .select(`
        *,
        supplier:supplier_id(id, name)
      `)
      .order('created_at', { ascending: false });

    if (supplierId && supplierId !== 'all') {
      query = query.eq('supplier_id', parseInt(supplierId));
    }
    if (status && status !== 'all') {
      query = query.eq('contract_status', status);
    }
    if (projectId && projectId !== 'all') {
      query = query.eq('project_id', parseInt(projectId));
    }

    const { data, error } = await query;
    if (error) throw error;

    // 获取每个合同的结算和付款统计
    const contractsWithStats = await Promise.all(
      (data || []).map(async (contract: any) => {
        // 获取结算统计
        const { data: settlements } = await supabase
          .from('supplier_settlements')
          .select('settlement_amount, payable_amount, settlement_type, status')
          .eq('contract_id', contract.id);

        const activeSettlements = (settlements || []).filter((s: any) => !isVoidedStatus(s.status));

        const totalSettlement = activeSettlements.reduce(
          (sum: number, s: any) => sum + Number(s.settlement_amount || 0), 0
        );
        const totalPayable = activeSettlements.reduce(
          (sum: number, s: any) => sum + Number(s.payable_amount || 0), 0
        );

        // 获取已完结结算单
        const completeSettlement = activeSettlements.find((s: any) => s.settlement_type === '结算完');

        // 获取付款统计
        const { data: payments } = await supabase
          .from('supplier_payments')
          .select('payment_amount')
          .eq('contract_id', contract.id);

        const totalPaid = (payments || []).reduce(
          (sum: number, p: any) => sum + Number(p.payment_amount || 0), 0
        );

        return {
          ...contract,
          total_settlement: totalSettlement,
          total_payable: totalPayable,
          total_paid: totalPaid,
          pending_amount: totalPayable - totalPaid,
          has_complete_settlement: !!completeSettlement,
        };
      })
    );

    // 计算汇总
    const summary = {
      totalContracts: contractsWithStats.length,
      totalAmount: contractsWithStats.reduce((sum: number, c: any) => sum + Number(c.total_amount || 0), 0),
      totalSettlement: contractsWithStats.reduce((sum: number, c: any) => sum + c.total_settlement, 0),
      totalPayable: contractsWithStats.reduce((sum: number, c: any) => sum + c.total_payable, 0),
      totalPaid: contractsWithStats.reduce((sum: number, c: any) => sum + c.total_paid, 0),
      totalPending: contractsWithStats.reduce((sum: number, c: any) => sum + c.pending_amount, 0),
    };

    return NextResponse.json({
      contracts: contractsWithStats,
      summary,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/supplier-contracts - 新增合同
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    const body = await request.json();
    const {
      supplier_id, project_id, contract_no, contract_name, sign_date, expire_date,
      total_amount, supply_content, attachment_url, payment_method,
      payment_ratio_active, payment_ratio_complete, payment_ratio_final, payment_days,
      payment_remark, remark
    } = body;

    if (!supplier_id) {
      return NextResponse.json({ error: '请选择供应商' }, { status: 400 });
    }
    if (!contract_name) {
      return NextResponse.json({ error: '请输入合同名称' }, { status: 400 });
    }

    // 获取用户信息
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;

    const { data, error } = await insertWithSequenceFix('supplier_contracts', {
        supplier_id,
        project_id: project_id || null,
        contract_no: contract_no || null,
        contract_name,
        sign_date: sign_date || null,
        expire_date: expire_date || null,
        total_amount: total_amount === '' ? null : (total_amount ? Number(total_amount) : 0),
        supply_content: supply_content || null,
        attachment_url: attachment_url || null,
        payment_method: payment_method || '按进度付款',
        payment_ratio_active: payment_ratio_active === '' ? null : (payment_ratio_active ? Number(payment_ratio_active) : 80),
        payment_ratio_complete: payment_ratio_complete === '' ? null : (payment_ratio_complete ? Number(payment_ratio_complete) : 95),
        payment_ratio_final: payment_ratio_final === '' ? null : (payment_ratio_final ? Number(payment_ratio_final) : 0),
        payment_days: payment_days === '' ? null : (payment_days ? Number(payment_days) : null),
        payment_remark: payment_remark || null,
        remark: remark || null,
        contract_status: '履约中',
        created_by: user?.id,
        created_by_name: user?.user_metadata?.username || user?.email,
      }, supabase);

    const contractData = Array.isArray(data) ? data[0] : data;

    if (error) throw error;

    // 记录日志
    await supabase.from('supplier_contract_logs').insert({
      contract_id: contractData.id,
      action: '创建合同',
      operator_id: user?.id,
      operator_name: user?.user_metadata?.username || user?.email,
      detail: { contract: contractData },
    });

    // 记录审计日志
    await auditLog({
      operationType: 'create',
      resourceType: 'supplier_contract',
      resourceId: contractData?.id,
      details: { contract_name: contractData?.contract_name, supplier_id, total_amount },
      request,
    });

    return NextResponse.json({ contract: contractData });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
