import { NextRequest } from 'next/server';
import { requireApiWritePermission } from '@/lib/api-auth';
import { apiBadRequest, apiNotFound, apiServerError, apiSuccess, getErrorMessage } from '@/lib/api-utils';
import { extractForwardHeaders } from '@/lib/ai-service';
import { extractPdfImages } from '@/lib/pdf-image-extract';
import { extractPdfText } from '@/lib/pdf-text-extract';
import { extractDocxText } from '@/lib/docx-text-extract';
import { ocrImageWithLLM, ocrPagesWithLLM } from '@/lib/ai-ocr';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { OSSStorage } from '@/lib/oss-storage';

export const maxDuration = 300;

/**
 * POST /api/ai/knowledge/ocr
 * 对已上传的合同重新提取文字：PDF 先尝试文字层，失败则抽页面图做 OCR；Word 直接解析。
 * 用于修复"之前上传的扫描件在知识库里是空内容"的历史文件。
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const body = await request.json().catch(() => ({}));
    const id = Number(body.id) || 0;
    if (!id) return apiBadRequest('缺少文档 ID');

    const supabase = getSupabaseClient();
    const { data: doc, error } = await supabase
      .from('ai_knowledge_docs')
      .select('id, title, file_key, file_name, content')
      .eq('id', id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!doc) return apiNotFound('文档不存在');

    const fileKey = String(doc.file_key || '');
    if (!fileKey) return apiBadRequest('该文档没有原始文件，无法重新识别');

    const fileName = String(doc.file_name || doc.title || '');
    const storage = new OSSStorage();
    const signedUrl = await storage.generatePresignedUrl({ key: fileKey, expireTime: 3600 });
    const response = await fetch(signedUrl);
    if (!response.ok) throw new Error(`读取原始文件失败（${response.status}）`);
    const buffer = Buffer.from(await response.arrayBuffer());
    const forwardHeaders = extractForwardHeaders(request.headers);

    let text = '';
    let pages = 0;

    if (/\.pdf$/i.test(fileName)) {
      text = extractPdfText(buffer);
      if (text.trim().length < 30) {
        const pageImages = extractPdfImages(buffer, 8);
        if (pageImages.length === 0) {
          return apiBadRequest('该 PDF 没有文字层，也没有可识别的页面图片，请上传 Word 版或拍照上传');
        }
        const ocr = await ocrPagesWithLLM(pageImages, forwardHeaders);
        if (!ocr.text) return apiBadRequest(ocr.error || 'OCR 识别失败');
        text = ocr.text;
        pages = ocr.pages;
      }
    } else if (/\.docx?$/i.test(fileName)) {
      text = extractDocxText(buffer);
    } else if (/\.(jpe?g|png|webp|bmp)$/i.test(fileName)) {
      const ocr = await ocrImageWithLLM(signedUrl, forwardHeaders);
      if (!ocr.text) return apiBadRequest(ocr.error || 'OCR 识别失败');
      text = ocr.text;
      pages = 1;
    } else {
      return apiBadRequest('该文件类型暂不支持重新识别，请上传 PDF / Word / 图片');
    }

    if (!text || text.trim().length < 10) {
      return apiBadRequest('未识别到有效文字，请确认文件是否清晰');
    }

    const { error: updateError } = await supabase
      .from('ai_knowledge_docs')
      .update({
        content: text,
        chunk_count: Math.max(1, Math.ceil(text.length / 800)),
        status: 'active',
      })
      .eq('id', id);

    if (updateError) throw new Error(updateError.message);

    return apiSuccess({ id, pages, length: text.length, preview: text.slice(0, 200) });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '重新识别合同失败'));
  }
}
