/**
 * 业务数据知识库自动同步服务
 * 将全系统业务数据同步到AI向量知识库，支持增量更新
 */
import { addKnowledgeDoc } from './ai-service';
import { getSupabaseClient } from '@/storage/database/supabase-client';


const BUSINESS_DATASET = 'labor_business_data';

// ============ 数据同步：各模块 ============

/** 同步工人工资数据到知识库 */
async function syncWorkerSalaryData(supabase: ReturnType<typeof getSupabaseClient>, customHeaders?: Record<string, string>): Promise<number> {
  const { data: salaries } = await supabase
    .from('worker_salaries')
    .select('id,worker_id,year_month,work_hours,hourly_rate,contract_work_pay,gross_pay,income_tax,advance_pay,labor_insurance,net_pay,payment_status')
    .order('year_month', { ascending: false })
    .limit(500);

  if (!salaries || salaries.length === 0) return 0;

  // 获取工人名称映射
  const workerIds = [...new Set(salaries.map((s: any) => s.worker_id))];
  const { data: workers } = await supabase
    .from('workers')
    .select('id,name,work_type,project_id')
    .in('id', workerIds);
  const workerMap: Record<number, any> = {};
  (workers || []).forEach((w: any) => { workerMap[w.id] = w; });

  // 获取项目名称映射
  const projectIds = [...new Set((workers || []).map((w: any) => w.project_id).filter(Boolean))];
  const { data: projects } = await supabase
    .from('projects')
    .select('id,name')
    .in('id', projectIds);
  const projectMap: Record<number, string> = {};
  (projects || []).forEach((p: any) => { projectMap[p.id] = p.name; });

  // 构建文档内容
  const lines: string[] = ['【工人工资台账】\n'];
  for (const s of salaries) {
    const w = workerMap[s.worker_id];
    const projName = w?.project_id ? projectMap[w.project_id] : '未知项目';
    lines.push(`工人:${w?.name || '未知'} | 项目:${projName} | 工种:${w?.work_type || '-'} | 月份:${s.year_month} | 工时:${s.work_hours}h | 工价:${s.hourly_rate}元/h | 包活:${s.contract_work_pay || 0}元 | 应发:${s.gross_pay}元 | 个税:${s.income_tax}元 | 借支:${s.advance_pay}元 | 劳保:${s.labor_insurance}元 | 实发:${s.net_pay}元 | 状态:${s.payment_status || 'unpaid'}`);
  }

  const content = lines.join('\n');
  const success = await addKnowledgeDoc(
    '工人工资台账-自动同步',
    content,
    BUSINESS_DATASET,
    customHeaders,
  );
  return success ? salaries.length : 0;
}

/** 同步供应商合同与结算数据到知识库 */
async function syncSupplierData(supabase: ReturnType<typeof getSupabaseClient>, customHeaders?: Record<string, string>): Promise<number> {
  const { data: suppliers } = await supabase.from('suppliers').select('id,name,contact_person,phone').limit(50);
  if (!suppliers || suppliers.length === 0) return 0;

  const lines: string[] = ['【供应商与合同台账】\n'];

  for (const sp of suppliers) {
    lines.push(`供应商:${sp.name} | 联系人:${sp.contact_person || '-'} | 电话:${sp.phone || '-'}`);

    // 合同数据
    const { data: contracts } = await supabase
      .from('supplier_contracts')
      .select('contract_name,total_amount,cumulative_paid,contract_status,project_id')
      .eq('supplier_id', sp.id);
    if (contracts && contracts.length > 0) {
      for (const c of contracts) {
        const unpaid = (Number(c.total_amount) || 0) - (Number(c.cumulative_paid) || 0);
        lines.push(`  合同:${c.contract_name} | 总额:${c.total_amount || 0}元 | 已付:${c.cumulative_paid || 0}元 | 未付:${unpaid.toFixed(2)}元 | 状态:${c.contract_status || '履约中'}`);
      }
    }

    // 旧结算数据
    const { data: oldSettlements } = await supabase
      .from('settlements')
      .select('settlement_amount,settlement_date,settlement_month')
      .eq('supplier_id', sp.id);
    if (oldSettlements && oldSettlements.length > 0) {
      const totalSettlement = oldSettlements.reduce((sum: number, s: any) => sum + (Number(s.settlement_amount) || 0), 0);
      lines.push(`  历史结算:${totalSettlement.toFixed(2)}元(${oldSettlements.length}笔)`);
    }
  }

  const content = lines.join('\n');
  const success = await addKnowledgeDoc(
    '供应商合同台账-自动同步',
    content,
    BUSINESS_DATASET,
    customHeaders,
  );
  return success ? suppliers.length : 0;
}

