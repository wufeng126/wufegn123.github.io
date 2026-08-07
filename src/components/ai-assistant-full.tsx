'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { getOfflineResponse, PAGE_SUGGESTIONS, type Suggestion } from '@/lib/ai-assistant-config';
import {
  Bot, Send, Plus, History, Download, Sparkles, Trash2, MessageSquare,
} from 'lucide-react';

/* ============ 类型 ============ */
interface DataCard {
  type: string;
  label: string;
  link: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  dataCards?: DataCard[];
}

interface Session {
  id: string;
  title: string;
  updatedAt: Date;
}

/* ============ 快捷问法模板（按业务角色分组） ============ */
const ROLE_GROUPS = [
  {
    group: '👷 现场',
    items: [
      { label: '今日施工进度', prompt: '汇总今天的施工日志，哪些工序有异常或滞后？' },
      { label: '人员出勤情况', prompt: '最近各项目的出勤人数和异常考勤情况？' },
      { label: '待办事项', prompt: '我有哪些待办事项需要处理？按紧急程度排序' },
    ],
  },
  {
    group: '📊 经营',
    items: [
      { label: '本月成本概览', prompt: '汇总本月各项目成本，人工、材料、费用各占多少？有无超支？' },
      { label: '项目利润排行', prompt: '分析所有项目的利润率，按从高到低排列' },
      { label: '回款风险', prompt: '分析甲方回款情况，哪些项目存在回款风险？' },
    ],
  },
  {
    group: '💰 预算',
    items: [
      { label: '未付款供应商', prompt: '列出所有有未付款的供应商，按未付金额排序' },
      { label: '签证变更统计', prompt: '统计各项目的签证变更金额和影响' },
      { label: '超支预警', prompt: '筛选未付金额超过10万的供应商，给出风险提示' },
    ],
  },
  {
    group: '🏢 老板',
    items: [
      { label: '经营总览', prompt: '给出公司当前经营总览：产值、回款、利润、风险点' },
      { label: '证件到期提醒', prompt: '哪些证件即将在30天内过期？' },
      { label: '本月关键事件', prompt: '本月有哪些关键节点、结算、付款需要关注？' },
    ],
  },
];

const TEMPLATE_CATEGORIES = [
  {
    group: '工人工资',
    items: [
      { label: '查询工人累计工资', prompt: '请列出所有工人的累计实发工资，按金额从高到低排列' },
      { label: '月度工资汇总', prompt: '请汇总本月所有项目的工人工资总额，包括应发和实发' },
      { label: '未发放工资查询', prompt: '有哪些月份的工资还未发放？列出未发放工资明细' },
    ],
  },
  {
    group: '项目&清单',
    items: [
      { label: '项目清单单价', prompt: '请列出所有项目的分项工程清单单价' },
      { label: '项目成本对比', prompt: '对比各项目的成本构成，分析哪个项目成本超支' },
      { label: '工程量完成率', prompt: '各项目分项工程的完成率是多少？哪些进度滞后？' },
    ],
  },
  {
    group: '供应商&合同',
    items: [
      { label: '合同结算明细', prompt: '请汇总各供应商的合同结算金额和已付款金额' },
      { label: '大额未付预警', prompt: '筛选所有未付金额超过10万的供应商，并给出风险提示' },
      { label: '待签合同名单', prompt: '统计所有待签合同的供应商名单' },
    ],
  },
  {
    group: '经营分析',
    items: [
      { label: '回款风险分析', prompt: '分析甲方回款情况，哪些项目存在回款风险？' },
      { label: '成本构成分析', prompt: '分析当前成本构成，人工、材料、费用各占多少比例？' },
      { label: '证件到期提醒', prompt: '哪些证件即将在30天内过期？' },
    ],
  },
];

/* ============ 工具函数 ============ */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeInternalHref(value: string): string {
  const normalized = value.replace(/&amp;/g, '&').trim();
  if (!normalized.startsWith('/') || normalized.startsWith('//')) return '#';
  try {
    const parsed = new URL(normalized, 'https://app.local');
    if (parsed.origin !== 'https://app.local') return '#';
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return '#';
  }
}

