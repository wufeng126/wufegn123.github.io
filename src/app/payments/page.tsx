'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Download, Plus, Trash2, FileText } from 'lucide-react';

interface Supplier {
  id: number;
  name: string;
  type?: string;
}

interface Project {
  id: number;
  name: string;
}

interface Contract {
  id: number;
  contract_name: string;
  contract_no?: string;
  supplier_id: number;
  supplier_name?: string;
  project_id?: number | null;
  project_name?: string;
}

interface SettlementOption {
  id: number;
  contract_id: number;
  settlement_no: string;
  settlement_type?: string;
  payable_amount?: number;
  settlement_amount?: number;
  status?: string;
}

interface Payment {
  id: number;
  payment_no?: string;
  supplier_id?: number;
  supplier_name?: string;
  project_id?: number | null;
  project_name?: string;
  contract_id: number;
  contract_name?: string;
  payment_amount: number;
  payment_date?: string;
  payment_type?: string;
  payment_method?: string;
  status?: string;
  remark?: string;
  contract?: Contract;
  settlement_id?: number | null;
  settlement?: SettlementOption | null;
}

const PAYMENT_TYPES = [
  { value: 'progress', label: '进度付款' },
  { value: 'final', label: '决算付款' },
  { value: 'warranty', label: '质保金返还' },
];

const PAYMENT_METHODS = [
  { value: '银行转账', label: '银行转账' },
  { value: '现金', label: '现金' },
  { value: '支票', label: '支票' },
  { value: '商业汇票', label: '商业汇票' },
];

