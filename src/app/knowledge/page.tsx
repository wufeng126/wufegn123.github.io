'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  BookOpen,
  FileText,
  Layers,
  Network,
  Plus,
  Search,
  Sparkles,
  Tag,
} from 'lucide-react';

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
  source_ref?: string | null;
};

type Project = {
  id: string | number;
  name: string;
  partner?: string | null;
  contract_amount?: string | number | null;
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

const categories = ['全部', '项目档案', '成本分析', '工序单价', '经验总结', '投标策略'];

const quickLinks = ['项目档案', '工序单价库', '成本对比', '经验总结', '定额参考', '投标策略'];

const categoryColors: Record<string, string> = {
  项目档案: '#165DFF',
  成本分析: '#0EA5E9',
  工序单价: '#10B981',
  经验总结: '#F59E0B',
  投标策略: '#7C3AED',
  default: '#64748B',
};

const legacyCategoryMap: Record<string, string> = {
  business_data: '项目档案',
  law: '定额参考',
  company_policy: '经验总结',
  contract_template: '投标策略',
  field_glossary: '工序单价',
};

function getCategoryLabel(category?: string | null) {
  if (!category) return '项目档案';
  return legacyCategoryMap[category] || category;
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

function stripMarkdown(content?: string | null) {
  return (content || '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/[#>*_`~\-[\]()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatDate(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function formatAmount(value?: string | number | null) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount <= 0) return '未录入';
  if (amount >= 100000000) return `${(amount / 100000000).toFixed(2)}亿元`;
  if (amount >= 10000) return `${(amount / 10000).toFixed(2)}万元`;
  return `${amount.toLocaleString('zh-CN')}元`;
}

function isDocRelatedToProject(doc: KnowledgeDoc, project: Project) {
  const projectId = String(project.id);
  const sourceRef = String(doc.source_ref || '');
  const title = doc.title || '';
  const content = doc.content || '';
  return sourceRef.includes(projectId) || sourceRef.includes(project.name) || title.includes(project.name) || content.includes(project.name);
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
      category: getCategoryLabel(doc.category),
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
  const [stats, setStats] = useState({ nodes: 0, links: 0, categories: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId = 0;
    let width = 0;
    let height = 260;
    const dpr = window.devicePixelRatio || 1;

    const resize = () => {
      width = wrap.clientWidth;
      height = 260;
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
    };

    const handleMove = (event: MouseEvent) => {
      const interaction = interactionRef.current;
      if (!interaction.node && !interaction.panning) return;
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
      interactionRef.current.node = null;
      interactionRef.current.panning = false;
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
    <section className="kb-card">
      <div className="kb-section-title">
        <Network className="h-5 w-5" />
        <h2>知识图谱</h2>
      </div>
      <div ref={wrapRef} className="mt-4 overflow-hidden rounded-xl border border-[#E5E6EB]">
        <canvas ref={canvasRef} className="block cursor-grab" />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3">
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
    </section>
  );
}

export default function KnowledgePage() {
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('全部');
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [pendingOnly, setPendingOnly] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadData() {
      try {
        const [knowledgeRes, projectRes, userRes] = await Promise.all([
          fetch('/api/ai/knowledge?page_size=100&status=active'),
          fetch('/api/projects'),
          fetch('/api/auth/me'),
        ]);
        const knowledgeJson = await knowledgeRes.json();
        const projectJson = await projectRes.json();
        const userJson = await userRes.json();
        if (!mounted) return;
        const docsList = Array.isArray(knowledgeJson.data) ? knowledgeJson.data : [];
        setDocs(docsList);
        setProjects(Array.isArray(projectJson.projects) ? projectJson.projects : []);
        setCurrentUser(userJson);
      } catch {
        if (mounted) {
          setDocs([]);
          setProjects([]);
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

  const pendingCount = useMemo(() => {
    const role = currentUser?.role;
    return docs.filter(doc => {
      const tags = normalizeTags(doc.tags);
      if (!tags.includes('月度分析')) return false;
      const state = tags.find(t => t.startsWith('状态:'))?.replace('状态:', '');
      if (state === '草稿' && (role === 'admin' || role === 'super_admin')) return true;
      if (state === '待项目经理补充' && role === 'project_manager') return true;
      if (state === '待预算确认' && (role === 'admin' || role === 'super_admin')) return true;
      if (state === '待老板批复' && role === 'boss') return true;
      return false;
    }).length;
  }, [docs, currentUser]);

  const filteredDocs = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    const role = currentUser?.role;
    return docs.filter(doc => {
      const category = getCategoryLabel(doc.category);
      const tags = normalizeTags(doc.tags).join(' ');
      const searchable = `${doc.title} ${doc.content || ''} ${doc.created_by || ''} ${tags} ${category}`.toLowerCase();
      const matchesKeyword = !keyword || searchable.includes(keyword);
      const matchesCategory = activeCategory === '全部' || category === activeCategory;

      // 待我处理筛选
      if (pendingOnly) {
        const docTags = normalizeTags(doc.tags);
        if (!docTags.includes('月度分析')) return false;
        const state = docTags.find(t => t.startsWith('状态:'))?.replace('状态:', '');
        const isPending =
          (state === '草稿' && (role === 'admin' || role === 'super_admin')) ||
          (state === '待项目经理补充' && role === 'project_manager') ||
          (state === '待预算确认' && (role === 'admin' || role === 'super_admin')) ||
          (state === '待老板批复' && role === 'boss');
        if (!isPending) return false;
      }

      return matchesKeyword && matchesCategory;
    });
  }, [docs, query, activeCategory, currentUser, pendingOnly]);

  const projectCards = useMemo(() => {
    return projects.slice(0, 8).map(project => {
      const relatedDocs = docs.filter(doc => isDocRelatedToProject(doc, project));
      const costItems = relatedDocs.filter(doc => {
        const category = getCategoryLabel(doc.category);
        const text = `${doc.title} ${doc.content || ''}`;
        return category === '成本分析' || category === '工序单价' || /成本|单价|费用|结算/.test(text);
      });
      return { project, knowledgeCount: relatedDocs.length, costCount: costItems.length };
    });
  }, [docs, projects]);

  return (
    <div className="min-h-full bg-[var(--bg-page)] p-4 md:p-6">
      <style jsx global>{`
        .kb-card {
          border: 1px solid #E5E6EB;
          border-radius: 12px;
          background: #FFFFFF;
          box-shadow: 0 10px 30px rgba(15, 23, 42, 0.04);
          padding: 20px;
        }

        .kb-section-title {
          display: flex;
          align-items: center;
          gap: 10px;
          color: #165DFF;
        }

        .kb-section-title h2 {
          margin: 0;
          color: #1D2129;
          font-size: 18px;
          font-weight: 700;
        }

        .kb-pill {
          border: 1px solid #E5E6EB;
          border-radius: 999px;
          background: #FFFFFF;
          padding: 7px 13px;
          color: #4E5969;
          font-size: 13px;
          transition: all 0.2s ease;
          white-space: nowrap;
        }

        .kb-pill-active,
        .kb-pill:hover {
          border-color: rgba(22, 93, 255, 0.35);
          background: #F0F5FF;
          color: #165DFF;
        }

        .kb-stat {
          border: 1px solid #E5E6EB;
          border-radius: 10px;
          background: linear-gradient(180deg, #FFFFFF 0%, #F8FAFF 100%);
          padding: 12px;
          text-align: center;
        }

        .kb-stat span {
          color: #165DFF;
          font-size: 20px;
          font-weight: 700;
        }

        .kb-stat p {
          margin-top: 2px;
          color: #86909C;
          font-size: 12px;
        }
      `}</style>

      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1D2129]">
            知识库
            {pendingCount > 0 && (
              <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-[#F53F3F] text-white">
                待办 {pendingCount}
              </span>
            )}
          </h1>
          <p className="mt-1 text-sm text-[#86909C]">沉淀项目档案、成本经验、工序单价和投标策略</p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/knowledge/new"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#165DFF] px-4 text-sm font-medium text-white shadow-[0_8px_18px_rgba(22,93,255,0.22)] transition hover:bg-[#0E49D8]"
          >
            <Plus className="h-4 w-4" />
            写知识
          </Link>
          <Link
            href="/knowledge/monthly/new"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#165DFF] bg-white px-4 text-sm font-medium text-[#165DFF] transition hover:bg-[#F0F5FF]"
          >
            <FileText className="h-4 w-4" />
            写月度分析
          </Link>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-5">
          <section className="rounded-[10px] bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#86909C]" />
                <input
                  value={query}
                  onChange={event => setQuery(event.target.value)}
                  placeholder="搜索标题、正文、作者或标签"
                  className="h-11 w-full rounded-[10px] border border-[#E5E6EB] bg-[#FBFCFF] pl-10 pr-4 text-sm text-[#1D2129] outline-none transition focus:border-[#165DFF] focus:bg-white focus:ring-4 focus:ring-[#165DFF]/10"
                />
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1 lg:pb-0">
                {categories.map(category => (
                  <button
                    key={category}
                    type="button"
                    className={`kb-pill ${activeCategory === category ? 'kb-pill-active' : ''}`}
                    onClick={() => setActiveCategory(category)}
                  >
                    {category}
                  </button>
                ))}
                <div className="w-px bg-[#E5E6EB] mx-1" />
                <button
                  type="button"
                  className={`kb-pill ${pendingOnly ? 'kb-pill-active' : ''}`}
                  onClick={() => setPendingOnly(!pendingOnly)}
                >
                  📋 待我处理{pendingCount > 0 ? ` (${pendingCount})` : ''}
                </button>
              </div>
            </div>
          </section>

          <section className="kb-card">
            <div className="kb-section-title">
              <Layers className="h-5 w-5" />
              <h2>项目知识</h2>
            </div>
            <div className="mt-4 flex gap-4 overflow-x-auto pb-2">
              {projectCards.length > 0 ? (
                projectCards.map(({ project, knowledgeCount, costCount }) => (
                  <div
                    key={project.id}
                    className="min-w-[260px] rounded-xl border border-[#E5E6EB] bg-gradient-to-br from-white to-[#F8FAFF] p-4 transition hover:border-[#165DFF]/40 hover:shadow-[0_10px_24px_rgba(22,93,255,0.10)]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-base font-semibold text-[#1D2129]">{project.name}</h3>
                        <p className="mt-1 truncate text-sm text-[#86909C]">{project.partner || '合同类型未录入'}</p>
                      </div>
                      <div className="rounded-lg bg-[#F0F5FF] p-2 text-[#165DFF]">
                        <BookOpen className="h-4 w-4" />
                      </div>
                    </div>
                    <div className="mt-4 rounded-lg border border-[#E5E6EB] bg-white px-3 py-2">
                      <p className="text-xs text-[#86909C]">合同额</p>
                      <p className="mt-1 text-lg font-bold text-[#1D2129]">{formatAmount(project.contract_amount)}</p>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <div className="rounded-lg bg-[#F7F8FA] p-3">
                        <p className="text-xs text-[#86909C]">知识篇数</p>
                        <p className="mt-1 text-xl font-bold text-[#165DFF]">{knowledgeCount}</p>
                      </div>
                      <div className="rounded-lg bg-[#F7F8FA] p-3">
                        <p className="text-xs text-[#86909C]">成本数据项</p>
                        <p className="mt-1 text-xl font-bold text-[#7C3AED]">{costCount}</p>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="w-full rounded-xl border border-dashed border-[#E5E6EB] p-8 text-center text-sm text-[#86909C]">
                  暂无项目数据
                </div>
              )}
            </div>
          </section>

          <section className="kb-card">
            <div className="flex items-center justify-between gap-3">
              <div className="kb-section-title">
                <FileText className="h-5 w-5" />
                <h2>最新知识</h2>
              </div>
              <span className="text-sm text-[#86909C]">{filteredDocs.length} 条</span>
            </div>
            <div className="mt-4 divide-y divide-[#E5E6EB]">
              {loading ? (
                <div className="py-10 text-center text-sm text-[#86909C]">正在加载知识库...</div>
              ) : filteredDocs.length > 0 ? (
                filteredDocs.slice(0, 12).map(doc => {
                  const tags = normalizeTags(doc.tags);
                  return (
                    <Link
                      href={`/knowledge/${doc.id}`}
                      key={doc.id}
                      className="group block py-4 transition hover:bg-[#F8FAFF]"
                    >
                      <div className="flex items-start justify-between gap-4 px-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-base font-semibold text-[#1D2129] group-hover:text-[#165DFF]">{doc.title}</h3>
                            <span className="rounded-full bg-[#F0F5FF] px-2 py-1 text-xs text-[#165DFF]">{getCategoryLabel(doc.category)}</span>
                          </div>
                          <p className="mt-2 line-clamp-2 text-sm leading-6 text-[#4E5969]">
                            {stripMarkdown(doc.content) || '暂无摘要'}
                          </p>
                          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-[#86909C]">
                            <span>作者：{doc.created_by || '系统'}</span>
                            <span>更新：{formatDate(doc.updated_at || doc.created_at)}</span>
                            {tags.slice(0, 4).map(tag => (
                              <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-[#F7F8FA] px-2 py-1">
                                <Tag className="h-3 w-3" />
                                {tag}
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
                <div className="py-10 text-center text-sm text-[#86909C]">没有匹配的知识条目</div>
              )}
            </div>
          </section>
        </div>

        <aside className="space-y-5">
          <KnowledgeGraph docs={docs} />

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
                    const target = link === '工序单价库' ? '工序单价' : link === '成本对比' ? '成本分析' : link === '定额参考' ? '全部' : link;
                    setActiveCategory(categories.includes(target) ? target : '全部');
                    setQuery(link === '成本对比' || link === '定额参考' ? link.replace('对比', '') : '');
                  }}
                >
                  {link}
                </button>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
