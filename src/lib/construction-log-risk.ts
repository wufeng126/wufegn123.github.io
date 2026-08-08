export type ConstructionRiskType = 'change' | 'visa' | 'delay' | 'quality' | 'safety' | 'cost';
export type ConstructionRiskLevel = 'low' | 'medium' | 'high';
export type ConstructionRiskWorkflowStatus = 'pending' | 'confirmed' | 'ignored' | 'resolved' | 'monthly' | 'monthly_included' | 'visa_created';

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
    recommendation: '建议同步项目成本跟踪台账，复核现场实际消耗、责任原因和可追溯资料。',
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

export function getRiskLevelLabel(level?: ConstructionRiskLevel | null) {
  if (level === 'high') return '高';
  if (level === 'medium') return '中';
  if (level === 'low') return '低';
  return '未定';
}

export function getRiskWorkflowStatusLabel(status?: ConstructionRiskWorkflowStatus | string | null) {
  const map: Record<string, string> = {
    pending: '待确认',
    confirmed: '已确认',
    ignored: '确认无影响',
    resolved: '已处理',
    monthly: '待入月报',
    monthly_included: '已进入月报',
    visa_created: '已转签证',
  };
  return map[status || ''] || '待确认';
}

export function getRiskWorkflowStatusFromTags(tags?: string[] | null): ConstructionRiskWorkflowStatus {
  const statusTag = (tags || []).find(tag => tag.startsWith('风险状态:'));
  const label = statusTag?.replace('风险状态:', '').trim();
  if (label === '已确认') return 'confirmed';
  if (label === '确认无影响') return 'ignored';
  if (label === '已处理') return 'resolved';
  if (label === '加入月报说明' || label === '待入月报') return 'monthly';
  if (label === '已进入月报') return 'monthly_included';
  if (label === '已转签证') return 'visa_created';
  return 'pending';
}

export function upsertRiskWorkflowTags(
  tags: string[] | null | undefined,
  status: ConstructionRiskWorkflowStatus,
  actionLabel?: string,
) {
  const base = (tags || []).filter(tag => !tag.startsWith('风险状态:') && !tag.startsWith('处理动作:'));
  const next = [...base, `风险状态:${getRiskWorkflowStatusLabel(status)}`];
  if (actionLabel) next.push(`处理动作:${actionLabel}`);
  return uniq(next);
}

export function buildRiskKnowledgeTags(input: {
  projectId: number | string;
  projectName: string;
  logDate: string;
  risk: ConstructionLogRisk;
}) {
  const month = input.logDate ? input.logDate.slice(0, 7) : '';
  return uniq([
    '施工日志',
    '施工日志风险',
    '来源:施工日志',
    input.projectName,
    `项目ID:${input.projectId}`,
    month ? `月份:${month}` : '',
    input.risk.level ? `风险等级:${getRiskLevelLabel(input.risk.level)}` : '',
    ...input.risk.types.map(type => `风险类型:${getRiskTypeLabel(type)}`),
    ...input.risk.tags,
    `风险状态:${getRiskWorkflowStatusLabel('pending')}`,
  ].filter(Boolean));
}

export function buildRiskKnowledgeContent(input: {
  projectName: string;
  projectId: number | string;
  logId: number | string;
  logDate: string;
  location?: string | null;
  content?: string | null;
  issues?: string | null;
  risk: ConstructionLogRisk;
}) {
  return [
    `## 施工日志风险事件`,
    ``,
    `**项目**：${input.projectName}`,
    `**项目ID**：${input.projectId}`,
    `**日期**：${input.logDate || ''}`,
    `**月份**：${input.logDate ? input.logDate.slice(0, 7) : ''}`,
    `**部位**：${input.location || '未填写'}`,
    `**风险类型**：${input.risk.types.map(getRiskTypeLabel).join('、') || '未分类'}`,
    `**风险等级**：${getRiskLevelLabel(input.risk.level)}`,
    `**流转状态**：${getRiskWorkflowStatusLabel('pending')}`,
    `**触发关键词**：${input.risk.matchedKeywords.join('、') || '无'}`,
    ``,
    `### 施工内容`,
    input.content || '',
    ``,
    `### 异常情况`,
    input.issues || '未填写',
    ``,
    `### 跟进建议`,
    input.risk.recommendation || '建议项目、预算、现场管理人员共同复核，确认影响原因、责任边界和后续处理动作。',
    ``,
    `### 处理记录`,
    `- ${new Date().toISOString().slice(0, 10)}：系统识别为待确认风险，等待人工确认。`,
    ``,
    `> 来源：施工日志自动识别，日志ID：${input.logId}`,
  ].join('\n');
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

// ============ 风险双层检测：LLM 语义精判 ============

export interface AiRiskRefinement {
  hasRisk: boolean;
  types: ConstructionRiskType[];
  level: ConstructionRiskLevel | null;
  confidence: number;
  summary?: string;
  recommendation?: string;
  reason?: string;
}

function extractRiskJson(text: string): AiRiskRefinement | null {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const source = fenced?.[1] || trimmed;
  const start = source.indexOf('{');
  const end = source.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(source.slice(start, end + 1));
    const validTypes = ['change', 'visa', 'delay', 'quality', 'safety', 'cost'] as ConstructionRiskType[];
    const types = Array.isArray(parsed.types)
      ? parsed.types.filter((t: unknown) => validTypes.includes(t as ConstructionRiskType)) as ConstructionRiskType[]
      : [];
    const levelValue = ['low', 'medium', 'high'].includes(parsed.level) ? parsed.level as ConstructionRiskLevel : null;
    return {
      hasRisk: Boolean(parsed.has_risk ?? parsed.hasRisk),
      types,
      level: levelValue,
      confidence: Number.isFinite(Number(parsed.confidence)) ? Math.min(Math.max(Number(parsed.confidence), 0), 1) : 0.5,
      summary: typeof parsed.summary === 'string' ? parsed.summary : undefined,
      recommendation: typeof parsed.recommendation === 'string' ? parsed.recommendation : undefined,
      reason: typeof parsed.reason === 'string' ? parsed.reason : undefined,
    };
  } catch {
    return null;
  }
}

