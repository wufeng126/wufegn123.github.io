'use client';
import { useToast } from '@/hooks/use-toast';

import { useState, useEffect, useMemo } from 'react';
import { useAutoRefresh } from '@/hooks/use-auto-refresh';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LabelList } from 'recharts';
import { Plus, Pencil, Trash2, Search, Upload, Download, Users, UserCheck, Filter, HardHat, X, LogOut, UserPlus, Building2, ChevronDown, ChevronUp, History, Database, ArrowRightLeft } from 'lucide-react';
import { LinkableCell } from '@/components/linkable-cell';
import WorkerImportDialog from '@/components/worker-import-dialog';
import { WorkerDataManageDialog } from '@/components/worker-data-manage-dialog';
import Link from 'next/link';

interface Worker {
  id: number;
  name: string;
  work_type: string | null;
  id_card: string | null;
  phone: string | null;
  bank_card: string | null;
  project_id: number | null;
  project_name?: string;
  status: string;
  left_at: string | null;
  created_at: string;
  // 新增字段
  entry_date?: string | null; // 入职日期
  team_name?: string | null; // 所属班组
  is_blacklist?: boolean; // 黑名单标记
  remark?: string | null; // 备注记录
}

interface Project {
  id: number;
  name: string;
}

export default function WorkerRosterPage() {
  const { toast } = useToast();
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [allWorkers, setAllWorkers] = useState<Worker[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showContent, setShowContent] = useState(false);
  
  const [searchName, setSearchName] = useState('');
  const [filterProject, setFilterProject] = useState('all');
  const [filterWorkType, setFilterWorkType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingWorker, setEditingWorker] = useState<Worker | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    work_type: '',
    id_card: '',
    phone: '',
    bank_card: '',
    project_id: '',
    entry_date: '',
    team_name: '',
    is_blacklist: false,
    remark: '',
  });
  
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [batchEditDialogOpen, setBatchEditDialogOpen] = useState(false);
  const [batchEditField, setBatchEditField] = useState<string>('');
  const [batchEditValue, setBatchEditValue] = useState<string>('');
  const [showProjectStats, setShowProjectStats] = useState(true);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [dataManageDialogOpen, setDataManageDialogOpen] = useState(false);
  const [highlightProjectId, setHighlightProjectId] = useState<number | null>(null);
  const [chartProjectFilter, setChartProjectFilter] = useState<number | 'all'>('all'); // 图表项目筛选
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [transferWorker, setTransferWorker] = useState<Worker | null>(null);
  const [transferProjectId, setTransferProjectId] = useState<string>('');
  const [transferAssignments, setTransferAssignments] = useState<any[]>([]);
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set());

  // 饼图颜色
  const PIE_COLORS = ['#165DFF', '#00B42A', '#FF7D00', '#F53F3F', '#722ED1', '#EB0AA4', '#0FC6C2', '#AD8B00'];

  useEffect(() => {
    fetchWorkers();
  }, [filterProject]);

  useEffect(() => {
    fetchProjects();
  }, []);

  useEffect(() => {
    if (!loading) {
      const timer = setTimeout(() => setShowContent(true), 50);
      return () => clearTimeout(timer);
    }
  }, [loading]);

  const fetchProjects = async () => {
    try {
      const res = await fetch('/api/projects', { credentials: 'include' });
      const data = await res.json();
      setProjects(data.projects || []);
    } catch (error) {
      console.error('获取项目列表失败:', error);
    }
  };

  const fetchWorkers = async (isAutoRefresh = false) => {
    if (isAutoRefresh) {
      try {
        const res = await fetch('/api/workers', { credentials: 'include' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '获取工人列表失败');
        setAllWorkers(data.workers || []);
        setWorkers(data.workers || []);
      } catch (error) {
        console.error('获取工人列表失败:', error);
      }
    } else {
      setLoading(true);
      setShowContent(false);
      try {
        const res = await fetch('/api/workers', { credentials: 'include' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '获取工人列表失败');
        setAllWorkers(data.workers || []);
        setWorkers(data.workers || []);
      } catch (error) {
        console.error('获取工人列表失败:', error);
      } finally {
        setLoading(false);
      }
    }
  };

  useAutoRefresh(() => fetchWorkers(true), { enabled: !importDialogOpen });

  useEffect(() => {
    let filtered = [...allWorkers];
    // 搜索优先：有搜索关键词时，在全部数据中搜索，不受项目/工种/状态筛选影响
    if (searchName.trim()) {
      filtered = filtered.filter(w => 
        w.name.includes(searchName.trim()) || 
        w.work_type?.includes(searchName.trim()) ||
        w.phone?.includes(searchName.trim()) ||
        w.id_card?.includes(searchName.trim())
      );
    } else {
      // 无搜索关键词时，按筛选条件过滤
      if (filterProject === 'unassigned') {
        filtered = filtered.filter(w => !w.project_id);
      } else if (filterProject !== 'all') {
        filtered = filtered.filter(w => w.project_id === parseInt(filterProject));
      }
      if (filterWorkType !== 'all') {
        filtered = filtered.filter(w => w.work_type === filterWorkType);
      }
      if (filterStatus !== 'all') {
        if (filterStatus === 'blacklist') {
          filtered = filtered.filter(w => w.is_blacklist);
        } else {
          filtered = filtered.filter(w => w.status === filterStatus);
        }
      }
    }
    setWorkers(filtered);
  }, [filterProject, filterWorkType, filterStatus, searchName, allWorkers]);

  // 按项目分组工人（用于折叠展示）
  const groupedWorkers = useMemo(() => {
    const grouped: Record<string, Worker[]> = {};
    workers.forEach(w => {
      const key = w.project_id ? String(w.project_id) : '__unassigned__';
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(w);
    });
    // 排序：有项目的按项目名排，未分配的放最后
    const sortedKeys = Object.keys(grouped).sort((a, b) => {
      if (a === '__unassigned__') return 1;
      if (b === '__unassigned__') return -1;
      const nameA = grouped[a][0]?.project_name || getProjectName(grouped[a][0]?.project_id) || '';
      const nameB = grouped[b][0]?.project_name || getProjectName(grouped[b][0]?.project_id) || '';
      return nameA.localeCompare(nameB);
    });
    const result: { key: string; projectName: string; projectId: number | null; workers: Worker[] }[] = [];
    sortedKeys.forEach(key => {
      const ws = grouped[key];
      const projectName = key === '__unassigned__' ? '未分配项目' : (ws[0]?.project_name || getProjectName(ws[0]?.project_id) || '未知项目');
      const projectId = key === '__unassigned__' ? null : ws[0]?.project_id || null;
      result.push({ key, projectName, projectId, workers: ws });
    });
    return result;
  }, [workers, projects]);

  const workTypes = [...new Set(allWorkers.map(w => w.work_type).filter(Boolean))] as string[];

  const stats = {
    total: allWorkers.length,
    filtered: workers.length,
    inService: allWorkers.filter(w => w.status === 'in_service' || !w.status).length,
    left: allWorkers.filter(w => w.status === 'left').length,
    archived: allWorkers.filter(w => w.status === 'archived').length,
    blacklist: allWorkers.filter(w => w.is_blacklist).length,
    filteredInService: workers.filter(w => w.status === 'in_service' || !w.status).length,
    filteredLeft: workers.filter(w => w.status === 'left').length,
  };

  // 按项目-工种统计（柱状图数据）
  const projectWorkTypeData = useMemo(() => {
    const dataMap: Record<number, { projectName: string; [key: string]: number | string }> = {};
    
    // 获取所有工种
    const allWorkTypes = [...new Set(allWorkers.map(w => w.work_type).filter(Boolean))] as string[];
    
    // 初始化每个项目
    projects.forEach(p => {
      const entry: { projectName: string; [key: string]: number | string } = { projectName: p.name };
      allWorkTypes.forEach(wt => {
        entry[wt] = 0;
      });
      dataMap[p.id] = entry;
    });
    
    // 统计
    allWorkers.forEach(w => {
      if (w.project_id && w.work_type && dataMap[w.project_id]) {
        const entry = dataMap[w.project_id];
        const current = entry[w.work_type];
        if (typeof current === 'number') {
          entry[w.work_type] = current + 1;
        }
      }
    });
    
    // 转换为数组，只保留有数据的项目
    const result: Array<{ projectId: number; projectName: string; [key: string]: number | string }> = [];
    Object.entries(dataMap).forEach(([projectId, data]) => {
      const total = Object.entries(data)
        .filter(([k]) => k !== 'projectName')
        .reduce((sum, [_, v]) => sum + (typeof v === 'number' ? v : 0), 0);
      if (total > 0) {
        result.push({
          projectId: parseInt(projectId),
          ...data,
        });
      }
    });
    
    return result;
  }, [allWorkers, projects]);

  // 柱状图数据：按工种显示人数（X轴工种，Y轴人数）
  const workTypeBarData = useMemo(() => {
    const distMap: Record<string, number> = {};
    const workersForChart = chartProjectFilter === 'all' 
      ? allWorkers 
      : allWorkers.filter(w => w.project_id === chartProjectFilter);
    
    workersForChart.forEach(w => {
      if (w.work_type) {
        distMap[w.work_type] = (distMap[w.work_type] || 0) + 1;
      }
    });
    return Object.entries(distMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [allWorkers, chartProjectFilter]);

  // 饼图数据：根据项目筛选
  const workTypeDistribution = useMemo(() => {
    const distMap: Record<string, number> = {};
    const workersForChart = chartProjectFilter === 'all' 
      ? allWorkers 
      : allWorkers.filter(w => w.project_id === chartProjectFilter);
    
    workersForChart.forEach(w => {
      if (w.work_type) {
        distMap[w.work_type] = (distMap[w.work_type] || 0) + 1;
      }
    });
    return Object.entries(distMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [allWorkers, chartProjectFilter]);

  // 柱状图标题
  const chartTitle = chartProjectFilter === 'all' ? '工种人数统计' : 
    (projects.find(p => p.id === chartProjectFilter)?.name || '工种人数统计');

  // 按项目统计人数
  const projectStats = useMemo(() => {
    const statsMap: Record<number, { 
      projectId: number; 
      projectName: string; 
      inService: number; 
      left: number; 
      total: number;
    }> = {};

    // 初始化所有项目
    projects.forEach(p => {
      statsMap[p.id] = {
        projectId: p.id,
        projectName: p.name,
        inService: 0,
        left: 0,
        total: 0,
      };
    });

    // 统计无项目的工人
    statsMap[0] = {
      projectId: 0,
      projectName: '未分配项目',
      inService: 0,
      left: 0,
      total: 0,
    };

    // 遍历工人统计
    allWorkers.forEach(w => {
      const pid = w.project_id || 0;
      if (!statsMap[pid]) {
        statsMap[pid] = {
          projectId: pid,
          projectName: w.project_name || '未知项目',
          inService: 0,
          left: 0,
          total: 0,
        };
      }
      statsMap[pid].total++;
      if (w.status === 'left') {
        statsMap[pid].left++;
      } else {
        statsMap[pid].inService++;
      }
    });

    // 转换为数组并排序（有工人的项目在前，按总人数降序）
    return Object.values(statsMap)
      .filter(s => s.total > 0)
      .sort((a, b) => b.total - a.total);
  }, [allWorkers, projects]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const url = editingWorker ? `/api/workers/${editingWorker.id}` : '/api/workers';
      const method = editingWorker ? 'PUT' : 'POST';
      const submitData = {
        ...formData,
        project_id: formData.project_id ? parseInt(formData.project_id) : null,
        entry_date: formData.entry_date || null,
        team_name: formData.team_name || null,
        is_blacklist: formData.is_blacklist,
        remark: formData.remark || null,
      };
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(submitData),
      });
      if (res.ok) {
        setDialogOpen(false);
        setEditingWorker(null);
        setFormData({ name: '', work_type: '', id_card: '', phone: '', bank_card: '', project_id: '', entry_date: '', team_name: '', is_blacklist: false, remark: '' });
        fetchWorkers();
      } else {
        const error = await res.json();
        toast({ title: error.error || '操作失败', variant: 'error' });
      }
    } catch (error) {
      console.error('保存失败:', error);
      toast({ title: '保存失败', variant: 'error' });
    }
  };

  const handleEdit = (worker: Worker) => {
    setEditingWorker(worker);
    setFormData({
      name: worker.name,
      work_type: worker.work_type || '',
      id_card: worker.id_card || '',
      phone: worker.phone || '',
      bank_card: worker.bank_card || '',
      project_id: worker.project_id ? worker.project_id.toString() : '',
      entry_date: worker.entry_date ? worker.entry_date.split('T')[0] : '',
      team_name: worker.team_name || '',
      is_blacklist: worker.is_blacklist || false,
      remark: worker.remark || '',
    });
    setDialogOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除此工人吗？相关的工资记录也会被删除！')) return;
    try {
      const res = await fetch(`/api/workers/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchWorkers();
        setSelectedIds(prev => {
          const newSet = new Set(prev);
          newSet.delete(id);
          return newSet;
        });
      }
    } catch (error) {
      toast({ title: '删除失败', variant: 'error' });
    }
  };

  const handleToggleStatus = async (worker: Worker) => {
    const newStatus = worker.status === 'left' ? 'in_service' : 'left';
    const actionText = newStatus === 'left' ? '退场' : '返场';
    if (!confirm(`确定要${actionText}此工人吗？`)) return;
    
    try {
      const res = await fetch(`/api/workers/${worker.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        fetchWorkers();
      } else {
        const error = await res.json();
        toast({ title: error.error || `${actionText}失败` });
      }
    } catch (error) {
      toast({ title: `${actionText}失败` });
    }
  };

  const openAddDialog = () => {
    setEditingWorker(null);
    setFormData({ name: '', work_type: '', id_card: '', phone: '', bank_card: '', project_id: '', entry_date: '', team_name: '', is_blacklist: false, remark: '' });
    setDialogOpen(true);
  };

  const getProjectName = (projectId: number | null) => {
    if (!projectId) return '-';
    const project = projects.find(p => p.id === projectId);
    return project?.name || '-';
  };

  const handleSelectAll = () => {
    if (selectedIds.size === workers.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(workers.map(w => w.id)));
    }
  };

  const handleSelectOne = (id: number) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      return newSet;
    });
  };

  const handleBatchLeave = async () => {
    if (selectedIds.size === 0) return toast({ title: '请先选择要退场的工人', variant: 'error' });
    if (!confirm(`确定要将选中的 ${selectedIds.size} 个工人标记为退场吗？`)) return;
    try {
      const res = await fetch('/api/workers/batch-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ids: Array.from(selectedIds), field: 'status', value: 'left' }),
      });
      if (res.ok) {
        setSelectedIds(new Set());
        fetchWorkers();
      } else {
        const error = await res.json();
        toast({ title: error.error || '批量退场失败', variant: 'error' });
      }
    } catch (error) {
      toast({ title: '批量退场失败', variant: 'error' });
    }
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return toast({ title: '请先选择要删除的工人', variant: 'error' });
    if (!confirm(`确定要删除选中的 ${selectedIds.size} 个工人吗？`)) return;
    try {
      const res = await fetch('/api/workers/batch-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      if (res.ok) {
        setSelectedIds(new Set());
        fetchWorkers();
      }
    } catch (error) {
      toast({ title: '批量删除失败', variant: 'error' });
    }
  };

  const handleOpenTransfer = async (worker: Worker) => {
    setTransferWorker(worker);
    setTransferProjectId('');
    setTransferDialogOpen(true);
    // Load existing assignments
    try {
      const res = await fetch(`/api/worker-assignments?worker_id=${worker.id}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setTransferAssignments(data.assignments || []);
      }
    } catch { /* ignore */ }
  };

  const handleTransfer = async () => {
    if (!transferWorker || !transferProjectId) return toast({ title: '请选择目标项目' });
    try {
      const res = await fetch('/api/worker-assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          worker_id: transferWorker.id,
          project_id: parseInt(transferProjectId),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast({ title: '调动成功', description: data.message });
        setTransferDialogOpen(false);
        fetchWorkers();
      } else {
        toast({ title: '调动失败', description: data.error, variant: 'error' });
      }
    } catch {
      toast({ title: '调动失败', description: '网络错误', variant: 'error' });
    }
  };

  const handleLeaveAssignment = async (assignmentId: number) => {
    if (!confirm('确定要退场该项目吗？')) return;
    try {
      const res = await fetch(`/api/worker-assignments?id=${assignmentId}`, { method: 'DELETE', credentials: 'include' });
      if (res.ok) {
        toast({ title: '退场成功' });
        // Refresh assignments
        if (transferWorker) {
          const res2 = await fetch(`/api/worker-assignments?worker_id=${transferWorker.id}`, { credentials: 'include' });
          if (res2.ok) {
            const data = await res2.json();
            setTransferAssignments(data.assignments || []);
          }
        }
        fetchWorkers();
      }
    } catch { /* ignore */ }
  };

  const openBatchEditDialog = () => {
    if (selectedIds.size === 0) return toast({ title: '请先选择要修改的工人', variant: 'error' });
    setBatchEditField('');
    setBatchEditValue('');
    setBatchEditDialogOpen(true);
  };

  const handleBatchEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!batchEditField) return toast({ title: '请选择要修改的字段' });
    try {
      const res = await fetch('/api/workers/batch-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ids: Array.from(selectedIds), field: batchEditField, value: batchEditValue || null }),
      });
      if (res.ok) {
        setBatchEditDialogOpen(false);
        setSelectedIds(new Set());
        fetchWorkers();
      }
    } catch (error) {
      toast({ title: '批量修改失败', variant: 'error' });
    }
  };

  const handleExport = () => {
    const headers = ['姓名', '工种', '身份证号', '联系方式', '银行卡号', '入职日期', '所属项目', '状态', '黑名单', '备注'];
    const rows = workers.map(w => [
      w.name, 
      w.work_type || '', 
      w.id_card || '', 
      w.phone || '', 
      w.bank_card || '', 
      w.entry_date ? w.entry_date.split('T')[0] : '',
      getProjectName(w.project_id),
      w.is_blacklist ? '黑名单' : w.status === 'left' ? '退场' : w.status === 'archived' ? '已归档' : '在场',
      w.is_blacklist ? '是' : '否',
      w.remark || ''
    ]);
    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `花名册_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const downloadTemplate = () => {
    const projectNames = projects.map(p => p.name).join('、');
    const template = `姓名,工种,身份证号,联系方式,银行卡号,入职日期,所属项目,备注
张三,木工,320102199001011234,13800138000,6222021234567890123,2026-01-15,${projects[0]?.name || '项目名称'},无
李四,钢筋工,320102199002022345,13900139000,6222021234567890124,2026-02-20,${projects[0]?.name || '项目名称'},优秀员工`;
    const blob = new Blob(['\ufeff' + template], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = '花名册导入模板.csv';
    link.click();
  };

  return (
    <div className="space-y-5">
      {/* 页面标题 */}
      <div className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 transition-all duration-500 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
        <div>
          <h1 className="text-xl font-semibold tracking-tight" style={{ color: '#1D2129' }}>花名册</h1>
          <p className="text-sm mt-1" style={{ color: '#86909C' }}>工人基本信息管理</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={downloadTemplate} className="btn-secondary h-9">
            <Download className="w-4 h-4 mr-1.5" />下载模板
          </Button>
          <Button variant="outline" onClick={() => setImportDialogOpen(true)} className="btn-secondary h-9 cursor-pointer">
            <Upload className="w-4 h-4 mr-1.5" />批量导入<span className="text-xs text-muted-foreground ml-1">(CSV/XLSX)</span>
          </Button>
          <Button variant="outline" onClick={handleExport} className="btn-secondary h-9">
            <Download className="w-4 h-4 mr-1.5" />导出
          </Button>
          <Link href="/workers/import-history">
            <Button variant="outline" className="btn-secondary h-9">
              <History className="w-4 h-4 mr-1.5" />导入历史
            </Button>
          </Link>
          <Button 
            variant="outline" 
            onClick={() => setDataManageDialogOpen(true)} 
            className="btn-secondary h-9"
          >
            <Database className="w-4 h-4 mr-1.5" />数据管理
          </Button>
        </div>
      </div>

      {/* 新增/编辑对话框 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogTrigger asChild>
          <Button onClick={openAddDialog} className="btn-primary h-9">
            <Plus className="w-4 h-4 mr-1.5" />新增工人
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="dialog-header">{editingWorker ? '编辑工人' : '新增工人'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label className="text-sm" style={{ color: '#1D2129' }}>姓名 *</Label><Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="mt-1.5" required /></div>
              <div><Label className="text-sm" style={{ color: '#1D2129' }}>工种</Label><Input value={formData.work_type} onChange={(e) => setFormData({ ...formData, work_type: e.target.value })} placeholder="如：木工、钢筋工" className="mt-1.5" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label className="text-sm" style={{ color: '#1D2129' }}>身份证号</Label><Input value={formData.id_card} onChange={(e) => setFormData({ ...formData, id_card: e.target.value })} maxLength={18} className="mt-1.5" /></div>
              <div><Label className="text-sm" style={{ color: '#1D2129' }}>联系方式</Label><Input value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} className="mt-1.5" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label className="text-sm" style={{ color: '#1D2129' }}>银行卡号</Label><Input value={formData.bank_card} onChange={(e) => setFormData({ ...formData, bank_card: e.target.value })} className="mt-1.5" /></div>
              <div><Label className="text-sm" style={{ color: '#1D2129' }}>入职日期</Label><Input type="date" value={formData.entry_date} onChange={(e) => setFormData({ ...formData, entry_date: e.target.value })} className="mt-1.5" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label className="text-sm" style={{ color: '#1D2129' }}>所属项目</Label>
                <Select value={formData.project_id} onValueChange={(value) => setFormData({ ...formData, project_id: value })}>
                  <SelectTrigger className="mt-1.5"><SelectValue placeholder="选择项目" /></SelectTrigger>
                  <SelectContent>{projects.map((p) => (<SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>))}</SelectContent>
                </Select>
              </div>
              <div><Label className="text-sm" style={{ color: '#1D2129' }}>所属班组</Label><Input value={formData.team_name} onChange={(e) => setFormData({ ...formData, team_name: e.target.value })} placeholder="如：木工班、钢筋班" className="mt-1.5" /></div>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox 
                id="is_blacklist" 
                checked={formData.is_blacklist}
                onCheckedChange={(checked) => setFormData({ ...formData, is_blacklist: checked as boolean })}
              />
              <Label htmlFor="is_blacklist" className="text-sm cursor-pointer" style={{ color: formData.is_blacklist ? '#F53F3F' : '#1D2129' }}>
                加入黑名单
              </Label>
            </div>
            <div><Label className="text-sm" style={{ color: '#1D2129' }}>备注</Label><Input value={formData.remark} onChange={(e) => setFormData({ ...formData, remark: e.target.value })} placeholder="记录重要信息" className="mt-1.5" /></div>
            <div className="flex justify-end gap-3 pt-3 border-t" style={{ borderColor: '#E5E6EB' }}>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="border-gray-300">取消</Button>
              <Button type="submit" className="btn-primary">{editingWorker ? '保存' : '新增'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* 统计卡片 */}
      <div className={`grid grid-cols-1 md:grid-cols-3 gap-4 transition-all duration-500 delay-100 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
        {loading && !workers.length ? (
          <>
            <Skeleton className="h-20 rounded-xl" />
            <Skeleton className="h-20 rounded-xl" />
            <Skeleton className="h-20 rounded-xl" />
          </>
        ) : (
        <>
        <Card className="stat-card stat-card-blue">
          <CardContent className="pt-5 pb-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm" style={{ color: '#86909C' }}>在册工人总数</p>
                <p className="text-3xl font-bold mt-2 stat-number-blue">{stats.inService}</p>
                {stats.left > 0 && <p className="text-xs mt-1" style={{ color: '#C9CDD4' }}>已退场: {stats.left} 人</p>}
              </div>
              <div className="stat-icon-container stat-icon-blue">
                <Users className="w-5 h-5 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="stat-card stat-card-green">
          <CardContent className="pt-5 pb-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm" style={{ color: '#86909C' }}>在场人数</p>
                <p className="text-3xl font-bold mt-2 stat-number-green">{stats.filteredInService}</p>
                <p className="text-xs mt-1" style={{ color: '#C9CDD4' }}>当前在场工人</p>
              </div>
              <div className="stat-icon-container stat-icon-green">
                <UserCheck className="w-5 h-5 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="stat-card stat-card-orange">
          <CardContent className="pt-5 pb-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm" style={{ color: '#86909C' }}>退场人数</p>
                <p className="text-3xl font-bold mt-2 stat-number-orange">{stats.filteredLeft}</p>
                <p className="text-xs mt-1" style={{ color: '#C9CDD4' }}>已退场工人</p>
              </div>
              <div className="stat-icon-container stat-icon-orange">
                <LogOut className="w-5 h-5 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
        </>
        )}
      </div>

      {/* 图表区域 */}
      {(workTypeBarData.length > 0 || workTypeDistribution.length > 0) && (
        <div className={`grid grid-cols-1 lg:grid-cols-2 gap-4 transition-all duration-500 delay-100 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
          {/* 柱状图：按工种显示人数 */}
          {workTypeBarData.length > 0 && (
            <Card style={{ border: '1px solid #E5E6EB' }}>
              <CardContent className="pt-4 pb-2">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4" style={{ color: '#165DFF' }} />
                    <span className="font-semibold" style={{ color: '#1D2129' }}>{chartTitle}</span>
                  </div>
                  <Select value={String(chartProjectFilter)} onValueChange={(v) => setChartProjectFilter(v === 'all' ? 'all' : parseInt(v))}>
                    <SelectTrigger className="w-36 h-8 text-xs">
                      <SelectValue placeholder="选择项目" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部项目</SelectItem>
                      {projects.map(p => (
                        <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={workTypeBarData} margin={{ top: 15, right: 5, left: -15, bottom: 5 }}>
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#86909C' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#86909C' }} allowDecimals={false} />
                    <Tooltip 
                      contentStyle={{ border: '1px solid #E5E6EB', borderRadius: '8px', fontSize: 12 }}
                      formatter={(value: number) => [`${value}人`, '人数']}
                    />
                    <Bar dataKey="value" fill="#165DFF" radius={[4, 4, 0, 0]}>
                      {workTypeBarData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Bar>
                    <LabelList dataKey="value" position="top" style={{ fontSize: 11, fill: '#1D2129', fontWeight: 500 }} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* 饼图：工种占比 */}
          {workTypeDistribution.length > 0 && (
            <Card style={{ border: '1px solid #E5E6EB' }}>
              <CardContent className="pt-4 pb-2">
                <div className="flex items-center gap-2 mb-4">
                  <HardHat className="w-4 h-4" style={{ color: '#165DFF' }} />
                  <span className="font-semibold" style={{ color: '#1D2129' }}>工种人数占比</span>
                  {chartProjectFilter !== 'all' && (
                    <span className="text-xs px-2 py-0.5 rounded" style={{ background: '#E8F3FF', color: '#165DFF' }}>
                      {projects.find(p => p.id === chartProjectFilter)?.name}
                    </span>
                  )}
                </div>
                <div className="flex items-center">
                  <ResponsiveContainer width="55%" height={200}>
                    <PieChart>
                      <Pie
                        data={workTypeDistribution}
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={75}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {workTypeDistribution.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ border: '1px solid #E5E6EB', borderRadius: '8px', fontSize: 12 }}
                        formatter={(value: number, name: string) => {
                          const total = workTypeDistribution.reduce((sum, item) => sum + item.value, 0);
                          return [`${value}人 (${((value / total) * 100).toFixed(1)}%)`, name];
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex-1 space-y-1.5 max-h-[200px] overflow-y-auto pr-2">
                    {workTypeDistribution.map((item, index) => (
                      <div key={item.name} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full" style={{ background: PIE_COLORS[index % PIE_COLORS.length] }} />
                          <span style={{ color: '#4E5969' }}>{item.name}</span>
                        </div>
                        <span className="font-medium" style={{ color: '#1D2129' }}>{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* 项目人数统计 */}
      {projectStats.length > 0 && (
        <div className={`transition-all duration-500 delay-100 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
          <Card style={{ border: '1px solid #E5E6EB' }}>
            <div 
              className="flex items-center justify-between px-5 py-3.5 cursor-pointer hover:bg-gray-50"
              onClick={() => setShowProjectStats(!showProjectStats)}
            >
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4" style={{ color: '#165DFF' }} />
                <span className="font-semibold" style={{ color: '#1D2129' }}>项目人数统计</span>
                <span className="text-sm" style={{ color: '#86909C' }}>（{projectStats.length} 个项目）</span>
              </div>
              {showProjectStats ? <ChevronUp className="w-4 h-4" style={{ color: '#86909C' }} /> : <ChevronDown className="w-4 h-4" style={{ color: '#86909C' }} />}
            </div>
            {showProjectStats && (
              <div className="border-t" style={{ borderColor: '#E5E6EB' }}>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr style={{ background: '#F7F8FA' }}>
                        <th className="text-left px-5 py-3 text-sm font-semibold" style={{ color: '#1D2129' }}>项目名称</th>
                        <th className="text-center px-5 py-3 text-sm font-semibold" style={{ color: '#1D2129' }}>在场人数</th>
                        <th className="text-center px-5 py-3 text-sm font-semibold" style={{ color: '#1D2129' }}>退场人数</th>
                        <th className="text-center px-5 py-3 text-sm font-semibold" style={{ color: '#1D2129' }}>总人数</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y" style={{ borderColor: '#E5E6EB' }}>
                      {projectStats.map((proj, index) => {
                        const isHighlighted = highlightProjectId === proj.projectId;
                        return (
                          <tr 
                            key={proj.projectId} 
                            className="hover:bg-gray-50 cursor-pointer transition-colors"
                            style={{ 
                              background: isHighlighted ? '#E8F3FF' : index % 2 === 1 ? '#FAFBFD' : 'transparent',
                              borderLeft: isHighlighted ? '3px solid #165DFF' : '3px solid transparent'
                            }}
                            onClick={() => {
                              const newProjectId = proj.projectId === 0 ? 'all' : proj.projectId.toString();
                              setFilterProject(newProjectId);
                              setHighlightProjectId(proj.projectId === 0 ? null : proj.projectId);
                            }}
                          >
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-2">
                                <div 
                                  className="w-2 h-2 rounded-full"
                                  style={{ background: proj.projectId === 0 ? '#86909C' : '#165DFF' }}
                                />
                                <span className="font-medium" style={{ color: '#1D2129' }}>
                                  {proj.projectName}
                                </span>
                                {isHighlighted && <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: '#165DFF', color: '#fff' }}>已筛选</span>}
                              </div>
                            </td>
                            <td className="px-5 py-3 text-center">
                              <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-sm font-medium" 
                                style={{ background: '#E8FFEA', color: '#00B42A' }}>
                                {proj.inService}
                              </span>
                            </td>
                            <td className="px-5 py-3 text-center">
                              <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-sm font-medium" 
                                style={{ background: '#FFF7E8', color: '#FF7D00' }}>
                                {proj.left}
                              </span>
                            </td>
                            <td className="px-5 py-3 text-center">
                              <span className="font-medium" style={{ color: '#1D2129' }}>{proj.total}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="px-5 py-2.5 border-t text-xs" style={{ borderColor: '#E5E6EB', color: '#86909C' }}>
                  提示：点击项目行可筛选该项目工人
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* 筛选栏 */}
      <div className={`transition-all duration-500 delay-150 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
        <div className="filter-bar flex-wrap gap-2">
          <Filter className="w-4 h-4 flex-shrink-0" style={{ color: '#86909C' }} />
          <div className="relative flex-shrink-0">
            <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2" style={{ color: '#C9CDD4' }} />
            <Input placeholder="搜索姓名或工种" value={searchName} onChange={(e) => setSearchName(e.target.value)} className="w-40 pl-9 h-8" />
          </div>
          <Select value={filterProject} onValueChange={setFilterProject}>
            <SelectTrigger className="w-32 h-8"><SelectValue placeholder="所属项目" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部项目</SelectItem>
              <SelectItem value="unassigned">未分配项目</SelectItem>
              {projects.map((p) => (<SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>))}
            </SelectContent>
          </Select>
          <Select value={filterWorkType} onValueChange={setFilterWorkType}>
            <SelectTrigger className="w-28 h-8"><SelectValue placeholder="工种" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部工种</SelectItem>
              {workTypes.map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-24 h-8"><SelectValue placeholder="状态" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              <SelectItem value="in_service">在场</SelectItem>
              <SelectItem value="left">退场</SelectItem>
              <SelectItem value="archived">已归档</SelectItem>
              <SelectItem value="blacklist">黑名单</SelectItem>
            </SelectContent>
          </Select>
          {/* 快速切换按钮 */}
          <div className="flex gap-1 ml-auto">
            <Button 
              variant={filterStatus === 'in_service' ? 'default' : 'outline'} 
              size="sm" 
              onClick={() => setFilterStatus(filterStatus === 'in_service' ? 'all' : 'in_service')} 
              className="h-8 px-2 text-xs"
            >
              <UserCheck className="w-3 h-3 mr-1" />在场
            </Button>
            <Button 
              variant={filterStatus === 'left' ? 'default' : 'outline'} 
              size="sm" 
              onClick={() => setFilterStatus(filterStatus === 'left' ? 'all' : 'left')} 
              className="h-8 px-2 text-xs"
            >
              <LogOut className="w-3 h-3 mr-1" />退场
            </Button>
          </div>
          {(searchName || filterProject !== 'all' || filterWorkType !== 'all' || filterStatus !== 'all') && (
            <Button variant="ghost" size="sm" onClick={() => { setSearchName(''); setFilterProject('all'); setFilterWorkType('all'); setFilterStatus('all'); }} className="h-8" style={{ color: '#86909C' }}>
              <X className="w-4 h-4 mr-1" />重置
            </Button>
          )}
          <div className="flex gap-2 items-center border-l pl-3 ml-2" style={{ borderColor: '#E5E6EB' }}>
            {selectedIds.size > 0 && (
              <span className="text-sm" style={{ color: '#86909C' }}>已选 {selectedIds.size} 项</span>
            )}
            <Button variant="outline" size="sm" onClick={openBatchEditDialog} disabled={selectedIds.size === 0} className="h-8"><Pencil className="w-4 h-4 mr-1" />批量修改</Button>
            <Button variant="outline" size="sm" onClick={handleBatchLeave} disabled={selectedIds.size === 0} className="h-8 text-orange-600 border-orange-300 hover:bg-orange-50"><LogOut className="w-4 h-4 mr-1" />批量退场</Button>
            <Button variant="destructive" size="sm" onClick={handleBatchDelete} disabled={selectedIds.size === 0} className="h-8"><Trash2 className="w-4 h-4 mr-1" />批量删除</Button>
          </div>
        </div>
      </div>

      {/* 工人列表 - 按项目折叠 */}
      <div className={`transition-all duration-500 delay-200 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
        <Card className="overflow-hidden border" style={{ borderColor: '#E5E6EB' }}>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <div className="loading-spinner" />
              </div>
            ) : workers.length > 0 ? (
              <div className="space-y-0">
                {groupedWorkers.map((group) => {
                  const isCollapsed = collapsedProjects.has(group.key);
                  const allSelected = group.workers.every(w => selectedIds.has(w.id));
                  const inServiceCount = group.workers.filter(w => w.status === 'in_service' || !w.status).length;
                  const leftCount = group.workers.filter(w => w.status === 'left').length;
                  const globalStartIndex = workers.indexOf(group.workers[0]);

                  return (
                    <div key={group.key} className="border-b last:border-b-0" style={{ borderColor: '#E5E6EB' }}>
                      {/* 项目标题行 - 可折叠 */}
                      <div
                        className="flex items-center justify-between px-5 py-2.5 cursor-pointer hover:bg-gray-50 transition-colors"
                        style={{ background: '#F7F8FA' }}
                        onClick={() => {
                          const newCollapsed = new Set(collapsedProjects);
                          if (isCollapsed) {
                            newCollapsed.delete(group.key);
                          } else {
                            newCollapsed.add(group.key);
                          }
                          setCollapsedProjects(newCollapsed);
                        }}
                      >
                        <div className="flex items-center gap-3">
                          <span className={`transition-transform text-gray-400 text-xs ${isCollapsed ? '' : 'rotate-180'}`}>▼</span>
                          <Checkbox
                            checked={allSelected}
                            onCheckedChange={() => {
                              const newSelected = new Set(selectedIds);
                              if (allSelected) {
                                group.workers.forEach(w => newSelected.delete(w.id));
                              } else {
                                group.workers.forEach(w => newSelected.add(w.id));
                              }
                              setSelectedIds(newSelected);
                            }}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <Building2 className="w-4 h-4" style={{ color: group.key === '__unassigned__' ? '#86909C' : '#165DFF' }} />
                          <span className="font-medium" style={{ color: '#1D2129' }}>{group.projectName}</span>
                          <span className="text-sm" style={{ color: '#86909C' }}>({group.workers.length}人)</span>
                        </div>
                        <div className="flex items-center gap-4 text-sm">
                          <span style={{ color: '#86909C' }}>在场: <span className="font-medium" style={{ color: '#00B42A' }}>{inServiceCount}</span></span>
                          <span style={{ color: '#86909C' }}>退场: <span className="font-medium" style={{ color: '#FF7D00' }}>{leftCount}</span></span>
                        </div>
                      </div>
                      {/* 项目内明细表格 */}
                      {!isCollapsed && (
                        <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                          <Table className="zebra-table">
                            <TableHeader className="sticky top-0 z-10" style={{ background: '#FAFBFD' }}>
                              <TableRow style={{ background: '#FAFBFD', borderBottom: '1px solid #E5E6EB' }}>
                                <TableHead className="w-12"></TableHead>
                                <TableHead className="w-12" style={{ color: '#86909C' }}>序号</TableHead>
                                <TableHead style={{ color: '#1D2129' }}>姓名</TableHead>
                                <TableHead style={{ color: '#1D2129' }}>工种</TableHead>
                                <TableHead style={{ color: '#1D2129' }}>身份证号</TableHead>
                                <TableHead style={{ color: '#1D2129' }}>联系方式</TableHead>
                                <TableHead style={{ color: '#1D2129' }}>入职日期</TableHead>
                                <TableHead className="w-20" style={{ color: '#1D2129' }}>状态</TableHead>
                                <TableHead className="text-right" style={{ color: '#1D2129' }}>操作</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {group.workers.map((worker, idx) => (
                                <TableRow key={worker.id} style={{ background: selectedIds.has(worker.id) ? '#E8F3FF' : idx % 2 === 1 ? '#FAFBFD' : 'transparent', borderBottom: '1px solid #E5E6EB' }}>
                                  <TableCell><Checkbox checked={selectedIds.has(worker.id)} onCheckedChange={() => handleSelectOne(worker.id)} /></TableCell>
                                  <TableCell style={{ color: '#C9CDD4' }}>{globalStartIndex + idx + 1}</TableCell>
                                  <TableCell className="font-medium" style={{ color: '#1D2129' }}>
                                    <div className="flex items-center gap-1.5">
                                      <LinkableCell href={`/hr-salary?tab=salaries&worker_id=${worker.id}`} className="font-medium text-foreground">
                                        {worker.name}
                                      </LinkableCell>
                                      {worker.is_blacklist && <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-red-100 text-red-600">黑</span>}
                                    </div>
                                  </TableCell>
                                  <TableCell style={{ color: '#4E5969' }}>{worker.work_type || '-'}</TableCell>
                                  <TableCell style={{ color: '#4E5969' }}>{worker.id_card || '-'}</TableCell>
                                  <TableCell style={{ color: '#4E5969' }}>{worker.phone || '-'}</TableCell>
                                  <TableCell style={{ color: '#4E5969' }}>{worker.entry_date ? worker.entry_date.split('T')[0] : '-'}</TableCell>
                                  <TableCell>
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                      worker.is_blacklist ? 'bg-red-100 text-red-600' :
                                      worker.status === 'left' ? 'bg-orange-100 text-orange-700' :
                                      worker.status === 'archived' ? 'bg-gray-100 text-gray-600' :
                                      'bg-green-100 text-green-700'
                                    }`}>
                                      {worker.is_blacklist ? '黑名单' : worker.status === 'left' ? '退场' : worker.status === 'archived' ? '已归档' : '在场'}
                                    </span>
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <div className="flex justify-end gap-1.5">
                                      <Button size="sm" variant="ghost" onClick={() => handleEdit(worker)} className="h-7 px-2" style={{ color: '#165DFF' }}><Pencil className="w-4 h-4" /></Button>
                                      <Button 
                                        size="sm" 
                                        variant="ghost" 
                                        onClick={() => handleToggleStatus(worker)} 
                                        className="h-7 px-2" 
                                        style={{ color: worker.status === 'left' ? '#00B42A' : '#FF7D00' }}
                                        title={worker.status === 'left' ? '返场' : '退场'}
                                      >
                                        {worker.status === 'left' ? <UserPlus className="w-4 h-4" /> : <LogOut className="w-4 h-4" />}
                                      </Button>
                                      <Button size="sm" variant="ghost" onClick={() => handleOpenTransfer(worker)} className="h-7 px-2" style={{ color: '#722ED1' }} title="调动"><Building2 className="w-4 h-4" /></Button>
                                      <Button size="sm" variant="ghost" onClick={() => handleDelete(worker.id)} className="h-7 px-2" style={{ color: '#F53F3F' }}><Trash2 className="w-4 h-4" /></Button>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-state-icon">
                  <Users className="w-8 h-8" style={{ color: '#C9CDD4' }} />
                </div>
                <p className="empty-state-title">暂无工人数据</p>
                <p className="empty-state-description">点击"新增工人"按钮添加</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 批量修改对话框 */}
      <Dialog open={batchEditDialogOpen} onOpenChange={setBatchEditDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle className="dialog-header">批量修改（已选 {selectedIds.size} 项）</DialogTitle></DialogHeader>
          <form onSubmit={handleBatchEdit} className="space-y-4">
            <div><Label className="text-sm" style={{ color: '#1D2129' }}>选择要修改的字段</Label>
              <Select value={batchEditField} onValueChange={setBatchEditField}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="选择字段" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="work_type">工种</SelectItem>
                  <SelectItem value="project_id">所属项目</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {batchEditField === 'work_type' && <div><Label className="text-sm" style={{ color: '#1D2129' }}>工种</Label><Input value={batchEditValue} onChange={(e) => setBatchEditValue(e.target.value)} className="mt-1.5" /></div>}
            {batchEditField === 'project_id' && <div><Label className="text-sm" style={{ color: '#1D2129' }}>所属项目</Label>
              <Select value={batchEditValue} onValueChange={setBatchEditValue}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="选择项目" /></SelectTrigger>
                <SelectContent>{projects.map((p) => (<SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>))}</SelectContent>
              </Select>
            </div>}
            <div className="flex justify-end gap-3 pt-3 border-t" style={{ borderColor: '#E5E6EB' }}>
              <Button type="button" variant="outline" onClick={() => setBatchEditDialogOpen(false)} className="border-gray-300">取消</Button>
              <Button type="submit" disabled={!batchEditField} className="btn-primary">确认修改</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* 批量导入对话框 — key 保证 React 不会因 fiber reconciliation 销毁重建组件实例 */}
      <WorkerImportDialog
        key="worker-import-dialog-instance"
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        projects={projects}
        defaultProjectId={filterProject !== 'all' ? filterProject : ''}
        onSuccess={fetchWorkers}
      />

      {/* 数据管理对话框 */}
      <WorkerDataManageDialog
        open={dataManageDialogOpen}
        onOpenChange={setDataManageDialogOpen}
        currentCount={allWorkers.length}
        onSuccess={fetchWorkers}
      />

      {/* 调动对话框 */}
      <Dialog open={transferDialogOpen} onOpenChange={setTransferDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>工人调动</DialogTitle>
            <DialogDescription>
              将 <span className="font-semibold" style={{ color: '#165DFF' }}>{transferWorker?.name}</span> 调动到其他项目，原项目的工资记录不会丢失
            </DialogDescription>
          </DialogHeader>
          
          {/* 现有项目分配 */}
          {transferAssignments.length > 0 && (
            <div className="mb-4">
              <h4 className="text-sm font-medium mb-2" style={{ color: '#86909C' }}>当前项目分配</h4>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {transferAssignments.map((a: { id: number; project_id: number; project_name: string; status: string; start_date: string | null }) => (
                  <div key={a.id} className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ background: '#F7F8FA' }}>
                    <div className="flex items-center gap-2">
                      <Building2 className="w-4 h-4" style={{ color: '#165DFF' }} />
                      <span className="text-sm">{a.project_name}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${a.status === 'active' ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
                        {a.status === 'active' ? '在项目中' : '已退场'}
                      </span>
                    </div>
                    {a.status === 'active' && (
                      <Button size="sm" variant="ghost" onClick={() => handleLeaveAssignment(a.id)} className="h-6 px-2 text-xs" style={{ color: '#F53F3F' }}>
                        退场
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 调动到新项目 */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium" style={{ color: '#86909C' }}>调动到新项目</h4>
            <select 
              value={transferProjectId} 
              onChange={e => setTransferProjectId(e.target.value)}
              className="w-full h-9 px-3 rounded-md border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">选择目标项目...</option>
              {projects
                .filter(p => !transferAssignments.some((a: { project_id: number; status: string }) => a.project_id === p.id && a.status === 'active'))
                .map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
            </select>
          </div>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setTransferDialogOpen(false)}>取消</Button>
            <Button onClick={handleTransfer} disabled={!transferProjectId} style={{ background: '#165DFF' }}>确认调动</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
