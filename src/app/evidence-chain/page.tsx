'use client';

import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  BadgeDollarSign,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Download,
  Edit3,
  ExternalLink,
  FileArchive,
  FileText,
  Filter,
  Link2,
  Loader2,
  Paperclip,
  Plus,
  Save,
  Search,
  ShieldAlert,
  Tag,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';

type ProjectOption = {
  id: number;
  name: string;
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
const AMOUNT_OPTIONS = ['可能增加收入', '可能减少收入', '仅留痕/暂不确定'];
const QUICK_TAGS = ['甲方确认', '合同外', '需签证', '待补资料', '争议风险', '结算可用'];

function emptyForm(): EvidenceForm {
  return {
    project_id: '',
    event_date: new Date().toISOString().slice(0, 10),
    title: '',
    evidence_type: '甲方回复',
    source: '',
    importance: '重点关注',
    follow_status: '未处理',
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
  return 'bg-slate-100 text-slate-600 ring-slate-200';
}

function dotToneForImportance(value: string) {
  if (value === '必须结算') return 'border-emerald-500 bg-emerald-50';
  if (value === '争议风险') return 'border-rose-500 bg-rose-50';
  if (value === '重点关注') return 'border-blue-500 bg-blue-50';
  return 'border-slate-300 bg-white';
}

function toneForStatus(value: string) {
  if (value === '已进入结算') return 'bg-cyan-50 text-cyan-700 ring-cyan-100';
  if (value === '已形成签证') return 'bg-violet-50 text-violet-700 ring-violet-100';
  if (value === '待补资料') return 'bg-amber-50 text-amber-700 ring-amber-100';
  if (value === '已关闭') return 'bg-slate-100 text-slate-600 ring-slate-200';
  return 'bg-orange-50 text-orange-700 ring-orange-100';
}

function toneForAmount(value: string) {
  if (value === '可能增加收入') return 'bg-emerald-50 text-emerald-700 ring-emerald-100';
  if (value === '可能减少收入') return 'bg-rose-50 text-rose-700 ring-rose-100';
  return 'bg-slate-100 text-slate-600 ring-slate-200';
}

function evidenceCompleteness(record: EvidenceRecord) {
  let score = 20;
  if (record.summary) score += 25;
  if (record.source) score += 15;
  if ((record.attachments || []).length > 0) score += 20;
  if ((record.related || []).length > 0) score += 10;
  if ((record.tags || []).length > 0) score += 10;
  return Math.min(100, score);
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

  const selectedRecord = useMemo(() => {
    if (timelineRecords.length === 0) return null;
    return timelineRecords.find((record) => record.id === selectedId) || timelineRecords[0];
  }, [timelineRecords, selectedId]);

  const projectOverview = useMemo(() => {
    const map = new Map<number, { project_id: number; name: string; count: number; amount: number; completeness: number }>();
    timelineRecords.forEach((record) => {
      const item = map.get(record.project_id) || {
        project_id: record.project_id,
        name: record.project_name || '未命名项目',
        count: 0,
        amount: 0,
        completeness: 0,
      };
      item.count += 1;
      item.amount += Number(record.estimated_amount) || 0;
      item.completeness += evidenceCompleteness(record);
      map.set(record.project_id, item);
    });

    return Array.from(map.values())
      .map((item) => ({
        ...item,
        completeness: item.count ? Math.round(item.completeness / item.count) : 0,
      }))
      .sort((a, b) => b.amount - a.amount || b.count - a.count)
      .slice(0, 5);
  }, [timelineRecords]);

  const monthFocus = useMemo(() => {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const priority = (record: EvidenceRecord) => {
      if (record.importance === '争议风险') return 4;
      if (record.importance === '必须结算') return 3;
      if (record.follow_status === '待补资料') return 2;
      return 1;
    };
    return timelineRecords
      .filter((record) => formatDate(record.event_date).startsWith(currentMonth) || record.importance === '争议风险' || record.importance === '必须结算')
      .sort((a, b) => priority(b) - priority(a))
      .slice(0, 3);
  }, [timelineRecords]);

  async function loadProjects() {
    try {
      const res = await fetch('/api/projects');
      const data = await res.json();
      const rows = Array.isArray(data.projects) ? data.projects : [];
      setProjects(rows.map((project: { id: number | string; name?: string }) => ({ id: Number(project.id), name: String(project.name || '') })));
    } catch (error) {
      console.error('加载项目失败:', error);
    }
  }

  async function loadRecords() {
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
  }

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(loadRecords, 250);
    return () => window.clearTimeout(timer);
  }, [projectId, keyword, typeFilter, statusFilter]);

  function patchForm<K extends keyof EvidenceForm>(key: K, value: EvidenceForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
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
      alert(error instanceof Error ? error.message : '附件上传失败');
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
      alert('请选择所属项目');
      return;
    }
    if (!form.title.trim()) {
      alert('请填写证据标题');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        project_id: Number(form.project_id),
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
      alert(error instanceof Error ? error.message : '保存失败');
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
      alert(error instanceof Error ? error.message : '删除失败');
    }
  }

  function exportExcel() {
    const params = new URLSearchParams();
    if (projectId !== 'all') params.set('projectId', projectId);
    window.open(`/api/evidence-chain/export?${params.toString()}`, '_blank');
  }

  return (
    <div className="min-h-full bg-[#f5f7fb] p-3 text-slate-950 md:p-5">
      <div className="mx-auto max-w-[1500px] space-y-4">
        <section className="rounded-lg border border-blue-100 bg-gradient-to-r from-white via-blue-50/50 to-white px-5 py-4 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <FileArchive className="h-4 w-4 text-blue-600" />
                项目管理 / 结算证据链
              </div>
              <h1 className="mt-2 text-2xl font-semibold tracking-normal text-slate-950">结算证据链</h1>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
                按项目沉淀变更、甲方回复、图纸答疑、会议纪要和测算文件，后期结算时可直接按时间线追溯。
              </p>
            </div>
            <div className="min-w-[300px] rounded-lg border border-blue-100 bg-white/80 px-4 py-3 shadow-sm">
              <div className="flex items-start justify-between gap-6">
                <div>
                  <div className="text-xs text-slate-500">预计影响金额</div>
                  <div className="mt-1 text-2xl font-semibold text-slate-950">{formatMoney(summary.estimated_amount)}</div>
                </div>
                <BadgeDollarSign className="h-5 w-5 text-blue-600" />
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                <span>必须结算 {summary.required_count} 项</span>
                <span>争议风险 {summary.risk_count} 项</span>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm md:p-4">
          <div className="grid gap-3 lg:grid-cols-[220px_1fr_auto_auto_auto]">
            <label className="space-y-1">
              <span className="text-xs font-medium text-slate-500">项目</span>
              <select
                value={projectId}
                onChange={(event) => setProjectId(event.target.value)}
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-400"
              >
                <option value="all">全部项目</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-slate-500">关键词</span>
              <span className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                  placeholder="搜索甲方回复、变更、签证、金额、附件名称"
                  className="h-10 w-full rounded-md border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-blue-400"
                />
              </span>
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-slate-500">类型</span>
              <select
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value)}
                className="h-10 w-full min-w-[120px] rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-400"
              >
                <option value="all">全部类型</option>
                {EVIDENCE_TYPES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-slate-500">状态</span>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="h-10 w-full min-w-[120px] rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-400"
              >
                <option value="all">全部状态</option>
                {STATUS_OPTIONS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-end gap-2">
              <button
                type="button"
                onClick={exportExcel}
                className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <Download className="h-4 w-4" />
                导出
              </button>
              <button
                type="button"
                onClick={openCreate}
                className="inline-flex h-10 items-center gap-2 rounded-md bg-slate-950 px-3 text-sm font-medium text-white hover:bg-slate-800"
              >
                <Plus className="h-4 w-4" />
                新增
              </button>
            </div>
          </div>
        </section>

        {needsMigration && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            数据表还未创建，请先执行系统数据库迁移后再使用结算证据链。
          </div>
        )}

        <section className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)_420px]">
          <aside className="space-y-3">
            <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-950">项目概览</h2>
                <span className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600">{projectOverview.length} 个</span>
              </div>
              <div className="space-y-2">
                {projectOverview.length === 0 ? (
                  <div className="rounded-md border border-dashed border-slate-200 p-4 text-center text-sm text-slate-400">暂无项目证据</div>
                ) : (
                  projectOverview.map((project) => (
                    <button
                      key={project.project_id}
                      type="button"
                      onClick={() => setProjectId(String(project.project_id))}
                      className={cx(
                        'w-full rounded-md border p-3 text-left transition hover:border-blue-200 hover:bg-blue-50/40',
                        projectId === String(project.project_id) ? 'border-blue-200 bg-blue-50/60' : 'border-transparent bg-slate-50'
                      )}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="line-clamp-1 text-sm font-semibold text-slate-950">{project.name}</span>
                        <span className="text-xs font-semibold text-blue-700">{project.count}</span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
                        <div className="h-full rounded-full bg-blue-600" style={{ width: `${project.completeness}%` }} />
                      </div>
                      <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                        <span>影响 {formatMoney(project.amount)}</span>
                        <span>完整度 {project.completeness}%</span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-amber-600" />
                <h2 className="text-sm font-semibold text-slate-950">本月关注</h2>
              </div>
              <div className="space-y-2">
                {monthFocus.length === 0 ? (
                  <div className="rounded-md bg-slate-50 p-3 text-sm text-slate-400">暂无重点事项</div>
                ) : (
                  monthFocus.map((record) => (
                    <button
                      key={record.id}
                      type="button"
                      onClick={() => setSelectedId(record.id)}
                      className="w-full rounded-md bg-slate-50 p-3 text-left text-sm leading-6 text-slate-700 hover:bg-blue-50"
                    >
                      <span className="line-clamp-2">{record.title}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          </aside>

          <main className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-semibold text-slate-950">证据时间线</h2>
                  <span className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600">{timelineRecords.length} 条</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">按事件日期倒序排列，点击记录查看完整附件和关联业务。</p>
              </div>
              <div className="flex flex-wrap gap-2">
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
                      : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                  )}
                >
                  全部
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('待补资料')}
                  className={cx(
                    'rounded-md px-3 py-1.5 text-xs font-medium',
                    statusFilter === '待补资料' ? 'bg-blue-50 text-blue-700' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
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
                    importanceFilter === '争议风险' ? 'bg-rose-50 text-rose-700' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                  )}
                >
                  争议风险
                </button>
              </div>
            </div>

            <div className="max-h-[760px] overflow-y-auto px-4 py-4">
              {loading ? (
                <div className="flex h-56 items-center justify-center text-sm text-slate-500">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  正在加载证据链
                </div>
              ) : timelineRecords.length === 0 ? (
                <div className="flex h-56 flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 text-center">
                  <FileArchive className="h-8 w-8 text-slate-300" />
                  <div className="mt-2 text-sm font-medium text-slate-700">暂无结算证据</div>
                  <div className="mt-1 text-xs text-slate-400">点击新增证据，把后期可用于结算的资料先沉淀下来。</div>
                </div>
              ) : (
                <div className="relative space-y-4 pl-6">
                  <div className="absolute bottom-2 left-[9px] top-2 w-px bg-slate-200" />
                  {timelineRecords.map((record) => {
                    const selected = selectedRecord?.id === record.id;
                    return (
                      <button
                        key={record.id}
                        type="button"
                        onClick={() => setSelectedId(record.id)}
                        className={cx(
                          'relative w-full rounded-lg border bg-white p-4 text-left shadow-sm transition hover:border-blue-200 hover:bg-blue-50/30',
                          selected ? 'border-blue-200 bg-blue-50/40 ring-1 ring-blue-100' : 'border-slate-200'
                        )}
                      >
                        <span className={cx('absolute -left-[27px] top-6 h-5 w-5 rounded-full border-4', dotToneForImportance(record.importance))} />
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-semibold text-slate-950">{formatDate(record.event_date)}</span>
                              <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">{record.evidence_type || '其他'}</span>
                              <span className={cx('rounded-md px-2 py-1 text-xs font-medium ring-1', toneForImportance(record.importance))}>
                                {record.importance || '普通留痕'}
                              </span>
                              <span className={cx('rounded-md px-2 py-1 text-xs font-medium ring-1', toneForStatus(record.follow_status))}>
                                {record.follow_status || '未处理'}
                              </span>
                            </div>
                            <h3 className="mt-3 line-clamp-2 text-base font-semibold leading-6 text-slate-950">{record.title}</h3>
                            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                              <span>{record.project_name || '未命名项目'}</span>
                              <span>附件 {(record.attachments || []).length}</span>
                              <span>关联 {(record.related || []).length}</span>
                            </div>
                          </div>
                          <div className="shrink-0 text-left md:text-right">
                            <div className="text-xs text-slate-400">预计影响</div>
                            <div className="mt-1 text-lg font-semibold text-slate-950">{formatMoney(record.estimated_amount)}</div>
                            <div className="mt-2 flex items-center gap-1 text-xs text-blue-600 md:justify-end">
                              <span>{evidenceCompleteness(record)}%完整</span>
                              <ChevronRight className="h-3.5 w-3.5" />
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </main>

          <aside className="rounded-lg border border-slate-200 bg-white shadow-sm">
            {selectedRecord ? (
              <div className="flex h-full flex-col">
                <div className="border-b border-slate-100 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cx('rounded-md px-2 py-1 text-xs font-medium ring-1', toneForImportance(selectedRecord.importance))}>
                      {selectedRecord.importance || '普通留痕'}
                    </span>
                    <span className={cx('rounded-md px-2 py-1 text-xs font-medium ring-1', toneForStatus(selectedRecord.follow_status))}>
                      {selectedRecord.follow_status || '未处理'}
                    </span>
                  </div>
                  <div className="mt-4 flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-lg font-semibold leading-7 text-slate-950">{selectedRecord.title}</h2>
                      <p className="mt-2 text-sm text-slate-500">
                        {selectedRecord.project_name || '未命名项目'} / {formatDate(selectedRecord.event_date)} / {selectedRecord.evidence_type || '其他'}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-xs text-slate-400">预计影响</div>
                      <div className="text-xl font-semibold text-slate-950">{formatMoney(selectedRecord.estimated_amount)}</div>
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
                    <h3 className="mb-2 text-sm font-semibold text-slate-950">事件说明</h3>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-700">
                      {selectedRecord.summary || '暂无事件说明'}
                    </div>
                  </div>

                  <div>
                    <h3 className="mb-2 text-sm font-semibold text-slate-950">资料检查</h3>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm text-slate-700">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        已上传 {selectedRecord.attachments?.length || 0} 个附件
                      </div>
                      <div className="flex items-center gap-2 text-sm text-slate-700">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        已关联 {selectedRecord.related?.length || 0} 项业务
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="mb-2 text-sm font-semibold text-slate-950">附件</h3>
                    <div className="space-y-2">
                      {(selectedRecord.attachments || []).length === 0 ? (
                        <div className="rounded-lg border border-dashed border-slate-200 p-3 text-sm text-slate-400">暂无附件</div>
                      ) : (
                        selectedRecord.attachments.map((attachment, index) => {
                          const url = getAttachmentUrl(attachment);
                          return (
                            <div key={`${getAttachmentName(attachment)}-${index}`} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                              <div className="min-w-0">
                                <div className="line-clamp-1 text-sm font-medium text-slate-800">{getAttachmentName(attachment)}</div>
                                <div className="text-xs text-slate-400">{formatFileSize(getAttachmentSize(attachment))}</div>
                              </div>
                              {url ? (
                                <a href={url} target="_blank" rel="noreferrer" className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:text-blue-600">
                                  <ExternalLink className="h-4 w-4" />
                                </a>
                              ) : (
                                <Paperclip className="h-4 w-4 shrink-0 text-slate-400" />
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  <div>
                    <h3 className="mb-2 text-sm font-semibold text-slate-950">业务推动</h3>
                    <div className="space-y-2">
                      {(selectedRecord.related || []).length === 0 ? (
                        <div className="rounded-lg border border-dashed border-slate-200 p-3 text-sm text-slate-400">暂无关联业务</div>
                      ) : (
                        selectedRecord.related.map((item, index) => (
                          <div key={`${item}-${index}`} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                            <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-xs font-semibold text-blue-700 ring-1 ring-blue-100">
                              {index + 1}
                            </span>
                            <span className="text-sm text-slate-700">{item}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div>
                    <h3 className="mb-2 text-sm font-semibold text-slate-950">标签</h3>
                    <div className="flex flex-wrap gap-2">
                      {(selectedRecord.tags || []).length === 0 ? (
                        <span className="text-sm text-slate-400">暂无标签</span>
                      ) : (
                        selectedRecord.tags.map((item) => (
                          <span key={item} className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                            {item}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 border-t border-slate-100 p-4">
                  <button
                    type="button"
                    onClick={() => openEdit(selectedRecord)}
                    className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50"
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
                <FileText className="h-8 w-8 text-slate-300" />
                <div className="mt-2 text-sm font-medium text-slate-700">请选择一条证据</div>
                <div className="mt-1 text-xs text-slate-400">详情会在这里展示。</div>
              </div>
            )}
          </aside>
        </section>
      </div>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/30">
          <button type="button" aria-label="关闭" className="absolute inset-0 cursor-default" onClick={() => setDrawerOpen(false)} />
          <div className="relative flex h-full w-full max-w-[760px] flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">{form.id ? '编辑证据' : '新增证据'}</h2>
                <p className="mt-1 text-sm text-slate-500">把可能影响结算的关键资料沉淀到项目时间线中。</p>
              </div>
              <button type="button" onClick={() => setDrawerOpen(false)} className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto p-5">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-sm font-medium text-slate-700">所属项目</span>
                  <select
                    value={form.project_id}
                    onChange={(event) => patchForm('project_id', event.target.value)}
                    className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-400"
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
                  <span className="text-sm font-medium text-slate-700">事件日期</span>
                  <input
                    type="date"
                    value={form.event_date}
                    onChange={(event) => patchForm('event_date', event.target.value)}
                    className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-blue-400"
                  />
                </label>
              </div>

              <label className="block space-y-1">
                <span className="text-sm font-medium text-slate-700">证据标题</span>
                <input
                  value={form.title}
                  onChange={(event) => patchForm('title', event.target.value)}
                  placeholder="例如：甲方要求地下室增加止水钢板加固"
                  className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-blue-400"
                />
              </label>

              <div className="grid gap-4 md:grid-cols-3">
                <label className="space-y-1">
                  <span className="text-sm font-medium text-slate-700">证据类型</span>
                  <select value={form.evidence_type} onChange={(event) => patchForm('evidence_type', event.target.value)} className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-400">
                    {EVIDENCE_TYPES.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-medium text-slate-700">重要程度</span>
                  <select value={form.importance} onChange={(event) => patchForm('importance', event.target.value)} className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-400">
                    {IMPORTANCE_OPTIONS.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-medium text-slate-700">跟进状态</span>
                  <select value={form.follow_status} onChange={(event) => patchForm('follow_status', event.target.value)} className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-400">
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
                  <span className="text-sm font-medium text-slate-700">金额影响</span>
                  <select value={form.amount_direction} onChange={(event) => patchForm('amount_direction', event.target.value)} className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-400">
                    {AMOUNT_OPTIONS.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-medium text-slate-700">预计影响金额</span>
                  <input
                    type="number"
                    value={form.estimated_amount}
                    onChange={(event) => patchForm('estimated_amount', event.target.value)}
                    placeholder="0"
                    className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-blue-400"
                  />
                </label>
              </div>

              <label className="block space-y-1">
                <span className="text-sm font-medium text-slate-700">来源</span>
                <input
                  value={form.source}
                  onChange={(event) => patchForm('source', event.target.value)}
                  placeholder="例如：甲方项目群聊天截图、会议纪要、图纸答疑文件"
                  className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-blue-400"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-sm font-medium text-slate-700">事件说明</span>
                <textarea
                  value={form.summary}
                  onChange={(event) => patchForm('summary', event.target.value)}
                  rows={5}
                  placeholder="说明事情发生背景、甲方要求、现场影响、后续结算建议等"
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm leading-6 outline-none focus:border-blue-400"
                />
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="block space-y-1">
                  <span className="text-sm font-medium text-slate-700">关联业务</span>
                  <textarea
                    value={form.related}
                    onChange={(event) => patchForm('related', event.target.value)}
                    rows={4}
                    placeholder="每行一个，例如：签证单：VS-2026-0719"
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm leading-6 outline-none focus:border-blue-400"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-sm font-medium text-slate-700">标签</span>
                  <textarea
                    value={form.tags}
                    onChange={(event) => patchForm('tags', event.target.value)}
                    rows={4}
                    placeholder="每行一个标签"
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm leading-6 outline-none focus:border-blue-400"
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
                          checked ? 'bg-blue-50 text-blue-700 ring-blue-100' : 'bg-white text-slate-600 ring-slate-200'
                        )}
                      >
                        <Tag className="mr-1 inline h-3.5 w-3.5" />
                        {tag}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-950">附件</h3>
                    <p className="mt-1 text-xs text-slate-500">支持图片、PDF、Word、Excel等证据资料。</p>
                  </div>
                  <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
                    {uploading ? '上传中' : '上传附件'}
                    <input type="file" multiple className="hidden" onChange={uploadAttachments} />
                  </label>
                </div>
                <div className="mt-3 space-y-2">
                  {form.attachments.length === 0 ? (
                    <div className="rounded-md border border-dashed border-slate-200 p-4 text-center text-sm text-slate-400">暂无附件</div>
                  ) : (
                    form.attachments.map((attachment, index) => (
                      <div key={`${getAttachmentName(attachment)}-${index}`} className="flex items-center justify-between gap-3 rounded-md bg-slate-50 px-3 py-2">
                        <div className="min-w-0">
                          <div className="line-clamp-1 text-sm font-medium text-slate-800">{getAttachmentName(attachment)}</div>
                          <div className="text-xs text-slate-400">{formatFileSize(getAttachmentSize(attachment))}</div>
                        </div>
                        <button type="button" onClick={() => removeAttachment(index)} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-white hover:text-rose-600">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <label className="block space-y-1">
                <span className="text-sm font-medium text-slate-700">负责人</span>
                <input
                  value={form.owner_name}
                  onChange={(event) => patchForm('owner_name', event.target.value)}
                  placeholder="默认使用当前录入人，也可填写具体负责人"
                  className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-blue-400"
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

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <button type="button" onClick={() => setDrawerOpen(false)} className="h-10 rounded-md border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50">
                取消
              </button>
              <button
                type="button"
                onClick={saveRecord}
                disabled={saving}
                className="inline-flex h-10 items-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
