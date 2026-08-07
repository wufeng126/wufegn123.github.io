'use client';

import { useMemo, useState } from 'react';
import {
  Archive,
  BadgeDollarSign,
  BookOpenCheck,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  ChevronRight,
  Download,
  FileArchive,
  FileSpreadsheet,
  FileText,
  Filter,
  Image,
  Link2,
  MessageSquareText,
  Paperclip,
  Plus,
  Search,
  Tag,
  Upload,
  X,
} from 'lucide-react';

type Importance = '普通留痕' | '重点关注' | '必须结算' | '争议风险';
type FollowStatus = '未处理' | '待补资料' | '已形成签证' | '已进入结算' | '已关闭';
type AmountDirection = '可能增加收入' | '可能减少收入' | '仅留痕/暂不确定';
type HandlingResult = '待判断' | '走签证' | '走补充协议' | '纳入结算' | '无需处理';

type EvidenceRecord = {
  id: number;
  project: string;
  date: string;
  title: string;
  type: string;
  source: string;
  importance: Importance;
  status: FollowStatus;
  handlingResult: HandlingResult;
  linkedBusiness: string;
  amountDirection: AmountDirection;
  estimatedAmount: number | null;
  summary: string;
  keyPoint: string;
  nextAction: string;
  attachments: Array<{ name: string; type: '图片' | 'PDF' | 'Word' | 'Excel' | '聊天截图' }>;
  related: string[];
  owner: string;
  tags: string[];
};

const evidenceRecords: EvidenceRecord[] = [
  {
    id: 1,
    project: '南京中交智慧港项目',
    date: '2026-07-23',
    title: '地下室B区增加止水钢板加固',
    type: '甲方回复',
    source: '甲方项目群聊天截图',
    importance: '必须结算',
    status: '已形成签证',
    handlingResult: '走签证',
    linkedBusiness: 'VS-2026-0719 地下室止水钢板加固签证',
    amountDirection: '可能增加收入',
    estimatedAmount: 86500,
    summary: '甲方工程部确认现场渗水风险，需要新增止水钢板加固。已整理聊天记录、现场照片和工程量测算，可作为签证依据。',
    keyPoint: '合同清单无该附加加固项，甲方已在线确认施工要求。',
    nextAction: '项目经理继续推进甲方商务签字，预算员复核测算量。',
    attachments: [
      { name: '甲方项目群回复截图-0723.png', type: '聊天截图' },
      { name: '地下室B区现场照片-0723.jpg', type: '图片' },
      { name: '止水钢板工程量测算.xlsx', type: 'Excel' },
    ],
    related: ['报量管理：地下室防水附加项', '签证流程：工程部已签字'],
    owner: '王预算',
    tags: ['甲方确认', '合同外', '需签证'],
  },
  {
    id: 2,
    project: '南京中交智慧港项目',
    date: '2026-07-18',
    title: '设备基础高度调整形成工程量变化',
    type: '图纸答疑',
    source: '设计答疑文件',
    importance: '重点关注',
    status: '待补资料',
    handlingResult: '待判断',
    linkedBusiness: '待关联签证',
    amountDirection: '可能增加收入',
    estimatedAmount: 42000,
    summary: '答疑文件明确设备基础由原设计高度调整为新高度，可能带来模板、钢筋、混凝土工程量增加。',
    keyPoint: '需要确认变更后图纸和实际施工照片是否完整。',
    nextAction: '补充变更图纸签收记录，并对比原设计工程量。',
    attachments: [
      { name: '设备基础图纸答疑.pdf', type: 'PDF' },
      { name: '设备基础调整说明.docx', type: 'Word' },
    ],
    related: ['待补充：变更图纸', '待测算：钢筋混凝土增量'],
    owner: '王预算',
    tags: ['图纸答疑', '待补资料'],
  },
  {
    id: 3,
    project: '太原南站配套工程',
    date: '2026-07-12',
    title: '赶工期间夜间施工机械台班增加',
    type: '合同外施工',
    source: '施工日志与机械台班记录',
    importance: '争议风险',
    status: '未处理',
    handlingResult: '走补充协议',
    linkedBusiness: '补充协议：赶工措施费待起草',
    amountDirection: '可能增加收入',
    estimatedAmount: 118000,
    summary: '因甲方要求提前节点，项目连续夜间施工，机械台班和人工夜班费用增加。目前有日志和班组记录，但缺少甲方书面指令。',
    keyPoint: '缺少书面指令，后续结算可能被认定为施工组织自担成本。',
    nextAction: '项目经理补要甲方赶工确认函，预算员先形成费用测算底稿。',
    attachments: [
      { name: '夜间施工日志汇总.xlsx', type: 'Excel' },
      { name: '机械台班照片.zip', type: '图片' },
    ],
    related: ['施工日志：2026-07-08 至 2026-07-12'],
    owner: '李预算',
    tags: ['赶工', '争议风险', '合同外'],
  },
  {
    id: 4,
    project: '西安高新区厂房改造',
    date: '2026-06-29',
    title: '修补打磨结算口径存在争议',
    type: '结算争议',
    source: '会议纪要',
    importance: '争议风险',
    status: '已进入结算',
    handlingResult: '纳入结算',
    linkedBusiness: '结算争议项：JS-2026-003',
    amountDirection: '可能减少收入',
    estimatedAmount: 36000,
    summary: '甲方商务认为修补打磨属于施工组织范围，不同意单独计价。预算员已整理内部附加清单、施工日志和材料消耗。',
    keyPoint: '需要证明该工作超出原合同清单边界。',
    nextAction: '结算谈判时按合同边界、现场指令和实际消耗三类资料说明。',
    attachments: [
      { name: '第8次会议纪要.pdf', type: 'PDF' },
      { name: '修补打磨费用测算.xlsx', type: 'Excel' },
    ],
    related: ['内部附加清单：修补打磨', '供应商结算：辅材消耗'],
    owner: '赵预算',
    tags: ['结算争议', '内部附加清单'],
  },
  {
    id: 5,
    project: '南京中交智慧港项目',
    date: '2026-06-21',
    title: '地下室排水沟位置调整',
    type: '设计变更',
    source: '变更图纸',
    importance: '普通留痕',
    status: '已关闭',
    handlingResult: '无需处理',
    linkedBusiness: '已归档',
    amountDirection: '仅留痕/暂不确定',
    estimatedAmount: null,
    summary: '设计单位下发地下室排水沟位置调整图纸，经复核暂未形成明显金额变化，作为结算过程留痕资料归档。',
    keyPoint: '无明显新增工程量，但保留图纸签收记录。',
    nextAction: '无需继续推进，后续结算如出现争议可调用。',
    attachments: [
      { name: '地下室排水沟变更图纸.pdf', type: 'PDF' },
      { name: '图纸签收记录.jpg', type: '图片' },
    ],
    related: ['知识库：排水沟位置调整经验'],
    owner: '王预算',
    tags: ['设计变更', '已归档'],
  },
];

