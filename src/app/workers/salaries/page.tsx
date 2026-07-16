'use client';
import React from 'react';
import { useToast } from '@/hooks/use-toast';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { 
  Plus, Trash2, Upload, Download, Search, Calendar, Calculator, Pencil, 
  DollarSign, Users, FileText, X, Printer, Settings, CheckCircle, TrendingUp, PieChart as PieChartIcon,
  AlertTriangle
} from 'lucide-react';
import EChartsWrapper, { CHART_COLORS } from '@/components/charts/echarts-wrapper';
import { Skeleton } from '@/components/ui/skeleton';

interface Worker {
  id: number;
  name: string;
  work_type: string | null;
  project_id?: number | null;
  project_name?: string | null;
}

interface Project {
  id: number;
  name: string;
}

interface SalaryRecord {
  id: number;
  worker_id: number;
  worker_name: string;
  project_name: string;
  project_id?: number;
  year_month: string;
  work_hours: string;
  hourly_rate: string;
  contract_work_pay: string;
  gross_pay: string;
  income_tax: string;
  advance_pay: string;
  labor_insurance: string;
  fine: string;
  net_pay: string;
  remark: string | null;
  payment_status?: string; // unpaid: 未发放, partial: 部分发放, paid: 已发清, overpaid: 超额发放
  paid_amount?: number;
  unpaid_amount?: number;
  payment_warning?: string | null;
  paid?: number;
}

