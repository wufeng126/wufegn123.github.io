import zlib from 'zlib';

/**
 * 从 PDF 中直接抽取内嵌的页面图片（扫描件通常是 DCTDecode 的 JPEG 或 FlateDecode 的位图）。
 *
 * 为什么不用 pdf.js / canvas：生产环境没有渲染器，安装原生依赖风险高。
 * 扫描件 PDF 每页本身就是一张图，直接把图取出来交给多模态模型 OCR 即可。
 *
 * 返回 data URI 列表（最多 maxImages 张），可直接作为 LLM 视觉输入。
 */
export function extractPdfImages(buffer: Buffer, maxImages = 8): string[] {
  const images: string[] = [];
  const raw = buffer.toString('latin1');
  const imageRegex = /\/Subtype\s*\/Image/g;
  let match: RegExpExecArray | null;

  while ((match = imageRegex.exec(raw)) !== null && images.length < maxImages) {
    // 找到该图片对象字典的起点，回溯最近的 "obj"
    const dictStart = raw.lastIndexOf('obj', match.index);
    if (dictStart < 0) continue;
    const dict = raw.slice(dictStart, match.index + 400);
    const streamIndex = raw.indexOf('stream', match.index);
    if (streamIndex < 0) continue;
    const endStreamIndex = raw.indexOf('endstream', streamIndex);
    if (endStreamIndex < 0) continue;

    // 数据起点：stream 关键字后跳过换行
    let dataStart = streamIndex + 'stream'.length;
    if (raw[dataStart] === '\r') dataStart += 1;
    if (raw[dataStart] === '\n') dataStart += 1;
    const data = buffer.subarray(dataStart, endStreamIndex);
    if (data.length < 1024) continue; // 太小的多半是图标/遮罩

    const filter = /\/Filter\s*(\[[^\]]*\]|\/\w+)/.exec(dict)?.[1] || '';
    const width = Number(/\/Width\s+(\d+)/.exec(dict)?.[1] || 0);
    const height = Number(/\/Height\s+(\d+)/.exec(dict)?.[1] || 0);
    const colorSpace = /\/ColorSpace\s*(\/\w+)/.exec(dict)?.[1] || '';
    const bits = Number(/\/BitsPerComponent\s+(\d+)/.exec(dict)?.[1] || 8);

    if (/DCTDecode/.test(filter)) {
      // 已经是 JPEG，直接用
      images.push(`data:image/jpeg;base64,${data.toString('base64')}`);
      continue;
    }

    if (/FlateDecode/.test(filter) && width > 0 && height > 0 && bits === 8) {
      try {
        const pixels = zlib.inflateSync(data);
        const channels = /DeviceRGB|CalRGB/.test(colorSpace) ? 3 : /DeviceGray/.test(colorSpace) ? 1 : 3;
        const expected = width * height * channels;
        if (pixels.length < expected) continue;
        const png = encodePng(pixels.subarray(0, expected), width, height, channels);
        images.push(`data:image/png;base64,${png.toString('base64')}`);
      } catch {
        // 解压失败跳过
      }
    }
  }

  return images;
}

/** 极简 PNG 编码（8bit 灰度/RGB，filter=0） */
function encodePng(pixels: Buffer, width: number, height: number, channels: 1 | 3): Buffer {
  const colorType = channels === 3 ? 2 : 0;
  const raw = Buffer.alloc((width * channels + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * channels + 1);
    raw[rowStart] = 0;
    pixels.copy(raw, rowStart + 1, y * width * channels, (y + 1) * width * channels);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = colorType;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, 'latin1');
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let crc = -1;
  for (let i = 0; i < buffer.length; i += 1) {
    crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ -1) >>> 0;
}
