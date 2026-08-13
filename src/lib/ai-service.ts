/**
 * AI 服务核心模块
 * 统一管理 LLM 调用、知识库检索、权限校验、敏感信息脱敏
 */
import { LLMClient, KnowledgeClient, Config, HeaderUtils, DataSourceType, type CozeConfig } from 'coze-coding-dev-sdk';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { calculateSalaryPaymentStatus, calculateSalaryUnpaidAmount } from '@/lib/business-logic';

// ============ 类型定义 ============

export interface AIConfig {
  id: number;
  model_id: string;
  api_endpoint: string | null;
  api_key: string | null;
  max_context_length: number;
  daily_limit: number;
  temperature: number;
  enabled: boolean;
  module_data_query: boolean;
  module_report_analysis: boolean;
  module_error_diagnosis: boolean;
  module_doc_generation: boolean;
  module_supplier_analysis: boolean;
  module_salary_analysis: boolean;
  module_visa_assistant: boolean;
  content_filter_enabled: boolean;
  mask_sensitive: boolean;
  offline_fallback_enabled: boolean;
}

export interface AIModuleCheck {
  allowed: boolean;
  reason?: string;
}

export type UserRole =
  | 'super_admin'
  | 'admin'
  | 'finance'
  | 'budget'
  | 'boss'
  | 'project_manager'
  | 'team_leader'
  | 'site_staff';

// ============ 配置管理 ============

let configCache: AIConfig | null = null;
let configCacheTime = 0;
const CONFIG_CACHE_TTL = 60_000; // 1分钟缓存

export async function getAIConfig(): Promise<AIConfig | null> {
  const now = Date.now();
  if (configCache && now - configCacheTime < CONFIG_CACHE_TTL) {
    return configCache;
  }
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from('ai_configs').select('*').order('id', { ascending: true }).limit(1).single();
  if (error || !data) return null;
  configCache = data as AIConfig;
  configCacheTime = now;
  return configCache;
}

export function clearAIConfigCache() {
  configCache = null;
  configCacheTime = 0;
}

// ============ LLM 客户端 ============

/**
 * 创建 LLM 客户端。
 * ⚠️ 修复：原实现 new Config() 无参，ai_configs 表里的 api_key 从未传给 SDK，
 * 导致即使配置了 API Key，LLM 调用也拿不到凭据（401/403）。
 * 现在支持通过 options 传入 apiKey/baseUrl，并建议使用 createConfiguredLLMClient 自动注入配置。
 */
export function createLLMClient(
  customHeaders?: Record<string, string>,
  options?: CozeConfig,
): LLMClient {
  const config = new Config(options);
  return new LLMClient(config, customHeaders);
}

/**
 * 创建"已注入 AI 配置"的 LLM 客户端（推荐使用）：
 * 自动读取 ai_configs 表的 api_key/api_endpoint 传给 SDK。
 * 未配置凭据时返回 null，由调用方走离线兜底或明确提示。
 * 注意：SDK 的 LLM 请求走 Config.modelBaseUrl（ChatOpenAI baseURL），知识库走 baseUrl，
 * 因此两者都需设置为用户配置的 endpoint，否则 LLM 会请求到错误的默认端点。
 */
export async function createConfiguredLLMClient(
  customHeaders?: Record<string, string>,
  overrides?: { apiKey?: string; baseUrl?: string },
): Promise<LLMClient | null> {
  const aiConfig = await getAIConfig();
  const apiKey = overrides?.apiKey ?? aiConfig?.api_key ?? null;
  if (!apiKey) return null;
  const baseUrl = overrides?.baseUrl ?? aiConfig?.api_endpoint ?? null;
  return createLLMClient(customHeaders, {
    apiKey,
    baseUrl: baseUrl || undefined,
    modelBaseUrl: baseUrl || undefined,
  });
}

// 从NextRequest提取转发头
export function extractForwardHeaders(headers: Headers): Record<string, string> {
  return HeaderUtils.extractForwardHeaders(headers);
}

// ============ 知识库客户端 ============

export const DATASET_NAME = 'labor_ai_kb';

export function createKnowledgeClient(
  customHeaders?: Record<string, string>,
  options?: CozeConfig,
): KnowledgeClient {
  const config = new Config(options);
  return new KnowledgeClient(config, customHeaders);
}

/** 创建"已注入 AI 配置"的知识库客户端；未配置凭据返回 null */
export async function createConfiguredKnowledgeClient(
  customHeaders?: Record<string, string>,
): Promise<KnowledgeClient | null> {
  const aiConfig = await getAIConfig();
  const apiKey = aiConfig?.api_key ?? null;
  if (!apiKey) return null;
  const baseUrl = aiConfig?.api_endpoint ?? null;
  return createKnowledgeClient(customHeaders, { apiKey, baseUrl: baseUrl || undefined });
}

// 知识库语义搜索
export async function searchKnowledge(query: string, topK: number = 5, customHeaders?: Record<string, string>): Promise<string> {
  try {
    const client = await createConfiguredKnowledgeClient(customHeaders);
    if (!client) return '';
    const results = await client.search(query, undefined, topK);
    if (!results || !results.chunks || results.chunks.length === 0) return '';
    return results.chunks.map((chunk: any, i: number) => `[文档${i + 1}] ${chunk.content || chunk.text || ''}`).join('\n\n');
  } catch (e) {
    console.error('[AI] Knowledge search failed:', e);
    return '';
  }
}

