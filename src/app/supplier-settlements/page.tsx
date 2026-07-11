'use client';
import { useToast } from '@/hooks/use-toast';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import {
  Plus, Trash2, Download, Search, Calendar, DollarSign,
  FileText, Filter, Building2, RefreshCw, Calculator, X
} from 'lucide-react';
import { StatusTag, AmountDisplay } from '@/components/business/common';

interface SettlementRecord {
  id: number;
  supplier_id: number;
  supplier_name: string;
  project_name: string;
  settlement_date: string;
  settlement_type: string;
  amount: string;
  invoice_amount: string | null;
  tax_amount: string | null;
  remark: string | null;
}

interface Supplier {
  id: number;
  name: string;
}

interface Project {
  id: number;
  name: string;
}

export default function SupplierSettlementsPage() {
  const { toast } = useToast();
  const [settlements, setSettlements] = useState<SettlementRecord[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showContent, setShowContent] = useState(false);

  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [filterSupplier, setFilterSupplier] = useState<string>('all');
  const [searchKeyword, setSearchKeyword] = useState('');

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    supplier_id: '',
    project_id: '',
    settlement_date: new Date().toISOString().split('T')[0],
    settlement_type: '月度结算',
    amount: '',
    remark: '',
  });

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const fetchSettlements = useCallback(async () => {
    setLoading(true);
    setShowContent(false);
    try {
      const params = new URLSearchParams();
      if (filterStartDate) params.append('start_date', filterStartDate);
      if (filterEndDate) params.append('end_date', filterEndDate);
      if (filterSupplier !== 'all') params.append('supplier_id', filterSupplier);
      const res = await fetch(`/api/supplier-settlements?${params.toString()}`);
      const data = await res.json();
      setSettlements(data.settlements || []);
    } catch (error) {
      console.error('获取结算数据失败:', error);
    } finally {
      setLoading(false);
    }
  }, [filterStartDate, filterEndDate, filterSupplier]);

  useEffect(() => {
    fetchSettlements();
  }, [fetchSettlements]);

  useEffect(() => {
    const fetchBaseData = async () => {
      try {
        const [suppliersRes, projectsRes] = await Promise.all([fetch('/api/suppliers'), fetch('/api/projects')]);
        const suppliersData = await suppliersRes.json();
        const projectsData = await projectsRes.json();
        setSuppliers(suppliersData.suppliers || []);
        setProjects(projectsData.projects || []);
      } catch (error) {
        console.error('获取基础数据失败:', error);
      }
    };
    fetchBaseData();
  }, []);

  useEffect(() => {
    if (!loading) {
      const timer = setTimeout(() => setShowContent(true), 50);
      return () => clearTimeout(timer);
    }
  }, [loading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/supplier-settlements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          supplier_id: parseInt(formData.supplier_id),
          project_id: parseInt(formData.project_id),
          amount: parseFloat(formData.amount) || 0,
        }),
      });
      if (res.ok) {
        setAddDialogOpen(false);
        resetForm();
        fetchSettlements();
      } else {
        const error = await res.json();
        toast({ title: error.error || '操作失败', variant: 'error' });
      }
    } catch (error) {
      toast({ title: '保存失败', variant: 'error' });
    }
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    try {
      const res = await fetch('/api/supplier-settlements/batch-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      if (res.ok) {
        setSelectedIds(new Set());
        setDeleteDialogOpen(false);
        fetchSettlements();
      }
    } catch (error) {
      toast({ title: '删除失败', variant: 'error' });
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) setSelectedIds(new Set(filteredSettlements.map(s => s.id)));
    else setSelectedIds(new Set());
  };

  const handleSelectOne = (id: number, checked: boolean) => {
    const newSet = new Set(selectedIds);
    if (checked) newSet.add(id);
    else newSet.delete(id);
    setSelectedIds(newSet);
  };

  const resetForm = () => {
    setFormData({
      supplier_id: '',
      project_id: '',
      settlement_date: new Date().toISOString().split('T')[0],
      settlement_type: '月度结算',
      amount: '',
      remark: '',
    });
  };

  const handleExport = () => {
    const headers = ['供应商/班组', '项目', '结算日期', '结算类型', '金额', '备注'];
    const rows = filteredSettlements.map(s => [s.supplier_name, s.project_name, s.settlement_date, s.settlement_type, s.amount, s.remark || '']);
    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `结算记录_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const filteredSettlements = settlements.filter(s => {
    if (searchKeyword && !s.supplier_name.toLowerCase().includes(searchKeyword.toLowerCase())) return false;
    return true;
  });

  const stats = {
    totalAmount: settlements.reduce((sum, s) => sum + parseFloat(s.amount), 0),
    count: settlements.length,
    suppliers: new Set(settlements.map(s => s.supplier_id)).size,
  };

  const formatCurrency = (amount: number) => `¥${amount.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}`;

  const allSelected = filteredSettlements.length > 0 && filteredSettlements.every(s => selectedIds.has(s.id));

  return (
    <div className="space-y-5">
      {/* 页面标题 */}
      <div className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 transition-all duration-500 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
        <div>
          <h1 className="text-xl font-semibold tracking-tight" style={{ color: '#1D2129' }}>结算记录</h1>
          <p className="text-sm mt-1" style={{ color: '#86909C' }}>管理供应商/班组的工程结算记录</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchSettlements} className="btn-secondary h-9"><RefreshCw className="w-4 h-4 mr-1.5" />刷新</Button>
          <Button variant="outline" onClick={handleExport} className="btn-secondary h-9"><Download className="w-4 h-4 mr-1.5" />导出</Button>
          {selectedIds.size > 0 && <Button variant="destructive" onClick={() => setDeleteDialogOpen(true)} className="h-9"><Trash2 className="w-4 h-4 mr-1.5" />删除 ({selectedIds.size})</Button>}
          <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
            <DialogTrigger asChild><Button onClick={resetForm} className="btn-primary h-9"><Plus className="w-4 h-4 mr-1.5" />新增结算</Button></DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle className="dialog-header">新增结算记录</DialogTitle></DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div><Label className="text-sm" style={{ color: '#1D2129' }}>供应商/班组 *</Label>
                    <Select value={formData.supplier_id} onValueChange={(v) => setFormData({ ...formData, supplier_id: v })}>
                      <SelectTrigger className="mt-1.5"><SelectValue placeholder="选择供应商" /></SelectTrigger>
                      <SelectContent>{suppliers.map(s => (<SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>))}</SelectContent>
                    </Select>
                  </div>
                  <div><Label className="text-sm" style={{ color: '#1D2129' }}>项目 *</Label>
                    <Select value={formData.project_id} onValueChange={(v) => setFormData({ ...formData, project_id: v })}>
                      <SelectTrigger className="mt-1.5"><SelectValue placeholder="选择项目" /></SelectTrigger>
                      <SelectContent>{projects.map(p => (<SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>))}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label className="text-sm" style={{ color: '#1D2129' }}>结算日期 *</Label><Input type="date" value={formData.settlement_date} onChange={(e) => setFormData({ ...formData, settlement_date: e.target.value })} className="mt-1.5" required /></div>
                  <div><Label className="text-sm" style={{ color: '#1D2129' }}>结算类型</Label>
                    <Select value={formData.settlement_type} onValueChange={(v) => setFormData({ ...formData, settlement_type: v })}>
                      <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="月度结算">月度结算</SelectItem>
                        <SelectItem value="进度结算">进度结算</SelectItem>
                        <SelectItem value="竣工结算">竣工结算</SelectItem>
                        <SelectItem value="其他">其他</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div><Label className="text-sm" style={{ color: '#1D2129' }}>金额 *</Label><Input type="number" step="0.01" value={formData.amount} onChange={(e) => setFormData({ ...formData, amount: e.target.value })} className="mt-1.5" required /></div>
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
      <div className={`grid grid-cols-1 md:grid-cols-3 gap-4 transition-all duration-500 delay-100 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
        <Card className="stat-card stat-card-blue">
          <CardContent className="pt-5 pb-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm" style={{ color: '#86909C' }}>结算总额</p>
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
                <p className="text-sm" style={{ color: '#86909C' }}>结算笔数</p>
                <p className="text-3xl font-bold mt-2 stat-number-green">{stats.count}<span className="text-sm font-normal ml-1" style={{ color: '#C9CDD4' }}>笔</span></p>
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
                <p className="text-sm" style={{ color: '#86909C' }}>涉及供应商</p>
                <p className="text-3xl font-bold mt-2 stat-number-purple">{stats.suppliers}<span className="text-sm font-normal ml-1" style={{ color: '#C9CDD4' }}>家</span></p>
              </div>
              <div className="stat-icon-container stat-icon-purple">
                <Building2 className="w-5 h-5 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 筛选栏 */}
      <div className={`transition-all duration-500 delay-150 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
        <div className="filter-bar">
          <Filter className="w-4 h-4" style={{ color: '#86909C' }} />
          <Input type="date" value={filterStartDate} onChange={(e) => setFilterStartDate(e.target.value)} className="w-32 h-8" />
          <span style={{ color: '#C9CDD4' }}>-</span>
          <Input type="date" value={filterEndDate} onChange={(e) => setFilterEndDate(e.target.value)} className="w-32 h-8" />
          <Select value={filterSupplier} onValueChange={setFilterSupplier}>
            <SelectTrigger className="w-28 h-8"><SelectValue placeholder="供应商" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部供应商</SelectItem>
              {suppliers.map(s => (<SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>))}
            </SelectContent>
          </Select>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#C9CDD4' }} />
            <Input placeholder="搜索供应商" value={searchKeyword} onChange={(e) => setSearchKeyword(e.target.value)} className="w-36 pl-9 h-8" />
          </div>
          {(filterStartDate || filterEndDate || filterSupplier !== 'all' || searchKeyword) && (
            <Button variant="ghost" size="sm" onClick={() => { setFilterStartDate(''); setFilterEndDate(''); setFilterSupplier('all'); setSearchKeyword(''); }} className="h-8" style={{ color: '#86909C' }}>
              <X className="w-4 h-4 mr-1" />清除筛选
            </Button>
          )}
          <p className="text-sm ml-auto" style={{ color: '#86909C' }}>显示 {filteredSettlements.length} 条记录</p>
        </div>
      </div>

      {/* 结算列表 */}
      <div className={`transition-all duration-500 delay-200 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
        <Card className="overflow-hidden border" style={{ borderColor: '#E5E6EB' }}>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <div className="loading-spinner" />
              </div>
            ) : filteredSettlements.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow style={{ background: '#F7F8FA', borderBottom: '1px solid #E5E6EB' }}>
                      <TableHead className="w-12"><Checkbox checked={allSelected} onCheckedChange={handleSelectAll} /></TableHead>
                      <TableHead style={{ color: '#1D2129' }}>供应商/班组</TableHead>
                      <TableHead style={{ color: '#1D2129' }}>项目</TableHead>
                      <TableHead style={{ color: '#1D2129' }}>结算日期</TableHead>
                      <TableHead style={{ color: '#1D2129' }}>结算类型</TableHead>
                      <TableHead className="text-right" style={{ color: '#1D2129' }}>结算金额</TableHead>
                      <TableHead className="text-right" style={{ color: '#1D2129' }}>开票金额</TableHead>
                      <TableHead className="text-right" style={{ color: '#1D2129' }}>税额</TableHead>
                      <TableHead style={{ color: '#1D2129' }}>备注</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSettlements.map((settlement, index) => {
                      const isSelected = selectedIds.has(settlement.id);
                      return (
                        <TableRow key={settlement.id} style={{ background: isSelected ? '#E8F3FF' : index % 2 === 1 ? '#FAFBFD' : 'transparent', borderBottom: '1px solid #E5E6EB' }}>
                          <TableCell><Checkbox checked={isSelected} onCheckedChange={(checked) => handleSelectOne(settlement.id, checked as boolean)} /></TableCell>
                          <TableCell className="font-medium" style={{ color: '#1D2129' }}>{settlement.supplier_name}</TableCell>
                          <TableCell style={{ color: '#4E5969' }}>{settlement.project_name}</TableCell>
                          <TableCell style={{ color: '#4E5969' }}>{settlement.settlement_date}</TableCell>
                          <TableCell><StatusTag type={settlement.settlement_type === '月度结算' ? 'info' : settlement.settlement_type === '竣工结算' ? 'completed' : settlement.settlement_type === '进度结算' ? 'pending' : 'normal'} label={settlement.settlement_type} /></TableCell>
                          <TableCell className="text-right"><AmountDisplay value={parseFloat(settlement.amount)} /></TableCell>
                          <TableCell className="text-right" style={{ color: '#4E5969' }}>{settlement.invoice_amount ? <AmountDisplay value={parseFloat(settlement.invoice_amount)} /> : '-'}</TableCell>
                          <TableCell className="text-right" style={{ color: '#4E5969' }}>{settlement.tax_amount ? <AmountDisplay value={parseFloat(settlement.tax_amount)} /> : '-'}</TableCell>
                          <TableCell style={{ color: '#4E5969' }}>{settlement.remark || '-'}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-state-icon">
                  <FileText className="w-8 h-8" style={{ color: '#C9CDD4' }} />
                </div>
                <p className="empty-state-title">暂无结算记录</p>
                <p className="empty-state-description">点击"新增结算"按钮添加</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 删除确认对话框 */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle style={{ color: '#1D2129' }}>确认删除</AlertDialogTitle>
            <AlertDialogDescription>确定要删除选中的 {selectedIds.size} 条结算记录吗？此操作不可恢复。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleBatchDelete} className="bg-red-600 hover:bg-red-700">删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
