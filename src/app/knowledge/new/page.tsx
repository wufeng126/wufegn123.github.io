'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Upload, FileText, Loader2, Lightbulb } from 'lucide-react';

interface Project {
  id: number;
  name: string;
}

const categories = ['项目档案', '成本分析', '工序单价', '经验总结', '投标策略'];

const categoryHints: Record<string, string[]> = {
  '经验总结': ['本次遇到的主要问题是什么？', '采取了什么措施？', '效果如何？', '下次遇到类似情况有什么建议？'],
  '项目档案': ['项目概况', '合同关键条款', '主要参建单位', '特殊工艺要求'],
  '投标策略': ['投标项目名称', '报价策略', '中标/未中标原因', '下次投标改进点'],
};

export default function NewKnowledgePage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState(categories[0]);
  const [projectId, setProjectId] = useState('');
  const [tags, setTags] = useState('');
  const [content, setContent] = useState('');
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // 文件上传
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let mounted = true;

    async function loadProjects() {
      try {
        const res = await fetch('/api/projects');
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || '项目列表加载失败');
        if (mounted) setProjects(Array.isArray(json.projects) ? json.projects : []);
      } catch {
        if (mounted) setProjects([]);
      } finally {
        if (mounted) setLoadingProjects(false);
      }
    }

    loadProjects();

    return () => {
      mounted = false;
    };
  }, []);

  const selectedProject = useMemo(
    () => projects.find(project => String(project.id) === projectId),
    [projectId, projects],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    if (!title.trim() || !category || !content.trim()) {
      setError('请填写标题、分类和 Markdown 内容。');
      return;
    }

    try {
      setSubmitting(true);

      // 1. 上传文件（如果有）
      let fileKey = '';
      let fileName = '';
      let fileSize = 0;
      if (file) {
        setUploading(true);
        const formData = new FormData();
        formData.append('file', file);
        formData.append('projectId', projectId || '0');
        const uploadRes = await fetch('/api/project-contracts', { method: 'POST', body: formData });
        const uploadJson = await uploadRes.json();
        if (uploadJson.success) {
          fileKey = uploadJson.data.storage_path;
          fileName = file.name;
          fileSize = file.size;
        }
        setUploading(false);
      }

      // 2. 保存知识条目
      const payload = {
        title: title.trim(),
        category,
        source_type: 'manual',
        source_ref: selectedProject ? `project:${selectedProject.id}:${selectedProject.name}` : null,
        tags: tags.split(',').map(tag => tag.trim()).filter(Boolean),
        content: content.trim(),
        file_key: fileKey || null,
        file_name: fileName || null,
        file_size: fileSize || null,
        created_by: '手动录入',
      };

      const res = await fetch('/api/ai/knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();

      if (!res.ok || json.success === false) {
        throw new Error(json.error || '保存知识失败');
      }

      router.push('/knowledge');
      router.refresh();
    } catch (e: any) {
      setError(e.message || '保存知识失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-full bg-[#F5F7FB] p-4 md:p-6">
      <style jsx global>{`
        .knowledge-form-card {
          border: 1px solid rgba(0,0,0,0.06);
          border-radius: 12px;
          background: #FFFFFF;
          box-shadow: 0 10px 30px rgba(15, 23, 42, 0.05);
        }

        .knowledge-label {
          color: #171717;
          font-size: 14px;
          font-weight: 600;
        }

        .knowledge-field {
          width: 100%;
          border: 1px solid rgba(0,0,0,0.06);
          border-radius: 10px;
          background: #FBFCFF;
          color: #171717;
          font-size: 14px;
          outline: none;
          transition: all 0.2s ease;
        }

        .knowledge-field:focus {
          border-color: #165DFF;
          background: #FFFFFF;
          box-shadow: 0 0 0 4px rgba(22, 93, 255, 0.1);
        }
      `}</style>

      <div className="mx-auto max-w-5xl">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-[#171717]">写知识</h1>
            <p className="mt-1 text-sm text-[#8A8F98]">沉淀项目档案、成本分析、工序单价和投标策略。</p>
          </div>
          <Link
            href="/knowledge"
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-[rgba(0,0,0,0.06)] bg-white px-3 text-sm font-medium text-[#4E5969] transition hover:border-[#165DFF]/40 hover:text-[#165DFF]"
          >
            <ArrowLeft className="h-4 w-4" />
            返回
          </Link>
        </div>

        <form onSubmit={handleSubmit} className="knowledge-form-card p-5 md:p-7">
          <div className="grid gap-5 md:grid-cols-2">
            <label className="space-y-2 md:col-span-2">
              <span className="knowledge-label">标题</span>
              <input
                value={title}
                onChange={event => setTitle(event.target.value)}
                className="knowledge-field h-11 px-3"
                placeholder="请输入知识标题"
              />
            </label>

            <label className="space-y-2">
              <span className="knowledge-label">分类</span>
              <select
                value={category}
                onChange={event => setCategory(event.target.value)}
                className="knowledge-field h-11 px-3"
              >
                {categories.map(item => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2">
              <span className="knowledge-label">项目关联</span>
              <select
                value={projectId}
                onChange={event => setProjectId(event.target.value)}
                className="knowledge-field h-11 px-3"
                disabled={loadingProjects}
              >
                <option value="">{loadingProjects ? '正在加载项目...' : '不关联项目'}</option>
                {projects.map(project => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2 md:col-span-2">
              <span className="knowledge-label">标签</span>
              <input
                value={tags}
                onChange={event => setTags(event.target.value)}
                className="knowledge-field h-11 px-3"
                placeholder="多个标签用逗号分隔，例如：劳务,单价,结算"
              />
            </label>

            <label className="space-y-2 md:col-span-2">
              <span className="knowledge-label">Markdown 内容</span>
              <textarea
                value={content}
                onChange={event => setContent(event.target.value)}
                className="knowledge-field min-h-[360px] resize-y p-3 leading-7"
                placeholder="支持普通 Markdown 文本，也可以用 [[知识标题]] 建立双链关联。"
              />
            </label>
          </div>

          {error ? (
            <div className="mt-5 rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-sm text-[#B91C1C]">
              {error}
            </div>
          ) : null}

          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Link
              href="/knowledge"
              className="inline-flex h-10 items-center justify-center rounded-lg border border-[rgba(0,0,0,0.06)] bg-white px-4 text-sm font-medium text-[#4E5969] transition hover:border-[#165DFF]/40 hover:text-[#165DFF]"
            >
              取消
            </Link>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#165DFF] px-5 text-sm font-medium text-white shadow-[0_8px_18px_rgba(22,93,255,0.22)] transition hover:bg-[#0E49D8] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <FileText className="h-4 w-4" />
              {submitting ? '提交中...' : '提交'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
