'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Camera, ClipboardList, Loader2, Plus, Search, Send, Trash2, UserPlus, UsersRound } from 'lucide-react';
import {
  formatLogWindowText,
  getConstructionLogSubmissionWindow,
  getDefaultConstructionLogDate,
} from '@/lib/construction-log-deadline';

type Project = { id: number | string; name: string };
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

type ProjectLogDraft = {
  id: string;
  project_id: string;
  location: string;
  content: string;
  attendance_worker_ids: number[];
  scope_worker_ids: number[];
  worker_search: string;
  issues: string;
};

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
    scope_worker_ids: [],
    worker_search: '',
    issues: '',
  };
}

function filterWorkers(workers: AttendanceWorker[], keyword: string) {
  const value = keyword.trim().toLowerCase();
  if (!value) return workers;
  return workers.filter((worker) => (
    worker.name.toLowerCase().includes(value)
    || (worker.work_type || '').toLowerCase().includes(value)
    || (worker.team_name || '').toLowerCase().includes(value)
  ));
}

export default function NewConstructionLogPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [logDate, setLogDate] = useState(getDefaultConstructionLogDate());
  const [drafts, setDrafts] = useState<ProjectLogDraft[]>([createDraft()]);
  const [attendanceOptions, setAttendanceOptions] = useState<Record<string, AttendanceOptions>>({});
  const [attendanceLoading, setAttendanceLoading] = useState<Record<string, boolean>>({});
  const [attendanceErrors, setAttendanceErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [submittedStatus, setSubmittedStatus] = useState('');

  useEffect(() => {
    fetch('/api/projects')
      .then(r => r.json())
      .then(j => {
        const list = Array.isArray(j.projects) ? j.projects : [];
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

  function updateDraft(id: string, patch: Partial<ProjectLogDraft>) {
    setDrafts(current => current.map(draft => draft.id === id ? { ...draft, ...patch } : draft));
  }

  function updateDraftProject(id: string, projectId: string) {
    updateDraft(id, {
      project_id: projectId,
      attendance_worker_ids: [],
      scope_worker_ids: [],
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
      return {
        ...draft,
        attendance_worker_ids: Array.from(selected),
        scope_worker_ids: Array.from(scopeSelected),
      };
    }));
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
            scope_worker_ids: draft.scope_worker_ids,
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
    <div className="min-h-full bg-[#F5F6FA] p-4 md:p-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/construction-logs" className="rounded-lg p-2 hover:bg-[#F2F3F5]">
              <ArrowLeft className="h-5 w-5 text-[#4E5969]" />
            </Link>
            <div>
              <h1 className="text-xl font-bold text-[#1D2129]">写施工日志</h1>
              <p className="text-xs text-[#86909C]">按项目填写施工内容，并从项目花名册勾选当天实际出勤人员</p>
            </div>
          </div>
          <Link href="/construction-logs/scan" className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#165DFF] px-3 text-sm font-medium text-[#165DFF] hover:bg-[#E8F3FF]">
            <Camera className="h-4 w-4" />拍照识别
          </Link>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <section className="rounded-xl border border-[#E5E6EB] bg-white p-5 shadow-sm">
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
            const visibleWorkers = filterWorkers(options.workers.filter(worker => visibleSet.has(worker.id)), draft.worker_search);
            const otherWorkers = filterWorkers(options.workers.filter(worker => !visibleSet.has(worker.id)), draft.worker_search);
            const selectedTemporaryIds = draft.attendance_worker_ids.filter(workerId => !scopedSet.has(workerId));
            const pendingScopeIds = selectedTemporaryIds.filter(workerId => !draft.scope_worker_ids.includes(workerId));

            return (
              <section key={draft.id} className="rounded-xl border border-[#E5E6EB] bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center justify-between gap-3">
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
                        className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#165DFF] px-3 text-xs font-medium text-[#165DFF] hover:bg-[#E8F3FF]"
                      >
                        <UserPlus className="h-3.5 w-3.5" />
                        加入我的负责范围
                      </button>
                    )}
                  </div>

                  <div className="rounded-xl border border-[#E5E6EB] bg-[#FBFCFF] p-3">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#86909C]" />
                      <input
                        value={draft.worker_search}
                        onChange={e => updateDraft(draft.id, { worker_search: e.target.value })}
                        placeholder="搜索姓名、工种、班组"
                        className="h-10 w-full rounded-lg border border-[#E5E6EB] bg-white pl-9 pr-3 text-sm outline-none focus:border-[#165DFF]"
                      />
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
                          <div className="grid max-h-56 gap-2 overflow-y-auto pr-1 md:grid-cols-2">
                            {visibleWorkers.length === 0 ? (
                              <div className="rounded-lg bg-white p-3 text-sm text-[#86909C] md:col-span-2">没有匹配的人员</div>
                            ) : visibleWorkers.map(worker => (
                              <button
                                type="button"
                                key={worker.id}
                                onClick={() => toggleAttendance(draft.id, worker.id)}
                                className={`flex items-start gap-3 rounded-lg border bg-white p-3 text-left transition ${
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
                                  <span className="block text-sm font-medium text-[#1D2129]">{worker.name}</span>
                                  <span className="mt-1 block text-xs text-[#86909C]">
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
                            <div className="grid max-h-44 gap-2 overflow-y-auto pr-1 md:grid-cols-2">
                              {otherWorkers.length === 0 ? (
                                <div className="rounded-lg bg-white p-3 text-sm text-[#86909C] md:col-span-2">没有更多可补选人员</div>
                              ) : otherWorkers.map(worker => (
                                <button
                                  type="button"
                                  key={worker.id}
                                  onClick={() => toggleAttendance(draft.id, worker.id)}
                                  className={`flex items-start gap-3 rounded-lg border bg-white p-3 text-left transition ${
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
                                    <span className="block text-sm font-medium text-[#1D2129]">{worker.name}</span>
                                    <span className="mt-1 block text-xs text-[#86909C]">
                                      {[worker.work_type, worker.team_name].filter(Boolean).join(' · ') || '未填写工种/班组'}
                                    </span>
                                  </span>
                                </button>
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
              </section>
            );
          })}

          {error && <div className="rounded-xl border border-[#FECACA] bg-[#FEF2F2] p-3 text-sm text-[#B91C1C]">{error}</div>}

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E5E6EB] bg-white p-4 shadow-sm">
            <button
              type="button"
              onClick={addDraft}
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-[#165DFF] px-4 text-sm font-medium text-[#165DFF] hover:bg-[#E8F3FF]"
            >
              <Plus className="h-4 w-4" />添加项目明细
            </button>
            <button
              type="submit"
              disabled={saving || !submissionWindow.allowed}
              className="inline-flex h-11 min-w-[160px] items-center justify-center gap-2 rounded-xl bg-[#165DFF] px-5 text-sm font-medium text-white hover:bg-[#0E49D8] disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {saving ? '提交中...' : '提交日志'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