export default function WorkerSalariesPage() {
  const { toast } = useToast();
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [salaries, setSalaries] = useState<SalaryRecord[]>([]);
  const [salaryPayments, setSalaryPayments] = useState<{worker_id: number; amount: number}[]>([]);
  const [loading, setLoading] = useState(true);
  const [showContent, setShowContent] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [batchDeleteConfirm, setBatchDeleteConfirm] = useState(false);
  
  const [filterYear, setFilterYear] = useState(new Date().getFullYear().toString());
  const [filterMonth, setFilterMonth] = useState((new Date().getMonth() + 1).toString());
  const [filterProject, setFilterProject] = useState('all');
  const [searchWorker, setSearchWorker] = useState('');
  
  const [formData, setFormData] = useState({
    worker_id: '',
    project_id: '',
    year_month: `${new Date().getFullYear()}-${(new Date().getMonth() + 1).toString().padStart(2, '0')}`,
    work_hours: '0',
    hourly_rate: '0',
    contract_work_pay: '0',
    income_tax: '0',
    advance_pay: '0',
    labor_insurance: '0',
    fine: '0',
    remark: '',
  });

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [batchEditDialogOpen, setBatchEditDialogOpen] = useState(false);
  const [batchEditField, setBatchEditField] = useState<string>('');
  const [batchEditValue, setBatchEditValue] = useState<string>('');
  
  // 数据管理弹窗状态
  const [dataManagerOpen, setDataManagerOpen] = useState(false);
  const [allSalaries, setAllSalaries] = useState<SalaryRecord[]>([]);
  const [deleteSelectedIds, setDeleteSelectedIds] = useState<Set<number>>(new Set());
  const [dataManagerLoading, setDataManagerLoading] = useState(false);
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set());
  const [mainCollapsedProjects, setMainCollapsedProjects] = useState<Set<string>>(new Set());
  const [workerSearchOpen, setWorkerSearchOpen] = useState(false);

  const [stats, setStats] = useState({
    totalGrossPay: '0',
    totalNetPay: '0',
    workerCount: 0,
  });

  const [projectSummary, setProjectSummary] = useState<{
    project_id: number | null;
    project_name: string;
    total_gross_pay: number;
    total_income_tax: number;
    total_advance_pay: number;
    total_labor_insurance: number;
    total_fine: number;
    total_net_pay: number;
    worker_count: number;
  }[]>([]);

  // 导入结果对话框
  const [importResult, setImportResult] = useState<any>(null);
  const [importResultOpen, setImportResultOpen] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchBaseData();
  }, []);

  useEffect(() => {
    fetchSalaries();
  }, [filterYear, filterMonth, filterProject]);

  useEffect(() => {
    if (!loading) {
      const timer = setTimeout(() => setShowContent(true), 50);
      return () => clearTimeout(timer);
    }
  }, [loading]);

  const fetchBaseData = async () => {
    try {
      const [workersRes, projectsRes] = await Promise.all([
        fetch('/api/workers', { credentials: 'include' }),
        fetch('/api/projects', { credentials: 'include' }),
      ]);
      if (!workersRes.ok || !projectsRes.ok) {
        throw new Error(`获取基础数据失败: ${workersRes.status} ${projectsRes.status}`);
      }
      const workersData = await workersRes.json();
      const projectsData = await projectsRes.json();
      setWorkers(workersData.workers || []);
      setProjects(projectsData.projects || []);
    } catch (error) {
      console.error('获取基础数据失败:', error);
    }
  };

  const fetchSalaries = async () => {
    setLoading(true);
    setShowContent(false);
    try {
      const yearMonth = `${filterYear}-${filterMonth.padStart(2, '0')}`;
      let url = `/api/worker-salaries?month=${yearMonth}`;
      if (filterProject !== 'all') url += `&project_id=${filterProject}`;
      const salariesRes = await fetch(url, { credentials: 'include' });
      if (!salariesRes.ok) {
        throw new Error(`获取工资数据失败: ${salariesRes.status}`);
      }
      const data = await salariesRes.json();
      
      // API 已按 salary_id 关联已付金额(paid_amount)，直接使用
      const salariesWithPaid = (data.salaries || []).map((s: SalaryRecord) => ({
        ...s,
        paid: s.paid_amount || 0,
      }));
      
      setSalaries(salariesWithPaid);
      setSalaryPayments([]);
      setStats({
        totalGrossPay: data.totalGrossPay || '0',
        totalNetPay: data.totalNetPay || '0',
        workerCount: (data.salaries || []).length,
      });
      setProjectSummary(data.projectSummary || []);
    } catch (error) {
      console.error('获取工资数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/worker-salaries', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          worker_id: parseInt(formData.worker_id),
          project_id: parseInt(formData.project_id),
          work_hours: parseFloat(formData.work_hours) || 0,
          hourly_rate: parseFloat(formData.hourly_rate) || 0,
          contract_work_pay: parseFloat(formData.contract_work_pay) || 0,
          income_tax: parseFloat(formData.income_tax) || 0,
          advance_pay: parseFloat(formData.advance_pay) || 0,
          labor_insurance: parseFloat(formData.labor_insurance) || 0,
          fine: parseFloat(formData.fine) || 0,
          gross_pay: (parseFloat(formData.work_hours) || 0) * (parseFloat(formData.hourly_rate) || 0) + (parseFloat(formData.contract_work_pay) || 0),
          net_pay: (parseFloat(formData.work_hours) || 0) * (parseFloat(formData.hourly_rate) || 0) + (parseFloat(formData.contract_work_pay) || 0) - (parseFloat(formData.income_tax) || 0) - (parseFloat(formData.advance_pay) || 0) - (parseFloat(formData.labor_insurance) || 0) - (parseFloat(formData.fine) || 0),
        }),
      });
      if (res.ok) {
        setDialogOpen(false);
        resetForm();
        fetchSalaries();
      } else {
        const error = await res.json();
        toast({ title: error.error || '操作失败', variant: 'error' });
      }
    } catch (error) {
      toast({ title: '保存失败', variant: 'error' });
    }
  };

  const resetForm = () => {
    setFormData({
      worker_id: '',
      project_id: '',
      year_month: `${filterYear}-${filterMonth.padStart(2, '0')}`,
      work_hours: '0',
      hourly_rate: '0',
      contract_work_pay: '0',
      income_tax: '0',
      advance_pay: '0',
      labor_insurance: '0',
      fine: '0',
      remark: '',
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === salaries.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(salaries.map(s => s.id)));
    }
  };

  const handleSelectOne = (id: number) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      return newSet;
    });
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return toast({ title: '请先选择要删除的记录', variant: 'error' });
    if (!confirm(`确定要删除选中的 ${selectedIds.size} 条工资记录吗？`)) return;
    try {
      const res = await fetch('/api/worker-salaries/batch-delete', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      if (res.ok) {
        setSelectedIds(new Set());
        fetchSalaries();
      }
    } catch (error) {
      toast({ title: '批量删除失败', variant: 'error' });
    }
  };

  // 打开数据管理弹窗
  const openDataManager = async () => {
    setDataManagerLoading(true);
    setDeleteSelectedIds(new Set());
    try {
      // 获取所有工资记录（不分页，用于数据清理）
      const res = await fetch('/api/worker-salaries?limit=10000', { credentials: 'include' });
      const data = await res.json();
      const records = data.salaries || data.data || [];
      // API 已按 salary_id 关联已付金额(paid_amount)，直接使用
      const recordsWithPaid = records.map((r: SalaryRecord) => {
        return { ...r, paid: r.paid_amount || 0 };
      });
      setAllSalaries(recordsWithPaid);
      setCollapsedProjects(new Set()); // 重置折叠状态，全部展开
      setDataManagerOpen(true);
    } catch (error) {
      toast({ title: '获取数据失败', variant: 'error' });
    } finally {
      setDataManagerLoading(false);
    }
  };

  // 数据管理 - 勾选要删除的记录
  const handleDeleteSelectAll = () => {
    if (deleteSelectedIds.size === allSalaries.length) {
      setDeleteSelectedIds(new Set());
    } else {
      setDeleteSelectedIds(new Set(allSalaries.map(s => s.id)));
    }
  };

  const handleDeleteSelectOne = (id: number) => {
    setDeleteSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      return newSet;
    });
  };

  // 数据管理 - 确认删除选中记录
  const handleDataManagerDelete = async () => {
    if (deleteSelectedIds.size === 0) return toast({ title: '请先选择要删除的记录', variant: 'error' });
    if (!confirm(`确定要删除选中的 ${deleteSelectedIds.size} 条工资记录吗？此操作不可恢复！`)) return;
    try {
      const res = await fetch('/api/worker-salaries/batch-delete', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(deleteSelectedIds) }),
      });
      if (res.ok) {
        toast({ title: `成功删除 ${deleteSelectedIds.size} 条记录` });
        setDeleteSelectedIds(new Set());
        setDataManagerOpen(false);
        fetchSalaries();
      }
    } catch (error) {
      toast({ title: '删除失败', variant: 'error' });
    }
  };

  const openBatchEditDialog = () => {
    if (selectedIds.size === 0) return toast({ title: '请先选择要修改的记录', variant: 'error' });
    setBatchEditField('');
    setBatchEditValue('');
    setBatchEditDialogOpen(true);
  };

  const handleBatchEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!batchEditField) return toast({ title: '请选择要修改的字段' });
    try {
      const res = await fetch('/api/worker-salaries/batch-update', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds), field: batchEditField, value: batchEditValue || null }),
      });
      if (res.ok) {
        setBatchEditDialogOpen(false);
        setSelectedIds(new Set());
        fetchSalaries();
      }
    } catch (error) {
      toast({ title: '批量修改失败', variant: 'error' });
    }
  };



  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/worker-salaries/batch', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      const result = await res.json();

      if (res.ok) {
        // 自动切换到导入数据的年月
        const importedYearMonths: string[] = result.importedYearMonths || [];
        if (importedYearMonths.length > 0) {
          const firstYM = importedYearMonths[0];
          const [y, m] = firstYM.split('-');
          if (y && m) {
            const importYear = y;
            const importMonth = String(parseInt(m));
            const needSwitch = importYear !== filterYear || importMonth !== filterMonth;
            if (needSwitch) {
              setFilterYear(importYear);
              setFilterMonth(importMonth);
            }
            if (!needSwitch) fetchSalaries();
          } else {
            fetchSalaries();
          }
        } else {
          fetchSalaries();
        }

        // 显示导入结果
        setImportResult(result);
        setImportResultOpen(true);
      } else {
        // 显示详细错误信息
        const errorMsg = result.error || '导入失败';
        const details = result.details || '';
        const debugInfo = result.debug;
        let desc = '';
        if (details) desc += details;
        if (debugInfo) {
          if (desc) desc += '\n';
          desc += `文件总行数: ${debugInfo.totalRows}，表头行: 第${debugInfo.headerRowIndex + 1}行，数据行: ${debugInfo.totalDataRows}`;
          if (debugInfo.notInRosterCount > 0) {
            desc += `\n不在花名册: ${debugInfo.notInRosterCount}人 (${debugInfo.notInRosterNames?.join('、')})`;
          }
          if (debugInfo.firstErrors?.length > 0) {
            desc += `\n错误: ${debugInfo.firstErrors.join('；')}`;
          }
        }
        console.error('[Salaries Import] Debug:', debugInfo);
        toast({ title: errorMsg, description: desc, variant: 'error' } as any);
      }
    } catch (error) {
      console.error('导入失败:', error);
      toast({ title: '导入失败', variant: 'error' });
    }
    e.target.value = '';
  };

  const downloadTemplate = async () => {
    try {
      const res = await fetch('/api/worker-salaries/batch', { credentials: 'include' });
      if (!res.ok) throw new Error('下载失败');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = '月度工资导入模板.xlsx';
      link.click();
      window.URL.revokeObjectURL(url);
    } catch {
      toast({ title: '下载模板失败，请重试', variant: 'error' });
    }
  };

  const handleExport = () => {
    const headers = ['工人姓名', '项目', '年月', '工时', '时薪', '包工工资', '应发工资', '个人所得税', '预支款', '劳保费', '罚款', '实发工资', '备注'];
    const rows = filteredSalaries.map(s => [
      s.worker_name, s.project_name, s.year_month, s.work_hours, s.hourly_rate,
      s.contract_work_pay, s.gross_pay, s.income_tax, s.advance_pay, s.labor_insurance, s.fine, s.net_pay, s.remark || ''
    ]);
    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `月度工资_${filterYear}-${filterMonth.padStart(2, '0')}.csv`;
    link.click();
  };

  const formatCurrency = (amount: string | number) => `¥${parseFloat(String(amount)).toLocaleString('zh-CN', { maximumFractionDigits: 0 })}`;

  const currentYear = new Date().getFullYear();
  const yearOptions = [];
  for (let y = currentYear; y >= currentYear - 5; y--) yearOptions.push(y.toString());
  const monthOptions = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];

  const filteredSalaries = salaries.filter(s => {
    if (searchWorker && !s.worker_name.toLowerCase().includes(searchWorker.toLowerCase())) return false;
    return true;
  });

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div><Skeleton className="w-40 h-7 mb-1" /><Skeleton className="w-64 h-4" /></div>
          <div className="flex gap-2"><Skeleton className="w-28 h-9 rounded-lg" /><Skeleton className="w-28 h-9 rounded-lg" /></div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* 页面标题 */}
      <div className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 transition-all duration-500 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
        <div>
          <h1 className="text-xl font-semibold tracking-tight" style={{ color: '#1D2129' }}>月度工资</h1>
          <p className="text-sm mt-1" style={{ color: '#86909C' }}>按月录入和管理工人工资</p>
        </div>
        <div className="mobile-action-grid sm:flex sm:w-auto sm:flex-wrap sm:justify-end sm:gap-2">
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
          <Button variant="outline" onClick={() => window.print()} className="btn-secondary h-9">
            <Printer className="w-4 h-4 mr-1.5" />打印
          </Button>
          <Button variant="outline" onClick={openBatchEditDialog} disabled={selectedIds.size === 0} className="btn-secondary h-9"><Pencil className="w-4 h-4 mr-1.5" />批量修改</Button>
          <Button variant="destructive" onClick={() => setBatchDeleteConfirm(true)} disabled={selectedIds.size === 0} className="h-9"><Trash2 className="w-4 h-4 mr-1.5" />批量删除 {selectedIds.size > 0 && `(${selectedIds.size})`}</Button>
          <Button variant="outline" onClick={openDataManager} className="btn-secondary h-9 border-orange-300 text-orange-600 hover:bg-orange-50"><Settings className="w-4 h-4 mr-1.5" />数据管理</Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={resetForm} className="btn-primary h-9"><Plus className="w-4 h-4 mr-1.5" />新增工资</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-lg overflow-y-auto">
              <DialogHeader><DialogTitle className="dialog-header">新增工资记录</DialogTitle></DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div><Label className="text-sm" style={{ color: '#1D2129' }}>工人 *</Label>
                    <Popover open={workerSearchOpen} onOpenChange={setWorkerSearchOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={workerSearchOpen}
                          className="mt-1.5 flex h-10 w-full items-center justify-between rounded-md border border-input bg-white px-3 py-2 text-sm"
                        >
                          {formData.worker_id
                            ? workers.find(w => w.id.toString() === formData.worker_id)?.name || '选择工人'
                            : "选择工人"}
                          <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                        <Command>
                          <CommandInput placeholder="搜索工人姓名、工种..." className="h-9" />
                          <CommandList>
                            <CommandEmpty>未找到工人</CommandEmpty>
                            <CommandGroup>
                              {workers.map(w => (
                                <CommandItem
                                  key={w.id}
                                  value={`${w.name} ${w.work_type || ''}`}
                                  onSelect={() => {
                                    setFormData({ 
                                      ...formData, 
                                      worker_id: w.id.toString(),
                                      project_id: w.project_id?.toString() || formData.project_id
                                    });
                                    setWorkerSearchOpen(false);
                                  }}
                                >
                                  <CheckCircle
                                    className={`mr-2 h-4 w-4 ${formData.worker_id === w.id.toString() ? "opacity-100" : "opacity-0"}`}
                                  />
                                  <div className="flex flex-col">
                                    <span>{w.name}</span>
                                    <span className="text-xs text-gray-500">工种: {w.work_type || '未设置'}{w.project_name ? ` | 项目: ${w.project_name}` : ''}</span>
                                  </div>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div><Label className="text-sm" style={{ color: '#1D2129' }}>项目 *</Label>
                    <Select value={formData.project_id} onValueChange={(value) => setFormData({ ...formData, project_id: value })}>
                      <SelectTrigger className="mt-1.5"><SelectValue placeholder="选择项目" /></SelectTrigger>
                      <SelectContent>{projects.map(p => (<SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>))}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div><Label className="text-sm" style={{ color: '#1D2129' }}>年月 *</Label><Input value={formData.year_month} onChange={(e) => setFormData({ ...formData, year_month: e.target.value })} className="mt-1.5" /></div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div><Label className="text-sm" style={{ color: '#1D2129' }}>工时</Label><Input type="number" value={formData.work_hours} onChange={(e) => setFormData({ ...formData, work_hours: e.target.value })} className="mt-1.5" /></div>
                  <div><Label className="text-sm" style={{ color: '#1D2129' }}>时薪</Label><Input type="number" step="0.01" value={formData.hourly_rate} onChange={(e) => setFormData({ ...formData, hourly_rate: e.target.value })} className="mt-1.5" /></div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div><Label className="text-sm" style={{ color: '#1D2129' }}>包工工资</Label><Input type="number" step="0.01" value={formData.contract_work_pay} onChange={(e) => setFormData({ ...formData, contract_work_pay: e.target.value })} className="mt-1.5" /></div>
                  <div><Label className="text-sm" style={{ color: '#1D2129' }}>个人所得税</Label><Input type="number" step="0.01" value={formData.income_tax} onChange={(e) => setFormData({ ...formData, income_tax: e.target.value })} className="mt-1.5" /></div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div><Label className="text-sm" style={{ color: '#1D2129' }}>预支款</Label><Input type="number" step="0.01" value={formData.advance_pay} onChange={(e) => setFormData({ ...formData, advance_pay: e.target.value })} className="mt-1.5" /></div>
                  <div><Label className="text-sm" style={{ color: '#1D2129' }}>劳保费</Label><Input type="number" step="0.01" value={formData.labor_insurance} onChange={(e) => setFormData({ ...formData, labor_insurance: e.target.value })} className="mt-1.5" /></div>
                </div>
                <div><Label className="text-sm" style={{ color: '#1D2129' }}>备注</Label><Input value={formData.remark} onChange={(e) => setFormData({ ...formData, remark: e.target.value })} className="mt-1.5" /></div>
                <div className="grid grid-cols-2 gap-3 pt-3 border-t sm:flex sm:justify-end" style={{ borderColor: '#E5E6EB' }}>
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="border-gray-300">取消</Button>
                  <Button type="submit" className="btn-primary">保存</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className={`grid grid-cols-1 sm:grid-cols-3 gap-4 transition-all duration-500 delay-100 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
        <Card className="stat-card stat-card-blue">
          <CardContent className="pt-5 pb-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm" style={{ color: '#86909C' }}>应发工资总额</p>
                <p className="text-xl font-bold mt-2 stat-number-blue">{formatCurrency(stats.totalGrossPay)}</p>
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
                <p className="text-sm" style={{ color: '#86909C' }}>实发工资总额</p>
                <p className="text-xl font-bold mt-2 stat-number-green">{formatCurrency(stats.totalNetPay)}</p>
              </div>
              <div className="stat-icon-container stat-icon-green">
                <Calculator className="w-5 h-5 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="stat-card stat-card-purple">
          <CardContent className="pt-5 pb-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm" style={{ color: '#86909C' }}>涉及工人</p>
                <p className="text-3xl font-bold mt-2 stat-number-purple">{stats.workerCount}<span className="text-sm font-normal ml-1" style={{ color: '#C9CDD4' }}>人</span></p>
              </div>
              <div className="stat-icon-container stat-icon-purple">
                <Users className="w-5 h-5 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 人员成本趋势图 & 工种成本结构 */}
      <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 transition-all duration-500 delay-150 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
        {/* 月度工资趋势图 */}
        <Card style={{ background: '#FFFFFF', border: '1px solid #E5E6EB' }}>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4" style={{ color: '#165DFF' }} />
              <span className="text-sm font-semibold" style={{ color: '#1D2129' }}>项目工资对比</span>
            </div>
            <div className="h-56">
              <EChartsWrapper option={{
                tooltip: { trigger: 'axis' as const, formatter: (params: any) => {
                  let html = `<div style="font-weight:600">${params[0].axisValue}</div>`;
                  params.forEach((p: any) => {
                    html += `<div style="display:flex;align-items:center;gap:4px;margin:2px 0">
                      <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${p.color}"></span>
                      <span>${p.seriesName}：</span><span style="font-weight:600">¥${Number(p.value).toLocaleString()}</span>
                    </div>`;
                  });
                  return html;
                }},
                grid: { left: 10, right: 10, top: 10, bottom: 5, containLabel: true },
                xAxis: { type: 'category' as const, data: projectSummary.length > 0 ? projectSummary.map(p => p.project_name.length > 6 ? p.project_name.slice(0,6)+'…' : p.project_name) : ['暂无'], axisLabel: { fontSize: 10, color: '#86909C', rotate: projectSummary.length > 4 ? 20 : 0 }, axisTick: { show: false }, axisLine: { lineStyle: { color: '#E5E6EB' } } },
                yAxis: { type: 'value' as const, axisLabel: { fontSize: 10, color: '#86909C', formatter: (v: number) => (v/10000).toFixed(0)+'万' }, splitLine: { lineStyle: { color: '#F2F3F5', type: 'dashed' } }, axisLine: { show: false }, axisTick: { show: false } },
                series: [
                  { name: '应发工资', type: 'bar' as const, barWidth: '35%', data: projectSummary.map(p => p.total_gross_pay), itemStyle: { color: CHART_COLORS.primary, borderRadius: [3,3,0,0] as [number,number,number,number] } },
                  { name: '实发工资', type: 'bar' as const, barWidth: '35%', data: projectSummary.map(p => p.total_net_pay), itemStyle: { color: CHART_COLORS.success, borderRadius: [3,3,0,0] as [number,number,number,number] } },
                ],
              }} />
            </div>
          </CardContent>
        </Card>

        {/* 工种成本结构环形图 */}
        <Card style={{ background: '#FFFFFF', border: '1px solid #E5E6EB' }}>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 mb-3">
              <PieChartIcon className="w-4 h-4" style={{ color: '#FF7D00' }} />
              <span className="text-sm font-semibold" style={{ color: '#1D2129' }}>项目人工费占比</span>
            </div>
            <div className="h-56">
              <EChartsWrapper option={{
                tooltip: { formatter: (p: any) => `<b>${p.name}</b><br/>金额：¥${Number(p.value).toLocaleString()}<br/>占比：${p.percent}%` },
                series: [{
                  type: 'pie', radius: ['40%', '68%'], center: ['50%', '50%'],
                  itemStyle: { borderRadius: 5, borderColor: '#fff', borderWidth: 2 },
                  label: { show: true, fontSize: 10, color: '#86909C', formatter: '{b}\n{d}%' },
                  labelLine: { length: 8, length2: 6 },
                  data: projectSummary.length > 0 
                    ? [...projectSummary].sort((a,b) => b.total_gross_pay - a.total_gross_pay).slice(0, 6).map((p, i) => ({
                        name: p.project_name.length > 6 ? p.project_name.slice(0,6)+'…' : p.project_name,
                        value: p.total_gross_pay,
                        itemStyle: { color: [CHART_COLORS.primary, CHART_COLORS.success, CHART_COLORS.warning, CHART_COLORS.danger, '#722ED1', '#13C2C2'][i] }
                      }))
                    : [{ name: '暂无数据', value: 0, itemStyle: { color: '#E5E6EB' } }],
                  animationType: 'scale', animationDuration: 800,
                }],
              }} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 项目汇总表格 */}
      {projectSummary.length > 0 && (
        <Card className={`transition-all duration-500 delay-100 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
          <CardContent className="pt-5">
            <h3 className="text-base font-semibold mb-4" style={{ color: '#1D2129' }}>项目工资汇总</h3>
            <div className="hidden md:block overflow-x-auto">
              <Table className="zebra-table">
              <TableHeader>
                  <TableRow>
                    <TableHead className="font-medium" style={{ color: '#86909C' }}>项目名称</TableHead>
                    <TableHead className="text-right font-medium" style={{ color: '#86909C' }}>应发工资</TableHead>
                    <TableHead className="text-right font-medium" style={{ color: '#86909C' }}>个税</TableHead>
                    <TableHead className="text-right font-medium" style={{ color: '#86909C' }}>预支款</TableHead>
                    <TableHead className="text-right font-medium" style={{ color: '#86909C' }}>劳保费</TableHead>
                    <TableHead className="text-right font-medium" style={{ color: '#86909C' }}>罚款</TableHead>
                    <TableHead className="text-right font-medium" style={{ color: '#86909C' }}>实发工资</TableHead>
                    <TableHead className="text-right font-medium" style={{ color: '#86909C' }}>人数</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {projectSummary.map((item, index) => (
                    <TableRow key={item.project_id || index}>
                      <TableCell className="font-medium" style={{ color: '#1D2129' }}>{item.project_name}</TableCell>
                      <TableCell className="text-right" style={{ color: '#165DFF' }}>{formatCurrency(item.total_gross_pay)}</TableCell>
                      <TableCell className="text-right" style={{ color: '#F53F3F' }}>{formatCurrency(item.total_income_tax)}</TableCell>
                      <TableCell className="text-right" style={{ color: '#FF7D00' }}>{formatCurrency(item.total_advance_pay)}</TableCell>
                      <TableCell className="text-right" style={{ color: '#722ED1' }}>{formatCurrency(item.total_labor_insurance)}</TableCell>
                      <TableCell className="text-right" style={{ color: '#E5C07B' }}>{formatCurrency(item.total_fine)}</TableCell>
                      <TableCell className="text-right font-semibold" style={{ color: '#00B42A' }}>{formatCurrency(item.total_net_pay)}</TableCell>
                      <TableCell className="text-right" style={{ color: '#86909C' }}>{item.worker_count}人</TableCell>
                    </TableRow>
                  ))}
                  {/* 合计行 */}
                  <TableRow style={{ backgroundColor: '#F7F8FA' }}>
                    <TableCell className="font-bold" style={{ color: '#1D2129' }}>合计</TableCell>
                    <TableCell className="text-right font-bold" style={{ color: '#165DFF' }}>
                      {formatCurrency(projectSummary.reduce((sum, p) => sum + p.total_gross_pay, 0))}
                    </TableCell>
                    <TableCell className="text-right font-bold" style={{ color: '#F53F3F' }}>
                      {formatCurrency(projectSummary.reduce((sum, p) => sum + p.total_income_tax, 0))}
                    </TableCell>
                    <TableCell className="text-right font-bold" style={{ color: '#FF7D00' }}>
                      {formatCurrency(projectSummary.reduce((sum, p) => sum + p.total_advance_pay, 0))}
                    </TableCell>
                    <TableCell className="text-right font-bold" style={{ color: '#722ED1' }}>
                      {formatCurrency(projectSummary.reduce((sum, p) => sum + p.total_labor_insurance, 0))}
                    </TableCell>
                    <TableCell className="text-right font-bold" style={{ color: '#E5C07B' }}>
                      {formatCurrency(projectSummary.reduce((sum, p) => sum + p.total_fine, 0))}
                    </TableCell>
                    <TableCell className="text-right font-bold" style={{ color: '#00B42A' }}>
                      {formatCurrency(projectSummary.reduce((sum, p) => sum + p.total_net_pay, 0))}
                    </TableCell>
                    <TableCell className="text-right font-bold" style={{ color: '#86909C' }}>
                      {projectSummary.reduce((sum, p) => sum + p.worker_count, 0)}人
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
            <div className="space-y-3 md:hidden">
              {projectSummary.map((item, index) => (
                <div key={item.project_id || index} className="rounded-lg border border-gray-100 bg-gray-50/70 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold" style={{ color: '#1D2129' }}>{item.project_name}</p>
                      <p className="mt-1 text-xs" style={{ color: '#86909C' }}>{item.worker_count}人</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs" style={{ color: '#86909C' }}>实发</p>
                      <p className="text-base font-bold" style={{ color: '#00B42A' }}>{formatCurrency(item.total_net_pay)}</p>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div><span style={{ color: '#86909C' }}>应发 </span><span className="font-medium" style={{ color: '#165DFF' }}>{formatCurrency(item.total_gross_pay)}</span></div>
                    <div><span style={{ color: '#86909C' }}>个税 </span><span className="font-medium" style={{ color: '#F53F3F' }}>{formatCurrency(item.total_income_tax)}</span></div>
                    <div><span style={{ color: '#86909C' }}>预支 </span><span className="font-medium" style={{ color: '#FF7D00' }}>{formatCurrency(item.total_advance_pay)}</span></div>
                    <div><span style={{ color: '#86909C' }}>劳保 </span><span className="font-medium" style={{ color: '#722ED1' }}>{formatCurrency(item.total_labor_insurance)}</span></div>
                  </div>
                </div>
              ))}
              <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold" style={{ color: '#1D2129' }}>合计</span>
                  <span className="text-base font-bold" style={{ color: '#00B42A' }}>{formatCurrency(projectSummary.reduce((sum, p) => sum + p.total_net_pay, 0))}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: '#86909C' }}>
                  <span>应发 {formatCurrency(projectSummary.reduce((sum, p) => sum + p.total_gross_pay, 0))}</span>
                  <span>{projectSummary.reduce((sum, p) => sum + p.worker_count, 0)}人</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 筛选栏 */}
      <div className={`transition-all duration-500 delay-150 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
        <div className="filter-bar mobile-filter-grid sm:flex sm:flex-wrap sm:items-center sm:gap-3">
          <Calendar className="w-4 h-4" style={{ color: '#86909C' }} />
          <Select value={filterYear} onValueChange={setFilterYear}>
            <SelectTrigger className="w-full sm:w-24 h-9 sm:h-8"><SelectValue /></SelectTrigger>
            <SelectContent>{yearOptions.map(y => (<SelectItem key={y} value={y}>{y}年</SelectItem>))}</SelectContent>
          </Select>
          <Select value={filterMonth} onValueChange={setFilterMonth}>
            <SelectTrigger className="w-full sm:w-20 h-9 sm:h-8"><SelectValue /></SelectTrigger>
            <SelectContent>{monthOptions.map(m => (<SelectItem key={m} value={m}>{m}月</SelectItem>))}</SelectContent>
          </Select>
          <Select value={filterProject} onValueChange={setFilterProject}>
            <SelectTrigger className="w-full sm:w-36 h-9 sm:h-8"><SelectValue placeholder="全部项目" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部项目</SelectItem>
              {projects.map(p => (<SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>))}
            </SelectContent>
          </Select>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#C9CDD4' }} />
            <Input placeholder="搜索工人姓名" value={searchWorker} onChange={(e) => setSearchWorker(e.target.value)} className="w-full sm:w-40 pl-9 h-9 sm:h-8" />
          </div>
          {searchWorker && (
            <Button variant="ghost" size="sm" onClick={() => setSearchWorker('')} className="h-8" style={{ color: '#86909C' }}>
              <X className="w-4 h-4 mr-1" />清除
            </Button>
          )}
        </div>
      </div>

      {/* 工资列表 */}
      <div className={`transition-all duration-500 delay-200 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
        <Card className="overflow-hidden border" style={{ borderColor: '#E5E6EB' }}>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <div className="loading-spinner" />
              </div>
            ) : filteredSalaries.length > 0 ? (
              <div className="space-y-3">
                {(() => {
                  // 按项目分组
                  const grouped = filteredSalaries.reduce((acc, salary) => {
                    const key = salary.project_name || '未知项目';
                    if (!acc[key]) acc[key] = [];
                    acc[key].push(salary);
                    return acc;
                  }, {} as Record<string, typeof filteredSalaries>);
                  const projectNames = Object.keys(grouped).sort();

                  return projectNames.map((projectName) => {
                    const projectSalaries = grouped[projectName];
                    const allSelected = projectSalaries.every(s => selectedIds.has(s.id));
                    const projectGrossPay = projectSalaries.reduce((sum, s) => sum + (Number(s.gross_pay) || 0), 0);
                    const projectNetPay = projectSalaries.reduce((sum, s) => sum + (Number(s.net_pay) || 0), 0);
                    const projectPaid = projectSalaries.reduce((sum, s) => sum + (Number(s.paid) || 0), 0);
                    const isCollapsed = mainCollapsedProjects.has(projectName);

                    return (
                      <div key={projectName} className="border rounded-lg overflow-hidden" style={{ borderColor: '#E5E6EB' }}>
                        {/* 项目标题行 - 可折叠 */}
                        <div
                          className="flex flex-col gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors sm:flex-row sm:items-center sm:justify-between sm:py-2.5"
                          style={{ background: '#F7F8FA' }}
                          onClick={() => {
                            const newCollapsed = new Set(mainCollapsedProjects);
                            if (isCollapsed) {
                              newCollapsed.delete(projectName);
                            } else {
                              newCollapsed.add(projectName);
                            }
                            setMainCollapsedProjects(newCollapsedProjects => newCollapsed);
                          }}
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <span className={`transition-transform text-gray-400 text-xs ${isCollapsed ? '' : 'rotate-180'}`}>▼</span>
                            <Checkbox
                              checked={allSelected}
                              onCheckedChange={() => {
                                const newSelected = new Set(selectedIds);
                                if (allSelected) {
                                  projectSalaries.forEach(s => newSelected.delete(s.id));
                                } else {
                                  projectSalaries.forEach(s => newSelected.add(s.id));
                                }
                                setSelectedIds(newSelected);
                              }}
                              onClick={(e) => e.stopPropagation()}
                            />
                            <span className="truncate font-medium" style={{ color: '#1D2129' }}>{projectName}</span>
                            <span className="shrink-0 text-sm" style={{ color: '#86909C' }}>({projectSalaries.length}人)</span>
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-sm sm:flex sm:items-center sm:gap-6">
                            <span style={{ color: '#86909C' }}>应发: <span className="font-medium" style={{ color: '#165DFF' }}>{formatCurrency(projectGrossPay)}</span></span>
                            <span style={{ color: '#86909C' }}>实发: <span className="font-medium" style={{ color: '#00B42A' }}>{formatCurrency(projectNetPay)}</span></span>
                            <span style={{ color: '#86909C' }}>已发: <span className="font-medium" style={{ color: '#722ED1' }}>{formatCurrency(projectPaid)}</span></span>
                          </div>
                        </div>
                        {/* 项目内明细表格 */}
                        {!isCollapsed && (
                          <>
                          <Table className="zebra-table hidden md:table">
              <TableHeader>
                              <TableRow style={{ background: '#FAFBFD', borderBottom: '1px solid #E5E6EB' }}>
                                <TableHead className="w-12"></TableHead>
                                <TableHead style={{ color: '#1D2129' }}>工人</TableHead>
                                <TableHead className="text-right" style={{ color: '#1D2129' }}>工时</TableHead>
                                <TableHead className="text-right" style={{ color: '#1D2129' }}>时薪</TableHead>
                                <TableHead className="text-right" style={{ color: '#1D2129' }}>包工工资</TableHead>
                                <TableHead className="text-right" style={{ color: '#1D2129' }}>应发工资</TableHead>
                                <TableHead className="text-right" style={{ color: '#1D2129' }}>个税</TableHead>
                                <TableHead className="text-right" style={{ color: '#1D2129' }}>预支</TableHead>
                                <TableHead className="text-right" style={{ color: '#1D2129' }}>劳保</TableHead>
                                <TableHead className="text-right" style={{ color: '#1D2129' }}>罚款</TableHead>
                                <TableHead className="text-right" style={{ color: '#1D2129' }}>实发工资</TableHead>
                                <TableHead className="text-center" style={{ color: '#1D2129' }}>发放状态</TableHead>
                                <TableHead className="text-right" style={{ color: '#1D2129' }}>已发</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {projectSalaries.map((salary) => (
                                <TableRow key={salary.id} style={{ background: selectedIds.has(salary.id) ? '#E8F3FF' : 'transparent', borderBottom: '1px solid #E5E6EB' }}>
                                  <TableCell><Checkbox checked={selectedIds.has(salary.id)} onCheckedChange={() => handleSelectOne(salary.id)} /></TableCell>
                                  <TableCell className="font-medium" style={{ color: '#1D2129' }}>{salary.worker_name}</TableCell>
                                  <TableCell className="text-right" style={{ color: '#4E5969' }}>{salary.work_hours}</TableCell>
                                  <TableCell className="text-right" style={{ color: '#4E5969' }}>{salary.hourly_rate}</TableCell>
                                  <TableCell className="text-right" style={{ color: '#4E5969' }}>{salary.contract_work_pay}</TableCell>
                                  <TableCell className="text-right font-medium" style={{ color: '#165DFF' }}>
                                    {(() => {
                                      const currentGross = parseFloat(salary.gross_pay) || 0;
                                      const sameWorkerSalaries = salaries.filter(s => s.worker_id === salary.worker_id && s.year_month < salary.year_month);
                                      const lastSalary = sameWorkerSalaries.sort((a,b) => b.year_month.localeCompare(a.year_month))[0];
                                      const lastGross = lastSalary ? parseFloat(lastSalary.gross_pay) || 0 : 0;
                                      const isAbnormal = lastGross > 0 && ((currentGross - lastGross) / lastGross) > 0.3;
                                      return (
                                        <span className={isAbnormal ? 'px-1.5 py-0.5 rounded text-xs font-bold' : ''} style={isAbnormal ? { background: '#FFECE8', color: '#F53F3F' } : {}}>
                                          {formatCurrency(salary.gross_pay)}
                                          {isAbnormal && <span className="ml-1 text-xs">↑{(((currentGross - lastGross) / lastGross) * 100).toFixed(0)}%</span>}
                                        </span>
                                      );
                                    })()}
                                  </TableCell>
                                  <TableCell className="text-right" style={{ color: '#4E5969' }}>{salary.income_tax}</TableCell>
                                  <TableCell className="text-right" style={{ color: '#4E5969' }}>{salary.advance_pay}</TableCell>
                                  <TableCell className="text-right" style={{ color: '#4E5969' }}>{salary.labor_insurance}</TableCell>
                                  <TableCell className="text-right" style={{ color: '#E5C07B' }}>{salary.fine}</TableCell>
                                  <TableCell className="text-right font-medium" style={{ color: '#00B42A' }}>{formatCurrency(salary.net_pay)}</TableCell>
                                  <TableCell className="text-center">
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                      salary.payment_status === 'overpaid' ? 'bg-red-50 text-red-700' :
                                      salary.payment_status === 'paid' ? 'bg-green-50 text-green-700' :
                                      salary.payment_status === 'partial' ? 'bg-orange-50 text-orange-700' :
                                      'bg-gray-50 text-gray-500'
                                    }`}>
                                      {salary.payment_status === 'overpaid' ? '超额发放' : salary.payment_status === 'paid' ? '已发清' : salary.payment_status === 'partial' ? '部分发放' : '未发放'}
                                    </span>
                                    {salary.payment_warning && (
                                      <p className="mt-1 text-xs text-red-600">{salary.payment_warning}</p>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-right" style={{ color: salary.paid && salary.paid > 0 ? '#722ED1' : '#86909C' }}>
                                    {formatCurrency(salary.paid || 0)}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                          <div className="space-y-2 bg-white p-3 md:hidden">
                            {projectSalaries.map((salary) => (
                              <div key={salary.id} className="rounded-lg border border-gray-100 p-3" style={{ background: selectedIds.has(salary.id) ? '#E8F3FF' : '#FFFFFF' }}>
                                <div className="flex items-start gap-3">
                                  <Checkbox checked={selectedIds.has(salary.id)} onCheckedChange={() => handleSelectOne(salary.id)} className="mt-1" />
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="min-w-0">
                                        <p className="truncate text-sm font-semibold" style={{ color: '#1D2129' }}>{salary.worker_name}</p>
                                        <p className="mt-0.5 text-xs" style={{ color: '#86909C' }}>工时 {salary.work_hours} · 时薪 {salary.hourly_rate}</p>
                                      </div>
                                      <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${
                                        salary.payment_status === 'overpaid' ? 'bg-red-50 text-red-700' :
                                        salary.payment_status === 'paid' ? 'bg-green-50 text-green-700' :
                                        salary.payment_status === 'partial' ? 'bg-orange-50 text-orange-700' :
                                        'bg-gray-50 text-gray-500'
                                      }`}>
                                        {salary.payment_status === 'overpaid' ? '超额发放' : salary.payment_status === 'paid' ? '已发清' : salary.payment_status === 'partial' ? '部分发放' : '未发放'}
                                      </span>
                                    </div>
                                    <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                                      <div>
                                        <p style={{ color: '#86909C' }}>应发</p>
                                        <p className="font-semibold" style={{ color: '#165DFF' }}>{formatCurrency(salary.gross_pay)}</p>
                                      </div>
                                      <div>
                                        <p style={{ color: '#86909C' }}>实发</p>
                                        <p className="font-semibold" style={{ color: '#00B42A' }}>{formatCurrency(salary.net_pay)}</p>
                                      </div>
                                      <div>
                                        <p style={{ color: '#86909C' }}>已发</p>
                                        <p className="font-semibold" style={{ color: salary.paid && salary.paid > 0 ? '#722ED1' : '#86909C' }}>{formatCurrency(salary.paid || 0)}</p>
                                      </div>
                                      <div>
                                        <p style={{ color: '#86909C' }}>包工</p>
                                        <p style={{ color: '#4E5969' }}>{salary.contract_work_pay}</p>
                                      </div>
                                      <div>
                                        <p style={{ color: '#86909C' }}>扣减</p>
                                        <p style={{ color: '#4E5969' }}>{formatCurrency((Number(salary.income_tax) || 0) + (Number(salary.advance_pay) || 0) + (Number(salary.labor_insurance) || 0) + (Number(salary.fine) || 0))}</p>
                                      </div>
                                      <div>
                                        <p style={{ color: '#86909C' }}>未发</p>
                                        <p style={{ color: '#F53F3F' }}>{formatCurrency(salary.unpaid_amount || 0)}</p>
                                      </div>
                                    </div>
                                    {salary.payment_warning && (
                                      <p className="mt-2 rounded bg-red-50 px-2 py-1 text-xs text-red-600">{salary.payment_warning}</p>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                          </>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>
            ) : (
              <div className="empty-state py-12">
                <div className="empty-state-icon">
                  <FileText className="w-10 h-10" style={{ color: '#C9CDD4' }} />
                </div>
                <p className="empty-state-title text-base">当月暂无工资数据</p>
                <p className="empty-state-description mb-4">可切换月份查看历史数据，或导入当月工资</p>
                <div className="flex gap-3 justify-center flex-wrap">
                  <Button variant="outline" size="sm" onClick={() => document.querySelector<HTMLInputElement>('input[type="month"]')?.focus()}>
                    <Calendar className="w-4 h-4 mr-1" />切换月份
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                    <Upload className="w-4 h-4 mr-1" />导入工资
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => {
                    const unpaidTab = document.querySelector('[data-tab="unpaid"]');
                    if (unpaidTab) (unpaidTab as HTMLButtonElement).click();
                  }}>
                    <DollarSign className="w-4 h-4 mr-1" />查看未发放
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 批量修改对话框 */}
      <Dialog open={batchEditDialogOpen} onOpenChange={setBatchEditDialogOpen}>
        <DialogContent className="max-h-[90vh] w-[calc(100vw-1.5rem)] overflow-y-auto sm:max-w-lg">
          <DialogHeader><DialogTitle className="dialog-header">批量修改（已选 {selectedIds.size} 项）</DialogTitle></DialogHeader>
          <form onSubmit={handleBatchEdit} className="space-y-4">
            <div><Label className="text-sm" style={{ color: '#1D2129' }}>选择要修改的字段</Label>
              <Select value={batchEditField} onValueChange={setBatchEditField}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="选择字段" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="work_hours">工时</SelectItem>
                  <SelectItem value="hourly_rate">时薪</SelectItem>
                  <SelectItem value="contract_work_pay">包工工资</SelectItem>
                  <SelectItem value="income_tax">个人所得税</SelectItem>
                  <SelectItem value="advance_pay">预支款</SelectItem>
                  <SelectItem value="labor_insurance">劳保费</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {batchEditField && <div><Label className="text-sm" style={{ color: '#1D2129' }}>新值</Label><Input type="number" step="0.01" value={batchEditValue} onChange={(e) => setBatchEditValue(e.target.value)} className="mt-1.5" /></div>}
            <div className="grid grid-cols-2 gap-3 border-t pt-3 sm:flex sm:justify-end" style={{ borderColor: '#E5E6EB' }}>
              <Button type="button" variant="outline" onClick={() => setBatchEditDialogOpen(false)} className="border-gray-300">取消</Button>
              <Button type="submit" disabled={!batchEditField} className="btn-primary">确认修改</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* 数据管理弹窗 */}
      <Dialog open={dataManagerOpen} onOpenChange={setDataManagerOpen}>
        <DialogContent className="flex max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-4xl flex-col overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="dialog-header flex items-center gap-2">
              <Settings className="w-5 h-5 text-orange-600" />
              数据管理 - 清除错误数据
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-500 -mt-2">
            选择要删除的工资记录（建议先导出数据备份后再操作）
          </p>
          {dataManagerLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-gray-500">加载中...</div>
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-auto">
                {(() => {
                  // 按项目分组
                  const grouped = allSalaries.reduce((acc, salary) => {
                    const key = salary.project_name || '未知项目';
                    if (!acc[key]) acc[key] = [];
                    acc[key].push(salary);
                    return acc;
                  }, {} as Record<string, typeof allSalaries>);
                  const projects = Object.keys(grouped).sort();
                  
                  return projects.length === 0 ? (
                    <div className="text-center text-gray-500 py-8">暂无数据</div>
                  ) : (
                    <div className="space-y-3">
                      {projects.map((projectName) => {
                        const projectSalaries = grouped[projectName];
                        const allSelected = projectSalaries.every(s => deleteSelectedIds.has(s.id));
                        const someSelected = projectSalaries.some(s => deleteSelectedIds.has(s.id));
                        const projectTotal = projectSalaries.reduce((sum, s) => sum + (Number(s.net_pay) || 0), 0);
                        const isCollapsed = collapsedProjects.has(projectName);
                        
                        return (
                          <div key={projectName} className="border rounded-lg overflow-hidden">
                            {/* 项目标题行 - 可折叠 */}
                            <div 
                              className="flex cursor-pointer flex-col gap-3 bg-gray-50 px-4 py-3 transition-colors hover:bg-gray-100 sm:flex-row sm:items-center sm:justify-between"
                              onClick={() => {
                                // 切换折叠/展开状态
                                const newCollapsed = new Set(collapsedProjects);
                                if (isCollapsed) {
                                  newCollapsed.delete(projectName);
                                } else {
                                  newCollapsed.add(projectName);
                                }
                                setCollapsedProjects(newCollapsed);
                              }}
                            >
                              <div className="flex min-w-0 items-center gap-3">
                                {/* 单独的折叠箭头，不触发勾选 */}
                                <button 
                                  className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-600"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    // 切换折叠/展开状态
                                    const newCollapsed = new Set(collapsedProjects);
                                    if (isCollapsed) {
                                      newCollapsed.delete(projectName);
                                    } else {
                                      newCollapsed.add(projectName);
                                    }
                                    setCollapsedProjects(newCollapsed);
                                  }}
                                >
                                  <span className={`transition-transform ${isCollapsed ? '' : 'rotate-180'}`}>▼</span>
                                </button>
                                {/* 勾选框，单独处理 */}
                                <Checkbox 
                                  checked={allSelected}
                                  onCheckedChange={() => {
                                    const newSelected = new Set(deleteSelectedIds);
                                    if (allSelected) {
                                      projectSalaries.forEach(s => newSelected.delete(s.id));
                                    } else {
                                      projectSalaries.forEach(s => newSelected.add(s.id));
                                    }
                                    setDeleteSelectedIds(newSelected);
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                />
                                <span className="truncate font-medium text-gray-800">{projectName}</span>
                                <span className="shrink-0 text-sm text-gray-500">({projectSalaries.length}条记录)</span>
                              </div>
                              <div className="flex items-center gap-4 sm:justify-end">
                                <span className="text-sm text-gray-500">实发合计: <span className="font-medium text-green-600">{formatCurrency(projectTotal)}</span></span>
                              </div>
                            </div>
                            {/* 项目内明细表格 - 根据折叠状态显示/隐藏 */}
                            {!isCollapsed && (
                              <>
                              <Table className="zebra-table hidden md:table">
              <TableHeader>
                                  <TableRow className="bg-white">
                                    <TableHead className="w-12"></TableHead>
                                    <TableHead>姓名</TableHead>
                                    <TableHead>年月</TableHead>
                                    <TableHead className="text-right">工时</TableHead>
                                    <TableHead className="text-right">应发工资</TableHead>
                                    <TableHead className="text-right">实发工资</TableHead>
                                    <TableHead>备注</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {projectSalaries.map((salary) => (
                                    <TableRow key={salary.id} className={deleteSelectedIds.has(salary.id) ? 'bg-red-50' : ''}>
                                      <TableCell><Checkbox checked={deleteSelectedIds.has(salary.id)} onCheckedChange={() => handleDeleteSelectOne(salary.id)} /></TableCell>
                                      <TableCell className="font-medium">{salary.worker_name}</TableCell>
                                      <TableCell>{salary.year_month}</TableCell>
                                      <TableCell className="text-right">{salary.work_hours}</TableCell>
                                      <TableCell className="text-right">{formatCurrency(salary.gross_pay)}</TableCell>
                                      <TableCell className="text-right font-medium" style={{ color: '#00B42A' }}>{formatCurrency(salary.net_pay)}</TableCell>
                                      <TableCell className="text-gray-400 text-sm">{salary.remark || '-'}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                              <div className="space-y-2 bg-white p-3 md:hidden">
                                {projectSalaries.map((salary) => (
                                  <div key={salary.id} className={`rounded-lg border p-3 ${deleteSelectedIds.has(salary.id) ? 'border-red-100 bg-red-50' : 'border-gray-100 bg-white'}`}>
                                    <div className="flex items-start gap-3">
                                      <Checkbox checked={deleteSelectedIds.has(salary.id)} onCheckedChange={() => handleDeleteSelectOne(salary.id)} className="mt-1" />
                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-start justify-between gap-3">
                                          <div className="min-w-0">
                                            <p className="truncate text-sm font-semibold text-gray-900">{salary.worker_name}</p>
                                            <p className="mt-0.5 text-xs text-gray-500">{salary.year_month} · 工时 {salary.work_hours}</p>
                                          </div>
                                          <p className="shrink-0 text-sm font-semibold" style={{ color: '#00B42A' }}>{formatCurrency(salary.net_pay)}</p>
                                        </div>
                                        <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                                          <div><span className="text-gray-500">应发 </span><span className="font-medium">{formatCurrency(salary.gross_pay)}</span></div>
                                          <div><span className="text-gray-500">备注 </span><span className="text-gray-600">{salary.remark || '-'}</span></div>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
              <div className="flex flex-col gap-3 pt-4 border-t sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: '#E5E6EB' }}>
                <div className="text-sm text-gray-500">
                  共 {allSalaries.length} 条记录，已选择 {deleteSelectedIds.size} 条（跨 {(() => { const groups = new Set(Array.from(deleteSelectedIds).map(id => allSalaries.find(s => s.id === id)?.project_name)); return groups.size; })()} 个项目）
                </div>
                <div className="grid grid-cols-2 gap-3 sm:flex">
                  <Button type="button" variant="outline" onClick={() => setDataManagerOpen(false)} className="border-gray-300">取消</Button>
                  <Button type="button" variant="destructive" onClick={handleDataManagerDelete} disabled={deleteSelectedIds.size === 0}>
                    <Trash2 className="w-4 h-4 mr-1.5" />确认删除 ({deleteSelectedIds.size})
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* 导入结果对话框 */}
      <AlertDialog open={importResultOpen} onOpenChange={setImportResultOpen}>
        <AlertDialogContent className="w-[calc(100vw-1.5rem)] max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>导入结果</AlertDialogTitle>
          </AlertDialogHeader>
          <div className="space-y-3 py-2">
            {importResult && (
              <>
                {/* 成功统计 */}
                <div className="rounded-lg border border-green-200 bg-green-50 p-3">
                  <div className="flex items-center gap-2 text-green-700 font-medium">
                    <DollarSign className="w-4 h-4" />
                    <span>成功导入 {importResult.count} 条记录</span>
                  </div>
                  {importResult.importedYearMonths?.length > 0 && (
                    <div className="mt-1 text-sm text-green-600">
                      涉及年月：{importResult.importedYearMonths.join('、')}
                    </div>
                  )}
                </div>

                {/* 不在花名册的人员 */}
                {importResult.notInRoster?.length > 0 && (
                  <div className="rounded-lg border border-orange-200 bg-orange-50 p-3">
                    <div className="flex items-center gap-2 text-orange-700 font-medium">
                      <Users className="w-4 h-4" />
                      <span>以下 {importResult.notInRoster.length} 人不在花名册中</span>
                    </div>
                    <div className="mt-2 space-y-1">
                      {importResult.notInRoster.map((item: { row: number; name: string }, idx: number) => (
                        <div key={idx} className="text-sm text-orange-600 flex items-center gap-2">
                          <span className="w-4 h-4 rounded-full bg-orange-200 flex items-center justify-center text-xs">{idx + 1}</span>
                          <span>{item.name}</span>
                          <span className="text-orange-400">（第{item.row}行）</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 text-xs text-orange-500">请先将以上人员添加到花名册中，再重新导入</div>
                  </div>
                )}

                {/* 未找到的项目 */}
                {importResult.notFoundProjects?.length > 0 && (
                  <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3">
                    <div className="flex items-center gap-2 text-yellow-700 font-medium">
                      <FileText className="w-4 h-4" />
                      <span>以下项目未匹配（已设为空）</span>
                    </div>
                    <div className="mt-1 text-sm text-yellow-600">
                      {importResult.notFoundProjects.join('、')}
                    </div>
                  </div>
                )}

                {/* 其他警告 */}
                {importResult.warnings?.filter((w: string) => !w.includes('不在花名册')).length > 0 && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                    <div className="text-red-700 font-medium text-sm">其他警告</div>
                    <ul className="mt-1 text-sm text-red-600 space-y-1">
                      {importResult.warnings.filter((w: string) => !w.includes('不在花名册')).map((w: string, i: number) => (
                        <li key={i}>• {w}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* 全部成功 */}
                {(!importResult.notInRoster?.length && !importResult.notFoundProjects?.length && !importResult.warnings?.filter((w: string) => !w.includes('不在花名册')).length) && (
                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                    <div className="text-blue-700 text-sm">所有记录均已成功导入，无异常</div>
                  </div>
                )}
              </>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setImportResultOpen(false)}>确定</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* 批量删除二次确认 */}
      <AlertDialog open={batchDeleteConfirm} onOpenChange={setBatchDeleteConfirm}>
        <AlertDialogContent className="w-[calc(100vw-1.5rem)] max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-5 h-5" />
              确认批量删除
            </AlertDialogTitle>
            <AlertDialogDescription>
              即将删除 <span className="font-bold text-red-600">{selectedIds.size}</span> 条工资记录，此操作不可撤销。删除后相关工资发放记录也将受影响，请确认是否继续？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => { handleBatchDelete(); setBatchDeleteConfirm(false); }} className="bg-red-600 hover:bg-red-700">确认删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
