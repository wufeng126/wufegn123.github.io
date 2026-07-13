'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useAutoRefresh } from '@/hooks/use-auto-refresh';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { 
  Users, BarChart3, FileText, DollarSign, ArrowRight, AlertTriangle, 
  Building2, TrendingUp, CreditCard, HardHat,
  ClipboardList, Calendar, Wallet, Receipt, Zap, FileSpreadsheet,
  Clock, RefreshCw, ChevronRight, Target, CheckCircle2, Filter,
  AlertCircle, Bell, PieChart as PieChartIcon, LineChart as LineChartIcon,
  Activity, FilePlus, UserPlus, AlertOctagon, TrendingDown,
  ShieldCheck, UsersRound, Package, Wrench, FolderOpen, BarChart2,
  Tag, Download, CalendarDays, ArrowUpRight, ArrowDownRight, Info,
  PenSquare, 
  FileCheck, ListTodo, Timer, CircleDot, Kanban, Gauge,
} from 'lucide-react';
import EChartsWrapper, { CHART_COLORS } from '@/components/charts/echarts-wrapper';
import { AmountDisplay, StatusTag, KpiCard, formatAmountSmart, formatPercent, formatAmount } from '@/components/business/common';

interface ProjectDetail {
  id: number;
  name: string;
  status: string;
  year: number;
  address: string | null;
  partner: string | null;
  contractAmount: number;
  budgetAmount: number;
  reportedAmount: number;
  settledAmount: number;
  currentMonthReport: number;
  currentMonthSettlement: number;
  remainingReport: number;
  remainingSettlement: number;
  reportPercent: number;
  settlementPercent: number;
  isOverBudget: boolean;
  visaAmount: number;
}

interface ProjectCostItem {
  id: number;
  name: string;
  income: number;
  cost: number;
  profit: number;
  profitRate: number;
  receivableAmount?: number;
  totalPayableAmount?: number;
  cashOutAmount?: number;
  netCashFlow?: number;
  fundingGapAmount?: number;
  paymentRate?: number;
  payablePaymentRate?: number;
  costIncomeRate?: number;
}

interface DashboardStats {
  projectCount: number;
  activeProjectCount: number;
  workerCount: number;
  inServiceCount: number;
  leftCount: number;
  totalBudgetAmount: string;
  totalReportedAmount: string;
  totalSettledAmount: string;
  currentMonth: string;
  currentMonthReportAmount: string;
  currentMonthSettlementAmount: string;
  currentMonthClientReportAmount: string;
  differenceAmount: string;
  reportPercent: string;
  settlementPercent: string;
  quantityWarnings: number;
  progressWarnings: number;
  totalWarnings: number;
  totalMeasurementAmount: string;
  totalPaid: string;
  pendingPayment?: string;
  receivableAmount?: string;
  supplierPayableAmount?: string;
  workerPayableAmount?: string;
  totalPayableAmount?: string;
  supplierPaidAmount?: string;
  workerPaidAmount?: string;
  cashOutAmount?: string;
  netCashFlow?: string;
  fundingGapAmount?: string;
  paymentRate?: string;
  payablePaymentRate?: string;
  costIncomeRate?: string;
  totalVisaCount: number;
  completedVisaCount: number;
  pendingVisaCount: number;
  totalVisaAmount: string;
  certificateTotal: number;
  certificateExpiring: number;
  certificateExpired: number;
  projectDetails: ProjectDetail[];
  activeProjects: { id: number; name: string; status: string }[];
  lastUpdated: string;
  warnings?: {
    remainingQuantity: { isWarning: boolean; percent?: string; message: string | null };
    costOverrun: { isWarning: boolean; amount?: string; message: string | null };
    pendingPayment: { isWarning: boolean; amount?: string; percent?: string; message: string | null };
    fundingGap?: { isWarning: boolean; amount?: string; message: string | null };
  };
  costData?: {
    totalCost: string;
    totalProfit: string;
    profitRate: string;
    supplierCost: string;
    salaryCost: string;
    expenseCost: string;
    taxCost: string;
    miscMaterialCost: string;
  };
  trendData?: Array<{
    month: string;
    income: number;
    cost: number;
    output: number;
    payment: number;
  }>;
  costComposition?: Array<{
    name: string;
    value: number;
    color: string;
  }>;
  projectCostData?: ProjectCostItem[];
  kpiChanges?: {
    incomeChange: string;
    costChange: string;
    profitChange: string;
    projectChange: string;
  };
  expiringProjects?: Array<{
    id: number;
    name: string;
    expected_completion_date: string;
    daysRemaining: number;
  }>;
  unpaidSalaryStats?: {
    count: number;
    amount: string;
  };
}

interface UserInfo {
  id: number;
  username: string;
  name: string;
  role: string;
}

type TimeRange = 'month' | 'quarter' | 'year';