/** 搜索系统知识库文档（ai_knowledge_docs） */
export async function searchSystemKnowledge(query: string): Promise<string> {
  try {
    const supabase = getSupabaseClient();
    const parts: string[] = [];

    // 搜索知识库文档
    const { data: docs } = await supabase
      .from('ai_knowledge_docs')
      .select('title, content, category, tags, created_at, source_type, source_ref')
      .eq('status', 'active')
      .neq('source_type', 'construction_log')
      .limit(5)
      .order('created_at', { ascending: false });

    if (docs && docs.length > 0) {
      const filtered = docs.filter(d => {
        const isConstructionLogKnowledge = d.source_type === 'construction_log' || String(d.source_ref || '').startsWith('cl:');
        const matchesQuery = !query
          || d.title?.includes(query)
          || d.content?.includes(query)
          || d.tags?.some((t: any) => String(t).includes(query));
        return !isConstructionLogKnowledge && matchesQuery;
      });
      filtered.slice(0, 3).forEach(d => {
        const excerpt = (d.content || '').slice(0, 300);
        parts.push(`[知识库] ${d.title} (${d.category || '未分类'})\n${excerpt}`);
      });
    }

    return parts.length > 0 ? parts.join('\n\n') : '';
  } catch (e) {
    console.error('[AI] System knowledge search failed:', e);
    return '';
  }
}

// 添加文档到知识库
export async function addKnowledgeDoc(title: string, content: string, dataset?: string, customHeaders?: Record<string, string>): Promise<boolean> {
  try {
    const client = await createConfiguredKnowledgeClient(customHeaders);
    if (!client) return false;
    const doc = {
      source: DataSourceType.TEXT,
      raw_data: Buffer.from(content).toString('base64'),
      document_name: title,
    };
    await client.addDocuments([doc], dataset || DATASET_NAME, {
      separator: '\n',
      max_tokens: 800,
    });
    return true;
  } catch (e) {
    console.error('[AI] Knowledge add failed:', e);
    return false;
  }
}

// ============ 每日限额检查 ============

export async function checkDailyLimit(userId: number, dailyLimit: number): Promise<{ allowed: boolean; used: number }> {
  const today = new Date().toISOString().slice(0, 10);
  const supabase = getSupabaseClient();
  const { data } = await supabase
    .from('ai_daily_usage')
    .select('request_count')
    .eq('user_id', userId)
    .eq('usage_date', today)
    .single();
  const used = data?.request_count || 0;
  return { allowed: used < dailyLimit, used };
}

export async function incrementDailyUsage(userId: number, tokens: number = 0): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const supabase = getSupabaseClient();
  const { data } = await supabase
    .from('ai_daily_usage')
    .select('id, request_count, token_total')
    .eq('user_id', userId)
    .eq('usage_date', today)
    .single();

  if (data) {
    await supabase
      .from('ai_daily_usage')
      .update({
        request_count: data.request_count + 1,
        token_total: data.token_total + tokens,
        updated_at: new Date().toISOString(),
      })
      .eq('id', data.id);
  } else {
    await supabase.from('ai_daily_usage').insert({
      user_id: userId,
      usage_date: today,
      request_count: 1,
      token_total: tokens,
    });
  }
}

// ============ 角色权限检查 ============

// 各模块对应的角色权限
const MODULE_ROLE_MAP: Record<string, string[]> = {
  module_data_query: ['super_admin', 'admin', 'finance', 'budget', 'boss', 'project_manager'],
  module_report_analysis: ['super_admin', 'admin', 'finance', 'budget', 'boss', 'project_manager'],
  module_error_diagnosis: ['super_admin', 'admin', 'project_manager', 'team_leader', 'site_staff'],
  module_doc_generation: ['super_admin', 'admin', 'finance', 'budget', 'project_manager'],
  module_supplier_analysis: ['super_admin', 'admin', 'finance', 'budget', 'boss'],
  module_salary_analysis: ['super_admin', 'admin', 'finance', 'budget', 'boss'],
  module_visa_assistant: ['super_admin', 'admin', 'budget', 'project_manager'],
};

const ROLE_ALIASES: Record<string, string[]> = {
  super_admin: ['super_admin', '超级管理员'],
  admin: ['admin', '公司管理员', '管理员'],
  finance: ['finance', '财务', '财务人员'],
  budget: ['budget', 'estimator', 'cost', '商务', '预算', '预算员', '造价'],
  boss: ['boss', 'owner', 'ceo', 'general_manager', '老板', '总经理'],
  project_manager: ['project_manager', 'project-manager', '项目经理', '项目管理员'],
  team_leader: ['team_leader', 'team-leader', '班组负责人'],
  site_staff: ['site_staff', 'site-staff', 'site staff', '现场', '现场人员'],
};

function normalizeRoleText(value: string) {
  return String(value || '').trim().toLowerCase();
}

function roleMatches(userRole: string, allowedRole: string) {
  const normalizedRole = normalizeRoleText(userRole);
  if (!normalizedRole) return false;
  if (normalizedRole === normalizeRoleText(allowedRole)) return true;

  const aliases = ROLE_ALIASES[allowedRole] || [];
  return aliases.some((alias) => {
    const normalizedAlias = normalizeRoleText(alias);
    return normalizedRole === normalizedAlias || normalizedRole.includes(normalizedAlias);
  });
}

// 敏感数据模块（工资、结算、付款金额等）
const SENSITIVE_DATA_ROLE_KEYS = ['super_admin', 'admin', 'finance', 'budget', 'boss'];

export function checkModulePermission(
  config: AIConfig,
  moduleKey: string,
  userRole: string
): AIModuleCheck {
  // 超级管理员始终有权限
  if (roleMatches(userRole, 'super_admin')) return { allowed: true };

  // 检查模块是否启用
  const moduleEnabled = (config as any)[moduleKey];
  if (!moduleEnabled) return { allowed: false, reason: '该AI功能模块未启用' };

  // 检查角色权限
  const allowedRoles = MODULE_ROLE_MAP[moduleKey];
  if (allowedRoles && !allowedRoles.some((role) => roleMatches(userRole, role))) {
    return { allowed: false, reason: '您的角色无权使用此AI功能' };
  }

  return { allowed: true };
}

export function canAccessSensitiveData(userRole: string): boolean {
  return SENSITIVE_DATA_ROLE_KEYS.some((role) => roleMatches(userRole, role));
}

// ============ 敏感信息脱敏 ============

