export type ConstructionLogSubmissionStatus = 'normal' | 'late';
export type ConstructionLogWindowStatus = ConstructionLogSubmissionStatus | 'blocked';

export type ConstructionLogSubmissionWindow = {
  allowed: boolean;
  status: ConstructionLogWindowStatus;
  submissionStatus: ConstructionLogSubmissionStatus | null;
  label: string;
  message: string;
};

const SHANGHAI_TIME_ZONE = 'Asia/Shanghai';
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function pad2(value: number) {
  return String(value).padStart(2, '0');
}

function formatShanghaiDate(now: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SHANGHAI_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const year = parts.find(part => part.type === 'year')?.value;
  const month = parts.find(part => part.type === 'month')?.value;
  const day = parts.find(part => part.type === 'day')?.value;
  return `${year}-${month}-${day}`;
}

function parseDateParts(date: string) {
  if (!DATE_PATTERN.test(date)) return null;
  const [year, month, day] = date.split('-').map(Number);
  if (!year || !month || !day) return null;
  return { year, month, day };
}

function shanghaiLocalDateTime(date: string, hour: number, minute = 0) {
  const parts = parseDateParts(date);
  if (!parts) return null;
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, hour - 8, minute, 0, 0));
}

export function addDaysToDateString(date: string, days: number) {
  const start = shanghaiLocalDateTime(date, 0);
  if (!start) return '';
  start.setUTCDate(start.getUTCDate() + days);
  return formatShanghaiDate(start);
}

export function getShanghaiDateString(now = new Date()) {
  return formatShanghaiDate(now);
}

export function getShanghaiHour(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SHANGHAI_TIME_ZONE,
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  return Number(parts.find(part => part.type === 'hour')?.value || 0);
}

export function getDefaultConstructionLogDate(now = new Date()) {
  const today = getShanghaiDateString(now);
  return getShanghaiHour(now) >= 18 ? today : addDaysToDateString(today, -1);
}

export function getDefaultDailyReportDate(now = new Date()) {
  return addDaysToDateString(getShanghaiDateString(now), -1);
}

export function formatLogWindowText(logDate: string) {
  const nextDate = addDaysToDateString(logDate, 1);
  if (!nextDate) return '';
  return `${logDate} 18:00 至 ${nextDate} 08:00 正常提交，08:00 至 12:00 为补交`;
}

export function getConstructionLogSubmissionWindow(
  logDate: string,
  now = new Date(),
): ConstructionLogSubmissionWindow {
  const start = shanghaiLocalDateTime(logDate, 18);
  const nextDate = addDaysToDateString(logDate, 1);
  const normalEnd = nextDate ? shanghaiLocalDateTime(nextDate, 8) : null;
  const lateEnd = nextDate ? shanghaiLocalDateTime(nextDate, 12) : null;

  if (!start || !normalEnd || !lateEnd) {
    return {
      allowed: false,
      status: 'blocked',
      submissionStatus: null,
      label: '日期无效',
      message: '施工日志日期格式不正确',
    };
  }

  const nowTime = now.getTime();
  if (nowTime >= start.getTime() && nowTime < normalEnd.getTime()) {
    return {
      allowed: true,
      status: 'normal',
      submissionStatus: 'normal',
      label: '正常提交',
      message: `当前可提交 ${logDate} 施工日志，截止 ${nextDate} 08:00。`,
    };
  }

  if (nowTime >= normalEnd.getTime() && nowTime < lateEnd.getTime()) {
    return {
      allowed: true,
      status: 'late',
      submissionStatus: 'late',
      label: '逾期补交',
      message: `当前为补交时段，提交后会标记为逾期提交，${nextDate} 12:00 后禁止提交。`,
    };
  }

  if (nowTime < start.getTime()) {
    return {
      allowed: false,
      status: 'blocked',
      submissionStatus: null,
      label: '未到提交时间',
      message: `${logDate} 施工日志需在 ${logDate} 18:00 后提交。`,
    };
  }

  return {
    allowed: false,
    status: 'blocked',
    submissionStatus: null,
    label: '已截止',
    message: `${logDate} 施工日志已超过补交截止时间（${nextDate} 12:00），不能再提交。`,
  };
}

export function getReadableDate(date: string) {
  const parts = parseDateParts(date);
  if (!parts) return date;
  return `${parts.year}年${pad2(parts.month)}月${pad2(parts.day)}日`;
}
