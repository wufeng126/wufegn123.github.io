/**
 * 上传前图片压缩（浏览器端）
 *
 * 目的：现场照片原图 3~8MB，压缩后通常 <500KB，直接降低 OSS 存储与流量成本，也加快页面加载。
 * 规则：
 * - 只处理 image/*（pdf、excel、csv 原样返回）
 * - 长边超过 maxSize 才缩放，避免二次损失
 * - 已经是小图（<300KB）直接返回原文件
 * - 输出 jpeg 质量 0.8（肉眼几乎无差别）
 * - 失败时回退原文件（绝不阻断上传）
 */
export async function compressImageFile(
  file: File,
  options: { maxSize?: number; quality?: number; minBytes?: number } = {},
): Promise<File> {
  const { maxSize = 1600, quality = 0.8, minBytes = 300 * 1024 } = options;
  try {
    if (!file.type.startsWith('image/')) return file;
    if (file.type === 'image/gif' || file.type === 'image/svg+xml') return file;
    if (file.size <= minBytes) return file;

    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    if (scale === 1 && file.size <= 800 * 1024) {
      bitmap.close?.();
      return file;
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close?.();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob || blob.size >= file.size) return file;

    const newName = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], newName, { type: 'image/jpeg', lastModified: Date.now() });
  } catch {
    return file;
  }
}

/** 批量压缩（用于多选上传） */
export async function compressImageFiles(files: File[], options?: { maxSize?: number; quality?: number }): Promise<File[]> {
  return Promise.all(files.map((file) => compressImageFile(file, options)));
}
