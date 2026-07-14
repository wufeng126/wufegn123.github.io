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
  项目经验: '#165DFF',
  成本经验: '#0EA5E9',
  签证变更: '#14B8A6',
  施工管理: '#F59E0B',
  合同结算: '#7C3AED',
  标准资料: '#64748B',
  投标策略: '#7C3AED',
  月度分析: '#D46B08',
  default: '#64748B',
};

const qualityColors: Record<string, string> = {
  原始记录: 'bg-[#F2F3F5] text-[#4E5969]',
  已整理: 'bg-[#E8F3FF] text-[#165DFF]',
  推荐复用: 'bg-[#FFF7E8] text-[#D46B08]',
  标准经验: 'bg-[#E8FFEA] text-[#00A870]',
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
  draft: 'bg-[#F2F3F5] text-[#4E5969]',
  manager_review: 'bg-[#E8F3FF] text-[#165DFF]',
  budget_confirm: 'bg-[#F5EEFF] text-[#722ED1]',
  boss_review: 'bg-[#FFF7E8] text-[#D46B08]',
  completed: 'bg-[#E8FFEA] text-[#00A870]',
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
  if (ownerId) return String(currentUser?.id || '') === ownerId || currentUser?.role === 'super_admin';
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
        ctx.fillStyle = '#1D2129';
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
      <div className="mt-2 flex items-center gap-3 text-[10px] text-[#8A8F98]">
        <span><span className="inline-block w-2 h-2 rounded-full bg-[#165DFF] mr-1" />项目经验</span>
        <span><span className="inline-block w-2 h-2 rounded-full bg-[#0EA5E9] mr-1" />成本经验</span>
        <span><span className="inline-block w-2 h-2 rounded-full bg-[#F59E0B] mr-1" />施工管理</span>
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
            <p className="text-sm font-medium text-[#171717]">高复用知识</p>
            <Link href="/knowledge?query=推荐复用" className="text-xs text-[#165DFF] hover:underline">查看更多</Link>
          </div>
          <div className="space-y-2">
            {highReuseDocs.length > 0 ? highReuseDocs.map(doc => {
              const tags = normalizeKnowledgeTags(doc.tags);
              const quality = getKnowledgeQuality(tags, doc.source_type, doc.category);
              return (
                <Link key={doc.id} href={`/knowledge/${doc.id}`} className="block rounded-lg border border-[#E5E6EB] p-3 transition hover:border-[#165DFF]/40 hover:bg-[#F8FAFF]">
                  <div className="flex items-center gap-2">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] ${qualityColors[quality]}`}>{quality}</span>
                    <span className="text-[10px] text-[#8A8F98]">{getCategoryLabel(doc)}</span>
                  </div>
                  <p className="mt-1 line-clamp-1 text-sm font-medium text-[#171717]">{doc.title}</p>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#8A8F98]">{stripMarkdown(doc.content) || '暂无摘要'}</p>
                </Link>
              );
            }) : (
              <p className="rounded-lg border border-dashed border-[#DADDE5] p-3 text-xs leading-5 text-[#8A8F98]">
                暂无推荐复用知识，可在详情中补充复用建议并提升知识等级。
              </p>
            )}
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-[#171717]">最近沉淀</p>
          <div className="space-y-2">
            {recentDocs.map(doc => (
              <Link key={doc.id} href={`/knowledge/${doc.id}`} className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 transition hover:bg-[#F8FAFF]">
                <div className="min-w-0">
                  <p className="line-clamp-1 text-sm text-[#171717]">{doc.title}</p>
                  <p className="mt-0.5 text-xs text-[#8A8F98]">{getCategoryLabel(doc)} · {formatDate(doc.updated_at || doc.created_at)}</p>
                </div>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[#C9CDD4]" />
              </Link>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-[#171717]">待补关联</p>
          {weakRelationDocs.length > 0 ? (
            <div className="space-y-2">
              {weakRelationDocs.map(doc => (
                <Link key={doc.id} href={`/knowledge/${doc.id}`} className="block rounded-lg bg-[#FBFCFF] px-3 py-2 text-sm text-[#4E5969] transition hover:bg-[#F0F5FF] hover:text-[#165DFF]">
                  {doc.title}
                </Link>
              ))}
            </div>
          ) : (
            <p className="rounded-lg bg-[#F6FFED] p-3 text-xs text-[#00A870]">当前知识关联情况较好。</p>
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
    });
  }, [docs, query, activeCategory, activeQuality, currentUser, pendingOnly]);

  return (
    <div className="min-h-full bg-[var(--bg-page)] p-3 md:p-6">
      <style jsx global>{`
        .kb-card { border: 1px solid rgba(0,0,0,0.06); border-radius: 12px; background: #FFFFFF; box-shadow: 0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.03); padding: 16px; }
        @media (min-width:768px) { .kb-card { padding: 20px; } }
        .kb-section-title { display: flex; align-items: center; gap: 8px; color: #1D2129; font-size: 15px; font-weight: 600; }
        .kb-pill { white-space: nowrap; padding: 6px 14px; border-radius: 6px; font-size: 13px; font-weight: 510; border: none; background: transparent; color: #8A8F98; transition: all .15s; }
        .kb-pill-active, .kb-pill:hover { background: #165DFF; color: #FFF; border-color: #165DFF; }
        .kb-stat { border: 1px solid #E5E6EB; border-radius: 10px; background: linear-gradient(180deg,#FFF,#F8FAFF); padding: 12px; text-align: center; }
        .kb-stat span { color: #165DFF; font-size: 20px; font-weight: 700; }
        .kb-stat p { margin-top: 2px; color: #86909C; font-size: 12px; }
      `}</style>

      {/* 标题+操作 */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#171717] md:text-2xl">知识库</h1>
          <p className="mt-0.5 text-xs text-[#8A8F98] md:text-sm">项目经验 · 成本经验 · 标准资料 · 复用沉淀</p>
        </div>
        <div className="flex items-center gap-2">
          {pendingCount > 0 && (
            <span className="hidden md:inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-[#F53F3F] text-white">{pendingCount} 条待处理</span>
          )}
          <Link href="/knowledge/new" className="inline-flex h-9 md:h-10 items-center justify-center gap-1.5 rounded-lg bg-[#165DFF] px-3 md:px-4 text-xs md:text-sm font-medium text-white shadow-md hover:bg-[#0E49D8]">
            <Plus className="h-3.5 w-3.5 md:h-4 md:w-4" /><span className="hidden md:inline">写知识</span>
          </Link>
          <Link href="/knowledge/monthly/new" className="inline-flex h-9 md:h-10 items-center justify-center gap-1.5 rounded-lg border border-[#165DFF] bg-white px-3 md:px-4 text-xs md:text-sm font-medium text-[#165DFF] hover:bg-[rgba(22,93,255,0.06)]">
            <FileText className="h-3.5 w-3.5 md:h-4 md:w-4" /><span className="hidden md:inline">写月度分析</span>
          </Link>
        </div>
      </div>

      {/* KPI 摘要条 */}
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1 scrollbar-none md:grid md:grid-cols-4 md:gap-3">
        {[
          { label: '知识总数', value: docs.length, color: '#165DFF' },
          { label: '原始记录', value: qualityStats['原始记录'] || 0, color: '#64748B' },
          { label: '推荐复用', value: qualityStats['推荐复用'] || 0, color: '#D46B08' },
          { label: '标准经验', value: qualityStats['标准经验'] || 0, color: '#00A870' },
          { label: '待处理', value: pendingCount, color: '#F53F3F', show: pendingCount > 0 },
        ].filter(s => s.show !== false).map((s, i) => (
          <div key={i} className="rounded-[10px] bg-white p-3 shadow-[0_4px_12px_rgba(15,23,42,0.04)]">
            <p className="text-xl md:text-2xl font-bold" style={{ color: s.color }}>{s.value}</p>
            <p className="mt-0.5 text-[10px] md:text-xs text-[#8A8F98]">{s.label}</p>
          </div>
        ))}
      </div>

      {/* 搜索+分类 */}
      <div className="mb-4 rounded-[10px] bg-white p-3 shadow-[0_4px_12px_rgba(15,23,42,0.04)]">
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8A8F98]" />
          <input value={query} onChange={e => setQuery(e.target.value)}
            placeholder="搜索标题、正文、作者或标签"
            className="h-10 w-full rounded-[10px] border border-[rgba(0,0,0,0.06)] bg-[#FBFCFF] pl-10 pr-4 text-sm outline-none focus:border-[#165DFF] focus:ring-4 focus:ring-[#165DFF]/10" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {categories.slice(0, 5).map(cat => (
            <button key={cat} type="button"
              className={`kb-pill ${activeCategory === cat ? 'kb-pill-active' : ''}`}
              onClick={() => setActiveCategory(cat)}>{cat}</button>
          ))}
          {categories.length > 5 && (
            <div className="relative">
              <button type="button"
                className={`kb-pill ${categories.slice(5).includes(activeCategory) ? 'kb-pill-active' : ''}`}
                onClick={() => setShowMoreCategories(!showMoreCategories)}>更多▾</button>
              {showMoreCategories && (
                <div className="absolute top-full left-0 mt-1 z-10 bg-white border border-[rgba(0,0,0,0.06)] rounded-lg p-2 shadow-lg min-w-[120px]">
                  {categories.slice(5).map(cat => (
                    <button key={cat} type="button"
                      className={`block w-full text-left px-3 py-1.5 rounded text-xs hover:bg-[#F2F3F5] ${activeCategory === cat ? 'text-[#165DFF] font-medium' : 'text-[#4E5969]'}`}
                      onClick={() => { setActiveCategory(cat); setShowMoreCategories(false); }}>{cat}</button>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="w-px bg-[#E5E6EB] mx-0.5 self-stretch" />
          <button type="button"
            className={`kb-pill ${pendingOnly ? 'kb-pill-active' : ''}`}
            onClick={() => setPendingOnly(!pendingOnly)}>
            📋 待办{pendingCount > 0 ? ` (${pendingCount})` : ''}
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-[#F2F3F5] pt-3">
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
        </div>
      </div>

      <div className="grid gap-4 lg:gap-5 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-5">
          <section className="kb-card">
            {activeCategory === '全部' ? (
              <div className="divide-y divide-[#E5E6EB]">
                {KNOWLEDGE_BUSINESS_CATEGORIES.map(cat => {
                  const catDocs = filteredDocs.filter(d => getCategoryLabel(d) === cat);
                  if (catDocs.length === 0) return null;
                  const icons: Record<string, string> = { 项目经验: '📄', 成本经验: '¥', 签证变更: '↻', 施工管理: '🧭', 合同结算: '§', 标准资料: '□', 投标策略: '🏆', 月度分析: '📊' };
                  return (
                    <div key={cat} className="px-5 py-5">
                      <div className="flex items-center gap-2 mb-4">
                        <span className="text-base">{icons[cat] || '📋'}</span>
                        <h3 className="text-base font-semibold text-[#171717]">{cat}</h3>
                        <span className="text-xs text-[#8A8F98]">{catDocs.length} 条</span>
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        {catDocs.slice(0, 6).map(doc => {
                          const tags = visibleTags(doc.tags);
                          const docTags = normalizeKnowledgeTags(doc.tags);
                          const quality = getKnowledgeQuality(docTags, doc.source_type, doc.category);
                          const sourceLabel = getKnowledgeSourceLabel(doc.source_type, doc.source_ref, docTags);
                          const hasFile = doc.file_key && !doc.file_key.startsWith('bid:');
                          const isMonthly = isMonthlyAnalysisDoc(doc, docTags);
                          const monthlyState = getMonthlyWorkflowState(docTags);
                          return (
                            <Link key={doc.id} href={`/knowledge/${doc.id}`}
                              className="group rounded-xl border border-[rgba(0,0,0,0.06)] p-4 hover:border-[#165DFF]/30 hover:shadow-sm transition block">
                              <div className="flex items-start gap-3">
                                <span className="text-lg shrink-0 mt-0.5">{icons[cat] || '📄'}</span>
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium text-[#171717] group-hover:text-[#165DFF] line-clamp-1">{doc.title}</p>
                                  <p className="text-xs text-[#8A8F98] mt-1 line-clamp-2">{stripMarkdown(doc.content) || '暂无摘要'}</p>
                                  <div className="flex items-center gap-2 mt-2 text-[10px] text-[#A9AEB8]">
                                    <span className={`rounded px-1.5 py-0.5 ${qualityColors[quality]}`}>{quality}</span>
                                    {isMonthly && (
                                      <span className={`rounded px-1.5 py-0.5 ${monthlyStateBadgeClasses[monthlyState]}`}>
                                        月度分析 · {monthlyStateLabels[monthlyState]}
                                      </span>
                                    )}
                                    <span>{sourceLabel}</span>
                                    <span>{formatDate(doc.updated_at || doc.created_at)}</span>
                                    {hasFile && <span>📎 含附件</span>}
                                    {tags.slice(0, 2).map(t => <span key={t} className="inline-flex items-center gap-0.5 rounded bg-[#F7F8FA] px-1.5 py-0.5"><Tag className="h-2.5 w-2.5" />{t}</span>)}
                                  </div>
                                </div>
                              </div>
                            </Link>
                          );
                        })}
                      </div>
                      {catDocs.length > 6 && (
                        <button onClick={() => setActiveCategory(cat)}
                          className="mt-3 text-xs text-[#165DFF] hover:underline">
                          查看全部 {catDocs.length} 条 →
                        </button>
                      )}
                    </div>
                  );
                })}
                {filteredDocs.length === 0 && (
                  <div className="py-10 text-center text-sm text-[#8A8F98]">暂无知识条目</div>
                )}
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-3">
                  <div className="kb-section-title">
                    <FileText className="h-5 w-5" />
                    <h2>{activeCategory}</h2>
                  </div>
                  <span className="text-sm text-[#8A8F98]">{filteredDocs.length} 条</span>
                </div>
                <div className="mt-4 divide-y divide-[#E5E6EB]">
                  {loading ? (
                    <div className="py-10 text-center text-sm text-[#8A8F98]">正在加载知识库...</div>
                  ) : filteredDocs.length > 0 ? (
                    filteredDocs.slice(0, 12).map(doc => {
                      const tags = visibleTags(doc.tags);
                      const docTags = normalizeKnowledgeTags(doc.tags);
                      const quality = getKnowledgeQuality(docTags, doc.source_type, doc.category);
                      const sourceLabel = getKnowledgeSourceLabel(doc.source_type, doc.source_ref, docTags);
                      const isMonthly = isMonthlyAnalysisDoc(doc, docTags);
                      const monthlyState = getMonthlyWorkflowState(docTags);
                      return (
                        <Link href={`/knowledge/${doc.id}`} key={doc.id} className="group block py-4 transition hover:bg-[#F8FAFF]">
                          <div className="flex items-start justify-between gap-4 px-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="text-base font-semibold text-[#171717] group-hover:text-[#165DFF]">{doc.title}</h3>
                                <span className="rounded-full bg-[rgba(22,93,255,0.06)] px-2 py-1 text-xs text-[#165DFF]">{getCategoryLabel(doc)}</span>
                                <span className={`rounded-full px-2 py-1 text-xs ${qualityColors[quality]}`}>{quality}</span>
                                {isMonthly && (
                                  <span className={`rounded-full px-2 py-1 text-xs ${monthlyStateBadgeClasses[monthlyState]}`}>
                                    月度分析 · {monthlyStateLabels[monthlyState]}
                                  </span>
                                )}
                              </div>
                              <p className="mt-2 line-clamp-2 text-sm leading-6 text-[#4E5969]">{stripMarkdown(doc.content) || '暂无摘要'}</p>
                              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-[#8A8F98]">
                                <span>来源：{sourceLabel}</span>
                                <span>作者：{doc.created_by || '系统'}</span>
                                <span>更新：{formatDate(doc.updated_at || doc.created_at)}</span>
                                {tags.slice(0, 4).map(tag => (
                                  <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-[#F7F8FA] px-2 py-1">
                                    <Tag className="h-3 w-3" />{tag}
                                  </span>
                                ))}
                              </div>
                            </div>
                            <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-[#C9CDD4] transition group-hover:translate-x-1 group-hover:text-[#165DFF]" />
                          </div>
                        </Link>
                      );
                    })
                  ) : (
                    <div className="py-10 text-center text-sm text-[#8A8F98]">没有匹配的知识条目</div>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-5">
          <KnowledgeReusePanel docs={docs} />

          <section className="kb-card">
            <div className="kb-section-title">
              <Sparkles className="h-5 w-5" />
              <h2>快捷入口</h2>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {quickLinks.map(link => (
                <button
                  key={link}
                  type="button"
                  className="kb-pill"
                  onClick={() => {
                    const target = link === '定额参考' ? '全部' : link;
                    setActiveCategory(categories.includes(target) ? target : '全部');
                    setQuery(link === '月度分析' ? '月度分析' : '');
                  }}
                >
                  {link}
                </button>
              ))}
            </div>
          </section>

          <KnowledgeGraph docs={docs} />
        </aside>
      </div>
    </div>
  );
}
