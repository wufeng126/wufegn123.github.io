'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, ClipboardList, Copy, ExternalLink, FileSpreadsheet, Info, Link2, Pencil, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
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
  wps_document_url?: string | null;
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

interface SyncLog {
  id: number;
  project_name?: string | null;
  worksheet_name?: string | null;
  worker_name?: string | null;
  action?: string | null;
  status?: string | null;
  message?: string | null;
  created_at?: string | null;
}

interface BindingStats {
  totalBindings: number;
  activeBindings: number;
  configuredProjects: number;
  unconfiguredProjects: number;
}

interface IntegrationInfo {
  webhookPath: string;
  tokenConfigured: boolean;
  pullCredentialConfigured: boolean;
}

interface BindingForm {
  id?: number;
  projectId: string;
  wpsProjectName: string;
  worksheetName: string;
  wpsDocumentUrl: string;
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
  wpsDocumentUrl: '',
  wpsFormId: '',
  wpsSheetId: '',
  wpsTableId: '',
  isActive: true,
  remark: '',
};

const webhookSamplePayload = `{
  "姓名": "张三",
  "性别": "男",
  "身份证号": "110101199001011234",
  "联系方式": "13800000000",
  "银行卡号": "6222000000000000",
  "入场日期": "2026-07-15",
  "工种": "木工",
  "班组": "张三班组"
}`;

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

function actionText(action?: string | null) {
  const map: Record<string, string> = {
    created: '新增',
    updated: '更新',
    transferred: '调入',
    skipped: '跳过',
    error: '失败',
  };
  return action ? map[action] || action : '-';
}

