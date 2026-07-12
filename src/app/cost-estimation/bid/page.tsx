'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, TrendingUp } from 'lucide-react';

interface Bid { id: number; name: string; project_type: string; duration_months: number; profit_rate: number; management_fee: string; total_labor_cost: string; total_amount: string; status: string; created_at: string; }

const STATUS: Record<string, { label: string; color: string }> = {
  '草稿': { label: '草稿', color: '#86909C' },
  '测算中': { label: '测算中', color: '#165DFF' },
  '已提交': { label: '已提交', color: '#F59E0B' },
  '已中标': { label: '已中标', color: '#00A870' },
  '未中标': { label: '未中标', color: '#F53F3F' },
};

export default function BidEstimationPage() {
  const [bids, setBids] = useState<Bid[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const res = await fetch('/api/bid-estimations');
      const json = await res.json();
      if (json.success) setBids(json.data);
    } catch {} finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="min-h-full bg-[#F5F6FA] p-4 md:p-6">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-2xl font-bold text-[#1D2129]">📊 投标测算</h1>
            <p className="text-sm text-[#86909C] mt-0.5">引用工序单价 → 管理费用 → 利润 → 报价</p>
          </div>
          <Link href="/cost-estimation/bid/new" className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#165DFF] px-4 text-sm text-white shadow-md hover:bg-[#0E49D8]">
            <Plus className="h-4 w-4" />新建投标
          </Link>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-sm text-[#86909C]">加载中...</div>
        ) : bids.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-[#E5E6EB] p-14 text-center">
            <TrendingUp className="h-12 w-12 text-[#C9CDD4] mx-auto mb-4" />
            <p className="text-base font-medium text-[#1D2129] mb-2">暂无投标项目</p>
            <p className="text-sm text-[#86909C] mb-5">点击"新建投标"开始引用工序单价库进行报价</p>
            <Link href="/cost-estimation/bid/new" className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#165DFF] px-5 text-sm text-white">新建投标</Link>
          </div>
        ) : (
          <div className="grid gap-3">
            {bids.map(b => {
              const st = STATUS[b.status] || STATUS['草稿'];
              return (
                <Link key={b.id} href={`/cost-estimation/bid/${b.id}`} className="bg-white rounded-xl border border-[#E5E6EB] p-5 hover:border-[#165DFF]/30 transition block">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-[#1D2129]">{b.name}</h3>
                        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: st.color + '18', color: st.color }}>{st.label}</span>
                      </div>
                      <p className="text-xs text-[#86909C] mt-1.5">
                        {b.project_type || '未分类'}
                        {b.duration_months ? ` · ${b.duration_months}个月工期` : ''}
                        · {b.created_at?.slice(0, 10)}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-lg font-bold text-[#1D2129]">{parseFloat(b.total_amount || '0').toLocaleString()} 元</p>
                      <p className="text-xs text-[#86909C]">利润: {b.profit_rate}%</p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
