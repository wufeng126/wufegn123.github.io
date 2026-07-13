import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireApiWritePermission } from '@/lib/api-auth';
import { isReviewedStatus } from '@/lib/business-logic';

// POST /api/supplier-settlements/batch-delete - 批量删除结算记录
export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const supabase = getSupabaseClient();
    const { ids } = await request.json();

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: '请选择要删除的记录' }, { status: 400 });
    }

    const { data: settlements, error: fetchError } = await supabase
      .from('supplier_settlements')
      .select('id, status')
      .in('id', ids);

    if (fetchError) throw fetchError;

    const reviewedSettlements = (settlements || []).filter((s: any) => isReviewedStatus(s.status));
    if (reviewedSettlements.length > 0) {
      return NextResponse.json({ error: '已审核结算单不可删除，请先反审核或作废' }, { status: 400 });
    }

    const { data: payments, error: paymentError } = await supabase
      .from('supplier_payments')
      .select('settlement_id')
      .in('settlement_id', ids);

    if (paymentError) throw paymentError;

    if ((payments || []).length > 0) {
      return NextResponse.json({ error: '选中的结算单存在付款记录，无法删除' }, { status: 400 });
    }

    const { error } = await supabase
      .from('supplier_settlements')
      .delete()
      .in('id', ids);

    if (error) throw error;

    return NextResponse.json({ success: true, deletedCount: ids.length });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
