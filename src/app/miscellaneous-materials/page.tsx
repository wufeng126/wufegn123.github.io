'use client';
import { useToast } from '@/hooks/use-toast';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
  Plus, Pencil, Trash2, Search, Download, Upload, ChevronLeft, ChevronRight, ChevronDown,
  Package, Loader2, Camera, Mic, Sparkles,
  CheckCircle2, Ban
} from 'lucide-react';
import {
  MISC_MATERIAL_CATEGORIES,
  MISC_MATERIAL_SUBCATEGORY_MAP,
  guessMiscCategory,
  isValidSubcategory,
  shouldSuggestLargeMachinery,
  type MiscMaterialCategory,
} from '@/lib/misc-material-categories';

type MaterialStatus = 'draft' | 'reviewed' | 'voided';

const CATEGORY_OPTIONS: string[] = [...MISC_MATERIAL_CATEGORIES];

// 分类配色（圆点 + 浅底）
const CATEGORY_STYLES: Record<string, { dot: string; bg: string; color: string }> = {
  '五金电料': { dot: '#165DFF', bg: '#F5EDFF', color: '#531DAB' },
  '电线电气': { dot: '#165DFF', bg: '#E8F3FF', color: '#0E42D2' },
  '水暖管件': { dot: '#0FC6C2', bg: '#E8FFFB', color: '#0B8A87' },
  '焊接耗材': { dot: '#F77234', bg: '#FFF3E8', color: '#C45418' },
  '劳保安全': { dot: '#00B42A', bg: '#E8FFEA', color: '#008A39' },
  '油料化工': { dot: '#D4A017', bg: '#FFF9E0', color: '#8A6D0B' },
  '周转辅材': { dot: '#8D6E4A', bg: '#F5EDE3', color: '#6B4F2F' },
  '其他材料': { dot: '#A9AEB8', bg: '#F7F8FA', color: '#6B7280' },
  '大型机具': { dot: '#F53F3F', bg: '#FFECE8', color: '#CB272D' },
  '小型工具': { dot: '#86909C', bg: '#F2F3F5', color: '#4E5969' },
  '运费': { dot: '#0E7FA8', bg: '#E3F4FB', color: '#0A5F80' },
  '施工杂费': { dot: '#D9735B', bg: '#FDEEE9', color: '#A84E38' },
};

function categoryStyle(cat: string | null | undefined) {
  const key = cat || '其他材料';
  return CATEGORY_STYLES[key] || CATEGORY_STYLES['其他材料'];
}

function CategoryBadge({ category, subcategory }: { category: string | null | undefined; subcategory?: string | null }) {
  const cat = category || '其他材料';
  const s = categoryStyle(cat);
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ backgroundColor: s.bg, color: s.color }}
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: s.dot }} />
      {cat}
      {subcategory && <span className="opacity-70">/{subcategory}</span>}
    </span>
  );
}

const statusMeta: Record<MaterialStatus, { label: string; color: string; background: string }> = {
  draft: { label: '草稿', color: '#D46B08', background: '#FFF7E8' },
  reviewed: { label: '已审核', color: '#008A39', background: '#E8FFEA' },
  voided: { label: '已作废', color: '#86909C', background: '#F2F3F5' },
};

// 类型定义
interface MiscMaterial {
  id: number;
  project_id: number;
  material_name: string;
  specification: string | null;
  unit: string | null;
  quantity: string;
  unit_price: string;
  total_price: string;
  purchase_date: string;
  supplier: string | null;
  remark: string | null;
  status: MaterialStatus;
  category?: string | null;
  subcategory?: string | null;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  created_at: string;
  projects: { name: string } | null;
}

interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

interface Stats {
  totalCount: number;
  totalAmount: number;
  reviewedCount: number;
  reviewedAmount: number;
  draftCount: number;
  draftAmount: number;
  voidedCount: number;
  voidedAmount: number;
  projectStats: Record<string, number>;
  categoryStats?: Record<string, { count: number; amount: number }>;
  subcategoryStats?: Record<string, { count: number; amount: number }>;
}

type AssistMode = 'image' | 'voice' | 'text';

interface RecognitionDraft {
  project_id?: string;
  material_name?: string;
  category?: string;
  subcategory?: string | null;
  specification?: string;
  unit?: string;
  quantity?: string;
  unit_price?: string;
  purchase_date?: string;
  supplier?: string;
  remark?: string;
  warnings?: string[];
}

interface SpeechRecognitionAlternative {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  [index: number]: SpeechRecognitionAlternative | undefined;
}

interface SpeechRecognitionEventLike {
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  start: () => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function getClientErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function MiscMaterialsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64"><div className="text-center" style={{ color: 'var(--color-text-3)' }}>加载中...</div></div>}>
      <MiscMaterialsContent />
    </Suspense>
  );
}

