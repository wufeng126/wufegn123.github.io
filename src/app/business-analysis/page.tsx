'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  BarChart3,
  BriefcaseBusiness,
  Building2,
  CalendarClock,
  ChevronRight,
  HandCoins,
  Loader2,
  ReceiptText,
  RefreshCw,
  Users,
  WalletCards,
} from 'lucide-react';
import { TabContainer, TabItem } from '@/components/tab-container';
import { Button } from '@/components/ui/button';
import { authFetch } from '@/lib/auth-client';

const CostCenterPage = dynamic(() => import('@/app/cost-center/page'), { ssr: false });
const WorkerCostPage = dynamic(() => import('@/app/data-board/worker-cost/page'), { ssr: false });
const SupplierCostPage = dynamic(() => import('@/app/data-board/supplier-cost/page'), { ssr: false });
const FundManagementPage = dynamic(() => import('@/app/data-board/fund-management/page'), { ssr: false });

type Summary = {
  totalIncome?: number;
  invoiceAmount?: number;
  totalClientPaid?: number;
  totalReceivable?: number;
  totalSupplierPayable?: number;
  totalWorkerPayable?: number;
  totalPayable?: number;
  totalSupplierPaid?: number;
  totalWorkerPaid?: number;
  totalCashOut?: number;
  totalNetCashFlow?: number;
  totalFundingGap?: number;
  avgPaymentRate?: number;
  avgPayablePaymentRate?: number;
  totalRatioReceivableAmount?: number;
  totalRatioUnreceivedAmount?: number;
  totalFullUnreceivedAmount?: number;
};

type ProjectRow = {
  id: number;
  name: string;
  status?: string;
  effectiveStatus?: string;
  totalIncome?: number;
  invoiceAmount?: number;
  clientPaidAmount?: number;
  receivableAmount?: number;
  paymentRatio?: number | null;
  ratioReceivableAmount?: number | null;
  ratioUnreceivedAmount?: number | null;
  fullUnreceivedAmount?: number;
  warrantyExpiredDate?: string | null;
  receivableAgingDays?: number | null;
  receivableRiskLabel?: string;
  receivableRiskLevel?: string;
  supplierPayableAmount?: number;
  workerPayableAmount?: number;
  totalPayableAmount?: number;
  cashOutAmount?: number;
  fundingGapAmount?: number;
  paymentRate?: number;
  payablePaymentRate?: number;
};

type WarningItem = {
  projectId: number;
  projectName: string;
  message: string;
  severity: 'high' | 'medium' | 'low';
};

type CostCenterResponse = {
  summary?: Summary;
  projects?: ProjectRow[];
  warnings?: WarningItem[];
};

type Metric = {
  label: string;
  value: string;
  note: string;
  icon: LucideIcon;
  tone: string;
};

type DetailCard = {
  title: string;
  desc: string;
  icon: LucideIcon;
  primary: string;
  secondary: string;
  href: string;
  tone: string;
};

type TrendItem = {
  name: string;
  value: string;
  delta: string;
  positive: boolean;
};

