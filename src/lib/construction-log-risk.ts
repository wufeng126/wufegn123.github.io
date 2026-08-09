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

// ============ 规则层降误报增强 ============
// 以下三组机制用于过滤"不是真实风险"的命中：
// 1. 否定/正面表述：关键词前出现"无/未/不/没有"等 → 非风险（如"无质量问题"）
// 2. 消除/闭环动作：关键词前出现"杜绝/防止/整改完成/已排除"等 → 非风险（如"已消除安全隐患"）
// 3. 中性管理语境：关键词后紧跟检查/会议/培训等日常动作 → 非风险（如"安全检查"）

/** 否定前缀词（出现在关键词前 8 字内视为否定表述） */
const NEGATION_MARKERS = ['没有', '不存在', '未见', '未发现', '无发现', '无异常', '未发生', '不发生', '无发生', '无', '未', '不', '非', '免'];

/** 消除/闭环动作词（关键词前出现 → 风险已被预防，如"已消除安全隐患"） */
const MITIGATION_MARKERS = ['杜绝', '防止', '避免', '消除', '排除', '已整改', '已处理', '已落实', '已排除', '已解决', '已闭环', '复查合格'];

/** 后向闭环词（关键词后出现 → 风险已处理完毕，如"裂缝问题已整改完成"） */
const CLOSURE_MARKERS = ['已整改完成', '完成整改', '整改完成', '已处理完毕', '处理完毕', '整改完毕', '已闭环', '已解决', '复查合格', '处理完成', '已修复', '修复完成'];

/** 中性管理语境词（关键词后紧跟 → 日常管理动作而非风险事件） */
const NEUTRAL_ACTIVITY_WORDS = ['检查', '会议', '例会', '周会', '培训', '演练', '分析', '计划', '安排', '部署', '强调', '交底', '学习', '宣贯', '总结', '教育', '自查', '复查', '提醒', '告知', '统计', '台账', '汇报', '记录', '评估', '会议纪要'];

/** 风险语境词（弱关键词旁出现 → 判定为真实风险，如"出现质量问题"） */
const RISK_CONTEXT_WORDS = ['发生', '出现', '发现', '存在', '导致', '造成', '引发', '隐患', '问题', '异常', '未达标', '不达标'];

/** 强风险词：单独命中即视为风险（具体、指向已发生的事件） */
const STRONG_RISK_KEYWORDS = new Set([
  '事故', '坍塌', '垮塌', '坠落', '触电', '伤亡', '死亡', '受伤', '火灾', '爆炸',
  '停工', '窝工', '索赔', '罚款', '返工', '亏损', '裂缝', '漏浆', '验收未通过', '不合格',
  '无法施工', '材料未到', '超支', '涨价', '扣款', '待料', '断料', '停工令',
]);

/** 中性弱关键词：单独出现且无风险语境时不触发（避免"等待""成本""工期"等常见词误报） */
const NEUTRAL_WEAK_KEYWORDS = new Set([
  '等待', '机械', '台班', '单价', '签证', '变更', '新增工作', '甲方要求', '方案调整',
  '质量', '安全', '工期', '成本', '费用', '进度', '洽商', '整改',
]);

function isNegatedHit(text: string, keyword: string, keywordIndex: number): boolean {
  // 关键词前 8 字窗口内出现否定词 → 非风险（如"无安全隐患"）
  const before = text.slice(Math.max(0, keywordIndex - 8), keywordIndex);
  if (NEGATION_MARKERS.some(marker => before.includes(marker))) return true;
  // 关键词前出现消除/预防动作 → 非风险（如"已消除安全隐患"）
  if (MITIGATION_MARKERS.some(marker => before.includes(marker))) return true;
  // 关键词附近（允许闭环词起始略早于关键词，覆盖"已整改完成"内嵌"整改"的场景）
  // 出现闭环词 → 风险已处理完，不再入池（如"裂缝问题已整改完成"）
  for (const marker of CLOSURE_MARKERS) {
    const closureIndex = text.indexOf(marker, Math.max(0, keywordIndex - 3));
    if (closureIndex >= 0 && Math.abs(closureIndex - keywordIndex) <= 15) return true;
  }
  return false;
}

function isNeutralContextHit(text: string, keyword: string, keywordIndex: number): boolean {
  // 强风险词不受中性语境影响（"事故检查"仍是事故语境）
  if (STRONG_RISK_KEYWORDS.has(keyword)) return false;
  // 关键词后 6 字窗口内出现日常管理动作词 → 非风险（如"安全检查""质量例会"）
  const after = text.slice(keywordIndex + keyword.length, keywordIndex + keyword.length + 6);
  return NEUTRAL_ACTIVITY_WORDS.some(word => after.includes(word));
}

function hasRiskContextAround(text: string, keywordIndex: number): boolean {
  // 关键词前后 12 字窗口内出现风险语境词（发生/出现/发现/隐患/问题/异常…）→ 判定为真实风险
  const window = text.slice(Math.max(0, keywordIndex - 12), keywordIndex + 12 + 6);
  return RISK_CONTEXT_WORDS.some(word => window.includes(word));
}

