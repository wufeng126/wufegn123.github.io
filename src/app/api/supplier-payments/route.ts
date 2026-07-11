import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { insertWithSequenceFix, auditLog } from '@/lib/audit-log';
import { pushBusinessNotification } from '@/lib/business-notification';

export async function GET(request: NextRequest) {
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
    const supabase = getSupabaseClient();
    const body = await request.json();

    const result = await insertWithSequenceFix('supplier_payments', body, supabase);

    if (result.error) {
      throw new Error(`创建供应商付款记录失败: ${result.error.message}`);
    }

    const paymentData = Array.isArray(result.data) ? result.data[0] : result.data;

    await auditLog({
      operationType: 'create',
      resourceType: 'supplier_payment',
      resourceId: paymentData?.id,
      details: body,
      request,
    });

    // 钉钉推送通知
    await pushBusinessNotification({
      type: 'new_supplier_payment',
      title: '新增供应商付款',
      content: `新增供应商付款记录，金额: ¥${Number(body.payment_amount || 0).toLocaleString()}，付款日期: ${body.payment_date || '-'}`,
      severity: 'info',
      projectId: body.project_id ? parseInt(String(body.project_id)) : undefined,
      relatedId: paymentData?.id,
      relatedType: 'supplier_payment',
      metadata: body,
    });

    return NextResponse.json(paymentData, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
