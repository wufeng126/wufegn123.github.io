'use client';

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Camera, CheckCircle2, ImageIcon, Loader2, RotateCcw, Search, Send, UserPlus, UsersRound } from 'lucide-react';
import {
  formatLogWindowText,
  getConstructionLogSubmissionWindow,
  getDefaultConstructionLogDate,
} from '@/lib/construction-log-deadline';
import { validateAttendanceCountConsistency } from '@/lib/construction-log-attendance-risk';
import { isPublicLogRestrictedUser } from '@/lib/construction-log-role-rules';
import { usePermission } from '@/contexts/permission-context';

type Project = { id: number | string; name: string; is_archived?: boolean };
type RecognizedFile = { name: string; size: number; storageKey?: string; textLength?: number };
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

const EMPTY_WORK_TYPE = '__empty_work_type__';
const PUBLIC_LOG_PROJECT_NAME = '\u516c\u53f8\u516c\u5171\u9879\u76ee/\u975e\u9879\u76ee\u65e5\u5fd7';

const emptyAttendanceOptions: AttendanceOptions = {
  workers: [],
  scoped_worker_ids: [],
  visible_worker_ids: [],
  has_scope: false,
  scope_configured: true,
};

function getWorkerWorkType(worker: AttendanceWorker) {
  return (worker.work_type || '').trim();
}

