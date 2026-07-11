'use client';

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
import { toast } from 'sonner';
import {
  Plus, Trash2, Receipt, AlertTriangle, Lock, CheckCircle, Clock, FileText, Edit, Upload
} from 'lucide-react';
import * as XLSX from 'xlsx';

// ============ 类型定义 ============
interface Supplier {
  id: number;
  name: string;
  type?: string;
}

interface Contract {
  id: number;
  supplier_id: number;
  supplier_name?: string;
  project_id?: number;
  project_name?: string;
  contract_name: string;
  contract_no: string;
  total_amount: number;
  payment_ratio_active: number; // 进度付款比例（履约）
  payment_ratio_complete: number; // 总结算付款比例
  payment_ratio_final: number; // 决算比例（固定100%）
  contract_status: string;
  locked: boolean;
  has_final_settlement?: boolean; // 是否有决算
}

interface Settlement {
  id: number;
  contract_id: number;
  contract?: Contract;
  settlement_no: string;
  settlement_type: 'progress' | 'final';
  settlement_amount: number; // 结算金额（全额基数）
  payment_ratio: number; // 本次付款比例
  payment_ratio_final: number; // 决算应付比例（固定100%）
  payable_amount: number; // 本次应付金额 = 结算金额 × 付款比例
  settlement_date?: string;
  status: string;
  remark?: string;
  supplier_name?: string;
  created_at: string;
}

interface Stats {
  totalSettlements: number; // 结算单数
  totalAmount: number; // 累计结算金额 = 各期结算金额之和
  totalPayable: number; // 履约应付金额 = 各期「结算金额 × 约定付款比例」之和
  totalFinalPayable: number; // 决算应付金额 = 累计结算金额（固定100%）
  totalPaid: number; // 已付金额
  totalProgressPending: number; // 进度未付金额 = 履约应付 - 已付
  totalFinalPending: number; // 决算未付金额 = 决算应付 - 已付
}

