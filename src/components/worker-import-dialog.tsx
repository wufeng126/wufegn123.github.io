'use client';

import { useState, useEffect, useCallback, useRef, type ChangeEvent } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Upload, FileText, AlertCircle, CheckCircle, Users, Loader2, Download, X } from 'lucide-react';
import { toast } from 'sonner';

// ==================== 常量 ====================

const MAX_IMPORT_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE = MAX_IMPORT_FILE_SIZE_MB * 1024 * 1024;
const ALLOWED_EXTENSIONS = ['.csv', '.xlsx', '.xls'];

/** 标准表头（必填） */
const STANDARD_HEADERS = ['姓名', '工种', '身份证号', '联系方式', '银行卡号', '入职日期', '所属项目', '备注'];

/** 必填表头（缺少时报错，不允许继续） */
const REQUIRED_HEADERS = ['姓名', '工种'];

/**
 * 表头别名映射：key 是标准表头，value 是可识别的别名数组
 * 解析时先去除表头中的空格、换行、星号，再匹配
 */
const HEADER_ALIAS_MAP: Record<string, string[]> = {
  '身份证号': ['身份证号码', '证件号', '身份号'],
  '联系方式': ['手机号', '电话', '联系电话', '手机', '电话号码'],
  '银行卡号': ['银行卡', '银行账号', '卡号'],
  '所属项目': ['项目名称', '项目', '所属项目名称'],
  '入职日期': ['入场日期', '进场日期', '入职时间', '进场时间'],
  '工种': ['工种类别', '工作类型'],
  '姓名': ['工人姓名', '员工姓名', '名字'],
  '备注': ['remark', '说明', '补充'],
};

/** 建立反向映射：别名 → 标准表头 */
const ALIAS_TO_STANDARD: Record<string, string> = {};
for (const [standard, aliases] of Object.entries(HEADER_ALIAS_MAP)) {
  ALIAS_TO_STANDARD[standard] = standard; // 自身也是映射
  for (const alias of aliases) {
    ALIAS_TO_STANDARD[alias] = standard;
  }
}

// ==================== 类型定义 ====================

export interface WorkerImportData {
  name: string;
  work_type: string;
  id_card: string;
  phone: string;
  bank_card: string;
  entry_date: string;
  project_name: string;
  remark: string;
}

interface DuplicateCheckResult {
  canImport: boolean;
  stats: { total: number; newCount: number; duplicateByIdCardCount: number; duplicateByNamePhoneCount: number };
  suggestions: string[];
  importOptions: { value: string; label: string; description: string; disabled?: boolean }[];
}

interface ImportResult {
  success: boolean;
  message: string;
  stats?: { inserted?: number; updated?: number; transferred?: number; skipped?: number; errors?: number; total?: number };
  errorDetails?: { row: number; name: string; reason: string }[];
}

interface WorkerImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: { id: number | string; name: string }[];
  defaultProjectId?: string | number;
  onSuccess?: () => void;
}

// ==================== 工具函数 ====================

/** 仅在开发环境输出日志 */
function devLog(...args: unknown[]) {
  if (process.env.NODE_ENV === 'development') {
    console.log('[ImportDialog]', ...args);
  }
}

function getFileExtension(filename: string): string {
  const idx = filename.lastIndexOf('.');
  return idx >= 0 ? filename.slice(idx).toLowerCase() : '';
}

/** 规范化表头：去除空格、换行、星号等干扰字符 */
function normalizeHeader(h: string): string {
  return h.replace(/[\s\r\n*＊　]/g, '').trim();
}

/** 将表头行映射为标准表头，返回 { mapped, missing, extra, aliasMap } */
function mapHeaders(rawHeaders: string[]): {
  mapped: string[];           // 映射后的标准表头
  missing: string[];          // 缺少的必填表头
  extra: string[];            // 无法识别的表头
  aliasMap: Record<number, string>; // col index → 原始别名（用于提示）
} {
  const mapped: string[] = [];
  const aliasMap: Record<number, string> = {};
  const recognized = new Set<string>();

  for (let i = 0; i < rawHeaders.length; i++) {
    const norm = normalizeHeader(rawHeaders[i]);
    const standard = ALIAS_TO_STANDARD[norm];
    if (standard) {
      mapped[i] = standard;
      recognized.add(standard);
      if (norm !== standard) {
        aliasMap[i] = norm;
      }
    } else {
      mapped[i] = rawHeaders[i]; // 保留原始
    }
  }

  const missing = REQUIRED_HEADERS.filter(h => !recognized.has(h));
  const extra = rawHeaders
    .map((h, i) => ({ raw: h, mapped: mapped[i] }))
    .filter(({ raw, mapped }) => !ALIAS_TO_STANDARD[normalizeHeader(raw)] && !STANDARD_HEADERS.includes(mapped))
    .map(({ raw }) => raw);

  return { mapped, missing, extra, aliasMap };
}

