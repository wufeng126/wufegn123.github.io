'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ClipboardList,
  Copy,
  ExternalLink,
  FileSpreadsheet,
  KeyRound,
  Link2,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings2,
  Trash2,
} from 'lucide-react';
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

interface WpsFieldMapping {
  name?: string;
  gender?: string;
  idCard?: string;
  phone?: string;
  bankCard?: string;
  entryDate?: string;
  workType?: string;
  teamName?: string;
  status?: string;
}

interface WpsConfig {
  appId: string;
  appSecretConfigured: boolean;
  documentUrl: string;
  fileId: string;
  fieldMapping: WpsFieldMapping;
  autoSyncEnabled: boolean;
  lastTestAt?: string | null;
  lastTestStatus?: string | null;
  lastTestMessage?: string | null;
}

interface WpsSheet {
  id: string;
  name: string;
  recordsCount?: number;
  fields: Array<{ id?: string; name: string; type?: string }>;
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

const defaultConfig: WpsConfig = {
  appId: '',
  appSecretConfigured: false,
  documentUrl: '',
  fileId: '',
  fieldMapping: {
    name: '姓名',
    gender: '性别',
    idCard: '身份证号',
    phone: '联系方式',
    bankCard: '银行卡号',
    entryDate: '入场日期',
    workType: '工种',
    teamName: '班组',
    status: '人员状态',
  },
  autoSyncEnabled: true,
};

const mappingItems: Array<{ key: keyof WpsFieldMapping; label: string; required?: boolean; hint: string }> = [
  { key: 'name', label: '姓名', required: true, hint: '工人档案显示名称' },
  { key: 'idCard', label: '身份证号', required: true, hint: '唯一识别和去重依据' },
  { key: 'phone', label: '联系方式', hint: '电话或手机号' },
  { key: 'gender', label: '性别', hint: '可从身份证补充，字段可留空' },
  { key: 'bankCard', label: '银行卡号', hint: '只同步卡号，不同步照片' },
  { key: 'entryDate', label: '入场日期', hint: '用于项目调入时间' },
  { key: 'workType', label: '工种', hint: '施工日志筛选会用到' },
  { key: 'teamName', label: '班组', hint: '后续班组结算可关联' },
  { key: 'status', label: '人员状态', hint: '用于同步在场、退场、已归档等状态' },
];

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

function normalizeConfig(config?: Partial<WpsConfig>): WpsConfig {
  return {
    ...defaultConfig,
    ...(config || {}),
    fieldMapping: {
      ...defaultConfig.fieldMapping,
      ...(config?.fieldMapping || {}),
    },
  };
}

function allFields(sheets: WpsSheet[]) {
  const names = new Set<string>();
  sheets.forEach((sheet) => {
    sheet.fields.forEach((field) => {
      if (field.name) names.add(field.name);
    });
  });
  return Array.from(names);
}

export default function WpsConfigPage() {
  const { toast } = useToast();
  const [bindings, setBindings] = useState<WpsBinding[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [stats, setStats] = useState<BindingStats>({ totalBindings: 0, activeBindings: 0, configuredProjects: 0, unconfiguredProjects: 0 });
  const [integration, setIntegration] = useState<IntegrationInfo>({ webhookPath: '/api/integrations/wps/workers/webhook', tokenConfigured: false, pullCredentialConfigured: false });
  const [config, setConfig] = useState<WpsConfig>(defaultConfig);
  const [appSecretInput, setAppSecretInput] = useState('');
  const [sheets, setSheets] = useState<WpsSheet[]>([]);
  const [origin] = useState(() => (typeof window === 'undefined' ? '' : window.location.origin));
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [testingConfig, setTestingConfig] = useState(false);
  const [savingBinding, setSavingBinding] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [testingBindingId, setTestingBindingId] = useState<number | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<BindingForm>(emptyForm);

  const fieldOptions = useMemo(() => allFields(sheets), [sheets]);
  const webhookUrl = `${origin}${integration.webhookPath}`;

  const fetchLogs = useCallback(async () => {
    try {
      const response = await fetch('/api/integrations/wps/workers/logs?pageSize=8');
      const data = await response.json();
      if (response.ok && data.success) setLogs(data.logs || []);
    } catch {
      setLogs([]);
    }
  }, []);

  const fetchConfig = useCallback(async () => {
    const response = await fetch('/api/integrations/wps/workers/config');
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.error || '获取 WPS 应用配置失败');
    setConfig(normalizeConfig(data.config));
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [bindingResponse] = await Promise.all([
        fetch('/api/integrations/wps/workers/bindings'),
        fetchConfig(),
      ]);
      const data = await bindingResponse.json();
      if (!bindingResponse.ok || !data.success) throw new Error(data.error || '获取 WPS 项目绑定失败');
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
  }, [fetchConfig, fetchLogs, toast]);

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

  const saveConfig = async () => {
    setSavingConfig(true);
    try {
      const response = await fetch('/api/integrations/wps/workers/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appId: config.appId,
          appSecret: appSecretInput,
          documentUrl: config.documentUrl,
          fileId: config.fileId,
          fieldMapping: config.fieldMapping,
          autoSyncEnabled: config.autoSyncEnabled,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || '保存 WPS 应用配置失败');
      setConfig(normalizeConfig(data.config));
      setAppSecretInput('');
      toast({ title: '配置已保存', description: 'AppSecret 不会在页面回显，后端会继续使用已保存的密钥。' });
      await fetchData();
    } catch (error) {
      toast({ title: '保存失败', description: error instanceof Error ? error.message : '保存 WPS 应用配置失败', variant: 'error' });
    } finally {
      setSavingConfig(false);
    }
  };

  const testConfig = async () => {
    setTestingConfig(true);
    try {
      const response = await fetch('/api/integrations/wps/workers/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test' }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'WPS 连接测试失败');
      setSheets(data.sheets || []);
      setConfig(normalizeConfig(data.config));
      toast({ title: '连接成功', description: data.message || '已读取 WPS 工作表和字段' });
    } catch (error) {
      toast({ title: '测试失败', description: error instanceof Error ? error.message : 'WPS 连接测试失败', variant: 'error' });
    } finally {
      setTestingConfig(false);
    }
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
        title: result?.status === 'success' ? '测试通过' : '测试提醒',
        description: result?.message || data.message || '测试完成',
        variant: result?.status === 'success' ? 'default' : 'warning',
      });
    } catch (error) {
      toast({ title: '测试失败', description: error instanceof Error ? error.message : 'WPS 绑定测试失败', variant: 'error' });
    } finally {
      setTestingBindingId(null);
    }
  };

  const copyText = async (text: string, title = '已复制') => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title });
    } catch {
      toast({ title: '复制失败', description: '浏览器未允许剪贴板权限', variant: 'error' });
    }
  };

  const selectSheetForForm = (sheetId: string) => {
    if (sheetId === '__manual') {
      setForm((prev) => ({ ...prev, wpsSheetId: '' }));
      return;
    }
    const sheet = sheets.find((item) => item.id === sheetId);
    setForm((prev) => ({
      ...prev,
      wpsSheetId: sheetId,
      worksheetName: sheet?.name || prev.worksheetName,
      wpsProjectName: sheet?.name || prev.wpsProjectName,
    }));
  };

  const saveBinding = async () => {
    if (!form.projectId) {
      toast({ title: '请选择系统项目', variant: 'error' });
      return;
    }
    if (!form.wpsDocumentUrl && !form.wpsProjectName && !form.worksheetName && !form.wpsFormId && !form.wpsSheetId && !form.wpsTableId) {
      toast({ title: '请至少选择一个 WPS 工作表或填写项目名称', variant: 'error' });
      return;
    }

    setSavingBinding(true);
    try {
      const response = await fetch('/api/integrations/wps/workers/bindings', {
        method: form.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || '保存 WPS 项目绑定失败');
      toast({ title: '绑定已保存', description: '同步时会按该绑定把 WPS 工作表写入对应项目花名册。' });
      setDialogOpen(false);
      await fetchData();
    } catch (error) {
      toast({ title: '保存失败', description: error instanceof Error ? error.message : '保存 WPS 项目绑定失败', variant: 'error' });
    } finally {
      setSavingBinding(false);
    }
  };

  const deleteBinding = async (binding: WpsBinding) => {
    if (!window.confirm('确认删除这条 WPS 绑定配置吗？删除后不会影响已同步的工人档案。')) return;
    const response = await fetch(`/api/integrations/wps/workers/bindings?id=${binding.id}`, { method: 'DELETE' });
    const data = await response.json();
    if (!response.ok || !data.success) {
      toast({ title: '删除失败', description: data.error || '删除 WPS 项目绑定失败', variant: 'error' });
      return;
    }
    toast({ title: '绑定已删除' });
    await fetchData();
  };

  const readyForOpenApi = Boolean(config.appId && config.appSecretConfigured && (config.fileId || config.documentUrl));

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">WPS 花名册同步配置</h1>
          <p className="mt-1 text-sm text-gray-500">超级管理员在这里完成应用授权、字段映射、项目绑定和同步检查。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void fetchData()} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </Button>
          <Button onClick={handleSync} disabled={syncing || bindings.length === 0}>
            <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
            立即同步
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-5">
            <div className="text-sm text-gray-500">项目绑定</div>
            <div className="mt-2 text-2xl font-semibold">{stats.totalBindings}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="text-sm text-gray-500">启用绑定</div>
            <div className="mt-2 text-2xl font-semibold text-green-700">{stats.activeBindings}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="text-sm text-gray-500">未绑定项目</div>
            <div className="mt-2 text-2xl font-semibold text-amber-700">{stats.unconfiguredProjects}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="text-sm text-gray-500">WPS 应用状态</div>
            <div className="mt-2">{readyForOpenApi ? <Badge className="bg-green-600">已配置</Badge> : <Badge variant="outline">待配置</Badge>}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4 text-blue-600" />
            WPS 应用配置
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <Label>AppID</Label>
              <Input value={config.appId} onChange={(event) => setConfig((prev) => ({ ...prev, appId: event.target.value }))} placeholder="粘贴 WPS 开放平台 AppID" />
            </div>
            <div className="space-y-2">
              <Label>AppSecret</Label>
              <Input
                type="password"
                value={appSecretInput}
                onChange={(event) => setAppSecretInput(event.target.value)}
                placeholder={config.appSecretConfigured ? '已保存，留空则不修改' : '粘贴 WPS 开放平台 AppSecret'}
              />
            </div>
            <div className="space-y-2 lg:col-span-2">
              <Label>WPS 多维表格链接</Label>
              <Input value={config.documentUrl} onChange={(event) => setConfig((prev) => ({ ...prev, documentUrl: event.target.value }))} placeholder="粘贴公司花名册多维表格链接" />
            </div>
            <div className="space-y-2">
              <Label>文件 ID</Label>
              <Input value={config.fileId} onChange={(event) => setConfig((prev) => ({ ...prev, fileId: event.target.value }))} placeholder="通常可自动识别，识别失败时再手动填写" />
            </div>
            <div className="flex items-center justify-between rounded-md border bg-gray-50 px-3 py-2">
              <div>
                <div className="text-sm font-medium">启用一键同步</div>
                <div className="text-xs text-gray-500">关闭后只保留实时推送或旧直链方式</div>
              </div>
              <Switch checked={config.autoSyncEnabled} onCheckedChange={(checked) => setConfig((prev) => ({ ...prev, autoSyncEnabled: checked }))} />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={saveConfig} disabled={savingConfig}>
              <Save className="mr-2 h-4 w-4" />
              保存配置
            </Button>
            <Button variant="outline" onClick={testConfig} disabled={testingConfig || !config.appId || (!appSecretInput && !config.appSecretConfigured)}>
              <RefreshCw className={`mr-2 h-4 w-4 ${testingConfig ? 'animate-spin' : ''}`} />
              测试连接/读取工作表
            </Button>
            {config.lastTestMessage ? (
              <span className="text-sm text-gray-500">
                最近测试：{statusBadge(config.lastTestStatus)} <span className="ml-2">{config.lastTestMessage}</span>
              </span>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Settings2 className="h-4 w-4 text-blue-600" />
            字段映射
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {sheets.length > 0 ? (
            <div className="rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-800">
              已读取 {sheets.length} 个工作表。字段下拉来自 WPS 表头，身份证照片、银行卡照片等附件字段不会写入系统。
            </div>
          ) : (
            <div className="rounded-md border border-amber-100 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              先保存并测试 WPS 应用配置，系统会自动读取工作表和字段；读取成功后再从下拉框选择字段映射。
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {mappingItems.map((item) => (
              <div key={item.key} className="space-y-2">
                <Label>{item.label}{item.required ? <span className="ml-1 text-red-500">*</span> : null}</Label>
                <Select
                  value={(fieldOptions.includes(config.fieldMapping[item.key] || '') ? config.fieldMapping[item.key] : '__none') || '__none'}
                  disabled={fieldOptions.length === 0}
                  onValueChange={(value) => setConfig((prev) => ({
                    ...prev,
                    fieldMapping: {
                      ...prev.fieldMapping,
                      [item.key]: value === '__none' ? undefined : value,
                    },
                  }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={fieldOptions.length > 0 ? '选择 WPS 字段' : '请先测试读取 WPS 字段'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">不映射</SelectItem>
                    {fieldOptions.map((fieldName) => (
                      <SelectItem key={fieldName} value={fieldName}>{fieldName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="text-xs text-gray-500">{item.hint}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-3 pb-3 md:flex-row md:items-center md:justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardList className="h-4 w-4 text-blue-600" />
            项目绑定台账
          </CardTitle>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <Input className="pl-9 sm:w-72" placeholder="搜索项目、工作表或同步结果" value={search} onChange={(event) => setSearch(event.target.value)} />
            </div>
            <Button onClick={openCreateDialog}>
              <Plus className="mr-2 h-4 w-4" />
              新增绑定
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="hidden overflow-x-auto rounded-md border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>系统项目</TableHead>
                  <TableHead>WPS 工作表</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>最近同步</TableHead>
                  <TableHead>结果说明</TableHead>
                  <TableHead className="w-40 text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredBindings.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-sm text-gray-500">
                      {loading ? '正在加载配置...' : '暂无 WPS 项目绑定配置'}
                    </TableCell>
                  </TableRow>
                ) : filteredBindings.map((binding) => {
                  const project = getProject(binding);
                  return (
                    <TableRow key={binding.id}>
                      <TableCell>
                        <div className="font-medium">{project?.name || '-'}</div>
                        <div className="mt-1 text-xs text-gray-500">{project?.year || ''} {project?.status || ''}</div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{binding.worksheet_name || binding.wps_project_name || '-'}</div>
                        <div className="mt-1 text-xs text-gray-500">工作表ID：{binding.wps_sheet_id || '-'}</div>
                        {binding.wps_document_url ? (
                          <a className="mt-1 flex items-center gap-1 truncate text-xs text-blue-600 hover:underline" href={binding.wps_document_url} target="_blank" rel="noreferrer">
                            <ExternalLink className="h-3 w-3" />
                            {binding.wps_document_url}
                          </a>
                        ) : null}
                      </TableCell>
                      <TableCell>{binding.is_active === false ? <Badge variant="secondary">停用</Badge> : <Badge className="bg-green-600">启用</Badge>}</TableCell>
                      <TableCell className="text-sm text-gray-600">{formatDateTime(binding.last_sync_at)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {statusBadge(binding.last_sync_status)}
                          <span className="line-clamp-2 text-sm text-gray-600">{binding.last_sync_message || '-'}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => void testBinding(binding)} disabled={testingBindingId === binding.id} title="测试读取">
                            <RefreshCw className={`h-4 w-4 ${testingBindingId === binding.id ? 'animate-spin' : ''}`} />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => openEditDialog(binding)} title="编辑">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => void deleteBinding(binding)} title="删除">
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="space-y-3 md:hidden">
            {filteredBindings.length === 0 ? (
              <div className="rounded-md border py-10 text-center text-sm text-gray-500">{loading ? '正在加载配置...' : '暂无 WPS 项目绑定配置'}</div>
            ) : filteredBindings.map((binding) => {
              const project = getProject(binding);
              return (
                <div key={binding.id} className="rounded-md border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium">{project?.name || '-'}</div>
                      <div className="mt-1 text-xs text-gray-500">{binding.worksheet_name || binding.wps_project_name || '未配置 WPS 名称'}</div>
                    </div>
                    {binding.is_active === false ? <Badge variant="secondary">停用</Badge> : <Badge className="bg-green-600">启用</Badge>}
                  </div>
                  <div className="mt-3 flex items-center gap-2 text-sm text-gray-600">
                    {statusBadge(binding.last_sync_status)}
                    <span>{binding.last_sync_message || '未同步'}</span>
                  </div>
                  <div className="mt-3 flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => void testBinding(binding)} disabled={testingBindingId === binding.id}>测试</Button>
                    <Button variant="outline" size="sm" onClick={() => openEditDialog(binding)}>编辑</Button>
                    <Button variant="outline" size="sm" onClick={() => void deleteBinding(binding)}>删除</Button>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileSpreadsheet className="h-4 w-4 text-blue-600" />
              最近同步结果
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {logs.length === 0 ? (
                <div className="rounded-md border py-10 text-center text-sm text-gray-500">暂无同步记录</div>
              ) : logs.map((log) => (
                <div key={log.id} className="flex items-start justify-between gap-3 rounded-md border px-3 py-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {statusBadge(log.status)}
                      <span className="font-medium">{log.worker_name || '-'}</span>
                      <span className="text-sm text-gray-500">{actionText(log.action)}</span>
                    </div>
                    <div className="mt-1 text-sm text-gray-600">{log.project_name || '-'} · {log.worksheet_name || '-'}</div>
                    <div className="mt-1 line-clamp-2 text-xs text-gray-500">{log.message || '-'}</div>
                  </div>
                  <div className="shrink-0 text-xs text-gray-400">{formatDateTime(log.created_at)}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Link2 className="h-4 w-4 text-blue-600" />
              高级 Webhook 备用
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-gray-600">
            <div className="rounded-md border bg-gray-50 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="font-medium text-gray-900">统一推送地址</span>
                <Button variant="ghost" size="icon" onClick={() => void copyText(webhookUrl, 'Webhook 地址已复制')}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <div className="break-all font-mono text-xs text-gray-600">{webhookUrl}</div>
            </div>
            <div className="flex items-start gap-2 rounded-md border border-amber-100 bg-amber-50 p-3 text-amber-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>优先使用上面的“一键同步”。Webhook 只作为 WPS 自动化实时推送的备用方案。</div>
            </div>
            <div className="flex items-center gap-2">
              {integration.tokenConfigured ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <AlertCircle className="h-4 w-4 text-amber-600" />}
              <span>同步 Token：{integration.tokenConfigured ? '已配置' : '未配置'}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{form.id ? '编辑 WPS 项目绑定' : '新增 WPS 项目绑定'}</DialogTitle>
            <DialogDescription>一个系统项目绑定一个 WPS 工作表。同步时系统会按工作表写入对应项目花名册。</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>系统项目</Label>
              <Select value={form.projectId} onValueChange={(value) => setForm((prev) => ({ ...prev, projectId: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="选择系统项目" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={String(project.id)}>{project.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>WPS 工作表</Label>
              {sheets.length > 0 ? (
                <Select value={form.wpsSheetId || '__manual'} onValueChange={selectSheetForForm}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择 WPS 工作表" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__manual">手动填写</SelectItem>
                    {sheets.map((sheet) => (
                      <SelectItem key={sheet.id} value={sheet.id}>{sheet.name}{sheet.recordsCount ? ` · ${sheet.recordsCount} 行` : ''}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input value={form.worksheetName} onChange={(event) => setForm((prev) => ({ ...prev, worksheetName: event.target.value, wpsProjectName: event.target.value }))} placeholder="填写 WPS 工作表名称，建议与系统项目名称一致" />
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>WPS 项目名称</Label>
                <Input value={form.wpsProjectName} onChange={(event) => setForm((prev) => ({ ...prev, wpsProjectName: event.target.value }))} placeholder="可与工作表名称一致" />
              </div>
              <div className="space-y-2">
                <Label>工作表 ID</Label>
                <Input value={form.wpsSheetId} onChange={(event) => setForm((prev) => ({ ...prev, wpsSheetId: event.target.value }))} placeholder="选择工作表后自动带出" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>单独文档链接</Label>
              <Input value={form.wpsDocumentUrl} onChange={(event) => setForm((prev) => ({ ...prev, wpsDocumentUrl: event.target.value }))} placeholder="可选。一般不用填，除非某项目使用单独表格或旧直链方式" />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>表单 ID</Label>
                <Input value={form.wpsFormId} onChange={(event) => setForm((prev) => ({ ...prev, wpsFormId: event.target.value }))} placeholder="可选，实时推送时使用" />
              </div>
              <div className="space-y-2">
                <Label>多维表格 ID</Label>
                <Input value={form.wpsTableId} onChange={(event) => setForm((prev) => ({ ...prev, wpsTableId: event.target.value }))} placeholder="可选，实时推送时使用" />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-md border bg-gray-50 px-3 py-2">
              <div>
                <div className="text-sm font-medium">启用绑定</div>
                <div className="text-xs text-gray-500">停用后该项目不会参与自动同步</div>
              </div>
              <Switch checked={form.isActive} onCheckedChange={(checked) => setForm((prev) => ({ ...prev, isActive: checked }))} />
            </div>

            <div className="space-y-2">
              <Label>备注</Label>
              <Textarea value={form.remark} onChange={(event) => setForm((prev) => ({ ...prev, remark: event.target.value }))} placeholder="例如：二维码负责人、字段特殊口径等" rows={3} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button onClick={saveBinding} disabled={savingBinding}>
              <Save className="mr-2 h-4 w-4" />
              保存绑定
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
