'use client';
import { useToast } from '@/hooks/use-toast';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Plus, Pencil, Trash2, Search, Download, ChevronLeft, ChevronRight,
  FileText, RefreshCw, TrendingUp, Building2, Calendar, BarChart3
} from 'lucide-react';
import {
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';

const EXPENSE_TYPES = ['招待费', '差旅费', '房租水电', '现金帮工', '办公用品', '其他杂费'];
const TYPE_COLORS: Record<string, string> = {
  '招待费': '#165DFF',
  '差旅费': '#00B42A',
  '房租水电': '#FF7D00',
  '现金帮工': '#722ED1',
  '办公用品': '#0FC6C2',
  '其他杂费': '#86909C',
};

// 类型定义
interface Expense {
  id: number;
  project_id: number | null;
  expense_type: string;
  amount: string;
  expense_date: string;
  handler: string | null;
  remark: string | null;
  created_at: string;
  projects: { name: string } | null;
}

interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

interface Stats {
  totalCount: number;
  totalAmount: number;
  typeStats: Record<string, number>;
}

interface FullStats {
  summary: {
    totalCount: number;
    totalAmount: number;
    avgAmount: number;
  };
  typeStats: Record<string, { amount: number; count: number; percentage: number }>;
  projectDetails: Array<{ id: number; name: string; amount: number; count: number; percentage: number }>;
  monthlyStats: Array<{ month: string; amount: number; count: number }>;
}

export default function ComprehensiveExpensePage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64"><div className="text-center" style={{ color: '#86909C' }}>加载中...</div></div>}>
      <ComprehensiveExpenseContent />
    </Suspense>
  );
}

