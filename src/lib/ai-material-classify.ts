/**
 * 零星材料 AI 分类服务（两级）
 * 优先调用 AI 模型判断分类；AI 未启用/无凭据/调用失败/超时均返回 null，
 * 由调用方回退到 guessMiscCategory 关键词推断。
 */
import { createConfiguredLLMClient, getAIConfig } from '@/lib/ai-service';
import {
  isValidSubcategory,
  MISC_MATERIAL_CATEGORY_DEFS,
  type MiscCategoryGuess,
  type MiscMaterialCategory,
} from '@/lib/misc-material-categories';

const AI_TIMEOUT_MS = 15_000;

// 两级分类指南：一级 + 二级子类清单（供 AI 输出"一级/二级"）
const CATEGORY_GUIDE = MISC_MATERIAL_CATEGORY_DEFS
  .map((def) => {
    const subs = def.subcategories.map((s) => s.value).join('、');
    return subs
      ? `${def.value}（子类：${subs}）`
      : `${def.value}（无子类）`;
  })
  .join('\n');

/** 解析 AI 输出文本为两级分类，无法匹配返回 null */
function parseAiOutput(text: string): MiscCategoryGuess | null {
  const cleaned = text.replace(/[。.!！?,，、\s"'「」【】]/g, '');
  if (!cleaned) return null;

  // 支持"一级/二级"或"一级-二级"格式
  const parts = cleaned.split(/[/\-—]/).filter(Boolean);
  const category = MISC_MATERIAL_CATEGORY_DEFS.find(
    (def) => cleaned.includes(def.value) || parts[0]?.includes(def.value),
  )?.value as MiscMaterialCategory | undefined;
  if (!category) return null;

  const subText = parts[1];
  if (subText) {
    const sub = (MISC_MATERIAL_CATEGORY_DEFS.find((d) => d.value === category)?.subcategories || [])
      .find((s) => subText.includes(s.value) || s.value.includes(subText));
    if (sub) return { category, subcategory: sub.value };
  }
  return { category, subcategory: null };
}

/** 单个材料名称 AI 分类（两级），返回 null 表示 AI 不可用 */
export async function classifyMaterialWithAI(
  forwardHeaders: Record<string, string>,
  materialName: string,
): Promise<MiscCategoryGuess | null> {
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
            content: `你是建筑劳务企业的材料分类助手。根据用户给出的材料名称，从以下分类体系中选出最贴切的一级分类和二级子类。
输出格式：一级分类/二级子类（无合适子类时只输出一级分类）。禁止输出任何解释、标点或其他文字。
注意：方木、模板、胶合板、竹胶板等大宗板材不属于零星材料（由单独供应商供应），遇到此类名称请输出"其他材料"。
${CATEGORY_GUIDE}`,
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
    const parsed = parseAiOutput(text);
    if (parsed && parsed.subcategory && !isValidSubcategory(parsed.category, parsed.subcategory)) {
      return { category: parsed.category, subcategory: null };
    }
    return parsed;
  } catch (error) {
    console.warn('[AI 材料分类] 调用失败，将回退关键词推断:', error);
    return null;
  }
}

/**
 * 批量材料名称 AI 分类（限制并发，避免批量识别时打满模型）
 * 返回与输入等长的数组，每项为两级分类或 null（null 表示该项需关键词回退）
 */
export async function classifyMaterialsWithAI(
  forwardHeaders: Record<string, string>,
  materialNames: string[],
  concurrency = 3,
): Promise<(MiscCategoryGuess | null)[]> {
  const results: (MiscCategoryGuess | null)[] = new Array(materialNames.length).fill(null);
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
