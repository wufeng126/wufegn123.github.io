import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const bidId = Number(searchParams.get('bidId'));
    if (!bidId) return NextResponse.json({ success: false, error: '缺少测算项目' }, { status: 400 });

    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('bid_versions')
      .select('*')
      .eq('bid_id', bidId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true, data: data || [] });
  } catch (e: unknown) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : '获取测算版本失败' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const bidId = Number(body.bid_id);
    if (!bidId || !body.snapshot) {
      return NextResponse.json({ success: false, error: '缺少版本数据' }, { status: 400 });
    }

    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('bid_versions')
      .insert({
        bid_id: bidId,
        name: String(body.name || `测算版本 ${new Date().toLocaleString('zh-CN')}`),
        summary: String(body.summary || ''),
        total_amount: Number(body.total_amount || 0),
        snapshot: body.snapshot,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);

    const { count } = await supabase
      .from('bid_versions')
      .select('id', { count: 'exact', head: true })
      .eq('bid_id', bidId);

    await supabase.from('bid_estimations').update({ version_count: count || 0 }).eq('id', bidId);

    return NextResponse.json({ success: true, data });
  } catch (e: unknown) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : '保存测算版本失败' }, { status: 500 });
  }
}
