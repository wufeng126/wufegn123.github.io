import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { auditLog } from '@/lib/audit-log';

// 不限制手机号、身份证号、银行卡号格式，仅做非空判断

// 记录导入历史
async function recordImportHistory(
  client: any,
  data: {
    file_name: string;
    total_count: number;
    success_count: number;
    update_count: number;
    skip_count: number;
    error_count: number;
    import_mode: string;
    operator?: string;
    error_details?: any[];
  }
) {
  try {
    const { error } = await client
      .from('worker_import_history')
      .insert({
        file_name: data.file_name,
        total_count: data.total_count,
        success_count: data.success_count,
        update_count: data.update_count,
        skip_count: data.skip_count,
        error_count: data.error_count,
        import_mode: data.import_mode,
        operator: data.operator || '系统',
        error_details: data.error_details || null,
      });
    
    if (error) {
      console.error('[Workers Batch] Failed to record import history:', error);
    }
  } catch (err) {
    console.error('[Workers Batch] Error recording import history:', err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      workers, 
      importMode = 'insert_only', // insert_only: 仅新增, upsert: 覆盖更新
      projectId,
      fileName = '未知文件',
      operator,
    } = body;
    const defaultProjectId = projectId ? Number(projectId) : null;

    console.log('[Workers Batch] Received request with', workers?.length || 0, 'workers, mode:', importMode);

    if (!workers || !Array.isArray(workers) || workers.length === 0) {
      return NextResponse.json({ 
        success: false, 
        error: '请提供有效的工人数据' 
      }, { status: 400 });
    }

    const client = getSupabaseClient();

    const { data: projectList } = await client
      .from('projects')
      .select('id, name');
    const projectIdByName = new Map<string, number>();
    if (projectList) {
      for (const p of projectList) {
        projectIdByName.set(String(p.name).trim(), p.id);
      }
    }

    const resolveProjectId = (worker: any) => {
      if (worker.project_id) return Number(worker.project_id);
      if (worker.projectId) return Number(worker.projectId);
      const projectName = worker.project_name?.trim();
      if (projectName && projectIdByName.has(projectName)) {
        return projectIdByName.get(projectName)!;
      }
      return defaultProjectId;
    };
    
    // 结果统计
    const stats = {
      total: workers.length,
      inserted: 0,
      updated: 0,
      transferred: 0,
      skipped: 0,
      errors: 0,
      errorDetails: [] as Array<{ row: number; name: string; reason: string }>,
    };

    // 数据校验与预处理
    const validData: Array<{
      row: number;
      data: any;
      id_card_upper?: string;
    }> = [];

    for (let i = 0; i < workers.length; i++) {
      const w = workers[i];
      const row = i + 2; // Excel行号（第1行是标题）
      
      // 必填项校验
      if (!w.name || !w.name.trim()) {
        stats.errors++;
        stats.errorDetails.push({ row, name: '', reason: '姓名为必填项，不能为空' });
        continue;
      }

      validData.push({
        row,
        data: {
          name: w.name.trim(),
          work_type: w.work_type?.trim() || null,
          id_card: w.id_card?.trim().toUpperCase() || null,
          phone: w.phone?.trim() || null,
          bank_card: w.bank_card?.trim() || null,
          entry_date: w.entry_date?.trim() || null,
          project_id: resolveProjectId(w),
        },
        id_card_upper: w.id_card?.trim().toUpperCase() || null,
      });
    }

    console.log('[Workers Batch] Valid data count:', validData.length, 'Errors:', stats.errors);

    if (validData.length === 0) {
      await recordImportHistory(client, {
        file_name: fileName,
        total_count: stats.total,
        success_count: 0,
        update_count: 0,
        skip_count: 0,
        error_count: stats.errors,
        import_mode: importMode,
        operator,
        error_details: stats.errorDetails,
      });

      return NextResponse.json({
        success: false,
        message: '没有有效数据可导入',
        stats: {
          total: stats.total,
          inserted: 0,
          updated: 0,
          skipped: 0,
          errors: stats.errors,
        },
        errorDetails: stats.errorDetails.slice(0, 20), // 只返回前20条错误
      }, { status: 400 });
    }

    // 获取已存在的工人数据（按身份证号）
    const idCardsToCheck = validData
      .filter(d => d.id_card_upper)
      .map(d => d.id_card_upper);

    const existingWorkersMap = new Map<string, any>();
    
    if (idCardsToCheck.length > 0) {
      const { data: existingWorkers, error: queryError } = await client
        .from('workers')
        .select('id, name, id_card, phone, project_id')
        .in('id_card', idCardsToCheck);

      if (queryError) {
        console.error('[Workers Batch] Query existing workers error:', queryError);
      } else if (existingWorkers) {
        for (const w of existingWorkers) {
          if (w.id_card) {
            existingWorkersMap.set(w.id_card.toUpperCase(), w);
          }
        }
      }
    }

    // 分离新增、更新和调岗数据
    const toInsert: any[] = [];
    const toUpdate: Array<{ id: number; data: any }> = [];
    const toTransfer: Array<{ id: number; data: any; old_project_id: number | null }> = [];
    const batchErrors: Array<{ row: number; name: string; reason: string }> = [];

    // 批次内身份证号去重
    const batchIdCards = new Set<string>();

    for (const item of validData) {
      const { row, data, id_card_upper } = item;

      // 检查批次内身份证号重复
      if (id_card_upper) {
        if (batchIdCards.has(id_card_upper)) {
          batchErrors.push({ row, name: data.name, reason: '身份证号在本次导入中重复' });
          stats.errors++;
          continue;
        }
        batchIdCards.add(id_card_upper);
      }

      const existing = id_card_upper ? existingWorkersMap.get(id_card_upper) : null;

      if (existing) {
        if (importMode === 'transfer') {
          // 调岗模式：将工人分配到新项目
          const newProjectId = data.project_id;
          if (newProjectId && newProjectId !== existing.project_id) {
            toTransfer.push({ id: existing.id, data, old_project_id: existing.project_id });
          } else {
            // 同项目则跳过
            batchErrors.push({ row, name: data.name, reason: '该项目已有此工人记录（已跳过）' });
            stats.skipped++;
          }
        } else if (importMode === 'upsert') {
          // 覆盖更新模式
          toUpdate.push({ id: existing.id, data });
        } else {
          // 仅新增模式，跳过重复
          batchErrors.push({ row, name: data.name, reason: '身份证号已存在（已跳过）' });
          stats.skipped++;
        }
      } else {
        toInsert.push(data);
      }
    }

    stats.errorDetails.push(...batchErrors);

    console.log('[Workers Batch] To insert:', toInsert.length, 'To update:', toUpdate.length, 'To transfer:', toTransfer.length, 'Skipped:', stats.skipped);

    // 执行新增
    if (toInsert.length > 0) {
      const BATCH_SIZE = 50;
      for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
        const batch = toInsert.slice(i, i + BATCH_SIZE);
        
        try {
          const { data, error } = await client
            .from('workers')
            .insert(batch)
            .select();

          if (error) {
            console.error(`[Workers Batch] Insert error for batch:`, error);
            // 批量失败时逐条插入
            for (const worker of batch) {
              try {
                const { data: singleData, error: singleError } = await client
                  .from('workers')
                  .insert(worker)
                  .select()
                  .maybeSingle();

                if (singleError) {
                  // 将错误信息转换为中文
                  let errorMsg = singleError.message || '未知错误';
                  if (errorMsg.includes('duplicate key')) {
                    errorMsg = '身份证号已存在';
                  } else if (errorMsg.includes('violates unique constraint')) {
                    errorMsg = '数据重复，已跳过';
                  }
                  
                  console.error(`[Workers Batch] Failed to insert worker ${worker.name}:`, singleError.message);
                  stats.skipped++;
                  stats.errorDetails.push({ row: 0, name: worker.name, reason: errorMsg });
                } else if (singleData) {
                  stats.inserted++;
                }
              } catch (singleCatchError: any) {
                console.error(`[Workers Batch] Exception for worker ${worker.name}:`, singleCatchError);
                stats.skipped++;
                stats.errorDetails.push({ row: 0, name: worker.name, reason: '插入失败，已跳过' });
              }
            }
          } else if (data) {
            stats.inserted += data.length;
          }
        } catch (batchError: any) {
          console.error(`[Workers Batch] Batch insert exception:`, batchError);
          // 整批异常时逐条尝试
          for (const worker of batch) {
            try {
              const { data: singleData, error: singleError } = await client
                .from('workers')
                .insert(worker)
                .select()
                .maybeSingle();

              if (singleError) {
                let errorMsg = singleError.message || '未知错误';
                if (errorMsg.includes('duplicate key')) {
                  errorMsg = '身份证号已存在';
                } else if (errorMsg.includes('violates unique constraint')) {
                  errorMsg = '数据重复，已跳过';
                }
                stats.skipped++;
                stats.errorDetails.push({ row: 0, name: worker.name, reason: errorMsg });
              } else if (singleData) {
                stats.inserted++;
              }
            } catch {
              stats.skipped++;
              stats.errorDetails.push({ row: 0, name: worker.name, reason: '插入失败，已跳过' });
            }
          }
        }
      }
    }

    // 执行更新
    if (toUpdate.length > 0) {
      for (const item of toUpdate) {
        const { error } = await client
          .from('workers')
          .update({
            name: item.data.name,
            work_type: item.data.work_type,
            phone: item.data.phone,
            bank_card: item.data.bank_card,
            project_id: item.data.project_id,
          })
          .eq('id', item.id);

        if (error) {
          console.error(`[Workers Batch] Failed to update worker ${item.data.name}:`, error.message);
          stats.errors++;
          stats.errorDetails.push({ row: 0, name: item.data.name, reason: `更新失败: ${error.message}` });
        } else {
          stats.updated++;
        }
      }
    }

    // 执行调岗：将工人分配到新项目
    if (toTransfer.length > 0) {
      const supabase = getSupabaseClient();
      for (const item of toTransfer) {
        try {
          const newProjectId = item.data.project_id;
          
          // 1. 检查目标项目是否已有分配记录
          const { data: existingAssignment } = await supabase
            .from('worker_assignments')
            .select('id, status')
            .eq('worker_id', item.id)
            .eq('project_id', newProjectId)
            .maybeSingle();

          if (existingAssignment) {
            // 目标项目已有记录，恢复为 active
            await supabase
              .from('worker_assignments')
              .update({ status: 'active', end_date: null })
              .eq('id', existingAssignment.id);
          } else {
            // 创建新项目分配记录
            await supabase
              .from('worker_assignments')
              .insert({
                worker_id: item.id,
                project_id: newProjectId,
                start_date: item.data.entry_date || new Date().toISOString().split('T')[0],
                status: 'active',
              });
          }

          // 2. 旧项目分配设为 left
          if (item.old_project_id) {
            await supabase
              .from('worker_assignments')
              .update({ status: 'left', end_date: new Date().toISOString().split('T')[0] })
              .eq('worker_id', item.id)
              .eq('project_id', item.old_project_id)
              .eq('status', 'active');
          }

          // 3. 更新工人主表的 project_id 为新项目
          await supabase
            .from('workers')
            .update({ project_id: newProjectId })
            .eq('id', item.id);

          stats.transferred = (stats.transferred || 0) + 1;
        } catch (error: any) {
          stats.errors++;
          stats.errorDetails.push({ row: 0, name: item.data.name, reason: `调岗失败: ${error.message}` });
        }
      }
    }

    // 记录导入历史
    await recordImportHistory(client, {
      file_name: fileName,
      total_count: stats.total,
      success_count: stats.inserted + stats.transferred,
      update_count: stats.updated,
      skip_count: stats.skipped,
      error_count: stats.errors,
      import_mode: importMode,
      operator,
      error_details: stats.errorDetails.length > 100 ? stats.errorDetails.slice(0, 100) : stats.errorDetails,
    });

    // 构建结果消息
    const messageParts: string[] = [];
    if (stats.inserted > 0) messageParts.push(`成功新增 ${stats.inserted} 人`);
    if (stats.updated > 0) messageParts.push(`成功更新 ${stats.updated} 人`);
    if ((stats.transferred || 0) > 0) messageParts.push(`成功调岗 ${stats.transferred} 人`);
    if (stats.skipped > 0) messageParts.push(`跳过重复 ${stats.skipped} 条`);
    if (stats.errors > 0) messageParts.push(`格式错误 ${stats.errors} 条`);

    // 只要成功导入了数据，就算成功
    const hasSuccess = stats.inserted > 0 || stats.updated > 0 || stats.transferred > 0;
    let resultMessage = '';
    
    if (hasSuccess) {
      resultMessage = `批量导入完成，${messageParts.join('，')}`;
    } else if (stats.skipped > 0 && stats.errors === 0) {
      resultMessage = `导入完成，跳过 ${stats.skipped} 条重复数据`;
    } else if (stats.errors > 0) {
      resultMessage = `导入完成，${stats.errors} 条数据格式错误`;
    } else {
      resultMessage = '导入完成，无数据变更';
    }

    console.log('[Workers Batch] Import completed:', resultMessage);

    await auditLog({
      operationType: stats.inserted > 0 ? 'create' : 'update',
      resourceType: 'worker',
      resourceId: 0,
      details: { action: 'batch_import', stats, fileName },
      request,
    });

    return NextResponse.json({
      success: hasSuccess,
      message: resultMessage,
      stats: {
        total: stats.total,
        inserted: stats.inserted,
        updated: stats.updated,
        transferred: stats.transferred,
        skipped: stats.skipped,
        errors: stats.errors,
      },
      errorDetails: stats.errorDetails.slice(0, 50), // 返回前50条错误详情
    });

  } catch (error: any) {
    console.error('[Workers Batch] API Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || '导入失败，请稍后重试' },
      { status: 500 }
    );
  }
}
