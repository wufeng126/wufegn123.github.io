'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Link2, Pencil, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';

interface ProjectOption {
  id: number;
  name: string;
  year?: string | number | null;
  status?: string | null;
}

interface WpsBinding {
  id: number;
  project_id: number;
  wps_project_name?: string | null;
  worksheet_name?: string | null;
  wps_form_id?: string | null;
  wps_sheet_id?: string | null;
  wps_table_id?: string | null;
  is_active?: boolean;
  remark?: string | null;
  last_sync_at?: string | null;
  last_sync_status?: string | null;
  last_sync_message?: string | null;
  projects?: ProjectOption | ProjectOption[] | null;
}

interface BindingStats {
  totalBindings: number;
  activeBindings: number;
  configuredProjects: number;
  unconfiguredProjects: number;
}

interface BindingForm {
  id?: number;
  projectId: string;
  wpsProjectName: string;
  worksheetName: string;
  wpsFormId: string;
  wpsSheetId: string;
  wpsTableId: string;
  isActive: boolean;
  remark: string;
}

const emptyForm: BindingForm = {
  projectId: '',
  wpsProjectName: '',
  worksheetName: '',
  wpsFormId: '',
  wpsSheetId: '',
  wpsTableId: '',
  isActive: true,
  remark: '',
};

function getProject(binding: WpsBinding): ProjectOption | null {
  if (!binding.projects) return null;
  return Array.isArray(binding.projects) ? binding.projects[0] : binding.projects;
}

function formatDateTime(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('zh-CN');
}

function statusBadge(status?: string | null) {
  if (status === 'success') return <Badge className="bg-green-600">成功</Badge>;
  if (status === 'warning') return <Badge variant="outline" className="border-amber-300 text-amber-700">提醒</Badge>;
  if (status === 'error') return <Badge variant="destructive">失败</Badge>;
  return <Badge variant="secondary">未同步</Badge>;
}

