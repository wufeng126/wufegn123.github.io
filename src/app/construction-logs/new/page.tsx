'use client';

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Camera, ClipboardList, ImageIcon, Loader2, Plus, Search, Send, Trash2, UserPlus, UsersRound } from 'lucide-react';
import {
  formatLogWindowText,
  getConstructionLogSubmissionWindow,
  getDefaultConstructionLogDate,
} from '@/lib/construction-log-deadline';

type Project = { id: number | string; name: string; is_archived?: boolean };
type AttendanceWorker = {
  id: number;
  name: string;
  work_type?: string | null;
  team_name?: string | null;
  entry_date?: string | null;
  in_scope?: boolean;
};

type AttendanceOptions = {
  workers: AttendanceWorker[];
  scoped_worker_ids: number[];
  visible_worker_ids: number[];
  has_scope: boolean;
  scope_configured: boolean;
};

type LogAttachment = {
  name: string;
  size: number;
  storageKey: string;
  type: string;
  uploadedAt?: string;
  url?: string;
};

type ProjectLogDraft = {
  id: string;
  project_id: string;
  location: string;
  content: string;
  attendance_worker_ids: number[];
  attendance_worker_hours: Record<string, string>;
  scope_worker_ids: number[];
  worker_work_type: string;
  worker_search: string;
  issues: string;
  attachments: LogAttachment[];
};

const EMPTY_WORK_TYPE = '__empty_work_type__';

const emptyAttendanceOptions: AttendanceOptions = {
  workers: [],
  scoped_worker_ids: [],
  visible_worker_ids: [],
  has_scope: false,
  scope_configured: true,
};

function createDraft(projectId = ''): ProjectLogDraft {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    project_id: projectId,
    location: '',
    content: '',
    attendance_worker_ids: [],
    attendance_worker_hours: {},
    scope_worker_ids: [],
    worker_work_type: '',
    worker_search: '',
    issues: '',
    attachments: [],
  };
}

function getWorkerWorkType(worker: AttendanceWorker) {
  return (worker.work_type || '').trim();
}

function getWorkerTypeLabel(value: string) {
  return value === EMPTY_WORK_TYPE ? '未填写工种' : value;
}

function filterWorkers(workers: AttendanceWorker[], keyword: string, workType: string) {
  const workTypeFiltered = workType
    ? workers.filter((worker) => {
      const workerType = getWorkerWorkType(worker);
      return workType === EMPTY_WORK_TYPE ? !workerType : workerType === workType;
    })
    : workers;
  const value = keyword.trim().toLowerCase();
  if (!value) return workTypeFiltered;
  return workTypeFiltered.filter((worker) => (
    worker.name.toLowerCase().includes(value)
    || (worker.work_type || '').toLowerCase().includes(value)
    || (worker.team_name || '').toLowerCase().includes(value)
  ));
}

function getWorkerHours(draft: ProjectLogDraft, workerId: number) {
  return draft.attendance_worker_hours[String(workerId)] ?? '8';
}

function buildAttendanceWorkers(draft: ProjectLogDraft) {
  return draft.attendance_worker_ids.map((workerId) => ({
    worker_id: workerId,
    work_hours: Number(getWorkerHours(draft, workerId) || 0),
  }));
}

