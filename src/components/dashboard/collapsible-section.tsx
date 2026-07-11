'use client';

import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * 可折叠分组面板
 * 用于台账明细按业务类型分组收纳，默认收起次要表格
 */
interface CollapsibleSectionProps {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  badge?: string | number;
  summary?: ReactNode;
  className?: string;
}

export function CollapsibleSection({
  title,
  icon,
  children,
  defaultOpen = false,
  badge,
  summary,
  className,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className={cn('rounded-lg border bg-card', className)}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full px-4 py-3 hover:bg-accent/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          {isOpen ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          {icon}
          <span className="text-sm font-medium">{title}</span>
          {badge !== undefined && badge !== '' && (
            <span className="ml-1 inline-flex items-center justify-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {badge}
            </span>
          )}
        </div>
        {summary && !isOpen && (
          <div className="text-xs text-muted-foreground mr-2">{summary}</div>
        )}
      </button>
      {isOpen && (
        <div className="px-4 pb-4 pt-0 border-t">
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * 台账分组容器
 * 将多个台账表格按业务类型分组，主要表格默认展开，次要表格默认收起
 */
interface LedgerGroupProps {
  sections: Array<{
    key: string;
    title: string;
    icon?: ReactNode;
    content: ReactNode;
    defaultOpen?: boolean;
    badge?: string | number;
    summary?: ReactNode;
  }>;
  className?: string;
}

export function LedgerGroup({ sections, className }: LedgerGroupProps) {
  return (
    <div className={cn('space-y-3', className)}>
      {sections.map((section) => (
        <CollapsibleSection
          key={section.key}
          title={section.title}
          icon={section.icon}
          badge={section.badge}
          summary={section.summary}
          defaultOpen={section.defaultOpen}
        >
          {section.content}
        </CollapsibleSection>
      ))}
    </div>
  );
}
