#!/usr/bin/env node
/**
 * 从 Supabase Storage 迁移到阿里云 OSS
 * 
 * 使用方法：
 * 1. 在 Coze 平台配置环境变量（已配置）
 * 2. 运行：node scripts/migrate-supabase-to-aliyun-oss.js
 * 
 * 环境变量：
 * - COZE_SUPABASE_URL: Supabase URL
 * - COZE_SUPABASE_SERVICE_ROLE_KEY: Supabase Service Role Key
 * - OSS_ENDPOINT: 阿里云 OSS Endpoint
 * - OSS_ACCESS_KEY_ID: 阿里云 AccessKey ID
 * - OSS_ACCESS_KEY_SECRET: 阿里云 AccessKey Secret
 * - OSS_BUCKET_NAME: 阿里云 Bucket 名称
 * - OSS_REGION: 阿里云 OSS 区域
 * - DRY_RUN: 是否仅模拟运行（true/false，默认 false）
 */

const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { createClient } = require('@supabase/supabase-js');
const https = require('https');
const http = require('http');

// 配置
const SUPABASE_URL = process.env.COZE_SUPABASE_URL;
const SUPABASE_KEY = process.env.COZE_SUPABASE_SERVICE_ROLE_KEY || process.env.COZE_SUPABASE_ANON_KEY;

const ALIYUN_OSS = {
  endpoint: process.env.OSS_ENDPOINT,
  bucket: process.env.OSS_BUCKET_NAME,
  accessKeyId: process.env.OSS_ACCESS_KEY_ID,
  secretAccessKey: process.env.OSS_ACCESS_KEY_SECRET,
  region: process.env.OSS_REGION || 'cn-beijing',
};

const DRY_RUN = process.env.DRY_RUN === 'true';

console.log('🚀 开始从 Supabase Storage 迁移到阿里云 OSS');
console.log('='.repeat(60));
console.log('Supabase:', SUPABASE_URL || '未配置');
console.log('阿里云 OSS:', ALIYUN_OSS.bucket, '@', ALIYUN_OSS.endpoint);
console.log('模拟运行:', DRY_RUN ? '是' : '否');
console.log('='.repeat(60));

// 验证配置
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error(' 错误：缺少 Supabase 配置');
  console.error('请配置 COZE_SUPABASE_URL 和 COZE_SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

if (!ALIYUN_OSS.accessKeyId || !ALIYUN_OSS.secretAccessKey || !ALIYUN_OSS.bucket) {
  console.error('❌ 错误：缺少阿里云 OSS 配置');
  console.error('请配置 OSS_ACCESS_KEY_ID, OSS_ACCESS_KEY_SECRET, OSS_BUCKET_NAME');
  process.exit(1);
}

// 初始化客户端
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const ossClient = new S3Client({
  endpoint: ALIYUN_OSS.endpoint,
  region: ALIYUN_OSS.region,
  credentials: {
    accessKeyId: ALIYUN_OSS.accessKeyId,
    secretAccessKey: ALIYUN_OSS.secretAccessKey,
  },
  forcePathStyle: true,
});

// 下载文件
function downloadFile(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        downloadFile(response.headers.location).then(resolve).catch(reject);
        return;
      }
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks)));
      response.on('error', reject);
    }).on('error', reject);
  });
}

// 上传到阿里云 OSS
async function uploadToOSS(buffer, key, contentType) {
  const command = new PutObjectCommand({
    Bucket: ALIYUN_OSS.bucket,
    Key: key,
    Body: buffer,
    ContentType: contentType || 'application/octet-stream',
  });
  await ossClient.send(command);
}

