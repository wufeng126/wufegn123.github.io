import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET() {
  try {
    const supabase = getSupabaseClient();
    const { data } = await supabase.from('work_type_standards').select('*').order('sort_order');
    return NextResponse.json({ success: true, data: data || [] });
  } catch (e: unknown) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : '获取失败' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, unit, category } = body;
    if (!name) return NextResponse.json({ success: false, error: '名称不能为空' }, { status: 400 });
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.from('work_type_standards').insert({ name, unit, category }).select().single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true, data });
  } catch (e: unknown) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : '保存失败' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, name, unit, category } = body;
    if (!id) return NextResponse.json({ success: false, error: '缺少id' }, { status: 400 });
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.from('work_type_standards').update({ name, unit, category }).eq('id', id).select().single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true, data });
  } catch (e: unknown) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : '更新失败' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ success: false, error: '缺少id' }, { status: 400 });
    const supabase = getSupabaseClient();
    await supabase.from('work_type_standards').delete().eq('id', parseInt(id));
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : '删除失败' }, { status: 500 });
  }
}
