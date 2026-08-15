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
  BarChart3, ListTree, Target, CheckCircle2, TrendingUp,
  Building2, RefreshCw, Plus, Pencil, Trash2, Upload, Download,
  Search, X, FileSpreadsheet, FileText, AlertTriangle, Calendar, Save, Copy, Layers,
  ArrowUpRight, ArrowDownRight, ShieldAlert, ChevronRight, ArrowLeft, ArrowRight, Scale
} from 'lucide-react';
import { AnimatedNumber, formatCurrency } from '@/components/ui/animated-number';
import { useConfirm } from '@/hooks/use-confirm';

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

const DEMO_PROJECT_ID = -901001;
const DEMO_YEAR_MONTH = '2026-08';

const DEMO_PROJECT: Project = {
  id: DEMO_PROJECT_ID,
  name: '已停用演示项目',
  year: 2026,
  status: '在建',
  contract_amount: '186000000',
};

const DEMO_SUBITEMS: WorkItemSubitem[] = [
  {
    id: -901101,
    project_id: DEMO_PROJECT_ID,
    project_name: DEMO_PROJECT.name,
    subitem_name: '1#楼地下室模板工程',
    unit: 'm2',
    budget_quantity: '12800',
    completed_quantity: '7600',
    settlement_quantity: '6900',
    contract_price: '52',
    limit_price: '48',
    remark: '地下室至二层累计完成，报量略高于对下结算。',
  },
  {
    id: -901102,
    project_id: DEMO_PROJECT_ID,
    project_name: DEMO_PROJECT.name,
    subitem_name: '1#楼钢筋制作安装',
    unit: 't',
    budget_quantity: '1850',
    completed_quantity: '1160',
    settlement_quantity: '980',
    contract_price: '6100',
    limit_price: '5750',
    remark: '主体结构持续推进，需关注钢筋结算资料。',
  },
  {
    id: -901103,
    project_id: DEMO_PROJECT_ID,
    project_name: DEMO_PROJECT.name,
    subitem_name: '1#楼混凝土浇筑',
    unit: 'm3',
    budget_quantity: '9200',
    completed_quantity: '5100',
    settlement_quantity: '5450',
    contract_price: '486',
    limit_price: '458',
    remark: '对下结算略快于对上报量，适合展示多结少报风险。',
  },
  {
    id: -901104,
    project_id: DEMO_PROJECT_ID,
    project_name: DEMO_PROJECT.name,
    subitem_name: '2#楼砌体工程',
    unit: 'm3',
    budget_quantity: '3600',
    completed_quantity: '980',
    settlement_quantity: '420',
    contract_price: '328',
    limit_price: '302',
    remark: '刚进入大面施工，本月需要补充确认完成范围。',
  },
  {
    id: -901105,
    project_id: DEMO_PROJECT_ID,
    project_name: DEMO_PROJECT.name,
    subitem_name: '2#楼内墙抹灰',
    unit: 'm2',
    budget_quantity: '24600',
    completed_quantity: '0',
    settlement_quantity: '1800',
    contract_price: '26',
    limit_price: '23',
    remark: '本月有对下结算但对上未报，模拟漏报提醒。',
  },
  {
    id: -901106,
    project_id: DEMO_PROJECT_ID,
    project_name: DEMO_PROJECT.name,
    subitem_name: '屋面防水工程',
    unit: 'm2',
    budget_quantity: '5200',
    completed_quantity: '4680',
    settlement_quantity: '4210',
    contract_price: '68',
    limit_price: '61',
    remark: '接近完成，剩余工程量不多。',
  },
  {
    id: -901107,
    project_id: DEMO_PROJECT_ID,
    project_name: DEMO_PROJECT.name,
    subitem_name: '外墙保温一体板',
    unit: 'm2',
    budget_quantity: '18600',
    completed_quantity: '8200',
    settlement_quantity: '7900',
    contract_price: '138',
    limit_price: '126',
    remark: '外立面按楼层推进。',
  },
  {
    id: -901108,
    project_id: DEMO_PROJECT_ID,
    project_name: DEMO_PROJECT.name,
    subitem_name: '铝合金门窗安装',
    unit: 'm2',
    budget_quantity: '7800',
    completed_quantity: '2300',
    settlement_quantity: '2100',
    contract_price: '415',
    limit_price: '392',
    remark: '用于查看低进度清单展示。',
  },
  {
    id: -901109,
    project_id: DEMO_PROJECT_ID,
    project_name: DEMO_PROJECT.name,
    subitem_name: '水电预埋安装',
    unit: '点位',
    budget_quantity: '9800',
    completed_quantity: '6100',
    settlement_quantity: '6500',
    contract_price: '32',
    limit_price: '29',
    remark: '对下略快，需要复核现场签认。',
  },
  {
    id: -901110,
    project_id: DEMO_PROJECT_ID,
    project_name: DEMO_PROJECT.name,
    subitem_name: '脚手架搭拆',
    unit: 'm2',
    budget_quantity: '42000',
    completed_quantity: '39600',
    settlement_quantity: '43500',
    contract_price: '18',
    limit_price: '16',
    remark: '模拟对下超结，方便看风险标签。',
  },
];

const DEMO_ADDON_TEMPLATES: InternalAddonTemplate[] = [
  { id: -902001, name: '零星用工', unit: '工日', default_price: '320', remark: '现场临时配合、清理、转运等零星事项' },
  { id: -902002, name: '夜间赶工补贴', unit: '班组班次', default_price: '1200', remark: '经项目经理确认后的夜间赶工' },
  { id: -902003, name: '二次搬运', unit: '车', default_price: '650', remark: '材料二次倒运或场内转运' },
];

const DEMO_PROJECT_ADDONS: ProjectInternalAddon[] = [
  {
    id: -902101,
    project_id: DEMO_PROJECT_ID,
    template_id: -902001,
    name: '零星用工',
    unit: '工日',
    unit_price: '320',
    remark: '地下室材料清理与临边防护配合',
    total_quantity: '42',
    total_amount: '13440',
  },
  {
    id: -902102,
    project_id: DEMO_PROJECT_ID,
    template_id: -902002,
    name: '夜间赶工补贴',
    unit: '班组班次',
    unit_price: '1200',
    remark: '1#楼混凝土浇筑夜间连续施工',
    total_quantity: '6',
    total_amount: '7200',
  },
  {
    id: -902103,
    project_id: DEMO_PROJECT_ID,
    template_id: -902003,
    name: '二次搬运',
    unit: '车',
    unit_price: '650',
    remark: '雨季材料堆场调整产生二次搬运',
    total_quantity: '18',
    total_amount: '11700',
  },
];

const withDemoProjects = (source: Project[] = []) => {
  return source.filter(project => project.id !== DEMO_PROJECT_ID);
};

const withDemoSubitems = (source: WorkItemSubitem[] = []) => {
  return source.filter(item => item.project_id !== DEMO_PROJECT_ID);
};

const withDemoTemplates = (source: InternalAddonTemplate[] = []) => {
  return source.filter(template => template.id > 0);
};

const demoMonthlyReports = (yearMonth: string) => [
  { id: -903101, subitem_id: -901101, year_month: yearMonth, report_quantity: '1800', remark: '本月完成地下室后浇带及二层局部模板' },
  { id: -903102, subitem_id: -901102, year_month: yearMonth, report_quantity: '260', remark: '主体钢筋按楼层节点报量' },
  { id: -903103, subitem_id: -901103, year_month: yearMonth, report_quantity: '900', remark: '本月浇筑量已提交确认' },
  { id: -903104, subitem_id: -901104, year_month: yearMonth, report_quantity: '420', remark: '二层砌体完成量' },
  { id: -903105, subitem_id: -901106, year_month: yearMonth, report_quantity: '680', remark: '屋面防水收尾报量' },
  { id: -903106, subitem_id: -901107, year_month: yearMonth, report_quantity: '1500', remark: '外墙东立面完成量' },
  { id: -903107, subitem_id: -901108, year_month: yearMonth, report_quantity: '520', remark: '窗框安装完成量' },
  { id: -903108, subitem_id: -901109, year_month: yearMonth, report_quantity: '880', remark: '水电预埋点位确认' },
  { id: -903109, subitem_id: -901110, year_month: yearMonth, report_quantity: '3600', remark: '脚手架随主体施工累计确认' },
];

const demoMonthlySettlements = (yearMonth: string) => [
  { id: -904101, subitem_id: -901101, year_month: yearMonth, completed_quantity: '1600', remark: '模板班组本月结算' },
  { id: -904102, subitem_id: -901102, year_month: yearMonth, completed_quantity: '210', remark: '钢筋班组本月结算' },
  { id: -904103, subitem_id: -901103, year_month: yearMonth, completed_quantity: '1050', remark: '混凝土浇筑结算略快' },
  { id: -904104, subitem_id: -901104, year_month: yearMonth, completed_quantity: '260', remark: '砌体班组结算' },
  { id: -904105, subitem_id: -901105, year_month: yearMonth, completed_quantity: '1800', remark: '抹灰已结算但对上未报' },
  { id: -904106, subitem_id: -901106, year_month: yearMonth, completed_quantity: '610', remark: '防水班组结算' },
  { id: -904107, subitem_id: -901107, year_month: yearMonth, completed_quantity: '1320', remark: '保温一体板结算' },
  { id: -904108, subitem_id: -901108, year_month: yearMonth, completed_quantity: '480', remark: '门窗安装结算' },
  { id: -904109, subitem_id: -901109, year_month: yearMonth, completed_quantity: '1080', remark: '预埋安装结算略快' },
  { id: -904110, subitem_id: -901110, year_month: yearMonth, completed_quantity: '4200', remark: '脚手架本月超结风险演示' },
];

const demoAddonSettlements = (yearMonth: string) => [
  { id: -905101, project_id: DEMO_PROJECT_ID, addon_id: -902101, addon_name: '零星用工', unit: '工日', year_month: yearMonth, quantity: '16', unit_price: '320', amount: 5120, remark: '现场材料清理及临时配合' },
  { id: -905102, project_id: DEMO_PROJECT_ID, addon_id: -902102, addon_name: '夜间赶工补贴', unit: '班组班次', year_month: yearMonth, quantity: '2', unit_price: '1200', amount: 2400, remark: '混凝土夜间连续浇筑' },
  { id: -905103, project_id: DEMO_PROJECT_ID, addon_id: -902103, addon_name: '二次搬运', unit: '车', year_month: yearMonth, quantity: '5', unit_price: '650', amount: 3250, remark: '材料堆场调整' },
];

