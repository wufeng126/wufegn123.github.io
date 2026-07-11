'use client';
import { useToast } from '@/hooks/use-toast';
import { isSuperAdminUser } from '@/lib/route-permissions';

import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { 
  Plus, Pencil, Trash2, Eye, FolderOpen, Building2, TrendingUp, Calendar,
  Plane, Ship, Factory, Home, Building, HardHat, ArrowUpDown, ArrowUp, ArrowDown,
  Hammer, Wrench, Warehouse, Store, Landmark, Mountain, Users, UserCheck, UserX, Search
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
  expected_completion_date: string | null;
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

type SortField = 'contract_amount' | 'year' | 'status' | 'building_area' | null;
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
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterYear, setFilterYear] = useState<string>('all');

  
  const [formData, setFormData] = useState({
    name: '',
    year: new Date().getFullYear(),
    status: '进行中',
    address: '',
    partner: '',
    contract_amount: '',
    icon: 'HardHat',
    building_area: '',
    tax_rate: '9',
    expected_completion_date: '',
  });

  useEffect(() => {
    fetchProjects();
    fetchUser();
  }, []);

  const fetchUser = async () => {
    try {
      const res = await fetch('/api/auth/me');
      const data = await res.json();
      if (data.authenticated && data.user) {
        setUser(data.user);
      }
    } catch (error) {
      console.error('获取用户信息失败:', error);
    }
  };

  useEffect(() => {
    if (!loading) {
      const timer = setTimeout(() => setShowContent(true), 50);
      return () => clearTimeout(timer);
    }
  }, [loading]);

  const fetchProjects = async () => {
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
  };

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
        case 'building_area':
          valueA = parseFloat(a.building_area || '0') || 0;
          valueB = parseFloat(b.building_area || '0') || 0;
          break;
        case 'year':
          valueA = a.year;
          valueB = b.year;
          break;
        case 'status':
          const statusOrder = { '进行中': 1, '暂停': 2, '已完成': 3 };
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
  }, [projects, sortField, sortOrder]);

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
        setFormData({ 
          name: '', 
          year: new Date().getFullYear(), 
          status: '进行中',
          address: '',
          partner: '',
          contract_amount: '',
          icon: 'HardHat',
          building_area: '',
          tax_rate: '9',
          expected_completion_date: '',
        });
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
      status: project.status,
      address: project.address || '',
      partner: project.partner || '',
      contract_amount: project.contract_amount || '',
      icon: project.icon || 'HardHat',
      building_area: project.building_area || '',
      tax_rate: String((project as any).tax_rate || 9),
      expected_completion_date: (project as any).expected_completion_date || '',
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
    setFormData({ 
      name: '', 
      year: new Date().getFullYear(), 
      status: '进行中',
      address: '',
      partner: '',
      contract_amount: '',
      icon: 'HardHat',
      building_area: '',
      tax_rate: '9',
      expected_completion_date: '',
    });
    setDialogOpen(true);
  };
  const formatCurrency = (amount: string | null) => {
    if (!amount) return '-';
    return `¥${parseFloat(amount).toLocaleString('zh-CN', { maximumFractionDigits: 0 })}`;
  };

  const stats = {
    activeCount: projects.filter(p => p.status === '进行中').length,
    totalAmount: projects.reduce((sum, p) => sum + (parseFloat(p.contract_amount || '0') || 0), 0),
    currentYearCount: projects.filter(p => p.year === new Date().getFullYear()).length,
    totalInService: projects.reduce((sum, p) => sum + (p.inServiceCount || 0), 0),
    totalLeft: projects.reduce((sum, p) => sum + (p.leftCount || 0), 0),
    totalWorkers: projects.reduce((sum, p) => sum + (p.totalWorkerCount || 0), 0),
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case '进行中':
        return { bg: '#E8F3FF', color: '#165DFF', border: '#B5D8FF' };
      case '已完成':
        return { bg: '#E8FFEA', color: '#00B42A', border: '#9FD9A8' };
      case '暂停':
        return { bg: '#FFF7E8', color: '#FF7D00', border: '#FFCF8B' };
      default:
        return { bg: '#F2F3F5', color: '#86909C', border: '#C9CDD4' };
    }
  };

  const getProgressColor = (progress: number) => {
    if (progress >= 100) return 'bg-emerald-500';
    if (progress >= 70) return 'bg-blue-500';
    if (progress >= 40) return 'bg-amber-500';
    return 'bg-gray-500';
  };

  return (
    <div className="space-y-5">
      {/* 页面标题 */}
      <div className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 transition-all duration-500 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
        <div>
          <h1 className="text-xl font-semibold tracking-tight" style={{ color: '#1D2129' }}>项目管理</h1>
          <p className="text-sm mt-0.5" style={{ color: '#86909C' }}>管理项目信息，关联各项数据</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="btn-primary h-9">
              <Plus className="w-4 h-4 mr-1.5" />
              新增项目
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="dialog-header">{editingProject ? '编辑项目' : '新增项目'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
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
              <div className="grid grid-cols-2 gap-4">
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
              <div className="grid grid-cols-2 gap-4">
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
                      <SelectItem value="进行中">进行中</SelectItem>
                      <SelectItem value="已完成">已完成</SelectItem>
                      <SelectItem value="暂停">暂停</SelectItem>
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
              <div className="grid grid-cols-2 gap-4">
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
              <div>
                <Label className="text-sm" style={{ color: '#1D2129' }}>项目图标</Label>
                <div className="mt-1.5 grid grid-cols-6 gap-2 p-3 border rounded-lg" style={{ borderColor: '#E5E6EB', background: '#FAFAFA' }}>
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
              <div className="flex justify-end gap-3 pt-3 border-t" style={{ borderColor: '#E5E6EB' }}>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="border-gray-300">
                  取消
                </Button>
                <Button type="submit" className="btn-primary">{editingProject ? '保存' : '新增'}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* 统计卡片 - 第一行 */}
      <div className={`grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 transition-all duration-500 delay-100 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
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

        <Card className="stat-card" style={{ background: 'linear-gradient(135deg, #E8FFEA 0%, #F0FFF0 100%)', borderColor: '#B8F0B8' }}>
          <CardContent className="pt-5 pb-5">
            <div className="flex items-center gap-4">
              <div className="stat-icon-container" style={{ background: 'linear-gradient(135deg, #00B42A 0%, #52C41A 100%)' }}>
                <UserCheck className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-sm" style={{ color: '#86909C' }}>在场人数</p>
                <p className="text-2xl font-bold" style={{ color: '#00B42A' }}>{stats.totalInService}<span className="text-sm font-normal ml-1" style={{ color: '#C9CDD4' }}>人</span></p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="stat-card" style={{ background: 'linear-gradient(135deg, #FFF7E8 0%, #FFFAF0 100%)', borderColor: '#FFD8A8' }}>
          <CardContent className="pt-5 pb-5">
            <div className="flex items-center gap-4">
              <div className="stat-icon-container" style={{ background: 'linear-gradient(135deg, #FF7D00 0%, #FA8C16 100%)' }}>
                <UserX className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-sm" style={{ color: '#86909C' }}>退场人数</p>
                <p className="text-2xl font-bold" style={{ color: '#FF7D00' }}>{stats.totalLeft}<span className="text-sm font-normal ml-1" style={{ color: '#C9CDD4' }}>人</span></p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 搜索与筛选栏 */}
      <div className={`flex flex-wrap items-center gap-3 mb-4 transition-all duration-500 delay-200 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
        <div className="relative flex-1 min-w-[200px] max-w-[320px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#86909C' }} />
          <input
            type="text"
            placeholder="搜索项目名称..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            style={{ borderColor: '#E5E6EB' }}
          />
        </div>
        <select
          value={filterYear}
          onChange={e => setFilterYear(e.target.value)}
          className="px-3 py-2 text-sm rounded-lg border bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          style={{ borderColor: '#E5E6EB' }}
        >
          <option value="">全部年度</option>
          {[2026, 2025, 2024, 2023].map(y => <option key={y} value={String(y)}>{y}年</option>)}
        </select>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="px-3 py-2 text-sm rounded-lg border bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          style={{ borderColor: '#E5E6EB' }}
        >
          <option value="">全部状态</option>
          <option value="进行中">进行中</option>
          <option value="已完工">已完工</option>
          <option value="已暂停">已暂停</option>
          <option value="未开始">未开始</option>
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
            ) : filteredAndSortedProjects.length > 0 ? (
              <div className="overflow-x-auto">
                {/* 表格容器 - 使用 grid 布局确保对齐 */}
                <div className="min-w-[1400px]">
                  {/* 表头 */}
                  <div 
                    className="grid items-center border-b"
                    style={{ 
                      gridTemplateColumns: '200px 160px 140px 120px 90px 100px 90px 96px 120px 140px',
                      background: '#F7F8FA', 
                      borderColor: '#E5E6EB' 
                    }}
                  >
                    <div className="px-4 py-3.5 text-sm font-semibold" style={{ color: '#1D2129' }}>
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4" style={{ color: '#165DFF' }} />
                        项目名称
                      </div>
                    </div>
                    <div className="px-4 py-3.5 text-sm font-semibold" style={{ color: '#1D2129' }}>项目地址</div>
                    <div className="px-4 py-3.5 text-sm font-semibold" style={{ color: '#1D2129' }}>合作单位</div>
                    <div 
                      className="px-4 py-3.5 text-sm font-semibold text-right cursor-pointer transition-colors flex items-center justify-end gap-1"
                      style={{ color: '#1D2129' }}
                      onClick={() => handleSort('contract_amount')}
                    >
                      合同额
                      {getSortIcon('contract_amount')}
                    </div>
                    <div className="px-4 py-3.5 text-sm font-semibold text-center" style={{ color: '#1D2129' }}>建筑面积</div>
                    <div 
                      className="px-4 py-3.5 text-sm font-semibold text-center cursor-pointer transition-colors flex items-center justify-center gap-1"
                      style={{ color: '#1D2129' }}
                      onClick={() => handleSort('year')}
                    >
                      年度
                      {getSortIcon('year')}
                    </div>
                    <div 
                      className="px-4 py-3.5 text-sm font-semibold text-center cursor-pointer transition-colors flex items-center justify-center gap-1"
                      style={{ color: '#1D2129' }}
                      onClick={() => handleSort('status')}
                    >
                      状态
                      {getSortIcon('status')}
                    </div>
                    <div className="px-4 py-3.5 text-sm font-semibold text-center" style={{ color: '#1D2129' }}>
                      <div className="flex items-center justify-center gap-1">
                        <Users className="w-4 h-4" style={{ color: '#165DFF' }} />
                        人数
                      </div>
                    </div>
                    <div className="px-4 py-3.5 text-sm font-semibold text-center" style={{ color: '#1D2129' }}>进度</div>
                    <div className="px-4 py-3.5 text-sm font-semibold text-right" style={{ color: '#1D2129' }}>操作</div>
                  </div>

                  {/* 表格内容 */}
                  <div className="divide-y" style={{ borderColor: '#E5E6EB' }}>
                    {filteredAndSortedProjects.map((project, index) => {
                      const projectIcon = getProjectIcon(project.name, project.icon);
                      const IconComponent = projectIcon.icon;
                      const progress = project.progress ?? 0;
                      const statusStyle = getStatusStyle(project.status);
                      const inService = project.inServiceCount || 0;
                      const left = project.leftCount || 0;
                      
                      return (
                        <div 
                          key={project.id} 
                          className="grid items-center transition-colors hover:bg-[#F0F5FF]"
                          style={{ 
                            gridTemplateColumns: '200px 160px 140px 120px 90px 100px 90px 96px 120px 140px',
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
                          
                          {/* 项目地址 */}
                          <div className="px-4 py-3.5 text-sm truncate" style={{ color: '#4E5969' }}>
                            {project.address || '-'}
                          </div>
                          
                          {/* 合作单位 */}
                          <div className="px-4 py-3.5 text-sm truncate" style={{ color: '#4E5969' }}>
                            {project.partner || '-'}
                          </div>
                          
                          {/* 合同额 */}
                          <div className="px-4 py-3.5 text-right">
                            <span className="font-bold" style={{ color: '#165DFF' }}>{formatCurrency(project.contract_amount)}</span>
                          </div>
                          
                          {/* 建筑面积 */}
                          <div className="px-4 py-3.5 text-center text-sm" style={{ color: '#4E5969' }}>
                            {project.building_area ? `${Number(project.building_area).toLocaleString('zh-CN')}㎡` : '-'}
                          </div>
                          
                          {/* 年度 */}
                          <div className="px-4 py-3.5 text-center text-sm" style={{ color: '#1D2129' }}>
                            {project.year}
                          </div>
                          
                          {/* 状态 */}
                          <div className="px-4 py-3.5 text-center">
                            <span 
                              className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                              style={{ 
                                background: statusStyle.bg, 
                                color: statusStyle.color,
                                border: `1px solid ${statusStyle.border}`
                              }}
                            >
                              {project.status}
                            </span>
                          </div>
                          
                          {/* 人数统计 */}
                          <div className="px-4 py-3.5 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium" style={{ background: '#E8FFEA', color: '#00B42A' }}>
                                {inService}
                              </span>
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium" style={{ background: '#FFF7E8', color: '#FF7D00' }}>
                                {left}
                              </span>
                            </div>
                          </div>
                          
                          {/* 进度条 */}
                          <div className="px-4 py-3.5">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 progress-bar">
                                <div 
                                  className={`progress-fill ${getProgressColor(progress)}`}
                                  style={{ width: `${progress}%` }}
                                />
                              </div>
                              <span className="text-xs font-medium w-8 text-right" style={{ color: '#86909C' }}>{progress}%</span>
                            </div>
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
                  </div>
                </div>
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-state-icon">
                  <FolderOpen className="w-8 h-8" style={{ color: '#C9CDD4' }} />
                </div>
                <p className="empty-state-title">暂无项目</p>
                <p className="empty-state-description">点击"新增项目"按钮添加第一个项目</p>
              </div>
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
                <p>确定要删除项目 <strong>"{deleteTarget?.name}"</strong> 吗？此操作不可恢复。</p>
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
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-red-500 hover:bg-red-600">
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