/** CSV 文本解析（支持引号内逗号） */
function parseCSVText(text: string): string[][] {
  const rows: string[][] = [];
  let current = '';
  let inQuotes = false;
  let row: string[] = [];

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(current.trim());
        current = '';
      } else if (ch === '\n' || (ch === '\r' && text[i + 1] === '\n')) {
        row.push(current.trim());
        current = '';
        if (row.some(c => c !== '')) rows.push(row);
        row = [];
        if (ch === '\r') i++;
      } else {
        current += ch;
      }
    }
  }
  row.push(current.trim());
  if (row.some(c => c !== '')) rows.push(row);

  return rows;
}

/**
 * 读取 CSV 文件文本，自动检测编码：
 * 1. 先以 UTF-8 读取
 * 2. 检查表头是否包含中文乱码（常见乱码特征）
 * 3. 如有乱码，再用 GB18030 重新读取
 */
async function readCsvText(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const uint8 = new Uint8Array(arrayBuffer);

  // 尝试 UTF-8
  const utf8Text = new TextDecoder('utf-8', { fatal: false }).decode(uint8);
  if (!hasGarbledChinese(utf8Text)) {
    return utf8Text;
  }

  // UTF-8 有乱码，尝试 GB18030（兼容 GBK/GB2312）
  try {
    const gbText = new TextDecoder('gb18030', { fatal: false }).decode(uint8);
    if (!hasGarbledChinese(gbText)) {
      return gbText;
    }
  } catch {
    // GB18030 不可用，回退 UTF-8
  }

  // 都有乱码，返回 UTF-8（至少表头可能是英文的情况）
  return utf8Text;
}

/**
 * 检测文本是否包含中文乱码特征
 * 常见 UTF-8 解码 GBK 产生的乱码模式：连续的 \ufffd（替换字符）或乱码区间
 */
function hasGarbledChinese(text: string): boolean {
  // 检查前 500 字符内是否包含替换字符 U+FFFD
  const head = text.slice(0, 500);
  if (head.includes('\uFFFD')) return true;

  // 检查标准表头是否完整出现在文本中
  // 如果 UTF-8 解码正确，至少"姓名"这两个字应该能正常识别
  const hasValidChinese = STANDARD_HEADERS.some(h => head.includes(h));
  if (!hasValidChinese && /[\u4e00-\u9fff]/.test(head)) {
    // 有中文字符但标准表头完全匹配不上，可能是乱码
    // 但也可能只是表头用了别名，所以再检查是否有明显乱码区间
    // 连续的高位 Unicode 私用区字符是 GBK 误读为 UTF-8 的典型特征
    const garbledPattern = /[\ue000-\uf8ff\uf000-\uffff]/;
    if (garbledPattern.test(head)) return true;
  }

  return false;
}

/** 将解析行映射为 WorkerImportData */
function rowsToWorkers(rows: string[][], headerRow: string[]): WorkerImportData[] {
  const { mapped } = mapHeaders(headerRow);
  const workers: WorkerImportData[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every(c => !c)) continue;

    const getCol = (standardHeader: string) => {
      const idx = mapped.indexOf(standardHeader);
      return idx >= 0 && idx < row.length ? row[idx] : '';
    };

    const name = getCol('姓名');
    const workType = getCol('工种');
    // 跳过姓名和工种都为空的行
    if (!name && !workType) continue;

    workers.push({
      name,
      work_type: workType,
      id_card: getCol('身份证号'),
      phone: getCol('联系方式'),
      bank_card: getCol('银行卡号'),
      entry_date: getCol('入职日期'),
      project_name: getCol('所属项目'),
      remark: getCol('备注'),
    });
  }

  return workers;
}

