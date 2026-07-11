import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 身份证号校验（18位）
function validateIdCard(idCard: string | null): { valid: boolean; message?: string; type: 'valid' | 'invalid' | 'empty' | 'duplicate' } {
  if (!idCard) return { valid: true, type: 'empty' }; // 非必填
  
  const cleaned = idCard.trim().toUpperCase();
  if (!/^\d{17}[\dX]$/.test(cleaned)) {
    return { valid: false, message: '身份证号格式不正确（应为18位）', type: 'invalid' };
  }
  
  // 校验码验证
  const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  const checkCodes = ['1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2'];
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    sum += parseInt(cleaned[i]) * weights[i];
  }
  const checkCode = checkCodes[sum % 11];
  if (cleaned[17] !== checkCode) {
    return { valid: false, message: '身份证号校验码不正确', type: 'invalid' };
  }
  
  return { valid: true, type: 'valid' };
}

// 手机号校验
function validatePhone(phone: string | null): { valid: boolean; message?: string; type: 'valid' | 'invalid' | 'empty' } {
  if (!phone) return { valid: true, type: 'empty' }; // 非必填
  
  const cleaned = phone.trim();
  if (!/^1[3-9]\d{9}$/.test(cleaned)) {
    return { valid: false, message: '手机号格式不正确（应为11位有效号码）', type: 'invalid' };
  }
  
  return { valid: true, type: 'valid' };
}

// 银行卡号校验（16-19位数字）
function validateBankCard(bankCard: string | null): { valid: boolean; message?: string; type: 'valid' | 'invalid' | 'empty' } {
  if (!bankCard) return { valid: true, type: 'empty' }; // 非必填
  
  const cleaned = bankCard.trim();
  if (!/^\d{16,19}$/.test(cleaned)) {
    return { valid: false, message: '银行卡号格式不正确（应为16-19位数字）', type: 'invalid' };
  }
  
  return { valid: true, type: 'valid' };
}

// 检测疑似测试数据
function isTestData(name: string): { isTest: boolean; reason?: string } {
  const testPatterns = [
    /测试/i,
    /test/i,
    /demo/i,
    /示例/i,
    /^张三$/,
    /^李四$/,
    /^王五$/,
  ];
  
  for (const pattern of testPatterns) {
    if (pattern.test(name)) {
      return { isTest: true, reason: `疑似测试数据（匹配规则: ${pattern.source}）` };
    }
  }
  
  return { isTest: false };
}

