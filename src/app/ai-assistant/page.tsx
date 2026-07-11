'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Bot, User, Trash2, Loader2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

// 预设快捷提问
const QUICK_QUESTIONS = [
  '本月在册工人有多少？',
  '如何计算工人实发工资？',
  '利润率是怎么算的？',
  '回款率超过100%说明什么？',
  '成本超收入如何预警？',
  '甲方报量的审核流程是什么？',
];

export default function AIAssistantPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 自动滚动到底部
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // 生成唯一 ID
  const genId = () => Date.now().toString(36) + Math.random().toString(36).substring(2, 8);

  // 发送消息
  const handleSend = useCallback(async (text?: string) => {
    const messageText = (text || input).trim();
    if (!messageText || isLoading) return;

    setInput('');
    setIsLoading(true);

    // 添加用户消息
    const userMessage: ChatMessage = {
      id: genId(),
      role: 'user',
      content: messageText,
      timestamp: new Date(),
    };

    // 准备 AI 消息占位
    const assistantId = genId();
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage, assistantMessage]);

    try {
      // 构建消息列表，发送给 API
      const apiMessages = [...messages, userMessage]
        .filter(m => m.role !== 'system')
        .map(m => ({ role: m.role, content: m.content }));

      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: '请求失败' }));
        throw new Error(errorData.error || '请求失败');
      }

      // 读取 SSE 流
      const reader = response.body?.getReader();
      if (!reader) throw new Error('无法读取响应流');

      const decoder = new TextDecoder();
      let accumulatedContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.substring(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              if (parsed.error) {
                accumulatedContent += `\n\n⚠️ ${parsed.error}`;
              } else if (parsed.content) {
                accumulatedContent += parsed.content;
              }
            } catch {
              // 忽略解析失败的行
            }
          }
        }

        // 更新 AI 消息内容
        setMessages(prev =>
          prev.map(m => m.id === assistantId ? { ...m, content: accumulatedContent } : m)
        );
      }

      // 如果没有任何内容返回
      if (!accumulatedContent) {
        setMessages(prev =>
          prev.map(m => m.id === assistantId ? { ...m, content: '抱歉，暂未能获取到回答，请重试。' } : m)
        );
      }
    } catch (error) {
      console.error('AI Chat error:', error);
      setMessages(prev =>
        prev.map(m => m.id === assistantId
          ? { ...m, content: `抱歉，服务出现异常：${error instanceof Error ? error.message : '未知错误'}。请稍后重试。` }
          : m
        )
      );
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  }, [input, isLoading, messages]);

  // 清空对话
  const handleClear = () => {
    setMessages([]);
  };

  // 处理键盘事件
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // 渲染消息内容（支持简单 markdown 格式）
  const renderContent = (content: string) => {
    // 将换行转为段落
    const lines = content.split('\n');
    return lines.map((line, i) => {
      // 列表项
      if (line.match(/^\d+\.\s/)) {
        return <div key={i} className="ml-4">{line}</div>;
      }
      if (line.match(/^[-*]\s/)) {
        return <div key={i} className="ml-4">• {line.substring(2)}</div>;
      }
      // 加粗
      const boldProcessed = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      return <div key={i} dangerouslySetInnerHTML={{ __html: boldProcessed || '&nbsp;' }} />;
    });
  };

  return (
    <div className="flex flex-col h-[calc(100vh-56px)] bg-background">
      {/* 顶部栏 */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-card">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-semibold tracking-tight">AI 劳务助手</h1>
        </div>
        {messages.length > 0 && (
          <button
            onClick={handleClear}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground rounded-md hover:bg-muted transition-colors"
          >
            <Trash2 className="h-4 w-4" />
            清空对话
          </button>
        )}
      </div>

      {/* 消息区域 */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <Bot className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-lg font-semibold text-foreground mb-2">AI 劳务数据助手</h2>
            <p className="text-sm text-muted-foreground max-w-md mb-6">
              我可以帮你解答工人管理、工资计算、成本利润、甲方报量等劳务数据问题。试试下面的问题：
            </p>
            <div className="grid grid-cols-2 gap-2 max-w-lg w-full">
              {QUICK_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => handleSend(q)}
                  className="text-left px-3 py-2.5 text-sm text-foreground/80 bg-muted/50 border border-border rounded-lg hover:bg-muted hover:border-primary/30 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                'flex gap-3 max-w-3xl mx-auto',
                msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'
              )}
            >
              {/* 头像 */}
              <div
                className={cn(
                  'flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center',
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-primary'
                )}
              >
                {msg.role === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
              </div>

              {/* 消息内容 */}
              <div
                className={cn(
                  'flex-1 px-4 py-3 rounded-xl text-sm leading-relaxed',
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground rounded-tr-sm'
                    : 'bg-card border border-border rounded-tl-sm text-foreground'
                )}
              >
                {msg.content ? (
                  <div className="space-y-1">{renderContent(msg.content)}</div>
                ) : (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>思考中...</span>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 输入区域 */}
      <div className="border-t border-border bg-card px-4 py-3">
        <div className="flex gap-2 max-w-3xl mx-auto">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入你的问题... (Enter 发送, Shift+Enter 换行)"
            disabled={isLoading}
            rows={1}
            className="flex-1 resize-none rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all disabled:opacity-50"
            style={{ maxHeight: '120px' }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = 'auto';
              target.style.height = Math.min(target.scrollHeight, 120) + 'px';
            }}
          />
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || isLoading}
            className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>
        <p className="text-xs text-muted-foreground mt-1.5 text-center">
          AI 助手基于业务知识回答，具体数据请以系统实际数据为准
        </p>
      </div>
    </div>
  );
}
