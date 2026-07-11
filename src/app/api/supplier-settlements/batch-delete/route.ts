import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// POST /api/supplier-settlements/batch-delete - 批量删除结算记录
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    const { ids } = await request.json();

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: '请选择要删除的记录' }, { status: 400 });
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
