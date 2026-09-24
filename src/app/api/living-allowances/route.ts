import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { auditLog, insertWithSequenceFix } from '@/lib/audit-log';
import { requireApiWritePermission, requireAuth } from '@/lib/api-auth';
import { getAccessibleProjectIds } from '@/lib/api-project-access';
import { normalizeYearMonth, parseMoney, yearMonthFromDate } from '@/lib/living-allowance';
import { getWorkerProjectRelations } from '@/lib/worker-project-access';

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

type ScopeValidationFailure = {
  error: string;
  status: 400 | 403 | 404;
};

async function validateWorkerAndProject(
  client: ReturnType<typeof getSupabaseClient>,
  workerId: number,
  projectId: number | null,
  accessibleProjectIds: number[] | null,
): Promise<{ worker: any; projectId: number | null; failure?: ScopeValidationFailure }> {
  const { data: worker, error: workerError } = await client
    .from('workers')
    .select('id, project_id')
    .eq('id', workerId)
    .maybeSingle();

  if (workerError) throw new Error(`查询工人信息失败: ${workerError.message}`);
  if (!worker) {
    return { worker: null, projectId, failure: { error: '工人不存在', status: 404 } };
  }

  const relations = await getWorkerProjectRelations(client, [workerId]);
  const workerProjectIds = relations.get(workerId) || new Set<number>();
  let effectiveProjectId = projectId;

  // 手工录入未指定项目时，优先使用工人当前归属项目；历史调岗且无法唯一推断时保留空值。
  if (!effectiveProjectId) {
    const currentProjectId = normalizeId((worker as any).project_id);
    if (currentProjectId) {
      effectiveProjectId = currentProjectId;
    } else if (workerProjectIds.size === 1) {
      effectiveProjectId = Array.from(workerProjectIds)[0];
    }
  }

  if (!effectiveProjectId && accessibleProjectIds !== null) {
    return {
      worker,
      projectId: null,
      failure: { error: '普通账号新增生活费必须选择可访问的项目', status: 400 },
    };
  }

  if (effectiveProjectId) {
    if (accessibleProjectIds !== null && !accessibleProjectIds.includes(effectiveProjectId)) {
      return {
        worker,
        projectId: effectiveProjectId,
        failure: { error: '无权在该项目下操作生活费记录', status: 403 },
      };
    }

    const { data: project, error: projectError } = await client
      .from('projects')
      .select('id')
      .eq('id', effectiveProjectId)
      .maybeSingle();

    if (projectError) throw new Error(`查询项目信息失败: ${projectError.message}`);
    if (!project) {
      return {
        worker,
        projectId: effectiveProjectId,
        failure: { error: '项目不存在', status: 404 },
      };
    }

    if (!workerProjectIds.has(effectiveProjectId)) {
      return {
        worker,
        projectId: effectiveProjectId,
        failure: { error: '该工人与所选项目不匹配，无法操作生活费记录', status: 400 },
      };
    }
  }

  return { worker, projectId: effectiveProjectId };
}

