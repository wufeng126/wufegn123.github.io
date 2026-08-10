import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * 阿里云 OSS 统一存储工具层（S3 协议直连）
 *
 * 背景：原实现使用 coze-coding-dev-sdk 的 S3Storage，其内部优先读取
 * COZE_BUCKET_ENDPOINT_URL / COZE_BUCKET_NAME / COZE_WORKLOAD_IDENTITY_API_KEY，
 * 导致文件实际上传到 Coze 平台内置存储而非用户自己的阿里云 OSS。
 * 本工具改为 @aws-sdk/client-s3 直连阿里云 OSS，彻底脱离 Coze 存储。
 *
 * 回退机制（v2）：OSS 环境变量未配置/不完整时，自动回退到 Supabase Storage
 * （数据库自带对象存储，无需额外配置），保证照片/合同/附件上传始终可用；
 * 配置好 OSS 后自动切回阿里云 OSS，无需改代码。
 *
 * 环境变量：
 *   OSS_ENDPOINT           阿里云 OSS endpoint（如 https://oss-cn-beijing.aliyuncs.com）
 *   OSS_ACCESS_KEY_ID      AccessKeyId
 *   OSS_ACCESS_KEY_SECRET  AccessKeySecret
 *   OSS_BUCKET_NAME        Bucket 名称
 *   OSS_REGION             区域（默认 cn-beijing）
 *   SUPABASE_STORAGE_BUCKET 回退桶名（默认 app-files）
 */

/** OSS 配置是否齐全（齐全 → 走阿里云 OSS；否则回退 Supabase Storage）
 * 兼容常见拼写错误：OSS_ACCESS_KEY_SECR → 当作 OSS_ACCESS_KEY_SECRET 的别名
 */
function readOssVar(name: string, aliases: string[] = []): string {
  return (process.env[name] || aliases.map(a => process.env[a]).join('') || '').trim() || '';
}

function readOssSecret(): string {
  return (
    process.env.OSS_ACCESS_KEY_SECRET?.trim() ||
    process.env.OSS_ACCESS_KEY_SECR?.trim() ||  // 兼容拼错
    ''
  );
}

function hasOssConfig(): boolean {
  return Boolean(
    readOssVar('OSS_ENDPOINT') &&
    readOssVar('OSS_ACCESS_KEY_ID') &&
    readOssSecret() &&
    readOssVar('OSS_BUCKET_NAME'),
  );
}

/** 当前使用的存储模式（供诊断/日志） */
export function getStorageMode(): 'oss' | 'supabase' {
  return hasOssConfig() ? 'oss' : 'supabase';
}

/** 回退桶名 */
function getFallbackBucket(): string {
  return process.env.SUPABASE_STORAGE_BUCKET?.trim() || 'app-files';
}

/** 确保回退桶存在（service_role 可自动创建） */
async function ensureFallbackBucket(): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    const { data: buckets } = await supabase.storage.listBuckets();
    if (!buckets?.some((b) => b.name === getFallbackBucket())) {
      await supabase.storage.createBucket(getFallbackBucket(), { public: false });
    }
  } catch (e) {
    console.warn('[OSS-Fallback] ensure bucket failed:', e);
  }
}

function requiredConfig() {
  const endpoint = readOssVar('OSS_ENDPOINT');
  const accessKeyId = readOssVar('OSS_ACCESS_KEY_ID');
  const secretAccessKey = readOssSecret();
  const bucketName = readOssVar('OSS_BUCKET_NAME');
  const region = readOssVar('OSS_REGION') || 'cn-beijing';

  if (!endpoint || !accessKeyId || !secretAccessKey || !bucketName) {
    throw new Error(
      `OSS 未配置完整（endpoint=${endpoint ? '✓' : '✗'} accessKeyId=${accessKeyId ? '✓' : '✗'} accessKeySecret=${secretAccessKey ? '✓' : '✗'} bucketName=${bucketName ? '✓' : '✗'}）。注意：环境变量名必须是 OSS_ACCESS_KEY_SECRET，少写 ET（写成 SECR）会导致无法读取。`,
    );
  }

  return { endpoint, accessKeyId, secretAccessKey, bucketName, region };
}

let cachedClient: S3Client | null = null;

