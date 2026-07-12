import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET() {
  try {
    const supabase = getSupabaseClient();
    const { data } = await supabase.from('unit_prices').select('work_type, unit').limit(500);
    const unique = new Map<string, string>();
    (data || []).forEach((r: Record<string, string>) => { if (r.work_type && !unique.has(r.work_type)) unique.set(r.work_type, r.unit || ''); });
    const list = Array.from(unique.entries()).map(([name, unit]) => ({ name, unit }));
    return NextResponse.json({ success: true, data: list });
  } catch (e: unknown) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : '获取失败' }, { status: 500 });
  }
}
