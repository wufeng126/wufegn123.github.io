'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, BookOpen, CalendarDays, CheckCircle2, Circle, Link2, MessageSquare, Send, Tag, UserRound } from 'lucide-react';

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

type WorkflowState = 'draft' | 'manager_review' | 'budget_confirm' | 'boss_review' | 'completed';
type WorkflowAction = 'submit_to_manager' | 'manager_review' | 'budget_confirm' | 'boss_approve';

type CurrentUser = {
  role?: string;
  username?: string;
  name?: string;
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

const workflowSteps: { state: WorkflowState; label: string; actor: string }[] = [
  { state: 'draft', label: '草稿', actor: '预算员' },
  { state: 'manager_review', label: '项目经理补充', actor: '项目经理' },
  { state: 'budget_confirm', label: '预算确认', actor: '预算员' },
  { state: 'boss_review', label: '老板批复', actor: '老板' },
  { state: 'completed', label: '完成', actor: '完成' },
];

const stateLabels: Record<WorkflowState, string> = {
  draft: '草稿',
  manager_review: '待项目经理补充',
  budget_confirm: '待预算确认',
  boss_review: '待老板批复',
  completed: '已完成',
};

const stateTagMap: Record<string, WorkflowState> = {
  '状态:草稿': 'draft',
  '状态:待项目经理补充': 'manager_review',
  '状态:待预算确认': 'budget_confirm',
  '状态:待老板批复': 'boss_review',
  '状态:已完成': 'completed',
};

const stateBadgeClasses: Record<WorkflowState, string> = {
  draft: 'bg-[#F2F3F5] text-[#4E5969]',
  manager_review: 'bg-[#E8F3FF] text-[#165DFF]',
  budget_confirm: 'bg-[#F5EEFF] text-[#722ED1]',
  boss_review: 'bg-[#FFF7E8] text-[#D46B08]',
  completed: 'bg-[#E8FFEA] text-[#00A870]',
};

const actionByState: Partial<Record<WorkflowState, { action: WorkflowAction; label: string; placeholder: string }>> = {
  draft: {
    action: 'submit_to_manager',
    label: '提交给项目经理',
    placeholder: '可填写提交说明，例如本月重点、需要项目经理补充的问题',
  },
  manager_review: {
    action: 'manager_review',
    label: '提交补充意见',
    placeholder: '请补充项目现场情况、成本异常原因、下月风险点等',
  },
  budget_confirm: {
    action: 'budget_confirm',
    label: '预算确认并提交老板',
    placeholder: '可填写预算确认意见、需老板关注的经营结论',
  },
  boss_review: {
    action: 'boss_approve',
    label: '同意并完成',
    placeholder: '可填写批复意见',
  },
};

function getWorkflowState(tags: string[]): WorkflowState {
  const stateTag = tags.find(tag => tag.startsWith('状态:'));
  return stateTag ? stateTagMap[stateTag] || 'draft' : 'draft';
}

function isMonthlyAnalysis(tags: string[]) {
  return tags.includes('月度分析');
}

function canUserHandleState(role: string | undefined, state: WorkflowState) {
  if (state === 'draft' || state === 'budget_confirm') return role === 'admin' || role === 'super_admin';
  if (state === 'manager_review') return role === 'project_manager';
  if (state === 'boss_review') return role === 'boss';
  return false;
}

function extractWorkflowComments(content?: string | null) {
  const text = content || '';
  const sectionStart = text.indexOf('## 审批流程意见');
  if (sectionStart < 0) return [];
  const section = text.slice(sectionStart);
  const matches = [...section.matchAll(/###\s+([^\n]+)\n([\s\S]*?)(?=\n###\s+|\n##\s+|$)/g)];
  return matches.map(match => ({
    title: match[1].trim(),
    body: match[2].trim(),
  })).filter(item => item.body);
}

export default function KnowledgeDetailPage() {
  const params = useParams<{ id: string }>();
  const [doc, setDoc] = useState<KnowledgeDoc | null>(null);
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [comment, setComment] = useState('');
  const [acting, setActing] = useState(false);

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
      } catch (e: unknown) {
        if (!mounted) return;
        setDocs([]);
        setDoc(null);
        setError(e instanceof Error ? e.message : '知识详情加载失败');
      } finally {
        if (mounted) setLoading(false);
      }
    }

    if (params.id) loadKnowledge();

    fetch('/api/auth/me')
      .then(r => r.json())
      .then(u => { if (mounted) setCurrentUser(u); })
      .catch(() => {});

    return () => {
      mounted = false;
    };
  }, [params.id]);

  const tags = useMemo(() => normalizeTags(doc?.tags), [doc?.tags]);
  const workflowState = useMemo(() => getWorkflowState(tags), [tags]);
  const isMonthly = useMemo(() => isMonthlyAnalysis(tags), [tags]);
  const canAct = useMemo(() => canUserHandleState(currentUser?.role, workflowState), [currentUser?.role, workflowState]);
  const workflowComments = useMemo(() => extractWorkflowComments(doc?.content), [doc?.content]);
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

                {/* 审批流程状态徽章 */}
                {isMonthly && (
                  <div className="mt-3">
                    <span className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${stateBadgeClasses[workflowState]}`}>
                      {stateLabels[workflowState]}
                    </span>
                    <span className="ml-2 text-xs text-[#86909C]">月度分析</span>
                  </div>
                )}

                {/* 审批进度条 */}
                {isMonthly && (
                  <div className="mt-4 flex items-center">
                    {workflowSteps.map((step, i) => {
                      const stepIdx = workflowSteps.findIndex(s => s.state === workflowState);
                      const done = i <= stepIdx;
                      return (
                        <div key={step.state} className={`flex items-center ${i < workflowSteps.length - 1 ? 'flex-1' : ''}`}>
                          <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs ${done ? 'bg-[#E8F3FF] text-[#165DFF]' : 'bg-[#F2F3F5] text-[#86909C]'}`}>
                            {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
                            <span>{step.label}</span>
                          </div>
                          {i < workflowSteps.length - 1 && (
                            <div className={`h-px flex-1 mx-1 ${i < stepIdx ? 'bg-[#165DFF]' : 'bg-[#E5E6EB]'}`} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </header>

              <div className="px-5 py-6 md:px-7">
                <div className="min-h-[280px] whitespace-pre-wrap break-words rounded-xl border border-[#E5E6EB] bg-[#FBFCFF] p-5 text-sm leading-7 text-[#1D2129]">
                  {doc.content || '暂无正文内容'}
                </div>
              </div>
            </article>

            {/* 审批操作区域 - 仅当前阶段操作人可见 */}
            {isMonthly && canAct && (
              <div className="knowledge-card p-5">
                <p className="text-sm font-medium text-[#1D2129]">{actionByState[workflowState]?.label}</p>
                <textarea
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  className="mt-2 w-full min-h-[80px] rounded-lg border border-[#E5E6EB] bg-white p-3 text-sm outline-none focus:border-[#165DFF]"
                  placeholder={actionByState[workflowState]?.placeholder}
                />
                <button
                  onClick={async () => {
                    setActing(true);
                    try {
                      await fetch('/api/ai/knowledge/monthly/workflow', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ knowledgeId: doc.id, action: actionByState[workflowState]?.action, comment }),
                      });
                    } catch {}
                    setActing(false);
                    window.location.reload();
                  }}
                  disabled={acting}
                  className="mt-3 inline-flex h-9 items-center gap-2 rounded-lg bg-[#165DFF] px-4 text-sm font-medium text-white hover:bg-[#0E49D8] disabled:opacity-60"
                >
                  {acting ? '处理中...' : <><Send className="h-3.5 w-3.5" />{actionByState[workflowState]?.label}</>}
                </button>
              </div>
            )}

            {/* 审批意见展示 */}
            {isMonthly && workflowComments.length > 0 && (
              <div className="knowledge-card p-5">
                <h3 className="text-sm font-semibold text-[#1D2129] flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-[#165DFF]" /> 审批流程意见
                </h3>
                <div className="mt-3 space-y-3">
                  {workflowComments.map((item, i) => (
                    <div key={i} className="rounded-lg bg-[#F7F8FA] p-3 text-sm">
                      <p className="font-medium text-[#1D2129]">{item.title}</p>
                      <p className="mt-1 text-[#4E5969] whitespace-pre-wrap">{item.body}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

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
