import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAuth } from '@/lib/api-auth';
import { getAccessibleProjectIds } from '@/lib/api-project-access';
import { OSSStorage } from '@/lib/oss-storage';
import {
  buildLivingAllowanceReconciliation,
  queryReceiptItemsWithCompatibility,
} from '@/lib/living-allowance-reconciliation';
import {
  isFinalLivingAllowanceMatchStatus,
  normalizeYearMonth,
  parseMoney,
  yearMonthFromDate,
} from '@/lib/living-allowance';

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
    const projectIdParam = searchParams.get('project_id');
    const hasProjectFilter = Boolean(projectIdParam && projectIdParam !== 'all');
    const projectId = hasProjectFilter ? normalizeId(projectIdParam) : null;
    const splitStatus = searchParams.get('split_status');
    const limit = Math.min(Math.max(Number(searchParams.get('limit') || 30), 1), 100);

    if (hasProjectFilter && !projectId) {
      return NextResponse.json({ error: '项目ID无效' }, { status: 400 });
    }

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
      .order('id', { ascending: false });

    if (projectId) query = query.eq('project_id', projectId);
    const accessibleProjectIds = await getAccessibleProjectIds(client, auth.user);
    if (accessibleProjectIds !== null) {
      if (accessibleProjectIds.length === 0) {
        return NextResponse.json({ receipts: [] });
      }
      if (projectId && !accessibleProjectIds.includes(projectId)) {
        return NextResponse.json({ error: '无权查看该项目下的生活费回单' }, { status: 403 });
      }
      // 普通账号只允许查看已授权项目的回单，不能通过未指定项目的回单扩大查询范围。
      query = query.in('project_id', accessibleProjectIds);
    }
    // 未按计算后的核对状态筛选时，先限制父回单数量，避免为了展示最近列表扫描全部历史明细。
    if (!splitStatus || splitStatus === 'all') {
      query = query.limit(limit);
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
        ? queryReceiptItemsWithCompatibility(
          (select) => client
            .from('living_allowance_receipt_items')
            .select(select)
            .in('receipt_id', receiptIds),
          'id, receipt_id, worker_id, project_id, amount, payment_date, match_status, matched_record_id, matched_salary_id',
        )
        : Promise.resolve({ data: [], error: null, supportsMatchedSalaryId: true }),
      client
        .from('living_allowance_receipt_items')
        .select('id, matched_record_id')
        .not('matched_record_id', 'is', null),
    ]);

    if (projectsRes.error) throw new Error(`查询项目信息失败: ${projectsRes.error.message}`);
    if (itemsRes.error) throw new Error(`查询回单拆分明细失败: ${itemsRes.error.message}`);

    const items = itemsRes.data || [];
    const receiptMap = new Map(rows.map((row: any) => [Number(row.id), row]));
    const workerIds = pickNumberSet(items, 'worker_id');
    const salaryIds = pickNumberSet(items, 'matched_salary_id');
    const allowanceRecordIds = pickNumberSet(items, 'matched_record_id');
    const yearMonths = Array.from(new Set(
      items
        .map((item: any) => {
          const receipt = receiptMap.get(Number(item.receipt_id));
          return normalizeYearMonth(item.payment_date) || yearMonthFromDate(receipt?.receipt_date);
        })
        .filter(Boolean),
    ));

    const [
      currentSalariesByWorkerRes,
      currentSalariesByIdRes,
      currentAllowancesByWorkerRes,
      currentAllowancesByIdRes,
    ] = await Promise.all([
      workerIds.length > 0
        ? (() => {
          let query = client
            .from('worker_salaries')
            .select('id, worker_id, project_id, year_month, advance_pay, net_pay')
            .in('worker_id', workerIds);
          if (yearMonths.length > 0) query = query.in('year_month', yearMonths);
          return query;
        })()
        : Promise.resolve({ data: [], error: null }),
      salaryIds.length > 0
        ? client
          .from('worker_salaries')
          .select('id, worker_id, project_id, year_month, advance_pay, net_pay')
          .in('id', salaryIds)
        : Promise.resolve({ data: [], error: null }),
      workerIds.length > 0
        ? (() => {
          let query = client
            .from('living_allowance_records')
            .select('id, receipt_item_id, worker_id, project_id, year_month, amount, status, deducted_salary_id')
            .in('worker_id', workerIds);
          if (yearMonths.length > 0) query = query.in('year_month', yearMonths);
          return query;
        })()
        : Promise.resolve({ data: [], error: null }),
      allowanceRecordIds.length > 0
        ? client
          .from('living_allowance_records')
          .select('id, receipt_item_id, worker_id, project_id, year_month, amount, status, deducted_salary_id')
          .in('id', allowanceRecordIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (currentSalariesByWorkerRes.error) {
      throw new Error(`查询工资核对信息失败: ${currentSalariesByWorkerRes.error.message}`);
    }
    if (currentSalariesByIdRes.error) {
      throw new Error(`查询关联工资信息失败: ${currentSalariesByIdRes.error.message}`);
    }
    if (currentAllowancesByWorkerRes.error) {
      throw new Error(`查询生活费台账信息失败: ${currentAllowancesByWorkerRes.error.message}`);
    }
    if (currentAllowancesByIdRes.error) {
      throw new Error(`查询关联生活费信息失败: ${currentAllowancesByIdRes.error.message}`);
    }
    const projectMap = new Map<number, any>(
      (projectsRes.data || []).map((row: any) => [Number(row.id), row]),
    );
    const salaryMap = new Map<number, any>();
    for (const salary of [
      ...(currentSalariesByWorkerRes.data || []),
      ...(currentSalariesByIdRes.data || []),
    ]) {
      salaryMap.set(Number((salary as any).id), salary);
    }
    const allowanceMap = new Map<number, any>();
    for (const record of [
      ...(currentAllowancesByWorkerRes.data || []),
      ...(currentAllowancesByIdRes.data || []),
    ]) {
      allowanceMap.set(Number((record as any).id), record);
    }
    const relevantAllowanceIds = Array.from(allowanceMap.keys());
    const occupiedItemsRes = relevantAllowanceIds.length > 0
      ? await client
        .from('living_allowance_receipt_items')
        .select('id, matched_record_id')
        .in('matched_record_id', relevantAllowanceIds)
      : { data: [], error: null };
    if (occupiedItemsRes.error) {
      throw new Error(`查询生活费核对占用关系失败: ${occupiedItemsRes.error.message}`);
    }

    const occupiedRecordOwners = new Map<number, Set<number>>();
    for (const row of occupiedItemsRes.data || []) {
      const recordId = normalizeId((row as any).matched_record_id);
      const itemId = normalizeId((row as any).id);
      if (recordId === null || itemId === null) continue;
      const owners = occupiedRecordOwners.get(recordId) || new Set<number>();
      owners.add(itemId);
      occupiedRecordOwners.set(recordId, owners);
    }

    const itemSummaryMap = new Map<number, {
      itemCount: number;
      reconciledCount: number;
      amountMatchedCount: number;
      amountMismatchCount: number;
      salaryNotFoundCount: number;
      salaryDuplicateCount: number;
      recordNotFoundCount: number;
      pendingCount: number;
      amount: number;
    }>();

    for (const item of items) {
      const receiptId = Number((item as any).receipt_id);
      const receipt = receiptMap.get(receiptId);
      const receiptProjectId = normalizeId(receipt?.project_id);
      const itemProjectId = normalizeId((item as any).project_id);
      // 明细未保存项目时继承父回单项目；只有两个项目都明确且不一致时才排除异常数据。
      if (receiptProjectId !== null && itemProjectId !== null && receiptProjectId !== itemProjectId) continue;

      const workerId = normalizeId((item as any).worker_id);
      const projectId = itemProjectId ?? receiptProjectId;
      const yearMonth = normalizeYearMonth((item as any).payment_date)
        || yearMonthFromDate(receipt?.receipt_date);
      const occupiedByOtherItems = new Set<number>();
      for (const [recordId, owners] of occupiedRecordOwners.entries()) {
        if (!owners.has(Number((item as any).id))) occupiedByOtherItems.add(recordId);
      }
      const reconciliation = buildLivingAllowanceReconciliation({
        workerId,
        projectId,
        itemId: Number((item as any).id),
        itemAmount: (item as any).amount,
        paymentDate: (item as any).payment_date,
        receiptDate: receipt?.receipt_date,
        existingRecordId: normalizeId((item as any).matched_record_id),
        existingSalaryId: normalizeId((item as any).matched_salary_id),
        persistedMatchStatus: (item as any).match_status,
        salaryRecords: Array.from(salaryMap.values()),
        allowanceRecords: Array.from(allowanceMap.values()),
        occupiedRecordIds: occupiedByOtherItems,
        yearMonth,
      });
      const matchStatus = reconciliation.matchStatus;

      const summary = itemSummaryMap.get(receiptId) || {
        itemCount: 0,
        reconciledCount: 0,
        amountMatchedCount: 0,
        amountMismatchCount: 0,
        salaryNotFoundCount: 0,
        salaryDuplicateCount: 0,
        recordNotFoundCount: 0,
        pendingCount: 0,
        amount: 0,
      };
      summary.itemCount += 1;
      summary.amount += parseMoney((item as any).amount);
      if (isFinalLivingAllowanceMatchStatus(matchStatus)) {
        summary.reconciledCount += 1;
      } else {
        summary.pendingCount += 1;
      }
      if (matchStatus === 'amount_matched') summary.amountMatchedCount += 1;
      if (matchStatus === 'amount_mismatch') summary.amountMismatchCount += 1;
      if (matchStatus === 'salary_not_found') summary.salaryNotFoundCount += 1;
      if (matchStatus === 'salary_duplicate') summary.salaryDuplicateCount += 1;
      if (matchStatus === 'record_not_found' || matchStatus === 'allowance_record_not_found') {
        summary.recordNotFoundCount += 1;
      }
      itemSummaryMap.set(receiptId, summary);
    }

    const receipts = await Promise.all(rows.map(async (receipt: any) => {
      const summary = itemSummaryMap.get(receipt.id) || {
        itemCount: 0,
        reconciledCount: 0,
        amountMatchedCount: 0,
        amountMismatchCount: 0,
        salaryNotFoundCount: 0,
        salaryDuplicateCount: 0,
        recordNotFoundCount: 0,
        pendingCount: 0,
        amount: 0,
      };
      const effectiveSplitStatus = summary.itemCount === 0
        ? 'pending'
        : summary.pendingCount === 0
          ? 'matched'
          : 'split';
      let url: string | null = null;
      try {
        url = await storage.generatePresignedUrl({ key: receipt.file_key, expireTime: 3600 });
      } catch (error) {
        console.warn('[LivingAllowanceReceipts] generate url failed:', error);
      }

      return {
        ...receipt,
        split_status: effectiveSplitStatus,
        project_name: receipt.project_id ? projectMap.get(receipt.project_id)?.name || '未知项目' : '未指定项目',
        url,
        item_count: summary.itemCount,
        // 保留 matched_count 兼容现有页面，但语义调整为“已产生核对结果的数量”。
        matched_count: summary.reconciledCount,
        reconciled_count: summary.reconciledCount,
        amount_matched_count: summary.amountMatchedCount,
        amount_mismatch_count: summary.amountMismatchCount,
        salary_not_found_count: summary.salaryNotFoundCount,
        salary_duplicate_count: summary.salaryDuplicateCount,
        record_not_found_count: summary.recordNotFoundCount,
        pending_count: summary.pendingCount,
        split_amount: Math.round(summary.amount * 100) / 100,
      };
    }));

    const filteredReceipts = splitStatus && splitStatus !== 'all'
      ? receipts.filter((receipt: any) => receipt.split_status === splitStatus)
      : receipts;

    return NextResponse.json({ receipts: filteredReceipts.slice(0, limit) });
  } catch (error: unknown) {
    console.error('[LivingAllowanceReceipts] GET error:', error);
    return NextResponse.json({ error: getErrorMessage(error, '查询失败') }, { status: 500 });
  }
}
