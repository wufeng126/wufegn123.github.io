import {
  ArrowLeft,
  BarChart3,
  BookOpen,
  Building2,
  Calculator,
  ChevronDown,
  ClipboardList,
  FileSpreadsheet,
  HardHat,
  Home,
  Plus,
  ReceiptText,
  Save,
  Search,
  Send,
  Settings,
  Trash2,
  Users,
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

function Field({ label, value, width = 'md:col-span-1' }: { label: string; value: string; width?: string }) {
  return (
    <label className={`block ${width}`}>
      <span className="mb-1 block text-xs font-medium text-[#86909c]">{label}</span>
      <div className="flex h-10 items-center justify-between rounded-md border border-[#dfe3eb] bg-white px-3 text-sm text-[#1d2129]">
        <span className="truncate">{value}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-[#86909c]" />
      </div>
    </label>
  );
}

export default function NewTeamSettlementPreviewPage() {
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
          <header className="sticky top-0 z-20 border-b border-[#e5e8ef] bg-white/95 backdrop-blur">
            <div className="flex min-h-16 flex-wrap items-center gap-3 px-4 py-3 md:px-6">
              <button className="flex h-9 items-center gap-2 rounded-md border border-[#dfe3eb] bg-white px-3 text-sm text-[#4e5969]">
                <ArrowLeft className="h-4 w-4" />
                返回
              </button>
              <div className="min-w-[220px] flex-1">
                <h1 className="truncate text-lg font-semibold">新增班组结算单</h1>
                <p className="truncate text-xs text-[#86909c]">先录结算工程量，再按施工日志考勤进行人员分账</p>
              </div>
              <div className="flex gap-2">
                <button className="flex h-9 items-center gap-2 rounded-md border border-[#dfe3eb] bg-white px-3 text-sm font-medium text-[#4e5969]">
                  <Save className="h-4 w-4" />
                  保存草稿
                </button>
                <button className="flex h-9 items-center gap-2 rounded-md bg-[#165dff] px-3 text-sm font-medium text-white">
                  <Send className="h-4 w-4" />
                  确认结算
                </button>
              </div>
            </div>
          </header>

          <div className="mx-auto grid max-w-[1480px] gap-5 p-4 lg:grid-cols-[minmax(0,1fr)_320px] md:p-6">
            <div className="space-y-5">
              <section className="rounded-lg border border-[#e5e8ef] bg-white shadow-sm">
                <div className="border-b border-[#eef0f5] px-4 py-3">
                  <h2 className="text-base font-semibold">基础信息</h2>
                  <p className="mt-1 text-xs text-[#86909c]">结算周期按月份自动换算，例如 2026-07 对应 2026-06-26 至 2026-07-25。</p>
                </div>
                <div className="grid gap-3 p-4 md:grid-cols-4">
                  <Field label="所属项目" value="A 项目" />
                  <Field label="班组" value="木工一班" />
                  <Field label="结算月份" value="2026-07" />
                  <Field label="统计周期" value="2026-06-26 至 2026-07-25" />
                  <Field label="结算单号" value="自动生成：BZJS-202607-001" width="md:col-span-2" />
                  <Field label="经办人" value="预算员：吴峰" />
                  <Field label="状态" value="草稿" />
                  <label className="block md:col-span-4">
                    <span className="mb-1 block text-xs font-medium text-[#86909c]">备注</span>
                    <div className="min-h-20 rounded-md border border-[#dfe3eb] bg-white px-3 py-2 text-sm text-[#86909c]">
                      可填写本次结算说明、扣款原因、现场争议事项等。
                    </div>
                  </label>
                </div>
              </section>

              <section className="rounded-lg border border-[#e5e8ef] bg-white shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#eef0f5] px-4 py-3">
                  <div>
                    <h2 className="text-base font-semibold">结算工程量</h2>
                    <p className="mt-1 text-xs text-[#86909c]">这里录入班组本次结算内容，系统同步显示历史已结算工程量。</p>
                  </div>
                  <div className="rounded-md bg-[#f2f6ff] px-3 py-2 text-right">
                    <div className="text-xs text-[#86909c]">本次合计金额</div>
                    <div className="mt-1 text-base font-semibold text-[#165dff] tabular-nums">{money(quantityTotal)}</div>
                  </div>
                  <button className="flex h-9 items-center gap-2 rounded-md border border-[#dfe3eb] bg-white px-3 text-sm font-medium text-[#165dff]">
                    <Plus className="h-4 w-4" />
                    新增一行
                  </button>
                </div>
                <div className="overflow-x-auto p-4">
                  <table className="w-full min-w-[960px] text-sm">
                    <thead className="bg-[#f7f8fb] text-left text-xs font-medium text-[#86909c]">
                      <tr>
                        <th className="px-3 py-3">结算内容</th>
                        <th className="px-3 py-3">单位</th>
                        <th className="px-3 py-3 text-right">本次工程量</th>
                        <th className="px-3 py-3 text-right">结算单价</th>
                        <th className="px-3 py-3 text-right">本次合计金额</th>
                        <th className="px-3 py-3 text-right">已结算工程量</th>
                        <th className="px-3 py-3 text-right">累计结算量</th>
                        <th className="px-3 py-3 text-center">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#eef0f5]">
                      {quantityRows.map((row) => (
                        <tr key={row.content}>
                          <td className="px-3 py-3">
                            <div className="rounded-md border border-[#dfe3eb] bg-white px-2 py-1.5 font-medium">{row.content}</div>
                          </td>
                          <td className="px-3 py-3 text-[#4e5969]">{row.unit}</td>
                          <td className="px-3 py-3 text-right tabular-nums">{numberText(row.quantity)}</td>
                          <td className="px-3 py-3 text-right tabular-nums">{money(row.price)}</td>
                          <td className="px-3 py-3 text-right font-medium tabular-nums">{money(row.quantity * row.price)}</td>
                          <td className="px-3 py-3 text-right text-[#4e5969] tabular-nums">{numberText(row.settledBefore)}</td>
                          <td className="px-3 py-3 text-right text-[#165dff] tabular-nums">{numberText(row.settledBefore + row.quantity)}</td>
                          <td className="px-3 py-3 text-center">
                            <button aria-label="删除结算内容" className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#86909c] hover:bg-[#fff1f0] hover:text-[#f53f3f]">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-[#fafbff] text-sm font-semibold">
                      <tr>
                        <td className="px-3 py-3" colSpan={4}>本次合计金额</td>
                        <td className="px-3 py-3 text-right text-[#165dff] tabular-nums">{money(quantityTotal)}</td>
                        <td className="px-3 py-3" colSpan={3}></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </section>

              <section className="rounded-lg border border-[#e5e8ef] bg-white shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#eef0f5] px-4 py-3">
                  <div>
                    <h2 className="text-base font-semibold">分账明细</h2>
                    <p className="mt-1 text-xs text-[#86909c]">选择工人后自动带出结算周期内出勤总工时，预算员填写分账单价。</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button className="h-9 rounded-md border border-[#dfe3eb] bg-white px-3 text-sm text-[#4e5969]">工种：木工</button>
                    <button className="flex h-9 items-center gap-2 rounded-md border border-[#dfe3eb] bg-white px-3 text-sm font-medium text-[#165dff]">
                      <Users className="h-4 w-4" />
                      选择工人
                    </button>
                  </div>
                </div>
                <div className="grid gap-4 p-4 xl:grid-cols-[280px_minmax(0,1fr)]">
                  <aside className="rounded-md border border-[#eef0f5] bg-[#fafbff] p-3">
                    <div className="flex h-9 items-center gap-2 rounded-md border border-[#dfe3eb] bg-white px-2 text-xs text-[#86909c]">
                      <Search className="h-3.5 w-3.5" />
                      搜索姓名/身份证
                    </div>
                    <div className="mt-3 space-y-2 text-sm">
                      {['木工', '钢筋工', '泥工', '辅助工'].map((workType) => (
                        <div
                          key={workType}
                          className={[
                            'flex items-center justify-between rounded-md px-3 py-2',
                            workType === '木工' ? 'bg-[#e8f3ff] font-medium text-[#165dff]' : 'text-[#4e5969]',
                          ].join(' ')}
                        >
                          <span>{workType}</span>
                          <span className="text-xs text-[#86909c]">{workType === '木工' ? '16 人' : '8 人'}</span>
                        </div>
                      ))}
                    </div>
                  </aside>
                  <div className="overflow-x-auto rounded-md border border-[#eef0f5]">
                    <table className="w-full min-w-[820px] text-sm">
                      <thead className="bg-[#f7f8fb] text-left text-xs font-medium text-[#86909c]">
                        <tr>
                          <th className="px-3 py-3">工人</th>
                          <th className="px-3 py-3">工种</th>
                          <th className="px-3 py-3">身份证</th>
                          <th className="px-3 py-3 text-right">周期出勤工时</th>
                          <th className="px-3 py-3 text-right">分账单价</th>
                          <th className="px-3 py-3 text-right">分账金额</th>
                          <th className="px-3 py-3 text-center">操作</th>
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
                            <td className="px-3 py-3 text-center">
                              <button aria-label="移除工人" className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#86909c] hover:bg-[#fff1f0] hover:text-[#f53f3f]">
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-[#fafbff] text-sm font-semibold">
                        <tr>
                          <td className="px-3 py-3" colSpan={3}>分账明细合计</td>
                          <td className="px-3 py-3 text-right tabular-nums">{numberText(totalHours)}</td>
                          <td className="px-3 py-3"></td>
                          <td className="px-3 py-3 text-right tabular-nums">{money(splitTotal)}</td>
                          <td className="px-3 py-3"></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </section>
            </div>

            <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
              <section className="rounded-lg border border-[#e5e8ef] bg-white p-4 shadow-sm">
                <h2 className="text-base font-semibold">结算汇总</h2>
                <div className="mt-4 space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-[#86909c]">工程量结算合计</span>
                    <span className="font-semibold tabular-nums">{money(quantityTotal)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#86909c]">人员分账合计</span>
                    <span className="font-semibold tabular-nums">{money(splitTotal)}</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-[#eef0f5] pt-3">
                    <span className="text-[#86909c]">差额</span>
                    <span className="font-semibold text-[#d46b08] tabular-nums">{money(quantityTotal - splitTotal)}</span>
                  </div>
                </div>
                <div className="mt-4 rounded-md bg-[#fff7e8] p-3 text-xs leading-5 text-[#8f5b11]">
                  差额用于提示工程量结算和人员分账是否匹配，不做付款状态管理。
                </div>
              </section>

              <section className="rounded-lg border border-[#e5e8ef] bg-white p-4 shadow-sm">
                <h2 className="text-base font-semibold">自动取数说明</h2>
                <div className="mt-3 space-y-3 text-xs leading-5 text-[#4e5969]">
                  <p>结算月份选择 2026-07 后，系统按 2026-06-26 至 2026-07-25 汇总施工日志考勤。</p>
                  <p>可选人员只来自当前项目、当前工种、状态为在场的花名册人员。</p>
                  <p>分账金额按“周期出勤工时 × 分账单价”计算。</p>
                </div>
              </section>
            </aside>
          </div>
        </section>
      </div>
    </main>
  );
}
