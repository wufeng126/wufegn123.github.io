import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/api-auth';
import { BACKUP_ROOT, BACKUP_TABLES, readBackupFile } from '@/lib/data-backup';

/**
 * GET /api/system/backups/download?date=YYYY-MM-DD&table=xxx
 * - table=manifest 时下载整次备份的清单
 * - 指定 table 时下载该表备份（解密后返回）
 */
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'system:manage');
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const date = String(searchParams.get('date') || '');
  const table = String(searchParams.get('table') || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: '日期不合法' }, { status: 400 });
  }

  // 表名白名单：防止通过 ../ 读取任意对象
  if (table !== 'manifest' && !BACKUP_TABLES.includes(table)) {
    return NextResponse.json({ error: '表名不合法' }, { status: 400 });
  }

  try {
    if (table === 'manifest') {
      const buffer = await readBackupFile(`${BACKUP_ROOT}/${date}/manifest.json`);
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="backup-manifest-${date}.json"`,
        },
      });
    }

    let buffer: Buffer;
    try {
      buffer = await readBackupFile(`${BACKUP_ROOT}/${date}/${table}.jsonl.gz.enc`);
    } catch {
      buffer = await readBackupFile(`${BACKUP_ROOT}/${date}/${table}.jsonl.gz`);
    }
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/gzip',
        'Content-Disposition': `attachment; filename="${date}-${table}.jsonl.gz"`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '下载失败' },
      { status: 500 },
    );
  }
}
