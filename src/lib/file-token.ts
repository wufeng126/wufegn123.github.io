import { createHmac, timingSafeEqual } from 'crypto';

/**
 * 文件短时访问令牌（HMAC 签名）。
 * 用途：钉钉内置浏览器/手机 webview 打开 PDF 时无法携带 Authorization 头，
 *      用带签名的短时 URL 让钉钉直接打开原件。
 * 安全：仅对单个文件有效、10 分钟过期；仅在 /api/vouchers/files/ 与
 *      /api/labor-analysis/attachments/ 两个只读文件接口上允许 URL 传参。
 */

function secret() {
  return process.env.FILE_TOKEN_SECRET || process.env.JWT_SECRET || 'dsh-file-token-fallback-secret';
}

function sign(payload: string) {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

export function createFileToken(fileId: number, ttlSeconds = 600) {
  const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = `${fileId}.${expires}`;
  return `${payload}.${sign(payload)}`;
}

export function verifyFileToken(token: string, fileId: number) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return false;
  const [idPart, expiresPart, signature] = parts;
  if (Number(idPart) !== Number(fileId)) return false;
  const expires = Number(expiresPart);
  if (!Number.isFinite(expires) || expires < Math.floor(Date.now() / 1000)) return false;
  const expected = sign(`${idPart}.${expiresPart}`);
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}