// P0-1 演示回款（项目级，effective=false 模拟未生效/待审核）
const demoClientPayments = [
  { payment_amount: 1200000, payment_date: '2026-05-20', effective: true },
  { payment_amount: 860000, payment_date: '2026-06-18', effective: true },
  { payment_amount: 640000, payment_date: '2026-07-15', effective: true },
  { payment_amount: 500000, payment_date: '2026-08-10', effective: true },
  { payment_amount: 300000, payment_date: '2026-08-25', effective: false },
];

const demoProgressExpected = (yearMonth: string): ProgressExpectedRecord[] => [
  { subitem_id: -901101, expected_quantity: 1950, matched_quantity: 1950, task_count: 3, completed_task_count: 2, latest_progress: 86, task_labels: [`${yearMonth} 1#楼模板节点`], unit: 'm2' },
  { subitem_id: -901102, expected_quantity: 240, matched_quantity: 240, task_count: 2, completed_task_count: 2, latest_progress: 100, task_labels: [`${yearMonth} 钢筋节点`], unit: 't' },
  { subitem_id: -901103, expected_quantity: 1180, matched_quantity: 1180, task_count: 3, completed_task_count: 3, latest_progress: 100, task_labels: [`${yearMonth} 混凝土节点`], unit: 'm3' },
  { subitem_id: -901105, expected_quantity: 1800, matched_quantity: 1800, task_count: 1, completed_task_count: 1, latest_progress: 100, task_labels: [`${yearMonth} 抹灰样板段`], unit: 'm2' },
  { subitem_id: -901110, expected_quantity: 3800, matched_quantity: 3800, task_count: 2, completed_task_count: 2, latest_progress: 100, task_labels: [`${yearMonth} 脚手架节点`], unit: 'm2' },
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
      setProjects(withDemoProjects(projectsData.projects || []));
      setAllSubitems(withDemoSubitems(subitemsData.subitems || []));
    } catch (error) {
      console.error('获取数据失败:', error);
      setProjects(withDemoProjects([]));
      setAllSubitems(withDemoSubitems([]));
    } finally {
      setLoading(false);
    }
  };

  const fetchAddonTemplates = async () => {
    try {
      const res = await fetch('/api/internal-addon-templates', { credentials: 'include' });
      const data = await res.json();
      setAddonTemplates(withDemoTemplates(data.templates || []));
    } catch (error) {
      console.error('获取内部附加清单模板失败:', error);
      setAddonTemplates(withDemoTemplates([]));
    }
  };

  const fetchProjectAddons = async (projectId = selectedProjectId) => {
    if (!projectId) return;
    if (parseInt(projectId) === DEMO_PROJECT_ID) {
      setProjectAddons(DEMO_PROJECT_ADDONS);
      setAddonLoading(false);
      return;
    }
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
      const price = parseFloat(item.limit_price || item.contract_price || '0') || 0;
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
      const progressExpected = progressExpectedMap.get(item.id);
      const progressExpectedQty = progressExpected?.expected_quantity || 0;
      const reportVsProgressGap = monthlyReportedQty - progressExpectedQty;
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
      const price = parseFloat(item.limit_price || item.contract_price || '0') || 0;
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
        const settlementPrice = toNumber(item.limit_price || item.contract_price);

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
      setAllSubitems(withDemoSubitems(data.subitems || []));
    } catch (error) {
      console.error('刷新数据失败:', error);
      setAllSubitems(withDemoSubitems([]));
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
    if (parseInt(selectedProjectId) === DEMO_PROJECT_ID) {
      toast({ title: '演示项目', description: '当前为演示数据，新增清单不会写入数据库。请选择真实项目后录入。', variant: 'warning' });
      return;
    }
    
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
    if (currentSubitem.id < 0 || parseInt(selectedProjectId) === DEMO_PROJECT_ID) {
      toast({ title: '演示项目', description: '当前为演示数据，修改不会写入数据库。请选择真实项目后编辑。', variant: 'warning' });
      return;
    }
    
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
    if (parseInt(selectedProjectId) === DEMO_PROJECT_ID) {
      toast({ title: '演示项目', description: '当前为演示数据，批量导入不会写入数据库。请选择真实项目后导入。', variant: 'warning' });
      return;
    }
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
    if (parseInt(selectedProjectId) === DEMO_PROJECT_ID) {
      toast({ title: '演示项目', description: '当前为演示数据，导入不会写入数据库。请选择真实项目后导入。', variant: 'warning' });
      e.target.value = '';
      return;
    }
    
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
    if (parseInt(selectedProjectId) === DEMO_PROJECT_ID) {
      toast({ title: '演示项目', description: '当前为演示数据，模板下载请在真实项目中使用。', variant: 'warning' });
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
    if (id < 0 || parseInt(selectedProjectId) === DEMO_PROJECT_ID) {
      toast({ title: '演示项目', description: '当前为演示数据，删除不会写入数据库。', variant: 'warning' });
      return;
    }
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
    if (parseInt(selectedProjectId) === DEMO_PROJECT_ID || Array.from(selectedIds).some(id => id < 0)) {
      toast({ title: '演示项目', description: '当前为演示数据，批量删除不会写入数据库。', variant: 'warning' });
      return;
    }
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
    if (budgetEditItem.id < 0 || parseInt(selectedProjectId) === DEMO_PROJECT_ID) {
      toast({ title: '演示项目', description: '当前为演示数据，预算修改不会写入数据库。请选择真实项目后编辑。', variant: 'warning' });
      return;
    }
    
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

    if (parseInt(selectedProjectId) === DEMO_PROJECT_ID) {
      setAnalysisReports(demoMonthlyReports(analysisYearMonth));
      setAnalysisSettlements(demoMonthlySettlements(analysisYearMonth));
      setAnalysisAddonSettlements(demoAddonSettlements(analysisYearMonth));
      setAnalysisProgressExpected(demoProgressExpected(analysisYearMonth));
      setAnalysisLoading(false);
      return;
    }

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
      if (parseInt(selectedProjectId) === DEMO_PROJECT_ID) {
        // 演示：用演示月报量/结算 + 演示回款构建（与 API 口径一致）
        const demoReports = demoMonthlyReports(target);
        const demoSettlements = demoMonthlySettlements(target);
        const reportMap = new Map(demoReports.map((r: any) => [r.subitem_id, parseFloat(r.report_quantity) || 0]));
        const settleMap = new Map(demoSettlements.map((s: any) => [s.subitem_id, parseFloat(s.completed_quantity) || 0]));
        const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

        const rows = DEMO_SUBITEMS.map(sub => {
          const contractPrice = toNumber(sub.contract_price);
          const limitPrice = toNumber(sub.limit_price);
          const effectivePrice = limitPrice || contractPrice;
          const budgetQty = toNumber(sub.budget_quantity);
          const monthReportQty = reportMap.get(sub.id) || 0;
          const monthSettleQty = settleMap.get(sub.id) || 0;
          const cumulativeReportQty = toNumber(sub.completed_quantity);
          const cumulativeSettleQty = toNumber(sub.settlement_quantity);
          const monthReportAmount = round2(monthReportQty * contractPrice);
          const monthSettleAmount = round2(monthSettleQty * effectivePrice);
          const cumulativeReportAmount = round2(cumulativeReportQty * contractPrice);
          const cumulativeSettleAmount = round2(cumulativeSettleQty * effectivePrice);
          const monthDifference = round2(monthReportAmount - monthSettleAmount);
          const cumulativeDifference = round2(cumulativeReportAmount - cumulativeSettleAmount);
          const differenceRatio = monthReportAmount > 0 ? Math.abs((monthDifference / monthReportAmount) * 100) : null;

          return {
            subitem_id: sub.id,
            subitem_name: sub.subitem_name,
            unit: sub.unit,
            budget_quantity: budgetQty,
            contract_price: contractPrice,
            limit_price: limitPrice || null,
            month_report_quantity: monthReportQty,
            month_report_amount: monthReportAmount,
            cumulative_report_quantity: cumulativeReportQty,
            cumulative_report_amount: cumulativeReportAmount,
            month_settlement_quantity: monthSettleQty,
            month_settlement_amount: monthSettleAmount,
            cumulative_settlement_quantity: cumulativeSettleQty,
            cumulative_settlement_amount: cumulativeSettleAmount,
            month_difference: monthDifference,
            cumulative_difference: cumulativeDifference,
            difference_ratio: differenceRatio === null ? null : round2(differenceRatio),
            over_budget: budgetQty > 0 && cumulativeReportQty > budgetQty,
            settlement_over_report: monthSettleQty > monthReportQty,
            ratio_warning: differenceRatio !== null && differenceRatio > 30,
          };
        });

        const activePayments = demoClientPayments.filter(p => p.effective);
        const monthPaymentAmount = round2(
          activePayments.filter(p => p.payment_date.slice(0, 7) === target).reduce((sum, p) => sum + p.payment_amount, 0)
        );
        const cumulativePaymentAmount = round2(
          activePayments.filter(p => p.payment_date.slice(0, 7) <= target).reduce((sum, p) => sum + p.payment_amount, 0)
        );
        const monthReportAmount = round2(rows.reduce((sum, r) => sum + r.month_report_amount, 0));
        const monthSettleAmount = round2(rows.reduce((sum, r) => sum + r.month_settlement_amount, 0));
        const cumulativeReportAmount = round2(rows.reduce((sum, r) => sum + r.cumulative_report_amount, 0));
        const cumulativeSettleAmount = round2(rows.reduce((sum, r) => sum + r.cumulative_settlement_amount, 0));

        setReconData({
          rows,
          summary: {
            month_report_amount: monthReportAmount,
            month_settlement_amount: monthSettleAmount,
            month_difference: round2(monthReportAmount - monthSettleAmount),
            cumulative_report_amount: cumulativeReportAmount,
            cumulative_settlement_amount: cumulativeSettleAmount,
            cumulative_difference: round2(cumulativeReportAmount - cumulativeSettleAmount),
            month_payment_amount: monthPaymentAmount,
            cumulative_payment_amount: cumulativePaymentAmount,
            receivable_amount: round2(cumulativeReportAmount - cumulativePaymentAmount),
            over_budget_count: rows.filter(r => r.over_budget).length,
            ratio_warning_count: rows.filter(r => r.ratio_warning).length,
            settlement_over_report_count: rows.filter(r => r.settlement_over_report).length,
          },
        });
        return;
      }

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
      const isDemoProject = parseInt(selectedProjectId) === DEMO_PROJECT_ID;
      const data = isDemoProject
        ? { records: demoMonthlyReports(yearMonth) }
        : await fetch(`/api/subitem-monthly-reports?project_id=${selectedProjectId}&year_month=${yearMonth}`).then(res => res.json());
      
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

    if (parseInt(selectedProjectId) === DEMO_PROJECT_ID) {
      toast({ title: '演示保存', description: `已模拟保存 ${recordsToSave.length} 条月度对上报量，演示数据不会写入数据库。`, variant: 'success' });
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
    if (monthlyReportEditRecord.id < 0 || parseInt(selectedProjectId) === DEMO_PROJECT_ID) {
      toast({ title: '演示项目', description: '当前为演示数据，修改不会写入数据库。', variant: 'warning' });
      return;
    }
    
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
    if (recordId < 0 || parseInt(selectedProjectId) === DEMO_PROJECT_ID) {
      toast({ title: '演示项目', description: '当前为演示数据，删除不会写入数据库。', variant: 'warning' });
      return;
    }
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
      const isDemoProject = parseInt(selectedProjectId) === DEMO_PROJECT_ID;
      const [data, addonsData, addonRecordsData] = isDemoProject
        ? [
            { records: demoMonthlySettlements(yearMonth) },
            { addons: DEMO_PROJECT_ADDONS },
            { records: demoAddonSettlements(yearMonth) },
          ]
        : await Promise.all([
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
      const isDemoProject = parseInt(selectedProjectId) === DEMO_PROJECT_ID;
      const monthReports = isDemoProject
        ? demoMonthlyReports(settlementYearMonth)
        : (await fetch(`/api/subitem-monthly-reports?project_id=${selectedProjectId}&year_month=${settlementYearMonth}`, { credentials: 'include' }).then(res => res.json())).records || [];
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

    if (parseInt(selectedProjectId) === DEMO_PROJECT_ID) {
      const totalSaved = recordsToSave.length + addonRecordsToSave.length;
      toast({ title: '演示保存', description: `已模拟保存 ${totalSaved} 条月度对下结算记录，演示数据不会写入数据库。`, variant: 'success' });
      return;
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
    if (settlementEditRecord.id < 0 || parseInt(selectedProjectId) === DEMO_PROJECT_ID) {
      toast({ title: '演示项目', description: '当前为演示数据，修改不会写入数据库。', variant: 'warning' });
      return;
    }
    
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
    if (recordId < 0 || parseInt(selectedProjectId) === DEMO_PROJECT_ID) {
      toast({ title: '演示项目', description: '当前为演示数据，删除不会写入数据库。', variant: 'warning' });
      return;
    }
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
    if (item.id < 0) {
      setReportHistoryData(demoMonthlyReports(DEMO_YEAR_MONTH).filter(record => record.subitem_id === item.id));
      setReportHistoryLoading(false);
      return;
    }
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
    if (subitemId < 0) {
      setReportHistoryData(demoMonthlyReports(DEMO_YEAR_MONTH).filter(record => record.subitem_id === subitemId));
      setReportHistoryLoading(false);
      return;
    }
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
    if (item.id < 0) {
      setSettleHistoryData(demoMonthlySettlements(DEMO_YEAR_MONTH).filter(record => record.subitem_id === item.id));
      setSettleHistoryLoading(false);
      return;
    }
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
    if (subitemId < 0) {
      setSettleHistoryData(demoMonthlySettlements(DEMO_YEAR_MONTH).filter(record => record.subitem_id === subitemId));
      setSettleHistoryLoading(false);
      return;
    }
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
      case '在建': return 'bg-[#165DFF] text-white';
      case '竣工结算': return 'bg-emerald-500 text-white';
      case '质保期': return 'bg-purple-500 text-white';
      case '质保期满': return 'bg-amber-500 text-white';
      case '进行中': return 'bg-[#165DFF] text-white';
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

  const isDemoProjectSelected = selectedProjectId === String(DEMO_PROJECT_ID);
  const selectedProject = useMemo(
    () => projects.find(p => p.id.toString() === selectedProjectId),
    [projects, selectedProjectId]
  );
  const demoProjectSnapshot = useMemo(() => {
    if (!isDemoProjectSelected) return null;
    return {
      subitemCount: DEMO_SUBITEMS.length,
      reportCount: demoMonthlyReports(analysisYearMonth || DEMO_YEAR_MONTH).length,
      settlementCount: demoMonthlySettlements(analysisYearMonth || DEMO_YEAR_MONTH).length,
      addonCount: DEMO_PROJECT_ADDONS.length,
      progressCount: demoProgressExpected(analysisYearMonth || DEMO_YEAR_MONTH).length,
    };
  }, [analysisYearMonth, isDemoProjectSelected]);

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
            {quantityView === 'summary' ? '项目汇总对比' : '项目录入工作台'}
          </h1>
          <p className="text-gray-500 mt-1 text-sm">
            {quantityView === 'summary'
              ? '先按项目查看对上、对下和剩余差异，再进入单个项目录入。'
              : '只处理当前项目的对上报量、对下结算和内部附加清单。'}
          </p>
        </div>
        <Button variant="outline" onClick={fetchData} className="w-full gap-2 sm:w-auto">
          <RefreshCw className="w-4 h-4" />
          刷新
        </Button>
      </div>

      {demoProjectSnapshot && (
        <div className={`rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-amber-900 shadow-sm transition-all duration-500 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium">当前正在查看演示项目</p>
              <p className="mt-1 text-sm text-amber-800">
                已预填 {demoProjectSnapshot.subitemCount} 条清单、{demoProjectSnapshot.reportCount} 条本月报量、{demoProjectSnapshot.settlementCount} 条本月结算、{demoProjectSnapshot.addonCount} 条附加项、{demoProjectSnapshot.progressCount} 条进度对照。
              </p>
            </div>
            <Badge className="w-fit bg-amber-500 text-white hover:bg-amber-500">演示数据</Badge>
          </div>
        </div>
      )}

      {/* 总览统计卡片 */}
      {quantityView === 'summary' && (
        <>
      <div className={`grid grid-cols-2 gap-3 transition-all duration-500 delay-100 lg:grid-cols-4 lg:gap-4 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
        <Card className="group border-[#165DFF]/20 bg-white transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-[#165DFF]/10">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#165DFF] flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                <Layers className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-gray-500">预算工程量金额</p>
                <AnimatedNumber value={dashboardTotals.budgetAmount} format={formatCurrency} className="text-lg font-bold text-[#165DFF]" />
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
                        <div className="h-2 rounded-full bg-[#165DFF]" style={{ width: `${clampProgress(row.reportProgress)}%` }} />
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
                    <div className="h-2 rounded-full bg-[#165DFF]" style={{ width: `${clampProgress(row.reportProgress)}%` }} />
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
      <div className={`transition-all duration-500 delay-150 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
        <Card className="border-[#165DFF]/20">
          <CardContent className="py-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setQuantityView('summary')}
              className="mb-3 gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              返回项目汇总
            </Button>
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
                <div className="flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-[#1A58B3]" />
                  <span className="font-medium text-gray-700">选择项目：</span>
                </div>
                <div className="w-full min-w-0 sm:w-auto">
                  <Select
                    value={selectedProjectId}
                    onValueChange={(value) => {
                      setSelectedProjectId(value);
                      setEntryPanel('monthly');
                    }}
                  >
                    <SelectTrigger className="w-full max-w-full sm:w-72">
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
                </div>
                {selectedProject && (
                  <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500 sm:gap-3">
                    <span>{selectedProject.year}年度</span>
                    <span>·</span>
                    <span>{subitems.length} 个分项工程</span>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 rounded-lg border border-slate-200 bg-slate-50 p-1 text-sm sm:w-[260px]">
                <button
                  type="button"
                  onClick={() => setEntryPanel('monthly')}
                  className={`h-9 rounded-md px-3 font-medium transition ${
                    entryPanel === 'monthly'
                      ? 'bg-white text-[#1A58B3] shadow-sm'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  本月录入
                </button>
                <button
                  type="button"
                  onClick={() => setEntryPanel('ledger')}
                  className={`h-9 rounded-md px-3 font-medium transition ${
                    entryPanel === 'ledger'
                      ? 'bg-white text-[#1A58B3] shadow-sm'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  工程量查看
                </button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 预警筛选提示 */}
      {warningFilter && selectedProjectId && (
        <div className={`transition-all duration-500 delay-175 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
          <div className="flex flex-col gap-3 px-4 py-3 rounded-lg sm:flex-row sm:items-center sm:justify-between"
            style={{ background: warningFilter === 'overbudget' ? '#FFECE8' : '#FFF7E8', border: `1px solid ${warningFilter === 'overbudget' ? '#F53F3F' : '#FF7D00'}` }}>
            <div className="flex items-start gap-3 sm:items-center">
              <AlertTriangle className="w-5 h-5" style={{ color: warningFilter === 'overbudget' ? '#F53F3F' : '#FF7D00' }} />
              <div>
                <span className="font-medium" style={{ color: warningFilter === 'overbudget' ? '#F53F3F' : '#FF7D00' }}>
                  {getWarningTitle()}
                </span>
                <span className="mt-1 block text-sm sm:ml-2 sm:mt-0 sm:inline" style={{ color: '#86909C' }}>
                  共 {subitems.length} 项
                </span>
              </div>
            </div>
            <button 
              onClick={clearWarningFilter}
              className="flex w-full items-center justify-center gap-1 rounded px-3 py-1 text-sm transition-colors hover:bg-white/50 sm:w-auto"
              style={{ color: warningFilter === 'overbudget' ? '#F53F3F' : '#FF7D00' }}
            >
              <X className="w-4 h-4" />
              清除筛选
            </button>
          </div>
        </div>
      )}

      {/* 数据录入区域 */}
      {selectedProjectId && entryPanel === 'monthly' && (
        <div className={`transition-all duration-500 delay-200 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 p-4 sm:p-5">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div className="min-w-0 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold text-slate-950">本月数据录入</h2>
                    <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
                      {selectedProject?.name || '当前项目'}
                    </Badge>
                    {selectedProject?.status && (
                      <Badge className={getStatusStyle(selectedProject.status)}>
                        {selectedProject.status}
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <label className="flex h-10 w-full items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-600 sm:w-auto">
                      <Calendar className="h-4 w-4 text-slate-400" />
                      <Input
                        type="month"
                        value={analysisYearMonth}
                        onChange={(event) => setAnalysisYearMonth(event.target.value)}
                        className="h-8 w-full border-0 p-0 shadow-none focus-visible:ring-0 sm:w-32"
                      />
                    </label>
                    <Button
                      onClick={() => {
                        if (entryWorkbenchMode === 'client') {
                          openMonthlyReportDialog();
                        } else if (entryWorkbenchMode === 'internal') {
                          openMonthlySettlementDialog();
                        } else {
                          openProjectAddonDialog();
                        }
                      }}
                      className="h-10 gap-2 bg-slate-950 px-5 hover:bg-slate-800"
                    >
                      <Save className="h-4 w-4" />
                      {entryWorkbenchMode === 'additional' ? '维护附加清单' : `录入${activeEntryMode.label}`}
                    </Button>
                    <Button variant="outline" onClick={() => setBatchDialogOpen(true)} className="h-10 gap-2">
                      <Upload className="h-4 w-4" />
                      批量导入
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4 xl:w-[680px]">
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">预算金额</p>
                    <p className="mt-1 font-semibold text-slate-950">{formatCurrency(projectComparisonSummary.budgetAmount)}</p>
                  </div>
                  <div className="rounded-md border border-blue-100 bg-blue-50 p-3">
                    <p className="text-xs text-blue-700">对上剩余</p>
                    <p className="mt-1 font-semibold text-blue-900">{formatCurrency(projectComparisonSummary.reportRemainingAmount)}</p>
                  </div>
                  <div className="rounded-md border border-amber-100 bg-amber-50 p-3">
                    <p className="text-xs text-amber-700">对下剩余</p>
                    <p className="mt-1 font-semibold text-amber-900">{formatCurrency(projectComparisonSummary.settlementRemainingAmount)}</p>
                  </div>
                  <div className={`rounded-md border p-3 ${projectComparisonSummary.amountGap < 0 ? 'border-rose-100 bg-rose-50' : 'border-emerald-100 bg-emerald-50'}`}>
                    <p className={`text-xs ${projectComparisonSummary.amountGap < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>对上对下差额</p>
                    <p className={`mt-1 font-semibold ${getGapTextClass(projectComparisonSummary.amountGap)}`}>
                      {formatCurrency(projectComparisonSummary.amountGap)}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_320px]">
              <div className="min-w-0 space-y-4">
                <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="grid gap-2 sm:grid-cols-3 lg:flex lg:flex-wrap">
                    {ENTRY_WORKBENCH_MODES.map(mode => {
                      const active = entryWorkbenchMode === mode.key;
                      return (
                        <button
                          key={mode.key}
                          type="button"
                          onClick={() => setEntryWorkbenchMode(mode.key)}
                          className={`rounded-md border px-3 py-2 text-left text-sm transition ${
                            active ? mode.activeClass : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <div className="font-medium">{mode.label}</div>
                          <div className="mt-0.5 text-xs opacity-80">{mode.description}</div>
                        </button>
                      );
                    })}
                  </div>
                  <div className="rounded-md bg-white px-3 py-2 text-sm text-slate-600">
                    <span className="text-slate-400">当前：</span>
                    <span className="font-medium text-slate-950">{analysisYearMonth || '-'}</span>
                    <span className="px-2 text-slate-300">/</span>
                    <span className="font-medium text-slate-950">{activeEntryMode.label}</span>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <Table className="min-w-[980px]">
                    <TableHeader>
                      <TableRow className="bg-slate-50">
                        <TableHead className="sticky left-0 z-10 bg-slate-50">清单项</TableHead>
                        <TableHead>单位</TableHead>
                        <TableHead className="text-right">预算量</TableHead>
                        <TableHead className="text-right">累计量</TableHead>
                        <TableHead className="text-right">剩余量</TableHead>
                        <TableHead className="text-right">单价</TableHead>
                        <TableHead className="text-right">累计金额</TableHead>
                        <TableHead>校验</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {entryWorkbenchRows.length > 0 ? entryWorkbenchRows.map(row => (
                        <TableRow key={row.id}>
                          <TableCell className="sticky left-0 z-10 bg-white">
                            <div className="font-medium text-slate-950">{row.subitem_name}</div>
                            <div className="mt-0.5 text-xs text-slate-500">
                              {row.isAddon ? '内部附加清单' : '预算工程量清单'}
                            </div>
                          </TableCell>
                          <TableCell>{row.unit || '-'}</TableCell>
                          <TableCell className="text-right">{row.isAddon ? '-' : formatQuantity(row.budgetQty)}</TableCell>
                          <TableCell className="text-right font-medium text-slate-900">{formatQuantity(row.cumulativeQty)}</TableCell>
                          <TableCell className={`text-right ${row.remainingQty < 0 ? 'font-semibold text-rose-700' : 'text-slate-700'}`}>
                            {row.isAddon ? '-' : formatQuantity(row.remainingQty)}
                          </TableCell>
                          <TableCell className="text-right">{formatCurrency(row.unitPrice)}</TableCell>
                          <TableCell className="text-right font-semibold text-slate-950">{formatCurrency(row.amount)}</TableCell>
                          <TableCell>
                            <Badge
                              variant={row.risks.length > 0 ? 'outline' : 'secondary'}
                              className={row.risks.length > 0 ? 'border-amber-200 bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}
                            >
                              {row.riskLabel}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      )) : (
                        <TableRow>
                          <TableCell colSpan={8} className="py-10 text-center text-sm text-slate-500">
                            当前项目暂无可展示清单，请先维护预算工程量或内部附加清单。
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <aside className="space-y-3">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-950">
                    <FileText className="h-4 w-4 text-slate-500" />
                    当前录入上下文
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded-md bg-white p-3">
                      <p className="text-xs text-slate-500">录入类型</p>
                      <p className="mt-1 font-semibold text-slate-950">
                        {ENTRY_WORKBENCH_MODES.find(mode => mode.key === entryWorkbenchMode)?.label}
                      </p>
                    </div>
                    <div className="rounded-md bg-white p-3">
                      <p className="text-xs text-slate-500">当前月份</p>
                      <p className="mt-1 font-semibold text-slate-950">{analysisYearMonth || '-'}</p>
                    </div>
                    <div className="rounded-md bg-white p-3">
                      <p className="text-xs text-slate-500">展示清单</p>
                      <p className="mt-1 font-semibold text-slate-950">{entryWorkbenchSummary.rowCount} 项</p>
                    </div>
                    <div className="rounded-md bg-white p-3">
                      <p className="text-xs text-slate-500">累计金额</p>
                      <p className="mt-1 font-semibold text-slate-950">{formatCurrency(entryWorkbenchSummary.totalAmount)}</p>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-amber-900">
                    <ShieldAlert className="h-4 w-4" />
                    录入前风险提醒
                  </div>
                  <div className="mt-3 space-y-2 text-sm text-amber-800">
                    <div className="flex items-center justify-between rounded-md bg-white/70 px-3 py-2">
                      <span>对下超结</span>
                      <span className="font-semibold">{projectComparisonSummary.overSettledItems} 项</span>
                    </div>
                    <div className="flex items-center justify-between rounded-md bg-white/70 px-3 py-2">
                      <span>本月可能漏报</span>
                      <span className="font-semibold">{projectComparisonSummary.possibleMissedReportItems} 项</span>
                    </div>
                    <div className="flex items-center justify-between rounded-md bg-white/70 px-3 py-2">
                      <span>内部附加成本</span>
                      <span className="font-semibold">{projectComparisonSummary.addonItems} 项</span>
                    </div>
                    <div className="flex items-center justify-between rounded-md bg-white/70 px-3 py-2">
                      <span>当前列表提醒</span>
                      <span className="font-semibold">{entryWorkbenchSummary.riskCount} 项</span>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    className="mt-3 w-full border-amber-200 bg-white text-amber-800 hover:bg-amber-100"
                    onClick={() => setEntryPanel('ledger')}
                  >
                    查看工程量台账
                  </Button>
                </div>
              </aside>
            </div>
          </section>
        </div>
      )}

      {quantityView === 'entry' && entryPanel === 'ledger' && (
      <div className={`transition-all duration-500 delay-200 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
        {loading ? (
          // 加载态统一：骨架屏（替代纯文字"加载中..."）
          <div className="space-y-3 py-6">
            <Skeleton className="h-10 rounded-lg" />
            <Skeleton className="h-10 rounded-lg" />
            <Skeleton className="h-10 rounded-lg" />
            <Skeleton className="h-24 rounded-lg" />
          </div>
        ) : !selectedProjectId ? (
          <Card>
            <CardContent className="py-16 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[#165DFF]/10 flex items-center justify-center">
                <BarChart3 className="w-8 h-8 text-[#165DFF]/40" />
              </div>
              <p className="text-gray-500 mb-2">请先选择项目</p>
              <p className="text-sm text-gray-400">选择项目后可进行预算工程量、对上报量、对下结算和差异分析</p>
            </CardContent>
          </Card>
        ) : (
          <Tabs id="quantity-detail-tabs" defaultValue="subitems" className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold text-slate-950">工程量查看</h2>
                    <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
                      台账口径
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">预算清单、累计对上、累计对下、附加清单和差异分析集中查看。</p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4 xl:w-[560px]">
                  <div className="rounded-md bg-slate-50 px-3 py-2">
                    <p className="text-xs text-slate-500">清单项</p>
                    <p className="mt-1 font-semibold text-slate-950">{projectStats.totalItems} 项</p>
                  </div>
                  <div className="rounded-md bg-blue-50 px-3 py-2">
                    <p className="text-xs text-slate-500">预算金额</p>
                    <p className="mt-1 font-semibold text-[#1A58B3]">{formatCurrency(projectStats.totalBudget)}</p>
                  </div>
                  <div className="rounded-md bg-slate-50 px-3 py-2">
                    <p className="text-xs text-slate-500">对上剩余</p>
                    <p className="mt-1 font-semibold text-blue-700">{formatCurrency(projectComparisonSummary.reportRemainingAmount)}</p>
                  </div>
                  <div className="rounded-md bg-slate-50 px-3 py-2">
                    <p className="text-xs text-slate-500">对下剩余</p>
                    <p className="mt-1 font-semibold text-amber-700">{formatCurrency(projectComparisonSummary.settlementRemainingAmount)}</p>
                  </div>
                </div>
              </div>
              <div className="mt-4 flex flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-slate-500">
                  当前项目：<span className="font-medium text-slate-900">{selectedProject?.name || '-'}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
                  <Button variant="outline" onClick={() => setEntryPanel('monthly')} className="gap-2">
                    <ArrowLeft className="h-4 w-4" />
                    本月录入
                  </Button>
                  <Button variant="outline" onClick={refreshSubitems} className="gap-2">
                    <RefreshCw className="h-4 w-4" />
                    刷新
                  </Button>
                </div>
              </div>
            </div>
            <div className="sticky top-16 z-20 overflow-x-auto border-b border-slate-200 bg-[#F0F2F5]/95 pb-2 pt-1 backdrop-blur">
              <TabsList className="min-w-max bg-white border shadow-sm">
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
              <TabsTrigger value="reconciliation" className="gap-2">
                <Scale className="w-4 h-4" />
                勾稽台账
              </TabsTrigger>
              </TabsList>
            </div>

            {/* 预算工程量标签页 */}
            <TabsContent value="subitems" className="space-y-4">
              {/* 工具栏 */}
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="relative w-full sm:w-auto">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                    <Input
                      placeholder="搜索分项名称"
                      value={searchKeyword}
                      onChange={(e) => setSearchKeyword(e.target.value)}
                      className="w-full pl-9 sm:w-48"
                    />
                  </div>
                  {searchKeyword && (
                    <Button variant="ghost" size="sm" onClick={() => setSearchKeyword('')} className="w-full sm:w-auto">
                      <X className="w-4 h-4 mr-1" />清除
                    </Button>
                  )}
                  <span className="text-sm text-gray-500">{filteredSubitems.length} 条记录</span>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
                  <Button variant="outline" onClick={downloadTemplate} className="w-full sm:w-auto">
                    <Download className="w-4 h-4 mr-2" />下载模板
                  </Button>
                  <Button variant="outline" onClick={() => setBatchDialogOpen(true)} className="w-full sm:w-auto">
                    <Upload className="w-4 h-4 mr-2" />批量导入
                  </Button>
                  <Button variant="outline" onClick={() => setMonthlyReportDialogOpen(true)} className="w-full sm:w-auto">
                    <FileText className="w-4 h-4 mr-2" />月度报量导入
                  </Button>
                  {selectedIds.size > 0 && (
                    <Button variant="destructive" onClick={handleBatchDelete} className="w-full sm:w-auto">
                      <Trash2 className="w-4 h-4 mr-2" />删除 ({selectedIds.size})
                    </Button>
                  )}
                  <Button onClick={() => { resetForm(); setAddDialogOpen(true); }} className="w-full bg-[#165DFF] hover:bg-[#144a96] sm:w-auto">
                    <Plus className="w-4 h-4 mr-2" />新增
                  </Button>
                </div>
              </div>

              {/* 表格 */}
              <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                <div className="p-3 sm:p-4">
                  {filteredSubitems.length > 0 ? (
                    <>
                      <div className="space-y-3 md:hidden">
                        {filteredSubitems.map(item => {
                          const budgetQty = parseFloat(item.budget_quantity) || 0;
                          const contractPrice = parseFloat(item.contract_price || '0') || 0;
                          const budgetAmount = budgetQty * contractPrice;
                          return (
                            <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-slate-900">{item.subitem_name}</p>
                                  <p className="mt-1 text-xs text-slate-500">单位：{item.unit || '-'}</p>
                                </div>
                                <Checkbox
                                  checked={selectedIds.has(item.id)}
                                  onCheckedChange={(checked) => handleSelect(item.id, checked as boolean)}
                                />
                              </div>
                              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                                <div className="rounded-lg bg-blue-50 px-2 py-2">
                                  <p className="text-blue-600">预算量</p>
                                  <p className="mt-1 font-semibold text-blue-700">{item.budget_quantity || '0'}</p>
                                </div>
                                <div className="rounded-lg bg-slate-50 px-2 py-2">
                                  <p className="text-slate-500">合同单价</p>
                                  <p className="mt-1 font-semibold text-slate-800">{item.contract_price || '-'}</p>
                                </div>
                                <div className="col-span-2 rounded-lg bg-indigo-50 px-2 py-2">
                                  <p className="text-indigo-600">预算金额</p>
                                  <p className="mt-1 font-semibold text-indigo-700">{formatCurrency(budgetAmount)}</p>
                                </div>
                              </div>
                              <div className="mt-3 flex justify-end gap-2">
                                <Button size="sm" variant="outline" onClick={() => openEditDialog(item)}>
                                  <Pencil className="w-3 h-3 mr-1" />编辑
                                </Button>
                                <Button size="sm" variant="outline" className="text-red-600 hover:text-red-700" onClick={() => handleDelete(item.id)}>
                                  <Trash2 className="w-3 h-3 mr-1" />删除
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="hidden overflow-x-auto md:block">
                        <Table className="zebra-table min-w-[900px]">
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
                              <TableCell className="text-right font-bold text-[#165DFF]">{formatCurrency(budgetAmount)}</TableCell>
                              <TableCell className="text-sm text-gray-500 max-w-32 truncate">{item.remark || '-'}</TableCell>
                              <TableCell>
                                <div className="flex gap-1">
                                  <Button size="sm" variant="ghost" onClick={() => openEditDialog(item)} aria-label="编辑">
                                    <Pencil className="w-3 h-3" />
                                  </Button>
                                  <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700" onClick={() => handleDelete(item.id)} aria-label="删除">
                                    <Trash2 className="w-3 h-3" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                        </Table>
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <p>暂无分项工程数据</p>
                      <p className="text-sm mt-2">点击“新增”添加分项工程</p>
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>

            {/* 对上报量标签页 */}
            <TabsContent value="budget" className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h3 className="text-lg font-semibold">对上报量</h3>
                <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
                  <Button onClick={openMonthlyReportDialog} className="w-full gap-2 sm:w-auto">
                    <Calendar className="w-4 h-4" />
                    月度报量
                  </Button>
                  <Button variant="outline" onClick={refreshSubitems} className="w-full sm:w-auto">
                    <RefreshCw className="w-4 h-4 mr-2" />刷新
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
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
                <CardContent className="p-3 sm:pt-6">
                  {subitems.length > 0 ? (
                    <>
                      <div className="space-y-3 md:hidden">
                        {subitems.map(item => {
                          const budgetQty = parseFloat(item.budget_quantity) || 0;
                          const reportedQty = parseFloat(item.completed_quantity) || 0;
                          const remainingQty = budgetQty - reportedQty;
                          const contractPrice = parseFloat(item.contract_price || '0') || 0;
                          const progress = budgetQty > 0 ? (reportedQty / budgetQty * 100) : 0;
                          const reportAmount = reportedQty * contractPrice;
                          return (
                            <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-slate-900">{item.subitem_name}</p>
                                  <p className="mt-1 text-xs text-slate-500">单位：{item.unit || '-'}</p>
                                </div>
                                {getProgressBadge(progress)}
                              </div>
                              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                                <div className="rounded-lg bg-slate-50 px-2 py-2">
                                  <p className="text-slate-500">预算量</p>
                                  <p className="mt-1 font-semibold text-slate-800">{item.budget_quantity || '0'}</p>
                                </div>
                                <div className="rounded-lg bg-blue-50 px-2 py-2">
                                  <p className="text-blue-600">累计上报</p>
                                  <p className="mt-1 font-semibold text-blue-700">{item.completed_quantity || '0'}</p>
                                </div>
                                <div className="rounded-lg bg-orange-50 px-2 py-2">
                                  <p className="text-orange-600">剩余量</p>
                                  <p className="mt-1 font-semibold text-orange-700">{remainingQty.toFixed(2)}</p>
                                </div>
                                <div className="rounded-lg bg-indigo-50 px-2 py-2">
                                  <p className="text-indigo-600">上报金额</p>
                                  <p className="mt-1 font-semibold text-indigo-700">{formatCurrency(reportAmount)}</p>
                                </div>
                              </div>
                              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                                <div className={`h-full ${progress >= 100 ? 'bg-green-500' : progress >= 80 ? 'bg-red-500' : 'bg-blue-500'}`} style={{ width: `${Math.min(progress, 100)}%` }} />
                              </div>
                              <div className="mt-3 flex justify-end">
                                <Button size="sm" variant="outline" onClick={() => openReportHistory(item)}>
                                  <FileText className="w-3 h-3 mr-1" />历史
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="hidden overflow-x-auto md:block">
                        <Table className="zebra-table min-w-[980px]">
              <TableHeader>
                        <TableRow className="bg-[#E8F3FF] hover:bg-[#E8F3FF]">
                          <TableHead>分项名称</TableHead>
                          <TableHead>单位</TableHead>
                          <TableHead className="text-right">预算量</TableHead>
                          <TableHead className="text-right">累计对上报量</TableHead>
                          <TableHead className="text-right">剩余工程量</TableHead>
                          <TableHead className="text-center">上报进度</TableHead>
                          <TableHead className="text-right">结算单价</TableHead>
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
                              <TableCell className="text-right font-bold text-[#165DFF]">{formatCurrency(reportAmount)}</TableCell>
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
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-8 text-gray-500">暂无数据</div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* 对下结算量标签页 */}
            <TabsContent value="completed" className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h3 className="text-lg font-semibold">对下结算量</h3>
                <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
                  <Button onClick={openMonthlySettlementDialog} className="w-full gap-2 sm:w-auto">
                    <Calendar className="w-4 h-4" />
                    月度结算
                  </Button>
                  <Button variant="outline" onClick={refreshSubitems} className="w-full sm:w-auto">
                    <RefreshCw className="w-4 h-4 mr-2" />刷新
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
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
                <CardContent className="p-3 sm:pt-6">
                  {subitems.length > 0 ? (
                    <>
                      <div className="space-y-3 md:hidden">
                        {subitems.map(item => {
                          const budgetQty = parseFloat(item.budget_quantity) || 0;
                          const settlementQty = parseFloat(item.settlement_quantity || '0') || 0;
                          const remainingQty = budgetQty - settlementQty;
                          const settlementPrice = parseFloat(item.limit_price || item.contract_price || '0') || 0;
                          const progress = budgetQty > 0 ? (settlementQty / budgetQty) * 100 : 0;
                          const settlementAmount = settlementQty * settlementPrice;
                          return (
                            <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-slate-900">{item.subitem_name}</p>
                                  <p className="mt-1 text-xs text-slate-500">单位：{item.unit || '-'}</p>
                                </div>
                                {getProgressBadge(progress)}
                              </div>
                              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                                <div className="rounded-lg bg-slate-50 px-2 py-2">
                                  <p className="text-slate-500">预算量</p>
                                  <p className="mt-1 font-semibold text-slate-800">{item.budget_quantity || '0'}</p>
                                </div>
                                <div className="rounded-lg bg-blue-50 px-2 py-2">
                                  <p className="text-blue-600">累计结算</p>
                                  <p className="mt-1 font-semibold text-blue-700">{item.settlement_quantity || '0'}</p>
                                </div>
                                <div className="rounded-lg bg-orange-50 px-2 py-2">
                                  <p className="text-orange-600">剩余量</p>
                                  <p className="mt-1 font-semibold text-orange-700">{remainingQty.toFixed(2)}</p>
                                </div>
                                <div className="rounded-lg bg-indigo-50 px-2 py-2">
                                  <p className="text-indigo-600">结算金额</p>
                                  <p className="mt-1 font-semibold text-indigo-700">{formatCurrency(settlementAmount)}</p>
                                </div>
                              </div>
                              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                                <div className={`h-full ${progress >= 100 ? 'bg-green-500' : progress >= 80 ? 'bg-red-500' : 'bg-blue-500'}`} style={{ width: `${Math.min(progress, 100)}%` }} />
                              </div>
                              <div className="mt-3 flex justify-end">
                                <Button size="sm" variant="outline" onClick={() => openSettleHistory(item)}>
                                  <FileText className="w-3 h-3 mr-1" />历史
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="hidden overflow-x-auto md:block">
                        <Table className="zebra-table min-w-[980px]">
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
                          const settlementPrice = parseFloat(item.limit_price || item.contract_price || '0') || 0;
                          const progress = budgetQty > 0 ? (settlementQty / budgetQty) * 100 : 0;
                          const settlementAmount = settlementQty * settlementPrice;
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
                              <TableCell className="text-right">{item.limit_price || item.contract_price || '-'}</TableCell>
                              <TableCell className="text-right font-bold text-[#165DFF]">{formatCurrency(settlementAmount)}</TableCell>
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
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-8 text-gray-500">暂无数据</div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* 内部附加清单标签页 */}
            <TabsContent value="addons" className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-lg font-semibold">内部附加清单</h3>
                  <p className="text-sm text-gray-500 mt-1">维护对下结算中的内部附加成本，只参与金额分析，不参与工程量差异对比</p>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
                  <Button variant="outline" onClick={() => openTemplateDialog()} className="w-full sm:w-auto">
                    <Plus className="w-4 h-4 mr-2" />新增公司模板
                  </Button>
                  <Button variant="outline" onClick={handleImportAddonTemplates} disabled={addonSaving || addonTemplates.length === 0} className="w-full sm:w-auto">
                    <Copy className="w-4 h-4 mr-2" />从模板导入
                  </Button>
                  <Button onClick={() => openProjectAddonDialog()} className="w-full bg-[#165DFF] hover:bg-[#144a96] sm:w-auto">
                    <Plus className="w-4 h-4 mr-2" />新增项目清单
                  </Button>
                  <Button variant="outline" onClick={() => { fetchAddonTemplates(); fetchProjectAddons(); }} disabled={addonLoading} className="w-full sm:w-auto">
                    <RefreshCw className={`w-4 h-4 mr-2 ${addonLoading ? 'animate-spin' : ''}`} />刷新
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
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
                  <CardContent className="p-3 sm:pt-6 space-y-4">
                    <div>
                      <h4 className="font-semibold">公司通用模板</h4>
                      <p className="text-sm text-gray-500 mt-1">常用内部附加项，可导入到每个项目后单独调整项目单价</p>
                    </div>
                    {addonTemplates.length > 0 ? (
                      <div className="space-y-3 md:hidden">
                        {addonTemplates.map(template => (
                          <div key={template.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-slate-900">{template.name}</p>
                                <p className="mt-1 text-xs text-slate-500">单位：{template.unit || '-'}</p>
                              </div>
                              <p className="shrink-0 text-sm font-semibold text-[#165DFF]">{formatCurrency(parseFloat(template.default_price || '0') || 0)}</p>
                            </div>
                            {template.remark && <p className="mt-2 line-clamp-2 text-xs text-slate-500">{template.remark}</p>}
                            <div className="mt-3 flex justify-end gap-2">
                              <Button size="sm" variant="outline" onClick={() => openTemplateDialog(template)}>
                                <Pencil className="w-3 h-3 mr-1" />编辑
                              </Button>
                              <Button size="sm" variant="outline" className="text-red-600 hover:text-red-700" onClick={() => handleDeleteTemplate(template.id)}>
                                <Trash2 className="w-3 h-3 mr-1" />删除
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-sm text-gray-500 md:hidden">暂无公司通用模板</div>
                    )}
                    <div className="hidden overflow-x-auto md:block">
                      <Table className="zebra-table min-w-[720px]">
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
                                  <Button size="sm" variant="ghost" onClick={() => openTemplateDialog(template)} aria-label="编辑">
                                    <Pencil className="w-3 h-3" />
                                  </Button>
                                  <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700" onClick={() => handleDeleteTemplate(template.id)} aria-label="删除">
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
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-3 sm:pt-6 space-y-4">
                    <div>
                      <h4 className="font-semibold">当前项目清单</h4>
                      <p className="text-sm text-gray-500 mt-1">这里的项目单价用于月度对下结算和差异金额分析</p>
                    </div>
                    {projectAddons.length > 0 ? (
                      <div className="space-y-3 md:hidden">
                        {projectAddons.map(addon => (
                          <div key={addon.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-slate-900">{addon.name}</p>
                                <p className="mt-1 text-xs text-slate-500">单位：{addon.unit || '-'}</p>
                              </div>
                              <p className="shrink-0 text-sm font-semibold text-orange-600">{formatCurrency(parseFloat(addon.total_amount || '0') || 0)}</p>
                            </div>
                            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                              <div className="rounded-lg bg-slate-50 px-2 py-2">
                                <p className="text-slate-500">项目单价</p>
                                <p className="mt-1 font-semibold text-slate-800">{formatCurrency(parseFloat(addon.unit_price || '0') || 0)}</p>
                              </div>
                              <div className="rounded-lg bg-blue-50 px-2 py-2">
                                <p className="text-blue-600">累计数量</p>
                                <p className="mt-1 font-semibold text-blue-700">{(parseFloat(addon.total_quantity || '0') || 0).toFixed(2)}</p>
                              </div>
                            </div>
                            {addon.remark && <p className="mt-2 line-clamp-2 text-xs text-slate-500">{addon.remark}</p>}
                            <div className="mt-3 flex justify-end gap-2">
                              <Button size="sm" variant="outline" onClick={() => openProjectAddonDialog(addon)}>
                                <Pencil className="w-3 h-3 mr-1" />编辑
                              </Button>
                              <Button size="sm" variant="outline" className="text-red-600 hover:text-red-700" onClick={() => handleDeleteProjectAddon(addon.id)}>
                                <Trash2 className="w-3 h-3 mr-1" />删除
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-sm text-gray-500 md:hidden">暂无项目内部附加清单，可从公司模板导入或手动新增</div>
                    )}
                    <div className="hidden overflow-x-auto md:block">
                      <Table className="zebra-table min-w-[820px]">
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
                                  <Button size="sm" variant="ghost" onClick={() => openProjectAddonDialog(addon)} aria-label="编辑">
                                    <Pencil className="w-3 h-3" />
                                  </Button>
                                  <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700" onClick={() => handleDeleteProjectAddon(addon.id)} aria-label="删除">
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
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* 差异分析标签页 */}
            <TabsContent value="difference" className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-lg font-semibold">差异分析</h3>
                  <p className="text-sm text-gray-500 mt-1">按预算工程量统一维度，对比对上报量与对下结算；内部附加清单只参与金额差异，不参与工程量差异</p>
                </div>
                <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:items-center">
                  <Select value={analysisYearMonth} onValueChange={setAnalysisYearMonth}>
                    <SelectTrigger className="w-full sm:w-36">
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

              <div className="grid grid-cols-2 gap-3 lg:grid-cols-5 lg:gap-4">
                <Card className="border-blue-200 bg-blue-50">
                  <CardContent className="py-3">
                    <p className="text-sm text-blue-600">预算总金额</p>
                    <p className="text-lg font-bold text-blue-700 mt-1">{formatCurrency(projectComparisonSummary.budgetAmount)}</p>
                  </CardContent>
                </Card>
                <Card className="border-emerald-200 bg-emerald-50">
                  <CardContent className="py-3">
                    <p className="text-sm text-emerald-600">对上累计报量</p>
                    <p className="text-lg font-bold text-emerald-700 mt-1">{formatCurrency(projectComparisonSummary.reportAmount)}</p>
                    <p className="mt-1 text-xs text-emerald-700/70">完成 {formatPercent(projectComparisonSummary.reportProgress)}</p>
                  </CardContent>
                </Card>
                <Card className="border-amber-200 bg-amber-50">
                  <CardContent className="py-3">
                    <p className="text-sm text-amber-600">对下累计结算</p>
                    <p className="text-lg font-bold text-amber-700 mt-1">{formatCurrency(projectComparisonSummary.settlementAmount)}</p>
                    <p className="mt-1 text-xs text-amber-700/70">占预算 {formatPercent(projectComparisonSummary.settlementProgress)}</p>
                  </CardContent>
                </Card>
                <Card className={projectComparisonSummary.amountGap < 0 ? 'border-red-200 bg-red-50' : 'border-purple-200 bg-purple-50'}>
                  <CardContent className="py-3">
                    <p className={projectComparisonSummary.amountGap < 0 ? 'text-sm text-red-600' : 'text-sm text-purple-600'}>对上对下差额</p>
                    <p className={projectComparisonSummary.amountGap < 0 ? 'text-lg font-bold text-red-700 mt-1' : 'text-lg font-bold text-purple-700 mt-1'}>
                      {formatCurrency(projectComparisonSummary.amountGap)}
                    </p>
                    <p className={projectComparisonSummary.amountGap < 0 ? 'mt-1 text-xs text-red-700/70' : 'mt-1 text-xs text-purple-700/70'}>
                      对上累计 - 对下累计
                    </p>
                  </CardContent>
                </Card>
                <Card className={projectComparisonSummary.riskCount > 0 ? 'border-orange-200 bg-orange-50' : 'border-gray-200 bg-gray-50'}>
                  <CardContent className="py-3">
                    <p className={projectComparisonSummary.riskCount > 0 ? 'text-sm text-orange-600' : 'text-sm text-gray-600'}>风险提醒项</p>
                    <p className={projectComparisonSummary.riskCount > 0 ? 'text-lg font-bold text-orange-700 mt-1' : 'text-lg font-bold text-gray-700 mt-1'}>
                      {projectComparisonSummary.riskCount}
                    </p>
                    <p className="mt-1 text-xs text-orange-700/70">按清单项统计</p>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-[1.25fr_0.75fr] gap-4">
                <Card>
                  <CardContent className="p-3 sm:pt-6">
                    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h4 className="font-semibold text-gray-900">项目整体汇总对比</h4>
                        <p className="mt-1 text-sm text-gray-500">先看项目总盘子，再下钻到清单项定位问题</p>
                      </div>
                      <Badge variant={projectComparisonSummary.amountGap < 0 ? 'destructive' : 'outline'}>
                        {projectComparisonSummary.amountGap < 0 ? '需要关注' : '整体正常'}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                        <p className="text-xs text-gray-500">对上剩余未报</p>
                        <p className={projectComparisonSummary.reportRemainingAmount < 0 ? 'mt-1 text-base font-semibold text-red-600' : 'mt-1 text-base font-semibold text-gray-900'}>
                          {formatCurrency(projectComparisonSummary.reportRemainingAmount)}
                        </p>
                      </div>
                      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                        <p className="text-xs text-gray-500">对下剩余未结</p>
                        <p className={projectComparisonSummary.settlementRemainingAmount < 0 ? 'mt-1 text-base font-semibold text-red-600' : 'mt-1 text-base font-semibold text-gray-900'}>
                          {formatCurrency(projectComparisonSummary.settlementRemainingAmount)}
                        </p>
                      </div>
                      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                        <p className="text-xs text-gray-500">本月对上金额</p>
                        <p className="mt-1 text-base font-semibold text-blue-700">{formatCurrency(analysisStats.monthlyReportAmount)}</p>
                      </div>
                      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                        <p className="text-xs text-gray-500">本月对下金额</p>
                        <p className="mt-1 text-base font-semibold text-emerald-700">{formatCurrency(analysisStats.monthlySettlementAmount)}</p>
                      </div>
                      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                        <p className="text-xs text-gray-500">本月金额差异</p>
                        <p className={analysisStats.monthlyAmountGap < 0 ? 'mt-1 text-base font-semibold text-red-600' : 'mt-1 text-base font-semibold text-gray-900'}>
                          {formatCurrency(analysisStats.monthlyAmountGap)}
                        </p>
                      </div>
                      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                        <p className="text-xs text-gray-500">内部附加成本</p>
                        <p className="mt-1 text-base font-semibold text-orange-700">{formatCurrency(projectComparisonSummary.addonAmount)}</p>
                        <p className="mt-1 text-xs text-gray-500">{projectComparisonSummary.addonItems} 项</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className={projectComparisonSummary.riskCount > 0 ? 'border-orange-200' : ''}>
                  <CardContent className="p-3 sm:pt-6">
                    <div className="mb-4">
                      <h4 className="font-semibold text-gray-900">风险提醒</h4>
                      <p className="mt-1 text-sm text-gray-500">只做提醒，帮助预算员优先核查</p>
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between rounded-lg border border-red-100 bg-red-50 px-3 py-2">
                        <span className="text-sm text-red-700">对下超结</span>
                        <span className="font-semibold text-red-700">{projectComparisonSummary.overSettledItems} 项</span>
                      </div>
                      <div className="flex items-center justify-between rounded-lg border border-orange-100 bg-orange-50 px-3 py-2">
                        <span className="text-sm text-orange-700">对下金额大于对上报量</span>
                        <span className="font-semibold text-orange-700">{projectComparisonSummary.amountInvertedItems} 项</span>
                      </div>
                      <div className="flex items-center justify-between rounded-lg border border-amber-100 bg-amber-50 px-3 py-2">
                        <span className="text-sm text-amber-700">接近完工仍有较大未报量</span>
                        <span className="font-semibold text-amber-700">{projectComparisonSummary.possibleMissedReportItems} 项</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                  <CardContent className="p-3 sm:pt-6">
                  <div className="mb-4">
                    <h4 className="font-semibold text-gray-900">清单项下钻明细</h4>
                    <p className="mt-1 text-sm text-gray-500">预算清单参与工程量和金额对比，内部附加清单只参与金额差异</p>
                  </div>
                  {analysisStats.rows.length > 0 ? (
                    <>
                    <div className="hidden overflow-x-auto md:block">
                      <Table className="zebra-table min-w-[1320px]">
                        <TableHeader>
                          <TableRow className="bg-[#E8F3FF] hover:bg-[#E8F3FF]">
                            <TableHead>清单名称</TableHead>
                            <TableHead>类型</TableHead>
                            <TableHead>单位</TableHead>
                            <TableHead className="text-right">预算量</TableHead>
                            <TableHead className="text-right">预算金额</TableHead>
                            <TableHead className="text-right">本月对上</TableHead>
                            <TableHead className="text-right">进度应报</TableHead>
                            <TableHead className="text-right">报量偏差</TableHead>
                            <TableHead className="text-right">本月对下</TableHead>
                            <TableHead className="text-right">累计对上</TableHead>
                            <TableHead className="text-right">累计对下</TableHead>
                            <TableHead className="text-right">对上剩余</TableHead>
                            <TableHead className="text-right">对下剩余</TableHead>
                            <TableHead className="text-right">金额差</TableHead>
                            <TableHead>提醒</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {analysisStats.rows.map((row, index) => (
                            <TableRow key={row.id} className={`${row.risks.length > 0 ? 'bg-orange-50/70' : index % 2 === 1 ? 'bg-[#F8FAFC]' : ''} hover:bg-[#F0F7FF]`}>
                              <TableCell className="font-medium">
                                <span className="line-clamp-2">{row.subitem_name}</span>
                              </TableCell>
                              <TableCell>
                                {row.isAddon ? (
                                  <Badge variant="outline" className="border-orange-200 bg-orange-50 text-orange-700">内部附加</Badge>
                                ) : (
                                  <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">预算清单</Badge>
                                )}
                              </TableCell>
                              <TableCell>{row.unit}</TableCell>
                              <TableCell className="text-right">{row.isAddon ? '-' : formatQuantity(row.budgetQty)}</TableCell>
                              <TableCell className="text-right">{row.isAddon ? '-' : formatCurrency(row.budgetQty * row.contractPrice)}</TableCell>
                              <TableCell className="text-right text-blue-600">{row.isAddon ? '-' : formatQuantity(row.monthlyReportedQty)}</TableCell>
                              <TableCell className="text-right text-indigo-600">{row.isAddon ? '-' : formatQuantity(row.progressExpectedQty)}</TableCell>
                              <TableCell className={row.reportVsProgressGap < 0 ? 'text-right font-semibold text-red-600' : 'text-right font-semibold text-slate-700'}>
                                {row.isAddon ? '-' : formatQuantity(row.reportVsProgressGap)}
                              </TableCell>
                              <TableCell className="text-right text-emerald-600">{formatQuantity(row.monthlySettledQty)}</TableCell>
                              <TableCell className="text-right font-medium">{row.isAddon ? '-' : formatQuantity(row.totalReportedQty)}</TableCell>
                              <TableCell className="text-right font-medium">{formatQuantity(row.totalSettledQty)}</TableCell>
                              <TableCell className={row.reportRemainingQty < 0 ? 'text-right font-semibold text-red-600' : 'text-right text-gray-700'}>
                                {row.isAddon ? '-' : formatQuantity(row.reportRemainingQty)}
                              </TableCell>
                              <TableCell className={row.settleRemainingQty < 0 ? 'text-right font-semibold text-red-600' : 'text-right text-gray-700'}>
                                {row.isAddon ? '-' : formatQuantity(row.settleRemainingQty)}
                              </TableCell>
                              <TableCell className={row.amountGap < 0 ? 'text-right font-semibold text-red-600' : 'text-right font-semibold text-[#165DFF]'}>
                                {formatCurrency(row.amountGap)}
                              </TableCell>
                              <TableCell>
                                {row.risks.length > 0 ? (
                                  <div className="flex min-w-40 flex-wrap gap-1">
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
                    </div>
                    <div className="space-y-3 md:hidden">
                      {analysisStats.rows.map(row => (
                        <article
                          key={row.id}
                          className={`rounded-lg border p-3 ${row.risks.length > 0 ? 'border-orange-200 bg-orange-50/50' : 'border-gray-200 bg-white'}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="line-clamp-2 text-sm font-semibold text-gray-900">{row.subitem_name}</p>
                              <p className="mt-1 text-xs text-gray-500">{row.unit || '-'}</p>
                            </div>
                            {row.isAddon ? (
                              <Badge variant="outline" className="shrink-0 border-orange-200 bg-orange-50 text-orange-700">内部附加</Badge>
                            ) : (
                              <Badge variant="outline" className="shrink-0 border-blue-200 bg-blue-50 text-blue-700">预算清单</Badge>
                            )}
                          </div>

                          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                            <div className="rounded-md bg-gray-50 p-2">
                              <p className="text-gray-500">预算量</p>
                              <p className="mt-1 font-semibold text-gray-900">{row.isAddon ? '-' : formatQuantity(row.budgetQty)}</p>
                            </div>
                            <div className="rounded-md bg-gray-50 p-2">
                              <p className="text-gray-500">预算金额</p>
                              <p className="mt-1 font-semibold text-gray-900">{row.isAddon ? '-' : formatCurrency(row.budgetQty * row.contractPrice)}</p>
                            </div>
                            <div className="rounded-md bg-blue-50 p-2">
                              <p className="text-blue-600">本月对上</p>
                              <p className="mt-1 font-semibold text-blue-700">{row.isAddon ? '-' : formatQuantity(row.monthlyReportedQty)}</p>
                            </div>
                            <div className="rounded-md bg-indigo-50 p-2">
                              <p className="text-indigo-600">进度应报</p>
                              <p className="mt-1 font-semibold text-indigo-700">{row.isAddon ? '-' : formatQuantity(row.progressExpectedQty)}</p>
                            </div>
                            <div className="rounded-md bg-slate-50 p-2">
                              <p className="text-slate-500">报量偏差</p>
                              <p className={row.reportVsProgressGap < 0 ? 'mt-1 font-semibold text-red-600' : 'mt-1 font-semibold text-slate-900'}>
                                {row.isAddon ? '-' : formatQuantity(row.reportVsProgressGap)}
                              </p>
                            </div>
                            <div className="rounded-md bg-emerald-50 p-2">
                              <p className="text-emerald-600">本月对下</p>
                              <p className="mt-1 font-semibold text-emerald-700">{formatQuantity(row.monthlySettledQty)}</p>
                            </div>
                            <div className="rounded-md bg-blue-50/70 p-2">
                              <p className="text-blue-600">累计对上</p>
                              <p className="mt-1 font-semibold text-blue-700">{row.isAddon ? '-' : formatQuantity(row.totalReportedQty)}</p>
                            </div>
                            <div className="rounded-md bg-emerald-50/70 p-2">
                              <p className="text-emerald-600">累计对下</p>
                              <p className="mt-1 font-semibold text-emerald-700">{formatQuantity(row.totalSettledQty)}</p>
                            </div>
                            <div className="rounded-md bg-gray-50 p-2">
                              <p className="text-gray-500">对上剩余</p>
                              <p className={row.reportRemainingQty < 0 ? 'mt-1 font-semibold text-red-600' : 'mt-1 font-semibold text-gray-900'}>
                                {row.isAddon ? '-' : formatQuantity(row.reportRemainingQty)}
                              </p>
                            </div>
                            <div className="rounded-md bg-gray-50 p-2">
                              <p className="text-gray-500">对下剩余</p>
                              <p className={row.settleRemainingQty < 0 ? 'mt-1 font-semibold text-red-600' : 'mt-1 font-semibold text-gray-900'}>
                                {row.isAddon ? '-' : formatQuantity(row.settleRemainingQty)}
                              </p>
                            </div>
                          </div>

                          <div className="mt-3 flex items-center justify-between rounded-md border bg-white px-3 py-2 text-sm">
                            <span className="text-gray-500">金额差额</span>
                            <span className={row.amountGap < 0 ? 'font-semibold text-red-600' : 'font-semibold text-[#165DFF]'}>
                              {formatCurrency(row.amountGap)}
                            </span>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-1">
                            {row.risks.length > 0 ? (
                              row.risks.map(risk => (
                                <Badge key={risk} variant="outline" className="border-orange-200 bg-orange-100 text-orange-700">{risk}</Badge>
                              ))
                            ) : (
                              <span className="text-xs text-gray-400">正常</span>
                            )}
                          </div>
                        </article>
                      ))}
                    </div>
                    </>
                  ) : (
                    <div className="text-center py-8 text-gray-500">暂无数据</div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* P0-1 勾稽台账：报量 vs 结算 vs 回款 月度结转 */}
            <TabsContent value="reconciliation" className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-lg font-semibold">报量-结算-回款勾稽台账</h3>
                  <p className="text-sm text-gray-500 mt-1">按月结转：分项级「对上报量 vs 对下结算」＋ 项目级「甲方回款」；累计报量 − 累计回款 = 应收未收空间</p>
                </div>
                <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:items-center">
                  <Select value={reconYearMonth} onValueChange={setReconYearMonth}>
                    <SelectTrigger className="w-full sm:w-36">
                      <SelectValue placeholder="选择月份" />
                    </SelectTrigger>
                    <SelectContent>
                      {getMonthsList().map(month => (
                        <SelectItem key={month} value={month}>{month}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" onClick={() => fetchReconciliation()} disabled={reconLoading}>
                    <RefreshCw className={`w-4 h-4 mr-2 ${reconLoading ? 'animate-spin' : ''}`} />刷新
                  </Button>
                </div>
              </div>

              {reconLoading && !reconData ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-6 lg:gap-4">
                    {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
                  </div>
                  <Skeleton className="h-64 rounded-xl" />
                </div>
              ) : reconData && reconData.summary ? (
                <>
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-6 lg:gap-4">
                    <Card className="border-blue-200 bg-blue-50">
                      <CardContent className="py-3">
                        <p className="text-sm text-blue-600">本月报量金额</p>
                        <p className="text-lg font-bold text-blue-700 mt-1">{formatCurrency(reconData.summary.month_report_amount)}</p>
                        <p className="mt-1 text-xs text-blue-700/70">{reconYearMonth}</p>
                      </CardContent>
                    </Card>
                    <Card className="border-amber-200 bg-amber-50">
                      <CardContent className="py-3">
                        <p className="text-sm text-amber-600">本月结算金额</p>
                        <p className="text-lg font-bold text-amber-700 mt-1">{formatCurrency(reconData.summary.month_settlement_amount)}</p>
                        <p className="mt-1 text-xs text-amber-700/70">{reconYearMonth}</p>
                      </CardContent>
                    </Card>
                    <Card className="border-emerald-200 bg-emerald-50">
                      <CardContent className="py-3">
                        <p className="text-sm text-emerald-600">本月回款</p>
                        <p className="text-lg font-bold text-emerald-700 mt-1">{formatCurrency(reconData.summary.month_payment_amount)}</p>
                        <p className="mt-1 text-xs text-emerald-700/70">{reconYearMonth}</p>
                      </CardContent>
                    </Card>
                    <Card className={reconData.summary.month_difference < 0 ? 'border-red-200 bg-red-50' : 'border-purple-200 bg-purple-50'}>
                      <CardContent className="py-3">
                        <p className={reconData.summary.month_difference < 0 ? 'text-sm text-red-600' : 'text-sm text-purple-600'}>本月对上对下差额</p>
                        <p className={reconData.summary.month_difference < 0 ? 'text-lg font-bold text-red-700 mt-1' : 'text-lg font-bold text-purple-700 mt-1'}>
                          {formatCurrency(reconData.summary.month_difference)}
                        </p>
                        <p className={reconData.summary.month_difference < 0 ? 'mt-1 text-xs text-red-700/70' : 'mt-1 text-xs text-purple-700/70'}>报量 − 结算</p>
                      </CardContent>
                    </Card>
                    <Card className="border-slate-200 bg-slate-50">
                      <CardContent className="py-3">
                        <p className="text-sm text-slate-600">累计回款</p>
                        <p className="text-lg font-bold text-slate-800 mt-1">{formatCurrency(reconData.summary.cumulative_payment_amount)}</p>
                        <p className="mt-1 text-xs text-slate-500">截止 {reconYearMonth}</p>
                      </CardContent>
                    </Card>
                    <Card className={reconData.summary.receivable_amount > 0 ? 'border-orange-200 bg-orange-50' : 'border-emerald-200 bg-emerald-50'}>
                      <CardContent className="py-3">
                        <p className={reconData.summary.receivable_amount > 0 ? 'text-sm text-orange-600' : 'text-sm text-emerald-600'}>
                          {reconData.summary.receivable_amount > 0 ? '应收未回款' : '超收/预收'}
                        </p>
                        <p className={reconData.summary.receivable_amount > 0 ? 'text-lg font-bold text-orange-700 mt-1' : 'text-lg font-bold text-emerald-700 mt-1'}>
                          {formatCurrency(Math.abs(reconData.summary.receivable_amount))}
                        </p>
                        <p className={reconData.summary.receivable_amount > 0 ? 'mt-1 text-xs text-orange-700/70' : 'mt-1 text-xs text-emerald-700/70'}>累计报量 − 累计回款</p>
                      </CardContent>
                    </Card>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-gray-500">风险标记：</span>
                    <Badge variant={reconData.summary.over_budget_count > 0 ? 'destructive' : 'outline'}>
                      累计报量超预算 {reconData.summary.over_budget_count} 项
                    </Badge>
                    <Badge variant={reconData.summary.settlement_over_report_count > 0 ? 'destructive' : 'outline'}>
                      少报多结 {reconData.summary.settlement_over_report_count} 项
                    </Badge>
                    <Badge variant={reconData.summary.ratio_warning_count > 0 ? 'destructive' : 'outline'}>
                      差异超30% {reconData.summary.ratio_warning_count} 项
                    </Badge>
                  </div>

                  <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                    <div className="overflow-x-auto">
                      <Table className="min-w-max">
                        <TableHeader>
                          <TableRow className="bg-slate-50">
                            <TableHead className="whitespace-nowrap">分项</TableHead>
                            <TableHead className="whitespace-nowrap text-right">预算量</TableHead>
                            <TableHead className="whitespace-nowrap text-right">合同单价</TableHead>
                            <TableHead className="whitespace-nowrap text-center text-blue-600">本月报量（数量 / 金额）</TableHead>
                            <TableHead className="whitespace-nowrap text-center text-blue-600">累计报量（数量 / 金额）</TableHead>
                            <TableHead className="whitespace-nowrap text-center text-amber-600">本月结算（数量 / 金额）</TableHead>
                            <TableHead className="whitespace-nowrap text-center text-amber-600">累计结算（数量 / 金额）</TableHead>
                            <TableHead className="whitespace-nowrap text-center text-purple-600">本月差异（金额 / 率）</TableHead>
                            <TableHead className="whitespace-nowrap">标记</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {reconData.rows.map((row: any) => (
                            <TableRow key={row.subitem_id}>
                              <TableCell className="font-medium whitespace-nowrap">
                                {row.subitem_name}
                                <span className="ml-1 text-xs text-gray-400">{row.unit || ''}</span>
                              </TableCell>
                              <TableCell className="text-right whitespace-nowrap">{formatQuantity(row.budget_quantity)}</TableCell>
                              <TableCell className="text-right whitespace-nowrap">{formatCurrency(row.contract_price)}</TableCell>
                              <TableCell className="text-right whitespace-nowrap">
                                <div className="text-blue-700">{formatQuantity(row.month_report_quantity)}</div>
                                <div className="text-xs text-gray-400">{formatCurrency(row.month_report_amount)}</div>
                              </TableCell>
                              <TableCell className="text-right whitespace-nowrap">
                                <div className="text-blue-700">{formatQuantity(row.cumulative_report_quantity)}</div>
                                <div className="text-xs text-gray-400">{formatCurrency(row.cumulative_report_amount)}</div>
                              </TableCell>
                              <TableCell className="text-right whitespace-nowrap">
                                <div className="text-amber-700">{formatQuantity(row.month_settlement_quantity)}</div>
                                <div className="text-xs text-gray-400">{formatCurrency(row.month_settlement_amount)}</div>
                              </TableCell>
                              <TableCell className="text-right whitespace-nowrap">
                                <div className="text-amber-700">{formatQuantity(row.cumulative_settlement_quantity)}</div>
                                <div className="text-xs text-gray-400">{formatCurrency(row.cumulative_settlement_amount)}</div>
                              </TableCell>
                              <TableCell className="text-right whitespace-nowrap">
                                <div className={row.month_difference < 0 ? 'text-red-600 font-medium' : 'text-purple-700'}>
                                  {formatCurrency(row.month_difference)}
                                </div>
                                <div className="text-xs text-gray-400">
                                  {row.difference_ratio !== null && row.difference_ratio !== undefined ? formatPercent(row.difference_ratio) : '-'}
                                </div>
                              </TableCell>
                              <TableCell className="whitespace-nowrap">
                                <div className="flex flex-wrap gap-1">
                                  {row.over_budget && <Badge variant="destructive">超预算</Badge>}
                                  {row.settlement_over_report && <Badge variant="destructive">少报多结</Badge>}
                                  {row.ratio_warning && <Badge variant="outline" className="border-orange-200 bg-orange-100 text-orange-700">差异较大</Badge>}
                                  {!row.over_budget && !row.settlement_over_report && !row.ratio_warning && (
                                    <span className="text-xs text-gray-400">正常</span>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>

                  <p className="text-xs text-gray-400">
                    口径：报量金额 = 对上报量 × 合同单价；结算金额 = 对下结算量 × 实际结算单价（未填退回限价/合同价）；回款为项目级（client_payments），不分配到分项；应收 = 累计报量 − 累计回款。
                  </p>
                </>
              ) : (
                <div className="text-center py-10 text-gray-500">请选择项目与月份查看勾稽台账</div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>
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
