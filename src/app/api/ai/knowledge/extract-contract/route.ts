import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { createConfiguredLLMClient } from '@/lib/ai-service';
import { requireApiWritePermission } from '@/lib/api-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_EXTRACT_LENGTH = 60_000; // 只对合同文本前 6 万字做提取（避免超长）

const EXTRACT_PROMPT = `你是建筑合同清单提取助手。请从合同文本中提取"工程量清单/清单报价表"内容，严格按以下格式输出（保持表格结构，不要额外解释）：

【清单明细】
序号 | 项目名称 | 规格型号 | 单位 | 数量 | 单价(元) | 金额(元) | 备注
1 | 砌体工程 | MU10烧结页岩砖 | m³ | 120 | 580.00 | 69600.00 | 
2 | ... | ... | ... | ... | ... | ... | ...

要求：
1. 只提取清单/报价表相关的内容；条款、说明、签章等不提取
2. 单价/金额保留原始数字（不带单位符号）
3. 如果合同中有多处清单（如分部分项清单、措施项目清单），全部列出并标注所属清单名称
4. 未发现清单表格时，只输出一行：未发现清单明细`;

/**
 * POST /api/ai/knowledge/extract-contract
 * 从已入库合同文档中提取"清单项+单价"结构化摘要，存入知识库供 AI 问答
 * body: { doc_id: number, title?: string } —— doc_id 为 ai_knowledge_docs 记录
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const body = await request.json().catch(() => ({}));
    const docId = Number(body?.doc_id || 0);
    if (!docId) {
      return NextResponse.json({ success: false, error: '缺少文档ID' }, { status: 400 });
    }

    const supabase = getSupabaseClient();
    const { data: doc } = await supabase
      .from('ai_knowledge_docs')
      .select('id, title, content')
      .eq('id', docId)
      .maybeSingle();
    if (!doc) return NextResponse.json({ success: false, error: '文档不存在' }, { status: 404 });

    const rawContent = String(doc.content || '').slice(0, MAX_EXTRACT_LENGTH);
    if (rawContent.length < 50) {
      return NextResponse.json({ success: false, error: '该文档内容过短（可能是扫描件未识别），无法提取清单' }, { status: 400 });
    }

    const client = await createConfiguredLLMClient();
    if (!client) {
      return NextResponse.json({ success: false, error: 'AI 未配置密钥，无法提取清单（请先在 AI 配置中填写模型凭据）' }, { status: 400 });
    }

    // LLM 提取清单（非流式）
    let extracted = '';
    try {
      const response = await client.invoke([
        { role: 'system', content: EXTRACT_PROMPT },
        { role: 'user', content: `合同文本如下：\n\n${rawContent}` },
      ], { temperature: 0 });
      extracted = String(response?.content || '').trim();
    } catch (e: any) {
      return NextResponse.json({ success: false, error: `提取失败：${e?.message || '模型调用异常'}` }, { status: 500 });
    }

    if (!extracted || extracted.includes('未发现清单明细')) {
      return NextResponse.json({ success: true, extracted: '', skipped: true, message: '未在合同中识别到清单明细' });
    }

    // 生成摘要文档入知识库（供 AI 问答合同清单/单价）
    const summaryTitle = `${doc.title}——清单与单价摘要`;
    const summaryContent = `【合同清单与单价摘要】（由 ${doc.title} 自动提取）\n\n${extracted}`;

    let knowledgeDocId: string | undefined;
    try {
      const { data: inserted } = await supabase
        .from('ai_knowledge_docs')
        .insert({
          title: summaryTitle,
          category: 'contract',
          source_type: 'auto_extract',
          source_ref: `extract_${docId}`,
          content: summaryContent,
          status: 'active',
        })
        .select('id')
        .single();
      knowledgeDocId = String(inserted?.id || '');
    } catch (e) {
      console.warn('[ExtractContract] 摘要入库失败:', e);
    }

    return NextResponse.json({
      success: true,
      extracted,
      skipped: false,
      summaryDocId: knowledgeDocId,
      message: '已提取清单并生成摘要，可在 AI 劳务助手中询问清单项与单价',
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || '提取失败' }, { status: 500 });
  }
}
