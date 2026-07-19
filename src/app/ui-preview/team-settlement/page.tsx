import {
  BarChart3,
  BookOpen,
  Building2,
  Calculator,
  ChevronDown,
  ClipboardList,
  FileSpreadsheet,
  HardHat,
  Home,
  Menu,
  Plus,
  ReceiptText,
  Search,
  Settings,
  Users,
  WalletCards,
} from 'lucide-react';

const navItems = [
  { name: '工作台', icon: Home },
  { name: '项目管理', icon: Building2 },
  { name: '施工管理', icon: ClipboardList },
  { name: '人力资源', icon: Users },
  { name: '供应商与费用', icon: ReceiptText },
  { name: '班组结算', icon: FileSpreadsheet, active: true },
  { name: '经营分析', icon: BarChart3 },
  { name: '投标测算', icon: Calculator },
  { name: '知识库', icon: BookOpen },
  { name: '系统管理', icon: Settings },
];

const teamRows = [
  { name: '木工一班', project: 'A 项目', leader: '刘建国', phone: '138****2581', workType: '木工', status: '在场', settled: '3 次' },
  { name: '钢筋二班', project: 'A 项目', leader: '王立强', phone: '139****7832', workType: '钢筋工', status: '在场', settled: '2 次' },
  { name: '泥工班', project: 'B 项目', leader: '赵师傅', phone: '137****9021', workType: '泥工', status: '在场', settled: '1 次' },
];

const quantityRows = [
  { content: '地下室模板安装', unit: 'm2', quantity: 1860, price: 42, settledBefore: 5200 },
  { content: '支撑架搭拆', unit: 'm3', quantity: 930, price: 18, settledBefore: 3120 },
  { content: '零星修补打磨', unit: '工时', quantity: 74, price: 55, settledBefore: 180 },
];

const splitRows = [
  { name: '张三', workType: '木工', idCard: '210***4218', hours: 182.5, price: 38 },
  { name: '李四', workType: '木工', idCard: '210***1976', hours: 176, price: 38 },
  { name: '王五', workType: '木工', idCard: '210***3341', hours: 151.5, price: 40 },
  { name: '赵六', workType: '辅助工', idCard: '210***8830', hours: 88, price: 30 },
];

