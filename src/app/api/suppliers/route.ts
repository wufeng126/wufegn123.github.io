import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { auditLog, insertWithSequenceFix } from '@/lib/audit-log';
import { requireApiWritePermission, requireAuth } from '@/lib/api-auth';
import { isEffectiveSupplierPaymentStatus, isReviewedStatus } from '@/lib/business-logic';
import { getProjectAccessScope } from '@/lib/api-project-scope';

type SupabaseClient = ReturnType<typeof getSupabaseClient>;
type ProjectAccessScope = number[] | null;

async function getSupplierVisibleStats(
  client: SupabaseClient,
  supplierId: number,
  projectScope: ProjectAccessScope,
) {
  let contractQuery = client
    .from('supplier_contracts')
    .select('id, project_id')
    .eq('supplier_id', supplierId);

  if (projectScope !== null) {
    if (projectScope.length === 0) {
      return {
        contract_count: 0,
        has_contract: false,
        total_settlement: 0,
        total_payment: 0,
        unpaid_amount: 0,
      };
    }
    contractQuery = contractQuery.in('project_id', projectScope);
  }

  const { data: contracts } = await contractQuery;
  const contractIds = (contracts || []).map((c: any) => Number(c.id)).filter(Boolean);
  const paymentMapById = new Map<number, any>();
  const addPaymentRows = (rows?: any[] | null) => {
    (rows || []).forEach((payment) => {
      const id = Number(payment.id);
      if (Number.isFinite(id) && id > 0) {
        paymentMapById.set(id, payment);
      }
    });
  };

  let settlementSum: any[] = [];
  if (contractIds.length > 0) {
    const { data } = await client
      .from('supplier_settlements')
      .select('settlement_amount, status')
      .in('contract_id', contractIds);
    settlementSum = data || [];

    // supplier_payments 无 supplier_id/project_id 列，付款必须经由合同(contract_id)关联获取。
    // 且付款必挂 contract_id，故按合同查询已覆盖该供应商在项目范围内全部付款。
    const { data: contractPayments } = await client
      .from('supplier_payments')
      .select('id, payment_amount, status')
      .in('contract_id', contractIds);
    addPaymentRows(contractPayments);
  }

  const totalSettlement = (settlementSum || [])
    .filter((s: any) => isReviewedStatus(s.status))
    .reduce((sum: number, s: any) => sum + (parseFloat(s.settlement_amount) || 0), 0);
  const totalPayment = Array.from(paymentMapById.values())
    .filter((p: any) => isEffectiveSupplierPaymentStatus(p.status))
    .reduce((sum: number, p: any) => sum + (parseFloat(p.payment_amount) || 0), 0);

  return {
    contract_count: contractIds.length,
    has_contract: contractIds.length > 0,
    total_settlement: totalSettlement,
    total_payment: totalPayment,
    unpaid_amount: totalSettlement - totalPayment,
  };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const type = searchParams.get('type');

    const client = getSupabaseClient();
    const projectScope = await getProjectAccessScope(client, auth.user);
    
    if (id) {
      // 获取单个供应商，附带结算和付款统计
      const { data: supplier, error } = await client
        .from('suppliers')
        .select(`
          *,
          settlements(count),
          payments(count)
        `)
        .eq('id', parseInt(id))
        .single();

      if (error) {
        throw new Error(`查询供应商失败: ${error.message}`);
      }

      const stats = await getSupplierVisibleStats(client, parseInt(id), projectScope);

      return NextResponse.json({ 
        success: true,
        supplier: {
          ...supplier,
          total_settlement: stats.total_settlement,
          total_payment: stats.total_payment,
          unpaid_amount: stats.unpaid_amount,
        }
      });
    }

    // 查询列表
    let query = client
      .from('suppliers')
      .select('*')
      .order('created_at', { ascending: false });

    if (type) {
      query = query.eq('type', type);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`查询供应商失败: ${error.message}`);
    }

    // 为每个供应商计算统计数据
    const suppliersWithStats = await Promise.all(
      (data || []).map(async (supplier) => {
        const stats = await getSupplierVisibleStats(client, supplier.id, projectScope);

        return {
          ...supplier,
          has_contract: stats.has_contract,
          contract_count: stats.contract_count,
          total_settlement: stats.total_settlement,
          total_payment: stats.total_payment,
          unpaid_amount: stats.unpaid_amount,
        };
      })
    );

    return NextResponse.json({ success: true, suppliers: suppliersWithStats });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error.message || '查询失败' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const { name, type, contact_person, contact, phone, remark, category } = body;
    // 前端历史上用 contact 字段，统一兼容两种写法，避免联系人丢失
    const contactPerson = contact_person ?? contact ?? null;

    if (!name || !type) {
      return NextResponse.json({ error: '请填写供应商名称和类型' }, { status: 400 });
    }

    const client = getSupabaseClient();
    
    const { data, error } = await insertWithSequenceFix('suppliers', {
        name,
        type,
        contact_person: contactPerson || null,
        phone: phone || null,
        remark: remark || null,
        ...(category ? { category } : {}),
      }, client);

    const supplierData = Array.isArray(data) ? data[0] : data;

    if (error) {
      throw new Error(`创建供应商失败: ${error.message}`);
    }

    // 记录审计日志
    await auditLog({
      operationType: 'create',
      resourceType: 'supplier',
      resourceId: supplierData?.id,
      details: { name, type, contact_person: contactPerson, phone, category },
      request,
    });

    return NextResponse.json({ success: true, supplier: supplierData });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error.message || '创建失败' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const { id: bodyId, name, type, contact_person, contact, phone, remark, category } = body;

    // 优先使用 body 中的 id，其次使用 query 参数
    const { searchParams } = new URL(request.url);
    const queryId = searchParams.get('id');
    const id = bodyId || queryId;

    if (!id) {
      return NextResponse.json({ error: '缺少供应商ID' }, { status: 400 });
    }

    // 解析 id（支持字符串和数字）
    const supplierId = parseInt(String(id).replace(/[^\d]/g, ''));
    if (isNaN(supplierId) || supplierId <= 0) {
      return NextResponse.json({ error: '无效的供应商ID' }, { status: 400 });
    }

    const client = getSupabaseClient();
    
    // 构建更新对象，只更新提供的字段（排除银行相关字段）
    const updateData: Record<string, any> = {};
    if (name !== undefined) updateData.name = name;
    if (type !== undefined) updateData.type = type;
    const resolvedContact = contact_person !== undefined ? contact_person : contact;
    if (resolvedContact !== undefined) updateData.contact_person = resolvedContact || null;
    if (category) updateData.category = category;
    if (phone !== undefined) updateData.phone = phone || null;
    if (remark !== undefined) updateData.remark = remark || null;
    // BUG-3 修复：仅更新前端实际提交的字段，不再无条件清空银行字段，
    // 避免「只改名称」时把已有 bank_account/bank_name 一并抹掉。
    if (body.bank_account !== undefined) updateData.bank_account = body.bank_account || null;
    if (body.bank_name !== undefined) updateData.bank_name = body.bank_name || null;

    const { data, error } = await client
      .from('suppliers')
      .update(updateData)
      .eq('id', supplierId)
      .select()
      .maybeSingle();

    if (error) {
      console.error('Update supplier error:', error);
      throw new Error(`更新供应商失败: ${error.message}`);
    }

    // 如果返回null，说明没有匹配记录
    if (!data) {
      // 尝试返回乐观更新结果
      return NextResponse.json({ 
        success: true, 
        supplier: { id: supplierId, ...updateData },
        message: '记录可能不存在，但更新请求已处理'
      });
    }

    // 记录审计日志
    await auditLog({
      operationType: 'update',
      resourceType: 'supplier',
      resourceId: supplierId,
      details: { name, type, changes: Object.keys(updateData) },
      request,
    });

    return NextResponse.json({ success: true, supplier: data });
  } catch (error: any) {
    console.error('API PUT Error:', error);
    return NextResponse.json(
      { error: error.message || '更新失败' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const ids = searchParams.get('ids');

    if (!ids) {
      return NextResponse.json({ error: '请提供要删除的供应商ID' }, { status: 400 });
    }

    const idArray = ids.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));

    if (idArray.length === 0) {
      return NextResponse.json({ error: '无效的供应商ID' }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 检查是否有关联的结算或付款记录（历史老表）
    const { data: settlements } = await client
      .from('settlements')
      .select('id')
      .in('supplier_id', idArray)
      .limit(1);

    const { data: payments } = await client
      .from('payments')
      .select('id')
      .in('supplier_id', idArray)
      .limit(1);

    // 检查新表关联：合同（合同下挂结算/付款，删除供应商会留下孤儿数据）
    const { data: contracts } = await client
      .from('supplier_contracts')
      .select('id')
      .in('supplier_id', idArray)
      .limit(1);

    // BUG-4 修复：定位该供应商名下全部合同，进一步校验新表数据，
    // 即使合同行被误删/遗留，也避免留下挂在旧合同 id 下的新结算/新付款孤儿。
    // 注：supplier_payments/supplier_settlements 无 supplier_id 列，只能经合同关联。
    let orphanPayments = 0;
    let orphanSettlements = 0;
    if (contracts && contracts.length > 0) {
      const { data: allContracts } = await client
        .from('supplier_contracts')
        .select('id')
        .in('supplier_id', idArray);
      const allContractIds = (allContracts || []).map((c: any) => Number(c.id)).filter(Boolean);
      if (allContractIds.length > 0) {
        const [payRes, setRes] = await Promise.all([
          client.from('supplier_payments').select('id').in('contract_id', allContractIds).limit(1),
          client.from('supplier_settlements').select('id').in('contract_id', allContractIds).limit(1),
        ]);
        orphanPayments = (payRes.data || []).length;
        orphanSettlements = (setRes.data || []).length;
      }
    }

    if (
      (settlements && settlements.length > 0) ||
      (payments && payments.length > 0) ||
      (contracts && contracts.length > 0) ||
      orphanPayments > 0 ||
      orphanSettlements > 0
    ) {
      return NextResponse.json({ 
        error: '该供应商有关联的合同、结算或付款记录，无法删除' 
      }, { status: 400 });
    }
    
    const { error } = await client
      .from('suppliers')
      .delete()
      .in('id', idArray);

    if (error) {
      throw new Error(`删除供应商失败: ${error.message}`);
    }

    // 记录审计日志
    await auditLog({
      operationType: 'delete',
      resourceType: 'supplier',
      details: { deletedIds: idArray, deletedCount: idArray.length },
      request,
    });

    return NextResponse.json({ success: true, deletedCount: idArray.length });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error.message || '删除失败' },
      { status: 500 }
    );
  }
}
