'use client';

import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';

interface KPICardProps {
  title: string;
  value: string | number;
  unit?: string;
  change?: number; // 环比变化百分比，正数=增长，负数=下降
  icon: React.ReactNode;
  color: string;
  gradientFrom?: string;
  gradientTo?: string;
  miniData?: number[];
  progress?: number; // 0-100 完成率
  delay?: number;
}

/** 格式化数字为千分位 */
function formatNumber(val: string | number): string {
  if (typeof val === 'string') {
    // 如果已经包含非数字字符(如¥)，保留前缀
    const match = val.match(/^([^\d]*)([\d,.]+)(.*)$/);
    if (match) {
      const prefix = match[1];
      const num = match[2].replace(/,/g, '');
      const suffix = match[3];
      const parsed = parseFloat(num);
      if (!isNaN(parsed)) {
        return `${prefix}${parsed.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}${suffix}`;
      }
    }
    return val;
  }
  return val.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
}

export default function KPICard({
  title,
  value,
  unit,
  change,
  icon,
  color,
  gradientFrom,
  gradientTo,
  miniData,
  progress,
  delay = 0,
}: KPICardProps) {
  const isUp = change !== undefined && change >= 0;
  const changeColor = isUp ? '#00B42A' : '#F53F3F';
  const gf = gradientFrom || color;
  const gt = gradientTo || `${color}CC`;

  // 迷你趋势图 SVG
  const sparkline = useMemo(() => {
    if (!miniData || miniData.length < 2) return null;
    const data = miniData.filter((v) => v !== null && v !== undefined);
    if (data.length < 2) return null;
    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min || 1;
    const w = 80;
    const h = 28;
    const points = data
      .map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`)
      .join(' ');
    const areaPoints = `0,${h} ${points} ${w},${h}`;
    const gradId = `grad-${title.replace(/\s/g, '')}-${Math.random().toString(36).slice(2, 6)}`;
    return (
      <svg width={w} height={h} className="opacity-50">
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <polygon points={areaPoints} fill={`url(#${gradId})`} />
        <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    );
  }, [miniData, color, title]);

  return (
    <Card
      className="group relative overflow-hidden transition-all duration-300 ease-out hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)] hover:-translate-y-[3px]"
      style={{
        background: '#FFFFFF',
        border: '1px solid var(--border, #E8EAED)',
        borderRadius: '0.625rem',
        animationDelay: `${delay}ms`,
      }}
    >
      <div className="p-4 md:p-5">
        {/* 图标 + 标题行 */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            {/* 渐变色图标容器 48x48 */}
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm"
              style={{
                background: `linear-gradient(135deg, ${gf}, ${gt})`,
              }}
            >
              <div className="text-white">{icon}</div>
            </div>
            <span className="text-sm font-medium leading-tight" style={{ color: '#86909C' }}>
              {title}
            </span>
          </div>
          {change !== undefined && (
            <div
              className="flex items-center gap-0.5 px-2 py-1 rounded-full text-xs font-semibold flex-shrink-0"
              style={{
                background: isUp ? '#E8FFEA' : '#FFECE8',
                color: changeColor,
              }}
            >
              {isUp ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
              {Math.abs(change).toFixed(1)}%
            </div>
          )}
        </div>

        {/* 数值 + 单位 */}
        <div className="flex items-end justify-between">
          <div className="flex items-baseline gap-1.5">
            <span
              className="text-[28px] font-bold tracking-tight leading-none"
              style={{ color: '#1D2129' }}
            >
              {formatNumber(value)}
            </span>
            {unit && (
              <span className="text-xs font-medium" style={{ color: '#C9CDD4' }}>
                {unit}
              </span>
            )}
          </div>
          {sparkline && <div className="flex-shrink-0">{sparkline}</div>}
        </div>

        {/* 迷你进度条 */}
        {progress !== undefined && progress >= 0 && (
          <div className="mt-3 flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: '#F2F3F5' }}>
              <div
                className="h-full rounded-full transition-all duration-700 ease-out"
                style={{
                  width: `${Math.min(progress, 100)}%`,
                  background: `linear-gradient(90deg, ${gf}, ${gt})`,
                }}
              />
            </div>
            <span className="text-[10px] font-medium" style={{ color: '#86909C' }}>
              {progress.toFixed(0)}%
            </span>
          </div>
        )}
      </div>
    </Card>
  );
}
