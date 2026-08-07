'use client';

import { useMemo, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  BookOpenCheck,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  FileCheck2,
  FileText,
  HandCoins,
  HardHat,
  MessageSquareText,
  ReceiptText,
  ShieldCheck,
  UserRoundCheck,
} from 'lucide-react';

type RoleKey = 'site' | 'budget' | 'manager' | 'boss';
type NoticeKind = 'todo' | 'risk' | 'result' | 'copy';
type Tone = 'blue' | 'emerald' | 'amber' | 'rose' | 'violet' | 'slate';

type NoticeItem = {
  id: number;
  role: RoleKey;
  kind: NoticeKind;
  title: string;
  project: string;
  summary: string;
  owner: string;
  deadline?: string;
  amount?: string;
  action: string;
  href: string;
  icon: LucideIcon;
};

const roles: { key: RoleKey; label: string; desc: string }[] = [
  { key: 'site', label: '现场人员', desc: '只看本人日志、工资查询、项目日报等高频事项' },
  { key: 'budget', label: '预算员', desc: '聚焦报量、签证、结算证据链、经营风险' },
  { key: 'manager', label: '项目经理', desc: '聚焦现场日志、签证推进、班组确认和日报风险' },
  { key: 'boss', label: '老板', desc: '只看经营结果、关键风险和需要确认的事项' },
];

const kindMeta: Record<NoticeKind, { label: string; desc: string; tone: Tone; icon: LucideIcon }> = {
  todo: {
    label: '待办',
    desc: '需要我处理，进入工作台待办',
    tone: 'blue',
    icon: ClipboardCheck,
  },
  risk: {
    label: '风险',
    desc: '需要关注或确认，进入风险提醒',
    tone: 'rose',
    icon: AlertTriangle,
  },
  result: {
    label: '结果',
    desc: '告知处理结果，进入消息记录',
    tone: 'emerald',
    icon: CheckCircle2,
  },
  copy: {
    label: '抄送',
    desc: '只需知晓，不挤占待办',
    tone: 'slate',
    icon: MessageSquareText,
  },
};

const notices: NoticeItem[] = [
  {
    id: 1,
    role: 'site',
    kind: 'todo',
    title: '今日施工日志待提交',
    project: '南京中交智慧港项目',
    summary: '昨日日志已保存为待提交，请在 20:00 前补充照片并提交。',
    owner: '张师傅',
    deadline: '今天 20:00',
    action: '去提交日志',
    href: '/construction-logs/new?project_id=12',
    icon: FileText,
  },
  {
    id: 2,
    role: 'budget',
    kind: 'risk',
    title: '少报多结风险',
    project: '南京中交智慧港项目',
    summary: '模板工程对下累计结算高于对上报量 86,000 元，需要核对原因。',
    owner: '预算员王工',
    amount: '86,000 元',
    action: '打开报量管理',
    href: '/project-center?tab=quantity-reporting&project_id=12',
    icon: ReceiptText,
  },
  {
    id: 3,
    role: 'budget',
    kind: 'todo',
    title: '签证超过 7 天未推进',
    project: '滨河商业综合体二标',
    summary: '地下室返工签证仍停留在待甲方签字，需要补充处理结果。',
    owner: '预算员李工',
    deadline: '逾期 2 天',
    amount: '42,500 元',
    action: '进入签证单',
    href: '/visas?todo=mine&visa_id=45',
    icon: FileCheck2,
  },
  {
    id: 4,
    role: 'manager',
    kind: 'todo',
    title: '班组结算待确认',
    project: '南京中交智慧港项目',
    summary: '模板班组本期结算已由预算员录入，需要项目经理确认工程量。',
    owner: '赵经理',
    amount: '126,300 元',
    action: '查看结算单',
    href: '/team-management/settlements/28',
    icon: UserRoundCheck,
  },
  {
    id: 5,
    role: 'manager',
    kind: 'risk',
    title: '日报风险提醒',
    project: '南京中交智慧港项目',
    summary: '昨日三层钢筋绑扎出勤减少，日报判断可能影响后续模板安装。',
    owner: '赵经理',
    action: '查看项目日报',
    href: '/construction-logs?tab=daily-reports&date=2026-08-04',
    icon: AlertTriangle,
  },
  {
    id: 6,
    role: 'boss',
    kind: 'risk',
    title: '项目回款账期超期',
    project: '城东学校改扩建项目',
    summary: '质保期满后仍有应收未回款，建议本周安排催收。',
    owner: '老板',
    deadline: '超期 428 天',
    amount: '642,000 元',
    action: '查看应收台账',
    href: '/business-analysis?tab=fund-management&project_id=8',
    icon: HandCoins,
  },
  {
    id: 7,
    role: 'boss',
    kind: 'result',
    title: '月度经营分析已提交',
    project: '公司经营月报',
    summary: '8 月经营月报已由预算部提交，等待老板最终确认。',
    owner: '预算部',
    action: '查看月报',
    href: '/reports/monthly?status=pending',
    icon: BriefcaseBusiness,
  },
  {
    id: 8,
    role: 'budget',
    kind: 'copy',
    title: '项目日报已生成',
    project: '公司项目日报',
    summary: '今日 12:00 项目日报已自动推送，已阅 18/42 人。',
    owner: '系统',
    action: '查看日报',
    href: '/construction-logs?tab=daily-reports',
    icon: BookOpenCheck,
  },
];

