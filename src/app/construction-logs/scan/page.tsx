'use client';

import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Camera, CheckCircle2, Loader2, RotateCcw, Send } from 'lucide-react';

type Project = { id: number | string; name: string };
type RecognizedFile = { name: string; size: number; storageKey?: string; textLength?: number };

export default function ConstructionLogScanPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState('');
  const [logDate, setLogDate] = useState(new Date().toISOString().slice(0, 10));
  const [location, setLocation] = useState('');
  const [content, setContent] = useState('');
  const [headcount, setHeadcount] = useState('');
  const [issues, setIssues] = useState('');
  const [rawText, setRawText] = useState('');
  const [previews, setPreviews] = useState<string[]>([]);
  const [recognizedFiles, setRecognizedFiles] = useState<RecognizedFile[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [recognizing, setRecognizing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetch('/api/projects')
      .then(res => res.json())
      .then(json => {
        const list = Array.isArray(json.projects) ? json.projects : [];
        setProjects(list);
        if (list.length > 0) setProjectId(String(list[0].id));
      })
      .catch(() => setMessage('项目列表加载失败'));
  }, []);

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

  function resetDraft() {
    setLocation('');
    setContent('');
    setHeadcount('');
    setIssues('');
    setRawText('');
    setPreviews([]);
    setRecognizedFiles([]);
    setWarnings([]);
    setMessage('');
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!projectId || !logDate || !content.trim()) {
      setMessage('项目、日期和施工内容为必填项');
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
          headcount,
          issues,
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
    <div className="min-h-full bg-[#F5F6FA] p-4 md:p-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-5 flex items-center gap-3">
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
            <label className="flex min-h-[260px] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-[#C9CDD4] bg-[#FAFBFF] px-4 text-center hover:border-[#165DFF]">
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

          <form onSubmit={handleSubmit} className="rounded-xl border border-[#E5E6EB] bg-white p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-[#1D2129]">人工确认草稿</h2>
                <p className="mt-1 text-xs text-[#86909C]">识别内容可能有误，请核对后提交</p>
              </div>
              <button type="button" onClick={resetDraft} className="inline-flex h-9 items-center gap-1 rounded-lg border border-[#E5E6EB] px-3 text-xs text-[#4E5969] hover:bg-[#F7F8FA]">
                <RotateCcw className="h-3.5 w-3.5" />清空
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-[#1D2129]">项目 <span className="text-[#F53F3F]">*</span></label>
                <select value={projectId} onChange={event => setProjectId(event.target.value)} className="h-11 w-full rounded-xl border border-[#E5E6EB] bg-[#FBFCFF] px-3 text-sm outline-none focus:border-[#165DFF]">
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
                <input type="number" value={headcount} onChange={event => setHeadcount(event.target.value)} placeholder="0" className="h-11 w-full rounded-xl border border-[#E5E6EB] bg-[#FBFCFF] px-3 text-sm outline-none focus:border-[#165DFF]" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[#1D2129]">异常/问题</label>
                <input value={issues} onChange={event => setIssues(event.target.value)} placeholder="有无异常情况" className="h-11 w-full rounded-xl border border-[#E5E6EB] bg-[#FBFCFF] px-3 text-sm outline-none focus:border-[#165DFF]" />
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
