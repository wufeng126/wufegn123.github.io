import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// GET /api/supplier-settlements - 获取供应商结算记录（简化版）
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');
    const supplierId = searchParams.get('supplier_id');

    // 获取结算数据
    let query = supabase
      .from('supplier_settlements')
      .select('id, settlement_date, settlement_type, settlement_amount, invoice_amount, tax_amount, remark, contract_id')
      .order('settlement_date', { ascending: false });

    if (startDate) {
      query = query.gte('settlement_date', startDate);
    }
    if (endDate) {
      query = query.lte('settlement_date', endDate);
    }

    const { data: settlements, error } = await query;
    if (error) throw error;

    if (!settlements || settlements.length === 0) {
      return NextResponse.json({ settlements: [] });
    }

    // 获取关联的合同信息
    const contractIds = [...new Set(settlements.map((s: any) => s.contract_id).filter(Boolean))];
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
    let result = settlements.map((s: any) => {
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
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    const body = await request.json();
    const { supplier_id, project_id, settlement_date, settlement_type, amount, remark } = body;

    // 查找或创建该供应商+项目的合同
    const { data: contracts } = await supabase
      .from('supplier_contracts')
      .select('id')
      .eq('supplier_id', supplier_id)
      .eq('project_id', project_id)
      .limit(1);

    let contractId: number;
    if (contracts && contracts.length > 0) {
      contractId = contracts[0].id;
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
        .select('id')
        .single();
      if (contractError) throw contractError;
      contractId = newContract.id;
    }

    // 插入结算记录
    const { data: settlement, error } = await supabase
      .from('supplier_settlements')
      .insert({
        contract_id: contractId,
        settlement_date,
        settlement_type: settlement_type || '月度结算',
        settlement_amount: amount,
        remark: remark || null,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ settlement });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
