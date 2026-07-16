'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';
import { Users, DollarSign, Clock, AlertCircle, RefreshCw } from 'lucide-react';
import { KpiCard, ChartCard, formatAmountSmart, formatPercent, RiskBadge } from '@/components/business/common';
import { StandardDashboardLayout } from '@/components/dashboard/standard-layout';
import { CollapsibleSection } from '@/components/dashboard/collapsible-section';
import { LinkableCell } from '@/components/linkable-cell';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

interface Worker {
  id: number;
  name: string;
  project_id: number;
  status: string;
}

interface WorkerSalary {
  id: number;
  worker_id: number;
  project_id: number;
  year_month: string;
  gross_pay: number | string | { [key: string]: string | number };
  net_pay: number | string | { [key: string]: string | number };
  paid_amount: number | string | { [key: string]: string | number };
}

interface Project {
  id: number;
  name: string;
}

interface ProjectStats {
  id?: number;
  unpaid: number;
  name: string;
  activeCount: number;
  grossPay: number;
  netPay: number;
  paid: number;
}

interface Stats {
  projectCount: number;
  activeWorkerCount: number;
  totalGrossPay: number;
  totalNetPay: number;
  totalPaid: number;
  totalUnpaid: number;
}

// 安全转换 numeric 类型
function toNumber(value: number | string | { [key: string]: string | number } | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return isNaN(parsed) ? 0 : parsed;
  }
  // 处理 Decimal.js 对象格式
  if (typeof value === 'object') {
    if ('$numberDecimal' in value) {
      const parsed = parseFloat(String(value.$numberDecimal));
      return isNaN(parsed) ? 0 : parsed;
    }
    // 处理 { "0": "-", "1": "2", ... } 格式
    const str = Object.keys(value)
      .filter(k => !isNaN(Number(k)))
      .sort((a, b) => Number(a) - Number(b))
      .map(k => String(value[k]))
      .join('');
    const parsed = parseFloat(str);
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

// 格式化金额
function formatCurrency(amount: number): string {
  return amount.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

export default function WorkerCostDashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [salaries, setSalaries] = useState<WorkerSalary[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  // 加载数据
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [projectsRes, workersRes, salariesRes] = await Promise.all([
        fetch('/api/projects', { credentials: 'include' }),
        fetch('/api/workers', { credentials: 'include' }),
        fetch('/api/worker-salaries', { credentials: 'include' }),
      ]);

      const projectsData = await projectsRes.json();
      const workersData = await workersRes.json();
      const salariesData = await salariesRes.json();

      const projectsArray = Array.isArray(projectsData.projects) ? projectsData.projects
        : Array.isArray(projectsData.data) ? projectsData.data
        : Array.isArray(projectsData) ? projectsData : [];
      
      const workersArray = Array.isArray(workersData.workers) ? workersData.workers
        : Array.isArray(workersData.data) ? workersData.data
        : Array.isArray(workersData) ? workersData : [];
      
      const salariesArray = Array.isArray(salariesData.salaries) ? salariesData.salaries
        : Array.isArray(salariesData.data) ? salariesData.data
        : Array.isArray(salariesData) ? salariesData : [];
      
      setProjects(projectsArray);
      setWorkers(workersArray);
      setSalaries(salariesArray);
    } catch (error) {
      console.error('加载数据失败:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 根据筛选过滤数据
  const filteredWorkers = useMemo(() => {
    if (selectedProject === 'all') return workers;
    return workers.filter(w => toNumber(w.project_id) === Number(selectedProject));
  }, [workers, selectedProject]);

  const filteredSalaries = useMemo(() => {
    if (selectedProject === 'all') return salaries;
    return salaries.filter(s => toNumber(s.project_id) === Number(selectedProject));
  }, [salaries, selectedProject]);

  // 统计数据
  const stats = useMemo(() => {
    const projectCount = selectedProject === 'all' ? projects.length : (selectedProject !== 'all' && selectedProject ? 1 : 0);
    
    // 在岗工人数（去重）
    const activeWorkerIds = new Set<number>();
    filteredWorkers.forEach(w => {
      if (w.status === 'in_service' || !w.status) {
        activeWorkerIds.add(w.id);
      }
    });
    const activeWorkerCount = activeWorkerIds.size;
    
    // 工资统计
    let totalGrossPay = 0; // 应付（应发工资 gross_pay）
    let totalNetPay = 0;   // 实发（扣除后的 net_pay）
    let totalPaid = 0;    // 已付（从发放记录表汇总）
    
    filteredSalaries.forEach(s => {
      totalGrossPay += toNumber(s.gross_pay);
      totalNetPay += toNumber(s.net_pay);
    });
    
    totalPaid = filteredSalaries.reduce((sum, s) => sum + toNumber(s.paid_amount), 0);
    
    const totalUnpaid = Math.max(0, totalNetPay - totalPaid);
    
    return { projectCount, activeWorkerCount, totalGrossPay, totalNetPay, totalPaid, totalUnpaid };
  }, [projects, selectedProject, filteredWorkers, filteredSalaries]);

  // 项目汇总表格数据 - 按项目年度汇总
  const projectSummaryData = useMemo(() => {
    const projectMap = new Map<number, ProjectStats>();
    
    // 初始化所有项目
    const projectList = selectedProject === 'all' ? projects : projects.filter(p => p.id === Number(selectedProject));
    projectList.forEach(p => {
      projectMap.set(p.id, { id: p.id, name: p.name, activeCount: 0, grossPay: 0, netPay: 0, paid: 0, unpaid: 0 });
    });
    
    // 统计在岗人数
    filteredWorkers.forEach(w => {
      if (w.status === 'in_service' || !w.status) {
        const pid = toNumber(w.project_id);
        const data = projectMap.get(pid);
        if (data) data.activeCount++;
      }
    });
    
    // 统计工资 - 应付(gross_pay)、实发(net_pay)
    filteredSalaries.forEach(s => {
      const pid = toNumber(s.project_id);
      const data = projectMap.get(pid);
      if (data) {
        data.grossPay += toNumber(s.gross_pay);  // 应付（应发工资）
        data.netPay += toNumber(s.net_pay);      // 实发
      }
    });
    
    filteredSalaries.forEach(s => {
      const pid = toNumber(s.project_id);
      const data = projectMap.get(pid);
      if (data) {
        data.paid += toNumber(s.paid_amount);
      }
    });
    
    return Array.from(projectMap.values()).map(item => ({
      ...item,
      unpaid: Math.max(0, item.netPay - item.paid),  // 未付 = 实发 - 已付
    }));
  }, [projects, selectedProject, filteredWorkers, filteredSalaries]);

  // 饼图数据（按实发金额占比）
  const pieData = useMemo(() => {
    return projectSummaryData
      .filter(d => d.netPay > 0)
      .map((d, i) => ({
        name: d.name,
        value: d.netPay,
        color: CHART_COLORS[i % CHART_COLORS.length],
      }));
  }, [projectSummaryData]);

  // 月度趋势数据
  const monthlyTrendData = useMemo(() => {
    const monthlyMap = new Map<string, { month: string; amount: number }>();
    
    filteredSalaries.forEach(s => {
      const month = s.year_month ? s.year_month.substring(0, 7) : '未知';
      const existing = monthlyMap.get(month) || { month, amount: 0 };
      existing.amount += toNumber(s.paid_amount);
      monthlyMap.set(month, existing);
    });
    
    return Array.from(monthlyMap.values())
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-12);
  }, [filteredSalaries]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">加载中...</div>
      </div>
    );
  }

  return (
    <StandardDashboardLayout
      title="工人成本统计看板"
      loading={loading}
      filterBar={
        <div className="flex items-center gap-2">
          <Select value={selectedProject} onValueChange={setSelectedProject}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="选择项目" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部项目</SelectItem>
              {projects.map(p => (
                <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            onClick={loadData}
            className="p-2 hover:bg-accent rounded-md transition-colors"
            title="刷新数据"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      }
      kpiSection={
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard label="项目总数" value={stats.projectCount.toString()} />
          <KpiCard label="现场工人数" value={stats.activeWorkerCount.toString()} />
          <KpiCard label="应付金额" value={formatAmountSmart(stats.totalGrossPay)} />
          <KpiCard label="实发金额" value={formatAmountSmart(stats.totalNetPay)} />
          <KpiCard label="已付金额" value={formatAmountSmart(stats.totalPaid)} />
          <KpiCard label="未付金额" value={formatAmountSmart(stats.totalUnpaid)} unit="元"
            risk={stats.totalUnpaid > 0 ? 'danger' : 'normal'} />
        </div>
      }
      chartSection={
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard title="各项目人工成本占比" height={280}>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="value"
                    label={({ name, percent }: { name: string; percent: number }) => `${name} ${(percent * 100).toFixed(1)}%`}
                    labelLine={false}
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value: number) => [formatAmountSmart(value), '人工成本']}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[280px] text-muted-foreground">
                暂无数据
              </div>
            )}
          </ChartCard>

          <ChartCard title="近12个月人工成本支出趋势" height={280}>
            {monthlyTrendData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={monthlyTrendData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="month" 
                    tick={{ fontSize: 12 }}
                    tickFormatter={(v: string) => v.substring(5)}
                  />
                  <YAxis 
                    tick={{ fontSize: 12 }}
                    tickFormatter={(v: number) => formatAmountSmart(v)}
                  />
                  <Tooltip 
                    formatter={(value: number) => [formatAmountSmart(value), '已付工资']}
                    labelFormatter={(label) => `${label}`}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="amount" 
                    stroke="#3b82f6" 
                    strokeWidth={2}
                    dot={{ fill: '#3b82f6', r: 4 }}
                    name="已付工资"
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[280px] text-muted-foreground">
                暂无数据
              </div>
            )}
          </ChartCard>
        </div>
      }
      ledgerSection={
        <CollapsibleSection title="项目年度工资汇总" defaultOpen={true}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium">项目名称</th>
                  <th className="text-right p-3 font-medium">在岗人数</th>
                  <th className="text-right p-3 font-medium">应付金额</th>
                  <th className="text-right p-3 font-medium">实发金额</th>
                  <th className="text-right p-3 font-medium">已付金额</th>
                  <th className="text-right p-3 font-medium">未付金额</th>
                </tr>
              </thead>
              <tbody>
                {projectSummaryData.map((item, idx) => (
                  <tr key={idx} className="border-b hover:bg-muted/30">
                    <td className="p-3 font-medium">
                      <LinkableCell href={`/projects/${item.id || ''}`}>{item.name}</LinkableCell>
                    </td>
                    <td className="p-3 text-right">{item.activeCount}</td>
                    <td className="p-3 text-right">{formatAmountSmart(item.grossPay)}</td>
                    <td className="p-3 text-right">{formatAmountSmart(item.netPay)}</td>
                    <td className="p-3 text-right">{formatAmountSmart(item.paid)}</td>
                    <td className={`p-3 text-right font-medium ${item.unpaid > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {formatAmountSmart(item.unpaid)}
                    </td>
                  </tr>
                ))}
                {projectSummaryData.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-muted-foreground">
                      暂无数据
                    </td>
                  </tr>
                )}
              </tbody>
              {projectSummaryData.length > 0 && (
                <tfoot>
                  <tr className="bg-muted/50 font-bold">
                    <td className="p-3">合计</td>
                    <td className="p-3 text-right">{projectSummaryData.reduce((s, d) => s + d.activeCount, 0)}</td>
                    <td className="p-3 text-right">{formatAmountSmart(projectSummaryData.reduce((s, d) => s + d.grossPay, 0))}</td>
                    <td className="p-3 text-right">{formatAmountSmart(projectSummaryData.reduce((s, d) => s + d.netPay, 0))}</td>
                    <td className="p-3 text-right">{formatAmountSmart(projectSummaryData.reduce((s, d) => s + d.paid, 0))}</td>
                    <td className="p-3 text-right text-red-600">
                      {formatAmountSmart(projectSummaryData.reduce((s, d) => s + d.unpaid, 0))}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </CollapsibleSection>
      }
    />
  );
}