// 主函数
async function main() {
  try {
    // 查询需要迁移的文件
    console.log('\n📋 正在查询需要迁移的文件...');
    
    // 查询证件附件
    const { data: certificates, error: certError } = await supabase
      .from('certificates')
      .select('id, attachments')
      .not('attachments', 'is', null);
    
    if (certError) {
      console.error('查询证件失败:', certError.message);
    } else {
      console.log(`找到 ${certificates.length} 条证件记录`);
    }
    
    // 查询施工日志照片
    const { data: logs, error: logError } = await supabase
      .from('construction_logs')
      .select('id, photos')
      .not('photos', 'is', null);
    
    if (logError) {
      console.error('查询施工日志失败:', logError.message);
    } else {
      console.log(`找到 ${logs.length} 条施工日志记录`);
    }
    
    // 收集所有需要迁移的文件
    const filesToMigrate = [];
    
    // 处理证件附件
    if (certificates) {
      for (const cert of certificates) {
        if (cert.attachments && Array.isArray(cert.attachments)) {
          for (const attachment of cert.attachments) {
            if (attachment.key || attachment.url) {
              filesToMigrate.push({
                type: 'certificate',
                recordId: cert.id,
                sourceUrl: attachment.url,
                sourceKey: attachment.key,
                fileName: attachment.name || 'unknown',
              });
            }
          }
        }
      }
    }
    
    // 处理施工日志照片
    if (logs) {
      for (const log of logs) {
        if (log.photos && Array.isArray(log.photos)) {
          for (const photo of log.photos) {
            if (typeof photo === 'string') {
              filesToMigrate.push({
                type: 'construction_log',
                recordId: log.id,
                sourceUrl: photo,
                sourceKey: null,
                fileName: photo.split('/').pop() || 'photo.jpg',
              });
            } else if (photo.url || photo.key) {
              filesToMigrate.push({
                type: 'construction_log',
                recordId: log.id,
                sourceUrl: photo.url,
                sourceKey: photo.key,
                fileName: photo.name || photo.url?.split('/').pop() || 'photo.jpg',
              });
            }
          }
        }
      }
    }
    
    console.log(`\n📦 共需要迁移 ${filesToMigrate.length} 个文件`);
    
    if (filesToMigrate.length === 0) {
      console.log('✅ 没有需要迁移的文件');
      process.exit(0);
    }
    
    // 执行迁移
    let successCount = 0;
    let failCount = 0;
    
    for (let i = 0; i < filesToMigrate.length; i++) {
      const file = filesToMigrate[i];
      const ossKey = `${file.type}s/${file.recordId}/${file.fileName}`;
      
      console.log(`\n[${i + 1}/${filesToMigrate.length}] 迁移：${file.fileName}`);
      console.log(`  类型：${file.type}`);
      console.log(`  来源：${file.sourceUrl || file.sourceKey}`);
      console.log(`  目标：${ossKey}`);
      
      if (DRY_RUN) {
        console.log('  ⏭️  跳过（模拟运行）');
        successCount++;
        continue;
      }
      
      try {
        // 下载文件
        let buffer;
        if (file.sourceUrl) {
          console.log('  ⬇️  从 URL 下载文件...');
          buffer = await downloadFile(file.sourceUrl);
        } else if (file.sourceKey) {
          console.log('  ⬇️  从 Supabase Storage 下载文件...');
          // 从 key 推断 bucket 和路径
          const parts = file.sourceKey.split('/');
          const bucket = parts[0]; // certificates
          const key = parts.slice(1).join('/'); // 4/Fa_Ren_AZheng_635f4cfb.jpg
          
          const { data, error } = await supabase.storage.from(bucket).download(key);
          if (error) {
            console.error('  ❌ 下载失败:', error.message);
            failCount++;
            continue;
          }
          buffer = Buffer.from(await data.arrayBuffer());
        } else {
          console.log('  ⚠️  跳过（无下载链接）');
          failCount++;
          continue;
        }
        
        // 上传到 OSS
        console.log('  ️  上传到阿里云 OSS...');
        const contentType = file.fileName.endsWith('.jpg') || file.fileName.endsWith('.jpeg') 
          ? 'image/jpeg' 
          : file.fileName.endsWith('.png') 
          ? 'image/png'
          : file.fileName.endsWith('.pdf')
          ? 'application/pdf'
          : 'application/octet-stream';
        
        await uploadToOSS(buffer, ossKey, contentType);
        
        console.log('  ✅ 迁移成功');
        successCount++;
      } catch (error) {
        console.error('  ❌ 迁移失败:', error.message);
        failCount++;
      }
    }
    
    // 输出统计
    console.log('\n' + '='.repeat(60));
    console.log('📊 迁移统计');
    console.log('='.repeat(60));
    console.log(`总文件数：${filesToMigrate.length}`);
    console.log(`成功：${successCount}`);
    console.log(`失败：${failCount}`);
    
    if (DRY_RUN) {
      console.log('\n⚠️  这是模拟运行，没有实际迁移文件');
      console.log('确认无误后，执行：DRY_RUN=false node scripts/migrate-supabase-to-aliyun-oss.js');
    } else {
      console.log('\n✅ 迁移完成！');
      console.log('请验证文件是否可以正常访问');
    }
    
  } catch (error) {
    console.error('\n❌ 迁移失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
