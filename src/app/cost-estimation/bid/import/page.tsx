'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import * as XLSX from 'xlsx';
import { ArrowLeft, CheckCircle2, FileSpreadsheet, Loader2, Upload } from 'lucide-react';

type ParsedRow = {
  code: string;
  standard_name: string;
  unit: string;
  price: number;
  bid_year: number | null;
  project_name: string;
  region: string;
  project_type: string;
  material_included: boolean;
  remark: string;
  matched: 'code' | 'name' | 'fuzzy' | 'new' | 'manual';
  standard_item_id?: number;
};

type ImportResult = {
  imported?: number;
  duplicated?: number;
  created_standards?: number;
  skipped?: number;
  errors?: string[];
};

const TEMPLATE_HEADERS = ['清单项名称', '单位', '中标单价', '中标年份', '项目名称', '地区', '项目类型', '是否含材料', '备注'];
const TEMPLATE_ROWS = [
  ['模板安装拆除', 'm2', '38.5', '2024', '南京中交智慧港', '南京', '房建', '否', '不含支撑'],
  ['钢筋制安', 't', '980', '2025', '山海境TOD', '西安', '房建', '是', '含损耗'],
];

function normalizeName(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[（）()【】\[\]｛｝{}]/g, '')
    .replace(/[\s,，、.。:：;；\-—_/\\]/g, '')
    .trim();
}

