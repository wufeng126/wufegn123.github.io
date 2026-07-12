import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { logSecurityEvent } from '@/lib/security-log';

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const reportMonth = searchParams.get('month');
    const projectId = searchParams.get('projectId');
    const section = searchParams.get('section') || 'all';

    if (!reportMonth) {
      return NextResponse.json({ success: false, error: '缺少月份参数' }, { status: 400 });
    }

    // 记录导出安全日志
    const operatorId = request.headers.get('x-user-id');
    await logSecurityEvent({
      event_type: 'export_excel',
      user_id: operatorId ? parseInt(operatorId) : undefined,
      ip_address: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown',
      user_agent: request.headers.get('user-agent') || 'unknown',
      result: 'success',
      details: { month: reportMonth, projectId, section },
    });

    // Fetch monthly summary data from the internal API
    const baseUrl = process.env.DEPLOY_RUN_PORT
      ? `http://localhost:${process.env.DEPLOY_RUN_PORT}`
      : 'https://sxshhy.top';
    const summaryUrl = `${baseUrl}/api/reports/monthly/summary?month=${reportMonth}${projectId && projectId !== 'all' ? `&projectId=${projectId}` : ''}`;

    const summaryRes = await fetch(summaryUrl, {
      headers: { cookie: request.headers.get('cookie') || '' },
    });
    if (!summaryRes.ok) {
      console.error('[Export Excel] Fetch summary failed:', summaryRes.status);
      return NextResponse.json({ success: false, error: '获取月报数据失败' }, { status: 500 });
    }
    const summaryData = await summaryRes.json();
    const summary = summaryData.data || {};

    const wb = XLSX.utils.book_new();
    const overview = summary.overview || {};
    const projects = summary.projects || [];
    const comparisons = summary.comparisons || {};
    const risks = summary.risks || {};
    const allSuppliers = summary.supplierPaymentsBySupplier || [];
    // Filter: hide suppliers with no current-month activity AND fully paid
    const supplierPaymentsBySupplier = allSuppliers.filter((s: Record<string, unknown>) => {
      const ms = (s.monthSettlement as number) || 0;
      const mp = (s.monthPaid as number) || 0;
      const unpaid = (s.totalUnpaid as number) || 0;
      return ms > 0 || mp > 0 || unpaid > 0;
    });
    const collectionLagAnalysis = summary.collectionLagAnalysis || [];

    // Section filter
    const sectionFilter = section || 'all';

    // 1. Overview sheet
    if (sectionFilter === 'all' || sectionFilter === 'overview') {
      const overviewData = [
        ['月度经营月报 - 核心指标', '', '', ''],
        ['报表月份', reportMonth, '', ''],
        ['', '', '', ''],
        ['指标', '当期值', '环比变化(%)', '同比变化(%)'],
        ['项目数量', overview.projectCount || 0, '', ''],
        ['总产值(元)', overview.totalIncome || 0, '', ''],
        ['本月产值(元)', overview.monthIncome || 0, comparisons.mom?.income?.toFixed(1) || '', comparisons.yoy?.income?.toFixed(1) || ''],
        ['已回款(元)', overview.totalReceived || 0, '', ''],
        ['本月回款(元)', overview.monthReceived || 0, comparisons.mom?.received?.toFixed(1) || '', comparisons.yoy?.received?.toFixed(1) || ''],
        ['未回款(元)', overview.unreceived || 0, '', ''],
        ['总成本(元)', overview.totalCost || 0, '', ''],
        ['本月成本(元)', overview.monthCost || 0, comparisons.mom?.cost?.toFixed(1) || '', comparisons.yoy?.cost?.toFixed(1) || ''],
        ['人工成本(元)', overview.totalSalary || 0, comparisons.mom?.salary?.toFixed(1) || '', comparisons.yoy?.salary?.toFixed(1) || ''],
        ['供应商成本(元)', overview.totalSupplierCost || 0, comparisons.mom?.supplierSettlement?.toFixed(1) || '', comparisons.yoy?.supplierSettlement?.toFixed(1) || ''],
        ['供应商已付(元)', overview.cumulativeSupplierPayment || 0, '', ''],
        ['供应商付款率(%)', (overview.supplierPaymentRate || 0).toFixed(1), '', ''],
        ['本月供应商付款(元)', overview.monthSupplierPayments || 0, comparisons.mom?.supplierPayment?.toFixed(1) || '', comparisons.yoy?.supplierPayment?.toFixed(1) || ''],
        ['综合费用(元)', overview.totalExpense || 0, '', ''],
        ['零星材料(元)', overview.totalMaterialCost || 0, '', ''],
        ['税费(元)', overview.totalTaxCost || 0, '', ''],
        ['', '', '', ''],
        ['── 经营利润口径 ──', '', '', ''],
        ['本月确认产值(元)', overview.monthIncome || 0, '', ''],
        ['本月审批签证(元)', overview.monthVisa || 0, '', ''],
        ['本月确认成本(元)', overview.monthCost || 0, '', ''],
        ['经营利润(元)', overview.operatingProfit || 0, comparisons.mom?.operatingProfit?.toFixed(1) || '', comparisons.yoy?.operatingProfit?.toFixed(1) || ''],
        ['经营利润率(%)', (overview.operatingProfitRate || 0).toFixed(1), '', ''],
        ['累计签证(元)', overview.cumulativeVisa || 0, '', ''],
        ['', '', '', ''],
        ['── 现金流口径 ──', '', '', ''],
        ['本月实际回款(元)', overview.monthReceived || 0, '', ''],
        ['本月实际支付(元)', overview.monthActualPayment || 0, '', ''],
        ['现金净流(元)', overview.cashNetFlow || 0, comparisons.mom?.cashNetFlow?.toFixed(1) || '', comparisons.yoy?.cashNetFlow?.toFixed(1) || ''],
        ['现金净流率(%)', (overview.cashNetFlowRate || 0).toFixed(1), '', ''],
        ['', '', '', ''],
        ['累计利润(元)', overview.cumulativeProfit || 0, '', ''],
        ['累计利润率(%)', (overview.cumulativeProfitRate || 0).toFixed(1), '', ''],
        ['回款率(%)', (overview.paymentRate || 0).toFixed(1), '', ''],
        ['在岗人数', overview.inServiceCount || 0, '', ''],
        ['未发工资(元)', overview.totalUnpaidSalary || 0, '', ''],
      ];
      const ws = XLSX.utils.aoa_to_sheet(overviewData);
      ws['!cols'] = [{ wch: 16 }, { wch: 18 }, { wch: 14 }, { wch: 14 }];
      XLSX.utils.book_append_sheet(wb, ws, '核心指标');
    }

    // 2. Project detail sheet
    if ((sectionFilter === 'all' || sectionFilter === 'projects') && projects.length > 0) {
      const projectData = projects.map((p: Record<string, unknown>) => ({
        '项目名称': String(p.name || ''),
        '项目状态': String(p.status || ''),
        '本月确认产值(元)': Number(p.monthConfirmedOutput || 0),
        '本月审批签证(元)': Number(p.monthApprovedVisa || 0),
        '本月确认成本(元)': Number(p.monthConfirmedCost || 0),
        '经营利润(元)': Number(p.operatingProfit || 0),
        '经营利润率(%)': Number(p.operatingProfitRate || 0).toFixed(1),
        '本月回款(元)': Number(p.monthReceived || p.totalReceived || 0),
        '本月实际支付(元)': Number(p.monthActualPayment || 0),
        '现金净流(元)': Number(p.cashNetFlow || 0),
        '现金净流率(%)': Number(p.cashNetFlowRate || 0).toFixed(1),
        '累计签证(元)': Number(p.cumulativeVisa || 0),
        '回款率(%)': Number(p.paymentRate || 0).toFixed(1),
        '在岗人数': Number(p.inServiceCount || 0),
      }));

      // Add totals row
      const totals: Record<string, unknown> = {
        '项目名称': '合计',
        '项目状态': '',
        '本月确认产值(元)': overview.monthIncome,
        '本月审批签证(元)': overview.monthVisa || 0,
        '本月确认成本(元)': overview.monthCost,
        '经营利润(元)': overview.operatingProfit || 0,
        '经营利润率(%)': (overview.operatingProfitRate || 0).toFixed(1),
        '本月回款(元)': overview.monthReceived,
        '本月实际支付(元)': overview.monthActualPayment || 0,
        '现金净流(元)': overview.cashNetFlow || 0,
        '现金净流率(%)': (overview.cashNetFlowRate || 0).toFixed(1),
        '累计签证(元)': overview.cumulativeVisa || 0,
        '回款率(%)': (overview.paymentRate || 0).toFixed(1),
        '在岗人数': overview.inServiceCount,
      };
      projectData.push(totals);

      const ws2 = XLSX.utils.json_to_sheet(projectData);
      ws2['!cols'] = [
        { wch: 16 }, { wch: 10 }, { wch: 14 }, { wch: 14 },
        { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 10 },
        { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
        { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 14 },
      ];
      XLSX.utils.book_append_sheet(wb, ws2, '项目明细');
    }

    // 3. Risk sheet
    if ((sectionFilter === 'all' || sectionFilter === 'risks') && risks) {
      const riskData: Record<string, unknown>[] = [];
      (risks.lossProjects || []).forEach((p: Record<string, unknown>) => {
        riskData.push({ '风险类型': '亏损项目', '项目名称': p.name, '风险详情': `月利润 ${p.profit}，累计利润 ${p.cumulativeProfit}，月利润率 ${p.profitRate}%`, '处理建议': p.suggestion || '' });
      });
      (risks.costOverIncomeProjects || []).forEach((p: Record<string, unknown>) => {
        riskData.push({ '风险类型': '成本超收入', '项目名称': p.name, '风险详情': `成本 ${p.cost} > 收入 ${p.income}`, '处理建议': p.suggestion || '' });
      });
      (risks.lowPaymentRateProjects || []).forEach((p: Record<string, unknown>) => {
        riskData.push({ '风险类型': '回款率低', '项目名称': p.name, '风险详情': `回款率 ${p.paymentRate}%，未回款 ${p.unreceived}`, '处理建议': p.suggestion || '' });
      });
      (risks.unpaidSalaryProjects || []).forEach((p: Record<string, unknown>) => {
        riskData.push({ '风险类型': '未发工资', '项目名称': p.name, '风险详情': `未发工资 ${p.unpaidSalary}`, '处理建议': p.suggestion || '' });
      });

      if (riskData.length > 0) {
        const ws3 = XLSX.utils.json_to_sheet(riskData);
        ws3['!cols'] = [{ wch: 14 }, { wch: 16 }, { wch: 30 }, { wch: 30 }];
        XLSX.utils.book_append_sheet(wb, ws3, '风险预警');
      }
    }

    // 4. Supplier payment detail sheet
    if ((sectionFilter === 'all' || sectionFilter === 'supplier') && supplierPaymentsBySupplier.length > 0) {
      const supplierData = supplierPaymentsBySupplier.map((s: Record<string, unknown>) => ({
        '供应商': String(s.supplierName || ''),
        '结算金额(元)': Number(s.settlementAmount || 0),
        '已付金额(元)': Number(s.paidAmount || 0),
        '未付金额(元)': Number(s.unpaidAmount || 0),
        '付款率(%)': Number(s.paymentRate || 0).toFixed(1),
        '合同数': Number(s.contractCount || 0),
        '结算单数': Number(s.settlementCount || 0),
        '付款单数': Number(s.paymentCount || 0),
      }));

      if (supplierData.length > 0) {
        // Add totals
        supplierData.push({
          '供应商': '合计',
          '结算金额(元)': supplierData.reduce((sum: number, s: Record<string, unknown>) => sum + Number(s['结算金额(元)'] || 0), 0),
          '已付金额(元)': supplierData.reduce((sum: number, s: Record<string, unknown>) => sum + Number(s['已付金额(元)'] || 0), 0),
          '未付金额(元)': supplierData.reduce((sum: number, s: Record<string, unknown>) => sum + Number(s['未付金额(元)'] || 0), 0),
          '付款率(%)': '',
          '合同数': supplierData.reduce((sum: number, s: Record<string, unknown>) => sum + Number(s['合同数'] || 0), 0),
          '结算单数': supplierData.reduce((sum: number, s: Record<string, unknown>) => sum + Number(s['结算单数'] || 0), 0),
          '付款单数': supplierData.reduce((sum: number, s: Record<string, unknown>) => sum + Number(s['付款单数'] || 0), 0),
        });

        const ws4 = XLSX.utils.json_to_sheet(supplierData);
        ws4['!cols'] = [{ wch: 20 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 8 }, { wch: 10 }, { wch: 10 }];
        XLSX.utils.book_append_sheet(wb, ws4, '供应商付款明细');
      }
    }

    // 5. Collection lag analysis sheet
    if ((sectionFilter === 'all' || sectionFilter === 'cashflow') && collectionLagAnalysis.length > 0) {
      const lagData = collectionLagAnalysis.map((item: Record<string, unknown>) => ({
        '项目名称': String(item.projectName || ''),
        '累计确认产值(元)': Number(item.cumulativeOutput || 0),
        '累计应回款(元)': Number(item.cumulativeReceivable || 0),
        '累计已回款(元)': Number(item.cumulativeReceived || 0),
        '应收未回(元)': Number(item.unreceived || 0),
        '是否超收': item.isOverCollected ? '是' : '否',
        '超收金额(元)': Number(item.overCollectedAmount || 0),
        '账龄天数': Number(item.agingDays || 0),
        '账龄分类': String(item.agingCategory || ''),
        '预计回款日期': item.estimatedPaymentDate || '-',
        '责任人': item.responsiblePerson || '-',
        '风险等级': String(item.riskLevel || ''),
      }));

      if (lagData.length > 0) {
        const ws5 = XLSX.utils.json_to_sheet(lagData);
        ws5['!cols'] = [{ wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 8 }, { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 10 }, { wch: 10 }];
        XLSX.utils.book_append_sheet(wb, ws5, '回款滞后分析');
      }
    }

    // Generate buffer
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const base64 = Buffer.from(buf).toString('base64');

    return NextResponse.json({
      success: true,
      data: {
        fileName: `月度经营月报_${reportMonth}_${new Date().toISOString().slice(0, 10)}.xlsx`,
        base64,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
    });
  } catch (error) {
    console.error('[Export Excel] Error:', error);
    return NextResponse.json({ success: false, error: 'Excel导出失败' }, { status: 500 });
  }
}
