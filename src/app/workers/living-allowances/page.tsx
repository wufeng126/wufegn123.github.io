'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  FileImage,
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
  reconciled_count?: number;
  amount_matched_count?: number;
  amount_mismatch_count?: number;
  salary_not_found_count?: number;
  salary_duplicate_count?: number;
  record_not_found_count?: number;
  pending_count?: number;
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
  match_status?: 'unmatched' | 'manual_required' | 'matched' | 'amount_matched' | 'amount_mismatch' | 'salary_not_found' | 'salary_duplicate' | 'record_not_found' | 'allowance_record_not_found' | string;
  matched_record_id?: number | null;
  matched_salary_id?: number | null;
  allowance_record_amount?: number | null;
  allowance_month_total?: number | null;
  allowance_record_count?: number;
  salary_advance_pay?: number | null;
  salary_net_pay?: number | null;
  allowance_difference?: number | null;
  allowance_month_difference?: number | null;
  salary_difference?: number | null;
  salary_coverage_difference?: number | null;
  salary_found?: boolean;
  salary_duplicate?: boolean;
  salary_record_count?: number;
  allowance_record_found?: boolean;
  year_month?: string;
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

const signedMoney = (value: unknown) => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '-';
  return `${amount > 0 ? '+' : ''}¥${money(amount)}`;
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
    return <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">核对完成</Badge>;
  }
  if (status === 'amount_matched') {
    return <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">金额一致</Badge>;
  }
  if (status === 'amount_mismatch') {
    return <Badge className="border-red-200 bg-red-50 text-red-700">金额不一致</Badge>;
  }
  if (status === 'salary_not_found') {
    return <Badge className="border-amber-200 bg-amber-50 text-amber-700">未找到工资</Badge>;
  }
  if (status === 'salary_duplicate') {
    return <Badge className="border-orange-200 bg-orange-50 text-orange-700">工资记录重复</Badge>;
  }
  if (status === 'record_not_found' || status === 'allowance_record_not_found') {
    return <Badge className="border-amber-200 bg-amber-50 text-amber-700">未找到生活费台账</Badge>;
  }
  if (status === 'manual_required') {
    return <Badge className="border-amber-200 bg-amber-50 text-amber-700">需补充工人</Badge>;
  }
  if (status === 'split') {
    return <Badge className="border-sky-200 bg-sky-50 text-sky-700">待核对</Badge>;
  }
  if (status === 'pending') {
    return <Badge className="border-slate-200 bg-slate-50 text-slate-600">待拆分</Badge>;
  }
  if (status === 'unmatched') {
    return <Badge className="border-slate-200 bg-slate-50 text-slate-600">待核对</Badge>;
  }
  return <Badge className="border-orange-200 bg-orange-50 text-orange-700">待扣工资</Badge>;
}

function matchStatusHint(status?: string) {
  if (status === 'manual_required') return '暂未完成核对，请补充工人后重试';
  if (status === 'salary_not_found') return '暂未完成核对，补齐工资记录后可重试';
  if (status === 'salary_duplicate') return '暂未完成核对，清理重复工资记录后可重试';
  if (status === 'record_not_found') return '暂未完成核对，补齐生活费台账后可重试';
  if (status === 'allowance_record_not_found') return '暂未完成核对，确认生活费台账对应关系后可重试';
  if (status === 'amount_mismatch') return '已完成核对，请查看回单、生活费台账与工资预支款差异';
  return '';
}

function isFinalMatchStatus(status?: string) {
  return ['matched', 'amount_matched', 'amount_mismatch'].includes(status || '');
}

