'use client';
import { useToast } from '@/hooks/use-toast';
import { isSuperAdminUser } from '@/lib/route-permissions';

import { useState, useEffect, useCallback } from 'react';
import { TableCell, TableRow } from '@/components/ui/table';
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
  DataTable, PageHeader, FilterBar, EmptyRow, PaginationBar, numCell
} from '@/components/ui/list-page';
import {
  Plus, Search, Pencil, Trash2
} from 'lucide-react';
import { useConfirm } from '@/hooks/use-confirm';
import { DEFAULT_PAYMENT_RATIOS } from '@/lib/payment-ratios';

// ============ 类型定义 ============
interface Supplier {
  id: number;
  name: string;
  type?: string;
}

interface Contract {
  id: number;
  supplier_id: number;
  supplier?: { id: number; name: string };
  project_id?: number;
  contract_no?: string;
  contract_name: string;
  sign_date?: string;
  expire_date?: string;
  supply_content?: string;
  payment_method?: string;
  remark?: string;
  payment_ratio_active: number;
  payment_ratio_complete: number;
  payment_ratio_final: number;
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
  avgPaymentRatio: number;
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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [user, setUser] = useState<{ role: string } | null>(null);
  const canManage = isSuperAdminUser(user?.role) || user?.role === 'admin' || user?.role === '财务' || user?.role === '管理员';

