import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { jwtVerify } from 'jose';
import { isSuperAdminUser } from '@/lib/route-permissions';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-secret-key-change-in-production'
);

interface UserPayload {
  id: number;
  username: string;
  role: string;
  roleId?: number;
  is_super_admin: boolean;
}

async function getAuthUser(request: NextRequest): Promise<UserPayload | null> {
  try {
    // 从 cookie 获取 token
    const token = request.cookies.get('auth_token')?.value;
    if (!token) {
      // 尝试从 header 获取
      const authHeader = request.headers.get('authorization');
      if (authHeader?.startsWith('Bearer ')) {
        const tokenFromHeader = authHeader.substring(7);
        const { payload } = await jwtVerify(tokenFromHeader, JWT_SECRET);
        return {
          id: payload.userId as number,
          username: payload.username as string,
          role: payload.role as string,
          roleId: payload.roleId as number,
          is_super_admin: isSuperAdminUser(payload.role as string, payload.roleId as number)
        };
      }
      return null;
    }

    const { payload } = await jwtVerify(token, JWT_SECRET);
    return {
      id: payload.userId as number,
      username: payload.username as string,
      role: payload.role as string,
      roleId: payload.roleId as number,
      is_super_admin: isSuperAdminUser(payload.role as string, payload.roleId as number)
    };
  } catch (error) {
    console.error('Auth error:', error);
    return null;
  }
}

// POST /api/limit-prices/import - 批量导入限价
export async function POST(request: NextRequest) {
  const supabase = getSupabaseClient();
  const user = await getAuthUser(request);
  
  if (!user) {
    return NextResponse.json({ error: '未授权' }, { status: 401 });
  }
  
  // 权限检查：所有登录用户都可导入
  // if (!user.is_super_admin && user.role !== '公司管理员' && user.role !== '商务') {
  //   return NextResponse.json({ error: '无权限导入' }, { status: 403 });
  // }
  
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json({ error: '请上传文件' }, { status: 400 });
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
    
    const projectMap: Record<string, number> = {};
    (projects || []).forEach((p: { id: number; name: string }) => {
      projectMap[p.name] = p.id;
    });
    
    const errors: string[] = [];
    const successData: any[] = [];
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
        errors.push(`第${i + 1}行: 项目"${projectName}"不存在`);
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
        created_by_name: user.username
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
    
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
