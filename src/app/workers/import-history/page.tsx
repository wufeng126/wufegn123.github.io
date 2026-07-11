'use client';
import { useToast } from '@/hooks/use-toast';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { History, Trash2, Download, ArrowLeft, FileText, UserPlus, RefreshCw, AlertCircle, CheckCircle } from 'lucide-react';
import Link from 'next/link';

interface ImportHistory {
  id: number;
  import_time: string;
  file_name: string;
  total_count: number;
  success_count: number;
  update_count: number;
  skip_count: number;
  error_count: number;
  import_mode: string;
  operator: string;
  error_details: Array<{ row: number; name: string; reason: string }> | null;
}

interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export default function ImportHistoryPage() {
  const { toast } = useToast();
  const [history, setHistory] = useState<ImportHistory[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [showContent, setShowContent] = useState(false);

  useEffect(() => {
    fetchHistory();
  }, [pagination.page]);

  useEffect(() => {
    if (!loading) {
      const timer = setTimeout(() => setShowContent(true), 50);
      return () => clearTimeout(timer);
    }
  }, [loading]);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/workers/import-history?page=${pagination.page}&pageSize=${pagination.pageSize}`);
      const data = await res.json();
      setHistory(data.history || []);
      setPagination(data.pagination || pagination);
    } catch (error) {
      console.error('获取导入历史失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除这条导入记录吗？')) return;

    try {
      const res = await fetch(`/api/workers/import-history?id=${id}`, { method: 'DELETE' });
      const data = await res.json();

      if (data.success) {
        toast({ title: '删除成功', description: '导入记录已删除' });
        fetchHistory();
      } else {
        toast({ title: '删除失败', description: data.error, variant: 'error' });
      }
    } catch (error) {
      toast({ title: '删除失败', description: '请稍后重试', variant: 'error' });
    }
  };

  const exportErrorDetails = (record: ImportHistory) => {
    if (!record.error_details?.length) return;

    const headers = ['行号', '姓名', '错误原因'];
    const rows = record.error_details.map(e => [e.row || '-', e.name || '-', e.reason]);
    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `导入错误明细_${record.file_name}_${new Date(record.import_time).toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getModeLabel = (mode: string) => {
    return mode === 'upsert' ? '覆盖更新' : '仅新增';
  };

  return (
    <div className="space-y-5">
      {/* 页面标题 */}
      <div className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 transition-all duration-500 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
        <div className="flex items-center gap-3">
          <Link href="/workers/roster">
            <Button variant="ghost" size="sm" className="h-8 px-2">
              <ArrowLeft className="w-4 h-4 mr-1" />
              返回
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-semibold tracking-tight" style={{ color: '#1D2129' }}>导入历史</h1>
            <p className="text-sm mt-1" style={{ color: '#86909C' }}>花名册批量导入记录</p>
          </div>
        </div>
        <Button onClick={fetchHistory} variant="outline" className="btn-secondary h-9">
          <RefreshCw className="w-4 h-4 mr-1.5" />刷新
        </Button>
      </div>

      {/* 统计卡片 */}
      <div className={`grid grid-cols-2 md:grid-cols-4 gap-4 transition-all duration-500 delay-100 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
        <Card className="stat-card stat-card-blue">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg" style={{ backgroundColor: '#E8F3FF' }}>
                <FileText className="w-5 h-5" style={{ color: '#165DFF' }} />
              </div>
              <div>
                <p className="text-xs" style={{ color: '#86909C' }}>总导入次数</p>
                <p className="text-xl font-bold" style={{ color: '#1D2129' }}>{pagination.total}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="stat-card stat-card-green">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg" style={{ backgroundColor: '#E8FFEA' }}>
                <UserPlus className="w-5 h-5" style={{ color: '#00B42A' }} />
              </div>
              <div>
                <p className="text-xs" style={{ color: '#86909C' }}>成功新增</p>
                <p className="text-xl font-bold" style={{ color: '#1D2129' }}>
                  {history.reduce((sum, h) => sum + h.success_count, 0)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="stat-card stat-card-orange">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg" style={{ backgroundColor: '#FFF7E8' }}>
                <RefreshCw className="w-5 h-5" style={{ color: '#FF7D00' }} />
              </div>
              <div>
                <p className="text-xs" style={{ color: '#86909C' }}>成功更新</p>
                <p className="text-xl font-bold" style={{ color: '#1D2129' }}>
                  {history.reduce((sum, h) => sum + h.update_count, 0)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="stat-card stat-card-red">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg" style={{ backgroundColor: '#FFECE8' }}>
                <AlertCircle className="w-5 h-5" style={{ color: '#F53F3F' }} />
              </div>
              <div>
                <p className="text-xs" style={{ color: '#86909C' }}>导入失败</p>
                <p className="text-xl font-bold" style={{ color: '#1D2129' }}>
                  {history.reduce((sum, h) => sum + h.error_count, 0)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 导入历史列表 */}
      <div className={`transition-all duration-500 delay-200 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
        <Card className="overflow-hidden border" style={{ borderColor: '#E5E6EB' }}>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <div className="loading-spinner" />
              </div>
            ) : history.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow style={{ background: '#F7F8FA', borderBottom: '1px solid #E5E6EB' }}>
                      <TableHead style={{ color: '#86909C' }}>导入时间</TableHead>
                      <TableHead style={{ color: '#86909C' }}>文件名</TableHead>
                      <TableHead style={{ color: '#86909C' }}>导入模式</TableHead>
                      <TableHead className="text-center" style={{ color: '#86909C' }}>总条数</TableHead>
                      <TableHead className="text-center" style={{ color: '#86909C' }}>新增</TableHead>
                      <TableHead className="text-center" style={{ color: '#86909C' }}>更新</TableHead>
                      <TableHead className="text-center" style={{ color: '#86909C' }}>跳过</TableHead>
                      <TableHead className="text-center" style={{ color: '#86909C' }}>错误</TableHead>
                      <TableHead style={{ color: '#86909C' }}>操作人</TableHead>
                      <TableHead className="text-right" style={{ color: '#86909C' }}>操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.map((record, index) => (
                      <TableRow key={record.id} style={{ background: index % 2 === 1 ? '#FAFBFD' : 'transparent', borderBottom: '1px solid #E5E6EB' }}>
                        <TableCell className="text-sm" style={{ color: '#4E5969' }}>{formatDateTime(record.import_time)}</TableCell>
                        <TableCell className="text-sm font-medium" style={{ color: '#1D2129' }}>
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4" style={{ color: '#165DFF' }} />
                            <span className="truncate max-w-[200px]">{record.file_name || '未知文件'}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                            record.import_mode === 'upsert' 
                              ? 'bg-orange-100 text-orange-700' 
                              : 'bg-blue-100 text-blue-700'
                          }`}>
                            {getModeLabel(record.import_mode)}
                          </span>
                        </TableCell>
                        <TableCell className="text-center" style={{ color: '#4E5969' }}>{record.total_count}</TableCell>
                        <TableCell className="text-center">
                          {record.success_count > 0 ? (
                            <span className="text-green-600 font-medium">{record.success_count}</span>
                          ) : (
                            <span style={{ color: '#C9CDD4' }}>0</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {record.update_count > 0 ? (
                            <span className="text-orange-600 font-medium">{record.update_count}</span>
                          ) : (
                            <span style={{ color: '#C9CDD4' }}>0</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {record.skip_count > 0 ? (
                            <span style={{ color: '#86909C' }}>{record.skip_count}</span>
                          ) : (
                            <span style={{ color: '#C9CDD4' }}>0</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {record.error_count > 0 ? (
                            <span className="text-red-600 font-medium">{record.error_count}</span>
                          ) : (
                            <span style={{ color: '#C9CDD4' }}>0</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm" style={{ color: '#4E5969' }}>{record.operator || '-'}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1.5">
                            {record.error_details && record.error_details.length > 0 && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => exportErrorDetails(record)}
                                className="h-7 px-2"
                                style={{ color: '#165DFF' }}
                                title="导出错误明细"
                              >
                                <Download className="w-4 h-4" />
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDelete(record.id)}
                              className="h-7 px-2"
                              style={{ color: '#F53F3F' }}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-state-icon">
                  <History className="w-8 h-8" style={{ color: '#C9CDD4' }} />
                </div>
                <p className="empty-state-title">暂无导入记录</p>
                <p className="empty-state-description">批量导入花名册后，记录将显示在这里</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 分页 */}
        {pagination.totalPages > 1 && (
          <div className="flex justify-center items-center gap-4 mt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPagination({ ...pagination, page: pagination.page - 1 })}
              disabled={pagination.page === 1}
            >
              上一页
            </Button>
            <span className="text-sm" style={{ color: '#86909C' }}>
              第 {pagination.page} / {pagination.totalPages} 页，共 {pagination.total} 条
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPagination({ ...pagination, page: pagination.page + 1 })}
              disabled={pagination.page === pagination.totalPages}
            >
              下一页
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