const formatCurrency = (value: number | string | null | undefined) => {
  const num = Number(value || 0);
  return `¥${num.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatWan = (value: number | string | null | undefined) => {
  return `${(Number(value || 0) / 10000).toFixed(1)}万`;
};

const formatDate = (value?: string | null) => {
  if (!value) return '-';
  return value.split('T')[0];
};

const getPaymentTypeLabel = (value?: string | null) => {
  return PAYMENT_TYPES.find((item) => item.value === value)?.label || value || '-';
};

const getStatusLabel = (value?: string | null) => {
  if (!value || value === 'completed') return '有效';
  if (value === 'voided') return '已作废';
  return value;
};

const isEffectivePayment = (payment: Payment) => payment.status !== 'voided' && payment.status !== '作废';

const csvCell = (value: string | number | null | undefined) => {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
};

export default function PaymentsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const newPaymentQueryAppliedRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [settlements, setSettlements] = useState<SettlementOption[]>([]);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);

  const [filterProject, setFilterProject] = useState<string>(() => searchParams.get('project_id') || 'all');
  const [filterSupplier, setFilterSupplier] = useState<string>(() => searchParams.get('supplier_id') || 'all');
  const [filterContract, setFilterContract] = useState<string>(() => searchParams.get('contract_id') || 'all');
  const [filterSettlement, setFilterSettlement] = useState<string>(() => searchParams.get('settlement_id') || 'all');
  const [filterType, setFilterType] = useState<string>('all');
  const [searchKeyword, setSearchKeyword] = useState('');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    supplier_id: '',
    contract_id: '',
    settlement_id: '',
    amount: '',
    payment_date: new Date().toISOString().split('T')[0],
    payment_type: 'progress',
    payment_method: '银行转账',
    remark: '',
  });

  const projectNameById = useMemo(() => {
    return new Map(projects.map((project) => [Number(project.id), project.name]));
  }, [projects]);

  const getProjectName = useCallback((payment: Payment) => {
    const projectId = payment.project_id || payment.contract?.project_id;
    if (!projectId) return '-';
    return payment.project_name || payment.contract?.project_name || projectNameById.get(Number(projectId)) || '-';
  }, [projectNameById]);

  const getContractName = (payment: Payment) => {
    return payment.contract?.contract_name || payment.contract_name || '-';
  };

  const availableContracts = useMemo(() => {
    return contracts.filter((contract) => {
      if (filterProject !== 'all' && Number(contract.project_id) !== Number(filterProject)) return false;
      if (filterSupplier !== 'all' && Number(contract.supplier_id) !== Number(filterSupplier)) return false;
      return true;
    });
  }, [contracts, filterProject, filterSupplier]);

  const availableFilterSettlements = useMemo(() => {
    return settlements.filter((settlement) => {
      if (filterContract !== 'all' && Number(settlement.contract_id) !== Number(filterContract)) return false;
      if (filterContract === 'all') {
        const contract = contracts.find((item) => Number(item.id) === Number(settlement.contract_id));
        if (filterProject !== 'all' && Number(contract?.project_id) !== Number(filterProject)) return false;
        if (filterSupplier !== 'all' && Number(contract?.supplier_id) !== Number(filterSupplier)) return false;
      }
      return true;
    });
  }, [contracts, filterContract, filterProject, filterSupplier, settlements]);

  const formContracts = useMemo(() => {
    return contracts.filter((contract) => {
      if (formData.supplier_id && Number(contract.supplier_id) !== Number(formData.supplier_id)) return false;
      return true;
    });
  }, [contracts, formData.supplier_id]);

  const formSettlements = useMemo(() => {
    if (!formData.contract_id) return [];
    return settlements.filter((settlement) => Number(settlement.contract_id) === Number(formData.contract_id));
  }, [settlements, formData.contract_id]);

  const selectedFormSettlement = useMemo(() => {
    if (!formData.settlement_id) return null;
    return settlements.find((settlement) => Number(settlement.id) === Number(formData.settlement_id)) || null;
  }, [formData.settlement_id, settlements]);

  const selectedFormSettlementPaid = useMemo(() => {
    if (!formData.settlement_id) return 0;
    return payments
      .filter((payment) => Number(payment.settlement_id) === Number(formData.settlement_id) && isEffectivePayment(payment))
      .reduce((sum, payment) => sum + Number(payment.payment_amount || 0), 0);
  }, [formData.settlement_id, payments]);

  const selectedFormSettlementRemaining = useMemo(() => {
    if (!selectedFormSettlement) return 0;
    return Math.max(0, Number(selectedFormSettlement.payable_amount || 0) - selectedFormSettlementPaid);
  }, [selectedFormSettlement, selectedFormSettlementPaid]);

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch('/api/projects', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setProjects(data.projects || []);
      }
    } catch (error) {
      console.error(error);
    }
  }, []);

  const fetchSuppliers = useCallback(async () => {
    try {
      const res = await fetch('/api/suppliers', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setSuppliers(data.suppliers || []);
      }
    } catch (error) {
      console.error(error);
    }
  }, []);

  const fetchContracts = useCallback(async () => {
    try {
      const res = await fetch('/api/supplier-contracts', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setContracts(data.contracts || []);
      }
    } catch (error) {
      console.error(error);
    }
  }, []);

  const fetchSettlements = useCallback(async () => {
    try {
      const res = await fetch('/api/supplier-contracts/settlements', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setSettlements(data.settlements || []);
      }
    } catch (error) {
      console.error(error);
    }
  }, []);

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterProject !== 'all') params.set('project_id', filterProject);
      if (filterSupplier !== 'all') params.set('supplier_id', filterSupplier);
      if (filterContract !== 'all') params.set('contract_id', filterContract);
      if (filterSettlement !== 'all') params.set('settlement_id', filterSettlement);
      const res = await fetch(`/api/supplier-contracts/payments?${params}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setPayments(data.payments || []);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [filterProject, filterSupplier, filterContract, filterSettlement]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchProjects();
    fetchSuppliers();
    fetchContracts();
    fetchSettlements();
  }, [fetchProjects, fetchSuppliers, fetchContracts, fetchSettlements]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchPayments();
  }, [fetchPayments]);

  useEffect(() => {
    const targetPaymentId = searchParams.get('payment_id');
    if (!targetPaymentId || selectedPayment) return;
    const target = payments.find((payment) => Number(payment.id) === Number(targetPaymentId));
    if (target) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedPayment(target);
    }
  }, [payments, searchParams, selectedPayment]);

  useEffect(() => {
    if (newPaymentQueryAppliedRef.current || searchParams.get('new') !== '1') return;
    const contractId = searchParams.get('contract_id');
    if (!contractId || contracts.length === 0) return;
    const contract = contracts.find((item) => Number(item.id) === Number(contractId));
    if (!contract) return;

    const settlementId = searchParams.get('settlement_id') || '';
    const settlement = settlementId
      ? settlements.find((item) => Number(item.id) === Number(settlementId))
      : null;

    newPaymentQueryAppliedRef.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFormData({
      supplier_id: String(contract.supplier_id),
      contract_id: String(contract.id),
      settlement_id: settlementId,
      amount: '',
      payment_date: new Date().toISOString().split('T')[0],
      payment_type: settlement?.settlement_type || 'progress',
      payment_method: '閾惰杞处',
      remark: settlement?.settlement_no ? `关联结算单：${settlement.settlement_no}` : '',
    });
    setDialogOpen(true);
  }, [contracts, searchParams, settlements]);

  const filteredData = useMemo(() => {
    return payments.filter((payment) => {
      if (filterType !== 'all' && payment.payment_type !== filterType) return false;
      if (searchKeyword) {
        const keyword = searchKeyword.toLowerCase();
        const fields = [
          payment.payment_no,
          payment.supplier_name,
          getContractName(payment),
          getProjectName(payment),
          payment.settlement?.settlement_no,
          payment.remark,
        ];
        if (!fields.some((field) => String(field || '').toLowerCase().includes(keyword))) return false;
      }
      return true;
    });
  }, [payments, filterType, searchKeyword, getProjectName]);

  const stats = useMemo(() => {
    const effectiveRows = filteredData.filter(isEffectivePayment);
    const total = effectiveRows.reduce((sum, payment) => sum + Number(payment.payment_amount || 0), 0);
    const linkedAmount = effectiveRows
      .filter((payment) => payment.settlement_id)
      .reduce((sum, payment) => sum + Number(payment.payment_amount || 0), 0);
    const thisMonth = new Date().toISOString().slice(0, 7);
    const monthAmount = effectiveRows
      .filter((payment) => formatDate(payment.payment_date).startsWith(thisMonth))
      .reduce((sum, payment) => sum + Number(payment.payment_amount || 0), 0);
    return {
      total,
      count: effectiveRows.length,
      linkedAmount,
      unlinkedAmount: Math.max(0, total - linkedAmount),
      monthAmount,
    };
  }, [filteredData]);

  const resetForm = () => {
    setFormData({
      supplier_id: '',
      contract_id: '',
      settlement_id: '',
      amount: '',
      payment_date: new Date().toISOString().split('T')[0],
      payment_type: 'progress',
      payment_method: '银行转账',
      remark: '',
    });
  };

  const handleContractChange = (contractId: string) => {
    const contract = contracts.find((item) => Number(item.id) === Number(contractId));
    setFormData((prev) => ({
      ...prev,
      contract_id: contractId,
      supplier_id: contract ? String(contract.supplier_id) : prev.supplier_id,
      settlement_id: '',
    }));
  };

  const handleSettlementChange = (settlementId: string) => {
    const settlement = settlements.find((item) => Number(item.id) === Number(settlementId));
    setFormData((prev) => ({
      ...prev,
      settlement_id: settlementId,
      payment_type: settlement?.settlement_type || prev.payment_type,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.contract_id || !formData.amount) {
      toast.error('请填写合同和付款金额');
      return;
    }

    try {
      const res = await fetch('/api/supplier-contracts/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contract_id: Number(formData.contract_id),
          settlement_id: formData.settlement_id ? Number(formData.settlement_id) : null,
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
    } catch {
      toast.error('保存失败');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除此付款记录吗？删除后会影响供应商成本与未付金额统计。')) return;
    try {
      const res = await fetch(`/api/supplier-contracts/payments/${id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('删除成功');
        fetchPayments();
      } else {
        const data = await res.json();
        toast.error(data.error || '删除失败');
      }
    } catch {
      toast.error('删除失败');
    }
  };

  const goToSettlementLedger = useCallback((payment: Payment) => {
    const params = new URLSearchParams();
    params.set('tab', 'settlements');
    const projectId = payment.project_id || payment.contract?.project_id;
    const supplierId = payment.supplier_id || payment.contract?.supplier_id;
    if (projectId) params.set('project_id', String(projectId));
    if (supplierId) params.set('supplier_id', String(supplierId));
    params.set('contract_id', String(payment.contract_id));
    if (payment.settlement_id) params.set('settlement_id', String(payment.settlement_id));
    router.push(`/supplier-expense?${params.toString()}`);
  }, [router]);

  const handleExport = () => {
    const headers = ['项目', '供应商', '合同', '付款单号', '关联结算单', '付款日期', '付款类型', '付款金额', '付款方式', '状态', '备注'];
    const rows = filteredData.map((payment) => [
      getProjectName(payment),
      payment.supplier_name || '',
      getContractName(payment),
      payment.payment_no || '',
      payment.settlement?.settlement_no || '',
      formatDate(payment.payment_date),
      getPaymentTypeLabel(payment.payment_type),
      payment.payment_amount,
      payment.payment_method || '',
      getStatusLabel(payment.status),
      payment.remark || '',
    ]);
    const csv = [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `供应商付款台账_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('导出成功');
  };

  return (
    <div className="container mx-auto space-y-4 px-3 py-4 sm:px-4 md:px-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold">供应商付款台账</h1>
          <p className="mt-1 text-sm text-muted-foreground">按项目、供应商、合同和结算单核对付款记录。</p>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 sm:w-auto sm:flex">
          <Button variant="outline" onClick={handleExport} className="w-full sm:w-auto">
            <Download className="mr-1 h-4 w-4" /> 导出
          </Button>
          <Button onClick={() => setDialogOpen(true)} className="w-full sm:w-auto">
            <Plus className="mr-1 h-4 w-4" /> 新增付款
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        <Card><CardContent className="px-3 pt-3">
          <div className="text-xs text-muted-foreground">付款总额</div>
          <div className="text-xl font-bold text-green-600">{formatWan(stats.total)}</div>
        </CardContent></Card>
        <Card><CardContent className="px-3 pt-3">
          <div className="text-xs text-muted-foreground">付款笔数</div>
          <div className="text-xl font-bold">{stats.count}</div>
        </CardContent></Card>
        <Card><CardContent className="px-3 pt-3">
          <div className="text-xs text-muted-foreground">本月付款</div>
          <div className="text-lg font-bold">{formatWan(stats.monthAmount)}</div>
        </CardContent></Card>
        <Card><CardContent className="px-3 pt-3">
          <div className="text-xs text-muted-foreground">关联结算付款</div>
          <div className="text-lg font-bold text-blue-600">{formatWan(stats.linkedAmount)}</div>
        </CardContent></Card>
        <Card><CardContent className="px-3 pt-3">
          <div className="text-xs text-muted-foreground">未关联结算付款</div>
          <div className="text-lg font-bold text-orange-600">{formatWan(stats.unlinkedAmount)}</div>
        </CardContent></Card>
      </div>

      <Card>
        <CardContent className="px-3 pt-3">
          <div className="grid gap-2 sm:flex sm:flex-wrap">
            <Select value={filterProject} onValueChange={(value) => { setFilterProject(value); setFilterContract('all'); setFilterSettlement('all'); }}>
              <SelectTrigger className="w-full sm:w-[160px]"><SelectValue placeholder="项目" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部项目</SelectItem>
                {projects.map((project) => <SelectItem key={project.id} value={String(project.id)}>{project.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterSupplier} onValueChange={(value) => { setFilterSupplier(value); setFilterContract('all'); setFilterSettlement('all'); }}>
              <SelectTrigger className="w-full sm:w-[150px]"><SelectValue placeholder="供应商" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部供应商</SelectItem>
                {suppliers.map((supplier) => <SelectItem key={supplier.id} value={String(supplier.id)}>{supplier.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterContract} onValueChange={(value) => { setFilterContract(value); setFilterSettlement('all'); }}>
              <SelectTrigger className="w-full sm:w-[180px]"><SelectValue placeholder="合同" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部合同</SelectItem>
                {availableContracts.map((contract) => (
                  <SelectItem key={contract.id} value={String(contract.id)}>{contract.contract_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterSettlement} onValueChange={setFilterSettlement}>
              <SelectTrigger className="w-full sm:w-[180px]"><SelectValue placeholder="关联结算" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部结算单</SelectItem>
                {availableFilterSettlements.map((settlement) => (
                  <SelectItem key={settlement.id} value={String(settlement.id)}>
                    {settlement.settlement_no}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-full sm:w-[130px]"><SelectValue placeholder="付款类型" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部类型</SelectItem>
                {PAYMENT_TYPES.map((type) => <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input
              placeholder="搜索项目/供应商/合同/结算单..."
              value={searchKeyword}
              onChange={(event) => setSearchKeyword(event.target.value)}
              className="min-w-0 flex-1"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="divide-y md:hidden">
            {loading ? (
              <div className="py-8 text-center text-sm text-muted-foreground">加载中...</div>
            ) : filteredData.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">暂无付款记录</div>
            ) : (
              filteredData.map((payment) => (
                <div
                  key={payment.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedPayment(payment)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') setSelectedPayment(payment);
                  }}
                  className="space-y-3 p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{payment.supplier_name || '-'}</p>
                      <p className="mt-1 truncate text-xs text-muted-foreground">{getProjectName(payment)} / {getContractName(payment)}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-bold text-green-600">{formatCurrency(payment.payment_amount)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{formatDate(payment.payment_date)}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-md bg-muted/50 p-2">
                      <p className="text-muted-foreground">付款类型</p>
                      <Badge variant={payment.payment_type === 'progress' ? 'default' : payment.payment_type === 'final' ? 'secondary' : 'outline'} className="mt-1">
                        {getPaymentTypeLabel(payment.payment_type)}
                      </Badge>
                    </div>
                    <div className="rounded-md bg-muted/50 p-2">
                      <p className="text-muted-foreground">关联结算</p>
                      <p className="mt-1 truncate font-medium">{payment.settlement?.settlement_no || '未关联'}</p>
                    </div>
                  </div>
                  {payment.remark && <p className="line-clamp-2 text-xs text-muted-foreground">{payment.remark}</p>}
                  <div className="flex justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(event) => { event.stopPropagation(); handleDelete(payment.id); }}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <Table className="min-w-[1100px]">
              <TableHeader>
                <TableRow>
                  <TableHead>付款单号</TableHead>
                  <TableHead>项目</TableHead>
                  <TableHead>供应商 / 合同</TableHead>
                  <TableHead>关联结算</TableHead>
                  <TableHead>付款日期</TableHead>
                  <TableHead>类型</TableHead>
                  <TableHead className="text-right">付款金额</TableHead>
                  <TableHead>方式</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="text-center">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={10} className="py-8 text-center">加载中...</TableCell></TableRow>
                ) : filteredData.length === 0 ? (
                  <TableRow><TableCell colSpan={10} className="py-8 text-center">暂无付款记录</TableCell></TableRow>
                ) : (
                  filteredData.map((payment) => (
                    <TableRow key={payment.id} className="cursor-pointer hover:bg-muted/40" onClick={() => setSelectedPayment(payment)}>
                      <TableCell className="font-mono text-xs">{payment.payment_no || '-'}</TableCell>
                      <TableCell className="max-w-[160px] truncate" title={getProjectName(payment)}>{getProjectName(payment)}</TableCell>
                      <TableCell className="max-w-[240px]">
                        <div className="truncate font-medium" title={payment.supplier_name}>{payment.supplier_name || '-'}</div>
                        <div className="truncate text-xs text-muted-foreground" title={getContractName(payment)}>{getContractName(payment)}</div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{payment.settlement?.settlement_no || '未关联'}</TableCell>
                      <TableCell>{formatDate(payment.payment_date)}</TableCell>
                      <TableCell>
                        <Badge variant={payment.payment_type === 'progress' ? 'default' : payment.payment_type === 'final' ? 'secondary' : 'outline'}>
                          {getPaymentTypeLabel(payment.payment_type)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-bold text-green-600">{formatCurrency(payment.payment_amount)}</TableCell>
                      <TableCell>{payment.payment_method || '-'}</TableCell>
                      <TableCell>
                        <Badge variant={payment.status === 'voided' ? 'outline' : 'default'}>{getStatusLabel(payment.status)}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Button variant="ghost" size="sm" onClick={(event) => { event.stopPropagation(); setSelectedPayment(payment); }}>
                          <FileText className="h-4 w-4 text-blue-600" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={(event) => { event.stopPropagation(); handleDelete(payment.id); }} className="text-red-600 hover:text-red-700">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!selectedPayment} onOpenChange={(open) => { if (!open) setSelectedPayment(null); }}>
        <DialogContent className="max-h-[90vh] w-[calc(100vw-1.5rem)] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>付款详情核对</DialogTitle>
          </DialogHeader>
          {selectedPayment && (
            <div className="space-y-5">
              <div className="rounded-lg border border-gray-100 bg-gray-50/70 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-semibold">{selectedPayment.payment_no || '-'}</span>
                      <Badge variant={selectedPayment.status === 'voided' ? 'outline' : 'default'}>{getStatusLabel(selectedPayment.status)}</Badge>
                      <Badge variant={selectedPayment.payment_type === 'progress' ? 'default' : selectedPayment.payment_type === 'final' ? 'secondary' : 'outline'}>
                        {getPaymentTypeLabel(selectedPayment.payment_type)}
                      </Badge>
                    </div>
                    <div className="mt-2 text-sm text-gray-600">
                      {getProjectName(selectedPayment)} / {selectedPayment.supplier_name || '-'}
                    </div>
                    <div className="mt-1 truncate text-sm text-gray-500">{getContractName(selectedPayment)}</div>
                  </div>
                  <div className="text-sm text-gray-500">
                    付款日期：<span className="font-medium text-gray-900">{formatDate(selectedPayment.payment_date)}</span>
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <Button type="button" variant="outline" size="sm" onClick={() => goToSettlementLedger(selectedPayment)}>
                  查看关联结算
                </Button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg border border-gray-100 p-3">
                  <div className="text-xs text-muted-foreground">付款金额</div>
                  <div className="mt-1 text-base font-semibold text-green-600">{formatCurrency(selectedPayment.payment_amount)}</div>
                </div>
                <div className="rounded-lg border border-gray-100 p-3">
                  <div className="text-xs text-muted-foreground">付款方式</div>
                  <div className="mt-1 text-base font-semibold">{selectedPayment.payment_method || '-'}</div>
                </div>
                <div className="rounded-lg border border-gray-100 p-3">
                  <div className="text-xs text-muted-foreground">关联结算单</div>
                  <div className="mt-1 text-base font-semibold">{selectedPayment.settlement?.settlement_no || '未关联'}</div>
                </div>
                <div className="rounded-lg border border-gray-100 p-3">
                  <div className="text-xs text-muted-foreground">关联结算应付</div>
                  <div className="mt-1 text-base font-semibold text-blue-600">{formatCurrency(selectedPayment.settlement?.payable_amount)}</div>
                </div>
              </div>

              {selectedPayment.remark && (
                <div className="rounded-lg border border-gray-100 p-3 text-sm text-gray-600">
                  <div className="mb-1 text-xs text-muted-foreground">备注</div>
                  {selectedPayment.remark}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] w-[calc(100vw-1.5rem)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>新增付款记录</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>供应商 <span className="text-red-500">*</span></Label>
              <Select value={formData.supplier_id} onValueChange={(value) => setFormData((prev) => ({ ...prev, supplier_id: value, contract_id: '', settlement_id: '' }))}>
                <SelectTrigger><SelectValue placeholder="请选择供应商" /></SelectTrigger>
                <SelectContent>
                  {suppliers.map((supplier) => <SelectItem key={supplier.id} value={String(supplier.id)}>{supplier.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>对应合同 <span className="text-red-500">*</span></Label>
              <Select value={formData.contract_id} onValueChange={handleContractChange} disabled={!formData.supplier_id}>
                <SelectTrigger><SelectValue placeholder={formData.supplier_id ? '请选择合同' : '请先选择供应商'} /></SelectTrigger>
                <SelectContent>
                  {formContracts.map((contract) => (
                    <SelectItem key={contract.id} value={String(contract.id)}>
                      {contract.contract_name} {contract.contract_no && `(${contract.contract_no})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedFormSettlement && (
                <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-3 text-sm">
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <div className="text-xs text-muted-foreground">结算应付</div>
                      <div className="mt-1 font-semibold text-blue-700">{formatCurrency(selectedFormSettlement.payable_amount)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">已登记付款</div>
                      <div className="mt-1 font-semibold text-green-700">{formatCurrency(selectedFormSettlementPaid)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">剩余未付</div>
                      <div className="mt-1 font-semibold text-orange-700">{formatCurrency(selectedFormSettlementRemaining)}</div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-xs text-muted-foreground">付款金额仍需按实际付款录入，系统会继续做超付校验。</div>
                    {selectedFormSettlementRemaining > 0 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="bg-white"
                        onClick={() => setFormData((prev) => ({ ...prev, amount: String(selectedFormSettlementRemaining) }))}
                      >
                        填入剩余未付
                      </Button>
                    )}
                  </div>
                  {Number(formData.amount || 0) > selectedFormSettlementRemaining && selectedFormSettlementRemaining > 0 && (
                    <div className="mt-2 rounded-md border border-orange-200 bg-orange-50 px-2 py-1 text-xs text-orange-700">
                      当前付款金额大于该结算单剩余未付，请核对是否存在重复付款。
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>关联结算单</Label>
              <Select value={formData.settlement_id || 'none'} onValueChange={(value) => handleSettlementChange(value === 'none' ? '' : value)} disabled={!formData.contract_id}>
                <SelectTrigger><SelectValue placeholder={formData.contract_id ? '可选，选择对应结算单' : '请先选择合同'} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">不关联结算单</SelectItem>
                  {formSettlements.map((settlement) => (
                    <SelectItem key={settlement.id} value={String(settlement.id)}>
                      {settlement.settlement_no} / {getPaymentTypeLabel(settlement.settlement_type)} / {formatCurrency(settlement.payable_amount)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>付款日期</Label>
                <Input type="date" value={formData.payment_date} onChange={(event) => setFormData((prev) => ({ ...prev, payment_date: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>付款金额 <span className="text-red-500">*</span></Label>
                <Input type="number" placeholder="0.00" value={formData.amount} onChange={(event) => setFormData((prev) => ({ ...prev, amount: event.target.value }))} />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>付款类型</Label>
                <Select value={formData.payment_type} onValueChange={(value) => setFormData((prev) => ({ ...prev, payment_type: value }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_TYPES.map((type) => <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>付款方式</Label>
                <Select value={formData.payment_method} onValueChange={(value) => setFormData((prev) => ({ ...prev, payment_method: value }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map((method) => <SelectItem key={method.value} value={method.value}>{method.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>备注</Label>
              <Textarea
                placeholder="可填写付款说明、银行流水号等"
                value={formData.remark}
                onChange={(event) => setFormData((prev) => ({ ...prev, remark: event.target.value }))}
              />
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
