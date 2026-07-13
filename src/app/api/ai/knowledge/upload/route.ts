import { NextRequest, NextResponse } from 'next/server';
import { KnowledgeClient, FetchClient, Config, DataSourceType, S3Storage } from 'coze-coding-dev-sdk';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { extractForwardHeaders } from '@/lib/ai-service';
import { upsertKnowledgeQualityTag } from '@/lib/knowledge-taxonomy';

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
const SUPPORTED_EXTENSIONS = /\.(pdf|docx?|xlsx?|pptx?|txt|csv|md|epub|mobi|xml)$/i;

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

    const storage = new S3Storage({
      endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
      accessKey: '',
      secretKey: '',
      bucketName: process.env.COZE_BUCKET_NAME,
      region: 'cn-beijing',
    });

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
