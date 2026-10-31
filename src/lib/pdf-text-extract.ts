import zlib from 'zlib';

/**
 * 轻量 PDF 文字提取（无第三方依赖）
 *
 * 用途：上传合同后需要把条款文本存进知识库，AI 才能回答"是否我们提供"这类问题。
 * 覆盖范围：文字版 PDF（含 FlateDecode 压缩流）。扫描件（图片）无法提取，由调用方走 OCR 提示。
 * 说明：只做"够用"的提取——解析内容流里的 Tj/TJ 文本片段，顺序拼接；
 *       不做字体编码映射（部分 CID 字体可能得到乱码，此时返回空让上层走兜底）。
 */
export function extractPdfText(buffer: Buffer): string {
  try {
    const chunks: string[] = [];
    const raw = buffer;

    // 收集所有 stream ... endstream 片段
    const streamRegex = /stream\r?\n?/g;
    let match: RegExpExecArray | null;
    let guard = 0;
    while ((match = streamRegex.exec(raw.toString('latin1'))) !== null && guard < 500) {
      guard += 1;
      const start = match.index + match[0].length;
      const end = raw.toString('latin1').indexOf('endstream', start);
      if (end < 0) break;
      const slice = raw.subarray(start, end);
      streamRegex.lastIndex = end + 'endstream'.length;

      // 跳过过大的流（多半是图片/字体），只处理页面内容流
      if (slice.length > 5 * 1024 * 1024) continue;

      let text = '';
      try {
        const inflated = zlib.inflateSync(slice);
        const rawText = inflated.toString('latin1');
        if (/(Tj|TJ)\b/.test(rawText)) text = extractFromContentStream(rawText);
      } catch {
        const rawText = slice.toString('latin1');
        if (/(Tj|TJ)\b/.test(rawText)) text = extractFromContentStream(rawText);
      }
      if (text.trim()) chunks.push(text);
      if (chunks.join('').length > 200_000) break;
    }

    const joined = normalize(chunks.join('\n'));
    // 可读性校验：中文/英文/数字占比过低说明是字体编码乱码，视为提取失败
    const meaningful = joined.replace(/[^\u4e00-\u9fa5A-Za-z0-9，。、；：（）()《》%．.\-—\s]/g, '');
    if (joined.length === 0) return '';
    if (meaningful.length / joined.length < 0.6) return '';
    return joined.slice(0, 200_000);
  } catch {
    return '';
  }
}

function extractFromContentStream(content: string): string {
  const out: string[] = [];
  // (...)、<...> 两种字符串形式
  const parenRegex = /\((?:\\.|[^\\()])*\)/g;
  const hexRegex = /<([0-9A-Fa-f\s]{4,})>/g;

  const parens = content.match(parenRegex) || [];
  parens.forEach((token) => {
    const inner = token.slice(1, -1);
    const decoded = inner
      .replace(/\\([nrtbf()\\])/g, (_all, ch: string) => {
        const map: Record<string, string> = { n: '\n', r: '\n', t: ' ', b: '', f: '', '(': '(', ')': ')', '\\': '\\' };
        return map[ch] ?? ch;
      })
      .replace(/\\([0-7]{1,3})/g, (_all, oct: string) => String.fromCharCode(parseInt(oct, 8)));
    if (decoded.trim()) out.push(decoded);
  });

  if (parens.length === 0) {
    const hexes = content.match(hexRegex) || [];
    hexes.forEach((token) => {
      const hex = token.slice(1, -1).replace(/\s/g, '');
      if (hex.length % 4 !== 0) return;
      let text = '';
      for (let i = 0; i < hex.length; i += 4) {
        const code = parseInt(hex.slice(i, i + 4), 16);
        if (code > 0 && code < 0xffff) text += String.fromCharCode(code);
      }
      if (text.trim()) out.push(text);
    });
  }

  return out.join(' ');
}

function normalize(text: string): string {
  return text
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('\n')
    .trim();
}
