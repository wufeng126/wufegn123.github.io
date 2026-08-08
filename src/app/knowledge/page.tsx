'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  ArrowRight,
  FileText,
  Network,
  Plus,
  Search,
  Sparkles,
  Tag,
} from 'lucide-react';
import {
  KNOWLEDGE_BUSINESS_CATEGORIES,
  KNOWLEDGE_CATEGORY_FILTERS,
  KNOWLEDGE_QUALITY_LEVELS,
  getKnowledgeCategoryLabel,
  getKnowledgeQuality,
  getKnowledgeScenarioTags,
  getKnowledgeSourceLabel,
  normalizeKnowledgeTags,
} from '@/lib/knowledge-taxonomy';

type KnowledgeDoc = {
  id: string | number;
  title: string;
  category?: string | null;
  content?: string | null;
  status?: string | null;
  created_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  tags?: string[] | string | null;
  source_type?: string | null;
  source_ref?: string | null;
  file_key?: string | null;
  file_name?: string | null;
  file_size?: number | null;
};

type GraphNode = {
  id: string;
  label: string;
  category: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  degree: number;
  virtual?: boolean;
};

type GraphLink = {
  source: string;
  target: string;
};

const categories: string[] = [...KNOWLEDGE_CATEGORY_FILTERS];

const quickLinks = ['项目经验', '成本经验', '签证变更', '施工管理', '合同结算', '标准资料', '月度分析'];

const categoryColors: Record<string, string> = {
  项目经验: 'var(--color-primary)',
  成本经验: '#0EA5E9',
  签证变更: '#14B8A6',
  施工管理: '#FF7D00',
  合同结算: '#722ED1',
  标准资料: 'var(--color-text-3)',
  投标策略: '#722ED1',
  月度分析: '#FF7D00',
  default: 'var(--color-text-3)',
};

const qualityColors: Record<string, string> = {
  原始记录: 'bg-[var(--color-muted)] text-[var(--color-text-2)]',
  已整理: 'bg-[var(--color-accent)] text-[var(--color-primary)]',
  推荐复用: 'bg-[#FFF7E8] text-[#FF7D00]',
  标准经验: 'bg-[#E8FFEA] text-[#00B42A]',
};

type MonthlyWorkflowState = 'draft' | 'manager_review' | 'budget_confirm' | 'boss_review' | 'completed';

const workflowTagPrefixes = [
  '发起预算员ID:',
  '发起预算员:',
  '项目经理ID:',
  '项目经理:',
  '老板ID:',
  '老板:',
  '当前负责人ID:',
  '当前负责人:',
];

const monthlyStateLabels: Record<MonthlyWorkflowState, string> = {
  draft: '草稿',
  manager_review: '待项目经理补充',
  budget_confirm: '待预算确认',
  boss_review: '待老板批复',
  completed: '已完成',
};

const monthlyStateTagMap: Record<string, MonthlyWorkflowState> = {
  '状态:草稿': 'draft',
  '状态:待项目经理补充': 'manager_review',
  '状态:待预算确认': 'budget_confirm',
  '状态:待老板批复': 'boss_review',
  '状态:已完成': 'completed',
};

const monthlyStateBadgeClasses: Record<MonthlyWorkflowState, string> = {
  draft: 'bg-[var(--color-muted)] text-[var(--color-text-2)]',
  manager_review: 'bg-[var(--color-accent)] text-[var(--color-primary)]',
  budget_confirm: 'bg-[#F5EEFF] text-[#722ED1]',
  boss_review: 'bg-[#FFF7E8] text-[#FF7D00]',
  completed: 'bg-[#E8FFEA] text-[#00B42A]',
};

function getCategoryLabel(doc: Pick<KnowledgeDoc, 'category' | 'tags'>) {
  return getKnowledgeCategoryLabel(doc.category, normalizeKnowledgeTags(doc.tags));
}

function visibleTags(tags?: string[] | string | null) {
  return normalizeKnowledgeTags(tags).filter(tag => (
    !tag.startsWith('知识等级:') &&
    !tag.startsWith('状态:') &&
    !workflowTagPrefixes.some(prefix => tag.startsWith(prefix))
  ));
}

function isMonthlyAnalysisDoc(doc: Pick<KnowledgeDoc, 'tags' | 'source_ref'>, tags = normalizeKnowledgeTags(doc.tags)) {
  return tags.includes('月度分析') || String(doc.source_ref || '').startsWith('monthly:');
}

function getMonthlyWorkflowState(tags: string[]): MonthlyWorkflowState {
  const stateTag = tags.find(tag => tag.startsWith('状态:'));
  return stateTag ? monthlyStateTagMap[stateTag] || 'draft' : 'draft';
}

