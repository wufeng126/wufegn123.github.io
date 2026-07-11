'use client';
import { useToast } from '@/hooks/use-toast';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import EChartsWrapper, { CHART_COLORS } from '@/components/charts/echarts-wrapper';
import { StatusTag, AmountDisplay } from '@/components/business/common';
import { DollarSign, TrendingUp, TrendingDown, Plus, CreditCard, Upload, Download, Pencil, Trash2, FileSpreadsheet, Printer } from 'lucide-react';

interface ClientPayment {
  id: number;
  project_id: number;
  project_name: string;
  amount: string;
  payment_amount: string;
  payment_date: string;
  payment_method: string;
  status: string;
  remark: string;
}

interface Project {
  id: number;
  name: string;
}

interface ChartData {
  project: string;
  amount: number;
}

interface TrendData {
  month: string;
  amount: number;
}

export default function ClientPaymentsPage() {
  const { toast } = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>('all');
  const [payments, setPayments] = useState<ClientPayment[]>([]);
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [trendData, setTrendData] = useState<TrendData[]>([]);
  const [totalAmount, setTotalAmount] = useState('0');
  const [totalPaid, setTotalPaid] = useState('0');
  const [totalPending, setTotalPending] = useState('0');
  const [loading, setLoading] = useState(true);
  
  // 新增付款对话框
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newForm, setNewForm] = useState({
    project_id: '',
    amount: '',
    payment_date: new Date().toISOString().split('T')[0],
    payment_method: 'bank_transfer',
    status: 'completed',
    remark: '',
  });
  
  // 批量导入
  const [batchDialogOpen, setBatchDialogOpen] = useState(false);
  const [batchProjectId, setBatchProjectId] = useState('');
  const [batchPayments, setBatchPayments] = useState<Array<{
    amount: string;
    payment_date: string;
    payment_method: string;
    status: string;
    remark: string;
  }>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [, setFileInputRef] = useState<HTMLInputElement | null>(null);
  const [importing, setImporting] = useState(false);
  
  // 编辑和删除
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState<ClientPayment | null>(null);
  const [deletingPayment, setDeletingPayment] = useState<ClientPayment | null>(null);
  const [editForm, setEditForm] = useState({
    amount: '',
    payment_date: '',
    payment_method: 'bank_transfer',
    status: 'completed',
    remark: '',
  });

  useEffect(() => {
    fetchProjects();
  }, []);

  useEffect(() => {
    fetchPayments();
  }, [selectedProject]);

  const fetchProjects = async () => {
    try {
      const res = await fetch('/api/projects');
      const data = await res.json();
      setProjects(data.projects || []);
    } catch (error) {
      console.error('获取项目列表失败:', error);
    }
  };

  const fetchPayments = async () => {
    setLoading(true);
    try {
      const url = selectedProject === 'all' 
        ? '/api/client-payments' 
        : `/api/client-payments?project_id=${selectedProject}`;
      const res = await fetch(url);
      const data = await res.json();
      
      setPayments(data.payments || []);
      setTotalAmount(data.total || '0');
      setTotalPaid(data.totalPaid || data.total || '0');
      setTotalPending(data.totalPending || '0');
      setChartData(data.chartData || []);
      setTrendData(data.trendData || []);
    } catch (error) {
      console.error('获取付款数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <StatusTag type="paid" />;
      case 'pending':
        return <StatusTag type="pending" />;
      case 'cancelled':
        return <StatusTag type="voided" />;
      default:
        return <StatusTag type="normal" label={status} />;
    }
  };

  const getPaymentMethodLabel = (method: string) => {
    switch (method) {
      case 'bank_transfer':
        return '银行转账';
      case 'cash':
        return '现金';
      case 'check':
        return '支票';
      case 'worker_salary':
        return '工人工资';
      default:
        return method;
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/client-payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newForm),
      });
      if (res.ok) {
        setAddDialogOpen(false);
        setNewForm({
          project_id: '',
          amount: '',
          payment_date: new Date().toISOString().split('T')[0],
          payment_method: 'bank_transfer',
          status: 'completed',
          remark: '',
        });
        fetchPayments();
      } else {
        const error = await res.json();
        toast({ title: error.error || '添加失败', variant: 'error' });
      }
    } catch (error) {
      toast({ title: '添加失败', variant: 'error' });
    }
  };

  // 编辑功能
  const handleEdit = (payment: ClientPayment) => {
    setEditingPayment(payment);
    setEditForm({
      amount: payment.amount || payment.payment_amount || '',
      payment_date: payment.payment_date?.split('T')[0] || '',
      payment_method: payment.payment_method || 'bank_transfer',
      status: payment.status || 'completed',
      remark: payment.remark || '',
    });
    setEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editingPayment) return;
    try {
      const res = await fetch('/api/client-payments', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingPayment.id,
          ...editForm,
        }),
      });
      if (res.ok) {
        setEditDialogOpen(false);
        setEditingPayment(null);
        fetchPayments();
      } else {
        const error = await res.json();
        toast({ title: error.error || '保存失败', variant: 'error' });
      }
    } catch (error) {
      toast({ title: '保存失败', variant: 'error' });
    }
  };

  // 删除功能
  const handleDelete = (payment: ClientPayment) => {
    setDeletingPayment(payment);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!deletingPayment) return;
    try {
      const res = await fetch(`/api/client-payments?id=${deletingPayment.id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setDeleteDialogOpen(false);
        setDeletingPayment(null);
        fetchPayments();
      } else {
        const error = await res.json();
        toast({ title: error.error || '删除失败', variant: 'error' });
      }
    } catch (error) {
      toast({ title: '删除失败', variant: 'error' });
    }
  };

  // 批量导入处理
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const res = await fetch('/api/client-payments/import', {
        method: 'POST',
        body: formData,
      });
      
      const data = await res.json();
      
      if (res.ok) {
        toast({ title: `成功导入 ${data.count || 0} 条付款记录` });
        setBatchDialogOpen(false);
        fetchPayments();
      } else {
        if (data.details) {
          toast({ title: `导入失败：\n${data.details.join('\n')}` });
        } else {
          toast({ title: data.error || '导入失败', variant: 'error' });
        }
      }
    } catch (error) {
      toast({ title: '导入失败，请检查文件格式', variant: 'error' });
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  };

  // 导出Excel
  const handleExport = async () => {
    try {
      const url = selectedProject === 'all' 
        ? '/api/client-payments/export' 
        : `/api/client-payments/export?project_id=${selectedProject}`;
      const res = await fetch(url);
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || '导出失败');
      }
      
      const blob = await res.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `甲方付款_${new Date().toISOString().split('T')[0]}.xlsx`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (error: any) {
      toast({ title: error.message || '导出失败', variant: 'error' });
    }
  };

  const downloadTemplate = () => {
    const content = '项目名称,付款金额,付款日期,付款方式,状态,备注\n南京中交智慧港,50000,2025-01-15,银行转账,已完成,首期付款\n南京中交智慧港,30000,2025-02-20,现金,已完成,二期付款';
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = '甲方付款导入模板.csv';
    link.click();
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 tracking-tight">甲方回款</h1>
          <p className="text-sm text-gray-500 mt-0.5">管理甲方付款记录，统计回款情况</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={downloadTemplate}>
            <FileSpreadsheet className="w-4 h-4 mr-2" />
            下载模板
          </Button>
          <Button variant="outline" onClick={handleExport}>
            <Download className="w-4 h-4 mr-2" />
            导出
          </Button>
          <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={importing}>
            <Upload className="w-4 h-4 mr-2" />
            {importing ? '导入中...' : '导入'}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFileUpload}
            className="hidden"
          />
          <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => setAddDialogOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                新增付款
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>新增付款记录</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleAdd} className="space-y-4">
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
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>付款金额（元）*</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={newForm.amount}
                    onChange={(e) => setNewForm({ ...newForm, amount: e.target.value })}
                    placeholder="付款金额"
                    required
                  />
                </div>
                <div>
                  <Label>付款日期 *</Label>
                  <Input
                    type="date"
                    value={newForm.payment_date}
                    onChange={(e) => setNewForm({ ...newForm, payment_date: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>付款方式</Label>
                  <Select
                    value={newForm.payment_method}
                    onValueChange={(value) => setNewForm({ ...newForm, payment_method: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bank_transfer">银行转账</SelectItem>
                      <SelectItem value="cash">现金</SelectItem>
                      <SelectItem value="check">支票</SelectItem>
                      <SelectItem value="worker_salary">工人工资</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>状态</Label>
                  <Select
                    value={newForm.status}
                    onValueChange={(value) => setNewForm({ ...newForm, status: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="completed">已完成</SelectItem>
                      <SelectItem value="pending">待确认</SelectItem>
                    </SelectContent>
                  </Select>
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
              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={() => setAddDialogOpen(false)}>
                  取消
                </Button>
                <Button type="submit">提交</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <CreditCard className="w-8 h-8 text-blue-600" />
              <div>
                <p className="text-sm text-gray-600">总付款次数</p>
                <p className="text-2xl font-bold">{payments.length} 次</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <TrendingUp className="w-8 h-8 text-green-600" />
              <div>
                <p className="text-sm text-green-600">已付款</p>
                <p className="text-2xl font-bold text-green-700">
                  ¥{parseFloat(totalPaid).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <TrendingDown className="w-8 h-8 text-orange-600" />
              <div>
                <p className="text-sm text-orange-600">待确认</p>
                <p className="text-2xl font-bold text-orange-700">
                  ¥{parseFloat(totalPending).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 项目选择 */}
      <Card>
        <CardHeader>
          <CardTitle>筛选项目</CardTitle>
        </CardHeader>
        <CardContent>
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

      {/* 图表 - 双列布局 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>付款金额统计（按项目）</CardTitle>
          </CardHeader>
          <CardContent>
            {chartData.length > 0 ? (
              <EChartsWrapper
                option={{
                  tooltip: { trigger: 'axis', formatter: (params: any) => `${params[0].axisValue}<br/>付款金额: ¥${Number(params[0].value).toLocaleString()}` },
                  grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
                  xAxis: { type: 'category', data: chartData.map(d => d.project), axisLabel: { rotate: 20 } },
                  yAxis: { type: 'value', axisLabel: { formatter: (v: number) => `¥${(v/10000).toFixed(0)}万` } },
                  series: [{ name: '付款金额', type: 'bar', data: chartData.map(d => d.amount), itemStyle: { color: '#00B42A', borderRadius: [4,4,0,0] }, barWidth: '40%' }],
                }}
                style={{ height: 300 }}
              />
            ) : (
              <div className="text-center py-8 text-gray-500">暂无数据</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>付款趋势（按月份）</CardTitle>
          </CardHeader>
          <CardContent>
            {trendData.length > 0 ? (
              <EChartsWrapper
                option={{
                  tooltip: { trigger: 'axis', formatter: (params: any) => `${params[0].axisValue}<br/>付款金额: ¥${Number(params[0].value).toLocaleString()}` },
                  grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
                  xAxis: { type: 'category', data: trendData.map(d => d.month) },
                  yAxis: { type: 'value', axisLabel: { formatter: (v: number) => `¥${(v/10000).toFixed(0)}万` } },
                  series: [{
                    name: '付款金额', type: 'line', data: trendData.map(d => d.amount), smooth: true,
                    areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(0,180,42,0.3)' }, { offset: 1, color: 'rgba(0,180,42,0.02)' }] } },
                    lineStyle: { color: '#00B42A', width: 2 },
                    itemStyle: { color: '#00B42A' },
                  }],
                }}
                style={{ height: 300 }}
              />
            ) : (
              <div className="text-center py-8 text-gray-500">暂无数据</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 付款明细表格 */}
      <Card>
        <CardHeader>
          <CardTitle>付款明细</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-gray-500">加载中...</div>
          ) : payments.length > 0 ? (
            <Table className="zebra-table">
              <TableHeader>
                <TableRow>
                  <TableHead>项目名称</TableHead>
                  <TableHead>付款日期</TableHead>
                  <TableHead className="text-right">付款金额</TableHead>
                  <TableHead>付款方式</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>备注</TableHead>
                  <TableHead className="text-center">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell className="font-medium">{payment.project_name}</TableCell>
                    <TableCell>{payment.payment_date?.split('T')[0]}</TableCell>
                    <TableCell className="text-right font-medium text-green-600">
                      ¥{payment.amount || payment.payment_amount}
                    </TableCell>
                    <TableCell>{getPaymentMethodLabel(payment.payment_method)}</TableCell>
                    <TableCell>{getStatusBadge(payment.status)}</TableCell>
                    <TableCell className="text-gray-500">{payment.remark || '-'}</TableCell>
                    <TableCell className="text-center">
                      <div className="flex justify-center gap-2">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => handleEdit(payment)}
                          className="h-8 px-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => handleDelete(payment)}
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
          ) : (
            <div className="text-center py-8 text-gray-500">
              暂无付款数据
            </div>
          )}
        </CardContent>
      </Card>

      {/* 批量导入对话框 */}
      <Dialog open={batchDialogOpen} onOpenChange={setBatchDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>批量导入付款记录</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
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
              <Label>上传文件（CSV格式）</Label>
              <Input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileUpload}
                className="cursor-pointer"
              />
              <p className="text-sm text-gray-500 mt-2">
                文件格式：付款金额,付款日期,付款方式,状态,备注
              </p>
              <p className="text-xs text-gray-400 mt-1">
                付款方式：bank_transfer(银行转账)、cash(现金)、check(支票)、worker_salary(工人工资)
              </p>
              <p className="text-xs text-gray-400">
                状态：completed(已完成)、pending(待确认)
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={downloadTemplate}>
                <Download className="w-4 h-4 mr-2" />
                下载模板
              </Button>
              <Button variant="outline" onClick={() => setBatchDialogOpen(false)}>
                取消
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 编辑对话框 */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑付款记录</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>付款金额</Label>
              <Input
                type="number"
                step="0.01"
                value={editForm.amount}
                onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
                placeholder="付款金额"
              />
            </div>
            <div>
              <Label>付款日期</Label>
              <Input
                type="date"
                value={editForm.payment_date}
                onChange={(e) => setEditForm({ ...editForm, payment_date: e.target.value })}
              />
            </div>
            <div>
              <Label>付款方式</Label>
              <Select
                value={editForm.payment_method}
                onValueChange={(value) => setEditForm({ ...editForm, payment_method: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank_transfer">银行转账</SelectItem>
                  <SelectItem value="cash">现金</SelectItem>
                  <SelectItem value="check">支票</SelectItem>
                  <SelectItem value="worker_salary">工人工资</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>状态</Label>
              <Select
                value={editForm.status}
                onValueChange={(value) => setEditForm({ ...editForm, status: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="completed">已完成</SelectItem>
                  <SelectItem value="pending">待确认</SelectItem>
                </SelectContent>
              </Select>
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
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>取消</Button>
            <Button onClick={handleSaveEdit}>保存</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 删除确认对话框 */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
          </DialogHeader>
          <p className="py-4">确定要删除该付款记录吗？此操作不可恢复。</p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>取消</Button>
            <Button variant="destructive" onClick={handleConfirmDelete}>删除</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
