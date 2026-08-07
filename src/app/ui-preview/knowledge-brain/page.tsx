'use client';

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookOpenCheck,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  FileText,
  HandCoins,
  HardHat,
  Landmark,
  Layers3,
  LibraryBig,
  Lightbulb,
  Search,
  ShieldAlert,
  Sparkles,
  Tags,
  UsersRound,
} from 'lucide-react';

type ExperienceCategory =
  | '投标报价经验'
  | '施工管理经验'
  | '成本控制经验'
  | '签证结算经验'
  | '供应商班组经验'
  | '风险教训'
  | '制度流程经验';

type KnowledgeItem = {
  id: number;
  title: string;
  category: ExperienceCategory;
  source: string;
  sourceType: 'AI萃取' | '人工编写' | '月报复盘';
  confidence: number;
  summary: string;
  scenario: string;
  actions: string[];
  evidence: string[];
  updatedAt: string;
  usedCount: number;
  owner: string;
};

const categoryMeta: Record<ExperienceCategory, {
  icon: typeof BriefcaseBusiness;
  tone: string;
  dot: string;
  desc: string;
}> = {
  投标报价经验: {
    icon: BriefcaseBusiness,
    tone: 'bg-blue-50 text-blue-700 ring-blue-100',
    dot: 'bg-blue-500',
    desc: '新项目测算、报价策略、历史单价提醒',
  },
  施工管理经验: {
    icon: HardHat,
    tone: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    dot: 'bg-emerald-500',
    desc: '现场组织、进度安排、质量安全做法',
  },
  成本控制经验: {
    icon: HandCoins,
    tone: 'bg-amber-50 text-amber-700 ring-amber-100',
    dot: 'bg-amber-500',
    desc: '人工、材料、辅材、机械成本异常复盘',
  },
  签证结算经验: {
    icon: ClipboardCheck,
    tone: 'bg-violet-50 text-violet-700 ring-violet-100',
    dot: 'bg-violet-500',
    desc: '签证资料、甲方确认、结算争议处理',
  },
  供应商班组经验: {
    icon: UsersRound,
    tone: 'bg-cyan-50 text-cyan-700 ring-cyan-100',
    dot: 'bg-cyan-500',
    desc: '供应商履约、班组效率、分账经验',
  },
  风险教训: {
    icon: ShieldAlert,
    tone: 'bg-rose-50 text-rose-700 ring-rose-100',
    dot: 'bg-rose-500',
    desc: '项目风险、踩坑记录、提前预警',
  },
  制度流程经验: {
    icon: Landmark,
    tone: 'bg-slate-100 text-slate-700 ring-slate-200',
    dot: 'bg-slate-500',
    desc: '内部流程、审批节点、标准动作',
  },
};

const categories = Object.keys(categoryMeta) as ExperienceCategory[];

