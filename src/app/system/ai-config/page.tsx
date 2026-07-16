'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

import { Upload, FileText, Plus, Trash2, RefreshCw, Download, Search, Settings, BookOpen, Shield, Clock } from 'lucide-react';

const MODELS = [
  { id: 'doubao-seed-2-0-lite-260215', name: 'Doubao Seed 2.0 Lite (推荐)', desc: '均衡型，兼顾性能与成本' },
  { id: 'doubao-seed-2-0-pro-260215', name: 'Doubao Seed 2.0 Pro', desc: '旗舰级，复杂推理' },
  { id: 'doubao-seed-2-0-mini-260215', name: 'Doubao Seed 2.0 Mini', desc: '低时延，高并发' },
  { id: 'deepseek-v3-2-251201', name: 'DeepSeek V3', desc: '平衡推理与输出长度' },
  { id: 'qwen-3-5-plus-260215', name: 'Qwen 3.5 Plus', desc: '通义千问，视觉语言' },
];

interface AIConfig {
  id?: number;
  model_id: string;
  api_endpoint: string;
  api_key: string;
  max_context_length: number;
  daily_limit: number;
  temperature: number;
  enabled: boolean;
  module_data_query: boolean;
  module_report_analysis: boolean;
  module_error_diagnosis: boolean;
  module_doc_generation: boolean;
  module_supplier_analysis: boolean;
  module_salary_analysis: boolean;
  module_visa_assistant: boolean;
  content_filter_enabled: boolean;
  mask_sensitive: boolean;
  offline_fallback_enabled: boolean;
}

interface KnowledgeDoc {
  id: number;
  title: string;
  category: string;
  source_type: string;
  source_ref: string;
  chunk_count: number;
  status: string;
  error_message: string;
  created_at: string;
  last_sync_at: string;
}

interface AuditLog {
  id: number;
  username: string;
  action: string;
  input_summary: string;
  output_summary: string;
  page_context: string;
  model_id: string;
  token_usage: number;
  response_time_ms: number;
  is_success: boolean;
  error_message: string;
  created_at: string;
}

const defaultConfig: AIConfig = {
  model_id: 'doubao-seed-2-0-lite-260215',
  api_endpoint: '',
  api_key: '',
  max_context_length: 20,
  daily_limit: 100,
  temperature: 0.7,
  enabled: true,
  module_data_query: true,
  module_report_analysis: true,
  module_error_diagnosis: true,
  module_doc_generation: true,
  module_supplier_analysis: true,
  module_salary_analysis: true,
  module_visa_assistant: true,
  content_filter_enabled: true,
  mask_sensitive: true,
  offline_fallback_enabled: true,
};