function getWorkflowTagValue(tags: string[], prefix: string) {
  const tag = tags.find(item => item.startsWith(prefix));
  return tag ? tag.slice(prefix.length).trim() : '';
}

function isRoleActionableMonthly(tags: string[], role?: string) {
  const state = tags.find(t => t.startsWith('状态:'))?.replace('状态:', '');
  if (state === '草稿' && (role === 'admin' || role === 'super_admin')) return true;
  if (state === '待项目经理补充' && role === 'project_manager') return true;
  if (state === '待预算确认' && (role === 'admin' || role === 'super_admin')) return true;
  if (state === '待老板批复' && role === 'boss') return true;
  return false;
}

function isPendingForCurrentUser(tags: string[], currentUser: { id?: string | number; role?: string } | null) {
  if (!tags.includes('月度分析')) return false;
  const ownerId = getWorkflowTagValue(tags, '当前负责人ID:');
  if (ownerId) return String(currentUser?.id || '') === ownerId;
  if (currentUser?.role === 'super_admin') return false;
  return isRoleActionableMonthly(tags, currentUser?.role);
}

function stripMarkdown(content?: string | null) {
  return (content || '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/[#>*_`~\-[\]()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasWikiLinks(content?: string | null) {
  return /\[\[([^\]]+)\]\]/.test(content || '');
}

function formatDate(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function compactText(content?: string | null, limit = 96) {
  const text = stripMarkdown(content);
  if (!text) return '暂无摘要，建议在详情中补充结论、适用场景和复用要点。';
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}

function getSuggestedAction(doc: KnowledgeDoc, tags: string[]) {
  const category = getCategoryLabel(doc);
  if (category === '投标策略') return '投标前先核对同类项目报价、风险项和管理费口径，再形成测算假设。';
  if (category === '成本经验') return '报价或结算前复核人工、材料、班组单价差异，异常项单独备注。';
  if (category === '签证变更') return '现场发生同类事项时，优先准备影像、工程量、甲方签字和结算依据。';
  if (category === '施工管理') return '施工过程中遇到相似内容时，提前提醒项目负责人关注进度、质量和人员投入。';
  if (category === '合同结算') return '用于结算、回款和合同条款核对，关键金额和时间节点要二次确认。';
  if (category === '月度分析' || tags.includes('月度分析')) return '下月复盘时对照问题、措施和结果，沉淀可复制的管理动作。';
  return '用于同类项目复盘和新项目准备，先确认适用条件，再复用到当前业务。';
}

function buildGraph(docs: KnowledgeDoc[], width: number, height: number) {
  const nodes = new Map<string, GraphNode>();
  const links: GraphLink[] = [];
  const titleToId = new Map<string, string>();

  docs.forEach((doc, index) => {
    const id = String(doc.id);
    const angle = (Math.PI * 2 * index) / Math.max(docs.length, 1);
    const radius = Math.min(width, height) * 0.28;
    titleToId.set(doc.title, id);
    nodes.set(id, {
      id,
      label: doc.title,
      category: getCategoryLabel(doc),
      x: width / 2 + Math.cos(angle) * radius,
      y: height / 2 + Math.sin(angle) * radius,
      vx: 0,
      vy: 0,
      degree: 0,
    });
  });

  docs.forEach(doc => {
    const sourceId = String(doc.id);
    const matches = [...(doc.content || '').matchAll(/\[\[([^\]]+)\]\]/g)];
    matches.forEach(match => {
      const targetTitle = match[1]?.trim();
      if (!targetTitle) return;

      let targetId = titleToId.get(targetTitle);
      if (!targetId) {
        targetId = `virtual:${targetTitle}`;
        if (!nodes.has(targetId)) {
          nodes.set(targetId, {
            id: targetId,
            label: targetTitle,
            category: 'default',
            x: width / 2,
            y: height / 2,
            vx: 0,
            vy: 0,
            degree: 0,
            virtual: true,
          });
        }
      }

      if (targetId !== sourceId) {
        links.push({ source: sourceId, target: targetId });
        nodes.get(sourceId)!.degree += 1;
        nodes.get(targetId)!.degree += 1;
      }
    });
  });

  return { nodes: Array.from(nodes.values()), links };
}