export default function WpsConfigPage() {
  const { toast } = useToast();
  const [bindings, setBindings] = useState<WpsBinding[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [stats, setStats] = useState<BindingStats>({ totalBindings: 0, activeBindings: 0, configuredProjects: 0, unconfiguredProjects: 0 });
  const [integration, setIntegration] = useState<IntegrationInfo>({ webhookPath: '/api/integrations/wps/workers/webhook', tokenConfigured: false, pullCredentialConfigured: false });
  const [origin] = useState(() => (typeof window === 'undefined' ? '' : window.location.origin));
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [testingBindingId, setTestingBindingId] = useState<number | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<BindingForm>(emptyForm);

  const fetchLogs = useCallback(async () => {
    try {
      const response = await fetch('/api/integrations/wps/workers/logs?pageSize=8');
      const data = await response.json();
      if (response.ok && data.success) setLogs(data.logs || []);
    } catch {
      setLogs([]);
    }
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/integrations/wps/workers/bindings');
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || '获取 WPS 配置失败');
      setBindings(data.bindings || []);
      setProjects(data.projects || []);
      setStats(data.stats || { totalBindings: 0, activeBindings: 0, configuredProjects: 0, unconfiguredProjects: 0 });
      setIntegration(data.integration || { webhookPath: '/api/integrations/wps/workers/webhook', tokenConfigured: false, pullCredentialConfigured: false });
      await fetchLogs();
    } catch (error) {
      toast({ title: '加载失败', description: error instanceof Error ? error.message : '获取 WPS 配置失败', variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [fetchLogs, toast]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchData();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchData]);

  const webhookUrl = `${origin}${integration.webhookPath}`;

  const filteredBindings = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return bindings;
    return bindings.filter((binding) => {
      const project = getProject(binding);
      return [
        project?.name,
        binding.wps_project_name,
        binding.worksheet_name,
        binding.wps_document_url,
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
      wpsDocumentUrl: binding.wps_document_url || '',
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
      if (!response.ok) throw new Error(data.error || '同步失败');
      const summary = data.summary || {};
      toast({
        title: data.success ? '同步完成' : '同步检查完成',
        description: data.success
          ? `新增 ${summary.created || 0} 人，更新 ${summary.updated || 0} 人，调入 ${summary.transferred || 0} 人，失败 ${summary.failed || 0} 条`
          : data.message || '请查看绑定台账中的同步结果说明',
        variant: data.success ? 'default' : 'warning',
      });
      await fetchData();
    } catch (error) {
      toast({ title: '同步失败', description: error instanceof Error ? error.message : '同步 WPS 数据失败', variant: 'error' });
    } finally {
      setSyncing(false);
    }
  };

  const testBinding = async (binding: WpsBinding) => {
    setTestingBindingId(binding.id);
    try {
      const response = await fetch('/api/integrations/wps/workers/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testOnly: true, bindingId: binding.id }),
      });
      const data = await response.json();
      const result = data.bindingResults?.[0];
      if (!response.ok) throw new Error(data.error || '测试失败');
      toast({
        title: result?.status === 'success' ? '测试通过' : '测试完成',
        description: result?.message || data.message || '测试不会写入工人档案',
        variant: result?.status === 'error' ? 'error' : result?.status === 'warning' ? 'warning' : 'default',
      });
    } catch (error) {
      toast({ title: '测试失败', description: error instanceof Error ? error.message : 'WPS 绑定测试失败', variant: 'error' });
    } finally {
      setTestingBindingId(null);
    }
  };

  const saveBinding = async () => {
    if (!form.projectId) {
      toast({ title: '请选择系统项目', variant: 'error' });
      return;
    }
    if (!form.wpsDocumentUrl && !form.wpsProjectName && !form.worksheetName && !form.wpsFormId && !form.wpsSheetId && !form.wpsTableId) {
      toast({ title: '请至少填写一个 WPS 文档链接、名称或 ID', variant: 'error' });
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
    const response = await fetch('/api/integrations/wps/workers/bindings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: binding.id,
        projectId: binding.project_id,
        wpsProjectName: binding.wps_project_name || '',
        worksheetName: binding.worksheet_name || '',
        wpsDocumentUrl: binding.wps_document_url || '',
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
    toast({ title: binding.is_active === false ? '已启用同步' : '已停用同步' });
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

  const copyText = async (text: string, title: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title });
    } catch {
      toast({ title: '复制失败', description: '请手动选中文本复制', variant: 'error' });
    }
  };

  const getDedicatedWebhookUrl = (binding: WpsBinding) => `${webhookUrl}?bindingId=${binding.id}&token=YOUR_SYNC_TOKEN`;

  return (
    <div className="space-y-5 p-3 sm:p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">WPS 花名册同步配置</h1>
          <p className="mt-1 text-sm text-gray-500">绑定系统项目与 WPS 表单、多维表格或可下载文档链接，扫码填报后进入工人档案。</p>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
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

      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="border-blue-100 bg-blue-50/60">
          <CardContent className="flex gap-3 p-4">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" />
            <div>
              <p className="font-medium text-blue-950">1. 先绑定系统项目</p>
              <p className="mt-1 text-sm leading-6 text-blue-800">
                每个系统项目绑定一个 WPS 工作表或二维码来源。你把 WPS 工作表名称改成系统项目名称后，系统会优先按稳定 ID，其次按项目/工作表名称识别。
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-emerald-100 bg-emerald-50/60">
          <CardContent className="flex gap-3 p-4">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
            <div>
              <p className="font-medium text-emerald-950">2. 再测试同步</p>
              <p className="mt-1 text-sm leading-6 text-emerald-800">
                “测试”只读取和解析，不写入工人档案；“立即同步”才会新增、更新或调入当前项目。身份证照片、银行卡照片等附件字段不会保存。
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-amber-100 bg-amber-50/60">
          <CardContent className="flex gap-3 p-4">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
            <div>
              <p className="font-medium text-amber-950">3. 冲突处理口径</p>
              <p className="mt-1 text-sm leading-6 text-amber-800">
                身份证号相同视为同一工人；重复进入新项目时更新当前项目和调动记录，历史工资仍按原项目、原月份保留。
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <CardTitle className="text-base">绑定台账</CardTitle>
              <div className="relative w-full md:w-80">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                <Input className="pl-9" placeholder="搜索项目、链接、WPS 名称或 ID" value={search} onChange={(event) => setSearch(event.target.value)} />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {filteredBindings.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-14 text-center text-gray-500">
                <Link2 className="mb-3 h-9 w-9 text-gray-300" />
                <p>{loading ? '正在加载配置...' : '暂无 WPS 项目绑定配置'}</p>
                {!loading && <p className="mt-1 text-sm">新增后，系统会按绑定关系识别项目并写入工人档案。</p>}
              </div>
            ) : (
              <>
              <div className="hidden overflow-x-auto md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>系统项目</TableHead>
                    <TableHead>WPS 文档</TableHead>
                    <TableHead>匹配标识</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>最近同步</TableHead>
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
                        <TableCell className="max-w-72">
                          <div className="font-medium">{binding.wps_project_name || binding.worksheet_name || '-'}</div>
                          {binding.wps_document_url ? (
                            <a className="mt-1 flex items-center gap-1 truncate text-xs text-blue-600 hover:underline" href={binding.wps_document_url} target="_blank" rel="noreferrer">
                              <ExternalLink className="h-3 w-3 shrink-0" />
                              {binding.wps_document_url}
                            </a>
                          ) : (
                            <div className="mt-1 text-xs text-gray-500">未配置文档链接</div>
                          )}
                        </TableCell>
                        <TableCell className="max-w-64 text-xs text-gray-600">
                          <div className="truncate">表单：{binding.wps_form_id || '-'}</div>
                          <div className="truncate">工作表ID：{binding.wps_sheet_id || '-'}</div>
                          <div className="truncate">多维表格：{binding.wps_table_id || '-'}</div>
                        </TableCell>
                        <TableCell>
                          {binding.is_active === false ? <Badge variant="secondary">已停用</Badge> : <Badge className="bg-blue-600">启用中</Badge>}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {statusBadge(binding.last_sync_status)}
                            {binding.last_sync_status === 'error' ? <AlertCircle className="h-4 w-4 text-red-500" /> : null}
                            {binding.last_sync_status === 'success' ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : null}
                          </div>
                          <div className="mt-1 text-xs text-gray-500">{formatDateTime(binding.last_sync_at)}</div>
                          <div className="mt-1 max-w-56 truncate text-xs text-gray-500" title={binding.last_sync_message || ''}>
                            {binding.last_sync_message || '-'}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => testBinding(binding)} disabled={testingBindingId === binding.id}>
                              {testingBindingId === binding.id ? '测试中' : '测试'}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => copyText(getDedicatedWebhookUrl(binding), '专属 Webhook 地址已复制')}
                              title="复制专属 Webhook 地址"
                            >
                              <Copy className="mr-1 h-4 w-4" />
                              地址
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => openEditDialog(binding)} title="编辑">
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => toggleActive(binding)}>
                              {binding.is_active === false ? '启用' : '停用'}
                            </Button>
                            <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700" onClick={() => deleteBinding(binding)} title="删除">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              </div>
              <div className="grid gap-3 md:hidden">
                {filteredBindings.map((binding) => {
                  const project = getProject(binding);
                  return (
                    <article key={binding.id} className="rounded-lg border bg-white p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="truncate text-sm font-semibold text-gray-900">{project?.name || `项目 #${binding.project_id}`}</h3>
                          <div className="mt-1 text-xs text-gray-500">{binding.wps_project_name || binding.worksheet_name || '未配置 WPS 名称'}</div>
                        </div>
                        {binding.is_active === false ? <Badge variant="secondary">已停用</Badge> : <Badge className="bg-blue-600">启用中</Badge>}
                      </div>
                      <div className="mt-3 space-y-2 rounded-md bg-gray-50 p-3 text-xs text-gray-600">
                        <div className="truncate">表单：{binding.wps_form_id || '-'}</div>
                        <div className="truncate">工作表ID：{binding.wps_sheet_id || '-'}</div>
                        <div className="truncate">多维表格：{binding.wps_table_id || '-'}</div>
                        {binding.wps_document_url ? (
                          <a className="flex items-center gap-1 truncate text-blue-600" href={binding.wps_document_url} target="_blank" rel="noreferrer">
                            <ExternalLink className="h-3 w-3 shrink-0" />
                            {binding.wps_document_url}
                          </a>
                        ) : null}
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-2 text-xs text-gray-500">
                        <div>
                          <div className="flex items-center gap-2">{statusBadge(binding.last_sync_status)}</div>
                          <div className="mt-1">{formatDateTime(binding.last_sync_at)}</div>
                        </div>
                        <div className="flex gap-1">
                          <Button variant="outline" size="sm" onClick={() => testBinding(binding)} disabled={testingBindingId === binding.id}>
                            {testingBindingId === binding.id ? '测试中' : '测试'}
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => openEditDialog(binding)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <div className="mt-2 grid grid-cols-3 gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copyText(getDedicatedWebhookUrl(binding), '专属 Webhook 地址已复制')}
                        >
                          <Copy className="mr-1 h-4 w-4" />地址
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => toggleActive(binding)}>
                          {binding.is_active === false ? '启用' : '停用'}
                        </Button>
                        <Button variant="outline" size="sm" className="text-red-600" onClick={() => deleteBinding(binding)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </article>
                  );
                })}
              </div>
              </>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <FileSpreadsheet className="h-4 w-4" />
                接入状态
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="rounded-lg border bg-gray-50 p-3">
                <div className="text-xs text-gray-500">Webhook 地址</div>
                <div className="mt-1 break-all font-mono text-xs text-gray-800">{webhookUrl}</div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-2 h-8 bg-white"
                  onClick={() => copyText(webhookUrl, 'Webhook 地址已复制')}
                >
                  <Copy className="mr-1 h-3.5 w-3.5" />
                  复制地址
                </Button>
              </div>
              <div className="flex items-center justify-between">
                <span>同步 Token</span>
                {integration.tokenConfigured ? <Badge className="bg-green-600">已配置</Badge> : <Badge variant="destructive">未配置</Badge>}
              </div>
              <div className="flex items-center justify-between">
                <span>主动拉取凭证</span>
                {integration.pullCredentialConfigured ? <Badge className="bg-green-600">已配置</Badge> : <Badge variant="outline">未配置</Badge>}
              </div>
              <p className="text-xs leading-5 text-gray-500">
                实时同步建议在绑定台账中复制项目专属地址；文档链接仅在服务器能直接下载表格时支持手动拉取。
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Link2 className="h-4 w-4" />
                WPS 自动化配置
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="space-y-2 rounded-lg border bg-gray-50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-gray-900">HTTP 请求</span>
                  <Badge variant="outline">POST</Badge>
                </div>
                <p className="text-xs leading-5 text-gray-600">在 WPS 表单/多维表格自动化中设置“新增记录后发送 HTTP 请求”，URL 使用绑定台账里的专属地址。</p>
              </div>
              <div className="rounded-lg border bg-gray-50 p-3">
                <div className="text-xs text-gray-500">专属地址</div>
                <div className="mt-1 text-xs leading-5 text-gray-600">
                  点击绑定台账中的复制图标，粘贴到 WPS 请求 URL 后，把 <span className="font-mono text-gray-800">YOUR_SYNC_TOKEN</span> 替换为你的同步 Token。使用专属地址后，请求体不用再传项目名称。
                </div>
              </div>
              <div className="rounded-lg border bg-gray-50 p-3">
                <div className="text-xs text-gray-500">Header</div>
                <div className="mt-1 font-mono text-xs text-gray-800">Content-Type: application/json</div>
                <div className="mt-1 text-xs leading-5 text-gray-500">如果不想把 Token 放在 URL，也可以在 Header 里加 x-wps-sync-token。</div>
              </div>
              <div className="rounded-lg border bg-gray-50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs text-gray-500">JSON 示例</div>
                  <Button type="button" size="sm" variant="ghost" className="h-7" onClick={() => copyText(webhookSamplePayload, 'JSON 示例已复制')}>
                    <Copy className="mr-1 h-3.5 w-3.5" />
                    复制
                  </Button>
                </div>
                <pre className="mt-2 max-h-56 overflow-auto rounded bg-white p-2 text-[11px] leading-5 text-gray-700">{webhookSamplePayload}</pre>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <ClipboardList className="h-4 w-4" />
                最近同步日志
              </CardTitle>
            </CardHeader>
            <CardContent>
              {logs.length === 0 ? (
                <div className="rounded-lg border border-dashed py-8 text-center text-sm text-gray-500">暂无同步日志</div>
              ) : (
                <div className="space-y-3">
                  {logs.map((log) => (
                    <div key={log.id} className="rounded-lg border p-3 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-medium">{log.worker_name || '-'}</div>
                        {statusBadge(log.status)}
                      </div>
                      <div className="mt-1 text-xs text-gray-500">{log.project_name || '-'} · {actionText(log.action)} · {formatDateTime(log.created_at)}</div>
                      <div className="mt-2 line-clamp-2 text-xs text-gray-600">{log.message || '-'}</div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] w-[calc(100vw-1.5rem)] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{form.id ? '编辑 WPS 绑定' : '新增 WPS 绑定'}</DialogTitle>
            <DialogDescription>一个系统项目可以绑定一个 WPS 项目二维码、工作表或文档链接。</DialogDescription>
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
            <div className="space-y-2 md:col-span-2">
              <Label>WPS 文档链接</Label>
              <Input value={form.wpsDocumentUrl} onChange={(event) => setForm((prev) => ({ ...prev, wpsDocumentUrl: event.target.value }))} placeholder="粘贴 WPS 表格、多维表格或可下载 Excel 链接" />
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
              <Input value={form.wpsFormId} onChange={(event) => setForm((prev) => ({ ...prev, wpsFormId: event.target.value }))} placeholder="可选，推荐填写稳定 ID" />
            </div>
            <div className="space-y-2">
              <Label>WPS 工作表 ID</Label>
              <Input value={form.wpsSheetId} onChange={(event) => setForm((prev) => ({ ...prev, wpsSheetId: event.target.value }))} placeholder="可选" />
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
              <Textarea value={form.remark} onChange={(event) => setForm((prev) => ({ ...prev, remark: event.target.value }))} placeholder="例如：二维码负责人、WPS 表单用途、字段口径等" rows={3} />
            </div>
          </div>
          <DialogFooter className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button onClick={saveBinding} disabled={saving}>{saving ? '保存中...' : '保存配置'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
