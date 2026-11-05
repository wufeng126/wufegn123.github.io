import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAuth } from '@/lib/api-auth';
import { getAccessibleProjectIds } from '@/lib/api-project-access';
import { readFile } from '@/lib/oss-storage';

/**
 * GET /api/labor-analysis/attachments/[id]
 * 返回用工分析附件字节（图片/PDF 内联）。
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const attachmentId = Number(id);
    if (!Number.isInteger(attachmentId) || attachmentId <= 0) {
      return NextResponse.json({ error: '参数不正确' }, { status: 400 });
    }

    const client = getSupabaseClient();
    const { data: file } = await client
      .from('monthly_labor_attachments')
      .select('id, analysis_id, file_key, file_name, content_type')
      .eq('id', attachmentId)
      .maybeSingle();
    if (!file) return NextResponse.json({ error: '附件不存在' }, { status: 404 });

    const { data: analysis } = await client
      .from('monthly_labor_analyses')
      .select('project_id')
      .eq('id', Number(file.analysis_id))
      .maybeSingle();

    const scope = await getAccessibleProjectIds(client, auth.user);
    if (scope !== null && analysis && !scope.includes(Number(analysis.project_id))) {
      return NextResponse.json({ error: '无权查看该附件' }, { status: 403 });
    }

    const buffer = await readFile({ fileKey: String(file.file_key) });
    const contentType = String(file.content_type || '').includes('pdf')
      ? 'application/pdf'
      : String(file.content_type || 'image/jpeg');

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="${encodeURIComponent(String(file.file_name || 'attachment'))}"`,
        'Cache-Control': 'private, max-age=300',
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '读取附件失败' },
      { status: 500 },
    );
  }
}
