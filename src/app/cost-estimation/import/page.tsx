'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import * as XLSX from 'xlsx';
import { Upload, FileSpreadsheet, CheckCircle2, XCircle, AlertCircle, ArrowLeft, Save, Search, Loader2, Sparkles } from 'lucide-react';

interface MatchRow {
  sourceName: string; price: number; unit?: string; notes?: string;
  matchedName: string; confidence: number;
  candidates: { name: string; score: number }[];
  status: 'pending' | 'confirmed' | 'rejected';
}

interface WorkType { name: string; unit: string; category?: string; }

function normalize(s: string) { return s.replace(/[（(].*?[）)]/g, '').replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '').toLowerCase(); }

function fuzzyScore(a: string, b: string): number {
  const na = normalize(a), nb = normalize(b);
  if (na === nb) return 100;
  if (na.includes(nb) || nb.includes(na)) return 80;
  let common = 0;
  for (const ch of na) { if (nb.includes(ch)) common++; }
  return Math.round((common / Math.max(na.length, nb.length)) * 60);
}

export default function ImportPricesPage() {
  const router = useRouter();
  const [step, setStep] = useState<'upload' | 'match' | 'done'>('upload');
  const [workTypes, setWorkTypes] = useState<WorkType[]>([]);
  const [rows, setRows] = useState<MatchRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ success: number; failed: number } | null>(null);
  const [searchFilter, setSearchFilter] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/cost-estimation/work-types').then(r => r.json()).then(d => {
      if (d.success) setWorkTypes(d.data || []);
    });
  }, []);

  function parseFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target?.result as ArrayBuffer);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<any>(sheet, { defval: '' });

      // 自动检测列
      const headers = Object.keys(json[0] || {});
      const nameKey = headers.find(h => /工序|名称|项目|分部分项|工作内容/i.test(h)) || headers[0];
      const priceKey = headers.find(h => /单价|价格|报价|金额|合同价/i.test(h)) || headers[1];
      const unitKey = headers.find(h => /单位/i.test(h)) || '';
      const notesKey = headers.find(h => /备注|说明|项目|年份/i.test(h)) || '';

      const parsed: MatchRow[] = json.map((row: any) => {
        const rawName = String(row[nameKey] || '').trim();
        const rawPrice = parseFloat(String(row[priceKey] || '0').replace(/[^0-9.-]/g, '')) || 0;
        const unit = unitKey ? String(row[unitKey] || '').trim() : '';
        const notes = notesKey ? String(row[notesKey] || '').trim().slice(0, 100) : '';

        // 自动匹配
        const candidates = workTypes.map(w => ({ name: w.name, score: fuzzyScore(rawName, w.name) }))
          .filter(c => c.score > 0).sort((a, b) => b.score - a.score).slice(0, 5);
        const best = candidates[0];
        return {
          sourceName: rawName, price: rawPrice, unit: unit || best?.name ? (workTypes.find(w => w.name === best.name)?.unit || '') : '', notes,
          matchedName: best && best.score >= 40 ? best.name : '',
          confidence: best?.score || 0,
          candidates,
          status: 'pending' as const,
        };
      }).filter(r => r.sourceName && r.price > 0);

      setRows(parsed);
      setStep('match');
    };
    reader.readAsArrayBuffer(file);
  }

  function acceptMatch(i: number, name: string) {
    setRows(prev => {
      const next = [...prev];
      next[i] = { ...next[i], matchedName: name, status: 'confirmed' as const };
      return next;
    });
  }

  function rejectMatch(i: number) {
    setRows(prev => {
      const next = [...prev];
      next[i] = { ...next[i], matchedName: '', status: 'rejected' as const };
      return next;
    });
  }

  function autoMatchAll() {
    setRows(prev => prev.map(r => {
      if (r.status === 'confirmed') return r;
      const best = r.candidates[0];
      if (best && best.score >= 40) return { ...r, matchedName: best.name, status: 'confirmed' as const, unit: workTypes.find(w => w.name === best.name)?.unit || '' };
      return r;
    }));
  }

  async function doImport() {
    setImporting(true);
    const items = rows.filter(r => r.status === 'confirmed' && r.matchedName).map(r => ({
      work_type: r.matchedName,
      unit: r.unit,
      price: r.price,
      notes: `导入:${r.sourceName}${r.notes ? ` ${r.notes}` : ''}`,
    }));
    try {
      const res = await fetch('/api/cost-estimation/batch-import', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items }),
      });
      const json = await res.json();
      setResult(json.data || { success: 0, failed: 0 });
      setStep('done');
    } finally { setImporting(false); }
  }

  const filteredRows = rows.filter(r => !searchFilter || r.sourceName.includes(searchFilter) || r.matchedName.includes(searchFilter));

  return (
    <div className="min-h-full bg-[#F5F6FA] p-4 md:p-6">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => step === 'match' ? setStep('upload') : step === 'done' ? router.push('/cost-estimation') : router.back()} className="h-9 w-9 rounded-lg border border-[#E5E6EB] flex items-center justify-center hover:bg-[#F2F3F5]">
            <ArrowLeft className="h-4 w-4 text-[#4E5969]" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-[#1D2129]">批量导入单价</h1>
            <p className="text-xs text-[#86909C] mt-0.5">上传Excel/CSV，自动匹配工序到价格库</p>
          </div>
        </div>

        {/* Step 1: Upload */}
        {step === 'upload' && (
          <div className="bg-white rounded-xl border border-dashed border-[#E5E6EB] p-10 text-center">
            <FileSpreadsheet className="h-16 w-16 text-[#165DFF] mx-auto mb-4" />
            <p className="text-lg font-medium text-[#1D2129] mb-2">上传报价文件</p>
            <p className="text-sm text-[#86909C] mb-6">支持 .xlsx / .xls / .csv 格式，系统自动识别工序名称和单价列</p>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => { if (e.target.files?.[0]) parseFile(e.target.files[0]); }} />
            <button onClick={() => fileRef.current?.click()} className="inline-flex h-11 items-center gap-2 rounded-lg bg-[#165DFF] px-6 text-sm text-white shadow-md hover:bg-[#0E49D8]">
              <Upload className="h-4 w-4" /> 选择文件
            </button>
            <p className="text-xs text-[#A9AEB8] mt-4">
              表头示例：工序名称 | 单价 | 单位 | 备注<br />
              系统会自动检测各列含义
            </p>
          </div>
        )}

        {/* Step 2: Match */}
        {step === 'match' && (
          <div>
            {/* 操作栏 */}
            <div className="bg-white rounded-xl border border-[#E5E6EB] p-4 mb-4">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#86909C]" />
                  <input value={searchFilter} onChange={e => setSearchFilter(e.target.value)} placeholder="筛选行..."
                    className="h-9 w-full rounded-lg border border-[#E5E6EB] pl-9 pr-3 text-sm outline-none focus:border-[#165DFF]" />
                </div>
                <span className="text-sm text-[#86909C]">{rows.length} 行 · {rows.filter(r => r.status === 'confirmed').length} 已匹配</span>
                <button onClick={autoMatchAll} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#165DFF] px-3 text-xs text-[#165DFF] hover:bg-[#F0F5FF]">
                  <Sparkles className="h-3.5 w-3.5" /> 自动匹配
                </button>
                <button onClick={doImport} disabled={importing || rows.filter(r => r.status === 'confirmed').length === 0}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#165DFF] px-4 text-xs text-white disabled:opacity-50">
                  {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  {importing ? '导入中...' : `导入 ${rows.filter(r => r.status === 'confirmed').length} 条`}
                </button>
              </div>
            </div>

            {/* 匹配列表 */}
            <div className="space-y-2">
              {filteredRows.map((r, i) => (
                <div key={i} className={`bg-white rounded-xl border p-4 transition ${r.status === 'confirmed' ? 'border-[#165DFF]/40 bg-[#F8FAFF]' : r.status === 'rejected' ? 'border-[#F53F3F]/30 bg-[#FFF8F8]' : 'border-[#E5E6EB]'}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[#1D2129]">{r.sourceName}</p>
                      <p className="text-xs text-[#86909C] mt-0.5">{r.unit && `单位:${r.unit} · `}单价: {r.price} 元{r.notes ? ` · ${r.notes}` : ''}</p>
                      {r.candidates.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {r.candidates.slice(0, 4).map((c, ci) => (
                            <button key={ci} onClick={() => acceptMatch(i, c.name)}
                              className={`text-xs px-2 py-0.5 rounded-full border transition ${r.matchedName === c.name ? 'bg-[#165DFF] text-white border-[#165DFF]' : 'hover:border-[#165DFF]/40 border-[#E5E6EB] text-[#4E5969]'}`}>
                              {c.name} <span className="opacity-60">{c.score}%</span>
                            </button>
                          ))}
                        </div>
                      )}
                      {r.candidates.length === 0 && (
                        <p className="text-xs text-[#F53F3F] mt-1">未匹配到工序，请输入名称</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {r.status === 'confirmed' ? (
                        <span className="text-xs text-[#00A870] flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" />已匹配</span>
                      ) : r.status === 'rejected' ? (
                        <span className="text-xs text-[#F53F3F] flex items-center gap-1"><XCircle className="h-3.5 w-3.5" />跳过</span>
                      ) : (
                        <div className="flex gap-1">
                          <button onClick={() => rejectMatch(i)} className="h-7 px-2 rounded text-xs border border-[#E5E6EB] text-[#86909C] hover:border-[#F53F3F]">跳过</button>
                        </div>
                      )}
                    </div>
                  </div>
                  {r.status === 'pending' && !r.matchedName && (
                    <input placeholder="输入工序名称手动匹配" value={r.matchedName} onChange={e => acceptMatch(i, e.target.value)}
                      className="mt-2 w-full h-8 rounded-lg border border-[#E5E6EB] px-3 text-xs outline-none focus:border-[#165DFF]" />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 3: Done */}
        {step === 'done' && result && (
          <div className="bg-white rounded-xl border border-[#E5E6EB] p-10 text-center">
            {result.failed === 0 ? (
              <CheckCircle2 className="h-16 w-16 text-[#00A870] mx-auto mb-4" />
            ) : (
              <AlertCircle className="h-16 w-16 text-[#F59E0B] mx-auto mb-4" />
            )}
            <p className="text-lg font-medium text-[#1D2129] mb-2">导入完成</p>
            <p className="text-sm text-[#86909C] mb-6">
              成功导入 <strong className="text-[#00A870]">{result.success}</strong> 条
              {result.failed > 0 && <>, <strong className="text-[#F53F3F]">{result.failed}</strong> 条失败</>}
            </p>
            <button onClick={() => router.push('/cost-estimation')} className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#165DFF] px-5 text-sm text-white">
              返回成本测算
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
