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

/**
 * 阿里云 OSS 统一存储工具层（S3 协议直连）
 *
 * 背景：原实现使用 coze-coding-dev-sdk 的 S3Storage，其内部优先读取
 * COZE_BUCKET_ENDPOINT_URL / COZE_BUCKET_NAME / COZE_WORKLOAD_IDENTITY_API_KEY，
 * 导致文件实际上传到 Coze 平台内置存储而非用户自己的阿里云 OSS。
 * 本工具改为 @aws-sdk/client-s3 直连阿里云 OSS，彻底脱离 Coze 存储。
 *
 * 环境变量：
 *   OSS_ENDPOINT           阿里云 OSS endpoint（如 https://oss-cn-beijing.aliyuncs.com）
 *   OSS_ACCESS_KEY_ID      AccessKeyId
 *   OSS_ACCESS_KEY_SECRET  AccessKeySecret
 *   OSS_BUCKET_NAME        Bucket 名称
 *   OSS_REGION             区域（默认 cn-beijing）
 */

function requiredConfig() {
  const endpoint = (process.env.OSS_ENDPOINT || '').trim();
  const accessKeyId = (process.env.OSS_ACCESS_KEY_ID || '').trim();
  const secretAccessKey = (process.env.OSS_ACCESS_KEY_SECRET || '').trim();
  const bucketName = (process.env.OSS_BUCKET_NAME || '').trim();
  const region = (process.env.OSS_REGION || 'cn-beijing').trim();

  if (!endpoint || !accessKeyId || !secretAccessKey || !bucketName) {
    throw new Error(
      'OSS 未配置：请设置 OSS_ENDPOINT / OSS_ACCESS_KEY_ID / OSS_ACCESS_KEY_SECRET / OSS_BUCKET_NAME',
    );
  }

  return { endpoint, accessKeyId, secretAccessKey, bucketName, region };
}

let cachedClient: S3Client | null = null;

function getClient(): S3Client {
  if (cachedClient) return cachedClient;
  const { endpoint, accessKeyId, secretAccessKey, region } = requiredConfig();
  cachedClient = new S3Client({
    endpoint,
    region,
    forcePathStyle: false, // 阿里云 OSS 使用 virtual-hosted-style（bucket.endpoint/key）
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
  const client = getClient();
  const bucket = getBucket(options);
  const key = generateObjectKey(options.fileName);
  try {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: options.fileContent,
        ContentType: options.contentType || 'application/octet-stream',
      }),
    );
  } catch (err) {
    console.error('[OSS] uploadFile failed:', {
      bucket,
      key,
      size: options.fileContent.length,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
  return key;
}

/** 生成预签名 URL（阿里云 OSS 原生签名，不需要 /sign-url 服务） */
export async function generatePresignedUrl(options: {
  key: string;
  bucket?: string;
  expireTime?: number;
}): Promise<string> {
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
  const client = getClient();
  const bucket = getBucket(options);
  await client.send(
    new DeleteObjectCommand({ Bucket: bucket, Key: options.fileKey }),
  );
  return true;
}

/** 读取文件内容 */
export async function readFile(options: { fileKey: string; bucket?: string }): Promise<Buffer> {
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
