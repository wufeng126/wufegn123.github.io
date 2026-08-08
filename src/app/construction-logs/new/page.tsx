'use client';

import { ChangeEvent, FormEvent, Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AlertCircle, ArrowLeft, CalendarClock, Camera, CheckCircle2, ClipboardList, Cloud, ImageIcon, Loader2, Plus, RefreshCw, Search, Send, Trash2, UserPlus, UsersRound, X } from 'lucide-react';
import {
  formatLogWindowText,
  getConstructionLogSubmissionWindow,
  getDefaultConstructionLogDate,
} from '@/lib/construction-log-deadline';
import { validateAttendanceCountConsistency } from '@/lib/construction-log-attendance-risk';
import { isPublicLogRestrictedUser } from '@/lib/construction-log-role-rules';
import { usePermission } from '@/contexts/permission-context';

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

type ProgressTaskOption = {
  id: number;
  wbs: string;
  phase: string;
  area: string;
  floor: string;
  process: string;
  plan_start_date: string;
  plan_end_date: string;
  actual_progress: number;
  subitem_id: number | null;
  quantity_item: string;
  matched_quantity: number;
  unit: string;
};

type ProgressEntryDraft = {
  progress_task_id: number;
  actual_progress: string;
  completed_quantity: string;
  remark: string;
  selected: boolean;
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
  tomorrow_plan: string;
  progress_entries: ProgressEntryDraft[];
};

type WeatherInfo = {
  condition: string;
  temperature: number | null;
  wind: string;
  humidity: number | null;
  isManual: boolean;
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
    tomorrow_plan: '',
    progress_entries: [],
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
  return draft.attendance_worker_hours[String(workerId)] ?? '10';
}

function buildAttendanceWorkers(draft: ProjectLogDraft) {
  return draft.attendance_worker_ids.map((workerId) => ({
    worker_id: workerId,
    work_hours: Number(getWorkerHours(draft, workerId) || 0),
  }));
}

function getProgressTaskLabel(task: ProgressTaskOption) {
  return [task.area, task.floor, task.process].filter(Boolean).join(' ') || task.wbs || `任务 ${task.id}`;
}

function mergeProgressEntries(
  entries: ProgressEntryDraft[],
  tasks: ProgressTaskOption[],
  requestedProgressTaskId: number | null,
) {
  const existingByTaskId = new Map(entries.map((entry) => [entry.progress_task_id, entry]));
  return tasks.map((task) => {
    const existing = existingByTaskId.get(task.id);
    if (existing) return existing;
    return {
      progress_task_id: task.id,
      actual_progress: task.actual_progress > 0 ? String(task.actual_progress) : '',
      completed_quantity: '',
      remark: '',
      selected: requestedProgressTaskId === task.id,
    };
  });
}

function getProjectName(projects: Project[], projectId: string) {
  return projects.find((project) => String(project.id) === projectId)?.name || '';
}

function hasDraftInput(draft: ProjectLogDraft) {
  return Boolean(
    draft.location.trim()
    || draft.content.trim()
    || draft.issues.trim()
    || draft.attendance_worker_ids.length > 0
    || draft.attachments.length > 0
  );
}

function getDraftHoursIssue(draft: ProjectLogDraft) {
  const invalid = draft.attendance_worker_ids.some((workerId) => {
    const hours = Number(getWorkerHours(draft, workerId));
    return !Number.isFinite(hours) || hours <= 0 || hours > 24;
  });
  return invalid ? '出勤工时需大于0且不超过24小时' : '';
}

export default function NewConstructionLogPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#EEF3F8] flex items-center justify-center text-sm text-slate-500">加载中...</div>}>
      <NewConstructionLogPageContent />
    </Suspense>
  );
}

function NewConstructionLogPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedDate = searchParams.get('date') || '';
  const requestedProjectId = searchParams.get('project_id') || '';
  const requestedProgressTaskId = Number(searchParams.get('progress_task_id') || 0) || null;
  const initialLogDate = /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)
    ? requestedDate
    : getDefaultConstructionLogDate();
  const initialProjectId = /^\d+$/.test(requestedProjectId) ? requestedProjectId : '';
  const { user, isSuperAdmin } = usePermission();
  const [projects, setProjects] = useState<Project[]>([]);
  const [logDate, setLogDate] = useState(initialLogDate);
  const [drafts, setDrafts] = useState<ProjectLogDraft[]>([createDraft(initialProjectId)]);
  const [attendanceOptions, setAttendanceOptions] = useState<Record<string, AttendanceOptions>>({});
  const [attendanceLoading, setAttendanceLoading] = useState<Record<string, boolean>>({});
  const [attendanceErrors, setAttendanceErrors] = useState<Record<string, string>>({});
  const [progressTasksByKey, setProgressTasksByKey] = useState<Record<string, ProgressTaskOption[]>>({});
  const [progressTasksLoading, setProgressTasksLoading] = useState<Record<string, boolean>>({});
  const [progressTasksErrors, setProgressTasksErrors] = useState<Record<string, string>>({});
  const [photoUploading, setPhotoUploading] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [submittedStatus, setSubmittedStatus] = useState('');
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduledSubmitAt, setScheduledSubmitAt] = useState('');
  const [weather, setWeather] = useState<WeatherInfo | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState('');

  // Auto-fetch weather when date changes
  useEffect(() => {
    if (!logDate) return;
    const fetchWeather = async () => {
      setWeatherLoading(true);
      setWeatherError('');
      try {
        const res = await fetch(`/api/weather?date=${logDate}`);
        const json = await res.json();
        if (json.success && json.data) {
          setWeather({
            condition: json.data.condition || '',
            temperature: json.data.temperature,
            wind: json.data.wind || '',
            humidity: json.data.humidity,
            isManual: false,
          });
        }
      } catch {
        // Silent fail - weather is optional
      } finally {
        setWeatherLoading(false);
      }
    };
    fetchWeather();
  }, [logDate]);

  useEffect(() => {
    fetch('/api/projects?includePublicLog=1')
      .then(r => r.json())
      .then(j => {
        const list = Array.isArray(j.projects)
          ? j.projects
            .filter((project: Project) => !project.is_archived)
            .filter((project: Project) => (
              !(isPublicLogRestrictedUser(user) && project.name === PUBLIC_LOG_PROJECT_NAME)
            ))
          : [];
        setProjects(list);
        if (list.length > 0) {
          const requestedProjectExists = initialProjectId && list.some((project: Project) => String(project.id) === initialProjectId);
          setDrafts(current => current.map((draft, index) => (
            index === 0 && !draft.project_id
              ? { ...draft, project_id: String(requestedProjectExists ? initialProjectId : list[0].id) }
              : draft
          )));
        }
      })
      .catch(() => {});
  }, [initialProjectId, user]);

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

  useEffect(() => {
    if (!logDate) return;
    const keys = Array.from(new Set(
      drafts
        .map(draft => draft.project_id)
        .filter(Boolean)
        .map(projectId => `${projectId}|${logDate}`),
    ));

    keys.forEach((key) => {
      if (progressTasksByKey[key] || progressTasksLoading[key]) return;
      const [projectId, date] = key.split('|');
      setProgressTasksLoading(current => ({ ...current, [key]: true }));
      setProgressTasksErrors(current => {
        const next = { ...current };
        delete next[key];
        return next;
      });

      fetch(`/api/construction-logs/progress-tasks?project_id=${projectId}&date=${date}`, { credentials: 'include' })
        .then(res => res.json())
        .then(json => {
          if (json.success === false) throw new Error(json.error || '进度任务加载失败');
          const tasks = Array.isArray(json.data?.tasks) ? json.data.tasks as ProgressTaskOption[] : [];
          setProgressTasksByKey(current => ({ ...current, [key]: tasks }));
          setDrafts(current => current.map((draft) => (
            draft.project_id === projectId
              ? {
                ...draft,
                progress_entries: mergeProgressEntries(draft.progress_entries, tasks, requestedProgressTaskId),
              }
              : draft
          )));
        })
        .catch((loadError: unknown) => {
          setProgressTasksErrors(current => ({
            ...current,
            [key]: loadError instanceof Error ? loadError.message : '进度任务加载失败',
          }));
          setProgressTasksByKey(current => ({ ...current, [key]: [] }));
        })
        .finally(() => {
          setProgressTasksLoading(current => ({ ...current, [key]: false }));
        });
    });
  }, [drafts, logDate, progressTasksByKey, progressTasksLoading, requestedProgressTaskId]);

  const canScheduleSubmit = useMemo(() => {
    const roleText = `${user?.role || ''} ${user?.name || ''}`.toLowerCase();
    return isSuperAdmin || roleText.includes('budget') || roleText.includes('cost') || roleText.includes('estimate') || roleText.includes('预算') || roleText.includes('造价') || roleText.includes('经营');
  }, [isSuperAdmin, user?.name, user?.role]);
  const submissionWindow = useMemo(() => getConstructionLogSubmissionWindow(logDate), [logDate]);
  const scheduledWindow = useMemo(() => {
    if (!scheduleEnabled || !scheduledSubmitAt) return submissionWindow;
    return getConstructionLogSubmissionWindow(logDate, new Date(scheduledSubmitAt));
  }, [logDate, scheduleEnabled, scheduledSubmitAt, submissionWindow]);
  const isUploadingPhotos = useMemo(() => Object.values(photoUploading).some(Boolean), [photoUploading]);
  const projectIdCounts = useMemo(() => drafts.reduce<Record<string, number>>((acc, draft) => {
    if (!draft.project_id) return acc;
    acc[draft.project_id] = (acc[draft.project_id] || 0) + 1;
    return acc;
  }, {}), [drafts]);
  const draftSubmitSummaries = useMemo(() => drafts.map((draft, index) => {
    const messages: string[] = [];
    const warnings: string[] = [];
    const touched = hasDraftInput(draft);
    if (!draft.project_id && touched) messages.push('请选择项目');
    if (!draft.content.trim() && (touched || drafts.length === 1)) messages.push('填写施工内容');
    if (draft.project_id && projectIdCounts[draft.project_id] > 1) messages.push('同一份日志中项目重复');
    const hoursIssue = getDraftHoursIssue(draft);
    if (hoursIssue) messages.push(hoursIssue);
    const invalidProgressEntry = draft.progress_entries
      .filter(entry => entry.selected)
      .find((entry) => {
        const progress = Number(entry.actual_progress);
        return entry.actual_progress.trim() === '' || !Number.isFinite(progress) || progress < 0 || progress > 100;
      });
    if (invalidProgressEntry) messages.push('进度确认需填写 0-100 的实际进度');
    const attendanceValidation = validateAttendanceCountConsistency({
      content: draft.content,
      selectedCount: draft.attendance_worker_ids.length,
    });
    if (!attendanceValidation.ok && attendanceValidation.message) warnings.push(attendanceValidation.message);

    const ready = Boolean(draft.project_id && draft.content.trim() && messages.length === 0);
    return {
      id: draft.id,
      index,
      projectName: getProjectName(projects, draft.project_id) || `项目明细 ${index + 1}`,
      status: ready ? 'ready' : messages.length > 0 ? 'warning' : 'empty',
      label: ready ? '可提交' : messages.length > 0 ? '待完善' : '未填写',
      messages,
      warnings,
      touched,
    };
  }), [drafts, projectIdCounts, projects]);
  const blockingSummary = useMemo(() => draftSubmitSummaries.find(summary => (
    summary.status === 'warning' && summary.touched
  )), [draftSubmitSummaries]);
  const readyDraftCount = useMemo(() => draftSubmitSummaries.filter(summary => summary.status === 'ready').length, [draftSubmitSummaries]);
  const submitProjectCount = useMemo(() => drafts.filter(draft => draft.project_id && draft.content.trim()).length, [drafts]);
  const attendanceTotal = useMemo(() => drafts.reduce((sum, draft) => sum + draft.attendance_worker_ids.length, 0), [drafts]);
  const attachmentTotal = useMemo(() => drafts.reduce((sum, draft) => sum + draft.attachments.length, 0), [drafts]);
  const submitDisabled = saving || isUploadingPhotos || Boolean(blockingSummary) || readyDraftCount === 0 || !(scheduleEnabled ? scheduledWindow.allowed : submissionWindow.allowed);
  const submitLabel = saving ? '提交中...' : isUploadingPhotos ? '照片上传中...' : scheduleEnabled ? '保存并预约' : '提交日志';

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
      progress_entries: [],
    });
  }

  function toggleProgressEntry(draftId: string, taskId: number) {
    setDrafts(current => current.map((draft) => {
      if (draft.id !== draftId) return draft;
      return {
        ...draft,
        progress_entries: draft.progress_entries.map(entry => (
          entry.progress_task_id === taskId ? { ...entry, selected: !entry.selected } : entry
        )),
      };
    }));
  }

  function updateProgressEntry(draftId: string, taskId: number, patch: Partial<ProgressEntryDraft>) {
    setDrafts(current => current.map((draft) => {
      if (draft.id !== draftId) return draft;
      return {
        ...draft,
        progress_entries: draft.progress_entries.map(entry => (
          entry.progress_task_id === taskId ? { ...entry, ...patch } : entry
        )),
      };
    }));
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
        nextHours[String(workerId)] = nextHours[String(workerId)] || '10';
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
    if (blockingSummary) {
      setError(`项目明细 ${blockingSummary.index + 1}：${blockingSummary.messages[0]}`);
      return;
    }
    if (uniqueProjectIds.size !== projectIds.length) {
      setError('同一份施工日志中不能重复选择同一个项目');
      return;
    }
    const effectiveWindow = scheduleEnabled ? scheduledWindow : submissionWindow;
    if (scheduleEnabled) {
      if (!canScheduleSubmit) {
        setError('只有预算员可以预约提交施工日志');
        return;
      }
      if (!scheduledSubmitAt) {
        setError('请选择预约提交时间');
        return;
      }
      const scheduledDate = new Date(scheduledSubmitAt);
      if (Number.isNaN(scheduledDate.getTime()) || scheduledDate.getTime() <= Date.now()) {
        setError('预约提交时间必须晚于当前时间');
        return;
      }
    }
    if (!effectiveWindow.allowed) {
      setError(effectiveWindow.message);
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
          scheduled_submit_at: scheduleEnabled ? scheduledSubmitAt : undefined,
          weather: weather ? {
            condition: weather.condition,
            temperature: weather.temperature,
            wind: weather.wind,
            humidity: weather.humidity,
            is_manual: weather.isManual,
          } : undefined,
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
            tomorrow_plan: draft.tomorrow_plan,
            progress_entries: draft.progress_entries
              .filter(entry => entry.selected)
              .map(entry => ({
                progress_task_id: entry.progress_task_id,
                actual_progress: Number(entry.actual_progress),
                completed_quantity: entry.completed_quantity ? Number(entry.completed_quantity) : null,
                remark: entry.remark || null,
              })),
          })),
          source_type: 'manual',
        }),
      });
      const json = await res.json();
      if (!res.ok || json.success === false) throw new Error(json.error || '提交失败');
      setSubmittedStatus(scheduleEnabled ? `待提交，预约时间：${new Date(scheduledSubmitAt).toLocaleString('zh-CN')}` : submissionWindow.label);
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
      <div className="flex min-h-screen items-center justify-center bg-[#EEF3F8] p-4">
        <div className="w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-lg">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
            <ClipboardList className="h-8 w-8 text-emerald-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-950">提交成功</h2>
          <p className="mt-2 text-sm text-slate-500">施工日志已保存，状态：{submittedStatus}</p>
          <div className="mt-6 flex justify-center gap-3">
            <button
              onClick={() => {
                setSuccess(false);
                setDrafts([createDraft(projects[0] ? String(projects[0].id) : '')]);
              }}
              className="rounded-lg border border-slate-200 px-5 py-2.5 text-sm text-slate-600"
            >
              再写一份
            </button>
            <Link href="/construction-logs" className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm text-white">查看日志</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[#EEF3F8] px-3 py-4 sm:p-4 md:p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <Link href="/construction-logs" className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm hover:border-blue-200 hover:text-blue-700">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <p className="text-xs font-medium text-slate-500">施工管理 / 施工日志</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-normal text-slate-950">新增施工日志</h1>
            </div>
          </div>
          <Link href="/construction-logs/scan" className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-blue-200 bg-white px-4 text-sm font-medium text-blue-700 shadow-sm hover:border-blue-300 hover:bg-blue-50 sm:w-auto">
            <Camera className="h-4 w-4" />拍照识别
          </Link>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-3 sm:px-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-base font-semibold text-slate-950">今日录入</h2>
                  <p className="mt-1 text-xs text-slate-500">按项目填写施工内容，出勤人员从项目花名册勾选，工时默认 10 小时。</p>
                </div>
                <div className="grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1 text-center sm:min-w-[360px]">
                  <div className="rounded-md bg-white px-3 py-2">
                    <div className="text-lg font-semibold tabular-nums text-slate-950">{submitProjectCount}</div>
                    <div className="mt-0.5 text-[11px] font-medium text-slate-500">项目</div>
                  </div>
                  <div className="rounded-md bg-white px-3 py-2">
                    <div className="text-lg font-semibold tabular-nums text-slate-950">{attendanceTotal}</div>
                    <div className="mt-0.5 text-[11px] font-medium text-slate-500">出勤</div>
                  </div>
                  <div className="rounded-md bg-white px-3 py-2">
                    <div className="text-lg font-semibold tabular-nums text-slate-950">{attachmentTotal}</div>
                    <div className="mt-0.5 text-[11px] font-medium text-slate-500">照片</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="grid gap-3 p-4 sm:p-5 md:grid-cols-[220px_1fr]">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-800">日志日期 <span className="text-red-500">*</span></label>
                <input
                  type="date"
                  value={logDate}
                  onChange={e => setLogDate(e.target.value)}
                  className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
              </div>
              <div className={`rounded-xl border px-4 py-3 text-sm ${
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
            </div>

            {/* Weather Section */}
            <div className="mx-4 mb-4 rounded-xl border border-slate-200 bg-slate-50/80 p-4 sm:mx-5 sm:mb-5">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Cloud className="h-4 w-4 text-blue-600" />
                  <span className="text-sm font-medium text-slate-900">天气信息</span>
                  {weatherLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setWeatherLoading(true);
                    fetch(`/api/weather?date=${logDate}`)
                      .then(r => r.json())
                      .then(json => {
                        if (json.success && json.data) {
                          setWeather({
                            condition: json.data.condition || '',
                            temperature: json.data.temperature,
                            wind: json.data.wind || '',
                            humidity: json.data.humidity,
                            isManual: false,
                          });
                        }
                      })
                      .catch(() => {})
                      .finally(() => setWeatherLoading(false));
                  }}
                  className="inline-flex h-7 items-center gap-1 rounded-lg px-2 text-xs font-medium text-blue-700 hover:bg-blue-50"
                >
                  <RefreshCw className="h-3 w-3" />刷新
                </button>
              </div>
              {weather ? (
                <div className="grid gap-3 sm:grid-cols-4">
                  <div className="rounded-lg bg-white px-3 py-2 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.18)]">
                    <div className="text-xs text-slate-500">天气状况</div>
                    <div className="mt-1 text-sm font-medium text-slate-950">{weather.condition || '-'}</div>
                  </div>
                  <div className="rounded-lg bg-white px-3 py-2 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.18)]">
                    <div className="text-xs text-slate-500">温度</div>
                    <div className="mt-1 text-sm font-medium text-slate-950">{weather.temperature !== null ? `${weather.temperature}°C` : '-'}</div>
                  </div>
                  <div className="rounded-lg bg-white px-3 py-2 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.18)]">
                    <div className="text-xs text-slate-500">风力</div>
                    <div className="mt-1 text-sm font-medium text-slate-950">{weather.wind || '-'}</div>
                  </div>
                  <div className="rounded-lg bg-white px-3 py-2 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.18)]">
                    <div className="text-xs text-slate-500">湿度</div>
                    <div className="mt-1 text-sm font-medium text-slate-950">{weather.humidity !== null ? `${weather.humidity}%` : '-'}</div>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg bg-white px-3 py-4 text-center text-sm text-slate-500">
                  {weatherLoading ? '正在获取天气信息...' : '暂无天气信息'}
                </div>
              )}
            </div>

            {canScheduleSubmit && (
              <div className="mx-4 mb-4 rounded-xl border border-blue-100 bg-blue-50/60 p-3 sm:mx-5 sm:mb-5">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-900">
                  <input
                    type="checkbox"
                    checked={scheduleEnabled}
                    onChange={event => setScheduleEnabled(event.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600"
                  />
                  <CalendarClock className="h-4 w-4 text-blue-600" />
                  预约提交
                </label>
                {scheduleEnabled && (
                  <div className="mt-3 grid gap-3 md:grid-cols-[260px_1fr]">
                    <input
                      type="datetime-local"
                      value={scheduledSubmitAt}
                      onChange={event => setScheduledSubmitAt(event.target.value)}
                      className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                    <div className={`rounded-xl border px-4 py-3 text-sm ${
                      scheduledWindow.status === 'late'
                        ? 'border-amber-200 bg-amber-50 text-amber-700'
                        : scheduledWindow.allowed
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : 'border-red-200 bg-red-50 text-red-700'
                    }`}>
                      <div className="font-medium">预约后状态：待提交</div>
                      <div className="mt-1 text-xs">{scheduledSubmitAt ? scheduledWindow.message : '选择预约时间后，系统会在到点后自动提交。'}</div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          {drafts.map((draft, index) => {
            const options = draft.project_id ? attendanceOptions[draft.project_id] || emptyAttendanceOptions : emptyAttendanceOptions;
            const loadingWorkers = draft.project_id ? attendanceLoading[draft.project_id] : false;
            const attendanceError = draft.project_id ? attendanceErrors[draft.project_id] : '';
            const progressKey = draft.project_id ? `${draft.project_id}|${logDate}` : '';
            const progressTasks = progressKey ? progressTasksByKey[progressKey] || [] : [];
            const loadingProgressTasks = progressKey ? progressTasksLoading[progressKey] : false;
            const progressTasksError = progressKey ? progressTasksErrors[progressKey] : '';
            const progressEntryByTaskId = new Map(draft.progress_entries.map(entry => [entry.progress_task_id, entry]));
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
            const draftStatus = draftSubmitSummaries[index]?.status;
            const draftStatusLine = draftStatus === 'ready'
              ? 'border-l-emerald-500'
              : draftStatus === 'warning'
                ? 'border-l-amber-500'
                : 'border-l-slate-300';

            return (
              <section key={draft.id} className={`overflow-hidden rounded-xl border border-l-4 border-slate-200 bg-white shadow-sm ${draftStatusLine}`}>
                <div className="flex flex-col items-start justify-between gap-3 border-b border-slate-100 bg-slate-50/80 px-4 py-3 sm:flex-row sm:items-center sm:px-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold text-slate-950">项目明细 {index + 1}</h2>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
                      draftSubmitSummaries[index]?.status === 'ready'
                        ? 'bg-emerald-50 font-medium text-emerald-700 ring-1 ring-emerald-100'
                        : draftSubmitSummaries[index]?.status === 'warning'
                          ? 'bg-amber-50 font-medium text-amber-700 ring-1 ring-amber-100'
                          : 'bg-slate-100 font-medium text-slate-500 ring-1 ring-slate-200'
                    }`}>
                      {draftSubmitSummaries[index]?.status === 'ready' ? <CheckCircle2 className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
                      {draftSubmitSummaries[index]?.label}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeDraft(draft.id)}
                    disabled={drafts.length === 1}
                    className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent"
                  >
                    <Trash2 className="h-3.5 w-3.5" />删除
                  </button>
                </div>

                <div className="space-y-5 p-4 sm:p-5">
                <div className="grid gap-3 rounded-lg bg-slate-50/70 p-3 ring-1 ring-slate-200 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-800">项目 <span className="text-red-500">*</span></label>
                    <select
                      value={draft.project_id}
                      onChange={e => updateDraftProject(draft.id, e.target.value)}
                      className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    >
                      <option value="">请选择项目</option>
                      {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-800">施工部位</label>
                    <input
                      value={draft.location}
                      onChange={e => updateDraft(draft.id, { location: e.target.value })}
                      placeholder="例如：3#楼标准层、地下室底板"
                      className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                </div>

                <div className="rounded-lg bg-white p-3 ring-1 ring-slate-200">
                  <label className="mb-2 block text-sm font-medium text-slate-800">施工内容 <span className="text-red-500">*</span></label>
                  <textarea
                    value={draft.content}
                    onChange={e => updateDraft(draft.id, { content: e.target.value })}
                    placeholder="记录今天实际完成的施工内容，例如：1#楼3层模板安装、钢筋绑扎、材料进场、现场协调事项。"
                    rows={4}
                    className="min-h-[132px] w-full rounded-lg border border-slate-200 bg-slate-50/60 p-3 text-sm leading-6 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
                  />
                  {draftSubmitSummaries[index]?.warnings.some(message => message.includes('出勤')) && (
                    <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                      {draftSubmitSummaries[index]?.warnings.find(message => message.includes('出勤'))}
                    </div>
                  )}
                </div>

                <div className="rounded-lg bg-white p-3 ring-1 ring-slate-200">
                  <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
                      <ClipboardList className="h-4 w-4 text-blue-600" />
                      进度确认
                    </label>
                    <span className="text-xs text-slate-500">
                      已确认 {draft.progress_entries.filter(entry => entry.selected).length} / {progressTasks.length}
                    </span>
                  </div>

                  {!draft.project_id ? (
                    <div className="rounded-lg bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">选择项目后自动带出当天计划任务</div>
                  ) : loadingProgressTasks ? (
                    <div className="flex items-center justify-center gap-2 rounded-lg bg-slate-50 py-6 text-sm text-slate-500">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      正在匹配进度计划...
                    </div>
                  ) : progressTasksError ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">{progressTasksError}</div>
                  ) : progressTasks.length === 0 ? (
                    <div className="rounded-lg bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">当天暂无匹配的计划任务，可先正常提交施工日志</div>
                  ) : (
                    <div className="space-y-2">
                      {progressTasks.map((task) => {
                        const entry = progressEntryByTaskId.get(task.id);
                        const selected = Boolean(entry?.selected);
                        return (
                          <div
                            key={task.id}
                            className={`rounded-lg border p-3 transition ${
                              selected ? 'border-blue-300 bg-blue-50/60' : 'border-slate-200 bg-slate-50/70'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => toggleProgressEntry(draft.id, task.id)}
                              className="flex w-full items-start gap-3 text-left"
                            >
                              <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs ${
                                selected ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white'
                              }`}>
                                {selected ? '✓' : ''}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block text-sm font-semibold text-slate-900">{getProgressTaskLabel(task)}</span>
                                <span className="mt-1 block text-xs text-slate-500">
                                  {task.wbs || '未编 WBS'} · 计划 {task.plan_start_date} 至 {task.plan_end_date}
                                </span>
                                <span className="mt-1 block text-xs text-slate-500">
                                  匹配工程量：{task.matched_quantity || 0} {task.unit || ''} {task.quantity_item ? `· ${task.quantity_item}` : ''}
                                </span>
                              </span>
                              <span className="shrink-0 rounded-full bg-white px-2 py-1 text-xs font-medium text-slate-600">
                                当前 {task.actual_progress || 0}%
                              </span>
                            </button>

                            {selected && entry ? (
                              <div className="mt-3 grid gap-2 md:grid-cols-[150px_170px_1fr]">
                                <label className="block">
                                  <span className="mb-1 block text-xs font-medium text-slate-600">实际进度 %</span>
                                  <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    step="0.01"
                                    value={entry.actual_progress}
                                    onChange={event => updateProgressEntry(draft.id, task.id, { actual_progress: event.target.value })}
                                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                  />
                                </label>
                                <label className="block">
                                  <span className="mb-1 block text-xs font-medium text-slate-600">本次完成量</span>
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={entry.completed_quantity}
                                    onChange={event => updateProgressEntry(draft.id, task.id, { completed_quantity: event.target.value })}
                                    placeholder={task.unit || '数量'}
                                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                  />
                                </label>
                                <label className="block">
                                  <span className="mb-1 block text-xs font-medium text-slate-600">进度备注</span>
                                  <input
                                    value={entry.remark}
                                    onChange={event => updateProgressEntry(draft.id, task.id, { remark: event.target.value })}
                                    placeholder="如少报原因、现场完成范围、待确认事项"
                                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                  />
                                </label>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Tomorrow Plan Section */}
                <div className="rounded-lg bg-white p-3 ring-1 ring-slate-200">
                  <label className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-800">
                    <CalendarClock className="h-4 w-4 text-blue-600" />
                    明日计划
                  </label>
                  <textarea
                    value={draft.tomorrow_plan}
                    onChange={e => updateDraft(draft.id, { tomorrow_plan: e.target.value })}
                    placeholder="请输入明日施工计划，如：明日计划进行2层梁板钢筋绑扎..."
                    rows={2}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 text-sm leading-6 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
                  />
                </div>

                <div className="rounded-lg bg-white p-3 ring-1 ring-slate-200">
                  <div className="mb-2 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <label className="block text-sm font-medium text-slate-800">出勤人员</label>
                      <p className="mt-0.5 text-xs text-slate-500">
                        已选 {draft.attendance_worker_ids.length} 人，出勤人数将自动按勾选人数统计
                      </p>
                    </div>
                    {pendingScopeIds.length > 0 && (
                      <button
                        type="button"
                        onClick={() => addSelectedTemporaryToScope(draft.id, pendingScopeIds)}
                        className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-blue-200 bg-white px-3 text-xs font-medium text-blue-700 hover:bg-blue-50 sm:w-auto"
                      >
                        <UserPlus className="h-3.5 w-3.5" />
                        加入我的负责范围
                      </button>
                    )}
                  </div>

                  <div className="rounded-xl bg-slate-50/80 p-3 ring-1 ring-slate-200">
                    <div className="grid gap-2 md:grid-cols-[180px_1fr]">
                      <select
                        value={draft.worker_work_type}
                        onChange={e => updateDraft(draft.id, { worker_work_type: e.target.value })}
                        disabled={loadingWorkers || options.workers.length === 0}
                        className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100 disabled:text-slate-300"
                      >
                        <option value="">全部工种</option>
                        {workTypeOptions.map((workType) => (
                          <option key={workType} value={workType}>{getWorkerTypeLabel(workType)}</option>
                        ))}
                      </select>
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                        <input
                          value={draft.worker_search}
                          onChange={e => updateDraft(draft.id, { worker_search: e.target.value })}
                          placeholder="搜索姓名、工种、班组"
                          className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                        />
                      </div>
                    </div>

                    {loadingWorkers ? (
                      <div className="mt-3 flex items-center justify-center gap-2 rounded-lg bg-white py-8 text-sm text-slate-500">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        正在加载项目花名册...
                      </div>
                    ) : attendanceError ? (
                      <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                        出勤人员加载失败：{attendanceError}
                      </div>
                    ) : options.workers.length === 0 ? (
                      <div className="mt-3 rounded-lg bg-white py-8 text-center text-sm text-slate-500">
                        当前项目暂无在场工人，请先在花名册维护工人档案
                      </div>
                    ) : (
                      <div className="mt-3 space-y-3">
                        <div>
                          <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-600">
                            <UsersRound className="h-3.5 w-3.5 text-blue-600" />
                            {options.has_scope ? '我的负责人员' : '项目在场人员'}
                          </div>
                          <div className="grid max-h-72 gap-2 overflow-y-auto pr-1 md:max-h-56 md:grid-cols-2">
                            {visibleWorkers.length === 0 ? (
                              <div className="rounded-lg bg-white p-3 text-sm text-slate-500 md:col-span-2">没有匹配的人员</div>
                            ) : visibleWorkers.map(worker => (
                              <button
                                type="button"
                                key={worker.id}
                                onClick={() => toggleAttendance(draft.id, worker.id)}
                                  className={`flex min-h-[68px] items-start gap-3 rounded-lg border bg-white p-3 text-left transition ${
                                  selectedSet.has(worker.id)
                                    ? 'border-blue-300 bg-blue-50/60 ring-2 ring-blue-100'
                                    : 'border-slate-200 hover:border-blue-200'
                                }`}
                              >
                                <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs ${
                                  selectedSet.has(worker.id) ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white'
                                }`}>
                                  {selectedSet.has(worker.id) ? '✓' : ''}
                                </span>
                                <span className="min-w-0">
                                  <span className="block truncate text-sm font-medium text-slate-900">{worker.name}</span>
                                  <span className="mt-1 block truncate text-xs text-slate-500">
                                    {[worker.work_type, worker.team_name].filter(Boolean).join(' · ') || '未填写工种/班组'}
                                  </span>
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>

                        {options.has_scope && (
                          <div>
                            <div className="mb-2 text-xs font-medium text-slate-600">项目花名册临时补选</div>
                            <div className="grid max-h-64 gap-2 overflow-y-auto pr-1 md:max-h-44 md:grid-cols-2">
                              {otherWorkers.length === 0 ? (
                                <div className="rounded-lg bg-white p-3 text-sm text-slate-500 md:col-span-2">没有更多可补选人员</div>
                              ) : otherWorkers.map(worker => (
                                <button
                                  type="button"
                                  key={worker.id}
                                  onClick={() => toggleAttendance(draft.id, worker.id)}
                                  className={`flex min-h-[68px] items-start gap-3 rounded-lg border bg-white p-3 text-left transition ${
                                    selectedSet.has(worker.id)
                                      ? 'border-blue-300 bg-blue-50/60 ring-2 ring-blue-100'
                                      : 'border-slate-200 hover:border-blue-200'
                                  }`}
                                >
                                  <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs ${
                                    selectedSet.has(worker.id) ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white'
                                  }`}>
                                    {selectedSet.has(worker.id) ? '✓' : ''}
                                  </span>
                                  <span className="min-w-0">
                                    <span className="block truncate text-sm font-medium text-slate-900">{worker.name}</span>
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
                          <div className="rounded-lg bg-white p-3 ring-1 ring-slate-200">
                            <div className="mb-2 flex items-center justify-between gap-2">
                              <p className="text-xs font-medium text-slate-900">已选人员工时</p>
                              <span className="text-xs text-slate-500">可录入小数，单人每日不超过24小时</span>
                            </div>
                            <div className="grid gap-2 md:grid-cols-2">
                              {selectedWorkers.map(worker => (
                                <label key={worker.id} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2">
                                  <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-medium text-slate-900">{worker.name}</span>
                                    <span className="block truncate text-xs text-slate-500">
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
                                    className="h-9 w-20 rounded-lg border border-slate-200 bg-white px-2 text-right text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                  />
                                  <span className="text-xs text-slate-600">小时</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        )}

                        {draft.scope_worker_ids.length > 0 && (
                          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                            已标记 {draft.scope_worker_ids.length} 人随本次提交加入我的负责范围，下次填写会优先展示。
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-lg bg-white p-3 ring-1 ring-slate-200">
                  <label className="mb-1 block text-sm font-medium text-slate-800">异常/问题</label>
                  <input
                    value={draft.issues}
                    onChange={e => updateDraft(draft.id, { issues: e.target.value })}
                    placeholder="有无异常情况？"
                    className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                </div>

                <div className="rounded-lg bg-white p-3 ring-1 ring-slate-200">
                  <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <label className="block text-sm font-medium text-slate-800">现场照片附件</label>
                      <p className="mt-0.5 text-xs text-slate-500">可上传多张施工照片，提交后可在日志详情中查看</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:flex sm:w-auto">
                      <label className="inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-lg border border-blue-200 bg-white px-3 text-xs font-medium text-blue-700 hover:bg-blue-50">
                        {photoUploading[draft.id] ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
                        {photoUploading[draft.id] ? '上传中...' : '拍照'}
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
                      <label className="inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-lg border border-blue-200 bg-white px-3 text-xs font-medium text-blue-700 hover:bg-blue-50">
                        {photoUploading[draft.id] ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />}
                        {photoUploading[draft.id] ? '上传中...' : '上传照片'}
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={event => handlePhotoUpload(draft.id, event)}
                          disabled={photoUploading[draft.id]}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>

                  {draft.attachments.length > 0 ? (
                    <div className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3 sm:grid-cols-2 md:grid-cols-3">
                      {draft.attachments.map((attachment, attachmentIndex) => (
                        <div key={attachment.storageKey} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                          {attachment.url ? (
                            <img
                              src={attachment.url}
                              alt={`施工照片${attachmentIndex + 1}`}
                              className="h-28 w-full bg-slate-100 object-cover"
                            />
                          ) : (
                            <div className="flex h-28 items-center justify-center bg-slate-100 text-xs text-slate-500">照片已上传</div>
                          )}
                          <div className="flex items-center justify-between gap-2 px-2 py-2">
                            <span className="min-w-0 truncate text-xs text-slate-600">{attachment.name || `照片${attachmentIndex + 1}`}</span>
                            <button
                              type="button"
                              onClick={() => removeAttachment(draft.id, attachment.storageKey)}
                              className="shrink-0 rounded-md p-1 text-red-600 hover:bg-red-50"
                              aria-label="删除照片"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/80 px-4 py-6 text-center text-sm text-slate-500">
                      暂未上传现场照片
                    </div>
                  )}
                </div>
                </div>
              </section>
            );
          })}

          {(error || blockingSummary) && (
            <div className={`rounded-xl border p-3 text-sm ${
              error
                ? 'border-red-200 bg-red-50 text-red-700'
                : 'border-amber-200 bg-amber-50 text-amber-700'
            }`}>
              {error || `项目明细 ${blockingSummary?.index !== undefined ? blockingSummary.index + 1 : ''}：${blockingSummary?.messages[0] || '请完善后再提交'}`}
            </div>
          )}

          <div className="flex flex-col items-stretch justify-between gap-3 rounded-xl bg-white/95 p-3 shadow-sm ring-1 ring-slate-200/90 backdrop-blur sm:sticky sm:bottom-3 sm:z-20 sm:flex-row sm:items-center sm:p-4">
            <button
              type="button"
              onClick={addDraft}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-blue-200 bg-white px-4 text-sm font-medium text-blue-700 hover:bg-blue-50"
            >
              <Plus className="h-4 w-4" />添加项目明细
            </button>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="text-xs text-slate-500 sm:text-right">
                <span className="font-medium text-slate-700">
                  {readyDraftCount > 0 ? `已准备 ${readyDraftCount} 个项目明细` : '请先填写项目和施工内容'}
                </span>
                <span className="mt-0.5 block">出勤 {attendanceTotal} 人，照片 {attachmentTotal} 张</span>
              </div>
              <button
                type="submit"
                disabled={submitDisabled}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 sm:w-auto sm:min-w-[160px]"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {submitLabel}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
