'use client';

import { Component, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, ChevronDown, ChevronRight, Download, RefreshCw } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { KpiCard } from '@/components/business/common';
import { DashboardSkeleton, FilterBar, KpiSection, StandardDashboardLayout } from '@/components/dashboard/standard-layout';
import { isEffectiveSupplierPaymentStatus, isVoidedStatus } from '@/lib/review-status';

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: string }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: '' };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 text-center">
          <AlertCircle className="mx-auto mb-4 h-12 w-12 text-red-500" />
          <h2 className="mb-2 text-lg font-semibold">页面加载出错</h2>
          <p className="mb-4 text-sm text-muted-foreground">{this.state.error}</p>
          <Button onClick={() => window.location.reload()}>重新加载</Button>
        </div>
      );
    }
    return this.props.children;
  }
}

type Contract = {
  id: number;
  supplier_id?: number | string | null;
  project_id?: number | string | null;
  contract_name?: string | null;
  contract_no?: string | null;
  contract_status?: string | null;
  locked?: boolean | null;
  supplier?: { id?: number | string | null; name?: string | null } | null;
};

type Settlement = {
  id: number;
  contract_id?: number | string | null;
  settlement_amount?: number | string | null;
  payable_amount?: number | string | null;
  status?: string | null;
};

type Payment = {
  id: number;
  contract_id?: number | string | null;
  payment_amount?: number | string | null;
  amount?: number | string | null;
  status?: string | null;
};

type Project = {
  id: number;
  name: string;
};

type Supplier = {
  id: number;
  name: string;
};

type ContractRow = {
  id: number;
  projectId: string;
  projectName: string;
  supplierId: string;
  supplierName: string;
  contractName: string;
  contractNo: string;
  settlementAmount: number;
  payableAmount: number;
  progressPayable: number;
  finalPayable: number;
  paidAmount: number;
  unpaidAmount: number;
  progressUnpaid: number;
  finalUnpaid: number;
  paymentRatio: number;
};

type SupplierSummary = {
  key: string;
  supplierName: string;
  contractCount: number;
  settlementAmount: number;
  payableAmount: number;
  progressPayable: number;
  finalPayable: number;
  paidAmount: number;
  unpaidAmount: number;
  progressUnpaid: number;
  finalUnpaid: number;
  paymentRatio: number;
};

type ProjectSummary = {
  key: string;
  projectId: string;
  projectName: string;
  supplierCount: number;
  contractCount: number;
  settlementAmount: number;
  payableAmount: number;
  progressPayable: number;
  finalPayable: number;
  paidAmount: number;
  unpaidAmount: number;
  paymentRate: number;
  progressUnpaid: number;
  finalUnpaid: number;
  paymentRatio: number;
  rows: ContractRow[];
  suppliers: SupplierSummary[];
};

function toNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return 0;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function toId(value: unknown) {
  if (value === null || value === undefined || value === '') return '';
  return String(value);
}

