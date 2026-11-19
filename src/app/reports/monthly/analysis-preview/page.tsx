'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

function formatWan(value: number) {
  const n = Number(value) || 0;
  if (Math.abs(n) >= 10000) return `${(n / 10000).toFixed(2)} 万`;
  return n.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
}

type ProjectRow = {
  id: number;
  name: string;
  monthIncome?: number;
  monthIncomeExTax?: number;
  monthCost?: number;
  monthProfitExTax?: number;
  monthProfitExTaxRate?: number;
  monthLaborSalaryCost?: number;
  monthSalaryPaid?: number;
  monthTeamSettlementCost?: number;
  monthMaterialCost?: number;
  monthSupplierSettlement?: number;
  monthExpenseCost?: number;
  monthTaxCost?: number;
  salaryUnpaid?: number;
  supplierUnpaid?: number;
};

type TrendRow = { month: string; income: number; received: number; cost: number; profit: number };

type Summary = {
  overview?: Record<string, number>;
  projects?: ProjectRow[];
  trends?: TrendRow[];
};

export default function CostAnalysisPreviewPage() {
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/reports/monthly/summary?month=${month}`, { credentials: 'include', cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || json.success === false) throw new Error(json.error || '加载失败');
      setData(json.data || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    void load();
  }, [load]);

  const projects = data?.projects || [];
  const overview = (data?.overview || {}) as Record<string, number>;
  const trends = data?.trends || [];

  const exTax = Number(overview.monthIncomeExTax) || 0;
  const cost = Number(overview.monthCost) || 0;
  const profit = exTax - cost;
  const profitRate = exTax > 0 ? (profit / exTax) * 100 : 0;

  const costParts = useMemo(() => ([
    { label: '工人工资', value: projects.reduce((s, p) => s + Number(p.monthLaborSalaryCost || 0), 0) },
    { label: '班组结算', value: projects.reduce((s, p) => s + Number(p.monthTeamSettlementCost || 0), 0) },
    { label: '零星材料', value: projects.reduce((s, p) => s + Number(p.monthMaterialCost || 0), 0) },
    { label: '供应商结算', value: projects.reduce((s, p) => s + Number(p.monthSupplierSettlement || 0), 0) },
    { label: '其他费用', value: projects.reduce((s, p) => s + Number(p.monthExpenseCost || 0), 0) },
    { label: '税金', value: projects.reduce((s, p) => s + Number(p.monthTaxCost || 0), 0) },
  ]), [projects]);
  const partTotal = costParts.reduce((s, item) => s + item.value, 0) || 1;

  // 全成本估算：已确认成本 + 未发工资 + 供应商未付（估算口径，正式版可再接班组未结算）
  const unpaidSalary = projects.reduce((s, p) => s + Number(p.salaryUnpaid || 0), 0);
  const supplierUnpaid = projects.reduce((s, p) => s + Number(p.supplierUnpaid || 0), 0);
  const fullCost = cost + unpaidSalary + supplierUnpaid;
  const potentialProfit = exTax - fullCost;

  const ranked = [...projects]
    .map((p) => {
      const row = p as ProjectRow & Record<string, unknown>;
      const ex = Number(row.monthIncomeExTax) || 0;
      const c = Number(row.monthCost) || 0;
      return { id: p.id, name: p.name, exTax: ex, cost: c, profit: ex - c, rate: ex > 0 ? ((ex - c) / ex) * 100 : 0 };
    })
    .sort((a, b) => b.profit - a.profit);

  const warnings = ranked.filter((p) => p.cost > 0 && p.profit < 0);

  return (
    <div className="min-h-screen bg-[var(--background)] px-4 py-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <Link href="/reports/monthly" className="text-sm text-[var(--color-primary)] hover:underline">← 返回月度经营月报</Link>
            <h1 className="mt-2 text-xl font-bold text-[var(--foreground)]">成本分析（预览版）</h1>
            <p className="mt-1 text-sm text-[var(--color-text-3)]">
              不含税产值 − 本月成本 = 本月利润；含"全成本估算"、三线对比与项目利润排行。正式版可再接入目标成本与单方成本。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="h-9 rounded-lg border border-[var(--border)] bg-white px-3 text-sm" />
            <button type="button" onClick={() => void load()} disabled={loading} className="h-9 rounded-lg bg-[var(--color-primary)] px-4 text-sm text-white disabled:opacity-60">
              {loading ? '加载中…' : '刷新'}
            </button>
          </div>
        </div>

        {error ? <div className="rounded-xl border border-[#FFCCC7] bg-[#FFF2F0] px-4 py-3 text-sm text-[#CB2634]">{error}</div> : null}

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: '不含税产值', value: formatWan(exTax), tone: 'text-[var(--foreground)]' },
            { label: '本月成本', value: formatWan(cost), tone: 'text-[#FF7D00]' },
            { label: '本月利润', value: formatWan(profit), tone: profit >= 0 ? 'text-[#00A870]' : 'text-[#CB2634]' },
            { label: '利润率', value: `${profitRate.toFixed(1)}%`, tone: profitRate >= 0 ? 'text-[#00A870]' : 'text-[#CB2634]' },
            { label: '全成本（估算）', value: formatWan(fullCost), tone: 'text-[#B35B00]' },
            { label: '潜在利润', value: formatWan(potentialProfit), tone: potentialProfit >= 0 ? 'text-[#00A870]' : 'text-[#CB2634]' },
          ].map((item) => (
            <div key={item.label} className="rounded-xl border border-[var(--border)] bg-white px-4 py-3">
              <p className="text-xs text-[var(--color-text-3)]">{item.label}</p>
              <p className={`mt-1 text-lg font-semibold tabular-nums ${item.tone}`}>{item.value}</p>
            </div>
          ))}
        </section>

        <section className="rounded-xl border border-[var(--border)] bg-white p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">三线对比（近 6 月：产值 / 成本 / 回款）</h2>
            <span className="text-xs text-[var(--color-text-3)]">回款低于成本 = 资金缺口</span>
          </div>
          <div className="mt-4 space-y-3">
            {trends.length === 0 ? (
              <p className="text-sm text-[var(--color-text-3)]">暂无趋势数据</p>
            ) : (() => {
              const max = Math.max(...trends.flatMap((t) => [t.income, t.cost, t.received]), 1);
              return trends.map((t) => (
                <div key={t.month} className="flex items-center gap-3 text-xs">
                  <span className="w-16 shrink-0 text-[var(--color-text-3)]">{t.month}</span>
                  <div className="flex-1 space-y-1">
                    {[
                      { label: '产值', value: t.income, color: '#165DFF' },
                      { label: '成本', value: t.cost, color: '#FF7D00' },
                      { label: '回款', value: t.received, color: '#00A870' },
                    ].map((bar) => (
                      <div key={bar.label} className="flex items-center gap-2">
                        <span className="w-8 text-[var(--color-text-3)]">{bar.label}</span>
                        <div className="h-1.5 flex-1 overflow-hidden rounded bg-[var(--color-muted)]">
                          <div className="h-full rounded" style={{ width: `${Math.max(1, (bar.value / max) * 100)}%`, background: bar.color }} />
                        </div>
                        <span className="w-20 text-right tabular-nums">{formatWan(bar.value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ));
            })()}
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-xl border border-[var(--border)] bg-white p-4">
            <h2 className="text-sm font-semibold">成本构成</h2>
            <div className="mt-3 space-y-2">
              {costParts.map((item) => (
                <div key={item.label} className="flex items-center gap-3 text-xs">
                  <span className="w-20 shrink-0">{item.label}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded bg-[var(--color-muted)]">
                    <div className="h-full rounded bg-[var(--color-primary)]" style={{ width: `${Math.min(100, (item.value / partTotal) * 100)}%` }} />
                  </div>
                  <span className="w-20 text-right tabular-nums">{formatWan(item.value)}</span>
                  <span className="w-12 text-right tabular-nums text-[var(--color-text-3)]">{((item.value / partTotal) * 100).toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-[var(--border)] bg-white p-4">
            <h2 className="text-sm font-semibold">风险预警</h2>
            <div className="mt-3 space-y-2 text-sm">
              {warnings.length === 0 ? (
                <p className="text-[var(--color-text-3)]">本月无亏损项目</p>
              ) : warnings.map((p) => (
                <div key={p.id} className="rounded-lg border border-[#FFCCC7] bg-[#FFF2F0] px-3 py-2 text-[#CB2634]">
                  {p.name}：产值 {formatWan(p.exTax)}，成本 {formatWan(p.cost)}，亏损 {formatWan(p.profit)}（{p.rate.toFixed(1)}%）
                </div>
              ))}
              {supplierUnpaid > 0 ? (
                <div className="rounded-lg border border-[#FFE7BA] bg-[#FFFBE6] px-3 py-2 text-[#874D00]">
                  供应商未付 {formatWan(supplierUnpaid)}，占本月成本 {cost > 0 ? ((supplierUnpaid / cost) * 100).toFixed(1) : 0}%
                </div>
              ) : null}
              {unpaidSalary > 0 ? (
                <div className="rounded-lg border border-[#FFE7BA] bg-[#FFFBE6] px-3 py-2 text-[#874D00]">
                  工人未发工资 {formatWan(unpaidSalary)}
                </div>
              ) : null}
            </div>
          </section>
        </div>

        <section className="rounded-xl border border-[var(--border)] bg-white p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">项目利润排行</h2>
            <span className="text-xs text-[var(--color-text-3)]">按本月利润降序</span>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-[var(--color-text-3)]">
                <tr>
                  <th className="py-1.5 pr-3 text-left font-medium">项目</th>
                  <th className="py-1.5 pr-3 text-right font-medium">不含税产值</th>
                  <th className="py-1.5 pr-3 text-right font-medium">成本</th>
                  <th className="py-1.5 pr-3 text-right font-medium">利润</th>
                  <th className="py-1.5 pr-3 text-right font-medium">利润率</th>
                  <th className="py-1.5 text-right font-medium">成本率</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((p) => (
                  <tr key={p.id} className="border-t border-[var(--border)]">
                    <td className="py-1.5 pr-3">{p.name}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{formatWan(p.exTax)}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{formatWan(p.cost)}</td>
                    <td className={`py-1.5 pr-3 text-right tabular-nums ${p.profit >= 0 ? 'text-[#00A870]' : 'text-[#CB2634]'}`}>{formatWan(p.profit)}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{p.rate.toFixed(1)}%</td>
                    <td className="py-1.5 text-right tabular-nums">{p.exTax > 0 ? ((p.cost / p.exTax) * 100).toFixed(1) : '-'}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-xl border border-dashed border-[var(--border)] bg-white/60 p-4 text-sm text-[var(--color-text-3)]">
          <p className="font-medium text-[var(--foreground)]">待接入（预览占位）</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>目标成本 / 预算对比：需要项目开工时录入目标成本，按月显示偏差率</li>
            <li>单方成本（元/㎡）：需要项目建筑面积字段</li>
            <li>班组已完工未结算成本：需要结算进度与完工量的对应关系</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
