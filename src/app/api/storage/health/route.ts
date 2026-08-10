import { NextRequest, NextResponse } from 'next/server';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { requirePermission } from '@/lib/api-auth';
import { randomUUID } from 'node:crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/storage/health - OSS 存储健康检查
 * 返回：配置是否齐全、能否连接、能否上传/读取/删除测试对象
 * 用于排查"OSS 中没有数据"问题（配置缺失 vs 权限/端点错误）
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermission(request, 'system:ai_manage');
    if (!auth.ok) return auth.response;

    const endpoint = (process.env.OSS_ENDPOINT || '').trim();
    const accessKeyId = (process.env.OSS_ACCESS_KEY_ID || '').trim();
    const secretAccessKey = (process.env.OSS_ACCESS_KEY_SECRET || '').trim();
    const bucketName = (process.env.OSS_BUCKET_NAME || '').trim();
    const region = (process.env.OSS_REGION || 'cn-beijing').trim();

    const configComplete = Boolean(endpoint && accessKeyId && secretAccessKey && bucketName);
    if (!configComplete) {
      const fallbackBucket = process.env.SUPABASE_STORAGE_BUCKET?.trim() || 'app-files';
      return NextResponse.json({
        success: true,
        config: { endpoint: endpoint || '(未配置)', bucket: bucketName || '(未配置)', region, accessKeyId: accessKeyId || '(未配置)' },
        status: 'supabase_fallback',
        message: `阿里云 OSS 未完整配置（OSS_ENDPOINT / OSS_ACCESS_KEY_ID / OSS_ACCESS_KEY_SECRET / OSS_BUCKET_NAME），当前照片/合同/附件自动存入 Supabase Storage（桶 ${fallbackBucket}）。上传功能可用；如需存入阿里云 OSS，请配置上述环境变量后重新部署。`,
      });
    }

    const client = new S3Client({
      endpoint,
      region,
      forcePathStyle: true,
      credentials: { accessKeyId, secretAccessKey },
      maxAttempts: 2,
    });

    // 上传/读取/删除一个测试对象，验证完整链路
    const testKey = `health-check-${randomUUID()}.txt`;
    try {
      await client.send(new PutObjectCommand({
        Bucket: bucketName,
        Key: testKey,
        Body: 'storage-health-check',
        ContentType: 'text/plain',
      }));
      const get = await client.send(new GetObjectCommand({ Bucket: bucketName, Key: testKey }));
      const bodyText = await (get.Body as any)?.transformToString?.() || '';
      await client.send(new DeleteObjectCommand({ Bucket: bucketName, Key: testKey }));

      if (bodyText === 'storage-health-check') {
        return NextResponse.json({
          success: true,
          config: { endpoint, bucket: bucketName, region, accessKeyId },
          status: 'ok',
          message: `OSS 连接正常：已成功上传/读取/删除测试对象（桶 ${bucketName}，区域 ${region}）。上传的文件应以 contracts/、ai-knowledge/ 等前缀存放在该桶中。`,
        });
      }
      return NextResponse.json({
        success: true,
        config: { endpoint, bucket: bucketName, region, accessKeyId },
        status: 'verify_failed',
        message: 'OSS 连接成功但测试对象内容校验不一致，请检查端点是否为阿里云 OSS 真实地址。',
      });
    } catch (e: any) {
      const message = String(e?.message || e || '');
      const status = /(AccessDenied|InvalidAccessKeyId|SignatureDoesNotMatch|Forbidden)/i.test(message)
        ? 'auth_failed'
        : /(NoSuchBucket|BucketNotFound|404)/i.test(message)
          ? 'bucket_not_found'
          : /(Network|fetch failed|ENOTFOUND|ECONN)/i.test(message)
            ? 'network_error'
            : 'unknown_error';
      return NextResponse.json({
        success: true,
        config: { endpoint, bucket: bucketName, region, accessKeyId },
        status,
        message: `OSS 测试失败（${status}）：${message.slice(0, 300)}`,
      });
    }
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || '健康检查失败' }, { status: 500 });
  }
}