function formatMoney(value: number) {
  return value.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatMoneyShort(value: number) {
  const abs = Math.abs(value);
  if (abs >= 100000000) return `${(value / 100000000).toFixed(2)}亿`;
  if (abs >= 10000) return `${(value / 10000).toFixed(2)}万`;
  return formatMoney(value);
}

function paymentRate(paidAmount: number, payableAmount: number) {
  if (payableAmount <= 0) return 0;
  return (paidAmount / payableAmount) * 100;
}

function AmountCell({ value, tone }: { value: number; tone?: 'success' | 'warning' | 'danger' }) {
  const toneClass =
    tone === 'success' ? 'text-emerald-700' :
      tone === 'warning' ? 'text-amber-700' :
        tone === 'danger' ? 'text-red-700' :
          'text-gray-900';

  return <span className={`tabular-nums font-medium ${toneClass}`}>{formatMoney(value)}</span>;
}

export default function SupplierCostBoardPage() {
  return (
    <ErrorBoundary>
      <SupplierCostDashboard />
    </ErrorBoundary>
  );
}

function SupplierCostDashboard() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedProject, setSelectedProject] = useState('all');
  const [selectedSupplier, setSelectedSupplier] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [contractsRes, settlementsRes, paymentsRes, projectsRes, suppliersRes] = await Promise.all([
        fetch('/api/supplier-contracts'),
        fetch('/api/supplier-contracts/settlements'),
        fetch('/api/supplier-contracts/payments'),
        fetch('/api/projects'),
        fetch('/api/suppliers'),
      ]);

      const [contractsData, settlementsData, paymentsData, projectsData, suppliersData] = await Promise.all([
        contractsRes.json(),
        settlementsRes.json(),
        paymentsRes.json(),
        projectsRes.json(),
        suppliersRes.json(),
      ]);

      setContracts(
        Array.isArray(contractsData.contracts) ? contractsData.contracts :
          Array.isArray(contractsData.data) ? contractsData.data :
            Array.isArray(contractsData) ? contractsData : [],
      );
      setSettlements(
        Array.isArray(settlementsData.settlements) ? settlementsData.settlements :
          Array.isArray(settlementsData.data) ? settlementsData.data :
            Array.isArray(settlementsData) ? settlementsData : [],
      );
      setPayments(
        Array.isArray(paymentsData.payments) ? paymentsData.payments :
          Array.isArray(paymentsData.data) ? paymentsData.data :
            Array.isArray(paymentsData) ? paymentsData : [],
      );
      setProjects(
        Array.isArray(projectsData.projects) ? projectsData.projects :
          Array.isArray(projectsData.data) ? projectsData.data :
            Array.isArray(projectsData) ? projectsData : [],
      );
      setSuppliers(
        Array.isArray(suppliersData.suppliers) ? suppliersData.suppliers :
          Array.isArray(suppliersData.data) ? suppliersData.data :
            Array.isArray(suppliersData) ? suppliersData : [],
      );
    } catch (error) {
      console.error('加载供应商成本数据失败:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  const projectNameById = useMemo(() => {
    return new Map(projects.map((project) => [String(project.id), project.name]));
  }, [projects]);

  const supplierNameById = useMemo(() => {
    return new Map(suppliers.map((supplier) => [String(supplier.id), supplier.name]));
  }, [suppliers]);

  const contractRows = useMemo<ContractRow[]>(() => {
    return contracts.map((contract) => {
      const contractId = Number(contract.id);
      const contractSettlements = settlements.filter((settlement) => (
        Number(settlement.contract_id) === contractId && !isVoidedStatus(settlement.status)
      ));
      const contractPayments = payments.filter((payment) => (
        Number(payment.contract_id) === contractId && isEffectiveSupplierPaymentStatus(payment.status)
      ));

      const projectId = toId(contract.project_id);
      const supplierId = toId(contract.supplier_id || contract.supplier?.id);
      const settlementAmount = contractSettlements.reduce((sum, settlement) => sum + toNumber(settlement.settlement_amount), 0);
      const payableAmount = contractSettlements.reduce((sum, settlement) => sum + toNumber(settlement.payable_amount), 0);
      const progressPayable = payableAmount;
      const finalPayable = settlementAmount;
      const paidAmount = contractPayments.reduce((sum, payment) => (
        sum + (toNumber(payment.payment_amount) || toNumber(payment.amount))
      ), 0);
      const progressUnpaid = Math.max(0, progressPayable - paidAmount);
      const finalUnpaid = Math.max(0, finalPayable - paidAmount);

      return {
        id: contract.id,
        projectId,
        projectName: projectNameById.get(projectId) || '未关联项目',
        supplierId,
        supplierName: contract.supplier?.name || supplierNameById.get(supplierId) || '未知供应商',
        contractName: contract.contract_name || '未命名合同',
        contractNo: contract.contract_no || '-',
        settlementAmount,
        payableAmount,
        progressPayable,
        finalPayable,
        paidAmount,
        unpaidAmount: progressUnpaid,
        progressUnpaid,
        finalUnpaid,
        paymentRatio: paymentRate(paidAmount, progressPayable),
      };
    });
  }, [contracts, settlements, payments, projectNameById, supplierNameById]);

  const filteredRows = useMemo(() => {
    return contractRows.filter((row) => {
      if (selectedProject !== 'all' && row.projectId !== selectedProject) return false;
      if (selectedSupplier !== 'all' && row.supplierId !== selectedSupplier) return false;
      if (selectedStatus === 'unpaid' && row.progressUnpaid <= 0) return false;
      if (selectedStatus === 'paid' && row.progressPayable > 0 && row.progressUnpaid > 0) return false;
      return true;
    });
  }, [contractRows, selectedProject, selectedSupplier, selectedStatus]);

  const projectSummaries = useMemo<ProjectSummary[]>(() => {
    const groupMap = new Map<string, ContractRow[]>();
    filteredRows.forEach((row) => {
      const key = row.projectId || `unknown-${row.projectName}`;
      const rows = groupMap.get(key) || [];
      rows.push(row);
      groupMap.set(key, rows);
    });

    return Array.from(groupMap.entries()).map(([key, rows]) => {
      const supplierMap = new Map<string, SupplierSummary>();
      rows.forEach((row) => {
        const supplierKey = row.supplierId || row.supplierName;
        const current = supplierMap.get(supplierKey) || {
          key: supplierKey,
          supplierName: row.supplierName,
          contractCount: 0,
          settlementAmount: 0,
          payableAmount: 0,
          progressPayable: 0,
          finalPayable: 0,
          paidAmount: 0,
          unpaidAmount: 0,
          progressUnpaid: 0,
          finalUnpaid: 0,
          paymentRatio: 0,
        };
        current.contractCount += 1;
        current.settlementAmount += row.settlementAmount;
        current.payableAmount += row.payableAmount;
        current.progressPayable += row.progressPayable;
        current.finalPayable += row.finalPayable;
        current.paidAmount += row.paidAmount;
        current.unpaidAmount += row.progressUnpaid;
        current.progressUnpaid += row.progressUnpaid;
        current.finalUnpaid += row.finalUnpaid;
        current.paymentRatio = paymentRate(current.paidAmount, current.progressPayable);
        supplierMap.set(supplierKey, current);
      });

      const settlementAmount = rows.reduce((sum, row) => sum + row.settlementAmount, 0);
      const payableAmount = rows.reduce((sum, row) => sum + row.payableAmount, 0);
      const progressPayable = rows.reduce((sum, row) => sum + row.progressPayable, 0);
      const finalPayable = rows.reduce((sum, row) => sum + row.finalPayable, 0);
      const paidAmount = rows.reduce((sum, row) => sum + row.paidAmount, 0);
      const progressUnpaid = Math.max(0, progressPayable - paidAmount);
      const finalUnpaid = Math.max(0, finalPayable - paidAmount);

      return {
        key,
        projectId: rows[0]?.projectId || '',
        projectName: rows[0]?.projectName || '未关联项目',
        supplierCount: supplierMap.size,
        contractCount: rows.length,
        settlementAmount,
        payableAmount,
        progressPayable,
        finalPayable,
        paidAmount,
        unpaidAmount: progressUnpaid,
        progressUnpaid,
        finalUnpaid,
        paymentRate: paymentRate(paidAmount, progressPayable),
        paymentRatio: paymentRate(paidAmount, progressPayable),
        rows: [...rows].sort((a, b) => b.progressUnpaid - a.progressUnpaid),
        suppliers: Array.from(supplierMap.values()).sort((a, b) => b.progressUnpaid - a.progressUnpaid),
      };
    }).sort((a, b) => b.progressUnpaid - a.progressUnpaid);
  }, [filteredRows]);

  const stats = useMemo(() => {
    const settlementAmount = projectSummaries.reduce((sum, project) => sum + project.settlementAmount, 0);
    const payableAmount = projectSummaries.reduce((sum, project) => sum + project.payableAmount, 0);
    const progressPayable = projectSummaries.reduce((sum, project) => sum + project.progressPayable, 0);
    const finalPayable = projectSummaries.reduce((sum, project) => sum + project.finalPayable, 0);
    const paidAmount = projectSummaries.reduce((sum, project) => sum + project.paidAmount, 0);
    const progressUnpaid = Math.max(0, progressPayable - paidAmount);
    const finalUnpaid = Math.max(0, finalPayable - paidAmount);
    return {
      projectCount: projectSummaries.length,
      supplierCount: new Set(filteredRows.map((row) => row.supplierId || row.supplierName)).size,
      contractCount: filteredRows.length,
      settlementAmount,
      payableAmount,
      progressPayable,
      finalPayable,
      paidAmount,
      unpaidAmount: progressUnpaid,
      progressUnpaid,
      finalUnpaid,
      paymentRate: paymentRate(paidAmount, progressPayable),
      paymentRatio: paymentRate(paidAmount, progressPayable),
    };
  }, [projectSummaries, filteredRows]);

  const toggleProject = (key: string) => {
    setExpandedProjects((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const exportExcel = () => {
    const summaryRows = projectSummaries.map((project) => ({
      项目名称: project.projectName,
      供应商数量: project.supplierCount,
      合同数量: project.contractCount,
      付款比例: `${project.paymentRatio.toFixed(1)}%`,
      结算金额: project.settlementAmount,
      进度应付款: project.progressPayable,
      决算应付款: project.finalPayable,
      已付金额: project.paidAmount,
      进度未付: project.progressUnpaid,
      决算未付: project.finalUnpaid,
    }));

    summaryRows.push({
      项目名称: '合计',
      供应商数量: stats.supplierCount,
      合同数量: stats.contractCount,
      付款比例: `${stats.paymentRatio.toFixed(1)}%`,
      结算金额: stats.settlementAmount,
      进度应付款: stats.progressPayable,
      决算应付款: stats.finalPayable,
      已付金额: stats.paidAmount,
      进度未付: stats.progressUnpaid,
      决算未付: stats.finalUnpaid,
    });

    const detailRows = projectSummaries.flatMap((project) => (
      project.rows.map((row) => ({
        项目名称: project.projectName,
        供应商: row.supplierName,
        合同名称: row.contractName,
        合同编号: row.contractNo,
        付款比例: `${row.paymentRatio.toFixed(1)}%`,
        结算金额: row.settlementAmount,
        进度应付款: row.progressPayable,
        决算应付款: row.finalPayable,
        已付金额: row.paidAmount,
        进度未付: row.progressUnpaid,
        决算未付: row.finalUnpaid,
      }))
    ));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), '项目汇总');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detailRows), '合同明细');
    XLSX.writeFile(wb, `供应商成本项目汇总_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  if (loading) {
    return <DashboardSkeleton />;
  }

  return (
    <StandardDashboardLayout
      filterBar={
        <FilterBar
          title="供应商成本项目汇总"
          filters={
            <>
              <Select value={selectedProject} onValueChange={setSelectedProject}>
                <SelectTrigger className="h-9 w-full sm:w-[180px]">
                  <SelectValue placeholder="全部项目" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部项目</SelectItem>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={String(project.id)}>{project.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={selectedSupplier} onValueChange={setSelectedSupplier}>
                <SelectTrigger className="h-9 w-full sm:w-[180px]">
                  <SelectValue placeholder="全部供应商" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部供应商</SelectItem>
                  {suppliers.map((supplier) => (
                    <SelectItem key={supplier.id} value={String(supplier.id)}>{supplier.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                <SelectTrigger className="h-9 w-full sm:w-[140px]">
                  <SelectValue placeholder="全部状态" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部状态</SelectItem>
                  <SelectItem value="unpaid">存在未付</SelectItem>
                  <SelectItem value="paid">已付清</SelectItem>
                </SelectContent>
              </Select>
            </>
          }
          actions={
            <>
              <Button variant="outline" size="sm" onClick={exportExcel} className="gap-1">
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline">导出</span>
              </Button>
              <Button variant="outline" size="sm" onClick={loadData} className="gap-1">
                <RefreshCw className="h-4 w-4" />
                <span className="hidden sm:inline">刷新</span>
              </Button>
            </>
          }
        />
      }
      kpiSection={
        <KpiSection
          cards={
            <>
              <KpiCard label="项目数量" value={stats.projectCount} />
              <KpiCard label="供应商数量" value={stats.supplierCount} />
              <KpiCard label="合同数量" value={stats.contractCount} />
              <KpiCard label="结算金额" value={stats.settlementAmount} amountMode />
              <KpiCard label="进度应付款" value={stats.progressPayable} amountMode />
              <KpiCard label="决算应付款" value={stats.finalPayable} amountMode />
              <KpiCard label="已付金额" value={stats.paidAmount} amountMode valueClassName="text-emerald-700" />
              <KpiCard label="进度未付" value={stats.progressUnpaid} amountMode valueClassName="text-amber-700" />
              <KpiCard label="决算未付" value={stats.finalUnpaid} amountMode valueClassName="text-red-700" />
              <KpiCard label="付款比例" value={stats.paymentRatio} percentMode />
            </>
          }
        />
      }
      ledgerSection={
        <Card>
          <CardHeader className="border-b py-4">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <CardTitle className="text-base">项目供应商成本台账</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  进度应付款取结算单应付金额，决算应付款取结算金额，已付金额取有效付款记录；付款比例=已付金额/进度应付款。
                </p>
              </div>
              <div className="text-xs text-muted-foreground">
                共 {projectSummaries.length} 个项目，{filteredRows.length} 份供应商合同
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm" style={{ minWidth: 1240 }}>
                <thead>
                  <tr className="border-b bg-slate-50 text-xs text-slate-600">
                    <th className="w-10 p-3 text-left"></th>
                    <th className="p-3 text-left">项目名称</th>
                    <th className="p-3 text-right">供应商数</th>
                    <th className="p-3 text-right">合同数</th>
                    <th className="p-3 text-right">付款比例</th>
                    <th className="p-3 text-right">结算金额</th>
                    <th className="p-3 text-right">进度应付款</th>
                    <th className="p-3 text-right">决算应付款</th>
                    <th className="p-3 text-right">已付金额</th>
                    <th className="p-3 text-right">进度未付</th>
                    <th className="p-3 text-right">决算未付</th>
                  </tr>
                </thead>
                <tbody>
                  {projectSummaries.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="p-8 text-center text-sm text-muted-foreground">暂无供应商成本数据</td>
                    </tr>
                  ) : projectSummaries.map((project) => {
                    const expanded = expandedProjects.has(project.key);
                    return (
                      <FragmentRows
                        key={project.key}
                        project={project}
                        expanded={expanded}
                        onToggle={() => toggleProject(project.key)}
                      />
                    );
                  })}
                  <tr className="border-t-2 bg-slate-50 font-semibold">
                    <td className="p-3"></td>
                    <td className="p-3">合计</td>
                    <td className="p-3 text-right">{stats.supplierCount}</td>
                    <td className="p-3 text-right">{stats.contractCount}</td>
                    <td className="p-3 text-right">{stats.paymentRatio.toFixed(1)}%</td>
                    <td className="p-3 text-right"><AmountCell value={stats.settlementAmount} /></td>
                    <td className="p-3 text-right"><AmountCell value={stats.progressPayable} /></td>
                    <td className="p-3 text-right"><AmountCell value={stats.finalPayable} /></td>
                    <td className="p-3 text-right"><AmountCell value={stats.paidAmount} tone="success" /></td>
                    <td className="p-3 text-right"><AmountCell value={stats.progressUnpaid} tone="warning" /></td>
                    <td className="p-3 text-right"><AmountCell value={stats.finalUnpaid} tone="danger" /></td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="space-y-3 p-3 md:hidden">
              {projectSummaries.length === 0 ? (
                <div className="rounded-lg border bg-white p-6 text-center text-sm text-muted-foreground">暂无供应商成本数据</div>
              ) : projectSummaries.map((project) => {
                const expanded = expandedProjects.has(project.key);
                return (
                  <div key={project.key} className="rounded-lg border bg-white shadow-sm">
                    <button
                      type="button"
                      onClick={() => toggleProject(project.key)}
                      className="flex w-full items-start justify-between gap-3 p-3 text-left"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium text-slate-900">{project.projectName}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {project.supplierCount} 个供应商 · {project.contractCount} 份合同 · 付款比例 {project.paymentRatio.toFixed(1)}%
                        </div>
                      </div>
                      {expanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                    </button>
                    <div className="grid grid-cols-2 gap-2 border-t bg-slate-50/70 p-3 text-xs">
                      <MobileAmount label="结算" value={project.settlementAmount} />
                      <MobileAmount label="进度应付" value={project.progressPayable} />
                      <MobileAmount label="决算应付" value={project.finalPayable} />
                      <MobileAmount label="已付" value={project.paidAmount} tone="success" />
                      <MobileAmount label="进度未付" value={project.progressUnpaid} tone="warning" />
                      <MobileAmount label="决算未付" value={project.finalUnpaid} tone="danger" />
                    </div>
                    {expanded && (
                      <div className="space-y-2 border-t p-3">
                        {project.suppliers.map((supplier) => (
                          <div key={supplier.key} className="rounded-md bg-slate-50 p-2 text-xs">
                            <div className="flex items-center justify-between gap-2">
                              <div className="font-medium text-slate-800">{supplier.supplierName}</div>
                              <div className="text-muted-foreground">{supplier.paymentRatio.toFixed(1)}%</div>
                            </div>
                            <div className="mt-2 grid grid-cols-2 gap-2">
                              <MobileAmount label="进度应付" value={supplier.progressPayable} />
                              <MobileAmount label="决算应付" value={supplier.finalPayable} />
                              <MobileAmount label="已付" value={supplier.paidAmount} tone="success" />
                              <MobileAmount label="进度未付" value={supplier.progressUnpaid} tone="warning" />
                              <MobileAmount label="决算未付" value={supplier.finalUnpaid} tone="danger" />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      }
    />
  );
}

function FragmentRows({
  project,
  expanded,
  onToggle,
}: {
  project: ProjectSummary;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr className="border-b bg-white hover:bg-slate-50">
        <td className="p-3">
          <button type="button" onClick={onToggle} className="rounded p-1 hover:bg-slate-100" aria-label="展开项目明细">
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        </td>
        <td className="p-3 font-medium text-slate-900">{project.projectName}</td>
        <td className="p-3 text-right">{project.supplierCount}</td>
        <td className="p-3 text-right">{project.contractCount}</td>
        <td className="p-3 text-right tabular-nums">{project.paymentRatio.toFixed(1)}%</td>
        <td className="p-3 text-right"><AmountCell value={project.settlementAmount} /></td>
        <td className="p-3 text-right"><AmountCell value={project.progressPayable} /></td>
        <td className="p-3 text-right"><AmountCell value={project.finalPayable} /></td>
        <td className="p-3 text-right"><AmountCell value={project.paidAmount} tone="success" /></td>
        <td className="p-3 text-right"><AmountCell value={project.progressUnpaid} tone={project.progressUnpaid > 0 ? 'warning' : 'success'} /></td>
        <td className="p-3 text-right"><AmountCell value={project.finalUnpaid} tone={project.finalUnpaid > 0 ? 'danger' : 'success'} /></td>
      </tr>
      {expanded && (
        <tr className="border-b bg-slate-50/60">
          <td className="p-0"></td>
          <td colSpan={10} className="p-3">
            <div className="overflow-hidden rounded-md border bg-white">
              <table className="w-full text-xs" style={{ minWidth: 980 }}>
                <thead>
                  <tr className="border-b bg-slate-50 text-slate-500">
                    <th className="p-2 text-left">供应商</th>
                    <th className="p-2 text-left">合同名称</th>
                    <th className="p-2 text-left">合同编号</th>
                    <th className="p-2 text-right">付款比例</th>
                    <th className="p-2 text-right">结算金额</th>
                    <th className="p-2 text-right">进度应付款</th>
                    <th className="p-2 text-right">决算应付款</th>
                    <th className="p-2 text-right">已付金额</th>
                    <th className="p-2 text-right">进度未付</th>
                    <th className="p-2 text-right">决算未付</th>
                  </tr>
                </thead>
                <tbody>
                  {project.rows.map((row) => (
                    <tr key={row.id} className="border-b last:border-b-0">
                      <td className="p-2">{row.supplierName}</td>
                      <td className="p-2">{row.contractName}</td>
                      <td className="p-2">{row.contractNo}</td>
                      <td className="p-2 text-right tabular-nums">{row.paymentRatio.toFixed(1)}%</td>
                      <td className="p-2 text-right">{formatMoney(row.settlementAmount)}</td>
                      <td className="p-2 text-right">{formatMoney(row.progressPayable)}</td>
                      <td className="p-2 text-right">{formatMoney(row.finalPayable)}</td>
                      <td className="p-2 text-right text-emerald-700">{formatMoney(row.paidAmount)}</td>
                      <td className="p-2 text-right text-amber-700">{formatMoney(row.progressUnpaid)}</td>
                      <td className="p-2 text-right text-red-700">{formatMoney(row.finalUnpaid)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function MobileAmount({ label, value, tone }: { label: string; value: number; tone?: 'success' | 'warning' | 'danger' }) {
  const toneClass = tone === 'success'
    ? 'text-emerald-700'
    : tone === 'warning'
      ? 'text-amber-700'
      : tone === 'danger'
        ? 'text-red-700'
        : 'text-slate-900';
  return (
    <div className="rounded bg-white p-2">
      <div className="text-muted-foreground">{label}</div>
      <div className={`mt-1 font-semibold ${toneClass}`}>{formatMoneyShort(value)}</div>
    </div>
  );
}
