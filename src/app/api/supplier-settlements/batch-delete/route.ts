import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireApiWritePermission } from '@/lib/api-auth';
import { isReviewedStatus } from '@/lib/business-logic';

type SupplierSettlementDeleteRow = {
  id: number;
  status: string | null;
};

function normalizeIdList(value: unknown, maxCount = 300): number[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > maxCount) return null;

  const ids = value.map((item) => {
    const id = typeof item === 'number' ? item : Number(item);
    return Number.isInteger(id) && id > 0 ? id : null;
  });

  if (ids.some((id) => id === null)) return null;
  return Array.from(new Set(ids as number[]));
}

// POST /api/supplier-settlements/batch-delete - 批量删除结算记录
export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const supabase = getSupabaseClient();
    const body = await request.json();
    const ids = normalizeIdList(body.ids);

    if (!ids) {
      return NextResponse.json({ error: '请选择有效的结算记录，且单次最多删除300条' }, { status: 400 });
    }

    const { data: settlements, error: fetchError } = await supabase
      .from('supplier_settlements')
      .select('id, status')
      .in('id', ids);

    if (fetchError) throw fetchError;

    const reviewedSettlements = ((settlements || []) as SupplierSettlementDeleteRow[])
      .filter((s) => isReviewedStatus(s.status));
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
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '删除失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
