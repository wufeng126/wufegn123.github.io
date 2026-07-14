'use client';
import { useToast } from '@/hooks/use-toast';
import { isSuperAdminUser } from '@/lib/route-permissions';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { 
  Plus, Pencil, Trash2, Search, Download, Building2,
  Phone, FileText, Filter, RefreshCw, DollarSign,
  FileCheck, Clock, Users
} from 'lucide-react';
import { LinkableCell } from '@/components/linkable-cell';

// ============ 类型定义 ============
interface Supplier {
  id: number;
  name: string;
  type: string | null;
  contact_person: string | null;
  phone: string | null;
  remark: string | null;
  created_at: string;
}

interface Contract {
  id: number;
  supplier_id: number;
  project_id?: number | null;
  supplier_name?: string;
  contract_no: string;
  contract_name: string;
  sign_date: string;
  expire_date: string;
  total_amount: number;
  supply_content: string;
  attachment_url: string;
  payment_method: string;
  payment_ratio: number;
  warranty_ratio: number;
  payment_days: number;
  payment_remark: string;
  cumulative_amount: number;
  cumulative_paid: number;
  contract_status: string;
  remark: string;
  created_at: string;
}

interface Project {
  id: number;
  name: string;
}

interface SupplierWithStats extends Supplier {
  contract_count: number;
  signed_contract_count: number;
  pending_contract_count: number;
  contract_status_label: string;
  project_names: string[];
  total_settlement: number;
  total_paid: number;
  total_pending: number;
}

