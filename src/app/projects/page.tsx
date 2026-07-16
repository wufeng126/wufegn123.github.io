'use client';
import { useToast } from '@/hooks/use-toast';
import { isSuperAdminUser } from '@/lib/route-permissions';

import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { 
  Plus, Pencil, Trash2, Eye, FolderOpen, Building2, TrendingUp, Calendar,
  Plane, Ship, Factory, Home, Building, HardHat, ArrowUpDown, ArrowUp, ArrowDown,
  Hammer, Wrench, Warehouse, Store, Landmark, Mountain, Search
} from 'lucide-react';
import Link from 'next/link';
import { LinkableCell } from '@/components/linkable-cell';

interface UserInfo {
  id: number;
  username: string;
  name: string;
  role: string;
}

interface Project {
  id: number;
  name: string;
  year: number;
  status: string;
  address: string | null;
  partner: string | null;
  contract_amount: string | null;
  icon: string | null;
  building_area: string | null;
  tax_rate: string | number | null;
  expected_completion_date: string | null;
  construction_payment_ratio: string | number | null;
  completion_settlement_payment_ratio: string | number | null;
  warranty_payment_ratio: string | number | null;
  warranty_expired_payment_ratio: string | number | null;
  completion_date: string | null;
  warranty_days: string | number | null;
  created_at: string;
  budgetAmount?: number;
  reportAmount?: number;
  progress?: number;
  inServiceCount?: number;
  leftCount?: number;
  totalWorkerCount?: number;
}

// 可选图标列表
const ICON_OPTIONS = [
  { value: 'HardHat', label: '安全帽', icon: HardHat, color: '#165DFF', bg: '#E8F3FF' },
  { value: 'Building', label: '商业建筑', icon: Building, color: '#FF7D00', bg: '#FFF7E8' },
  { value: 'Home', label: '住宅', icon: Home, color: '#00B42A', bg: '#E8FFEA' },
  { value: 'Factory', label: '工厂', icon: Factory, color: '#722ED1', bg: '#F5E8FF' },
  { value: 'Plane', label: '机场', icon: Plane, color: '#165DFF', bg: '#E8F3FF' },
  { value: 'Ship', label: '港口', icon: Ship, color: '#00B42A', bg: '#E8FFEA' },
  { value: 'Warehouse', label: '仓库', icon: Warehouse, color: '#FF7D00', bg: '#FFF7E8' },
  { value: 'Store', label: '商业', icon: Store, color: '#FF7D00', bg: '#FFF7E8' },
  { value: 'Landmark', label: '地标', icon: Landmark, color: '#722ED1', bg: '#F5E8FF' },
  { value: 'Mountain', label: '基建', icon: Mountain, color: '#86909C', bg: '#F2F3F5' },
  { value: 'Hammer', label: '施工', icon: Hammer, color: '#165DFF', bg: '#E8F3FF' },
  { value: 'Wrench', label: '维修', icon: Wrench, color: '#86909C', bg: '#F2F3F5' },
];

const PROJECT_STATUS_OPTIONS = ['在建', '竣工结算', '质保期', '质保期满'] as const;

const createEmptyProjectForm = () => ({
  name: '',
  year: new Date().getFullYear(),
  status: '在建',
  address: '',
  partner: '',
  contract_amount: '',
  icon: 'HardHat',
  building_area: '',
  tax_rate: '9',
  expected_completion_date: '',
  construction_payment_ratio: '',
  completion_settlement_payment_ratio: '',
  warranty_payment_ratio: '',
  warranty_expired_payment_ratio: '',
  completion_date: '',
  warranty_days: '',
});

const normalizeProjectStatus = (status?: string | null) => {
  if (status === '进行中') return '在建';
  if (status === '已完成') return '竣工结算';
  if (status === '暂停') return '在建';
  return status || '在建';
};

// 根据 icon 值获取图标配置
const getIconByValue = (iconValue: string | null) => {
  return ICON_OPTIONS.find(opt => opt.value === iconValue) || ICON_OPTIONS[0];
};

