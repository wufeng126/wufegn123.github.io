'use client';

import { useState, useMemo, useCallback, useEffect, Component, type ReactNode } from 'react';
import {
  Building, RefreshCw, Database, TrendingUp, Wallet, CheckCircle,
  Clock, AlertCircle, ChevronDown, ChevronRight, Download,
  FileSpreadsheet, Filter
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ComposedChart, Line
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { KpiCard, formatAmountSmart, formatPercent, RiskBadge } from '@/components/business/common';
import { StandardDashboardLayout, FilterBar, KpiSection, ChartSection, LedgerSection, DashboardChartCard, DashboardSkeleton } from '@/components/dashboard/standard-layout';
import { CollapsibleSection } from '@/components/dashboard/collapsible-section';
import * as XLSX from 'xlsx';

// 错误边界组件
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
          <h2 className="text-lg font-semibold mb-2">页面加载出错</h2>
          <p className="text-sm text-muted-foreground mb-4">{this.state.error}</p>
          <Button onClick={() => { this.setState({ hasError: false, error: '' }); window.location.reload(); }}>
            重新加载
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function SupplierCostBoardPage() {
  return (
    <ErrorBoundary>
      <SupplierCostBoard />
    </ErrorBoundary>
  );
}

function SupplierCostBoard() {
  return <SupplierCostDashboard />;
}

// 辅助函数：确保数值类型
function toNumber(val: unknown): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return val;
  const num = Number(val);
  return isNaN(num) ? 0 : num;
}

function isVoidedStatus(status?: string | null) {
  const normalized = String(status || '').trim().toLowerCase();
  return normalized === 'voided' || normalized === 'cancelled' || normalized === 'deleted';
}

function isEffectivePaymentStatus(status?: string | null) {
  const normalized = String(status || '').trim().toLowerCase();
  return !normalized || normalized === 'completed' || normalized === 'reviewed';
}

function isFinalSettlementType(type?: string | null) {
  const normalized = String(type || '').trim().toLowerCase();
  return (
    normalized === 'final' ||
    normalized === 'complete' ||
    normalized === 'completed' ||
    normalized.includes('\u7ed3\u7b97\u5b8c') ||
    normalized.includes('\u6700\u7ec8') ||
    normalized.includes('\u603b\u7ed3') ||
    normalized.includes('\u51b3\u7b97')
  );
}

interface Contract {
  id: number;
  supplier_id: number;
  project_id: number;
  contract_name: string;
  contract_no?: string;
  total_amount?: number;
  payment_ratio_active?: number;
  payment_ratio_complete?: number;
  warranty_ratio?: number;
  contract_status?: string;
  locked?: boolean;
  supplier?: { id: number; name: string };
  total_settlement?: number | string;
  total_payable?: number | string;
  total_paid?: number | string;
  has_complete_settlement?: boolean;
}

interface Settlement {
  id: number;
  contract_id: number;
  settlement_no?: string;
  settlement_type: string;
  settlement_amount: number;
  payable_amount: number;
  settlement_date?: string;
  status?: string;
}

interface Payment {
  id: number;
  contract_id: number;
  payment_amount?: number;
  amount?: number;
  payment_date: string;
  status?: string;
}

interface Project {
  id: number;
  name: string;
}

interface Supplier {
  id: number;
  name: string;
}

interface DashboardStats {
  totalContracts: number;
  totalSettlement: number;
  totalPayable: number;
  totalPaid: number;
  totalUnpaid: number;
  settledCount: number;
  pendingCount: number;
  totalProgressPayable: number;
  totalFinalPayable: number;
  totalProgressUnpaid: number;
  totalFinalUnpaid: number;
}

interface RowData extends Contract {
  totalSettlement: number;
  payableAmount: number;
  paidAmount: number;
  finalPayableAmount: number;
  unpaidAmount: number;
  finalUnpaidAmount: number;
  hasFinalSettlement: boolean;
  supplierName: string;
  projectName: string;
  paymentRate: number;
  progressPayable: number;
  finalPayable: number;
  progressUnpaid: number;
  finalUnpaid: number;
}



