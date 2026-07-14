import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { isEffectiveSupplierPaymentStatus, isVoidedStatus, parseNumeric } from '@/lib/business-logic';

const roundMoney = (value: number) => Math.round(value * 100) / 100;

const PENDING_CONTRACT_STATUSES = new Set(['草稿', '待签', '待签订', 'draft', 'pending']);
const INACTIVE_CONTRACT_STATUSES = new Set(['作废', '已作废', '终止', '已终止', 'voided', 'cancelled', 'terminated']);
const ACTIVE_CONTRACT_STATUSES = new Set(['履约中', '生效', '已生效', '已完结', 'active', 'completed']);

type SupplierRecord = {
  id: number;
  name?: string | null;
  type?: string | null;
  contact_person?: string | null;
  phone?: string | null;
  remark?: string | null;
};

type ContractRecord = {
  id: number;
  supplier_id?: number | string | null;
  project_id?: number | string | null;
  contract_status?: string | null;
  sign_date?: string | null;
  contract_date?: string | null;
};

type SettlementRecord = {
  contract_id?: number | string | null;
  settlement_amount?: number | string | null;
  status?: string | null;
};

type PaymentRecord = {
  supplier_id?: number | string | null;
  contract_id?: number | string | null;
  payment_amount?: number | string | null;
  status?: string | null;
};

type ProjectRecord = {
  id: number;
  name?: string | null;
};

function isInactiveContract(status?: string | null) {
  const value = String(status || '').trim();
  return INACTIVE_CONTRACT_STATUSES.has(value) || isVoidedStatus(value);
}

function isPendingContract(contract: ContractRecord) {
  const status = String(contract.contract_status || '').trim();
  if (isInactiveContract(status)) return false;
  if (PENDING_CONTRACT_STATUSES.has(status)) return true;
  return !contract.sign_date && !contract.contract_date && !ACTIVE_CONTRACT_STATUSES.has(status);
}

