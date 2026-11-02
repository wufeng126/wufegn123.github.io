/**
 * 按需加载 xlsx（SheetJS 约 400KB+，静态引入会拖慢首屏）。
 * 用法：
 *   const XLSX = await loadXLSX();
 *   XLSX.utils.json_to_sheet(...)
 */
let cached: typeof import('xlsx') | null = null;

export async function loadXLSX(): Promise<typeof import('xlsx')> {
  if (!cached) cached = await import('xlsx');
  return cached;
}