  // 数据状态
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);

  // 筛选状态
  const [filterSupplier, setFilterSupplier] = useState<string>('all');
  const [searchKeyword, setSearchKeyword] = useState('');

  // 分页状态
  const [page, setPage] = useState(1);
  const pageSize = 10;

  // 对话框状态
  const [contractDialogOpen, setContractDialogOpen] = useState(false);
  const [editingContract, setEditingContract] = useState<Contract | null>(null);

  // 表单状态（L6 修复：付款比例默认值引用共享常量）
  const [contractForm, setContractForm] = useState({
    supplier_id: '', project_id: '', contract_no: '', contract_name: '',
    sign_date: '', expire_date: '', supply_content: '',
    payment_ratio_active: String(DEFAULT_PAYMENT_RATIOS.active),
    payment_ratio_complete: String(DEFAULT_PAYMENT_RATIOS.complete),
    payment_ratio_final: String(DEFAULT_PAYMENT_RATIOS.final),
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
        const supplierList = (data.suppliers || []).filter((s: Supplier) => s.type === 'supplier');
        setSuppliers(supplierList);
      }
    } catch (e) { console.error(e); }
  }, []);

  // 获取合同列表
  const fetchContracts = useCallback(async () => {
    try {
      setLoadError(null);
      const params = new URLSearchParams();
      if (filterSupplier !== 'all') params.append('supplier_id', filterSupplier);
      const res = await fetch(`/api/supplier-contracts?${params}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setContracts(data.contracts || []);
        setStats(data.summary);
      } else {
        setLoadError('合同数据加载失败');
      }
    } catch (e) { console.error(e); setLoadError('合同数据加载失败，请检查网络后重试'); }
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

  const confirm = useConfirm();

  // 筛选后的数据
  const filteredContracts = contracts.filter(c => {
    if (searchKeyword) {
      const kw = searchKeyword.toLowerCase();
      const supplierName = String(c.supplier?.name || '').toLowerCase();
      if (!supplierName.includes(kw) && !String(c.contract_name || '').toLowerCase().includes(kw)) return false;
    }
    return true;
  });

  // 筛选条件变化时回到第一页
  // 当前页数据
  const pagedContracts = filteredContracts.slice((page - 1) * pageSize, page * pageSize);

  // ============ 合同操作 ============
  const openAddContractDialog = () => {
    setEditingContract(null);
    setContractForm({
      supplier_id: '', project_id: '', contract_no: '', contract_name: '',
      sign_date: '', expire_date: '', supply_content: '',
      payment_ratio_active: String(DEFAULT_PAYMENT_RATIOS.active),
      payment_ratio_complete: String(DEFAULT_PAYMENT_RATIOS.complete),
      payment_ratio_final: String(DEFAULT_PAYMENT_RATIOS.final),
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
      // 修复：编辑时回填原值，避免保存时空值覆盖清空原字段
      sign_date: contract.sign_date || '',
      expire_date: contract.expire_date || '',
      supply_content: contract.supply_content || '',
      payment_ratio_active: String(contract.payment_ratio_active || DEFAULT_PAYMENT_RATIOS.active),
      payment_ratio_complete: String(contract.payment_ratio_complete || DEFAULT_PAYMENT_RATIOS.complete),
      payment_ratio_final: String(contract.payment_ratio_final || DEFAULT_PAYMENT_RATIOS.final),
      payment_method: contract.payment_method || '按进度付款',
      remark: contract.remark || '',
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
          payment_ratio_active: parseFloat(contractForm.payment_ratio_active) || DEFAULT_PAYMENT_RATIOS.active,
          payment_ratio_complete: parseFloat(contractForm.payment_ratio_complete) || DEFAULT_PAYMENT_RATIOS.complete,
          payment_ratio_final: parseFloat(contractForm.payment_ratio_final) || DEFAULT_PAYMENT_RATIOS.final,
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
    if (!(await confirm({
      title: '确定删除该合同？',
      description: '删除后关联的结算单和付款记录也将一并删除。',
      variant: 'destructive',
    }))) return;
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
    <div className="min-h-screen bg-background px-2 py-3 sm:px-4 sm:py-4">
      <div className="mx-auto max-w-[1600px] space-y-3">
        {/* 页面标题 */}
        <PageHeader
          title="合同管理"
          description="供应商合同台账：付款比例与结算进度一览"
          actions={canManage ? (
            <Button onClick={openAddContractDialog} className="w-full sm:w-auto"><Plus className="mr-2 h-4 w-4" />新增合同</Button>
          ) : undefined}
        />

        {/* 统计卡片 */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card><CardContent className="p-4">
              <p className="text-xs text-muted-foreground">合同数</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-primary">{stats.totalContracts}</p>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <p className="text-xs text-muted-foreground">平均付款比例</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{stats.avgPaymentRatio ?? 0}%</p>
            </CardContent></Card>
            <Card className="bg-accent border-primary/20"><CardContent className="p-4">
              <p className="text-xs text-primary">累计结算</p>
              <p className="mt-1 text-lg font-bold tabular-nums text-primary">{formatCurrency(stats.totalSettlement)}</p>
            </CardContent></Card>
            <Card className="bg-orange-50 border-orange-200"><CardContent className="p-4">
              <p className="text-xs text-orange-600">应付金额</p>
              <p className="mt-1 text-lg font-bold tabular-nums text-orange-600">{formatCurrency(stats.totalPayable)}</p>
            </CardContent></Card>
          </div>
        )}

        {/* 筛选栏 */}
        <FilterBar className="rounded-lg border bg-card p-4">
          <Select value={filterSupplier} onValueChange={(value) => { setFilterSupplier(value); setPage(1); }}>
            <SelectTrigger className="w-full sm:w-[200px]"><SelectValue placeholder="选择供应商" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部供应商</SelectItem>
              {suppliers.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="relative w-full sm:max-w-sm sm:flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="搜索供应商或合同名称..." value={searchKeyword} onChange={e => { setSearchKeyword(e.target.value); setPage(1); }} className="pl-9" />
          </div>
        </FilterBar>

        {/* 合同列表 */}
        <DataTable
          loading={loading}
          error={loadError}
          onRetry={fetchContracts}
          minWidth={800}
          columns={TH => (
            <TableRow>
              <TH>供应商</TH>
              <TH>合同编号</TH>
              <TH>合同名称</TH>
              <TH className="text-center">付款比例</TH>
              <TH className="text-center">结算付款比例</TH>
              <TH className="text-center">决算付款比例</TH>
              <TH className={numCell()}>累计结算</TH>
              <TH className={numCell()}>应付</TH>
              <TH className={numCell()}>已付</TH>
              <TH className="text-center">状态</TH>
              {canManage && <TH className="text-center">操作</TH>}
            </TableRow>
          )}
        >
          {pagedContracts.length === 0 ? (
            <EmptyRow colSpan={11} title="暂无合同" description="点击右上角「新增合同」建立第一条合同" />
          ) : pagedContracts.map(contract => (
            <TableRow key={contract.id} className="hover:bg-muted/40">
              <TableCell className="font-medium">{String(contract.supplier?.name || '')}</TableCell>
              <TableCell className="text-muted-foreground">{contract.contract_no || '-'}</TableCell>
              <TableCell>{String(contract.contract_name || '')}</TableCell>
              <TableCell className="text-center tabular-nums font-medium text-blue-600">{Number(contract.payment_ratio_active || 0)}%</TableCell>
              <TableCell className="text-center tabular-nums">{Number(contract.payment_ratio_complete || 0)}%</TableCell>
              <TableCell className="text-center tabular-nums">{Number(contract.payment_ratio_final || 0)}%</TableCell>
              <TableCell className={numCell("text-primary")}>{formatCurrency(contract.total_settlement)}</TableCell>
              <TableCell className={numCell("font-medium text-orange-600")}>{formatCurrency(contract.total_payable)}</TableCell>
              <TableCell className={numCell("text-green-600")}>{formatCurrency(contract.total_paid)}</TableCell>
              <TableCell className="text-center">
                <Badge variant={contract.contract_status === '履约中' ? 'default' : contract.contract_status === '已完结' ? 'secondary' : 'destructive'}>
                  {String(contract.contract_status || '')}
                </Badge>
              </TableCell>
              {canManage && (
                <TableCell className="text-center">
                  <div className="flex justify-center gap-1">
                    <Button size="sm" variant="ghost" onClick={() => handleEditContract(contract)} aria-label="编辑"><Pencil className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleDeleteContract(contract.id)} aria-label="删除"><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </TableCell>
              )}
            </TableRow>
          ))}
        </DataTable>

        {/* 分页 */}
        <PaginationBar
          page={page}
          pageSize={pageSize}
          total={filteredContracts.length}
          onPageChange={setPage}
        />

        {/* 移动端卡片列表 */}
        <div className="space-y-3 md:hidden">
          {pagedContracts.length === 0 ? (
            <div className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">暂无数据</div>
          ) : pagedContracts.map(contract => (
            <div key={contract.id} className="rounded-lg border bg-card p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{String(contract.contract_name || '')}</p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">{String(contract.supplier?.name || '')} · {contract.contract_no || '-'}</p>
                </div>
                <Badge variant="outline" className="shrink-0">
                  {String(contract.contract_status || '')}
                </Badge>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <p className="text-muted-foreground">付款比例</p>
                  <p className="mt-0.5 font-semibold tabular-nums text-blue-600">{Number(contract.payment_ratio_active || 0)}%</p>
                </div>
                <div>
                  <p className="text-muted-foreground">累计结算</p>
                  <p className="mt-0.5 font-semibold tabular-nums text-primary">{formatCurrency(contract.total_settlement)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">应付</p>
                  <p className="mt-0.5 font-semibold tabular-nums text-orange-600">{formatCurrency(contract.total_payable)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">已付</p>
                  <p className="mt-0.5 font-semibold tabular-nums text-green-600">{formatCurrency(contract.total_paid)}</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span>履约 {Number(contract.payment_ratio_active || 0)}%</span>
                <span>结算 {Number(contract.payment_ratio_complete || 0)}%</span>
                <span>决算 {Number(contract.payment_ratio_final || 0)}%</span>
              </div>
              {canManage && (
                <div className="mt-3 grid grid-cols-2 gap-2 border-t pt-3">
                  <Button size="sm" variant="outline" onClick={() => handleEditContract(contract)}><Pencil className="mr-1 h-4 w-4" />编辑</Button>
                  <Button size="sm" variant="outline" className="text-destructive" onClick={() => handleDeleteContract(contract.id)}><Trash2 className="mr-1 h-4 w-4" />删除</Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 新增/编辑合同对话框 */}
      <Dialog open={contractDialogOpen} onOpenChange={setContractDialogOpen}>
        <DialogContent className="max-h-[90vh] w-[calc(100vw-1.5rem)] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingContract ? '编辑合同' : '新增合同'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <Label>签订日期</Label>
                <Input type="date" value={contractForm.sign_date} onChange={e => setContractForm(prev => ({ ...prev, sign_date: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <Label>有效期至</Label>
                <Input type="date" value={contractForm.expire_date} onChange={e => setContractForm(prev => ({ ...prev, expire_date: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <Label>供应内容</Label>
                <Input value={contractForm.supply_content} onChange={e => setContractForm(prev => ({ ...prev, supply_content: e.target.value }))} className="mt-1" placeholder="供应内容简介" />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <Label>付款比例 (%)</Label>
                <Input type="number" value={contractForm.payment_ratio_active} onChange={e => setContractForm(prev => ({ ...prev, payment_ratio_active: e.target.value }))} className="mt-1" min={0} max={100} />
              </div>
              <div>
                <Label>结算付款比例 (%)</Label>
                <Input type="number" value={contractForm.payment_ratio_complete} onChange={e => setContractForm(prev => ({ ...prev, payment_ratio_complete: e.target.value }))} className="mt-1" min={0} max={100} />
              </div>
              <div>
                <Label>决算付款比例 (%)</Label>
                <Input type="number" value={contractForm.payment_ratio_final} onChange={e => setContractForm(prev => ({ ...prev, payment_ratio_final: e.target.value }))} className="mt-1" min={0} max={100} />
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
