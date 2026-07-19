#!/usr/bin/env node
/**
 * 存储迁移脚本：从旧存储迁移到阿里云 OSS
 * 
 * 使用方法：
 * 1. 配置环境变量（见下方）
 * 2. 运行：node scripts/migrate-to-aliyun-oss.js
 * 
 * 环境变量：
 * - OLD_STORAGE_ENDPOINT: 旧存储 Endpoint
 * - OLD_STORAGE_BUCKET: 旧存储 Bucket
 * - OLD_STORAGE_ACCESS_KEY: 旧存储 AccessKey
 * - OLD_STORAGE_SECRET_KEY: 旧存储 SecretKey
 * - OSS_ENDPOINT: 阿里云 OSS Endpoint
 * - OSS_ACCESS_KEY_ID: 阿里云 AccessKey ID
 * - OSS_ACCESS_KEY_SECRET: 阿里云 AccessKey Secret
 * - OSS_BUCKET_NAME: 阿里云 Bucket 名称
 * - OSS_REGION: 阿里云 OSS 区域（如 cn-beijing）
 * - DRY_RUN: 是否仅模拟运行（true/false，默认 false）
 */

const { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand, CopyObjectCommand } = require('@aws-sdk/client-s3');
const { createClient } = require('@supabase/supabase-js');

// 配置
const OLD_STORAGE = {
  endpoint: process.env.OLD_STORAGE_ENDPOINT,
  bucket: process.env.OLD_STORAGE_BUCKET,
  accessKeyId: process.env.OLD_STORAGE_ACCESS_KEY,
  secretAccessKey: process.env.OLD_STORAGE_SECRET_KEY,
  region: process.env.OLD_STORAGE_REGION || 'cn-beijing',
};

const ALIYUN_OSS = {
  endpoint: process.env.OSS_ENDPOINT,
  bucket: process.env.OSS_BUCKET_NAME,
  accessKeyId: process.env.OSS_ACCESS_KEY_ID,
  secretAccessKey: process.env.OSS_ACCESS_KEY_SECRET,
  region: process.env.OSS_REGION || 'cn-beijing',
};

const SUPABASE_URL = process.env.COZE_SUPABASE_URL;
const SUPABASE_KEY = process.env.COZE_SUPABASE_SERVICE_ROLE_KEY || process.env.COZE_SUPABASE_ANON_KEY;
const DRY_RUN = process.env.DRY_RUN === 'true';

// 初始化客户端
const oldS3 = new S3Client({
  endpoint: OLD_STORAGE.endpoint,
  region: OLD_STORAGE.region,
  credentials: {
    accessKeyId: OLD_STORAGE.accessKeyId,
    secretAccessKey: OLD_STORAGE.secretAccessKey,
  },
  forcePathStyle: true,
});

const aliyunS3 = new S3Client({
  endpoint: ALIYUN_OSS.endpoint,
  region: ALIYUN_OSS.region,
  credentials: {
    accessKeyId: ALIYUN_OSS.accessKeyId,
    secretAccessKey: ALIYUN_OSS.secretAccessKey,
  },
});

const supabase = SUPABASE_URL && SUPABASE_KEY 
  ? createClient(SUPABASE_URL, SUPABASE_KEY)
  : null;

// 统计
const stats = {
  total: 0,
  migrated: 0,
  skipped: 0,
  failed: 0,
  errors: [],
};

/**
 * 列出旧存储中的所有文件
 */
