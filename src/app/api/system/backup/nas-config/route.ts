import { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/api-auth';
import { apiServerError, apiSuccess, getErrorMessage } from '@/lib/api-utils';

/**
 * GET /api/system/backup/nas-config
 * 返回 NAS 拉取备份所需的非敏感配置（不含密钥），并生成 rclone 配置模板。
 * 用于「数据备份」页引导：由 NAS 主动拉取云端文件到本地盘。
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermission(request, 'system:manage');
    if (!auth.ok) return auth.response;

    const endpoint = (process.env.OSS_ENDPOINT || '').trim();
    const bucket = (process.env.OSS_BUCKET_NAME || process.env.OSS_BUCKET || '').trim();
    const region = (process.env.OSS_REGION || 'cn-beijing').trim();
    const provider = process.env.STORAGE_PROVIDER || (endpoint && bucket ? 'oss' : 'supabase');

    const rcloneConfig = `# 在 NAS 上保存为 ~/.config/rclone/rclone.conf（或 DSM 的 rclone 配置）
[laboss]
type = s3
provider = Alibaba
access_key_id = YOUR_ACCESS_KEY_ID
secret_access_key = YOUR_ACCESS_KEY_SECRET
endpoint = ${endpoint || 'https://oss-cn-beijing.aliyuncs.com'}
region = ${region}
acl = private`;

    const syncCommand = bucket
      ? `rclone sync laboss:${bucket} /volume1/labor-backup --transfers 4 --checkers 8 --log-file /volume1/labor-backup/rclone.log --log-level INFO`
      : 'rclone sync laboss:YOUR_BUCKET /volume1/labor-backup';

    return apiSuccess({
      provider,
      configured: Boolean(endpoint && bucket),
      endpoint,
      bucket,
      region,
      rcloneConfig,
      syncCommand,
      notes: [
        '由 NAS 主动拉取（pull），云端不需要开放任何端口或公网地址。',
        'NAS 需能访问 OSS 公网域名（大多数家宽可直接访问）。',
        '建议在 NAS 上用「任务计划」每天凌晨执行一次。',
        '建议单独创建只读 RAM 子账号（仅 oss:GetObject/ListObjects）给 NAS 使用。',
      ],
    });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '获取 NAS 配置失败'));
  }
}
