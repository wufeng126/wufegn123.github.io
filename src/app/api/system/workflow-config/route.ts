import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET() {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.from('workflow_configs').select('*').order('id');
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true, data: data || [] });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { workflow_type, name, steps } = body;
    if (!workflow_type || !steps) {
      return NextResponse.json({ success: false, error: '缺少参数' }, { status: 400 });
    }
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.from('workflow_configs').upsert({
      workflow_type, name: name || workflow_type, steps,
      updated_at: new Date().toISOString(),
    }).select().single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true, data });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ success: false, error: '缺少id' }, { status: 400 });
    const supabase = getSupabaseClient();
    await supabase.from('workflow_configs').delete().eq('id', parseInt(id));
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
