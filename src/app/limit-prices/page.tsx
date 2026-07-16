'use client';
import { useToast } from '@/hooks/use-toast';
import { isSuperAdminUser } from '@/lib/route-permissions';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Card, CardContent, CardHeader, CardTitle
} from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  Plus, Search, Trash2, Edit, CheckCircle, XCircle,
  Download, AlertTriangle, Eye, Upload, FileSpreadsheet
} from 'lucide-react';

interface Project {
  id: number;
  name: string;
}

interface LimitPrice {
  id: number;
  project_id: number;
  project?: { id: number; name: string };
  subitem_name: string;
  work_type: string;
  team_name: string;
  unit: string;
  limit_unit_price: number;
  plan_quantity: number;
  limit_total_price: number;
  actual_quantity: number;
  actual_unit_price: number;
  actual_total_price: number;
  price_difference: number;
  excess_amount: number;
  status: string;
  remark: string;
  created_by_name: string;
  created_at: string;
  reviewed_by_name: string;
  reviewed_at: string;
  invalidated_by_name: string;
  invalidated_at: string;
  invalidate_reason: string;
}

interface Stats {
  total: number;
  draft: number;
  active: number;
  invalidated: number;
  totalLimitAmount: number;
  totalActualAmount: number;
  totalExcess: number;
}

interface User {
  id: number;
  username: string;
  role: string;
  is_super_admin?: boolean;
  project_ids?: number[];
}

