import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { insertWithSequenceFix, auditLog } from '@/lib/audit-log';
import { pushBusinessNotification } from '@/lib/business-notification';
import { requireApiWritePermission, requireAuth } from '@/lib/api-auth';
import { validateSupplierPayment, validateSupplierSettlementPayment } from '@/lib/business-logic';
import { invalidateAggregationCache } from '@/lib/data-aggregation';
import {
  assertProjectAccess,
  badProjectIdResponse,
  canAccessProject,
  getProjectAccessScope,
  parseOptionalProjectId,
} from '@/lib/api-project-scope';

type SupplierContractRef = {
  id: number;
  supplier_id?: number | null;
  project_id?: number | null;
};

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.ok) return auth.response;

  const supabase = getSupabaseClient();
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get('project_id');
  const supplierId = searchParams.get('supplier_id');
  const requestedProjectId = parseOptionalProjectId(projectId);
  if (Number.isNaN(requestedProjectId)) return badProjectIdResponse();
  const requestedSupplierId = supplierId ? Number(supplierId) : null;
  if (requestedSupplierId !== null && (!Number.isInteger(requestedSupplierId) || requestedSupplierId <= 0)) {
    return NextResponse.json({ error: '供应商参数无效' }, { status: 400 });
  }

  const projectScope = await getProjectAccessScope(supabase, auth.user);
  if (requestedProjectId && !canAccessProject(projectScope, requestedProjectId)) {
    return NextResponse.json({ error: '当前账号无权访问该项目' }, { status: 403 });
  }

  let scopedContractIds: number[] | null = null;
  if (projectScope !== null || requestedProjectId || requestedSupplierId) {
    if (projectScope !== null && projectScope.length === 0) {
      return NextResponse.json([]);
    }

    let contractScopeQuery = supabase
      .from('supplier_contracts')
      .select('id');

    if (requestedProjectId) {
      contractScopeQuery = contractScopeQuery.eq('project_id', requestedProjectId);
    } else if (projectScope !== null) {
      contractScopeQuery = contractScopeQuery.in('project_id', projectScope);
    }
    if (requestedSupplierId) {
      contractScopeQuery = contractScopeQuery.eq('supplier_id', requestedSupplierId);
    }

    const { data: scopedContracts, error: scopeError } = await contractScopeQuery;
    if (scopeError) {
      return NextResponse.json({ error: scopeError.message }, { status: 500 });
    }
    scopedContractIds = (scopedContracts || []).map((contract: any) => Number(contract.id)).filter(Boolean);
  }

  let query = supabase
    .from('supplier_payments')
    .select('*')
    .order('payment_date', { ascending: false });

  if (requestedProjectId) {
    if (scopedContractIds && scopedContractIds.length > 0) {
      query = query.or(`project_id.eq.${requestedProjectId},contract_id.in.(${scopedContractIds.join(',')})`);
    } else {
      query = query.eq('project_id', requestedProjectId);
    }
  } else if (projectScope !== null) {
    if (scopedContractIds && scopedContractIds.length > 0) {
      query = query.or(`project_id.in.(${projectScope.join(',')}),contract_id.in.(${scopedContractIds.join(',')})`);
    } else {
      query = query.in('project_id', projectScope);
    }
  }
  if (requestedSupplierId) {
    if (scopedContractIds && scopedContractIds.length > 0) {
      query = query.or(`supplier_id.eq.${requestedSupplierId},contract_id.in.(${scopedContractIds.join(',')})`);
    } else {
      query = query.eq('supplier_id', requestedSupplierId);
    }
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const supabase = getSupabaseClient();
    const body = await request.json();

    let contract: SupplierContractRef | null = null;
    const loadContract = async (contractId: number) => {
      const { data, error } = await supabase
        .from('supplier_contracts')
        .select('id, supplier_id, project_id')
        .eq('id', contractId)
        .single();
      if (error || !data) {
        return { error: NextResponse.json({ error: '合同不存在' }, { status: 400 }) };
      }
      return { data: data as SupplierContractRef };
    };

    const contractId = body.contract_id && Number(body.contract_id) > 0 ? Number(body.contract_id) : null;
    if (contractId) {
      const contractResult = await loadContract(contractId);
      if (contractResult.error) return contractResult.error;
      contract = contractResult.data;
    }

    if (body.settlement_id && Number(body.settlement_id) > 0) {
      const { data: settlement, error: settlementError } = await supabase
        .from('supplier_settlements')
        .select('id, contract_id')
        .eq('id', Number(body.settlement_id))
        .single();
      if (settlementError || !settlement) {
        return NextResponse.json({ error: '结算单不存在' }, { status: 400 });
      }
      if (settlement.contract_id) {
        const settlementContractId = Number(settlement.contract_id);
        if (contractId && contractId !== settlementContractId) {
          return NextResponse.json({ error: '结算单不属于当前合同' }, { status: 400 });
        }
        if (!contract) {
          const contractResult = await loadContract(settlementContractId);
          if (contractResult.error) return contractResult.error;
          contract = contractResult.data;
          body.contract_id = settlementContractId;
        }
      }
    }

    const normalizedProjectId = Number(body.project_id || contract?.project_id || 0);
    if (normalizedProjectId > 0) {
      const access = await assertProjectAccess(supabase, auth.user, normalizedProjectId);
      if (!access.ok) return access.response;
      body.project_id = normalizedProjectId;
    } else if (!auth.user.is_super_admin) {
      return NextResponse.json({ error: '请选择有权限的项目' }, { status: 400 });
    }

    if (contract?.supplier_id && !body.supplier_id) {
      body.supplier_id = contract.supplier_id;
    }

    // 与 supplier-contracts/payments 入口对齐：补齐付款单号与有效状态默认值，
    // 避免落成 status='pending'、payment_no 为 '-' 的“待确认”记录而不计入结算台账已付。
    const paymentDate: string = body.payment_date || new Date().toISOString().slice(0, 10);
    if (!body.payment_no || String(body.payment_no).trim() === '' || String(body.payment_no).trim() === '-') {
      const now = new Date();
      body.payment_no = `FK${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getTime()).slice(-6)}`;
    }
    if (!body.status || body.status === 'pending') {
      body.status = 'completed';
    }
    if (!body.payment_date) {
      body.payment_date = paymentDate;
    }

    // D5 修复：与 supplier-contracts/payments 入口一致的校验——合同余额/结算单未付余额/作废状态
    const paymentAmount = Number(body.payment_amount || 0);
    if (!paymentAmount || paymentAmount <= 0) {
      return NextResponse.json({ error: '请输入有效的付款金额' }, { status: 400 });
    }
    if (body.contract_id && Number(body.contract_id) > 0) {
      const contractValidation = await validateSupplierPayment({
        contract_id: Number(body.contract_id),
        payment_amount: paymentAmount,
      });
      if (!contractValidation.valid) {
        return NextResponse.json({ error: contractValidation.message }, { status: 400 });
      }
    }
    if (body.settlement_id && Number(body.settlement_id) > 0) {
      const settlementValidation = await validateSupplierSettlementPayment({
        settlement_id: Number(body.settlement_id),
        payment_amount: paymentAmount,
      });
      if (!settlementValidation.valid) {
        return NextResponse.json({ error: settlementValidation.message }, { status: 400 });
      }
    }

    const result = await insertWithSequenceFix('supplier_payments', body, supabase);

    if (result.error) {
      throw new Error(`创建供应商付款记录失败: ${result.error.message}`);
    }

    const paymentData = Array.isArray(result.data) ? result.data[0] : result.data;

    // 写入后失效聚合缓存，确保看板/月报统计即时更新
    invalidateAggregationCache();

    await auditLog({
      operationType: 'create',
      resourceType: 'supplier_payment',
      resourceId: paymentData?.id,
      details: body,
      request,
    });

    const { data: supplier } = body.supplier_id
      ? await supabase.from('suppliers').select('name').eq('id', Number(body.supplier_id)).maybeSingle()
      : { data: null };
    const { data: project } = body.project_id
      ? await supabase.from('projects').select('name').eq('id', Number(body.project_id)).maybeSingle()
      : { data: null };

    // 钉钉推送通知
    await pushBusinessNotification({
      type: 'new_supplier_payment',
      title: '新增供应商付款',
      content: `新增供应商付款记录，金额: ¥${paymentAmount.toLocaleString()}，付款日期: ${body.payment_date || '-'}`,
      severity: 'info',
      projectId: body.project_id ? parseInt(String(body.project_id)) : undefined,
      relatedId: paymentData?.id,
      relatedType: 'supplier_payment',
      metadata: {
        ...body,
        payment_id: paymentData?.id,
        paymentId: paymentData?.id,
        supplierName: supplier?.name,
        projectName: project?.name,
        paymentAmount,
        paymentDate: body.payment_date,
        businessSummary: `${supplier?.name || '供应商'}新增付款${project?.name ? `，项目 ${project.name}` : ''}，金额 ¥${paymentAmount.toLocaleString()}，付款日期 ${body.payment_date || '-'}`,
      },
    });

    return NextResponse.json(paymentData, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
