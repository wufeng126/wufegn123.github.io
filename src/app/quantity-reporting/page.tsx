'use client';
import { useToast } from '@/hooks/use-toast';

import { useState, useEffect, useRef, useMemo, useCallback, Suspense, Fragment } from 'react';
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
  BarChart3, ListTree, Target, CheckCircle2, TrendingUp,
  Building2, RefreshCw, Plus, Pencil, Trash2, Upload, Download,
  Search, X, FileSpreadsheet, FileText, AlertTriangle, Calendar, Save, Copy, Layers,
  ArrowUpRight, ArrowDownRight, ShieldAlert, ChevronRight, ArrowLeft, ArrowRight, Scale
} from 'lucide-react';
import { AnimatedNumber, formatCurrency } from '@/components/ui/animated-number';
import { useConfirm } from '@/hooks/use-confirm';
import { effectiveSettlementPrice } from '@/lib/settlement-price';

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

type ProgressExpectedRecord = {
  subitem_id: number;
  expected_quantity: number;
  matched_quantity: number;
  task_count: number;
  completed_task_count: number;
  latest_progress: number;
  task_labels: string[];
  unit: string;
};

type DashboardStatus = '正常' | '对上偏慢' | '对下偏快' | '重点关注';
type EntryWorkbenchMode = 'client' | 'internal' | 'additional';
type QuantityView = 'summary' | 'entry';
type QuantityEntryPanel = 'monthly' | 'ledger';

interface ProjectDashboardRow {
  project: Project;
  itemCount: number;
  budgetAmount: number;
  reportAmount: number;
  settlementBudgetAmount: number;
  settlementAmount: number;
  reportRemainingAmount: number;
  settlementRemainingAmount: number;
  reportProgress: number;
  settlementProgress: number;
  amountGap: number;
  quantityGap: number;
  status: DashboardStatus;
  warning: string;
}

const toNumber = (value: string | number | null | undefined) => {
  const parsed = typeof value === 'number' ? value : parseFloat(value || '0');
  return Number.isFinite(parsed) ? parsed : 0;
};

const clampProgress = (value: number) => Math.max(0, Math.min(value, 100));

const ENTRY_WORKBENCH_MODES: Array<{
  key: EntryWorkbenchMode;
  label: string;
  description: string;
  activeClass: string;
}> = [
  {
    key: 'client',
    label: '对上报量',
    description: '按合同清单录入本月向甲方报量',
    activeClass: 'border-blue-500 bg-blue-50 text-blue-700',
  },
  {
    key: 'internal',
    label: '对下结算',
    description: '按预算工程量清单录入本月对下结算',
    activeClass: 'border-emerald-500 bg-emerald-50 text-emerald-700',
  },
  {
    key: 'additional',
    label: '内部附加清单',
    description: '只参与金额统计，不参与工程量差异',
    activeClass: 'border-amber-500 bg-amber-50 text-amber-700',
  },
];



