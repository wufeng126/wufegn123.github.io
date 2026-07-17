import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  BarChart3,
  BriefcaseBusiness,
  Building2,
  CalendarClock,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  HandCoins,
  Landmark,
  ReceiptText,
  Users,
  WalletCards,
} from 'lucide-react';

type Metric = {
  label: string;
  value: string;
  note: string;
  icon: LucideIcon;
  tone: string;
};

type ProjectReceivable = {
  name: string;
  status: string;
  ratio: string;
  settlement: number;
  receivable: number;
  received: number;
  unpaid: number;
  retention: number;
  aging: string;
  risk: string;
  riskTone: string;
};

type DetailCard = {
  title: string;
  desc: string;
  icon: LucideIcon;
  primary: string;
  secondary: string;
  tone: string;
};

type TrendItem = {
  name: string;
  value: string;
  delta: string;
  positive: boolean;
};

const metrics: Metric[] = [
  {
    label: '累计产值结算',
    value: '8,642 万',
    note: '来自项目产值结算数据',
    icon: ReceiptText,
    tone: 'bg-blue-50 text-blue-700 ring-blue-100',
  },
  {
    label: '按合同应收',
    value: '6,918 万',
    note: '按项目状态付款比例计算',
    icon: Landmark,
    tone: 'bg-cyan-50 text-cyan-700 ring-cyan-100',
  },
  {
    label: '已收甲方回款',
    value: '5,286 万',
    note: '资金分析回款台账汇总',
    icon: Banknote,
    tone: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  },
  {
    label: '应收未收',
    value: '1,632 万',
    note: '其中超期 486 万',
    icon: AlertTriangle,
    tone: 'bg-amber-50 text-amber-700 ring-amber-100',
  },
  {
    label: '供应商未付',
    value: '732 万',
    note: '材料、机械、分包结算未付',
    icon: HandCoins,
    tone: 'bg-violet-50 text-violet-700 ring-violet-100',
  },
  {
    label: '工人工资未付',
    value: '318 万',
    note: '工资核算已确认未发放',
    icon: Users,
    tone: 'bg-rose-50 text-rose-700 ring-rose-100',
  },
];

const projectRows: ProjectReceivable[] = [
  {
    name: '滨河商业综合体',
    status: '在建',
    ratio: '80%',
    settlement: 2140,
    receivable: 1712,
    received: 1518,
    unpaid: 194,
    retention: 0,
    aging: '28 天',
    risk: '正常跟进',
    riskTone: 'bg-emerald-50 text-emerald-700',
  },
  {
    name: '城东学校改扩建',
    status: '已完工',
    ratio: '97%',
    settlement: 1860,
    receivable: 1804,
    received: 1480,
    unpaid: 324,
    retention: 56,
    aging: '质保到期 18 个月',
    risk: '超期应收',
    riskTone: 'bg-rose-50 text-rose-700',
  },
  {
    name: '高新区厂房二标',
    status: '竣工结算',
    ratio: '95%',
    settlement: 1520,
    receivable: 1444,
    received: 1260,
    unpaid: 184,
    retention: 76,
    aging: '96 天',
    risk: '需催收',
    riskTone: 'bg-amber-50 text-amber-700',
  },
  {
    name: '西环安置房一期',
    status: '在建',
    ratio: '75%',
    settlement: 3122,
    receivable: 2342,
    received: 1028,
    unpaid: 1314,
    retention: 0,
    aging: '42 天',
    risk: '回款偏慢',
    riskTone: 'bg-orange-50 text-orange-700',
  },
];

const detailCards: DetailCard[] = [
  {
    title: '人工成本',
    desc: '按项目查看应付工资、已发工资、未发工资和当月用工变化。',
    icon: Users,
    primary: '应付 1,286 万',
    secondary: '未发 318 万',
    tone: 'bg-rose-50 text-rose-700 ring-rose-100',
  },
  {
    title: '供应商成本',
    desc: '按供应商、费用类型和项目归集结算额、付款额、未付额。',
    icon: BriefcaseBusiness,
    primary: '累计结算 2,468 万',
    secondary: '未付 732 万',
    tone: 'bg-violet-50 text-violet-700 ring-violet-100',
  },
  {
    title: '资金分析',
    desc: '统一看甲方回款、应收账期、供应商付款和工资发放压力。',
    icon: WalletCards,
    primary: '净现金差 582 万',
    secondary: '超期应收 486 万',
    tone: 'bg-cyan-50 text-cyan-700 ring-cyan-100',
  },
  {
    title: '成本利润中心',
    desc: '保留现有逻辑和入口，不在本轮预览中改变原功能。',
    icon: BarChart3,
    primary: '保持不变',
    secondary: '沿用现有页面',
    tone: 'bg-slate-100 text-slate-700 ring-slate-200',
  },
];

