'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  FileImage,
  Link2,
  Loader2,
  Plus,
  ReceiptText,
  RefreshCw,
  Save,
  Scissors,
  Upload,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

type Worker = {
  id: number;
  name: string;
  work_type?: string;
  project_id?: number | null;
  project_name?: string;
  bank_card?: string;
};

type Project = {
  id: number;
  name: string;
};

type LivingAllowanceRecord = {
  id: number;
  worker_id: number;
  worker_name: string;
  worker_work_type?: string;
  project_id?: number | null;
  project_name?: string;
  year_month: string;
  allowance_date: string;
  amount: number;
  payment_method?: string;
  status: 'pending_deduction' | 'deducted' | string;
  deducted_salary_id?: number | null;
  deducted_amount?: number;
  receipt_id?: number | null;
  transaction_no?: string | null;
  remark?: string | null;
};

type LivingAllowanceSummary = {
  totalAmount: number;
  pendingAmount: number;
  deductedAmount: number;
  recordCount: number;
};

type ReceiptRow = {
  id: number;
  project_id?: number | null;
  project_name?: string;
  receipt_date: string;
  file_name?: string;
  file_type?: string;
  split_status: 'pending' | 'split' | 'matched' | string;
  remark?: string | null;
  url?: string | null;
  item_count?: number;
  matched_count?: number;
  split_amount?: number;
};

type SplitRow = {
  id?: number;
  receipt_id?: number;
  worker_id?: number | string | null;
  worker_name?: string;
  project_id?: number | string | null;
  project_name?: string;
  recipient_name: string;
  bank_card_tail?: string;
  amount: number | string;
  payment_date: string;
  transaction_no?: string;
  match_status?: 'unmatched' | 'manual_required' | 'matched' | string;
  matched_record_id?: number | null;
  match_score?: number;
  remark?: string;
};

const getCurrentMonth = () => new Date().toISOString().slice(0, 7);
const getToday = () => new Date().toISOString().slice(0, 10);

const emptySummary: LivingAllowanceSummary = {
  totalAmount: 0,
  pendingAmount: 0,
  deductedAmount: 0,
  recordCount: 0,
};

const money = (value: unknown) => {
  const amount = Number(value) || 0;
  return amount.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const asSelectValue = (value: unknown) => {
  if (value === null || value === undefined || value === '') return 'none';
  return String(value);
};

const parseAmount = (value: unknown) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
};

function statusBadge(status?: string) {
  if (status === 'deducted') {
    return <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">已进工资表</Badge>;
  }
  if (status === 'matched') {
    return <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">已生成台账</Badge>;
  }
  if (status === 'manual_required') {
    return <Badge className="border-amber-200 bg-amber-50 text-amber-700">需手动匹配</Badge>;
  }
  if (status === 'split') {
    return <Badge className="border-sky-200 bg-sky-50 text-sky-700">已拆分</Badge>;
  }
  if (status === 'pending') {
    return <Badge className="border-slate-200 bg-slate-50 text-slate-600">待拆分</Badge>;
  }
  return <Badge className="border-orange-200 bg-orange-50 text-orange-700">待扣工资</Badge>;
}

function makeBlankSplitRow(receipt?: ReceiptRow): SplitRow {
  return {
    project_id: receipt?.project_id || '',
    recipient_name: '',
    worker_id: '',
    bank_card_tail: '',
    amount: '',
    payment_date: receipt?.receipt_date || getToday(),
    transaction_no: '',
    match_status: 'unmatched',
    remark: '',
  };
}

