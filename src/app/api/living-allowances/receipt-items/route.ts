import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { auditLog, insertWithSequenceFix } from '@/lib/audit-log';
import { requireApiWritePermission, requireAuth } from '@/lib/api-auth';
import { getAccessibleProjectIds } from '@/lib/api-project-access';
import { parseMoney } from '@/lib/living-allowance';
import { getWorkerProjectRelations } from '@/lib/worker-project-access';

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function normalizeId(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function sanitizeText(value: unknown, max = 100) {
  return String(value || '').trim().slice(0, max);
}

type ReceiptSplitRow = {
  receipt_id: number;
  worker_id: number | null;
  project_id: number | null;
  recipient_name: string;
  bank_card_tail: string | null;
  amount: number;
  payment_date: string | null;
  transaction_no: string | null;
  crop_box: unknown;
  match_status: 'unmatched';
  match_score: number;
  remark: string | null;
};

function pickNumberSet(rows: any[], key: string) {
  return Array.from(new Set(rows.map(row => normalizeId(row[key])).filter((id): id is number => id !== null)));
}

async function canAccessProject(client: ReturnType<typeof getSupabaseClient>, user: any, projectId?: number | null) {
  const accessibleProjectIds = await getAccessibleProjectIds(client, user);
  if (accessibleProjectIds === null) return true;
  if (!projectId) return false;
  return accessibleProjectIds.includes(projectId);
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const client = getSupabaseClient();
    const receiptId = normalizeId(request.nextUrl.searchParams.get('receipt_id'));
    if (!receiptId) return NextResponse.json({ error: '缺少回单ID' }, { status: 400 });

    const { data: receipt, error: receiptError } = await client
      .from('living_allowance_receipts')
      .select('id, project_id')
      .eq('id', receiptId)
      .maybeSingle();

    if (receiptError) throw new Error(`查询回单失败: ${receiptError.message}`);
    if (!receipt) return NextResponse.json({ error: '回单不存在' }, { status: 404 });
    if (!(await canAccessProject(client, auth.user, (receipt as any).project_id))) {
      return NextResponse.json({ error: '无权查看该回单' }, { status: 403 });
    }

    const { data, error } = await client
      .from('living_allowance_receipt_items')
      .select(`
        id,
        receipt_id,
        worker_id,
        project_id,
        recipient_name,
        bank_card_tail,
        amount,
        payment_date,
        transaction_no,
        crop_box,
        match_status,
        matched_record_id,
        match_score,
        remark,
        created_at,
        updated_at
      `)
      .eq('receipt_id', receiptId)
      .order('id', { ascending: true });

    if (error) throw new Error(`查询回单拆分明细失败: ${error.message}`);

    const rows = data || [];
    const accessibleProjectIds = await getAccessibleProjectIds(client, auth.user);
    const receiptProjectId = normalizeId((receipt as any).project_id);
    const hasProjectConflict = rows.some((item: any) => {
      const itemProjectId = normalizeId(item.project_id);
      return receiptProjectId !== null && itemProjectId !== null && itemProjectId !== receiptProjectId;
    });
    if (hasProjectConflict) {
      return NextResponse.json({ error: '回单拆分明细与父回单所属项目不一致' }, { status: 400 });
    }
    if (
      accessibleProjectIds !== null
      && rows.some((item: any) => {
        const itemProjectId = normalizeId(item.project_id);
        return itemProjectId !== null && !accessibleProjectIds.includes(itemProjectId);
      })
    ) {
      return NextResponse.json({ error: '回单拆分明细中包含无权访问的项目' }, { status: 403 });
    }

    const workerIds = pickNumberSet(rows, 'worker_id');
    const projectIds = pickNumberSet(rows, 'project_id');
    const [workersRes, projectsRes] = await Promise.all([
      workerIds.length > 0
        ? client.from('workers').select('id, name, work_type, bank_card').in('id', workerIds)
        : Promise.resolve({ data: [], error: null }),
      projectIds.length > 0
        ? client.from('projects').select('id, name').in('id', projectIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (workersRes.error) throw new Error(`查询工人信息失败: ${workersRes.error.message}`);
    if (projectsRes.error) throw new Error(`查询项目信息失败: ${projectsRes.error.message}`);

    const workerMap = new Map((workersRes.data || []).map((row: any) => [row.id, row]));
    const projectMap = new Map((projectsRes.data || []).map((row: any) => [row.id, row]));

    const items = rows.map((item: any) => ({
      ...item,
      amount: parseMoney(item.amount),
      worker_name: item.worker_id ? workerMap.get(item.worker_id)?.name || '未知工人' : '',
      worker_work_type: item.worker_id ? workerMap.get(item.worker_id)?.work_type || '' : '',
      project_name: item.project_id ? projectMap.get(item.project_id)?.name || '未知项目' : '',
    }));

    return NextResponse.json({ items });
  } catch (error: unknown) {
    console.error('[LivingAllowanceReceiptItems] GET error:', error);
    return NextResponse.json({ error: getErrorMessage(error, '查询失败') }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const receiptId = normalizeId(body.receipt_id);
    const items = Array.isArray(body.items) ? body.items : [];
    if (!receiptId) return NextResponse.json({ error: '缺少回单ID' }, { status: 400 });
    if (items.length === 0) return NextResponse.json({ error: '请至少填写一条回单拆分明细' }, { status: 400 });
    if (items.length > 100) return NextResponse.json({ error: '单张回单一次最多拆分100条明细' }, { status: 400 });

    const client = getSupabaseClient();
    const { data: receipt, error: receiptError } = await client
      .from('living_allowance_receipts')
      .select('id, project_id')
      .eq('id', receiptId)
      .maybeSingle();

    if (receiptError) throw new Error(`查询回单失败: ${receiptError.message}`);
    if (!receipt) return NextResponse.json({ error: '回单不存在' }, { status: 404 });
    if (!(await canAccessProject(client, auth.user, (receipt as any).project_id))) {
      return NextResponse.json({ error: '无权拆分该回单' }, { status: 403 });
    }
    const receiptProjectId = normalizeId((receipt as any).project_id);
    const accessibleProjectIds = await getAccessibleProjectIds(client, auth.user);

    const { data: existingItems, error: existingError } = await client
      .from('living_allowance_receipt_items')
      .select('id, matched_record_id')
      .eq('receipt_id', receiptId);

    if (existingError) throw new Error(`查询已有拆分明细失败: ${existingError.message}`);
    if ((existingItems || []).some((item: any) => item.matched_record_id)) {
      return NextResponse.json({ error: '该回单已有明细生成生活费台账，不能覆盖拆分明细' }, { status: 400 });
    }

    const rows: ReceiptSplitRow[] = items.map((item: any, index: number) => {
      const amount = parseMoney(item.amount);
      const recipientName = sanitizeText(item.recipient_name || item.worker_name);
      if (!recipientName || amount <= 0) {
        throw new Error(`第${index + 1}条明细请填写收款人和金额`);
      }

      const hasProjectId = item.project_id !== null
        && item.project_id !== undefined
        && String(item.project_id).trim() !== '';
      const explicitProjectId = normalizeId(item.project_id);
      if (hasProjectId && !explicitProjectId) {
        throw new Error(`第${index + 1}条明细的项目ID无效`);
      }
      if (explicitProjectId && receiptProjectId && explicitProjectId !== receiptProjectId) {
        throw new Error(`第${index + 1}条明细与父回单所属项目不一致`);
      }
      const projectId = explicitProjectId || receiptProjectId;
      return {
        receipt_id: receiptId,
        worker_id: normalizeId(item.worker_id),
        project_id: projectId,
        recipient_name: recipientName,
        bank_card_tail: sanitizeText(item.bank_card_tail, 12) || null,
        amount,
        payment_date: sanitizeText(item.payment_date, 20) || null,
        transaction_no: sanitizeText(item.transaction_no, 100) || null,
        crop_box: item.crop_box || null,
        match_status: 'unmatched',
        match_score: 0,
        remark: sanitizeText(item.remark, 300) || null,
      };
    });

    const rowProjectIds = Array.from(new Set(
      rows
        .map(row => row.project_id)
        .filter((id): id is number => id !== null),
    ));
    if (accessibleProjectIds !== null && rowProjectIds.some(projectId => !accessibleProjectIds.includes(projectId))) {
      return NextResponse.json({ error: '拆分明细中包含无权访问的项目' }, { status: 403 });
    }

    if (rowProjectIds.length > 0) {
      const { data: projects, error: projectsError } = await client
        .from('projects')
        .select('id')
        .in('id', rowProjectIds);
      if (projectsError) throw new Error(`查询项目失败: ${projectsError.message}`);
      const existingProjectIds = new Set((projects || []).map((project: any) => Number(project.id)));
      const missingProjectId = rowProjectIds.find(projectId => !existingProjectIds.has(projectId));
      if (missingProjectId) {
        return NextResponse.json({ error: `项目${missingProjectId}不存在` }, { status: 404 });
      }
    }

    const workerIds = Array.from(new Set(
      rows
        .map(row => row.worker_id)
        .filter((id): id is number => id !== null),
    ));
    const workerMap = new Map<number, any>();
    if (workerIds.length > 0) {
      const { data: workers, error: workersError } = await client
        .from('workers')
        .select('id, project_id')
        .in('id', workerIds);
      if (workersError) throw new Error(`查询工人信息失败: ${workersError.message}`);
      for (const worker of workers || []) workerMap.set(Number((worker as any).id), worker);
      const missingWorkerId = workerIds.find(workerId => !workerMap.has(workerId));
      if (missingWorkerId) {
        return NextResponse.json({ error: `工人${missingWorkerId}不存在` }, { status: 404 });
      }
    }

    const workerRelations = await getWorkerProjectRelations(client, workerIds);
    for (const row of rows) {
      if (!row.worker_id || !row.project_id) continue;
      if (!workerRelations.get(row.worker_id)?.has(row.project_id)) {
        return NextResponse.json({
          error: `工人${row.worker_id}与第${rows.indexOf(row) + 1}条明细所属项目不匹配`,
        }, { status: 400 });
      }
    }

    if ((existingItems || []).length > 0) {
      const { error: deleteError } = await client
        .from('living_allowance_receipt_items')
        .delete()
        .eq('receipt_id', receiptId);
      if (deleteError) throw new Error(`覆盖拆分明细失败: ${deleteError.message}`);
    }

    const result = await insertWithSequenceFix('living_allowance_receipt_items', rows, client);
    if (result.error) throw new Error(`保存拆分明细失败: ${result.error.message}`);

    const { error: receiptUpdateError } = await client
      .from('living_allowance_receipts')
      .update({ split_status: 'split', updated_at: new Date().toISOString() })
      .eq('id', receiptId);
    if (receiptUpdateError) throw new Error(`更新回单状态失败: ${receiptUpdateError.message}`);

    await auditLog({
      operationType: 'create',
      resourceType: 'living_allowance_receipt_item',
      resourceId: receiptId,
      details: { receipt_id: receiptId, count: rows.length },
      request,
    });

    return NextResponse.json({ items: result.data || [] });
  } catch (error: unknown) {
    console.error('[LivingAllowanceReceiptItems] POST error:', error);
    return NextResponse.json({ error: getErrorMessage(error, '保存失败') }, { status: 500 });
  }
}
