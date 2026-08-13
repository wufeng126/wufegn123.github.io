'use client';

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Bot,
  Building2,
  Calculator,
  CheckCircle2,
  ClipboardList,
  Database,
  FileSearch,
  FileText,
  ReceiptText,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Table2,
  UserRound,
  WalletCards,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

type Mode = 'salary' | 'contract';
type Tone = 'blue' | 'green' | 'amber' | 'red' | 'slate';

type Metric = {
  label: string;
  value: string;
  hint: string;
  tone: Tone;
};

type Action = {
  label: string;
  href: string;
  icon: LucideIcon;
};

const toneClass: Record<Tone, { soft: string; text: string; ring: string }> = {
  blue: { soft: 'bg-blue-50', text: 'text-blue-700', ring: 'ring-blue-100' },
  green: { soft: 'bg-emerald-50', text: 'text-emerald-700', ring: 'ring-emerald-100' },
  amber: { soft: 'bg-amber-50', text: 'text-amber-700', ring: 'ring-amber-100' },
  red: { soft: 'bg-rose-50', text: 'text-rose-700', ring: 'ring-rose-100' },
  slate: { soft: 'bg-slate-100', text: 'text-slate-700', ring: 'ring-slate-200' },
};

const modes: Array<{ key: Mode; label: string; desc: string; icon: LucideIcon }> = [
  {
    key: 'salary',
    label: '查询工人工资',
    desc: '告诉我工资明细、已发工资、未发余额',
    icon: WalletCards,
  },
  {
    key: 'contract',
    label: '查询合同清单',
    desc: '告诉我合同内清单、工作内容、单价口径',
    icon: ClipboardList,
  },
];

const quickQuestions: Record<Mode, string[]> = {
  salary: [
    '查询张建国在南京中交智慧港项目的工资',
    '张建国 2026 年 6 月到 8 月已发了多少钱',
    '这个工人还有多少工资没发',
    '把张建国的工资明细按月份列出来',
  ],
  contract: [
    '查询南京中交智慧港项目合同清单',
    '合同内模板工程包含哪些内容',
    '钢筋绑扎的合同单价和计量单位是什么',
    '这个项目合同里有没有地下室防水附加项',
  ],
};

const salaryMetrics: Metric[] = [
  { label: '累计应发', value: '18,800', hint: '2026-06 至 2026-08', tone: 'blue' },
  { label: '累计已发', value: '12,000', hint: '已匹配发放记录', tone: 'green' },
  { label: '未发余额', value: '6,800', hint: '需财务核对', tone: 'amber' },
];

const contractMetrics: Metric[] = [
  { label: '合同清单项', value: '42 项', hint: '已结构化入库', tone: 'blue' },
  { label: '已识别单价', value: '39 项', hint: '3 项需人工补录', tone: 'amber' },
  { label: '可直接检索', value: '工程量 / 单价', hint: '按项目和工序查询', tone: 'green' },
];

const salaryRows = [
  { month: '2026-06', project: '南京中交智慧港', work: '木工班组', payable: '6,200', paid: '6,200', unpaid: '0', status: '已发清' },
  { month: '2026-07', project: '南京中交智慧港', work: '木工班组', payable: '7,100', paid: '5,800', unpaid: '1,300', status: '部分发放' },
  { month: '2026-08', project: '南京中交智慧港', work: '木工班组', payable: '5,500', paid: '0', unpaid: '5,500', status: '未发放' },
];

const contractRows = [
  { item: '模板工程', unit: 'm2', price: '38.00', scope: '主体结构梁、板、柱模板安装、拆除、清理', remark: '合同内' },
  { item: '钢筋绑扎', unit: 't', price: '720.00', scope: '钢筋制作、绑扎、马凳筋及垫块配合', remark: '合同内' },
  { item: '混凝土浇筑', unit: 'm3', price: '42.00', scope: '泵管配合、振捣、收面、养护配合', remark: '合同内' },
  { item: '地下室防水附加加固', unit: '-', price: '-', scope: '合同清单未找到对应项，建议走签证或补充协议判断', remark: '疑似合同外' },
];

const actions: Record<Mode, Action[]> = {
  salary: [
    { label: '打开工资台账', href: '/workers/salaries', icon: Table2 },
    { label: '查看工人档案', href: '/workers/query', icon: UserRound },
    { label: '核对发放记录', href: '/workers/payments', icon: ReceiptText },
  ],
  contract: [
    { label: '打开项目合同', href: '/projects', icon: Building2 },
    { label: '查看知识库合同', href: '/knowledge', icon: Database },
    { label: '进入结算证据链', href: '/evidence-chain', icon: BadgeCheck },
  ],
};

