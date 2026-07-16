'use client';
import { useToast } from '@/hooks/use-toast';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  FileText,
  Search,
  Download,
  Trash2,
  RefreshCw,
  Filter,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

interface AuditLog {
  id: number;
  user_id: number | null;
  username: string | null;
  operation_type: string;
  resource_type: string | null;
  resource_id: number | null;
  details: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

const OPERATION_TYPE_MAP: Record<string, string> = {
  create: '新增',
  update: '修改',
  delete: '删除',
  import: '导入',
  export: '导出',
};

const RESOURCE_TYPE_MAP: Record<string, string> = {
  project: '项目',
  worker: '工人',
  worker_salary: '工人工资',
  work_item: '分项工程',
  work_item_progress: '工程进度',
  client_report: '甲方报量',
  client_payment: '甲方付款',
  supplier: '供应商',
  supplier_contract: '供应商合同',
  supplier_settlement: '供应商结算',
  supplier_payment: '供应商付款',
  miscellaneous_material: '零星材料',
  notification: '消息通知',
  certificate: '证件',
  visa: '签证',
  user: '用户',
  role: '角色',
  permission: '权限',
  system_setting: '系统设置',
  backup: '数据备份',
};

const OPERATION_COLORS: Record<string, string> = {
  create: 'bg-green-100 text-green-800',
  update: 'bg-blue-100 text-blue-800',
  delete: 'bg-red-100 text-red-800',
  import: 'bg-purple-100 text-purple-800',
  export: 'bg-orange-100 text-orange-800',
};

export default function AuditLogsPage() {
  const { toast } = useToast();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [loading, setLoading] = useState(false);

  // 筛选条件
  const [operationType, setOperationType] = useState('');
  const [resourceType, setResourceType] = useState('');
  const [username, setUsername] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // 清理日期
  const [cleanupDate, setCleanupDate] = useState('');

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: pageSize.toString(),
      });
      if (operationType) params.set('operation_type', operationType);
      if (resourceType) params.set('resource_type', resourceType);
      if (username) params.set('username', username);
      if (startDate) params.set('start_date', startDate);
      if (endDate) params.set('end_date', endDate);

      const res = await fetch(`/api/audit-logs?${params}`);
      const data = await res.json();
      if (data.logs) {
        setLogs(data.logs);
        setTotal(data.total || 0);
      }
    } catch (err) {
      console.error('获取审计日志失败:', err);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, operationType, resourceType, username, startDate, endDate]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleCleanup = async () => {
    if (!cleanupDate) return;
    try {
      const res = await fetch(`/api/audit-logs?before_date=${cleanupDate}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: data.message });
        setCleanupDate('');
        fetchLogs();
      } else {
        toast({ title: data.error || '清理失败', variant: 'error' });
      }
    } catch (err) {
      console.error('清理日志失败:', err);
    }
  };

  const handleExport = () => {
    if (logs.length === 0) return;

    const headers = ['时间', '操作人', '操作类型', '资源类型', '资源ID', '详情', 'IP地址'];
    const rows = logs.map(log => [
      log.created_at,
      log.username || '-',
      OPERATION_TYPE_MAP[log.operation_type] || log.operation_type,
      RESOURCE_TYPE_MAP[log.resource_type || ''] || log.resource_type || '-',
      log.resource_id?.toString() || '-',
      log.details ? JSON.stringify(log.details) : '-',
      log.ip_address || '-',
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `审计日志_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const totalPages = Math.ceil(total / pageSize);

  const formatTime = (dateStr: string) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const formatDetails = (details: Record<string, unknown> | null) => {
    if (!details) return '-';
    const entries = Object.entries(details);
    if (entries.length === 0) return '-';
    return entries.map(([key, value]) => {
      const displayKey = RESOURCE_TYPE_MAP[key] || key;
      let displayValue = String(value);
      if (typeof value === 'object' && value !== null) {
        displayValue = JSON.stringify(value);
      }
      if (displayValue.length > 40) {
        displayValue = displayValue.substring(0, 40) + '...';
      }
      return `${displayKey}: ${displayValue}`;
    }).join(' | ');
  };

  return (
    <div className="p-6 space-y-6" style={{ backgroundColor: '#F2F3F5', minHeight: 'calc(100vh - 64px)' }}>
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight" style={{ color: '#1D2129' }}>日志管理</h1>
          <p className="text-sm mt-1" style={{ color: '#86909C' }}>查看系统操作记录，追踪数据变更历史</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExport} disabled={logs.length === 0} className="gap-2">
            <Download className="h-4 w-4" />
            导出日志
          </Button>
          <Button variant="outline" onClick={fetchLogs} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </Button>
        </div>
      </div>

      {/* 筛选区域 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="h-4 w-4" />
            筛选条件
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <label className="text-sm text-gray-500 mb-1 block">操作类型</label>
              <Select value={operationType} onValueChange={(val) => { setOperationType(val === 'all' ? '' : val); setPage(1); }}>
                <SelectTrigger><SelectValue placeholder="全部类型" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部类型</SelectItem>
                  <SelectItem value="create">新增</SelectItem>
                  <SelectItem value="update">修改</SelectItem>
                  <SelectItem value="delete">删除</SelectItem>
                  <SelectItem value="import">导入</SelectItem>
                  <SelectItem value="export">导出</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm text-gray-500 mb-1 block">资源类型</label>
              <Select value={resourceType} onValueChange={(val) => { setResourceType(val === 'all' ? '' : val); setPage(1); }}>
                <SelectTrigger><SelectValue placeholder="全部资源" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部资源</SelectItem>
                  <SelectItem value="project">项目</SelectItem>
                  <SelectItem value="worker">工人</SelectItem>
                  <SelectItem value="worker_salary">工人工资</SelectItem>
                  <SelectItem value="client_report">甲方报量</SelectItem>
                  <SelectItem value="client_payment">甲方付款</SelectItem>
                  <SelectItem value="supplier">供应商</SelectItem>
                  <SelectItem value="supplier_contract">供应商合同</SelectItem>
                  <SelectItem value="supplier_settlement">供应商结算</SelectItem>
                  <SelectItem value="supplier_payment">供应商付款</SelectItem>
                  <SelectItem value="miscellaneous_material">零星材料</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm text-gray-500 mb-1 block">操作人</label>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="搜索操作人"
                  value={username}
                  onChange={(e) => { setUsername(e.target.value); setPage(1); }}
                  className="pl-8"
                />
              </div>
            </div>
            <div>
              <label className="text-sm text-gray-500 mb-1 block">开始日期</label>
              <Input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setPage(1); }} />
            </div>
            <div>
              <label className="text-sm text-gray-500 mb-1 block">结束日期</label>
              <Input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setPage(1); }} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 统计概览 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-gray-500">总记录数</div>
            <div className="text-2xl font-bold mt-1">{total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-gray-500">当前页</div>
            <div className="text-2xl font-bold mt-1">{page} / {totalPages || 1}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-gray-500">今日新增</div>
            <div className="text-2xl font-bold mt-1">
              {logs.filter(l => {
                const today = new Date().toISOString().split('T')[0];
                return l.created_at?.startsWith(today);
              }).length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-gray-500">删除操作</div>
            <div className="text-2xl font-bold mt-1 text-red-600">
              {logs.filter(l => l.operation_type === 'delete').length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 日志列表 */}
      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
              <span className="ml-2 text-gray-500">加载中...</span>
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <FileText className="h-12 w-12 mb-4" />
              <p>暂无日志记录</p>
            </div>
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[160px]">操作时间</TableHead>
                    <TableHead className="w-[100px]">操作人</TableHead>
                    <TableHead className="w-[80px]">操作类型</TableHead>
                    <TableHead className="w-[110px]">资源类型</TableHead>
                    <TableHead className="w-[70px]">资源ID</TableHead>
                    <TableHead>操作详情</TableHead>
                    <TableHead className="w-[120px]">IP地址</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-sm text-gray-600">
                        {formatTime(log.created_at)}
                      </TableCell>
                      <TableCell className="font-medium">
                        {log.username || '系统'}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={OPERATION_COLORS[log.operation_type] || 'bg-gray-100 text-gray-800'}
                        >
                          {OPERATION_TYPE_MAP[log.operation_type] || log.operation_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {RESOURCE_TYPE_MAP[log.resource_type || ''] || log.resource_type || '-'}
                      </TableCell>
                      <TableCell className="text-sm text-gray-500">
                        {log.resource_id || '-'}
                      </TableCell>
                      <TableCell className="text-sm text-gray-600 max-w-[300px] truncate" title={formatDetails(log.details)}>
                        {formatDetails(log.details)}
                      </TableCell>
                      <TableCell className="text-sm text-gray-400">
                        {log.ip_address || '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
              <div className="space-y-3 md:hidden">
                {logs.map((log) => (
                  <div key={log.id} className="rounded-lg border bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs text-gray-500">{formatTime(log.created_at)}</div>
                        <div className="mt-1 font-medium">{log.username || '系统'}</div>
                      </div>
                      <Badge
                        variant="secondary"
                        className={`${OPERATION_COLORS[log.operation_type] || 'bg-gray-100 text-gray-800'} shrink-0`}
                      >
                        {OPERATION_TYPE_MAP[log.operation_type] || log.operation_type}
                      </Badge>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <div className="text-xs text-gray-500">资源类型</div>
                        <div className="mt-1">{RESOURCE_TYPE_MAP[log.resource_type || ''] || log.resource_type || '-'}</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500">资源ID</div>
                        <div className="mt-1">{log.resource_id || '-'}</div>
                      </div>
                      <div className="col-span-2">
                        <div className="text-xs text-gray-500">操作详情</div>
                        <div className="mt-1 line-clamp-3 text-gray-600">{formatDetails(log.details)}</div>
                      </div>
                      <div className="col-span-2">
                        <div className="text-xs text-gray-500">IP地址</div>
                        <div className="mt-1 text-gray-500">{log.ip_address || '-'}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* 分页 */}
              <div className="mt-4 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-gray-500">
                  共 {total} 条记录，第 {page}/{totalPages || 1} 页
                </div>
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:flex">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(Math.max(1, page - 1))}
                    disabled={page <= 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    上一页
                  </Button>
                  <div className="text-sm px-3 py-1 bg-gray-100 rounded">
                    {page}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(Math.min(totalPages, page + 1))}
                    disabled={page >= totalPages}
                  >
                    下一页
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* 日志清理 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Trash2 className="h-4 w-4 text-red-500" />
            日志清理
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:flex sm:items-end">
            <div className="max-w-xs flex-1">
              <label className="text-sm text-gray-500 mb-1 block">清理此日期之前的日志</label>
              <Input
                type="date"
                value={cleanupDate}
                onChange={(e) => setCleanupDate(e.target.value)}
              />
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" disabled={!cleanupDate} className="w-full gap-2 sm:w-auto">
                  <Trash2 className="h-4 w-4" />
                  清理日志
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="w-[calc(100vw-1.5rem)] max-w-lg">
                <AlertDialogHeader>
                  <AlertDialogTitle>确认清理日志</AlertDialogTitle>
                  <AlertDialogDescription>
                    此操作将删除 {cleanupDate} 之前的所有日志记录，且不可恢复。确定继续吗？
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
                  <AlertDialogCancel>取消</AlertDialogCancel>
                  <AlertDialogAction onClick={handleCleanup} className="bg-red-600 hover:bg-red-700">
                    确认清理
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
          <p className="text-xs text-gray-400 mt-2">建议定期清理历史日志，保留近3-6个月即可</p>
        </CardContent>
      </Card>
    </div>
  );
}
