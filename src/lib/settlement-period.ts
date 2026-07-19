export function normalizeMonth(month?: string | null) {
  return /^\d{4}-\d{2}$/.test(month || '')
    ? String(month)
    : new Date().toISOString().slice(0, 7);
}

function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getSettlementPeriod(month?: string | null) {
  const safeMonth = normalizeMonth(month);
  const [year, monthNumber] = safeMonth.split('-').map(Number);
  const start = new Date(year, monthNumber - 2, 26);
  const end = new Date(year, monthNumber - 1, 25);

  return {
    month: safeMonth,
    start: formatDate(start),
    end: formatDate(end),
  };
}
