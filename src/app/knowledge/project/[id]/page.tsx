'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, BookOpen, FileText, BarChart3, Users, ClipboardList, CalendarDays, Tag, DollarSign, TrendingUp, AlertTriangle, CheckCircle2, Circle, MessageSquare, Send, Loader2 } from 'lucide-react';

type Project = { id: number; name: string; partner?: string; contract_amount?: number; created_at?: string; status?: string };
type KnowledgeDoc = { id: number | string; title: string; category?: string; content?: string; tags?: any; created_by?: string; created_at?: string; updated_at?: string; source_ref?: string };
type RiskLevel = 'low' | 'medium' | 'high';
type RiskType = 'change' | 'visa' | 'delay' | 'quality' | 'safety' | 'cost';
type LogItem = {
  id: number;
  log_date: string;
  content: string;
  issues?: string;
  user_name?: string;
  location?: string;
  risk_level?: RiskLevel | null;
  risk_types?: RiskType[];
  risk_summary?: string;
};

const RISK_TYPE_LABELS: Record<RiskType, string> = {
  change: '变更',
  visa: '签证',
  delay: '工期',
  quality: '质量',
  safety: '安全',
  cost: '成本',
};

const RISK_LEVEL_LABELS: Record<RiskLevel, string> = {
  low: '低',
  medium: '中',
  high: '高',
};

function riskClass(level?: RiskLevel | null) {
  if (level === 'high') return 'bg-[#FFF1F0] text-[#F53F3F]';
  if (level === 'medium') return 'bg-[#FFF7E8] text-[#D46B08]';
  return 'bg-[#E8F3FF] text-[#165DFF]';
}

function normalizeTags(tags?: any): string[] {
  if (Array.isArray(tags)) return tags.filter(Boolean).map(String);
  if (typeof tags === 'string') { try { const p = JSON.parse(tags); if (Array.isArray(p)) return p.filter(Boolean).map(String); } catch {} }
  return [];
}

function formatAmount(v?: number | null) {
  const a = Number(v || 0);
  if (a <= 0) return '未录入';
  return a >= 10000 ? `${(a / 10000).toFixed(2)}万元` : `${a.toLocaleString()}元`;
}

