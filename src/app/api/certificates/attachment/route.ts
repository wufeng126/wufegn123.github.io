import { NextRequest, NextResponse } from 'next/server';
import { S3Storage } from 'coze-coding-dev-sdk';
import { getSupabaseClient } from '@/storage/database/supabase-client';

const storage = new S3Storage({
  endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
  accessKey: '',
  secretKey: '',
  bucketName: process.env.COZE_BUCKET_NAME,
  region: 'cn-beijing',
});

// 删除证件附件
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { certificateId, attachmentKey } = body;

    if (!certificateId || !attachmentKey) {
      return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
    }

    // 从对象存储删除文件
    await storage.deleteFile({ fileKey: attachmentKey });

    // 从证件记录中移除附件
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
    const updatedAttachments = existingAttachments.filter((a: any) => a.key !== attachmentKey);

    const { error: updateError } = await client
      .from('certificates')
      .update({ attachments: updatedAttachments })
      .eq('id', parseInt(certificateId));

    if (updateError) {
      throw new Error(`更新附件列表失败: ${updateError.message}`);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[Certificate Attachment Delete] Error:', error);
    return NextResponse.json(
      { error: error.message || '删除附件失败' },
      { status: 500 }
    );
  }
}
