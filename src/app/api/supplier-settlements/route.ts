import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireApiWritePermission, requireAuth } from '@/lib/api-auth';
import { calculatePayableAmount, isVoidedStatus, REVIEW_STATUS } from '@/lib/business-logic';
import { DEFAULT_PAYMENT_RATIOS } from '@/lib/payment-ratios';
import { insertWithSequenceFix } from '@/lib/audit-log';
import { invalidateAggregationCache } from '@/lib/data-aggregation';

// GET /api/supplier-settlements - 获取供应商结算记录（简化版）
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const supabase = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');
    const supplierId = searchParams.get('supplier_id');

    // 获取结算数据
    let query = supabase
      .from('supplier_settlements')
      .select('id, settlement_date, settlement_type, settlement_amount, invoice_amount, tax_amount, remark, contract_id, status')
      .order('settlement_date', { ascending: false });

    if (startDate) {
      query = query.gte('settlement_date', startDate);
    }
    if (endDate) {
      query = query.lte('settlement_date', endDate);
    }

    const { data: settlements, error } = await query;
    if (error) throw error;

    const activeSettlements = (settlements || []).filter((s: any) => !isVoidedStatus(s.status));

    if (activeSettlements.length === 0) {
      return NextResponse.json({ settlements: [] });
    }

    // 获取关联的合同信息
    const contractIds = [...new Set(activeSettlements.map((s: any) => s.contract_id).filter(Boolean))];
    const { data: contracts } = await supabase
      .from('supplier_contracts')
      .select('id, supplier_id, project_id')
      .in('id', contractIds);

    const contractMap: Record<number, any> = {};
    (contracts || []).forEach((c: any) => { contractMap[c.id] = c; });

    // 获取供应商信息
    const supplierIds = [...new Set((contracts || []).map((c: any) => c.supplier_id).filter(Boolean))];
    const { data: suppliers } = await supabase
      .from('suppliers')
      .select('id, name')
      .in('id', supplierIds);

    const supplierMap: Record<number, string> = {};
    (suppliers || []).forEach((s: any) => { supplierMap[s.id] = s.name; });

    // 获取项目信息
    const projectIds = [...new Set((contracts || []).map((c: any) => c.project_id).filter(Boolean))];
    const { data: projects } = await supabase
      .from('projects')
      .select('id, name')
      .in('id', projectIds);

    const projectMap: Record<number, string> = {};
    (projects || []).forEach((p: any) => { projectMap[p.id] = p.name; });

    // 格式化为前端需要的结构
    let result = activeSettlements.map((s: any) => {
      const contract = contractMap[s.contract_id] || {};
      return {
        id: s.id,
        supplier_id: contract.supplier_id,
        supplier_name: supplierMap[contract.supplier_id] || '',
        project_name: projectMap[contract.project_id] || '',
        settlement_date: s.settlement_date,
        settlement_type: s.settlement_type,
        amount: Number(s.settlement_amount || 0).toString(),
        invoice_amount: s.invoice_amount ? Number(s.invoice_amount).toString() : null,
        tax_amount: s.tax_amount ? Number(s.tax_amount).toString() : null,
        status: s.status || REVIEW_STATUS.DRAFT,
        remark: s.remark,
      };
    });

    // 按供应商筛选
    if (supplierId && supplierId !== 'all') {
      result = result.filter((s: any) => s.supplier_id === parseInt(supplierId));
    }

    return NextResponse.json({ settlements: result });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/supplier-settlements - 新增结算记录
// 对齐 /api/supplier-contracts/settlements 语义：计算 payable_amount / payment_ratio / settlement_no，并校验合同状态
export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const supabase = getSupabaseClient();
    const body = await request.json();
    const { supplier_id, project_id, settlement_date, settlement_type, amount, remark } = body;

    if (!supplier_id) {
      return NextResponse.json({ error: '请选择供应商' }, { status: 400 });
    }
    if (!amount || Number(amount) <= 0) {
      return NextResponse.json({ error: '请输入有效的结算金额' }, { status: 400 });
    }

    // 归一化结算类型：progress/milestone/final（兼容历史值如"月度结算"按 progress 处理）
    let normalizedType = settlement_type || 'progress';
    if (!['progress', 'milestone', 'final'].includes(normalizedType)) {
      normalizedType = 'progress';
    }
    const settlementAmount = Number(amount);

    // 查找或创建该供应商+项目的合同
    const { data: contracts } = await supabase
      .from('supplier_contracts')
      .select('id')
      .eq('supplier_id', supplier_id)
      .eq('project_id', project_id)
      .limit(1);

    let contractId: number;
    let contract: any = null;
    if (contracts && contracts.length > 0) {
      contractId = contracts[0].id;
      const { data: contractData } = await supabase
        .from('supplier_contracts')
        .select('payment_ratio_active, payment_ratio_complete, payment_ratio_final, locked, contract_status')
        .eq('id', contractId)
        .single();
      contract = contractData;
    } else {
      // 自动创建合同
      const { data: newContract, error: contractError } = await supabase
        .from('supplier_contracts')
        .insert({
          supplier_id,
          project_id,
          contract_name: `合同-${new Date().toISOString().split('T')[0]}`,
          contract_status: 'active',
          total_amount: 0,
        })
        .select('id, payment_ratio_active, payment_ratio_complete, payment_ratio_final, locked, contract_status')
        .single();
      if (contractError) throw contractError;
      contractId = newContract.id;
      contract = newContract;
    }

    if (contract?.locked || contract?.contract_status === '已完结') {
      return NextResponse.json({ error: '该合同已完结，无法新增结算单' }, { status: 400 });
    }

    // 计算应付金额（与 supplier-contracts/settlements 完全一致）
    const payableAmount = calculatePayableAmount(settlementAmount, normalizedType, contract || {});
    let paymentRatio = Number(contract?.payment_ratio_active) || DEFAULT_PAYMENT_RATIOS.active;
    if (normalizedType === 'milestone') {
      paymentRatio = Number(contract?.payment_ratio_complete) || DEFAULT_PAYMENT_RATIOS.complete;
    } else if (normalizedType === 'final') {
      paymentRatio = Number(contract?.payment_ratio_final) || DEFAULT_PAYMENT_RATIOS.final;
    }

    const now = new Date();
    const settlementNo = `JS${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getTime()).slice(-6)}`;

    // 插入结算记录（含 payable_amount / payment_ratio / settlement_no）
    const { data: settlementArr, error } = await insertWithSequenceFix('supplier_settlements', {
      contract_id: contractId,
      settlement_no: settlementNo,
      settlement_date: settlement_date || null,
      settlement_type: normalizedType,
      settlement_amount: settlementAmount,
      payment_ratio: paymentRatio,
      payment_ratio_final: Number(contract?.payment_ratio_final) || DEFAULT_PAYMENT_RATIOS.final,
      payable_amount: payableAmount.toFixed(2),
      status: REVIEW_STATUS.DRAFT,
      remark: remark || null,
      created_by: auth.user.id,
      created_by_name: auth.user.name || auth.user.username,
    }, supabase);

    if (error) throw error;
    // 写入后失效聚合缓存
    invalidateAggregationCache();
    const settlement = Array.isArray(settlementArr) ? settlementArr[0] : settlementArr;

    return NextResponse.json({ settlement });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