function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof value === 'object' && '$numberDecimal' in value) {
    const parsed = Number((value as { $numberDecimal: string }).$numberDecimal);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function formatWan(value: number) {
  const wan = value / 10000;
  if (Math.abs(wan) >= 1000) {
    return `${wan.toLocaleString('zh-CN', { maximumFractionDigits: 0 })} 万`;
  }
  return `${wan.toLocaleString('zh-CN', { maximumFractionDigits: 1 })} 万`;
}

function formatPercent(value: number) {
  return `${value.toLocaleString('zh-CN', { maximumFractionDigits: 1 })}%`;
}

function getRisk(row: ProjectRow) {
  if (row.receivableRiskLabel) {
    const toneMap: Record<string, string> = {
      high: 'bg-rose-50 text-rose-700',
      medium: 'bg-orange-50 text-orange-700',
      attention: 'bg-amber-50 text-amber-700',
      config: 'bg-slate-100 text-slate-600',
      normal: 'bg-emerald-50 text-emerald-700',
    };
    return { label: row.receivableRiskLabel, tone: toneMap[row.receivableRiskLevel || 'normal'] || toneMap.normal };
  }
  const receivable = toNumber(row.receivableAmount);
  const fundingGap = toNumber(row.fundingGapAmount);
  if (receivable >= 1000000 || fundingGap >= 1000000) {
    return { label: '重点跟进', tone: 'bg-rose-50 text-rose-700' };
  }
  if (receivable > 0 || fundingGap > 0) {
    return { label: '需要关注', tone: 'bg-amber-50 text-amber-700' };
  }
  return { label: '正常', tone: 'bg-emerald-50 text-emerald-700' };
}

function formatRatio(value?: number | null) {
  if (value === null || value === undefined) return '待完善';
  return formatPercent(value);
}

function formatAging(row: ProjectRow) {
  if (row.receivableAgingDays === null || row.receivableAgingDays === undefined) {
    if (row.effectiveStatus === '质保期满') return '待完善';
    return '未到账期';
  }
  return `${row.receivableAgingDays} 天`;
}

function ProgressBar({
  label,
  value,
  total,
  color,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
}) {
  const width = total > 0 ? Math.max(4, Math.min(100, Math.round((value / total) * 100))) : 0;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-4 text-xs text-slate-500">
        <span>{label}</span>
        <span className="font-medium text-slate-700">{formatWan(value)}</span>
      </div>
      <div className="h-2 rounded-full bg-slate-100">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function BusinessOverviewPage() {
  const [data, setData] = useState<CostCenterResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await authFetch('/api/cost-center');
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error || '经营数据加载失败');
      }
      setData(json);
    } catch (err) {
      setData({ summary: {}, projects: [], warnings: [] });
      setError(err instanceof Error ? err.message : '经营数据加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void loadData();
    });
  }, [loadData]);

  const summary = data?.summary || {};
  const projects = useMemo(() => data?.projects || [], [data?.projects]);
  const warnings = data?.warnings || [];

  const settlementAmount = toNumber(summary.invoiceAmount) || toNumber(summary.totalIncome);
  const receivedAmount = toNumber(summary.totalClientPaid);
  const receivableAmount = toNumber(summary.totalRatioUnreceivedAmount) || toNumber(summary.totalReceivable);
  const fullUnreceivedAmount = toNumber(summary.totalFullUnreceivedAmount) || toNumber(summary.totalReceivable);
  const supplierPayable = toNumber(summary.totalSupplierPayable);
  const workerPayable = toNumber(summary.totalWorkerPayable);
  const totalPayable = toNumber(summary.totalPayable) || supplierPayable + workerPayable;
  const paidAmount = toNumber(summary.totalCashOut) || toNumber(summary.totalSupplierPaid) + toNumber(summary.totalWorkerPaid);
  const payableUnpaid = Math.max(totalPayable - paidAmount, 0);
  const fundingGap = toNumber(summary.totalFundingGap);

  const projectLedger = useMemo(
    () =>
      [...projects]
        .sort((a, b) => toNumber(b.ratioUnreceivedAmount ?? b.receivableAmount) - toNumber(a.ratioUnreceivedAmount ?? a.receivableAmount))
        .slice(0, 8),
    [projects]
  );

  const metrics: Metric[] = [
    {
      label: '累计产值结算',
      value: formatWan(settlementAmount),
      note: '按开票金额汇总',
      icon: ReceiptText,
      tone: 'bg-blue-50 text-blue-700 ring-blue-100',
    },
    {
      label: '已收甲方回款',
      value: formatWan(receivedAmount),
      note: `回款率 ${formatPercent(toNumber(summary.avgPaymentRate))}`,
      icon: Banknote,
      tone: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    },
    {
      label: '应收未收',
      value: formatWan(receivableAmount),
      note: fullUnreceivedAmount > receivableAmount ? `100%未收 ${formatWan(fullUnreceivedAmount)}` : '按当前付款比例计算',
      icon: AlertTriangle,
      tone: 'bg-amber-50 text-amber-700 ring-amber-100',
    },
    {
      label: '供应商未付',
      value: formatWan(Math.max(supplierPayable - toNumber(summary.totalSupplierPaid), 0)),
      note: '供应商结算应付减已付',
      icon: HandCoins,
      tone: 'bg-violet-50 text-violet-700 ring-violet-100',
    },
    {
      label: '工人工资未付',
      value: formatWan(Math.max(workerPayable - toNumber(summary.totalWorkerPaid), 0)),
      note: '工资应付减已发放',
      icon: Users,
      tone: 'bg-rose-50 text-rose-700 ring-rose-100',
    },
    {
      label: '资金缺口',
      value: formatWan(fundingGap),
      note: `对外付款率 ${formatPercent(toNumber(summary.avgPayablePaymentRate))}`,
      icon: WalletCards,
      tone: 'bg-cyan-50 text-cyan-700 ring-cyan-100',
    },
  ];

  const detailCards: DetailCard[] = [
    {
      title: '人工成本',
      desc: '按项目查看应付工资、已发工资、未发工资和人员成本占比。',
      icon: Users,
      primary: `应付 ${formatWan(workerPayable)}`,
      secondary: `未付 ${formatWan(Math.max(workerPayable - toNumber(summary.totalWorkerPaid), 0))}`,
      href: '/business-analysis?tab=worker-cost',
      tone: 'bg-rose-50 text-rose-700 ring-rose-100',
    },
    {
      title: '供应商成本',
      desc: '按供应商、费用类型和项目归集结算额、付款额、未付额。',
      icon: BriefcaseBusiness,
      primary: `应付 ${formatWan(supplierPayable)}`,
      secondary: `未付 ${formatWan(Math.max(supplierPayable - toNumber(summary.totalSupplierPaid), 0))}`,
      href: '/business-analysis?tab=supplier-cost',
      tone: 'bg-violet-50 text-violet-700 ring-violet-100',
    },
    {
      title: '资金分析',
      desc: '统一查看甲方回款、应收未收、对外付款和现金流压力。',
      icon: WalletCards,
      primary: `净现金流 ${formatWan(toNumber(summary.totalNetCashFlow))}`,
      secondary: `缺口 ${formatWan(fundingGap)}`,
      href: '/business-analysis?tab=fund-management',
      tone: 'bg-cyan-50 text-cyan-700 ring-cyan-100',
    },
    {
      title: '成本利润中心',
      desc: '保持原有成本利润分析逻辑，作为更细的利润和成本下钻页面。',
      icon: BarChart3,
      primary: '原逻辑保留',
      secondary: '点击查看明细',
      href: '/business-analysis?tab=cost-center',
      tone: 'bg-slate-100 text-slate-700 ring-slate-200',
    },
  ];

  const trendItems: TrendItem[] = [
    {
      name: '甲方回款率',
      value: formatPercent(toNumber(summary.avgPaymentRate)),
      delta: receivableAmount > 0 ? '有未收款' : '已收齐',
      positive: receivableAmount <= 0,
    },
    {
      name: '对外付款率',
      value: formatPercent(toNumber(summary.avgPayablePaymentRate)),
      delta: payableUnpaid > 0 ? '有未付款' : '已付清',
      positive: payableUnpaid <= 0,
    },
    {
      name: '应收未收',
      value: formatWan(receivableAmount),
      delta: receivableAmount > 0 ? '需跟进' : '正常',
      positive: receivableAmount <= 0,
    },
    {
      name: '应付未付',
      value: formatWan(payableUnpaid),
      delta: payableUnpaid > 0 ? '需安排' : '正常',
      positive: payableUnpaid <= 0,
    },
  ];

  if (loading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center text-slate-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        正在加载经营数据...
      </div>
    );
  }

  return (
    <main className="min-h-full bg-[#f6f7f9] text-slate-950">
      <div className="mx-auto max-w-[1480px] space-y-5 p-3 sm:p-4 md:p-6">
        {error && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>经营数据暂未读取成功：{error}</span>
              <Button size="sm" variant="outline" onClick={loadData}>
                <RefreshCw className="mr-2 h-4 w-4" />
                重新加载
              </Button>
            </div>
          </div>
        )}

        <header className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white px-5 py-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
              <Building2 className="h-3.5 w-3.5" />
              经营分析
            </div>
            <h1 className="text-2xl font-semibold tracking-normal text-slate-950">公司经营总览</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
              先看公司整体收款、付款、未收未付和资金压力，再按项目下钻到人工成本、供应商成本、资金分析和成本利润中心。
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4 lg:w-[620px]">
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="whitespace-nowrap text-xs text-slate-500">当前口径</div>
              <div className="mt-1 whitespace-nowrap font-semibold">真实汇总</div>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="whitespace-nowrap text-xs text-slate-500">结算来源</div>
              <div className="mt-1 whitespace-nowrap font-semibold">开票金额</div>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="whitespace-nowrap text-xs text-slate-500">应收口径</div>
              <div className="mt-1 whitespace-nowrap font-semibold">状态比例</div>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="whitespace-nowrap text-xs text-slate-500">质保账期</div>
              <div className="mt-1 whitespace-nowrap font-semibold">实时判断</div>
            </div>
          </div>
        </header>

        <section className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
          {metrics.map(item => {
            const Icon = item.icon;
            return (
              <article key={item.label} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div className={`mb-4 flex h-10 w-10 items-center justify-center rounded-lg ring-1 ${item.tone}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="text-xs font-medium text-slate-500">{item.label}</div>
                <div className="mt-2 text-2xl font-semibold tabular-nums text-slate-950">{item.value}</div>
                <div className="mt-2 min-h-[36px] text-xs leading-5 text-slate-500">{item.note}</div>
              </article>
            );
          })}
        </section>

        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="text-base font-semibold">项目应收台账</h2>
              <p className="mt-1 text-xs text-slate-500">按项目档案的状态付款比例，结合开票金额和回款实时计算当前应收、未收和账期。</p>
            </div>
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="min-w-[1260px] w-full border-collapse text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-medium">项目名称</th>
                  <th className="px-4 py-3 font-medium">状态</th>
                  <th className="px-4 py-3 font-medium">付款比例</th>
                  <th className="px-4 py-3 text-right font-medium">结算金额</th>
                  <th className="px-4 py-3 text-right font-medium">按比例应收</th>
                  <th className="px-4 py-3 text-right font-medium">已收金额</th>
                  <th className="px-4 py-3 text-right font-medium">按比例未收</th>
                  <th className="px-4 py-3 text-right font-medium">100%未收</th>
                  <th className="px-4 py-3 font-medium">账期</th>
                  <th className="px-5 py-3 font-medium">风险</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {projectLedger.length === 0 ? (
                  <tr>
                    <td className="px-5 py-8 text-center text-slate-500" colSpan={10}>
                      暂无项目经营数据
                    </td>
                  </tr>
                ) : (
                  projectLedger.map(row => {
                    const risk = getRisk(row);
                    return (
                      <tr key={row.id} className="hover:bg-slate-50">
                        <td className="px-5 py-4 font-medium text-slate-950">{row.name}</td>
                        <td className="px-4 py-4 text-slate-600">{row.effectiveStatus || row.status || '-'}</td>
                        <td className="px-4 py-4 text-slate-600">{formatRatio(row.paymentRatio)}</td>
                        <td className="px-4 py-4 text-right tabular-nums">{formatWan(toNumber(row.invoiceAmount))}</td>
                        <td className="px-4 py-4 text-right tabular-nums">{row.ratioReceivableAmount === null || row.ratioReceivableAmount === undefined ? '待完善' : formatWan(toNumber(row.ratioReceivableAmount))}</td>
                        <td className="px-4 py-4 text-right tabular-nums text-emerald-700">{formatWan(toNumber(row.clientPaidAmount))}</td>
                        <td className="px-4 py-4 text-right tabular-nums text-amber-700">{row.ratioUnreceivedAmount === null || row.ratioUnreceivedAmount === undefined ? '待完善' : formatWan(toNumber(row.ratioUnreceivedAmount))}</td>
                        <td className="px-4 py-4 text-right tabular-nums text-rose-700">{formatWan(toNumber(row.fullUnreceivedAmount))}</td>
                        <td className="px-4 py-4 text-slate-600">{formatAging(row)}</td>
                        <td className="px-5 py-4">
                          <span className={`inline-flex rounded-md px-2 py-1 text-xs font-medium ${risk.tone}`}>{risk.label}</span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <div className="space-y-3 p-4 md:hidden">
            {projectLedger.length === 0 ? (
              <div className="rounded-lg bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                暂无项目经营数据
              </div>
            ) : (
              projectLedger.map(row => {
                const risk = getRisk(row);
                return (
                  <article key={row.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-semibold text-slate-950">{row.name}</h3>
                        <div className="mt-1 text-xs text-slate-500">
                          {row.effectiveStatus || row.status || '-'} / {formatRatio(row.paymentRatio)}
                        </div>
                      </div>
                      <span className={`shrink-0 rounded-md px-2 py-1 text-xs font-medium ${risk.tone}`}>{risk.label}</span>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-md bg-slate-50 p-3">
                        <div className="text-slate-500">结算金额</div>
                        <div className="mt-1 font-semibold text-slate-900">{formatWan(toNumber(row.invoiceAmount))}</div>
                      </div>
                      <div className="rounded-md bg-slate-50 p-3">
                        <div className="text-slate-500">已收金额</div>
                        <div className="mt-1 font-semibold text-emerald-700">{formatWan(toNumber(row.clientPaidAmount))}</div>
                      </div>
                      <div className="rounded-md bg-amber-50 p-3">
                        <div className="text-amber-700">按比例未收</div>
                        <div className="mt-1 font-semibold text-amber-800">
                          {row.ratioUnreceivedAmount === null || row.ratioUnreceivedAmount === undefined ? '待完善' : formatWan(toNumber(row.ratioUnreceivedAmount))}
                        </div>
                      </div>
                      <div className="rounded-md bg-blue-50 p-3">
                        <div className="text-blue-700">按比例应收</div>
                        <div className="mt-1 font-semibold text-blue-800">
                          {row.ratioReceivableAmount === null || row.ratioReceivableAmount === undefined ? '待完善' : formatWan(toNumber(row.ratioReceivableAmount))}
                        </div>
                      </div>
                      <div className="rounded-md bg-rose-50 p-3">
                        <div className="text-rose-700">100%未收</div>
                        <div className="mt-1 font-semibold text-rose-800">{formatWan(toNumber(row.fullUnreceivedAmount))}</div>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
                      <span>账期</span>
                      <span className="font-medium">{formatAging(row)}</span>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
          <article className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div>
                <h2 className="text-base font-semibold">收付款结构</h2>
                <p className="mt-1 text-xs text-slate-500">用同一个口径看公司应该收多少、已经收多少，以及还要对外支付多少。</p>
              </div>
              <div className="inline-flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
                <CalendarClock className="h-4 w-4" />
                应收未收 {formatWan(receivableAmount)}
              </div>
            </div>
            <div className="grid gap-6 p-5 lg:grid-cols-2">
              <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
                <div className="mb-4 flex items-center justify-between">
                  <div className="font-semibold">甲方应收</div>
                  <div className="text-xs text-slate-500">产值结算 / 回款</div>
                </div>
                <div className="space-y-4">
                  <ProgressBar label="累计产值结算" value={settlementAmount} total={Math.max(settlementAmount, receivedAmount + receivableAmount)} color="bg-cyan-500" />
                  <ProgressBar label="已收回款" value={receivedAmount} total={Math.max(settlementAmount, receivedAmount + receivableAmount)} color="bg-emerald-500" />
                  <ProgressBar label="应收未收" value={receivableAmount} total={Math.max(settlementAmount, receivedAmount + receivableAmount)} color="bg-amber-500" />
                </div>
              </div>
              <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
                <div className="mb-4 flex items-center justify-between">
                  <div className="font-semibold">对外应付</div>
                  <div className="text-xs text-slate-500">供应商 + 工资</div>
                </div>
                <div className="space-y-4">
                  <ProgressBar label="累计应付" value={totalPayable} total={totalPayable} color="bg-violet-500" />
                  <ProgressBar label="已付款项" value={paidAmount} total={totalPayable} color="bg-blue-500" />
                  <ProgressBar label="应付未付" value={payableUnpaid} total={totalPayable} color="bg-rose-500" />
                </div>
              </div>
            </div>
          </article>

          <article className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-base font-semibold">经营状态提醒</h2>
              <p className="mt-1 text-xs text-slate-500">总览只负责告诉老板哪里需要看，细节仍回到原模块处理。</p>
            </div>
            <div className="grid gap-3 p-5 sm:grid-cols-2">
              {trendItems.map(item => (
                <div key={item.name} className="rounded-lg border border-slate-100 bg-slate-50 p-4">
                  <div className="text-xs text-slate-500">{item.name}</div>
                  <div className="mt-2 flex items-end justify-between gap-3">
                    <div className="text-xl font-semibold tabular-nums">{item.value}</div>
                    <div
                      className={[
                        'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium',
                        item.positive ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700',
                      ].join(' ')}
                    >
                      {item.positive ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                      {item.delta}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {warnings.length > 0 && (
              <div className="border-t border-slate-100 px-5 pb-5 pt-2">
                <div className="mb-2 text-xs font-medium text-slate-500">成本利润中心预警</div>
                <div className="space-y-2">
                  {warnings.slice(0, 3).map(item => (
                    <div key={`${item.projectId}-${item.message}`} className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      {item.projectName}：{item.message}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </article>
        </section>

        <section className="grid gap-4 lg:grid-cols-4">
          {detailCards.map(card => {
            const Icon = card.icon;
            return (
              <a key={card.title} href={card.href} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-blue-200 hover:shadow-md">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg ring-1 ${card.tone}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-400" />
                </div>
                <h3 className="text-base font-semibold">{card.title}</h3>
                <p className="mt-2 min-h-[72px] text-sm leading-6 text-slate-500">{card.desc}</p>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <div className="rounded-md bg-slate-50 px-3 py-2">
                    <div className="text-[11px] text-slate-500">核心指标</div>
                    <div className="mt-1 text-sm font-semibold">{card.primary}</div>
                  </div>
                  <div className="rounded-md bg-slate-50 px-3 py-2">
                    <div className="text-[11px] text-slate-500">需要关注</div>
                    <div className="mt-1 text-sm font-semibold">{card.secondary}</div>
                  </div>
                </div>
              </a>
            );
          })}
        </section>

      </div>
    </main>
  );
}

const tabs: TabItem[] = [
  { key: 'overview', label: '经营总览', href: '/business-analysis?tab=overview', content: BusinessOverviewPage },
  { key: 'cost-center', label: '成本利润', href: '/business-analysis?tab=cost-center', content: CostCenterPage, permission: 'cost_center:view' },
  { key: 'worker-cost', label: '人工成本', href: '/business-analysis?tab=worker-cost', content: WorkerCostPage, permission: 'data_board:worker_cost_view' },
  { key: 'supplier-cost', label: '供应商成本', href: '/business-analysis?tab=supplier-cost', content: SupplierCostPage, permission: 'data_board:supplier_cost_view' },
  { key: 'fund-management', label: '资金分析', href: '/business-analysis?tab=fund-management', content: FundManagementPage, permission: 'data_board:fund_management_view' },
];

export default function BusinessAnalysisPage() {
  return (
    <div className="h-full">
      <TabContainer tabs={tabs} defaultTab="overview" />
    </div>
  );
}
