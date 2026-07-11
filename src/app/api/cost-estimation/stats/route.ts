import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET() {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.from('unit_prices').select('work_type,unit,price,project_id,year,contract_type,projects(name)').order('created_at', { ascending: false }).limit(500);
    if (error) throw new Error(error.message);

    const rows = data || [];
    const groups: Record<string, { prices: number[]; samples: number; units: string[]; projects: string[]; years: number[] }> = {};
    rows.forEach((r: any) => {
      const key = r.work_type;
      if (!groups[key]) groups[key] = { prices: [], samples: 0, units: [], projects: [], years: [] };
      groups[key].prices.push(parseFloat(r.price));
      groups[key].samples++;
      if (r.unit && !groups[key].units.includes(r.unit)) groups[key].units.push(r.unit);
      if ((r.projects as any)?.name && !groups[key].projects.includes((r.projects as any).name)) groups[key].projects.push((r.projects as any).name);
      if (r.year && !groups[key].years.includes(r.year)) groups[key].years.push(r.year);
    });

    const stats = Object.entries(groups).map(([workType, g]) => {
      const sorted = g.prices.sort((a, b) => a - b);
      const min = sorted[0], max = sorted[sorted.length - 1];
      const mid = sorted[Math.floor(sorted.length / 2)];
      const avg = sorted.reduce((s, p) => s + p, 0) / sorted.length;
      return {
        work_type: workType,
        unit: [...g.units][0] || '',
        min_price: min, max_price: max, median_price: mid, avg_price: Math.round(avg * 100) / 100,
        samples: g.samples,
        projects: [...g.projects].join(', '),
        years: [...g.years].sort().join('~'),
      };
    }).sort((a, b) => b.samples - a.samples);

    return NextResponse.json({ success: true, data: stats });
  } catch (e: unknown) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : '统计失败' }, { status: 500 });
  }
}