export default function ProjectKnowledgePage() {
  const params = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const [projRes, knowRes, logRes] = await Promise.all([
          fetch(`/api/projects/${params.id}`),
          fetch('/api/ai/knowledge?page_size=200&status=active'),
          fetch(`/api/construction-logs?pageSize=20&projectId=${params.id}`),
        ]);
        const projJson = await projRes.json();
        const knowJson = await knowRes.json();
        const logJson = await logRes.json();
        if (!mounted) return;

        const proj = projJson.project || projJson.data || projJson;
        setProject(proj.id ? proj : null);

        const allDocs = Array.isArray(knowJson.data) ? knowJson.data : [];
        const projName = proj?.name || '';
        setDocs(allDocs.filter((d: KnowledgeDoc) => {
          const tags = normalizeTags(d.tags);
          return tags.includes(projName)
            || tags.includes(`项目ID:${params.id}`)
            || String(d.source_ref || '').includes(`project:${params.id}`)
            || (d.title || '').includes(projName);
        }));

        const allLogs = Array.isArray(logJson.data) ? logJson.data : [];
        setLogs(allLogs);
      } catch {} finally { if (mounted) setLoading(false); }
    }
    if (params.id) load();
    return () => { mounted = false; };
  }, [params.id]);

  const monthlyDocs = useMemo(() => docs.filter(d => normalizeTags(d.tags).includes('月度分析')), [docs]);
  const costDocs = useMemo(() => docs.filter(d => {
    const cat = d.category || '';
    return cat === '成本分析' || cat === '工序单价';
  }), [docs]);
  const experienceDocs = useMemo(() => docs.filter(d => d.category === '经验总结'), [docs]);
  const riskLogs = useMemo(() => logs.filter(log => log.risk_level), [logs]);

  const sections = [
    { key: 'overview', icon: BookOpen, label: '项目概况', desc: '基本信息、合同概要', count: 1, color: 'from-[#165DFF] to-[#4080FF]' },
    { key: 'contract', icon: FileText, label: '合同清单', desc: '工程量清单与单价', count: docs.filter(d => normalizeTags(d.tags).includes('合同清单') || d.title?.includes('合同')).length, color: 'from-[#0EA5E9] to-[#38BDF8]' },
    { key: 'report', icon: BarChart3, label: '甲方报量', desc: '报量与付款记录', count: docs.filter(d => d.title?.includes('报量') || d.content?.includes('报量')).length, color: 'from-[#10B981] to-[#34D399]' },
    { key: 'team', icon: Users, label: '班组信息', desc: '各班组与对下合同价', count: docs.filter(d => normalizeTags(d.tags).includes('班组信息') || d.title?.includes('班组')).length, color: 'from-[#F59E0B] to-[#FBBF24]' },
    { key: 'salary', icon: DollarSign, label: '结算台账', desc: '包活与点工结算', count: docs.filter(d => d.title?.includes('结算') || d.content?.includes('结算')).length, color: 'from-[#7C3AED] to-[#A78BFA]' },
    { key: 'cost', icon: TrendingUp, label: '成本分析', desc: '对下成本与对上差额', count: costDocs.length, color: 'from-[#EC4899] to-[#F472B6]' },
    { key: 'visa', icon: FileText, label: '签证变更', desc: '变更洽商与签证', count: docs.filter(d => d.title?.includes('签证') || d.category === '签证').length, color: 'from-[#14B8A6] to-[#2DD4BF]' },
  ];

  if (loading) {
    return (
      <div className="min-h-full bg-[#F5F6FA] p-4 md:p-6 flex items-center justify-center">
        <div className="text-center text-sm text-[#86909C]">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-3 text-[#165DFF]" />
          加载项目知识...
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-full bg-[#F5F6FA] p-4 md:p-6">
        <div className="max-w-3xl mx-auto text-center py-20 text-sm text-[#86909C]">项目不存在</div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[#F5F6FA] p-4 md:p-6">
      <div className="mx-auto max-w-6xl">
        {/* 顶部导航 */}
        <div className="flex items-center gap-3 mb-5">
          <Link href="/knowledge" className="h-9 w-9 rounded-lg border border-[#E5E6EB] flex items-center justify-center hover:bg-[#F2F3F5]">
            <ArrowLeft className="h-4 w-4 text-[#4E5969]" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-[#1D2129] flex items-center gap-2">
              {project.name}
              {project.status === '进行中' && <span className="text-xs bg-[#E8F3FF] text-[#165DFF] px-2 py-0.5 rounded-full">进行中</span>}
            </h1>
            <p className="text-sm text-[#86909C] mt-0.5">
              {project.partner || ''} · 合同额 {formatAmount(project.contract_amount)}
            </p>
          </div>
        </div>

        {/* 快速统计 */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          {[
            { icon: BookOpen, label: '知识总数', value: docs.length, color: '#165DFF' },
            { icon: BarChart3, label: '成本分析', value: costDocs.length, color: '#7C3AED' },
            { icon: CalendarDays, label: '月度分析', value: monthlyDocs.length, color: '#10B981' },
            { icon: ClipboardList, label: '施工日志', value: logs.length, color: '#F59E0B' },
            { icon: AlertTriangle, label: '风险日志', value: riskLogs.length, color: '#F53F3F' },
          ].map((s, i) => (
            <div key={i} className="bg-white rounded-xl border border-[#E5E6EB] p-4">
              <s.icon className="h-5 w-5 mb-2" style={{ color: s.color }} />
              <p className="text-2xl font-bold text-[#1D2129]">{s.value}</p>
              <p className="text-xs text-[#86909C] mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* 知识分类网格 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {sections.map(s => (
            <Link key={s.key} href={`/knowledge?query=${encodeURIComponent(project.name + ' ' + s.label)}`}
              className="group bg-white rounded-xl border border-[#E5E6EB] p-4 transition-all hover:border-transparent hover:shadow-[0_4px_16px_rgba(22,93,255,0.08)] relative overflow-hidden"
            >
              <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${s.color}`} />
              <s.icon className="h-5 w-5 text-[#165DFF] mb-2 mt-1" />
              <p className="text-sm font-semibold text-[#1D2129] group-hover:text-[#165DFF]">{s.label}</p>
              <p className="text-xs text-[#86909C] mt-0.5">{s.desc}</p>
              <p className="text-xs text-[#165DFF] mt-2">
                {s.count > 0 ? `${s.count} 条相关` : '点击创建'}
              </p>
            </Link>
          ))}
        </div>

        {/* 月度分析列表 */}
        {monthlyDocs.length > 0 && (
          <section className="bg-white rounded-xl border border-[#E5E6EB] p-5 mb-5">
            <div className="flex items-center gap-2 mb-4">
              <CalendarDays className="h-5 w-5 text-[#10B981]" />
              <h2 className="text-base font-semibold text-[#1D2129]">月度分析 ({monthlyDocs.length})</h2>
            </div>
            <div className="space-y-3">
              {monthlyDocs.slice(0, 6).map(doc => {
                const tags = normalizeTags(doc.tags);
                const state = tags.find(t => t.startsWith('状态:'))?.replace('状态:', '') || '草稿';
                const stateColors: Record<string, string> = { '草稿': 'bg-[#F2F3F5] text-[#4E5969]', '待项目经理补充': 'bg-[#E8F3FF] text-[#165DFF]', '待预算确认': 'bg-[#F5EEFF] text-[#722ED1]', '待老板批复': 'bg-[#FFF7E8] text-[#D46B08]', '已完成': 'bg-[#E8FFEA] text-[#00A870]' };
                return (
                  <Link key={doc.id} href={`/knowledge/${doc.id}`} className="flex items-center justify-between p-3 rounded-lg border border-[#E5E6EB] hover:border-[#165DFF]/30 transition group">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[#1D2129] group-hover:text-[#165DFF] truncate">{doc.title}</p>
                      <p className="text-xs text-[#86909C] mt-0.5">{doc.created_by || '系统'} · {doc.created_at ? new Date(doc.created_at).toLocaleDateString('zh-CN') : ''}</p>
                    </div>
                    <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full ml-3 ${stateColors[state] || 'bg-[#F2F3F5] text-[#4E5969]'}`}>{state}</span>
                  </Link>
                );
              })}
              <Link href={`/knowledge?query=${project.name}`} className="block text-center text-xs text-[#165DFF] pt-2 hover:underline">
                查看全部知识 →
              </Link>
            </div>
          </section>
        )}

        {/* 施工日志 */}
        {logs.length > 0 && (
          <section className="bg-white rounded-xl border border-[#E5E6EB] p-5 mb-5">
            <div className="flex items-center gap-2 mb-4">
              <ClipboardList className="h-5 w-5 text-[#F59E0B]" />
              <h2 className="text-base font-semibold text-[#1D2129]">施工日志 ({logs.length})</h2>
            </div>
            <div className="space-y-2">
              {logs.slice(0, 5).map(log => (
                <div key={log.id} className="p-3 rounded-lg bg-[#F7F8FA] text-sm">
                  <div className="flex items-center gap-2 text-xs text-[#86909C] mb-1">
                    <span>{log.log_date}</span>
                    <span>{log.user_name}</span>
                    {log.location && <><span className="w-px h-3 bg-[#E5E6EB]" /><span>{log.location}</span></>}
                  </div>
                  <p className="text-[#4E5969]">{log.content}</p>
                  {log.risk_level && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${riskClass(log.risk_level)}`}>
                        {RISK_LEVEL_LABELS[log.risk_level]}风险
                      </span>
                      {(log.risk_types || []).slice(0, 3).map(type => (
                        <span key={type} className="rounded-full bg-white px-2 py-0.5 text-xs text-[#4E5969]">
                          {RISK_TYPE_LABELS[type] || type}
                        </span>
                      ))}
                      {log.risk_summary && <span className="text-xs text-[#86909C]">{log.risk_summary}</span>}
                    </div>
                  )}
                  {log.issues && <p className="text-xs text-[#F53F3F] mt-1">⚠️ {log.issues}</p>}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 空状态 */}
        {docs.length === 0 && logs.length === 0 && (
          <div className="bg-white rounded-xl border border-dashed border-[#E5E6EB] p-10 text-center">
            <BookOpen className="h-10 w-10 text-[#C9CDD4] mx-auto mb-3" />
            <p className="text-sm text-[#86909C] mb-4">该项目暂无知识记录</p>
            <Link href="/knowledge/new" className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#165DFF] px-4 text-sm text-white">
              创建第一条知识
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
