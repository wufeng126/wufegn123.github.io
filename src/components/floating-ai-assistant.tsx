'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  pageContext?: string;
  dataCards?: DataCard[];
  attachedFiles?: string[];
}

interface DataCard {
  type: string;
  label: string;
  link: string;
}

interface Session {
  id: string;
  title: string;
  updatedAt: Date;
}

interface UploadStatus {
  fileName: string;
  status: 'uploading' | 'success' | 'error';
  error?: string;
}

// 分类快捷提问模板
const TEMPLATE_CATEGORIES = [
  {
    group: '工人工资',
    items: [
      { label: '查询工人累计工资', prompt: '请列出所有工人的累计实发工资，按金额从高到低排列' },
      { label: '月度工资汇总', prompt: '请汇总本月所有项目的工人工资总额，包括应发和实发' },
      { label: '预支款排行', prompt: '哪个工人预支款最多？列出预支款前10名工人' },
      { label: '未发放工资查询', prompt: '有哪些月份的工资还未发放？列出未发放工资明细' },
    ],
  },
  {
    group: '项目&清单',
    items: [
      { label: '项目清单单价', prompt: '请列出所有项目的分项工程清单单价' },
      { label: '项目成本对比', prompt: '对比各项目的成本构成，分析哪个项目成本超支' },
      { label: '工程量完成率', prompt: '各项目分项工程的完成率是多少？哪些进度滞后？' },
      { label: '签证变更统计', prompt: '统计各项目的签证变更金额' },
    ],
  },
  {
    group: '供应商&合同',
    items: [
      { label: '未付款供应商', prompt: '列出所有有未付款的供应商，按未付金额排序' },
      { label: '合同结算明细', prompt: '请汇总各供应商的合同结算金额和已付款金额' },
      { label: '大额未付预警', prompt: '筛选所有未付金额超过10万的供应商，并给出风险提示' },
      { label: '待签合同名单', prompt: '统计所有待签合同的供应商名单' },
    ],
  },
  {
    group: '经营分析',
    items: [
      { label: '项目利润排行', prompt: '请分析所有项目的利润率，按利润率从高到低排列' },
      { label: '回款风险分析', prompt: '分析甲方回款情况，哪些项目存在回款风险？' },
      { label: '成本构成分析', prompt: '分析当前成本构成，人工、材料、费用各占多少比例？' },
      { label: '证件到期提醒', prompt: '哪些证件即将在30天内过期？' },
    ],
  },
];

const OFFLINE_RESPONSES: Record<string, string> = {
  '工资': '工资核算规则：应发工资 = 工时×工价+包活工资；实发工资 = 应发工资-个税-借支-劳保。如需详细数据查询，请稍后重试。',
  '证件': '证件到期提醒规则：系统自动在30天、15天、7天和已过期四个阶段发送提醒。可在通知中心查看详情。',
  '成本': '成本计算口径：总成本 = 供应商结算 + 工人工资 + 综合费用 + 税费 + 零星材料。利润 = 总收入 - 总成本。',
  '回款': '回款率计算：回款率 = 已回款 / 产值结算金额 × 100%。回款率超100%为超收/预收。',
  '供应商': '供应商结算流程：新建结算→审核→付款。未审核的结算不计入统计。可在供应商成本看板查看详情。',
  '合同': '合同文件可通过本助手的上传功能上传，AI将自动解析合同条款、单价清单、付款节点等信息并存入知识库。',
  '默认': 'AI助手暂时不可用，请稍后重试。您可以在系统各页面上查看业务数据，或在通知中心查看预警信息。',
};

function getOfflineResponse(input: string): string {
  const lower = input.toLowerCase();
  for (const [key, value] of Object.entries(OFFLINE_RESPONSES)) {
    if (key !== '默认' && lower.includes(key)) return value;
  }
  return OFFLINE_RESPONSES['默认'];
}

function parseDataCards(text: string): { text: string; cards: DataCard[] } {
  const cards: DataCard[] = [];
  const linkPattern = /\[([^\]]+)\]\((\/[^)]+)\)/g;
  let match;
  while ((match = linkPattern.exec(text)) !== null) {
    const label = match[1];
    const link = match[2];
    let type = 'page';
    if (link.includes('/projects')) type = 'project';
    else if (link.includes('/workers')) type = 'worker';
    else if (link.includes('/supplier')) type = 'supplier';
    else if (link.includes('/client')) type = 'client';
    cards.push({ type, label, link });
  }
  return { text, cards };
}