function getClient(): S3Client {
  if (cachedClient) return cachedClient;
  const { endpoint, accessKeyId, secretAccessKey, bucketName, region } = requiredConfig();
  
  // 阿里云 OSS 必须使用虚拟主机风格：https://{bucket}.oss-{region}.aliyuncs.com
  // 将 bucket 名称嵌入 endpoint URL，避免 SDK 的路径风格问题
  const endpointUrl = new URL(endpoint);
  const virtualHostEndpoint = `https://${bucketName}.${endpointUrl.hostname}`;
  
  cachedClient = new S3Client({
    endpoint: virtualHostEndpoint,
    region,
    forcePathStyle: false,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    // 上传超时与连接配置
    requestHandler: undefined,
    maxAttempts: 3,
  });
  return cachedClient;
}

function getBucket(options?: { bucket?: string }) {
  if (options?.bucket?.trim()) return options.bucket.trim();
  return requiredConfig().bucketName;
}

/**
 * 生成最终存储 Key：与 Coze SDK 行为一致，在文件名前加 8 位随机后缀避免同名覆盖。
 * 同时做轻量 sanitize（保留中文/Unicode，替换 URL 不安全字符），防止 key 破坏预签名 URL。
 */
function generateObjectKey(fileName: string): string {
  const normalized = String(fileName || '').replace(/\\/g, '/').trim();
  const ext = path.posix.extname(normalized).toLowerCase();
  const base = path.posix.basename(normalized, ext);
  const dir = path.posix.dirname(normalized);

  const safeBase = base
    .replace(/[^\w.\-\u4e00-\u9fa5]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[._]+|[._]+$/g, '') || 'file';
  const safeExt = ext.replace(/[^\w.]/g, '');

  const random = randomUUID().replace(/-/g, '').slice(0, 8);
  const newName = `${safeBase}_${random}${safeExt}`;
  return dir && dir !== '.' ? `${dir}/${newName}` : newName;
}

/** 上传文件，返回实际存储 Key（与 SDK 行为一致：自动加随机后缀） */
export async function uploadFile(options: {
  fileContent: Buffer;
  fileName: string;
  contentType?: string;
  bucket?: string;
}): Promise<string> {
  const key = generateObjectKey(options.fileName);

  if (!hasOssConfig()) {
    // 回退：Supabase Storage（OSS 未配置时保证上传可用）
    const supabase = getSupabaseClient();
    await ensureFallbackBucket();
    const { error } = await supabase.storage
      .from(getFallbackBucket())
      .upload(key, options.fileContent, {
        contentType: options.contentType || 'application/octet-stream',
        upsert: true,
      });
    if (error) throw new Error(`文件上传失败（当前使用 Supabase 存储）: ${error.message}`);
    return key;
  }

  const client = getClient();
  const bucket = getBucket(options);
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: options.fileContent,
      ContentType: options.contentType || 'application/octet-stream',
    }),
  );
  return key;
}

/** 生成预签名 URL（阿里云 OSS 原生签名；回退模式用 Supabase Storage 签名） */
export async function generatePresignedUrl(options: {
  key: string;
  bucket?: string;
  expireTime?: number;
}): Promise<string> {
  if (!hasOssConfig()) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.storage
      .from(getFallbackBucket())
      .createSignedUrl(options.key, options.expireTime || 3600);
    if (error || !data?.signedUrl) {
      throw new Error(`生成访问链接失败: ${error?.message || '未知错误'}`);
    }
    return data.signedUrl;
  }

  const client = getClient();
  const bucket = getBucket(options);
  // 使用 as any 绕过 @smithy/types 版本不兼容的类型检查（运行时兼容）
  return getSignedUrl(
    client as any,
    new GetObjectCommand({ Bucket: bucket, Key: options.key }) as any,
    { expiresIn: options.expireTime || 3600 },
  );
}

/** 删除文件 */
export async function deleteFile(options: { fileKey: string; bucket?: string }): Promise<boolean> {
  if (!hasOssConfig()) {
    const supabase = getSupabaseClient();
    const { error } = await supabase.storage.from(getFallbackBucket()).remove([options.fileKey]);
    if (error) throw new Error(`删除文件失败: ${error.message}`);
    return true;
  }

  const client = getClient();
  const bucket = getBucket(options);
  await client.send(
    new DeleteObjectCommand({ Bucket: bucket, Key: options.fileKey }),
  );
  return true;
}

