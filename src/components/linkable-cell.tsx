'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { ChevronRight, ExternalLink } from 'lucide-react';

/**
 * 可点击下钻单元格
 * 用于表格中的名称列，点击跳转到对应详情页
 *
 * 使用方式：
 * <LinkableCell href={`/projects/${project.id}`}>{project.name}</LinkableCell>
 */

interface LinkableCellProps {
  href: string;
  children: React.ReactNode;
  className?: string;
  /** 是否显示右箭头图标 */
  showArrow?: boolean;
  /** 是否在新标签页打开 */
  newTab?: boolean;
}

export function LinkableCell({
  href,
  children,
  className,
  showArrow = false,
  newTab = false,
}: LinkableCellProps) {
  return (
    <Link
      href={href}
      target={newTab ? '_blank' : undefined}
      className={cn(
        'inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 hover:underline cursor-pointer font-medium transition-colors',
        className
      )}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
      {showArrow && <ChevronRight className="h-3 w-3 opacity-60" />}
    </Link>
  );
}

/**
 * 可点击的金额单元格
 * 点击跳转到对应详情页，鼠标悬停显示下钻图标
 */
interface LinkableAmountProps {
  href: string;
  value: number | string | null | undefined;
  className?: string;
  /** 金额格式化函数，默认使用千分位+2位小数 */
  formatter?: (v: number | string | null | undefined) => string;
}

export function LinkableAmount({
  href,
  value,
  className,
  formatter,
}: LinkableAmountProps) {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  const display = formatter
    ? formatter(value)
    : num != null && !isNaN(num)
      ? num.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : '-';

  return (
    <Link
      href={href}
      className={cn(
        'inline-flex items-center gap-1 tabular-nums font-medium text-blue-600 hover:text-blue-700 hover:underline cursor-pointer transition-colors group',
        className
      )}
      onClick={(e) => e.stopPropagation()}
    >
      {display}
      <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-60 transition-opacity" />
    </Link>
  );
}

/**
 * 图表数据点点击导航 hook
 * 用于 ECharts 的 onEvents 配置
 *
 * 使用方式：
 * const chartEvents = useChartDrilldown((params) => {
 *   if (params.name === '某项目') return `/projects/${projectId}`;
 * });
 * <ReactECharts onEvents={chartEvents} />
 */
export function useChartDrilldown(
  getHref: (params: any) => string | null
) {
  const router = useRouter();

  return {
    click: (params: any) => {
      const href = getHref(params);
      if (href) {
        router.push(href);
      }
    },
  };
}

/**
 * 项目名称下钻链接
 * 快捷方式：点击项目名称跳转到项目详情
 */
export function ProjectLink({
  id,
  name,
  className,
}: {
  id: number | string;
  name: string;
  className?: string;
}) {
  return (
    <LinkableCell href={`/projects/${id}`} className={className} showArrow>
      {name}
    </LinkableCell>
  );
}

/**
 * 工人名称下钻链接
 * 点击工人名称跳转到工人档案（当前页通过 Tab 切换）
 */
export function WorkerLink({
  id,
  name,
  className,
}: {
  id: number | string;
  name: string;
  className?: string;
}) {
  return (
    <LinkableCell href={`/hr-salary#workers`} className={className}>
      {name}
    </LinkableCell>
  );
}

/**
 * 供应商名称下钻链接
 */
export function SupplierLink({
  id,
  name,
  className,
}: {
  id: number | string;
  name: string;
  className?: string;
}) {
  return (
    <LinkableCell href={`/supplier-expense#suppliers`} className={className}>
      {name}
    </LinkableCell>
  );
}
