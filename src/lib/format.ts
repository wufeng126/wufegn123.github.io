/**
 * 全局统一格式化工具库
 * 所有报表、看板、台账必须使用此模块的函数，禁止各页面内联格式化逻辑
 *
 * 设计原则：
 * 1. 金额：parseNumeric 处理所有类型 → 统一格式化输出
 * 2. 日期：全部以 YYYY-MM-DD 存储，禁止仅年月字符串
 * 3. 百分比：统一保留 1 位小数
 */

// ========== 数值解析 ==========

/** 安全解析 numeric 类型（兼容 number/string/Decimal 对象） */
export function parseNumeric(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return parseFloat(value) || 0;
  if (typeof value === 'object' && value !== null && '$numberDecimal' in value) {
    return parseFloat((value as any).$numberDecimal) || 0;
  }
  if (typeof value === 'object' && value !== null) {
    const num = parseFloat(String(value));
    if (!isNaN(num)) return num;
    const match = String(value).match(/-?\d+\.?\d*/);
    if (match) return parseFloat(match[0]) || 0;
  }
  return 0;
}

/** 安全解析为整数 */
export function parseIntSafe(value: unknown): number {
  return Math.floor(parseNumeric(value));
}

// ========== 金额格式化 ==========

/** 智能金额格式化：>=1亿显示"X.XX亿"，>=1万显示"X.XX万"，否则显示元（千分位+2位小数） */
export function formatAmountSmart(value: number | string | null | undefined): string {
  const num = parseNumeric(value);
  if (num === 0) return '0.00';
  const abs = Math.abs(num);
  const sign = num < 0 ? '-' : '';
  if (abs >= 1e8) return `${sign}${(abs / 1e8).toFixed(2)}亿`;
  if (abs >= 1e4) return `${sign}${(abs / 1e4).toFixed(2)}万`;
  return num.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** 金额格式化（千分位 + 2 位小数），始终显示元 */
export function formatAmount(value: number | string | null | undefined): string {
  const num = parseNumeric(value);
  return num.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** 百分比格式化（默认保留 1 位小数） */
export function formatPercent(value: number | string | null | undefined, decimals = 1): string {
  const num = parseNumeric(value);
  return `${num.toFixed(decimals)}%`;
}

/** 金额单位（万元/亿元/元），用于 KPI 卡片 */
export function getAmountUnit(value: number | string | null | undefined): string {
  const num = parseNumeric(value);
  const abs = Math.abs(num);
  if (abs >= 1e8) return '亿元';
  if (abs >= 1e4) return '万元';
  return '元';
}

/** 金额缩放值（万/亿），用于 KPI 卡片数值显示 */
export function getAmountScaled(value: number | string | null | undefined): number {
  const num = parseNumeric(value);
  const abs = Math.abs(num);
  if (abs >= 1e8) return Number((num / 1e8).toFixed(2));
  if (abs >= 1e4) return Number((num / 1e4).toFixed(2));
  return Number(num.toFixed(2));
}

/** 转换为万元 */
export function toWanYuan(value: number | string | null | undefined): number {
  return parseNumeric(value) / 1e4;
}

/** 数值千分位格式化（无小数位） */
export function formatInt(value: number | string | null | undefined): string {
  const num = parseNumeric(value);
  return Math.round(num).toLocaleString('zh-CN');
}

// ========== 日期格式化 ==========

/**
 * 统一日期格式化
 * @param date 日期字符串 (YYYY-MM-DD / YYYY-MM / ISO) 或 Date 对象
 * @param format 输出格式: 'YYYY-MM-DD' | 'YYYY-MM' | 'YYYY年MM月DD日' | 'YYYY年MM月' | 'MM-DD' | 'M月D日'
 */
export function formatDate(
  date: string | Date | null | undefined,
  format: 'YYYY-MM-DD' | 'YYYY-MM' | 'YYYY年MM月DD日' | 'YYYY年MM月' | 'MM-DD' | 'M月D日' = 'YYYY-MM-DD'
): string {
  if (!date) return '-';
  const d = typeof date === 'string' ? new Date(date.length === 7 ? date + '-01' : date) : date;
  if (isNaN(d.getTime())) return '-';

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const monthNum = d.getMonth() + 1;
  const dayNum = d.getDate();

  switch (format) {
    case 'YYYY-MM-DD': return `${year}-${month}-${day}`;
    case 'YYYY-MM': return `${year}-${month}`;
    case 'YYYY年MM月DD日': return `${year}年${month}月${day}日`;
    case 'YYYY年MM月': return `${year}年${month}月`;
    case 'MM-DD': return `${month}-${day}`;
    case 'M月D日': return `${monthNum}月${dayNum}日`;
    default: return `${year}-${month}-${day}`;
  }
}

/** 获取当前年月 (YYYY-MM) */
export function getCurrentYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** 获取上个月年月 (YYYY-MM) */
export function getLastYearMonth(): string {
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`;
}

/** 获取最近 N 个月的年月列表（降序：最近在前） */
export function getRecentMonths(count: number): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return months;
}

/**
 * 将年月 (YYYY-MM) 转换为日期范围
 * @param yearMonth YYYY-MM 格式
 * @returns { start: 'YYYY-MM-01', end: 'YYYY-MM-31(或月末)' }
 */
export function yearMonthToRange(yearMonth: string): { start: string; end: string } {
  const [year, month] = yearMonth.split('-').map(Number);
  const start = `${yearMonth}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${yearMonth}-${String(lastDay).padStart(2, '0')}`;
  return { start, end };
}

/**
 * 时间范围计算
 * @param range 'month' | 'quarter' | 'year'
 * @returns { start: 'YYYY-MM-DD', months: number }
 */
export function getTimeRangeStart(range: 'month' | 'quarter' | 'year'): { start: string; months: number } {
  const now = new Date();
  if (range === 'month') {
    return {
      start: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`,
      months: 6,
    };
  } else if (range === 'quarter') {
    const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
    return {
      start: `${now.getFullYear()}-${String(quarterStartMonth + 1).padStart(2, '0')}-01`,
      months: 6,
    };
  } else {
    return {
      start: `${now.getFullYear()}-01-01`,
      months: 12,
    };
  }
}

// ========== 变化量格式化 ==========

/** 环比/同比变化格式化（正数加↑，负数加↓，带颜色标记） */
export function formatChange(
  current: number | string | null | undefined,
  previous: number | string | null | undefined
): { text: string; type: 'up' | 'down' | 'flat' } {
  const cur = parseNumeric(current);
  const prev = parseNumeric(previous);
  const diff = cur - prev;
  const pct = prev !== 0 ? (diff / Math.abs(prev)) * 100 : 0;

  if (Math.abs(diff) < 0.01) {
    return { text: '持平', type: 'flat' };
  }

  const sign = diff > 0 ? '↑' : '↓';
  const amountText = formatAmountSmart(Math.abs(diff));
  const pctText = Math.abs(pct).toFixed(1) + '%';
  return {
    text: `${sign}${amountText} (${pctText})`,
    type: diff > 0 ? 'up' : 'down',
  };
}

// ========== 导出汇总 ==========

/** 数字精度修正：四舍五入到 2 位小数 */
export function round2(value: number | string | null | undefined): number {
  return Math.round(parseNumeric(value) * 100) / 100;
}

/** 数字精度修正：四舍五入到指定位数 */
export function round(value: number | string | null | undefined, decimals = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(parseNumeric(value) * factor) / factor;
}