function toneClass(tone: Tone, strong = false) {
  const map: Record<Tone, string> = {
    blue: strong ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-700 ring-blue-100',
    emerald: strong ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    amber: strong ? 'bg-amber-500 text-white' : 'bg-amber-50 text-amber-700 ring-amber-100',
    rose: strong ? 'bg-rose-600 text-white' : 'bg-rose-50 text-rose-700 ring-rose-100',
    violet: strong ? 'bg-violet-600 text-white' : 'bg-violet-50 text-violet-700 ring-violet-100',
    slate: strong ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-700 ring-slate-200',
  };
  return map[tone];
}

function kindBorder(kind: NoticeKind) {
  const map: Record<NoticeKind, string> = {
    todo: 'border-l-blue-500',
    risk: 'border-l-rose-500',
    result: 'border-l-emerald-500',
    copy: 'border-l-slate-300',
  };
  return map[kind];
}

export default function NotificationClosurePreviewPage() {
  const [roleKey, setRoleKey] = useState<RoleKey>('budget');
  const [activeId, setActiveId] = useState(2);
  const activeRole = roles.find((role) => role.key === roleKey) || roles[1];
  const filteredNotices = useMemo(() => notices.filter((item) => item.role === roleKey), [roleKey]);
  const activeNotice = notices.find((item) => item.id === activeId && item.role === roleKey) || filteredNotices[0] || notices[0];
  const stats = useMemo(
    () =>
      Object.entries(kindMeta).map(([kind, meta]) => ({
        kind: kind as NoticeKind,
        ...meta,
        count: notices.filter((item) => item.kind === kind && item.role === roleKey).length,
      })),
    [roleKey],
  );

  return (
    <main className="min-h-screen bg-[#f6f7f9] text-slate-950">
      <div className="mx-auto flex max-w-[1480px] flex-col gap-4 px-4 py-5 md:px-6">
        <header className="rounded-lg border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-md bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 ring-1 ring-blue-100">
                <BellRing className="h-3.5 w-3.5" />
                钉钉通知与工作台闭环预览
              </div>
              <h1 className="mt-3 text-2xl font-semibold tracking-normal">消息先分类，再进入对应待办</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                每条自动消息都带项目、金额或责任人摘要；待办进入工作台，风险进入风险池，结果和抄送只做提醒，点击后直接定位业务页。
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex">
              {roles.map((role) => (
                <button
                  key={role.key}
                  onClick={() => {
                    setRoleKey(role.key);
                    setActiveId(notices.find((item) => item.role === role.key)?.id || activeId);
                  }}
                  className={`h-9 rounded-md border px-3 text-sm font-medium transition ${
                    roleKey === role.key ? 'border-slate-950 bg-slate-950 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {role.label}
                </button>
              ))}
            </div>
          </div>
        </header>

        <section className="grid gap-3 md:grid-cols-4">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <article key={stat.kind} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg ring-1 ${toneClass(stat.tone)}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className="text-2xl font-semibold text-slate-950">{stat.count}</span>
                </div>
                <h2 className="mt-3 text-base font-semibold">{stat.label}</h2>
                <p className="mt-1 text-sm leading-5 text-slate-500">{stat.desc}</p>
              </article>
            );
          })}
        </section>

        <section className="grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)_380px]">
          <aside className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="font-semibold">{activeRole.label}工作台待办</h2>
              <p className="mt-1 text-sm leading-5 text-slate-500">{activeRole.desc}</p>
            </div>
            <div className="divide-y divide-slate-100">
              {filteredNotices.map((item) => {
                const meta = kindMeta[item.kind];
                const Icon = item.icon;
                const active = item.id === activeNotice.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveId(item.id)}
                    className={`flex w-full gap-3 border-l-4 px-4 py-4 text-left transition hover:bg-slate-50 ${kindBorder(item.kind)} ${
                      active ? 'bg-blue-50/50' : 'bg-white'
                    }`}
                  >
                    <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1 ${toneClass(meta.tone)}`}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-slate-950">{item.title}</span>
                        <span className={`rounded-md px-2 py-0.5 text-xs font-medium ring-1 ${toneClass(meta.tone)}`}>{meta.label}</span>
                      </span>
                      <span className="mt-1 block text-xs text-slate-500">{item.project}</span>
                      <span className="mt-2 block text-sm leading-5 text-slate-600">{item.summary}</span>
                    </span>
                    <ChevronRight className={`mt-1 h-4 w-4 shrink-0 text-slate-400 ${active ? 'text-blue-600' : ''}`} />
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div>
                <h2 className="font-semibold">业务落点</h2>
                <p className="mt-1 text-sm text-slate-500">用户点开通知后，页面自动筛选、展开或打开对应详情。</p>
              </div>
              <span className={`rounded-md px-2.5 py-1 text-xs font-medium ring-1 ${toneClass(kindMeta[activeNotice.kind].tone)}`}>
                {kindMeta[activeNotice.kind].label}
              </span>
            </div>

            <div className="p-5">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-sm text-slate-500">当前定位到</p>
                    <h3 className="mt-1 text-xl font-semibold">{activeNotice.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{activeNotice.summary}</p>
                  </div>
                  <button className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-medium text-white">
                    {activeNotice.action}
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-5 grid gap-3 md:grid-cols-3">
                  <div className="rounded-lg bg-white p-3 ring-1 ring-slate-200">
                    <p className="text-xs text-slate-500">项目/对象</p>
                    <p className="mt-1 truncate text-sm font-semibold">{activeNotice.project}</p>
                  </div>
                  <div className="rounded-lg bg-white p-3 ring-1 ring-slate-200">
                    <p className="text-xs text-slate-500">责任人</p>
                    <p className="mt-1 truncate text-sm font-semibold">{activeNotice.owner}</p>
                  </div>
                  <div className="rounded-lg bg-white p-3 ring-1 ring-slate-200">
                    <p className="text-xs text-slate-500">{activeNotice.amount ? '金额摘要' : '时间要求'}</p>
                    <p className="mt-1 truncate text-sm font-semibold">{activeNotice.amount || activeNotice.deadline || '无需处理'}</p>
                  </div>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                {[
                  { title: '1. 消息进入', desc: '钉钉消息和系统通知同时生成，消息带业务摘要。' },
                  { title: '2. 工作台归类', desc: '待办、风险、结果、抄送按角色进入对应区域。' },
                  { title: '3. 业务定位', desc: '链接带业务参数，打开后直接定位到记录或筛选条件。' },
                ].map((item) => (
                  <div key={item.title} className="rounded-lg border border-slate-200 bg-white p-4">
                    <p className="text-sm font-semibold">{item.title}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-500">{item.desc}</p>
                  </div>
                ))}
              </div>

              <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
                <p className="text-sm font-semibold">跳转地址示例</p>
                <p className="mt-2 break-all rounded-md bg-slate-950 px-3 py-2 font-mono text-xs text-white">{activeNotice.href}&notification_id=1024</p>
              </div>
            </div>
          </section>

          <aside className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="font-semibold">钉钉消息样式</h2>
              <p className="mt-1 text-sm text-slate-500">每条消息短一点，但必须说清楚“谁、哪个项目、什么金额、点哪处理”。</p>
            </div>
            <div className="p-4">
              <div className="rounded-lg border border-slate-200 bg-[#f7f8fa] p-3">
                <div className="rounded-lg bg-white p-4 shadow-sm">
                  <div className="flex items-center gap-2">
                    <span className={`flex h-8 w-8 items-center justify-center rounded-md ${toneClass(kindMeta[activeNotice.kind].tone, true)}`}>
                      <BellRing className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold">{activeNotice.title}</p>
                      <p className="text-xs text-slate-500">建筑劳务管理系统</p>
                    </div>
                  </div>
                  <div className="mt-4 space-y-2 text-sm leading-6 text-slate-700">
                    <p>项目：{activeNotice.project}</p>
                    <p>责任人：{activeNotice.owner}</p>
                    {activeNotice.amount ? <p>金额：{activeNotice.amount}</p> : null}
                    {activeNotice.deadline ? <p>时间：{activeNotice.deadline}</p> : null}
                    <p>摘要：{activeNotice.summary}</p>
                  </div>
                  <button className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-md bg-blue-600 text-sm font-medium text-white">
                    {activeNotice.action}
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="mt-4 rounded-lg border border-emerald-100 bg-emerald-50 p-4">
                <div className="flex gap-2 text-sm font-medium text-emerald-800">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>预期效果</span>
                </div>
                <p className="mt-2 text-sm leading-6 text-emerald-900">
                  现场人员打开就是能办的事；预算员和项目经理看到自己负责项目的待办；老板只看到经营风险和确认事项。
                </p>
              </div>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
