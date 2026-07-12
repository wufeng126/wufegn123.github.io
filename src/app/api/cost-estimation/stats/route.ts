import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET() {
  try {
    const supabase = getSupabaseClient();
    
    // 1. 获取标准工序清单
    const { data: standards } = await supabase.from('work_type_standards').select('*').order('sort_order');
    const standardMap = new Map<string, { name: string; unit: string; category: string }>();
    (standards || []).forEach((s: any) => standardMap.set(s.name, { name: s.name, unit: s.unit || '', category: s.category || '' }));

    // 2. 获取已录入单价
    const { data: pricesData } = await supabase.from('unit_prices').select('work_type,unit,price,project_id,year,contract_type,projects(name)').order('created_at', { ascending: false }).limit(500);
    const rows = pricesData || [];

    // 3. 按 work_type 分组统计
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

    // 4. 合并：以标准工序为基底，补充价格数据
    const merged = Array.from(standardMap.entries()).map(([name, s]) => {
      const g = groups[name];
      if (g && g.prices.length > 0) {
        const sorted = [...g.prices].sort((a, b) => a - b);
        const min = sorted[0], max = sorted[sorted.length - 1];
        const mid = sorted[Math.floor(sorted.length / 2)];
        const avg = sorted.reduce((s, p) => s + p, 0) / sorted.length;
        return {
          work_type: name, unit: s.unit || g.units[0] || '',
          min_price: min, max_price: max, median_price: mid, avg_price: Math.round(avg * 100) / 100,
          samples: g.samples, projects: g.projects.join(', '), years: g.years.sort().join('~'),
          category: s.category, from_standard: true, has_prices: true,
        };
      }
      return {
        work_type: name, unit: s.unit, category: s.category,
        min_price: 0, max_price: 0, median_price: 0, avg_price: 0,
        samples: 0, projects: '', years: '', from_standard: true, has_prices: false,
      };
    });

    // 5. 追加有价格但不在标准清单中的工序
    Object.entries(groups).forEach(([name, g]) => {
      if (!standardMap.has(name)) {
        const sorted = [...g.prices].sort((a, b) => a - b);
        const min = sorted[0], max = sorted[sorted.length - 1];
        const mid = sorted[Math.floor(sorted.length / 2)];
        const avg = sorted.reduce((s, p) => s + p, 0) / sorted.length;
        merged.push({
          work_type: name, unit: g.units[0] || '',
          min_price: min, max_price: max, median_price: mid, avg_price: Math.round(avg * 100) / 100,
          samples: g.samples, projects: g.projects.join(', '), years: g.years.sort().join('~'),
          category: '', from_standard: false, has_prices: true,
        });
      }
    });

    // 6. 排序：有价格 > 无价格，优先标准 > 非标准
    merged.sort((a, b) => {
      if (a.has_prices !== b.has_prices) return a.has_prices ? -1 : 1;
      if (a.from_standard !== b.from_standard) return a.from_standard ? -1 : 1;
      return 0;
    });

    return NextResponse.json({ success: true, data: merged });
  } catch (e: unknown) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : '统计失败' }, { status: 500 });
  }
}