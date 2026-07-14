import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET() {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('bid_estimations')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true, data: data || [] });
  } catch (e: unknown) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : '查询失败' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('bid_estimations')
      .insert({
        name: body.name,
        project_type: body.project_type,
        region: body.region,
        material_included: Boolean(body.material_included),
        material_scope_note: body.material_scope_note,
        duration_months: Number(body.duration_months || 0),
        profit_rate: Number(body.profit_rate || 5),
        management_fee_rate: Number(body.management_fee_rate || 0),
        status: body.status || '测算中',
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true, data });
  } catch (e: unknown) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : '创建失败' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...updates } = body;
    if (!id) return NextResponse.json({ success: false, error: '缺少id' }, { status: 400 });

    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('bid_estimations')
      .update(updates)
      .eq('id', Number(id))
      .select()
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true, data });
  } catch (e: unknown) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : '更新失败' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = Number(searchParams.get('id'));
    if (!id) return NextResponse.json({ success: false, error: '缺少id' }, { status: 400 });

    const supabase = getSupabaseClient();
    await supabase.from('bid_items').delete().eq('bid_id', id);
    await supabase.from('bid_management_fees').delete().eq('bid_id', id);
    await supabase.from('bid_versions').delete().eq('bid_id', id);
    await supabase.from('bid_estimations').delete().eq('id', id);

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : '删除失败' }, { status: 500 });
  }
}