function getWorkerTypeLabel(value: string) {
  return value === EMPTY_WORK_TYPE ? '\u672a\u586b\u5199\u5de5\u79cd' : value;
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

export default function ConstructionLogScanPage() {
  const router = useRouter();
  const { user } = usePermission();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState('');
  const [logDate, setLogDate] = useState(getDefaultConstructionLogDate());
  const [location, setLocation] = useState('');
  const [content, setContent] = useState('');
  const [headcount, setHeadcount] = useState('');
  const [issues, setIssues] = useState('');
  const [previews, setPreviews] = useState<string[]>([]);
  const [recognizedFiles, setRecognizedFiles] = useState<RecognizedFile[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [attendanceOptions, setAttendanceOptions] = useState<AttendanceOptions>(emptyAttendanceOptions);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [attendanceError, setAttendanceError] = useState('');
  const [attendanceWorkerIds, setAttendanceWorkerIds] = useState<number[]>([]);
  const [attendanceWorkerHours, setAttendanceWorkerHours] = useState<Record<string, string>>({});
  const [scopeWorkerIds, setScopeWorkerIds] = useState<number[]>([]);
  const [workerWorkType, setWorkerWorkType] = useState('');
  const [workerSearch, setWorkerSearch] = useState('');
  const [recognizing, setRecognizing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetch('/api/projects?includePublicLog=1')
      .then(res => res.json())
      .then(json => {
        const list = Array.isArray(json.projects)
          ? json.projects
            .filter((project: Project) => !project.is_archived)
            .filter((project: Project) => (
              !(isPublicLogRestrictedUser(user) && project.name === PUBLIC_LOG_PROJECT_NAME)
            ))
          : [];
        setProjects(list);
        if (list.length > 0) setProjectId(String(list[0].id));
      })
      .catch(() => setMessage('项目列表加载失败'));
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    if (!projectId) {
      void Promise.resolve().then(() => {
        if (!cancelled) setAttendanceOptions(emptyAttendanceOptions);
      });
      return () => {
        cancelled = true;
      };
    }

    void Promise.resolve().then(() => {
      if (cancelled) return;
      setAttendanceLoading(true);
      setAttendanceError('');
      fetch(`/api/construction-logs/attendance-workers?projectId=${projectId}`)
        .then(res => res.json())
        .then(json => {
          if (cancelled) return;
          if (json.success === false) throw new Error(json.error || '\u51fa\u52e4\u4eba\u5458\u52a0\u8f7d\u5931\u8d25');
          setAttendanceOptions(json.data || emptyAttendanceOptions);
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          setAttendanceError(error instanceof Error ? error.message : '\u51fa\u52e4\u4eba\u5458\u52a0\u8f7d\u5931\u8d25');
          setAttendanceOptions(emptyAttendanceOptions);
        })
        .finally(() => {
          if (!cancelled) setAttendanceLoading(false);
        });
    });

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  function resetAttendanceSelection() {
    setAttendanceWorkerIds([]);
    setAttendanceWorkerHours({});
    setScopeWorkerIds([]);
    setWorkerWorkType('');
    setWorkerSearch('');
  }

  function handleProjectChange(nextProjectId: string) {
    if (nextProjectId === projectId) {
      return;
    }
    resetAttendanceSelection();
    setAttendanceError('');
    setProjectId(nextProjectId);
  }

  const visibleSet = useMemo(() => new Set(attendanceOptions.visible_worker_ids), [attendanceOptions.visible_worker_ids]);
  const scopedSet = useMemo(() => new Set(attendanceOptions.scoped_worker_ids), [attendanceOptions.scoped_worker_ids]);
  const selectedSet = useMemo(() => new Set(attendanceWorkerIds), [attendanceWorkerIds]);
  const workTypeOptions = useMemo(() => Array.from(new Set(
    attendanceOptions.workers.map((worker) => getWorkerWorkType(worker) || EMPTY_WORK_TYPE),
  )).sort((a, b) => getWorkerTypeLabel(a).localeCompare(getWorkerTypeLabel(b), 'zh-Hans-CN')), [attendanceOptions.workers]);
  const visibleWorkers = useMemo(() => filterWorkers(
    attendanceOptions.workers.filter(worker => visibleSet.has(worker.id)),
    workerSearch,
    workerWorkType,
  ), [attendanceOptions.workers, visibleSet, workerSearch, workerWorkType]);
  const otherWorkers = useMemo(() => filterWorkers(
    attendanceOptions.workers.filter(worker => !visibleSet.has(worker.id)),
    workerSearch,
    workerWorkType,
  ), [attendanceOptions.workers, visibleSet, workerSearch, workerWorkType]);
  const workerById = useMemo(() => new Map(attendanceOptions.workers.map(worker => [worker.id, worker])), [attendanceOptions.workers]);
  const selectedWorkers = useMemo(() => attendanceWorkerIds
    .map(workerId => workerById.get(workerId))
    .filter((worker): worker is AttendanceWorker => Boolean(worker)), [attendanceWorkerIds, workerById]);
  const pendingScopeIds = useMemo(() => attendanceWorkerIds
    .filter(workerId => !scopedSet.has(workerId))
    .filter(workerId => !scopeWorkerIds.includes(workerId)), [attendanceWorkerIds, scopedSet, scopeWorkerIds]);
  const displayedHeadcount = attendanceWorkerIds.length > 0 ? String(attendanceWorkerIds.length) : headcount;
  const submissionWindow = useMemo(() => getConstructionLogSubmissionWindow(logDate), [logDate]);
  const attendanceValidation = useMemo(() => validateAttendanceCountConsistency({
    content,
    selectedCount: attendanceWorkerIds.length,
  }), [attendanceWorkerIds.length, content]);
  const canSubmit = Boolean(projectId && logDate && content.trim() && submissionWindow.allowed);

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    setMessage('');
    setWarnings([]);
    setRecognizedFiles([]);
    setPreviews(files.map(file => URL.createObjectURL(file)));
    setRecognizing(true);
    try {
      const formData = new FormData();
      files.forEach(file => formData.append('files', file));
      const res = await fetch('/api/construction-logs/ocr', { method: 'POST', body: formData });
      const json = await res.json();
      if (!res.ok || json.success === false) throw new Error(json.error || '识别失败');

      const data = json.data || {};
      const draft = data.draft || {};
      if (draft.content) setContent(draft.content);
      setRecognizedFiles(Array.isArray(data.files) ? data.files : []);
      setWarnings(Array.isArray(data.warnings) ? data.warnings : data.warning ? [data.warning] : []);
      setMessage(data.warning || '已自动纠错整理施工内容，请人工核对后提交');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '识别失败，请人工补录');
    } finally {
      setRecognizing(false);
      event.target.value = '';
    }
  }

  function toggleAttendance(workerId: number) {
    setAttendanceWorkerIds(current => {
      const selected = new Set(current);
      if (selected.has(workerId)) {
        selected.delete(workerId);
      } else {
        selected.add(workerId);
      }
      return Array.from(selected);
    });
    setScopeWorkerIds(current => current.filter(id => id !== workerId));
    setAttendanceWorkerHours(current => {
      const next = { ...current };
      if (attendanceWorkerIds.includes(workerId)) {
        delete next[String(workerId)];
      } else {
        next[String(workerId)] = next[String(workerId)] || '10';
      }
      return next;
    });
  }

  function updateAttendanceHours(workerId: number, value: string) {
    const cleaned = value.replace(/[^\d.]/g, '');
    const normalized = cleaned.split('.').slice(0, 2).join('.');
    setAttendanceWorkerHours(current => ({
      ...current,
      [String(workerId)]: normalized,
    }));
  }

  function getWorkerHours(workerId: number) {
    return attendanceWorkerHours[String(workerId)] ?? '10';
  }

  function addSelectedTemporaryToScope(workerIds: number[]) {
    setScopeWorkerIds(current => Array.from(new Set([...current, ...workerIds])));
  }

  function buildAttendanceWorkers() {
    return attendanceWorkerIds.map((workerId) => ({
      worker_id: workerId,
      work_hours: Number(getWorkerHours(workerId) || 0),
    }));
  }

  function resetDraft() {
    setLocation('');
    setContent('');
    setHeadcount('');
    setIssues('');
    setPreviews([]);
    setRecognizedFiles([]);
    setWarnings([]);
    setAttendanceWorkerIds([]);
    setAttendanceWorkerHours({});
    setScopeWorkerIds([]);
    setWorkerWorkType('');
    setWorkerSearch('');
    setMessage('');
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!projectId || !logDate || !content.trim()) {
      setMessage('项目、日期和施工内容为必填项');
      return;
    }
    if (!submissionWindow.allowed) {
      setMessage(submissionWindow.message);
      return;
    }

    const invalidHours = attendanceWorkerIds.some((workerId) => {
      const hours = Number(getWorkerHours(workerId));
      return !Number.isFinite(hours) || hours <= 0 || hours > 24;
    });
    if (invalidHours) {
      setMessage('\u51fa\u52e4\u5de5\u65f6\u9700\u5927\u4e8e0\u4e14\u4e0d\u8d85\u8fc724\u5c0f\u65f6');
      return;
    }
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch('/api/construction-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          log_date: logDate,
          location,
          content: content.trim(),
          headcount: attendanceWorkerIds.length > 0 ? attendanceWorkerIds.length : headcount,
          attendance_worker_ids: attendanceWorkerIds,
          attendance_workers: buildAttendanceWorkers(),
          scope_worker_ids: scopeWorkerIds,
          attachments: recognizedFiles.map(file => ({
            name: file.name,
            size: file.size,
            storageKey: file.storageKey,
            type: 'image',
          })).filter(file => file.storageKey),
          issues,
          source_type: 'ocr',
        }),
      });
      const json = await res.json();
      if (!res.ok || json.success === false) throw new Error(json.error || '提交失败');
      setSuccess(true);
      setTimeout(() => router.push('/construction-logs'), 1200);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '提交失败');
    } finally {
      setSaving(false);
    }
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#EEF3F8] p-4">
        <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
            <CheckCircle2 className="h-8 w-8 text-emerald-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-950">提交成功</h2>
          <p className="mt-2 text-sm text-slate-500">施工日志已保存，风险识别会自动进入风险池</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[#EEF3F8] px-3 py-4 sm:p-4 md:p-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-5 flex items-start gap-3">
          <Link href="/construction-logs" className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm hover:border-blue-200 hover:text-blue-700">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <p className="text-xs font-medium text-slate-500">施工管理 / 施工日志</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-normal text-slate-950">拍照识别施工日志</h1>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
          <aside className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-950">照片识别</h2>
              <p className="mt-1 text-xs text-slate-500">先拍照或上传，识别后在右侧核对。</p>
            </div>
            <div className="p-4">
            <div className="flex min-h-[240px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50/80 px-4 text-center">
              {previews.length > 0 ? (
                <div className="grid w-full grid-cols-2 gap-2">
                  {previews.slice(0, 6).map((preview, index) => (
                    <img key={preview} src={preview} alt={`施工日志照片预览${index + 1}`} className="h-28 w-full rounded-lg bg-slate-100 object-cover ring-1 ring-slate-200" />
                  ))}
                </div>
              ) : (
                <>
                  <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-700 ring-1 ring-blue-100">
                    <Camera className="h-6 w-6" />
                  </span>
                  <span className="text-sm font-medium text-slate-950">拍照或上传日志本照片</span>
                  <span className="mt-1 text-xs text-slate-500">可一次选择多张，建议照片清晰平整</span>
                </>
              )}
              <div className="mt-4 grid w-full grid-cols-2 gap-2">
                <label className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700">
                  <Camera className="h-4 w-4" />
                  拍照识别
                  <input type="file" accept="image/*" capture="environment" multiple onChange={handleFile} className="hidden" />
                </label>
                <label className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border border-blue-200 bg-white px-3 text-sm font-medium text-blue-700 hover:bg-blue-50">
                  <ImageIcon className="h-4 w-4" />
                  上传照片
                  <input type="file" accept="image/*" multiple onChange={handleFile} className="hidden" />
                </label>
              </div>
            </div>

            {recognizing && (
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-700 ring-1 ring-blue-100">
                <Loader2 className="h-4 w-4 animate-spin" />
                正在识别并整理草稿...
              </div>
            )}

            {(warnings.length > 0 || recognizedFiles.length > 0) && (
              <div className="mt-4 rounded-lg bg-slate-50/70 p-3 ring-1 ring-slate-200">
                {recognizedFiles.length > 0 && (
                  <p className="text-xs text-slate-500">已识别 {recognizedFiles.length} 张照片</p>
                )}
                {warnings.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {warnings.map((item, index) => (
                      <p key={index} className="text-xs text-amber-700">{item}</p>
                    ))}
                  </div>
                )}
              </div>
            )}

            </div>
          </aside>

          <form onSubmit={handleSubmit} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/80 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div>
                <h2 className="font-semibold text-slate-950">人工确认草稿</h2>
                <p className="mt-1 text-xs text-slate-500">识别内容可能有误，请核对后提交</p>
              </div>
              <button type="button" onClick={resetDraft} className="inline-flex h-9 w-full items-center justify-center gap-1 rounded-lg border border-slate-200 px-3 text-xs text-slate-600 hover:bg-slate-50/70 sm:w-auto">
                <RotateCcw className="h-3.5 w-3.5" />清空
              </button>
            </div>

            <div className="p-4 sm:p-5">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-950">项目 <span className="text-red-500">*</span></label>
                <select value={projectId} onChange={event => handleProjectChange(event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100">
                  {projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-950">日期 <span className="text-red-500">*</span></label>
                <input type="date" value={logDate} onChange={event => setLogDate(event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
              </div>
            </div>
            <div className={`mt-3 rounded-xl border px-4 py-3 text-sm ${
              submissionWindow.status === 'late'
                ? 'border-amber-200 bg-amber-50 text-amber-700'
                : submissionWindow.allowed
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-red-200 bg-red-50 text-red-700'
            }`}>
              <div className="font-medium">{submissionWindow.label}</div>
              <div className="mt-1 text-xs">{submissionWindow.message}</div>
              <div className="mt-1 text-xs opacity-80">{formatLogWindowText(logDate)}</div>
            </div>

            <div className="mt-3">
              <label className="mb-1 block text-sm font-medium text-slate-950">施工部位</label>
              <input value={location} onChange={event => setLocation(event.target.value)} placeholder="例如：3#楼标准层、地下室底板" className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
            </div>

            <div className="mt-3">
              <label className="mb-1 block text-sm font-medium text-slate-950">施工内容 <span className="text-red-500">*</span></label>
              <textarea value={content} onChange={event => setContent(event.target.value)} placeholder="识别后会自动填入，可人工修改" rows={7} className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
              {!attendanceValidation.ok && attendanceValidation.message && (
                <div className="mt-2 rounded-lg border border-[#F59E0B] bg-[#FFF7E8] px-3 py-2 text-xs text-[#B45309]">
                  {attendanceValidation.message}
                </div>
              )}
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-950">出勤人数</label>
                <input
                  type="number"
                  value={displayedHeadcount}
                  onChange={event => setHeadcount(event.target.value)}
                  disabled={attendanceWorkerIds.length > 0}
                  placeholder="0"
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100 disabled:text-slate-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-950">异常/问题</label>
                <input value={issues} onChange={event => setIssues(event.target.value)} placeholder="有无异常情况" className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
              </div>
            </div>

            <div className="mt-4">
              <div className="mb-2 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <label className="block text-sm font-medium text-slate-950">出勤人员与工时</label>
                  <p className="mt-0.5 text-xs text-slate-500">已选 {attendanceWorkerIds.length} 人，选择人员后出勤人数自动按勾选人数统计</p>
                </div>
                {pendingScopeIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => addSelectedTemporaryToScope(pendingScopeIds)}
                    className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-blue-200 px-3 text-xs font-medium text-blue-600 hover:bg-blue-50 sm:w-auto"
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                    加入我的负责范围
                  </button>
                )}
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="grid gap-2 md:grid-cols-[180px_1fr]">
                  <select
                    value={workerWorkType}
                    onChange={event => setWorkerWorkType(event.target.value)}
                    disabled={attendanceLoading || attendanceOptions.workers.length === 0}
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100 disabled:text-slate-300"
                  >
                    <option value="">全部工种</option>
                    {workTypeOptions.map((workType) => (
                      <option key={workType} value={workType}>{getWorkerTypeLabel(workType)}</option>
                    ))}
                  </select>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                    <input
                      value={workerSearch}
                      onChange={event => setWorkerSearch(event.target.value)}
                      placeholder="搜索姓名、工种、班组"
                      className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                </div>

                {attendanceLoading ? (
                  <div className="mt-3 flex items-center justify-center gap-2 rounded-lg bg-white py-8 text-sm text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    正在加载项目花名册...
                  </div>
                ) : attendanceError ? (
                  <div className="mt-3 rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-sm text-[#B91C1C]">
                    出勤人员加载失败：{attendanceError}
                  </div>
                ) : attendanceOptions.workers.length === 0 ? (
                  <div className="mt-3 rounded-lg bg-white py-8 text-center text-sm text-slate-500">
                    当前项目暂无在场工人，请先在花名册维护工人档案
                  </div>
                ) : (
                  <div className="mt-3 space-y-3">
                    <div>
                      <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-600">
                        <UsersRound className="h-3.5 w-3.5 text-blue-600" />
                        {attendanceOptions.has_scope ? '我的负责人员' : '项目在场人员'}
                      </div>
                      <div className="grid max-h-72 gap-2 overflow-y-auto pr-1 md:max-h-56 md:grid-cols-2">
                        {visibleWorkers.length === 0 ? (
                          <div className="rounded-lg bg-white p-3 text-sm text-slate-500 md:col-span-2">没有匹配的人员</div>
                        ) : visibleWorkers.map(worker => (
                          <button
                            type="button"
                            key={worker.id}
                            onClick={() => toggleAttendance(worker.id)}
                            className={`flex min-h-[68px] items-start gap-3 rounded-lg border bg-white p-3 text-left transition ${
                              selectedSet.has(worker.id)
                                ? 'border-blue-400 ring-2 ring-blue-100'
                                : 'border-slate-200 hover:border-blue-200'
                            }`}
                          >
                            <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs ${
                              selectedSet.has(worker.id) ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white'
                            }`}>
                              {selectedSet.has(worker.id) ? '\u2713' : ''}
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-medium text-slate-950">{worker.name}</span>
                              <span className="mt-1 block truncate text-xs text-slate-500">
                                {[worker.work_type, worker.team_name].filter(Boolean).join(' · ') || '未填写工种/班组'}
                              </span>
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {attendanceOptions.has_scope && (
                      <div>
                        <div className="mb-2 text-xs font-medium text-slate-600">项目花名册临时补选</div>
                        <div className="grid max-h-64 gap-2 overflow-y-auto pr-1 md:max-h-44 md:grid-cols-2">
                          {otherWorkers.length === 0 ? (
                            <div className="rounded-lg bg-white p-3 text-sm text-slate-500 md:col-span-2">没有更多可补选人员</div>
                          ) : otherWorkers.map(worker => (
                            <button
                              type="button"
                              key={worker.id}
                              onClick={() => toggleAttendance(worker.id)}
                              className={`flex min-h-[68px] items-start gap-3 rounded-lg border bg-white p-3 text-left transition ${
                                selectedSet.has(worker.id)
                                  ? 'border-blue-400 ring-2 ring-blue-100'
                                  : 'border-slate-200 hover:border-blue-200'
                              }`}
                            >
                              <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs ${
                                selectedSet.has(worker.id) ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white'
                              }`}>
                                {selectedSet.has(worker.id) ? '\u2713' : ''}
                              </span>
                              <span className="min-w-0">
                                <span className="block truncate text-sm font-medium text-slate-950">{worker.name}</span>
                                <span className="mt-1 block truncate text-xs text-slate-500">
                                  {[worker.work_type, worker.team_name].filter(Boolean).join(' · ') || '未填写工种/班组'}
                                </span>
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {selectedWorkers.length > 0 && (
                      <div className="rounded-lg border border-blue-100 bg-white p-3">
                        <div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                          <p className="text-xs font-medium text-slate-950">已选人员工时</p>
                          <span className="text-xs text-slate-500">可录入小数，单人每日不超过24小时</span>
                        </div>
                        <div className="grid gap-2 md:grid-cols-2">
                          {selectedWorkers.map(worker => (
                            <label key={worker.id} className="flex items-center gap-2 rounded-lg bg-slate-50/70 px-3 py-2">
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-medium text-slate-950">{worker.name}</span>
                                <span className="block truncate text-xs text-slate-500">
                                  {[worker.work_type, worker.team_name].filter(Boolean).join(' · ') || '未填写工种/班组'}
                                </span>
                              </span>
                              <input
                                type="number"
                                min="0.5"
                                max="24"
                                step="0.5"
                                value={getWorkerHours(worker.id)}
                                onChange={event => updateAttendanceHours(worker.id, event.target.value)}
                                className="h-9 w-20 rounded-lg border border-slate-200 bg-white px-2 text-right text-sm text-slate-950 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                              />
                              <span className="text-xs text-slate-600">小时</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}

                    {scopeWorkerIds.length > 0 && (
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                        已标记 {scopeWorkerIds.length} 人随本次提交加入我的负责范围，下次填写会优先展示。
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {message && <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-sm text-slate-600">{message}</div>}

            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 text-xs text-slate-600">
              本次将提交 1 个项目日志，已选 {attendanceWorkerIds.length} 名出勤人员，照片 {recognizedFiles.filter(file => file.storageKey).length} 张
            </div>

            <button type="submit" disabled={saving || recognizing || !canSubmit} className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {saving ? '提交中...' : '确认提交施工日志'}
            </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
