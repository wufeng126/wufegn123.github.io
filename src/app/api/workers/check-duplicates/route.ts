import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * 导入前查重 API
 * 对比 Excel 数据与系统中已存在的数据，返回重复情况
 * 区分：同项目重复 vs 跨项目重复（调岗场景）
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { workers } = body;

    if (!workers || !Array.isArray(workers) || workers.length === 0) {
      return NextResponse.json({ 
        success: false, 
        error: '请提供有效的工人数据' 
      }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 提取所有身份证号和手机号
    const idCards = workers
      .filter((w: any) => w.id_card && w.id_card.trim())
      .map((w: any) => w.id_card.trim().toUpperCase());
    
    const phones = workers
      .filter((w: any) => w.phone && w.phone.trim())
      .map((w: any) => w.phone.trim());

    // 查询已存在的数据
    const existingWorkers = new Map<string, any>();
    
    if (idCards.length > 0) {
      const { data: existingByIdCard, error } = await client
        .from('workers')
        .select('id, name, id_card, phone, work_type, project_id')
        .in('id_card', idCards);

      if (!error && existingByIdCard) {
        for (const w of existingByIdCard) {
          if (w.id_card) {
            existingWorkers.set(w.id_card.toUpperCase(), w);
          }
        }
      }
    }

    // 查找姓名+手机号组合重复的
    const namePhoneMap = new Map<string, any>();
    if (phones.length > 0) {
      const { data: existingByPhone, error } = await client
        .from('workers')
        .select('id, name, id_card, phone, work_type, project_id')
        .in('phone', phones);

      if (!error && existingByPhone) {
        for (const w of existingByPhone) {
          if (w.phone && w.name) {
            const key = `${w.name}_${w.phone}`;
            if (!namePhoneMap.has(key)) {
              namePhoneMap.set(key, w);
            }
          }
        }
      }
    }

    // 分析重复情况 - 区分同项目重复和跨项目重复
    const duplicateByIdCard: Array<{
      row: number;
      excelData: any;
      existingData: any;
      conflictType: string;
      isTransfer: boolean;
      currentProjectName?: string;
      targetProjectName?: string;
    }> = [];

    const duplicateByNamePhone: Array<{
      row: number;
      excelData: any;
      existingData: any;
      conflictType: string;
    }> = [];

    const newData: Array<{ row: number; data: any }> = [];
    const batchDuplicates: Array<{ row: number; data: any; reason: string }> = [];

    // 批次内去重检测
    const batchIdCards = new Set<string>();
    const batchNamePhones = new Set<string>();

    // 获取项目名称映射
    const { data: projectList } = await client
      .from('projects')
      .select('id, name');
    const projectNameMap = new Map<number, string>();
    if (projectList) {
      for (const p of projectList) {
        projectNameMap.set(p.id, p.name);
      }
    }

    for (let i = 0; i < workers.length; i++) {
      const w = workers[i];
      const row = i + 2;

      const idCard = w.id_card?.trim().toUpperCase() || null;
      const name = w.name?.trim() || '';
      const phone = w.phone?.trim() || '';
      const namePhoneKey = `${name}_${phone}`;
      const targetProjectId = w.project_id || null;

      // 批次内身份证号重复
      if (idCard) {
        if (batchIdCards.has(idCard)) {
          batchDuplicates.push({ row, data: w, reason: '身份证号在本次导入中重复' });
          continue;
        }
        batchIdCards.add(idCard);
      }

      // 批次内姓名+手机号重复
      if (name && phone) {
        if (batchNamePhones.has(namePhoneKey)) {
          batchDuplicates.push({ row, data: w, reason: '姓名+手机号在本次导入中重复' });
          continue;
        }
        batchNamePhones.add(namePhoneKey);
      }

      // 检查系统内身份证号重复
      if (idCard && existingWorkers.has(idCard)) {
        const existing = existingWorkers.get(idCard);
        const isTransfer = targetProjectId && existing.project_id && targetProjectId !== existing.project_id;
        
        duplicateByIdCard.push({
          row,
          excelData: w,
          existingData: existing,
          conflictType: isTransfer ? '跨项目重复（调岗）' : '身份证号重复',
          isTransfer: !!isTransfer,
          currentProjectName: existing.project_id ? projectNameMap.get(existing.project_id) : '未分配',
          targetProjectName: targetProjectId ? projectNameMap.get(targetProjectId) : '未分配',
        });
        continue;
      }

      // 检查系统内姓名+手机号重复
      if (namePhoneMap.has(namePhoneKey)) {
        const existing = namePhoneMap.get(namePhoneKey);
        if (!idCard || !existingWorkers.has(idCard)) {
          duplicateByNamePhone.push({
            row,
            excelData: w,
            existingData: existing,
            conflictType: '姓名+手机号重复',
          });
          continue;
        }
      }

      // 新数据
      newData.push({ row, data: w });
    }

    // 分类统计
    const transferCount = duplicateByIdCard.filter(d => d.isTransfer).length;
    const sameProjectDuplicateCount = duplicateByIdCard.filter(d => !d.isTransfer).length;

    const stats = {
      total: workers.length,
      newCount: newData.length,
      duplicateByIdCardCount: duplicateByIdCard.length,
      duplicateByNamePhoneCount: duplicateByNamePhone.length,
      batchDuplicateCount: batchDuplicates.length,
      transferCount,
      sameProjectDuplicateCount,
    };

    // 构建建议
    const suggestions: string[] = [];
    if (transferCount > 0) {
      suggestions.push(`发现 ${transferCount} 条跨项目重复数据（调岗场景），选择「调岗导入」将自动分配到新项目并保留原项目工资记录`);
    }
    if (sameProjectDuplicateCount > 0) {
      suggestions.push(`发现 ${sameProjectDuplicateCount} 条同项目重复数据，可选择「更新」覆盖现有数据或「跳过」保持不变`);
    }
    if (stats.duplicateByNamePhoneCount > 0) {
      suggestions.push(`发现 ${stats.duplicateByNamePhoneCount} 条姓名+手机号重复数据，请确认是否为同一人`);
    }
    if (stats.batchDuplicateCount > 0) {
      suggestions.push(`Excel 内有 ${stats.batchDuplicateCount} 条重复数据，将被跳过`);
    }

    // 构建导入选项
    const importOptions: Array<{ value: string; label: string; description: string; disabled: boolean }> = [];

    // 跳过重复
    importOptions.push({ 
      value: 'skip', 
      label: '跳过重复', 
      description: `跳过 ${stats.duplicateByIdCardCount} 条重复数据，仅新增 ${stats.newCount} 条新数据`,
      disabled: stats.newCount === 0
    });

    // 覆盖更新
    importOptions.push({ 
      value: 'upsert', 
      label: '覆盖更新', 
      description: `更新 ${stats.duplicateByIdCardCount} 条重复数据，新增 ${stats.newCount} 条新数据`,
      disabled: stats.newCount === 0 && stats.duplicateByIdCardCount === 0
    });

    // 调岗导入 - 仅当有跨项目重复时显示
    if (transferCount > 0) {
      importOptions.push({ 
        value: 'transfer', 
        label: '调岗导入', 
        description: `${transferCount} 人自动调岗到新项目（保留原项目工资记录），${sameProjectDuplicateCount} 人覆盖更新，${stats.newCount} 人新增`,
        disabled: false
      });
    }

    // 取消导入
    importOptions.push({ 
      value: 'cancel', 
      label: '取消导入', 
      description: '放弃本次导入，返回修改数据',
      disabled: false
    });

    return NextResponse.json({
      success: true,
      stats,
      duplicates: {
        byIdCard: duplicateByIdCard.slice(0, 100),
        byNamePhone: duplicateByNamePhone.slice(0, 100),
        batchDuplicates: batchDuplicates.slice(0, 100),
        transfers: duplicateByIdCard.filter(d => d.isTransfer).slice(0, 100),
      },
      suggestions,
      canImport: stats.newCount > 0 || stats.duplicateByIdCardCount > 0,
      importOptions,
    });

  } catch (error: any) {
    console.error('[Workers Check Duplicates] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || '查重失败' },
      { status: 500 }
    );
  }
}
