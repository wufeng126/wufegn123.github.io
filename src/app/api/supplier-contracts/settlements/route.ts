import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { auditLog, insertWithSequenceFix } from '@/lib/audit-log';
import { pushBusinessNotification } from '@/lib/business-notification';

// GET /api/supplier-contracts/settlements - 获取结算单列表
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const contractId = searchParams.get('contract_id');
    const supplierId = searchParams.get('supplier_id');
    const settlementType = searchParams.get('settlement_type');
    const projectId = searchParams.get('project_id'); // 新增：按项目筛选

    // 如果按项目筛选，先获取该项目的合同ID列表
    let contractIdsForProject: number[] = [];
    if (projectId) {
      const { data: projectContracts } = await supabase
        .from('supplier_contracts')
        .select('id')
        .eq('project_id', parseInt(projectId));
      contractIdsForProject = (projectContracts || []).map((c: any) => c.id);
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
    } else if (projectId && contractIdsForProject.length > 0) {
      // 按项目筛选时，使用 in 查询
      query = query.in('contract_id', contractIdsForProject);
    }
    if (settlementType && settlementType !== 'all') {
      query = query.eq('settlement_type', settlementType);
    }

    const { data, error } = await query;
    if (error) throw error;

    // 获取关联的供应商信息
    const contractIds = [...new Set((data || []).map((s: any) => s.contract?.supplier_id).filter(Boolean))];
    let suppliersMap: Record<number, any> = {};

    if (contractIds.length > 0) {
      const { data: suppliers } = await supabase
        .from('suppliers')
        .select('id, name')
        .in('id', contractIds);

      (suppliers || []).forEach((s: any) => {
        suppliersMap[s.id] = s;
      });
    }

    // 格式化数据
    const settlementsWithDetails = (data || []).map((settlement: any) => ({
      ...settlement,
      supplier_name: suppliersMap[settlement.contract?.supplier_id]?.name || '',
    }));

    // 如果指定了供应商ID，过滤
    let result = settlementsWithDetails;
    if (supplierId && supplierId !== 'all') {
      const supplierContracts = (data || []).filter((s: any) => s.contract?.supplier_id === parseInt(supplierId));
      result = settlementsWithDetails.filter((s: any) =>
        supplierContracts.some((sc: any) => sc.id === s.id)
      );
    }

    // 获取所有结算单关联的合同ID
    const settlementContractIds = [...new Set(result.map((s: any) => s.contract_id).filter(Boolean))];

    // 从付款表获取已付金额（自动同步）
    let totalPaid = 0;
    if (settlementContractIds.length > 0) {
      const { data: payments } = await supabase
        .from('supplier_payments')
        .select('payment_amount')
        .in('contract_id', settlementContractIds);

      totalPaid = (payments || []).reduce((sum: number, p: any) => sum + Number(p.payment_amount || 0), 0);
    }

    // 按新口径计算汇总
    // 累计结算金额 = 各期结算金额之和
    const totalAmount = result.reduce((sum: number, s: any) => sum + Number(s.settlement_amount || 0), 0);
    // 履约应付金额 = 各期「结算金额 × 约定付款比例」之和（用于进度付款计算）
    const totalPayable = result.reduce((sum: number, s: any) => sum + Number(s.payable_amount || 0), 0);
    // 决算应付金额 = 累计结算金额（固定100%，不乘任何比例）
    const totalFinalPayable = totalAmount;
    // 进度未付 = 履约应付 - 已付
    const totalProgressPending = totalPayable - totalPaid;
    // 决算未付 = 决算应付 - 已付
    const totalFinalPending = totalFinalPayable - totalPaid;

    const summary = {
      totalSettlements: result.length,
      totalAmount,
      totalPayable,
      totalFinalPayable,
      totalPaid,
      totalProgressPending,
      totalFinalPending,
    };

    return NextResponse.json({
      settlements: result,
      summary,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/supplier-contracts/settlements - 新增结算单
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    const body = await request.json();
    const { contract_id, settlement_type, settlement_amount, settlement_date, remark } = body;

    if (!contract_id) {
      return NextResponse.json({ error: '请选择合同' }, { status: 400 });
    }
    if (!settlement_type) {
      return NextResponse.json({ error: '请选择结算类型' }, { status: 400 });
    }
    if (!settlement_amount || settlement_amount <= 0) {
      return NextResponse.json({ error: '请输入有效的结算金额' }, { status: 400 });
    }

    // 获取合同信息
    const { data: contract, error: contractError } = await supabase
      .from('supplier_contracts')
      .select('*')
      .eq('id', contract_id)
      .single();

    if (contractError || !contract) {
      return NextResponse.json({ error: '合同不存在' }, { status: 400 });
    }

    // 检查合同状态
    if (contract.contract_status === '已完结') {
      return NextResponse.json({ error: '该合同已完结，无法新增结算单' }, { status: 400 });
    }

    // 检查结算类型规则
    if (settlement_type === 'final') {
      // 检查是否已有总结算
      const { data: existingFinal } = await supabase
        .from('supplier_settlements')
        .select('id')
        .eq('contract_id', contract_id)
        .eq('settlement_type', 'final')
        .limit(1);

      if (existingFinal && existingFinal.length > 0) {
        return NextResponse.json({ error: '该合同已存在总结算单，无法重复创建' }, { status: 400 });
      }
    }

    // 计算应付金额和决算比例
    let payment_ratio = 0;
    let payment_ratio_final = Number(contract.payment_ratio_final) || 0; // 决算比例
    let payable_amount = 0;

    if (settlement_type === 'progress') {
      // 进度结算：使用合同约定的进度付款比例
      payment_ratio = Number(contract.payment_ratio_active) || 80;
      payable_amount = Number(settlement_amount) * (payment_ratio / 100);
    } else if (settlement_type === 'final') {
      // 总结算：使用合同约定的决算比例
      payment_ratio = payment_ratio_final > 0 ? payment_ratio_final : 100;
      payable_amount = Number(settlement_amount) * (payment_ratio / 100);
    }

    // 生成结算单号
    const now = new Date();
    const settlementNo = `JS${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getTime()).slice(-6)}`;

    // 获取用户信息
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;

    // 插入结算单
    const { data: settlementArr, error: insertError } = await insertWithSequenceFix('supplier_settlements', {
        contract_id,
        settlement_no: settlementNo,
        settlement_type,
        settlement_amount,
        payment_ratio,
        payment_ratio_final, // 决算比例（自动从合同同步）
        payable_amount: payable_amount.toFixed(2),
        settlement_date: settlement_date || null,
        remark: remark || null,
        created_by: user?.id,
        created_by_name: user?.user_metadata?.username || user?.email,
      }, supabase);

    const settlement = Array.isArray(settlementArr) ? settlementArr[0] : settlementArr;

    if (insertError) throw insertError;

    // 如果是总结算，自动锁定合同并记录日志
    if (settlement_type === 'final') {
      await supabase
        .from('supplier_contracts')
        .update({ 
          contract_status: '已完结',
          locked: true,
          updated_at: new Date().toISOString()
        })
        .eq('id', contract_id);

      // 记录日志
      await supabase.from('supplier_contract_logs').insert({
        contract_id,
        action: '总结算完结',
        operator_id: user?.id,
        operator_name: user?.user_metadata?.username || user?.email,
        detail: { settlement_no: settlementNo, settlement_amount, payable_amount },
      });
    }

    await auditLog({
      operationType: 'create',
      resourceType: 'supplier_settlement',
      resourceId: settlement?.id,
      details: { contract_id, settlement_type, settlement_amount, settlement_no: settlement?.settlement_no },
      request,
    });

    // 钉钉推送通知
    await pushBusinessNotification({
      type: 'new_settlement',
      title: '新增结算单',
      content: `新增结算单 ${settlement?.settlement_no || ''}，结算金额: ¥${Number(settlement_amount).toLocaleString()}，类型: ${settlement_type === 'interim' ? '中间结算' : '总结算'}`,
      severity: 'info',
      projectId: contract?.project_id,
      relatedId: settlement?.id,
      relatedType: 'supplier_settlement',
      metadata: { contract_id, settlement_type, settlement_amount, settlement_no: settlement?.settlement_no },
    });

    return NextResponse.json({ settlement });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
