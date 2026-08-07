"use client"

import * as React from "react"
import { Inbox, RotateCw, TriangleAlert } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"

/* ─────────────────────────────────────────────
 * 通用列表页模板
 * 结构：PageHeader（标题区）→ FilterBar（筛选区）→ DataTable（四态表格）→ PaginationBar（分页）
 * 对齐设计规范：sticky 表头、行 hover、数值右对齐（.num 工具类）、四态齐全
 * ───────────────────────────────────────────── */

/** 页面标题区：标题 + 副标题（左）+ 操作按钮（右） */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-3", className)}>
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  )
}

/** 筛选区容器：内部放 Select/Input/按钮 等筛选控件 */
export function FilterBar({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>{children}</div>
  )
}

/** 表格容器：白卡 + 四态（loading / error / empty / 正常） */
export function DataTable({
  loading,
  error,
  onRetry,
  emptyTitle = "暂无数据",
  emptyDescription = "调整筛选条件，或新建一条记录",
  emptyAction,
  columns,
  children,
  className,
  minWidth = 640,
}: {
  loading?: boolean
  error?: string | null
  onRetry?: () => void
  emptyTitle?: React.ReactNode
  emptyDescription?: React.ReactNode
  emptyAction?: React.ReactNode
  /** 表头单元格渲染器，传入列数组，返回 <TableHead> */
  columns: (th: typeof TableHead) => React.ReactNode
  /** 表格体内容（正常态） */
  children: React.ReactNode
  className?: string
  /** 表格最小宽度，窄屏横向滚动而非压扁 */
  minWidth?: number
}) {
  if (loading) {
    return (
      <div className={cn("rounded-xl border bg-card p-4", className)}>
        <div className="space-y-2.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={cn("rounded-xl border bg-card p-10", className)}>
        <Empty>
          <EmptyMedia variant="icon">
            <TriangleAlert className="text-destructive" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>加载失败</EmptyTitle>
            <EmptyDescription>{error}</EmptyDescription>
          </EmptyHeader>
          {onRetry ? (
            <Button variant="outline" onClick={onRetry}>
              <RotateCw className="mr-1 size-3.5" /> 重试
            </Button>
          ) : null}
        </Empty>
      </div>
    )
  }

  return (
    <div className={cn("overflow-hidden rounded-xl border bg-card", className)}>
      <div className="overflow-x-auto">
        <Table style={{ minWidth }}>
          <TableHeader className="bg-muted/40 [&_tr]:border-b">
            {columns(TableHead)}
          </TableHeader>
          <TableBody>{children}</TableBody>
        </Table>
      </div>
    </div>
  )
}

/** 空态行：放进 TableBody 使用 */
export function EmptyRow({
  colSpan,
  title = "暂无数据",
  description = "调整筛选条件，或新建一条记录",
  action,
}: {
  colSpan: number
  title?: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="h-64 p-0">
        <Empty>
          <EmptyMedia variant="icon">
            <Inbox />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>{title}</EmptyTitle>
            <EmptyDescription>{description}</EmptyDescription>
          </EmptyHeader>
          {action}
        </Empty>
      </TableCell>
    </TableRow>
  )
}

/** 分页条：页数信息 + 上一页/下一页 + 页码 */
export function PaginationBar({
  page,
  pageSize,
  total,
  onPageChange,
  className,
}: {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
  className?: string
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const pages = React.useMemo(() => {
    const arr: Array<number | "…"> = []
    const push = (n: number) => {
      const last = arr[arr.length - 1]
      if (last !== n) arr.push(n)
    }
    const start = Math.max(1, page - 2)
    const end = Math.min(totalPages, page + 2)
    if (start > 1) {
      push(1)
      if (start > 2) arr.push("…")
    }
    for (let i = start; i <= end; i++) push(i)
    if (end < totalPages) {
      if (end < totalPages - 1) arr.push("…")
      push(totalPages)
    }
    return arr
  }, [page, totalPages])

  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-3", className)}>
      <span className="text-sm text-muted-foreground tabular-nums">
        共 {total} 条 · 第 {page}/{totalPages} 页
      </span>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          上一页
        </Button>
        {pages.map((p, i) =>
          p === "…" ? (
            <span key={`gap-${i}`} className="px-1 text-sm text-muted-foreground">
              …
            </span>
          ) : (
            <Button
              key={p}
              variant={p === page ? "default" : "outline"}
              size="icon"
              className="size-8 text-sm"
              onClick={() => onPageChange(p)}
            >
              {p}
            </Button>
          )
        )}
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          下一页
        </Button>
      </div>
    </div>
  )
}

/** 数值单元格工具类：等宽 + 右对齐（用于金额/百分比/数量） */
export function numCell(className?: string) {
  return cn("text-right tabular-nums", className)
}