export default function LivingAllowancesPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<LivingAllowanceRecord[]>([]);
  const [summary, setSummary] = useState<LivingAllowanceSummary>(emptySummary);
  const [receipts, setReceipts] = useState<ReceiptRow[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [filterProject, setFilterProject] = useState('all');
  const [filterMonth, setFilterMonth] = useState(getCurrentMonth);
  const [filterStatus, setFilterStatus] = useState('all');
  const [keyword, setKeyword] = useState('');

  const [recordDialogOpen, setRecordDialogOpen] = useState(false);
  const [receiptDialogOpen, setReceiptDialogOpen] = useState(false);
  const [splitDialogOpen, setSplitDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<ReceiptRow | null>(null);
  const [splitRows, setSplitRows] = useState<SplitRow[]>([]);

  const [recordForm, setRecordForm] = useState({
    worker_id: '',
    project_id: '',
    allowance_date: getToday(),
    year_month: getCurrentMonth(),
    amount: '',
    payment_method: '银行转账',
    remark: '',
  });

  const [receiptForm, setReceiptForm] = useState({
    project_id: 'none',
    receipt_date: getToday(),
    payer_account: '',
    remark: '',
    file: null as File | null,
  });

  const selectedWorker = useMemo(
    () => workers.find(worker => String(worker.id) === recordForm.worker_id),
    [recordForm.worker_id, workers]
  );

  const filteredRecords = useMemo(() => {
    const text = keyword.trim().toLowerCase();
    if (!text) return records;
    return records.filter(record => {
      return [
        record.worker_name,
        record.project_name,
        record.year_month,
        record.transaction_no,
        record.remark,
      ].some(value => String(value || '').toLowerCase().includes(text));
    });
  }, [keyword, records]);

  const stats = [
    { label: '本期生活费', value: `¥${money(summary.totalAmount)}`, tone: 'text-slate-900' },
    { label: '待扣工资', value: `¥${money(summary.pendingAmount)}`, tone: 'text-orange-600' },
    { label: '已进工资表', value: `¥${money(summary.deductedAmount)}`, tone: 'text-emerald-600' },
    { label: '回单待处理', value: `${receipts.filter(receipt => receipt.split_status !== 'matched').length} 张`, tone: 'text-sky-600' },
  ];

  const fetchData = async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams();
      if (filterProject !== 'all') query.set('project_id', filterProject);
      if (filterMonth !== 'all') query.set('year_month', filterMonth);
      if (filterStatus !== 'all') query.set('status', filterStatus);

      const receiptQuery = new URLSearchParams();
      if (filterProject !== 'all') receiptQuery.set('project_id', filterProject);
      receiptQuery.set('limit', '50');

      const [recordsRes, receiptsRes, workersRes, projectsRes] = await Promise.all([
        fetch(`/api/living-allowances?${query.toString()}`, { credentials: 'include' }),
        fetch(`/api/living-allowances/receipts?${receiptQuery.toString()}`, { credentials: 'include' }),
        fetch('/api/workers', { credentials: 'include' }),
        fetch('/api/projects', { credentials: 'include' }),
      ]);

      if (!recordsRes.ok) throw new Error((await recordsRes.json()).error || '查询生活费台账失败');
      if (!receiptsRes.ok) throw new Error((await receiptsRes.json()).error || '查询生活费回单失败');
      if (!workersRes.ok) throw new Error('查询工人失败');
      if (!projectsRes.ok) throw new Error('查询项目失败');

      const [recordsData, receiptsData, workersData, projectsData] = await Promise.all([
        recordsRes.json(),
        receiptsRes.json(),
        workersRes.json(),
        projectsRes.json(),
      ]);

      setRecords(recordsData.records || []);
      setSummary(recordsData.summary || emptySummary);
      setReceipts(receiptsData.receipts || []);
      setWorkers(workersData.workers || []);
      setProjects(projectsData.projects || []);
    } catch (error) {
      console.error('[LivingAllowancesPage] fetch failed:', error);
      toast({
        title: error instanceof Error ? error.message : '数据加载失败',
        variant: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterProject, filterMonth, filterStatus]);

  useEffect(() => {
    if (!selectedWorker) return;
    setRecordForm(prev => ({
      ...prev,
      project_id: prev.project_id || (selectedWorker.project_id ? String(selectedWorker.project_id) : ''),
    }));
  }, [selectedWorker]);

  const resetRecordForm = () => {
    setRecordForm({
      worker_id: '',
      project_id: '',
      allowance_date: getToday(),
      year_month: filterMonth === 'all' ? getCurrentMonth() : filterMonth,
      amount: '',
      payment_method: '银行转账',
      remark: '',
    });
  };

  const createRecord = async () => {
    if (!recordForm.worker_id || !recordForm.allowance_date || !recordForm.year_month || parseAmount(recordForm.amount) <= 0) {
      toast({ title: '请填写工人、发放日期、所属月份和金额', variant: 'error' });
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/living-allowances', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...recordForm,
          project_id: recordForm.project_id || null,
          amount: parseAmount(recordForm.amount),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '新增生活费失败');

      toast({ title: '生活费已记入待扣台账' });
      setRecordDialogOpen(false);
      resetRecordForm();
      await fetchData();
    } catch (error) {
      toast({ title: error instanceof Error ? error.message : '新增失败', variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const uploadReceipt = async () => {
    if (!receiptForm.file) {
      toast({ title: '请选择回单原图或PDF', variant: 'error' });
      return;
    }
    if (!receiptForm.receipt_date) {
      toast({ title: '请选择回单日期', variant: 'error' });
      return;
    }

    setSaving(true);
    try {
      const formData = new FormData();
      formData.append('file', receiptForm.file);
      formData.append('receipt_date', receiptForm.receipt_date);
      if (receiptForm.project_id !== 'none') formData.append('project_id', receiptForm.project_id);
      if (receiptForm.payer_account) formData.append('payer_account', receiptForm.payer_account);
      if (receiptForm.remark) formData.append('remark', receiptForm.remark);

      const res = await fetch('/api/living-allowances/receipts/upload', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '上传回单失败');

      toast({ title: '回单已上传，可以开始拆分匹配' });
      setReceiptDialogOpen(false);
      setReceiptForm({ project_id: 'none', receipt_date: getToday(), payer_account: '', remark: '', file: null });
      await fetchData();
    } catch (error) {
      toast({ title: error instanceof Error ? error.message : '上传失败', variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const openSplitDialog = async (receipt: ReceiptRow) => {
    setSelectedReceipt(receipt);
    setSplitDialogOpen(true);
    try {
      const res = await fetch(`/api/living-allowances/receipt-items?receipt_id=${receipt.id}`, { credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '读取拆分明细失败');
      const items = (data.items || []) as SplitRow[];
      setSplitRows(items.length > 0 ? items : [makeBlankSplitRow(receipt)]);
    } catch (error) {
      toast({ title: error instanceof Error ? error.message : '读取拆分明细失败', variant: 'error' });
      setSplitRows([makeBlankSplitRow(receipt)]);
    }
  };

  const updateSplitRow = (index: number, patch: Partial<SplitRow>) => {
    setSplitRows(prev => prev.map((row, rowIndex) => {
      if (rowIndex !== index) return row;
      const next = { ...row, ...patch };
      if (patch.worker_id) {
        const worker = workers.find(item => String(item.id) === String(patch.worker_id));
        if (worker) {
          next.recipient_name = next.recipient_name || worker.name;
          next.project_id = next.project_id || worker.project_id || selectedReceipt?.project_id || '';
        }
      }
      return next;
    }));
  };

  const addSplitRow = () => {
    setSplitRows(prev => [...prev, makeBlankSplitRow(selectedReceipt || undefined)]);
  };

  const removeSplitRow = (index: number) => {
    setSplitRows(prev => prev.length <= 1 ? prev : prev.filter((_, rowIndex) => rowIndex !== index));
  };

  const saveSplitRows = async () => {
    if (!selectedReceipt) return;
    const invalidIndex = splitRows.findIndex(row => !row.recipient_name || parseAmount(row.amount) <= 0);
    if (invalidIndex >= 0) {
      toast({ title: `第 ${invalidIndex + 1} 行请填写收款人和金额`, variant: 'error' });
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/living-allowances/receipt-items', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receipt_id: selectedReceipt.id,
          items: splitRows.map(row => ({
            worker_id: row.worker_id && row.worker_id !== 'none' ? Number(row.worker_id) : null,
            project_id: row.project_id && row.project_id !== 'none' ? Number(row.project_id) : selectedReceipt.project_id || null,
            recipient_name: row.recipient_name,
            bank_card_tail: row.bank_card_tail || '',
            amount: parseAmount(row.amount),
            payment_date: row.payment_date || selectedReceipt.receipt_date,
            transaction_no: row.transaction_no || '',
            remark: row.remark || '',
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '保存拆分明细失败');
      toast({ title: '拆分明细已保存' });
      await openSplitDialog(selectedReceipt);
      await fetchData();
    } catch (error) {
      toast({ title: error instanceof Error ? error.message : '保存失败', variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const matchSplitRow = async (row: SplitRow) => {
    if (!row.id) {
      toast({ title: '请先保存拆分明细，再生成台账', variant: 'error' });
      return false;
    }

    const res = await fetch('/api/living-allowances/match', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        item_id: row.id,
        worker_id: row.worker_id && row.worker_id !== 'none' ? Number(row.worker_id) : undefined,
        project_id: row.project_id && row.project_id !== 'none' ? Number(row.project_id) : selectedReceipt?.project_id || undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '生成台账失败');
    return true;
  };

  const handleMatchRow = async (row: SplitRow) => {
    setSaving(true);
    try {
      await matchSplitRow(row);
      toast({ title: '已生成生活费台账' });
      if (selectedReceipt) await openSplitDialog(selectedReceipt);
      await fetchData();
    } catch (error) {
      toast({ title: error instanceof Error ? error.message : '生成失败', variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleMatchAll = async () => {
    setSaving(true);
    try {
      let success = 0;
      for (const row of splitRows) {
        if (row.match_status === 'matched') continue;
        await matchSplitRow(row);
        success += 1;
      }
      toast({ title: `已生成 ${success} 条生活费台账` });
      if (selectedReceipt) await openSplitDialog(selectedReceipt);
      await fetchData();
    } catch (error) {
      toast({ title: error instanceof Error ? error.message : '批量生成失败', variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-full bg-slate-50 px-3 py-4 sm:px-5 lg:px-6">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-4">
        <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white px-4 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <ReceiptText className="h-5 w-5 text-blue-600" />
              <h1 className="text-lg font-semibold text-slate-950">生活费发放台账</h1>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              先登记生活费和回单，工资表出来后自动匹配到预支款，保留原图和拆分明细。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void fetchData()} disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              刷新
            </Button>
            <Button variant="outline" onClick={() => setReceiptDialogOpen(true)}>
              <Upload className="mr-2 h-4 w-4" />
              上传回单
            </Button>
            <Button onClick={() => { resetRecordForm(); setRecordDialogOpen(true); }}>
              <Plus className="mr-2 h-4 w-4" />
              新增生活费
            </Button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map(item => (
            <Card key={item.label} className="gap-2 rounded-lg py-4 shadow-sm">
              <CardContent className="px-4">
                <p className="text-xs text-slate-500">{item.label}</p>
                <p className={cn('mt-2 text-2xl font-semibold', item.tone)}>{item.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="rounded-lg py-4 shadow-sm">
          <CardContent className="flex flex-col gap-3 px-4 lg:flex-row lg:items-end">
            <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5">
                <Label>项目</Label>
                <Select value={filterProject} onValueChange={setFilterProject}>
                  <SelectTrigger><SelectValue placeholder="全部项目" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部项目</SelectItem>
                    {projects.map(project => (
                      <SelectItem key={project.id} value={String(project.id)}>{project.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>所属月份</Label>
                <Input type="month" value={filterMonth === 'all' ? '' : filterMonth} onChange={(event) => setFilterMonth(event.target.value || 'all')} />
              </div>
              <div className="space-y-1.5">
                <Label>状态</Label>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger><SelectValue placeholder="全部状态" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部状态</SelectItem>
                    <SelectItem value="pending_deduction">待扣工资</SelectItem>
                    <SelectItem value="deducted">已进工资表</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>搜索</Label>
                <Input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="工人 / 项目 / 流水号" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="records" className="gap-3">
          <TabsList className="h-10 rounded-lg">
            <TabsTrigger value="records">生活费台账</TabsTrigger>
            <TabsTrigger value="receipts">回单拆分匹配</TabsTrigger>
          </TabsList>

          <TabsContent value="records">
            <Card className="rounded-lg py-0 shadow-sm">
              <CardHeader className="border-b px-4 py-4">
                <CardTitle className="text-base">生活费明细</CardTitle>
                <CardDescription>待扣记录会在对应月份工资表保存或导入后自动进入预支款。</CardDescription>
              </CardHeader>
              <CardContent className="px-0">
                <div className="hidden overflow-x-auto lg:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>工人</TableHead>
                        <TableHead>项目</TableHead>
                        <TableHead>发放日期</TableHead>
                        <TableHead>所属月份</TableHead>
                        <TableHead className="text-right">生活费</TableHead>
                        <TableHead>来源</TableHead>
                        <TableHead>状态</TableHead>
                        <TableHead>备注</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        <TableRow><TableCell colSpan={8} className="h-28 text-center text-slate-500">加载中...</TableCell></TableRow>
                      ) : filteredRecords.length === 0 ? (
                        <TableRow><TableCell colSpan={8} className="h-28 text-center text-slate-500">暂无生活费记录</TableCell></TableRow>
                      ) : filteredRecords.map(record => (
                        <TableRow key={record.id}>
                          <TableCell>
                            <div className="font-medium text-slate-900">{record.worker_name}</div>
                            <div className="text-xs text-slate-500">{record.worker_work_type || '-'}</div>
                          </TableCell>
                          <TableCell>{record.project_name || '-'}</TableCell>
                          <TableCell>{record.allowance_date}</TableCell>
                          <TableCell>{record.year_month}</TableCell>
                          <TableCell className="text-right font-semibold text-orange-600">¥{money(record.amount)}</TableCell>
                          <TableCell>
                            {record.receipt_id ? (
                              <span className="inline-flex items-center gap-1 text-sky-700"><FileImage className="h-3.5 w-3.5" />回单拆分</span>
                            ) : '手工录入'}
                          </TableCell>
                          <TableCell>{statusBadge(record.status)}</TableCell>
                          <TableCell className="max-w-[240px] truncate text-slate-500">{record.remark || record.transaction_no || '-'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="grid gap-3 p-3 lg:hidden">
                  {filteredRecords.map(record => (
                    <div key={record.id} className="rounded-lg border border-slate-200 bg-white p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-slate-900">{record.worker_name}</p>
                          <p className="text-xs text-slate-500">{record.project_name || '-'} · {record.year_month}</p>
                        </div>
                        {statusBadge(record.status)}
                      </div>
                      <div className="mt-3 flex items-end justify-between">
                        <div className="text-xs text-slate-500">发放日期 {record.allowance_date}</div>
                        <div className="text-lg font-semibold text-orange-600">¥{money(record.amount)}</div>
                      </div>
                    </div>
                  ))}
                  {!loading && filteredRecords.length === 0 && (
                    <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">暂无生活费记录</div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="receipts">
            <div className="grid gap-3 xl:grid-cols-[1fr_360px]">
              <Card className="rounded-lg py-0 shadow-sm">
                <CardHeader className="border-b px-4 py-4">
                  <CardTitle className="text-base">回单原图</CardTitle>
                  <CardDescription>一张回单可拆成多名工人的付款明细，再生成生活费台账。</CardDescription>
                </CardHeader>
                <CardContent className="px-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>回单日期</TableHead>
                          <TableHead>项目</TableHead>
                          <TableHead>文件</TableHead>
                          <TableHead className="text-right">拆分金额</TableHead>
                          <TableHead>进度</TableHead>
                          <TableHead className="text-right">操作</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {receipts.length === 0 ? (
                          <TableRow><TableCell colSpan={6} className="h-28 text-center text-slate-500">暂无回单</TableCell></TableRow>
                        ) : receipts.map(receipt => (
                          <TableRow key={receipt.id}>
                            <TableCell>{receipt.receipt_date}</TableCell>
                            <TableCell>{receipt.project_name || '-'}</TableCell>
                            <TableCell>
                              <div className="max-w-[260px] truncate font-medium text-slate-900">{receipt.file_name || '回单文件'}</div>
                              {receipt.url && (
                                <a className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline" href={receipt.url} target="_blank" rel="noreferrer">
                                  查看原图 <ExternalLink className="h-3 w-3" />
                                </a>
                              )}
                            </TableCell>
                            <TableCell className="text-right">¥{money(receipt.split_amount || 0)}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {statusBadge(receipt.split_status)}
                                <span className="text-xs text-slate-500">{receipt.matched_count || 0}/{receipt.item_count || 0}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button size="sm" variant="outline" onClick={() => void openSplitDialog(receipt)}>
                                <Scissors className="mr-1.5 h-3.5 w-3.5" />
                                拆分匹配
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-lg shadow-sm">
                <CardHeader className="px-4">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Link2 className="h-4 w-4 text-blue-600" />
                    自动抵扣规则
                  </CardTitle>
                  <CardDescription>工资表出来以后如何和生活费台账对上。</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 px-4 text-sm text-slate-600">
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="font-medium text-slate-900">匹配条件</p>
                    <p className="mt-1">同一工人、同一项目、同一所属月份的待扣生活费，会在工资保存或批量导入后自动匹配。</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="font-medium text-slate-900">抵扣方式</p>
                    <p className="mt-1">生活费补入工资表“预支款”，系统同步重算实发工资，并把生活费标记为已进工资表。</p>
                  </div>
                  <div className="rounded-lg bg-amber-50 p-3 text-amber-800">
                    <p className="font-medium">避免重复扣</p>
                    <p className="mt-1">如果工资表原本的预支款已经覆盖生活费金额，只建立关联关系，不会再次增加扣款。</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={recordDialogOpen} onOpenChange={setRecordDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>新增生活费</DialogTitle>
            <DialogDescription>用于先发生活费、工资表后出的场景。保存后会进入待扣工资台账。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>工人</Label>
              <Select value={recordForm.worker_id || 'none'} onValueChange={(value) => setRecordForm(prev => ({ ...prev, worker_id: value === 'none' ? '' : value }))}>
                <SelectTrigger><SelectValue placeholder="选择工人" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">请选择工人</SelectItem>
                  {workers.map(worker => (
                    <SelectItem key={worker.id} value={String(worker.id)}>
                      {worker.name}{worker.project_name ? ` · ${worker.project_name}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>项目</Label>
              <Select value={recordForm.project_id || 'none'} onValueChange={(value) => setRecordForm(prev => ({ ...prev, project_id: value === 'none' ? '' : value }))}>
                <SelectTrigger><SelectValue placeholder="选择项目" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">不指定项目</SelectItem>
                  {projects.map(project => <SelectItem key={project.id} value={String(project.id)}>{project.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>发放日期</Label>
              <Input type="date" value={recordForm.allowance_date} onChange={(event) => setRecordForm(prev => ({ ...prev, allowance_date: event.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>所属月份</Label>
              <Input type="month" value={recordForm.year_month} onChange={(event) => setRecordForm(prev => ({ ...prev, year_month: event.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>生活费金额</Label>
              <Input type="number" step="0.01" value={recordForm.amount} onChange={(event) => setRecordForm(prev => ({ ...prev, amount: event.target.value }))} placeholder="0.00" />
            </div>
            <div className="space-y-1.5">
              <Label>发放方式</Label>
              <Select value={recordForm.payment_method} onValueChange={(value) => setRecordForm(prev => ({ ...prev, payment_method: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="银行转账">银行转账</SelectItem>
                  <SelectItem value="现金">现金</SelectItem>
                  <SelectItem value="微信">微信</SelectItem>
                  <SelectItem value="支付宝">支付宝</SelectItem>
                  <SelectItem value="其他">其他</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>备注</Label>
              <Textarea value={recordForm.remark} onChange={(event) => setRecordForm(prev => ({ ...prev, remark: event.target.value }))} placeholder="可填写回单编号、发放说明等" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecordDialogOpen(false)}>取消</Button>
            <Button onClick={() => void createRecord()} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={receiptDialogOpen} onOpenChange={setReceiptDialogOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>上传生活费回单</DialogTitle>
            <DialogDescription>支持图片或 PDF。上传后可按收款人拆分，一张回单可以对应多名工人。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="space-y-1.5">
              <Label>回单原图 / PDF</Label>
              <Input type="file" accept="image/*,.pdf" onChange={(event) => setReceiptForm(prev => ({ ...prev, file: event.target.files?.[0] || null }))} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>回单日期</Label>
                <Input type="date" value={receiptForm.receipt_date} onChange={(event) => setReceiptForm(prev => ({ ...prev, receipt_date: event.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>项目</Label>
                <Select value={receiptForm.project_id} onValueChange={(value) => setReceiptForm(prev => ({ ...prev, project_id: value }))}>
                  <SelectTrigger><SelectValue placeholder="可不指定" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">不指定项目</SelectItem>
                    {projects.map(project => <SelectItem key={project.id} value={String(project.id)}>{project.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>付款账户</Label>
              <Input value={receiptForm.payer_account} onChange={(event) => setReceiptForm(prev => ({ ...prev, payer_account: event.target.value }))} placeholder="选填" />
            </div>
            <div className="space-y-1.5">
              <Label>备注</Label>
              <Textarea value={receiptForm.remark} onChange={(event) => setReceiptForm(prev => ({ ...prev, remark: event.target.value }))} placeholder="选填" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReceiptDialogOpen(false)}>取消</Button>
            <Button onClick={() => void uploadReceipt()} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              上传
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={splitDialogOpen} onOpenChange={setSplitDialogOpen}>
        <DialogContent className="max-w-[calc(100vw-1rem)] sm:max-w-6xl">
          <DialogHeader>
            <DialogTitle>回单拆分匹配</DialogTitle>
            <DialogDescription>
              {selectedReceipt ? `${selectedReceipt.receipt_date} · ${selectedReceipt.file_name || '回单文件'}` : '将一张回单拆成多名工人的生活费明细'}
            </DialogDescription>
          </DialogHeader>

          {selectedReceipt?.url && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
              <span className="inline-flex items-center gap-2 text-slate-600">
                <FileImage className="h-4 w-4 text-blue-600" />
                可先打开原图核对收款人、金额和流水号
              </span>
              <a href={selectedReceipt.url} target="_blank" rel="noreferrer">
                <Button variant="outline" size="sm">
                  查看原图
                  <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              </a>
            </div>
          )}

          <div className="max-h-[58vh] overflow-auto rounded-lg border border-slate-200">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[140px]">收款人</TableHead>
                  <TableHead className="min-w-[190px]">匹配工人</TableHead>
                  <TableHead className="min-w-[190px]">项目</TableHead>
                  <TableHead className="min-w-[120px]">金额</TableHead>
                  <TableHead className="min-w-[140px]">付款日期</TableHead>
                  <TableHead className="min-w-[120px]">卡号后四位</TableHead>
                  <TableHead className="min-w-[160px]">流水号</TableHead>
                  <TableHead className="min-w-[120px]">状态</TableHead>
                  <TableHead className="min-w-[150px] text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {splitRows.map((row, index) => (
                  <TableRow key={`${row.id || 'new'}-${index}`}>
                    <TableCell>
                      <Input value={row.recipient_name || ''} onChange={(event) => updateSplitRow(index, { recipient_name: event.target.value })} placeholder="回单收款人" disabled={row.match_status === 'matched'} />
                    </TableCell>
                    <TableCell>
                      <Select value={asSelectValue(row.worker_id)} onValueChange={(value) => updateSplitRow(index, { worker_id: value === 'none' ? '' : value })} disabled={row.match_status === 'matched'}>
                        <SelectTrigger><SelectValue placeholder="可手动选择" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">自动匹配</SelectItem>
                          {workers.map(worker => (
                            <SelectItem key={worker.id} value={String(worker.id)}>
                              {worker.name}{worker.project_name ? ` · ${worker.project_name}` : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select value={asSelectValue(row.project_id || selectedReceipt?.project_id)} onValueChange={(value) => updateSplitRow(index, { project_id: value === 'none' ? '' : value })} disabled={row.match_status === 'matched'}>
                        <SelectTrigger><SelectValue placeholder="选择项目" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">不指定项目</SelectItem>
                          {projects.map(project => <SelectItem key={project.id} value={String(project.id)}>{project.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Input type="number" step="0.01" value={row.amount} onChange={(event) => updateSplitRow(index, { amount: event.target.value })} disabled={row.match_status === 'matched'} />
                    </TableCell>
                    <TableCell>
                      <Input type="date" value={row.payment_date || selectedReceipt?.receipt_date || getToday()} onChange={(event) => updateSplitRow(index, { payment_date: event.target.value })} disabled={row.match_status === 'matched'} />
                    </TableCell>
                    <TableCell>
                      <Input value={row.bank_card_tail || ''} onChange={(event) => updateSplitRow(index, { bank_card_tail: event.target.value })} placeholder="后4位" disabled={row.match_status === 'matched'} />
                    </TableCell>
                    <TableCell>
                      <Input value={row.transaction_no || ''} onChange={(event) => updateSplitRow(index, { transaction_no: event.target.value })} placeholder="选填" disabled={row.match_status === 'matched'} />
                    </TableCell>
                    <TableCell>{statusBadge(row.match_status)}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => void handleMatchRow(row)} disabled={saving || row.match_status === 'matched'}>
                          {row.match_status === 'manual_required' ? <AlertTriangle className="mr-1 h-3.5 w-3.5" /> : <CheckCircle2 className="mr-1 h-3.5 w-3.5" />}
                          生成
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => removeSplitRow(index)} disabled={row.match_status === 'matched'}>删除</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={addSplitRow}>
              <Plus className="mr-2 h-4 w-4" />
              增加一行
            </Button>
            <Button variant="outline" onClick={() => void saveSplitRows()} disabled={saving || splitRows.some(row => row.match_status === 'matched')}>
              <Save className="mr-2 h-4 w-4" />
              保存拆分
            </Button>
            <Button onClick={() => void handleMatchAll()} disabled={saving || splitRows.length === 0}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
              批量生成台账
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
