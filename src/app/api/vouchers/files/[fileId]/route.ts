import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAuth } from '@/lib/api-auth';
import { getAccessibleProjectIds } from '@/lib/api-project-access';
import { readFile } from '@/lib/oss-storage';
import { verifyFileToken } from '@/lib/file-token';

/**
 * GET /api/vouchers/files/[fileId]
 * 以同源方式返回凭证原件（图片/PDF 内联展示），避免签名 URL 的跨域与 CSP 限制。
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
  try {
    const { fileId } = await params;
    const id = Number(fileId);
    const urlToken = new URL(request.url).searchParams.get('t') || '';
    const tokenOk = urlToken ? verifyFileToken(urlToken, id) : false;

    // 钉钉 webview 打开 PDF 时可能既无 Cookie 也无 Authorization，用短时文件令牌兜底
    const auth = await requireAuth(request);
    if (!auth.ok && !tokenOk) return auth.response;
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: '参数不正确' }, { status: 400 });
    }

    const client = getSupabaseClient();
    const { data: file } = await client
      .from('monthly_voucher_files')
      .select('id, voucher_id, file_key, file_name, content_type')
      .eq('id', id)
      .maybeSingle();
    if (!file) return NextResponse.json({ error: '文件不存在' }, { status: 404 });

    const { data: voucher } = await client
      .from('monthly_vouchers')
      .select('project_id')
      .eq('id', Number(file.voucher_id))
      .maybeSingle();
    if (!voucher) return NextResponse.json({ error: '凭证不存在' }, { status: 404 });

    if (auth.ok) {
      const scope = await getAccessibleProjectIds(client, auth.user);
      if (scope !== null && !scope.includes(Number(voucher.project_id))) {
        return NextResponse.json({ error: '无权查看该凭证' }, { status: 403 });
      }
    }

    const buffer = await readFile({ fileKey: String(file.file_key) });
    const contentType = String(file.content_type || '').includes('pdf')
      ? 'application/pdf'
      : String(file.content_type || 'image/jpeg');

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="${encodeURIComponent(String(file.file_name || 'voucher'))}"`,
        'Cache-Control': 'private, max-age=300',
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '读取文件失败' },
      { status: 500 },
    );
  }
}