const typeOptions = ['全部类型', '甲方回复', '图纸答疑', '设计变更', '合同外施工', '会议纪要', '结算争议'];
const statusOptions: Array<'全部状态' | FollowStatus> = ['全部状态', '未处理', '待补资料', '已形成签证', '已进入结算', '已关闭'];

const importanceStyle: Record<Importance, string> = {
  普通留痕: 'bg-slate-100 text-slate-700 ring-slate-200',
  重点关注: 'bg-blue-50 text-blue-700 ring-blue-100',
  必须结算: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  争议风险: 'bg-rose-50 text-rose-700 ring-rose-100',
};

const statusStyle: Record<FollowStatus, string> = {
  未处理: 'bg-amber-50 text-amber-700 ring-amber-100',
  待补资料: 'bg-orange-50 text-orange-700 ring-orange-100',
  已形成签证: 'bg-violet-50 text-violet-700 ring-violet-100',
  已进入结算: 'bg-cyan-50 text-cyan-700 ring-cyan-100',
  已关闭: 'bg-slate-100 text-slate-600 ring-slate-200',
};

const handlingStyle: Record<HandlingResult, string> = {
  待判断: 'bg-amber-50 text-amber-700 ring-amber-100',
  走签证: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  走补充协议: 'bg-indigo-50 text-indigo-700 ring-indigo-100',
  纳入结算: 'bg-cyan-50 text-cyan-700 ring-cyan-100',
  无需处理: 'bg-slate-100 text-slate-600 ring-slate-200',
};

const amountDirectionStyle: Record<AmountDirection, string> = {
  可能增加收入: 'text-emerald-700 bg-emerald-50 ring-emerald-100',
  可能减少收入: 'text-rose-700 bg-rose-50 ring-rose-100',
  '仅留痕/暂不确定': 'text-slate-600 bg-slate-100 ring-slate-200',
};

