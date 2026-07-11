import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { logSecurityEvent } from '@/lib/security-log';

// ─── Helpers ───────────────────────────────────────────────
const fmt = (v: number): string => {
  if (v === undefined || v === null || isNaN(v)) return '暂无数据';
  if (v === 0) return '0.00';
  return v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const fmtW = (v: number): string => {
  if (v === undefined || v === null || isNaN(v)) return '暂无数据';
  if (v === 0) return '0.00';
  if (Math.abs(v) >= 100000000) return (v / 100000000).toFixed(2) + ' 亿';
  if (Math.abs(v) >= 10000) return (v / 10000).toFixed(2) + ' 万';
  return fmt(v);
};

const fmtP = (v: number): string => {
  if (v === undefined || v === null || isNaN(v)) return '暂无数据';
  return v.toFixed(1) + '%';
};

const riskColor = (v: number, isProfit = true): string => {
  if (isProfit) return v < 0 ? '#F53F3F' : '#00B42A';
  return v > 0 ? '#F53F3F' : '#00B42A';
};

// ─── GET: Export history ────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month');

    let query = supabase
      .from('monthly_report_snapshots')
      .select('id, report_month, project_scope, template_type, generated_by, generated_at')
      .order('generated_at', { ascending: false })
      .limit(20);

    if (month) {
      query = query.eq('report_month', month);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[Export PDF] GET snapshots error:', error);
      return NextResponse.json({ success: false, error: '获取快照列表失败' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: data || [] });
  } catch (error) {
    console.error('[Export PDF] GET error:', error);
    return NextResponse.json({ success: false, error: '获取快照列表失败' }, { status: 500 });
  }
}

// ─── POST: Generate HTML for PDF printing ──────────────────
export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const reportMonth = searchParams.get('month');
    const projectId = searchParams.get('projectId');
    const templateType = searchParams.get('template') || 'boss';

    if (!reportMonth) {
      return NextResponse.json({ success: false, error: '缺少月份参数' }, { status: 400 });
    }

    // 记录导出安全日志
    const operatorId = request.headers.get('x-user-id');
    await logSecurityEvent({
      event_type: 'export_pdf',
      user_id: operatorId ? parseInt(operatorId) : undefined,
      ip_address: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown',
      user_agent: request.headers.get('user-agent') || 'unknown',
      result: 'success',
      details: { month: reportMonth, projectId, template: templateType },
    });

    // Fetch monthly summary data
    const baseUrl = process.env.DEPLOY_RUN_PORT
      ? `http://localhost:${process.env.DEPLOY_RUN_PORT}`
      : 'http://localhost:5000';
    const summaryUrl = `${baseUrl}/api/reports/monthly/summary?month=${reportMonth}${projectId && projectId !== 'all' ? `&projectId=${projectId}` : ''}`;

    const summaryRes = await fetch(summaryUrl, {
      headers: { cookie: request.headers.get('cookie') || '' },
    });
    if (!summaryRes.ok) {
      console.error('[Export PDF] Fetch summary failed:', summaryRes.status);
      return NextResponse.json({ success: false, error: '获取月报数据失败' }, { status: 500 });
    }
    const summaryData = await summaryRes.json();
    const data = summaryData.data || {};

    // Save snapshot (non-blocking)
    try {
      const supabase = getSupabaseClient();
      await supabase
        .from('monthly_report_snapshots')
        .insert({
          report_month: reportMonth,
          project_scope: projectId && projectId !== 'all' ? 'selected' : 'all',
          project_ids: projectId && projectId !== 'all' ? [projectId] : [],
          template_type: templateType,
          data_snapshot: data,
          generated_by: 'system',
          generated_at: new Date().toISOString(),
        });
    } catch (snapErr) {
      console.error('[Export PDF] Save snapshot error (non-fatal):', snapErr);
    }

    // Generate HTML
    const projectScope = projectId && projectId !== 'all' ? 'selected' : 'all';
    const html = generateReportHTML(data, reportMonth, projectScope, templateType);

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('[Export PDF] Error:', error);
    return NextResponse.json({ success: false, error: 'PDF生成失败' }, { status: 500 });
  }
}