// ============ 工具函数 ============
const formatCurrency = (value: number | null | undefined) => {
  if (value == null) return '¥0.00';
  return `¥${Number(value).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatPercent = (value: number | null | undefined) => {
  if (value == null) return '0%';
  return `${Number(value).toFixed(2)}%`;
};

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return '-';
  return dateStr.split('T')[0];
};

const getSupplierTypeLabel = (type?: string | null) => {
  const value = String(type || '').trim();
  if (value === 'supplier') return '供应商';
  if (value === 'team') return '班组';
  if (value === 'material') return '材料';
  if (value === 'equipment') return '设备';
  if (value === 'labor') return '劳务';
  return value || '未分类';
};

// ============ 主组件 ============
export default function SuppliersPage() {
  const { toast } = useToast();
  // 状态
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierStats, setSupplierStats] = useState<SupplierWithStats[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('suppliers');
  
  // 筛选
  const [searchKeyword, setSearchKeyword] = useState('');
  const [filterSupplier, setFilterSupplier] = useState<string>('all');
  const [filterSupplierType, setFilterSupplierType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  
  // 供应商对话框
  const [supplierDialogOpen, setSupplierDialogOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [editingSupplierId, setEditingSupplierId] = useState<number | null>(null);
  const [supplierForm, setSupplierForm] = useState({
    name: '', type: 'supplier', contact_person: '', phone: '', remark: '',
  });
  
  // 合同对话框
  const [contractDialogOpen, setContractDialogOpen] = useState(false);
  const [editingContract, setEditingContract] = useState<Contract | null>(null);
  const [selectedSupplierId, setSelectedSupplierId] = useState<number | null>(null);
  const [contractForm, setContractForm] = useState({
    project_id: null as number | null,
    contract_no: '', contract_name: '', sign_date: '', expire_date: '',
    total_amount: '', supply_content: '', payment_method: '按进度付款',
    payment_ratio: '', warranty_ratio: '', payment_days: '', payment_remark: '', remark: '',
  });
  
  // 权限判断
  const [user, setUser] = useState<{role: string} | null>(null);
  const canManage = isSuperAdminUser(user?.role) || user?.role === 'admin' || user?.role === '财务' || user?.role === '管理员';

  // 获取用户信息
  const fetchUser = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
      }
    } catch {}
  }, []);

  // 获取供应商统计
  const fetchSupplierStats = useCallback(async () => {
    try {
      const res = await fetch('/api/supplier-contracts/account', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setSupplierStats(data.suppliers || []);
      }
    } catch (e) {
      console.error('Error fetching supplier stats:', e);
    }
  }, []);

  // 获取供应商列表
  const fetchSuppliers = useCallback(async () => {
    try {
      const res = await fetch('/api/suppliers', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setSuppliers(data.suppliers || []);
      }
    } catch {}
  }, []);

  // 获取合同列表
  const fetchContracts = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filterSupplier !== 'all') params.append('supplier_id', filterSupplier);
      if (filterStatus !== 'all') params.append('status', filterStatus);
      const res = await fetch(`/api/supplier-contracts?${params.toString()}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setContracts(data.contracts || []);
      }
    } catch {}
  }, [filterSupplier, filterStatus]);

  // 项目列表
  const [projects, setProjects] = useState<Project[]>([]);

  // 获取项目列表
  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch('/api/projects', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setProjects(data.projects || []);
      }
    } catch {}
  }, []);

  // 初始化加载
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await Promise.all([fetchUser(), fetchSuppliers(), fetchSupplierStats(), fetchContracts(), fetchProjects()]);
      setLoading(false);
    };
    load();
  }, [fetchUser, fetchSuppliers, fetchSupplierStats, fetchContracts, fetchProjects]);

  // 筛选后的数据
  const filteredStats = (supplierStats || []).filter((s) => {
    if (!s) return false;
    const name = String(s.name || '');
    if (searchKeyword && !name.toLowerCase().includes(searchKeyword.toLowerCase())) return false;
    if (filterSupplier !== 'all' && String(s.id) !== filterSupplier) return false;
    if (filterSupplierType !== 'all' && String(s.type || '') !== filterSupplierType) return false;
    return true;
  });

  const filteredContracts = (contracts || []).filter((c) => {
    const contractName = String(c.contract_name || '');
    const supplierName = String(c.supplier_name || '');
    const contractNo = String(c.contract_no || '');
    if (searchKeyword && !contractName.toLowerCase().includes(searchKeyword.toLowerCase()) 
        && !supplierName.toLowerCase().includes(searchKeyword.toLowerCase())
        && !contractNo.toLowerCase().includes(searchKeyword.toLowerCase())) return false;
    return true;
  });

  // 统计汇总
  const totalStats = {
    supplierCount: filteredStats.length,
    signedContractCount: filteredStats.reduce((sum, s) => sum + s.signed_contract_count, 0),
    pendingContractCount: filteredStats.reduce((sum, s) => sum + s.pending_contract_count, 0),
    categoryCount: new Set(filteredStats.map((s) => getSupplierTypeLabel(s.type))).size,
    totalSettlement: filteredStats.reduce((sum, s) => sum + s.total_settlement, 0),
    totalPaid: filteredStats.reduce((sum, s) => sum + s.total_paid, 0),
    totalPending: filteredStats.reduce((sum, s) => sum + s.total_pending, 0),
  };

  const supplierTypeOptions = Array.from(
    new Map(
      supplierStats.map((supplier) => [
        String(supplier.type || '未分类'),
        getSupplierTypeLabel(supplier.type),
      ])
    ).entries()
  );

  const filteredSupplierTypeOptions = Array.from(
    new Map(
      filteredStats.map((supplier) => [
        String(supplier.type || '未分类'),
        getSupplierTypeLabel(supplier.type),
      ])
    ).entries()
  );

  // ============ 供应商操作 ============
  const handleAddSupplier = () => {
    setEditingSupplier(null);
    setEditingSupplierId(null);
    setSupplierForm({ name: '', type: 'supplier', contact_person: '', phone: '', remark: '' });
    setSupplierDialogOpen(true);
  };

  const handleEditSupplier = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setEditingSupplierId(supplier.id);
    setSupplierForm({
      name: supplier.name || '', type: supplier.type || 'supplier', contact_person: supplier.contact_person || '',
      phone: supplier.phone || '', remark: supplier.remark || '',
    });
    setSupplierDialogOpen(true);
  };

  const handleSaveSupplier = async () => {
    if (!supplierForm.name.trim()) { toast({ title: '请输入供应商名称', variant: 'error' }); return; }
    
    console.log('========== 保存供应商 ==========');
    console.log('editingSupplierId:', editingSupplierId, '类型:', typeof editingSupplierId);
    console.log('supplierForm:', supplierForm);
    
    try {
      const url = '/api/suppliers';
      const method = editingSupplierId ? 'PUT' : 'POST';
      const submitData = editingSupplierId
        ? { ...supplierForm, id: editingSupplierId }
        : supplierForm;
      
      console.log('提交数据:', JSON.stringify(submitData));
      console.log('请求方法:', method);
      
      const res = await fetch(url, {
        method, 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submitData), 
        credentials: 'include',
      });
      
      console.log('响应状态:', res.status);
      
      if (res.ok) {
        const result = await res.json();
        console.log('保存成功, API返回:', result);
        
        // 关闭对话框并重置状态
        setSupplierDialogOpen(false);
        setEditingSupplier(null);
        setEditingSupplierId(null);
        setSupplierForm({ name: '', type: 'supplier', contact_person: '', phone: '', remark: '' });
        
        // 强制刷新整个列表和数据 - 解决状态更新问题
        await Promise.all([fetchSuppliers(), fetchSupplierStats()]);
        
        return;
      } else {
        const error = await res.json();
        console.error('保存失败:', error);
        toast({ title: error.error || '操作失败', variant: 'error' });
      }
    } catch (e) { 
      console.error('请求异常:', e);
      toast({ title: '保存失败', variant: 'error' }); 
    }
  };

  const handleDeleteSupplier = async (id: number) => {
    if (!confirm('确定要删除该供应商吗？相关合同也会被删除。')) return;
    try {
      const res = await fetch(`/api/suppliers?ids=${id}`, { method: 'DELETE' });
      if (res.ok) {
        await Promise.all([fetchSuppliers(), fetchSupplierStats(), fetchContracts()]);
      }
    } catch { toast({ title: '删除失败', variant: 'error' }); }
  };

  // ============ 合同操作 ============
  const openAddContractDialog = (supplierId?: number) => {
    setEditingContract(null);
    setSelectedSupplierId(supplierId || null);
    setContractForm({
      project_id: null,
      contract_no: '', contract_name: '', sign_date: '', expire_date: '',
      total_amount: '', supply_content: '', payment_method: '按进度付款',
      payment_ratio: '', warranty_ratio: '', payment_days: '', payment_remark: '', remark: '',
    });
    fetchProjects();
    setContractDialogOpen(true);
  };

  const handleEditContract = (contract: Contract) => {
    setEditingContract(contract);
    setSelectedSupplierId(contract.supplier_id);
    setContractForm({
      project_id: contract.project_id || null,
      contract_no: contract.contract_no || '',
      contract_name: contract.contract_name,
      sign_date: contract.sign_date?.split('T')[0] || '',
      expire_date: contract.expire_date?.split('T')[0] || '',
      total_amount: contract.total_amount?.toString() || '',
      supply_content: contract.supply_content || '',
      payment_method: contract.payment_method || '按进度付款',
      payment_ratio: contract.payment_ratio?.toString() || '',
      warranty_ratio: contract.warranty_ratio?.toString() || '',
      payment_days: contract.payment_days?.toString() || '',
      payment_remark: contract.payment_remark || '',
      remark: contract.remark || '',
    });
    setContractDialogOpen(true);
  };

  const handleSaveContract = async () => {
    if (!selectedSupplierId) { toast({ title: '请选择供应商' }); return; }
    if (!contractForm.contract_name.trim()) { toast({ title: '请输入合同名称', variant: 'error' }); return; }
    if (contractForm.payment_ratio && (Number(contractForm.payment_ratio) < 0 || Number(contractForm.payment_ratio) > 100)) {
      toast({ title: '付款比例必须在0-100之间', variant: 'error' }); return;
    }
    if (contractForm.warranty_ratio && (Number(contractForm.warranty_ratio) < 0 || Number(contractForm.warranty_ratio) > 100)) {
      toast({ title: '质保金比例必须在0-100之间', variant: 'error' }); return;
    }
    try {
      const submitData = {
        supplier_id: selectedSupplierId,
        project_id: contractForm.project_id,
        contract_no: contractForm.contract_no,
        contract_name: contractForm.contract_name,
        sign_date: contractForm.sign_date || null,
        expire_date: contractForm.expire_date || null,
        total_amount: parseFloat(contractForm.total_amount) || 0,
        supply_content: contractForm.supply_content,
        payment_method: contractForm.payment_method,
        payment_ratio: parseFloat(contractForm.payment_ratio) || 0,
        warranty_ratio: parseFloat(contractForm.warranty_ratio) || 0,
        payment_days: parseInt(contractForm.payment_days) || 0,
        payment_remark: contractForm.payment_remark,
        remark: contractForm.remark,
      };
      const url = '/api/supplier-contracts';
      const method = editingContract ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingContract ? { ...submitData, id: editingContract.id } : submitData),
        credentials: 'include',
      });
      if (res.ok) {
        setContractDialogOpen(false);
        await Promise.all([fetchSupplierStats(), fetchContracts()]);
      } else {
        const error = await res.json();
        toast({ title: error.error || '操作失败', variant: 'error' });
      }
    } catch { toast({ title: '保存失败', variant: 'error' }); }
  };

  const handleDeleteContract = async (id: number) => {
    if (!confirm('确定要删除该合同吗？删除后关联的结算单和付款记录也将一并删除。')) return;
    try {
      const res = await fetch(`/api/supplier-contracts/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        await Promise.all([fetchSupplierStats(), fetchContracts()]);
      } else {
        toast({ title: data.error || '删除失败', variant: 'error' });
      }
    } catch { toast({ title: '删除失败，请重试', variant: 'error' }); }
  };

  // 导出
  const handleExport = () => {
    const headers = ['供应商名称', '分类', '联系人', '电话', '合作项目', '合同状态', '累计结算额', '累计付款'];
    const rows = filteredStats.map(s => [
      s.name,
      getSupplierTypeLabel(s.type),
      s.contact_person || '-',
      s.phone || '-',
      (s.project_names || []).join('、') || '-',
      s.contract_status_label || '-',
      formatCurrency(s.total_settlement),
      formatCurrency(s.total_paid)
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `供应商应付台账_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 合同模板下载
  const handleDownloadTemplate = () => {
    const template = '供应商名称,合同编号,合同名称,签订日期,有效期至,合同金额,供应内容,付款方式,付款比例(%),质保金比例(%),账期(天),备注\n示例供应商,HT2024001,材料采购合同,2024-01-01,2025-12-31,500000,钢材供应,按进度付款,80,5,30,';
    const blob = new Blob([template], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '供应商合同导入模板.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return <div className="flex items-center justify-center h-screen"><div className="text-gray-500">加载中...</div></div>;
  }

  return (
    <div className="min-h-screen bg-gray-50/50 p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        {/* 标题 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="h-6 w-6 text-blue-600" />
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-gray-900">供应商管理</h1>
              <p className="text-sm text-gray-500">管理供应商合同、应付账款及资金管控</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => { setLoading(true); Promise.all([fetchSuppliers(), fetchSupplierStats(), fetchContracts()]).finally(() => setLoading(false)); }}>
            <RefreshCw className="w-4 h-4 mr-1" />刷新
          </Button>
        </div>

        {/* 统计卡片 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
          <Card className="border-gray-200 bg-white shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-gray-500">供应商数量</p>
                  <p className="mt-2 text-2xl font-semibold text-gray-900">{totalStats.supplierCount}</p>
                  <p className="mt-1 text-xs text-gray-400">当前筛选范围内供应商总数</p>
                </div>
                <div className="rounded-lg bg-blue-50 p-2">
                  <Building2 className="h-5 w-5 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200 bg-white shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-gray-500">已签合同</p>
                  <p className="mt-2 text-2xl font-semibold text-gray-900">{totalStats.signedContractCount}</p>
                  <p className="mt-1 text-xs text-gray-400">履约中、生效或已完结合同</p>
                </div>
                <div className="rounded-lg bg-emerald-50 p-2">
                  <FileCheck className="h-5 w-5 text-emerald-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200 bg-white shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-gray-500">待签合同</p>
                  <p className="mt-2 text-2xl font-semibold text-gray-900">{totalStats.pendingContractCount}</p>
                  <p className="mt-1 text-xs text-gray-400">草稿、待签或未进入履约的合同</p>
                </div>
                <div className="rounded-lg bg-amber-50 p-2">
                  <Clock className="h-5 w-5 text-amber-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200 bg-white shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-gray-500">供应商分类</p>
                  <p className="mt-2 text-2xl font-semibold text-gray-900">{totalStats.categoryCount}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {filteredSupplierTypeOptions.slice(0, 3).map(([type, label]) => (
                      <Badge key={type} variant="outline" className="border-gray-200 bg-gray-50 text-gray-600">
                        {label}
                      </Badge>
                    ))}
                    {filteredSupplierTypeOptions.length > 3 && (
                      <Badge variant="outline" className="border-gray-200 bg-gray-50 text-gray-600">
                        +{filteredSupplierTypeOptions.length - 3}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="rounded-lg bg-indigo-50 p-2">
                  <Users className="h-5 w-5 text-indigo-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 标签页 - 与数据看板风格统一 */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="flex items-center justify-between mb-4">
            <TabsList className="bg-gray-100">
              <TabsTrigger value="suppliers" className="data-[state=active]:bg-white">供应商台账</TabsTrigger>
              <TabsTrigger value="contracts" className="data-[state=active]:bg-white">合同管理</TabsTrigger>
            </TabsList>
            <div className="flex gap-2">
              {activeTab === 'suppliers' && canManage && (
                <>
                  <Button variant="outline" size="sm" className="border-gray-300" onClick={handleExport}>
                    <Download className="w-4 h-4 mr-1" />导出
                  </Button>
                  <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm" onClick={handleAddSupplier}>
                    <Plus className="w-4 h-4 mr-1" />新增供应商
                  </Button>
                </>
              )}
              {activeTab === 'contracts' && canManage && (
                <>
                  <Button variant="outline" size="sm" className="border-gray-300" onClick={handleDownloadTemplate}>
                    <Download className="w-4 h-4 mr-1" />模板
                  </Button>
                  <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm" onClick={() => openAddContractDialog()}>
                    <Plus className="w-4 h-4 mr-1" />新增合同
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* 供应商台账 */}
          <TabsContent value="suppliers" className="space-y-4">
            {/* 筛选栏 - 简洁清爽风格 */}
            <Card className="border-gray-200">
              <CardContent className="p-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Filter className="w-4 h-4" />
                    <span>筛选条件</span>
                  </div>
                  <Select value={filterSupplier} onValueChange={setFilterSupplier}>
                    <SelectTrigger className="w-36 h-9"><SelectValue placeholder="选择供应商" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部供应商</SelectItem>
                      {supplierStats.map(s => <SelectItem key={s.id} value={String(s.id)}>{String(s.name || '')}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={filterSupplierType} onValueChange={setFilterSupplierType}>
                    <SelectTrigger className="w-32 h-9"><SelectValue placeholder="供应商分类" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部分类</SelectItem>
                      {supplierTypeOptions.map(([type, label]) => (
                        <SelectItem key={type} value={type}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="relative flex-1 min-w-52 max-w-80">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input 
                      placeholder="搜索供应商名称" 
                      value={searchKeyword} 
                      onChange={e => setSearchKeyword(e.target.value)} 
                      className="pl-9 h-9 bg-gray-50 border-gray-200" 
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 表格 - 统一风格 */}
            <Card className="border-gray-200 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50/50 hover:bg-gray-50/50">
                    <TableHead className="font-semibold text-gray-700">供应商名称</TableHead>
                    <TableHead className="font-semibold text-gray-700">分类</TableHead>
                    <TableHead className="font-semibold text-gray-700">联系人</TableHead>
                    <TableHead className="font-semibold text-gray-700">电话</TableHead>
                    <TableHead className="font-semibold text-gray-700">合作项目</TableHead>
                    <TableHead className="text-center font-semibold text-gray-700">合同状态</TableHead>
                    <TableHead className="text-right font-semibold text-gray-700">累计结算额</TableHead>
                    <TableHead className="text-right font-semibold text-gray-700">累计付款</TableHead>
                    <TableHead className="text-center font-semibold text-gray-700">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredStats.length === 0 ? (
                    <TableRow><TableCell colSpan={9} className="text-center py-12 text-gray-400">
                      <div className="flex flex-col items-center gap-2">
                        <Building2 className="w-10 h-10 text-gray-300" />
                        <span>暂无供应商数据</span>
                      </div>
                    </TableCell></TableRow>
                  ) : filteredStats.map((supplier, index: number) => (
                    <TableRow key={supplier.id} className="hover:bg-blue-50/30 transition-colors" style={{ background: index % 2 === 1 ? '#FAFBFD' : 'transparent' }}>
                      <TableCell className="font-medium text-gray-900">
                        <LinkableCell href={`/supplier-expense?tab=settlement&supplier_id=${supplier.id}`}>
                          {String(supplier.name || '')}
                        </LinkableCell>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="border-gray-200 bg-gray-50 text-gray-600">
                          {getSupplierTypeLabel(supplier.type)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-gray-700">{supplier.contact_person || '-'}</TableCell>
                      <TableCell className="text-gray-700">{supplier.phone || '-'}</TableCell>
                      <TableCell className="max-w-[220px] truncate text-gray-700" title={(supplier.project_names || []).join('、')}>
                        {(supplier.project_names || []).join('、') || '-'}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant="outline"
                          className={
                            Number(supplier.pending_contract_count || 0) > 0
                              ? 'border-amber-200 bg-amber-50 text-amber-700'
                              : Number(supplier.signed_contract_count || 0) > 0
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                : 'border-gray-200 bg-gray-50 text-gray-500'
                          }
                        >
                          {supplier.contract_status_label || '暂无合同'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium text-gray-900">{formatCurrency(supplier.total_settlement)}</TableCell>
                      <TableCell className="text-right text-green-600">{formatCurrency(supplier.total_paid)}</TableCell>
                      <TableCell className="text-center">
                        <div className="flex justify-center gap-1">
                          {canManage && <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => openAddContractDialog(supplier.id)}><FileCheck className="w-4 h-4 text-gray-500" /></Button>}
                          {canManage && <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => handleEditSupplier(supplier)}><Pencil className="w-4 h-4 text-blue-600" /></Button>}
                          {canManage && <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => handleDeleteSupplier(supplier.id)}><Trash2 className="w-4 h-4" /></Button>}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          {/* 合同管理 */}
          <TabsContent value="contracts" className="space-y-4">
            {/* 筛选栏 - 简洁清爽风格 */}
            <Card className="border-gray-200">
              <CardContent className="p-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Filter className="w-4 h-4" />
                    <span>筛选条件</span>
                  </div>
                  <Select value={filterSupplier} onValueChange={setFilterSupplier}>
                    <SelectTrigger className="w-36 h-9"><SelectValue placeholder="选择供应商" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部供应商</SelectItem>
                      {suppliers.map(s => <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger className="w-28 h-9"><SelectValue placeholder="状态" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部状态</SelectItem>
                      <SelectItem value="草稿">草稿</SelectItem>
                      <SelectItem value="履约中">履约中</SelectItem>
                      <SelectItem value="生效">生效</SelectItem>
                      <SelectItem value="作废">作废</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="relative flex-1 min-w-52 max-w-80">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input 
                      placeholder="搜索合同名称/编号" 
                      value={searchKeyword} 
                      onChange={e => setSearchKeyword(e.target.value)} 
                      className="pl-9 h-9 bg-gray-50 border-gray-200" 
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 表格 - 统一风格 */}
            <Card className="border-gray-200 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead>供应商</TableHead>
                    <TableHead>合同编号</TableHead>
                    <TableHead>合同名称</TableHead>
                    <TableHead>签订日期</TableHead>
                    <TableHead className="text-right">合同金额</TableHead>
                    <TableHead className="text-right">付款比例</TableHead>
                    <TableHead className="text-right">应付金额</TableHead>
                    <TableHead className="text-center">状态</TableHead>
                    <TableHead className="text-center">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredContracts.length === 0 ? (
                    <TableRow><TableCell colSpan={9} className="text-center py-8 text-gray-500">暂无合同数据</TableCell></TableRow>
                  ) : filteredContracts.map((contract, index: number) => (
                    <TableRow key={contract.id} style={{ background: index % 2 === 1 ? '#FAFBFD' : 'transparent' }}>
                      <TableCell className="font-medium">{String(contract.supplier_name || '')}</TableCell>
                      <TableCell className="text-gray-500">{String(contract.contract_no || '-')}</TableCell>
                      <TableCell>{String(contract.contract_name || '')}</TableCell>
                      <TableCell>{formatDate(contract.sign_date)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(contract.total_amount)}</TableCell>
                      <TableCell className="text-right">
                        <span className={Number(contract.payment_ratio || 0) > 100 ? 'text-red-600 font-medium' : ''}>
                          {formatPercent(contract.payment_ratio)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-medium text-blue-600">
                        {formatCurrency(Number(contract.cumulative_amount || 0) * Number(contract.payment_ratio || 0) / 100)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={contract.contract_status === '履约中' || contract.contract_status === '生效' ? 'default' : contract.contract_status === '作废' ? 'destructive' : 'secondary'}>
                          {String(contract.contract_status || '草稿')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex justify-center gap-1">
                          {canManage && <Button size="sm" variant="ghost" onClick={() => handleEditContract(contract)}><Pencil className="w-4 h-4" /></Button>}
                          {canManage && <Button size="sm" variant="ghost" className="text-red-600" onClick={() => handleDeleteContract(contract.id)}><Trash2 className="w-4 h-4" /></Button>}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* 合同编辑对话框 - 卡片式布局 */}
      <Dialog open={contractDialogOpen} onOpenChange={setContractDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-blue-50">
                <FileCheck className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <DialogTitle>{editingContract ? '编辑合同' : '新增合同'}</DialogTitle>
                <DialogDescription>填写合同信息，付款比例自动计算应付金额</DialogDescription>
              </div>
            </div>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* 供应商和项目选择 - 卡片式 */}
            <Card className="border-gray-200">
              <CardContent className="p-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-gray-700 font-medium">供应商 *</Label>
                    <Select value={selectedSupplierId?.toString() || ''} onValueChange={v => setSelectedSupplierId(parseInt(v))} disabled={!!editingContract}>
                      <SelectTrigger className="mt-2 h-10"><SelectValue placeholder="请选择供应商" /></SelectTrigger>
                      <SelectContent>
                        {suppliers.map(s => <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-gray-700 font-medium">所属项目</Label>
                    <Select value={contractForm.project_id?.toString() || ''} onValueChange={v => setContractForm({...contractForm, project_id: v ? parseInt(v) : null})}>
                      <SelectTrigger className="mt-2 h-10"><SelectValue placeholder="请选择项目（可选）" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">不限项目</SelectItem>
                        {projects.map(p => <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            {/* 合同基本信息 */}
            <Card className="border-gray-200">
              <CardContent className="p-4 space-y-4">
                <div className="flex items-center gap-2 text-gray-700 font-medium border-b pb-2">
                  <FileText className="w-4 h-4" />基本信息
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-gray-600 text-sm">合同编号</Label>
                    <Input value={contractForm.contract_no} onChange={e => setContractForm({...contractForm, contract_no: e.target.value})} className="mt-1 h-10" placeholder="HT2024001" />
                  </div>
                  <div>
                    <Label className="text-gray-600 text-sm">合同名称 <span className="text-red-500">*</span></Label>
                    <Input value={contractForm.contract_name} onChange={e => setContractForm({...contractForm, contract_name: e.target.value})} className="mt-1 h-10" />
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-gray-600 text-sm">签订日期</Label>
                    <Input type="date" value={contractForm.sign_date} onChange={e => setContractForm({...contractForm, sign_date: e.target.value})} className="mt-1 h-10" />
                  </div>
                  <div>
                    <Label className="text-gray-600 text-sm">有效期至</Label>
                    <Input type="date" value={contractForm.expire_date} onChange={e => setContractForm({...contractForm, expire_date: e.target.value})} className="mt-1 h-10" />
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-gray-600 text-sm">合同总金额</Label>
                    <Input type="number" value={contractForm.total_amount} onChange={e => setContractForm({...contractForm, total_amount: e.target.value})} className="mt-1 h-10" placeholder="0.00" />
                  </div>
                  <div>
                    <Label className="text-gray-600 text-sm">付款方式</Label>
                    <Select value={contractForm.payment_method} onValueChange={v => setContractForm({...contractForm, payment_method: v})}>
                      <SelectTrigger className="mt-1 h-10"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="按进度付款">按进度付款</SelectItem>
                        <SelectItem value="按月结算">按月结算</SelectItem>
                        <SelectItem value="预付30%">预付30%</SelectItem>
                        <SelectItem value="货到付款">货到付款</SelectItem>
                        <SelectItem value="验收后付款">验收后付款</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <div>
                  <Label className="text-gray-600 text-sm">供应内容</Label>
                  <Textarea value={contractForm.supply_content} onChange={e => setContractForm({...contractForm, supply_content: e.target.value})} className="mt-1" rows={2} placeholder="材料、设备、服务等供应内容" />
                </div>
              </CardContent>
            </Card>
            
            {/* 财务核心字段 */}
            <Card className="border-blue-200 bg-blue-50/50">
              <CardContent className="p-4 space-y-4">
                <div className="flex items-center gap-2 text-blue-700 font-medium">
                  <DollarSign className="w-4 h-4" />财务管控字段
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label className="text-gray-600 text-sm">约定付款比例(%) <span className="text-red-500">*</span></Label>
                    <Input type="number" min="0" max="100" value={contractForm.payment_ratio} onChange={e => setContractForm({...contractForm, payment_ratio: e.target.value})} className="mt-1 h-10" placeholder="0-100" />
                  </div>
                  <div>
                    <Label className="text-gray-600 text-sm">质保金比例(%)</Label>
                    <Input type="number" min="0" max="100" value={contractForm.warranty_ratio} onChange={e => setContractForm({...contractForm, warranty_ratio: e.target.value})} className="mt-1 h-10" placeholder="0-100" />
                  </div>
                  <div>
                    <Label className="text-gray-600 text-sm">账期天数</Label>
                    <Input type="number" min="0" value={contractForm.payment_days} onChange={e => setContractForm({...contractForm, payment_days: e.target.value})} className="mt-1 h-10" placeholder="天" />
                  </div>
                </div>
                <div>
                  <Label className="text-gray-600 text-sm">特殊付款备注</Label>
                  <Input value={contractForm.payment_remark} onChange={e => setContractForm({...contractForm, payment_remark: e.target.value})} className="mt-1 h-10" placeholder="特殊付款条件说明" />
                </div>
                
                {/* 自动计算预览 */}
                {contractForm.payment_ratio && (
                  <div className="bg-white p-3 rounded-lg border border-blue-100 text-sm">
                    <div className="text-gray-500 mb-2">自动计算预览（基于累计对账金额）</div>
                    <div className="grid grid-cols-2 gap-2 text-gray-600">
                      <span>应付金额 = 对账金额 × {contractForm.payment_ratio}%</span>
                      <span>质保金 = 对账金额 × {contractForm.warranty_ratio || 0}%</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
            
            {/* 备注 */}
            <Card className="border-gray-200">
              <CardContent className="p-4">
                <Label className="text-gray-600 text-sm">备注</Label>
                <Textarea value={contractForm.remark} onChange={e => setContractForm({...contractForm, remark: e.target.value})} className="mt-1" rows={2} />
              </CardContent>
            </Card>
          </div>
          
          {/* 底部按钮 */}
          <div className="flex justify-center gap-3 pt-4 border-t">
            <Button variant="outline" className="w-32" onClick={() => setContractDialogOpen(false)}>取消</Button>
            <Button className="w-32 bg-blue-600 hover:bg-blue-700" onClick={handleSaveContract}>保存合同</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 供应商编辑对话框 - 卡片式布局 */}
      <Dialog open={supplierDialogOpen} onOpenChange={(open) => { setSupplierDialogOpen(open); if (!open) { setEditingSupplier(null); setEditingSupplierId(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-blue-50">
                <Building2 className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <DialogTitle>{editingSupplier ? '编辑供应商' : '新增供应商'}</DialogTitle>
                <DialogDescription>完善供应商基础信息，方便合同管理与账款统计</DialogDescription>
              </div>
            </div>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* 基础信息 */}
            <Card className="border-gray-200">
              <CardContent className="p-4 space-y-4">
                <div className="flex items-center gap-2 text-gray-700 font-medium border-b pb-2">
                  <Building2 className="w-4 h-4" />基础信息
                </div>
                <div>
                  <Label className="text-gray-600 text-sm">供应商名称 <span className="text-red-500">*</span></Label>
                  <Input value={supplierForm.name} onChange={e => setSupplierForm({...supplierForm, name: e.target.value})} className="mt-1 h-10" placeholder="请输入供应商名称" />
                </div>
                <div>
                  <Label className="text-gray-600 text-sm">供应商分类</Label>
                  <Select value={supplierForm.type} onValueChange={value => setSupplierForm({...supplierForm, type: value})}>
                    <SelectTrigger className="mt-1 h-10">
                      <SelectValue placeholder="请选择分类" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="supplier">供应商</SelectItem>
                      <SelectItem value="team">班组</SelectItem>
                      <SelectItem value="material">材料</SelectItem>
                      <SelectItem value="equipment">设备</SelectItem>
                      <SelectItem value="labor">劳务</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
            
            {/* 联系信息 */}
            <Card className="border-gray-200">
              <CardContent className="p-4 space-y-4">
                <div className="flex items-center gap-2 text-gray-700 font-medium border-b pb-2">
                  <Phone className="w-4 h-4" />联系信息
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-gray-600 text-sm">联系人</Label>
                    <Input value={supplierForm.contact_person} onChange={e => setSupplierForm({...supplierForm, contact_person: e.target.value})} className="mt-1 h-10" placeholder="联系人姓名" />
                  </div>
                  <div>
                    <Label className="text-gray-600 text-sm">联系电话</Label>
                    <Input value={supplierForm.phone} onChange={e => setSupplierForm({...supplierForm, phone: e.target.value})} className="mt-1 h-10" placeholder="手机号码" />
                  </div>
                </div>
              </CardContent>
            </Card>
            
            {/* 备注 */}
            <Card className="border-gray-200">
              <CardContent className="p-4">
                <Label className="text-gray-600 text-sm">备注</Label>
                <Textarea value={supplierForm.remark} onChange={e => setSupplierForm({...supplierForm, remark: e.target.value})} className="mt-1" rows={2} placeholder="其他补充说明" />
              </CardContent>
            </Card>
          </div>
          
          {/* 底部按钮 */}
          <div className="flex justify-center gap-3 pt-4 border-t">
            <Button variant="outline" className="w-32" onClick={() => setSupplierDialogOpen(false)}>取消</Button>
            <Button className="w-32 bg-blue-600 hover:bg-blue-700" onClick={handleSaveSupplier}>保存</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
