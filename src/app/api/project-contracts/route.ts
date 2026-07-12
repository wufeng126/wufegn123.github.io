import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET(request: NextRequest) {
  try {
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
    const form = await request.formData();
    const file = form.get('file') as File;
    const projectId = form.get('projectId') as string;
    const remark = (form.get('remark') as string) || '';

    if (!file || !projectId) return NextResponse.json({ success: false, error: '缺少文件或项目ID' }, { status: 400 });

    const supabase = getSupabaseClient();
    const ext = file.name.split('.').pop() || 'pdf';
    const storagePath = `projects/${projectId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

    // 上传到 Supabase Storage
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await supabase.storage.from('contract_files').upload(storagePath, buffer, {
      contentType: file.type,
      upsert: false,
    });
    if (uploadError) throw new Error(uploadError.message);

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
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ success: false, error: '缺少 id' }, { status: 400 });

    const supabase = getSupabaseClient();
    // 查记录拿 storage_path
    const { data: rec } = await supabase.from('project_contracts').select('storage_path').eq('id', parseInt(id)).single();
    if (rec?.storage_path) await supabase.storage.from('contract_files').remove([rec.storage_path]);
    await supabase.from('project_contracts').delete().eq('id', parseInt(id));

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : '删除失败' }, { status: 500 });
  }
}
