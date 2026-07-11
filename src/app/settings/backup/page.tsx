"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Download, Trash2, RefreshCw, Database, Clock, CheckCircle, XCircle, Play, Settings, FileText, HardDrive } from "lucide-react";

interface BackupRecord {
  id: number;
  backup_date: string;
  backup_type: string;
  file_name: string;
  file_size: number;
  file_key: string;
  file_url: string;
  modules: string;
  status: string;
  error_message: string;
  record_count: number;
  created_by_name: string;
  created_at: string;
  completed_at: string;
}

interface BackupSummary {
  total: number;
  success: number;
  failed: number;
  manual: number;
  auto: number;
}

const MODULE_OPTIONS = [
  { id: "suppliers", name: "供应商台账" },
  { id: "contracts", name: "合同管理" },
  { id: "settlements", name: "结算单" },
  { id: "workers", name: "工人花名册" },
  { id: "limit_prices", name: "项目限价" },
  { id: "payments", name: "付款记录" },
];

const MODULE_NAMES: Record<string, string> = {
  suppliers: "供应商台账",
  contracts: "合同管理",
  settlements: "结算单",
  workers: "工人花名册",
  limit_prices: "项目限价",
  payments: "付款记录",
};

export default function BackupPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [records, setRecords] = useState<BackupRecord[]>([]);
  const [summary, setSummary] = useState<BackupSummary>({ total: 0, success: 0, failed: 0, manual: 0, auto: 0 });
  const [isBackupDialogOpen, setIsBackupDialogOpen] = useState(false);
  const [selectedModules, setSelectedModules] = useState<string[]>(["suppliers", "contracts", "settlements", "workers", "limit_prices"]);
  const [backingUp, setBackingUp] = useState(false);
  const [backupProgress, setBackupProgress] = useState("");
  const [currentRecordId, setCurrentRecordId] = useState<number | null>(null);
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);

  const loadRecords = useCallback(async () => {
    try {
      const res = await fetch("/api/backups/records?days=90");
      const data = await res.json();
      if (data.data) {
        setRecords(data.data);
        setSummary(data.summary || summary);
      }
    } catch (error) {
      console.error("Failed to load records:", error);
    }
  }, []);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  // 轮询备份状态
  useEffect(() => {
    if (currentRecordId && backingUp) {
      const interval = setInterval(async () => {
        try {
          const res = await fetch("/api/backups/records");
          const data = await res.json();
          const record = data.data?.find((r: BackupRecord) => r.id === currentRecordId);
          
          if (record) {
            if (record.status === "success") {
              setBackupProgress("备份完成！");
              setBackingUp(false);
              setCurrentRecordId(null);
              clearInterval(interval);
              loadRecords();
              toast({ title: "备份成功", description: `共导出 ${record.record_count || 0} 条记录` });
            } else if (record.status === "failed") {
              setBackupProgress(`备份失败: ${record.error_message || "未知错误"}`);
              setBackingUp(false);
              setCurrentRecordId(null);
              clearInterval(interval);
            } else {
              setBackupProgress(record.status === "running" ? "正在导出数据..." : "等待中...");
            }
          }
        } catch (error) {
          console.error("Poll error:", error);
        }
      }, 2000);

      setPollingInterval(interval);
      return () => clearInterval(interval);
    }
  }, [currentRecordId, backingUp, loadRecords, toast]);

  const handleBackup = async () => {
    if (selectedModules.length === 0) {
      toast({ title: "请选择至少一个模块", variant: "error" });
      return;
    }

    setBackingUp(true);
    setBackupProgress("正在创建备份任务...");

    try {
      // 创建备份记录
      const createRes = await fetch("/api/backups/records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "trigger",
          module: selectedModules.join(","),
        }),
      });

      const createData = await createRes.json();
      if (!createData.success) {
        throw new Error(createData.error || "创建备份任务失败");
      }

      const recordId = createData.data.record_id;
      setCurrentRecordId(recordId);

      // 触发导出
      setBackupProgress("正在导出数据...");
      const exportRes = await fetch("/api/backups/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          record_id: recordId,
          modules: selectedModules,
        }),
      });

      const exportData = await exportRes.json();
      if (!exportData.success) {
        throw new Error(exportData.error || "导出失败");
      }

    } catch (error: any) {
      setBackingUp(false);
      setBackupProgress("");
      setCurrentRecordId(null);
      toast({ title: "备份失败", description: error.message, variant: "error" });
    }
  };

  const handleCleanup = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/backups/cleanup", { method: "POST" });
      const data = await res.json();
      
      if (data.success) {
        toast({ title: "清理完成", description: data.message });
        loadRecords();
      } else {
        toast({ title: "清理失败", description: data.error, variant: "error" });
      }
    } catch (error: any) {
      toast({ title: "清理失败", description: error.message, variant: "error" });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("确定要删除这条备份记录吗？")) return;

    try {
      const res = await fetch(`/api/backups/records?id=${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json();

      if (data.success) {
        toast({ title: "删除成功" });
        loadRecords();
      } else {
        toast({ title: "删除失败", description: data.error, variant: "error" });
      }
    } catch (error: any) {
      toast({ title: "删除失败", description: error.message, variant: "error" });
    }
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return "-";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleString("zh-CN");
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "success":
        return <Badge className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" />成功</Badge>;
      case "failed":
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />失败</Badge>;
      case "running":
        return <Badge className="bg-blue-500"><RefreshCw className="w-3 h-3 mr-1 animate-spin" />进行中</Badge>;
      default:
        return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />等待</Badge>;
    }
  };

  const toggleModule = (moduleId: string) => {
    setSelectedModules((prev) =>
      prev.includes(moduleId)
        ? prev.filter((m) => m !== moduleId)
        : [...prev, moduleId]
    );
  };

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6">
      {/* 页面标题 */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            <Database className="w-6 h-6" />
            数据备份管理
          </h1>
          <p className="text-muted-foreground mt-1">系统核心数据定期备份，确保数据安全</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setIsBackupDialogOpen(true)} className="gap-2">
            <Play className="w-4 h-4" />
            立即备份
          </Button>
          <Button variant="outline" onClick={handleCleanup} disabled={loading} className="gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            清理过期备份
          </Button>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-2xl md:text-3xl font-bold">{summary.total}</p>
              <p className="text-xs md:text-sm text-muted-foreground">总备份数</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-2xl md:text-3xl font-bold text-green-600">{summary.success}</p>
              <p className="text-xs md:text-sm text-muted-foreground">成功</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-2xl md:text-3xl font-bold text-red-600">{summary.failed}</p>
              <p className="text-xs md:text-sm text-muted-foreground">失败</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-2xl md:text-3xl font-bold text-blue-600">{summary.manual}</p>
              <p className="text-xs md:text-sm text-muted-foreground">手动备份</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-2xl md:text-3xl font-bold text-purple-600">{summary.auto}</p>
              <p className="text-xs md:text-sm text-muted-foreground">自动备份</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 说明卡片 */}
      <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/20">
        <CardContent className="pt-4">
          <div className="flex items-start gap-3">
            <Settings className="w-5 h-5 text-blue-600 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-blue-900 dark:text-blue-100">备份说明</p>
              <ul className="mt-1 text-blue-700 dark:text-blue-300 space-y-1">
                <li>• 支持导出：供应商台账、合同管理、结算单、工人花名册、项目限价、付款记录</li>
                <li>• 备份文件自动上传至对象存储，支持下载</li>
                <li>• 自动清理30天前的过期备份记录</li>
                <li>• 建议定期（每月或每周）进行手动备份</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 备份记录列表 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            备份记录
          </CardTitle>
          <CardDescription>最近90天的备份记录列表</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[100px]">备份日期</TableHead>
                  <TableHead className="min-w-[80px]">类型</TableHead>
                  <TableHead className="min-w-[80px]">状态</TableHead>
                  <TableHead className="min-w-[100px]">记录数</TableHead>
                  <TableHead className="min-w-[150px] hidden md:table-cell">备份模块</TableHead>
                  <TableHead className="min-w-[100px] hidden md:table-cell">操作人</TableHead>
                  <TableHead className="min-w-[100px]">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      暂无备份记录
                    </TableCell>
                  </TableRow>
                ) : (
                  records.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell className="font-mono text-sm">
                        {formatDate(record.created_at)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={record.backup_type === "manual" ? "default" : "outline"}>
                          {record.backup_type === "manual" ? "手动" : "自动"}
                        </Badge>
                      </TableCell>
                      <TableCell>{getStatusBadge(record.status)}</TableCell>
                      <TableCell>{record.record_count || 0}</TableCell>
                      <TableCell className="hidden md:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {record.modules?.split(",").map((m) => (
                            <Badge key={m} variant="secondary" className="text-xs">
                              {MODULE_NAMES[m] || m}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">{record.created_by_name || "-"}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {record.status === "success" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2"
                              onClick={() => {
                                toast({ title: "文件路径", description: record.file_key });
                              }}
                            >
                              <Download className="w-4 h-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-red-500"
                            onClick={() => handleDelete(record.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* 备份对话框 */}
      <Dialog open={isBackupDialogOpen} onOpenChange={setIsBackupDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Database className="w-5 h-5" />
              立即备份
            </DialogTitle>
            <DialogDescription>
              选择要备份的模块，系统将导出数据并保存到云存储
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {backingUp && (
              <div className="bg-blue-50 dark:bg-blue-950/20 p-4 rounded-lg">
                <div className="flex items-center gap-2 text-blue-600">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span className="font-medium">{backupProgress}</span>
                </div>
              </div>
            )}

            <div>
              <Label className="text-base font-medium mb-3 block">选择备份模块</Label>
              <div className="grid grid-cols-2 gap-3">
                {MODULE_OPTIONS.map((module) => (
                  <div
                    key={module.id}
                    className={`flex items-center gap-2 p-3 border rounded-lg cursor-pointer transition-colors ${
                      selectedModules.includes(module.id)
                        ? "border-primary bg-primary/5"
                        : "hover:bg-muted/50"
                    }`}
                    onClick={() => !backingUp && toggleModule(module.id)}
                  >
                    <Checkbox
                      checked={selectedModules.includes(module.id)}
                      disabled={backingUp}
                      onCheckedChange={() => !backingUp && toggleModule(module.id)}
                    />
                    <span className="text-sm">{module.name}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-muted/50 p-3 rounded-lg">
              <p className="text-sm text-muted-foreground">
                已选择 <span className="font-medium">{selectedModules.length}</span> 个模块
              </p>
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setIsBackupDialogOpen(false);
                setBackingUp(false);
                setBackupProgress("");
                setCurrentRecordId(null);
              }}
            >
              {backingUp ? "取消" : "关闭"}
            </Button>
            <Button
              onClick={handleBackup}
              disabled={backingUp || selectedModules.length === 0}
              className="gap-2"
            >
              {backingUp ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  备份中...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  开始备份
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
