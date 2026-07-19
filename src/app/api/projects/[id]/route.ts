import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getCurrentUser } from '@/lib/auth';
import { auditLog } from '@/lib/audit-log';
import { getProjectFinancialSummary } from '@/lib/data-aggregation';
import { isEffectiveClientPaymentStatus } from '@/lib/business-logic';

function nullableValue(value: unknown) {
  return value === '' || value === undefined ? null : value;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const client = getSupabaseClient();
    
    const { data, error } = await client
      .from('projects')
      .select('*')
      .eq('id', parseInt(id))
      .single();

    if (error) {
      throw new Error(`查询项目失败: ${error.message}`);
    }

    const { data: archiveRecords, error: archiveError } = await client
      .from('project_archives')
      .select('*')
      .eq('project_id', parseInt(id))
      .order('archived_at', { ascending: false });
    if (archiveError) {
      console.warn('[ProjectDetail] archive records load failed:', archiveError.message);
    }

    // 获取项目统计数据
    const projectId = parseInt(id);
    const financialSummary = await getProjectFinancialSummary(projectId);

    // 工人工资总额（含发放状态统计）
    const { data: salaryData } = await client
      .from('worker_salaries')
      .select('gross_pay, net_pay, payment_status')
      .eq('project_id', projectId);
    
    const totalGrossPay = salaryData?.reduce((sum, r) => sum + parseFloat(r.gross_pay || '0'), 0) || 0;
    const totalNetPay = salaryData?.reduce((sum, r) => sum + parseFloat(r.net_pay || '0'), 0) || 0;
    const unpaidSalary = salaryData?.filter(r => r.payment_status === 'unpaid').reduce((sum, r) => sum + parseFloat(r.net_pay || '0'), 0) || 0;
    const partialSalary = salaryData?.filter(r => r.payment_status === 'partial').reduce((sum, r) => sum + parseFloat(r.net_pay || '0'), 0) || 0;
    const paidSalary = salaryData?.filter(r => r.payment_status === 'paid').reduce((sum, r) => sum + parseFloat(r.net_pay || '0'), 0) || 0;

    // 甲方报量总额（排除已作废，优先使用 settlement_amount）
    const { data: reportData } = await client
      .from('client_reports')
      .select('report_amount, settlement_amount, status')
      .eq('project_id', projectId)
      .neq('status', 'voided');
    
    const totalReport = reportData?.reduce((sum, r) => {
      const amount = parseFloat(r.settlement_amount || r.report_amount || '0');
      return sum + amount;
    }, 0) || 0;

    // 甲方付款总额（仅已完成的付款）
    const { data: paymentData } = await client
      .from('client_payments')
      .select('payment_amount, status')
      .eq('project_id', projectId);
    
    const totalPayment = paymentData
      ?.filter((r) => isEffectiveClientPaymentStatus(r.status))
      .reduce((sum, r) => sum + parseFloat(r.payment_amount || '0'), 0) || 0;

    // 工程量统计
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

    // 工人数量（按在场/退场统计）
    const { data: workersData } = await client
      .from('workers')
      .select('id, status')
      .eq('project_id', projectId);
    
    const inServiceCount = workersData?.filter(w => w.status !== 'left').length || 0;
    const leftCount = workersData?.filter(w => w.status === 'left').length || 0;
    const workerCount = workersData?.length || 0;

    // 签证金额（仅已签回）
    const { data: visaData } = await client
      .from('visas')
      .select('visa_amount')
      .eq('project_id', projectId)
      .eq('status', '已签回');
    const totalVisa = visaData?.reduce((sum, r) => sum + parseFloat(r.visa_amount || '0'), 0) || 0;

    // 供应商结算金额（排除已作废）
    const { data: contractsForProject } = await client
      .from('supplier_contracts')
      .select('id')
      .eq('project_id', projectId);
    const projectContractIds = (contractsForProject || []).map((c: { id: number }) => c.id);
    let totalSettlement = 0;
    if (projectContractIds.length > 0) {
      const { data: settlementsData } = await client
        .from('supplier_settlements')
        .select('settlement_amount')
        .in('contract_id', projectContractIds)
        .neq('status', 'voided');
      totalSettlement = settlementsData?.reduce((sum, r) => sum + parseFloat(String(r.settlement_amount || '0')), 0) || 0;
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
    const message = error instanceof Error ? error.message : '查询失败';
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
    } = body;

    const client = getSupabaseClient();
    
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
      })
      .eq('id', parseInt(id))
      .select()
      .single();

    if (error) {
      throw new Error(`更新项目失败: ${error.message}`);
    }

    // 记录审计日志
    await auditLog({
      operationType: 'update',
      resourceType: 'project',
      resourceId: parseInt(id),
      details: { name, year, status, address, partner, contract_amount, building_area, tax_rate },
      request,
    });

    return NextResponse.json({ project: data });
  } catch (error: unknown) {
    console.error('API Error:', error);
    const message = error instanceof Error ? error.message : '更新失败';
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
    // 验证用户权限 - 只有超级管理员可以删除项目
    const user = await getCurrentUser();
    if (!user || user.role !== 'super_admin') {
      return NextResponse.json(
        { error: '权限不足：只有超级管理员可以删除项目' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const client = getSupabaseClient();
    
    // 先获取项目名称用于日志
    const { data: projectData } = await client
      .from('projects')
      .select('name')
      .eq('id', parseInt(id))
      .single();

    const { error } = await client
      .from('projects')
      .delete()
      .eq('id', parseInt(id));

    if (error) {
      throw new Error(`删除项目失败: ${error.message}`);
    }

    // 记录审计日志
    await auditLog({
      operationType: 'delete',
      resourceType: 'project',
      resourceId: parseInt(id),
      details: { name: projectData?.name },
      request,
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('API Error:', error);
    const message = error instanceof Error ? error.message : '删除失败';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