function getMatchFeedback(status?: string) {
  if (status === 'amount_matched') {
    return { title: '工资核对完成，金额一致', variant: 'success' as const };
  }
  if (status === 'amount_mismatch') {
    return {
      title: '工资核对完成，请查看金额差异',
      description: '回单金额、生活费台账或工资预支款存在差异。',
      variant: 'error' as const,
    };
  }
  if (status === 'manual_required') {
    return {
      title: '暂未完成核对',
      description: '请补充工人后重试。',
      variant: 'error' as const,
    };
  }
  if (status === 'salary_not_found') {
    return {
      title: '暂未完成核对',
      description: '补齐工资记录后可重试。',
      variant: 'error' as const,
    };
  }
  if (status === 'salary_duplicate') {
    return {
      title: '存在重复工资记录，暂不能确认',
      description: '请清理同一工人、项目、月份的重复工资记录后重试。',
      variant: 'error' as const,
    };
  }
  if (status === 'record_not_found') {
    return {
      title: '暂未完成核对',
      description: '补齐生活费台账后可重试。',
      variant: 'error' as const,
    };
  }
  if (status === 'allowance_record_not_found') {
    return {
      title: '暂未完成核对',
      description: '确认生活费台账对应关系后可重试。',
      variant: 'error' as const,
    };
  }
  return { title: '工资核对完成', variant: 'success' as const };
}

