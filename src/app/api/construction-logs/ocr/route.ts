import { NextRequest } from 'next/server';
import { Config, FetchClient, S3Storage } from 'coze-coding-dev-sdk';
import { requireApiWritePermission } from '@/lib/api-auth';
import { apiBadRequest, apiServerError, apiSuccess, getErrorMessage } from '@/lib/api-utils';
import { parseConstructionLogText } from '@/lib/construction-log-ocr';
import { extractForwardHeaders } from '@/lib/ai-service';

const MAX_IMAGE_SIZE = 12 * 1024 * 1024;
const SUPPORTED_IMAGE = /^image\/(png|jpe?g|webp|bmp)$/i;

export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) return apiBadRequest('请选择施工日志照片');
    if (!SUPPORTED_IMAGE.test(file.type || '')) return apiBadRequest('仅支持 png、jpg、jpeg、webp、bmp 图片');
    if (file.size > MAX_IMAGE_SIZE) return apiBadRequest('图片不能超过12MB');

    let rawText = '';
    let storageKey = '';
    let warning = '';

    try {
      const storage = new S3Storage({
        endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
        accessKey: '',
        secretKey: '',
        bucketName: process.env.COZE_BUCKET_NAME,
        region: 'cn-beijing',
      });
      const buffer = Buffer.from(await file.arrayBuffer());
      storageKey = await storage.uploadFile({
        fileContent: buffer,
        fileName: `construction-log-ocr/${Date.now()}-${file.name}`,
        contentType: file.type || 'application/octet-stream',
      });

      const signedUrl = await storage.generatePresignedUrl({ key: storageKey, expireTime: 3600 });
      const fetchClient = new FetchClient(new Config(), extractForwardHeaders(request.headers));
      const fetchResult = await fetchClient.fetch(signedUrl);
      if (fetchResult?.content) {
        rawText = fetchResult.content
          .filter((item: { type: string; text?: string }) => item.type === 'text' && item.text)
          .map((item: { text?: string }) => item.text || '')
          .join('\n')
          .trim();
      }
    } catch (error) {
      console.warn('[ConstructionLogOCR] OCR failed:', error);
      warning = '图片已提交，但自动识别暂未成功，请在下方人工补录或重新拍摄更清晰照片。';
    }

    return apiSuccess({
      rawText,
      draft: parseConstructionLogText(rawText),
      storageKey,
      warning: rawText ? '' : warning || '未识别到文字，请人工确认后再提交。',
      needsReview: true,
    });
  } catch (e: unknown) {
    return apiServerError(getErrorMessage(e, '施工日志照片识别失败'));
  }
}