function money(value: number) {
  return `¥${value.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function numberText(value: number) {
  return value.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
}

export default function TeamSettlementPreviewPage() {
  const quantityTotal = quantityRows.reduce((sum, row) => sum + row.quantity * row.price, 0);
  const splitTotal = splitRows.reduce((sum, row) => sum + row.hours * row.price, 0);
  const totalHours = splitRows.reduce((sum, row) => sum + row.hours, 0);

  return (
    <main className="min-h-screen bg-[#f4f6fa] text-[#1d2129]">
      <div className="flex min-h-screen">
        <aside className="hidden w-[248px] shrink-0 border-r border-[#e5e8ef] bg-white lg:flex lg:flex-col">
          <div className="flex h-16 items-center gap-3 border-b border-[#eef0f5] px-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#165dff] text-white">
              <HardHat className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">建筑劳务管理</div>
              <div className="text-xs text-[#86909c]">Business Console</div>
            </div>
          </div>
          <nav className="flex-1 space-y-1 px-3 py-4">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.name}
                  className={[
                    'flex h-10 items-center gap-3 rounded-md px-3 text-sm',
                    item.active
                      ? 'bg-[#e8f3ff] font-medium text-[#165dff] ring-1 ring-[#cfe3ff]'
                      : 'text-[#4e5969] hover:bg-[#f7f8fb]',
                  ].join(' ')}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.name}</span>
                </div>
              );
            })}
          </nav>
        </aside>

        <section className="min-w-0 flex-1">
          <header className="sticky top-0 z-10 border-b border-[#e5e8ef] bg-white/95 backdrop-blur">
            <div className="flex h-16 items-center gap-3 px-4 md:px-6">
              <button
                className="flex h-10 w-10 items-center justify-center rounded-md border border-[#e5e8ef] bg-white lg:hidden"
                aria-label="打开菜单"
              >
                <Menu className="h-5 w-5" />
              </button>
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-lg font-semibold">班组结算</h1>
                <p className="truncate text-xs text-[#86909c]">
                  班组档案、结算工程量、人员分账和施工日志考勤统一管理
                </p>
              </div>
              <button className="hidden h-9 items-center gap-2 rounded-md bg-[#165dff] px-4 text-sm font-medium text-white md:flex">
                <Plus className="h-4 w-4" />
                新建结算单
              </button>
            </div>
          </header>

          <div className="mx-auto max-w-[1480px] space-y-5 p-4 md:p-6">
            <section className="grid gap-3 md:grid-cols-4">
              {[
                { label: '本月结算金额', value: money(quantityTotal), note: '结算周期 06-26 至 07-25' },
                { label: '分账明细金额', value: money(splitTotal), note: `差额 ${money(quantityTotal - splitTotal)}` },
                { label: '已建班组档案', value: '18 个', note: '按项目归属管理' },
                { label: '本月涉及人员', value: '42 人', note: '来自花名册在场人员' },
              ].map((item) => (
                <div key={item.label} className="rounded-lg border border-[#e5e8ef] bg-white p-4 shadow-sm">
                  <div className="text-xs text-[#86909c]">{item.label}</div>
                  <div className="mt-2 text-2xl font-semibold tracking-normal text-[#1d2129]">{item.value}</div>
                  <div className="mt-1 text-xs text-[#4e5969]">{item.note}</div>
                </div>
              ))}
            </section>

            <section className="rounded-lg border border-[#e5e8ef] bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#eef0f5] px-4 py-3">
                <div>
                  <h2 className="text-base font-semibold">班组档案</h2>
                  <p className="mt-1 text-xs text-[#86909c]">班组必须归属到具体项目，结算时先选项目再选班组。</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button className="h-9 rounded-md border border-[#e5e8ef] bg-white px-3 text-sm text-[#4e5969]">全部项目</button>
                  <button className="h-9 rounded-md bg-[#165dff] px-3 text-sm font-medium text-white">新增班组</button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="bg-[#f7f8fb] text-left text-xs font-medium text-[#86909c]">
                    <tr>
                      <th className="px-4 py-3">班组名称</th>
                      <th className="px-4 py-3">所属项目</th>
                      <th className="px-4 py-3">负责人</th>
                      <th className="px-4 py-3">联系电话</th>
                      <th className="px-4 py-3">工种</th>
                      <th className="px-4 py-3">状态</th>
                      <th className="px-4 py-3 text-right">结算次数</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#eef0f5]">
                    {teamRows.map((row) => (
                      <tr key={row.name} className="hover:bg-[#fafbff]">
                        <td className="px-4 py-3 font-medium text-[#1d2129]">{row.name}</td>
                        <td className="px-4 py-3 text-[#4e5969]">{row.project}</td>
                        <td className="px-4 py-3 text-[#4e5969]">{row.leader}</td>
                        <td className="px-4 py-3 text-[#4e5969]">{row.phone}</td>
                        <td className="px-4 py-3 text-[#4e5969]">{row.workType}</td>
                        <td className="px-4 py-3">
                          <span className="rounded-md bg-[#e8ffea] px-2 py-1 text-xs font-medium text-[#00a870]">{row.status}</span>
                        </td>
                        <td className="px-4 py-3 text-right text-[#4e5969]">{row.settled}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-lg border border-[#e5e8ef] bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#eef0f5] px-4 py-3">
                <div>
                  <h2 className="text-base font-semibold">新建班组结算单</h2>
                  <p className="mt-1 text-xs text-[#86909c]">
                    上半部分录结算工程量，下半部分按花名册选择人员，并自动带出施工日志考勤总工时。
                  </p>
                </div>
                <div className="rounded-md bg-[#fff7e8] px-3 py-2 text-xs font-medium text-[#d46b08]">
                  统计周期：2026-06-26 至 2026-07-25
                </div>
              </div>

              <div className="grid gap-3 border-b border-[#eef0f5] p-4 md:grid-cols-4">
                {[
                  { label: '项目', value: 'A 项目' },
                  { label: '班组', value: '木工一班' },
                  { label: '结算月份', value: '2026-07' },
                  { label: '工种筛选', value: '木工' },
                ].map((item) => (
                  <label key={item.label} className="block">
                    <span className="mb-1 block text-xs font-medium text-[#86909c]">{item.label}</span>
                    <div className="flex h-10 items-center justify-between rounded-md border border-[#dfe3eb] bg-white px-3 text-sm text-[#1d2129]">
                      {item.value}
                      <ChevronDown className="h-4 w-4 text-[#86909c]" />
                    </div>
                  </label>
                ))}
              </div>

              <div className="p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold">结算工程量</h3>
                    <p className="mt-1 text-xs text-[#86909c]">单独录入结算内容、工程量、单价，系统累计统计已结算工程量。</p>
                  </div>
                  <button className="h-8 rounded-md border border-[#dfe3eb] px-3 text-xs font-medium text-[#165dff]">新增结算内容</button>
                </div>
                <div className="overflow-x-auto rounded-md border border-[#eef0f5]">
                  <table className="w-full min-w-[840px] text-sm">
                    <thead className="bg-[#f7f8fb] text-left text-xs font-medium text-[#86909c]">
                      <tr>
                        <th className="px-3 py-3">结算内容</th>
                        <th className="px-3 py-3">单位</th>
                        <th className="px-3 py-3 text-right">本次工程量</th>
                        <th className="px-3 py-3 text-right">结算单价</th>
                        <th className="px-3 py-3 text-right">本次合计</th>
                        <th className="px-3 py-3 text-right">已结算工程量</th>
                        <th className="px-3 py-3 text-right">累计结算量</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#eef0f5]">
                      {quantityRows.map((row) => (
                        <tr key={row.content}>
                          <td className="px-3 py-3 font-medium">{row.content}</td>
                          <td className="px-3 py-3 text-[#4e5969]">{row.unit}</td>
                          <td className="px-3 py-3 text-right tabular-nums">{numberText(row.quantity)}</td>
                          <td className="px-3 py-3 text-right tabular-nums">{money(row.price)}</td>
                          <td className="px-3 py-3 text-right font-medium tabular-nums">{money(row.quantity * row.price)}</td>
                          <td className="px-3 py-3 text-right text-[#4e5969] tabular-nums">{numberText(row.settledBefore)}</td>
                          <td className="px-3 py-3 text-right text-[#165dff] tabular-nums">{numberText(row.settledBefore + row.quantity)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-[#fafbff] text-sm font-semibold">
                      <tr>
                        <td className="px-3 py-3" colSpan={4}>结算工程量合计</td>
                        <td className="px-3 py-3 text-right tabular-nums">{money(quantityTotal)}</td>
                        <td className="px-3 py-3" colSpan={2}></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              <div className="border-t border-[#eef0f5] p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold">分账明细</h3>
                    <p className="mt-1 text-xs text-[#86909c]">
                      人员来自当前项目花名册在场人员；选择人员后自动汇总 06-26 至 07-25 的施工日志考勤工时。
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <div className="flex h-8 items-center gap-2 rounded-md border border-[#dfe3eb] px-2 text-xs text-[#86909c]">
                      <Search className="h-3.5 w-3.5" />
                      搜索姓名/身份证
                    </div>
                    <button className="h-8 rounded-md border border-[#dfe3eb] px-3 text-xs font-medium text-[#165dff]">选择工人</button>
                  </div>
                </div>
                <div className="overflow-x-auto rounded-md border border-[#eef0f5]">
                  <table className="w-full min-w-[840px] text-sm">
                    <thead className="bg-[#f7f8fb] text-left text-xs font-medium text-[#86909c]">
                      <tr>
                        <th className="px-3 py-3">工人</th>
                        <th className="px-3 py-3">工种</th>
                        <th className="px-3 py-3">身份证</th>
                        <th className="px-3 py-3 text-right">周期出勤工时</th>
                        <th className="px-3 py-3 text-right">分账单价</th>
                        <th className="px-3 py-3 text-right">分账金额</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#eef0f5]">
                      {splitRows.map((row) => (
                        <tr key={row.idCard}>
                          <td className="px-3 py-3 font-medium">{row.name}</td>
                          <td className="px-3 py-3 text-[#4e5969]">{row.workType}</td>
                          <td className="px-3 py-3 text-[#4e5969]">{row.idCard}</td>
                          <td className="px-3 py-3 text-right tabular-nums">{numberText(row.hours)}</td>
                          <td className="px-3 py-3 text-right tabular-nums">{money(row.price)}</td>
                          <td className="px-3 py-3 text-right font-medium tabular-nums">{money(row.hours * row.price)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-[#fafbff] text-sm font-semibold">
                      <tr>
                        <td className="px-3 py-3" colSpan={3}>分账明细合计</td>
                        <td className="px-3 py-3 text-right tabular-nums">{numberText(totalHours)}</td>
                        <td className="px-3 py-3"></td>
                        <td className="px-3 py-3 text-right tabular-nums">{money(splitTotal)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
