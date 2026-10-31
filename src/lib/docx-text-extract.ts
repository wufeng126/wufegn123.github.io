import zlib from 'zlib';

/**
 * 轻量 DOCX 文字提取（无第三方依赖）
 *
 * DOCX 本质是 zip：取出 word/document.xml，去掉标签后按段落换行。
 * 用于"上传合同后提问合同条款"——Word 版合同是常见格式，解析可靠。
 */
export function extractDocxText(buffer: Buffer): string {
  try {
    const xml = readZipEntry(buffer, 'word/document.xml');
    if (!xml) return '';
    return normalize(decodeXml(xml));
  } catch {
    return '';
  }
}

/** 从 zip 中读取指定条目的原始内容（支持 store / deflate） */
function readZipEntry(buffer: Buffer, entryName: string): string {
  const nameBuffer = Buffer.from(entryName);
  let offset = 0;
  while (offset < buffer.length - 4) {
    const signature = buffer.readUInt32LE(offset);
    // 中央目录条目
    if (signature !== 0x02014b50) {
      offset += 1;
      continue;
    }
    const compression = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + fileNameLength);

    if (name.equals(nameBuffer)) {
      // 定位本地文件头，跳过文件名与扩展字段得到数据起点
      if (buffer.readUInt32LE(localHeaderOffset) !== 0x04034b50) return '';
      const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
      const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
      const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
      const data = buffer.subarray(dataStart, dataStart + compressedSize);
      if (compression === 0) return data.toString('utf8');
      return zlib.inflateRawSync(data).toString('utf8');
    }

    offset += 46 + fileNameLength + extraLength + commentLength;
  }
  return '';
}

function decodeXml(xml: string): string {
  return xml
    .replace(/<w:tab[^>]*\/>/g, '\t')
    .replace(/<w:br[^>]*\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_all, code: string) => String.fromCharCode(Number(code)));
}

function normalize(text: string): string {
  return text
    .replace(/\r/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}