const dataRules = [
  { title: '先查系统结构化数据', desc: '工资从工资表、发放记录、工人档案取数；合同清单从合同清单表和 AI 知识库取数。' },
  { title: '回答必须列明口径', desc: '工资要说明月份、项目、应发、已发、未发；合同要说明项目、清单项、单位、单价、工作内容。' },
  { title: '不确定时提示人工核对', desc: '扫描件、缺单价、重名工人、合同外项目，都不能硬答，要标出风险。' },
];

export default function AILaborAssistantPreviewPage() {
  const [mode, setMode] = useState<Mode>('salary');
  const active = useMemo(() => modes.find(item => item.key === mode) ?? modes[0], [mode]);
  const metrics = mode === 'salary' ? salaryMetrics : contractMetrics;
  const Icon = active.icon;

  return (
    <main className="min-h-screen bg-[#f3f6fa] text-slate-950">
      <div className="mx-auto max-w-[1440px] px-4 py-5 md:px-6">
        <header className="mb-5 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white">
                <Bot className="size-5" strokeWidth={1.8} />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-xl font-semibold">AI 劳务助手优化预览</h1>
                <p className="mt-1 text-sm text-slate-500">先把“查工人工资”和“查合同清单”做成可信、清楚、可核对的业务查询。</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {modes.map(item => {
                const ItemIcon = item.icon;
                const selected = item.key === mode;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setMode(item.key)}
                    className={[
                      'flex min-h-16 items-center gap-3 rounded-lg border px-4 text-left transition',
                      selected
                        ? 'border-blue-200 bg-blue-50 text-blue-800 shadow-sm'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
                    ].join(' ')}
                  >
                    <span className={['flex size-9 shrink-0 items-center justify-center rounded-md', selected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'].join(' ')}>
                      <ItemIcon className="size-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{item.label}</span>
                      <span className="block text-xs leading-5 text-slate-500">{item.desc}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </header>

        <section className="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)_320px]">
          <aside className="space-y-4">
            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Icon className="size-4 text-blue-600" />
                当前能力
              </div>
              <h2 className="mt-4 text-xl font-semibold">{active.label}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">{active.desc}</p>
              <button className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">
                <Send className="size-4" />
                发送示例问题
              </button>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 text-sm font-semibold">用户常问</div>
              <div className="space-y-2">
                {quickQuestions[mode].map(question => (
                  <button
                    key={question}
                    className="flex w-full items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-3 py-3 text-left text-sm text-slate-700 hover:border-blue-200 hover:bg-blue-50/60"
                  >
                    <span>{question}</span>
                    <ArrowRight className="size-4 shrink-0 text-slate-400" />
                  </button>
                ))}
              </div>
            </section>
          </aside>

          <section className="min-w-0 rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Sparkles className="size-4 text-blue-600" />
                    查询结果展示
                  </div>
                  <p className="mt-1 text-xs text-slate-500">用表格和明细回答，避免只输出一段文字。</p>
                </div>
                <div className="flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-500">
                  <Search className="size-4" />
                  {mode === 'salary' ? '搜索工人姓名 / 项目 / 月份' : '搜索项目 / 清单项 / 工序'}
                </div>
              </div>
            </div>

            <div className="space-y-4 p-5">
              <div className="flex justify-end">
                <div className="max-w-[86%] rounded-lg bg-blue-600 px-4 py-3 text-sm leading-6 text-white">
                  {quickQuestions[mode][0]}
                </div>
              </div>

              <div className="flex gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700 ring-1 ring-blue-100">
                  <Bot className="size-4" />
                </div>
                <article className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-[#fbfcfe] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-base font-semibold">
                      {mode === 'salary' ? '张建国工资查询结果' : '南京中交智慧港合同清单查询结果'}
                    </h3>
                    <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                      金额与单价需人工核对
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-7 text-slate-600">
                    {mode === 'salary'
                      ? '已按工人姓名、项目和月份匹配工资明细，并汇总应发、已发、未发金额。若存在重名工人，系统应优先提示选择身份证号或手机号核对。'
                      : '已从合同清单和合同知识库中提取清单项、计量单位、合同单价与工作内容。未在合同内找到的内容会标记为疑似合同外。'}
                  </p>

                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    {metrics.map(metric => (
                      <div key={metric.label} className={`rounded-md ${toneClass[metric.tone].soft} p-3 ring-1 ${toneClass[metric.tone].ring}`}>
                        <div className="text-xs text-slate-500">{metric.label}</div>
                        <div className={`mt-1 text-xl font-semibold ${toneClass[metric.tone].text}`}>{metric.value}</div>
                        <div className="mt-1 text-xs text-slate-500">{metric.hint}</div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-5 overflow-x-auto rounded-md border border-slate-200 bg-white">
                    {mode === 'salary' ? (
                      <table className="min-w-[720px] w-full text-sm">
                        <thead className="bg-slate-50 text-xs text-slate-500">
                          <tr>
                            <th className="px-3 py-3 text-left font-medium">月份</th>
                            <th className="px-3 py-3 text-left font-medium">项目</th>
                            <th className="px-3 py-3 text-left font-medium">班组/工种</th>
                            <th className="px-3 py-3 text-right font-medium">应发</th>
                            <th className="px-3 py-3 text-right font-medium">已发</th>
                            <th className="px-3 py-3 text-right font-medium">未发</th>
                            <th className="px-3 py-3 text-left font-medium">状态</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {salaryRows.map(row => (
                            <tr key={row.month}>
                              <td className="px-3 py-3">{row.month}</td>
                              <td className="px-3 py-3">{row.project}</td>
                              <td className="px-3 py-3">{row.work}</td>
                              <td className="px-3 py-3 text-right">{row.payable}</td>
                              <td className="px-3 py-3 text-right text-emerald-700">{row.paid}</td>
                              <td className="px-3 py-3 text-right text-amber-700">{row.unpaid}</td>
                              <td className="px-3 py-3">{row.status}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <table className="min-w-[760px] w-full text-sm">
                        <thead className="bg-slate-50 text-xs text-slate-500">
                          <tr>
                            <th className="px-3 py-3 text-left font-medium">清单项</th>
                            <th className="px-3 py-3 text-left font-medium">单位</th>
                            <th className="px-3 py-3 text-right font-medium">合同单价</th>
                            <th className="px-3 py-3 text-left font-medium">工作内容</th>
                            <th className="px-3 py-3 text-left font-medium">判断</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {contractRows.map(row => (
                            <tr key={row.item}>
                              <td className="px-3 py-3 font-medium">{row.item}</td>
                              <td className="px-3 py-3">{row.unit}</td>
                              <td className="px-3 py-3 text-right">{row.price}</td>
                              <td className="px-3 py-3 text-slate-600">{row.scope}</td>
                              <td className="px-3 py-3">{row.remark}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>

                  <div className="mt-4 rounded-md border border-slate-200 bg-white p-3">
                    <div className="mb-2 text-xs font-semibold text-slate-500">回答来源</div>
                    <div className="space-y-2">
                      {(mode === 'salary'
                        ? ['工人档案：张建国，木工班组', '工资台账：2026-06 至 2026-08', '工资发放记录：银行/现金发放记录']
                        : ['项目合同清单：南京中交智慧港', '合同附件/清单文件：已入库知识库', '结算证据链：用于判断疑似合同外内容']
                      ).map(source => (
                        <div key={source} className="flex items-start gap-2 text-sm text-slate-600">
                          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                          <span>{source}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {actions[mode].map(action => {
                      const ActionIcon = action.icon;
                      return (
                        <a
                          key={action.label}
                          href={action.href}
                          className="inline-flex h-10 items-center gap-2 rounded-md border border-blue-200 bg-white px-3 text-sm font-medium text-blue-700 hover:bg-blue-50"
                        >
                          <ActionIcon className="size-4" />
                          {action.label}
                        </a>
                      );
                    })}
                  </div>
                </article>
              </div>
            </div>

            <div className="border-t border-slate-200 p-4">
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
                <input
                  className="min-w-0 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-slate-400"
                  placeholder={mode === 'salary' ? '例如：查询张建国 7 月工资发了多少' : '例如：查询模板工程合同单价和内容'}
                />
                <button className="flex size-9 items-center justify-center rounded-md bg-blue-600 text-white hover:bg-blue-700" aria-label="发送">
                  <Send className="size-4" />
                </button>
              </div>
            </div>
          </section>

          <aside className="space-y-4">
            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <ShieldCheck className="size-4 text-blue-600" />
                落地规则
              </div>
              <div className="space-y-3">
                {dataRules.map(rule => (
                  <div key={rule.title} className="rounded-md bg-slate-50 p-3">
                    <div className="text-sm font-semibold">{rule.title}</div>
                    <div className="mt-1 text-xs leading-5 text-slate-500">{rule.desc}</div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <FileSearch className="size-4 text-blue-600" />
                查询前需要确认
              </div>
              <div className="space-y-3 text-sm text-slate-600">
                <div className="flex gap-2">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
                  工资查询遇到重名工人时，必须让用户选择手机号或身份证尾号。
                </div>
                <div className="flex gap-2">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
                  合同扫描件识别不完整时，要显示“未识别完整”，不能编造清单。
                </div>
                <div className="flex gap-2">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
                  金额、单价、已发工资都要能点回原始记录核对。
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <Calculator className="size-4 text-blue-600" />
                后续可扩展
              </div>
              <div className="space-y-2">
                {['查询某项目所有工人工资', '查询某供应商合同与结算', '查询合同外工作是否应走签证', '按项目生成经营问答摘要'].map(item => (
                  <div key={item} className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-600">
                    <FileText className="size-4 text-slate-400" />
                    {item}
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </section>
      </div>
    </main>
  );
}
