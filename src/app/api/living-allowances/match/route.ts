import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { auditLog } from '@/lib/audit-log';
import { requireApiWritePermission } from '@/lib/api-auth';
import { getAccessibleProjectIds } from '@/lib/api-project-access';
import {
  buildLivingAllowanceReconciliation,
  hasPersistedLivingAllowanceMatch,
  queryReceiptItemWithCompatibility,
  queryReceiptItemsWithCompatibility,
  updateReceiptItemWithCompatibility,
} from '@/lib/living-allowance-reconciliation';
import {
  isFinalLivingAllowanceMatchStatus,
  normalizeYearMonth,
  parseMoney,
  yearMonthFromDate,
} from '@/lib/living-allowance';
import { getWorkerProjectRelations } from '@/lib/worker-project-access';

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
  const { data, error: itemsError } = await queryReceiptItemsWithCompatibility(
    (select) => client
      .from('living_allowance_receipt_items')
      .select(select)
      .eq('receipt_id', receiptId),
    'id, match_status, matched_record_id, matched_salary_id',
  );
  if (itemsError) {
    throw new Error(`刷新回单核对状态失败: ${itemsError.message}`);
  }

  const items = data || [];
  const nextStatus = items.length === 0
    ? 'pending'
    : items.every((item: any) => hasPersistedLivingAllowanceMatch({
      matchStatus: item.match_status,
      matchedRecordId: item.matched_record_id,
      matchedSalaryId: item.matched_salary_id,
    }))
      ? 'matched'
      : 'split';
  const { error: receiptError } = await client
    .from('living_allowance_receipts')
    .update({ split_status: nextStatus, updated_at: new Date().toISOString() })
    .eq('id', receiptId);
  if (receiptError) {
    throw new Error(`更新回单核对状态失败: ${receiptError.message}`);
  }
}

