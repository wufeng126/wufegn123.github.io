'use client';
import { useToast } from '@/hooks/use-toast';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
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
import {
  ArrowLeft, Users, BarChart3, FileText, DollarSign,
  ListTree, Target, CheckCircle2, Plus, Upload, Download,
  Pencil, Trash2, Search, X, RefreshCw, FileSpreadsheet,
  AlertTriangle, TrendingUp, Calendar, Building2, CreditCard,
  UserCheck, UserX
} from 'lucide-react';
import Link from 'next/link';
import { useRef } from 'react';
import { ProjectExpenses } from '@/components/projects/project-expenses';
import { ProjectSupplierPayments } from '@/components/projects/project-supplier-payments';
import { ProjectMiscMaterials } from '@/components/projects/project-misc-materials';
import { SupplierLink } from '@/components/linkable-cell';

// 类型定义
interface Project {
  id: number;
  name: string;
  year: number;
  status: string;
  expected_completion_date?: string;
  address?: string;
  partner?: string;
  contract_amount?: string;
  building_area?: string;
  tax_rate?: number;
}

interface ProjectStats {
  totalSalary: string;
  totalReport: string;
  totalPayment: string;
  budgetCost: string;
  actualCost: string;
  workItemCount: number;
  workerCount: number;
  inServiceCount: number;
  leftCount: number;
}

interface WorkItemSubitem {
  id: number;
  project_id: number;
  project_name: string;
  subitem_name: string;
  unit: string;
  budget_quantity: string;
  completed_quantity: string;
  unit_price: string | null;
  contract_price: string | null;
  limit_price: string | null;
  remark: string | null;
}

interface Settlement {
  id: number;
  contract_id: number;
  supplier_id: number;
  supplier_name: string;
  supplier_type: string;
  settlement_amount: number;
  payable_amount: number;
  settlement_date: string;
  remark: string | null;
  contract?: {
    contract_name: string;
  };
}

interface Payment {
  id: number;
  supplier_id: number;
  supplier_name: string;
  supplier_type: string;
  project_id: number | null;
  project_name: string;
  payment_amount: number;
  payment_date: string;
  payment_method: string;
  voucher_number: string | null;
  remark: string | null;
}

interface ClientPayment {
  id: number;
  project_id: number;
  project_name: string;
  payment_amount: string;
  payment_date: string;
  payment_method: string;
  status: string;
  remark: string | null;
}

interface ClientReport {
  id: number;
  project_id: number;
  project_name: string;
  settlement_amount: string;
  invoice_amount: string | null;
  deduction_amount: string | null;
  proportional_payment: string | null;
  report_date: string;
  remark: string | null;
}

