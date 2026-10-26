import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireApiWritePermission } from '@/lib/api-auth';
import { getAccessibleProjectIds } from '@/lib/api-project-access';
import { insertWithSequenceFix, auditLog } from '@/lib/audit-log';
import { hasPersistedLivingAllowanceMatch, queryReceiptItemsWithCompatibility } from '@/lib/living-allowance-reconciliation';
import {
  extractReceiptOcrText,
  parseBankReceipt,
  validateReceiptParse,
  type ParsedReceiptItem,
} from '@/lib/bank-receipt-parser';
import { getWorkerProjectRelations } from '@/lib/worker-project-access';
import { extractForwardHeaders } from '@/lib/ai-service';
import { apiSuccess, apiError, getErrorMessage } from '@/lib/api-utils';

function normalizeId(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function maskTail(bankCard: unknown): string {
  const digits = String(bankCard || '').replace(/\D/g, '');
  return digits.slice(-4);
}

type AutoSplitRow = {
  receipt_id: number;
  worker_id: number | null;
  project_id: number | null;
  recipient_name: string;
  bank_card_tail: string | null;
  amount: number;
  payment_date: string | null;
  transaction_no: string | null;
  crop_box: null;
  match_status: 'unmatched' | 'auto_matched';
  match_score: number;
  remark: string | null;
};

type PreviewItem = {
  recipient_name: string;
  bank_card_tail: string | null;
  amount: number;
  status: string;
  bank_name: string;
  worker_id: number | null;
  worker_name: string | null;
  match_type: 'card' | 'name' | 'none';
  match_score: number;
  candidates: Array<{ id: number; name: string; project_id: number | null }>;
};

type WorkerRow = {
  id: number;
  name: string | null;
  project_id: number | null;
  bank_card: string | null;
};

/**
 * 在候选工人中为一笔回单明细寻找唯一匹配：
 * 1) 银行卡尾号精确匹配（权重最高）
 * 2) 姓名唯一匹配；重名时用回单项目过滤
 */
function matchItemToWorker(params: {
  item: ParsedReceiptItem;
  workers: WorkerRow[];
  relationByWorker: Map<number, Set<number>>;
  projectId: number | null;
}): PreviewItem {
  const { item, workers, relationByWorker, projectId } = params;
  const tail = item.bankCardTail;
  const base: PreviewItem = {
    recipient_name: item.recipientName,
    bank_card_tail: tail || null,
    amount: item.amount,
    status: item.status,
    bank_name: item.bankName,
    worker_id: null,
    worker_name: null,
    match_type: 'none',
    match_score: 0,
    candidates: [],
  };

  const sameName = workers.filter(worker => worker.name === item.recipientName);
  const inProject = (worker: WorkerRow) => {
    if (projectId === null) return true;
    return relationByWorker.get(worker.id)?.has(projectId) ?? false;
  };

  // 1. 卡号尾号匹配（在同名且属于回单项目的工人中比对，避免重名误配）
  if (tail) {
    const tailCandidates = sameName.filter(worker => inProject(worker) && maskTail(worker.bank_card) === tail);
    if (tailCandidates.length === 1) {
      const worker = tailCandidates[0];
      return {
        ...base,
        worker_id: worker.id,
        worker_name: worker.name,
        match_type: 'card',
        match_score: 100,
        candidates: tailCandidates.map(candidate => ({ id: candidate.id, name: candidate.name || '', project_id: candidate.project_id })),
      };
    }
    // 卡号唯一时放宽姓名要求（OCR 可能把户名识别错）
    const cardOnly = workers.filter(worker => inProject(worker) && maskTail(worker.bank_card) === tail);
    if (cardOnly.length === 1 && sameName.length === 0) {
      const worker = cardOnly[0];
      return {
        ...base,
        worker_id: worker.id,
        worker_name: worker.name,
        match_type: 'card',
        match_score: 90,
        candidates: [{ id: worker.id, name: worker.name || '', project_id: worker.project_id }],
      };
    }
  }

  // 2. 姓名匹配：项目内唯一才算自动匹配
  const nameInProject = sameName.filter(inProject);
  if (nameInProject.length === 1) {
    const worker = nameInProject[0];
    return {
      ...base,
      worker_id: worker.id,
      worker_name: worker.name,
      match_type: 'name',
      match_score: 80,
      candidates: [{ id: worker.id, name: worker.name || '', project_id: worker.project_id }],
    };
  }

  // 3. 无法唯一确定：返回候选供人工选择
  return {
    ...base,
    candidates: (nameInProject.length > 0 ? nameInProject : sameName).map(candidate => ({
      id: candidate.id,
      name: candidate.name || '',
      project_id: candidate.project_id,
    })),
  };
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const body = await request.json().catch(() => ({}));
    const receiptId = normalizeId(body.receipt_id ?? body.receiptId);
    if (!receiptId) return apiError('缺少回单ID');
    const previewOnly = Boolean(body.preview);

    const client = getSupabaseClient();
    const { data: receipt, error: receiptError } = await client
      .from('living_allowance_receipts')
      .select('id, project_id, receipt_date, file_key, file_name, payer_account, remark, declared_total_amount, declared_item_count, payment_purpose, parse_status')
      .eq('id', receiptId)
      .maybeSingle();

    if (receiptError) throw new Error(`查询回单失败: ${receiptError.message}`);
    if (!receipt) return apiError('回单不存在');
    const receiptRow = receipt as Record<string, unknown>;
    const fileKey = String(receiptRow.file_key || '');
    if (!fileKey) return apiError('回单文件不存在，无法识别');

    const receiptProjectId = normalizeId(receiptRow.project_id);
    const accessibleProjectIds = await getAccessibleProjectIds(client, auth.user);
    if (accessibleProjectIds !== null) {
      if (!receiptProjectId) return NextResponse.json({ error: '普通账号不能处理未指定项目的回单' }, { status: 403 });
      if (!accessibleProjectIds.includes(receiptProjectId)) {
        return NextResponse.json({ error: '无权识别该回单' }, { status: 403 });
      }
    }

    // 已有核对结果的回单不允许覆盖拆分
    const { data: existingItems, error: existingError } = await queryReceiptItemsWithCompatibility(
      (select) => client.from('living_allowance_receipt_items').select(select).eq('receipt_id', receiptId),
      'id, match_status, matched_record_id, matched_salary_id',
    );
    if (existingError) throw new Error(`查询已有拆分明细失败: ${existingError.message}`);
    if ((existingItems || []).some((item: any) => hasPersistedLivingAllowanceMatch({
      matchStatus: item.match_status,
      matchedRecordId: item.matched_record_id,
      matchedSalaryId: item.matched_salary_id,
    }))) {
      return apiError('该回单已有核对结果，不能重新智能拆分');
    }

    // 1. OCR 提取全文
    // 只转发 SDK 白名单的链路追踪头（x-tt-* / rpc-persist-*），
    // 切勿透传浏览器的 Authorization/Cookie——会被当作模型端点 Bearer 凭据，
    // 覆盖 Config 默认从 COZE_WORKLOAD_IDENTITY_API_KEY 读取的托管鉴权，导致 token 解析失败。
    const forwardHeaders = extractForwardHeaders(request.headers);
    const ocrText = await extractReceiptOcrText({
      fileKey,
      fileName: String(receiptRow.file_name || ''),
      forwardHeaders,
    });

    // 2. AI 结构化解析（失败回退规则解析）
    const parsed = await parseBankReceipt({ ocrText, forwardHeaders });
    const validation = validateReceiptParse(parsed);

    if (parsed.items.length === 0) {
      await client.from('living_allowance_receipts')
        .update({ parse_status: 'failed', updated_at: new Date().toISOString() })
        .eq('id', receiptId);
      return NextResponse.json({
        success: false,
        error: '未能从回单中识别出成功明细，请确认文件清晰后重试，或改用手工拆分',
        warnings: parsed.warnings,
        ocrTextPreview: ocrText.slice(0, 500),
      }, { status: 422 });
    }

    // 3. 查询工人档案用于预匹配（权限范围内的全部工人）
    let workerQuery = client
      .from('workers')
      .select('id, name, project_id, bank_card');
    if (accessibleProjectIds !== null) {
      // 超管不过滤；普通账号取其可访问项目的工人（worker.project_id 或任职关系命中即可）
      workerQuery = workerQuery.or(
        accessibleProjectIds.map(projectId => `project_id.eq.${projectId}`).join(','),
      );
    }
    const { data: workerRows, error: workerError } = await workerQuery.limit(5000);
    if (workerError) throw new Error(`查询工人档案失败: ${workerError.message}`);
    const workers = (workerRows || []) as WorkerRow[];
    const relationByWorker = await getWorkerProjectRelations(
      client,
      workers.map(worker => worker.id),
    );

    // 4. 逐笔预匹配
    const previewItems = parsed.items.map(item => matchItemToWorker({
      item,
      workers,
      relationByWorker,
      projectId: receiptProjectId,
    }));

    const matchedCount = previewItems.filter(item => item.worker_id !== null).length;
    const paymentDate = parsed.header.paymentDate || String(receiptRow.receipt_date || '').slice(0, 10);

    // 抬头字段更新（总金额/笔数/用途）
    const headerPatch: Record<string, unknown> = {
      declared_total_amount: parsed.header.totalAmount,
      declared_item_count: parsed.header.itemCount,
      parse_status: 'parsed',
      updated_at: new Date().toISOString(),
    };
    if (parsed.header.purpose) headerPatch.payment_purpose = parsed.header.purpose;
    if (parsed.header.payerAccount && !receiptRow.payer_account) headerPatch.payer_account = parsed.header.payerAccount;

    if (previewOnly) {
      // 预览模式：不落库，仅返回识别结果供前端展示
      return apiSuccess({
        receipt_id: receiptId,
        header: parsed.header,
        validation,
        warnings: parsed.warnings,
        source: parsed.source,
        items: previewItems,
        failed_items: parsed.failedItems.map(item => ({
          recipient_name: item.recipientName,
          amount: item.amount,
          status: item.status,
        })),
        summary: {
          total: previewItems.length,
          auto_matched: matchedCount,
          unmatched: previewItems.length - matchedCount,
          items_total: Math.round(previewItems.reduce((sum, item) => sum + item.amount, 0) * 100) / 100,
        },
      });
    }

    // 5. 落库：覆盖旧的未核对拆分明细
    if ((existingItems || []).length > 0) {
      const { error: deleteError } = await client
        .from('living_allowance_receipt_items')
        .delete()
        .eq('receipt_id', receiptId);
      if (deleteError) throw new Error(`清理旧拆分明细失败: ${deleteError.message}`);
    }

    const rows: AutoSplitRow[] = previewItems.map((item) => {
      // 项目归属：优先回单头绑定项目；回单未绑项目时回退到匹配工人的所属项目
      const matchedProjectId = item.worker_id
        ? (item.candidates.find((candidate) => candidate.id === item.worker_id)?.project_id ?? null)
        : null;
      return {
        receipt_id: receiptId,
        worker_id: item.worker_id,
        project_id: receiptProjectId ?? matchedProjectId,
        recipient_name: item.recipient_name,
        bank_card_tail: item.bank_card_tail,
        amount: item.amount,
        payment_date: paymentDate || null,
        transaction_no: null,
        crop_box: null,
        match_status: item.worker_id ? 'auto_matched' : 'unmatched',
        match_score: item.match_score,
        remark: item.match_type === 'card' ? '智能拆分：卡号匹配' : item.match_type === 'name' ? '智能拆分：姓名匹配' : null,
      };
    });

    const result = await insertWithSequenceFix('living_allowance_receipt_items', rows, client);
    if (result.error) throw new Error(`保存智能拆分明细失败: ${result.error.message}`);

    const { error: receiptUpdateError } = await client
      .from('living_allowance_receipts')
      .update({ ...headerPatch, split_status: 'split' })
      .eq('id', receiptId);
    if (receiptUpdateError) throw new Error(`更新回单状态失败: ${receiptUpdateError.message}`);

    await auditLog({
      operationType: 'create',
      resourceType: 'living_allowance_receipt_item',
      resourceId: receiptId,
      details: {
        receipt_id: receiptId,
        source: 'ai_auto_split',
        count: rows.length,
        auto_matched: matchedCount,
        amount_matched: validation.amountMatched,
      },
      request,
    });

    return apiSuccess({
      receipt_id: receiptId,
      header: parsed.header,
      validation,
      warnings: parsed.warnings,
      source: parsed.source,
      items: previewItems,
      failed_items: parsed.failedItems.map(item => ({
        recipient_name: item.recipientName,
        amount: item.amount,
        status: item.status,
      })),
      summary: {
        total: previewItems.length,
        auto_matched: matchedCount,
        unmatched: previewItems.length - matchedCount,
        items_total: Math.round(previewItems.reduce((sum, item) => sum + item.amount, 0) * 100) / 100,
      },
    });
  } catch (error: unknown) {
    console.error('[LivingAllowanceAutoSplit] error:', error);
    return apiError(getErrorMessage(error, "智能拆分失败"), 500);
  }
}
