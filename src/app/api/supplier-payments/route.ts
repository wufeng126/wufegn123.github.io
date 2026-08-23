import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { insertWithSequenceFix, auditLog } from '@/lib/audit-log';
import { pushBusinessNotification } from '@/lib/business-notification';
import { requireApiWritePermission, requireAuth } from '@/lib/api-auth';
import { validateSupplierPayment, validateSupplierSettlementPayment } from '@/lib/business-logic';
import { invalidateAggregationCache } from '@/lib/data-aggregation';

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.ok) return auth.response;

  const supabase = getSupabaseClient();
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get('project_id');
  const supplierId = searchParams.get('supplier_id');

  let query = supabase
    .from('supplier_payments')
    .select('*')
    .order('payment_date', { ascending: false });

  if (projectId) {
    query = query.eq('project_id', parseInt(projectId));
  }
  if (supplierId) {
    query = query.eq('supplier_id', parseInt(supplierId));
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

    // D5 修复：与 supplier-contracts/payments 入口一致的校验——合同余额/结算单未付余额/作废状态
    const paymentAmount = Number(body.payment_amount || 0);
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
