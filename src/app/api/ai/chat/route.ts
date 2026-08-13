import { NextRequest } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { verifyToken } from '@/lib/auth';
import {
  searchKnowledge,
  searchSystemKnowledge,
  buildSystemPrompt,
  isBusinessRelated,
  checkDailyLimit,
  incrementDailyUsage,
  fetchBusinessDataForContext,
  detectQueryIntent,
  createConfiguredLLMClient,
  extractForwardHeaders,
  getAIConfig,
} from '@/lib/ai-service';

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('x-session') || request.cookies.get('auth_token')?.value;
    if (!token) {
      return new Response(JSON.stringify({ success: false, error: '未登录' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const payload = await verifyToken(token);
    if (!payload) {
      return new Response(JSON.stringify({ success: false, error: '登录已过期' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = await request.json();
    const { messages } = body;
    const pageContext = typeof body.pageContext === 'string'
      ? body.pageContext
      : (typeof body.page_context === 'string' ? body.page_context : undefined);
    const projectIdValue = body.projectId ?? body.project_id;
    const parsedProjectId = Number(projectIdValue || 0);
    const projectId = Number.isFinite(parsedProjectId) && parsedProjectId > 0 ? parsedProjectId : undefined;

    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ success: false, error: '消息格式错误' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 过滤无效消息（role 为空或非法）
    const validRoles = ['user', 'assistant', 'system'];
    const filteredMessages: ChatMessage[] = messages.filter(
      (m: ChatMessage) => m && m.role && validRoles.includes(m.role)
    );
    if (filteredMessages.length === 0) {
      return new Response(JSON.stringify({ success: false, error: '没有有效的消息' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 获取用户输入摘要
    const lastMessage = filteredMessages[filteredMessages.length - 1];
    const inputSummary = typeof lastMessage.content === 'string' ? lastMessage.content : '';

    // 内容过滤检查（仅允许建筑劳务/财务/项目相关）
    if (!isBusinessRelated(inputSummary)) {
      return new Response(
        JSON.stringify({ success: false, error: '仅允许建筑劳务/财务/项目相关问题' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 提取转发请求头（LLM 和知识库调用都需要）
    const forwardHeaders = extractForwardHeaders(request.headers);

    // 获取 AI 配置
    const aiConfig = await getAIConfig();
    if (!aiConfig || !aiConfig.enabled) {
      const reason = !aiConfig
        ? 'AI 服务未配置，请先在「系统管理 → AI 配置」中设置'
        : 'AI 服务已禁用，请在「系统管理 → AI 配置」中开启';
      return new Response(JSON.stringify({ success: false, error: reason, code: 'AI_NOT_READY' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 检查每日限额
    const dailyLimit = aiConfig.daily_limit ?? 100;
    const { allowed, used } = await checkDailyLimit(payload.id, dailyLimit);
    if (!allowed) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `每日调用限额已用完（已用 ${used} 次，限额 ${dailyLimit} 次）`,
          code: 'DAILY_LIMIT_EXCEEDED',
        }),
        { status: 429, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 惰性自动同步：距上次同步超过阈值时自动刷新业务知识库
    try {
      const { maybeAutoSyncBusinessData } = await import('@/lib/ai-knowledge-sync');
      await maybeAutoSyncBusinessData(forwardHeaders);
    } catch (e) {
      console.warn('[Chat] auto sync skipped:', e);
    }

    // 获取知识库上下文
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

    // 获取业务数据上下文（基于用户角色和页面上下文）
    let businessContext = '';
    try {
      const queryIntent = detectQueryIntent(inputSummary);
      businessContext = await fetchBusinessDataForContext(
        payload.role || 'team_leader',
        pageContext,
        queryIntent,
        projectId
      );
    } catch (e) {
      console.error('[AI] Business context error:', e);
    }

    // 构建系统提示词（使用 ai-service 中的 buildSystemPrompt）
    const systemPrompt = buildSystemPrompt(
      payload.role || 'team_leader',
      pageContext,
      businessContext,
      knowledgeContext,
      systemKnowledge
    );

    // 构建 LLM 客户端
    const llmClient = await createConfiguredLLMClient(forwardHeaders);
    if (!llmClient) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'AI 模型凭据未配置，请在「系统管理 → AI 配置」中填写 API Key',
          code: 'AI_NOT_READY',
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 构建消息列表
    const chatMessages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...filteredMessages,
    ];

    // 调用 LLM 流式输出（SDK API: client.stream(messages, options)）
    const stream = await llmClient.stream(chatMessages, {
      model: aiConfig.model_id || 'doubao-1-5-pro-256k-250815',
      temperature: aiConfig.temperature ?? 0.7,
    });

    // 记录 Token 使用量
    incrementDailyUsage(payload.id).catch(e =>
      console.error('[AI] Usage increment error:', e)
    );

    // 记录审计日志
    const supabase = getSupabaseClient();
    Promise.resolve(
      supabase
        .from('ai_audit_logs')
        .insert({
          user_id: payload.id,
          action: 'chat',
          input_summary: inputSummary.slice(0, 200),
          page_context: pageContext || null,
          is_success: true,
        })
    ).catch(e => console.error('[AI] Audit log error:', e));

    // 将 AsyncGenerator 转换为 ReadableStream（SSE 格式）
    const encoder = new TextEncoder();
    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const part = chunk as { content?: unknown; text?: unknown };
            let text = '';
            if (typeof part === 'string') {
              text = part;
            } else if (typeof part?.content === 'string') {
              text = part.content;
            } else if (typeof part?.text === 'string') {
              text = part.text;
            }
            if (text) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: text })}\n\n`));
            }
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (error) {
          console.error('[AI] Stream error:', error);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ error: 'AI 响应中断' })}\n\n`
            )
          );
          controller.close();
        }
      },
    });

    return new Response(readableStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('[AI] Chat error:', error);
    return new Response(JSON.stringify({ success: false, error: 'AI 服务异常' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