export default function AIConfigPage() {
  const [config, setConfig] = useState<AIConfig>(defaultConfig);
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [showAddDoc, setShowAddDoc] = useState(false);
  const [docInputMode, setDocInputMode] = useState<'manual' | 'file'>('manual');
  const [uploadingFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [newDoc, setNewDoc] = useState({ title: '', category: 'labor_law', source_type: 'manual', content: '' });
  const [auditFilter, setAuditFilter] = useState({ action: '', date_range: '7d' });
  const docFileInputRef = useRef<HTMLInputElement>(null);

  // 加载配置
  const loadConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/ai/config');
      const data = await res.json();
      if (data.success && data.data) {
        const raw = data.data;
        // Ensure nullable fields default to safe values to avoid React controlled/uncontrolled warning
        const safe: AIConfig = {
          ...defaultConfig,
          ...raw,
          api_endpoint: raw.api_endpoint ?? '',
          api_key: raw.api_key ?? '',
          model_id: raw.model_id ?? defaultConfig.model_id,
          max_context_length: raw.max_context_length ?? defaultConfig.max_context_length,
          daily_limit: raw.daily_limit ?? defaultConfig.daily_limit,
          temperature: raw.temperature ?? defaultConfig.temperature,
          enabled: raw.enabled ?? defaultConfig.enabled,
          module_data_query: raw.module_data_query ?? defaultConfig.module_data_query,
          module_report_analysis: raw.module_report_analysis ?? defaultConfig.module_report_analysis,
          module_error_diagnosis: raw.module_error_diagnosis ?? defaultConfig.module_error_diagnosis,
          module_doc_generation: raw.module_doc_generation ?? defaultConfig.module_doc_generation,
          module_supplier_analysis: raw.module_supplier_analysis ?? defaultConfig.module_supplier_analysis,
          module_salary_analysis: raw.module_salary_analysis ?? defaultConfig.module_salary_analysis,
          module_visa_assistant: raw.module_visa_assistant ?? defaultConfig.module_visa_assistant,
          content_filter_enabled: raw.content_filter_enabled ?? defaultConfig.content_filter_enabled,
          mask_sensitive: raw.mask_sensitive ?? defaultConfig.mask_sensitive,
          offline_fallback_enabled: raw.offline_fallback_enabled ?? defaultConfig.offline_fallback_enabled,
        };
        setConfig(safe);
      }
    } catch (e) {
      console.error('Load AI config failed:', e);
    }
  }, []);

  // 加载知识库文档
  const loadDocs = useCallback(async () => {
    try {
      const res = await fetch('/api/ai/knowledge');
      const data = await res.json();
      if (data.success) setDocs(data.data || []);
    } catch (e) {
      console.error('Load knowledge docs failed:', e);
    }
  }, []);

  // 加载审计日志
  const loadAuditLogs = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (auditFilter.action) params.set('action', auditFilter.action);
      params.set('limit', '50');
      const res = await fetch(`/api/ai/audit?${params}`);
      const data = await res.json();
      if (data.success) setAuditLogs(data.data || []);
    } catch (e) {
      console.error('Load audit logs failed:', e);
    }
  }, [auditFilter]);

  useEffect(() => { loadConfig(); loadDocs(); }, []);
  useEffect(() => { loadAuditLogs(); }, [loadAuditLogs]);

  // 保存配置
  const saveConfig = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/ai/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('AI配置已保存');
        await loadConfig();
      } else {
        toast.error(data.error || '保存失败');
      }
    } catch (e) {
      toast.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  // 同步业务数据到知识库
  const syncBusinessData = async (dataType: string) => {
    setSyncing(dataType);
    try {
      const res = await fetch('/api/ai/knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync_business', data_type: dataType }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`已同步${dataType}数据到知识库`);
        await loadDocs();
      } else {
        toast.error(data.error || '同步失败');
      }
    } catch (e) {
      toast.error('同步失败');
    } finally {
      setSyncing(null);
    }
  };

  // 添加手动文档
  const addManualDoc = async () => {
    if (!newDoc.title || !newDoc.content) {
      toast.error('请填写标题和内容');
      return;
    }
    try {
      const res = await fetch('/api/ai/knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add_manual', ...newDoc }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('文档已添加');
        setShowAddDoc(false);
        setNewDoc({ title: '', category: 'labor_law', source_type: 'manual', content: '' });
        await loadDocs();
      } else {
        toast.error(data.error || '添加失败');
      }
    } catch (e) {
      toast.error('添加失败');
    }
  };

  const addFileDoc = async () => {
    if (!uploadingFile) {
      toast.error('请选择文件');
      return;
    }
    if (!newDoc.title) {
      toast.error('请填写文档标题');
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', uploadingFile);
      formData.append('title', newDoc.title);
      formData.append('category', newDoc.category);
      const res = await fetch('/api/ai/knowledge/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        toast.success('文件已上传并添加到知识库');
        setShowAddDoc(false);
        setUploadFile(null);
        setNewDoc({ title: '', category: 'labor_law', source_type: 'upload', content: '' });
        await loadDocs();
      } else {
        toast.error(data.error || '上传失败');
      }
    } catch (e) {
      toast.error('上传失败');
    } finally {
      setUploading(false);
    }
  };

  // 删除知识库文档
  const deleteDoc = async (id: number) => {
    try {
      const res = await fetch(`/api/ai/knowledge?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        toast.success('已删除');
        await loadDocs();
      } else {
        toast.error(data.error || '删除失败');
      }
    } catch (e) {
      toast.error('删除失败');
    }
  };

  // 全量刷新知识库
  const refreshAllKnowledge = async () => {
    setSyncing('all');
    try {
      const res = await fetch('/api/ai/knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'refresh_all' }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('知识库全量刷新完成');
        await loadDocs();
      } else {
        toast.error(data.error || '刷新失败');
      }
    } catch (e) {
      toast.error('刷新失败');
    } finally {
      setSyncing(null);
    }
  };

  // 导出审计日志
  const exportAuditLogs = () => {
    const csv = [
      ['时间', '用户', '操作', '输入摘要', '输出摘要', '页面', '模型', 'Token', '耗时ms', '状态'].join(','),
      ...auditLogs.map(l => [
        l.created_at, l.username, l.action, `"${(l.input_summary || '').replace(/"/g, '""')}"`,
        `"${(l.output_summary || '').replace(/"/g, '""')}"`, l.page_context, l.model_id,
        l.token_usage, l.response_time_ms, l.is_success ? '成功' : '失败',
      ].join(','))
    ].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ai_audit_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const moduleLabels: Record<string, string> = {
    module_data_query: '数据查询',
    module_report_analysis: '报表解读',
    module_error_diagnosis: '报错排查',
    module_doc_generation: '文档生成',
    module_supplier_analysis: '供应商分析',
    module_salary_analysis: '工资分析',
    module_visa_assistant: '签证助手',
  };

  const categoryLabels: Record<string, string> = {
    labor_law: '劳务法规',
    company_policy: '公司制度',
    contract_template: '合同模板',
    field_glossary: '字段释义',
    business_supplier: '供应商台账',
    business_salary: '工资台账',
    business_project: '项目台账',
    business_contract: '合同台账',
  };

  return (
    <div className="space-y-6 p-3 sm:p-4 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold tracking-tight">AI劳务助手配置</h1>
        <Badge variant={config.enabled ? 'default' : 'secondary'}>
          {config.enabled ? '已启用' : '已禁用'}
        </Badge>
      </div>

      <Tabs defaultValue="config" className="space-y-4">
        <TabsList className="grid h-auto w-full grid-cols-2 sm:flex sm:w-auto">
          <TabsTrigger value="config">模型配置</TabsTrigger>
          <TabsTrigger value="modules">功能模块</TabsTrigger>
          <TabsTrigger value="knowledge">知识库</TabsTrigger>
          <TabsTrigger value="audit">审计日志</TabsTrigger>
        </TabsList>

        {/* 模型配置 */}
        <TabsContent value="config">
          <Card>
            <CardHeader><CardTitle>模型与参数配置</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>全局开关</Label>
                  <div className="flex items-center gap-2">
                    <Switch checked={config.enabled} onCheckedChange={v => setConfig({ ...config, enabled: v })} />
                    <span className="text-sm text-muted-foreground">{config.enabled ? '已启用' : '已禁用'}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>选择模型</Label>
                  <Select value={config.model_id} onValueChange={v => setConfig({ ...config, model_id: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MODELS.map(m => (
                        <SelectItem key={m.id} value={m.id}>
                          <div>
                            <div className="font-medium">{m.name}</div>
                            <div className="text-xs text-muted-foreground">{m.desc}</div>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>API地址（可选，留空使用默认）</Label>
                  <Input value={config.api_endpoint} onChange={e => setConfig({ ...config, api_endpoint: e.target.value })} placeholder="https://api.example.com/v1" />
                </div>
                <div className="space-y-2">
                  <Label>API密钥（可选，留空使用默认）</Label>
                  <Input type="password" value={config.api_key} onChange={e => setConfig({ ...config, api_key: e.target.value })} placeholder="sk-..." />
                </div>
                <div className="space-y-2">
                  <Label>会话上下文长度（轮次）</Label>
                  <Input type="number" min={5} max={50} value={config.max_context_length} onChange={e => setConfig({ ...config, max_context_length: parseInt(e.target.value) || 20 })} />
                </div>
                <div className="space-y-2">
                  <Label>每日调用限额（次/人）</Label>
                  <Input type="number" min={1} max={1000} value={config.daily_limit} onChange={e => setConfig({ ...config, daily_limit: parseInt(e.target.value) || 100 })} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>创意温度: {config.temperature}</Label>
                  <input
                    type="range" min={0} max={1} step={0.05}
                    value={config.temperature}
                    onChange={e => setConfig({ ...config, temperature: parseFloat(e.target.value) })}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>精确 (0)</span><span>均衡 (0.7)</span><span>创意 (1.0)</span>
                  </div>
                </div>
              </div>
              <div className="grid gap-3 pt-4 border-t sm:grid-cols-3">
                <div className="flex items-center gap-2">
                  <Switch checked={config.content_filter_enabled} onCheckedChange={v => setConfig({ ...config, content_filter_enabled: v })} />
                  <Label>内容安全过滤</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={config.mask_sensitive} onCheckedChange={v => setConfig({ ...config, mask_sensitive: v })} />
                  <Label>敏感信息脱敏</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={config.offline_fallback_enabled} onCheckedChange={v => setConfig({ ...config, offline_fallback_enabled: v })} />
                  <Label>离线兜底</Label>
                </div>
              </div>
              <Button onClick={saveConfig} disabled={saving}>
                {saving ? '保存中...' : '保存配置'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 功能模块 */}
        <TabsContent value="modules">
          <Card>
            <CardHeader><CardTitle>功能模块开关</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Object.entries(moduleLabels).map(([key, label]) => (
                  <div key={key} className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <div className="font-medium">{label}</div>
                      <div className="text-xs text-muted-foreground">
                        {key === 'module_supplier_analysis' || key === 'module_salary_analysis'
                          ? '仅管理员和财务角色可使用' : '多角色可用'}
                      </div>
                    </div>
                    <Switch
                      checked={(config as any)[key]}
                      onCheckedChange={v => setConfig({ ...config, [key]: v })}
                    />
                  </div>
                ))}
              </div>
              <Button onClick={saveConfig} disabled={saving} className="mt-6">
                {saving ? '保存中...' : '保存模块配置'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 知识库管理 */}
        <TabsContent value="knowledge">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <CardTitle>业务数据同步</CardTitle>
                  <Button variant="outline" size="sm" onClick={refreshAllKnowledge} disabled={syncing === 'all'}>
                    {syncing === 'all' ? '刷新中...' : '全量刷新'}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {[
                    { key: 'salary', label: '工人工资台账', icon: '💰' },
                    { key: 'supplier', label: '供应商台账', icon: '📋' },
                    { key: 'project', label: '项目台账', icon: '🏗️' },
                    { key: 'contract', label: '合同台账', icon: '📑' },
                    { key: 'certificate', label: '证件台账', icon: '🪪' },
                    { key: 'settlement', label: '结算台账', icon: '📊' },
                  ].map(item => (
                    <Button
                      key={item.key} variant="outline" className="h-auto py-3 flex-col gap-1"
                      onClick={() => syncBusinessData(item.key)}
                      disabled={syncing === item.key}
                    >
                      <span className="text-lg">{item.icon}</span>
                      <span className="text-sm">{item.label}</span>
                      {syncing === item.key && <span className="text-xs text-muted-foreground">同步中...</span>}
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <CardTitle>文档管理</CardTitle>
                  <Button size="sm" onClick={() => { setDocInputMode('manual'); setUploadFile(null); setShowAddDoc(true); }}>
                    <Plus className="h-4 w-4 mr-1" />添加文档
                  </Button>
                  <Dialog open={showAddDoc} onOpenChange={setShowAddDoc}>
                    <DialogContent className="max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-lg overflow-y-auto">
                      <DialogHeader><DialogTitle>添加知识库文档</DialogTitle></DialogHeader>
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label>文档标题</Label>
                          <Input placeholder="输入文档标题" value={newDoc.title} onChange={e => setNewDoc({ ...newDoc, title: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <Label>文档分类</Label>
                          <Select value={newDoc.category} onValueChange={v => setNewDoc({ ...newDoc, category: v })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="labor_law">劳务法规</SelectItem>
                              <SelectItem value="contract">合同文件</SelectItem>
                              <SelectItem value="company_policy">公司制度</SelectItem>
                              <SelectItem value="contract_template">合同模板</SelectItem>
                              <SelectItem value="field_glossary">字段释义</SelectItem>
                              <SelectItem value="business_data">业务数据</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <Tabs value={docInputMode} onValueChange={v => setDocInputMode(v as 'manual' | 'file')} className="w-full">
                          <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="manual">手动输入</TabsTrigger>
                            <TabsTrigger value="file">上传文件</TabsTrigger>
                          </TabsList>
                          <TabsContent value="manual" className="mt-3">
                            <div className="space-y-2">
                              <Label>文档内容</Label>
                              <Textarea rows={6} placeholder="输入文档内容..." value={newDoc.content} onChange={e => setNewDoc({ ...newDoc, content: e.target.value })} />
                            </div>
                          </TabsContent>
                          <TabsContent value="file" className="mt-3">
                            <div className="space-y-2">
                              <Label>选择文件</Label>
                              <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center hover:border-primary/50 transition-colors cursor-pointer" onClick={() => docFileInputRef.current?.click()}>
                                {uploadingFile ? (
                                  <div className="space-y-2">
                                    <FileText className="h-8 w-8 mx-auto text-primary" />
                                    <p className="text-sm font-medium">{uploadingFile.name}</p>
                                    <p className="text-xs text-muted-foreground">{(uploadingFile.size / 1024).toFixed(1)} KB</p>
                                  </div>
                                ) : (
                                  <div className="space-y-2">
                                    <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
                                    <p className="text-sm text-muted-foreground">点击选择文件或拖拽至此</p>
                                    <p className="text-xs text-muted-foreground">支持 PDF、Word、Excel、PPT、TXT 等格式，最大 20MB</p>
                                  </div>
                                )}
                              </div>
                              <input ref={docFileInputRef} type="file" className="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.text,.csv,.epub,.mobi,.xml" onChange={e => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  if (file.size > 20 * 1024 * 1024) {
                                    toast.error('文件过大', { description: '文件大小不能超过20MB' });
                                    return;
                                  }
                                  setUploadFile(file);
                                  if (!newDoc.title) setNewDoc(prev => ({ ...prev, title: file.name.replace(/\.[^/.]+$/, '') }));
                                }
                              }} />
                            </div>
                          </TabsContent>
                        </Tabs>
                        <Button onClick={docInputMode === 'manual' ? addManualDoc : addFileDoc} className="w-full" disabled={docInputMode === 'file' ? !uploadingFile || uploading : !newDoc.content}>
                          {uploading ? '上传中...' : docInputMode === 'manual' ? '添加' : '上传并添加'}
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                {docs.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">暂无知识库文档</div>
                ) : (
                  <>
                  <div className="hidden overflow-x-auto md:block">
                    <Table className="min-w-[760px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>标题</TableHead>
                        <TableHead>分类</TableHead>
                        <TableHead>来源</TableHead>
                        <TableHead>状态</TableHead>
                        <TableHead>同步时间</TableHead>
                        <TableHead>操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {docs.map(doc => (
                        <TableRow key={doc.id}>
                          <TableCell className="font-medium">{doc.title}</TableCell>
                          <TableCell>{categoryLabels[doc.category] || doc.category}</TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {doc.source_type === 'manual' ? '手动上传' : doc.source_type === 'business_sync' ? '业务同步' : '文件上传'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={doc.status === 'active' ? 'default' : 'destructive'}>
                              {doc.status === 'active' ? '正常' : doc.status === 'error' ? '错误' : doc.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {doc.last_sync_at ? new Date(doc.last_sync_at).toLocaleString() : '-'}
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="sm" className="text-destructive" onClick={() => deleteDoc(doc.id)}>
                              删除
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    </Table>
                  </div>
                  <div className="space-y-3 md:hidden">
                    {docs.map(doc => (
                      <div key={doc.id} className="rounded-lg border bg-white p-4 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate font-medium">{doc.title}</div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {categoryLabels[doc.category] || doc.category}
                            </div>
                          </div>
                          <Badge variant={doc.status === 'active' ? 'default' : 'destructive'} className="shrink-0">
                            {doc.status === 'active' ? '正常' : doc.status === 'error' ? '错误' : doc.status}
                          </Badge>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <div className="text-xs text-muted-foreground">来源</div>
                            <div className="mt-1">
                              <Badge variant="outline">
                                {doc.source_type === 'manual' ? '手动上传' : doc.source_type === 'business_sync' ? '业务同步' : '文件上传'}
                              </Badge>
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground">同步时间</div>
                            <div className="mt-1 text-xs">
                              {doc.last_sync_at ? new Date(doc.last_sync_at).toLocaleString() : '-'}
                            </div>
                          </div>
                        </div>
                        <Button variant="outline" size="sm" className="mt-4 w-full text-destructive" onClick={() => deleteDoc(doc.id)}>
                          删除
                        </Button>
                      </div>
                    ))}
                  </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* 审计日志 */}
        <TabsContent value="audit">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle>AI操作审计日志</CardTitle>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Select value={auditFilter.action} onValueChange={v => setAuditFilter({ ...auditFilter, action: v })}>
                    <SelectTrigger className="w-full sm:w-32"><SelectValue placeholder="全部操作" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部</SelectItem>
                      <SelectItem value="chat">对话</SelectItem>
                      <SelectItem value="chat_blocked">拦截</SelectItem>
                      <SelectItem value="page_analysis">页面分析</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="sm" onClick={exportAuditLogs}>导出CSV</Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {auditLogs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">暂无审计日志</div>
              ) : (
                <>
                <div className="hidden overflow-x-auto md:block">
                  <Table className="min-w-[840px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>时间</TableHead>
                      <TableHead>用户</TableHead>
                      <TableHead>操作</TableHead>
                      <TableHead>输入摘要</TableHead>
                      <TableHead>页面</TableHead>
                      <TableHead>耗时</TableHead>
                      <TableHead>状态</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {auditLogs.map(log => (
                      <TableRow key={log.id}>
                        <TableCell className="text-xs">{new Date(log.created_at).toLocaleString()}</TableCell>
                        <TableCell>{log.username || '-'}</TableCell>
                        <TableCell>
                          <Badge variant={log.action === 'chat_blocked' ? 'destructive' : 'outline'}>
                            {log.action === 'chat' ? '对话' : log.action === 'chat_blocked' ? '拦截' : log.action}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-40 truncate text-sm">{log.input_summary || '-'}</TableCell>
                        <TableCell className="text-sm">{log.page_context || '-'}</TableCell>
                        <TableCell className="text-sm">{log.response_time_ms}ms</TableCell>
                        <TableCell>
                          <Badge variant={log.is_success ? 'default' : 'destructive'}>
                            {log.is_success ? '成功' : '失败'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  </Table>
                </div>
                <div className="space-y-3 md:hidden">
                  {auditLogs.map(log => (
                    <div key={log.id} className="rounded-lg border bg-white p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-xs text-muted-foreground">
                            {new Date(log.created_at).toLocaleString()}
                          </div>
                          <div className="mt-1 font-medium">{log.username || '-'}</div>
                        </div>
                        <Badge variant={log.is_success ? 'default' : 'destructive'} className="shrink-0">
                          {log.is_success ? '成功' : '失败'}
                        </Badge>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Badge variant={log.action === 'chat_blocked' ? 'destructive' : 'outline'}>
                          {log.action === 'chat' ? '对话' : log.action === 'chat_blocked' ? '拦截' : log.action}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{log.response_time_ms}ms</span>
                      </div>
                      <div className="mt-3 space-y-2 text-sm">
                        <div>
                          <div className="text-xs text-muted-foreground">输入摘要</div>
                          <div className="mt-1 line-clamp-2">{log.input_summary || '-'}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">页面</div>
                          <div className="mt-1">{log.page_context || '-'}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
