import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const projectId = parseInt(id);
    const client = getSupabaseClient();

    // Count related data from all relevant tables
    const counts: Record<string, number> = {};

    // Workers
    const { count: workerCount } = await client
      .from('workers')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId);
    counts['工人'] = workerCount || 0;

    // Worker salaries
    const { count: salaryCount } = await client
      .from('worker_salaries')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId);
    counts['工资记录'] = salaryCount || 0;

    // Worker payments
    const { count: workerPaymentCount } = await client
      .from('worker_payments')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId);
    counts['工资发放'] = workerPaymentCount || 0;

    // Work item subitems (budget)
    const { count: subitemCount } = await client
      .from('work_item_subitems')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId);
    counts['工程量预算'] = subitemCount || 0;

    // Client reports (报量)
    const { count: reportCount } = await client
      .from('client_reports')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId);
    counts['甲方报量'] = reportCount || 0;

    // Client payments
    const { count: paymentCount } = await client
      .from('client_payments')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId);
    counts['甲方付款'] = paymentCount || 0;

    // Subitem monthly reports
    const { count: monthlyReportCount } = await client
      .from('subitem_monthly_reports')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId);
    counts['月度报量'] = monthlyReportCount || 0;

    // Subitem monthly progress (settlements)
    const { count: progressCount } = await client
      .from('subitem_monthly_progress')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId);
    counts['月度结算'] = progressCount || 0;

    // Supplier settlements
    const { count: settlementCount } = await client
      .from('supplier_settlements')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId);
    counts['供应商结算'] = settlementCount || 0;

    // Comprehensive expenses
    const { count: expenseCount } = await client
      .from('comprehensive_expenses')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId);
    counts['综合费用'] = expenseCount || 0;

    // Miscellaneous materials
    const { count: materialCount } = await client
      .from('miscellaneous_materials')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId);
    counts['零星材料'] = materialCount || 0;

    // Visas
    const { count: visaCount } = await client
      .from('visas')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId);
    counts['签证'] = visaCount || 0;

    // Limit prices
    const { count: limitPriceCount } = await client
      .from('limit_prices')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId);
    counts['限价'] = limitPriceCount || 0;

    // Filter out zero counts for cleaner display
    const relatedData = Object.entries(counts)
      .filter(([_, count]) => count > 0)
      .map(([name, count]) => ({ name, count }));

    const totalCount = Object.values(counts).reduce((sum, c) => sum + c, 0);

    return NextResponse.json({
      projectId,
      relatedData,
      totalCount,
    });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error.message || '查询关联数据失败' },
      { status: 500 }
    );
  }
}
