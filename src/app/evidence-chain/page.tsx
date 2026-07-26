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

type EvidenceAttachment = string | {
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
const AMOUNT_OPTIONS = ['可能增加收入', '可能减少收入', '仅留痕，暂不确定'];
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
  return `￥${Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 0 })}`;
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

function toneForStatus(value: string) {
  if (value === '已进入结算') return 'bg-cyan-50 text-cyan-700 ring-cyan-100';
  if (value === '已形成签证') return 'bg-violet-50 text-violet-700 ring-violet-100';
  if (value === '待补资料') return 'bg-amber-50 text-amber-700 ring-amber-100';
  if (value === '已关闭') return 'bg-slate-100 text-slate-600 ring-slate-200';
  return 'bg-orange-50 text-orange-700 ring-orange-100';
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
  const [summary, setSummary] = useState<EvidenceSummary>({ count: 0, risk_count: 0, required_count: 0, estimated_amount: 0 });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [projectId, setProjectId] = useState('all');
  const [keyword, setKeyword] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [needsMigration, setNeedsMigration] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState<EvidenceForm>(emptyForm);

  const selectedRecord = useMemo(() => {
    if (records.length === 0) return null;
    return records.find((record) => record.id === selectedId) || records[0];
  }, [records, selectedId]);

  async function loadProjects() {
    try {
      const res = await fetch('/api/projects');
      const data = await res.json();
      setProjects((data.projects || []).map((project: any) => ({ id: Number(project.id), name: String(project.name || '') })));
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
      const nextRecords = data.data?.records || [];
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

  const stats = [
    { label: '证据总数', value: summary.count, icon: FileArchive, tone: 'bg-blue-50 text-blue-700' },
    { label: '必须结算', value: summary.required_count, icon: BadgeDollarSign, tone: 'bg-emerald-50 text-emerald-700' },
    { label: '争议风险', value: summary.risk_count, icon: ShieldAlert, tone: 'bg-rose-50 text-rose-700' },
    { label: '预计影响金额', value: formatMoney(summary.estimated_amount), icon: AlertCircle, tone: 'bg-amber-50 text-amber-700' },
  ];

  return (
    <div className="min-h-full bg-[#f6f8fb] p-3 text-slate-950 md:p-5">
      <div className="mx-auto max-w-[1500px] space-y-4">
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <FileArchive className="h-4 w-4" />
                项目管理 / 结算证据链
              </div>
              <h1 className="mt-2 text-2xl font-semibold tracking-normal text-slate-950">结算证据链</h1>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
                按项目时间线沉淀甲方回复、图纸答疑、变更、合同外施工和结算争议，后期可直接导出台账辅助结算复盘。
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={exportExcel}
                className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <Download className="h-4 w-4" />
                导出台账
              </button>
              <button
                type="button"
                onClick={openCreate}
                className="inline-flex h-9 items-center gap-2 rounded-md bg-slate-950 px-3 text-sm font-medium text-white hover:bg-slate-800"
              >
                <Plus className="h-4 w-4" />
                新增证据
              </button>
            </div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map((item) => (
            <div key={item.label} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">{item.label}</span>
                <span className={cx('inline-flex h-9 w-9 items-center justify-center rounded-md', item.tone)}>
                  <item.icon className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-3 text-2xl font-semibold text-slate-950">{item.value}</div>
            </div>
          ))}
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm md:p-4">
          <div className="grid gap-3 md:grid-cols-[1.2fr_1fr_1fr_1fr]">
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="搜索标题、来源、摘要、负责人"
                className="h-10 w-full rounded-md border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-slate-400"
              />
            </label>
            <select value={projectId} onChange={(event) => setProjectId(event.target.value)} className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400">
              <option value="all">全部项目</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))}
            </select>
            <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400">
              <option value="all">全部类型</option>
              {EVIDENCE_TYPES.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400">
              <option value="all">全部状态</option>
              {STATUS_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>
        </section>

        {needsMigration && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            数据表还未创建，部署后请执行系统自动迁移或进入系统管理触发迁移。
          </div>
        )}

        <section className="grid gap-4 xl:grid-cols-[460px_1fr]">
          <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Filter className="h-4 w-4" />
                时间线台账
              </div>
              <span className="text-xs text-slate-500">最新事件在前</span>
            </div>
            <div className="max-h-[720px] overflow-y-auto p-3">
              {loading ? (
                <div className="flex h-48 items-center justify-center text-sm text-slate-500">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  正在加载证据链
                </div>
              ) : records.length === 0 ? (
                <div className="flex h-48 flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 text-center">
                  <FileArchive className="h-8 w-8 text-slate-300" />
                  <p className="mt-2 text-sm font-medium text-slate-700">暂无证据记录</p>
                  <p className="mt-1 text-xs text-slate-500">从第一条甲方回复或变更资料开始沉淀。</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {records.map((record) => (
                    <button
                      key={record.id}
                      type="button"
                      onClick={() => setSelectedId(record.id)}
                      className={cx(
                        'w-full rounded-lg border p-3 text-left transition hover:border-slate-300 hover:bg-slate-50',
                        selectedRecord?.id === record.id ? 'border-slate-900 bg-slate-50' : 'border-slate-200 bg-white'
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <CalendarDays className="h-3.5 w-3.5" />
                            {record.event_date}
                            <span className="truncate">{record.project_name}</span>
                          </div>
                          <div className="mt-1 line-clamp-2 text-sm font-semibold leading-5 text-slate-950">{record.title}</div>
                        </div>
                        <ChevronRight className="mt-1 h-4 w-4 flex-none text-slate-400" />
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{record.evidence_type}</span>
                        <span className={cx('rounded-full px-2 py-0.5 text-xs ring-1', toneForImportance(record.importance))}>{record.importance}</span>
                        <span className={cx('rounded-full px-2 py-0.5 text-xs ring-1', toneForStatus(record.follow_status))}>{record.follow_status}</span>
                        {record.attachments.length > 0 && (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{record.attachments.length} 个附件</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
            {selectedRecord ? (
              <div className="p-4 md:p-5">
                <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
                      <span>{selectedRecord.project_name}</span>
                      <span>/</span>
                      <span>{selectedRecord.event_date}</span>
                    </div>
                    <h2 className="mt-2 text-xl font-semibold leading-7 text-slate-950">{selectedRecord.title}</h2>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700">{selectedRecord.evidence_type}</span>
                      <span className={cx('rounded-full px-2.5 py-1 text-xs ring-1', toneForImportance(selectedRecord.importance))}>{selectedRecord.importance}</span>
                      <span className={cx('rounded-full px-2.5 py-1 text-xs ring-1', toneForStatus(selectedRecord.follow_status))}>{selectedRecord.follow_status}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => openEdit(selectedRecord)} className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm text-slate-700 hover:bg-slate-50">
                      <Edit3 className="h-4 w-4" />
                      编辑
                    </button>
                    <button onClick={() => deleteRecord(selectedRecord)} className="inline-flex h-9 items-center gap-2 rounded-md border border-rose-200 px-3 text-sm text-rose-600 hover:bg-rose-50">
                      <Trash2 className="h-4 w-4" />
                      删除
                    </button>
                  </div>
                </div>

                <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_320px]">
                  <div className="space-y-4">
                    <section className="rounded-lg bg-slate-50 p-4">
                      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
                        <FileText className="h-4 w-4" />
                        事件摘要
                      </div>
                      <p className="whitespace-pre-wrap text-sm leading-7 text-slate-700">
                        {selectedRecord.summary || '暂无摘要'}
                      </p>
                    </section>

                    <section className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-lg border border-slate-200 p-4">
                        <div className="text-xs text-slate-500">金额影响</div>
                        <div className="mt-1 text-sm font-semibold text-slate-950">{selectedRecord.amount_direction}</div>
                        <div className="mt-2 text-2xl font-semibold text-slate-950">{formatMoney(selectedRecord.estimated_amount)}</div>
                      </div>
                      <div className="rounded-lg border border-slate-200 p-4">
                        <div className="text-xs text-slate-500">来源与负责人</div>
                        <div className="mt-1 text-sm font-semibold text-slate-950">{selectedRecord.source || '未填写来源'}</div>
                        <div className="mt-2 text-sm text-slate-600">{selectedRecord.owner_name || '未指定负责人'}</div>
                      </div>
                    </section>

                    <section className="rounded-lg border border-slate-200 p-4">
                      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
                        <Paperclip className="h-4 w-4" />
                        附件清单
                      </div>
                      {selectedRecord.attachments.length > 0 ? (
                        <div className="grid gap-2 md:grid-cols-2">
                          {selectedRecord.attachments.map((attachment, index) => {
                            const url = getAttachmentUrl(attachment);
                            const content = (
                              <>
                                <FileText className="h-4 w-4 flex-none text-slate-400" />
                                <span className="min-w-0 flex-1 truncate">{getAttachmentName(attachment)}</span>
                                {formatFileSize(getAttachmentSize(attachment)) && (
                                  <span className="text-xs text-slate-400">{formatFileSize(getAttachmentSize(attachment))}</span>
                                )}
                                {url && <ExternalLink className="h-3.5 w-3.5 flex-none text-slate-400" />}
                              </>
                            );
                            return url ? (
                              <a key={`${getAttachmentName(attachment)}-${index}`} href={url} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100">
                                {content}
                              </a>
                            ) : (
                              <div key={`${getAttachmentName(attachment)}-${index}`} className="flex items-center gap-2 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
                                {content}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-sm text-slate-500">暂无附件记录</p>
                      )}
                    </section>
                  </div>

                  <aside className="space-y-4">
                    <section className="rounded-lg border border-slate-200 p-4">
                      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
                        <Link2 className="h-4 w-4" />
                        关联业务
                      </div>
                      <div className="space-y-2">
                        {selectedRecord.related.length > 0 ? selectedRecord.related.map((item) => (
                          <div key={item} className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">{item}</div>
                        )) : <p className="text-sm text-slate-500">暂无关联</p>}
                      </div>
                    </section>
                    <section className="rounded-lg border border-slate-200 p-4">
                      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
                        <Tag className="h-4 w-4" />
                        标签
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {selectedRecord.tags.length > 0 ? selectedRecord.tags.map((tag) => (
                          <span key={tag} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">{tag}</span>
                        )) : <span className="text-sm text-slate-500">暂无标签</span>}
                      </div>
                    </section>
                  </aside>
                </div>
              </div>
            ) : (
              <div className="flex h-96 flex-col items-center justify-center text-center">
                <FileArchive className="h-10 w-10 text-slate-300" />
                <p className="mt-3 text-sm font-medium text-slate-700">请选择一条证据记录</p>
              </div>
            )}
          </div>
        </section>
      </div>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/30">
          <button aria-label="关闭新增证据" className="hidden flex-1 md:block" onClick={() => setDrawerOpen(false)} />
          <aside className="flex h-full w-full max-w-[760px] flex-col bg-white shadow-2xl">
            <div className="border-b border-slate-200 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm text-slate-500">事件留痕 / 附件归档 / 业务关联</div>
                  <h2 className="mt-1 text-xl font-semibold text-slate-950">{form.id ? '编辑证据' : '新增证据'}</h2>
                </div>
                <button onClick={() => setDrawerOpen(false)} className="rounded-md p-2 text-slate-500 hover:bg-slate-100">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              <div className="grid gap-4 md:grid-cols-3">
                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-slate-700">所属项目</span>
                  <select value={form.project_id} onChange={(event) => patchForm('project_id', event.target.value)} className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-slate-400">
                    <option value="">请选择项目</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>{project.name}</option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-slate-700">事件日期</span>
                  <input type="date" value={form.event_date} onChange={(event) => patchForm('event_date', event.target.value)} className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-slate-400" />
                </label>
                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-slate-700">负责人</span>
                  <input value={form.owner_name} onChange={(event) => patchForm('owner_name', event.target.value)} placeholder="预算员/跟进人" className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-slate-400" />
                </label>
              </div>

              <label className="mt-4 block space-y-1.5">
                <span className="text-sm font-medium text-slate-700">证据标题</span>
                <input value={form.title} onChange={(event) => patchForm('title', event.target.value)} placeholder="例如：甲方确认地下室新增止水钢板加固" className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-slate-400" />
              </label>

              <div className="mt-4">
                <div className="mb-2 text-sm font-medium text-slate-700">证据类型</div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {EVIDENCE_TYPES.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => patchForm('evidence_type', item)}
                      className={cx(
                        'rounded-md border px-3 py-2 text-left text-sm transition',
                        form.evidence_type === item ? 'border-slate-950 bg-slate-950 text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      )}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-slate-700">重要程度</span>
                  <select value={form.importance} onChange={(event) => patchForm('importance', event.target.value)} className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-slate-400">
                    {IMPORTANCE_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </label>
                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-slate-700">跟进状态</span>
                  <select value={form.follow_status} onChange={(event) => patchForm('follow_status', event.target.value)} className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-slate-400">
                    {STATUS_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </label>
                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-slate-700">预计金额</span>
                  <input type="number" value={form.estimated_amount} onChange={(event) => patchForm('estimated_amount', event.target.value)} placeholder="可不填" className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-slate-400" />
                </label>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-slate-700">来源</span>
                  <input value={form.source} onChange={(event) => patchForm('source', event.target.value)} placeholder="聊天记录、图纸答疑、会议纪要等" className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-slate-400" />
                </label>
                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-slate-700">金额影响</span>
                  <select value={form.amount_direction} onChange={(event) => patchForm('amount_direction', event.target.value)} className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-slate-400">
                    {AMOUNT_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </label>
              </div>

              <label className="mt-4 block space-y-1.5">
                <span className="text-sm font-medium text-slate-700">事件内容</span>
                <textarea value={form.summary} onChange={(event) => patchForm('summary', event.target.value)} rows={5} placeholder="记录发生了什么、谁确认的、对结算可能有什么影响。" className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm leading-6 outline-none focus:border-slate-400" />
              </label>

              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
                      <Paperclip className="h-4 w-4" />
                      证据附件
                    </div>
                    <p className="mt-1 text-xs text-slate-500">支持图片、PDF、Word、Excel 等资料，单个不超过30MB。</p>
                  </div>
                  <label className={cx(
                    'inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50',
                    uploading && 'pointer-events-none opacity-60'
                  )}>
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
                    {uploading ? '上传中' : '选择文件'}
                    <input type="file" multiple className="hidden" onChange={uploadAttachments} />
                  </label>
                </div>

                <div className="mt-3 space-y-2">
                  {form.attachments.length > 0 ? form.attachments.map((attachment, index) => (
                    <div key={`${getAttachmentName(attachment)}-${index}`} className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">
                      <FileText className="h-4 w-4 flex-none text-slate-400" />
                      <span className="min-w-0 flex-1 truncate text-slate-700">{getAttachmentName(attachment)}</span>
                      {formatFileSize(getAttachmentSize(attachment)) && <span className="text-xs text-slate-400">{formatFileSize(getAttachmentSize(attachment))}</span>}
                      <button type="button" onClick={() => removeAttachment(index)} className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label="移除附件">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  )) : (
                    <div className="rounded-md border border-dashed border-slate-200 bg-white px-3 py-5 text-center text-sm text-slate-500">
                      暂未上传附件
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-slate-700">关联业务</span>
                  <textarea value={form.related} onChange={(event) => patchForm('related', event.target.value)} rows={4} placeholder="例如：签证单 VS-2026-001、报量管理某清单项" className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm leading-6 outline-none focus:border-slate-400" />
                </label>
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700">
                    <Tag className="h-4 w-4" />
                    快速标签
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {QUICK_TAGS.map((tag) => {
                      const active = splitLines(form.tags).includes(tag);
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => toggleTag(tag)}
                          className={cx(
                            'rounded-full px-3 py-1 text-xs font-medium',
                            active ? 'bg-slate-950 text-white' : 'bg-slate-50 text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100'
                          )}
                        >
                          {tag}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-800">
                <div className="flex items-center gap-2 font-medium">
                  <CheckCircle2 className="h-4 w-4" />
                  保存前检查
                </div>
                <div className="mt-2 grid gap-1 text-xs leading-5 md:grid-cols-3">
                  <span>{form.project_id ? '已选择项目' : '缺少项目'}</span>
                  <span>{form.title.trim() ? '标题已填写' : '缺少标题'}</span>
                  <span>{form.attachments.length > 0 ? `已上传 ${form.attachments.length} 个附件` : '暂未上传附件'}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-slate-200 p-4 sm:flex-row sm:justify-end">
              <button onClick={() => setDrawerOpen(false)} className="inline-flex h-10 items-center justify-center rounded-md border border-slate-200 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50">
                取消
              </button>
              <button onClick={saveRecord} disabled={saving || uploading} className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                保存证据
              </button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
