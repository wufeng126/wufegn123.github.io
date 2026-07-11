'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { 
  Database, 
  Trash2, 
  RotateCcw, 
  AlertTriangle, 
  CheckCircle, 
  Loader2, 
  Clock,
  FileWarning,
  Users
} from 'lucide-react';

interface BackupRecord {
  id: number;
  original_id: number;
  name: string;
  work_type: string | null;
  id_card: string | null;
  phone: string | null;
  bank_card: string | null;
  project_id: number | null;
  status: string;
  deleted_at: string;
  deleted_by: string;
  restore_available: boolean;
}

interface DeletionLog {
  id: number;
  action: string;
  worker_ids: string;
  count: number;
  operator: string;
  created_at: string;
  details: string;
}

interface WorkerDataManageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentCount: number;
  onSuccess: () => void;
}

export function WorkerDataManageDialog({ 
  open, 
  onOpenChange, 
  currentCount,
  onSuccess 
}: WorkerDataManageDialogProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'backup' | 'restore'>('backup');
  const [isLoading, setIsLoading] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [logs, setLogs] = useState<DeletionLog[]>([]);
  const [totalBackups, setTotalBackups] = useState(0);
  const [selectedBackupIds, setSelectedBackupIds] = useState<Set<number>>(new Set());
  const [showConfirmClear, setShowConfirmClear] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 10;

  useEffect(() => {
    if (open) {
      fetchBackupData();
    }
  }, [open, page]);

  const fetchBackupData = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/workers/backup?page=${page}&pageSize=${pageSize}`);
      const data = await res.json();
      if (res.ok) {
        setBackups(data.backups || []);
        setTotalBackups(data.total || 0);
        setLogs(data.logs || []);
      }
    } catch (error) {
      console.error('Failed to fetch backup data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // 备份并清空数据
  const handleBackupAndClear = async () => {
    setIsExecuting(true);
    try {
      const res = await fetch('/api/workers/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'backup_and_clear',
          operator: '用户',
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast({
          title: '操作成功',
          description: data.message,
          variant: 'default',
        });
        setShowConfirmClear(false);
        fetchBackupData();
        onSuccess();
      } else {
        toast({
          title: '操作失败',
          description: data.error || '备份清空失败',
          variant: 'error',
        });
      }
    } catch (error) {
      toast({
        title: '操作失败',
        description: '网络错误，请稍后重试',
        variant: 'error',
      });
    } finally {
      setIsExecuting(false);
    }
  };

  // 恢复选中的数据
  const handleRestore = async () => {
    if (selectedBackupIds.size === 0) {
      toast({
        title: '请选择数据',
        description: '请先勾选要恢复的数据',
        variant: 'warning',
      });
      return;
    }

    setIsExecuting(true);
    try {
      const res = await fetch('/api/workers/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'restore',
          workerIds: Array.from(selectedBackupIds),
          operator: '用户',
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast({
          title: '恢复成功',
          description: data.message,
          variant: 'default',
        });
        setSelectedBackupIds(new Set());
        fetchBackupData();
        onSuccess();
      } else {
        toast({
          title: '恢复失败',
          description: data.error || '恢复失败',
          variant: 'error',
        });
      }
    } catch (error) {
      toast({
        title: '恢复失败',
        description: '网络错误，请稍后重试',
        variant: 'error',
      });
    } finally {
      setIsExecuting(false);
    }
  };

  // 永久删除选中的备份数据
  const handlePermanentDelete = async () => {
    if (selectedBackupIds.size === 0) {
      toast({
        title: '请选择数据',
        description: '请先勾选要删除的数据',
        variant: 'warning',
      });
      return;
    }

    if (!confirm(`确定要永久删除选中的 ${selectedBackupIds.size} 条备份数据吗？此操作不可恢复！`)) {
      return;
    }

    setIsExecuting(true);
    try {
      const res = await fetch('/api/workers/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'permanent_delete',
          workerIds: Array.from(selectedBackupIds),
          operator: '用户',
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast({
          title: '删除成功',
          description: data.message,
          variant: 'default',
        });
        setSelectedBackupIds(new Set());
        fetchBackupData();
      } else {
        toast({
          title: '删除失败',
          description: data.error || '删除失败',
          variant: 'error',
        });
      }
    } catch (error) {
      toast({
        title: '删除失败',
        description: '网络错误，请稍后重试',
        variant: 'error',
      });
    } finally {
      setIsExecuting(false);
    }
  };

  const handleSelectBackup = (id: number) => {
    setSelectedBackupIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const handleSelectAllBackups = () => {
    if (selectedBackupIds.size === backups.length) {
      setSelectedBackupIds(new Set());
    } else {
      setSelectedBackupIds(new Set(backups.map(b => b.id)));
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleClose = () => {
    setSelectedBackupIds(new Set());
    setShowConfirmClear(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="dialog-header flex items-center gap-2">
            <Database className="w-5 h-5" style={{ color: '#165DFF' }} />
            数据管理
          </DialogTitle>
          <DialogDescription>
            当前系统中共有 <strong>{currentCount}</strong> 条工人数据
          </DialogDescription>
        </DialogHeader>

        {/* Tab 切换 */}
        <div className="flex border-b" style={{ borderColor: '#E5E6EB' }}>
          <button
            className={`px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === 'backup'
                ? 'border-b-2 text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
            style={{ 
              borderColor: activeTab === 'backup' ? '#165DFF' : 'transparent',
              color: activeTab === 'backup' ? '#165DFF' : '#86909C'
            }}
            onClick={() => setActiveTab('backup')}
          >
            <Trash2 className="w-4 h-4 inline mr-1.5" />
            备份与清空
          </button>
          <button
            className={`px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === 'restore'
                ? 'border-b-2 text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
            style={{ 
              borderColor: activeTab === 'restore' ? '#165DFF' : 'transparent',
              color: activeTab === 'restore' ? '#165DFF' : '#86909C'
            }}
            onClick={() => setActiveTab('restore')}
          >
            <RotateCcw className="w-4 h-4 inline mr-1.5" />
            数据恢复
          </button>
        </div>

        {/* 内容区域 */}
        <div className="flex-1 overflow-y-auto py-4">
          {activeTab === 'backup' && (
            <div className="space-y-4">
              {/* 操作说明 */}
              <div className="p-4 rounded-lg" style={{ backgroundColor: '#F7F8FA' }}>
                <h4 className="font-medium mb-2" style={{ color: '#1D2129' }}>操作说明</h4>
                <ul className="text-sm space-y-1" style={{ color: '#4E5969' }}>
                  <li>• 「备份并清空」会将当前所有工人数据备份到恢复区，然后清空工人表</li>
                  <li>• 备份数据可在「数据恢复」标签页中查看和恢复</li>
                  <li>• 清空操作会记录日志，支持数据恢复</li>
                </ul>
              </div>

              {/* 删除日志 */}
              {logs.length > 0 && (
                <div>
                  <h4 className="font-medium mb-2 flex items-center gap-2" style={{ color: '#1D2129' }}>
                    <Clock className="w-4 h-4" style={{ color: '#86909C' }} />
                    操作日志
                  </h4>
                  <div className="space-y-2">
                    {logs.slice(0, 5).map((log) => (
                      <div
                        key={log.id}
                        className="flex items-center justify-between p-3 rounded-lg border"
                        style={{ borderColor: '#E5E6EB', backgroundColor: '#FAFBFD' }}
                      >
                        <div className="flex items-center gap-2">
                          {log.action === 'backup' && <Trash2 className="w-4 h-4 text-orange-500" />}
                          {log.action === 'restore' && <RotateCcw className="w-4 h-4 text-green-500" />}
                          {log.action === 'permanent_delete' && <FileWarning className="w-4 h-4 text-red-500" />}
                          <span className="text-sm" style={{ color: '#1D2129' }}>{log.details}</span>
                        </div>
                        <span className="text-xs" style={{ color: '#86909C' }}>
                          {formatDate(log.created_at)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 确认清空对话框 */}
              {showConfirmClear ? (
                <div className="p-4 rounded-lg border-2 border-dashed border-orange-300" style={{ backgroundColor: '#FFF7E8' }}>
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-6 h-6 text-orange-500 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="font-medium mb-2" style={{ color: '#FF7D00' }}>
                        确认备份并清空所有工人数据？
                      </p>
                      <p className="text-sm mb-4" style={{ color: '#4E5969' }}>
                        此操作将清空 {currentCount} 条工人数据，数据会先备份到恢复区。
                        相关的工资记录也会被删除！
                      </p>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          onClick={() => setShowConfirmClear(false)}
                          disabled={isExecuting}
                        >
                          取消
                        </Button>
                        <Button
                          onClick={handleBackupAndClear}
                          disabled={isExecuting}
                          className="bg-orange-500 hover:bg-orange-600 text-white"
                        >
                          {isExecuting ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                              执行中...
                            </>
                          ) : (
                            '确认清空'
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <Button
                  onClick={() => setShowConfirmClear(true)}
                  disabled={currentCount === 0 || isExecuting}
                  variant="outline"
                  className="w-full border-orange-300 text-orange-600 hover:bg-orange-50"
                >
                  <Trash2 className="w-4 h-4 mr-1.5" />
                  备份并清空所有数据
                </Button>
              )}
            </div>
          )}

          {activeTab === 'restore' && (
            <div className="space-y-4">
              {/* 说明 */}
              <div className="p-4 rounded-lg" style={{ backgroundColor: '#F7F8FA' }}>
                <h4 className="font-medium mb-2" style={{ color: '#1D2129' }}>可恢复数据</h4>
                <p className="text-sm" style={{ color: '#4E5969' }}>
                  共有 <strong>{totalBackups}</strong> 条备份数据可恢复
                </p>
              </div>

              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#165DFF' }} />
                </div>
              ) : backups.length > 0 ? (
                <>
                  {/* 批量操作 */}
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedBackupIds.size === backups.length && backups.length > 0}
                        onChange={handleSelectAllBackups}
                        className="w-4 h-4"
                      />
                      <span className="text-sm" style={{ color: '#4E5969' }}>
                        全选 ({selectedBackupIds.size} 已选)
                      </span>
                    </label>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handlePermanentDelete}
                        disabled={selectedBackupIds.size === 0 || isExecuting}
                        className="text-red-600 border-red-200 hover:bg-red-50"
                      >
                        永久删除
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleRestore}
                        disabled={selectedBackupIds.size === 0 || isExecuting}
                        className="text-white"
                        style={{ backgroundColor: '#165DFF' }}
                      >
                        {isExecuting ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                            恢复中...
                          </>
                        ) : (
                          <>
                            <RotateCcw className="w-3.5 h-3.5 mr-1" />
                            恢复选中
                          </>
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* 备份列表 */}
                  <div className="border rounded-lg overflow-hidden" style={{ borderColor: '#E5E6EB' }}>
                    <table className="w-full">
                      <thead>
                        <tr style={{ backgroundColor: '#F7F8FA' }}>
                          <th className="w-10 px-3 py-2 text-left">
                            <span className="sr-only">选择</span>
                          </th>
                          <th className="px-3 py-2 text-left text-sm font-medium" style={{ color: '#86909C' }}>姓名</th>
                          <th className="px-3 py-2 text-left text-sm font-medium" style={{ color: '#86909C' }}>工种</th>
                          <th className="px-3 py-2 text-left text-sm font-medium" style={{ color: '#86909C' }}>身份证号</th>
                          <th className="px-3 py-2 text-left text-sm font-medium" style={{ color: '#86909C' }}>删除时间</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y" style={{ borderColor: '#E5E6EB' }}>
                        {backups.map((backup, index) => (
                          <tr
                            key={backup.id}
                            className="hover:bg-gray-50 cursor-pointer"
                            style={{ backgroundColor: selectedBackupIds.has(backup.id) ? '#E8F3FF' : index % 2 === 1 ? '#FAFBFD' : 'transparent' }}
                            onClick={() => handleSelectBackup(backup.id)}
                          >
                            <td className="px-3 py-2">
                              <input
                                type="checkbox"
                                checked={selectedBackupIds.has(backup.id)}
                                onChange={() => handleSelectBackup(backup.id)}
                                className="w-4 h-4"
                              />
                            </td>
                            <td className="px-3 py-2 text-sm font-medium" style={{ color: '#1D2129' }}>{backup.name}</td>
                            <td className="px-3 py-2 text-sm" style={{ color: '#4E5969' }}>{backup.work_type || '-'}</td>
                            <td className="px-3 py-2 text-sm" style={{ color: '#4E5969' }}>{backup.id_card || '-'}</td>
                            <td className="px-3 py-2 text-sm" style={{ color: '#86909C' }}>{formatDate(backup.deleted_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* 分页 */}
                  {totalBackups > pageSize && (
                    <div className="flex justify-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page === 1}
                        onClick={() => setPage(p => p - 1)}
                      >
                        上一页
                      </Button>
                      <span className="px-3 py-1 text-sm" style={{ color: '#86909C' }}>
                        第 {page} 页
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page * pageSize >= totalBackups}
                        onClick={() => setPage(p => p + 1)}
                      >
                        下一页
                      </Button>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-8">
                  <Users className="w-12 h-12 mx-auto mb-3" style={{ color: '#C9CDD4' }} />
                  <p style={{ color: '#86909C' }}>暂无可恢复的备份数据</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 底部 */}
        <div className="flex justify-end pt-3 border-t" style={{ borderColor: '#E5E6EB' }}>
          <Button variant="outline" onClick={handleClose}>
            关闭
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
