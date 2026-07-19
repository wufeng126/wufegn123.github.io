'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AlertTriangle, ArrowLeft, CalendarDays, FileText, ImageIcon, MapPin, Users } from 'lucide-react';

type RiskLevel = 'low' | 'medium' | 'high';
type RiskType = 'change' | 'visa' | 'delay' | 'quality' | 'safety' | 'cost';

type ConstructionLogDetail = {
  id: number;
  project_id: number;
  user_name?: string | null;
  log_date: string;
  location?: string | null;
  content?: string | null;
  headcount?: number | null;
  issues?: string | null;
  created_at?: string | null;
  attachments?: {
    name?: string | null;
    size?: number | null;
    storageKey?: string | null;
    type?: string | null;
    uploadedAt?: string | null;
    url?: string | null;
  }[];
  attachments_cleaned_at?: string | null;
  attachments_original_count?: number | null;
  attachments_cleaned_by?: number | null;
  attendance_workers?: {
    worker_id: number;
    worker_name?: string | null;
    work_type?: string | null;
    team_name?: string | null;
    work_hours?: number | string | null;
  }[];
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
  };
  risk_doc?: {
    id: number;
    title?: string | null;
    tags?: string[] | string | null;
    updated_at?: string | null;
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

function riskClass(level?: RiskLevel | null) {
  if (level === 'high') return 'border-[#F53F3F] bg-[#FFF1F0] text-[#C62828]';
  if (level === 'medium') return 'border-[#F59E0B] bg-[#FFF7E8] text-[#B45309]';
  return 'border-[#165DFF] bg-[#E8F3FF] text-[#165DFF]';
}

function normalizeTags(tags?: string[] | string | null) {
  if (Array.isArray(tags)) return tags.map(String);
  if (typeof tags === 'string') return tags.split(',').map(tag => tag.trim()).filter(Boolean);
  return [];
}

function formatFileSize(size?: number | null) {
  const value = Number(size || 0);
  if (!Number.isFinite(value) || value <= 0) return '';
  if (value < 1024 * 1024) return `${Math.round(value / 1024)}KB`;
  return `${(value / 1024 / 1024).toFixed(1)}MB`;
}

export default function ConstructionLogDetailPage() {
  const params = useParams<{ id: string }>();
  const [detail, setDetail] = useState<ConstructionLogDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;

    async function loadDetail() {
      try {
        setLoading(true);
        setError('');
        const res = await fetch(`/api/construction-logs/${params.id}`);
        const json = await res.json();
        if (!res.ok || json.success === false) throw new Error(json.error || '施工日志详情加载失败');
        if (mounted) setDetail(json.data);
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

  const riskTags = useMemo(() => normalizeTags(detail?.risk_doc?.tags), [detail?.risk_doc?.tags]);
  const riskStatus = riskTags.find(tag => tag.startsWith('风险状态:'))?.replace('风险状态:', '') || '待确认';
  const photoAttachments = useMemo(() => (
    (detail?.attachments || []).filter(attachment => (
      attachment.type === 'image'
      || /\.(png|jpe?g|webp|bmp)$/i.test(attachment.name || '')
      || Boolean(attachment.url)
    ))
  ), [detail?.attachments]);

  return (
    <div className="min-h-full bg-[#F5F6FA] px-3 py-4 sm:p-4 md:p-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-5 flex items-center justify-between">
          <Link href="/construction-logs?tab=logs" className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#E5E6EB] bg-white px-3 text-sm font-medium text-[#4E5969] hover:border-[#165DFF]/40 hover:text-[#165DFF]">
            <ArrowLeft className="h-4 w-4" />
            返回施工日志
          </Link>
        </div>

        {loading ? (
          <div className="rounded-xl border border-[#E5E6EB] bg-white p-10 text-center text-sm text-[#86909C]">正在加载施工日志...</div>
        ) : error || !detail ? (
          <div className="rounded-xl border border-[#E5E6EB] bg-white p-10 text-center text-sm text-[#4E5969]">{error || '未找到施工日志'}</div>
        ) : (
          <div className="space-y-4">
            <section className="rounded-xl border border-[#E5E6EB] bg-white p-4 sm:p-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-sm text-[#86909C]">施工日志详情</p>
                  <h1 className="mt-1 break-words text-xl font-bold text-[#1D2129] sm:text-2xl">{detail.project?.name || `项目${detail.project_id}`}</h1>
                  <div className="mt-3 flex flex-wrap gap-3 text-sm text-[#4E5969]">
                    <span className="inline-flex items-center gap-1"><CalendarDays className="h-4 w-4 text-[#165DFF]" />{detail.log_date}</span>
                    <span className="inline-flex items-center gap-1"><Users className="h-4 w-4 text-[#7C3AED]" />{detail.user_name || '未记录人员'}</span>
                    {detail.location && <span className="inline-flex items-center gap-1"><MapPin className="h-4 w-4 text-[#10B981]" />{detail.location}</span>}
                  </div>
                </div>
                {detail.risk?.hasRisk && (
                  <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium ${riskClass(detail.risk.level)}`}>
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {detail.risk.level ? riskLevelLabels[detail.risk.level] : '风险提醒'}
                  </span>
                )}
              </div>
            </section>

            <section className="rounded-xl border border-[#E5E6EB] bg-white p-4 sm:p-5">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#1D2129]">
                <FileText className="h-4 w-4 text-[#165DFF]" />
                现场记录
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-lg bg-[#F7F8FA] p-3">
                  <p className="text-xs text-[#86909C]">出勤人数</p>
                  <p className="mt-1 text-lg font-semibold text-[#1D2129]">{detail.headcount ?? '-'}{detail.headcount != null ? ' 人' : ''}</p>
                </div>
                <div className="rounded-lg bg-[#F7F8FA] p-3 md:col-span-2">
                  <p className="text-xs text-[#86909C]">创建时间</p>
                  <p className="mt-1 text-sm text-[#1D2129]">{formatDate(detail.created_at)}</p>
                </div>
              </div>
              <div className="mt-4 rounded-lg border border-[#E5E6EB] bg-[#FBFCFF] p-4 text-sm leading-7 text-[#1D2129] whitespace-pre-wrap">
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
                          <div className="flex h-36 items-center justify-center bg-[#F2F3F5] text-xs text-[#86909C]">照片链接生成失败</div>
                        )}
                        <div className="px-3 py-2">
                          <p className="truncate text-xs font-medium text-[#1D2129]">{attachment.name || `施工照片${index + 1}`}</p>
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
              {detail.attendance_workers && detail.attendance_workers.length > 0 && (
                <div className="mt-4 rounded-lg border border-[#E5E6EB] bg-white p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-[#1D2129]">出勤人员明细</p>
                    <span className="rounded-full bg-[#E8F3FF] px-2.5 py-1 text-xs font-medium text-[#165DFF]">
                      {detail.attendance_workers.length} 人
                    </span>
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    {detail.attendance_workers.map(worker => (
                      <div key={`${worker.worker_id}-${worker.worker_name || ''}`} className="rounded-lg bg-[#F7F8FA] px-3 py-2">
                        <p className="text-sm font-medium text-[#1D2129]">{worker.worker_name || `工人${worker.worker_id}`}</p>
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
                <div className="mt-4 rounded-lg border border-[#F53F3F]/20 bg-[#FFF1F0] p-4 text-sm leading-7 text-[#C62828] whitespace-pre-wrap">
                  <p className="mb-1 font-medium">异常/问题</p>
                  {detail.issues}
                </div>
              )}
            </section>

            <section className="rounded-xl border border-[#E5E6EB] bg-white p-4 sm:p-5">
              <h2 className="text-sm font-semibold text-[#1D2129]">风险识别与沉淀状态</h2>
              {detail.risk?.hasRisk ? (
                <div className="mt-3 space-y-3">
                  <p className="text-sm text-[#4E5969]">{detail.risk.summary}</p>
                  <div className="flex flex-wrap gap-2">
                    {(detail.risk.types || []).map(type => (
                      <span key={type} className="rounded-full bg-[#F2F3F5] px-2.5 py-1 text-xs text-[#4E5969]">{riskTypeLabels[type] || type}</span>
                    ))}
                    <span className="rounded-full bg-[#F0F5FF] px-2.5 py-1 text-xs text-[#165DFF]">风险状态：{riskStatus}</span>
                  </div>
                  {detail.risk.recommendation && (
                    <p className="rounded-lg bg-[#FAFBFF] px-3 py-2 text-sm text-[#4E5969]">建议：{detail.risk.recommendation}</p>
                  )}
                  {detail.risk_doc?.id && (
                    <Link href={`/knowledge/${detail.risk_doc.id}`} className="inline-flex text-sm font-medium text-[#165DFF] hover:underline">
                      查看已沉淀知识
                    </Link>
                  )}
                </div>
              ) : (
                <p className="mt-3 text-sm text-[#86909C]">该日志暂未识别到风险提醒。</p>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
