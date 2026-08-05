import { NextRequest, NextResponse } from 'next/server';
import { FetchClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';
import { requirePermission } from '@/lib/api-auth';

const MAX_FETCH_TEXT_LENGTH = 120_000;
const MAX_FETCH_LINKS = 200;

function isBlockedIpv4(hostname: string) {
  const parts = hostname.split('.').map(part => Number(part));
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }

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
  const blockedHosts = new Set(['localhost', '0.0.0.0', '::1', '[::1]']);
  if (blockedHosts.has(hostname) || hostname.endsWith('.local') || isBlockedIpv4(hostname)) {
    return { ok: false, error: 'Private or local network URLs are not allowed.' };
  }

  return { ok: true, url: parsed.toString() };
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
