'use client';

import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart } from 'echarts/charts';
import {
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent,
  DataZoomComponent,
  ToolboxComponent,
  GraphicComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([
  BarChart, LineChart, PieChart,
  TitleComponent, TooltipComponent, LegendComponent, GridComponent,
  DataZoomComponent, ToolboxComponent, GraphicComponent, CanvasRenderer,
]);

// 统一配色方案
export const CHART_COLORS = {
  primary: '#165DFF',
  success: '#00B42A',
  danger: '#F53F3F',
  warning: '#FF7D00',
  purple: '#722ED1',
  gray: '#86909C',
  series: ['#165DFF', '#00B42A', '#F53F3F', '#FF7D00', '#722ED1', '#13C2C2', '#F7BA1E', '#EB2F96'],
};

// 全局 ECharts 主题
export const THEME = {
  color: CHART_COLORS.series,
  backgroundColor: 'transparent',
  textStyle: { color: '#4E5969', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' },
  title: { textStyle: { color: '#1D2129', fontWeight: 600, fontSize: 14 } },
  legend: { textStyle: { color: '#86909C', fontSize: 12 } },
  tooltip: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderColor: '#E5E6EB',
    borderWidth: 1,
    textStyle: { color: '#1D2129', fontSize: 12 },
    extraCssText: 'box-shadow: 0 4px 12px rgba(0,0,0,0.08); border-radius: 8px;',
  },
  categoryAxis: {
    axisLine: { lineStyle: { color: '#E5E6EB' } },
    axisTick: { show: false },
    axisLabel: { color: '#86909C', fontSize: 11 },
    splitLine: { show: false },
  },
  valueAxis: {
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: '#86909C', fontSize: 11 },
    splitLine: { lineStyle: { color: '#F2F3F5', type: 'dashed' } },
  },
};

interface EChartsWrapperProps {
  option: Record<string, unknown>;
  style?: React.CSSProperties;
  className?: string;
  onChartClick?: (params: Record<string, unknown>) => void;
}

export default function EChartsWrapper({ option, style, className, onChartClick }: EChartsWrapperProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!chartRef.current) return;

    const instance = echarts.getInstanceByDom(chartRef.current) || echarts.init(chartRef.current);
    instanceRef.current = instance;
    instance.setOption({ ...THEME, ...option }, true);

    if (onChartClick) {
      instance.off('click');
      instance.on('click', onChartClick as any);
    }

    const handleResize = () => instance.resize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [option, onChartClick]);

  // ResizeObserver for container size changes
  useEffect(() => {
    if (!chartRef.current) return;
    const ro = new ResizeObserver(() => {
      instanceRef.current?.resize();
    });
    ro.observe(chartRef.current);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={chartRef}
      className={className}
      style={{ width: '100%', height: '100%', minHeight: 200, ...style }}
    />
  );
}
