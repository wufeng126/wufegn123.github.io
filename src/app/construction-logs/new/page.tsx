'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Camera, ClipboardList, Loader2, Plus, Send, Trash2 } from 'lucide-react';
import {
  formatLogWindowText,
  getConstructionLogSubmissionWindow,
  getDefaultConstructionLogDate,
} from '@/lib/construction-log-deadline';

type Project = { id: number | string; name: string };
type ProjectLogDraft = {
  id: string;
  project_id: string;
  location: string;
  content: string;
  headcount: string;
  issues: string;
};

function createDraft(projectId = ''): ProjectLogDraft {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    project_id: projectId,
    location: '',
    content: '',
    headcount: '',
    issues: '',
  };
}

export default function NewConstructionLogPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [logDate, setLogDate] = useState(getDefaultConstructionLogDate());
  const [drafts, setDrafts] = useState<ProjectLogDraft[]>([createDraft()]);
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

  const submissionWindow = useMemo(() => getConstructionLogSubmissionWindow(logDate), [logDate]);

  function updateDraft(id: string, patch: Partial<ProjectLogDraft>) {
    setDrafts(current => current.map(draft => draft.id === id ? { ...draft, ...patch } : draft));
  }

  function addDraft() {
    const usedProjectIds = new Set(drafts.map(draft => draft.project_id).filter(Boolean));
    const nextProject = projects.find(project => !usedProjectIds.has(String(project.id)));
    setDrafts(current => [...current, createDraft(nextProject ? String(nextProject.id) : '')]);
  }

  function removeDraft(id: string) {
    setDrafts(current => current.length === 1 ? current : current.filter(draft => draft.id !== id));
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
            headcount: draft.headcount,
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
              <p className="text-xs text-[#86909C]">一天提交一份，可按项目分别填写多个施工内容</p>
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

          {drafts.map((draft, index) => (
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
                    onChange={e => updateDraft(draft.id, { project_id: e.target.value })}
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

              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-[#1D2129]">出勤人数</label>
                  <input
                    type="number"
                    value={draft.headcount}
                    onChange={e => updateDraft(draft.id, { headcount: e.target.value })}
                    placeholder="0"
                    className="h-11 w-full rounded-xl border border-[#E5E6EB] bg-[#FBFCFF] px-3 text-sm outline-none focus:border-[#165DFF]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-[#1D2129]">异常/问题</label>
                  <input
                    value={draft.issues}
                    onChange={e => updateDraft(draft.id, { issues: e.target.value })}
                    placeholder="有无异常情况？"
                    className="h-11 w-full rounded-xl border border-[#E5E6EB] bg-[#FBFCFF] px-3 text-sm outline-none focus:border-[#165DFF]"
                  />
                </div>
              </div>
            </section>
          ))}

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
