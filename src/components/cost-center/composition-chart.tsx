'use client';

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
} from 'recharts';
import { TrendingUp, TrendingDown, AlertTriangle, DollarSign, Wallet } from 'lucide-react';

// 类型定义
interface CompositionData {
  viewType: string;
  year: number;
  quarter: number;
  periodLabel: string;
  prevPeriodLabel: string;
  income: {
    total: number;
    invoice: {
      amount: number;
      percentage: number;
      changeRate: number;
      prevAmount: number;
    };
    visa: {
      amount: number;
      percentage: number;
      changeRate: number;
      prevAmount: number;
    };
    totalChangeRate: number;
    warning: boolean;
  };
  cost: {
    total: number;
    settlement: {
      amount: number;
      percentage: number;
      changeRate: number;
      prevAmount: number;
    };
    salary: {
      amount: number;
      percentage: number;
      changeRate: number;
      prevAmount: number;
    };
    expense: {
      amount: number;
      percentage: number;
      changeRate: number;
      prevAmount: number;
    };
    tax: {
      amount: number;
      percentage: number;
      changeRate: number;
      prevAmount: number;
    };
    miscMaterial: {
      amount: number;
      percentage: number;
      changeRate: number;
      prevAmount: number;
    };
    totalChangeRate: number;
    warning: boolean;
  };
}

interface CompositionChartProps {
  projectId?: string;
}

