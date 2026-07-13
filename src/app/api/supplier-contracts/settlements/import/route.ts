import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { insertWithSequenceFix } from '@/lib/audit-log';
import { requireApiWritePermission } from '@/lib/api-auth';
import { isVoidedStatus, REVIEW_STATUS } from '@/lib/business-logic';

// POST /api/supplier-contracts/settlements/import - 批量导入结算单
export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const supabase = getSupabaseClient();
    const body = await request.json();
    const { settlements } = body;

    if (!settlements || !Array.isArray(settlements) || settlements.length === 0) {
      return NextResponse.json({ error: '请提供有效的结算单数据' }, { status: 400 });
    }

    // 获取所有合同信息，用于验证和计算
    const { data: contracts, error: contractsError } = await supabase
      .from('supplier_contracts')
      .select('*');

    if (contractsError) throw contractsError;

    // 创建合同ID到合同信息的映射
    const contractMap = new Map();
    contracts.forEach(c => contractMap.set(c.id, c));

    // 创建合同名称到合同ID的映射
    const contractNameToId = new Map();
    contracts.forEach(c => contractNameToId.set(c.contract_name, c.id));

    const results = {
      success: [] as string[],
      failed: [] as { row: number; error: string }[],
      total: settlements.length
    };

    const now = new Date();

    for (let i = 0; i < settlements.length; i++) {
      const row = settlements[i];
      const rowNum = i + 2; // Excel行号从2开始（1是表头）

      try {
        // 验证合同
        let contractId = row.contract_id;
        if (!contractId && row.contract_name) {
          contractId = contractNameToId.get(row.contract_name);
        }

        if (!contractId) {
          results.failed.push({ row: rowNum, error: `合同不存在: ${row.contract_name || row.contract_id}` });
          continue;
        }

        const contract = contractMap.get(contractId);
        if (!contract) {
          results.failed.push({ row: rowNum, error: `合同不存在，ID: ${contractId}` });
          continue;
        }

        // 检查合同状态
        if (contract.contract_status === '已完结') {
          results.failed.push({ row: rowNum, error: `合同"${contract.contract_name}"已完结，无法新增结算` });
          continue;
        }

        // 解析结算类型
        let settlementType = row.settlement_type;
        if (settlementType === '总结算' || settlementType === '尾款') {
          settlementType = 'final';
        } else if (settlementType === '进度结算' || settlementType === '进度款') {
          settlementType = 'progress';
        }

        if (!settlementType) {
          results.failed.push({ row: rowNum, error: '结算类型不正确（progress/总结算）' });
          continue;
        }

        // 检查结算类型规则
        if (settlementType === 'final') {
          const { data: existingFinal } = await supabase
            .from('supplier_settlements')
            .select('id, status')
            .eq('contract_id', contractId)
            .eq('settlement_type', 'final');

          if ((existingFinal || []).some((s: any) => !isVoidedStatus(s.status))) {
            results.failed.push({ row: rowNum, error: `合同"${contract.contract_name}"已存在总结算` });
            continue;
          }
        }

        // 解析金额
        const settlementAmount = Number(row.settlement_amount);
        if (isNaN(settlementAmount) || settlementAmount <= 0) {
          results.failed.push({ row: rowNum, error: '结算金额必须大于0' });
          continue;
        }

        // 计算应付金额和付款比例
        let paymentRatio = 0;
        const paymentRatioFinal = Number(contract.payment_ratio_final) || 0;
        let payableAmount = 0;

        if (settlementType === 'progress') {
          paymentRatio = Number(contract.payment_ratio_active) || 80;
          payableAmount = settlementAmount * (paymentRatio / 100);
        } else {
          paymentRatio = paymentRatioFinal > 0 ? paymentRatioFinal : 100;
          payableAmount = settlementAmount * (paymentRatio / 100);
        }

        // 生成结算单号
        const settlementNo = `JS${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getTime()).slice(-6)}${String(i + 1).padStart(2, '0')}`;

        // 插入结算单
        const { error: insertError } = await insertWithSequenceFix('supplier_settlements', {
            contract_id: contractId,
            settlement_no: settlementNo,
            settlement_type: settlementType,
            settlement_amount: settlementAmount,
            payment_ratio: paymentRatio,
            payment_ratio_final: paymentRatioFinal,
            payable_amount: payableAmount.toFixed(2),
            settlement_date: row.settlement_date || null,
            remark: row.remark || null,
            status: REVIEW_STATUS.DRAFT,
            created_by: auth.user.id,
            created_by_name: auth.user.name || auth.user.username,
          }, supabase);

        if (insertError) {
          results.failed.push({ row: rowNum, error: insertError.message });
          continue;
        }

        results.success.push(settlementNo);
      } catch (err: any) {
        results.failed.push({ row: rowNum, error: err.message || '未知错误' });
      }
    }

    return NextResponse.json({
      success: true,
      message: `导入完成：成功 ${results.success.length} 条，失败 ${results.failed.length} 条`,
      results
    });
  } catch (error: any) {
    console.error('结算单导入失败:', error);
    return NextResponse.json({ error: error.message || '导入失败' }, { status: 500 });
  }
}
