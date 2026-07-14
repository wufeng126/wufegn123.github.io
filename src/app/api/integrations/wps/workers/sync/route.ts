import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { syncWpsWorkerRecord } from '@/lib/wps-worker-sync';

export async function POST(request: NextRequest) {
  try {
    const client = getSupabaseClient();
    
    // Get all active bindings
    const { data: bindings, error } = await client
      .from('wps_project_bindings')
      .select('*, projects(name)')
      .eq('is_active', true);
    
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
    
    if (!bindings || bindings.length === 0) {
      return NextResponse.json({ 
        success: false, 
        error: '没有启用的 WPS 绑定配置' 
      }, { status: 400 });
    }
    
    // For now, we just update the sync status since we can't actually fetch from WPS API
    // In a real implementation, you would need WPS API credentials to fetch data
    const results = [];
    const now = new Date().toISOString();
    
    for (const binding of bindings) {
      // Update sync status
      await client
        .from('wps_project_bindings')
        .update({
          last_sync_at: now,
          last_sync_status: 'warning',
          last_sync_message: '手动同步功能需要配置 WPS API 凭证，当前仅支持 Webhook 推送同步'
        })
        .eq('id', binding.id);
      
      results.push({
        binding_id: binding.id,
        project_name: binding.projects?.name || '未知项目',
        worksheet_name: binding.worksheet_name,
        status: 'warning',
        message: '需要配置 WPS API 凭证才能主动拉取数据'
      });
    }
    
    return NextResponse.json({
      success: true,
      message: '同步状态已更新，请查看结果',
      results
    });
    
  } catch (err) {
    return NextResponse.json({ 
      success: false, 
      error: err instanceof Error ? err.message : '同步失败' 
    }, { status: 500 });
  }
}
