import { createHmac, timingSafeEqual } from 'crypto';

/**
 * 文件短时访问令牌（HMAC 签名，无需查库）。
 * 用途：iframe / 内嵌预览环境下第三方 Cookie 可能被浏览器拦截，
 *      此时无法携带登录 Cookie，改用带签名的短时 URL 访问文件。
 */

function secret() {
  return process.env.FILE_TOKEN_SECRET || process.env.JWT_SECRET || 'dsh-file-token-fallback-secret';
}

function sign(payload: string) {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

export function createFileToken(fileId: number, ttlSeconds = 3600) {
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
