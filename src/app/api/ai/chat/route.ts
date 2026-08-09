import { NextRequest, NextResponse } from 'next/server';
import {
  getAIConfig, createConfiguredLLMClient, extractForwardHeaders, checkDailyLimit, incrementDailyUsage,
  checkModulePermission, maskSensitiveInfo, isBusinessRelated, logAIAudit,
  saveChatMessage, fetchBusinessDataForContext,
  buildSystemPrompt, searchKnowledge, searchSystemKnowledge, getOfflineAnswer,
  detectQueryIntent,
} from '@/lib/ai-service';
import { requireAuth } from '@/lib/api-auth';

type ChatRole = 'system' | 'user' | 'assistant';

type ChatMessageInput = {
  role?: unknown;
  content?: unknown;
};

type ChatMessage = {
  role: ChatRole;
  content: string;
};

type AiChatRequestBody = {
  messages?: ChatMessageInput[];
  session_id?: string;
  page_context?: string;
};

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function getChunkText(chunk: unknown): string {
  if (typeof chunk === 'string') return chunk;

  const record = toRecord(chunk);
  const content = record.content;

  if (Array.isArray(content)) {
    return content
      .map((block) => {
        const blockRecord = toRecord(block);
        return String(blockRecord.text || blockRecord.content || '');
      })
      .join('');
  }

  return String(content || record.text || '');
}

// 消息角色校验与过滤
function validateAndFilterMessages(messages: ChatMessageInput[]): ChatMessage[] {
  const validRoles = new Set<ChatRole>(['system', 'user', 'assistant']);
  const filtered = messages
    .filter((m): m is { role: ChatRole; content: unknown } => (
      Boolean(m?.role && validRoles.has(m.role as ChatRole) && m.content)
    ))
    .map(m => ({ role: m.role, content: String(m.content).slice(0, 4000) }));

  // 确保第一条是 system
  if (filtered.length > 0 && filtered[0].role !== 'system') {
    filtered.unshift({ role: 'system', content: '你是建筑劳务企业AI助手。' });
  }
  // 合并连续相同角色
  const merged: ChatMessage[] = [];
  for (const msg of filtered) {
    if (merged.length > 0 && merged[merged.length - 1].role === msg.role) {
      merged[merged.length - 1].content += '\n' + msg.content;
    } else {
      merged.push({ ...msg });
    }
  }
  // 末尾必须是 user
  while (merged.length > 1 && merged[merged.length - 1].role !== 'user') {
    merged.pop();
  }
  return merged;
}

