import { NextRequest, NextResponse } from 'next/server';
import { getReportRevenue } from '@/lib/revenue';
import { fetchAllRows } from '@/lib/fetch-all-rows';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import type { RequestAuthUser } from '@/lib/auth';
import { auditLog } from '@/lib/audit-log';
import { isReviewedStatus } from '@/lib/review-status';
import { getProjectFinancialSummary } from '@/lib/data-aggregation';
import { isEffectiveClientPaymentStatus, VISA_DONE_STATUSES } from '@/lib/business-logic';
import { requireApiWritePermission, requireAuth, requireSuperAdmin } from '@/lib/api-auth';
import { getAccessibleProjectIds } from '@/lib/api-project-access';

function nullableValue(value: unknown) {
  return value === '' || value === undefined ? null : value;
}

function hasGlobalProjectAccess(user: RequestAuthUser) {
  return user.is_super_admin || String(user.role || '').toLowerCase() === 'boss';
}

async function assertProjectAccess(
  client: ReturnType<typeof getSupabaseClient>,
  user: RequestAuthUser,
  projectId: number
) {
  if (!Number.isInteger(projectId) || projectId <= 0) {
    return NextResponse.json({ error: 'Invalid project id' }, { status: 400 });
  }

  if (hasGlobalProjectAccess(user)) return null;

  const accessibleProjectIds = await getAccessibleProjectIds(client, user);
  if (Array.isArray(accessibleProjectIds) && !accessibleProjectIds.includes(projectId)) {
    return NextResponse.json({ error: 'No permission to access this project' }, { status: 403 });
  }

  return null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const client = getSupabaseClient();
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const projectId = parseInt(id);
    const accessDenied = await assertProjectAccess(client, auth.user, projectId);
    if (accessDenied) return accessDenied;

    const { data, error } = await client
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single();

    if (error) {
      throw new Error(`Query project failed: ${error.message}`);
    }

    const { data: archiveRecords, error: archiveError } = await client
      .from('project_archives')
      .select('*')
      .eq('project_id', projectId)
      .order('archived_at', { ascending: false });
    if (archiveError) {
      console.warn('[ProjectDetail] archive records load failed:', archiveError.message);
    }

    const financialSummary = await getProjectFinancialSummary(projectId);

    const salaryData = await fetchAllRows<any>((from, to) =>
      client
        .from('worker_salaries')
        .select('gross_pay, net_pay, payment_status')
        .eq('project_id', projectId)
        .range(from, to),
    );

    const totalGrossPay = salaryData?.reduce((sum, r) => sum + parseFloat(r.gross_pay || '0'), 0) || 0;
    const totalNetPay = salaryData?.reduce((sum, r) => sum + parseFloat(r.net_pay || '0'), 0) || 0;
    const unpaidSalary = salaryData?.filter(r => r.payment_status === 'unpaid').reduce((sum, r) => sum + parseFloat(r.net_pay || '0'), 0) || 0;
    const partialSalary = salaryData?.filter(r => r.payment_status === 'partial').reduce((sum, r) => sum + parseFloat(r.net_pay || '0'), 0) || 0;
    const paidSalary = salaryData?.filter(r => r.payment_status === 'paid').reduce((sum, r) => sum + parseFloat(r.net_pay || '0'), 0) || 0;

    const reportData = await fetchAllRows<any>((from, to) =>
      client
        .from('client_reports')
        .select('report_amount, settlement_amount, status')
        .eq('project_id', projectId)
        .or('status.is.null,status.neq.voided')
        .range(from, to),
    );

    const totalReport = reportData?.reduce((sum, r) => {
      const amount = getReportRevenue(r);
      return sum + amount;
    }, 0) || 0;

    const paymentData = await fetchAllRows<any>((from, to) =>
      client
        .from('client_payments')
        .select('payment_amount, status')
        .eq('project_id', projectId)
        .range(from, to),
    );

    const totalPayment = paymentData
      ?.filter((r) => isEffectiveClientPaymentStatus(r.status))
      .reduce((sum, r) => sum + parseFloat(r.payment_amount || '0'), 0) || 0;

    const { data: workItemsData } = await client
      .from('work_items')
      .select('id, budget_quantity, unit_price')
      .eq('project_id', projectId);

    let budgetCost = 0;
    let actualCost = 0;
    const workItemCount = workItemsData?.length || 0;

    if (workItemsData && workItemsData.length > 0) {
      const workItemIds = workItemsData.map(item => item.id);
      const { data: progressData } = await client
        .from('work_item_progress')
        .select('work_item_id, completed_quantity')
        .in('work_item_id', workItemIds);

      const progressMap = new Map<number, number>();
      progressData?.forEach(p => {
        const current = progressMap.get(p.work_item_id) || 0;
        progressMap.set(p.work_item_id, current + parseFloat(p.completed_quantity || '0'));
      });

      workItemsData.forEach(item => {
        const budgetQty = parseFloat(item.budget_quantity || '0');
        const unitPrice = parseFloat(item.unit_price || '0');
        const completedQty = progressMap.get(item.id) || 0;

        budgetCost += budgetQty * unitPrice;
        actualCost += completedQty * unitPrice;
      });
    }

    const { data: workersData } = await client
      .from('workers')
      .select('id, status')
      .eq('project_id', projectId);

    const inServiceCount = workersData?.filter(w => w.status !== 'left').length || 0;
    const leftCount = workersData?.filter(w => w.status === 'left').length || 0;
    const workerCount = workersData?.length || 0;

    const { data: visaData } = await client
      .from('visas')
      .select('visa_amount')
      .eq('project_id', projectId)
      .in('status', [...VISA_DONE_STATUSES]);
    const totalVisa = visaData?.reduce((sum, r) => sum + parseFloat(r.visa_amount || '0'), 0) || 0;

    const { data: contractsForProject } = await client
      .from('supplier_contracts')
      .select('id')
      .eq('project_id', projectId);
    const projectContractIds = (contractsForProject || []).map((c: { id: number }) => c.id);
    let totalSettlement = 0;
    if (projectContractIds.length > 0) {
      // 状态口径统一走 isReviewedStatus（兼容「已提交/已审核」等中文历史状态与 NULL），且分页取全量
      const settlementsData = await fetchAllRows<{ settlement_amount?: unknown; status?: string | null }>((from, to) =>
        client
          .from('supplier_settlements')
          .select('settlement_amount, status')
          .in('contract_id', projectContractIds)
          .range(from, to));
      totalSettlement = settlementsData
        .filter((r) => !r.status || isReviewedStatus(String(r.status)))
        .reduce((sum, r) => sum + parseFloat(String(r.settlement_amount || '0')), 0);
    }

    return NextResponse.json({
      project: data,
      archives: archiveRecords || [],
      stats: {
        totalGrossPay: totalGrossPay.toFixed(2),
        totalNetPay: totalNetPay.toFixed(2),
        unpaidSalary: unpaidSalary.toFixed(2),
        partialSalary: partialSalary.toFixed(2),
        paidSalary: paidSalary.toFixed(2),
        totalReport: totalReport.toFixed(2),
        totalPayment: totalPayment.toFixed(2),
        budgetCost: budgetCost.toFixed(2),
        actualCost: actualCost.toFixed(2),
        workItemCount,
        workerCount,
        inServiceCount,
        leftCount,
        totalVisa: totalVisa.toFixed(2),
        totalSettlement: totalSettlement.toFixed(2),
        totalCost: (financialSummary?.totalCost || 0).toFixed(2),
        totalProfit: (financialSummary?.profit || 0).toFixed(2),
        profitRate: (financialSummary?.profitRate || 0).toFixed(2),
        receivableAmount: (financialSummary?.receivableAmount || 0).toFixed(2),
        supplierPayableAmount: (financialSummary?.supplierPayableAmount || 0).toFixed(2),
        workerPayableAmount: (financialSummary?.workerPayableAmount || 0).toFixed(2),
        totalPayableAmount: (financialSummary?.totalPayableAmount || 0).toFixed(2),
        cashOutAmount: (financialSummary?.cashOutAmount || 0).toFixed(2),
        netCashFlow: (financialSummary?.netCashFlow || 0).toFixed(2),
        fundingGapAmount: (financialSummary?.fundingGapAmount || 0).toFixed(2),
        paymentRate: (financialSummary?.paymentRate || 0).toFixed(2),
        payablePaymentRate: (financialSummary?.payablePaymentRate || 0).toFixed(2),
        costIncomeRate: (financialSummary?.costIncomeRate || 0).toFixed(2),
      }
    });
  } catch (error: unknown) {
    console.error('API Error:', error);
    const message = error instanceof Error ? error.message : 'Query failed';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const body = await request.json();
    const {
      name,
      year,
      status,
      address,
      partner,
      contract_amount,
      icon,
      building_area,
      tax_rate,
      expected_completion_date,
      construction_payment_ratio,
      completion_settlement_payment_ratio,
      warranty_payment_ratio,
      warranty_expired_payment_ratio,
      completion_date,
      warranty_days,
      budget_user_id,
      manager_user_id,
    } = body;

    const client = getSupabaseClient();
    const projectId = parseInt(id);
    const accessDenied = await assertProjectAccess(client, auth.user, projectId);
    if (accessDenied) return accessDenied;

    const { data, error } = await client
      .from('projects')
      .update({
        name,
        year,
        status,
        address: nullableValue(address),
        partner: nullableValue(partner),
        contract_amount: nullableValue(contract_amount),
        icon: icon || 'HardHat',
        building_area: nullableValue(building_area),
        tax_rate: tax_rate || 9,
        expected_completion_date: nullableValue(expected_completion_date),
        construction_payment_ratio: nullableValue(construction_payment_ratio),
        completion_settlement_payment_ratio: nullableValue(completion_settlement_payment_ratio),
        warranty_payment_ratio: nullableValue(warranty_payment_ratio),
        warranty_expired_payment_ratio: nullableValue(warranty_expired_payment_ratio),
        completion_date: nullableValue(completion_date),
        warranty_days: nullableValue(warranty_days),
        budget_user_id: nullableValue(budget_user_id),
        manager_user_id: nullableValue(manager_user_id),
      })
      .eq('id', projectId)
      .select()
      .single();

    if (error) {
      throw new Error(`Update project failed: ${error.message}`);
    }

    await auditLog({
      operationType: 'update',
      resourceType: 'project',
      resourceId: projectId,
      details: { name, year, status, address, partner, contract_amount, building_area, tax_rate },
      request,
    });

    return NextResponse.json({ project: data });
  } catch (error: unknown) {
    console.error('API Error:', error);
    const message = error instanceof Error ? error.message : 'Update failed';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireSuperAdmin(request);
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const client = getSupabaseClient();
    const projectId = parseInt(id);

    const { data: projectData } = await client
      .from('projects')
      .select('name')
      .eq('id', projectId)
      .single();

    // 删除前预检：有业务数据的项目不允许直接删（避免留下无项目工人 / 悬挂 project_id 的费用与合同）
    const relatedTables: Array<{ table: string; label: string }> = [
      { table: 'client_reports', label: '甲方报量' },
      { table: 'client_payments', label: '甲方回款' },
      { table: 'worker_salaries', label: '工人工资' },
      { table: 'workers', label: '花名册工人' },
      { table: 'work_items', label: '清单分项' },
      { table: 'team_settlements', label: '班组结算' },
      { table: 'supplier_contracts', label: '供应商合同' },
      { table: 'comprehensive_expenses', label: '综合费用' },
      { table: 'miscellaneous_materials', label: '零星材料' },
      { table: 'construction_logs', label: '施工日志' },
      { table: 'visas', label: '签证' },
      { table: 'settlements', label: '旧结算' },
      { table: 'payments', label: '旧付款' },
    ];
    const counts = await Promise.all(
      relatedTables.map(async ({ table, label }) => {
        const { count } = await client
          .from(table)
          .select('id', { count: 'exact', head: true })
          .eq('project_id', projectId);
        return { label, count: count || 0 };
      }),
    );
    const blocking = counts.filter((row) => row.count > 0);
    if (blocking.length > 0) {
      return NextResponse.json(
        {
          error: `该项目还有业务数据，不能直接删除：${blocking.map((row) => `${row.label} ${row.count} 条`).join('、')}。请先清理或迁移数据。`,
          related: blocking,
        },
        { status: 400 },
      );
    }

    const { error } = await client
      .from('projects')
      .delete()
      .eq('id', projectId);

    if (error) {
      throw new Error(`Delete project failed: ${error.message}`);
    }

    await auditLog({
      operationType: 'delete',
      resourceType: 'project',
      resourceId: projectId,
      details: { name: projectData?.name },
      request,
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('API Error:', error);
    const message = error instanceof Error ? error.message : 'Delete failed';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
