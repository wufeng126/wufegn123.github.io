'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';

interface PageAnalysisButtonProps {
  pageName: string;
  pageData?: any;
  onAnalyze?: (prompt: string) => void;
}

const PAGE_TEMPLATES: Record<string, { label: string; prompt: string }[]> = {
  '花名册': [
    { label: '用工分析', prompt: '分析当前花名册数据：工人总数、工种分布、在/退场比例，是否存在用工风险' },
    { label: '合规检查', prompt: '检查花名册中是否有证件缺失、联系方式不全的工人' },
  ],
  '月度工资': [
    { label: '工资校验', prompt: '校验当月工资数据：应发与实发是否匹配、个税/借支/劳保扣款是否合理' },
    { label: '异常检测', prompt: '检测工资数据中的异常：工资为0、工时异常高、工价偏离标准' },
  ],
  '供应商成本看板': [
    { label: '应付风险', prompt: '分析供应商应付数据：哪些供应商有逾期未付款、合同是否即将到期' },
    { label: '成本测算', prompt: '基于供应商结算数据，测算各项目成本占比和利润空间' },
  ],
  '工人成本看板': [
    { label: '成本分析', prompt: '分析工人成本数据：应发/已发/未发工资统计，是否存在发放风险' },
    { label: '趋势解读', prompt: '解读工人成本月度趋势，预测下月人工成本' },
  ],
  '资金管理看板': [
    { label: '资金风险', prompt: '分析资金数据：应收未回、供应商应付、工人工资应付、现金净流、资金缺口、回款率和付款率，给出优先处理建议' },
    { label: '回款分析', prompt: '分析甲方回款率，哪些项目回款率低于预期' },
  ],
  '成本利润中心': [
    { label: '利润分析', prompt: '分析各项目利润情况：哪些项目亏损、成本超支原因分析' },
    { label: '优化建议', prompt: '基于成本数据，给出降本增效建议' },
  ],
  '甲方报量': [
    { label: '报量核对', prompt: '核对甲方报量数据：报量金额与完成量是否匹配、是否存在漏报' },
  ],
  '付款情况': [
    { label: '回款分析', prompt: '分析甲方付款情况：回款率、待回款金额、付款方式分布' },
  ],
  '月度经营月报': [
    { label: '月报解读', prompt: '解读本月经营数据：收入、成本、利润、现金净流、资金缺口、应收应付压力及同比环比变化' },
  ],
};

export function PageAnalysisButton({ pageName, onAnalyze }: PageAnalysisButtonProps) {
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);

  const templates = PAGE_TEMPLATES[pageName] || [
    { label: '数据分析', prompt: `请分析当前「${pageName}」页面的全部数据，给出关键指标和风险提醒` },
  ];

  const analyze = async (prompt: string) => {
    setLoading(true);
    setResult('');
    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: prompt }],
          session_id: `page_${Date.now()}`,
          page_context: pageName,
        }),
      });

      if (!res.ok) throw new Error('请求失败');

      const reader = res.body?.getReader();
      if (!reader) throw new Error('无法读取响应');

      const decoder = new TextDecoder();
      let full = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split('\n')) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') break;
            try {
              const parsed = JSON.parse(data);
              if (parsed.content) {
                full += parsed.content;
                setResult(full);
              }
            } catch { /* skip */ }
          }
        }
      }
    } catch {
      setResult('分析暂时不可用，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a8 8 0 0 1 8 8v2a8 8 0 0 1-16 0v-2a8 8 0 0 1 8-8z"/>
            <path d="M9 12h.01M15 12h.01"/>
          </svg>
          AI分析
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[380px] p-0" align="end">
        <div className="border-b px-4 py-3">
          <div className="font-medium text-sm">{pageName} - AI分析</div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {templates.map((t, i) => (
              <button
                key={i}
                onClick={() => analyze(t.prompt)}
                disabled={loading}
                className="px-2.5 py-1 text-xs border rounded-full hover:bg-muted disabled:opacity-50"
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <ScrollArea className="max-h-[300px] p-4">
          {loading && !result && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
              正在分析...
            </div>
          )}
          {result && (
            <div
              className="text-sm whitespace-pre-wrap"
              dangerouslySetInnerHTML={{
                __html: result
                  .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                  .replace(/`(.+?)`/g, '<code class="bg-muted px-1 py-0.5 rounded text-xs">$1</code>')
                  .replace(/\n/g, '<br/>')
              }}
            />
          )}
          {!loading && !result && (
            <div className="text-sm text-muted-foreground text-center py-4">
              点击上方按钮开始分析
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
