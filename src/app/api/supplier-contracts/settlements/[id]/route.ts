import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { auditLog } from '@/lib/audit-log';
import { validateStatusTransition } from '@/lib/business-logic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('supplier_settlements')
      .select(`
        *,
        contract:contract_id(
          id, contract_name, contract_no, supplier_id, 
          payment_ratio_active, payment_ratio_complete
        )
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
    const { settlement_amount, settlement_date, remark, status } = body;

    // 获取当前结算单
    const { data: current, error: fetchError } = await supabase
      .from('supplier_settlements')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !current) {
      return NextResponse.json({ error: '结算单不存在' }, { status: 404 });
    }

    // 获取关联合同
    const { data: contract } = await supabase
      .from('supplier_contracts')
      .select('*')
      .eq('id', current.contract_id)
      .single();

    // 如果修改了结算金额，需要重新计算应付金额
    let payable_amount = current.payable_amount;
    let payment_ratio = current.payment_ratio;

    if (settlement_amount !== undefined && settlement_amount !== current.settlement_amount) {
      payable_amount = Number(settlement_amount) * (payment_ratio / 100);
    }

    const updateData: any = {};
    if (settlement_amount !== undefined) updateData.settlement_amount = settlement_amount;
    if (settlement_date !== undefined) updateData.settlement_date = settlement_date;
    if (remark !== undefined) updateData.remark = remark;
    if (status !== undefined) {
      // 校验状态流转合法性
      const validation = validateStatusTransition(current.status, status);
      if (!validation.valid) {
        return NextResponse.json({ error: validation.message || '状态流转不合法' }, { status: 400 });
      }
      updateData.status = status;
      // 审核时记录审核人和时间
      if (status === 'reviewed') {
        updateData.reviewed_at = new Date().toISOString();
        // 从请求获取用户名
        const token = request.cookies.get('auth_token')?.value;
        if (token) {
          try {
            const { decodeJwt } = await import('jose');
            const payload = decodeJwt(token);
            updateData.reviewed_by = payload.username || payload.name || 'system';
          } catch (e) {}
        }
      }
    }
    if (payable_amount !== current.payable_amount) updateData.payable_amount = payable_amount.toFixed(2);

    const { data, error } = await supabase
      .from('supplier_settlements')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    await auditLog({
      operationType: 'update',
      resourceType: 'supplier_settlement',
      resourceId: Number(id),
      details: { settlement_no: current?.settlement_no, changes: Object.keys(updateData) },
      request,
    });

    return NextResponse.json({ settlement: data });
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

    // 获取当前结算单
    const { data: current } = await supabase
      .from('supplier_settlements')
      .select('*')
      .eq('id', id)
      .single();

    if (!current) {
      return NextResponse.json({ error: '结算单不存在' }, { status: 404 });
    }

    // 检查是否有关联的付款记录
    const { data: payments } = await supabase
      .from('supplier_payments')
      .select('id')
      .eq('settlement_id', id)
      .limit(1);

    if (payments && payments.length > 0) {
      return NextResponse.json({ error: '该结算单已有付款记录，无法删除' }, { status: 400 });
    }

    const { error } = await supabase
      .from('supplier_settlements')
      .delete()
      .eq('id', id);

    if (error) throw error;

    await auditLog({
      operationType: 'delete',
      resourceType: 'supplier_settlement',
      resourceId: Number(id),
      details: { settlement_no: current?.settlement_no, settlement_type: current?.settlement_type },
      request,
    });

    // 如果删除的是结算完结算单，需要将合同状态恢复为履约中
    if (current.settlement_type === '结算完') {
      await supabase
        .from('supplier_contracts')
        .update({ contract_status: '履约中' })
        .eq('id', current.contract_id);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