// 检测用户意图对应的模块
function detectModule(input: string): string {
  const lower = input.toLowerCase();
  if (/供应商|应付|合同状态|付款风险|成本测算/.test(lower)) return 'module_supplier_analysis';
  if (/工资|核算|个税|劳保|证件到期|用工合规/.test(lower)) return 'module_salary_analysis';
  if (/签证|工程量|成本预估/.test(lower)) return 'module_visa_assistant';
  if (/报错|错误|400|500|排查|修复/.test(lower)) return 'module_error_diagnosis';
  if (/生成|导出|合同文本|对账函|通知单/.test(lower)) return 'module_doc_generation';
  if (/报表|看板|分析|解读|趋势/.test(lower)) return 'module_report_analysis';
  return 'module_data_query';
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  let userId = 0;
  let username = '';
  let userRole = 'team_leader';
  let sessionId = '';
  let pageContext = '';
  let inputSummary = '';

  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    // 解析请求
    const body = await request.json() as AiChatRequestBody;
    const messages = Array.isArray(body.messages) ? body.messages : [];
    sessionId = body.session_id || `sess_${Date.now()}`;
    pageContext = body.page_context || '';
    // 身份只从登录 token 解析，避免客户端伪造 user_id/user_role。
    userId = auth.user.id;
    userRole = auth.user.role || 'team_leader';
    username = auth.user.name || auth.user.username || '';

    if (messages.length === 0) {
      return new Response(JSON.stringify({ success: false, error: '消息不能为空' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    // 获取AI配置
    const config = await getAIConfig();
    if (!config || !config.enabled) {
      return new Response(JSON.stringify({ success: false, error: 'AI助手未启用' }), {
        status: 403, headers: { 'Content-Type': 'application/json' },
      });
    }

    // 惰性自动同步：距上次同步超过阈值（默认24h）时自动刷新业务知识库，保证 AI 回答基于最新数据
    try {
      const { maybeAutoSyncBusinessData } = await import('@/lib/ai-knowledge-sync');
      await maybeAutoSyncBusinessData(forwardHeaders);
    } catch (e) {
      console.warn('[Chat] auto sync skipped:', e);
    }

    // 检查每日限额
    const { allowed } = await checkDailyLimit(userId, config.daily_limit);
    if (!allowed) {
      return new Response(JSON.stringify({
        success: false, error: `今日AI调用已达上限(${config.daily_limit}次)`,
      }), { status: 429, headers: { 'Content-Type': 'application/json' } });
    }

    // 获取用户最后一条消息
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    inputSummary = lastUserMsg ? String(lastUserMsg.content).slice(0, 100) : '';

    // 内容安全过滤
    if (config.content_filter_enabled && !isBusinessRelated(inputSummary)) {
      await logAIAudit({
        userId, username, action: 'chat_blocked', inputSummary,
        pageContext, modelId: config.model_id, responseTimeMs: Date.now() - startTime,
        isSuccess: false, errorMessage: '违规提问拦截',
      });
      return new Response(JSON.stringify({
        success: false, error: '仅支持建筑劳务、财务、项目管理相关的业务咨询',
      }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // 模块权限检查
    const moduleKey = detectModule(inputSummary);
    const moduleCheck = checkModulePermission(config, moduleKey, userRole);
    if (!moduleCheck.allowed) {
      return new Response(JSON.stringify({
        success: false, error: moduleCheck.reason || '您无权使用此AI功能',
      }), { status: 403, headers: { 'Content-Type': 'application/json' } });
    }

    // 获取知识库上下文
    // 提取转发请求头（LLM和知识库调用都需要）
    const forwardHeaders = extractForwardHeaders(request.headers);

    let knowledgeContext = '';
    try {
      knowledgeContext = await searchKnowledge(inputSummary, 3, forwardHeaders);
    } catch (e) {
      console.error('[AI] Knowledge search error:', e);
    }

    // 搜索系统知识库（月度分析、手动经验等）
    let systemKnowledge = '';
    try {
      systemKnowledge = await searchSystemKnowledge(inputSummary);
    } catch (e) {
      console.error('[AI] System knowledge search error:', e);
    }

    // 获取业务数据上下文（基于用户意图智能检索）
    let businessData = '';
    try {
      const queryIntent = detectQueryIntent(inputSummary);
      businessData = await fetchBusinessDataForContext(userRole, pageContext, queryIntent);
    } catch (e) {
      console.error('[AI] Business data fetch error:', e);
    }

    // 构建系统提示词
    const systemPrompt = buildSystemPrompt(userRole, pageContext, businessData, knowledgeContext, systemKnowledge);

    // 处理历史消息
    const filteredMessages = validateAndFilterMessages(messages);
    // 替换或插入系统提示词
    if (filteredMessages[0]?.role === 'system') {
      filteredMessages[0].content = systemPrompt;
    } else {
      filteredMessages.unshift({ role: 'system', content: systemPrompt });
    }

    // 截取上下文长度
    const contextMessages = filteredMessages.slice(-config.max_context_length * 2 - 1);

    // 调用LLM - 流式输出（注入 ai_configs 的 api_key，修复凭据未传递问题）
    const client = await createConfiguredLLMClient(forwardHeaders);
    if (!client) {
      return NextResponse.json(
        { success: false, error: 'AI 服务未配置 API Key，请联系管理员在「系统管理 → AI 配置」中填写' },
        { status: 503 }
      );
    }
    const llmMessages = contextMessages.map((m) => ({ role: m.role, content: m.content }));
    const stream = await client.stream(llmMessages, {
      model: config.model_id,
      temperature: Number(config.temperature),
    });

    // 增加每日调用计数
    await incrementDailyUsage(userId);

    // 保存用户消息
    await saveChatMessage({
      sessionId, userId, username, role: 'user',
      content: inputSummary, pageContext, modelId: config.model_id,
    });

    // 创建SSE流式响应
    const encoder = new TextEncoder();
    let fullResponse = '';

    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const text = getChunkText(chunk);
            if (!text) continue;

            // 敏感信息脱敏
            const maskedText = config.mask_sensitive ? maskSensitiveInfo(text) : text;
            fullResponse += maskedText;

            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: maskedText })}\n\n`));
          }

          // 保存AI回复
          await saveChatMessage({
            sessionId, userId, username, role: 'assistant',
            content: fullResponse.slice(0, 4000), pageContext, modelId: config.model_id,
            isMasked: config.mask_sensitive,
          });

          // 审计日志
          await logAIAudit({
            userId, username, action: 'chat', inputSummary,
            outputSummary: fullResponse.slice(0, 200), pageContext,
            modelId: config.model_id, responseTimeMs: Date.now() - startTime,
            isSuccess: true,
          });

          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
          controller.close();
        } catch (streamError: unknown) {
          const streamErrorMessage = getErrorMessage(streamError, 'AI 流式响应失败');
          console.error('[AI] Stream error:', streamError);

          // 审计日志 - 流错误
          await logAIAudit({
            userId, username, action: 'chat', inputSummary, pageContext,
            modelId: config.model_id, responseTimeMs: Date.now() - startTime,
            isSuccess: false, errorMessage: streamErrorMessage,
          });

          // 离线兜底
          if (config.offline_fallback_enabled && !fullResponse) {
            const fallback = getOfflineAnswer(inputSummary);
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: fallback, is_offline: true })}\n\n`));
          }

          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
          controller.close();
        }
      },
    });

    return new Response(readableStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-AI-Session-Id': sessionId,
      },
    });
  } catch (e: unknown) {
    const errorMessage = getErrorMessage(e, 'AI服务暂时不可用');
    console.error('[AI] Chat error:', e);

    // 审计日志
    await logAIAudit({
      userId, username, action: 'chat', inputSummary, pageContext,
      responseTimeMs: Date.now() - startTime, isSuccess: false,
      errorMessage,
    });

    // 离线兜底
    const config = await getAIConfig();
    if (config?.offline_fallback_enabled) {
      const fallback = getOfflineAnswer(inputSummary || '');
      return new Response(JSON.stringify({
        success: true, content: fallback, is_offline: true,
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ success: false, error: 'AI服务暂时不可用' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}

// GET /api/ai/chat - 获取历史会话列表
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const userId = auth.user.id;
    const sessionId = searchParams.get('session_id');
    const action = searchParams.get('action');

    if (!userId) {
      return new Response(JSON.stringify({ success: false, error: '缺少用户ID' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    if (action === 'sessions') {
      const { getUserSessions } = await import('@/lib/ai-service');
      const sessions = await getUserSessions(userId);
      return new Response(JSON.stringify({ success: true, data: sessions }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (sessionId) {
      const { getChatHistory } = await import('@/lib/ai-service');
      const history = await getChatHistory(sessionId);
      const ownHistory = history.filter((item: { user_id?: number | string }) => Number(item.user_id) === userId);
      return new Response(JSON.stringify({ success: true, data: ownHistory }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: false, error: '缺少参数' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: unknown) {
    return new Response(JSON.stringify({ success: false, error: getErrorMessage(e, '获取失败') }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}
