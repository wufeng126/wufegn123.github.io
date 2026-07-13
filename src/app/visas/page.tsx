'use client';
import { useToast } from '@/hooks/use-toast';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
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
  FileCheck, Clock, CheckCircle2, TrendingUp, Building2,
  Plus, Pencil, Trash2, Search, RefreshCw, Eye,
  ChevronLeft, ChevronRight, FileText, AlertCircle,
  BarChart3, ArrowUpRight, ArrowDownRight, Download
} from 'lucide-react';
import { AnimatedNumber } from '@/components/ui/animated-number';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

// 类型定义
interface Project {
  id: number;
  name: string;
  status: string;
}

interface Visa {
  id: number;
  visa_number: string;
  visa_name: string;
  project_id: number;
  occurrence_date: string;
  visa_quantity: string | null;
  visa_unit: string | null;
  visa_amount: string;
  status: string;
  handler: string | null;
  remark: string | null;
  attachments: string | null;
  created_at: string;
  projects: { name: string };
  // 审核相关字段
  review_comment?: string | null;
  reject_reason?: string | null;
  reviewer_id?: number | null;
  reviewer_name?: string | null;
  reviewed_at?: string | null;
  submitter_id?: number | null;
  submitter_name?: string | null;
  submitted_at?: string | null;
}

// 流程状态常量
const VISA_STATUSES = ['已提交', '审核通过', '已结算', '已驳回'] as const;
const VISA_STATUS_LABELS: Record<string, string> = {
  '已提交': '已提交',
  '审核通过': '审核通过',
  '已结算': '已结算',
  '已驳回': '已驳回',
};

// 状态分类
const STATUS_CATEGORIES = {
  submitted: ['已提交'],
  approved: ['审核通过', '已结算'],
  rejected: ['已驳回'],
};

interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

interface Stats {
  totalCount: number;
  completedCount: number;
  confirmedCount: number;
  pendingCount: number;
  totalAmount: number;
  completedRate: number;
  relatedProjects: number;
  activeProjectsCount: number;
  currentMonthNew: number;
  currentMonthCompleted: number;
  currentMonthAmount: number;
  overdueCount: number;
  warningCount: number;
  newGrowth: string;
  completedGrowth: string;
  amountGrowth: string;
}

interface MonthlyData {
  month: string;
  monthLabel: string;
  newCount: number;
  completedCount: number;
  amount: number;
}

interface ActiveProjectWithVisa {
  id: number;
  name: string;
  visaCount: number;
}

interface Attachment {
  id: string;
  visa_id: string;
  file_name: string;
  file_key: string;
  file_size: number;
  file_type: string;
  created_at: string;
}

