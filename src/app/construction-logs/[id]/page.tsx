'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  FileText,
  ImageIcon,
  MapPin,
  MessageSquareMore,
  Save,
  Send,
  XCircle,
  Users,
} from 'lucide-react';

type RiskLevel = 'low' | 'medium' | 'high';
type RiskType = 'change' | 'visa' | 'delay' | 'quality' | 'safety' | 'cost';
type RiskWorkflowStatus = 'pending' | 'confirmed' | 'none';

type ConstructionLogAttachment = {
  name?: string | null;
  size?: number | null;
  storageKey?: string | null;
  type?: string | null;
  uploadedAt?: string | null;
  url?: string | null;
};

type AttendanceWorker = {
  worker_id: number;
  worker_name?: string | null;
  work_type?: string | null;
  team_name?: string | null;
  work_hours?: number | string | null;
};

type ConstructionLogComment = {
  id: number;
  log_id: number;
  project_id: number;
  user_id: number;
  user_name?: string | null;
  content: string;
  mentioned_user_ids?: number[] | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type ConstructionLogDetail = {
  id: number;
  project_id: number;
  user_name?: string | null;
  log_date: string;
  location?: string | null;
  content?: string | null;
  headcount?: number | null;
  issues?: string | null;
  tomorrow_plan?: string | null;
  created_at?: string | null;
  status?: 'submitted' | 'pending' | 'cancelled' | null;
  scheduled_submit_at?: string | null;
  can_edit_schedule?: boolean;
  can_cancel_schedule?: boolean;
  attachments?: ConstructionLogAttachment[];
  attachments_cleaned_at?: string | null;
  attachments_original_count?: number | null;
  attachments_cleaned_by?: number | null;
  attendance_workers?: AttendanceWorker[];
  project?: {
    id: number;
    name: string;
    year?: number | null;
    address?: string | null;
    partner?: string | null;
    contract_amount?: string | number | null;
  } | null;
  risk?: {
    hasRisk: boolean;
    level?: RiskLevel | null;
    types?: RiskType[];
    summary?: string;
    recommendation?: string;
    matchedKeywords?: string[];
    workflow_status?: RiskWorkflowStatus | string;
    workflow_status_label?: string;
    can_acknowledge?: boolean;
  };
};

const riskLevelLabels: Record<RiskLevel, string> = {
  low: '低风险',
  medium: '中风险',
  high: '高风险',
};

const riskTypeLabels: Record<RiskType, string> = {
  change: '变更',
  visa: '签证',
  delay: '工期',
  quality: '质量',
  safety: '安全',
  cost: '成本',
};

function formatDate(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDateOnly(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('zh-CN');
}

function formatFileSize(size?: number | null) {
  const value = Number(size || 0);
  if (!Number.isFinite(value) || value <= 0) return '';
  if (value < 1024 * 1024) return `${Math.round(value / 1024)}KB`;
  return `${(value / 1024 / 1024).toFixed(1)}MB`;
}

function toDateTimeInputValue(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

function riskClass(level?: RiskLevel | null) {
  if (level === 'high') return 'border-[#F53F3F] bg-[#FFF1F0] text-[#C62828]';
  if (level === 'medium') return 'border-[#F59E0B] bg-[#FFF7E8] text-[#B45309]';
  return 'border-[#165DFF] bg-[#E8F3FF] text-[#165DFF]';
}

function statusClass(status?: string | null) {
  if (status === 'confirmed') return 'border-[#10B981]/30 bg-[#E8FFEA] text-[#047857]';
  if (status === 'pending') return 'border-[#F59E0B]/30 bg-[#FFF7E8] text-[#B45309]';
  return 'border-[#E5E6EB] bg-[#F7F8FA] text-[#4E5969]';
}

function logStatusLabel(status?: string | null) {
  if (status === 'pending') return '待提交';
  if (status === 'cancelled') return '已取消';
  if (status === 'submitted') return '已提交';
  return '-';
}

function logStatusTone(status?: string | null) {
  if (status === 'pending') return 'pending';
  if (status === 'cancelled') return 'confirmed';
  return null;
}

export default function ConstructionLogDetailPage() {
  const params = useParams<{ id: string }>();
  const [detail, setDetail] = useState<ConstructionLogDetail | null>(null);
  const [comments, setComments] = useState<ConstructionLogComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editLocation, setEditLocation] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editIssues, setEditIssues] = useState('');
  const [editScheduledAt, setEditScheduledAt] = useState('');
  const [acknowledgingRisk, setAcknowledgingRisk] = useState(false);
  const [message, setMessage] = useState('');
  const [commentContent, setCommentContent] = useState('');
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [commentMessage, setCommentMessage] = useState('');
  const [commentError, setCommentError] = useState('');

  async function loadComments(logId: string | number) {
    setCommentsLoading(true);
    try {
      const res = await fetch(`/api/construction-logs/${logId}/comments`);
      const json = await res.json();
      if (!res.ok || json.success === false) throw new Error(json.error || '评论加载失败');
      setComments(Array.isArray(json.data?.comments) ? json.data.comments : []);
    } catch {
      setComments([]);
    } finally {
      setCommentsLoading(false);
    }
  }

  useEffect(() => {
    let mounted = true;

    async function loadDetail() {
      try {
        setLoading(true);
        setError('');
        const res = await fetch(`/api/construction-logs/${params.id}`);
        const json = await res.json();
        if (!res.ok || json.success === false) throw new Error(json.error || '施工日志详情加载失败');
        if (mounted) {
          setDetail(json.data);
          setEditLocation(json.data?.location || '');
          setEditContent(json.data?.content || '');
          setEditIssues(json.data?.issues || '');
          setEditScheduledAt(toDateTimeInputValue(json.data?.scheduled_submit_at));
          setMessage('');
          setCommentMessage('');
          setCommentError('');
          setCommentContent('');
        }
        await loadComments(params.id);
      } catch (e: unknown) {
        if (mounted) setError(e instanceof Error ? e.message : '施工日志详情加载失败');
      } finally {
        if (mounted) setLoading(false);
      }
    }

    if (params.id) loadDetail();
    return () => {
      mounted = false;
    };
  }, [params.id]);

  const photoAttachments = useMemo(
    () =>
      (detail?.attachments || []).filter((attachment) =>
        attachment.type === 'image'
        || /\.(png|jpe?g|webp|bmp)$/i.test(attachment.name || '')
        || Boolean(attachment.url),
      ),
    [detail?.attachments],
  );

  async function handleSaveEdit(event: FormEvent) {
    event.preventDefault();
    if (!detail) return;
    if (!editContent.trim()) {
      setError('施工内容不能为空');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/construction-logs/${detail.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: editLocation,
          content: editContent,
          issues: editIssues,
          scheduled_submit_at: editScheduledAt,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.success === false) throw new Error(json.error || '保存失败');
      setEditing(false);
      const reload = await fetch(`/api/construction-logs/${params.id}`);
      const reloadJson = await reload.json();
      if (reload.ok && reloadJson.success !== false) setDetail(reloadJson.data);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  async function handleAcknowledgeRisk() {
    if (!detail?.risk?.hasRisk) return;
    setAcknowledgingRisk(true);
    setMessage('');
    try {
      const res = await fetch('/api/construction-logs/risks/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          logId: detail.id,
          action: 'acknowledge',
          note: '风险提醒已确认',
        }),
      });
      const json = await res.json();
      if (!res.ok || json.success === false) throw new Error(json.error || '确认失败');
      setDetail((current) =>
        current
          ? {
              ...current,
              risk: current.risk
                ? {
                    ...current.risk,
                    workflow_status: 'confirmed',
                    workflow_status_label: '已确认',
                    can_acknowledge: false,
                  }
                : current.risk,
            }
          : current,
      );
      setMessage('已确认该风险提醒');
    } catch (actionError) {
      setMessage(actionError instanceof Error ? actionError.message : '确认失败');
    } finally {
      setAcknowledgingRisk(false);
    }
  }

  async function handleCancelSchedule() {
    if (!detail || !detail.can_cancel_schedule) return;
    if (!window.confirm('确定要取消这条预约提交吗？')) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/construction-logs/${detail.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel_schedule' }),
      });
      const json = await res.json();
      if (!res.ok || json.success === false) throw new Error(json.error || '取消失败');
      const reload = await fetch(`/api/construction-logs/${params.id}`);
      const reloadJson = await reload.json();
      if (reload.ok && reloadJson.success !== false) {
        setDetail(reloadJson.data);
        setEditing(false);
      }
      setMessage('已取消预约提交');
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : '取消失败');
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmitComment(event: FormEvent) {
    event.preventDefault();
    if (!detail) return;
    if (!commentContent.trim()) {
      setCommentError('评论内容不能为空');
      return;
    }
    setCommentSubmitting(true);
    setCommentError('');
    setCommentMessage('');
    try {
      const res = await fetch(`/api/construction-logs/${detail.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: commentContent.trim() }),
      });
      const json = await res.json();
      if (!res.ok || json.success === false) throw new Error(json.error || '评论提交失败');
      setCommentContent('');
      setCommentMessage(`评论已提交，已提醒 ${Number(json.data?.recipientCount || 0)} 人`);
      await loadComments(detail.id);
    } catch (submitError) {
      setCommentError(submitError instanceof Error ? submitError.message : '评论提交失败');
    } finally {
      setCommentSubmitting(false);
    }
  }

  return (
    <div className="min-h-full bg-[#F5F6FA] px-3 py-4 sm:p-4 md:p-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-5 flex items-center justify-between gap-3">
          <Link
            href="/construction-logs?tab=logs"
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#E5E6EB] bg-white px-3 text-sm font-medium text-[#4E5969] hover:border-[#165DFF]/40 hover:text-[#165DFF]"
          >
            <ArrowLeft className="h-4 w-4" />
            返回施工日志
          </Link>
        </div>

        {loading ? (
          <div className="rounded-xl border border-[#E5E6EB] bg-white p-10 text-center text-sm text-[#86909C]">正在加载施工日志...</div>
        ) : error || !detail ? (
          <div className="rounded-xl border border-[#E5E6EB] bg-white p-10 text-center text-sm text-[#4E5969]">
            {error || '未找到施工日志'}
          </div>
        ) : (
          <div className="space-y-4">
            {message && (
              <div className="rounded-xl border border-[#E5E6EB] bg-white px-4 py-3 text-sm text-[#4E5969]">
                {message}
              </div>
            )}

            <section className="rounded-xl border border-[#E5E6EB] bg-white p-4 sm:p-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-sm text-[#86909C]">施工日志详情</p>
                  <h1 className="mt-1 break-words text-xl font-bold text-[#1D2129] sm:text-2xl">
                    {detail.project?.name || `项目${detail.project_id}`}
                  </h1>
                  <div className="mt-3 flex flex-wrap gap-3 text-sm text-[#4E5969]">
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays className="h-4 w-4 text-[#165DFF]" />
                      {detail.log_date}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-4 w-4 text-[#7C3AED]" />
                      {detail.user_name || '未记录人员'}
                    </span>
                    {detail.location && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-4 w-4 text-[#10B981]" />
                        {detail.location}
                      </span>
                    )}
                    {detail.status && (
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${statusClass(logStatusTone(detail.status))}`}>
                        {logStatusLabel(detail.status)}
                        {detail.status === 'pending' && detail.scheduled_submit_at ? ` · ${formatDate(detail.scheduled_submit_at)}` : ''}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {detail.can_edit_schedule && (
                    <button
                      type="button"
                      onClick={() => setEditing((current) => !current)}
                      className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#165DFF] bg-white px-3 text-xs font-medium text-[#165DFF] hover:bg-[#E8F3FF]"
                    >
                      {editing ? <XCircle className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
                      {editing ? '取消编辑' : '修改预约'}
                    </button>
                  )}
                  {detail.can_cancel_schedule && (
                    <button
                      type="button"
                      onClick={handleCancelSchedule}
                      disabled={saving}
                      className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#F53F3F] bg-white px-3 text-xs font-medium text-[#F53F3F] hover:bg-[#FFF1F0] disabled:opacity-60"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      取消预约
                    </button>
                  )}
                  {detail.risk?.hasRisk && (
                    <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium ${riskClass(detail.risk.level)}`}>
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {detail.risk.level ? riskLevelLabels[detail.risk.level] : '风险提醒'}
                    </span>
                  )}
                </div>
              </div>
            </section>

            {editing && detail.can_edit_schedule && (
              <form onSubmit={handleSaveEdit} className="rounded-xl border border-[#D6E4FF] bg-white p-4 sm:p-5">
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="block text-sm font-medium text-[#1D2129]">
                    施工部位
                    <input
                      value={editLocation}
                      onChange={(event) => setEditLocation(event.target.value)}
                      className="mt-1 h-10 w-full rounded-lg border border-[#E5E6EB] px-3 text-sm outline-none focus:border-[#165DFF]"
                    />
                  </label>
                  <label className="block text-sm font-medium text-[#1D2129]">
                    预约提交时间
                    <input
                      type="datetime-local"
                      value={editScheduledAt}
                      onChange={(event) => setEditScheduledAt(event.target.value)}
                      className="mt-1 h-10 w-full rounded-lg border border-[#E5E6EB] px-3 text-sm outline-none focus:border-[#165DFF]"
                    />
                  </label>
                </div>
                <label className="mt-3 block text-sm font-medium text-[#1D2129]">
                  施工内容
                  <textarea
                    value={editContent}
                    onChange={(event) => setEditContent(event.target.value)}
                    rows={5}
                    className="mt-1 w-full rounded-lg border border-[#E5E6EB] p-3 text-sm outline-none focus:border-[#165DFF]"
                  />
                </label>
                <label className="mt-3 block text-sm font-medium text-[#1D2129]">
                  异常/问题
                  <input
                    value={editIssues}
                    onChange={(event) => setEditIssues(event.target.value)}
                    className="mt-1 h-10 w-full rounded-lg border border-[#E5E6EB] px-3 text-sm outline-none focus:border-[#165DFF]"
                  />
                </label>
                <div className="mt-4 flex justify-end">
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#165DFF] px-4 text-sm font-medium text-white hover:bg-[#0E49D8] disabled:opacity-60"
                  >
                    <Save className="h-4 w-4" />
                    {saving ? '保存中...' : '保存修改'}
                  </button>
                </div>
              </form>
            )}

            <section className="rounded-xl border border-[#E5E6EB] bg-white p-4 sm:p-5">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#1D2129]">
                <FileText className="h-4 w-4 text-[#165DFF]" />
                现场记录
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-lg bg-[#F7F8FA] p-3">
                  <p className="text-xs text-[#86909C]">出勤人数</p>
                  <p className="mt-1 text-lg font-semibold text-[#1D2129]">
                    {detail.headcount ?? '-'}
                    {detail.headcount != null ? ' 人' : ''}
                  </p>
                </div>
                <div className="rounded-lg bg-[#F7F8FA] p-3 md:col-span-2">
                  <p className="text-xs text-[#86909C]">创建时间</p>
                  <p className="mt-1 text-sm text-[#1D2129]">{formatDate(detail.created_at)}</p>
                </div>
              </div>
              <div className="mt-4 whitespace-pre-wrap rounded-lg border border-[#E5E6EB] bg-[#FBFCFF] p-4 text-sm leading-7 text-[#1D2129]">
                {detail.content || '未填写施工内容'}
              </div>

              {photoAttachments.length > 0 && (
                <div className="mt-4 rounded-lg border border-[#E5E6EB] bg-white p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="inline-flex items-center gap-2 text-sm font-medium text-[#1D2129]">
                      <ImageIcon className="h-4 w-4 text-[#165DFF]" />
                      现场照片
                    </p>
                    <span className="rounded-full bg-[#E8F3FF] px-2.5 py-1 text-xs font-medium text-[#165DFF]">
                      {photoAttachments.length} 张
                    </span>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                    {photoAttachments.map((attachment, index) => (
                      <a
                        key={attachment.storageKey || attachment.url || index}
                        href={attachment.url || '#'}
                        target="_blank"
                        rel="noreferrer"
                        className="group overflow-hidden rounded-lg border border-[#E5E6EB] bg-[#FBFCFF] transition hover:border-[#165DFF]/50"
                      >
                        {attachment.url ? (
                          <img
                            src={attachment.url}
                            alt={attachment.name || `施工照片${index + 1}`}
                            className="h-36 w-full bg-[#F2F3F5] object-cover transition group-hover:scale-[1.02]"
                          />
                        ) : (
                          <div className="flex h-36 items-center justify-center bg-[#F2F3F5] text-xs text-[#86909C]">
                            照片链接生成失败
                          </div>
                        )}
                        <div className="px-3 py-2">
                          <p className="truncate text-xs font-medium text-[#1D2129]">
                            {attachment.name || `施工照片${index + 1}`}
                          </p>
                          {formatFileSize(attachment.size) && (
                            <p className="mt-1 text-xs text-[#86909C]">{formatFileSize(attachment.size)}</p>
                          )}
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {Number(detail.attachments_original_count || 0) > 0 && (
                <div className="mt-4 rounded-lg border border-[#F7BA1E]/30 bg-[#FFF7E8] px-4 py-3 text-sm text-[#B45309]">
                  原有 {Number(detail.attachments_original_count || 0)} 张照片，已于 {formatDateOnly(detail.attachments_cleaned_at)} 项目归档时清理。
                </div>
              )}

              {/* Tomorrow Plan */}
              {detail.tomorrow_plan && (
                <div className="mt-4 rounded-lg border border-[#E8F3FF] bg-[#F0F7FF] p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <CalendarClock className="h-4 w-4 text-[#165DFF]" />
                    <span className="text-sm font-medium text-[#1D2129]">明日计划</span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-7 text-[#1D2129]">
                    {detail.tomorrow_plan}
                  </p>
                </div>
              )}

              {detail.attendance_workers && detail.attendance_workers.length > 0 && (
                <div className="mt-4 rounded-lg border border-[#E5E6EB] bg-white p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-[#1D2129]">出勤人员明细</p>
                    <span className="rounded-full bg-[#E8F3FF] px-2.5 py-1 text-xs font-medium text-[#165DFF]">
                      {detail.attendance_workers.length} 人
                    </span>
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    {detail.attendance_workers.map((worker) => (
                      <div key={`${worker.worker_id}-${worker.worker_name || ''}`} className="rounded-lg bg-[#F7F8FA] px-3 py-2">
                        <p className="text-sm font-medium text-[#1D2129]">
                          {worker.worker_name || `工人${worker.worker_id}`}
                        </p>
                        <p className="mt-1 text-xs text-[#86909C]">
                          {[worker.work_type, worker.team_name].filter(Boolean).join(' · ') || '未记录工种/班组'}
                        </p>
                        <p className="mt-1 text-xs font-medium text-[#165DFF]">
                          工时：{Number(worker.work_hours || 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 })} 小时
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {detail.issues && (
                <div className="mt-4 whitespace-pre-wrap rounded-lg border border-[#F53F3F]/20 bg-[#FFF1F0] p-4 text-sm leading-7 text-[#C62828]">
                  <p className="mb-1 font-medium">异常/问题</p>
                  {detail.issues}
                </div>
              )}
            </section>

            <section className="rounded-xl border border-[#E5E6EB] bg-white p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-[#165DFF]" />
                  <h2 className="text-sm font-semibold text-[#1D2129]">风险识别提醒</h2>
                </div>
                <Link href="/construction-logs?tab=risks" className="text-xs font-medium text-[#165DFF] hover:underline">
                  返回风险池
                </Link>
              </div>

              {detail.risk?.hasRisk ? (
                <div className="mt-3 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${statusClass(detail.risk.workflow_status)}`}>
                      {detail.risk.workflow_status_label || '待确认'}
                    </span>
                    {detail.risk.level && (
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${riskClass(detail.risk.level)}`}>
                        {riskLevelLabels[detail.risk.level]}
                      </span>
                    )}
                  </div>

                  <p className="text-sm font-medium text-[#1D2129]">
                    {detail.risk.summary || '施工日志识别到风险提醒'}
                  </p>

                  <div className="flex flex-wrap gap-2">
                    {(detail.risk.types || []).map((type) => (
                      <span key={type} className="rounded-full bg-[#F2F3F5] px-2.5 py-1 text-xs text-[#4E5969]">
                        {riskTypeLabels[type] || type}
                      </span>
                    ))}
                    {(detail.risk.matchedKeywords || []).slice(0, 6).map((keyword) => (
                      <span key={keyword} className="rounded-full bg-[#F0F5FF] px-2.5 py-1 text-xs text-[#165DFF]">
                        {keyword}
                      </span>
                    ))}
                  </div>

                  {detail.risk.recommendation && (
                    <p className="rounded-lg bg-[#FAFBFF] px-3 py-2 text-sm text-[#4E5969]">
                      建议：{detail.risk.recommendation}
                    </p>
                  )}

                  <div className="flex flex-col gap-2 border-t border-[#F2F3F5] pt-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs text-[#86909C]">
                      这里只做确认提醒，后续签证、月报、结算资料仍按业务页处理。
                    </p>
                    <button
                      type="button"
                      disabled={acknowledgingRisk || detail.risk.workflow_status === 'confirmed' || !detail.risk.can_acknowledge}
                      onClick={handleAcknowledgeRisk}
                      className={`inline-flex h-9 items-center justify-center gap-1 rounded-lg px-3 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-70 ${
                        detail.risk.workflow_status === 'confirmed'
                          ? 'border border-[#10B981]/30 bg-[#E8FFEA] text-[#047857]'
                          : 'border border-[#10B981] bg-[#10B981] text-white hover:bg-[#059669]'
                      }`}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {detail.risk.workflow_status === 'confirmed'
                        ? '已确认'
                        : acknowledgingRisk
                          ? '确认中...'
                          : '确认提醒'}
                    </button>
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-sm text-[#86909C]">该日志暂未识别到风险提醒。</p>
              )}
            </section>

            <section className="rounded-xl border border-[#E5E6EB] bg-white p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <MessageSquareMore className="h-4 w-4 text-[#165DFF]" />
                  <h2 className="text-sm font-semibold text-[#1D2129]">评论提醒</h2>
                </div>
                <span className="text-xs text-[#86909C]">评论将通知项目经理、预算员、日志作者及被提及人员</span>
              </div>

              <form onSubmit={handleSubmitComment} className="mt-4 space-y-3">
                <textarea
                  value={commentContent}
                  onChange={(event) => setCommentContent(event.target.value)}
                  rows={4}
                  placeholder="请输入评论，例如：这里需要补充签证资料，麻烦项目经理跟进。"
                  className="w-full rounded-lg border border-[#E5E6EB] bg-[#FBFCFF] p-3 text-sm outline-none transition focus:border-[#165DFF]"
                />
                <div className="flex items-center justify-between gap-3">
                  <div className="min-h-5 text-sm">
                    {commentError ? <span className="text-[#F53F3F]">{commentError}</span> : null}
                    {!commentError && commentMessage ? <span className="text-[#10B981]">{commentMessage}</span> : null}
                  </div>
                  <button
                    type="submit"
                    disabled={commentSubmitting}
                    className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#165DFF] px-4 text-sm font-medium text-white hover:bg-[#0E49D8] disabled:opacity-60"
                  >
                    <Send className="h-4 w-4" />
                    {commentSubmitting ? '提交中...' : '提交评论'}
                  </button>
                </div>
              </form>

              <div className="mt-5 border-t border-[#F2F3F5] pt-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-medium text-[#1D2129]">历史评论</p>
                  <span className="text-xs text-[#86909C]">{comments.length} 条</span>
                </div>
                {commentsLoading ? (
                  <div className="rounded-lg bg-[#F7F8FA] p-4 text-sm text-[#86909C]">评论加载中...</div>
                ) : comments.length > 0 ? (
                  <div className="space-y-3">
                    {comments.map((comment) => (
                      <div key={comment.id} className="rounded-lg border border-[#E5E6EB] bg-[#FBFCFF] p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="rounded-full bg-[#E8F3FF] px-2 py-0.5 text-xs font-medium text-[#165DFF]">
                              {comment.user_name || `用户${comment.user_id}`}
                            </span>
                            <span className="text-xs text-[#86909C]">{formatDate(comment.created_at)}</span>
                          </div>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-[#1D2129]">{comment.content}</p>
                        {comment.mentioned_user_ids && comment.mentioned_user_ids.length > 0 && (
                          <p className="mt-2 text-xs text-[#86909C]">
                            @提醒 {comment.mentioned_user_ids.length} 人
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg bg-[#F7F8FA] p-4 text-sm text-[#86909C]">暂无评论，先留下第一条吧。</div>
                )}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
