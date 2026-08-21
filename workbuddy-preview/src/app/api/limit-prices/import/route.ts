import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getRequestAuthUser, type RequestAuthUser } from '@/lib/auth';
import { getUserDisplayName } from '@/lib/user-display-name';
import { requireApiWritePermission } from '@/lib/api-auth';
import { getAccessibleProjectIds } from '@/lib/api-project-access';

type UserPayload = RequestAuthUser;

type LimitPriceImportRecord = {
  project_id: number;
  subitem_name: string;
  unit: string;
  limit_unit_price: number;
  plan_quantity: number;
  work_type: string | null;
  team_name: string | null;
  remark: string | null;
  status: string;
  created_by: number;
  created_by_name: string;
};

async function getAuthUser(request: NextRequest): Promise<UserPayload | null> {
  return getRequestAuthUser(request);
}

// POST /api/limit-prices/import - 批量导入限价
export async function POST(request: NextRequest) {
  const supabase = getSupabaseClient();
  const auth = await requireApiWritePermission(request);
  if (!auth.ok) {
    return auth.response;
  }
  const user = await getAuthUser(request);
  
  if (!user) {
    return NextResponse.json({ error: '未授权' }, { status: 401 });
  }
  
  try {
    const operatorName = getUserDisplayName(user);
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json({ error: '请上传文件' }, { status: 400 });
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: '文件过大，请上传 10MB 以内的文件' }, { status: 400 });
    }

    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith('.csv')) {
      return NextResponse.json({ error: '请上传 CSV 文件' }, { status: 400 });
    }
    
    const text = await file.text();
    const lines = text.trim().split('\n');
    
    if (lines.length < 2) {
      return NextResponse.json({ error: '文件内容为空或格式不正确' }, { status: 400 });
    }
    
    // 解析 CSV
    const parseCSVLine = (line: string) => {
      const result = [];
      let current = '';
      let inQuotes = false;
      
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result;
    };
    
    // 获取项目映射
    const { data: projects } = await supabase
      .from('projects')
      .select('id, name');

    const accessibleProjects = await getAccessibleProjectIds(supabase, user);
    
    const projectMap: Record<string, number> = {};
    (projects || []).forEach((p: { id: number; name: string }) => {
      if (!accessibleProjects || accessibleProjects.includes(p.id)) {
        projectMap[p.name] = p.id;
      }
    });
    
    const errors: string[] = [];
    const successData: LimitPriceImportRecord[] = [];
    let successCount = 0;
    
    // 跳过标题行
    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      
      if (values.length < 5) {
        errors.push(`第${i + 1}行: 列数不足`);
        continue;
      }
      
      const [
        projectName,
        subitemName,
        unit,
        limitPrice,
        planQty,
        workType,
        teamName,
        remark
      ] = values;
      
      // 验证必填项
      if (!projectName) {
        errors.push(`第${i + 1}行: 项目名称不能为空`);
        continue;
      }
      
      if (!subitemName) {
        errors.push(`第${i + 1}行: 劳务子项名称不能为空`);
        continue;
      }
      
      if (!unit) {
        errors.push(`第${i + 1}行: 单位不能为空`);
        continue;
      }
      
      if (!limitPrice || isNaN(parseFloat(limitPrice))) {
        errors.push(`第${i + 1}行: 限价单价格式不正确`);
        continue;
      }
      
      if (!planQty || isNaN(parseFloat(planQty))) {
        errors.push(`第${i + 1}行: 计划工程量格式不正确`);
        continue;
      }
      
      const projectId = projectMap[projectName];
      if (!projectId) {
        errors.push(`第${i + 1}行: 项目"${projectName}"不存在或无权限导入`);
        continue;
      }
      
      successData.push({
        project_id: projectId,
        subitem_name: subitemName,
        unit: unit,
        limit_unit_price: parseFloat(limitPrice),
        plan_quantity: parseFloat(planQty),
        work_type: workType || null,
        team_name: teamName || null,
        remark: remark || null,
        status: '草稿',
        created_by: user.id,
        created_by_name: operatorName
      });
    }
    
    // 批量插入
    if (successData.length > 0) {
      const { error: insertError } = await supabase
        .from('project_limit_prices')
        .insert(successData);
      
      if (insertError) {
        return NextResponse.json({ 
          error: `导入失败: ${insertError.message}`,
          errors 
        }, { status: 500 });
      }
      
      successCount = successData.length;
    }
    
    return NextResponse.json({
      success: true,
      message: `成功导入 ${successCount} 条数据`,
      successCount,
      errorCount: errors.length,
      errors: errors.slice(0, 20) // 最多返回20条错误
    });
    
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '导入失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