const ID_CARD_REGEX = /\b\d{6}(19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{3}[\dXx]\b/g;
const PHONE_REGEX = /(?:^|[^\d])1[3-9]\d{9}(?=[^\d]|$)/g;
const BANK_CARD_REGEX = /\b\d{16,19}\b/g;

export function maskSensitiveInfo(text: string): string {
  let result = text;
  // 身份证号：保留前3后4
  result = result.replace(ID_CARD_REGEX, (match) => match.slice(0, 3) + '***********' + match.slice(-4));
  // 手机号：保留前3后4
  result = result.replace(PHONE_REGEX, (match) => match.slice(0, 3) + '****' + match.slice(-4));
  // 银行卡号：保留前4后4
  result = result.replace(BANK_CARD_REGEX, (match) => {
    if (match.length >= 12) return match.slice(0, 4) + '****' + match.slice(-4);
    return match;
  });
  return result;
}

// ============ 内容安全过滤 ============

const BUSINESS_KEYWORDS = [
  '项目', '工程', '工人', '工资', '成本', '供应商', '合同', '结算', '付款',
  '报量', '签证', '证件', '劳务', '施工', '分包', '甲方', '乙方', '材料',
  '安全', '质量', '进度', '预算', '决算', '应付款', '回款', '利润', '税',
  '劳保', '个税', '借支', '工时', '工价', '班组', '花名册', '经营', '资金',
  '对账', '发票', '财务', '报表', '看板', '数据', '统计', '分析', 'AI',
  '助手', '帮助', '怎么', '如何', '什么是', '查询', '计算', '生成', '导出',
];

export function isBusinessRelated(input: string): boolean {
  const lower = input.toLowerCase();
  // 短输入（<=10字）放宽检查
  if (lower.length <= 10) return true;
  const matchCount = BUSINESS_KEYWORDS.filter(kw => lower.includes(kw)).length;
  return matchCount >= 1;
}

// ============ 审计日志 ============

export async function logAIAudit(params: {
  userId: number;
  username?: string;
  action: string;
  inputSummary?: string;
  outputSummary?: string;
  pageContext?: string;
  modelId?: string;
  tokenUsage?: number;
  responseTimeMs?: number;
  isSuccess?: boolean;
  errorMessage?: string;
  ipAddress?: string;
  metadata?: any;
}): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    await supabase.from('ai_audit_logs').insert({
      user_id: params.userId,
      username: params.username,
      action: params.action,
      input_summary: params.inputSummary?.slice(0, 200),
      output_summary: params.outputSummary?.slice(0, 200),
      page_context: params.pageContext,
      model_id: params.modelId,
      token_usage: params.tokenUsage || 0,
      response_time_ms: params.responseTimeMs || 0,
      is_success: params.isSuccess !== false,
      error_message: params.errorMessage,
      ip_address: params.ipAddress,
      metadata: params.metadata,
    });
  } catch (e) {
    console.error('[AI] Audit log failed:', e);
  }
}

// ============ 对话历史 ============

export async function saveChatMessage(params: {
  sessionId: string;
  userId: number;
  username?: string;
  role: string;
  content: string;
  pageContext?: string;
  modelId?: string;
  isMasked?: boolean;
}): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    await supabase.from('ai_chat_histories').insert({
      session_id: params.sessionId,
      user_id: params.userId,
      username: params.username,
      role: params.role,
      content: params.content,
      page_context: params.pageContext,
      model_id: params.modelId,
      is_masked: params.isMasked || false,
    });
  } catch (e) {
    console.error('[AI] Save chat message failed:', e);
  }
}

export async function getChatHistory(sessionId: string, limit: number = 20): Promise<any[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('ai_chat_histories')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) return [];
  return data || [];
}

