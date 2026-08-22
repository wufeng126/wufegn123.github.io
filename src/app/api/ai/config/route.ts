import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getAIConfig, clearAIConfigCache } from '@/lib/ai-service';
import { requirePermission } from '@/lib/api-auth';
import { getErrorMessage } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

// GET /api/ai/config - 获取AI配置
export async function GET() {
  const config = await getAIConfig();
  if (!config) {
    // 区分"表不存在"与"表存在但未配置"，给出明确诊断
    let diagnostic = '未配置';
    try {
      const { data, error } = await getSupabaseClient()
        .from('ai_configs')
        .select('id')
        .limit(1)
        .maybeSingle();
      if (error) diagnostic = '配置表不存在：请在 Supabase 执行迁移 migrations/create_ai_tables.sql';
      else if (!data) diagnostic = '未初始化：请到本页面填写 API 密钥/地址/模型后保存';
    } catch {
      diagnostic = '配置表不存在：请在 Supabase 执行迁移 migrations/create_ai_tables.sql';
    }
    return NextResponse.json({
      success: true,
      data: { enabled: false, model_id: 'doubao-seed-2-0-lite-260215' },
      diagnostic,
    });
  }
  // Ensure all fields have valid non-null values to avoid React controlled/uncontrolled warnings
  const safeConfig: Record<string, any> = { ...config };
  // Mask sensitive fields
  safeConfig.api_key = config.api_key ? '******' : '';
  safeConfig.api_endpoint = config.api_endpoint || '';
  // Ensure booleans and numbers are never null/undefined
  const boolFields = ['enabled', 'module_data_query', 'module_report_analysis', 'module_error_diagnosis', 'module_doc_generation', 'module_supplier_analysis', 'module_salary_analysis', 'module_visa_assistant', 'content_filter_enabled', 'mask_sensitive', 'offline_fallback_enabled'];
  for (const f of boolFields) { safeConfig[f] = safeConfig[f] ?? false; }
  const numFields = ['max_context_length', 'daily_limit', 'temperature'];
  for (const f of numFields) { safeConfig[f] = safeConfig[f] ?? 0; }
  safeConfig.model_id = safeConfig.model_id || '';
  return NextResponse.json({ success: true, data: safeConfig });
}

// PUT /api/ai/config - 更新AI配置
export async function PUT(request: NextRequest) {
  try {
    const auth = await requirePermission(request, 'system:ai_manage');
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const supabase = getSupabaseClient();

    // 检查是否已有配置
    const { data: existing } = await supabase.from('ai_configs').select('id').limit(1).single();

    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    // 允许更新的字段
    const allowedFields = [
      'model_id', 'api_endpoint', 'max_context_length', 'daily_limit',
      'temperature', 'enabled', 'module_data_query', 'module_report_analysis',
      'module_error_diagnosis', 'module_doc_generation', 'module_supplier_analysis',
      'module_salary_analysis', 'module_visa_assistant', 'content_filter_enabled',
      'mask_sensitive', 'offline_fallback_enabled',
    ];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    // api_key 单独处理，不更新占位符
    if (body.api_key && body.api_key !== '******') {
      updateData.api_key = body.api_key;
    }

    let result;
    if (existing?.id) {
      result = await supabase.from('ai_configs').update(updateData).eq('id', existing.id).select().single();
    } else {
      result = await supabase.from('ai_configs').insert(updateData).select().single();
    }

    if (result.error) {
      return NextResponse.json({ success: false, error: getErrorMessage(result.error, '保存AI配置失败') }, { status: 500 });
    }

    clearAIConfigCache();
    const safeResult: Record<string, any> = { ...result.data };
    safeResult.api_key = result.data.api_key ? '******' : '';
    safeResult.api_endpoint = result.data.api_endpoint || '';
    const boolFields = ['enabled', 'module_data_query', 'module_report_analysis', 'module_error_diagnosis', 'module_doc_generation', 'module_supplier_analysis', 'module_salary_analysis', 'module_visa_assistant', 'content_filter_enabled', 'mask_sensitive', 'offline_fallback_enabled'];
    for (const f of boolFields) { safeResult[f] = safeResult[f] ?? false; }
    const numFields = ['max_context_length', 'daily_limit', 'temperature'];
    for (const f of numFields) { safeResult[f] = safeResult[f] ?? 0; }
    safeResult.model_id = safeResult.model_id || '';
    return NextResponse.json({ success: true, data: safeResult });
  } catch (e: unknown) {
    return NextResponse.json({ success: false, error: getErrorMessage(e, '保存AI配置失败') }, { status: 500 });
  }
}
