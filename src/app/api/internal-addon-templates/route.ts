import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET() {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('internal_addon_templates')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json({ templates: data || [] });
  } catch (error: any) {
    console.error('获取内部附加清单模板失败:', error);
    return NextResponse.json({ error: error.message || '查询失败' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, unit, default_price, remark, sort_order } = body;

    if (!name || !unit) {
      return NextResponse.json({ error: '缺少必填字段（清单名称、单位）' }, { status: 400 });
    }

    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('internal_addon_templates')
      .insert({
        name,
        unit,
        default_price: default_price ? default_price.toString() : '0',
        remark: remark || null,
        sort_order: sort_order || 0,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ template: data });
  } catch (error: any) {
    console.error('创建内部附加清单模板失败:', error);
    return NextResponse.json({ error: error.message || '创建失败' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, name, unit, default_price, remark, sort_order } = body;

    if (!id) {
      return NextResponse.json({ error: '缺少模板ID' }, { status: 400 });
    }

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (name !== undefined) updateData.name = name;
    if (unit !== undefined) updateData.unit = unit;
    if (default_price !== undefined) updateData.default_price = default_price ? default_price.toString() : '0';
    if (remark !== undefined) updateData.remark = remark || null;
    if (sort_order !== undefined) updateData.sort_order = sort_order || 0;

    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('internal_addon_templates')
      .update(updateData)
      .eq('id', parseInt(id))
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ template: data });
  } catch (error: any) {
    console.error('更新内部附加清单模板失败:', error);
    return NextResponse.json({ error: error.message || '更新失败' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const ids = request.nextUrl.searchParams.get('ids');
    if (!ids) {
      return NextResponse.json({ error: '缺少模板ID' }, { status: 400 });
    }

    const idArray = ids.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
    if (idArray.length === 0) {
      return NextResponse.json({ error: '无效的模板ID' }, { status: 400 });
    }

    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from('internal_addon_templates')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .in('id', idArray);

    if (error) throw error;
    return NextResponse.json({ success: true, deletedCount: idArray.length });
  } catch (error: any) {
    console.error('删除内部附加清单模板失败:', error);
    return NextResponse.json({ error: error.message || '删除失败' }, { status: 500 });
  }
}
