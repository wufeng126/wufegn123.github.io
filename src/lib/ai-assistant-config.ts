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
      { label: '今日项目总览', prompt: '汇总所有项目本月报量、回款、成本情况' },
      { label: '待办事项', prompt: '我有哪些待处理的事项？包括未审工资、未确认结算等' },
      { label: '经营概览', prompt: '公司当前整体经营情况如何？包括总项目数、总工人数、总成本' },
    ],
  },
  {
    keywords: ['project', '项目'],
    suggestions: [
      { label: '项目成本分析', prompt: '分析当前项目的成本构成和利润率' },
      { label: '项目进度', prompt: '当前项目的工程量完成进度如何？' },
      { label: '项目知识', prompt: '当前项目有哪些月度分析和经验总结？' },
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
      { label: '本月工资汇总', prompt: '汇总本月所有项目的工人工资总额' },
      { label: '未发工资', prompt: '有哪些工人工资还未发放？' },
      { label: '工人累计工资排行', prompt: '列出所有工人累计实发工资从高到低' },
    ],
  },
  {
    keywords: ['supplier', '供应商', 'contract', '合同'],
    suggestions: [
      { label: '未付供应商', prompt: '列出有未付款的供应商，按金额排序' },
      { label: '合同结算', prompt: '汇总各供应商合同结算和已付款情况' },
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
