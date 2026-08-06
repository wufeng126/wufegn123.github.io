'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
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

type ConstructionLogNavItem = {
  id: number;
  project_id: number;
  project_name?: string | null;
  log_date?: string | null;
  user_name?: string | null;
  location?: string | null;
  status?: string | null;
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
  navigation?: {
    previous?: ConstructionLogNavItem | null;
    next?: ConstructionLogNavItem | null;
  } | null;
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
  if (level === 'high') return 'border-red-200 bg-red-50 text-red-700';
  if (level === 'medium') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-blue-200 bg-blue-50 text-blue-700';
}

function statusClass(status?: string | null) {
  if (status === 'confirmed') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'pending') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-slate-200 bg-slate-100 text-slate-600';
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

function navDescription(item?: ConstructionLogNavItem | null) {
  if (!item) return '';
  return [
    item.log_date,
    item.project_name || `项目${item.project_id}`,
    item.user_name,
    item.location,
  ].filter(Boolean).join(' · ');
}

function NavigationLink({
  item,
  direction,
}: {
  item?: ConstructionLogNavItem | null;
  direction: 'previous' | 'next';
}) {
  const isPrevious = direction === 'previous';
  const label = isPrevious ? '上一篇' : '下一篇';
  if (!item) {
    return (
      <div className="flex min-h-[64px] items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white/70 px-4 py-3 text-sm text-slate-400">
        {isPrevious ? '已经是最新一篇' : '已经是最后一篇'}
      </div>
    );
  }

  return (
    <Link
      href={`/construction-logs/${item.id}`}
      className="group flex min-h-[64px] items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition hover:border-blue-200 hover:bg-blue-50/40"
    >
      {isPrevious && (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 transition group-hover:bg-blue-100 group-hover:text-blue-700">
          <ChevronLeft className="h-4 w-4" />
        </span>
      )}
      <span className={`min-w-0 flex-1 ${isPrevious ? '' : 'text-right'}`}>
        <span className="block text-xs font-medium text-slate-500">{label}</span>
        <span className="mt-1 block truncate text-sm font-semibold text-slate-950">{navDescription(item)}</span>
      </span>
      {!isPrevious && (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 transition group-hover:bg-blue-100 group-hover:text-blue-700">
          <ChevronRight className="h-4 w-4" />
        </span>
      )}
    </Link>
  );
}

