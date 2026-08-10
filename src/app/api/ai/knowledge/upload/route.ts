import { NextRequest, NextResponse } from 'next/server';
import { KnowledgeClient, FetchClient, Config, DataSourceType } from 'coze-coding-dev-sdk';
import { OSSStorage } from '@/lib/oss-storage';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { extractForwardHeaders } from '@/lib/ai-service';
import { upsertKnowledgeQualityTag } from '@/lib/knowledge-taxonomy';

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
const SUPPORTED_EXTENSIONS = /\.(pdf|docx?|xlsx?|pptx?|txt|csv|md|epub|mobi|xml|jpe?g|png|webp|bmp)$/i;
const IMAGE_EXTENSIONS = /\.(jpe?g|png|webp|bmp)$/i;

/** 用 LLM 多模态能力对扫描件图片做 OCR 提取（需配置支持视觉的模型，如 Doubao） */
async function ocrImageWithLLM(imageUrl: string, forwardHeaders: Record<string, string>): Promise<{ text: string; error?: string }> {
  try {
    const { getAIConfig, createConfiguredLLMClient } = await import('@/lib/ai-service');
    const config = await getAIConfig();
    if (!config?.enabled) return { text: '', error: 'AI 未启用，无法识别扫描件' };

    const client = await createConfiguredLLMClient(forwardHeaders);
    if (!client) return { text: '', error: 'AI 未配置密钥，无法识别扫描件' };

    const stream = await client.stream([
      {
        role: 'system',
        content: '你是建筑合同扫描件 OCR 助手。请完整提取图片中的全部文字，保留合同条款、清单表格（项目/数量/单位/单价/金额）结构，按原文顺序输出纯文本，不要解释、不要省略。',
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: '请识别这张合同扫描件图片中的所有文字内容：' },
          { type: 'image_url', image_url: { url: imageUrl } },
        ],
      },
    ], {
      model: config.model_id,
      temperature: 0,
    });

    let text = '';
    for await (const chunk of stream) {
      const part = chunk as { content?: unknown; text?: unknown };
      if (typeof part === 'string') text += part;
      else if (typeof part?.content === 'string') text += part.content;
      else if (typeof part?.text === 'string') text += part.text;
      else if (part?.content && Array.isArray(part.content)) {
        text += (part.content as unknown[]).map((item: unknown) => {
          const record = item as { text?: unknown; content?: unknown };
          return String(record?.text || record?.content || '');
        }).join('');
      }
    }
    const cleaned = text.trim();
    if (!cleaned) return { text: '', error: '模型未返回内容，可能不支持图片识别' };
    return { text: cleaned };
  } catch (e: any) {
    console.warn('[Knowledge Upload] OCR failed:', e?.message || e);
    return { text: '', error: `扫描件识别失败：${e?.message || '模型不支持图片识别'}（可换支持视觉的模型，如 Doubao）` };
  }
}

