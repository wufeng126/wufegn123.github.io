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

const PAGE_MARK_REGEX = /^【第\d+张】/;
const FIELD_LABEL_REGEX = /^(项目名称|项目|工程名称|日期|施工日期|记录日期|记录人|填报人|天气|温度|班组|工种|出勤|出勤人数|人数|施工部位|施工位置|部位|位置|备注)\s*[:：]?\s*/;
const CONTENT_LABEL_REGEX = /^(施工内容|工作内容|今日施工|完成内容|主要内容|施工情况)\s*[:：]?\s*/;

const COMMON_OCR_FIXES: Array<[RegExp, string]> = [
  [/摸板/g, '模板'],
  [/模版/g, '模板'],
  [/钢筋邦扎/g, '钢筋绑扎'],
  [/绑札/g, '绑扎'],
  [/支摸/g, '支模'],
  [/浇注/g, '浇筑'],
  [/混泥土/g, '混凝土'],
  [/砼土/g, '混凝土'],
  [/保温板粘贴/g, '保温板粘贴'],
  [/挂网抹灰/g, '挂网抹灰'],
  [/腻子打磨/g, '腻子打磨'],
  [/圾圾/g, '垃圾'],
  [/清里/g, '清理'],
  [/材枓/g, '材料'],
  [/机戒/g, '机械'],
  [/安荃/g, '安全'],
  [/质量/g, '质量'],
  [/验收合格/g, '验收合格'],
];

function normalizeWhitespace(rawText: string) {
  return rawText
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function applyCommonOcrFixes(text: string) {
  return COMMON_OCR_FIXES.reduce((result, [pattern, replacement]) => result.replace(pattern, replacement), text);
}

function removeNoiseLines(lines: string[]) {
  const contentLabelIndex = lines.findIndex(line => CONTENT_LABEL_REGEX.test(line));
  const sourceLines = contentLabelIndex >= 0 ? lines.slice(contentLabelIndex) : lines;

  return sourceLines
    .map(line => line.replace(PAGE_MARK_REGEX, '').trim())
    .map(line => line.replace(CONTENT_LABEL_REGEX, '').trim())
    .filter(Boolean)
    .filter(line => {
      if (FIELD_LABEL_REGEX.test(line) && line.length <= 24) return false;
      if (/^(上午|下午|晚上)?\s*$/.test(line)) return false;
      return true;
    });
}

export function normalizeConstructionLogContent(rawText: string) {
  const text = normalizeWhitespace(rawText);
  if (!text) return '';

  const lines = text
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  const cleaned = removeNoiseLines(lines)
    .join('\n')
    .replace(/[;；]\s*/g, '；')
    .replace(/[、]{2,}/g, '、')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return applyCommonOcrFixes(cleaned);
}

export function parseConstructionLogText(rawText: string): ParsedConstructionLogDraft {
  return {
    content: normalizeConstructionLogContent(rawText),
  };
}

export function analyzeConstructionLogOcrQuality(
  rawText: string,
  draft: ParsedConstructionLogDraft,
): ConstructionLogOcrQuality {
  const textLength = rawText.replace(/\s/g, '').length;
  const contentLength = (draft.content || '').replace(/\s/g, '').length;
  const warnings: string[] = [];

  if (textLength === 0) {
    warnings.push('未识别到明显文字，已尽量生成草稿，请重点核对施工内容。');
  } else if (textLength < 18 || contentLength < 10) {
    warnings.push('图片识别质量较低，已尽量整理，请重点核对施工内容。');
  } else {
    warnings.push('已根据图片自动纠错整理施工内容，请提交前核对。');
  }

  return {
    textLength,
    hasDate: false,
    hasLocation: false,
    hasContent: contentLength >= 10,
    warnings,
  };
}