export async function getUserSessions(userId: number, limit: number = 20): Promise<any[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('ai_chat_histories')
    .select('session_id, page_context, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) return [];
  // 去重session
  const seen = new Set<string>();
  return (data || []).filter((d: any) => {
    if (seen.has(d.session_id)) return false;
    seen.add(d.session_id);
    return true;
  }).slice(0, limit);
}

// ============ 业务数据查询 ============

/**
 * 智能意图识别 - 从用户提问中识别查询意图和实体
 */
export interface QueryIntent {
  type: 'worker_salary' | 'contract_list' | 'project_cost' | 'supplier_payment' | 'certificate' | 'general';
  entities: {
    workerName?: string;
    projectName?: string;
    itemKeyword?: string;
    supplierName?: string;
    yearMonth?: string;
  };
}

function parseNumeric(value: unknown): number {
  const num = Number(value || 0);
  return Number.isFinite(num) ? num : 0;
}

function formatMoney(value: unknown): string {
  return `${parseNumeric(value).toFixed(2)}元`;
}

function normalizeKeyword(value?: string): string | undefined {
  const cleaned = String(value || '')
    .replace(/^(查询|查看|帮我|请|一下|这个|当前)/, '')
    .replace(/(的)?(工资|薪水|薪酬|工资明细|已发工资|未发余额|合同清单|清单|工作内容|合同内|单价).*$/, '')
    .trim();
  return cleaned && cleaned.length >= 2 ? cleaned : undefined;
}

function normalizeProjectName(value?: string): string | undefined {
  const cleaned = String(value || '')
    .replace(/^(查询|查看|帮我|请|当前|这个|该)/, '')
    .replace(/(的)?(合同清单|合同内清单|清单|工作内容|合同单价|综合单价|报价清单).*$/, '')
    .trim();
  const genericProjectNames = new Set(['项目', '某项目', '当前项目', '这个项目', '该项目', '本项目', '对应项目']);
  if (!cleaned || genericProjectNames.has(cleaned)) return undefined;
  return cleaned.length >= 2 ? cleaned : undefined;
}

function normalizeItemKeyword(value?: string): string | undefined {
  const cleaned = String(value || '')
    .replace(/^(查询|查看|帮我|请|当前|这个|该|本项目|项目|合同内|合同里|清单里|清单中|有没有)/, '')
    .replace(/(的)?(合同清单|合同内清单|清单|合同单价|综合单价|计量单位|工作内容|内容|单价|单位|包含哪些|包含|包括|是什么|多少|有没有).*$/, '')
    .trim();
  const genericItemNames = new Set(['项目', '工程', '合同', '清单', '合同内', '工作内容', '计量单位', '报价清单']);
  if (!cleaned || genericItemNames.has(cleaned)) return undefined;
  if (/(项目|标段)$/.test(cleaned)) return undefined;
  return cleaned.length >= 2 ? cleaned : undefined;
}

function paymentMatchKey(record: { worker_id?: number | string | null; project_id?: number | string | null; year_month?: string | null }) {
  return `${record.worker_id || ''}:${record.project_id || ''}:${record.year_month || ''}`;
}

export function detectQueryIntent(input: string): QueryIntent {
  const entities: QueryIntent['entities'] = {};
  let type: QueryIntent['type'] = 'general';

  const monthMatch = input.match(/(\d{4})\s*年\s*(\d{1,2})\s*月/);
  if (monthMatch) {
    entities.yearMonth = `${monthMatch[1]}-${monthMatch[2].padStart(2, '0')}`;
  } else {
    const ymMatch = input.match(/(\d{4}-\d{2})/);
    if (ymMatch) entities.yearMonth = ymMatch[1];
  }

  const workerSalaryIntent = /工资|薪水|薪酬|已发|未发|发放|实发|应发|借支|个税|劳保|工时|工价/.test(input);
  const contractListIntent = /合同清单|合同内|清单|工作内容|合同单价|综合单价|计量单位|报价清单/.test(input);
  const supplierPaymentIntent = /供应商|分包|结算|应付|未付|付款|合同付款|合同结算/.test(input);
  const projectCostIntent = /项目|产值|签证|工程量|利润|成本|报价/.test(input);

  if (workerSalaryIntent) {
    type = 'worker_salary';
    const namePatterns = [
      /(?:查询|查看|统计|帮我查)?\s*([^\s,，。、]{2,8}?)(?:的)?(?:工资|薪水|薪酬|已发|未发|发放|实发|应发)/,
      /(?:工人|师傅)\s*([^\s,，。、]{2,8})/,
    ];
    for (const pattern of namePatterns) {
      const match = input.match(pattern);
      const workerName = normalizeKeyword(match?.[1]);
      if (workerName) {
        entities.workerName = workerName;
        break;
      }
    }
  } else if (contractListIntent) {
    type = 'contract_list';
    const itemPatterns = [
      /(?:合同内|合同里|清单里|清单中)?\s*([^\s,，。、]{2,30}?)(?:包含|包括|的合同单价|的综合单价|的计量单位|的工作内容|单价|单位|内容)/,
      /(?:有没有|查询|查看)\s*([^\s,，。、]{2,30}?)(?:这个)?(?:清单项|项目|内容)?$/,
      /(模板工程|模板|钢筋绑扎|钢筋|混凝土浇筑|混凝土|防水|砌筑|抹灰|脚手架|土方|桩基|二次结构|地下室防水附加项|附加项)/,
    ];
    for (const pattern of itemPatterns) {
      const match = input.match(pattern);
      const itemKeyword = normalizeItemKeyword(match?.[1]);
      if (itemKeyword) {
        entities.itemKeyword = itemKeyword;
        break;
      }
    }
  } else if (supplierPaymentIntent) {
    type = 'supplier_payment';
    const supMatch = input.match(/([^\s,，。、]+?)(?:公司|集团|分包|供应商)/);
    if (supMatch) entities.supplierName = supMatch[1] + (input.includes('公司') ? '公司' : input.includes('集团') ? '集团' : '');
  } else if (projectCostIntent) {
    type = 'project_cost';
  }

  if (projectCostIntent || contractListIntent) {
    const projPatterns = [
      /([^\s,，。、]{2,30}?)(?:项目|工程|标段)/,
      /(?:项目|工程)\s*[:：]?\s*([^\s,，。、]{2,30})/,
    ];
    for (const pattern of projPatterns) {
      const match = input.match(pattern);
      const projectName = normalizeProjectName(match?.[1] || match?.[0]);
      if (projectName) {
        entities.projectName = projectName;
        break;
      }
    }
  }

  if (/证件|到期|过期|身份证|资质|安全员/.test(input)) {
    type = 'certificate';
  }

  return { type, entities };
}

/**
 * 全系统业务数据查询 - 支持按意图精确检索
 * 这是AI助手的"数据大脑"，让AI能查工人工资、项目清单价格、供应商款项等
 */
export async function fetchBusinessDataForContext(
  userRole: string,
  pageContext?: string,
  queryIntent?: QueryIntent,
  projectId?: number,
): Promise<string> {
  const supabase = getSupabaseClient();
  const canSensitive = canAccessSensitiveData(userRole);
  const parts: string[] = [];
  const intent = queryIntent || detectQueryIntent(pageContext || '');

  try {
    // ====== 1. 工人工资数据 ======
    if (intent.type === 'worker_salary' || !pageContext || pageContext.includes('worker') || pageContext.includes('salary') || pageContext.includes('dashboard')) {
      let workerQuery = supabase
        .from('workers')
        .select('id,name,work_type,phone,id_card,project_id,status,entry_date,left_at,projects(name)');
      if (projectId) workerQuery = workerQuery.eq('project_id', projectId);
      if (intent.entities.workerName) workerQuery = workerQuery.ilike('name', `%${intent.entities.workerName}%`);
      const { data: workers } = await workerQuery.limit(intent.entities.workerName ? 20 : 50);

      if (workers && workers.length > 0) {
        const workerSummary = workers.map((w: any) => {
          const projectName = Array.isArray(w.projects) ? w.projects[0]?.name : w.projects?.name;
          const identityHint = canSensitive
            ? `${w.phone ? ` | 手机:${w.phone}` : ''}${w.id_card ? ` | 身份证尾号:${String(w.id_card).slice(-4)}` : ''}`
            : '';
          return `- ${w.name} | 项目:${projectName || '-'} | 工种:${w.work_type || '-'} | 状态:${w.status || '在场'} | 入场:${w.entry_date || '-'} | 退场:${w.left_at || '-'}${identityHint}`;
        }).join('\n');
        parts.push(`【工人花名册】共${workers.length}人\n${workerSummary}${workers.length > 1 && intent.entities.workerName ? '\n提示：匹配到多个同名或近似姓名工人，回答时需要提醒用户按项目、手机号或身份证尾号核对。' : ''}`);

        if (canSensitive) {
          const workerIds = workers.map((w: any) => w.id);
          let salaryQuery = supabase.from('worker_salaries')
            .select('id,worker_id,project_id,year_month,work_hours,hourly_rate,contract_work_pay,gross_pay,income_tax,advance_pay,labor_insurance,fine,net_pay,payment_status,projects(name)')
            .in('worker_id', workerIds)
            .order('year_month', { ascending: false });

          if (intent.entities.yearMonth) salaryQuery = salaryQuery.eq('year_month', intent.entities.yearMonth);
          if (projectId) salaryQuery = salaryQuery.eq('project_id', projectId);
          const { data: salaries } = await salaryQuery.limit(200);

          if (salaries && salaries.length > 0) {
            let paymentQuery = supabase
              .from('salary_payments')
              .select('salary_id,worker_id,project_id,year_month,payment_amount')
              .in('worker_id', workerIds);
            if (intent.entities.yearMonth) paymentQuery = paymentQuery.eq('year_month', intent.entities.yearMonth);
            const { data: payments } = await paymentQuery.limit(500);

            const visibleSalaryIds = new Set(salaries.map((s: any) => Number(s.id)));
            const paidAmountBySalaryId = new Map<number, number>();
            const unlinkedPaidAmountByMatchKey = new Map<string, number>();
            const matchKeyCounts = new Map<string, number>();

            salaries.forEach((record: any) => {
              const key = paymentMatchKey(record);
              matchKeyCounts.set(key, (matchKeyCounts.get(key) || 0) + 1);
            });

            (payments || []).forEach((payment: any) => {
              const amount = parseNumeric(payment.payment_amount);
              const salaryId = Number(payment.salary_id || 0);
              if (salaryId && visibleSalaryIds.has(salaryId)) {
                paidAmountBySalaryId.set(salaryId, (paidAmountBySalaryId.get(salaryId) || 0) + amount);
                return;
              }
              if (payment.worker_id && payment.project_id && payment.year_month) {
                const key = paymentMatchKey(payment);
                if ((matchKeyCounts.get(key) || 0) > 0) {
                  unlinkedPaidAmountByMatchKey.set(key, (unlinkedPaidAmountByMatchKey.get(key) || 0) + amount);
                }
              }
            });

            const getPaidAmount = (record: any) => {
              const linkedPaid = paidAmountBySalaryId.get(Number(record.id)) || 0;
              const key = paymentMatchKey(record);
              const unlinkedTotal = unlinkedPaidAmountByMatchKey.get(key) || 0;
              const keyCount = matchKeyCounts.get(key) || 0;
              return Math.round((linkedPaid + (keyCount > 0 ? unlinkedTotal / keyCount : 0)) * 100) / 100;
            };

            const workerMap = new Map<number, any>(workers.map((w: any) => [Number(w.id), w]));
            const enriched = salaries.map((s: any) => {
              const paidAmount = getPaidAmount(s);
              const netPay = parseNumeric(s.net_pay);
              return {
                ...s,
                worker: workerMap.get(Number(s.worker_id)),
                projectName: Array.isArray(s.projects) ? s.projects[0]?.name : s.projects?.name,
                paidAmount,
                unpaidAmount: calculateSalaryUnpaidAmount(netPay, paidAmount),
                computedStatus: calculateSalaryPaymentStatus(netPay, paidAmount),
              };
            });

            const totalGross = enriched.reduce((sum: number, s: any) => sum + parseNumeric(s.gross_pay), 0);
            const totalNet = enriched.reduce((sum: number, s: any) => sum + parseNumeric(s.net_pay), 0);
            const totalPaid = enriched.reduce((sum: number, s: any) => sum + parseNumeric(s.paidAmount), 0);
            const totalUnpaid = enriched.reduce((sum: number, s: any) => sum + parseNumeric(s.unpaidAmount), 0);

            const salaryLines = enriched.slice(0, intent.entities.workerName ? 30 : 12).map((s: any) => {
              const workerName = s.worker?.name || '未知工人';
              const statusName: Record<string, string> = { unpaid: '未发', partial: '部分发放', paid: '已发清', overpaid: '超发' };
              return `- ${workerName} | ${s.year_month} | 项目:${s.projectName || '-'} | 应发:${formatMoney(s.gross_pay)} | 实发/应付:${formatMoney(s.net_pay)} | 已发:${formatMoney(s.paidAmount)} | 未发:${formatMoney(s.unpaidAmount)} | 状态:${statusName[s.computedStatus] || s.computedStatus} | 工时:${parseNumeric(s.work_hours)} | 工价:${formatMoney(s.hourly_rate)}`;
            });

            parts.push(`【工人工资查询结果】共${salaries.length}条工资记录\n汇总：累计应发${formatMoney(totalGross)}，累计实发/应付${formatMoney(totalNet)}，累计已发${formatMoney(totalPaid)}，未发余额${formatMoney(totalUnpaid)}\n明细：\n${salaryLines.join('\n')}\n来源入口：[月度工资](/workers/salaries${intent.entities.workerName ? `?worker_id=${workers[0].id}` : ''})、[工人档案](/workers/query${intent.entities.workerName ? `?keyword=${encodeURIComponent(intent.entities.workerName)}` : ''})`);
          } else {
            parts.push(`【工人工资查询结果】已找到工人，但没有匹配到工资记录。可到[月度工资](/workers/salaries)核对是否已录入工资。`);
          }
        } else {
          parts.push('【工资数据权限】当前角色不可查看工资金额明细，回答时只说明无法展示敏感金额，并引导联系管理员或财务。');
        }
      } else if (intent.entities.workerName) {
        parts.push(`【工人工资查询结果】未找到姓名包含“${intent.entities.workerName}”的工人。可让用户补充项目、手机号或检查花名册姓名。`);
      }
    }

    // ====== 2. 合同清单/项目工程量清单数据 ======
    if (intent.type === 'contract_list' || intent.type === 'project_cost' || !pageContext || pageContext.includes('project') || pageContext.includes('work-item') || pageContext.includes('quantity') || pageContext.includes('dashboard')) {
      let projQuery = supabase.from('projects').select('id,name,year,status,expected_completion_date');
      if (projectId) projQuery = projQuery.eq('id', projectId);
      if (intent.entities.projectName) projQuery = projQuery.ilike('name', `%${intent.entities.projectName.replace(/(项目|工程|标段)$/, '')}%`);
      const { data: projects } = await projQuery.limit(intent.entities.projectName ? 10 : 20);

      if (projects && projects.length > 0) {
        const projLines: string[] = [];
        for (const p of projects) {
          let line = `${p.name} (${p.year || '-'}, ${p.status || '-'})`;
          if (p.expected_completion_date) line += ` | 预计完工:${p.expected_completion_date}`;

          if (canSensitive) {
            const { data: subitems } = await supabase.from('work_item_subitems')
              .select('subitem_name,unit,budget_quantity,contract_price,unit_price,limit_price,remark')
              .eq('project_id', p.id)
              .limit(intent.entities.itemKeyword ? 100 : 30);
            const { data: workItems } = await supabase.from('work_items')
              .select('item_name,unit,budget_quantity,unit_price')
              .eq('project_id', p.id)
              .limit(intent.entities.itemKeyword ? 100 : 30);
            const { data: contracts } = await supabase.from('project_contracts')
              .select('file_name,file_size,remark,created_at')
              .eq('project_id', p.id)
              .limit(5);

            const keyword = intent.entities.itemKeyword?.toLowerCase();
            const matchedSubitems = keyword
              ? (subitems || []).filter((item: any) =>
                String(item.subitem_name || '').toLowerCase().includes(keyword)
                || String(item.remark || '').toLowerCase().includes(keyword)
              )
              : (subitems || []);
            const matchedWorkItems = keyword
              ? (workItems || []).filter((item: any) =>
                String(item.item_name || '').toLowerCase().includes(keyword)
              )
              : (workItems || []);

            if (matchedSubitems.length > 0) {
              line += `\n  结构化合同/工程量清单（分项工程）：`;
              line += matchedSubitems.slice(0, 12).map((item: any) => {
                const price = item.contract_price ?? item.unit_price ?? item.limit_price ?? '-';
                return `\n  - ${item.subitem_name} | 单位:${item.unit || '-'} | 匹配量:${item.budget_quantity || '-'} | 合同单价:${price === '-' ? '-' : formatMoney(price)} | 工作内容/备注:${item.remark || '-'}`;
              }).join('');
            } else if (matchedWorkItems.length > 0) {
              line += `\n  结构化工程量清单：`;
              line += matchedWorkItems.slice(0, 12).map((item: any) => `\n  - ${item.item_name} | 单位:${item.unit || '-'} | 预算量:${item.budget_quantity || '-'} | 单价:${formatMoney(item.unit_price)}`).join('');
            } else if (intent.entities.itemKeyword && ((subitems && subitems.length > 0) || (workItems && workItems.length > 0))) {
              line += `\n  未找到名称或备注匹配“${intent.entities.itemKeyword}”的结构化清单项。回答时需说明当前项目已有清单，但未匹配到该项，建议到报量管理核对清单名称或补录。`;
            } else if (contracts && contracts.length > 0) {
              line += `\n  只找到合同文件：${contracts.map((c: any) => c.file_name).join('、')}。未找到结构化清单，回答时需说明需先导入/解析合同清单，不能编造扫描件内容。`;
            } else {
              line += '\n  未找到结构化合同清单或合同文件。';
            }
          }

          line += `\n  来源入口：[报量管理](/quantity-reporting?project_id=${p.id})、[项目详情](/projects/${p.id})、[知识库](/knowledge)`;
          projLines.push(line);
        }
        parts.push(`【合同清单查询结果】共${projects.length}个项目\n${projLines.join('\n')}`);
      } else if (intent.entities.projectName) {
        parts.push(`【合同清单查询结果】未找到名称匹配“${intent.entities.projectName}”的项目。可让用户补充项目全称或到项目管理核对。`);
      }
    }

    // ====== 3. 供应商&合同付款数据 ======
    if (intent.type === 'supplier_payment' || !pageContext || pageContext.includes('supplier') || pageContext.includes('cost') || pageContext.includes('dashboard')) {
      const { data: suppliers } = await supabase.from('suppliers').select('id,name,contact_person,phone').limit(30);
      if (suppliers && suppliers.length > 0 && canSensitive) {
        const supplierLines: string[] = [];
        for (const sp of suppliers) {
          let line = `${sp.name} | 联系人:${sp.contact_person || '-'}`;
          let contractQuery = supabase.from('supplier_contracts')
            .select('id,contract_name,total_amount,cumulative_paid,contract_status,project_id')
            .eq('supplier_id', sp.id);
          if (projectId) contractQuery = contractQuery.eq('project_id', projectId);
          const { data: contracts } = await contractQuery;

          if (contracts && contracts.length > 0) {
            for (const c of contracts) {
              const unpaid = parseNumeric(c.total_amount) - parseNumeric(c.cumulative_paid);
              line += `\n  合同:${c.contract_name} | 总额:${formatMoney(c.total_amount)} | 已付:${formatMoney(c.cumulative_paid)} | 未付:${formatMoney(unpaid)} | 状态:${c.contract_status || '履约中'}`;
            }
          }

          const { data: oldSettlements } = await supabase.from('settlements')
            .select('settlement_amount,settlement_date,settlement_month')
            .eq('supplier_id', sp.id);
          if (oldSettlements && oldSettlements.length > 0) {
            const totalSettlement = oldSettlements.reduce((sum: number, s: any) => sum + parseNumeric(s.settlement_amount), 0);
            line += `\n  累计结算:${formatMoney(totalSettlement)}(${oldSettlements.length}笔)`;
          }

          supplierLines.push(line);
        }
        parts.push(`【供应商台账】共${suppliers.length}家\n${supplierLines.join('\n')}`);
      }
    }

    // ====== 4. 证件管理 ======
    if (intent.type === 'certificate' || pageContext?.includes('certificate') || pageContext?.includes('notif')) {
      const { data: expiringCerts } = await supabase
        .from('certificates')
        .select('name,certificate_number,owner_name,expiry_date,owner_type')
        .lt('expiry_date', new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10))
        .gt('expiry_date', new Date().toISOString().slice(0, 10))
        .limit(20);
      if (expiringCerts && expiringCerts.length > 0) {
        parts.push(`【即将过期证件】30天内，共${expiringCerts.length}项\n${expiringCerts.map((c: any) => `- ${c.name} | 持有:${c.owner_name || '-'} | 编号:${c.certificate_number || '-'} | 到期:${c.expiry_date}`).join('\n')}`);
      }
      const { data: expiredCerts } = await supabase
        .from('certificates')
        .select('name,certificate_number,owner_name,expiry_date')
        .lt('expiry_date', new Date().toISOString().slice(0, 10))
        .limit(10);
      if (expiredCerts && expiredCerts.length > 0) {
        parts.push(`【已过期证件】共${expiredCerts.length}项\n${expiredCerts.map((c: any) => `- ${c.name} | 持有:${c.owner_name || '-'} | 到期:${c.expiry_date}`).join('\n')}`);
      }
    }

    // ====== 5. 甲方报量/付款数据 ======
    if (pageContext?.includes('client-report') || pageContext?.includes('client-payment') || intent.type === 'project_cost') {
      if (canSensitive) {
        let reportQuery = supabase.from('client_reports').select('project_id,work_content,quantity,unit_price,settlement_amount,report_date,status');
        if (projectId) reportQuery = reportQuery.eq('project_id', projectId);
        const { data: clientReports } = await reportQuery.neq('status', 'voided').order('report_date', { ascending: false }).limit(30);
        if (clientReports && clientReports.length > 0) {
          parts.push(`【甲方报量】共${clientReports.length}条\n${clientReports.map((r: any) => `- ${r.work_content} | 数量:${r.quantity} | 单价:${formatMoney(r.unit_price)} | 金额:${formatMoney(r.settlement_amount || parseNumeric(r.quantity) * parseNumeric(r.unit_price))} | 日期:${r.report_date} | 状态:${r.status || 'draft'}`).join('\n')}`);
        }

        let paymentQuery = supabase.from('client_payments').select('project_id,payment_amount,payment_date,payment_method,status');
        if (projectId) paymentQuery = paymentQuery.eq('project_id', projectId);
        const { data: clientPayments } = await paymentQuery.order('payment_date', { ascending: false }).limit(30);
        if (clientPayments && clientPayments.length > 0) {
          parts.push(`【甲方付款】共${clientPayments.length}条\n${clientPayments.map((pm: any) => `- 金额:${formatMoney(pm.payment_amount)} | 日期:${pm.payment_date} | 方式:${pm.payment_method || '-'} | 状态:${pm.status || 'completed'}`).join('\n')}`);
        }
      }
    }

    // ====== 6. 全局概览数据（无特定意图时） ======
    if (intent.type === 'general' && !pageContext) {
      const { count: projectCount } = await supabase.from('projects').select('*', { count: 'exact', head: true });
      const { count: workerCount } = await supabase.from('workers').select('*', { count: 'exact', head: true });
      const { count: supplierCount } = await supabase.from('suppliers').select('*', { count: 'exact', head: true });
      parts.push(`【系统概览】项目:${projectCount || 0}个 | 工人:${workerCount || 0}人 | 供应商:${supplierCount || 0}家`);

      if (canSensitive) {
        const { data: salaryAgg } = await supabase.from('worker_salaries').select('gross_pay,net_pay');
        const totalGross = (salaryAgg || []).reduce((s: number, r: any) => s + parseNumeric(r.gross_pay), 0);
        const totalNet = (salaryAgg || []).reduce((s: number, r: any) => s + parseNumeric(r.net_pay), 0);
        parts.push(`【工资统计】累计应发:${formatMoney(totalGross)} | 累计实发/应付:${formatMoney(totalNet)}`);
      }
    }

  } catch (e) {
    console.error('[AI] Fetch business data failed:', e);
  }

  return parts.join('\n\n');
}