// 格式化金额为万元（纯数字，不带符号）
function formatWanYuan(amount: number): string {
  const wan = amount / 10000;
  if (wan === 0) return '0.00';
  return wan.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// 格式化百分比
function formatPercent(value: number): string {
  if (isNaN(value) || !isFinite(value)) return '0.0';
  return value.toFixed(1);
}

// 格式化环比
function formatChangeRate(rate: number): { text: string; color: string; icon: 'up' | 'down' | 'neutral' } {
  if (Math.abs(rate) < 0.1) {
    return { text: '持平', color: '#86909C', icon: 'neutral' };
  }
  if (rate > 0) {
    return { text: `↑${rate.toFixed(1)}%`, color: '#00B42A', icon: 'up' };
  }
  return { text: `↓${Math.abs(rate).toFixed(1)}%`, color: '#F53F3F', icon: 'down' };
}

// 生成年份选项
function generateYearOptions(): number[] {
  const currentYear = new Date().getFullYear();
  return [currentYear, currentYear - 1, currentYear - 2];
}

// 生成月度选项
const monthOptions = Array.from({ length: 12 }, (_, i) => ({
  value: i + 1,
  label: `${i + 1}月`,
}));

export function IncomeCompositionChart({ projectId }: CompositionChartProps) {
  const [viewType, setViewType] = useState<'monthly' | 'cumulative'>('monthly');
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [data, setData] = useState<CompositionData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [viewType, year, month, projectId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('viewType', viewType);
      params.append('year', year.toString());
      params.append('month', month.toString());
      if (projectId && projectId !== 'all') {
        params.append('projectId', projectId);
      }

      const res = await fetch(`/api/cost-center/composition?${params.toString()}`);
      const result = await res.json();
      if (!result.error) {
        setData(result);
      }
    } catch (error) {
      console.error('获取构成数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const pieData = data ? [
    { name: '开票金额', value: data.income.invoice.amount, color: '#165DFF' },
    { name: '签证收入', value: data.income.visa.amount, color: '#00B42A' },
  ] : [];

  const invoiceChange = data ? formatChangeRate(data.income.invoice.changeRate) : null;
  const visaChange = data ? formatChangeRate(data.income.visa.changeRate) : null;
  const totalChange = data ? formatChangeRate(data.income.totalChangeRate) : null;

  return (
    <Card className="hover:shadow-lg transition-all" style={{ background: '#FFFFFF', border: '1px solid #E5E6EB', borderRadius: '8px' }}>
      <CardHeader className="py-3 border-b" style={{ borderColor: '#E5E6EB' }}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold" style={{ color: '#1D2129' }}>
            <DollarSign className="w-4 h-4" style={{ color: '#165DFF' }} />
            收入构成分析
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Tabs value={viewType} onValueChange={(v) => setViewType(v as 'monthly' | 'cumulative')} className="w-auto">
              <TabsList className="h-7 p-0.5" style={{ background: '#F7F8FA' }}>
                <TabsTrigger 
                  value="monthly" 
                  className="h-6 px-3 text-xs data-[state=active]:bg-white data-[state=active]:shadow-sm"
                  style={{ color: viewType === 'monthly' ? '#165DFF' : '#86909C' }}
                >
                  月度
                </TabsTrigger>
                <TabsTrigger 
                  value="cumulative" 
                  className="h-6 px-3 text-xs data-[state=active]:bg-white data-[state=active]:shadow-sm"
                  style={{ color: viewType === 'cumulative' ? '#165DFF' : '#86909C' }}
                >
                  累计
                </TabsTrigger>
              </TabsList>
            </Tabs>
            {viewType === 'monthly' && (
              <div className="flex items-center gap-1">
                <Select value={year.toString()} onValueChange={(v) => setYear(parseInt(v))}>
                  <SelectTrigger className="w-20 h-7 text-xs" style={{ background: '#F7F8FA', border: '1px solid #E5E6EB' }}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {generateYearOptions().map(y => (
                      <SelectItem key={y} value={y.toString()} className="text-xs">{y}年</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={month.toString()} onValueChange={(v) => setMonth(parseInt(v))}>
                  <SelectTrigger className="w-16 h-7 text-xs" style={{ background: '#F7F8FA', border: '1px solid #E5E6EB' }}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {monthOptions.map(m => (
                      <SelectItem key={m.value} value={m.value.toString()} className="text-xs">{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-sm" style={{ color: '#86909C' }}>
            加载中...
          </div>
        ) : data && (data.income.invoice.amount > 0 || data.income.visa.amount > 0) ? (
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <div className="w-full sm:w-48 h-48 relative">
              <ResponsiveContainer width="100%" height="100%">
                <RechartsPieChart>
                  <RechartsTooltip
                    formatter={(value: number) => [`${(value / 10000).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}万元`, '']}
                  />
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={70}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                </RechartsPieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-center">
                  <p className="text-xs" style={{ color: '#86909C' }}>{data.periodLabel}</p>
                  <p className="text-sm font-bold" style={{ color: '#1D2129' }}>{formatWanYuan(data.income.total)}<span className="text-xs font-normal ml-0.5" style={{ color: '#86909C' }}>万元</span></p>
                </div>
              </div>
            </div>
            <div className="flex-1 space-y-3 w-full">
              {/* 开票金额 */}
              <div className="flex items-center justify-between p-2 rounded-lg" style={{ background: '#E8F3FF' }}>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ background: '#165DFF' }} />
                  <span className="text-sm" style={{ color: '#1D2129' }}>开票金额</span>
                </div>
                <div className="text-right flex items-center gap-2">
                  <span className="text-sm font-bold" style={{ color: '#165DFF' }}>
                    {formatWanYuan(data.income.invoice.amount)}
                  </span>
                  <span className="text-xs font-medium" style={{ color: '#86909C' }}>万元</span>
                  <span className="text-xs" style={{ color: '#86909C' }}>
                    ({formatPercent(data.income.invoice.percentage)}%)
                  </span>
                  {viewType === 'monthly' && invoiceChange && (
                    <span className="text-xs flex items-center" style={{ color: invoiceChange.color }}>
                      {invoiceChange.icon === 'up' && <TrendingUp className="w-3 h-3 mr-0.5" />}
                      {invoiceChange.icon === 'down' && <TrendingDown className="w-3 h-3 mr-0.5" />}
                      {invoiceChange.text}
                    </span>
                  )}
                </div>
              </div>
              {/* 签证收入 */}
              <div className="flex items-center justify-between p-2 rounded-lg" style={{ background: '#E8FFEA' }}>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ background: '#00B42A' }} />
                  <span className="text-sm" style={{ color: '#1D2129' }}>签证收入</span>
                </div>
                <div className="text-right flex items-center gap-2">
                  <span className="text-sm font-bold" style={{ color: '#00B42A' }}>
                    {formatWanYuan(data.income.visa.amount)}
                  </span>
                  <span className="text-xs font-medium" style={{ color: '#86909C' }}>万元</span>
                  <span className="text-xs" style={{ color: '#86909C' }}>
                    ({formatPercent(data.income.visa.percentage)}%)
                  </span>
                  {viewType === 'monthly' && visaChange && (
                    <span className="text-xs flex items-center" style={{ color: visaChange.color }}>
                      {visaChange.icon === 'up' && <TrendingUp className="w-3 h-3 mr-0.5" />}
                      {visaChange.icon === 'down' && <TrendingDown className="w-3 h-3 mr-0.5" />}
                      {visaChange.text}
                    </span>
                  )}
                </div>
              </div>
              {/* 总收入 */}
              <div className="flex items-center justify-between p-2 rounded-lg" style={{ background: '#F7F8FA' }}>
                <span className="text-sm" style={{ color: '#86909C' }}>总收入</span>
                <div className="text-right flex items-center gap-2">
                  <span className="text-sm font-bold" style={{ color: '#1D2129' }}>
                    {formatWanYuan(data.income.total)}
                  </span>
                  <span className="text-xs font-medium" style={{ color: '#86909C' }}>万元</span>
                  {viewType === 'monthly' && totalChange && (
                    <span className="text-xs flex items-center" style={{ color: totalChange.color }}>
                      {totalChange.icon === 'up' && <TrendingUp className="w-3 h-3 mr-0.5" />}
                      {totalChange.icon === 'down' && <TrendingDown className="w-3 h-3 mr-0.5" />}
                      {totalChange.text}
                    </span>
                  )}
                </div>
              </div>
              {/* 预警提示 */}
              {viewType === 'monthly' && data.income.warning && (
                <div className="flex items-center gap-2 p-2 rounded-lg" style={{ background: '#FFF7E8', border: '1px solid #FFD666' }}>
                  <AlertTriangle className="w-4 h-4" style={{ color: '#FF7D00' }} />
                  <span className="text-xs" style={{ color: '#FF7D00' }}>
                    收入环比下降超过10%，请关注
                  </span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-40 text-sm" style={{ color: '#86909C' }}>
            暂无数据
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function CostCompositionChart({ projectId }: CompositionChartProps) {
  const [viewType, setViewType] = useState<'monthly' | 'cumulative'>('monthly');
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [data, setData] = useState<CompositionData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [viewType, year, month, projectId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('viewType', viewType);
      params.append('year', year.toString());
      params.append('month', month.toString());
      if (projectId && projectId !== 'all') {
        params.append('projectId', projectId);
      }

      const res = await fetch(`/api/cost-center/composition?${params.toString()}`);
      const result = await res.json();
      if (!result.error) {
        setData(result);
      }
    } catch (error) {
      console.error('获取构成数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const pieData = data ? [
    { name: '人工费', value: data.cost.salary?.amount || 0, color: '#722ED1' },
    { name: '材料机械', value: data.cost.settlement?.amount || 0, color: '#FF7D00' },
    { name: '综合费用', value: data.cost.expense?.amount || 0, color: '#0FC6C2' },
    { name: '税费', value: data.cost.tax?.amount || 0, color: '#F77234' },
    { name: '零星材料', value: data.cost.miscMaterial?.amount || 0, color: '#86909C' },
  ] : [];

  const salaryChange = data ? formatChangeRate(data.cost.salary?.changeRate || 0) : null;
  const settlementChange = data ? formatChangeRate(data.cost.settlement?.changeRate || 0) : null;
  const expenseChange = data ? formatChangeRate(data.cost.expense?.changeRate || 0) : null;
  const taxChange = data ? formatChangeRate(data.cost.tax?.changeRate || 0) : null;
  const miscMaterialChange = data ? formatChangeRate(data.cost.miscMaterial?.changeRate || 0) : null;
  const totalChange = data ? formatChangeRate(data.cost.totalChangeRate) : null;

  return (
    <Card className="hover:shadow-lg transition-all" style={{ background: '#FFFFFF', border: '1px solid #E5E6EB', borderRadius: '8px' }}>
      <CardHeader className="py-3 border-b" style={{ borderColor: '#E5E6EB' }}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold" style={{ color: '#1D2129' }}>
            <Wallet className="w-4 h-4" style={{ color: '#FF7D00' }} />
            成本构成分析
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Tabs value={viewType} onValueChange={(v) => setViewType(v as 'monthly' | 'cumulative')} className="w-auto">
              <TabsList className="h-7 p-0.5" style={{ background: '#F7F8FA' }}>
                <TabsTrigger 
                  value="monthly" 
                  className="h-6 px-3 text-xs data-[state=active]:bg-white data-[state=active]:shadow-sm"
                  style={{ color: viewType === 'monthly' ? '#165DFF' : '#86909C' }}
                >
                  月度
                </TabsTrigger>
                <TabsTrigger 
                  value="cumulative" 
                  className="h-6 px-3 text-xs data-[state=active]:bg-white data-[state=active]:shadow-sm"
                  style={{ color: viewType === 'cumulative' ? '#165DFF' : '#86909C' }}
                >
                  累计
                </TabsTrigger>
              </TabsList>
            </Tabs>
            {viewType === 'monthly' && (
              <div className="flex items-center gap-1">
                <Select value={year.toString()} onValueChange={(v) => setYear(parseInt(v))}>
                  <SelectTrigger className="w-20 h-7 text-xs" style={{ background: '#F7F8FA', border: '1px solid #E5E6EB' }}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {generateYearOptions().map(y => (
                      <SelectItem key={y} value={y.toString()} className="text-xs">{y}年</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={month.toString()} onValueChange={(v) => setMonth(parseInt(v))}>
                  <SelectTrigger className="w-16 h-7 text-xs" style={{ background: '#F7F8FA', border: '1px solid #E5E6EB' }}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {monthOptions.map(m => (
                      <SelectItem key={m.value} value={m.value.toString()} className="text-xs">{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-sm" style={{ color: '#86909C' }}>
            加载中...
          </div>
        ) : data && (data.cost.salary?.amount > 0 || data.cost.settlement?.amount > 0 || data.cost.expense?.amount > 0 || data.cost.tax?.amount > 0) ? (
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <div className="w-full sm:w-48 h-48 relative">
              <ResponsiveContainer width="100%" height="100%">
                <RechartsPieChart>
                  <RechartsTooltip
                    formatter={(value: number) => [`${(value / 10000).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}万元`, '']}
                  />
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={70}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                </RechartsPieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-center">
                  <p className="text-xs" style={{ color: '#86909C' }}>{data.periodLabel}</p>
                  <p className="text-sm font-bold" style={{ color: '#1D2129' }}>{formatWanYuan(data.cost.total)}<span className="text-xs font-normal ml-0.5" style={{ color: '#86909C' }}>万元</span></p>
                </div>
              </div>
            </div>
            <div className="flex-1 space-y-3 w-full">
              {/* 人工费 */}
              <div className="flex items-center justify-between p-2 rounded-lg" style={{ background: '#F5E8FF' }}>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ background: '#722ED1' }} />
                  <span className="text-sm" style={{ color: '#1D2129' }}>人工费</span>
                </div>
                <div className="text-right flex items-center gap-2">
                  <span className="text-sm font-bold" style={{ color: '#722ED1' }}>
                    {formatWanYuan(data.cost.salary?.amount || 0)}
                  </span>
                  <span className="text-xs font-medium" style={{ color: '#86909C' }}>万元</span>
                  <span className="text-xs" style={{ color: '#86909C' }}>
                    ({formatPercent(data.cost.salary?.percentage || 0)}%)
                  </span>
                  {viewType === 'monthly' && salaryChange && (
                    <span className="text-xs flex items-center" style={{ color: salaryChange.color }}>
                      {salaryChange.icon === 'up' && <TrendingUp className="w-3 h-3 mr-0.5" />}
                      {salaryChange.icon === 'down' && <TrendingDown className="w-3 h-3 mr-0.5" />}
                      {salaryChange.text}
                    </span>
                  )}
                </div>
              </div>
              {/* 材料机械成本 */}
              <div className="flex items-center justify-between p-2 rounded-lg" style={{ background: '#FFF7E8' }}>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ background: '#FF7D00' }} />
                  <span className="text-sm" style={{ color: '#1D2129' }}>材料机械成本</span>
                </div>
                <div className="text-right flex items-center gap-2">
                  <span className="text-sm font-bold" style={{ color: '#FF7D00' }}>
                    {formatWanYuan(data.cost.settlement?.amount || 0)}
                  </span>
                  <span className="text-xs font-medium" style={{ color: '#86909C' }}>万元</span>
                  <span className="text-xs" style={{ color: '#86909C' }}>
                    ({formatPercent(data.cost.settlement?.percentage || 0)}%)
                  </span>
                  {viewType === 'monthly' && settlementChange && (
                    <span className="text-xs flex items-center" style={{ color: settlementChange.color }}>
                      {settlementChange.icon === 'up' && <TrendingUp className="w-3 h-3 mr-0.5" />}
                      {settlementChange.icon === 'down' && <TrendingDown className="w-3 h-3 mr-0.5" />}
                      {settlementChange.text}
                    </span>
                  )}
                </div>
              </div>
              {/* 综合费用 */}
              <div className="flex items-center justify-between p-2 rounded-lg" style={{ background: '#E8FFFE' }}>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ background: '#0FC6C2' }} />
                  <span className="text-sm" style={{ color: '#1D2129' }}>综合费用</span>
                </div>
                <div className="text-right flex items-center gap-2">
                  <span className="text-sm font-bold" style={{ color: '#0FC6C2' }}>
                    {formatWanYuan(data.cost.expense?.amount || 0)}
                  </span>
                  <span className="text-xs font-medium" style={{ color: '#86909C' }}>万元</span>
                  <span className="text-xs" style={{ color: '#86909C' }}>
                    ({formatPercent(data.cost.expense?.percentage || 0)}%)
                  </span>
                  {viewType === 'monthly' && expenseChange && (
                    <span className="text-xs flex items-center" style={{ color: expenseChange.color }}>
                      {expenseChange.icon === 'up' && <TrendingUp className="w-3 h-3 mr-0.5" />}
                      {expenseChange.icon === 'down' && <TrendingDown className="w-3 h-3 mr-0.5" />}
                      {expenseChange.text}
                    </span>
                  )}
                </div>
              </div>
              {/* 税费 */}
              <div className="flex items-center justify-between p-2 rounded-lg" style={{ background: '#FFF7E8' }}>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ background: '#F77234' }} />
                  <span className="text-sm" style={{ color: '#1D2129' }}>税费</span>
                </div>
                <div className="text-right flex items-center gap-2">
                  <span className="text-sm font-bold" style={{ color: '#F77234' }}>
                    {formatWanYuan(data.cost.tax?.amount || 0)}
                  </span>
                  <span className="text-xs font-medium" style={{ color: '#86909C' }}>万元</span>
                  <span className="text-xs" style={{ color: '#86909C' }}>
                    ({formatPercent(data.cost.tax?.percentage || 0)}%)
                  </span>
                  {viewType === 'monthly' && taxChange && (
                    <span className="text-xs flex items-center" style={{ color: taxChange.color }}>
                      {taxChange.icon === 'up' && <TrendingUp className="w-3 h-3 mr-0.5" />}
                      {taxChange.icon === 'down' && <TrendingDown className="w-3 h-3 mr-0.5" />}
                      {taxChange.text}
                    </span>
                  )}
                </div>
              </div>
              {/* 零星材料 */}
              <div className="flex items-center justify-between p-2 rounded-lg" style={{ background: '#F2F3F5' }}>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ background: '#86909C' }} />
                  <span className="text-sm" style={{ color: '#1D2129' }}>零星材料</span>
                </div>
                <div className="text-right flex items-center gap-2">
                  <span className="text-sm font-bold" style={{ color: '#86909C' }}>
                    {formatWanYuan(data.cost.miscMaterial?.amount || 0)}
                  </span>
                  <span className="text-xs font-medium" style={{ color: '#86909C' }}>万元</span>
                  <span className="text-xs" style={{ color: '#86909C' }}>
                    ({formatPercent(data.cost.miscMaterial?.percentage || 0)}%)
                  </span>
                  {viewType === 'monthly' && miscMaterialChange && (
                    <span className="text-xs flex items-center" style={{ color: miscMaterialChange.color }}>
                      {miscMaterialChange.icon === 'up' && <TrendingUp className="w-3 h-3 mr-0.5" />}
                      {miscMaterialChange.icon === 'down' && <TrendingDown className="w-3 h-3 mr-0.5" />}
                      {miscMaterialChange.text}
                    </span>
                  )}
                </div>
              </div>
              {/* 总成本 */}
              <div className="flex items-center justify-between p-2 rounded-lg" style={{ background: '#F7F8FA' }}>
                <span className="text-sm" style={{ color: '#86909C' }}>总成本</span>
                <div className="text-right flex items-center gap-2">
                  <span className="text-sm font-bold" style={{ color: '#1D2129' }}>
                    {formatWanYuan(data.cost.total)}
                  </span>
                  <span className="text-xs font-medium" style={{ color: '#86909C' }}>万元</span>
                  {viewType === 'monthly' && totalChange && (
                    <span className="text-xs flex items-center" style={{ color: totalChange.color }}>
                      {totalChange.icon === 'up' && <TrendingUp className="w-3 h-3 mr-0.5" />}
                      {totalChange.icon === 'down' && <TrendingDown className="w-3 h-3 mr-0.5" />}
                      {totalChange.text}
                    </span>
                  )}
                </div>
              </div>
              {/* 预警提示 */}
              {viewType === 'monthly' && data.cost.warning && (
                <div className="flex items-center gap-2 p-2 rounded-lg" style={{ background: '#FFF7E8', border: '1px solid #FFD666' }}>
                  <AlertTriangle className="w-4 h-4" style={{ color: '#FF7D00' }} />
                  <span className="text-xs" style={{ color: '#FF7D00' }}>
                    成本环比上升超过10%，请关注
                  </span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-40 text-sm" style={{ color: '#86909C' }}>
            暂无数据
          </div>
        )}
      </CardContent>
    </Card>
  );
}