// ============ 工具函数 ============
const formatCurrency = (value: number | null | undefined) => {
  if (value == null) return '¥0.00';
  return `¥${Number(value).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatPercent = (value: number | null | undefined) => {
  if (value == null) return '0%';
  return `${Number(value)}%`;
};

const formatDate = (dateStr: string | null | undefined) => {
  if (!dateStr) return '-';
  return dateStr.split('T')[0];
};

// ============ 主组件 ============
export default function SettlementPage() {
  const [loading, setLoading] = useState(true);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);

  // 筛选状态
  const [filterSupplier, setFilterSupplier] = useState<string>('all');
  const [filterContract, setFilterContract] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [searchKeyword, setSearchKeyword] = useState('');

  // 对话框状态
  const [settlementDialogOpen, setSettlementDialogOpen] = useState(false);
  const [editingSettlement, setEditingSettlement] = useState<Settlement | null>(null);
  const [formErrors, setFormErrors] = useState<string[]>([]);
  
  // 导入对话框状态
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: number; failed: number; errors: string[] } | null>(null);

  // Excel导入辅助函数
  const parseExcelFile = async (file: File): Promise<any[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          const workbook = XLSX.read(data, { type: 'binary' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const json = XLSX.utils.sheet_to_json(worksheet);
          resolve(json);
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsBinaryString(file);
    });
  };

  // 处理Excel导入
  const handleImport = async () => {
    if (!importFile) return;
    
    setImporting(true);
    setImportResult(null);
    
    try {
      const data = await parseExcelFile(importFile);
      const response = await fetch('/api/supplier-contracts/settlements/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ records: data }),
      });
      const result = await response.json();
      setImportResult(result);
      if (result.success > 0) {
        fetchSettlements();
        setImportDialogOpen(false);
        setImportFile(null);
      }
    } catch (error: any) {
      setImportResult({ success: 0, failed: 1, errors: [error.message] });
    } finally {
      setImporting(false);
    }
  };

  // 合同对话框状态
  const [contractDialogOpen, setContractDialogOpen] = useState(false);
  const [editingContract, setEditingContract] = useState<Contract | null>(null);
  const [contractForm, setContractForm] = useState({
    id: null as number | null,
    supplier_id: '',
    name: '',
    number: '',
    amount: '',
    payment_ratio: '',
    payment_ratio_complete: '',
    payment_ratio_final: '',

    sign_date: '',
    expire_date: '',
  });

  const [settlementForm, setSettlementForm] = useState({
    supplier_id: '',
    contract_id: '',
    settlement_type: 'progress' as 'progress' | 'final',
    settlement_amount: '',
    settlement_date: new Date().toISOString().split('T')[0],
    remark: '',
  });

  // ============ 数据获取 ============
  const fetchSuppliers = useCallback(async () => {
    try {
      const res = await fetch('/api/suppliers', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setSuppliers(data.suppliers || []);
      }
    } catch (e) { console.error(e); }
  }, []);

  const fetchContracts = useCallback(async () => {
    try {
      const res = await fetch('/api/supplier-contracts', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        const contractsData = data.contracts || [];
        
        // 获取每个合同的决算状态
        const contractsWithFinalSettlement = await Promise.all(
          contractsData.map(async (contract: any) => {
            try {
              const settlementRes = await fetch(`/api/supplier-contracts/settlements/summary?contract_id=${contract.id}`, { credentials: 'include' });
              if (settlementRes.ok) {
                const settlementData = await settlementRes.json();
                return {
                  ...contract,
                  has_final_settlement: settlementData.summary?.hasFinalSettlement || false,
                };
              }
            } catch (e) { console.error('Failed to fetch settlement summary for contract', contract.id, e); }
            return contract;
          })
        );
        
        setContracts(contractsWithFinalSettlement);
      }
    } catch (e) { console.error(e); }
  }, []);

  // 合同保存
  const handleSaveContract = async () => {
    const errors: string[] = [];
    if (!contractForm.supplier_id) errors.push('请选择供应商');
    if (!contractForm.name) errors.push('请输入合同名称');
    if (!contractForm.amount) errors.push('请输入合同金额');
    
    if (errors.length > 0) {
      toast.error(errors[0]);
      return;
    }

    try {
      const res = await fetch('/api/supplier-contracts', {
        method: contractForm.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          id: contractForm.id,
          supplier_id: contractForm.supplier_id,
          contract_name: contractForm.name,
          contract_no: contractForm.number || null,
          total_amount: contractForm.amount,
          payment_ratio_active: contractForm.payment_ratio || 0,
          payment_ratio_complete: contractForm.payment_ratio_complete || 0,
          payment_ratio_final: contractForm.payment_ratio_final || 0,
          sign_date: contractForm.sign_date || null,
          expire_date: contractForm.expire_date || null,
        }),
      });

      if (res.ok) {
        toast.success(contractForm.id ? '合同更新成功' : '合同创建成功');
        setContractDialogOpen(false);
        fetchContracts();
      } else {
        const data = await res.json();
        toast.error(data.error || '保存失败');
      }
    } catch (e) {
      toast.error('保存失败');
    }
  };

  // 删除合同
  const handleDeleteContract = async (id: number) => {
    if (!confirm('确定要删除此合同吗？删除后将同时删除关联的结算单和付款记录。')) return;
    try {
      const res = await fetch(`/api/supplier-contracts/${id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        toast.success('删除成功');
        fetchContracts();
        fetchSettlements();
      } else {
        toast.error(data.error || '删除失败');
      }
    } catch (e) {
      toast.error('删除失败，请重试');
    }
  };

  const fetchSettlements = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterSupplier !== 'all') params.set('supplier_id', filterSupplier);
      if (filterContract !== 'all') params.set('contract_id', filterContract);
      if (filterType !== 'all') params.set('settlement_type', filterType);

      const res = await fetch(`/api/supplier-contracts/settlements?${params}`);
      if (res.ok) {
        const data = await res.json();
        setSettlements(data.settlements || []);
        setStats(data.summary || null);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [filterSupplier, filterContract, filterType]);

  useEffect(() => {
    fetchSuppliers();
    fetchContracts();
  }, [fetchSuppliers, fetchContracts]);

  useEffect(() => {
    fetchSettlements();
  }, [fetchSettlements]);

  // ============ 计算逻辑 ============
  // 获取合同已累计结算金额
  const getContractTotalSettlement = (contractId: number): number => {
    return settlements
      .filter(s => s.contract_id === contractId)
      .reduce((sum, s) => sum + Number(s.settlement_amount), 0);
  };

  // 检查是否已有总结算
  const hasFinalSettlement = (contractId: number): boolean => {
    return settlements.some(s => s.contract_id === contractId && s.settlement_type === 'final');
  };

  // 检查合同是否被锁定（总结算后）
  const isContractLocked = (contractId: number): boolean => {
    return hasFinalSettlement(contractId);
  };

  // 获取合同已付金额
  const getContractPaidAmount = async (contractId: number): Promise<number> => {
    try {
      const res = await fetch(`/api/supplier-contracts/payments?contract_id=${contractId}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        return (data.payments || []).reduce((sum: number, p: any) => sum + Number(p.payment_amount), 0);
      }
    } catch (e) { console.error(e); }
    return 0;
  };

  // ============ 表单处理 ============
  const selectedContract = contracts.find(c => c.id === Number(settlementForm.contract_id));

  const handleContractChange = (contractId: string) => {
    const contract = contracts.find(c => c.id === Number(contractId));
    setSettlementForm(prev => ({
      ...prev,
      contract_id: contractId,
      supplier_id: contract?.supplier_id?.toString() || '',
      settlement_type: 'progress', // 重置为进度结算
    }));
  };

  const handleSettlementTypeChange = (type: 'progress' | 'final') => {
    setSettlementForm(prev => ({ ...prev, settlement_type: type }));
  };

  const calculateAmounts = () => {
    if (!selectedContract || !settlementForm.settlement_amount) {
      return { payable: 0, payment_ratio: 0 };
    }
    const amount = Number(settlementForm.settlement_amount);
    let payment_ratio = 80;
    
    if (settlementForm.settlement_type === 'progress') {
      // 进度结算：使用进度付款比例
      payment_ratio = selectedContract.payment_ratio_active || 80;
    } else {
      // 总结算：使用决算比例
      payment_ratio = selectedContract.payment_ratio_final || 100;
    }
    
    return {
      payable: amount * (payment_ratio / 100),
      payment_ratio,
    };
  };

  const { payable, payment_ratio } = calculateAmounts();

  const validateForm = (): boolean => {
    const errors: string[] = [];
    if (!settlementForm.supplier_id) errors.push('请选择供应商');
    if (!settlementForm.contract_id) errors.push('请选择合同');
    if (!settlementForm.settlement_amount || Number(settlementForm.settlement_amount) <= 0) {
      errors.push('请输入有效的结算金额');
    }
    
    // 检查合同是否有决算
    const contractId = Number(settlementForm.contract_id);
    const contract = contracts.find(c => c.id === contractId);
    const hasFinal = hasFinalSettlement(contractId) || (contract?.has_final_settlement ?? false);
    
    if (hasFinal) {
      errors.push('该合同已完成决算，无法新增结算记录');
    }
    if (settlementForm.settlement_type === 'final' && hasFinal) {
      errors.push('该合同已存在决算单，无法重复创建');
    }
    setFormErrors(errors);
    return errors.length === 0;
  };

  const handleSaveSettlement = async () => {
    if (!validateForm()) return;

    try {
      const res = await fetch('/api/supplier-contracts/settlements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          contract_id: Number(settlementForm.contract_id),
          settlement_type: settlementForm.settlement_type,
          settlement_amount: Number(settlementForm.settlement_amount),
          settlement_date: settlementForm.settlement_date,
          remark: settlementForm.remark,
          // 自动同步财务管控字段
          payment_ratio: payment_ratio,
          payment_ratio_final: (selectedContract?.payment_ratio_final !== undefined && selectedContract?.payment_ratio_final !== null) ? selectedContract.payment_ratio_final : 0,
          payable_amount: payable,
        }),
      });

      const result = await res.json();
      if (!res.ok) {
        toast.error(result.error || '保存失败');
        return;
      }

      toast.success('结算单保存成功');
      setSettlementDialogOpen(false);
      setSettlementForm({
        supplier_id: '', contract_id: '', settlement_type: 'progress',
        settlement_amount: '', settlement_date: new Date().toISOString().split('T')[0], remark: '',
      });
      fetchSettlements();
      fetchContracts();
    } catch (e) {
      toast.error('保存失败');
    }
  };

  const handleDeleteSettlement = async (id: number) => {
    if (!confirm('确定要删除这条结算记录吗？')) return;

    try {
      const res = await fetch(`/api/supplier-contracts/settlements/${id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        toast.success('删除成功');
        fetchSettlements();
      } else {
        const result = await res.json();
        toast.error(result.error || '删除失败');
      }
    } catch (e) {
      toast.error('删除失败，请重试');
    }
  };

  // 筛选数据
  const filteredSettlements = settlements.filter(s => {
    if (filterSupplier !== 'all' && s.contract?.supplier_id !== Number(filterSupplier)) return false;
    if (searchKeyword) {
      const kw = searchKeyword.toLowerCase();
      const match = (v: string) => v?.toLowerCase().includes(kw);
      if (!match(s.supplier_name || '') && !match(s.settlement_no || '') &&
        !match(s.contract?.contract_name || '')) return false;
    }
    return true;
  });

  // 获取可用的合同列表（按供应商筛选）
  const availableContracts = contracts.filter(c => {
    if (filterSupplier !== 'all' && c.supplier_id !== Number(filterSupplier)) return false;
    return true;
  });

  // 根据筛选条件计算统计数据（直接使用 API 返回的 stats）
  const filteredStats = stats || {
    totalSettlements: 0,
    totalAmount: 0,
    totalPayable: 0,
    totalFinalPayable: 0,
    totalPaid: 0,
    totalProgressPending: 0,
    totalFinalPending: 0,
  };

  return (
    <div className="container mx-auto py-4 space-y-4">
      {/* 头部 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <h1 className="text-xl font-bold">结算管理</h1>
        <div className="flex gap-2 flex-wrap">
          <Button onClick={() => {
            setSettlementForm({
              supplier_id: filterSupplier !== 'all' ? filterSupplier : '',
              contract_id: '',
              settlement_type: 'progress',
              settlement_amount: '',
              settlement_date: new Date().toISOString().split('T')[0],
              remark: '',
            });
            setSettlementDialogOpen(true);
          }}>
            <Plus className="w-4 h-4 mr-1" /> 新增结算单
          </Button>
          <Button variant="outline" size="sm" onClick={() => {
            setImportFile(null);
            setImportResult(null);
            setImportDialogOpen(true);
          }}>
            <Upload className="w-4 h-4 mr-1" /> 批量导入
          </Button>
        </div>
      </div>

      {/* 统计卡片 - 按筛选条件显示 */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
          <Card><CardContent className="pt-3 px-3">
            <div className="text-xs text-muted-foreground">结算单数</div>
            <div className="text-lg font-bold">{filteredStats.totalSettlements}</div>
          </CardContent></Card>
          <Card><CardContent className="pt-3 px-3">
            <div className="text-xs text-muted-foreground">累计结算金额</div>
            <div className="text-lg font-bold text-blue-600">{formatCurrency(filteredStats.totalAmount)}</div>
          </CardContent></Card>
          <Card><CardContent className="pt-3 px-3">
            <div className="text-xs text-muted-foreground">履约应付金额</div>
            <div className="text-lg font-bold text-blue-600">{formatCurrency(filteredStats.totalPayable)}</div>
          </CardContent></Card>
          <Card><CardContent className="pt-3 px-3">
            <div className="text-xs text-muted-foreground">决算应付金额</div>
            <div className="text-lg font-bold text-purple-600">{formatCurrency(filteredStats.totalFinalPayable)}</div>
          </CardContent></Card>
          <Card><CardContent className="pt-3 px-3">
            <div className="text-xs text-muted-foreground">已付金额</div>
            <div className="text-lg font-bold text-green-600">{formatCurrency(filteredStats.totalPaid)}</div>
          </CardContent></Card>
          <Card><CardContent className="pt-3 px-3">
            <div className="text-xs text-muted-foreground">进度未付</div>
            <div className="text-lg font-bold text-orange-600">{formatCurrency(filteredStats.totalProgressPending)}</div>
          </CardContent></Card>
          <Card><CardContent className="pt-3 px-3">
            <div className="text-xs text-muted-foreground">决算未付</div>
            <div className="text-lg font-bold text-red-600">{formatCurrency(filteredStats.totalFinalPending)}</div>
          </CardContent></Card>
        </div>
      )}

      {/* 筛选区域 */}
      <Card>
        <CardContent className="pt-3 px-3">
          <div className="flex flex-wrap gap-2">
            <Select value={filterSupplier} onValueChange={(v) => { setFilterSupplier(v); setFilterContract('all'); }}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="供应商" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部供应商</SelectItem>
                {suppliers.map(s => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterContract} onValueChange={setFilterContract}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="合同" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部合同</SelectItem>
                {availableContracts.map(c => (
                  <SelectItem key={c.id} value={String(c.id)} disabled={isContractLocked(c.id)}>
                    {c.contract_name} {isContractLocked(c.id) ? '🔒' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="结算类型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部类型</SelectItem>
                <SelectItem value="progress">进度结算</SelectItem>
                <SelectItem value="final">总结算</SelectItem>
              </SelectContent>
            </Select>

            <Input
              placeholder="搜索结算单号/供应商..."
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              className="flex-1 min-w-[150px]"
            />
          </div>
        </CardContent>
      </Card>

      {/* 表格 */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>结算单号</TableHead>
                  <TableHead>供应商</TableHead>
                  <TableHead>合同</TableHead>
                  <TableHead>类型</TableHead>
                  <TableHead className="text-right">结算金额(全额)</TableHead>
                  <TableHead className="text-right">付款比例</TableHead>
                  <TableHead className="text-right">应付金额</TableHead>
                  <TableHead>结算日期</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="text-center">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={10} className="text-center py-8">加载中...</TableCell></TableRow>
                ) : filteredSettlements.length === 0 ? (
                  <TableRow><TableCell colSpan={10} className="text-center py-8">暂无数据</TableCell></TableRow>
                ) : (
                  filteredSettlements.map(s => (
                    <TableRow key={s.id}>
                      <TableCell className="font-mono text-sm">{s.settlement_no}</TableCell>
                      <TableCell>{s.supplier_name}</TableCell>
                      <TableCell className="max-w-[150px] truncate" title={s.contract?.contract_name}>
                        {s.contract?.contract_name}
                      </TableCell>
                      <TableCell>
                        <Badge variant={s.settlement_type === 'final' ? 'default' : 'secondary'}>
                          {s.settlement_type === 'progress' ? '进度结算' : '总结算'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(s.settlement_amount)}</TableCell>
                      <TableCell className="text-right">{formatPercent(s.payment_ratio)}</TableCell>
                      <TableCell className="text-right text-blue-600 font-bold">{formatCurrency(s.payable_amount)}</TableCell>
                      <TableCell>{formatDate(s.settlement_date)}</TableCell>
                      <TableCell>
                        <Badge variant={s.status === '已确认' ? 'default' : 'outline'}>
                          {s.status || '待确认'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Button variant="ghost" size="sm" onClick={() => handleDeleteSettlement(s.id)}>
                          <Trash2 className="w-4 h-4 text-red-500" />
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

      {/* 新增合同对话框 */}
      <Dialog open={contractDialogOpen} onOpenChange={setContractDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingContract ? '编辑合同' : '新增合同'}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label>供应商 *</Label>
              <Select 
                value={contractForm.supplier_id} 
                onValueChange={(v) => setContractForm(prev => ({ ...prev, supplier_id: v }))}
              >
                <SelectTrigger><SelectValue placeholder="请选择供应商" /></SelectTrigger>
                <SelectContent>
                  {suppliers.map(s => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label>合同名称 *</Label>
              <Input 
                value={contractForm.name} 
                onChange={(e) => setContractForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="请输入合同名称"
              />
            </div>
            
            <div>
              <Label>合同编号</Label>
              <Input 
                value={contractForm.number} 
                onChange={(e) => setContractForm(prev => ({ ...prev, number: e.target.value }))}
                placeholder="请输入合同编号（选填）"
              />
            </div>
            
            <div>
              <Label>合同金额 *</Label>
              <Input 
                type="number"
                value={contractForm.amount} 
                onChange={(e) => setContractForm(prev => ({ ...prev, amount: e.target.value }))}
                placeholder="请输入合同金额"
              />
            </div>
            
            {/* 财务管控字段区域 */}
            <div className="border-t border-dashed border-orange-200 pt-4 mt-2">
              <div className="flex items-center gap-2 mb-3 text-sm font-medium text-orange-600">
                <span className="px-2 py-0.5 bg-orange-100 rounded text-orange-700">财务管控字段</span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-amber-700">进度付款 (%)</Label>
                  <Input 
                    type="number"
                    value={contractForm.payment_ratio} 
                    onChange={(e) => setContractForm(prev => ({ ...prev, payment_ratio: e.target.value }))}
                    placeholder="如：80"
                    className="border-amber-200 focus:border-amber-500"
                  />
                </div>
                <div>
                  <Label className="text-orange-700">决算比例 (%)</Label>
                  <Input 
                    type="number"
                    value={contractForm.payment_ratio_final} 
                    onChange={(e) => setContractForm(prev => ({ ...prev, payment_ratio_final: e.target.value }))}
                    placeholder="如：95"
                    className="border-orange-200 focus:border-orange-500"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                提示：结算时将自动按比例计算应付金额
              </p>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>签订日期</Label>
                <Input 
                  type="date"
                  value={contractForm.sign_date} 
                  onChange={(e) => setContractForm(prev => ({ ...prev, sign_date: e.target.value }))}
                />
              </div>
              <div>
                <Label>有效期至</Label>
                <Input 
                  type="date"
                  value={contractForm.expire_date} 
                  onChange={(e) => setContractForm(prev => ({ ...prev, expire_date: e.target.value }))}
                />
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setContractDialogOpen(false)}>取消</Button>
            <Button onClick={handleSaveContract}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 新增结算对话框 */}
      <Dialog open={settlementDialogOpen} onOpenChange={setSettlementDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingSettlement ? '编辑结算单' : '新增结算单'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {formErrors.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded p-3">
                {formErrors.map((err, i) => (
                  <div key={i} className="text-red-600 text-sm flex items-center gap-1">
                    <AlertTriangle className="w-4 h-4" /> {err}
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-2">
              <Label>供应商 <span className="text-red-500">*</span></Label>
              <Select value={settlementForm.supplier_id} onValueChange={(v) => {
                setSettlementForm(prev => ({ ...prev, supplier_id: v, contract_id: '' }));
              }}>
                <SelectTrigger><SelectValue placeholder="选择供应商" /></SelectTrigger>
                <SelectContent>
                  {suppliers.map(s => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>合同 <span className="text-red-500">*</span></Label>
              <Select value={settlementForm.contract_id} onValueChange={handleContractChange}>
                <SelectTrigger>
                  <SelectValue placeholder="选择合同（必须先选供应商）" />
                </SelectTrigger>
                <SelectContent>
                  {availableContracts.filter(c => c.supplier_id === Number(settlementForm.supplier_id)).map(c => {
                    const hasFinal = hasFinalSettlement(c.id) || (c.has_final_settlement ?? false);
                    return (
                      <SelectItem key={c.id} value={String(c.id)} disabled={hasFinal}>
                        <div className="flex items-center gap-2">
                          {hasFinal && <Lock className="w-3 h-3 text-orange-500" />}
                          {c.contract_name} ({formatPercent(c.payment_ratio_complete)})
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {selectedContract && (hasFinalSettlement(selectedContract.id) || (selectedContract as any).has_final_settlement) && (
                <div className="text-orange-600 text-sm flex items-center gap-1">
                  <Lock className="w-4 h-4" /> 该合同已完成决算，无法新增结算记录
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>结算类型 <span className="text-red-500">*</span></Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={settlementForm.settlement_type === 'progress' ? 'default' : 'outline'}
                  onClick={() => handleSettlementTypeChange('progress')}
                  disabled={selectedContract ? isContractLocked(selectedContract.id) : false}
                  className="flex-1"
                >
                  <Clock className="w-4 h-4 mr-1" /> 进度结算
                </Button>
                <Button
                  type="button"
                  variant={settlementForm.settlement_type === 'final' ? 'default' : 'outline'}
                  onClick={() => handleSettlementTypeChange('final')}
                  disabled={selectedContract ? (isContractLocked(selectedContract.id) || hasFinalSettlement(selectedContract.id)) : false}
                  className="flex-1"
                >
                  <CheckCircle className="w-4 h-4 mr-1" /> 总结算
                </Button>
              </div>
              <div className="text-xs text-muted-foreground">
                {settlementForm.settlement_type === 'progress' ? '同一合同可多次创建，系统按比例计算应付金额' : '同一合同仅允许1次，创建后将锁定合同禁止新增进度结算'}
              </div>
            </div>

            <div className="space-y-2">
              <Label>结算金额 <span className="text-red-500">*</span></Label>
              <Input
                type="number"
                placeholder="输入结算金额"
                value={settlementForm.settlement_amount}
                onChange={(e) => setSettlementForm(prev => ({ ...prev, settlement_amount: e.target.value }))}
              />
            </div>

            {selectedContract && (
              <div className="bg-blue-50 border border-blue-200 rounded p-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>付款比例：</span>
                  <span className="font-medium">
                    {settlementForm.settlement_type === 'progress'
                      ? `${formatPercent(selectedContract.payment_ratio_active || 80)}（履约应付）`
                      : `${formatPercent(selectedContract.payment_ratio_final || 100)}（决算应付）`}
                  </span>
                </div>
                {settlementForm.settlement_amount && (
                  <>
                    <div className="flex justify-between text-green-600">
                      <span>应付金额：</span>
                      <span className="font-bold">{formatCurrency(payable)}</span>
                    </div>
                    <div className="flex justify-between text-orange-600 text-xs pt-1 border-t border-orange-100">
                      <span>说明：结算金额为全额基数，进度应付=结算金额×进度付款比例，决算应付=累计结算金额×决算应付比例</span>
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label>结算日期</Label>
              <Input
                type="date"
                value={settlementForm.settlement_date}
                onChange={(e) => setSettlementForm(prev => ({ ...prev, settlement_date: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>备注</Label>
              <Textarea
                placeholder="输入备注信息"
                value={settlementForm.remark}
                onChange={(e) => setSettlementForm(prev => ({ ...prev, remark: e.target.value }))}
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSettlementDialogOpen(false)}>取消</Button>
            <Button onClick={handleSaveSettlement}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 批量导入对话框 */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>批量导入结算单</DialogTitle>
            <p className="text-sm text-gray-500">请上传 Excel 文件，支持 .xlsx 和 .xls 格式</p>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="border-2 border-dashed border-gray-200 rounded-lg p-6 text-center">
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setImportFile(file);
                  }
                }}
                className="hidden"
                id="settlement-import-file"
              />
              <label htmlFor="settlement-import-file" className="cursor-pointer">
                <Upload className="w-10 h-10 mx-auto text-gray-400 mb-2" />
                <p className="text-sm text-gray-600">
                  {importFile ? importFile.name : '点击选择 Excel 文件'}
                </p>
              </label>
            </div>
            <div className="text-xs text-gray-500">
              <p className="font-medium mb-1">Excel 文件应包含以下列：</p>
              <ul className="list-disc list-inside space-y-0.5">
                <li>合同编号（必填，匹配已有合同）</li>
                <li>结算日期（必填，格式如 2024-01-01）</li>
                <li>结算金额（必填，数字）</li>
                <li>结算类型（必填，progress/final/warranty）</li>
                <li>备注（选填）</li>
              </ul>
            </div>
          </div>
          {importResult && (
            <div className={`p-3 rounded-md text-sm ${importResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>

              {importResult.errors && importResult.errors.length > 0 && (
                <ul className="mt-2 list-disc list-inside text-xs max-h-32 overflow-y-auto">
                  {importResult.errors.slice(0, 5).map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                  {importResult.errors.length > 5 && (
                    <li>...还有 {importResult.errors.length - 5} 条错误</li>
                  )}
                </ul>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setImportDialogOpen(false);
              setImportFile(null);
              setImportResult(null);
            }}>
              取消
            </Button>
            <Button onClick={handleImport} disabled={!importFile || importing}>
              {importing ? '导入中...' : '开始导入'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 导入结果消息 */}
      {importResult && (
        <div className={`mt-4 p-4 rounded-md ${importResult.success > 0 ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
          <p className="font-medium">导入完成</p>
          <p>成功: {importResult.success} 条</p>
          {importResult.failed > 0 && <p className="text-red-600">失败: {importResult.failed} 条</p>}
        </div>
      )}
    </div>
  );
}