export async function POST(request: NextRequest) {
  try {
    // 权限检查：仅管理员+财务+项目经理可上传合同文件
    const userRole = request.headers.get('x-user-role') || 'team_leader';
    if (!['super_admin', 'admin', 'finance', 'project_manager'].includes(userRole)) {
      return NextResponse.json({ success: false, error: '您无权上传文件到知识库' }, { status: 403 });
    }

    const forwardHeaders = extractForwardHeaders(request.headers);
    const formData = await request.formData();

    // 支持多文件上传：files[] 字段，同时兼容单文件 file 字段
    const files = formData.getAll('files') as File[];
    const singleFile = formData.get('file') as File | null;
    const category = (formData.get('category') as string) || 'contract';
    const fileArray = files.length > 0 ? files : singleFile ? [singleFile] : [];

    if (fileArray.length === 0) {
      return NextResponse.json({ success: false, error: '请选择文件' }, { status: 400 });
    }

    if (fileArray.length > 10) {
      return NextResponse.json({ success: false, error: '单次最多上传10个文件' }, { status: 400 });
    }

    const results: Array<{
      title: string;
      fileName: string;
      fileSize: number;
      contentLength: number;
      chunkCount: number;
      status: string;
      extracted: boolean;
      id?: string;
      error?: string;
    }> = [];

    const storage = new OSSStorage();

    const config = new Config();
    const knowledgeClient = new KnowledgeClient(config, forwardHeaders);
    const supabase = getSupabaseClient();

    for (const file of fileArray) {
      try {
        // Validate file extension
        if (!SUPPORTED_EXTENSIONS.test(file.name)) {
          results.push({
            title: file.name, fileName: file.name, fileSize: file.size,
            contentLength: 0, chunkCount: 0, status: 'error', extracted: false,
            error: `不支持的文件类型`,
          });
          continue;
        }

        // Validate file size
        if (file.size > MAX_FILE_SIZE) {
          results.push({
            title: file.name, fileName: file.name, fileSize: file.size,
            contentLength: 0, chunkCount: 0, status: 'error', extracted: false,
            error: `文件大小超过20MB限制`,
          });
          continue;
        }

        const fileName = file.name;
        const docTitle = fileName.replace(/\.[^/.]+$/, '');

        // Step 1: Upload to object storage
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const storageKey = await storage.uploadFile({
          fileContent: buffer,
          fileName: `ai-knowledge/${Date.now()}-${fileName}`,
          contentType: file.type || 'application/octet-stream',
        });

        // Step 2: Extract text via FetchClient
        let extractedContent = '';
        try {
          const signedUrl = await storage.generatePresignedUrl({
            key: storageKey,
            expireTime: 3600,
          });
          const fetchClient = new FetchClient(config, forwardHeaders);
          const fetchResult = await fetchClient.fetch(signedUrl);
          if (fetchResult?.content) {
            extractedContent = fetchResult.content
              .filter((item: { type: string; text?: string }) => item.type === 'text' && item.text)
              .map((item: { text?: string }) => item.text || '')
              .join('\n');
          }
        } catch (fetchError) {
          console.warn('[Knowledge Upload] FetchClient extract failed:', fetchError);
        }

        // Step 2.5: 扫描件兜底——文本提取为空/过短时，图片走 LLM 视觉 OCR，PDF 提示转图片
        let ocrError = '';
        if (!extractedContent || extractedContent.trim().length < 30) {
          const signedUrl = await storage.generatePresignedUrl({
            key: storageKey,
            expireTime: 3600,
          });
          if (IMAGE_EXTENSIONS.test(fileName)) {
            const ocrResult = await ocrImageWithLLM(signedUrl, forwardHeaders);
            if (ocrResult.text) {
              extractedContent = `【扫描件 OCR 识别】\n${ocrResult.text}`;
            } else {
              ocrError = ocrResult.error || '扫描件识别失败';
            }
          } else if (/\.pdf$/i.test(fileName)) {
            // PDF 无法直接转图片（无渲染依赖），提示用户转图片/文字版
            const wasScanned = !extractedContent || extractedContent.trim().length === 0;
            if (wasScanned) {
              ocrError = '该 PDF 未提取到文字（可能是扫描件）。请将扫描件转换为图片（jpg/png）或文字版 PDF 后重新上传，AI 才能识别内容。';
            }
          }
        }

        // Step 3: Add to knowledge base
        let knowledgeDocIds: string[] = [];
        try {
          if (extractedContent) {
            const documents = [{ source: DataSourceType.TEXT, raw_data: extractedContent }];
            const addResponse = await knowledgeClient.addDocuments(documents, 'coze_doc_knowledge');
            if (addResponse.code === 0) {
              knowledgeDocIds = addResponse.doc_ids || [];
            }
          }
        } catch (kbError) {
          console.error('[Knowledge Upload] Knowledge add failed:', kbError);
        }

        // Step 4: Save document record
        const { data: docRecord } = await supabase
          .from('ai_knowledge_docs')
          .insert({
            title: docTitle,
            category,
            source_type: 'upload',
            source_ref: storageKey,
            content: extractedContent || '',
            file_key: storageKey,
            file_name: fileName,
            file_size: file.size,
            tags: upsertKnowledgeQualityTag([], '已整理'),
            chunk_count: knowledgeDocIds.length,
            status: extractedContent ? 'active' : 'error',
            dataset_name: 'coze_doc_knowledge',
          })
          .select()
          .single();

        results.push({
          id: docRecord?.id,
          title: docTitle,
          fileName,
          fileSize: file.size,
          contentLength: extractedContent.length,
          chunkCount: knowledgeDocIds.length,
          status: extractedContent ? 'active' : 'error',
          extracted: extractedContent.length > 0,
          error: (!extractedContent && ocrError) ? ocrError : undefined,
        });
      } catch (fileError) {
        const msg = fileError instanceof Error ? fileError.message : '文件处理失败';
        results.push({
          title: file.name, fileName: file.name, fileSize: file.size,
          contentLength: 0, chunkCount: 0, status: 'error', extracted: false, error: msg,
        });
      }
    }

    const successCount = results.filter(r => r.status === 'active').length;
    const failCount = results.filter(r => r.status === 'error').length;

    return NextResponse.json({
      success: true,
      data: {
        total: fileArray.length,
        successCount,
        failCount,
        results,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '文件上传失败';
    console.error('[Knowledge Upload] Error:', error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
