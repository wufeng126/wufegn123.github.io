import { NextRequest, NextResponse } from 'next/server';
import { S3Storage } from 'coze-coding-dev-sdk';
import { getSupabaseClient } from '@/storage/database/supabase-client';

const OSS_PROJECT_CONTRACT_PREFIX = 'project-contracts/';

function createStorage() {
  return new S3Storage({
    endpointUrl: process.env.OSS_ENDPOINT,
    accessKey: process.env.OSS_ACCESS_KEY_ID || '',
    secretKey: process.env.OSS_ACCESS_KEY_SECRET || '',
    bucketName: process.env.OSS_BUCKET_NAME,
    region: process.env.OSS_REGION || 'cn-beijing',
  });
}

function isOssProjectContractPath(path?: string | null) {
  return String(path || '').startsWith(OSS_PROJECT_CONTRACT_PREFIX);
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ success: false, error: '缺少 id' }, { status: 400 });

    const supabase = getSupabaseClient();
    const { data } = await supabase.from('project_contracts').select('storage_path, file_name').eq('id', parseInt(id)).single();
    if (!data) return NextResponse.json({ success: false, error: '未找到' }, { status: 404 });

    if (isOssProjectContractPath(data.storage_path)) {
      const url = await createStorage().generatePresignedUrl({
        key: data.storage_path,
        expireTime: 3600,
      });
      return NextResponse.redirect(url);
    }

    const { data: blob } = await supabase.storage.from('contract_files').download(data.storage_path);
    if (!blob) return NextResponse.json({ success: false, error: '文件不可用' }, { status: 404 });

    return new Response(blob, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(data.file_name)}"`,
      },
    });
  } catch (e: unknown) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : '下载失败' }, { status: 500 });
  }
}