function isProtectedSplitRow(row: SplitRow) {
  return isFinalMatchStatus(row.match_status);
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
    {
      label: '回单待核对',
      value: `${receipts.filter(receipt => receipt.split_status === 'pending' || (receipt.pending_count || 0) > 0).length} 张`,
      tone: 'text-sky-600',
    },
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

      toast({ title: '回单已上传，可以开始拆分并核对工资' });
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
    if (splitRows.some(isProtectedSplitRow)) {
      toast({ title: '该回单已有核对结果，不能覆盖拆分明细', variant: 'error' });
      return;
    }
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
      throw new Error('请先保存拆分明细，再核对工资');
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
    if (!res.ok && !data?.match_status) throw new Error(data.error || '核对工资失败');
    return data;
  };

  const handleMatchRow = async (row: SplitRow) => {
    setSaving(true);
    try {
      const result = await matchSplitRow(row);
      const feedback = getMatchFeedback(result?.match_status);
      toast(feedback);
      if (selectedReceipt) await openSplitDialog(selectedReceipt);
      await fetchData();
    } catch (error) {
      toast({ title: error instanceof Error ? error.message : '核对失败', variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleMatchAll = async () => {
    setSaving(true);
    try {
      let success = 0;
      let pending = 0;
      let skipped = 0;
      let failed = 0;
      const failureMessages: string[] = [];
      for (const row of splitRows) {
        if (isProtectedSplitRow(row)) {
          skipped += 1;
          continue;
        }
        if (!row.id) {
          failed += 1;
          if (failureMessages.length < 3) failureMessages.push('存在未保存的拆分明细');
          continue;
        }
        try {
          const result = await matchSplitRow(row);
          success += 1;
          if (result?.match_status && !isFinalMatchStatus(result.match_status)) {
            pending += 1;
          }
        } catch (error) {
          failed += 1;
          if (failureMessages.length < 3) {
            failureMessages.push(error instanceof Error ? error.message : '核对失败');
          }
        }
      }
      if (failed > 0) {
        toast({
          title: `已完成 ${success} 条核对，${failed} 条失败${skipped ? `，${skipped} 条已跳过` : ''}`,
          description: failureMessages.join('；'),
          variant: 'error',
        });
      } else {
        toast({
          title: pending > 0
            ? `已处理 ${success} 条核对，${pending} 条待补齐后重试`
            : `已完成 ${success} 条核对${skipped ? `，${skipped} 条已有结果已跳过` : ''}`,
          description: pending > 0 ? '工资或生活费台账信息补齐后，可再次点击核对。' : undefined,
        });
      }
      if (selectedReceipt) await openSplitDialog(selectedReceipt);
      await fetchData();
    } catch (error) {
      toast({ title: error instanceof Error ? error.message : '批量核对失败', variant: 'error' });
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
              先登记生活费，工资表导入时自动处理预支款；回单原图仅用于查询核对，不会再次扣款。
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
            <TabsTrigger value="receipts">回单与工资核对</TabsTrigger>
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
            <div className="space-y-3">
              <Card className="rounded-lg py-0 shadow-sm">
                <CardHeader className="border-b px-4 py-4">
                  <CardTitle className="text-base">回单原图与核对结果</CardTitle>
                  <CardDescription>一张回单可以拆成多名工人，核对工资表预支款和已有生活费台账，不新增生活费记录。</CardDescription>
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
                          <TableHead>核对结果</TableHead>
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
                              <div className="flex flex-col items-start gap-1">
                                {statusBadge(receipt.split_status)}
                                <span className="text-xs text-slate-500">
                                  已核对 {receipt.reconciled_count ?? receipt.matched_count ?? 0}/{receipt.item_count || 0}
                                </span>
                                {(receipt.item_count || 0) > 0 && (
                                  <span className="text-xs text-slate-500">
                                    一致 {receipt.amount_matched_count || 0} · 差异 {receipt.amount_mismatch_count || 0}
                                    {(receipt.salary_not_found_count || 0) > 0 ? ` · 无工资 ${receipt.salary_not_found_count}` : ''}
                                    {(receipt.salary_duplicate_count || 0) > 0 ? ` · 工资重复 ${receipt.salary_duplicate_count}` : ''}
                                    {(receipt.record_not_found_count || 0) > 0 ? ` · 无台账 ${receipt.record_not_found_count}` : ''}
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button size="sm" variant="outline" onClick={() => void openSplitDialog(receipt)}>
                                <Scissors className="mr-1.5 h-3.5 w-3.5" />
                                查看/核对
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
                <p className="font-medium">核对口径</p>
                <p className="mt-1 leading-6">
                  生活费扣款以工资导入或工资保存时的原有逻辑为准；这里仅将回单明细与工资表、已有生活费台账进行查询核对，
                  不新增生活费台账，也不修改预支款和实发工资。
                </p>
              </div>
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
            <DialogTitle>回单拆分与工资核对</DialogTitle>
            <DialogDescription>
              {selectedReceipt ? `${selectedReceipt.receipt_date} · ${selectedReceipt.file_name || '回单文件'}` : '将一张回单拆成多名工人的付款明细，再查询对应工资信息'}
            </DialogDescription>
          </DialogHeader>

          {selectedReceipt?.url && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
              <span className="inline-flex items-center gap-2 text-slate-600">
                <FileImage className="h-4 w-4 text-blue-600" />
                先打开原图录入收款人和金额，保存后再进行工资核对
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
                  <TableHead className="min-w-[220px]">工资核对</TableHead>
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
                      <Input value={row.recipient_name || ''} onChange={(event) => updateSplitRow(index, { recipient_name: event.target.value })} placeholder="回单收款人" disabled={isProtectedSplitRow(row)} />
                    </TableCell>
                    <TableCell>
                      <Select value={asSelectValue(row.worker_id)} onValueChange={(value) => updateSplitRow(index, { worker_id: value === 'none' ? '' : value })} disabled={isProtectedSplitRow(row)}>
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
                      <Select value={asSelectValue(row.project_id || selectedReceipt?.project_id)} onValueChange={(value) => updateSplitRow(index, { project_id: value === 'none' ? '' : value })} disabled={isProtectedSplitRow(row)}>
                        <SelectTrigger><SelectValue placeholder="选择项目" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">不指定项目</SelectItem>
                          {projects.map(project => <SelectItem key={project.id} value={String(project.id)}>{project.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Input type="number" step="0.01" value={row.amount} onChange={(event) => updateSplitRow(index, { amount: event.target.value })} disabled={isProtectedSplitRow(row)} />
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1 text-xs leading-5 text-slate-600">
                        <div>
                          工资预支款：
                          <span className="font-medium text-slate-900">
                            {row.salary_found ? `¥${money(row.salary_advance_pay)}` : '未找到'}
                          </span>
                        </div>
                        <div>
                          本笔生活费：
                          <span className="font-medium text-slate-900">
                            {row.allowance_record_found ? `¥${money(row.allowance_record_amount)}` : '未找到'}
                          </span>
                        </div>
                        <div>
                          本月累计生活费：
                          <span className="font-medium text-slate-900">
                            {row.allowance_record_count ? `¥${money(row.allowance_month_total)}` : '未找到'}
                          </span>
                        </div>
                        {row.salary_duplicate && (
                          <div className="font-medium text-orange-700">
                            同一工人、项目、月份存在 {row.salary_record_count || 0} 条工资记录，暂不能确认工资对应关系
                          </div>
                        )}
                        {row.allowance_difference !== null && row.allowance_difference !== undefined && (
                          <div className={cn(
                            'font-medium',
                            Math.abs(Number(row.allowance_difference)) <= 0.01 ? 'text-emerald-700' : 'text-orange-700',
                          )}>
                            回单 - 本笔生活费：{signedMoney(row.allowance_difference)}
                          </div>
                        )}
                        {row.allowance_month_difference !== null && row.allowance_month_difference !== undefined && (
                          <div className={cn(
                            'font-medium',
                            Math.abs(Number(row.allowance_month_difference)) <= 0.01 ? 'text-emerald-700' : 'text-orange-700',
                          )}>
                            回单 - 本月生活费：{signedMoney(row.allowance_month_difference)}
                          </div>
                        )}
                        {row.salary_difference !== null && row.salary_difference !== undefined && (
                          <div className={cn(
                            'font-medium',
                            Math.abs(Number(row.salary_difference)) <= 0.01 ? 'text-emerald-700' : 'text-orange-700',
                          )}>
                            回单 - 预支款：{signedMoney(row.salary_difference)}
                          </div>
                        )}
                        {row.salary_coverage_difference !== null && row.salary_coverage_difference !== undefined && (
                          <div className={cn(
                            'font-medium',
                            Math.abs(Number(row.salary_coverage_difference)) <= 0.01 ? 'text-emerald-700' : 'text-orange-700',
                          )}>
                            本月生活费 - 预支款：{signedMoney(row.salary_coverage_difference)}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Input type="date" value={row.payment_date || selectedReceipt?.receipt_date || getToday()} onChange={(event) => updateSplitRow(index, { payment_date: event.target.value })} disabled={isProtectedSplitRow(row)} />
                    </TableCell>
                    <TableCell>
                      <Input value={row.bank_card_tail || ''} onChange={(event) => updateSplitRow(index, { bank_card_tail: event.target.value })} placeholder="后4位" disabled={isProtectedSplitRow(row)} />
                    </TableCell>
                    <TableCell>
                      <Input value={row.transaction_no || ''} onChange={(event) => updateSplitRow(index, { transaction_no: event.target.value })} placeholder="选填" disabled={isProtectedSplitRow(row)} />
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        {statusBadge(row.match_status)}
                        {matchStatusHint(row.match_status) && (
                          <div className="max-w-[180px] text-xs leading-4 text-slate-500">
                            {matchStatusHint(row.match_status)}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => void handleMatchRow(row)} disabled={saving || isProtectedSplitRow(row)}>
                          {['manual_required', 'salary_not_found', 'salary_duplicate', 'record_not_found', 'allowance_record_not_found'].includes(row.match_status || '')
                            ? <AlertTriangle className="mr-1 h-3.5 w-3.5" />
                            : <CheckCircle2 className="mr-1 h-3.5 w-3.5" />}
                          核对
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => removeSplitRow(index)} disabled={isProtectedSplitRow(row)}>删除</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={addSplitRow} disabled={saving || splitRows.some(isProtectedSplitRow)}>
              <Plus className="mr-2 h-4 w-4" />
              增加一行
            </Button>
            <Button variant="outline" onClick={() => void saveSplitRows()} disabled={saving || splitRows.some(isProtectedSplitRow)}>
              <Save className="mr-2 h-4 w-4" />
              保存拆分
            </Button>
            <Button onClick={() => void handleMatchAll()} disabled={saving || splitRows.length === 0 || splitRows.every(isProtectedSplitRow)}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
              批量核对
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
