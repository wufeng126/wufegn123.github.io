import { NextRequest } from 'next/server';
import { S3Storage } from 'coze-coding-dev-sdk';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAuth } from '@/lib/api-auth';
import { apiBadRequest, apiForbidden, apiNotFound, apiServerError, apiSuccess, getErrorMessage } from '@/lib/api-utils';
import { auditLog } from '@/lib/audit-log';
import { isEffectiveClientPaymentStatus } from '@/lib/business-logic';

type ArchiveParams = { params: Promise<{ id: string }> };

type LogAttachment = {
  name?: string;
  size?: number;
  storageKey?: string;
  fileKey?: string;
  type?: string;
};

type ConstructionLogRow = {
  id: number;
  attachments?: LogAttachment[] | null;
  attachments_original_count?: number | null;
};

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sumRows<T extends Record<string, unknown>>(rows: T[] | null | undefined, field: keyof T) {
  return (rows || []).reduce((total, row) => total + toNumber(row[field]), 0);
}

function isImageAttachment(attachment: LogAttachment) {
  const type = String(attachment.type || '').toLowerCase();
  const key = String(attachment.storageKey || attachment.fileKey || '').toLowerCase();
  return type === 'image' || key.includes('construction-log-ocr/');
}

function getAttachmentKey(attachment: LogAttachment) {
  return attachment.storageKey || attachment.fileKey || '';
}

function createStorage() {
  return new S3Storage({
    endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
    accessKey: '',
    secretKey: '',
    bucketName: process.env.COZE_BUCKET_NAME,
    region: 'cn-beijing',
  });
}

function buildKnowledgeContent(project: Record<string, unknown>, snapshot: Record<string, unknown>, note: string) {
  const basics = snapshot.basics as Record<string, unknown>;
  const logs = snapshot.constructionLogs as Record<string, unknown>;
  const finance = snapshot.finance as Record<string, unknown>;
  return [
    `# ${project.name || '项目'} 项目归档报告`,
    '',
    `归档时间：${new Date().toLocaleString('zh-CN')}`,
    `项目状态：${basics.status || '-'}`,
    `甲方：${basics.partner || '-'}`,
    `项目地址：${basics.address || '-'}`,
    note ? `归档备注：${note}` : '',
    '',
    '## 施工日志',
    `日志数量：${logs.logCount || 0}`,
    `清理照片：${logs.cleanedPhotoCount || 0} 张`,
    `出勤总工时：${logs.totalWorkHours || 0} 小时`,
    '',
    '## 经营数据快照',
    `甲方累计结算：${finance.clientReportAmount || 0}`,
    `甲方累计回款：${finance.clientPaymentAmount || 0}`,
    `供应商累计结算：${finance.supplierSettlementAmount || 0}`,
    `供应商累计付款：${finance.supplierPaymentAmount || 0}`,
    `工人工资累计核算：${finance.workerSalaryAmount || 0}`,
    `工人工资累计发放：${finance.salaryPaymentAmount || 0}`,
    '',
    '该文档由项目归档自动生成，用于后续知识库检索、经验复盘和项目资料追溯。',
  ].filter(Boolean).join('\n');
}

export async function GET(request: NextRequest, { params }: ArchiveParams) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const projectId = Number(id);
    if (!Number.isInteger(projectId) || projectId <= 0) return apiBadRequest('项目ID无效');

    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('project_archives')
      .select('*')
      .eq('project_id', projectId)
      .order('archived_at', { ascending: false });

    if (error) throw new Error(error.message);
    return apiSuccess(data || []);
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '项目归档记录查询失败'));
  }
}