/** 读取文件内容 */
export async function readFile(options: { fileKey: string; bucket?: string }): Promise<Buffer> {
  if (!hasOssConfig()) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.storage.from(getFallbackBucket()).download(options.fileKey);
    if (error || !data) throw new Error(`读取文件失败: ${error?.message || '文件不存在'}`);
    return Buffer.from(await data.arrayBuffer());
  }

  const client = getClient();
  const bucket = getBucket(options);
  const result = await client.send(
    new GetObjectCommand({ Bucket: bucket, Key: options.fileKey }),
  );
  if (!result.Body) throw new Error('OSS GetObject 返回空 Body');
  const chunks: Uint8Array[] = [];
  for await (const chunk of result.Body as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/** 判断文件是否存在 */
export async function fileExists(options: { fileKey: string; bucket?: string }): Promise<boolean> {
  if (!hasOssConfig()) {
    const supabase = getSupabaseClient();
    const { data } = await supabase.storage.from(getFallbackBucket()).list(options.fileKey.split('/').slice(0, -1).join('/') || '.', {
      limit: 100,
      search: options.fileKey.split('/').pop() || '',
    });
    return Boolean(data?.some((f) => `${options.fileKey.split('/').slice(0, -1).join('/')}/${f.name}` === options.fileKey));
  }

  try {
    const client = getClient();
    const bucket = getBucket(options);
    await client.send(
      new HeadObjectCommand({ Bucket: bucket, Key: options.fileKey }),
    );
    return true;
  } catch (error) {
    const status = (error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
    if (status === 404) return false;
    console.warn('[OSS] fileExists error:', error);
    return false;
  }
}

/** 列出文件（前缀过滤） */
export async function listFiles(options?: {
  prefix?: string;
  bucket?: string;
  maxKeys?: number;
  continuationToken?: string;
}): Promise<{ keys: string[]; isTruncated: boolean; nextContinuationToken?: string }> {
  if (!hasOssConfig()) {
    const supabase = getSupabaseClient();
    const prefix = (options?.prefix || '').replace(/\/$/, '');
    const dir = prefix.includes('/') ? prefix.slice(0, prefix.lastIndexOf('/')) : prefix || '.';
    const { data, error } = await supabase.storage.from(getFallbackBucket()).list(dir, {
      limit: options?.maxKeys || 1000,
    });
    if (error) throw new Error(`列出文件失败: ${error.message}`);
    const keys = (data || []).map((f) => `${dir === '.' ? '' : dir}/${f.name}`).filter(Boolean);
    return { keys, isTruncated: false, nextContinuationToken: undefined };
  }

  const client = getClient();
  const bucket = getBucket(options);
  const result = await client.send(
    new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: options?.prefix || undefined,
      MaxKeys: options?.maxKeys || 1000,
      ContinuationToken: options?.continuationToken || undefined,
    }),
  );
  return {
    keys: (result.Contents || []).map((item) => item.Key || '').filter(Boolean),
    isTruncated: result.IsTruncated || false,
    nextContinuationToken: result.NextContinuationToken || undefined,
  };
}

/** 兼容 S3Storage 类风格的实例（少量调用点按类实例使用） */
export class OSSStorage {
  uploadFile(options: {
    fileContent: Buffer;
    fileName: string;
    contentType?: string;
    bucket?: string;
  }) {
    return uploadFile(options);
  }

  generatePresignedUrl(options: { key: string; bucket?: string; expireTime?: number }) {
    return generatePresignedUrl(options);
  }

  deleteFile(options: { fileKey: string; bucket?: string }) {
    return deleteFile(options);
  }

  readFile(options: { fileKey: string; bucket?: string }) {
    return readFile(options);
  }

  fileExists(options: { fileKey: string; bucket?: string }) {
    return fileExists(options);
  }

  listFiles(options?: {
    prefix?: string;
    bucket?: string;
    maxKeys?: number;
    continuationToken?: string;
  }) {
    return listFiles(options);
  }
}