function toNumber(value: unknown): number {
  const cleaned = String(value ?? '').replace(/[¥￥,\s元]/g, '');
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toYear(value: unknown): number | null {
  const match = String(value ?? '').match(/(19|20)\d{2}/);
  if (!match) return null;
  const year = Number(match[0]);
  return year >= 1990 && year <= 2100 ? year : null;
}

function toBool(value: unknown): boolean {
  return ['是', '含', '含材料', 'true', 'yes', '1', 'y'].includes(String(value ?? '').trim().toLowerCase());
}

/** 按表头关键字识别列（容忍各种写法） */
function buildColumnMap(headers: string[]) {
  const pick = (patterns: RegExp[], exclude: RegExp[] = []) =>
    headers.find((h) => patterns.some((p) => p.test(h)) && !exclude.some((e) => e.test(h)));

  return {
    code: pick([/编码/, /编号/]),
    standard_name: pick([/清单/, /分项/, /工程名称/, /名称/], [/项目/, /单位/, /备注/]),
    unit: pick([/单位/]),
    price: pick([/单价/, /价格/, /报价/, /中标价/]),
    bid_year: pick([/年份/, /年度/, /时间/, /日期/]),
    project_name: pick([/项目名称/, /项目/], [/清单/, /分项/]),
    region: pick([/地区/, /区域/, /城市/]),
    project_type: pick([/类型/, /业态/], [/材料/]),
    material_included: pick([/含材料/, /材料口径/]),
    remark: pick([/备注/, /说明/]),
  };
}

export default function BidPriceImportPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [standards, setStandards] = useState<Array<{ id: number; code: string; name: string }>>([]);
  const [parseError, setParseError] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const summary = useMemo(() => {
    const matched = rows.filter((row) => row.matched !== 'new').length;
    const created = rows.length - matched;
    const total = rows.reduce((sum, row) => sum + row.price, 0);
    return { matched, created, total };
  }, [rows]);

  async function loadStandards(): Promise<Array<{ id: number; code: string; name: string }>> {
    try {
      const res = await fetch('/api/bid-estimations/library', { credentials: 'include' });
      const json = await res.json();
      const list = json?.data?.standards || json?.standards || [];
      const mapped = Array.isArray(list) ? list.map((item: { id?: unknown; code?: string; name?: string }) => ({
        id: Number(item.id),
        code: String(item.code || ''),
        name: String(item.name || ''),
      })) : [];
      setStandards(mapped);
      return mapped;
    } catch {
      setStandards([]);
      return [];
    }
  }

  function markMatched(parsedRows: ParsedRow[], list: Array<{ id: number; code: string; name: string }>): ParsedRow[] {
    const byCode = new Map(list.map((item) => [String(item.code).trim().toUpperCase(), item]));
    const byName = new Map<string, { id: number; code: string; name: string }>();
    list.forEach((item) => {
      const key = normalizeName(item.name);
      if (key && !byName.has(key)) byName.set(key, item);
    });

    return parsedRows.map((row) => {
      const codeKey = row.code.trim().toUpperCase();
      if (codeKey && byCode.has(codeKey)) return { ...row, matched: 'code' as const };
      const nameKey = normalizeName(row.standard_name);
      if (nameKey && byName.has(nameKey)) return { ...row, matched: 'name' as const };
      const fuzzy = list.find((item) => {
        const standardKey = normalizeName(item.name);
        if (!standardKey || !nameKey) return false;
        return nameKey.includes(standardKey) || standardKey.includes(nameKey);
      });
      return { ...row, matched: fuzzy ? 'fuzzy' as const : 'new' as const };
    });
  }

  function handleFile(file: File) {
    setParseError('');
    setResult(null);
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
        if (json.length === 0) {
          setParseError('表格里没有数据行');
          setRows([]);
          return;
        }

        const headers = Object.keys(json[0]);
        const map = buildColumnMap(headers);
        if (!map.standard_name || !map.price) {
          setParseError(`没有识别到「清单项名称」或「中标单价」列。当前表头：${headers.join(' / ')}`);
          setRows([]);
          return;
        }

        const parsed: ParsedRow[] = [];
        json.forEach((raw) => {
          const name = String(raw[map.standard_name!] ?? '').trim();
          const price = toNumber(raw[map.price!]);
          if (!name || !(price > 0)) return;
          parsed.push({
            code: map.code ? String(raw[map.code] ?? '').trim() : '',
            standard_name: name,
            unit: map.unit ? String(raw[map.unit] ?? '').trim() : '',
            price,
            bid_year: map.bid_year ? toYear(raw[map.bid_year]) : null,
            project_name: map.project_name ? String(raw[map.project_name] ?? '').trim() : '',
            region: map.region ? String(raw[map.region] ?? '').trim() : '',
            project_type: map.project_type ? String(raw[map.project_type] ?? '').trim() : '',
            material_included: map.material_included ? toBool(raw[map.material_included]) : false,
            remark: map.remark ? String(raw[map.remark] ?? '').trim() : '',
            matched: 'new',
          });
        });

        if (parsed.length === 0) {
          setParseError('没有有效行（需要「清单项名称」和大于 0 的「中标单价」）');
          setRows([]);
          return;
        }

        const list = standards.length > 0 ? standards : await loadStandards();
        setRows(markMatched(parsed, list));
      } catch (error) {
        setParseError(error instanceof Error ? error.message : '文件解析失败，请确认是 Excel 文件');
        setRows([]);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  async function handleImport() {
    if (rows.length === 0) return;
    setImporting(true);
    setResult(null);
    try {
      const res = await fetch('/api/bid-estimations/library/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ rows }),
      });
      const json = await res.json();
      if (!res.ok || json.success === false) {
        throw new Error(json.error || '导入失败');
      }
      setResult(json.data || {});
      setRows([]);
      setFileName('');
    } catch (error) {
      setParseError(error instanceof Error ? error.message : '导入失败');
    } finally {
      setImporting(false);
    }
  }

  function downloadTemplate() {
    const sheet = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, ...TEMPLATE_ROWS]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, '历史中标价');
    XLSX.writeFile(workbook, '历史中标价导入模板.xlsx');
  }

  return (
    <div className="min-h-screen bg-[var(--background)] px-4 py-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <Link href="/cost-estimation/bid" className="inline-flex items-center gap-1 text-sm text-[var(--color-primary)] hover:underline">
              <ArrowLeft className="h-4 w-4" /> 返回投标测算
            </Link>
            <h1 className="mt-2 text-xl font-bold text-[var(--foreground)]">导入历史中标价</h1>
            <p className="mt-1 text-sm text-[var(--color-text-3)]">
              把过去项目的中标清单导进来，以后同一个清单项就能直接看到历史价格参考。
            </p>
          </div>
          <button
            type="button"
            onClick={downloadTemplate}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-white px-3 text-sm text-[var(--foreground)] hover:border-[var(--color-primary)]"
          >
            <FileSpreadsheet className="h-4 w-4" /> 下载模板
          </button>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-white p-4">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) handleFile(file);
              event.target.value = '';
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-[var(--border)] bg-[var(--color-muted)]/40 px-4 py-8 text-sm text-[var(--color-text-3)] transition hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
          >
            <Upload className="h-6 w-6" />
            <span className="font-medium">{fileName || '点击选择 Excel 文件（.xlsx / .xls / .csv）'}</span>
            <span className="text-xs">需要包含：清单项名称、中标单价；可选：单位、年份、项目、地区、是否含材料、备注</span>
          </button>
          {parseError ? (
            <div className="mt-3 rounded-lg border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/5 px-3 py-2 text-sm text-[var(--color-danger)]">
              {parseError}
            </div>
          ) : null}
        </div>

        {result ? (
          <div className="rounded-xl border border-[var(--color-success)]/30 bg-[var(--color-success)]/5 p-4">
            <div className="flex items-center gap-2 text-base font-semibold text-[var(--color-success)]">
              <CheckCircle2 className="h-5 w-5" /> 导入完成
            </div>
            <ul className="mt-2 space-y-1 text-sm text-[var(--foreground)]">
              <li>成功写入历史价：<b>{result.imported || 0}</b> 条</li>
              <li>新建标准清单：<b>{result.created_standards || 0}</b> 项</li>
              <li>跳过（重复或无效）：<b>{result.skipped || 0}</b> 行，其中重复 <b>{result.duplicated || 0}</b> 行</li>
            </ul>
            {result.errors && result.errors.length > 0 ? (
              <div className="mt-2 max-h-40 overflow-y-auto rounded-lg bg-white p-2 text-xs text-[var(--color-danger)]">
                {result.errors.map((item, index) => (
                  <div key={index}>{item}</div>
                ))}
              </div>
            ) : null}
            <div className="mt-3 flex gap-2">
              <Link href="/cost-estimation/bid/library" className="inline-flex h-9 items-center rounded-lg bg-[var(--color-primary)] px-4 text-sm font-medium text-white">
                去标准清单库看历史价
              </Link>
              <button
                type="button"
                onClick={() => { setResult(null); setFileName(''); }}
                className="inline-flex h-9 items-center rounded-lg border border-[var(--border)] bg-white px-4 text-sm"
              >
                继续导入
              </button>
            </div>
          </div>
        ) : null}

        {rows.length > 0 ? (
          <div className="rounded-xl border border-[var(--border)] bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
              <div className="text-sm text-[var(--foreground)]">
                共 <b>{rows.length}</b> 行 · 合计金额预览 <b>{summary.total.toFixed(2)}</b> 元
                <span className="ml-3 text-[var(--color-text-3)]">
                  匹配现有清单 <b className="text-[var(--color-success)]">{summary.matched}</b> 行 ·
                  将新建清单 <b className="text-[#FF7D00]">{summary.created}</b> 行
                </span>
              </div>
              <button
                type="button"
                onClick={handleImport}
                disabled={importing}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-4 text-sm font-medium text-white disabled:opacity-60"
              >
                {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                确认导入 {rows.length} 行
              </button>
            </div>
            <div className="max-h-[520px] overflow-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead className="sticky top-0 bg-[var(--color-muted)] text-xs text-[var(--color-text-3)]">
                  <tr>
                    <th className="px-3 py-2 text-left">清单项名称</th>
                    <th className="px-3 py-2 text-left">单位</th>
                    <th className="px-3 py-2 text-right">中标单价</th>
                    <th className="px-3 py-2 text-left">年份</th>
                    <th className="px-3 py-2 text-left">项目</th>
                    <th className="px-3 py-2 text-left">含材料</th>
                    <th className="px-3 py-2 text-left">匹配结果</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {rows.slice(0, 300).map((row, index) => (
                    <tr key={`${row.standard_name}-${index}`}>
                      <td className="px-3 py-2">{row.standard_name}</td>
                      <td className="px-3 py-2 text-[var(--color-text-3)]">{row.unit || '-'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{row.price.toFixed(2)}</td>
                      <td className="px-3 py-2 text-[var(--color-text-3)]">{row.bid_year || '-'}</td>
                      <td className="px-3 py-2 text-[var(--color-text-3)]">{row.project_name || '-'}</td>
                      <td className="px-3 py-2 text-[var(--color-text-3)]">{row.material_included ? '含' : '否'}</td>
                      <td className="px-3 py-2">
                        {row.matched === 'new' || row.matched === 'fuzzy' ? (
                          <select
                            value={row.standard_item_id || 0}
                            onChange={(event) => {
                              const id = Number(event.target.value) || 0;
                              setRows((prev) => prev.map((item, itemIndex) => (
                                itemIndex === index
                                  ? {
                                    ...item,
                                    standard_item_id: id || undefined,
                                    matched: id ? 'manual' : (item.matched === 'manual' ? 'new' : item.matched),
                                  }
                                  : item
                              )));
                            }}
                            className="h-8 w-full max-w-[230px] rounded-md border border-[var(--border)] px-1 text-xs"
                          >
                            <option value={0}>按原名新建清单项</option>
                            {standards.map((standard) => (
                              <option key={standard.id} value={standard.id}>
                                {standard.name}{standard.code ? `（${standard.code}）` : ''}
                              </option>
                            ))}
                          </select>
                        ) : row.matched === 'manual' ? (
                          <span className="rounded-md bg-[#E8F1FC] px-2 py-0.5 text-xs text-[var(--color-primary)]">已指定清单项</span>
                        ) : (
                          <span className="rounded-md bg-[#E8FFEA] px-2 py-0.5 text-xs text-[#00A870]">已匹配</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 300 ? (
                <div className="px-4 py-2 text-xs text-[var(--color-text-3)]">仅预览前 300 行，导入时会写入全部 {rows.length} 行</div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
