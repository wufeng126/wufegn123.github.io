import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

const supabase = getSupabaseClient();

// GET: compare two archived months
// ?month1=2026-06&month2=2026-05&project_id=all
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const month1 = searchParams.get('month1');
    const month2 = searchParams.get('month2');
    const projectId = searchParams.get('project_id');

    if (!month1 || !month2) {
      return NextResponse.json({ success: false, error: 'month1 and month2 are required' }, { status: 400 });
    }

    let query = supabase
      .from('monthly_report_archives')
      .select('id, month, project_id, project_name, report_mode, snapshot_data, kpi_summary, risk_summary, created_at')
      .in('month', [month1, month2])
      .order('month', { ascending: false });

    if (projectId && projectId !== 'all') {
      query = query.eq('project_id', Number(projectId));
    }

    const { data, error } = await query;

    if (error) {
      console.error('[compare] query error:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    if (!data || data.length === 0) {
      return NextResponse.json({ success: false, error: '未找到指定月份的存档数据' }, { status: 404 });
    }

    // Find the archive for each month (prefer 'boss' mode if multiple)
    const findArchive = (month: string) => {
      const monthArchives = data.filter(a => a.month === month);
      if (monthArchives.length === 0) return null;
      // Prefer boss mode, then first available
      return monthArchives.find(a => a.report_mode === 'boss') || monthArchives[0];
    };

    const archive1 = findArchive(month1);
    const archive2 = findArchive(month2);

    if (!archive1 || !archive2) {
      const missing = !archive1 ? month1 : month2;
      return NextResponse.json({ success: false, error: `${missing} 月报尚未存档，请先存档后再对比` }, { status: 404 });
    }

    // Build comparison data
    const kpi1 = archive1.kpi_summary || extractKpiFromSnapshot(archive1.snapshot_data);
    const kpi2 = archive2.kpi_summary || extractKpiFromSnapshot(archive2.snapshot_data);

    const comparison = buildKpiComparison(kpi1, kpi2, month1, month2);

    return NextResponse.json({
      success: true,
      data: {
        month1: { month: month1, archive: archive1, kpi: kpi1 },
        month2: { month: month2, archive: archive2, kpi: kpi2 },
        comparison,
      },
    });
  } catch (err) {
    console.error('[compare] GET error:', err);
    return NextResponse.json({ success: false, error: 'Failed to compare archives' }, { status: 500 });
  }
}

// Extract key KPIs from snapshot data if kpi_summary is not available
function extractKpiFromSnapshot(snapshot: any) {
  if (!snapshot) return {};
  const summary = snapshot.summary || snapshot;
  return {
    totalOutput: summary.totalOutput || summary.totalIncome || 0,
    totalReceived: summary.totalReceived || 0,
    totalCost: summary.totalCost || 0,
    totalProfit: summary.totalProfit || 0,
    profitRate: summary.profitRate || 0,
    paymentRate: summary.paymentRate || 0,
    monthIncome: summary.monthIncome || 0,
    monthCost: summary.monthCost || 0,
    monthProfit: summary.monthProfit || (summary.monthIncome || 0) - (summary.monthCost || 0),
    operatingProfit: summary.operatingProfit || 0,
    cashNetFlow: summary.cashNetFlow || 0,
    supplierUnpaid: summary.supplierUnpaid || 0,
    salaryUnpaid: summary.salaryUnpaid || 0,
    inServiceCount: summary.inServiceCount || 0,
    projectCount: summary.projectCount || 0,
  };
}

// Build side-by-side comparison of KPIs
function buildKpiComparison(kpi1: any, kpi2: any, month1: string, month2: string) {
  const fields = [
    { key: 'totalOutput', label: '总产值', unit: '元' },
    { key: 'monthIncome', label: '本月产值', unit: '元' },
    { key: 'totalReceived', label: '累计回款', unit: '元' },
    { key: 'totalCost', label: '总成本', unit: '元' },
    { key: 'monthCost', label: '本月成本', unit: '元' },
    { key: 'totalProfit', label: '总利润', unit: '元' },
    { key: 'monthProfit', label: '本月利润', unit: '元' },
    { key: 'profitRate', label: '利润率', unit: '%' },
    { key: 'paymentRate', label: '回款率', unit: '%' },
    { key: 'operatingProfit', label: '经营利润', unit: '元' },
    { key: 'cashNetFlow', label: '现金净流', unit: '元' },
    { key: 'supplierUnpaid', label: '供应商未付', unit: '元' },
    { key: 'salaryUnpaid', label: '工资未发', unit: '元' },
    { key: 'inServiceCount', label: '在场人数', unit: '人' },
    { key: 'projectCount', label: '项目数', unit: '个' },
  ];

  return fields.map(field => {
    const val1 = Number(kpi1[field.key] || 0);
    const val2 = Number(kpi2[field.key] || 0);
    const diff = val1 - val2;
    const diffPercent = val2 !== 0 ? ((diff / Math.abs(val2)) * 100) : 0;

    return {
      ...field,
      value1: val1,
      value2: val2,
      diff,
      diffPercent: Number(diffPercent.toFixed(2)),
      month1,
      month2,
    };
  });
}
