'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Download, FileText, Printer, History,
  Sparkles, RefreshCw, AlertTriangle, TrendingUp, TrendingDown,
  Minus, Eye, DollarSign, Users, Building2, Shield, Copy, Check,
  Package, CircleDollarSign, CreditCard, Clock, Info, Archive, GitCompare,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { KpiCard, ChartCard, RiskBadge, formatAmountSmart, formatPercent } from '@/components/business/common';
import EChartsWrapper from '@/components/charts/echarts-wrapper';
import { StandardDashboardLayout } from '@/components/dashboard/standard-layout';
import { CollapsibleSection } from '@/components/dashboard/collapsible-section';
import { HistoryArchiveDialog } from '@/components/dashboard/history-archive-dialog';
import { toast } from 'sonner';

// ─── Types ─────────────────────────────────────────────
interface Overview {
  projectCount: number;
  totalIncome: number; monthIncome: number;
  totalReceived: number; monthReceived: number;
  totalCost: number; monthCost: number;
  totalSalary: number; monthSalaryCost: number;
  totalSupplierCost: number; monthSupplierSettlement: number;
  totalExpense: number; monthExpenseCost: number;
  totalMaterialCost: number; monthMaterialCost: number;
  totalTaxCost: number; monthTaxCost: number;
  totalVisa: number; monthVisa: number; cumulativeVisa: number;
  profit: number; profitRate: number;
  cumulativeIncome: number; cumulativeCost: number;
  cumulativeProfit: number; cumulativeProfitRate: number;
  unreceived: number; overReceived: number; paymentRate: number;
  inServiceCount: number; totalSalaryPaid: number; totalUnpaidSalary: number;
  totalSupplierPayable: number; totalSupplierPaid: number; totalSupplierUnpaid: number;
  monthSupplierPayments: number; monthActualPayment: number;
  cumulativeSupplierSettlement: number; cumulativeSupplierPayment: number; supplierPaymentRate: number;
  operatingProfit: number; operatingProfitRate: number;
  cashNetFlow: number; cashNetFlowRate: number;
  totalUnreceived: number;
}

interface ProjectItem {
  id: number; name: string; status: string;
  totalOutput: number; totalPayment: number; totalCost: number;
  monthCost: number;
  profit: number; profitRate: number;
  cumulativeIncome: number; cumulativeCost: number;
  cumulativeProfit: number; cumulativeProfitRate: number;
  paymentRate: number;
  monthSupplierPayments?: number;
  salaryTotal: number; supplierCost: number;
  cumulativeSupplierSettlement: number; cumulativeSupplierPayment: number; supplierPaymentRate: number;
  totalIncome: number; totalReceived: number; unreceived: number;
  inServiceCount: number;
  monthVisaIncome: number; monthActualPayment: number;
  monthConfirmedOutput: number; monthApprovedVisa: number; monthConfirmedCost: number;
  operatingProfit: number; operatingProfitRate: number;
  cashNetFlow: number; cashNetFlowRate: number;
  cumulativeVisa: number;
  totalVisa: number;
  supplierSettlement: number; supplierPayment: number; supplierUnpaid: number;
  cumulativeActualPayment: number;
  totalUnreceived: number;
}

interface PayablePlan {
  totalPayable: number; laborPayable: number; laborPaid: number; laborUnpaid: number;
  supplierPayable: number; supplierPaid: number; supplierUnpaid: number;
  fundGap: number; monthAvailable: number;
}

interface LaborCostItem {
  projectId: number; projectName: string; month: string;
  inServiceCount: number; salaryPayable: number; salaryPaid: number;
  salaryUnpaid: number; unpaidWorkers: number;
  earliestUnpaidMonth: string | null; riskLevel: string;
}

interface SupplierSettlementItem {
  projectId: number; projectName: string; supplierName: string; contractName: string;
  totalSettlement: number; monthSettlement: number; payable: number; paid: number;
  unpaid: number; paymentRate: number; aging: string; riskLevel: string;
}

interface RiskItem {
  project: string; riskType: string; riskLevel: 'danger' | 'warning' | 'info';
  impactAmount: number; reason: string; suggestion: string;
  responsible: string; deadline: string; status: string;
}

interface TrendItem { month: string; income: number; received: number; cost: number; salary: number; profit: number; supplierSettlement?: number; supplierPayment?: number; actualPayment?: number; operatingProfit?: number; cashNetFlow?: number; }
interface CostStructureItem { name: string; value: number; }
interface ComparisonGroup { income: number; incomeAmount: number; received: number; receivedAmount: number; cost: number; costAmount: number; profit: number; profitAmount: number; profitRate?: number; salary: number; salaryAmount: number; supplierSettlement?: number; supplierSettlementAmount?: number; supplierPayment?: number; supplierPaymentAmount?: number; operatingProfit?: number; operatingProfitAmount?: number; cashNetFlow?: number; cashNetFlowAmount?: number; monthActualPayment?: number; prevMonthIncome?: number; prevMonthReceived?: number; prevMonthCost?: number; prevMonthSalary?: number; prevMonthProfit?: number; prevMonthSupplierSettlement?: number; prevMonthSupplierPayment?: number; prevMonthOperatingProfit?: number; prevMonthCashNetFlow?: number; prevMonthActualPayment?: number; lastYearIncome?: number; lastYearReceived?: number; lastYearSalary?: number; lastYearCost?: number; lastYearProfit?: number; lastYearSupplierSettlement?: number; lastYearSupplierPayment?: number; lastYearOperatingProfit?: number; lastYearCashNetFlow?: number; lastYearActualPayment?: number; }
interface Comparisons { mom: ComparisonGroup; yoy: ComparisonGroup; }

