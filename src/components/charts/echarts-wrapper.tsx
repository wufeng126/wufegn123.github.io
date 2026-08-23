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
// 常量从轻量模块导入并重新导出，保持既有引用路径兼容
import { CHART_COLORS, THEME } from './chart-theme';

export { CHART_COLORS, THEME } from './chart-theme';

echarts.use([
  BarChart, LineChart, PieChart,
  TitleComponent, TooltipComponent, LegendComponent, GridComponent,
  DataZoomComponent, ToolboxComponent, GraphicComponent, CanvasRenderer,
]);

interface EChartsWrapperProps {
  option: Record<string, unknown>;
  style?: React.CSSProperties;
  className?: string;
  onChartClick?: (params: echarts.ECElementEvent) => void;
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
      instance.on('click', onChartClick);
    }

    const handleResize = () => instance.resize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      // 性能修复：组件卸载时释放图表实例（此前未 dispose，SPA 切换/弹窗关闭会累积泄漏）
      instance.dispose();
      instanceRef.current = null;
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