function getContractStatusLabel(contracts: ContractRecord[]) {
  if (contracts.length === 0) return '暂无合同';
  const activeContracts = contracts.filter((contract) => !isInactiveContract(contract.contract_status));
  if (activeContracts.length === 0) return '无有效合同';
  const pendingCount = activeContracts.filter(isPendingContract).length;
  if (pendingCount === 0) return '已签合同';
  if (pendingCount === activeContracts.length) return '待签合同';
  return `已签${activeContracts.length - pendingCount} / 待签${pendingCount}`;
}

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const supplierId = searchParams.get('supplier_id');

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

    const supplierRecords = (suppliers || []) as SupplierRecord[];
    const supplierIds = supplierRecords.map((supplier) => Number(supplier.id));

    let contractsQuery = supabase
      .from('supplier_contracts')
      .select('*')
      .order('created_at', { ascending: false });

    if (supplierId) {
      contractsQuery = contractsQuery.eq('supplier_id', parseInt(supplierId));
    } else if (supplierIds.length > 0) {
      contractsQuery = contractsQuery.in('supplier_id', supplierIds);
    }

    const { data: contracts, error: contractsError } = await contractsQuery;
    if (contractsError) {
      console.error('合同查询错误:', contractsError);
      throw contractsError;
    }

    const contractRecords = (contracts || []) as ContractRecord[];
    const contractIds = contractRecords.map((contract) => Number(contract.id));
    const projectIds = Array.from(
      new Set(contractRecords.map((contract) => Number(contract.project_id)).filter(Boolean))
    );

    let settlementRecords: SettlementRecord[] = [];
    let paymentRecords: PaymentRecord[] = [];
    let projectRecords: ProjectRecord[] = [];

    if (contractIds.length > 0) {
      const { data: settlements, error: settlementsError } = await supabase
        .from('supplier_settlements')
        .select('contract_id, settlement_amount, status')
        .in('contract_id', contractIds);

      if (settlementsError) throw settlementsError;
      settlementRecords = (settlements || []) as SettlementRecord[];
    }

    if (supplierIds.length > 0) {
      const { data: payments, error: paymentsError } = await supabase
        .from('supplier_payments')
        .select('supplier_id, contract_id, payment_amount, status')
        .in('supplier_id', supplierIds);

      if (paymentsError) throw paymentsError;
      paymentRecords = (payments || []) as PaymentRecord[];
    }

    if (projectIds.length > 0) {
      const { data: projects, error: projectsError } = await supabase
        .from('projects')
        .select('id, name')
        .in('id', projectIds);

      if (projectsError) throw projectsError;
      projectRecords = (projects || []) as ProjectRecord[];
    }

    const contractsBySupplier = new Map<number, ContractRecord[]>();
    const contractToSupplier = new Map<number, number>();
    contractRecords.forEach((contract) => {
      const sid = Number(contract.supplier_id);
      const contractId = Number(contract.id);
      contractToSupplier.set(contractId, sid);
      contractsBySupplier.set(sid, [...(contractsBySupplier.get(sid) || []), contract]);
    });

    const settlementBySupplier = new Map<number, number>();
    settlementRecords.forEach((settlement) => {
      if (isVoidedStatus(settlement.status)) return;
      const sid = contractToSupplier.get(Number(settlement.contract_id));
      if (!sid) return;
      settlementBySupplier.set(
        sid,
        (settlementBySupplier.get(sid) || 0) + parseNumeric(settlement.settlement_amount)
      );
    });

    const paidBySupplier = new Map<number, number>();
    paymentRecords.forEach((payment) => {
      if (!isEffectiveSupplierPaymentStatus(payment.status)) return;
      const sid = Number(payment.supplier_id) || contractToSupplier.get(Number(payment.contract_id));
      if (!sid) return;
      paidBySupplier.set(sid, (paidBySupplier.get(sid) || 0) + parseNumeric(payment.payment_amount));
    });

    const projectNameMap = new Map<number, string>();
    projectRecords.forEach((project) => {
      projectNameMap.set(Number(project.id), project.name || '');
    });

    const accountData = supplierRecords.map((supplier) => {
      const sid = Number(supplier.id);
      const supplierContracts = contractsBySupplier.get(sid) || [];
      const activeContracts = supplierContracts.filter((contract) => !isInactiveContract(contract.contract_status));
      const pendingContracts = activeContracts.filter(isPendingContract);
      const signedContractCount = Math.max(activeContracts.length - pendingContracts.length, 0);
      const totalSettlement = roundMoney(settlementBySupplier.get(sid) || 0);
      const totalPaid = roundMoney(paidBySupplier.get(sid) || 0);
      const projectNames = Array.from(
        new Set(
          supplierContracts
            .map((contract) => projectNameMap.get(Number(contract.project_id)))
            .filter(Boolean)
        )
      );

      return {
        id: sid,
        name: supplier.name,
        type: supplier.type || 'supplier',
        contact_person: supplier.contact_person || '',
        phone: supplier.phone || '',
        remark: supplier.remark || '',
        has_contract: supplierContracts.length > 0,
        contract_count: supplierContracts.length,
        signed_contract_count: signedContractCount,
        pending_contract_count: pendingContracts.length,
        contract_status_label: getContractStatusLabel(supplierContracts),
        project_names: projectNames,
        total_settlement: totalSettlement,
        total_paid: totalPaid,
        total_pending: roundMoney(totalSettlement - totalPaid),
      };
    });

    const typeMap = new Map<string, number>();
    accountData.forEach((supplier) => {
      const type = supplier.type || '未分类';
      typeMap.set(type, (typeMap.get(type) || 0) + 1);
    });

    const summary = {
      totalSuppliers: accountData.length,
      signedContracts: accountData.reduce((sum, supplier) => sum + supplier.signed_contract_count, 0),
      pendingContracts: accountData.reduce((sum, supplier) => sum + supplier.pending_contract_count, 0),
      supplierTypes: Array.from(typeMap.entries()).map(([type, count]) => ({ type, count })),
      totalSettlement: roundMoney(accountData.reduce((sum, supplier) => sum + supplier.total_settlement, 0)),
      totalPaid: roundMoney(accountData.reduce((sum, supplier) => sum + supplier.total_paid, 0)),
      totalPending: roundMoney(accountData.reduce((sum, supplier) => sum + supplier.total_pending, 0)),
    };

    return NextResponse.json({
      suppliers: accountData,
      summary,
    });
  } catch (error: unknown) {
    console.error('台账 API 错误:', error);
    const message = error instanceof Error ? error.message : '查询失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