interface CollectionLagItem {
  projectId: number; projectName: string; cumulativeOutput: number; cumulativeReceivable: number;
  cumulativeReceived: number; unreceived: number; isOverCollected: boolean; overCollectedAmount?: number;
  agingDays: number; agingCategory: string; estimatedPaymentDate: string | null;
  responsiblePerson: string | null; riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

type ReportMode = 'boss' | 'analysis' | 'detail';

interface MonthlyReportData {
  overview: Overview;
  projects: ProjectItem[];
  payablePlan: PayablePlan;
  laborCostByProject: LaborCostItem[];
  supplierSettlementByProject: SupplierSettlementItem[];
  supplierPaymentsBySupplier: { supplierName: string; projectName: string; monthSettlement: number; monthPaid: number; totalSettlement: number; totalPaid: number; totalUnpaid: number; totalPayable: number; paymentRate: number }[];
  businessConclusion: string;
  risks: Record<string, unknown>;
  riskList: RiskItem[];
  trends: TrendItem[];
  costStructure: CostStructureItem[];
  collectionLagAnalysis: CollectionLagItem[];
  seasonalNote: string;
  comparisons: Comparisons;
  statisticsScope?: string;
}

// ─── Helpers ───────────────────────────────────────────
const WAN = 10000;
const YI = 100000000;

function fmtAmt(v: number): string {
  if (v === 0) return '0';
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (abs >= YI) return `${sign}${(abs / YI).toFixed(2)}亿`;
  if (abs >= WAN) return `${sign}${(abs / WAN).toFixed(2)}万`;
  return `${sign}${abs.toFixed(2)}`;
}

function fmtAmtUnit(v: number): { value: string; unit: string } {
  if (v === 0) return { value: '0', unit: '元' };
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (abs >= YI) return { value: `${sign}${(abs / YI).toFixed(2)}`, unit: '亿' };
  if (abs >= WAN) return { value: `${sign}${(abs / WAN).toFixed(2)}`, unit: '万' };
  return { value: `${sign}${abs.toFixed(2)}`, unit: '元' };
}

function fmtPct(v: number, base?: number): string {
  if (base !== undefined && Math.abs(base) < WAN) return '基数较小，需核对';
  if (!isFinite(v)) return '-';
  const sign = v > 0 ? '+' : '';
  return `${sign}${v.toFixed(1)}%`;
}

function fmtChange(current: number, previous: number): { pct: string; amount: string } {
  const amount = current - previous;
  const amountStr = amount >= 0 ? `+${fmtAmt(amount)}` : fmtAmt(amount);
  if (previous === 0) return { pct: current > 0 ? '+100%' : '0%', amount: amountStr };
  const pct = ((current - previous) / previous) * 100;
  return { pct: fmtPct(pct, previous), amount: amountStr };
}

function riskColor(level: string): 'destructive' | 'secondary' | 'outline' {
  if (level === 'danger') return 'destructive';
  if (level === 'warning') return 'secondary';
  return 'outline';
}

function riskLabel(level: string): string {
  if (level === 'danger') return '高';
  if (level === 'warning') return '中';
  return '低';
}

// ─── Component ─────────────────────────────────────────
export default function MonthlyReportPage() {
  const router = useRouter();
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [projectId, setProjectId] = useState('all');
  const [projects, setProjects] = useState<Array<{ id: number; name: string }>>([]);
  const [data, setData] = useState<MonthlyReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [reportMode, setReportMode] = useState<ReportMode>('boss');
  const [aiInterpreting, setAiInterpreting] = useState(false);
  const [aiContent, setAiContent] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [analysisData, setAnalysisData] = useState<{id:number;title:string;content:string;tags:string[]} | null>(null);
  const [monthAnalysisMap, setMonthAnalysisMap] = useState<Record<string, boolean>>({});

  // 加载该项目的所有已归档月度分析
  useEffect(() => {
    if (!data) return;
    const projId = projectId !== 'all' ? projectId : '';
    fetch('/api/ai/knowledge?category=成本分析&page_size=100')
      .then(r => r.json())
      .then(d => {
        if (d.success && Array.isArray(d.data)) {
          const map: Record<string, boolean> = {};
          d.data.forEach((doc: any) => {
            const ref = doc.source_ref || '';
            const match = ref.match(/monthly:(\d+):(\d{4}-\d{2})/);
            if (match && (!projId || match[1] === projId)) {
              map[match[2]] = true;
            }
          });
          setMonthAnalysisMap(map);
        }
      }).catch(() => {});
  }, [data, projectId]);
  const [showPreview, setShowPreview] = useState(false);
  const [copied, setCopied] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  // Load projects
  useEffect(() => {
    fetch('/api/projects').then(r => r.json()).then(res => {
      const list = res.projects || res.data || (Array.isArray(res) ? res : []);
      setProjects(Array.isArray(list) ? list.map((p: Record<string, unknown>) => ({ id: p.id as number, name: p.name as string })) : []);
    }).catch(() => {});
  }, []);

  // Load data
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/reports/monthly/summary?month=${month}${projectId !== 'all' ? `&projectId=${projectId}` : ''}`);
      const json = await res.json();
      if (json.success) setData(json.data as MonthlyReportData);
      else toast.error(json.error || '加载失败');
    } catch { toast.error('网络错误'); }
    finally { setLoading(false); }
  }, [month, projectId]);

  useEffect(() => { loadData(); }, [loadData]);

  // Filter suppliers: hide those with no current-month activity AND fully paid
  const filteredSuppliers = useMemo(() => {
    const all = data?.supplierPaymentsBySupplier ?? [];
    return all.filter(s => (s.monthSettlement || 0) > 0 || (s.monthPaid || 0) > 0 || (s.totalUnpaid || 0) > 0);
  }, [data?.supplierPaymentsBySupplier]);

  // Extract data
  const ov = (data?.overview ?? {}) as Overview;
  const projectList = (data?.projects ?? []) as ProjectItem[];
  const pp = (data?.payablePlan ?? {}) as PayablePlan;
  const laborCosts = (data?.laborCostByProject ?? []) as LaborCostItem[];
  const supplierSettlements = (data?.supplierSettlementByProject ?? []) as SupplierSettlementItem[];
  const riskList = (data?.riskList ?? []) as RiskItem[];
  const trends = (data?.trends ?? []) as TrendItem[];
  const costStructure = (data?.costStructure ?? []) as CostStructureItem[];
  const comp = (data?.comparisons ?? {}) as Comparisons;
  const conclusion = (data?.businessConclusion ?? '') as string;
  const generatedAt = new Date().toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  const completeness: string = '待计算';
  const scope = data?.statisticsScope ?? (projectId === 'all' ? '全部项目' : '指定项目');

  // ─── AI Interpretation ──────────────────────────────
  const handleAIInterpret = async () => {
    setAiInterpreting(true);
    setAiContent('');
    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: `请对${month}月度经营月报进行深度分析解读，注意区分"经营利润"和"现金流"两个维度：1）本月经营整体评价（分别评述经营利润和现金净流）；2）经营利润分析（产值确认+签证-成本=经营利润，反映经营成果）；3）现金流分析（回款-支付=现金净流，反映资金压力）；4）回款滞后风险（回款账龄和未回款金额）；5）成本结构与应付压力；6）下月行动建议。\n\n以下是本月关键数据：\n本月产值：${fmtAmt(ov.monthIncome)}\n本月签证：${fmtAmt(ov.monthVisa ?? 0)}\n本月成本：${fmtAmt(ov.monthCost)}\n经营利润：${fmtAmt(ov.operatingProfit ?? 0)}（经营利润率${(ov.operatingProfitRate ?? 0).toFixed(1)}%）\n本月回款：${fmtAmt(ov.monthReceived)}\n本月实际支付：${fmtAmt(ov.monthActualPayment ?? 0)}\n现金净流：${fmtAmt(ov.cashNetFlow ?? 0)}\n累计签证：${fmtAmt(ov.cumulativeVisa ?? 0)}\n未回款：${fmtAmt(ov.unreceived)}\n人工未付：${fmtAmt(pp.laborUnpaid)}\n供应商未付：${fmtAmt(pp.supplierUnpaid)}\n资金缺口：${fmtAmt(pp.fundGap)}\n${data?.seasonalNote ? `\n季节性说明：${data.seasonalNote}` : ''}\n\n经营结论：${conclusion}` }],
          pageContext: '/reports/monthly',
        }),
      });
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (reader) {
        let buf = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop() || '';
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const chunk = line.slice(6).trim();
              if (chunk === '[DONE]') break;
              try {
                const parsed = JSON.parse(chunk);
                if (parsed.content) setAiContent(prev => prev + parsed.content);
              } catch { /* skip */ }
            }
          }
        }
      }
    } catch { toast.error('AI解读失败'); }
    finally { setAiInterpreting(false); }
  };

  // ─── Export handlers ────────────────────────────────
  const handleExportExcel = async () => {
    try {
      const res = await fetch(`/api/reports/monthly/export-excel?month=${month}${projectId !== 'all' ? `&projectId=${projectId}` : ''}`, { method: 'POST' });
      if (!res.ok) throw new Error();
      const json = await res.json();
      if (!json.success || !json.data?.base64) throw new Error();
      const byteChars = atob(json.data.base64);
      const byteNumbers = new Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: json.data.mimeType || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = json.data.fileName || `月度经营月报_${month}.xlsx`; a.click();
      URL.revokeObjectURL(url);
      toast.success('Excel导出成功');
    } catch { toast.error('导出失败'); }
  };

  const handleExportPDF = async () => {
    try {
      const res = await fetch(`/api/reports/monthly/export-pdf?month=${month}${projectId !== 'all' ? `&projectId=${projectId}` : ''}`, { method: 'POST' });
      if (!res.ok) throw new Error();
      const html = await res.text();
      // Open in new window for printing
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.open();
        printWindow.document.write(html);
        printWindow.document.close();
        // The HTML contains auto-print script, but we also trigger manually as backup
        printWindow.onload = () => {
          setTimeout(() => { try { printWindow.print(); } catch { /* */ } }, 600);
        };
        toast.success('打印窗口已打开，请在打印对话框中选择"另存为PDF"');
      } else {
        // Popup blocked fallback: download HTML file
        const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `月度经营月报_${month}.html`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success('HTML文件已下载，请用浏览器打开后按 Ctrl+P 另存为PDF');
      }
    } catch { toast.error('导出失败'); }
  };

  const handlePrint = () => window.print();

  const handleCreateAnalysis = () => {
    if (analysisData) {
      router.push(`/knowledge/${analysisData.id}`);
    } else {
      router.push(`/knowledge/monthly/new?from=report&month=${month}&project=${projectId}`);
    }
  };
  const handleViewAnalysis = () => {
    router.push(`/knowledge/${analysisData?.id}`);
  };

  const handleArchiveReport = async () => {
    if (!data) return;
    try {
      const res = await fetch('/api/reports/monthly/archives', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month, projectId, reportMode: 'boss', snapshotData: data }),
      });
      const result = await res.json();
      if (result.success) {
        toast.success(`${month} 月报已存档`);
      } else {
        toast.error(result.error || '存档失败');
      }
    } catch {
      toast.error('存档失败，请重试');
    }
  };

  const handleCopyConclusion = () => {
    navigator.clipboard.writeText(conclusion);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('已复制');
  };

  // ─── Chart Options ──────────────────────────────────
  const profitRankOption = {
    tooltip: { trigger: 'axis' as const, formatter: (params: Array<{ name: string; value: number }>) => {
      const p = params[0];
      return `${p.name}<br/>月利润：${fmtAmt(p.value)}`;
    }},
    grid: { left: 120, right: 30, top: 10, bottom: 20 },
    xAxis: { type: 'value' as const, axisLabel: { formatter: (v: number) => fmtAmt(v) } },
    yAxis: { type: 'category' as const, data: [...projectList].sort((a, b) => a.profit - b.profit).slice(-10).map(p => p.name.length > 8 ? p.name.slice(0, 8) + '…' : p.name),
      axisLabel: { width: 100, overflow: 'truncate' as const } },
    series: [{ type: 'bar' as const, data: [...projectList].sort((a, b) => a.profit - b.profit).slice(-10).map(p => ({
      value: p.profit,
      itemStyle: { color: p.profit >= 0 ? '#22c55e' : '#ef4444' },
    })) }],
  };

  const paymentRateOption = {
    tooltip: { trigger: 'axis' as const, formatter: (params: Array<{ name: string; value: number }>) => {
      const p = params[0]; return `${p.name}<br/>回款率：${p.value.toFixed(1)}%`;
    }},
    grid: { left: 120, right: 30, top: 10, bottom: 20 },
    xAxis: { type: 'value' as const, max: 100, axisLabel: { formatter: '{value}%' } },
    yAxis: { type: 'category' as const, data: [...projectList].sort((a, b) => a.paymentRate - b.paymentRate).slice(-10).map(p => p.name.length > 8 ? p.name.slice(0, 8) + '…' : p.name),
      axisLabel: { width: 100, overflow: 'truncate' as const } },
    series: [{ type: 'bar' as const, data: [...projectList].sort((a, b) => a.paymentRate - b.paymentRate).slice(-10).map(p => ({
      value: p.paymentRate,
      itemStyle: { color: p.paymentRate >= 80 ? '#22c55e' : p.paymentRate >= 50 ? '#f59e0b' : '#ef4444' },
    })) }],
  };

  const trendOption = {
    tooltip: { trigger: 'axis' as const },
    legend: { data: ['确认产值', '实际回款', '确认成本', '实际支付', '经营利润', '现金净流'], top: 0, type: 'scroll' as const },
    grid: { left: 60, right: 20, top: 50, bottom: 30 },
    xAxis: { type: 'category' as const, data: trends.map(t => t.month.slice(5)) },
    yAxis: { type: 'value' as const, axisLabel: { formatter: (v: number) => fmtAmt(v) } },
    series: [
      { name: '确认产值', type: 'line', data: trends.map(t => t.income), smooth: true },
      { name: '实际回款', type: 'line', data: trends.map(t => t.received), smooth: true },
      { name: '确认成本', type: 'line', data: trends.map(t => t.cost), smooth: true, lineStyle: { type: 'dashed' } },
      { name: '实际支付', type: 'line', data: trends.map(t => t.actualPayment ?? 0), smooth: true, lineStyle: { type: 'dashed' } },
      { name: '经营利润', type: 'line', data: trends.map(t => t.operatingProfit ?? 0), smooth: true, lineStyle: { width: 2 },
        itemStyle: { color: '#10b981' }, areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(16,185,129,0.15)' }, { offset: 1, color: 'rgba(16,185,129,0)' }] } } },
      { name: '现金净流', type: 'line', data: trends.map(t => t.cashNetFlow ?? 0), smooth: true, lineStyle: { width: 2 },
        itemStyle: { color: '#f59e0b' }, areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(245,158,11,0.15)' }, { offset: 1, color: 'rgba(245,158,11,0)' }] } } },
    ],
  };

  const costStructureOption = {
    tooltip: { trigger: 'item' as const, formatter: (p: { name: string; value: number; percent: number }) => `${p.name}：${fmtAmt(p.value)}（${p.percent.toFixed(1)}%）` },
    legend: { orient: 'vertical' as const, right: 10, top: 'center' },
    series: [{ type: 'pie', radius: ['40%', '70%'], center: ['40%', '50%'], avoidLabelOverlap: true,
      label: { formatter: '{b}\n{d}%' },
      data: costStructure }],
  };

  const payablePressureOption = {
    tooltip: { trigger: 'axis' as const },
    legend: { data: ['人工未付', '供应商未付'], top: 0 },
    grid: { left: 120, right: 30, top: 40, bottom: 20 },
    xAxis: { type: 'value' as const, axisLabel: { formatter: (v: number) => fmtAmt(v) } },
    yAxis: { type: 'category' as const,
      data: [...projectList].sort((a, b) => ((a.salaryTotal - a.totalPayment) + a.supplierUnpaid) - ((b.salaryTotal - b.totalPayment) + b.supplierUnpaid)).slice(-8).map(p => p.name.length > 8 ? p.name.slice(0, 8) + '…' : p.name),
      axisLabel: { width: 100, overflow: 'truncate' as const } },
    series: [
      { name: '人工未付', type: 'bar', stack: 'total', data: [...projectList].sort((a, b) => ((a.salaryTotal - a.totalPayment) + a.supplierUnpaid) - ((b.salaryTotal - b.totalPayment) + b.supplierUnpaid)).slice(-8).map(p => Math.max(0, p.salaryTotal - p.totalPayment)), itemStyle: { color: '#f59e0b' } },
      { name: '供应商未付', type: 'bar', stack: 'total', data: [...projectList].sort((a, b) => ((a.salaryTotal - a.totalPayment) + a.supplierUnpaid) - ((b.salaryTotal - b.totalPayment) + b.supplierUnpaid)).slice(-8).map(p => p.supplierUnpaid), itemStyle: { color: '#ef4444' } },
    ],
  };

  const unpaidComposeOption = {
    tooltip: { trigger: 'item' as const, formatter: (p: { name: string; value: number; percent: number }) => `${p.name}：${fmtAmt(p.value)}（${p.percent.toFixed(1)}%）` },
    series: [{ type: 'pie', radius: ['40%', '70%'], center: ['50%', '50%'],
      label: { formatter: '{b}\n{d}%' },
      data: [
        { name: '人工未付', value: pp.laborUnpaid, itemStyle: { color: '#f59e0b' } },
        { name: '供应商未付', value: pp.supplierUnpaid, itemStyle: { color: '#ef4444' } },
      ].filter(d => d.value > 0),
    }],
  };

  const supplierTop10Option = {
    tooltip: { trigger: 'axis' as const, formatter: (params: Array<{ name: string; value: number }>) => {
      const p = params[0]; return `${p.name}<br/>未付：${fmtAmt(p.value)}`;
    }},
    grid: { left: 120, right: 30, top: 10, bottom: 20 },
    xAxis: { type: 'value' as const, axisLabel: { formatter: (v: number) => fmtAmt(v) } },
    yAxis: { type: 'category' as const,
      data: [...supplierSettlements].sort((a, b) => a.unpaid - b.unpaid).slice(-10).map(s => s.supplierName.length > 8 ? s.supplierName.slice(0, 8) + '…' : s.supplierName),
      axisLabel: { width: 100, overflow: 'truncate' as const } },
    series: [{ type: 'bar', data: [...supplierSettlements].sort((a, b) => a.unpaid - b.unpaid).slice(-10).map(s => ({
      value: s.unpaid, itemStyle: { color: s.riskLevel === 'danger' ? '#ef4444' : '#f59e0b' },
    })) }],
  };

  const supplierTrendOption = {
    tooltip: { trigger: 'axis' as const },
    legend: { data: ['供应商结算', '供应商付款'], top: 0 },
    grid: { left: 60, right: 20, top: 40, bottom: 30 },
    xAxis: { type: 'category' as const, data: trends.map(t => t.month.slice(5)) },
    yAxis: { type: 'value' as const, axisLabel: { formatter: (v: number) => fmtAmt(v) } },
    series: [
      { name: '供应商结算', type: 'bar', data: trends.map(t => t.supplierSettlement ?? 0), itemStyle: { color: '#6366f1' } },
      { name: '供应商付款', type: 'bar', data: trends.map(t => t.supplierPayment ?? 0), itemStyle: { color: '#22c55e' } },
    ],
  };

  // ─── Change tags ────────────────────────────────────
  const ChangeTag = ({ current, previous, invert = false }: { current: number; previous: number; invert?: boolean }) => {
    if (previous === 0 && current === 0) return <span className="text-xs text-muted-foreground">-</span>;
    const { pct, amount } = fmtChange(current, previous);
    const isPositive = current > previous;
    const isGood = invert ? !isPositive : isPositive;
    return (
      <span className={`inline-flex items-center gap-0.5 text-xs ${isGood ? 'text-emerald-600' : 'text-red-500'}`}>
        {isPositive ? <TrendingUp className="w-3 h-3" /> : current < previous ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
        {pct}（{amount}）
      </span>
    );
  };

  // ─── Render ─────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background" ref={printRef}>
      <div className="max-w-[1600px] mx-auto px-4 md:px-6 py-4 md:py-6 space-y-4 md:space-y-6 print:px-0">

        {/* ─── Top Bar ─── */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-semibold tracking-tight">月度经营月报</h1>
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>{generateMonthOptions()}</SelectContent>
            </Select>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部项目</SelectItem>
                {projects.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span>生成：{generatedAt}</span>
              <Badge variant={completeness === '完整' ? 'default' : 'secondary'} className="text-[10px] px-1.5 py-0">
                {completeness || '未知'}
              </Badge>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center bg-muted rounded-md p-0.5 text-xs">
              {([['boss', '老板汇报'], ['analysis', '分析'], ['detail', '项目明细']] as const).map(([mode, label]) => (
                <button key={mode} onClick={() => setReportMode(mode as ReportMode)}
                  className={`px-3 py-1.5 rounded-sm transition-colors ${reportMode === mode ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}>
                  {label}
                </button>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={handleCreateAnalysis}><FileText className="w-3.5 h-3.5 mr-1" />{analysisData ? '查看本月分析' : '写本月分析'}</Button>
            <Button variant="outline" size="sm" onClick={loadData} disabled={loading}><RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} />刷新</Button>
            <Button variant="outline" size="sm" onClick={handleExportExcel}><Download className="w-3.5 h-3.5 mr-1" />Excel</Button>
            <Button variant="outline" size="sm" onClick={handleExportPDF}><FileText className="w-3.5 h-3.5 mr-1" />PDF</Button>
            <Button variant="outline" size="sm" onClick={() => setShowPreview(true)}><Eye className="w-3.5 h-3.5 mr-1" />预览</Button>
            <Button variant="outline" size="sm" onClick={handlePrint}><Printer className="w-3.5 h-3.5 mr-1" />打印</Button>
            <Button variant="outline" size="sm" onClick={handleArchiveReport} disabled={!data}><Archive className="w-3.5 h-3.5 mr-1" />存档</Button>
            <Button variant="outline" size="sm" onClick={() => setShowHistory(true)}><History className="w-3.5 h-3.5 mr-1" />历史</Button>
            <Button size="sm" onClick={handleAIInterpret} disabled={aiInterpreting}>
              <Sparkles className="w-3.5 h-3.5 mr-1" />{aiInterpreting ? '解读中…' : 'AI解读'}
            </Button>
          </div>
        </div>

