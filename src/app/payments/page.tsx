'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Download, Plus, Trash2, Search, DollarSign, Building2, CheckCircle } from 'lucide-react';

interface Supplier {
  id: number;
  name: string;
  type?: string;
}

interface Contract {
  id: number;
  contract_name: string;
  contract_no: string;
  supplier_id: number;
}

interface Payment {
  id: number;
  supplier_id: number;
  supplier_name: string;
  contract_id: number;
  contract_name: string;
  payment_amount: number;
  payment_date: string;
  payment_type: string;
  payment_method: string;
  remark?: string;
  contract?: {
    contract_name?: string;
  };
}

const PAYMENT_TYPES = [
  { value: 'progress', label: '进度款' },
  { value: 'final', label: '尾款' },
  { value: 'warranty', label: '质保金返还' },
];

const PAYMENT_METHODS = [
  { value: '银行转账', label: '银行转账' },
  { value: '现金', label: '现金' },
  { value: '支票', label: '支票' },
  { value: '商业汇票', label: '商业汇票' },
];

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444'];

export default function PaymentsPage() {
  const [loading, setLoading] = useState(true);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [filteredContracts, setFilteredContracts] = useState<Contract[]>([]);

  // 筛选状态
  const [filterSupplier, setFilterSupplier] = useState<string>('all');
  const [filterContract, setFilterContract] = useState<string>('all');
  const [searchKeyword, setSearchKeyword] = useState('');

  // 新增对话框
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    supplier_id: '',
    contract_id: '',
    amount: '',
    payment_date: new Date().toISOString().split('T')[0],
    payment_type: 'progress',
    payment_method: '银行转账',
    remark: '',
  });

  // 统计
  const [stats, setStats] = useState({
    total: 0,
    progress: 0,
    final: 0,
    warranty: 0,
    count: 0,
  });

  // 获取数据
  const fetchPayments = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterContract !== 'all') params.set('contract_id', filterContract);

      const res = await fetch(`/api/supplier-contracts/payments?${params}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setPayments(data.payments || []);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [filterSupplier, filterContract]);

  const fetchSuppliers = async () => {
    try {
      const res = await fetch('/api/suppliers', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setSuppliers(data.suppliers || []);
      }
    } catch (e) { console.error(e); }
  };

  const fetchContracts = async () => {
    try {
      const res = await fetch('/api/supplier-contracts', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setContracts(data.contracts || []);
      }
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    fetchSuppliers();
    fetchContracts();
  }, []);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  // 供应商变更时过滤合同
  useEffect(() => {
    if (formData.supplier_id) {
      const filtered = contracts.filter(c => c.supplier_id === Number(formData.supplier_id));
      setFilteredContracts(filtered);
      if (!filtered.find(c => c.id === Number(formData.contract_id))) {
        setFormData(prev => ({ ...prev, contract_id: '' }));
      }
    } else {
      setFilteredContracts([]);
      setFormData(prev => ({ ...prev, contract_id: '' }));
    }
  }, [formData.supplier_id, contracts]);

  // 计算统计
  useEffect(() => {
    const s = {
      total: payments.reduce((sum, p) => sum + Number(p.payment_amount || 0), 0),
      progress: payments.filter(p => p.payment_type === 'progress').reduce((sum, p) => sum + Number(p.payment_amount || 0), 0),
      final: payments.filter(p => p.payment_type === 'final').reduce((sum, p) => sum + Number(p.payment_amount || 0), 0),
      warranty: payments.filter(p => p.payment_type === 'warranty').reduce((sum, p) => sum + Number(p.payment_amount || 0), 0),
      count: payments.length,
    };
    setStats(s);
  }, [payments]);

  // 提交表单
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.supplier_id || !formData.contract_id || !formData.amount) {
      toast.error('请填写必填项');
      return;
    }

    try {
      const res = await fetch('/api/supplier-contracts/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contract_id: Number(formData.contract_id),
          payment_amount: Number(formData.amount),
          payment_date: formData.payment_date,
          payment_type: formData.payment_type,
          payment_method: formData.payment_method,
          remark: formData.remark || null,
        }),
      });

      if (res.ok) {
        toast.success('付款记录保存成功');
        setDialogOpen(false);
        resetForm();
        fetchPayments();
      } else {
        const data = await res.json();
        toast.error(data.error || '保存失败');
      }
    } catch (e) {
      toast.error('保存失败');
    }
  };

  // 删除
  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除此付款记录吗？')) return;
    try {
      const res = await fetch(`/api/supplier-contracts/payments/${id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('删除成功');
        fetchPayments();
      }
    } catch (e) { toast.error('删除失败'); }
  };

  const resetForm = () => {
    setFormData({
      supplier_id: '',
      contract_id: '',
      amount: '',
      payment_date: new Date().toISOString().split('T')[0],
      payment_type: 'progress',
      payment_method: '银行转账',
      remark: '',
    });
  };

  // 筛选数据
  const filteredData = payments.filter(p => {
    if (searchKeyword) {
      const kw = searchKeyword.toLowerCase();
      const contractName = p.contract?.contract_name || p.contract_name || '';
      if (!p.supplier_name?.toLowerCase().includes(kw) &&
          !contractName.toLowerCase().includes(kw)) return false;
    }
    return true;
  });

  // 图表数据
  const pieData = [
    { name: '进度款', value: stats.progress },
    { name: '尾款', value: stats.final },
    { name: '质保金返还', value: stats.warranty },
  ].filter(d => d.value > 0);

  // 导出
  const handleExport = () => {
    const headers = ['供应商', '合同', '付款日期', '付款类型', '金额', '付款方式', '备注'];
    const rows = filteredData.map(p => [
      p.supplier_name, 
      p.contract?.contract_name || p.contract_name || '', 
      p.payment_date,
      p.payment_type === 'progress' ? '进度款' : p.payment_type === 'final' ? '尾款' : '质保金返还',
      p.payment_amount, 
      p.payment_method, 
      p.remark || '',
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `付款记录_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    toast.success('导出成功');
  };

  return (
    <div className="container mx-auto space-y-4 px-3 py-4 sm:px-4 md:px-6">
      {/* 头部 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <h1 className="text-xl font-bold">付款记录</h1>
        <div className="grid w-full grid-cols-2 gap-2 sm:w-auto sm:flex">
          <Button variant="outline" onClick={handleExport} className="w-full sm:w-auto"><Download className="w-4 h-4 mr-1" /> 导出</Button>
          <Button onClick={() => setDialogOpen(true)} className="w-full sm:w-auto"><Plus className="w-4 h-4 mr-1" /> 新增付款</Button>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        <Card><CardContent className="pt-3 px-3">
          <div className="text-xs text-muted-foreground">付款总额</div>
          <div className="text-xl font-bold text-red-600">¥{(stats.total / 10000).toFixed(1)}万</div>
        </CardContent></Card>
        <Card><CardContent className="pt-3 px-3">
          <div className="text-xs text-muted-foreground">进度款</div>
          <div className="text-lg font-bold">¥{(stats.progress / 10000).toFixed(1)}万</div>
        </CardContent></Card>
        <Card><CardContent className="pt-3 px-3">
          <div className="text-xs text-muted-foreground">尾款</div>
          <div className="text-lg font-bold">¥{(stats.final / 10000).toFixed(1)}万</div>
        </CardContent></Card>
        <Card><CardContent className="pt-3 px-3">
          <div className="text-xs text-muted-foreground">质保金返还</div>
          <div className="text-lg font-bold">¥{(stats.warranty / 10000).toFixed(1)}万</div>
        </CardContent></Card>
        <Card><CardContent className="pt-3 px-3">
          <div className="text-xs text-muted-foreground">付款笔数</div>
          <div className="text-xl font-bold">{stats.count}</div>
        </CardContent></Card>
      </div>

      {/* 图表 */}
      {pieData.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">付款类型分布</CardTitle></CardHeader>
          <CardContent>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" outerRadius={80} dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {pieData.map((_, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => `¥${Number(v).toLocaleString()}`} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 筛选 */}
      <Card>
        <CardContent className="pt-3 px-3">
          <div className="grid gap-2 sm:flex sm:flex-wrap">
            <Select value={filterSupplier} onValueChange={v => { setFilterSupplier(v); setFilterContract('all'); }}>
              <SelectTrigger className="w-full sm:w-[140px]"><SelectValue placeholder="供应商" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部供应商</SelectItem>
                {suppliers.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input placeholder="搜索..." value={searchKeyword} onChange={e => setSearchKeyword(e.target.value)} className="min-w-0 flex-1" />
          </div>
        </CardContent>
      </Card>

      {/* 表格 */}
      <Card>
        <CardContent className="p-0">
          <div className="divide-y md:hidden">
            {loading ? (
              <div className="py-8 text-center text-sm text-muted-foreground">加载中...</div>
            ) : filteredData.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">暂无付款记录</div>
            ) : (
              filteredData.map(p => {
                const contractName = p.contract?.contract_name || p.contract_name || '';
                return (
                  <div key={p.id} className="space-y-3 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{p.supplier_name}</p>
                        <p className="mt-1 truncate text-xs text-muted-foreground">{contractName || '-'}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-bold text-red-600">¥{Number(p.payment_amount).toLocaleString()}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{p.payment_date}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-md bg-muted/50 p-2">
                        <p className="text-muted-foreground">类型</p>
                        <Badge variant={p.payment_type === 'progress' ? 'default' : p.payment_type === 'final' ? 'secondary' : 'outline'} className="mt-1">
                          {p.payment_type === 'progress' ? '进度款' : p.payment_type === 'final' ? '尾款' : '质保金返还'}
                        </Badge>
                      </div>
                      <div className="rounded-md bg-muted/50 p-2">
                        <p className="text-muted-foreground">方式</p>
                        <p className="mt-1 truncate font-medium">{p.payment_method || '-'}</p>
                      </div>
                    </div>
                    {p.remark && <p className="line-clamp-2 text-xs text-muted-foreground">{p.remark}</p>}
                    <div className="flex justify-end">
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(p.id)} className="text-red-600 hover:text-red-700">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <Table className="min-w-[820px]">
              <TableHeader>
                <TableRow>
                  <TableHead>供应商</TableHead>
                  <TableHead>合同</TableHead>
                  <TableHead>付款日期</TableHead>
                  <TableHead>付款类型</TableHead>
                  <TableHead className="text-right">金额</TableHead>
                  <TableHead>付款方式</TableHead>
                  <TableHead>备注</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8">加载中...</TableCell></TableRow>
                ) : filteredData.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8">暂无付款记录</TableCell></TableRow>
                ) : (
                  filteredData.map(p => {
                    const contractName = p.contract?.contract_name || p.contract_name || '';
                    return (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.supplier_name}</TableCell>
                      <TableCell className="max-w-[120px] truncate" title={contractName}>{contractName}</TableCell>
                      <TableCell>{p.payment_date}</TableCell>
                      <TableCell>
                        <Badge variant={p.payment_type === 'progress' ? 'default' : p.payment_type === 'final' ? 'secondary' : 'outline'}>
                          {p.payment_type === 'progress' ? '进度款' : p.payment_type === 'final' ? '尾款' : '质保金返还'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-bold text-red-600">¥{Number(p.payment_amount).toLocaleString()}</TableCell>
                      <TableCell>{p.payment_method}</TableCell>
                      <TableCell className="max-w-[100px] truncate">{p.remark || '-'}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(p.id)} className="text-red-600 hover:text-red-700">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* 新增对话框 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] w-[calc(100vw-1.5rem)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>新增付款记录</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>供应商 <span className="text-red-500">*</span></Label>
              <Select value={formData.supplier_id} onValueChange={v => setFormData(p => ({ ...p, supplier_id: v }))}>
                <SelectTrigger><SelectValue placeholder="请选择供应商" /></SelectTrigger>
                <SelectContent>
                  {suppliers.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>对应合同 <span className="text-red-500">*</span></Label>
              <Select value={formData.contract_id} onValueChange={v => setFormData(p => ({ ...p, contract_id: v }))} disabled={!formData.supplier_id}>
                <SelectTrigger><SelectValue placeholder={formData.supplier_id ? "请选择合同" : "请先选择供应商"} /></SelectTrigger>
                <SelectContent>
                  {filteredContracts.map(c => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.contract_name} {c.contract_no && `(${c.contract_no})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>付款日期</Label>
                <Input type="date" value={formData.payment_date}
                  onChange={e => setFormData(p => ({ ...p, payment_date: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>付款金额 <span className="text-red-500">*</span></Label>
                <Input type="number" placeholder="0.00" value={formData.amount}
                  onChange={e => setFormData(p => ({ ...p, amount: e.target.value }))} />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>付款类型</Label>
                <Select value={formData.payment_type}
                  onValueChange={v => setFormData(p => ({ ...p, payment_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>付款方式</Label>
                <Select value={formData.payment_method}
                  onValueChange={v => setFormData(p => ({ ...p, payment_method: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>备注</Label>
              <Input placeholder="可选" value={formData.remark}
                onChange={e => setFormData(p => ({ ...p, remark: e.target.value }))} />
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2 sm:flex sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
              <Button type="submit">保存</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
