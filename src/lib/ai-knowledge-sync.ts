/**
 * AI 知识库同步模块
 * 将业务数据同步到向量知识库，供 AI 助手检索使用
 */

import { createClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export interface SyncResult {
  workers: number;
  suppliers: number;
  projects: number;
  certificates: number;
  settlements: number;
  supplierSettlements: number;
  visas: number;
  clientPayments: number;
  supplierPayments: number;
  errors: string[];
}

// 业务数据分类
const BUSINESS_DATA_CATEGORIES = {
  WORKER_SALARY: 'worker_salary',
  SUPPLIER: 'supplier',
  PROJECT: 'project',
  CERTIFICATE: 'certificate',
  SETTLEMENT: 'settlement',
  SUPPLIER_SETTLEMENT: 'supplier_settlement',
  VISA: 'visa',
  CLIENT_PAYMENT: 'client_payment',
  SUPPLIER_PAYMENT: 'supplier_payment',
} as const;

/**
 * 添加/更新知识库文档
 */
async function addKnowledgeDoc(
  supabase: any,
  doc: {
    title: string;
    category: string;
    source_type: string;
    source_ref: string;
    content: string;
    status?: string;
  },
  customHeaders?: Record<string, string>
): Promise<string | null> {
  // 先查询是否已存在
  const { data: existing } = await supabase
    .from('ai_knowledge_docs')
    .select('id')
    .eq('source_ref', doc.source_ref)
    .eq('source_type', doc.source_type)
    .single();

  if (existing) {
    // 更新
    const { data, error } = await supabase
      .from('ai_knowledge_docs')
      .update({
        title: doc.title,
        content: doc.content,
        status: doc.status || 'active',
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select()
      .single();

    if (error) throw error;
    return data.id;
  } else {
    // 新增
    const { data, error } = await supabase
      .from('ai_knowledge_docs')
      .insert({
        title: doc.title,
        category: doc.category,
        source_type: doc.source_type,
        source_ref: doc.source_ref,
        content: doc.content,
        status: doc.status || 'active',
      })
      .select()
      .single();

    if (error) throw error;
    return data.id;
  }
}

/**
 * 同步工人工资数据
 */
async function syncWorkerSalaryData(supabase: any, customHeaders?: Record<string, string>): Promise<number> {
  const { data: salaries, error } = await supabase
    .from('worker_salaries')
    .select(`
      id,
      year_month,
      work_hours,
      hourly_rate,
      contract_work_pay,
      gross_pay,
      income_tax,
      advance_pay,
      labor_insurance,
      net_pay,
      payment_status,
      workers(name, work_type, id_card),
      projects(name)
    `);

  if (error) throw error;
  if (!salaries || salaries.length === 0) return 0;

  // 合并为单个文档
  const content = salaries.map((s: any) => 
    `${s.year_month} | ${s.workers?.name || '-'} | ${s.workers?.work_type || '-'} | 项目:${s.projects?.name || '-'} | 工时:${s.work_hours || 0} | 工价:${s.hourly_rate || 0} | 应发:${s.gross_pay || 0} | 实发:${s.net_pay || 0} | 状态:${s.payment_status || '-'}`
  ).join('\n');

  const docId = await addKnowledgeDoc(supabase, {
    title: '工人工资台账',
    category: 'business_data',
    source_type: 'auto_sync',
    source_ref: 'worker_salary_all',
    content: `工人工资台账（共${salaries.length}条记录）\n\n月份 | 姓名 | 工种 | 项目 | 工时 | 工价 | 应发 | 实发 | 状态\n${content}`,
    status: 'active',
  }, customHeaders);

  return docId ? salaries.length : 0;
}

/**
 * 同步供应商数据
 */
async function syncSupplierData(supabase: any, customHeaders?: Record<string, string>): Promise<number> {
  const { data: suppliers, error } = await supabase
    .from('supplier_contracts')
    .select(`
      id,
      contract_name,
      total_amount,
      cumulative_paid,
      contract_status,
      project_id,
      projects(name)
    `);

  if (error) throw error;
  if (!suppliers || suppliers.length === 0) return 0;

  const content = suppliers.map((s: any) => 
    `${s.contract_name} | 项目:${s.projects?.name || '-'} | 合同金额:${s.total_amount || 0} | 已付:${s.cumulative_paid || 0} | 状态:${s.contract_status || '-'}`
  ).join('\n');

  const docId = await addKnowledgeDoc(supabase, {
    title: '供应商合同清单',
    category: 'business_data',
    source_type: 'auto_sync',
    source_ref: 'supplier_contract_all',
    content: `供应商合同清单（共${suppliers.length}条记录）\n\n合同名称 | 项目 | 合同金额 | 已付金额 | 状态\n${content}`,
    status: 'active',
  }, customHeaders);

  return docId ? suppliers.length : 0;
}

/**
 * 同步项目数据
 */
async function syncProjectData(supabase: any, customHeaders?: Record<string, string>): Promise<number> {
  const { data: projects, error } = await supabase
    .from('projects')
    .select(`
      id,
      name,
      year,
      status,
      client_reports(settlement_amount)
    `);

  if (error) throw error;
  if (!projects || projects.length === 0) return 0;

  const content = projects.map((p: any) => {
    const totalAmount = p.client_reports?.reduce((sum: number, r: any) => sum + (parseFloat(r.settlement_amount) || 0), 0) || 0;
    return `${p.name} | 年度:${p.year || '-'} | 状态:${p.status || '-'} | 甲方报量总额:${totalAmount.toFixed(2)}`;
  }).join('\n');

  const docId = await addKnowledgeDoc(supabase, {
    title: '项目台账',
    category: 'business_data',
    source_type: 'auto_sync',
    source_ref: 'project_all',
    content: `项目台账（共${projects.length}条记录）\n\n项目名称 | 年度 | 状态 | 甲方报量总额\n${content}`,
    status: 'active',
  }, customHeaders);

  return docId ? projects.length : 0;
}

/**
 * 同步证件数据
 */
async function syncCertificateData(supabase: any, customHeaders?: Record<string, string>): Promise<number> {
  const { data: certificates, error } = await supabase
    .from('certificates')
    .select(`
      id,
      name,
      certificate_number,
      owner_type,
      owner_name,
      expiry_date,
      status
    `)
    .neq('status', 'voided');

  if (error) throw error;
  if (!certificates || certificates.length === 0) return 0;

  const content = certificates.map((c: any) => 
    `${c.name} | 编号:${c.certificate_number || '-'} | 归属:${c.owner_type || '-'} | 持有人:${c.owner_name || '-'} | 到期:${c.expiry_date || '-'} | 状态:${c.status || '-'}`
  ).join('\n');

  const docId = await addKnowledgeDoc(supabase, {
    title: '证件台账',
    category: 'business_data',
    source_type: 'auto_sync',
    source_ref: 'certificate_all',
    content: `证件台账（共${certificates.length}条记录）\n\n证件名称 | 编号 | 归属类型 | 持有人 | 到期日期 | 状态\n${content}`,
    status: 'active',
  }, customHeaders);

  return docId ? certificates.length : 0;
}

/**
 * 同步结算数据（旧表）
 */
async function syncSettlementData(supabase: any, customHeaders?: Record<string, string>): Promise<number> {
  const { data: settlements, error } = await supabase
    .from('settlements')
    .select(`
      id,
      settlement_no,
      settlement_amount,
      status,
      suppliers(name),
      projects(name)
    `);

  if (error) throw error;
  if (!settlements || settlements.length === 0) return 0;

  const content = settlements.map((s: any) => 
    `${s.settlement_no || '-'} | 供应商:${s.suppliers?.name || '-'} | 项目:${s.projects?.name || '-'} | 结算金额:${s.settlement_amount || 0} | 状态:${s.status || '-'}`
  ).join('\n');

  const docId = await addKnowledgeDoc(supabase, {
    title: '结算台账',
    category: 'business_data',
    source_type: 'auto_sync',
    source_ref: 'settlement_all',
    content: `结算台账（共${settlements.length}条记录）\n\n结算单号 | 供应商 | 项目 | 结算金额 | 状态\n${content}`,
    status: 'active',
  }, customHeaders);

  return docId ? settlements.length : 0;
}

/**
 * 同步供应商结算数据（新表）
 */
async function syncSupplierSettlementData(supabase: any, customHeaders?: Record<string, string>): Promise<number> {
  const { data: settlements, error } = await supabase
    .from('supplier_settlements')
    .select(`
      id,
      settlement_no,
      settlement_amount,
      paid_amount,
      status,
      suppliers(name),
      projects(name)
    `)
    .neq('status', 'voided');

  if (error) throw error;
  if (!settlements || settlements.length === 0) return 0;

  const content = settlements.map((s: any) => 
    `${s.settlement_no || '-'} | 供应商:${s.suppliers?.name || '-'} | 项目:${s.projects?.name || '-'} | 结算金额:${s.settlement_amount || 0} | 已付:${s.paid_amount || 0} | 状态:${s.status || '-'}`
  ).join('\n');

  const docId = await addKnowledgeDoc(supabase, {
    title: '供应商结算台账',
    category: 'business_data',
    source_type: 'auto_sync',
    source_ref: 'supplier_settlement_all',
    content: `供应商结算台账（共${settlements.length}条记录）\n\n结算单号 | 供应商 | 项目 | 结算金额 | 已付金额 | 状态\n${content}`,
    status: 'active',
  }, customHeaders);

  return docId ? settlements.length : 0;
}

/**
 * 同步签证变更数据
 */
async function syncVisaData(supabase: any, customHeaders?: Record<string, string>): Promise<number> {
  const { data: visas, error } = await supabase
    .from('visas')
    .select(`
      id,
      visa_no,
      visa_content,
      visa_amount,
      visa_quantity,
      visa_unit,
      visa_date,
      status,
      projects(name)
    `)
    .neq('status', 'voided');

  if (error) throw error;
  if (!visas || visas.length === 0) return 0;

  const content = visas.map((v: any) => 
    `${v.visa_no || '-'} | 项目:${v.projects?.name || '-'} | 内容:${v.visa_content || '-'} | 金额:${v.visa_amount || 0} | 数量:${v.visa_quantity || '-'} ${v.visa_unit || ''} | 日期:${v.visa_date || '-'} | 状态:${v.status || '-'}`
  ).join('\n');

  const docId = await addKnowledgeDoc(supabase, {
    title: '签证变更台账',
    category: 'business_data',
    source_type: 'auto_sync',
    source_ref: 'visa_all',
    content: `签证变更台账（共${visas.length}条记录）\n\n签证编号 | 项目 | 内容 | 金额 | 数量 | 日期 | 状态\n${content}`,
    status: 'active',
  }, customHeaders);

  return docId ? visas.length : 0;
}

/**
 * 同步甲方付款数据
 */
async function syncClientPaymentData(supabase: any, customHeaders?: Record<string, string>): Promise<number> {
  const { data: payments, error } = await supabase
    .from('client_payments')
    .select(`
      id,
      payment_amount,
      payment_date,
      payment_method,
      status,
      projects(name)
    `);

  if (error) throw error;
  if (!payments || payments.length === 0) return 0;

  const content = payments.map((p: any) => 
    `项目:${p.projects?.name || '-'} | 金额:${p.payment_amount || 0} | 日期:${p.payment_date || '-'} | 方式:${p.payment_method || '-'} | 状态:${p.status || '-'}`
  ).join('\n');

  const docId = await addKnowledgeDoc(supabase, {
    title: '甲方付款台账',
    category: 'business_data',
    source_type: 'auto_sync',
    source_ref: 'client_payment_all',
    content: `甲方付款台账（共${payments.length}条记录）\n\n项目 | 金额 | 日期 | 方式 | 状态\n${content}`,
    status: 'active',
  }, customHeaders);

  return docId ? payments.length : 0;
}

/**
 * 同步供应商付款数据
 */
async function syncSupplierPaymentData(supabase: any, customHeaders?: Record<string, string>): Promise<number> {
  const { data: payments, error } = await supabase
    .from('supplier_payments')
    .select(`
      id,
      payment_amount,
      payment_date,
      payment_type,
      status,
      supplier_contracts(contract_name, suppliers(name), projects(name))
    `);

  if (error) throw error;
  if (!payments || payments.length === 0) return 0;

  const content = payments.map((p: any) => 
    `合同:${p.supplier_contracts?.contract_name || '-'} | 供应商:${p.supplier_contracts?.suppliers?.name || '-'} | 项目:${p.supplier_contracts?.projects?.name || '-'} | 金额:${p.payment_amount || 0} | 日期:${p.payment_date || '-'} | 类型:${p.payment_type || '-'} | 状态:${p.status || '-'}`
  ).join('\n');

  const docId = await addKnowledgeDoc(supabase, {
    title: '供应商付款台账',
    category: 'business_data',
    source_type: 'auto_sync',
    source_ref: 'supplier_payment_all',
    content: `供应商付款台账（共${payments.length}条记录）\n\n合同 | 供应商 | 项目 | 金额 | 日期 | 类型 | 状态\n${content}`,
    status: 'active',
  }, customHeaders);

  return docId ? payments.length : 0;
}

/**
 * 同步业务数据到知识库（供 AI 助手使用）
 */
export async function syncBusinessData(customHeaders?: Record<string, string>): Promise<SyncResult> {
  const supabase = getSupabaseClient();
  const errors: string[] = [];
  let workers = 0, suppliers = 0, projects = 0, certificates = 0, settlements = 0;
  let supplierSettlements = 0, visas = 0, clientPayments = 0, supplierPayments = 0;

  try {
    workers = await syncWorkerSalaryData(supabase, customHeaders);
  } catch (e: any) {
    errors.push(`工人工资同步失败: ${e.message}`);
  }

  try {
    suppliers = await syncSupplierData(supabase, customHeaders);
  } catch (e: any) {
    errors.push(`供应商数据同步失败: ${e.message}`);
  }

  try {
    projects = await syncProjectData(supabase, customHeaders);
  } catch (e: any) {
    errors.push(`项目台账同步失败: ${e.message}`);
  }

  try {
    certificates = await syncCertificateData(supabase, customHeaders);
  } catch (e: any) {
    errors.push(`证件数据同步失败: ${e.message}`);
  }

  try {
    settlements = await syncSettlementData(supabase, customHeaders);
  } catch (e: any) {
    errors.push(`结算数据同步失败: ${e.message}`);
  }

  try {
    supplierSettlements = await syncSupplierSettlementData(supabase, customHeaders);
  } catch (e: any) {
    errors.push(`供应商结算同步失败: ${e.message}`);
  }

  try {
    visas = await syncVisaData(supabase, customHeaders);
  } catch (e: any) {
    errors.push(`签证变更同步失败: ${e.message}`);
  }

  try {
    clientPayments = await syncClientPaymentData(supabase, customHeaders);
  } catch (e: any) {
    errors.push(`甲方付款同步失败: ${e.message}`);
  }

  try {
    supplierPayments = await syncSupplierPaymentData(supabase, customHeaders);
  } catch (e: any) {
    errors.push(`供应商付款同步失败: ${e.message}`);
  }

  return { workers, suppliers, projects, certificates, settlements, supplierSettlements, visas, clientPayments, supplierPayments, errors };
}

/**
 * 同步单类业务数据
 */
export async function syncSingleBusinessData(
  dataType: string,
  customHeaders?: Record<string, string>
): Promise<{ count: number; error?: string }> {
  const supabase = getSupabaseClient();

  try {
    let count = 0;
    switch (dataType) {
      case 'worker_salary':
        count = await syncWorkerSalaryData(supabase, customHeaders);
        break;
      case 'supplier':
        count = await syncSupplierData(supabase, customHeaders);
        break;
      case 'project':
        count = await syncProjectData(supabase, customHeaders);
        break;
      case 'certificate':
        count = await syncCertificateData(supabase, customHeaders);
        break;
      case 'settlement':
        count = await syncSettlementData(supabase, customHeaders);
        break;
      case 'supplier_settlement':
        count = await syncSupplierSettlementData(supabase, customHeaders);
        break;
      case 'visa':
        count = await syncVisaData(supabase, customHeaders);
        break;
      case 'client_payment':
        count = await syncClientPaymentData(supabase, customHeaders);
        break;
      case 'supplier_payment':
        count = await syncSupplierPaymentData(supabase, customHeaders);
        break;
      default:
        return { count: 0, error: `未知的数据类型: ${dataType}` };
    }
    return { count };
  } catch (e: any) {
    return { count: 0, error: e.message };
  }
}

/**
 * 同步所有业务数据（别名）
 */
export async function syncAllBusinessData(
  customHeaders?: Record<string, string>
): Promise<{ success: boolean; synced: number; errors: string[] }> {
  const result = await syncBusinessData(customHeaders);
  return {
    success: result.errors.length === 0,
    synced: result.workers + result.suppliers + result.projects + result.certificates + 
            result.settlements + result.supplierSettlements + result.visas + 
            result.clientPayments + result.supplierPayments,
    errors: result.errors
  };
}

/**
 * 同步单类业务数据（别名）
 */
export async function syncSingleDataType(
  dataType: string,
  customHeaders?: Record<string, string>
): Promise<{ success: boolean; synced: number; errors: string[] }> {
  const result = await syncSingleBusinessData(dataType, customHeaders);
  return {
    success: !result.error,
    synced: result.count,
    errors: result.error ? [result.error] : []
  };
}

/**
 * 获取同步状态
 */
export async function getSyncStatus(): Promise<{
  lastSyncTime: string | null;
  totalDocs: number;
  activeDocs: number;
  syncedTypes: string[];
}> {
  const supabase = getSupabaseClient();
  
  try {
    const { data: docs, error } = await supabase
      .from('ai_knowledge_docs')
      .select('source_type, status, created_at')
      .eq('source_type', 'auto_sync')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    const activeDocs = docs?.filter(d => d.status === 'active') || [];
    const syncedTypes = [...new Set(docs?.map(d => d.source_type).filter(Boolean) || [])];
    
    return {
      lastSyncTime: docs?.[0]?.created_at || null,
      totalDocs: docs?.length || 0,
      activeDocs: activeDocs.length,
      syncedTypes
    };
  } catch (e) {
    return {
      lastSyncTime: null,
      totalDocs: 0,
      activeDocs: 0,
      syncedTypes: []
    };
  }
}
