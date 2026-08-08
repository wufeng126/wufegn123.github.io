import { NextRequest, NextResponse } from 'next/server';
import { OSSStorage } from '@/lib/oss-storage';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAuth } from '@/lib/api-auth';
import { getAccessibleProjectIds } from '@/lib/api-project-access';

const OSS_PROJECT_CONTRACT_PREFIX = 'project-contracts/';

function createStorage() {
  return new OSSStorage();
}

function isOssProjectContractPath(path?: string | null) {
  return String(path || '').startsWith(OSS_PROJECT_CONTRACT_PREFIX);
}

export async function GET(request: NextRequest) {
  try {
    // 路由内鉴权：不依赖 middleware 单点防护（middleware 对无效 token 放行由前端处理，此处必须独立校验）
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ success: false, error: '缺少 id' }, { status: 400 });

    const supabase = getSupabaseClient();
    const { data } = await supabase.from('project_contracts').select('storage_path, file_name, project_id').eq('id', parseInt(id)).single();
    if (!data) return NextResponse.json({ success: false, error: '未找到' }, { status: 404 });

    // 项目归属校验：超管（null）放行；普通用户仅可下载其负责项目的合同文件
    const accessibleProjectIds = await getAccessibleProjectIds(supabase, auth.user);
    if (Array.isArray(accessibleProjectIds) && !accessibleProjectIds.includes(data.project_id)) {
      return NextResponse.json({ success: false, error: '无权下载该合同文件' }, { status: 403 });
    }

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
