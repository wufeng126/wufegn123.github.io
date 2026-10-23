/**
 * 零星材料 AI 分类服务
 * 优先调用 AI 模型判断分类；AI 未启用/无凭据/调用失败/超时均返回 null，
 * 由调用方回退到 guessMiscCategory 关键词推断。
 */
import { createConfiguredLLMClient, getAIConfig } from '@/lib/ai-service';
import {
  MISC_MATERIAL_CATEGORIES,
  type MiscMaterialCategory,
} from '@/lib/misc-material-categories';

const AI_TIMEOUT_MS = 15_000;

const CATEGORY_GUIDE = MISC_MATERIAL_CATEGORIES
  .map((c) =>
    c.keywords.length > 0
      ? `${c.value}（如：${c.keywords.slice(0, 8).join('、')}等）`
      : `${c.value}（无法归入以上类别的零星材料）`,
  )
  .join('\n');

/** 单个材料名称 AI 分类，返回 null 表示 AI 不可用 */
export async function classifyMaterialWithAI(
  forwardHeaders: Record<string, string>,
  materialName: string,
): Promise<MiscMaterialCategory | null> {
  try {
    const name = materialName.trim();
    if (!name) return null;

    const config = await getAIConfig();
    if (!config?.enabled) return null;

    const client = await createConfiguredLLMClient(forwardHeaders);
    if (!client) return null;

    const task = (async (): Promise<string> => {
      const stream = await client.stream(
        [
          {
            role: 'system',
            content: `你是建筑劳务企业的材料分类助手。根据用户给出的材料名称，从以下 9 个类别中选出最贴切的一个。只输出类别名称本身，禁止输出任何解释、标点或其他文字。\n${CATEGORY_GUIDE}`,
          },
          { role: 'user', content: name },
        ],
        { model: config.model_id, temperature: 0 },
      );

      let text = '';
      for await (const chunk of stream) {
        const part = chunk as { content?: unknown; text?: unknown } | string;
        if (typeof part === 'string') text += part;
        else if (typeof part?.content === 'string') text += part.content;
        else if (typeof part?.text === 'string') text += part.text;
      }
      return text;
    })();

    const text = await Promise.race([
      task,
      new Promise<string>((_, reject) => setTimeout(() => reject(new Error('AI 分类超时')), AI_TIMEOUT_MS)),
    ]).catch(() => null);

    if (!text) return null;
    const cleaned = text.replace(/[。.!！?,，、\s"'「」【】]/g, '');
    return MISC_MATERIAL_CATEGORIES.find((c) => cleaned.includes(c.value))?.value ?? null;
  } catch (error) {
    console.warn('[AI 材料分类] 调用失败，将回退关键词推断:', error);
    return null;
  }
}

/**
 * 批量材料名称 AI 分类（限制并发，避免批量识别时打满模型）
 * 返回与输入等长的数组，每项为分类或 null（null 表示该项需关键词回退）
 */
export async function classifyMaterialsWithAI(
  forwardHeaders: Record<string, string>,
  materialNames: string[],
  concurrency = 3,
): Promise<(MiscMaterialCategory | null)[]> {
  const results: (MiscMaterialCategory | null)[] = new Array(materialNames.length).fill(null);
  let cursor = 0;

  const workers = Array.from({ length: Math.min(concurrency, materialNames.length) }, async () => {
    while (cursor < materialNames.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await classifyMaterialWithAI(forwardHeaders, materialNames[index]);
    }
  });
  await Promise.all(workers);
  return results;
}
