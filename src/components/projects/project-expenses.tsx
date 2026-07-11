'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
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
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
} from 'recharts';
import { Plus, Pencil, Trash2, FileSpreadsheet, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const EXPENSE_TYPES = ['招待费', '差旅费', '房租水电', '现金帮工', '办公用品', '其他杂费'];
const TYPE_COLORS: Record<string, string> = {
  '招待费': '#165DFF',
  '差旅费': '#00B42A',
  '房租水电': '#FF7D00',
  '现金帮工': '#722ED1',
  '办公用品': '#0FC6C2',
  '其他杂费': '#86909C',
};

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

interface ProjectExpensesProps {
  projectId: number;
}

export function ProjectExpenses({ projectId }: ProjectExpensesProps) {
  const { toast } = useToast();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalAmount, setTotalAmount] = useState(0);
  const [typeStats, setTypeStats] = useState<Record<string, number>>({});

  // 对话框状态
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [currentExpense, setCurrentExpense] = useState<Expense | null>(null);
  const [saving, setSaving] = useState(false);

  // 表单数据
  const [form, setForm] = useState({
    expense_type: '',
    amount: '',
    expense_date: new Date().toISOString().split('T')[0],
    handler: '',
    remark: '',
  });

  useEffect(() => {
    fetchExpenses();
  }, [projectId]);

  const fetchExpenses = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/comprehensive-expenses?projectId=${projectId}&pageSize=100`);
      const data = await res.json();
      
      if (res.ok) {
        setExpenses(data.expenses || []);
        setTotalAmount(data.stats?.totalAmount || 0);
        setTypeStats(data.stats?.typeStats || {});
      }
    } catch (error) {
      console.error('获取综合费用失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!form.expense_type || !form.amount || !form.expense_date) {
      toast({ title: '请填写必填项', variant: 'error' });
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/comprehensive-expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
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
        resetForm();
        fetchExpenses();
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

  const handleEdit = (expense: Expense) => {
    setCurrentExpense(expense);
    setForm({
      expense_type: expense.expense_type,
      amount: expense.amount,
      expense_date: expense.expense_date,
      handler: expense.handler || '',
      remark: expense.remark || '',
    });
    setEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!currentExpense) return;
    
    setSaving(true);
    try {
      const res = await fetch(`/api/comprehensive-expenses/${currentExpense.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
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

  const handleDelete = (expense: Expense) => {
    setCurrentExpense(expense);
    setDeleteDialogOpen(true);
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
      } else {
        const data = await res.json();
        throw new Error(data.error);
      }
    } catch (error: any) {
      toast({ title: '删除失败', description: error.message, variant: 'error' });
    }
  };

  const resetForm = () => {
    setForm({
      expense_type: '',
      amount: '',
      expense_date: new Date().toISOString().split('T')[0],
      handler: '',
      remark: '',
    });
  };

  // 饼图数据
  const pieData = EXPENSE_TYPES
    .filter(type => typeStats[type] > 0)
    .map(type => ({
      name: type,
      value: typeStats[type],
      color: TYPE_COLORS[type],
    }));

  // 格式化金额
  const formatAmount = (amount: number) => {
    return `¥${(amount / 10000).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}万`;
  };

  return (
    <>
      <Card style={{ background: '#FFFFFF', border: '1px solid #E5E6EB', borderRadius: '8px' }}>
        <CardHeader className="py-3 border-b" style={{ borderColor: '#E5E6EB' }}>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base font-semibold" style={{ color: '#1D2129' }}>
              <FileSpreadsheet className="w-5 h-5" style={{ color: '#165DFF' }} />
              综合费用
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={fetchExpenses} style={{ borderColor: '#E5E6EB' }}>
                <RefreshCw className="w-4 h-4 mr-1" />
                刷新
              </Button>
              <Button size="sm" style={{ background: '#165DFF' }} onClick={() => { resetForm(); setAddDialogOpen(true); }}>
                <Plus className="w-4 h-4 mr-1" />
                新增
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          {loading ? (
            <div className="flex items-center justify-center h-20" style={{ color: '#86909C' }}>加载中...</div>
          ) : expenses.length > 0 ? (
            <div className="space-y-4">
              {/* 统计概览 */}
              <div className="flex flex-col sm:flex-row items-center gap-4">
                {/* 饼图 */}
                <div className="w-32 h-32">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsPieChart>
                      <RechartsTooltip
                        formatter={(value: number) => [`¥${(value / 10000).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}万`, '']}
                      />
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={30}
                        outerRadius={45}
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
                
                {/* 类型统计 */}
                <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-2 w-full">
                  {EXPENSE_TYPES.map(type => (
                    <div key={type} className="p-2 rounded-lg" style={{ background: `${TYPE_COLORS[type]}10` }}>
                      <p className="text-xs" style={{ color: '#86909C' }}>{type}</p>
                      <p className="text-sm font-bold" style={{ color: TYPE_COLORS[type] }}>
                        {formatAmount(typeStats[type] || 0)}
                      </p>
                    </div>
                  ))}
                </div>
                
                {/* 合计 */}
                <div className="text-center p-3 rounded-lg" style={{ background: '#F7F8FA' }}>
                  <p className="text-xs" style={{ color: '#86909C' }}>合计</p>
                  <p className="text-lg font-bold" style={{ color: '#FF7D00' }}>{formatAmount(totalAmount)}</p>
                </div>
              </div>

              {/* 费用列表 */}
              <div className="hidden md:block overflow-x-auto max-h-60">
                <Table>
                  <TableHeader>
                    <TableRow style={{ background: '#F7F8FA' }}>
                      <TableHead className="text-xs" style={{ color: '#86909C' }}>费用类型</TableHead>
                      <TableHead className="text-xs text-right" style={{ color: '#86909C' }}>金额</TableHead>
                      <TableHead className="text-xs" style={{ color: '#86909C' }}>发生日期</TableHead>
                      <TableHead className="text-xs" style={{ color: '#86909C' }}>经办人</TableHead>
                      <TableHead className="text-xs" style={{ color: '#86909C' }}>备注</TableHead>
                      <TableHead className="text-xs text-center" style={{ color: '#86909C' }}>操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {expenses.map((expense) => (
                      <TableRow key={expense.id}>
                        <TableCell>
                          <Badge style={{ background: `${TYPE_COLORS[expense.expense_type]}15`, color: TYPE_COLORS[expense.expense_type] }}>
                            {expense.expense_type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          ¥{parseFloat(expense.amount).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell style={{ color: '#4E5969' }}>{expense.expense_date}</TableCell>
                        <TableCell style={{ color: '#4E5969' }}>{expense.handler || '-'}</TableCell>
                        <TableCell className="max-w-[150px] truncate" style={{ color: '#86909C' }}>{expense.remark || '-'}</TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button variant="ghost" size="sm" onClick={() => handleEdit(expense)} style={{ color: '#165DFF' }}>
                              <Pencil className="w-3 h-3" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handleDelete(expense)} style={{ color: '#F53F3F' }}>
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* 移动端列表 */}
              <div className="md:hidden space-y-2 max-h-60 overflow-y-auto">
                {expenses.map((expense) => (
                  <div key={expense.id} className="p-3 rounded-lg border" style={{ borderColor: '#E5E6EB' }}>
                    <div className="flex items-center justify-between mb-2">
                      <Badge style={{ background: `${TYPE_COLORS[expense.expense_type]}15`, color: TYPE_COLORS[expense.expense_type] }}>
                        {expense.expense_type}
                      </Badge>
                      <span className="font-bold">¥{parseFloat(expense.amount).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm" style={{ color: '#86909C' }}>
                      <span>{expense.expense_date}</span>
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm" onClick={() => handleEdit(expense)} style={{ color: '#165DFF' }}>
                          <Pencil className="w-3 h-3" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(expense)} style={{ color: '#F53F3F' }}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8" style={{ color: '#86909C' }}>
              <FileSpreadsheet className="w-12 h-12 mb-3" style={{ color: '#C9CDD4' }} />
              <p>暂无综合费用</p>
              <Button size="sm" className="mt-3" style={{ background: '#165DFF' }} onClick={() => { resetForm(); setAddDialogOpen(true); }}>
                <Plus className="w-4 h-4 mr-1" />
                新增费用
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 新增对话框 */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>新增综合费用</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>金额 <span style={{ color: '#F53F3F' }}>*</span></Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  placeholder="请输入金额"
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
                placeholder="请输入经办人姓名"
              />
            </div>
            <div className="space-y-2">
              <Label>备注</Label>
              <Textarea
                value={form.remark}
                onChange={(e) => setForm({ ...form, remark: e.target.value })}
                placeholder="请输入备注"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>取消</Button>
            <Button onClick={handleAdd} disabled={saving} style={{ background: '#165DFF' }}>
              {saving ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 编辑对话框 */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>编辑综合费用</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>费用类型</Label>
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>金额</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
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
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>取消</Button>
            <Button onClick={handleSaveEdit} disabled={saving} style={{ background: '#165DFF' }}>
              {saving ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认对话框 */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
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
    </>
  );
}
