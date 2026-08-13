/**
 * AI 助手离线回复与上下文感知建议配置
 */

/** 离线回复规则 */
export const OFFLINE_RESPONSES: Record<string, string> = {
  '工资': '工资核算规则：应发工资 = 工时×工价+包活工资；实发工资 = 应发工资-个税-借支-劳保。如需详细数据查询，请稍后重试。',
  '证件': '证件到期提醒规则：系统自动在30天、15天、7天和已过期四个阶段发送提醒。可在通知中心查看详情。',
  '成本': '成本计算口径：总成本 = 供应商结算 + 工人工资 + 综合费用 + 税费 + 零星材料。利润 = 总收入 - 总成本。',
  '回款': '回款率计算：回款率 = 已回款 / 产值结算金额 × 100%。回款率超100%为超收/预收。',
  '供应商': '供应商结算流程：新建结算→审核→付款。未审核的结算不计入统计。可在供应商成本看板查看详情。',
  '合同': '合同文件可通过本助手上传功能上传，AI将自动解析合同条款、单价清单、付款节点等信息并存入知识库。',
  '默认': 'AI助手暂时不可用，请稍后重试。您可以在系统各页面上查看业务数据，或在通知中心查看预警信息。',
};

export function getOfflineResponse(input: string): string {
  const lower = input.toLowerCase();
  for (const [key, value] of Object.entries(OFFLINE_RESPONSES)) {
    if (key !== '默认' && lower.includes(key)) return value;
  }
  return OFFLINE_RESPONSES['默认'];
}

/** 页面上下文 → 动态建议映射 */
export interface Suggestion {
  label: string;
  prompt: string;
}

export interface PageSuggestions {
  keywords: string[];
  suggestions: Suggestion[];
}

export const PAGE_SUGGESTIONS: PageSuggestions[] = [
  {
    keywords: ['workspace', '工作台', 'dashboard'],
    suggestions: [
      { label: '查询工人工资', prompt: '查询张三的工资明细、已发工资和未发余额' },
      { label: '查询合同清单', prompt: '查询某项目合同清单，列出清单项、工作内容、单位和合同单价' },
      { label: '待办事项', prompt: '我有哪些待处理事项？按待办、风险、结果、抄送分类列出' },
    ],
  },
  {
    keywords: ['project', '项目'],
    suggestions: [
      { label: '合同清单', prompt: '查询当前项目合同内清单和工作内容，包含单位、匹配量、合同单价' },
      { label: '清单项单价', prompt: '查询当前项目某个清单项的工作内容和合同单价' },
      { label: '项目知识', prompt: '当前项目有哪些手动录入的经营经验和月度分析？' },
    ],
  },
  {
    keywords: ['cost', '成本', 'profit', '利润'],
    suggestions: [
      { label: '成本构成', prompt: '分析所有项目的成本构成，人工、材料、费用各占多少？' },
      { label: '利润排行', prompt: '按利润率从高到低排列所有项目' },
      { label: '超支预警', prompt: '哪些项目存在成本超支风险？' },
    ],
  },
  {
    keywords: ['salary', '工资', 'worker', '工人'],
    suggestions: [
      { label: '工资明细', prompt: '查询张三的工资明细，按月份列出应发、实发/应付、已发和未发' },
      { label: '已发工资', prompt: '查询张三已发工资是多少，并列出对应月份' },
      { label: '未发余额', prompt: '查询张三还有多少工资未发，按项目和月份列明' },
    ],
  },
  {
    keywords: ['supplier', '供应商', 'contract', '合同'],
    suggestions: [
      { label: '合同清单', prompt: '查询某项目合同清单，列出清单项、工作内容、单位、合同单价' },
      { label: '供应商付款', prompt: '查询某供应商合同结算、已付款和未付款情况' },
    ],
  },
  {
    keywords: ['knowledge', '知识库', 'monthly', '月度分析'],
    suggestions: [
      { label: '最新知识', prompt: '知识库中最近有哪些更新？' },
      { label: '月度分析', prompt: '最近有哪些项目的月度分析？' },
      { label: '施工日志异常', prompt: '最近施工日志中有哪些异常记录？' },
    ],
  },
];
