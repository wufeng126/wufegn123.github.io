import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { auditLog } from '@/lib/audit-log';
import {
  isReviewedStatus,
  isVoidedStatus,
  REVIEW_STATUS,
  validateStatusTransition,
} from '@/lib/business-logic';
import { requireApiWritePermission, requireAuth } from '@/lib/api-auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

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
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const settlementId = Number(id);
    const supabase = getSupabaseClient();
    const body = await request.json();
    const { settlement_amount, settlement_date, remark, status } = body;

    const { data: current, error: fetchError } = await supabase
      .from('supplier_settlements')
      .select('*')
      .eq('id', settlementId)
      .single();

    if (fetchError || !current) {
      return NextResponse.json({ error: '结算单不存在' }, { status: 404 });
    }

    if (isVoidedStatus(current.status)) {
      return NextResponse.json({ error: '已作废的结算单不可变更' }, { status: 400 });
    }

    const amountChanged =
      settlement_amount !== undefined &&
      Number(settlement_amount) !== Number(current.settlement_amount || 0);

    if (isReviewedStatus(current.status) && amountChanged && status !== REVIEW_STATUS.DRAFT) {
      return NextResponse.json({ error: '已审核结算单不可直接修改金额，请先反审核' }, { status: 400 });
    }

    let payableAmount = Number(current.payable_amount || 0);
    const paymentRatio = Number(current.payment_ratio || 0);

    if (amountChanged) {
      payableAmount = Number(settlement_amount) * (paymentRatio / 100);
    }

    const updateData: any = {};
    if (settlement_amount !== undefined) updateData.settlement_amount = Number(settlement_amount);
    if (settlement_date !== undefined) updateData.settlement_date = settlement_date;
    if (remark !== undefined) updateData.remark = remark;
    if (amountChanged) updateData.payable_amount = payableAmount.toFixed(2);

    let nextStatus: string | undefined;
    if (status !== undefined) {
      const validation = validateStatusTransition(current.status || REVIEW_STATUS.DRAFT, status);
      if (!validation.valid) {
        return NextResponse.json({ error: validation.message || '状态流转不合法' }, { status: 400 });
      }

      nextStatus = status;
      updateData.status = status;
      if (status === REVIEW_STATUS.REVIEWED) {
        updateData.reviewed_at = new Date().toISOString();
        updateData.reviewed_by = auth.user.username || auth.user.name || 'system';
      }
      if (status === REVIEW_STATUS.DRAFT) {
        updateData.reviewed_at = null;
        updateData.reviewed_by = null;
      }
    }

    const { data, error } = await supabase
      .from('supplier_settlements')
      .update(updateData)
      .eq('id', settlementId)
      .select()
      .single();

    if (error) throw error;

    if (nextStatus && current.settlement_type === 'final') {
      if (nextStatus === REVIEW_STATUS.REVIEWED) {
        await supabase
          .from('supplier_contracts')
          .update({
            contract_status: '已完结',
            locked: true,
            updated_at: new Date().toISOString(),
          })
          .eq('id', current.contract_id);

        await supabase.from('supplier_contract_logs').insert({
          contract_id: current.contract_id,
          action: '总终结算审核通过',
          operator_id: auth.user.id,
          operator_name: auth.user.name || auth.user.username,
          detail: { settlement_no: current.settlement_no, settlement_amount: data?.settlement_amount, payable_amount: data?.payable_amount },
        });
      }

      if (nextStatus === REVIEW_STATUS.DRAFT) {
        await supabase
          .from('supplier_contracts')
          .update({
            contract_status: '履约中',
            locked: false,
            updated_at: new Date().toISOString(),
          })
          .eq('id', current.contract_id);
      }
    }

    await auditLog({
      operationType: 'update',
      resourceType: 'supplier_settlement',
      resourceId: settlementId,
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
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const settlementId = Number(id);
    const supabase = getSupabaseClient();

    const { data: current } = await supabase
      .from('supplier_settlements')
      .select('*')
      .eq('id', settlementId)
      .single();

    if (!current) {
      return NextResponse.json({ error: '结算单不存在' }, { status: 404 });
    }

    if (isReviewedStatus(current.status)) {
      return NextResponse.json({ error: '已审核结算单不可删除，请先反审核或作废' }, { status: 400 });
    }

    const { data: payments } = await supabase
      .from('supplier_payments')
      .select('id')
      .eq('settlement_id', settlementId)
      .limit(1);

    if (payments && payments.length > 0) {
      return NextResponse.json({ error: '该结算单已有付款记录，无法删除' }, { status: 400 });
    }

    const { error } = await supabase
      .from('supplier_settlements')
      .delete()
      .eq('id', settlementId);

    if (error) throw error;

    await auditLog({
      operationType: 'delete',
      resourceType: 'supplier_settlement',
      resourceId: settlementId,
      details: { settlement_no: current?.settlement_no, settlement_type: current?.settlement_type },
      request,
    });

    if (current.settlement_type === 'final') {
      await supabase
        .from('supplier_contracts')
        .update({ contract_status: '履约中', locked: false })
        .eq('id', current.contract_id);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