/** 同步项目台账数据到知识库 */
async function syncProjectData(supabase: ReturnType<typeof getSupabaseClient>, customHeaders?: Record<string, string>): Promise<number> {
  const { data: projects } = await supabase.from('projects').select('id,name,year,status,expected_completion_date').limit(30);
  if (!projects || projects.length === 0) return 0;

  const lines: string[] = ['【项目台账】\n'];

  for (const p of projects) {
    let line = `项目:${p.name} | 年度:${p.year} | 状态:${p.status}`;
    if (p.expected_completion_date) line += ` | 预计完工:${p.expected_completion_date}`;

    // 工程量清单
    const { data: workItems } = await supabase
      .from('work_items')
      .select('item_name,unit,budget_quantity,unit_price')
      .eq('project_id', p.id)
      .limit(30);
    if (workItems && workItems.length > 0) {
      line += `\n  清单明细:`;
      for (const wi of workItems) {
        line += `\n    ${wi.item_name} | 单位:${wi.unit} | 预算量:${wi.budget_quantity} | 单价:${wi.unit_price}元`;
      }
    }

    // 甲方报量汇总
    const { data: reports } = await supabase
      .from('client_reports')
      .select('settlement_amount')
      .eq('project_id', p.id)
      .neq('status', 'voided');
    const totalReport = (reports || []).reduce((s: number, r: any) => s + (Number(r.settlement_amount) || 0), 0);
    if (totalReport > 0) line += `\n  累计报量结算:${totalReport.toFixed(2)}元`;

    lines.push(line);
  }

  const content = lines.join('\n');
  const success = await addKnowledgeDoc(
    '项目台账-自动同步',
    content,
    BUSINESS_DATASET,
    customHeaders,
  );
  return success ? projects.length : 0;
}

/** 同步证件管理数据到知识库 */
async function syncCertificateData(supabase: ReturnType<typeof getSupabaseClient>, customHeaders?: Record<string, string>): Promise<number> {
  const { data: certificates } = await supabase
    .from('certificates')
    .select('name,certificate_number,owner_type,owner_name,issue_date,expiry_date,remark')
    .limit(100);
  if (!certificates || certificates.length === 0) return 0;

  const lines: string[] = ['【证件台账】\n'];
  for (const c of certificates) {
    const daysLeft = c.expiry_date ? Math.ceil((new Date(c.expiry_date).getTime() - Date.now()) / 86400000) : null;
    const statusLabel = daysLeft === null ? '' : daysLeft < 0 ? '[已过期]' : daysLeft <= 7 ? '[7天内过期]' : daysLeft <= 15 ? '[15天内过期]' : daysLeft <= 30 ? '[30天内过期]' : '';
    lines.push(`${c.name} | 编号:${c.certificate_number || '-'} | 类型:${c.owner_type} | 持有:${c.owner_name || '-'} | 发证:${c.issue_date || '-'} | 到期:${c.expiry_date || '-'} ${statusLabel} | 备注:${c.remark || '-'}`);
  }

  const content = lines.join('\n');
  const success = await addKnowledgeDoc(
    '证件台账-自动同步',
    content,
    BUSINESS_DATASET,
    customHeaders,
  );
  return success ? certificates.length : 0;
}

/**
 * 同步结算数据到知识库
 */
