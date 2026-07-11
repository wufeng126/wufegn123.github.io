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
  Plus, Pencil, Trash2, Search, Download, Upload, ChevronLeft, ChevronRight,
  Package, Building2, Calendar, FileSpreadsheet, Loader2
} from 'lucide-react';

// 类型定义
interface MiscMaterial {
  id: number;
  project_id: number;
  material_name: string;
  unit: string | null;
  quantity: string;
  unit_price: string;
  total_price: string;
  purchase_date: string;
  supplier: string | null;
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
  projectStats: Record<string, number>;
}

export default function MiscMaterialsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64"><div className="text-center" style={{ color: '#86909C' }}>加载中...</div></div>}>
      <MiscMaterialsContent />
    </Suspense>
  );
}

function MiscMaterialsContent() {
  const searchParams = useSearchParams();
  const { toast } = useToast();
  
  const [materials, setMaterials] = useState<MiscMaterial[]>([]);
  const [projects, setProjects] = useState<Array<{ id: number; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 20, total: 0, totalPages: 0 });
  const [stats, setStats] = useState<Stats>({ totalCount: 0, totalAmount: 0, projectStats: {} });
  
  // 筛选条件
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all');
  const [materialName, setMaterialName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  // 对话框状态
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [currentMaterial, setCurrentMaterial] = useState<MiscMaterial | null>(null);
  const [saving, setSaving] = useState(false);
  
  // 导入相关
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{success: number; failed: number; errors: string[]} | null>(null);
  
  // 表单
  const [form, setForm] = useState({
    project_id: '',
    material_name: '',
    unit: '',
    quantity: '',
    unit_price: '',
    purchase_date: new Date().toISOString().split('T')[0],
    supplier: '',
    remark: '',
  });

  useEffect(() => {
    // 从URL获取项目ID
    const projectIdParam = searchParams.get('projectId');
    if (projectIdParam) {
      setSelectedProjectId(projectIdParam);
    }
    
    fetchProjects();
    fetchMaterials();
    fetchStats();
  }, [searchParams]);

  useEffect(() => {
    fetchMaterials(1);
  }, [selectedProjectId, startDate, endDate]);

  // 获取项目列表
  const fetchProjects = async () => {
    try {
      const response = await fetch('/api/projects');
      const data = await response.json();
      setProjects(data.projects || []);
    } catch (error) {
      console.error('获取项目列表失败:', error);
    }
  };

  // 获取材料列表
  const fetchMaterials = async (page: number = pagination.page) => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.append('page', page.toString());
      params.append('pageSize', pagination.pageSize.toString());
      if (selectedProjectId !== 'all') {
        params.append('projectId', selectedProjectId);
      }
      if (materialName) {
        params.append('materialName', materialName);
      }
      if (startDate) {
        params.append('startDate', startDate);
      }
      if (endDate) {
        params.append('endDate', endDate);
      }
      
      const response = await fetch(`/api/miscellaneous-materials?${params}`);
      const data = await response.json();
      
      if (data.materials) {
        setMaterials(data.materials);
        setPagination(data.pagination || { page: 1, pageSize: 20, total: 0, totalPages: 0 });
      }
      if (data.stats) {
        setStats(data.stats);
      }
    } catch (error) {
      console.error('获取材料列表失败:', error);
      toast({
        title: '获取失败',
        description: '无法获取材料列表',
        variant: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  // 获取统计数据
  const fetchStats = async () => {
    try {
      const params = new URLSearchParams();
      if (selectedProjectId !== 'all') {
        params.append('projectId', selectedProjectId);
      }
      if (startDate) {
        params.append('startDate', startDate);
      }
      if (endDate) {
        params.append('endDate', endDate);
      }
      
      const response = await fetch(`/api/miscellaneous-materials?${params}`);
      const data = await response.json();
      if (data.stats) {
        setStats(data.stats);
      }
    } catch (error) {
      console.error('获取统计数据失败:', error);
    }
  };

  // 重置表单
  const resetForm = () => {
    setForm({
      project_id: '',
      material_name: '',
      unit: '',
      quantity: '',
      unit_price: '',
      purchase_date: new Date().toISOString().split('T')[0],
      supplier: '',
      remark: '',
    });
  };

  // 新增材料
  const handleAdd = async () => {
    if (!form.project_id || !form.material_name || !form.quantity || !form.unit_price) {
      toast({
        title: '请填写必填项',
        description: '项目、材料名称、数量、单价为必填项',
        variant: 'error',
      });
      return;
    }
    
    try {
      setSaving(true);
      const response = await fetch('/api/miscellaneous-materials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: parseInt(form.project_id),
          material_name: form.material_name,
          unit: form.unit || null,
          quantity: parseFloat(form.quantity),
          unit_price: parseFloat(form.unit_price),
          purchase_date: form.purchase_date,
          supplier: form.supplier || null,
          remark: form.remark || null,
        }),
      });
      
      const data = await response.json();
      
      if (response.ok) {
        toast({
          title: '添加成功',
          description: '材料记录已添加',
        });
        setAddDialogOpen(false);
        resetForm();
        fetchMaterials();
        fetchStats();
      } else {
        toast({
          title: '添加失败',
          description: data.error || '未知错误',
          variant: 'error',
        });
      }
    } catch (error: any) {
      toast({
        title: '添加失败',
        description: error.message,
        variant: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  // 编辑材料
  const handleEdit = async () => {
    if (!currentMaterial) return;
    
    if (!form.project_id || !form.material_name || !form.quantity || !form.unit_price) {
      toast({
        title: '请填写必填项',
        description: '项目、材料名称、数量、单价为必填项',
        variant: 'error',
      });
      return;
    }
    
    try {
      setSaving(true);
      const response = await fetch('/api/miscellaneous-materials', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: currentMaterial.id,
          project_id: parseInt(form.project_id),
          material_name: form.material_name,
          unit: form.unit || null,
          quantity: parseFloat(form.quantity),
          unit_price: parseFloat(form.unit_price),
          purchase_date: form.purchase_date,
          supplier: form.supplier || null,
          remark: form.remark || null,
        }),
      });
      
      const data = await response.json();
      
      if (response.ok) {
        toast({
          title: '修改成功',
          description: '材料记录已更新',
        });
        setEditDialogOpen(false);
        setCurrentMaterial(null);
        resetForm();
        fetchMaterials();
        fetchStats();
      } else {
        toast({
          title: '修改失败',
          description: data.error || '未知错误',
          variant: 'error',
        });
      }
    } catch (error: any) {
      toast({
        title: '修改失败',
        description: error.message,
        variant: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  // 删除材料
  const handleDelete = async () => {
    if (!currentMaterial) return;
    
    try {
      const response = await fetch(`/api/miscellaneous-materials?id=${currentMaterial.id}`, {
        method: 'DELETE',
      });
      
      const data = await response.json();
      
      if (response.ok) {
        toast({
          title: '删除成功',
          description: '材料记录已删除',
        });
        setDeleteDialogOpen(false);
        setCurrentMaterial(null);
        fetchMaterials();
        fetchStats();
      } else {
        toast({
          title: '删除失败',
          description: data.error || '未知错误',
          variant: 'error',
        });
      }
    } catch (error: any) {
      toast({
        title: '删除失败',
        description: error.message,
        variant: 'error',
      });
    }
  };

  // 导出Excel
  const handleExport = async () => {
    try {
      const params = new URLSearchParams();
      if (selectedProjectId !== 'all') {
        params.append('projectId', selectedProjectId);
      }
      if (startDate) {
        params.append('startDate', startDate);
      }
      if (endDate) {
        params.append('endDate', endDate);
      }
      
      const response = await fetch(`/api/miscellaneous-materials/export?${params}`);
      
      if (!response.ok) {
        throw new Error('导出失败');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `零星材料统计_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      toast({
        title: '导出成功',
        description: '文件已下载',
      });
    } catch (error: any) {
      toast({
        title: '导出失败',
        description: error.message,
        variant: 'error',
      });
    }
  };

  // 导入Excel
  const handleImport = async () => {
    if (!importFile) {
      toast({
        title: '请选择文件',
        description: '请先选择要导入的Excel文件',
        variant: 'error',
      });
      return;
    }
    
    try {
      setImporting(true);
      setImportResult(null);
      
      const formData = new FormData();
      formData.append('file', importFile);
      
      const response = await fetch('/api/miscellaneous-materials/import', {
        method: 'POST',
        body: formData,
      });
      
      const data = await response.json();
      
      if (response.ok) {
        const importedCount = data.count || 0;
        const importErrors = data.errors || [];
        setImportResult({
          success: importedCount,
          failed: importErrors.length,
          errors: importErrors,
        });
        
        if (importedCount > 0) {
          fetchMaterials();
          fetchStats();
        }
      } else {
        toast({
          title: '导入失败',
          description: data.error || '未知错误',
          variant: 'error',
        });
      }
    } catch (error: any) {
      toast({
        title: '导入失败',
        description: error.message,
        variant: 'error',
      });
    } finally {
      setImporting(false);
    }
  };

  // 打开编辑对话框
  const openEditDialog = (material: MiscMaterial) => {
    setCurrentMaterial(material);
    setForm({
      project_id: material.project_id.toString(),
      material_name: material.material_name,
      unit: material.unit || '',
      quantity: material.quantity,
      unit_price: material.unit_price,
      purchase_date: material.purchase_date,
      supplier: material.supplier || '',
      remark: material.remark || '',
    });
    setEditDialogOpen(true);
  };

  // 格式化金额
  const formatAmount = (amount: number | string) => {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return isNaN(num) ? '0.00' : num.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // 下载导入模板
  const downloadTemplate = () => {
    const headers = ['项目名称', '材料名称', '规格型号', '单位', '数量', '单价', '金额', '采购日期', '采购人', '备注'];
    const example1 = ['XX项目', 'C30混凝土', 'C30商品混凝土', 'm³', '100', '380', '38000', '2024-01-15', '张三', '主体结构用'];
    const example2 = ['XX项目', '钢筋', 'HRB400 Φ12', '吨', '5', '4200', '21000', '2024-01-16', '李四', ''];
    const csvContent = '\uFEFF' + [headers.join(','), example1.join(','), example2.join(',')].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = '零星材料导入模板.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  // 格式化日期
  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('zh-CN');
  };

  return (
    <div className="p-6 space-y-6" style={{ backgroundColor: '#F2F3F5', minHeight: 'calc(100vh - 64px)' }}>
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight" style={{ color: '#1D2129' }}>零星材料统计</h1>
          <p className="text-sm mt-1" style={{ color: '#86909C' }}>管理项目零星材料采购记录，自动计入项目成本</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setImportDialogOpen(true)}
            className="gap-2"
          >
            <Upload className="h-4 w-4" />
            批量导入
          </Button>
          <Button
            variant="outline"
            onClick={handleExport}
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            导出Excel
          </Button>
          <Button
            onClick={() => {
              resetForm();
              setAddDialogOpen(true);
            }}
            className="gap-2"
            style={{ backgroundColor: '#165DFF' }}
          >
            <Plus className="h-4 w-4" />
            新增材料
          </Button>
        </div>
      </div>

      {/* 汇总卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg" style={{ backgroundColor: '#E8F3FF' }}>
                <Package className="h-5 w-5" style={{ color: '#165DFF' }} />
              </div>
              <div>
                <p className="text-sm" style={{ color: '#86909C' }}>总记录数</p>
                <p className="text-xl font-bold" style={{ color: '#1D2129' }}>{stats.totalCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg" style={{ backgroundColor: '#FFF7E8' }}>
                <FileSpreadsheet className="h-5 w-5" style={{ color: '#FF7D00' }} />
              </div>
              <div>
                <p className="text-sm" style={{ color: '#86909C' }}>总金额</p>
                <p className="text-xl font-bold" style={{ color: '#1D2129' }}>¥{formatAmount(stats.totalAmount)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg" style={{ backgroundColor: '#E8FFEA' }}>
                <Building2 className="h-5 w-5" style={{ color: '#00B42A' }} />
              </div>
              <div>
                <p className="text-sm" style={{ color: '#86909C' }}>涉及项目</p>
                <p className="text-xl font-bold" style={{ color: '#1D2129' }}>{Object.keys(stats.projectStats).length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg" style={{ backgroundColor: '#F2F3F5' }}>
                <Calendar className="h-5 w-5" style={{ color: '#86909C' }} />
              </div>
              <div>
                <p className="text-sm" style={{ color: '#86909C' }}>平均单价</p>
                <p className="text-xl font-bold" style={{ color: '#1D2129' }}>
                  ¥{stats.totalCount > 0 ? formatAmount(stats.totalAmount / stats.totalCount) : '0.00'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 筛选条件 */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <Label style={{ color: '#86909C' }}>项目</Label>
              <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="全部项目" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部项目</SelectItem>
                  {projects.map(project => (
                    <SelectItem key={project.id} value={project.id.toString()}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-1.5">
              <Label style={{ color: '#86909C' }}>材料名称</Label>
              <Input
                className="w-48"
                placeholder="搜索材料名称"
                value={materialName}
                onChange={(e) => setMaterialName(e.target.value)}
              />
            </div>
            
            <div className="space-y-1.5">
              <Label style={{ color: '#86909C' }}>开始日期</Label>
              <Input
                type="date"
                className="w-40"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            
            <div className="space-y-1.5">
              <Label style={{ color: '#86909C' }}>结束日期</Label>
              <Input
                type="date"
                className="w-40"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            
            <Button
              onClick={() => {
                fetchMaterials(1);
                fetchStats();
              }}
              className="gap-2"
              style={{ backgroundColor: '#165DFF' }}
            >
              <Search className="h-4 w-4" />
              查询
            </Button>
            
            <Button
              variant="outline"
              onClick={() => {
                setSelectedProjectId('all');
                setMaterialName('');
                setStartDate('');
                setEndDate('');
                fetchMaterials(1);
                fetchStats();
              }}
            >
              重置
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 项目统计 */}
      {Object.keys(stats.projectStats).length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base" style={{ color: '#1D2129' }}>项目金额统计</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {Object.entries(stats.projectStats)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 12)
                .map(([projectName, amount]) => (
                  <div
                    key={projectName}
                    className="p-3 rounded-lg border"
                    style={{ backgroundColor: '#FAFAFA', borderColor: '#E5E6EB' }}
                  >
                    <p className="text-xs truncate" style={{ color: '#86909C' }} title={projectName}>
                      {projectName}
                    </p>
                    <p className="text-sm font-semibold mt-1" style={{ color: '#1D2129' }}>
                      ¥{formatAmount(amount)}
                    </p>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 材料列表 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base" style={{ color: '#1D2129' }}>
            材料明细
            <span className="ml-2 text-sm font-normal" style={{ color: '#86909C' }}>
              共 {pagination.total} 条
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <div className="text-center" style={{ color: '#86909C' }}>加载中...</div>
            </div>
          ) : materials.length === 0 ? (
            <div className="flex items-center justify-center h-40">
              <div className="text-center" style={{ color: '#86909C' }}>
                <Package className="h-12 w-12 mx-auto mb-2 opacity-30" />
                <p>暂无材料记录</p>
              </div>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b" style={{ borderColor: '#E5E6EB' }}>
                      <th className="text-left py-3 px-4 text-sm font-medium" style={{ color: '#86909C' }}>项目名称</th>
                      <th className="text-left py-3 px-4 text-sm font-medium" style={{ color: '#86909C' }}>材料名称</th>
                      <th className="text-center py-3 px-4 text-sm font-medium" style={{ color: '#86909C' }}>单位</th>
                      <th className="text-right py-3 px-4 text-sm font-medium" style={{ color: '#86909C' }}>数量</th>
                      <th className="text-right py-3 px-4 text-sm font-medium" style={{ color: '#86909C' }}>单价</th>
                      <th className="text-right py-3 px-4 text-sm font-medium" style={{ color: '#86909C' }}>金额</th>
                      <th className="text-center py-3 px-4 text-sm font-medium" style={{ color: '#86909C' }}>采购日期</th>
                      <th className="text-left py-3 px-4 text-sm font-medium" style={{ color: '#86909C' }}>供应商</th>
                      <th className="text-center py-3 px-4 text-sm font-medium" style={{ color: '#86909C' }}>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {materials.map((material) => (
                      <tr key={material.id} className="border-b hover:bg-gray-50" style={{ borderColor: '#E5E6EB' }}>
                        <td className="py-3 px-4">
                          <span className="text-sm" style={{ color: '#1D2129' }}>
                            {material.projects?.name || '-'}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-sm font-medium" style={{ color: '#1D2129' }}>
                            {material.material_name}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="text-sm" style={{ color: '#86909C' }}>
                            {material.unit || '-'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <span className="text-sm" style={{ color: '#1D2129' }}>
                            {parseFloat(material.quantity).toLocaleString('zh-CN')}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <span className="text-sm" style={{ color: '#1D2129' }}>
                            ¥{formatAmount(material.unit_price)}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <span className="text-sm font-medium" style={{ color: '#FF7D00' }}>
                            ¥{formatAmount(material.total_price)}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="text-sm" style={{ color: '#86909C' }}>
                            {formatDate(material.purchase_date)}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-sm" style={{ color: '#86909C' }}>
                            {material.supplier || '-'}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEditDialog(material)}
                              className="h-8 px-2"
                            >
                              <Pencil className="h-4 w-4" style={{ color: '#165DFF' }} />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setCurrentMaterial(material);
                                setDeleteDialogOpen(true);
                              }}
                              className="h-8 px-2"
                            >
                              <Trash2 className="h-4 w-4" style={{ color: '#F53F3F' }} />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              {/* 分页 */}
              {pagination.totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t" style={{ borderColor: '#E5E6EB' }}>
                  <div className="text-sm" style={{ color: '#86909C' }}>
                    第 {(pagination.page - 1) * pagination.pageSize + 1} - {Math.min(pagination.page * pagination.pageSize, pagination.total)} 条，共 {pagination.total} 条
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pagination.page === 1}
                      onClick={() => fetchMaterials(pagination.page - 1)}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm px-3" style={{ color: '#86909C' }}>
                      {pagination.page} / {pagination.totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pagination.page === pagination.totalPages}
                      onClick={() => fetchMaterials(pagination.page + 1)}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* 新增对话框 */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>新增零星材料</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label style={{ color: '#1D2129' }}>项目 *</Label>
                <Select value={form.project_id} onValueChange={(v) => setForm({ ...form, project_id: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择项目" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map(project => (
                      <SelectItem key={project.id} value={project.id.toString()}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label style={{ color: '#1D2129' }}>材料名称 *</Label>
                <Input
                  placeholder="请输入材料名称"
                  value={form.material_name}
                  onChange={(e) => setForm({ ...form, material_name: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label style={{ color: '#1D2129' }}>单位</Label>
                <Input
                  placeholder="如：个、米"
                  value={form.unit}
                  onChange={(e) => setForm({ ...form, unit: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label style={{ color: '#1D2129' }}>数量 *</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="数量"
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label style={{ color: '#1D2129' }}>单价 *</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="单价"
                  value={form.unit_price}
                  onChange={(e) => setForm({ ...form, unit_price: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label style={{ color: '#1D2129' }}>采购日期 *</Label>
                <Input
                  type="date"
                  value={form.purchase_date}
                  onChange={(e) => setForm({ ...form, purchase_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label style={{ color: '#1D2129' }}>供应商</Label>
                <Input
                  placeholder="供应商名称"
                  value={form.supplier}
                  onChange={(e) => setForm({ ...form, supplier: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label style={{ color: '#1D2129' }}>备注</Label>
              <Textarea
                placeholder="备注信息"
                value={form.remark}
                onChange={(e) => setForm({ ...form, remark: e.target.value })}
                rows={2}
              />
            </div>
            {form.quantity && form.unit_price && (
              <div className="flex items-center justify-end gap-2 pt-2 border-t" style={{ borderColor: '#E5E6EB' }}>
                <span className="text-sm" style={{ color: '#86909C' }}>金额合计：</span>
                <span className="text-lg font-bold" style={{ color: '#FF7D00' }}>
                  ¥{formatAmount((parseFloat(form.quantity) || 0) * (parseFloat(form.unit_price) || 0))}
                </span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>取消</Button>
            <Button onClick={handleAdd} disabled={saving} style={{ backgroundColor: '#165DFF' }}>
              {saving ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 编辑对话框 */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>编辑零星材料</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label style={{ color: '#1D2129' }}>项目 *</Label>
                <Select value={form.project_id} onValueChange={(v) => setForm({ ...form, project_id: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择项目" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map(project => (
                      <SelectItem key={project.id} value={project.id.toString()}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label style={{ color: '#1D2129' }}>材料名称 *</Label>
                <Input
                  placeholder="请输入材料名称"
                  value={form.material_name}
                  onChange={(e) => setForm({ ...form, material_name: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label style={{ color: '#1D2129' }}>单位</Label>
                <Input
                  placeholder="如：个、米"
                  value={form.unit}
                  onChange={(e) => setForm({ ...form, unit: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label style={{ color: '#1D2129' }}>数量 *</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="数量"
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label style={{ color: '#1D2129' }}>单价 *</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="单价"
                  value={form.unit_price}
                  onChange={(e) => setForm({ ...form, unit_price: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label style={{ color: '#1D2129' }}>采购日期 *</Label>
                <Input
                  type="date"
                  value={form.purchase_date}
                  onChange={(e) => setForm({ ...form, purchase_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label style={{ color: '#1D2129' }}>供应商</Label>
                <Input
                  placeholder="供应商名称"
                  value={form.supplier}
                  onChange={(e) => setForm({ ...form, supplier: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label style={{ color: '#1D2129' }}>备注</Label>
              <Textarea
                placeholder="备注信息"
                value={form.remark}
                onChange={(e) => setForm({ ...form, remark: e.target.value })}
                rows={2}
              />
            </div>
            {form.quantity && form.unit_price && (
              <div className="flex items-center justify-end gap-2 pt-2 border-t" style={{ borderColor: '#E5E6EB' }}>
                <span className="text-sm" style={{ color: '#86909C' }}>金额合计：</span>
                <span className="text-lg font-bold" style={{ color: '#FF7D00' }}>
                  ¥{formatAmount((parseFloat(form.quantity) || 0) * (parseFloat(form.unit_price) || 0))}
                </span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>取消</Button>
            <Button onClick={handleEdit} disabled={saving} style={{ backgroundColor: '#165DFF' }}>
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
              确定要删除材料记录 &quot;{currentMaterial?.material_name}&quot; 吗？此操作不可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-500 hover:bg-red-600">
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 导入对话框 */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>批量导入零星材料</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label style={{ color: '#1D2129' }}>选择Excel文件</Label>
              <Input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={(e) => {
                  setImportFile(e.target.files?.[0] || null);
                  setImportResult(null);
                }}
              />
              <p className="text-xs" style={{ color: '#86909C' }}>
                支持 .xlsx、.xls、.csv 格式，文件大小不超过 5MB
              </p>
            </div>
            
            <Button variant="outline" onClick={downloadTemplate} className="gap-2">
              <Download className="h-4 w-4" />
              下载导入模板
            </Button>
            
            <div className="p-3 rounded-lg" style={{ backgroundColor: '#F7F8FA' }}>
              <p className="text-sm font-medium mb-2" style={{ color: '#1D2129' }}>Excel格式要求：</p>
              <ul className="text-xs space-y-1" style={{ color: '#86909C' }}>
                <li>• 第一行为表头，数据从第二行开始</li>
                <li>• 必填列：项目名称、材料名称、数量、单价</li>
                <li>• 可选列：规格型号、单位、金额、采购日期、采购人、备注</li>
                <li>• 金额为空时自动按 数量×单价 计算</li>
                <li>• 采购日期格式：YYYY-MM-DD（如：2024-01-15）</li>
              </ul>
            </div>
            
            {importResult && (
              <div className={`p-3 rounded-lg ${importResult.failed > 0 ? 'bg-orange-50' : 'bg-green-50'}`}>
                <p className="text-sm font-medium" style={{ color: importResult.failed > 0 ? '#FF7D00' : '#00B42A' }}>
                  导入完成：成功 {importResult.success} 条，失败 {importResult.failed} 条
                </p>
                {importResult.errors.length > 0 && (
                  <div className="mt-2 text-xs space-y-1" style={{ color: '#F53F3F' }}>
                    {importResult.errors.slice(0, 5).map((err, idx) => (
                      <p key={idx}>{err}</p>
                    ))}
                    {importResult.errors.length > 5 && (
                      <p>... 还有 {importResult.errors.length - 5} 条错误</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportDialogOpen(false)}>关闭</Button>
            <Button onClick={handleImport} disabled={importing || !importFile} style={{ backgroundColor: '#165DFF' }}>
              {importing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  导入中...
                </>
              ) : '开始导入'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
