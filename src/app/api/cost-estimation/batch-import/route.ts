import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { items } = body; // [{work_type, unit, price, project_id, year, notes}]
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ success: false, error: '数据不能为空' }, { status: 400 });
    }

    const supabase = getSupabaseClient();
    const results = { success: 0, failed: 0, errors: [] as string[] };

    for (const item of items) {
      if (!item.work_type || !item.price) {
        results.failed++;
        results.errors.push(`工序或单价缺失: ${JSON.stringify(item)}`);
        continue;
      }
      const { error } = await supabase.from('unit_prices').insert({
        work_type: item.work_type.trim(),
        unit: item.unit || null,
        price: parseFloat(item.price),
        project_id: item.project_id ? parseInt(item.project_id) : null,
        year: item.year || new Date().getFullYear(),
        notes: item.notes || null,
      });
      if (error) { results.failed++; results.errors.push(`${item.work_type}: ${error.message}`); }
      else results.success++;
    }

    return NextResponse.json({ success: true, data: results });
  } catch (e: unknown) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : '导入失败' }, { status: 500 });
  }
}
