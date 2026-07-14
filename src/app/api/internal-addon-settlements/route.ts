import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const projectId = searchParams.get('project_id');
    const yearMonth = searchParams.get('year_month');
    const addonId = searchParams.get('addon_id');

    const supabase = getSupabaseClient();
    let query = supabase
      .from('internal_addon_monthly_settlements')
      .select(`
        *,
        addon:project_internal_addons (
          id,
          name,
          unit,
          project_id
        )
      `)
      .order('year_month', { ascending: false });

    if (projectId) query = query.eq('project_id', parseInt(projectId));
    if (yearMonth) query = query.eq('year_month', yearMonth);
    if (addonId) query = query.eq('addon_id', parseInt(addonId));

    const { data, error } = await query;
    if (error) throw error;

    const records = (data || []).map((record: any) => ({
      id: record.id,
      project_id: record.project_id,
      addon_id: record.addon_id,
      addon_name: record.addon?.name || '',
      unit: record.addon?.unit || '',
      year_month: record.year_month,
      quantity: record.quantity,
      unit_price: record.unit_price,
      amount: (parseFloat(record.quantity || '0') || 0) * (parseFloat(record.unit_price || '0') || 0),
      remark: record.remark,
      created_at: record.created_at,
    }));

    return NextResponse.json({ records });
  } catch (error: any) {
    console.error('获取内部附加结算失败:', error);
    return NextResponse.json({ error: error.message || '查询失败' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const records = Array.isArray(body.records) ? body.records : [body];

    const supabase = getSupabaseClient();
    const results = [];

    for (const record of records) {
      const { project_id, addon_id, year_month, quantity, unit_price, remark } = record;
      if (!project_id || !addon_id || !year_month || quantity === undefined) continue;

      const normalizedQuantity = quantity ? quantity.toString() : '0';
      const normalizedPrice = unit_price ? unit_price.toString() : '0';

      const { data: existing } = await supabase
        .from('internal_addon_monthly_settlements')
        .select('id')
        .eq('addon_id', parseInt(addon_id))
        .eq('year_month', year_month)
        .single();

      if (existing) {
        const { data, error } = await supabase
          .from('internal_addon_monthly_settlements')
          .update({
            project_id: parseInt(project_id),
            quantity: normalizedQuantity,
            unit_price: normalizedPrice,
            remark: remark || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id)
          .select()
          .single();

        if (!error && data) results.push(data);
      } else {
        const { data, error } = await supabase
          .from('internal_addon_monthly_settlements')
          .insert({
            project_id: parseInt(project_id),
            addon_id: parseInt(addon_id),
            year_month,
            quantity: normalizedQuantity,
            unit_price: normalizedPrice,
            remark: remark || null,
          })
          .select()
          .single();

        if (!error && data) results.push(data);
      }
    }

    return NextResponse.json({ success: true, records: results });
  } catch (error: any) {
    console.error('保存内部附加结算失败:', error);
    return NextResponse.json({ error: error.message || '保存失败' }, { status: 500 });
  }
}
