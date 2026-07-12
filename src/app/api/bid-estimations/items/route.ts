import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const bidId = searchParams.get('bidId');
    const type = searchParams.get('type'); // 'items' | 'fees'
    if (!bidId || !type) return NextResponse.json({ success: false, error: '缺少参数' }, { status: 400 });
    const supabase = getSupabaseClient();
    const table = type === 'items' ? 'bid_items' : 'bid_management_fees';
    const { data } = await supabase.from(table).select('*').eq('bid_id', parseInt(bidId)).order('sort_order');
    return NextResponse.json({ success: true, data: data || [] });
  } catch (e: unknown) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : '查询失败' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { bidId, type, items } = body; // type: 'items' | 'fees'
    if (!bidId || !type || !Array.isArray(items)) return NextResponse.json({ success: false, error: '缺少参数' }, { status: 400 });

    const supabase = getSupabaseClient();
    const table = type === 'items' ? 'bid_items' : 'bid_management_fees';
    const idField = type === 'items' ? 'bid_id' : 'bid_id';

    // 删旧插新
    await supabase.from(table).delete().eq(idField, parseInt(bidId));
    const inserts = items.map((item: any, i: number) => ({ ...item, bid_id: parseInt(bidId), sort_order: i }));
    if (inserts.length > 0) {
      const { error } = await supabase.from(table).insert(inserts);
      if (error) throw new Error(error.message);
    }

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : '保存失败' }, { status: 500 });
  }
}
