import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { auditLog } from '@/lib/audit-log';
import { logSecurityEvent } from '@/lib/security-log';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('supplier_payments')
      .select(`
        *,
        contract:contract_id(id, contract_name, contract_no, supplier_id),
        settlement:settlement_id(id, settlement_no, settlement_type)
      `)
      .eq('id', id)
      .single();

    if (error) throw error;

    // 获取供应商信息
    if (data?.contract?.supplier_id) {
      const { data: supplier } = await supabase
        .from('suppliers')
        .select('id, name')
        .eq('id', data.contract.supplier_id)
        .single();

      data.supplier_name = supplier?.name || '';
    }

    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = getSupabaseClient();
    const body = await request.json();
    const { payment_amount, payment_date, payment_method, payment_account, remark } = body;

    const updateData: any = {};
    if (payment_amount !== undefined) updateData.payment_amount = payment_amount;
    if (payment_date !== undefined) updateData.payment_date = payment_date;
    if (payment_method !== undefined) updateData.payment_method = payment_method;
    if (payment_account !== undefined) updateData.payment_account = payment_account;
    if (remark !== undefined) updateData.remark = remark;

    const { data, error } = await supabase
      .from('supplier_payments')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    await auditLog({
      operationType: 'update',
      resourceType: 'supplier_payment',
      resourceId: Number(id),
      details: { changes: Object.keys(updateData) },
      request,
    });

    await logSecurityEvent({
      event_type: 'supplier_payment_modify',
      ip_address: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown',
      user_agent: request.headers.get('user-agent') || 'unknown',
      result: 'success',
      details: { action: 'update', payment_id: id, changes: Object.keys(updateData) },
    });

    return NextResponse.json({ payment: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = getSupabaseClient();

    const { error } = await supabase
      .from('supplier_payments')
      .delete()
      .eq('id', id);

    if (error) throw error;

    await auditLog({
      operationType: 'delete',
      resourceType: 'supplier_payment',
      resourceId: Number(id),
      request,
    });

    await logSecurityEvent({
      event_type: 'supplier_payment_delete',
      ip_address: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown',
      user_agent: request.headers.get('user-agent') || 'unknown',
      result: 'success',
      details: { payment_id: id },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
