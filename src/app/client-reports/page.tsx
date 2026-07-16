'use client';
import { useToast } from '@/hooks/use-toast';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import EChartsWrapper, { CHART_COLORS } from '@/components/charts/echarts-wrapper';
import { AmountDisplay } from '@/components/business/common';
import { Calculator, DollarSign, Plus, Upload, Download, FileText, Pencil, Trash2, FileSpreadsheet, Percent, Printer } from 'lucide-react';

interface ClientReport {
  id: number;
  project_id: number;
  project_name: string;
  settlement_amount: string;
  invoice_amount: string;
  deduction_amount: string;
  proportional_payment: string;
  tax_rate: number;
  untaxed_income: number;
  tax_amount: number;
  report_date: string;
  remark: string;
}

interface Project {
  id: number;
  name: string;
  tax_rate?: number;
}

interface ChartData {
  date: string;
  结算金额: number;
}

export default function ClientReportsPage() {
  const { toast } = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>('all');
  const [reports, setReports] = useState<ClientReport[]>([]);
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [loading, setLoading] = useState(true);
  
  // 统计
  const [stats, setStats] = useState({
    totalSettlement: '0',
    totalInvoice: '0',
    totalDeduction: '0',
    totalProportional: '0',
    totalUntaxedIncome: '0',
    totalTaxAmount: '0',
  });
  
  // 新增对话框
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newForm, setNewForm] = useState({
    project_id: '',
    settlement_amount: '',
    invoice_amount: '',
    deduction_amount: '',
    proportional_payment: '',
    tax_rate: '',
    report_date: new Date().toISOString().split('T')[0],
    remark: '',
  });
  
  // 批量录入对话框
  const [batchDialogOpen, setBatchDialogOpen] = useState(false);
  const [batchProjectId, setBatchProjectId] = useState('');
  const [batchReportDate, setBatchReportDate] = useState(new Date().toISOString().split('T')[0]);
  const [batchText, setBatchText] = useState('');
  const [batchProjectTaxRate, setBatchProjectTaxRate] = useState<number>(9);
  
  // 编辑和删除
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingReport, setEditingReport] = useState<ClientReport | null>(null);
  const [deletingReport, setDeletingReport] = useState<ClientReport | null>(null);
  const [editForm, setEditForm] = useState({
    settlement_amount: '',
    invoice_amount: '',
    deduction_amount: '',
    proportional_payment: '',
    tax_rate: '',
    report_date: '',
    remark: '',
  });
  
  // 导入导出
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchProjects();
  }, []);

  useEffect(() => {
    fetchReports();
  }, [selectedProject]);

  // 项目选择变更时更新税率
  useEffect(() => {
    if (newForm.project_id) {
      const project = projects.find(p => p.id === parseInt(newForm.project_id));
      const taxRate = project?.tax_rate || 9;
      setNewForm(prev => ({ ...prev, tax_rate: taxRate.toString() }));
    }
  }, [newForm.project_id, projects]);

  useEffect(() => {
    if (batchProjectId) {
      const project = projects.find(p => p.id === parseInt(batchProjectId));
      setBatchProjectTaxRate(project?.tax_rate || 9);
    }
  }, [batchProjectId, projects]);

  const fetchProjects = async () => {
    try {
      const res = await fetch('/api/projects');
      const data = await res.json();
      setProjects(data.projects || []);
    } catch (error) {
      console.error('获取项目列表失败:', error);
    }
  };

  const fetchReports = async () => {
    setLoading(true);
    try {
      const url = selectedProject === 'all' 
        ? '/api/client-reports' 
        : `/api/client-reports?project_id=${selectedProject}`;
      const res = await fetch(url, { credentials: 'include' });
      const data = await res.json();
      
      setReports(data.reports || []);
      setStats({
        totalSettlement: data.totalSettlement || '0',
        totalInvoice: data.totalInvoice || '0',
        totalDeduction: data.totalDeduction || '0',
        totalProportional: data.totalProportional || '0',
        totalUntaxedIncome: data.totalUntaxedIncome || '0',
        totalTaxAmount: data.totalTaxAmount || '0',
      });
      setChartData(data.chartData || []);
    } catch (error) {
      console.error('获取产值结算数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/client-reports', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newForm),
      });
      if (res.ok) {
        setAddDialogOpen(false);
        setNewForm({
          project_id: '',
          settlement_amount: '',
          invoice_amount: '',
          deduction_amount: '',
          proportional_payment: '',
          tax_rate: '',
          report_date: new Date().toISOString().split('T')[0],
          remark: '',
        });
        fetchReports();
      } else {
        const error = await res.json();
        toast({ title: error.error || '添加失败', variant: 'error' });
      }
    } catch (error) {
      toast({ title: '添加失败', variant: 'error' });
    }
  };

  const handleBatchAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!batchProjectId || !batchReportDate || !batchText.trim()) {
      toast({ title: '请选择项目、日期并输入数据' });
      return;
    }
    
    try {
      const lines = batchText.trim().split('\n');
      const records = lines.map(line => {
        const parts = line.split(/[,\t，]/).map(p => p.trim());
        return {
          project_id: batchProjectId,
          settlement_amount: parts[0] || '',
          invoice_amount: parts[1] || '',
          deduction_amount: parts[2] || '',
          proportional_payment: parts[3] || '',
          report_date: batchReportDate,
          remark: parts[4] || '',
        };
      }).filter(item => item.settlement_amount);
      
      if (records.length === 0) {
        toast({ title: '没有有效数据' });
        return;
      }
      
      const res = await fetch('/api/client-reports', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(records),
      });
      
      if (res.ok) {
        const data = await res.json();
        setBatchDialogOpen(false);
        setBatchText('');
        fetchReports();
        toast({ title: `成功添加 ${data.count || records.length} 条记录` });
      } else {
        const error = await res.json();
        toast({ title: error.error || '批量添加失败', variant: 'error' });
      }
    } catch (error) {
      toast({ title: '批量添加失败', variant: 'error' });
    }
  };

  const downloadTemplate = () => {
    const content = '项目名称,结算金额,开票金额,扣款金额,比例付款,报量日期,备注\n南京中交智慧港,500000,500000,0,450000,2025-01-15,\n南京中交智慧港,300000,300000,5000,270000,2025-02-20,含质保金';
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = '产值结算导入模板.csv';
    link.click();
  };

  // 导出Excel
  const handleExport = async () => {
    try {
      const url = selectedProject === 'all' 
        ? '/api/client-reports/export' 
        : `/api/client-reports/export?project_id=${selectedProject}`;
      const res = await fetch(url);
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || '导出失败');
      }
      
      const blob = await res.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `产值结算_${new Date().toISOString().split('T')[0]}.xlsx`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (error: any) {
      toast({ title: error.message || '导出失败', variant: 'error' });
    }
  };

  // 导入Excel
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const res = await fetch('/api/client-reports/import', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        if (data.details) {
          toast({ title: `导入失败：\n${data.details.join('\n')}` });
        } else {
          throw new Error(data.error || '导入失败');
        }
        return;
      }
      
      toast({ title: `成功导入 ${data.count} 条记录` });
      fetchReports();
    } catch (error: any) {
      toast({ title: error.message || '导入失败', variant: 'error' });
    } finally {
      setImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const formatCurrency = (value: string | number) => {
    const num = typeof value === 'string' ? parseFloat(value || '0') : value;
    if (num === 0) return '-';
    return new Intl.NumberFormat('zh-CN', {
      style: 'currency',
      currency: 'CNY',
      minimumFractionDigits: 2,
    }).format(num);
  };

  const formatNumber = (value: string | number) => {
    const num = typeof value === 'string' ? parseFloat(value || '0') : value;
    if (num === 0) return '-';
    return num.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // 编辑功能
  const handleEdit = (report: ClientReport) => {
    setEditingReport(report);
    setEditForm({
      settlement_amount: report.settlement_amount || '',
      invoice_amount: report.invoice_amount || '',
      deduction_amount: report.deduction_amount || '',
      proportional_payment: report.proportional_payment || '',
      tax_rate: report.tax_rate?.toString() || '',
      report_date: report.report_date?.split('T')[0] || '',
      remark: report.remark || '',
    });
    setEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editingReport) return;
    try {
      const res = await fetch('/api/client-reports', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingReport.id,
          ...editForm,
        }),
      });
      if (res.ok) {
        setEditDialogOpen(false);
        setEditingReport(null);
        fetchReports();
      } else {
        const error = await res.json();
        toast({ title: error.error || '保存失败', variant: 'error' });
      }
    } catch (error) {
      toast({ title: '保存失败', variant: 'error' });
    }
  };

  // 删除功能
  const handleDelete = (report: ClientReport) => {
    setDeletingReport(report);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!deletingReport) return;
    try {
      const res = await fetch(`/api/client-reports?id=${deletingReport.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.ok) {
        setDeleteDialogOpen(false);
        setDeletingReport(null);
        fetchReports();
      } else {
        const error = await res.json();
        toast({ title: error.error || '删除失败', variant: 'error' });
      }
    } catch (error) {
      toast({ title: '删除失败', variant: 'error' });
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 tracking-tight">产值结算</h1>
          <p className="text-sm text-gray-500 mt-0.5">管理产值结算、开票金额、扣款和按比例付款</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:flex lg:flex-wrap lg:justify-end">
          <Button variant="outline" onClick={downloadTemplate} className="w-full lg:w-auto">
            <FileSpreadsheet className="w-4 h-4 mr-2" />
            下载模板
          </Button>
          <Button variant="outline" onClick={handleExport} className="w-full lg:w-auto">
            <Download className="w-4 h-4 mr-2" />
            导出
          </Button>
          <Button variant="outline" onClick={() => window.print()} className="w-full lg:w-auto">
            <Printer className="w-4 h-4 mr-2" />
            打印
          </Button>
          <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={importing} className="w-full lg:w-auto">
            <Upload className="w-4 h-4 mr-2" />
            {importing ? '导入中...' : '导入'}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleImport}
            className="hidden"
          />
          <Button variant="outline" onClick={() => setBatchDialogOpen(true)} className="w-full lg:w-auto">
            <Upload className="w-4 h-4 mr-2" />
            批量录入
          </Button>
          <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => setAddDialogOpen(true)} className="w-full lg:w-auto" style={{ background: '#165DFF' }}>
                <Plus className="w-4 h-4 mr-2" />
                新增结算
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-2xl overflow-y-auto">
              <DialogHeader>
                <DialogTitle>新增产值结算</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleAdd} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label>项目 *</Label>
                    <Select
                      value={newForm.project_id}
                      onValueChange={(value) => setNewForm({ ...newForm, project_id: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="选择项目" />
                      </SelectTrigger>
                      <SelectContent>
                        {projects.map((project) => (
                          <SelectItem key={project.id} value={project.id.toString()}>
                            {project.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>结算日期 *</Label>
                    <Input
                      type="date"
                      value={newForm.report_date}
                      onChange={(e) => setNewForm({ ...newForm, report_date: e.target.value })}
                      required
                    />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label>结算金额</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={newForm.settlement_amount}
                      onChange={(e) => setNewForm({ ...newForm, settlement_amount: e.target.value })}
                      placeholder="结算金额"
                    />
                  </div>
                  <div>
                    <Label>开票金额</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={newForm.invoice_amount}
                      onChange={(e) => setNewForm({ ...newForm, invoice_amount: e.target.value })}
                      placeholder="开票金额"
                    />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <Label>扣款金额</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={newForm.deduction_amount}
                      onChange={(e) => setNewForm({ ...newForm, deduction_amount: e.target.value })}
                      placeholder="扣款金额"
                    />
                  </div>
                  <div>
                    <Label>按比例付款金额</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={newForm.proportional_payment}
                      onChange={(e) => setNewForm({ ...newForm, proportional_payment: e.target.value })}
                      placeholder="按比例付款金额"
                    />
                  </div>
                  <div>
                    <Label>适用税率 (%)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={newForm.tax_rate}
                      onChange={(e) => setNewForm({ ...newForm, tax_rate: e.target.value })}
                      placeholder="如 9"
                    />
                    <p className="text-xs mt-1 text-gray-400">默认从项目继承，可修改</p>
                  </div>
                </div>
                <div>
                  <Label>备注</Label>
                  <Textarea
                    value={newForm.remark}
                    onChange={(e) => setNewForm({ ...newForm, remark: e.target.value })}
                    placeholder="备注信息"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2 pt-4 sm:flex sm:justify-end">
                  <Button type="button" variant="outline" onClick={() => setAddDialogOpen(false)}>
                    取消
                  </Button>
                  <Button type="submit" style={{ background: '#165DFF' }}>提交</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-blue-600">结算金额总额</p>
                <p className="text-2xl font-bold text-blue-700 mt-1">{formatCurrency(stats.totalSettlement)}</p>
              </div>
              <Calculator className="w-10 h-10 text-blue-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-green-600">开票金额总额</p>
                <p className="text-2xl font-bold text-green-700 mt-1">{formatCurrency(stats.totalInvoice)}</p>
              </div>
              <FileText className="w-10 h-10 text-green-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-purple-200 bg-purple-50">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-purple-600">不含税收入</p>
                <p className="text-xl font-bold text-purple-700 mt-1">{formatCurrency(stats.totalUntaxedIncome)}</p>
                <p className="text-xs text-purple-500 mt-0.5">自动计算</p>
              </div>
              <Calculator className="w-10 h-10 text-purple-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-orange-600">税费总额</p>
                <p className="text-xl font-bold text-orange-700 mt-1">{formatCurrency(stats.totalTaxAmount)}</p>
                <p className="text-xs text-orange-500 mt-0.5">自动计算</p>
              </div>
              <Percent className="w-10 h-10 text-orange-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-red-600">扣款金额总额</p>
                <p className="text-2xl font-bold text-red-700 mt-1">{formatCurrency(stats.totalDeduction)}</p>
              </div>
              <DollarSign className="w-10 h-10 text-red-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 项目选择 */}
      <Card>
        <CardContent className="pt-6">
          <Select value={selectedProject} onValueChange={setSelectedProject}>
            <SelectTrigger className="w-full md:w-64">
              <SelectValue placeholder="选择项目" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部项目</SelectItem>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id.toString()}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* 图表 */}
      <Card>
        <CardHeader>
          <CardTitle>产值结算统计（按时间线）</CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length > 0 ? (
            <EChartsWrapper
              option={{
                tooltip: { trigger: 'axis', formatter: (params: any) => `${params[0].axisValue}<br/>结算金额: ¥${Number(params[0].value).toLocaleString()}` },
                grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
                xAxis: { type: 'category', data: chartData.map(d => d.date), axisLabel: { rotate: 30 } },
                yAxis: { type: 'value', axisLabel: { formatter: (v: number) => `¥${(v/10000).toFixed(0)}万` } },
                series: [{
                  name: '结算金额',
                  type: 'line',
                  data: chartData.map(d => d.结算金额),
                  smooth: true,
                  areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(22,93,255,0.3)' }, { offset: 1, color: 'rgba(22,93,255,0.02)' }] } },
                  lineStyle: { color: '#165DFF', width: 2 },
                  itemStyle: { color: '#165DFF' },
                }],
              }}
              style={{ height: 320 }}
            />
          ) : (
            <div className="text-center py-8 text-gray-500">暂无数据</div>
          )}
        </CardContent>
      </Card>

      {/* 结算表格 */}
      <Card>
        <CardHeader>
          <CardTitle>产值结算明细</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-gray-500">加载中...</div>
          ) : reports.length > 0 ? (
            <>
              <div className="hidden md:block overflow-x-auto">
                <Table className="zebra-table min-w-[1080px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>项目名称</TableHead>
                      <TableHead>结算日期</TableHead>
                      <TableHead className="text-right">结算金额</TableHead>
                      <TableHead className="text-right">开票金额</TableHead>
                      <TableHead className="text-right">税率</TableHead>
                      <TableHead className="text-right">不含税收入</TableHead>
                      <TableHead className="text-right">税费</TableHead>
                      <TableHead className="text-right">扣款金额</TableHead>
                      <TableHead className="text-right">按比例付款</TableHead>
                      <TableHead>备注</TableHead>
                      <TableHead className="text-center">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reports.map((report) => (
                      <TableRow key={report.id}>
                        <TableCell className="font-medium">{report.project_name}</TableCell>
                        <TableCell>{report.report_date?.split('T')[0]}</TableCell>
                        <TableCell className="text-right font-medium text-blue-600">
                          {formatCurrency(report.settlement_amount)}
                        </TableCell>
                        <TableCell className="text-right text-green-600">
                          {formatCurrency(report.invoice_amount)}
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="px-2 py-0.5 rounded text-xs" style={{ background: '#E8F3FF', color: '#165DFF' }}>
                            {report.tax_rate || 9}%
                          </span>
                        </TableCell>
                        <TableCell className="text-right text-purple-600">
                          {formatNumber(report.untaxed_income)}
                        </TableCell>
                        <TableCell className="text-right text-orange-600">
                          {formatNumber(report.tax_amount)}
                        </TableCell>
                        <TableCell className="text-right text-red-600">
                          {formatCurrency(report.deduction_amount)}
                        </TableCell>
                        <TableCell className="text-right text-gray-600">
                          {formatCurrency(report.proportional_payment)}
                        </TableCell>
                        <TableCell className="text-gray-500">{report.remark || '-'}</TableCell>
                        <TableCell className="text-center">
                          <div className="flex justify-center gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEdit(report)}
                              className="h-8 px-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(report)}
                              className="h-8 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="space-y-3 md:hidden">
                {reports.map((report) => (
                  <div key={report.id} className="rounded-lg border bg-white p-3 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-medium text-gray-900">{report.project_name}</div>
                        <div className="mt-1 text-xs text-gray-500">{report.report_date?.split('T')[0] || '-'}</div>
                      </div>
                      <span className="shrink-0 rounded px-2 py-0.5 text-xs" style={{ background: '#E8F3FF', color: '#165DFF' }}>
                        税率 {report.tax_rate || 9}%
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                      <div className="rounded bg-blue-50 p-2">
                        <div className="text-xs text-blue-600">结算金额</div>
                        <div className="mt-1 font-semibold text-blue-700">{formatCurrency(report.settlement_amount)}</div>
                      </div>
                      <div className="rounded bg-green-50 p-2">
                        <div className="text-xs text-green-600">开票金额</div>
                        <div className="mt-1 font-semibold text-green-700">{formatCurrency(report.invoice_amount)}</div>
                      </div>
                      <div className="rounded bg-purple-50 p-2">
                        <div className="text-xs text-purple-600">不含税收入</div>
                        <div className="mt-1 font-semibold text-purple-700">{formatNumber(report.untaxed_income)}</div>
                      </div>
                      <div className="rounded bg-orange-50 p-2">
                        <div className="text-xs text-orange-600">税费</div>
                        <div className="mt-1 font-semibold text-orange-700">{formatNumber(report.tax_amount)}</div>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-gray-600">
                      <div>扣款：<span className="font-medium text-red-600">{formatCurrency(report.deduction_amount)}</span></div>
                      <div>按比例付款：<span className="font-medium text-gray-900">{formatCurrency(report.proportional_payment)}</span></div>
                    </div>
                    {report.remark && <div className="mt-2 text-xs text-gray-500">备注：{report.remark}</div>}
                    <div className="mt-3 grid grid-cols-2 gap-2 border-t pt-3 sm:flex sm:justify-end">
                      <Button variant="outline" size="sm" onClick={() => handleEdit(report)} className="h-8">
                        <Pencil className="mr-1 h-3.5 w-3.5" />
                        编辑
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleDelete(report)} className="h-8 text-red-600 hover:text-red-700">
                        <Trash2 className="mr-1 h-3.5 w-3.5" />
                        删除
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="text-center py-8 text-gray-500">
              暂无结算数据
            </div>
          )}
        </CardContent>
      </Card>

      {/* 批量录入对话框 */}
      <Dialog open={batchDialogOpen} onOpenChange={setBatchDialogOpen}>
        <DialogContent className="max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>批量录入产值结算</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleBatchAdd} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>选择项目 *</Label>
                <Select value={batchProjectId} onValueChange={setBatchProjectId}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择项目" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id.toString()}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>结算日期 *</Label>
                <Input
                  type="date"
                  value={batchReportDate}
                  onChange={(e) => setBatchReportDate(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
              <div className="flex items-center gap-2">
                <span className="text-sm text-blue-600">适用税率：</span>
                <span className="font-bold text-blue-700">{batchProjectTaxRate}%</span>
                <span className="text-xs text-blue-500">（从项目继承）</span>
              </div>
            </div>
            <div>
              <Label>结算数据（每行一条，格式：结算金额,开票金额,扣款金额,按比例付款金额,备注）</Label>
              <Textarea
                value={batchText}
                onChange={(e) => setBatchText(e.target.value)}
                placeholder="500000,500000,0,450000,&#10;300000,300000,5000,270000,含质保金"
                rows={10}
              />
            </div>
            <div className="grid grid-cols-2 gap-2 pt-4 sm:flex sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setBatchDialogOpen(false)}>
                取消
              </Button>
              <Button type="submit" style={{ background: '#165DFF' }}>批量录入</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* 编辑对话框 */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>编辑产值结算</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-3 rounded-lg bg-gray-50 border">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">项目：</span>
                <span className="font-medium text-gray-900">{editingReport?.project_name}</span>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>结算金额</Label>
                <Input
                  type="number"
                  value={editForm.settlement_amount}
                  onChange={(e) => setEditForm({ ...editForm, settlement_amount: e.target.value })}
                  placeholder="结算金额"
                />
              </div>
              <div>
                <Label>开票金额</Label>
                <Input
                  type="number"
                  value={editForm.invoice_amount}
                  onChange={(e) => setEditForm({ ...editForm, invoice_amount: e.target.value })}
                  placeholder="开票金额"
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label>扣款金额</Label>
                <Input
                  type="number"
                  value={editForm.deduction_amount}
                  onChange={(e) => setEditForm({ ...editForm, deduction_amount: e.target.value })}
                  placeholder="扣款金额"
                />
              </div>
              <div>
                <Label>按比例付款</Label>
                <Input
                  type="number"
                  value={editForm.proportional_payment}
                  onChange={(e) => setEditForm({ ...editForm, proportional_payment: e.target.value })}
                  placeholder="按比例付款"
                />
              </div>
              <div>
                <Label>适用税率 (%)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={editForm.tax_rate}
                  onChange={(e) => setEditForm({ ...editForm, tax_rate: e.target.value })}
                  placeholder="如 9"
                />
              </div>
            </div>
            <div>
              <Label>结算日期</Label>
              <Input
                type="date"
                value={editForm.report_date}
                onChange={(e) => setEditForm({ ...editForm, report_date: e.target.value })}
              />
            </div>
            <div>
              <Label>备注</Label>
              <Textarea
                value={editForm.remark}
                onChange={(e) => setEditForm({ ...editForm, remark: e.target.value })}
                placeholder="备注信息"
                rows={3}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>取消</Button>
            <Button onClick={handleSaveEdit} style={{ background: '#165DFF' }}>保存</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 删除确认对话框 */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-md">
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
          </DialogHeader>
          <p className="py-4">确定要删除该产值结算记录吗？此操作不可恢复。</p>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>取消</Button>
            <Button variant="destructive" onClick={handleConfirmDelete}>删除</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
