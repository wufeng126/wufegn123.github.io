const REPORT_MONTH_RE = /^\d{4}-\d{2}$/;
const PROJECT_IDS_RE = /^[1-9]\d*(,[1-9]\d*)*$/;

export function isValidReportMonth(value: string | null | undefined): value is string {
  return Boolean(value && REPORT_MONTH_RE.test(value));
}

export function isValidProjectIdParam(value: string | null | undefined): boolean {
  if (!value || value === 'all') return true;
  return PROJECT_IDS_RE.test(value);
}

export function parsePositiveIntParam(value: string | null | undefined): number | null {
  if (!value || !/^[1-9]\d*$/.test(value)) return null;
  return Number(value);
}
