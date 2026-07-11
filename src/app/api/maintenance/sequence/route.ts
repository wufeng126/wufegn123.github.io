import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function POST() {
  try {
    const client = getSupabaseClient();
    
    // 需要维护序列的表列表
    const tables = [
      'projects',
      'workers', 
      'worker_salaries',
      'work_items',
      'work_item_subitems',
      'client_reports',
      'client_payments',
      'visas',
      'notifications',
      'visa_attachments',
    ];
    
    const results: Record<string, { success: boolean; oldSeq?: number; newSeq?: number; message?: string }> = {};
    
    for (const table of tables) {
      try {
        // 获取序列名
        const seqName = `${table}_id_seq`;
        
        // 获取最大ID
        const { data: maxData } = await client
          .from(table)
          .select('id')
          .order('id', { ascending: false })
          .limit(1);
        
        const maxId = maxData?.[0]?.id || 0;
        const newSeqValue = maxId + 1;
        
        // 直接使用 SQL 重置序列 (通过 RPC 调用)
        const { error } = await client.rpc('execute_sql', {
          sql_text: `SELECT setval('${seqName}', ${newSeqValue}, true)`
        });
        
        if (error) {
          // 如果 RPC 不可用，尝试直接查询当前序列
          results[table] = { success: false, message: `无法维护序列: ${error.message}` };
        } else {
          results[table] = { success: true, message: `序列已重置为 ${newSeqValue}` };
        }
      } catch (err: any) {
        results[table] = { success: false, message: err.message };
      }
    }
    
    return NextResponse.json({
      success: true,
      message: '序列维护完成',
      results
    });
  } catch (error: any) {
    console.error('序列维护失败:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
