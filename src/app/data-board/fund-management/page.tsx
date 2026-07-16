'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LineChart, Line } from 'recharts';
import { Wallet, AlertTriangle, CheckCircle, RefreshCw } from 'lucide-react';
import { ChartCard, KpiCard } from '@/components/business/common';
import { StandardDashboardLayout } from '@/components/dashboard/standard-layout';
import { CollapsibleSection } from '@/components/dashboard/collapsible-section';
import { LinkableCell } from '@/components/linkable-cell';

// 工具函数：将数据库numeric类型转换为数字
const toNumber = (value: any): number => {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return parseFloat(value) || 0;
  if (typeof value === 'object' && value !== null) {
    if ('$numberDecimal' in value) return parseFloat(value.$numberDecimal) || 0;
    try {
      const str = String(value);
      const num = parseFloat(str);
      if (!isNaN(num)) return num;
      const match = str.match(/-?\d+\.?\d*/);
      if (match) return parseFloat(match[0]) || 0;
    } catch (e) {}
    return 0;
  }
  return 0;
};

interface ClientReport {
  id: number;
  project_id: number;
  report_amount: number;
  settlement_amount?: number;
  invoice_amount?: number;
  report_date?: string;
  status?: string;
}

interface ClientPayment {
  id: number;
  project_id: number;
  payment_amount: number;
  payment_date?: string;
}

interface Project {
  id: number;
  name: string;
}

interface CostCenterProject {
  id: number;
  totalIncome: number;
  clientPaidAmount: number;
  receivableAmount: number;
  totalPayableAmount: number;
  cashOutAmount: number;
  netCashFlow: number;
  fundingGapAmount: number;
  paymentRate: number;
  payablePaymentRate: number;
}

interface CostCenterSummary {
  totalIncome: number;
  totalClientPaid: number;
  totalReceivable: number;
  totalPayable: number;
  totalCashOut: number;
  totalNetCashFlow: number;
  totalFundingGap: number;
  avgPaymentRate: number;
  avgPayablePaymentRate: number;
}

interface CostCenterData {
  summary?: CostCenterSummary;
  projects?: CostCenterProject[];
}

interface DashboardStats {
  totalSettlement: number;
  totalPayment: number;
  totalUnpaid: number;
  overPayment: number;
  settlementCount: number;
  paymentCount: number;
  avgPaymentRate: number;
  totalPayable: number;
  totalCashOut: number;
  netCashFlow: number;
  fundingGap: number;
  avgPayablePaymentRate: number;
}

const formatCurrency = (value: number) => {
  if (Math.abs(value) >= 10000) return `¥${(value / 10000).toFixed(2)}万`;
  return `¥${value.toFixed(2)}`;
};

