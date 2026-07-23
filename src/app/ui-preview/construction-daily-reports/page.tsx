'use client';

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarDays,
  ChevronDown,
  ClipboardList,
  Clock3,
  CloudSun,
  HardHat,
  Image as ImageIcon,
  Layers3,
  MapPin,
  ShieldCheck,
  Sparkles,
  Truck,
  UsersRound,
} from 'lucide-react';

type ProjectTone = 'steady' | 'attention' | 'risk';

type DailyProject = {
  id: number;
  name: string;
  location: string;
  tone: ProjectTone;
  status: string;
  summary: string;
  progress: string[];
  labor: string;
  materials: string;
  qualitySafety: string;
  risks: string[];
  tomorrow: string[];
  photos: string[];
};

const readStats = {
  read: 18,
  total: 42,
};

const projects: DailyProject[] = [
  {
    id: 1,
    name: '南京中交智慧港项目',
    location: '南京市江宁区',
    tone: 'attention',
    status: '主体施工',
    summary: '昨日以地下室负一层模板加固、二层梁板钢筋绑扎和材料周转为主，整体进度正常，模板周转略紧。',
    progress: [
      '地下室负一层模板加固完成约 680 平方米，梁侧模复核完成。',
      '二层梁板钢筋绑扎完成 72%，水电预埋同步穿插施工。',
      '现场完成甲方质量巡查整改 3 项，剩余 1 项今日复核。',
    ],
    labor: '木工班组 18 人，钢筋班组 14 人，水电预埋 6 人，现场管理 3 人，合计出勤约 410 工时。',
    materials: '模板、方木、扣件周转偏紧，钢筋原材满足今日施工，汽车吊配合吊运 4 小时。',
    qualitySafety: '临边防护已补齐，梁底支撑局部间距已按要求调整，未发现重大安全隐患。',
    risks: ['模板材料周转紧张，如今日下午未补足，可能影响明日二层东区铺设。'],
    tomorrow: ['完成二层梁板钢筋绑扎收尾。', '安排模板材料进场并复核东区支撑体系。'],
    photos: ['模板加固', '梁板钢筋', '材料堆场'],
  },
  {
    id: 2,
    name: '晋中东城商业综合体',
    location: '晋中市榆次区',
    tone: 'steady',
    status: '二次结构',
    summary: '昨日砌筑、抹灰和材料清理同步推进，现场作业面衔接较顺，暂无明显进度风险。',
    progress: [
      '三层东区砌筑完成约 46 立方米。',
      '一层公共区域修补打磨完成 80%。',
      '材料堆场完成分区整理，通道恢复畅通。',
    ],
    labor: '砌筑班组 12 人，抹灰修补 8 人，杂工 5 人，合计出勤约 250 工时。',
    materials: '砂浆、砌块库存满足两日用量，小型机具运转正常。',
    qualitySafety: '文明施工整改已完成，甲方巡查未提出新增问题。',
    risks: [],
    tomorrow: ['继续推进三层西区砌筑。', '完成一层公共区域修补打磨收口。'],
    photos: ['砌筑完成面', '修补打磨', '文明施工'],
  },
  {
    id: 3,
    name: '太原南站配套工程',
    location: '太原市小店区',
    tone: 'risk',
    status: '装饰收口',
    summary: '昨日重点处理地下室负一层墙面收口和辅材验收，辅材数量存在差异，需要预算和现场共同复核。',
    progress: [
      '负一层墙面修补完成 320 平方米。',
      '材料进场验收完成 2 批次。',
      '消防通道清理完成，具备后续穿插条件。',
    ],
    labor: '修补打磨 9 人，材料整理 4 人，管理 2 人，合计出勤约 150 工时。',
    materials: '腻子、网格布已进场，部分扣件数量与送货单不一致，已要求供应商复核。',
    qualitySafety: '地下室照明已增设临电保护，材料堆放仍需保持通道宽度。',
    risks: ['辅材数量差异可能影响后续结算确认。', '地下室潮湿区域需关注成品保护。'],
    tomorrow: ['预算员复核辅材数量差异。', '继续推进负一层墙面收口。'],
    photos: ['辅材验收', '地下室收口', '通道清理'],
  },
  {
    id: 4,
    name: '榆次学校改造项目',
    location: '晋中市榆次区',
    tone: 'steady',
    status: '维修改造',
    summary: '昨日外墙修补与教室内墙基层处理按计划推进，现场作业面较分散，但整体完成情况平稳。',
    progress: [
      '教学楼东侧外墙修补完成 210 平方米。',
      '二层教室基层处理完成 6 间。',
      '甲方现场确认新增修补点位 4 处。',
    ],
    labor: '外墙修补 7 人，室内基层 6 人，杂工 3 人，合计出勤约 160 工时。',
    materials: '砂浆、界面剂库存正常，脚手架局部调整完成。',
    qualitySafety: '高处作业安全带佩戴情况正常，脚手架连墙件已复查。',
    risks: [],
    tomorrow: ['继续教学楼南侧外墙修补。', '整理新增点位签证资料。'],
    photos: ['外墙修补', '教室基层', '脚手架复查'],
  },
];

