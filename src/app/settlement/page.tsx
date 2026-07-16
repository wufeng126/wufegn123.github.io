'use client';
import { useToast } from '@/hooks/use-toast';
import { isSuperAdminUser } from '@/lib/route-permissions';

import { useState, useEffect, useCallback } from 'react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import {
  Search, Trash2, Receipt
} from 'lucide-react';
import { LinkableCell } from '@/components/linkable-cell';

// ============ 类型定义 ============
interface Supplier {
  id: number;
  name: string;
}

interface Settlement {
  id: number;
  contract_id: number;
  contract?: { supplier_id: number };
  settlement_no: string;
  settlement_type: string;
  settlement_amount: number;
  payment_ratio: number;
  payment_ratio_active?: number;
  payment_ratio_complete?: number;
  payable_amount: number;
  settlement_date?: string;
  status: string;
  remark?: string;
  supplier_name?: string;
  supplier_id?: number;
}

interface Stats {
  totalSettlement: number;
  totalPayable: number;
  totalPaid: number;
  totalPending: number;
}

// ============ 工具函数 ============
const formatCurrency = (value: number | null | undefined) => {
  if (value == null) return '¥0.00';
  return `¥${Number(value).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatDate = (dateStr: string | null | undefined) => {
  if (!dateStr) return '-';
  return dateStr.split('T')[0];
};

// ============ 主组件 ============
export default function SettlementPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<{ role: string } | null>(null);
  const canManage = isSuperAdminUser(user?.role) || user?.role === 'admin' || user?.role === '财务' || user?.role === '管理员';

  // 数据状态
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [contracts, setContracts] = useState<any[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);

  // 筛选状态
  const [filterSupplier, setFilterSupplier] = useState<string>('all');
  const [searchKeyword, setSearchKeyword] = useState('');

  // 对话框状态
  const [settlementDialogOpen, setSettlementDialogOpen] = useState(false);
  const [editingSettlement, setEditingSettlement] = useState<Settlement | null>(null);

  const [settlementForm, setSettlementForm] = useState({
    contract_id: '', settlement_type: '履约中', settlement_amount: '',
    settlement_date: '', remark: '',
  });

  // 获取用户信息
  const fetchUser = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
      }
    } catch (e) { console.error(e); }
  }, []);

  // 获取供应商列表
  const fetchSuppliers = useCallback(async () => {
    try {
      const res = await fetch('/api/suppliers', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        // 筛选 type 为 supplier 的供应商
        const supplierList = (data.suppliers || []).filter((s: any) => s.type === 'supplier');
        setSuppliers(supplierList);
      }
    } catch (e) { console.error(e); }
  }, []);

  // 获取合同列表
  const fetchContracts = useCallback(async () => {
    try {
      const res = await fetch('/api/supplier-contracts', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setContracts(data.contracts || []);
      }
    } catch (e) { console.error(e); }
  }, []);

  // 获取结算单列表
  const fetchSettlements = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filterSupplier !== 'all') params.append('supplier_id', filterSupplier);
      const res = await fetch(`/api/supplier-contracts/settlements?${params}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setSettlements(data.settlements || []);
      }
    } catch (e) { console.error(e); }
  }, [filterSupplier]);

  // 初始化加载
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await Promise.all([fetchUser(), fetchSuppliers(), fetchContracts(), fetchSettlements()]);
      setLoading(false);
    };
    load();
  }, [fetchUser, fetchSuppliers, fetchContracts, fetchSettlements]);

  // 筛选后的数据
  const filteredSettlements = settlements.filter(s => {
    if (searchKeyword) {
      const kw = searchKeyword.toLowerCase();
      const supplierName = String(s.supplier_name || '').toLowerCase();
      if (!supplierName.includes(kw) && !String(s.settlement_no || '').toLowerCase().includes(kw)) return false;
    }
    return true;
  });

  // ============ 结算单操作 ============
  const openAddSettlementDialog = () => {
    setEditingSettlement(null);
    setSettlementForm({
      contract_id: '', settlement_type: '履约中', settlement_amount: '',
      settlement_date: '', remark: '',
    });
    setSettlementDialogOpen(true);
  };

  const handleSettlementTypeChange = (type: string) => {
    setSettlementForm(prev => ({ ...prev, settlement_type: type }));
  };

  const handleSaveSettlement = async () => {
    if (!settlementForm.contract_id) { toast({ title: '请选择合同' }); return; }
    if (!settlementForm.settlement_amount || parseFloat(settlementForm.settlement_amount) <= 0) { toast({ title: '请输入结算金额', variant: 'error' }); return; }

    try {
      const res = await fetch('/api/supplier-contracts/settlements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contract_id: parseInt(settlementForm.contract_id),
          settlement_type: settlementForm.settlement_type,
          settlement_amount: parseFloat(settlementForm.settlement_amount),
          settlement_date: settlementForm.settlement_date || null,
          remark: settlementForm.remark,
        }),
        credentials: 'include',
      });

      if (res.ok) {
        setSettlementDialogOpen(false);
        fetchSettlements();
      } else {
        const data = await res.json();
        toast({ title: data.error || '保存失败', variant: 'error' });
      }
    } catch (e) { toast({ title: '保存失败', variant: 'error' }); }
  };

  const handleDeleteSettlement = async (id: number) => {
    if (!confirm('确定删除该结算单？')) return;
    try {
      const res = await fetch(`/api/supplier-contracts/settlements/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchSettlements();
      } else {
        const data = await res.json();
        toast({ title: data.error || '删除失败', variant: 'error' });
      }
    } catch (e) { toast({ title: '删除失败', variant: 'error' }); }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-screen"><div className="text-gray-500">加载中...</div></div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        {/* 页面标题 */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <h1 className="text-xl font-semibold tracking-tight text-gray-900">供应商结算管理</h1>
          <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
            <Button variant="outline" onClick={openAddSettlementDialog}><Receipt className="mr-2 h-4 w-4" />办理结算</Button>
          </div>
        </div>

        {/* 统计卡片 */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="bg-blue-50 border-blue-200"><CardContent className="p-4">
              <p className="text-xs text-blue-600">累计结算</p>
              <p className="text-lg font-bold text-blue-600">{formatCurrency(stats.totalSettlement)}</p>
            </CardContent></Card>
            <Card className="bg-orange-50 border-orange-200"><CardContent className="p-4">
              <p className="text-xs text-orange-600">应付金额</p>
              <p className="text-lg font-bold text-orange-600">{formatCurrency(stats.totalPayable)}</p>
            </CardContent></Card>
            <Card className="bg-green-50 border-green-200"><CardContent className="p-4">
              <p className="text-xs text-green-600">已付金额</p>
              <p className="text-lg font-bold text-green-600">{formatCurrency(stats.totalPaid)}</p>
            </CardContent></Card>
            <Card className="bg-red-50 border-red-200"><CardContent className="p-4">
              <p className="text-xs text-red-600">未付金额</p>
              <p className="text-lg font-bold text-red-600">{formatCurrency(stats.totalPending)}</p>
            </CardContent></Card>
          </div>
        )}

        {/* 筛选栏 */}
        <div className="flex flex-col gap-3 rounded-lg bg-white p-4 sm:flex-row sm:items-center sm:gap-4">
          <Select value={filterSupplier} onValueChange={setFilterSupplier}>
            <SelectTrigger className="w-full sm:w-[200px]"><SelectValue placeholder="选择供应商" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部供应商</SelectItem>
              {suppliers.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="relative w-full sm:w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input placeholder="搜索..." value={searchKeyword} onChange={e => setSearchKeyword(e.target.value)} className="pl-9" />
          </div>
        </div>

        {/* 结算单列表 */}
        <Card>
          <CardContent className="p-0">
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead>结算单号</TableHead>
                    <TableHead>供应商</TableHead>
                    <TableHead>结算类型</TableHead>
                    <TableHead className="text-right">结算金额</TableHead>
                    <TableHead className="text-center">履约中付款比例</TableHead>
                    <TableHead className="text-center">结算付款比例</TableHead>
                    <TableHead className="text-right">应付金额</TableHead>
                    <TableHead>结算日期</TableHead>
                    <TableHead>状态</TableHead>
                    {canManage && <TableHead className="text-center">操作</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSettlements.length === 0 ? (
                    <TableRow><TableCell colSpan={11} className="text-center py-8 text-gray-500">暂无数据</TableCell></TableRow>
                  ) : filteredSettlements.map(s => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{String(s.settlement_no || '')}</TableCell>
                      <TableCell><LinkableCell href={`/suppliers?id=${s.supplier_id}`}>{String(s.supplier_name || '')}</LinkableCell></TableCell>
                      <TableCell>
                        <Badge variant={s.settlement_type === '履约中' ? 'default' : 'secondary'}>
                          {String(s.settlement_type || '')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(s.settlement_amount)}</TableCell>
                      <TableCell className="text-center">{Number(s.payment_ratio_active || 0)}%</TableCell>
                      <TableCell className="text-center">{Number(s.payment_ratio_complete || 0)}%</TableCell>
                      <TableCell className="text-right text-orange-600 font-medium">{formatCurrency(s.payable_amount)}</TableCell>
                      <TableCell>{formatDate(s.settlement_date)}</TableCell>
                      <TableCell>
                        <Badge variant={s.status === '已确认' ? 'default' : 'outline'}>
                          {String(s.status || '已提交')}
                        </Badge>
                      </TableCell>
                      {canManage && (
                        <TableCell className="text-center">
                          <Button size="sm" variant="ghost" className="text-red-600" onClick={() => handleDeleteSettlement(s.id)}><Trash2 className="h-4 w-4" /></Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="space-y-3 p-3 md:hidden">
              {filteredSettlements.length === 0 ? (
                <div className="py-8 text-center text-sm text-gray-500">暂无数据</div>
              ) : filteredSettlements.map(s => (
                <div key={s.id} className="rounded-lg border bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{String(s.settlement_no || '')}</div>
                      <LinkableCell href={`/suppliers?id=${s.supplier_id}`}>{String(s.supplier_name || '')}</LinkableCell>
                    </div>
                    <Badge variant={s.status === '已确认' ? 'default' : 'outline'} className="shrink-0">
                      {String(s.status || '已提交')}
                    </Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge variant={s.settlement_type === '履约中' ? 'default' : 'secondary'}>
                      {String(s.settlement_type || '')}
                    </Badge>
                    <Badge variant="outline">履约 {Number(s.payment_ratio_active || 0)}%</Badge>
                    <Badge variant="outline">结算 {Number(s.payment_ratio_complete || 0)}%</Badge>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <div className="text-xs text-gray-500">结算金额</div>
                      <div className="mt-1 font-medium">{formatCurrency(s.settlement_amount)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">应付金额</div>
                      <div className="mt-1 font-medium text-orange-600">{formatCurrency(s.payable_amount)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">结算日期</div>
                      <div className="mt-1">{formatDate(s.settlement_date)}</div>
                    </div>
                  </div>
                  {canManage && (
                    <Button size="sm" variant="outline" className="mt-4 w-full text-red-600" onClick={() => handleDeleteSettlement(s.id)}>
                      <Trash2 className="mr-2 h-4 w-4" />删除
                    </Button>
                  )}
                </div>
              ))}
            </div>
            </CardContent>
          </Card>
      </div>

      {/* 新增结算单对话框 */}
      <Dialog open={settlementDialogOpen} onOpenChange={setSettlementDialogOpen}>
        <DialogContent className="max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle>办理结算</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>选择合同 *</Label>
              <Select value={settlementForm.contract_id} onValueChange={v => setSettlementForm(prev => ({ ...prev, contract_id: v }))}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="选择合同" /></SelectTrigger>
                <SelectContent>
                  {contracts.filter(c => c.contract_status === '履约中').map(c => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.supplier?.name} - {c.contract_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>结算类型 *</Label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Button variant={settlementForm.settlement_type === '履约中' ? 'default' : 'outline'} onClick={() => handleSettlementTypeChange('履约中')}>
                  履约中 ({contracts.find(c => c.id === parseInt(settlementForm.contract_id))?.payment_ratio_active || 80}%)
                </Button>
                <Button variant={settlementForm.settlement_type === '结算完' ? 'default' : 'outline'} onClick={() => handleSettlementTypeChange('结算完')}>
                  结算完 ({contracts.find(c => c.id === parseInt(settlementForm.contract_id))?.payment_ratio_complete || 95}%)
                </Button>
              </div>
            </div>
            <div>
              <Label>结算金额 *</Label>
              <Input type="number" value={settlementForm.settlement_amount} onChange={e => setSettlementForm(prev => ({ ...prev, settlement_amount: e.target.value }))} className="mt-1" placeholder="0.00" />
              {settlementForm.settlement_amount && settlementForm.contract_id && (() => {
                const selectedContract = contracts.find(c => c.id === parseInt(settlementForm.contract_id));
                const ratio = settlementForm.settlement_type === '履约中' 
                  ? (selectedContract?.payment_ratio_active || 80)
                  : (selectedContract?.payment_ratio_complete || 95);
                const payable = (parseFloat(settlementForm.settlement_amount) || 0) * ratio / 100;
                return (
                  <p className="text-sm text-gray-500 mt-1">
                    应付金额 = {formatCurrency(parseFloat(settlementForm.settlement_amount) || 0)} × {ratio}% = {formatCurrency(payable)}
                  </p>
                );
              })()}
            </div>
            <div>
              <Label>结算日期</Label>
              <Input type="date" value={settlementForm.settlement_date} onChange={e => setSettlementForm(prev => ({ ...prev, settlement_date: e.target.value }))} className="mt-1" />
            </div>
            <div>
              <Label>备注</Label>
              <Textarea value={settlementForm.remark} onChange={e => setSettlementForm(prev => ({ ...prev, remark: e.target.value }))} className="mt-1" rows={2} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:flex sm:justify-end">
            <Button variant="outline" onClick={() => setSettlementDialogOpen(false)}>取消</Button>
            <Button onClick={handleSaveSettlement}>保存</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
