'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ChevronDown, Search, Trash2, TrendingUp, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { useConfirm } from '@/hooks/use-confirm';

type PriceRow = {
  id: number;
  standard_item_id: number;
  project_name?: string | null;
  region?: string | null;
  project_type?: string | null;
  item_original_name?: string | null;
  unit?: string | null;
  price?: string | number | null;
  bid_year?: number | null;
  material_included?: boolean | null;
  remark?: string | null;
  created_at?: string | null;
  bid_standard_items?: { code?: string | null; name?: string | null } | null;
};

type StandardItem = {
  id: number;
  code?: string | null;
  name?: string | null;
  unit?: string | null;
};

type Group = {
  key: number;
  name: string;
  code: string;
  unit: string;
  rows: PriceRow[];
  latest: PriceRow;
  min: number;
  max: number;
  median: number;
  years: number[];
};

function money(value: number | string | null | undefined): string {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return '-';
  return `¥${num.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function qty(value: number | string | null | undefined): string {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return '-';
  return num.toLocaleString('zh-CN', { maximumFractionDigits: 3 });
}

export default function BidHistoryPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [standards, setStandards] = useState<StandardItem[]>([]);
  const [prices, setPrices] = useState<PriceRow[]>([]);
  const [keyword, setKeyword] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);
  const confirm = useConfirm();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/bid-estimations/library', { credentials: 'include' });
        const json = await res.json();
        if (!res.ok || json.success === false) throw new Error(json.error || '加载失败');
        if (cancelled) return;
        setStandards(Array.isArray(json.data?.standards) ? json.data.standards : []);
        setPrices(Array.isArray(json.data?.bidPrices) ? json.data.bidPrices : []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : '加载失败');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function handleDeletePrice(row: PriceRow) {
    const ok = await confirm({
      title: '删除这条历史价？',
      description: [row.project_name || '未填项目', row.bid_year || '未填年份', money(row.price)].join(' · '),
      variant: 'destructive',
    });
    if (!ok) return;
    try {
      const res = await fetch('/api/bid-estimations/library', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ type: 'bidPrice', id: row.id }),
      });
      const json = await res.json();
      if (!res.ok || json.success === false) throw new Error(json.error || '删除失败');
      setPrices((prev) => prev.filter((item) => item.id !== row.id));
      toast.success('已删除');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '删除失败');
    }
  }
  const groups = useMemo<Group[]>(() => {
    const byStandard = new Map<number, PriceRow[]>();
    prices.forEach((row) => {
      const id = Number(row.standard_item_id);
      if (!id) return;
      const list = byStandard.get(id) || [];
      list.push(row);
      byStandard.set(id, list);
    });

    const standardById = new Map<number, StandardItem>();
    standards.forEach((item) => standardById.set(Number(item.id), item));

    const result: Group[] = [];
    byStandard.forEach((rows, id) => {
      const sorted = [...rows].sort((a, b) => {
        const yearDiff = Number(b.bid_year || 0) - Number(a.bid_year || 0);
        if (yearDiff !== 0) return yearDiff;
        return String(b.created_at || '').localeCompare(String(a.created_at || ''));
      });
      const values = sorted.map((row) => Number(row.price || 0)).filter((num) => num > 0);
      if (values.length === 0) return;
      const ascending = [...values].sort((a, b) => a - b);
      const mid = Math.floor(ascending.length / 2);
      const standard = standardById.get(id);
      result.push({
        key: id,
        name: String(standard?.name || sorted[0]?.bid_standard_items?.name || sorted[0]?.item_original_name || '未命名清单项'),
        code: String(standard?.code || sorted[0]?.bid_standard_items?.code || ''),
        unit: String(standard?.unit || sorted[0]?.unit || ''),
        rows: sorted,
        latest: sorted[0],
        min: ascending[0],
        max: ascending[ascending.length - 1],
        median: ascending.length % 2 === 0 ? (ascending[mid - 1] + ascending[mid]) / 2 : ascending[mid],
        years: Array.from(new Set(sorted.map((row) => Number(row.bid_year || 0)).filter(Boolean))).sort((a, b) => b - a),
      });
    });

    const kw = keyword.trim().toLowerCase();
    return result
      .filter((group) => !kw || group.name.toLowerCase().includes(kw) || group.code.toLowerCase().includes(kw) || group.rows.some((row) => String(row.project_name || '').toLowerCase().includes(kw)))
      .sort((a, b) => b.rows.length - a.rows.length || a.name.localeCompare(b.name));
  }, [prices, standards, keyword]);

  const stats = useMemo(() => {
    const itemCount = groups.length;
    const recordCount = groups.reduce((sum, group) => sum + group.rows.length, 0);
    const projectCount = new Set(prices.map((row) => String(row.project_name || '').trim()).filter(Boolean)).size;
    return { itemCount, recordCount, projectCount };
  }, [groups, prices]);

  return (
    <div className="min-h-screen bg-[var(--background)] px-4 py-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link href="/cost-estimation/bid" className="inline-flex items-center gap-1 text-sm text-[var(--color-primary)] hover:underline">
              <ArrowLeft className="h-4 w-4" /> 返回投标测算
            </Link>
            <h1 className="mt-2 text-xl font-bold text-[var(--foreground)]">历史中标价查询</h1>
            <p className="mt-1 text-sm text-[var(--color-text-3)]">
              同一个清单项，过去中标过的价格都在这里：最低、中位、最高，以及每次的项目和年份。
            </p>
          </div>
          <Link
            href="/cost-estimation/bid/import"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3 text-sm font-medium text-white"
          >
            <Upload className="h-4 w-4" /> 导入历史中标价
          </Link>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-[var(--border)] bg-white p-4">
            <p className="text-xs text-[var(--color-text-3)]">有历史价的清单项</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-[var(--color-primary)]">{stats.itemCount}</p>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-white p-4">
            <p className="text-xs text-[var(--color-text-3)]">历史价格记录</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{stats.recordCount}</p>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-white p-4">
            <p className="text-xs text-[var(--color-text-3)]">覆盖项目数</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{stats.projectCount}</p>
          </div>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-white p-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-3)]" />
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="搜索清单项名称、编码或项目名称"
              className="h-9 w-full rounded-lg border border-[var(--border)] pl-9 pr-3 text-sm outline-none focus:border-[var(--color-primary)]"
            />
          </div>
        </div>

        {loading ? (
          <div className="rounded-xl border border-[var(--border)] bg-white py-16 text-center text-sm text-[var(--color-text-3)]">正在读取历史中标价...</div>
        ) : error ? (
          <div className="rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/5 px-4 py-6 text-center text-sm text-[var(--color-danger)]">{error}</div>
        ) : groups.length === 0 ? (
          <div className="rounded-xl border border-[var(--border)] bg-white px-4 py-16 text-center">
            <p className="text-sm text-[var(--color-text-3)]">还没有历史中标价</p>
            <Link href="/cost-estimation/bid/import" className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-4 text-sm font-medium text-white">
              <Upload className="h-4 w-4" /> 导入历史中标价
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {groups.map((group) => {
              const isOpen = expanded === group.key;
              return (
                <div key={group.key} className="overflow-hidden rounded-xl border border-[var(--border)] bg-white">
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : group.key)}
                    className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left hover:bg-[var(--color-muted)]/40"
                  >
                    <div className="min-w-[240px] flex-1">
                      <div className="font-medium text-[var(--foreground)]">{group.name}</div>
                      <div className="mt-0.5 text-xs text-[var(--color-text-3)]">
                        {group.code ? `${group.code} · ` : ''}{group.unit || '单位未填'} · 共 {group.rows.length} 次
                        {group.years.length > 0 ? ` · ${group.years.join('/')}` : ''}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-[var(--color-text-3)]">最近一次</div>
                      <div className="text-base font-semibold tabular-nums text-[var(--color-primary)]">{money(group.latest.price)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-[var(--color-text-3)]">历史区间</div>
                      <div className="text-sm tabular-nums text-[var(--foreground)]">{qty(group.min)} ~ {qty(group.max)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-[var(--color-text-3)]">中位价</div>
                      <div className="text-sm font-medium tabular-nums text-[#FF7D00]">{qty(group.median)}</div>
                    </div>
                    <ChevronDown className={`h-4 w-4 shrink-0 text-[var(--color-text-3)] transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {isOpen ? (
                    <div className="overflow-x-auto border-t border-[var(--border)]">
                      <table className="w-full min-w-[640px] text-sm">
                        <thead className="bg-[var(--color-muted)] text-xs text-[var(--color-text-3)]">
                          <tr>
                            <th className="px-4 py-2 text-left">年份</th>
                            <th className="px-4 py-2 text-left">项目</th>
                            <th className="px-4 py-2 text-left">地区 / 类型</th>
                            <th className="px-4 py-2 text-right">中标单价</th>
                            <th className="px-4 py-2 text-left">含材料</th>
                            <th className="px-4 py-2 text-left">备注</th>`n                            <th className="px-4 py-2 text-right">操作</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border)]">
                          {group.rows.map((row) => (
                            <tr key={row.id}>
                              <td className="px-4 py-2 text-[var(--color-text-3)]">{row.bid_year || '-'}</td>
                              <td className="px-4 py-2">{row.project_name || '-'}</td>
                              <td className="px-4 py-2 text-[var(--color-text-3)]">
                                {[row.region, row.project_type].filter(Boolean).join(' / ') || '-'}
                              </td>
                              <td className="px-4 py-2 text-right font-medium tabular-nums">{money(row.price)}</td>
                              <td className="px-4 py-2 text-[var(--color-text-3)]">{row.material_included ? '含' : '否'}</td>
                              <td className="px-4 py-2 text-[var(--color-text-3)]">{row.remark || '-'}</td>
                              <td className="px-4 py-2 text-right">
                                <button
                                  type="button"
                                  onClick={() => handleDeletePrice(row)}
                                  className="rounded p-1 text-[var(--color-text-3)] transition hover:bg-red-50 hover:text-[var(--color-danger)]"
                                  aria-label="删除这条历史价"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div className="flex items-center gap-1.5 px-4 py-2 text-xs text-[var(--color-text-3)]">
                        <TrendingUp className="h-3.5 w-3.5" />
                        最近一次 {money(group.latest.price)}，历史中位 {qty(group.median)}，最低 {qty(group.min)}，最高 {qty(group.max)}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
