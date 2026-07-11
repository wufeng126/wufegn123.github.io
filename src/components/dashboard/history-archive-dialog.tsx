'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { History, GitCompare, Trash2, Archive, TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface ArchiveItem {
  id: number;
  month: string;
  project_id: number | null;
  project_name: string;
  report_mode: string;
  snapshot_data: any;
  kpi_summary: any;
  risk_summary: any;
  created_by_name: string;
  created_at: string;
}

interface ComparisonItem {
  key: string;
  label: string;
  unit: string;
  value1: number;
  value2: number;
  diff: number;
  diffPercent: number;
  month1: string;
  month2: string;
}

function formatAmount(val: number): string {
  if (Math.abs(val) >= 100000000) return (val / 100000000).toFixed(2) + ' 亿';
  if (Math.abs(val) >= 10000) return (val / 10000).toFixed(2) + ' 万';
  return val.toLocaleString('zh-CN', { maximumFractionDigits: 0 });
}

function formatValue(val: number, unit: string): string {
  if (unit === '%') return val.toFixed(1) + '%';
  if (unit === '人' || unit === '个') return String(val);
  return formatAmount(val);
}

function DiffBadge({ diff, diffPercent, unit }: { diff: number; diffPercent: number; unit: string }) {
  if (Math.abs(diff) < 0.01 && Math.abs(diffPercent) < 0.01) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Minus className="h-3 w-3" /> 持平
      </span>
    );
  }
  const isUp = diff > 0;
  const isGood = unit !== '%'; // For amounts, up could be good or bad depending on context
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${isUp ? 'text-emerald-600' : 'text-red-600'}`}>
      {isUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {isUp ? '+' : ''}{formatValue(Math.abs(diff), unit)}
      <span className="text-muted-foreground">({isUp ? '+' : ''}{diffPercent}%)</span>
    </span>
  );
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentMonth: string;
  projectId: string;
  onArchive: () => void;
  onLoadArchive: (archive: ArchiveItem) => void;
}

export function HistoryArchiveDialog({ open, onOpenChange, currentMonth, projectId, onArchive, onLoadArchive }: Props) {
  const [tab, setTab] = useState('history');
  const [archives, setArchives] = useState<ArchiveItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [comparison, setComparison] = useState<ComparisonItem[] | null>(null);
  const [compareMonth1, setCompareMonth1] = useState('');
  const [compareMonth2, setCompareMonth2] = useState('');
  const [compareLoading, setCompareLoading] = useState(false);

  const fetchArchives = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/reports/monthly/archives?project_id=${projectId}`);
      const json = await res.json();
      if (json.success) {
        setArchives(json.data || []);
        // Auto-select compare months if available
        if (json.data.length >= 2) {
          setCompareMonth1(json.data[0].month);
          setCompareMonth2(json.data[1].month);
        }
      }
    } catch (err) {
      console.error('Fetch archives error:', err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (open) {
      fetchArchives();
    }
  }, [open, fetchArchives]);

  const handleArchive = async () => {
    try {
      const res = await fetch(`/api/reports/monthly/summary?month=${currentMonth}&project_id=${projectId === 'all' ? '' : projectId}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to get summary');

      const archiveRes = await fetch('/api/reports/monthly/archives', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month: currentMonth,
          projectId: projectId === 'all' ? null : Number(projectId),
          projectName: projectId === 'all' ? '全部项目' : '',
          reportMode: 'boss',
          snapshotData: json.data,
          kpiSummary: extractKpiSummary(json.data),
          riskSummary: json.data?.risks || null,
        }),
      });
      const archiveJson = await archiveRes.json();
      if (archiveJson.success) {
        fetchArchives();
      }
    } catch (err) {
      console.error('Archive error:', err);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确认删除此存档？')) return;
    try {
      await fetch(`/api/reports/monthly/archives?id=${id}`, { method: 'DELETE' });
      fetchArchives();
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  const handleCompare = async () => {
    if (!compareMonth1 || !compareMonth2 || compareMonth1 === compareMonth2) return;
    setCompareLoading(true);
    try {
      const res = await fetch(`/api/reports/monthly/compare?month1=${compareMonth1}&month2=${compareMonth2}&project_id=${projectId}`);
      const json = await res.json();
      if (json.success) {
        setComparison(json.data.comparison);
      }
    } catch (err) {
      console.error('Compare error:', err);
    } finally {
      setCompareLoading(false);
    }
  };

  const availableMonths = archives.map(a => a.month);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            历史月报存档
          </DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="history" className="flex items-center gap-1">
              <Archive className="h-4 w-4" /> 存档列表
            </TabsTrigger>
            <TabsTrigger value="compare" className="flex items-center gap-1">
              <GitCompare className="h-4 w-4" /> 双月对比
            </TabsTrigger>
          </TabsList>

          {/* History Tab */}
          <TabsContent value="history" className="flex-1 overflow-hidden">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-muted-foreground">
                共 {archives.length} 份存档
              </p>
              <Button size="sm" onClick={handleArchive}>
                <Archive className="h-4 w-4 mr-1" />
                存档当前月 ({currentMonth})
              </Button>
            </div>
            <ScrollArea className="h-[400px] pr-4">
              {loading ? (
                <p className="text-center text-muted-foreground py-8">加载中...</p>
              ) : archives.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">暂无存档数据，点击上方按钮存档当前月报</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>月份</TableHead>
                      <TableHead>项目</TableHead>
                      <TableHead>模式</TableHead>
                      <TableHead>存档人</TableHead>
                      <TableHead>存档时间</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {archives.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.month}</TableCell>
                        <TableCell>{item.project_name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{item.report_mode}</Badge>
                        </TableCell>
                        <TableCell>{item.created_by_name}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(item.created_at).toLocaleString('zh-CN')}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                onLoadArchive(item);
                                onOpenChange(false);
                              }}
                            >
                              查看
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-600"
                              onClick={() => handleDelete(item.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </ScrollArea>
          </TabsContent>

          {/* Compare Tab */}
          <TabsContent value="compare" className="flex-1 overflow-hidden">
            <div className="flex items-center gap-3 mb-4">
              <select
                value={compareMonth1}
                onChange={(e) => setCompareMonth1(e.target.value)}
                className="px-3 py-1.5 rounded-md border bg-background text-sm"
              >
                <option value="">选择月份A</option>
                {availableMonths.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <span className="text-muted-foreground text-sm">VS</span>
              <select
                value={compareMonth2}
                onChange={(e) => setCompareMonth2(e.target.value)}
                className="px-3 py-1.5 rounded-md border bg-background text-sm"
              >
                <option value="">选择月份B</option>
                {availableMonths.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <Button
                size="sm"
                onClick={handleCompare}
                disabled={!compareMonth1 || !compareMonth2 || compareMonth1 === compareMonth2 || compareLoading}
              >
                <GitCompare className="h-4 w-4 mr-1" />
                对比
              </Button>
            </div>
            <ScrollArea className="h-[400px] pr-4">
              {!comparison ? (
                <p className="text-center text-muted-foreground py-8">
                  {availableMonths.length < 2
                    ? '至少需要 2 份存档才能进行对比'
                    : '选择两个月份后点击对比按钮'}
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>指标</TableHead>
                      <TableHead className="text-right">{compareMonth1}</TableHead>
                      <TableHead className="text-right">{compareMonth2}</TableHead>
                      <TableHead className="text-right">差值</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {comparison.map((item) => (
                      <TableRow key={item.key}>
                        <TableCell className="font-medium">{item.label}</TableCell>
                        <TableCell className="text-right">{formatValue(item.value1, item.unit)}</TableCell>
                        <TableCell className="text-right">{formatValue(item.value2, item.unit)}</TableCell>
                        <TableCell className="text-right">
                          <DiffBadge diff={item.diff} diffPercent={item.diffPercent} unit={item.unit} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>关闭</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function extractKpiSummary(data: any) {
  if (!data) return null;
  const s = data.summary || data;
  return {
    totalOutput: s.totalOutput || s.totalIncome || 0,
    totalReceived: s.totalReceived || 0,
    totalCost: s.totalCost || 0,
    totalProfit: s.totalProfit || 0,
    profitRate: s.profitRate || 0,
    paymentRate: s.paymentRate || 0,
    monthIncome: s.monthIncome || 0,
    monthCost: s.monthCost || 0,
    monthProfit: s.monthProfit || 0,
    operatingProfit: s.operatingProfit || 0,
    cashNetFlow: s.cashNetFlow || 0,
    supplierUnpaid: s.supplierUnpaid || 0,
    salaryUnpaid: s.salaryUnpaid || 0,
    inServiceCount: s.inServiceCount || 0,
    projectCount: s.projectCount || 0,
  };
}
