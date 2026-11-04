'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight, Loader2, Users } from 'lucide-react';

type TradeRow = { trade: string; gross: number; hours: number; ratio: number };
type ProjectRow = { projectId: number; projectName: string; total: number; months: number; trades: TradeRow[] };

/** 表格内金额：统一用“万”，不带 ¥，减少列宽 */
function money(value: number) {
  if (Math.abs(value) >= 10000) {
    return `${(value / 10000).toLocaleString('zh-CN', { maximumFractionDigits: 1 })}万`;
  }
  return value.toLocaleString('zh-CN', { maximumFractionDigits: 0 });
}

const MAX_TRADE_COLUMNS = 6;

export default function TradeCostPage() {
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [trades, setTrades] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);
  const [keyword, setKeyword] = useState('');
  const [sortKey, setSortKey] = useState<string>('total');

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

  const topTrades = useMemo(() => trades.slice(0, MAX_TRADE_COLUMNS), [trades]);
  const hasOther = trades.length > MAX_TRADE_COLUMNS;

  const visibleProjects = useMemo(() => {
    const list = keyword.trim() ? projects.filter((row) => row.projectName.includes(keyword.trim())) : projects;
    return [...list].sort((a, b) => {
      if (sortKey === 'total') return b.total - a.total;
      const grossOf = (row: ProjectRow) => row.trades.find((trade) => trade.trade === sortKey)?.gross || 0;
      return grossOf(b) - grossOf(a);
    });
  }, [projects, keyword, sortKey]);

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

  const otherTotal = useMemo(() => {
    return visibleProjects.reduce((sum, project) => {
      const other = project.trades
        .filter((trade) => !topTrades.includes(trade.trade))
        .reduce((acc, trade) => acc + trade.gross, 0);
      return sum + other;
    }, 0);
  }, [visibleProjects, topTrades]);

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
              按项目汇总进场以来各工种的应发工资（含管理人员单列），点项目行展开全部工种明细。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="搜索项目"
              className="h-9 w-40 rounded-lg border border-[var(--border)] bg-white px-3 text-sm"
            />
            <select
              value={sortKey}
              onChange={(event) => setSortKey(event.target.value)}
              className="h-9 rounded-lg border border-[var(--border)] bg-white px-2 text-sm"
            >
              <option value="total">按合计排序</option>
              {topTrades.map((trade) => (
                <option key={trade} value={trade}>按{trade}排序</option>
              ))}
            </select>
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
        ) : visibleProjects.length === 0 ? (
          <div className="rounded-xl border border-[var(--border)] bg-white py-16 text-center text-sm text-[var(--color-text-3)]">暂无工资数据</div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-white">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-[var(--color-muted)] text-xs text-[var(--color-text-3)]">
                <tr>
                  <th className="sticky left-0 z-20 w-60 bg-[var(--color-muted)] px-3 py-2.5 text-left font-medium">项目</th>
                  <th className="px-3 py-2.5 text-right font-medium text-[var(--foreground)]">合计</th>
                  {topTrades.map((trade) => (
                    <th key={trade} className="px-3 py-2.5 text-right font-medium">{trade}</th>
                  ))}
                  {hasOther ? <th className="px-3 py-2.5 text-right font-medium">其他 {trades.length - MAX_TRADE_COLUMNS} 类</th> : null}
                </tr>
              </thead>
              <tbody>
                {visibleProjects.map((project) => {
                  const tradeMap = new Map(project.trades.map((row) => [row.trade, row]));
                  const isOpen = expanded === project.projectId;
                  const otherGross = project.trades
                    .filter((trade) => !topTrades.includes(trade.trade))
                    .reduce((sum, trade) => sum + trade.gross, 0);
                  return (
                    <Fragment key={project.projectId}>
                      <tr
                        className={`cursor-pointer border-t border-[var(--border)] transition ${isOpen ? 'bg-[#E8F3FF]' : 'hover:bg-[var(--color-muted)]/50'}`}
                        onClick={() => setExpanded(isOpen ? null : project.projectId)}
                      >
                        <td className="sticky left-0 z-10 max-w-[240px] truncate bg-white px-3 py-2.5 font-medium">
                          <span className="flex items-center gap-1">
                            {isOpen ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
                            <span className="truncate">{project.projectName}</span>
                            <span className="shrink-0 text-xs font-normal text-[var(--color-text-3)]">{project.months} 个月</span>
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-[var(--color-primary)]">{money(project.total)}</td>
                        {topTrades.map((trade) => {
                          const value = tradeMap.get(trade);
                          return (
                            <td key={trade} className="px-3 py-2.5 text-right tabular-nums">
                              {value ? money(value.gross) : <span className="text-[var(--color-text-3)]/60">-</span>}
                            </td>
                          );
                        })}
                        {hasOther ? (
                          <td className="px-3 py-2.5 text-right tabular-nums text-[var(--color-text-2)]">
                            {otherGross > 0 ? money(otherGross) : <span className="text-[var(--color-text-3)]/60">-</span>}
                          </td>
                        ) : null}
                      </tr>
                      {isOpen ? (
                        <tr className="border-t border-[var(--border)] bg-[var(--color-muted)]/30">
                          <td colSpan={topTrades.length + (hasOther ? 3 : 2)} className="px-3 py-3">
                            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                              {project.trades.map((trade) => (
                                <div key={trade.trade} className="rounded-lg border border-[var(--border)] bg-white p-3">
                                  <div className="flex items-center justify-between text-sm">
                                    <span className="font-medium">{trade.trade}</span>
                                    <span className="text-xs text-[var(--color-text-3)]">{trade.ratio}%</span>
                                  </div>
                                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--color-muted)]">
                                    <div className="h-full bg-[var(--color-primary)]" style={{ width: `${trade.ratio}%` }} />
                                  </div>
                                  <div className="mt-2 flex justify-between text-xs text-[var(--color-text-2)]">
                                    <span>{trade.hours.toLocaleString('zh-CN')} 小时</span>
                                    <span className="font-medium tabular-nums">{money(trade.gross)}</span>
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
                <tr className="border-t-2 border-[var(--border)] bg-[var(--color-muted)]/70 font-semibold">
                  <td className="sticky left-0 z-10 bg-[var(--color-muted)] px-3 py-2.5">合计</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-[var(--color-primary)]">{money(grandTotal)}</td>
                  {topTrades.map((trade) => (
                    <td key={trade} className="px-3 py-2.5 text-right tabular-nums">{money(totalsByTrade.get(trade) || 0)}</td>
                  ))}
                  {hasOther ? <td className="px-3 py-2.5 text-right tabular-nums">{money(otherTotal)}</td> : null}
                </tr>
              </tbody>
            </table>
          </div>
        )}

        <p className="text-xs text-[var(--color-text-3)]">
          说明：金额为「应发工资」累计（工时×工价 + 包活工资），管理人员单列；表格金额单位为元（≥1万显示为“万”）。点项目行可展开全部工种、工时与占比。
        </p>
      </div>
    </div>
  );
}
