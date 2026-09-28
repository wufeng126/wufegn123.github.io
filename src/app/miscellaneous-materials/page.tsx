'use client';
import { useToast } from '@/hooks/use-toast';

import { useState, useEffect, Suspense } from 'react';
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
  Plus, Pencil, Trash2, Search, Download, Upload, ChevronLeft, ChevronRight,
  Package, FileSpreadsheet, Loader2, Camera, Mic, Sparkles,
  CheckCircle2, RotateCcw, Ban
} from 'lucide-react';

type MaterialStatus = 'draft' | 'reviewed' | 'voided';

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
}

type AssistMode = 'image' | 'voice' | 'text';

interface RecognitionDraft {
  project_id?: string;
  material_name?: string;
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
  });
  
  // 筛选条件
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all');
  const [materialName, setMaterialName] = useState('');
  const [specification, setSpecification] = useState('');
  const [purchaser, setPurchaser] = useState('');
  const [status, setStatus] = useState<'all' | MaterialStatus>('all');
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
    specification: '',
    unit: '',
    quantity: '',
    unit_price: '',
    purchase_date: new Date().toISOString().split('T')[0],
    supplier: '',
    remark: '',
  });

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
    });
  }, [searchParams]);

  useEffect(() => {
    fetchMaterials(1);
  }, [selectedProjectId, startDate, endDate]);

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

  // 重置表单
  const resetForm = () => {
    setForm({
      project_id: '',
      material_name: '',
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
    setForm({
      project_id: draft.project_id || (selectedProjectId !== 'all' ? selectedProjectId : ''),
      material_name: draft.material_name || '',
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
    if (material.status === 'reviewed') {
      toast({ title: '请先反审核', description: '已审核记录需要先反审核，才能修改数量和金额', variant: 'error' });
      return;
    }
    setCurrentMaterial(material);
    setForm({
      project_id: material.project_id.toString(),
      material_name: material.material_name,
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
  const downloadTemplate = () => {
    const headers = ['项目名称', '材料名称', '规格型号', '单位', '数量', '单价', '采购日期', '采购人', '备注'];
    const example1 = ['XX项目', 'C30混凝土', 'C30商品混凝土', 'm³', '100', '380', '2024-01-15', '张三', '主体结构用'];
    const example2 = ['XX项目', '钢筋', 'HRB400 Φ12', '吨', '5', '4200', '2024-01-16', '李四', ''];
    const csvContent = '\uFEFF' + [headers.join(','), example1.join(','), example2.join(',')].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = '零星材料导入模板.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
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
              onClick={() => handleStatusChange(material, 'draft')}
              disabled={isUpdating}
              className="h-8 px-2"
              title="反审核"
              aria-label="反审核"
            >
              {isUpdating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4" style={{ color: '#D46B08' }} />
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
          </>
        )}

        {material.status === 'voided' && (
          <span className="px-2 text-xs" style={{ color: 'var(--color-text-3)' }}>
            只读留痕
          </span>
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
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg" style={{ backgroundColor: '#E8F3FF' }}>
                <CheckCircle2 className="h-5 w-5" style={{ color: 'var(--color-primary)' }} />
              </div>
              <div>
                <p className="text-sm" style={{ color: 'var(--color-text-3)' }}>已审核金额</p>
                <p className="text-xl font-bold" style={{ color: 'var(--foreground)' }}>¥{formatAmount(stats.reviewedAmount)}</p>
                <p className="text-xs mt-1" style={{ color: 'var(--color-text-3)' }}>{stats.reviewedCount} 笔进入成本</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg" style={{ backgroundColor: '#FFF7E8' }}>
                <FileSpreadsheet className="h-5 w-5" style={{ color: '#D46B08' }} />
              </div>
              <div>
                <p className="text-sm" style={{ color: 'var(--color-text-3)' }}>待审核金额</p>
                <p className="text-xl font-bold" style={{ color: 'var(--foreground)' }}>¥{formatAmount(stats.draftAmount)}</p>
                <p className="text-xs mt-1" style={{ color: 'var(--color-text-3)' }}>{stats.draftCount} 笔待核对</p>
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
                setStartDate('');
                setEndDate('');
                setTimeout(() => {
                  fetchMaterials(1);
                  fetchStats();
                }, 0);
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
                        <p className="truncate text-sm font-semibold" style={{ color: 'var(--foreground)' }}>{material.material_name}</p>
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
                  onChange={(e) => setForm({ ...form, material_name: e.target.value })}
                />
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
                  onChange={(e) => setForm({ ...form, material_name: e.target.value })}
                />
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
                <li>• 可选列：规格型号、单位、采购日期、采购人、备注</li>
                <li>• 金额由系统按“数量 × 单价”自动计算，旧模板中的金额列会被忽略</li>
                <li>• 导入记录默认进入草稿，审核后才计入成本统计</li>
                <li>• 采购日期格式：YYYY-MM-DD（如：2024-01-15）</li>
              </ul>
            </div>
            
            {importResult && (
              <div className={`p-3 rounded-lg ${importResult.failed > 0 ? 'bg-orange-50' : 'bg-green-50'}`}>
                <p className="text-sm font-medium" style={{ color: importResult.failed > 0 ? '#FF7D00' : '#00B42A' }}>
                  导入完成：成功 {importResult.success} 条，失败 {importResult.failed} 条
                </p>
                {importResult.errors.length > 0 && (
                  <div className="mt-2 text-xs space-y-1" style={{ color: '#F53F3F' }}>
                    {importResult.errors.slice(0, 5).map((err, idx) => (
                      <p key={idx}>{err}</p>
                    ))}
                    {importResult.errors.length > 5 && (
                      <p>... 还有 {importResult.errors.length - 5} 条错误</p>
                    )}
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