function parseDataCards(text: string): { text: string; cards: DataCard[] } {
  const cards: DataCard[] = [];
  const linkPattern = /\[([^\]]+)\]\((\/[^)]+)\)/g;
  let match;
  while ((match = linkPattern.exec(text)) !== null) {
    const label = match[1];
    const link = sanitizeInternalHref(match[2]);
    let type = 'page';
    if (link.includes('/projects')) type = 'project';
    else if (link.includes('/workers')) type = 'worker';
    else if (link.includes('/supplier')) type = 'supplier';
    else if (link.includes('/client')) type = 'client';
    cards.push({ type, label, link });
  }
  return { text, cards };
}

function renderMarkdown(text: string): string {
  let html = escapeHtml(text);

  // 表格
  const tablePattern = /\n(\|.+\|)\n(\|[-| :]+\|)\n((?:\|.+\|\n?)+)/g;
  html = html.replace(tablePattern, (_match, header: string, _sep: string, body: string) => {
    const headers = header.split('|').filter(c => c.trim()).map(c => c.trim());
    const rows = body.trim().split('\n').map(row =>
      row.split('|').filter(c => c.trim()).map(c => c.trim())
    );
    let table = '<table class="w-full text-xs border-collapse my-2"><thead><tr>';
    headers.forEach(h => { table += `<th class="border px-2 py-1 bg-muted text-left font-medium">${h}</th>`; });
    table += '</tr></thead><tbody>';
    rows.forEach(row => {
      table += '<tr>';
      row.forEach(cell => { table += `<td class="border px-2 py-1">${cell}</td>`; });
      table += '</tr>';
    });
    table += '</tbody></table>';
    return table;
  });

  html = html.replace(/^### (.+)$/gm, '<h4 class="font-semibold text-sm mt-2 mb-1">$1</h4>');
  html = html.replace(/^## (.+)$/gm, '<h3 class="font-semibold mt-2 mb-1">$1</h3>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/`(.+?)`/g, '<code class="bg-muted px-1 py-0.5 rounded text-xs">$1</code>');
  html = html.replace(/^[•\-] (.+)$/gm, '<li class="ml-3">$1</li>');
  html = html.replace(/\[([^\]]+)\]\((\/[^)]+)\)/g, (_match, label: string, href: string) => {
    const safeHref = sanitizeInternalHref(href);
    return `<a href="${escapeHtml(safeHref)}" class="text-primary underline hover:text-primary/80">${label}</a>`;
  });
  html = html.replace(/\n/g, '<br/>');
  return html;
}

function createSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function getInitialPageContext(): string {
  if (typeof window === 'undefined') return '';
  const path = window.location.pathname;
  const contextMap: Record<string, string> = {
    '/': '首页概览',
    '/workers/roster': '花名册',
    '/workers/salaries': '月度工资',
    '/quantity-reporting': '报量管理',
    '/cost-center': '成本利润中心',
    '/supplier-contracts': '供应商合同',
    '/data-board/supplier-cost': '供应商成本看板',
    '/data-board/worker-cost': '工人成本看板',
    '/data-board/fund-management': '资金管理看板',
    '/reports/monthly': '月度经营月报',
    '/notifications': '通知中心',
    '/progress-management': '进度计划',
    '/evidence-chain': '结算证据链',
  };
  return contextMap[path] || path;
}

const dataCardIcons: Record<string, string> = {
  project: '🏗️',
  worker: '👷',
  supplier: '🏭',
  client: '🏢',
  page: '📄',
};

