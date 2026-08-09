import { NextRequest, NextResponse } from 'next/server';
import { FetchClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';
import { requirePermission } from '@/lib/api-auth';
import net from 'net';
import dns from 'dns/promises';

const MAX_FETCH_TEXT_LENGTH = 120_000;
const MAX_FETCH_LINKS = 200;

/** 判断 IP 是否为私网/保留地址（支持 IPv4、IPv6、IPv4-mapped IPv6） */
function isPrivateIpAddress(ip: string): boolean {
  // IPv4-mapped IPv6（::ffff:127.0.0.1）→ 归一化为 IPv4 判断
  const normalized = ip.startsWith('::ffff:') ? ip.slice(7) : ip;

  if (net.isIPv4(normalized)) {
    const parts = normalized.split('.').map(Number);
    const [first, second] = parts;
    return (
      first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      first >= 224
    );
  }

  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    return (
      lower === '::' ||
      lower === '::1' ||
      lower.startsWith('fe80:') ||
      lower.startsWith('fc') ||
      lower.startsWith('fd') ||
      lower.startsWith('::ffff:') // IPv4-mapped，已在上方归一化处理，此处兜底
    );
  }

  return false;
}

function isBlockedHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (['localhost', '0.0.0.0', '::1', '[::1]'].includes(lower) || lower.endsWith('.local')) {
    return true;
  }
  // hostname 本身就是 IP（含 IPv6）→ 直接按私网判断
  if (net.isIP(hostname)) {
    return isPrivateIpAddress(hostname);
  }
  return false;
}

function validateFetchUrl(rawUrl: unknown): { ok: true; url: string } | { ok: false; error: string } {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
    return { ok: false, error: 'Please provide a URL.' };
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return { ok: false, error: 'Invalid URL.' };
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return { ok: false, error: 'Only HTTP/HTTPS URLs are supported.' };
  }

  if (parsed.username || parsed.password) {
    return { ok: false, error: 'URLs with credentials are not allowed.' };
  }

  const hostname = parsed.hostname.toLowerCase();
  if (isBlockedHostname(hostname)) {
    return { ok: false, error: 'Private or local network URLs are not allowed.' };
  }

  return { ok: true, url: parsed.toString() };
}

/** DNS 预解析校验：域名解析出的任一 IP 为私网则拒绝（缓解 DNS rebinding） */
async function validateDnsNotPrivate(hostname: string): Promise<string | null> {
  try {
    const records = await dns.lookup(hostname, { all: true });
    for (const record of records) {
      if (isPrivateIpAddress(record.address)) {
        return `DNS 解析到内网地址（${record.address}），已阻止`;
      }
    }
    return null;
  } catch {
    // 解析失败交由实际抓取流程处理（可能是域名不存在）
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission(request, 'system:ai_manage');
    if (!auth.ok) return auth.response;

    const { url } = await request.json();
    const validation = validateFetchUrl(url);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    // DNS 预解析校验（域名目标）
    const parsedUrl = new URL(validation.url);
    if (!net.isIP(parsedUrl.hostname)) {
      const dnsError = await validateDnsNotPrivate(parsedUrl.hostname);
      if (dnsError) {
        return NextResponse.json({ error: dnsError }, { status: 400 });
      }
    }

    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const config = new Config();
    const client = new FetchClient(config, customHeaders);

    const response = await client.fetch(validation.url);

    if (response.status_code !== 0) {
      return NextResponse.json({
        error: response.status_message || 'Fetch failed',
        status_code: response.status_code,
      }, { status: 500 });
    }

    const textContent = response.content
      .filter((item: any) => item.type === 'text')
      .map((item: any) => item.text)
      .join('\n')
      .slice(0, MAX_FETCH_TEXT_LENGTH);

    const links = response.content
      .filter((item: any) => item.type === 'link')
      .map((item: any) => item.url)
      .slice(0, MAX_FETCH_LINKS);

    return NextResponse.json({
      title: response.title,
      url: response.url,
      textContent,
      links,
      rawContent: response.content.slice(0, MAX_FETCH_LINKS),
    });
  } catch (error: any) {
    console.error('Fetch URL error:', error);
    return NextResponse.json({ error: error.message || 'Fetch failed' }, { status: 500 });
  }
}
