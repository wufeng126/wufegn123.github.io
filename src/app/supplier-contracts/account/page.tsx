'use client';

import { useState, useEffect } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Search, Plus, Edit, Trash2, FileText } from 'lucide-react';

interface Supplier {
  id: number;
  name: string;
  type: string;
  contact: string;
  phone: string;
  has_contract: boolean;
  created_at: string;
}

interface Contract {
  id: number;
  supplier_id: number;
  project_id: number;
  contract_name: string;
  contract_no: string;
  total_amount: number;
  payment_ratio_active: number; // 进度付款比例（财务管控）
  payment_ratio_complete: number; // 总结算付款比例
  payment_ratio_final: number; // 决算比例（财务管控）

  locked: boolean;
  sign_date: string;
  expire_date: string;
  
  // 结算汇总字段
  total_settlement_amount?: number; // 累计结算金额
  total_payable_amount?: number; // 履约应付金额
  total_final_payable_amount?: number; // 决算应付金额
  total_paid_amount?: number; // 已付金额
  progress_pending_amount?: number; // 进度未付
  final_pending_amount?: number; // 决算未付
  has_final_settlement?: boolean; // 是否有决算
}

export default function SupplierRosterPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [projects, setProjects] = useState<{ id: number; name: string }[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>('all');
  const [activeTab, setActiveTab] = useState('suppliers');
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [contractsLoading, setContractsLoading] = useState(false);

  // Dialog states
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    type: 'supplier',
    contact: '',
    phone: '',
    remark: '',
  });

  // Contract Dialog states
  const [contractDialogOpen, setContractDialogOpen] = useState(false);
  const [contractEditId, setContractEditId] = useState<number | null>(null);
  const [contractForm, setContractForm] = useState({
    supplier_id: '',
    project_id: '',
    contract_name: '',
    contract_no: '',
    total_amount: '',
    payment_ratio_active: '',
    payment_ratio_complete: '',
    payment_ratio_final: '', // 决算比例

    sign_date: '',
    expire_date: '',
  });

  // Contract filter states
  const [filterProject, setFilterProject] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [contractSearch, setContractSearch] = useState('');

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    loadSuppliers();
  }, [selectedProject]);

  useEffect(() => {
    loadContracts();
  }, []);

  const loadProjects = async () => {
    try {
      const res = await fetch('/api/projects');
      if (res.ok) {
        const data = await res.json();
        setProjects(data.projects || []);
      }
    } catch (error) {
      console.error('Failed to load projects:', error);
    }
  };

  const loadSuppliers = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/suppliers');
      if (res.ok) {
        const data = await res.json();
        const supplierList = (data.suppliers || []).map((s: any) => ({
          ...s,
          has_contract: s.has_contract || false,
        }));
        setSuppliers(supplierList);
      }
    } catch (error) {
      console.error('Failed to load suppliers:', error);
    }
    setLoading(false);
  };

  const loadContracts = async () => {
    setContractsLoading(true);
    try {
      const res = await fetch('/api/supplier-contracts');
      if (res.ok) {
        const data = await res.json();
        const contractsData = data.contracts || [];
        
        // 获取每个合同的结算汇总
        const contractsWithSettlement = await Promise.all(
          contractsData.map(async (contract: Contract) => {
            try {
              const settlementRes = await fetch(`/api/supplier-contracts/settlements/summary?contract_id=${contract.id}`);
              if (settlementRes.ok) {
                const settlementData = await settlementRes.json();
                return {
                  ...contract,
                  total_settlement_amount: settlementData.summary?.totalAmount || 0,
                  total_payable_amount: settlementData.summary?.totalPayable || 0,
                  total_final_payable_amount: settlementData.summary?.totalFinalPayable || 0,
                  total_paid_amount: settlementData.summary?.totalPaid || 0,
                  progress_pending_amount: settlementData.summary?.totalProgressPending || 0,
                  final_pending_amount: settlementData.summary?.totalFinalPending || 0,
                  has_final_settlement: settlementData.summary?.hasFinalSettlement || false,
                };
              }
            } catch (e) {
              console.error('Failed to load settlement for contract', contract.id, e);
            }
            return contract;
          })
        );
        
        setContracts(contractsWithSettlement);
      }
    } catch (error) {
      console.error('Failed to load contracts:', error);
    }
    setContractsLoading(false);
  };

  const filteredSuppliers = suppliers.filter(s => {
    const matchesSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (s.contact || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === 'all' || s.type === filterType;
    return matchesSearch && matchesType;
  });

  const filteredContracts = contracts.filter(c => {
    const supplier = suppliers.find(s => s.id === c.supplier_id);
    const project = projects.find(p => p.id === c.project_id);
    const matchesProject = filterProject === 'all' || String(c.project_id) === filterProject;
    const matchesStatus = filterStatus === 'all' || 
      (filterStatus === 'active' && !c.locked) ||
      (filterStatus === 'locked' && c.locked);
    const matchesSearch = contractSearch === '' ||
      (c.contract_name || '').toLowerCase().includes(contractSearch.toLowerCase()) ||
      (c.contract_no || '').toLowerCase().includes(contractSearch.toLowerCase()) ||
      (supplier?.name || '').toLowerCase().includes(contractSearch.toLowerCase());
    return matchesProject && matchesStatus && matchesSearch;
  });

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error('请输入供应商名称');
      return;
    }

    const method = editId ? 'PUT' : 'POST';
    const url = editId ? `/api/suppliers?id=${editId}` : '/api/suppliers';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        toast.success(editId ? '供应商已更新' : '供应商已创建');
        setDialogOpen(false);
        loadSuppliers();
      } else {
        toast.error('保存失败');
      }
    } catch (error) {
      toast.error('保存失败');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除该供应商吗？')) return;

    try {
      const res = await fetch(`/api/suppliers?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('供应商已删除');
        loadSuppliers();
      } else {
        toast.error('删除失败');
      }
    } catch (error) {
      toast.error('删除失败');
    }
  };

  const openEditDialog = (supplier?: Supplier) => {
    if (supplier) {
      setEditId(supplier.id);
      setFormData({
        name: supplier.name,
        type: supplier.type,
        contact: supplier.contact || '',
        phone: supplier.phone || '',
        remark: '',
      });
    } else {
      setEditId(null);
      setFormData({
        name: '',
        type: 'supplier',
        contact: '',
        phone: '',
        remark: '',
      });
    }
    setDialogOpen(true);
  };

  const openContractDialog = (supplierId?: number, contract?: Contract) => {
    if (contract) {
      setContractEditId(contract.id);
      setContractForm({
        supplier_id: String(contract.supplier_id),
        project_id: contract.project_id ? String(contract.project_id) : '',
        contract_name: contract.contract_name || '',
        contract_no: contract.contract_no || '',
        total_amount: contract.total_amount ? String(contract.total_amount) : '',
        payment_ratio_active: contract.payment_ratio_active ? String(contract.payment_ratio_active) : '',
        payment_ratio_complete: contract.payment_ratio_complete ? String(contract.payment_ratio_complete) : '',
        payment_ratio_final: (contract as any).payment_ratio_final ? String((contract as any).payment_ratio_final) : '',
        sign_date: contract.sign_date ? contract.sign_date.split('T')[0] : '',
        expire_date: contract.expire_date ? contract.expire_date.split('T')[0] : '',
      });
    } else {
      setContractEditId(null);
      setContractForm({
        supplier_id: supplierId ? String(supplierId) : '',
        project_id: '',
        contract_name: '',
        contract_no: '',
        total_amount: '',
        payment_ratio_active: '',
        payment_ratio_complete: '',
        payment_ratio_final: '',
    
        sign_date: '',
        expire_date: '',
      });
    }
    setContractDialogOpen(true);
  };

  const handleSaveContract = async () => {
    if (!contractForm.supplier_id) {
      toast.error('请选择供应商');
      return;
    }
    if (!contractForm.contract_name.trim()) {
      toast.error('请输入合同名称');
      return;
    }

    const submitData = {
      supplier_id: parseInt(contractForm.supplier_id),
      project_id: contractForm.project_id ? parseInt(contractForm.project_id) : null,
      contract_name: contractForm.contract_name,
      contract_no: contractForm.contract_no,
      total_amount: contractForm.total_amount ? parseFloat(contractForm.total_amount) : null,
      payment_ratio_active: contractForm.payment_ratio_active ? parseFloat(contractForm.payment_ratio_active) : 0,
      payment_ratio_complete: contractForm.payment_ratio_complete ? parseFloat(contractForm.payment_ratio_complete) : 0,
      payment_ratio_final: contractForm.payment_ratio_final ? parseFloat(contractForm.payment_ratio_final) : 0,
      sign_date: contractForm.sign_date || null,
      expire_date: contractForm.expire_date || null,
    };

    const method = contractEditId ? 'PUT' : 'POST';
    const url = contractEditId ? `/api/supplier-contracts/${contractEditId}` : '/api/supplier-contracts';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submitData),
      });

      if (res.ok) {
        toast.success(contractEditId ? '合同已更新' : '合同已创建');
        setContractDialogOpen(false);
        loadContracts();
        loadSuppliers();
      } else {
        const data = await res.json();
        toast.error(data.error || '保存失败');
      }
    } catch (error) {
      toast.error('保存失败');
    }
  };

  const handleDeleteContract = async (id: number) => {
    if (!confirm('确定要删除该合同吗？删除后关联的结算单和付款记录也将一并删除。')) return;

    try {
      const res = await fetch(`/api/supplier-contracts/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        toast.success('合同已删除');
        loadContracts();
        loadSuppliers();
      } else {
        toast.error(data.error || '删除失败');
      }
    } catch (error) {
      toast.error('删除失败，请重试');
    }
  };

  const getSupplierContracts = (supplierId: number) => {
    return contracts.filter(c => c.supplier_id === supplierId);
  };

  const stats = {
    total: suppliers.length,
    withContract: suppliers.filter(s => s.has_contract).length,
    withoutContract: suppliers.filter(s => !s.has_contract).length,
    supplierCount: suppliers.filter(s => s.type === 'supplier').length,
    teamCount: suppliers.filter(s => s.type === 'team').length,
  };

  return (
    <div className="container mx-auto px-3 py-4 sm:p-4 md:p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight mb-2">供应商库</h1>
        <p className="text-muted-foreground">管理供应商和班组基础信息</p>
      </div>

      {/* Stats */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Card>
          <CardContent className="p-3">
            <div className="text-2xl font-bold">{stats.total}</div>
            <div className="text-xs text-muted-foreground">供应商总数</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-2xl font-bold">{stats.withContract}</div>
            <div className="text-xs text-muted-foreground">已签合同</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-2xl font-bold">{stats.withoutContract}</div>
            <div className="text-xs text-muted-foreground">待签合同</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-2xl font-bold">{stats.supplierCount}</div>
            <div className="text-xs text-muted-foreground">供应商</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-2xl font-bold">{stats.teamCount}</div>
            <div className="text-xs text-muted-foreground">班组</div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-4">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="suppliers">供应商列表</TabsTrigger>
          <TabsTrigger value="contracts">合同台账</TabsTrigger>
        </TabsList>

        {/* Suppliers Tab */}
        <TabsContent value="suppliers" className="space-y-4">
          {/* Filters */}
          <div className="flex flex-col md:flex-row gap-3 mb-4">
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-full md:w-40">
                <SelectValue placeholder="供应商类型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部类型</SelectItem>
                <SelectItem value="supplier">供应商</SelectItem>
                <SelectItem value="team">班组</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="搜索供应商名称..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button onClick={() => openEditDialog()} className="w-full bg-blue-600 hover:bg-blue-700 md:w-auto">
                <Plus className="w-4 h-4 mr-1" /> 新增供应商
              </Button>
          </div>

          {/* Table */}
          <Card>
            <CardContent className="p-0">
              <Table className="hidden md:table">
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[120px]">供应商名称</TableHead>
                    <TableHead className="min-w-[80px]">类型</TableHead>
                    <TableHead className="min-w-[100px]">联系人</TableHead>
                    <TableHead className="min-w-[120px]">联系电话</TableHead>
                    <TableHead className="min-w-[100px]">合同状态</TableHead>
                    <TableHead className="min-w-[120px] text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8">加载中...</TableCell>
                    </TableRow>
                  ) : filteredSuppliers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        暂无供应商数据
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredSuppliers.map((supplier) => (
                      <TableRow key={supplier.id}>
                        <TableCell className="font-medium">{supplier.name}</TableCell>
                        <TableCell>
                          <Badge variant={supplier.type === 'supplier' ? 'default' : 'secondary'}>
                            {supplier.type === 'supplier' ? '供应商' : '班组'}
                          </Badge>
                        </TableCell>
                        <TableCell>{supplier.contact || '-'}</TableCell>
                        <TableCell>{supplier.phone || '-'}</TableCell>
                        <TableCell>
                          {supplier.has_contract ? (
                            <Badge className="bg-green-100 text-green-800">已签合同</Badge>
                          ) : (
                            <Badge className="bg-orange-100 text-orange-700 border-orange-200">待签合同</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="ghost" onClick={() => openEditDialog(supplier)}>
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => handleDelete(supplier.id)} className="text-red-600">
                              <Trash2 className="w-4 h-4" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => openContractDialog(supplier.id)} title="查看合同">
                              <FileText className="w-4 h-4 text-blue-600" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              <div className="space-y-3 p-3 md:hidden">
                {loading ? (
                  <div className="rounded-lg border border-gray-100 py-8 text-center text-sm text-muted-foreground">加载中...</div>
                ) : filteredSuppliers.length === 0 ? (
                  <div className="rounded-lg border border-gray-100 py-8 text-center text-sm text-muted-foreground">暂无供应商数据</div>
                ) : filteredSuppliers.map((supplier) => (
                  <article key={supplier.id} className="rounded-lg border border-gray-100 bg-white p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-gray-900">{supplier.name}</p>
                        <p className="mt-1 truncate text-xs text-muted-foreground">{supplier.contact || '-'} / {supplier.phone || '-'}</p>
                      </div>
                      <Badge variant={supplier.type === 'supplier' ? 'default' : 'secondary'} className="shrink-0">
                        {supplier.type === 'supplier' ? '供应商' : '班组'}
                      </Badge>
                    </div>
                    <div className="mt-3 flex items-center justify-between rounded-md bg-gray-50 px-3 py-2 text-xs">
                      <span className="text-muted-foreground">合同状态</span>
                      {supplier.has_contract ? (
                        <Badge className="bg-green-100 text-green-800">已签合同</Badge>
                      ) : (
                        <Badge className="border-orange-200 bg-orange-100 text-orange-700">待签合同</Badge>
                      )}
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 border-t border-gray-100 pt-3">
                      <Button size="sm" variant="outline" onClick={() => openEditDialog(supplier)} className="px-0">
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => openContractDialog(supplier.id)} className="px-0">
                        <FileText className="h-4 w-4 text-blue-600" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleDelete(supplier.id)} className="px-0 text-red-600">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Contracts Tab */}
        <TabsContent value="contracts" className="space-y-4">
          {/* Filters */}
          <div className="flex flex-col md:flex-row gap-3 mb-4">
            <Select value={filterProject} onValueChange={setFilterProject}>
              <SelectTrigger className="w-full md:w-40">
                <SelectValue placeholder="选择项目" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部项目</SelectItem>
                {projects.map(p => (
                  <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-full md:w-32">
                <SelectValue placeholder="合同状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="active">履约中</SelectItem>
                <SelectItem value="locked">已完结</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="搜索合同名称/编号/供应商..."
                value={contractSearch}
                onChange={(e) => setContractSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button onClick={() => openContractDialog()} className="w-full bg-blue-600 hover:bg-blue-700 md:w-auto">
              <Plus className="w-4 h-4 mr-1" /> 新增合同
            </Button>
          </div>

          {/* Table */}
          <Card>
            <CardContent className="p-0">
              <Table className="hidden md:table">
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[120px]">供应商</TableHead>
                    <TableHead className="min-w-[120px]">项目</TableHead>
                    <TableHead className="min-w-[150px]">合同名称</TableHead>
                    <TableHead className="min-w-[100px] text-right">累计结算金额</TableHead>
                    <TableHead className="min-w-[100px] text-right">履约应付金额</TableHead>
                    <TableHead className="min-w-[100px] text-right">决算应付金额</TableHead>
                    <TableHead className="min-w-[100px] text-right">已付金额</TableHead>
                    <TableHead className="min-w-[100px] text-right">进度未付</TableHead>
                    <TableHead className="min-w-[100px] text-right">决算未付</TableHead>
                    <TableHead className="min-w-[80px]">状态</TableHead>
                    <TableHead className="min-w-[80px] text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contractsLoading ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8">加载中...</TableCell>
                    </TableRow>
                  ) : filteredContracts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                        暂无合同数据
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredContracts.map((contract) => {
                      const supplier = suppliers.find(s => s.id === contract.supplier_id);
                      const project = projects.find(p => p.id === contract.project_id);
                      return (
                        <TableRow key={contract.id}>
                          <TableCell className="font-medium">{supplier?.name || '-'}</TableCell>
                          <TableCell>{project?.name || '-'}</TableCell>
                          <TableCell>{contract.contract_name || '-'}</TableCell>
                          <TableCell className="text-right text-blue-600">
                            ¥{Number(contract.total_settlement_amount || 0).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right">
                            ¥{Number(contract.total_payable_amount || 0).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right text-purple-600">
                            ¥{Number(contract.total_final_payable_amount || 0).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right text-green-600">
                            ¥{Number(contract.total_paid_amount || 0).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right text-orange-600">
                            ¥{Number(contract.progress_pending_amount || 0).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right text-red-600">
                            ¥{Number(contract.final_pending_amount || 0).toLocaleString()}
                          </TableCell>
                          <TableCell>
                            {contract.has_final_settlement ? (
                              <Badge variant="secondary">已决算</Badge>
                            ) : contract.locked ? (
                              <Badge variant="secondary">已完结</Badge>
                            ) : (
                              <Badge className="bg-green-100 text-green-800">履约中</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button size="sm" variant="ghost" onClick={() => openContractDialog(undefined, contract)}>
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => handleDeleteContract(contract.id)} className="text-red-600">
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
              <div className="space-y-3 p-3 md:hidden">
                {contractsLoading ? (
                  <div className="rounded-lg border border-gray-100 py-8 text-center text-sm text-muted-foreground">加载中...</div>
                ) : filteredContracts.length === 0 ? (
                  <div className="rounded-lg border border-gray-100 py-8 text-center text-sm text-muted-foreground">暂无合同数据</div>
                ) : filteredContracts.map((contract) => {
                  const supplier = suppliers.find(s => s.id === contract.supplier_id);
                  const project = projects.find(p => p.id === contract.project_id);
                  return (
                    <article key={contract.id} className="rounded-lg border border-gray-100 bg-white p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-gray-900">{contract.contract_name || '-'}</p>
                          <p className="mt-1 truncate text-xs text-muted-foreground">{supplier?.name || '-'} / {project?.name || '-'}</p>
                        </div>
                        {contract.has_final_settlement ? (
                          <Badge variant="secondary" className="shrink-0">已决算</Badge>
                        ) : contract.locked ? (
                          <Badge variant="secondary" className="shrink-0">已完结</Badge>
                        ) : (
                          <Badge className="shrink-0 bg-green-100 text-green-800">履约中</Badge>
                        )}
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded-md bg-gray-50 p-2">
                          <p className="text-muted-foreground">累计结算</p>
                          <p className="mt-1 font-semibold text-blue-600">¥{Number(contract.total_settlement_amount || 0).toLocaleString()}</p>
                        </div>
                        <div className="rounded-md bg-gray-50 p-2">
                          <p className="text-muted-foreground">已付金额</p>
                          <p className="mt-1 font-semibold text-green-600">¥{Number(contract.total_paid_amount || 0).toLocaleString()}</p>
                        </div>
                        <div className="rounded-md bg-gray-50 p-2">
                          <p className="text-muted-foreground">进度未付</p>
                          <p className="mt-1 font-semibold text-orange-600">¥{Number(contract.progress_pending_amount || 0).toLocaleString()}</p>
                        </div>
                        <div className="rounded-md bg-gray-50 p-2">
                          <p className="text-muted-foreground">决算未付</p>
                          <p className="mt-1 font-semibold text-red-600">¥{Number(contract.final_pending_amount || 0).toLocaleString()}</p>
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-gray-100 pt-3">
                        <Button size="sm" variant="outline" onClick={() => openContractDialog(undefined, contract)}>
                          <Edit className="mr-1 h-4 w-4" />编辑
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleDeleteContract(contract.id)} className="text-red-600">
                          <Trash2 className="mr-1 h-4 w-4" />删除
                        </Button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Supplier Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? '编辑供应商' : '新增供应商'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">供应商名称 *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="请输入供应商名称"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="type">类型</Label>
              <Select value={formData.type} onValueChange={(v) => setFormData({ ...formData, type: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="supplier">供应商</SelectItem>
                  <SelectItem value="team">班组</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="contact">联系人</Label>
                <Input
                  id="contact"
                  value={formData.contact}
                  onChange={(e) => setFormData({ ...formData, contact: e.target.value })}
                  placeholder="联系人"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="phone">联系电话</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="电话"
                />
              </div>
            </div>
          </div>
          <DialogFooter className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button onClick={handleSave}>{editId ? '保存' : '创建'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Contract Dialog */}
      <Dialog open={contractDialogOpen} onOpenChange={setContractDialogOpen}>
        <DialogContent className="max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{contractEditId ? '编辑合同' : '新增合同'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="supplier">供应商 *</Label>
              <Select value={contractForm.supplier_id} onValueChange={(v) => setContractForm({ ...contractForm, supplier_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="选择供应商" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map(s => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="project">所属项目</Label>
              <Select value={contractForm.project_id} onValueChange={(v) => setContractForm({ ...contractForm, project_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="选择项目" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map(p => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="contract_name">合同名称 *</Label>
              <Input
                id="contract_name"
                value={contractForm.contract_name}
                onChange={(e) => setContractForm({ ...contractForm, contract_name: e.target.value })}
                placeholder="请输入合同名称"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="contract_no">合同编号</Label>
              <Input
                id="contract_no"
                value={contractForm.contract_no}
                onChange={(e) => setContractForm({ ...contractForm, contract_no: e.target.value })}
                placeholder="合同编号"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="total_amount">合同金额</Label>
              <Input
                id="total_amount"
                type="number"
                value={contractForm.total_amount}
                onChange={(e) => setContractForm({ ...contractForm, total_amount: e.target.value })}
                placeholder="合同总金额"
              />
            </div>
            {/* 财务管控字段区域 */}
            <div className="border-t border-dashed border-gray-200 pt-4 mt-2">
              <div className="flex items-center gap-2 mb-3 text-sm font-medium text-orange-600">
                <span className="px-2 py-0.5 bg-orange-100 rounded text-orange-700">财务管控字段</span>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="grid gap-2">
                  <Label htmlFor="payment_ratio_active" className="text-amber-700">进度付款比例 (%)</Label>
                  <Input
                    id="payment_ratio_active"
                    type="number"
                    value={contractForm.payment_ratio_active}
                    onChange={(e) => setContractForm({ ...contractForm, payment_ratio_active: e.target.value })}
                    placeholder="如：80"
                    className="border-amber-200 focus:border-amber-500"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="payment_ratio_final" className="text-orange-700">决算比例 (%)</Label>
                  <Input
                    id="payment_ratio_final"
                    type="number"
                    value={contractForm.payment_ratio_final}
                    onChange={(e) => setContractForm({ ...contractForm, payment_ratio_final: e.target.value })}
                    placeholder="如：95"
                    className="border-orange-200 focus:border-orange-500"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                提示：进度付款比例+决算比例建议不超过100%，结算时将自动按比例计算应付金额
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="sign_date">签订日期</Label>
                <Input
                  id="sign_date"
                  type="date"
                  value={contractForm.sign_date}
                  onChange={(e) => setContractForm({ ...contractForm, sign_date: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="expire_date">有效期至</Label>
                <Input
                  id="expire_date"
                  type="date"
                  value={contractForm.expire_date}
                  onChange={(e) => setContractForm({ ...contractForm, expire_date: e.target.value })}
                />
              </div>
            </div>
          </div>
          <DialogFooter className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
            <Button variant="outline" onClick={() => setContractDialogOpen(false)}>取消</Button>
            <Button onClick={handleSaveContract}>{contractEditId ? '保存' : '创建'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
