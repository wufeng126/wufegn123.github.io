import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { auditLog, insertWithSequenceFix } from '@/lib/audit-log';
import { requireApiWritePermission } from '@/lib/api-auth';
import { getAccessibleProjectIds } from '@/lib/api-project-access';
import { normalizeYearMonth, parseMoney, yearMonthFromDate } from '@/lib/living-allowance';

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function normalizeId(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeTail(value: unknown) {
  return String(value || '').replace(/\D/g, '').slice(-12);
}

function maskTail(value: unknown) {
  const tail = normalizeTail(value);
  return tail ? tail.slice(-4) : '';
}

async function refreshReceiptStatus(client: ReturnType<typeof getSupabaseClient>, receiptId: number) {
  const { data } = await client
    .from('living_allowance_receipt_items')
    .select('id, match_status')
    .eq('receipt_id', receiptId);

  const items = data || [];
  const nextStatus = items.length > 0 && items.every((item: any) => item.match_status === 'matched') ? 'matched' : 'split';
  await client
    .from('living_allowance_receipts')
    .update({ split_status: nextStatus, updated_at: new Date().toISOString() })
    .eq('id', receiptId);
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const itemId = normalizeId(body.item_id);
    const overrideWorkerId = normalizeId(body.worker_id);
    const overrideProjectId = normalizeId(body.project_id);
    if (!itemId) return NextResponse.json({ error: '缺少回单拆分明细ID' }, { status: 400 });

    const client = getSupabaseClient();
    const { data: item, error: itemError } = await client
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
        matched_record_id,
        living_allowance_receipts (
          id,
          project_id,
          receipt_date
        )
      `)
      .eq('id', itemId)
      .maybeSingle();

    if (itemError) throw new Error(`查询拆分明细失败: ${itemError.message}`);
    if (!item) return NextResponse.json({ error: '拆分明细不存在' }, { status: 404 });

    const receipt = Array.isArray((item as any).living_allowance_receipts)
      ? (item as any).living_allowance_receipts[0]
      : (item as any).living_allowance_receipts;
    const receiptProjectId = normalizeId(receipt?.project_id);
    const itemProjectId = overrideProjectId || normalizeId((item as any).project_id) || receiptProjectId;

    const accessibleProjectIds = await getAccessibleProjectIds(client, auth.user);
    if (accessibleProjectIds !== null && itemProjectId && !accessibleProjectIds.includes(itemProjectId)) {
      return NextResponse.json({ error: '无权在该项目下生成生活费台账' }, { status: 403 });
    }

    if ((item as any).matched_record_id) {
      const { data: existingRecord } = await client
        .from('living_allowance_records')
        .select('*')
        .eq('id', (item as any).matched_record_id)
        .maybeSingle();
      if (existingRecord) return NextResponse.json({ record: existingRecord, matched: true, reused: true });
    }

    const { data: duplicateRecord, error: duplicateError } = await client
      .from('living_allowance_records')
      .select('*')
      .eq('receipt_item_id', itemId)
      .maybeSingle();

    if (duplicateError) throw new Error(`检查重复生活费台账失败: ${duplicateError.message}`);
    if (duplicateRecord) {
      await client
        .from('living_allowance_receipt_items')
        .update({
          match_status: 'matched',
          matched_record_id: (duplicateRecord as any).id,
          match_score: 100,
          updated_at: new Date().toISOString(),
        })
        .eq('id', itemId);
      await refreshReceiptStatus(client, Number((item as any).receipt_id));
      return NextResponse.json({ record: duplicateRecord, matched: true, reused: true });
    }

    let worker: any = null;
    let matchScore = 0;
    const workerId = overrideWorkerId || normalizeId((item as any).worker_id);

    if (workerId) {
      const { data, error } = await client
        .from('workers')
        .select('id, name, project_id, bank_card')
        .eq('id', workerId)
        .maybeSingle();
      if (error) throw new Error(`查询工人失败: ${error.message}`);
      worker = data;
      matchScore = 100;
    } else {
      let query = client
        .from('workers')
        .select('id, name, project_id, bank_card')
        .eq('name', (item as any).recipient_name);

      if (itemProjectId) query = query.eq('project_id', itemProjectId);
      const { data, error } = await query.limit(5);
      if (error) throw new Error(`匹配工人失败: ${error.message}`);

      const candidates = data || [];
      const bankTail = normalizeTail((item as any).bank_card_tail);
      const tailMatched = bankTail
        ? candidates.find((candidate: any) => maskTail(candidate.bank_card) === bankTail.slice(-4))
        : null;
      worker = tailMatched || (candidates.length === 1 ? candidates[0] : null);

      if (worker) {
        matchScore += 50;
        if (itemProjectId && Number(worker.project_id) === Number(itemProjectId)) matchScore += 25;
        if (tailMatched) matchScore += 25;
      }
    }

    if (!worker) {
      await client
        .from('living_allowance_receipt_items')
        .update({ match_status: 'manual_required', match_score: 0, updated_at: new Date().toISOString() })
        .eq('id', itemId);
      return NextResponse.json({ error: '未能明确匹配工人，请在拆分明细中手动选择工人后再生成台账' }, { status: 400 });
    }

    const projectId = itemProjectId || normalizeId(worker.project_id);
    const allowanceDate = String((item as any).payment_date || receipt?.receipt_date || '').slice(0, 20);
    const yearMonth = normalizeYearMonth(body.year_month) || yearMonthFromDate(allowanceDate);
    const amount = parseMoney((item as any).amount);

    if (!projectId || !allowanceDate || !yearMonth || amount <= 0) {
      return NextResponse.json({ error: '拆分明细缺少项目、付款日期、所属月份或金额' }, { status: 400 });
    }

    const result = await insertWithSequenceFix('living_allowance_records', {
      worker_id: Number(worker.id),
      project_id: projectId,
      year_month: yearMonth,
      allowance_date: allowanceDate,
      amount,
      payment_method: '银行转账',
      status: 'pending_deduction',
      receipt_item_id: itemId,
      remark: (item as any).transaction_no ? `回单流水号：${(item as any).transaction_no}` : null,
    }, client);

    if (result.error) throw new Error(`生成生活费台账失败: ${result.error.message}`);
    const record = Array.isArray(result.data) ? result.data[0] : result.data;

    const { error: updateItemError } = await client
      .from('living_allowance_receipt_items')
      .update({
        worker_id: Number(worker.id),
        project_id: projectId,
        match_status: 'matched',
        matched_record_id: record?.id,
        match_score: Math.min(matchScore || 80, 100),
        updated_at: new Date().toISOString(),
      })
      .eq('id', itemId);

    if (updateItemError) throw new Error(`更新拆分明细匹配状态失败: ${updateItemError.message}`);
    await refreshReceiptStatus(client, Number((item as any).receipt_id));

    await auditLog({
      operationType: 'create',
      resourceType: 'living_allowance',
      resourceId: record?.id,
      details: { item_id: itemId, worker_id: Number(worker.id), project_id: projectId, amount, year_month: yearMonth },
      request,
    });

    return NextResponse.json({ record, matched: true, match_score: Math.min(matchScore || 80, 100) });
  } catch (error: unknown) {
    console.error('[LivingAllowanceMatch] POST error:', error);
    return NextResponse.json({ error: getErrorMessage(error, '匹配失败') }, { status: 500 });
  }
}