const trendItems: TrendItem[] = [
  { name: '本月结算额', value: '624 万', delta: '+12.8%', positive: true },
  { name: '本月回款额', value: '418 万', delta: '-6.4%', positive: false },
  { name: '新增未收款', value: '206 万', delta: '+18.2%', positive: false },
  { name: '已付款项', value: '352 万', delta: '+4.5%', positive: true },
];

function currency(value: number) {
  return `${value.toLocaleString('zh-CN')} 万`;
}

function ProgressBar({
  label,
  value,
  total,
  color,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
}) {
  const width = Math.max(4, Math.min(100, Math.round((value / total) * 100)));

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-4 text-xs text-slate-500">
        <span>{label}</span>
        <span className="font-medium text-slate-700">{currency(value)}</span>
      </div>
      <div className="h-2 rounded-full bg-slate-100">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

export default function BusinessAnalysisPreviewPage() {
  const totalReceivable = 6918;
  const totalReceived = 5286;
  const totalUnpaid = 1632;
  const totalPayable = 3604;
  const totalPaid = 2554;
  const totalPayableUnpaid = 1050;

  return (
    <main className="min-h-screen bg-[#f6f7f9] text-slate-950">
      <div className="mx-auto max-w-[1480px] px-4 py-5 md:px-6 lg:px-8">
        <header className="mb-5 flex flex-col gap-4 rounded-lg border border-slate-200 bg-white px-5 py-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
              <Building2 className="h-3.5 w-3.5" />
              经营分析预览
            </div>
            <h1 className="text-2xl font-semibold tracking-normal text-slate-950">公司经营总览</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
              先把老板每天最关心的收款、付款、账期和项目风险放在一个总览里，再下钻到人工成本、供应商成本和资金分析。
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4 lg:w-[620px]">
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="whitespace-nowrap text-xs text-slate-500">当前口径</div>
              <div className="mt-1 whitespace-nowrap font-semibold">按项目状态</div>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="whitespace-nowrap text-xs text-slate-500">付款比例</div>
              <div className="mt-1 whitespace-nowrap font-semibold">档案维护</div>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="whitespace-nowrap text-xs text-slate-500">结算来源</div>
              <div className="mt-1 whitespace-nowrap font-semibold">产值结算</div>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="whitespace-nowrap text-xs text-slate-500">质保账期</div>
              <div className="mt-1 whitespace-nowrap font-semibold">到期起算</div>
            </div>
          </div>
        </header>

        <section className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
          {metrics.map(item => {
            const Icon = item.icon;
            return (
              <article key={item.label} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg ring-1 ${item.tone}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                </div>
                <div className="text-xs font-medium text-slate-500">{item.label}</div>
                <div className="mt-2 text-2xl font-semibold tabular-nums text-slate-950">{item.value}</div>
                <div className="mt-2 min-h-[36px] text-xs leading-5 text-slate-500">{item.note}</div>
              </article>
            );
          })}
        </section>

        <section className="mt-5 rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="text-base font-semibold">项目应收台账</h2>
              <p className="mt-1 text-xs text-slate-500">老板先看项目整体，再点进项目查看产值结算、回款记录、质保金和账期明细。</p>
            </div>
            <button className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm">
              查看全部项目
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[1080px] w-full border-collapse text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-medium">项目名称</th>
                  <th className="px-4 py-3 font-medium">状态</th>
                  <th className="px-4 py-3 font-medium">付款比例</th>
                  <th className="px-4 py-3 text-right font-medium">产值结算</th>
                  <th className="px-4 py-3 text-right font-medium">按比例应收</th>
                  <th className="px-4 py-3 text-right font-medium">已收</th>
                  <th className="px-4 py-3 text-right font-medium">未收</th>
                  <th className="px-4 py-3 text-right font-medium">质保金</th>
                  <th className="px-4 py-3 font-medium">应收账期</th>
                  <th className="px-5 py-3 font-medium">风险</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {projectRows.map(row => (
                  <tr key={row.name} className="hover:bg-slate-50">
                    <td className="px-5 py-4 font-medium text-slate-950">{row.name}</td>
                    <td className="px-4 py-4 text-slate-600">{row.status}</td>
                    <td className="px-4 py-4 text-slate-600">{row.ratio}</td>
                    <td className="px-4 py-4 text-right tabular-nums">{currency(row.settlement)}</td>
                    <td className="px-4 py-4 text-right tabular-nums">{currency(row.receivable)}</td>
                    <td className="px-4 py-4 text-right tabular-nums text-emerald-700">{currency(row.received)}</td>
                    <td className="px-4 py-4 text-right tabular-nums text-amber-700">{currency(row.unpaid)}</td>
                    <td className="px-4 py-4 text-right tabular-nums">{currency(row.retention)}</td>
                    <td className="px-4 py-4 text-slate-600">{row.aging}</td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex rounded-md px-2 py-1 text-xs font-medium ${row.riskTone}`}>{row.risk}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-5 grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
          <article className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div>
                <h2 className="text-base font-semibold">收付款结构</h2>
                <p className="mt-1 text-xs text-slate-500">用同一个口径看公司该收多少、已收多少，以及还需要对外支付多少。</p>
              </div>
              <div className="inline-flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
                <CalendarClock className="h-4 w-4" />
                超期应收 486 万
              </div>
            </div>
            <div className="grid gap-6 p-5 lg:grid-cols-2">
              <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
                <div className="mb-4 flex items-center justify-between">
                  <div className="font-semibold">甲方应收</div>
                  <div className="text-xs text-slate-500">按合同付款比例</div>
                </div>
                <div className="space-y-4">
                  <ProgressBar label="按比例应收" value={totalReceivable} total={totalReceivable} color="bg-cyan-500" />
                  <ProgressBar label="已收回款" value={totalReceived} total={totalReceivable} color="bg-emerald-500" />
                  <ProgressBar label="应收未收" value={totalUnpaid} total={totalReceivable} color="bg-amber-500" />
                </div>
              </div>
              <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
                <div className="mb-4 flex items-center justify-between">
                  <div className="font-semibold">对外应付</div>
                  <div className="text-xs text-slate-500">供应商 + 工资</div>
                </div>
                <div className="space-y-4">
                  <ProgressBar label="累计应付" value={totalPayable} total={totalPayable} color="bg-violet-500" />
                  <ProgressBar label="已付款项" value={totalPaid} total={totalPayable} color="bg-blue-500" />
                  <ProgressBar label="应付未付" value={totalPayableUnpaid} total={totalPayable} color="bg-rose-500" />
                </div>
              </div>
            </div>
          </article>

          <article className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-base font-semibold">本月经营变化</h2>
              <p className="mt-1 text-xs text-slate-500">总览不替代明细，只负责告诉老板哪里需要看。</p>
            </div>
            <div className="grid gap-3 p-5 sm:grid-cols-2">
              {trendItems.map(item => (
                <div key={item.name} className="rounded-lg border border-slate-100 bg-slate-50 p-4">
                  <div className="text-xs text-slate-500">{item.name}</div>
                  <div className="mt-2 flex items-end justify-between gap-3">
                    <div className="text-xl font-semibold tabular-nums">{item.value}</div>
                    <div
                      className={[
                        'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium',
                        item.positive ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700',
                      ].join(' ')}
                    >
                      {item.positive ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                      {item.delta}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </article>
        </section>

        <section className="mt-5 grid gap-4 lg:grid-cols-4">
          {detailCards.map(card => {
            const Icon = card.icon;
            return (
              <article key={card.title} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg ring-1 ${card.tone}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-400" />
                </div>
                <h3 className="text-base font-semibold">{card.title}</h3>
                <p className="mt-2 min-h-[60px] text-sm leading-6 text-slate-500">{card.desc}</p>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <div className="rounded-md bg-slate-50 px-3 py-2">
                    <div className="text-[11px] text-slate-500">核心指标</div>
                    <div className="mt-1 text-sm font-semibold">{card.primary}</div>
                  </div>
                  <div className="rounded-md bg-slate-50 px-3 py-2">
                    <div className="text-[11px] text-slate-500">需要关注</div>
                    <div className="mt-1 text-sm font-semibold">{card.secondary}</div>
                  </div>
                </div>
              </article>
            );
          })}
        </section>

      </div>
    </main>
  );
}
