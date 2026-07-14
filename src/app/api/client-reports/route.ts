import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { auditLog, insertWithSequenceFix } from '@/lib/audit-log';
import { isReviewedStatus, isVoidedStatus, REVIEW_STATUS, validateStatusTransition } from '@/lib/business-logic';
import { requireApiWritePermission, requireAuth } from '@/lib/api-auth';
import { getAccessibleProjectIds } from '@/lib/api-project-access';

// 安全解析 numeric 类型（PostgreSQL numeric 返回对象格式）
function parseNumeric(value: any): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return parseFloat(value) || 0;
  // 处理 { "$numberDecimal": "123.45" } 格式
  if (typeof value === 'object' && '$numberDecimal' in value) {
    return parseFloat(value.$numberDecimal) || 0;
  }
  // 处理其他对象格式
  if (typeof value === 'object') {
    try {
      const str = String(value);
      const num = parseFloat(str);
      if (!isNaN(num)) return num;
      const match = str.match(/-?\d+\.?\d*/);
      if (match) return parseFloat(match[0]) || 0;
    } catch (e) {}
  }
  return 0;
}

// 计算税务信息
function calculateTaxInfo(invoiceAmount: number, taxRate: number) {
  if (!invoiceAmount || invoiceAmount <= 0 || !taxRate || taxRate < 0) {
    return {
      untaxedIncome: 0,
      taxAmount: 0,
    };
  }
  
  // 不含税收入 = 开票金额 / (1 + 税率 / 100)
  const untaxedIncome = invoiceAmount / (1 + taxRate / 100);
  // 税费 = 开票金额 − 不含税收入
  const taxAmount = invoiceAmount - untaxedIncome;
  
  return {
    untaxedIncome: Math.round(untaxedIncome * 100) / 100,
    taxAmount: Math.round(taxAmount * 100) / 100,
  };
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const projectId = searchParams.get('project_id');
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;
    
    // 创建 Supabase 客户端
    const client = getSupabaseClient();
    
    // 获取用户可访问的项目列表
    const accessibleProjects = await getAccessibleProjectIds(client, auth.user);
    
    let query = client
      .from('client_reports')
      .select(`
        id,
        settlement_amount,
        invoice_amount,
        deduction_amount,
        proportional_payment,
        tax_rate,
        report_amount,
        report_date,
        remark,
        project_id,
        status,
        reviewed_at,
        reviewed_by,
        projects (
          name
        )
      `)
      .order('report_date', { ascending: false });

    // 项目过滤
    if (projectId && projectId !== 'all') {
      // 前端指定了具体项目
      const pid = parseInt(projectId);
      // 如果用户有可访问项目限制，且指定项目不在其中，则无权限
      if (accessibleProjects && !accessibleProjects.includes(pid)) {
        return NextResponse.json({ reports: [], totalSettlement: '0', totalInvoice: '0', totalDeduction: '0', totalProportional: '0', totalUntaxedIncome: '0', totalTaxAmount: '0', chartData: [] });
      }
      query = query.eq('project_id', pid);
    } else if (accessibleProjects !== null) {
      // 用户有可访问项目限制
      query = query.in('project_id', accessibleProjects);
    }

    const { data, error } = await query;
    const activeData = (data || []).filter((record: any) => !isVoidedStatus(record.status));

    if (error) {
      throw new Error(`查询产值结算失败: ${error.message}`);
    }

    // 计算汇总
    let totalSettlement = 0;
    let totalInvoice = 0;
    let totalDeduction = 0;
    let totalProportional = 0;
    let totalUntaxedIncome = 0;
    let totalTaxAmount = 0;
    
    activeData.forEach((record: any) => {
      const invoice = parseNumeric(record.invoice_amount);
      const taxRate = parseNumeric(record.tax_rate) || 9;
      
      totalSettlement += parseNumeric(record.settlement_amount) || parseNumeric(record.report_amount);
      totalInvoice += invoice;
      totalDeduction += parseNumeric(record.deduction_amount);
      totalProportional += parseNumeric(record.proportional_payment);
      
      const taxInfo = calculateTaxInfo(invoice, taxRate);
      totalUntaxedIncome += taxInfo.untaxedIncome;
      totalTaxAmount += taxInfo.taxAmount;
    });

    // 按时间线统计图表数据
    const timeMap = new Map<string, number>();
    activeData.forEach((record: any) => {
      const date = record.report_date?.split('T')[0] || '未知日期';
      const current = timeMap.get(date) || 0;
      timeMap.set(date, current + (parseNumeric(record.settlement_amount) || parseNumeric(record.report_amount)));
    });

    const chartData = Array.from(timeMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, settlement]) => ({
        date,
        结算金额: settlement,
      }));

    // 格式化返回数据
    const reports = data?.map((record: any) => {
      const invoiceAmount = parseNumeric(record.invoice_amount);
      const taxRate = parseNumeric(record.tax_rate) || 9;
      const taxInfo = calculateTaxInfo(invoiceAmount, taxRate);
      
      return {
        id: record.id,
        project_id: record.project_id,
        project_name: (record.projects as any)?.name || '未知项目',
        settlement_amount: parseNumeric(record.settlement_amount) || parseNumeric(record.report_amount),
        report_amount: parseNumeric(record.settlement_amount) || parseNumeric(record.report_amount),
        invoice_amount: invoiceAmount,
        deduction_amount: parseNumeric(record.deduction_amount),
        proportional_payment: parseNumeric(record.proportional_payment),
        tax_rate: record.tax_rate || 9,
        untaxed_income: taxInfo.untaxedIncome,
        tax_amount: taxInfo.taxAmount,
        report_date: record.report_date,
        remark: record.remark,
        status: record.status || REVIEW_STATUS.DRAFT,
        reviewed_at: record.reviewed_at,
        reviewed_by: record.reviewed_by,
      };
    }) || [];

    return NextResponse.json({ 
      reports,
      totalSettlement: totalSettlement.toFixed(2),
      totalInvoice: totalInvoice.toFixed(2),
      totalDeduction: totalDeduction.toFixed(2),
      totalProportional: totalProportional.toFixed(2),
      totalUntaxedIncome: totalUntaxedIncome.toFixed(2),
      totalTaxAmount: totalTaxAmount.toFixed(2),
      chartData
    });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error.message || '查询失败' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const body = await request.json();
    
    // 支持批量录入
    const records = Array.isArray(body) ? body : [body];
    
    const client = getSupabaseClient();
    
    const insertData = records.map(record => {
      const { 
        project_id, 
        work_content,
        quantity,
        unit,
        unit_price,
        report_amount,
        settlement_amount, // 结算金额，可能作为报量金额使用
        invoice_amount,
        deduction_amount,
        proportional_payment,
        tax_rate,
        report_date,
        remark 
      } = record;
      
      const projectId = parseInt(project_id);
      
      // 自动计算报量金额：优先使用 report_amount，否则用 settlement_amount，最后用 quantity * unit_price
      const computedReportAmount = report_amount 
        ? Number(report_amount) 
        : (settlement_amount ? Number(settlement_amount) 
          : (quantity && unit_price ? Number(quantity) * Number(unit_price) : null));

      return {
        project_id: projectId,
        work_content: work_content || null,
        quantity: quantity ? Number(quantity) : null,
        unit: unit || null,
        unit_price: unit_price ? Number(unit_price) : null,
        report_amount: computedReportAmount,
        report_date,
        remark: remark || null,
        // 以下字段前端可能传入
        invoice_amount: invoice_amount ? Number(invoice_amount) : null,
        deduction_amount: deduction_amount ? Number(deduction_amount) : null,
        proportional_payment: proportional_payment ? Number(proportional_payment) : null,
        tax_rate: tax_rate ? Number(tax_rate) : null,
        status: REVIEW_STATUS.DRAFT,
      };
    }).filter(item => item.project_id && item.report_date && item.report_amount !== null && item.report_amount !== undefined);

    if (insertData.length === 0) {
      return NextResponse.json({ error: '请提供有效的报量数据（项目、日期、报量金额必填）' }, { status: 400 });
    }

    const { data, error } = await insertWithSequenceFix('client_reports', insertData, client);

    if (error) {
      throw new Error(`创建结算记录失败: ${error.message}`);
    }

    // 记录审计日志
    await auditLog({
      operationType: 'create',
      resourceType: 'client_report',
      details: { count: insertData.length, projectIds: [...new Set(insertData.map(r => r.project_id))] },
      request,
    });

    return NextResponse.json({ reports: data, count: data?.length || 0 });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error.message || '创建失败' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const { id, settlement_amount, invoice_amount, deduction_amount, proportional_payment, tax_rate, report_date, remark, status } = body;

    if (!id) {
      return NextResponse.json({ error: '缺少记录ID' }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 查询当前记录
    const { data: currentData, error: fetchError } = await client
      .from('client_reports')
      .select('status')
      .eq('id', parseInt(id))
      .single();
    
    if (fetchError || !currentData) {
      return NextResponse.json({ error: '记录不存在' }, { status: 404 });
    }

    if (isVoidedStatus(currentData.status)) {
      return NextResponse.json({ error: '已作废记录不可修改' }, { status: 400 });
    }

    const updateData: any = {
      settlement_amount: settlement_amount || null,
      invoice_amount: invoice_amount || null,
      deduction_amount: deduction_amount || null,
      proportional_payment: proportional_payment || null,
      tax_rate: tax_rate ?? 9,
      report_amount: settlement_amount, // 兼容旧字段
      report_date,
      remark,
    };

    // 状态流转校验
    if (status !== undefined) {
      const validation = validateStatusTransition(currentData.status || REVIEW_STATUS.DRAFT, status);
      if (!validation.valid) {
        return NextResponse.json({ error: validation.message || '状态流转不合法' }, { status: 400 });
      }
      updateData.status = status;
      if (status === REVIEW_STATUS.REVIEWED) {
        updateData.reviewed_at = new Date().toISOString();
        updateData.reviewed_by = auth.user.name || auth.user.username || 'system';
      } else if (status === REVIEW_STATUS.DRAFT) {
        updateData.reviewed_at = null;
        updateData.reviewed_by = null;
      }
    }

    // 已审核记录不允许修改金额（需先反审核）
    if (isReviewedStatus(currentData.status) && (settlement_amount !== undefined || invoice_amount !== undefined) && status !== REVIEW_STATUS.DRAFT) {
      return NextResponse.json({ error: '已审核记录不可修改金额，请先反审核' }, { status: 400 });
    }

    const { data, error } = await client
      .from('client_reports')
      .update(updateData)
      .eq('id', parseInt(id))
      .select();

    if (error) {
      throw new Error(`更新结算记录失败: ${error.message}`);
    }

    return NextResponse.json({ report: data?.[0] });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error.message || '更新失败' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: '缺少记录ID' }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 检查状态：已审核记录不可删除
    const { data: record } = await client
      .from('client_reports')
      .select('status')
      .eq('id', parseInt(id))
      .single();
    
    if (isReviewedStatus(record?.status)) {
      return NextResponse.json({ error: '已审核记录不可删除，请先反审核' }, { status: 400 });
    }

    const { error } = await client
      .from('client_reports')
      .delete()
      .eq('id', parseInt(id));

    if (error) {
      throw new Error(`删除结算记录失败: ${error.message}`);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error.message || '删除失败' },
      { status: 500 }
    );
  }
}