export default function ProjectDetailPage() {
  const { toast } = useToast();
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  
  const [project, setProject] = useState<Project | null>(null);
  const [stats, setStats] = useState<ProjectStats | null>(null);
  const [loading, setLoading] = useState(true);
  
  // 清单子项相关状态（保留用于预算和完成工程量）
  const [subitems, setSubitems] = useState<WorkItemSubitem[]>([]);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  
  // 新增/编辑对话框
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [batchDialogOpen, setBatchDialogOpen] = useState(false);
  const [currentSubitem, setCurrentSubitem] = useState<WorkItemSubitem | null>(null);
  const [form, setForm] = useState({
    subitem_name: '',
    unit: '',
    budget_quantity: '',
    completed_quantity: '0',
    contract_price: '',
    limit_price: '',
    remark: '',
  });
  const [batchText, setBatchText] = useState('');
  const [uploadFileName, setUploadFileName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // 预算工程量编辑
  const [budgetEditDialogOpen, setBudgetEditDialogOpen] = useState(false);
  const [budgetEditItem, setBudgetEditItem] = useState<WorkItemSubitem | null>(null);
  const [budgetForm, setBudgetForm] = useState({
    budget_quantity: '',
    contract_price: '',
    limit_price: '',
  });
  
  // 完成工程量编辑
  const [completedEditDialogOpen, setCompletedEditDialogOpen] = useState(false);
  const [completedEditItem, setCompletedEditItem] = useState<WorkItemSubitem | null>(null);
  const [completedForm, setCompletedForm] = useState({
    completed_quantity: '',
    remark: '',
  });
  
  // 供应商结算和付款数据
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [clientPayments, setClientPayments] = useState<ClientPayment[]>([]);
  const [clientReports, setClientReports] = useState<ClientReport[]>([]);
  
  // 产值结算编辑和删除
  const [clientReportEditDialogOpen, setClientReportEditDialogOpen] = useState(false);
  const [clientReportDeleteDialogOpen, setClientReportDeleteDialogOpen] = useState(false);
  const [editingClientReport, setEditingClientReport] = useState<ClientReport | null>(null);
  const [deletingClientReport, setDeletingClientReport] = useState<ClientReport | null>(null);
  const [clientReportForm, setClientReportForm] = useState({
    settlement_amount: '',
    invoice_amount: '',
    deduction_amount: '',
    proportional_payment: '',
    report_date: '',
    remark: '',
  });

  useEffect(() => {
    fetchProjectData();
  }, [projectId]);

  const fetchProjectData = async () => {
    setLoading(true);
    try {
      // 获取项目基本信息和统计
      const projectRes = await fetch(`/api/projects/${projectId}`);
      const projectData = await projectRes.json();
      setProject(projectData.project);
      setStats(projectData.stats);

      // 获取清单子项（用于预算和完成工程量）
      const subitemsRes = await fetch(`/api/work-item-subitems?project_id=${projectId}`);
      const subitemsData = await subitemsRes.json();
      setSubitems(subitemsData.subitems || []);

      // 获取供应商结算数据（从结算管理同步）
      const settlementsRes = await fetch(`/api/supplier-contracts/settlements?project_id=${projectId}`);
      const settlementsData = await settlementsRes.json();
      setSettlements(settlementsData.settlements || []);

      // 获取付款数据
      const paymentsRes = await fetch(`/api/payments?project_id=${projectId}`);
      const paymentsData = await paymentsRes.json();
      setPayments(paymentsData.payments || []);

      // 获取甲方付款数据
      const clientPaymentsRes = await fetch(`/api/client-payments?project_id=${projectId}`);
      const clientPaymentsData = await clientPaymentsRes.json();
      setClientPayments(clientPaymentsData.payments || []);

      // 获取产值结算数据
      const clientReportsRes = await fetch(`/api/client-reports?project_id=${projectId}`);
      const clientReportsData = await clientReportsRes.json();
      setClientReports(clientReportsData.reports || []);
    } catch (error) {
      console.error('获取数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 刷新清单子项
  const refreshSubitems = async () => {
    try {
      const res = await fetch(`/api/work-item-subitems?project_id=${projectId}`);
      const data = await res.json();
      setSubitems(data.subitems || []);
    } catch (error) {
      console.error('刷新数据失败:', error);
    }
  };

  // ========== 清单子项功能 ==========
  
  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/work-item-subitems', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          subitem_name: form.subitem_name,
          unit: form.unit,
          budget_quantity: form.budget_quantity,
          completed_quantity: form.completed_quantity || 0,
          contract_price: form.contract_price || null,
          limit_price: form.limit_price || null,
          remark: form.remark || null,
        }),
      });
      
      if (res.ok) {
        setAddDialogOpen(false);
        resetForm();
        refreshSubitems();
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
    if (!currentSubitem) return;
    
    try {
      const res = await fetch('/api/work-item-subitems', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: currentSubitem.id,
          subitem_name: form.subitem_name,
          unit: form.unit,
          budget_quantity: form.budget_quantity,
          completed_quantity: form.completed_quantity || 0,
          contract_price: form.contract_price || null,
          limit_price: form.limit_price || null,
          remark: form.remark || null,
        }),
      });
      
      if (res.ok) {
        setEditDialogOpen(false);
        resetForm();
        setCurrentSubitem(null);
        refreshSubitems();
      } else {
        const error = await res.json();
        toast({ title: error.error || '修改失败', variant: 'error' });
      }
    } catch (error) {
      toast({ title: '修改失败', variant: 'error' });
    }
  };

  const handleBatchAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!batchText.trim()) {
      toast({ title: '请输入数据', variant: 'error' });
      return;
    }
    
    try {
      const lines = batchText.trim().split('\n');
      const dataLines = lines[0].includes('分项名称') || lines[0].includes('子项名称') ? lines.slice(1) : lines;
      
      const items = dataLines.map(line => {
        const parts = line.split(/[,\t，]/).map(p => p.trim());
        return {
          project_id: projectId,
          subitem_name: parts[0] || '',
          unit: parts[1] || '',
          budget_quantity: parts[2] || '0',
          contract_price: parts[3] || null,
          limit_price: parts[4] || null,
        };
      }).filter(item => item.subitem_name && item.unit);
      
      if (items.length === 0) {
        toast({ title: '没有有效数据' });
        return;
      }
      
      let successCount = 0;
      for (const item of items) {
        const res = await fetch('/api/work-item-subitems', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item),
        });
        if (res.ok) successCount++;
      }
      
      setBatchDialogOpen(false);
      setBatchText('');
      refreshSubitems();
      toast({ title: `成功添加 ${successCount}/${items.length} 条记录` });
    } catch (error) {
      toast({ title: '添加失败', variant: 'error' });
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除该分项工程吗？')) return;
    
    try {
      const res = await fetch(`/api/work-item-subitems?ids=${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        refreshSubitems();
      }
    } catch (error) {
      toast({ title: '删除失败', variant: 'error' });
    }
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    try {
      const res = await fetch(`/api/work-item-subitems?ids=${Array.from(selectedIds).join(',')}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setSelectedIds(new Set());
        setDeleteDialogOpen(false);
        refreshSubitems();
      }
    } catch (error) {
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
      setSelectedIds(new Set(filteredSubitems.map(item => item.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const openEditDialog = (item: WorkItemSubitem) => {
    setCurrentSubitem(item);
    setForm({
      subitem_name: item.subitem_name,
      unit: item.unit,
      budget_quantity: item.budget_quantity,
      completed_quantity: item.completed_quantity,
      contract_price: item.contract_price || '',
      limit_price: item.limit_price || '',
      remark: item.remark || '',
    });
    setEditDialogOpen(true);
  };

  const resetForm = () => {
    setForm({
      subitem_name: '',
      unit: '',
      budget_quantity: '',
      completed_quantity: '0',
      contract_price: '',
      limit_price: '',
      remark: '',
    });
  };

  const downloadTemplate = () => {
    const content = '分项名称,单位,预算量,合同价,限价\n模板工程,㎡,130000,,\n钢筋工程,t,50,,';
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = '分项工程导入模板.csv';
    link.click();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadFileName(file.name);
    
    try {
      const buffer = await file.arrayBuffer();
      let text = '';
      const encodings = ['utf-8', 'gbk', 'gb2312', 'gb18030'];
      
      for (const encoding of encodings) {
        try {
          const decoder = new TextDecoder(encoding, { fatal: true });
          const decoded = decoder.decode(buffer);
          if (!decoded.includes('\uFFFD')) {
            text = decoded;
            break;
          }
        } catch {
          continue;
        }
      }
      
      if (!text) {
        const decoder = new TextDecoder('utf-8', { fatal: false });
        text = decoder.decode(buffer);
      }
      
      const firstLine = text.split('\n')[0];
      const separator = firstLine.includes('\t') ? '\t' : ',';
      const lines = text.split('\n').filter(line => line.trim());
      const hasHeader = lines[0].includes('分项名称') || lines[0].includes('子项名称');
      const dataLines = hasHeader ? lines.slice(1) : lines;
      
      const formattedLines = dataLines.map(line => {
        const parts = line.split(separator).map(p => p.trim().replace(/^["']|["']$/g, ''));
        return parts.slice(0, 5).join(',');
      });
      
      setBatchText(formattedLines.join('\n'));
      if (formattedLines.length > 0) {
        toast({ title: `成功解析 ${formattedLines.length} 条数据` });
      }
    } catch (error) {
      toast({ title: '文件解析失败', variant: 'error' });
    }
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // ========== 预算工程量功能 ==========
  
  const openBudgetEditDialog = (item: WorkItemSubitem) => {
    setBudgetEditItem(item);
    setBudgetForm({
      budget_quantity: item.budget_quantity,
      contract_price: item.contract_price || '',
      limit_price: item.limit_price || '',
    });
    setBudgetEditDialogOpen(true);
  };

  const handleBudgetEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!budgetEditItem) return;
    
    try {
      const res = await fetch('/api/work-item-subitems', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: budgetEditItem.id,
          budget_quantity: budgetForm.budget_quantity,
          contract_price: budgetForm.contract_price || null,
          limit_price: budgetForm.limit_price || null,
        }),
      });
      
      if (res.ok) {
        setBudgetEditDialogOpen(false);
        setBudgetEditItem(null);
        refreshSubitems();
      } else {
        const error = await res.json();
        toast({ title: error.error || '修改失败', variant: 'error' });
      }
    } catch (error) {
      toast({ title: '修改失败', variant: 'error' });
    }
  };

  // ========== 完成工程量功能 ==========
  
  const openCompletedEditDialog = (item: WorkItemSubitem) => {
    setCompletedEditItem(item);
    setCompletedForm({
      completed_quantity: item.completed_quantity,
      remark: item.remark || '',
    });
    setCompletedEditDialogOpen(true);
  };

  const handleCompletedEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!completedEditItem) return;
    
    try {
      const res = await fetch('/api/work-item-subitems', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: completedEditItem.id,
          completed_quantity: completedForm.completed_quantity,
          remark: completedForm.remark || null,
        }),
      });
      
      if (res.ok) {
        setCompletedEditDialogOpen(false);
        setCompletedEditItem(null);
        refreshSubitems();
      } else {
        const error = await res.json();
        toast({ title: error.error || '修改失败', variant: 'error' });
      }
    } catch (error) {
      toast({ title: '修改失败', variant: 'error' });
    }
  };

  // ========== 筛选和统计 ==========
  
  const filteredSubitems = subitems.filter(item => {
    if (!searchKeyword) return true;
    return item.subitem_name.toLowerCase().includes(searchKeyword.toLowerCase());
  });

  const subitemStats = {
    totalItems: subitems.length,
    totalBudget: subitems.reduce((sum, item) => {
      const qty = parseFloat(item.budget_quantity) || 0;
      const price = parseFloat(item.contract_price || '0') || 0;
      return sum + qty * price;
    }, 0),
    totalCompleted: subitems.reduce((sum, item) => {
      const qty = parseFloat(item.completed_quantity) || 0;
      const price = parseFloat(item.contract_price || '0') || 0;
      return sum + qty * price;
    }, 0),
  };

  const allSelected = filteredSubitems.length > 0 && filteredSubitems.every(item => selectedIds.has(item.id));

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('zh-CN', {
      style: 'currency',
      currency: 'CNY',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const getProgressBadge = (percent: number) => {
    if (percent >= 100) return <Badge className="bg-green-100 text-green-700">已完成</Badge>;
    if (percent >= 80) return <Badge variant="destructive">进度预警</Badge>;
    if (percent >= 50) return <Badge variant="secondary">进行中</Badge>;
    return <Badge variant="default">正常</Badge>;
  };

  const getProgressColor = (percent: number) => {
    if (percent >= 100) return 'bg-green-500';
    if (percent >= 80) return 'bg-red-500';
    if (percent >= 50) return 'bg-yellow-500';
    return 'bg-blue-500';
  };

  // 结算和付款统计
  const settlementStats = {
    totalAmount: settlements.reduce((sum, s) => sum + (s.settlement_amount || 0), 0),
    supplierCount: new Set(settlements.map(s => s.supplier_id)).size,
  };

  const paymentStats = {
    totalAmount: payments.reduce((sum, p) => sum + (p.payment_amount || 0), 0),
    supplierCount: new Set(payments.map(p => p.supplier_id)).size,
  };

  const clientPaymentStats = {
    totalAmount: clientPayments.reduce((sum, p) => sum + parseFloat(p.payment_amount || '0'), 0),
    completedAmount: clientPayments.filter(p => p.status === 'completed').reduce((sum, p) => sum + parseFloat(p.payment_amount || '0'), 0),
    pendingAmount: clientPayments.filter(p => p.status === 'pending').reduce((sum, p) => sum + parseFloat(p.payment_amount || '0'), 0),
    count: clientPayments.length,
  };

  // 产值结算编辑和删除处理函数
  const handleEditClientReport = (report: ClientReport) => {
    setEditingClientReport(report);
    setClientReportForm({
      settlement_amount: report.settlement_amount || '',
      invoice_amount: report.invoice_amount || '',
      deduction_amount: report.deduction_amount || '',
      proportional_payment: report.proportional_payment || '',
      report_date: report.report_date?.split('T')[0] || '',
      remark: report.remark || '',
    });
    setClientReportEditDialogOpen(true);
  };

  const handleSaveClientReport = async () => {
    if (!editingClientReport) return;
    try {
      const res = await fetch('/api/client-reports', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingClientReport.id,
          ...clientReportForm,
        }),
      });
      if (res.ok) {
        setClientReportEditDialogOpen(false);
        setEditingClientReport(null);
        fetchProjectData();
      } else {
        const data = await res.json();
        toast({ title: data.error || '保存失败', variant: 'error' });
      }
    } catch (error) {
      toast({ title: '保存失败', variant: 'error' });
    }
  };

  const handleDeleteClientReport = (report: ClientReport) => {
    setDeletingClientReport(report);
    setClientReportDeleteDialogOpen(true);
  };

  const handleConfirmDeleteClientReport = async () => {
    if (!deletingClientReport) return;
    try {
      const res = await fetch(`/api/client-reports?id=${deletingClientReport.id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setClientReportDeleteDialogOpen(false);
        setDeletingClientReport(null);
        fetchProjectData();
      } else {
        const data = await res.json();
        toast({ title: data.error || '删除失败', variant: 'error' });
      }
    } catch (error) {
      toast({ title: '删除失败', variant: 'error' });
    }
  };

  const clientReportStats = {
    totalSettlement: clientReports.reduce((sum, r) => sum + parseFloat(r.settlement_amount || '0'), 0),
    totalInvoice: clientReports.reduce((sum, r) => sum + parseFloat(r.invoice_amount || '0'), 0),
    totalDeduction: clientReports.reduce((sum, r) => sum + parseFloat(r.deduction_amount || '0'), 0),
    totalProportional: clientReports.reduce((sum, r) => sum + parseFloat(r.proportional_payment || '0'), 0),
    count: clientReports.length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">加载中...</div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">项目不存在</p>
        <Link href="/projects">
          <Button className="mt-4">返回项目列表</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 顶部导航 */}
      <div className="flex items-center gap-4">
        <Button variant="outline" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          返回
        </Button>
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-gray-900">{project.name}</h1>
          <p className="text-sm text-gray-500">{project.year}年度 · {project.status}{project.expected_completion_date && ` · 预计完工 ${project.expected_completion_date}`}</p>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Users className="w-8 h-8 text-blue-600" />
              <div>
                <p className="text-sm text-blue-600">工人成本</p>
                <p className="text-xl font-bold text-blue-700">¥{stats?.totalSalary || '0'}</p>
                <p className="text-xs text-blue-500">{stats?.workerCount || 0} 名工人</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-purple-50 border-purple-200">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <BarChart3 className="w-8 h-8 text-purple-600" />
              <div>
                <p className="text-sm text-purple-600">工程成本</p>
                <p className="text-xl font-bold text-purple-700">¥{stats?.actualCost || '0'}</p>
                <p className="text-xs text-purple-500">预算 ¥{stats?.budgetCost || '0'}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-green-50 border-green-200">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <UserCheck className="w-8 h-8 text-green-600" />
              <div>
                <p className="text-sm text-green-600">在场人数</p>
                <p className="text-2xl font-bold text-green-700">{stats?.inServiceCount || 0}<span className="text-sm font-normal ml-1 text-green-500">人</span></p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-orange-50 border-orange-200">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <UserX className="w-8 h-8 text-orange-600" />
              <div>
                <p className="text-sm text-orange-600">退场人数</p>
                <p className="text-2xl font-bold text-orange-700">{stats?.leftCount || 0}<span className="text-sm font-normal ml-1 text-orange-500">人</span></p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-teal-50 border-teal-200">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Building2 className="w-8 h-8 text-teal-600" />
              <div>
                <p className="text-sm text-teal-600">供应商结算</p>
                <p className="text-xl font-bold text-teal-700">{formatCurrency(settlementStats.totalAmount)}</p>
                <p className="text-xs text-teal-500">{settlementStats.supplierCount} 家供应商</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 详细数据标签页 */}
      <Tabs defaultValue="budget" className="space-y-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="budget">预算工程量</TabsTrigger>
          <TabsTrigger value="completed">完成工程量</TabsTrigger>
          <TabsTrigger value="settlements">供应商结算</TabsTrigger>
          <TabsTrigger value="clientPayments">甲方付款</TabsTrigger>
          <TabsTrigger value="clientReports">产值结算</TabsTrigger>
          <TabsTrigger value="comprehensiveExpenses">综合费用</TabsTrigger>
          <TabsTrigger value="miscMaterials">零星材料</TabsTrigger>
          <TabsTrigger value="supplierPayments">供应商付款</TabsTrigger>
        </TabsList>

        {/* 预算工程量标签页 */}
        <TabsContent value="budget" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">预算工程量</h3>
            <Button variant="outline" onClick={refreshSubitems}>
              <RefreshCw className="w-4 h-4 mr-2" />刷新
            </Button>
          </div>

          {/* 预算统计 */}
          <div className="grid grid-cols-3 gap-4">
            <Card className="border-blue-200 bg-blue-50">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-blue-600">分项工程数</p>
                    <p className="text-2xl font-bold text-blue-700">{subitemStats.totalItems}</p>
                  </div>
                  <Target className="w-8 h-8 text-blue-400" />
                </div>
              </CardContent>
            </Card>
            <Card className="border-green-200 bg-green-50">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-green-600">预算总金额</p>
                    <p className="text-xl font-bold text-green-700">{formatCurrency(subitemStats.totalBudget)}</p>
                  </div>
                  <TrendingUp className="w-8 h-8 text-green-400" />
                </div>
              </CardContent>
            </Card>
            <Card className="border-purple-200 bg-purple-50">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-purple-600">平均完成率</p>
                    <p className="text-2xl font-bold text-purple-700">
                      {subitems.length > 0 
                        ? (subitems.reduce((sum, item) => {
                            const budget = parseFloat(item.budget_quantity) || 0;
                            const completed = parseFloat(item.completed_quantity) || 0;
                            return sum + (budget > 0 ? (completed / budget) * 100 : 0);
                          }, 0) / subitems.length).toFixed(1)
                        : 0}%
                    </p>
                  </div>
                  <BarChart3 className="w-8 h-8 text-purple-400" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* 预算工程量表格 */}
          <Card>
            <CardContent className="pt-6">
              {subitems.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>分项名称</TableHead>
                        <TableHead>单位</TableHead>
                        <TableHead className="text-right">预算量</TableHead>
                        <TableHead className="text-right">完成量</TableHead>
                        <TableHead className="text-right">进度</TableHead>
                        <TableHead className="text-right">合同价</TableHead>
                        <TableHead className="text-right">限价</TableHead>
                        <TableHead className="text-right">预算金额</TableHead>
                        <TableHead>状态</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {subitems.map((item) => {
                        const budgetQty = parseFloat(item.budget_quantity) || 0;
                        const completedQty = parseFloat(item.completed_quantity) || 0;
                        const contractPrice = parseFloat(item.contract_price || '0') || 0;
                        const progress = budgetQty > 0 ? (completedQty / budgetQty * 100) : 0;
                        const budgetCost = budgetQty * contractPrice;
                        return (
                          <TableRow key={item.id}>
                            <TableCell className="font-medium">{item.subitem_name}</TableCell>
                            <TableCell>{item.unit}</TableCell>
                            <TableCell className="text-right font-medium">{item.budget_quantity}</TableCell>
                            <TableCell className="text-right text-blue-600">{item.completed_quantity}</TableCell>
                            <TableCell className="text-right">{progress.toFixed(1)}%</TableCell>
                            <TableCell className="text-right">{item.contract_price || '-'}</TableCell>
                            <TableCell className="text-right">{item.limit_price || '-'}</TableCell>
                            <TableCell className="text-right">{formatCurrency(budgetCost)}</TableCell>
                            <TableCell>{getProgressBadge(progress)}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">暂无数据</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 完成工程量标签页 */}
        <TabsContent value="completed" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">完成工程量</h3>
            <Button variant="outline" onClick={refreshSubitems}>
              <RefreshCw className="w-4 h-4 mr-2" />刷新
            </Button>
          </div>

          {/* 完成工程量统计 */}
          <div className="grid grid-cols-4 gap-4">
            <Card className="border-blue-200 bg-blue-50">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-blue-600">分项工程数</p>
                    <p className="text-2xl font-bold text-blue-700">{subitemStats.totalItems}</p>
                  </div>
                  <CheckCircle2 className="w-8 h-8 text-blue-400" />
                </div>
              </CardContent>
            </Card>
            <Card className="border-red-200 bg-red-50">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-red-600">进度预警</p>
                    <p className="text-2xl font-bold text-red-700">
                      {subitems.filter(item => {
                        const budget = parseFloat(item.budget_quantity) || 0;
                        const completed = parseFloat(item.completed_quantity) || 0;
                        return budget > 0 && (completed / budget) > 0.8;
                      }).length}
                    </p>
                  </div>
                  <AlertTriangle className="w-8 h-8 text-red-400" />
                </div>
              </CardContent>
            </Card>
            <Card className="border-green-200 bg-green-50">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-green-600">已完成金额</p>
                    <p className="text-xl font-bold text-green-700">{formatCurrency(subitemStats.totalCompleted)}</p>
                  </div>
                  <TrendingUp className="w-8 h-8 text-green-400" />
                </div>
              </CardContent>
            </Card>
            <Card className="border-purple-200 bg-purple-50">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-purple-600">平均进度</p>
                    <p className="text-2xl font-bold text-purple-700">
                      {subitems.length > 0 
                        ? (subitems.reduce((sum, item) => {
                            const budget = parseFloat(item.budget_quantity) || 0;
                            const completed = parseFloat(item.completed_quantity) || 0;
                            return sum + (budget > 0 ? (completed / budget) * 100 : 0);
                          }, 0) / subitems.length).toFixed(1)
                        : 0}%
                    </p>
                  </div>
                  <Calendar className="w-8 h-8 text-purple-400" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* 完成工程量表格 */}
          <Card>
            <CardContent className="pt-6">
              {subitems.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>分项名称</TableHead>
                        <TableHead>单位</TableHead>
                        <TableHead className="text-right">预算量</TableHead>
                        <TableHead className="text-right">完成量</TableHead>
                        <TableHead className="text-right">剩余量</TableHead>
                        <TableHead className="text-center">进度</TableHead>
                        <TableHead className="text-right">完成金额</TableHead>
                        <TableHead>状态</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {subitems.map((item) => {
                        const budgetQty = parseFloat(item.budget_quantity) || 0;
                        const completedQty = parseFloat(item.completed_quantity) || 0;
                        const contractPrice = parseFloat(item.contract_price || '0') || 0;
                        const remainingQty = budgetQty - completedQty;
                        const progress = budgetQty > 0 ? (completedQty / budgetQty) * 100 : 0;
                        const actualCost = completedQty * contractPrice;
                        return (
                          <TableRow key={item.id} className={progress > 80 ? 'bg-red-50' : ''}>
                            <TableCell className="font-medium">{item.subitem_name}</TableCell>
                            <TableCell>{item.unit}</TableCell>
                            <TableCell className="text-right">{item.budget_quantity}</TableCell>
                            <TableCell className="text-right font-medium text-blue-600">{item.completed_quantity}</TableCell>
                            <TableCell className="text-right font-medium text-orange-600">{remainingQty.toFixed(2)}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <div className="flex-1 bg-gray-200 rounded-full h-2 min-w-16">
                                  <div 
                                    className={`h-2 rounded-full ${getProgressColor(progress)}`}
                                    style={{ width: `${Math.min(100, progress)}%` }}
                                  />
                                </div>
                                <span className="text-sm text-gray-600 w-12 text-right">{progress.toFixed(0)}%</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-right">{formatCurrency(actualCost)}</TableCell>
                            <TableCell>{getProgressBadge(progress)}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">暂无数据</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 供应商结算标签页（只读展示） */}
        <TabsContent value="settlements" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">供应商及班组结算</h3>
            <Button variant="outline" onClick={fetchProjectData}>
              <RefreshCw className="w-4 h-4 mr-2" />刷新
            </Button>
          </div>

          {/* 结算统计 */}
          <div className="grid grid-cols-3 gap-4">
            <Card className="border-orange-200 bg-orange-50">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-orange-600">结算总额</p>
                    <p className="text-xl font-bold text-orange-700">{formatCurrency(settlementStats.totalAmount)}</p>
                  </div>
                  <Building2 className="w-8 h-8 text-orange-400" />
                </div>
              </CardContent>
            </Card>
            <Card className="border-blue-200 bg-blue-50">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-blue-600">结算记录</p>
                    <p className="text-2xl font-bold text-blue-700">{settlements.length}</p>
                  </div>
                  <FileText className="w-8 h-8 text-blue-400" />
                </div>
              </CardContent>
            </Card>
            <Card className="border-green-200 bg-green-50">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-green-600">供应商数</p>
                    <p className="text-2xl font-bold text-green-700">{settlementStats.supplierCount}</p>
                  </div>
                  <Building2 className="w-8 h-8 text-green-400" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* 结算表格 */}
          <Card>
            <CardContent className="pt-6">
              {settlements.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>供应商/班组</TableHead>
                        <TableHead>类型</TableHead>
                        <TableHead className="text-right">结算金额</TableHead>
                        <TableHead>结算日期</TableHead>
                        <TableHead>备注</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {settlements.map((settlement) => (
                        <TableRow key={settlement.id}>
                          <TableCell className="font-medium">
                            <SupplierLink id={settlement.supplier_id} name={settlement.supplier_name} />
                          </TableCell>
                          <TableCell>
                            <Badge variant={settlement.supplier_type === 'supplier' ? 'default' : 'secondary'}>
                              {settlement.supplier_type === 'supplier' ? '供应商' : 
                               settlement.supplier_type === 'team' ? '班组' : settlement.supplier_type}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right text-orange-600 font-bold">
                            {formatCurrency(settlement.settlement_amount || 0)}
                          </TableCell>
                          <TableCell>{settlement.settlement_date}</TableCell>
                          <TableCell className="text-gray-500">{settlement.remark || '-'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <p>暂无结算记录</p>
                  <p className="text-sm mt-2">请前往"供应商结算"页面添加结算数据</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 甲方付款标签页（只读展示） */}
        <TabsContent value="clientPayments" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">甲方付款记录</h3>
            <Button variant="outline" onClick={fetchProjectData}>
              <RefreshCw className="w-4 h-4 mr-2" />刷新
            </Button>
          </div>

          {/* 甲方付款统计 */}
          <div className="grid grid-cols-4 gap-4">
            <Card className="border-green-200 bg-green-50">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-green-600">付款总额</p>
                    <p className="text-xl font-bold text-green-700">{formatCurrency(clientPaymentStats.totalAmount)}</p>
                  </div>
                  <DollarSign className="w-8 h-8 text-green-400" />
                </div>
              </CardContent>
            </Card>
            <Card className="border-blue-200 bg-blue-50">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-blue-600">已确认</p>
                    <p className="text-xl font-bold text-blue-700">{formatCurrency(clientPaymentStats.completedAmount)}</p>
                  </div>
                  <CheckCircle2 className="w-8 h-8 text-blue-400" />
                </div>
              </CardContent>
            </Card>
            <Card className="border-orange-200 bg-orange-50">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-orange-600">待确认</p>
                    <p className="text-xl font-bold text-orange-700">{formatCurrency(clientPaymentStats.pendingAmount)}</p>
                  </div>
                  <Calendar className="w-8 h-8 text-orange-400" />
                </div>
              </CardContent>
            </Card>
            <Card className="border-purple-200 bg-purple-50">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-purple-600">付款记录</p>
                    <p className="text-2xl font-bold text-purple-700">{clientPaymentStats.count}</p>
                  </div>
                  <FileText className="w-8 h-8 text-purple-400" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* 甲方付款表格 */}
          <Card>
            <CardContent className="pt-6">
              {clientPayments.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">付款金额</TableHead>
                        <TableHead>付款日期</TableHead>
                        <TableHead>付款方式</TableHead>
                        <TableHead>状态</TableHead>
                        <TableHead>备注</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {clientPayments.map((payment) => (
                        <TableRow key={payment.id}>
                          <TableCell className="text-right text-green-600 font-bold">
                            {formatCurrency(parseFloat(payment.payment_amount))}
                          </TableCell>
                          <TableCell>{payment.payment_date}</TableCell>
                          <TableCell>
                            {payment.payment_method === 'bank_transfer' ? '银行转账' : 
                             payment.payment_method === 'cash' ? '现金' : 
                             payment.payment_method === 'check' ? '支票' : payment.payment_method || '-'}
                          </TableCell>
                          <TableCell>
                            <Badge variant={payment.status === 'completed' ? 'default' : 'secondary'}>
                              {payment.status === 'completed' ? '已确认' : '待确认'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-gray-500">{payment.remark || '-'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <p>暂无甲方付款记录</p>
                  <p className="text-sm mt-2">请前往"甲方付款"页面添加付款数据</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 产值结算标签页（只读展示） */}
        <TabsContent value="clientReports" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">产值结算</h3>
            <Button variant="outline" onClick={fetchProjectData}>
              <RefreshCw className="w-4 h-4 mr-2" />刷新
            </Button>
          </div>

          {/* 产值结算统计 */}
          <div className="grid grid-cols-5 gap-4">
            <Card className="border-blue-200 bg-blue-50">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-blue-600">结算金额</p>
                    <p className="text-xl font-bold text-blue-700">{formatCurrency(clientReportStats.totalSettlement)}</p>
                  </div>
                  <FileText className="w-8 h-8 text-blue-400" />
                </div>
              </CardContent>
            </Card>
            <Card className="border-green-200 bg-green-50">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-green-600">开票金额</p>
                    <p className="text-xl font-bold text-green-700">{formatCurrency(clientReportStats.totalInvoice)}</p>
                  </div>
                  <FileText className="w-8 h-8 text-green-400" />
                </div>
              </CardContent>
            </Card>
            <Card className="border-red-200 bg-red-50">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-red-600">扣款金额</p>
                    <p className="text-xl font-bold text-red-700">{formatCurrency(clientReportStats.totalDeduction)}</p>
                  </div>
                  <DollarSign className="w-8 h-8 text-red-400" />
                </div>
              </CardContent>
            </Card>
            <Card className="border-purple-200 bg-purple-50">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-purple-600">按比例付款</p>
                    <p className="text-xl font-bold text-purple-700">{formatCurrency(clientReportStats.totalProportional)}</p>
                  </div>
                  <CreditCard className="w-8 h-8 text-purple-400" />
                </div>
              </CardContent>
            </Card>
            <Card className="border-orange-200 bg-orange-50">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-orange-600">结算记录</p>
                    <p className="text-2xl font-bold text-orange-700">{clientReportStats.count}</p>
                  </div>
                  <Calendar className="w-8 h-8 text-orange-400" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* 产值结算表格 */}
          <Card>
            <CardContent className="pt-6">
              {clientReports.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">结算金额</TableHead>
                        <TableHead className="text-right">开票金额</TableHead>
                        <TableHead className="text-right">扣款金额</TableHead>
                        <TableHead className="text-right">按比例付款</TableHead>
                        <TableHead>结算日期</TableHead>
                        <TableHead>备注</TableHead>
                        <TableHead className="text-center">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {clientReports.map((report) => (
                        <TableRow key={report.id}>
                          <TableCell className="text-right text-blue-600 font-bold">
                            {formatCurrency(parseFloat(report.settlement_amount))}
                          </TableCell>
                          <TableCell className="text-right text-green-600 font-medium">
                            {report.invoice_amount ? formatCurrency(parseFloat(report.invoice_amount)) : '-'}
                          </TableCell>
                          <TableCell className="text-right text-red-600 font-medium">
                            {report.deduction_amount ? formatCurrency(parseFloat(report.deduction_amount)) : '-'}
                          </TableCell>
                          <TableCell className="text-right text-purple-600 font-medium">
                            {report.proportional_payment ? formatCurrency(parseFloat(report.proportional_payment)) : '-'}
                          </TableCell>
                          <TableCell>{report.report_date?.split('T')[0]}</TableCell>
                          <TableCell className="text-gray-500">{report.remark || '-'}</TableCell>
                          <TableCell className="text-center">
                            <div className="flex justify-center gap-2">
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                onClick={() => handleEditClientReport(report)}
                                className="h-8 px-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                              >
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                onClick={() => handleDeleteClientReport(report)}
                                className="h-8 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <p>暂无产值结算记录</p>
                  <p className="text-sm mt-2">请前往"产值结算"页面添加结算数据</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 综合费用标签页 */}
        <TabsContent value="comprehensiveExpenses" className="space-y-4">
          <ProjectExpenses projectId={params.id as unknown as number} />
        </TabsContent>

        {/* 零星材料标签页 */}
        <TabsContent value="miscMaterials" className="space-y-4">
          <ProjectMiscMaterials projectId={params.id as unknown as number} />
        </TabsContent>

        {/* 供应商付款标签页 */}
        <TabsContent value="supplierPayments" className="space-y-4">
          <ProjectSupplierPayments projectId={params.id as unknown as number} />
        </TabsContent>
      </Tabs>

      {/* 产值结算编辑对话框 */}
      <Dialog open={clientReportEditDialogOpen} onOpenChange={setClientReportEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑产值结算</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>结算金额</Label>
                <Input
                  type="number"
                  value={clientReportForm.settlement_amount}
                  onChange={(e) => setClientReportForm({ ...clientReportForm, settlement_amount: e.target.value })}
                  placeholder="结算金额"
                />
              </div>
              <div>
                <Label>开票金额</Label>
                <Input
                  type="number"
                  value={clientReportForm.invoice_amount}
                  onChange={(e) => setClientReportForm({ ...clientReportForm, invoice_amount: e.target.value })}
                  placeholder="开票金额"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>扣款金额</Label>
                <Input
                  type="number"
                  value={clientReportForm.deduction_amount}
                  onChange={(e) => setClientReportForm({ ...clientReportForm, deduction_amount: e.target.value })}
                  placeholder="扣款金额"
                />
              </div>
              <div>
                <Label>按比例付款</Label>
                <Input
                  type="number"
                  value={clientReportForm.proportional_payment}
                  onChange={(e) => setClientReportForm({ ...clientReportForm, proportional_payment: e.target.value })}
                  placeholder="按比例付款"
                />
              </div>
            </div>
            <div>
              <Label>结算日期</Label>
              <Input
                type="date"
                value={clientReportForm.report_date}
                onChange={(e) => setClientReportForm({ ...clientReportForm, report_date: e.target.value })}
              />
            </div>
            <div>
              <Label>备注</Label>
              <Textarea
                value={clientReportForm.remark}
                onChange={(e) => setClientReportForm({ ...clientReportForm, remark: e.target.value })}
                placeholder="备注信息"
                rows={3}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setClientReportEditDialogOpen(false)}>取消</Button>
            <Button onClick={handleSaveClientReport}>保存</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 产值结算删除确认对话框 */}
      <Dialog open={clientReportDeleteDialogOpen} onOpenChange={setClientReportDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
          </DialogHeader>
          <p className="py-4">确定要删除该产值结算记录吗？</p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setClientReportDeleteDialogOpen(false)}>取消</Button>
            <Button variant="destructive" onClick={handleConfirmDeleteClientReport}>删除</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
