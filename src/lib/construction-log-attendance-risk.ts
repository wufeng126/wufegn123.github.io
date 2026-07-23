type ExtractedAttendanceCount = {
  count: number | null;
  source?: string;
  mode?: 'total' | 'sum' | 'generic';
};

type AttendanceConsistencyResult = {
  ok: boolean;
  expectedCount: number | null;
  selectedCount: number;
  message?: string;
};

const CN_NUMERAL = '[\\u96f6\\u3007\\u4e00\\u4e8c\\u4e24\\u4e09\\u56db\\u4e94\\u516d\\u4e03\\u516b\\u4e5d\\u5341\\u767e]';
const COUNT_PATTERN = `(?:\\d+|${CN_NUMERAL}+)`;
const PERSON_UNIT_PATTERN = '(?:\\u4eba|\\u540d|\\u4e2a\\u5de5\\u4eba|\\u5de5\\u4eba)';
const BREAK_PATTERN = '[^\\d\\u96f6\\u3007\\u4e00\\u4e8c\\u4e24\\u4e09\\u56db\\u4e94\\u516d\\u4e03\\u516b\\u4e5d\\u5341\\u767e]{0,8}';

const totalBeforeCountRegex = new RegExp(
  `(?:\\u51fa\\u52e4|\\u5230\\u573a|\\u5230\\u5c97|\\u5728\\u573a|\\u73b0\\u573a|\\u5171|\\u5408\\u8ba1|\\u603b\\u8ba1|\\u603b\\u4eba\\u6570|\\u4eba\\u6570|\\u4eba\\u5458|\\u5de5\\u4eba)${BREAK_PATTERN}(${COUNT_PATTERN})\\s*${PERSON_UNIT_PATTERN}`,
);

const totalAfterCountRegex = new RegExp(
  `(${COUNT_PATTERN})\\s*${PERSON_UNIT_PATTERN}\\s*(?:\\u51fa\\u52e4|\\u5230\\u573a|\\u5230\\u5c97|\\u5728\\u573a|\\u65bd\\u5de5|\\u4f5c\\u4e1a|\\u53c2\\u4e0e)`,
);

const tradeCountRegex = new RegExp(
  `(?:\\u6728\\u5de5|\\u94a2\\u7b4b\\u5de5|\\u67b6\\u5b50\\u5de5|\\u6ce5\\u5de5|\\u74e6\\u5de5|\\u62b9\\u7070\\u5de5|\\u6c34\\u7535\\u5de5|\\u7535\\u5de5|\\u710a\\u5de5|\\u6cb9\\u6f06\\u5de5|\\u5b89\\u88c5\\u5de5|\\u6742\\u5de5|\\u666e\\u5de5|\\u7ba1\\u7406\\u4eba\\u5458|\\u73ed\\u7ec4|\\u5de5\\u4eba|\\u4eba\\u5458)[^\\uff0c\\u3002\\u3001\\uff1b;\\n\\r]{0,10}?(${COUNT_PATTERN})\\s*(?:\\u4eba|\\u540d)`,
  'g',
);

const genericPersonCountRegex = new RegExp(`(${COUNT_PATTERN})\\s*${PERSON_UNIT_PATTERN}`, 'g');

const chineseDigitMap: Record<string, number> = {
  '\u96f6': 0,
  '\u3007': 0,
  '\u4e00': 1,
  '\u4e8c': 2,
  '\u4e24': 2,
  '\u4e09': 3,
  '\u56db': 4,
  '\u4e94': 5,
  '\u516d': 6,
  '\u4e03': 7,
  '\u516b': 8,
  '\u4e5d': 9,
};

const chineseUnitMap: Record<string, number> = {
  '\u5341': 10,
  '\u767e': 100,
};

function normalizeDigits(value: string) {
  return value.replace(/[\uff10-\uff19]/g, (char) => String(char.charCodeAt(0) - 0xff10));
}

function parseChineseNumber(value: string) {
  let total = 0;
  let current = 0;

  for (const char of value) {
    if (char in chineseDigitMap) {
      current = chineseDigitMap[char];
      continue;
    }

    const unit = chineseUnitMap[char];
    if (unit) {
      total += (current || 1) * unit;
      current = 0;
    }
  }

  return total + current;
}

function parseCount(value: string) {
  const normalized = normalizeDigits(value.trim());
  if (/^\d+$/.test(normalized)) return Number(normalized);
  return parseChineseNumber(normalized);
}

function toValidCount(value: string) {
  const count = parseCount(value);
  return Number.isInteger(count) && count > 0 && count <= 1000 ? count : null;
}

function extractFirst(regex: RegExp, content: string): ExtractedAttendanceCount {
  const match = content.match(regex);
  if (!match?.[1]) return { count: null };
  const count = toValidCount(match[1]);
  return count ? { count, source: match[0], mode: 'total' } : { count: null };
}

export function extractMentionedAttendanceCount(rawContent: string | null | undefined): ExtractedAttendanceCount {
  const content = normalizeDigits(String(rawContent || '').trim());
  if (!content) return { count: null };

  const beforeCount = extractFirst(totalBeforeCountRegex, content);
  if (beforeCount.count !== null) return beforeCount;

  const afterCount = extractFirst(totalAfterCountRegex, content);
  if (afterCount.count !== null) return afterCount;

  const tradeMatches = Array.from(content.matchAll(tradeCountRegex));
  if (tradeMatches.length > 0) {
    const counts = tradeMatches
      .map((match) => match[1] ? toValidCount(match[1]) : null)
      .filter((count): count is number => count !== null);
    if (counts.length > 0) {
      return {
        count: counts.reduce((sum, count) => sum + count, 0),
        source: tradeMatches.map((match) => match[0]).join(' + '),
        mode: 'sum',
      };
    }
  }

  const genericMatches = Array.from(content.matchAll(genericPersonCountRegex));
  if (genericMatches.length === 1 && genericMatches[0]?.[1]) {
    const count = toValidCount(genericMatches[0][1]);
    if (count !== null) {
      return { count, source: genericMatches[0][0], mode: 'generic' };
    }
  }

  return { count: null };
}

export function validateAttendanceCountConsistency(input: {
  content?: string | null;
  selectedCount: number;
}): AttendanceConsistencyResult {
  const selectedCount = Number.isFinite(input.selectedCount) ? input.selectedCount : 0;
  const extracted = extractMentionedAttendanceCount(input.content);

  if (extracted.count === null || extracted.count === selectedCount) {
    return {
      ok: true,
      expectedCount: extracted.count,
      selectedCount,
    };
  }

  return {
    ok: false,
    expectedCount: extracted.count,
    selectedCount,
    message: `\u65bd\u5de5\u5185\u5bb9\u4e2d\u8bc6\u522b\u5230\u51fa\u52e4 ${extracted.count} \u4eba\uff0c\u4f46\u5df2\u9009\u62e9 ${selectedCount} \u4eba\uff0c\u8bf7\u8c03\u6574\u51fa\u52e4\u4eba\u5458\u540e\u518d\u63d0\u4ea4\u3002`,
  };
}