export default function FundManagementDashboard() {
  const [clientReports, setClientReports] = useState<ClientReport[]>([]);
  const [clientPayments, setClientPayments] = useState<ClientPayment[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [costCenterData, setCostCenterData] = useState<CostCenterData | null>(null);
  const [selectedProject, setSelectedProject] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [reportsRes, paymentsRes, projectsRes, costCenterRes] = await Promise.all([
        fetch('/api/client-reports', { credentials: 'include' }),
        fetch('/api/client-payments', { credentials: 'include' }),
        fetch('/api/projects', { credentials: 'include' }),
        fetch('/api/cost-center', { credentials: 'include' }),
      ]);

      const [reportsData, paymentsData, projectsData, costCenterResult] = await Promise.all([
        reportsRes.json().catch(() => []),
        paymentsRes.json().catch(() => []),
        projectsRes.json().catch(() => []),
        costCenterRes.json().catch(() => null),
      ]);

      const reportsArray = Array.isArray(reportsData.reports) ? reportsData.reports
        : Array.isArray(reportsData.data) ? reportsData.data
        : Array.isArray(reportsData) ? reportsData : [];
      const paymentsArray = Array.isArray(paymentsData.payments) ? paymentsData.payments
        : Array.isArray(paymentsData.data) ? paymentsData.data
        : Array.isArray(paymentsData) ? paymentsData : [];
      const projectsArray = Array.isArray(projectsData.projects) ? projectsData.projects
        : Array.isArray(projectsData.data) ? projectsData.data
        : Array.isArray(projectsData) ? projectsData : [];

      setClientReports(reportsArray);
      setClientPayments(paymentsArray);
      setProjects(projectsArray);
      setCostCenterData(costCenterResult && !costCenterResult.error ? costCenterResult : null);
    } catch (error) {
      console.error('加载数据失败:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const stats = useMemo<DashboardStats>(() => {
    let filteredReports = clientReports;
    let filteredPayments = clientPayments;

    if (selectedProject !== 'all') {
      filteredReports = filteredReports.filter(r => toNumber(r.project_id) === Number(selectedProject));
      filteredPayments = filteredPayments.filter(p => toNumber(p.project_id) === Number(selectedProject));
    }

    const totalReceivable = filteredReports.reduce((sum, r) => sum + toNumber(r.invoice_amount || r.settlement_amount || r.report_amount), 0);
    const totalReceived = filteredPayments.reduce((sum, p) => sum + toNumber(p.payment_amount), 0);
    const totalUnreceived = Math.max(0, totalReceivable - totalReceived);
    const totalOverReceived = totalReceived > totalReceivable ? totalReceived - totalReceivable : 0;
    const settlementCount = filteredReports.length;
    const paymentCount = filteredPayments.length;
    const avgPaymentRate = totalReceivable > 0 ? (totalReceived / totalReceivable) * 100 : 0;

    const financial = selectedProject === 'all'
      ? costCenterData?.summary
      : costCenterData?.projects?.find(p => p.id === Number(selectedProject));

    const alignedReceivableBase = financial ? financial.totalIncome : totalReceivable;
    const alignedReceived = financial
      ? ('totalClientPaid' in financial ? financial.totalClientPaid : financial.clientPaidAmount)
      : totalReceived;
    const alignedUnreceived = financial
      ? ('totalReceivable' in financial ? financial.totalReceivable : financial.receivableAmount)
      : totalUnreceived;
    const alignedPaymentRate = financial
      ? ('avgPaymentRate' in financial ? financial.avgPaymentRate : financial.paymentRate)
      : avgPaymentRate;
    const totalPayable = financial
      ? ('totalPayable' in financial ? financial.totalPayable : financial.totalPayableAmount)
      : 0;
    const totalCashOut = financial
      ? ('totalCashOut' in financial ? financial.totalCashOut : financial.cashOutAmount)
      : 0;
    const netCashFlow = financial
      ? ('totalNetCashFlow' in financial ? financial.totalNetCashFlow : financial.netCashFlow)
      : alignedReceived - totalCashOut;
    const fundingGap = financial
      ? ('totalFundingGap' in financial ? financial.totalFundingGap : financial.fundingGapAmount)
      : Math.max(totalPayable - alignedUnreceived, 0);
    const avgPayablePaymentRate = financial
      ? ('avgPayablePaymentRate' in financial ? financial.avgPayablePaymentRate : financial.payablePaymentRate)
      : 0;

    return {
      totalSettlement: alignedReceivableBase,
      totalPayment: alignedReceived,
      totalUnpaid: alignedUnreceived,
      overPayment: alignedReceived > alignedReceivableBase ? alignedReceived - alignedReceivableBase : totalOverReceived,
      settlementCount,
      paymentCount,
      avgPaymentRate: alignedPaymentRate,
      totalPayable,
      totalCashOut,
      netCashFlow,
      fundingGap,
      avgPayablePaymentRate,
    };
  }, [clientReports, clientPayments, selectedProject, costCenterData]);

  const pieChartData = useMemo(() => {
    const items = [
      { name: '已收金额', value: stats.totalPayment, color: '#00B42A' },
      { name: '未收金额', value: stats.totalUnpaid, color: '#F53F3F' },
    ];
    if (stats.overPayment > 0) {
      items.push({ name: '超收/预收', value: stats.overPayment, color: '#722ED1' });
    }
    return items.filter(d => d.value > 0);
  }, [stats]);

  const projectComparisonData = useMemo(() => {
    let filteredReports = clientReports;
    let filteredPayments = clientPayments;

    if (selectedProject !== 'all') {
      filteredReports = filteredReports.filter(r => toNumber(r.project_id) === Number(selectedProject));
      filteredPayments = filteredPayments.filter(p => toNumber(p.project_id) === Number(selectedProject));
    }

    const projectMap = new Map<number, { name: string; settlement: number; payment: number }>();

    filteredReports.forEach(r => {
      const pid = toNumber(r.project_id);
      const project = projects.find(p => p.id === pid);
      const name = project?.name || `项目${pid}`;
      const existing = projectMap.get(pid) || { name, settlement: 0, payment: 0 };
      existing.settlement += toNumber(r.invoice_amount || r.settlement_amount || r.report_amount);
      projectMap.set(pid, existing);
    });

    filteredPayments.forEach(p => {
      const pid = toNumber(p.project_id);
      const project = projects.find(p => p.id === pid);
      const name = project?.name || `项目${pid}`;
      const existing = projectMap.get(pid) || { name, settlement: 0, payment: 0 };
      existing.payment += toNumber(p.payment_amount);
      projectMap.set(pid, existing);
    });

    return Array.from(projectMap.values()).map(item => ({
      ...item,
      unpaid: Math.max(0, item.settlement - item.payment),
    }));
  }, [clientReports, clientPayments, projects, selectedProject]);

  const monthlyTrendData = useMemo(() => {
    let filteredReports = clientReports;
    let filteredPayments = clientPayments;

    if (selectedProject !== 'all') {
      filteredReports = filteredReports.filter(r => toNumber(r.project_id) === Number(selectedProject));
      filteredPayments = filteredPayments.filter(p => toNumber(p.project_id) === Number(selectedProject));
    }

    const monthlyMap = new Map<string, { month: string; settlement: number; payment: number }>();

    filteredReports.forEach(r => {
      const date = r.report_date ? r.report_date.substring(0, 7) : '未知';
      const existing = monthlyMap.get(date) || { month: date, settlement: 0, payment: 0 };
      existing.settlement += toNumber(r.invoice_amount || r.settlement_amount || r.report_amount);
      monthlyMap.set(date, existing);
    });

    filteredPayments.forEach(p => {
      const date = p.payment_date ? p.payment_date.substring(0, 7) : '未知';
      const existing = monthlyMap.get(date) || { month: date, settlement: 0, payment: 0 };
      existing.payment += toNumber(p.payment_amount);
      monthlyMap.set(date, existing);
    });

    return Array.from(monthlyMap.values())
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-12);
  }, [clientReports, clientPayments, selectedProject]);

  const tableData = useMemo(() => {
    let filteredReports = clientReports;
    let filteredPayments = clientPayments;

    if (selectedProject !== 'all') {
      filteredReports = filteredReports.filter(r => toNumber(r.project_id) === Number(selectedProject));
      filteredPayments = filteredPayments.filter(p => toNumber(p.project_id) === Number(selectedProject));
    }

    const projectMap = new Map<number, { project: string; projectId: number; settlement: number; payment: number; unpaid: number }>();

    filteredReports.forEach(r => {
      const pid = toNumber(r.project_id);
      const project = projects.find(p => p.id === pid);
      const name = project?.name || `项目${pid}`;
      const existing = projectMap.get(pid) || { project: name, projectId: pid, settlement: 0, payment: 0, unpaid: 0 };
      existing.settlement += toNumber(r.invoice_amount || r.settlement_amount || r.report_amount);
      projectMap.set(pid, existing);
    });

    filteredPayments.forEach(p => {
      const pid = toNumber(p.project_id);
      const project = projects.find(p => p.id === pid);
      const name = project?.name || `项目${pid}`;
      const existing = projectMap.get(pid) || { project: name, projectId: pid, settlement: 0, payment: 0, unpaid: 0 };
      existing.payment += toNumber(p.payment_amount);
      projectMap.set(pid, existing);
    });

    projectMap.forEach(item => {
      item.unpaid = item.settlement - item.payment;
    });

    return Array.from(projectMap.values()).sort((a, b) => b.settlement - a.settlement);
  }, [clientReports, clientPayments, projects, selectedProject]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">加载中...</div>
      </div>
    );
  }

  const filterSection = (
    <div className="mobile-filter-grid sm:flex sm:flex-wrap sm:items-center sm:gap-3">
      <Select value={selectedProject} onValueChange={setSelectedProject}>
        <SelectTrigger className="w-full sm:w-48">
          <SelectValue placeholder="选择项目" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">全部项目</SelectItem>
          {projects.map(project => (
            <SelectItem key={project.id} value={String(project.id)}>
              {project.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="text-sm text-muted-foreground sm:w-auto">
        报量 {stats.settlementCount} 笔，付款 {stats.paymentCount} 笔
      </span>
      <button
        onClick={loadData}
        className="flex w-full items-center justify-center gap-2 rounded-md bg-primary/10 px-3 py-2 text-sm text-primary transition-colors hover:bg-primary/20 sm:ml-auto sm:w-auto"
      >
        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        刷新
      </button>
    </div>
  );

  const kpiSection = (
    <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-4">
      <KpiCard label="开票金额(应收)" value={stats.totalSettlement} amountMode scope={`${stats.settlementCount}笔报量`} />
      <KpiCard label="已收金额" value={stats.totalPayment} amountMode scope={`${stats.paymentCount}笔回款`} />
      <KpiCard label="未收金额" value={stats.totalUnpaid} amountMode risk={stats.totalUnpaid > 0 ? 'warning' : 'normal'} scope={stats.totalUnpaid > 0 ? '待回款' : '已全部回款'} />
      <KpiCard label="超收/预收" value={stats.overPayment} amountMode risk={stats.overPayment > 0 ? 'danger' : 'normal'} scope={stats.overPayment > 0 ? '回款超结算' : '暂无超收'} />
      <KpiCard label="回款率" value={stats.avgPaymentRate} percentMode risk={stats.avgPaymentRate > 100 ? 'danger' : stats.avgPaymentRate >= 80 ? 'normal' : 'warning'} />
      <KpiCard label="已支付" value={stats.totalCashOut} amountMode scope={`付款率 ${stats.avgPayablePaymentRate.toFixed(1)}%`} />
      <KpiCard label="应付未付" value={stats.totalPayable} amountMode risk={stats.totalPayable > 0 ? 'warning' : 'normal'} scope={stats.totalPayable > 0 ? '待付款' : '暂无应付'} />
      <KpiCard label="资金缺口" value={stats.fundingGap} amountMode risk={stats.fundingGap > 0 ? 'danger' : 'normal'} scope={stats.netCashFlow < 0 ? `净流出 ${formatCurrency(Math.abs(stats.netCashFlow))}` : `净流入 ${formatCurrency(stats.netCashFlow)}`} />
    </div>
  );

  const chartSection = (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <ChartCard title="回款占比" unit="元">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieChartData.filter(d => d.value > 0)}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={90}
                paddingAngle={2}
                dataKey="value"
                label={({ name, percent }: { name: string; percent: number }) => `${name} ${(percent * 100).toFixed(1)}%`}
              >
                {pieChartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip formatter={(value: number) => formatCurrency(value)} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 flex flex-wrap justify-center gap-3 sm:gap-6">
          {pieChartData.map((item, index) => (
            <div key={index} className="flex min-w-0 items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
              <span className="truncate text-sm text-muted-foreground">{item.name}: {formatCurrency(item.value)}</span>
            </div>
          ))}
        </div>
      </ChartCard>

      <ChartCard title="各项目结算与付款对比" unit="元">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={projectComparisonData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" tickFormatter={(v: number) => formatCurrency(v)} />
              <YAxis type="category" dataKey="name" width={80} fontSize={12} />
              <Tooltip formatter={(value: number) => formatCurrency(value)} />
              <Legend />
              <Bar dataKey="payment" name="已付款" fill="#10b981" radius={[0, 4, 4, 0]} />
              <Bar dataKey="unpaid" name="未付款" fill="#ef4444" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      <ChartCard title="月度结算与付款趋势" unit="元" className="lg:col-span-2">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={monthlyTrendData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" fontSize={12} />
              <YAxis tickFormatter={(v: number) => formatCurrency(v)} fontSize={12} />
              <Tooltip formatter={(value: number) => formatCurrency(value)} />
              <Legend />
              <Line type="monotone" dataKey="settlement" name="开票金额" stroke="#8b5cf6" strokeWidth={2} dot={{ fill: '#8b5cf6' }} />
              <Line type="monotone" dataKey="payment" name="付款金额" stroke="#10b981" strokeWidth={2} dot={{ fill: '#10b981' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>
    </div>
  );

  const ledgerSection = (
    <CollapsibleSection title="项目结算付款明细" icon="file-text" defaultOpen={true}>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left py-3 px-2 font-medium">项目名称</th>
              <th className="text-right py-3 px-2 font-medium">开票金额(应收)</th>
              <th className="text-right py-3 px-2 font-medium">已付款</th>
              <th className="text-right py-3 px-2 font-medium">未付款</th>
              <th className="text-right py-3 px-2 font-medium">回款率</th>
              <th className="text-center py-3 px-2 font-medium">状态</th>
            </tr>
          </thead>
          <tbody>
            {tableData.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-8 text-muted-foreground">
                  暂无数据
                </td>
              </tr>
            ) : (
              tableData.map((row, index) => {
                const paymentRate = row.settlement > 0 ? (row.payment / row.settlement) * 100 : 0;
                return (
                  <tr key={index} className="border-b hover:bg-muted/50">
                    <td className="py-3 px-2">
                      <LinkableCell href={`/projects/${row.projectId}`}>
                        {row.project}
                      </LinkableCell>
                    </td>
                    <td className="text-right py-3 px-2">{formatCurrency(row.settlement)}</td>
                    <td className="text-right py-3 px-2 text-green-600">{formatCurrency(row.payment)}</td>
                    <td className={`text-right py-3 px-2 ${row.unpaid > 0 ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                      {formatCurrency(row.unpaid)}
                    </td>
                    <td className="text-right py-3 px-2">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 bg-gray-200 rounded-full h-1.5">
                          <div
                            className={`h-1.5 rounded-full ${paymentRate >= 100 ? 'bg-green-500' : paymentRate >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                            style={{ width: `${Math.min(paymentRate, 100)}%` }}
                          />
                        </div>
                        <span>{paymentRate.toFixed(1)}%</span>
                      </div>
                    </td>
                    <td className="text-center py-3 px-2">
                      {row.unpaid <= 0 ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs">
                          <CheckCircle className="h-3 w-3" />
                          已结清
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs">
                          <AlertTriangle className="h-3 w-3" />
                          欠款
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          {tableData.length > 0 && (
            <tfoot>
              <tr className="font-bold bg-muted/50">
                <td className="py-3 px-2">合计</td>
                <td className="text-right py-3 px-2">{formatCurrency(stats.totalSettlement)}</td>
                <td className="text-right py-3 px-2 text-green-600">{formatCurrency(stats.totalPayment)}</td>
                <td className={`text-right py-3 px-2 ${stats.totalUnpaid > 0 ? 'text-red-600' : 'text-gray-500'}`}>
                  {formatCurrency(stats.totalUnpaid)}
                </td>
                <td className="text-right py-3 px-2">{stats.avgPaymentRate.toFixed(1)}%</td>
                <td className="text-center py-3 px-2">-</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <div className="space-y-3 md:hidden">
        {tableData.length === 0 ? (
          <div className="rounded-lg border bg-white p-6 text-center text-sm text-muted-foreground">
            暂无数据
          </div>
        ) : (
          tableData.map((row, index) => {
            const paymentRate = row.settlement > 0 ? (row.payment / row.settlement) * 100 : 0;
            return (
              <div key={`mobile-fund-${index}`} className="rounded-lg border bg-white p-3 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <LinkableCell href={`/projects/${row.projectId}`}>
                      {row.project}
                    </LinkableCell>
                    <div className="mt-1 text-xs text-muted-foreground">回款率 {paymentRate.toFixed(1)}%</div>
                  </div>
                  {row.unpaid <= 0 ? (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-green-100 px-2 py-1 text-xs text-green-700">
                      <CheckCircle className="h-3 w-3" />
                      已结清
                    </span>
                  ) : (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-100 px-2 py-1 text-xs text-red-700">
                      <AlertTriangle className="h-3 w-3" />
                      欠款
                    </span>
                  )}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded bg-purple-50 p-2">
                    <div className="text-purple-600">开票金额</div>
                    <div className="mt-1 font-semibold text-purple-700">{formatCurrency(row.settlement)}</div>
                  </div>
                  <div className="rounded bg-green-50 p-2">
                    <div className="text-green-600">已付款</div>
                    <div className="mt-1 font-semibold text-green-700">{formatCurrency(row.payment)}</div>
                  </div>
                  <div className="rounded bg-red-50 p-2">
                    <div className="text-red-600">未付款</div>
                    <div className="mt-1 font-semibold text-red-700">{formatCurrency(row.unpaid)}</div>
                  </div>
                  <div className="rounded bg-slate-50 p-2">
                    <div className="text-gray-500">状态</div>
                    <div className="mt-1 font-semibold">{row.unpaid <= 0 ? '已结清' : '待回款'}</div>
                  </div>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-gray-200">
                  <div
                    className={`h-full rounded-full ${paymentRate >= 100 ? 'bg-green-500' : paymentRate >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                    style={{ width: `${Math.min(paymentRate, 100)}%` }}
                  />
                </div>
              </div>
            );
          })
        )}
        {tableData.length > 0 && (
          <div className="rounded-lg border bg-muted/30 p-3 text-sm font-medium">
            <div className="flex justify-between"><span>合计开票</span><span>{formatCurrency(stats.totalSettlement)}</span></div>
            <div className="mt-2 flex justify-between text-green-600"><span>已付款</span><span>{formatCurrency(stats.totalPayment)}</span></div>
            <div className="mt-2 flex justify-between text-red-600"><span>未付款</span><span>{formatCurrency(stats.totalUnpaid)}</span></div>
          </div>
        )}
      </div>
    </CollapsibleSection>
  );

  return (
    <StandardDashboardLayout
      title="甲方资金管理看板"
      filterBar={filterSection}
      kpiSection={kpiSection}
      chartSection={chartSection}
      ledgerSection={ledgerSection}
    />
  );
}
