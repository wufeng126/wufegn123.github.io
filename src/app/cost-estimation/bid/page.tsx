'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  FileSpreadsheet,
  Minus,
  Plus,
  TrendingUp,
} from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { cn } from '@/lib/utils';

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

interface TrendHistory {
  id: number;
  project_name?: string;
  project_type?: string;
  unit?: string;
  price: number;
  bid_year?: number | null;
  material_included?: boolean;
  created_at?: string;
}

interface TrendItem {
  id: number;
  code: string;
  name: string;
  unit?: string;
  category?: string;
  material_included?: boolean;
  latest_price: number;
  previous_price: number;
  change: number | null;
  change_rate: number | null;
  sample_count: number;
  history: TrendHistory[];
}

function money(value: string | number | undefined) {
  return Number(value || 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 });
}

function price(value: number | null | undefined) {
  if (!value) return '-';
  return Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 2 });
}

function percent(value: number | null | undefined) {
  if (value === null || value === undefined) return '-';
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;
}

function trendTone(change: number | null) {
  if (change === null || change === 0) return 'flat';
  return change > 0 ? 'up' : 'down';
}

export default function BidEstimationPage() {
  const [bids, setBids] = useState<Bid[]>([]);
  const [trends, setTrends] = useState<TrendItem[]>([]);
  const [selectedTrendId, setSelectedTrendId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const [bidRes, trendRes] = await Promise.all([
        fetch('/api/bid-estimations'),
        fetch('/api/bid-estimations/trends'),
      ]);
      const bidJson = await bidRes.json();
      const trendJson = await trendRes.json();
      if (bidJson.success) setBids(bidJson.data || []);
      if (trendJson.success) {
        const rows = trendJson.data || [];
        setTrends(rows);
        setSelectedTrendId(rows.find((item: TrendItem) => item.sample_count > 0)?.id || rows[0]?.id || null);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const bidStats = useMemo(() => {
    const total = bids.reduce((sum, bid) => sum + Number(bid.total_amount || 0), 0);
    const active = bids.filter(bid => (bid.status || '') !== '已中标' && (bid.status || '') !== '未中标').length;
    const versions = bids.reduce((sum, bid) => sum + Number(bid.version_count || 0), 0);
    return { total, active, versions };
  }, [bids]);

  const trendStats = useMemo(() => {
    const withPrice = trends.filter(item => item.sample_count > 0).length;
    const up = trends.filter(item => (item.change || 0) > 0).length;
    const down = trends.filter(item => (item.change || 0) < 0).length;
    return { withPrice, up, down };
  }, [trends]);

  const selectedTrend = trends.find(item => item.id === selectedTrendId) || trends[0];
  const chartData = (selectedTrend?.history || []).map((item, index) => ({
    label: item.bid_year ? `${item.bid_year}` : `记录${index + 1}`,
    price: Number(item.price || 0),
    project: item.project_name || '-',
    unit: item.unit || selectedTrend?.unit || '',
  }));

  return (
    <div className="min-h-full bg-[#F5F6FA] p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-[#1D2129]">投标测算</h1>
            <p className="mt-1 text-sm text-[#86909C]">先看历史中标价趋势，再结合内部成本形成新项目报价。</p>
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
          <StatCard title="常用清单项" value={`${trends.length}`} unit="项" />
          <StatCard title="已有报价趋势" value={`${trendStats.withPrice}`} unit="项" />
          <StatCard title="最近上涨" value={`${trendStats.up}`} unit="项" tone="up" />
          <StatCard title="最近下降" value={`${trendStats.down}`} unit="项" tone="down" />
        </div>

        <section className="rounded-xl border border-[#E5E6EB] bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E5E6EB] px-4 py-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-[#165DFF]" />
              <span className="font-medium text-[#1D2129]">常用清单项报价趋势</span>
            </div>
            <span className="text-xs text-[#86909C]">按最近一次中标单价对比上一次中标单价</span>
          </div>

          {loading ? (
            <div className="py-16 text-center text-sm text-[#86909C]">正在读取历史中标价...</div>
          ) : trends.length === 0 ? (
            <EmptyState text="暂无标准清单，请先进入资料库维护常用清单项。" />
          ) : (
            <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_440px]">
              <div className="grid content-start gap-3 border-b border-[#E5E6EB] p-4 sm:grid-cols-2 lg:border-b-0 lg:border-r">
                {trends.map(item => (
                  <TrendCard
                    key={item.id}
                    item={item}
                    selected={item.id === selectedTrend?.id}
                    onClick={() => setSelectedTrendId(item.id)}
                  />
                ))}
              </div>

              <TrendDetail item={selectedTrend} chartData={chartData} />
            </div>
          )}
        </section>

        <section className="overflow-hidden rounded-xl border border-[#E5E6EB] bg-white">
          <div className="flex items-center justify-between border-b border-[#E5E6EB] px-4 py-3">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-[#165DFF]" />
              <span className="font-medium text-[#1D2129]">测算项目台账</span>
            </div>
            <div className="hidden gap-4 text-xs text-[#86909C] md:flex">
              <span>测算项目 {bids.length} 个</span>
              <span>测算中 {bidStats.active} 个</span>
              <span>累计测算额 {money(bidStats.total)} 元</span>
              <span>保存版本 {bidStats.versions} 个</span>
            </div>
          </div>

          {loading ? (
            <div className="py-16 text-center text-sm text-[#86909C]">正在读取测算项目...</div>
          ) : bids.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <FileSpreadsheet className="mx-auto mb-4 h-12 w-12 text-[#C9CDD4]" />
              <p className="mb-2 text-base font-medium text-[#1D2129]">暂无投标测算项目</p>
              <p className="mb-5 text-sm text-[#86909C]">先维护资料库，再上传甲方清单生成第一版测算。</p>
              <Link href="/cost-estimation/bid/new" className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#165DFF] px-5 text-sm text-white">新建测算</Link>
            </div>
          ) : (
            <>
            <div className="hidden overflow-x-auto md:block">
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
            <div className="space-y-3 p-3 md:hidden">
              {bids.map(bid => (
                <Link
                  key={bid.id}
                  href={`/cost-estimation/bid/${bid.id}`}
                  className="block rounded-lg border border-[#E5E6EB] bg-white p-3 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[#165DFF]">{bid.name}</p>
                      <p className="mt-1 text-xs text-[#86909C]">{bid.region || '-'} / {bid.project_type || '-'} / {bid.created_at?.slice(0, 10) || '-'}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-[#E8F3FF] px-2 py-1 text-xs text-[#165DFF]">{bid.status || '测算中'}</span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-md bg-[#F7F8FA] p-2">
                      <div className="text-[#86909C]">内部成本</div>
                      <div className="mt-1 font-semibold text-[#1D2129]">{money(bid.total_labor_cost)} 元</div>
                    </div>
                    <div className="rounded-md bg-[#F7F8FA] p-2">
                      <div className="text-[#86909C]">管理费</div>
                      <div className="mt-1 font-semibold text-[#1D2129]">{money(bid.management_fee)} 元</div>
                    </div>
                    <div className="rounded-md bg-[#E8F3FF] p-2">
                      <div className="text-[#165DFF]">测算总价</div>
                      <div className="mt-1 font-semibold text-[#165DFF]">{money(bid.total_amount)} 元</div>
                    </div>
                    <div className="rounded-md bg-[#F7F8FA] p-2">
                      <div className="text-[#86909C]">保存版本</div>
                      <div className="mt-1 font-semibold text-[#1D2129]">{bid.version_count || 0} 个</div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function StatCard({ title, value, unit, tone }: { title: string; value: string; unit: string; tone?: 'up' | 'down' }) {
  return (
    <div className="rounded-xl border border-[#E5E6EB] bg-white p-4">
      <p className="text-xs text-[#86909C]">{title}</p>
      <div className="mt-2 flex items-end gap-1">
        <span className={cn('text-2xl font-bold text-[#1D2129]', tone === 'up' && 'text-[#D92D20]', tone === 'down' && 'text-[#079455]')}>{value}</span>
        <span className="pb-1 text-xs text-[#86909C]">{unit}</span>
      </div>
    </div>
  );
}

function TrendCard({ item, selected, onClick }: { item: TrendItem; selected: boolean; onClick: () => void }) {
  const tone = trendTone(item.change);
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'min-h-[132px] rounded-lg border bg-white p-4 text-left transition hover:border-[#165DFF]/40 hover:shadow-sm',
        selected ? 'border-[#165DFF] shadow-sm ring-2 ring-[#E8F3FF]' : 'border-[#E5E6EB]',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="rounded bg-[#F2F3F5] px-1.5 py-0.5 text-[11px] font-medium text-[#4E5969]">{item.code}</span>
            <span className="truncate text-xs text-[#86909C]">{item.category || '未分类'}</span>
          </div>
          <h3 className="mt-2 truncate text-sm font-semibold text-[#1D2129]">{item.name}</h3>
          <p className="mt-1 text-xs text-[#86909C]">{item.unit || '-'} · {item.material_included ? '默认含材料' : '默认不含材料'}</p>
        </div>
        <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-[#C9CDD4]" />
      </div>

      <div className="mt-4 flex items-end justify-between gap-3">
        <div>
          <p className="text-xs text-[#86909C]">最近中标单价</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-[#1D2129]">
            {price(item.latest_price)}
            {item.latest_price ? <span className="ml-1 text-xs font-normal text-[#86909C]">元/{item.unit || '单位'}</span> : null}
          </p>
        </div>
        <TrendBadge tone={tone} change={item.change} changeRate={item.change_rate} />
      </div>
      <p className="mt-3 text-xs text-[#86909C]">历史报价 {item.sample_count} 次</p>
    </button>
  );
}

function TrendBadge({ tone, change, changeRate }: { tone: 'up' | 'down' | 'flat'; change: number | null; changeRate: number | null }) {
  const Icon = tone === 'up' ? ArrowUpRight : tone === 'down' ? ArrowDownRight : Minus;
  return (
    <div className={cn(
      'flex h-9 items-center gap-1 rounded-full px-2.5 text-xs font-medium',
      tone === 'up' && 'bg-[#FFF1F0] text-[#D92D20]',
      tone === 'down' && 'bg-[#ECFDF3] text-[#079455]',
      tone === 'flat' && 'bg-[#F2F3F5] text-[#86909C]',
    )}>
      <Icon className="h-3.5 w-3.5" />
      <span>{change === null ? '暂无对比' : `${change > 0 ? '+' : ''}${price(change)} / ${percent(changeRate)}`}</span>
    </div>
  );
}

function TrendDetail({ item, chartData }: { item?: TrendItem; chartData: Array<{ label: string; price: number; project: string; unit: string }> }) {
  if (!item) return <div className="p-4"><EmptyState text="暂无报价趋势。" /></div>;

  return (
    <aside className="p-4">
      <div className="mb-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-[#86909C]">趋势详情</p>
            <h2 className="mt-1 text-lg font-semibold text-[#1D2129]">{item.name}</h2>
          </div>
          <span className="rounded-full bg-[#F2F3F5] px-2.5 py-1 text-xs text-[#4E5969]">{item.sample_count} 次报价</span>
        </div>
      </div>

      <div className="h-[260px] rounded-lg border border-[#E5E6EB] p-3">
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#EEF0F4" strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#86909C' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#86909C' }} axisLine={false} tickLine={false} width={44} />
              <Tooltip
                formatter={(value) => [`${price(Number(value))} 元/${chartData[0]?.unit || item.unit || ''}`, '中标单价']}
                labelFormatter={(_, payload) => payload?.[0]?.payload?.project || '-'}
                contentStyle={{ borderRadius: 8, borderColor: '#E5E6EB', fontSize: 12 }}
              />
              <Line type="monotone" dataKey="price" stroke="#165DFF" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState text="该清单项暂无历史中标价。" compact />
        )}
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-[#E5E6EB]">
        <table className="w-full text-sm">
          <thead className="bg-[#F7F8FA] text-xs text-[#86909C]">
            <tr>
              <th className="px-3 py-3 text-left font-medium">项目名称</th>
              <th className="px-3 py-3 text-center font-medium">年份</th>
              <th className="px-3 py-3 text-left font-medium">类型</th>
              <th className="px-3 py-3 text-left font-medium">材料</th>
              <th className="px-3 py-3 text-right font-medium">单价</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E5E6EB]">
            {[...item.history].reverse().map(row => (
              <tr key={row.id}>
                <td className="px-3 py-3 text-[#1D2129]">{row.project_name || '-'}</td>
                <td className="px-3 py-3 text-center text-[#4E5969]">{row.bid_year || '-'}</td>
                <td className="px-3 py-3 text-[#4E5969]">{row.project_type || '-'}</td>
                <td className="px-3 py-3 text-[#4E5969]">{row.material_included ? '含材料' : '不含材料'}</td>
                <td className="px-3 py-3 text-right font-medium tabular-nums text-[#1D2129]">{price(row.price)} 元/{row.unit || item.unit || '-'}</td>
              </tr>
            ))}
            {item.history.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-10 text-center text-[#86909C]">暂无历史项目明细</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </aside>
  );
}

function EmptyState({ text, compact = false }: { text: string; compact?: boolean }) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center text-sm text-[#86909C]', compact ? 'h-full' : 'py-14')}>
      <TrendingUp className="mb-3 h-9 w-9 text-[#C9CDD4]" />
      <p>{text}</p>
    </div>
  );
}
