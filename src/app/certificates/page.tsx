'use client';
import { useToast } from '@/hooks/use-toast';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
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
  FileCheck, Clock, AlertCircle, CheckCircle2, Building2, User,
  Plus, Pencil, Trash2, Search, RefreshCw, Eye,
  ChevronLeft, ChevronRight, Download, CreditCard, Paperclip, X, FileIcon, Image as ImageIcon, Upload
} from 'lucide-react';
import { AnimatedNumber } from '@/components/ui/animated-number';

// 类型定义
interface Attachment {
  key: string;
  name: string;
  size: number;
  type: string;
  uploadedAt: string;
}

interface Certificate {
  id: number;
  name: string;
  certificate_number: string;
  owner_type: string;
  owner_name: string;
  issue_date: string;
  expiry_date: string;
  remark: string | null;
  created_at: string;
  status: 'normal' | 'expiring' | 'expired';
  attachments: Attachment[];
}

interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

interface Stats {
  totalCount: number;
  companyCount: number;
  personnelCount: number;
  expiringCount: number;
  expiredCount: number;
  normalCount: number;
}

export default function CertificatesPage() {
  const { toast } = useToast();
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showContent, setShowContent] = useState(false);
  const [stats, setStats] = useState<Stats>({
    totalCount: 0,
    companyCount: 0,
    personnelCount: 0,
    expiringCount: 0,
    expiredCount: 0,
    normalCount: 0,
  });
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    pageSize: 10,
    total: 0,
    totalPages: 0,
  });

  // 筛选条件
  const [searchKeyword, setSearchKeyword] = useState('');
  const [selectedOwnerType, setSelectedOwnerType] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');

  // 对话框状态
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [currentCertificate, setCurrentCertificate] = useState<Certificate | null>(null);
  const [saving, setSaving] = useState(false);

  // 表单数据
  const [form, setForm] = useState({
    name: '',
    certificateNumber: '',
    ownerType: 'company',
    ownerName: '',
    issueDate: '',
    expiryDate: '',
    remark: '',
  });

  // 附件相关状态
  const [formAttachments, setFormAttachments] = useState<Attachment[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState<string>('');
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<string, string>>({});
  const [listThumbnailUrls, setListThumbnailUrls] = useState<Record<string, string>>({});

  // 加载列表中图片附件的缩略图
  const loadListThumbnails = async (certificates: Certificate[]) => {
    const urls: Record<string, string> = {};
    const promises: Promise<void>[] = [];
    for (const cert of certificates) {
      if (cert.attachments && cert.attachments.length > 0) {
        for (const att of cert.attachments) {
          if (isImageFile(att.name) && !listThumbnailUrls[att.key] && !urls[att.key]) {
            promises.push(
              fetch('/api/certificates/attachment-url', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: att.key, expireTime: 3600 }),
              })
                .then(res => res.json())
                .then(data => { if (data.url) urls[att.key] = data.url; })
                .catch(() => {})
            );
          }
        }
      }
    }
    await Promise.all(promises);
    if (Object.keys(urls).length > 0) {
      setListThumbnailUrls(prev => ({ ...prev, ...urls }));
    }
  };

  useEffect(() => {
    fetchCertificates();
  }, []);

  useEffect(() => {
    if (!loading) {
      const timer = setTimeout(() => setShowContent(true), 50);
      return () => clearTimeout(timer);
    }
  }, [loading]);

  // 监听筛选条件变化
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchCertificates(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchKeyword, selectedOwnerType, selectedStatus]);

  const fetchCertificates = async (page = pagination.page) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedOwnerType !== 'all') params.append('ownerType', selectedOwnerType);
      if (selectedStatus !== 'all') params.append('status', selectedStatus);
      if (searchKeyword) params.append('keyword', searchKeyword);
      params.append('page', page.toString());
      params.append('pageSize', pagination.pageSize.toString());

      const res = await fetch(`/api/certificates?${params.toString()}`);
      const data = await res.json();

      if (res.ok) {
        const certs = data.certificates || [];
        setCertificates(certs);
        setPagination(data.pagination);
        setStats(data.stats);
        // 后台加载列表缩略图
        loadListThumbnails(certs);
      } else {
        throw new Error(data.error);
      }
    } catch (error: any) {
      console.error('获取证件失败:', error);
      toast({
        title: '获取失败',
        description: error.message || '获取证件列表失败',
        variant: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  // 导出证件数据
  const handleExport = () => {
    const headers = ['证件名称', '证件编号', '归属类型', '关联名称', '发证日期', '到期日期', '状态', '附件数', '备注'];
    const rows = certificates.map(c => [
      c.name,
      c.certificate_number,
      c.owner_type === 'company' ? '公司证件' : '人员证件',
      c.owner_name,
      c.issue_date,
      c.expiry_date,
      c.status === 'normal' ? '正常' : c.status === 'expiring' ? '即将到期' : '已过期',
      c.attachments?.length || 0,
      c.remark || '',
    ]);
    
    const csvContent = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `证件数据_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    
    toast({
      title: '导出成功',
      description: `已导出 ${certificates.length} 条证件数据`,
    });
  };

  // 重置筛选
  const handleReset = () => {
    setSearchKeyword('');
    setSelectedOwnerType('all');
    setSelectedStatus('all');
  };

  // 格式化文件大小
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // 上传附件
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, certificateId?: number) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadingFile(true);
    try {
      for (const file of Array.from(files)) {
        // 限制文件大小 20MB
        if (file.size > 20 * 1024 * 1024) {
          toast({ title: '文件过大', description: `${file.name} 超过20MB限制`, variant: 'error' });
          continue;
        }

        const formData = new FormData();
        formData.append('file', file);
        if (certificateId) {
          formData.append('certificateId', certificateId.toString());
        }

        const res = await fetch('/api/certificates/upload', {
          method: 'POST',
          body: formData,
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        // 无论有无 certificateId，都更新 formAttachments 状态
        setFormAttachments(prev => [...prev, data.attachment]);
        // 如果是图片，立即加载缩略图URL
        if (isImageFile(file.name) && data.attachment?.key) {
          try {
            const urlRes = await fetch('/api/certificates/attachment-url', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ key: data.attachment.key, expireTime: 3600 }),
            });
            const urlData = await urlRes.json();
            if (urlRes.ok && urlData.url) {
              setThumbnailUrls(prev => ({ ...prev, [data.attachment.key]: urlData.url }));
            }
          } catch { /* ignore */ }
        }
      }

      if (certificateId) {
        fetchCertificates(pagination.page);
      }

      toast({ title: '上传成功', description: '附件已上传' });
    } catch (error: any) {
      toast({ title: '上传失败', description: error.message || '附件上传失败', variant: 'error' });
    } finally {
      setUploadingFile(false);
      // 重置 input
      e.target.value = '';
    }
  };

  // 删除附件
  const handleDeleteAttachment = async (attachmentKey: string, certificateId?: number) => {
    try {
      if (certificateId) {
        const res = await fetch('/api/certificates/attachment', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ certificateId, attachmentKey }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
      }
      // 始终更新 formAttachments 状态
      setFormAttachments(prev => prev.filter(a => a.key !== attachmentKey));
      // 清理缩略图缓存
      setThumbnailUrls(prev => {
        const next = { ...prev };
        delete next[attachmentKey];
        return next;
      });
      toast({ title: '删除成功', description: '附件已删除' });
    } catch (error: any) {
      toast({ title: '删除失败', description: error.message || '删除附件失败', variant: 'error' });
    }
  };

  // 预览/下载附件
  const handlePreviewAttachment = async (attachmentKey: string, fileName: string) => {
    try {
      const res = await fetch('/api/certificates/attachment-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: attachmentKey, expireTime: 3600 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      // 判断是否为图片类型，直接预览
      const isImage = /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(fileName);
      if (isImage) {
        setPreviewUrl(data.url);
        setPreviewName(fileName);
      } else {
        // 非图片文件，下载
        const response = await fetch(data.url);
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = fileName;
        link.click();
        window.URL.revokeObjectURL(blobUrl);
      }
    } catch (error: any) {
      toast({ title: '获取文件失败', description: error.message || '无法预览文件', variant: 'error' });
    }
  };

  // 获取文件图标
  const getFileIcon = (fileName: string) => {
    const isImage = /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(fileName);
    if (isImage) return <ImageIcon className="w-4 h-4" style={{ color: '#165DFF' }} />;
    return <FileIcon className="w-4 h-4" style={{ color: '#86909C' }} />;
  };

  // 判断是否为图片文件
  const isImageFile = (fileName: string) => {
    return /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(fileName);
  };

  // 加载附件缩略图URL
  const loadThumbnailUrls = async (attachments: Attachment[]) => {
    const imageAttachments = attachments.filter(att => isImageFile(att.name));
    if (imageAttachments.length === 0) return;

    const urls: Record<string, string> = {};
    await Promise.all(imageAttachments.map(async (att) => {
      try {
        const res = await fetch('/api/certificates/attachment-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: att.key, expireTime: 3600 }),
        });
        const data = await res.json();
        if (res.ok && data.url) {
          urls[att.key] = data.url;
        }
      } catch { /* ignore */ }
    }));
    setThumbnailUrls(prev => ({ ...prev, ...urls }));
  };

  // 分页
  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= pagination.totalPages) {
      fetchCertificates(newPage);
    }
  };

  // 打开新增对话框
  const handleAdd = () => {
    setForm({
      name: '',
      certificateNumber: '',
      ownerType: 'company',
      ownerName: '',
      issueDate: '',
      expiryDate: '',
      remark: '',
    });
    setFormAttachments([]);
    setAddDialogOpen(true);
  };

  // 打开编辑对话框
  const handleEdit = (cert: Certificate) => {
    setCurrentCertificate(cert);
    setForm({
      name: cert.name,
      certificateNumber: cert.certificate_number,
      ownerType: cert.owner_type,
      ownerName: cert.owner_name,
      issueDate: cert.issue_date,
      expiryDate: cert.expiry_date,
      remark: cert.remark || '',
    });
    setFormAttachments(cert.attachments || []);
    setEditDialogOpen(true);
    // 加载图片附件的缩略图
    if (cert.attachments && cert.attachments.length > 0) {
      loadThumbnailUrls(cert.attachments);
    }
  };

  // 打开查看对话框
  const handleView = (cert: Certificate) => {
    setCurrentCertificate(cert);
    setViewDialogOpen(true);
    // 加载图片附件的缩略图
    if (cert.attachments && cert.attachments.length > 0) {
      loadThumbnailUrls(cert.attachments);
    }
  };

  // 打开删除确认对话框
  const handleDeleteConfirm = (cert: Certificate) => {
    setCurrentCertificate(cert);
    setDeleteDialogOpen(true);
  };

  // 保存新增
  const handleSaveAdd = async () => {
    if (!form.name || !form.certificateNumber || !form.ownerType || !form.ownerName || !form.issueDate || !form.expiryDate) {
      toast({
        title: '验证失败',
        description: '请填写所有必填项',
        variant: 'error',
      });
      return;
    }

    if (new Date(form.expiryDate) <= new Date(form.issueDate)) {
      toast({
        title: '验证失败',
        description: '到期日期必须晚于发证日期',
        variant: 'error',
      });
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/certificates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, attachments: formAttachments }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      toast({
        title: '创建成功',
        description: '证件已成功创建',
      });
      setAddDialogOpen(false);
      fetchCertificates(1);
    } catch (error: any) {
      toast({
        title: '创建失败',
        description: error.message || '创建证件失败',
        variant: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  // 保存编辑
  const handleSaveEdit = async () => {
    if (!currentCertificate || !form.name || !form.certificateNumber || !form.ownerType || !form.ownerName || !form.issueDate || !form.expiryDate) {
      toast({
        title: '验证失败',
        description: '请填写所有必填项',
        variant: 'error',
      });
      return;
    }

    if (new Date(form.expiryDate) <= new Date(form.issueDate)) {
      toast({
        title: '验证失败',
        description: '到期日期必须晚于发证日期',
        variant: 'error',
      });
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/certificates/${currentCertificate.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, attachments: formAttachments }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      toast({
        title: '更新成功',
        description: '证件已成功更新',
      });
      setEditDialogOpen(false);
      fetchCertificates(pagination.page);
    } catch (error: any) {
      toast({
        title: '更新失败',
        description: error.message || '更新证件失败',
        variant: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  // 删除证件
  const handleDelete = async () => {
    if (!currentCertificate) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/certificates/${currentCertificate.id}`, {
        method: 'DELETE',
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      toast({
        title: '删除成功',
        description: '证件已成功删除',
      });
      setDeleteDialogOpen(false);
      fetchCertificates(pagination.page);
    } catch (error: any) {
      toast({
        title: '删除失败',
        description: error.message || '删除证件失败',
        variant: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  // 获取状态样式
  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'expired':
        return 'bg-red-50 text-red-600 border-red-200';
      case 'expiring':
        return 'bg-amber-50 text-amber-600 border-amber-200';
      default:
        return 'bg-green-50 text-green-600 border-green-200';
    }
  };

  // 获取状态文本
  const getStatusText = (status: string) => {
    switch (status) {
      case 'expired':
        return '已过期';
      case 'expiring':
        return '即将到期';
      default:
        return '正常';
    }
  };

  // 获取状态图标
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'expired':
        return <AlertCircle className="w-3.5 h-3.5" style={{ color: '#F53F3F' }} />;
      case 'expiring':
        return <Clock className="w-3.5 h-3.5" style={{ color: '#FF7D00' }} />;
      default:
        return <CheckCircle2 className="w-3.5 h-3.5" style={{ color: '#00B42A' }} />;
    }
  };

  // 计算剩余天数
  const getRemainingDays = (expiryDate: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiry = new Date(expiryDate);
    expiry.setHours(0, 0, 0, 0);
    const diffTime = expiry.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  return (
    <div className="space-y-5">
      {/* 顶部操作栏 */}
      <div className={`flex items-center justify-between transition-all duration-500 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
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
            新增证件
          </Button>
          <Button
            variant="outline"
            onClick={handleExport}
            className="gap-2 h-9 px-4"
            style={{ borderColor: '#E5E6EB', color: '#4E5969' }}
          >
            <Download className="w-4 h-4" />
            导出证件数据
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
            onClick={() => setSelectedStatus('normal')}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
              selectedStatus === 'normal' 
                ? 'bg-green-500 text-white shadow-md' 
                : 'bg-green-50 text-green-600 hover:bg-green-100'
            }`}
          >
            正常
          </button>
          <button
            onClick={() => setSelectedStatus('expiring')}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
              selectedStatus === 'expiring' 
                ? 'bg-amber-500 text-white shadow-md' 
                : 'bg-amber-50 text-amber-600 hover:bg-amber-100'
            }`}
          >
            即将到期
            {stats.expiringCount > 0 && selectedStatus !== 'expiring' && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-xs bg-amber-500 text-white">
                {stats.expiringCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setSelectedStatus('expired')}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
              selectedStatus === 'expired' 
                ? 'bg-red-500 text-white shadow-md' 
                : 'bg-red-50 text-red-600 hover:bg-red-100'
            }`}
          >
            已过期
            {stats.expiredCount > 0 && selectedStatus !== 'expired' && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-xs bg-red-500 text-white animate-pulse">
                {stats.expiredCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* 数据概览区域 */}
      <div className={`grid grid-cols-12 gap-4 transition-all duration-500 delay-100 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
        {/* 左侧大卡片 - 证件概览 */}
        <Card className="col-span-12 lg:col-span-5 hover:shadow-lg transition-all duration-300" style={{ background: '#FFFFFF', border: '1px solid #E5E6EB' }}>
          <CardContent className="pt-6 pb-6">
            <div className="flex items-center gap-2 mb-5">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #165DFF 0%, #4080FF 100%)' }}>
                <CreditCard className="w-5 h-5 text-white" />
              </div>
              <span className="text-base font-semibold" style={{ color: '#1D2129' }}>证件概览</span>
            </div>
            
            <div className="grid grid-cols-3 gap-6">
              <div>
                <p className="text-sm mb-2" style={{ color: '#86909C' }}>证件总数</p>
                <p className="text-3xl font-bold" style={{ color: '#165DFF' }}>{stats.totalCount}</p>
              </div>
              <div>
                <p className="text-sm mb-2" style={{ color: '#86909C' }}>公司证件</p>
                <p className="text-3xl font-bold" style={{ color: '#1D2129' }}>{stats.companyCount}</p>
              </div>
              <div>
                <p className="text-sm mb-2" style={{ color: '#86909C' }}>人员证件</p>
                <p className="text-3xl font-bold" style={{ color: '#722ED1' }}>{stats.personnelCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 右侧四个小统计卡片 */}
        <div className="col-span-12 lg:col-span-7 grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 证件总数 */}
          <Card 
            className="group hover:shadow-lg hover:-translate-y-1 transition-all duration-300 cursor-pointer" 
            style={{ background: '#FFFFFF', border: '1px solid #E5E6EB' }}
            onClick={() => { setSelectedOwnerType('all'); setSelectedStatus('all'); }}
          >
            <CardContent className="pt-5 pb-5">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#E8F3FF' }}>
                  <FileCheck className="w-5 h-5" style={{ color: '#165DFF' }} />
                </div>
              </div>
              <p className="text-3xl font-bold" style={{ color: '#165DFF' }}>{stats.totalCount}</p>
              <p className="text-sm mt-1" style={{ color: '#86909C' }}>证件总数</p>
            </CardContent>
          </Card>

          {/* 公司证件 */}
          <Card 
            className={`group hover:shadow-lg hover:-translate-y-1 transition-all duration-300 cursor-pointer ${selectedOwnerType === 'company' ? 'ring-2 ring-blue-400' : ''}`} 
            style={{ background: '#FFFFFF', border: '1px solid #E5E6EB' }}
            onClick={() => setSelectedOwnerType(selectedOwnerType === 'company' ? 'all' : 'company')}
          >
            <CardContent className="pt-5 pb-5">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#E8FFEA' }}>
                  <Building2 className="w-5 h-5" style={{ color: '#00B42A' }} />
                </div>
              </div>
              <p className="text-3xl font-bold" style={{ color: '#00B42A' }}>{stats.companyCount}</p>
              <p className="text-sm mt-1" style={{ color: '#86909C' }}>公司证件</p>
              <p className="text-xs mt-1 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: '#00B42A' }}>点击筛选 →</p>
            </CardContent>
          </Card>

          {/* 即将到期 */}
          <Card 
            className={`group hover:shadow-lg hover:-translate-y-1 transition-all duration-300 cursor-pointer ${selectedStatus === 'expiring' ? 'ring-2 ring-amber-400' : ''}`} 
            style={{ background: '#FFFFFF', border: '1px solid #E5E6EB' }}
            onClick={() => setSelectedStatus(selectedStatus === 'expiring' ? 'all' : 'expiring')}
          >
            <CardContent className="pt-5 pb-5">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#FFF7E8' }}>
                  <Clock className="w-5 h-5" style={{ color: '#FF7D00' }} />
                </div>
                {stats.expiringCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-600">
                    需关注
                  </span>
                )}
              </div>
              <p className="text-3xl font-bold" style={{ color: '#FF7D00' }}>{stats.expiringCount}</p>
              <p className="text-sm mt-1" style={{ color: '#86909C' }}>即将到期</p>
              <p className="text-xs mt-1 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: '#FF7D00' }}>点击查看 →</p>
            </CardContent>
          </Card>

          {/* 已过期 */}
          <Card 
            className={`group hover:shadow-lg hover:-translate-y-1 transition-all duration-300 cursor-pointer ${selectedStatus === 'expired' ? 'ring-2 ring-red-400' : ''}`} 
            style={{ background: '#FFFFFF', border: '1px solid #E5E6EB' }}
            onClick={() => setSelectedStatus(selectedStatus === 'expired' ? 'all' : 'expired')}
          >
            <CardContent className="pt-5 pb-5">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#FFECE8' }}>
                  <AlertCircle className="w-5 h-5" style={{ color: '#F53F3F' }} />
                </div>
                {stats.expiredCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-600 animate-pulse">
                    需处理
                  </span>
                )}
              </div>
              <p className="text-3xl font-bold" style={{ color: '#F53F3F' }}>{stats.expiredCount}</p>
              <p className="text-sm mt-1" style={{ color: '#86909C' }}>已过期</p>
              <p className="text-xs mt-1 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: '#F53F3F' }}>点击查看 →</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* 证件列表区域 */}
      <div id="certificate-list-section" className={`transition-all duration-500 delay-300 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
        <Card style={{ background: '#FFFFFF', border: '1px solid #E5E6EB' }}>
          {/* 筛选区域 */}
          <CardContent className="pt-4 pb-3 border-b" style={{ borderColor: '#E5E6EB' }}>
            <div className="flex flex-wrap items-center gap-3">
              {/* 当前筛选状态提示 */}
              {(selectedStatus !== 'all' || selectedOwnerType !== 'all') && (
                <div className="w-full mb-2 flex items-center gap-2">
                  <span className="text-xs" style={{ color: '#86909C' }}>当前筛选：</span>
                  {selectedOwnerType !== 'all' && (
                    <Badge variant="outline" className="text-xs gap-1" style={{ borderColor: '#165DFF', color: '#165DFF' }}>
                      {selectedOwnerType === 'company' ? '公司证件' : '人员证件'}
                      <button onClick={() => setSelectedOwnerType('all')} className="ml-1 hover:bg-blue-100 rounded-full p-0.5">×</button>
                    </Badge>
                  )}
                  {selectedStatus !== 'all' && (
                    <Badge variant="outline" className="text-xs gap-1" style={{ borderColor: selectedStatus === 'expired' ? '#F53F3F' : '#FF7D00', color: selectedStatus === 'expired' ? '#F53F3F' : '#FF7D00' }}>
                      {getStatusText(selectedStatus)}
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
                  placeholder="搜索证件名称/编号..."
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                  className="w-48 h-8"
                />
              </div>
              
              <Select value={selectedOwnerType} onValueChange={setSelectedOwnerType}>
                <SelectTrigger className="w-32 h-8">
                  <SelectValue placeholder="证件类型" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部类型</SelectItem>
                  <SelectItem value="company">公司证件</SelectItem>
                  <SelectItem value="personnel">人员证件</SelectItem>
                </SelectContent>
              </Select>

              <div className="flex items-center gap-2 ml-auto">
                <Button variant="ghost" size="sm" onClick={handleReset} className="h-8">
                  重置
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchCertificates(pagination.page)}
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
                  <TableHead className="font-medium h-10" style={{ color: '#86909C' }}>证件名称</TableHead>
                  <TableHead className="font-medium" style={{ color: '#86909C' }}>证件编号</TableHead>
                  <TableHead className="font-medium text-center" style={{ color: '#86909C' }}>归属类型</TableHead>
                  <TableHead className="font-medium" style={{ color: '#86909C' }}>关联名称</TableHead>
                  <TableHead className="font-medium text-center" style={{ color: '#86909C' }}>发证日期</TableHead>
                  <TableHead className="font-medium text-center" style={{ color: '#86909C' }}>到期日期</TableHead>
                  <TableHead className="font-medium text-center" style={{ color: '#86909C' }}>状态</TableHead>
                  <TableHead className="font-medium text-center" style={{ color: '#86909C' }}>附件</TableHead>
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
                ) : certificates.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-12">
                      <div className="flex flex-col items-center gap-2" style={{ color: '#86909C' }}>
                        <CreditCard className="w-10 h-10 opacity-30" />
                        <span>暂无证件数据</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  certificates.map((cert) => {
                    const remainingDays = getRemainingDays(cert.expiry_date);
                    return (
                    <TableRow 
                      key={cert.id} 
                      className={`hover:bg-blue-50/50 transition-colors ${
                        cert.status === 'expired' ? 'bg-red-50/30' : 
                        cert.status === 'expiring' ? 'bg-amber-50/30' : ''
                      }`}
                    >
                      <TableCell className="font-medium max-w-[150px] truncate py-3" style={{ color: '#1D2129' }}>
                        {cert.name}
                      </TableCell>
                      <TableCell className="font-mono text-sm py-3" style={{ color: '#165DFF' }}>
                        {cert.certificate_number}
                      </TableCell>
                      <TableCell className="text-center py-3">
                        <div className="flex items-center justify-center gap-1">
                          {cert.owner_type === 'company' ? (
                            <Building2 className="w-3.5 h-3.5" style={{ color: '#00B42A' }} />
                          ) : (
                            <User className="w-3.5 h-3.5" style={{ color: '#722ED1' }} />
                          )}
                          <span className="text-sm" style={{ color: '#4E5969' }}>
                            {cert.owner_type === 'company' ? '公司' : '人员'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="py-3">
                        <span className="text-sm truncate max-w-[100px] block" style={{ color: '#4E5969' }}>
                          {cert.owner_name}
                        </span>
                      </TableCell>
                      <TableCell className="text-center text-sm py-3" style={{ color: '#4E5969' }}>
                        {cert.issue_date}
                      </TableCell>
                      <TableCell className="text-center text-sm py-3" style={{ color: '#4E5969' }}>
                        <div className="flex flex-col items-center">
                          <span>{cert.expiry_date}</span>
                          {cert.status !== 'normal' && (
                            <span className="text-xs mt-0.5" style={{ color: cert.status === 'expired' ? '#F53F3F' : '#FF7D00' }}>
                              {remainingDays < 0 ? `已过期${Math.abs(remainingDays)}天` : `剩余${remainingDays}天`}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center py-3">
                        <Badge variant="outline" className={`${getStatusStyle(cert.status)} font-medium`}>
                          {getStatusText(cert.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center py-2">
                        {(cert.attachments && cert.attachments.length > 0) ? (
                          <div className="flex items-center justify-center gap-1 cursor-pointer" onClick={() => handleView(cert)}>
                            {cert.attachments.filter(att => isImageFile(att.name)).slice(0, 2).map((att, idx) => (
                              <div key={att.key} className="relative w-8 h-8 rounded overflow-hidden border border-gray-200 bg-gray-50 flex-shrink-0">
                                {listThumbnailUrls[att.key] ? (
                                  <img src={listThumbnailUrls[att.key]} alt={att.name} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center">
                                    <ImageIcon className="w-3 h-3 text-gray-300" />
                                  </div>
                                )}
                              </div>
                            ))}
                            {cert.attachments.filter(att => isImageFile(att.name)).length === 0 && (
                              <Paperclip className="w-3.5 h-3.5" style={{ color: '#165DFF' }} />
                            )}
                            {cert.attachments.length > 2 && (
                              <span className="text-xs" style={{ color: '#165DFF' }}>+{cert.attachments.length - 2}</span>
                            )}
                            {cert.attachments.length <= 2 && cert.attachments.filter(att => isImageFile(att.name)).length === 0 && (
                              <span className="text-xs" style={{ color: '#165DFF' }}>{cert.attachments.length}</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs" style={{ color: '#C9CDD4' }}>-</span>
                        )}
                      </TableCell>
                      <TableCell className="py-3">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleView(cert)}
                            className="h-7 w-7 p-0"
                            title="查看"
                          >
                            <Eye className="w-3.5 h-3.5" style={{ color: '#165DFF' }} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(cert)}
                            className="h-7 w-7 p-0"
                            title="编辑"
                          >
                            <Pencil className="w-3.5 h-3.5" style={{ color: '#FF7D00' }} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteConfirm(cert)}
                            className="h-7 w-7 p-0"
                            title="删除"
                          >
                            <Trash2 className="w-3.5 h-3.5" style={{ color: '#F53F3F' }} />
                          </Button>
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

      {/* 新增证件对话框 */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-[560px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle style={{ color: '#1D2129' }}>新增证件</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="required">证件名称</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="如：营业执照、安全员C证"
                />
              </div>
              <div className="space-y-2">
                <Label className="required">证件编号</Label>
                <Input
                  value={form.certificateNumber}
                  onChange={(e) => setForm({ ...form, certificateNumber: e.target.value })}
                  placeholder="证件编号"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="required">归属类型</Label>
                <Select value={form.ownerType} onValueChange={(v) => setForm({ ...form, ownerType: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择归属类型" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="company">公司证件</SelectItem>
                    <SelectItem value="personnel">人员证件</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="required">关联名称</Label>
                <Input
                  value={form.ownerName}
                  onChange={(e) => setForm({ ...form, ownerName: e.target.value })}
                  placeholder="公司名或人员姓名"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="required">发证日期</Label>
                <Input
                  type="date"
                  value={form.issueDate}
                  onChange={(e) => setForm({ ...form, issueDate: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label className="required">到期日期</Label>
                <Input
                  type="date"
                  value={form.expiryDate}
                  onChange={(e) => setForm({ ...form, expiryDate: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>备注说明</Label>
              <Textarea
                value={form.remark}
                onChange={(e) => setForm({ ...form, remark: e.target.value })}
                placeholder="输入备注信息"
                rows={3}
              />
            </div>
            {/* 附件上传区域 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>附件</Label>
                <label className="cursor-pointer">
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => handleFileUpload(e)}
                    disabled={uploadingFile}
                  />
                  <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md hover:bg-blue-50 transition-colors" style={{ color: '#165DFF' }}>
                    <Upload className="w-3.5 h-3.5" />
                    {uploadingFile ? '上传中...' : '上传文件'}
                  </span>
                </label>
              </div>
              {formAttachments.length > 0 ? (
                <div className="space-y-2">
                  {/* 图片附件缩略图网格 */}
                  {formAttachments.filter(att => isImageFile(att.name)).length > 0 && (
                    <div className="grid grid-cols-4 gap-2">
                      {formAttachments.filter(att => isImageFile(att.name)).map((att) => (
                        <div key={att.key} className="relative group rounded-lg overflow-hidden border border-gray-200 hover:border-blue-400 transition-colors">
                          {thumbnailUrls[att.key] ? (
                            <img
                              src={thumbnailUrls[att.key]}
                              alt={att.name}
                              className="w-full h-20 object-cover"
                            />
                          ) : (
                            <div className="w-full h-20 flex items-center justify-center bg-gray-50">
                              <ImageIcon className="w-6 h-6" style={{ color: '#C9CDD4' }} />
                            </div>
                          )}
                          <button
                            className="absolute top-1 right-1 h-5 w-5 p-0 rounded-full bg-white/80 hover:bg-white shadow-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => handleDeleteAttachment(att.key)}
                            type="button"
                          >
                            <X className="w-3 h-3" style={{ color: '#F53F3F' }} />
                          </button>
                          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/40 to-transparent px-1 py-0.5">
                            <p className="text-[10px] text-white truncate">{att.name}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* 非图片附件列表 */}
                  {formAttachments.filter(att => !isImageFile(att.name)).map((att) => (
                    <div key={att.key} className="flex items-center gap-2 p-2 rounded-md bg-gray-50 group hover:bg-gray-100 transition-colors">
                      {getFileIcon(att.name)}
                      <span className="text-sm flex-1 truncate" style={{ color: '#1D2129' }}>{att.name}</span>
                      <span className="text-xs" style={{ color: '#86909C' }}>{formatFileSize(att.size)}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => handleDeleteAttachment(att.key)}
                      >
                        <X className="w-3.5 h-3.5" style={{ color: '#F53F3F' }} />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-4 rounded-md border border-dashed" style={{ borderColor: '#E5E6EB', color: '#86909C' }}>
                  <Paperclip className="w-6 h-6 mx-auto mb-1 opacity-40" />
                  <p className="text-xs">暂无附件，点击上方按钮上传</p>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>取消</Button>
            <Button onClick={handleSaveAdd} disabled={saving} className="gap-1.5" style={{ background: 'linear-gradient(135deg, #165DFF 0%, #4080FF 100%)' }}>
              {saving && <RefreshCw className="w-4 h-4 animate-spin" />}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 编辑证件对话框 */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-[560px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle style={{ color: '#1D2129' }}>编辑证件</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="required">证件名称</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="如：营业执照、安全员C证"
                />
              </div>
              <div className="space-y-2">
                <Label className="required">证件编号</Label>
                <Input
                  value={form.certificateNumber}
                  onChange={(e) => setForm({ ...form, certificateNumber: e.target.value })}
                  placeholder="证件编号"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="required">归属类型</Label>
                <Select value={form.ownerType} onValueChange={(v) => setForm({ ...form, ownerType: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择归属类型" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="company">公司证件</SelectItem>
                    <SelectItem value="personnel">人员证件</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="required">关联名称</Label>
                <Input
                  value={form.ownerName}
                  onChange={(e) => setForm({ ...form, ownerName: e.target.value })}
                  placeholder="公司名或人员姓名"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="required">发证日期</Label>
                <Input
                  type="date"
                  value={form.issueDate}
                  onChange={(e) => setForm({ ...form, issueDate: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label className="required">到期日期</Label>
                <Input
                  type="date"
                  value={form.expiryDate}
                  onChange={(e) => setForm({ ...form, expiryDate: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>备注说明</Label>
              <Textarea
                value={form.remark}
                onChange={(e) => setForm({ ...form, remark: e.target.value })}
                placeholder="输入备注信息"
                rows={3}
              />
            </div>
            {/* 附件上传区域 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>附件</Label>
                <label className="cursor-pointer">
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => currentCertificate ? handleFileUpload(e, currentCertificate.id) : handleFileUpload(e)}
                    disabled={uploadingFile}
                  />
                  <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md hover:bg-blue-50 transition-colors" style={{ color: '#165DFF' }}>
                    <Upload className="w-3.5 h-3.5" />
                    {uploadingFile ? '上传中...' : '上传文件'}
                  </span>
                </label>
              </div>
              {formAttachments.length > 0 ? (
                <div className="space-y-2">
                  {/* 图片附件缩略图网格 */}
                  {formAttachments.filter(att => isImageFile(att.name)).length > 0 && (
                    <div className="grid grid-cols-4 gap-2">
                      {formAttachments.filter(att => isImageFile(att.name)).map((att) => (
                        <div key={att.key} className="relative group rounded-lg overflow-hidden border border-gray-200 hover:border-blue-400 transition-colors">
                          {thumbnailUrls[att.key] ? (
                            <img
                              src={thumbnailUrls[att.key]}
                              alt={att.name}
                              className="w-full h-20 object-cover"
                            />
                          ) : (
                            <div className="w-full h-20 flex items-center justify-center bg-gray-50">
                              <ImageIcon className="w-6 h-6" style={{ color: '#C9CDD4' }} />
                            </div>
                          )}
                          <button
                            className="absolute top-1 right-1 h-5 w-5 p-0 rounded-full bg-white/80 hover:bg-white shadow-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => currentCertificate ? handleDeleteAttachment(att.key, currentCertificate.id) : handleDeleteAttachment(att.key)}
                            type="button"
                          >
                            <X className="w-3 h-3" style={{ color: '#F53F3F' }} />
                          </button>
                          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/40 to-transparent px-1 py-0.5">
                            <p className="text-[10px] text-white truncate">{att.name}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* 非图片附件列表 */}
                  {formAttachments.filter(att => !isImageFile(att.name)).map((att) => (
                    <div key={att.key} className="flex items-center gap-2 p-2 rounded-md bg-gray-50 group hover:bg-gray-100 transition-colors">
                      <button
                        className="flex items-center gap-2 flex-1 min-w-0 text-left"
                        onClick={() => handlePreviewAttachment(att.key, att.name)}
                        type="button"
                      >
                        {getFileIcon(att.name)}
                        <span className="text-sm truncate hover:underline" style={{ color: '#165DFF' }}>{att.name}</span>
                      </button>
                      <span className="text-xs shrink-0" style={{ color: '#86909C' }}>{formatFileSize(att.size)}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                        onClick={() => currentCertificate ? handleDeleteAttachment(att.key, currentCertificate.id) : handleDeleteAttachment(att.key)}
                      >
                        <X className="w-3.5 h-3.5" style={{ color: '#F53F3F' }} />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-4 rounded-md border border-dashed" style={{ borderColor: '#E5E6EB', color: '#86909C' }}>
                  <Paperclip className="w-6 h-6 mx-auto mb-1 opacity-40" />
                  <p className="text-xs">暂无附件，点击上方按钮上传</p>
                </div>
              )}
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

      {/* 查看证件对话框 */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="sm:max-w-[520px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle style={{ color: '#1D2129' }}>证件详情</DialogTitle>
          </DialogHeader>
          {currentCertificate && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm mb-1" style={{ color: '#86909C' }}>证件名称</p>
                  <p className="font-medium" style={{ color: '#1D2129' }}>{currentCertificate.name}</p>
                </div>
                <div>
                  <p className="text-sm mb-1" style={{ color: '#86909C' }}>证件编号</p>
                  <p className="font-mono font-medium" style={{ color: '#165DFF' }}>{currentCertificate.certificate_number}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm mb-1" style={{ color: '#86909C' }}>归属类型</p>
                  <div className="flex items-center gap-1">
                    {currentCertificate.owner_type === 'company' ? (
                      <Building2 className="w-4 h-4" style={{ color: '#00B42A' }} />
                    ) : (
                      <User className="w-4 h-4" style={{ color: '#722ED1' }} />
                    )}
                    <span style={{ color: '#1D2129' }}>
                      {currentCertificate.owner_type === 'company' ? '公司证件' : '人员证件'}
                    </span>
                  </div>
                </div>
                <div>
                  <p className="text-sm mb-1" style={{ color: '#86909C' }}>关联名称</p>
                  <p className="font-medium" style={{ color: '#1D2129' }}>{currentCertificate.owner_name}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm mb-1" style={{ color: '#86909C' }}>发证日期</p>
                  <p className="font-medium" style={{ color: '#1D2129' }}>{currentCertificate.issue_date}</p>
                </div>
                <div>
                  <p className="text-sm mb-1" style={{ color: '#86909C' }}>到期日期</p>
                  <p className="font-medium" style={{ color: '#1D2129' }}>{currentCertificate.expiry_date}</p>
                </div>
              </div>
              <div>
                <p className="text-sm mb-1" style={{ color: '#86909C' }}>状态</p>
                <Badge variant="outline" className={`${getStatusStyle(currentCertificate.status)} font-medium`}>
                  {getStatusText(currentCertificate.status)}
                </Badge>
                {currentCertificate.status !== 'normal' && (
                  <span className="ml-2 text-sm" style={{ color: currentCertificate.status === 'expired' ? '#F53F3F' : '#FF7D00' }}>
                    {getRemainingDays(currentCertificate.expiry_date) < 0 
                      ? `已过期${Math.abs(getRemainingDays(currentCertificate.expiry_date))}天` 
                      : `剩余${getRemainingDays(currentCertificate.expiry_date)}天`}
                  </span>
                )}
              </div>
              {currentCertificate.remark && (
                <div>
                  <p className="text-sm mb-1" style={{ color: '#86909C' }}>备注说明</p>
                  <p style={{ color: '#4E5969' }}>{currentCertificate.remark}</p>
                </div>
              )}
              {/* 附件展示区域 */}
              <div>
                <div className="flex items-center gap-1 mb-2">
                  <Paperclip className="w-4 h-4" style={{ color: '#86909C' }} />
                  <p className="text-sm" style={{ color: '#86909C' }}>附件</p>
                  {currentCertificate.attachments && currentCertificate.attachments.length > 0 && (
                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-50" style={{ color: '#165DFF' }}>
                      {currentCertificate.attachments.length}
                    </span>
                  )}
                </div>
                {currentCertificate.attachments && currentCertificate.attachments.length > 0 ? (
                  <div className="space-y-2">
                    {/* 图片附件缩略图网格 */}
                    {currentCertificate.attachments.filter((att: Attachment) => isImageFile(att.name)).length > 0 && (
                      <div className="grid grid-cols-3 gap-2">
                        {currentCertificate.attachments.filter((att: Attachment) => isImageFile(att.name)).map((att: Attachment) => (
                          <div
                            key={att.key}
                            className="relative group cursor-pointer rounded-lg overflow-hidden border border-gray-200 hover:border-blue-400 transition-colors"
                            onClick={() => handlePreviewAttachment(att.key, att.name)}
                          >
                            {thumbnailUrls[att.key] ? (
                              <img
                                src={thumbnailUrls[att.key]}
                                alt={att.name}
                                className="w-full h-24 object-cover"
                              />
                            ) : (
                              <div className="w-full h-24 flex items-center justify-center bg-gray-50">
                                <ImageIcon className="w-8 h-8 animate-pulse" style={{ color: '#C9CDD4' }} />
                              </div>
                            )}
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                              <Eye className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/50 to-transparent px-1.5 py-1">
                              <p className="text-xs text-white truncate">{att.name}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {/* 非图片附件列表 */}
                    {currentCertificate.attachments.filter((att: Attachment) => !isImageFile(att.name)).map((att: Attachment) => (
                      <div key={att.key} className="flex items-center gap-2 p-2 rounded-md bg-gray-50 hover:bg-gray-100 transition-colors">
                        <button
                          className="flex items-center gap-2 flex-1 min-w-0 text-left"
                          onClick={() => handlePreviewAttachment(att.key, att.name)}
                          type="button"
                        >
                          {getFileIcon(att.name)}
                          <span className="text-sm truncate hover:underline" style={{ color: '#165DFF' }}>{att.name}</span>
                        </button>
                        <span className="text-xs shrink-0" style={{ color: '#86909C' }}>{formatFileSize(att.size)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm" style={{ color: '#C9CDD4' }}>暂无附件</p>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewDialogOpen(false)}>关闭</Button>
            <Button onClick={() => { setViewDialogOpen(false); handleEdit(currentCertificate!); }} style={{ background: 'linear-gradient(135deg, #165DFF 0%, #4080FF 100%)' }}>
              编辑
            </Button>
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
              确定要删除证件 <strong>{currentCertificate?.name}</strong> 吗？此操作不可恢复。
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

      {/* 图片预览对话框 */}
      <Dialog open={!!previewUrl} onOpenChange={(open) => { if (!open) { setPreviewUrl(null); setPreviewName(''); } }}>
        <DialogContent className="sm:max-w-[700px]">
          <DialogHeader>
            <DialogTitle style={{ color: '#1D2129' }}>{previewName}</DialogTitle>
          </DialogHeader>
          {previewUrl && (
            <div className="flex items-center justify-center py-4">
              <img src={previewUrl} alt={previewName} className="max-w-full max-h-[60vh] object-contain rounded-lg" />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPreviewUrl(null); setPreviewName(''); }}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
