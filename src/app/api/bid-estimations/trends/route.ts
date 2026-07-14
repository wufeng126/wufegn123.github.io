import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

function toNumber(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toTime(value: unknown) {
  const time = value ? new Date(String(value)).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

export async function GET() {
  try {
    const supabase = getSupabaseClient();
    const [standardResult, priceResult] = await Promise.all([
      supabase
        .from('bid_standard_items')
        .select('id,code,name,unit,category,material_included,status,sort_order')
        .order('sort_order', { ascending: true })
        .order('id', { ascending: true }),
      supabase
        .from('bid_price_history')
        .select('id,standard_item_id,project_name,project_type,unit,price,bid_year,material_included,created_at')
        .order('bid_year', { ascending: true })
        .order('created_at', { ascending: true }),
    ]);

    const firstError = standardResult.error || priceResult.error;
    if (firstError) throw new Error(firstError.message);

    const pricesByStandard = new Map<number, any[]>();
    (priceResult.data || []).forEach((row: any) => {
      const standardId = toNumber(row.standard_item_id);
      if (!standardId) return;
      const list = pricesByStandard.get(standardId) || [];
      list.push({
        id: row.id,
        project_name: row.project_name || '',
        project_type: row.project_type || '',
        unit: row.unit || '',
        price: toNumber(row.price),
        bid_year: row.bid_year ? toNumber(row.bid_year) : null,
        material_included: Boolean(row.material_included),
        created_at: row.created_at || '',
      });
      pricesByStandard.set(standardId, list);
    });

    const trends = (standardResult.data || [])
      .filter((item: any) => (item.status || 'active') === 'active')
      .map((item: any) => {
        const history = (pricesByStandard.get(item.id) || []).sort((a, b) => {
          const yearDiff = toNumber(a.bid_year) - toNumber(b.bid_year);
          if (yearDiff !== 0) return yearDiff;
          const timeDiff = toTime(a.created_at) - toTime(b.created_at);
          if (timeDiff !== 0) return timeDiff;
          return toNumber(a.id) - toNumber(b.id);
        });
        const latest = history[history.length - 1] || null;
        const previous = history[history.length - 2] || null;
        const latestPrice = latest ? toNumber(latest.price) : 0;
        const previousPrice = previous ? toNumber(previous.price) : 0;
        const change = latest && previous ? latestPrice - previousPrice : null;
        const changeRate = change !== null && previousPrice > 0 ? (change / previousPrice) * 100 : null;

        return {
          id: item.id,
          code: item.code,
          name: item.name,
          unit: item.unit || latest?.unit || '',
          category: item.category || '',
          material_included: Boolean(item.material_included),
          latest_price: latestPrice,
          previous_price: previousPrice,
          change,
          change_rate: changeRate,
          sample_count: history.length,
          history,
        };
      });

    return NextResponse.json({ success: true, data: trends });
  } catch (e: unknown) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : '获取报价趋势失败' }, { status: 500 });
  }
}