async function syncSettlementData(supabase: ReturnType<typeof getSupabaseClient>, customHeaders?: Record<string, string>): Promise<number> {
  // 同步旧结算表
  const { data: settlements } = await supabase.from('settlements').select('*').limit(500);
  if (!settlements || settlements.length === 0) return 0;

  // 获取供应商名称映射
  const { data: suppliers } = await supabase.from('suppliers').select('id,name');
  const supplierMap = new Map((suppliers || []).map((s: any) => [s.id, s.name]));

  // 获取项目名称映射
  const { data: projects } = await supabase.from('projects').select('id,name');
  const projectMap = new Map((projects || []).map((p: any) => [p.id, p.name]));

  const content = settlements.map((s: any) => {
    const supplierName = supplierMap.get(s.supplier_id) || '未知供应商';
    const projectName = projectMap.get(s.project_id) || '未知项目';
    return `项目: ${projectName}, 供应商: ${supplierName}, 结算金额: ${s.settlement_amount || 0}元, 结算月份: ${s.settlement_month || '未指定'}, 结算日期: ${s.settlement_date || '未指定'}` + (s.remark ? `, 备注: ${s.remark}` : '');
  }).join('\n');

  const success = await addKnowledgeDoc(
    `结算台账数据 - ${new Date().toISOString().slice(0, 10)}`,
    content,
    BUSINESS_DATASET,
    customHeaders,
  );
  return success ? settlements.length : 0;
}

// ============ 同步调度 ============

export interface SyncResult {
  success: boolean;
  synced: {
    workers: number;
    suppliers: number;
    projects: number;
    certificates: number;
    settlements?: number;
  };
  errors: string[];
}

/**
 * 单数据类型同步
 */
export async function syncSingleDataType(
  dataType: string,
  customHeaders?: Record<string, string>
): Promise<SyncResult> {
  const supabase = getSupabaseClient();
  const errors: string[] = [];
  const synced: SyncResult['synced'] = { workers: 0, suppliers: 0, projects: 0, certificates: 0 };

  try {
    switch (dataType) {
      case 'salary':
      case 'worker':
        synced.workers = await syncWorkerSalaryData(supabase, customHeaders);
        break;
      case 'supplier':
      case 'contract':
        synced.suppliers = await syncSupplierData(supabase, customHeaders);
        break;
      case 'project':
        synced.projects = await syncProjectData(supabase, customHeaders);
        break;
      case 'certificate':
        synced.certificates = await syncCertificateData(supabase, customHeaders);
        break;
      case 'settlement':
        synced.settlements = await syncSettlementData(supabase, customHeaders);
        break;
      default:
        // 'all' - 同步所有
        return syncAllBusinessData(customHeaders);
    }
  } catch (e: any) {
    errors.push(`${dataType}同步失败: ${e.message}`);
  }

  return { success: errors.length === 0, synced, errors };
}

/**
 * 全量同步所有业务数据到知识库
 */
export async function syncAllBusinessData(customHeaders?: Record<string, string>): Promise<SyncResult> {
  const supabase = getSupabaseClient();
  const errors: string[] = [];
  let workers = 0, suppliers = 0, projects = 0, certificates = 0, settlements = 0;

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

  // 更新同步状态记录
  try {
    await supabase.from('ai_knowledge_docs').upsert({
      title: '__sync_status__',
      category: 'system',
      source_type: 'auto_sync',
      content: JSON.stringify({ lastSync: new Date().toISOString(), workers, suppliers, projects, certificates, settlements }),
      status: 'active',
      chunk_count: workers + suppliers + projects + certificates + settlements,
    }, { onConflict: 'title' });
  } catch { /* ignore */ }

  return {
    success: errors.length === 0,
    synced: { workers, suppliers, projects, certificates, settlements },
    errors,
  };
}

/**
 * 获取最近同步状态
 */
export async function getSyncStatus(): Promise<{
  lastSync: string | null;
  synced: { workers: number; suppliers: number; projects: number; certificates: number } | null;
}> {
  const supabase = getSupabaseClient();
  const { data } = await supabase
    .from('ai_knowledge_docs')
    .select('content,updated_at')
    .eq('title', '__sync_status__')
    .single();

  if (!data) return { lastSync: null, synced: null };

  try {
    const parsed = JSON.parse(data.content);
    return { lastSync: parsed.lastSync || data.updated_at, synced: parsed };
  } catch {
    return { lastSync: data.updated_at, synced: null };
  }
}