// ─── HTML Report Generator ─────────────────────────────────
function generateReportHTML(
  data: Record<string, unknown>,
  reportMonth: string,
  projectScope: string,
  templateType: string
): string {
  const overview = (data?.overview || {}) as Record<string, number>;
  const projects = (data?.projects || []) as Record<string, unknown>[];
  const risks = (data?.risks || {}) as Record<string, unknown[]>;
  const collectionLag = (data?.collectionLagAnalysis || []) as Record<string, unknown>[];
  const seasonalNote = (data?.seasonalNote || '') as string;
  // Filter: hide suppliers with no current-month settlement AND fully paid
  const allSuppliers = (data.supplierPaymentsBySupplier || []) as Record<string, unknown>[];
  const supplierDetails = allSuppliers.filter((s: Record<string, unknown>) => {
    const ms = (s.monthSettlement as number) || 0;
    const mp = (s.monthPaid as number) || 0;
    const unpaid = (s.totalUnpaid as number) || 0;
    // Show if: has current month settlement OR has unpaid balance
    return ms > 0 || mp > 0 || unpaid > 0;
  });
  const generatedAt = new Date().toLocaleString('zh-CN');
  const scopeLabel = projectScope === 'all' ? '全部项目' : '选定项目';

  const kpiCard = (label: string, value: string, valueColor?: string) => `
    <div style="background:#FAFBFC;border-radius:6px;padding:8px 12px;min-width:120px;">
      <div style="font-size:11px;color:#86909C;margin-bottom:2px;">${label}</div>
      <div style="font-size:16px;font-weight:700;color:${valueColor || '#1D2129'};">${value}</div>
    </div>`;

  const sectionTitle = (text: string) => `
    <div style="font-size:13px;font-weight:700;color:#4E5969;margin:12px 0 6px;border-bottom:2px solid #165DFF;padding-bottom:4px;">${text}</div>`;

  const simpleTable = (headers: string[], rows: string[][]) => {
    const th = headers.map(h => `<th style="background:#F0F5FF;color:#165DFF;font-size:11px;padding:6px 8px;text-align:center;white-space:nowrap;">${h}</th>`).join('');
    const trs = rows.map(row => `<tr>${row.map(cell => `<td style="padding:5px 8px;font-size:11px;text-align:right;border-bottom:1px solid #E5E6EB;">${cell}</td>`).join('')}</tr>`).join('');
    return `<table style="width:100%;border-collapse:collapse;margin:4px 0 12px;"><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table>`;
  };

  // Build content sections
  let content = '';

  // ═══════ COVER ═══════
  content += `
    <div class="page-break" style="position:relative;min-height:700px;padding:80px 60px 40px;">
      <div style="text-align:center;margin-top:100px;">
        <h1 style="font-size:32px;color:#1D2129;font-weight:700;letter-spacing:4px;margin-bottom:40px;">月度经营报表</h1>
        <div style="font-size:18px;color:#4E5969;margin-bottom:12px;">${reportMonth}</div>
        <div style="font-size:14px;color:#86909C;margin-bottom:6px;">统计范围：${scopeLabel}</div>
      </div>
      <div style="position:absolute;bottom:80px;left:60px;">
        <div style="font-size:13px;color:#4E5969;margin-bottom:24px;">
          <div style="margin-bottom:6px;">项目负责：_________________</div>
          <div style="margin-bottom:6px;">财务审核：_________________</div>
          <div>主管审批：_________________</div>
        </div>
      </div>
      <div style="position:absolute;bottom:30px;right:60px;font-size:10px;color:#C9CDD4;">生成时间：${generatedAt}</div>
    </div>`;

  // ═══════ SECTION 1: OVERVIEW ═══════
  if (templateType !== 'financial') {
    content += `
      <div class="page-break">
        <h2 style="font-size:18px;color:#165DFF;margin-bottom:16px;">一、经营总览</h2>`;

    // Operating profit KPIs
    content += sectionTitle('经营成果（权责发生制）');
    content += `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
      ${kpiCard('项目数量', `${overview.projectCount || 0} 个`)}
      ${kpiCard('本月确认产值', fmtW(overview.monthConfirmedOutput || overview.monthIncome || 0))}
      ${kpiCard('本月已审批签证', fmtW(overview.monthVisa || 0))}
      ${kpiCard('本月确认成本', fmtW(overview.monthCost || 0))}
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
      ${kpiCard('本月经营利润', fmtW(overview.operatingProfit || 0), riskColor(overview.operatingProfit || 0, true))}
      ${kpiCard('经营利润率', fmtP(overview.operatingProfitRate || 0), riskColor(overview.operatingProfitRate || 0, true))}
      ${kpiCard('累计产值', fmtW(overview.totalIncome || 0))}
      ${kpiCard('累计签证', fmtW(overview.cumulativeVisa || 0))}
    </div>`;

    // Cash flow KPIs
    content += sectionTitle('现金流（收付实现制）');
    content += `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
      ${kpiCard('本月实际回款', fmtW(overview.monthReceived || 0))}
      ${kpiCard('本月实际支付', fmtW(overview.monthActualPayment || 0))}
      ${kpiCard('本月现金净流', fmtW(overview.cashNetFlow || 0), riskColor(overview.cashNetFlow || 0, true))}
      ${kpiCard('现金流比率', fmtP(overview.cashNetFlowRate || 0), riskColor(overview.cashNetFlowRate || 0, true))}
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
      ${kpiCard('累计已回款', fmtW(overview.totalReceived || 0))}
      ${kpiCard('应收未回', fmtW(overview.unreceived || 0), riskColor(overview.unreceived || 0, false))}
      ${kpiCard('回款率', fmtP(overview.paymentRate || 0), (overview.paymentRate || 0) > 100 ? '#FF7D00' : undefined)}
      ${kpiCard('未发工资', fmtW(overview.totalUnpaidSalary || 0), riskColor(overview.totalUnpaidSalary || 0, false))}
    </div>`;

    // Supplier & Labor KPIs
    content += sectionTitle('供应商与人工');
    content += `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
      ${kpiCard('供应商已付', fmtW(overview.cumulativeSupplierPayment || 0))}
      ${kpiCard('供应商付款率', fmtP(overview.supplierPaymentRate || 0))}
      ${kpiCard('在场人数', `${overview.inServiceCount || 0} 人`)}
      ${kpiCard('累计成本', fmtW(overview.totalCost || 0))}
    </div>`;

    // Cost structure table
    content += `<div style="font-size:12px;font-weight:700;color:#4E5969;margin:12px 0 4px;">成本构成</div>`;
    content += simpleTable(
      ['人工成本', '供应商成本', '综合费用', '税费', '零星材料', '合计'],
      [[
        fmt(overview.totalSalary || 0),
        fmt(overview.totalSupplierCost || 0),
        fmt(overview.totalExpense || 0),
        fmt(overview.totalTaxCost || 0),
        fmt(overview.totalMaterialCost || 0),
        `<span style="color:#165DFF;font-weight:700;">${fmt(overview.totalCost || 0)}</span>`,
      ]]
    );

    if (seasonalNote) {
      content += `<div style="background:#FFF7E8;border:1px solid #FF7D00;border-radius:4px;padding:8px 12px;font-size:11px;color:#4E5969;margin:8px 0;">${seasonalNote}</div>`;
    }

    content += `</div>`;
  }

  // ═══════ SECTION 2: PROJECT SUMMARY TABLE ═══════
  if (projects.length > 0 && templateType !== 'financial') {
    content += `<div class="page-break"><h2 style="font-size:18px;color:#165DFF;margin-bottom:16px;">二、项目汇总表</h2>`;

    const projectRows = projects.map((p: Record<string, unknown>) => {
      const isOpLoss = (p.operatingProfit as number || 0) < 0;
      const isCashNeg = (p.cashNetFlow as number || 0) < 0;
      const isLowPayment = (p.paymentRate as number || 0) < 50;
      const riskTag = isOpLoss ? '<span style="color:#F53F3F;">经营亏损</span>' : isCashNeg ? '<span style="color:#F53F3F;">现金流出</span>' : isLowPayment ? '<span style="color:#FF7D00;">回款低</span>' : '<span style="color:#00B42A;">正常</span>';
      return [
        `<span style="white-space:nowrap;">${(p.name as string) || '-'}</span>`,
        fmtW(p.monthConfirmedOutput as number || p.monthIncome as number || 0),
        fmtW(p.monthApprovedVisa as number || p.monthVisa as number || 0),
        fmtW(p.monthConfirmedCost as number || p.monthCost as number || 0),
        `<span style="color:${isOpLoss ? '#F53F3F' : '#00B42A'}">${fmtW(p.operatingProfit as number || 0)}</span>`,
        `<span style="color:${isOpLoss ? '#F53F3F' : '#00B42A'}">${fmtP(p.operatingProfitRate as number || 0)}</span>`,
        fmtW(p.monthReceived as number || 0),
        fmtW(p.monthActualPayment as number || 0),
        `<span style="color:${isCashNeg ? '#F53F3F' : '#00B42A'}">${fmtW(p.cashNetFlow as number || 0)}</span>`,
        fmtW(p.totalIncome as number || 0),
        fmtW(p.cumulativeVisa as number || 0),
        `<span style="color:${isLowPayment ? '#F53F3F' : '#1D2129'}">${fmtP(p.paymentRate as number || 0)}</span>`,
        `${p.inServiceCount || 0}`,
        riskTag,
      ];
    });

    content += simpleTable(
      ['项目名称', '月产值', '月签证', '月成本', '经营利润', '经营利润率', '月回款', '月支付', '现金净流', '累计产值', '累计签证', '回款率', '在场', '风险'],
      projectRows
    );
    content += `</div>`;
  }

  // ═══════ SECTION 3: PROJECT DETAIL PAGES ═══════
  if (templateType === 'detail' || templateType === 'boss') {
    projects.forEach((p: Record<string, unknown>) => {
      content += `<div class="page-break"><h2 style="font-size:18px;color:#165DFF;margin-bottom:16px;">项目明细：${p.name}</h2>`;

      content += sectionTitle('经营成果');
      content += `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
        ${kpiCard('月确认产值', fmtW(p.monthConfirmedOutput as number || p.monthIncome as number || 0))}
        ${kpiCard('月审批签证', fmtW(p.monthApprovedVisa as number || 0))}
        ${kpiCard('月确认成本', fmtW(p.monthConfirmedCost as number || p.monthCost as number || 0))}
        ${kpiCard('经营利润', fmtW(p.operatingProfit as number || 0), riskColor(p.operatingProfit as number || 0, true))}
      </div>`;

      content += sectionTitle('现金流');
      content += `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
        ${kpiCard('月实际回款', fmtW(p.monthReceived as number || 0))}
        ${kpiCard('月实际支付', fmtW(p.monthActualPayment as number || 0))}
        ${kpiCard('现金净流', fmtW(p.cashNetFlow as number || 0), riskColor(p.cashNetFlow as number || 0, true))}
        ${kpiCard('累计产值', fmtW(p.totalIncome as number || 0))}
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
        ${kpiCard('累计回款', fmtW(p.totalReceived as number || 0))}
        ${kpiCard('应收未回', fmtW(p.unreceived as number || 0), riskColor(p.unreceived as number || 0, false))}
        ${kpiCard('回款率', fmtP(p.paymentRate as number || 0), (p.paymentRate as number || 0) > 100 ? '#FF7D00' : undefined)}
        ${kpiCard('累计签证', fmtW(p.cumulativeVisa as number || 0))}
      </div>`;

      content += `<div style="font-size:12px;font-weight:700;color:#4E5969;margin:12px 0 4px;">成本明细</div>`;
      content += simpleTable(
        ['人工成本', '供应商成本', '综合费用', '税费', '零星材料', '合计'],
        [[
          fmt(p.salaryCost as number || 0),
          fmt(p.supplierCost as number || 0),
          fmt(p.expenseCost as number || 0),
          fmt(p.taxCost as number || 0),
          fmt(p.materialCost as number || 0),
          `<span style="color:#165DFF;font-weight:700;">${fmt(p.totalCost as number || 0)}</span>`,
        ]]
      );

      content += `<div style="font-size:12px;font-weight:700;color:#4E5969;margin:12px 0 4px;">供应商结算与付款</div>`;
      content += simpleTable(
        ['供应商结算', '供应商已付', '供应商未付', '付款率'],
        [[
          fmt(p.supplierCost as number || 0),
          fmt(p.cumulativeSupplierPayment as number || 0),
          fmt((p.supplierCost as number || 0) - (p.cumulativeSupplierPayment as number || 0)),
          (p.supplierPaymentRate as number || 0).toFixed(1) + '%',
        ]]
      );

      content += `<div style="font-size:12px;font-weight:700;color:#4E5969;margin:12px 0 4px;">关键指标</div>`;
      content += simpleTable(
        ['经营利润率', '回款率', '在场人数', '签证待审批', '未发工资'],
        [[
          `<span style="color:${(p.operatingProfitRate as number || 0) < 0 ? '#F53F3F' : '#00B42A'}">${fmtP(p.operatingProfitRate as number || 0)}</span>`,
          `<span style="color:${(p.paymentRate as number || 0) > 100 ? '#FF7D00' : '#1D2129'}">${fmtP(p.paymentRate as number || 0)}</span>`,
          `${p.inServiceCount || 0}`,
          `${p.pendingVisaCount || 0}`,
          `<span style="color:${(p.unpaidSalary as number || 0) > 0 ? '#F53F3F' : '#1D2129'}">${fmt(p.unpaidSalary as number || 0)}</span>`,
        ]]
      );

      content += `</div>`;
    });
  }

  // ═══════ SECTION 4: SUPPLIER DETAIL ═══════
  if (templateType !== 'financial' && supplierDetails.length > 0) {
    content += `<div class="page-break"><h2 style="font-size:18px;color:#165DFF;margin-bottom:16px;">供应商结算与付款明细</h2>`;

    const sRows = supplierDetails.map((s: Record<string, unknown>) => {
      const ms = (s.monthSettlement as number) || 0;
      const mp = (s.monthPaid as number) || 0;
      const ts = (s.totalSettlement as number) || 0;
      const tp = (s.totalPaid as number) || 0;
      const unpaid = ts - tp;
      const rate = (s.paymentRate as number) || 0;
      return [
        (s.supplierName as string) || '-',
        (s.projectName as string) || '-',
        fmt(ms),
        fmt(mp),
        fmt(ts),
        fmt(tp),
        unpaid > 0 ? `<span style="color:#F53F3F;">${fmt(unpaid)}</span>` : fmt(unpaid),
        rate.toFixed(1) + '%',
      ];
    });

    // Total row
    const totalMS = supplierDetails.reduce((sum, s) => sum + ((s.monthSettlement as number) || 0), 0);
    const totalMP = supplierDetails.reduce((sum, s) => sum + ((s.monthPaid as number) || 0), 0);
    const totalTS = supplierDetails.reduce((sum, s) => sum + ((s.totalSettlement as number) || 0), 0);
    const totalTP = supplierDetails.reduce((sum, s) => sum + ((s.totalPaid as number) || 0), 0);
    const totalUnpaid = totalTS - totalTP;
    const totalRate = totalTS > 0 ? (totalTP / totalTS * 100) : 0;
    sRows.push([
      '<strong>合计</strong>', '-',
      fmt(totalMS), fmt(totalMP), fmt(totalTS), fmt(totalTP),
      totalUnpaid > 0 ? `<span style="color:#F53F3F;font-weight:700;">${fmt(totalUnpaid)}</span>` : fmt(totalUnpaid),
      `<strong>${totalRate.toFixed(1)}%</strong>`,
    ]);

    content += simpleTable(
      ['供应商名称', '所属项目', '本月结算', '本月付款', '累计结算', '累计付款', '未付金额', '付款率'],
      sRows
    );
    content += `</div>`;
  }

  // ═══════ SECTION 5: COLLECTION LAG & CASH FLOW ANALYSIS ═══════
  if (templateType !== 'financial' && collectionLag.length > 0) {
    content += `<div class="page-break"><h2 style="font-size:18px;color:#165DFF;margin-bottom:16px;">回款滞后与现金流分析</h2>`;

    content += sectionTitle('回款滞后分析');
    const lagRows = collectionLag.map((item: Record<string, unknown>) => {
      const riskLevel = (item.riskLevel as string) || 'low';
      const riskLabel = riskLevel === 'critical' ? '极高风险' : riskLevel === 'high' ? '高风险' : riskLevel === 'medium' ? '中等风险' : '低风险';
      const riskColorStr = (riskLevel === 'critical' || riskLevel === 'high') ? '#F53F3F' : riskLevel === 'medium' ? '#FF7D00' : '#00B42A';
      return [
        (item.projectName as string) || '-',
        fmtW(item.cumulativeOutput as number || 0),
        fmtW(item.cumulativeReceivable as number || 0),
        fmtW(item.cumulativeReceived as number || 0),
        `<span style="color:${riskColorStr}">${fmtW(item.unreceived as number || item.unpaidAmount as number || 0)}</span>`,
        (item.aging as string) || '-',
        `<span style="color:${riskColorStr}">${riskLabel}</span>`,
      ];
    });
    content += simpleTable(
      ['项目名称', '累计产值', '应回款', '已回款', '应收未回', '账龄', '风险等级'],
      lagRows
    );

    content += sectionTitle('经营利润 vs 现金净流对比');
    content += simpleTable(
      ['指标', '经营利润（权责发生制）', '现金净流（收付实现制）', '差异说明'],
      [
        [
          '本月',
          `<span style="color:${(overview.operatingProfit || 0) < 0 ? '#F53F3F' : '#00B42A'}">${fmtW(overview.operatingProfit || 0)}</span>`,
          `<span style="color:${(overview.cashNetFlow || 0) < 0 ? '#F53F3F' : '#00B42A'}">${fmtW(overview.cashNetFlow || 0)}</span>`,
          '<span style="font-size:10px;color:#86909C;">经营利润含未回款产值；现金净流仅含实际收付</span>',
        ],
        [
          '比率',
          `<span style="color:${(overview.operatingProfitRate || 0) < 0 ? '#F53F3F' : '#00B42A'}">${fmtP(overview.operatingProfitRate || 0)}</span>`,
          `<span style="color:${(overview.cashNetFlowRate || 0) < 0 ? '#F53F3F' : '#00B42A'}">${fmtP(overview.cashNetFlowRate || 0)}</span>`,
          '<span style="font-size:10px;color:#86909C;">经营利润率=经营利润/月产值；现金流比率=现金净流/月回款</span>',
        ],
      ]
    );

    if (seasonalNote) {
      content += `<div style="background:#FFF7E8;border:1px solid #FF7D00;border-radius:4px;padding:8px 12px;font-size:11px;color:#4E5969;margin:8px 0;">${seasonalNote}</div>`;
    }

    content += `</div>`;
  }

  // ═══════ SECTION 6: RISK WARNING ═══════
  if (templateType !== 'financial') {
    const lossProjects = (risks.lossProjects || []) as Record<string, unknown>[];
    const costOverIncome = (risks.costOverIncomeProjects || []) as Record<string, unknown>[];
    const lowPayment = (risks.lowPaymentRateProjects || []) as Record<string, unknown>[];
    const highLabor = (risks.highLaborProjects || []) as Record<string, unknown>[];
    const unpaidSalary = (risks.unpaidSalaryProjects || []) as Record<string, unknown>[];
    const pendingVisa = (risks.pendingVisaProjects || []) as Record<string, unknown>[];

    const hasRisk = lossProjects.length > 0 || costOverIncome.length > 0 || lowPayment.length > 0
      || highLabor.length > 0 || unpaidSalary.length > 0 || pendingVisa.length > 0 || Number(risks.expiringCertificates) > 0;

    content += `<div class="page-break"><h2 style="font-size:18px;color:#165DFF;margin-bottom:16px;">风险预警</h2>`;

    if (!hasRisk) {
      content += `<div style="text-align:center;color:#00B42A;font-size:16px;margin:40px 0;">本月无风险预警</div>`;
    } else {
      if (lossProjects.length > 0) {
        content += `<div style="font-size:13px;font-weight:700;color:#F53F3F;margin:12px 0 4px;">亏损项目（${lossProjects.length}个）</div>`;
        lossProjects.forEach((p: Record<string, unknown>) => {
          content += `<div style="font-size:11px;color:#F53F3F;margin:2px 0 2px 16px;">项目"${p.name}"：经营利润 ${fmtW(p.operatingProfit as number || p.profit as number)}，现金净流 ${fmtW(p.cashNetFlow as number || 0)}，经营利润率 ${fmtP(p.operatingProfitRate as number || p.profitRate as number)}</div>`;
        });
      }
      if (costOverIncome.length > 0) {
        content += `<div style="font-size:13px;font-weight:700;color:#F53F3F;margin:12px 0 4px;">成本超收入项目（${costOverIncome.length}个）</div>`;
        costOverIncome.forEach((p: Record<string, unknown>) => {
          content += `<div style="font-size:11px;color:#F53F3F;margin:2px 0 2px 16px;">项目"${p.name}"：成本 ${fmtW(p.cost as number)}，收入 ${fmtW(p.income as number)}</div>`;
        });
      }
      if (lowPayment.length > 0) {
        content += `<div style="font-size:13px;font-weight:700;color:#FF7D00;margin:12px 0 4px;">回款率过低项目（${lowPayment.length}个）</div>`;
        lowPayment.forEach((p: Record<string, unknown>) => {
          content += `<div style="font-size:11px;color:#FF7D00;margin:2px 0 2px 16px;">项目"${p.name}"：回款率 ${fmtP(p.paymentRate as number)}，未回款 ${fmtW(p.unreceived as number)}</div>`;
        });
      }
      if (highLabor.length > 0) {
        content += `<div style="font-size:13px;font-weight:700;color:#FF7D00;margin:12px 0 4px;">人工占比过高项目（${highLabor.length}个）</div>`;
        highLabor.forEach((p: Record<string, unknown>) => {
          content += `<div style="font-size:11px;color:#FF7D00;margin:2px 0 2px 16px;">项目"${p.name}"：人工占比 ${fmtP(p.laborRate as number)}，人工成本 ${fmtW(p.salaryCost as number)}</div>`;
        });
      }
      if (unpaidSalary.length > 0) {
        content += `<div style="font-size:13px;font-weight:700;color:#FF7D00;margin:12px 0 4px;">工资未发放项目（${unpaidSalary.length}个）</div>`;
        unpaidSalary.forEach((p: Record<string, unknown>) => {
          content += `<div style="font-size:11px;color:#FF7D00;margin:2px 0 2px 16px;">项目"${p.name}"：未发工资 ${fmtW(p.unpaidSalary as number)}</div>`;
        });
      }
      if (pendingVisa.length > 0) {
        content += `<div style="font-size:13px;font-weight:700;color:#FF7D00;margin:12px 0 4px;">签证待审批项目（${pendingVisa.length}个）</div>`;
        pendingVisa.forEach((p: Record<string, unknown>) => {
          content += `<div style="font-size:11px;color:#FF7D00;margin:2px 0 2px 16px;">项目"${p.name}"：待审批 ${p.pendingCount} 项</div>`;
        });
      }
      if (Number(risks.expiringCertificates) > 0) {
        content += `<div style="font-size:11px;color:#FF7D00;margin:2px 0 2px 16px;">即将到期/已过期证件：${risks.expiringCertificates} 个</div>`;
      }
    }
    content += `</div>`;
  }

  // ═══════ FINANCIAL VERSION ═══════
  if (templateType === 'financial') {
    content += `<div class="page-break"><h2 style="font-size:18px;color:#165DFF;margin-bottom:16px;">财务核对表</h2>`;

    content += `<div style="font-size:13px;font-weight:700;color:#4E5969;margin:12px 0 4px;">经营利润核对（权责发生制）</div>`;
    const opRows = projects.map((p: Record<string, unknown>) => [
      (p.name as string) || '-',
      fmt(p.monthConfirmedOutput as number || p.monthIncome as number || 0),
      fmt(p.monthApprovedVisa as number || 0),
      fmt(p.monthConfirmedCost as number || p.monthCost as number || 0),
      `<span style="color:${(p.operatingProfit as number || 0) < 0 ? '#F53F3F' : '#00B42A'}">${fmt(p.operatingProfit as number || 0)}</span>`,
      `<span style="color:${(p.operatingProfitRate as number || 0) < 0 ? '#F53F3F' : '#00B42A'}">${fmtP(p.operatingProfitRate as number || 0)}</span>`,
      fmt(p.totalIncome as number || 0),
      fmt(p.cumulativeVisa as number || 0),
    ]);
    content += simpleTable(
      ['项目', '月确认产值', '月审批签证', '月确认成本', '经营利润', '经营利润率', '累计产值', '累计签证'],
      opRows
    );

    content += `<div style="font-size:13px;font-weight:700;color:#4E5969;margin:12px 0 4px;">现金流核对（收付实现制）</div>`;
    const cfRows = projects.map((p: Record<string, unknown>) => [
      (p.name as string) || '-',
      fmt(p.monthReceived as number || 0),
      fmt(p.monthActualPayment as number || 0),
      `<span style="color:${(p.cashNetFlow as number || 0) < 0 ? '#F53F3F' : '#00B42A'}">${fmt(p.cashNetFlow as number || 0)}</span>`,
      fmt(p.totalReceived as number || 0),
      fmt(p.unreceived as number || 0),
      fmt(p.overReceived as number || 0),
      `<span style="color:${(p.paymentRate as number || 0) > 100 ? '#FF7D00' : '#1D2129'}">${fmtP(p.paymentRate as number || 0)}</span>`,
    ]);
    content += simpleTable(
      ['项目', '月实际回款', '月实际支付', '现金净流', '累计已回款', '应收未回', '超收/预收', '回款率'],
      cfRows
    );

    content += `<div style="font-size:13px;font-weight:700;color:#4E5969;margin:12px 0 4px;">成本核对</div>`;
    const costRows = projects.map((p: Record<string, unknown>) => [
      (p.name as string) || '-',
      fmt(p.salaryCost as number || 0),
      fmt(p.supplierCost as number || 0),
      fmt(p.expenseCost as number || 0),
      fmt(p.taxCost as number || 0),
      fmt(p.materialCost as number || 0),
      `<span style="color:#165DFF;font-weight:700;">${fmt(p.totalCost as number || 0)}</span>`,
    ]);
    content += simpleTable(
      ['项目', '人工成本', '供应商成本', '综合费用', '税费', '零星材料', '成本合计'],
      costRows
    );

    // Supplier reconciliation
    if (supplierDetails.length > 0) {
      content += `<div style="font-size:13px;font-weight:700;color:#4E5969;margin:12px 0 4px;">供应商结算与付款核对</div>`;
      const sRows = supplierDetails.map((s: Record<string, unknown>) => {
        const ts = (s.totalSettlement as number) || 0;
        const tp = (s.totalPaid as number) || 0;
        const unpaid = ts - tp;
        return [
          (s.supplierName as string) || '-',
          (s.projectName as string) || '-',
          fmt(s.monthSettlement as number || 0),
          fmt(s.monthPaid as number || 0),
          fmt(ts),
          fmt(tp),
          unpaid > 0 ? `<span style="color:#F53F3F;">${fmt(unpaid)}</span>` : fmt(unpaid),
          (s.paymentRate as number || 0).toFixed(1) + '%',
        ];
      });
      content += simpleTable(
        ['供应商名称', '所属项目', '本月结算', '本月付款', '累计结算', '累计付款', '未付金额', '付款率'],
        sRows
      );
    }
    content += `</div>`;
  }

  // ═══════ DATA CALIBER NOTE ═══════
  content += `<div class="page-break"><h2 style="font-size:18px;color:#165DFF;margin-bottom:16px;">数据口径说明</h2>`;
  content += simpleTable(
    ['指标', '计算口径', '说明'],
    [
      ['月确认产值', '本月已审核甲方报量结算金额（排除已作废）', '权责发生制'],
      ['月审批签证', '本月已审批签证金额', '权责发生制'],
      ['月确认成本', '本月人工+供应商+综合费用+零星材料+税费（排除已作废）', '权责发生制'],
      ['经营利润', '月确认产值 + 月审批签证 - 月确认成本', '反映经营成果'],
      ['经营利润率', '经营利润 / 月确认产值 × 100%', '反映经营效率'],
      ['月实际回款', '本月甲方实际到账金额', '收付实现制'],
      ['月实际支付', '本月供应商付款 + 工资发放 + 综合费用支付', '收付实现制'],
      ['现金净流', '月实际回款 - 月实际支付', '反映资金压力'],
      ['现金流比率', '现金净流 / 月实际回款 × 100%', '反映资金充裕度'],
      ['回款率', '已回款金额 / 应回款金额 × 100%', '累计口径'],
      ['应收未回', 'max(应回款金额 - 已回款金额, 0)', '不允许显示负值'],
      ['超收/预收', 'max(已回款金额 - 应回款金额, 0)', '已回款>应回款时'],
      ['账龄', '按最近报量日期至今天数计算', '0-30天/31-60天/61-90天/90天以上'],
    ]
  );

  content += `
    <div style="text-align:center;color:#C9CDD4;font-size:10px;margin-top:40px;">
      建筑劳务管理系统 · 月度经营月报 · ${reportMonth} · 生成于 ${generatedAt}
    </div>
  </div>`;

  // ═══════ WRAP IN FULL HTML ═══════
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>月度经营月报_${reportMonth}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, "PingFang SC", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif; font-size: 12px; color: #1D2129; background: #fff; line-height: 1.5; }
  .page-break { page-break-before: always; padding: 20px; }
  .page-break:first-child { page-break-before: avoid; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #E5E6EB; padding: 5px 8px; font-size: 11px; text-align: right; }
  th { background: #F0F5FF; color: #165DFF; font-weight: 700; text-align: center; white-space: nowrap; }
  td { white-space: nowrap; }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .page-break { page-break-before: always; padding: 10px; }
    .page-break:first-child { page-break-before: avoid; }
  }
  @media screen {
    .page-break { max-width: 297mm; margin: 0 auto 20px; box-shadow: 0 1px 4px rgba(0,0,0,0.1); border-radius: 4px; }
  }
</style>
</head>
<body>
${content}
</body>
</html>`;
}

function getTemplateLabel(type: string): string {
  const labels: Record<string, string> = {
    summary: '经营汇总版',
    detail: '项目明细版',
    boss: '老板汇报版',
    financial: '财务核对版',
  };
  return labels[type] || type;
}
