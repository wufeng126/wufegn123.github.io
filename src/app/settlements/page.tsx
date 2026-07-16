'use client';
import { useToast } from '@/hooks/use-toast';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Receipt, Plus, Pencil, Trash2, Search, RefreshCw, DollarSign, Calendar, Building2, Upload, Download, FileSpreadsheet } from 'lucide-react';

interface Settlement {
  id: number;
  supplier_id: number;
  supplier_name: string;
  supplier_type: string;
  project_id: number | null;
  project_name: string;
  settlement_type: string | null;
  settlement_content: string | null;
  settlement_quantity: number | null;
  settlement_unit: string | null;
  settlement_amount: number;
  settlement_month: string;
  settlement_date: string | null;
  remark: string | null;
  created_at: string;
}

interface Supplier {
  id: number;
  name: string;
  type: string;
}

interface Project {
  id: number;
  name: string;
}

const SETTLEMENT_TYPES = [
  '劳务费',
  '机械租赁费',
  '材料费',
  '专业分包款',
  '其他',
];

export default function SettlementsPage() {
  const { toast } = useToast();
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [filterSupplier, setFilterSupplier] = useState<string>('all');
  const [filterMonth, setFilterMonth] = useState<string>('');
  
  // 对话框
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [currentSettlement, setCurrentSettlement] = useState<Settlement | null>(null);
  const [form, setForm] = useState({
    supplier_id: '',
    project_id: '',
    settlement_type: '',
    settlement_content: '',
    settlement_quantity: '',
    settlement_unit: '',
    settlement_amount: '',
    settlement_month: new Date().toISOString().slice(0, 7),
    settlement_date: new Date().toISOString().split('T')[0],
    remark: '',
  });
  
  // 批量删除
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  
  // 导入导出
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    fetchSuppliers();
    fetchProjects();
    fetchSettlements();
  }, []);

  useEffect(() => {
    fetchSettlements();
  }, [filterSupplier, filterMonth]);

  const fetchSuppliers = async () => {
    try {
      const res = await fetch('/api/suppliers');
      const data = await res.json();
      setSuppliers(data.suppliers || []);
    } catch (error) {
      console.error('获取供应商失败:', error);
    }
  };

  const fetchProjects = async () => {
    try {
      const res = await fetch('/api/projects');
      const data = await res.json();
      setProjects(data.projects || []);
    } catch (error) {
      console.error('获取项目失败:', error);
    }
  };

  const fetchSettlements = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterSupplier !== 'all') params.append('supplier_id', filterSupplier);
      if (filterMonth) params.append('month', filterMonth);
      
      const res = await fetch(`/api/settlements?${params.toString()}`);
      const data = await res.json();
      setSettlements(data.settlements || []);
    } catch (error) {
      console.error('获取数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/settlements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          project_id: form.project_id || null,
          settlement_quantity: form.settlement_quantity || null,
          settlement_unit: form.settlement_unit || null,
          settlement_date: form.settlement_date || null,
        }),
      });
      
      if (res.ok) {
        setAddDialogOpen(false);
        resetForm();
        fetchSettlements();
      } else {
        const error = await res.json();
        toast({ title: error.error || '添加失败', variant: 'error' });
      }
    } catch (error) {
      toast({ title: '添加失败', variant: 'error' });
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentSettlement) return;
    
    try {
      const res = await fetch('/api/settlements', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: currentSettlement.id,
          ...form,
          project_id: form.project_id || null,
          settlement_quantity: form.settlement_quantity || null,
          settlement_unit: form.settlement_unit || null,
          settlement_date: form.settlement_date || null,
        }),
      });
      
      if (res.ok) {
        setEditDialogOpen(false);
        resetForm();
        setCurrentSettlement(null);
        fetchSettlements();
      } else {
        const error = await res.json();
        toast({ title: error.error || '修改失败', variant: 'error' });
      }
    } catch (error) {
      toast({ title: '修改失败', variant: 'error' });
    }
  };

  const openEditDialog = (settlement: Settlement) => {
    setCurrentSettlement(settlement);
    setForm({
      supplier_id: settlement.supplier_id.toString(),
      project_id: settlement.project_id?.toString() || '',
      settlement_type: settlement.settlement_type || '',
      settlement_content: settlement.settlement_content || '',
      settlement_quantity: settlement.settlement_quantity?.toString() || '',
      settlement_unit: settlement.settlement_unit || '',
      settlement_amount: settlement.settlement_amount.toString(),
      settlement_month: settlement.settlement_month,
      settlement_date: settlement.settlement_date || '',
      remark: settlement.remark || '',
    });
    setEditDialogOpen(true);
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;

    try {
      const res = await fetch(`/api/settlements?ids=${Array.from(selectedIds).join(',')}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setSelectedIds(new Set());
        setDeleteDialogOpen(false);
        fetchSettlements();
      } else {
        const error = await res.json();
        toast({ title: error.error || '删除失败', variant: 'error' });
      }
    } catch (error) {
      console.error('删除失败:', error);
      toast({ title: '删除失败', variant: 'error' });
    }
  };

  const handleSelect = (id: number, checked: boolean) => {
    const newSelected = new Set(selectedIds);
    if (checked) {
      newSelected.add(id);
    } else {
      newSelected.delete(id);
    }
    setSelectedIds(newSelected);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const allIds = new Set(filteredSettlements.map(s => s.id));
      setSelectedIds(allIds);
    } else {
      setSelectedIds(new Set());
    }
  };

  const resetForm = () => {
    setForm({
      supplier_id: '',
      project_id: '',
      settlement_type: '',
      settlement_content: '',
      settlement_quantity: '',
      settlement_unit: '',
      settlement_amount: '',
      settlement_month: new Date().toISOString().slice(0, 7),
      settlement_date: new Date().toISOString().split('T')[0],
      remark: '',
    });
  };

  // 筛选
  const filteredSettlements = settlements.filter(s => {
    if (!searchKeyword) return true;
    return s.supplier_name.toLowerCase().includes(searchKeyword.toLowerCase()) ||
           (s.settlement_content && s.settlement_content.toLowerCase().includes(searchKeyword.toLowerCase()));
  });

  // 统计
  const stats = {
    totalRecords: settlements.length,
    totalAmount: settlements.reduce((sum, s) => sum + s.settlement_amount, 0),
    currentMonth: settlements
      .filter(s => s.settlement_month === new Date().toISOString().slice(0, 7))
      .reduce((sum, s) => sum + s.settlement_amount, 0),
    supplierCount: new Set(settlements.map(s => s.supplier_id)).size,
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('zh-CN', {
      style: 'currency',
      currency: 'CNY',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const allSelected = filteredSettlements.length > 0 && filteredSettlements.every(s => selectedIds.has(s.id));

  // 按供应商汇总
  const supplierSummary = settlements.reduce((acc, s) => {
    if (!acc[s.supplier_name]) {
      acc[s.supplier_name] = { amount: 0, count: 0 };
    }
    acc[s.supplier_name].amount += s.settlement_amount;
    acc[s.supplier_name].count += 1;
    return acc;
  }, {} as Record<string, { amount: number; count: number }>);

  // 导出Excel
  const handleExport = async () => {
    try {
      const params = new URLSearchParams();
      if (filterSupplier !== 'all') params.append('supplier_id', filterSupplier);
      if (filterMonth) params.append('month', filterMonth);
      
      const url = `/api/settlements/export${params.toString() ? '?' + params.toString() : ''}`;
      const res = await fetch(url);
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || '导出失败');
      }
      
      const blob = await res.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `供应商结算_${new Date().toISOString().split('T')[0]}.xlsx`;
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
      
      const res = await fetch('/api/settlements/import', {
        method: 'POST',
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
      fetchSettlements();
    } catch (error: any) {
      toast({ title: error.message || '导入失败', variant: 'error' });
    } finally {
      setImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // 下载导入模板
  const downloadTemplate = () => {
    const content = '供应商名称,供应商类型,项目名称,结算类型,结算内容,结算数量,单位,结算金额,结算月份,结算日期,备注\n某某劳务公司,劳务分包,南京中交智慧港,劳务费,主体结构施工,,元,500000,2025-01,2025-01-25,1月份结算\n某某机械租赁,机械租赁,南京中交智慧港,机械租赁费,塔吊租赁,30,台班,15000,2025-01,2025-01-25,';
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = '供应商结算导入模板.csv';
    link.click();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-gray-900">结算管理</h1>
          <p className="text-gray-500 mt-1">管理供应商和班组的结算记录</p>
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
            onChange={handleImport}
            className="hidden"
          />
          <Button variant="outline" onClick={fetchSettlements}>
            <RefreshCw className="w-4 h-4 mr-2" />
            刷新
          </Button>
          {selectedIds.size > 0 && (
            <Button variant="destructive" onClick={() => setDeleteDialogOpen(true)}>
              <Trash2 className="w-4 h-4 mr-2" />
              删除 ({selectedIds.size})
            </Button>
          )}
          <Button onClick={() => { resetForm(); setAddDialogOpen(true); }}>
            <Plus className="w-4 h-4 mr-2" />
            新增结算
          </Button>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-blue-600">结算记录数</p>
                <p className="text-3xl font-bold text-blue-700 mt-1">{stats.totalRecords}</p>
              </div>
              <Receipt className="w-10 h-10 text-blue-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-green-600">累计结算金额</p>
                <p className="text-2xl font-bold text-green-700 mt-1">{formatCurrency(stats.totalAmount)}</p>
              </div>
              <DollarSign className="w-10 h-10 text-green-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-purple-200 bg-purple-50">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-purple-600">本月结算金额</p>
                <p className="text-2xl font-bold text-purple-700 mt-1">{formatCurrency(stats.currentMonth)}</p>
              </div>
              <Calendar className="w-10 h-10 text-purple-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-orange-600">结算供应商数</p>
                <p className="text-3xl font-bold text-orange-700 mt-1">{stats.supplierCount}</p>
              </div>
              <Building2 className="w-10 h-10 text-orange-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 各供应商累计结算展示卡片 */}
      {Object.keys(supplierSummary).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>供应商结算汇总</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Object.entries(supplierSummary).slice(0, 6).map(([name, data]) => (
                <Card key={name} className="border">
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium truncate">{name}</span>
                      <Badge variant="outline">{data.count}条记录</Badge>
                    </div>
                    <div className="text-lg font-bold text-green-600">
                      {formatCurrency(data.amount)}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 筛选 */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:flex lg:items-center">
            <Select value={filterSupplier} onValueChange={setFilterSupplier}>
              <SelectTrigger className="w-full lg:w-48">
                <SelectValue placeholder="选择供应商" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部供应商</SelectItem>
                {suppliers.map((s) => (
                  <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="month"
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
              className="w-full lg:w-40"
            />
            <div className="relative sm:col-span-2 lg:col-span-1 lg:max-w-xs lg:flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <Input
                placeholder="搜索供应商/内容"
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                className="w-full pl-9"
              />
            </div>
            <p className="text-sm text-gray-500 sm:col-span-2 lg:col-span-1">显示 {filteredSettlements.length} 条记录</p>
          </div>
        </CardContent>
      </Card>

      {/* 表格 */}
      <Card>
        <CardHeader>
          <CardTitle>结算记录</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-gray-500">加载中...</div>
          ) : filteredSettlements.length > 0 ? (
            <>
            <div className="hidden overflow-x-auto md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox checked={allSelected} onCheckedChange={handleSelectAll} />
                  </TableHead>
                  <TableHead>供应商名称</TableHead>
                  <TableHead>供应类型</TableHead>
                  <TableHead>结算内容</TableHead>
                  <TableHead>工程量</TableHead>
                  <TableHead className="text-right">结算金额</TableHead>
                  <TableHead>结算月份</TableHead>
                  <TableHead>项目</TableHead>
                  <TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSettlements.map((settlement) => (
                  <TableRow key={settlement.id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(settlement.id)}
                        onCheckedChange={(checked) => handleSelect(settlement.id, checked as boolean)}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{settlement.supplier_name}</TableCell>
                    <TableCell>{settlement.settlement_type || '-'}</TableCell>
                    <TableCell>{settlement.settlement_content || '-'}</TableCell>
                    <TableCell>
                      {settlement.settlement_quantity 
                        ? `${settlement.settlement_quantity}${settlement.settlement_unit || ''}` 
                        : '-'}
                    </TableCell>
                    <TableCell className="text-right text-green-600 font-medium">
                      {formatCurrency(settlement.settlement_amount)}
                    </TableCell>
                    <TableCell>{settlement.settlement_month}</TableCell>
                    <TableCell>{settlement.project_name || '-'}</TableCell>
                    <TableCell>
                      <Button size="sm" variant="ghost" onClick={() => openEditDialog(settlement)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
            <div className="space-y-3 md:hidden">
              {filteredSettlements.map((settlement) => (
                <div key={settlement.id} className="rounded-lg border bg-white p-4 shadow-sm">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={selectedIds.has(settlement.id)}
                      onCheckedChange={(checked) => handleSelect(settlement.id, checked as boolean)}
                      className="mt-1"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{settlement.supplier_name}</div>
                      <div className="mt-1 text-xs text-gray-500">{settlement.project_name || '-'}</div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => openEditDialog(settlement)}>
                      <Pencil className="mr-1 h-4 w-4" />
                      编辑
                    </Button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge variant="outline">{settlement.settlement_type || '未分类'}</Badge>
                    <Badge variant="secondary">{settlement.settlement_month}</Badge>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <div className="text-xs text-gray-500">结算金额</div>
                      <div className="mt-1 font-semibold text-green-600">{formatCurrency(settlement.settlement_amount)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">工程量</div>
                      <div className="mt-1">
                        {settlement.settlement_quantity
                          ? `${settlement.settlement_quantity}${settlement.settlement_unit || ''}`
                          : '-'}
                      </div>
                    </div>
                    <div className="col-span-2">
                      <div className="text-xs text-gray-500">结算内容</div>
                      <div className="mt-1 line-clamp-2">{settlement.settlement_content || '-'}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            </>
          ) : (
            <div className="text-center py-12 text-gray-500">
              <p>暂无结算数据</p>
              <p className="text-sm mt-2">点击"新增结算"添加</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 新增对话框 */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>新增结算记录</DialogTitle>
            <DialogDescription>添加供应商/班组结算记录</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAdd} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label>供应商 *</Label>
                <Select value={form.supplier_id} onValueChange={(v) => setForm({ ...form, supplier_id: v })}>
                  <SelectTrigger><SelectValue placeholder="选择供应商" /></SelectTrigger>
                  <SelectContent>
                    {suppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>项目</Label>
                <Select value={form.project_id} onValueChange={(v) => setForm({ ...form, project_id: v })}>
                  <SelectTrigger><SelectValue placeholder="选择项目" /></SelectTrigger>
                  <SelectContent>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label>供应类型</Label>
                <Select value={form.settlement_type} onValueChange={(v) => setForm({ ...form, settlement_type: v })}>
                  <SelectTrigger><SelectValue placeholder="选择类型" /></SelectTrigger>
                  <SelectContent>
                    {SETTLEMENT_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>结算金额 *</Label>
                <Input type="number" step="0.01" value={form.settlement_amount} 
                  onChange={(e) => setForm({ ...form, settlement_amount: e.target.value })} required />
              </div>
            </div>
            <div>
              <Label>结算内容</Label>
              <Input value={form.settlement_content} onChange={(e) => setForm({ ...form, settlement_content: e.target.value })} />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label>工程量</Label>
                <Input type="number" step="0.01" value={form.settlement_quantity} 
                  onChange={(e) => setForm({ ...form, settlement_quantity: e.target.value })} />
              </div>
              <div>
                <Label>单位</Label>
                <Input value={form.settlement_unit} onChange={(e) => setForm({ ...form, settlement_unit: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label>结算月份 *</Label>
                <Input type="month" value={form.settlement_month} 
                  onChange={(e) => setForm({ ...form, settlement_month: e.target.value })} required />
              </div>
              <div>
                <Label>结算日期</Label>
                <Input type="date" value={form.settlement_date} 
                  onChange={(e) => setForm({ ...form, settlement_date: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>备注</Label>
              <Textarea value={form.remark} onChange={(e) => setForm({ ...form, remark: e.target.value })} />
            </div>
            <div className="flex flex-col-reverse gap-2 pt-4 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setAddDialogOpen(false)}>取消</Button>
              <Button type="submit">添加</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* 编辑对话框 */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>编辑结算记录</DialogTitle>
            <DialogDescription>修改结算信息</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEdit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label>供应商 *</Label>
                <Select value={form.supplier_id} onValueChange={(v) => setForm({ ...form, supplier_id: v })}>
                  <SelectTrigger><SelectValue placeholder="选择供应商" /></SelectTrigger>
                  <SelectContent>
                    {suppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>项目</Label>
                <Select value={form.project_id} onValueChange={(v) => setForm({ ...form, project_id: v })}>
                  <SelectTrigger><SelectValue placeholder="选择项目" /></SelectTrigger>
                  <SelectContent>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label>供应类型</Label>
                <Select value={form.settlement_type} onValueChange={(v) => setForm({ ...form, settlement_type: v })}>
                  <SelectTrigger><SelectValue placeholder="选择类型" /></SelectTrigger>
                  <SelectContent>
                    {SETTLEMENT_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>结算金额 *</Label>
                <Input type="number" step="0.01" value={form.settlement_amount} 
                  onChange={(e) => setForm({ ...form, settlement_amount: e.target.value })} required />
              </div>
            </div>
            <div>
              <Label>结算内容</Label>
              <Input value={form.settlement_content} onChange={(e) => setForm({ ...form, settlement_content: e.target.value })} />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label>工程量</Label>
                <Input type="number" step="0.01" value={form.settlement_quantity} 
                  onChange={(e) => setForm({ ...form, settlement_quantity: e.target.value })} />
              </div>
              <div>
                <Label>单位</Label>
                <Input value={form.settlement_unit} onChange={(e) => setForm({ ...form, settlement_unit: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label>结算月份 *</Label>
                <Input type="month" value={form.settlement_month} 
                  onChange={(e) => setForm({ ...form, settlement_month: e.target.value })} required />
              </div>
              <div>
                <Label>结算日期</Label>
                <Input type="date" value={form.settlement_date} 
                  onChange={(e) => setForm({ ...form, settlement_date: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>备注</Label>
              <Textarea value={form.remark} onChange={(e) => setForm({ ...form, remark: e.target.value })} />
            </div>
            <div className="flex flex-col-reverse gap-2 pt-4 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)}>取消</Button>
              <Button type="submit">保存</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* 删除确认 */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="w-[calc(100vw-1.5rem)] max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除选中的 {selectedIds.size} 条结算记录吗？此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={handleBatchDelete}>
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
