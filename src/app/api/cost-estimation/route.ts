import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    const workType = searchParams.get('workType');

    let query = supabase.from('unit_prices').select('*, projects(name)').order('created_at', { ascending: false }).limit(200);
    if (projectId) query = query.eq('project_id', parseInt(projectId));
    if (workType) query = query.ilike('work_type', `%${workType}%`);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true, data: data || [] });
  } catch (e: unknown) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : '查询失败' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { project_id, work_type, unit, price, contract_type, quantity, year, notes } = body;
    if (!work_type || !price) {
      return NextResponse.json({ success: false, error: '工序和单价不能为空' }, { status: 400 });
    }
    const supabase = getSupabaseClient();
    const amount = quantity ? parseFloat(quantity) * parseFloat(price) : null;
    const { data, error } = await supabase.from('unit_prices').insert({
      project_id: project_id ? parseInt(project_id) : null,
      work_type, unit, price: parseFloat(price),
      contract_type: contract_type || '包活',
      quantity: quantity ? parseFloat(quantity) : null, amount,
      year: year || new Date().getFullYear(),
      notes,
    }).select().single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true, data });
  } catch (e: unknown) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : '保存失败' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ success: false, error: '缺少id' }, { status: 400 });
    const supabase = getSupabaseClient();
    await supabase.from('unit_prices').delete().eq('id', parseInt(id));
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : '删除失败' }, { status: 500 });
  }
}
