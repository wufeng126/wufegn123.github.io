'use client';

import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertTriangle, AlertCircle, BarChart3 } from 'lucide-react';

/**
 * 统一状态标签组件
 * 用于所有业务状态的视觉展示
 */

export type StatusType =
  | 'draft'        // 草稿
  | 'pending'      // 待审核
  | 'approved'     // 已审核
  | 'paid'         // 已付款
  | 'partial_paid' // 部分付款
  | 'received'     // 已回款
  | 'overdue'      // 逾期
  | 'voided'       // 作废
  | 'active'       // 进行中
  | 'completed'    // 已完成
  | 'suspended'    // 暂停
  | 'in_service'   // 在场
  | 'left'         // 退场
  | 'warning'      // 预警
  | 'info'         // 信息/提示
  | 'normal';      // 正常

const STATUS_CONFIG: Record<StatusType, { label: string; className: string }> = {
  draft:        { label: '草稿',     className: 'bg-gray-100 text-gray-600 border-gray-200' },
  pending:      { label: '待审核',   className: 'bg-amber-50 text-amber-700 border-amber-200' },
  approved:     { label: '已审核',   className: 'bg-blue-50 text-blue-700 border-blue-200' },
  paid:         { label: '已付款',   className: 'bg-green-50 text-green-700 border-green-200' },
  partial_paid: { label: '部分付款', className: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
  received:     { label: '已回款',   className: 'bg-green-50 text-green-700 border-green-200' },
  overdue:      { label: '逾期',     className: 'bg-red-50 text-red-700 border-red-200' },
  voided:       { label: '作废',     className: 'bg-gray-100 text-gray-400 border-gray-200 line-through' },
  active:       { label: '进行中',   className: 'bg-blue-50 text-blue-700 border-blue-200' },
  completed:    { label: '已完成',   className: 'bg-green-50 text-green-700 border-green-200' },
  suspended:    { label: '暂停',     className: 'bg-amber-50 text-amber-700 border-amber-200' },
  in_service:   { label: '在场',     className: 'bg-green-50 text-green-700 border-green-200' },
  left:         { label: '退场',     className: 'bg-gray-100 text-gray-500 border-gray-200' },
  warning:      { label: '预警',     className: 'bg-red-50 text-red-700 border-red-200' },
  info:         { label: '信息',     className: 'bg-blue-50 text-blue-600 border-blue-200' },
  normal:       { label: '正常',     className: 'bg-gray-50 text-gray-600 border-gray-200' },
};

interface StatusTagProps {
  type: StatusType;
  label?: string; // 自定义文本覆盖默认标签
  className?: string;
  size?: 'sm' | 'md';
}

export function StatusTag({ type, label, className, size = 'sm' }: StatusTagProps) {
  const config = STATUS_CONFIG[type] || STATUS_CONFIG.normal;
  const displayLabel = label || config.label;

  return (
    <span
      className={cn(
        'inline-flex items-center border rounded-sm font-medium whitespace-nowrap',
        size === 'sm' ? 'px-1.5 py-0.5 text-xs' : 'px-2 py-1 text-sm',
        config.className,
        className
      )}
    >
      {displayLabel}
    </span>
  );
}

/**
 * 金额显示组件 - 千分位、两位小数、正负颜色区分
 */
interface AmountDisplayProps {
  value: number | string | null | undefined;
  /** 是否显示正负颜色 (绿/红) */
  colorize?: boolean;
  /** 货币符号 */
  prefix?: string;
  /** 单位 */
  suffix?: string;
  /** 是否高亮异常金额 */
  highlightAnomaly?: boolean;
  /** 异常阈值 (超过此值高亮) */
  anomalyThreshold?: number;
  className?: string;
}

export function AmountDisplay({
  value,
  colorize = false,
  prefix = '¥',
  suffix = '',
  highlightAnomaly = false,
  anomalyThreshold,
  className,
}: AmountDisplayProps) {
  const numValue = typeof value === 'string' ? parseFloat(value) : value;

  if (numValue == null || isNaN(numValue)) {
    return <span className={cn('text-gray-400 tabular-nums', className)}>-</span>;
  }

  const formatted = numValue.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const isNegative = numValue < 0;
  const isAnomaly = highlightAnomaly && anomalyThreshold != null && Math.abs(numValue) > anomalyThreshold;

  return (
    <span
      className={cn(
        'tabular-nums font-medium',
        colorize && isNegative && 'text-red-600',
        colorize && !isNegative && numValue > 0 && 'text-green-600',
        isAnomaly && 'bg-red-50 px-1 rounded',
        !colorize && !isAnomaly && 'text-gray-900',
        className
      )}
    >
      {prefix}{formatted}{suffix}
    </span>
  );
}

/**
 * 空状态组件 - 带操作引导
 */
interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export function EmptyState({ title, description, icon, actionLabel, onAction, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-12 px-4', className)}>
      {icon && <div className="text-gray-300 mb-4">{icon}</div>}
      <p className="text-gray-500 text-sm font-medium mb-1">{title}</p>
      {description && <p className="text-gray-400 text-xs mb-4">{description}</p>}
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="text-sm text-blue-600 hover:text-blue-700 font-medium hover:underline"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

/**
 * 金额汇总行组件
 */
interface AmountSummaryProps {
  items: { label: string; value: number | string | null | undefined; type?: 'normal' | 'success' | 'warning' | 'danger' }[];
  className?: string;
}

export function AmountSummary({ items, className }: AmountSummaryProps) {
  return (
    <div className={cn('flex flex-wrap gap-4 px-4 py-2.5 bg-gray-50 border-b text-sm', className)}>
      {items.map((item, i) => {
        const numValue = typeof item.value === 'string' ? parseFloat(item.value) : item.value;
        const formatted = numValue != null && !isNaN(numValue)
          ? numValue.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          : '-';
        const colorClass =
          item.type === 'success' ? 'text-green-600' :
          item.type === 'warning' ? 'text-amber-600' :
          item.type === 'danger' ? 'text-red-600' :
          'text-gray-900';
        return (
          <span key={i} className="flex items-center gap-1">
            <span className="text-gray-500">{item.label}</span>
            <span className={cn('font-medium tabular-nums', colorClass)}>¥{formatted}</span>
          </span>
        );
      })}
    </div>
  );
}

/**
 * 格式化工具函数
 */

/** 智能金额格式化：超过1亿显示"X.XX亿"，超过1万显示"X.XX万"，否则显示元 */
export function formatAmountSmart(value: number | string | null | undefined): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (num == null || isNaN(num)) return '-';
  const abs = Math.abs(num);
  const sign = num < 0 ? '-' : '';
  if (abs >= 1e8) return `${sign}${(abs / 1e8).toFixed(2)}亿`;
  if (abs >= 1e4) return `${sign}${(abs / 1e4).toFixed(2)}万`;
  return num.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** 金额格式化（千分位+2位小数） */
export function formatAmount(value: number | string | null | undefined): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (num == null || isNaN(num)) return '-';
  return num.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** 百分比格式化（保留1位小数） */
export function formatPercent(value: number | string | null | undefined, decimals = 1): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (num == null || isNaN(num)) return '-';
  return `${Number(num).toFixed(decimals)}%`;
}

/** 金额单位（万/亿） */
export function getAmountUnit(value: number | string | null | undefined): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (num == null || isNaN(num)) return '';
  const abs = Math.abs(num);
  if (abs >= 1e8) return '亿元';
  if (abs >= 1e4) return '万元';
  return '元';
}

/** 金额缩放值（万/亿） */
export function getAmountScaled(value: number | string | null | undefined): number {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (num == null || isNaN(num)) return 0;
  const abs = Math.abs(num);
  if (abs >= 1e8) return Number((num / 1e8).toFixed(2));
  if (abs >= 1e4) return Number((num / 1e4).toFixed(2));
  return Number(num.toFixed(2));
}

/**
 * KPI 卡片组件 - 统一指标展示
 * 包含：指标名称、数值、单位、统计范围、同比/环比、计算口径tooltip、风险标识
 */
interface KpiCardProps {
  /** 指标名称 */
  label: string;
  /** 数值 */
  value: number | string | null | undefined;
  /** 单位（自动检测时留空） */
  unit?: string;
  /** 金额模式：自动使用万/亿单位 */
  amountMode?: boolean;
  /** 百分比模式 */
  percentMode?: boolean;
  /** 统计范围描述 */
  scope?: string;
  /** 同比/环比变化 (正数绿色↑，负数红色↓) */
  change?: number | null;
  /** 变化描述（如"环比上月"） */
  changeLabel?: string;
  /** 计算口径说明 (hover显示) */
  tooltip?: string;
  /** 风险等级 */
  risk?: 'normal' | 'warning' | 'danger';
  /** 风险说明 */
  riskTooltip?: string;
  /** 点击下钻 */
  onClick?: () => void;
  /** 图标 */
  icon?: React.ReactNode;
  /** 图标背景色 */
  iconBg?: string;
  className?: string;
  /** 数值文字颜色（如 "text-green-600"） */
  valueClassName?: string;
}

export function KpiCard({
  label, value, unit, amountMode = false, percentMode = false,
  scope, change, changeLabel, tooltip, risk = 'normal', riskTooltip,
  onClick, icon, iconBg, className, valueClassName,
}: KpiCardProps) {
  const displayValue = percentMode
    ? formatPercent(value)
    : amountMode
      ? formatAmountSmart(value)
      : formatAmount(value);

  const displayUnit = unit || (amountMode ? getAmountUnit(value) : percentMode ? '' : '');

  const riskBorderClass =
    risk === 'danger' ? 'border-l-4 border-l-red-500' :
    risk === 'warning' ? 'border-l-4 border-l-amber-500' :
    '';

  const riskBadge = risk === 'danger' ? (
    <span className="inline-flex items-center gap-0.5 text-xs text-red-600 bg-red-50 px-1.5 py-0.5 rounded-sm font-medium" title={riskTooltip}>
      <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a7 7 0 100 14A7 7 0 008 1zm-.75 4a.75.75 0 011.5 0v3a.75.75 0 01-1.5 0V5zM8 11.5a.75.75 0 100-1.5.75.75 0 000 1.5z"/></svg>
      风险
    </span>
  ) : risk === 'warning' ? (
    <span className="inline-flex items-center gap-0.5 text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-sm font-medium" title={riskTooltip}>
      <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M8.22 1.754a.25.25 0 00-.44 0L1.698 13.132a.25.25 0 00.22.368h12.164a.25.25 0 00.22-.368L8.22 1.754zm.576 4.746l-.5 3a.25.25 0 01-.496 0l-.5-3a.25.25 0 01.248-.296h.5a.25.25 0 01.248.296zM8 11.5a.75.75 0 100-1.5.75.75 0 000 1.5z"/></svg>
      预警
    </span>
  ) : null;

  return (
    <div
      className={cn(
        'bg-white rounded-lg border border-gray-200 px-4 py-3 transition-shadow hover:shadow-md',
        onClick && 'cursor-pointer',
        riskBorderClass,
        className
      )}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div className="flex items-start justify-between mb-1.5">
        <div className="flex items-center gap-2">
          {icon && (
            <div className={cn('w-8 h-8 rounded-md flex items-center justify-center text-white text-sm shrink-0', iconBg || 'bg-blue-500')}>
              {icon}
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500 font-medium">{label}</span>
            {tooltip && (
              <span className="relative group" aria-label={tooltip}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-300 cursor-help">
                  <circle cx="8" cy="8" r="6"/><path d="M8 11V7.5M8 5.5V5"/>
                </svg>
                <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-2 py-1 text-xs text-white bg-gray-800 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 max-w-xs whitespace-normal">
                  {tooltip}
                </span>
              </span>
            )}
          </div>
        </div>
        {riskBadge}
      </div>
      <div className="flex items-baseline gap-1">
        <span className={cn(
          'text-2xl font-bold tabular-nums tracking-tight',
          risk === 'danger' ? 'text-red-600' : 'text-gray-900',
          valueClassName
        )}>
          {displayValue}
        </span>
        {displayUnit && <span className="text-xs text-gray-400 font-medium">{displayUnit}</span>}
      </div>
      <div className="flex items-center justify-between mt-1.5">
        <div className="flex items-center gap-2">
          {scope && <span className="text-xs text-gray-400">{scope}</span>}
          {change != null && (
            <span className={cn(
              'text-xs font-medium tabular-nums',
              change > 0 ? 'text-green-600' : change < 0 ? 'text-red-600' : 'text-gray-400'
            )}>
              {change > 0 ? '↑' : change < 0 ? '↓' : '→'}{Math.abs(change).toFixed(1)}%
              {changeLabel && <span className="text-gray-400 ml-0.5">{changeLabel}</span>}
            </span>
          )}
        </div>
        {onClick && (
          <span className="text-xs text-blue-500 hover:text-blue-600">详情 →</span>
        )}
      </div>
    </div>
  );
}

// 图表卡片包装器 - 统一标题/单位/空态/加载态
export function ChartCard({
  title,
  unit,
  children,
  loading = false,
  empty = false,
  emptyText = '暂无数据',
  lastUpdated,
  className = '',
  height,
}: {
  title: string;
  unit?: string;
  children: React.ReactNode;
  loading?: boolean;
  empty?: boolean;
  emptyText?: string;
  lastUpdated?: string;
  className?: string;
  height?: number;
}) {
  return (
    <Card className={className} style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold" style={{ color: '#1D2129' }}>
            {title}
            {unit && <span className="text-xs font-normal ml-1" style={{ color: '#C9CDD4' }}>单位：{unit}</span>}
          </CardTitle>
          {lastUpdated && (
            <span className="text-xs" style={{ color: '#C9CDD4' }}>更新于 {lastUpdated}</span>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4" style={height ? { minHeight: height } : undefined}>
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-8 h-8 border-3 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
          </div>
        ) : empty ? (
          <div className="flex flex-col items-center justify-center h-48" style={{ color: '#C9CDD4' }}>
            <BarChart3 className="w-10 h-10 mb-2" />
            <p className="text-sm">{emptyText}</p>
          </div>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}

// 风险标识组件
export function RiskBadge({
  level,
  label,
  detail,
}: {
  level: 'danger' | 'warning' | 'normal';
  label: string;
  detail?: string;
}) {
  const colors = {
    danger: { bg: '#FFF0F0', border: '#F53F3F', text: '#CB2634' },
    warning: { bg: '#FFF7E8', border: '#FF7D00', text: '#D25F00' },
    normal: { bg: '#E8FFEA', border: '#00B42A', text: '#008A4C' },
  };
  const c = colors[level];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium cursor-help"
          style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}30` }}
        >
          {level === 'danger' && <AlertTriangle className="w-3 h-3 mr-1" />}
          {level === 'warning' && <AlertCircle className="w-3 h-3 mr-1" />}
          {label}
        </span>
      </TooltipTrigger>
      {detail && (
        <TooltipContent side="bottom" className="max-w-xs text-xs">
          {detail}
        </TooltipContent>
      )}
    </Tooltip>
  );
}

// 项目利润排行数据格式化
export function formatRankData(
  projects: Array<{ name: string; income: number; cost: number; profit: number }>,
  maxBars: number = 10
) {
  const sorted = [...projects].sort((a, b) => b.profit - a.profit).slice(0, maxBars);
  return {
    names: sorted.map(p => p.name.length > 8 ? p.name.slice(0, 8) + '...' : p.name),
    fullNames: sorted.map(p => p.name),
    income: sorted.map(p => p.income),
    cost: sorted.map(p => p.cost),
    profit: sorted.map(p => p.profit),
  };
}
