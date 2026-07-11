import { NextRequest } from 'next/server';
import {
  getAIConfig, createLLMClient, extractForwardHeaders, checkDailyLimit, incrementDailyUsage,
  checkModulePermission, maskSensitiveInfo, isBusinessRelated, logAIAudit,
  saveChatMessage, getChatHistory, fetchBusinessDataForContext,
  buildSystemPrompt, searchKnowledge, searchSystemKnowledge, getOfflineAnswer,
  clearAIConfigCache, detectQueryIntent,
} from '@/lib/ai-service';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 消息角色校验与过滤
function validateAndFilterMessages(messages: any[]): any[] {
  const validRoles = new Set(['system', 'user', 'assistant']);
  const filtered = messages
    .filter(m => m && m.role && validRoles.has(m.role) && m.content)
    .map(m => ({ role: m.role, content: String(m.content).slice(0, 4000) }));

  // 确保第一条是 system
  if (filtered.length > 0 && filtered[0].role !== 'system') {
    filtered.unshift({ role: 'system', content: '你是建筑劳务企业AI助手。' });
  }
  // 合并连续相同角色
  const merged: any[] = [];
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
    // 解析请求
    const body = await request.json();
    const messages = body.messages || [];
    sessionId = body.session_id || `sess_${Date.now()}`;
    pageContext = body.page_context || '';
    // 从中间件注入的请求头获取用户信息（安全，不可伪造）
    userId = parseInt(request.headers.get('x-user-id') || '0') || body.user_id || 0;
    userRole = request.headers.get('x-user-role') || body.user_role || 'team_leader';
    username = body.username || '';

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

    // 检查每日限额
    const { allowed, used } = await checkDailyLimit(userId, config.daily_limit);
    if (!allowed) {
      return new Response(JSON.stringify({
        success: false, error: `今日AI调用已达上限(${config.daily_limit}次)`,
      }), { status: 429, headers: { 'Content-Type': 'application/json' } });
    }

    // 获取用户最后一条消息
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    inputSummary = lastUserMsg?.content?.slice(0, 100) || '';

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

    // 搜索系统知识库（月度分析、施工日志等）
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

    // 调用LLM - 流式输出
    const client = createLLMClient(forwardHeaders);
    const llmMessages = contextMessages.map((m: any) => ({ role: m.role, content: m.content }));
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
            const text = typeof chunk === 'string' ? chunk
              : Array.isArray(chunk?.content) ? chunk.content.map((b: any) => b?.text || b?.content || '').join('')
              : chunk?.content?.toString() || chunk?.text || '';
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
        } catch (streamError: any) {
          console.error('[AI] Stream error:', streamError);

          // 审计日志 - 流错误
          await logAIAudit({
            userId, username, action: 'chat', inputSummary, pageContext,
            modelId: config.model_id, responseTimeMs: Date.now() - startTime,
            isSuccess: false, errorMessage: streamError.message,
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
  } catch (e: any) {
    console.error('[AI] Chat error:', e);

    // 审计日志
    await logAIAudit({
      userId, username, action: 'chat', inputSummary, pageContext,
      responseTimeMs: Date.now() - startTime, isSuccess: false,
      errorMessage: e.message,
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
    const { searchParams } = new URL(request.url);
    const userId = parseInt(searchParams.get('user_id') || '0');
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
      return new Response(JSON.stringify({ success: true, data: history }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: false, error: '缺少参数' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ success: false, error: e.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}
