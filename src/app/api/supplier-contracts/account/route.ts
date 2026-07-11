import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const supplierId = searchParams.get('supplier_id');

    // 获取所有供应商
    let suppliersQuery = supabase
      .from('suppliers')
      .select('*')
      .order('created_at', { ascending: false });

    if (supplierId) {
      suppliersQuery = suppliersQuery.eq('id', parseInt(supplierId));
    }

    const { data: suppliers, error: suppliersError } = await suppliersQuery;
    if (suppliersError) {
      console.error('供应商查询错误:', suppliersError);
      throw suppliersError;
    }

    // 获取所有合同
    let contractsQuery = supabase
      .from('supplier_contracts')
      .select('*')
      .order('created_at', { ascending: false });

    if (supplierId) {
      contractsQuery = contractsQuery.eq('supplier_id', parseInt(supplierId));
    }

    const { data: contracts, error: contractsError } = await contractsQuery;
    if (contractsError) {
      console.error('合同查询错误:', contractsError);
      throw contractsError;
    }

    // 将合同按供应商分组
    const contractsBySupplier: Record<number, any[]> = {};
    (contracts || []).forEach((contract: any) => {
      const sid = Number(contract.supplier_id);
      if (!contractsBySupplier[sid]) {
        contractsBySupplier[sid] = [];
      }
      contractsBySupplier[sid].push(contract);
    });

    // 构建台账数据
    const accountData: any[] = (suppliers || []).map((supplier: any) => {
      const sid = Number(supplier.id);
      const supplierContracts = contractsBySupplier[sid] || [];
      
      // 计算统计
      let contractCount = supplierContracts.length;
      let totalContractAmount = 0;
      let totalPaid = 0;
      let totalPending = 0;

      supplierContracts.forEach((contract: any) => {
        const total = Number(contract.total_amount) || 0;
        const paid = Number(contract.cumulative_paid) || 0;
        totalContractAmount += total;
        totalPaid += paid;
        totalPending += (total - paid);
      });

      return {
        id: sid,
        name: supplier.name,
        type: supplier.type || 'supplier',
        contact_person: supplier.contact_person || '',
        phone: supplier.phone || '',
        has_contract: contractCount > 0,
        contract_count: contractCount,
        total_contract_amount: Math.round(totalContractAmount * 100) / 100,
        total_should_pay: Math.round((totalContractAmount * 0.8) * 100) / 100, // 假设80%应付款
        total_paid: Math.round(totalPaid * 100) / 100,
        total_pending: Math.round(totalPending * 100) / 100,
      };
    });

    // 计算汇总
    const summary = {
      totalSuppliers: (suppliers || []).length,
      totalContracts: accountData.reduce((sum, s) => sum + s.contract_count, 0),
      totalAmount: accountData.reduce((sum, s) => sum + s.total_contract_amount, 0),
      totalShouldPay: accountData.reduce((sum, s) => sum + s.total_should_pay, 0),
      totalPaid: accountData.reduce((sum, s) => sum + s.total_paid, 0),
      totalPending: accountData.reduce((sum, s) => sum + s.total_pending, 0),
    };

    return NextResponse.json({
      suppliers: accountData,
      summary,
    });
  } catch (error: any) {
    console.error('台账 API 错误:', error);
    return NextResponse.json({ error: error.message || '查询失败' }, { status: 500 });
  }
}