/** 动态导入 XLSX（懒加载，避免首屏包体积） */
let _xlsx: typeof import('xlsx') | null = null;
async function getXLSX() {
  if (!_xlsx) {
    _xlsx = await import('xlsx');
  }
  return _xlsx;
}

// ==================== 模块级状态 Vault ====================
// 组件被 React 卸载重挂载时 useState 会丢失所有值
// vault 在模块作用域存活，用于跨挂载周期持久化关键状态

const _vault: Record<string, unknown> = {};

function _setVault(key: string, value: unknown) {
  _vault[key] = value;
}

function _getVault<T>(key: string, fallback: T): T {
  return key in _vault ? (_vault[key] as T) : fallback;
}

function _clearVault() {
  for (const key of Object.keys(_vault)) {
    delete _vault[key];
  }
}

// ==================== 组件 ====================

export default function WorkerImportDialog({
  open,
  onOpenChange,
  projects,
  defaultProjectId = '',
  onSuccess,
}: WorkerImportDialogProps) {
  // ---- 状态（初始值从 vault 恢复，setter 同时写入 vault） ----
  const [selectedFile, _setSelectedFile] = useState<File | null>(
    () => _getVault<File | null>('selectedFile', null)
  );
  const [selectedProjectId, _setSelectedProjectId] = useState<string>(
    () => _getVault('selectedProjectId', String(defaultProjectId || ''))
  );
  const [isParsing, setIsParsing] = useState(false);
  const [parsedWorkers, _setParsedWorkers] = useState<WorkerImportData[]>(
    () => _getVault<WorkerImportData[]>('parsedWorkers', [])
  );
  const [headerWarning, setHeaderWarning] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [checkResult, _setCheckResult] = useState<DuplicateCheckResult | null>(
    () => _getVault<DuplicateCheckResult | null>('checkResult', null)
  );
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, _setImportResult] = useState<ImportResult | null>(
    () => _getVault<ImportResult | null>('importResult', null)
  );
  const [showCheckResult, setShowCheckResult] = useState(false);
  const [showImportResult, setShowImportResult] = useState(false);
  const [importAction, setImportAction] = useState('upsert');

  // ---- Vault-aware setters ----
  const setSelectedFile = useCallback((v: File | null) => { _setVault('selectedFile', v); _setSelectedFile(v); }, []);
  const setSelectedProjectId = useCallback((v: string) => { _setVault('selectedProjectId', v); _setSelectedProjectId(v); }, []);
  const setParsedWorkers = useCallback((v: WorkerImportData[]) => { _setVault('parsedWorkers', v); _setParsedWorkers(v); }, []);
  const setCheckResult = useCallback((v: DuplicateCheckResult | null) => { _setVault('checkResult', v); _setCheckResult(v); }, []);
  const setImportResult = useCallback((v: ImportResult | null) => { _setVault('importResult', v); _setImportResult(v); }, []);

  // ---- Refs ----
  const intentionalCloseRef = useRef(false);
  const isStableMountRef = useRef(false);
  const openInitializedRef = useRef(false);

  // ---- 稳定挂载标记 ----
  useEffect(() => {
    const timer = requestAnimationFrame(() => {
      isStableMountRef.current = true;
    });
    return () => cancelAnimationFrame(timer);
  }, []);

  // ---- 导入成功回调 ----
  const handleImportSuccess = useCallback(() => {
    onSuccess?.();
  }, [onSuccess]);

  // ---- 重置状态 ----
  const resetState = useCallback(() => {
    setParsedWorkers([]);
    setCheckResult(null);
    setImportResult(null);
    setShowCheckResult(false);
    setShowImportResult(false);
    setImportAction('upsert');
    setValidationError(null);
    setHeaderWarning(null);
  }, [setParsedWorkers, setCheckResult, setImportResult]);

  // ---- Dialog 打开时初始化默认项目 ----
  useEffect(() => {
    if (open && !openInitializedRef.current) {
      openInitializedRef.current = true;
      const projectId = String(defaultProjectId || '');
      devLog('Dialog 打开，初始化 selectedProjectId=', projectId);
      setSelectedProjectId(projectId);
    }
    if (!open) {
      openInitializedRef.current = false;
    }
  }, [open, defaultProjectId, setSelectedProjectId]);

  // ==================== 文件选择与校验 ====================

  /** 表头校验 + 数据转换（共用于 CSV 和 XLSX） */
  const validateAndConvert = useCallback((headerRow: string[], rows: string[][]): WorkerImportData[] => {
    const { mapped, missing, extra, aliasMap } = mapHeaders(headerRow);

    // ★ 必填表头缺失 → 报错，不继续
    if (missing.length > 0) {
      const errMsg = `缺少必填列：${missing.join('、')}。请对照模板调整表头`;
      setValidationError(errMsg);
      toast.error(errMsg);
      throw new Error(errMsg);
    }

    // 非必填表头缺失 → 警告
    const nonRequiredMissing = STANDARD_HEADERS.filter(h => !REQUIRED_HEADERS.includes(h) && !mapped.includes(h));
    if (nonRequiredMissing.length > 0) {
      const warn = `可选列未找到：${nonRequiredMissing.join('、')}，对应数据将为空`;
      setHeaderWarning(warn);
      toast.warning(warn);
    }

    // 多余列提示
    if (extra.length > 2) {
      const warn = `表头存在无法识别的列：${extra.slice(0, 5).join('、')}，这些列将被忽略`;
      setHeaderWarning(prev => prev ? prev + '；' + warn : warn);
    }

    // 别名提示
    const aliasEntries = Object.entries(aliasMap);
    if (aliasEntries.length > 0) {
      const aliasInfo = aliasEntries.map(([, alias]) => alias).join('、');
      const warn = `已自动识别别名：${aliasInfo}`;
      setHeaderWarning(prev => prev ? prev + '；' + warn : warn);
    }

    const workers = rowsToWorkers(rows, headerRow);
    return workers;
  }, []);

  /** 解析文件内容（CSV 或 XLSX） */
  const parseFile = useCallback(async (file: File): Promise<WorkerImportData[]> => {
    const ext = getFileExtension(file.name);

    if (ext === '.csv') {
      // 使用 readCsvText 自动检测编码
      const text = await readCsvText(file);
      if (!text?.trim()) {
        throw new Error('文件内容为空');
      }
      const rows = parseCSVText(text);
      if (rows.length < 2) {
        throw new Error('CSV 文件至少需要包含表头和一行数据');
      }
      const headerRow = rows[0].map(h => h.trim());
      return validateAndConvert(headerRow, rows);
    } else if (ext === '.xlsx' || ext === '.xls') {
      const arrayBuffer = await file.arrayBuffer();
      const XLSX = await getXLSX();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!firstSheet) {
        throw new Error('Excel 文件中没有工作表');
      }
      const rows: string[][] = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' });
      if (rows.length < 2) {
        throw new Error('Excel 文件至少需要包含表头和一行数据');
      }
      const headerRow = rows[0].map((h: unknown) => String(h).trim());
      return validateAndConvert(headerRow, rows);
    } else {
      throw new Error('不支持的文件格式');
    }
  }, [validateAndConvert]);

  const processSelectedFile = useCallback(async (file: File) => {
    devLog('processSelectedFile 触发, file=', file.name, 'size=', file.size);

    resetState();

    // 校验 ①：文件后缀
    const ext = getFileExtension(file.name);
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      const msg = `文件格式不对，请使用 CSV 或 XLSX 模板（当前文件：${file.name}）`;
      setValidationError(msg);
      toast.error(msg);
      setSelectedFile(null);
      return;
    }

    // 校验 ②：文件大小
    if (file.size > MAX_FILE_SIZE) {
      const sizeMB = (file.size / 1024 / 1024).toFixed(1);
      const msg = `文件过大（${sizeMB}MB），请控制在 ${MAX_IMPORT_FILE_SIZE_MB}MB 以内`;
      setValidationError(msg);
      toast.error(msg);
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
    setValidationError(null);

    // 自动解析文件
    setIsParsing(true);
    try {
      const workers = await parseFile(file);
      if (workers.length === 0) {
        const msg = '文件中未找到有效数据行，请检查文件内容';
        setValidationError(msg);
        toast.warning(msg);
        setParsedWorkers([]);
      } else {
        setParsedWorkers(workers);
        toast.success(`成功解析 ${workers.length} 条工人数据`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '文件解析失败，请检查文件格式';
      setValidationError(message);
      toast.error(message);
      setParsedWorkers([]);
    } finally {
      setIsParsing(false);
    }
  }, [parseFile, resetState, setSelectedFile, setParsedWorkers]);

  const handleFileSelect = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    devLog('handleFileSelect 触发, file=', file?.name ?? 'null');
    if (!file) return;
    await processSelectedFile(file);
    // 清空 input value 以允许再次选择同一文件
    setTimeout(() => { try { e.target.value = ''; } catch { /* ignore */ } }, 500);
  }, [processSelectedFile]);

  // ==================== 查重检测 ====================

  const handleCheckDuplicates = useCallback(async () => {
    if (parsedWorkers.length === 0) {
      toast.warning('没有可检测的数据，请先选择有效的文件');
      return;
    }

    setIsChecking(true);
    setShowCheckResult(false);
    setShowImportResult(false);
    setImportResult(null);

    try {
      const res = await fetch('/api/workers/check-duplicates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workers: parsedWorkers,
          projectId: selectedProjectId ? Number(selectedProjectId) : undefined,
        }),
        credentials: 'include',
      });

      if (!res.ok) {
        if (res.status === 403) {
          toast.error('您没有导入权限，请联系管理员');
        } else if (res.status === 401) {
          toast.error('登录已过期，请重新登录');
        } else {
          const errData = await res.json().catch(() => null);
          toast.error(errData?.error || `查重请求失败（${res.status}）`);
        }
        return;
      }

      const data = await res.json();
      if (!data || typeof data.stats?.total !== 'number') {
        toast.error('查重返回数据异常，请重试');
        return;
      }

      setCheckResult(data);
      setShowCheckResult(true);

      if (data.canImport) {
        toast.success(`查重完成：${data.stats.newCount} 条新数据可导入`);
      } else {
        toast.warning('查重完成：所有数据均重复，无法导入');
      }
    } catch (err) {
      toast.error('查重检测失败：' + (err instanceof Error ? err.message : '网络异常，请检查网络后重试'));
    } finally {
      setIsChecking(false);
    }
  }, [parsedWorkers, selectedProjectId, setCheckResult, setImportResult]);

  // ==================== 确认导入 ====================

  const handleImport = useCallback(async () => {
    if (!checkResult || parsedWorkers.length === 0) return;

    setIsImporting(true);

    try {
      const res = await fetch('/api/workers/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workers: parsedWorkers,
          importMode: importAction === 'cancel' ? 'cancel' : importAction,
          projectId: selectedProjectId ? Number(selectedProjectId) : undefined,
          fileName: selectedFile?.name || 'unknown',
        }),
        credentials: 'include',
      });

      if (!res.ok) {
        if (res.status === 403) {
          toast.error('您没有导入权限，请联系管理员');
        } else if (res.status === 401) {
          toast.error('登录已过期，请重新登录');
        } else {
          const errData = await res.json().catch(() => null);
          toast.error(errData?.error || errData?.message || `导入失败（${res.status}）`);
        }
        return;
      }

      const data = await res.json();
      if (!data || typeof data.stats?.total !== 'number') {
        toast.error('导入返回数据异常，请重试');
        return;
      }

      setImportResult(data);
      setShowImportResult(true);

      if (data.success) {
        toast.success(data.message || '导入成功');
        handleImportSuccess();
      } else {
        toast.warning(data.message || '导入完成，但有部分数据未成功');
      }
    } catch (err) {
      toast.error('导入失败：' + (err instanceof Error ? err.message : '网络异常，请检查网络后重试'));
    } finally {
      setIsImporting(false);
    }
  }, [checkResult, parsedWorkers, importAction, selectedProjectId, selectedFile, handleImportSuccess, setImportResult]);

  // ==================== 下载模板 ====================

  const downloadTemplate = useCallback(() => {
    const header = STANDARD_HEADERS.join(',');
    const example = '张三,木工,320102199001011234,13800138000,6222021234567890123,2026-01-15,项目名称,无';
    const csvContent = '\uFEFF' + header + '\n' + example;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '工人导入模板.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('模板已下载，请用 Excel 打开后填写数据并另存为 CSV 或 XLSX');
  }, []);

  // ==================== 导出错误明细 ====================

  const exportErrorLog = useCallback(() => {
    if (!importResult?.errorDetails?.length) return;
    const header = '行号,姓名,原因';
    const rows = importResult.errorDetails.map(d => `${d.row},${d.name},${d.reason}`);
    const csvContent = '\uFEFF' + header + '\n' + rows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '导入错误明细.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [importResult]);

  // ==================== 关闭弹窗 ====================

  const handleClose = useCallback(() => {
    devLog('handleClose() - 用户主动关闭');
    _clearVault();
    intentionalCloseRef.current = true;
    onOpenChange(false);
  }, [onOpenChange]);

  // ==================== 清除已选文件 ====================

  const clearFile = useCallback(() => {
    setSelectedFile(null);
    resetState();
  }, [resetState, setSelectedFile]);

  // ==================== 渲染 ====================

  const isBusy = isParsing || isChecking || isImporting;
  const canCheck = !isBusy && parsedWorkers.length > 0;

  return (
    <Dialog
      key="worker-import-dialog-stable"
      open={open}
      onOpenChange={(v) => {
        if (v) {
          onOpenChange(v);
        } else {
          // 关闭请求：只允许主动操作或稳定挂载后的关闭
          if (intentionalCloseRef.current) {
            _clearVault();
            intentionalCloseRef.current = false;
            onOpenChange(false);
          } else if (isStableMountRef.current) {
            _clearVault();
            onOpenChange(false);
          }
          // 否则忽略（挂载阶段的自动关闭请求）
        }
      }}
    >
      <DialogContent
        className="sm:max-w-[600px] max-h-[85vh] overflow-y-auto"
        showCloseButton={false}
        onInteractOutside={(e) => { e.preventDefault(); }}
        onPointerDownOutside={(e) => { e.preventDefault(); }}
        onEscapeKeyDown={(e) => {
          if (isBusy) {
            e.preventDefault();
          } else {
            intentionalCloseRef.current = true;
          }
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" />
            批量导入工人
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* 默认项目选择 */}
          <div>
            <Label className="text-sm font-medium" style={{ color: '#1D2129' }}>默认所属项目</Label>
            <select
              className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              disabled={isBusy}
            >
              <option value="">不指定（以文件中&quot;所属项目&quot;列为准）</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* 文件选择区域 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium" style={{ color: '#1D2129' }}>选择文件</Label>
              <span className="text-xs" style={{ color: '#86909C' }}>支持 CSV、XLSX 格式，最大 {MAX_IMPORT_FILE_SIZE_MB}MB</span>
            </div>

            {selectedFile ? (
              <div
                className="border-2 rounded-lg p-4"
                style={{ borderColor: '#00B42A', backgroundColor: '#E8FFEA' }}
              >
                <div className="flex items-center gap-3">
                  <FileText className="w-8 h-8 flex-shrink-0" style={{ color: '#165DFF' }} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate" style={{ color: '#1D2129' }}>{selectedFile.name}</p>
                    <p className="text-xs" style={{ color: '#86909C' }}>
                      {(selectedFile.size / 1024).toFixed(1)} KB
                      {parsedWorkers.length > 0 && ` · ${parsedWorkers.length} 条数据`}
                      {isParsing && ' · 解析中...'}
                    </p>
                  </div>
                  <label className="relative inline-block">
                    <input
                      type="file"
                      accept=".csv,.xlsx,.xls"
                      onChange={handleFileSelect}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      style={{ fontSize: '0px' }}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      asChild
                      disabled={isBusy}
                      className="h-7 text-xs px-2"
                    >
                      <span>重新选择</span>
                    </Button>
                  </label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearFile}
                    disabled={isBusy}
                    className="h-7 w-7 p-0"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ) : (
              <label
                className="relative w-full block border-2 border-dashed rounded-lg p-8 text-center transition-colors hover:border-blue-400 hover:bg-blue-50/50 cursor-pointer"
                style={{
                  borderColor: validationError ? '#F53F3F' : '#C9CDD4',
                  backgroundColor: validationError ? '#FFECE8' : '#F7F8FA',
                }}
              >
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleFileSelect}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  style={{ fontSize: '0px' }}
                />
                <Upload className="w-10 h-10 mx-auto mb-3" style={{ color: '#86909C' }} />
                <p className="text-sm font-medium" style={{ color: '#4E5969' }}>点击选择文件</p>
                <p className="text-xs mt-1" style={{ color: '#86909C' }}>支持 .csv / .xlsx / .xls，文件不超过 {MAX_IMPORT_FILE_SIZE_MB}MB</p>
              </label>
            )}

            {/* 校验错误提示 */}
            {validationError && (
              <div className="flex items-start gap-2 p-3 rounded-lg" style={{ backgroundColor: '#FFECE8' }}>
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: '#F53F3F' }} />
                <p className="text-sm" style={{ color: '#CB2634' }}>{validationError}</p>
              </div>
            )}

            {/* 表头警告 */}
            {headerWarning && !validationError && (
              <div className="flex items-start gap-2 p-3 rounded-lg" style={{ backgroundColor: '#FFF7E8' }}>
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: '#FF7D00' }} />
                <p className="text-sm" style={{ color: '#A66800' }}>{headerWarning}</p>
              </div>
            )}

            {/* 解析中 loading */}
            {isParsing && (
              <div className="flex items-center gap-2 p-2 text-sm" style={{ color: '#165DFF' }}>
                <Loader2 className="w-4 h-4 animate-spin" />
                正在解析文件...
              </div>
            )}
          </div>

          {/* 下载模板提示 */}
          <div className="flex items-center gap-2 text-xs" style={{ color: '#86909C' }}>
            <Download className="w-3.5 h-3.5" />
            没有模板？
            <button
              onClick={downloadTemplate}
              className="underline hover:no-underline"
              style={{ color: '#165DFF' }}
              disabled={isBusy}
            >
              下载CSV导入模板
            </button>
          </div>

          {/* 查重结果 */}
          {showCheckResult && checkResult && (
            <div className="p-4 rounded-lg border" style={{ backgroundColor: '#F2F3F5', borderColor: '#E5E6EB' }}>
              <div className="space-y-3">
                <h4 className="font-medium flex items-center gap-2" style={{ color: '#1D2129' }}>
                  <Users className="w-4 h-4" />
                  查重结果
                </h4>

                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="p-2 rounded" style={{ backgroundColor: '#FFFFFF' }}>
                    <span style={{ color: '#86909C' }}>总数据</span>
                    <span className="ml-2 font-medium" style={{ color: '#1D2129' }}>{checkResult.stats.total}</span>
                  </div>
                  <div className="p-2 rounded" style={{ backgroundColor: '#FFFFFF' }}>
                    <span style={{ color: '#86909C' }}>新数据</span>
                    <span className="ml-2 font-medium" style={{ color: '#00B42A' }}>{checkResult.stats.newCount}</span>
                  </div>
                  <div className="p-2 rounded" style={{ backgroundColor: '#FFFFFF' }}>
                    <span style={{ color: '#86909C' }}>身份证重复</span>
                    <span className="ml-2 font-medium" style={{ color: '#F53F3F' }}>{checkResult.stats.duplicateByIdCardCount}</span>
                  </div>
                  <div className="p-2 rounded" style={{ backgroundColor: '#FFFFFF' }}>
                    <span style={{ color: '#86909C' }}>姓名+手机重复</span>
                    <span className="ml-2 font-medium" style={{ color: '#FF7D00' }}>{checkResult.stats.duplicateByNamePhoneCount}</span>
                  </div>
                </div>

                {checkResult.suggestions.length > 0 && (
                  <div className="space-y-1">
                    {checkResult.suggestions.map((s, i) => (
                      <p key={i} className="text-xs" style={{ color: '#4E5969' }}>• {s}</p>
                    ))}
                  </div>
                )}

                {/* 项目匹配信息 */}
                {(() => {
                  const matchedCount = parsedWorkers.filter(w => w.project_name).length;
                  const unmatchedCount = parsedWorkers.length - matchedCount;
                  if (unmatchedCount === 0) return null;
                  return (
                    <div className="text-sm space-y-1">
                      <p>• 匹配到项目：<strong className="text-green-600">{matchedCount}</strong> 条</p>
                      {unmatchedCount > 0 && (
                        <p>• 未匹配项目：<strong className="text-red-600">{unmatchedCount}</strong> 条{selectedProjectId ? '（将使用默认项目）' : '（请在上方选择默认项目）'}</p>
                      )}
                    </div>
                  );
                })()}

                {/* 选择导入方式 */}
                <div className="mt-3 pt-3 border-t border-orange-200">
                  <Label className="text-sm font-medium" style={{ color: '#1D2129' }}>请选择处理方式：</Label>
                  <div className="mt-2 space-y-2">
                    {checkResult.importOptions.map((option) => (
                      <label
                        key={option.value}
                        className={`flex items-start gap-2 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                          importAction === option.value
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 hover:bg-gray-50'
                        } ${option.disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <input
                          type="radio"
                          name="importAction"
                          value={option.value}
                          checked={importAction === option.value}
                          onChange={() => !option.disabled && setImportAction(option.value)}
                          disabled={option.disabled}
                          className="mt-0.5"
                        />
                        <div>
                          <div className="font-medium text-sm" style={{ color: '#1D2129' }}>{option.label}</div>
                          <div className="text-xs" style={{ color: '#86909C' }}>{option.description}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 导入结果 */}
          {showImportResult && importResult && (
            <div className="p-4 rounded-lg" style={{ backgroundColor: importResult.success ? '#E8FFEA' : '#FFF7E8' }}>
              <div className="flex items-start gap-3">
                {importResult.success ? (
                  <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" />
                )}
                <div className="space-y-2">
                  <p className="font-medium" style={{ color: importResult.success ? '#00B42A' : '#FF7D00' }}>
                    {importResult.message}
                  </p>
                  {importResult.stats && (
                    <div className="text-sm space-y-1" style={{ color: '#4E5969' }}>
                      {(importResult.stats.inserted ?? 0) > 0 && <p>• 成功新增：{importResult.stats.inserted} 人</p>}
                      {(importResult.stats.updated ?? 0) > 0 && <p>• 成功更新：{importResult.stats.updated} 人</p>}
                      {(importResult.stats.transferred ?? 0) > 0 && <p>• 成功调岗：{importResult.stats.transferred} 人</p>}
                      {(importResult.stats.skipped ?? 0) > 0 && <p>• 跳过重复：{importResult.stats.skipped} 条</p>}
                      {(importResult.stats.errors ?? 0) > 0 && <p>• 格式错误：{importResult.stats.errors} 条</p>}
                    </div>
                  )}
                  {importResult.errorDetails && importResult.errorDetails.length > 0 && (
                    <Button variant="outline" size="sm" onClick={exportErrorLog} className="mt-2">
                      <Download className="w-3.5 h-3.5 mr-1" />
                      导出错误明细
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 底部按钮 */}
          <div className="flex justify-between pt-3 border-t" style={{ borderColor: '#E5E6EB' }}>
            <Button variant="outline" onClick={downloadTemplate} disabled={isBusy}>
              <Download className="w-4 h-4 mr-1.5" />
              下载模板
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleClose} disabled={isBusy}>
                关闭
              </Button>

              {!showCheckResult && !isChecking && (
                <Button
                  onClick={handleCheckDuplicates}
                  disabled={!canCheck}
                  className="text-white"
                  style={{ backgroundColor: canCheck ? '#165DFF' : undefined }}
                >
                  <Users className="w-4 h-4 mr-1.5" />
                  查重检测
                </Button>
              )}

              {isChecking && (
                <Button disabled className="text-white" style={{ backgroundColor: '#165DFF' }}>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  检测中...
                </Button>
              )}

              {showCheckResult && !showImportResult && !isChecking && (
                <>
                  <Button
                    variant="outline"
                    onClick={handleCheckDuplicates}
                    disabled={isImporting}
                  >
                    <Users className="w-4 h-4 mr-1.5" />
                    重新检测
                  </Button>
                  <Button
                    onClick={handleImport}
                    disabled={isImporting || !checkResult?.canImport || importAction === 'cancel'}
                    className="text-white"
                    style={{ backgroundColor: '#165DFF' }}
                  >
                    {isImporting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                        导入中...
                      </>
                    ) : importAction === 'cancel' ? (
                      '取消导入'
                    ) : (
                      <>
                        <Upload className="w-4 h-4 mr-1.5" />
                        确认导入
                      </>
                    )}
                  </Button>
                </>
              )}

              {isImporting && !showImportResult && (
                <Button disabled className="text-white" style={{ backgroundColor: '#165DFF' }}>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  导入中...
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
