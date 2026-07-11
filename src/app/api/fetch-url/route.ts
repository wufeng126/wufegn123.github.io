import { NextRequest, NextResponse } from 'next/server';
import { FetchClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();
    
    if (!url) {
      return NextResponse.json({ error: '请提供 URL' }, { status: 400 });
    }

    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const config = new Config();
    const client = new FetchClient(config, customHeaders);

    const response = await client.fetch(url);

    if (response.status_code !== 0) {
      return NextResponse.json({ 
        error: response.status_message || '获取内容失败',
        status_code: response.status_code 
      }, { status: 500 });
    }

    // 提取文本内容
    const textContent = response.content
      .filter((item: any) => item.type === 'text')
      .map((item: any) => item.text)
      .join('\n');

    // 提取链接
    const links = response.content
      .filter((item: any) => item.type === 'link')
      .map((item: any) => item.url);

    return NextResponse.json({
      title: response.title,
      url: response.url,
      textContent,
      links,
      rawContent: response.content,
    });
  } catch (error: any) {
    console.error('Fetch URL error:', error);
    return NextResponse.json({ error: error.message || '获取内容失败' }, { status: 500 });
  }
}
