import { NextRequest } from 'next/server';
import { S3Storage } from 'coze-coding-dev-sdk';
import { requireApiWritePermission } from '@/lib/api-auth';
import { apiBadRequest, apiServerError, apiSuccess, getErrorMessage } from '@/lib/api-utils';

const MAX_IMAGE_SIZE = 12 * 1024 * 1024;
const MAX_IMAGE_COUNT = 12;
const SUPPORTED_IMAGE = /^image\/(png|jpe?g|webp|bmp)$/i;

function createStorage() {
  return new S3Storage({
    endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
    accessKey: '',
    secretKey: '',
    bucketName: process.env.COZE_BUCKET_NAME,
    region: 'cn-beijing',
  });
}

function sanitizeFileName(name: string) {
  const cleaned = name.replace(/[^\w.\-]+/g, '_').replace(/_+/g, '_');
  return cleaned || 'photo.jpg';
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

    if (files.length === 0) return apiBadRequest('请选择要上传的施工照片');
    for (const file of files) {
      if (!SUPPORTED_IMAGE.test(file.type || '')) return apiBadRequest('仅支持 png、jpg、jpeg、webp、bmp 图片');
      if (file.size > MAX_IMAGE_SIZE) return apiBadRequest('单张图片不能超过12MB');
    }

    const storage = createStorage();
    const now = Date.now();
    const attachments = await Promise.all(files.map(async (file, index) => {
      const buffer = Buffer.from(await file.arrayBuffer());
      const storageKey = await storage.uploadFile({
        fileContent: buffer,
        fileName: `construction-log-attachments/${now}-${index + 1}-${sanitizeFileName(file.name)}`,
        contentType: file.type || 'application/octet-stream',
      });
      const url = await storage.generatePresignedUrl({ key: storageKey, expireTime: 3600 });

      return {
        name: file.name,
        size: file.size,
        storageKey,
        type: 'image',
        uploadedAt: new Date().toISOString(),
        url,
      };
    }));

    return apiSuccess({ attachments });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '施工照片上传失败'));
  }
}
