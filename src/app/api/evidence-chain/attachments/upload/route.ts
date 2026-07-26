import { NextRequest } from 'next/server';
import { S3Storage } from 'coze-coding-dev-sdk';
import { requireApiWritePermission } from '@/lib/api-auth';
import { apiBadRequest, apiServerError, apiSuccess, getErrorMessage } from '@/lib/api-utils';

const MAX_FILE_SIZE = 30 * 1024 * 1024;
const MAX_FILE_COUNT = 20;

const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/bmp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
]);

function createStorage() {
  return new S3Storage({
    endpointUrl: process.env.OSS_ENDPOINT || process.env.COZE_BUCKET_ENDPOINT_URL,
    accessKey: process.env.OSS_ACCESS_KEY_ID || '',
    secretKey: process.env.OSS_ACCESS_KEY_SECRET || '',
    bucketName: process.env.OSS_BUCKET_NAME || process.env.COZE_BUCKET_NAME,
    region: process.env.OSS_REGION || 'cn-beijing',
  });
}

function sanitizeFileName(name: string) {
  const cleaned = name.replace(/[^\w.\-\u4e00-\u9fa5]+/g, '_').replace(/_+/g, '_');
  return cleaned || 'evidence-file';
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const formData = await request.formData();
    const files = [
      ...formData.getAll('files').filter((item): item is File => item instanceof File),
      ...formData.getAll('file').filter((item): item is File => item instanceof File),
    ].slice(0, MAX_FILE_COUNT);

    if (files.length === 0) return apiBadRequest('请选择要上传的证据附件');

    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) return apiBadRequest('单个附件不能超过30MB');
      if (file.type && !ALLOWED_TYPES.has(file.type)) return apiBadRequest(`不支持的附件类型：${file.name}`);
    }

    const storage = createStorage();
    const now = Date.now();
    const attachments = await Promise.all(files.map(async (file, index) => {
      const buffer = Buffer.from(await file.arrayBuffer());
      const storageKey = await storage.uploadFile({
        fileContent: buffer,
        fileName: `settlement-evidence/${now}-${index + 1}-${sanitizeFileName(file.name)}`,
        contentType: file.type || 'application/octet-stream',
      });
      const url = await storage.generatePresignedUrl({ key: storageKey, expireTime: 3600 });

      return {
        name: file.name,
        size: file.size,
        type: file.type || 'application/octet-stream',
        storageKey,
        uploadedAt: new Date().toISOString(),
        url,
      };
    }));

    return apiSuccess({ attachments });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '证据附件上传失败'));
  }
}