function ComprehensiveExpenseContent() {
  const searchParams = useSearchParams();
  const { toast } = useToast();
  
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [projects, setProjects] = useState<Array<{ id: number; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 20, total: 0, totalPages: 0 });
  const [stats, setStats] = useState<Stats>({ totalCount: 0, totalAmount: 0, typeStats: {} });
  const [fullStats, setFullStats] = useState<FullStats | null>(null);
  
  // 筛选条件
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [keyword, setKeyword] = useState('');
  
  // Tab状态
  const [activeTab, setActiveTab] = useState('list');
  
  // 对话框状态
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [currentExpense, setCurrentExpense] = useState<Expense | null>(null);
  const [saving, setSaving] = useState(false);
  
  // 表单
  const [form, setForm] = useState({
    project_id: '',
    expense_type: '',
    amount: '',
    expense_date: new Date().toISOString().split('T')[0],
    handler: '',
    remark: '',
  });

  useEffect(() => {
    // 从URL获取项目ID
    const projectIdParam = searchParams.get('projectId');
    if (projectIdParam) {
      setSelectedProjectId(projectIdParam);
    }
    
    fetchProjects();
    fetchExpenses();
    fetchFullStats();
  }, [searchParams]);

  useEffect(() => {
    fetchExpenses(1);
  }, [selectedProjectId, selectedType, startDate, endDate]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchExpenses(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [keyword]);

  const fetchProjects = async () => {
    try {
      const res = await fetch('/api/projects');
      const data = await res.json();
      setProjects(data.projects || []);
    } catch (error) {
      console.error('获取项目失败:', error);
    }
  };

  const fetchExpenses = async (page = pagination.page) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedProjectId !== 'all') params.append('projectId', selectedProjectId);
      if (selectedType !== 'all') params.append('expenseType', selectedType);
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      if (keyword) params.append('keyword', keyword);
      params.append('page', page.toString());
      params.append('pageSize', pagination.pageSize.toString());

      const res = await fetch(`/api/comprehensive-expenses?${params.toString()}`);
      const data = await res.json();

      if (res.ok) {
        setExpenses(data.expenses || []);
        setPagination(data.pagination);
        setStats(data.stats);
      }
    } catch (error) {
      console.error('获取费用列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchFullStats = async () => {
    try {
      const params = new URLSearchParams();
      params.append('year', new Date().getFullYear().toString());
      if (selectedProjectId !== 'all') {
        params.append('projectId', selectedProjectId);
      }

      const res = await fetch(`/api/comprehensive-expenses/stats?${params.toString()}`);
      const data = await res.json();
      setFullStats(data);
    } catch (error) {
      console.error('获取统计失败:', error);
    }
  };

  const handleAdd = () => {
    setForm({
      project_id: '',
      expense_type: '',
      amount: '',
      expense_date: new Date().toISOString().split('T')[0],
      handler: '',
      remark: '',
    });
    setAddDialogOpen(true);
  };

  const handleEdit = (expense: Expense) => {
    setCurrentExpense(expense);
    setForm({
      project_id: expense.project_id?.toString() || '',
      expense_type: expense.expense_type,
      amount: expense.amount,
      expense_date: expense.expense_date,
      handler: expense.handler || '',
      remark: expense.remark || '',
    });
    setEditDialogOpen(true);
  };

  const handleDelete = (expense: Expense) => {
    setCurrentExpense(expense);
    setDeleteDialogOpen(true);
  };

  const handleSaveAdd = async () => {
    if (!form.expense_type || !form.amount || !form.expense_date) {
      toast({ title: '提交失败', description: '请填写必填项：费用类型、金额、发生日期', variant: 'error' });
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/comprehensive-expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: form.project_id || null,
          expense_type: form.expense_type,
          amount: parseFloat(form.amount),
          expense_date: form.expense_date,
          handler: form.handler || null,
          remark: form.remark || null,
        }),
      });

      if (res.ok) {
        toast({ title: '添加成功' });
        setAddDialogOpen(false);
        fetchExpenses();
        fetchFullStats();
      } else {
        const data = await res.json();
        throw new Error(data.error);
      }
    } catch (error: any) {
      toast({ title: '添加失败', description: error.message, variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!currentExpense) return;
    
    setSaving(true);
    try {
      const res = await fetch(`/api/comprehensive-expenses/${currentExpense.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: form.project_id || null,
          expense_type: form.expense_type,
          amount: parseFloat(form.amount),
          expense_date: form.expense_date,
          handler: form.handler || null,
          remark: form.remark || null,
        }),
      });

      if (res.ok) {
        toast({ title: '修改成功' });
        setEditDialogOpen(false);
        fetchExpenses();
        fetchFullStats();
      } else {
        const data = await res.json();
        throw new Error(data.error);
      }
    } catch (error: any) {
      toast({ title: '修改失败', description: error.message, variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!currentExpense) return;
    
    try {
      const res = await fetch(`/api/comprehensive-expenses/${currentExpense.id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        toast({ title: '删除成功' });
        setDeleteDialogOpen(false);
        fetchExpenses();
        fetchFullStats();
      } else {
        const data = await res.json();
        throw new Error(data.error);
      }
    } catch (error: any) {
      toast({ title: '删除失败', description: error.message, variant: 'error' });
    }
  };

  const handleExport = async () => {
    try {
      const params = new URLSearchParams();
      if (selectedProjectId !== 'all') params.append('projectId', selectedProjectId);
      if (selectedType !== 'all') params.append('expenseType', selectedType);
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);

      const res = await fetch(`/api/comprehensive-expenses/export?${params.toString()}`);
      
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `综合费用_${new Date().toISOString().split('T')[0]}.xlsx`;
        link.click();
        URL.revokeObjectURL(url);
        toast({ title: '导出成功' });
      } else {
        const data = await res.json();
        throw new Error(data.error);
      }
    } catch (error: any) {
      toast({ title: '导出失败', description: error.message, variant: 'error' });
    }
  };

  // 费用类型颜色
  const getTypeColor = (type: string) => {
    return TYPE_COLORS[type] || '#86909C';
  };

  // 饼图数据
  const pieData = fullStats ? EXPENSE_TYPES
    .filter(type => fullStats.typeStats[type]?.amount > 0)
    .map(type => ({
      name: type,
      value: fullStats.typeStats[type].amount,
      color: TYPE_COLORS[type],
    })) : [];

  // 月度趋势数据
  const monthlyChartData = fullStats?.monthlyStats.map(m => ({
    month: m.month.substring(5) + '月',
    amount: m.amount / 10000,
    count: m.count,
  })) || [];

  return (
    <div className="p-4 md:p-6 space-y-5" style={{ background: '#F7F8FA', minHeight: '100vh' }}>
      {/* 页面标题 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-xl font-bold" style={{ color: '#1D2129' }}>🤝 综合费用管理</h1>
        <div className="mobile-action-grid sm:flex sm:w-auto sm:gap-2">
          <Button size="sm" onClick={handleAdd} style={{ background: '#165DFF' }} className="hover:opacity-90">
            <Plus className="w-4 h-4 mr-1" />
            新增费用
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport} style={{ borderColor: '#E5E6EB', color: '#4E5969' }}>
            <Download className="w-4 h-4 mr-1" />
            导出 Excel
          </Button>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card style={{ background: '#FFFFFF', border: '1px solid #E5E6EB', borderRadius: '8px' }}>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <FileText className="w-4 h-4" style={{ color: '#165DFF' }} />
              <p className="text-sm" style={{ color: '#86909C' }}>费用总数</p>
            </div>
            <p className="text-2xl font-bold" style={{ color: '#165DFF' }}>{stats.totalCount}</p>
          </CardContent>
        </Card>
        <Card style={{ background: '#FFFFFF', border: '1px solid #E5E6EB', borderRadius: '8px' }}>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4" style={{ color: '#FF7D00' }} />
              <p className="text-sm" style={{ color: '#86909C' }}>费用总额</p>
            </div>
            <p className="text-2xl font-bold" style={{ color: '#FF7D00' }}>
              ¥{(stats.totalAmount / 10000).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}万
            </p>
          </CardContent>
        </Card>
        <Card style={{ background: '#FFFFFF', border: '1px solid #E5E6EB', borderRadius: '8px' }}>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <BarChart3 className="w-4 h-4" style={{ color: '#165DFF' }} />
              <p className="text-sm" style={{ color: '#86909C' }}>招待费</p>
            </div>
            <p className="text-xl font-bold" style={{ color: '#165DFF' }}>
              ¥{((stats.typeStats['招待费'] || 0) / 10000).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}万
            </p>
          </CardContent>
        </Card>
        <Card style={{ background: '#FFFFFF', border: '1px solid #E5E6EB', borderRadius: '8px' }}>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <BarChart3 className="w-4 h-4" style={{ color: '#00B42A' }} />
              <p className="text-sm" style={{ color: '#86909C' }}>差旅费</p>
            </div>
            <p className="text-xl font-bold" style={{ color: '#00B42A' }}>
              ¥{((stats.typeStats['差旅费'] || 0) / 10000).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}万
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tab切换 */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-white border" style={{ borderColor: '#E5E6EB' }}>
          <TabsTrigger value="list" className="data-[state=active]:bg-blue-50 data-[state=active]:text-blue-600">费用列表</TabsTrigger>
          <TabsTrigger value="stats" className="data-[state=active]:bg-blue-50 data-[state=active]:text-blue-600">统计分析</TabsTrigger>
        </TabsList>

        {/* 费用列表 Tab */}
        <TabsContent value="list" className="space-y-5 mt-4">
          {/* 筛选区域 */}
          <Card style={{ background: '#FFFFFF', border: '1px solid #E5E6EB', borderRadius: '8px' }}>
            <CardContent className="py-4">
              <div className="grid gap-3 sm:flex sm:flex-wrap sm:items-center">
                <div className="relative min-w-0 flex-1 sm:min-w-[200px] sm:max-w-[300px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#86909C' }} />
                  <Input
                    placeholder="搜索经办人/备注..."
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    className="pl-9 h-8"
                  />
                </div>
                <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                  <SelectTrigger className="h-8 w-full sm:w-36">
                    <SelectValue placeholder="选择项目" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部项目</SelectItem>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={selectedType} onValueChange={setSelectedType}>
                  <SelectTrigger className="h-8 w-full sm:w-28">
                    <SelectValue placeholder="费用类型" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部类型</SelectItem>
                    {EXPENSE_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="h-8 w-full sm:w-32"
                  placeholder="开始日期"
                />
                <span className="hidden sm:inline" style={{ color: '#86909C' }}>至</span>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="h-8 w-full sm:w-32"
                  placeholder="结束日期"
                />
                <Button variant="outline" size="sm" onClick={() => fetchExpenses(1)} className="w-full sm:w-auto" style={{ borderColor: '#E5E6EB' }}>
                  <RefreshCw className="w-4 h-4 mr-1" />
                  刷新
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* 列表区域 */}
          <Card style={{ background: '#FFFFFF', border: '1px solid #E5E6EB', borderRadius: '8px' }}>
            <CardContent className="p-0">
              {loading ? (
                <div className="flex items-center justify-center h-40" style={{ color: '#86909C' }}>加载中...</div>
              ) : expenses.length > 0 ? (
                <>
                  {/* 桌面端表格 */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr style={{ background: '#F7F8FA' }}>
                          <th className="px-4 py-3 text-left text-xs font-medium" style={{ color: '#86909C' }}>项目名称</th>
                          <th className="px-4 py-3 text-left text-xs font-medium" style={{ color: '#86909C' }}>费用类型</th>
                          <th className="px-4 py-3 text-right text-xs font-medium" style={{ color: '#86909C' }}>金额</th>
                          <th className="px-4 py-3 text-left text-xs font-medium" style={{ color: '#86909C' }}>发生日期</th>
                          <th className="px-4 py-3 text-left text-xs font-medium" style={{ color: '#86909C' }}>经办人</th>
                          <th className="px-4 py-3 text-left text-xs font-medium" style={{ color: '#86909C' }}>备注</th>
                          <th className="px-4 py-3 text-center text-xs font-medium" style={{ color: '#86909C' }}>操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {expenses.map((expense, idx) => (
                          <tr key={expense.id} className={idx < expenses.length - 1 ? 'border-b' : ''} style={{ borderColor: '#E5E6EB' }}>
                            <td className="px-4 py-3 text-sm" style={{ color: '#1D2129' }}>
                              {expense.projects?.name || <span style={{ color: '#86909C' }}>全局费用</span>}
                            </td>
                            <td className="px-4 py-3">
                              <Badge style={{ background: `${getTypeColor(expense.expense_type)}15`, color: getTypeColor(expense.expense_type) }}>
                                {expense.expense_type}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-sm text-right font-medium" style={{ color: '#1D2129' }}>
                              ¥{parseFloat(expense.amount).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="px-4 py-3 text-sm" style={{ color: '#4E5969' }}>{expense.expense_date}</td>
                            <td className="px-4 py-3 text-sm" style={{ color: '#4E5969' }}>{expense.handler || '-'}</td>
                            <td className="px-4 py-3 text-sm max-w-[200px] truncate" style={{ color: '#86909C' }}>{expense.remark || '-'}</td>
                            <td className="px-4 py-3 text-center">
                              <div className="flex items-center justify-center gap-2">
                                <Button variant="ghost" size="sm" onClick={() => handleEdit(expense)} style={{ color: '#165DFF' }}>
                                  <Pencil className="w-4 h-4" />
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => handleDelete(expense)} style={{ color: '#F53F3F' }}>
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* 移动端列表 */}
                  <div className="md:hidden divide-y" style={{ borderColor: '#E5E6EB' }}>
                    {expenses.map((expense) => (
                      <div key={expense.id} className="p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <Badge style={{ background: `${getTypeColor(expense.expense_type)}15`, color: getTypeColor(expense.expense_type) }}>
                            {expense.expense_type}
                          </Badge>
                          <span className="text-lg font-bold" style={{ color: '#1D2129' }}>
                            ¥{parseFloat(expense.amount).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span style={{ color: '#4E5969' }}>{expense.projects?.name || '全局费用'}</span>
                          <span style={{ color: '#86909C' }}>{expense.expense_date}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm" style={{ color: '#86909C' }}>{expense.handler || '-'}</span>
                          <div className="flex gap-2">
                            <Button variant="ghost" size="sm" onClick={() => handleEdit(expense)} style={{ color: '#165DFF' }}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handleDelete(expense)} style={{ color: '#F53F3F' }}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* 分页 */}
                  {pagination.totalPages > 1 && (
                    <div className="grid gap-3 px-4 py-3 border-t sm:flex sm:items-center sm:justify-between" style={{ borderColor: '#E5E6EB' }}>
                      <span className="text-sm" style={{ color: '#86909C' }}>
                        共 {pagination.total} 条，第 {pagination.page}/{pagination.totalPages} 页
                      </span>
                      <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={pagination.page === 1}
                          onClick={() => fetchExpenses(pagination.page - 1)}
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={pagination.page === pagination.totalPages}
                          onClick={() => fetchExpenses(pagination.page + 1)}
                        >
                          <ChevronRight className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-12" style={{ color: '#86909C' }}>
                  <FileText className="w-12 h-12 mb-3" style={{ color: '#C9CDD4' }} />
                  <p>暂无综合费用</p>
                  <Button size="sm" className="mt-3" onClick={handleAdd} style={{ background: '#165DFF' }}>
                    <Plus className="w-4 h-4 mr-1" />
                    新增费用
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 统计分析 Tab */}
        <TabsContent value="stats" className="space-y-5 mt-4">
          {fullStats ? (
            <>
              {/* 汇总卡片 */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card style={{ background: '#FFFFFF', border: '1px solid #E5E6EB', borderRadius: '8px' }}>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-2">
                      <FileText className="w-4 h-4" style={{ color: '#165DFF' }} />
                      <p className="text-sm" style={{ color: '#86909C' }}>费用总数</p>
                    </div>
                    <p className="text-3xl font-bold" style={{ color: '#165DFF' }}>{fullStats.summary.totalCount}</p>
                  </CardContent>
                </Card>
                <Card style={{ background: '#FFFFFF', border: '1px solid #E5E6EB', borderRadius: '8px' }}>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp className="w-4 h-4" style={{ color: '#FF7D00' }} />
                      <p className="text-sm" style={{ color: '#86909C' }}>费用总额</p>
                    </div>
                    <p className="text-2xl font-bold" style={{ color: '#FF7D00' }}>
                      ¥{(fullStats.summary.totalAmount / 10000).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}万
                    </p>
                  </CardContent>
                </Card>
                <Card style={{ background: '#FFFFFF', border: '1px solid #E5E6EB', borderRadius: '8px' }}>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Calendar className="w-4 h-4" style={{ color: '#00B42A' }} />
                      <p className="text-sm" style={{ color: '#86909C' }}>平均每笔</p>
                    </div>
                    <p className="text-2xl font-bold" style={{ color: '#00B42A' }}>
                      ¥{(fullStats.summary.avgAmount / 10000).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}万
                    </p>
                  </CardContent>
                </Card>
                <Card style={{ background: '#FFFFFF', border: '1px solid #E5E6EB', borderRadius: '8px' }}>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Building2 className="w-4 h-4" style={{ color: '#722ED1' }} />
                      <p className="text-sm" style={{ color: '#86909C' }}>涉及项目</p>
                    </div>
                    <p className="text-3xl font-bold" style={{ color: '#722ED1' }}>{fullStats.projectDetails.length}</p>
                  </CardContent>
                </Card>
              </div>

              {/* 费用类型分布 & 月度趋势 */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* 费用类型分布 */}
                <Card style={{ background: '#FFFFFF', border: '1px solid #E5E6EB', borderRadius: '8px' }}>
                  <CardHeader className="py-3 border-b" style={{ borderColor: '#E5E6EB' }}>
                    <CardTitle className="text-sm font-semibold" style={{ color: '#1D2129' }}>费用类型分布</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4">
                    {pieData.length > 0 ? (
                      <div className="flex flex-col sm:flex-row items-center gap-4">
                        <div className="w-48 h-48">
                          <ResponsiveContainer width="100%" height="100%">
                            <RechartsPieChart>
                              <RechartsTooltip
                                formatter={(value: number) => [`¥${(value / 10000).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}万元`, '']}
                              />
                              <Pie
                                data={pieData}
                                cx="50%"
                                cy="50%"
                                innerRadius={50}
                                outerRadius={70}
                                paddingAngle={2}
                                dataKey="value"
                              >
                                {pieData.map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                              </Pie>
                            </RechartsPieChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="flex-1 space-y-2 w-full">
                          {EXPENSE_TYPES.map(type => {
                            const data = fullStats.typeStats[type];
                            if (!data || data.amount === 0) return null;
                            return (
                              <div key={type} className="flex items-center justify-between p-2 rounded-lg" style={{ background: `${TYPE_COLORS[type]}15` }}>
                                <div className="flex items-center gap-2">
                                  <div className="w-3 h-3 rounded-full" style={{ background: TYPE_COLORS[type] }} />
                                  <span className="text-sm" style={{ color: '#1D2129' }}>{type}</span>
                                </div>
                                <div className="text-right">
                                  <span className="text-sm font-bold" style={{ color: TYPE_COLORS[type] }}>
                                    ¥{(data.amount / 10000).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}万
                                  </span>
                                  <span className="text-xs ml-1" style={{ color: '#86909C' }}>({data.percentage.toFixed(1)}%)</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-40" style={{ color: '#86909C' }}>暂无数据</div>
                    )}
                  </CardContent>
                </Card>

                {/* 月度趋势 */}
                <Card style={{ background: '#FFFFFF', border: '1px solid #E5E6EB', borderRadius: '8px' }}>
                  <CardHeader className="py-3 border-b" style={{ borderColor: '#E5E6EB' }}>
                    <CardTitle className="text-sm font-semibold" style={{ color: '#1D2129' }}>月度费用趋势</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4">
                    {monthlyChartData.some(d => d.amount > 0) ? (
                      <div className="h-56">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={monthlyChartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#E5E6EB" />
                            <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#86909C' }} />
                            <YAxis tick={{ fontSize: 12, fill: '#86909C' }} />
                            <RechartsTooltip
                              formatter={(value: number) => [`¥${value.toLocaleString('zh-CN')}万元`, '']}
                            />
                            <Bar dataKey="amount" fill="#165DFF" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-40" style={{ color: '#86909C' }}>暂无数据</div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* 项目费用排行 */}
              <Card style={{ background: '#FFFFFF', border: '1px solid #E5E6EB', borderRadius: '8px' }}>
                <CardHeader className="py-3 border-b" style={{ borderColor: '#E5E6EB' }}>
                  <CardTitle className="text-sm font-semibold" style={{ color: '#1D2129' }}>项目费用排行</CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                  {fullStats.projectDetails.length > 0 ? (
                    <div className="space-y-2">
                      {fullStats.projectDetails.slice(0, 10).map((project, idx) => (
                        <div key={project.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50">
                          <span className="w-6 h-6 flex items-center justify-center text-xs font-bold rounded-full" 
                            style={{ background: idx < 3 ? '#165DFF' : '#E5E6EB', color: idx < 3 ? '#FFFFFF' : '#86909C' }}>
                            {idx + 1}
                          </span>
                          <div className="flex-1">
                            <p className="text-sm font-medium" style={{ color: '#1D2129' }}>{project.name}</p>
                            <p className="text-xs" style={{ color: '#86909C' }}>{project.count} 笔费用</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-bold" style={{ color: '#FF7D00' }}>
                              ¥{(project.amount / 10000).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}万
                            </p>
                            <p className="text-xs" style={{ color: '#86909C' }}>{project.percentage.toFixed(1)}%</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-20" style={{ color: '#86909C' }}>暂无数据</div>
                  )}
                </CardContent>
              </Card>
            </>
          ) : (
            <div className="flex items-center justify-center h-64" style={{ color: '#86909C' }}>加载中...</div>
          )}
        </TabsContent>
      </Tabs>

      {/* 新增对话框 */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle>新增综合费用</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>关联项目（可选）</Label>
              <Select value={form.project_id} onValueChange={(v) => setForm({ ...form, project_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="选择项目（不选则为全局费用）" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">不关联项目（全局费用）</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>费用类型 <span style={{ color: '#F53F3F' }}>*</span></Label>
              <Select value={form.expense_type} onValueChange={(v) => setForm({ ...form, expense_type: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="选择费用类型" />
                </SelectTrigger>
                <SelectContent>
                  {EXPENSE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>金额（元）<span style={{ color: '#F53F3F' }}>*</span></Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>发生日期 <span style={{ color: '#F53F3F' }}>*</span></Label>
                <Input
                  type="date"
                  value={form.expense_date}
                  onChange={(e) => setForm({ ...form, expense_date: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>经办人</Label>
              <Input
                value={form.handler}
                onChange={(e) => setForm({ ...form, handler: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>备注</Label>
              <Textarea
                value={form.remark}
                onChange={(e) => setForm({ ...form, remark: e.target.value })}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>取消</Button>
            <Button onClick={handleSaveAdd} disabled={saving} style={{ background: '#165DFF' }}>
              {saving ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 编辑对话框 */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle>编辑综合费用</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>关联项目</Label>
              <Select value={form.project_id} onValueChange={(v) => setForm({ ...form, project_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="选择项目" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">不关联项目</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>费用类型</Label>
              <Select value={form.expense_type} onValueChange={(v) => setForm({ ...form, expense_type: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="选择类型" />
                </SelectTrigger>
                <SelectContent>
                  {EXPENSE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>金额</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>发生日期</Label>
                <Input
                  type="date"
                  value={form.expense_date}
                  onChange={(e) => setForm({ ...form, expense_date: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>经办人</Label>
              <Input
                value={form.handler}
                onChange={(e) => setForm({ ...form, handler: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>备注</Label>
              <Textarea
                value={form.remark}
                onChange={(e) => setForm({ ...form, remark: e.target.value })}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>取消</Button>
            <Button onClick={handleSaveEdit} disabled={saving} style={{ background: '#165DFF' }}>
              {saving ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认对话框 */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="w-[calc(100vw-1.5rem)] max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除这条综合费用记录吗？此操作不可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="bg-red-500 hover:bg-red-600">
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
