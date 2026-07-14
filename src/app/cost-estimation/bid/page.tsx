'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { BookOpen, FileSpreadsheet, Plus, TrendingUp } from 'lucide-react';

interface Bid {
  id: number;
  name: string;
  project_type?: string;
  region?: string;
  duration_months?: number;
  profit_rate?: number;
  management_fee_rate?: number;
  management_fee?: string | number;
  total_labor_cost?: string | number;
  total_amount?: string | number;
  status?: string;
  version_count?: number;
  created_at?: string;
}

function money(value: string | number | undefined) {
  return Number(value || 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 });
}

export default function BidEstimationPage() {
  const [bids, setBids] = useState<Bid[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const res = await fetch('/api/bid-estimations');
      const json = await res.json();
      if (json.success) setBids(json.data || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const stats = useMemo(() => {
    const total = bids.reduce((sum, bid) => sum + Number(bid.total_amount || 0), 0);
    const active = bids.filter(bid => (bid.status || '') !== '已中标' && (bid.status || '') !== '未中标').length;
    const versions = bids.reduce((sum, bid) => sum + Number(bid.version_count || 0), 0);
    return { total, active, versions };
  }, [bids]);

  return (
    <div className="min-h-full bg-[#F5F6FA] p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-[#1D2129]">投标测算</h1>
            <p className="mt-1 text-sm text-[#86909C]">历史单价、内部成本、管理费和利润率统一形成正式测算表。</p>
          </div>
          <div className="flex gap-2">
            <Link href="/cost-estimation/bid/library" className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#D9DCE3] bg-white px-4 text-sm text-[#1D2129] hover:bg-[#F7F8FA]">
              <BookOpen className="h-4 w-4" />资料库
            </Link>
            <Link href="/cost-estimation/bid/new" className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#165DFF] px-4 text-sm text-white shadow-sm hover:bg-[#0E49D8]">
              <Plus className="h-4 w-4" />新建测算
            </Link>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <StatCard title="测算项目" value={`${bids.length}`} unit="个" />
          <StatCard title="测算中" value={`${stats.active}`} unit="个" />
          <StatCard title="累计测算额" value={money(stats.total)} unit="元" />
          <StatCard title="保存版本" value={`${stats.versions}`} unit="个" />
        </div>

        <section className="overflow-hidden rounded-xl border border-[#E5E6EB] bg-white">
          <div className="flex items-center justify-between border-b border-[#E5E6EB] px-4 py-3">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-[#165DFF]" />
              <span className="font-medium text-[#1D2129]">测算项目台账</span>
            </div>
            <span className="text-xs text-[#86909C]">按最近创建时间排序</span>
          </div>

          {loading ? (
            <div className="py-16 text-center text-sm text-[#86909C]">正在读取测算项目...</div>
          ) : bids.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <TrendingUp className="mx-auto mb-4 h-12 w-12 text-[#C9CDD4]" />
              <p className="mb-2 text-base font-medium text-[#1D2129]">暂无投标测算项目</p>
              <p className="mb-5 text-sm text-[#86909C]">先维护资料库，再上传甲方清单生成第一版测算。</p>
              <Link href="/cost-estimation/bid/new" className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#165DFF] px-5 text-sm text-white">新建测算</Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="bg-[#F7F8FA] text-xs text-[#86909C]">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">项目名称</th>
                    <th className="px-4 py-3 text-left font-medium">地区 / 类型</th>
                    <th className="px-4 py-3 text-right font-medium">内部成本</th>
                    <th className="px-4 py-3 text-right font-medium">管理费</th>
                    <th className="px-4 py-3 text-right font-medium">测算总价</th>
                    <th className="px-4 py-3 text-center font-medium">版本</th>
                    <th className="px-4 py-3 text-left font-medium">状态</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E6EB]">
                  {bids.map(bid => (
                    <tr key={bid.id} className="hover:bg-[#F7F8FA]">
                      <td className="px-4 py-3">
                        <Link href={`/cost-estimation/bid/${bid.id}`} className="font-medium text-[#165DFF] hover:underline">{bid.name}</Link>
                        <div className="mt-1 text-xs text-[#86909C]">{bid.created_at?.slice(0, 10) || '-'}</div>
                      </td>
                      <td className="px-4 py-3 text-[#4E5969]">{bid.region || '-'} / {bid.project_type || '-'}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{money(bid.total_labor_cost)} 元</td>
                      <td className="px-4 py-3 text-right tabular-nums">{money(bid.management_fee)} 元</td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums text-[#1D2129]">{money(bid.total_amount)} 元</td>
                      <td className="px-4 py-3 text-center">{bid.version_count || 0}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-[#E8F3FF] px-2 py-1 text-xs text-[#165DFF]">{bid.status || '测算中'}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function StatCard({ title, value, unit }: { title: string; value: string; unit: string }) {
  return (
    <div className="rounded-xl border border-[#E5E6EB] bg-white p-4">
      <p className="text-xs text-[#86909C]">{title}</p>
      <div className="mt-2 flex items-end gap-1">
        <span className="text-2xl font-bold text-[#1D2129]">{value}</span>
        <span className="pb-1 text-xs text-[#86909C]">{unit}</span>
      </div>
    </div>
  );
}