// 简单 Markdown 渲染（支持表格、加粗、列表等）
function renderMarkdown(text: string): string {
  let html = text;

  // 表格渲染
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

  // 标题
  html = html.replace(/^### (.+)$/gm, '<h4 class="font-semibold text-sm mt-2 mb-1">$1</h4>');
  html = html.replace(/^## (.+)$/gm, '<h3 class="font-semibold mt-2 mb-1">$1</h3>');

  // 加粗和斜体
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // 行内代码
  html = html.replace(/`(.+?)`/g, '<code class="bg-muted px-1 py-0.5 rounded text-xs">$1</code>');

  // 无序列表
  html = html.replace(/^[•\-] (.+)$/gm, '<li class="ml-3">$1</li>');

  // 链接渲染为可点击
  html = html.replace(/\[([^\]]+)\]\((\/[^)]+)\)/g, '<a href="$2" class="text-primary underline hover:text-primary/80">$1</a>');

  // 换行
  html = html.replace(/\n/g, '<br/>');

  return html;
}

export function FloatingAIAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState('');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [pageContext, setPageContext] = useState('');
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [activeTab, setActiveTab] = useState<'chat' | 'upload'>('chat');
  const [activeTemplateGroup, setActiveTemplateGroup] = useState<string>('工人工资');
  const [uploadStatuses, setUploadStatuses] = useState<UploadStatus[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 检测移动端
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // 初始化session
  useEffect(() => {
    setSessionId(`session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
  }, []);

  // 获取当前页面上下文
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const path = window.location.pathname;
      const contextMap: Record<string, string> = {
        '/': '首页概览',
        '/workers/roster': '花名册',
        '/workers/salaries': '月度工资',
        '/work-items': '工程量统计',
        '/client-reports': '甲方报量',
        '/client-payments': '付款情况',
        '/cost-center': '成本利润中心',
        '/supplier-contracts': '供应商合同',
        '/supplier-contracts/settlement': '供应商结算',
        '/data-board/supplier-cost': '供应商成本看板',
        '/data-board/worker-cost': '工人成本看板',
        '/data-board/fund-management': '资金管理看板',
        '/reports/monthly': '月度经营月报',
        '/notifications': '通知中心',
      };
      setPageContext(contextMap[path] || path);
    }
  }, []);

  // 自动滚动到底部
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // 拖拽逻辑
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!isOpen || isMinimized || isMobile) return;
    if ((e.target as HTMLElement).closest('input, button, textarea, [role], a, label')) return;
    setIsDragging(true);
    dragOffset.current = {
      x: e.clientX - (panelRef.current?.offsetLeft || 0),
      y: e.clientY - (panelRef.current?.offsetTop || 0),
    };
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    setPosition({ x: e.clientX - dragOffset.current.x, y: e.clientY - dragOffset.current.y });
  }, [isDragging]);

  const handleMouseUp = useCallback(() => { setIsDragging(false); }, []);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // 文件上传处理
  const handleFileUpload = async (files: FileList | File[]) => {
    const fileArr = Array.from(files);
    if (fileArr.length === 0) return;

    // 验证文件类型
    const validExts = /\.(pdf|docx?|xlsx?|pptx?|txt|csv|md)$/i;
    const validFiles = fileArr.filter(f => validExts.test(f.name));
    const invalidFiles = fileArr.filter(f => !validExts.test(f.name));

    if (invalidFiles.length > 0) {
      toast.error(`${invalidFiles.map(f => f.name).join(', ')} 格式不支持`);
    }
    if (validFiles.length === 0) return;
    if (validFiles.length > 10) {
      toast.error('单次最多上传10个文件');
      return;
    }

    setIsUploading(true);
    const statuses: UploadStatus[] = validFiles.map(f => ({ fileName: f.name, status: 'uploading' as const }));
    setUploadStatuses(statuses);

    try {
      const formData = new FormData();
      validFiles.forEach(f => formData.append('files', f));
      formData.append('category', 'contract');

      const res = await fetch('/api/ai/knowledge/upload', { method: 'POST', body: formData });
      const data = await res.json();

      if (data.success) {
        const results = data.data.results || [];
        setUploadStatuses(prev =>
          prev.map((s, i) => {
            const result = results[i];
            if (!result) return s;
            return {
              ...s,
              status: result.status === 'active' ? 'success' : 'error',
              error: result.error,
            };
          })
        );
        const successCount = data.data.successCount || 0;
        const failCount = data.data.failCount || 0;
        if (successCount > 0) toast.success(`${successCount}个文件上传并解析成功`);
        if (failCount > 0) toast.error(`${failCount}个文件处理失败`);

        // 添加系统消息
        const fileNames = results
          .filter((r: { status: string }) => r.status === 'active')
          .map((r: { fileName: string }) => r.fileName)
          .join('、');
        if (fileNames) {
          setMessages(prev => [...prev, {
            id: `msg_upload_${Date.now()}`,
            role: 'system' as const,
            content: `已上传并解析合同文件：${fileNames}。AI现在可以基于这些文件内容回答问题。`,
            timestamp: new Date(),
          }]);
        }
      } else {
        toast.error(data.error || '上传失败');
        setUploadStatuses(prev => prev.map(s => ({ ...s, status: 'error' as const, error: data.error })));
      }
    } catch (err) {
      toast.error('文件上传异常');
      setUploadStatuses(prev => prev.map(s => ({ ...s, status: 'error' as const, error: '网络异常' })));
    } finally {
      setIsUploading(false);
    }
  };

  // 发送消息
  const sendMessage = async (content: string) => {
    if (!content.trim() || isLoading) return;

    const userMsg: Message = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: content.trim(),
      timestamp: new Date(),
      pageContext,
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);
    setActiveTab('chat');

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
              // Skip non-JSON lines
            }
          }
        }
      }

      setSessions(prev => {
        const existing = prev.find(s => s.id === sessionId);
        if (existing) {
          return prev.map(s => s.id === sessionId ? { ...s, title: content.slice(0, 20), updatedAt: new Date() } : s);
        }
        return [{ id: sessionId, title: content.slice(0, 20), updatedAt: new Date() }, ...prev].slice(0, 10);
      });
    } catch (_e: unknown) {
      const offlineContent = getOfflineResponse(content);
      setMessages(prev =>
        prev.map(m => m.id === assistantMsgId ? {
          ...m,
          content: offlineContent + '\n\n*(离线兜底回复)*',
        } : m)
      );
      toast.error('AI连接异常，已使用离线回答');
    } finally {
      setIsLoading(false);
    }
  };

  const newChat = () => {
    setMessages([]);
    setSessionId(`session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
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

  // 面板尺寸：移动端全屏，PC端固定
  const panelWidth = isMobile ? '100vw' : '420px';
  const panelHeight = isMobile ? '100vh' : '580px';

  const panelStyle = (!isOpen || isMinimized) ? { display: 'none' } as React.CSSProperties : {
    position: 'fixed' as const,
    bottom: isMobile ? 0 : (position.y === 0 && position.x === 0 ? '24px' : undefined),
    right: isMobile ? 0 : (position.y === 0 && position.x === 0 ? '24px' : undefined),
    left: isMobile ? 0 : (position.x !== 0 ? `${position.x}px` : undefined),
    top: isMobile ? 0 : (position.y !== 0 ? `${window.innerHeight - position.y - 580}px` : undefined),
    zIndex: 9999,
    width: panelWidth,
    height: panelHeight,
  };

  const dataCardIcons: Record<string, string> = {
    project: '🏗️',
    worker: '👷',
    supplier: '🏭',
    client: '🏢',
    page: '📄',
  };

  return (
    <>
      {/* 浮动按钮 */}
      <button
        onClick={() => { setIsOpen(true); setIsMinimized(false); }}
        style={isOpen && !isMinimized ? { display: 'none' } : {}}
        className="fixed bottom-6 right-6 z-[9999] w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center hover:scale-105 active:scale-95"
        aria-label="打开AI助手"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2a8 8 0 0 1 8 8v2a8 8 0 0 1-16 0v-2a8 8 0 0 1 8-8z"/>
          <path d="M9 12h.01M15 12h.01"/>
          <path d="M10 16s1.5 1 2 1 2-1 2-1"/>
          <path d="M12 18v2"/>
          <path d="M8 22h8"/>
        </svg>
      </button>

      {/* 最小化指示器 */}
      {isMinimized && isOpen && (
        <button
          onClick={() => setIsMinimized(false)}
          className="fixed bottom-6 right-6 z-[9999] px-4 py-2 rounded-full bg-primary text-primary-foreground shadow-lg text-sm hover:shadow-xl transition-all"
        >
          AI助手
        </button>
      )}

      {/* 对话面板 */}
      <div
        ref={panelRef}
        style={panelStyle}
        className={`${isMobile ? '' : 'border rounded-xl'} bg-background shadow-2xl flex flex-col overflow-hidden`}
        onMouseDown={handleMouseDown}
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/50 select-none shrink-0"
             style={{ cursor: isMobile ? 'default' : 'move' }}>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span className="font-medium text-sm">AI劳务助手</span>
            {pageContext && <Badge variant="outline" className="text-xs hidden sm:inline-flex">{pageContext}</Badge>}
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setActiveTab('chat')} className={`p-1.5 hover:bg-muted rounded text-xs ${activeTab === 'chat' ? 'bg-muted' : ''}`} title="对话">
              💬
            </button>
            <button onClick={() => setActiveTab('upload')} className={`p-1.5 hover:bg-muted rounded text-xs ${activeTab === 'upload' ? 'bg-muted' : ''}`} title="上传文件">
              📎
            </button>
            <div className="w-px h-4 bg-border mx-1" />
            <button onClick={exportChat} className="p-1.5 hover:bg-muted rounded text-xs" title="导出对话">
              💾
            </button>
            <button onClick={newChat} className="p-1.5 hover:bg-muted rounded text-xs" title="新建对话">
              ➕
            </button>
            {!isMobile && (
              <button onClick={() => setIsMinimized(true)} className="p-1.5 hover:bg-muted rounded" title="最小化">─</button>
            )}
            <button onClick={() => setIsOpen(false)} className="p-1.5 hover:bg-muted rounded" title="关闭">✕</button>
          </div>
        </div>

        {/* 文件上传区域 */}
        {activeTab === 'upload' && (
          <div className="flex-1 p-4 overflow-y-auto">
            <div className="text-sm font-medium mb-3">上传合同文件</div>
            <p className="text-xs text-muted-foreground mb-3">
              支持PDF、Word、Excel格式的分包合同、劳务合同、报价清单，AI将自动解析内容并存入知识库。
            </p>

            {/* 拖拽上传区 */}
            <div
              className="border-2 border-dashed rounded-lg p-6 text-center hover:border-primary/50 transition-colors cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
              onDrop={e => {
                e.preventDefault();
                e.stopPropagation();
                if (e.dataTransfer.files.length > 0) handleFileUpload(e.dataTransfer.files);
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.md"
                className="hidden"
                onChange={e => { if (e.target.files) handleFileUpload(e.target.files); e.target.value = ''; }}
              />
              <div className="text-3xl mb-2">📄</div>
              <div className="text-sm text-muted-foreground">
                {isUploading ? '上传解析中...' : '点击或拖拽文件到此处'}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                支持 PDF / Word / Excel / PPT / TXT，单个最大20MB，一次最多10个
              </div>
            </div>

            {/* 上传状态列表 */}
            {uploadStatuses.length > 0 && (
              <div className="mt-4 space-y-2">
                <div className="text-xs font-medium text-muted-foreground">上传状态</div>
                {uploadStatuses.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    {s.status === 'uploading' && <span className="text-yellow-500">⏳</span>}
                    {s.status === 'success' && <span className="text-green-500">✅</span>}
                    {s.status === 'error' && <span className="text-red-500">❌</span>}
                    <span className="truncate flex-1">{s.fileName}</span>
                    {s.status === 'error' && s.error && (
                      <span className="text-xs text-red-500">{s.error}</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* 已上传提示 */}
            <div className="mt-4 p-3 bg-muted/50 rounded-lg text-xs text-muted-foreground">
              <div className="font-medium mb-1">使用说明</div>
              <ul className="space-y-1 ml-3 list-disc">
                <li>上传合同文件后，AI会自动提取单价清单、付款节点、甲乙方信息</li>
                <li>解析后的数据与系统后台业务台账自动关联</li>
                <li>可在对话中直接提问合同相关问题，如&quot;南京项目模板清单单价多少&quot;</li>
                <li>管理所有文档请前往 系统管理 → AI配置管理 → 知识库</li>
              </ul>
            </div>
          </div>
        )}

        {/* 对话区域 */}
        {activeTab === 'chat' && (
          <>
            {/* 历史对话面板 */}
            {showHistory && (
              <div className="border-b p-3 bg-muted/30 max-h-40 overflow-y-auto shrink-0">
                <div className="text-xs font-medium text-muted-foreground mb-2">历史对话</div>
                {sessions.length === 0 ? (
                  <div className="text-xs text-muted-foreground">暂无历史对话</div>
                ) : (
                  sessions.map(s => (
                    <button
                      key={s.id}
                      onClick={() => { setSessionId(s.id); setShowHistory(false); }}
                      className="w-full text-left px-2 py-1.5 rounded hover:bg-muted text-sm truncate"
                    >
                      {s.title}
                    </button>
                  ))
                )}
              </div>
            )}

            {/* 消息区域 */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3" ref={scrollRef}>
              {messages.length === 0 && (
                <div className="space-y-4">
                  <div className="text-center text-muted-foreground text-sm py-2">
                    你好！我是AI劳务助手，可以查询工人工资、项目清单、供应商款项等数据，也可以上传合同文件让我解析。
                  </div>

                  {/* 分类快捷模板 */}
                  <div>
                    <div className="flex gap-1 mb-2 overflow-x-auto pb-1">
                      {TEMPLATE_CATEGORIES.map(cat => (
                        <button
                          key={cat.group}
                          onClick={() => setActiveTemplateGroup(cat.group)}
                          className={`shrink-0 px-2.5 py-1 text-xs rounded-full border transition-colors ${
                            activeTemplateGroup === cat.group
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'hover:bg-muted'
                          }`}
                        >
                          {cat.group}
                        </button>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {TEMPLATE_CATEGORIES.find(c => c.group === activeTemplateGroup)?.items.map((t, i) => (
                        <button
                          key={i}
                          onClick={() => sendMessage(t.prompt)}
                          className="text-left px-3 py-2 border rounded-lg hover:bg-muted transition-colors text-xs leading-relaxed"
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {messages.filter(m => m.role !== 'system').map(msg => (
                <div key={msg.id} className={`${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                  <div
                    className={`inline-block max-w-[90%] px-3 py-2 rounded-lg text-sm ${
                      msg.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted'
                    }`}
                    dangerouslySetInnerHTML={{
                      __html: msg.role === 'user'
                        ? msg.content
                        : renderMarkdown(msg.content || (isLoading ? '⏳ 思考中...' : ''))
                    }}
                  />
                  {msg.dataCards && msg.dataCards.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {msg.dataCards.map((card, i) => (
                        <a
                          key={i}
                          href={card.link}
                          className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-primary/10 text-primary rounded hover:bg-primary/20 transition-colors"
                        >
                          <span>{dataCardIcons[card.type] || '📄'}</span>
                          {card.label}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {/* 系统消息（如文件上传成功） */}
              {messages.filter(m => m.role === 'system').map(msg => (
                <div key={msg.id} className="text-center">
                  <span className="inline-block px-3 py-1 text-xs bg-muted/50 text-muted-foreground rounded-full">
                    {msg.content}
                  </span>
                </div>
              ))}
            </div>

            {/* 底部快捷+输入区 */}
            <div className="border-t shrink-0">
              {/* 快捷提问（有消息时也显示一行） */}
              {messages.length > 0 && (
                <div className="px-3 pt-2 flex gap-1 overflow-x-auto">
                  {TEMPLATE_CATEGORIES.flatMap(c => c.items.slice(0, 1)).slice(0, 4).map((t, i) => (
                    <button
                      key={i}
                      onClick={() => sendMessage(t.prompt)}
                      className="shrink-0 px-2 py-1 text-xs border rounded-full hover:bg-muted"
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              )}

              {/* 输入区 */}
              <div className="p-3 flex gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="shrink-0 p-2 hover:bg-muted rounded text-sm"
                  title="上传文件"
                  disabled={isLoading}
                >
                  📎
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.md"
                  className="hidden"
                  onChange={e => {
                    if (e.target.files) handleFileUpload(e.target.files);
                    e.target.value = '';
                  }}
                />
                <Input
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
                  placeholder="输入问题，如：马志波累计发了多少工资"
                  disabled={isLoading}
                  className="flex-1 text-sm"
                />
                <Button
                  onClick={() => sendMessage(input)}
                  disabled={isLoading || !input.trim()}
                  size="sm"
                >
                  {isLoading ? '...' : '发送'}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