export default function VisasPage() {
  const searchParams = useSearchParams();
  const statusFromUrl = searchParams.get('status');
  const { toast } = useToast();
  const [visas, setVisas] = useState<Visa[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showContent, setShowContent] = useState(false);
  const [stats, setStats] = useState<Stats>({
    totalCount: 0,
    completedCount: 0,
    confirmedCount: 0,
    pendingCount: 0,
    totalAmount: 0,
    completedRate: 0,
    relatedProjects: 0,
    activeProjectsCount: 0,
    currentMonthNew: 0,
    currentMonthCompleted: 0,
    currentMonthAmount: 0,
    overdueCount: 0,
    warningCount: 0,
    newGrowth: '0',
    completedGrowth: '0',
    amountGrowth: '0',
  });
  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([]);
  const [activeProjectsWithVisa, setActiveProjectsWithVisa] = useState<ActiveProjectWithVisa[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    pageSize: 10,
    total: 0,
    totalPages: 0,
  });

  // 筛选条件
  const [searchKeyword, setSearchKeyword] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>(statusFromUrl || 'all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // 对话框状态
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [currentVisa, setCurrentVisa] = useState<Visa | null>(null);
  const [saving, setSaving] = useState(false);

  // 附件相关状态
  const [attachments, setAttachments] = useState<any[]>([]);
  const [loadingAttachments, setLoadingAttachments] = useState(false);
  const [uploading, setUploading] = useState(false);

  // 新增对话框附件状态
  const [addDialogAttachments, setAddDialogAttachments] = useState<any[]>([]);
  const [addDialogUploading, setAddDialogUploading] = useState(false);

  // 审核对话框状态
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [reviewComment, setReviewComment] = useState('');
  const [rejectReason, setRejectReason] = useState('');

  // 表单数据
  const [form, setForm] = useState({
    visa_number: '',
    visa_name: '',
    project_id: '',
    occurrence_date: '',
    visa_quantity: '',
    visa_unit: '',
    visa_amount: '',
    status: '已提交',
    handler: '',
    remark: '',
  });

  useEffect(() => {
    fetchProjects();
    fetchVisas();
  }, []);

  useEffect(() => {
    if (!loading) {
      const timer = setTimeout(() => setShowContent(true), 50);
      return () => clearTimeout(timer);
    }
  }, [loading]);

  // 点击统计卡片筛选状态
  const handleStatsCardClick = (status: string) => {
    setSelectedStatus(status);
    // 滚动到列表区域
    setTimeout(() => {
      document.getElementById('visa-list-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  // 点击项目卡片筛选项目
  const handleProjectClick = (projectId: number) => {
    setSelectedProjectId(projectId.toString());
    // 滚动到列表区域
    setTimeout(() => {
      document.getElementById('visa-list-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  // 监听状态筛选变化
  useEffect(() => {
    fetchVisas(1);
  }, [selectedStatus]);

  // 监听其他筛选条件变化（防抖）
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchVisas(1);
    }, 300); // 300ms 防抖
    return () => clearTimeout(timer);
  }, [searchKeyword, selectedProjectId, startDate, endDate]);

  const fetchProjects = async () => {
    try {
      const res = await fetch('/api/projects');
      const data = await res.json();
      setProjects(data.projects || []);
    } catch (error) {
      console.error('获取项目失败:', error);
    }
  };

  const fetchVisas = async (page = pagination.page) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedProjectId !== 'all') params.append('projectId', selectedProjectId);
      if (selectedStatus !== 'all') params.append('status', selectedStatus);
      if (searchKeyword) params.append('keyword', searchKeyword);
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      params.append('page', page.toString());
      params.append('pageSize', pagination.pageSize.toString());

      const res = await fetch(`/api/visas?${params.toString()}`);
      const data = await res.json();

      if (res.ok) {
        setVisas(data.visas || []);
        setPagination(data.pagination);
        setStats(data.stats);
        setMonthlyData(data.monthlyData || []);
        setActiveProjectsWithVisa(data.activeProjectsWithVisa || []);
      } else {
        throw new Error(data.error);
      }
    } catch (error: any) {
      console.error('获取签证失败:', error);
      toast({
        title: '获取失败',
        description: error.message || '获取签证列表失败',
        variant: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  // 获取附件列表
  const loadAttachments = async (visaId: string) => {
    setLoadingAttachments(true);
    try {
      const res = await fetch(`/api/visas/attachments?visaId=${visaId}`);
      const data = await res.json();
      if (res.ok) {
        setAttachments(data.attachments || []);
      }
    } catch (error) {
      console.error('获取附件失败:', error);
    } finally {
      setLoadingAttachments(false);
    }
  };

  // 上传附件
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length || !currentVisa) return;
    
    setUploading(true);
    const files = Array.from(e.target.files);
    
    try {
      for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('visaId', String(currentVisa.id));
        
        const res = await fetch('/api/visas/attachments/upload', {
          method: 'POST',
          body: formData,
        });
        
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || '上传失败');
        }
      }
      
      toast({
        title: '上传成功',
        description: `成功上传 ${files.length} 个附件`,
      });
      
      // 刷新附件列表
      loadAttachments(String(currentVisa.id));
    } catch (error: any) {
      toast({
        title: '上传失败',
        description: error.message,
        variant: 'error',
      });
    } finally {
      setUploading(false);
      // 清空 input
      e.target.value = '';
    }
  };

  // 处理文件选择上传
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    const visaId = currentVisa?.id;
    if (!visaId) return;
    
    setUploading(true);
    
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const formData = new FormData();
        formData.append('visaId', String(visaId));
        formData.append('file', file);
        
        const res = await fetch('/api/visas/attachments/upload', {
          method: 'POST',
          body: formData,
          credentials: 'include',
        });
        
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || '上传失败');
        }
      }
      
      // 重新加载附件
      loadAttachments(String(visaId));
    } catch (err) {
      console.error(err);
      toast({ title: err instanceof Error ? err.message : '上传失败', variant: 'error' });
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  // 处理新增对话框文件选择
  const handleAddDialogFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    
    // 验证文件类型和大小
    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 
                        'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                        'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
    const maxSize = 10 * 1024 * 1024; // 10MB
    
    const validFiles: File[] = [];
    for (const file of files) {
      if (file.size > maxSize) {
        toast({
          title: '文件过大',
          description: `${file.name} 超过 10MB 限制`,
          variant: 'error',
        });
        continue;
      }
      validFiles.push(file);
    }
    
    setAddDialogAttachments(prev => [...prev, ...validFiles]);
    e.target.value = ''; // 清空 input
  };

  // 删除新增对话框中的附件
  const removeAddDialogAttachment = (index: number) => {
    setAddDialogAttachments(prev => prev.filter((_, i) => i !== index));
  };

  // 删除附件
  const handleDeleteAttachment = async (attachmentId: string) => {
    if (!confirm('确定要删除此附件吗？')) return;
    
    try {
      const res = await fetch(`/api/visas/attachments/${attachmentId}`, {
        method: 'DELETE',
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '删除失败');
      }
      
      toast({
        title: '删除成功',
        description: '附件已删除',
      });
      
      // 刷新附件列表
      if (currentVisa) {
        loadAttachments(String(currentVisa.id));
      }
    } catch (error: any) {
      toast({
        title: '删除失败',
        description: error.message,
        variant: 'error',
      });
    }
  };

  // 获取文件图标
  const getFileIcon = (fileType: string) => {
    if (fileType.startsWith('image/')) return '🖼️';
    if (fileType === 'application/pdf') return '📄';
    return '📎';
  };

  // 格式化文件大小
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  // 获取文件图标颜色
  const getFileColor = (fileType: string) => {
    const type = fileType.toLowerCase();
    if (type.includes('pdf')) return '#E53E3E';
    if (type.includes('word') || type.includes('doc')) return '#3182CE';
    if (type.includes('excel') || type.includes('xls')) return '#38A169';
    if (type.includes('image') || type.includes('png') || type.includes('jpg') || type.includes('jpeg')) return '#D69E2E';
    return '#718096';
  };

  // 导出签证数据
  const handleExport = () => {
    // 构建CSV数据
    const headers = ['签证编号', '签证名称', '关联项目', '发生日期', '工程量', '单位', '签证金额', '状态', '办理人', '备注'];
    const rows = visas.map(v => [
      v.visa_number,
      v.visa_name,
      v.projects?.name || '',
      v.occurrence_date,
      v.visa_quantity || '',
      v.visa_unit || '',
      v.visa_amount,
      v.status,
      v.handler || '',
      v.remark || '',
    ]);
    
    const csvContent = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `签证数据_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    
    toast({
      title: '导出成功',
      description: `已导出 ${visas.length} 条签证数据`,
    });
  };

  // 重置筛选
  const handleReset = () => {
    setSearchKeyword('');
    setSelectedProjectId('all');
    setSelectedStatus('all');
    setStartDate('');
    setEndDate('');
    fetchVisas(1);
  };

  // 分页
  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= pagination.totalPages) {
      fetchVisas(newPage);
    }
  };

  // 打开新增对话框
  const handleAdd = () => {
    setForm({
      visa_number: generateVisaNumber(),
      visa_name: '',
      project_id: projects[0]?.id.toString() || '',
      occurrence_date: new Date().toISOString().split('T')[0],
      visa_quantity: '',
      visa_unit: '',
      visa_amount: '',
      status: '已提交',
      handler: '',
      remark: '',
    });
    setAddDialogOpen(true);
  };

  // 生成签证编号
  const generateVisaNumber = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `VZ-${year}${month}-${random}`;
  };

  // 打开编辑对话框
  const handleEdit = (visa: Visa) => {
    setCurrentVisa(visa);
    setForm({
      visa_number: visa.visa_number,
      visa_name: visa.visa_name,
      project_id: visa.project_id.toString(),
      occurrence_date: visa.occurrence_date,
      visa_quantity: visa.visa_quantity || '',
      visa_unit: visa.visa_unit || '',
      visa_amount: visa.visa_amount,
      status: visa.status,
      handler: visa.handler || '',
      remark: visa.remark || '',
    });
    setEditDialogOpen(true);
  };

  // 打开查看对话框
  const handleView = async (visa: Visa) => {
    setCurrentVisa(visa);
    setViewDialogOpen(true);
    // 加载附件
    await loadAttachments(String(visa.id));
  };

  // 预览附件
  const handlePreview = (att: Attachment) => {
    window.open(`/api/visas/attachments/${att.id}/download?token=preview`, '_blank');
  };

  // 下载附件
  const handleDownload = (att: Attachment) => {
    window.location.href = `/api/visas/attachments/${att.id}/download?token=download`;
  };

  // 打开删除确认对话框
  const handleDeleteConfirm = (visa: Visa) => {
    setCurrentVisa(visa);
    setDeleteDialogOpen(true);
  };

  // 保存新增
  const handleSaveAdd = async () => {
    if (!form.visa_number || !form.visa_name || !form.project_id || !form.occurrence_date || !form.visa_amount) {
      toast({
        title: '验证失败',
        description: '请填写所有必填项',
        variant: 'error',
      });
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/visas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      // 如果有附件，先上传
      if (addDialogAttachments.length > 0 && data.id) {
        for (const file of addDialogAttachments) {
          const formData = new FormData();
          formData.append('visaId', String(data.id));
          formData.append('file', file);
          
          const uploadRes = await fetch('/api/visas/attachments/upload', {
            method: 'POST',
            body: formData,
            credentials: 'include',
          });
          
          if (!uploadRes.ok) {
            const uploadData = await uploadRes.json();
            console.error('附件上传失败:', uploadData.error);
          }
        }
      }

      toast({
        title: '创建成功',
        description: addDialogAttachments.length > 0 
          ? `签证已创建，${addDialogAttachments.length} 个附件已上传` 
          : '签证已成功创建',
      });
      setAddDialogOpen(false);
      setAddDialogAttachments([]); // 清空附件列表
      fetchVisas(1);
    } catch (error: any) {
      toast({
        title: '创建失败',
        description: error.message || '创建签证失败',
        variant: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  // 保存编辑
  const handleSaveEdit = async () => {
    if (!currentVisa || !form.visa_number || !form.visa_name || !form.project_id || !form.occurrence_date || !form.visa_amount) {
      toast({
        title: '验证失败',
        description: '请填写所有必填项',
        variant: 'error',
      });
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/visas/${currentVisa.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      toast({
        title: '更新成功',
        description: '签证已成功更新',
      });
      setEditDialogOpen(false);
      fetchVisas(pagination.page);
    } catch (error: any) {
      toast({
        title: '更新失败',
        description: error.message || '更新签证失败',
        variant: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  // 删除签证
  const handleDelete = async () => {
    if (!currentVisa) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/visas/${currentVisa.id}`, {
        method: 'DELETE',
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      toast({
        title: '删除成功',
        description: '签证已成功删除',
      });
      setDeleteDialogOpen(false);
      fetchVisas(pagination.page);
    } catch (error: any) {
      toast({
        title: '删除失败',
        description: error.message || '删除签证失败',
        variant: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  // 提交签证
  const handleSubmit = async (visa: Visa) => {
    if (!confirm(`确定要提交签证 "${visa.visa_number}" 吗？提交后将进入审核流程。`)) return;
    
    setSaving(true);
    try {
      const res = await fetch(`/api/visas/${visa.id}/submit`, {
        method: 'POST',
        credentials: 'include',
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      toast({
        title: '提交成功',
        description: '签证已成功提交，等待审核',
      });
      fetchVisas(pagination.page);
    } catch (error: any) {
      toast({
        title: '提交失败',
        description: error.message || '提交签证失败',
        variant: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  // 打开审核对话框
  const handleReview = (visa: Visa) => {
    setCurrentVisa(visa);
    setReviewComment('');
    setReviewDialogOpen(true);
  };

  // 审核通过
  const handleApprove = async () => {
    if (!currentVisa) return;
    
    setSaving(true);
    try {
      const res = await fetch(`/api/visas/${currentVisa.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'approve',
          review_comment: reviewComment 
        }),
        credentials: 'include',
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      toast({
        title: '审核通过',
        description: '签证已审核通过',
      });
      setReviewDialogOpen(false);
      fetchVisas(pagination.page);
    } catch (error: any) {
      toast({
        title: '审核失败',
        description: error.message || '审核操作失败',
        variant: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  // 打开驳回对话框
  const handleReject = () => {
    setRejectReason('');
    setReviewDialogOpen(false);
    setRejectDialogOpen(true);
  };

  // 确认驳回
  const handleConfirmReject = async () => {
    if (!currentVisa || !rejectReason.trim()) {
      toast({
        title: '验证失败',
        description: '请填写驳回原因',
        variant: 'error',
      });
      return;
    }
    
    setSaving(true);
    try {
      const res = await fetch(`/api/visas/${currentVisa.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'reject',
          reject_reason: rejectReason 
        }),
        credentials: 'include',
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      toast({
        title: '已驳回',
        description: '签证已被驳回',
      });
      setRejectDialogOpen(false);
      fetchVisas(pagination.page);
    } catch (error: any) {
      toast({
        title: '驳回失败',
        description: error.message || '驳回操作失败',
        variant: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  // 结算签证
  const handleSettle = async (visa: Visa) => {
    if (!confirm(`确定要将签证 "${visa.visa_number}" 标记为已结算吗？`)) return;
    
    setSaving(true);
    try {
      const res = await fetch(`/api/visas/${visa.id}/settle`, {
        method: 'POST',
        credentials: 'include',
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      toast({
        title: '结算成功',
        description: '签证已标记为已结算',
      });
      fetchVisas(pagination.page);
    } catch (error: any) {
      toast({
        title: '结算失败',
        description: error.message || '结算操作失败',
        variant: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  // 获取状态样式
  const getStatusStyle = (status: string) => {
    switch (status) {
      case '已提交':
        return 'bg-amber-50 text-amber-600 border-amber-200';
      case '审核通过':
        return 'bg-blue-50 text-blue-600 border-blue-200';
      case '已结算':
      case '已完结':
        return 'bg-green-50 text-green-600 border-green-200';
      case '已驳回':
        return 'bg-red-50 text-red-600 border-red-200';
      default:
        return 'bg-gray-50 text-gray-600 border-gray-200';
    }
  };

  // 获取状态图标
  const getStatusIcon = (status: string) => {
    switch (status) {
      case '已提交':
        return <Clock className="w-3.5 h-3.5" />;
      case '审核通过':
        return <CheckCircle2 className="w-3.5 h-3.5" />;
      case '已结算':
        return <CheckCircle2 className="w-3.5 h-3.5" />;
      case '已驳回':
        return <AlertCircle className="w-3.5 h-3.5" />;
      default:
        return <Clock className="w-3.5 h-3.5" />;
    }
  };

  // 计算风险预警
  const getRiskWarning = (visa: Visa): { type: 'overdue' | 'warning' | 'normal'; text: string; days: number } => {
    // 已驳回的签证不预警
    if (visa.status === '已驳回') {
      return { type: 'normal', text: '', days: 0 };
    }
    // 已结算的签证不预警
    if (visa.status === '已结算') {
      return { type: 'normal', text: '', days: 0 };
    }
    // 已审核通过但未结算的进行结算提醒
    if (visa.status === '审核通过') {
      return { type: 'warning', text: '待结算', days: 0 };
    }
    
    // 计算提交日期到今天的天数（针对已提交状态）
    if (visa.status === '已提交' && visa.submitted_at) {
      const submitDate = new Date(visa.submitted_at);
      const today = new Date();
      const diffTime = today.getTime() - submitDate.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays > 7) {
        return { type: 'overdue', text: `待审核 ${diffDays}天`, days: diffDays };
      } else if (diffDays > 3) {
        return { type: 'warning', text: `待审核 ${diffDays}天`, days: diffDays };
      }
    }
    
    return { type: 'normal', text: '', days: 0 };
  };

  // 图表数据格式化
  const chartData = monthlyData.map(item => ({
    name: item.monthLabel,
    '新增签证': item.newCount,
    '已完结签证': item.completedCount,
    '涉及金额': item.amount / 10000,
  }));

  return (
    <div className="space-y-5">
      {/* 顶部操作栏 */}
      <div className={`flex items-center justify-between transition-all duration-500 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
        {/* 左侧按钮 */}
        <div className="flex items-center gap-3">
          <Button
            onClick={handleAdd}
            className="gap-2 h-9 px-4"
            style={{ 
              background: 'linear-gradient(135deg, #165DFF 0%, #4080FF 100%)',
              boxShadow: '0 2px 8px rgba(22, 93, 255, 0.25)'
            }}
          >
            <Plus className="w-4 h-4" />
            新增签证
          </Button>
          <Button
            variant="outline"
            onClick={handleExport}
            className="gap-2 h-9 px-4"
            style={{ borderColor: '#E5E6EB', color: '#4E5969' }}
          >
            <Download className="w-4 h-4" />
            导出签证数据
          </Button>
        </div>
        
        {/* 右侧状态筛选标签 */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSelectedStatus('all')}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
              selectedStatus === 'all' 
                ? 'text-white shadow-md' 
                : 'hover:bg-gray-100'
            }`}
            style={selectedStatus === 'all' ? { background: 'linear-gradient(135deg, #165DFF 0%, #4080FF 100%)' } : { color: '#4E5969' }}
          >
            全部
          </button>
          <button
            onClick={() => setSelectedStatus('已提交')}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
              selectedStatus === '已提交' 
                ? 'bg-amber-500 text-white shadow-md' 
                : 'bg-amber-50 text-amber-600 hover:bg-amber-100'
            }`}
          >
            待审核
          </button>
          <button
            onClick={() => setSelectedStatus('审核通过')}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
              selectedStatus === '审核通过' 
                ? 'bg-blue-500 text-white shadow-md' 
                : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
            }`}
          >
            待结算
          </button>
          <button
            onClick={() => setSelectedStatus('已结算')}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
              selectedStatus === '已结算' 
                ? 'bg-green-500 text-white shadow-md' 
                : 'bg-green-50 text-green-600 hover:bg-green-100'
            }`}
          >
            已结算
          </button>
          
          {/* 风险预警提示 */}
          {(stats.overdueCount > 0 || stats.warningCount > 0) && (
            <div className="flex items-center gap-2 ml-4 pl-4 border-l" style={{ borderColor: '#E5E6EB' }}>
              {stats.overdueCount > 0 && (
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-50 animate-pulse">
                  <AlertCircle className="w-3.5 h-3.5" style={{ color: '#F53F3F' }} />
                  <span className="text-xs font-medium" style={{ color: '#F53F3F' }}>
                    待处理 {stats.overdueCount}
                  </span>
                </div>
              )}
              {stats.warningCount > 0 && (
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50">
                  <Clock className="w-3.5 h-3.5" style={{ color: '#FF7D00' }} />
                  <span className="text-xs font-medium" style={{ color: '#FF7D00' }}>
                    即将到期 {stats.warningCount}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 数据概览区域 */}
      <div className={`grid grid-cols-12 gap-4 transition-all duration-500 delay-100 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
        {/* 左侧大卡片 - 签证概览 */}
        <Card className="col-span-12 lg:col-span-5 hover:shadow-lg transition-all duration-300" style={{ background: '#FFFFFF', border: '1px solid #E5E6EB' }}>
          <CardContent className="pt-6 pb-6">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #165DFF 0%, #4080FF 100%)' }}>
                  <BarChart3 className="w-5 h-5 text-white" />
                </div>
                <span className="text-base font-semibold" style={{ color: '#1D2129' }}>签证概览</span>
              </div>
              <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                <SelectTrigger className="w-40 h-8 text-sm" style={{ background: '#F7F8FA', border: '1px solid #E5E6EB' }}>
                  <SelectValue placeholder="选择项目筛选" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部项目</SelectItem>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id.toString()}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="grid grid-cols-2 gap-6 mb-6">
              <div>
                <p className="text-sm mb-2" style={{ color: '#86909C' }}>签证总份数</p>
                <p className="text-3xl font-bold" style={{ color: '#1D2129' }}>{stats.totalCount}</p>
              </div>
              <div>
                <p className="text-sm mb-2" style={{ color: '#86909C' }}>签证总金额</p>
                <p className="text-2xl font-bold" style={{ color: '#722ED1' }}>
                  ¥<AnimatedNumber value={stats.totalAmount} format={(v) => v.toLocaleString('zh-CN', { maximumFractionDigits: 0 })} />
                </p>
              </div>
            </div>
            
            <div className="pt-4 border-t" style={{ borderColor: '#E5E6EB' }}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium" style={{ color: '#4E5969' }}>签回完成率</p>
                <p className="text-lg font-bold" style={{ color: '#165DFF' }}>{stats.completedRate.toFixed(1)}%</p>
              </div>
              <Progress value={stats.completedRate} className="h-3" style={{ background: '#E5E6EB' }} />
              <div className="flex items-center justify-between mt-2 text-xs" style={{ color: '#86909C' }}>
                <span>已完结 {stats.completedCount} 份</span>
                <span>共 {stats.totalCount} 份</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 右侧四个小统计卡片 */}
        <div className="col-span-12 lg:col-span-7 grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 进行中项目 */}
          <Card 
            className="group hover:shadow-lg hover:-translate-y-1 transition-all duration-300 cursor-pointer" 
            style={{ background: '#FFFFFF', border: '1px solid #E5E6EB' }}
            onClick={() => { setSelectedProjectId('all'); setSelectedStatus('all'); }}
          >
            <CardContent className="pt-5 pb-5">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#E8F3FF' }}>
                  <Building2 className="w-5 h-5" style={{ color: '#165DFF' }} />
                </div>
              </div>
              <p className="text-3xl font-bold" style={{ color: '#165DFF' }}>{stats.activeProjectsCount}</p>
              <p className="text-sm mt-1" style={{ color: '#86909C' }}>进行中项目</p>
            </CardContent>
          </Card>

          {/* 签证总数 */}
          <Card 
            className="group hover:shadow-lg hover:-translate-y-1 transition-all duration-300 cursor-pointer" 
            style={{ background: '#FFFFFF', border: '1px solid #E5E6EB' }}
            onClick={() => handleStatsCardClick('all')}
          >
            <CardContent className="pt-5 pb-5">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#E8FFEA' }}>
                  <FileCheck className="w-5 h-5" style={{ color: '#00B42A' }} />
                </div>
              </div>
              <p className="text-3xl font-bold" style={{ color: '#00B42A' }}>{stats.totalCount}</p>
              <p className="text-sm mt-1" style={{ color: '#86909C' }}>签证总数</p>
            </CardContent>
          </Card>

          {/* 待处理签证 */}
          <Card 
            className={`group hover:shadow-lg hover:-translate-y-1 transition-all duration-300 cursor-pointer ${selectedStatus === '待办理' ? 'ring-2 ring-amber-400' : ''}`} 
            style={{ background: '#FFFFFF', border: '1px solid #E5E6EB' }}
            onClick={() => handleStatsCardClick('待办理')}
          >
            <CardContent className="pt-5 pb-5">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#FFF7E8' }}>
                  <Clock className="w-5 h-5" style={{ color: '#FF7D00' }} />
                </div>
                {stats.pendingCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-600 animate-pulse">
                    需处理
                  </span>
                )}
              </div>
              <p className="text-3xl font-bold" style={{ color: '#FF7D00' }}>{stats.pendingCount}</p>
              <p className="text-sm mt-1" style={{ color: '#86909C' }}>待处理签证</p>
              <p className="text-xs mt-1 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: '#FF7D00' }}>点击查看 →</p>
            </CardContent>
          </Card>

          {/* 已完结签证 */}
          <Card 
            className={`group hover:shadow-lg hover:-translate-y-1 transition-all duration-300 cursor-pointer ${selectedStatus === '已完结' ? 'ring-2 ring-purple-400' : ''}`} 
            style={{ background: '#FFFFFF', border: '1px solid #E5E6EB' }}
            onClick={() => handleStatsCardClick('已完结')}
          >
            <CardContent className="pt-5 pb-5">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#F5E8FF' }}>
                  <CheckCircle2 className="w-5 h-5" style={{ color: '#722ED1' }} />
                </div>
              </div>
              <p className="text-3xl font-bold" style={{ color: '#722ED1' }}>{stats.completedCount}</p>
              <p className="text-sm mt-1" style={{ color: '#86909C' }}>已完结签证</p>
              <p className="text-xs mt-1 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: '#722ED1' }}>点击查看 →</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* 图表区域 */}
      <div className={`grid grid-cols-12 gap-4 transition-all duration-500 delay-200 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
        {/* 左侧辅助信息区 */}
        <Card className="col-span-12 lg:col-span-3 hover:shadow-lg transition-all" style={{ background: '#FFFFFF', border: '1px solid #E5E6EB' }}>
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold" style={{ color: '#1D2129' }}>
              <Building2 className="w-4 h-4" style={{ color: '#165DFF' }} />
              进行中项目
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-2">
              {activeProjectsWithVisa.length === 0 ? (
                <div className="text-center py-8" style={{ color: '#86909C' }}>
                  <Building2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">暂无进行中项目</p>
                </div>
              ) : (
                activeProjectsWithVisa.slice(0, 6).map((project) => (
                  <div 
                    key={project.id} 
                    className={`flex items-center justify-between p-2.5 rounded-lg transition-all cursor-pointer ${
                      selectedProjectId === project.id.toString() 
                        ? 'bg-blue-50 ring-1 ring-blue-200' 
                        : 'hover:bg-gray-50'
                    }`}
                    onClick={() => handleProjectClick(project.id)}
                  >
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${selectedProjectId === project.id.toString() ? 'bg-blue-600' : ''}`} style={{ background: selectedProjectId === project.id.toString() ? '#165DFF' : '#165DFF' }} />
                      <span className="text-sm truncate max-w-[120px]" style={{ color: selectedProjectId === project.id.toString() ? '#165DFF' : '#1D2129', fontWeight: selectedProjectId === project.id.toString() ? 600 : 400 }}>{project.name}</span>
                    </div>
                    <Badge variant="outline" className={`text-xs font-medium ${selectedProjectId === project.id.toString() ? 'border-blue-300 text-blue-600' : ''}`} style={{ borderColor: selectedProjectId === project.id.toString() ? '#165DFF' : '#E5E6EB', color: selectedProjectId === project.id.toString() ? '#165DFF' : '#4E5969' }}>
                      {project.visaCount} 份
                    </Badge>
                  </div>
                ))
              )}
            </div>
            {activeProjectsWithVisa.length > 6 && (
              <div className="pt-2 mt-2 border-t text-center" style={{ borderColor: '#E5E6EB' }}>
                <button 
                  className="text-xs font-medium hover:underline" 
                  style={{ color: '#165DFF' }}
                  onClick={() => setSelectedProjectId('all')}
                >
                  查看全部 {activeProjectsWithVisa.length} 个项目
                </button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 右侧图表区 */}
        <Card className="col-span-12 lg:col-span-9 hover:shadow-lg transition-all" style={{ background: '#FFFFFF', border: '1px solid #E5E6EB' }}>
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold" style={{ color: '#1D2129' }}>
              <TrendingUp className="w-4 h-4" style={{ color: '#165DFF' }} />
              签证趋势 · 近6个月
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E6EB" />
                  <XAxis dataKey="name" tick={{ fill: '#86909C', fontSize: 12 }} axisLine={{ stroke: '#E5E6EB' }} />
                  <YAxis tick={{ fill: '#86909C', fontSize: 12 }} axisLine={{ stroke: '#E5E6EB' }} />
                  <Tooltip 
                    contentStyle={{ 
                      background: '#FFFFFF', 
                      border: '1px solid #E5E6EB',
                      borderRadius: '8px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
                    }}
                    formatter={(value: any, name: string) => {
                      if (name === '涉及金额') return [`¥${value.toFixed(2)}万`, name];
                      return [value, name];
                    }}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="新增签证" stroke="#165DFF" strokeWidth={2} dot={{ fill: '#165DFF', strokeWidth: 2, r: 4 }} activeDot={{ r: 6 }} />
                  <Line type="monotone" dataKey="已完结签证" stroke="#00B42A" strokeWidth={2} dot={{ fill: '#00B42A', strokeWidth: 2, r: 4 }} activeDot={{ r: 6 }} />
                  <Line type="monotone" dataKey="涉及金额" stroke="#FF7D00" strokeWidth={2} dot={{ fill: '#FF7D00', strokeWidth: 2, r: 4 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            
            {/* 图表下方标注 */}
            <div className="grid grid-cols-3 gap-4 pt-4 border-t mt-4" style={{ borderColor: '#E5E6EB' }}>
              <div className="text-center">
                <p className="text-xs mb-1" style={{ color: '#86909C' }}>本月新增</p>
                <p className="text-2xl font-bold" style={{ color: '#165DFF' }}>{stats.currentMonthNew}</p>
                <div className="flex items-center justify-center gap-1 mt-1">
                  {parseFloat(stats.newGrowth) >= 0 ? (
                    <ArrowUpRight className="w-3.5 h-3.5" style={{ color: '#00B42A' }} />
                  ) : (
                    <ArrowDownRight className="w-3.5 h-3.5" style={{ color: '#F53F3F' }} />
                  )}
                  <span className="text-xs font-medium" style={{ color: parseFloat(stats.newGrowth) >= 0 ? '#00B42A' : '#F53F3F' }}>
                    {Math.abs(parseFloat(stats.newGrowth))}%
                  </span>
                </div>
              </div>
              <div className="text-center">
                <p className="text-xs mb-1" style={{ color: '#86909C' }}>本月已完结</p>
                <p className="text-2xl font-bold" style={{ color: '#00B42A' }}>{stats.currentMonthCompleted}</p>
                <div className="flex items-center justify-center gap-1 mt-1">
                  {parseFloat(stats.completedGrowth) >= 0 ? (
                    <ArrowUpRight className="w-3.5 h-3.5" style={{ color: '#00B42A' }} />
                  ) : (
                    <ArrowDownRight className="w-3.5 h-3.5" style={{ color: '#F53F3F' }} />
                  )}
                  <span className="text-xs font-medium" style={{ color: parseFloat(stats.completedGrowth) >= 0 ? '#00B42A' : '#F53F3F' }}>
                    {Math.abs(parseFloat(stats.completedGrowth))}%
                  </span>
                </div>
              </div>
              <div className="text-center">
                <p className="text-xs mb-1" style={{ color: '#86909C' }}>本月金额</p>
                <p className="text-2xl font-bold" style={{ color: '#FF7D00' }}>
                  ¥{(stats.currentMonthAmount / 10000).toFixed(1)}万
                </p>
                <div className="flex items-center justify-center gap-1 mt-1">
                  {parseFloat(stats.amountGrowth) >= 0 ? (
                    <ArrowUpRight className="w-3.5 h-3.5" style={{ color: '#00B42A' }} />
                  ) : (
                    <ArrowDownRight className="w-3.5 h-3.5" style={{ color: '#F53F3F' }} />
                  )}
                  <span className="text-xs font-medium" style={{ color: parseFloat(stats.amountGrowth) >= 0 ? '#00B42A' : '#F53F3F' }}>
                    {Math.abs(parseFloat(stats.amountGrowth))}%
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 签证列表区域 */}
      <div id="visa-list-section" className={`transition-all duration-500 delay-300 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
        <Card style={{ background: '#FFFFFF', border: '1px solid #E5E6EB' }}>
          {/* 筛选区域 */}
          <CardContent className="pt-4 pb-3 border-b" style={{ borderColor: '#E5E6EB' }}>
            <div className="flex flex-wrap items-center gap-3">
              {/* 当前筛选状态提示 */}
              {(selectedStatus !== 'all' || selectedProjectId !== 'all') && (
                <div className="w-full mb-2 flex items-center gap-2">
                  <span className="text-xs" style={{ color: '#86909C' }}>当前筛选：</span>
                  {selectedProjectId !== 'all' && (
                    <Badge variant="outline" className="text-xs gap-1" style={{ borderColor: '#165DFF', color: '#165DFF' }}>
                      <Building2 className="w-3 h-3" />
                      {projects.find(p => p.id.toString() === selectedProjectId)?.name}
                      <button onClick={() => setSelectedProjectId('all')} className="ml-1 hover:bg-blue-100 rounded-full p-0.5">×</button>
                    </Badge>
                  )}
                  {selectedStatus !== 'all' && (
                    <Badge variant="outline" className="text-xs gap-1" style={{ borderColor: '#FF7D00', color: '#FF7D00' }}>
                      <Clock className="w-3 h-3" />
                      {selectedStatus}
                      <button onClick={() => setSelectedStatus('all')} className="ml-1 hover:bg-orange-100 rounded-full p-0.5">×</button>
                    </Badge>
                  )}
                  <button 
                    onClick={handleReset}
                    className="text-xs hover:underline" 
                    style={{ color: '#165DFF' }}
                  >
                    清除筛选
                  </button>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Search className="w-4 h-4" style={{ color: '#86909C' }} />
                <Input
                  placeholder="搜索编号/名称..."
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                  className="w-48 h-8"
                />
              </div>
              
              <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                <SelectTrigger className="w-36 h-8">
                  <SelectValue placeholder="选择项目" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部项目</SelectItem>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id.toString()}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-32 h-8"
                  placeholder="开始日期"
                />
                <span style={{ color: '#86909C' }}>至</span>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-32 h-8"
                  placeholder="结束日期"
                />
              </div>

              <div className="flex items-center gap-2 ml-auto">
                <Button variant="ghost" size="sm" onClick={handleReset} className="h-8">
                  重置
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchVisas(pagination.page)}
                  className="h-8 w-8 p-0"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          </CardContent>

          {/* 列表区域 */}
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow style={{ background: '#F7F8FA' }}>
                  <TableHead className="font-medium h-10" style={{ color: '#86909C' }}>签证编号</TableHead>
                  <TableHead className="font-medium" style={{ color: '#86909C' }}>签证名称</TableHead>
                  <TableHead className="font-medium" style={{ color: '#86909C' }}>关联项目</TableHead>
                  <TableHead className="font-medium text-center" style={{ color: '#86909C' }}>发生日期</TableHead>
                  <TableHead className="font-medium text-right" style={{ color: '#86909C' }}>工程量</TableHead>
                  <TableHead className="font-medium text-right" style={{ color: '#86909C' }}>金额</TableHead>
                  <TableHead className="font-medium text-center" style={{ color: '#86909C' }}>状态</TableHead>
                  <TableHead className="font-medium text-center" style={{ color: '#86909C' }}>风险预警</TableHead>
                  <TableHead className="font-medium text-center" style={{ color: '#86909C' }}>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-12">
                      <div className="flex items-center justify-center gap-2" style={{ color: '#86909C' }}>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>加载中...</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : visas.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-12">
                      <div className="flex flex-col items-center gap-2" style={{ color: '#86909C' }}>
                        <FileCheck className="w-10 h-10 opacity-30" />
                        <span>暂无签证数据</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  visas.map((visa) => {
                    const riskWarning = getRiskWarning(visa);
                    return (
                    <TableRow key={visa.id} className={`hover:bg-blue-50/50 transition-colors ${riskWarning.type === 'overdue' ? 'bg-red-50/30' : riskWarning.type === 'warning' ? 'bg-amber-50/30' : ''}`}>
                      <TableCell className="font-mono text-sm py-3" style={{ color: '#165DFF' }}>
                        {visa.visa_number}
                      </TableCell>
                      <TableCell className="font-medium max-w-[180px] truncate py-3" style={{ color: '#1D2129' }}>
                        {visa.visa_name}
                      </TableCell>
                      <TableCell className="py-3">
                        <div className="flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5" style={{ color: '#86909C' }} />
                          <span className="text-sm truncate max-w-[100px]" style={{ color: '#4E5969' }}>{visa.projects?.name || '-'}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center text-sm py-3" style={{ color: '#4E5969' }}>
                        {visa.occurrence_date}
                      </TableCell>
                      <TableCell className="text-right text-sm py-3" style={{ color: '#4E5969' }}>
                        {visa.visa_quantity ? `${parseFloat(visa.visa_quantity).toLocaleString()} ${visa.visa_unit || ''}` : '-'}
                      </TableCell>
                      <TableCell className="text-right font-medium py-3" style={{ color: '#722ED1' }}>
                        ¥{parseFloat(visa.visa_amount).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-center py-3">
                        <Badge variant="outline" className={`${getStatusStyle(visa.status)} font-medium`}>
                          {visa.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center py-3">
                        {riskWarning.type === 'overdue' && (
                          <div className="flex items-center justify-center gap-1">
                            <AlertCircle className="w-3.5 h-3.5" style={{ color: '#F53F3F' }} />
                            <span className="text-xs font-medium animate-pulse" style={{ color: '#F53F3F' }}>
                              超期未签回
                            </span>
                          </div>
                        )}
                        {riskWarning.type === 'warning' && (
                          <div className="flex items-center justify-center gap-1">
                            <Clock className="w-3.5 h-3.5" style={{ color: '#FF7D00' }} />
                            <span className="text-xs font-medium" style={{ color: '#FF7D00' }}>
                              即将到期
                            </span>
                          </div>
                        )}
                        {riskWarning.type === 'normal' && (
                          <div className="flex items-center justify-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" style={{ color: '#00B42A' }} />
                            <span className="text-xs font-medium" style={{ color: '#00B42A' }}>
                              正常
                            </span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="py-3">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleView(visa)}
                            className="h-7 w-7 p-0"
                            title="查看"
                          >
                            <Eye className="w-3.5 h-3.5" style={{ color: '#165DFF' }} />
                          </Button>
                          {/* 待办理、已提交、已驳回、已完结、已结算状态：可以编辑 */}
                          {(visa.status === '待办理' || visa.status === '已提交' || visa.status === '已驳回' || visa.status === '已完结' || visa.status === '已结算') && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEdit(visa)}
                              className="h-7 w-7 p-0"
                              title="编辑"
                            >
                              <Pencil className="w-3.5 h-3.5" style={{ color: '#FF7D00' }} />
                            </Button>
                          )}
                          {/* 待办理、已提交、已驳回、已完结、已结算状态：可以删除 */}
                          {(visa.status === '待办理' || visa.status === '已提交' || visa.status === '已驳回' || visa.status === '已完结' || visa.status === '已结算' || visa.status === '审核通过') && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteConfirm(visa)}
                              className="h-7 w-7 p-0"
                              title="删除"
                            >
                              <Trash2 className="w-3.5 h-3.5" style={{ color: '#F53F3F' }} />
                            </Button>
                          )}
                          {/* 审核通过状态：可以结算 */}
                          {visa.status === '审核通过' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleSettle(visa)}
                              className="h-7 px-2"
                              title="结算"
                              style={{ color: '#00B42A' }}
                            >
                              结算
                            </Button>
                          )}
                          {/* 已结算状态：无操作 */}
                          {visa.status === '已结算' && (
                            <span className="text-xs px-2 py-1 rounded" style={{ background: '#F6FFED', color: '#52C41A' }}>
                              已完成
                            </span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )})
                )}
              </TableBody>
            </Table>
          </CardContent>

          {/* 分页 */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t" style={{ borderColor: '#E5E6EB' }}>
              <div className="text-sm" style={{ color: '#86909C' }}>
                共 {pagination.total} 条记录，第 {pagination.page} / {pagination.totalPages} 页
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(pagination.page - 1)}
                  disabled={pagination.page <= 1}
                  className="gap-1 h-8"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  上一页
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(pagination.page + 1)}
                  disabled={pagination.page >= pagination.totalPages}
                  className="gap-1 h-8"
                >
                  下一页
                  <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* 新增签证对话框 */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle style={{ color: '#1D2129' }}>新增签证</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="required">签证编号</Label>
                <Input
                  value={form.visa_number}
                  onChange={(e) => setForm({ ...form, visa_number: e.target.value })}
                  placeholder="输入签证编号"
                />
              </div>
              <div className="space-y-2">
                <Label className="required">发生日期</Label>
                <Input
                  type="date"
                  value={form.occurrence_date}
                  onChange={(e) => setForm({ ...form, occurrence_date: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="required">签证名称/事由</Label>
              <Input
                value={form.visa_name}
                onChange={(e) => setForm({ ...form, visa_name: e.target.value })}
                placeholder="输入签证名称或事由"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="required">关联项目</Label>
                <Select value={form.project_id} onValueChange={(v) => setForm({ ...form, project_id: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择项目" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id.toString()}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>签证状态</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择状态" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="已提交">已提交</SelectItem>
                    <SelectItem value="审核通过">审核通过</SelectItem>
                    <SelectItem value="已结算">已结算</SelectItem>
                    <SelectItem value="已驳回">已驳回</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>工程量</Label>
                <Input
                  type="number"
                  value={form.visa_quantity}
                  onChange={(e) => setForm({ ...form, visa_quantity: e.target.value })}
                  placeholder="数量"
                />
              </div>
              <div className="space-y-2">
                <Label>单位</Label>
                <Input
                  value={form.visa_unit}
                  onChange={(e) => setForm({ ...form, visa_unit: e.target.value })}
                  placeholder="单位"
                />
              </div>
              <div className="space-y-2">
                <Label className="required">签证金额</Label>
                <Input
                  type="number"
                  value={form.visa_amount}
                  onChange={(e) => setForm({ ...form, visa_amount: e.target.value })}
                  placeholder="金额"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>办理人</Label>
              <Input
                value={form.handler}
                onChange={(e) => setForm({ ...form, handler: e.target.value })}
                placeholder="办理人姓名"
              />
            </div>
            <div className="space-y-2">
              <Label>备注</Label>
              <Textarea
                value={form.remark}
                onChange={(e) => setForm({ ...form, remark: e.target.value })}
                placeholder="输入备注信息"
                rows={3}
              />
            </div>
            {/* 附件上传区域 */}
            <div className="space-y-2">
              <Label>附件上传</Label>
              <div className="border-2 border-dashed border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="text-sm text-gray-500 mb-2">支持图片、PDF、Word、Excel 格式，单个文件不超过 10MB</p>
                    {addDialogAttachments.length > 0 && (
                      <div className="space-y-2">
                        {addDialogAttachments.map((file, index) => (
                          <div key={index} className="flex items-center gap-2 text-sm p-2 bg-gray-50 rounded">
                            <FileText className="w-4 h-4 text-blue-500" />
                            <span className="flex-1 truncate">{file.name}</span>
                            <span className="text-gray-400">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                            <button
                              onClick={() => removeAddDialogAttachment(index)}
                              className="text-gray-400 hover:text-red-500"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      multiple
                      accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                      onChange={handleAddDialogFileSelect}
                      className="hidden"
                    />
                    <div className="ml-4 px-4 py-2 rounded-lg text-sm font-medium" style={{ background: addDialogAttachments.length > 0 ? '#EBF5FF' : '#F2F3F5', color: '#165DFF' }}>
                      {addDialogAttachments.length > 0 ? `已选 ${addDialogAttachments.length} 个文件` : '选择文件'}
                    </div>
                  </label>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddDialogOpen(false); setAddDialogAttachments([]); }}>取消</Button>
            <Button onClick={handleSaveAdd} disabled={saving} className="gap-1.5" style={{ background: 'linear-gradient(135deg, #165DFF 0%, #4080FF 100%)' }}>
              {saving && <RefreshCw className="w-4 h-4 animate-spin" />}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 编辑签证对话框 */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle style={{ color: '#1D2129' }}>编辑签证</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="required">签证编号</Label>
                <Input
                  value={form.visa_number}
                  onChange={(e) => setForm({ ...form, visa_number: e.target.value })}
                  placeholder="输入签证编号"
                />
              </div>
              <div className="space-y-2">
                <Label className="required">发生日期</Label>
                <Input
                  type="date"
                  value={form.occurrence_date}
                  onChange={(e) => setForm({ ...form, occurrence_date: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="required">签证名称/事由</Label>
              <Input
                value={form.visa_name}
                onChange={(e) => setForm({ ...form, visa_name: e.target.value })}
                placeholder="输入签证名称或事由"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="required">关联项目</Label>
                <Select value={form.project_id} onValueChange={(v) => setForm({ ...form, project_id: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择项目" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id.toString()}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>办理状态</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择状态" />
                  </SelectTrigger>
                  <SelectContent>
                <SelectItem value="草稿">草稿</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>工程量</Label>
                <Input
                  type="number"
                  value={form.visa_quantity}
                  onChange={(e) => setForm({ ...form, visa_quantity: e.target.value })}
                  placeholder="数量"
                />
              </div>
              <div className="space-y-2">
                <Label>单位</Label>
                <Input
                  value={form.visa_unit}
                  onChange={(e) => setForm({ ...form, visa_unit: e.target.value })}
                  placeholder="单位"
                />
              </div>
              <div className="space-y-2">
                <Label className="required">签证金额</Label>
                <Input
                  type="number"
                  value={form.visa_amount}
                  onChange={(e) => setForm({ ...form, visa_amount: e.target.value })}
                  placeholder="金额"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>办理人</Label>
              <Input
                value={form.handler}
                onChange={(e) => setForm({ ...form, handler: e.target.value })}
                placeholder="办理人姓名"
              />
            </div>
            <div className="space-y-2">
              <Label>备注</Label>
              <Textarea
                value={form.remark}
                onChange={(e) => setForm({ ...form, remark: e.target.value })}
                placeholder="输入备注信息"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>取消</Button>
            <Button onClick={handleSaveEdit} disabled={saving} className="gap-1.5" style={{ background: 'linear-gradient(135deg, #165DFF 0%, #4080FF 100%)' }}>
              {saving && <RefreshCw className="w-4 h-4 animate-spin" />}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 查看签证对话框 */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle style={{ color: '#1D2129' }}>签证详情</DialogTitle>
          </DialogHeader>
          {currentVisa && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm mb-1" style={{ color: '#86909C' }}>签证编号</p>
                  <p className="font-mono font-medium" style={{ color: '#165DFF' }}>{currentVisa.visa_number}</p>
                </div>
                <div>
                  <p className="text-sm mb-1" style={{ color: '#86909C' }}>发生日期</p>
                  <p className="font-medium" style={{ color: '#1D2129' }}>{currentVisa.occurrence_date}</p>
                </div>
              </div>
              <div>
                <p className="text-sm mb-1" style={{ color: '#86909C' }}>签证名称/事由</p>
                <p className="font-medium" style={{ color: '#1D2129' }}>{currentVisa.visa_name}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm mb-1" style={{ color: '#86909C' }}>关联项目</p>
                  <p className="font-medium" style={{ color: '#1D2129' }}>{currentVisa.projects?.name || '-'}</p>
                </div>
                <div>
                  <p className="text-sm mb-1" style={{ color: '#86909C' }}>办理状态</p>
                  <Badge variant="outline" className={`${getStatusStyle(currentVisa.status)} font-medium`}>
                    {currentVisa.status}
                  </Badge>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-sm mb-1" style={{ color: '#86909C' }}>工程量</p>
                  <p className="font-medium" style={{ color: '#1D2129' }}>
                    {currentVisa.visa_quantity ? `${currentVisa.visa_quantity} ${currentVisa.visa_unit || ''}` : '-'}
                  </p>
                </div>
                <div>
                  <p className="text-sm mb-1" style={{ color: '#86909C' }}>签证金额</p>
                  <p className="font-medium" style={{ color: '#722ED1' }}>
                    ¥{parseFloat(currentVisa.visa_amount).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div>
                  <p className="text-sm mb-1" style={{ color: '#86909C' }}>办理人</p>
                  <p className="font-medium" style={{ color: '#1D2129' }}>{currentVisa.handler || '-'}</p>
                </div>
              </div>
              {currentVisa.remark && (
                <div>
                  <p className="text-sm mb-1" style={{ color: '#86909C' }}>备注</p>
                  <p style={{ color: '#4E5969' }}>{currentVisa.remark}</p>
                </div>
              )}

              {/* 审核信息区域 */}
              {(currentVisa.submitted_at || currentVisa.reviewed_at || currentVisa.reject_reason || currentVisa.review_comment) && (
                <div className="border-t pt-4 mt-4">
                  <p className="text-sm font-medium mb-3" style={{ color: '#1D2129' }}>审核信息</p>
                  <div className="space-y-3 p-3 rounded-lg" style={{ background: '#F7F8FA' }}>
                    {currentVisa.submitter_name && (
                      <div className="flex items-center gap-4 text-sm">
                        <span style={{ color: '#86909C' }}>提交人：</span>
                        <span style={{ color: '#1D2129' }}>{currentVisa.submitter_name}</span>
                        {currentVisa.submitted_at && (
                          <span style={{ color: '#86909C' }}>{new Date(currentVisa.submitted_at).toLocaleString('zh-CN')}</span>
                        )}
                      </div>
                    )}
                    {currentVisa.reviewer_name && (
                      <div className="flex items-center gap-4 text-sm">
                        <span style={{ color: '#86909C' }}>审核人：</span>
                        <span style={{ color: '#1D2129' }}>{currentVisa.reviewer_name}</span>
                        {currentVisa.reviewed_at && (
                          <span style={{ color: '#86909C' }}>{new Date(currentVisa.reviewed_at).toLocaleString('zh-CN')}</span>
                        )}
                      </div>
                    )}
                    {currentVisa.review_comment && (
                      <div className="text-sm">
                        <span style={{ color: '#86909C' }}>审核备注：</span>
                        <span style={{ color: '#1D2129' }}>{currentVisa.review_comment}</span>
                      </div>
                    )}
                    {currentVisa.reject_reason && (
                      <div className="text-sm">
                        <span style={{ color: '#F53F3F' }}>驳回原因：</span>
                        <span style={{ color: '#F53F3F' }}>{currentVisa.reject_reason}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
              
              {/* 附件管理区域 */}
              <div className="border-t pt-4 mt-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-medium" style={{ color: '#1D2129' }}>
                    附件列表 {attachments.length > 0 && `(${attachments.length})`}
                  </p>
                  {/* 已提交和已驳回状态可以上传附件 */}
                  {currentVisa?.status === '已提交' || currentVisa?.status === '已驳回' || currentVisa?.status === '已完结' ? (
                    <div>
                      <input
                        type="file"
                        id="visa-attachment-input"
                        multiple
                        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                        onChange={handleFileSelect}
                        className="hidden"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => document.getElementById('visa-attachment-input')?.click()}
                        disabled={uploading}
                      >
                        {uploading ? '上传中...' : '+ 上传附件'}
                      </Button>
                    </div>
                  ) : null}
                </div>
                
                {loadingAttachments ? (
                  <div className="text-center py-4 text-sm" style={{ color: '#86909C' }}>加载附件...</div>
                ) : attachments.length === 0 ? (
                  <div className="text-center py-6 text-sm" style={{ color: '#86909C', background: '#F7F8FA', borderRadius: '8px' }}>
                    暂无附件，点击上方按钮上传
                  </div>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {attachments.map((att) => (
                      <div key={att.id} className="flex items-center justify-between p-2 rounded-lg" style={{ background: '#F7F8FA' }}>
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <FileText className="w-4 h-4 flex-shrink-0" style={{ color: getFileColor(att.file_type) }} />
                          <span className="text-sm truncate" style={{ color: '#4E5969' }}>{att.file_name}</span>
                          <span className="text-xs flex-shrink-0" style={{ color: '#86909C' }}>{formatFileSize(att.file_size)}</span>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <Button variant="ghost" size="sm" onClick={() => handlePreview(att)}>预览</Button>
                          <Button variant="ghost" size="sm" onClick={() => handleDownload(att)}>下载</Button>
                          {/* 已提交、已驳回、已完结、已结算状态可以删除附件 */}
                          {(currentVisa?.status === '已提交' || currentVisa?.status === '已驳回' || currentVisa?.status === '已完结' || currentVisa?.status === '已结算') && (
                            <Button variant="ghost" size="sm" className="text-red-500" onClick={() => handleDeleteAttachment(att.id)}>删除</Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewDialogOpen(false)}>关闭</Button>
            {/* 待办理、已提交、已完结、已结算状态：可以编辑 */}
            {(currentVisa?.status === '待办理' || currentVisa?.status === '已提交' || currentVisa?.status === '已完结' || currentVisa?.status === '已结算') && (
              <>
                <Button variant="outline" onClick={() => { setViewDialogOpen(false); handleEdit(currentVisa); }}>
                  编辑
                </Button>
                <Button variant="outline" onClick={() => { setViewDialogOpen(false); handleReview(currentVisa); }} style={{ color: '#F53F3F' }}>
                  驳回
                </Button>
                <Button onClick={() => { setViewDialogOpen(false); handleReview(currentVisa); }} style={{ background: 'linear-gradient(135deg, #165DFF 0%, #4080FF 100%)' }}>
                  审核通过
                </Button>
              </>
            )}
            {/* 已驳回、已完结状态：可以编辑 */}
            {(currentVisa?.status === '已驳回' || currentVisa?.status === '已完结') && (
              <Button variant="outline" onClick={() => { setViewDialogOpen(false); handleEdit(currentVisa); }}>
                编辑
              </Button>
            )}
            {/* 审核通过状态：可以结算 */}
            {currentVisa?.status === '审核通过' && (
              <Button onClick={() => { setViewDialogOpen(false); handleSettle(currentVisa); }} style={{ background: 'linear-gradient(135deg, #00B42A 0%, #23AF41 100%)' }}>
                确认结算
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认对话框 */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5" style={{ color: '#F53F3F' }} />
              确认删除
            </AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除签证 <strong>{currentVisa?.visa_number}</strong> 吗？此操作不可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={saving}
              className="bg-red-500 hover:bg-red-600"
            >
              {saving ? '删除中...' : '确认删除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 审核对话框 */}
      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle style={{ color: '#1D2129' }}>审核签证</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-4 rounded-lg" style={{ background: '#F7F8FA' }}>
              <p className="text-sm mb-2" style={{ color: '#86909C' }}>签证信息</p>
              <p className="font-mono font-medium mb-1" style={{ color: '#165DFF' }}>{currentVisa?.visa_number}</p>
              <p className="text-sm" style={{ color: '#4E5969' }}>{currentVisa?.visa_name}</p>
              <p className="text-lg font-medium mt-2" style={{ color: '#722ED1' }}>
                ¥{currentVisa ? parseFloat(currentVisa.visa_amount).toLocaleString('zh-CN', { minimumFractionDigits: 2 }) : '0.00'}
              </p>
            </div>
            <div className="space-y-2">
              <Label>审核备注（可选）</Label>
              <Textarea
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                placeholder="输入审核备注"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleReject} style={{ color: '#F53F3F', borderColor: '#F53F3F' }}>
              驳回
            </Button>
            <Button onClick={handleApprove} disabled={saving} style={{ background: 'linear-gradient(135deg, #165DFF 0%, #4080FF 100%)' }}>
              {saving ? '处理中...' : '审核通过'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 驳回对话框 */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle style={{ color: '#1D2129' }}>驳回签证</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-4 rounded-lg" style={{ background: '#FFF2F0' }}>
              <p className="text-sm mb-2" style={{ color: '#F53F3F' }}>签证信息</p>
              <p className="font-mono font-medium mb-1" style={{ color: '#165DFF' }}>{currentVisa?.visa_number}</p>
              <p className="text-sm" style={{ color: '#4E5969' }}>{currentVisa?.visa_name}</p>
            </div>
            <div className="space-y-2">
              <Label className="required">驳回原因</Label>
              <Textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="请输入驳回原因，以便提交人修改后重新提交"
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>取消</Button>
            <Button onClick={handleConfirmReject} disabled={saving || !rejectReason.trim()} className="bg-red-500 hover:bg-red-600">
              {saving ? '驳回中...' : '确认驳回'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