function SupplierCostDashboard() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>('all');
  const [selectedSupplier, setSelectedSupplier] = useState<string>('all');
  const [selectedContractStatus, setSelectedContractStatus] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(20);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // 加载数据
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [contractsRes, settlementsRes, projectsRes, suppliersRes, paymentsRes] = await Promise.all([
        fetch('/api/supplier-contracts'),
        fetch('/api/supplier-contracts/settlements'),
        fetch('/api/projects'),
        fetch('/api/suppliers'),
        fetch('/api/supplier-contracts/payments'),
      ]);

      const [contractsData, settlementsData, projectsData, suppliersData, paymentsData] = await Promise.all([
        contractsRes.json(),
        settlementsRes.json(),
        projectsRes.json(),
        suppliersRes.json(),
        paymentsRes.json(),
      ]);

      const contractsArray = Array.isArray(contractsData.contracts) ? contractsData.contracts
        : Array.isArray(contractsData.data) ? contractsData.data
        : Array.isArray(contractsData) ? contractsData : [];
      const settlementsArray = Array.isArray(settlementsData.settlements) ? settlementsData.settlements
        : Array.isArray(settlementsData.data) ? settlementsData.data
        : Array.isArray(settlementsData) ? settlementsData : [];
      const projectsArray = Array.isArray(projectsData.projects) ? projectsData.projects
        : Array.isArray(projectsData.data) ? projectsData.data
        : Array.isArray(projectsData) ? projectsData : [];
      const suppliersArray = Array.isArray(suppliersData.suppliers) ? suppliersData.suppliers
        : Array.isArray(suppliersData.data) ? suppliersData.data
        : Array.isArray(suppliersData) ? suppliersData : [];
      const paymentsArray = Array.isArray(paymentsData.payments) ? paymentsData.payments
        : Array.isArray(paymentsData.data) ? paymentsData.data
        : Array.isArray(paymentsData) ? paymentsData : [];

      setContracts(contractsArray);
      setSettlements(settlementsArray);
      setProjects(projectsArray);
      setSuppliers(suppliersArray);
      setPayments(paymentsArray);
    } catch (error) {
      console.error('加载数据失败:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 构建行数据（含计算字段）
  const buildRowData = useCallback((contract: Contract): RowData => {
    const contractSettlements = settlements.filter(s => toNumber(s.contract_id) === contract.id && !isVoidedStatus(s.status));
    const contractPayments = payments.filter(p => toNumber(p.contract_id) === contract.id && isEffectivePaymentStatus(p.status));

    const hasSettlementRows = contractSettlements.length > 0;
    const totalSettlement = hasSettlementRows
      ? contractSettlements.reduce((sum, s) => sum + toNumber(s.settlement_amount), 0)
      : toNumber(contract.total_settlement);
    const payableAmount = hasSettlementRows
      ? contractSettlements.reduce((sum, s) => sum + toNumber(s.payable_amount), 0)
      : toNumber(contract.total_payable);
    const paidAmount = contractPayments.length > 0
      ? contractPayments.reduce((sum, p) => sum + (toNumber(p.payment_amount) || toNumber(p.amount)), 0)
      : toNumber(contract.total_paid);
    const finalPayableAmount = totalSettlement;
    const hasFinalSettlement = hasSettlementRows
      ? contractSettlements.some(s => isFinalSettlementType(s.settlement_type))
      : Boolean(contract.has_complete_settlement);
    const paymentRate = payableAmount > 0 ? (paidAmount / payableAmount) * 100 : 0;

    // 按结算类型拆分：进度结算 vs 决算
    const progressPayable = hasSettlementRows
      ? contractSettlements
        .filter(s => !isFinalSettlementType(s.settlement_type))
        .reduce((sum, s) => sum + toNumber(s.payable_amount), 0)
      : (hasFinalSettlement ? 0 : payableAmount);
    const finalPayable = hasSettlementRows
      ? contractSettlements
        .filter(s => isFinalSettlementType(s.settlement_type))
        .reduce((sum, s) => sum + toNumber(s.payable_amount), 0)
      : (hasFinalSettlement ? payableAmount : 0);

    // 付款分配：先抵扣进度应付，再抵扣决算应付
    const progressUnpaid = Math.max(0, progressPayable - paidAmount);
    const totalUnpaid = Math.max(0, payableAmount - paidAmount);
    const finalUnpaid = Math.max(0, totalUnpaid - progressUnpaid);
    const finalUnpaidAmount = Math.max(0, finalPayableAmount - paidAmount);

    return {
      ...contract,
      totalSettlement,
      payableAmount,
      paidAmount,
      finalPayableAmount,
      unpaidAmount: totalUnpaid,
      finalUnpaidAmount,
      hasFinalSettlement,
      supplierName: contract.supplier?.name || suppliers.find(s => String(s.id) === String(contract.supplier_id))?.name || '未知供应商',
      projectName: projects.find(p => String(p.id) === String(contract.project_id))?.name || '未知项目',
      paymentRate,
      progressPayable,
      finalPayable,
      progressUnpaid,
      finalUnpaid,
    };
  }, [settlements, payments, suppliers, projects]);

  // 过滤后的数据
  const filteredData = useMemo(() => {
    let data = contracts.map(buildRowData);

    if (selectedProject !== 'all') {
      data = data.filter(c => toNumber(c.project_id) === Number(selectedProject));
    }
    if (selectedSupplier !== 'all') {
      data = data.filter(c => toNumber(c.supplier_id) === Number(selectedSupplier));
    }
    if (selectedContractStatus !== 'all') {
      if (selectedContractStatus === 'settled') {
        data = data.filter(c => c.hasFinalSettlement || c.locked);
      } else if (selectedContractStatus === 'ongoing') {
        data = data.filter(c => !c.hasFinalSettlement && !c.locked);
      } else if (selectedContractStatus === 'overdue') {
        data = data.filter(c => c.unpaidAmount > 0);
      }
    }

    // 默认按未付金额降序
    data.sort((a, b) => b.unpaidAmount - a.unpaidAmount);
    return data;
  }, [contracts, buildRowData, selectedProject, selectedSupplier, selectedContractStatus]);

  // 统计数据
  const stats = useMemo<DashboardStats>(() => {
    const totalContracts = filteredData.length;
    const totalSettlement = filteredData.reduce((sum, c) => sum + (c.totalSettlement || 0), 0);
    const totalPayable = filteredData.reduce((sum, c) => sum + (c.payableAmount || 0), 0);
    const totalPaid = filteredData.reduce((sum, c) => sum + (c.paidAmount || 0), 0);
    const totalUnpaid = Math.max(0, totalPayable - totalPaid);
    const settledCount = filteredData.filter(c => c.hasFinalSettlement || c.locked).length;
    const pendingCount = totalContracts - settledCount;
    const totalProgressPayable = filteredData.reduce((sum, c) => sum + (c.progressPayable || 0), 0);
    const totalFinalPayable = filteredData.reduce((sum, c) => sum + (c.finalPayable || 0), 0);
    const totalProgressUnpaid = filteredData.reduce((sum, c) => sum + (c.progressUnpaid || 0), 0);
    const totalFinalUnpaid = filteredData.reduce((sum, c) => sum + (c.finalUnpaid || 0), 0);
    return { totalContracts, totalSettlement, totalPayable, totalPaid, totalUnpaid, settledCount, pendingCount, totalProgressPayable, totalFinalPayable, totalProgressUnpaid, totalFinalUnpaid };
  }, [filteredData]);

  // 图表数据 - 项目占比条形图
  const projectBarData = useMemo(() => {
    const projectMap = new Map<string, { payable: number; paid: number; unpaid: number }>();
    filteredData.forEach(c => {
      const key = c.projectName;
      const existing = projectMap.get(key) || { payable: 0, paid: 0, unpaid: 0 };
      existing.payable += c.payableAmount || 0;
      existing.paid += c.paidAmount || 0;
      existing.unpaid += c.unpaidAmount || 0;
      projectMap.set(key, existing);
    });
    return Array.from(projectMap.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.payable - a.payable);
  }, [filteredData]);

  // 图表数据 - 供应商付款进度
  const supplierPaymentData = useMemo(() => {
    const supplierMap = new Map<string, { settlement: number; paid: number; unpaid: number; rate: number }>();
    filteredData.forEach(c => {
      const key = c.supplierName;
      const existing = supplierMap.get(key) || { settlement: 0, paid: 0, unpaid: 0, rate: 0 };
      existing.settlement += c.totalSettlement || 0;
      existing.paid += c.paidAmount || 0;
      existing.unpaid += c.unpaidAmount || 0;
      supplierMap.set(key, existing);
    });
    return Array.from(supplierMap.entries())
      .map(([name, data]) => ({
        name: name.length > 6 ? name.substring(0, 6) + '...' : name,
        fullName: name,
        ...data,
        rate: data.settlement > 0 ? Math.round((data.paid / data.settlement) * 100) : 0,
      }))
      .sort((a, b) => b.settlement - a.settlement)
      .slice(0, 10);
  }, [filteredData]);

  // 分组数据 - 按项目分组
  const groupedData = useMemo(() => {
    const groups = new Map<string, RowData[]>();

    filteredData.forEach(row => {
      const key = row.projectName;
      const existing = groups.get(key) || [];
      existing.push(row);
      groups.set(key, existing);
    });

    // 排序：按组内未付金额合计降序
    const sorted = Array.from(groups.entries()).sort((a, b) => {
      const sumA = a[1].reduce((s, r) => s + r.unpaidAmount, 0);
      const sumB = b[1].reduce((s, r) => s + r.unpaidAmount, 0);
      return sumB - sumA;
    });

    return sorted.map(([name, rows]) => ({
      name,
      rows,
      summary: {
        progressPayable: rows.reduce((s, r) => s + r.progressPayable, 0),
        finalPayable: rows.reduce((s, r) => s + r.finalPayable, 0),
        paid: rows.reduce((s, r) => s + r.paidAmount, 0),
        progressUnpaid: rows.reduce((s, r) => s + r.progressUnpaid, 0),
        finalUnpaid: rows.reduce((s, r) => s + r.finalUnpaid, 0),
        count: rows.length,
      },
    }));
  }, [filteredData]);

  // 分页 - 基于扁平化后的行
  const paginatedGroups = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    const end = start + pageSize;
    let rowCount = 0;
    const result: Array<{ type: 'group' | 'row'; group?: typeof groupedData[0]; row?: RowData }> = [];

    for (const group of groupedData) {
      if (rowCount >= end) break;
      if (rowCount >= start) {
        result.push({ type: 'group', group });
      }
      rowCount++;

      const isCollapsed = collapsedGroups.has(group.name);
      if (!isCollapsed) {
        for (const row of group.rows) {
          if (rowCount >= start && rowCount < end) {
            result.push({ type: 'row', row });
          }
          rowCount++;
        }
      }
    }

    return result;
  }, [groupedData, currentPage, pageSize, collapsedGroups]);

  // 总行数（用于分页）
  const totalRows = useMemo(() => {
    let count = 0;
    for (const group of groupedData) {
      count++;
      if (!collapsedGroups.has(group.name)) {
        count += group.rows.length;
      }
    }
    return count;
  }, [groupedData, collapsedGroups]);

  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));

  // 重置页码
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedProject, selectedSupplier, selectedContractStatus]);

  const toggleGroup = (name: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const formatCurrency = (value: number | undefined | null) => {
    const v = Number(value) || 0;
    if (v >= 10000) return `¥${(v / 10000).toFixed(2)}万`;
    return `¥${v.toFixed(2)}`;
  };

  const formatCurrencyFull = (value: number | undefined | null) => {
    const v = Number(value) || 0;
    return `¥${v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // 导出Excel
  const exportExcel = () => {
    const exportData = filteredData.map(c => ({
      '项目': c.projectName,
      '供应商': c.supplierName,
      '合同名称': c.contract_name,
      '履约应付': c.progressPayable,
      '决算应付': c.finalPayable,
      '已付金额': c.paidAmount,
      '进度未付': c.progressUnpaid,
      '决算未付': c.finalUnpaid,
      '合同状态': c.hasFinalSettlement || c.locked ? '已决算' : '履约中',
    }));

    // 添加合计行
    exportData.push({
      '项目': '合计',
      '供应商': '',
      '合同名称': '',
      '履约应付': filteredData.reduce((s, c) => s + c.progressPayable, 0),
      '决算应付': filteredData.reduce((s, c) => s + c.finalPayable, 0),
      '已付金额': filteredData.reduce((s, c) => s + c.paidAmount, 0),
      '进度未付': filteredData.reduce((s, c) => s + c.progressUnpaid, 0),
      '决算未付': filteredData.reduce((s, c) => s + c.finalUnpaid, 0),
      '合同状态': '',
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    // 设置列宽
    ws['!cols'] = [
      { wch: 16 }, { wch: 16 }, { wch: 20 },
      { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
      { wch: 10 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '供应商成本应付');
    XLSX.writeFile(wb, `供应商成本应付台账_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // 获取状态颜色
  const getStatusStyle = (row: RowData) => {
    if (row.finalUnpaidAmount > 0 && row.hasFinalSettlement) return 'bg-red-100 text-red-700';
    if (row.unpaidAmount > 0) return 'bg-orange-100 text-orange-700';
    return 'bg-green-100 text-green-700';
  };

  const getStatusLabel = (row: RowData) => {
    if (row.finalUnpaidAmount > 0 && row.hasFinalSettlement) return '欠款';
    if (row.unpaidAmount > 0) return '未付清';
    return '已付清';
  };

  if (loading) {
    return <DashboardSkeleton />;
  }

  return (
    <StandardDashboardLayout
      filterBar={
        <FilterBar
          title="供应商成本应付看板"
          filters={
            <>
              <Select value={selectedProject} onValueChange={setSelectedProject}>
                <SelectTrigger className="h-9 w-[160px]"><SelectValue placeholder="全部项目" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部项目</SelectItem>
                  {projects.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={selectedSupplier} onValueChange={setSelectedSupplier}>
                <SelectTrigger className="h-9 w-[160px]"><SelectValue placeholder="全部供应商" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部供应商</SelectItem>
                  {suppliers.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={selectedContractStatus} onValueChange={setSelectedContractStatus}>
                <SelectTrigger className="h-9 w-[120px]"><SelectValue placeholder="全部状态" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部状态</SelectItem>
                  <SelectItem value="settled">已决算</SelectItem>
                  <SelectItem value="ongoing">履约中</SelectItem>
                  <SelectItem value="overdue">有未付款</SelectItem>
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
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">刷新</span>
              </Button>
            </>
          }
        />
      }
      kpiSection={
        <KpiSection cards={
          <>
            <KpiCard label="合同数" value={stats.totalContracts} />
            <KpiCard label="累计结算" value={formatCurrency(stats.totalSettlement)} />
            <KpiCard label="履约应付" value={formatCurrency(stats.totalProgressPayable)} />
            <KpiCard label="决算应付" value={formatCurrency(stats.totalFinalPayable)} />
            <KpiCard label="已付" value={formatCurrency(stats.totalPaid)} valueClassName="text-green-600" />
            <KpiCard label="进度未付" value={formatCurrency(stats.totalProgressUnpaid)} valueClassName="text-amber-600" />
            <KpiCard label="决算未付" value={formatCurrency(stats.totalFinalUnpaid)} valueClassName="text-red-600" />
            <KpiCard label="付款率" value={`${stats.totalPayable > 0 ? ((stats.totalPaid / stats.totalPayable) * 100).toFixed(1) : 0}%`} />
          </>
        } />
      }
      chartSection={
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <DashboardChartCard title="成本构成（按项目）">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={projectBarData} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" fontSize={11} tickFormatter={(v) => formatCurrency(v as number)} />
                <YAxis type="category" dataKey="name" fontSize={11} width={80} />
                <Tooltip formatter={(value) => formatCurrency(typeof value === 'number' ? value : Number(value))} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="paid" name="已付" fill="#10b981" stackId="a" />
                <Bar dataKey="unpaid" name="未付" fill="#f59e0b" stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          </DashboardChartCard>
          <DashboardChartCard title="供应商付款进度">
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={supplierPaymentData} margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" fontSize={11} />
                <YAxis yAxisId="left" fontSize={11} tickFormatter={(v) => formatCurrency(v as number)} />
                <YAxis yAxisId="right" orientation="right" fontSize={11} domain={[0, 100]} unit="%" />
                <Tooltip
                  formatter={(value, name) => {
                    const numVal = typeof value === 'number' ? value : Number(value);
                    if (name === '付款率') return `${numVal}%`;
                    return formatCurrency(numVal);
                  }}
                  labelFormatter={(label) => {
                    const item = supplierPaymentData?.find(d => d.name === label);
                    return item?.fullName || String(label || '');
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar yAxisId="left" dataKey="paid" name="已付" fill="#10b981" stackId="bar" />
                <Bar yAxisId="left" dataKey="unpaid" name="未付" fill="#f59e0b" stackId="bar" />
                <Line yAxisId="right" dataKey="rate" name="付款率" stroke="#3b82f6" strokeWidth={2}
                  dot={{ fill: '#3b82f6', r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </DashboardChartCard>
        </div>
      }
      ledgerSection={
        <CollapsibleSection
          title="明细台账"
          summary={`共 ${filteredData.length} 条合同，${groupedData.length} 个项目`}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: 900 }}>
              <thead>
                <tr className="border-b bg-muted/50 text-xs">
                  <th className="p-2 text-left w-8"></th>
                  <th className="p-2 text-left whitespace-nowrap" style={{ position: 'sticky', left: 0, background: 'inherit', zIndex: 1 }}>项目/供应商</th>
                  <th className="p-2 text-left whitespace-nowrap">合同名称</th>
                  <th className="p-2 text-right whitespace-nowrap">履约应付</th>
                  <th className="p-2 text-right whitespace-nowrap">决算应付</th>
                  <th className="p-2 text-right whitespace-nowrap">已付</th>
                  <th className="p-2 text-right whitespace-nowrap">进度未付</th>
                  <th className="p-2 text-right whitespace-nowrap">决算未付</th>
                  <th className="p-2 text-center whitespace-nowrap">状态</th>
                </tr>
              </thead>
              <tbody>
                {paginatedGroups.length === 0 ? (
                  <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">暂无数据</td></tr>
                ) : paginatedGroups.map((item) => {
                  if (item.type === 'group' && item.group) {
                    const g = item.group;
                    const isCollapsed = collapsedGroups.has(g.name);
                    const totalPayable = g.summary.progressPayable + g.summary.finalPayable;
                    return (
                      <tr key={`group-${g.name}`}
                        className="border-b bg-blue-50/60 cursor-pointer hover:bg-blue-100/50"
                        onClick={() => toggleGroup(g.name)}>
                        <td className="p-2 text-center">
                          {isCollapsed ? <ChevronRight className="h-4 w-4 text-blue-600" /> : <ChevronDown className="h-4 w-4 text-blue-600" />}
                        </td>
                        <td colSpan={2} className="p-2 font-medium text-blue-800">
                          {g.name}
                          <span className="ml-2 text-xs text-blue-500">({g.summary.count}个合同)</span>
                        </td>
                        <td className="p-2 text-right font-medium text-blue-800">{formatCurrency(g.summary.progressPayable)}</td>
                        <td className="p-2 text-right font-medium text-blue-800">{formatCurrency(g.summary.finalPayable)}</td>
                        <td className="p-2 text-right font-medium text-green-700">{formatCurrency(g.summary.paid)}</td>
                        <td className="p-2 text-right font-medium text-amber-700">{formatCurrency(g.summary.progressUnpaid)}</td>
                        <td className="p-2 text-right font-medium text-red-700">{formatCurrency(g.summary.finalUnpaid)}</td>
                        <td className="p-2 text-center">
                          <span className="text-xs text-blue-600">
                            {totalPayable > 0 ? `${((g.summary.paid / totalPayable) * 100).toFixed(0)}%` : '-'}
                          </span>
                        </td>
                      </tr>
                    );
                  }

                  if (item.type === 'row' && item.row) {
                    const r = item.row;
                    return (
                      <tr key={`row-${r.id}`} className="border-b hover:bg-muted/30">
                        <td className="p-2"></td>
                        <td className="p-2 whitespace-nowrap text-sm" style={{ position: 'sticky', left: 0, background: 'white', zIndex: 1 }}>{r.supplierName}</td>
                        <td className="p-2 whitespace-nowrap text-sm">{r.contract_name}</td>
                        <td className="p-2 text-right whitespace-nowrap text-sm">{formatCurrency(r.progressPayable)}</td>
                        <td className="p-2 text-right whitespace-nowrap text-sm">{formatCurrency(r.finalPayable)}</td>
                        <td className="p-2 text-right whitespace-nowrap text-sm text-green-600 font-medium">{formatCurrency(r.paidAmount)}</td>
                        <td className={`p-2 text-right whitespace-nowrap text-sm font-medium ${r.progressUnpaid > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                          {formatCurrency(r.progressUnpaid)}
                        </td>
                        <td className={`p-2 text-right whitespace-nowrap text-sm font-medium ${r.finalUnpaid > 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {formatCurrency(r.finalUnpaid)}
                        </td>
                        <td className="p-2 text-center whitespace-nowrap">
                          <span className={`px-1.5 py-0.5 rounded text-xs ${getStatusStyle(r)}`}>
                            {getStatusLabel(r)}
                          </span>
                        </td>
                      </tr>
                    );
                  }
                  return null;
                })}

                {/* 合计行 */}
                <tr className="border-t-2 border-muted bg-muted/30 font-bold">
                  <td className="p-2"></td>
                  <td colSpan={2} className="p-2">合计</td>
                  <td className="p-2 text-right">{formatCurrency(stats.totalProgressPayable)}</td>
                  <td className="p-2 text-right">{formatCurrency(stats.totalFinalPayable)}</td>
                  <td className="p-2 text-right text-green-600">{formatCurrency(stats.totalPaid)}</td>
                  <td className="p-2 text-right text-amber-600">{formatCurrency(stats.totalProgressUnpaid)}</td>
                  <td className="p-2 text-right text-red-600">{formatCurrency(stats.totalFinalUnpaid)}</td>
                  <td className="p-2 text-center text-xs">
                    {stats.totalPayable > 0 ? `${((stats.totalPaid / stats.totalPayable) * 100).toFixed(1)}%` : '-'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 分页 */}
          <div className="flex items-center justify-between px-4 py-3 border-t text-sm">
            <div className="text-muted-foreground text-xs">
              第 {currentPage}/{totalPages} 页，共 {totalRows} 行
            </div>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" disabled={currentPage <= 1}
                onClick={() => setCurrentPage(1)} className="h-7 px-2 text-xs">首页</Button>
              <Button variant="outline" size="sm" disabled={currentPage <= 1}
                onClick={() => setCurrentPage(p => p - 1)} className="h-7 px-2 text-xs">上一页</Button>
              <Button variant="outline" size="sm" disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage(p => p + 1)} className="h-7 px-2 text-xs">下一页</Button>
              <Button variant="outline" size="sm" disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage(totalPages)} className="h-7 px-2 text-xs">末页</Button>
            </div>
          </div>
        </CollapsibleSection>
      }
    />
  );
}