const evidenceTypes = [
  { name: '甲方回复', example: '群聊、函件、邮件、书面确认' },
  { name: '图纸答疑', example: '设计回复、答疑纪要、技术核定' },
  { name: '设计变更', example: '变更图纸、图纸签收、方案调整' },
  { name: '合同外施工', example: '新增工序、临时指令、赶工措施' },
  { name: '会议纪要', example: '现场会议、专题会议、结算沟通' },
  { name: '结算争议', example: '扣减争议、口径分歧、商务回复' },
];

function formatMoney(value: number | null) {
  if (value === null) return '暂不确定';
  return `¥${value.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}`;
}

function formatDate(value: string) {
  const [year, month, day] = value.split('-');
  return { year, monthDay: `${month}.${day}` };
}

function attachmentIcon(type: EvidenceRecord['attachments'][number]['type']) {
  if (type === '图片' || type === '聊天截图') return Image;
  if (type === 'Excel') return FileSpreadsheet;
  return FileText;
}

export default function EvidenceChainPreviewPage() {
  const projects = ['全部项目', ...Array.from(new Set(evidenceRecords.map((item) => item.project)))];
  const [project, setProject] = useState('全部项目');
  const [type, setType] = useState('全部类型');
  const [status, setStatus] = useState<'全部状态' | FollowStatus>('全部状态');
  const [keyword, setKeyword] = useState('');
  const [selectedId, setSelectedId] = useState(evidenceRecords[0].id);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedEvidenceType, setSelectedEvidenceType] = useState(evidenceTypes[0].name);

  const filteredRecords = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    return evidenceRecords
      .filter((item) => project === '全部项目' || item.project === project)
      .filter((item) => type === '全部类型' || item.type === type)
      .filter((item) => status === '全部状态' || item.status === status)
      .filter((item) => {
        if (!normalizedKeyword) return true;
        return [
          item.project,
          item.title,
          item.type,
          item.source,
          item.summary,
          item.keyPoint,
          item.nextAction,
          item.owner,
          item.linkedBusiness,
          ...item.tags,
          ...item.related,
          ...item.attachments.map((attachment) => attachment.name),
        ].some((value) => value.toLowerCase().includes(normalizedKeyword));
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [keyword, project, status, type]);

  const selectedRecord =
    filteredRecords.find((item) => item.id === selectedId) || filteredRecords[0] || evidenceRecords[0];

  const summary = useMemo(() => {
    const records = project === '全部项目' ? evidenceRecords : evidenceRecords.filter((item) => item.project === project);
    return {
      count: records.length,
      riskCount: records.filter((item) => item.importance === '争议风险').length,
      requiredCount: records.filter((item) => item.importance === '必须结算').length,
      amount: records.reduce((sum, item) => sum + (item.estimatedAmount ?? 0), 0),
    };
  }, [project]);

  return (
    <main className="min-h-screen bg-[#f6f7f9] text-slate-950">
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1500px] flex-col gap-4 px-5 py-5 lg:px-8">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Archive className="h-4 w-4" />
                项目管理 / 结算证据链
              </div>
              <h1 className="mt-2 text-2xl font-semibold tracking-normal text-slate-950">结算证据链</h1>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
                <FileSpreadsheet className="h-4 w-4" />
                导出台账
              </button>
              <button className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
                <Download className="h-4 w-4" />
                附件打包
              </button>
              <button
                onClick={() => setIsCreateOpen(true)}
                className="inline-flex h-9 items-center gap-2 rounded-md bg-slate-950 px-3 text-sm font-medium text-white shadow-sm hover:bg-slate-800"
              >
                <Plus className="h-4 w-4" />
                新增证据
              </button>
            </div>
          </div>

          <div className="grid gap-2 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 md:grid-cols-4">
            <div>
              <span className="text-slate-500">证据</span>
              <span className="ml-2 font-semibold text-slate-950">{summary.count} 条</span>
            </div>
            <div>
              <span className="text-slate-500">必须结算</span>
              <span className="ml-2 font-semibold text-emerald-700">{summary.requiredCount} 条</span>
            </div>
            <div>
              <span className="text-slate-500">争议风险</span>
              <span className="ml-2 font-semibold text-rose-700">{summary.riskCount} 条</span>
            </div>
            <div>
              <span className="text-slate-500">预计影响</span>
              <span className="ml-2 font-semibold text-slate-950">{formatMoney(summary.amount)}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-[1500px] gap-5 px-5 py-5 lg:grid-cols-[260px_minmax(0,1fr)] lg:px-8 xl:grid-cols-[280px_minmax(0,1fr)_380px]">
        <aside className="h-fit rounded-md border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Filter className="h-4 w-4" />
            筛选
          </div>

          <div className="mt-4 space-y-4">
            <label className="block">
              <span className="text-xs font-medium text-slate-500">项目</span>
              <select
                value={project}
                onChange={(event) => setProject(event.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400"
              >
                {projects.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-medium text-slate-500">类型</span>
              <select
                value={type}
                onChange={(event) => setType(event.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400"
              >
                {typeOptions.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-medium text-slate-500">状态</span>
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value as '全部状态' | FollowStatus)}
                className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400"
              >
                {statusOptions.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-medium text-slate-500">关键词</span>
              <div className="mt-1 flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3">
                <Search className="h-4 w-4 text-slate-400" />
                <input
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                  placeholder="标题、附件、标签"
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                />
              </div>
            </label>
          </div>

          <div className="mt-5 border-t border-slate-100 pt-4">
            <div className="text-xs font-medium text-slate-500">常用标签</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {['甲方确认', '合同外', '需签证', '争议风险', '待补资料'].map((item) => (
                <button
                  key={item}
                  onClick={() => setKeyword(item)}
                  className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700 hover:bg-slate-200"
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5 rounded-md bg-slate-950 p-3 text-white">
            <div className="flex items-center gap-2 text-sm font-medium">
              <FileArchive className="h-4 w-4" />
              结算资料包
            </div>
            <div className="mt-2 text-xs leading-5 text-slate-300">按当前筛选导出 Excel 台账，并打包对应附件。</div>
          </div>
        </aside>

        <section className="rounded-md border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <div className="text-sm font-semibold text-slate-950">项目时间线</div>
              <div className="mt-1 text-xs text-slate-500">按发生日期倒序排列，证据不折叠。</div>
            </div>
            <div className="text-sm text-slate-500">{filteredRecords.length} 条</div>
          </div>

          <div className="p-5">
            {filteredRecords.length === 0 ? (
              <div className="flex min-h-[360px] flex-col items-center justify-center rounded-md border border-dashed border-slate-200 bg-slate-50 text-center">
                <BookOpenCheck className="h-9 w-9 text-slate-300" />
                <div className="mt-3 text-sm font-medium text-slate-900">暂无匹配证据</div>
                <div className="mt-1 text-xs text-slate-500">调整筛选条件或新增一条结算证据。</div>
              </div>
            ) : (
              <div className="relative pl-4">
                <div className="absolute bottom-2 left-[5px] top-2 w-px bg-slate-200" />
                <div className="space-y-3">
                  {filteredRecords.map((item) => {
                    const date = formatDate(item.date);
                    const isSelected = selectedRecord.id === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => setSelectedId(item.id)}
                        className={`group relative w-full rounded-md border bg-white p-4 text-left transition ${
                          isSelected
                            ? 'border-slate-900 shadow-[0_12px_30px_rgba(15,23,42,0.08)]'
                            : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        <span
                          className={`absolute -left-[18px] top-5 h-3 w-3 rounded-full border-2 bg-white ${
                            isSelected ? 'border-slate-950' : 'border-slate-300 group-hover:border-slate-500'
                          }`}
                        />
                        <div className="grid gap-4 md:grid-cols-[74px_minmax(0,1fr)_150px]">
                          <div>
                            <div className="text-lg font-semibold text-slate-950">{date.monthDay}</div>
                            <div className="text-xs text-slate-500">{date.year}</div>
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">{item.type}</span>
                              <span className={`rounded-md px-2 py-1 text-xs font-medium ring-1 ${importanceStyle[item.importance]}`}>
                                {item.importance}
                              </span>
                              <span className={`rounded-md px-2 py-1 text-xs font-medium ring-1 ${statusStyle[item.status]}`}>
                                {item.status}
                              </span>
                            </div>
                            <div className="mt-2 truncate text-base font-semibold text-slate-950">{item.title}</div>
                            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                              <span className="inline-flex items-center gap-1">
                                <Building2 className="h-3.5 w-3.5" />
                                {item.project}
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <Paperclip className="h-3.5 w-3.5" />
                                {item.attachments.length} 个附件
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <Tag className="h-3.5 w-3.5" />
                                {item.tags.slice(0, 2).join(' / ')}
                              </span>
                            </div>
                            <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-600">{item.summary}</p>
                          </div>
                          <div className="flex flex-col items-start justify-between gap-3 md:items-end">
                            <span className={`rounded-md px-2 py-1 text-xs font-medium ring-1 ${amountDirectionStyle[item.amountDirection]}`}>
                              {item.amountDirection}
                            </span>
                            <div className="text-left md:text-right">
                              <div className="text-xs text-slate-500">预计影响金额</div>
                              <div className="mt-1 text-lg font-semibold text-slate-950">{formatMoney(item.estimatedAmount)}</div>
                            </div>
                            <ChevronRight className={`h-4 w-4 ${isSelected ? 'text-slate-900' : 'text-slate-300'}`} />
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </section>

        <aside className="rounded-md border border-slate-200 bg-white shadow-sm lg:col-span-2 xl:col-span-1">
          <div className="border-b border-slate-100 px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-950">证据详情</div>
                <div className="mt-1 text-xs text-slate-500">当前选中证据的处理依据。</div>
              </div>
              <span className={`rounded-md px-2 py-1 text-xs font-medium ring-1 ${handlingStyle[selectedRecord.handlingResult]}`}>
                {selectedRecord.handlingResult}
              </span>
            </div>
          </div>

          <div className="space-y-5 p-5">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">{selectedRecord.type}</span>
                <span className={`rounded-md px-2 py-1 text-xs font-medium ring-1 ${statusStyle[selectedRecord.status]}`}>
                  {selectedRecord.status}
                </span>
              </div>
              <h2 className="mt-3 text-lg font-semibold leading-7 text-slate-950">{selectedRecord.title}</h2>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-md bg-slate-50 p-3">
                  <div className="text-xs text-slate-500">发生日期</div>
                  <div className="mt-1 font-medium text-slate-900">{selectedRecord.date}</div>
                </div>
                <div className="rounded-md bg-slate-50 p-3">
                  <div className="text-xs text-slate-500">负责人</div>
                  <div className="mt-1 font-medium text-slate-900">{selectedRecord.owner}</div>
                </div>
                <div className="col-span-2 rounded-md bg-slate-50 p-3">
                  <div className="text-xs text-slate-500">项目</div>
                  <div className="mt-1 font-medium text-slate-900">{selectedRecord.project}</div>
                </div>
              </div>
            </div>

            <div className="rounded-md border border-slate-200 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
                <BadgeDollarSign className="h-4 w-4" />
                金额判断
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-slate-500">预计影响金额</div>
                  <div className="mt-1 text-xl font-semibold text-slate-950">{formatMoney(selectedRecord.estimatedAmount)}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">方向</div>
                  <div className="mt-1 text-sm font-medium text-slate-900">{selectedRecord.amountDirection}</div>
                </div>
              </div>
              <div className="mt-3 rounded-md bg-slate-50 p-3 text-sm leading-6 text-slate-700">{selectedRecord.keyPoint}</div>
            </div>

            <div>
              <div className="text-sm font-semibold text-slate-950">处理结果</div>
              <div className="mt-2 rounded-md border border-slate-200 p-3">
                <div className="text-sm font-medium text-slate-900">{selectedRecord.linkedBusiness}</div>
                <div className="mt-2 text-sm leading-6 text-slate-600">{selectedRecord.nextAction}</div>
              </div>
            </div>

            <div>
              <div className="text-sm font-semibold text-slate-950">附件</div>
              <div className="mt-2 space-y-2">
                {selectedRecord.attachments.map((attachment) => {
                  const Icon = attachmentIcon(attachment.type);
                  return (
                    <div key={attachment.name} className="flex items-center gap-3 rounded-md border border-slate-200 px-3 py-2">
                      <Icon className="h-4 w-4 text-slate-500" />
                      <div className="min-w-0 flex-1 truncate text-sm text-slate-700">{attachment.name}</div>
                      <span className="text-xs text-slate-400">{attachment.type}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="text-sm font-semibold text-slate-950">关联资料</div>
              <div className="mt-2 space-y-2">
                {selectedRecord.related.map((item) => (
                  <div key={item} className="flex items-center gap-2 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    <Link2 className="h-4 w-4 text-slate-400" />
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </aside>
      </section>

      {isCreateOpen ? (
        <div className="fixed inset-0 z-40 bg-slate-950/30">
          <div className="absolute inset-y-0 right-0 flex w-full max-w-[760px] flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <div className="text-lg font-semibold text-slate-950">新增证据</div>
                <div className="mt-1 text-sm text-slate-500">按项目沉淀可用于签证、补充协议和结算的证据。</div>
              </div>
              <button
                onClick={() => setIsCreateOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-6">
              <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
                <div className="space-y-2">
                  {evidenceTypes.map((item) => (
                    <button
                      key={item.name}
                      onClick={() => setSelectedEvidenceType(item.name)}
                      className={`w-full rounded-md border px-3 py-3 text-left transition ${
                        selectedEvidenceType === item.name
                          ? 'border-slate-950 bg-slate-950 text-white'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <div className="text-sm font-medium">{item.name}</div>
                      <div className={`mt-1 text-xs ${selectedEvidenceType === item.name ? 'text-slate-300' : 'text-slate-500'}`}>
                        {item.example}
                      </div>
                    </button>
                  ))}
                </div>

                <div className="space-y-5">
                  <section className="rounded-md border border-slate-200 p-4">
                    <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-950">
                      <BriefcaseBusiness className="h-4 w-4" />
                      基础信息
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="block">
                        <span className="text-xs font-medium text-slate-500">所属项目</span>
                        <select className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400">
                          <option>南京中交智慧港项目</option>
                          <option>太原南站配套工程</option>
                          <option>西安高新区厂房改造</option>
                        </select>
                      </label>
                      <label className="block">
                        <span className="text-xs font-medium text-slate-500">发生日期</span>
                        <input
                          type="date"
                          defaultValue="2026-07-28"
                          className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-slate-400"
                        />
                      </label>
                      <label className="block md:col-span-2">
                        <span className="text-xs font-medium text-slate-500">证据标题</span>
                        <input
                          placeholder="例如：甲方确认地下室B区增加止水钢板加固"
                          className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-slate-400"
                        />
                      </label>
                      <label className="block">
                        <span className="text-xs font-medium text-slate-500">资料来源</span>
                        <input
                          placeholder="群聊、会议纪要、图纸、函件"
                          className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-slate-400"
                        />
                      </label>
                      <label className="block">
                        <span className="text-xs font-medium text-slate-500">重要程度</span>
                        <select className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400">
                          <option>必须结算</option>
                          <option>争议风险</option>
                          <option>重点关注</option>
                          <option>普通留痕</option>
                        </select>
                      </label>
                    </div>
                  </section>

                  <section className="rounded-md border border-slate-200 p-4">
                    <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-950">
                      <BadgeDollarSign className="h-4 w-4" />
                      金额与处理
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="block">
                        <span className="text-xs font-medium text-slate-500">处理结果</span>
                        <select className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400">
                          <option>待判断</option>
                          <option>走签证</option>
                          <option>走补充协议</option>
                          <option>纳入结算</option>
                          <option>无需处理</option>
                        </select>
                      </label>
                      <label className="block">
                        <span className="text-xs font-medium text-slate-500">预计影响金额</span>
                        <input
                          placeholder="例如：86500"
                          className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-slate-400"
                        />
                      </label>
                      <label className="block md:col-span-2">
                        <span className="text-xs font-medium text-slate-500">关联签证 / 补充协议备注</span>
                        <input
                          placeholder="选择签证单，或填写补充协议名称、待处理说明"
                          className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-slate-400"
                        />
                      </label>
                    </div>
                  </section>

                  <section className="rounded-md border border-slate-200 p-4">
                    <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-950">
                      <MessageSquareText className="h-4 w-4" />
                      证据摘要
                    </div>
                    <textarea
                      rows={5}
                      placeholder="写清楚事情经过、甲方确认内容、为什么影响结算、下一步需要谁处理。"
                      className="w-full resize-none rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                    />
                  </section>

                  <section className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
                          <Upload className="h-4 w-4" />
                          上传附件
                        </div>
                        <div className="mt-1 text-xs text-slate-500">支持图片、聊天截图、PDF、Word、Excel，后续可随台账打包导出。</div>
                      </div>
                      <button className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
                        <Paperclip className="h-4 w-4" />
                        选择文件
                      </button>
                    </div>
                  </section>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 px-6 py-4">
              <button
                onClick={() => setIsCreateOpen(false)}
                className="inline-flex h-9 items-center rounded-md border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                取消
              </button>
              <button className="inline-flex h-9 items-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-medium text-white hover:bg-slate-800">
                <CheckCircle2 className="h-4 w-4" />
                保存证据
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