export default function HomePage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [showContent, setShowContent] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all');
  const [timeRange, setTimeRange] = useState<TimeRange>('month');

  useEffect(() => { fetchStats(); fetchUser(); }, []);

  useEffect(() => {
    if (!loading) fetchStats();
  }, [selectedProjectId, timeRange]);

  useAutoRefresh(async () => {
    if (!loading) await fetchStats();
  }, { enableOnFocus: true });

  useEffect(() => {
    if (!loading) {
      const timer = setTimeout(() => setShowContent(true), 50);
      return () => clearTimeout(timer);
    }
  }, [loading]);

  const [error, setError] = useState<string | null>(null);

  const fetchStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const params = new URLSearchParams();
      if (selectedProjectId && selectedProjectId !== 'all') {
        params.set('project_id', selectedProjectId);
      }
      params.set('time_range', timeRange);
      const url = `/api/dashboard?${params.toString()}`;
      const res = await fetch(url, { credentials: 'include', signal: controller.signal });
      clearTimeout(timeoutId);
      if (!res.ok) throw new Error(`服务器错误 (${res.status})`);
      const data = await res.json();
      setStats(data);
    } catch (err) {
      console.error("数据加载失败:", err);
      if (err instanceof DOMException && err.name === 'AbortError') {
        setError('数据加载超时，请检查网络后重试');
      } else {
        setError('数据加载失败，请刷新重试');
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchUser = async () => {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      const data = await res.json();
      if (data.authenticated && data.user) setUser(data.user);
    } catch (err) {
      console.error("用户信息加载失败:", err);
    }
  };

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  const fmt = (value: string | number, decimals: number = 2) => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(num) || num === 0) return '0.00';
    return (num / 10000).toFixed(decimals);
  };

  const selectedProjectName = useMemo(() => {
    if (selectedProjectId === 'all') return '全部项目';
    const project = stats?.projectDetails?.find(p => p.id === parseInt(selectedProjectId));
    return project?.name || '未知项目';
  }, [stats, selectedProjectId]);

  // 待办事项 - 基于业务数据生成
  const todoItems = useMemo(() => {
    if (!stats) return [];
    const items: { title: string; desc: string; href: string; level: 'danger' | 'warning' | 'info'; icon: React.ElementType }[] = [];

    if (stats.certificateExpired > 0) {
      items.push({ title: `${stats.certificateExpired}个证件已过期`, desc: '请立即处理过期证件', href: '/certificates?status=expired', level: 'danger', icon: AlertOctagon });
    }
    if (stats.certificateExpiring > 0) {
      items.push({ title: `${stats.certificateExpiring}个证件即将到期`, desc: '30天内到期的证件需要续期', href: '/certificates?status=expiring', level: 'warning', icon: Clock });
    }
    const pendingAmount = parseFloat(stats.pendingPayment || '0');
    if (pendingAmount > 0) {
      items.push({ title: `待回款 ${fmt(pendingAmount)} 万元`, desc: '甲方付款尚未到账', href: '/client-payments', level: pendingAmount > 100 ? 'danger' : 'warning', icon: Wallet });
    }
    const fundingGapAmount = parseFloat(stats.fundingGapAmount || stats.warnings?.fundingGap?.amount || '0');
    if (fundingGapAmount > 0) {
      items.push({
        title: `资金缺口 ${fmt(fundingGapAmount)} 万元`,
        desc: stats.warnings?.fundingGap?.message || '应收不足以覆盖当前应付，需安排回款和付款计划',
        href: '/data-board/fund-management',
        level: 'danger',
        icon: AlertTriangle,
      });
    }
    if (stats.warnings?.costOverrun?.isWarning) {
      items.push({ title: '成本超支预警', desc: stats.warnings.costOverrun.message || '对下结算超过对上报量', href: '/cost-center', level: 'danger', icon: TrendingDown });
    }
    if (stats.pendingVisaCount > 0) {
      items.push({ title: `${stats.pendingVisaCount}个签证待审批`, desc: '签证流程需要推进', href: '/visas', level: 'info', icon: FileCheck });
    }
    // 未发放工资提醒
    if (stats.unpaidSalaryStats && stats.unpaidSalaryStats.count > 0) {
      items.push({
        title: `${stats.unpaidSalaryStats.count}笔工资未发放`,
        desc: `合计 ¥${parseFloat(stats.unpaidSalaryStats.amount).toLocaleString('zh-CN', { maximumFractionDigits: 0 })}`,
        href: '/workers/salaries',
        level: 'warning',
        icon: Users,
      });
    }
    // 即将到期项目提醒
    if (stats.expiringProjects && stats.expiringProjects.length > 0) {
      items.push({
        title: `${stats.expiringProjects.length}个项目即将完工`,
        desc: stats.expiringProjects.map((p: any) => p.name).join('、'),
        href: '/projects',
        level: 'info',
        icon: Calendar,
      });
    }
    return items;
  }, [stats]);

  // 异常提醒
  const riskWarnings = useMemo(() => {
    if (!stats) return [];
    const warnings: any[] = [];
    const pendingAmount = parseFloat(stats.pendingPayment || '0');
    const totalAmount = parseFloat(stats.totalMeasurementAmount || '0');
    if (totalAmount > 0 && (pendingAmount / totalAmount) > 0.3) {
      warnings.push({
        type: 'payment', level: pendingAmount / totalAmount > 0.5 ? 'danger' : 'warning',
        title: '待回款过高', value: fmt(pendingAmount) + '万元',
        message: `待回款占比超过${((pendingAmount / totalAmount) * 100).toFixed(0)}%`,
        href: '/client-payments', icon: AlertTriangle,
      });
    }
    if (stats.warnings?.costOverrun?.isWarning) {
      warnings.push({
        type: 'cost', level: 'danger', title: '成本超支',
        value: fmt(stats.warnings.costOverrun.amount || '0') + '万元',
        message: stats.warnings.costOverrun.message || '对下结算超过对上报量',
        href: '/cost-center', icon: TrendingDown,
      });
    }
    const fundingGapWarningAmount = parseFloat(stats.fundingGapAmount || stats.warnings?.fundingGap?.amount || '0');
    if (fundingGapWarningAmount > 0) {
      warnings.push({
        type: 'funding-gap',
        level: 'danger',
        title: '资金缺口',
        value: fmt(fundingGapWarningAmount) + '万元',
        message: stats.warnings?.fundingGap?.message || '应收不足以覆盖当前应付',
        href: '/data-board/fund-management',
        icon: AlertTriangle,
      });
    }
    if (stats.certificateExpired > 0) {
      warnings.push({
        type: 'certificate', level: 'danger', title: '证件过期', value: stats.certificateExpired + '个',
        message: `${stats.certificateExpired}个证件已过期`, href: '/certificates?status=expired', icon: AlertOctagon,
      });
    }
    return warnings;
  }, [stats]);

  // ========== ECharts 配置 ==========

  // 收入/成本对比柱状图
  const incomeCostBarOption = useMemo(() => {
    const data = stats?.projectCostData?.slice(0, 6) || [];
    if (data.length === 0) return {};
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (params: any) => {
        let html = `<div style="font-weight:600;margin-bottom:4px">${params[0].axisValue}</div>`;
        params.forEach((p: any) => { html += `<div style="display:flex;align-items:center;gap:4px;margin:2px 0"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${p.color}"></span><span>${p.seriesName}：</span><span style="font-weight:600">${(p.value / 10000).toFixed(2)}万元</span></div>`; });
        const income = params.find((p: any) => p.seriesName === '收入')?.value || 0;
        const cost = params.find((p: any) => p.seriesName === '成本')?.value || 0;
        const profit = income - cost;
        html += `<div style="border-top:1px solid rgba(0,0,0,0.06);margin-top:4px;padding-top:4px;font-weight:600;color:${profit >= 0 ? '#00B42A' : '#F53F3F'}">利润：${(profit / 10000).toFixed(2)}万元</div>`;
        return html;
      }},
      legend: { data: ['收入', '成本'], top: 0, right: 0, itemWidth: 12, itemHeight: 12, textStyle: { fontSize: 11, color: '#8A8F98' } },
      grid: { left: 10, right: 10, top: 30, bottom: 5, containLabel: true },
      xAxis: { type: 'category', data: data.map(d => d.name.length > 6 ? d.name.slice(0, 6) + '…' : d.name), axisLabel: { fontSize: 10, color: '#8A8F98', rotate: data.length > 4 ? 20 : 0 }, axisTick: { show: false }, axisLine: { lineStyle: { color: 'rgba(0,0,0,0.06)' } } },
      yAxis: { type: 'value', axisLabel: { fontSize: 10, color: '#8A8F98', formatter: (v: number) => (v / 10000).toFixed(0) + '万' }, splitLine: { lineStyle: { color: 'rgba(0,0,0,0.04)', type: 'dashed' } }, axisLine: { show: false }, axisTick: { show: false } },
      series: [
        { name: '收入', type: 'bar', barWidth: '30%', data: data.map(d => d.income), itemStyle: { color: CHART_COLORS.primary, borderRadius: [4, 4, 0, 0] }, animationDelay: (idx: number) => idx * 80 },
        { name: '成本', type: 'bar', barWidth: '30%', data: data.map(d => d.cost), itemStyle: { color: CHART_COLORS.warning, borderRadius: [4, 4, 0, 0] }, animationDelay: (idx: number) => idx * 80 + 40 },
      ],
      animationEasing: 'elasticOut', animationDuration: 1200,
    };
  }, [stats?.projectCostData]);

  // 月度趋势
  const trendLineOption = useMemo(() => {
    const data = stats?.trendData || [];
    if (data.length === 0) return {};
    const filteredData = timeRange === 'month' ? data.slice(-6) : timeRange === 'quarter' ? data.slice(-3) : data;
    return {
      tooltip: { trigger: 'axis', formatter: (params: any) => {
        let html = `<div style="font-weight:600;margin-bottom:4px">${params[0].axisValue}</div>`;
        params.forEach((p: any) => { html += `<div style="display:flex;align-items:center;gap:4px;margin:2px 0"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${p.color}"></span><span>${p.seriesName}：</span><span style="font-weight:600">${(p.value / 10000).toFixed(2)}万元</span></div>`; });
        return html;
      }},
      legend: { data: ['收入', '成本'], top: 0, right: 0, itemWidth: 12, itemHeight: 12, textStyle: { fontSize: 11, color: '#8A8F98' } },
      grid: { left: 10, right: 10, top: 30, bottom: 5, containLabel: true },
      xAxis: { type: 'category', data: filteredData.map(d => d.month.substring(5) + '月'), axisLabel: { fontSize: 11, color: '#8A8F98' }, axisTick: { show: false }, axisLine: { lineStyle: { color: 'rgba(0,0,0,0.06)' } }, boundaryGap: false },
      yAxis: { type: 'value', axisLabel: { fontSize: 10, color: '#8A8F98', formatter: (v: number) => (v / 10000).toFixed(0) + '万' }, splitLine: { lineStyle: { color: 'rgba(0,0,0,0.04)', type: 'dashed' } }, axisLine: { show: false }, axisTick: { show: false } },
      series: [
        { name: '收入', type: 'line', smooth: true, symbol: 'circle', symbolSize: 6, data: filteredData.map(d => d.income), lineStyle: { width: 2.5, color: CHART_COLORS.success }, itemStyle: { color: CHART_COLORS.success }, areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(0,180,42,0.25)' }, { offset: 1, color: 'rgba(0,180,42,0.02)' }] } }, animationDuration: 1500 },
        { name: '成本', type: 'line', smooth: true, symbol: 'circle', symbolSize: 6, data: filteredData.map(d => d.cost), lineStyle: { width: 2.5, color: CHART_COLORS.danger }, itemStyle: { color: CHART_COLORS.danger }, areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(245,63,63,0.15)' }, { offset: 1, color: 'rgba(245,63,63,0.02)' }] } }, animationDuration: 1500 },
      ],
    };
  }, [stats?.trendData, timeRange]);

  // 回款环形图
  const paymentRingOption = useMemo(() => {
    const paid = parseFloat(stats?.totalPaid || '0');
    const pending = parseFloat(stats?.pendingPayment || '0');
    const total = paid + pending;
    if (total === 0) return {};
    const paidPercent = (paid / total * 100).toFixed(1);
    return {
      series: [{
        type: 'pie', radius: ['50%', '72%'], center: ['50%', '45%'],
        avoidLabelOverlap: true, itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
        label: { show: false }, emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.1)' } },
        data: [
          { name: '已回款', value: paid, itemStyle: { color: '#722ED1' } },
          { name: '待回款', value: pending, itemStyle: { color: 'rgba(0,0,0,0.06)' } },
        ],
        animationType: 'scale', animationDuration: 1000,
      }],
      graphic: [
        { type: 'text', left: 'center', top: '35%', style: { text: `${paidPercent}%`, fontSize: 16, fontWeight: 'bold', fill: '#722ED1', textAlign: 'center' } },
        { type: 'text', left: 'center', top: '48%', style: { text: '回款率', fontSize: 9, fill: '#8A8F98', textAlign: 'center' } },
      ],
    };
  }, [stats?.totalPaid, stats?.pendingPayment]);

  const exportChart = useCallback((chartId: string, filename: string) => {
    const dom = document.querySelector(`[data-chart-id="${chartId}"]`);
    if (!dom) return;
    const canvas = dom.querySelector('canvas');
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `${filename}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }, []);

  // ========== 骨架屏 ==========
  if (loading) {
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <Skeleton className="w-48 h-6" />
          <div className="flex gap-3"><Skeleton className="w-40 h-9 rounded-lg" /><Skeleton className="w-20 h-9 rounded-lg" /></div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!stats) {
    // 即使数据加载失败，也显示UI布局（填入空数据方便预览）
    return (
      <TooltipProvider>
        <div className="..." style={{ background: '#F5F6FA', minHeight: '100%', padding: '16px 20px' }}>
          <div className="mx-auto" style={{ maxWidth: 1400 }}>
            {/* 错误提示条 */}
            <div className="flex items-center gap-2 p-3 mb-4 rounded-lg" style={{ background: '#FFF7E6', border: '1px solid #FFD591' }}>
              <AlertCircle className="w-4 h-4 shrink-0" style={{ color: '#FA8C16' }} />
              <p className="text-sm" style={{ color: '#D46B08' }}>{error || '数据加载失败，部分内容可能不可用'}</p>
              <button onClick={fetchStats} className="ml-auto text-xs font-medium px-3 py-1 rounded" style={{ background: '#FA8C16', color: 'white' }}>重试</button>
            </div>
            {/* 快捷入口 */}
            <div className={`grid grid-cols-4 md:grid-cols-8 gap-2`}>
              {[
                { title: '施工日志', href: '/construction-logs', icon: ClipboardList, color: '#13C2C2' },
                { title: '写知识', href: '/knowledge/new', icon: PenSquare, color: '#F7BA1E' },
                { title: '新增项目', href: '/projects', icon: FolderOpen, color: '#165DFF' },
                { title: '花名册', href: '/workers/roster', icon: UsersRound, color: '#00B42A' },
                { title: '工程量', href: '/work-items', icon: BarChart2, color: '#722ED1' },
                { title: '报量', href: '/client-reports', icon: FileText, color: '#FF7D00' },
                { title: '回款', href: '/client-payments', icon: CreditCard, color: '#722ED1' },
                { title: '月度工资', href: '/workers/salaries', icon: Receipt, color: '#13C2C2' },
                { title: '证件', href: '/certificates', icon: ShieldCheck, color: '#F7BA1E' },
                { title: '通知', href: '/notifications', icon: Bell, color: '#EB2F96' },
              ].map((link, i) => (
                <Link key={i} href={link.href}
                  className="flex flex-col items-center gap-1.5 p-3 rounded-lg bg-white transition-all duration-200 hover:shadow-md hover:-translate-y-0.5"
                  style={{ border: '1px solid rgba(0,0,0,0.06)' }}>
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: `${link.color}10` }}>
                    <link.icon className="w-4.5 h-4.5" style={{ color: link.color }} />
                  </div>
                  <span className="text-xs font-medium" style={{ color: '#171717' }}>{link.title}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
    <div className="space-y-5">
      {/* ========== 顶部：项目筛选 + 操作 ========== */}
      <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all duration-500 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold" style={{ color: '#171717' }}>业务工作台</h1>
          {stats.lastUpdated && (
            <span className="text-xs" style={{ color: '#C9CDD4' }}>更新于 {formatTime(stats.lastUpdated)}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* 时间筛选 */}
          <div className="flex rounded-md overflow-hidden" style={{ border: '1px solid rgba(0,0,0,0.06)' }}>
            {([
              { key: 'month', label: '本月' },
              { key: 'quarter', label: '本季' },
              { key: 'year', label: '本年' },
            ] as const).map(t => (
              <button key={t.key} onClick={() => setTimeRange(t.key)}
                className="px-3 py-1.5 text-xs font-medium transition-colors"
                style={{ background: timeRange === t.key ? '#165DFF' : 'transparent', color: timeRange === t.key ? '#fff' : '#8A8F98' }}>
                {t.label}
              </button>
            ))}
          </div>
          {/* 项目筛选 */}
          <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
            <SelectTrigger className="w-[160px] h-8 text-sm" style={{ border: '1px solid rgba(0,0,0,0.06)', background: '#FFF' }}>
              <Building2 className="w-3.5 h-3.5 mr-1" style={{ color: '#8A8F98' }} />
              <SelectValue placeholder="选择项目" />
            </SelectTrigger>
            <SelectContent className="bg-white">
              <SelectItem value="all"><span className="font-medium">全部项目</span></SelectItem>
              {stats.projectDetails.slice(0, 10).map((project) => (
                <SelectItem key={project.id} value={project.id.toString()}>
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${project.status === '进行中' ? 'bg-blue-500' : project.status === '已完成' ? 'bg-green-500' : 'bg-gray-400'}`} />
                    <span>{project.name}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button onClick={fetchStats} className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs transition-colors hover:bg-gray-50" style={{ color: '#8A8F98', border: '1px solid rgba(0,0,0,0.06)' }}>
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ========== 待办/预警事项（重点） ========== */}
      <div className={`transition-all duration-500 delay-100 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0'}`}>
        <div className="flex items-center gap-2 mb-3">
          <ListTodo className="w-4.5 h-4.5" style={{ color: '#FF7D00' }} />
          <h2 className="text-sm font-semibold" style={{ color: '#171717' }}>待办事项</h2>
          {todoItems.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: '#FF7D0010', color: '#FF7D00' }}>{todoItems.length}</span>
          )}
        </div>
        {todoItems.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {todoItems.map((item, i) => (
              <Link key={i} href={item.href}
                className="flex items-start gap-3 px-4 py-3.5 rounded-xl transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 group"
                style={{
                  background: item.level === 'danger' ? '#FFF7F0' : item.level === 'warning' ? '#FFFBF0' : '#F7F8FA',
                  border: `1px solid ${item.level === 'danger' ? '#F53F3F20' : item.level === 'warning' ? '#FF7D0020' : 'rgba(0,0,0,0.06)'}`
                }}>
                <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{ background: item.level === 'danger' ? '#F53F3F10' : item.level === 'warning' ? '#FF7D0010' : '#165DFF10' }}>
                  <item.icon className="w-4.5 h-4.5" style={{ color: item.level === 'danger' ? '#F53F3F' : item.level === 'warning' ? '#FF7D00' : '#165DFF' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium group-hover:text-blue-600 transition-colors truncate"
                    style={{ color: item.level === 'danger' ? '#F53F3F' : item.level === 'warning' ? '#FF7D00' : '#171717' }}>
                    {item.title}
                  </p>
                  <p className="text-xs mt-0.5 truncate" style={{ color: '#8A8F98' }}>{item.desc}</p>
                </div>
                <ChevronRight className="w-4 h-4 flex-shrink-0 mt-2 group-hover:translate-x-0.5 transition-transform" style={{ color: '#C9CDD4' }} />
              </Link>
            ))}
          </div>
        ) : (
          <div className="py-8 text-center rounded-xl" style={{ background: '#F7F8FA', border: '1px solid rgba(0,0,0,0.06)' }}>
            <CheckCircle2 className="w-8 h-8 mx-auto mb-2" style={{ color: '#00B42A' }} />
            <p className="text-sm font-medium" style={{ color: '#171717' }}>暂无待办事项</p>
            <p className="text-xs mt-1" style={{ color: '#8A8F98' }}>所有业务处理正常</p>
          </div>
        )}
      </div>

      {/* ========== 三栏：项目概况 + 趋势图 + 回款/预警 ========== */}
      <div className={`grid grid-cols-1 lg:grid-cols-3 gap-4 transition-all duration-500 delay-200 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0'}`}>
        {/* 项目概况 */}
        <Card style={{ background: '#FFF', border: '1px solid rgba(0,0,0,0.06)' }}>
          <CardHeader className="pb-2 pt-3 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold" style={{ color: '#171717' }}>项目概况</CardTitle>
              <Link href="/projects" className="text-xs flex items-center gap-0.5 hover:underline" style={{ color: '#165DFF' }}>全部 <ChevronRight className="w-3 h-3" /></Link>
            </div>
          </CardHeader>
          <CardContent className="pt-1 pb-3 px-4">
            <div className="grid grid-cols-3 gap-3 mb-4 pb-3 border-b" style={{ borderColor: 'rgba(0,0,0,0.04)' }}>
              <div className="text-center">
                <p className="text-xl font-bold tabular-nums" style={{ color: '#165DFF' }}>{stats.activeProjectCount}</p>
                <p className="text-xs mt-0.5" style={{ color: '#8A8F98' }}>在建项目</p>
              </div>
              <div className="text-center">
                <p className="text-xl font-bold tabular-nums" style={{ color: '#00B42A' }}>{stats.inServiceCount}</p>
                <p className="text-xs mt-0.5" style={{ color: '#8A8F98' }}>在场工人</p>
              </div>
              <div className="text-center">
                <p className="text-xl font-bold tabular-nums" style={{ color: '#8A8F98' }}>{stats.leftCount}</p>
                <p className="text-xs mt-0.5" style={{ color: '#8A8F98' }}>退场工人</p>
              </div>
            </div>
            <div className="space-y-2.5">
              {stats.projectDetails.slice(0, 5).map(project => (
                <Link key={project.id} href={`/projects/${project.id}`} className="flex items-center justify-between group py-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${project.status === '进行中' ? 'bg-blue-500' : project.status === '已完成' ? 'bg-green-500' : 'bg-gray-400'}`} />
                    <span className="text-sm truncate group-hover:text-blue-600 transition-colors" style={{ color: '#171717' }}>{project.name}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs tabular-nums" style={{ color: '#8A8F98' }}>{fmt(project.reportedAmount)}万</span>
                    <ChevronRight className="w-3.5 h-3.5" style={{ color: '#C9CDD4' }} />
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* 月度趋势 */}
        <Card style={{ background: '#FFF', border: '1px solid rgba(0,0,0,0.06)' }}>
          <CardHeader className="pb-2 pt-3 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold" style={{ color: '#171717' }}>收支趋势<span className="text-xs font-normal ml-1" style={{ color: '#C9CDD4' }}>单位：万元</span></CardTitle>
              <button onClick={() => exportChart('trend', '月度趋势')} className="p-1 rounded hover:bg-gray-50" title="导出"><Download className="w-3.5 h-3.5" style={{ color: '#C9CDD4' }} /></button>
            </div>
          </CardHeader>
          <CardContent className="pt-1 pb-3 px-4">
            <div data-chart-id="trend" className="h-56">
              {stats?.trendData && stats.trendData.length > 0 ? (
                <EChartsWrapper option={trendLineOption} />
              ) : (
                <div className="h-full flex items-center justify-center text-xs" style={{ color: '#C9CDD4' }}>暂无趋势数据</div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 回款 + 预警 */}
        <div className="space-y-4">
          <Card style={{ background: '#FFF', border: '1px solid rgba(0,0,0,0.06)' }}>
            <CardHeader className="pb-1 pt-3 px-4">
              <CardTitle className="text-sm font-semibold" style={{ color: '#171717' }}>回款进度<span className="text-xs font-normal ml-1" style={{ color: '#C9CDD4' }}>单位：万元</span></CardTitle>
            </CardHeader>
            <CardContent className="pt-1 pb-3 px-4">
              <div data-chart-id="payment-ring" className="h-32">
                <EChartsWrapper option={paymentRingOption} />
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 pt-2 border-t" style={{ borderColor: 'rgba(0,0,0,0.04)' }}>
                <div className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: '#722ED1' }} />
                  <span className="text-xs whitespace-nowrap" style={{ color: '#8A8F98' }}>已回款</span>
                </div>
                <div className="text-sm font-bold tabular-nums text-right" style={{ color: '#722ED1' }}>{fmt(stats?.totalPaid || '0')}<span className="text-xs font-normal ml-0.5" style={{ color: '#C9CDD4' }}>万</span></div>
                <div className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: 'rgba(0,0,0,0.06)' }} />
                  <span className="text-xs whitespace-nowrap" style={{ color: '#8A8F98' }}>待回款</span>
                </div>
                <div className="text-sm font-bold tabular-nums text-right" style={{ color: '#FF7D00' }}>{fmt(stats?.pendingPayment || '0')}<span className="text-xs font-normal ml-0.5" style={{ color: '#C9CDD4' }}>万</span></div>
              </div>
            </CardContent>
          </Card>

          {/* 异常提醒 */}
          <Card style={{ background: '#FFF', border: '1px solid rgba(0,0,0,0.06)' }}>
            <CardHeader className="pb-1 pt-3 px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-1.5" style={{ color: '#171717' }}>
                  <AlertTriangle className="w-4 h-4" style={{ color: '#F53F3F' }} />
                  异常提醒
                </CardTitle>
                <Link href="/notifications" className="text-xs hover:underline" style={{ color: '#165DFF' }}>全部</Link>
              </div>
            </CardHeader>
            <CardContent className="pt-1 pb-3 px-4">
              {riskWarnings.length > 0 ? (
                <div className="space-y-2">
                  {riskWarnings.slice(0, 3).map((w: any, i: number) => (
                    <Link key={i} href={w.href} className="flex items-center gap-2 py-1.5 group">
                      <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: w.level === 'danger' ? '#F53F3F' : '#FF7D00' }} />
                      <span className="text-xs truncate flex-1 group-hover:text-blue-600 transition-colors" style={{ color: '#171717' }}>{w.title}</span>
                      <span className="text-xs font-medium tabular-nums" style={{ color: '#8A8F98' }}>{w.value}</span>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="py-4 text-center">
                  <CheckCircle2 className="w-6 h-6 mx-auto mb-1" style={{ color: '#00B42A' }} />
                  <p className="text-xs" style={{ color: '#8A8F98' }}>暂无异常</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ========== 收支对比 + 对上/对下 ========== */}
      <div className={`grid grid-cols-1 lg:grid-cols-3 gap-4 transition-all duration-500 delay-300 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0'}`}>
        {/* 各项目收入/成本对比 */}
        <Card className="lg:col-span-2" style={{ background: '#FFF', border: '1px solid rgba(0,0,0,0.06)' }}>
          <CardHeader className="pb-2 pt-3 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold" style={{ color: '#171717' }}>各项目收入/成本对比<span className="text-xs font-normal ml-1" style={{ color: '#C9CDD4' }}>单位：万元</span></CardTitle>
              <button onClick={() => exportChart('income-cost', '收入成本对比')} className="p-1 rounded hover:bg-gray-50" title="导出"><Download className="w-3.5 h-3.5" style={{ color: '#C9CDD4' }} /></button>
            </div>
          </CardHeader>
          <CardContent className="pt-1 pb-3 px-4">
            <div data-chart-id="income-cost" className="h-64">
              {stats?.projectCostData && stats.projectCostData.length > 0 ? (
                <EChartsWrapper option={incomeCostBarOption} />
              ) : (
                <div className="h-full flex items-center justify-center text-xs" style={{ color: '#C9CDD4' }}>暂无项目数据</div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 对上/对下核心数据 */}
        <Card style={{ background: '#FFF', border: '1px solid rgba(0,0,0,0.06)' }}>
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm font-semibold" style={{ color: '#171717' }}>对上/对下核心数据</CardTitle>
          </CardHeader>
          <CardContent className="pt-1 pb-3 px-4">
            <div className="space-y-4">
              {/* 对上报量 */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium" style={{ color: '#8A8F98' }}>对上报量</span>
                  <Link href="/client-reports" className="text-xs hover:underline" style={{ color: '#165DFF' }}>详情</Link>
                </div>
                <div className="flex items-baseline gap-1 mb-1.5">
                  <span className="text-lg font-bold tabular-nums" style={{ color: '#165DFF' }}>{fmt(stats.currentMonthReportAmount)}</span>
                  <span className="text-xs" style={{ color: '#C9CDD4' }}>万元/本月</span>
                </div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span style={{ color: '#8A8F98' }}>完成进度</span>
                  <span className="font-medium tabular-nums" style={{ color: parseFloat(stats.reportPercent || '0') > 100 ? '#F53F3F' : '#165DFF' }}>{stats.reportPercent || '0'}%</span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.04)' }}>
                  <div className="h-full rounded-full transition-all duration-500" style={{
                    width: `${Math.min(parseFloat(stats.reportPercent || '0'), 100)}%`,
                    background: parseFloat(stats.reportPercent || '0') > 100 ? '#F53F3F' : parseFloat(stats.reportPercent || '0') > 80 ? '#FF7D00' : '#165DFF',
                  }} />
                </div>
              </div>

              <div className="border-t" style={{ borderColor: 'rgba(0,0,0,0.04)' }} />

              {/* 对下结算 */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium" style={{ color: '#8A8F98' }}>对下结算</span>
                  <Link href="/work-items" className="text-xs hover:underline" style={{ color: '#722ED1' }}>详情</Link>
                </div>
                <div className="flex items-baseline gap-1 mb-1.5">
                  <span className="text-lg font-bold tabular-nums" style={{ color: '#722ED1' }}>{fmt(stats.currentMonthSettlementAmount)}</span>
                  <span className="text-xs" style={{ color: '#C9CDD4' }}>万元/本月</span>
                </div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span style={{ color: '#8A8F98' }}>完成进度</span>
                  <span className="font-medium tabular-nums" style={{ color: '#722ED1' }}>{stats.settlementPercent || '0'}%</span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.04)' }}>
                  <div className="h-full rounded-full transition-all duration-500" style={{
                    width: `${Math.min(parseFloat(stats.settlementPercent || '0'), 100)}%`,
                    background: '#722ED1',
                  }} />
                </div>
              </div>

              <div className="border-t" style={{ borderColor: 'rgba(0,0,0,0.04)' }} />

              {/* 差额 */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium" style={{ color: '#8A8F98' }}>对上对下差额</span>
                <span className="text-sm font-bold tabular-nums" style={{ color: parseFloat(stats.differenceAmount || '0') < 0 ? '#F53F3F' : '#00B42A' }}>
                  {fmt(stats.differenceAmount)}<span className="text-xs font-normal ml-0.5" style={{ color: '#C9CDD4' }}>万</span>
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ========== 快捷入口 ========== */}
      <div className={`grid grid-cols-4 md:grid-cols-8 gap-2 transition-all duration-500 delay-400 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0'}`}>
        {[
          { title: '施工日志', href: '/construction-logs', icon: ClipboardList, color: '#13C2C2' },
          { title: '写知识', href: '/knowledge/new', icon: PenSquare, color: '#F7BA1E' },
          { title: '新增项目', href: '/projects', icon: FolderOpen, color: '#165DFF' },
          { title: '花名册', href: '/workers/roster', icon: UsersRound, color: '#00B42A' },
          { title: '工程量', href: '/work-items', icon: BarChart2, color: '#722ED1' },
          { title: '报量', href: '/client-reports', icon: FileText, color: '#FF7D00' },
          { title: '回款', href: '/client-payments', icon: CreditCard, color: '#722ED1' },
          { title: '月度工资', href: '/workers/salaries', icon: Receipt, color: '#13C2C2' },
          { title: '证件', href: '/certificates', icon: ShieldCheck, color: '#F7BA1E' },
          { title: '通知', href: '/notifications', icon: Bell, color: '#EB2F96' },
        ].map((link, i) => (
          <Link key={i} href={link.href}
            className="flex flex-col items-center gap-1.5 p-3 rounded-lg bg-white transition-all duration-200 hover:shadow-md hover:-translate-y-0.5"
            style={{ border: '1px solid rgba(0,0,0,0.06)' }}>
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: `${link.color}10` }}>
              <link.icon className="w-4.5 h-4.5" style={{ color: link.color }} />
            </div>
            <span className="text-xs font-medium" style={{ color: '#171717' }}>{link.title}</span>
          </Link>
        ))}
      </div>
    </div>
    </TooltipProvider>
  );
}
