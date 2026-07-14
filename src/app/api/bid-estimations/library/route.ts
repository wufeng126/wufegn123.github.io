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
    return {
      code: String(body.code || '').trim(),
      name: String(body.name || '').trim(),
      unit: String(body.unit || '').trim(),
      category: String(body.category || '').trim(),
      material_included: Boolean(body.material_included),
      material_scope_note: String(body.material_scope_note || '').trim(),
      status: String(body.status || 'active'),
    };
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
