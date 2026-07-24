import { NextRequest } from 'next/server';
import { Config, FetchClient, S3Storage } from 'coze-coding-dev-sdk';
import { requireApiWritePermission } from '@/lib/api-auth';
import { apiBadRequest, apiServerError, apiSuccess, getErrorMessage } from '@/lib/api-utils';
import { analyzeConstructionLogOcrQuality, parseConstructionLogText } from '@/lib/construction-log-ocr';
import { createLLMClient, extractForwardHeaders, getAIConfig } from '@/lib/ai-service';

const MAX_IMAGE_SIZE = 12 * 1024 * 1024;
const MAX_IMAGE_COUNT = 6;
const SUPPORTED_IMAGE = /^image\/(png|jpe?g|webp|bmp)$/i;

function getChunkText(chunk: unknown) {
  if (typeof chunk === 'string') return chunk;
  if (typeof chunk !== 'object' || chunk === null) return '';

  const record = chunk as { content?: unknown; text?: unknown };
  if (Array.isArray(record.content)) {
    return record.content
      .map(part => {
        if (typeof part === 'string') return part;
        if (typeof part !== 'object' || part === null) return '';
        const item = part as { text?: unknown; content?: unknown };
        return String(item.text || item.content || '');
      })
      .join('');
  }
  if (record.content != null) return String(record.content);
  if (record.text != null) return String(record.text);
  return '';
}

async function collectLLMText(stream: AsyncIterable<unknown>) {
  let text = '';
  for await (const chunk of stream) {
    text += getChunkText(chunk);
  }
  return text.trim();
}

function cleanAiContent(text: string) {
  return text
    .replace(/^```(?:text|markdown)?/i, '')
    .replace(/```$/i, '')
    .replace(/^施工内容\s*[:：]\s*/i, '')
    .trim();
}

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

async function polishConstructionContent(rawText: string, fallbackContent: string, request: NextRequest) {
  if (!rawText.trim()) return fallbackContent;

  try {
    const config = await getAIConfig();
    if (!config?.enabled) return fallbackContent;

    const client = createLLMClient(extractForwardHeaders(request.headers));
    const stream = await client.stream([
      {
        role: 'system',
        content: [
          '你是建筑施工日志 OCR 纠错助手。',
          '你的任务是把手写施工日志 OCR 文字纠错整理为“施工内容”。',
          '只修正常见错别字、断句和施工行业表达，不要编造图片中没有的工程事项。',
          '不要提取或输出项目名称、日期、施工部位、出勤人员、填报人。',
          '只输出整理后的施工内容正文，不要解释。',
        ].join('\n'),
      },
      {
        role: 'user',
        content: `OCR识别文字：\n${rawText.slice(0, 6000)}\n\n本地初步整理：\n${fallbackContent.slice(0, 3000)}`,
      },
    ], {
      model: config.model_id,
      temperature: 0.1,
    });
    const text = cleanAiContent(await collectLLMText(stream));
    return text || fallbackContent;
  } catch (error) {
    console.warn('[ConstructionLogOCR] AI polish failed:', error);
    return fallbackContent;
  }
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
      warning = '图片识别质量较低，已尽量整理，请重点核对施工内容。';
    }

    const draft = parseConstructionLogText(rawText);
    draft.content = await polishConstructionContent(rawText, draft.content, request);
    const quality = analyzeConstructionLogOcrQuality(rawText, draft);
    const warnings = [
      ...(warning ? [warning] : []),
      ...quality.warnings,
    ];

    return apiSuccess({
      draft,
      files: fileResults.map(item => ({
        name: item.name,
        size: item.size,
        storageKey: item.storageKey,
        textLength: item.text.length,
      })),
      storageKey: fileResults[0]?.storageKey || '',
      warning: warnings[0] || '',
      warnings: warnings.length > 0 ? warnings : ['已根据图片自动纠错整理施工内容，请提交前核对。'],
      quality,
      needsReview: true,
    });
  } catch (e: unknown) {
    return apiServerError(getErrorMessage(e, '施工日志照片识别失败'));
  }
}