export async function POST(request: NextRequest, { params }: ArchiveParams) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;
    if (!auth.user.is_super_admin) return apiForbidden('只有超级管理员可以归档项目');

    const { id } = await params;
    const projectId = Number(id);
    if (!Number.isInteger(projectId) || projectId <= 0) return apiBadRequest('项目ID无效');

    const body = await request.json().catch(() => ({}));
    const note = typeof body?.note === 'string' ? body.note.trim() : '';
    const supabase = getSupabaseClient();

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .maybeSingle();

    if (projectError) throw new Error(projectError.message);
    if (!project) return apiNotFound('项目不存在');
    if (project.is_archived) return apiBadRequest('项目已归档，不能重复归档');

    const [
      logsResult,
      attendanceResult,
      clientReportsResult,
      clientPaymentsResult,
      visasResult,
      supplierContractsResult,
      supplierPaymentsResult,
      workerSalariesResult,
      salaryPaymentsResult,
      miscMaterialsResult,
    ] = await Promise.all([
      supabase.from('construction_logs').select('id,attachments,attachments_original_count').eq('project_id', projectId),
      supabase.from('construction_log_attendance').select('worker_id,work_hours').eq('project_id', projectId),
      supabase.from('client_reports').select('report_amount,settlement_amount,invoice_amount,status').eq('project_id', projectId),
      supabase.from('client_payments').select('payment_amount,status').eq('project_id', projectId),
      supabase.from('visas').select('visa_amount,status').eq('project_id', projectId),
      supabase.from('supplier_contracts').select('id').eq('project_id', projectId),
      supabase.from('supplier_payments').select('payment_amount,status').eq('project_id', projectId),
      supabase.from('worker_salaries').select('gross_pay,net_pay,payment_status').eq('project_id', projectId),
      supabase.from('salary_payments').select('payment_amount').eq('project_id', projectId),
      supabase.from('miscellaneous_materials').select('amount,quantity,status').eq('project_id', projectId),
    ]);

    const queryErrors = [
      logsResult.error,
      attendanceResult.error,
      clientReportsResult.error,
      clientPaymentsResult.error,
      visasResult.error,
      supplierContractsResult.error,
      supplierPaymentsResult.error,
      workerSalariesResult.error,
      salaryPaymentsResult.error,
      miscMaterialsResult.error,
    ].filter(Boolean);
    if (queryErrors.length > 0) throw new Error(queryErrors[0]?.message || '项目归档快照生成失败');

    const contractIds = (supplierContractsResult.data || []).map((row: { id: number }) => row.id);
    let supplierSettlements: Record<string, unknown>[] = [];
    if (contractIds.length > 0) {
      const { data, error } = await supabase
        .from('supplier_settlements')
        .select('settlement_amount,payable_amount,status')
        .in('contract_id', contractIds);
      if (error) throw new Error(error.message);
      supplierSettlements = data || [];
    }

    const logs = (logsResult.data || []) as ConstructionLogRow[];
    const storage = createStorage();
    const deleteFailures: string[] = [];
    let cleanedPhotoCount = 0;

    for (const log of logs) {
      const attachments = Array.isArray(log.attachments) ? log.attachments : [];
      const imageAttachments = attachments.filter(isImageAttachment);
      if (imageAttachments.length === 0) continue;

      await Promise.all(imageAttachments.map(async (attachment) => {
        const key = getAttachmentKey(attachment);
        if (!key) return;
        try {
          await storage.deleteFile({ fileKey: key });
        } catch {
          deleteFailures.push(key);
        }
      }));

      cleanedPhotoCount += imageAttachments.length;
      const remainingAttachments = attachments.filter((attachment) => !isImageAttachment(attachment));
      const { error: updateLogError } = await supabase
        .from('construction_logs')
        .update({
          attachments: remainingAttachments,
          attachments_cleaned_at: new Date().toISOString(),
          attachments_original_count: toNumber(log.attachments_original_count) + imageAttachments.length,
          attachments_cleaned_by: auth.user.id,
        })
        .eq('id', log.id);
      if (updateLogError) throw new Error(updateLogError.message);
    }

    const effectiveClientPayments = (clientPaymentsResult.data || []).filter((row: { status?: string | null }) => (
      isEffectiveClientPaymentStatus(row.status)
    ));
    const effectiveClientReports = (clientReportsResult.data || []).filter((row: { status?: string | null }) => row.status !== 'voided');
    const effectiveSupplierSettlements = supplierSettlements.filter((row) => row.status !== 'voided');
    const effectiveSupplierPayments = (supplierPaymentsResult.data || []).filter((row: { status?: string | null }) => row.status !== 'voided');
    const effectiveMiscMaterials = (miscMaterialsResult.data || []).filter((row: { status?: string | null }) => row.status !== 'voided');

    const snapshot = {
      basics: {
        id: project.id,
        name: project.name,
        year: project.year,
        status: project.status,
        partner: project.partner,
        address: project.address,
        contractAmount: project.contract_amount,
        buildingArea: project.building_area,
        completionDate: project.completion_date,
        warrantyDays: project.warranty_days,
      },
      constructionLogs: {
        logCount: logs.length,
        cleanedPhotoCount,
        deleteFailures,
        attendanceWorkerCount: new Set((attendanceResult.data || []).map((row: { worker_id: number }) => row.worker_id)).size,
        totalWorkHours: sumRows(attendanceResult.data, 'work_hours'),
      },
      finance: {
        clientReportAmount: effectiveClientReports.reduce((sum: number, row: Record<string, unknown>) => (
          sum + toNumber(row.invoice_amount || row.settlement_amount || row.report_amount)
        ), 0),
        clientPaymentAmount: sumRows(effectiveClientPayments, 'payment_amount'),
        visaAmount: sumRows(visasResult.data, 'visa_amount'),
        supplierSettlementAmount: sumRows(effectiveSupplierSettlements, 'settlement_amount'),
        supplierPayableAmount: sumRows(effectiveSupplierSettlements, 'payable_amount'),
        supplierPaymentAmount: sumRows(effectiveSupplierPayments, 'payment_amount'),
        workerSalaryAmount: sumRows(workerSalariesResult.data, 'net_pay'),
        salaryPaymentAmount: sumRows(salaryPaymentsResult.data, 'payment_amount'),
        miscMaterialAmount: sumRows(effectiveMiscMaterials, 'amount'),
      },
      archivedAt: new Date().toISOString(),
      archivedBy: auth.user.id,
      note,
    };

    const archivedAt = new Date().toISOString();
    const { error: updateProjectError } = await supabase
      .from('projects')
      .update({
        is_archived: true,
        archived_at: archivedAt,
        archived_by: auth.user.id,
        archive_note: note || null,
      })
      .eq('id', projectId);
    if (updateProjectError) throw new Error(updateProjectError.message);

    const { data: archive, error: archiveError } = await supabase
      .from('project_archives')
      .insert({
        project_id: projectId,
        archived_by: auth.user.id,
        archived_at: archivedAt,
        snapshot_data: snapshot,
        photo_count: cleanedPhotoCount,
        note: note || null,
      })
      .select()
      .single();
    if (archiveError) throw new Error(archiveError.message);

    let knowledgeDocId: number | null = null;
    const { data: knowledgeDoc, error: knowledgeError } = await supabase
      .from('ai_knowledge_docs')
      .insert({
        title: `${project.name} 项目归档报告`,
        category: '项目归档',
        source_type: 'project_archive',
        source_ref: `project_archive:${archive.id}`,
        tags: ['项目归档', project.name, String(project.year || '')].filter(Boolean),
        content: buildKnowledgeContent(project, snapshot, note),
        status: 'active',
        created_by: auth.user.id,
      })
      .select('id')
      .single();

    if (!knowledgeError && knowledgeDoc?.id) {
      knowledgeDocId = Number(knowledgeDoc.id);
      await supabase
        .from('project_archives')
        .update({ knowledge_doc_id: knowledgeDocId })
        .eq('id', archive.id);
    }

    await auditLog({
      operationType: 'update',
      resourceType: 'project_archive',
      resourceId: projectId,
      details: { projectName: project.name, archiveId: archive.id, cleanedPhotoCount, deleteFailures },
      request,
      userId: auth.user.id,
      username: auth.user.name || auth.user.username,
    });

    return apiSuccess({
      archive: { ...archive, knowledge_doc_id: knowledgeDocId },
      snapshot,
      cleaned_photo_count: cleanedPhotoCount,
      delete_failures: deleteFailures,
      knowledge_sync_error: knowledgeError?.message || null,
    });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '项目归档失败'));
  }
}