const knowledgeItems: KnowledgeItem[] = [
  {
    id: 1,
    title: '模板工程报价需先确认是否包含材料租赁与周转损耗',
    category: '投标报价经验',
    source: '历史中标清单 + 班组结算复盘',
    sourceType: 'AI萃取',
    confidence: 92,
    summary: '同样叫“模板工程”，不同甲方清单口径差异较大。有的含钢化租赁、辅材和周转损耗，有的只是清包人工，投标前必须拆清计价边界。',
    scenario: '新项目投标测算、模板类清单报价、历史单价引用前',
    actions: [
      '导入报价清单后，系统先提示是否含材料，再匹配历史中标单价。',
      '如果本次报价含材料，应同步查看最近项目模板周转损耗和辅材消耗。',
      '报价说明中写清“是否含钢化租赁、方木、扣件、辅材及倒运”。',
    ],
    evidence: [
      '南京中交智慧港项目模板清单中标单价高于上次 8.6%，备注显示含周转材料。',
      '太原南站配套工程班组结算只记录清包人工，不能直接作为含材料报价参考。',
    ],
    updatedAt: '2026-07-22',
    usedCount: 18,
    owner: '预算部',
  },
  {
    id: 2,
    title: '地下室收口阶段辅材差异容易影响结算确认',
    category: '成本控制经验',
    source: '施工日志 + 零星材料 + 供应商结算',
    sourceType: 'AI萃取',
    confidence: 88,
    summary: '地下室修补、打磨、堵漏、材料整理等内容容易在对上清单中没有独立项，但会在对下结算和零星材料中持续发生，需单独关注金额累积。',
    scenario: '地下室收口、修补打磨、辅材消耗偏高、对下结算前',
    actions: [
      '月度分析中单独列出内部附加清单金额，不参与工程量差异，只参与金额差异。',
      '当零星材料连续 3 天集中在同一项目时，提醒预算员复盘是否应形成签证或内部控制项。',
      '对下结算前查看“内部附加清单”累计金额，避免漏控。',
    ],
    evidence: [
      '太原南站配套工程 7 月辅材验收出现数量差异，供应商需复核。',
      '多个项目日志中反复出现修补打磨、材料整理，但合同清单无对应工序。',
    ],
    updatedAt: '2026-07-21',
    usedCount: 11,
    owner: '成本中心',
  },
  {
    id: 3,
    title: '签证线下签字周期超过 7 天应主动提醒项目经理推进',
    category: '签证结算经验',
    source: '签证流程台账',
    sourceType: '人工编写',
    confidence: 96,
    summary: '签证真正的卡点不在系统审批，而在甲方工程部与商务线下确认。系统应记录状态并提醒负责人，而不是替代线下流程。',
    scenario: '现场新增签证、甲方工程部签字、甲方商务确认、计入结算确认',
    actions: [
      '预算员提交签证时选择项目经理为负责人。',
      '已提交超过 7 天未变更为已签字时，提醒项目经理推进。',
      '项目经理上传最新签字附件时完全替换原附件，避免版本混乱。',
      '商务确认后推送预算员，由预算员确认计入结算后最终完成。',
    ],
    evidence: [
      '签证流程配置已明确：预算员发起，项目经理办理，预算员最终确认。',
      '线下附件版本替换比多版本叠加更适合当前公司流程。',
    ],
    updatedAt: '2026-07-19',
    usedCount: 23,
    owner: '经营部',
  },
  {
    id: 4,
    title: '施工日志内容人数与勾选出勤人员不一致时必须拦截',
    category: '风险教训',
    source: '施工日志风险池',
    sourceType: 'AI萃取',
    confidence: 90,
    summary: '日志文字中写“3人出勤”，但实际勾选 2 人或 4 人，会直接影响人员出勤统计和人工成本分析，应在提交前提醒并禁止提交。',
    scenario: '现场人员提交施工日志、拍照识别后人工确认、人员出勤统计',
    actions: [
      '识别施工内容中的人数表达，与已选出勤人数自动比对。',
      '不一致时提示具体差异，让填报人先修正文字或出勤人员。',
      '默认工时为 10 小时，允许按人员单独改小数工时。',
    ],
    evidence: [
      '施工日志已接入人员出勤与工时统计。',
      '人员出勤统计用于项目月份工人总工时汇总。',
    ],
    updatedAt: '2026-07-23',
    usedCount: 9,
    owner: '施工管理',
  },
  {
    id: 5,
    title: '班组结算应同时看工程量台账和人员分账明细',
    category: '供应商班组经验',
    source: '班组管理需求复盘',
    sourceType: '月报复盘',
    confidence: 86,
    summary: '班组结算不是单纯金额录入。上半部分要记录结算内容、工程量、单价和合计，下半部分要结合花名册与施工日志考勤形成分账明细。',
    scenario: '班组结算、工人分账、项目人工成本归集',
    actions: [
      '结算单必须归属项目和班组。',
      '选择工人后自动带出结算周期内出勤总工时。',
      '分账金额按出勤工时乘以手动填写单价计算。',
      '台账显示已结算工程量，详情页支持打印下载。',
    ],
    evidence: [
      '施工日志考勤周期统一为上月 26 日到本月 25 日。',
      '班组成本已并入现有经营分析成本口径。',
    ],
    updatedAt: '2026-07-20',
    usedCount: 15,
    owner: '预算部',
  },
  {
    id: 6,
    title: '月度分析应沉淀“原因 + 动作”，不要只保留数据结论',
    category: '施工管理经验',
    source: '月度分析复盘',
    sourceType: '月报复盘',
    confidence: 84,
    summary: '月报中的产值、成本和风险数字只是结果，更有价值的是造成偏差的原因，以及下个月要采取的动作。',
    scenario: '月度分析提交、项目经理确认、老板查看经营情况',
    actions: [
      'AI 萃取时把“本月问题”拆成原因、影响、建议动作。',
      '对重复出现的问题生成风险教训，进入知识库台账。',
      '预算员可修改或删除自己负责项目产生的经验。',
    ],
    evidence: [
      '月度分析已有流转状态和撤回机制。',
      '知识库需保留人工写知识与自动沉淀经验两类来源。',
    ],
    updatedAt: '2026-07-18',
    usedCount: 7,
    owner: '项目管理',
  },
];

