'use client';

import { useState, useEffect, useMemo, Fragment } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { 
  Search, RefreshCw, Download, User, Calendar, DollarSign,
  TrendingUp, FileSpreadsheet, ChevronDown, ChevronRight,
  AlertCircle, CheckCircle, Clock
} from 'lucide-react';

interface Worker {
  id: number;
  name: string;
  work_type: string | null;
  project_id: number | null;
  project_name?: string;
}

interface Project {
  id: number;
  name: string;
}

interface SalaryRecord {
  id: number;
  worker_id: number;
  project_id: number | null;
  worker_name: string;
  project_name: string;
  year_month: string;
  work_hours: string;
  hourly_rate: string;
  contract_work_pay: string;
  gross_pay: string;
  income_tax: string;
  advance_pay: string;
  labor_insurance: string;
  net_pay: string;
  paid_amount?: number;
  deduction: string;
  remark: string | null;
}

interface SalaryPayment {
  id: number;
  salary_id?: number | null;
  worker_id: number;
  project_id?: number | null;
  worker_name?: string;
  project_name?: string;
  year_month: string;
  amount: string;
  payment_date: string;
}

interface WorkerSummary {
  summary_key: string;
  worker_id: number;
  project_id: number | null;
  worker_name: string;
  work_type: string | null;
  project_name: string;
  total_gross_pay: number;
  total_net_pay: number;
  total_tax: number;
  total_advance: number;
  total_insurance: number;
  total_deduction: number;
  unpaid: number;
  paid: number;
  monthly_count: number;
  records: SalaryRecord[];
}

const SALARY_PAYMENT_TOLERANCE = 1;

