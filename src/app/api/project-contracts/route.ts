import { NextRequest, NextResponse } from 'next/server';
import { S3Storage } from 'coze-coding-dev-sdk';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireApiWritePermission, requireAuth } from '@/lib/api-auth';

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

function sanitizeFileName(name: string) {
  const cleaned = name.replace(/[^\w.\-\u4e00-\u9fa5]+/g, '_').replace(/_+/g, '_');
  return cleaned || 'contract-file';
}

function isOssProjectContractPath(path?: string | null) {
  return String(path || '').startsWith(OSS_PROJECT_CONTRACT_PREFIX);
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    if (!projectId) return NextResponse.json({ success: false, error: '缺少 projectId' }, { status: 400 });
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.from('project_contracts').select('*').eq('project_id', parseInt(projectId)).order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true, data: data || [] });
  } catch (e: unknown) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : '查询失败' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const form = await request.formData();
    const file = form.get('file') as File;
    const projectId = form.get('projectId') as string;
    const remark = (form.get('remark') as string) || '';

    if (!file || !projectId) return NextResponse.json({ success: false, error: '缺少文件或项目ID' }, { status: 400 });

    const supabase = getSupabaseClient();
    const storage = createStorage();

    // Upload new project contract files to OSS. Older records keep their Supabase Storage paths.
    const buffer = Buffer.from(await file.arrayBuffer());
    const storagePath = await storage.uploadFile({
      fileContent: buffer,
      fileName: `${OSS_PROJECT_CONTRACT_PREFIX}${projectId}/${Date.now()}-${sanitizeFileName(file.name)}`,
      contentType: file.type || 'application/octet-stream',
    });

    // 存记录到数据库
    const { data, error } = await supabase.from('project_contracts').insert({
      project_id: parseInt(projectId),
      file_name: file.name,
      file_size: file.size,
      file_type: file.type,
      storage_path: storagePath,
      remark,
    }).select().single();
    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true, data });
  } catch (e: unknown) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : '上传失败' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ success: false, error: '缺少 id' }, { status: 400 });

    const supabase = getSupabaseClient();
    // 查记录拿 storage_path
    const { data: rec } = await supabase.from('project_contracts').select('storage_path').eq('id', parseInt(id)).single();
    if (rec?.storage_path) {
      if (isOssProjectContractPath(rec.storage_path)) {
        await createStorage().deleteFile({ fileKey: rec.storage_path });
      } else {
        await supabase.storage.from('contract_files').remove([rec.storage_path]);
      }
    }
    await supabase.from('project_contracts').delete().eq('id', parseInt(id));

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : '删除失败' }, { status: 500 });
  }
}