async function validateReceiptItem(
  client: ReturnType<typeof getSupabaseClient>,
  receiptItemId: number | null,
  workerId: number,
  projectId: number | null,
  accessibleProjectIds: number[] | null,
) {
  if (!receiptItemId) return { projectId };

  const { data: item, error } = await client
    .from('living_allowance_receipt_items')
    .select(`
      id,
      worker_id,
      project_id,
      matched_record_id,
      living_allowance_receipts (
        id,
        project_id
      )
    `)
    .eq('id', receiptItemId)
    .maybeSingle();

  if (error) throw new Error(`查询回单拆分明细失败: ${error.message}`);
  if (!item) return { projectId, failure: { error: '回单拆分明细不存在', status: 404 as const } };

  const receipt = Array.isArray((item as any).living_allowance_receipts)
    ? (item as any).living_allowance_receipts[0]
    : (item as any).living_allowance_receipts;
  const receiptProjectId = normalizeId(receipt?.project_id);
  const itemProjectId = normalizeId((item as any).project_id);
  const projectIds = [projectId, itemProjectId, receiptProjectId].filter((id): id is number => id !== null);

  if (new Set(projectIds).size > 1) {
    return { projectId, failure: { error: '生活费记录与回单所属项目不一致', status: 400 as const } };
  }

  const effectiveProjectId = projectId || itemProjectId || receiptProjectId || null;
  if (!effectiveProjectId && accessibleProjectIds !== null) {
    return { projectId: null, failure: { error: '普通账号不能关联未指定项目的回单', status: 403 as const } };
  }
  if (effectiveProjectId && accessibleProjectIds !== null && !accessibleProjectIds.includes(effectiveProjectId)) {
    return { projectId: effectiveProjectId, failure: { error: '无权关联该项目下的回单', status: 403 as const } };
  }
  if ((item as any).worker_id && Number((item as any).worker_id) !== workerId) {
    return { projectId: effectiveProjectId, failure: { error: '回单拆分明细与所选工人不一致', status: 400 as const } };
  }

  return { projectId: effectiveProjectId };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const client = getSupabaseClient();
    const searchParams = request.nextUrl.searchParams;
    const projectId = searchParams.get('project_id');
    const workerId = searchParams.get('worker_id');
    const yearMonth = normalizeYearMonth(searchParams.get('year_month') || searchParams.get('month'));
    const status = searchParams.get('status');

    let query = client
      .from('living_allowance_records')
      .select(`
        id,
        worker_id,
        project_id,
        year_month,
        allowance_date,
        amount,
        payment_method,
        status,
        receipt_item_id,
        deducted_salary_id,
        deducted_amount,
        remark,
        created_at,
        updated_at
      `)
      .order('allowance_date', { ascending: false })
      .order('id', { ascending: false });

    if (projectId && projectId !== 'all') query = query.eq('project_id', Number(projectId));
    if (workerId && workerId !== 'all') query = query.eq('worker_id', Number(workerId));
    if (yearMonth) query = query.eq('year_month', yearMonth);
    if (status && status !== 'all') query = query.eq('status', status);

    const accessibleProjectIds = await getAccessibleProjectIds(client, auth.user);
    if (accessibleProjectIds !== null) {
      if (accessibleProjectIds.length === 0) {
        return NextResponse.json({ records: [], summary: { totalAmount: 0, pendingAmount: 0, deductedAmount: 0, recordCount: 0 } });
      }
      query = query.in('project_id', accessibleProjectIds);
    }

    const { data, error } = await query;
    if (error) throw new Error(`查询生活费台账失败: ${error.message}`);

    const rows = data || [];
    const workerIds = pickNumberSet(rows, 'worker_id');
    const projectIds = pickNumberSet(rows, 'project_id');
    const receiptItemIds = pickNumberSet(rows, 'receipt_item_id');
    const salaryIds = pickNumberSet(rows, 'deducted_salary_id');

    const [workersRes, projectsRes, itemsRes, salariesRes] = await Promise.all([
      workerIds.length > 0
        ? client.from('workers').select('id, name, work_type, bank_card').in('id', workerIds)
        : Promise.resolve({ data: [], error: null }),
      projectIds.length > 0
        ? client.from('projects').select('id, name').in('id', projectIds)
        : Promise.resolve({ data: [], error: null }),
      receiptItemIds.length > 0
        ? client.from('living_allowance_receipt_items').select('id, receipt_id, recipient_name, transaction_no, match_score').in('id', receiptItemIds)
        : Promise.resolve({ data: [], error: null }),
      salaryIds.length > 0
        ? client.from('worker_salaries').select('id, year_month, net_pay, advance_pay').in('id', salaryIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (workersRes.error) throw new Error(`查询工人信息失败: ${workersRes.error.message}`);
    if (projectsRes.error) throw new Error(`查询项目信息失败: ${projectsRes.error.message}`);
    if (itemsRes.error) throw new Error(`查询回单明细失败: ${itemsRes.error.message}`);
    if (salariesRes.error) throw new Error(`查询工资扣减信息失败: ${salariesRes.error.message}`);

    const workerMap = new Map((workersRes.data || []).map((row: any) => [row.id, row]));
    const projectMap = new Map((projectsRes.data || []).map((row: any) => [row.id, row]));
    const itemMap = new Map((itemsRes.data || []).map((row: any) => [row.id, row]));
    const salaryMap = new Map((salariesRes.data || []).map((row: any) => [row.id, row]));

    const records = rows.map((record: any) => {
      const worker = workerMap.get(record.worker_id);
      const project = projectMap.get(record.project_id);
      const item = record.receipt_item_id ? itemMap.get(record.receipt_item_id) : null;
      const salary = record.deducted_salary_id ? salaryMap.get(record.deducted_salary_id) : null;
      return {
        ...record,
        amount: parseMoney(record.amount),
        deducted_amount: parseMoney(record.deducted_amount),
        worker_name: worker?.name || '未知工人',
        worker_work_type: worker?.work_type || '',
        project_name: project?.name || '未分配项目',
        receipt_id: item?.receipt_id || null,
        receipt_recipient_name: item?.recipient_name || null,
        transaction_no: item?.transaction_no || null,
        match_score: item?.match_score || 0,
        deducted_salary: salary || null,
      };
    });

    const summary = records.reduce((acc, record) => {
      acc.totalAmount += record.amount;
      acc.recordCount += 1;
      if (record.status === 'deducted') acc.deductedAmount += record.amount;
      else acc.pendingAmount += record.amount;
      return acc;
    }, { totalAmount: 0, pendingAmount: 0, deductedAmount: 0, recordCount: 0 });

    return NextResponse.json({
      records,
      summary: {
        ...summary,
        totalAmount: Math.round(summary.totalAmount * 100) / 100,
        pendingAmount: Math.round(summary.pendingAmount * 100) / 100,
        deductedAmount: Math.round(summary.deductedAmount * 100) / 100,
      },
    });
  } catch (error: unknown) {
    console.error('[LivingAllowances] GET error:', error);
    return NextResponse.json({ error: getErrorMessage(error, '查询失败') }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const workerId = normalizeId(body.worker_id);
    const requestedProjectId = normalizeId(body.project_id);
    const receiptItemId = normalizeId(body.receipt_item_id);
    const amount = parseMoney(body.amount);
    const allowanceDate = String(body.allowance_date || '').trim();
    const yearMonth = normalizeYearMonth(body.year_month) || yearMonthFromDate(allowanceDate);

    if (!workerId || !allowanceDate || !yearMonth || amount <= 0) {
      return NextResponse.json({ error: '请填写工人、发放日期、所属月份和生活费金额' }, { status: 400 });
    }

    const client = getSupabaseClient();
    const accessibleProjectIds = await getAccessibleProjectIds(client, auth.user);
    const scope = await validateWorkerAndProject(
      client,
      workerId,
      requestedProjectId,
      accessibleProjectIds,
    );
    if (scope.failure) {
      return NextResponse.json({ error: scope.failure.error }, { status: scope.failure.status });
    }

    const receiptScope = await validateReceiptItem(
      client,
      receiptItemId,
      workerId,
      scope.projectId,
      accessibleProjectIds,
    );
    if (receiptScope.failure) {
      return NextResponse.json({ error: receiptScope.failure.error }, { status: receiptScope.failure.status });
    }

    const insertData = {
      worker_id: workerId,
      project_id: receiptScope.projectId,
      year_month: yearMonth,
      allowance_date: allowanceDate,
      amount,
      payment_method: body.payment_method || '银行转账',
      status: 'pending_deduction',
      receipt_item_id: receiptItemId,
      remark: body.remark || null,
    };

    const result = await insertWithSequenceFix('living_allowance_records', insertData, client);
    if (result.error) throw new Error(`创建生活费记录失败: ${result.error.message}`);

    const record = Array.isArray(result.data) ? result.data[0] : result.data;
    await auditLog({
      operationType: 'create',
      resourceType: 'living_allowance',
      resourceId: record?.id,
      details: { worker_id: workerId, project_id: receiptScope.projectId, year_month: yearMonth, amount },
      request,
    });

    return NextResponse.json({ record });
  } catch (error: unknown) {
    console.error('[LivingAllowances] POST error:', error);
    return NextResponse.json({ error: getErrorMessage(error, '创建失败') }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const id = normalizeId(body.id);
    if (!id) return NextResponse.json({ error: '缺少生活费记录ID' }, { status: 400 });

    const client = getSupabaseClient();
    const { data: existing, error: fetchError } = await client
      .from('living_allowance_records')
      .select('id, status, worker_id, project_id, receipt_item_id')
      .eq('id', id)
      .maybeSingle();

    if (fetchError) throw new Error(`查询生活费记录失败: ${fetchError.message}`);
    if (!existing) return NextResponse.json({ error: '生活费记录不存在' }, { status: 404 });
    const accessibleProjectIds = await getAccessibleProjectIds(client, auth.user);
    const existingProjectId = normalizeId((existing as any).project_id);
    if (accessibleProjectIds !== null && (!existingProjectId || !accessibleProjectIds.includes(existingProjectId))) {
      return NextResponse.json({ error: '无权修改该项目下的生活费记录' }, { status: 403 });
    }
    if ((existing as any).status === 'deducted') {
      return NextResponse.json({ error: '该生活费已同步到工资借支，不能直接修改金额或人员' }, { status: 400 });
    }

    const allowanceDate = String(body.allowance_date || '').trim();
    const yearMonth = normalizeYearMonth(body.year_month) || yearMonthFromDate(allowanceDate);
    const amount = parseMoney(body.amount);
    const workerId = normalizeId(body.worker_id);
    const requestedProjectId = Object.prototype.hasOwnProperty.call(body, 'project_id')
      ? normalizeId(body.project_id)
      : existingProjectId;

    if (!workerId || !allowanceDate || !yearMonth || amount <= 0) {
      return NextResponse.json({ error: '请填写工人、发放日期、所属月份和生活费金额' }, { status: 400 });
    }

    const scope = await validateWorkerAndProject(
      client,
      workerId,
      requestedProjectId,
      accessibleProjectIds,
    );
    if (scope.failure) {
      return NextResponse.json({ error: scope.failure.error }, { status: scope.failure.status });
    }

    const receiptItemId = normalizeId((existing as any).receipt_item_id);
    const receiptScope = await validateReceiptItem(
      client,
      receiptItemId,
      workerId,
      scope.projectId,
      accessibleProjectIds,
    );
    if (receiptScope.failure) {
      return NextResponse.json({ error: receiptScope.failure.error }, { status: receiptScope.failure.status });
    }

    const { data, error } = await client
      .from('living_allowance_records')
      .update({
        worker_id: workerId,
        project_id: receiptScope.projectId,
        year_month: yearMonth,
        allowance_date: allowanceDate,
        amount,
        payment_method: body.payment_method || '银行转账',
        remark: body.remark || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select();

    if (error) throw new Error(`更新生活费记录失败: ${error.message}`);

    await auditLog({
      operationType: 'update',
      resourceType: 'living_allowance',
      resourceId: id,
      details: { worker_id: workerId, project_id: receiptScope.projectId, year_month: yearMonth, amount },
      request,
    });

    return NextResponse.json({ record: data?.[0] });
  } catch (error: unknown) {
    console.error('[LivingAllowances] PUT error:', error);
    return NextResponse.json({ error: getErrorMessage(error, '更新失败') }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const id = normalizeId(request.nextUrl.searchParams.get('id'));
    if (!id) return NextResponse.json({ error: '缺少生活费记录ID' }, { status: 400 });

    const client = getSupabaseClient();
    const { data: existing, error: fetchError } = await client
      .from('living_allowance_records')
      .select('id, status, project_id')
      .eq('id', id)
      .maybeSingle();

    if (fetchError) throw new Error(`查询生活费记录失败: ${fetchError.message}`);
    if (!existing) return NextResponse.json({ error: '生活费记录不存在' }, { status: 404 });
    const accessibleProjectIds = await getAccessibleProjectIds(client, auth.user);
    const existingProjectId = normalizeId((existing as any).project_id);
    if (accessibleProjectIds !== null && (!existingProjectId || !accessibleProjectIds.includes(existingProjectId))) {
      return NextResponse.json({ error: '无权删除该项目下的生活费记录' }, { status: 403 });
    }
    if ((existing as any).status === 'deducted') {
      return NextResponse.json({ error: '该生活费已同步到工资借支，不能直接删除' }, { status: 400 });
    }

    const { error } = await client.from('living_allowance_records').delete().eq('id', id);
    if (error) throw new Error(`删除生活费记录失败: ${error.message}`);

    await auditLog({
      operationType: 'delete',
      resourceType: 'living_allowance',
      resourceId: id,
      details: {},
      request,
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('[LivingAllowances] DELETE error:', error);
    return NextResponse.json({ error: getErrorMessage(error, '删除失败') }, { status: 500 });
  }
}
