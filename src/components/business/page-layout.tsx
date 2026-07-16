'use client';

import { cn } from '@/lib/utils';
import { ReactNode } from 'react';

/**
 * 业务页面统一头部组件
 * 标题 + 描述 + 操作区
 */
interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <div className={cn('flex flex-col items-stretch gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4', className)}>
      <div className="min-w-0">
        <h1 className="text-xl font-semibold text-gray-900 tracking-tight">{title}</h1>
        {description && (
          <p className="text-sm text-gray-500 mt-0.5">{description}</p>
        )}
      </div>
      {actions && (
        <div className="mobile-action-grid shrink-0 sm:flex sm:w-auto sm:items-center sm:gap-2">{actions}</div>
      )}
    </div>
  );
}

/**
 * 筛选栏容器
 */
interface FilterBarProps {
  children: ReactNode;
  className?: string;
}

export function FilterBar({ children, className }: FilterBarProps) {
  return (
    <div className={cn(
      'mobile-filter-grid px-4 py-3 bg-white border border-gray-200 rounded-lg sm:flex sm:flex-wrap sm:items-center sm:gap-3',
      className
    )}>
      {children}
    </div>
  );
}

/**
 * 筛选项标签
 */
interface FilterItemProps {
  label: string;
  children: ReactNode;
}

export function FilterItem({ label, children }: FilterItemProps) {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <span className="text-xs text-gray-500 shrink-0">{label}</span>
      {children}
    </div>
  );
}

/**
 * 紧凑KPI卡片 - 用于列表页顶部统计
 */
interface CompactStatProps {
  label: string;
  value: string | number;
  type?: 'default' | 'blue' | 'green' | 'red' | 'orange' | 'purple';
  className?: string;
}

const STAT_COLORS = {
  default: 'text-gray-900',
  blue: 'text-blue-700',
  green: 'text-green-700',
  red: 'text-red-700',
  orange: 'text-orange-700',
  purple: 'text-purple-700',
};

export function CompactStat({ label, value, type = 'default', className }: CompactStatProps) {
  return (
    <div className={cn('flex items-center gap-2 px-3 py-1.5 rounded-md bg-gray-50 border border-gray-100', className)}>
      <span className="text-xs text-gray-500">{label}</span>
      <span className={cn('text-sm font-semibold tabular-nums', STAT_COLORS[type])}>{value}</span>
    </div>
  );
}

/**
 * 统计栏 - 一行展示多个统计指标
 */
interface StatsBarProps {
  items: { label: string; value: string | number; type?: 'default' | 'blue' | 'green' | 'red' | 'orange' | 'purple' }[];
  className?: string;
}

export function StatsBar({ items, className }: StatsBarProps) {
  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {items.map((item, i) => (
        <CompactStat key={i} label={item.label} value={item.value} type={item.type} />
      ))}
    </div>
  );
}

/**
 * 操作按钮组
 */
interface ActionGroupProps {
  children: ReactNode;
  className?: string;
}

export function ActionGroup({ children, className }: ActionGroupProps) {
  return (
    <div className={cn('mobile-action-grid sm:flex sm:w-auto sm:items-center sm:gap-2', className)}>
      {children}
    </div>
  );
}
