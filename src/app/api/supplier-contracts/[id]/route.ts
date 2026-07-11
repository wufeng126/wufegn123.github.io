import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { auditLog } from '@/lib/audit-log';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('supplier_contracts')
      .select(`
        *,
        supplier:supplier_id(id, name),
        project:project_id(id, name)
      `)
      .eq('id', id)
      .single();

    if (error) throw error;

    // 获取结算统计
    const { data: settlements } = await supabase
      .from('supplier_settlements')
      .select('*')
      .eq('contract_id', id)
      .order('created_at', { ascending: false });

    const totalSettlement = (settlements || []).reduce(
      (sum: number, s: any) => sum + Number(s.settlement_amount || 0), 0
    );
    const totalPayable = (settlements || []).reduce(
      (sum: number, s: any) => sum + Number(s.payable_amount || 0), 0
    );
    const completeSettlement = (settlements || []).find((s: any) => s.settlement_type === '结算完');

    // 获取付款统计
    const { data: payments } = await supabase
      .from('supplier_payments')
      .select('*')
      .eq('contract_id', id)
      .order('payment_date', { ascending: false });

    const totalPaid = (payments || []).reduce(
      (sum: number, p: any) => sum + Number(p.payment_amount || 0), 0
    );

    // 获取操作日志
    const { data: logs } = await supabase
      .from('supplier_contract_logs')
      .select('*')
      .eq('contract_id', id)
      .order('created_at', { ascending: false });

    return NextResponse.json({
      ...data,
      total_settlement: totalSettlement,
      total_payable: totalPayable,
      total_paid: totalPaid,
      pending_amount: totalPayable - totalPaid,
      has_complete_settlement: !!completeSettlement,
      settlements: settlements || [],
      payments: payments || [],
      logs: logs || [],
    });
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
    const {
      contract_no, contract_name, project_id, sign_date, expire_date,
      total_amount, supply_content, attachment_url, payment_method,
      payment_ratio_active, payment_ratio_complete, payment_ratio_final, payment_days,
      payment_remark, contract_status, remark
    } = body;

    // 验证比例范围
    if (payment_ratio_active !== undefined && (payment_ratio_active < 0 || payment_ratio_active > 100)) {
      return NextResponse.json({ error: '履约中付款比例必须在0-100%之间' }, { status: 400 });
    }
    if (payment_ratio_complete !== undefined && (payment_ratio_complete < 0 || payment_ratio_complete > 100)) {
      return NextResponse.json({ error: '结算完付款比例必须在0-100%之间' }, { status: 400 });
    }
    if (payment_ratio_final !== undefined && (payment_ratio_final < 0 || payment_ratio_final > 100)) {
      return NextResponse.json({ error: '决算比例必须在0-100%之间' }, { status: 400 });
    }

    // 获取当前数据用于日志
    const { data: oldData } = await supabase
      .from('supplier_contracts')
      .select('*')
      .eq('id', id)
      .single();

    if (!oldData) {
      return NextResponse.json({ error: '合同不存在' }, { status: 404 });
    }

    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;

    const updateData: any = {};
    if (contract_no !== undefined) updateData.contract_no = contract_no;
    if (contract_name !== undefined) updateData.contract_name = contract_name;
    if (project_id !== undefined) updateData.project_id = project_id;
    if (sign_date !== undefined) updateData.sign_date = sign_date || null;
    if (expire_date !== undefined) updateData.expire_date = expire_date || null;
    if (total_amount !== undefined) updateData.total_amount = total_amount === '' ? null : Number(total_amount);
    if (supply_content !== undefined) updateData.supply_content = supply_content;
    if (attachment_url !== undefined) updateData.attachment_url = attachment_url;
    if (payment_method !== undefined) updateData.payment_method = payment_method;
    if (payment_ratio_active !== undefined) updateData.payment_ratio_active = payment_ratio_active === '' ? null : Number(payment_ratio_active);
    if (payment_ratio_complete !== undefined) updateData.payment_ratio_complete = payment_ratio_complete === '' ? null : Number(payment_ratio_complete);
    if (payment_ratio_final !== undefined) updateData.payment_ratio_final = payment_ratio_final === '' ? null : Number(payment_ratio_final);
    if (payment_days !== undefined) updateData.payment_days = payment_days === '' ? null : Number(payment_days);
    if (payment_remark !== undefined) updateData.payment_remark = payment_remark;
    if (contract_status !== undefined) updateData.contract_status = contract_status;
    if (remark !== undefined) updateData.remark = remark;

    const { data, error } = await supabase
      .from('supplier_contracts')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // 记录日志
    await supabase.from('supplier_contract_logs').insert({
      contract_id: id,
      action: '修改合同',
      operator_id: user?.id,
      operator_name: user?.user_metadata?.username || user?.email,
      detail: { old: oldData, new: data },
    });

    // 记录审计日志
    await auditLog({
      operationType: 'update',
      resourceType: 'supplier_contract',
      resourceId: Number(id),
      details: { contract_name: data?.contract_name, changes: Object.keys(updateData) },
      request,
    });

    return NextResponse.json({ contract: data });
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

    // 获取合同名称用于日志
    const { data: contractData } = await supabase
      .from('supplier_contracts')
      .select('contract_name')
      .eq('id', id)
      .single();

    // 级联删除：先删除关联的付款记录
    const { error: paymentError } = await supabase
      .from('supplier_payments')
      .delete()
      .eq('contract_id', id);

    if (paymentError) {
      console.error('删除付款记录失败:', paymentError);
    }

    // 级联删除：再删除关联的结算单
    const { error: settlementError } = await supabase
      .from('supplier_settlements')
      .delete()
      .eq('contract_id', id);

    if (settlementError) {
      console.error('删除结算单失败:', settlementError);
    }

    // 级联删除：删除关联的操作日志
    await supabase
      .from('supplier_contract_logs')
      .delete()
      .eq('contract_id', id);

    // 最后删除合同本身
    const { error } = await supabase
      .from('supplier_contracts')
      .delete()
      .eq('id', id);

    if (error) throw error;

    // 记录审计日志
    await auditLog({
      operationType: 'delete',
      resourceType: 'supplier_contract',
      resourceId: Number(id),
      details: { contract_name: contractData?.contract_name },
      request,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