export default function NewConstructionLogPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [logDate, setLogDate] = useState(getDefaultConstructionLogDate());
  const [drafts, setDrafts] = useState<ProjectLogDraft[]>([createDraft()]);
  const [attendanceOptions, setAttendanceOptions] = useState<Record<string, AttendanceOptions>>({});
  const [attendanceLoading, setAttendanceLoading] = useState<Record<string, boolean>>({});
  const [attendanceErrors, setAttendanceErrors] = useState<Record<string, string>>({});
  const [photoUploading, setPhotoUploading] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [submittedStatus, setSubmittedStatus] = useState('');

  useEffect(() => {
    fetch('/api/projects')
      .then(r => r.json())
      .then(j => {
        const list = Array.isArray(j.projects)
          ? j.projects.filter((project: Project) => !project.is_archived)
          : [];
        setProjects(list);
        if (list.length > 0) {
          setDrafts(current => current.map((draft, index) => (
            index === 0 && !draft.project_id ? { ...draft, project_id: String(list[0].id) } : draft
          )));
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const projectIds = Array.from(new Set(drafts.map(draft => draft.project_id).filter(Boolean)));
    projectIds.forEach((projectId) => {
      if (attendanceOptions[projectId] || attendanceLoading[projectId]) return;
      setAttendanceLoading(current => ({ ...current, [projectId]: true }));
      setAttendanceErrors(current => {
        const next = { ...current };
        delete next[projectId];
        return next;
      });
      fetch(`/api/construction-logs/attendance-workers?projectId=${projectId}`)
        .then(res => res.json())
        .then(json => {
          if (json.success === false) throw new Error(json.error || '出勤人员加载失败');
          setAttendanceOptions(current => ({ ...current, [projectId]: json.data || emptyAttendanceOptions }));
        })
        .catch((loadError: unknown) => {
          setAttendanceErrors(current => ({
            ...current,
            [projectId]: loadError instanceof Error ? loadError.message : '出勤人员加载失败',
          }));
          setAttendanceOptions(current => ({ ...current, [projectId]: emptyAttendanceOptions }));
        })
        .finally(() => {
          setAttendanceLoading(current => ({ ...current, [projectId]: false }));
        });
    });
  }, [attendanceLoading, attendanceOptions, drafts]);

  const submissionWindow = useMemo(() => getConstructionLogSubmissionWindow(logDate), [logDate]);
  const isUploadingPhotos = useMemo(() => Object.values(photoUploading).some(Boolean), [photoUploading]);

  function updateDraft(id: string, patch: Partial<ProjectLogDraft>) {
    setDrafts(current => current.map(draft => draft.id === id ? { ...draft, ...patch } : draft));
  }

  function updateDraftProject(id: string, projectId: string) {
    updateDraft(id, {
      project_id: projectId,
      attendance_worker_ids: [],
      attendance_worker_hours: {},
      scope_worker_ids: [],
      worker_work_type: '',
      worker_search: '',
    });
  }

  function addDraft() {
    const usedProjectIds = new Set(drafts.map(draft => draft.project_id).filter(Boolean));
    const nextProject = projects.find(project => !usedProjectIds.has(String(project.id)));
    setDrafts(current => [...current, createDraft(nextProject ? String(nextProject.id) : '')]);
  }

  function removeDraft(id: string) {
    setDrafts(current => current.length === 1 ? current : current.filter(draft => draft.id !== id));
  }

  function toggleAttendance(draftId: string, workerId: number) {
    setDrafts(current => current.map((draft) => {
      if (draft.id !== draftId) return draft;
      const selected = new Set(draft.attendance_worker_ids);
      const scopeSelected = new Set(draft.scope_worker_ids);
      if (selected.has(workerId)) {
        selected.delete(workerId);
        scopeSelected.delete(workerId);
      } else {
        selected.add(workerId);
      }
      const nextHours = { ...draft.attendance_worker_hours };
      if (selected.has(workerId)) {
        nextHours[String(workerId)] = nextHours[String(workerId)] || '8';
      } else {
        delete nextHours[String(workerId)];
      }
      return {
        ...draft,
        attendance_worker_ids: Array.from(selected),
        attendance_worker_hours: nextHours,
        scope_worker_ids: Array.from(scopeSelected),
      };
    }));
  }

  function updateAttendanceHours(draftId: string, workerId: number, value: string) {
    const cleaned = value.replace(/[^\d.]/g, '');
    const normalized = cleaned.split('.').slice(0, 2).join('.');
    setDrafts(current => current.map((draft) => (
      draft.id === draftId
        ? {
          ...draft,
          attendance_worker_hours: {
            ...draft.attendance_worker_hours,
            [String(workerId)]: normalized,
          },
        }
        : draft
    )));
  }

  function addSelectedTemporaryToScope(draftId: string, workerIds: number[]) {
    setDrafts(current => current.map((draft) => {
      if (draft.id !== draftId) return draft;
      return {
        ...draft,
        scope_worker_ids: Array.from(new Set([...draft.scope_worker_ids, ...workerIds])),
      };
    }));
  }

  async function handlePhotoUpload(draftId: string, event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    setPhotoUploading(current => ({ ...current, [draftId]: true }));
    setError('');
    try {
      const formData = new FormData();
      files.forEach(file => formData.append('files', file));
      const res = await fetch('/api/construction-logs/attachments/upload', {
        method: 'POST',
        body: formData,
      });
      const json = await res.json();
      if (!res.ok || json.success === false) throw new Error(json.error || '施工照片上传失败');
      const attachments = Array.isArray(json.data?.attachments) ? json.data.attachments : [];
      setDrafts(current => current.map(draft => (
        draft.id === draftId
          ? { ...draft, attachments: [...draft.attachments, ...attachments] }
          : draft
      )));
    } catch (uploadError: unknown) {
      setError(uploadError instanceof Error ? uploadError.message : '施工照片上传失败');
    } finally {
      setPhotoUploading(current => ({ ...current, [draftId]: false }));
      event.target.value = '';
    }
  }

  function removeAttachment(draftId: string, storageKey: string) {
    setDrafts(current => current.map(draft => (
      draft.id === draftId
        ? { ...draft, attachments: draft.attachments.filter(attachment => attachment.storageKey !== storageKey) }
        : draft
    )));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const validDrafts = drafts.filter(draft => draft.project_id && draft.content.trim());
    const projectIds = validDrafts.map(draft => draft.project_id);
    const uniqueProjectIds = new Set(projectIds);

    if (!logDate || validDrafts.length === 0) {
      setError('请至少填写一个项目的施工内容');
      return;
    }
    if (uniqueProjectIds.size !== projectIds.length) {
      setError('同一份施工日志中不能重复选择同一个项目');
      return;
    }
    if (!submissionWindow.allowed) {
      setError(submissionWindow.message);
      return;
    }
    if (isUploadingPhotos) {
      setError('施工照片仍在上传，请稍后再提交');
      return;
    }
    const invalidHours = validDrafts.some(draft => draft.attendance_worker_ids.some((workerId) => {
      const hours = Number(getWorkerHours(draft, workerId));
      return !Number.isFinite(hours) || hours <= 0 || hours > 24;
    }));
    if (invalidHours) {
      setError('出勤工时需大于0且不超过24小时');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/construction-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          log_date: logDate,
          project_logs: validDrafts.map(draft => ({
            project_id: draft.project_id,
            location: draft.location,
            content: draft.content.trim(),
            headcount: draft.attendance_worker_ids.length,
            attendance_worker_ids: draft.attendance_worker_ids,
            attendance_workers: buildAttendanceWorkers(draft),
            scope_worker_ids: draft.scope_worker_ids,
            attachments: draft.attachments.map(attachment => ({
              name: attachment.name,
              size: attachment.size,
              storageKey: attachment.storageKey,
              type: attachment.type || 'image',
              uploadedAt: attachment.uploadedAt,
            })),
            issues: draft.issues,
          })),
          source_type: 'manual',
        }),
      });
      const json = await res.json();
      if (!res.ok || json.success === false) throw new Error(json.error || '提交失败');
      setSubmittedStatus(submissionWindow.label);
      setSuccess(true);
      setTimeout(() => router.push('/construction-logs'), 1500);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '提交失败');
    } finally {
      setSaving(false);
    }
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F5F6FA] p-4">
        <div className="w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-lg">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#E8FFEA]">
            <ClipboardList className="h-8 w-8 text-[#00A870]" />
          </div>
          <h2 className="text-xl font-bold text-[#1D2129]">提交成功</h2>
          <p className="mt-2 text-sm text-[#86909C]">施工日志已保存，状态：{submittedStatus}</p>
          <div className="mt-6 flex justify-center gap-3">
            <button
              onClick={() => {
                setSuccess(false);
                setDrafts([createDraft(projects[0] ? String(projects[0].id) : '')]);
              }}
              className="rounded-lg border border-[#E5E6EB] px-5 py-2.5 text-sm text-[#4E5969]"
            >
              再写一份
            </button>
            <Link href="/construction-logs" className="rounded-lg bg-[#165DFF] px-5 py-2.5 text-sm text-white">查看日志</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[#F5F6FA] px-3 py-4 sm:p-4 md:p-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <Link href="/construction-logs" className="rounded-lg p-2 hover:bg-[#F2F3F5]">
              <ArrowLeft className="h-5 w-5 text-[#4E5969]" />
            </Link>
            <div>
              <h1 className="text-xl font-bold text-[#1D2129]">写施工日志</h1>
              <p className="text-xs text-[#86909C]">按项目填写施工内容，并从项目花名册勾选当天实际出勤人员</p>
            </div>
          </div>
          <Link href="/construction-logs/scan" className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-[#165DFF] px-3 text-sm font-medium text-[#165DFF] hover:bg-[#E8F3FF] sm:h-9 sm:w-auto">
            <Camera className="h-4 w-4" />拍照识别
          </Link>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <section className="rounded-xl border border-[#E5E6EB] bg-white p-4 shadow-sm sm:p-5">
            <div className="grid gap-3 md:grid-cols-[220px_1fr]">
              <div>
                <label className="mb-1 block text-sm font-medium text-[#1D2129]">日志日期 <span className="text-[#F53F3F]">*</span></label>
                <input
                  type="date"
                  value={logDate}
                  onChange={e => setLogDate(e.target.value)}
                  className="h-11 w-full rounded-xl border border-[#E5E6EB] bg-[#FBFCFF] px-3 text-sm outline-none focus:border-[#165DFF]"
                />
              </div>
              <div className={`rounded-xl border px-4 py-3 text-sm ${
                submissionWindow.status === 'late'
                  ? 'border-[#F59E0B] bg-[#FFF7E8] text-[#B45309]'
                  : submissionWindow.allowed
                    ? 'border-[#A7F3D0] bg-[#ECFDF5] text-[#047857]'
                    : 'border-[#FECACA] bg-[#FEF2F2] text-[#B91C1C]'
              }`}>
                <div className="font-medium">{submissionWindow.label}</div>
                <div className="mt-1 text-xs">{submissionWindow.message}</div>
                <div className="mt-1 text-xs opacity-80">{formatLogWindowText(logDate)}</div>
              </div>
            </div>
          </section>

          {drafts.map((draft, index) => {
            const options = draft.project_id ? attendanceOptions[draft.project_id] || emptyAttendanceOptions : emptyAttendanceOptions;
            const loadingWorkers = draft.project_id ? attendanceLoading[draft.project_id] : false;
            const attendanceError = draft.project_id ? attendanceErrors[draft.project_id] : '';
            const visibleSet = new Set(options.visible_worker_ids);
            const scopedSet = new Set(options.scoped_worker_ids);
            const selectedSet = new Set(draft.attendance_worker_ids);
            const workTypeOptions = Array.from(new Set(
              options.workers.map((worker) => getWorkerWorkType(worker) || EMPTY_WORK_TYPE),
            )).sort((a, b) => getWorkerTypeLabel(a).localeCompare(getWorkerTypeLabel(b), 'zh-Hans-CN'));
            const visibleWorkers = filterWorkers(
              options.workers.filter(worker => visibleSet.has(worker.id)),
              draft.worker_search,
              draft.worker_work_type,
            );
            const otherWorkers = filterWorkers(
              options.workers.filter(worker => !visibleSet.has(worker.id)),
              draft.worker_search,
              draft.worker_work_type,
            );
            const selectedTemporaryIds = draft.attendance_worker_ids.filter(workerId => !scopedSet.has(workerId));
            const pendingScopeIds = selectedTemporaryIds.filter(workerId => !draft.scope_worker_ids.includes(workerId));
            const workerById = new Map(options.workers.map(worker => [worker.id, worker]));
            const selectedWorkers = draft.attendance_worker_ids
              .map(workerId => workerById.get(workerId))
              .filter((worker): worker is AttendanceWorker => Boolean(worker));

            return (
              <section key={draft.id} className="rounded-xl border border-[#E5E6EB] bg-white p-4 shadow-sm sm:p-5">
                <div className="mb-4 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
                  <h2 className="text-base font-semibold text-[#1D2129]">项目明细 {index + 1}</h2>
                  <button
                    type="button"
                    onClick={() => removeDraft(draft.id)}
                    disabled={drafts.length === 1}
                    className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs text-[#F53F3F] hover:bg-[#FFF1F0] disabled:cursor-not-allowed disabled:text-[#C9CDD4] disabled:hover:bg-transparent"
                  >
                    <Trash2 className="h-3.5 w-3.5" />删除
                  </button>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-[#1D2129]">项目 <span className="text-[#F53F3F]">*</span></label>
                    <select
                      value={draft.project_id}
                      onChange={e => updateDraftProject(draft.id, e.target.value)}
                      className="h-11 w-full rounded-xl border border-[#E5E6EB] bg-[#FBFCFF] px-3 text-sm outline-none focus:border-[#165DFF]"
                    >
                      <option value="">请选择项目</option>
                      {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-[#1D2129]">施工部位</label>
                    <input
                      value={draft.location}
                      onChange={e => updateDraft(draft.id, { location: e.target.value })}
                      placeholder="例如：3#楼标准层、地下室底板"
                      className="h-11 w-full rounded-xl border border-[#E5E6EB] bg-[#FBFCFF] px-3 text-sm outline-none focus:border-[#165DFF]"
                    />
                  </div>
                </div>

                <div className="mt-3">
                  <label className="mb-1 block text-sm font-medium text-[#1D2129]">施工内容 <span className="text-[#F53F3F]">*</span></label>
                  <textarea
                    value={draft.content}
                    onChange={e => updateDraft(draft.id, { content: e.target.value })}
                    placeholder="这个项目今天做了什么工作？"
                    rows={4}
                    className="w-full rounded-xl border border-[#E5E6EB] bg-[#FBFCFF] p-3 text-sm outline-none focus:border-[#165DFF]"
                  />
                </div>

                <div className="mt-3">
                  <div className="mb-2 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <label className="block text-sm font-medium text-[#1D2129]">出勤人员</label>
                      <p className="mt-0.5 text-xs text-[#86909C]">
                        已选 {draft.attendance_worker_ids.length} 人，出勤人数将自动按勾选人数统计
                      </p>
                    </div>
                    {pendingScopeIds.length > 0 && (
                      <button
                        type="button"
                        onClick={() => addSelectedTemporaryToScope(draft.id, pendingScopeIds)}
                        className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-[#165DFF] px-3 text-xs font-medium text-[#165DFF] hover:bg-[#E8F3FF] sm:w-auto"
                      >
                        <UserPlus className="h-3.5 w-3.5" />
                        加入我的负责范围
                      </button>
                    )}
                  </div>

                  <div className="rounded-xl border border-[#E5E6EB] bg-[#FBFCFF] p-3">
                    <div className="grid gap-2 md:grid-cols-[180px_1fr]">
                      <select
                        value={draft.worker_work_type}
                        onChange={e => updateDraft(draft.id, { worker_work_type: e.target.value })}
                        disabled={loadingWorkers || options.workers.length === 0}
                        className="h-10 w-full rounded-lg border border-[#E5E6EB] bg-white px-3 text-sm outline-none focus:border-[#165DFF] disabled:bg-[#F2F3F5] disabled:text-[#C9CDD4]"
                      >
                        <option value="">全部工种</option>
                        {workTypeOptions.map((workType) => (
                          <option key={workType} value={workType}>{getWorkerTypeLabel(workType)}</option>
                        ))}
                      </select>
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#86909C]" />
                        <input
                          value={draft.worker_search}
                          onChange={e => updateDraft(draft.id, { worker_search: e.target.value })}
                          placeholder="搜索姓名、工种、班组"
                          className="h-10 w-full rounded-lg border border-[#E5E6EB] bg-white pl-9 pr-3 text-sm outline-none focus:border-[#165DFF]"
                        />
                      </div>
                    </div>

                    {loadingWorkers ? (
                      <div className="mt-3 flex items-center justify-center gap-2 rounded-lg bg-white py-8 text-sm text-[#86909C]">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        正在加载项目花名册...
                      </div>
                    ) : attendanceError ? (
                      <div className="mt-3 rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-sm text-[#B91C1C]">
                        出勤人员加载失败：{attendanceError}
                      </div>
                    ) : options.workers.length === 0 ? (
                      <div className="mt-3 rounded-lg bg-white py-8 text-center text-sm text-[#86909C]">
                        当前项目暂无在场工人，请先在花名册维护工人档案
                      </div>
                    ) : (
                      <div className="mt-3 space-y-3">
                        <div>
                          <div className="mb-2 flex items-center gap-2 text-xs font-medium text-[#4E5969]">
                            <UsersRound className="h-3.5 w-3.5 text-[#165DFF]" />
                            {options.has_scope ? '我的负责人员' : '项目在场人员'}
                          </div>
                          <div className="grid max-h-72 gap-2 overflow-y-auto pr-1 md:max-h-56 md:grid-cols-2">
                            {visibleWorkers.length === 0 ? (
                              <div className="rounded-lg bg-white p-3 text-sm text-[#86909C] md:col-span-2">没有匹配的人员</div>
                            ) : visibleWorkers.map(worker => (
                              <button
                                type="button"
                                key={worker.id}
                                onClick={() => toggleAttendance(draft.id, worker.id)}
                                className={`flex min-h-[68px] items-start gap-3 rounded-lg border bg-white p-3 text-left transition ${
                                  selectedSet.has(worker.id)
                                    ? 'border-[#165DFF] ring-2 ring-[#E8F3FF]'
                                    : 'border-[#E5E6EB] hover:border-[#165DFF]/40'
                                }`}
                              >
                                <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs ${
                                  selectedSet.has(worker.id) ? 'border-[#165DFF] bg-[#165DFF] text-white' : 'border-[#C9CDD4] bg-white'
                                }`}>
                                  {selectedSet.has(worker.id) ? '✓' : ''}
                                </span>
                                <span className="min-w-0">
                                  <span className="block truncate text-sm font-medium text-[#1D2129]">{worker.name}</span>
                                  <span className="mt-1 block truncate text-xs text-[#86909C]">
                                    {[worker.work_type, worker.team_name].filter(Boolean).join(' · ') || '未填写工种/班组'}
                                  </span>
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>

                        {options.has_scope && (
                          <div>
                            <div className="mb-2 text-xs font-medium text-[#4E5969]">项目花名册临时补选</div>
                            <div className="grid max-h-64 gap-2 overflow-y-auto pr-1 md:max-h-44 md:grid-cols-2">
                              {otherWorkers.length === 0 ? (
                                <div className="rounded-lg bg-white p-3 text-sm text-[#86909C] md:col-span-2">没有更多可补选人员</div>
                              ) : otherWorkers.map(worker => (
                                <button
                                  type="button"
                                  key={worker.id}
                                  onClick={() => toggleAttendance(draft.id, worker.id)}
                                  className={`flex min-h-[68px] items-start gap-3 rounded-lg border bg-white p-3 text-left transition ${
                                    selectedSet.has(worker.id)
                                      ? 'border-[#165DFF] ring-2 ring-[#E8F3FF]'
                                      : 'border-[#E5E6EB] hover:border-[#165DFF]/40'
                                  }`}
                                >
                                  <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs ${
                                    selectedSet.has(worker.id) ? 'border-[#165DFF] bg-[#165DFF] text-white' : 'border-[#C9CDD4] bg-white'
                                  }`}>
                                    {selectedSet.has(worker.id) ? '✓' : ''}
                                  </span>
                                  <span className="min-w-0">
                                    <span className="block truncate text-sm font-medium text-[#1D2129]">{worker.name}</span>
                                    <span className="mt-1 block truncate text-xs text-[#86909C]">
                                      {[worker.work_type, worker.team_name].filter(Boolean).join(' · ') || '未填写工种/班组'}
                                    </span>
                                  </span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {selectedWorkers.length > 0 && (
                          <div className="rounded-lg border border-[#D6E4FF] bg-white p-3">
                            <div className="mb-2 flex items-center justify-between gap-2">
                              <p className="text-xs font-medium text-[#1D2129]">已选人员工时</p>
                              <span className="text-xs text-[#86909C]">可录入小数，单人每日不超过24小时</span>
                            </div>
                            <div className="grid gap-2 md:grid-cols-2">
                              {selectedWorkers.map(worker => (
                                <label key={worker.id} className="flex items-center gap-2 rounded-lg bg-[#F7F8FA] px-3 py-2">
                                  <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-medium text-[#1D2129]">{worker.name}</span>
                                    <span className="block truncate text-xs text-[#86909C]">
                                      {[worker.work_type, worker.team_name].filter(Boolean).join(' · ') || '未填写工种/班组'}
                                    </span>
                                  </span>
                                  <input
                                    type="number"
                                    min="0.5"
                                    max="24"
                                    step="0.5"
                                    value={getWorkerHours(draft, worker.id)}
                                    onChange={event => updateAttendanceHours(draft.id, worker.id, event.target.value)}
                                    className="h-9 w-20 rounded-lg border border-[#E5E6EB] bg-white px-2 text-right text-sm text-[#1D2129] outline-none focus:border-[#165DFF]"
                                  />
                                  <span className="text-xs text-[#4E5969]">小时</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        )}

                        {draft.scope_worker_ids.length > 0 && (
                          <div className="rounded-lg border border-[#A7F3D0] bg-[#ECFDF5] px-3 py-2 text-xs text-[#047857]">
                            已标记 {draft.scope_worker_ids.length} 人随本次提交加入我的负责范围，下次填写会优先展示。
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-3">
                  <label className="mb-1 block text-sm font-medium text-[#1D2129]">异常/问题</label>
                  <input
                    value={draft.issues}
                    onChange={e => updateDraft(draft.id, { issues: e.target.value })}
                    placeholder="有无异常情况？"
                    className="h-11 w-full rounded-xl border border-[#E5E6EB] bg-[#FBFCFF] px-3 text-sm outline-none focus:border-[#165DFF]"
                  />
                </div>

                <div className="mt-3">
                  <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <label className="block text-sm font-medium text-[#1D2129]">现场照片附件</label>
                      <p className="mt-0.5 text-xs text-[#86909C]">可上传多张施工照片，提交后可在日志详情中查看</p>
                    </div>
                    <label className="inline-flex h-9 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-[#165DFF] px-3 text-xs font-medium text-[#165DFF] hover:bg-[#E8F3FF] sm:w-auto">
                      {photoUploading[draft.id] ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />}
                      {photoUploading[draft.id] ? '上传中...' : '上传照片'}
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        multiple
                        onChange={event => handlePhotoUpload(draft.id, event)}
                        disabled={photoUploading[draft.id]}
                        className="hidden"
                      />
                    </label>
                  </div>

                  {draft.attachments.length > 0 ? (
                    <div className="grid gap-2 rounded-xl border border-[#E5E6EB] bg-[#FBFCFF] p-3 sm:grid-cols-2 md:grid-cols-3">
                      {draft.attachments.map((attachment, attachmentIndex) => (
                        <div key={attachment.storageKey} className="overflow-hidden rounded-lg border border-[#E5E6EB] bg-white">
                          {attachment.url ? (
                            <img
                              src={attachment.url}
                              alt={`施工照片${attachmentIndex + 1}`}
                              className="h-28 w-full bg-[#F2F3F5] object-cover"
                            />
                          ) : (
                            <div className="flex h-28 items-center justify-center bg-[#F2F3F5] text-xs text-[#86909C]">照片已上传</div>
                          )}
                          <div className="flex items-center justify-between gap-2 px-2 py-2">
                            <span className="min-w-0 truncate text-xs text-[#4E5969]">{attachment.name || `照片${attachmentIndex + 1}`}</span>
                            <button
                              type="button"
                              onClick={() => removeAttachment(draft.id, attachment.storageKey)}
                              className="shrink-0 rounded-md p-1 text-[#F53F3F] hover:bg-[#FFF1F0]"
                              aria-label="删除照片"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-[#C9CDD4] bg-[#FAFBFF] px-4 py-6 text-center text-sm text-[#86909C]">
                      暂未上传现场照片
                    </div>
                  )}
                </div>
              </section>
            );
          })}

          {error && <div className="rounded-xl border border-[#FECACA] bg-[#FEF2F2] p-3 text-sm text-[#B91C1C]">{error}</div>}

          <div className="flex flex-col items-stretch justify-between gap-3 rounded-xl border border-[#E5E6EB] bg-white p-4 shadow-sm sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={addDraft}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[#165DFF] px-4 text-sm font-medium text-[#165DFF] hover:bg-[#E8F3FF]"
            >
              <Plus className="h-4 w-4" />添加项目明细
            </button>
            <button
              type="submit"
              disabled={saving || isUploadingPhotos || !submissionWindow.allowed}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#165DFF] px-5 text-sm font-medium text-white hover:bg-[#0E49D8] disabled:opacity-60 sm:w-auto sm:min-w-[160px]"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {saving ? '提交中...' : isUploadingPhotos ? '照片上传中...' : '提交日志'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
