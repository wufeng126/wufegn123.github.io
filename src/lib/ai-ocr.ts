import { getAIConfig, createConfiguredLLMClient } from '@/lib/ai-service';

/**
 * 用多模态模型对图片（含 PDF 抽出的页面图）做 OCR。
 * imageUrl 支持 https 签名地址或 data:image/...;base64 URI。
 */
export async function ocrImageWithLLM(
  imageUrl: string,
  forwardHeaders: Record<string, string>,
): Promise<{ text: string; error?: string }> {
  try {
    const config = await getAIConfig();
    if (!config?.enabled) return { text: '', error: 'AI 未启用，无法识别扫描件' };

    const client = await createConfiguredLLMClient(forwardHeaders);
    if (!client) return { text: '', error: 'AI 未配置密钥，无法识别扫描件' };

    const stream = await client.stream([
      {
        role: 'system',
        content:
          '你是建筑合同扫描件 OCR 助手。请完整提取图片中的全部文字，保留合同条款、清单表格（项目/数量/单位/单价/金额）结构，按原文顺序输出纯文本，不要解释、不要省略。',
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: '请识别这张合同扫描件图片中的所有文字内容：' },
          { type: 'image_url', image_url: { url: imageUrl } },
        ],
      },
    ], {
      model: config.model_id,
      temperature: 0,
    });

    let text = '';
    for await (const chunk of stream) {
      const part = chunk as { content?: unknown; text?: unknown };
      if (typeof part === 'string') text += part;
      else if (typeof part?.content === 'string') text += part.content;
      else if (typeof part?.text === 'string') text += part.text;
      else if (part?.content && Array.isArray(part.content)) {
        text += (part.content as unknown[]).map((item: unknown) => {
          const record = item as { text?: unknown; content?: unknown };
          return String(record?.text || record?.content || '');
        }).join('');
      }
    }

    const cleaned = text.trim();
    if (!cleaned) return { text: '', error: '模型未返回内容，可能不支持图片识别' };
    return { text: cleaned };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return { text: '', error: `扫描件识别失败：${message}` };
  }
}

/** 多页 OCR：逐页识别，拼成带页码的文本；单次最多 8 页、6 万字 */
export async function ocrPagesWithLLM(
  pageImages: string[],
  forwardHeaders: Record<string, string>,
): Promise<{ text: string; pages: number; error?: string }> {
  const pageTexts: string[] = [];
  for (let i = 0; i < pageImages.length && i < 8; i += 1) {
    const result = await ocrImageWithLLM(pageImages[i], forwardHeaders);
    if (result.text) pageTexts.push(`【第 ${i + 1} 页】\n${result.text}`);
    if (pageTexts.join('\n').length > 60000) break;
  }
  if (pageTexts.length === 0) {
    return { text: '', pages: 0, error: '未识别到文字，请确认已配置支持图片识别的模型（如 Doubao 视觉模型）' };
  }
  return { text: `【扫描件 OCR 识别，共 ${pageTexts.length} 页】\n${pageTexts.join('\n\n')}`, pages: pageTexts.length };
}
