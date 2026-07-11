'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Send, Loader2, ClipboardList } from 'lucide-react';

type Project = { id: number | string; name: string };

export default function NewConstructionLogPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState('');
  const [logDate, setLogDate] = useState(new Date().toISOString().slice(0, 10));
  const [location, setLocation] = useState('');
  const [content, setContent] = useState('');
  const [headcount, setHeadcount] = useState('');
  const [issues, setIssues] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetch('/api/projects')
      .then(r => r.json())
      .then(j => {
        const list = Array.isArray(j.projects) ? j.projects : [];
        setProjects(list);
        if (list.length > 0) setProjectId(String(list[0].id));
      })
      .catch(() => {});
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!projectId || !logDate || !content.trim()) {
      setError('项目、日期和施工内容为必填项');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/construction-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, log_date: logDate, location, content: content.trim(), headcount, issues }),
      });
      const json = await res.json();
      if (!res.ok || json.success === false) throw new Error(json.error || '提交失败');
      setSuccess(true);
      setTimeout(() => router.push('/construction-logs'), 1500);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-[#F5F6FA] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 text-center max-w-sm w-full shadow-lg">
          <div className="w-16 h-16 bg-[#E8FFEA] rounded-full flex items-center justify-center mx-auto mb-4">
            <ClipboardList className="h-8 w-8 text-[#00A870]" />
          </div>
          <h2 className="text-xl font-bold text-[#1D2129]">提交成功！</h2>
          <p className="mt-2 text-sm text-[#86909C]">施工日志已保存</p>
          <div className="mt-6 flex gap-3 justify-center">
            <button onClick={() => { setSuccess(false); setContent(''); setIssues(''); setHeadcount(''); }} className="px-5 py-2.5 rounded-lg border border-[#E5E6EB] text-sm text-[#4E5969]">再记一条</button>
            <Link href="/construction-logs" className="px-5 py-2.5 rounded-lg bg-[#165DFF] text-sm text-white">查看日志</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[#F5F6FA] p-4 md:p-6">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center gap-3 mb-5">
          <Link href="/construction-logs" className="p-2 rounded-lg hover:bg-[#F2F3F5]"><ArrowLeft className="h-5 w-5 text-[#4E5969]" /></Link>
          <div><h1 className="text-xl font-bold text-[#1D2129]">写施工日志</h1><p className="text-xs text-[#86909C]">现场人员每日填写</p></div>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-5 space-y-4 shadow-sm border border-[#E5E6EB]">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-[#1D2129] mb-1">项目 <span className="text-[#F53F3F]">*</span></label>
              <select value={projectId} onChange={e => setProjectId(e.target.value)} className="w-full h-11 rounded-xl border border-[#E5E6EB] bg-[#FBFCFF] px-3 text-sm outline-none focus:border-[#165DFF]">
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#1D2129] mb-1">日期 <span className="text-[#F53F3F]">*</span></label>
              <input type="date" value={logDate} onChange={e => setLogDate(e.target.value)} className="w-full h-11 rounded-xl border border-[#E5E6EB] bg-[#FBFCFF] px-3 text-sm outline-none focus:border-[#165DFF]" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-[#1D2129] mb-1">施工部位</label>
            <input value={location} onChange={e => setLocation(e.target.value)} placeholder="例如：3#楼标准层、地下室底板" className="w-full h-11 rounded-xl border border-[#E5E6EB] bg-[#FBFCFF] px-3 text-sm outline-none focus:border-[#165DFF]" />
          </div>

          <div>
            <label className="block text-sm font-medium text-[#1D2129] mb-1">施工内容 <span className="text-[#F53F3F]">*</span></label>
            <textarea value={content} onChange={e => setContent(e.target.value)} placeholder="今天做了什么工作？" rows={3} className="w-full rounded-xl border border-[#E5E6EB] bg-[#FBFCFF] p-3 text-sm outline-none focus:border-[#165DFF]" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-[#1D2129] mb-1">出勤人数</label>
              <input type="number" value={headcount} onChange={e => setHeadcount(e.target.value)} placeholder="0" className="w-full h-11 rounded-xl border border-[#E5E6EB] bg-[#FBFCFF] px-3 text-sm outline-none focus:border-[#165DFF]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#1D2129] mb-1">异常/问题</label>
              <input value={issues} onChange={e => setIssues(e.target.value)} placeholder="有无异常情况？" className="w-full h-11 rounded-xl border border-[#E5E6EB] bg-[#FBFCFF] px-3 text-sm outline-none focus:border-[#165DFF]" />
            </div>
          </div>

          {error && <div className="rounded-xl border border-[#FECACA] bg-[#FEF2F2] p-3 text-sm text-[#B91C1C]">{error}</div>}

          <button type="submit" disabled={saving} className="w-full h-12 rounded-xl bg-[#165DFF] text-white text-sm font-medium flex items-center justify-center gap-2 hover:bg-[#0E49D8] disabled:opacity-60">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {saving ? '提交中...' : '提交日志'}
          </button>
        </form>
      </div>
    </div>
  );
}
