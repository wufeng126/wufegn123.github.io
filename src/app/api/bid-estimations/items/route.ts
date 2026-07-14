import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const bidId = Number(searchParams.get('bidId'));
    const type = searchParams.get('type');
    if (!bidId || !type) return NextResponse.json({ success: false, error: '缺少参数' }, { status: 400 });

    const table = type === 'items' ? 'bid_items' : 'bid_management_fees';
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq('bid_id', bidId)
      .order('sort_order');

    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true, data: data || [] });
  } catch (e: unknown) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : '查询失败' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const bidId = Number(body.bidId);
    const type = body.type;
    const items = body.items;
    if (!bidId || !type || !Array.isArray(items)) {
      return NextResponse.json({ success: false, error: '缺少参数' }, { status: 400 });
    }

    const table = type === 'items' ? 'bid_items' : 'bid_management_fees';
    const supabase = getSupabaseClient();

    await supabase.from(table).delete().eq('bid_id', bidId);
    const inserts = items.map((item: Record<string, unknown>, i: number) => ({
      ...item,
      bid_id: bidId,
      sort_order: i,
    }));

    if (inserts.length > 0) {
      const { error } = await supabase.from(table).insert(inserts);
      if (error) throw new Error(error.message);
    }

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : '保存失败' }, { status: 500 });
  }
}
