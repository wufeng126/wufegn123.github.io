import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import {
  isEffectiveClientPaymentStatus,
  isInactiveClientPaymentStatus,
  isVisaActiveStatus,
  isVisaDoneStatus,
} from '@/lib/business-logic';
import { getGlobalSummary, getProjectFinancialSummary, getTeamSettlementCostAmount } from '@/lib/data-aggregation';
import {
  ProjectData,
  calculateAging,
  formatWan,
  generateConclusion,
  getEmptyOverview,
  getEmptyPayablePlan,
  getEmptyRisks,
  getNextMonthEnd,
  safeSum,
  toNumber,
} from '@/services/monthly-report-summary';
import { requireAuth } from '@/lib/api-auth';

const supabase = getSupabaseClient();

function getVisaAmount(visa: Record<string, unknown>) {
  return Number(visa.visa_amount || visa.amount || 0);
}

function getVisaDate(visa: Record<string, unknown>) {
  return (visa.occurrence_date || visa.visa_date || visa.created_at || '') as string;
}


interface MonthTrend {
  month: string;
  income: number;           // 确认产值
  received: number;         // 实际回款
  cost: number;             // 确认成本
  salary: number;
  profit: number;
  supplierSettlement: number;
  supplierPayment: number;
  actualPayment: number;    // 实际支付 = 工资发放 + 供应商付款
  operatingProfit: number;  // 经营利润 = 产值 + 签证 - 成本
  cashNetFlow: number;      // 现金净流 = 回款 - 实际支付
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface ReceivableLagItem {
  projectName: string;
  cumulativeConfirmedOutput: number;  // 累计确认产值
  cumulativeReceivable: number;       // 累计应回款
  cumulativeReceived: number;         // 累计已回款
  unreceived: number;                 // 应收未回 = max(应回款-已回款, 0)
  overReceived: number;               // 超收/预收 = max(已回款-应回款, 0)
  agingCategory: '0-30天' | '31-60天' | '61-90天' | '90天以上';
  estimatedPaymentDate: string;       // 预计回款时间
  responsible: string;                // 回款责任人
  riskLevel: 'low' | 'medium' | 'high' | 'danger';
}

interface RiskItem {
  project: string;
  riskType: string;
  riskLevel: 'danger' | 'warning' | 'info';
  impactAmount: number;
  reason: string;
  suggestion: string;
  responsible: string;
  deadline: string;
  status: string;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month');
    const projectId = searchParams.get('projectId');

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ success: false, error: '请提供有效的月份参数(YYYY-MM)' }, { status: 400 });
    }

    const [curY, curM] = month.split('-').map(Number);
    const prevDate = new Date(curY, curM - 2, 1);
    const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
    const lastYearMonth = `${curY - 1}-${String(curM).padStart(2, '0')}`;
    const reportMonth = month;
    const monthEndDay = new Date(curY, curM, 0).getDate();
    const reportDateRange = {
      start: `${reportMonth}-01`,
      end: `${reportMonth}-${String(monthEndDay).padStart(2, '0')}`,
    };

    // Get target project IDs
    let targetProjectIds: number[] = [];
    if (projectId && projectId !== 'all') {
      targetProjectIds = projectId.split(',').map(Number).filter(n => !isNaN(n));
    } else {
      const { data: allProjects } = await supabase.from('projects').select('id');
      targetProjectIds = (allProjects || []).map((p: Record<string, unknown>) => p.id as number);
    }

    if (targetProjectIds.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          reportMonth,
          projectScope: projectId || 'all',
          generatedAt: new Date().toISOString(),
          updatedAt: new Date().toLocaleString('zh-CN'),
          statisticsScope: '无项目',
          overview: getEmptyOverview(),
          projects: [],
          risks: getEmptyRisks(),
          riskList: [],
          comparisons: { mom: {}, yoy: {} },
          trends: [],
          costStructure: [],
          payablePlan: getEmptyPayablePlan(),
          laborCostByProject: [],
          supplierSettlementByProject: [],
          businessConclusion: '',
        },
      });
    }

    // Calculate 6-month range for trend salaries
    const sixMonthsAgo = new Date(curY, curM - 6, 1);
    const sixMonthsAgoStr = `${sixMonthsAgo.getFullYear()}-${String(sixMonthsAgo.getMonth() + 1).padStart(2, '0')}`;

    // Fetch all data in parallel
    // Note: we query BOTH old tables (settlements, payments) and new tables
    // (supplier_settlements, supplier_payments) to cover all data sources
    const [
      projectsResult,
      reportsResult,
      paymentsResult,
      settlementsResult,
      oldSettlementsResult,
      supplierPaymentsResult,
      oldPaymentsResult,
      salariesCurrentResult,
      salariesPrevResult,
      salariesLastYearResult,
      salariesTrendResult,
      salaryPaymentsResult,
      expensesResult,
      materialsResult,
      visasResult,
      workersResult,
      certificatesResult,
      supplierContractsResult,
      suppliersResult,
    ] = await Promise.all([
      supabase.from('projects').select('*').in('id', targetProjectIds),
      supabase.from('client_reports').select('*').in('project_id', targetProjectIds).neq('status', 'voided'),
      supabase.from('client_payments').select('*').in('project_id', targetProjectIds),
      supabase.from('supplier_settlements').select('*').neq('status', 'voided'),
      supabase.from('settlements').select('*').in('project_id', targetProjectIds),
      supabase.from('supplier_payments').select('*'),
      supabase.from('payments').select('*').in('project_id', targetProjectIds),
      supabase.from('worker_salaries').select('*').in('project_id', targetProjectIds).eq('year_month', reportMonth),
      supabase.from('worker_salaries').select('*').in('project_id', targetProjectIds).eq('year_month', prevMonth),
      supabase.from('worker_salaries').select('*').in('project_id', targetProjectIds).eq('year_month', lastYearMonth),
      supabase.from('worker_salaries').select('*').in('project_id', targetProjectIds).gte('year_month', sixMonthsAgoStr),
      supabase.from('salary_payments').select('*').in('project_id', targetProjectIds),
      supabase.from('comprehensive_expenses').select('*').in('project_id', targetProjectIds).neq('status', 'voided'),
      supabase.from('miscellaneous_materials').select('*').in('project_id', targetProjectIds).neq('status', 'voided'),
      supabase.from('visas').select('*').in('project_id', targetProjectIds),
      supabase.from('workers').select('project_id, status').in('project_id', targetProjectIds),
      supabase.from('certificates').select('*').lt('expiry_date', new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()),
      supabase.from('supplier_contracts').select('*').in('project_id', targetProjectIds),
      supabase.from('suppliers').select('*'),
    ]);

    const projects = projectsResult.data || [];
    const clientReports = reportsResult.data || [];
    const clientPayments = paymentsResult.data || [];
    const newSettlements = settlementsResult.data || [];
    const oldSettlements = oldSettlementsResult.data || [];
    const newSupplierPayments = supplierPaymentsResult.data || [];
    const oldPayments = oldPaymentsResult.data || [];
    const salariesCurrent = salariesCurrentResult.data || [];
    const salariesPrev = salariesPrevResult.data || [];
    const salariesLastYear = salariesLastYearResult.data || [];
    const salariesTrend = salariesTrendResult.data || [];
    const salaryPayments = salaryPaymentsResult.data || [];
    const expenses = expensesResult.data || [];
    const materials = materialsResult.data || [];
    const visas = visasResult.data || [];
    const workers = workersResult.data || [];
    const certificates = certificatesResult.data || [];
    const supplierContracts = supplierContractsResult.data || [];
    const suppliers = suppliersResult.data || [];

    // Build supplier lookup: contract_id → {project_id, supplier_id, supplier_name}
    // Must be defined before unified merge sections that use getContractInfo
    const supplierMap = new Map<number, { projectId: number; projectName: string; supplierId: number; supplierName: string }>();
    for (const c of supplierContracts) {
      const supplier = suppliers.find((s: Record<string, unknown>) => s.id === c.supplier_id);
      const proj = projects.find((p: Record<string, unknown>) => p.id === c.project_id);
      supplierMap.set(c.id as number, {
        projectId: c.project_id as number,
        projectName: (proj?.name as string) || '未知项目',
        supplierId: c.supplier_id as number,
        supplierName: (supplier?.name as string) || '未知供应商',
      });
    }

    // Helper: get project_id and supplier info for a settlement/payment via contract
    const getContractInfo = (contractId: number | null) => {
      if (!contractId) return { projectId: 0, projectName: '未知项目', supplierId: 0, supplierName: '未知供应商' };
      const info = supplierMap.get(contractId);
      return info || { projectId: 0, projectName: '未知项目', supplierId: 0, supplierName: '未知供应商' };
    };

    // === Merge old + new settlements into unified list ===
    // Old settlements: { supplier_id, project_id, settlement_amount, settlement_date, settlement_type, ... }
    // New settlements: { contract_id, settlement_amount, settlement_date, payable_amount, ... }
    // We normalize both into a common format: { supplierId, projectId, contractId, settlementAmount, payableAmount, settlementDate, source }
    interface UnifiedSettlement {
      supplierId: number;
      projectId: number;
      contractId: number | null;
      settlementAmount: number;
      payableAmount: number;
      settlementDate: string | null;
      settlementMonth: string | null;
      settlementType: string | null;
      source: 'old' | 'new';
      raw: Record<string, unknown>;
    }
    let allSettlements: UnifiedSettlement[] = [];

    // Old settlements (direct supplier_id + project_id)
    for (const s of oldSettlements as Record<string, unknown>[]) {
      const sid = toNumber(s.supplier_id);
      const pid = toNumber(s.project_id);
      if (!sid || !pid || !targetProjectIds.includes(pid)) continue;
      allSettlements.push({
        supplierId: sid,
        projectId: pid,
        contractId: null,
        settlementAmount: Number(s.settlement_amount || 0),
        payableAmount: Number(s.settlement_amount || 0), // old table has no payable_amount, use settlement_amount
        settlementDate: (s.settlement_date as string) || null,
        settlementMonth: (s.settlement_month as string) || null,
        settlementType: (s.settlement_type as string) || null,
        source: 'old',
        raw: s,
      });
    }

    // New settlements (via contract_id → supplier_id + project_id)
    for (const s of newSettlements as Record<string, unknown>[]) {
      const contractId = toNumber(s.contract_id);
      const info = getContractInfo(contractId || null);
      if (!info.projectId || !targetProjectIds.includes(info.projectId)) continue;
      allSettlements.push({
        supplierId: info.supplierId,
        projectId: info.projectId,
        contractId: contractId || null,
        settlementAmount: Number(s.settlement_amount || s.amount || 0),
        payableAmount: Number(s.payable_amount || s.settlement_amount || s.amount || 0),
        settlementDate: (s.settlement_date as string) || (s.created_at as string) || null,
        settlementMonth: null, // new table doesn't have settlement_month
        settlementType: (s.settlement_type as string) || null,
        source: 'new',
        raw: s,
      });
    }

    // === Merge old + new payments into unified list ===
    interface UnifiedPayment {
      supplierId: number;
      projectId: number;
      contractId: number | null;
      paymentAmount: number;
      paymentDate: string | null;
      source: 'old' | 'new';
      raw: Record<string, unknown>;
    }
    let allPayments: UnifiedPayment[] = [];

    // Old payments (direct supplier_id + project_id)
    for (const p of oldPayments as Record<string, unknown>[]) {
      const sid = toNumber(p.supplier_id);
      const pid = toNumber(p.project_id);
      if (!sid || !pid || !targetProjectIds.includes(pid)) continue;
      allPayments.push({
        supplierId: sid,
        projectId: pid,
        contractId: null,
        paymentAmount: Number(p.payment_amount || 0),
        paymentDate: (p.payment_date as string) || null,
        source: 'old',
        raw: p,
      });
    }

    // New supplier payments (via contract_id → supplier_id + project_id)
    for (const p of newSupplierPayments as Record<string, unknown>[]) {
      const contractId = toNumber(p.contract_id);
      const info = getContractInfo(contractId || null);
      // Also check for direct supplier_id / project_id fields
      const directSid = toNumber(p.supplier_id);
      const directPid = toNumber(p.project_id);
      const finalSid = directSid || info.supplierId;
      const finalPid = directPid || info.projectId;
      if (!finalPid || !targetProjectIds.includes(finalPid)) continue;
      allPayments.push({
        supplierId: finalSid,
        projectId: finalPid,
        contractId: contractId || null,
        paymentAmount: Number(p.payment_amount || p.amount || 0),
        paymentDate: (p.payment_date as string) || null,
        source: 'new',
        raw: p,
      });
    }

    // === D4 修复：老表+新表按指纹去重 ===
    // 同一笔结算/付款在迁移或双录入场景下可能两表并存：供应商+项目+金额+日期+类型
    // 完全一致视为同一笔，保留新表记录（含 payable_amount/合同关联），丢弃老表重复项。
    const settlementDedupKeys = new Set<string>();
    for (const s of allSettlements) {
      if (s.source === 'new') {
        settlementDedupKeys.add(
          [s.supplierId, s.projectId, s.settlementAmount, (s.settlementDate || s.settlementMonth || '').trim(), (s.settlementType || '').trim()].join('|')
        );
      }
    }
    allSettlements = allSettlements.filter(
      (s) =>
        s.source === 'new' ||
        !settlementDedupKeys.has([s.supplierId, s.projectId, s.settlementAmount, (s.settlementDate || s.settlementMonth || '').trim(), (s.settlementType || '').trim()].join('|'))
    );

    const paymentDedupKeys = new Set<string>();
    for (const p of allPayments) {
      if (p.source === 'new') {
        paymentDedupKeys.add([p.supplierId, p.projectId, p.paymentAmount, (p.paymentDate || '').trim()].join('|'));
      }
    }
    allPayments = allPayments.filter(
      (p) => p.source === 'new' || !paymentDedupKeys.has([p.supplierId, p.projectId, p.paymentAmount, (p.paymentDate || '').trim()].join('|'))
    );

    const teamSettlementCostByProject = new Map<number, { month: number }>();
    await Promise.all(targetProjectIds.map(async (pid) => {
      const monthAmount = await getTeamSettlementCostAmount(supabase, { projectId: pid, dateRange: reportDateRange });
      teamSettlementCostByProject.set(pid, { month: monthAmount });
    }));

    // Build per-project data
    const projectDataList: ProjectData[] = projects.map((projectRaw: Record<string, unknown>) => {
      const pid = projectRaw.id as number;
      const project = { id: pid, name: projectRaw.name as string, status: projectRaw.status as string };

      const projReports = clientReports.filter((r: Record<string, unknown>) => r.project_id === pid);
      const projPayments = clientPayments.filter((p: Record<string, unknown>) => p.project_id === pid);
      const projSettlements = allSettlements.filter(s => s.projectId === pid);
      const projSupplierPayments = allPayments.filter(p => p.projectId === pid);
      const projSalaries = salariesCurrent.filter((s: Record<string, unknown>) => s.project_id === pid);
      const projSalaryPayments = salaryPayments.filter((sp: Record<string, unknown>) => sp.project_id === pid);
      const projExpenses = expenses.filter((e: Record<string, unknown>) => e.project_id === pid);
      const projMaterials = materials.filter((m: Record<string, unknown>) => m.project_id === pid);
      const projVisas = visas.filter((v: Record<string, unknown>) => v.project_id === pid);
      const projWorkers = workers.filter((w: Record<string, unknown>) => w.project_id === pid);
      const totalSettlement = safeSum(projReports.map((r: Record<string, unknown>) => Number(r.settlement_amount || r.report_amount || 0)));
      const totalVisa = safeSum(projVisas.filter((v: Record<string, unknown>) => isVisaDoneStatus(v.status as string | null)).map(getVisaAmount));
      const totalIncome = totalSettlement + totalVisa;

      const monthReports = projReports.filter((r: Record<string, unknown>) => {
        const d = r.report_date as string;
        return d && d.startsWith(reportMonth);
      });
      const monthIncome = safeSum(monthReports.map((r: Record<string, unknown>) => Number(r.settlement_amount || r.report_amount || 0)));

      const totalReceived = safeSum(projPayments.map((p: Record<string, unknown>) => Number(p.payment_amount || 0)));
      const monthPayments = projPayments.filter((p: Record<string, unknown>) => {
        const d = p.payment_date as string;
        return d && d.startsWith(reportMonth);
      });
      const monthReceived = safeSum(monthPayments.map((p: Record<string, unknown>) => Number(p.payment_amount || 0)));

      const unreceived = Math.max(totalIncome - totalReceived, 0);
      const overReceived = Math.max(totalReceived - totalIncome, 0);
      const paymentRate = totalIncome > 0 ? (totalReceived / totalIncome) * 100 : 0;

      const supplierCost = safeSum(projSettlements.map(s => s.settlementAmount));
      const teamSettlementCost = teamSettlementCostByProject.get(pid)?.month || 0;
      const salaryCost = safeSum(projSalaries.map((s: Record<string, unknown>) => Number(s.gross_pay || 0))) + teamSettlementCost;
      const salaryPaid = safeSum(projSalaryPayments.filter((sp: Record<string, unknown>) => sp.project_id === pid).map((sp: Record<string, unknown>) => Number(sp.payment_amount || 0)));
      const expenseCost = safeSum(projExpenses.map((e: Record<string, unknown>) => Number(e.amount || 0)));
      const materialCost = safeSum(projMaterials.map((m: Record<string, unknown>) => Number(m.amount || 0)));

      // 税费：从 client_reports 的 invoice_amount 和 tax_rate 计算（表无 tax_amount 列）
      const taxCost = safeSum(projReports.map((r: Record<string, unknown>) => {
        const invoiceAmt = Number(r.invoice_amount || 0);
        const taxRate = Number(r.tax_rate || 9);
        if (invoiceAmt > 0 && taxRate > 0) {
          return invoiceAmt * taxRate / (100 + taxRate);
        }
        return 0;
      }));

      const totalCost = supplierCost + salaryCost + expenseCost + taxCost + materialCost;

      // === 月度成本明细 ===
      const monthTeamSettlementCost = teamSettlementCostByProject.get(pid)?.month || 0;
      const monthSalaryCost = safeSum(projSalaries.map((s: Record<string, unknown>) => Number(s.gross_pay || 0))) + monthTeamSettlementCost;

      const monthSupplierSettlement = safeSum(
        projSettlements.filter(s => {
          const d = s.settlementDate;
          return d && d.startsWith(reportMonth);
        }).map(s => s.settlementAmount)
      );

      const monthExpenseCost = safeSum(
        projExpenses.filter((e: Record<string, unknown>) => {
          const d = e.expense_date as string;
          return d && d.startsWith(reportMonth);
        }).map((e: Record<string, unknown>) => Number(e.amount || 0))
      );

      const monthMaterialCost = safeSum(
        projMaterials.filter((m: Record<string, unknown>) => {
          const d = m.purchase_date as string;
          return d && d.startsWith(reportMonth);
        }).map((m: Record<string, unknown>) => Number(m.amount || 0))
      );

      const monthTaxCost = safeSum(monthReports.map((r: Record<string, unknown>) => {
        const invoiceAmt = Number(r.invoice_amount || 0);
        const taxRate = Number(r.tax_rate || 9);
        if (invoiceAmt > 0 && taxRate > 0) {
          return invoiceAmt * taxRate / (100 + taxRate);
        }
        return 0;
      }));

      const monthCost = monthSalaryCost + monthSupplierSettlement + monthExpenseCost + monthTaxCost + monthMaterialCost;

      const monthSupplierPayments = safeSum(
        projSupplierPayments.filter(p => {
          const d = p.paymentDate;
          return d && d.startsWith(reportMonth);
        }).map(p => p.paymentAmount)
      );

      // === 利润与现金流（区分经营利润和现金净流）===
      // 经营利润 = 本月确认产值 + 本月已完成签证 - 本月确认成本（权责发生制）
      const monthVisaIncome = safeSum(projVisas.filter((v: Record<string, unknown>) => {
        const d = getVisaDate(v);
        return d && d.startsWith(reportMonth) && isVisaDoneStatus(v.status as string | null);
      }).map(getVisaAmount));
      const operatingProfit = monthIncome + monthVisaIncome - monthCost;
      const operatingProfitRate = (monthIncome + monthVisaIncome) > 0 ? (operatingProfit / (monthIncome + monthVisaIncome)) * 100 : 0;

      // 现金净流 = 本月实际回款 - 本月实际支付（收付实现制）
      const monthSalaryPayment = safeSum(projSalaries.filter((s: Record<string, unknown>) => s.payment_status === 'paid').map((s: Record<string, unknown>) => Number(s.net_pay || 0)));
      const monthActualPayment = monthSalaryPayment + monthSupplierPayments + monthExpenseCost + monthMaterialCost + monthTaxCost;
      const cashNetFlow = monthReceived - monthActualPayment;
      const cashNetFlowRate = monthReceived > 0 ? (cashNetFlow / monthReceived) * 100 : 0;

      // 累计经营利润
      const cumulativeIncome = totalIncome;
      const cumulativeCost = totalCost;
      const cumulativeProfit = totalIncome - totalCost;
      const cumulativeProfitRate = totalIncome > 0 ? (cumulativeProfit / totalIncome) * 100 : 0;

      const inServiceCount = projWorkers.filter((w: Record<string, unknown>) => w.status === '在场' || !w.status).length;
      const unpaidSalary = safeSum(projSalaries.filter((s: Record<string, unknown>) => s.payment_status === 'unpaid' || s.payment_status === 'partial').map((s: Record<string, unknown>) => Number(s.gross_pay || 0)));
      const unpaidSalaryWorkers = projSalaries.filter((s: Record<string, unknown>) => s.payment_status === 'unpaid' || s.payment_status === 'partial').length;

      // Earliest unpaid month
      const unpaidSalaryMonths = projSalaries
        .filter((s: Record<string, unknown>) => s.payment_status === 'unpaid' || s.payment_status === 'partial')
        .map((s: Record<string, unknown>) => s.year_month as string)
        .filter(Boolean)
        .sort();
      const earliestUnpaidMonth = unpaidSalaryMonths.length > 0 ? unpaidSalaryMonths[0] : null;

      // Supplier payable calculation
      const supplierPayable = safeSum(projSettlements.map(s => s.payableAmount));
      const supplierPaid = safeSum(projSupplierPayments.map(p => p.paymentAmount));
      const supplierUnpaid = Math.max(supplierPayable - supplierPaid, 0);

      return {
        id: pid,
        name: project.name,
        status: project.status,
        contractAmount: Number(projectRaw.contract_amount || 0),
        totalIncome, monthIncome, totalReceived, monthReceived,
        unreceived, overReceived, paymentRate,
        supplierCost, salaryCost, salaryPaid, unpaidSalary,
        expenseCost, materialCost, taxCost, totalCost,
        monthSalaryCost, monthSupplierSettlement, monthExpenseCost,
        monthMaterialCost, monthTaxCost, monthCost, monthSupplierPayments,
        profit: monthIncome - monthCost,
        profitRate: monthIncome > 0 ? ((monthIncome - monthCost) / monthIncome) * 100 : 0,
        monthConfirmedOutput: monthIncome, monthApprovedVisa: monthVisaIncome, monthConfirmedCost: monthCost,
        operatingProfit, operatingProfitRate, cashNetFlow, cashNetFlowRate,
        monthActualPayment,
        totalVisa: totalVisa, monthVisa: monthVisaIncome, cumulativeVisa: totalVisa,
        cumulativeIncome, cumulativeCost, cumulativeProfit, cumulativeProfitRate,
        inServiceCount,
        visaCount: projVisas.length,
        pendingVisaCount: projVisas.filter((v: Record<string, unknown>) => isVisaActiveStatus(v.status as string | null)).length,
        supplierPayable, supplierPaid, supplierUnpaid,
        salaryPayable: salaryCost,
        salaryUnpaid: unpaidSalary,
        unpaidSalaryWorkers,
        earliestUnpaidMonth,
        cumulativeSupplierSettlement: supplierCost,
        cumulativeSupplierPayment: supplierPaid,
        supplierPaymentRate: supplierPayable > 0 ? (supplierPaid / supplierPayable) * 100 : 0,
      };
    });

    // Overview totals
    const overview = {
      projectCount: projects.length,
      totalIncome: safeSum(projectDataList.map(p => p.totalIncome)),
      monthIncome: safeSum(projectDataList.map(p => p.monthIncome)),
      totalReceived: safeSum(projectDataList.map(p => p.totalReceived)),
      monthReceived: safeSum(projectDataList.map(p => p.monthReceived)),
      totalCost: safeSum(projectDataList.map(p => p.totalCost)),
      monthCost: safeSum(projectDataList.map(p => p.monthCost)),
      totalSalary: safeSum(projectDataList.map(p => p.salaryCost)),
      monthSalaryCost: safeSum(projectDataList.map(p => p.monthSalaryCost)),
      totalSupplierCost: safeSum(projectDataList.map(p => p.supplierCost)),
      monthSupplierSettlement: safeSum(projectDataList.map(p => p.monthSupplierSettlement)),
      totalExpense: safeSum(projectDataList.map(p => p.expenseCost)),
      monthExpenseCost: safeSum(projectDataList.map(p => p.monthExpenseCost)),
      totalMaterialCost: safeSum(projectDataList.map(p => p.materialCost)),
      monthMaterialCost: safeSum(projectDataList.map(p => p.monthMaterialCost)),
      totalTaxCost: safeSum(projectDataList.map(p => p.taxCost)),
      monthTaxCost: safeSum(projectDataList.map(p => p.monthTaxCost)),
      profit: safeSum(projectDataList.map(p => p.profit)),
      profitRate: 0,
      cumulativeIncome: safeSum(projectDataList.map(p => p.cumulativeIncome)),
      cumulativeCost: safeSum(projectDataList.map(p => p.cumulativeCost)),
      cumulativeProfit: safeSum(projectDataList.map(p => p.cumulativeProfit)),
      cumulativeProfitRate: 0,
      unreceived: safeSum(projectDataList.map(p => p.unreceived)),
      overReceived: safeSum(projectDataList.map(p => p.overReceived)),
      paymentRate: 0,
      inServiceCount: safeSum(projectDataList.map(p => p.inServiceCount)),
      totalSalaryPaid: safeSum(projectDataList.map(p => p.salaryPaid)),
      totalUnpaidSalary: safeSum(projectDataList.map(p => p.unpaidSalary)),
      // New payable fields
      totalSupplierPayable: safeSum(projectDataList.map(p => p.supplierPayable)),
      totalSupplierPaid: safeSum(projectDataList.map(p => p.supplierPaid)),
      totalSupplierUnpaid: safeSum(projectDataList.map(p => p.supplierUnpaid)),
      monthSupplierPayments: safeSum(projectDataList.map(p => p.monthSupplierPayments)),
      cumulativeSupplierSettlement: safeSum(projectDataList.map(p => p.cumulativeSupplierSettlement)),
      cumulativeSupplierPayment: safeSum(projectDataList.map(p => p.cumulativeSupplierPayment)),
      supplierPaymentRate: 0,
      // 新口径：经营利润与现金净流
      monthConfirmedOutput: safeSum(projectDataList.map(p => p.monthIncome)), // 本月确认产值
      monthVisaIncome: safeSum(projectDataList.map(p => p.monthApprovedVisa)), // 本月已完成签证
      monthConfirmedCost: safeSum(projectDataList.map(p => p.monthCost)), // 本月确认成本
      monthActualReceived: safeSum(projectDataList.map(p => p.monthReceived)), // 本月实际回款
      monthActualPayment: safeSum(projectDataList.map(p => p.monthActualPayment)), // 本月实际支付
      operatingProfit: safeSum(projectDataList.map(p => p.operatingProfit)), // 经营利润
      operatingProfitRate: 0,
      cashNetFlow: safeSum(projectDataList.map(p => p.cashNetFlow)), // 现金净流
      cashNetFlowRate: 0,
      totalVisa: safeSum(projectDataList.map(p => p.totalVisa)),
      monthVisa: safeSum(projectDataList.map(p => p.monthVisa)),
      cumulativeVisa: safeSum(projectDataList.map(p => p.cumulativeVisa)),
    };
    // 旧利润率（保留兼容）
    overview.profitRate = overview.monthIncome > 0 ? (overview.profit / overview.monthIncome) * 100 : 0;
    overview.cumulativeProfitRate = overview.cumulativeIncome > 0 ? (overview.cumulativeProfit / overview.cumulativeIncome) * 100 : 0;
    overview.paymentRate = overview.totalIncome > 0 ? (overview.totalReceived / overview.totalIncome) * 100 : 0;
    overview.supplierPaymentRate = overview.totalSupplierPayable > 0 ? (overview.totalSupplierPaid / overview.totalSupplierPayable) * 100 : 0;
    // 新口径比率
    overview.operatingProfitRate = overview.monthConfirmedOutput > 0 ? (overview.operatingProfit / overview.monthConfirmedOutput) * 100 : 0;
    overview.cashNetFlowRate = overview.monthActualReceived > 0 ? (overview.cashNetFlow / overview.monthActualReceived) * 100 : 0;

    // === Payable Plan ===
    const payablePlan = {
      totalPayable: overview.totalUnpaidSalary + overview.totalSupplierUnpaid,
      laborPayable: overview.totalSalary,
      laborPaid: overview.totalSalaryPaid,
      laborUnpaid: overview.totalUnpaidSalary,
      supplierPayable: overview.totalSupplierPayable,
      supplierPaid: overview.totalSupplierPaid,
      supplierUnpaid: overview.totalSupplierUnpaid,
      fundGap: Math.max((overview.totalUnpaidSalary + overview.totalSupplierUnpaid) - overview.monthReceived, 0),
      monthAvailable: overview.monthReceived,
    };

    // === Labor Cost by Project ===
    const laborCostByProject = projectDataList.map(p => ({
      projectId: p.id,
      projectName: p.name,
      month: reportMonth,
      inServiceCount: p.inServiceCount,
      salaryPayable: p.salaryPayable,
      salaryPaid: p.salaryPaid,
      salaryUnpaid: p.salaryUnpaid,
      unpaidWorkers: p.unpaidSalaryWorkers,
      earliestUnpaidMonth: p.earliestUnpaidMonth,
      riskLevel: p.salaryUnpaid > 0 ? (p.earliestUnpaidMonth && p.earliestUnpaidMonth < reportMonth ? 'danger' : 'warning') : 'normal' as string,
    }));

    // === Supplier Settlement by Project ===
    const supplierSettlementByProject: Array<{
      projectId: number; projectName: string; supplierName: string; contractName: string;
      totalSettlement: number; monthSettlement: number; payable: number; paid: number;
      unpaid: number; paymentRate: number; aging: string; riskLevel: string;
    }> = [];
    for (const settlement of allSettlements) {
      const pid = settlement.projectId;
      if (!pid || !targetProjectIds.includes(pid)) continue;
      const proj = projectDataList.find(p => p.id === pid);
      if (!proj) continue;
      const supplier = suppliers.find((s: Record<string, unknown>) => toNumber(s.id) === settlement.supplierId);
      const contract = settlement.contractId ? supplierContracts.find((c: Record<string, unknown>) => toNumber(c.id) === settlement.contractId) as Record<string, unknown> | undefined : undefined;

      // Find payments matching this supplier+project (or contract if available)
      const projSupPaid = safeSum(
        allPayments
          .filter(p => {
            if (settlement.contractId && p.contractId === settlement.contractId) return true;
            return p.supplierId === settlement.supplierId && p.projectId === pid;
          })
          .map(p => p.paymentAmount)
      );
      const settleAmount = settlement.settlementAmount;
      const payable = settlement.payableAmount;
      const unpaid = Math.max(payable - projSupPaid, 0);
      const settlementDate = settlement.settlementDate;
      const aging = settlementDate ? calculateAging(settlementDate) : '-';

      supplierSettlementByProject.push({
        projectId: pid,
        projectName: proj.name,
        supplierName: (supplier?.name as string) || '-',
        contractName: (contract?.contract_name as string) || '-',
        totalSettlement: settleAmount,
        monthSettlement: settlementDate && settlementDate.startsWith(reportMonth) ? settleAmount : 0,
        payable,
        paid: projSupPaid,
        unpaid,
        paymentRate: payable > 0 ? (projSupPaid / payable) * 100 : 0,
        aging,
        riskLevel: unpaid > 0 ? (aging !== '-' && parseInt(aging) > 60 ? 'danger' : 'warning') : 'normal',
      });
    }

    // === Supplier Payments by Supplier+Project (showing per-supplier per-project monthly detail) ===
    const supplierPaymentsBySupplier: Array<{
      supplierId: number; supplierName: string; projectId: number; projectName: string;
      contractCount: number; totalSettlement: number; totalPayable: number;
      totalPaid: number; totalUnpaid: number; paymentRate: number;
      monthSettlement: number; monthPaid: number;
    }> = [];
    // Group settlements by supplier+project using unified data
    const settlementGroupKey = (sid: number, pid: number) => `${sid}_${pid}`;
    const settlementGroups = new Map<string, { supplierName: string; projectName: string; settlements: UnifiedSettlement[] }>();
    for (const settlement of allSettlements) {
      const supplier = suppliers.find((s: Record<string, unknown>) => toNumber(s.id) === settlement.supplierId);
      const proj = projects.find((p: Record<string, unknown>) => toNumber(p.id) === settlement.projectId);
      const key = settlementGroupKey(settlement.supplierId, settlement.projectId);
      if (!settlementGroups.has(key)) {
        settlementGroups.set(key, {
          supplierName: (supplier?.name as string) || '未知供应商',
          projectName: (proj?.name as string) || '未知项目',
          settlements: [],
        });
      }
      settlementGroups.get(key)!.settlements.push(settlement);
    }
    // Group contracts by supplier+project for count
    const contractGroupCounts = new Map<string, number>();
    for (const c of supplierContracts) {
      if (!targetProjectIds.includes(c.project_id as number)) continue;
      const key = settlementGroupKey(c.supplier_id as number, c.project_id as number);
      contractGroupCounts.set(key, (contractGroupCounts.get(key) || 0) + 1);
    }
    // Build supplier+project entries from ALL contracts (not just those with settlements)
    const allSupplierProjectKeys = new Set<string>();
    for (const c of supplierContracts) {
      if (!targetProjectIds.includes(c.project_id as number)) continue;
      const key = settlementGroupKey(c.supplier_id as number, c.project_id as number);
      allSupplierProjectKeys.add(key);
      // Ensure settlementGroups has an entry even if no settlements exist
      if (!settlementGroups.has(key)) {
        const supplier = suppliers.find((s: Record<string, unknown>) => toNumber(s.id) === c.supplier_id);
        const proj = projects.find((p: Record<string, unknown>) => toNumber(p.id) === c.project_id);
        settlementGroups.set(key, {
          supplierName: (supplier?.name as string) || '未知供应商',
          projectName: (proj?.name as string) || '未知项目',
          settlements: [],
        });
      }
    }
    for (const [key, { supplierName, projectName, settlements: supSettlements }] of settlementGroups) {
      const parts = key.split('_');
      const supplierId = Number(parts[0]);
      const projectId = Number(parts[1]);

      // 结算金额：仅从结算单汇总
      const totalSettlement = safeSum(supSettlements.map(s => s.settlementAmount));
      const totalPayable = safeSum(supSettlements.map(s => s.payableAmount));

      // 付款金额：直接按 supplier_id + project_id 匹配
      const projSupplierPayments = allPayments.filter(p => p.supplierId === supplierId && p.projectId === projectId);

      const totalPaid = safeSum(projSupplierPayments.map(p => p.paymentAmount));
      const monthSettlement = safeSum(
        supSettlements.filter(s => {
          const d = s.settlementDate;
          return d && d.startsWith(reportMonth);
        }).map(s => s.settlementAmount)
      );
      const monthPaid = safeSum(
        projSupplierPayments.filter(p => {
          const d = p.paymentDate;
          return d && d.startsWith(reportMonth);
        }).map(p => p.paymentAmount)
      );
      supplierPaymentsBySupplier.push({
        supplierId, supplierName, projectId, projectName,
        contractCount: contractGroupCounts.get(key) || 0,
        totalSettlement, totalPayable, totalPaid,
        totalUnpaid: Math.max(totalPayable - totalPaid, 0),
        paymentRate: totalPayable > 0 ? (totalPaid / totalPayable) * 100 : 0,
        monthSettlement, monthPaid,
      });
    }
    // Sort by monthSettlement + monthPaid desc (most active this month first)
    supplierPaymentsBySupplier.sort((a, b) => (b.monthSettlement + b.monthPaid) - (a.monthSettlement + a.monthPaid));

    // === Collection Lag Analysis (回款滞后分析) ===
    interface CollectionLagItem {
      projectId: number;
      projectName: string;
      cumulativeConfirmedValue: number;  // 累计确认产值
      cumulativeReceivable: number;      // 累计应回款
      cumulativeReceived: number;        // 累计已回款
      unreceived: number;                // 应收未回 (= max(应回款 - 已回款, 0))
      isOverReceived: boolean;           // 是否超收/预收
      overReceivedAmount: number;        // 超收/预收金额
      aging: string;                     // 账龄
      estimatedCollectionDate: string;   // 预计回款时间
      responsiblePerson: string;         // 回款责任人
      riskLevel: 'low' | 'medium' | 'high'; // 回款风险等级
    }
    const collectionLagAnalysis: CollectionLagItem[] = [];
    // 账龄分布统计
    const agingDistribution = { '0-30天': 0, '31-60天': 0, '61-90天': 0, '90天以上': 0 };
    // 回款季节性说明
    const collectionSeasonality: string[] = [];

    for (const project of projects) {
      const pid = project.id;
      const projReports = clientReports.filter((r: Record<string, unknown>) => toNumber(r.project_id) === pid && r.status !== 'voided');
      const projPayments = clientPayments.filter((p: Record<string, unknown>) => toNumber(p.project_id) === pid && !isInactiveClientPaymentStatus(p.status as string | null));
      const projVisas = visas.filter((v: Record<string, unknown>) => toNumber(v.project_id) === pid && isVisaDoneStatus(v.status as string | null));

      const cumulativeConfirmed = safeSum(projReports.map((r: Record<string, unknown>) => Number(r.settlement_amount || r.report_amount || 0)));
      const cumulativeVisa = safeSum(projVisas.map(getVisaAmount));
      const cumulativeReceivable = cumulativeConfirmed + cumulativeVisa;
      const cumulativeReceived = safeSum(projPayments.filter((p: Record<string, unknown>) => isEffectiveClientPaymentStatus(p.status as string | null)).map((p: Record<string, unknown>) => Number(p.payment_amount || 0)));

      if (cumulativeReceivable <= 0 && cumulativeReceived <= 0) continue; // 无回款数据的项目跳过

      const rawUnreceived = cumulativeReceivable - cumulativeReceived;
      const isOverReceived = rawUnreceived < 0;
      const unreceived = Math.max(rawUnreceived, 0);
      const overReceivedAmount = isOverReceived ? Math.abs(rawUnreceived) : 0;

      // 计算账龄：从最近一次报量日期到今天的天数
      const latestReportDate = projReports
        .map((r: Record<string, unknown>) => r.report_date as string || r.created_at as string)
        .filter(Boolean)
        .sort()
        .pop();
      const agingDays = latestReportDate ? Math.floor((Date.now() - new Date(latestReportDate).getTime()) / 86400000) : 0;
      let aging: string;
      if (agingDays <= 30) aging = '0-30天';
      else if (agingDays <= 60) aging = '31-60天';
      else if (agingDays <= 90) aging = '61-90天';
      else aging = '90天以上';
      agingDistribution[aging as keyof typeof agingDistribution] += unreceived;

      // 预计回款时间：根据账龄推算
      let estimatedDate = '-';
      if (unreceived > 0) {
        const now = new Date();
        if (agingDays <= 30) estimatedDate = `${now.getFullYear()}-${String(now.getMonth() + 2).padStart(2, '0')}-15`;
        else if (agingDays <= 60) estimatedDate = `${now.getFullYear()}-${String(now.getMonth() + 3).padStart(2, '0')}-15`;
        else if (agingDays <= 90) estimatedDate = `${now.getFullYear()}-${String(now.getMonth() + 4).padStart(2, '0')}-15`;
        else estimatedDate = '待确认';
      }

      // 回款责任人：项目经理（从项目信息获取）
      const responsiblePerson = (project.manager_name as string) || (project.project_manager as string) || '-';

      // 风险等级
      let riskLevel: 'low' | 'medium' | 'high';
      const receivedRate = cumulativeReceivable > 0 ? (cumulativeReceived / cumulativeReceivable) * 100 : 100;
      if (agingDays > 90 || receivedRate < 30) riskLevel = 'high';
      else if (agingDays > 60 || receivedRate < 60) riskLevel = 'medium';
      else riskLevel = 'low';

      collectionLagAnalysis.push({
        projectId: pid, projectName: project.name as string,
        cumulativeConfirmedValue: cumulativeConfirmed,
        cumulativeReceivable, cumulativeReceived,
        unreceived, isOverReceived, overReceivedAmount,
        aging, estimatedCollectionDate: estimatedDate,
        responsiblePerson, riskLevel,
      });
    }
    // 按未回金额降序
    collectionLagAnalysis.sort((a, b) => b.unreceived - a.unreceived);

    // 回款季节性说明
    const currentMonth = parseInt(reportMonth.split('-')[1], 10);
    if (currentMonth === 1 || currentMonth === 2) {
      collectionSeasonality.push('年初为建筑行业传统淡季，甲方资金审批流程较慢，回款通常延后至3-4月，属正常季节性波动。');
    } else if (currentMonth === 6 || currentMonth === 7) {
      collectionSeasonality.push('年中为甲方半年度结算期，部分款项可能在6月底至7月集中回款，单月回款波动属正常现象。');
    } else if (currentMonth === 12 || currentMonth === 1) {
      collectionSeasonality.push('年末为建筑行业集中结算回款期，12月至次年1月通常出现回款高峰，需关注年底资金压力。');
    } else if (currentMonth === 9 || currentMonth === 10) {
      collectionSeasonality.push('国庆假期前后甲方审批流程放缓，10月回款可能延后至11月，注意资金安排。');
    }
    // 补充：如果回款季节性说明为空，添加通用提示
    if (collectionSeasonality.length === 0) {
      const reportMonthNum = parseInt(reportMonth.split('-')[1], 10);
      if (reportMonthNum >= 11 || reportMonthNum <= 2) {
        collectionSeasonality.push('当前处于年末/年初集中回款期，回款波动属行业正常现象。');
      } else if (reportMonthNum >= 6 && reportMonthNum <= 8) {
        collectionSeasonality.push('当前处于年中回款低谷期，部分甲方可能延迟至下半年集中付款。');
      } else {
        collectionSeasonality.push('回款节奏正常，建议持续跟进甲方付款进度。');
      }
    }

    // === Comparisons: MoM and YoY ===
    const prevMonthTeamSettlement = await getTeamSettlementCostAmount(supabase, {
      projectIds: targetProjectIds,
      yearMonthStart: prevMonth,
      yearMonthEnd: prevMonth,
    });
    const prevMonthSalary = safeSum(salariesPrev.map((s: Record<string, unknown>) => Number(s.gross_pay || 0))) + prevMonthTeamSettlement;
    const prevMonthIncome = safeSum(
      clientReports.filter((r: Record<string, unknown>) => {
        const d = r.report_date as string;
        return d && d.startsWith(prevMonth);
      }).map((r: Record<string, unknown>) => Number(r.settlement_amount || r.report_amount || 0))
    );
    const prevMonthReceived = safeSum(
      clientPayments.filter((p: Record<string, unknown>) => {
        const d = p.payment_date as string;
        return d && d.startsWith(prevMonth);
      }).map((p: Record<string, unknown>) => Number(p.payment_amount || 0))
    );
    const prevMonthCost = safeSum(
      expenses.filter((e: Record<string, unknown>) => {
        const d = e.expense_date as string;
        return d && d.startsWith(prevMonth);
      }).map((e: Record<string, unknown>) => Number(e.amount || 0))
    ) + safeSum(
      materials.filter((m: Record<string, unknown>) => {
        const d = m.purchase_date as string;
        return d && (m.purchase_date as string).startsWith(prevMonth);
      }).map((m: Record<string, unknown>) => Number(m.amount || 0))
    ) + prevMonthSalary + safeSum(
      allSettlements.filter((s) => {
        const d = s.settlementDate || '';
        return d.startsWith(prevMonth) && targetProjectIds.includes(s.projectId);
      }).map((s) => s.settlementAmount)
    );
    const prevMonthSupplierSettlement = safeSum(
      allSettlements.filter((s) => {
        const d = s.settlementDate || '';
        return d.startsWith(prevMonth) && targetProjectIds.includes(s.projectId);
      }).map((s) => s.settlementAmount)
    );
    const prevMonthSupplierPayment = safeSum(
      allPayments.filter((p) => {
        const d = p.paymentDate || '';
        return d.startsWith(prevMonth) && targetProjectIds.includes(p.projectId);
      }).map((p) => p.paymentAmount)
    );

    const lastYearTeamSettlement = await getTeamSettlementCostAmount(supabase, {
      projectIds: targetProjectIds,
      yearMonthStart: lastYearMonth,
      yearMonthEnd: lastYearMonth,
    });
    const lastYearSalary = safeSum(salariesLastYear.map((s: Record<string, unknown>) => Number(s.gross_pay || 0))) + lastYearTeamSettlement;
    const lastYearIncome = safeSum(
      clientReports.filter((r: Record<string, unknown>) => {
        const d = r.report_date as string;
        return d && d.startsWith(lastYearMonth);
      }).map((r: Record<string, unknown>) => Number(r.settlement_amount || r.report_amount || 0))
    );
    const lastYearReceived = safeSum(
      clientPayments.filter((p: Record<string, unknown>) => {
        const d = p.payment_date as string;
        return d && d.startsWith(lastYearMonth);
      }).map((p: Record<string, unknown>) => Number(p.payment_amount || 0))
    );
    const lastYearCost = safeSum(
      expenses.filter((e: Record<string, unknown>) => {
        const d = e.expense_date as string;
        return d && d.startsWith(lastYearMonth);
      }).map((e: Record<string, unknown>) => Number(e.amount || 0))
    ) + safeSum(
      materials.filter((m: Record<string, unknown>) => {
        const d = m.purchase_date as string;
        return d && d.startsWith(lastYearMonth);
      }).map((m: Record<string, unknown>) => Number(m.amount || 0))
    ) + lastYearSalary + safeSum(
      allSettlements.filter((s) => {
        const d = s.settlementDate || '';
        return d.startsWith(lastYearMonth) && targetProjectIds.includes(s.projectId);
      }).map((s) => s.settlementAmount)
    );
    const lastYearSupplierSettlement = safeSum(
      allSettlements.filter((s) => {
        const d = s.settlementDate || '';
        return d.startsWith(lastYearMonth) && targetProjectIds.includes(s.projectId);
      }).map((s) => s.settlementAmount)
    );
    const lastYearSupplierPayment = safeSum(
      allPayments.filter((p) => {
        const d = p.paymentDate || '';
        return d.startsWith(lastYearMonth) && targetProjectIds.includes(p.projectId);
      }).map((p) => p.paymentAmount)
    );

    const calcChange = (current: number, previous: number) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return ((current - previous) / previous) * 100;
    };
    const calcChangeAmount = (current: number, previous: number) => current - previous;

    const comparisons = {
      mom: {
        income: calcChange(overview.monthIncome, prevMonthIncome),
        incomeAmount: calcChangeAmount(overview.monthIncome, prevMonthIncome),
        received: calcChange(overview.monthReceived, prevMonthReceived),
        receivedAmount: calcChangeAmount(overview.monthReceived, prevMonthReceived),
        cost: calcChange(overview.monthCost, prevMonthCost),
        costAmount: calcChangeAmount(overview.monthCost, prevMonthCost),
        profit: calcChange(overview.profit, prevMonthIncome - prevMonthCost),
        profitAmount: calcChangeAmount(overview.profit, prevMonthIncome - prevMonthCost),
        salary: calcChange(overview.monthSalaryCost, prevMonthSalary),
        salaryAmount: calcChangeAmount(overview.monthSalaryCost, prevMonthSalary),
        supplierSettlement: calcChange(overview.monthSupplierSettlement, prevMonthSupplierSettlement),
        supplierSettlementAmount: calcChangeAmount(overview.monthSupplierSettlement, prevMonthSupplierSettlement),
        supplierPayment: calcChange(overview.monthSupplierPayments, prevMonthSupplierPayment),
        supplierPaymentAmount: calcChangeAmount(overview.monthSupplierPayments, prevMonthSupplierPayment),
        prevMonthIncome,
        prevMonthReceived,
        prevMonthCost,
        prevMonthSalary,
        prevMonthSupplierSettlement,
        prevMonthSupplierPayment,
      },
      yoy: {
        income: calcChange(overview.monthIncome, lastYearIncome),
        incomeAmount: calcChangeAmount(overview.monthIncome, lastYearIncome),
        received: calcChange(overview.monthReceived, lastYearReceived),
        receivedAmount: calcChangeAmount(overview.monthReceived, lastYearReceived),
        cost: calcChange(overview.monthCost, lastYearCost),
        costAmount: calcChangeAmount(overview.monthCost, lastYearCost),
        salary: calcChange(overview.monthSalaryCost, lastYearSalary),
        salaryAmount: calcChangeAmount(overview.monthSalaryCost, lastYearSalary),
        supplierSettlement: calcChange(overview.monthSupplierSettlement, lastYearSupplierSettlement),
        supplierSettlementAmount: calcChangeAmount(overview.monthSupplierSettlement, lastYearSupplierSettlement),
        supplierPayment: calcChange(overview.monthSupplierPayments, lastYearSupplierPayment),
        supplierPaymentAmount: calcChangeAmount(overview.monthSupplierPayments, lastYearSupplierPayment),
        lastYearIncome,
        lastYearReceived,
        lastYearCost,
        lastYearSalary,
        lastYearSupplierSettlement,
        lastYearSupplierPayment,
      },
    };

    // === 6-month trend ===
    const trends: MonthTrend[] = [];
    for (let i = 5; i >= 0; i--) {
      const trendDate = new Date(curY, curM - 1 - i, 1);
      const trendMonth = `${trendDate.getFullYear()}-${String(trendDate.getMonth() + 1).padStart(2, '0')}`;
      const trendIncome = safeSum(
        clientReports.filter((r: Record<string, unknown>) => {
          const d = r.report_date as string;
          return d && d.startsWith(trendMonth);
        }).map((r: Record<string, unknown>) => Number(r.settlement_amount || r.report_amount || 0))
      );
      const trendReceived = safeSum(
        clientPayments.filter((p: Record<string, unknown>) => {
          const d = p.payment_date as string;
          return d && d.startsWith(trendMonth);
        }).map((p: Record<string, unknown>) => Number(p.payment_amount || 0))
      );
      const trendTeamSettlement = await getTeamSettlementCostAmount(supabase, {
        projectIds: targetProjectIds,
        yearMonthStart: trendMonth,
        yearMonthEnd: trendMonth,
      });
      const trendSalary = safeSum(
        salariesTrend.filter((s: Record<string, unknown>) => {
          return (s.year_month as string) === trendMonth;
        }).map((s: Record<string, unknown>) => Number(s.gross_pay || 0))
      ) + trendTeamSettlement;
      trends.push({ month: trendMonth, income: trendIncome, received: trendReceived, cost: 0, salary: trendSalary, profit: 0, supplierSettlement: 0, supplierPayment: 0, actualPayment: 0, operatingProfit: 0, cashNetFlow: 0 });
    }
    for (const trend of trends) {
      const monthExpenses = safeSum(
        expenses.filter((e: Record<string, unknown>) => (e.expense_date as string || '').startsWith(trend.month)).map((e: Record<string, unknown>) => Number(e.amount || 0))
      );
      const monthMaterials = safeSum(
        materials.filter((m: Record<string, unknown>) => (m.purchase_date as string || '').startsWith(trend.month)).map((m: Record<string, unknown>) => Number(m.amount || 0))
      );
      const monthSupplierSettlement = safeSum(
        allSettlements.filter((s) => {
          const d = s.settlementDate || '';
          return d.startsWith(trend.month) && targetProjectIds.includes(s.projectId);
        }).map((s) => s.settlementAmount)
      );
      const monthSupplierPayment = safeSum(
        allPayments.filter((p) => {
          const d = p.paymentDate || '';
          return d.startsWith(trend.month) && targetProjectIds.includes(p.projectId);
        }).map((p) => p.paymentAmount)
      );
      trend.supplierSettlement = monthSupplierSettlement;
      trend.supplierPayment = monthSupplierPayment;
      trend.cost = trend.salary + monthExpenses + monthMaterials + monthSupplierSettlement;
      trend.actualPayment = trend.salary + monthSupplierPayment + monthExpenses + monthMaterials; // 实际支付 = 工资发放 + 供应商付款 + 综合费用 + 零星材料
      trend.operatingProfit = trend.income - trend.cost; // 经营利润 = 确认产值 - 确认成本
      trend.cashNetFlow = trend.received - trend.actualPayment; // 现金净流 = 实际回款 - 实际支付
      trend.profit = trend.operatingProfit; // 兼容旧字段
    }

    // === Risk List ===
    const riskList: RiskItem[] = [];

    // Loss projects (monthly)
    for (const p of projectDataList.filter(p => p.profit < 0)) {
      riskList.push({
        project: p.name, riskType: '本月亏损', riskLevel: 'danger',
        impactAmount: Math.abs(p.profit), reason: `项目本月亏损，月利润率${p.profitRate.toFixed(1)}%`,
        suggestion: '建议分析本月成本结构，寻找降本空间', responsible: '项目负责人',
        deadline: getNextMonthEnd(), status: '待处理',
      });
    }
    // Cumulative loss projects
    for (const p of projectDataList.filter(p => p.cumulativeProfit < 0)) {
      riskList.push({
        project: p.name, riskType: '累计亏损', riskLevel: 'danger',
        impactAmount: Math.abs(p.cumulativeProfit), reason: `项目累计亏损，累计利润率${p.cumulativeProfitRate.toFixed(1)}%`,
        suggestion: '建议全面分析成本结构，制定扭亏计划', responsible: '项目负责人',
        deadline: getNextMonthEnd(), status: '待处理',
      });
    }
    // Low payment rate
    for (const p of projectDataList.filter(p => p.paymentRate < 50 && p.totalIncome > 0)) {
      riskList.push({
        project: p.name, riskType: '回款率低', riskLevel: p.paymentRate < 30 ? 'danger' : 'warning',
        impactAmount: p.unreceived, reason: `回款率仅${p.paymentRate.toFixed(1)}%，未回款${formatWan(p.unreceived)}`,
        suggestion: '建议及时跟进甲方回款，发送催款通知', responsible: '商务负责人',
        deadline: getNextMonthEnd(), status: '待处理',
      });
    }
    // Cost over income
    for (const p of projectDataList.filter(p => p.totalCost > p.totalIncome && p.totalIncome > 0)) {
      riskList.push({
        project: p.name, riskType: '成本超收入', riskLevel: 'danger',
        impactAmount: p.totalCost - p.totalIncome, reason: `成本${formatWan(p.totalCost)}超过收入${formatWan(p.totalIncome)}`,
        suggestion: '建议控制供应商付款节奏，加强报量管理', responsible: '项目经理',
        deadline: getNextMonthEnd(), status: '待处理',
      });
    }
    // Unpaid salary risk
    for (const p of projectDataList.filter(p => p.salaryUnpaid > 0)) {
      riskList.push({
        project: p.name, riskType: '人工工资未付', riskLevel: p.earliestUnpaidMonth && p.earliestUnpaidMonth < reportMonth ? 'danger' : 'warning',
        impactAmount: p.salaryUnpaid, reason: `未付工资${formatWan(p.salaryUnpaid)}，涉及${p.unpaidSalaryWorkers}人${p.earliestUnpaidMonth ? `，最早欠付${p.earliestUnpaidMonth}` : ''}`,
        suggestion: '建议尽快安排工资发放，避免劳动纠纷', responsible: '人力负责人',
        deadline: getNextMonthEnd(), status: '待处理',
      });
    }
    // Supplier large unpaid
    const largeUnpaidSupplier = supplierSettlementByProject.filter(s => s.unpaid > 0).sort((a, b) => b.unpaid - a.unpaid).slice(0, 5);
    for (const s of largeUnpaidSupplier) {
      riskList.push({
        project: s.projectName, riskType: '供应商大额未付', riskLevel: s.riskLevel === 'danger' ? 'danger' : 'warning',
        impactAmount: s.unpaid, reason: `${s.supplierName}未付${formatWan(s.unpaid)}，账龄${s.aging}`,
        suggestion: '建议优先处理账龄较长的供应商付款', responsible: '采购负责人',
        deadline: getNextMonthEnd(), status: '待处理',
      });
    }
    // Expiring certificates
    if (certificates.length > 0) {
      riskList.push({
        project: '全局', riskType: '证件即将到期', riskLevel: 'warning',
        impactAmount: 0, reason: `${certificates.length}个证件即将到期或已过期`,
        suggestion: '建议尽快安排证件续期', responsible: '行政负责人',
        deadline: getNextMonthEnd(), status: '待处理',
      });
    }
    // Pending visas
    for (const p of projectDataList.filter(p => p.pendingVisaCount > 0)) {
      riskList.push({
        project: p.name, riskType: '签证待推进', riskLevel: 'info',
        impactAmount: 0, reason: `${p.pendingVisaCount}个签证待推进`,
        suggestion: '建议尽快推进签证流转', responsible: '项目负责人',
        deadline: getNextMonthEnd(), status: '待处理',
      });
    }

    // Old risks structure for backward compatibility
    const risks = {
      lossProjects: projectDataList.filter(p => p.profit < 0).map(p => ({ id: p.id, name: p.name, profit: p.profit, profitRate: p.profitRate, suggestion: '建议分析成本结构，寻找降本空间' })),
      costOverIncomeProjects: projectDataList.filter(p => p.totalCost > p.totalIncome && p.totalIncome > 0).map(p => ({ id: p.id, name: p.name, cost: p.totalCost, income: p.totalIncome, suggestion: '建议控制供应商付款节奏' })),
      lowPaymentRateProjects: projectDataList.filter(p => p.paymentRate < 50 && p.totalIncome > 0).map(p => ({ id: p.id, name: p.name, paymentRate: p.paymentRate, unreceived: p.unreceived, suggestion: '建议及时跟进甲方回款' })),
      highLaborProjects: projectDataList.filter(p => p.totalCost > 0 && (p.salaryCost / p.totalCost) > 0.7).map(p => ({ id: p.id, name: p.name, laborRate: p.salaryCost / p.totalCost * 100, salaryCost: p.salaryCost, suggestion: '建议优化工时管理' })),
      unpaidSalaryProjects: projectDataList.filter(p => p.unpaidSalary > 0).map(p => ({ id: p.id, name: p.name, unpaidSalary: p.unpaidSalary, suggestion: '建议尽快安排工资发放' })),
      pendingVisaProjects: projectDataList.filter(p => p.pendingVisaCount > 0).map(p => ({ id: p.id, name: p.name, pendingCount: p.pendingVisaCount, suggestion: '建议尽快推进签证流转' })),
      overdueSupplierPayments: largeUnpaidSupplier.length,
      expiringCertificates: certificates.length,
    };

    // Cost structure
    const costStructure = [
      { name: '人工成本', value: overview.totalSalary },
      { name: '供应商成本', value: overview.totalSupplierCost },
      { name: '综合费用', value: overview.totalExpense },
      { name: '零星材料', value: overview.totalMaterialCost },
      { name: '税费', value: overview.totalTaxCost },
    ].filter(c => c.value > 0);

    // === Business Conclusion ===
    const businessConclusion = generateConclusion(overview, payablePlan, projectDataList);

    // Data completeness check
    const hasIncome = overview.monthIncome > 0;
    const hasReceived = overview.monthReceived > 0;
    const hasSalary = overview.totalSalary > 0;
    const dataCompleteness = [hasIncome, hasReceived, hasSalary].filter(Boolean).length;
    const completenessLabel = dataCompleteness === 3 ? '完整' : dataCompleteness >= 1 ? '部分缺失' : '数据未录入';

    // 回款季节性说明
    const currentMonthNum = parseInt(reportMonth.split('-')[1], 10);
    const seasonalNotes: string[] = [];
    if (currentMonthNum === 6 || currentMonthNum === 12) {
      seasonalNotes.push(`${currentMonthNum}月为半年度/年度结算节点，建筑行业通常存在集中回款现象，单月回款金额可能显著高于其他月份。`);
    }
    if (currentMonthNum >= 1 && currentMonthNum <= 2) {
      seasonalNotes.push('1-2月为春节前后，工地通常停工或半停工，回款和产值可能处于全年低点，不宜直接与正常月份比较。');
    }
    if (currentMonthNum >= 11 && currentMonthNum <= 12) {
      seasonalNotes.push('年末甲方通常加快审批和付款进度，回款率可能高于月均值，需注意区分季节性回款与经营改善。');
    }
    const seasonalNote = seasonalNotes.length > 0 ? seasonalNotes.join('') : '';
    const financialSummary = targetProjectIds.length === 1
      ? await getProjectFinancialSummary(targetProjectIds[0], reportDateRange)
      : await getGlobalSummary(reportDateRange, targetProjectIds);

    return NextResponse.json({
      success: true,
      data: {
        reportMonth,
        projectScope: projectId || 'all',
        generatedAt: new Date().toISOString(),
        updatedAt: new Date().toLocaleString('zh-CN'),
        statisticsScope: projectId === 'all' || !projectId ? '全部项目' : `${projects.length}个项目`,
        dataCompleteness: completenessLabel,
        overview,
        projects: projectDataList,
        risks,
        riskList,
        comparisons,
        trends,
        costStructure,
        payablePlan,
        laborCostByProject,
        supplierSettlementByProject,
        supplierPaymentsBySupplier,
        financialSummary,
        businessConclusion,
        collectionLagAnalysis,
        seasonalNote,
      },
    });
  } catch (error) {
    console.error('[Monthly Summary] Error:', error);
    return NextResponse.json({ success: false, error: '月报汇总失败' }, { status: 500 });
  }
}