function buildRiskAiPrompt(input: { content?: string | null; issues?: string | null }) {
  const text = `${input.content || ''} ${input.issues || ''}`.trim();
  return `你是建筑劳务施工现场风险识别助手。请判断以下施工日志内容是否存在真实的施工风险，并区分"确有其事"与"正常描述/否定表述"（例如"无质量问题""未发生安全事故"不算风险）。

日志内容：
${text}

只返回严格 JSON，不要输出解释：
{
  "has_risk": true,
  "types": ["change" | "visa" | "delay" | "quality" | "safety" | "cost"],
  "level": "low" | "medium" | "high",
  "confidence": 0.0-1.0,
  "summary": "一句话风险摘要",
  "recommendation": "一句跟进建议",
  "reason": "判断依据（一句话）"
}

如果无真实风险，返回 {"has_risk": false}。`;
}

/**
 * LLM 语义精判：在关键词规则之上用大模型判断真实风险，用于降低误报、提升精度。
 * 调用失败或 AI 未启用时返回 null，由调用方回退到规则结果（保底）。
 */
export async function refineRiskWithAI(input: { content?: string | null; issues?: string | null }): Promise<AiRiskRefinement | null> {
  try {
    const { getAIConfig, createLLMClient } = await import('@/lib/ai-service');
    const config = await getAIConfig();
    if (!config?.enabled) return null;

    const client = createLLMClient();
    const stream = await client.stream([
      { role: 'system', content: '你只输出严格 JSON，用中文识别建筑施工现场风险。' },
      { role: 'user', content: buildRiskAiPrompt(input) },
    ], {
      model: config.model_id,
      temperature: 0.1,
    });

    let text = '';
    for await (const chunk of stream) {
      const part = chunk as { content?: unknown; text?: unknown };
      if (typeof part === 'string') text += part;
      else if (typeof part?.content === 'string') text += part.content;
      else if (typeof part?.text === 'string') text += part.text;
      else if (part?.content && Array.isArray(part.content)) {
        text += (part.content as unknown[]).map((item: unknown) => {
          const record = item as { text?: unknown; content?: unknown };
          return String(record?.text || record?.content || '');
        }).join('');
      }
    }

    return extractRiskJson(text);
  } catch (error) {
    console.warn('[ConstructionLogRisk] AI refinement failed, fallback to rule result:', error);
    return null;
  }
}

/** 合并规则结果与 AI 精判：AI 高置信度时采用 AI 结果，否则保留规则结果（保底） */
export function mergeRiskWithAiRule(
  rule: ConstructionLogRisk,
  ai: AiRiskRefinement | null,
): ConstructionLogRisk {
  if (!ai || !ai.hasRisk) return rule;
  if (ai.confidence < 0.6) return rule;

  const labels = ai.types.map(getRiskTypeLabel);
  const level = ai.level || rule.level;
  return {
    hasRisk: true,
    primaryType: ai.types[0] || rule.primaryType,
    types: ai.types.length > 0 ? ai.types : rule.types,
    level,
    tags: ['施工日志风险', ...labels].filter(Boolean),
    matchedKeywords: rule.matchedKeywords,
    summary: ai.summary || rule.summary,
    recommendation: ai.recommendation || rule.recommendation,
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
