'use client';

import { useEffect, useRef, useState } from 'react';

interface AnimatedNumberProps {
  value: number;
  duration?: number;
  format?: (value: number) => string;
  className?: string;
  style?: React.CSSProperties;
}

export function AnimatedNumber({
  value,
  duration = 1000,
  format = (v) => v.toLocaleString('zh-CN'),
  className,
  style,
}: AnimatedNumberProps) {
  const [displayValue, setDisplayValue] = useState(0);
  const startTime = useRef<number | null>(null);
  const startValue = useRef(0);
  const rafId = useRef<number | null>(null);

  useEffect(() => {
    startValue.current = displayValue;
    startTime.current = null;

    const animate = (timestamp: number) => {
      if (!startTime.current) {
        startTime.current = timestamp;
      }

      const progress = Math.min((timestamp - startTime.current) / duration, 1);
      
      // 使用 easeOutExpo 缓动函数
      const easeProgress = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      
      const currentValue = startValue.current + (value - startValue.current) * easeProgress;
      setDisplayValue(currentValue);

      if (progress < 1) {
        rafId.current = requestAnimationFrame(animate);
      }
    };

    rafId.current = requestAnimationFrame(animate);

    return () => {
      if (rafId.current) {
        cancelAnimationFrame(rafId.current);
      }
    };
  }, [value, duration]);

  return (
    <span className={className} style={style}>
      {format(displayValue)}
    </span>
  );
}

// 货币格式化
export const formatCurrency = (value: number) => {
  return `¥${Math.round(value).toLocaleString('zh-CN')}`;
};

// 百分比格式化
export const formatPercent = (value: number) => {
  return `${value.toFixed(1)}%`;
};
