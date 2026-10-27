'use client';

import { useState } from 'react';
import { Calendar as CalendarIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

/** 将 YYYY-MM-DD 字符串 -> UTC Date（避免本地时区导致日期偏移） */
function toUtcDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/** UTC Date -> YYYY-MM-DD 字符串 */
function fromUtcDate(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(
    date.getUTCDate()
  ).padStart(2, '0')}`;
}

/**
 * 浮层日历日期选择组件。
 * 使用自绘 Popover + Calendar 弹层，不依赖浏览器原生 <input type="date"> 的日历弹层，
 * 规避部分环境下原生 date picker 无法弹出/无法选中的问题，保证各浏览器交互一致。
 */
export function DatePickerField({
  label,
  value,
  min,
  max,
  onChange,
  placeholder = '选择日期',
}: {
  label: string;
  value: string;
  min?: string;
  max?: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = value ? toUtcDate(value) : undefined;
  const minDate = min ? toUtcDate(min) : undefined;
  const maxDate = max ? toUtcDate(max) : undefined;

  return (
    <div>
      <span className="mb-1 block text-xs text-muted-foreground">{label}</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className={cn(
              'h-10 w-full justify-start gap-2 rounded-lg border-border bg-white px-3 text-sm font-normal text-foreground shadow-none hover:bg-muted/40 hover:text-foreground',
              !value && 'text-muted-foreground'
            )}
          >
            <CalendarIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{value || placeholder}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0" sideOffset={4}>
          <Calendar
            mode="single"
            timeZone="UTC"
            selected={selected}
            onSelect={(day) => {
              if (day) onChange(fromUtcDate(day));
              setOpen(false);
            }}
            disabled={(day) => Boolean((minDate && day < minDate) || (maxDate && day > maxDate))}
          />
          {value ? (
            <div className="border-t border-border p-1.5">
              <button
                type="button"
                className="w-full rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground"
                onClick={() => {
                  onChange('');
                  setOpen(false);
                }}
              >
                清除日期
              </button>
            </div>
          ) : null}
        </PopoverContent>
      </Popover>
    </div>
  );
}