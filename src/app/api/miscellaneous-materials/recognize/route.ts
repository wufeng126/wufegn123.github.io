import { NextRequest } from 'next/server';
import { ASRClient, Config, FetchClient, S3Storage } from 'coze-coding-dev-sdk';
import { requireApiWritePermission } from '@/lib/api-auth';
import { apiBadRequest, apiServerError, apiSuccess, getErrorMessage } from '@/lib/api-utils';
import { extractForwardHeaders } from '@/lib/ai-service';
import { parseMiscMaterialText } from '@/lib/misc-material-recognition';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getAccessibleProjectIds } from '@/lib/api-project-access';

const MAX_IMAGE_SIZE = 12 * 1024 * 1024;
const MAX_AUDIO_SIZE = 25 * 1024 * 1024;
const SUPPORTED_IMAGE = /^image\/(png|jpe?g|webp|bmp)$/i;
const SUPPORTED_AUDIO = /^audio\/(mpeg|mp3|wav|wave|x-wav|m4a|mp4|ogg|opus|webm)$/i;

interface ProjectRow {
  id: number | string;
  name: string | null;
}

function createStorage() {
  return new S3Storage({
    endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
    accessKey: '',
    secretKey: '',
    bucketName: process.env.COZE_BUCKET_NAME,
    region: 'cn-beijing',
  });
}

async function recognizeImage(file: File, request: NextRequest, index: number) {
  const storage = createStorage();
  const buffer = Buffer.from(await file.arrayBuffer());
  const storageKey = await storage.uploadFile({
    fileContent: buffer,
    fileName: `misc-material-ocr/${Date.now()}-${index}-${file.name}`,
    contentType: file.type || 'application/octet-stream',
  });

  try {
    const signedUrl = await storage.generatePresignedUrl({ key: storageKey, expireTime: 900 });
    const fetchClient = new FetchClient(new Config(), extractForwardHeaders(request.headers));
    const fetchResult = await fetchClient.fetch(signedUrl);
    return fetchResult?.content
      ? fetchResult.content
        .filter((item: { type: string; text?: string }) => item.type === 'text' && item.text)
        .map((item: { text?: string }) => item.text || '')
        .join('\n')
        .trim()
      : '';
  } finally {
    storage.deleteFile({ fileKey: storageKey }).catch(error => {
      console.warn('[MiscMaterialsRecognize] temporary image delete failed:', error);
    });
  }
}

async function recognizeAudio(file: File, request: NextRequest) {
  const buffer = Buffer.from(await file.arrayBuffer());
  const asr = new ASRClient(new Config(), extractForwardHeaders(request.headers));
  const result = await asr.recognize({
    uid: request.headers.get('x-user-id') || 'misc-material-user',
    base64Data: buffer.toString('base64'),
  });
  return result.text || '';
}

async function getProjectsForUser(request: NextRequest) {
  const client = getSupabaseClient();
  const auth = await requireApiWritePermission(request);
  if (!auth.ok) return { auth, projects: [] };

  const accessibleProjects = await getAccessibleProjectIds(client, auth.user);
  let query = client.from('projects').select('id, name').order('name', { ascending: true });
  if (accessibleProjects !== null) query = query.in('id', accessibleProjects);
  const { data, error } = await query;
  if (error) throw new Error(`查询项目失败: ${error.message}`);
  return {
    auth,
    projects: ((data || []) as ProjectRow[]).map(project => ({ id: Number(project.id), name: String(project.name || '') })),
  };
}

export async function POST(request: NextRequest) {
  try {
    const { auth, projects } = await getProjectsForUser(request);
    if (!auth.ok) return auth.response;

    const formData = await request.formData();
    const mode = String(formData.get('mode') || 'text');
    const manualText = String(formData.get('text') || '').trim();
    const files = [
      ...formData.getAll('files').filter((item): item is File => item instanceof File),
      ...formData.getAll('file').filter((item): item is File => item instanceof File),
    ].slice(0, 6);

    let rawText = manualText;
    const warnings: string[] = [];

    if (files.length > 0 && mode === 'image') {
      for (const file of files) {
        if (!SUPPORTED_IMAGE.test(file.type || '')) return apiBadRequest('仅支持 png、jpg、jpeg、webp、bmp 图片');
        if (file.size > MAX_IMAGE_SIZE) return apiBadRequest('单张图片不能超过12MB');
      }
      const texts = await Promise.all(files.map((file, index) => recognizeImage(file, request, index + 1)));
      rawText = texts.map((text, index) => text ? `【第${index + 1}张】\n${text}` : '').filter(Boolean).join('\n\n').trim();
      if (!rawText) warnings.push('未识别到图片文字，请重新拍摄更清晰照片或手动补录。');
    }

    if (files.length > 0 && mode === 'voice') {
      const file = files[0];
      if (!SUPPORTED_AUDIO.test(file.type || '')) return apiBadRequest('仅支持 mp3、wav、m4a、ogg、webm 音频');
      if (file.size > MAX_AUDIO_SIZE) return apiBadRequest('音频不能超过25MB');
      rawText = await recognizeAudio(file, request);
      if (!rawText) warnings.push('未识别到语音内容，请重新录音或手动输入。');
    }

    if (!rawText) return apiBadRequest('请提供照片、语音或文字内容');

    const parsed = parseMiscMaterialText(rawText, projects);
    return apiSuccess({
      rawText,
      drafts: parsed.drafts,
      warnings: [...new Set([...warnings, ...parsed.warnings])],
      needsReview: true,
      savedImage: false,
    });
  } catch (error: unknown) {
    console.error('[MiscMaterialsRecognize] error:', error);
    return apiServerError(getErrorMessage(error, '零星材料识别失败'));
  }
}