// 项目类型图标映射（作为后备）
const getProjectIcon = (name: string, iconValue: string | null = null) => {
  // 如果有自定义图标，使用自定义图标
  if (iconValue) {
    return getIconByValue(iconValue);
  }
  // 否则根据名称自动匹配
  const lowerName = name.toLowerCase();
  if (lowerName.includes('机场') || lowerName.includes('航站')) {
    return getIconByValue('Plane');
  }
  if (lowerName.includes('港口') || lowerName.includes('码头') || lowerName.includes('航运')) {
    return getIconByValue('Ship');
  }
  if (lowerName.includes('产业') || lowerName.includes('工业园') || lowerName.includes('厂房') || lowerName.includes('基地')) {
    return getIconByValue('Factory');
  }
  if (lowerName.includes('住宅') || lowerName.includes('小区') || lowerName.includes('公寓')) {
    return getIconByValue('Home');
  }
  if (lowerName.includes('商业') || lowerName.includes('商场') || lowerName.includes('写字楼')) {
    return getIconByValue('Building');
  }
  if (lowerName.includes('路') || lowerName.includes('道') || lowerName.includes('公路')) {
    return getIconByValue('Mountain');
  }
  if (lowerName.includes('桥')) {
    return getIconByValue('Landmark');
  }
  return getIconByValue('HardHat');
};

type SortField = 'contract_amount' | 'year' | 'status' | null;
type SortOrder = 'asc' | 'desc';

