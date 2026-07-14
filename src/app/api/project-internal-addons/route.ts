import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

async function withTotals(supabase: ReturnType<typeof getSupabaseClient>, addons: any[]) {
  if (addons.length === 0) return [];

  const addonIds = addons.map(addon => addon.id);
  const { data: settlements } = await supabase
    .from('internal_addon_monthly_settlements')
    .select('addon_id, quantity, unit_price')
    .in('addon_id', addonIds);

  const totals = new Map<number, { quantity: number; amount: number }>();
  (settlements || []).forEach((record: any) => {
    const current = totals.get(record.addon_id) || { quantity: 0, amount: 0 };
    const quantity = parseFloat(record.quantity || '0') || 0;
    const price = parseFloat(record.unit_price || '0') || 0;
    current.quantity += quantity;
    current.amount += quantity * price;
    totals.set(record.addon_id, current);
  });

  return addons.map(addon => {
    const total = totals.get(addon.id) || { quantity: 0, amount: 0 };
    return {
      ...addon,
      total_quantity: total.quantity.toString(),
      total_amount: total.amount.toString(),
    };
  });
}

export async function GET(request: NextRequest) {
  try {
    const projectId = request.nextUrl.searchParams.get('project_id');
    if (!projectId) {
      return NextResponse.json({ error: '缺少项目ID' }, { status: 400 });
    }

    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('project_internal_addons')
      .select('*')
      .eq('project_id', parseInt(projectId))
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json({ addons: await withTotals(supabase, data || []) });
  } catch (error: any) {
    console.error('获取项目内部附加清单失败:', error);
    return NextResponse.json({ error: error.message || '查询失败' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, project_id, name, unit, unit_price, remark, sort_order } = body;

    if (!project_id) {
      return NextResponse.json({ error: '缺少项目ID' }, { status: 400 });
    }

    const supabase = getSupabaseClient();

    if (action === 'import_templates') {
      const { data: templates, error: templateError } = await supabase
        .from('internal_addon_templates')
        .select('*')
        .eq('is_active', true);

      if (templateError) throw templateError;

      const { data: existing, error: existingError } = await supabase
        .from('project_internal_addons')
        .select('template_id, name')
        .eq('project_id', parseInt(project_id))
        .eq('is_active', true);

      if (existingError) throw existingError;

      const existingTemplateIds = new Set((existing || []).map((item: any) => item.template_id).filter(Boolean));
      const existingNames = new Set((existing || []).map((item: any) => item.name));
      const insertRows = (templates || [])
        .filter((template: any) => !existingTemplateIds.has(template.id) && !existingNames.has(template.name))
        .map((template: any) => ({
          project_id: parseInt(project_id),
          template_id: template.id,
          name: template.name,
          unit: template.unit,
          unit_price: template.default_price || '0',
          remark: template.remark || null,
          sort_order: template.sort_order || 0,
        }));

      if (insertRows.length === 0) {
        return NextResponse.json({ success: true, importedCount: 0, addons: [] });
      }

      const { data, error } = await supabase
        .from('project_internal_addons')
        .insert(insertRows)
        .select();

      if (error) throw error;
      return NextResponse.json({ success: true, importedCount: data?.length || 0, addons: data || [] });
    }

    if (!name || !unit) {
      return NextResponse.json({ error: '缺少必填字段（清单名称、单位）' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('project_internal_addons')
      .insert({
        project_id: parseInt(project_id),
        name,
        unit,
        unit_price: unit_price ? unit_price.toString() : '0',
        remark: remark || null,
        sort_order: sort_order || 0,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ addon: data });
  } catch (error: any) {
    console.error('创建项目内部附加清单失败:', error);
    return NextResponse.json({ error: error.message || '创建失败' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, name, unit, unit_price, remark, sort_order } = body;

    if (!id) {
      return NextResponse.json({ error: '缺少清单ID' }, { status: 400 });
    }

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (name !== undefined) updateData.name = name;
    if (unit !== undefined) updateData.unit = unit;
    if (unit_price !== undefined) updateData.unit_price = unit_price ? unit_price.toString() : '0';
    if (remark !== undefined) updateData.remark = remark || null;
    if (sort_order !== undefined) updateData.sort_order = sort_order || 0;

    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('project_internal_addons')
      .update(updateData)
      .eq('id', parseInt(id))
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ addon: data });
  } catch (error: any) {
    console.error('更新项目内部附加清单失败:', error);
    return NextResponse.json({ error: error.message || '更新失败' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const ids = request.nextUrl.searchParams.get('ids');
    if (!ids) {
      return NextResponse.json({ error: '缺少清单ID' }, { status: 400 });
    }

    const idArray = ids.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
    if (idArray.length === 0) {
      return NextResponse.json({ error: '无效的清单ID' }, { status: 400 });
    }

    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from('project_internal_addons')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .in('id', idArray);

    if (error) throw error;
    return NextResponse.json({ success: true, deletedCount: idArray.length });
  } catch (error: any) {
    console.error('删除项目内部附加清单失败:', error);
    return NextResponse.json({ error: error.message || '删除失败' }, { status: 500 });
  }
}
