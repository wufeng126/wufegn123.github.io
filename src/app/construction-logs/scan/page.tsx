'use client';

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Camera, CheckCircle2, Loader2, RotateCcw, Search, Send, UserPlus, UsersRound } from 'lucide-react';
import { getDefaultConstructionLogDate } from '@/lib/construction-log-deadline';

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
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState('');
  const [logDate, setLogDate] = useState(getDefaultConstructionLogDate());
  const [location, setLocation] = useState('');
  const [content, setContent] = useState('');
  const [headcount, setHeadcount] = useState('');
  const [issues, setIssues] = useState('');
  const [rawText, setRawText] = useState('');
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
    fetch('/api/projects')
      .then(res => res.json())
      .then(json => {
        const list = Array.isArray(json.projects)
          ? json.projects.filter((project: Project) => !project.is_archived)
          : [];
        setProjects(list);
        if (list.length > 0) setProjectId(String(list[0].id));
      })
      .catch(() => setMessage('项目列表加载失败'));
  }, []);

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

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    setMessage('');
    setRawText('');
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
      setRawText(data.rawText || '');
      if (draft.log_date) setLogDate(draft.log_date);
      if (draft.location) setLocation(draft.location);
      if (draft.content) setContent(draft.content);
      if (draft.headcount) setHeadcount(draft.headcount);
      if (draft.issues) setIssues(draft.issues);
      setRecognizedFiles(Array.isArray(data.files) ? data.files : []);
      setWarnings(Array.isArray(data.warnings) ? data.warnings : data.warning ? [data.warning] : []);
      setMessage(data.warning || '已自动整理为草稿，请人工核对后提交');
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
        next[String(workerId)] = next[String(workerId)] || '8';
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
    return attendanceWorkerHours[String(workerId)] ?? '8';
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
    setRawText('');
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
      <div className="flex min-h-screen items-center justify-center bg-[#F5F6FA] p-4">
        <div className="w-full max-w-sm rounded-2xl border border-[#E5E6EB] bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#E8FFEA]">
            <CheckCircle2 className="h-8 w-8 text-[#00A870]" />
          </div>
          <h2 className="text-xl font-bold text-[#1D2129]">提交成功</h2>
          <p className="mt-2 text-sm text-[#86909C]">施工日志已保存，风险识别会自动进入风险池</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[#F5F6FA] px-3 py-4 sm:p-4 md:p-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-5 flex items-start gap-3">
          <Link href="/construction-logs" className="rounded-lg p-2 hover:bg-[#F2F3F5]">
            <ArrowLeft className="h-5 w-5 text-[#4E5969]" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-[#1D2129]">拍照识别施工日志</h1>
            <p className="text-xs text-[#86909C]">照片识别后先生成草稿，人工确认后再提交</p>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
          <div className="rounded-xl border border-[#E5E6EB] bg-white p-4">
            <label className="flex min-h-[220px] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-[#C9CDD4] bg-[#FAFBFF] px-4 text-center hover:border-[#165DFF] sm:min-h-[260px]">
              {previews.length > 0 ? (
                <div className="grid w-full grid-cols-2 gap-2">
                  {previews.slice(0, 6).map((preview, index) => (
                    <img key={preview} src={preview} alt={`施工日志照片预览${index + 1}`} className="h-28 w-full rounded-lg object-cover" />
                  ))}
                </div>
              ) : (
                <>
                  <Camera className="mb-3 h-10 w-10 text-[#165DFF]" />
                  <span className="text-sm font-medium text-[#1D2129]">拍照或上传日志本照片</span>
                  <span className="mt-1 text-xs text-[#86909C]">可一次选择多张，建议照片清晰平整</span>
                </>
              )}
              <input type="file" accept="image/*" capture="environment" multiple onChange={handleFile} className="hidden" />
            </label>

            {recognizing && (
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-[#E8F3FF] px-3 py-2 text-sm text-[#165DFF]">
                <Loader2 className="h-4 w-4 animate-spin" />
                正在识别并整理草稿...
              </div>
            )}

            {(warnings.length > 0 || recognizedFiles.length > 0) && (
              <div className="mt-4 rounded-lg border border-[#E5E6EB] bg-[#FAFBFF] p-3">
                {recognizedFiles.length > 0 && (
                  <p className="text-xs text-[#86909C]">已识别 {recognizedFiles.length} 张照片</p>
                )}
                {warnings.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {warnings.map((item, index) => (
                      <p key={index} className="text-xs text-[#D46B08]">{item}</p>
                    ))}
                  </div>
                )}
              </div>
            )}

            {rawText && (
              <div className="mt-4">
                <h2 className="mb-2 text-sm font-semibold text-[#1D2129]">识别原文</h2>
                <div className="max-h-[220px] overflow-auto rounded-lg border border-[#E5E6EB] bg-[#FAFBFF] p-3 text-xs leading-5 text-[#4E5969] whitespace-pre-wrap">
                  {rawText}
                </div>
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit} className="rounded-xl border border-[#E5E6EB] bg-white p-4 sm:p-5">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-semibold text-[#1D2129]">人工确认草稿</h2>
                <p className="mt-1 text-xs text-[#86909C]">识别内容可能有误，请核对后提交</p>
              </div>
              <button type="button" onClick={resetDraft} className="inline-flex h-9 w-full items-center justify-center gap-1 rounded-lg border border-[#E5E6EB] px-3 text-xs text-[#4E5969] hover:bg-[#F7F8FA] sm:w-auto">
                <RotateCcw className="h-3.5 w-3.5" />清空
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-[#1D2129]">项目 <span className="text-[#F53F3F]">*</span></label>
                <select value={projectId} onChange={event => handleProjectChange(event.target.value)} className="h-11 w-full rounded-xl border border-[#E5E6EB] bg-[#FBFCFF] px-3 text-sm outline-none focus:border-[#165DFF]">
                  {projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[#1D2129]">日期 <span className="text-[#F53F3F]">*</span></label>
                <input type="date" value={logDate} onChange={event => setLogDate(event.target.value)} className="h-11 w-full rounded-xl border border-[#E5E6EB] bg-[#FBFCFF] px-3 text-sm outline-none focus:border-[#165DFF]" />
              </div>
            </div>

            <div className="mt-3">
              <label className="mb-1 block text-sm font-medium text-[#1D2129]">施工部位</label>
              <input value={location} onChange={event => setLocation(event.target.value)} placeholder="例如：3#楼标准层、地下室底板" className="h-11 w-full rounded-xl border border-[#E5E6EB] bg-[#FBFCFF] px-3 text-sm outline-none focus:border-[#165DFF]" />
            </div>

            <div className="mt-3">
              <label className="mb-1 block text-sm font-medium text-[#1D2129]">施工内容 <span className="text-[#F53F3F]">*</span></label>
              <textarea value={content} onChange={event => setContent(event.target.value)} placeholder="识别后会自动填入，可人工修改" rows={7} className="w-full rounded-xl border border-[#E5E6EB] bg-[#FBFCFF] p-3 text-sm outline-none focus:border-[#165DFF]" />
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-[#1D2129]">出勤人数</label>
                <input
                  type="number"
                  value={displayedHeadcount}
                  onChange={event => setHeadcount(event.target.value)}
                  disabled={attendanceWorkerIds.length > 0}
                  placeholder="0"
                  className="h-11 w-full rounded-xl border border-[#E5E6EB] bg-[#FBFCFF] px-3 text-sm outline-none focus:border-[#165DFF] disabled:bg-[#F2F3F5] disabled:text-[#86909C]"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[#1D2129]">异常/问题</label>
                <input value={issues} onChange={event => setIssues(event.target.value)} placeholder="有无异常情况" className="h-11 w-full rounded-xl border border-[#E5E6EB] bg-[#FBFCFF] px-3 text-sm outline-none focus:border-[#165DFF]" />
              </div>
            </div>

            <div className="mt-4">
              <div className="mb-2 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <label className="block text-sm font-medium text-[#1D2129]">出勤人员与工时</label>
                  <p className="mt-0.5 text-xs text-[#86909C]">已选 {attendanceWorkerIds.length} 人，选择人员后出勤人数自动按勾选人数统计</p>
                </div>
                {pendingScopeIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => addSelectedTemporaryToScope(pendingScopeIds)}
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
                    value={workerWorkType}
                    onChange={event => setWorkerWorkType(event.target.value)}
                    disabled={attendanceLoading || attendanceOptions.workers.length === 0}
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
                      value={workerSearch}
                      onChange={event => setWorkerSearch(event.target.value)}
                      placeholder="搜索姓名、工种、班组"
                      className="h-10 w-full rounded-lg border border-[#E5E6EB] bg-white pl-9 pr-3 text-sm outline-none focus:border-[#165DFF]"
                    />
                  </div>
                </div>

                {attendanceLoading ? (
                  <div className="mt-3 flex items-center justify-center gap-2 rounded-lg bg-white py-8 text-sm text-[#86909C]">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    正在加载项目花名册...
                  </div>
                ) : attendanceError ? (
                  <div className="mt-3 rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-sm text-[#B91C1C]">
                    出勤人员加载失败：{attendanceError}
                  </div>
                ) : attendanceOptions.workers.length === 0 ? (
                  <div className="mt-3 rounded-lg bg-white py-8 text-center text-sm text-[#86909C]">
                    当前项目暂无在场工人，请先在花名册维护工人档案
                  </div>
                ) : (
                  <div className="mt-3 space-y-3">
                    <div>
                      <div className="mb-2 flex items-center gap-2 text-xs font-medium text-[#4E5969]">
                        <UsersRound className="h-3.5 w-3.5 text-[#165DFF]" />
                        {attendanceOptions.has_scope ? '我的负责人员' : '项目在场人员'}
                      </div>
                      <div className="grid max-h-72 gap-2 overflow-y-auto pr-1 md:max-h-56 md:grid-cols-2">
                        {visibleWorkers.length === 0 ? (
                          <div className="rounded-lg bg-white p-3 text-sm text-[#86909C] md:col-span-2">没有匹配的人员</div>
                        ) : visibleWorkers.map(worker => (
                          <button
                            type="button"
                            key={worker.id}
                            onClick={() => toggleAttendance(worker.id)}
                            className={`flex min-h-[68px] items-start gap-3 rounded-lg border bg-white p-3 text-left transition ${
                              selectedSet.has(worker.id)
                                ? 'border-[#165DFF] ring-2 ring-[#E8F3FF]'
                                : 'border-[#E5E6EB] hover:border-[#165DFF]/40'
                            }`}
                          >
                            <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs ${
                              selectedSet.has(worker.id) ? 'border-[#165DFF] bg-[#165DFF] text-white' : 'border-[#C9CDD4] bg-white'
                            }`}>
                              {selectedSet.has(worker.id) ? '\u2713' : ''}
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

                    {attendanceOptions.has_scope && (
                      <div>
                        <div className="mb-2 text-xs font-medium text-[#4E5969]">项目花名册临时补选</div>
                        <div className="grid max-h-64 gap-2 overflow-y-auto pr-1 md:max-h-44 md:grid-cols-2">
                          {otherWorkers.length === 0 ? (
                            <div className="rounded-lg bg-white p-3 text-sm text-[#86909C] md:col-span-2">没有更多可补选人员</div>
                          ) : otherWorkers.map(worker => (
                            <button
                              type="button"
                              key={worker.id}
                              onClick={() => toggleAttendance(worker.id)}
                              className={`flex min-h-[68px] items-start gap-3 rounded-lg border bg-white p-3 text-left transition ${
                                selectedSet.has(worker.id)
                                  ? 'border-[#165DFF] ring-2 ring-[#E8F3FF]'
                                  : 'border-[#E5E6EB] hover:border-[#165DFF]/40'
                              }`}
                            >
                              <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs ${
                                selectedSet.has(worker.id) ? 'border-[#165DFF] bg-[#165DFF] text-white' : 'border-[#C9CDD4] bg-white'
                              }`}>
                                {selectedSet.has(worker.id) ? '\u2713' : ''}
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
                        <div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
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
                                value={getWorkerHours(worker.id)}
                                onChange={event => updateAttendanceHours(worker.id, event.target.value)}
                                className="h-9 w-20 rounded-lg border border-[#E5E6EB] bg-white px-2 text-right text-sm text-[#1D2129] outline-none focus:border-[#165DFF]"
                              />
                              <span className="text-xs text-[#4E5969]">小时</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}

                    {scopeWorkerIds.length > 0 && (
                      <div className="rounded-lg border border-[#A7F3D0] bg-[#ECFDF5] px-3 py-2 text-xs text-[#047857]">
                        已标记 {scopeWorkerIds.length} 人随本次提交加入我的负责范围，下次填写会优先展示。
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {message && <div className="mt-4 rounded-xl border border-[#E5E6EB] bg-[#FAFBFF] p-3 text-sm text-[#4E5969]">{message}</div>}

            <button type="submit" disabled={saving || recognizing} className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#165DFF] text-sm font-medium text-white hover:bg-[#0E49D8] disabled:opacity-60">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {saving ? '提交中...' : '确认提交施工日志'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
