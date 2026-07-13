export interface ParsedConstructionLogDraft {
  log_date?: string;
  location?: string;
  content: string;
  headcount?: string;
  issues?: string;
}

function pickLine(lines: string[], labels: string[]) {
  const line = lines.find(item => labels.some(label => item.includes(label)));
  if (!line) return '';
  const [, value = ''] = line.split(/[:：]/);
  return value.trim();
}

function normalizeDate(text: string) {
  const match = text.match(/(20\d{2})[年\-/.](\d{1,2})[月\-/.](\d{1,2})/);
  if (!match) return '';
  const [, year, month, day] = match;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

export function parseConstructionLogText(rawText: string): ParsedConstructionLogDraft {
  const text = rawText.replace(/\r/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
  const location = pickLine(lines, ['施工部位', '施工位置', '部位', '位置']);
  const issues = pickLine(lines, ['异常', '问题', '存在问题', '质量问题', '安全问题']);
  const headcountLine = pickLine(lines, ['出勤', '人数', '工人']);
  const headcount = headcountLine.match(/\d+/)?.[0] || text.match(/(\d+)\s*(人|名)/)?.[1] || '';
  const logDate = normalizeDate(text);

  const contentLabelIndex = lines.findIndex(line => ['施工内容', '工作内容', '今日施工'].some(label => line.includes(label)));
  let content = '';
  if (contentLabelIndex >= 0) {
    content = lines
      .slice(contentLabelIndex, Math.min(contentLabelIndex + 8, lines.length))
      .map(line => line.replace(/^(施工内容|工作内容|今日施工)\s*[:：]?/, '').trim())
      .filter(Boolean)
      .join('\n');
  }

  if (!content) {
    content = lines
      .filter(line => !line.includes('施工部位') && !line.includes('出勤') && !line.includes('异常'))
      .slice(0, 10)
      .join('\n');
  }

  return {
    log_date: logDate || undefined,
    location: location || undefined,
    content,
    headcount: headcount || undefined,
    issues: issues || undefined,
  };
}