function KnowledgeGraph({ docs }: { docs: KnowledgeDoc[] }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const graphRef = useRef<{ nodes: GraphNode[]; links: GraphLink[] }>({ nodes: [], links: [] });
  const viewportRef = useRef({ scale: 1, x: 0, y: 0 });
  const interactionRef = useRef<{ node: GraphNode | null; panning: boolean; lastX: number; lastY: number }>({
    node: null,
    panning: false,
    lastX: 0,
    lastY: 0,
  });
  const clickRef = useRef<{ x: number; y: number; node: GraphNode | null } | null>(null);
  const [stats, setStats] = useState({ nodes: 0, links: 0, categories: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId = 0;
    let width = 0;
    let height = 320;
    const dpr = window.devicePixelRatio || 1;

    const resize = () => {
      width = wrap.clientWidth;
      height = 320;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      graphRef.current = buildGraph(docs, width, height);
      const categoryCount = new Set(graphRef.current.nodes.map(node => node.category)).size;
      setStats({
        nodes: graphRef.current.nodes.length,
        links: graphRef.current.links.length,
        categories: categoryCount,
      });
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(wrap);
    resize();

    const getNode = (id: string) => graphRef.current.nodes.find(node => node.id === id);

    const step = () => {
      const { nodes, links } = graphRef.current;
      nodes.forEach((a, i) => {
        for (let j = i + 1; j < nodes.length; j += 1) {
          const b = nodes[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const distance = Math.max(Math.sqrt(dx * dx + dy * dy), 8);
          const force = 120 / (distance * distance);
          const fx = (dx / distance) * force;
          const fy = (dy / distance) * force;
          a.vx += fx;
          a.vy += fy;
          b.vx -= fx;
          b.vy -= fy;
        }
      });

      links.forEach(link => {
        const source = getNode(link.source);
        const target = getNode(link.target);
        if (!source || !target) return;
        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const distance = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        const force = (distance - 82) * 0.004;
        const fx = (dx / distance) * force;
        const fy = (dy / distance) * force;
        source.vx += fx;
        source.vy += fy;
        target.vx -= fx;
        target.vy -= fy;
      });

      nodes.forEach(node => {
        if (interactionRef.current.node === node) return;
        node.vx += (width / 2 - node.x) * 0.0008;
        node.vy += (height / 2 - node.y) * 0.0008;
        node.vx *= 0.88;
        node.vy *= 0.88;
        node.x = Math.min(width - 18, Math.max(18, node.x + node.vx));
        node.y = Math.min(height - 18, Math.max(18, node.y + node.vy));
      });
    };

    const draw = () => {
      step();
      const { nodes, links } = graphRef.current;
      const viewport = viewportRef.current;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = '#F8FAFF';
      ctx.fillRect(0, 0, width, height);

      ctx.save();
      ctx.translate(viewport.x, viewport.y);
      ctx.scale(viewport.scale, viewport.scale);

      links.forEach(link => {
        const source = getNode(link.source);
        const target = getNode(link.target);
        if (!source || !target) return;
        ctx.beginPath();
        ctx.moveTo(source.x, source.y);
        ctx.lineTo(target.x, target.y);
        ctx.strokeStyle = 'rgba(100, 116, 139, 0.28)';
        ctx.lineWidth = 1;
        ctx.stroke();
      });

      nodes.forEach(node => {
        const size = 8 + Math.min(node.degree * 3, 14);
        const color = categoryColors[node.category] || categoryColors.default;
        ctx.beginPath();
        ctx.arc(node.x, node.y, size, 0, Math.PI * 2);
        ctx.fillStyle = node.virtual ? '#FFFFFF' : color;
        ctx.fill();
        ctx.lineWidth = node.virtual ? 1.5 : 2;
        ctx.strokeStyle = node.virtual ? color : 'rgba(255,255,255,0.95)';
        ctx.stroke();

        ctx.font = '12px sans-serif';
        ctx.fillStyle = 'var(--foreground)';
        ctx.textAlign = 'center';
        ctx.fillText(node.label.slice(0, 8), node.x, node.y + size + 14);
      });

      ctx.restore();
      animationId = requestAnimationFrame(draw);
    };

    const toGraphPoint = (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const viewport = viewportRef.current;
      return {
        x: (event.clientX - rect.left - viewport.x) / viewport.scale,
        y: (event.clientY - rect.top - viewport.y) / viewport.scale,
      };
    };

    const handleDown = (event: MouseEvent) => {
      const point = toGraphPoint(event);
      const hit = [...graphRef.current.nodes].reverse().find(node => {
        const size = 8 + Math.min(node.degree * 3, 14);
        const dx = point.x - node.x;
        const dy = point.y - node.y;
        return Math.sqrt(dx * dx + dy * dy) <= size + 6;
      }) || null;
      interactionRef.current = { node: hit, panning: !hit, lastX: event.clientX, lastY: event.clientY };
      clickRef.current = { x: event.clientX, y: event.clientY, node: hit };
    };

    const handleMove = (event: MouseEvent) => {
      const interaction = interactionRef.current;
      if (!interaction.node && !interaction.panning) return;
      const clickPos = clickRef.current;
      if (clickPos && (Math.abs(event.clientX - clickPos.x) > 5 || Math.abs(event.clientY - clickPos.y) > 5)) {
        clickRef.current = null;
      }
      if (interaction.node) {
        const point = toGraphPoint(event);
        interaction.node.x = point.x;
        interaction.node.y = point.y;
        interaction.node.vx = 0;
        interaction.node.vy = 0;
      } else {
        viewportRef.current.x += event.clientX - interaction.lastX;
        viewportRef.current.y += event.clientY - interaction.lastY;
        interaction.lastX = event.clientX;
        interaction.lastY = event.clientY;
      }
    };

    const handleUp = () => {
      const clickPos = clickRef.current;
      if (clickPos && clickPos.node && !clickPos.node.virtual) {
        const nodeId = clickPos.node.id;
        if (nodeId && !nodeId.startsWith('virtual:')) {
          window.location.href = `/knowledge/${nodeId}`;
        }
      }
      interactionRef.current.node = null;
      interactionRef.current.panning = false;
      clickRef.current = null;
    };

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const nextScale = Math.min(2, Math.max(0.65, viewportRef.current.scale + (event.deltaY > 0 ? -0.08 : 0.08)));
      viewportRef.current.scale = nextScale;
    };

    canvas.addEventListener('mousedown', handleDown);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    draw();

    return () => {
      cancelAnimationFrame(animationId);
      resizeObserver.disconnect();
      canvas.removeEventListener('mousedown', handleDown);
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      canvas.removeEventListener('wheel', handleWheel);
    };
  }, [docs]);

  return (
    <section className="kb-card" style={{ position: 'relative' }}>
      <div className="kb-section-title">
        <Network className="h-5 w-5" />
        <h2>关系概览</h2>
      </div>
      <div ref={wrapRef} className="mt-4 overflow-hidden rounded-xl border border-[rgba(0,0,0,0.06)]">
        <canvas ref={canvasRef} className="block cursor-grab" />
      </div>
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="kb-stat">
          <span>{stats.nodes}</span>
          <p>节点数</p>
        </div>
        <div className="kb-stat">
          <span>{stats.links}</span>
          <p>关联数</p>
        </div>
        <div className="kb-stat">
          <span>{stats.categories}</span>
          <p>分类数</p>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-3 text-[10px] text-[var(--color-text-3)]">
        <span><span className="inline-block w-2 h-2 rounded-full bg-[var(--color-primary)] mr-1" />项目经验</span>
        <span><span className="inline-block w-2 h-2 rounded-full bg-[#0EA5E9] mr-1" />成本经验</span>
        <span><span className="inline-block w-2 h-2 rounded-full bg-[#FF7D00] mr-1" />施工管理</span>
      </div>
    </section>
  );
}

function KnowledgeReusePanel({ docs }: { docs: KnowledgeDoc[] }) {
  const highReuseDocs = useMemo(() => {
    return docs
      .filter(doc => {
        const tags = normalizeKnowledgeTags(doc.tags);
        const quality = getKnowledgeQuality(tags, doc.source_type, doc.category);
        return quality === '推荐复用' || quality === '标准经验';
      })
      .sort((a, b) => new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime())
      .slice(0, 4);
  }, [docs]);

  const recentDocs = useMemo(() => {
    return [...docs]
      .sort((a, b) => new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime())
      .slice(0, 3);
  }, [docs]);

  const weakRelationDocs = useMemo(() => {
    return docs
      .filter(doc => {
        const tags = visibleTags(doc.tags);
        return tags.length <= 1 && !hasWikiLinks(doc.content);
      })
      .slice(0, 3);
  }, [docs]);

  return (
    <section className="kb-card">
      <div className="kb-section-title">
        <Sparkles className="h-5 w-5" />
        <h2>复用推荐</h2>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="kb-stat">
          <span>{highReuseDocs.length}</span>
          <p>可复用</p>
        </div>
        <div className="kb-stat">
          <span>{recentDocs.length}</span>
          <p>新沉淀</p>
        </div>
        <div className="kb-stat">
          <span>{weakRelationDocs.length}</span>
          <p>待补关联</p>
        </div>
      </div>

      <div className="mt-4 space-y-4">
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium text-[var(--foreground)]">高复用知识</p>
            <Link href="/knowledge?query=推荐复用" className="text-xs text-[var(--color-primary)] hover:underline">查看更多</Link>
          </div>
          <div className="space-y-2">
            {highReuseDocs.length > 0 ? highReuseDocs.map(doc => {
              const tags = normalizeKnowledgeTags(doc.tags);
              const quality = getKnowledgeQuality(tags, doc.source_type, doc.category);
              return (
                <Link key={doc.id} href={`/knowledge/${doc.id}`} className="block rounded-lg border border-[var(--border)] p-3 transition hover:border-[var(--color-primary)]/40 hover:bg-[var(--color-accent)]">
                  <div className="flex items-center gap-2">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] ${qualityColors[quality]}`}>{quality}</span>
                    <span className="text-[10px] text-[var(--color-text-3)]">{getCategoryLabel(doc)}</span>
                  </div>
                  <p className="mt-1 line-clamp-1 text-sm font-medium text-[var(--foreground)]">{doc.title}</p>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--color-text-3)]">{stripMarkdown(doc.content) || '暂无摘要'}</p>
                </Link>
              );
            }) : (
              <p className="rounded-lg border border-dashed border-[#DADDE5] p-3 text-xs leading-5 text-[var(--color-text-3)]">
                暂无推荐复用知识，可在详情中补充复用建议并提升知识等级。
              </p>
            )}
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-[var(--foreground)]">最近沉淀</p>
          <div className="space-y-2">
            {recentDocs.map(doc => (
              <Link key={doc.id} href={`/knowledge/${doc.id}`} className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 transition hover:bg-[var(--color-accent)]">
                <div className="min-w-0">
                  <p className="line-clamp-1 text-sm text-[var(--foreground)]">{doc.title}</p>
                  <p className="mt-0.5 text-xs text-[var(--color-text-3)]">{getCategoryLabel(doc)} · {formatDate(doc.updated_at || doc.created_at)}</p>
                </div>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[var(--color-text-3)]" />
              </Link>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-[var(--foreground)]">待补关联</p>
          {weakRelationDocs.length > 0 ? (
            <div className="space-y-2">
              {weakRelationDocs.map(doc => (
                <Link key={doc.id} href={`/knowledge/${doc.id}`} className="block rounded-lg bg-[var(--color-accent)] px-3 py-2 text-sm text-[var(--color-text-2)] transition hover:bg-[var(--color-accent)] hover:text-[var(--color-primary)]">
                  {doc.title}
                </Link>
              ))}
            </div>
          ) : (
            <p className="rounded-lg bg-[#F6FFED] p-3 text-xs text-[#00B42A]">当前知识关联情况较好。</p>
          )}
        </div>
      </div>
    </section>
  );
}

export default function KnowledgePage() {
  const searchParams = useSearchParams();
  const statusFromUrl = searchParams.get('status');
  const queryFromUrl = searchParams.get('query');
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [query, setQuery] = useState(queryFromUrl || '');
  const [activeCategory, setActiveCategory] = useState('全部');
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<{ id?: string | number; role?: string; username?: string; name?: string } | null>(null);
  const [pendingOnly, setPendingOnly] = useState(statusFromUrl === 'pending');
  const [showMoreCategories, setShowMoreCategories] = useState(false);
  const [activeQuality, setActiveQuality] = useState('全部等级');
  const [selectedDocId, setSelectedDocId] = useState<string | number | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadData() {
      try {
        const [knowledgeRes, userRes] = await Promise.all([
          fetch('/api/ai/knowledge?page_size=100&status=active'),
          fetch('/api/auth/me'),
        ]);
        const knowledgeJson = await knowledgeRes.json();
        const userJson = await userRes.json();
        if (!mounted) return;
        const docsList = Array.isArray(knowledgeJson.data) ? knowledgeJson.data : [];
        setDocs(docsList);
        setCurrentUser(userJson?.data || userJson?.user || userJson);
      } catch {
        if (mounted) {
          setDocs([]);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadData();
    return () => {
      mounted = false;
    };
  }, []);

  const qualityStats = useMemo(() => {
    return KNOWLEDGE_QUALITY_LEVELS.reduce<Record<string, number>>((acc, quality) => {
      acc[quality] = docs.filter(doc => getKnowledgeQuality(normalizeKnowledgeTags(doc.tags), doc.source_type, doc.category) === quality).length;
      return acc;
    }, {});
  }, [docs]);

  const pendingCount = useMemo(() => {
    return docs.filter(doc => {
      const tags = normalizeKnowledgeTags(doc.tags);
      return isPendingForCurrentUser(tags, currentUser);
    }).length;
  }, [docs, currentUser]);

  const filteredDocs = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return docs.filter(doc => {
      const docTags = normalizeKnowledgeTags(doc.tags);
      const category = getCategoryLabel(doc);
      const quality = getKnowledgeQuality(docTags, doc.source_type, doc.category);
      const sourceLabel = getKnowledgeSourceLabel(doc.source_type, doc.source_ref, docTags);
      const tags = visibleTags(doc.tags).join(' ');
      const searchable = `${doc.title} ${doc.content || ''} ${doc.created_by || ''} ${tags} ${category} ${quality} ${sourceLabel}`.toLowerCase();
      const matchesKeyword = !keyword || searchable.includes(keyword);
      const matchesCategory = activeCategory === '全部' || category === activeCategory;
      const matchesQuality = activeQuality === '全部等级' || quality === activeQuality;

      // 待我处理筛选
      if (pendingOnly) {
        if (!isPendingForCurrentUser(docTags, currentUser)) return false;
      }

      return matchesKeyword && matchesCategory && matchesQuality;
    }).sort((a, b) => new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime());
  }, [docs, query, activeCategory, activeQuality, currentUser, pendingOnly]);

  const selectedDoc = useMemo(() => {
    return filteredDocs.find(doc => String(doc.id) === String(selectedDocId)) || filteredDocs[0] || null;
  }, [filteredDocs, selectedDocId]);

  const categoryStats = useMemo(() => {
    return categories.map(category => {
      const count = category === '全部'
        ? docs.length
        : docs.filter(doc => getCategoryLabel(doc) === category).length;
      return { category, count };
    });
  }, [docs]);

  const metricCards = useMemo(() => {
    const recommended = (qualityStats['推荐复用'] || 0) + (qualityStats['标准经验'] || 0);
    const riskHits = docs.filter(doc => {
      const tags = normalizeKnowledgeTags(doc.tags);
      return getCategoryLabel(doc) === '施工管理' || tags.some(tag => tag.includes('风险'));
    }).length;
    return [
      { label: '经验总数', value: docs.length, hint: '全部沉淀', color: 'var(--color-primary)' },
      { label: '推荐复用', value: recommended, hint: '可直接参考', color: '#FF7D00' },
      { label: '风险命中', value: riskHits, hint: '施工与经营提醒', color: '#FF7D00' },
      { label: '待复核', value: pendingCount, hint: pendingCount > 0 ? '需要处理' : '暂无待办', color: '#00A870' },
    ];
  }, [docs, pendingCount, qualityStats]);

  const selectedTags = selectedDoc ? normalizeKnowledgeTags(selectedDoc.tags) : [];
  const selectedCategory = selectedDoc ? getCategoryLabel(selectedDoc) : '';
  const selectedQuality = selectedDoc ? getKnowledgeQuality(selectedTags, selectedDoc.source_type, selectedDoc.category) : '';
  const selectedSource = selectedDoc ? getKnowledgeSourceLabel(selectedDoc.source_type, selectedDoc.source_ref, selectedTags) : '';
  const selectedScenarioTags = selectedDoc ? getKnowledgeScenarioTags(selectedCategory, selectedTags) : [];

  return (
    <div className="min-h-full bg-[#F5F7FB] p-3 md:p-6">
      <style jsx global>{`
        .kb-panel { border: 1px solid var(--border); border-radius: 8px; background: #FFFFFF; box-shadow: 0 8px 20px rgba(15,23,42,0.035); }
        .kb-pill { white-space: nowrap; padding: 6px 12px; border-radius: 8px; font-size: 13px; font-weight: 600; border: 1px solid transparent; color: #64748B; transition: all .15s; }
        .kb-pill-active, .kb-pill:hover { background: #EFF6FF; color: #1D4ED8; border-color: #BFDBFE; }
      `}</style>

      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--foreground)] md:text-2xl">知识库经验台账</h1>
          <p className="mt-1 text-xs text-[var(--color-text-3)] md:text-sm">公司经验大脑：自动萃取、人工沉淀、业务调用。</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {pendingCount > 0 && (
            <button
              type="button"
              onClick={() => setPendingOnly(true)}
              className="inline-flex h-9 items-center rounded-lg border border-[#FCA5A5] bg-[#FEF2F2] px-3 text-xs font-semibold text-[#DC2626]"
            >
              待复核 {pendingCount}
            </button>
          )}
          <Link href="/knowledge/new" className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3 text-xs font-semibold text-white hover:bg-[var(--color-primary)] md:text-sm">
            <Plus className="h-4 w-4" />写经验
          </Link>
          <Link href="/knowledge/monthly/new" className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] bg-card px-3 text-xs font-semibold text-[var(--color-text-2)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] md:text-sm">
            <FileText className="h-4 w-4" />月度分析
          </Link>
        </div>
      </div>

      <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {metricCards.map(card => (
          <div key={card.label} className="kb-panel flex min-h-[76px] items-center justify-between p-3">
            <div>
              <p className="text-xs text-[var(--color-text-3)]">{card.label}</p>
              <p className="mt-1 text-2xl font-bold" style={{ color: card.color }}>{card.value}</p>
            </div>
            <span className="rounded-full bg-[var(--color-muted)] px-2 py-1 text-xs font-semibold text-[var(--color-text-3)]">{card.hint}</span>
          </div>
        ))}
      </div>

      <div className="kb-panel mb-3 p-3">
        <div className="grid gap-2 lg:grid-cols-[minmax(240px,1fr)_auto] lg:items-center">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-3)]" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="搜索经验、项目、风险、单价、签证或结算要点"
              className="h-10 w-full rounded-lg border border-[#D8E0EC] bg-[var(--color-accent)] pl-10 pr-4 text-sm text-[var(--foreground)] outline-none focus:border-[var(--color-primary)] focus:ring-4 focus:ring-[var(--color-primary)]/10"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {['全部等级', ...KNOWLEDGE_QUALITY_LEVELS].map(quality => (
              <button
                key={quality}
                type="button"
                className={`kb-pill ${activeQuality === quality ? 'kb-pill-active' : ''}`}
                onClick={() => setActiveQuality(quality)}
              >
                {quality}
              </button>
            ))}
            <button
              type="button"
              className={`kb-pill ${pendingOnly ? 'kb-pill-active' : ''}`}
              onClick={() => setPendingOnly(!pendingOnly)}
            >
              只看待办{pendingCount > 0 ? ` ${pendingCount}` : ''}
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-[220px_minmax(0,1fr)_340px]">
        <aside className="kb-panel p-3">
          <div className="mb-2 text-sm font-bold text-[var(--color-text-2)]">经验类型</div>
          <div className="space-y-1">
            {categoryStats.map(item => (
              <button
                key={item.category}
                type="button"
                onClick={() => {
                  setActiveCategory(item.category);
                  setShowMoreCategories(false);
                }}
                className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${
                  activeCategory === item.category ? 'bg-[var(--color-accent)] font-bold text-[var(--color-primary)]' : 'text-[var(--color-text-2)] hover:bg-[var(--color-muted)]'
                }`}
              >
                <span>{item.category}</span>
                <span className="text-xs text-[var(--color-text-3)]">{item.count}</span>
              </button>
            ))}
          </div>

          <div className="mt-4 border-t border-[var(--border)] pt-3">
            <div className="mb-2 text-sm font-bold text-[var(--color-text-2)]">常用调用</div>
            <div className="flex flex-wrap gap-2">
              {quickLinks.map(link => (
                <button
                  key={link}
                  type="button"
                  className="rounded-full bg-[var(--color-muted)] px-2.5 py-1 text-xs font-semibold text-[var(--color-text-2)] hover:bg-[#E0F2FE] hover:text-[#0369A1]"
                  onClick={() => {
                    setQuery(link);
                    setActiveCategory(categories.includes(link) ? link : '全部');
                  }}
                >
                  {link}
                </button>
              ))}
            </div>
          </div>
        </aside>

        <main className="min-w-0">
          <div className="kb-panel overflow-hidden">
            <div className="grid grid-cols-[minmax(220px,1fr)_86px_92px_76px] gap-2 border-b border-[var(--border)] bg-[var(--color-muted)] px-3 py-2 text-xs font-bold text-[var(--color-text-3)] max-lg:hidden">
              <span>经验</span>
              <span>来源</span>
              <span>适用场景</span>
              <span>引用</span>
            </div>
            <div className="divide-y divide-[var(--border)]">
              {loading ? (
                <div className="py-12 text-center text-sm text-[var(--color-text-3)]">正在加载经验台账...</div>
              ) : filteredDocs.length > 0 ? (
                filteredDocs.map(doc => {
                  const tags = normalizeKnowledgeTags(doc.tags);
                  const displayTags = visibleTags(doc.tags);
                  const category = getCategoryLabel(doc);
                  const quality = getKnowledgeQuality(tags, doc.source_type, doc.category);
                  const sourceLabel = getKnowledgeSourceLabel(doc.source_type, doc.source_ref, tags);
                  const isMonthly = isMonthlyAnalysisDoc(doc, tags);
                  const monthlyState = getMonthlyWorkflowState(tags);
                  const scenarioTags = getKnowledgeScenarioTags(category, tags);
                  const isSelected = selectedDoc && String(selectedDoc.id) === String(doc.id);

                  return (
                    <div
                      key={doc.id}
                      onClick={() => setSelectedDocId(doc.id)}
                      onKeyDown={event => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setSelectedDocId(doc.id);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      className={`grid w-full grid-cols-1 gap-2 px-3 py-3 text-left transition lg:grid-cols-[minmax(220px,1fr)_86px_92px_76px] ${
                        isSelected ? 'bg-[var(--color-accent)]' : 'bg-card hover:bg-[var(--color-muted)]'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded px-1.5 py-0.5 text-[11px] ${qualityColors[quality]}`}>{quality}</span>
                          {isMonthly && (
                            <span className={`rounded px-1.5 py-0.5 text-[11px] ${monthlyStateBadgeClasses[monthlyState]}`}>
                              {monthlyStateLabels[monthlyState]}
                            </span>
                          )}
                          <span className="rounded bg-[var(--color-muted)] px-1.5 py-0.5 text-[11px] text-[var(--color-text-2)]">{category}</span>
                        </div>
                        <p className="mt-2 line-clamp-1 text-sm font-bold text-[var(--foreground)]">{doc.title}</p>
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--color-text-3)]">{compactText(doc.content, 110)}</p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {displayTags.slice(0, 3).map(tag => (
                            <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-[var(--color-muted)] px-2 py-0.5 text-[11px] text-[var(--color-text-3)]">
                              <Tag className="h-3 w-3" />{tag}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="text-xs leading-5 text-[var(--color-text-2)]">
                        <span className="font-semibold text-[var(--foreground)] lg:block">{sourceLabel}</span>
                        <span>{formatDate(doc.updated_at || doc.created_at)}</span>
                      </div>
                      <div className="text-xs leading-5 text-[var(--color-text-2)]">
                        {scenarioTags.slice(0, 2).map(tag => (
                          <span key={tag} className="mr-1 inline-block rounded bg-[var(--color-muted)] px-1.5 py-0.5">{tag}</span>
                        ))}
                      </div>
                      <div className="flex items-center justify-between gap-2 text-xs text-[var(--color-text-3)] lg:block">
                        <span>{doc.file_key && !doc.file_key.startsWith('bid:') ? '含附件' : '详情'}</span>
                        <Link href={`/knowledge/${doc.id}`} className="font-semibold text-[var(--color-primary)] hover:underline" onClick={event => event.stopPropagation()}>
                          查看
                        </Link>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="py-12 text-center text-sm text-[var(--color-text-3)]">没有匹配的经验，可调整筛选或新增经验。</div>
              )}
            </div>
          </div>
        </main>

        <aside className="kb-panel p-3 xl:sticky xl:top-4">
          {selectedDoc ? (
            <div>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className={`rounded px-2 py-1 text-xs font-semibold ${qualityColors[selectedQuality]}`}>{selectedQuality}</span>
                  <h2 className="mt-3 text-lg font-bold leading-7 text-[var(--foreground)]">{selectedDoc.title}</h2>
                </div>
                <Link href={`/knowledge/${selectedDoc.id}`} className="inline-flex h-8 items-center gap-1 rounded-lg border border-[var(--border)] px-2 text-xs font-semibold text-[var(--color-text-2)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]">
                  详情<ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                <span className="rounded-full bg-[var(--color-accent)] px-2 py-1 text-xs font-semibold text-[var(--color-primary)]">{selectedCategory}</span>
                {selectedScenarioTags.slice(0, 4).map(tag => (
                  <span key={tag} className="rounded-full bg-[var(--color-muted)] px-2 py-1 text-xs text-[var(--color-text-2)]">{tag}</span>
                ))}
              </div>

              <div className="mt-4 space-y-4">
                <div className="border-t border-[var(--border)] pt-4">
                  <p className="text-xs font-bold text-[var(--color-text-3)]">结论</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--foreground)]">{compactText(selectedDoc.content, 150)}</p>
                </div>
                <div className="border-t border-[var(--border)] pt-4">
                  <p className="text-xs font-bold text-[var(--color-text-3)]">建议动作</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--foreground)]">{getSuggestedAction(selectedDoc, selectedTags)}</p>
                </div>
                <div className="border-t border-[var(--border)] pt-4">
                  <p className="text-xs font-bold text-[var(--color-text-3)]">依据</p>
                  <div className="mt-2 grid gap-2 text-sm text-[var(--color-text-2)]">
                    <div className="flex justify-between gap-3">
                      <span>来源</span>
                      <strong className="text-right font-semibold text-[var(--foreground)]">{selectedSource}</strong>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span>作者</span>
                      <strong className="text-right font-semibold text-[var(--foreground)]">{selectedDoc.created_by || '系统'}</strong>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span>更新</span>
                      <strong className="text-right font-semibold text-[var(--foreground)]">{formatDate(selectedDoc.updated_at || selectedDoc.created_at)}</strong>
                    </div>
                    {selectedDoc.file_key && !selectedDoc.file_key.startsWith('bid:') && (
                      <div className="flex justify-between gap-3">
                        <span>附件</span>
                        <strong className="text-right font-semibold text-[var(--foreground)]">{selectedDoc.file_name || '已上传'}</strong>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-10 text-center text-sm text-[var(--color-text-3)]">选择一条经验后查看复用要点。</div>
          )}
        </aside>
      </div>
    </div>
  );
}
