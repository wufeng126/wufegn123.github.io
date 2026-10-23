import { NextRequest, NextResponse } from 'next/server';
import { requireApiWritePermission } from '@/lib/api-auth';
import { extractForwardHeaders } from '@/lib/ai-service';
import { classifyMaterialWithAI } from '@/lib/ai-material-classify';
import { DEFAULT_MISC_CATEGORY, guessMiscCategory } from '@/lib/misc-material-categories';

export const runtime = 'nodejs';

/**
 * 零星材料 AI 分类识别（两级）
 * 优先调用 AI 模型判断分类；AI 未启用/无凭据/调用失败/超时均自动回退本地关键词推断。
 * 返回 { category, subcategory, source: 'ai' | 'keyword' }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) {
      return auth.response;
    }

    let materialName = '';
    try {
      const body = await request.json();
      materialName = String(body?.name || '').trim();
    } catch {
      materialName = '';
    }
    if (!materialName) {
      return NextResponse.json({ error: '请提供材料名称' }, { status: 400 });
    }

    const aiGuess = await classifyMaterialWithAI(extractForwardHeaders(request.headers), materialName);
    if (aiGuess) {
      return NextResponse.json({ category: aiGuess.category, subcategory: aiGuess.subcategory, source: 'ai' });
    }

    const guessed = guessMiscCategory(materialName);
    return NextResponse.json({ category: guessed.category, subcategory: guessed.subcategory, source: 'keyword' });
  } catch (error) {
    console.error('AI 材料分类失败:', error);
    return NextResponse.json({ category: DEFAULT_MISC_CATEGORY, subcategory: null, source: 'keyword' });
  }
}
