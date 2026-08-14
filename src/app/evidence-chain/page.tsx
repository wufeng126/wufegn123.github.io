'use client';

import { ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import {
  Archive,
  AlertCircle,
  ArrowRight,
  BadgeDollarSign,
  BookOpenCheck,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  ChevronRight,
  Download,
  Edit3,
  ExternalLink,
  FileArchive,
  FileSpreadsheet,
  FileText,
  Filter,
  Image,
  Link2,
  Loader2,
  MessageSquareText,
  Paperclip,
  Plus,
  Save,
  Search,
  Tag,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';

type ProjectOption = {
  id: number;
  name: string;
};

type VisaOption = {
  id: number;
  visa_number: string | null;
  visa_name: string | null;
  visa_amount: number | string | null;
  status: string | null;
};

type EvidenceAttachment =
  | string
  | {
      name?: string;
      size?: number | null;
      type?: string | null;
      storageKey?: string;
      key?: string;
      uploadedAt?: string;
      url?: string;
    };

type EvidenceRecord = {
  id: number;
  project_id: number;
  project_name: string;
  event_date: string;
  title: string;
  evidence_type: string;
  source: string | null;
  importance: string;
  follow_status: string;
  handling_result: string | null;
  linked_visa_id: number | null;
  linked_visa_number: string | null;
  handling_note: string | null;
  amount_direction: string;
  estimated_amount: number | null;
  summary: string | null;
  attachments: EvidenceAttachment[];
  related: string[];
  tags: string[];
  owner_user_id: number | null;
  owner_name: string | null;
  created_by_name: string | null;
  created_at: string;
};

type EvidenceSummary = {
  count: number;
  risk_count: number;
  required_count: number;
  estimated_amount: number;
};

type EvidenceForm = {
  id?: number;
  project_id: string;
  event_date: string;
  title: string;
  evidence_type: string;
  source: string;
  importance: string;
  follow_status: string;
  handling_result: string;
  linked_visa_id: string;
  linked_visa_number: string;
  handling_note: string;
  amount_direction: string;
  estimated_amount: string;
  summary: string;
  attachments: EvidenceAttachment[];
  related: string;
  tags: string;
  owner_name: string;
};

const EVIDENCE_TYPES = ['甲方回复', '图纸答疑', '设计变更', '合同外施工', '会议纪要', '结算争议', '现场照片', '其他'];
const IMPORTANCE_OPTIONS = ['普通留痕', '重点关注', '必须结算', '争议风险'];
const STATUS_OPTIONS = ['未处理', '待补资料', '已形成签证', '已进入结算', '已关闭'];
const HANDLING_RESULT_OPTIONS = ['待判断', '走签证', '走补充协议', '纳入结算', '无需处理'];
const AMOUNT_OPTIONS = ['可能增加收入', '可能减少收入', '仅留痕/暂不确定'];
const QUICK_TAGS = ['甲方确认', '合同外', '需签证', '待补资料', '争议风险', '结算可用'];

const EVIDENCE_TYPE_GUIDES = [
  { name: '甲方回复', example: '群聊、函件、邮件、书面确认' },
  { name: '图纸答疑', example: '设计回复、答疑纪要、技术核定' },
  { name: '设计变更', example: '变更图纸、图纸签收、方案调整' },
  { name: '合同外施工', example: '新增工序、临时指令、赶工措施' },
  { name: '会议纪要', example: '现场会议、专题会议、结算沟通' },
  { name: '结算争议', example: '扣减争议、口径分歧、商务回复' },
];

function emptyForm(): EvidenceForm {
  return {
    project_id: '',
    event_date: new Date().toISOString().slice(0, 10),
    title: '',
    evidence_type: '甲方回复',
    source: '',
    importance: '重点关注',
    follow_status: '未处理',
    handling_result: '待判断',
    linked_visa_id: '',
    linked_visa_number: '',
    handling_note: '',
    amount_direction: '可能增加收入',
    estimated_amount: '',
    summary: '',
    attachments: [],
    related: '',
    tags: '',
    owner_name: '',
  };
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

function formatMoney(value: number | null | undefined) {
  if (value === null || value === undefined || Number(value) === 0) return '暂不确定';
  return `¥${Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 0 })}`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return '-';
  return String(value).slice(0, 10);
}

function formatTimelineDate(value: string | null | undefined) {
  const formatted = formatDate(value);
  if (formatted === '-') return { year: '-', monthDay: '-' };
  const [year, month, day] = formatted.split('-');
  return { year, monthDay: `${month}.${day}` };
}

function formatFileSize(size: number | null | undefined) {
  if (!size) return '';
  if (size < 1024) return `${size}B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)}KB`;
  return `${(size / 1024 / 1024).toFixed(1)}MB`;
}

function splitLines(value: string) {
  return value
    .split(/\r?\n|,|，/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function joinLines(value: string[] | null | undefined) {
  return (value || []).join('\n');
}

function getAttachmentName(attachment: EvidenceAttachment) {
  if (typeof attachment === 'string') return attachment;
  return attachment.name || attachment.storageKey || attachment.key || '未命名附件';
}

function getAttachmentUrl(attachment: EvidenceAttachment) {
  return typeof attachment === 'string' ? '' : attachment.url || '';
}

function getAttachmentSize(attachment: EvidenceAttachment) {
  return typeof attachment === 'string' ? null : attachment.size;
}

function sanitizeAttachmentForSave(attachment: EvidenceAttachment) {
  if (typeof attachment === 'string') return attachment;
  return {
    name: attachment.name || attachment.storageKey || attachment.key || '未命名附件',
    size: attachment.size || null,
    type: attachment.type || 'application/octet-stream',
    storageKey: attachment.storageKey || attachment.key || '',
    uploadedAt: attachment.uploadedAt || new Date().toISOString(),
  };
}

function toneForImportance(value: string) {
  if (value === '必须结算') return 'bg-emerald-50 text-emerald-700 ring-emerald-100';
  if (value === '争议风险') return 'bg-rose-50 text-rose-700 ring-rose-100';
  if (value === '重点关注') return 'bg-blue-50 text-blue-700 ring-blue-100';
  return 'bg-muted text-muted-foreground ring-slate-200';
}

function toneForStatus(value: string) {
  if (value === '已进入结算') return 'bg-cyan-50 text-cyan-700 ring-cyan-100';
  if (value === '已形成签证') return 'bg-violet-50 text-violet-700 ring-violet-100';
  if (value === '待补资料') return 'bg-amber-50 text-amber-700 ring-amber-100';
  if (value === '已关闭') return 'bg-muted text-muted-foreground ring-slate-200';
  return 'bg-orange-50 text-orange-700 ring-orange-100';
}

function toneForHandlingResult(value: string | null | undefined) {
  if (value === '走签证') return 'bg-violet-50 text-violet-700 ring-violet-100';
  if (value === '走补充协议') return 'bg-indigo-50 text-indigo-700 ring-indigo-100';
  if (value === '纳入结算') return 'bg-cyan-50 text-cyan-700 ring-cyan-100';
  if (value === '无需处理') return 'bg-muted text-muted-foreground ring-slate-200';
  return 'bg-amber-50 text-amber-700 ring-amber-100';
}

function toneForAmount(value: string) {
  if (value === '可能增加收入') return 'bg-emerald-50 text-emerald-700 ring-emerald-100';
  if (value === '可能减少收入') return 'bg-rose-50 text-rose-700 ring-rose-100';
  return 'bg-muted text-muted-foreground ring-slate-200';
}

/* ===== 超期断裂检测（防忘记核心） ===== */
const OVERDUE_WARN_DAYS = 30;
const OVERDUE_DANGER_DAYS = 60;

// 未闭环状态 + 距事件日期超过阈值 → 返回超期天数（否则 null）
function getOverdueDays(record: EvidenceRecord): number | null {
  const open = record.follow_status === '未处理' || record.follow_status === '待补资料';
  if (!open || !record.event_date) return null;
  const days = Math.floor((Date.now() - new Date(record.event_date).getTime()) / 86400000);
  return days > 0 ? days : null;
}

// 时间线节点颜色：超期红/橙，否则按状态语义
function dotColorForStatus(value: string, overdue: number | null): string {
  if (overdue !== null) {
    return overdue > OVERDUE_DANGER_DAYS
      ? 'border-rose-600 bg-rose-500'
      : 'border-amber-500 bg-amber-400';
  }
  if (value === '已关闭') return 'border-border bg-slate-300';
  if (value === '已进入结算') return 'border-emerald-500 bg-emerald-400';
  if (value === '已形成签证') return 'border-violet-500 bg-violet-400';
  if (value === '待补资料') return 'border-amber-500 bg-amber-400';
  return 'border-blue-500 bg-blue-400';
}

// 超期徽标文案
function overdueLabel(days: number): string {
  return days > OVERDUE_DANGER_DAYS ? `断裂 ${days} 天` : `超期 ${days} 天`;
}

function evidenceCompleteness(record: EvidenceRecord) {
  let score = 20;
  if (record.summary) score += 25;
  if (record.source) score += 15;
  if ((record.attachments || []).length > 0) score += 20;
  if ((record.related || []).length > 0) score += 10;
  if ((record.tags || []).length > 0) score += 10;
  if (record.handling_result && record.handling_result !== '待判断') score += 10;
  return Math.min(100, score);
}

function attachmentIcon(attachment: EvidenceAttachment) {
  const name = getAttachmentName(attachment).toLowerCase();
  const type = typeof attachment === 'string' ? '' : String(attachment.type || '').toLowerCase();
  if (type.includes('image') || /\.(png|jpg|jpeg|webp|gif|bmp)$/.test(name)) return Image;
  if (name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv')) return FileSpreadsheet;
  return FileText;
}

function toForm(record: EvidenceRecord): EvidenceForm {
  return {
    id: record.id,
    project_id: String(record.project_id || ''),
    event_date: record.event_date || new Date().toISOString().slice(0, 10),
    title: record.title || '',
    evidence_type: record.evidence_type || '甲方回复',
    source: record.source || '',
    importance: record.importance || '重点关注',
    follow_status: record.follow_status || '未处理',
    handling_result: record.handling_result || '待判断',
    linked_visa_id: record.linked_visa_id ? String(record.linked_visa_id) : '',
    linked_visa_number: record.linked_visa_number || '',
    handling_note: record.handling_note || '',
    amount_direction: record.amount_direction || '可能增加收入',
    estimated_amount: record.estimated_amount ? String(record.estimated_amount) : '',
    summary: record.summary || '',
    attachments: Array.isArray(record.attachments) ? record.attachments : [],
    related: joinLines(record.related),
    tags: joinLines(record.tags),
    owner_name: record.owner_name || '',
  };
}

export default function EvidenceChainPage() {
  const { toast } = useToast();
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [records, setRecords] = useState<EvidenceRecord[]>([]);
  const [summary, setSummary] = useState<EvidenceSummary>({
    count: 0,
    risk_count: 0,
    required_count: 0,
    estimated_amount: 0,
  });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [projectId, setProjectId] = useState('all');
  const [keyword, setKeyword] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [importanceFilter, setImportanceFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [needsMigration, setNeedsMigration] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState<EvidenceForm>(emptyForm);
  const [visaOptions, setVisaOptions] = useState<VisaOption[]>([]);
  const [loadingVisas, setLoadingVisas] = useState(false);

  const sortedRecords = useMemo(() => {
    return [...records].sort((a, b) => {
      const dateDiff = new Date(b.event_date || b.created_at).getTime() - new Date(a.event_date || a.created_at).getTime();
      if (dateDiff !== 0) return dateDiff;
      return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
    });
  }, [records]);

  const timelineRecords = useMemo(() => {
    if (importanceFilter === 'all') return sortedRecords;
    return sortedRecords.filter((record) => record.importance === importanceFilter);
  }, [importanceFilter, sortedRecords]);

  // 按事件月份分组（组内按事件日期倒序）
  const monthGroups = useMemo(() => {
    const byEvent = [...timelineRecords].sort((a, b) =>
      new Date(b.event_date || 0).getTime() - new Date(a.event_date || 0).getTime()
    );
    const groups: Array<{ key: string; label: string; records: EvidenceRecord[]; totalAmount: number }> = [];
    for (const record of byEvent) {
      const key = (record.event_date || '').slice(0, 7);
      const label = key ? `${Number(key.slice(5, 7))}月` : '未标注';
      const last = groups[groups.length - 1];
      const amount = record.amount_direction === '可能增加收入'
        ? (record.estimated_amount || 0)
        : record.amount_direction === '可能减少收入'
          ? -(record.estimated_amount || 0)
          : 0;
      if (last && last.key === key) {
        last.records.push(record);
        last.totalAmount += amount;
      } else {
        groups.push({ key, label, records: [record], totalAmount: amount });
      }
    }
    return groups;
  }, [timelineRecords]);

  const selectedRecord = useMemo(() => {
    if (timelineRecords.length === 0) return null;
    return timelineRecords.find((record) => record.id === selectedId) || timelineRecords[0];
  }, [timelineRecords, selectedId]);

  const loadProjects = useCallback(async () => {
    try {
      const res = await fetch('/api/projects');
      const data = await res.json();
      const rows = Array.isArray(data.projects) ? data.projects : [];
      setProjects(rows.map((project: { id: number | string; name?: string }) => ({ id: Number(project.id), name: String(project.name || '') })));
    } catch (error) {
      console.error('加载项目失败:', error);
    }
  }, []);

  const loadVisaOptions = useCallback(async (projectIdValue: string) => {
    if (!projectIdValue) {
      setVisaOptions([]);
      return;
    }

    setLoadingVisas(true);
    try {
      const params = new URLSearchParams({
        projectId: projectIdValue,
        pageSize: '100',
      });
      const res = await fetch(`/api/visas?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '加载签证单失败');
      setVisaOptions(Array.isArray(data.visas) ? data.visas : []);
    } catch (error) {
      console.error('加载签证单失败:', error);
      setVisaOptions([]);
    } finally {
      setLoadingVisas(false);
    }
  }, []);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (projectId !== 'all') params.set('projectId', projectId);
      if (keyword.trim()) params.set('keyword', keyword.trim());
      if (typeFilter !== 'all') params.set('type', typeFilter);
      if (statusFilter !== 'all') params.set('status', statusFilter);

      const res = await fetch(`/api/evidence-chain?${params.toString()}`);
      const data = await res.json();
      if (!res.ok || data.success === false) throw new Error(data.error || '加载失败');
      const nextRecords = Array.isArray(data.data?.records) ? data.data.records : [];
      setRecords(nextRecords);
      setSummary(data.data?.summary || { count: 0, risk_count: 0, required_count: 0, estimated_amount: 0 });
      setNeedsMigration(Boolean(data.data?.needs_migration));
      setSelectedId((current) => {
        if (nextRecords.some((record: EvidenceRecord) => record.id === current)) return current;
        return nextRecords[0]?.id || null;
      });
    } catch (error) {
      console.error('加载结算证据链失败:', error);
      setRecords([]);
      setSummary({ count: 0, risk_count: 0, required_count: 0, estimated_amount: 0 });
    } finally {
      setLoading(false);
    }
  }, [keyword, projectId, statusFilter, typeFilter]);

  useEffect(() => {
    const timer = window.setTimeout(loadProjects, 0);
    return () => window.clearTimeout(timer);
  }, [loadProjects]);

  useEffect(() => {
    const timer = window.setTimeout(loadRecords, 250);
    return () => window.clearTimeout(timer);
  }, [loadRecords]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!drawerOpen || form.handling_result !== '走签证') {
        setVisaOptions([]);
        setLoadingVisas(false);
        return;
      }
      void loadVisaOptions(form.project_id);
    }, 200);
    return () => window.clearTimeout(timer);
  }, [drawerOpen, form.project_id, form.handling_result, loadVisaOptions]);

  function patchForm<K extends keyof EvidenceForm>(key: K, value: EvidenceForm[K]) {
    setForm((current) => {
      const next = { ...current, [key]: value };
      if (key === 'project_id') {
        next.linked_visa_id = '';
        next.linked_visa_number = '';
      }
      if (key === 'handling_result' && value !== '走签证') {
        next.linked_visa_id = '';
        next.linked_visa_number = '';
      }
      return next;
    });
  }

  function openCreate() {
    const nextForm = emptyForm();
    if (projectId !== 'all') nextForm.project_id = projectId;
    setForm(nextForm);
    setDrawerOpen(true);
  }

  function openEdit(record: EvidenceRecord) {
    setForm(toForm(record));
    setDrawerOpen(true);
  }

  function toggleTag(tag: string) {
    const tags = splitLines(form.tags);
    const nextTags = tags.includes(tag) ? tags.filter((item) => item !== tag) : [...tags, tag];
    patchForm('tags', nextTags.join('\n'));
  }

  async function uploadAttachments(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (files.length === 0) return;

    setUploading(true);
    try {
      const formData = new FormData();
      files.forEach((file) => formData.append('files', file));
      const res = await fetch('/api/evidence-chain/attachments/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok || data.success === false) throw new Error(data.error || '附件上传失败');
      const attachments = Array.isArray(data.data?.attachments) ? data.data.attachments : [];
      setForm((current) => ({ ...current, attachments: [...current.attachments, ...attachments] }));
    } catch (error) {
      toast({ title: error instanceof Error ? error.message : '附件上传失败', variant: 'error' });
    } finally {
      setUploading(false);
    }
  }

  function removeAttachment(index: number) {
    setForm((current) => ({
      ...current,
      attachments: current.attachments.filter((_, itemIndex) => itemIndex !== index),
    }));
  }

  async function saveRecord() {
    if (!form.project_id) {
      toast({ title: '请选择所属项目', variant: 'error' });
      return;
    }
    if (!form.title.trim()) {
      toast({ title: '请填写证据标题', variant: 'error' });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        project_id: Number(form.project_id),
        linked_visa_id: form.linked_visa_id ? Number(form.linked_visa_id) : null,
        estimated_amount: form.estimated_amount ? Number(form.estimated_amount) : null,
        attachments: form.attachments.map(sanitizeAttachmentForSave),
        related: splitLines(form.related),
        tags: splitLines(form.tags),
      };
      const res = await fetch('/api/evidence-chain', {
        method: form.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || data.success === false) throw new Error(data.error || '保存失败');
      setDrawerOpen(false);
      await loadRecords();
    } catch (error) {
      toast({ title: error instanceof Error ? error.message : '保存失败', variant: 'error' });
    } finally {
      setSaving(false);
    }
  }

  async function deleteRecord(record: EvidenceRecord) {
    if (!window.confirm(`确认删除“${record.title}”吗？`)) return;
    try {
      const res = await fetch(`/api/evidence-chain?id=${record.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || data.success === false) throw new Error(data.error || '删除失败');
      await loadRecords();
    } catch (error) {
      toast({ title: error instanceof Error ? error.message : '删除失败', variant: 'error' });
    }
  }

  function exportExcel() {
    const params = new URLSearchParams();
    if (projectId !== 'all') params.set('projectId', projectId);
    window.open(`/api/evidence-chain/export?${params.toString()}`, '_blank');
  }

  return (
    <main className="min-h-full bg-background text-foreground">
      <section className="border-b border-border bg-white">
        <div className="mx-auto flex max-w-[1500px] flex-col gap-4 px-4 py-5 md:px-6 xl:px-8">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Archive className="h-4 w-4" />
                项目管理 / 结算证据链
              </div>
              <h1 className="mt-2 text-2xl font-semibold tracking-normal text-foreground">结算证据链</h1>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={exportExcel}
                className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-white px-3 text-sm font-medium text-foreground shadow-sm hover:bg-muted/50"
              >
                <FileSpreadsheet className="h-4 w-4" />
                导出台账
              </button>
              <button
                type="button"
                onClick={exportExcel}
                className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-white px-3 text-sm font-medium text-foreground shadow-sm hover:bg-muted/50"
              >
                <Download className="h-4 w-4" />
                附件清单
              </button>
              <button
                type="button"
                onClick={openCreate}
                className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-white shadow-sm hover:bg-primary/90"
              >
                <Plus className="h-4 w-4" />
                新增证据
              </button>
            </div>
          </div>

          <div className="grid gap-2 rounded-md border border-border bg-muted/50 px-4 py-3 text-sm text-foreground md:grid-cols-4">
            <div>
              <span className="text-muted-foreground">证据</span>
              <span className="ml-2 font-semibold text-foreground">{summary.count} 条</span>
            </div>
            <div>
              <span className="text-muted-foreground">必须结算</span>
              <span className="ml-2 font-semibold text-emerald-700">{summary.required_count} 条</span>
            </div>
            <div>
              <span className="text-muted-foreground">争议风险</span>
              <span className="ml-2 font-semibold text-rose-700">{summary.risk_count} 条</span>
            </div>
            <div>
              <span className="text-muted-foreground">预计影响</span>
              <span className="ml-2 font-semibold text-foreground">{formatMoney(summary.estimated_amount)}</span>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-[1500px] px-4 py-5 md:px-6 xl:px-8">
        {needsMigration && (
          <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            数据表还未创建，请先执行系统数据库迁移后再使用结算证据链。
          </div>
        )}

        <section className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)_400px]">
          <aside className="h-fit rounded-md border border-border bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Filter className="h-4 w-4" />
              筛选
            </div>

            <div className="mt-4 space-y-4">
              <label className="block">
                <span className="text-xs font-medium text-muted-foreground">项目</span>
                <select
                  value={projectId}
                  onChange={(event) => setProjectId(event.target.value)}
                  className="mt-1 h-9 w-full rounded-md border border-border bg-white px-3 text-sm outline-none focus:border-border"
                >
                  <option value="all">全部项目</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-xs font-medium text-muted-foreground">类型</span>
                <select
                  value={typeFilter}
                  onChange={(event) => setTypeFilter(event.target.value)}
                  className="mt-1 h-9 w-full rounded-md border border-border bg-white px-3 text-sm outline-none focus:border-border"
                >
                  <option value="all">全部类型</option>
                  {EVIDENCE_TYPES.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-xs font-medium text-muted-foreground">状态</span>
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                  className="mt-1 h-9 w-full rounded-md border border-border bg-white px-3 text-sm outline-none focus:border-border"
                >
                  <option value="all">全部状态</option>
                  {STATUS_OPTIONS.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-xs font-medium text-muted-foreground">关键词</span>
                <div className="mt-1 flex h-9 items-center gap-2 rounded-md border border-border bg-white px-3">
                  <Search className="h-4 w-4 text-muted-foreground" />
                  <input
                    value={keyword}
                    onChange={(event) => setKeyword(event.target.value)}
                    placeholder="标题、附件、标签"
                    className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                  />
                </div>
              </label>
            </div>

            <div className="mt-5 border-t border-border/70 pt-4">
              <div className="text-xs font-medium text-muted-foreground">常用标签</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {QUICK_TAGS.slice(0, 5).map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setKeyword(tag)}
                    className="rounded-md bg-muted px-2 py-1 text-xs text-foreground hover:bg-muted"
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-5 rounded-md bg-primary p-3 text-white">
              <div className="flex items-center gap-2 text-sm font-medium">
                <FileArchive className="h-4 w-4" />
                结算资料包
              </div>
              <div className="mt-2 text-xs leading-5 text-muted-foreground">当前支持导出 Excel 台账，附件名称会随台账记录。</div>
            </div>
          </aside>

          <section className="rounded-md border border-border bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-border/70 px-5 py-4 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-foreground">项目时间线</h2>
                <p className="mt-1 text-xs text-muted-foreground">按发生日期倒序排列，证据不折叠。</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-muted px-2 py-1 text-sm text-muted-foreground">{timelineRecords.length} 条</span>
                <button
                  type="button"
                  onClick={() => {
                    setTypeFilter('all');
                    setStatusFilter('all');
                    setImportanceFilter('all');
                  }}
                  className={cx(
                    'rounded-md px-3 py-1.5 text-xs font-medium',
                    typeFilter === 'all' && statusFilter === 'all' && importanceFilter === 'all'
                      ? 'bg-blue-50 text-blue-700'
                      : 'border border-border text-muted-foreground hover:bg-muted/50'
                  )}
                >
                  全部
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('待补资料')}
                  className={cx(
                    'rounded-md px-3 py-1.5 text-xs font-medium',
                    statusFilter === '待补资料' ? 'bg-blue-50 text-blue-700' : 'border border-border text-muted-foreground hover:bg-muted/50'
                  )}
                >
                  待跟进
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setImportanceFilter('争议风险');
                  }}
                  className={cx(
                    'rounded-md px-3 py-1.5 text-xs font-medium',
                    importanceFilter === '争议风险' ? 'bg-rose-50 text-rose-700' : 'border border-border text-muted-foreground hover:bg-muted/50'
                  )}
                >
                  争议风险
                </button>
              </div>
            </div>

            <div className="max-h-[760px] overflow-y-auto p-5">
              {loading ? (
                <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  正在加载证据链
                </div>
              ) : timelineRecords.length === 0 ? (
                <div className="flex min-h-[360px] flex-col items-center justify-center rounded-md border border-dashed border-border bg-muted/50 text-center">
                  <BookOpenCheck className="h-9 w-9 text-muted-foreground" />
                  <div className="mt-3 text-sm font-medium text-foreground">暂无匹配证据</div>
                  <div className="mt-1 text-xs text-muted-foreground">调整筛选条件或新增一条结算证据。</div>
                </div>
              ) : (
                <div className="relative pl-4">
                  <div className="absolute bottom-2 left-[5px] top-2 w-px bg-border" />
                  <div className="space-y-5">
                  {monthGroups.map((group) => {
                    const groupAmount = group.totalAmount;
                    return (
                      <div key={group.key || 'none'}>
                        {/* 月份组头：当月项数 + 影响金额 */}
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <span className="text-xs font-semibold text-foreground">
                            {group.key ? `${group.key.slice(0, 4)}年${group.label}` : group.label}
                          </span>
                          <span className="text-xs text-muted-foreground tabular-nums">{group.records.length} 项</span>
                          {groupAmount !== 0 && (
                            <span className={cx('text-xs font-semibold tabular-nums', groupAmount > 0 ? 'text-emerald-600' : 'text-rose-600')}>
                              影响 {groupAmount > 0 ? '+' : ''}{formatMoney(groupAmount)}
                            </span>
                          )}
                        </div>

                        <div className="space-y-3">
                        {group.records.map((record) => {
                          const selected = selectedRecord?.id === record.id;
                          const date = formatTimelineDate(record.event_date);
                          const overdue = getOverdueDays(record);
                          return (
                            <button
                              key={record.id}
                              type="button"
                              onClick={() => setSelectedId(record.id)}
                              className={cx(
                                'group relative w-full rounded-md border bg-card p-4 text-left transition',
                                selected
                                  ? 'border-primary shadow-[0_12px_30px_rgba(22,93,255,0.08)]'
                                  : 'border-border hover:border-border/80 hover:bg-muted/40'
                              )}
                            >
                              <span
                                className={cx(
                                  'absolute -left-[18px] top-5 h-3 w-3 rounded-full border-2 bg-card',
                                  dotColorForStatus(record.follow_status, overdue),
                                  overdue !== null && 'animate-pulse',
                                  selected && 'ring-2 ring-primary/30'
                                )}
                              />
                              <div className="grid gap-4 md:grid-cols-[74px_minmax(0,1fr)_150px]">
                                <div>
                                  <div className="text-lg font-semibold tabular-nums text-foreground">{date.monthDay}</div>
                                  <div className="text-xs text-muted-foreground">{date.year}</div>
                                </div>
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">{record.evidence_type || '其他'}</span>
                                    <span className={cx('rounded-md px-2 py-1 text-xs font-medium ring-1', toneForImportance(record.importance))}>
                                      {record.importance || '普通留痕'}
                                    </span>
                                    <span className={cx('rounded-md px-2 py-1 text-xs font-medium ring-1', toneForStatus(record.follow_status))}>
                                      {record.follow_status || '未处理'}
                                    </span>
                                    <span className={cx('rounded-md px-2 py-1 text-xs font-medium ring-1', toneForHandlingResult(record.handling_result))}>
                                      {record.handling_result || '待判断'}
                                    </span>
                                    {overdue !== null && (
                                      <span className={cx(
                                        'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold ring-1',
                                        overdue > OVERDUE_DANGER_DAYS
                                          ? 'bg-rose-50 text-rose-700 ring-rose-200'
                                          : 'bg-amber-50 text-amber-700 ring-amber-200'
                                      )}>
                                        <AlertCircle className="h-3 w-3" />
                                        {overdueLabel(overdue)}
                                      </span>
                                    )}
                                  </div>
                                  <h3 className="mt-2 truncate text-base font-semibold text-foreground">{record.title}</h3>
                                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                    <span className="inline-flex items-center gap-1">
                                      <Building2 className="h-3.5 w-3.5" />
                                      {record.project_name || '未命名项目'}
                                    </span>
                                    <span className="inline-flex items-center gap-1">
                                      <Paperclip className="h-3.5 w-3.5" />
                                      {(record.attachments || []).length} 个附件
                                    </span>
                                    {(record.tags || []).length > 0 ? (
                                      <span className="inline-flex items-center gap-1">
                                        <Tag className="h-3.5 w-3.5" />
                                        {record.tags.slice(0, 2).join(' / ')}
                                      </span>
                                    ) : null}
                                  </div>
                                  <p className="mt-3 line-clamp-2 text-sm leading-6 text-muted-foreground">{record.summary || '暂无事件说明'}</p>

                                  {/* 跟进动作轨（支轨）：记录 → 留证 → 处置 */}
                                  <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 border-t pt-2.5 text-[11px] text-muted-foreground">
                                    <span className="inline-flex items-center gap-1">
                                      <FileText className="h-3 w-3" />
                                      记录 {record.created_at ? record.created_at.slice(0, 10) : '-'}
                                    </span>
                                    <ArrowRight className="h-3 w-3 opacity-50" />
                                    <span className="inline-flex items-center gap-1">
                                      <Paperclip className="h-3 w-3" />
                                      留证 {(record.attachments || []).length}
                                    </span>
                                    <ArrowRight className="h-3 w-3 opacity-50" />
                                    <span className="inline-flex items-center gap-1">
                                      <CheckCircle2 className="h-3 w-3" />
                                      {record.handling_result || '待判断'}
                                    </span>
                                    {overdue !== null && (
                                      <span className="ml-auto inline-flex items-center gap-1 font-semibold text-rose-600">
                                        <AlertCircle className="h-3 w-3" />
                                        距上次跟进 {overdue} 天
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div className="flex flex-col items-start justify-between gap-3 md:items-end">
                                  <span className={cx('rounded-md px-2 py-1 text-xs font-medium ring-1', toneForAmount(record.amount_direction))}>
                                    {record.amount_direction || '仅留痕/暂不确定'}
                                  </span>
                                  <div className="text-left md:text-right">
                                    <div className="text-xs text-muted-foreground">预计影响金额</div>
                                    <div className={cx(
                                      'mt-1 text-lg font-semibold tabular-nums',
                                      record.amount_direction === '可能增加收入' ? 'text-emerald-600'
                                        : record.amount_direction === '可能减少收入' ? 'text-rose-600'
                                        : 'text-foreground'
                                    )}>{formatMoney(record.estimated_amount)}</div>
                                  </div>
                                  <ChevronRight className={cx('h-4 w-4', selected ? 'text-primary' : 'text-muted-foreground/40')} />
                                </div>
                              </div>
                            </button>
                          );
                        })}
                        </div>
                      </div>
                    );
                  })}
                  </div>
                </div>
              )}
            </div>
          </section>

          <aside className="rounded-lg border border-border bg-white shadow-sm">
            {selectedRecord ? (
              <div className="flex h-full flex-col">
                <div className="border-b border-border/70 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cx('rounded-md px-2 py-1 text-xs font-medium ring-1', toneForImportance(selectedRecord.importance))}>
                      {selectedRecord.importance || '普通留痕'}
                    </span>
                    <span className={cx('rounded-md px-2 py-1 text-xs font-medium ring-1', toneForStatus(selectedRecord.follow_status))}>
                      {selectedRecord.follow_status || '未处理'}
                    </span>
                    <span className={cx('rounded-md px-2 py-1 text-xs font-medium ring-1', toneForHandlingResult(selectedRecord.handling_result))}>
                      {selectedRecord.handling_result || '待判断'}
                    </span>
                  </div>
                  <div className="mt-4 flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-lg font-semibold leading-7 text-foreground">{selectedRecord.title}</h2>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {selectedRecord.project_name || '未命名项目'} / {formatDate(selectedRecord.event_date)} / {selectedRecord.evidence_type || '其他'}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-xs text-muted-foreground">预计影响</div>
                      <div className="text-xl font-semibold text-foreground">{formatMoney(selectedRecord.estimated_amount)}</div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4 overflow-y-auto p-4">
                  <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-3">
                    <div className="mb-2 flex items-center justify-between text-sm font-medium text-blue-900">
                      <span>证据完整度</span>
                      <span>{evidenceCompleteness(selectedRecord)}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-white">
                      <div className="h-full rounded-full bg-blue-600" style={{ width: `${evidenceCompleteness(selectedRecord)}%` }} />
                    </div>
                  </div>

                  <div>
                    <h3 className="mb-2 text-sm font-semibold text-foreground">事件说明</h3>
                    <div className="rounded-lg border border-border bg-muted/50 p-3 text-sm leading-6 text-foreground">
                      {selectedRecord.summary || '暂无事件说明'}
                    </div>
                  </div>

                  <div>
                    <h3 className="mb-2 text-sm font-semibold text-foreground">处理结果</h3>
                    <div className="rounded-lg border border-border bg-white p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={cx('rounded-md px-2 py-1 text-xs font-medium ring-1', toneForHandlingResult(selectedRecord.handling_result))}>
                          {selectedRecord.handling_result || '待判断'}
                        </span>
                        {selectedRecord.handling_result === '走签证' && selectedRecord.linked_visa_number ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-violet-50 px-2 py-1 text-xs font-medium text-violet-700 ring-1 ring-violet-100">
                            <Link2 className="h-3.5 w-3.5" />
                            {selectedRecord.linked_visa_number}
                          </span>
                        ) : null}
                      </div>
                      {selectedRecord.handling_note ? (
                        <div className="mt-2 text-sm leading-6 text-muted-foreground">{selectedRecord.handling_note}</div>
                      ) : (
                        <div className="mt-2 text-sm text-muted-foreground">暂无处理备注</div>
                      )}
                    </div>
                  </div>

                  <div>
                    <h3 className="mb-2 text-sm font-semibold text-foreground">资料检查</h3>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm text-foreground">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        已上传 {selectedRecord.attachments?.length || 0} 个附件
                      </div>
                      <div className="flex items-center gap-2 text-sm text-foreground">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        已关联 {selectedRecord.related?.length || 0} 项业务
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="mb-2 text-sm font-semibold text-foreground">附件</h3>
                    <div className="space-y-2">
                      {(selectedRecord.attachments || []).length === 0 ? (
                        <div className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">暂无附件</div>
                      ) : (
                        selectedRecord.attachments.map((attachment, index) => {
                          const url = getAttachmentUrl(attachment);
                          const Icon = attachmentIcon(attachment);
                          return (
                            <div key={`${getAttachmentName(attachment)}-${index}`} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/50 px-3 py-2">
                              <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                              <div className="min-w-0 flex-1">
                                <div className="line-clamp-1 text-sm font-medium text-foreground">{getAttachmentName(attachment)}</div>
                                <div className="text-xs text-muted-foreground">{formatFileSize(getAttachmentSize(attachment))}</div>
                              </div>
                              {url ? (
                                <a href={url} target="_blank" rel="noreferrer" className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-white text-muted-foreground hover:text-blue-600">
                                  <ExternalLink className="h-4 w-4" />
                                </a>
                              ) : (
                                <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  <div>
                    <h3 className="mb-2 text-sm font-semibold text-foreground">业务推动</h3>
                    <div className="space-y-2">
                      {(selectedRecord.related || []).length === 0 ? (
                        <div className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">暂无关联业务</div>
                      ) : (
                        selectedRecord.related.map((item, index) => (
                          <div key={`${item}-${index}`} className="flex items-center gap-3 rounded-lg border border-border bg-muted/50 px-3 py-2">
                            <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-xs font-semibold text-blue-700 ring-1 ring-blue-100">
                              {index + 1}
                            </span>
                            <span className="text-sm text-foreground">{item}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div>
                    <h3 className="mb-2 text-sm font-semibold text-foreground">标签</h3>
                    <div className="flex flex-wrap gap-2">
                      {(selectedRecord.tags || []).length === 0 ? (
                        <span className="text-sm text-muted-foreground">暂无标签</span>
                      ) : (
                        selectedRecord.tags.map((item) => (
                          <span key={item} className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                            {item}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 border-t border-border/70 p-4">
                  <button
                    type="button"
                    onClick={() => openEdit(selectedRecord)}
                    className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-md border border-border bg-white text-sm font-medium text-foreground hover:bg-muted/50"
                  >
                    <Edit3 className="h-4 w-4" />
                    编辑
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteRecord(selectedRecord)}
                    className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-md border border-rose-200 bg-white text-sm font-medium text-rose-600 hover:bg-rose-50"
                  >
                    <Trash2 className="h-4 w-4" />
                    删除
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex h-80 flex-col items-center justify-center p-6 text-center">
                <FileText className="h-8 w-8 text-muted-foreground" />
                <div className="mt-2 text-sm font-medium text-foreground">请选择一条证据</div>
                <div className="mt-1 text-xs text-muted-foreground">详情会在这里展示。</div>
              </div>
            )}
          </aside>
        </section>
      </div>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-primary/30">
          <button type="button" aria-label="关闭" className="absolute inset-0 cursor-default" onClick={() => setDrawerOpen(false)} />
          <div className="relative flex h-full w-full max-w-[760px] flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">{form.id ? '编辑证据' : '新增证据'}</h2>
                <p className="mt-1 text-sm text-muted-foreground">把可能影响结算的关键资料沉淀到项目时间线中。</p>
              </div>
              <button type="button" onClick={() => setDrawerOpen(false)} className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted/50">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
                <div className="space-y-2">
                  {EVIDENCE_TYPE_GUIDES.map((item) => (
                    <button
                      key={item.name}
                      type="button"
                      onClick={() => patchForm('evidence_type', item.name)}
                      className={cx(
                        'w-full rounded-md border px-3 py-3 text-left transition',
                        form.evidence_type === item.name
                          ? 'border-primary bg-primary text-white'
                          : 'border-border bg-white text-foreground hover:bg-muted/50'
                      )}
                    >
                      <div className="text-sm font-medium">{item.name}</div>
                      <div className={cx('mt-1 text-xs', form.evidence_type === item.name ? 'text-muted-foreground' : 'text-muted-foreground')}>
                        {item.example}
                      </div>
                    </button>
                  ))}
                </div>

                <div className="space-y-5">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <BriefcaseBusiness className="h-4 w-4" />
                基础信息
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-sm font-medium text-foreground">所属项目</span>
                  <select
                    value={form.project_id}
                    onChange={(event) => patchForm('project_id', event.target.value)}
                    className="h-10 w-full rounded-md border border-border bg-white px-3 text-sm outline-none focus:border-blue-400"
                  >
                    <option value="">请选择项目</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-medium text-foreground">事件日期</span>
                  <input
                    type="date"
                    value={form.event_date}
                    onChange={(event) => patchForm('event_date', event.target.value)}
                    className="h-10 w-full rounded-md border border-border px-3 text-sm outline-none focus:border-blue-400"
                  />
                </label>
              </div>

              <label className="block space-y-1">
                <span className="text-sm font-medium text-foreground">证据标题</span>
                <input
                  value={form.title}
                  onChange={(event) => patchForm('title', event.target.value)}
                  placeholder="例如：甲方要求地下室增加止水钢板加固"
                  className="h-10 w-full rounded-md border border-border px-3 text-sm outline-none focus:border-blue-400"
                />
              </label>

              <div className="grid gap-4 md:grid-cols-3">
                <label className="space-y-1">
                  <span className="text-sm font-medium text-foreground">证据类型</span>
                  <select value={form.evidence_type} onChange={(event) => patchForm('evidence_type', event.target.value)} className="h-10 w-full rounded-md border border-border bg-white px-3 text-sm outline-none focus:border-blue-400">
                    {EVIDENCE_TYPES.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-medium text-foreground">重要程度</span>
                  <select value={form.importance} onChange={(event) => patchForm('importance', event.target.value)} className="h-10 w-full rounded-md border border-border bg-white px-3 text-sm outline-none focus:border-blue-400">
                    {IMPORTANCE_OPTIONS.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-medium text-foreground">跟进状态</span>
                  <select value={form.follow_status} onChange={(event) => patchForm('follow_status', event.target.value)} className="h-10 w-full rounded-md border border-border bg-white px-3 text-sm outline-none focus:border-blue-400">
                    {STATUS_OPTIONS.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <label className="space-y-1 md:col-span-2">
                  <span className="text-sm font-medium text-foreground">金额影响</span>
                  <select value={form.amount_direction} onChange={(event) => patchForm('amount_direction', event.target.value)} className="h-10 w-full rounded-md border border-border bg-white px-3 text-sm outline-none focus:border-blue-400">
                    {AMOUNT_OPTIONS.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-medium text-foreground">预计影响金额</span>
                  <input
                    type="number"
                    value={form.estimated_amount}
                    onChange={(event) => patchForm('estimated_amount', event.target.value)}
                    placeholder="0"
                    className="h-10 w-full rounded-md border border-border px-3 text-sm outline-none focus:border-blue-400"
                  />
                </label>
              </div>

              <div className="rounded-md border border-border p-4">
                <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
                  <BadgeDollarSign className="h-4 w-4" />
                  金额与处理
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-1">
                    <span className="text-sm font-medium text-foreground">处理结果</span>
                    <select
                      value={form.handling_result}
                      onChange={(event) => patchForm('handling_result', event.target.value)}
                      className="h-10 w-full rounded-md border border-border bg-white px-3 text-sm outline-none focus:border-blue-400"
                    >
                      {HANDLING_RESULT_OPTIONS.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </label>

                  {form.handling_result === '走签证' ? (
                    <label className="space-y-1">
                      <span className="text-sm font-medium text-foreground">关联签证单</span>
                      <select
                        value={form.linked_visa_id}
                        onChange={(event) => {
                          const visaId = event.target.value;
                          const visa = visaOptions.find((item) => String(item.id) === visaId);
                          setForm((current) => ({
                            ...current,
                            linked_visa_id: visaId,
                            linked_visa_number: visa?.visa_number || '',
                          }));
                        }}
                        disabled={!form.project_id || loadingVisas}
                        className="h-10 w-full rounded-md border border-border bg-white px-3 text-sm outline-none focus:border-blue-400 disabled:bg-muted disabled:text-muted-foreground"
                      >
                        <option value="">{loadingVisas ? '正在加载签证单...' : '暂不关联具体签证单'}</option>
                        {visaOptions.map((visa) => (
                          <option key={visa.id} value={visa.id}>
                            {visa.visa_number || `签证-${visa.id}`} / {visa.visa_name || '未命名'} / {visa.status || '未处理'} / {formatMoney(Number(visa.visa_amount) || null)}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                </div>

                <label className="mt-4 block space-y-1">
                  <span className="text-sm font-medium text-foreground">
                    {form.handling_result === '走补充协议' ? '补充协议说明' : '处理备注'}
                  </span>
                  <textarea
                    value={form.handling_note}
                    onChange={(event) => patchForm('handling_note', event.target.value)}
                    rows={3}
                    placeholder={form.handling_result === '走补充协议' ? '例如：后续按补充协议方式与甲方确认范围、单价和金额' : '记录后续处理口径、责任人或需要补充的资料'}
                    className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm leading-6 outline-none focus:border-blue-400"
                  />
                </label>
              </div>

              <label className="block space-y-1">
                <span className="text-sm font-medium text-foreground">来源</span>
                <input
                  value={form.source}
                  onChange={(event) => patchForm('source', event.target.value)}
                  placeholder="例如：甲方项目群聊天截图、会议纪要、图纸答疑文件"
                  className="h-10 w-full rounded-md border border-border px-3 text-sm outline-none focus:border-blue-400"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-sm font-medium text-foreground">事件说明</span>
                <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-foreground">
                  <MessageSquareText className="h-4 w-4" />
                  证据摘要
                </div>
                <textarea
                  value={form.summary}
                  onChange={(event) => patchForm('summary', event.target.value)}
                  rows={5}
                  placeholder="说明事情发生背景、甲方要求、现场影响、后续结算建议等"
                  className="w-full rounded-md border border-border px-3 py-2 text-sm leading-6 outline-none focus:border-blue-400"
                />
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="block space-y-1">
                  <span className="text-sm font-medium text-foreground">关联业务</span>
                  <textarea
                    value={form.related}
                    onChange={(event) => patchForm('related', event.target.value)}
                    rows={4}
                    placeholder="每行一个，例如：签证单：VS-2026-0719"
                    className="w-full rounded-md border border-border px-3 py-2 text-sm leading-6 outline-none focus:border-blue-400"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-sm font-medium text-foreground">标签</span>
                  <textarea
                    value={form.tags}
                    onChange={(event) => patchForm('tags', event.target.value)}
                    rows={4}
                    placeholder="每行一个标签"
                    className="w-full rounded-md border border-border px-3 py-2 text-sm leading-6 outline-none focus:border-blue-400"
                  />
                </label>
              </div>

              <div>
                <div className="mb-2 flex flex-wrap gap-2">
                  {QUICK_TAGS.map((tag) => {
                    const checked = splitLines(form.tags).includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => toggleTag(tag)}
                        className={cx(
                          'rounded-md px-2.5 py-1.5 text-xs font-medium ring-1',
                          checked ? 'bg-blue-50 text-blue-700 ring-blue-100' : 'bg-white text-muted-foreground ring-slate-200'
                        )}
                      >
                        <Tag className="mr-1 inline h-3.5 w-3.5" />
                        {tag}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-lg border border-border p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">附件</h3>
                    <p className="mt-1 text-xs text-muted-foreground">支持图片、PDF、Word、Excel等证据资料。</p>
                  </div>
                  <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-border bg-white px-3 text-sm font-medium text-foreground hover:bg-muted/50">
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
                    {uploading ? '上传中' : '上传附件'}
                    <input type="file" multiple className="hidden" onChange={uploadAttachments} />
                  </label>
                </div>
                <div className="mt-3 space-y-2">
                  {form.attachments.length === 0 ? (
                    <div className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">暂无附件</div>
                  ) : (
                    form.attachments.map((attachment, index) => (
                      <div key={`${getAttachmentName(attachment)}-${index}`} className="flex items-center justify-between gap-3 rounded-md bg-muted/50 px-3 py-2">
                        <div className="min-w-0">
                          <div className="line-clamp-1 text-sm font-medium text-foreground">{getAttachmentName(attachment)}</div>
                          <div className="text-xs text-muted-foreground">{formatFileSize(getAttachmentSize(attachment))}</div>
                        </div>
                        <button type="button" onClick={() => removeAttachment(index)} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-white hover:text-rose-600">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <label className="block space-y-1">
                <span className="text-sm font-medium text-foreground">负责人</span>
                <input
                  value={form.owner_name}
                  onChange={(event) => patchForm('owner_name', event.target.value)}
                  placeholder="默认使用当前录入人，也可填写具体负责人"
                  className="h-10 w-full rounded-md border border-border px-3 text-sm outline-none focus:border-blue-400"
                />
              </label>

              <div className="flex flex-wrap gap-2">
                <span className={cx('rounded-md px-2 py-1 text-xs font-medium ring-1', toneForAmount(form.amount_direction))}>
                  {form.amount_direction}
                </span>
                <span className={cx('rounded-md px-2 py-1 text-xs font-medium ring-1', toneForImportance(form.importance))}>
                  {form.importance}
                </span>
                <span className={cx('rounded-md px-2 py-1 text-xs font-medium ring-1', toneForStatus(form.follow_status))}>
                  {form.follow_status}
                </span>
              </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
              <button type="button" onClick={() => setDrawerOpen(false)} className="h-10 rounded-md border border-border bg-white px-4 text-sm font-medium text-foreground hover:bg-muted/50">
                取消
              </button>
              <button
                type="button"
                onClick={saveRecord}
                disabled={saving}
                className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