const stats = [
  { label: '经验总数', value: '286', note: '自动沉淀 214 条', icon: LibraryBig, tone: 'bg-blue-50 text-blue-700 ring-blue-100' },
  { label: '本月新增', value: '37', note: '月报复盘贡献 12 条', icon: Sparkles, tone: 'bg-emerald-50 text-emerald-700 ring-emerald-100' },
  { label: '投标调用', value: '68', note: '近 30 天引用次数', icon: BriefcaseBusiness, tone: 'bg-violet-50 text-violet-700 ring-violet-100' },
  { label: '风险提醒', value: '19', note: '来自历史经验匹配', icon: AlertTriangle, tone: 'bg-rose-50 text-rose-700 ring-rose-100' },
];

export default function KnowledgeBrainPreviewPage() {
  const [activeCategory, setActiveCategory] = useState<ExperienceCategory | '全部'>('全部');
  const [selectedId, setSelectedId] = useState(knowledgeItems[0].id);
  const [keyword, setKeyword] = useState('');

  const filteredItems = useMemo(() => {
    const normalized = keyword.trim().toLowerCase();
    return knowledgeItems.filter(item => {
      const categoryMatched = activeCategory === '全部' || item.category === activeCategory;
      const keywordMatched = !normalized || [
        item.title,
        item.summary,
        item.scenario,
        item.source,
        item.owner,
        ...item.actions,
        ...item.evidence,
      ].some(value => value.toLowerCase().includes(normalized));
      return categoryMatched && keywordMatched;
    });
  }, [activeCategory, keyword]);

  const selectedItem = filteredItems.find(item => item.id === selectedId) || filteredItems[0] || knowledgeItems[0];

  return (
    <main className="min-h-screen bg-[#f6f7f9] text-slate-950">
      <div className="mx-auto max-w-[1440px] px-4 py-5 md:px-6 lg:px-8">
        <header className="mb-5 flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-md bg-white px-3 py-2 text-xs font-medium text-blue-700 ring-1 ring-blue-100">
              <BookOpenCheck className="h-4 w-4" />
              公司经验大脑预览
            </div>
            <h1 className="text-2xl font-semibold tracking-normal text-slate-950 md:text-3xl">知识库经验台账</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              系统自动从施工日志、月报、签证、成本、班组结算中提炼经验，同时保留员工人工编写的知识，形成可检索、可修改、可删除、可复用的公司经验库。
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <FileText className="h-4 w-4" />
              写知识
            </button>
            <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-blue-700">
              <Sparkles className="h-4 w-4" />
              萃取经验
            </button>
          </div>
        </header>

        <section className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map(item => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm text-slate-500">{item.label}</p>
                    <p className="mt-2 text-3xl font-semibold tabular-nums text-slate-950">{item.value}</p>
                  </div>
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg ring-1 ${item.tone}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                </div>
                <p className="mt-3 text-xs text-slate-500">{item.note}</p>
              </div>
            );
          })}
        </section>

        <section className="mb-5 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={keyword}
                onChange={event => setKeyword(event.target.value)}
                placeholder="搜索经验、场景、问题、清单项，比如：模板、签证、辅材、班组"
                className="h-11 w-full rounded-md border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none transition focus:border-blue-500 focus:bg-white"
              />
            </div>
            <div className="flex shrink-0 items-center gap-2 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-500">
              <Tags className="h-4 w-4" />
              标签后台自动生成，前台不强制填写
            </div>
          </div>
        </section>

        <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)_360px]">
          <aside className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm lg:sticky lg:top-5 lg:self-start">
            <button
              type="button"
              onClick={() => setActiveCategory('全部')}
              className={[
                'mb-2 flex w-full items-center justify-between rounded-md px-3 py-3 text-left text-sm transition',
                activeCategory === '全部' ? 'bg-slate-950 text-white' : 'text-slate-700 hover:bg-slate-50',
              ].join(' ')}
            >
              <span className="inline-flex items-center gap-2">
                <Layers3 className="h-4 w-4" />
                全部经验
              </span>
              <span>{knowledgeItems.length}</span>
            </button>

            <div className="space-y-1">
              {categories.map(category => {
                const meta = categoryMeta[category];
                const Icon = meta.icon;
                const count = knowledgeItems.filter(item => item.category === category).length;
                return (
                  <button
                    key={category}
                    type="button"
                    onClick={() => setActiveCategory(category)}
                    className={[
                      'flex w-full items-start gap-3 rounded-md px-3 py-3 text-left transition',
                      activeCategory === category ? 'bg-blue-50 ring-1 ring-blue-100' : 'hover:bg-slate-50',
                    ].join(' ')}
                  >
                    <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md ring-1 ${meta.tone}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-slate-900">{category}</span>
                        <span className="text-xs text-slate-400">{count}</span>
                      </div>
                      <p className="mt-1 text-xs leading-5 text-slate-500">{meta.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="min-w-0 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-950">经验台账</h2>
                <p className="mt-1 text-xs text-slate-500">按经验类型归类，默认展示最值得复用的管理结论。</p>
              </div>
              <div className="rounded-md bg-white px-3 py-2 text-xs text-slate-500 ring-1 ring-slate-200">
                {filteredItems.length} 条结果
              </div>
            </div>

            {filteredItems.map(item => {
              const meta = categoryMeta[item.category];
              const selected = item.id === selectedItem.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  className={[
                    'w-full rounded-lg border bg-white p-4 text-left shadow-sm transition hover:border-blue-200 hover:shadow-md',
                    selected ? 'border-blue-300 ring-2 ring-blue-100' : 'border-slate-200',
                  ].join(' ')}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span className={`inline-flex rounded-md px-2 py-1 text-xs font-medium ring-1 ${meta.tone}`}>
                          {item.category}
                        </span>
                        <span className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600">{item.sourceType}</span>
                        <span className="rounded-md bg-white px-2 py-1 text-xs text-slate-500 ring-1 ring-slate-200">可信度 {item.confidence}%</span>
                      </div>
                      <h3 className="text-base font-semibold leading-6 text-slate-950">{item.title}</h3>
                      <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">{item.summary}</p>
                    </div>
                    <ChevronRight className="hidden h-5 w-5 shrink-0 text-slate-400 sm:block" />
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500">
                    <span>来源：{item.source}</span>
                    <span>负责人：{item.owner}</span>
                    <span>更新：{item.updatedAt}</span>
                    <span>调用：{item.usedCount} 次</span>
                  </div>
                </button>
              );
            })}
          </section>

          <aside className="rounded-lg border border-slate-200 bg-white shadow-sm lg:sticky lg:top-5 lg:self-start">
            <div className="border-b border-slate-100 p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className={`inline-flex rounded-md px-2 py-1 text-xs font-medium ring-1 ${categoryMeta[selectedItem.category].tone}`}>
                  {selectedItem.category}
                </span>
                <span className="text-xs text-slate-500">{selectedItem.sourceType}</span>
              </div>
              <h2 className="text-lg font-semibold leading-7 text-slate-950">{selectedItem.title}</h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">{selectedItem.summary}</p>
            </div>

            <div className="space-y-5 p-5">
              <section>
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Lightbulb className="h-4 w-4 text-amber-600" />
                  适用场景
                </div>
                <p className="rounded-md bg-amber-50 p-3 text-sm leading-6 text-amber-900 ring-1 ring-amber-100">{selectedItem.scenario}</p>
              </section>

              <section>
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  建议动作
                </div>
                <div className="space-y-2">
                  {selectedItem.actions.map((action, index) => (
                    <div key={action} className="flex gap-2 rounded-md bg-slate-50 p-3 text-sm leading-6 text-slate-700">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-700">{index + 1}</span>
                      <span>{action}</span>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Building2 className="h-4 w-4 text-blue-600" />
                  来源依据
                </div>
                <div className="space-y-2">
                  {selectedItem.evidence.map(item => (
                    <p key={item} className="rounded-md border border-slate-200 bg-white p-3 text-sm leading-6 text-slate-600">{item}</p>
                  ))}
                </div>
              </section>

              <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-4">
                <button className="h-10 rounded-md border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50">编辑</button>
                <button className="h-10 rounded-md border border-rose-200 bg-white text-sm font-medium text-rose-600 hover:bg-rose-50">删除</button>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