export default function WorkItemsPage() {
  return (
    <Suspense fallback={
      // 加载态统一：骨架屏（替代纯文字"加载中..."）
      <div className="p-4 md:p-6 space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-12 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
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
  const [quantityView, setQuantityView] = useState<QuantityView>('summary');
  const [entryPanel, setEntryPanel] = useState<QuantityEntryPanel>('monthly');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [dashboardKeyword, setDashboardKeyword] = useState('');
  
  // 预警筛选模式
  const [warningFilter, setWarningFilter] = useState<string>('');
  
  // 预算工程量相关状态
  const [searchKeyword, setSearchKeyword] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  
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
    limit_price: '', // P0-2：新增分项即填限价（内部成本控制线），避免限价留空导致结算价 fallback 混用
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

  // P0-1 勾稽台账（报量-结算-回款月度结转）
  const [reconYearMonth, setReconYearMonth] = useState<string>('');
  const [reconData, setReconData] = useState<{ rows: any[]; summary: any } | null>(null);
  const [reconLoading, setReconLoading] = useState(false);

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
  const [analysisProgressExpected, setAnalysisProgressExpected] = useState<ProgressExpectedRecord[]>([]);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [entryWorkbenchMode, setEntryWorkbenchMode] = useState<EntryWorkbenchMode>('client');
  useEffect(() => {
    fetchData();
    fetchAddonTemplates();
  }, []);

  // 处理 URL 参数
  useEffect(() => {
    const projectIdParam = searchParams.get('projectId');
    const warningParam = searchParams.get('warning');
    
    const projectId = Number(projectIdParam);
    if (projectIdParam && Number.isInteger(projectId) && projectId > 0) {
      setSelectedProjectId(projectIdParam);
      setQuantityView('entry');
      setEntryPanel('monthly');
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
      setAnalysisProgressExpected([]);
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

  // P0-1 勾稽台账：默认月份 + 数据加载（报量/结算保存后 allSubitems 变化自动刷新）
  useEffect(() => {
    if (!reconYearMonth) {
      setReconYearMonth(getCurrentYearMonth());
    }
  }, [reconYearMonth]);

  useEffect(() => {
    if (selectedProjectId && reconYearMonth) {
      fetchReconciliation();
    } else {
      setReconData(null);
    }
  }, [selectedProjectId, reconYearMonth, allSubitems]);

  const confirm = useConfirm();

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
      // 网络抖动时保留已有数据，避免整页台账变空（观感等同数据被删）
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
    if (!(await confirm({
      title: '确定删除该公司通用模板吗？',
      description: '已导入项目的清单不会受影响。',
      variant: 'destructive',
    }))) return;

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
    if (!(await confirm({
      title: '确定删除该项目内部附加清单吗？',
      description: '历史结算记录会保留，但该清单不再显示。',
      variant: 'destructive',
    }))) return;

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
    activeProjects: projects.filter(p => p.status === '进行中' || p.status === '在建').length,
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
      const price = effectiveSettlementPrice({ limitPrice: item.limit_price, contractPrice: item.contract_price });
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

    const progressExpectedMap = new Map<number, ProgressExpectedRecord>();
    analysisProgressExpected.forEach(record => {
      progressExpectedMap.set(Number(record.subitem_id), record);
    });

    const monthlySettlementMap = new Map<number, { qty: number; unitPrice: number | null }>();
    analysisSettlements.forEach(record => {
      const unitPriceRaw = record.unit_price;
      monthlySettlementMap.set(Number(record.subitem_id), {
        qty: parseFloat(record.completed_quantity || '0') || 0,
        unitPrice: unitPriceRaw != null && unitPriceRaw !== '' ? Number(unitPriceRaw) : null,
      });
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
      const progressExpected = progressExpectedMap.get(item.id);
      const progressExpectedQty = progressExpected?.expected_quantity || 0;
      const reportVsProgressGap = monthlyReportedQty - progressExpectedQty;
      const monthlySettled = monthlySettlementMap.get(item.id);
      const monthlySettledQty = monthlySettled?.qty || 0;
      const contractPrice = parseFloat(item.contract_price || '0') || 0;
      // P0 修复：结算单价统一取「本月结算记录录入的实际单价」→ 限价 → 合同价（与勾稽台账口径一致），
      // 此前直接用 limit_price || contract_price 会忽略录入的实际结算单价，导致成本系统性少算。
      const settlementPrice = effectiveSettlementPrice({
        recordUnitPrice: monthlySettled?.unitPrice,
        limitPrice: item.limit_price,
        contractPrice: item.contract_price,
      });
      const reportAmount = totalReportedQty * contractPrice;
      const settlementAmount = totalSettledQty * settlementPrice;
      const monthlyReportAmount = monthlyReportedQty * contractPrice;
      const monthlySettlementAmount = monthlySettledQty * settlementPrice;
      const reportRemainingQty = budgetQty - totalReportedQty;
      const settleRemainingQty = budgetQty - totalSettledQty;
      const quantityGap = totalReportedQty - totalSettledQty;
      const amountGap = reportAmount - settlementAmount;
      const settleProgress = budgetQty > 0 ? totalSettledQty / budgetQty : 0;
      const reportRemainingRate = budgetQty > 0 ? reportRemainingQty / budgetQty : 0;
      const risks: string[] = [];

      if (totalSettledQty > totalReportedQty) risks.push('多结少报');
      if (monthlySettledQty > 0 && monthlyReportedQty <= 0) risks.push('本月漏报');
      if (budgetQty > 0 && reportRemainingQty / budgetQty < 0.1) risks.push('对上余量不足');
      if (settlementAmount > reportAmount) risks.push('资金/利润风险');
      if (budgetQty > 0 && totalSettledQty > budgetQty) risks.push('对下超结');
      if (settleProgress >= 0.8 && reportRemainingRate >= 0.2) risks.push('漏报风险');
      const progressGapTolerance = Math.max(1, progressExpectedQty * 0.1);
      if (progressExpectedQty > 0 && monthlyReportedQty <= 0) risks.push('现场完成未报');
      else if (progressExpectedQty > 0 && reportVsProgressGap <= -progressGapTolerance) risks.push('进度少报');
      else if (progressExpectedQty > 0 && reportVsProgressGap >= progressGapTolerance) risks.push('进度超报');

      return {
        ...item,
        isAddon: false,
        budgetQty,
        totalReportedQty,
        totalSettledQty,
        monthlyReportedQty,
        progressExpectedQty,
        reportVsProgressGap,
        progressTaskCount: progressExpected?.task_count || 0,
        progressTaskLabels: progressExpected?.task_labels || [],
        monthlySettledQty,
        contractPrice,
        limitPrice: parseFloat(item.limit_price || '0') || 0,
        settlementPrice,
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
        progressExpectedQty: 0,
        reportVsProgressGap: 0,
        progressTaskCount: 0,
        progressTaskLabels: [],
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
  }, [subitems, projectAddons, analysisReports, analysisSettlements, analysisAddonSettlements, analysisProgressExpected]);

  const projectComparisonSummary = useMemo(() => {
    const budgetAmount = projectStats.totalBudget;
    const settlementBudgetAmount = subitems.reduce((sum, item) => {
      const qty = parseFloat(item.budget_quantity || '0') || 0;
      const price = effectiveSettlementPrice({ limitPrice: item.limit_price, contractPrice: item.contract_price });
      return sum + qty * price;
    }, 0);
    const reportAmount = analysisStats.totalReportAmount;
    const settlementAmount = analysisStats.totalSettlementAmount;
    const reportRemainingAmount = budgetAmount - reportAmount;
    const settlementRemainingAmount = settlementBudgetAmount - settlementAmount;
    const reportProgress = budgetAmount > 0 ? (reportAmount / budgetAmount) * 100 : 0;
    const settlementProgress = settlementBudgetAmount > 0 ? (settlementAmount / settlementBudgetAmount) * 100 : 0;
    const normalRows = analysisStats.rows.filter(row => !row.isAddon);
    const addonRows = analysisStats.rows.filter(row => row.isAddon);
    const overSettledItems = normalRows.filter(row => row.budgetQty > 0 && row.totalSettledQty > row.budgetQty).length;
    const amountInvertedItems = normalRows.filter(row => row.settlementAmount > row.reportAmount).length;
    const possibleMissedReportItems = normalRows.filter(row => {
      const settleProgress = row.budgetQty > 0 ? row.totalSettledQty / row.budgetQty : 0;
      const reportRemainingRate = row.budgetQty > 0 ? row.reportRemainingQty / row.budgetQty : 0;
      return settleProgress >= 0.8 && reportRemainingRate >= 0.2;
    }).length;

    return {
      budgetAmount,
      settlementBudgetAmount,
      reportAmount,
      settlementAmount,
      reportRemainingAmount,
      settlementRemainingAmount,
      amountGap: reportAmount - settlementAmount,
      reportProgress,
      settlementProgress,
      riskCount: analysisStats.riskCount,
      overSettledItems,
      amountInvertedItems,
      possibleMissedReportItems,
      addonAmount: addonRows.reduce((sum, row) => sum + row.settlementAmount, 0),
      addonItems: addonRows.length,
    };
  }, [analysisStats, projectStats.totalBudget, subitems]);

  const projectDashboardRows = useMemo<ProjectDashboardRow[]>(() => {
    return projects.map(project => {
      const items = allSubitems.filter(item => item.project_id === project.id);
      const summary = items.reduce((acc, item) => {
        const budgetQty = toNumber(item.budget_quantity);
        const reportedQty = toNumber(item.completed_quantity);
        const settledQty = toNumber(item.settlement_quantity);
        const contractPrice = toNumber(item.contract_price);
        const settlementPrice = effectiveSettlementPrice({ limitPrice: item.limit_price, contractPrice: item.contract_price });

        acc.budgetAmount += budgetQty * contractPrice;
        acc.reportAmount += reportedQty * contractPrice;
        acc.settlementBudgetAmount += budgetQty * settlementPrice;
        acc.settlementAmount += settledQty * settlementPrice;
        return acc;
      }, {
        budgetAmount: 0,
        reportAmount: 0,
        settlementBudgetAmount: 0,
        settlementAmount: 0,
      });

      const reportRemainingAmount = summary.budgetAmount - summary.reportAmount;
      const settlementRemainingAmount = summary.settlementBudgetAmount - summary.settlementAmount;
      const reportProgress = summary.budgetAmount > 0 ? (summary.reportAmount / summary.budgetAmount) * 100 : 0;
      const settlementProgress = summary.settlementBudgetAmount > 0 ? (summary.settlementAmount / summary.settlementBudgetAmount) * 100 : 0;
      const amountGap = summary.reportAmount - summary.settlementAmount;
      const quantityGap = reportProgress - settlementProgress;

      let status: DashboardStatus = '正常';
      let warning = '对上报量与对下结算节奏基本匹配。';
      if (settlementProgress >= 100 && reportProgress < 95) {
        status = '重点关注';
        warning = '对下结算已接近或超过预算，对上报量仍未跟上，建议逐项核查。';
      } else if (settlementProgress - reportProgress >= 10 || summary.settlementAmount > summary.reportAmount) {
        status = '对下偏快';
        warning = '对下结算进度高于对上报量，需关注少报多结风险。';
      } else if (reportProgress < 50 && settlementProgress < 50 && items.length > 0) {
        status = '对上偏慢';
        warning = '累计报量比例偏低，建议推动当月完成量确认。';
      }

      return {
        project,
        itemCount: items.length,
        budgetAmount: summary.budgetAmount,
        reportAmount: summary.reportAmount,
        settlementBudgetAmount: summary.settlementBudgetAmount,
        settlementAmount: summary.settlementAmount,
        reportRemainingAmount,
        settlementRemainingAmount,
        reportProgress,
        settlementProgress,
        amountGap,
        quantityGap,
        status,
        warning,
      };
    }).sort((a, b) => {
      const priority: Record<DashboardStatus, number> = { '重点关注': 0, '对下偏快': 1, '对上偏慢': 2, '正常': 3 };
      return priority[a.status] - priority[b.status] || b.budgetAmount - a.budgetAmount;
    });
  }, [projects, allSubitems]);

  const filteredProjectDashboardRows = useMemo(() => {
    const keyword = dashboardKeyword.trim().toLowerCase();
    if (!keyword) return projectDashboardRows;
    return projectDashboardRows.filter(row => (
      row.project.name.toLowerCase().includes(keyword) ||
      row.project.status.toLowerCase().includes(keyword) ||
      row.status.toLowerCase().includes(keyword)
    ));
  }, [dashboardKeyword, projectDashboardRows]);

  const dashboardTotals = useMemo(() => {
    const budgetAmount = projectDashboardRows.reduce((sum, row) => sum + row.budgetAmount, 0);
    const reportAmount = projectDashboardRows.reduce((sum, row) => sum + row.reportAmount, 0);
    const settlementAmount = projectDashboardRows.reduce((sum, row) => sum + row.settlementAmount, 0);
    const riskCount = projectDashboardRows.filter(row => row.status !== '正常').length;
    return {
      budgetAmount,
      reportAmount,
      settlementAmount,
      amountGap: reportAmount - settlementAmount,
      riskCount,
    };
  }, [projectDashboardRows]);

  const entryWorkbenchRows = useMemo(() => {
    return analysisStats.rows
      .filter(row => {
        if (entryWorkbenchMode === 'additional') return row.isAddon;
        return !row.isAddon;
      })
      .sort((a, b) => {
        const aRisk = a.risks.length > 0 ? 0 : 1;
        const bRisk = b.risks.length > 0 ? 0 : 1;
        return aRisk - bRisk || Math.abs(b.amountGap) - Math.abs(a.amountGap);
      })
      .slice(0, 8)
      .map(row => {
        const cumulativeQty = entryWorkbenchMode === 'client' ? row.totalReportedQty : row.totalSettledQty;
        const remainingQty = row.isAddon
          ? 0
          : entryWorkbenchMode === 'client'
            ? row.reportRemainingQty
            : row.settleRemainingQty;
        const unitPrice = entryWorkbenchMode === 'client' ? row.contractPrice : row.limitPrice;
        const amount = entryWorkbenchMode === 'client' ? row.reportAmount : row.settlementAmount;

        return {
          ...row,
          cumulativeQty,
          remainingQty,
          unitPrice,
          amount,
          riskLabel: row.risks[0] || '正常',
        };
      });
  }, [analysisStats.rows, entryWorkbenchMode]);

  const entryWorkbenchSummary = useMemo(() => {
    const totalAmount = entryWorkbenchRows.reduce((sum, row) => sum + row.amount, 0);
    const riskCount = entryWorkbenchRows.filter(row => row.risks.length > 0).length;
    return {
      totalAmount,
      riskCount,
      rowCount: entryWorkbenchRows.length,
    };
  }, [entryWorkbenchRows]);

  const activeEntryMode = ENTRY_WORKBENCH_MODES.find(mode => mode.key === entryWorkbenchMode) || ENTRY_WORKBENCH_MODES[0];

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
          limit_price: form.limit_price || null,
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
      const colMap: Record<string, number> = {};
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

    if (!(await confirm({ title: '确定要删除该分项工程吗？', variant: 'destructive' }))) return;
    
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

    // 统一确认体系（原为旁路 AlertDialog + bg-red-600，改用 useConfirm）
    const confirmed = await confirm({
      title: '确认删除',
      description: `确定要删除选中的 ${selectedIds.size} 条记录吗？此操作不可恢复。`,
      variant: 'destructive',
    });
    if (!confirmed) return;
    try {
      const res = await fetch(`/api/work-item-subitems?ids=${Array.from(selectedIds).join(',')}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.ok) {
        const count = selectedIds.size;
        setSelectedIds(new Set());
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
      contract_price: '',
      limit_price: '',
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
        toast({ title: '修改成功', description: '预算工程量已更新', variant: 'success' });
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
      const [reportsRes, settlementsRes, addonSettlementsRes, progressExpectedRes] = await Promise.all([
        fetch(`/api/subitem-monthly-reports?project_id=${selectedProjectId}&year_month=${analysisYearMonth}`, { credentials: 'include' }),
        fetch(`/api/subitem-monthly-progress?project_id=${selectedProjectId}&year_month=${analysisYearMonth}`, { credentials: 'include' }),
        fetch(`/api/internal-addon-settlements?project_id=${selectedProjectId}&year_month=${analysisYearMonth}`, { credentials: 'include' }),
        fetch(`/api/quantity-reporting/progress-expected?project_id=${selectedProjectId}&year_month=${analysisYearMonth}`, { credentials: 'include' }),
      ]);
      const [reportsData, settlementsData, addonSettlementsData, progressExpectedData] = await Promise.all([
        reportsRes.json(),
        settlementsRes.json(),
        addonSettlementsRes.json(),
        progressExpectedRes.json(),
      ]);
      setAnalysisReports(reportsData.records || []);
      setAnalysisSettlements(settlementsData.records || []);
      setAnalysisAddonSettlements(addonSettlementsData.records || []);
      setAnalysisProgressExpected(progressExpectedData.records || []);
    } catch (error) {
      console.error('获取差异分析数据失败:', error);
      setAnalysisReports([]);
      setAnalysisSettlements([]);
      setAnalysisAddonSettlements([]);
      setAnalysisProgressExpected([]);
    } finally {
      setAnalysisLoading(false);
    }
  };

  // P0-1 获取勾稽台账数据（报量 vs 结算 分项级 + 回款项目级）
  const fetchReconciliation = async (ym?: string) => {
    if (!selectedProjectId) return;
    const target = ym || reconYearMonth;
    if (!target) return;

    setReconLoading(true);
    try {

      const res = await fetch(`/api/subitem-reconciliation?project_id=${selectedProjectId}&year_month=${target}`, { credentials: 'include' });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '查询失败');
      }
      setReconData({ rows: data.rows || [], summary: data.summary });
    } catch (error: any) {
      console.error('获取勾稽台账失败:', error);
      toast({ title: '获取勾稽数据失败', description: error.message || '网络错误，请重试', variant: 'error' });
    } finally {
      setReconLoading(false);
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
      const data = await fetch(`/api/subitem-monthly-reports?project_id=${selectedProjectId}&year_month=${yearMonth}`).then(res => res.json());
      
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
          db_report_quantity: record?.report_quantity || '0',
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



    // P0-1 超预算强制确认：累计报量将超出预算量时必须确认（不可绕过）
    const overBudgetItems = monthlyReportRecords
      .filter(r => recordsToSave.some(s => s.subitem_id === r.subitem_id))
      .map(r => {
        const budget = parseFloat(r.budget_quantity || '0') || 0;
        const oldMonth = parseFloat(r.db_report_quantity || '0') || 0;
        const newMonth = parseFloat(r.report_quantity || '0') || 0;
        const cumulative = parseFloat(r.total_reported || '0') || 0;
        const projected = cumulative - oldMonth + newMonth;
        return { subitem_name: r.subitem_name, budget, projected, over: budget > 0 && projected > budget };
      })
      .filter(x => x.over);

    if (overBudgetItems.length > 0) {
      const confirmed = await confirm({
        title: '累计报量将超出预算量',
        description: `以下 ${overBudgetItems.length} 个分项保存后累计报量将超过预算量：${overBudgetItems.slice(0, 5).map(x => `《${x.subitem_name}》预算 ${formatQuantity(x.budget)}，保存后 ${formatQuantity(x.projected)}`).join('；')}${overBudgetItems.length > 5 ? ` 等 ${overBudgetItems.length} 项` : ''}。是否继续保存？`,
        variant: 'destructive',
      });
      if (!confirmed) return;
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

    if (!(await confirm({
      title: '确定要删除这条报量记录吗？',
      description: '删除后将更新累计报量。',
      variant: 'destructive',
    }))) return;
    
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
      const [data, addonsData, addonRecordsData] = await Promise.all([
        fetch(`/api/subitem-monthly-progress?project_id=${selectedProjectId}&year_month=${yearMonth}`, { credentials: 'include' }).then(res => res.json()),
        fetch(`/api/project-internal-addons?project_id=${selectedProjectId}`, { credentials: 'include' }).then(res => res.json()),
        fetch(`/api/internal-addon-settlements?project_id=${selectedProjectId}&year_month=${yearMonth}`, { credentials: 'include' }).then(res => res.json()),
      ]);
      
      // 合并当前项目的所有子项与月度记录
      const projectSubitems = allSubitems.filter(s => s.project_id === parseInt(selectedProjectId));
      const recordsMap = new Map(data.records?.map((r: any) => [r.subitem_id, r]) || []);
      
      const mergedRecords = projectSubitems.map(subitem => {
        const record = recordsMap.get(subitem.id) as any;
        const totalSettlement = parseFloat(subitem.settlement_quantity || '0') || 0;
        const limitPrice = subitem.limit_price ? String(subitem.limit_price) : '';
        return {
          subitem_id: subitem.id,
          subitem_name: subitem.subitem_name,
          unit: subitem.unit,
          budget_quantity: subitem.budget_quantity,
          contract_price: subitem.contract_price ? String(subitem.contract_price) : '',
          limit_price: limitPrice,
          // P0-2：结算单价默认带出限价，无限价退回合同价（三层价格同屏 + 超限校验）
          unit_price: record?.unit_price != null && record?.unit_price !== ''
            ? String(record.unit_price)
            : (limitPrice || (subitem.contract_price ? String(subitem.contract_price) : '')),
          over_limit_reason: record?.over_limit_reason || '',
          settlement_quantity: record?.completed_quantity || '0',
          db_settlement_quantity: record?.completed_quantity || '0',
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

  // P0-2：结算单价变化（实时超限标红由渲染层校验）
  const handleMonthlySettlementUnitPriceChange = (subitemId: number, value: string) => {
    setMonthlySettlementRecords(prev => prev.map(r =>
      r.subitem_id === subitemId ? { ...r, unit_price: value } : r
    ));
  };

  // P0-2：超限原因输入
  const handleMonthlySettlementOverReasonChange = (subitemId: number, value: string) => {
    setMonthlySettlementRecords(prev => prev.map(r =>
      r.subitem_id === subitemId ? { ...r, over_limit_reason: value } : r
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
        // P0-2：提交结算单价与超限原因（服务端二次校验）
        unit_price: r.unit_price || null,
        over_limit_reason: r.over_limit_reason || '',
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

    // P0-1 差异提示（非阻塞）：本月结算 vs 本月报量 差异 > 30%（可能少结/多报）
    try {
      const monthReports = (await fetch(`/api/subitem-monthly-reports?project_id=${selectedProjectId}&year_month=${settlementYearMonth}`, { credentials: 'include' }).then(res => res.json())).records || [];
      const reportMap = new Map<number, number>(
        monthReports.map((rec: any) => [rec.subitem_id, parseFloat(rec.report_quantity) || 0] as [number, number])
      );
      const diffWarnings = recordsToSave
        .map(s => ({
          name: monthlySettlementRecords.find(r => r.subitem_id === s.subitem_id)?.subitem_name || `分项#${s.subitem_id}`,
          report: reportMap.get(s.subitem_id) || 0,
          settle: parseFloat(String(s.completed_quantity)) || 0,
        }))
        .filter(x => x.report > 0 && Math.abs(x.settle - x.report) / x.report > 0.3)
        .map(x => `《${x.name}》报 ${formatQuantity(x.report)} vs 结 ${formatQuantity(x.settle)}`);
      if (diffWarnings.length > 0) {
        toast({
          title: '结算与报量差异较大',
          description: `本月以下分项结算与报量差异超 30%，请核查是否少结/多报：${diffWarnings.slice(0, 3).join('；')}${diffWarnings.length > 3 ? ` 等 ${diffWarnings.length} 项` : ''}`,
          variant: 'warning',
        });
      }
    } catch (error) {
      // 差异提示失败不阻塞保存
    }



    // P0-1 超预算强制确认：累计结算将超出预算量时必须确认
    const overBudgetItems = monthlySettlementRecords
      .filter(r => recordsToSave.some(s => s.subitem_id === r.subitem_id))
      .map(r => {
        const budget = parseFloat(r.budget_quantity || '0') || 0;
        const oldMonth = parseFloat(r.db_settlement_quantity || '0') || 0;
        const newMonth = parseFloat(r.settlement_quantity || '0') || 0;
        const cumulative = parseFloat(r.total_settlement || '0') || 0;
        const projected = cumulative - oldMonth + newMonth;
        return { subitem_name: r.subitem_name, budget, projected, over: budget > 0 && projected > budget };
      })
      .filter(x => x.over);

    if (overBudgetItems.length > 0) {
      const confirmed = await confirm({
        title: '累计结算将超出预算量',
        description: `以下 ${overBudgetItems.length} 个分项保存后累计结算量将超过预算量：${overBudgetItems.slice(0, 5).map(x => `《${x.subitem_name}》预算 ${formatQuantity(x.budget)}，保存后 ${formatQuantity(x.projected)}`).join('；')}${overBudgetItems.length > 5 ? ` 等 ${overBudgetItems.length} 项` : ''}。是否继续保存？`,
        variant: 'destructive',
      });
      if (!confirmed) return;
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

    if (!(await confirm({
      title: '确定要删除这条结算记录吗？',
      description: '删除后将更新累计结算量。',
      variant: 'destructive',
    }))) return;
    
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
    if (reportHistoryEditRecord.id < 0 || (reportHistoryItem?.id ?? 0) < 0) {
      toast({ title: '演示项目', description: '当前为演示数据，历史记录修改不会写入数据库。', variant: 'warning' });
      return;
    }
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
        if (reportHistoryItem?.id !== undefined) fetchReportHistory(reportHistoryItem.id);
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
    if (recordId < 0 || (reportHistoryItem?.id ?? 0) < 0) {
      toast({ title: '演示项目', description: '当前为演示数据，历史记录删除不会写入数据库。', variant: 'warning' });
      return;
    }
    if (!(await confirm({
      title: '确定要删除这条报量记录吗？',
      description: '删除后将更新累计报量。',
      variant: 'destructive',
    }))) return;
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
    if (settleHistoryEditRecord.id < 0 || (settleHistoryItem?.id ?? 0) < 0) {
      toast({ title: '演示项目', description: '当前为演示数据，历史记录修改不会写入数据库。', variant: 'warning' });
      return;
    }
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
        if (settleHistoryItem?.id !== undefined) fetchSettleHistory(settleHistoryItem.id);
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
    if (recordId < 0 || (settleHistoryItem?.id ?? 0) < 0) {
      toast({ title: '演示项目', description: '当前为演示数据，历史记录删除不会写入数据库。', variant: 'warning' });
      return;
    }
    if (!(await confirm({
      title: '确定要删除这条结算记录吗？',
      description: '删除后将更新累计结算量。',
      variant: 'destructive',
    }))) return;
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

  const formatQuantity = (value: number) => {
    return value.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  };

  const formatPercent = (value: number) => {
    if (!Number.isFinite(value)) return '0%';
    return `${value.toFixed(1)}%`;
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case '在建': return 'bg-[var(--color-primary)] text-white';
      case '竣工结算': return 'bg-emerald-500 text-white';
      case '质保期': return 'bg-purple-500 text-white';
      case '质保期满': return 'bg-amber-500 text-white';
      case '进行中': return 'bg-[var(--color-primary)] text-white';
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

  // 进度颜色语义修复：进度高是好事（绿/蓝），红色仅用于真正风险（如超预算）
  const getProgressColor = (percent: number) => {
    if (percent >= 100) return 'bg-green-500';
    if (percent >= 80) return 'bg-green-500';
    if (percent >= 50) return 'bg-blue-500';
    return 'bg-yellow-500';
  };

  // P0-2 限价控制：前端实时超限判断（内联实现，避免 client 引入 server 依赖）
  const isUnitPriceOverLimit = (record: any): boolean => {
    const limit = parseFloat(record.limit_price);
    const unit = parseFloat(record.unit_price);
    if (!limit || !unit || isNaN(limit) || isNaN(unit)) return false;
    return unit > limit;
  };
  const getUnitPriceOverRatio = (record: any): string => {
    const limit = parseFloat(record.limit_price);
    const unit = parseFloat(record.unit_price);
    if (!limit || isNaN(limit) || !unit || isNaN(unit)) return '0.0';
    return ((unit - limit) / limit * 100).toFixed(1);
  };

  const getDashboardStatusClass = (status: DashboardStatus) => {
    if (status === '重点关注') return 'bg-rose-50 text-rose-700 ring-rose-100';
    if (status === '对下偏快') return 'bg-amber-50 text-amber-700 ring-amber-100';
    if (status === '对上偏慢') return 'bg-sky-50 text-sky-700 ring-sky-100';
    return 'bg-emerald-50 text-emerald-700 ring-emerald-100';
  };

  const getGapTextClass = (value: number) => {
    if (value < 0) return 'text-rose-700';
    if (value > 0) return 'text-emerald-700';
    return 'text-gray-700';
  };

  const selectedProject = useMemo(
    () => projects.find(p => p.id.toString() === selectedProjectId),
    [projects, selectedProjectId]
  );

  // ========== 对比版工作台（重构）==========
  const [ledgerOnlyRisk, setLedgerOnlyRisk] = useState(false);
  const [expandedRowKey, setExpandedRowKey] = useState<string | null>(null);
  const [rowDetailLoading, setRowDetailLoading] = useState(false);
  const [rowDetail, setRowDetail] = useState<{ reports: any[]; settlements: any[] } | null>(null);
  const [detailTab, setDetailTab] = useState<'reports' | 'settlements' | 'addons'>('reports');
  const [ledgerReportRecords, setLedgerReportRecords] = useState<any[]>([]);
  const [ledgerSettlementRecords, setLedgerSettlementRecords] = useState<any[]>([]);
  const [ledgerRecordsLoading, setLedgerRecordsLoading] = useState(false);

  // 对比台账行：analysisStats.rows 已合并预算分项与内部附加清单（isAddon 区分）
  const comparisonRows = useMemo(() => {
    const kw = searchKeyword.trim().toLowerCase();
    const match = (name: string) => !kw || (name || '').toLowerCase().includes(kw);
    let all = analysisStats.rows
      .filter(r => match(r.subitem_name))
      .map(r => ({ ...r, rowKey: String(r.id) }));
    if (ledgerOnlyRisk) {
      all = all.filter(r =>
        (r.risks || []).length > 0 ||
        (!r.isAddon && r.budgetQty > 0 && r.totalReportedQty > r.budgetQty)
      );
    }
    return all;
  }, [analysisStats, searchKeyword, ledgerOnlyRisk]);

  // 对比总览（对上vs对下 / 预算vs实际）
  // 口径：对上=预算分项报量金额；对下=分项结算金额+内部附加成本（rows 已含附加行，不重复累加 addonStats）
  const compareOverview = useMemo(() => {
    const rows = analysisStats.rows;
    const budgetRows = rows.filter(r => !r.isAddon);
    const reportAmount = budgetRows.reduce((s, r) => s + r.reportAmount, 0);
    const settlementAmount = rows.reduce((s, r) => s + r.settlementAmount, 0);
    const budgetAmount = budgetRows.reduce((s, r) => s + r.budgetQty * r.contractPrice, 0);
    const overBudgetCount = budgetRows.filter(r => r.budgetQty > 0 && r.totalReportedQty > r.budgetQty).length;
    const nearBudgetCount = budgetRows.filter(r => r.budgetQty > 0 && r.totalReportedQty <= r.budgetQty && r.totalReportedQty / r.budgetQty >= 0.9).length;
    return {
      reportAmount,
      settlementAmount,
      gap: reportAmount - settlementAmount,
      budgetAmount,
      rate: budgetAmount > 0 ? reportAmount / budgetAmount : 0,
      overBudgetCount,
      nearBudgetCount,
      normalCount: Math.max(0, budgetRows.length - overBudgetCount - nearBudgetCount),
    };
  }, [analysisStats.rows]);

  // 台账行展开下钻：加载该分项的报量/结算明细
  const toggleRowDetail = async (row: any) => {
    const key = row.rowKey as string;
    if (expandedRowKey === key) {
      setExpandedRowKey(null);
      setRowDetail(null);
      return;
    }
    setExpandedRowKey(key);
    if (row.isAddon) {
      setRowDetail({ reports: [], settlements: [] });
      return;
    }
    setRowDetailLoading(true);
    setRowDetail(null);
    try {
        const [reportRes, settleRes] = await Promise.all([
          fetch(`/api/subitem-monthly-reports?subitem_id=${row.id}`, { credentials: 'include' }).then(r => r.json()),
          fetch(`/api/subitem-monthly-progress?subitem_id=${row.id}&project_id=${selectedProjectId}`, { credentials: 'include' }).then(r => r.json()),
        ]);
        setRowDetail({
          reports: reportRes.records || [],
          settlements: settleRes.data || settleRes.records || [],
        });
    } catch (error) {
      console.error('加载分项明细失败:', error);
      setRowDetail({ reports: [], settlements: [] });
    } finally {
      setRowDetailLoading(false);
    }
  };

  // 明细记录 Tab：按当前月份加载项目级报量/结算流水
  const fetchLedgerRecords = async (ym: string) => {
    if (!selectedProjectId || !ym) return;
    setLedgerRecordsLoading(true);
    try {
        const [reportRes, settleRes] = await Promise.all([
          fetch(`/api/subitem-monthly-reports?project_id=${selectedProjectId}&year_month=${ym}`, { credentials: 'include' }).then(r => r.json()),
          fetch(`/api/subitem-monthly-progress?project_id=${selectedProjectId}&year_month=${ym}`, { credentials: 'include' }).then(r => r.json()),
        ]);
        setLedgerReportRecords(reportRes.records || []);
        setLedgerSettlementRecords(settleRes.data || settleRes.records || []);
    } catch (error) {
      console.error('加载明细记录失败:', error);
      setLedgerReportRecords([]);
      setLedgerSettlementRecords([]);
    } finally {
      setLedgerRecordsLoading(false);
    }
  };

  useEffect(() => {
    if (quantityView === 'entry' && selectedProjectId && analysisYearMonth) {
      fetchLedgerRecords(analysisYearMonth);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quantityView, selectedProjectId, analysisYearMonth]);

  // 台账行状态徽标
  const getRowStatusBadge = (row: any) => {
    if (row.isAddon) {
      return <Badge variant="outline" className="border-slate-300 text-slate-500">附加项</Badge>;
    }
    const risk = (row.risks || [])[0] as string | undefined;
    if (!risk) {
      if (row.budgetQty > 0 && row.totalReportedQty > row.budgetQty) {
        return <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">已超预算</Badge>;
      }
      if (row.budgetQty > 0 && row.totalReportedQty / row.budgetQty >= 0.9) {
        return <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">接近预算</Badge>;
      }
      return <span className="text-xs text-slate-400">正常</span>;
    }
    const dangerRisks = ['多结少报', '对下超结', '资金/利润风险', '进度超报'];
    const isDanger = dangerRisks.includes(risk);
    return (
      <Badge
        variant="outline"
        className={isDanger
          ? 'border-red-200 bg-red-50 text-red-700'
          : 'border-amber-200 bg-amber-50 text-amber-700'}
      >
        {risk}
      </Badge>
    );
  };

  const subitemNameOf = (subitemId: number) =>
    allSubitems.find(s => s.id === subitemId)?.subitem_name || `分项 #${subitemId}`;
  const subitemUnitOf = (subitemId: number) =>
    allSubitems.find(s => s.id === subitemId)?.unit || '';

  if (loading) {
    return (
      <div className="min-h-screen space-y-4 sm:space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div><Skeleton className="w-48 h-7 mb-1" /><Skeleton className="w-64 h-4" /></div>
          <Skeleton className="w-40 h-9 rounded-lg" />
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5 md:gap-4">
          {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
        <Skeleton className="h-10 rounded-lg w-64" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="min-h-screen space-y-4 sm:space-y-6">
      {/* 顶部区域 */}
      <div className={`flex flex-col gap-3 transition-all duration-500 sm:flex-row sm:items-center sm:justify-between ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-gray-900">
            {quantityView === 'summary' ? '项目汇总对比' : '报量管理 · 对上对下对比'}
          </h1>
          <p className="text-gray-500 mt-1 text-sm">
            {quantityView === 'summary'
              ? '先按项目查看对上、对下和剩余差异，再进入单个项目录入。'
              : '对上对下差额、预算执行总览，录入入口已收拢到工具栏。'}
          </p>
        </div>
        <Button variant="outline" onClick={fetchData} className="w-full gap-2 sm:w-auto">
          <RefreshCw className="w-4 h-4" />
          刷新
        </Button>
      </div>



      {/* 总览统计卡片 */}
      {quantityView === 'summary' && (
        <>
      <div className={`grid grid-cols-2 gap-3 transition-all duration-500 delay-100 lg:grid-cols-4 lg:gap-4 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
        <Card className="group border-[var(--color-primary)]/20 bg-white transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-[#165DFF]/10">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[var(--color-primary)] flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                <Layers className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-gray-500">预算工程量金额</p>
                <AnimatedNumber value={dashboardTotals.budgetAmount} format={formatCurrency} className="text-lg font-bold text-[var(--color-primary)]" />
                <p className="mt-0.5 text-xs text-gray-400">{overallStats.totalSubitems} 个清单项</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="group border-cyan-200/70 bg-white transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-cyan-500/10">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-cyan-600 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                <ArrowUpRight className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-gray-500">累计对上报量</p>
                <AnimatedNumber value={dashboardTotals.reportAmount} format={formatCurrency} className="text-lg font-bold text-cyan-700" />
                <p className="mt-0.5 text-xs text-gray-400">已向甲方报量</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="group border-amber-200/70 bg-white transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-amber-500/10">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-500 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                <ArrowDownRight className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-gray-500">累计对下结算</p>
                <AnimatedNumber value={dashboardTotals.settlementAmount} format={formatCurrency} className="text-lg font-bold text-amber-700" />
                <p className={`mt-0.5 text-xs font-medium ${getGapTextClass(dashboardTotals.amountGap)}`}>对上 - 对下：{formatCurrency(dashboardTotals.amountGap)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="group border-rose-200/70 bg-white transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-rose-500/10">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-rose-500 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                <ShieldAlert className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-gray-500">需关注项目</p>
                <AnimatedNumber value={dashboardTotals.riskCount} className="text-xl font-bold text-rose-700" />
                <p className="mt-0.5 text-xs text-gray-400">共 {overallStats.totalProjects} 个项目</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 项目台账 */}
      <section className={`overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition-all duration-500 delay-125 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
        <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="font-semibold text-slate-950">项目台账</h2>
            <p className="mt-0.5 text-xs text-slate-500">按项目先判断差异，再进入录入，不把工作台堆在首页。</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="搜索项目或状态"
                value={dashboardKeyword}
                onChange={(e) => setDashboardKeyword(e.target.value)}
                className="h-9 pl-9"
              />
            </div>
            <Button variant="outline" size="sm" className="h-9 gap-2">
              <FileText className="h-4 w-4" />
              历史报量
            </Button>
          </div>
        </div>

        <div className="hidden overflow-x-auto lg:block">
          <Table className="min-w-[1120px]">
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead className="px-4 py-3">项目名称</TableHead>
                <TableHead className="px-3 py-3">年度 / 清单项</TableHead>
                <TableHead className="px-3 py-3">状态</TableHead>
                <TableHead className="px-3 py-3">对上进度</TableHead>
                <TableHead className="px-3 py-3">对下进度</TableHead>
                <TableHead className="px-3 py-3 text-right">对上剩余</TableHead>
                <TableHead className="px-3 py-3 text-right">对下剩余</TableHead>
                <TableHead className="px-3 py-3 text-right">差额</TableHead>
                <TableHead className="px-4 py-3">风险提示</TableHead>
                <TableHead className="px-4 py-3 text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProjectDashboardRows.length > 0 ? filteredProjectDashboardRows.map(row => (
                <TableRow key={row.project.id} className="hover:bg-slate-50">
                  <TableCell className="px-4 py-4">
                    <div className="font-medium text-slate-950">{row.project.name}</div>
                    <div className="mt-0.5 text-xs text-slate-500">合同额 {formatCurrency(toNumber(row.project.contract_amount))}</div>
                  </TableCell>
                  <TableCell className="px-3 py-4 text-slate-600">
                    {row.project.year} 年 / {row.itemCount} 项
                  </TableCell>
                  <TableCell className="px-3 py-4">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${getDashboardStatusClass(row.status)}`}>
                      {row.status}
                    </span>
                  </TableCell>
                  <TableCell className="px-3 py-4">
                    <div className="flex min-w-[130px] items-center gap-2">
                      <div className="h-2 flex-1 rounded-full bg-slate-100">
                        <div className="h-2 rounded-full bg-[var(--color-primary)]" style={{ width: `${clampProgress(row.reportProgress)}%` }} />
                      </div>
                      <span className="w-12 text-right text-xs text-slate-500">{formatPercent(row.reportProgress)}</span>
                    </div>
                  </TableCell>
                  <TableCell className="px-3 py-4">
                    <div className="flex min-w-[130px] items-center gap-2">
                      <div className="h-2 flex-1 rounded-full bg-slate-100">
                        <div className={`h-2 rounded-full ${row.settlementProgress > row.reportProgress ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${clampProgress(row.settlementProgress)}%` }} />
                      </div>
                      <span className="w-12 text-right text-xs text-slate-500">{formatPercent(row.settlementProgress)}</span>
                    </div>
                  </TableCell>
                  <TableCell className="px-3 py-4 text-right text-slate-700">{formatCurrency(row.reportRemainingAmount)}</TableCell>
                  <TableCell className="px-3 py-4 text-right text-slate-700">{formatCurrency(row.settlementRemainingAmount)}</TableCell>
                  <TableCell className={`px-3 py-4 text-right font-semibold ${getGapTextClass(row.amountGap)}`}>
                    {formatCurrency(row.amountGap)}
                  </TableCell>
                  <TableCell className="max-w-[260px] px-4 py-4 text-sm leading-5 text-slate-600">
                    <div className="flex items-start gap-2">
                      {row.status === '正常' ? <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />}
                      <span>{row.warning}</span>
                    </div>
                  </TableCell>
                  <TableCell className="px-4 py-4 text-right">
                    <Button
                      size="sm"
                      onClick={() => {
                        setSelectedProjectId(row.project.id.toString());
                        setQuantityView('entry');
                        setEntryPanel('monthly');
                      }}
                      className="h-9 gap-2 bg-slate-950 hover:bg-slate-800"
                    >
                      进入录入
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              )) : (
                <TableRow>
                  <TableCell colSpan={10} className="py-12 text-center text-slate-500">暂无匹配项目</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <div className="space-y-3 p-3 lg:hidden">
          {filteredProjectDashboardRows.length > 0 ? filteredProjectDashboardRows.map(row => (
            <div key={row.project.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-950">{row.project.name}</p>
                  <p className="mt-1 text-xs text-slate-500">{row.project.year} 年 / {row.itemCount} 项 · 合同额 {formatCurrency(toNumber(row.project.contract_amount))}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${getDashboardStatusClass(row.status)}`}>
                  {row.status}
                </span>
              </div>
              <div className="mt-4 space-y-2">
                <div>
                  <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
                    <span>对上进度</span>
                    <span>{formatPercent(row.reportProgress)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100">
                    <div className="h-2 rounded-full bg-[var(--color-primary)]" style={{ width: `${clampProgress(row.reportProgress)}%` }} />
                  </div>
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
                    <span>对下进度</span>
                    <span>{formatPercent(row.settlementProgress)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100">
                    <div className={`h-2 rounded-full ${row.settlementProgress > row.reportProgress ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${clampProgress(row.settlementProgress)}%` }} />
                  </div>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                <div className="rounded-md bg-slate-50 p-2">
                  <p className="text-slate-500">对上剩余</p>
                  <p className="mt-1 font-semibold text-slate-950">{formatCurrency(row.reportRemainingAmount)}</p>
                </div>
                <div className="rounded-md bg-slate-50 p-2">
                  <p className="text-slate-500">对下剩余</p>
                  <p className="mt-1 font-semibold text-slate-950">{formatCurrency(row.settlementRemainingAmount)}</p>
                </div>
                <div className="rounded-md bg-slate-50 p-2">
                  <p className="text-slate-500">差额</p>
                  <p className={`mt-1 font-semibold ${getGapTextClass(row.amountGap)}`}>{formatCurrency(row.amountGap)}</p>
                </div>
              </div>
              <div className="mt-3 flex items-start gap-2 rounded-md bg-slate-50 p-2 text-xs leading-5 text-slate-600">
                {row.status === '正常' ? <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />}
                <span>{row.warning}</span>
              </div>
              <Button
                onClick={() => {
                  setSelectedProjectId(row.project.id.toString());
                  setQuantityView('entry');
                  setEntryPanel('monthly');
                }}
                className="mt-3 h-9 w-full gap-2 bg-slate-950 hover:bg-slate-800"
              >
                进入录入
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          )) : (
            <div className="py-12 text-center text-sm text-slate-500">暂无匹配项目</div>
          )}
        </div>
      </section>

      {/* 项目选择器 */}
        </>
      )}

      {quantityView === 'entry' && (
        <>
          {/* 工具栏：项目/月份上下文 + 录入入口 */}
          <div className={`transition-all duration-500 delay-150 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
            <Card className="border-[var(--color-primary)]/20 shadow-card">
              <CardContent className="space-y-4 py-4">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                  <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setQuantityView('summary')}
                      className="w-full gap-2 sm:w-auto"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      返回项目汇总
                    </Button>
                    <div className="flex items-center gap-2">
                      <Building2 className="h-5 w-5 shrink-0 text-[#1A58B3]" />
                      <Select
                        value={selectedProjectId}
                        onValueChange={(value) => {
                          setSelectedProjectId(value);
                          setExpandedRowKey(null);
                          setRowDetail(null);
                        }}
                      >
                        <SelectTrigger className="w-full sm:w-64">
                          <SelectValue placeholder="请选择项目" />
                        </SelectTrigger>
                        <SelectContent>
                          {projects.map((project) => (
                            <SelectItem key={project.id} value={project.id.toString()}>
                              <div className="flex items-center gap-2">
                                <span>{project.name}</span>
                                <span className={`rounded px-1.5 py-0.5 text-xs ${getStatusStyle(project.status)}`}>
                                  {project.status}
                                </span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 shrink-0 text-gray-400" />
                      <Select value={analysisYearMonth} onValueChange={setAnalysisYearMonth}>
                        <SelectTrigger className="w-32">
                          <SelectValue placeholder="选择月份" />
                        </SelectTrigger>
                        <SelectContent>
                          {getMonthsList().map((m) => (
                            <SelectItem key={m} value={m}>{m}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {selectedProject && (
                      <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500 sm:gap-3">
                        <span>{selectedProject.year}年度</span>
                        <span>·</span>
                        <span>{subitems.length} 个分项工程</span>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      onClick={openMonthlyReportDialog}
                      className="gap-1.5 bg-[var(--color-primary)] text-white hover:bg-[#0E42A8]"
                    >
                      <Plus className="h-4 w-4" />
                      录入对上报量
                    </Button>
                    <Button
                      variant="outline"
                      onClick={openMonthlySettlementDialog}
                      className="gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-50"
                    >
                      <Plus className="h-4 w-4" />
                      录入对下结算
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => openProjectAddonDialog()}
                      className="gap-1.5"
                    >
                      <Layers className="h-4 w-4" />
                      维护附加清单
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setBatchDialogOpen(true)}
                      className="gap-1.5"
                    >
                      <Upload className="h-4 w-4" />
                      批量导入
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {!selectedProjectId ? (
            <Card className="shadow-card">
              <CardContent className="py-16 text-center text-gray-400">
                请选择项目查看对上对下对比与预算执行情况
              </CardContent>
            </Card>
          ) : (
            <>
              {/* 对比总览 */}
              <div className={`grid gap-4 transition-all duration-500 delay-200 lg:grid-cols-2 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
                <Card className="shadow-card">
                  <CardContent className="p-5">
                    <div className="flex items-center gap-2 text-sm font-medium text-gray-500">
                      <Scale className="h-4 w-4 text-[var(--color-primary)]" />
                      对上 vs 对下（累计金额）
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-4">
                      <div>
                        <div className="flex items-center gap-1 text-xs text-gray-400">
                          <ArrowUpRight className="h-3.5 w-3.5 text-[var(--color-primary)]" />
                          累计对上报量
                        </div>
                        <div className="mt-1 text-2xl font-bold text-[var(--color-primary)]">
                          {formatCurrency(compareOverview.reportAmount)}
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center gap-1 text-xs text-gray-400">
                          <ArrowDownRight className="h-3.5 w-3.5 text-amber-600" />
                          累计对下结算
                        </div>
                        <div className="mt-1 text-2xl font-bold text-amber-600">
                          {formatCurrency(compareOverview.settlementAmount)}
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                      {(() => {
                        const total = Math.max(compareOverview.reportAmount, compareOverview.settlementAmount, 1);
                        return (
                          <>
                            <div className="bg-[var(--color-primary)]" style={{ width: `${(compareOverview.reportAmount / total) * 100}%` }} />
                            <div className="ml-0.5 bg-amber-500" style={{ width: `${(compareOverview.settlementAmount / total) * 100}%` }} />
                          </>
                        );
                      })()}
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-sm text-gray-500">对上 − 对下差额</span>
                      <span className={`text-xl font-bold ${compareOverview.gap >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {compareOverview.gap >= 0 ? '+' : ''}{formatCurrency(compareOverview.gap)}
                      </span>
                    </div>
                  </CardContent>
                </Card>
                <Card className="shadow-card">
                  <CardContent className="p-5">
                    <div className="flex items-center gap-2 text-sm font-medium text-gray-500">
                      <Target className="h-4 w-4 text-[var(--color-primary)]" />
                      预算 vs 实际（按对上口径）
                    </div>
                    <div className="mt-4 flex items-end justify-between">
                      <div>
                        <div className="text-xs text-gray-400">预算工程量金额</div>
                        <div className="mt-1 text-2xl font-bold text-gray-800">
                          {formatCurrency(compareOverview.budgetAmount)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-gray-400">预算完成率</div>
                        <div className={`mt-1 text-2xl font-bold ${compareOverview.rate >= 1 ? 'text-red-600' : 'text-[var(--color-primary)]'}`}>
                          {(compareOverview.rate * 100).toFixed(1)}%
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full ${compareOverview.rate >= 1 ? 'bg-red-500' : compareOverview.rate >= 0.9 ? 'bg-amber-500' : 'bg-[var(--color-primary)]'}`}
                        style={{ width: `${Math.min(100, compareOverview.rate * 100)}%` }}
                      />
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-4 text-xs">
                      <span className="text-emerald-600">正常 {compareOverview.normalCount} 项</span>
                      <span className="text-amber-600">接近预算（≥90%）{compareOverview.nearBudgetCount} 项</span>
                      <span className="text-red-600">已超预算 {compareOverview.overBudgetCount} 项</span>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* 对比台账 */}
              <Card className={`shadow-card transition-all duration-500 delay-300 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
                <CardContent className="p-0">
                  <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="font-semibold text-gray-900">清单项对比台账</h3>
                      <p className="mt-0.5 text-xs text-gray-400">点击行可展开该分项的对上/对下原始明细</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                        <Input
                          value={searchKeyword}
                          onChange={(e) => setSearchKeyword(e.target.value)}
                          placeholder="搜索分项名称"
                          className="h-9 w-44 pl-8 text-sm"
                        />
                      </div>
                      <div className="grid grid-cols-2 rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs">
                        <button
                          type="button"
                          onClick={() => setLedgerOnlyRisk(false)}
                          className={`h-8 rounded-md px-3 font-medium transition ${!ledgerOnlyRisk ? 'bg-white text-[#1A58B3] shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
                        >
                          全部
                        </button>
                        <button
                          type="button"
                          onClick={() => setLedgerOnlyRisk(true)}
                          className={`h-8 rounded-md px-3 font-medium transition ${ledgerOnlyRisk ? 'bg-white text-[#1A58B3] shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
                        >
                          仅看异常
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <Table className="min-w-[1080px]">
                      <TableHeader>
                        <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                          <TableHead>清单项</TableHead>
                          <TableHead className="w-16">单位</TableHead>
                          <TableHead className="text-right">预算量</TableHead>
                          <TableHead className="text-right">对上报量</TableHead>
                          <TableHead className="text-right">对下结算</TableHead>
                          <TableHead className="text-right">对上−对下</TableHead>
                          <TableHead className="w-40">预算完成度</TableHead>
                          <TableHead className="w-28">状态</TableHead>
                          <TableHead className="w-28 text-center">操作</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {comparisonRows.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={9} className="py-12 text-center text-gray-400">
                              {subitems.length === 0 ? '当前项目暂无预算清单，请先在工程量统计中维护' : '没有匹配的分项'}
                            </TableCell>
                          </TableRow>
                        ) : (
                          comparisonRows.map((row) => {
                            const isExpanded = expandedRowKey === row.rowKey;
                            const rate = !row.isAddon && row.budgetQty > 0 ? row.totalReportedQty / row.budgetQty : null;
                            return (
                              <Fragment key={row.rowKey}>
                                <TableRow
                                  className={`cursor-pointer hover:bg-slate-50 ${isExpanded ? 'bg-slate-50/70' : ''}`}
                                  onClick={() => toggleRowDetail(row)}
                                >
                                  <TableCell>
                                    <div className="font-medium text-gray-800">{row.subitem_name}</div>
                                    {row.isAddon && <span className="text-xs text-slate-400">内部附加清单</span>}
                                  </TableCell>
                                  <TableCell className="text-gray-500">{row.unit || '-'}</TableCell>
                                  <TableCell className="text-right whitespace-nowrap">
                                    {row.isAddon ? <span className="text-slate-300">—</span> : formatQuantity(row.budgetQty)}
                                  </TableCell>
                                  <TableCell className="text-right font-medium whitespace-nowrap text-[var(--color-primary)]">
                                    {formatQuantity(row.totalReportedQty)}
                                  </TableCell>
                                  <TableCell className="text-right font-medium whitespace-nowrap text-amber-700">
                                    {formatQuantity(row.totalSettledQty)}
                                  </TableCell>
                                  <TableCell className="text-right whitespace-nowrap">
                                    {row.isAddon ? (
                                      <span className="text-slate-300">—</span>
                                    ) : row.quantityGap === 0 ? (
                                      <span className="text-slate-400">—</span>
                                    ) : (
                                      <span className={`inline-flex items-center gap-0.5 font-medium ${row.quantityGap > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                        {row.quantityGap > 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                                        {row.quantityGap > 0 ? '+' : ''}{formatQuantity(row.quantityGap)}
                                      </span>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    {rate === null ? (
                                      <span className="text-slate-300">—</span>
                                    ) : (
                                      <div className="flex items-center gap-2">
                                        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100">
                                          <div
                                            className={`h-full rounded-full ${rate > 1 ? 'bg-red-500' : rate >= 0.9 ? 'bg-amber-500' : 'bg-[var(--color-primary)]'}`}
                                            style={{ width: `${Math.min(100, rate * 100)}%` }}
                                          />
                                        </div>
                                        <span className={`text-xs ${rate > 1 ? 'font-medium text-red-600' : 'text-slate-500'}`}>
                                          {(rate * 100).toFixed(1)}%
                                        </span>
                                      </div>
                                    )}
                                  </TableCell>
                                  <TableCell>{getRowStatusBadge(row)}</TableCell>
                                  <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                                    <div className="flex items-center justify-center gap-1">
                                      {!row.isAddon && (
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="h-7 gap-1 px-2 text-xs text-[var(--color-primary)] hover:bg-blue-50 hover:text-[#0E42A8]"
                                          onClick={openMonthlyReportDialog}
                                        >
                                          <Plus className="h-3 w-3" />
                                          录入
                                        </Button>
                                      )}
                                      {!row.isAddon && (
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="h-7 gap-1 px-2 text-xs text-slate-600 hover:bg-slate-100"
                                          onClick={() => openBudgetEditDialog(row as unknown as WorkItemSubitem)}
                                        >
                                          <Pencil className="h-3 w-3" />
                                          改预算
                                        </Button>
                                      )}
                                      <button
                                        type="button"
                                        aria-label={isExpanded ? '收起明细' : '展开明细'}
                                        onClick={() => toggleRowDetail(row)}
                                        className="rounded p-1 hover:bg-slate-100"
                                      >
                                        <ChevronRight className={`h-4 w-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                                      </button>
                                    </div>
                                  </TableCell>
                                </TableRow>
                                {isExpanded && (
                                  <TableRow className="bg-slate-50/50 hover:bg-slate-50/50">
                                    <TableCell colSpan={9} className="p-0">
                                      <div className="m-3 rounded-lg border-l-2 border-[var(--color-primary)]/40 bg-white p-4 shadow-sm">
                                        {row.isAddon ? (
                                          <p className="text-sm text-slate-500">
                                            内部附加清单不参与对上/对下量差对比，累计完成 {formatQuantity(row.totalSettledQty)} {row.unit || ''}，金额走对下成本口径。
                                          </p>
                                        ) : rowDetailLoading ? (
                                          <div className="py-6 text-center text-sm text-gray-400">正在加载分项明细…</div>
                                        ) : !rowDetail ? null : (
                                          <div className="grid gap-4 lg:grid-cols-2">
                                            <div>
                                              <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-[var(--color-primary)]">
                                                <ArrowUpRight className="h-3.5 w-3.5" />
                                                对上报量记录（{rowDetail.reports.length}）
                                              </div>
                                              {rowDetail.reports.length === 0 ? (
                                                <p className="py-3 text-sm text-slate-400">暂无报量记录</p>
                                              ) : (
                                                <div className="overflow-hidden rounded-md border border-slate-100">
                                                  <table className="w-full text-sm">
                                                    <thead>
                                                      <tr className="bg-slate-50 text-xs text-slate-500">
                                                        <th className="px-3 py-2 text-left font-medium">月份</th>
                                                        <th className="px-3 py-2 text-right font-medium">报量</th>
                                                        <th className="px-3 py-2 text-left font-medium">备注</th>
                                                      </tr>
                                                    </thead>
                                                    <tbody>
                                                      {rowDetail.reports.slice(0, 6).map((r: any) => (
                                                        <tr key={r.id} className="border-t border-slate-100">
                                                          <td className="px-3 py-2 text-slate-600">{r.year_month}</td>
                                                          <td className="px-3 py-2 text-right font-medium text-[var(--color-primary)]">
                                                            {formatQuantity(r.report_quantity)} {row.unit || ''}
                                                          </td>
                                                          <td className="max-w-40 truncate px-3 py-2 text-slate-500" title={r.remark || ''}>{r.remark || '—'}</td>
                                                        </tr>
                                                      ))}
                                                    </tbody>
                                                  </table>
                                                  {rowDetail.reports.length > 6 && (
                                                    <div className="border-t border-slate-100 bg-slate-50/60 px-3 py-1.5 text-center text-xs text-slate-400">
                                                      仅显示最近 6 条，共 {rowDetail.reports.length} 条
                                                    </div>
                                                  )}
                                                </div>
                                              )}
                                            </div>
                                            <div>
                                              <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-amber-700">
                                                <ArrowDownRight className="h-3.5 w-3.5" />
                                                对下结算记录（{rowDetail.settlements.length}）
                                              </div>
                                              {rowDetail.settlements.length === 0 ? (
                                                <p className="py-3 text-sm text-slate-400">暂无结算记录</p>
                                              ) : (
                                                <div className="overflow-hidden rounded-md border border-slate-100">
                                                  <table className="w-full text-sm">
                                                    <thead>
                                                      <tr className="bg-slate-50 text-xs text-slate-500">
                                                        <th className="px-3 py-2 text-left font-medium">月份</th>
                                                        <th className="px-3 py-2 text-right font-medium">结算量</th>
                                                        <th className="px-3 py-2 text-left font-medium">备注</th>
                                                      </tr>
                                                    </thead>
                                                    <tbody>
                                                      {rowDetail.settlements.slice(0, 6).map((r: any) => (
                                                        <tr key={r.id} className="border-t border-slate-100">
                                                          <td className="px-3 py-2 text-slate-600">{r.year_month}</td>
                                                          <td className="px-3 py-2 text-right font-medium text-amber-700">
                                                            {formatQuantity(r.completed_quantity)} {row.unit || ''}
                                                          </td>
                                                          <td className="max-w-40 truncate px-3 py-2 text-slate-500" title={r.remark || ''}>{r.remark || '—'}</td>
                                                        </tr>
                                                      ))}
                                                    </tbody>
                                                  </table>
                                                  {rowDetail.settlements.length > 6 && (
                                                    <div className="border-t border-slate-100 bg-slate-50/60 px-3 py-1.5 text-center text-xs text-slate-400">
                                                      仅显示最近 6 条，共 {rowDetail.settlements.length} 条
                                                    </div>
                                                  )}
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                )}
                              </Fragment>
                            );
                          })
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              {/* 明细记录（原始凭证留痕） */}
              <Card className={`shadow-card transition-all duration-500 delay-400 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
                <CardContent className="p-0">
                  <div className="border-b border-slate-100 px-5 py-4">
                    <h3 className="font-semibold text-gray-900">明细记录</h3>
                    <p className="mt-0.5 text-xs text-gray-400">
                      {analysisYearMonth || '—'} 月原始凭证留痕，可核对修改（编辑修正在对应录入弹窗内进行）
                    </p>
                  </div>
                  <div className="p-5">
                    <Tabs value={detailTab} onValueChange={(v) => setDetailTab(v as 'reports' | 'settlements' | 'addons')}>
                      <TabsList>
                        <TabsTrigger value="reports">对上报量记录（{ledgerReportRecords.length}）</TabsTrigger>
                        <TabsTrigger value="settlements">对下结算记录（{ledgerSettlementRecords.length}）</TabsTrigger>
                        <TabsTrigger value="addons">附加清单（{projectAddons.length}）</TabsTrigger>
                      </TabsList>
                      <TabsContent value="reports" className="mt-4">
                        {ledgerRecordsLoading ? (
                          <div className="py-10 text-center text-sm text-gray-400">正在加载…</div>
                        ) : ledgerReportRecords.length === 0 ? (
                          <div className="py-10 text-center text-sm text-gray-400">本月暂无对上报量记录</div>
                        ) : (
                          <div className="overflow-x-auto rounded-lg border border-slate-100">
                            <Table>
                              <TableHeader>
                                <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                                  <TableHead className="w-28">月份</TableHead>
                                  <TableHead>分项工程</TableHead>
                                  <TableHead className="text-right">报量</TableHead>
                                  <TableHead>备注</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {ledgerReportRecords.map((r: any) => (
                                  <TableRow key={r.id}>
                                    <TableCell className="text-slate-600">{r.year_month}</TableCell>
                                    <TableCell className="font-medium text-gray-800">{subitemNameOf(Number(r.subitem_id))}</TableCell>
                                    <TableCell className="text-right font-medium whitespace-nowrap text-[var(--color-primary)]">
                                      {formatQuantity(r.report_quantity)} {subitemUnitOf(Number(r.subitem_id))}
                                    </TableCell>
                                    <TableCell className="max-w-56 truncate text-slate-500" title={r.remark || ''}>{r.remark || '—'}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        )}
                      </TabsContent>
                      <TabsContent value="settlements" className="mt-4">
                        {ledgerRecordsLoading ? (
                          <div className="py-10 text-center text-sm text-gray-400">正在加载…</div>
                        ) : ledgerSettlementRecords.length === 0 ? (
                          <div className="py-10 text-center text-sm text-gray-400">本月暂无对下结算记录</div>
                        ) : (
                          <div className="overflow-x-auto rounded-lg border border-slate-100">
                            <Table>
                              <TableHeader>
                                <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                                  <TableHead className="w-28">月份</TableHead>
                                  <TableHead>分项工程</TableHead>
                                  <TableHead className="text-right">结算量</TableHead>
                                  <TableHead className="text-right">单价</TableHead>
                                  <TableHead>备注</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {ledgerSettlementRecords.map((r: any) => (
                                  <TableRow key={r.id}>
                                    <TableCell className="text-slate-600">{r.year_month}</TableCell>
                                    <TableCell className="font-medium text-gray-800">
                                      {r.work_item_subitems?.subitem_name || subitemNameOf(Number(r.subitem_id))}
                                    </TableCell>
                                    <TableCell className="text-right font-medium whitespace-nowrap text-amber-700">
                                      {formatQuantity(r.completed_quantity)} {r.work_item_subitems?.unit || subitemUnitOf(Number(r.subitem_id))}
                                    </TableCell>
                                    <TableCell className="text-right whitespace-nowrap text-slate-600">
                                      {r.unit_price ? formatCurrency(r.unit_price) : '—'}
                                    </TableCell>
                                    <TableCell className="max-w-56 truncate text-slate-500" title={r.remark || ''}>{r.remark || '—'}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        )}
                      </TabsContent>
                      <TabsContent value="addons" className="mt-4">
                        {projectAddons.length === 0 ? (
                          <div className="py-10 text-center text-sm text-gray-400">
                            暂无内部附加清单，点击右上角「维护附加清单」新增
                          </div>
                        ) : (
                          <div className="overflow-x-auto rounded-lg border border-slate-100">
                            <Table>
                              <TableHeader>
                                <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                                  <TableHead>清单名称</TableHead>
                                  <TableHead className="w-20">单位</TableHead>
                                  <TableHead className="text-right">单价</TableHead>
                                  <TableHead className="text-right">累计完成量</TableHead>
                                  <TableHead className="text-right">累计金额</TableHead>
                                  <TableHead>备注</TableHead>
                                  <TableHead className="w-28 text-center">操作</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {projectAddons.map((addon) => (
                                  <TableRow key={addon.id}>
                                    <TableCell className="font-medium text-gray-800">{addon.name}</TableCell>
                                    <TableCell className="text-slate-500">{addon.unit}</TableCell>
                                    <TableCell className="text-right whitespace-nowrap text-slate-600">
                                      {addon.unit_price ? formatCurrency(parseFloat(addon.unit_price) || 0) : '—'}
                                    </TableCell>
                                    <TableCell className="text-right whitespace-nowrap text-amber-700">
                                      {addon.total_quantity ? `${formatQuantity(parseFloat(addon.total_quantity) || 0)} ${addon.unit || ''}` : '—'}
                                    </TableCell>
                                    <TableCell className="text-right font-medium whitespace-nowrap text-gray-800">
                                      {addon.total_amount ? formatCurrency(parseFloat(addon.total_amount) || 0) : '—'}
                                    </TableCell>
                                    <TableCell className="max-w-40 truncate text-slate-500" title={addon.remark || ''}>{addon.remark || '—'}</TableCell>
                                    <TableCell className="text-center">
                                      <div className="flex items-center justify-center gap-1">
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="h-7 px-2 text-xs text-[var(--color-primary)] hover:bg-blue-50"
                                          onClick={() => openProjectAddonDialog(addon)}
                                        >
                                          <Pencil className="h-3 w-3" />
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="h-7 px-2 text-xs text-red-600 hover:bg-red-50"
                                          onClick={() => handleDeleteProjectAddon(addon.id)}
                                        >
                                          <Trash2 className="h-3 w-3" />
                                        </Button>
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        )}
                      </TabsContent>
                    </Tabs>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </>
      )}

      {/* 新增预算工程量对话框 */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>新增预算工程量</DialogTitle>
            <DialogDescription>添加分项工程预算</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAdd} className="space-y-4">
            <div>
              <Label>分项名称 *</Label>
              <Input value={form.subitem_name} onChange={(e) => setForm({ ...form, subitem_name: e.target.value })} required placeholder="请输入分项名称" />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                {/* P0-2：新增即填限价，避免限价留空导致结算价 fallback 混用 */}
                <Label>限价（内部成本控制线）</Label>
                <Input type="number" step="0.01" value={form.limit_price || ''} onChange={(e) => setForm({ ...form, limit_price: e.target.value })} placeholder="元，对下结算超此价需填原因" />
              </div>
              <div>
                <Label>备注</Label>
                <Input value={form.remark || ''} onChange={(e) => setForm({ ...form, remark: e.target.value })} placeholder="备注信息" />
              </div>
            </div>
            <div className="flex flex-col-reverse gap-2 pt-4 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setAddDialogOpen(false)}>取消</Button>
              <Button type="submit" disabled={adding}>{adding ? '添加中...' : '添加'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* 编辑预算工程量对话框 */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>编辑预算工程量</DialogTitle>
            <DialogDescription>修改分项工程信息</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEdit} className="space-y-4">
            <div>
              <Label>分项名称 *</Label>
              <Input value={form.subitem_name} onChange={(e) => setForm({ ...form, subitem_name: e.target.value })} required placeholder="请输入分项名称" />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
            <div className="flex flex-col-reverse gap-2 pt-4 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)}>取消</Button>
              <Button type="submit">保存</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* 批量导入对话框 */}
      <Dialog open={batchDialogOpen} onOpenChange={(open) => { setBatchDialogOpen(open); if (!open) { setBatchText(''); setUploadFileName(''); }}}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>批量导入预算工程量</DialogTitle>
            <DialogDescription>上传文件或直接粘贴数据</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleBatchAdd} className="space-y-4">
            <input ref={fileInputRef} type="file" accept=".csv,.txt" onChange={handleFileUpload} className="hidden" />
            <div className="space-y-2">
              <Label>上传文件（可选）</Label>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
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
            <div className="flex flex-col-reverse gap-2 pt-4 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setBatchDialogOpen(false)}>取消</Button>
              <Button type="submit" disabled={!batchText.trim()}>导入</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* 批量删除确认：已统一走 useConfirm（原旁路 AlertDialog 已移除） */}

      {/* 内部附加清单公司模板对话框 */}
      <Dialog open={templateDialogOpen} onOpenChange={(open) => { setTemplateDialogOpen(open); if (!open) resetTemplateForm(); }}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? '编辑公司通用模板' : '新增公司通用模板'}</DialogTitle>
            <DialogDescription>维护公司常用内部附加清单，可导入到具体项目中使用</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveTemplate} className="space-y-4">
            <div>
              <Label>清单名称 *</Label>
              <Input value={templateForm.name} onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })} required placeholder="如：修补打磨" />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
            <div className="flex flex-col-reverse gap-2 pt-4 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setTemplateDialogOpen(false)}>取消</Button>
              <Button type="submit" disabled={addonSaving}>{addonSaving ? '保存中...' : '保存'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* 项目内部附加清单对话框 */}
      <Dialog open={projectAddonDialogOpen} onOpenChange={(open) => { setProjectAddonDialogOpen(open); if (!open) resetProjectAddonForm(); }}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingProjectAddon ? '编辑项目内部附加清单' : '新增项目内部附加清单'}</DialogTitle>
            <DialogDescription>项目单价会用于月度对下结算和差异金额分析</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveProjectAddon} className="space-y-4">
            <div>
              <Label>清单名称 *</Label>
              <Input value={projectAddonForm.name} onChange={(e) => setProjectAddonForm({ ...projectAddonForm, name: e.target.value })} required placeholder="请输入清单名称" />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
            <div className="flex flex-col-reverse gap-2 pt-4 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setProjectAddonDialogOpen(false)}>取消</Button>
              <Button type="submit" disabled={addonSaving}>{addonSaving ? '保存中...' : '保存'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* 编辑对上报量对话框 */}
      <Dialog open={budgetEditDialogOpen} onOpenChange={setBudgetEditDialogOpen}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>编辑对上报量</DialogTitle>
            <DialogDescription>修改上报量和价格信息</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleBudgetEdit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label>合同价</Label>
                <Input type="number" step="0.01" value={budgetForm.contract_price} onChange={(e) => setBudgetForm({ ...budgetForm, contract_price: e.target.value })} />
              </div>
              <div>
                <Label>限价</Label>
                <Input type="number" step="0.01" value={budgetForm.limit_price} onChange={(e) => setBudgetForm({ ...budgetForm, limit_price: e.target.value })} />
              </div>
            </div>
            <div className="flex flex-col-reverse gap-2 pt-4 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setBudgetEditDialogOpen(false)}>取消</Button>
              <Button type="submit">保存</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* 月度对上报量对话框 */}
      <Dialog open={monthlyReportDialogOpen} onOpenChange={setMonthlyReportDialogOpen}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              月度对上报量录入
            </DialogTitle>
            <DialogDescription>按月录入各分项工程的对上报量，系统自动累计总上报量</DialogDescription>
          </DialogHeader>
          
          <div className="flex flex-col gap-2 py-2 border-b sm:flex-row sm:items-center sm:gap-4">
            <Label className="text-sm">选择月份：</Label>
            <Select value={selectedYearMonth} onValueChange={(value) => {
              setSelectedYearMonth(value);
              fetchMonthlyReportRecords(value);
            }}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="选择月份" />
              </SelectTrigger>
              <SelectContent>
                {getMonthsList().map(month => (
                  <SelectItem key={month} value={month}>{month}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-sm text-gray-500 sm:ml-auto">
              项目：{selectedProject?.name || ''}
            </span>
          </div>

          {monthlyReportLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="loading-spinner" />
            </div>
          ) : (
            <div className="flex-1 overflow-auto">
              <Table className="zebra-table min-w-[820px]">
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

          <div className="flex flex-col gap-3 pt-4 border-t lg:flex-row lg:items-center lg:justify-between">
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
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
            <p className="text-sm text-gray-500 lg:flex-1 lg:text-center">
              提示：输入当月上报量后点击保存，系统会自动累计到总上报量
            </p>
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <Button variant="outline" onClick={() => setMonthlyReportDialogOpen(false)}>取消</Button>
              <Button onClick={handleSaveMonthlyReport}>保存</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 月度报量历史记录对话框 */}
      <Dialog open={monthlyReportHistoryOpen} onOpenChange={setMonthlyReportHistoryOpen}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
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
            <Table className="zebra-table min-w-[880px]">
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

          <div className="grid grid-cols-1 gap-2 pt-4 border-t sm:flex sm:justify-end">
            <Button variant="outline" onClick={() => setMonthlyReportHistoryOpen(false)}>关闭</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 月度报量编辑对话框 */}
      <Dialog open={monthlyReportEditDialogOpen} onOpenChange={setMonthlyReportEditDialogOpen}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-5 h-5" />
              编辑月度报量
            </DialogTitle>
            <DialogDescription>修改月度对上报量数据</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); handleSaveMonthlyReportEdit(); }} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
            <div className="flex flex-col-reverse gap-2 pt-4 border-t sm:flex-row sm:justify-end">
              <Button variant="outline" type="button" onClick={() => setMonthlyReportEditDialogOpen(false)}>取消</Button>
              <Button type="submit">保存修改</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* 月度对下结算量对话框 */}
      <Dialog open={monthlySettlementDialogOpen} onOpenChange={setMonthlySettlementDialogOpen}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              月度对下结算量录入
            </DialogTitle>
            <DialogDescription>按月录入各分项工程的对下结算量，系统自动累计总结算量</DialogDescription>
          </DialogHeader>
          
          <div className="flex flex-col gap-2 py-2 border-b sm:flex-row sm:items-center sm:gap-4">
            <Label className="text-sm">选择月份：</Label>
            <Select value={settlementYearMonth} onValueChange={(value) => {
              setSettlementYearMonth(value);
              fetchMonthlySettlementRecords(value);
            }}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="选择月份" />
              </SelectTrigger>
              <SelectContent>
                {getMonthsList().map(month => (
                  <SelectItem key={month} value={month}>{month}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-sm text-gray-500 sm:ml-auto">
              项目：{selectedProject?.name || ''}
            </span>
          </div>

          {monthlySettlementLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="loading-spinner" />
            </div>
          ) : (
            <div className="flex-1 overflow-auto space-y-6">
              <Table className="zebra-table min-w-[820px]">
              <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">序号</TableHead>
                    <TableHead>分项名称</TableHead>
                    <TableHead>单位</TableHead>
                    <TableHead className="text-right">预算量</TableHead>
                    <TableHead className="text-right">合同单价</TableHead>
                    <TableHead className="text-right">限价</TableHead>
                    <TableHead className="text-right">当月结算量</TableHead>
                    <TableHead className="text-right">结算单价</TableHead>
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
                        <TableCell className="text-right text-blue-600">{record.contract_price || '-'}</TableCell>
                        <TableCell className="text-right text-orange-600">{record.limit_price || '-'}</TableCell>
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
                        {/* P0-2：结算单价（默认带出限价/合同价），超限实时标红 + 原因留痕 */}
                        <TableCell className="text-right">
                          <div className="flex flex-col items-end gap-1">
                            <Input
                              type="number"
                              step="0.01"
                              className={`w-24 text-right ${isUnitPriceOverLimit(record) ? 'border-red-400 text-red-600' : ''}`}
                              value={record.unit_price || ''}
                              onChange={(e) => handleMonthlySettlementUnitPriceChange(record.subitem_id, e.target.value)}
                              placeholder="单价"
                            />
                            {isUnitPriceOverLimit(record) && (
                              <div className="flex flex-col gap-1 w-44">
                                <span className="text-[11px] font-medium text-red-600">
                                  超限价 {getUnitPriceOverRatio(record)}%
                                </span>
                                <Input
                                  value={record.over_limit_reason || ''}
                                  onChange={(e) => handleMonthlySettlementOverReasonChange(record.subitem_id, e.target.value)}
                                  placeholder="必填：超限原因（留痕）"
                                  className="h-7 text-[11px] border-red-300"
                                />
                              </div>
                            )}
                          </div>
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
                  <Table className="zebra-table min-w-[900px]">
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

          <div className="flex flex-col gap-3 pt-4 border-t lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <Button 
                variant="outline" 
                onClick={openSettlementHistory}
                className="w-full sm:w-auto"
              >
                <FileText className="w-4 h-4 mr-2" />
                查看历史记录
              </Button>
              <p className="text-sm text-gray-500 sm:flex sm:items-center">
                提示：分项工程累计到总结算量；内部附加清单只累计到对下成本金额
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <Button variant="outline" onClick={() => setMonthlySettlementDialogOpen(false)}>取消</Button>
              <Button onClick={handleSaveMonthlySettlement}>保存</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 对下结算量历史记录对话框 */}
      <Dialog open={settlementHistoryOpen} onOpenChange={setSettlementHistoryOpen}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
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
              <Table className="zebra-table min-w-[820px]">
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

          <div className="grid grid-cols-1 gap-2 pt-4 border-t sm:flex sm:justify-end">
            <Button variant="outline" onClick={() => setSettlementHistoryOpen(false)}>关闭</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 对下结算量编辑对话框 */}
      <Dialog open={settlementEditDialogOpen} onOpenChange={setSettlementEditDialogOpen}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-5 h-5" />
              编辑对下结算量
            </DialogTitle>
            <DialogDescription>修改月度对下结算量数据</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); handleSaveSettlementEdit(); }} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
            <div className="flex flex-col-reverse gap-2 pt-4 border-t sm:flex-row sm:justify-end">
              <Button variant="outline" type="button" onClick={() => setSettlementEditDialogOpen(false)}>取消</Button>
              <Button type="submit">保存修改</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ========== 对上报量历史记录（独立） ========== */}
      <Dialog open={reportHistoryOpen} onOpenChange={setReportHistoryOpen}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
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
              <Table className="zebra-table min-w-[760px]">
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
                            <Button variant="ghost" size="sm" onClick={() => openReportHistoryEditDialog(record)} className="h-8 px-2" aria-label="编辑">
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handleDeleteReportHistory(record.id)} className="h-8 px-2 text-red-500 hover:text-red-600 hover:bg-red-50" aria-label="删除">
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

          <div className="grid grid-cols-1 gap-2 pt-4 border-t sm:flex sm:justify-end">
            <Button variant="outline" onClick={() => setReportHistoryOpen(false)}>关闭</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 对上报量历史编辑对话框 */}
      <Dialog open={reportHistoryEditDialogOpen} onOpenChange={setReportHistoryEditDialogOpen}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-5 h-5" />
              编辑对上报量
            </DialogTitle>
            <DialogDescription>修改月度对上报量数据</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); handleSaveReportHistoryEdit(); }} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
            <div className="flex flex-col-reverse gap-2 pt-4 border-t sm:flex-row sm:justify-end">
              <Button variant="outline" type="button" onClick={() => setReportHistoryEditDialogOpen(false)}>取消</Button>
              <Button type="submit">保存修改</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ========== 对下结算量历史记录（独立） ========== */}
      <Dialog open={settleHistoryOpen} onOpenChange={setSettleHistoryOpen}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
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
              <Table className="zebra-table min-w-[760px]">
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
                            <Button variant="ghost" size="sm" onClick={() => handleDeleteSettleHistory(record.id)} className="h-8 px-2 text-red-500 hover:text-red-600 hover:bg-red-50" aria-label="删除">
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

          <div className="grid grid-cols-1 gap-2 pt-4 border-t sm:flex sm:justify-end">
            <Button variant="outline" onClick={() => setSettleHistoryOpen(false)}>关闭</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 对下结算量历史编辑对话框 */}
      <Dialog open={settleHistoryEditDialogOpen} onOpenChange={setSettleHistoryEditDialogOpen}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-5 h-5" />
              编辑对下结算量
            </DialogTitle>
            <DialogDescription>修改月度对下结算量数据</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); handleSaveSettleHistoryEdit(); }} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
            <div className="flex flex-col-reverse gap-2 pt-4 border-t sm:flex-row sm:justify-end">
              <Button variant="outline" type="button" onClick={() => setSettleHistoryEditDialogOpen(false)}>取消</Button>
              <Button type="submit">保存修改</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