const toneMeta: Record<ProjectTone, { label: string; className: string; marker: string }> = {
  steady: {
    label: '正常推进',
    className: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    marker: 'border-l-emerald-500',
  },
  attention: {
    label: '需要关注',
    className: 'bg-amber-50 text-amber-700 ring-amber-100',
    marker: 'border-l-amber-500',
  },
  risk: {
    label: '重点跟进',
    className: 'bg-rose-50 text-rose-700 ring-rose-100',
    marker: 'border-l-rose-500',
  },
};

const companyHighlights = [
  '昨日 4 个项目均有施工动态，主体、二次结构、装饰收口和维修改造同步推进。',
  '南京中交智慧港项目进度正常，但模板周转需要今日优先协调。',
  '太原南站配套工程发现辅材数量差异，建议预算与现场共同复核。',
  '榆次学校改造项目出现新增修补点位，应同步整理签证依据。',
];

const focusItems = [
  { label: '项目覆盖', value: '4 个', note: '昨日有施工动态', icon: Layers3, tone: 'bg-blue-50 text-blue-700 ring-blue-100' },
  { label: '现场出勤', value: '970 工时', note: '按日志考勤汇总', icon: UsersRound, tone: 'bg-emerald-50 text-emerald-700 ring-emerald-100' },
  { label: '材料机械', value: '2 项', note: '需关注供应与核量', icon: Truck, tone: 'bg-violet-50 text-violet-700 ring-violet-100' },
  { label: '风险提醒', value: '3 条', note: '材料、结算、成品保护', icon: AlertTriangle, tone: 'bg-rose-50 text-rose-700 ring-rose-100' },
];