function MiscMaterialsContent() {
  const searchParams = useSearchParams();
  const { toast } = useToast();
  
  const [materials, setMaterials] = useState<MiscMaterial[]>([]);
  const [projects, setProjects] = useState<Array<{ id: number; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 20, total: 0, totalPages: 0 });
  const [stats, setStats] = useState<Stats>({
    totalCount: 0,
    totalAmount: 0,
    reviewedCount: 0,
    reviewedAmount: 0,
    draftCount: 0,
    draftAmount: 0,
    voidedCount: 0,
    voidedAmount: 0,
    projectStats: {},
    categoryStats: {},
    subcategoryStats: {},
  });
  
  // 筛选条件
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all');
  const [materialName, setMaterialName] = useState('');
  const [specification, setSpecification] = useState('');
  const [purchaser, setPurchaser] = useState('');
  const [status, setStatus] = useState<'all' | MaterialStatus>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>('all');
  // 分类统计卡下钻展开的一级分类
  const [expandedStatCategory, setExpandedStatCategory] = useState<string | null>(null);
  // 看板统计（不随分类/子类/状态筛选变化，保证下钻面板数据完整）
  const [boardStats, setBoardStats] = useState<{
    categoryStats?: Record<string, { count: number; amount: number }>;
    subcategoryStats?: Record<string, { count: number; amount: number }>;
  }>({});
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  // 对话框状态
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [assistDialogOpen, setAssistDialogOpen] = useState(false);
  const [currentMaterial, setCurrentMaterial] = useState<MiscMaterial | null>(null);
  const [saving, setSaving] = useState(false);
  const [statusUpdatingId, setStatusUpdatingId] = useState<number | null>(null);
  const [recognizing, setRecognizing] = useState(false);
  const [aiClassifying, setAiClassifying] = useState(false);
  const [listening, setListening] = useState(false);
  
  // 导入相关
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{success: number; failed: number; errors: string[]} | null>(null);

  // 智能录入
  const [assistMode, setAssistMode] = useState<AssistMode>('image');
  const [assistFile, setAssistFile] = useState<File | null>(null);
  const [assistText, setAssistText] = useState('');
  const [assistRawText, setAssistRawText] = useState('');
  const [assistWarnings, setAssistWarnings] = useState<string[]>([]);
  
  // 表单
  const [form, setForm] = useState({
    project_id: '',
    material_name: '',
    category: '' as MiscMaterialCategory | '',
    subcategory: '',
    specification: '',
    unit: '',
    quantity: '',
    unit_price: '',
    purchase_date: new Date().toISOString().split('T')[0],
    supplier: '',
    remark: '',
  });

  // 表单当前生效分类（未手动选择时按名称智能识别）与可选子类
  const formEffectiveCategory = (form.category || guessMiscCategory(form.material_name).category) as MiscMaterialCategory;
  const formSubOptions = MISC_MATERIAL_SUBCATEGORY_MAP[formEffectiveCategory] || [];

  useEffect(() => {
    // 从URL获取项目ID
    queueMicrotask(() => {
    const projectIdParam = searchParams.get('projectId');
    if (projectIdParam) {
      setSelectedProjectId(projectIdParam);
    }
    
    fetchProjects();
    fetchMaterials();
    fetchStats();
    fetchBoardStats();
    });
  }, [searchParams]);

  // 任意筛选条件变化（含项目、日期、分类/子类、状态、名称/规格/采购人）统一自动查询，
  // 明细 + 顶部金额卡片(stats) + 分类看板(boardStats) 同源同步刷新，保证"未筛选/筛选后"各卡片口径一致。
  // 首次挂载由上方 searchParams effect 负责加载，这里跳过避免重复请求。
  const isFirstFilterRun = useRef(true);
  useEffect(() => {
    if (isFirstFilterRun.current) {
      isFirstFilterRun.current = false;
      return;
    }
    const timer = setTimeout(() => {
      fetchMaterials(1);
      fetchStats();
      fetchBoardStats();
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selectedProjectId,
    startDate,
    endDate,
    selectedCategory,
    selectedSubcategory,
    status,
    materialName,
    specification,
    purchaser,
  ]);

  const buildFilterParams = (includePaging = false, page = 1) => {
    const params = new URLSearchParams();
    if (includePaging) {
      params.append('page', page.toString());
      params.append('pageSize', pagination.pageSize.toString());
    }
    if (selectedProjectId !== 'all') params.append('projectId', selectedProjectId);
    if (materialName.trim()) params.append('materialName', materialName.trim());
    if (specification.trim()) params.append('specification', specification.trim());
    if (purchaser.trim()) params.append('purchaser', purchaser.trim());
    if (status !== 'all') params.append('status', status);
    if (selectedCategory !== 'all') params.append('category', selectedCategory);
    if (selectedCategory !== 'all' && selectedSubcategory !== 'all') params.append('subcategory', selectedSubcategory);
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    return params;
  };

  // 获取项目列表
  async function fetchProjects() {
    try {
      const response = await fetch('/api/projects');
      const data = await response.json();
      setProjects(data.projects || []);
    } catch (error) {
      console.error('获取项目列表失败:', error);
    }
  };

  // 获取材料列表
  async function fetchMaterials(page: number = pagination.page) {
    try {
      setLoading(true);
      const params = buildFilterParams(true, page);
      
      const response = await fetch(`/api/miscellaneous-materials?${params}`);
      const data = await response.json();
      
      if (data.materials) {
        setMaterials(data.materials);
        setPagination(data.pagination || { page: 1, pageSize: 20, total: 0, totalPages: 0 });
      }
      if (data.stats) {
        setStats(data.stats);
      }
    } catch (error) {
      console.error('获取材料列表失败:', error);
      toast({
        title: '获取失败',
        description: '无法获取材料列表',
        variant: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  // 获取统计数据
  async function fetchStats() {
    try {
      const params = buildFilterParams();
      
      const response = await fetch(`/api/miscellaneous-materials?${params}`);
      const data = await response.json();
      if (data.stats) {
        setStats(data.stats);
      }
    } catch (error) {
      console.error('获取统计数据失败:', error);
    }
  };

  // 获取看板统计（仅项目+日期范围，不随分类/子类/状态筛选变化）
  async function fetchBoardStats() {
    try {
      const params = new URLSearchParams();
      params.append('page', '1');
      params.append('pageSize', '1');
      if (selectedProjectId !== 'all') params.append('projectId', selectedProjectId);
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      const response = await fetch(`/api/miscellaneous-materials?${params}`);
      const data = await response.json();
      if (data.stats) {
        setBoardStats({
          categoryStats: data.stats.categoryStats || {},
          subcategoryStats: data.stats.subcategoryStats || {},
        });
      }
    } catch (error) {
      console.error('获取看板统计失败:', error);
    }
  };

  // 重置表单
  const resetForm = () => {
    setForm({
      project_id: '',
      material_name: '',
      category: '',
      subcategory: '',
      specification: '',
      unit: '',
      quantity: '',
      unit_price: '',
      purchase_date: new Date().toISOString().split('T')[0],
      supplier: '',
      remark: '',
    });
  }

  const resetAssist = (mode: AssistMode) => {
    setAssistMode(mode);
    setAssistFile(null);
    setAssistText('');
    setAssistRawText('');
    setAssistWarnings([]);
  };

  const openAssistDialog = (mode: AssistMode) => {
    resetAssist(mode);
    setAssistDialogOpen(true);
  };

  const applyRecognitionDraft = (draft: RecognitionDraft) => {
    const guessed = guessMiscCategory(draft.material_name || '');
    const category = (draft.category as MiscMaterialCategory) || guessed.category;
    const subcategory =
      draft.subcategory && isValidSubcategory(category, draft.subcategory)
        ? draft.subcategory
        : (draft.category ? null : guessed.subcategory) || '';
    setForm({
      project_id: draft.project_id || (selectedProjectId !== 'all' ? selectedProjectId : ''),
      material_name: draft.material_name || '',
      category,
      subcategory: subcategory || '',
      specification: draft.specification || '',
      unit: draft.unit || '',
      quantity: draft.quantity || '',
      unit_price: draft.unit_price || '',
      purchase_date: draft.purchase_date || new Date().toISOString().split('T')[0],
      supplier: draft.supplier || '',
      remark: draft.remark || assistRawText || '',
    });
    setAssistDialogOpen(false);
    setAddDialogOpen(true);
  };

  const handleAiClassify = async () => {
    const name = form.material_name.trim();
    if (!name) {
      toast({ title: '请先输入材料名称', variant: 'error' });
      return;
    }
    try {
      setAiClassifying(true);
      const response = await fetch('/api/ai/classify-material', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const json = await response.json();
      if (!response.ok || !json.category) {
        throw new Error(json.error || '识别失败');
      }
      setForm(prev => ({
        ...prev,
        category: json.category as MiscMaterialCategory,
        subcategory: json.subcategory && isValidSubcategory(json.category, json.subcategory) ? json.subcategory : '',
      }));
      toast({
        title: `已识别为「${json.category}${json.subcategory ? `/${json.subcategory}` : ''}」`,
        description: json.source === 'ai' ? '由 AI 判断，保存前可手动调整' : '按名称关键词匹配，保存前可手动调整',
      });
    } catch (error: unknown) {
      toast({ title: '分类识别失败', description: getClientErrorMessage(error, '请手动选择分类'), variant: 'error' });
    } finally {
      setAiClassifying(false);
    }
  };

  const handleRecognizeMaterial = async () => {
    if (assistMode === 'image' && !assistFile) {
      toast({ title: '请选择照片', description: '请先拍照或上传材料票据照片', variant: 'error' });
      return;
    }
    if (assistMode === 'voice' && !assistFile && !assistText.trim()) {
      toast({ title: '请先录入语音', description: '可点击开始语音输入，或直接输入文字', variant: 'error' });
      return;
    }
    if (assistMode === 'text' && !assistText.trim()) {
      toast({ title: '请输入内容', description: '请先输入需要提炼的材料信息', variant: 'error' });
      return;
    }

    try {
      setRecognizing(true);
      setAssistWarnings([]);

      const formData = new FormData();
      formData.append('mode', assistMode);
      if (assistText.trim()) formData.append('text', assistText.trim());
      if (assistFile) formData.append('file', assistFile);

      const response = await fetch('/api/miscellaneous-materials/recognize', {
        method: 'POST',
        body: formData,
      });
      const json = await response.json();
      if (!response.ok || json.success === false) {
        throw new Error(json.error || '识别失败');
      }

      const data = json.data || {};
      const drafts: RecognitionDraft[] = Array.isArray(data.drafts) ? data.drafts : [];
      setAssistRawText(data.rawText || '');
      setAssistWarnings(Array.isArray(data.warnings) ? data.warnings : []);

      if (drafts.length === 0) {
        toast({ title: '未提炼出材料记录', description: '请调整文字后重试，或手动新增材料', variant: 'error' });
        return;
      }

      applyRecognitionDraft(drafts[0]);
      toast({
        title: '已生成材料草稿',
        description: drafts.length > 1 ? `识别到 ${drafts.length} 条，已填入第 1 条，请核对后保存` : '请核对项目、数量、单价后保存',
      });
    } catch (error: unknown) {
      toast({
        title: '识别失败',
        description: getClientErrorMessage(error, '请稍后重试，或手动录入'),
        variant: 'error',
      });
    } finally {
      setRecognizing(false);
    }
  };

  const startVoiceInput = () => {
    const recognitionWindow = window as Window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const SpeechRecognitionImpl = recognitionWindow.SpeechRecognition || recognitionWindow.webkitSpeechRecognition;
    if (!SpeechRecognitionImpl) {
      toast({
        title: '当前浏览器不支持语音输入',
        description: '可以手动输入语音内容，系统仍会自动提炼材料信息',
        variant: 'error',
      });
      return;
    }

    const recognition = new SpeechRecognitionImpl();
    recognition.lang = 'zh-CN';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onstart = () => setListening(true);
    recognition.onend = () => setListening(false);
    recognition.onerror = () => {
      setListening(false);
      toast({ title: '语音识别失败', description: '请重新录入或手动输入文字', variant: 'error' });
    };
    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      const transcript = Array.from(event.results || [])
        .map(result => result?.[0]?.transcript || '')
        .join('');
      setAssistText(prev => [prev, transcript].filter(Boolean).join('\n'));
    };
    recognition.start();
  };

  // 新增材料
  const handleAdd = async () => {
    if (!form.project_id || !form.material_name || !form.quantity || !form.unit_price) {
      toast({
        title: '请填写必填项',
        description: '项目、材料名称、数量、单价为必填项',
        variant: 'error',
      });
      return;
    }
    
    try {
      setSaving(true);
      const response = await fetch('/api/miscellaneous-materials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: parseInt(form.project_id),
          material_name: form.material_name,
          category: form.category || guessMiscCategory(form.material_name).category,
          subcategory:
            form.category && form.subcategory && isValidSubcategory(form.category, form.subcategory)
              ? form.subcategory
              : null,
          specification: form.specification || null,
          unit: form.unit || null,
          quantity: parseFloat(form.quantity),
          unit_price: parseFloat(form.unit_price),
          purchase_date: form.purchase_date,
          supplier: form.supplier || null,
          remark: form.remark || null,
        }),
      });
      
      const data = await response.json();
      
      if (response.ok) {
        toast({
          title: '添加成功',
          description: '材料记录已添加',
        });
        setAddDialogOpen(false);
        resetForm();
        fetchMaterials();
        fetchStats();
        fetchBoardStats();
      } else {
        toast({
          title: '添加失败',
          description: data.error || '未知错误',
          variant: 'error',
        });
      }
    } catch (error: unknown) {
      toast({
        title: '添加失败',
        description: getClientErrorMessage(error, '操作失败'),
        variant: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  // 编辑材料
  const handleEdit = async () => {
    if (!currentMaterial) return;
    
    if (!form.project_id || !form.material_name || !form.quantity || !form.unit_price) {
      toast({
        title: '请填写必填项',
        description: '项目、材料名称、数量、单价为必填项',
        variant: 'error',
      });
      return;
    }
    
    try {
      setSaving(true);
      const response = await fetch('/api/miscellaneous-materials', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: currentMaterial.id,
          project_id: parseInt(form.project_id),
          material_name: form.material_name,
          category: form.category || currentMaterial.category || guessMiscCategory(form.material_name).category,
          subcategory:
            form.category && form.subcategory && isValidSubcategory(form.category, form.subcategory)
              ? form.subcategory
              : null,
          specification: form.specification || null,
          unit: form.unit || null,
          quantity: parseFloat(form.quantity),
          unit_price: parseFloat(form.unit_price),
          purchase_date: form.purchase_date,
          supplier: form.supplier || null,
          remark: form.remark || null,
        }),
      });
      
      const data = await response.json();
      
      if (response.ok) {
        toast({
          title: '修改成功',
          description: '材料记录已更新',
        });
        setEditDialogOpen(false);
        setCurrentMaterial(null);
        resetForm();
        fetchMaterials();
        fetchStats();
        fetchBoardStats();
      } else {
        toast({
          title: '修改失败',
          description: data.error || '未知错误',
          variant: 'error',
        });
      }
    } catch (error: unknown) {
      toast({
        title: '修改失败',
        description: getClientErrorMessage(error, '操作失败'),
        variant: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (material: MiscMaterial, nextStatus: MaterialStatus) => {
    if (material.status === 'voided') {
      toast({ title: '记录已作废', description: '已作废记录不可再次变更', variant: 'error' });
      return;
    }

    try {
      setStatusUpdatingId(material.id);
      const response = await fetch('/api/miscellaneous-materials', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: material.id, status: nextStatus }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '状态更新失败');
      }

      toast({
        title: nextStatus === 'reviewed' ? '审核成功' : nextStatus === 'draft' ? '已反审核' : '已作废',
        description: nextStatus === 'reviewed'
          ? '该记录已纳入成本中心和经营月报'
          : nextStatus === 'draft'
            ? '记录已退回草稿，可重新核对后审核'
            : '记录已保留留痕，不再计入正式统计',
      });
      await fetchMaterials(pagination.page);
      await fetchStats();
      await fetchBoardStats();
    } catch (error: unknown) {
      toast({
        title: '状态更新失败',
        description: getClientErrorMessage(error, '请稍后重试'),
        variant: 'error',
      });
    } finally {
      setStatusUpdatingId(null);
    }
  };

  // 删除材料
  const handleDelete = async () => {
    if (!currentMaterial) return;
    
    try {
      const response = await fetch(`/api/miscellaneous-materials?id=${currentMaterial.id}`, {
        method: 'DELETE',
      });
      
      const data = await response.json();
      
      if (response.ok) {
        toast({
          title: '删除成功',
          description: '材料记录已删除',
        });
        setDeleteDialogOpen(false);
        setCurrentMaterial(null);
        fetchMaterials();
        fetchStats();
        fetchBoardStats();
      } else {
        toast({
          title: '删除失败',
          description: data.error || '未知错误',
          variant: 'error',
        });
      }
    } catch (error: unknown) {
      toast({
        title: '删除失败',
        description: getClientErrorMessage(error, '操作失败'),
        variant: 'error',
      });
    }
  };

  // 导出台账
  const handleExport = async () => {
    try {
      const params = buildFilterParams();
      
      const response = await fetch(`/api/miscellaneous-materials/export?${params}`);
      
      if (!response.ok) {
        throw new Error('导出失败');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `零星材料统计_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      toast({
        title: '导出成功',
        description: '文件已下载',
      });
    } catch (error: unknown) {
      toast({
        title: '导出失败',
        description: getClientErrorMessage(error, '操作失败'),
        variant: 'error',
      });
    }
  };

  // 导入Excel
  const handleImport = async () => {
    if (!importFile) {
      toast({
        title: '请选择文件',
        description: '请先选择要导入的Excel文件',
        variant: 'error',
      });
      return;
    }
    
    try {
      setImporting(true);
      setImportResult(null);
      
      const formData = new FormData();
      formData.append('file', importFile);
      
      const response = await fetch('/api/miscellaneous-materials/import', {
        method: 'POST',
        body: formData,
      });
      
      const data = await response.json();
      
      if (response.ok) {
        const importedCount = data.count || 0;
        const importErrors = data.errors || [];
        setImportResult({
          success: importedCount,
          failed: importErrors.length,
          errors: importErrors,
        });
        
        if (importedCount > 0) {
          fetchMaterials();
          fetchStats();
        }
      } else {
        toast({
          title: '导入失败',
          description: data.error || '未知错误',
          variant: 'error',
        });
      }
    } catch (error: unknown) {
      toast({
        title: '导入失败',
        description: getClientErrorMessage(error, '操作失败'),
        variant: 'error',
      });
    } finally {
      setImporting(false);
    }
  };

  // 打开编辑对话框
  const openEditDialog = (material: MiscMaterial) => {
    if (material.status === 'voided') {
      toast({ title: '记录已作废', description: '已作废记录不可编辑', variant: 'error' });
      return;
    }
    // 免审核策略：草稿/已审核均可直接修改（已作废除外）
    setCurrentMaterial(material);
    const editCategory = (material.category as MiscMaterialCategory) || guessMiscCategory(material.material_name).category;
    setForm({
      project_id: material.project_id.toString(),
      material_name: material.material_name,
      category: editCategory,
      subcategory:
        material.subcategory && isValidSubcategory(editCategory, material.subcategory)
          ? material.subcategory
          : '',
      specification: material.specification || '',
      unit: material.unit || '',
      quantity: material.quantity,
      unit_price: material.unit_price,
      purchase_date: material.purchase_date,
      supplier: material.supplier || '',
      remark: material.remark || '',
    });
    setEditDialogOpen(true);
  };

  // 格式化金额
  const formatAmount = (amount: number | string) => {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return isNaN(num) ? '0.00' : num.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // 下载导入模板
  const downloadTemplate = async () => {
    const XLSX = await import('xlsx');
    const rows = [
      ['项目名称', '材料名称', '材料分类', '材料子类', '规格型号', '单位', '数量', '单价', '采购日期', '采购人', '备注'],
      ['XX项目', '铁丝', '五金电料', '钢丝·绳·网', '8#镀锌', '公斤', 10, 25, '2026-01-15', '张三', '示例行，导入前请删除'],
      ['XX项目', '劳保手套', '劳保安全', '防护服装', '棉纱加厚', '双', 50, 3.5, '2026-01-16', '李四', ''],
      ['XX项目', '扣件租赁费', '周转辅材', '周转其他', '十字扣件', '个', 100, 0.5, '2026-01-17', '赵六', ''],
      ['XX项目', 'PPR管', '', '', 'DN25', '米', 20, 8, '2026-01-16', '王五', '分类留空按材料名自动识别；也支持"一级/二级"合并写法，如：水暖管件/管材管件'],
    ];
    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    worksheet['!cols'] = [
      { wch: 16 }, { wch: 16 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 8 },
      { wch: 8 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 40 },
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '零星材料导入');
    XLSX.writeFile(workbook, '零星材料导入模板.xlsx');
  };

  // 格式化日期
  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('zh-CN');
  };

  const renderStatusBadge = (material: MiscMaterial) => {
    const meta = statusMeta[material.status] || statusMeta.draft;
    return (
      <span
        className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium"
        style={{
          color: meta.color,
          backgroundColor: meta.background,
          borderColor: `${meta.color}55`,
        }}
      >
        {meta.label}
      </span>
    );
  };

  const renderMaterialActions = (material: MiscMaterial) => {
    const isUpdating = statusUpdatingId === material.id;

    return (
      <div className="flex flex-wrap items-center justify-end gap-1">
        {material.status === 'draft' && (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleStatusChange(material, 'reviewed')}
              disabled={isUpdating}
              className="h-8 px-2"
              title="审核"
              aria-label="审核"
            >
              {isUpdating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" style={{ color: '#008A39' }} />
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleStatusChange(material, 'voided')}
              disabled={isUpdating}
              className="h-8 px-2"
              title="作废"
              aria-label="作废"
            >
              <Ban className="h-4 w-4" style={{ color: '#86909C' }} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => openEditDialog(material)}
              className="h-8 px-2"
              title="编辑"
              aria-label="编辑"
            >
              <Pencil className="h-4 w-4" style={{ color: 'var(--color-primary)' }} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setCurrentMaterial(material);
                setDeleteDialogOpen(true);
              }}
              className="h-8 px-2"
              title="删除"
              aria-label="删除"
            >
              <Trash2 className="h-4 w-4" style={{ color: '#F53F3F' }} />
            </Button>
          </>
        )}

        {material.status === 'reviewed' && (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => openEditDialog(material)}
              className="h-8 px-2"
              title="编辑"
              aria-label="编辑"
            >
              <Pencil className="h-4 w-4" style={{ color: 'var(--color-primary)' }} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleStatusChange(material, 'voided')}
              disabled={isUpdating}
              className="h-8 px-2"
              title="作废"
              aria-label="作废"
            >
              <Ban className="h-4 w-4" style={{ color: '#86909C' }} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setCurrentMaterial(material);
                setDeleteDialogOpen(true);
              }}
              className="h-8 px-2"
              title="删除"
              aria-label="删除"
            >
              <Trash2 className="h-4 w-4" style={{ color: '#F53F3F' }} />
            </Button>
          </>
        )}

        {material.status === 'voided' && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setCurrentMaterial(material);
              setDeleteDialogOpen(true);
            }}
            className="h-8 px-2"
            title="删除"
            aria-label="删除"
          >
            <Trash2 className="h-4 w-4" style={{ color: '#F53F3F' }} />
          </Button>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5 p-3 sm:p-4 md:p-6" style={{ backgroundColor: 'var(--color-muted)', minHeight: 'calc(100vh - 64px)' }}>
      {/* 页面标题 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight" style={{ color: 'var(--foreground)' }}>零星材料登记台账</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-3)' }}>登记采购发生、核对审核状态，已审核记录进入项目成本统计</p>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
          <Button
            variant="outline"
            onClick={() => openAssistDialog('image')}
            className="gap-2"
          >
            <Camera className="h-4 w-4" />
            拍照录入
          </Button>
          <Button
            variant="outline"
            onClick={() => openAssistDialog('voice')}
            className="gap-2"
          >
            <Mic className="h-4 w-4" />
            语音录入
          </Button>
          <Button
            variant="outline"
            onClick={() => setImportDialogOpen(true)}
            className="gap-2"
          >
            <Upload className="h-4 w-4" />
            批量导入
          </Button>
          <Button
            variant="outline"
            onClick={handleExport}
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            导出CSV
          </Button>
          <Button
            onClick={() => {
              resetForm();
              setAddDialogOpen(true);
            }}
            className="gap-2"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            <Plus className="h-4 w-4" />
            新增登记
          </Button>
        </div>
      </div>

      {/* 汇总卡片 */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 md:gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg" style={{ backgroundColor: '#E8F3FF' }}>
                <CheckCircle2 className="h-5 w-5" style={{ color: 'var(--color-primary)' }} />
              </div>
              <div>
                <p className="text-sm" style={{ color: 'var(--color-text-3)' }}>已计入成本金额</p>
                <p className="text-xl font-bold" style={{ color: 'var(--foreground)' }}>¥{formatAmount(stats.reviewedAmount)}</p>
                <p className="text-xs mt-1" style={{ color: 'var(--color-text-3)' }}>{stats.reviewedCount} 笔进入成本</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg" style={{ backgroundColor: '#E8FFEA' }}>
                <Ban className="h-5 w-5" style={{ color: '#86909C' }} />
              </div>
              <div>
                <p className="text-sm" style={{ color: 'var(--color-text-3)' }}>已作废金额</p>
                <p className="text-xl font-bold" style={{ color: 'var(--foreground)' }}>¥{formatAmount(stats.voidedAmount)}</p>
                <p className="text-xs mt-1" style={{ color: 'var(--color-text-3)' }}>{stats.voidedCount} 笔保留留痕</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg" style={{ backgroundColor: 'var(--color-muted)' }}>
                <Package className="h-5 w-5" style={{ color: 'var(--color-text-3)' }} />
              </div>
              <div>
                <p className="text-sm" style={{ color: 'var(--color-text-3)' }}>记录数</p>
                <p className="text-xl font-bold" style={{ color: 'var(--foreground)' }}>{stats.totalCount}</p>
                <p className="text-xs mt-1" style={{ color: 'var(--color-text-3)' }}>当前筛选范围</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 筛选条件 */}
      <Card>
        <CardContent className="p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
            <div className="space-y-1.5">
              <Label style={{ color: 'var(--color-text-3)' }}>项目</Label>
              <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="全部项目" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部项目</SelectItem>
                  {projects.map(project => (
                    <SelectItem key={project.id} value={project.id.toString()}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-1.5">
              <Label style={{ color: 'var(--color-text-3)' }}>材料名称</Label>
              <Input
                className="w-full"
                placeholder="搜索材料名称"
                value={materialName}
                onChange={(e) => setMaterialName(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label style={{ color: 'var(--color-text-3)' }}>规格型号</Label>
              <Input
                className="w-full"
                placeholder="搜索规格型号"
                value={specification}
                onChange={(e) => setSpecification(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label style={{ color: 'var(--color-text-3)' }}>采购人</Label>
              <Input
                className="w-full"
                placeholder="搜索采购人"
                value={purchaser}
                onChange={(e) => setPurchaser(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label style={{ color: 'var(--color-text-3)' }}>材料分类</Label>
              <Select
                value={selectedCategory}
                onValueChange={(v) => {
                  setSelectedCategory(v);
                  setSelectedSubcategory('all');
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="全部分类" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部分类</SelectItem>
                  {CATEGORY_OPTIONS.map(cat => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedCategory !== 'all' &&
              (MISC_MATERIAL_SUBCATEGORY_MAP[selectedCategory as MiscMaterialCategory]?.length ?? 0) > 0 && (
              <div className="space-y-1.5">
                <Label style={{ color: 'var(--color-text-3)' }}>材料子类</Label>
                <Select value={selectedSubcategory} onValueChange={setSelectedSubcategory}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="全部子类" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部子类</SelectItem>
                    {(MISC_MATERIAL_SUBCATEGORY_MAP[selectedCategory as MiscMaterialCategory] || []).map(sub => (
                      <SelectItem key={sub.code} value={sub.value}>{sub.code} {sub.value}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label style={{ color: 'var(--color-text-3)' }}>状态</Label>
              <Select value={status} onValueChange={(value) => setStatus(value as 'all' | MaterialStatus)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="全部状态" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部状态</SelectItem>
                  <SelectItem value="draft">草稿</SelectItem>
                  <SelectItem value="reviewed">已审核</SelectItem>
                  <SelectItem value="voided">已作废</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-1.5">
              <Label style={{ color: 'var(--color-text-3)' }}>开始日期</Label>
              <Input
                type="date"
                className="w-full"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            
            <div className="space-y-1.5">
              <Label style={{ color: 'var(--color-text-3)' }}>结束日期</Label>
              <Input
                type="date"
                className="w-full"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              onClick={() => {
                fetchMaterials(1);
                fetchStats();
                fetchBoardStats();
              }}
              className="gap-2"
              style={{ backgroundColor: 'var(--color-primary)' }}
            >
              <Search className="h-4 w-4" />
              查询
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setSelectedProjectId('all');
                setMaterialName('');
                setSpecification('');
                setPurchaser('');
                setStatus('all');
                setSelectedCategory('all');
                setSelectedSubcategory('all');
                setExpandedStatCategory(null);
                setStartDate('');
                setEndDate('');
              }}
            >
              重置
            </Button>
            <span className="text-xs" style={{ color: 'var(--color-text-3)' }}>
              统计金额仅包含已审核记录
            </span>
          </div>
        </CardContent>
      </Card>

      {/* 项目统计 */}
      {Object.keys(stats.projectStats).length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base" style={{ color: 'var(--foreground)' }}>项目金额统计</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {Object.entries(stats.projectStats)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 12)
                .map(([projectName, amount]) => (
                  <div
                    key={projectName}
                    className="p-3 rounded-lg border"
                    style={{ backgroundColor: 'var(--color-muted)', borderColor: 'var(--border)' }}
                  >
                    <p className="text-xs truncate" style={{ color: 'var(--color-text-3)' }} title={projectName}>
                      {projectName}
                    </p>
                    <p className="text-sm font-semibold mt-1" style={{ color: 'var(--foreground)' }}>
                      ¥{formatAmount(amount)}
                    </p>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 分类统计（仅已审核计入成本的金额；不随分类筛选变化，保证下钻数据完整） */}
      {boardStats.categoryStats && Object.keys(boardStats.categoryStats).length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base" style={{ color: 'var(--foreground)' }}>
              分类金额统计
              <span className="ml-2 text-sm font-normal" style={{ color: 'var(--color-text-3)' }}>
                点击分类查看子类明细，点击子类快速筛选
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(() => {
              const entries = Object.entries(boardStats.categoryStats || {})
                .sort((a, b) => b[1].amount - a[1].amount);
              const grandTotal = entries.reduce((s, [, v]) => s + v.amount, 0);
              return (
                <>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {entries.map(([cat, v]) => {
                      const s = categoryStyle(cat);
                      const pct = grandTotal > 0 ? (v.amount / grandTotal) * 100 : 0;
                      const active = selectedCategory === cat;
                      const hasSubs = (MISC_MATERIAL_SUBCATEGORY_MAP[cat as MiscMaterialCategory]?.length ?? 0) > 0;
                      const expanded = expandedStatCategory === cat;
                      return (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => {
                            if (hasSubs) {
                              setExpandedStatCategory(expanded ? null : cat);
                            } else {
                              setSelectedCategory(active ? 'all' : cat);
                              setSelectedSubcategory('all');
                            }
                          }}
                          className="rounded-lg border p-3 text-left transition-all hover:shadow-sm"
                          style={{
                            backgroundColor: active || expanded ? s.bg : 'var(--color-muted)',
                            borderColor: active || expanded ? s.dot : 'var(--border)',
                            borderWidth: active || expanded ? 1.5 : 1,
                          }}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="flex items-center gap-1.5 text-sm font-medium" style={{ color: 'var(--foreground)' }}>
                              <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: s.dot }} />
                              {cat}
                            </span>
                            <span className="flex items-center gap-1">
                              <span className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>
                                ¥{formatAmount(v.amount)}
                              </span>
                              {hasSubs && (
                                <ChevronDown
                                  className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`}
                                  style={{ color: 'var(--color-text-3)' }}
                                />
                              )}
                            </span>
                          </div>
                          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full" style={{ backgroundColor: 'var(--border)' }}>
                            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: s.dot }} />
                          </div>
                          <div className="mt-1.5 flex items-center justify-between text-xs" style={{ color: 'var(--color-text-3)' }}>
                            <span>{v.count} 笔</span>
                            <span>{pct.toFixed(1)}%</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* 子类下钻面板 */}
                  {expandedStatCategory && (() => {
                    const cat = expandedStatCategory as MiscMaterialCategory;
                    const s = categoryStyle(cat);
                    const catStats = boardStats.categoryStats?.[cat] || { count: 0, amount: 0 };
                    const subs = (MISC_MATERIAL_SUBCATEGORY_MAP[cat] || [])
                      .map(sub => ({
                        ...sub,
                        count: boardStats.subcategoryStats?.[sub.value]?.count || 0,
                        amount: boardStats.subcategoryStats?.[sub.value]?.amount || 0,
                      }))
                      .sort((a, b) => b.amount - a.amount);
                    const classifiedCount = subs.reduce((sum, x) => sum + x.count, 0);
                    const classifiedAmount = subs.reduce((sum, x) => sum + x.amount, 0);
                    const unclassCount = catStats.count - classifiedCount;
                    const unclassAmount = catStats.amount - classifiedAmount;
                    return (
                      <div
                        className="mt-3 rounded-lg border p-3"
                        style={{ borderColor: s.dot, backgroundColor: s.bg }}
                      >
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                          <span className="flex items-center gap-1.5 text-sm font-medium" style={{ color: 'var(--foreground)' }}>
                            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: s.dot }} />
                            {cat} · 子类明细
                          </span>
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              style={{ color: 'var(--color-primary)' }}
                              onClick={() => {
                                setSelectedCategory(cat);
                                setSelectedSubcategory('all');
                              }}
                            >
                              筛选该分类全部
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => setExpandedStatCategory(null)}
                            >
                              收起
                            </Button>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                          {subs.map(sub => {
                            const subPct = catStats.amount > 0 ? (sub.amount / catStats.amount) * 100 : 0;
                            const subActive = selectedCategory === cat && selectedSubcategory === sub.value;
                            return (
                              <button
                                key={sub.code}
                                type="button"
                                onClick={() => {
                                  setSelectedCategory(cat);
                                  setSelectedSubcategory(sub.value);
                                }}
                                className="rounded-md border p-2.5 text-left transition-all hover:shadow-sm"
                                style={{
                                  backgroundColor: 'var(--color-background, #fff)',
                                  borderColor: subActive ? s.dot : 'var(--border)',
                                  borderWidth: subActive ? 1.5 : 1,
                                }}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-xs font-medium" style={{ color: 'var(--foreground)' }}>
                                    <span className="mr-1 opacity-60">{sub.code}</span>
                                    {sub.value}
                                  </span>
                                  <span className="text-xs font-semibold" style={{ color: 'var(--foreground)' }}>
                                    ¥{formatAmount(sub.amount)}
                                  </span>
                                </div>
                                <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full" style={{ backgroundColor: 'var(--border)' }}>
                                  <div className="h-full rounded-full transition-all" style={{ width: `${subPct}%`, backgroundColor: s.dot }} />
                                </div>
                                <div className="mt-1 flex items-center justify-between text-xs" style={{ color: 'var(--color-text-3)' }}>
                                  <span>{sub.count} 笔</span>
                                  <span>{subPct.toFixed(1)}%</span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                        {unclassCount > 0 && (
                          <p className="mt-2 text-xs" style={{ color: 'var(--color-text-3)' }}>
                            未细分：{unclassCount} 笔 · ¥{formatAmount(unclassAmount)}（编辑记录可补选子类）
                          </p>
                        )}
                      </div>
                    );
                  })()}
                </>
              );
            })()}
          </CardContent>
        </Card>
      )}

      {/* 材料列表 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base" style={{ color: 'var(--foreground)' }}>
            材料明细
            <span className="ml-2 text-sm font-normal" style={{ color: 'var(--color-text-3)' }}>
              共 {pagination.total} 条
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <div className="text-center" style={{ color: 'var(--color-text-3)' }}>加载中...</div>
            </div>
          ) : materials.length === 0 ? (
            <div className="flex items-center justify-center h-40">
              <div className="text-center" style={{ color: 'var(--color-text-3)' }}>
                <Package className="h-12 w-12 mx-auto mb-2 opacity-30" />
                <p>暂无材料记录</p>
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-3 md:hidden">
                {materials.map(material => (
                  <div key={material.id} className="rounded-xl border bg-card p-3" style={{ borderColor: 'var(--border)' }}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-semibold" style={{ color: 'var(--foreground)' }}>{material.material_name}</p>
                          <CategoryBadge category={material.category} subcategory={material.subcategory} />
                        </div>
                        {material.specification && (
                          <p className="mt-1 truncate text-xs" style={{ color: 'var(--color-text-3)' }}>
                            {material.specification}
                          </p>
                        )}
                        <p className="mt-1 truncate text-xs" style={{ color: 'var(--color-text-3)' }}>{material.projects?.name || '-'}</p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        {renderStatusBadge(material)}
                        <span className="text-sm font-semibold" style={{ color: '#FF7D00' }}>
                          ¥{formatAmount(material.total_price)}
                        </span>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-lg bg-[var(--color-muted)] px-2 py-1.5">
                        <span style={{ color: 'var(--color-text-3)' }}>数量</span>
                        <span className="ml-2 font-medium" style={{ color: 'var(--foreground)' }}>{material.quantity}{material.unit || ''}</span>
                      </div>
                      <div className="rounded-lg bg-[var(--color-muted)] px-2 py-1.5">
                        <span style={{ color: 'var(--color-text-3)' }}>单价</span>
                        <span className="ml-2 font-medium" style={{ color: 'var(--foreground)' }}>¥{formatAmount(material.unit_price)}</span>
                      </div>
                      <div className="rounded-lg bg-[var(--color-muted)] px-2 py-1.5">
                        <span style={{ color: 'var(--color-text-3)' }}>日期</span>
                        <span className="ml-2 font-medium" style={{ color: 'var(--foreground)' }}>{material.purchase_date}</span>
                      </div>
                      <div className="rounded-lg bg-[var(--color-muted)] px-2 py-1.5">
                        <span style={{ color: 'var(--color-text-3)' }}>采购人</span>
                        <span className="ml-2 font-medium" style={{ color: 'var(--foreground)' }}>{material.supplier || '-'}</span>
                      </div>
                    </div>
                    <div className="mt-3 border-t pt-2" style={{ borderColor: 'var(--border)' }}>
                      {renderMaterialActions(material)}
                    </div>
                  </div>
                ))}
              </div>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full">
                  <thead>
                    <tr className="border-b" style={{ borderColor: 'var(--border)' }}>
                      <th className="text-left py-3 px-4 text-sm font-medium" style={{ color: 'var(--color-text-3)' }}>项目名称</th>
                      <th className="text-left py-3 px-4 text-sm font-medium" style={{ color: 'var(--color-text-3)' }}>分类</th>
                      <th className="text-left py-3 px-4 text-sm font-medium" style={{ color: 'var(--color-text-3)' }}>材料名称</th>
                      <th className="text-left py-3 px-4 text-sm font-medium" style={{ color: 'var(--color-text-3)' }}>规格型号</th>
                      <th className="text-center py-3 px-4 text-sm font-medium" style={{ color: 'var(--color-text-3)' }}>单位</th>
                      <th className="text-right py-3 px-4 text-sm font-medium" style={{ color: 'var(--color-text-3)' }}>数量</th>
                      <th className="text-right py-3 px-4 text-sm font-medium" style={{ color: 'var(--color-text-3)' }}>单价</th>
                      <th className="text-right py-3 px-4 text-sm font-medium" style={{ color: 'var(--color-text-3)' }}>金额</th>
                      <th className="text-center py-3 px-4 text-sm font-medium" style={{ color: 'var(--color-text-3)' }}>采购日期</th>
                      <th className="text-left py-3 px-4 text-sm font-medium" style={{ color: 'var(--color-text-3)' }}>采购人</th>
                      <th className="text-center py-3 px-4 text-sm font-medium" style={{ color: 'var(--color-text-3)' }}>状态</th>
                      <th className="text-center py-3 px-4 text-sm font-medium" style={{ color: 'var(--color-text-3)' }}>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {materials.map((material) => (
                      <tr key={material.id} className="border-b hover:bg-gray-50" style={{ borderColor: 'var(--border)' }}>
                        <td className="py-3 px-4">
                          <span className="text-sm" style={{ color: 'var(--foreground)' }}>
                            {material.projects?.name || '-'}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <CategoryBadge category={material.category} subcategory={material.subcategory} />
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
                            {material.material_name}
                          </span>
                        </td>
                        <td className="max-w-48 py-3 px-4">
                          <span className="block truncate text-sm" style={{ color: 'var(--color-text-3)' }} title={material.specification || undefined}>
                            {material.specification || '-'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="text-sm" style={{ color: 'var(--color-text-3)' }}>
                            {material.unit || '-'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <span className="text-sm" style={{ color: 'var(--foreground)' }}>
                            {parseFloat(material.quantity).toLocaleString('zh-CN')}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <span className="text-sm" style={{ color: 'var(--foreground)' }}>
                            ¥{formatAmount(material.unit_price)}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <span className="text-sm font-medium" style={{ color: '#FF7D00' }}>
                            ¥{formatAmount(material.total_price)}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="text-sm" style={{ color: 'var(--color-text-3)' }}>
                            {formatDate(material.purchase_date)}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-sm" style={{ color: 'var(--color-text-3)' }}>
                            {material.supplier || '-'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          {renderStatusBadge(material)}
                        </td>
                        <td className="py-3 px-4">
                          {renderMaterialActions(material)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              {/* 分页 */}
              {pagination.totalPages > 1 && (
                <div className="mt-4 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: 'var(--border)' }}>
                  <div className="text-sm" style={{ color: 'var(--color-text-3)' }}>
                    第 {(pagination.page - 1) * pagination.pageSize + 1} - {Math.min(pagination.page * pagination.pageSize, pagination.total)} 条，共 {pagination.total} 条
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pagination.page === 1}
                      onClick={() => fetchMaterials(pagination.page - 1)}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm px-3" style={{ color: 'var(--color-text-3)' }}>
                      {pagination.page} / {pagination.totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pagination.page === pagination.totalPages}
                      onClick={() => fetchMaterials(pagination.page + 1)}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* 智能录入对话框 */}
      <Dialog open={assistDialogOpen} onOpenChange={setAssistDialogOpen}>
        <DialogContent className="max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" style={{ color: 'var(--color-primary)' }} />
              零星材料智能录入
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid gap-2 sm:grid-cols-3">
              <Button variant={assistMode === 'image' ? 'default' : 'outline'} onClick={() => resetAssist('image')} className="gap-2">
                <Camera className="h-4 w-4" />拍照
              </Button>
              <Button variant={assistMode === 'voice' ? 'default' : 'outline'} onClick={() => resetAssist('voice')} className="gap-2">
                <Mic className="h-4 w-4" />语音
              </Button>
              <Button variant={assistMode === 'text' ? 'default' : 'outline'} onClick={() => resetAssist('text')} className="gap-2">
                <Sparkles className="h-4 w-4" />文字
              </Button>
            </div>

            {assistMode === 'image' && (
              <div className="space-y-2">
                <Label style={{ color: 'var(--foreground)' }}>拍照或上传材料票据</Label>
                <Input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => setAssistFile(e.target.files?.[0] || null)}
                />
                <p className="text-xs" style={{ color: 'var(--color-text-3)' }}>
                  照片只用于文字识别，识别完成后不保存原始图片；保存前请人工核对项目、数量和单价。
                </p>
              </div>
            )}

            {assistMode === 'voice' && (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={startVoiceInput} disabled={listening} className="gap-2">
                    {listening ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
                    {listening ? '正在听写...' : '开始语音输入'}
                  </Button>
                  <Input
                    type="file"
                    accept="audio/*"
                    onChange={(e) => setAssistFile(e.target.files?.[0] || null)}
                    className="max-w-xs"
                  />
                </div>
                <p className="text-xs" style={{ color: 'var(--color-text-3)' }}>
                  可直接说“某项目买水泥10袋，单价25元，采购人张三”。也可上传音频文件，音频只用于识别不保存。
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label style={{ color: 'var(--foreground)' }}>
                {assistMode === 'text' ? '材料描述' : '识别文字/补充说明'}
              </Label>
              <Textarea
                placeholder="例如：A项目采购水泥10袋，单价25元，采购人张三，7月14日"
                value={assistText}
                onChange={(e) => setAssistText(e.target.value)}
                rows={4}
              />
            </div>

            {(assistWarnings.length > 0 || assistRawText) && (
              <div className="rounded-lg border p-3" style={{ borderColor: 'var(--border)', backgroundColor: '#FAFBFF' }}>
                {assistWarnings.length > 0 && (
                  <div className="space-y-1">
                    {assistWarnings.map((item, index) => (
                      <p key={index} className="text-xs" style={{ color: '#FF7D00' }}>{item}</p>
                    ))}
                  </div>
                )}
                {assistRawText && (
                  <div className="mt-3 max-h-28 overflow-auto whitespace-pre-wrap text-xs" style={{ color: 'var(--color-text-2)' }}>
                    {assistRawText}
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
            <Button variant="outline" onClick={() => setAssistDialogOpen(false)}>取消</Button>
            <Button onClick={handleRecognizeMaterial} disabled={recognizing} className="gap-2" style={{ backgroundColor: 'var(--color-primary)' }}>
              {recognizing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {recognizing ? '正在提炼...' : 'AI提炼为草稿'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 新增对话框 */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>新增零星材料</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label style={{ color: 'var(--foreground)' }}>项目 *</Label>
                <Select value={form.project_id} onValueChange={(v) => setForm({ ...form, project_id: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择项目" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map(project => (
                      <SelectItem key={project.id} value={project.id.toString()}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label style={{ color: 'var(--foreground)' }}>材料名称 *</Label>
                <Input
                  placeholder="请输入材料名称"
                  value={form.material_name}
                  onChange={(e) => {
                    const name = e.target.value;
                    // 未手动固定分类时随名称智能识别（两级）
                    const guessed = guessMiscCategory(name);
                    setForm(prev => ({
                      ...prev,
                      material_name: name,
                      category: prev.category || guessed.category,
                      subcategory: prev.category ? prev.subcategory : (guessed.subcategory || ''),
                    }));
                  }}
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <div className="flex h-6 items-center justify-between">
                  <Label style={{ color: 'var(--foreground)' }}>材料分类</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleAiClassify}
                    disabled={aiClassifying || !form.material_name.trim()}
                    className="h-6 gap-1 px-2 text-xs"
                    style={{ color: 'var(--color-primary)' }}
                  >
                    {aiClassifying ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                    AI识别
                  </Button>
                </div>
                <Select
                  value={formEffectiveCategory}
                  onValueChange={(v) => {
                    const cat = v as MiscMaterialCategory;
                    setForm(prev => ({
                      ...prev,
                      category: cat,
                      subcategory: prev.subcategory && isValidSubcategory(cat, prev.subcategory) ? prev.subcategory : '',
                    }));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择分类" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORY_OPTIONS.map(cat => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <div className="flex h-6 items-center justify-between">
                  <Label style={{ color: 'var(--foreground)' }}>材料子类</Label>
                  {formSubOptions.length > 0 && (
                    <span className="text-xs" style={{ color: 'var(--color-text-3)' }}>{formSubOptions.length} 项可选</span>
                  )}
                </div>
                <Select
                  value={
                    formSubOptions.length === 0
                      ? ''
                      : (form.subcategory && isValidSubcategory(formEffectiveCategory, form.subcategory) ? form.subcategory : '__none__')
                  }
                  onValueChange={(v) => setForm({ ...form, subcategory: v === '__none__' ? '' : v })}
                  disabled={formSubOptions.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={formSubOptions.length === 0 ? '该分类暂不细分子类' : '选择子类（可选）'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">未细分</SelectItem>
                    {formSubOptions.map(sub => (
                      <SelectItem key={sub.code} value={sub.value}>{sub.code} {sub.value}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-4">
              <div className="space-y-2">
                <Label style={{ color: 'var(--foreground)' }}>规格型号</Label>
                <Input
                  placeholder="如：M16×80"
                  value={form.specification}
                  onChange={(e) => setForm({ ...form, specification: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label style={{ color: 'var(--foreground)' }}>单位</Label>
                <Input
                  placeholder="如：个、米"
                  value={form.unit}
                  onChange={(e) => setForm({ ...form, unit: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label style={{ color: 'var(--foreground)' }}>数量 *</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="数量"
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label style={{ color: 'var(--foreground)' }}>单价 *</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="单价"
                  value={form.unit_price}
                  onChange={(e) => setForm({ ...form, unit_price: e.target.value })}
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label style={{ color: 'var(--foreground)' }}>采购日期 *</Label>
                <Input
                  type="date"
                  value={form.purchase_date}
                  onChange={(e) => setForm({ ...form, purchase_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label style={{ color: 'var(--foreground)' }}>采购人</Label>
                <Input
                  placeholder="填写采购人"
                  value={form.supplier}
                  onChange={(e) => setForm({ ...form, supplier: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label style={{ color: 'var(--foreground)' }}>备注</Label>
              <Textarea
                placeholder="备注信息"
                value={form.remark}
                onChange={(e) => setForm({ ...form, remark: e.target.value })}
                rows={2}
              />
            </div>
            {form.quantity && form.unit_price && (
              <div className="flex items-center justify-end gap-2 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
                <span className="text-sm" style={{ color: 'var(--color-text-3)' }}>金额合计：</span>
                <span className="text-lg font-bold" style={{ color: '#FF7D00' }}>
                  ¥{formatAmount((parseFloat(form.quantity) || 0) * (parseFloat(form.unit_price) || 0))}
                </span>
              </div>
            )}
            <p className="text-xs" style={{ color: 'var(--color-text-3)' }}>
              金额由系统按“数量 × 单价”自动计算，保存后以系统计算结果为准。
            </p>
            {(() => {
              const amount = (parseFloat(form.quantity) || 0) * (parseFloat(form.unit_price) || 0);
              const cat = (form.category || guessMiscCategory(form.material_name).category) as MiscMaterialCategory;
              if (!shouldSuggestLargeMachinery(cat, amount)) return null;
              return (
                <p className="text-xs rounded-md px-2 py-1.5" style={{ backgroundColor: '#FFF7E8', color: '#D46B08' }}>
                  提示：该笔金额较大（≥5000元），如为机械设备/台班费用，建议归入「大型机具」分类。
                </p>
              );
            })()}
          </div>
          <DialogFooter className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>取消</Button>
            <Button onClick={handleAdd} disabled={saving} style={{ backgroundColor: 'var(--color-primary)' }}>
              {saving ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 编辑对话框 */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>编辑零星材料</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label style={{ color: 'var(--foreground)' }}>项目 *</Label>
                <Select value={form.project_id} onValueChange={(v) => setForm({ ...form, project_id: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择项目" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map(project => (
                      <SelectItem key={project.id} value={project.id.toString()}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label style={{ color: 'var(--foreground)' }}>材料名称 *</Label>
                <Input
                  placeholder="请输入材料名称"
                  value={form.material_name}
                  onChange={(e) => {
                    const name = e.target.value;
                    // 未手动固定分类时随名称智能识别（两级）
                    const guessed = guessMiscCategory(name);
                    setForm(prev => ({
                      ...prev,
                      material_name: name,
                      category: prev.category || guessed.category,
                      subcategory: prev.category ? prev.subcategory : (guessed.subcategory || ''),
                    }));
                  }}
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <div className="flex h-6 items-center justify-between">
                  <Label style={{ color: 'var(--foreground)' }}>材料分类</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleAiClassify}
                    disabled={aiClassifying || !form.material_name.trim()}
                    className="h-6 gap-1 px-2 text-xs"
                    style={{ color: 'var(--color-primary)' }}
                  >
                    {aiClassifying ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                    AI识别
                  </Button>
                </div>
                <Select
                  value={formEffectiveCategory}
                  onValueChange={(v) => {
                    const cat = v as MiscMaterialCategory;
                    setForm(prev => ({
                      ...prev,
                      category: cat,
                      subcategory: prev.subcategory && isValidSubcategory(cat, prev.subcategory) ? prev.subcategory : '',
                    }));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择分类" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORY_OPTIONS.map(cat => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <div className="flex h-6 items-center justify-between">
                  <Label style={{ color: 'var(--foreground)' }}>材料子类</Label>
                  {formSubOptions.length > 0 && (
                    <span className="text-xs" style={{ color: 'var(--color-text-3)' }}>{formSubOptions.length} 项可选</span>
                  )}
                </div>
                <Select
                  value={
                    formSubOptions.length === 0
                      ? ''
                      : (form.subcategory && isValidSubcategory(formEffectiveCategory, form.subcategory) ? form.subcategory : '__none__')
                  }
                  onValueChange={(v) => setForm({ ...form, subcategory: v === '__none__' ? '' : v })}
                  disabled={formSubOptions.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={formSubOptions.length === 0 ? '该分类暂不细分子类' : '选择子类（可选）'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">未细分</SelectItem>
                    {formSubOptions.map(sub => (
                      <SelectItem key={sub.code} value={sub.value}>{sub.code} {sub.value}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-4">
              <div className="space-y-2">
                <Label style={{ color: 'var(--foreground)' }}>规格型号</Label>
                <Input
                  placeholder="如：M16×80"
                  value={form.specification}
                  onChange={(e) => setForm({ ...form, specification: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label style={{ color: 'var(--foreground)' }}>单位</Label>
                <Input
                  placeholder="如：个、米"
                  value={form.unit}
                  onChange={(e) => setForm({ ...form, unit: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label style={{ color: 'var(--foreground)' }}>数量 *</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="数量"
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label style={{ color: 'var(--foreground)' }}>单价 *</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="单价"
                  value={form.unit_price}
                  onChange={(e) => setForm({ ...form, unit_price: e.target.value })}
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label style={{ color: 'var(--foreground)' }}>采购日期 *</Label>
                <Input
                  type="date"
                  value={form.purchase_date}
                  onChange={(e) => setForm({ ...form, purchase_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label style={{ color: 'var(--foreground)' }}>采购人</Label>
                <Input
                  placeholder="填写采购人"
                  value={form.supplier}
                  onChange={(e) => setForm({ ...form, supplier: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label style={{ color: 'var(--foreground)' }}>备注</Label>
              <Textarea
                placeholder="备注信息"
                value={form.remark}
                onChange={(e) => setForm({ ...form, remark: e.target.value })}
                rows={2}
              />
            </div>
            {form.quantity && form.unit_price && (
              <div className="flex items-center justify-end gap-2 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
                <span className="text-sm" style={{ color: 'var(--color-text-3)' }}>金额合计：</span>
                <span className="text-lg font-bold" style={{ color: '#FF7D00' }}>
                  ¥{formatAmount((parseFloat(form.quantity) || 0) * (parseFloat(form.unit_price) || 0))}
                </span>
              </div>
            )}
            <p className="text-xs" style={{ color: 'var(--color-text-3)' }}>
              金额由系统按“数量 × 单价”自动计算，保存后以系统计算结果为准。
            </p>
            {(() => {
              const amount = (parseFloat(form.quantity) || 0) * (parseFloat(form.unit_price) || 0);
              const cat = (form.category || guessMiscCategory(form.material_name).category) as MiscMaterialCategory;
              if (!shouldSuggestLargeMachinery(cat, amount)) return null;
              return (
                <p className="text-xs rounded-md px-2 py-1.5" style={{ backgroundColor: '#FFF7E8', color: '#D46B08' }}>
                  提示：该笔金额较大（≥5000元），如为机械设备/台班费用，建议归入「大型机具」分类。
                </p>
              );
            })()}
          </div>
          <DialogFooter className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>取消</Button>
            <Button onClick={handleEdit} disabled={saving} style={{ backgroundColor: 'var(--color-primary)' }}>
              {saving ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认对话框 */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="w-[calc(100vw-1.5rem)] max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除材料记录 &quot;{currentMaterial?.material_name}&quot; 吗？此操作不可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-500 hover:bg-red-600">
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 导入对话框 */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>批量导入零星材料</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label style={{ color: 'var(--foreground)' }}>选择Excel或CSV文件</Label>
              <Input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={(e) => {
                  setImportFile(e.target.files?.[0] || null);
                  setImportResult(null);
                }}
              />
              <p className="text-xs" style={{ color: 'var(--color-text-3)' }}>
                支持 .xlsx、.xls、.csv 格式，文件大小不超过 10MB
              </p>
            </div>
            
            <Button variant="outline" onClick={downloadTemplate} className="gap-2">
              <Download className="h-4 w-4" />
              下载导入模板
            </Button>
            
            <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--color-muted)' }}>
              <p className="text-sm font-medium mb-2" style={{ color: 'var(--foreground)' }}>Excel格式要求：</p>
              <ul className="text-xs space-y-1" style={{ color: 'var(--color-text-3)' }}>
                <li>• 第一行为表头，数据从第二行开始</li>
                <li>• 必填列：项目名称、材料名称、数量、单价</li>
                <li>• 可选列：材料分类、材料子类、规格型号、单位、采购日期、采购人、备注</li>
                <li>• 材料分类支持：{CATEGORY_OPTIONS.join('、')}；留空或无法识别时按材料名称自动归类（含子类）</li>
                <li>• 材料子类须属于所选一级分类，也支持在材料分类列直接写“一级/二级”组合（如：五金电料/紧固件）</li>
                <li>• 金额由系统按“数量 × 单价”自动计算，旧模板中的金额列会被忽略</li>
                <li>• 导入即计入成本统计（无需审核），可直接点击“下载导入模板”获取 Excel 模板</li>
                <li>• 采购日期格式：YYYY-MM-DD（如：2024-01-15）</li>
              </ul>
            </div>
            
            {importResult && (
              <div className={`p-3 rounded-lg ${importResult.failed > 0 ? 'bg-orange-50' : 'bg-green-50'}`}>
                <p className="text-sm font-medium" style={{ color: importResult.failed > 0 ? '#FF7D00' : '#00B42A' }}>
                  导入完成：成功 {importResult.success} 条，失败 {importResult.failed} 条
                </p>
                {importResult.errors.length > 0 && (
                  <div className="mt-2 max-h-48 overflow-y-auto text-xs space-y-1 pr-1" style={{ color: '#F53F3F' }}>
                    {importResult.errors.map((err, idx) => (
                      <p key={idx}>{err}</p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
            <Button variant="outline" onClick={() => setImportDialogOpen(false)}>关闭</Button>
            <Button onClick={handleImport} disabled={importing || !importFile} style={{ backgroundColor: 'var(--color-primary)' }}>
              {importing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  导入中...
                </>
              ) : '开始导入'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