        {loading && !data ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground"><RefreshCw className="w-5 h-5 animate-spin mr-2" />加载中…</div>
        ) : (
          <>
            {/* ─── Core KPIs ─── */}
            {reportMode === 'boss' && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                  <KpiCard label="本月产值" value={fmtAmtUnit(ov.monthIncome).value} unit={fmtAmtUnit(ov.monthIncome).unit}
                    tooltip="统计口径：已审核甲方报量金额" onClick={() => router.push('/client-reports')}
                    change={comp.mom?.income} changeLabel="环比" />
                  <KpiCard label="本月回款" value={fmtAmtUnit(ov.monthReceived).value} unit={fmtAmtUnit(ov.monthReceived).unit}
                    tooltip="统计口径：甲方付款到账金额" onClick={() => router.push('/client-payments')}
                    change={comp.mom?.received} changeLabel="环比" />
                  <KpiCard label="本月确认成本" value={fmtAmtUnit(ov.monthCost).value} unit={fmtAmtUnit(ov.monthCost).unit}
                    tooltip="统计口径：本月人工+供应商结算+综合费用+材料+税费（确认成本，非实际支付）"
                    change={comp.mom?.cost} changeLabel="环比" />
                  <KpiCard label="本月经营利润" value={fmtAmtUnit(ov.operatingProfit).value} unit={fmtAmtUnit(ov.operatingProfit).unit}
                    tooltip="统计口径：本月确认产值+本月已审批签证-本月确认成本，反映项目当月经营成果"
                    change={comp.mom?.profit} changeLabel="环比"
                    risk={ov.operatingProfit < 0 ? 'danger' : undefined} />
                  <KpiCard label="本月现金净流" value={fmtAmtUnit(ov.cashNetFlow).value} unit={fmtAmtUnit(ov.cashNetFlow).unit}
                    tooltip="统计口径：本月实际回款-本月实际支付，反映当月资金收支压力"
                    risk={ov.cashNetFlow < 0 ? 'warning' : undefined} />
                  <KpiCard label="未回款/缺口" value={fmtAmtUnit(ov.unreceived).value} unit={fmtAmtUnit(ov.unreceived).unit}
                    tooltip="统计口径：产值-已回款"
                    risk={ov.unreceived > 0 ? 'warning' : undefined} />
                </div>

                {/* Payable Pressure KPIs */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <KpiCard label="本月应付合计" value={fmtAmtUnit(pp.totalPayable).value} unit={fmtAmtUnit(pp.totalPayable).unit}
                    tooltip="人工未付+供应商未付" risk={pp.totalPayable > 0 ? 'warning' : undefined} />
                  <KpiCard label="人工未付" value={fmtAmtUnit(pp.laborUnpaid).value} unit={fmtAmtUnit(pp.laborUnpaid).unit}
                    tooltip="工资应付-工资已付" onClick={() => router.push('/workers/salaries')}
                    risk={pp.laborUnpaid > 0 ? 'danger' : undefined} />
                  <KpiCard label="供应商未付" value={fmtAmtUnit(pp.supplierUnpaid).value} unit={fmtAmtUnit(pp.supplierUnpaid).unit}
                    tooltip="供应商结算应付-已付" onClick={() => router.push('/data-board/supplier-cost')}
                    risk={pp.supplierUnpaid > 0 ? 'warning' : undefined} />
                  <KpiCard label="预计资金缺口" value={fmtAmtUnit(pp.fundGap).value} unit={fmtAmtUnit(pp.fundGap).unit}
                    tooltip="应付合计-本月可用回款"
                    risk={pp.fundGap > 0 ? 'danger' : undefined} />
                </div>

                {/* Comparison bar */}
                {(comp.mom?.prevMonthIncome !== undefined || comp.yoy?.lastYearIncome !== undefined) && (
                  <Card>
                    <CardContent className="py-3 px-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                        <div>
                          <span className="font-medium text-muted-foreground mr-2">环比（vs上月）</span>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                            <span>产值 <ChangeTag current={ov.monthIncome} previous={comp.mom?.prevMonthIncome ?? 0} /></span>
                            <span>回款 <ChangeTag current={ov.monthReceived} previous={comp.mom?.prevMonthReceived ?? 0} /></span>
                            <span>成本 <ChangeTag current={ov.monthCost} previous={comp.mom?.prevMonthCost ?? 0} invert /></span>
                            <span>工资 <ChangeTag current={ov.monthSalaryCost} previous={comp.mom?.prevMonthSalary ?? 0} /></span>
                            <span>供应商付款 <ChangeTag current={ov.monthSupplierPayments} previous={comp.mom?.prevMonthSupplierPayment ?? 0} /></span>
                          </div>
                        </div>
                        <div>
                          <span className="font-medium text-muted-foreground mr-2">同比（vs去年同月）</span>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                            <span>产值 <ChangeTag current={ov.monthIncome} previous={comp.yoy?.lastYearIncome ?? 0} /></span>
                            <span>回款 <ChangeTag current={ov.monthReceived} previous={comp.yoy?.lastYearReceived ?? 0} /></span>
                            <span>工资 <ChangeTag current={ov.monthSalaryCost} previous={comp.yoy?.lastYearSalary ?? 0} /></span>
                            <span>供应商付款 <ChangeTag current={ov.monthSupplierPayments} previous={comp.yoy?.lastYearSupplierPayment ?? 0} /></span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            )}



            {/* ─── Business Conclusion ─── */}
            {conclusion && reportMode === 'boss' && (
              <Card className="border-l-4 border-l-primary">
                <CardHeader className="pb-2 pt-4 px-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                      <Eye className="w-4 h-4" /> 本月经营结论
                    </CardTitle>
                    <Button variant="ghost" size="sm" onClick={handleCopyConclusion} className="h-7">
                      {copied ? <Check className="w-3.5 h-3.5 mr-1" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
                      {copied ? '已复制' : '复制'}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <div className="text-sm leading-relaxed whitespace-pre-line">{conclusion}</div>
                </CardContent>
              </Card>
            )}

            {/* ─── Payable Plan ─── */}
            {reportMode !== 'detail' && (
              <Card>
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <DollarSign className="w-4 h-4" /> 应付资金计划
                    {pp.fundGap > 0 && <RiskBadge level="danger" label="资金缺口" />}
                    {pp.laborUnpaid > 0 && <RiskBadge level="warning" label="工资支付风险" />}
                    {pp.supplierUnpaid > 0 && <RiskBadge level="warning" label="供应商付款压力" />}
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <StatBox label="本月应付合计" value={pp.totalPayable} />
                    <StatBox label="人工未付" value={pp.laborUnpaid} sub={`已付 ${fmtAmt(pp.laborPaid)}`} danger={pp.laborUnpaid > 0} />
                    <StatBox label="供应商未付" value={pp.supplierUnpaid} sub={`已付 ${fmtAmt(pp.supplierPaid)}`} danger={pp.supplierUnpaid > 0} />
                    <StatBox label="预计资金缺口" value={pp.fundGap} sub={`可用回款 ${fmtAmt(pp.monthAvailable)}`} danger={pp.fundGap > 0} />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <ChartCard title="项目应付压力排行" unit="元">
                      <EChartsWrapper option={payablePressureOption} style={{ height: 300 }} />
                    </ChartCard>
                    <ChartCard title="未付构成" unit="元">
                      <EChartsWrapper option={unpaidComposeOption} style={{ height: 300 }} />
                    </ChartCard>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ─── Project Rankings ─── */}
            {reportMode === 'boss' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ChartCard title="项目利润排行" unit="元">
                  <EChartsWrapper option={profitRankOption} style={{ height: 280 }} />
                </ChartCard>
                <ChartCard title="项目回款率排行" unit="%">
                  <EChartsWrapper option={paymentRateOption} style={{ height: 280 }} />
                </ChartCard>
              </div>
            )}

            {/* ─── Risk Alerts ─── */}
            {riskList.length > 0 && (
              <Card>
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-destructive" /> 风险预警
                    <Badge variant="destructive" className="text-xs">{riskList.length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <div className="overflow-x-auto">
                    {/* Desktop table */}
                    <div className="hidden md:block">
                      <table className="w-full text-sm">
                        <thead><tr className="border-b text-muted-foreground text-xs">
                          <th className="text-left py-2 px-2">项目</th>
                          <th className="text-left py-2 px-2">风险类型</th>
                          <th className="text-center py-2 px-2">等级</th>
                          <th className="text-right py-2 px-2">影响金额</th>
                          <th className="text-left py-2 px-2">原因</th>
                          <th className="text-left py-2 px-2">建议动作</th>
                          <th className="text-left py-2 px-2">责任人</th>
                          <th className="text-left py-2 px-2">截止</th>
                          <th className="text-center py-2 px-2">状态</th>
                        </tr></thead>
                        <tbody>{riskList.map((r, i) => (
                          <tr key={i} className="border-b last:border-0 hover:bg-muted/50">
                            <td className="py-2 px-2 font-medium">{r.project}</td>
                            <td className="py-2 px-2">{r.riskType}</td>
                            <td className="py-2 px-2 text-center"><Badge variant={riskColor(r.riskLevel)}>{riskLabel(r.riskLevel)}</Badge></td>
                            <td className="py-2 px-2 text-right">{r.impactAmount > 0 ? fmtAmt(r.impactAmount) : '-'}</td>
                            <td className="py-2 px-2 max-w-[200px] truncate" title={r.reason}>{r.reason}</td>
                            <td className="py-2 px-2 max-w-[150px] truncate" title={r.suggestion}>{r.suggestion}</td>
                            <td className="py-2 px-2">{r.responsible}</td>
                            <td className="py-2 px-2 text-xs">{r.deadline}</td>
                            <td className="py-2 px-2 text-center"><Badge variant="outline">{r.status}</Badge></td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </div>
                    {/* Mobile cards */}
                    <div className="md:hidden space-y-3">
                      {riskList.map((r, i) => (
                        <div key={i} className="border rounded-lg p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-medium">{r.project}</span>
                            <Badge variant={riskColor(r.riskLevel)}>{r.riskType}</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">{r.reason}</p>
                          {r.impactAmount > 0 && <p className="text-sm">影响金额：<span className="font-medium text-destructive">{fmtAmt(r.impactAmount)}</span></p>}
                          <p className="text-sm">建议：{r.suggestion}</p>
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>{r.responsible}</span><span>截止 {r.deadline}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ─── 回款滞后分析 ─── */}
            {data?.collectionLagAnalysis && data.collectionLagAnalysis.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Clock className="w-4 h-4 text-amber-500" /> 回款滞后分析
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b text-muted-foreground text-xs">
                        <th className="text-left py-2 px-2">项目名称</th>
                        <th className="text-right py-2 px-2">累计确认产值</th>
                        <th className="text-right py-2 px-2">累计应回款</th>
                        <th className="text-right py-2 px-2">累计已回款</th>
                        <th className="text-right py-2 px-2">应收未回</th>
                        <th className="text-center py-2 px-2">账龄</th>
                        <th className="text-left py-2 px-2">预计回款时间</th>
                        <th className="text-left py-2 px-2">回款责任人</th>
                        <th className="text-center py-2 px-2">风险等级</th>
                      </tr></thead>
                      <tbody>
                        {data.collectionLagAnalysis.map((item, idx) => (
                          <tr key={idx} className="border-b last:border-0 hover:bg-muted/50">
                            <td className="py-2 px-2 font-medium">{item.projectName}</td>
                            <td className="text-right py-2 px-2">{formatAmountSmart(item.cumulativeOutput)}</td>
                            <td className="text-right py-2 px-2">{formatAmountSmart(item.cumulativeReceivable)}</td>
                            <td className="text-right py-2 px-2">{formatAmountSmart(item.cumulativeReceived)}</td>
                            <td className={`text-right py-2 px-2 font-semibold ${item.unreceived > 0 ? 'text-destructive' : 'text-emerald-600'}`}>
                              {item.unreceived > 0 ? formatAmountSmart(item.unreceived) : (item.isOverCollected ? `超收 ${formatAmountSmart(item.overCollectedAmount || 0)}` : '已结清')}
                            </td>
                            <td className="text-center py-2 px-2">
                              <Badge variant="outline" className={
                                item.agingDays > 90 ? 'bg-red-50 text-red-700 border-red-200' :
                                item.agingDays > 60 ? 'bg-orange-50 text-orange-700 border-orange-200' :
                                item.agingDays > 30 ? 'bg-yellow-50 text-yellow-700 border-yellow-200' :
                                'bg-green-50 text-green-700 border-green-200'
                              }>
                                {item.agingCategory}
                              </Badge>
                            </td>
                            <td className="py-2 px-2 text-muted-foreground">{item.estimatedPaymentDate || '-'}</td>
                            <td className="py-2 px-2">{item.responsiblePerson || '-'}</td>
                            <td className="text-center py-2 px-2">
                              <RiskBadge level={
                                item.riskLevel === 'high' || item.riskLevel === 'critical' ? 'danger' :
                                item.riskLevel === 'medium' ? 'warning' : 'normal'
                              } label={
                                item.riskLevel === 'critical' ? '极高风险' :
                                item.riskLevel === 'high' ? '高风险' :
                                item.riskLevel === 'medium' ? '中风险' : '低风险'
                              } />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {/* 回款季节性说明 */}
                  {data?.seasonalNote && (
                    <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg text-sm text-amber-800 dark:text-amber-200 flex items-start gap-2">
                      <Info className="w-4 h-4 mt-0.5 shrink-0" />
                      <span>{data.seasonalNote}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* ─── Trend Charts ─── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ChartCard title="近6个月趋势" unit="元">
                <EChartsWrapper option={trendOption} style={{ height: 300 }} />
              </ChartCard>
              <ChartCard title="成本构成" unit="元">
                <EChartsWrapper option={costStructureOption} style={{ height: 300 }} />
              </ChartCard>
              <ChartCard title="供应商结算与付款趋势" unit="元">
                <EChartsWrapper option={supplierTrendOption} style={{ height: 300 }} />
              </ChartCard>
              <ChartCard title="供应商未付 Top10" unit="元">
                <EChartsWrapper option={supplierTop10Option} style={{ height: 300 }} />
              </ChartCard>
            </div>

            {/* ─── Detail Tables (Collapsible) ─── */}
            <CollapsibleSection
              title="明细台账"
              badge="3"
              defaultOpen={false}
              icon={<FileText className="w-4 h-4" />}
            >
            <Tabs defaultValue="labor" className="w-full">
              <TabsList>
                <TabsTrigger value="labor" className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5" />人工成本</TabsTrigger>
                <TabsTrigger value="supplier" className="flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5" />供应商结算</TabsTrigger>
                <TabsTrigger value="supplier-payment" className="flex items-center gap-1.5"><CreditCard className="w-3.5 h-3.5" />供应商付款</TabsTrigger>
                <TabsTrigger value="projects" className="flex items-center gap-1.5"><Shield className="w-3.5 h-3.5" />项目明细</TabsTrigger>
              </TabsList>

              <TabsContent value="labor">
                <Card>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      {/* Desktop table */}
                      <div className="hidden md:block">
                        <table className="w-full text-sm">
                          <thead><tr className="border-b text-muted-foreground text-xs">
                            <th className="text-left py-2.5 px-3 sticky left-0 bg-background">项目</th>
                            <th className="text-right py-2.5 px-3">在场人数</th>
                            <th className="text-right py-2.5 px-3">工资应付</th>
                            <th className="text-right py-2.5 px-3">工资已付</th>
                            <th className="text-right py-2.5 px-3">工资未付</th>
                            <th className="text-right py-2.5 px-3">未付人数</th>
                            <th className="text-left py-2.5 px-3">最早欠付</th>
                            <th className="text-center py-2.5 px-3">风险</th>
                          </tr></thead>
                          <tbody>{laborCosts.map((l, i) => (
                            <tr key={i} className="border-b last:border-0 hover:bg-muted/50">
                              <td className="py-2.5 px-3 sticky left-0 bg-background font-medium">{l.projectName}</td>
                              <td className="py-2.5 px-3 text-right">{l.inServiceCount}</td>
                              <td className="py-2.5 px-3 text-right">{fmtAmt(l.salaryPayable)}</td>
                              <td className="py-2.5 px-3 text-right text-emerald-600">{fmtAmt(l.salaryPaid)}</td>
                              <td className="py-2.5 px-3 text-right text-red-500">{fmtAmt(l.salaryUnpaid)}</td>
                              <td className="py-2.5 px-3 text-right">{l.unpaidWorkers}</td>
                              <td className="py-2.5 px-3">{l.earliestUnpaidMonth || '-'}</td>
                              <td className="py-2.5 px-3 text-center">{l.riskLevel !== 'normal' ? <Badge variant={riskColor(l.riskLevel)}>{riskLabel(l.riskLevel)}</Badge> : '-'}</td>
                            </tr>
                          ))}</tbody>
                        </table>
                      </div>
                      {/* Mobile cards */}
                      <div className="md:hidden space-y-3 p-3">
                        {laborCosts.map((l, i) => (
                          <div key={i} className="border rounded-lg p-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="font-medium">{l.projectName}</span>
                              {l.riskLevel !== 'normal' && <Badge variant={riskColor(l.riskLevel)}>风险{l.riskLevel === 'danger' ? '高' : '中'}</Badge>}
                            </div>
                            <div className="grid grid-cols-3 gap-2 text-sm">
                              <div><span className="text-muted-foreground">应付</span><br />{fmtAmt(l.salaryPayable)}</div>
                              <div><span className="text-muted-foreground">已付</span><br /><span className="text-emerald-600">{fmtAmt(l.salaryPaid)}</span></div>
                              <div><span className="text-muted-foreground">未付</span><br /><span className="text-red-500">{fmtAmt(l.salaryUnpaid)}</span></div>
                            </div>
                            <div className="text-xs text-muted-foreground">{l.inServiceCount}人 | 未付{l.unpaidWorkers}人{ l.earliestUnpaidMonth ? ` | 最早欠付${l.earliestUnpaidMonth}` : ''}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                    {laborCosts.length === 0 && <EmptyState message="暂无人工成本数据" />}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="supplier">
                <Card>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <div className="hidden md:block">
                        <table className="w-full text-sm">
                          <thead><tr className="border-b text-muted-foreground text-xs">
                            <th className="text-left py-2.5 px-3 sticky left-0 bg-background">项目</th>
                            <th className="text-left py-2.5 px-3">供应商</th>
                            <th className="text-left py-2.5 px-3">合同</th>
                            <th className="text-right py-2.5 px-3">累计结算</th>
                            <th className="text-right py-2.5 px-3">应付</th>
                            <th className="text-right py-2.5 px-3">已付</th>
                            <th className="text-right py-2.5 px-3">未付</th>
                            <th className="text-right py-2.5 px-3">付款率</th>
                            <th className="text-left py-2.5 px-3">账龄</th>
                            <th className="text-center py-2.5 px-3">风险</th>
                          </tr></thead>
                          <tbody>{supplierSettlements.map((s, i) => (
                            <tr key={i} className="border-b last:border-0 hover:bg-muted/50">
                              <td className="py-2.5 px-3 sticky left-0 bg-background font-medium">{s.projectName}</td>
                              <td className="py-2.5 px-3">{s.supplierName}</td>
                              <td className="py-2.5 px-3 max-w-[120px] truncate" title={s.contractName}>{s.contractName}</td>
                              <td className="py-2.5 px-3 text-right">{fmtAmt(s.totalSettlement)}</td>
                              <td className="py-2.5 px-3 text-right">{fmtAmt(s.payable)}</td>
                              <td className="py-2.5 px-3 text-right text-emerald-600">{fmtAmt(s.paid)}</td>
                              <td className="py-2.5 px-3 text-right text-red-500">{fmtAmt(s.unpaid)}</td>
                              <td className="py-2.5 px-3 text-right">{s.paymentRate.toFixed(1)}%</td>
                              <td className="py-2.5 px-3">{s.aging}</td>
                              <td className="py-2.5 px-3 text-center">{s.riskLevel !== 'normal' ? <Badge variant={riskColor(s.riskLevel)}>{riskLabel(s.riskLevel)}</Badge> : '-'}</td>
                            </tr>
                          ))}</tbody>
                        </table>
                      </div>
                      <div className="md:hidden space-y-3 p-3">
                        {supplierSettlements.map((s, i) => (
                          <div key={i} className="border rounded-lg p-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="font-medium">{s.projectName}</span>
                              {s.riskLevel !== 'normal' && <Badge variant={riskColor(s.riskLevel)}>风险</Badge>}
                            </div>
                            <div className="text-sm text-muted-foreground">{s.supplierName} · {s.contractName}</div>
                            <div className="grid grid-cols-3 gap-2 text-sm">
                              <div><span className="text-muted-foreground">应付</span><br />{fmtAmt(s.payable)}</div>
                              <div><span className="text-muted-foreground">已付</span><br /><span className="text-emerald-600">{fmtAmt(s.paid)}</span></div>
                              <div><span className="text-muted-foreground">未付</span><br /><span className="text-red-500">{fmtAmt(s.unpaid)}</span></div>
                            </div>
                            <div className="text-xs text-muted-foreground">付款率{s.paymentRate.toFixed(1)}% · 账龄{s.aging}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                    {supplierSettlements.length === 0 && <EmptyState message="暂无供应商结算数据" />}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="supplier-payment">
                <Card>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <div className="hidden md:block">
                        <table className="w-full text-sm">
                          <thead><tr className="border-b text-muted-foreground text-xs">
                            <th className="text-left py-2.5 px-3 sticky left-0 bg-background">供应商</th>
                            <th className="text-left py-2.5 px-3">所属项目</th>
                            <th className="text-center py-2.5 px-1 bg-primary/5" colSpan={3}>本月</th>
                            <th className="text-center py-2.5 px-1" colSpan={4}>累计</th>
                          </tr>
                          <tr className="border-b text-muted-foreground text-xs">
                            <th className="py-1 px-3" /><th className="py-1 px-3" />
                            <th className="text-right py-1 px-3 bg-primary/5">本月结算</th>
                            <th className="text-right py-1 px-3 bg-primary/5">本月付款</th>
                            <th className="text-right py-1 px-3 bg-primary/5">本月未付</th>
                            <th className="text-right py-1 px-3">累计结算</th>
                            <th className="text-right py-1 px-3">累计已付</th>
                            <th className="text-right py-1 px-3">累计未付</th>
                            <th className="text-right py-1 px-3">付款率</th>
                          </tr></thead>
                          <tbody>{filteredSuppliers.map((s: { supplierName: string; projectName: string; monthSettlement: number; monthPaid: number; totalSettlement: number; totalPaid: number; totalUnpaid: number; totalPayable: number; paymentRate: number }, i: number) => {
                            const monthUnpaid = Math.max((s.monthSettlement || 0) - (s.monthPaid || 0), 0);
                            return (
                            <tr key={i} className="border-b last:border-0 hover:bg-muted/50">
                              <td className="py-2.5 px-3 sticky left-0 bg-background font-medium">{s.supplierName}</td>
                              <td className="py-2.5 px-3">{s.projectName}</td>
                              <td className="py-2.5 px-3 text-right bg-primary/5 font-medium">{fmtAmt(s.monthSettlement)}</td>
                              <td className="py-2.5 px-3 text-right bg-primary/5 text-emerald-600">{fmtAmt(s.monthPaid)}</td>
                              <td className="py-2.5 px-3 text-right bg-primary/5 text-red-500">{fmtAmt(monthUnpaid)}</td>
                              <td className="py-2.5 px-3 text-right">{fmtAmt(s.totalSettlement)}</td>
                              <td className="py-2.5 px-3 text-right text-emerald-600">{fmtAmt(s.totalPaid)}</td>
                              <td className="py-2.5 px-3 text-right text-red-500">{fmtAmt(s.totalUnpaid)}</td>
                              <td className="py-2.5 px-3 text-right">{s.paymentRate.toFixed(1)}%</td>
                            </tr>
                          );})}</tbody>
                          <tfoot><tr className="border-t-2 font-semibold text-sm bg-muted/30">
                            <td className="py-2.5 px-3 sticky left-0 bg-muted/30">合计</td>
                            <td className="py-2.5 px-3" />
                            <td className="py-2.5 px-3 text-right bg-primary/5">{fmtAmt(filteredSuppliers.reduce((sum: number, s: { monthSettlement: number }) => sum + (s.monthSettlement || 0), 0))}</td>
                            <td className="py-2.5 px-3 text-right bg-primary/5 text-emerald-600">{fmtAmt(filteredSuppliers.reduce((sum: number, s: { monthPaid: number }) => sum + (s.monthPaid || 0), 0))}</td>
                            <td className="py-2.5 px-3 text-right bg-primary/5 text-red-500">{fmtAmt(Math.max(filteredSuppliers.reduce((sum: number, s: { monthSettlement: number; monthPaid: number }) => sum + (s.monthSettlement || 0) - (s.monthPaid || 0), 0), 0))}</td>
                            <td className="py-2.5 px-3 text-right">{fmtAmt(filteredSuppliers.reduce((sum: number, s: { totalSettlement: number }) => sum + (s.totalSettlement || 0), 0))}</td>
                            <td className="py-2.5 px-3 text-right text-emerald-600">{fmtAmt(filteredSuppliers.reduce((sum: number, s: { totalPaid: number }) => sum + (s.totalPaid || 0), 0))}</td>
                            <td className="py-2.5 px-3 text-right text-red-500">{fmtAmt(filteredSuppliers.reduce((sum: number, s: { totalUnpaid: number }) => sum + (s.totalUnpaid || 0), 0))}</td>
                            <td className="py-2.5 px-3 text-right">—</td>
                          </tr></tfoot>
                        </table>
                      </div>
                      <div className="md:hidden space-y-3 p-3">
                        {filteredSuppliers.map((s: { supplierName: string; projectName: string; monthSettlement: number; monthPaid: number; totalSettlement: number; totalPaid: number; totalUnpaid: number; paymentRate: number }, i: number) => (
                          <div key={i} className="border rounded-lg p-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="font-medium">{s.supplierName}</span>
                              <span className="text-xs text-muted-foreground">{s.projectName}</span>
                            </div>
                            <div className="grid grid-cols-3 gap-2 text-sm bg-primary/5 rounded p-2">
                              <div><span className="text-muted-foreground text-xs">本月结算</span><br />{fmtAmt(s.monthSettlement)}</div>
                              <div><span className="text-muted-foreground text-xs">本月付款</span><br /><span className="text-emerald-600">{fmtAmt(s.monthPaid)}</span></div>
                              <div><span className="text-muted-foreground text-xs">本月未付</span><br /><span className="text-red-500">{fmtAmt(Math.max((s.monthSettlement||0)-(s.monthPaid||0),0))}</span></div>
                            </div>
                            <div className="grid grid-cols-3 gap-2 text-sm">
                              <div><span className="text-muted-foreground">累计结算</span><br />{fmtAmt(s.totalSettlement)}</div>
                              <div><span className="text-muted-foreground">累计已付</span><br /><span className="text-emerald-600">{fmtAmt(s.totalPaid)}</span></div>
                              <div><span className="text-muted-foreground">累计未付</span><br /><span className="text-red-500">{fmtAmt(s.totalUnpaid)}</span></div>
                            </div>
                            <div className="text-xs text-muted-foreground">付款率 {s.paymentRate.toFixed(1)}%</div>
                          </div>
                        ))}
                      </div>
                    </div>
                    {filteredSuppliers.length === 0 && <EmptyState message="暂无供应商付款数据" />}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="projects">
                <Card>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <div className="hidden md:block">
                        <table className="w-full text-sm">
                          <thead><tr className="border-b text-muted-foreground text-xs">
                            <th className="text-left py-2.5 px-3 sticky left-0 bg-background">项目</th>
                            <th className="text-right py-2.5 px-3">月产值</th>
                            <th className="text-right py-2.5 px-3">月签证</th>
                            <th className="text-right py-2.5 px-3">月成本</th>
                            <th className="text-right py-2.5 px-3">经营利润</th>
                            <th className="text-right py-2.5 px-3">经营利润率</th>
                            <th className="text-right py-2.5 px-3">月回款</th>
                            <th className="text-right py-2.5 px-3">月支付</th>
                            <th className="text-right py-2.5 px-3">现金净流</th>
                            <th className="text-right py-2.5 px-3">累计签证</th>
                            <th className="text-right py-2.5 px-3">回款率</th>
                            <th className="text-right py-2.5 px-3">人数</th>
                          </tr></thead>
                          <tbody>{projectList.map((p) => (
                            <tr key={p.id} className="border-b last:border-0 hover:bg-muted/50 cursor-pointer" onClick={() => router.push(`/projects/${p.id}`)}>
                              <td className="py-2.5 px-3 sticky left-0 bg-background font-medium">{p.name}</td>
                              <td className="py-2.5 px-3 text-right">{fmtAmt(p.monthConfirmedOutput)}</td>
                              <td className="py-2.5 px-3 text-right">{fmtAmt(p.monthApprovedVisa)}</td>
                              <td className="py-2.5 px-3 text-right">{fmtAmt(p.monthConfirmedCost)}</td>
                              <td className={`py-2.5 px-3 text-right font-medium ${p.operatingProfit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{fmtAmt(p.operatingProfit)}</td>
                              <td className="py-2.5 px-3 text-right">{(p.operatingProfitRate ?? 0).toFixed(1)}%</td>
                              <td className="py-2.5 px-3 text-right text-emerald-600">{fmtAmt(p.totalReceived)}</td>
                              <td className="py-2.5 px-3 text-right">{fmtAmt(p.monthActualPayment)}</td>
                              <td className={`py-2.5 px-3 text-right font-medium ${p.cashNetFlow >= 0 ? 'text-blue-600' : 'text-red-500'}`}>{fmtAmt(p.cashNetFlow)}</td>
                              <td className="py-2.5 px-3 text-right">{fmtAmt(p.cumulativeVisa)}</td>
                              <td className="py-2.5 px-3 text-right">{p.paymentRate.toFixed(1)}%</td>
                              <td className="py-2.5 px-3 text-right">{p.inServiceCount}</td>
                            </tr>
                          ))}</tbody>
                        </table>
                      </div>
                      <div className="md:hidden space-y-3 p-3">
                        {projectList.map((p) => (
                          <div key={p.id} className="border rounded-lg p-3 space-y-2 cursor-pointer" onClick={() => router.push(`/projects/${p.id}`)}>
                            <div className="flex items-center justify-between">
                              <span className="font-medium">{p.name}</span>
                              <Badge variant={p.operatingProfit >= 0 ? 'default' : 'destructive'}>{p.operatingProfit >= 0 ? '盈利' : '亏损'}</Badge>
                            </div>
                            <div className="grid grid-cols-3 gap-2 text-sm">
                              <div><span className="text-muted-foreground">经营利润</span><br /><span className={p.operatingProfit >= 0 ? 'text-emerald-600' : 'text-red-500'}>{fmtAmt(p.operatingProfit)}</span></div>
                              <div><span className="text-muted-foreground">现金净流</span><br /><span className={p.cashNetFlow >= 0 ? 'text-blue-600' : 'text-red-500'}>{fmtAmt(p.cashNetFlow)}</span></div>
                              <div><span className="text-muted-foreground">回款率</span><br />{p.paymentRate.toFixed(1)}%</div>
                            </div>
                            <div className="text-xs text-muted-foreground">月产值{fmtAmt(p.monthConfirmedOutput)} | 月签证{fmtAmt(p.monthApprovedVisa)} | 月成本{fmtAmt(p.monthConfirmedCost)} | {p.inServiceCount}人</div>
                          </div>
                        ))}
                      </div>
                    </div>
                    {projectList.length === 0 && <EmptyState message="暂无项目数据" />}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
            </CollapsibleSection>

            {/* ─── AI Interpretation ─── */}
            {(aiInterpreting || aiContent) && (
              <Card className="border-l-4 border-l-primary/60">
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Sparkles className="w-4 h-4" /> AI 经营解读
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <div className="text-sm leading-relaxed whitespace-pre-line">
                    {aiContent || '正在分析中…'}
                    {aiInterpreting && <span className="animate-pulse">▊</span>}
                  </div>
                  {aiContent && !aiInterpreting && (
                    <Button variant="ghost" size="sm" className="mt-2" onClick={() => { navigator.clipboard.writeText(aiContent); toast.success('已复制'); }}>
                      <Copy className="w-3.5 h-3.5 mr-1" />复制解读
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}

            {/* ─── Footer ─── */}
            <div className="text-xs text-muted-foreground text-center py-4 border-t space-y-1 print:hidden">
              <p>数据更新时间：{generatedAt} | 统计范围：{scope} | 统计口径：已审核报量+已审批签证-已作废记录</p>
              <p>数据来源：甲方报量、甲方付款、工人工资、供应商结算、综合费用、零星材料</p>
              {ov.monthIncome === 0 && <p className="text-amber-600">本月暂无产值数据，请确认报量是否已录入</p>}
            </div>
          </>
        )}

        {/* ─── History Archive Dialog ─── */}
        <HistoryArchiveDialog
          open={showHistory}
          onOpenChange={setShowHistory}
          currentMonth={month}
          projectId={projectId}
          onArchive={handleArchiveReport}
          onLoadArchive={(archive) => {
            setMonth(archive.month);
            if (archive.snapshot_data?.summary) {
              setData(prev => ({ ...prev, ...archive.snapshot_data }));
            }
            setShowHistory(false);
          }}
        />

        {/* ─── Report Preview Dialog ─── */}
        {showPreview && data && (
          <ReportPreviewDialog
            month={month}
            projectName={projectId === 'all' ? '全部项目' : projects.find(p => String(p.id) === projectId)?.name || ''}
            data={data}
            onClose={() => setShowPreview(false)}
            onExportPDF={handleExportPDF}
          />
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────

function StatBox({ label, value, sub, danger }: { label: string; value: number; sub?: string; danger?: boolean }) {
  const { value: v, unit } = fmtAmtUnit(value);
  return (
    <div className={`rounded-lg border p-3 ${danger ? 'border-red-200 bg-red-50/50 dark:border-red-900/50 dark:bg-red-950/20' : 'bg-muted/30'}`}>
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className={`text-lg font-semibold ${danger ? 'text-red-600' : ''}`}>{v}<span className="text-sm font-normal text-muted-foreground ml-0.5">{unit}</span></div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
      <Package className="w-8 h-8 mb-2" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

function generateMonthOptions() {
  const options = [];
  const now = new Date();
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    options.push(<SelectItem key={val} value={val}>{val}</SelectItem>);
  }
  return options;
}

// ─── Report Preview Dialog ────────────────────────────────────
interface PreviewProps {
  month: string;
  projectName: string;
  data: MonthlyReportData;
  onClose: () => void;
  onExportPDF: () => void;
}

function ReportPreviewDialog({ month, projectName, data, onClose, onExportPDF }: PreviewProps) {
  const ov = data.overview;
  const pp = data.payablePlan;
  const conclusion = data.businessConclusion;
  const risks = data.riskList || [];
  const laborStats = data.laborCostByProject || [];
  const allSupplierStats = data.supplierPaymentsBySupplier || [];
  // Filter: hide suppliers with no current-month settlement AND fully paid
  const supplierStats = allSupplierStats.filter((s: { monthSettlement?: number; monthPaid?: number; totalUnpaid?: number }) => {
    const ms = s.monthSettlement || 0;
    const mp = s.monthPaid || 0;
    const unpaid = s.totalUnpaid || 0;
    return ms > 0 || mp > 0 || unpaid > 0;
  });
  const trends = data.trends || [];
  const comparisons = data.comparisons;

  const fmtWan = (v: number | null | undefined) => {
    if (v == null) return '-';
    const wan = v / 10000;
    if (Math.abs(wan) >= 10000) return `${(wan / 10000).toFixed(2)}亿`;
    if (Math.abs(wan) >= 1) return `${wan.toFixed(2)}万`;
    return `${v.toFixed(2)}元`;
  };

  const fmtPct = (v: number | null | undefined) => {
    if (v == null) return '-';
    if (Math.abs(v) > 999) return '基数较小，需核对';
    return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
  };

  const riskLevelColor = (level: string) => {
    if (level === 'danger') return '#dc2626';
    if (level === 'warning') return '#d97706';
    return '#16a34a';
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-2xl w-full max-w-[900px] max-h-[92vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Preview toolbar */}
        <div className="sticky top-0 z-10 bg-white border-b px-6 py-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-foreground">月报预览</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={onExportPDF}
              className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
            >
              导出 PDF
            </button>
            <button onClick={onClose} className="px-3 py-1.5 text-xs border rounded-md hover:bg-muted">关闭</button>
          </div>
        </div>

        {/* Report content — simulates printed PDF */}
        <div className="px-12 py-8" style={{ fontFamily: '"PingFang SC", "Microsoft YaHei", sans-serif', color: '#1a1a1a' }}>
          {/* ── Cover / Title ── */}
          <div className="text-center mb-10">
            <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
              月度经营月报
            </h1>
            <p style={{ fontSize: 16, color: '#666' }}>
              {month} | {projectName}
            </p>
            <p style={{ fontSize: 12, color: '#999', marginTop: 4 }}>
              生成时间：{new Date().toLocaleString('zh-CN')} | 统计口径：已审核数据
            </p>
          </div>

          {/* ── Section 1: 经营总览 ── */}
          <section style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, borderBottom: '2px solid #1a1a1a', paddingBottom: 6, marginBottom: 16 }}>
              一、经营总览
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
              {[
                { label: '本月产值', value: fmtWan(ov.monthIncome), color: '#1a1a1a' },
                { label: '本月回款', value: fmtWan(ov.monthReceived), color: '#16a34a' },
                { label: '本月成本', value: fmtWan(ov.monthCost), color: '#dc2626' },
                { label: '经营利润', value: fmtWan(ov.operatingProfit ?? 0), color: (ov.operatingProfit ?? 0) >= 0 ? '#16a34a' : '#dc2626' },
                { label: '现金净流', value: fmtWan(ov.cashNetFlow ?? 0), color: (ov.cashNetFlow ?? 0) >= 0 ? '#2563eb' : '#dc2626' },
              ].map((item, i) => (
                <div key={i} style={{ background: '#f8f9fa', borderRadius: 8, padding: '12px 10px', textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>{item.label}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: item.color }}>{item.value}</div>
                </div>
              ))}
            </div>
            {/* 环比同比 */}
            {comparisons && (
              <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
                {[
                  { label: '产值', mom: comparisons.mom?.income, yoy: comparisons.yoy?.income, momPrev: comparisons.mom?.prevMonthIncome, yoyPrev: comparisons.yoy?.lastYearIncome },
                  { label: '回款', mom: comparisons.mom?.received, yoy: comparisons.yoy?.received, momPrev: comparisons.mom?.prevMonthReceived, yoyPrev: comparisons.yoy?.lastYearReceived },
                  { label: '成本', mom: comparisons.mom?.cost, yoy: comparisons.yoy?.cost, momPrev: comparisons.mom?.prevMonthCost, yoyPrev: comparisons.yoy?.lastYearCost },
                  { label: '经营利润', mom: comparisons.mom?.operatingProfit, yoy: comparisons.yoy?.operatingProfit },
                  { label: '现金净流', mom: comparisons.mom?.cashNetFlow, yoy: comparisons.yoy?.cashNetFlow },
                ].map((item, i) => (
                  <div key={i} style={{ textAlign: 'center', fontSize: 10, color: '#999' }}>
                    <span>环比{fmtPct(item.mom)}</span>
                    <span style={{ margin: '0 4px' }}>|</span>
                    <span>同比{fmtPct(item.yoy)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ── Section 2: 经营结论 ── */}
          {conclusion && (
            <section style={{ marginBottom: 32 }}>
              <h2 style={{ fontSize: 18, fontWeight: 600, borderBottom: '2px solid #1a1a1a', paddingBottom: 6, marginBottom: 16 }}>
                二、经营结论
              </h2>
              <div style={{ background: '#f8f9fa', borderRadius: 8, padding: 16, lineHeight: 1.8, fontSize: 14 }}>
                {conclusion.split('\n').filter(Boolean).map((line, i) => (
                  <p key={i} style={{ margin: '4px 0' }}>
                    {line.startsWith('⚠') || line.startsWith('❗') ? (
                      <span style={{ color: '#dc2626', fontWeight: 600 }}>{line}</span>
                    ) : (
                      line
                    )}
                  </p>
                ))}
              </div>
            </section>
          )}

          {/* ── Section 3: 应付资金计划 ── */}
          {pp && (
            <section style={{ marginBottom: 32 }}>
              <h2 style={{ fontSize: 18, fontWeight: 600, borderBottom: '2px solid #1a1a1a', paddingBottom: 6, marginBottom: 16 }}>
                三、应付资金计划
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                {[
                  { label: '应付合计', value: fmtWan(pp.totalPayable), color: '#1a1a1a' },
                  { label: '人工未付', value: fmtWan(pp.laborUnpaid), color: (pp.laborUnpaid ?? 0) > 0 ? '#dc2626' : '#16a34a' },
                  { label: '供应商未付', value: fmtWan(pp.supplierUnpaid), color: (pp.supplierUnpaid ?? 0) > 0 ? '#dc2626' : '#16a34a' },
                  { label: '预计资金缺口', value: fmtWan(pp.fundGap), color: (pp.fundGap ?? 0) > 0 ? '#dc2626' : '#16a34a' },
                ].map((item, i) => (
                  <div key={i} style={{ background: '#f8f9fa', borderRadius: 6, padding: '10px 8px', textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: '#888' }}>{item.label}</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: item.color }}>{item.value}</div>
                  </div>
                ))}
              </div>
              {/* 风险提示 */}
              <div style={{ marginTop: 10 }}>
                {(pp.laborUnpaid ?? 0) > 0 && (
                  <p style={{ fontSize: 12, color: '#dc2626', margin: '2px 0' }}>⚠ 存在工资支付风险：人工未付 {fmtWan(pp.laborUnpaid)}</p>
                )}
                {(pp.supplierUnpaid ?? 0) > 0 && (
                  <p style={{ fontSize: 12, color: '#d97706', margin: '2px 0' }}>⚠ 存在供应商付款压力：供应商未付 {fmtWan(pp.supplierUnpaid)}</p>
                )}
                {(pp.fundGap ?? 0) > 0 && (
                  <p style={{ fontSize: 12, color: '#dc2626', fontWeight: 600, margin: '2px 0' }}>⚠ 预计资金缺口 {fmtWan(pp.fundGap)}，建议优先保障人工工资</p>
                )}
              </div>
            </section>
          )}

          {/* ── Section 4: 人工成本统计 ── */}
          {laborStats.length > 0 && (
            <section style={{ marginBottom: 32 }}>
              <h2 style={{ fontSize: 18, fontWeight: 600, borderBottom: '2px solid #1a1a1a', paddingBottom: 6, marginBottom: 16 }}>
                四、人工成本统计
              </h2>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#f1f3f5' }}>
                    {['项目', '在场人数', '工资应付', '工资已付', '工资未付', '未付人数', '风险'].map(h => (
                      <th key={h} style={{ padding: '8px 6px', textAlign: 'left', borderBottom: '1px solid #ddd', fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {laborStats.map((item, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: '6px' }}>{item.projectName}</td>
                      <td style={{ padding: '6px' }}>{item.inServiceCount ?? '-'}</td>
                      <td style={{ padding: '6px' }}>{fmtWan(item.salaryPayable)}</td>
                      <td style={{ padding: '6px' }}>{fmtWan(item.salaryPaid)}</td>
                      <td style={{ padding: '6px', color: (item.salaryUnpaid ?? 0) > 0 ? '#dc2626' : 'inherit', fontWeight: (item.salaryUnpaid ?? 0) > 0 ? 600 : 400 }}>{fmtWan(item.salaryUnpaid)}</td>
                      <td style={{ padding: '6px' }}>{item.unpaidWorkers}</td>
                      <td style={{ padding: '6px', color: riskLevelColor(item.riskLevel), fontWeight: 600 }}>{item.riskLevel === 'danger' ? '高' : item.riskLevel === 'warning' ? '中' : '低'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {/* ── Section 5: 供应商结算付款明细 ── */}
          <section style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, borderBottom: '2px solid #1a1a1a', paddingBottom: 6, marginBottom: 16 }}>
              五、供应商结算付款明细
            </h2>
            {/* 汇总卡片 */}
            <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
              {[
                { label: '本月结算', value: supplierStats.reduce((s, i) => s + (i.monthSettlement ?? 0), 0), color: '#2563eb' },
                { label: '本月付款', value: supplierStats.reduce((s, i) => s + (i.monthPaid ?? 0), 0), color: '#16a34a' },
                { label: '累计结算', value: supplierStats.reduce((s, i) => s + (i.totalSettlement ?? 0), 0), color: '#2563eb' },
                { label: '累计付款', value: supplierStats.reduce((s, i) => s + (i.totalPaid ?? 0), 0), color: '#16a34a' },
                { label: '未付总额', value: supplierStats.reduce((s, i) => s + (i.totalUnpaid ?? 0), 0), color: supplierStats.reduce((s, i) => s + (i.totalUnpaid ?? 0), 0) > 0 ? '#dc2626' : '#16a34a' },
              ].map(card => (
                <div key={card.label} style={{ flex: '1 1 120px', background: '#f8f9fa', borderRadius: 8, padding: '10px 14px', textAlign: 'center', borderLeft: `3px solid ${card.color}` }}>
                  <div style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>{card.label}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: card.color }}>{fmtWan(card.value)}</div>
                </div>
              ))}
            </div>
            {/* 明细表格 */}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f1f3f5' }}>
                  {['供应商名称', '所属项目', '本月结算', '本月付款', '累计结算', '累计付款', '应付总额', '未付金额', '付款率'].map(h => (
                    <th key={h} style={{ padding: '8px 6px', textAlign: h.includes('结算') || h.includes('付款') || h.includes('应付') || h.includes('未付') ? 'right' : 'left', borderBottom: '1px solid #ddd', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {supplierStats.map((item, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #eee', background: i % 2 === 0 ? '#fff' : '#fafbfc' }}>
                    <td style={{ padding: '6px', fontWeight: 500, maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.supplierName}</td>
                    <td style={{ padding: '6px', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#555' }}>{item.projectName}</td>
                    <td style={{ padding: '6px', textAlign: 'right', fontWeight: (item.monthSettlement ?? 0) > 0 ? 600 : 400 }}>{fmtWan(item.monthSettlement)}</td>
                    <td style={{ padding: '6px', textAlign: 'right', fontWeight: (item.monthPaid ?? 0) > 0 ? 600 : 400, color: (item.monthPaid ?? 0) > 0 ? '#16a34a' : 'inherit' }}>{fmtWan(item.monthPaid)}</td>
                    <td style={{ padding: '6px', textAlign: 'right' }}>{fmtWan(item.totalSettlement)}</td>
                    <td style={{ padding: '6px', textAlign: 'right', color: '#16a34a' }}>{fmtWan(item.totalPaid)}</td>
                    <td style={{ padding: '6px', textAlign: 'right' }}>{fmtWan(item.totalPayable)}</td>
                    <td style={{ padding: '6px', textAlign: 'right', color: (item.totalUnpaid ?? 0) > 0 ? '#dc2626' : 'inherit', fontWeight: (item.totalUnpaid ?? 0) > 0 ? 600 : 400 }}>{fmtWan(item.totalUnpaid)}</td>
                    <td style={{ padding: '6px', textAlign: 'right', fontWeight: 600, color: (item.paymentRate ?? 100) < 60 ? '#dc2626' : (item.paymentRate ?? 100) < 80 ? '#f59e0b' : '#16a34a' }}>{item.paymentRate != null ? `${item.paymentRate.toFixed(1)}%` : '-'}</td>
                  </tr>
                ))}
                {/* 合计行 */}
                <tr style={{ borderTop: '2px solid #333', background: '#f1f3f5', fontWeight: 700 }}>
                  <td style={{ padding: '8px 6px' }} colSpan={2}>合计</td>
                  <td style={{ padding: '8px 6px', textAlign: 'right' }}>{fmtWan(supplierStats.reduce((s, i) => s + (i.monthSettlement ?? 0), 0))}</td>
                  <td style={{ padding: '8px 6px', textAlign: 'right', color: '#16a34a' }}>{fmtWan(supplierStats.reduce((s, i) => s + (i.monthPaid ?? 0), 0))}</td>
                  <td style={{ padding: '8px 6px', textAlign: 'right' }}>{fmtWan(supplierStats.reduce((s, i) => s + (i.totalSettlement ?? 0), 0))}</td>
                  <td style={{ padding: '8px 6px', textAlign: 'right', color: '#16a34a' }}>{fmtWan(supplierStats.reduce((s, i) => s + (i.totalPaid ?? 0), 0))}</td>
                  <td style={{ padding: '8px 6px', textAlign: 'right' }}>{fmtWan(supplierStats.reduce((s, i) => s + (i.totalPayable ?? 0), 0))}</td>
                  <td style={{ padding: '8px 6px', textAlign: 'right', color: supplierStats.reduce((s, i) => s + (i.totalUnpaid ?? 0), 0) > 0 ? '#dc2626' : 'inherit' }}>{fmtWan(supplierStats.reduce((s, i) => s + (i.totalUnpaid ?? 0), 0))}</td>
                  <td style={{ padding: '8px 6px', textAlign: 'right' }}>
                    {(() => {
                      const totalPayable = supplierStats.reduce((s, i) => s + (i.totalPayable ?? 0), 0);
                      const totalPaid = supplierStats.reduce((s, i) => s + (i.totalPaid ?? 0), 0);
                      return totalPayable > 0 ? `${((totalPaid / totalPayable) * 100).toFixed(1)}%` : '-';
                    })()}
                  </td>
                </tr>
              </tbody>
            </table>
            {/* 供应商未付预警 */}
            {supplierStats.filter(s => (s.totalUnpaid ?? 0) > 0).length > 0 && (
              <div style={{ marginTop: 12, padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, fontSize: 12 }}>
                <div style={{ fontWeight: 600, color: '#dc2626', marginBottom: 6 }}>未付预警供应商</div>
                {supplierStats.filter(s => (s.totalUnpaid ?? 0) > 0).sort((a, b) => (b.totalUnpaid ?? 0) - (a.totalUnpaid ?? 0)).map((s, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', color: '#7f1d1d' }}>
                    <span>{s.supplierName}（{s.projectName}）</span>
                    <span style={{ fontWeight: 600 }}>未付 {fmtWan(s.totalUnpaid)}，付款率 {s.paymentRate != null ? `${s.paymentRate.toFixed(1)}%` : '-'}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ── Section 5.5: 回款滞后与现金流分析 ── */}
          {data.collectionLagAnalysis && data.collectionLagAnalysis.length > 0 && (
            <section style={{ marginBottom: 32 }}>
              <h2 style={{ fontSize: 18, fontWeight: 600, borderBottom: '2px solid #1a1a1a', paddingBottom: 6, marginBottom: 16 }}>
                五点五、回款滞后与现金流分析
              </h2>
              {/* 双口径对比卡片 */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
                {[
                  { label: '经营利润', value: fmtWan(ov.operatingProfit ?? 0), color: (ov.operatingProfit ?? 0) >= 0 ? '#16a34a' : '#dc2626', sub: `利润率 ${(ov.operatingProfitRate ?? 0).toFixed(1)}%` },
                  { label: '现金净流', value: fmtWan(ov.cashNetFlow ?? 0), color: (ov.cashNetFlow ?? 0) >= 0 ? '#2563eb' : '#dc2626', sub: `净流率 ${(ov.cashNetFlowRate ?? 0).toFixed(1)}%` },
                  { label: '本月实际支付', value: fmtWan(ov.monthActualPayment ?? 0), color: '#1a1a1a', sub: '' },
                  { label: '累计签证', value: fmtWan(ov.cumulativeVisa ?? 0), color: '#7c3aed', sub: '' },
                ].map((item, i) => (
                  <div key={i} style={{ background: '#f8f9fa', borderRadius: 6, padding: '10px 8px', textAlign: 'center', borderLeft: `3px solid ${item.color}` }}>
                    <div style={{ fontSize: 10, color: '#888' }}>{item.label}</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: item.color }}>{item.value}</div>
                    {item.sub && <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>{item.sub}</div>}
                  </div>
                ))}
              </div>
              {/* 回款滞后明细 */}
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#f1f3f5' }}>
                    {['项目名称', '累计产值', '累计应回款', '累计已回款', '应收未回', '账龄', '预计回款', '风险等级'].map(h => (
                      <th key={h} style={{ padding: '8px 6px', textAlign: h.includes('累计') || h.includes('应收') ? 'right' : 'left', borderBottom: '1px solid #ddd', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.collectionLagAnalysis.map((item, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #eee', background: i % 2 === 0 ? '#fff' : '#fafbfc' }}>
                      <td style={{ padding: '6px', fontWeight: 500 }}>{item.projectName}</td>
                      <td style={{ padding: '6px', textAlign: 'right' }}>{fmtWan(item.cumulativeOutput)}</td>
                      <td style={{ padding: '6px', textAlign: 'right' }}>{fmtWan(item.cumulativeReceivable)}</td>
                      <td style={{ padding: '6px', textAlign: 'right', color: '#16a34a' }}>{fmtWan(item.cumulativeReceived)}</td>
                      <td style={{ padding: '6px', textAlign: 'right', color: item.unreceived > 0 ? '#dc2626' : '#16a34a', fontWeight: item.unreceived > 0 ? 600 : 400 }}>
                        {item.unreceived > 0 ? fmtWan(item.unreceived) : (item.isOverCollected ? `超收 ${fmtWan(item.overCollectedAmount ?? 0)}` : '已结清')}
                      </td>
                      <td style={{ padding: '6px', textAlign: 'center' }}>
                        <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 11,
                          background: item.agingDays > 90 ? '#fef2f2' : item.agingDays > 60 ? '#fff7ed' : item.agingDays > 30 ? '#fefce8' : '#f0fdf4',
                          color: item.agingDays > 90 ? '#dc2626' : item.agingDays > 60 ? '#ea580c' : item.agingDays > 30 ? '#ca8a04' : '#16a34a' }}>
                          {item.agingCategory}
                        </span>
                      </td>
                      <td style={{ padding: '6px', color: '#888' }}>{item.estimatedPaymentDate || '-'}</td>
                      <td style={{ padding: '6px', textAlign: 'center', color: item.riskLevel === 'high' || item.riskLevel === 'critical' ? '#dc2626' : item.riskLevel === 'medium' ? '#d97706' : '#16a34a', fontWeight: 600 }}>
                        {item.riskLevel === 'critical' ? '极高' : item.riskLevel === 'high' ? '高' : item.riskLevel === 'medium' ? '中' : '低'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {/* 季节性说明 */}
              {data.seasonalNote && (
                <div style={{ marginTop: 12, padding: '10px 14px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, fontSize: 12, color: '#1e40af' }}>
                  {data.seasonalNote}
                </div>
              )}
            </section>
          )}

          {/* ── Section 6: 风险预警 ── */}
          {risks.length > 0 && (
            <section style={{ marginBottom: 32 }}>
              <h2 style={{ fontSize: 18, fontWeight: 600, borderBottom: '2px solid #1a1a1a', paddingBottom: 6, marginBottom: 16 }}>
                六、风险预警清单
              </h2>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#f1f3f5' }}>
                    {['项目', '风险类型', '等级', '影响金额', '原因', '建议动作'].map(h => (
                      <th key={h} style={{ padding: '8px 6px', textAlign: 'left', borderBottom: '1px solid #ddd', fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {risks.map((r, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: '6px' }}>{r.project || '-'}</td>
                      <td style={{ padding: '6px' }}>{r.riskType}</td>
                      <td style={{ padding: '6px', color: riskLevelColor(r.riskLevel), fontWeight: 600 }}>
                        {r.riskLevel === 'danger' ? '高' : r.riskLevel === 'warning' ? '中' : '低'}
                      </td>
                      <td style={{ padding: '6px' }}>{r.impactAmount != null ? fmtWan(r.impactAmount) : '-'}</td>
                      <td style={{ padding: '6px', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.reason || '-'}</td>
                      <td style={{ padding: '6px', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.suggestion || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {/* ── Section 7: 趋势分析 ── */}
          {trends.length > 0 && (
            <section style={{ marginBottom: 32 }}>
              <h2 style={{ fontSize: 18, fontWeight: 600, borderBottom: '2px solid #1a1a1a', paddingBottom: 6, marginBottom: 16 }}>
                七、近6个月趋势
              </h2>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#f1f3f5' }}>
                    <th style={{ padding: '8px 6px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>月份</th>
                    <th style={{ padding: '8px 6px', textAlign: 'right', borderBottom: '1px solid #ddd' }}>产值</th>
                    <th style={{ padding: '8px 6px', textAlign: 'right', borderBottom: '1px solid #ddd' }}>回款</th>
                    <th style={{ padding: '8px 6px', textAlign: 'right', borderBottom: '1px solid #ddd' }}>成本</th>
                    <th style={{ padding: '8px 6px', textAlign: 'right', borderBottom: '1px solid #ddd' }}>支付</th>
                    <th style={{ padding: '8px 6px', textAlign: 'right', borderBottom: '1px solid #ddd' }}>经营利润</th>
                    <th style={{ padding: '8px 6px', textAlign: 'right', borderBottom: '1px solid #ddd' }}>现金净流</th>
                  </tr>
                </thead>
                <tbody>
                  {trends.map((t, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: '6px' }}>{t.month}</td>
                      <td style={{ padding: '6px', textAlign: 'right' }}>{fmtWan(t.income)}</td>
                      <td style={{ padding: '6px', textAlign: 'right' }}>{fmtWan(t.received)}</td>
                      <td style={{ padding: '6px', textAlign: 'right' }}>{fmtWan(t.cost)}</td>
                      <td style={{ padding: '6px', textAlign: 'right' }}>{fmtWan(t.actualPayment ?? 0)}</td>
                      <td style={{ padding: '6px', textAlign: 'right', color: (t.operatingProfit ?? 0) >= 0 ? '#16a34a' : '#dc2626' }}>{fmtWan(t.operatingProfit ?? 0)}</td>
                      <td style={{ padding: '6px', textAlign: 'right', color: (t.cashNetFlow ?? 0) >= 0 ? '#2563eb' : '#dc2626' }}>{fmtWan(t.cashNetFlow ?? 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {/* ── Footer ── */}
          <div style={{ borderTop: '1px solid #ddd', paddingTop: 12, marginTop: 32, fontSize: 10, color: '#999', textAlign: 'center' }}>
            <p>本报告由系统自动生成，数据来源：项目产值、工人工资、供应商结算、甲方回款等模块</p>
            <p>统计口径：仅统计已审核数据，金额单位：万元 | 生成时间：{new Date().toLocaleString('zh-CN')}</p>
            <p style={{ marginTop: 4 }}>第 1 页</p>
          </div>
        </div>
      </div>
    </div>
  );
}
