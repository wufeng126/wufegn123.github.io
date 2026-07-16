'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Users,
  Building2,
  AlertTriangle,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  BarChart3,
  Wallet,
  PieChart,
  Target,
  AlertCircle,
  CheckCircle2,
  X,
  Filter,
  HelpCircle,
  Download,
  Eye,
  Printer,
} from 'lucide-react';
import Link from 'next/link';
import { IncomeCompositionChart, CostCompositionChart } from '@/components/cost-center/composition-chart';
import { StatusTag, AmountDisplay, formatAmountSmart, RiskBadge } from '@/components/business/common';

// 类型定义
interface ProjectCostData {
  id: number;
  name: string;
  status: string;
  contractAmount: number;
  totalIncome: number;
  invoiceAmount: number;  // 开票金额
  visaAmount: number;     // 签证金额
  totalCost: number;
  settlementAmount: number;
  salaryAmount: number;
  expenseAmount: number;  // 综合费用
  taxAmount: number;      // 税费
  miscMaterialAmount: number; // 零星材料
  profit: number;
  profitRate: number;
  laborCostRate: number;
  expenseRate: number;    // 综合费用占比
  taxRate: number;        // 税费占比
  miscMaterialRate: number; // 零星材料占比
  clientPaidAmount: number;
  supplierPaidAmount: number;
  workerPaidAmount: number;
  receivableAmount: number;
  supplierPayableAmount: number;
  workerPayableAmount: number;
  totalPayableAmount: number;
  cashOutAmount: number;
  netCashFlow: number;
  fundingGapAmount: number;
  paymentRate: number;
  payablePaymentRate: number;
  costIncomeRate: number;
}

interface Summary {
  totalIncome: number;
  invoiceAmount: number;  // 开票金额收入
  visaAmount: number;     // 签证收入
  totalCost: number;
  totalSalary: number;
  totalSettlement: number;
  totalExpense: number;   // 综合费用
  totalTax: number;       // 税费
  totalMiscMaterial: number; // 零星材料
  totalProfit: number;
  avgProfitRate: number;
  avgLaborCostRate: number;
  avgExpenseRate: number; // 综合费用占比
  avgTaxRate: number;     // 税费占比
  avgMiscMaterialRate: number; // 零星材料占比
  totalClientPaid: number;
  totalSupplierPaid: number;
  totalWorkerPaid: number;
  totalReceivable: number;
  totalSupplierPayable: number;
  totalWorkerPayable: number;
  totalPayable: number;
  totalCashOut: number;
  totalNetCashFlow: number;
  totalFundingGap: number;
  avgPaymentRate: number;
  avgPayablePaymentRate: number;
  avgCostIncomeRate: number;
}

interface Warning {
  projectId: number;
  projectName: string;
  type: string;
  message: string;
  value: number;
  severity: 'high' | 'medium' | 'low';
}

interface CostCenterData {
  summary: Summary;
  projects: ProjectCostData[];
  warnings: Warning[];
}

function createEmptySummary(): Summary {
  return {
    totalIncome: 0,
    invoiceAmount: 0,
    visaAmount: 0,
    totalCost: 0,
    totalSalary: 0,
    totalSettlement: 0,
    totalExpense: 0,
    totalTax: 0,
    totalMiscMaterial: 0,
    totalProfit: 0,
    avgProfitRate: 0,
    avgLaborCostRate: 0,
    avgExpenseRate: 0,
    avgTaxRate: 0,
    avgMiscMaterialRate: 0,
    totalClientPaid: 0,
    totalSupplierPaid: 0,
    totalWorkerPaid: 0,
    totalReceivable: 0,
    totalSupplierPayable: 0,
    totalWorkerPayable: 0,
    totalPayable: 0,
    totalCashOut: 0,
    totalNetCashFlow: 0,
    totalFundingGap: 0,
    avgPaymentRate: 0,
    avgPayablePaymentRate: 0,
    avgCostIncomeRate: 0,
  };
}

// 格式化金额为万元（千分位 + 两位小数，不带符号）
function formatWanYuan(amount: number): string {
  const wan = amount / 10000;
  if (wan === 0) return '0.00';
  // 千分位格式化
  return wan.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// 格式化数字为千分位
function formatNumber(value: number, decimals: number = 2): string {
  if (value === 0) return '0';
  return value.toLocaleString('zh-CN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

// 格式化百分比
function formatPercent(value: number): string {
  if (isNaN(value) || !isFinite(value)) return '0.0';
  return value.toFixed(1);
}

// 获取项目状态样式
function getStatusTag(status: string) {
  switch (status) {
    case '在建':
    case '进行中':
      return <StatusTag type="active" />;
    case '竣工结算':
    case '质保期':
    case '质保期满':
    case '已完成':
      return <StatusTag type="completed" />;
    case '暂停':
      return <StatusTag type="suspended" />;
    default:
      return <StatusTag type="normal" label={status} />;
  }
}

export default function CostCenterPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-12 h-12 mx-auto mb-4 border-4 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
          <p style={{ color: '#86909C' }}>加载中...</p>
        </div>
      </div>
    }>
      <CostCenterContent />
    </Suspense>
  );
}

function CostCenterContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [data, setData] = useState<CostCenterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showContent, setShowContent] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['overview', 'table', 'warnings']));

  // 处理 URL 参数
  useEffect(() => {
    const projectIdParam = searchParams.get('projectId');
    if (projectIdParam) {
      setSelectedProjectId(projectIdParam);
    }
  }, [searchParams]);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (!loading) {
      const timer = setTimeout(() => setShowContent(true), 50);
      return () => clearTimeout(timer);
    }
  }, [loading]);

  const fetchData = async () => {
    setLoading(true);
    setShowContent(false);
    try {
      const res = await fetch('/api/cost-center');
      const result = await res.json();
      // 确保数据结构正确
      if (result && !result.error) {
        setData({
          summary: result.summary || createEmptySummary(),
          projects: result.projects || [],
          warnings: result.warnings || [],
        });
      } else {
        console.error('API返回错误:', result.error);
        setData({
          summary: createEmptySummary(),
          projects: [],
          warnings: [],
        });
      }
    } catch (error) {
      console.error('获取数据失败:', error);
      setData({
        summary: createEmptySummary(),
        projects: [],
        warnings: [],
      });
    } finally {
      setLoading(false);
    }
  };

  // 切换折叠状态
  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(section)) {
        newSet.delete(section);
      } else {
        newSet.add(section);
      }
      return newSet;
    });
  };

  // 根据选择的项目筛选数据
  const filteredData = useMemo(() => {
    if (!data) return null;
    
    const projects = data.projects || [];
    const warnings = data.warnings || [];
    
    if (selectedProjectId === 'all') {
      return { ...data, projects, warnings };
    }

    const projectId = parseInt(selectedProjectId);
    const project = projects.find(p => p.id === projectId);
    const projectWarnings = warnings.filter(w => w.projectId === projectId);

    if (!project) return { ...data, projects, warnings };

    return {
      summary: {
        totalIncome: project.totalIncome,
        invoiceAmount: project.invoiceAmount,
        visaAmount: project.visaAmount,
        totalCost: project.totalCost,
        totalSalary: project.salaryAmount,
        totalSettlement: project.settlementAmount,
        totalExpense: project.expenseAmount,
        totalTax: project.taxAmount,
        totalMiscMaterial: project.miscMaterialAmount || 0,
        totalProfit: project.profit,
        avgProfitRate: project.profitRate,
        avgLaborCostRate: project.laborCostRate,
        avgExpenseRate: project.expenseRate,
        avgTaxRate: project.taxRate,
        avgMiscMaterialRate: project.miscMaterialRate || 0,
        totalClientPaid: project.clientPaidAmount || 0,
        totalSupplierPaid: project.supplierPaidAmount || 0,
        totalWorkerPaid: project.workerPaidAmount || 0,
        totalReceivable: project.receivableAmount || 0,
        totalSupplierPayable: project.supplierPayableAmount || 0,
        totalWorkerPayable: project.workerPayableAmount || 0,
        totalPayable: project.totalPayableAmount || 0,
        totalCashOut: project.cashOutAmount || 0,
        totalNetCashFlow: project.netCashFlow || 0,
        totalFundingGap: project.fundingGapAmount || 0,
        avgPaymentRate: project.paymentRate || 0,
        avgPayablePaymentRate: project.payablePaymentRate || 0,
        avgCostIncomeRate: project.costIncomeRate || 0,
      },
      projects: [project],
      warnings: projectWarnings,
    };
  }, [data, selectedProjectId]);

  // 清除筛选
  const clearFilter = () => {
    setSelectedProjectId('all');
    router.replace('/cost-center');
  };

  // 导出报表
  const handleExportReport = () => {
    if (!filteredData) return;

    // 生成 CSV 内容
    const headers = ['项目名称', '状态', '总收入(万元)', '总成本(万元)', '材料机械成本(万元)', '工人工资总额(万元)', '综合费用(万元)', '税费(万元)', '零星材料(万元)', '利润(万元)', '利润率(%)', '人工占比(%)'];
    const rows = filteredData.projects.map(p => [
      p.name,
      p.status,
      (p.totalIncome / 10000).toFixed(2),
      (p.totalCost / 10000).toFixed(2),
      (p.settlementAmount / 10000).toFixed(2),
      (p.salaryAmount / 10000).toFixed(2),
      (p.expenseAmount / 10000).toFixed(2),
      (p.taxAmount / 10000).toFixed(2),
      ((p.miscMaterialAmount || 0) / 10000).toFixed(2),
      (p.profit / 10000).toFixed(2),
      p.profitRate.toFixed(2),
      p.laborCostRate.toFixed(2),
    ]);

    // 添加汇总行
    rows.push([
      '合计',
      '-',
      (filteredData.summary.totalIncome / 10000).toFixed(2),
      (filteredData.summary.totalCost / 10000).toFixed(2),
      (filteredData.summary.totalSettlement / 10000).toFixed(2),  // 材料机械成本
      (filteredData.summary.totalSalary / 10000).toFixed(2),      // 工人工资总额
      (filteredData.summary.totalExpense / 10000).toFixed(2),
      (filteredData.summary.totalTax / 10000).toFixed(2),
      ((filteredData.summary.totalMiscMaterial || 0) / 10000).toFixed(2),
      (filteredData.summary.totalProfit / 10000).toFixed(2),
      filteredData.summary.avgProfitRate.toFixed(2),
      filteredData.summary.avgLaborCostRate.toFixed(2),
    ]);

    const csvContent = '\uFEFF' + [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `成本利润报表_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-12 h-12 mx-auto mb-4 border-4 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
          <p style={{ color: '#86909C' }}>加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className={`flex items-center justify-between transition-all duration-500 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
        <div>
          <h1 className="text-xl font-semibold tracking-tight" style={{ color: '#1D2129' }}>成本利润中心</h1>
          <p className="text-sm mt-1" style={{ color: '#86909C' }}>项目成本分析 · 利润统计 · 异常预警</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={handleExportReport}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors hover:opacity-90"
            style={{ background: '#165DFF', color: '#FFFFFF' }}
          >
            <Download className="w-4 h-4" />
            导出报表
          </button>
          <button 
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors hover:bg-gray-100"
            style={{ color: '#165DFF', border: '1px solid #E5E6EB' }}
          >
            <Printer className="w-4 h-4" />
            打印
          </button>
          <button 
            onClick={fetchData}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors hover:bg-gray-100"
            style={{ color: '#165DFF', border: '1px solid #E5E6EB' }}
          >
            <RefreshCw className="w-4 h-4" />
            刷新
          </button>
        </div>
      </div>

      {/* 项目筛选 */}
      <div className={`flex items-center gap-4 transition-all duration-500 delay-75 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4" style={{ color: '#86909C' }} />
          <span className="text-sm font-medium" style={{ color: '#1D2129' }}>项目筛选：</span>
        </div>
        <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
          <SelectTrigger className="w-[240px] bg-white" style={{ border: '1px solid #E5E6EB' }}>
            <SelectValue placeholder="选择项目" />
          </SelectTrigger>
          <SelectContent className="bg-white">
            <SelectItem value="all">
              <div className="flex items-center gap-2">
                <PieChart className="w-4 h-4" style={{ color: '#165DFF' }} />
                <span>全部项目（{data?.projects?.length || 0}个）</span>
              </div>
            </SelectItem>
            {data?.projects?.map((project) => (
              <SelectItem key={project.id} value={project.id.toString()}>
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${
                    project.status === '进行中' || project.status === '在建' ? 'bg-blue-500' :
                    ['已完成', '竣工结算', '质保期', '质保期满'].includes(project.status) ? 'bg-green-500' :
                    project.status === '暂停' ? 'bg-yellow-500' : 'bg-gray-400'
                  }`} />
                  <span>{project.name}</span>
                  <span className="text-xs" style={{ color: '#86909C' }}>({project.status})</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedProjectId !== 'all' && (
          <button
            onClick={clearFilter}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm transition-colors hover:bg-gray-100"
            style={{ color: '#86909C', border: '1px solid #E5E6EB' }}
          >
            <X className="w-4 h-4" />
            清除筛选
          </button>
        )}
      </div>

      {/* 预警提醒条 */}
      {filteredData && (filteredData.warnings?.length || 0) > 0 && (
        <div className={`transition-all duration-500 delay-100 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
          <div className="flex items-start gap-3 px-4 py-3 rounded-xl" style={{ background: '#FFF7E8', border: '1px solid #FF7D00' }}>
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#FF7D00' }} />
            <div className="flex-1">
              <span className="text-sm font-medium" style={{ color: '#FF7D00' }}>
                发现 {filteredData.warnings?.length || 0} 项成本异常预警
              </span>
              <div className="mt-2 flex flex-wrap gap-2">
                {filteredData.warnings?.slice(0, 5).map((warning, index) => (
                  <span
                    key={index}
                    className="text-xs px-2 py-1 rounded"
                    style={{
                      background: warning.severity === 'high' ? '#FFECE8' : warning.severity === 'medium' ? '#FFF7E8' : '#E8F3FF',
                      color: warning.severity === 'high' ? '#F53F3F' : warning.severity === 'medium' ? '#FF7D00' : '#165DFF',
                    }}
                  >
                    {warning.projectName}: {warning.message}
                  </span>
                ))}
                {(filteredData.warnings?.length || 0) > 5 && (
                  <span className="text-xs px-2 py-1 rounded" style={{ background: '#F2F3F5', color: '#86909C' }}>
                    +{(filteredData.warnings?.length || 0) - 5} 项
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 经营风险概览 */}
      {filteredData && (
        <div className={`grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 transition-all duration-500 delay-100 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
          {(() => {
            const totalIncome = filteredData.summary?.totalIncome || 0;
            const totalCost = filteredData.summary?.totalCost || 0;
            const totalProfit = filteredData.summary?.totalProfit || 0;
            const profitRate = totalIncome > 0 ? (totalProfit / totalIncome) * 100 : 0;
            const lossProjects = (filteredData.projects || []).filter(p => p.profit < 0);
            const costOverIncomeProjects = (filteredData.projects || []).filter(p => p.totalCost > p.totalIncome && p.totalIncome > 0);
            const highLaborProjects = (filteredData.projects || []).filter(p => p.totalIncome > 0 && (p.laborCostRate || 0) > 60);
            return (
              <>
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl" style={{ background: '#F0F5FF', border: '1px solid #BEDAFF' }}>
                  <DollarSign className="w-5 h-5" style={{ color: '#165DFF' }} />
                  <div>
                    <p className="text-xs" style={{ color: '#86909C' }}>总收入</p>
                    <p className="text-lg font-bold" style={{ color: '#165DFF' }}>{formatAmountSmart(totalIncome)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl" style={{ background: totalCost > totalIncome ? '#FFF2E8' : '#FFF7E8', border: `1px solid ${totalCost > totalIncome ? '#FF7D00' : '#FFCF8B'}` }}>
                  <Wallet className="w-5 h-5" style={{ color: totalCost > totalIncome ? '#F53F3F' : '#FF7D00' }} />
                  <div>
                    <p className="text-xs" style={{ color: '#86909C' }}>总成本</p>
                    <p className="text-lg font-bold" style={{ color: totalCost > totalIncome ? '#F53F3F' : '#FF7D00' }}>{formatAmountSmart(totalCost)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl" style={{ background: totalProfit >= 0 ? '#E8FFEA' : '#FFECE8', border: `1px solid ${totalProfit >= 0 ? '#00B42A' : '#F53F3F'}` }}>
                  <TrendingUp className="w-5 h-5" style={{ color: totalProfit >= 0 ? '#00B42A' : '#F53F3F' }} />
                  <div>
                    <p className="text-xs" style={{ color: '#86909C' }}>利润</p>
                    <p className="text-lg font-bold" style={{ color: totalProfit >= 0 ? '#00B42A' : '#F53F3F' }}>{formatAmountSmart(totalProfit)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl" style={{ background: profitRate >= 0 ? '#E8FFEA' : '#FFECE8', border: `1px solid ${profitRate >= 0 ? '#00B42A' : '#F53F3F'}` }}>
                  <Target className="w-5 h-5" style={{ color: profitRate >= 0 ? '#00B42A' : '#F53F3F' }} />
                  <div>
                    <p className="text-xs" style={{ color: '#86909C' }}>利润率</p>
                    <p className="text-lg font-bold" style={{ color: profitRate >= 0 ? '#00B42A' : '#F53F3F' }}>{formatPercent(profitRate)}</p>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5 px-4 py-3 rounded-xl" style={{ background: (lossProjects.length + costOverIncomeProjects.length) > 0 ? '#FFECE8' : '#E8FFEA', border: `1px solid ${(lossProjects.length + costOverIncomeProjects.length) > 0 ? '#F53F3F' : '#00B42A'}` }}>
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" style={{ color: (lossProjects.length + costOverIncomeProjects.length) > 0 ? '#F53F3F' : '#00B42A' }} />
                    <span className="text-xs font-medium" style={{ color: (lossProjects.length + costOverIncomeProjects.length) > 0 ? '#F53F3F' : '#00B42A' }}>
                      {(lossProjects.length + costOverIncomeProjects.length) > 0 ? '存在经营风险' : '经营正常'}
                    </span>
                  </div>
                  {lossProjects.length > 0 && (
                    <p className="text-xs" style={{ color: '#F53F3F' }}>亏损项目：{lossProjects.length} 个</p>
                  )}
                  {costOverIncomeProjects.length > 0 && (
                    <p className="text-xs" style={{ color: '#FF7D00' }}>成本超收：{costOverIncomeProjects.length} 个</p>
                  )}
                  {highLaborProjects.length > 0 && (
                    <p className="text-xs" style={{ color: '#FF7D00' }}>人工占比&gt;60%：{highLaborProjects.length} 个</p>
                  )}
                  {(lossProjects.length + costOverIncomeProjects.length + highLaborProjects.length) === 0 && (
                    <p className="text-xs" style={{ color: '#00B42A' }}>所有项目经营正常</p>
                  )}
                </div>
              </>
            );
          })()}
        </div>
      )}

      {/* 核心指标卡片 */}
      <div className={`grid grid-cols-2 lg:grid-cols-6 gap-4 transition-all duration-500 delay-150 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
        {/* 总成本 */}
        <Card className="group hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 relative" style={{ background: '#FFFFFF', border: '1px solid #E5E6EB' }}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-1">
                  <p className="text-sm font-medium" style={{ color: '#86909C' }}>总成本</p>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="w-3.5 h-3.5 cursor-help" style={{ color: '#C9CDD4' }} />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs">
                        <p className="text-xs">总成本 = 材料机械成本 + 工人工资总额 + 综合费用 + 税费</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <div className="flex items-baseline gap-1 mt-2">
                  <span className="text-2xl font-bold" style={{ color: '#1D2129' }}>
                    {formatWanYuan(filteredData?.summary.totalCost || 0).replace('¥', '')}
                  </span>
                  <span className="text-xs font-medium" style={{ color: '#86909C' }}>万元</span>
                </div>
                <p className="text-xs mt-1" style={{ color: '#C9CDD4' }}>项目累计投入</p>
              </div>
              <div className="w-11 h-11 rounded-xl flex items-center justify-center text-2xl group-hover:scale-110 transition-transform duration-300" style={{ background: '#F2F3F5' }}>
                💰
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 材料机械成本 */}
        <Card className="group hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 relative" style={{ background: '#FFFFFF', border: '1px solid #E5E6EB' }}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-sm font-medium" style={{ color: '#86909C' }}>材料机械成本</p>
                <div className="flex items-baseline gap-1 mt-2">
                  <span className="text-2xl font-bold" style={{ color: '#FF7D00' }}>
                    {formatWanYuan(filteredData?.summary.totalSettlement || 0).replace('¥', '')}
                  </span>
                  <span className="text-xs font-medium" style={{ color: '#86909C' }}>万元</span>
                </div>
                <p className="text-xs mt-1" style={{ color: '#C9CDD4' }}>供应商及班组结算</p>
              </div>
              <div className="w-11 h-11 rounded-xl flex items-center justify-center text-2xl group-hover:scale-110 transition-transform duration-300" style={{ background: '#FFF7E8' }}>
                📦
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 工人工资总额 */}
        <Card className="group hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 relative" style={{ background: '#FFFFFF', border: '1px solid #E5E6EB' }}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-sm font-medium" style={{ color: '#86909C' }}>工人工资总额</p>
                <div className="flex items-baseline gap-1 mt-2">
                  <span className="text-2xl font-bold" style={{ color: '#722ED1' }}>
                    {formatWanYuan(filteredData?.summary.totalSalary || 0).replace('¥', '')}
                  </span>
                  <span className="text-xs font-medium" style={{ color: '#86909C' }}>万元</span>
                </div>
                <p className="text-xs mt-1" style={{ color: filteredData?.summary.avgLaborCostRate && filteredData.summary.avgLaborCostRate > 60 ? '#FF7D00' : '#C9CDD4' }}>
                  占比 {formatPercent(filteredData?.summary.avgLaborCostRate || 0)}%
                  {filteredData?.summary.avgLaborCostRate && filteredData.summary.avgLaborCostRate > 60 && ' · 偏高'}
                </p>
              </div>
              <div className="w-11 h-11 rounded-xl flex items-center justify-center text-2xl group-hover:scale-110 transition-transform duration-300" style={{ background: '#F5E8FF' }}>
                👥
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 综合费用 */}
        <Card className="group hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 relative" style={{ background: '#FFFFFF', border: '1px solid #E5E6EB' }}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-sm font-medium" style={{ color: '#86909C' }}>综合费用</p>
                <div className="flex items-baseline gap-1 mt-2">
                  <span className="text-2xl font-bold" style={{ color: '#0FC6C2' }}>
                    {formatWanYuan(filteredData?.summary.totalExpense || 0).replace('¥', '')}
                  </span>
                  <span className="text-xs font-medium" style={{ color: '#86909C' }}>万元</span>
                </div>
                <p className="text-xs mt-1" style={{ color: filteredData?.summary.avgExpenseRate && filteredData.summary.avgExpenseRate > 20 ? '#F53F3F' : '#C9CDD4' }}>
                  占比 {formatPercent(filteredData?.summary.avgExpenseRate || 0)}%
                  {filteredData?.summary.avgExpenseRate && filteredData.summary.avgExpenseRate > 20 && ' · 偏高'}
                </p>
              </div>
              <div className="w-11 h-11 rounded-xl flex items-center justify-center text-2xl group-hover:scale-110 transition-transform duration-300" style={{ background: '#E8FFFE' }}>
                📋
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 税费 */}
        <Card className="group hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 relative" style={{ background: '#FFFFFF', border: '1px solid #E5E6EB' }}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-1">
                  <p className="text-sm font-medium" style={{ color: '#86909C' }}>税费</p>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="w-3.5 h-3.5 cursor-help" style={{ color: '#C9CDD4' }} />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs">
                        <p className="text-xs">税费 = 开票金额 − 不含税收入，从产值结算自动计算</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <div className="flex items-baseline gap-1 mt-2">
                  <span className="text-2xl font-bold" style={{ color: '#F77234' }}>
                    {formatWanYuan(filteredData?.summary.totalTax || 0).replace('¥', '')}
                  </span>
                  <span className="text-xs font-medium" style={{ color: '#86909C' }}>万元</span>
                </div>
                <p className="text-xs mt-1" style={{ color: '#C9CDD4' }}>
                  占比 {formatPercent(filteredData?.summary.avgTaxRate || 0)}%
                </p>
              </div>
              <div className="w-11 h-11 rounded-xl flex items-center justify-center text-2xl group-hover:scale-110 transition-transform duration-300" style={{ background: '#FFF3E8' }}>
                🧾
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 零星材料 */}
        <Card className="group hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 relative" style={{ background: '#FFFFFF', border: '1px solid #E5E6EB' }}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-1">
                  <p className="text-sm font-medium" style={{ color: '#86909C' }}>零星材料</p>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="w-3.5 h-3.5 cursor-help" style={{ color: '#C9CDD4' }} />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs">
                        <p className="text-xs">零星材料成本，自动计入项目总成本</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <div className="flex items-baseline gap-1 mt-2">
                  <span className="text-2xl font-bold" style={{ color: '#86909C' }}>
                    {formatWanYuan(filteredData?.summary.totalMiscMaterial || 0).replace('¥', '')}
                  </span>
                  <span className="text-xs font-medium" style={{ color: '#86909C' }}>万元</span>
                </div>
                <p className="text-xs mt-1" style={{ color: '#C9CDD4' }}>
                  占比 {formatPercent(filteredData?.summary.avgMiscMaterialRate || 0)}%
                </p>
              </div>
              <div className="w-11 h-11 rounded-xl flex items-center justify-center text-2xl group-hover:scale-110 transition-transform duration-300" style={{ background: '#F2F3F5' }}>
                📦
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 项目利润 */}
        <Card className="group hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 relative" style={{ background: 'linear-gradient(135deg, #00B42A 0%, #36D399 100%)', border: 'none' }}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-1">
                  <p className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.9)' }}>项目利润</p>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="w-3.5 h-3.5 cursor-help" style={{ color: 'rgba(255,255,255,0.7)' }} />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs">
                        <p className="text-xs">利润 = 含税收入 - 总成本，利润率 = 利润 / 含税收入 × 100%</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <div className="flex items-baseline gap-1 mt-2">
                  <span className="text-2xl font-bold text-white">
                    {filteredData?.summary.totalProfit && filteredData.summary.totalProfit < 0 ? '-' : ''}{formatWanYuan(Math.abs(filteredData?.summary.totalProfit || 0)).replace('¥', '')}
                  </span>
                  <span className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.8)' }}>万元</span>
                </div>
                <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.9)' }}>
                  利润率 {formatPercent(filteredData?.summary.avgProfitRate || 0)}%
                  {(filteredData?.summary.totalProfit || 0) < 0 && ' · 亏损'}
                </p>
              </div>
              <div className="w-11 h-11 rounded-xl flex items-center justify-center text-2xl group-hover:scale-110 transition-transform duration-300" style={{ background: 'rgba(255,255,255,0.2)' }}>
                📈
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 收入/成本构成分析 */}
      {/* 资金闭环概览 */}
      {filteredData && (
        <div className={`transition-all duration-500 delay-200 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          <Card className="hover:shadow-lg transition-all" style={{ background: '#FFFFFF', border: '1px solid #E5E6EB' }}>
            <CardHeader className="py-3 border-b" style={{ borderColor: '#E5E6EB' }}>
              <CardTitle className="flex items-center gap-2 text-sm font-semibold" style={{ color: '#1D2129' }}>
                <Wallet className="w-4 h-4" style={{ color: '#165DFF' }} />
                资金闭环概览
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
                {[
                  { label: '已回款', value: filteredData.summary.totalClientPaid, desc: `回款率 ${formatPercent(filteredData.summary.avgPaymentRate)}%`, color: '#00B42A', bg: '#E8FFEA' },
                  { label: '应收未回', value: filteredData.summary.totalReceivable, desc: '客户侧待回款', color: filteredData.summary.totalReceivable > 0 ? '#FF7D00' : '#00B42A', bg: filteredData.summary.totalReceivable > 0 ? '#FFF7E8' : '#E8FFEA' },
                  { label: '已支付', value: filteredData.summary.totalCashOut, desc: `供应商 ${formatAmountSmart(filteredData.summary.totalSupplierPaid)} / 工资 ${formatAmountSmart(filteredData.summary.totalWorkerPaid)}`, color: '#165DFF', bg: '#E8F3FF' },
                  { label: '应付未付', value: filteredData.summary.totalPayable, desc: `付款率 ${formatPercent(filteredData.summary.avgPayablePaymentRate)}%`, color: filteredData.summary.totalPayable > 0 ? '#F53F3F' : '#00B42A', bg: filteredData.summary.totalPayable > 0 ? '#FFECE8' : '#E8FFEA' },
                  { label: '现金净流', value: filteredData.summary.totalNetCashFlow, desc: '已回款 - 已支付', color: filteredData.summary.totalNetCashFlow >= 0 ? '#00B42A' : '#F53F3F', bg: filteredData.summary.totalNetCashFlow >= 0 ? '#E8FFEA' : '#FFECE8' },
                  { label: '资金缺口', value: filteredData.summary.totalFundingGap, desc: filteredData.summary.totalFundingGap > 0 ? '需重点跟进' : '暂无缺口', color: filteredData.summary.totalFundingGap > 0 ? '#F53F3F' : '#00B42A', bg: filteredData.summary.totalFundingGap > 0 ? '#FFECE8' : '#E8FFEA' },
                ].map((item) => (
                  <div key={item.label} className="rounded-lg border px-3 py-3" style={{ borderColor: '#E5E6EB', background: item.bg }}>
                    <p className="text-xs font-medium" style={{ color: '#4E5969' }}>{item.label}</p>
                    <p className="text-xl font-bold tabular-nums mt-1" style={{ color: item.color }}>{formatAmountSmart(item.value)}</p>
                    <p className="text-xs mt-1 truncate" style={{ color: '#86909C' }} title={item.desc}>{item.desc}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className={`grid grid-cols-1 lg:grid-cols-2 gap-5 transition-all duration-500 delay-200 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
        <IncomeCompositionChart projectId={selectedProjectId} />
        <CostCompositionChart projectId={selectedProjectId} />
      </div>

      {/* 项目利润统计表格 */}
      <div className={`transition-all duration-500 delay-300 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
        <Card className="hover:shadow-lg transition-all" style={{ background: '#FFFFFF', border: '1px solid #E5E6EB' }}>
          <CardHeader className="py-3 border-b" style={{ borderColor: '#E5E6EB' }}>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold" style={{ color: '#1D2129' }}>
                <BarChart3 className="w-4 h-4" style={{ color: '#165DFF' }} />
                项目利润统计
              </CardTitle>
              <div className="flex items-center gap-2">
                <span className="text-xs" style={{ color: '#86909C' }}>{filteredData?.projects.length || 0} 个项目</span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {filteredData && (filteredData.projects?.length || 0) > 0 ? (
              <>
                {/* 桌面端表格 */}
                <div className="hidden md:block overflow-x-auto max-h-96">
                  <table className="w-full">
                    <thead className="sticky top-0 z-10">
                      <tr style={{ background: '#F7F8FA' }}>
                        <th className="px-4 py-3 text-left text-xs font-medium" style={{ color: '#86909C' }}>项目名称</th>
                        <th className="px-4 py-3 text-center text-xs font-medium" style={{ color: '#86909C' }}>状态</th>
                        <th className="px-4 py-3 text-right text-xs font-medium" style={{ color: '#86909C' }}>总收入(万元)</th>
                        <th className="px-4 py-3 text-right text-xs font-medium" style={{ color: '#86909C' }}>总成本(万元)</th>
                        <th className="px-4 py-3 text-right text-xs font-medium" style={{ color: '#86909C' }}>材料机械(万元)</th>
                        <th className="px-4 py-3 text-right text-xs font-medium" style={{ color: '#86909C' }}>工人工资(万元)</th>
                        <th className="px-4 py-3 text-right text-xs font-medium" style={{ color: '#86909C' }}>综合费用(万元)</th>
                        <th className="px-4 py-3 text-right text-xs font-medium" style={{ color: '#86909C' }}>税费(万元)</th>
                        <th className="px-4 py-3 text-right text-xs font-medium" style={{ color: '#86909C' }}>零星材料(万元)</th>
                        <th className="px-4 py-3 text-right text-xs font-medium" style={{ color: '#86909C' }}>利润(万元)</th>
                        <th className="px-4 py-3 text-center text-xs font-medium" style={{ color: '#86909C' }}>利润率</th>
                        <th className="px-4 py-3 text-center text-xs font-medium" style={{ color: '#86909C' }}>人工占比</th>
                        <th className="px-4 py-3 text-center text-xs font-medium" style={{ color: '#86909C' }}>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredData.projects.map((project, index) => (
                        <tr 
                          key={project.id} 
                          className={`transition-colors cursor-pointer ${project.profit < 0 ? 'bg-red-50 hover:bg-red-100' : index % 2 === 1 ? 'bg-gray-50 hover:bg-blue-50' : 'hover:bg-blue-50'}`}
                        >
                          <td className="px-4 py-3">
                            <span className="font-medium text-sm" style={{ color: '#1D2129' }}>
                              {project.name}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            {getStatusTag(project.status)}
                          </td>
                          <td className="px-4 py-3 text-right text-sm" style={{ color: '#165DFF' }}>
                            {project.totalIncome > 0 ? formatWanYuan(project.totalIncome) : '暂无数据'}
                          </td>
                          <td className="px-4 py-3 text-right text-sm" style={{ color: '#1D2129' }}>
                            {project.totalCost > 0 ? formatWanYuan(project.totalCost) : '暂无数据'}
                          </td>
                          <td className="px-4 py-3 text-right text-sm" style={{ color: '#FF7D00' }}>
                            {project.settlementAmount > 0 ? formatWanYuan(project.settlementAmount) : '暂无数据'}
                          </td>
                          <td className="px-4 py-3 text-right text-sm" style={{ color: '#722ED1' }}>
                            {project.salaryAmount > 0 ? formatWanYuan(project.salaryAmount) : '暂无数据'}
                          </td>
                          <td className="px-4 py-3 text-right text-sm" style={{ color: '#0FC6C2' }}>
                            {project.expenseAmount > 0 ? formatWanYuan(project.expenseAmount) : '暂无数据'}
                          </td>
                          <td className="px-4 py-3 text-right text-sm" style={{ color: '#F77234' }}>
                            {project.taxAmount > 0 ? formatWanYuan(project.taxAmount) : '暂无数据'}
                          </td>
                          <td className="px-4 py-3 text-right text-sm" style={{ color: '#86909C' }}>
                            {(project.miscMaterialAmount || 0) > 0 ? formatWanYuan(project.miscMaterialAmount || 0) : '暂无数据'}
                          </td>
                          <td className="px-4 py-3 text-right text-sm font-medium" style={{ color: project.profit >= 0 ? '#00B42A' : '#F53F3F' }}>
                            {project.profit !== 0 ? `${project.profit < 0 ? '-' : ''}${formatWanYuan(Math.abs(project.profit))}` : '暂无数据'}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <div className="w-16 h-2 rounded-full overflow-hidden" style={{ background: '#F2F3F5' }}>
                                <div 
                                  className="h-full rounded-full transition-all"
                                  style={{ 
                                    width: `${Math.min(Math.abs(project.profitRate), 100)}%`,
                                    background: project.profitRate >= 30 ? '#00B42A' : project.profitRate >= 10 ? '#FFAA00' : project.profitRate >= 0 ? '#FF7D00' : '#F53F3F'
                                  }}
                                />
                              </div>
                              <span className={`text-xs font-medium ${
                                project.profitRate < 0 ? 'text-red-600' :
                                project.profitRate < 10 ? 'text-orange-600' :
                                project.profitRate < 30 ? 'text-yellow-600' :
                                'text-green-600'
                              }`}>
                                {formatPercent(project.profitRate)}%
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`text-sm ${project.laborCostRate > 50 ? 'text-orange-500 font-medium' : 'text-gray-600'}`}>
                              {formatPercent(project.laborCostRate)}%
                              {project.laborCostRate > 50 && <span className="ml-1">⚠️</span>}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Link 
                                    href={`/projects/${project.id}`}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors"
                                    style={{ background: '#E8F3FF', color: '#165DFF' }}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <Eye className="w-3 h-3" />
                                    查看
                                  </Link>
                                </TooltipTrigger>
                                <TooltipContent side="top">
                                  <p className="text-xs">查看项目详情</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {/* 合计行 */}
                    <tfoot className="sticky bottom-0 z-10" style={{ background: '#E8F3FF' }}>
                      <tr style={{ background: '#E8F3FF' }}>
                        <td className="px-4 py-3 text-left text-sm font-semibold" style={{ color: '#1D2129' }}>
                          合计 ({filteredData.projects.length}个项目)
                        </td>
                        <td className="px-4 py-3 text-center text-sm" style={{ color: '#86909C' }}>-</td>
                        <td className="px-4 py-3 text-right text-sm font-semibold" style={{ color: '#165DFF' }}>
                          {formatWanYuan(filteredData.summary.totalIncome)}
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-semibold" style={{ color: '#1D2129' }}>
                          {formatWanYuan(filteredData.summary.totalCost)}
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-semibold" style={{ color: '#FF7D00' }}>
                          {formatWanYuan(filteredData.summary.totalSettlement)}
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-semibold" style={{ color: '#722ED1' }}>
                          {formatWanYuan(filteredData.summary.totalSalary)}
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-semibold" style={{ color: '#0FC6C2' }}>
                          {formatWanYuan(filteredData.summary.totalExpense)}
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-semibold" style={{ color: '#F77234' }}>
                          {formatWanYuan(filteredData.summary.totalTax)}
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-semibold" style={{ color: '#86909C' }}>
                          {formatWanYuan(filteredData.summary.totalMiscMaterial || 0)}
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-semibold" style={{ color: (filteredData.summary.totalProfit || 0) >= 0 ? '#00B42A' : '#F53F3F' }}>
                          {(filteredData.summary.totalProfit || 0) < 0 ? '-' : ''}{formatWanYuan(Math.abs(filteredData.summary.totalProfit || 0))}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="text-xs font-semibold" style={{ color: '#165DFF' }}>
                            {formatPercent(filteredData.summary.avgProfitRate)}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="text-xs font-semibold" style={{ color: '#86909C' }}>
                            {formatPercent(filteredData.summary.avgLaborCostRate)}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="text-xs" style={{ color: '#86909C' }}>-</span>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                
                {/* 移动端卡片式布局 */}
                <div className="md:hidden p-4 space-y-3">
                  {filteredData.projects.map((project) => (
                    <div 
                      key={project.id}
                      className={`p-4 rounded-lg border ${project.profit < 0 ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}
                      onClick={() => setSelectedProjectId(project.id.toString())}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <span className="font-medium" style={{ color: '#1D2129' }}>{project.name}</span>
                        {getStatusTag(project.status)}
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span style={{ color: '#86909C' }}>总收入：</span>
                          <span style={{ color: '#165DFF' }}>{project.totalIncome > 0 ? `${formatWanYuan(project.totalIncome)} 万元` : '暂无数据'}</span>
                        </div>
                        <div>
                          <span style={{ color: '#86909C' }}>总成本：</span>
                          <span style={{ color: '#1D2129' }}>{project.totalCost > 0 ? `${formatWanYuan(project.totalCost)} 万元` : '暂无数据'}</span>
                        </div>
                        <div>
                          <span style={{ color: '#86909C' }}>材料机械：</span>
                          <span style={{ color: '#FF7D00' }}>{project.settlementAmount > 0 ? `${formatWanYuan(project.settlementAmount)} 万元` : '暂无数据'}</span>
                        </div>
                        <div>
                          <span style={{ color: '#86909C' }}>工人工资：</span>
                          <span style={{ color: '#722ED1' }}>{project.salaryAmount > 0 ? `${formatWanYuan(project.salaryAmount)} 万元` : '暂无数据'}</span>
                        </div>
                        <div>
                          <span style={{ color: '#86909C' }}>综合费用：</span>
                          <span style={{ color: '#0FC6C2' }}>{project.expenseAmount > 0 ? `${formatWanYuan(project.expenseAmount)} 万元` : '暂无数据'}</span>
                        </div>
                        <div>
                          <span style={{ color: '#86909C' }}>税费：</span>
                          <span style={{ color: '#F77234' }}>{project.taxAmount > 0 ? `${formatWanYuan(project.taxAmount)} 万元` : '暂无数据'}</span>
                        </div>
                        <div>
                          <span style={{ color: '#86909C' }}>零星材料：</span>
                          <span style={{ color: '#86909C' }}>{(project.miscMaterialAmount || 0) > 0 ? `${formatWanYuan(project.miscMaterialAmount || 0)} 万元` : '暂无数据'}</span>
                        </div>
                        <div>
                          <span style={{ color: '#86909C' }}>利润：</span>
                          <span style={{ color: project.profit >= 0 ? '#00B42A' : '#F53F3F' }}>
                            {project.profit !== 0 ? `${project.profit < 0 ? '-' : ''}${formatWanYuan(Math.abs(project.profit))} 万元` : '暂无数据'}
                          </span>
                        </div>
                        <div>
                          <span style={{ color: '#86909C' }}>利润率：</span>
                          <span className={`${
                            project.profitRate < 0 ? 'text-red-600' :
                            project.profitRate < 10 ? 'text-orange-600' :
                            project.profitRate < 30 ? 'text-yellow-600' :
                            'text-green-600'
                          }`}>
                            {formatPercent(project.profitRate)}%
                          </span>
                        </div>
                      </div>
                      <div className="mt-3 pt-3 border-t border-gray-100 flex justify-end">
                        <Link 
                          href={`/projects/${project.id}`}
                          className="inline-flex items-center gap-1 px-3 py-1 rounded text-xs"
                          style={{ background: '#E8F3FF', color: '#165DFF' }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Eye className="w-3 h-3" />
                          查看详情
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="py-12 text-center">
                <BarChart3 className="w-12 h-12 mx-auto mb-3" style={{ color: '#C9CDD4' }} />
                <p className="text-sm" style={{ color: '#86909C' }}>暂无数据</p>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="w-4 h-4 mx-auto mt-2 cursor-help" style={{ color: '#C9CDD4' }} />
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p className="text-xs">请先录入相关业务数据</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 成本异常预警 */}
      {filteredData && (filteredData.warnings?.length || 0) > 0 && (
        <div className={`transition-all duration-500 delay-400 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          <Card className="hover:shadow-lg transition-all" style={{ background: '#FFFFFF', border: '1px solid #E5E6EB' }}>
            <CardHeader className="py-3 border-b cursor-pointer" style={{ borderColor: '#E5E6EB' }} onClick={() => toggleSection('warnings')}>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold" style={{ color: '#F53F3F' }}>
                  <AlertTriangle className="w-4 h-4" />
                  成本异常预警
                </CardTitle>
                <div className="flex items-center gap-2">
                  <span className="text-xs px-2 py-0.5 rounded" style={{ background: '#FFECE8', color: '#F53F3F' }}>
                    {filteredData.warnings?.length || 0} 项预警
                  </span>
                  {expandedSections.has('warnings') ? (
                    <ChevronUp className="w-4 h-4" style={{ color: '#86909C' }} />
                  ) : (
                    <ChevronDown className="w-4 h-4" style={{ color: '#86909C' }} />
                  )}
                </div>
              </div>
            </CardHeader>
            {expandedSections.has('warnings') && (
              <CardContent className="p-4">
                <div className="space-y-2">
                  {filteredData.warnings.map((warning, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 rounded-lg transition-all hover:shadow-md cursor-pointer"
                      style={{
                        background: warning.severity === 'high' ? '#FFECE8' : warning.severity === 'medium' ? '#FFF7E8' : '#E8F3FF',
                      }}
                      onClick={() => setSelectedProjectId(warning.projectId.toString())}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: warning.severity === 'high' ? '#FFB3A8' : warning.severity === 'medium' ? '#FFCF8B' : '#A8D4FF' }}>
                          {warning.severity === 'high' ? (
                            <AlertCircle className="w-4 h-4" style={{ color: '#F53F3F' }} />
                          ) : warning.severity === 'medium' ? (
                            <AlertTriangle className="w-4 h-4" style={{ color: '#FF7D00' }} />
                          ) : (
                            <AlertCircle className="w-4 h-4" style={{ color: '#165DFF' }} />
                          )}
                        </div>
                        <div>
                          <span className="font-medium" style={{ color: '#1D2129' }}>{warning.projectName}</span>
                          <span className="text-sm ml-2" style={{ color: warning.severity === 'high' ? '#F53F3F' : warning.severity === 'medium' ? '#FF7D00' : '#165DFF' }}>
                            {warning.message}
                          </span>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4" style={{ color: '#86909C' }} />
                    </div>
                  ))}
                </div>
              </CardContent>
            )}
          </Card>
        </div>
      )}

      {/* 无预警时显示正常状态 */}
      {filteredData && (filteredData.warnings?.length || 0) === 0 && (
        <div className={`transition-all duration-500 delay-400 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          <Card className="hover:shadow-lg transition-all" style={{ background: '#FFFFFF', border: '1px solid #E5E6EB' }}>
            <CardContent className="py-8">
              <div className="flex items-center justify-center gap-3">
                <CheckCircle2 className="w-6 h-6" style={{ color: '#00B42A' }} />
                <span className="text-base font-medium" style={{ color: '#00B42A' }}>所有项目成本正常，暂无预警</span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 说明信息 */}
      <div className={`transition-all duration-500 delay-500 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
        <Card style={{ background: '#F7F8FA', border: '1px solid #E5E6EB' }}>
          <CardContent className="py-4">
            <div className="text-sm space-y-2" style={{ color: '#86909C' }}>
              <p><strong>数据说明：</strong></p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>总收入 = 开票金额总额 + 已签回的签证金额</li>
                <li>总成本 = 材料机械成本 + 工人工资总额 + 综合费用</li>
                <li>利润 = 总收入 - 总成本</li>
                <li>利润率 = 利润 ÷ 总收入 × 100%</li>
                <li>人工费占比 = 工人工资总额 ÷ 总成本 × 100%</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