// ============ 系统提示词 ============

export function buildSystemPrompt(
  userRole: string,
  pageContext?: string,
  businessData?: string,
  knowledgeContext?: string,
  systemKnowledge?: string
): string {
  const canSensitive = canAccessSensitiveData(userRole);
  const roleName: Record<string, string> = {
    super_admin: '超级管理员', admin: '管理员', finance: '财务人员',
    budget: '预算员', boss: '老板', project_manager: '项目经理',
    team_leader: '班组负责人', site_staff: '现场人员',
  };

  return `你是建筑劳务企业数据管理系统的AI劳务助手，专精建筑劳务、财务、项目管理领域。

## 用户信息
- 当前角色：${roleName[userRole] || userRole}
- 数据权限：${canSensitive ? '可查看完整金额数据（含工资、结算、付款等敏感信息）' : '仅可查看脱敏金额数据，不可查看工资、结算、付款等敏感金额'}
- 当前页面：${pageContext || '首页'}

## 核心能力
1. **工人工资查询**：按工人姓名、项目、月份查询工资明细，区分应发、实发/应付、已发、未发余额
2. **合同清单查询**：按项目查询合同内清单、工作内容、单位、匹配量、合同单价，优先使用结构化工程量清单
3. **供应商款项查询**：查询各供应商合同金额、已付/未付/结算情况、合同状态
4. **证件到期管理**：查询即将过期和已过期证件，提醒办理
5. **报表智能解读**：自动分析看板图表，输出资金、用工风险提醒
6. **合同文件解读**：解析用户上传的分包合同、劳务合同、报价清单文件，提取关键条款
7. **综合经营分析**：多维度交叉分析，对比项目成本、人工、回款差异

## 回答规范
- 使用中文回答，数据用**表格**或**列表**清晰展示
- 金额保留2位小数，超过1万用万元单位（如 1.23万元）
- 百分比保留1位小数
- 回答工人工资时：必须列出工人姓名、所属项目、月份、应发、实发/应付、已发、未发余额、发放状态；如果同名工人超过1人，先提醒按项目/手机号/身份证尾号核对
- 回答供应商款项时：列出供应商名→合同名→总额→已付→未付→合同状态
- 回答合同清单时：列出项目名、清单项/分项工程、单位、匹配量/预算量、合同单价、工作内容/备注、来源入口
- 合同清单、金额、单价必须来自业务台账或知识库；只找到合同文件但没有结构化清单时，明确说明“未找到结构化清单，需先导入/解析”，不能编造扫描件内容
- 发现风险时主动提醒（🔴高危 🟡警告 🟢正常）
- 引用业务数据时生成可点击链接，优先使用：[月度工资](/workers/salaries)、[工人档案](/workers/query)、[报量管理](/quantity-reporting)、[项目详情](/projects/ID)、[供应商](/supplier-contracts)
- 如无法回答，建议用户联系管理员或查阅系统帮助

## 业务规则
- 工资计算：应发工资 = 工时×工价 + 包活工资；实发工资 = 应发工资 - 个税 - 借支 - 劳保
- 工资发放口径：已发工资来自 salary_payments；优先按工资单ID匹配，老数据按工人+项目+月份兜底匹配；未发余额 = 实发/应付 - 已发
- 利润率 = (总结算金额 - 总成本) / 总结算金额 × 100%
- 回款率 = 已回款金额 / 总结算金额 × 100%
- 回款率超100%为超收/预收，需标注🟡风险
- 成本超支：实际成本 > 预算成本时🔴预警
- 证件到期：30天🟢/15天🟡/7天🔴/已过期🔴 四级提醒
- 结算金额以settlement_amount为准，排除已作废(voided)记录

## 数据来源
- 系统后台业务台账：项目、工人、工资、供应商、合同、结算、付款、证件
- 用户上传的合同文件：分包合同、劳务合同、报价清单（通过知识库检索）
- 两者可联合查询：如"南京项目分包合同清单单价"会同时查系统台账+上传合同文件

## 禁止事项
- 不回答与建筑劳务业务无关的问题
- 不泄露系统内部实现细节或API密钥
- 不修改或删除任何业务数据，只提供查询和分析建议
- ${!canSensitive ? '不展示工资、结算、付款等敏感金额数据，用"***"替代' : ''}
${knowledgeContext ? `\n## 知识库参考（含用户上传合同文件）\n${knowledgeContext}` : ''}
${systemKnowledge ? `\n## 系统知识库参考（月度分析、手动经验等）\n${systemKnowledge}` : ''}
${businessData ? `\n## 当前业务数据（实时查询）\n${businessData}` : ''}`;
}

// ============ 离线兜底问答库 ============

const OFFLINE_QA: Record<string, string> = {
  '工资计算': '应发工资 = 工时×工价 + 包活工资；实发工资 = 应发工资 - 个税 - 借支 - 劳保。在月度工资页面可以录入工时和工价，系统会自动计算。',
  '工资': '工资数据查询暂时不可用，您可以在【月度工资】页面直接查看。应发工资 = 工时×工价 + 包活工资；实发工资 = 应发工资 - 个税 - 借支 - 劳保。',
  '证件到期': '系统会自动检测证件到期情况，30天/15天/7天/已过期四级提醒，在消息通知中心可以查看所有到期提醒。',
  '供应商付款': '在供应商结算页面录入结算单，然后在付款情况页面录入付款记录。系统会自动校验付款是否超额。',
  '供应商': '供应商数据查询暂时不可用，您可以在【供应商结算】页面直接查看合同和付款信息。',
  '甲方报量': '在甲方报量页面新增报量记录，填写工作内容、数量、单价，系统自动计算报量金额 = 数量 × 单价。',
  '利润率': '利润率 = (总结算金额 - 总成本) / 总结算金额 × 100%。在成本利润中心可以查看各项目的利润率分析。',
  '回款率': '回款率 = 已回款金额 / 总结算金额 × 100%。回款率超过100%说明甲方多付，属于预收/超收情况。',
  '签证': '在签证管理页面可以新增签证记录，AI可以辅助生成签证描述文案。',
  '成本超支': '当实际成本超过预算成本时系统会自动预警。在成本利润中心可以查看各项目的成本超支情况。',
  '清单': '工程量清单在【报量管理】页面查看，包含分项名称、单位、预算量、单价等信息。',
  '合同': '合同文件可在AI助手中上传，系统会自动解析合同内容并存入知识库，后续可直接查询合同条款和报价明细。',
  '项目': '项目数据查询暂时不可用，您可以在【项目管理】页面直接查看项目详情和统计数据。',
};

export function getOfflineAnswer(input: string): string | null {
  const lower = input.toLowerCase();
  for (const [key, answer] of Object.entries(OFFLINE_QA)) {
    if (lower.includes(key.toLowerCase())) return answer;
  }
  return '抱歉，AI服务暂时不可用，请稍后再试。如有紧急问题，请联系系统管理员。';
}