/* ============ 主组件 ============ */
export function AIAssistantFull() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState(createSessionId);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [pageContext] = useState(getInitialPageContext);
  const [activeRoleGroup, setActiveRoleGroup] = useState('👷 现场');
  const [activeTemplateGroup, setActiveTemplateGroup] = useState('工人工资');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 自动滚动到底部
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // 发送消息
  const sendMessage = useCallback(async (content: string) => {
    const text = content.trim();
    if (!text || isLoading) return;
    setInput('');
    setIsLoading(true);

    const userMsg: Message = {
      id: `msg_${Date.now()}_user`,
      role: 'user',
      content: text,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);

    const assistantMsgId = `msg_${Date.now()}_ai`;
    const assistantMsg: Message = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, assistantMsg]);

    try {
      const chatMessages = [...messages, userMsg]
        .filter(m => m.role !== 'system')
        .slice(-20)
        .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: chatMessages,
          session_id: sessionId,
          page_context: pageContext,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: '请求失败' }));
        throw new Error(err.error || '请求失败');
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('无法读取响应');

      const decoder = new TextDecoder();
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6);
            if (dataStr === '[DONE]') break;
            try {
              const parsed = JSON.parse(dataStr);
              if (parsed.content) {
                fullContent += parsed.content;
                const { cards } = parseDataCards(fullContent);
                setMessages(prev =>
                  prev.map(m => m.id === assistantMsgId ? { ...m, content: fullContent, dataCards: cards } : m)
                );
              }
              if (parsed.error) {
                fullContent += `\n\n⚠️ ${parsed.error}`;
                setMessages(prev =>
                  prev.map(m => m.id === assistantMsgId ? { ...m, content: fullContent } : m)
                );
              }
            } catch {
              // 跳过非 JSON 行
            }
          }
        }
      }

      setSessions(prev => {
        const existing = prev.find(s => s.id === sessionId);
        if (existing) {
          return prev.map(s => s.id === sessionId ? { ...s, title: text.slice(0, 20), updatedAt: new Date() } : s);
        }
        return [{ id: sessionId, title: text.slice(0, 20), updatedAt: new Date() }, ...prev].slice(0, 10);
      });
    } catch (_e) {
      const offlineContent = getOfflineResponse(text);
      setMessages(prev =>
        prev.map(m => m.id === assistantMsgId ? {
          ...m,
          content: offlineContent + '\n\n*(离线兜底回复)*',
        } : m)
      );
      toast.error('AI 连接异常，已使用离线回答');
    } finally {
      setIsLoading(false);
      if (inputRef.current) inputRef.current.focus();
    }
  }, [messages, isLoading, sessionId, pageContext]);

  const newChat = () => {
    setMessages([]);
    setSessionId(createSessionId());
  };

  const exportChat = () => {
    if (messages.length === 0) return;
    const text = messages
      .filter(m => m.role !== 'system')
      .map(m => `[${m.role === 'user' ? '我' : 'AI'}] ${m.content}`)
      .join('\n\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ai_chat_${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const timeLabel = (d: Date) =>
    d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="grid h-[calc(100vh-96px)] min-h-[520px] grid-cols-1 gap-4 lg:grid-cols-[240px_minmax(0,1fr)_280px]">
      {/* ============ 左栏：会话历史 ============ */}
      <aside className="hidden flex-col rounded-xl border bg-card lg:flex">
        <div className="border-b p-3">
          <Button className="w-full" onClick={newChat}>
            <Plus className="mr-1.5 h-4 w-4" /> 新建对话
          </Button>
        </div>
        <ScrollArea className="flex-1">
          <div className="space-y-1 p-2">
            {sessions.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                暂无历史会话<br />发起第一段对话吧
              </p>
            ) : sessions.map((s) => (
              <button
                key={s.id}
                onClick={() => setSessionId(s.id)}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted ${
                  s.id === sessionId ? 'bg-accent text-primary' : ''
                }`}
              >
                <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{s.title || '新对话'}</span>
              </button>
            ))}
          </div>
        </ScrollArea>
        <div className="border-t p-2">
          <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground" onClick={exportChat}>
            <Download className="mr-1.5 h-4 w-4" /> 导出对话
          </Button>
        </div>
      </aside>

      {/* ============ 中栏：对话流 ============ */}
      <div className="flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card">
        {/* 头部 */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
              <Bot className="h-4.5 w-4.5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold leading-none">AI 劳务助手</p>
              <p className="mt-1 text-xs text-muted-foreground">数据驱动 · 回答可溯源</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="hidden text-xs sm:inline-flex">
              {pageContext || '全局'}
            </Badge>
            <Button variant="ghost" size="icon" className="size-8" onClick={exportChat} title="导出对话">
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* 消息区 */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          <div className="space-y-4 p-4">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10">
                  <Sparkles className="h-7 w-7 text-primary" />
                </div>
                <h3 className="mt-4 text-base font-semibold">问点什么？</h3>
                <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                  我可以查询工资、成本、进度、合同等业务数据，回答均标注数据来源，可点击直达对应页面。
                </p>
              </div>
            ) : messages.map((msg) =>
              msg.role === 'user' ? (
                <div key={msg.id} className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-primary-foreground whitespace-pre-wrap">
                    {msg.content}
                  </div>
                </div>
              ) : (
                <div key={msg.id} className="flex items-start gap-2.5">
                  <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0 max-w-[calc(100%-36px)] rounded-2xl rounded-tl-md border bg-muted/30 px-4 py-2.5">
                    {msg.content ? (
                      <div className="text-sm leading-relaxed [&_table]:my-2" dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
                    ) : (
                      <div className="flex items-center gap-1.5 py-1">
                        <span className="size-1.5 animate-pulse rounded-full bg-primary" />
                        <span className="size-1.5 animate-pulse rounded-full bg-primary" style={{ animationDelay: '150ms' }} />
                        <span className="size-1.5 animate-pulse rounded-full bg-primary" style={{ animationDelay: '300ms' }} />
                      </div>
                    )}
                    {msg.dataCards && msg.dataCards.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5 border-t pt-2.5">
                        {msg.dataCards.map((card, i) => (
                          <a
                            key={i}
                            href={card.link}
                            className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1.5 text-xs font-medium transition-colors hover:border-primary/40 hover:bg-accent"
                          >
                            <span>{dataCardIcons[card.type] || '📄'}</span>
                            {card.label}
                          </a>
                        ))}
                      </div>
                    )}
                    <p className="mt-1.5 text-[11px] text-muted-foreground">{timeLabel(msg.timestamp)}</p>
                  </div>
                </div>
              )
            )}
          </div>
        </div>

        {/* 输入区 */}
        <div className="border-t p-3">
          <div className="flex items-end gap-2">
            <Input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入问题，例如：本月成本哪里超了？"
              className="min-h-[42px]"
            />
            <Button
              size="icon"
              className="h-[42px] w-[42px] shrink-0"
              disabled={isLoading || !input.trim()}
              onClick={() => sendMessage(input)}
              aria-label="发送"
            >
              {isLoading ? (
                <span className="size-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            AI 可能出错，重要数据请以业务模块为准 · 回答引用系统数据自动标注来源
          </p>
        </div>
      </div>

      {/* ============ 右栏：快捷问法 ============ */}
      <aside className="hidden flex-col overflow-hidden rounded-xl border bg-card lg:flex">
        <div className="border-b px-3 py-2.5">
          <p className="text-xs font-semibold text-muted-foreground">角色化快捷问法</p>
        </div>
        <ScrollArea className="flex-1">
          <div className="space-y-4 p-3">
            {/* 角色切换 */}
            <div className="flex flex-wrap gap-1.5">
              {ROLE_GROUPS.map(g => (
                <button
                  key={g.group}
                  onClick={() => setActiveRoleGroup(g.group)}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                    activeRoleGroup === g.group ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70'
                  }`}
                >
                  {g.group}
                </button>
              ))}
            </div>

            {/* 当前角色问法 */}
            <div className="space-y-1.5">
              {ROLE_GROUPS.find(g => g.group === activeRoleGroup)?.items.map(item => (
                <button
                  key={item.label}
                  onClick={() => sendMessage(item.prompt)}
                  disabled={isLoading}
                  className="w-full rounded-lg border bg-background px-3 py-2.5 text-left text-xs leading-relaxed transition-colors hover:border-primary/40 hover:bg-accent"
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="border-t pt-3">
              <p className="mb-2 text-xs font-semibold text-muted-foreground">常用查询模板</p>
              <div className="space-y-1.5">
                {TEMPLATE_CATEGORIES.find(g => g.group === activeTemplateGroup)?.items.map(item => (
                  <button
                    key={item.label}
                    onClick={() => sendMessage(item.prompt)}
                    disabled={isLoading}
                    className="w-full rounded-lg border bg-background px-3 py-2 text-left text-xs transition-colors hover:border-primary/40 hover:bg-accent"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </ScrollArea>
      </aside>
    </div>
  );
}
