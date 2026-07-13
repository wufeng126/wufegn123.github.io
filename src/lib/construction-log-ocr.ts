export interface ParsedConstructionLogDraft {
  log_date?: string;
  location?: string;
  content: string;
  headcount?: string;
  issues?: string;
  materials?: string;
  machines?: string;
  coordination?: string;
}

export interface ConstructionLogOcrQuality {
  textLength: number;
  hasDate: boolean;
  hasLocation: boolean;
  hasContent: boolean;
  warnings: string[];
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

function pickBlock(lines: string[], labels: string[]) {
  const start = lines.findIndex(line => labels.some(label => line.includes(label)));
  if (start < 0) return '';
  return lines
    .slice(start, Math.min(start + 5, lines.length))
    .map((line, index) => index === 0 ? line.replace(/^.*?[:：]/, '').trim() : line)
    .filter(Boolean)
    .join('\n');
}

export function parseConstructionLogText(rawText: string): ParsedConstructionLogDraft {
  const text = rawText.replace(/\r/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
  const location = pickLine(lines, ['施工部位', '施工位置', '部位', '位置']);
  const issues = pickLine(lines, ['异常', '问题', '存在问题', '质量问题', '安全问题']);
  const headcountLine = pickLine(lines, ['出勤', '人数', '工人']);
  const headcount = headcountLine.match(/\d+/)?.[0] || text.match(/(\d+)\s*(人|名)/)?.[1] || '';
  const logDate = normalizeDate(text);
  const materials = pickBlock(lines, ['材料', '进场材料', '材料使用']);
  const machines = pickBlock(lines, ['机械', '设备', '台班']);
  const coordination = pickBlock(lines, ['协调', '交底', '会议', '甲方', '监理']);

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

  const extraBlocks = [
    materials ? `材料：${materials}` : '',
    machines ? `机械设备：${machines}` : '',
    coordination ? `协调事项：${coordination}` : '',
  ].filter(Boolean);
  if (extraBlocks.length > 0) {
    content = [content, ...extraBlocks].filter(Boolean).join('\n\n');
  }

  return {
    log_date: logDate || undefined,
    location: location || undefined,
    content,
    headcount: headcount || undefined,
    issues: issues || undefined,
    materials: materials || undefined,
    machines: machines || undefined,
    coordination: coordination || undefined,
  };
}

export function analyzeConstructionLogOcrQuality(
  rawText: string,
  draft: ParsedConstructionLogDraft,
): ConstructionLogOcrQuality {
  const textLength = rawText.replace(/\s/g, '').length;
  const warnings: string[] = [];
  if (textLength < 30) warnings.push('识别文字偏少，建议补拍更清晰、更完整的日志页。');
  if (!draft.log_date) warnings.push('未识别到日期，请人工确认日期。');
  if (!draft.location) warnings.push('未识别到施工部位，请人工补充。');
  if (!draft.content || draft.content.replace(/\s/g, '').length < 10) warnings.push('施工内容不完整，请人工补充后再提交。');
  return {
    textLength,
    hasDate: Boolean(draft.log_date),
    hasLocation: Boolean(draft.location),
    hasContent: Boolean(draft.content && draft.content.replace(/\s/g, '').length >= 10),
    warnings,
  };
}
