import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ success: false, error: '缺少 id' }, { status: 400 });

    const supabase = getSupabaseClient();
    const { data } = await supabase.from('project_contracts').select('storage_path, file_name').eq('id', parseInt(id)).single();
    if (!data) return NextResponse.json({ success: false, error: '未找到' }, { status: 404 });

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