function buildScopeKey(workerId: number, projectId: number | null, yearMonth: string) {
  return `${workerId}:${projectId ?? ''}:${yearMonth}`;
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
    const hasProjectOverride = body.project_id !== null
      && body.project_id !== undefined
      && String(body.project_id).trim() !== '';
    if (hasProjectOverride && !overrideProjectId) {
      return NextResponse.json({ error: '项目ID无效' }, { status: 400 });
    }
    const hasWorkerOverride = body.worker_id !== null
      && body.worker_id !== undefined
      && String(body.worker_id).trim() !== '';
    if (hasWorkerOverride && !overrideWorkerId) {
      return NextResponse.json({ error: '工人ID无效' }, { status: 400 });
    }

    const client = getSupabaseClient();
    const { data: item, error: itemError } = await queryReceiptItemWithCompatibility(
      (select) => client
        .from('living_allowance_receipt_items')
        .select(select)
        .eq('id', itemId)
        .maybeSingle(),
      `
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
        matched_salary_id,
        match_status,
        match_score,
        living_allowance_receipts (
          id,
          project_id,
          receipt_date
        )
      `,
    );

    if (itemError) throw new Error(`查询拆分明细失败: ${itemError.message}`);
    if (!item) return NextResponse.json({ error: '拆分明细不存在' }, { status: 404 });
    if (hasPersistedLivingAllowanceMatch({
      matchStatus: (item as any).match_status,
      matchedRecordId: (item as any).matched_record_id,
      matchedSalaryId: (item as any).matched_salary_id,
    })) {
      return NextResponse.json({
        error: '该明细已经完成核对，不能重复覆盖',
        match_status: (item as any).match_status,
      }, { status: 409 });
    }
    const receipt = Array.isArray((item as any).living_allowance_receipts)
      ? (item as any).living_allowance_receipts[0]
      : (item as any).living_allowance_receipts;
    if (!receipt) return NextResponse.json({ error: '回单不存在' }, { status: 404 });
    const receiptProjectId = normalizeId(receipt?.project_id);
    const storedItemProjectId = normalizeId((item as any).project_id);
    const projectIds = [receiptProjectId, storedItemProjectId, overrideProjectId]
      .filter((projectId): projectId is number => projectId !== null);
    if (new Set(projectIds).size > 1) {
      return NextResponse.json({ error: '父回单、拆分明细与覆盖项目不一致' }, { status: 400 });
    }

    const accessibleProjectIds = await getAccessibleProjectIds(client, auth.user);
    if (accessibleProjectIds !== null) {
      if (!receiptProjectId) {
        return NextResponse.json({ error: '普通账号不能处理未指定项目的回单明细' }, { status: 403 });
      }
      if (projectIds.length === 0) {
        return NextResponse.json({ error: '普通账号不能处理未指定项目的回单明细' }, { status: 403 });
      }
      if (projectIds.some(projectId => !accessibleProjectIds.includes(projectId))) {
        return NextResponse.json({ error: '无权在该项目下核对生活费回单' }, { status: 403 });
      }
    }

    if (projectIds.length > 0) {
      const { data: projects, error: projectsError } = await client
        .from('projects')
        .select('id')
        .in('id', projectIds);
      if (projectsError) throw new Error(`查询项目信息失败: ${projectsError.message}`);
      const existingProjectIds = new Set((projects || []).map((project: any) => Number(project.id)));
      const missingProjectId = projectIds.find(projectId => !existingProjectIds.has(projectId));
      if (missingProjectId) {
        return NextResponse.json({ error: `项目${missingProjectId}不存在` }, { status: 404 });
      }
    }

    let projectId = overrideProjectId || storedItemProjectId || receiptProjectId || null;

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
      if (!worker) return NextResponse.json({ error: '工人不存在' }, { status: 404 });
      if (!projectId) {
        projectId = normalizeId(worker.project_id);
      }
      if (!projectId) {
        return NextResponse.json({ error: '工人未关联项目，无法核对工资' }, { status: 400 });
      }
      const workerRelations = await getWorkerProjectRelations(client, [Number(worker.id)]);
      if (!workerRelations.get(Number(worker.id))?.has(projectId)) {
        return NextResponse.json({ error: '工人与回单所属项目不匹配' }, { status: 400 });
      }
      if (accessibleProjectIds !== null && !accessibleProjectIds.includes(projectId)) {
        return NextResponse.json({ error: '无权在该项目下核对工资' }, { status: 403 });
      }
      matchScore = 100;
    } else {
      if (!projectId) {
        return NextResponse.json({ error: '请先指定回单项目或手动选择工人' }, { status: 400 });
      }
      const matchingProjectId = projectId;

      const { data: candidates, error } = await client
        .from('workers')
        .select('id, name, project_id, bank_card')
        .eq('name', (item as any).recipient_name)
        .limit(50);
      if (error) throw new Error(`匹配工人失败: ${error.message}`);

      const candidateRows = candidates || [];
      const candidateIds = candidateRows
        .map((candidate: any) => normalizeId(candidate.id))
        .filter((id): id is number => id !== null);
      const relations = await getWorkerProjectRelations(client, candidateIds);
      const projectCandidates = candidateRows.filter((candidate: any) => {
        const candidateId = normalizeId(candidate.id);
        return candidateId !== null && relations.get(candidateId)?.has(matchingProjectId);
      });

      const bankTail = normalizeTail((item as any).bank_card_tail);
      const tailMatched = bankTail
        ? projectCandidates.find((candidate: any) => maskTail(candidate.bank_card) === bankTail.slice(-4))
        : null;
      worker = tailMatched || (projectCandidates.length === 1 ? projectCandidates[0] : null);

      if (worker) {
        matchScore += 50;
        if (tailMatched) matchScore += 25;
        if (normalizeId(worker.project_id) === matchingProjectId) matchScore += 25;
      }
    }

    if (!worker) {
      const { error: updateError } = await updateReceiptItemWithCompatibility(client, itemId, {
          match_status: 'manual_required',
          matched_record_id: null,
          matched_salary_id: null,
          match_score: 0,
          updated_at: new Date().toISOString(),
        });
      if (updateError) throw new Error(`更新工人核对状态失败: ${updateError.message}`);
      await refreshReceiptStatus(client, Number((item as any).receipt_id));
      return NextResponse.json({
        error: '未能明确匹配工人，请在拆分明细中手动选择工人后再核对工资',
        match_status: 'manual_required',
      }, { status: 400 });
    }

    if (accessibleProjectIds !== null && (!projectId || !accessibleProjectIds.includes(projectId))) {
      return NextResponse.json({ error: '普通账号不能核对未指定项目的生活费回单' }, { status: 403 });
    }

    if (projectId) {
      const { data: finalProject, error: finalProjectError } = await client
        .from('projects')
        .select('id')
        .eq('id', projectId)
        .maybeSingle();
      if (finalProjectError) throw new Error(`查询项目信息失败: ${finalProjectError.message}`);
      if (!finalProject) {
        return NextResponse.json({ error: `项目${projectId}不存在` }, { status: 404 });
      }
    }

    const paymentDate = String((item as any).payment_date || receipt?.receipt_date || '').slice(0, 20);
    const yearMonth = normalizeYearMonth(body.year_month) || yearMonthFromDate(paymentDate);
    const amount = parseMoney((item as any).amount);

    if (!yearMonth || amount <= 0) {
      return NextResponse.json({ error: '拆分明细缺少所属月份或金额' }, { status: 400 });
    }

    const workerIdNumber = Number(worker.id);
    const scopeKey = buildScopeKey(workerIdNumber, projectId, yearMonth);
    const [salaryRes, allowanceRes, occupiedItemsRes] = await Promise.all([
      (() => {
        let query = client
          .from('worker_salaries')
          .select('id, worker_id, project_id, year_month, advance_pay, net_pay')
          .eq('worker_id', workerIdNumber)
          .eq('year_month', yearMonth);
        query = projectId === null ? query.is('project_id', null) : query.eq('project_id', projectId);
        return query.order('id', { ascending: true }).limit(2);
      })(),
      (() => {
        let query = client
          .from('living_allowance_records')
          .select('id, worker_id, project_id, year_month, amount, deducted_salary_id, status')
          .eq('worker_id', workerIdNumber)
          .eq('year_month', yearMonth);
        query = projectId === null ? query.is('project_id', null) : query.eq('project_id', projectId);
        return query.order('allowance_date', { ascending: true }).order('id', { ascending: true });
      })(),
      client
        .from('living_allowance_receipt_items')
        .select('matched_record_id')
        .neq('id', itemId)
        .not('matched_record_id', 'is', null),
    ]);

    if (salaryRes.error) throw new Error(`查询工资记录失败: ${salaryRes.error.message}`);
    if (allowanceRes.error) throw new Error(`查询已有生活费记录失败: ${allowanceRes.error.message}`);
    if (occupiedItemsRes.error) throw new Error(`查询生活费核对占用关系失败: ${occupiedItemsRes.error.message}`);

    const salaryRows = (salaryRes.data || []) as any[];
    const salaryDuplicate = salaryRows.length > 1;
    const allowanceRecords = (allowanceRes.data || []) as any[];
    const occupiedRecordIds = new Set(
      (occupiedItemsRes.data || [])
        .map((record: any) => normalizeId(record.matched_record_id))
        .filter((id): id is number => id !== null),
    );
    const reconciliation = buildLivingAllowanceReconciliation({
      workerId: workerIdNumber,
      projectId,
      itemId,
      itemAmount: amount,
      paymentDate,
      receiptDate: receipt?.receipt_date,
      existingRecordId: normalizeId((item as any).matched_record_id),
      existingSalaryId: normalizeId((item as any).matched_salary_id),
      persistedMatchStatus: (item as any).match_status,
      salaryRecords: salaryRows,
      allowanceRecords,
      occupiedRecordIds,
      yearMonth,
    });
    const {
      salary: reconciledSalary,
      allowanceRecord: linkedRecord,
      allowanceRecordAmount,
      allowanceMonthTotal,
      salaryAdvancePay,
      allowanceDifference,
      allowanceMonthDifference,
      salaryDifference,
      salaryCoverageDifference,
      matchStatus,
    } = reconciliation;
    const nextMatchScore = Math.min(matchScore || 80, 100);

    const { error: updateItemError } = await updateReceiptItemWithCompatibility(
      client,
      itemId,
      {
        worker_id: workerIdNumber,
        project_id: projectId,
        match_status: matchStatus,
        matched_record_id: linkedRecord?.id || null,
        matched_salary_id: reconciledSalary?.id || null,
        match_score: nextMatchScore,
        updated_at: new Date().toISOString(),
      },
    );

    if (updateItemError) throw new Error(`更新拆分明细匹配状态失败: ${updateItemError.message}`);
    await refreshReceiptStatus(client, Number((item as any).receipt_id));

    await auditLog({
      operationType: 'update',
      resourceType: 'living_allowance_receipt_item',
      resourceId: itemId,
      details: {
        action: 'salary_reconciliation',
        item_id: itemId,
        worker_id: workerIdNumber,
        project_id: projectId,
        year_month: yearMonth,
        receipt_amount: amount,
        allowance_record_amount: allowanceRecordAmount,
        allowance_month_total: allowanceMonthTotal,
        salary_advance_pay: salaryAdvancePay,
        allowance_difference: allowanceDifference,
        allowance_month_difference: allowanceMonthDifference,
        salary_difference: salaryDifference,
        salary_coverage_difference: salaryCoverageDifference,
        match_status: matchStatus,
        matched_record_id: linkedRecord?.id || null,
        matched_salary_id: reconciledSalary?.id || null,
        salary_duplicate: salaryDuplicate,
        salary_record_count: salaryRows.length,
      },
      request,
    });

    return NextResponse.json({
      matched: isFinalLivingAllowanceMatchStatus(matchStatus),
      match_score: nextMatchScore,
      match_status: matchStatus,
      record: linkedRecord,
      salary: reconciledSalary,
      reconciliation: {
        status: matchStatus,
        year_month: yearMonth,
        receipt_amount: amount,
        allowance_record_amount: allowanceRecordAmount,
        allowance_month_total: allowanceMonthTotal,
        salary_advance_pay: salaryAdvancePay,
        allowance_difference: allowanceDifference,
        allowance_month_difference: allowanceMonthDifference,
        salary_difference: salaryDifference,
        salary_coverage_difference: salaryCoverageDifference,
        allowance_record_count: allowanceRecords.length,
        salary_found: Boolean(reconciledSalary),
        salary_duplicate: salaryDuplicate,
        salary_record_count: salaryRows.length,
      },
      scope_key: scopeKey,
    });
  } catch (error: unknown) {
    console.error('[LivingAllowanceMatch] POST error:', error);
    return NextResponse.json({ error: getErrorMessage(error, '匹配失败') }, { status: 500 });
  }
}
