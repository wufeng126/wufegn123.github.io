import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAuth } from '@/lib/api-auth';
import { getAccessibleProjectIds } from '@/lib/api-project-access';
import { readFile } from '@/lib/oss-storage';
import { verifyFileToken } from '@/lib/file-token';

/**
 * GET /api/vouchers/files/[fileId]/t/[token]
 * 令牌放在路径里（而不是查询串）：钉钉 webview / 代理转发时不会丢查询参数。
 * 用于钉钉内直接打开 PDF；令牌 10 分钟有效、仅对单个文件。
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string; token: string }> },
) {
  try {
    const { fileId, token } = await params;
    const id = Number(fileId);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: '参数不正确' }, { status: 400 });
    }

    const tokenOk = verifyFileToken(decodeURIComponent(token), id);
    const auth = await requireAuth(request);
    if (!auth.ok && !tokenOk) return auth.response;

    const client = getSupabaseClient();
    const { data: file } = await client
      .from('monthly_voucher_files')
      .select('id, voucher_id, file_key, file_name, content_type')
      .eq('id', id)
      .maybeSingle();
    if (!file) return NextResponse.json({ error: '文件不存在' }, { status: 404 });

    if (auth.ok) {
      const { data: voucher } = await client
        .from('monthly_vouchers')
        .select('project_id')
        .eq('id', Number(file.voucher_id))
        .maybeSingle();
      if (voucher) {
        const scope = await getAccessibleProjectIds(client, auth.user);
        if (scope !== null && !scope.includes(Number(voucher.project_id))) {
          return NextResponse.json({ error: '无权查看该凭证' }, { status: 403 });
        }
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
