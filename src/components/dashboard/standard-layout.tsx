'use client';

import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * 标准化看板四段式布局组件
 * 顶部筛选栏 → 核心指标卡片区 → 可视化图表区 → 明细台账区
 * 所有数据看板和报表页面统一使用此架构
 */

// ─── 第一段：筛选栏 ─────────────────────────────
interface FilterBarProps {
  title: string;
  filters: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function FilterBar({ title, filters, actions, className }: FilterBarProps) {
  return (
    <div className={cn('flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between', className)}>
      <h1 className="text-lg font-semibold tracking-tight sm:text-xl">{title}</h1>
      <div className="mobile-filter-grid sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:gap-2">
        {filters}
        {actions}
      </div>
    </div>
  );
}

// ─── 第二段：指标卡片区 ─────────────────────────────
interface KpiSectionProps {
  cards: ReactNode;
  className?: string;
}

export function KpiSection({ cards, className }: KpiSectionProps) {
  return (
    <div className={cn('grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6', className)}>
      {cards}
    </div>
  );
}

// ─── 第三段：图表区 ─────────────────────────────
interface ChartSectionProps {
  title?: string;
  charts: ReactNode;
  className?: string;
}

export function ChartSection({ title, charts, className }: ChartSectionProps) {
  return (
    <div className={cn('space-y-3', className)}>
      {title && (
        <div className="flex items-center gap-2 px-1">
          <div className="h-4 w-1 rounded-full bg-primary" />
          <h2 className="text-sm font-semibold text-muted-foreground">{title}</h2>
        </div>
      )}
      <div className="grid gap-3 grid-cols-1 lg:grid-cols-2">
        {charts}
      </div>
    </div>
  );
}

// ─── 第四段：台账区 ─────────────────────────────
interface LedgerSectionProps {
  title?: string;
  children: ReactNode;
  className?: string;
}

export function LedgerSection({ title, children, className }: LedgerSectionProps) {
  return (
    <div className={cn('space-y-3', className)}>
      {title && (
        <div className="flex items-center gap-2 px-1">
          <div className="h-4 w-1 rounded-full bg-primary" />
          <h2 className="text-sm font-semibold text-muted-foreground">{title}</h2>
        </div>
      )}
      {children}
    </div>
  );
}

// ─── 主容器 ─────────────────────────────
interface StandardDashboardLayoutProps {
  /** 页面标题 */
  title?: string;
  /** 加载状态 */
  loading?: boolean;
  /** 第一段：筛选栏 */
  filterBar?: ReactNode;
  /** 第二段：指标卡片区 */
  kpiSection?: ReactNode;
  /** 第三段：图表区 */
  chartSection?: ReactNode;
  /** 第四段：台账区 */
  ledgerSection?: ReactNode;
  /** 页脚信息 */
  footer?: ReactNode;
  className?: string;
}

export function StandardDashboardLayout({
  title,
  loading,
  filterBar,
  kpiSection,
  chartSection,
  ledgerSection,
  footer,
  className,
}: StandardDashboardLayoutProps) {
  return (
    <div className={cn('w-full max-w-full space-y-4 overflow-x-hidden p-3 sm:p-4 md:p-6', className)}>
      {/* 加载骨架 */}
      {loading && <DashboardSkeleton />}

      {/* 第一段：筛选栏 */}
      {filterBar}

      {/* 第二段：指标卡片区 */}
      {kpiSection}

      {/* 第三段：图表区 */}
      {chartSection}

      {/* 第四段：台账区 */}
      {ledgerSection}

      {/* 页脚信息 */}
      {footer && (
        <div className="pt-2 border-t text-xs text-muted-foreground space-y-1">
          {footer}
        </div>
      )}
    </div>
  );
}

// ─── 辅助组件：图表卡片包装 ─────────────────────────────
interface DashboardChartCardProps {
  title: string;
  unit?: string;
  children: ReactNode;
  className?: string;
  extra?: ReactNode;
}

export function DashboardChartCard({ title, unit, children, className, extra }: DashboardChartCardProps) {
  return (
    <Card className={cn('max-w-full overflow-hidden', className)}>
      <CardHeader className="pb-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-sm font-medium leading-5">{title}</CardTitle>
          {extra}
        </div>
        {unit && <span className="text-xs text-muted-foreground">单位：{unit}</span>}
      </CardHeader>
      <CardContent className="overflow-hidden">
        {children}
      </CardContent>
    </Card>
  );
}

// ─── 骨架屏 ─────────────────────────────
export function DashboardSkeleton() {
  return (
    <div className="space-y-4 p-4 md:p-6">
      <Skeleton className="h-10 w-full" />
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <div className="grid gap-3 grid-cols-1 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-72" />
        ))}
      </div>
      <Skeleton className="h-96" />
    </div>
  );
}