function ProjectCard({ project, defaultOpen }: { project: DailyProject; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  const meta = toneMeta[project.tone];

  return (
    <article className={`overflow-hidden rounded-lg border border-slate-200 border-l-4 ${meta.marker} bg-white shadow-sm`}>
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        className="flex w-full items-start justify-between gap-3 px-4 py-4 text-left hover:bg-slate-50 sm:px-5"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-slate-950">{project.name}</h3>
            <span className={`inline-flex rounded-md px-2 py-1 text-xs font-medium ring-1 ${meta.className}`}>{meta.label}</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{project.location}</span>
            <span className="inline-flex items-center gap-1"><HardHat className="h-3.5 w-3.5" />{project.status}</span>
          </div>
          <p className="mt-3 max-w-5xl text-sm leading-6 text-slate-700">{project.summary}</p>
        </div>
        <ChevronDown className={`mt-1 h-5 w-5 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open ? (
        <div className="border-t border-slate-100 px-4 py-4 sm:px-5">
          <div className="grid gap-3 lg:grid-cols-2">
            <section className="rounded-lg bg-slate-50 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
                <ClipboardList className="h-4 w-4 text-blue-600" />施工进展
              </div>
              <ul className="space-y-2 text-sm leading-6 text-slate-700">
                {project.progress.map(item => <li key={item}>- {item}</li>)}
              </ul>
            </section>

            <section className="rounded-lg bg-slate-50 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
                <UsersRound className="h-4 w-4 text-emerald-600" />人员情况
              </div>
              <p className="text-sm leading-6 text-slate-700">{project.labor}</p>
            </section>

            <section className="rounded-lg bg-slate-50 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Truck className="h-4 w-4 text-violet-600" />材料机械
              </div>
              <p className="text-sm leading-6 text-slate-700">{project.materials}</p>
            </section>

            <section className="rounded-lg bg-slate-50 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
                <ShieldCheck className="h-4 w-4 text-cyan-600" />质量安全
              </div>
              <p className="text-sm leading-6 text-slate-700">{project.qualitySafety}</p>
            </section>
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_1fr]">
            <section className={project.risks.length ? 'rounded-lg border border-amber-100 bg-amber-50 p-4' : 'rounded-lg bg-slate-50 p-4'}>
              <div className={project.risks.length ? 'mb-3 flex items-center gap-2 text-sm font-semibold text-amber-800' : 'mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900'}>
                <AlertTriangle className="h-4 w-4" />风险与提醒
              </div>
              {project.risks.length ? (
                <ul className="space-y-2 text-sm leading-6 text-amber-900">
                  {project.risks.map(item => <li key={item}>- {item}</li>)}
                </ul>
              ) : (
                <p className="text-sm leading-6 text-slate-600">暂无明显风险，按计划跟进即可。</p>
              )}
            </section>

            <section className="rounded-lg bg-slate-50 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Clock3 className="h-4 w-4 text-blue-600" />明日计划
              </div>
              <ul className="space-y-2 text-sm leading-6 text-slate-700">
                {project.tomorrow.map(item => <li key={item}>- {item}</li>)}
              </ul>
            </section>
          </div>

          <section className="mt-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
              <ImageIcon className="h-4 w-4 text-slate-500" />现场照片
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {project.photos.map((photo, index) => (
                <div key={photo} className="flex aspect-[16/9] items-end rounded-lg bg-gradient-to-br from-slate-200 via-slate-100 to-white p-3 ring-1 ring-slate-200">
                  <span className="rounded-md bg-white/90 px-2 py-1 text-xs font-medium text-slate-700 shadow-sm">
                    {index + 1}. {photo}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </article>
  );
}

export default function ConstructionDailyReportsPreviewPage() {
  const [date, setDate] = useState('2026-07-23');
  const riskProjects = useMemo(() => projects.filter(project => project.tone !== 'steady'), []);

  return (
    <main className="min-h-screen bg-[#f6f7f9] text-slate-950">
      <div className="mx-auto max-w-[1360px] space-y-5 p-3 sm:p-4 md:p-6">
        <header className="rounded-lg border border-slate-200 bg-white px-4 py-4 shadow-sm sm:px-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-md bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 ring-1 ring-blue-100">
                <Sparkles className="h-3.5 w-3.5" />AI 萃取日报
              </div>
              <h1 className="text-2xl font-semibold tracking-normal sm:text-3xl">项目日报汇总</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                先看公司整体情况，再展开单个项目查看施工进展、资源投入、风险提醒和明日计划。页面面向所有员工阅读，不展示提交统计和人员名单。
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <div className="inline-flex h-10 items-center rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-sm font-semibold text-emerald-700">
                已阅 {readStats.read}/{readStats.total} 人
              </div>
              <label className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700">
                <CalendarDays className="h-4 w-4 text-blue-600" />
                <input
                  type="date"
                  value={date}
                  onChange={event => setDate(event.target.value)}
                  className="bg-transparent outline-none"
                />
              </label>
              <button className="inline-flex h-10 items-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-medium text-white">
                查看正式日报
                <ArrowUpRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {focusItems.map(item => {
            const Icon = item.icon;
            return (
              <article key={item.label} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-lg ring-1 ${item.tone}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="text-xs font-medium text-slate-500">{item.label}</div>
                <div className="mt-2 text-2xl font-semibold tabular-nums text-slate-950">{item.value}</div>
                <div className="mt-1 text-xs text-slate-500">{item.note}</div>
              </article>
            );
          })}
        </section>

        <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="mb-3 flex items-center gap-2">
              <CloudSun className="h-5 w-5 text-blue-600" />
              <h2 className="text-base font-semibold">公司昨日项目总览</h2>
            </div>
            <p className="text-sm leading-7 text-slate-700">
              昨日公司项目整体推进平稳，主体施工、二次结构、装饰收口和维修改造均有进展。南京中交智慧港项目主体作业面推进正常，但模板周转需要今日重点协调；太原南站配套工程辅材数量存在差异，应及时复核，避免后续结算偏差。其他项目未发现重大质量安全问题。
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {companyHighlights.map(item => (
                <div key={item} className="rounded-lg bg-slate-50 px-3 py-3 text-sm leading-6 text-slate-700">
                  {item}
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="mb-3 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              <h2 className="text-base font-semibold">今日优先关注</h2>
            </div>
            <div className="space-y-3">
              {riskProjects.map(project => (
                <div key={project.id} className="rounded-lg border border-amber-100 bg-amber-50 p-3">
                  <div className="font-medium text-amber-900">{project.name}</div>
                  <p className="mt-1 text-sm leading-6 text-amber-800">{project.risks.join(' ')}</p>
                </div>
              ))}
            </div>
          </article>
        </section>

        <section className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold">单项目日报</h2>
              <p className="mt-1 text-sm text-slate-500">默认展开需要关注的项目，其他项目可点击查看详情。</p>
            </div>
            <div className="text-xs text-slate-500">按风险优先排序</div>
          </div>

          {projects
            .slice()
            .sort((a, b) => {
              const score = { risk: 0, attention: 1, steady: 2 };
              return score[a.tone] - score[b.tone];
            })
            .map(project => (
              <ProjectCard key={project.id} project={project} defaultOpen={project.tone !== 'steady'} />
            ))}
        </section>
      </div>
    </main>
  );
}
