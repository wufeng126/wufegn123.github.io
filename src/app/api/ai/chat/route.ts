import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/storage/database/supabase-server';
import { verifyToken } from '@/lib/auth';
import { extractForwardHeaders } from '@/lib/ai-service';
import { searchKnowledge } from '@/lib/ai-knowledge-service';
import { searchSystemKnowledge } from '@/lib/system-knowledge-service';
import { buildBusinessContext } from '@/lib/business-context-service';
import { buildAgent, filterInvalidMessages } from '@/lib/ai-agent';
import { maskSensitiveInfo, isContentViolation } from '@/lib/ai-content-filter';
import { checkDailyLimit, incrementDailyUsage } from '@/lib/ai-usage-limit';

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('x-session') || request.cookies.get('auth_token')?.value;
    if (!token) {
      return new Response(JSON.stringify({ success: false, error: '未登录' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const payload = verifyToken(token);
    if (!payload) {
      return new Response(JSON.stringify({ success: false, error: '登录已过期' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = await request.json();
    const { messages, pageContext } = body;

    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ success: false, error: '消息格式错误' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 过滤无效消息（role 为空或非法）
    const filteredMessages = filterInvalidMessages(messages);
    if (filteredMessages.length === 0) {
      return new Response(JSON.stringify({ success: false, error: '没有有效的消息' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 获取用户输入摘要（用于知识库检索和限额检查）
    const lastMessage = filteredMessages[filteredMessages.length - 1];
    const inputSummary = typeof lastMessage.content === 'string' ? lastMessage.content : '';

    // 内容过滤检查
    if (isContentViolation(inputSummary)) {
      return new Response(JSON.stringify({ success: false, error: '提问内容违规，仅允许建筑劳务/财务/项目相关问题' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 检查每日限额
    const { allowed, remaining, resetAt } = await checkDailyLimit(payload.userId);
    if (!allowed) {
      return new Response(JSON.stringify({
        success: false,
        error: `每日调用限额已用完，剩余 ${remaining} 次，重置时间：${resetAt}`,
        code: 'DAILY_LIMIT_EXCEEDED',
      }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 检查 AI 配置是否可用
    let aiConfig: any = null;
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('ai_configs')
        .select('*')
        .eq('id', 1)
        .single();

      if (error) throw error;
      aiConfig = data;
    } catch (e) {
      console.error('[AI] Config check error:', e);
    }

    if (!aiConfig || !aiConfig.enabled) {
      let reason = 'AI 服务不可用';
      try {
        if (!aiConfig?.enabled) {
          reason = 'AI 服务已禁用，请在「系统管理 → AI 配置」中开启';
        } else if (!aiConfig.api_key) {
          reason = 'AI 服务未配置 API 密钥，请在「系统管理 → AI 配置」中填写（Coze Token 或 DeepSeek Key）';
        } else if (!aiConfig.api_endpoint) {
          reason = 'AI 服务未配置 API 地址，请在「系统管理 → AI 配置」中填写（DeepSeek: https://api.deepseek.com/v1）';
        } else {
          reason = 'AI 服务配置异常，请检查「系统管理 → AI 配置」';
        }
      } catch {
        reason = 'AI 配置表不存在：请先在 Supabase 执行迁移 migrations/create_ai_tables.sql';
      }
      return new Response(JSON.stringify({ success: false, error: reason, code: 'AI_NOT_READY' }), {
        status: 403, headers: { 'Content-Type': 'application/json' },
      });
    }

    // 提取转发请求头（LLM 和知识库调用都需要）
    const forwardHeaders = extractForwardHeaders(request.headers);

    // 惰性自动同步：距上次同步超过阈值（默认 24h）时自动刷新业务知识库，保证 AI 回答基于最新数据
    try {
      const { maybeAutoSyncBusinessData } = await import('@/lib/ai-knowledge-sync');
      await maybeAutoSyncBusinessData(forwardHeaders);
    } catch (e) {
      console.warn('[Chat] auto sync skipped:', e);
    }

    // 检查每日限额
    const { allowed: limitAllowed, remaining: limitRemaining, resetAt: limitResetAt } = await checkDailyLimit(payload.userId);
    if (!limitAllowed) {
      return new Response(JSON.stringify({
        success: false,
        error: `每日调用限额已用完，剩余 ${limitRemaining} 次，重置时间：${limitResetAt}`,
        code: 'DAILY_LIMIT_EXCEEDED',
      }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      });
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

    // 获取业务数据上下文（基于用户意图智能检索）
    let businessContext = '';
    try {
      businessContext = await buildBusinessContext(inputSummary, payload);
    } catch (e) {
      console.error('[AI] Business context error:', e);
    }

    // 构建系统提示词
    const systemPrompt = buildSystemPrompt(knowledgeContext, systemKnowledge, businessContext, pageContext);

    // 构建 Agent 并流式输出
    const agent = buildAgent({
      systemPrompt,
      messages: filteredMessages,
      config: aiConfig,
      headers: forwardHeaders,
    });

    const stream = await agent.stream();

    // 记录 Token 使用量
    incrementDailyUsage(payload.userId).catch(e => console.error('[AI] Usage increment error:', e));

    return new Response(stream.toReadableStream(), {
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

function buildSystemPrompt(knowledge: string, systemKnowledge: string, business: string, pageContext?: string): string {
  const parts = ['你是建筑劳务企业数据管理系统的 AI 助手。'];

  if (pageContext) {
    parts.push(`当前页面：${pageContext}`);
  }

  if (knowledge) {
    parts.push(`\n【知识库参考】\n${knowledge}`);
  }

  if (systemKnowledge) {
    parts.push(`\n【系统经验】\n${systemKnowledge}`);
  }

  if (business) {
    parts.push(`\n【业务数据】\n${business}`);
  }

  parts.push('\n【业务规则】');
  parts.push('1. 应发工资 = 工时 × 工价 + 包活工资');
  parts.push('2. 实发工资 = 应发工资 - 个税 - 借支 - 劳保');
  parts.push('3. 利润率 = (产值 - 成本) / 产值 × 100%');
  parts.push('4. 回款率 = 已回款 / 应收款 × 100%');
  parts.push('5. 成本超支 = 实际成本 > 预算成本');

  return parts.join('\n');
}
