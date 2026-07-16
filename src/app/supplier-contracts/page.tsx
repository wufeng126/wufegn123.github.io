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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import {
  Plus, Search, Pencil, Trash2, FileText, Download
} from 'lucide-react';

// ============ 类型定义 ============
interface Supplier {
  id: number;
  name: string;
}

interface Contract {
  id: number;
  supplier_id: number;
  supplier?: { id: number; name: string };
  project_id?: number;
  contract_no?: string;
  contract_name: string;
  total_amount: number;
  payment_ratio_active: number;
  payment_ratio_complete: number;
  warranty_ratio: number;
  contract_status: string;
  total_settlement: number;
  total_payable: number;
  total_paid: number;
  pending_amount: number;
  has_complete_settlement: boolean;
}

interface Stats {
  totalContracts: number;
  totalAmount: number;
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

// ============ 主组件 ============
export default function SupplierContractsPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<{ role: string } | null>(null);
  const canManage = isSuperAdminUser(user?.role) || user?.role === 'admin' || user?.role === '财务' || user?.role === '管理员';

  // 数据状态
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);

  // 筛选状态
  const [filterSupplier, setFilterSupplier] = useState<string>('all');
  const [searchKeyword, setSearchKeyword] = useState('');

  // 对话框状态
  const [contractDialogOpen, setContractDialogOpen] = useState(false);
  const [editingContract, setEditingContract] = useState<Contract | null>(null);

  // 表单状态
  const [contractForm, setContractForm] = useState({
    supplier_id: '', project_id: '', contract_no: '', contract_name: '',
    sign_date: '', expire_date: '', total_amount: '', supply_content: '',
    payment_ratio_active: '80', payment_ratio_complete: '95', warranty_ratio: '0',
    payment_method: '按进度付款', remark: '',
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
      const params = new URLSearchParams();
      if (filterSupplier !== 'all') params.append('supplier_id', filterSupplier);
      const res = await fetch(`/api/supplier-contracts?${params}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setContracts(data.contracts || []);
        setStats(data.summary);
      }
    } catch (e) { console.error(e); }
  }, [filterSupplier]);

  // 初始化加载
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await Promise.all([fetchUser(), fetchSuppliers(), fetchContracts()]);
      setLoading(false);
    };
    load();
  }, [fetchUser, fetchSuppliers, fetchContracts]);

  // 筛选后的数据
  const filteredContracts = contracts.filter(c => {
    if (searchKeyword) {
      const kw = searchKeyword.toLowerCase();
      const supplierName = String(c.supplier?.name || '').toLowerCase();
      if (!supplierName.includes(kw) && !String(c.contract_name || '').toLowerCase().includes(kw)) return false;
    }
    return true;
  });

  // ============ 合同操作 ============
  const openAddContractDialog = () => {
    setEditingContract(null);
    setContractForm({
      supplier_id: '', project_id: '', contract_no: '', contract_name: '',
      sign_date: '', expire_date: '', total_amount: '', supply_content: '',
      payment_ratio_active: '80', payment_ratio_complete: '95', warranty_ratio: '0',
      payment_method: '按进度付款', remark: '',
    });
    setContractDialogOpen(true);
  };

  const handleEditContract = (contract: Contract) => {
    setEditingContract(contract);
    setContractForm({
      supplier_id: String(contract.supplier_id),
      project_id: String(contract.project_id || ''),
      contract_no: contract.contract_no || '',
      contract_name: contract.contract_name,
      sign_date: '',
      expire_date: '',
      total_amount: String(contract.total_amount || ''),
      supply_content: '',
      payment_ratio_active: String(contract.payment_ratio_active || 80),
      payment_ratio_complete: String(contract.payment_ratio_complete || 95),
      warranty_ratio: String(contract.warranty_ratio || 0),
      payment_method: '按进度付款',
      remark: '',
    });
    setContractDialogOpen(true);
  };

  const handleSaveContract = async () => {
    if (!contractForm.supplier_id) { toast({ title: '请选择供应商' }); return; }
    if (!contractForm.contract_name.trim()) { toast({ title: '请输入合同名称', variant: 'error' }); return; }

    try {
      const url = editingContract ? `/api/supplier-contracts/${editingContract.id}` : '/api/supplier-contracts';
      const method = editingContract ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...contractForm,
          supplier_id: parseInt(contractForm.supplier_id),
          total_amount: parseFloat(contractForm.total_amount) || 0,
          payment_ratio_active: parseFloat(contractForm.payment_ratio_active) || 80,
          payment_ratio_complete: parseFloat(contractForm.payment_ratio_complete) || 95,
          warranty_ratio: parseFloat(contractForm.warranty_ratio) || 0,
        }),
        credentials: 'include',
      });

      if (res.ok) {
        setContractDialogOpen(false);
        fetchContracts();
      } else {
        const data = await res.json();
        toast({ title: data.error || '保存失败', variant: 'error' });
      }
    } catch (e) { toast({ title: '保存失败', variant: 'error' }); }
  };

  const handleDeleteContract = async (id: number) => {
    if (!confirm('确定删除该合同？删除后关联的结算单和付款记录也将一并删除。')) return;
    try {
      const res = await fetch(`/api/supplier-contracts/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        fetchContracts();
      } else {
        toast({ title: data.error || '删除失败', variant: 'error' });
      }
    } catch (e) { toast({ title: '删除失败，请重试', variant: 'error' }); }
  };

  // ============ 渲染 ============
  return (
    <div className="min-h-screen bg-gray-50 px-3 py-4 sm:p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        {/* 页面标题 */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <h1 className="text-xl font-semibold tracking-tight text-gray-900">合同管理</h1>
          {canManage && (
            <Button onClick={openAddContractDialog} className="w-full sm:w-auto"><Plus className="mr-2 h-4 w-4" />新增合同</Button>
          )}
        </div>

        {/* 统计卡片 */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card><CardContent className="p-4">
              <p className="text-xs text-gray-500">合同数</p>
              <p className="text-2xl font-bold text-blue-600">{stats.totalContracts}</p>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <p className="text-xs text-gray-500">合同总额</p>
              <p className="text-lg font-bold">{formatCurrency(stats.totalAmount)}</p>
            </CardContent></Card>
            <Card className="bg-blue-50 border-blue-200"><CardContent className="p-4">
              <p className="text-xs text-blue-600">累计结算</p>
              <p className="text-lg font-bold text-blue-600">{formatCurrency(stats.totalSettlement)}</p>
            </CardContent></Card>
            <Card className="bg-orange-50 border-orange-200"><CardContent className="p-4">
              <p className="text-xs text-orange-600">应付金额</p>
              <p className="text-lg font-bold text-orange-600">{formatCurrency(stats.totalPayable)}</p>
            </CardContent></Card>
          </div>
        )}

        {/* 筛选栏 */}
        <div className="mobile-filter-grid rounded-lg bg-white p-4 sm:flex sm:items-center sm:gap-4">
          <Select value={filterSupplier} onValueChange={setFilterSupplier}>
            <SelectTrigger className="w-full sm:w-[200px]"><SelectValue placeholder="选择供应商" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部供应商</SelectItem>
              {suppliers.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="relative w-full sm:max-w-sm sm:flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input placeholder="搜索供应商或合同名称..." value={searchKeyword} onChange={e => setSearchKeyword(e.target.value)} className="pl-9" />
          </div>
        </div>

        {/* 合同列表 */}
        <Card>
          <CardContent className="p-0">
            <Table className="hidden md:table">
              <TableHeader>
                <TableRow className="bg-gray-50">
                  <TableHead>供应商</TableHead>
                  <TableHead>合同编号</TableHead>
                  <TableHead>合同名称</TableHead>
                  <TableHead className="text-right">合同金额</TableHead>
                  <TableHead className="text-center">履约中付款比例</TableHead>
                  <TableHead className="text-center">结算付款比例</TableHead>
                  <TableHead className="text-center">质保金比例</TableHead>
                  <TableHead className="text-right">累计结算</TableHead>
                  <TableHead className="text-right">应付</TableHead>
                  <TableHead className="text-right">已付</TableHead>
                  <TableHead className="text-center">状态</TableHead>
                  {canManage && <TableHead className="text-center">操作</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredContracts.length === 0 ? (
                  <TableRow><TableCell colSpan={11} className="text-center py-8 text-gray-500">暂无数据</TableCell></TableRow>
                ) : filteredContracts.map(contract => (
                  <TableRow key={contract.id}>
                    <TableCell className="font-medium">{String(contract.supplier?.name || '')}</TableCell>
                    <TableCell className="text-gray-500">{contract.contract_no || '-'}</TableCell>
                    <TableCell>{String(contract.contract_name || '')}</TableCell>
                    <TableCell className="text-right">{formatCurrency(contract.total_amount)}</TableCell>
                    <TableCell className="text-center">{Number(contract.payment_ratio_active || 0)}%</TableCell>
                    <TableCell className="text-center">{Number(contract.payment_ratio_complete || 0)}%</TableCell>
                    <TableCell className="text-center">{Number(contract.warranty_ratio || 0)}%</TableCell>
                    <TableCell className="text-right text-blue-600">{formatCurrency(contract.total_settlement)}</TableCell>
                    <TableCell className="text-right text-orange-600 font-medium">{formatCurrency(contract.total_payable)}</TableCell>
                    <TableCell className="text-right text-green-600">{formatCurrency(contract.total_paid)}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant={contract.contract_status === '履约中' ? 'default' : contract.contract_status === '已完结' ? 'secondary' : 'destructive'}>
                        {String(contract.contract_status || '')}
                      </Badge>
                    </TableCell>
                    {canManage && (
                      <TableCell className="text-center">
                        <div className="flex justify-center gap-1">
                          <Button size="sm" variant="ghost" onClick={() => handleEditContract(contract)}><Pencil className="h-4 w-4" /></Button>
                          <Button size="sm" variant="ghost" className="text-red-600" onClick={() => handleDeleteContract(contract.id)}><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="space-y-3 p-3 md:hidden">
              {filteredContracts.length === 0 ? (
                <div className="rounded-lg border border-gray-100 py-8 text-center text-sm text-gray-500">暂无数据</div>
              ) : filteredContracts.map(contract => (
                <div key={contract.id} className="rounded-lg border border-gray-100 bg-white p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-gray-900">{String(contract.contract_name || '')}</p>
                      <p className="mt-1 truncate text-xs text-gray-500">{String(contract.supplier?.name || '')} · {contract.contract_no || '-'}</p>
                    </div>
                    <Badge variant="outline" className="shrink-0">
                      {String(contract.contract_status || '')}
                    </Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <p className="text-gray-500">合同金额</p>
                      <p className="mt-0.5 font-semibold text-gray-900">{formatCurrency(contract.total_amount)}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">累计结算</p>
                      <p className="mt-0.5 font-semibold text-blue-600">{formatCurrency(contract.total_settlement)}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">应付</p>
                      <p className="mt-0.5 font-semibold text-orange-600">{formatCurrency(contract.total_payable)}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">已付</p>
                      <p className="mt-0.5 font-semibold text-green-600">{formatCurrency(contract.total_paid)}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-500">
                    <span>履约 {Number(contract.payment_ratio_active || 0)}%</span>
                    <span>结算 {Number(contract.payment_ratio_complete || 0)}%</span>
                    <span>质保 {Number(contract.warranty_ratio || 0)}%</span>
                  </div>
                  {canManage && (
                    <div className="mt-3 grid grid-cols-2 gap-2 border-t border-gray-100 pt-3">
                      <Button size="sm" variant="outline" onClick={() => handleEditContract(contract)}><Pencil className="mr-1 h-4 w-4" />编辑</Button>
                      <Button size="sm" variant="outline" className="text-red-600" onClick={() => handleDeleteContract(contract.id)}><Trash2 className="mr-1 h-4 w-4" />删除</Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 新增/编辑合同对话框 */}
      <Dialog open={contractDialogOpen} onOpenChange={setContractDialogOpen}>
        <DialogContent className="max-h-[90vh] w-[calc(100vw-1.5rem)] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingContract ? '编辑合同' : '新增合同'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label>供应商 *</Label>
                <Select value={contractForm.supplier_id} onValueChange={v => setContractForm(prev => ({ ...prev, supplier_id: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="选择供应商" /></SelectTrigger>
                  <SelectContent>
                    {suppliers.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>合同编号</Label>
                <Input value={contractForm.contract_no} onChange={e => setContractForm(prev => ({ ...prev, contract_no: e.target.value }))} className="mt-1" placeholder="HT2024001" />
              </div>
            </div>

            <div>
              <Label>合同名称 *</Label>
              <Input value={contractForm.contract_name} onChange={e => setContractForm(prev => ({ ...prev, contract_name: e.target.value }))} className="mt-1" />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label>签订日期</Label>
                <Input type="date" value={contractForm.sign_date} onChange={e => setContractForm(prev => ({ ...prev, sign_date: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <Label>有效期至</Label>
                <Input type="date" value={contractForm.expire_date} onChange={e => setContractForm(prev => ({ ...prev, expire_date: e.target.value }))} className="mt-1" />
              </div>
            </div>

            <div>
              <Label>合同金额</Label>
              <Input type="number" value={contractForm.total_amount} onChange={e => setContractForm(prev => ({ ...prev, total_amount: e.target.value }))} className="mt-1" placeholder="0.00" />
            </div>

            <div>
              <Label>供应内容</Label>
              <Textarea value={contractForm.supply_content} onChange={e => setContractForm(prev => ({ ...prev, supply_content: e.target.value }))} className="mt-1" rows={2} />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <Label>履约中付款比例 (%)</Label>
                <Input type="number" value={contractForm.payment_ratio_active} onChange={e => setContractForm(prev => ({ ...prev, payment_ratio_active: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <Label>结算付款比例 (%)</Label>
                <Input type="number" value={contractForm.payment_ratio_complete} onChange={e => setContractForm(prev => ({ ...prev, payment_ratio_complete: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <Label>质保金比例 (%)</Label>
                <Input type="number" value={contractForm.warranty_ratio} onChange={e => setContractForm(prev => ({ ...prev, warranty_ratio: e.target.value }))} className="mt-1" />
              </div>
            </div>

            <div>
              <Label>备注</Label>
              <Textarea value={contractForm.remark} onChange={e => setContractForm(prev => ({ ...prev, remark: e.target.value }))} className="mt-1" rows={2} />
            </div>
          </div>
          <DialogFooter className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
            <Button variant="outline" onClick={() => setContractDialogOpen(false)}>取消</Button>
            <Button onClick={handleSaveContract}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