export default function WorkerSalaryQueryPage() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [salaries, setSalaries] = useState<SalaryRecord[]>([]);
  const [salaryPayments, setSalaryPayments] = useState<SalaryPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showContent, setShowContent] = useState(false);
  const [expandedWorkers, setExpandedWorkers] = useState<Set<string>>(new Set());
  
  // 筛选条件
  const [filterYear, setFilterYear] = useState(new Date().getFullYear().toString());
  const [filterProject, setFilterProject] = useState('all');
  const [filterWorker, setFilterWorker] = useState('all');
  const [searchName, setSearchName] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (!loading) {
      const timer = setTimeout(() => setShowContent(true), 50);
      return () => clearTimeout(timer);
    }
  }, [loading]);

  async function fetchData() {
    setLoading(true);
    setShowContent(false);
    try {
      const [workersRes, projectsRes, salariesRes, paymentsRes] = await Promise.all([
        fetch('/api/workers', { credentials: 'include' }),
        fetch('/api/projects', { credentials: 'include' }),
        fetch('/api/worker-salaries', { credentials: 'include' }),
        fetch('/api/worker-payments', { credentials: 'include' }),
      ]);
      const workersData = await workersRes.json();
      const projectsData = await projectsRes.json();
      const salariesData = await salariesRes.json();
      const paymentsData = await paymentsRes.json();
      
      setWorkers(workersData.workers || []);
      setProjects(projectsData.projects || []);
      setSalaries(salariesData.salaries || []);
      setSalaryPayments(paymentsData.payments || []);
    } catch {
      // 静默处理
    } finally {
      setLoading(false);
    }
  }

  // 获取年份列表
  const yearOptions = useMemo(() => {
    const years = new Set<string>();
    years.add(new Date().getFullYear().toString());
    salaries.forEach(s => years.add(s.year_month.substring(0, 4)));
    return Array.from(years).sort((a, b) => b.localeCompare(a));
  }, [salaries]);

  // 按工人汇总的年度数据
  const workerSummary = useMemo(() => {
    // 先筛选数据
    let filtered = salaries;
    
    // 按年份筛选
    if (filterYear) {
      filtered = filtered.filter(s => s.year_month.startsWith(filterYear));
    }
    
    // 按项目筛选
    if (filterProject && filterProject !== 'all') {
      const projectId = parseInt(filterProject);
      filtered = filtered.filter(s => s.project_id === projectId);
    }
    
    // 按工人筛选
    if (filterWorker && filterWorker !== 'all') {
      filtered = filtered.filter(s => s.worker_id === parseInt(filterWorker));
    }
    
    // 按姓名搜索
    if (searchName) {
      const workerIds = workers
        .filter(w => w.name.toLowerCase().includes(searchName.toLowerCase()))
        .map(w => w.id);
      filtered = filtered.filter(s => workerIds.includes(s.worker_id));
    }

    // 按工人分组计算汇总
    const summary: WorkerSummary[] = [];
    const workerMap = new Map<string, WorkerSummary>();
    
    filtered.forEach(s => {
      const summaryKey = `${s.worker_id}:${s.project_id || 'none'}`;
      if (!workerMap.has(summaryKey)) {
        workerMap.set(summaryKey, {
          summary_key: summaryKey,
          worker_id: s.worker_id,
          project_id: s.project_id,
          worker_name: s.worker_name || workers.find(w => w.id === s.worker_id)?.name || '未知',
          work_type: workers.find(w => w.id === s.worker_id)?.work_type || null,
          project_name: s.project_name || workers.find(w => w.id === s.worker_id)?.project_name || '未知',
          total_gross_pay: 0,
          total_net_pay: 0,
          total_tax: 0,
          total_advance: 0,
          total_insurance: 0,
          total_deduction: 0,
          unpaid: 0,
          paid: 0,
          monthly_count: 0,
          records: [],
        });
      }
      
      const workerData = workerMap.get(summaryKey)!;
      const grossPay = parseFloat(s.gross_pay) || 0;
      const netPay = parseFloat(s.net_pay) || 0;
      const tax = parseFloat(s.income_tax) || 0;
      const advance = parseFloat(s.advance_pay) || 0;
      const insurance = parseFloat(s.labor_insurance) || 0;
      const deduction = parseFloat(s.deduction) || 0;
      
      workerData.total_gross_pay += grossPay;
      workerData.total_net_pay += netPay;
      workerData.total_tax += tax;
      workerData.total_advance += advance;
      workerData.total_insurance += insurance;
      workerData.total_deduction += deduction;
      workerData.monthly_count += 1;
      workerData.records.push(s);
    });
    
    // 将只有发放记录但没有月度工资的工人也纳入统计
    let filteredPayments = salaryPayments;
    if (filterYear) {
      filteredPayments = filteredPayments.filter(p => {
        const matchMonth = p.year_month || p.payment_date?.substring(0, 7) || '';
        return matchMonth.startsWith(filterYear);
      });
    }
    if (filterProject && filterProject !== 'all') {
      const projectId = parseInt(filterProject);
      filteredPayments = filteredPayments.filter(p => p.project_id === projectId);
    }
    if (searchName) {
      const nameWorkerIds = workers
        .filter(w => w.name.toLowerCase().includes(searchName.toLowerCase()))
        .map(w => w.id);
      filteredPayments = filteredPayments.filter(p => nameWorkerIds.includes(p.worker_id));
    }
    if (filterWorker && filterWorker !== 'all') {
      filteredPayments = filteredPayments.filter(p => p.worker_id === parseInt(filterWorker));
    }
    filteredPayments.forEach(p => {
      const paymentKey = `${p.worker_id}:${p.project_id || 'none'}`;
      if (!workerMap.has(paymentKey)) {
        const worker = workers.find(w => w.id === p.worker_id);
        workerMap.set(paymentKey, {
          summary_key: paymentKey,
          worker_id: p.worker_id,
          project_id: p.project_id || null,
          worker_name: p.worker_name || worker?.name || '未知',
          work_type: worker?.work_type || null,
          project_name: p.project_name || worker?.project_name || '未知',
          total_gross_pay: 0,
          total_net_pay: 0,
          total_tax: 0,
          total_advance: 0,
          total_insurance: 0,
          total_deduction: 0,
          unpaid: 0,
          paid: 0,
          monthly_count: 0,
          records: [],
        });
      }

      const workerData = workerMap.get(paymentKey)!;
      workerData.paid += parseFloat(p.amount) || 0;
    });
    
    // 已发金额直接按工资发放记录汇总，保证工资查询与工资发放页面口径一致。
    workerMap.forEach(w => {
      const difference = Math.round((w.paid - w.total_net_pay) * 100) / 100;
      w.unpaid = Math.abs(difference) <= SALARY_PAYMENT_TOLERANCE
        ? 0
        : Math.max(0, w.total_net_pay - w.paid);
    });
    
    return Array.from(workerMap.values()).sort((a, b) => a.worker_name.localeCompare(b.worker_name));
  }, [salaries, workers, projects, filterYear, filterProject, filterWorker, searchName, salaryPayments]);

  // 统计数据
  const stats = useMemo(() => ({
    workerCount: workerSummary.length,
    totalGrossPay: workerSummary.reduce((sum, w) => sum + w.total_gross_pay, 0),
    totalNetPay: workerSummary.reduce((sum, w) => sum + w.total_net_pay, 0),
    totalPaid: workerSummary.reduce((sum, w) => sum + w.paid, 0),
    totalUnpaid: workerSummary.reduce((sum, w) => sum + w.unpaid, 0),
    totalTax: workerSummary.reduce((sum, w) => sum + w.total_tax, 0),
    totalAdvance: workerSummary.reduce((sum, w) => sum + w.total_advance, 0),
    totalInsurance: workerSummary.reduce((sum, w) => sum + w.total_insurance, 0),
  }), [workerSummary]);

  // 切换展开/折叠
  const toggleExpand = (summaryKey: string) => {
    const newExpanded = new Set(expandedWorkers);
    if (newExpanded.has(summaryKey)) {
      newExpanded.delete(summaryKey);
    } else {
      newExpanded.add(summaryKey);
    }
    setExpandedWorkers(newExpanded);
  };

  // 全部展开/折叠
  const expandAll = () => {
    setExpandedWorkers(new Set(workerSummary.map(w => w.summary_key)));
  };

  const collapseAll = () => {
    setExpandedWorkers(new Set());
  };

  // 格式化金额
  const formatCurrency = (value: number | string) => {
    const num = parseFloat(String(value)) || 0;
    return num.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // 格式化数字
  const formatNumber = (value: number | string) => {
    const num = parseFloat(String(value)) || 0;
    return num.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  };

  // 导出Excel
  const handleExport = () => {
    const headers = [
      '姓名', '工种', '项目', '年度应发', '年度已发', '年度未付',
      '个税合计', '预支合计', '劳保合计', '罚款合计', '实发合计'
    ];
    const rows: string[][] = [];
    
    workerSummary.forEach(worker => {
      rows.push([
        worker.worker_name,
        worker.work_type || '-',
        worker.project_name,
        formatNumber(worker.total_gross_pay),
        formatNumber(worker.paid),
        formatNumber(worker.unpaid),
        formatNumber(worker.total_tax),
        formatNumber(worker.total_advance),
        formatNumber(worker.total_insurance),
        formatNumber(worker.total_deduction),
        formatNumber(worker.total_net_pay),
      ]);
    });
    
    // 添加合计行
    rows.push([
      '合计', '', '',
      formatNumber(stats.totalGrossPay),
      formatNumber(stats.totalPaid),
      formatNumber(stats.totalUnpaid),
      formatNumber(stats.totalTax),
      formatNumber(stats.totalAdvance),
      formatNumber(stats.totalInsurance),
      '-',
      formatNumber(stats.totalNetPay),
    ]);
    
    // 生成CSV
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `工资汇总_${filterYear}年.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-3 sm:p-4 md:p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto"></div>
            <p className="mt-4 text-gray-500">加载中...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-3 sm:p-4 md:p-6">
      <div className={`max-w-[2000px] mx-auto space-y-5 transition-all duration-500 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
        {/* 页面标题 */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-gradient-to-br from-green-500 to-emerald-600">
                <FileSpreadsheet className="w-6 h-6 text-white" />
              </div>
              工资查询
            </h1>
            <p className="text-gray-500 mt-1 ml-11">按人按月汇总工人工资，显示已发、未付及详细工资项</p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <Button variant="outline" onClick={fetchData} className="gap-2">
              <RefreshCw className="w-4 h-4" />刷新
            </Button>
            <Button onClick={expandAll} variant="outline" className="gap-2">
              <ChevronDown className="w-4 h-4" />全部展开
            </Button>
            <Button onClick={collapseAll} variant="outline" className="gap-2">
              <ChevronRight className="w-4 h-4" />全部折叠
            </Button>
            <Button onClick={handleExport} className="gap-2 bg-green-600 hover:bg-green-700">
              <Download className="w-4 h-4" />导出
            </Button>
          </div>
        </div>

        {/* 筛选条件 */}
        <Card className="border-0 shadow-sm">
          <CardContent className="py-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-center">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-500">年份</span>
                <Select value={filterYear} onValueChange={setFilterYear}>
                  <SelectTrigger className="w-full sm:w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {yearOptions.map(year => (
                      <SelectItem key={year} value={year}>{year}年</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">项目</span>
                <Select value={filterProject} onValueChange={setFilterProject}>
                  <SelectTrigger className="w-full sm:w-40">
                    <SelectValue placeholder="全部项目" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部项目</SelectItem>
                    {projects.map(p => (
                      <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">工人</span>
                <Select value={filterWorker} onValueChange={setFilterWorker}>
                  <SelectTrigger className="w-full sm:w-40">
                    <SelectValue placeholder="全部工人" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部工人</SelectItem>
                    {workers.sort((a, b) => a.name.localeCompare(b.name)).map(w => (
                      <SelectItem key={w.id} value={w.id.toString()}>{w.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2 lg:flex-1 lg:max-w-xs">
                <Search className="w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="搜索姓名..."
                  value={searchName}
                  onChange={(e) => setSearchName(e.target.value)}
                  className="flex-1 px-3 py-1.5 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 统计卡片 */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
          <Card className="border-blue-200 bg-blue-50">
            <CardContent className="py-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm text-blue-600">查询人数</span>
                  <p className="text-2xl font-bold text-blue-700 mt-1">{stats.workerCount}</p>
                </div>
                <User className="w-8 h-8 text-blue-400" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-green-200 bg-green-50">
            <CardContent className="py-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm text-green-600">年度应发合计</span>
                  <p className="text-2xl font-bold text-green-700 mt-1">¥{formatCurrency(stats.totalGrossPay)}</p>
                </div>
                <TrendingUp className="w-8 h-8 text-green-400" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-purple-200 bg-purple-50">
            <CardContent className="py-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm text-purple-600">年度已发合计</span>
                  <p className="text-2xl font-bold text-purple-700 mt-1">¥{formatCurrency(stats.totalPaid)}</p>
                </div>
                <CheckCircle className="w-8 h-8 text-purple-400" />
              </div>
            </CardContent>
          </Card>
          <Card className={stats.totalUnpaid > 0 ? "border-red-200 bg-red-50" : "border-gray-200 bg-gray-50"}>
            <CardContent className="py-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className={`text-sm ${stats.totalUnpaid > 0 ? 'text-red-600' : 'text-gray-600'}`}>年度未付合计</span>
                  <p className={`text-2xl font-bold mt-1 ${stats.totalUnpaid > 0 ? 'text-red-700' : 'text-gray-700'}`}>¥{formatCurrency(stats.totalUnpaid)}</p>
                </div>
                <AlertCircle className={`w-8 h-8 ${stats.totalUnpaid > 0 ? 'text-red-400' : 'text-gray-400'}`} />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 工资汇总表 */}
        <Card className="border-0 shadow-sm overflow-hidden">
          <CardContent className="p-0">
            <div className="space-y-3 p-3 md:hidden">
              {workerSummary.length > 0 ? (
                workerSummary.map(worker => {
                  const isExpanded = expandedWorkers.has(worker.summary_key);
                  return (
                    <div key={worker.summary_key} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                      <button type="button" onClick={() => toggleExpand(worker.summary_key)} className="flex w-full items-start justify-between gap-3 text-left">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900">{worker.worker_name}</p>
                          <p className="mt-1 truncate text-xs text-slate-500">{worker.project_name} · {worker.work_type || '-'}</p>
                        </div>
                        {isExpanded ? <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" /> : <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />}
                      </button>
                      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                        <div className="rounded-lg bg-blue-50 px-2 py-2">
                          <p className="text-blue-600">应发</p>
                          <p className="mt-1 font-semibold text-blue-700">¥{formatCurrency(worker.total_gross_pay)}</p>
                        </div>
                        <div className="rounded-lg bg-purple-50 px-2 py-2">
                          <p className="text-purple-600">已发</p>
                          <p className="mt-1 font-semibold text-purple-700">¥{formatCurrency(worker.paid)}</p>
                        </div>
                        <div className={worker.unpaid > 0 ? 'rounded-lg bg-red-50 px-2 py-2' : 'rounded-lg bg-slate-50 px-2 py-2'}>
                          <p className={worker.unpaid > 0 ? 'text-red-600' : 'text-slate-500'}>未付</p>
                          <p className={worker.unpaid > 0 ? 'mt-1 font-semibold text-red-700' : 'mt-1 font-semibold text-slate-700'}>¥{formatCurrency(worker.unpaid)}</p>
                        </div>
                      </div>
                      {isExpanded && (
                        <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                          {worker.records.map(record => (
                            <div key={record.id} className="rounded-lg bg-amber-50/70 p-2 text-xs">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-medium text-amber-700">{record.year_month}</span>
                                <span className="font-semibold text-green-700">实发 ¥{formatCurrency(record.net_pay)}</span>
                              </div>
                              <div className="mt-2 grid grid-cols-2 gap-2 text-slate-600">
                                <span>工时 {formatNumber(record.work_hours)}</span>
                                <span>工价 {formatNumber(record.hourly_rate)}</span>
                                <span>包活 {formatNumber(record.contract_work_pay)}</span>
                                <span>应发 {formatNumber(record.gross_pay)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-400">
                  请先在&quot;月度工资&quot;中录入工资数据
                </div>
              )}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gradient-to-r from-slate-100 to-blue-50">
                    <TableHead className="sticky left-0 bg-slate-100 z-10 min-w-12 font-semibold"></TableHead>
                    <TableHead className="sticky left-12 bg-slate-100 z-10 min-w-24 font-semibold">姓名</TableHead>
                    <TableHead className="min-w-20 font-semibold">工种</TableHead>
                    <TableHead className="min-w-28 font-semibold">项目</TableHead>
                    <TableHead className="text-center min-w-24 font-semibold bg-blue-50">应发</TableHead>
                    <TableHead className="text-center min-w-24 font-semibold bg-purple-50">已发</TableHead>
                    <TableHead className="text-center min-w-24 font-semibold bg-red-50">未付</TableHead>
                    <TableHead className="text-center min-w-20 font-semibold">个税</TableHead>
                    <TableHead className="text-center min-w-20 font-semibold">预支</TableHead>
                    <TableHead className="text-center min-w-20 font-semibold">劳保</TableHead>
                    <TableHead className="text-center min-w-24 font-semibold bg-green-50">实发</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {workerSummary.length > 0 ? (
                    workerSummary.map((worker, index) => {
                      const isExpanded = expandedWorkers.has(worker.summary_key);
                      return (
                        <Fragment key={worker.summary_key}>
                          <TableRow 
                            className={`${index % 2 === 1 ? 'bg-slate-50/50' : ''} hover:bg-blue-50/50 cursor-pointer`}
                            onClick={() => toggleExpand(worker.summary_key)}
                          >
                            <TableCell className="sticky left-0 bg-white z-10 w-12">
                              <button className="p-1 hover:bg-gray-100 rounded">
                                {isExpanded ? (
                                  <ChevronDown className="w-4 h-4 text-gray-400" />
                                ) : (
                                  <ChevronRight className="w-4 h-4 text-gray-400" />
                                )}
                              </button>
                            </TableCell>
                            <TableCell className="sticky left-12 bg-white z-10 font-medium">
                              {worker.worker_name}
                            </TableCell>
                            <TableCell className="text-gray-500">
                              {worker.work_type || '-'}
                            </TableCell>
                            <TableCell className="text-gray-500">
                              {worker.project_name}
                            </TableCell>
                            <TableCell className="text-right bg-blue-50/50">
                              {formatNumber(worker.total_gross_pay)}
                            </TableCell>
                            <TableCell className="text-right bg-purple-50/50">
                              {formatNumber(worker.paid)}
                            </TableCell>
                            <TableCell className={`text-right ${worker.unpaid > 0 ? 'text-red-600 font-semibold bg-red-50/50' : 'text-gray-500'}`}>
                              {formatNumber(worker.unpaid)}
                            </TableCell>
                            <TableCell className="text-right text-gray-500">
                              {formatNumber(worker.total_tax)}
                            </TableCell>
                            <TableCell className="text-right text-gray-500">
                              {formatNumber(worker.total_advance)}
                            </TableCell>
                            <TableCell className="text-right text-gray-500">
                              {formatNumber(worker.total_insurance)}
                            </TableCell>
                            <TableCell className="text-right font-bold text-green-600 bg-green-50/50">
                              {formatNumber(worker.total_net_pay)}
                            </TableCell>
                          </TableRow>
                          {/* 展开的月度明细 */}
                          {isExpanded && (
                            <TableRow className="bg-amber-50/30">
                              <TableCell colSpan={11} className="p-0">
                                <div className="px-4 py-2">
                                  <div className="text-sm font-medium text-amber-700 mb-2 flex items-center gap-2">
                                    <Clock className="w-4 h-4" />
                                    {worker.worker_name} - {worker.monthly_count}个月工资明细
                                  </div>
                                  <Table className="bg-white rounded border">
                                    <TableHeader>
                                      <TableRow className="bg-gray-50 text-xs">
                                        <TableHead className="text-center py-1">月份</TableHead>
                                        <TableHead className="text-center py-1">工时</TableHead>
                                        <TableHead className="text-center py-1">工价</TableHead>
                                        <TableHead className="text-center py-1">包活</TableHead>
                                        <TableHead className="text-center py-1">应发</TableHead>
                                        <TableHead className="text-center py-1">个税</TableHead>
                                        <TableHead className="text-center py-1">预支</TableHead>
                                        <TableHead className="text-center py-1">劳保</TableHead>
                                        <TableHead className="text-center py-1">罚款</TableHead>
                                        <TableHead className="text-center py-1">实发</TableHead>
                                        <TableHead className="py-1">备注</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {worker.records.sort((a, b) => a.year_month.localeCompare(b.year_month)).map(record => (
                                        <TableRow key={record.id} className="text-xs">
                                          <TableCell className="text-center py-1">{record.year_month}</TableCell>
                                          <TableCell className="text-right py-1">{formatNumber(record.work_hours)}</TableCell>
                                          <TableCell className="text-right py-1">{formatNumber(record.hourly_rate)}</TableCell>
                                          <TableCell className="text-right py-1">{formatNumber(record.contract_work_pay)}</TableCell>
                                          <TableCell className="text-right py-1">{formatNumber(record.gross_pay)}</TableCell>
                                          <TableCell className="text-right py-1 text-red-500">{formatNumber(record.income_tax)}</TableCell>
                                          <TableCell className="text-right py-1 text-orange-500">{formatNumber(record.advance_pay)}</TableCell>
                                          <TableCell className="text-right py-1 text-orange-500">{formatNumber(record.labor_insurance)}</TableCell>
                                          <TableCell className="text-right py-1 text-red-500">{formatNumber(record.deduction || 0)}</TableCell>
                                          <TableCell className="text-right py-1 font-semibold text-green-600">{formatNumber(record.net_pay)}</TableCell>
                                          <TableCell className="py-1 text-gray-400 max-w-32 truncate">{record.remark || '-'}</TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      );
                    })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={11} className="text-center py-12 text-gray-400">
                        <div className="flex flex-col items-center gap-2">
                          <FileSpreadsheet className="w-12 h-12 text-gray-300" />
                          <p>暂无工资数据</p>
                          <p className="text-sm">请先在&quot;月度工资&quot;中录入工资数据</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                  {workerSummary.length > 0 && (
                    <TableRow className="bg-gradient-to-r from-slate-100 to-blue-50 font-semibold">
                      <TableCell className="sticky left-0 bg-slate-100 z-10"></TableCell>
                      <TableCell className="sticky left-12 bg-slate-100 z-10">合计</TableCell>
                      <TableCell></TableCell>
                      <TableCell></TableCell>
                      <TableCell className="text-right bg-blue-50">{formatNumber(stats.totalGrossPay)}</TableCell>
                      <TableCell className="text-right bg-purple-50">{formatNumber(stats.totalPaid)}</TableCell>
                      <TableCell className={`text-right ${stats.totalUnpaid > 0 ? 'text-red-600' : 'text-gray-500'} bg-red-50`}>
                        {formatNumber(stats.totalUnpaid)}
                      </TableCell>
                      <TableCell className="text-right">{formatNumber(stats.totalTax)}</TableCell>
                      <TableCell className="text-right">{formatNumber(stats.totalAdvance)}</TableCell>
                      <TableCell className="text-right">{formatNumber(stats.totalInsurance)}</TableCell>
                      <TableCell className="text-right font-bold text-green-700 bg-green-50">
                        {formatNumber(stats.totalNetPay)}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* 说明 */}
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="py-3">
            <p className="text-sm text-amber-700">
              <strong>说明：</strong>
              <span className="ml-2">点击工人行可展开查看每月详细工资数据（工时、工价、包活、应发、个税、预支、劳保、罚款、实发）。</span>
              <br/>
              <span className="ml-2"><strong>应发</strong> = 工时 × 工价 + 包活工资 | <strong>实发</strong> = 应发 - 个税 - 预支 - 劳保 - 罚款 | <strong>未付</strong> = 实发 - 已发</span>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