export default function ConstructionLogDetailPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
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
  const [highlightSection, setHighlightSection] = useState('');
  const [highlightCommentId, setHighlightCommentId] = useState('');

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

  useEffect(() => {
    if (loading || commentsLoading || !detail) return;

    const section = searchParams.get('section') || (searchParams.get('comment_id') || searchParams.get('commentId') ? 'comments' : '');
    const commentId = searchParams.get('comment_id') || searchParams.get('commentId') || '';
    if (!section && !commentId) return;

    const targetId = commentId ? `construction-log-comment-${commentId}` : `construction-log-section-${section}`;
    const fallbackId = section ? `construction-log-section-${section}` : '';

    const frame = window.requestAnimationFrame(() => {
      const target = document.getElementById(targetId) || (fallbackId ? document.getElementById(fallbackId) : null);
      if (!target) return;

      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightSection(section);
      setHighlightCommentId(commentId);

      window.setTimeout(() => {
        setHighlightSection('');
        setHighlightCommentId('');
      }, 4500);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [comments.length, commentsLoading, detail, loading, searchParams]);

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
    <div className="min-h-full bg-[#EEF3F8] px-3 py-4 sm:p-4 md:p-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <Link
            href="/construction-logs?tab=logs"
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 shadow-sm hover:border-blue-200 hover:text-blue-700"
          >
            <ArrowLeft className="h-4 w-4" />
            返回施工日志
          </Link>
        </div>

        {loading ? (
          <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 shadow-sm">正在加载施工日志...</div>
        ) : error || !detail ? (
          <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-600 shadow-sm">
            {error || '未找到施工日志'}
          </div>
        ) : (
          <div className="space-y-4">
            {message && (
              <div className="rounded-xl border border-blue-100 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
                {message}
              </div>
            )}

            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-3 sm:px-5">
                <p className="text-xs font-medium text-slate-500">施工管理 / 施工日志详情</p>
              </div>
              <div className="flex flex-col gap-4 p-4 md:flex-row md:items-start md:justify-between sm:p-5">
                <div>
                  <h1 className="break-words text-xl font-semibold text-slate-950 sm:text-2xl">
                    {detail.project?.name || `项目${detail.project_id}`}
                  </h1>
                  <div className="mt-3 flex flex-wrap gap-3 text-sm text-slate-600">
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays className="h-4 w-4 text-blue-600" />
                      {detail.log_date}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-4 w-4 text-slate-500" />
                      {detail.user_name || '未记录人员'}
                    </span>
                    {detail.location && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-4 w-4 text-emerald-600" />
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
                      className="inline-flex h-9 items-center gap-2 rounded-lg border border-blue-200 bg-white px-3 text-xs font-medium text-blue-700 hover:bg-blue-50"
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
                      className="inline-flex h-9 items-center gap-2 rounded-lg border border-red-200 bg-white px-3 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
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
              <form onSubmit={handleSaveEdit} className="overflow-hidden rounded-xl border border-blue-100 bg-white shadow-sm">
                <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-3 sm:px-5">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="text-base font-semibold text-slate-950">编辑预约日志</h2>
                      <p className="mt-1 text-xs text-slate-500">调整施工部位、内容与预约提交时间，保存后继续按原流程提交。</p>
                    </div>
                    <span className="inline-flex w-fit items-center rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
                      仅修改当前日志
                    </span>
                  </div>
                </div>
                <div className="space-y-4 p-4 sm:p-5">
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="block text-sm font-medium text-slate-800">
                    施工部位
                    <input
                      value={editLocation}
                      onChange={(event) => setEditLocation(event.target.value)}
                      className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                  </label>
                  <label className="block text-sm font-medium text-slate-800">
                    预约提交时间
                    <input
                      type="datetime-local"
                      value={editScheduledAt}
                      onChange={(event) => setEditScheduledAt(event.target.value)}
                      className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                  </label>
                </div>
                <label className="block text-sm font-medium text-slate-800">
                  施工内容
                  <textarea
                    value={editContent}
                    onChange={(event) => setEditContent(event.target.value)}
                    rows={5}
                    className="mt-1 min-h-[132px] w-full rounded-lg border border-slate-200 bg-white p-3 text-sm leading-6 text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                </label>
                <label className="block text-sm font-medium text-slate-800">
                  异常/问题
                  <input
                    value={editIssues}
                    onChange={(event) => setEditIssues(event.target.value)}
                    className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                </label>
                <div className="flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-slate-500">保存后会刷新当前详情，已提交日志仍保留原查看记录。</p>
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 sm:w-auto"
                  >
                    <Save className="h-4 w-4" />
                    {saving ? '保存中...' : '保存修改'}
                  </button>
                </div>
                </div>
              </form>
            )}

            <section
              id="construction-log-section-content"
              className={`overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition ${highlightSection === 'content' ? 'ring-2 ring-blue-300 ring-offset-2' : ''}`}
            >
              <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-3 sm:px-5">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
                  <FileText className="h-4 w-4 text-blue-600" />
                  现场记录
                </div>
              </div>
              <div className="space-y-4 p-4 sm:p-5">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-lg bg-slate-50/80 p-3 ring-1 ring-slate-200">
                  <p className="text-xs text-slate-500">出勤人数</p>
                  <p className="mt-1 text-lg font-semibold text-slate-950">
                    {detail.headcount ?? '-'}
                    {detail.headcount != null ? ' 人' : ''}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-50/80 p-3 ring-1 ring-slate-200 md:col-span-2">
                  <p className="text-xs text-slate-500">创建时间</p>
                  <p className="mt-1 text-sm font-medium text-slate-900">{formatDate(detail.created_at)}</p>
                </div>
              </div>
              <div className="whitespace-pre-wrap rounded-lg bg-slate-50/60 p-4 text-sm leading-7 text-slate-900 ring-1 ring-slate-200">
                {detail.content || '未填写施工内容'}
              </div>

              {photoAttachments.length > 0 && (
                <div className="rounded-lg bg-slate-50/80 p-4 ring-1 ring-slate-200">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="inline-flex items-center gap-2 text-sm font-medium text-slate-950">
                      <ImageIcon className="h-4 w-4 text-blue-600" />
                      现场照片
                    </p>
                    <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
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
                        className="group overflow-hidden rounded-lg border border-slate-200 bg-white transition hover:border-blue-200"
                      >
                        {attachment.url ? (
                          <img
                            src={attachment.url}
                            alt={attachment.name || `施工照片${index + 1}`}
                            className="h-36 w-full bg-slate-100 object-cover transition group-hover:scale-[1.02]"
                          />
                        ) : (
                          <div className="flex h-36 items-center justify-center bg-slate-100 text-xs text-slate-500">
                            照片链接生成失败
                          </div>
                        )}
                        <div className="px-3 py-2">
                          <p className="truncate text-xs font-medium text-slate-900">
                            {attachment.name || `施工照片${index + 1}`}
                          </p>
                          {formatFileSize(attachment.size) && (
                            <p className="mt-1 text-xs text-slate-500">{formatFileSize(attachment.size)}</p>
                          )}
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {Number(detail.attachments_original_count || 0) > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                  原有 {Number(detail.attachments_original_count || 0)} 张照片，已于 {formatDateOnly(detail.attachments_cleaned_at)} 项目归档时清理。
                </div>
              )}

              {/* Tomorrow Plan */}
              {detail.tomorrow_plan && (
                <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <CalendarClock className="h-4 w-4 text-blue-600" />
                    <span className="text-sm font-medium text-slate-950">明日计划</span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-7 text-slate-800">
                    {detail.tomorrow_plan}
                  </p>
                </div>
              )}

              {detail.attendance_workers && detail.attendance_workers.length > 0 && (
                <div className="rounded-lg bg-slate-50/80 p-4 ring-1 ring-slate-200">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-slate-950">出勤人员明细</p>
                    <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
                      {detail.attendance_workers.length} 人
                    </span>
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    {detail.attendance_workers.map((worker) => (
                      <div key={`${worker.worker_id}-${worker.worker_name || ''}`} className="rounded-lg bg-white px-3 py-2 ring-1 ring-slate-200">
                        <p className="text-sm font-medium text-slate-900">
                          {worker.worker_name || `工人${worker.worker_id}`}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {[worker.work_type, worker.team_name].filter(Boolean).join(' · ') || '未记录工种/班组'}
                        </p>
                        <p className="mt-1 text-xs font-medium text-blue-700">
                          工时：{Number(worker.work_hours || 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 })} 小时
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {detail.issues && (
                <div className="whitespace-pre-wrap rounded-lg border border-red-200 bg-red-50 p-4 text-sm leading-7 text-red-700">
                  <p className="mb-1 font-medium">异常/问题</p>
                  {detail.issues}
                </div>
              )}
              </div>
            </section>

            <section
              id="construction-log-section-risk"
              className={`overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition ${highlightSection === 'risk' ? 'ring-2 ring-blue-300 ring-offset-2' : ''}`}
            >
              <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-3 sm:px-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    <h2 className="text-sm font-semibold text-slate-950">风险识别提醒</h2>
                  </div>
                  <Link href="/construction-logs?tab=risks" className="text-xs font-medium text-blue-700 hover:underline">
                    返回风险池
                  </Link>
                </div>
              </div>

              {detail.risk?.hasRisk ? (
                <div className="space-y-4 p-4 sm:p-5">
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

                  <div className="rounded-lg bg-slate-50/80 p-4 ring-1 ring-slate-200">
                    <p className="text-sm font-semibold text-slate-950">
                      {detail.risk.summary || '施工日志识别到风险提醒'}
                    </p>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {(detail.risk.types || []).map((type) => (
                        <span key={type} className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
                          {riskTypeLabels[type] || type}
                        </span>
                      ))}
                      {(detail.risk.matchedKeywords || []).slice(0, 6).map((keyword) => (
                        <span key={keyword} className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
                          {keyword}
                        </span>
                      ))}
                    </div>
                  </div>

                  {detail.risk.recommendation && (
                    <p className="rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2 text-sm leading-6 text-slate-700">
                      建议：{detail.risk.recommendation}
                    </p>
                  )}

                  <div className="flex flex-col gap-3 rounded-lg bg-slate-50/80 px-3 py-3 ring-1 ring-slate-200 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs leading-5 text-slate-500">
                      这里只做确认提醒，后续签证、月报、结算资料仍按业务页处理。
                    </p>
                    <button
                      type="button"
                      disabled={acknowledgingRisk || detail.risk.workflow_status === 'confirmed' || !detail.risk.can_acknowledge}
                      onClick={handleAcknowledgeRisk}
                      className={`inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto ${
                        detail.risk.workflow_status === 'confirmed'
                          ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                          : 'border border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700'
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
                <div className="p-4 sm:p-5">
                  <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50/70 p-4 text-sm text-slate-500">该日志暂未识别到风险提醒。</p>
                </div>
              )}
            </section>

            <section
              id="construction-log-section-comments"
              className={`overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition ${highlightSection === 'comments' && !highlightCommentId ? 'ring-2 ring-blue-300 ring-offset-2' : ''}`}
            >
              <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-3 sm:px-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2">
                    <MessageSquareMore className="h-4 w-4 text-blue-600" />
                    <h2 className="text-sm font-semibold text-slate-950">评论提醒</h2>
                  </div>
                  <span className="text-xs text-slate-500">评论将通知项目经理、预算员、日志作者及被提及人员</span>
                </div>
              </div>

              <form onSubmit={handleSubmitComment} className="space-y-3 p-4 sm:p-5">
                <textarea
                  value={commentContent}
                  onChange={(event) => setCommentContent(event.target.value)}
                  rows={4}
                  placeholder="请输入评论，例如：这里需要补充签证资料，麻烦项目经理跟进。"
                  className="min-h-[112px] w-full rounded-lg border border-slate-200 bg-white p-3 text-sm leading-6 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-h-5 text-sm">
                    {commentError ? <span className="text-red-600">{commentError}</span> : null}
                    {!commentError && commentMessage ? <span className="text-emerald-600">{commentMessage}</span> : null}
                  </div>
                  <button
                    type="submit"
                    disabled={commentSubmitting}
                    className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 sm:w-auto"
                  >
                    <Send className="h-4 w-4" />
                    {commentSubmitting ? '提交中...' : '提交评论'}
                  </button>
                </div>
              </form>

              <div className="border-t border-slate-100 px-4 py-4 sm:px-5">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-950">历史评论</p>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{comments.length} 条</span>
                </div>
                {commentsLoading ? (
                  <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">评论加载中...</div>
                ) : comments.length > 0 ? (
                  <div className="space-y-3">
                    {comments.map((comment) => (
                      <div
                        id={`construction-log-comment-${comment.id}`}
                        key={comment.id}
                        className={`rounded-lg bg-slate-50/80 p-3 transition ${highlightCommentId === String(comment.id) ? 'ring-2 ring-blue-300 ring-offset-2' : 'ring-1 ring-slate-200'}`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold text-white">
                              {(comment.user_name || `用户${comment.user_id}`).slice(0, 1)}
                            </span>
                            <div>
                              <p className="text-sm font-medium text-slate-900">{comment.user_name || `用户${comment.user_id}`}</p>
                              <span className="text-xs text-slate-500">{formatDate(comment.created_at)}</span>
                            </div>
                          </div>
                        </div>
                        <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-900">{comment.content}</p>
                        {comment.mentioned_user_ids && comment.mentioned_user_ids.length > 0 && (
                          <p className="mt-2 text-xs text-slate-500">
                            @提醒 {comment.mentioned_user_ids.length} 人
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/70 p-4 text-sm text-slate-500">暂无评论，先留下第一条吧。</div>
                )}
              </div>
            </section>

            <section className="grid gap-3 pb-2 md:grid-cols-2">
              <NavigationLink item={detail.navigation?.previous} direction="previous" />
              <NavigationLink item={detail.navigation?.next} direction="next" />
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
