'use client';
import { useToast } from '@/hooks/use-toast';

import { useState, useEffect, useRef, useMemo, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
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
  BarChart3, ListTree, Target, CheckCircle2, TrendingUp,
  Building2, RefreshCw, Plus, Pencil, Trash2, Upload, Download,
  Search, X, FileSpreadsheet, FileText, AlertTriangle, Calendar, Save, Copy, Layers
} from 'lucide-react';
import { AnimatedNumber, formatCurrency } from '@/components/ui/animated-number';

// 类型定义
interface Project {
  id: number;
  name: string;
  year: number;
  status: string;
  contract_amount: string | null;
}

interface WorkItemSubitem {
  id: number;
  project_id: number;
  project_name: string;
  subitem_name: string;
  unit: string;
  budget_quantity: string;
  completed_quantity: string;
  settlement_quantity: string | null;
  contract_price: string | null;
  limit_price: string | null;
  remark: string | null;
}

interface InternalAddonTemplate {
  id: number;
  name: string;
  unit: string;
  default_price: string | null;
  remark: string | null;
}

interface ProjectInternalAddon {
  id: number;
  project_id: number;
  template_id: number | null;
  name: string;
  unit: string;
  unit_price: string | null;
  remark: string | null;
  total_quantity?: string;
  total_amount?: string;
}

export default function WorkItemsPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-12 h-12 mx-auto mb-4 border-4 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
          <p style={{ color: '#86909C' }}>加载中...</p>
        </div>
      </div>
    }>
      <WorkItemsContent />
    </Suspense>
  );
}

