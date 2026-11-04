'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight, Loader2, Users } from 'lucide-react';

type TradeRow = { trade: string; gross: number; hours: number; ratio: number };
type ProjectRow = { projectId: number; projectName: string; total: number; months: number; trades: TradeRow[] };

function money(value: number) {
  if (Math.abs(value) >= 10000) {
    return `¥${(value / 10000).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}万`;
  }
  return `¥${value.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`;
}

export default function TradeCostPage() {
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [trades, setTrades] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);
  const [keyword, setKeyword] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/trade-cost', { credentials: 'include', cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || json.success === false) throw new Error(json.error || '加载失败');
      setProjects((json.data?.projects || []) as ProjectRow[]);
      setTrades((json.data?.trades || []) as string[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const visibleProjects = useMemo(
    () => (keyword.trim() ? projects.filter((row) => row.projectName.includes(keyword.trim())) : projects),
    [projects, keyword],
  );

  const grandTotal = useMemo(() => visibleProjects.reduce((sum, row) => sum + row.total, 0), [visibleProjects]);
  const totalsByTrade = useMemo(() => {
    const map = new Map<string, number>();
    visibleProjects.forEach((project) => {
      project.trades.forEach((trade) => {
        map.set(trade.trade, (map.get(trade.trade) || 0) + trade.gross);
      });
    });
    return map;
  }, [visibleProjects]);
  const topTrades = useMemo(() => trades.slice(0, 8), [trades]);

  return (
    <div className="min-h-screen bg-[var(--background)] px-4 py-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link href="/workers/labor-analysis" className="text-sm text-[var(--color-primary)] hover:underline">← 返回用工分析</Link>
            <h1 className="mt-2 flex items-center gap-2 text-xl font-bold text-[var(--foreground)]">
              <Users className="h-5 w-5 text-[var(--color-primary)]" /> 各工种累计费用
            </h1>
            <p className="mt-1 text-sm text-[var(--color-text-3)]">
              按项目汇总从进场以来各工种的应发工资（含管理人员单列），数据来自月度工资表。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="搜索项目"
              className="h-9 w-44 rounded-lg border border-[var(--border)] bg-white px-3 text-sm"
            />
            <div className="rounded-xl border border-[var(--border)] bg-white px-4 py-2 text-right">
              <p className="text-xs text-[var(--color-text-3)]">当前范围合计</p>
              <p className="text-lg font-bold tabular-nums">{money(grandTotal)}</p>
            </div>
          </div>
        </div>

        {error ? <div className="rounded-xl border border-[#FFCCC7] bg-[#FFF2F0] px-4 py-3 text-sm text-[#CB2634]">{error}</div> : null}

        {loading ? (
          <div className="rounded-xl border border-[var(--border)] bg-white py-16 text-center text-sm text-[var(--color-text-3)]">
            <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" /> 加载中…
          </div>
        ) : projects.length === 0 ? (
          <div className="rounded-xl border border-[var(--border)] bg-white py-16 text-center text-sm text-[var(--color-text-3)]">暂无工资数据</div>
        ) : (
          <>
            <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-white">
              <table className="w-full min-w-[1000px] text-sm">
                <thead className="bg-[var(--color-muted)] text-xs text-[var(--color-text-3)]">
                  <tr>
                    <th className="sticky left-0 z-10 w-56 bg-[var(--color-muted)] px-3 py-2 text-left font-medium">项目</th>
                    {topTrades.map((trade) => (
                      <th key={trade} className="px-3 py-2 text-right font-medium">{trade}</th>
                    ))}
                    <th className="px-3 py-2 text-right font-medium">合计</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleProjects.map((project) => {
                    const tradeMap = new Map(project.trades.map((row) => [row.trade, row]));
                    const isOpen = expanded === project.projectId;
                    return (
                      <Fragment key={project.projectId}>
                        <tr className="cursor-pointer border-t border-[var(--border)] hover:bg-[var(--color-muted)]/40" onClick={() => setExpanded(isOpen ? null : project.projectId)}>
                          <td className="sticky left-0 z-10 whitespace-nowrap bg-white px-3 py-2 font-medium">
                            <span className="flex items-center gap-1">
                              {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                              {project.projectName}
                              <span className="ml-1 text-xs font-normal text-[var(--color-text-3)]">{project.months} 个月</span>
                            </span>
                          </td>
                          {topTrades.map((trade) => (
                            <td key={trade} className="px-3 py-2 text-right tabular-nums">
                              {tradeMap.get(trade) ? money(tradeMap.get(trade)!.gross) : <span className="text-[var(--color-text-3)]">-</span>}
                            </td>
                          ))}
                          <td className="px-3 py-2 text-right font-semibold tabular-nums">{money(project.total)}</td>
                        </tr>
                        {isOpen ? (
                          <tr className="border-t border-[var(--border)] bg-[var(--color-muted)]/30">
                            <td colSpan={topTrades.length + 2} className="px-3 py-3">
                              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                {project.trades.map((trade) => (
                                  <div key={trade.trade} className="rounded-lg border border-[var(--border)] bg-white p-3">
                                    <div className="flex items-center justify-between text-sm">
                                      <span className="font-medium">{trade.trade}</span>
                                      <span className="text-xs text-[var(--color-text-3)]">{trade.ratio}%</span>
                                    </div>
                                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--color-muted)]">
                                      <div className="h-full bg-[var(--color-primary)]" style={{ width: `${trade.ratio}%` }} />
                                    </div>
                                    <div className="mt-2 flex justify-between text-xs text-[var(--color-text-2)]">
                                      <span>{trade.hours.toLocaleString('zh-CN')} 小时</span>
                                      <span className="font-medium">{money(trade.gross)}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                  <tr className="border-t border-[var(--border)] bg-[var(--color-muted)]/60 font-semibold">
                    <td className="px-3 py-2">合计</td>
                    {topTrades.map((trade) => (
                      <td key={trade} className="px-3 py-2 text-right tabular-nums">{money(totalsByTrade.get(trade) || 0)}</td>
                    ))}
                    <td className="px-3 py-2 text-right tabular-nums">{money(grandTotal)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <p className="text-xs text-[var(--color-text-3)]">
              说明：金额为「应发工资」累计（工时×工价 + 包活工资），含管理人员工资（单列）；点项目行可展开查看该项目的工种明细与占比。
            </p>
          </>
        )}
      </div>
    </div>
  );
}