async function listAllFiles() {
  console.log(' 正在列出旧存储中的文件...');
  const files = [];
  let continuationToken = undefined;

  do {
    const command = new ListObjectsV2Command({
      Bucket: OLD_STORAGE.bucket,
      ContinuationToken: continuationToken,
    });

    const response = await oldS3.send(command);
    
    if (response.Contents) {
      for (const obj of response.Contents) {
        if (obj.Key && !obj.Key.endsWith('/')) {
          files.push({
            key: obj.Key,
            size: obj.Size,
            lastModified: obj.LastModified,
          });
        }
      }
    }

    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  console.log(`✅ 找到 ${files.length} 个文件`);
  return files;
}

/**
 * 迁移单个文件
 */
async function migrateFile(file) {
  stats.total++;
  
  try {
    if (DRY_RUN) {
      console.log(`[DRY RUN] 将迁移：${file.key} (${formatSize(file.size)})`);
      stats.migrated++;
      return;
    }

    // 从旧存储下载
    const getCommand = new GetObjectCommand({
      Bucket: OLD_STORAGE.bucket,
      Key: file.key,
    });

    const response = await oldS3.send(getCommand);
    const body = await response.Body.transformToByteArray();

    // 上传到阿里云 OSS
    const putCommand = new PutObjectCommand({
      Bucket: ALIYUN_OSS.bucket,
      Key: file.key,
      Body: body,
      ContentType: response.ContentType || 'application/octet-stream',
    });

    await aliyunS3.send(putCommand);

    stats.migrated++;
    console.log(`✅ 已迁移：${file.key} (${formatSize(file.size)})`);
  } catch (error) {
    stats.failed++;
    stats.errors.push({ file: file.key, error: error.message });
    console.error(`❌ 迁移失败：${file.key} - ${error.message}`);
  }
}

/**
 * 更新数据库中的文件 URL
 */
async function updateDatabaseUrls() {
  if (!supabase) {
    console.log('️  未配置 Supabase，跳过数据库更新');
    return;
  }

  console.log('🔄 正在更新数据库中的文件 URL...');

  // 查询所有包含附件的记录
  const { data: certificates, error } = await supabase
    .from('certificates')
    .select('id, attachments')
    .not('attachments', 'is', null);

  if (error) {
    console.error('❌ 查询证件失败:', error.message);
    return;
  }

  let updated = 0;
  for (const cert of certificates) {
    if (Array.isArray(cert.attachments)) {
      let changed = false;
      const newAttachments = cert.attachments.map(att => {
        if (att.key && !att.key.startsWith('https://')) {
          changed = true;
          return {
            ...att,
            url: `https://${ALIYUN_OSS.bucket}.${ALIYUN_OSS.endpoint.replace('https://', '')}/${att.key}`,
          };
        }
        return att;
      });

      if (changed) {
        const { error: updateError } = await supabase
          .from('certificates')
          .update({ attachments: newAttachments })
          .eq('id', cert.id);

        if (updateError) {
          console.error(`❌ 更新证件 ${cert.id} 失败:`, updateError.message);
        } else {
          updated++;
        }
      }
    }
  }

  console.log(`✅ 更新了 ${updated} 条证件记录`);
}

/**
 * 格式化文件大小
 */
function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * 主函数
 */
async function main() {
  console.log('🚀 开始迁移到阿里云 OSS');
  console.log('='.repeat(50));
  console.log(`旧存储：${OLD_STORAGE.bucket} @ ${OLD_STORAGE.endpoint}`);
  console.log(`新存储：${ALIYUN_OSS.bucket} @ ${ALIYUN_OSS.endpoint}`);
  console.log(`模拟运行：${DRY_RUN ? '是' : '否'}`);
  console.log('='.repeat(50));

  // 列出文件
  const files = await listAllFiles();
  
  if (files.length === 0) {
    console.log('ℹ️  没有找到需要迁移的文件');
    return;
  }

  // 迁移文件
  console.log('\n📦 开始迁移文件...');
  for (const file of files) {
    await migrateFile(file);
  }

  // 更新数据库
  console.log('\n 更新数据库...');
  await updateDatabaseUrls();

  // 输出统计
  console.log('\n' + '='.repeat(50));
  console.log('📊 迁移统计：');
  console.log(`  总文件数：${stats.total}`);
  console.log(`  成功迁移：${stats.migrated}`);
  console.log(`  跳过：${stats.skipped}`);
  console.log(`  失败：${stats.failed}`);
  
  if (stats.errors.length > 0) {
    console.log('\n❌ 失败文件列表：');
    stats.errors.forEach(e => {
      console.log(`  - ${e.file}: ${e.error}`);
    });
  }
  
  console.log('='.repeat(50));
  console.log('✅ 迁移完成！');
}

// 执行
main().catch(error => {
  console.error('❌ 迁移失败:', error);
  process.exit(1);
});