function WorkItemsContent() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [allSubitems, setAllSubitems] = useState<WorkItemSubitem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showContent, setShowContent] = useState(false);
  
  // 当前选中的项目
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  
  // 预警筛选模式
  const [warningFilter, setWarningFilter] = useState<string>('');
  
  // 预算工程量相关状态
  const [searchKeyword, setSearchKeyword] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  
  // 新增/编辑对话框
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [batchDialogOpen, setBatchDialogOpen] = useState(false);
  const [monthlyReportDialogOpen, setMonthlyReportDialogOpen] = useState(false);
  const [monthlyReportHistoryOpen, setMonthlyReportHistoryOpen] = useState(false);
  const [monthlyReports, setMonthlyReports] = useState<any[]>([]);
  const [monthlyReportHistory, setMonthlyReportHistory] = useState<any[]>([]);
  const [importing, setImporting] = useState(false);
  const [adding, setAdding] = useState(false);
  const [currentSubitem, setCurrentSubitem] = useState<WorkItemSubitem | null>(null);
  const [selectedSubitem, setSelectedSubitem] = useState<any>(null);
  const [form, setForm] = useState({
    subitem_name: '',
    unit: '',
    budget_quantity: '',
    contract_price: '',
    remark: '',
  });
  const [batchText, setBatchText] = useState('');
  const [uploadFileName, setUploadFileName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // 对上报量编辑
  const [budgetEditDialogOpen, setBudgetEditDialogOpen] = useState(false);
  const [budgetEditItem, setBudgetEditItem] = useState<WorkItemSubitem | null>(null);
  const [budgetForm, setBudgetForm] = useState({
    budget_quantity: '',
    contract_price: '',
    limit_price: '',
  });
  
  // 月度对上报量功能
  const [selectedYearMonth, setSelectedYearMonth] = useState<string>('');
  const [monthlyReportRecords, setMonthlyReportRecords] = useState<any[]>([]);
  const [monthlyReportLoading, setMonthlyReportLoading] = useState(false);
  
  // 月度报量编辑功能
  const [monthlyReportEditDialogOpen, setMonthlyReportEditDialogOpen] = useState(false);
  const [monthlyReportEditRecord, setMonthlyReportEditRecord] = useState<any>(null);
  const [monthlyReportEditForm, setMonthlyReportEditForm] = useState({
    report_quantity: '',
    remark: '',
  });

  // 月度对下结算量功能
  const [monthlySettlementDialogOpen, setMonthlySettlementDialogOpen] = useState(false);
  const [settlementYearMonth, setSettlementYearMonth] = useState<string>('');
  const [monthlySettlementRecords, setMonthlySettlementRecords] = useState<any[]>([]);
  const [monthlyAddonSettlementRecords, setMonthlyAddonSettlementRecords] = useState<any[]>([]);
  const [monthlySettlementLoading, setMonthlySettlementLoading] = useState(false);

  // 内部附加清单
  const [addonTemplates, setAddonTemplates] = useState<InternalAddonTemplate[]>([]);
  const [projectAddons, setProjectAddons] = useState<ProjectInternalAddon[]>([]);
  const [addonLoading, setAddonLoading] = useState(false);
  const [addonSaving, setAddonSaving] = useState(false);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [projectAddonDialogOpen, setProjectAddonDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<InternalAddonTemplate | null>(null);
  const [editingProjectAddon, setEditingProjectAddon] = useState<ProjectInternalAddon | null>(null);
  const [templateForm, setTemplateForm] = useState({ name: '', unit: '', default_price: '', remark: '' });
  const [projectAddonForm, setProjectAddonForm] = useState({ name: '', unit: '', unit_price: '', remark: '' });
  
  // 对下结算量编辑功能
  const [settlementEditDialogOpen, setSettlementEditDialogOpen] = useState(false);
  const [settlementEditRecord, setSettlementEditRecord] = useState<any>(null);
  const [settlementEditForm, setSettlementEditForm] = useState({
    completed_quantity: '',
    remark: '',
  });
  
  // 对下结算量历史记录
  const [settlementHistoryOpen, setSettlementHistoryOpen] = useState(false);
  const [settlementHistory, setSettlementHistory] = useState<any[]>([]);
  const [settlementHistoryLoading, setSettlementHistoryLoading] = useState(false);

  // 对上报量历史记录（独立于月度对话框）
  const [reportHistoryOpen, setReportHistoryOpen] = useState(false);
  const [reportHistoryItem, setReportHistoryItem] = useState<WorkItemSubitem | null>(null);
  const [reportHistoryData, setReportHistoryData] = useState<any[]>([]);
  const [reportHistoryLoading, setReportHistoryLoading] = useState(false);

  // 对上报量历史编辑
  const [reportHistoryEditDialogOpen, setReportHistoryEditDialogOpen] = useState(false);
  const [reportHistoryEditRecord, setReportHistoryEditRecord] = useState<any>(null);
  const [reportHistoryEditForm, setReportHistoryEditForm] = useState({
    report_quantity: '',
    remark: '',
  });

  // 对下结算量历史（独立于月度对话框）
  const [settleHistoryOpen, setSettleHistoryOpen] = useState(false);
  const [settleHistoryItem, setSettleHistoryItem] = useState<WorkItemSubitem | null>(null);
  const [settleHistoryData, setSettleHistoryData] = useState<any[]>([]);
  const [settleHistoryLoading, setSettleHistoryLoading] = useState(false);

  // 对下结算量历史编辑
  const [settleHistoryEditDialogOpen, setSettleHistoryEditDialogOpen] = useState(false);
  const [settleHistoryEditRecord, setSettleHistoryEditRecord] = useState<any>(null);
  const [settleHistoryEditForm, setSettleHistoryEditForm] = useState({
    completed_quantity: '',
    remark: '',
  });

  // 差异分析
  const [analysisYearMonth, setAnalysisYearMonth] = useState<string>('');
  const [analysisReports, setAnalysisReports] = useState<any[]>([]);
  const [analysisSettlements, setAnalysisSettlements] = useState<any[]>([]);
  const [analysisAddonSettlements, setAnalysisAddonSettlements] = useState<any[]>([]);
  const [analysisLoading, setAnalysisLoading] = useState(false);

  useEffect(() => {
    fetchData();
    fetchAddonTemplates();
  }, []);

  // 处理 URL 参数
  useEffect(() => {
    const projectIdParam = searchParams.get('projectId');
    const warningParam = searchParams.get('warning');
    
    if (projectIdParam) {
      setSelectedProjectId(projectIdParam);
    }
    if (warningParam) {
      setWarningFilter(warningParam);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!loading) {
      const timer = setTimeout(() => setShowContent(true), 50);
      return () => clearTimeout(timer);
    }
  }, [loading]);

  useEffect(() => {
    if (!analysisYearMonth) {
      setAnalysisYearMonth(getCurrentYearMonth());
    }
  }, [analysisYearMonth]);

  useEffect(() => {
    if (selectedProjectId && analysisYearMonth) {
      fetchAnalysisRecords();
    } else {
      setAnalysisReports([]);
      setAnalysisSettlements([]);
      setAnalysisAddonSettlements([]);
    }
  }, [selectedProjectId, analysisYearMonth, allSubitems, projectAddons]);

  useEffect(() => {
    if (selectedProjectId) {
      fetchProjectAddons(selectedProjectId);
    } else {
      setProjectAddons([]);
      setMonthlyAddonSettlementRecords([]);
    }
  }, [selectedProjectId]);

  const fetchData = async () => {
    setLoading(true);
    setShowContent(false);
    try {
      const [projectsRes, subitemsRes] = await Promise.all([
        fetch('/api/projects', { credentials: 'include' }),
        fetch('/api/work-item-subitems', { credentials: 'include' })
      ]);
      const projectsData = await projectsRes.json();
      const subitemsData = await subitemsRes.json();
      setProjects(projectsData.projects || []);
      setAllSubitems(subitemsData.subitems || []);
    } catch (error) {
      console.error('获取数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAddonTemplates = async () => {
    try {
      const res = await fetch('/api/internal-addon-templates', { credentials: 'include' });
      const data = await res.json();
      setAddonTemplates(data.templates || []);
    } catch (error) {
      console.error('获取内部附加清单模板失败:', error);
      setAddonTemplates([]);
    }
  };

  const fetchProjectAddons = async (projectId = selectedProjectId) => {
    if (!projectId) return;
    setAddonLoading(true);
    try {
      const res = await fetch(`/api/project-internal-addons?project_id=${projectId}`, { credentials: 'include' });
      const data = await res.json();
      setProjectAddons(data.addons || []);
    } catch (error) {
      console.error('获取项目内部附加清单失败:', error);
      setProjectAddons([]);
    } finally {
      setAddonLoading(false);
    }
  };

  const resetTemplateForm = () => {
    setEditingTemplate(null);
    setTemplateForm({ name: '', unit: '', default_price: '', remark: '' });
  };

  const resetProjectAddonForm = () => {
    setEditingProjectAddon(null);
    setProjectAddonForm({ name: '', unit: '', unit_price: '', remark: '' });
  };

  const openTemplateDialog = (template?: InternalAddonTemplate) => {
    if (template) {
      setEditingTemplate(template);
      setTemplateForm({
        name: template.name || '',
        unit: template.unit || '',
        default_price: template.default_price || '',
        remark: template.remark || '',
      });
    } else {
      resetTemplateForm();
    }
    setTemplateDialogOpen(true);
  };

  const openProjectAddonDialog = (addon?: ProjectInternalAddon) => {
    if (addon) {
      setEditingProjectAddon(addon);
      setProjectAddonForm({
        name: addon.name || '',
        unit: addon.unit || '',
        unit_price: addon.unit_price || '',
        remark: addon.remark || '',
      });
    } else {
      resetProjectAddonForm();
    }
    setProjectAddonDialogOpen(true);
  };

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!templateForm.name.trim() || !templateForm.unit.trim()) {
      toast({ title: '验证失败', description: '请输入清单名称和单位', variant: 'warning' });
      return;
    }

    setAddonSaving(true);
    try {
      const res = await fetch('/api/internal-addon-templates', {
        method: editingTemplate ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          id: editingTemplate?.id,
          ...templateForm,
        }),
      });

      if (res.ok) {
        toast({ title: '保存成功', description: '公司通用模板已更新', variant: 'success' });
        setTemplateDialogOpen(false);
        resetTemplateForm();
        fetchAddonTemplates();
      } else {
        const error = await res.json();
        toast({ title: '保存失败', description: error.error || '操作失败', variant: 'error' });
      }
    } catch (error) {
      toast({ title: '保存失败', description: '网络错误，请重试', variant: 'error' });
    } finally {
      setAddonSaving(false);
    }
  };

  const handleDeleteTemplate = async (id: number) => {
    if (!confirm('确定删除该公司通用模板吗？已导入项目的清单不会受影响。')) return;

    try {
      const res = await fetch(`/api/internal-addon-templates?ids=${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.ok) {
        toast({ title: '删除成功', description: '公司通用模板已删除', variant: 'success' });
        fetchAddonTemplates();
      } else {
        const error = await res.json();
        toast({ title: '删除失败', description: error.error || '操作失败', variant: 'error' });
      }
    } catch (error) {
      toast({ title: '删除失败', description: '网络错误，请重试', variant: 'error' });
    }
  };

  const handleImportAddonTemplates = async () => {
    if (!selectedProjectId) {
      toast({ title: '提示', description: '请先选择项目', variant: 'warning' });
      return;
    }

    setAddonSaving(true);
    try {
      const res = await fetch('/api/project-internal-addons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'import_templates', project_id: selectedProjectId }),
      });
      const data = await res.json();

      if (res.ok) {
        toast({
          title: '导入完成',
          description: data.importedCount > 0 ? `已导入 ${data.importedCount} 条内部附加清单` : '当前项目已包含全部模板',
          variant: 'success',
        });
        fetchProjectAddons();
      } else {
        toast({ title: '导入失败', description: data.error || '操作失败', variant: 'error' });
      }
    } catch (error) {
      toast({ title: '导入失败', description: '网络错误，请重试', variant: 'error' });
    } finally {
      setAddonSaving(false);
    }
  };

  const handleSaveProjectAddon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProjectId) {
      toast({ title: '提示', description: '请先选择项目', variant: 'warning' });
      return;
    }
    if (!projectAddonForm.name.trim() || !projectAddonForm.unit.trim()) {
      toast({ title: '验证失败', description: '请输入清单名称和单位', variant: 'warning' });
      return;
    }

    setAddonSaving(true);
    try {
      const res = await fetch('/api/project-internal-addons', {
        method: editingProjectAddon ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          id: editingProjectAddon?.id,
          project_id: selectedProjectId,
          ...projectAddonForm,
        }),
      });

      if (res.ok) {
        toast({ title: '保存成功', description: '项目内部附加清单已更新', variant: 'success' });
        setProjectAddonDialogOpen(false);
        resetProjectAddonForm();
        fetchProjectAddons();
      } else {
        const error = await res.json();
        toast({ title: '保存失败', description: error.error || '操作失败', variant: 'error' });
      }
    } catch (error) {
      toast({ title: '保存失败', description: '网络错误，请重试', variant: 'error' });
    } finally {
      setAddonSaving(false);
    }
  };

  const handleDeleteProjectAddon = async (id: number) => {
    if (!confirm('确定删除该项目内部附加清单吗？历史结算记录会保留，但该清单不再显示。')) return;

    try {
      const res = await fetch(`/api/project-internal-addons?ids=${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.ok) {
        toast({ title: '删除成功', description: '项目内部附加清单已删除', variant: 'success' });
        fetchProjectAddons();
      } else {
        const error = await res.json();
        toast({ title: '删除失败', description: error.error || '操作失败', variant: 'error' });
      }
    } catch (error) {
      toast({ title: '删除失败', description: '网络错误，请重试', variant: 'error' });
    }
  };

  // 当前项目的子项数据
  const subitems = useMemo(() => {
    if (!selectedProjectId) return [];
    let items = allSubitems.filter(s => s.project_id === parseInt(selectedProjectId));
    
    // 如果有预警筛选
    if (warningFilter === 'overbudget') {
      // 超预算预警：完成量超过预算量
      items = items.filter(item => {
        const budget = parseFloat(item.budget_quantity) || 0;
        const completed = parseFloat(item.completed_quantity) || 0;
        return budget > 0 && completed > budget;
      });
    } else if (warningFilter === 'progress') {
      // 进度预警：进度超过80%
      items = items.filter(item => {
        const budget = parseFloat(item.budget_quantity) || 0;
        const completed = parseFloat(item.completed_quantity) || 0;
        return budget > 0 && (completed / budget) > 0.8 && completed <= budget;
      });
    }
    
    return items;
  }, [allSubitems, selectedProjectId, warningFilter]);

  // 总体统计
  const overallStats = useMemo(() => ({
    totalProjects: projects.length,
    totalSubitems: allSubitems.length,
    totalBudget: allSubitems.reduce((sum, item) => {
      const qty = parseFloat(item.budget_quantity) || 0;
      const price = parseFloat(item.contract_price || '0') || 0;
      return sum + qty * price;
    }, 0),
    totalCompleted: allSubitems.reduce((sum, item) => {
      const qty = parseFloat(item.completed_quantity) || 0;
      const price = parseFloat(item.contract_price || '0') || 0;
      return sum + qty * price;
    }, 0),
    activeProjects: projects.filter(p => p.status === '进行中').length,
  }), [projects, allSubitems]);

  const addonStats = useMemo(() => {
    const totalQuantity = projectAddons.reduce((sum, item) => sum + (parseFloat(item.total_quantity || '0') || 0), 0);
    const totalAmount = projectAddons.reduce((sum, item) => sum + (parseFloat(item.total_amount || '0') || 0), 0);
    return {
      totalItems: projectAddons.length,
      totalQuantity,
      totalAmount,
    };
  }, [projectAddons]);

  // 当前项目统计
  const projectStats = useMemo(() => ({
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
    totalSettlement: subitems.reduce((sum, item) => {
      const qty = parseFloat(item.settlement_quantity || '0') || 0;
      const price = parseFloat(item.contract_price || '0') || 0;
      return sum + qty * price;
    }, 0) + addonStats.totalAmount,
    warningItems: subitems.filter(item => {
      const budget = parseFloat(item.budget_quantity) || 0;
      const completed = parseFloat(item.completed_quantity) || 0;
      return budget > 0 && (completed / budget) > 0.8;
    }).length,
  }), [subitems, addonStats.totalAmount]);

  const analysisStats = useMemo(() => {
    const monthlyReportMap = new Map<number, number>();
    analysisReports.forEach(record => {
      monthlyReportMap.set(Number(record.subitem_id), parseFloat(record.report_quantity || '0') || 0);
    });

    const monthlySettlementMap = new Map<number, number>();
    analysisSettlements.forEach(record => {
      monthlySettlementMap.set(Number(record.subitem_id), parseFloat(record.completed_quantity || '0') || 0);
    });

    const monthlyAddonSettlementMap = new Map<number, any>();
    analysisAddonSettlements.forEach(record => {
      monthlyAddonSettlementMap.set(Number(record.addon_id), record);
    });

    const rows = subitems.map(item => {
      const budgetQty = parseFloat(item.budget_quantity || '0') || 0;
      const totalReportedQty = parseFloat(item.completed_quantity || '0') || 0;
      const totalSettledQty = parseFloat(item.settlement_quantity || '0') || 0;
      const monthlyReportedQty = monthlyReportMap.get(item.id) || 0;
      const monthlySettledQty = monthlySettlementMap.get(item.id) || 0;
      const contractPrice = parseFloat(item.contract_price || '0') || 0;
      const limitPrice = parseFloat(item.limit_price || item.contract_price || '0') || 0;
      const reportAmount = totalReportedQty * contractPrice;
      const settlementAmount = totalSettledQty * limitPrice;
      const monthlyReportAmount = monthlyReportedQty * contractPrice;
      const monthlySettlementAmount = monthlySettledQty * limitPrice;
      const reportRemainingQty = budgetQty - totalReportedQty;
      const settleRemainingQty = budgetQty - totalSettledQty;
      const quantityGap = totalReportedQty - totalSettledQty;
      const amountGap = reportAmount - settlementAmount;
      const risks: string[] = [];

      if (totalSettledQty > totalReportedQty) risks.push('多结少报');
      if (monthlySettledQty > 0 && monthlyReportedQty <= 0) risks.push('本月漏报');
      if (budgetQty > 0 && reportRemainingQty / budgetQty < 0.1) risks.push('对上余量不足');
      if (settlementAmount > reportAmount) risks.push('金额倒挂');
      if (budgetQty > 0 && totalSettledQty > budgetQty) risks.push('对下超预算量');

      return {
        ...item,
        isAddon: false,
        budgetQty,
        totalReportedQty,
        totalSettledQty,
        monthlyReportedQty,
        monthlySettledQty,
        contractPrice,
        limitPrice,
        reportAmount,
        settlementAmount,
        monthlyReportAmount,
        monthlySettlementAmount,
        reportRemainingQty,
        settleRemainingQty,
        quantityGap,
        amountGap,
        risks,
      };
    });

    const addonRows = projectAddons.map(addon => {
      const monthlyRecord = monthlyAddonSettlementMap.get(addon.id);
      const monthlyQty = parseFloat(monthlyRecord?.quantity || '0') || 0;
      const unitPrice = parseFloat(monthlyRecord?.unit_price || addon.unit_price || '0') || 0;
      const totalAmount = parseFloat(addon.total_amount || '0') || 0;
      const monthlyAmount = monthlyQty * unitPrice;
      const risks = totalAmount > 0 ? ['内部附加成本'] : [];

      return {
        id: `addon-${addon.id}`,
        isAddon: true,
        subitem_name: addon.name,
        unit: addon.unit,
        budgetQty: 0,
        totalReportedQty: 0,
        totalSettledQty: parseFloat(addon.total_quantity || '0') || 0,
        monthlyReportedQty: 0,
        monthlySettledQty: monthlyQty,
        contractPrice: 0,
        limitPrice: unitPrice,
        reportAmount: 0,
        settlementAmount: totalAmount,
        monthlyReportAmount: 0,
        monthlySettlementAmount: monthlyAmount,
        reportRemainingQty: 0,
        settleRemainingQty: 0,
        quantityGap: 0,
        amountGap: -totalAmount,
        risks,
      };
    });

    const allRows = [...rows, ...addonRows];
    const summary = allRows.reduce((acc, row) => {
      acc.monthlyReportAmount += row.monthlyReportAmount;
      acc.monthlySettlementAmount += row.monthlySettlementAmount;
      acc.totalReportAmount += row.reportAmount;
      acc.totalSettlementAmount += row.settlementAmount;
      acc.riskCount += row.risks.length > 0 ? 1 : 0;
      return acc;
    }, {
      monthlyReportAmount: 0,
      monthlySettlementAmount: 0,
      totalReportAmount: 0,
      totalSettlementAmount: 0,
      riskCount: 0,
    });

    return {
      rows: allRows,
      ...summary,
      monthlyAmountGap: summary.monthlyReportAmount - summary.monthlySettlementAmount,
      totalAmountGap: summary.totalReportAmount - summary.totalSettlementAmount,
    };
  }, [subitems, projectAddons, analysisReports, analysisSettlements, analysisAddonSettlements]);

  // 刷新数据
  const refreshSubitems = async () => {
    try {
      const res = await fetch('/api/work-item-subitems', { credentials: 'include' });
      const data = await res.json();
      setAllSubitems(data.subitems || []);
    } catch (error) {
      console.error('刷新数据失败:', error);
    }
  };

  // 清除预警筛选
  const clearWarningFilter = () => {
    setWarningFilter('');
    // 清除 URL 参数
    const newUrl = window.location.pathname;
    router.replace(newUrl);
  };

  // 获取预警筛选标题
  const getWarningTitle = () => {
    if (warningFilter === 'overbudget') return '超预算预警';
    if (warningFilter === 'progress') return '进度预警（>80%）';
    return '';
  };

  // ========== 预算工程量功能 ==========
  
  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // 表单验证
    if (!form.subitem_name.trim()) {
      toast({ title: '验证失败', description: '请输入分项名称', variant: 'error' });
      return;
    }
    if (!form.unit.trim()) {
      toast({ title: '验证失败', description: '请输入单位', variant: 'error' });
      return;
    }
    
    try {
      setAdding(true);
      const res = await fetch('/api/work-item-subitems', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          project_id: selectedProjectId,
          subitem_name: form.subitem_name,
          unit: form.unit,
          budget_quantity: form.budget_quantity || '0',
          contract_price: form.contract_price || null,
          completed_quantity: '0',
          limit_price: null,
          remark: form.remark || null,
        }),
      });
      
      if (res.ok) {
        setAddDialogOpen(false);
        resetForm();
        refreshSubitems();
        toast({ title: '添加成功', description: '分项工程已添加', variant: 'success' });
      } else {
        const error = await res.json();
        toast({ title: '添加失败', description: error.error || '操作失败', variant: 'error' });
      }
    } catch (error) {
      toast({ title: '添加失败', description: '网络错误，请重试', variant: 'error' });
    } finally {
      setAdding(false);
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentSubitem) return;
    
    // 表单验证
    if (!form.subitem_name.trim()) {
      toast({ title: '验证失败', description: '请输入分项名称', variant: 'error' });
      return;
    }
    if (!form.unit.trim()) {
      toast({ title: '验证失败', description: '请输入单位', variant: 'error' });
      return;
    }
    
    try {
      const res = await fetch('/api/work-item-subitems', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          id: currentSubitem.id,
          subitem_name: form.subitem_name,
          unit: form.unit,
          budget_quantity: form.budget_quantity || '0',
          contract_price: form.contract_price || null,
          remark: form.remark || null,
        }),
      });
      
      if (res.ok) {
        setEditDialogOpen(false);
        resetForm();
        setCurrentSubitem(null);
        refreshSubitems();
        toast({ title: '修改成功', description: '分项工程已更新', variant: 'success' });
      } else {
        const error = await res.json();
        toast({ title: '修改失败', description: error.error || '操作失败', variant: 'error' });
      }
    } catch (error) {
      toast({ title: '修改失败', description: '网络错误，请重试', variant: 'error' });
    }
  };

  const handleBatchAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!batchText.trim()) {
      toast({ title: '验证失败', description: '请输入数据', variant: 'warning' });
      return;
    }
    if (!selectedProjectId) {
      toast({ title: '验证失败', description: '请先选择项目', variant: 'warning' });
      return;
    }
    
    try {
      // 智能解析：尝试自动识别列顺序
      const lines = batchText.trim().split('\n').filter(l => l.trim());
      const headerLine = lines[0];
      const hasHeader = headerLine.includes('分项名称') || headerLine.includes('子项名称') || headerLine.includes('名称');
      const dataLines = hasHeader ? lines.slice(1) : lines;
      
      // 解析头部获取列映射
      let colMap: Record<string, number> = {};
      if (hasHeader) {
        const headerParts = headerLine.split(/[,\t，]/).map(p => p.trim().replace(/^["']|["']$/g, ''));
        headerParts.forEach((h, idx) => {
          const hLower = h.toLowerCase();
          if (hLower.includes('名称') || hLower.includes('name')) colMap.subitem_name = idx;
          else if (hLower.includes('单位') || hLower === 'unit') colMap.unit = idx;
          else if (hLower.includes('预算') || hLower.includes('工程量') || hLower.includes('数量') || hLower.includes('quantity')) colMap.budget_quantity = idx;
          else if (hLower.includes('合同') || hLower.includes('单价') || hLower.includes('price')) colMap.contract_price = idx;
          else if (hLower.includes('备注') || hLower.includes('remark')) colMap.remark = idx;
        });
      }
      
      const items = dataLines.map(line => {
        const parts = line.split(/[,\t，]/).map(p => p.trim().replace(/^["']|["']$/g, ''));
        
        let subitem_name: string, unit: string, budget_quantity: string, contract_price: string | null, remark: string | null;
        
        if (Object.keys(colMap).length >= 2) {
          // 使用列映射
          subitem_name = (colMap.subitem_name !== undefined ? parts[colMap.subitem_name] : parts[0]) || '';
          unit = (colMap.unit !== undefined ? parts[colMap.unit] : parts[1]) || '';
          budget_quantity = (colMap.budget_quantity !== undefined ? parts[colMap.budget_quantity] : parts[2]) || '0';
          contract_price = (colMap.contract_price !== undefined ? parts[colMap.contract_price] : parts[3]) || null;
          remark = (colMap.remark !== undefined ? parts[colMap.remark] : parts[4]) || null;
        } else {
          // 默认顺序：分项名称, 单位, 预算量, 合同单价, 备注
          subitem_name = parts[0] || '';
          unit = parts[1] || '';
          budget_quantity = parts[2] || '0';
          contract_price = parts[3] || null;
          remark = parts[4] || null;
        }
        
        // 清理数值字段：提取前导数字部分，忽略后面的单位文字
        const cleanNumber = (val: string | null): string | null => {
          if (!val) return null;
          const match = String(val).trim().match(/^[-+]?\d*\.?\d+/);
          return match ? match[0] : null;
        };
        
        return {
          subitem_name,
          unit,
          budget_quantity: cleanNumber(budget_quantity) || '0',
          contract_price: cleanNumber(contract_price),
          remark,
        };
      }).filter(item => item.subitem_name && item.unit);
      
      if (items.length === 0) {
        toast({ title: '验证失败', description: '没有有效数据', variant: 'warning' });
        return;
      }
      
      const res = await fetch('/api/work-item-subitems/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          project_id: selectedProjectId,
          subitems: items,
        }),
      });
      
      const data = await res.json();
      
      if (res.ok && data.success) {
        const inserted = data.inserted ?? data.count ?? 0;
        const duplicates = data.duplicates ?? 0;
        
        setBatchDialogOpen(false);
        setBatchText('');
        refreshSubitems();
        
        let description = `成功添加 ${inserted} 条记录`;
        if (duplicates > 0) {
          description += `，${duplicates} 条重复数据已跳过`;
        }
        
        toast({ 
          title: '批量导入完成', 
          description,
          variant: inserted > 0 ? 'success' : 'warning'
        });
      } else {
        toast({ title: '导入失败', description: data.error || '操作失败', variant: 'error' });
      }
    } catch (error) {
      toast({ title: '添加失败', description: '网络错误，请重试', variant: 'error' });
    }
  };

  // 月度报量Excel导入
  const monthlyReportFileRef = useRef<HTMLInputElement>(null);
  const [monthlyReportImporting, setMonthlyReportImporting] = useState(false);

  const handleMonthlyReportImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (!selectedYearMonth) {
      toast({ title: '请先选择年月', description: '在导入前请先在弹窗中选择要录入的月份', variant: 'error' });
      e.target.value = '';
      return;
    }
    
    setMonthlyReportImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('project_id', String(selectedProjectId));
      formData.append('report_type', '对上报量');
      formData.append('year_month', selectedYearMonth);
      
      const res = await fetch('/api/subitem-monthly-reports/import', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      
      const data = await res.json();
      
      if (res.ok && data.success) {
        const successCount = data.count ?? 0;
        const inserted = data.inserted ?? 0;
        const updated = data.updated ?? 0;
        const skippedZero = data.skippedZero ?? 0;
        const warnings = data.warnings || [];
        const notFoundItems = data.notFoundItems || [];
        const errors = data.errors || [];
        
        let desc = `新增 ${inserted} 条，更新 ${updated} 条`;
        if (skippedZero > 0) desc += `，跳过 ${skippedZero} 条零值`;
        if (notFoundItems.length > 0) desc += `。未匹配分项: ${notFoundItems.map((n: { row: number; name: string }) => `"${n.name}"`).join('、')}`;
        if (errors.length > 0) desc += `。错误: ${errors.join('；')}`;
        if (warnings.length > 0) desc += `。${warnings.join('；')}`;
        
        toast({ title: '导入成功', description: desc, variant: 'success' });
        // 刷新月度报量数据
        if (selectedYearMonth) {
          fetchMonthlyReportRecords(selectedYearMonth);
        }
      } else {
        toast({ title: '导入失败', description: data.error || '未知错误', variant: 'error' });
      }
    } catch (error) {
      toast({ title: '导入失败', description: '网络错误，请重试', variant: 'error' });
    } finally {
      setMonthlyReportImporting(false);
      if (monthlyReportFileRef.current) {
        monthlyReportFileRef.current.value = '';
      }
    }
  };

  const handleDownloadMonthlyTemplate = async () => {
    if (!selectedProjectId) {
      toast({ title: '请先选择项目', variant: 'warning' });
      return;
    }
    try {
      const res = await fetch(`/api/subitem-monthly-reports/template?project_id=${selectedProjectId}`, {
        credentials: 'include',
      });
      if (!res.ok) {
        toast({ title: '下载模板失败', variant: 'error' });
        return;
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = '月度对上报量导入模板.xlsx';
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      toast({ title: '下载模板失败', variant: 'error' });
    }
  };


  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除该分项工程吗？')) return;
    
    try {
      const res = await fetch(`/api/work-item-subitems?ids=${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.ok) {
        refreshSubitems();
        toast({ title: '删除成功', description: '分项工程已删除', variant: 'success' });
      }
    } catch (error) {
      toast({ title: '删除失败', description: '网络错误，请重试', variant: 'error' });
    }
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    try {
      const res = await fetch(`/api/work-item-subitems?ids=${Array.from(selectedIds).join(',')}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.ok) {
        const count = selectedIds.size;
        setSelectedIds(new Set());
        setDeleteDialogOpen(false);
        refreshSubitems();
        toast({ title: '删除成功', description: `已删除 ${count} 条记录`, variant: 'success' });
      }
    } catch (error) {
      toast({ title: '删除失败', description: '网络错误，请重试', variant: 'error' });
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
      budget_quantity: item.budget_quantity || '',
      contract_price: item.contract_price || '',
      remark: item.remark || '',
    });
    setEditDialogOpen(true);
  };

  const resetForm = () => {
    setForm({
      subitem_name: '',
      unit: '',
      budget_quantity: '',
      contract_price: '',
      remark: '',
    });
  };

  const downloadTemplate = () => {
    const content = '分项名称,单位,预算量,合同单价,备注\n模板工程,㎡,1000,50,备注内容\n钢筋工程,t,50,200,';
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = '预算工程量导入模板.csv';
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
      const hasHeader = lines[0].includes('分项名称') || lines[0].includes('子项名称') || lines[0].includes('名称');
      const dataLines = hasHeader ? lines.slice(1) : lines;
      
      // 保留头部信息以便 handleBatchAdd 做智能列映射
      const headerLine = hasHeader ? lines[0] : '';
      const formattedLines = dataLines.map(line => {
        const parts = line.split(separator).map(p => p.trim().replace(/^["']|["']$/g, ''));
        return parts.slice(0, 5).join(',');
      });
      
      setBatchText(hasHeader ? headerLine + '\n' + formattedLines.join('\n') : formattedLines.join('\n'));
      if (formattedLines.length > 0) {
        toast({ title: '解析成功', description: `成功解析 ${formattedLines.length} 条数据`, variant: 'success' });
      }
    } catch (error) {
      toast({ title: '解析失败', description: '文件格式不正确，请检查文件', variant: 'error' });
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
        credentials: 'include',
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
        toast({ title: '修改成功', description: '对上报量已更新', variant: 'success' });
      } else {
        const error = await res.json();
        toast({ title: '修改失败', description: error.error || '操作失败', variant: 'error' });
      }
    } catch (error) {
      toast({ title: '修改失败', description: '网络错误，请重试', variant: 'error' });
    }
  };

  // ========== 月度报量功能 ==========
  
  // 获取当前月份
  const getCurrentYearMonth = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  };

  const fetchAnalysisRecords = async () => {
    if (!selectedProjectId || !analysisYearMonth) return;

    setAnalysisLoading(true);
    try {
      const [reportsRes, settlementsRes, addonSettlementsRes] = await Promise.all([
        fetch(`/api/subitem-monthly-reports?project_id=${selectedProjectId}&year_month=${analysisYearMonth}`, { credentials: 'include' }),
        fetch(`/api/subitem-monthly-progress?project_id=${selectedProjectId}&year_month=${analysisYearMonth}`, { credentials: 'include' }),
        fetch(`/api/internal-addon-settlements?project_id=${selectedProjectId}&year_month=${analysisYearMonth}`, { credentials: 'include' }),
      ]);
      const [reportsData, settlementsData, addonSettlementsData] = await Promise.all([
        reportsRes.json(),
        settlementsRes.json(),
        addonSettlementsRes.json(),
      ]);
      setAnalysisReports(reportsData.records || []);
      setAnalysisSettlements(settlementsData.records || []);
      setAnalysisAddonSettlements(addonSettlementsData.records || []);
    } catch (error) {
      console.error('获取差异分析数据失败:', error);
      setAnalysisReports([]);
      setAnalysisSettlements([]);
      setAnalysisAddonSettlements([]);
    } finally {
      setAnalysisLoading(false);
    }
  };

  // 打开月度对上报量对话框
  const openMonthlyReportDialog = async () => {
    if (!selectedProjectId) {
      toast({ title: '提示', description: '请先选择项目', variant: 'warning' });
      return;
    }
    const ym = getCurrentYearMonth();
    setSelectedYearMonth(ym);
    setMonthlyReportDialogOpen(true);
    await fetchMonthlyReportRecords(ym);
  };

  // 获取月度对上报量记录
  const fetchMonthlyReportRecords = async (yearMonth: string) => {
    setMonthlyReportLoading(true);
    try {
      const res = await fetch(`/api/subitem-monthly-reports?project_id=${selectedProjectId}&year_month=${yearMonth}`);
      const data = await res.json();
      
      // 合并当前项目的所有子项与月度记录
      const projectSubitems = allSubitems.filter(s => s.project_id === parseInt(selectedProjectId));
      const recordsMap = new Map(data.records?.map((r: any) => [r.subitem_id, r]) || []);
      
      const mergedRecords = projectSubitems.map(subitem => {
        const record = recordsMap.get(subitem.id) as any;
        const totalReported = parseFloat(subitem.completed_quantity) || 0;
        return {
          subitem_id: subitem.id,
          subitem_name: subitem.subitem_name,
          unit: subitem.unit,
          budget_quantity: subitem.budget_quantity,
          report_quantity: record?.report_quantity || '0',
          total_reported: totalReported.toString(),
          record_id: record?.id || null,
        };
      });
      
      setMonthlyReportRecords(mergedRecords);
    } catch (error) {
      console.error('获取月度对上报量失败:', error);
    } finally {
      setMonthlyReportLoading(false);
    }
  };

  // 更新月度对上报量
  const handleMonthlyReportChange = (subitemId: number, value: string) => {
    setMonthlyReportRecords(prev => prev.map(r => 
      r.subitem_id === subitemId ? { ...r, report_quantity: value } : r
    ));
  };

  // 保存月度对上报量
  const handleSaveMonthlyReport = async () => {
    const recordsToSave = monthlyReportRecords
      .filter(r => r.report_quantity && parseFloat(r.report_quantity) > 0)
      .map(r => ({
        subitem_id: r.subitem_id,
        year_month: selectedYearMonth,
        report_quantity: r.report_quantity,
      }));

    if (recordsToSave.length === 0) {
      toast({ title: '提示', description: '请输入上报量', variant: 'warning' });
      return;
    }

    try {
      const res = await fetch('/api/subitem-monthly-reports', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ records: recordsToSave }),
      });
      
      if (res.ok) {
        toast({ title: '保存成功', description: `已保存 ${recordsToSave.length} 条月度对上报量`, variant: 'success' });
        refreshSubitems();
        fetchMonthlyReportRecords(selectedYearMonth);
      } else {
        const error = await res.json();
        toast({ title: '保存失败', description: error.error || '操作失败', variant: 'error' });
      }
    } catch (error) {
      toast({ title: '保存失败', description: '网络错误，请重试', variant: 'error' });
    }
  };

  // 打开月度报量编辑对话框
  const openMonthlyReportEditDialog = (record: any) => {
    setMonthlyReportEditRecord(record);
    setMonthlyReportEditForm({
      report_quantity: record.report_quantity,
      remark: record.remark || '',
    });
    setMonthlyReportEditDialogOpen(true);
  };

  // 保存月度报量编辑
  const handleSaveMonthlyReportEdit = async () => {
    if (!monthlyReportEditRecord) return;
    
    try {
      const res = await fetch(`/api/subitem-monthly-reports/${monthlyReportEditRecord.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          report_quantity: monthlyReportEditForm.report_quantity,
          remark: monthlyReportEditForm.remark,
        }),
      });
      
      if (res.ok) {
        toast({ title: '修改成功', description: '报量数据已更新', variant: 'success' });
        setMonthlyReportEditDialogOpen(false);
        // 刷新历史记录
        const res2 = await fetch(`/api/subitem-monthly-reports/${selectedSubitem?.id}?project_id=${selectedProjectId}`);
        const data2 = await res2.json();
        if (data2.data) {
          setMonthlyReportHistory(data2.data);
        }
      } else {
        const error = await res.json();
        toast({ title: '修改失败', description: error.error || '操作失败', variant: 'error' });
      }
    } catch (error) {
      toast({ title: '修改失败', description: '网络错误，请重试', variant: 'error' });
    }
  };

  // 删除月度报量记录
  const handleDeleteMonthlyReport = async (recordId: number) => {
    if (!confirm('确定要删除这条报量记录吗？删除后将更新累计报量。')) return;
    
    try {
      const res = await fetch(`/api/subitem-monthly-reports/${recordId}`, {
        method: 'DELETE',
      });
      
      if (res.ok) {
        toast({ title: '删除成功', description: '报量记录已删除', variant: 'success' });
        // 刷新历史记录
        const res2 = await fetch(`/api/subitem-monthly-reports/${selectedSubitem?.id}?project_id=${selectedProjectId}`);
        const data2 = await res2.json();
        if (data2.data) {
          setMonthlyReportHistory(data2.data);
        }
      } else {
        const error = await res.json();
        toast({ title: '删除失败', description: error.error || '操作失败', variant: 'error' });
      }
    } catch (error) {
      toast({ title: '删除失败', description: '网络错误，请重试', variant: 'error' });
    }
  };

  // 打开月度对下结算量对话框
  const openMonthlySettlementDialog = async () => {
    if (!selectedProjectId) {
      toast({ title: '提示', description: '请先选择项目', variant: 'warning' });
      return;
    }
    const ym = getCurrentYearMonth();
    setSettlementYearMonth(ym);
    setMonthlySettlementDialogOpen(true);
    await fetchMonthlySettlementRecords(ym);
  };

  // 获取月度对下结算量记录
  const fetchMonthlySettlementRecords = async (yearMonth: string) => {
    setMonthlySettlementLoading(true);
    try {
      const [res, addonsRes, addonRecordsRes] = await Promise.all([
        fetch(`/api/subitem-monthly-progress?project_id=${selectedProjectId}&year_month=${yearMonth}`, { credentials: 'include' }),
        fetch(`/api/project-internal-addons?project_id=${selectedProjectId}`, { credentials: 'include' }),
        fetch(`/api/internal-addon-settlements?project_id=${selectedProjectId}&year_month=${yearMonth}`, { credentials: 'include' }),
      ]);
      const [data, addonsData, addonRecordsData] = await Promise.all([
        res.json(),
        addonsRes.json(),
        addonRecordsRes.json(),
      ]);
      
      // 合并当前项目的所有子项与月度记录
      const projectSubitems = allSubitems.filter(s => s.project_id === parseInt(selectedProjectId));
      const recordsMap = new Map(data.records?.map((r: any) => [r.subitem_id, r]) || []);
      
      const mergedRecords = projectSubitems.map(subitem => {
        const record = recordsMap.get(subitem.id) as any;
        const totalSettlement = parseFloat(subitem.settlement_quantity || '0') || 0;
        return {
          subitem_id: subitem.id,
          subitem_name: subitem.subitem_name,
          unit: subitem.unit,
          budget_quantity: subitem.budget_quantity,
          settlement_quantity: record?.completed_quantity || '0',
          total_settlement: totalSettlement.toString(),
          record_id: record?.id || null,
        };
      });
      
      setMonthlySettlementRecords(mergedRecords);

      const addons = addonsData.addons || [];
      setProjectAddons(addons);
      const addonRecordsMap = new Map(addonRecordsData.records?.map((r: any) => [r.addon_id, r]) || []);
      setMonthlyAddonSettlementRecords(addons.map((addon: ProjectInternalAddon) => {
        const record = addonRecordsMap.get(addon.id) as any;
        return {
          addon_id: addon.id,
          name: addon.name,
          unit: addon.unit,
          unit_price: record?.unit_price || addon.unit_price || '0',
          quantity: record?.quantity || '0',
          total_quantity: addon.total_quantity || '0',
          total_amount: addon.total_amount || '0',
          record_id: record?.id || null,
        };
      }));
    } catch (error) {
      console.error('获取月度对下结算量失败:', error);
      setMonthlyAddonSettlementRecords([]);
    } finally {
      setMonthlySettlementLoading(false);
    }
  };

  // 更新月度对下结算量
  const handleMonthlySettlementChange = (subitemId: number, value: string) => {
    setMonthlySettlementRecords(prev => prev.map(r => 
      r.subitem_id === subitemId ? { ...r, settlement_quantity: value } : r
    ));
  };

  const handleMonthlyAddonSettlementChange = (addonId: number, value: string) => {
    setMonthlyAddonSettlementRecords(prev => prev.map(r =>
      r.addon_id === addonId ? { ...r, quantity: value } : r
    ));
  };

  // 保存月度对下结算量
  const handleSaveMonthlySettlement = async () => {
    const recordsToSave = monthlySettlementRecords
      .filter(r => r.record_id || (r.settlement_quantity && parseFloat(r.settlement_quantity) > 0))
      .map(r => ({
        subitem_id: r.subitem_id,
        year_month: settlementYearMonth,
        completed_quantity: r.settlement_quantity || '0',
      }));

    const addonRecordsToSave = monthlyAddonSettlementRecords
      .filter(r => r.record_id || (r.quantity && parseFloat(r.quantity) > 0))
      .map(r => ({
        project_id: selectedProjectId,
        addon_id: r.addon_id,
        year_month: settlementYearMonth,
        quantity: r.quantity || '0',
        unit_price: r.unit_price || '0',
      }));

    if (recordsToSave.length === 0 && addonRecordsToSave.length === 0) {
      toast({ title: '提示', description: '请输入结算量', variant: 'warning' });
      return;
    }

    try {
      const requests = [];
      if (recordsToSave.length > 0) {
        requests.push(fetch('/api/subitem-monthly-progress', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ records: recordsToSave }),
        }));
      }
      if (addonRecordsToSave.length > 0) {
        requests.push(fetch('/api/internal-addon-settlements', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ records: addonRecordsToSave }),
        }));
      }
      const responses = await Promise.all(requests);
      const failedResponse = responses.find(response => !response.ok);
      
      if (!failedResponse) {
        const totalSaved = recordsToSave.length + addonRecordsToSave.length;
        toast({ title: '保存成功', description: `已保存 ${totalSaved} 条月度对下结算记录`, variant: 'success' });
        await refreshSubitems();
        await fetchProjectAddons();
        await fetchMonthlySettlementRecords(settlementYearMonth);
        fetchAnalysisRecords();
      } else {
        const error = await failedResponse.json();
        toast({ title: '保存失败', description: error.error || '操作失败', variant: 'error' });
      }
    } catch (error) {
      toast({ title: '保存失败', description: '网络错误，请重试', variant: 'error' });
    }
  };

  // 打开结算量编辑对话框
  const openSettlementEditDialog = (record: any) => {
    setSettlementEditRecord(record);
    setSettlementEditForm({
      completed_quantity: record.completed_quantity,
      remark: record.remark || '',
    });
    setSettlementEditDialogOpen(true);
  };

  // 保存结算量编辑
  const handleSaveSettlementEdit = async () => {
    if (!settlementEditRecord) return;
    
    try {
      const res = await fetch(`/api/subitem-monthly-progress/${settlementEditRecord.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          completed_quantity: settlementEditForm.completed_quantity,
          remark: settlementEditForm.remark,
        }),
      });
      
      if (res.ok) {
        toast({ title: '修改成功', description: '结算量数据已更新', variant: 'success' });
        setSettlementEditDialogOpen(false);
        // 刷新历史记录
        fetchSettlementHistory();
      } else {
        const error = await res.json();
        toast({ title: '修改失败', description: error.error || '操作失败', variant: 'error' });
      }
    } catch (error) {
      toast({ title: '修改失败', description: '网络错误，请重试', variant: 'error' });
    }
  };

  // 删除结算量记录
  const handleDeleteSettlement = async (recordId: number) => {
    if (!confirm('确定要删除这条结算记录吗？删除后将更新累计结算量。')) return;
    
    try {
      const res = await fetch(`/api/subitem-monthly-progress/${recordId}`, {
        method: 'DELETE',
      });
      
      if (res.ok) {
        toast({ title: '删除成功', description: '结算记录已删除', variant: 'success' });
        // 刷新历史记录
        fetchSettlementHistory();
      } else {
        const error = await res.json();
        toast({ title: '删除失败', description: error.error || '操作失败', variant: 'error' });
      }
    } catch (error) {
      toast({ title: '删除失败', description: '网络错误，请重试', variant: 'error' });
    }
  };

  // 获取结算量历史记录
  const fetchSettlementHistory = async () => {
    if (!selectedSubitem?.id) return;
    
    setSettlementHistoryLoading(true);
    try {
      const res = await fetch(`/api/subitem-monthly-progress/${selectedSubitem.id}?project_id=${selectedProjectId}`);
      const data = await res.json();
      if (data.data) {
        setSettlementHistory(data.data);
      }
    } catch (error) {
      console.error('获取结算量历史失败:', error);
    } finally {
      setSettlementHistoryLoading(false);
    }
  };

  // 打开结算量历史对话框（月度对话框内使用）
  const openSettlementHistory = async () => {
    if (!selectedSubitem?.id) {
      toast({ title: '提示', description: '请先选择分项工程', variant: 'warning' });
      return;
    }
    setSettlementHistoryOpen(true);
    await fetchSettlementHistory();
  };

  // 获取月份列表（最近12个月）
  const getMonthsList = () => {
    const result = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      result.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    return result;
  };

  // ========== 对上报量历史记录（独立对话框） ==========
  
  const openReportHistory = async (item: WorkItemSubitem) => {
    setReportHistoryItem(item);
    setReportHistoryOpen(true);
    setReportHistoryLoading(true);
    try {
      const res = await fetch(`/api/subitem-monthly-reports?subitem_id=${item.id}`);
      const data = await res.json();
      setReportHistoryData(data.records || []);
    } catch (error) {
      console.error('获取报量历史失败:', error);
    } finally {
      setReportHistoryLoading(false);
    }
  };

  const fetchReportHistory = async (subitemId: number) => {
    setReportHistoryLoading(true);
    try {
      const res = await fetch(`/api/subitem-monthly-reports?subitem_id=${subitemId}`);
      const data = await res.json();
      setReportHistoryData(data.records || []);
    } catch (error) {
      console.error('获取报量历史失败:', error);
    } finally {
      setReportHistoryLoading(false);
    }
  };

  const openReportHistoryEditDialog = (record: any) => {
    setReportHistoryEditRecord(record);
    setReportHistoryEditForm({
      report_quantity: record.report_quantity,
      remark: record.remark || '',
    });
    setReportHistoryEditDialogOpen(true);
  };

  const handleSaveReportHistoryEdit = async () => {
    if (!reportHistoryEditRecord || !reportHistoryItem) return;
    try {
      const res = await fetch(`/api/subitem-monthly-reports/${reportHistoryEditRecord.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          report_quantity: reportHistoryEditForm.report_quantity,
          remark: reportHistoryEditForm.remark,
        }),
      });
      if (res.ok) {
        toast({ title: '修改成功', description: '报量数据已更新', variant: 'success' });
        setReportHistoryEditDialogOpen(false);
        fetchReportHistory(reportHistoryItem.id);
        refreshSubitems();
      } else {
        const error = await res.json();
        toast({ title: '修改失败', description: error.error || '操作失败', variant: 'error' });
      }
    } catch (error) {
      toast({ title: '修改失败', description: '网络错误，请重试', variant: 'error' });
    }
  };

  const handleDeleteReportHistory = async (recordId: number) => {
    if (!confirm('确定要删除这条报量记录吗？删除后将更新累计报量。')) return;
    try {
      const res = await fetch(`/api/subitem-monthly-reports/${recordId}`, { method: 'DELETE' });
      if (res.ok) {
        toast({ title: '删除成功', description: '报量记录已删除', variant: 'success' });
        if (reportHistoryItem) fetchReportHistory(reportHistoryItem.id);
        refreshSubitems();
      } else {
        const error = await res.json();
        toast({ title: '删除失败', description: error.error || '操作失败', variant: 'error' });
      }
    } catch (error) {
      toast({ title: '删除失败', description: '网络错误，请重试', variant: 'error' });
    }
  };

  // ========== 对下结算量历史记录（独立对话框） ==========
  
  const openSettleHistory = async (item: WorkItemSubitem) => {
    setSettleHistoryItem(item);
    setSettleHistoryOpen(true);
    setSettleHistoryLoading(true);
    try {
      const res = await fetch(`/api/subitem-monthly-progress?subitem_id=${item.id}`);
      const data = await res.json();
      setSettleHistoryData(data.records || []);
    } catch (error) {
      console.error('获取结算量历史失败:', error);
    } finally {
      setSettleHistoryLoading(false);
    }
  };

  const fetchSettleHistory = async (subitemId: number) => {
    setSettleHistoryLoading(true);
    try {
      const res = await fetch(`/api/subitem-monthly-progress?subitem_id=${subitemId}`);
      const data = await res.json();
      setSettleHistoryData(data.records || []);
    } catch (error) {
      console.error('获取结算量历史失败:', error);
    } finally {
      setSettleHistoryLoading(false);
    }
  };

  const openSettleHistoryEditDialog = (record: any) => {
    setSettleHistoryEditRecord(record);
    setSettleHistoryEditForm({
      completed_quantity: record.completed_quantity,
      remark: record.remark || '',
    });
    setSettleHistoryEditDialogOpen(true);
  };

  const handleSaveSettleHistoryEdit = async () => {
    if (!settleHistoryEditRecord || !settleHistoryItem) return;
    try {
      const res = await fetch(`/api/subitem-monthly-progress/${settleHistoryEditRecord.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          completed_quantity: settleHistoryEditForm.completed_quantity,
          remark: settleHistoryEditForm.remark,
        }),
      });
      if (res.ok) {
        toast({ title: '修改成功', description: '结算量数据已更新', variant: 'success' });
        setSettleHistoryEditDialogOpen(false);
        fetchSettleHistory(settleHistoryItem.id);
        refreshSubitems();
      } else {
        const error = await res.json();
        toast({ title: '修改失败', description: error.error || '操作失败', variant: 'error' });
      }
    } catch (error) {
      toast({ title: '修改失败', description: '网络错误，请重试', variant: 'error' });
    }
  };

  const handleDeleteSettleHistory = async (recordId: number) => {
    if (!confirm('确定要删除这条结算记录吗？删除后将更新累计结算量。')) return;
    try {
      const res = await fetch(`/api/subitem-monthly-progress/${recordId}`, { method: 'DELETE' });
      if (res.ok) {
        toast({ title: '删除成功', description: '结算记录已删除', variant: 'success' });
        if (settleHistoryItem) fetchSettleHistory(settleHistoryItem.id);
        refreshSubitems();
      } else {
        const error = await res.json();
        toast({ title: '删除失败', description: error.error || '操作失败', variant: 'error' });
      }
    } catch (error) {
      toast({ title: '删除失败', description: '网络错误，请重试', variant: 'error' });
    }
  };

  // ========== 筛选和工具函数 ==========
  
  const filteredSubitems = subitems.filter(item => {
    if (!searchKeyword) return true;
    return item.subitem_name.toLowerCase().includes(searchKeyword.toLowerCase());
  });

  const allSelected = filteredSubitems.length > 0 && filteredSubitems.every(item => selectedIds.has(item.id));

  const formatCurrency = (value: number) => {
    return `¥${value.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}`;
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case '进行中': return 'bg-[#1A58B3] text-white';
      case '已完成': return 'bg-emerald-500 text-white';
      case '暂停': return 'bg-amber-500 text-white';
      default: return 'bg-gray-100 text-gray-700';
    }
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

  const selectedProject = projects.find(p => p.id.toString() === selectedProjectId);

  if (loading) {
    return (
      <div className="space-y-6 min-h-screen">
        <div className="flex items-center justify-between">
          <div><Skeleton className="w-48 h-7 mb-1" /><Skeleton className="w-64 h-4" /></div>
          <Skeleton className="w-40 h-9 rounded-lg" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
        <Skeleton className="h-10 rounded-lg w-64" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6 min-h-screen">
      {/* 顶部区域 */}
      <div className={`flex items-center justify-between transition-all duration-500 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-gray-900">报量管理</h1>
          <p className="text-gray-500 mt-1 text-sm">以预算工程量为统一基准，管理对上报量、对下结算和差异提醒</p>
        </div>
        <Button variant="outline" onClick={fetchData} className="gap-2">
          <RefreshCw className="w-4 h-4" />
          刷新
        </Button>
      </div>

      {/* 总体统计卡片 */}
      <div className={`grid grid-cols-2 md:grid-cols-5 gap-4 transition-all duration-500 delay-100 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
        <Card className="group bg-gradient-to-br from-[#1A58B3]/5 to-[#1A58B3]/10 border-[#1A58B3]/20 hover:shadow-lg hover:shadow-[#1A58B3]/10 hover:-translate-y-1 transition-all duration-300 cursor-pointer">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#1A58B3] flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                <Building2 className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-xs text-gray-500">项目总数</p>
                <AnimatedNumber value={overallStats.totalProjects} className="text-xl font-bold text-[#1A58B3]" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="group bg-gradient-to-br from-emerald-50 to-emerald-100/50 border-emerald-200/50 hover:shadow-lg hover:shadow-emerald-500/10 hover:-translate-y-1 transition-all duration-300 cursor-pointer">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-500 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                <ListTree className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-xs text-gray-500">分项工程</p>
                <AnimatedNumber value={overallStats.totalSubitems} className="text-xl font-bold text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="group bg-gradient-to-br from-blue-50 to-blue-100/50 border-blue-200/50 hover:shadow-lg hover:shadow-blue-500/10 hover:-translate-y-1 transition-all duration-300 cursor-pointer">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                <Target className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-xs text-gray-500">预算总额</p>
                <AnimatedNumber value={overallStats.totalBudget} format={formatCurrency} className="text-lg font-bold text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="group bg-gradient-to-br from-purple-50 to-purple-100/50 border-purple-200/50 hover:shadow-lg hover:shadow-purple-500/10 hover:-translate-y-1 transition-all duration-300 cursor-pointer">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-500 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                <CheckCircle2 className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-xs text-gray-500">完成总额</p>
                <AnimatedNumber value={overallStats.totalCompleted} format={formatCurrency} className="text-lg font-bold text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="group bg-gradient-to-br from-[#E67E22]/5 to-[#E67E22]/10 border-[#E67E22]/20 hover:shadow-lg hover:shadow-[#E67E22]/10 hover:-translate-y-1 transition-all duration-300 cursor-pointer">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#E67E22] flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                <TrendingUp className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-xs text-gray-500">在施项目</p>
                <AnimatedNumber value={overallStats.activeProjects} className="text-xl font-bold text-[#E67E22]" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 项目选择器 */}
      <div className={`transition-all duration-500 delay-150 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
        <Card className="border-[#1A58B3]/20">
          <CardContent className="py-4">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-[#1A58B3]" />
                <span className="font-medium text-gray-700">选择项目：</span>
              </div>
              <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                <SelectTrigger className="w-64">
                  <SelectValue placeholder="请选择项目进行数据录入" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id.toString()}>
                      <div className="flex items-center gap-2">
                        <span>{project.name}</span>
                        <span className={`px-1.5 py-0.5 rounded text-xs ${getStatusStyle(project.status)}`}>
                          {project.status}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedProject && (
                <div className="flex items-center gap-3 text-sm text-gray-500">
                  <span>{selectedProject.year}年度</span>
                  <span>·</span>
                  <span>{subitems.length} 个分项工程</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 预警筛选提示 */}
      {warningFilter && selectedProjectId && (
        <div className={`transition-all duration-500 delay-175 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
          <div className="flex items-center justify-between px-4 py-3 rounded-lg" 
            style={{ background: warningFilter === 'overbudget' ? '#FFECE8' : '#FFF7E8', border: `1px solid ${warningFilter === 'overbudget' ? '#F53F3F' : '#FF7D00'}` }}>
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5" style={{ color: warningFilter === 'overbudget' ? '#F53F3F' : '#FF7D00' }} />
              <div>
                <span className="font-medium" style={{ color: warningFilter === 'overbudget' ? '#F53F3F' : '#FF7D00' }}>
                  {getWarningTitle()}
                </span>
                <span className="text-sm ml-2" style={{ color: '#86909C' }}>
                  共 {subitems.length} 项
                </span>
              </div>
            </div>
            <button 
              onClick={clearWarningFilter}
              className="flex items-center gap-1 px-3 py-1 rounded text-sm transition-colors hover:bg-white/50"
              style={{ color: warningFilter === 'overbudget' ? '#F53F3F' : '#FF7D00' }}
            >
              <X className="w-4 h-4" />
              清除筛选
            </button>
          </div>
        </div>
      )}

      {/* 数据录入区域 */}
      <div className={`transition-all duration-500 delay-200 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
        {loading ? (
          <div className="text-center py-16">
            <div className="w-12 h-12 mx-auto mb-4 border-4 border-[#1A58B3]/20 border-t-[#1A58B3] rounded-full animate-spin" />
            <p className="text-gray-400">加载中...</p>
          </div>
        ) : !selectedProjectId ? (
          <Card>
            <CardContent className="py-16 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[#1A58B3]/10 flex items-center justify-center">
                <BarChart3 className="w-8 h-8 text-[#1A58B3]/40" />
              </div>
              <p className="text-gray-500 mb-2">请先选择项目</p>
              <p className="text-sm text-gray-400">选择项目后可进行预算工程量、对上报量、对下结算和差异分析</p>
            </CardContent>
          </Card>
        ) : (
          <Tabs defaultValue="subitems" className="space-y-4">
            <TabsList className="bg-white border">
              <TabsTrigger value="subitems" className="gap-2">
                <ListTree className="w-4 h-4" />
                预算工程量
              </TabsTrigger>
              <TabsTrigger value="budget" className="gap-2">
                <Target className="w-4 h-4" />
                对上报量
              </TabsTrigger>
              <TabsTrigger value="completed" className="gap-2">
                <CheckCircle2 className="w-4 h-4" />
                对下结算量
              </TabsTrigger>
              <TabsTrigger value="addons" className="gap-2">
                <Layers className="w-4 h-4" />
                内部附加清单
              </TabsTrigger>
              <TabsTrigger value="difference" className="gap-2">
                <AlertTriangle className="w-4 h-4" />
                差异分析
              </TabsTrigger>
            </TabsList>

            {/* 预算工程量标签页 */}
            <TabsContent value="subitems" className="space-y-4">
              {/* 工具栏 */}
              <div className="flex items-center justify-between">
                <div className="flex gap-2 items-center">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                    <Input
                      placeholder="搜索分项名称"
                      value={searchKeyword}
                      onChange={(e) => setSearchKeyword(e.target.value)}
                      className="w-48 pl-9"
                    />
                  </div>
                  {searchKeyword && (
                    <Button variant="ghost" size="sm" onClick={() => setSearchKeyword('')}>
                      <X className="w-4 h-4 mr-1" />清除
                    </Button>
                  )}
                  <span className="text-sm text-gray-500">{filteredSubitems.length} 条记录</span>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={downloadTemplate}>
                    <Download className="w-4 h-4 mr-2" />下载模板
                  </Button>
                  <Button variant="outline" onClick={() => setBatchDialogOpen(true)}>
                    <Upload className="w-4 h-4 mr-2" />批量导入
                  </Button>
                  <Button variant="outline" onClick={() => setMonthlyReportDialogOpen(true)}>
                    <FileText className="w-4 h-4 mr-2" />月度报量导入
                  </Button>
                  {selectedIds.size > 0 && (
                    <Button variant="destructive" onClick={() => setDeleteDialogOpen(true)}>
                      <Trash2 className="w-4 h-4 mr-2" />删除 ({selectedIds.size})
                    </Button>
                  )}
                  <Button onClick={() => { resetForm(); setAddDialogOpen(true); }} className="bg-[#1A58B3] hover:bg-[#144a96]">
                    <Plus className="w-4 h-4 mr-2" />新增
                  </Button>
                </div>
              </div>

              {/* 统计卡片 */}
              <div className="grid grid-cols-4 gap-4">
                <Card className="border-blue-200 bg-blue-50">
                  <CardContent className="py-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-blue-600">分项工程数</span>
                      <span className="text-xl font-bold text-blue-700">{projectStats.totalItems}</span>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-green-200 bg-green-50">
                  <CardContent className="py-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-green-600">预算总金额</span>
                      <span className="text-lg font-bold text-green-700">{formatCurrency(projectStats.totalBudget)}</span>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-purple-200 bg-purple-50">
                  <CardContent className="py-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-purple-600">合同单价均值</span>
                      <span className="text-lg font-bold text-purple-700">
                        {subitems.length > 0 
                          ? formatCurrency(subitems.reduce((sum, item) => sum + (parseFloat(item.contract_price || '0') || 0), 0) / subitems.filter(i => parseFloat(i.contract_price || '0') > 0).length || 1)
                          : '¥0'}
                      </span>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-orange-200 bg-orange-50">
                  <CardContent className="py-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-orange-600">平均完成率</span>
                      <span className="text-lg font-bold text-orange-700">
                        {(() => {
                          const itemsWithBudget = subitems.filter(i => parseFloat(i.budget_quantity) > 0);
                          if (itemsWithBudget.length === 0) return '0%';
                          const avgPct = itemsWithBudget.reduce((sum, i) => sum + Math.min((parseFloat(i.completed_quantity) || 0) / parseFloat(i.budget_quantity) * 100, 100), 0) / itemsWithBudget.length;
                          return avgPct.toFixed(1) + '%';
                        })()}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* 表格 */}
              <Card>
                <CardContent className="pt-6">
                  {filteredSubitems.length > 0 ? (
                    <Table className="zebra-table">
              <TableHeader>
                        <TableRow className="bg-[#E8F3FF] hover:bg-[#E8F3FF]">
                          <TableHead className="w-10">
                            <Checkbox checked={allSelected} onCheckedChange={handleSelectAll} />
                          </TableHead>
                          <TableHead>分项名称</TableHead>
                          <TableHead>单位</TableHead>
                          <TableHead className="text-right">预算量</TableHead>
                          <TableHead className="text-right">合同单价</TableHead>
                          <TableHead className="text-right">预算金额</TableHead>
                          <TableHead>备注</TableHead>
                          <TableHead>操作</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredSubitems.map((item, index) => {
                          const budgetQty = parseFloat(item.budget_quantity) || 0;
                          const contractPrice = parseFloat(item.contract_price || '0') || 0;
                          const budgetAmount = budgetQty * contractPrice;
                          return (
                            <TableRow key={item.id} className={`${index % 2 === 1 ? 'bg-[#F8FAFC]' : ''} hover:bg-[#F0F7FF]`}>
                              <TableCell>
                                <Checkbox
                                  checked={selectedIds.has(item.id)}
                                  onCheckedChange={(checked) => handleSelect(item.id, checked as boolean)}
                                />
                              </TableCell>
                              <TableCell className="font-medium">{item.subitem_name}</TableCell>
                              <TableCell>{item.unit}</TableCell>
                              <TableCell className="text-right font-medium">
                                <div className="flex flex-col items-end gap-1">
                                  <span>{item.budget_quantity || '0'}</span>
                                  {(() => {
                                    const budget = parseFloat(item.budget_quantity) || 0;
                                    const completed = parseFloat(String(item.completed_quantity)) || 0;
                                    const pct = budget > 0 ? Math.min((completed / budget) * 100, 100) : 0;
                                    if (budget > 0 && pct > 0) return (
                                      <div className="w-full max-w-[80px] h-1.5 rounded-full overflow-hidden" style={{ background: '#E5E6EB' }}>
                                        <div className="h-full rounded-full" style={{
                                          width: `${pct}%`,
                                          background: pct >= 90 ? '#00B42A' : pct >= 60 ? '#165DFF' : '#FF7D00',
                                        }} />
                                      </div>
                                    );
                                    return null;
                                  })()}
                                </div>
                              </TableCell>
                              <TableCell className="text-right">{item.contract_price || '-'}</TableCell>
                              <TableCell className="text-right font-bold text-[#1A58B3]">{formatCurrency(budgetAmount)}</TableCell>
                              <TableCell className="text-sm text-gray-500 max-w-32 truncate">{item.remark || '-'}</TableCell>
                              <TableCell>
                                <div className="flex gap-1">
                                  <Button size="sm" variant="ghost" onClick={() => openEditDialog(item)}>
                                    <Pencil className="w-3 h-3" />
                                  </Button>
                                  <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700" onClick={() => handleDelete(item.id)}>
                                    <Trash2 className="w-3 h-3" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <p>暂无分项工程数据</p>
                      <p className="text-sm mt-2">点击"新增"添加分项工程</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* 对上报量标签页 */}
            <TabsContent value="budget" className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">对上报量</h3>
                <div className="flex gap-2">
                  <Button onClick={openMonthlyReportDialog} className="gap-2">
                    <Calendar className="w-4 h-4" />
                    月度报量
                  </Button>
                  <Button variant="outline" onClick={refreshSubitems}>
                    <RefreshCw className="w-4 h-4 mr-2" />刷新
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <Card className="border-blue-200 bg-blue-50">
                  <CardContent className="py-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-blue-600">分项工程数</span>
                      <span className="text-xl font-bold text-blue-700">{projectStats.totalItems}</span>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-green-200 bg-green-50">
                  <CardContent className="py-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-green-600">累计上报金额</span>
                      <span className="text-lg font-bold text-green-700">{formatCurrency(projectStats.totalCompleted)}</span>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-purple-200 bg-purple-50">
                  <CardContent className="py-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-purple-600">平均上报率</span>
                      <span className="text-xl font-bold text-purple-700">
                        {subitems.length > 0 
                          ? (subitems.reduce((sum, item) => {
                              const budget = parseFloat(item.budget_quantity) || 0;
                              const completed = parseFloat(item.completed_quantity) || 0;
                              return sum + (budget > 0 ? (completed / budget) * 100 : 0);
                            }, 0) / subitems.length).toFixed(1)
                          : 0}%
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardContent className="pt-6">
                  {subitems.length > 0 ? (
                    <Table className="zebra-table">
              <TableHeader>
                        <TableRow className="bg-[#E8F3FF] hover:bg-[#E8F3FF]">
                          <TableHead>分项名称</TableHead>
                          <TableHead>单位</TableHead>
                          <TableHead className="text-right">预算量</TableHead>
                          <TableHead className="text-right">累计对上报量</TableHead>
                          <TableHead className="text-right">剩余工程量</TableHead>
                          <TableHead className="text-center">上报进度</TableHead>
                          <TableHead className="text-right">合同单价</TableHead>
                          <TableHead className="text-right">上报金额</TableHead>
                          <TableHead>状态</TableHead>
                          <TableHead className="text-center">操作</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {subitems.map((item, index) => {
                          const budgetQty = parseFloat(item.budget_quantity) || 0;
                          const reportedQty = parseFloat(item.completed_quantity) || 0;
                          const remainingQty = budgetQty - reportedQty;
                          const contractPrice = parseFloat(item.contract_price || '0') || 0;
                          const progress = budgetQty > 0 ? (reportedQty / budgetQty * 100) : 0;
                          const reportAmount = reportedQty * contractPrice;
                          return (
                            <TableRow key={item.id} className={`${index % 2 === 1 ? 'bg-[#F8FAFC]' : ''} hover:bg-[#F0F7FF]`}>
                              <TableCell className="font-medium">{item.subitem_name}</TableCell>
                              <TableCell>{item.unit}</TableCell>
                              <TableCell className="text-right">{item.budget_quantity || '0'}</TableCell>
                              <TableCell className="text-right font-medium text-blue-600">{item.completed_quantity || '0'}</TableCell>
                              <TableCell className="text-right font-medium text-orange-600">{remainingQty.toFixed(2)}</TableCell>
                              <TableCell>
                                <div className="flex items-center justify-center gap-2">
                                  <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                                    <div 
                                      className={`h-full ${progress >= 100 ? 'bg-green-500' : progress >= 80 ? 'bg-red-500' : 'bg-blue-500'}`}
                                      style={{ width: `${Math.min(progress, 100)}%` }}
                                    />
                                  </div>
                                  <span className="text-sm text-gray-600 w-12 text-right">{progress.toFixed(0)}%</span>
                                </div>
                              </TableCell>
                              <TableCell className="text-right">{item.contract_price || '-'}</TableCell>
                              <TableCell className="text-right font-bold text-[#1A58B3]">{formatCurrency(reportAmount)}</TableCell>
                              <TableCell>{getProgressBadge(progress)}</TableCell>
                              <TableCell className="text-center">
                                <Button size="sm" variant="ghost" onClick={() => openReportHistory(item)} title="查看历史记录">
                                  <FileText className="w-4 h-4 text-blue-500" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="text-center py-8 text-gray-500">暂无数据</div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* 对下结算量标签页 */}
            <TabsContent value="completed" className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">对下结算量</h3>
                <div className="flex gap-2">
                  <Button onClick={openMonthlySettlementDialog} className="gap-2">
                    <Calendar className="w-4 h-4" />
                    月度结算
                  </Button>
                  <Button variant="outline" onClick={refreshSubitems}>
                    <RefreshCw className="w-4 h-4 mr-2" />刷新
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <Card className="border-blue-200 bg-blue-50">
                  <CardContent className="py-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-blue-600">分项工程数</span>
                      <span className="text-xl font-bold text-blue-700">{projectStats.totalItems}</span>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-green-200 bg-green-50">
                  <CardContent className="py-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-green-600">累计结算金额</span>
                      <span className="text-lg font-bold text-green-700">{formatCurrency(projectStats.totalSettlement || 0)}</span>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-purple-200 bg-purple-50">
                  <CardContent className="py-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-purple-600">平均结算率</span>
                      <span className="text-xl font-bold text-purple-700">
                        {subitems.length > 0 
                          ? (subitems.reduce((sum, item) => {
                              const budget = parseFloat(item.budget_quantity) || 0;
                              const settlement = parseFloat(item.settlement_quantity || '0') || 0;
                              return sum + (budget > 0 ? (settlement / budget) * 100 : 0);
                            }, 0) / subitems.length).toFixed(1)
                          : 0}%
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardContent className="pt-6">
                  {subitems.length > 0 ? (
                    <Table className="zebra-table">
              <TableHeader>
                        <TableRow className="bg-[#E8F3FF] hover:bg-[#E8F3FF]">
                          <TableHead>分项名称</TableHead>
                          <TableHead>单位</TableHead>
                          <TableHead className="text-right">预算量</TableHead>
                          <TableHead className="text-right">累计对下结算量</TableHead>
                          <TableHead className="text-right">剩余工程量</TableHead>
                          <TableHead className="text-center">结算进度</TableHead>
                          <TableHead className="text-right">合同单价</TableHead>
                          <TableHead className="text-right">结算金额</TableHead>
                          <TableHead>状态</TableHead>
                          <TableHead className="text-center">操作</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {subitems.map((item, index) => {
                          const budgetQty = parseFloat(item.budget_quantity) || 0;
                          const settlementQty = parseFloat(item.settlement_quantity || '0') || 0;
                          const remainingQty = budgetQty - settlementQty;
                          const contractPrice = parseFloat(item.contract_price || '0') || 0;
                          const progress = budgetQty > 0 ? (settlementQty / budgetQty) * 100 : 0;
                          const settlementAmount = settlementQty * contractPrice;
                          return (
                            <TableRow key={item.id} className={`${progress > 80 ? 'bg-red-50' : index % 2 === 1 ? 'bg-[#F8FAFC]' : ''} hover:bg-[#F0F7FF]`}>
                              <TableCell className="font-medium">{item.subitem_name}</TableCell>
                              <TableCell>{item.unit}</TableCell>
                              <TableCell className="text-right">{item.budget_quantity || '0'}</TableCell>
                              <TableCell className="text-right font-medium text-blue-600">{item.settlement_quantity || '0'}</TableCell>
                              <TableCell className="text-right font-medium text-orange-600">{remainingQty.toFixed(2)}</TableCell>
                              <TableCell>
                                <div className="flex items-center justify-center gap-2">
                                  <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                                    <div 
                                      className={`h-full ${progress >= 100 ? 'bg-green-500' : progress >= 80 ? 'bg-red-500' : 'bg-blue-500'}`}
                                      style={{ width: `${Math.min(progress, 100)}%` }}
                                    />
                                  </div>
                                  <span className="text-sm text-gray-600 w-12 text-right">{progress.toFixed(0)}%</span>
                                </div>
                              </TableCell>
                              <TableCell className="text-right">{item.contract_price || '-'}</TableCell>
                              <TableCell className="text-right font-bold text-[#1A58B3]">{formatCurrency(settlementAmount)}</TableCell>
                              <TableCell>{getProgressBadge(progress)}</TableCell>
                              <TableCell className="text-center">
                                <Button size="sm" variant="ghost" onClick={() => openSettleHistory(item)} title="查看历史记录">
                                  <FileText className="w-4 h-4 text-blue-500" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="text-center py-8 text-gray-500">暂无数据</div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* 内部附加清单标签页 */}
            <TabsContent value="addons" className="space-y-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <h3 className="text-lg font-semibold">内部附加清单</h3>
                  <p className="text-sm text-gray-500 mt-1">维护对下结算中的内部附加成本，只参与金额分析，不参与工程量差异对比</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => openTemplateDialog()}>
                    <Plus className="w-4 h-4 mr-2" />新增公司模板
                  </Button>
                  <Button variant="outline" onClick={handleImportAddonTemplates} disabled={addonSaving || addonTemplates.length === 0}>
                    <Copy className="w-4 h-4 mr-2" />从模板导入
                  </Button>
                  <Button onClick={() => openProjectAddonDialog()} className="bg-[#1A58B3] hover:bg-[#144a96]">
                    <Plus className="w-4 h-4 mr-2" />新增项目清单
                  </Button>
                  <Button variant="outline" onClick={() => { fetchAddonTemplates(); fetchProjectAddons(); }} disabled={addonLoading}>
                    <RefreshCw className={`w-4 h-4 mr-2 ${addonLoading ? 'animate-spin' : ''}`} />刷新
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <Card className="border-blue-200 bg-blue-50">
                  <CardContent className="py-3">
                    <p className="text-sm text-blue-600">项目附加清单</p>
                    <p className="text-xl font-bold text-blue-700 mt-1">{addonStats.totalItems}</p>
                  </CardContent>
                </Card>
                <Card className="border-emerald-200 bg-emerald-50">
                  <CardContent className="py-3">
                    <p className="text-sm text-emerald-600">累计附加数量</p>
                    <p className="text-xl font-bold text-emerald-700 mt-1">{addonStats.totalQuantity.toFixed(2)}</p>
                  </CardContent>
                </Card>
                <Card className="border-orange-200 bg-orange-50">
                  <CardContent className="py-3">
                    <p className="text-sm text-orange-600">累计附加成本</p>
                    <p className="text-xl font-bold text-orange-700 mt-1">{formatCurrency(addonStats.totalAmount)}</p>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <Card>
                  <CardContent className="pt-6 space-y-4">
                    <div>
                      <h4 className="font-semibold">公司通用模板</h4>
                      <p className="text-sm text-gray-500 mt-1">常用内部附加项，可导入到每个项目后单独调整项目单价</p>
                    </div>
                    <Table className="zebra-table">
                      <TableHeader>
                        <TableRow className="bg-[#E8F3FF] hover:bg-[#E8F3FF]">
                          <TableHead>清单名称</TableHead>
                          <TableHead>单位</TableHead>
                          <TableHead className="text-right">默认单价</TableHead>
                          <TableHead>备注</TableHead>
                          <TableHead className="text-center">操作</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {addonTemplates.length > 0 ? addonTemplates.map(template => (
                          <TableRow key={template.id}>
                            <TableCell className="font-medium">{template.name}</TableCell>
                            <TableCell>{template.unit}</TableCell>
                            <TableCell className="text-right">{formatCurrency(parseFloat(template.default_price || '0') || 0)}</TableCell>
                            <TableCell className="text-sm text-gray-500 max-w-40 truncate">{template.remark || '-'}</TableCell>
                            <TableCell>
                              <div className="flex justify-center gap-1">
                                <Button size="sm" variant="ghost" onClick={() => openTemplateDialog(template)}>
                                  <Pencil className="w-3 h-3" />
                                </Button>
                                <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700" onClick={() => handleDeleteTemplate(template.id)}>
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        )) : (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center py-8 text-gray-500">暂无公司通用模板</TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6 space-y-4">
                    <div>
                      <h4 className="font-semibold">当前项目清单</h4>
                      <p className="text-sm text-gray-500 mt-1">这里的项目单价用于月度对下结算和差异金额分析</p>
                    </div>
                    <Table className="zebra-table">
                      <TableHeader>
                        <TableRow className="bg-[#E8F3FF] hover:bg-[#E8F3FF]">
                          <TableHead>清单名称</TableHead>
                          <TableHead>单位</TableHead>
                          <TableHead className="text-right">项目单价</TableHead>
                          <TableHead className="text-right">累计数量</TableHead>
                          <TableHead className="text-right">累计金额</TableHead>
                          <TableHead className="text-center">操作</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {projectAddons.length > 0 ? projectAddons.map(addon => (
                          <TableRow key={addon.id}>
                            <TableCell>
                              <div>
                                <p className="font-medium">{addon.name}</p>
                                {addon.remark && <p className="text-xs text-gray-500 truncate max-w-44">{addon.remark}</p>}
                              </div>
                            </TableCell>
                            <TableCell>{addon.unit}</TableCell>
                            <TableCell className="text-right">{formatCurrency(parseFloat(addon.unit_price || '0') || 0)}</TableCell>
                            <TableCell className="text-right">{(parseFloat(addon.total_quantity || '0') || 0).toFixed(2)}</TableCell>
                            <TableCell className="text-right font-semibold text-orange-600">{formatCurrency(parseFloat(addon.total_amount || '0') || 0)}</TableCell>
                            <TableCell>
                              <div className="flex justify-center gap-1">
                                <Button size="sm" variant="ghost" onClick={() => openProjectAddonDialog(addon)}>
                                  <Pencil className="w-3 h-3" />
                                </Button>
                                <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700" onClick={() => handleDeleteProjectAddon(addon.id)}>
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        )) : (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center py-8 text-gray-500">暂无项目内部附加清单，可从公司模板导入或手动新增</TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* 差异分析标签页 */}
            <TabsContent value="difference" className="space-y-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <h3 className="text-lg font-semibold">差异分析</h3>
                  <p className="text-sm text-gray-500 mt-1">按预算工程量统一维度，对比对上报量与对下结算；内部附加清单只参与金额差异，不参与工程量差异</p>
                </div>
                <div className="flex items-center gap-2">
                  <Select value={analysisYearMonth} onValueChange={setAnalysisYearMonth}>
                    <SelectTrigger className="w-36">
                      <SelectValue placeholder="选择月份" />
                    </SelectTrigger>
                    <SelectContent>
                      {getMonthsList().map(month => (
                        <SelectItem key={month} value={month}>{month}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" onClick={fetchAnalysisRecords} disabled={analysisLoading}>
                    <RefreshCw className={`w-4 h-4 mr-2 ${analysisLoading ? 'animate-spin' : ''}`} />刷新
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                <Card className="border-blue-200 bg-blue-50">
                  <CardContent className="py-3">
                    <p className="text-sm text-blue-600">本月对上金额</p>
                    <p className="text-lg font-bold text-blue-700 mt-1">{formatCurrency(analysisStats.monthlyReportAmount)}</p>
                  </CardContent>
                </Card>
                <Card className="border-emerald-200 bg-emerald-50">
                  <CardContent className="py-3">
                    <p className="text-sm text-emerald-600">本月对下金额</p>
                    <p className="text-lg font-bold text-emerald-700 mt-1">{formatCurrency(analysisStats.monthlySettlementAmount)}</p>
                  </CardContent>
                </Card>
                <Card className={analysisStats.monthlyAmountGap < 0 ? 'border-red-200 bg-red-50' : 'border-sky-200 bg-sky-50'}>
                  <CardContent className="py-3">
                    <p className={analysisStats.monthlyAmountGap < 0 ? 'text-sm text-red-600' : 'text-sm text-sky-600'}>本月金额差异</p>
                    <p className={analysisStats.monthlyAmountGap < 0 ? 'text-lg font-bold text-red-700 mt-1' : 'text-lg font-bold text-sky-700 mt-1'}>
                      {formatCurrency(analysisStats.monthlyAmountGap)}
                    </p>
                  </CardContent>
                </Card>
                <Card className={analysisStats.totalAmountGap < 0 ? 'border-red-200 bg-red-50' : 'border-purple-200 bg-purple-50'}>
                  <CardContent className="py-3">
                    <p className={analysisStats.totalAmountGap < 0 ? 'text-sm text-red-600' : 'text-sm text-purple-600'}>累计金额差异</p>
                    <p className={analysisStats.totalAmountGap < 0 ? 'text-lg font-bold text-red-700 mt-1' : 'text-lg font-bold text-purple-700 mt-1'}>
                      {formatCurrency(analysisStats.totalAmountGap)}
                    </p>
                  </CardContent>
                </Card>
                <Card className={analysisStats.riskCount > 0 ? 'border-orange-200 bg-orange-50' : 'border-gray-200 bg-gray-50'}>
                  <CardContent className="py-3">
                    <p className={analysisStats.riskCount > 0 ? 'text-sm text-orange-600' : 'text-sm text-gray-600'}>风险提醒项</p>
                    <p className={analysisStats.riskCount > 0 ? 'text-lg font-bold text-orange-700 mt-1' : 'text-lg font-bold text-gray-700 mt-1'}>
                      {analysisStats.riskCount}
                    </p>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardContent className="pt-6">
                  {analysisStats.rows.length > 0 ? (
                    <Table className="zebra-table">
                      <TableHeader>
                        <TableRow className="bg-[#E8F3FF] hover:bg-[#E8F3FF]">
                          <TableHead>分项名称</TableHead>
                          <TableHead>单位</TableHead>
                          <TableHead className="text-right">预算量</TableHead>
                          <TableHead className="text-right">本月对上</TableHead>
                          <TableHead className="text-right">本月对下</TableHead>
                          <TableHead className="text-right">累计对上</TableHead>
                          <TableHead className="text-right">累计对下</TableHead>
                          <TableHead className="text-right">量差</TableHead>
                          <TableHead className="text-right">金额差</TableHead>
                          <TableHead>提醒</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {analysisStats.rows.map((row, index) => (
                          <TableRow key={row.id} className={`${row.risks.length > 0 ? 'bg-orange-50/70' : index % 2 === 1 ? 'bg-[#F8FAFC]' : ''} hover:bg-[#F0F7FF]`}>
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                {row.isAddon && <Badge variant="outline" className="border-orange-200 bg-orange-50 text-orange-700">附加</Badge>}
                                <span>{row.subitem_name}</span>
                              </div>
                            </TableCell>
                            <TableCell>{row.unit}</TableCell>
                            <TableCell className="text-right">{row.isAddon ? '-' : row.budgetQty.toFixed(2)}</TableCell>
                            <TableCell className="text-right text-blue-600">{row.isAddon ? '-' : row.monthlyReportedQty.toFixed(2)}</TableCell>
                            <TableCell className="text-right text-emerald-600">{row.monthlySettledQty.toFixed(2)}</TableCell>
                            <TableCell className="text-right font-medium">{row.isAddon ? '-' : row.totalReportedQty.toFixed(2)}</TableCell>
                            <TableCell className="text-right font-medium">{row.totalSettledQty.toFixed(2)}</TableCell>
                            <TableCell className={row.quantityGap < 0 ? 'text-right font-semibold text-red-600' : 'text-right text-gray-700'}>
                              {row.isAddon ? '-' : row.quantityGap.toFixed(2)}
                            </TableCell>
                            <TableCell className={row.amountGap < 0 ? 'text-right font-semibold text-red-600' : 'text-right font-semibold text-[#1A58B3]'}>
                              {formatCurrency(row.amountGap)}
                            </TableCell>
                            <TableCell>
                              {row.risks.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {row.risks.map(risk => (
                                    <Badge key={risk} variant="outline" className="border-orange-200 bg-orange-100 text-orange-700">{risk}</Badge>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-sm text-gray-400">正常</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="text-center py-8 text-gray-500">暂无数据</div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>

      {/* 新增预算工程量对话框 */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新增预算工程量</DialogTitle>
            <DialogDescription>添加分项工程预算</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAdd} className="space-y-4">
            <div>
              <Label>分项名称 *</Label>
              <Input value={form.subitem_name} onChange={(e) => setForm({ ...form, subitem_name: e.target.value })} required placeholder="请输入分项名称" />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>单位 *</Label>
                <Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} required placeholder="如：㎡、m³、t" />
              </div>
              <div>
                <Label>预算量</Label>
                <Input type="number" step="0.01" value={form.budget_quantity || ''} onChange={(e) => setForm({ ...form, budget_quantity: e.target.value })} placeholder="工程量" />
              </div>
              <div>
                <Label>合同单价</Label>
                <Input type="number" step="0.01" value={form.contract_price || ''} onChange={(e) => setForm({ ...form, contract_price: e.target.value })} placeholder="元" />
              </div>
            </div>
            <div>
              <Label>备注</Label>
              <Input value={form.remark || ''} onChange={(e) => setForm({ ...form, remark: e.target.value })} placeholder="备注信息" />
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => setAddDialogOpen(false)}>取消</Button>
              <Button type="submit" disabled={adding}>{adding ? '添加中...' : '添加'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* 编辑预算工程量对话框 */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑预算工程量</DialogTitle>
            <DialogDescription>修改分项工程信息</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEdit} className="space-y-4">
            <div>
              <Label>分项名称 *</Label>
              <Input value={form.subitem_name} onChange={(e) => setForm({ ...form, subitem_name: e.target.value })} required placeholder="请输入分项名称" />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>单位 *</Label>
                <Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} required placeholder="如：㎡、m³、t" />
              </div>
              <div>
                <Label>预算量</Label>
                <Input type="number" step="0.01" value={form.budget_quantity || ''} onChange={(e) => setForm({ ...form, budget_quantity: e.target.value })} placeholder="工程量" />
              </div>
              <div>
                <Label>合同单价</Label>
                <Input type="number" step="0.01" value={form.contract_price || ''} onChange={(e) => setForm({ ...form, contract_price: e.target.value })} placeholder="元" />
              </div>
            </div>
            <div>
              <Label>备注</Label>
              <Input value={form.remark || ''} onChange={(e) => setForm({ ...form, remark: e.target.value })} placeholder="备注信息" />
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)}>取消</Button>
              <Button type="submit">保存</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* 批量导入对话框 */}
      <Dialog open={batchDialogOpen} onOpenChange={(open) => { setBatchDialogOpen(open); if (!open) { setBatchText(''); setUploadFileName(''); }}}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>批量导入预算工程量</DialogTitle>
            <DialogDescription>上传文件或直接粘贴数据</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleBatchAdd} className="space-y-4">
            <input ref={fileInputRef} type="file" accept=".csv,.txt" onChange={handleFileUpload} className="hidden" />
            <div className="space-y-2">
              <Label>上传文件（可选）</Label>
              <div className="flex gap-2 items-center">
                <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
                  <FileSpreadsheet className="w-4 h-4 mr-2" />选择文件
                </Button>
                {uploadFileName && <span className="text-sm text-green-600">{uploadFileName}</span>}
              </div>
              <p className="text-xs text-gray-500">列顺序：分项名称,单位,预算量,合同单价,备注</p>
            </div>
            <div>
              <div className="flex justify-between items-center mb-1">
                <Label>数据内容</Label>
                <Button type="button" variant="ghost" size="sm" onClick={downloadTemplate}>
                  <Download className="w-3 h-3 mr-1" />下载模板
                </Button>
              </div>
              <Textarea 
                className="font-mono text-sm min-h-48"
                placeholder="分项名称,单位,预算量,合同单价,备注&#10;模板工程,㎡,1000,50,&#10;钢筋工程,t,50,200,"
                value={batchText}
                onChange={(e) => setBatchText(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => setBatchDialogOpen(false)}>取消</Button>
              <Button type="submit" disabled={!batchText.trim()}>导入</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* 批量删除确认对话框 */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>确定要删除选中的 {selectedIds.size} 条记录吗？此操作不可恢复。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleBatchDelete} className="bg-red-600 hover:bg-red-700">删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 内部附加清单公司模板对话框 */}
      <Dialog open={templateDialogOpen} onOpenChange={(open) => { setTemplateDialogOpen(open); if (!open) resetTemplateForm(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingTemplate ? '编辑公司通用模板' : '新增公司通用模板'}</DialogTitle>
            <DialogDescription>维护公司常用内部附加清单，可导入到具体项目中使用</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveTemplate} className="space-y-4">
            <div>
              <Label>清单名称 *</Label>
              <Input value={templateForm.name} onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })} required placeholder="如：修补打磨" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>单位 *</Label>
                <Input value={templateForm.unit} onChange={(e) => setTemplateForm({ ...templateForm, unit: e.target.value })} required placeholder="如：㎡、工日、项" />
              </div>
              <div>
                <Label>默认单价</Label>
                <Input type="number" step="0.01" value={templateForm.default_price} onChange={(e) => setTemplateForm({ ...templateForm, default_price: e.target.value })} placeholder="元" />
              </div>
            </div>
            <div>
              <Label>备注</Label>
              <Input value={templateForm.remark} onChange={(e) => setTemplateForm({ ...templateForm, remark: e.target.value })} placeholder="适用说明" />
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => setTemplateDialogOpen(false)}>取消</Button>
              <Button type="submit" disabled={addonSaving}>{addonSaving ? '保存中...' : '保存'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* 项目内部附加清单对话框 */}
      <Dialog open={projectAddonDialogOpen} onOpenChange={(open) => { setProjectAddonDialogOpen(open); if (!open) resetProjectAddonForm(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingProjectAddon ? '编辑项目内部附加清单' : '新增项目内部附加清单'}</DialogTitle>
            <DialogDescription>项目单价会用于月度对下结算和差异金额分析</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveProjectAddon} className="space-y-4">
            <div>
              <Label>清单名称 *</Label>
              <Input value={projectAddonForm.name} onChange={(e) => setProjectAddonForm({ ...projectAddonForm, name: e.target.value })} required placeholder="请输入清单名称" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>单位 *</Label>
                <Input value={projectAddonForm.unit} onChange={(e) => setProjectAddonForm({ ...projectAddonForm, unit: e.target.value })} required placeholder="如：㎡、工日、项" />
              </div>
              <div>
                <Label>项目单价</Label>
                <Input type="number" step="0.01" value={projectAddonForm.unit_price} onChange={(e) => setProjectAddonForm({ ...projectAddonForm, unit_price: e.target.value })} placeholder="元" />
              </div>
            </div>
            <div>
              <Label>备注</Label>
              <Input value={projectAddonForm.remark} onChange={(e) => setProjectAddonForm({ ...projectAddonForm, remark: e.target.value })} placeholder="项目适用说明" />
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => setProjectAddonDialogOpen(false)}>取消</Button>
              <Button type="submit" disabled={addonSaving}>{addonSaving ? '保存中...' : '保存'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* 编辑对上报量对话框 */}
      <Dialog open={budgetEditDialogOpen} onOpenChange={setBudgetEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑对上报量</DialogTitle>
            <DialogDescription>修改上报量和价格信息</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleBudgetEdit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>分项名称</Label>
                <Input value={budgetEditItem?.subitem_name || ''} disabled />
              </div>
              <div>
                <Label>单位</Label>
                <Input value={budgetEditItem?.unit || ''} disabled />
              </div>
            </div>
            <div>
              <Label>对上报量 *</Label>
              <Input type="number" step="0.01" value={budgetForm.budget_quantity} onChange={(e) => setBudgetForm({ ...budgetForm, budget_quantity: e.target.value })} required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>合同价</Label>
                <Input type="number" step="0.01" value={budgetForm.contract_price} onChange={(e) => setBudgetForm({ ...budgetForm, contract_price: e.target.value })} />
              </div>
              <div>
                <Label>限价</Label>
                <Input type="number" step="0.01" value={budgetForm.limit_price} onChange={(e) => setBudgetForm({ ...budgetForm, limit_price: e.target.value })} />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => setBudgetEditDialogOpen(false)}>取消</Button>
              <Button type="submit">保存</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* 月度对上报量对话框 */}
      <Dialog open={monthlyReportDialogOpen} onOpenChange={setMonthlyReportDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              月度对上报量录入
            </DialogTitle>
            <DialogDescription>按月录入各分项工程的对上报量，系统自动累计总上报量</DialogDescription>
          </DialogHeader>
          
          <div className="flex items-center gap-4 py-2 border-b">
            <Label className="text-sm">选择月份：</Label>
            <Select value={selectedYearMonth} onValueChange={(value) => {
              setSelectedYearMonth(value);
              fetchMonthlyReportRecords(value);
            }}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="选择月份" />
              </SelectTrigger>
              <SelectContent>
                {getMonthsList().map(month => (
                  <SelectItem key={month} value={month}>{month}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-sm text-gray-500 ml-auto">
              项目：{selectedProject?.name || ''}
            </span>
          </div>

          {monthlyReportLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="loading-spinner" />
            </div>
          ) : (
            <div className="flex-1 overflow-auto">
              <Table className="zebra-table">
              <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">序号</TableHead>
                    <TableHead>分项名称</TableHead>
                    <TableHead>单位</TableHead>
                    <TableHead className="text-right">预算量</TableHead>
                    <TableHead className="text-right">当月上报量</TableHead>
                    <TableHead className="text-right">累计上报量</TableHead>
                    <TableHead className="text-right">剩余工程量</TableHead>
                    <TableHead className="text-right">上报率</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthlyReportRecords.map((record, index) => {
                    const budget = parseFloat(record.budget_quantity) || 0;
                    const monthlyQty = parseFloat(record.report_quantity) || 0;
                    const totalQty = parseFloat(record.total_reported) || 0;
                    const remaining = budget - totalQty;
                    const progress = budget > 0 ? (totalQty / budget) * 100 : 0;
                    
                    return (
                      <TableRow key={record.subitem_id}>
                        <TableCell className="text-gray-400">{index + 1}</TableCell>
                        <TableCell className="font-medium">{record.subitem_name}</TableCell>
                        <TableCell>{record.unit}</TableCell>
                        <TableCell className="text-right">{record.budget_quantity}</TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            step="0.01"
                            className="w-24 text-right"
                            value={record.report_quantity}
                            onChange={(e) => handleMonthlyReportChange(record.subitem_id, e.target.value)}
                            placeholder="0"
                          />
                        </TableCell>
                        <TableCell className="text-right font-medium text-blue-600">{record.total_reported}</TableCell>
                        <TableCell className="text-right font-medium text-orange-600">{remaining.toFixed(2)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                              <div 
                                className={`h-full ${progress >= 100 ? 'bg-green-500' : progress >= 80 ? 'bg-red-500' : 'bg-blue-500'}`}
                                style={{ width: `${Math.min(progress, 100)}%` }}
                              />
                            </div>
                            <span className="text-xs w-12">{progress.toFixed(1)}%</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="flex justify-between items-center pt-4 border-t">
            <div className="flex gap-2">
              <input
                type="file"
                ref={monthlyReportFileRef}
                accept=".xlsx,.xls"
                onChange={handleMonthlyReportImport}
                className="hidden"
              />
              <Button 
                variant="outline" 
                onClick={() => monthlyReportFileRef.current?.click()}
                disabled={monthlyReportImporting || !selectedProjectId}
              >
                {monthlyReportImporting ? '导入中...' : 'Excel导入'}
              </Button>
              <Button 
                variant="outline" 
                onClick={handleDownloadMonthlyTemplate}
                disabled={!selectedProjectId}
              >
                <Download className="w-4 h-4 mr-2" />下载模板
              </Button>
              <Button 
                variant="outline" 
                onClick={() => setMonthlyReportHistoryOpen(true)}
              >
                查看历史记录
              </Button>
            </div>
            <p className="text-sm text-gray-500 flex-1 text-center">
              提示：输入当月上报量后点击保存，系统会自动累计到总上报量
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setMonthlyReportDialogOpen(false)}>取消</Button>
              <Button onClick={handleSaveMonthlyReport}>保存</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 月度报量历史记录对话框 */}
      <Dialog open={monthlyReportHistoryOpen} onOpenChange={setMonthlyReportHistoryOpen}>
        <DialogContent className="max-w-6xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              月度报量历史记录
            </DialogTitle>
            <DialogDescription>
              {selectedSubitem?.item_name} - 历史报量数据
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 overflow-auto">
            <Table className="zebra-table">
              <TableHeader>
                <TableRow>
                  <TableHead>序号</TableHead>
                  <TableHead>年月</TableHead>
                  <TableHead className="text-right">上报量</TableHead>
                  <TableHead>备注</TableHead>
                  <TableHead>上报日期</TableHead>
                  <TableHead>创建时间</TableHead>
                  <TableHead className="text-center">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {monthlyReportHistory.length > 0 ? (
                  monthlyReportHistory.map((record, index) => (
                    <TableRow key={record.id}>
                      <TableCell>{index + 1}</TableCell>
                      <TableCell className="font-medium">{record.year_month}</TableCell>
                      <TableCell className="text-right">{Number(record.report_quantity).toFixed(2)}</TableCell>
                      <TableCell className="text-gray-500 max-w-32 truncate">{record.remark || '-'}</TableCell>
                      <TableCell>{record.report_date || '-'}</TableCell>
                      <TableCell className="text-gray-400 text-sm">{new Date(record.created_at).toLocaleString()}</TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => openMonthlyReportEditDialog(record)}
                            className="h-8 px-2"
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => handleDeleteMonthlyReport(record.id)}
                            className="h-8 px-2 text-red-500 hover:text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-gray-500">
                      暂无历史记录
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex justify-end pt-4 border-t">
            <Button variant="outline" onClick={() => setMonthlyReportHistoryOpen(false)}>关闭</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 月度报量编辑对话框 */}
      <Dialog open={monthlyReportEditDialogOpen} onOpenChange={setMonthlyReportEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-5 h-5" />
              编辑月度报量
            </DialogTitle>
            <DialogDescription>修改月度对上报量数据</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); handleSaveMonthlyReportEdit(); }} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>年月</Label>
                <Input value={monthlyReportEditRecord?.year_month || ''} disabled />
              </div>
              <div>
                <Label>分项名称</Label>
                <Input value={monthlyReportEditRecord?.subitem_name || monthlyReportEditRecord?.subitem?.subitem_name || ''} disabled />
              </div>
            </div>
            <div>
              <Label>上报量 *</Label>
              <Input 
                type="number" 
                step="0.01"
                value={monthlyReportEditForm.report_quantity}
                onChange={(e) => setMonthlyReportEditForm({ ...monthlyReportEditForm, report_quantity: e.target.value })}
                required
              />
            </div>
            <div>
              <Label>备注</Label>
              <Input 
                value={monthlyReportEditForm.remark}
                onChange={(e) => setMonthlyReportEditForm({ ...monthlyReportEditForm, remark: e.target.value })}
                placeholder="可填写备注信息"
              />
            </div>
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button variant="outline" type="button" onClick={() => setMonthlyReportEditDialogOpen(false)}>取消</Button>
              <Button type="submit">保存修改</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* 月度对下结算量对话框 */}
      <Dialog open={monthlySettlementDialogOpen} onOpenChange={setMonthlySettlementDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              月度对下结算量录入
            </DialogTitle>
            <DialogDescription>按月录入各分项工程的对下结算量，系统自动累计总结算量</DialogDescription>
          </DialogHeader>
          
          <div className="flex items-center gap-4 py-2 border-b">
            <Label className="text-sm">选择月份：</Label>
            <Select value={settlementYearMonth} onValueChange={(value) => {
              setSettlementYearMonth(value);
              fetchMonthlySettlementRecords(value);
            }}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="选择月份" />
              </SelectTrigger>
              <SelectContent>
                {getMonthsList().map(month => (
                  <SelectItem key={month} value={month}>{month}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-sm text-gray-500 ml-auto">
              项目：{selectedProject?.name || ''}
            </span>
          </div>

          {monthlySettlementLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="loading-spinner" />
            </div>
          ) : (
            <div className="flex-1 overflow-auto space-y-6">
              <Table className="zebra-table">
              <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">序号</TableHead>
                    <TableHead>分项名称</TableHead>
                    <TableHead>单位</TableHead>
                    <TableHead className="text-right">预算量</TableHead>
                    <TableHead className="text-right">当月结算量</TableHead>
                    <TableHead className="text-right">累计结算量</TableHead>
                    <TableHead className="text-right">剩余工程量</TableHead>
                    <TableHead className="text-right">结算率</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthlySettlementRecords.map((record, index) => {
                    const budget = parseFloat(record.budget_quantity) || 0;
                    const monthlyQty = parseFloat(record.settlement_quantity) || 0;
                    const totalQty = parseFloat(record.total_settlement) || 0;
                    const remaining = budget - totalQty;
                    const progress = budget > 0 ? (totalQty / budget) * 100 : 0;
                    
                    return (
                      <TableRow key={record.subitem_id}>
                        <TableCell className="text-gray-400">{index + 1}</TableCell>
                        <TableCell className="font-medium">{record.subitem_name}</TableCell>
                        <TableCell>{record.unit}</TableCell>
                        <TableCell className="text-right">{record.budget_quantity}</TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            step="0.01"
                            className="w-24 text-right"
                            value={record.settlement_quantity}
                            onChange={(e) => handleMonthlySettlementChange(record.subitem_id, e.target.value)}
                            placeholder="0"
                          />
                        </TableCell>
                        <TableCell className="text-right font-medium text-blue-600">{record.total_settlement}</TableCell>
                        <TableCell className="text-right font-medium text-orange-600">{remaining.toFixed(2)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                              <div 
                                className={`h-full ${progress >= 100 ? 'bg-green-500' : progress >= 80 ? 'bg-red-500' : 'bg-blue-500'}`}
                                style={{ width: `${Math.min(progress, 100)}%` }}
                              />
                            </div>
                            <span className="text-xs w-12">{progress.toFixed(1)}%</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {monthlyAddonSettlementRecords.length > 0 && (
                <div className="space-y-3">
                  <div>
                    <h4 className="font-semibold flex items-center gap-2">
                      <Layers className="w-4 h-4 text-orange-500" />
                      内部附加清单
                    </h4>
                    <p className="text-sm text-gray-500 mt-1">附加项只计入对下成本金额，不参与预算工程量、剩余工程量和结算率对比</p>
                  </div>
                  <Table className="zebra-table">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">序号</TableHead>
                        <TableHead>清单名称</TableHead>
                        <TableHead>单位</TableHead>
                        <TableHead className="text-right">项目单价</TableHead>
                        <TableHead className="text-right">当月结算数量</TableHead>
                        <TableHead className="text-right">当月金额</TableHead>
                        <TableHead className="text-right">累计数量</TableHead>
                        <TableHead className="text-right">累计金额</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {monthlyAddonSettlementRecords.map((record, index) => {
                        const monthlyQty = parseFloat(record.quantity || '0') || 0;
                        const unitPrice = parseFloat(record.unit_price || '0') || 0;
                        const monthlyAmount = monthlyQty * unitPrice;
                        return (
                          <TableRow key={record.addon_id}>
                            <TableCell className="text-gray-400">{index + 1}</TableCell>
                            <TableCell className="font-medium">{record.name}</TableCell>
                            <TableCell>{record.unit}</TableCell>
                            <TableCell className="text-right">{formatCurrency(unitPrice)}</TableCell>
                            <TableCell className="text-right">
                              <Input
                                type="number"
                                step="0.01"
                                className="w-24 text-right"
                                value={record.quantity}
                                onChange={(e) => handleMonthlyAddonSettlementChange(record.addon_id, e.target.value)}
                                placeholder="0"
                              />
                            </TableCell>
                            <TableCell className="text-right font-semibold text-orange-600">{formatCurrency(monthlyAmount)}</TableCell>
                            <TableCell className="text-right">{(parseFloat(record.total_quantity || '0') || 0).toFixed(2)}</TableCell>
                            <TableCell className="text-right font-semibold text-orange-600">{formatCurrency(parseFloat(record.total_amount || '0') || 0)}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-between items-center pt-4 border-t">
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                onClick={openSettlementHistory}
              >
                <FileText className="w-4 h-4 mr-2" />
                查看历史记录
              </Button>
              <p className="text-sm text-gray-500 flex items-center">
                提示：分项工程累计到总结算量；内部附加清单只累计到对下成本金额
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setMonthlySettlementDialogOpen(false)}>取消</Button>
              <Button onClick={handleSaveMonthlySettlement}>保存</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 对下结算量历史记录对话框 */}
      <Dialog open={settlementHistoryOpen} onOpenChange={setSettlementHistoryOpen}>
        <DialogContent className="max-w-6xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              对下结算量历史记录
            </DialogTitle>
            <DialogDescription>
              {selectedSubitem?.subitem_name || selectedSubitem?.item_name} - 历史结算数据
            </DialogDescription>
          </DialogHeader>
          
          {settlementHistoryLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="loading-spinner" />
            </div>
          ) : (
            <div className="flex-1 overflow-auto">
              <Table className="zebra-table">
              <TableHeader>
                  <TableRow>
                    <TableHead>序号</TableHead>
                    <TableHead>年月</TableHead>
                    <TableHead className="text-right">结算量</TableHead>
                    <TableHead>备注</TableHead>
                    <TableHead>创建时间</TableHead>
                    <TableHead className="text-center">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {settlementHistory.length > 0 ? (
                    settlementHistory.map((record, index) => (
                      <TableRow key={record.id}>
                        <TableCell>{index + 1}</TableCell>
                        <TableCell className="font-medium">{record.year_month}</TableCell>
                        <TableCell className="text-right">{Number(record.completed_quantity).toFixed(2)}</TableCell>
                        <TableCell className="text-gray-500 max-w-32 truncate">{record.remark || '-'}</TableCell>
                        <TableCell className="text-gray-400 text-sm">{new Date(record.created_at).toLocaleString()}</TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => openSettlementEditDialog(record)}
                              className="h-8 px-2"
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => handleDeleteSettlement(record.id)}
                              className="h-8 px-2 text-red-500 hover:text-red-600 hover:bg-red-50"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-gray-500">
                        暂无历史记录
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="flex justify-end pt-4 border-t">
            <Button variant="outline" onClick={() => setSettlementHistoryOpen(false)}>关闭</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 对下结算量编辑对话框 */}
      <Dialog open={settlementEditDialogOpen} onOpenChange={setSettlementEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-5 h-5" />
              编辑对下结算量
            </DialogTitle>
            <DialogDescription>修改月度对下结算量数据</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); handleSaveSettlementEdit(); }} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>年月</Label>
                <Input value={settlementEditRecord?.year_month || ''} disabled />
              </div>
              <div>
                <Label>分项名称</Label>
                <Input value={settlementEditRecord?.subitem_name || settlementEditRecord?.work_item_subitems?.subitem_name || ''} disabled />
              </div>
            </div>
            <div>
              <Label>结算量 *</Label>
              <Input 
                type="number" 
                step="0.01"
                value={settlementEditForm.completed_quantity}
                onChange={(e) => setSettlementEditForm({ ...settlementEditForm, completed_quantity: e.target.value })}
                required
              />
            </div>
            <div>
              <Label>备注</Label>
              <Input 
                value={settlementEditForm.remark}
                onChange={(e) => setSettlementEditForm({ ...settlementEditForm, remark: e.target.value })}
                placeholder="可填写备注信息"
              />
            </div>
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button variant="outline" type="button" onClick={() => setSettlementEditDialogOpen(false)}>取消</Button>
              <Button type="submit">保存修改</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ========== 对上报量历史记录（独立） ========== */}
      <Dialog open={reportHistoryOpen} onOpenChange={setReportHistoryOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              对上报量历史记录
            </DialogTitle>
            <DialogDescription>
              {reportHistoryItem?.subitem_name} - 历史报量数据
            </DialogDescription>
          </DialogHeader>
          
          {reportHistoryLoading ? (
            <div className="flex-1 flex items-center justify-center py-8">
              <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
            </div>
          ) : (
            <div className="flex-1 overflow-auto">
              <Table className="zebra-table">
              <TableHeader>
                  <TableRow>
                    <TableHead>序号</TableHead>
                    <TableHead>年月</TableHead>
                    <TableHead className="text-right">上报量</TableHead>
                    <TableHead>备注</TableHead>
                    <TableHead>创建时间</TableHead>
                    <TableHead className="text-center">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reportHistoryData.length > 0 ? (
                    reportHistoryData.map((record, index) => (
                      <TableRow key={record.id}>
                        <TableCell>{index + 1}</TableCell>
                        <TableCell className="font-medium">{record.year_month}</TableCell>
                        <TableCell className="text-right">{Number(record.report_quantity).toFixed(2)}</TableCell>
                        <TableCell className="text-gray-500 max-w-32 truncate">{record.remark || '-'}</TableCell>
                        <TableCell className="text-gray-400 text-sm">{new Date(record.created_at).toLocaleString()}</TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button variant="ghost" size="sm" onClick={() => openReportHistoryEditDialog(record)} className="h-8 px-2">
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handleDeleteReportHistory(record.id)} className="h-8 px-2 text-red-500 hover:text-red-600 hover:bg-red-50">
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-gray-500 py-8">
                        暂无历史记录
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="flex justify-end pt-4 border-t">
            <Button variant="outline" onClick={() => setReportHistoryOpen(false)}>关闭</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 对上报量历史编辑对话框 */}
      <Dialog open={reportHistoryEditDialogOpen} onOpenChange={setReportHistoryEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-5 h-5" />
              编辑对上报量
            </DialogTitle>
            <DialogDescription>修改月度对上报量数据</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); handleSaveReportHistoryEdit(); }} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>年月</Label>
                <Input value={reportHistoryEditRecord?.year_month || ''} disabled />
              </div>
              <div>
                <Label>分项名称</Label>
                <Input value={reportHistoryItem?.subitem_name || ''} disabled />
              </div>
            </div>
            <div>
              <Label>上报量 *</Label>
              <Input type="number" step="0.01" value={reportHistoryEditForm.report_quantity} onChange={(e) => setReportHistoryEditForm({ ...reportHistoryEditForm, report_quantity: e.target.value })} required />
            </div>
            <div>
              <Label>备注</Label>
              <Input value={reportHistoryEditForm.remark} onChange={(e) => setReportHistoryEditForm({ ...reportHistoryEditForm, remark: e.target.value })} placeholder="可填写备注信息" />
            </div>
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button variant="outline" type="button" onClick={() => setReportHistoryEditDialogOpen(false)}>取消</Button>
              <Button type="submit">保存修改</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ========== 对下结算量历史记录（独立） ========== */}
      <Dialog open={settleHistoryOpen} onOpenChange={setSettleHistoryOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              对下结算量历史记录
            </DialogTitle>
            <DialogDescription>
              {settleHistoryItem?.subitem_name} - 历史结算数据
            </DialogDescription>
          </DialogHeader>
          
          {settleHistoryLoading ? (
            <div className="flex-1 flex items-center justify-center py-8">
              <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
            </div>
          ) : (
            <div className="flex-1 overflow-auto">
              <Table className="zebra-table">
              <TableHeader>
                  <TableRow>
                    <TableHead>序号</TableHead>
                    <TableHead>年月</TableHead>
                    <TableHead className="text-right">结算量</TableHead>
                    <TableHead>备注</TableHead>
                    <TableHead>创建时间</TableHead>
                    <TableHead className="text-center">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {settleHistoryData.length > 0 ? (
                    settleHistoryData.map((record, index) => (
                      <TableRow key={record.id}>
                        <TableCell>{index + 1}</TableCell>
                        <TableCell className="font-medium">{record.year_month}</TableCell>
                        <TableCell className="text-right">{Number(record.completed_quantity).toFixed(2)}</TableCell>
                        <TableCell className="text-gray-500 max-w-32 truncate">{record.remark || '-'}</TableCell>
                        <TableCell className="text-gray-400 text-sm">{new Date(record.created_at).toLocaleString()}</TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button variant="ghost" size="sm" onClick={() => openSettleHistoryEditDialog(record)} className="h-8 px-2">
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handleDeleteSettleHistory(record.id)} className="h-8 px-2 text-red-500 hover:text-red-600 hover:bg-red-50">
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-gray-500 py-8">
                        暂无历史记录
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="flex justify-end pt-4 border-t">
            <Button variant="outline" onClick={() => setSettleHistoryOpen(false)}>关闭</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 对下结算量历史编辑对话框 */}
      <Dialog open={settleHistoryEditDialogOpen} onOpenChange={setSettleHistoryEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-5 h-5" />
              编辑对下结算量
            </DialogTitle>
            <DialogDescription>修改月度对下结算量数据</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); handleSaveSettleHistoryEdit(); }} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>年月</Label>
                <Input value={settleHistoryEditRecord?.year_month || ''} disabled />
              </div>
              <div>
                <Label>分项名称</Label>
                <Input value={settleHistoryItem?.subitem_name || ''} disabled />
              </div>
            </div>
            <div>
              <Label>结算量 *</Label>
              <Input type="number" step="0.01" value={settleHistoryEditForm.completed_quantity} onChange={(e) => setSettleHistoryEditForm({ ...settleHistoryEditForm, completed_quantity: e.target.value })} required />
            </div>
            <div>
              <Label>备注</Label>
              <Input value={settleHistoryEditForm.remark} onChange={(e) => setSettleHistoryEditForm({ ...settleHistoryEditForm, remark: e.target.value })} placeholder="可填写备注信息" />
            </div>
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button variant="outline" type="button" onClick={() => setSettleHistoryEditDialogOpen(false)}>取消</Button>
              <Button type="submit">保存修改</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