export async function GET(request: NextRequest) {
  try {
    const client = getSupabaseClient();
    
    // 获取所有工人数据
    const { data: workers, error } = await client
      .from('workers')
      .select('id, name, work_type, id_card, phone, bank_card, project_id, status, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`查询工人数据失败: ${error.message}`);
    }

    const total = workers?.length || 0;
    
    // 问题分类统计
    const issues = {
      testData: [] as Array<{ id: number; name: string; reason: string }>,
      invalidIdCard: [] as Array<{ id: number; name: string; id_card: string; message: string }>,
      invalidPhone: [] as Array<{ id: number; name: string; phone: string; message: string }>,
      invalidBankCard: [] as Array<{ id: number; name: string; bank_card: string; message: string }>,
      missingProject: [] as Array<{ id: number; name: string }>,
      noIdCard: [] as Array<{ id: number; name: string }>,
      noPhone: [] as Array<{ id: number; name: string }>,
      noBankCard: [] as Array<{ id: number; name: string }>,
      duplicateIdCard: [] as Array<{ id: number; name: string; id_card: string; count: number }>,
      duplicatePhone: [] as Array<{ id: number; name: string; phone: string; count: number }>,
    };

    // 身份证号重复检测
    const idCardMap = new Map<string, number[]>();
    const phoneMap = new Map<string, number[]>();
    
    workers?.forEach((worker: any) => {
      if (worker.id_card) {
        const key = worker.id_card.toUpperCase();
        if (!idCardMap.has(key)) {
          idCardMap.set(key, []);
        }
        idCardMap.get(key)!.push(worker.id);
      }
      
      if (worker.phone) {
        const key = worker.phone.trim();
        if (!phoneMap.has(key)) {
          phoneMap.set(key, []);
        }
        phoneMap.get(key)!.push(worker.id);
      }
    });

    // 逐条检查
    workers?.forEach((worker: any) => {
      // 检测测试数据
      const testCheck = isTestData(worker.name);
      if (testCheck.isTest) {
        issues.testData.push({
          id: worker.id,
          name: worker.name,
          reason: testCheck.reason || '疑似测试数据',
        });
      }
      
      // 检测身份证号
      const idCardResult = validateIdCard(worker.id_card);
      if (worker.id_card && !idCardResult.valid) {
        issues.invalidIdCard.push({
          id: worker.id,
          name: worker.name,
          id_card: worker.id_card,
          message: idCardResult.message || '身份证号无效',
        });
      } else if (!worker.id_card) {
        issues.noIdCard.push({ id: worker.id, name: worker.name });
      }
      
      // 检测手机号
      const phoneResult = validatePhone(worker.phone);
      if (worker.phone && !phoneResult.valid) {
        issues.invalidPhone.push({
          id: worker.id,
          name: worker.name,
          phone: worker.phone,
          message: phoneResult.message || '手机号无效',
        });
      } else if (!worker.phone) {
        issues.noPhone.push({ id: worker.id, name: worker.name });
      }
      
      // 检测银行卡号
      const bankCardResult = validateBankCard(worker.bank_card);
      if (worker.bank_card && !bankCardResult.valid) {
        issues.invalidBankCard.push({
          id: worker.id,
          name: worker.name,
          bank_card: worker.bank_card,
          message: bankCardResult.message || '银行卡号无效',
        });
      } else if (!worker.bank_card) {
        issues.noBankCard.push({ id: worker.id, name: worker.name });
      }
      
      // 检测缺少项目关联
      if (!worker.project_id) {
        issues.missingProject.push({ id: worker.id, name: worker.name });
      }
    });

    // 处理重复身份证号
    idCardMap.forEach((ids, idCard) => {
      if (ids.length > 1) {
        const affectedWorkers = workers?.filter((w: any) => ids.includes(w.id)) || [];
        affectedWorkers.forEach((w: any) => {
          issues.duplicateIdCard.push({
            id: w.id,
            name: w.name,
            id_card: idCard,
            count: ids.length,
          });
        });
      }
    });

    // 处理重复手机号
    phoneMap.forEach((ids, phone) => {
      if (ids.length > 1) {
        const affectedWorkers = workers?.filter((w: any) => ids.includes(w.id)) || [];
        affectedWorkers.forEach((w: any) => {
          issues.duplicatePhone.push({
            id: w.id,
            name: w.name,
            phone: phone,
            count: ids.length,
          });
        });
      }
    });

    // 统计健康数据
    const healthyCount = total - new Set([
      ...issues.testData.map(i => i.id),
      ...issues.invalidIdCard.map(i => i.id),
      ...issues.invalidPhone.map(i => i.id),
      ...issues.invalidBankCard.map(i => i.id),
    ]).size;

    // 按项目统计
    const projectStats = new Map<string, { total: number; issues: number }>();
    workers?.forEach((worker: any) => {
      const projectName = worker.project_id ? `项目${worker.project_id}` : '未分配项目';
      if (!projectStats.has(projectName)) {
        projectStats.set(projectName, { total: 0, issues: 0 });
      }
      const stats = projectStats.get(projectName)!;
      stats.total++;
      
      // 检查是否有问题
      const hasIssue = issues.testData.some(i => i.id === worker.id) ||
        issues.invalidIdCard.some(i => i.id === worker.id) ||
        issues.invalidPhone.some(i => i.id === worker.id) ||
        issues.invalidBankCard.some(i => i.id === worker.id);
      if (hasIssue) {
        stats.issues++;
      }
    });

    // 生成清洗建议
    const recommendations: string[] = [];
    
    if (issues.testData.length > 0) {
      recommendations.push(`建议删除 ${issues.testData.length} 条测试数据`);
    }
    if (issues.invalidIdCard.length > 0) {
      recommendations.push(`建议修复 ${issues.invalidIdCard.length} 条身份证号格式错误`);
    }
    if (issues.invalidPhone.length > 0) {
      recommendations.push(`建议修复 ${issues.invalidPhone.length} 条手机号格式错误`);
    }
    if (issues.invalidBankCard.length > 0) {
      recommendations.push(`建议修复 ${issues.invalidBankCard.length} 条银行卡号格式错误`);
    }
    if (issues.duplicateIdCard.length > 0) {
      recommendations.push(`建议处理 ${issues.duplicateIdCard.length} 条身份证号重复记录（涉及 ${new Set(issues.duplicateIdCard.map(i => i.id_card)).size} 个身份证号）`);
    }
    if (issues.duplicatePhone.length > 0) {
      recommendations.push(`建议处理 ${issues.duplicatePhone.length} 条手机号重复记录（涉及 ${new Set(issues.duplicatePhone.map(i => i.phone)).size} 个手机号）`);
    }
    if (issues.missingProject.length > 0) {
      recommendations.push(`建议为 ${issues.missingProject.length} 条无项目关联的记录分配项目`);
    }

    return NextResponse.json({
      summary: {
        total,
        healthyCount,
        issueCount: total - healthyCount,
        healthRate: total > 0 ? ((healthyCount / total) * 100).toFixed(1) : '100.0',
      },
      issues: {
        testData: issues.testData.slice(0, 20), // 限制返回数量
        testDataCount: issues.testData.length,
        invalidIdCard: issues.invalidIdCard.slice(0, 20),
        invalidIdCardCount: issues.invalidIdCard.length,
        invalidPhone: issues.invalidPhone.slice(0, 20),
        invalidPhoneCount: issues.invalidPhone.length,
        invalidBankCard: issues.invalidBankCard.slice(0, 20),
        invalidBankCardCount: issues.invalidBankCard.length,
        missingProject: issues.missingProject.slice(0, 20),
        missingProjectCount: issues.missingProject.length,
        noIdCard: issues.noIdCard.slice(0, 20),
        noIdCardCount: issues.noIdCard.length,
        noPhone: issues.noPhone.slice(0, 20),
        noPhoneCount: issues.noPhone.length,
        noBankCard: issues.noBankCard.slice(0, 20),
        noBankCardCount: issues.noBankCard.length,
        duplicateIdCard: issues.duplicateIdCard.slice(0, 20),
        duplicateIdCardCount: issues.duplicateIdCard.length,
        duplicatePhone: issues.duplicatePhone.slice(0, 20),
        duplicatePhoneCount: issues.duplicatePhone.length,
      },
      projectStats: Object.fromEntries(projectStats),
      recommendations,
    });
  } catch (error: any) {
    console.error('Data clean error:', error);
    return NextResponse.json(
      { error: error.message || '分析失败' },
      { status: 500 }
    );
  }
}

// 执行清洗操作
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, ids } = body;
    
    const client = getSupabaseClient();
    
    if (action === 'deleteTestData' && ids?.length > 0) {
      const { error } = await client
        .from('workers')
        .delete()
        .in('id', ids);
      
      if (error) {
        throw new Error(`删除失败: ${error.message}`);
      }
      
      return NextResponse.json({
        success: true,
        message: `成功删除 ${ids.length} 条测试数据`,
        deletedCount: ids.length,
      });
    }
    
    return NextResponse.json(
      { error: '无效的操作' },
      { status: 400 }
    );
  } catch (error: any) {
    console.error('Clean action error:', error);
    return NextResponse.json(
      { error: error.message || '操作失败' },
      { status: 500 }
    );
  }
}
