/**
 * ECharts 统一配色与主题常量
 *
 * 独立为轻量模块：仅导出常量，不引入 echarts 运行时。
 * 这样仅需要配色常量的页面不会把 echarts 打进首屏包；
 * 图表组件本身通过 next/dynamic 在客户端懒加载。
 */

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
