import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAuth } from '@/lib/api-auth';
import { getAccessibleProjectIds } from '@/lib/api-project-access';
import { OSSStorage } from '@/lib/oss-storage';
import { parseMoney } from '@/lib/living-allowance';

const storage = new OSSStorage();

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function normalizeId(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function pickNumberSet(rows: any[], key: string) {
  return Array.from(new Set(rows.map(row => normalizeId(row[key])).filter((id): id is number => id !== null)));
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const client = getSupabaseClient();
    const searchParams = request.nextUrl.searchParams;
    const projectId = searchParams.get('project_id');
    const splitStatus = searchParams.get('split_status');
    const limit = Math.min(Math.max(Number(searchParams.get('limit') || 30), 1), 100);

    let query = client
      .from('living_allowance_receipts')
      .select(`
        id,
        project_id,
        receipt_date,
        file_key,
        file_name,
        file_size,
        file_type,
        payer_account,
        split_status,
        remark,
        created_at,
        updated_at
      `)
      .order('receipt_date', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit);

    if (projectId && projectId !== 'all') query = query.eq('project_id', Number(projectId));
    if (splitStatus && splitStatus !== 'all') query = query.eq('split_status', splitStatus);

    const accessibleProjectIds = await getAccessibleProjectIds(client, auth.user);
    if (accessibleProjectIds !== null) {
      if (accessibleProjectIds.length === 0) {
        return NextResponse.json({ receipts: [] });
      }
      query = query.or(`project_id.is.null,project_id.in.(${accessibleProjectIds.join(',')})`);
    }

    const { data, error } = await query;
    if (error) throw new Error(`查询生活费回单失败: ${error.message}`);

    const rows = data || [];
    const projectIds = pickNumberSet(rows, 'project_id');
    const receiptIds = pickNumberSet(rows, 'id');

    const [projectsRes, itemsRes] = await Promise.all([
      projectIds.length > 0
        ? client.from('projects').select('id, name').in('id', projectIds)
        : Promise.resolve({ data: [], error: null }),
      receiptIds.length > 0
        ? client.from('living_allowance_receipt_items').select('id, receipt_id, amount, match_status').in('receipt_id', receiptIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (projectsRes.error) throw new Error(`查询项目信息失败: ${projectsRes.error.message}`);
    if (itemsRes.error) throw new Error(`查询回单拆分明细失败: ${itemsRes.error.message}`);

    const projectMap = new Map((projectsRes.data || []).map((row: any) => [row.id, row]));
    const itemSummaryMap = new Map<number, { itemCount: number; matchedCount: number; amount: number }>();

    for (const item of itemsRes.data || []) {
      const receiptId = Number((item as any).receipt_id);
      const summary = itemSummaryMap.get(receiptId) || { itemCount: 0, matchedCount: 0, amount: 0 };
      summary.itemCount += 1;
      summary.amount += parseMoney((item as any).amount);
      if ((item as any).match_status === 'matched') summary.matchedCount += 1;
      itemSummaryMap.set(receiptId, summary);
    }

    const receipts = await Promise.all(rows.map(async (receipt: any) => {
      const summary = itemSummaryMap.get(receipt.id) || { itemCount: 0, matchedCount: 0, amount: 0 };
      let url: string | null = null;
      try {
        url = await storage.generatePresignedUrl({ key: receipt.file_key, expireTime: 3600 });
      } catch (error) {
        console.warn('[LivingAllowanceReceipts] generate url failed:', error);
      }

      return {
        ...receipt,
        project_name: receipt.project_id ? projectMap.get(receipt.project_id)?.name || '未知项目' : '未指定项目',
        url,
        item_count: summary.itemCount,
        matched_count: summary.matchedCount,
        split_amount: Math.round(summary.amount * 100) / 100,
      };
    }));

    return NextResponse.json({ receipts });
  } catch (error: unknown) {
    console.error('[LivingAllowanceReceipts] GET error:', error);
    return NextResponse.json({ error: getErrorMessage(error, '查询失败') }, { status: 500 });
  }
}
