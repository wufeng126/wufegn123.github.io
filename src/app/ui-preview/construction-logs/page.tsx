import {
  AlertTriangle,
  CalendarDays,
  Camera,
  ChevronDown,
  Clock3,
  Eye,
  FileText,
  Pencil,
  Search,
  Trash2,
  UserRound,
  Users,
} from 'lucide-react';

type LogStatus = 'normal' | 'late' | 'scheduled' | 'risk';

type PreviewLog = {
  id: number;
  date: string;
  submitTime: string;
  project: string;
  submitter: string;
  location: string;
  status: LogStatus;
  headcount: number;
  hours: number;
  photos: number;
  content: string;
  risk?: string;
};

const logs: PreviewLog[] = [
  {
    id: 1,
    date: '2026-07-23',
    submitTime: '11:42',
    project: '晋中东城商业综合体',
    submitter: '王建军',
    location: '二层模板区',
    status: 'risk',
    headcount: 18,
    hours: 156,
    photos: 5,
    content: '二层梁板模板安装完成约 780 平方米，局部洞口加固已处理，下午完成支撑体系复核。',
    risk: '材料周转偏紧，明日模板供应需要提前协调。',
  },
  {
    id: 2,
    date: '2026-07-23',
    submitTime: '09:18',
    project: '太原南站配套工程',
    submitter: '赵鹏',
    location: '地下室负一层',
    status: 'normal',
    headcount: 12,
    hours: 96,
    photos: 3,
    content: '负一层砌筑班组完成墙体砌筑约 46 立方米，现场材料堆放已按区域重新整理。',
  },
  {
    id: 3,
    date: '2026-07-23',
    submitTime: '08:06',
    project: '公司公共项目/非项目日志',
    submitter: '刘敏',
    location: '预算部',
    status: 'late',
    headcount: 3,
    hours: 24,
    photos: 0,
    content: '整理各项目上月产值资料，核对签证资料缺项，形成需要项目经理补充的资料清单。',
  },
  {
    id: 4,
    date: '2026-07-22',
    submitTime: '18:52',
    project: '晋中东城商业综合体',
    submitter: '王建军',
    location: '一层主体结构',
    status: 'normal',
    headcount: 21,
    hours: 178.5,
    photos: 6,
    content: '一层墙柱钢筋绑扎完成，模板班组配合完成边梁支设，夜间安排两人看护材料。',
  },
  {
    id: 5,
    date: '2026-07-22',
    submitTime: '12:20',
    project: '榆次学校改造项目',
    submitter: '陈强',
    location: '教学楼东侧',
    status: 'scheduled',
    headcount: 9,
    hours: 72,
    photos: 2,
    content: '外墙修补打磨完成三层东侧区域，明日进入南侧立面，需要补充砂浆材料。',
  },
  {
    id: 6,
    date: '2026-07-21',
    submitTime: '19:05',
    project: '太原南站配套工程',
    submitter: '赵鹏',
    location: '材料堆场',
    status: 'risk',
    headcount: 7,
    hours: 54.5,
    photos: 4,
    content: '辅材进场验收完成，现场发现部分扣件数量与送货单不一致，已要求供应商复核。',
    risk: '扣件数量存在差异，可能影响后续结算数量。',
  },
  {
    id: 7,
    date: '2026-07-21',
    submitTime: '07:54',
    project: '榆次学校改造项目',
    submitter: '陈强',
    location: '北侧围挡',
    status: 'normal',
    headcount: 8,
    hours: 64,
    photos: 2,
    content: '完成北侧围挡加固和现场清理，下午配合甲方检查文明施工整改项。',
  },
];

const statusMeta: Record<LogStatus, { label: string; className: string }> = {
  normal: { label: '正常提交', className: 'bg-emerald-50 text-emerald-700 ring-emerald-100' },
  late: { label: '逾期补交', className: 'bg-amber-50 text-amber-700 ring-amber-100' },
  scheduled: { label: '预约提交', className: 'bg-blue-50 text-blue-700 ring-blue-100' },
  risk: { label: '有风险', className: 'bg-rose-50 text-rose-700 ring-rose-100' },
};

function groupByDate(items: PreviewLog[]) {
  const map = new Map<string, PreviewLog[]>();
  items.forEach(item => {
    const list = map.get(item.date) || [];
    list.push(item);
    map.set(item.date, list);
  });

  return Array.from(map.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, dateLogs]) => ({
      date,
      logs: dateLogs.sort((a, b) => b.submitTime.localeCompare(a.submitTime)),
    }));
}

function formatDateLabel(date: string) {
  const d = new Date(`${date}T00:00:00`);
  return d.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  });
}