export default function WpsConfigPage() {
  const { toast } = useToast();
  const [bindings, setBindings] = useState<WpsBinding[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [stats, setStats] = useState<BindingStats>({ totalBindings: 0, activeBindings: 0, configuredProjects: 0, unconfiguredProjects: 0 });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<BindingForm>(emptyForm);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/integrations/wps/workers/bindings');
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || '获取 WPS 配置失败');
      setBindings(data.bindings || []);
      setProjects(data.projects || []);
      setStats(data.stats || { totalBindings: 0, activeBindings: 0, configuredProjects: 0, unconfiguredProjects: 0 });
    } catch (error) {
      toast({ title: '加载失败', description: error instanceof Error ? error.message : '获取 WPS 配置失败', variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchData();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchData]);

  const filteredBindings = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return bindings;
    return bindings.filter((binding) => {
      const project = getProject(binding);
      return [
        project?.name,
        binding.wps_project_name,
        binding.worksheet_name,
        binding.wps_form_id,
        binding.wps_sheet_id,
        binding.wps_table_id,
        binding.last_sync_message,
      ].some((value) => value?.toLowerCase().includes(keyword));
    });
  }, [bindings, search]);

  const openCreateDialog = () => {
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEditDialog = (binding: WpsBinding) => {
    setForm({
      id: binding.id,
      projectId: String(binding.project_id),
      wpsProjectName: binding.wps_project_name || '',
      worksheetName: binding.worksheet_name || '',
      wpsFormId: binding.wps_form_id || '',
      wpsSheetId: binding.wps_sheet_id || '',
      wpsTableId: binding.wps_table_id || '',
      isActive: binding.is_active !== false,
      remark: binding.remark || '',
    });
    setDialogOpen(true);
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const response = await fetch('/api/integrations/wps/workers/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || '同步失败');
      toast({
        title: '同步完成',
        description: `成功 ${data.summary?.created || 0} 条，更新 ${data.summary?.updated || 0} 条，失败 ${data.summary?.failed || 0} 条`,
      });
      await fetchData();
    } catch (error) {
      toast({ title: '同步失败', description: error instanceof Error ? error.message : '同步 WPS 数据失败', variant: 'error' });
    } finally {
      setSyncing(false);
    }
  };

  const saveBinding = async () => {
    if (!form.projectId) {
      toast({ title: '请选择系统项目', variant: 'error' });
      return;
    }
    if (!form.wpsProjectName && !form.worksheetName && !form.wpsFormId && !form.wpsSheetId && !form.wpsTableId) {
      toast({ title: '请至少填写一个 WPS 名称或 ID', variant: 'error' });
      return;
    }

    setSaving(true);
    try {
      const response = await fetch('/api/integrations/wps/workers/bindings', {
        method: form.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          projectId: Number(form.projectId),
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || '保存失败');
      toast({ title: form.id ? '配置已更新' : '配置已新增' });
      setDialogOpen(false);
      await fetchData();
    } catch (error) {
      toast({ title: '保存失败', description: error instanceof Error ? error.message : '保存 WPS 配置失败', variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (binding: WpsBinding) => {
    const project = getProject(binding);
    const response = await fetch('/api/integrations/wps/workers/bindings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: binding.id,
        projectId: binding.project_id,
        wpsProjectName: binding.wps_project_name || '',
        worksheetName: binding.worksheet_name || '',
        wpsFormId: binding.wps_form_id || '',
        wpsSheetId: binding.wps_sheet_id || '',
        wpsTableId: binding.wps_table_id || '',
        isActive: binding.is_active === false,
        remark: binding.remark || '',
      }),
    });
    const data = await response.json();
    if (!response.ok || !data.success) {
      toast({ title: '操作失败', description: data.error || '更新启用状态失败', variant: 'error' });
      return;
    }
    toast({ title: binding.is_active === false ? '已启用同步' : '已停用同步', description: project?.name });
    await fetchData();
  };

  const deleteBinding = async (binding: WpsBinding) => {
    if (!window.confirm('确认删除这条 WPS 绑定配置吗？删除后不会影响已同步的工人档案。')) return;
    const response = await fetch(`/api/integrations/wps/workers/bindings?id=${binding.id}`, { method: 'DELETE' });
    const data = await response.json();
    if (!response.ok || !data.success) {
      toast({ title: '删除失败', description: data.error || '删除 WPS 配置失败', variant: 'error' });
      return;
    }
    toast({ title: '配置已删除' });
    await fetchData();
  };

  return (
    <div className="space-y-5 p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">WPS 花名册同步配置</h1>
          <p className="mt-1 text-sm text-gray-500">绑定系统项目与 WPS 表单、工作表或多维表格，确保扫码填报稳定进入正确项目。</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </Button>
          <Button variant="outline" onClick={handleSync} disabled={syncing}>
            <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
            立即同步
          </Button>
          <Button onClick={openCreateDialog}>
            <Plus className="mr-2 h-4 w-4" />
            新增绑定
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-gray-500">绑定数量</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{stats.totalBindings}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-gray-500">启用同步</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold text-green-600">{stats.activeBindings}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-gray-500">已配置项目</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{stats.configuredProjects}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-gray-500">未配置项目</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold text-amber-600">{stats.unconfiguredProjects}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <CardTitle className="text-base">绑定台账</CardTitle>
            <div className="relative w-full md:w-80">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <Input className="pl-9" placeholder="搜索项目、WPS名称或ID" value={search} onChange={(event) => setSearch(event.target.value)} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredBindings.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-14 text-center text-gray-500">
              <Link2 className="mb-3 h-9 w-9 text-gray-300" />
              <p>{loading ? '正在加载配置...' : '暂无 WPS 项目绑定配置'}</p>
              {!loading && <p className="mt-1 text-sm">新增后，WPS 同步会优先按绑定关系识别项目。</p>}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>系统项目</TableHead>
                  <TableHead>WPS 名称</TableHead>
                  <TableHead>稳定 ID</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>最近同步</TableHead>
                  <TableHead>同步结果</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredBindings.map((binding) => {
                  const project = getProject(binding);
                  return (
                    <TableRow key={binding.id}>
                      <TableCell>
                        <div className="font-medium">{project?.name || `项目 #${binding.project_id}`}</div>
                        <div className="text-xs text-gray-500">{project?.year || '-'}</div>
                      </TableCell>
                      <TableCell>
                        <div>{binding.wps_project_name || '-'}</div>
                        <div className="text-xs text-gray-500">工作表：{binding.worksheet_name || '-'}</div>
                      </TableCell>
                      <TableCell className="max-w-64 text-xs text-gray-600">
                        <div className="truncate">表单：{binding.wps_form_id || '-'}</div>
                        <div className="truncate">工作表ID：{binding.wps_sheet_id || '-'}</div>
                        <div className="truncate">多维表格：{binding.wps_table_id || '-'}</div>
                      </TableCell>
                      <TableCell>
                        {binding.is_active === false ? (
                          <Badge variant="secondary">已停用</Badge>
                        ) : (
                          <Badge className="bg-blue-600">启用中</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-gray-600">{formatDateTime(binding.last_sync_at)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {statusBadge(binding.last_sync_status)}
                          {binding.last_sync_status === 'error' ? <AlertCircle className="h-4 w-4 text-red-500" /> : null}
                          {binding.last_sync_status === 'success' ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : null}
                        </div>
                        <div className="mt-1 max-w-56 truncate text-xs text-gray-500" title={binding.last_sync_message || ''}>
                          {binding.last_sync_message || '-'}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openEditDialog(binding)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => toggleActive(binding)}>
                            {binding.is_active === false ? '启用' : '停用'}
                          </Button>
                          <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700" onClick={() => deleteBinding(binding)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{form.id ? '编辑 WPS 绑定' : '新增 WPS 绑定'}</DialogTitle>
            <DialogDescription>优先填写稳定 ID；如果暂时拿不到 ID，可以先填写 WPS 项目名称或工作表名称。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label>系统项目</Label>
              <Select value={form.projectId} onValueChange={(value) => setForm((prev) => ({ ...prev, projectId: value }))}>
                <SelectTrigger><SelectValue placeholder="选择系统项目" /></SelectTrigger>
                <SelectContent>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={String(project.id)}>
                      {project.name}{project.year ? ` - ${project.year}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>WPS 项目名称</Label>
              <Input value={form.wpsProjectName} onChange={(event) => setForm((prev) => ({ ...prev, wpsProjectName: event.target.value }))} placeholder="如：A项目花名册" />
            </div>
            <div className="space-y-2">
              <Label>WPS 工作表名称</Label>
              <Input value={form.worksheetName} onChange={(event) => setForm((prev) => ({ ...prev, worksheetName: event.target.value }))} placeholder="如：A项目" />
            </div>
            <div className="space-y-2">
              <Label>WPS 表单 ID</Label>
              <Input value={form.wpsFormId} onChange={(event) => setForm((prev) => ({ ...prev, wpsFormId: event.target.value }))} placeholder="可选，推荐填写" />
            </div>
            <div className="space-y-2">
              <Label>WPS 工作表 ID</Label>
              <Input value={form.wpsSheetId} onChange={(event) => setForm((prev) => ({ ...prev, wpsSheetId: event.target.value }))} placeholder="可选，推荐填写" />
            </div>
            <div className="space-y-2">
              <Label>WPS 多维表格 ID</Label>
              <Input value={form.wpsTableId} onChange={(event) => setForm((prev) => ({ ...prev, wpsTableId: event.target.value }))} placeholder="可选" />
            </div>
            <div className="flex items-center justify-between rounded-lg border px-3 py-2">
              <div>
                <Label>启用同步</Label>
                <p className="text-xs text-gray-500">停用后不会按此绑定识别项目</p>
              </div>
              <Switch checked={form.isActive} onCheckedChange={(value) => setForm((prev) => ({ ...prev, isActive: value }))} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>备注</Label>
              <Textarea value={form.remark} onChange={(event) => setForm((prev) => ({ ...prev, remark: event.target.value }))} placeholder="例如：WPS 二维码负责人、表单用途等" rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button onClick={saveBinding} disabled={saving}>{saving ? '保存中...' : '保存配置'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
