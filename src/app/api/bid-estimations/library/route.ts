import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

type LibraryType = 'standard' | 'bidPrice' | 'costPrice' | 'alias';

const tableByType: Record<LibraryType, string> = {
  standard: 'bid_standard_items',
  bidPrice: 'bid_price_history',
  costPrice: 'bid_cost_history',
  alias: 'bid_item_aliases',
};

function isLibraryType(value: string | null): value is LibraryType {
  return value === 'standard' || value === 'bidPrice' || value === 'costPrice' || value === 'alias';
}

function toNumber(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export async function GET() {
  try {
    const supabase = getSupabaseClient();
    const [standardResult, bidResult, costResult, aliasResult] = await Promise.all([
      supabase.from('bid_standard_items').select('*').order('sort_order', { ascending: true }).order('id', { ascending: true }),
      supabase.from('bid_price_history').select('*, bid_standard_items(code,name)').order('created_at', { ascending: false }),
      supabase.from('bid_cost_history').select('*, bid_standard_items(code,name)').order('created_at', { ascending: false }),
      supabase.from('bid_item_aliases').select('*'),
    ]);

    const firstError = standardResult.error || bidResult.error || costResult.error || aliasResult.error;
    if (firstError) throw new Error(firstError.message);

    return NextResponse.json({
      success: true,
      data: {
        standards: standardResult.data || [],
        bidPrices: bidResult.data || [],
        costPrices: costResult.data || [],
        aliases: aliasResult.data || [],
      },
    });
  } catch (e: unknown) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : '获取投标资料库失败' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const type = body.type as string | null;
    if (type === 'standardBatch') {
      const items = Array.isArray(body.items) ? body.items : [];
      if (!items.length) {
        return NextResponse.json({ success: false, error: '缺少标准清单导入数据' }, { status: 400 });
      }

      const rowMap = new Map<string, Record<string, unknown>>();
      for (const item of items) {
        const payload = buildStandardPayload(item as Record<string, unknown>);
        if (!payload.code || !payload.name) continue;
        rowMap.set(String(payload.code).toLowerCase(), payload);
      }

      const payloads = Array.from(rowMap.values());
      if (!payloads.length) {
        return NextResponse.json({ success: false, error: '没有可导入的有效标准清单' }, { status: 400 });
      }

      const supabase = getSupabaseClient();
      const codes = payloads.map(item => String(item.code));
      const existingResult = await supabase.from('bid_standard_items').select('code').in('code', codes);
      if (existingResult.error) throw new Error(existingResult.error.message);

      const existingCodes = new Set((existingResult.data || []).map(item => String(item.code).toLowerCase()));
      const updated = payloads.filter(item => existingCodes.has(String(item.code).toLowerCase())).length;
      const { data, error } = await supabase
        .from('bid_standard_items')
        .upsert(payloads, { onConflict: 'code' })
        .select();
      if (error) throw new Error(error.message);

      return NextResponse.json({
        success: true,
        data: {
          imported: data?.length || payloads.length,
          created: payloads.length - updated,
          updated,
        },
      });
    }
    if (!isLibraryType(type)) {
      return NextResponse.json({ success: false, error: '资料类型不正确' }, { status: 400 });
    }

    const supabase = getSupabaseClient();
    const payload = buildPayload(type, body);
    const { data, error } = await supabase.from(tableByType[type]).insert(payload).select().single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true, data });
  } catch (e: unknown) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : '保存投标资料失败' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const type = body.type as string | null;
    const id = toNumber(body.id);
    if (!isLibraryType(type) || !id) {
      return NextResponse.json({ success: false, error: '缺少更新参数' }, { status: 400 });
    }

    const supabase = getSupabaseClient();
    const payload = buildPayload(type, body);
    const { data, error } = await supabase.from(tableByType[type]).update(payload).eq('id', id).select().single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true, data });
  } catch (e: unknown) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : '更新投标资料失败' }, { status: 500 });
  }
}

function buildPayload(type: LibraryType, body: Record<string, unknown>) {
  if (type === 'standard') {
    return buildStandardPayload(body);
  }

  if (type === 'alias') {
    return {
      standard_item_id: toNumber(body.standard_item_id),
      alias_name: String(body.alias_name || '').trim(),
      source_type: String(body.source_type || 'manual'),
    };
  }

  const common = {
    standard_item_id: toNumber(body.standard_item_id),
    project_name: String(body.project_name || '').trim(),
    region: String(body.region || '').trim(),
    project_type: String(body.project_type || '').trim(),
    item_original_name: String(body.item_original_name || '').trim(),
    unit: String(body.unit || '').trim(),
    price: toNumber(body.price),
    material_included: Boolean(body.material_included),
    remark: String(body.remark || '').trim(),
  };

  if (type === 'bidPrice') {
    return {
      ...common,
      bid_year: toNumber(body.bid_year, new Date().getFullYear()),
      material_scope_note: String(body.material_scope_note || '').trim(),
    };
  }

  return {
    ...common,
    cost_year: toNumber(body.cost_year, new Date().getFullYear()),
  };
}

function buildStandardPayload(body: Record<string, unknown>) {
  const payload: Record<string, unknown> = {
    code: String(body.code || '').trim(),
    name: String(body.name || '').trim(),
    unit: String(body.unit || '').trim(),
    category: String(body.category || '').trim(),
    material_included: Boolean(body.material_included),
    material_scope_note: String(body.material_scope_note || '').trim(),
    status: String(body.status || 'active').trim() || 'active',
  };

  if (body.sort_order !== undefined && body.sort_order !== '') {
    payload.sort_order = toNumber(body.sort_order);
  }

  return payload;
}