export default function ConstructionLogsPreviewPage() {
  const groups = groupByDate(logs);
  const totalRisks = logs.filter(item => item.status === 'risk').length;
  const totalLate = logs.filter(item => item.status === 'late').length;
  const projectCount = new Set(logs.map(item => item.project)).size;
  const peopleCount = new Set(logs.map(item => item.submitter)).size;

  return (
    <main className="min-h-screen bg-[#f5f7fb] text-slate-950">
      <div className="mx-auto max-w-[1180px] space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium text-blue-700">施工管理 / 施工日志预览</p>
            <h1 className="mt-2 text-2xl font-semibold text-slate-950">按天折叠的施工日志</h1>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              最新日期固定在最上方，每天展开后按提交时间倒序显示，用测试日志模拟数据变多后的查看效果。
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:flex">
            <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm hover:border-blue-200 hover:text-blue-700">
              <Camera className="h-4 w-4" />
              拍照录入
            </button>
            <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-blue-600 px-3 text-sm font-medium text-white shadow-sm hover:bg-blue-700">
              <FileText className="h-4 w-4" />
              新建日志
            </button>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: '日志总数', value: logs.length, icon: FileText, tone: 'text-blue-700 bg-blue-50 ring-blue-100' },
            { label: '涉及项目', value: projectCount, icon: CalendarDays, tone: 'text-cyan-700 bg-cyan-50 ring-cyan-100' },
            { label: '提交人员', value: peopleCount, icon: Users, tone: 'text-violet-700 bg-violet-50 ring-violet-100' },
            { label: '风险/逾期', value: `${totalRisks}/${totalLate}`, icon: AlertTriangle, tone: 'text-amber-700 bg-amber-50 ring-amber-100' },
          ].map(item => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs text-slate-500">{item.label}</p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-950">{item.value}</p>
                  </div>
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg ring-1 ${item.tone}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                </div>
              </div>
            );
          })}
        </section>

        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-100 p-4 md:flex-row md:items-center md:justify-between">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3">
              <Search className="h-4 w-4 shrink-0 text-slate-400" />
              <input
                className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
                placeholder="搜索项目、提交人、施工内容"
              />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <select className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none">
                <option>全部项目</option>
                <option>晋中东城商业综合体</option>
                <option>太原南站配套工程</option>
              </select>
              <select className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none">
                <option>全部状态</option>
                <option>正常提交</option>
                <option>逾期补交</option>
                <option>有风险</option>
              </select>
            </div>
          </div>

          <div className="divide-y divide-slate-100">
            {groups.map((group, index) => {
              const riskCount = group.logs.filter(item => item.status === 'risk').length;
              const lateCount = group.logs.filter(item => item.status === 'late').length;
              const projects = new Set(group.logs.map(item => item.project)).size;
              const submitters = new Set(group.logs.map(item => item.submitter)).size;
              const photos = group.logs.reduce((sum, item) => sum + item.photos, 0);

              return (
                <details key={group.date} open={index === 0} className="group">
                  <summary className="flex cursor-pointer list-none flex-col gap-3 px-4 py-4 transition hover:bg-slate-50 md:flex-row md:items-center md:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700 ring-1 ring-slate-200">
                        <CalendarDays className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-base font-semibold text-slate-950">{formatDateLabel(group.date)}</h2>
                          {index === 0 && (
                            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">最新</span>
                          )}
                        </div>
                        <p className="mt-1 text-sm text-slate-500">
                          共 {group.logs.length} 篇，涉及 {projects} 个项目，{submitters} 人提交
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 md:justify-end">
                      {lateCount > 0 && <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">逾期 {lateCount}</span>}
                      {riskCount > 0 && <span className="rounded-full bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700">风险 {riskCount}</span>}
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">照片 {photos}</span>
                      <ChevronDown className="h-4 w-4 text-slate-400 transition group-open:rotate-180" />
                    </div>
                  </summary>

                  <div className="space-y-3 bg-slate-50 px-3 pb-4 pt-1 sm:px-4">
                    {group.logs.map(log => {
                      const meta = statusMeta[log.status];

                      return (
                        <article key={log.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div className="min-w-0 flex-1">
                              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                <span className="inline-flex items-center gap-1 font-medium text-slate-700">
                                  <Clock3 className="h-3.5 w-3.5" />
                                  {log.submitTime}
                                </span>
                                <span className="h-3 w-px bg-slate-200" />
                                <span>{log.project}</span>
                                <span>{log.location}</span>
                                <span className={`rounded-full px-2 py-0.5 font-medium ring-1 ${meta.className}`}>{meta.label}</span>
                              </div>
                              <p className="text-sm leading-6 text-slate-900">{log.content}</p>
                              {log.risk && (
                                <div className="mt-3 flex gap-2 rounded-md border border-amber-100 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                                  <span>{log.risk}</span>
                                </div>
                              )}
                            </div>

                            <div className="grid grid-cols-3 gap-2 lg:w-[260px]">
                              <div className="rounded-md bg-slate-50 px-3 py-2 text-center">
                                <p className="text-xs text-slate-500">出勤</p>
                                <p className="mt-1 text-sm font-semibold text-slate-950">{log.headcount} 人</p>
                              </div>
                              <div className="rounded-md bg-slate-50 px-3 py-2 text-center">
                                <p className="text-xs text-slate-500">工时</p>
                                <p className="mt-1 text-sm font-semibold text-slate-950">{log.hours}</p>
                              </div>
                              <div className="rounded-md bg-slate-50 px-3 py-2 text-center">
                                <p className="text-xs text-slate-500">照片</p>
                                <p className="mt-1 text-sm font-semibold text-slate-950">{log.photos}</p>
                              </div>
                            </div>
                          </div>

                          <div className="mt-3 flex flex-col gap-3 border-t border-slate-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="inline-flex items-center gap-2 text-sm text-slate-500">
                              <UserRound className="h-4 w-4 text-slate-400" />
                              <span>{log.submitter}</span>
                            </div>
                            <div className="grid grid-cols-3 gap-2 sm:flex">
                              <button className="inline-flex h-9 items-center justify-center gap-1 rounded-md border border-slate-200 px-3 text-xs font-medium text-slate-700 hover:border-blue-200 hover:text-blue-700">
                                <Eye className="h-3.5 w-3.5" />
                                查看
                              </button>
                              <button className="inline-flex h-9 items-center justify-center gap-1 rounded-md border border-slate-200 px-3 text-xs font-medium text-slate-700 hover:border-blue-200 hover:text-blue-700">
                                <Pencil className="h-3.5 w-3.5" />
                                编辑
                              </button>
                              <button className="inline-flex h-9 items-center justify-center gap-1 rounded-md border border-rose-100 px-3 text-xs font-medium text-rose-700 hover:bg-rose-50">
                                <Trash2 className="h-3.5 w-3.5" />
                                删除
                              </button>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </details>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
