'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  LineChart, Line, ResponsiveContainer
} from 'recharts';
import {
  Search, Download, TrendingUp, AlertTriangle, CheckCircle, Clock, DollarSign
} from 'lucide-react';

interface Supplier {
  id: number;
  name: string;
  type?: string;
}

interface Project {
  id: number;
  name: string;
}

interface AccountItem {
  supplier_id: number;
  supplier_name: string;
  supplier_type?: string;
  project_id?: number;
  project_name?: string;
  contract_id: number;
  contract_name: string;
  contract_no: string;
  total_amount: number;
  total_settlement: number;
  payable_amount: number;
  paid_amount: number;
  pending_amount: number;
  warranty_amount: number;
  final_payment: number;
  contract_status: string;
}

interface ChartData {
  name: string;
  value: number;
  color: string;
}

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

export default function AccountDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [accountData, setAccountData] = useState<AccountItem[]>([]);
  const [summary, setSummary] = useState({
    totalContracts: 0,
    totalAmount: 0,
    totalSettlement: 0,
    totalPayable: 0,
    totalPaid: 0,
    totalPending: 0,
    totalWarranty: 0,
    totalFinalPayment: 0,
  });

  // 筛选状态
  const [filterSupplier, setFilterSupplier] = useState<string>('all');
  const [filterProject, setFilterProject] = useState<string>('all');
  const [filterSupplierType, setFilterSupplierType] = useState<string>('all');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [showOverdueOnly, setShowOverdueOnly] = useState(false);

  // 获取数据
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterSupplier !== 'all') params.set('supplier_id', filterSupplier);
      if (filterProject !== 'all') params.set('project_id', filterProject);

      const res = await fetch(`/api/supplier-contracts/account-dashboard?${params}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setAccountData(data.items || []);
        setSummary(data.summary || summary);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [filterSupplier, filterProject]);

  const fetchSuppliers = async () => {
    try {
      const res = await fetch('/api/suppliers', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setSuppliers(data.suppliers || []);
      }
    } catch (e) { console.error(e); }
  };

  const fetchProjects = async () => {
    try {
      const res = await fetch('/api/projects', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setProjects(data.projects || []);
      }
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    fetchSuppliers();
    fetchProjects();
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 筛选数据
  const filteredData = useMemo(() => {
    return accountData.filter(item => {
      if (filterSupplierType !== 'all' && item.supplier_type !== filterSupplierType) return false;
      if (showOverdueOnly && item.pending_amount <= 0) return false;
      if (searchKeyword) {
        const kw = searchKeyword.toLowerCase();
        return (
          item.supplier_name?.toLowerCase().includes(kw) ||
          item.contract_name?.toLowerCase().includes(kw) ||
          item.contract_no?.toLowerCase().includes(kw)
        );
      }
      return true;
    });
  }, [accountData, filterSupplierType, showOverdueOnly, searchKeyword]);

  // 图表数据
  const costPieData: ChartData[] = useMemo(() => {
    const typeMap = new Map<string, number>();
    filteredData.forEach(item => {
      const type = item.supplier_type || '其他';
      typeMap.set(type, (typeMap.get(type) || 0) + item.total_settlement);
    });
    return Array.from(typeMap.entries()).map(([name, value], index) => ({
      name,
      value: Math.round(value),
      color: COLORS[index % COLORS.length],
    }));
  }, [filteredData]);

  const payableBarData = useMemo(() => {
    return filteredData.slice(0, 10).map(item => ({
      name: item.supplier_name?.substring(0, 6) || '未知',
      应付: item.payable_amount,
      已付: item.paid_amount,
      未付: item.pending_amount,
    }));
  }, [filteredData]);

  // 导出
  const handleExport = () => {
    const headers = ['供应商', '合同名称', '合同金额', '累计结算', '应付金额', '已付金额', '未付金额', '质保金', '尾款', '状态'];
    const rows = filteredData.map(item => [
      item.supplier_name, item.contract_name,
      item.total_amount, item.total_settlement, item.payable_amount,
      item.paid_amount, item.pending_amount, item.warranty_amount,
      item.final_payment, item.contract_status,
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `应付台账_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    toast.success('导出成功');
  };

  return (
    <div className="container mx-auto py-4 space-y-4">
      {/* 头部 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <h1 className="text-xl font-bold">应付台账</h1>
        <Button variant="outline" onClick={handleExport}>
          <Download className="w-4 h-4 mr-1" /> 导出
        </Button>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <Card><CardContent className="pt-3 px-3">
          <div className="text-xs text-muted-foreground">合同数量</div>
          <div className="text-xl font-bold">{summary.totalContracts}</div>
        </CardContent></Card>
        <Card><CardContent className="pt-3 px-3">
          <div className="text-xs text-muted-foreground">合同总额</div>
          <div className="text-xl font-bold truncate" title={String(summary.totalAmount)}>
            ¥{(summary.totalAmount / 10000).toFixed(1)}万
          </div>
        </CardContent></Card>
        <Card><CardContent className="pt-3 px-3">
          <div className="text-xs text-muted-foreground">累计结算</div>
          <div className="text-xl font-bold text-blue-600 truncate">
            ¥{(summary.totalSettlement / 10000).toFixed(1)}万
          </div>
        </CardContent></Card>
        <Card><CardContent className="pt-3 px-3">
          <div className="text-xs text-muted-foreground">已付金额</div>
          <div className="text-xl font-bold text-green-600 truncate">
            ¥{(summary.totalPaid / 10000).toFixed(1)}万
          </div>
        </CardContent></Card>
        <Card className={summary.totalPending > 0 ? 'border-red-200' : ''}>
          <CardContent className="pt-3 px-3">
            <div className="text-xs text-muted-foreground">未付金额</div>
            <div className={`text-xl font-bold ${summary.totalPending > 0 ? 'text-red-600' : ''} truncate`}>
              ¥{(summary.totalPending / 10000).toFixed(1)}万
            </div>
          </CardContent></Card>
      </div>

      {/* 图表区域 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* 成本占比饼图 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">成本构成</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              {costPieData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={costPieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {costPieData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => `¥${(Number(v) / 10000).toFixed(1)}万`} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">暂无数据</div>
              )}
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {costPieData.map((item, index) => (
                <div key={item.name} className="flex items-center gap-1 text-xs">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                  {item.name}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* 应付已付对比柱状图 */}
        <Card className="md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">应付已付对比（Top10）</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              {payableBarData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={payableBarData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v) => `¥${Number(v).toLocaleString()}`} />
                    <Legend />
                    <Bar dataKey="应付" fill="#3B82F6" />
                    <Bar dataKey="已付" fill="#10B981" />
                    <Bar dataKey="未付" fill="#EF4444" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">暂无数据</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 筛选区域 */}
      <Card>
        <CardContent className="pt-3 px-3">
          <div className="flex flex-wrap gap-2">
            <Select value={filterSupplier} onValueChange={setFilterSupplier}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="供应商" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部供应商</SelectItem>
                {suppliers.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={filterProject} onValueChange={setFilterProject}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="项目" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部项目</SelectItem>
                {projects.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={filterSupplierType} onValueChange={setFilterSupplierType}>
              <SelectTrigger className="w-[120px]"><SelectValue placeholder="类型" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部类型</SelectItem>
                <SelectItem value="supplier">供应商</SelectItem>
                <SelectItem value="team">班组</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant={showOverdueOnly ? 'default' : 'outline'}
              size="sm"
              onClick={() => setShowOverdueOnly(!showOverdueOnly)}
            >
              <AlertTriangle className="w-4 h-4 mr-1" /> 欠款预警
            </Button>

            <Input
              placeholder="搜索..."
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              className="flex-1 min-w-[150px]"
            />
          </div>
        </CardContent>
      </Card>

      {/* 数据表格 */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>供应商</TableHead>
                  <TableHead>合同名称</TableHead>
                  <TableHead className="text-right">合同金额</TableHead>
                  <TableHead className="text-right">累计结算</TableHead>
                  <TableHead className="text-right">应付金额</TableHead>
                  <TableHead className="text-right">已付</TableHead>
                  <TableHead className="text-right">未付</TableHead>
                  <TableHead className="text-right">质保金</TableHead>
                  <TableHead className="text-right">尾款</TableHead>
                  <TableHead>状态</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={10} className="text-center py-8">加载中...</TableCell></TableRow>
                ) : filteredData.length === 0 ? (
                  <TableRow><TableCell colSpan={10} className="text-center py-8">暂无数据</TableCell></TableRow>
                ) : (
                  filteredData.map((item, idx) => (
                    <TableRow key={idx} className={item.pending_amount > 0 ? 'bg-red-50' : ''}>
                      <TableCell className="font-medium">{item.supplier_name}</TableCell>
                      <TableCell className="max-w-[120px] truncate" title={item.contract_name}>
                        {item.contract_name}
                      </TableCell>
                      <TableCell className="text-right">{item.total_amount.toLocaleString()}</TableCell>
                      <TableCell className="text-right text-blue-600">{item.total_settlement.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{item.payable_amount.toLocaleString()}</TableCell>
                      <TableCell className="text-right text-green-600">{item.paid_amount.toLocaleString()}</TableCell>
                      <TableCell className={`text-right font-bold ${item.pending_amount > 0 ? 'text-red-600' : ''}`}>
                        {item.pending_amount.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right text-purple-600">{item.warranty_amount.toLocaleString()}</TableCell>
                      <TableCell className="text-right text-orange-600">{item.final_payment.toLocaleString()}</TableCell>
                      <TableCell>
                        <Badge variant={item.contract_status === '已完结' ? 'default' : 'secondary'}>
                          {item.contract_status === '已完结' ? '已完结' : '履约中'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
