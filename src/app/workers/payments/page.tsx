'use client';
import { useToast } from '@/hooks/use-toast';

import { useState, useEffect, useMemo } from 'react';
import { Plus, Search, RefreshCw, Trash2, Download, Upload, Filter, X, DollarSign, CreditCard, FileText, CheckCircle, ChevronRight, ChevronDown, FolderOpen, Users } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from '@/components/ui/table';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';

interface Worker {
  id: number;
  name: string;
  work_type?: string;
  project_id?: number;
  project_name?: string;
}

interface Project {
  id: number;
  name: string;
}

interface Payment {
  id: number;
  worker_id: number;
  worker_name: string;
  project_id?: number;
  project_name?: string;
  payment_date: string;
  payment_type: string;
  amount: string;
  payment_method: string;
  year_month?: string;
  remark?: string;
  created_at: string;
}

interface ProjectGroup {
  projectId: number | null;
  projectName: string;
  totalAmount: number;
  count: number;
  batches: BatchGroup[];
}

interface BatchGroup {
  yearMonth: string;
  label: string;
  totalAmount: number;
  count: number;
  payments: Payment[];
}

export default function WorkerPaymentsPage() {
  const { toast } = useToast();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showContent, setShowContent] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [expandedBatches, setExpandedBatches] = useState<Set<string>>(new Set());

  const [formData, setFormData] = useState({
    worker_id: '',
    project_id: '',
    payment_date: new Date().toISOString().split('T')[0],
    amount: '',
    payment_type: '月度工资',
    payment_method: '银行转账',
    year_month: '',
    remark: '',
  });

  const [filterProject, setFilterProject] = useState('all');
  const [filterYearMonth, setFilterYearMonth] = useState('all');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [workerSearchOpen, setWorkerSearchOpen] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    setShowContent(true);
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [paymentsRes, workersRes, projectsRes] = await Promise.all([
        fetch('/api/worker-payments', { credentials: 'include' }),
        fetch('/api/workers', { credentials: 'include' }),
        fetch('/api/projects', { credentials: 'include' }),
      ]);
      if (!paymentsRes.ok || !workersRes.ok || !projectsRes.ok) {
        throw new Error(`获取数据失败: ${paymentsRes.status}/${workersRes.status}/${projectsRes.status}`);
      }
      const [paymentsData, workersData, projectsData] = await Promise.all([
        paymentsRes.json(),
        workersRes.json(),
        projectsRes.json(),
      ]);
      setPayments(Array.isArray(paymentsData) ? paymentsData : (paymentsData.payments || []));
      setWorkers(Array.isArray(workersData) ? workersData : (workersData.workers || []));
      setProjects(Array.isArray(projectsData) ? projectsData : (projectsData.projects || []));
    } catch (error) {
      console.error('获取数据失败:', error);
      setPayments([]);
      setWorkers([]);
      setProjects([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchPayments = () => fetchData();

  const resetForm = () => {
    setFormData({
      worker_id: '',
      project_id: '',
      payment_date: new Date().toISOString().split('T')[0],
      amount: '',
      payment_type: '月度工资',
      payment_method: '银行转账',
      year_month: '',
      remark: '',
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.worker_id || !formData.project_id || !formData.year_month || !formData.amount || !formData.payment_date) {
      toast({ title: '请填写工人、项目、工资所属月份、实发金额和发放日期', variant: 'error' });
      return;
    }

    try {
      const res = await fetch('/api/worker-payments', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          worker_id: parseInt(formData.worker_id),
          project_id: formData.project_id ? parseInt(formData.project_id) : null,
          payment_date: formData.payment_date,
          amount: parseFloat(formData.amount),
          payment_type: formData.payment_type,
          payment_method: formData.payment_method,
          year_month: formData.year_month || null,
          remark: formData.remark || null,
        }),
      });

      if (res.ok) {
        const result = await res.json();
        setAddDialogOpen(false);
        resetForm();
        fetchPayments();
        if (Array.isArray(result.warnings) && result.warnings.length > 0) {
          toast({ title: result.warnings.join('；'), variant: 'warning' });
        }
      } else {
        const data = await res.json();
        toast({ title: data.error || '保存失败', variant: 'error' });
      }
    } catch (error) {
      console.error('保存失败:', error);
      toast({ title: '保存失败', variant: 'error' });
    }
  };

  const handleSelectAll = (checked: boolean, paymentList?: Payment[]) => {
    const target = paymentList || filteredPayments;
    if (checked) {
      setSelectedIds(new Set(target.map(p => p.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectOne = (id: number, checked: boolean) => {
    const newSelected = new Set(selectedIds);
    if (checked) {
      newSelected.add(id);
    } else {
      newSelected.delete(id);
    }
    setSelectedIds(newSelected);
  };

  const handleBatchDelete = async () => {
    try {
      const res = await fetch('/api/worker-payments/batch', {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });

      if (res.ok) {
        setDeleteDialogOpen(false);
        setSelectedIds(new Set());
        fetchPayments();
      } else {
        toast({ title: '删除失败', variant: 'error' });
      }
    } catch (error) {
      console.error('删除失败:', error);
      toast({ title: '删除失败', variant: 'error' });
    }
  };

  const downloadTemplate = async () => {
    try {
      const response = await fetch('/api/worker-payments/batch', { credentials: 'include' });
      if (!response.ok) throw new Error('下载模板失败');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = '工资发放导入模板.xlsx';
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('下载模板失败:', error);
    }
  };

  const [importResult, setImportResult] = useState<{
    show: boolean;
    success: boolean;
    count: number;
    warnings: string[];
    notInRoster: { row: number; name: string }[];
  }>({ show: false, success: false, count: 0, warnings: [], notInRoster: [] });

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/worker-payments/batch', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      const result = await res.json();

      if (res.ok) {
        setImportResult({
          show: true,
          success: true,
          count: result.count || 0,
          warnings: result.warnings || [],
          notInRoster: result.notInRoster || [],
        });
        fetchPayments();
      } else {
        setImportResult({
          show: true,
          success: false,
          count: 0,
          warnings: [result.error || '导入失败'],
          notInRoster: [],
        });
      }
    } catch (error) {
      console.error('导入失败:', error);
      setImportResult({
        show: true,
        success: false,
        count: 0,
        warnings: ['导入失败，请检查文件格式'],
        notInRoster: [],
      });
    }

    e.target.value = '';
  };

  const handleExport = () => {
    const headers = ['项目', '年月', '工人姓名', '付款日期', '付款类型', '金额', '付款方式', '备注'];
    const rows = filteredPayments.map(p => [p.project_name || '-', p.year_month || '-', p.worker_name, p.payment_date, p.payment_type, p.amount, p.payment_method, p.remark || '']);
    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `工资发放记录_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const filteredPayments = payments.filter(p => {
    if (filterProject !== 'all' && p.project_id?.toString() !== filterProject) return false;
    if (filterYearMonth !== 'all' && p.year_month !== filterYearMonth) return false;
    if (searchKeyword && !p.worker_name.toLowerCase().includes(searchKeyword.toLowerCase())) return false;
    return true;
  });

  // 按项目 → 年月(批次) 分组
  const projectGroups = useMemo(() => {
    const groupMap = new Map<string, ProjectGroup>();

    filteredPayments.forEach(p => {
      const projectKey = p.project_id?.toString() || '__none__';
      const yearMonth = p.year_month || p.payment_date?.substring(0, 7) || '未指定';

      if (!groupMap.has(projectKey)) {
        groupMap.set(projectKey, {
          projectId: p.project_id || null,
          projectName: p.project_name || '未分配项目',
          totalAmount: 0,
          count: 0,
          batches: [],
        });
      }

      const group = groupMap.get(projectKey)!;
      const amount = parseFloat(p.amount) || 0;
      group.totalAmount += amount;
      group.count += 1;

      let batch = group.batches.find(b => b.yearMonth === yearMonth);
      if (!batch) {
        batch = {
          yearMonth,
          label: formatYearMonth(yearMonth),
          totalAmount: 0,
          count: 0,
          payments: [],
        };
        group.batches.push(batch);
      }
      batch.totalAmount += amount;
      batch.count += 1;
      batch.payments.push(p);
    });

    // 排序：项目按名称，批次按年月倒序
    const groups = Array.from(groupMap.values());
    groups.sort((a, b) => a.projectName.localeCompare(b.projectName, 'zh'));
    groups.forEach(g => {
      g.batches.sort((a, b) => b.yearMonth.localeCompare(a.yearMonth));
    });

    return groups;
  }, [filteredPayments]);

  // 可选年月列表
  const yearMonthOptions = useMemo(() => {
    const set = new Set<string>();
    payments.forEach(p => {
      const ym = p.year_month || p.payment_date?.substring(0, 7);
      if (ym) set.add(ym);
    });
    return Array.from(set).sort().reverse();
  }, [payments]);

  const stats = {
    totalAmount: payments.reduce((sum, p) => sum + parseFloat(p.amount), 0),
    recordCount: payments.length,
    projectCount: new Set(payments.map(p => p.project_id)).size,
    batchCount: new Set(payments.map(p => p.year_month || p.payment_date?.substring(0, 7))).size,
  };

  const formatCurrency = (amount: number) => {
    if (amount >= 10000) {
      return `¥${(amount / 10000).toFixed(amount % 10000 === 0 ? 0 : 2)}万`;
    }
    return `¥${amount.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`;
  };

  const formatCurrencyFull = (amount: number) => `¥${amount.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`;

  const toggleProject = (projectKey: string) => {
    const next = new Set(expandedProjects);
    if (next.has(projectKey)) {
      next.delete(projectKey);
    } else {
      next.add(projectKey);
    }
    setExpandedProjects(next);
  };

  const toggleBatch = (batchKey: string) => {
    const next = new Set(expandedBatches);
    if (next.has(batchKey)) {
      next.delete(batchKey);
    } else {
      next.add(batchKey);
    }
    setExpandedBatches(next);
  };

  const isProjectExpanded = (projectKey: string) => expandedProjects.has(projectKey);
  const isBatchExpanded = (batchKey: string) => expandedBatches.has(batchKey);

  return (
    <div className="space-y-5">
      {/* 页面标题 */}
      <div className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 transition-all duration-500 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
        <div>
          <h1 className="text-xl font-semibold tracking-tight" style={{ color: '#1D2129' }}>工资发放</h1>
          <p className="text-sm mt-1" style={{ color: '#86909C' }}>按项目、批次管理工人工资发放记录</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchPayments} className="btn-secondary h-9">
            <RefreshCw className="w-4 h-4 mr-1.5" />刷新
          </Button>
          <Button variant="outline" onClick={downloadTemplate} className="btn-secondary h-9">
            <Download className="w-4 h-4 mr-1.5" />下载模板
          </Button>
          <Button variant="outline" asChild className="btn-secondary h-9 cursor-pointer">
            <label>
              <Upload className="w-4 h-4 mr-1.5" />批量导入
              <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleImport} />
            </label>
          </Button>
          <Button variant="outline" onClick={handleExport} className="btn-secondary h-9">
            <Download className="w-4 h-4 mr-1.5" />导出
          </Button>
          <Button variant="destructive" onClick={() => setDeleteDialogOpen(true)} disabled={selectedIds.size === 0} className="h-9">
            <Trash2 className="w-4 h-4 mr-1.5" />删除 {selectedIds.size > 0 && `(${selectedIds.size})`}
          </Button>
          <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={resetForm} className="btn-primary h-9">
                <Plus className="w-4 h-4 mr-1.5" />新增发放记录
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg z-50">
              <DialogHeader><DialogTitle className="dialog-header">新增发放记录</DialogTitle></DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm" style={{ color: '#1D2129' }}>工人 *</Label>
                    <Popover open={workerSearchOpen} onOpenChange={setWorkerSearchOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={workerSearchOpen}
                          className="mt-1.5 flex h-10 w-full items-center justify-between rounded-md border border-input bg-white px-3 py-2 text-sm"
                        >
                          {formData.worker_id
                            ? workers.find(w => w.id.toString() === formData.worker_id)?.name
                            : "选择工人"}
                          <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                        <Command>
                          <CommandInput placeholder="搜索工人..." className="h-9" />
                          <CommandList>
                            <CommandEmpty>未找到工人</CommandEmpty>
                            <CommandGroup>
                              {workers.map(w => (
                                <CommandItem
                                  key={w.id}
                                  value={`${w.name} ${w.id}`}
                                  onSelect={() => {
                                    setFormData({ 
                                      ...formData, 
                                      worker_id: w.id.toString(),
                                      project_id: w.project_id?.toString() || ''
                                    });
                                    setWorkerSearchOpen(false);
                                  }}
                                >
                                  <CheckCircle
                                    className={`mr-2 h-4 w-4 ${formData.worker_id === w.id.toString() ? "opacity-100" : "opacity-0"}`}
                                  />
                                  <div className="flex flex-col">
                                    <span>{w.name}</span>
                                    <span className="text-xs text-gray-500">工种: {w.work_type || '未设置'} | 项目: {w.project_name || '未分配'}</span>
                                  </div>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div>
                    <Label className="text-sm" style={{ color: '#1D2129' }}>项目</Label>
                    <div className="mt-1.5 flex h-10 items-center px-3 py-2 rounded-md border border-input bg-gray-50 text-sm text-gray-600">
                      {formData.project_id
                        ? projects.find(p => p.id.toString() === formData.project_id)?.name || '未知项目'
                        : '选择工人后自动确定'}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label className="text-sm" style={{ color: '#1D2129' }}>付款日期 *</Label><Input type="date" value={formData.payment_date} onChange={(e) => setFormData({ ...formData, payment_date: e.target.value })} className="mt-1.5" required /></div>
                  <div><Label className="text-sm" style={{ color: '#1D2129' }}>金额 *</Label><Input type="number" step="0.01" value={formData.amount} onChange={(e) => setFormData({ ...formData, amount: e.target.value })} className="mt-1.5" required /></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label className="text-sm" style={{ color: '#1D2129' }}>付款类型</Label>
                    <Select value={formData.payment_type} onValueChange={(v) => setFormData({ ...formData, payment_type: v })}>
                      <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="月度工资">月度工资</SelectItem>
                        <SelectItem value="预支款">预支款</SelectItem>
                        <SelectItem value="加班费">加班费</SelectItem>
                        <SelectItem value="其他">其他</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label className="text-sm" style={{ color: '#1D2129' }}>付款方式</Label>
                    <Select value={formData.payment_method} onValueChange={(v) => setFormData({ ...formData, payment_method: v })}>
                      <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="银行转账">银行转账</SelectItem>
                        <SelectItem value="现金">现金</SelectItem>
                        <SelectItem value="微信">微信</SelectItem>
                        <SelectItem value="支付宝">支付宝</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div><Label className="text-sm" style={{ color: '#1D2129' }}>年月</Label><Input value={formData.year_month} onChange={(e) => setFormData({ ...formData, year_month: e.target.value })} className="mt-1.5" placeholder="2025-01" /></div>
                <div><Label className="text-sm" style={{ color: '#1D2129' }}>备注</Label><Input value={formData.remark} onChange={(e) => setFormData({ ...formData, remark: e.target.value })} className="mt-1.5" /></div>
                <div className="flex justify-end gap-3 pt-3 border-t" style={{ borderColor: '#E5E6EB' }}>
                  <Button type="button" variant="outline" onClick={() => setAddDialogOpen(false)} className="border-gray-300">取消</Button>
                  <Button type="submit" className="btn-primary">保存</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className={`grid grid-cols-2 md:grid-cols-4 gap-4 transition-all duration-500 delay-100 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
        <Card className="stat-card stat-card-blue">
          <CardContent className="pt-5 pb-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm" style={{ color: '#86909C' }}>发放总额</p>
                <p className="text-xl font-bold mt-2 stat-number-blue">{formatCurrency(stats.totalAmount)}</p>
              </div>
              <div className="stat-icon-container stat-icon-blue">
                <DollarSign className="w-5 h-5 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="stat-card stat-card-green">
          <CardContent className="pt-5 pb-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm" style={{ color: '#86909C' }}>发放笔数</p>
                <p className="text-xl font-bold mt-2 stat-number-green">{stats.recordCount}<span className="text-sm font-normal ml-1" style={{ color: '#C9CDD4' }}>笔</span></p>
              </div>
              <div className="stat-icon-container stat-icon-green">
                <CreditCard className="w-5 h-5 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="stat-card stat-card-orange">
          <CardContent className="pt-5 pb-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm" style={{ color: '#86909C' }}>涉及项目</p>
                <p className="text-xl font-bold mt-2 stat-number-orange">{stats.projectCount}<span className="text-sm font-normal ml-1" style={{ color: '#C9CDD4' }}>个</span></p>
              </div>
              <div className="stat-icon-container stat-icon-orange">
                <FolderOpen className="w-5 h-5 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="stat-card stat-card-purple">
          <CardContent className="pt-5 pb-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm" style={{ color: '#86909C' }}>发放批次</p>
                <p className="text-xl font-bold mt-2 stat-number-purple">{stats.batchCount}<span className="text-sm font-normal ml-1" style={{ color: '#C9CDD4' }}>批</span></p>
              </div>
              <div className="stat-icon-container stat-icon-purple">
                <Users className="w-5 h-5 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 筛选栏 */}
      <div className={`transition-all duration-500 delay-150 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
        <div className="filter-bar">
          <Filter className="w-4 h-4" style={{ color: '#86909C' }} />
          <Select value={filterProject} onValueChange={setFilterProject}>
            <SelectTrigger className="w-36 h-8"><SelectValue placeholder="全部项目" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部项目</SelectItem>
              {projects.map(p => (<SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>))}
            </SelectContent>
          </Select>
          <Select value={filterYearMonth} onValueChange={setFilterYearMonth}>
            <SelectTrigger className="w-32 h-8"><SelectValue placeholder="全部年月" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部年月</SelectItem>
              {yearMonthOptions.map(ym => (<SelectItem key={ym} value={ym}>{ym}</SelectItem>))}
            </SelectContent>
          </Select>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#C9CDD4' }} />
            <Input placeholder="搜索工人" value={searchKeyword} onChange={(e) => setSearchKeyword(e.target.value)} className="w-36 pl-9 h-8" />
          </div>
          {(filterProject !== 'all' || filterYearMonth !== 'all' || searchKeyword) && (
            <Button variant="ghost" size="sm" onClick={() => { setFilterProject('all'); setFilterYearMonth('all'); setSearchKeyword(''); }} className="h-8" style={{ color: '#86909C' }}>
              <X className="w-4 h-4 mr-1" />清除筛选
            </Button>
          )}
          <p className="text-sm ml-auto" style={{ color: '#86909C' }}>共 {filteredPayments.length} 条记录</p>
        </div>
      </div>

      {/* 按项目 → 批次分组展示 */}
      <div className={`transition-all duration-500 delay-200 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
        {loading ? (
          <Card className="overflow-hidden border" style={{ borderColor: '#E5E6EB' }}>
            <CardContent className="p-0">
              <div className="flex items-center justify-center py-16">
                <div className="loading-spinner" />
              </div>
            </CardContent>
          </Card>
        ) : projectGroups.length > 0 ? (
          <div className="space-y-3">
            {projectGroups.map(group => {
              const projectKey = group.projectId?.toString() || '__none__';
              const projectExpanded = isProjectExpanded(projectKey);
              const projectSelectedCount = group.batches.flatMap(b => b.payments).filter(p => selectedIds.has(p.id)).length;

              return (
                <Card key={projectKey} className="overflow-hidden border" style={{ borderColor: '#E5E6EB' }}>
                  <CardContent className="p-0">
                    {/* 项目汇总行 */}
                    <div
                      className="flex items-center gap-3 px-4 py-3.5 cursor-pointer hover:bg-blue-50/50 transition-colors"
                      onClick={() => toggleProject(projectKey)}
                      style={{ background: projectExpanded ? '#F0F5FF' : 'transparent', borderBottom: projectExpanded ? '1px solid #E5E6EB' : 'none' }}
                    >
                      {projectExpanded
                        ? <ChevronDown className="w-5 h-5 shrink-0" style={{ color: '#165DFF' }} />
                        : <ChevronRight className="w-5 h-5 shrink-0" style={{ color: '#86909C' }} />
                      }
                      <FolderOpen className="w-5 h-5 shrink-0" style={{ color: '#165DFF' }} />
                      <span className="font-semibold text-base" style={{ color: '#1D2129' }}>{group.projectName}</span>
                      <div className="flex items-center gap-4 ml-auto">
                        <span className="text-sm" style={{ color: '#86909C' }}>{group.batches.length} 个批次</span>
                        <span className="text-sm" style={{ color: '#86909C' }}>{group.count} 笔</span>
                        <span className="font-bold text-base" style={{ color: '#165DFF' }}>{formatCurrencyFull(group.totalAmount)}</span>
                      </div>
                    </div>

                    {/* 展开的批次列表 */}
                    {projectExpanded && (
                      <div>
                        {group.batches.map(batch => {
                          const batchKey = `${projectKey}_${batch.yearMonth}`;
                          const batchExpanded = isBatchExpanded(batchKey);
                          const batchSelectedCount = batch.payments.filter(p => selectedIds.has(p.id)).length;

                          return (
                            <div key={batchKey}>
                              {/* 批次汇总行 */}
                              <div
                                className="flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors"
                                onClick={() => toggleBatch(batchKey)}
                                style={{ background: batchExpanded ? '#FAFBFD' : 'transparent', borderBottom: batchExpanded ? '1px solid #E5E6EB' : '1px solid #F2F3F5' }}
                              >
                                {batchExpanded
                                  ? <ChevronDown className="w-4 h-4 shrink-0 ml-4" style={{ color: '#4E5969' }} />
                                  : <ChevronRight className="w-4 h-4 shrink-0 ml-4" style={{ color: '#C9CDD4' }} />
                                }
                                <span className="font-medium text-sm" style={{ color: '#4E5969' }}>{batch.label}</span>
                                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#F2F3F5', color: '#86909C' }}>{batch.count} 笔</span>
                                {batchSelectedCount > 0 && (
                                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#E8F3FF', color: '#165DFF' }}>已选 {batchSelectedCount}</span>
                                )}
                                <span className="font-semibold text-sm ml-auto" style={{ color: '#165DFF' }}>{formatCurrencyFull(batch.totalAmount)}</span>
                              </div>

                              {/* 展开的明细表格 */}
                              {batchExpanded && (
                                <div className="overflow-x-auto" style={{ background: '#FAFBFD' }}>
                                  <Table>
                                    <TableHeader>
                                      <TableRow style={{ background: '#F7F8FA', borderBottom: '1px solid #E5E6EB' }}>
                                        <TableHead className="w-12">
                                          <Checkbox
                                            checked={batch.payments.length > 0 && batch.payments.every(p => selectedIds.has(p.id))}
                                            onCheckedChange={(checked) => handleSelectAll(checked as boolean, batch.payments)}
                                          />
                                        </TableHead>
                                        <TableHead className="text-xs" style={{ color: '#86909C' }}>工人</TableHead>
                                        <TableHead className="text-xs" style={{ color: '#86909C' }}>付款日期</TableHead>
                                        <TableHead className="text-xs" style={{ color: '#86909C' }}>付款类型</TableHead>
                                        <TableHead className="text-xs text-right" style={{ color: '#86909C' }}>金额</TableHead>
                                        <TableHead className="text-xs" style={{ color: '#86909C' }}>付款方式</TableHead>
                                        <TableHead className="text-xs" style={{ color: '#86909C' }}>备注</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {batch.payments.map((payment, index) => {
                                        const isSelected = selectedIds.has(payment.id);
                                        return (
                                          <TableRow key={payment.id} style={{ background: isSelected ? '#E8F3FF' : index % 2 === 1 ? '#FAFBFD' : 'transparent', borderBottom: '1px solid #F2F3F5' }}>
                                            <TableCell><Checkbox checked={isSelected} onCheckedChange={(checked) => handleSelectOne(payment.id, checked as boolean)} /></TableCell>
                                            <TableCell className="font-medium text-sm" style={{ color: '#1D2129' }}>{payment.worker_name}</TableCell>
                                            <TableCell className="text-sm" style={{ color: '#4E5969' }}>{payment.payment_date}</TableCell>
                                            <TableCell className="text-sm" style={{ color: '#4E5969' }}>{payment.payment_type}</TableCell>
                                            <TableCell className="text-sm text-right font-medium" style={{ color: '#165DFF' }}>{formatCurrencyFull(parseFloat(payment.amount))}</TableCell>
                                            <TableCell className="text-sm" style={{ color: '#4E5969' }}>{payment.payment_method}</TableCell>
                                            <TableCell className="text-sm" style={{ color: '#4E5969' }}>{payment.remark || '-'}</TableCell>
                                          </TableRow>
                                        );
                                      })}
                                      {/* 批次合计行 */}
                                      <TableRow style={{ background: '#F7F8FA', borderBottom: '1px solid #E5E6EB' }}>
                                        <TableCell colSpan={4} className="text-sm font-semibold" style={{ color: '#1D2129' }}>本批次合计</TableCell>
                                        <TableCell className="text-sm text-right font-bold" style={{ color: '#165DFF' }}>{formatCurrencyFull(batch.totalAmount)}</TableCell>
                                        <TableCell colSpan={2} />
                                      </TableRow>
                                    </TableBody>
                                  </Table>
                                </div>
                              )}
                            </div>
                          );
                        })}

                        {/* 项目合计行 */}
                        <div className="flex items-center px-4 py-3" style={{ background: '#F0F5FF', borderTop: '1px solid #E5E6EB' }}>
                          <span className="text-sm font-semibold ml-9" style={{ color: '#1D2129' }}>{group.projectName} 合计</span>
                          <div className="flex items-center gap-4 ml-auto">
                            <span className="text-sm" style={{ color: '#86909C' }}>{group.count} 笔</span>
                            {projectSelectedCount > 0 && (
                              <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#E8F3FF', color: '#165DFF' }}>已选 {projectSelectedCount}</span>
                            )}
                            <span className="font-bold text-base" style={{ color: '#165DFF' }}>{formatCurrencyFull(group.totalAmount)}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}

            {/* 全局合计 */}
            <Card className="overflow-hidden border" style={{ borderColor: '#165DFF', background: 'linear-gradient(135deg, #F0F5FF 0%, #E8F3FF 100%)' }}>
              <CardContent className="py-4 px-5">
                <div className="flex items-center justify-between">
                  <span className="font-bold" style={{ color: '#1D2129' }}>全部项目合计</span>
                  <div className="flex items-center gap-6">
                    <span className="text-sm" style={{ color: '#86909C' }}>{projectGroups.length} 个项目 · {filteredPayments.length} 笔</span>
                    <span className="text-xl font-bold" style={{ color: '#165DFF' }}>{formatCurrencyFull(stats.totalAmount)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <Card className="overflow-hidden border" style={{ borderColor: '#E5E6EB' }}>
            <CardContent className="p-0">
              <div className="empty-state">
                <div className="empty-state-icon">
                  <FileText className="w-8 h-8" style={{ color: '#C9CDD4' }} />
                </div>
                <p className="empty-state-title">暂无付款记录</p>
                <p className="empty-state-description">点击"新增发放记录"添加</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* 删除确认对话框 */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle style={{ color: '#1D2129' }}>确认删除</AlertDialogTitle>
            <AlertDialogDescription>确定要删除选中的 {selectedIds.size} 条付款记录吗？此操作不可恢复。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleBatchDelete} className="bg-red-600 hover:bg-red-700">删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 导入结果对话框 */}
      <Dialog open={importResult.show} onOpenChange={(open) => { if (!open) setImportResult(prev => ({ ...prev, show: false })); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {importResult.success ? (
                <CheckCircle className="h-5 w-5 text-green-500" />
              ) : (
                <X className="h-5 w-5 text-red-500" />
              )}
              {importResult.success ? '导入完成' : '导入失败'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto">
            {/* 成功统计 */}
            {importResult.success && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="text-green-800 font-medium text-sm">
                  成功导入 <span className="text-lg font-bold">{importResult.count}</span> 条工资发放记录
                </p>
              </div>
            )}

            {/* 不在花名册中的人员 */}
            {importResult.notInRoster.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Users className="h-4 w-4 text-amber-600" />
                  <p className="text-amber-800 font-medium text-sm">
                    以下 <span className="font-bold">{importResult.notInRoster.length}</span> 人不在花名册中，已跳过：
                  </p>
                </div>
                <div className="mt-2 space-y-1">
                  {importResult.notInRoster.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between text-sm bg-white rounded px-3 py-1.5 border border-amber-100">
                      <span className="text-amber-900 font-medium">{item.name}</span>
                      <span className="text-amber-500 text-xs">第{item.row}行</span>
                    </div>
                  ))}
                </div>
                <p className="text-amber-600 text-xs mt-2">
                  请先将以上人员添加到花名册中，再重新导入。
                </p>
              </div>
            )}

            {/* 其他警告信息 */}
            {importResult.warnings.filter(w => !w.includes('不在花名册中')).length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-red-800 font-medium text-sm mb-2">其他警告：</p>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {importResult.warnings.filter(w => !w.includes('不在花名册中')).slice(0, 20).map((w, idx) => (
                    <p key={idx} className="text-red-700 text-xs">{w}</p>
                  ))}
                  {importResult.warnings.filter(w => !w.includes('不在花名册中')).length > 20 && (
                    <p className="text-red-500 text-xs">...共{importResult.warnings.filter(w => !w.includes('不在花名册中')).length}条警告</p>
                  )}
                </div>
              </div>
            )}

            {/* 无警告时显示 */}
            {importResult.success && importResult.notInRoster.length === 0 && importResult.warnings.length === 0 && (
              <p className="text-gray-500 text-sm">所有记录均已成功导入，无异常。</p>
            )}
          </div>
          <div className="flex justify-end mt-4">
            <Button onClick={() => setImportResult(prev => ({ ...prev, show: false }))} className="bg-blue-600 hover:bg-blue-700">
              确定
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function formatYearMonth(ym: string): string {
  if (!ym || ym === '未指定') return '未指定批次';
  // Handle "2025-01" format
  const match = ym.match(/^(\d{4})-(\d{1,2})$/);
  if (match) {
    return `${match[1]}年${parseInt(match[2])}月`;
  }
  // Handle "2025" format
  if (/^\d{4}$/.test(ym)) {
    return `${ym}年`;
  }
  return ym;
}
