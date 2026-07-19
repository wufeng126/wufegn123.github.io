import { NextRequest, NextResponse } from 'next/server';
import { S3Storage } from 'coze-coding-dev-sdk';
import { getSupabaseClient } from '@/storage/database/supabase-client';

const storage = new S3Storage({
  endpointUrl: process.env.OSS_ENDPOINT || process.env.COZE_BUCKET_ENDPOINT_URL,
  accessKey: process.env.OSS_ACCESS_KEY_ID || '',
  secretKey: process.env.OSS_ACCESS_KEY_SECRET || '',
  bucketName: process.env.OSS_BUCKET_NAME || process.env.COZE_BUCKET_NAME,
  region: process.env.OSS_REGION || 'cn-beijing',
});

// 上传证件附件
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const certificateId = formData.get('certificateId') as string | null;

    if (!file) {
      return NextResponse.json({ error: '请选择要上传的文件' }, { status: 400 });
    }

    // 限制文件大小（最大 20MB）
    const MAX_SIZE = 20 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: '文件大小不能超过20MB' }, { status: 400 });
    }

    // 上传到对象存储
    const buffer = Buffer.from(await file.arrayBuffer());
    const fileKey = await storage.uploadFile({
      fileContent: buffer,
      fileName: `certificates/${certificateId || 'new'}/${file.name}`,
      contentType: file.type || 'application/octet-stream',
    });

    // 构建附件记录
    const attachment = {
      key: fileKey,
      name: file.name,
      size: file.size,
      type: file.type,
      uploadedAt: new Date().toISOString(),
    };

    // 如果有关联的证件ID，更新证件的 attachments 字段
    if (certificateId) {
      const client = getSupabaseClient();
      const { data: cert, error: fetchError } = await client
        .from('certificates')
        .select('attachments')
        .eq('id', parseInt(certificateId))
        .single();

      if (fetchError) {
        throw new Error(`查询证件失败: ${fetchError.message}`);
      }

      const existingAttachments: any[] = Array.isArray(cert.attachments) ? cert.attachments : [];
      const updatedAttachments = [...existingAttachments, attachment];

      const { error: updateError } = await client
        .from('certificates')
        .update({ attachments: updatedAttachments })
        .eq('id', parseInt(certificateId));

      if (updateError) {
        throw new Error(`更新附件失败: ${updateError.message}`);
      }
    }

    return NextResponse.json({
      success: true,
      attachment,
    });
  } catch (error: any) {
    console.error('[Certificate Upload] Error:', error);
    return NextResponse.json(
      { error: error.message || '上传失败' },
      { status: 500 }
    );
  }
}