export default function LimitPricesPage() {
  const { toast } = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [data, setData] = useState<LimitPrice[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedProject, setSelectedProject] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [searchKeyword, setSearchKeyword] = useState('');
  
  // 对话框状态
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [invalidateDialogOpen, setInvalidateDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  
  // 当前操作的数据
  const [currentItem, setCurrentItem] = useState<LimitPrice | null>(null);
  const [invalidateReason, setInvalidateReason] = useState('');
  
  // 导入相关
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importPreview, setImportPreview] = useState<any[]>([]);
  
  // 表单数据
  const [formData, setFormData] = useState({
    project_id: '',
    subitem_name: '',
    work_type: '',
    team_name: '',
    unit: '',
    limit_unit_price: '',
    plan_quantity: '',
    remark: ''
  });

  // 计算限价合价
  const calculatedTotal = parseFloat(formData.limit_unit_price || '0') * parseFloat(formData.plan_quantity || '0');

  // 权限判断
  const canManage = isSuperAdminUser(user?.role) || user?.role === 'admin' || user?.role === '公司管理员' || user?.role === '商务';

  // 加载用户信息
  useEffect(() => {
    const loadUser = async () => {
      try {
        // 尝试从 localStorage 获取
        const userStr = localStorage.getItem('user');
        if (userStr) {
          setUser(JSON.parse(userStr));
        }
        // 从 API 获取用户信息
        const res = await fetch('/api/auth/me', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          if (data.user) {
            setUser(data.user);
            localStorage.setItem('user', JSON.stringify(data.user));
          }
        }
      } catch (error) {
        console.error('加载用户信息失败:', error);
      }
    };
    loadUser();
  }, []);

  // 加载项目列表
  const loadProjects = useCallback(async () => {
    try {
      const res = await fetch('/api/projects', { credentials: 'include' });
      const data = await res.json();
      console.log('项目数据:', data);
      // 支持 {data: [...]} 或 {projects: [...]} 或直接数组格式
      if (data?.data && Array.isArray(data.data)) {
        setProjects(data.data);
      } else if (data?.projects && Array.isArray(data.projects)) {
        setProjects(data.projects);
      } else if (Array.isArray(data)) {
        setProjects(data);
      } else {
        console.error('项目数据格式错误:', data);
      }
    } catch (error) {
      console.error('加载项目失败:', error);
    }
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // 加载限价数据
  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedProject !== 'all') params.set('project_id', selectedProject);
      if (selectedStatus !== 'all') params.set('status', selectedStatus);
      if (searchKeyword) params.set('search', searchKeyword);
      
      const res = await fetch(`/api/limit-prices?${params}`, { credentials: 'include' });
      const result = await res.json();
      if (result.data) {
        setData(result.data);
        setStats(result.stats);
      }
    } catch (error) {
      console.error('加载数据失败:', error);
    } finally {
      setLoading(false);
    }
  }, [user, selectedProject, selectedStatus, searchKeyword]);

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user, loadData]);

  // 重置表单
  const resetForm = () => {
    setFormData({
      project_id: '',
      subitem_name: '',
      work_type: '',
      team_name: '',
      unit: '',
      limit_unit_price: '',
      plan_quantity: '',
      remark: ''
    });
  };

  // 打开新增对话框
  const openAddDialog = () => {
    resetForm();
    if (selectedProject !== 'all') {
      setFormData(prev => ({ ...prev, project_id: selectedProject }));
    }
    setAddDialogOpen(true);
  };

  // 保存新增
  const handleSaveAdd = async () => {
    if (!formData.project_id) {
      toast({ title: '请选择所属项目' });
      return;
    }
    if (!formData.subitem_name.trim()) {
      toast({ title: '请输入劳务子项名称', variant: 'error' });
      return;
    }
    if (!formData.unit.trim()) {
      toast({ title: '请输入单位', variant: 'error' });
      return;
    }
    if (!formData.limit_unit_price || parseFloat(formData.limit_unit_price) <= 0) {
      toast({ title: '请输入有效的限价单价', variant: 'error' });
      return;
    }
    
    setSaving(true);
    try {
      const res = await fetch('/api/limit-prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ...formData,
          project_id: parseInt(formData.project_id),
          limit_unit_price: parseFloat(formData.limit_unit_price),
          plan_quantity: parseFloat(formData.plan_quantity) || 0
        })
      });
      
      const result = await res.json();
      if (res.ok) {
        setAddDialogOpen(false);
        resetForm();
        loadData();
      } else {
        toast({ title: result.error || '保存失败', variant: 'error' });
      }
    } catch (error) {
      console.error('保存失败:', error);
      toast({ title: '保存失败', variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  // 打开编辑对话框
  const openEditDialog = async (item: LimitPrice) => {
    // 审核生效的数据只有管理员可编辑
    if (item.status === '审核生效' && !canManage) {
      toast({ title: '已审核的限价仅管理员可编辑', variant: 'error' });
      return;
    }
    
    setCurrentItem(item);
    setFormData({
      project_id: item.project_id.toString(),
      subitem_name: item.subitem_name,
      work_type: item.work_type || '',
      team_name: item.team_name || '',
      unit: item.unit,
      limit_unit_price: item.limit_unit_price.toString(),
      plan_quantity: item.plan_quantity.toString(),
      remark: item.remark || ''
    });
    setEditDialogOpen(true);
  };

  // 保存编辑
  const handleSaveEdit = async () => {
    if (!currentItem) return;
    
    if (!formData.project_id) {
      toast({ title: '请选择所属项目' });
      return;
    }
    if (!formData.subitem_name.trim()) {
      toast({ title: '请输入劳务子项名称', variant: 'error' });
      return;
    }
    if (!formData.unit.trim()) {
      toast({ title: '请输入单位', variant: 'error' });
      return;
    }
    
    setSaving(true);
    try {
      const res = await fetch(`/api/limit-prices/${currentItem.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ...formData,
          project_id: parseInt(formData.project_id),
          limit_unit_price: parseFloat(formData.limit_unit_price),
          plan_quantity: parseFloat(formData.plan_quantity) || 0
        })
      });
      
      const result = await res.json();
      if (res.ok) {
        setEditDialogOpen(false);
        loadData();
      } else {
        toast({ title: result.error || '保存失败', variant: 'error' });
      }
    } catch (error) {
      console.error('保存失败:', error);
      toast({ title: '保存失败', variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  // 查看详情
  const openViewDialog = async (item: LimitPrice) => {
    try {
      const res = await fetch(`/api/limit-prices/${item.id}`, { credentials: 'include' });
      const result = await res.json();
      if (result.data) {
        setCurrentItem(result.data);
        setViewDialogOpen(true);
      }
    } catch (error) {
      console.error('加载详情失败:', error);
    }
  };

  // 审核
  const handleReview = async (item: LimitPrice) => {
    if (!confirm(`确认审核 "${item.subitem_name}" 限价？\n审核后普通账号将无法编辑。`)) return;
    
    try {
      const res = await fetch(`/api/limit-prices/${item.id}/review`, {
        method: 'POST',
        credentials: 'include'
      });
      
      const result = await res.json();
      if (res.ok) {
        loadData();
      } else {
        toast({ title: result.error || '审核失败', variant: 'error' });
      }
    } catch (error) {
      console.error('审核失败:', error);
      toast({ title: '审核失败', variant: 'error' });
    }
  };

  // 打开作废对话框
  const openInvalidateDialog = (item: LimitPrice) => {
    setCurrentItem(item);
    setInvalidateReason('');
    setInvalidateDialogOpen(true);
  };

  // 确认作废
  const handleInvalidate = async () => {
    if (!currentItem || !invalidateReason.trim()) {
      toast({ title: '请填写作废原因', variant: 'error' });
      return;
    }
    
    try {
      const res = await fetch(`/api/limit-prices/${currentItem.id}/invalidate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ reason: invalidateReason })
      });
      
      const result = await res.json();
      if (res.ok) {
        setInvalidateDialogOpen(false);
        loadData();
      } else {
        toast({ title: result.error || '作废失败', variant: 'error' });
      }
    } catch (error) {
      console.error('作废失败:', error);
      toast({ title: '作废失败', variant: 'error' });
    }
  };

  // 删除
  const handleDelete = async (item: LimitPrice) => {
    if (!confirm(`确认删除 "${item.subitem_name}"？\n此操作不可恢复。`)) return;
    
    try {
      const res = await fetch(`/api/limit-prices/${item.id}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      
      const result = await res.json();
      if (res.ok) {
        loadData();
      } else {
        toast({ title: result.error || '删除失败', variant: 'error' });
      }
    } catch (error) {
      console.error('删除失败:', error);
      toast({ title: '删除失败', variant: 'error' });
    }
  };

  // 导出
  const handleExport = () => {
    const params = new URLSearchParams();
    if (selectedProject !== 'all') params.set('project_id', selectedProject);
    if (selectedStatus !== 'all') params.set('status', selectedStatus);
    
    window.open(`/api/limit-prices/export?${params}`, '_blank');
  };

  // 下载导入模板
  const handleDownloadTemplate = () => {
    const headers = ['项目名称', '劳务子项名称', '工种/工序', '归属班组', '单位', '限价单价', '计划工程量', '备注'];
    const example = ['示例项目', '钢筋绑扎', '钢筋工', '钢筋班', '吨', '8500', '100', '说明文字'];
    const csv = [headers.join(','), example.join(',')].join('\n');
    
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `项目限价导入模板_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  // 处理导入文件选择
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setImportFile(file);
    setImportErrors([]);
    setImportPreview([]);
    
    // 简单预览文件内容
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.split('\n').filter(line => line.trim());
      
      if (lines.length < 2) {
        setImportErrors(['文件内容为空或格式不正确']);
        return;
      }
      
      // 检查表头
      const header = lines[0].toLowerCase();
      if (!header.includes('项目名称') || !header.includes('劳务子项')) {
        setImportErrors(['文件格式不正确，请使用提供的模板']);
        return;
      }
    };
    reader.readAsText(file);
  };

  // 执行导入
  const handleImport = async () => {
    if (!importFile) {
      toast({ title: '请选择要导入的文件' });
      return;
    }
    
    setImporting(true);
    setImportErrors([]);
    
    try {
      const formData_import = new FormData();
      formData_import.append('file', importFile);
      
      const res = await fetch('/api/limit-prices/import', {
        method: 'POST',
        credentials: 'include',
        body: formData_import
      });
      
      const result = await res.json();
      
      if (res.ok) {
        toast({ title: `成功导入 ${result.data?.length || 0} 条数据` });
        setImportDialogOpen(false);
        setImportFile(null);
        loadData();
      } else {
        if (result.errors && Array.isArray(result.errors)) {
          setImportErrors(result.errors.slice(0, 10));
        } else {
          setImportErrors([result.error || '导入失败']);
        }
      }
    } catch (error) {
      console.error('导入失败:', error);
      setImportErrors(['导入失败，请检查文件格式']);
    } finally {
      setImporting(false);
    }
  };

  // 判断是否超支
  const isOverBudget = (item: LimitPrice) => {
    return item.price_difference > 0 || item.excess_amount > 0;
  };

  // 格式化金额
  const formatMoney = (val: number | string | null | undefined) => {
    const num = parseFloat(val as string || '0');
    return num.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-4">
        {/* 页面标题 */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <h1 className="text-xl font-semibold tracking-tight text-gray-900">项目限价管理</h1>
          <div className="flex flex-wrap gap-2">
            {canManage && (
              <>
                <Button onClick={openAddDialog}>
                  <Plus className="mr-2 h-4 w-4" />
                  新增
                </Button>
                <Button variant="outline" onClick={() => setImportDialogOpen(true)}>
                  <Upload className="mr-2 h-4 w-4" />
                  批量导入
                </Button>
                <Button variant="outline" onClick={handleDownloadTemplate}>
                  <FileSpreadsheet className="mr-2 h-4 w-4" />
                  下载模板
                </Button>
              </>
            )}
            <Button variant="outline" onClick={handleExport}>
              <Download className="mr-2 h-4 w-4" />
              导出
            </Button>
          </div>
        </div>

        {/* 统计卡片 */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold">{stats.total}</div>
                <p className="text-sm text-gray-500">限价总数</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold text-blue-600">
                  ¥{formatMoney(stats.totalLimitAmount)}
                </div>
                <p className="text-sm text-gray-500">限价总额</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold text-orange-600">
                  ¥{formatMoney(stats.totalActualAmount)}
                </div>
                <p className="text-sm text-gray-500">实际总额</p>
              </CardContent>
            </Card>
            <Card className={cn(stats.totalExcess > 0 ? 'border-red-500' : '')}>
              <CardContent className="pt-4">
                <div className={cn('text-2xl font-bold', stats.totalExcess > 0 ? 'text-red-600' : 'text-green-600')}>
                  {stats.totalExcess > 0 ? '+' : ''}¥{formatMoney(stats.totalExcess)}
                </div>
                <p className="text-sm text-gray-500">超支差额</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* 超支预警 */}
        {stats && stats.totalExcess > 0 && (
          <Alert className="border-red-500 bg-red-50">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-800">
              当前项目累计超支 <strong>¥{formatMoney(stats.totalExcess)}</strong>，请关注成本控制
            </AlertDescription>
          </Alert>
        )}

        {/* 筛选区 */}
        <Card>
          <CardContent className="pt-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:flex lg:flex-wrap">
              <Select value={selectedProject} onValueChange={setSelectedProject}>
                <SelectTrigger className="w-full lg:w-[180px]">
                  <SelectValue placeholder="选择项目" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部项目</SelectItem>
                  {projects.map(p => (
                    <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                <SelectTrigger className="w-full lg:w-[140px]">
                  <SelectValue placeholder="状态" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部状态</SelectItem>
                  <SelectItem value="草稿">草稿</SelectItem>
                  <SelectItem value="审核生效">审核生效</SelectItem>
                  <SelectItem value="作废">作废</SelectItem>
                </SelectContent>
              </Select>
              
              <div className="min-w-0 lg:min-w-[200px] lg:flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="搜索子项名称、工种、班组..."
                    value={searchKeyword}
                    onChange={e => setSearchKeyword(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 列表 */}
        <Card>
          <CardContent className="p-0">
            <div className="hidden overflow-x-auto md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[120px]">项目</TableHead>
                    <TableHead>劳务子项</TableHead>
                    <TableHead>工种/工序</TableHead>
                    <TableHead>班组</TableHead>
                    <TableHead className="text-right">单位</TableHead>
                    <TableHead className="text-right">限价单价</TableHead>
                    <TableHead className="text-right">计划工程量</TableHead>
                    <TableHead className="text-right">限价合价</TableHead>
                    <TableHead className="text-right">实际单价</TableHead>
                    <TableHead className="text-right">单价差</TableHead>
                    <TableHead className="w-[80px]">状态</TableHead>
                    <TableHead className="w-[120px] text-center">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={12} className="text-center py-8">
                        加载中...
                      </TableCell>
                    </TableRow>
                  ) : data.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={12} className="text-center py-8">
                        暂无数据
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.map((item: any) => (
                      <TableRow 
                        key={item.id}
                        className={cn(
                          isOverBudget(item) && 'bg-red-50',
                          item.status === '作废' && 'opacity-50'
                        )}
                      >
                        <TableCell className="font-medium">{String(item.project?.name || '')}</TableCell>
                        <TableCell>{String(item.subitem_name || '')}</TableCell>
                        <TableCell>{String(item.work_type || '-')}</TableCell>
                        <TableCell>{String(item.team_name || '-')}</TableCell>
                        <TableCell className="text-right">{String(item.unit || '')}</TableCell>
                        <TableCell className="text-right">¥{formatMoney(item.limit_unit_price)}</TableCell>
                        <TableCell className="text-right">{Number(item.plan_quantity || 0)}</TableCell>
                        <TableCell className="text-right font-medium">¥{formatMoney(item.limit_total_price)}</TableCell>
                        <TableCell className={cn('text-right', Number(item.price_difference || 0) > 0 ? 'text-red-600 font-medium' : '')}>
                          {Number(item.actual_unit_price || 0) > 0 ? `¥${formatMoney(item.actual_unit_price)}` : '-'}
                        </TableCell>
                        <TableCell className={cn('text-right', Number(item.price_difference || 0) > 0 ? 'text-red-600 font-medium' : Number(item.price_difference || 0) < 0 ? 'text-green-600' : '')}>
                          {Number(item.price_difference || 0) !== 0 ? (
                            <>
                              {Number(item.price_difference || 0) > 0 ? '+' : ''}¥{formatMoney(item.price_difference)}
                            </>
                          ) : '-'}
                        </TableCell>
                        <TableCell>
                          <Badge variant={
                            item.status === '审核生效' ? 'default' :
                            item.status === '草稿' ? 'secondary' : 'destructive'
                          }>
                            {String(item.status || '')}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openViewDialog(item)}
                              title="查看"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            {canManage && (
                              <>
                                {item.status !== '作废' && (
                                  <>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => openEditDialog(item)}
                                      title="编辑"
                                    >
                                      <Edit className="h-4 w-4" />
                                    </Button>
                                    {item.status === '草稿' && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleReview(item)}
                                        title="审核生效"
                                        className="text-green-600"
                                      >
                                        <CheckCircle className="h-4 w-4" />
                                      </Button>
                                    )}
                                    {item.status === '审核生效' && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => openInvalidateDialog(item)}
                                        title="作废"
                                        className="text-orange-600"
                                      >
                                        <XCircle className="h-4 w-4" />
                                      </Button>
                                    )}
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleDelete(item)}
                                      title="删除"
                                      className="text-red-600"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </>
                                )}
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            <div className="space-y-3 p-3 md:hidden">
              {loading ? (
                <div className="rounded-lg border border-dashed py-8 text-center text-sm text-gray-500">
                  加载中...
                </div>
              ) : data.length === 0 ? (
                <div className="rounded-lg border border-dashed py-8 text-center text-sm text-gray-500">
                  暂无数据
                </div>
              ) : (
                data.map((item: any) => (
                  <div
                    key={item.id}
                    className={cn(
                      'rounded-xl border bg-white p-3 shadow-sm',
                      isOverBudget(item) && 'border-red-100 bg-red-50/40',
                      item.status === '浣滃簾' && 'opacity-60'
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-medium text-gray-900">{String(item.subitem_name || '')}</div>
                        <div className="mt-1 truncate text-xs text-gray-500">{String(item.project?.name || '')}</div>
                      </div>
                      <Badge
                        variant={
                          item.status === '瀹℃牳鐢熸晥' ? 'default' :
                          item.status === '鑽夌' ? 'secondary' : 'destructive'
                        }
                        className="shrink-0"
                      >
                        {String(item.status || '')}
                      </Badge>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-lg bg-gray-50 p-2">
                        <div className="text-gray-500">工种/班组</div>
                        <div className="mt-1 truncate text-gray-900">{[item.work_type, item.team_name].filter(Boolean).join(' / ') || '-'}</div>
                      </div>
                      <div className="rounded-lg bg-gray-50 p-2">
                        <div className="text-gray-500">单位/工程量</div>
                        <div className="mt-1 text-gray-900">{String(item.unit || '-')} / {Number(item.plan_quantity || 0)}</div>
                      </div>
                      <div className="rounded-lg bg-blue-50 p-2">
                        <div className="text-blue-700">限价单价</div>
                        <div className="mt-1 font-medium text-blue-700">¥{formatMoney(item.limit_unit_price)}</div>
                      </div>
                      <div className="rounded-lg bg-orange-50 p-2">
                        <div className="text-orange-700">单价差</div>
                        <div className={cn(
                          'mt-1 font-medium',
                          Number(item.price_difference || 0) > 0 ? 'text-red-600' : Number(item.price_difference || 0) < 0 ? 'text-green-600' : 'text-gray-500'
                        )}>
                          {Number(item.price_difference || 0) !== 0 ? `${Number(item.price_difference || 0) > 0 ? '+' : ''}¥${formatMoney(item.price_difference)}` : '-'}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      <Button variant="outline" size="sm" onClick={() => openViewDialog(item)}>
                        <Eye className="mr-1 h-4 w-4" />
                        查看
                      </Button>
                      {canManage && item.status !== '浣滃簾' ? (
                        <>
                          <Button variant="outline" size="sm" onClick={() => openEditDialog(item)}>
                            <Edit className="mr-1 h-4 w-4" />
                            编辑
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => handleDelete(item)} className="text-red-600">
                            <Trash2 className="mr-1 h-4 w-4" />
                            删除
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 新增对话框 */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-h-[90vh] w-[calc(100vw-1.5rem)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>新增限价</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>所属项目 <span className="text-red-500">*</span></Label>
              <Select value={formData.project_id} onValueChange={v => setFormData({...formData, project_id: v})}>
                <SelectTrigger>
                  <SelectValue placeholder="请选择项目" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map(p => (
                    <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>劳务子项名称 <span className="text-red-500">*</span></Label>
                <Input
                  value={formData.subitem_name}
                  onChange={e => setFormData({...formData, subitem_name: e.target.value})}
                  placeholder="如：钢筋绑扎"
                />
              </div>
              <div className="grid gap-2">
                <Label>工种/工序</Label>
                <Input
                  value={formData.work_type}
                  onChange={e => setFormData({...formData, work_type: e.target.value})}
                  placeholder="如：钢筋工"
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>归属班组</Label>
                <Input
                  value={formData.team_name}
                  onChange={e => setFormData({...formData, team_name: e.target.value})}
                  placeholder="如：钢筋班"
                />
              </div>
              <div className="grid gap-2">
                <Label>单位 <span className="text-red-500">*</span></Label>
                <Input
                  value={formData.unit}
                  onChange={e => setFormData({...formData, unit: e.target.value})}
                  placeholder="如：吨、m²"
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>限价单价(元) <span className="text-red-500">*</span></Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.limit_unit_price}
                  onChange={e => setFormData({...formData, limit_unit_price: e.target.value})}
                  placeholder="公司最高限价"
                />
              </div>
              <div className="grid gap-2">
                <Label>计划工程量 <span className="text-red-500">*</span></Label>
                <Input
                  type="number"
                  step="0.001"
                  min="0"
                  value={formData.plan_quantity}
                  onChange={e => setFormData({...formData, plan_quantity: e.target.value})}
                  placeholder="计划控制总量"
                />
              </div>
            </div>
            {/* 限价合价自动计算 */}
            <div className="bg-blue-50 p-3 rounded-lg">
              <div className="text-sm text-gray-600">限价合价（自动计算）</div>
              <div className="text-xl font-bold text-blue-600">
                ¥{calculatedTotal.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                限价合价 = 限价单价 × 计划工程量
              </div>
            </div>
            <div className="grid gap-2">
              <Label>备注</Label>
              <Textarea
                value={formData.remark}
                onChange={e => setFormData({...formData, remark: e.target.value})}
                placeholder="其他说明..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>取消</Button>
            <Button onClick={handleSaveAdd} disabled={saving}>
              {saving ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 编辑对话框 */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-h-[90vh] w-[calc(100vw-1.5rem)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              编辑限价
              {currentItem?.status === '审核生效' && (
                <Badge variant="default" className="ml-2">已审核</Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>所属项目 <span className="text-red-500">*</span></Label>
              <Select value={formData.project_id} onValueChange={v => setFormData({...formData, project_id: v})}>
                <SelectTrigger>
                  <SelectValue placeholder="请选择项目" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map(p => (
                    <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>劳务子项名称 <span className="text-red-500">*</span></Label>
                <Input
                  value={formData.subitem_name}
                  onChange={e => setFormData({...formData, subitem_name: e.target.value})}
                />
              </div>
              <div className="grid gap-2">
                <Label>工种/工序</Label>
                <Input
                  value={formData.work_type}
                  onChange={e => setFormData({...formData, work_type: e.target.value})}
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>归属班组</Label>
                <Input
                  value={formData.team_name}
                  onChange={e => setFormData({...formData, team_name: e.target.value})}
                />
              </div>
              <div className="grid gap-2">
                <Label>单位 <span className="text-red-500">*</span></Label>
                <Input
                  value={formData.unit}
                  onChange={e => setFormData({...formData, unit: e.target.value})}
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>限价单价(元) <span className="text-red-500">*</span></Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.limit_unit_price}
                  onChange={e => setFormData({...formData, limit_unit_price: e.target.value})}
                />
              </div>
              <div className="grid gap-2">
                <Label>计划工程量 <span className="text-red-500">*</span></Label>
                <Input
                  type="number"
                  step="0.001"
                  min="0"
                  value={formData.plan_quantity}
                  onChange={e => setFormData({...formData, plan_quantity: e.target.value})}
                />
              </div>
            </div>
            {/* 限价合价自动计算 */}
            <div className="bg-blue-50 p-3 rounded-lg">
              <div className="text-sm text-gray-600">限价合价（自动计算）</div>
              <div className="text-xl font-bold text-blue-600">
                ¥{calculatedTotal.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
            <div className="grid gap-2">
              <Label>备注</Label>
              <Textarea
                value={formData.remark}
                onChange={e => setFormData({...formData, remark: e.target.value})}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>取消</Button>
            <Button onClick={handleSaveEdit} disabled={saving}>
              {saving ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 查看详情对话框 */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-h-[90vh] w-[calc(100vw-1.5rem)] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              限价详情
              {currentItem && (
                <Badge variant={
                  currentItem.status === '审核生效' ? 'default' :
                  currentItem.status === '草稿' ? 'secondary' : 'destructive'
                }>
                  {currentItem.status}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          {currentItem && (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label className="text-gray-500">项目名称</Label>
                  <p className="font-medium">{currentItem.project?.name}</p>
                </div>
                <div>
                  <Label className="text-gray-500">劳务子项</Label>
                  <p className="font-medium">{currentItem.subitem_name}</p>
                </div>
                <div>
                  <Label className="text-gray-500">工种/工序</Label>
                  <p>{currentItem.work_type || '-'}</p>
                </div>
                <div>
                  <Label className="text-gray-500">归属班组</Label>
                  <p>{currentItem.team_name || '-'}</p>
                </div>
                <div>
                  <Label className="text-gray-500">单位</Label>
                  <p>{currentItem.unit}</p>
                </div>
                <div>
                  <Label className="text-gray-500">限价单价</Label>
                  <p className="font-medium text-blue-600">¥{formatMoney(currentItem.limit_unit_price)}</p>
                </div>
              </div>
              
              <div className="border-t pt-4">
                <h4 className="font-medium mb-3">金额计算</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-gray-50 p-3 rounded">
                    <p className="text-sm text-gray-500">计划工程量</p>
                    <p className="text-lg font-medium">{currentItem.plan_quantity}</p>
                  </div>
                  <div className="bg-blue-50 p-3 rounded">
                    <p className="text-sm text-gray-500">限价合价</p>
                    <p className="text-lg font-medium text-blue-600">¥{formatMoney(currentItem.limit_total_price)}</p>
                  </div>
                  <div className="bg-orange-50 p-3 rounded">
                    <p className="text-sm text-gray-500">实际合价</p>
                    <p className="text-lg font-medium text-orange-600">¥{formatMoney(currentItem.actual_total_price)}</p>
                  </div>
                  <div className={cn('p-3 rounded', currentItem.excess_amount > 0 ? 'bg-red-50' : 'bg-green-50')}>
                    <p className="text-sm text-gray-500">超支差额</p>
                    <p className={cn('text-lg font-medium', currentItem.excess_amount > 0 ? 'text-red-600' : 'text-green-600')}>
                      {currentItem.excess_amount > 0 ? '+' : ''}¥{formatMoney(currentItem.excess_amount)}
                    </p>
                  </div>
                </div>
              </div>

              {currentItem.remark && (
                <div>
                  <Label className="text-gray-500">备注</Label>
                  <p className="mt-1 p-3 bg-gray-50 rounded">{currentItem.remark}</p>
                </div>
              )}

              {/* 操作记录 */}
              <div className="border-t pt-4">
                <h4 className="font-medium mb-3">操作记录</h4>
                <div className="space-y-2">
                  <div className="text-sm">
                    <span className="text-gray-500">创建：</span>
                    {currentItem.created_by_name} 于 {new Date(currentItem.created_at).toLocaleString()}
                  </div>
                  {currentItem.reviewed_at && (
                    <div className="text-sm">
                      <span className="text-gray-500">审核：</span>
                      {currentItem.reviewed_by_name} 于 {new Date(currentItem.reviewed_at).toLocaleString()}
                    </div>
                  )}
                  {currentItem.invalidated_at && (
                    <div className="text-sm text-orange-600">
                      <span className="text-gray-500">作废：</span>
                      {currentItem.invalidated_by_name} 于 {new Date(currentItem.invalidated_at).toLocaleString()}
                      <p className="mt-1">作废原因：{currentItem.invalidate_reason}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewDialogOpen(false)}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 作废对话框 */}
      <Dialog open={invalidateDialogOpen} onOpenChange={setInvalidateDialogOpen}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-600">
              <XCircle className="h-5 w-5" />
              作废限价
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="mb-4">
              确认作废限价 "<strong>{currentItem?.subitem_name}</strong>"？
            </p>
            <div className="grid gap-2">
              <Label>作废原因 <span className="text-red-500">*</span></Label>
              <Textarea
                value={invalidateReason}
                onChange={e => setInvalidateReason(e.target.value)}
                placeholder="请填写作废原因..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
            <Button variant="outline" onClick={() => setInvalidateDialogOpen(false)}>取消</Button>
            <Button variant="destructive" onClick={handleInvalidate}>确认作废</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 批量导入对话框 */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="max-h-[90vh] w-[calc(100vw-1.5rem)] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              批量导入限价
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="bg-blue-50 p-3 rounded-lg">
              <p className="text-sm text-blue-800">
                <strong>导入说明：</strong>
              </p>
              <ul className="text-sm text-blue-700 mt-2 list-disc list-inside space-y-1">
                <li>请先下载标准模板</li>
                <li>必填列：项目名称、劳务子项名称、单位、限价单价</li>
                <li>支持 .csv、.xlsx 格式</li>
                <li>项目名称需与系统内项目名一致</li>
              </ul>
            </div>
            
            <div className="grid gap-2">
              <Label>选择文件</Label>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                accept=".csv,.xlsx,.xls"
                className="hidden"
              />
              <Button 
                variant="outline" 
                onClick={() => fileInputRef.current?.click()}
                className="w-full"
              >
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                {importFile ? importFile.name : '点击选择文件'}
              </Button>
            </div>

            {importErrors.length > 0 && (
              <div className="bg-red-50 p-3 rounded-lg">
                <p className="text-sm text-red-600 font-medium">导入错误：</p>
                <ul className="text-sm text-red-600 mt-1 list-disc list-inside">
                  {importErrors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportDialogOpen(false)}>取消</Button>
            <Button onClick={handleDownloadTemplate} variant="outline">
              <Download className="mr-2 h-4 w-4" />
              下载模板
            </Button>
            <Button onClick={handleImport} disabled={!importFile || importing}>
              {importing ? '导入中...' : '开始导入'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
