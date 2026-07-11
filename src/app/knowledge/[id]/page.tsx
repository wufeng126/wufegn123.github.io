'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, BookOpen, CalendarDays, Link2, Tag, UserRound } from 'lucide-react';

type KnowledgeDoc = {
  id: string | number;
  title: string;
  category?: string | null;
  content?: string | null;
  created_by?: string | number | null;
  created_at?: string | null;
  updated_at?: string | null;
  tags?: string[] | string | null;
};

const categoryMap: Record<string, string> = {
  business_data: '项目档案',
  law: '经验总结',
  company_policy: '经验总结',
  contract_template: '投标策略',
  field_glossary: '工序单价',
};

function getCategoryLabel(category?: string | null) {
  if (!category) return '项目档案';
  return categoryMap[category] || category;
}

function formatDate(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function normalizeTags(tags?: string[] | string | null) {
  if (Array.isArray(tags)) return tags.filter(Boolean);
  if (typeof tags === 'string') {
    try {
      const parsed = JSON.parse(tags);
      if (Array.isArray(parsed)) return parsed.filter(Boolean);
    } catch {
      return tags.split(',').map(tag => tag.trim()).filter(Boolean);
    }
  }
  return [];
}

function extractWikiLinks(content?: string | null) {
  const matches = [...(content || '').matchAll(/\[\[([^\]]+)\]\]/g)];
  return Array.from(new Set(matches.map(match => match[1]?.trim()).filter(Boolean)));
}

export default function KnowledgeDetailPage() {
  const params = useParams<{ id: string }>();
  const [doc, setDoc] = useState<KnowledgeDoc | null>(null);
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;

    async function loadKnowledge() {
      try {
        setLoading(true);
        setError('');
        const res = await fetch('/api/ai/knowledge?page_size=1000&status=active');
        const json = await res.json();

        if (!res.ok || json.success === false) {
          throw new Error(json.error || '知识详情加载失败');
        }

        const items: KnowledgeDoc[] = Array.isArray(json.data) ? json.data : [];
        const current = items.find(item => String(item.id) === String(params.id));

        if (!mounted) return;
        setDocs(items);
        setDoc(current || null);
        if (!current) setError('未找到该知识条目，可能已删除或无权限查看。');
      } catch (e: any) {
        if (!mounted) return;
        setDocs([]);
        setDoc(null);
        setError(e.message || '知识详情加载失败');
      } finally {
        if (mounted) setLoading(false);
      }
    }

    if (params.id) loadKnowledge();

    return () => {
      mounted = false;
    };
  }, [params.id]);

  const tags = useMemo(() => normalizeTags(doc?.tags), [doc?.tags]);
  const relatedLinks = useMemo(() => extractWikiLinks(doc?.content), [doc?.content]);
  const titleToId = useMemo(() => {
    const map = new Map<string, string | number>();
    docs.forEach(item => map.set(item.title, item.id));
    return map;
  }, [docs]);

  return (
    <div className="min-h-full bg-[#F5F7FB] p-4 md:p-6">
      <style jsx global>{`
        .knowledge-card {
          border: 1px solid #E5E6EB;
          border-radius: 12px;
          background: #FFFFFF;
          box-shadow: 0 10px 30px rgba(15, 23, 42, 0.05);
        }

        .knowledge-meta-item {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          color: #4E5969;
          font-size: 13px;
        }
      `}</style>

      <div className="mx-auto max-w-5xl">
        <div className="mb-5 flex items-center justify-between gap-3">
          <Link
            href="/knowledge"
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#E5E6EB] bg-white px-3 text-sm font-medium text-[#4E5969] transition hover:border-[#165DFF]/40 hover:text-[#165DFF]"
          >
            <ArrowLeft className="h-4 w-4" />
            返回知识库
          </Link>
          <Link
            href="/knowledge/new"
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#165DFF] px-4 text-sm font-medium text-white shadow-[0_8px_18px_rgba(22,93,255,0.22)] transition hover:bg-[#0E49D8]"
          >
            写知识
          </Link>
        </div>

        {loading ? (
          <section className="knowledge-card p-10 text-center text-sm text-[#86909C]">正在加载知识详情...</section>
        ) : error || !doc ? (
          <section className="knowledge-card p-10 text-center">
            <BookOpen className="mx-auto h-10 w-10 text-[#C9CDD4]" />
            <p className="mt-3 text-sm text-[#4E5969]">{error || '未找到该知识条目。'}</p>
          </section>
        ) : (
          <div className="space-y-5">
            <article className="knowledge-card overflow-hidden">
              <header className="border-b border-[#E5E6EB] px-5 py-6 md:px-7">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className="inline-flex rounded-full bg-[#F0F5FF] px-3 py-1 text-xs font-medium text-[#165DFF]">
                    {getCategoryLabel(doc.category)}
                  </span>
                  {tags.map(tag => (
                    <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-[#F7F8FA] px-2.5 py-1 text-xs text-[#4E5969]">
                      <Tag className="h-3 w-3" />
                      {tag}
                    </span>
                  ))}
                </div>
                <h1 className="text-2xl font-bold leading-tight text-[#1D2129] md:text-3xl">{doc.title}</h1>
                <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
                  <span className="knowledge-meta-item">
                    <UserRound className="h-4 w-4" />
                    作者：{doc.created_by || '系统'}
                  </span>
                  <span className="knowledge-meta-item">
                    <CalendarDays className="h-4 w-4" />
                    创建：{formatDate(doc.created_at)}
                  </span>
                  <span className="knowledge-meta-item">
                    <CalendarDays className="h-4 w-4" />
                    更新：{formatDate(doc.updated_at || doc.created_at)}
                  </span>
                </div>
              </header>

              <div className="px-5 py-6 md:px-7">
                <div className="min-h-[280px] whitespace-pre-wrap break-words rounded-xl border border-[#E5E6EB] bg-[#FBFCFF] p-5 text-sm leading-7 text-[#1D2129]">
                  {doc.content || '暂无正文内容'}
                </div>
              </div>
            </article>

            <section className="knowledge-card p-5 md:p-6">
              <div className="flex items-center gap-2 text-[#165DFF]">
                <Link2 className="h-5 w-5" />
                <h2 className="text-lg font-semibold text-[#1D2129]">关联知识</h2>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {relatedLinks.length > 0 ? (
                  relatedLinks.map(title => {
                    const targetId = titleToId.get(title);
                    const href = targetId ? `/knowledge/${targetId}` : `/knowledge?query=${encodeURIComponent(title)}`;
                    return (
                      <Link
                        key={title}
                        href={href}
                        className="inline-flex items-center gap-2 rounded-full border border-[#DCE6FF] bg-[#F0F5FF] px-3 py-2 text-sm font-medium text-[#165DFF] transition hover:border-[#165DFF] hover:bg-white"
                      >
                        <Link2 className="h-3.5 w-3.5" />
                        {title}
                      </Link>
                    );
                  })
                ) : (
                  <p className="text-sm text-[#86909C]">正文中暂无 [[双链]] 关联。</p>
                )}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
