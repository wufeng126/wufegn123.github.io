import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { auditLog, insertWithSequenceFix } from '@/lib/audit-log';
import { pushBusinessNotification } from '@/lib/business-notification';
import { requireApiWritePermission, requireAuth } from '@/lib/api-auth';
import { isEffectiveSupplierPaymentStatus, isVoidedStatus, REVIEW_STATUS } from '@/lib/business-logic';

// GET /api/supplier-contracts/settlements - 获取结算单列表
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const supabase = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const contractId = searchParams.get('contract_id');
    const supplierId = searchParams.get('supplier_id');
    const settlementType = searchParams.get('settlement_type');
    const projectId = searchParams.get('project_id');

    let contractIdsForProject: number[] = [];
    if (projectId) {
      const { data: projectContracts } = await supabase
        .from('supplier_contracts')
        .select('id')
        .eq('project_id', parseInt(projectId));
      contractIdsForProject = (projectContracts || []).map((c: any) => c.id);

      if (contractIdsForProject.length === 0) {
        return NextResponse.json({
          settlements: [],
          summary: {
            totalSettlements: 0,
            totalAmount: 0,
            totalPayable: 0,
            totalFinalPayable: 0,
            totalPaid: 0,
            totalProgressPending: 0,
            totalFinalPending: 0,
          },
        });
      }
    }

    let query = supabase
      .from('supplier_settlements')
      .select(`
        *,
        contract:contract_id(
          id, contract_name, contract_no, supplier_id, project_id,
          payment_ratio_active, payment_ratio_complete, payment_ratio_final,
          contract_status, total_amount
        )
      `)
      .order('created_at', { ascending: false });

    if (contractId && contractId !== 'all') {
      query = query.eq('contract_id', parseInt(contractId));
    } else if (projectId) {
      query = query.in('contract_id', contractIdsForProject);
    }
    if (settlementType && settlementType !== 'all') {
      query = query.eq('settlement_type', settlementType);
    }

    const { data, error } = await query;
    if (error) throw error;

    const supplierIds = [...new Set((data || []).map((s: any) => s.contract?.supplier_id).filter(Boolean))];
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

    const settlementsWithDetails = (data || []).map((settlement: any) => ({
      ...settlement,
      supplier_name: suppliersMap[settlement.contract?.supplier_id]?.name || '',
      status: settlement.status || REVIEW_STATUS.DRAFT,
    }));

    let result = settlementsWithDetails;
    if (supplierId && supplierId !== 'all') {
      result = settlementsWithDetails.filter((s: any) => s.contract?.supplier_id === parseInt(supplierId));
    }

    const activeSettlements = result.filter((s: any) => !isVoidedStatus(s.status));
    const settlementContractIds = [...new Set(activeSettlements.map((s: any) => s.contract_id).filter(Boolean))];

    let totalPaid = 0;
    if (settlementContractIds.length > 0) {
      const { data: payments } = await supabase
        .from('supplier_payments')
        .select('payment_amount, status')
        .in('contract_id', settlementContractIds);

      totalPaid = (payments || [])
        .filter((p) => isEffectiveSupplierPaymentStatus(p.status))
        .reduce((sum: number, p: any) => sum + Number(p.payment_amount || 0), 0);
    }

    const totalAmount = activeSettlements.reduce((sum: number, s: any) => sum + Number(s.settlement_amount || 0), 0);
    const totalPayable = activeSettlements.reduce((sum: number, s: any) => sum + Number(s.payable_amount || 0), 0);
    const totalFinalPayable = totalAmount;
    const totalProgressPending = Math.max(0, totalPayable - totalPaid);
    const totalFinalPending = Math.max(0, totalFinalPayable - totalPaid);

    return NextResponse.json({
      settlements: result,
      summary: {
        totalSettlements: activeSettlements.length,
        totalAmount,
        totalPayable,
        totalFinalPayable,
        totalPaid,
        totalProgressPending,
        totalFinalPending,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/supplier-contracts/settlements - 新增结算单
export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const supabase = getSupabaseClient();
    const body = await request.json();
    const { contract_id, settlement_type, settlement_amount, settlement_date, remark } = body;

    if (!contract_id) {
      return NextResponse.json({ error: '请选择合同' }, { status: 400 });
    }
    if (!settlement_type) {
      return NextResponse.json({ error: '请选择结算类型' }, { status: 400 });
    }
    if (!settlement_amount || Number(settlement_amount) <= 0) {
      return NextResponse.json({ error: '请输入有效的结算金额' }, { status: 400 });
    }

    const contractId = Number(contract_id);
    const settlementAmount = Number(settlement_amount);

    const { data: contract, error: contractError } = await supabase
      .from('supplier_contracts')
      .select('*')
      .eq('id', contractId)
      .single();

    if (contractError || !contract) {
      return NextResponse.json({ error: '合同不存在' }, { status: 400 });
    }

    if (contract.locked || contract.contract_status === '已完结') {
      return NextResponse.json({ error: '该合同已完结，无法新增结算单' }, { status: 400 });
    }

    if (settlement_type === 'final') {
      const { data: existingFinal } = await supabase
        .from('supplier_settlements')
        .select('id, status')
        .eq('contract_id', contractId)
        .eq('settlement_type', 'final');

      if ((existingFinal || []).some((s: any) => !isVoidedStatus(s.status))) {
        return NextResponse.json({ error: '该合同已存在未作废的总终结算单，无法重复创建' }, { status: 400 });
      }
    }

    let paymentRatio = 0;
    const paymentRatioFinal = Number(contract.payment_ratio_final) || 0;
    let payableAmount = 0;

    if (settlement_type === 'progress') {
      paymentRatio = Number(contract.payment_ratio_active) || 80;
      payableAmount = settlementAmount * (paymentRatio / 100);
    } else if (settlement_type === 'final') {
      paymentRatio = paymentRatioFinal > 0 ? paymentRatioFinal : 100;
      payableAmount = settlementAmount * (paymentRatio / 100);
    }

    const now = new Date();
    const settlementNo = `JS${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getTime()).slice(-6)}`;

    const { data: settlementArr, error: insertError } = await insertWithSequenceFix('supplier_settlements', {
      contract_id: contractId,
      settlement_no: settlementNo,
      settlement_type,
      settlement_amount: settlementAmount,
      payment_ratio: paymentRatio,
      payment_ratio_final: paymentRatioFinal,
      payable_amount: payableAmount.toFixed(2),
      settlement_date: settlement_date || null,
      remark: remark || null,
      status: REVIEW_STATUS.DRAFT,
      created_by: auth.user.id,
      created_by_name: auth.user.name || auth.user.username,
    }, supabase);

    const settlement = Array.isArray(settlementArr) ? settlementArr[0] : settlementArr;

    if (insertError) throw insertError;

    await auditLog({
      operationType: 'create',
      resourceType: 'supplier_settlement',
      resourceId: settlement?.id,
      details: { contract_id: contractId, settlement_type, settlement_amount: settlementAmount, settlement_no: settlement?.settlement_no },
      request,
    });

    await pushBusinessNotification({
      type: 'new_settlement',
      title: '新增结算单',
      content: `新增结算单 ${settlement?.settlement_no || ''}，结算金额 ¥${settlementAmount.toLocaleString()}，类型 ${settlement_type}`,
      severity: 'info',
      projectId: contract?.project_id,
      relatedId: settlement?.id,
      relatedType: 'supplier_settlement',
      metadata: { contract_id: contractId, settlement_type, settlement_amount: settlementAmount, settlement_no: settlement?.settlement_no },
    });

    return NextResponse.json({ settlement });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
