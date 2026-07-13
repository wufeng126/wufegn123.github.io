export type ConstructionRiskType = 'change' | 'visa' | 'delay' | 'quality' | 'safety' | 'cost';
export type ConstructionRiskLevel = 'low' | 'medium' | 'high';

export interface ConstructionLogRisk {
  hasRisk: boolean;
  primaryType: ConstructionRiskType | null;
  types: ConstructionRiskType[];
  level: ConstructionRiskLevel | null;
  tags: string[];
  matchedKeywords: string[];
  summary: string;
  recommendation: string;
}

interface RiskRule {
  type: ConstructionRiskType;
  label: string;
  keywords: string[];
  recommendation: string;
}

const RISK_RULES: RiskRule[] = [
  {
    type: 'change',
    label: '变更',
    keywords: ['变更', '设计变更', '图纸变更', '方案调整', '甲方要求', '新增工作', '做法调整', '洽商'],
    recommendation: '建议同步确认变更依据、工程量、责任方和书面资料。',
  },
  {
    type: 'visa',
    label: '签证',
    keywords: ['签证', '现场签证', '索赔', '增项', '额外工作', '工程量增加', '工程量确认'],
    recommendation: '建议预算员及时跟进签证资料，避免后期无法计量。',
  },
  {
    type: 'delay',
    label: '工期',
    keywords: ['停工', '窝工', '延误', '工期', '进度滞后', '材料未到', '等待', '无法施工', '延期'],
    recommendation: '建议记录影响时长、影响人数、机械台班和责任原因。',
  },
  {
    type: 'quality',
    label: '质量',
    keywords: ['质量', '返工', '不合格', '整改', '验收未通过', '偏差', '裂缝', '漏浆', '修补'],
    recommendation: '建议保留整改前后照片、责任班组和返工成本。',
  },
  {
    type: 'safety',
    label: '安全',
    keywords: ['安全', '隐患', '事故', '违规', '临边', '高处', '坠落', '触电', '罚款'],
    recommendation: '建议立即闭环安全整改，并记录责任人与整改时限。',
  },
  {
    type: 'cost',
    label: '成本',
    keywords: ['成本', '超支', '单价', '材料涨价', '人工增加', '机械', '台班', '费用', '扣款', '亏损'],
    recommendation: '建议把影响项同步到成本测算，复核预算单价和目标成本。',
  },
];

const HIGH_KEYWORDS = ['事故', '停工', '索赔', '罚款', '验收未通过', '重大', '亏损', '无法施工'];
const MEDIUM_KEYWORDS = ['签证', '变更', '返工', '延误', '窝工', '工程量增加', '材料涨价'];

function uniq<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function includesKeyword(text: string, keyword: string) {
  return text.toLowerCase().includes(keyword.toLowerCase());
}

export function getRiskTypeLabel(type: ConstructionRiskType) {
  return RISK_RULES.find(rule => rule.type === type)?.label || type;
}

export function detectConstructionLogRisk(input: { content?: string | null; issues?: string | null }): ConstructionLogRisk {
  const text = `${input.content || ''} ${input.issues || ''}`.trim();
  if (!text) {
    return {
      hasRisk: false,
      primaryType: null,
      types: [],
      level: null,
      tags: [],
      matchedKeywords: [],
      summary: '未识别到风险',
      recommendation: '',
    };
  }

  const matchedRules = RISK_RULES.map(rule => ({
    ...rule,
    matched: rule.keywords.filter(keyword => includesKeyword(text, keyword)),
  })).filter(rule => rule.matched.length > 0);

  const types = matchedRules.map(rule => rule.type);
  const matchedKeywords = uniq(matchedRules.flatMap(rule => rule.matched));
  const primary = matchedRules.sort((a, b) => b.matched.length - a.matched.length)[0];

  let level: ConstructionRiskLevel | null = null;
  if (matchedKeywords.some(keyword => HIGH_KEYWORDS.includes(keyword)) || types.includes('safety')) {
    level = 'high';
  } else if (matchedKeywords.some(keyword => MEDIUM_KEYWORDS.includes(keyword)) || types.length >= 2 || input.issues) {
    level = 'medium';
  } else if (matchedKeywords.length > 0) {
    level = 'low';
  }

  const labels = types.map(getRiskTypeLabel);
  const recommendation = primary?.recommendation || '';

  return {
    hasRisk: matchedKeywords.length > 0,
    primaryType: primary?.type || null,
    types,
    level,
    tags: ['施工日志风险', ...labels, ...matchedKeywords].filter(Boolean),
    matchedKeywords,
    summary: matchedKeywords.length > 0
      ? `${labels.join('、')}风险：${matchedKeywords.slice(0, 6).join('、')}`
      : '未识别到风险',
    recommendation,
  };
}

export function enrichConstructionLog<T extends { content?: string | null; issues?: string | null }>(log: T) {
  const risk = detectConstructionLogRisk(log);
  return {
    ...log,
    risk_type: risk.primaryType,
    risk_types: risk.types,
    risk_level: risk.level,
    risk_tags: risk.tags,
    risk_matched_keywords: risk.matchedKeywords,
    risk_summary: risk.summary,
    risk_recommendation: risk.recommendation,
  };
}
