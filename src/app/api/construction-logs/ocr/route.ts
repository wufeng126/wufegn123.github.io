import { NextRequest } from 'next/server';
import { Config, FetchClient, S3Storage } from 'coze-coding-dev-sdk';
import { requireApiWritePermission } from '@/lib/api-auth';
import { apiBadRequest, apiServerError, apiSuccess, getErrorMessage } from '@/lib/api-utils';
import { analyzeConstructionLogOcrQuality, parseConstructionLogText } from '@/lib/construction-log-ocr';
import { extractForwardHeaders } from '@/lib/ai-service';

const MAX_IMAGE_SIZE = 12 * 1024 * 1024;
const MAX_IMAGE_COUNT = 6;
const SUPPORTED_IMAGE = /^image\/(png|jpe?g|webp|bmp)$/i;

async function recognizeImage(file: File, request: NextRequest, index: number) {
  const storage = new S3Storage({
    endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
    accessKey: '',
    secretKey: '',
    bucketName: process.env.COZE_BUCKET_NAME,
    region: 'cn-beijing',
  });
  const buffer = Buffer.from(await file.arrayBuffer());
  const storageKey = await storage.uploadFile({
    fileContent: buffer,
    fileName: `construction-log-ocr/${Date.now()}-${index}-${file.name}`,
    contentType: file.type || 'application/octet-stream',
  });

  const signedUrl = await storage.generatePresignedUrl({ key: storageKey, expireTime: 3600 });
  const fetchClient = new FetchClient(new Config(), extractForwardHeaders(request.headers));
  const fetchResult = await fetchClient.fetch(signedUrl);
  const text = fetchResult?.content
    ? fetchResult.content
      .filter((item: { type: string; text?: string }) => item.type === 'text' && item.text)
      .map((item: { text?: string }) => item.text || '')
      .join('\n')
      .trim()
    : '';

  return {
    name: file.name,
    size: file.size,
    storageKey,
    text,
  };
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const formData = await request.formData();
    const files = [
      ...formData.getAll('files').filter((item): item is File => item instanceof File),
      ...formData.getAll('file').filter((item): item is File => item instanceof File),
    ].slice(0, MAX_IMAGE_COUNT);
    if (files.length === 0) return apiBadRequest('请选择施工日志照片');
    for (const file of files) {
      if (!SUPPORTED_IMAGE.test(file.type || '')) return apiBadRequest('仅支持 png、jpg、jpeg、webp、bmp 图片');
      if (file.size > MAX_IMAGE_SIZE) return apiBadRequest('单张图片不能超过12MB');
    }

    let rawText = '';
    let fileResults: Array<{ name: string; size: number; storageKey: string; text: string }> = [];
    let warning = '';

    try {
      fileResults = await Promise.all(files.map((file, index) => recognizeImage(file, request, index + 1)));
      rawText = fileResults
        .map((item, index) => item.text ? `【第${index + 1}张】\n${item.text}` : '')
        .filter(Boolean)
        .join('\n\n')
        .trim();
    } catch (error) {
      console.warn('[ConstructionLogOCR] OCR failed:', error);
      warning = '图片已提交，但自动识别暂未成功，请在下方人工补录或重新拍摄更清晰照片。';
    }
    const draft = parseConstructionLogText(rawText);
    const quality = analyzeConstructionLogOcrQuality(rawText, draft);
    const warnings = [
      ...(warning ? [warning] : []),
      ...quality.warnings,
    ];

    return apiSuccess({
      rawText,
      draft,
      files: fileResults.map(item => ({ name: item.name, size: item.size, storageKey: item.storageKey, textLength: item.text.length })),
      storageKey: fileResults[0]?.storageKey || '',
      warning: warnings[0] || '',
      warnings: rawText ? warnings : warnings.length > 0 ? warnings : ['未识别到文字，请人工确认后再提交。'],
      quality,
      needsReview: true,
    });
  } catch (e: unknown) {
    return apiServerError(getErrorMessage(e, '施工日志照片识别失败'));
  }
}