function uniq<T>(items: T[]): T[] {
  return Array.from(new Set(items));
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
  const emptyResult: ConstructionLogRisk = {
    hasRisk: false,
    primaryType: null,
    types: [],
    level: null,
    tags: [],
    matchedKeywords: [],
    summary: '未识别到风险',
    recommendation: '',
  };
  if (!text) return emptyResult;

  // 逐关键词匹配，并应用降误报过滤：
  // - 否定/消除表述（"无安全隐患""已整改完成"）→ 排除
  // - 中性管理语境（"安全检查""质量例会"）→ 排除（弱关键词）
  const matchedByRule: Array<{ rule: RiskRule; keywords: string[] }> = RISK_RULES.map(rule => ({
    rule,
    keywords: rule.keywords.filter(keyword => {
      const lowerText = text.toLowerCase();
      const lowerKeyword = keyword.toLowerCase();
      let index = lowerText.indexOf(lowerKeyword);
      while (index >= 0) {
        if (!isNegatedHit(lowerText, lowerKeyword, index) && !isNeutralContextHit(lowerText, lowerKeyword, index)) {
          return true;
        }
        index = lowerText.indexOf(lowerKeyword, index + lowerKeyword.length);
      }
      return false;
    }),
  })).filter(item => item.keywords.length > 0);

  const types = matchedByRule.map(item => item.rule.type);
  const matchedKeywords = uniq(matchedByRule.flatMap(item => item.keywords));

  // 弱关键词降级：中性弱词单独出现且无风险语境时，不判为风险（如"等待""成本""工期"）
  const strongHits = matchedKeywords.filter(keyword => STRONG_RISK_KEYWORDS.has(keyword));
  const weakHits = matchedKeywords.filter(keyword => !STRONG_RISK_KEYWORDS.has(keyword));
  const hasRiskContext = weakHits.some(keyword => {
    const lowerText = text.toLowerCase();
    const lowerKeyword = keyword.toLowerCase();
    const index = lowerText.indexOf(lowerKeyword);
    return index >= 0 && hasRiskContextAround(lowerText, index);
  });

  // 触发判定：
  // 1) 命中强风险词 → 有风险
  // 2) 弱词 ≥2 个组合 → 有风险（多维度异常）
  // 3) 弱词 1 个 + 风险语境（发生/出现/隐患/问题/异常）或 issues 有内容 → 有风险
  // 4) 弱词单独出现（无语境）→ 不算风险（降低误报）
  const isRealRisk = strongHits.length > 0
    || weakHits.length >= 2
    || (weakHits.length === 1 && (hasRiskContext || Boolean(input.issues?.trim())));

  if (!isRealRisk) return emptyResult;

  const primary = matchedByRule.sort((a, b) => b.keywords.length - a.keywords.length)[0];

  let level: ConstructionRiskLevel | null = null;
  if (strongHits.some(keyword => HIGH_KEYWORDS.includes(keyword)) || types.includes('safety')) {
    level = 'high';
  } else if (strongHits.length > 0 || weakHits.length >= 2 || input.issues) {
    level = 'medium';
  } else {
    level = 'low';
  }

  const labels = types.map(getRiskTypeLabel);
  const recommendation = primary?.rule.recommendation || '';

  return {
    hasRisk: true,
    primaryType: primary?.rule.type || null,
    types,
    level,
    tags: ['施工日志风险', ...labels, ...matchedKeywords].filter(Boolean),
    matchedKeywords,
    summary: `${labels.join('、')}风险：${matchedKeywords.slice(0, 6).join('、')}`,
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
    const { getAIConfig, createConfiguredLLMClient } = await import('@/lib/ai-service');
    const config = await getAIConfig();
    if (!config?.enabled) return null;

    const client = await createConfiguredLLMClient();
    if (!client) return null;
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

// ============ 风险事件流表（construction_risk_events）============

export interface RiskEventRow {
  id: number;
  project_id: number;
  log_id: number;
  risk_type: ConstructionRiskType | string;
  risk_types: ConstructionRiskType[];
  level: ConstructionRiskLevel | string;
  status: ConstructionRiskWorkflowStatus | string;
  occurred_date: string;
  content?: string | null;
  issues?: string | null;
  summary?: string | null;
  recommendation?: string | null;
  matched_keywords: string[];
  confirmed_by?: number | null;
  confirmed_at?: string | null;
  resolved_by?: number | null;
  resolved_at?: string | null;
  created_at: string;
  updated_at: string;
}

function isRiskEventsTableError(error: unknown) {
  const err = error as { message?: string; code?: string } | null;
  const message = String(err?.message || '').toLowerCase();
  return (
    err?.code === '42P01' ||
    err?.code === '42703' ||
    err?.code === 'PGRST205' ||
    message.includes('construction_risk_events') ||
    message.includes('does not exist') ||
    message.includes('could not find')
  );
}

/**
 * 写入/更新风险事件。日志提交检测到风险时调用（status=pending）；
 * 状态流转时更新 status 及操作人/时间。表不存在时静默跳过（向后兼容）。
 */
export async function upsertConstructionRiskEvent(
  supabase: ReturnType<typeof import('@/storage/database/supabase-client').getSupabaseClient>,
  input: {
    projectId: number;
    logId: number;
    risk: ConstructionLogRisk;
    logDate: string;
    content?: string | null;
    issues?: string | null;
    status?: ConstructionRiskWorkflowStatus;
    confirmedBy?: number | null;
  },
) {
  if (!input.logId || !input.risk.hasRisk) return;
  try {
    const status = input.status || 'pending';
    const patch: Record<string, unknown> = {
      project_id: input.projectId,
      log_id: input.logId,
      risk_type: input.risk.primaryType || 'change',
      risk_types: input.risk.types,
      level: input.risk.level || 'low',
      status,
      occurred_date: input.logDate || new Date().toISOString().slice(0, 10),
      content: input.content || null,
      issues: input.issues || null,
      summary: input.risk.summary || null,
      recommendation: input.risk.recommendation || null,
      matched_keywords: input.risk.matchedKeywords,
      updated_at: new Date().toISOString(),
    };
    if (status === 'confirmed' && input.confirmedBy) {
      patch.confirmed_by = input.confirmedBy;
      patch.confirmed_at = new Date().toISOString();
    }
    const { error } = await supabase
      .from('construction_risk_events')
      .upsert(patch, { onConflict: 'log_id' });
    if (error && isRiskEventsTableError(error)) return;
    if (error) console.warn('[ConstructionLogRisk] upsert risk event failed:', error.message);
  } catch (err) {
    console.warn('[ConstructionLogRisk] upsert risk event skipped:', err);
  }
}

/** 更新风险事件状态（确认/处理等流转动作） */
export async function updateConstructionRiskEventStatus(
  supabase: ReturnType<typeof import('@/storage/database/supabase-client').getSupabaseClient>,
  logId: number,
  status: ConstructionRiskWorkflowStatus,
  operatorId?: number | null,
) {
  if (!logId) return;
  try {
    const patch: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    };
    if (operatorId) {
      if (status === 'confirmed') {
        patch.confirmed_by = operatorId;
        patch.confirmed_at = new Date().toISOString();
      }
      if (status === 'resolved') {
        patch.resolved_by = operatorId;
        patch.resolved_at = new Date().toISOString();
      }
    }
    const { error } = await supabase
      .from('construction_risk_events')
      .update(patch)
      .eq('log_id', logId);
    if (error && isRiskEventsTableError(error)) return;
    if (error) console.warn('[ConstructionLogRisk] update risk event status failed:', error.message);
  } catch (err) {
    console.warn('[ConstructionLogRisk] update risk event status skipped:', err);
  }
}

/** 批量读取风险事件（按项目 + 日期范围），供风险池/日报趋势使用；表不存在返回空数组 */
export async function loadConstructionRiskEvents(
  supabase: ReturnType<typeof import('@/storage/database/supabase-client').getSupabaseClient>,
  input: {
    projectIds?: number[];
    startDate?: string;
    endDate?: string;
    statuses?: string[];
    limit?: number;
  } = {},
): Promise<RiskEventRow[]> {
  if (input.projectIds && input.projectIds.length === 0) return [];
  try {
    let query = supabase
      .from('construction_risk_events')
      .select('*')
      .order('occurred_date', { ascending: false })
      .order('id', { ascending: false })
      .limit(input.limit || 500);
    if (input.projectIds && input.projectIds.length > 0) {
      query = query.in('project_id', input.projectIds);
    }
    if (input.startDate) query = query.gte('occurred_date', input.startDate);
    if (input.endDate) query = query.lte('occurred_date', input.endDate);
    if (input.statuses && input.statuses.length > 0) {
      query = query.in('status', input.statuses);
    }
    const { data, error } = await query;
    if (error && isRiskEventsTableError(error)) return [];
    if (error) throw new Error(error.message);
    return (data || []) as RiskEventRow[];
  } catch (err) {
    console.warn('[ConstructionLogRisk] load risk events skipped:', err);
    return [];
  }
}

/** 读取单条日志的风险事件（优先事件表，无则 null） */
export async function loadConstructionRiskEventByLogId(
  supabase: ReturnType<typeof import('@/storage/database/supabase-client').getSupabaseClient>,
  logId: number,
): Promise<RiskEventRow | null> {
  if (!logId) return null;
  try {
    const { data, error } = await supabase
      .from('construction_risk_events')
      .select('*')
      .eq('log_id', logId)
      .maybeSingle();
    if (error && isRiskEventsTableError(error)) return null;
    if (error) throw new Error(error.message);
    return (data as RiskEventRow | null) || null;
  } catch (err) {
    console.warn('[ConstructionLogRisk] load risk event by log skipped:', err);
    return null;
  }
}