export default function ProjectsPage() {
  const { toast } = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [showContent, setShowContent] = useState(false);
  const [sortField, setSortField] = useState<SortField>(null);
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [user, setUser] = useState<UserInfo | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterYear, setFilterYear] = useState<string>('all');

  
  const [formData, setFormData] = useState(createEmptyProjectForm);

  useEffect(() => {
    fetchProjects();
    fetchUser();
  }, []);

  async function fetchUser() {
    try {
      const res = await fetch('/api/auth/me');
      const data = await res.json();
      if (data.authenticated && data.user) {
        setUser(data.user);
      }
    } catch (error) {
      console.error('获取用户信息失败:', error);
    }
  }

  useEffect(() => {
    if (!loading) {
      const timer = setTimeout(() => setShowContent(true), 50);
      return () => clearTimeout(timer);
    }
  }, [loading]);

  async function fetchProjects() {
    setLoading(true);
    setShowContent(false);
    try {
      const res = await fetch('/api/projects');
      const data = await res.json();
      setProjects(data.projects || []);
    } catch (error) {
      console.error('获取项目列表失败:', error);
    } finally {
      setLoading(false);
    }
  }

  const filteredAndSortedProjects = useMemo(() => {
    let result = [...projects];
    
    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(p => 
        p.name.toLowerCase().includes(q) || 
        p.partner?.toLowerCase().includes(q) ||
        p.address?.toLowerCase().includes(q)
      );
    }
    
    // Status filter
    if (filterStatus !== 'all') {
      result = result.filter(p => p.status === filterStatus);
    }
    
    // Year filter
    if (filterYear !== 'all') {
      result = result.filter(p => String(p.year) === filterYear);
    }
    
    // Sort
    if (!sortField) return result;
    
    return result.sort((a, b) => {
      let valueA: number | string;
      let valueB: number | string;
      
      switch (sortField) {
        case 'contract_amount':
          valueA = parseFloat(a.contract_amount || '0') || 0;
          valueB = parseFloat(b.contract_amount || '0') || 0;
          break;
        case 'year':
          valueA = a.year;
          valueB = b.year;
          break;
        case 'status':
          const statusOrder = { '在建': 1, '竣工结算': 2, '质保期': 3, '质保期满': 4, '进行中': 1, '已完成': 2, '暂停': 1 };
          valueA = statusOrder[a.status as keyof typeof statusOrder] || 99;
          valueB = statusOrder[b.status as keyof typeof statusOrder] || 99;
          break;
        default:
          return 0;
      }
      
      if (sortOrder === 'asc') {
        return valueA > valueB ? 1 : valueA < valueB ? -1 : 0;
      } else {
        return valueA < valueB ? 1 : valueA > valueB ? -1 : 0;
      }
    });
  }, [projects, searchQuery, filterStatus, filterYear, sortField, sortOrder]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3.5 h-3.5" style={{ color: '#C9CDD4' }} />;
    }
    return sortOrder === 'asc' 
      ? <ArrowUp className="w-3.5 h-3.5" style={{ color: '#165DFF' }} />
      : <ArrowDown className="w-3.5 h-3.5" style={{ color: '#165DFF' }} />;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const url = editingProject 
        ? `/api/projects/${editingProject.id}` 
        : '/api/projects';
      const method = editingProject ? 'PUT' : 'POST';
      
      const submitData = {
        ...formData,
        contract_amount: formData.contract_amount || null,
        building_area: formData.building_area || null,
        construction_payment_ratio: formData.construction_payment_ratio || null,
        completion_settlement_payment_ratio: formData.completion_settlement_payment_ratio || null,
        warranty_payment_ratio: formData.warranty_payment_ratio || null,
        warranty_expired_payment_ratio: formData.warranty_expired_payment_ratio || null,
        completion_date: formData.completion_date || null,
        warranty_days: formData.warranty_days || null,
      };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(submitData),
      });

      if (res.ok) {
        setDialogOpen(false);
        setEditingProject(null);
        setFormData(createEmptyProjectForm());
        fetchProjects();
      } else {
        const error = await res.json();
        toast({ title: error.error || '操作失败', variant: 'error' });
      }
    } catch (error) {
      console.error('保存失败:', error);
      toast({ title: '保存失败', variant: 'error' });
    }
  };

  const handleEdit = (project: Project) => {
    setEditingProject(project);
    setFormData({
      name: project.name,
      year: project.year,
      status: normalizeProjectStatus(project.status),
      address: project.address || '',
      partner: project.partner || '',
      contract_amount: project.contract_amount || '',
      icon: project.icon || 'HardHat',
      building_area: project.building_area || '',
      tax_rate: String(project.tax_rate || 9),
      expected_completion_date: project.expected_completion_date || '',
      construction_payment_ratio: String(project.construction_payment_ratio || ''),
      completion_settlement_payment_ratio: String(project.completion_settlement_payment_ratio || ''),
      warranty_payment_ratio: String(project.warranty_payment_ratio || ''),
      warranty_expired_payment_ratio: String(project.warranty_expired_payment_ratio || ''),
      completion_date: project.completion_date || '',
      warranty_days: String(project.warranty_days || ''),
    });
    setDialogOpen(true);
  };

  const [deleteConfirm, setDeleteConfirm] = useState<{id: number, name: string, counts: Record<string, number> | null} | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const handleDeleteClick = async (id: number, name: string) => {
    setDeleteConfirm({ id, name, counts: null });
    setDeleteDialogOpen(true);
    try {
      const res = await fetch(`/api/projects/${id}/related-counts`);
      if (res.ok) {
        const data = await res.json();
        setDeleteConfirm({ id, name, counts: data.counts });
      }
    } catch {
      // If counts fail, still show dialog without counts
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirm) return;
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/projects/${deleteConfirm.id}`, { method: 'DELETE' });
      if (res.ok) {
        toast({ title: '项目已删除' });
        fetchProjects();
      } else {
        const error = await res.json();
        toast({ title: error.error || '删除失败', variant: 'error' });
      }
    } catch (error) {
      console.error('删除失败:', error);
      toast({ title: '删除失败', variant: 'error' });
    } finally {
      setDeleteLoading(false);
      setDeleteConfirm(null);
    }
  };

  const openAddDialog = () => {
    setEditingProject(null);
    setFormData(createEmptyProjectForm());
    setDialogOpen(true);
  };
  const formatCurrency = (amount: string | null) => {
    if (!amount) return '-';
    return `¥${parseFloat(amount).toLocaleString('zh-CN', { maximumFractionDigits: 0 })}`;
  };

  const stats = {
    totalCount: projects.length,
    activeCount: projects.filter(p => p.status === '在建' || p.status === '进行中').length,
    totalAmount: projects.reduce((sum, p) => sum + (parseFloat(p.contract_amount || '0') || 0), 0),
    currentYearCount: projects.filter(p => p.year === new Date().getFullYear()).length,
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case '在建':
      case '进行中':
        return { bg: '#E8F3FF', color: '#165DFF', border: '#B5D8FF' };
      case '竣工结算':
      case '已完成':
        return { bg: '#E8FFEA', color: '#00B42A', border: '#9FD9A8' };
      case '质保期':
        return { bg: '#F5EEFF', color: '#722ED1', border: '#D8B9FF' };
      case '质保期满':
        return { bg: '#FFF7E8', color: '#D46B08', border: '#FFCF8B' };
      case '暂停':
        return { bg: '#FFF7E8', color: '#FF7D00', border: '#FFCF8B' };
      default:
        return { bg: '#F2F3F5', color: '#86909C', border: '#C9CDD4' };
    }
  };

  return (
    <div className="space-y-5">
      {/* 页面标题 */}
      <div className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 transition-all duration-500 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
        <div>
          <h1 className="text-xl font-semibold tracking-tight" style={{ color: '#1D2129' }}>项目信息</h1>
          <p className="text-sm mt-0.5" style={{ color: '#86909C' }}>项目基础档案台账，集中维护项目名称、甲方、地址和合同信息</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="btn-primary h-9" onClick={openAddDialog}>
              <Plus className="w-4 h-4 mr-1.5" />
              新增项目
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-lg overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="dialog-header">{editingProject ? '编辑项目' : '新增项目'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label className="text-sm" style={{ color: '#1D2129' }}>项目名称 *</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="请输入项目名称"
                    required
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label className="text-sm" style={{ color: '#1D2129' }}>年度 *</Label>
                  <Input
                    type="number"
                    value={formData.year}
                    onChange={(e) => setFormData({ ...formData, year: parseInt(e.target.value) })}
                    required
                    className="mt-1.5"
                  />
                </div>
              </div>
              <div>
                <Label className="text-sm" style={{ color: '#1D2129' }}>项目地址</Label>
                <Input
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="请输入项目地址"
                  className="mt-1.5"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label className="text-sm" style={{ color: '#1D2129' }}>合作单位</Label>
                  <Input
                    value={formData.partner}
                    onChange={(e) => setFormData({ ...formData, partner: e.target.value })}
                    placeholder="请输入合作单位"
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label className="text-sm" style={{ color: '#1D2129' }}>合同额</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.contract_amount}
                    onChange={(e) => setFormData({ ...formData, contract_amount: e.target.value })}
                    placeholder="请输入合同额"
                    className="mt-1.5"
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label className="text-sm" style={{ color: '#1D2129' }}>状态</Label>
                  <Select
                    value={formData.status}
                    onValueChange={(value) => setFormData({ ...formData, status: value })}
                  >
                    <SelectTrigger className="mt-1.5">
                      <SelectValue placeholder="选择状态" />
                    </SelectTrigger>
                    <SelectContent>
                      {PROJECT_STATUS_OPTIONS.map(status => (
                        <SelectItem key={status} value={status}>{status}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm" style={{ color: '#1D2129' }}>建筑面积（㎡）</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.building_area}
                    onChange={(e) => setFormData({ ...formData, building_area: e.target.value })}
                    placeholder="请输入建筑面积"
                    className="mt-1.5"
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label className="text-sm" style={{ color: '#1D2129' }}>适用税率（%）</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.tax_rate}
                    onChange={(e) => setFormData({ ...formData, tax_rate: e.target.value })}
                    placeholder="9"
                    className="mt-1.5"
                  />
                  <p className="text-xs mt-1" style={{ color: '#86909C' }}>产值结算时将自动使用此税率</p>
                </div>
                <div>
                  <Label className="text-sm" style={{ color: '#1D2129' }}>预计完工日期</Label>
                  <Input
                    type="date"
                    value={formData.expected_completion_date || ''}
                    onChange={(e) => setFormData({ ...formData, expected_completion_date: e.target.value })}
                    className="mt-1.5"
                  />
                </div>
              </div>
              <div className="rounded-lg border p-3" style={{ borderColor: '#E5E6EB', background: '#FAFAFA' }}>
                <div className="mb-3">
                  <div className="text-sm font-medium" style={{ color: '#1D2129' }}>经营应收配置</div>
                  <p className="mt-1 text-xs" style={{ color: '#86909C' }}>不同项目可单独维护状态付款比例，经营总览会按当前状态自动计算应收。</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label className="text-sm" style={{ color: '#1D2129' }}>在建付款比例（%）</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.construction_payment_ratio}
                      onChange={(e) => setFormData({ ...formData, construction_payment_ratio: e.target.value })}
                      placeholder="例如 80"
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <Label className="text-sm" style={{ color: '#1D2129' }}>竣工结算付款比例（%）</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.completion_settlement_payment_ratio}
                      onChange={(e) => setFormData({ ...formData, completion_settlement_payment_ratio: e.target.value })}
                      placeholder="例如 95"
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <Label className="text-sm" style={{ color: '#1D2129' }}>质保期付款比例（%）</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.warranty_payment_ratio}
                      onChange={(e) => setFormData({ ...formData, warranty_payment_ratio: e.target.value })}
                      placeholder="例如 97"
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <Label className="text-sm" style={{ color: '#1D2129' }}>质保期满付款比例（%）</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.warranty_expired_payment_ratio}
                      onChange={(e) => setFormData({ ...formData, warranty_expired_payment_ratio: e.target.value })}
                      placeholder="例如 100"
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <Label className="text-sm" style={{ color: '#1D2129' }}>完工日期</Label>
                    <Input
                      type="date"
                      value={formData.completion_date || ''}
                      onChange={(e) => setFormData({ ...formData, completion_date: e.target.value })}
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <Label className="text-sm" style={{ color: '#1D2129' }}>质保期天数</Label>
                    <Input
                      type="number"
                      step="1"
                      min="0"
                      value={formData.warranty_days}
                      onChange={(e) => setFormData({ ...formData, warranty_days: e.target.value })}
                      placeholder="例如 730"
                      className="mt-1.5"
                    />
                  </div>
                </div>
              </div>
              <div>
                <Label className="text-sm" style={{ color: '#1D2129' }}>项目图标</Label>
                <div className="mt-1.5 grid grid-cols-3 gap-2 border p-3 sm:grid-cols-6 rounded-lg" style={{ borderColor: '#E5E6EB', background: '#FAFAFA' }}>
                  {ICON_OPTIONS.map((option) => {
                    const IconComponent = option.icon;
                    const isSelected = formData.icon === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setFormData({ ...formData, icon: option.value })}
                        className={`flex flex-col items-center justify-center p-2 rounded-lg transition-all ${
                          isSelected ? 'ring-2 ring-blue-500 bg-white shadow-sm' : 'hover:bg-white'
                        }`}
                        title={option.label}
                      >
                        <div 
                          className="w-8 h-8 rounded-lg flex items-center justify-center"
                          style={{ background: option.bg }}
                        >
                          <IconComponent className="w-5 h-5" style={{ color: option.color }} />
                        </div>
                        <span className="text-xs mt-1" style={{ color: isSelected ? '#165DFF' : '#86909C' }}>
                          {option.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex flex-col-reverse gap-3 border-t pt-3 sm:flex-row sm:justify-end" style={{ borderColor: '#E5E6EB' }}>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="border-gray-300">
                  取消
                </Button>
                <Button type="submit" className="btn-primary">{editingProject ? '保存' : '新增'}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* 统计卡片 */}
      <div className={`grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 transition-all duration-500 delay-100 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
        <Card className="stat-card">
          <CardContent className="pt-5 pb-5">
            <div className="flex items-center gap-4">
              <div className="stat-icon-container" style={{ background: 'linear-gradient(135deg, #4E5969 0%, #1D2129 100%)' }}>
                <FolderOpen className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-sm" style={{ color: '#86909C' }}>项目总数</p>
                <p className="text-2xl font-bold" style={{ color: '#1D2129' }}>{stats.totalCount}<span className="text-sm font-normal ml-1" style={{ color: '#C9CDD4' }}>个</span></p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="stat-card stat-card-blue">
          <CardContent className="pt-5 pb-5">
            <div className="flex items-center gap-4">
              <div className="stat-icon-container stat-icon-blue">
                <Building2 className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-sm" style={{ color: '#86909C' }}>在施项目</p>
                <p className="text-2xl font-bold stat-number-blue">{stats.activeCount}<span className="text-sm font-normal ml-1" style={{ color: '#C9CDD4' }}>个</span></p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="stat-card stat-card-green">
          <CardContent className="pt-5 pb-5">
            <div className="flex items-center gap-4">
              <div className="stat-icon-container stat-icon-green">
                <TrendingUp className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-sm" style={{ color: '#86909C' }}>总合同额</p>
                <p className="text-xl font-bold stat-number-green">¥{stats.totalAmount.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="stat-card stat-card-orange">
          <CardContent className="pt-5 pb-5">
            <div className="flex items-center gap-4">
              <div className="stat-icon-container stat-icon-orange">
                <Calendar className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-sm" style={{ color: '#86909C' }}>本年度项目</p>
                <p className="text-2xl font-bold stat-number-orange">{stats.currentYearCount}<span className="text-sm font-normal ml-1" style={{ color: '#C9CDD4' }}>个</span></p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 搜索与筛选栏 */}
      <div className={`grid gap-3 mb-4 sm:flex sm:flex-wrap sm:items-center transition-all duration-500 delay-200 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
        <div className="relative min-w-0 flex-1 sm:min-w-[200px] sm:max-w-[320px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#86909C' }} />
          <input
            type="text"
            placeholder="搜索项目名称、甲方或地址..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            style={{ borderColor: '#E5E6EB' }}
          />
        </div>
        <select
          value={filterYear}
          onChange={e => setFilterYear(e.target.value)}
          className="w-full rounded-lg border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 sm:w-auto"
          style={{ borderColor: '#E5E6EB' }}
        >
          <option value="all">全部年度</option>
          {[2026, 2025, 2024, 2023].map(y => <option key={y} value={String(y)}>{y}年</option>)}
        </select>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="w-full rounded-lg border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 sm:w-auto"
          style={{ borderColor: '#E5E6EB' }}
        >
          <option value="all">全部状态</option>
          {PROJECT_STATUS_OPTIONS.map(status => (
            <option key={status} value={status}>{status}</option>
          ))}
        </select>
        <span className="text-xs" style={{ color: '#86909C' }}>
          共 {filteredAndSortedProjects.length} 个项目
        </span>
      </div>

      {/* 数据表格 */}
      <div className={`transition-all duration-500 delay-200 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
        <Card className="overflow-hidden border" style={{ borderColor: '#E5E6EB' }}>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <div className="loading-spinner" />
              </div>
            ) : (
              <>
              <div className="space-y-3 p-3 md:hidden">
                {filteredAndSortedProjects.length === 0 && (
                  <div className="rounded-xl border border-dashed bg-white px-4 py-10 text-center" style={{ borderColor: '#E5E6EB' }}>
                    <FolderOpen className="mx-auto h-8 w-8" style={{ color: '#C9CDD4' }} />
                    <p className="mt-3 text-sm font-medium" style={{ color: '#1D2129' }}>暂无项目</p>
                    <p className="mt-1 text-xs" style={{ color: '#86909C' }}>点击新增项目按钮添加第一个项目</p>
                  </div>
                )}
                {filteredAndSortedProjects.map((project) => {
                  const projectIcon = getProjectIcon(project.name, project.icon);
                  const IconComponent = projectIcon.icon;
                  const statusStyle = getStatusStyle(project.status);

                  return (
                    <div key={project.id} className="rounded-xl border bg-white p-3" style={{ borderColor: '#E5E6EB' }}>
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" style={{ background: projectIcon.bg }}>
                          <IconComponent className="h-5 w-5" style={{ color: projectIcon.color }} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <Link href={`/projects/${project.id}`} className="line-clamp-2 text-sm font-semibold text-[#1D2129]">
                            {project.name}
                          </Link>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <span
                              className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                              style={{ background: statusStyle.bg, color: statusStyle.color, border: `1px solid ${statusStyle.border}` }}
                            >
                              {project.status}
                            </span>
                            <span className="text-xs" style={{ color: '#86909C' }}>{project.year}</span>
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 grid gap-2 text-xs">
                        <div className="flex justify-between gap-3">
                          <span className="shrink-0" style={{ color: '#86909C' }}>甲方</span>
                          <span className="truncate font-medium" style={{ color: '#1D2129' }}>{project.partner || '-'}</span>
                        </div>
                        <div className="flex justify-between gap-3">
                          <span className="shrink-0" style={{ color: '#86909C' }}>地址</span>
                          <span className="truncate font-medium" style={{ color: '#1D2129' }}>{project.address || '-'}</span>
                        </div>
                        <div className="flex justify-between gap-3">
                          <span className="shrink-0" style={{ color: '#86909C' }}>合同金额</span>
                          <span className="font-semibold" style={{ color: '#165DFF' }}>{formatCurrency(project.contract_amount)}</span>
                        </div>
                      </div>
                      <div className="mt-3 flex justify-end gap-2 border-t pt-3" style={{ borderColor: '#F2F3F5' }}>
                        <Link href={`/projects/${project.id}`}>
                          <Button size="sm" variant="outline" className="h-8 px-3" title="查看详情">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </Link>
                        <Button size="sm" variant="outline" onClick={() => handleEdit(project)} className="h-8 px-3" title="编辑">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {isSuperAdminUser(user?.role) && (
                          <Button size="sm" variant="outline" onClick={() => handleDeleteClick(project.id, project.name)} className="h-8 px-3 text-red-500" title="删除">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="hidden overflow-x-auto md:block">
                {/* 表格容器 - 使用 grid 布局确保对齐 */}
                <div className="min-w-[980px]">
                  {/* 表头 */}
                  <div
                    className="grid items-center border-b"
                    style={{
                      gridTemplateColumns: 'minmax(200px,1.25fr) minmax(130px,.85fr) minmax(180px,1fr) 120px 80px 116px 112px',
                      background: '#F7F8FA',
                      borderColor: '#E5E6EB',
                    }}
                  >
                    <div className="px-4 py-3.5 text-sm font-semibold" style={{ color: '#1D2129' }}>
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4" style={{ color: '#165DFF' }} />
                        项目名称
                      </div>
                    </div>
                    <div className="px-4 py-3.5 text-sm font-semibold" style={{ color: '#1D2129' }}>甲方</div>
                    <div className="px-4 py-3.5 text-sm font-semibold" style={{ color: '#1D2129' }}>地址</div>
                    <div 
                      className="px-4 py-3.5 text-sm font-semibold text-right cursor-pointer transition-colors flex items-center justify-end gap-1"
                      style={{ color: '#1D2129' }}
                      onClick={() => handleSort('contract_amount')}
                    >
                      合同金额
                      {getSortIcon('contract_amount')}
                    </div>
                    <div 
                      className="px-4 py-3.5 text-sm font-semibold text-center cursor-pointer transition-colors flex items-center justify-center gap-1 whitespace-nowrap"
                      style={{ color: '#1D2129' }}
                      onClick={() => handleSort('year')}
                    >
                      年度
                      {getSortIcon('year')}
                    </div>
                    <div 
                      className="px-4 py-3.5 text-sm font-semibold text-center cursor-pointer transition-colors flex items-center justify-center gap-1 whitespace-nowrap"
                      style={{ color: '#1D2129' }}
                      onClick={() => handleSort('status')}
                    >
                      项目状态
                      {getSortIcon('status')}
                    </div>
                    <div className="px-4 py-3.5 text-sm font-semibold text-right" style={{ color: '#1D2129' }}>操作</div>
                  </div>

                  {/* 表格内容 */}
                  <div className="divide-y" style={{ borderColor: '#E5E6EB' }}>
                    {filteredAndSortedProjects.map((project, index) => {
                      const projectIcon = getProjectIcon(project.name, project.icon);
                      const IconComponent = projectIcon.icon;
                      const statusStyle = getStatusStyle(project.status);
                      
                      return (
                        <div 
                          key={project.id} 
                          className="grid items-center transition-colors hover:bg-[#F0F5FF]"
                          style={{ 
                            gridTemplateColumns: 'minmax(200px,1.25fr) minmax(130px,.85fr) minmax(180px,1fr) 120px 80px 116px 112px',
                            background: index % 2 === 1 ? '#FAFBFD' : 'transparent',
                            borderBottom: '1px solid #E5E6EB'
                          }}
                        >
                          {/* 项目名称 */}
                          <div className="px-4 py-3.5">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: projectIcon.bg }}>
                                <IconComponent className="w-4 h-4" style={{ color: projectIcon.color }} />
                              </div>
                              <LinkableCell 
                                className="font-medium text-foreground"
                                href={`/projects/${project.id}`}
                              >
                                {project.name}
                              </LinkableCell>
                            </div>
                          </div>
                          
                          {/* 甲方 */}
                          <div className="px-4 py-3.5 text-sm truncate" style={{ color: '#4E5969' }}>
                            {project.partner || '-'}
                          </div>
                          
                          {/* 地址 */}
                          <div className="px-4 py-3.5 text-sm truncate" style={{ color: '#4E5969' }}>
                            {project.address || '-'}
                          </div>
                          
                          {/* 合同额 */}
                          <div className="px-4 py-3.5 text-right">
                            <span className="font-bold" style={{ color: '#165DFF' }}>{formatCurrency(project.contract_amount)}</span>
                          </div>
                          
                          {/* 年度 */}
                          <div className="px-4 py-3.5 text-center text-sm" style={{ color: '#1D2129' }}>
                            {project.year}
                          </div>
                          
                          {/* 状态 */}
                          <div className="px-4 py-3.5 text-center">
                            <span 
                              className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
                              style={{ 
                                background: statusStyle.bg, 
                                color: statusStyle.color,
                                border: `1px solid ${statusStyle.border}`
                              }}
                            >
                              {project.status}
                            </span>
                          </div>
                          
                          {/* 操作 */}
                          <div className="px-4 py-3.5 flex justify-end gap-2">
                            <Link href={`/projects/${project.id}`}>
                              <Button size="sm" variant="ghost" className="h-8 w-8 p-0" style={{ color: '#165DFF' }} title="查看详情">
                                <Eye className="w-4 h-4" />
                              </Button>
                            </Link>
                            <Button size="sm" variant="ghost" onClick={() => handleEdit(project)} className="h-8 w-8 p-0" style={{ color: '#FF7D00' }} title="编辑">
                              <Pencil className="w-4 h-4" />
                            </Button>
                            {isSuperAdminUser(user?.role) && (
                              <Button size="sm" variant="ghost" onClick={() => handleDeleteClick(project.id, project.name)} className="h-8 w-8 p-0" style={{ color: '#F53F3F' }} title="删除">
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {filteredAndSortedProjects.length === 0 && (
                      <div className="px-4 py-14 text-center">
                        <div className="empty-state-icon mx-auto">
                          <FolderOpen className="w-8 h-8" style={{ color: '#C9CDD4' }} />
                        </div>
                        <p className="empty-state-title mt-3">暂无项目</p>
                        <p className="empty-state-description">点击&quot;新增项目&quot;按钮添加第一个项目</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 删除确认弹窗 - 显示关联数据 */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除项目</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <p>确定要删除项目 <strong>&quot;{deleteConfirm?.name}&quot;</strong> 吗？此操作不可恢复。</p>
                {deleteConfirm?.counts && deleteConfirm.counts.totalCount > 0 && (
                  <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm font-medium text-red-700 mb-2">以下数据将一并删除：</p>
                    <ul className="text-sm text-red-600 space-y-1">
                      {deleteConfirm.counts.workers > 0 && <li>• 工人记录 {deleteConfirm.counts.workers} 条</li>}
                      {deleteConfirm.counts.salaries > 0 && <li>• 工资记录 {deleteConfirm.counts.salaries} 条</li>}
                      {deleteConfirm.counts.subitems > 0 && <li>• 分项工程 {deleteConfirm.counts.subitems} 条</li>}
                      {deleteConfirm.counts.clientReports > 0 && <li>• 产值记录 {deleteConfirm.counts.clientReports} 条</li>}
                      {deleteConfirm.counts.clientPayments > 0 && <li>• 付款记录 {deleteConfirm.counts.clientPayments} 条</li>}
                      {deleteConfirm.counts.settlements > 0 && <li>• 结算记录 {deleteConfirm.counts.settlements} 条</li>}
                      {deleteConfirm.counts.expenses > 0 && <li>• 综合费用 {deleteConfirm.counts.expenses} 条</li>}
                    </ul>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} disabled={deleteLoading} className="bg-red-500 hover:bg-red-600">
              {deleteLoading ? '删除中...' : '确认删除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
