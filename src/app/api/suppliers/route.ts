import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { auditLog, insertWithSequenceFix } from '@/lib/audit-log';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const type = searchParams.get('type');

    const client = getSupabaseClient();
    
    if (id) {
      // 获取单个供应商，附带结算和付款统计
      const { data: supplier, error } = await client
        .from('suppliers')
        .select(`
          *,
          settlements(count),
          payments(count)
        `)
        .eq('id', parseInt(id))
        .single();

      if (error) {
        throw new Error(`查询供应商失败: ${error.message}`);
      }

      // 计算累计结算金额和已付款金额（通过合同关联）
      const { data: contracts } = await client
        .from('supplier_contracts')
        .select('id')
        .eq('supplier_id', parseInt(id));

      const contractIds = (contracts || []).map((c: any) => c.id);

      let totalSettlement = 0;
      let totalPayment = 0;

      if (contractIds.length > 0) {
        const { data: settlementSum } = await client
          .from('supplier_settlements')
          .select('settlement_amount')
          .in('contract_id', contractIds);

        const { data: paymentSum } = await client
          .from('supplier_payments')
          .select('payment_amount')
          .in('contract_id', contractIds);

        totalSettlement = (settlementSum || []).reduce((sum, s: any) => sum + (parseFloat(s.settlement_amount) || 0), 0);
        totalPayment = (paymentSum || []).reduce((sum, p: any) => sum + (parseFloat(p.payment_amount) || 0), 0);
      }

      return NextResponse.json({ 
        success: true,
        supplier: {
          ...supplier,
          total_settlement: totalSettlement,
          total_payment: totalPayment,
          unpaid_amount: totalSettlement - totalPayment,
        }
      });
    }

    // 查询列表
    let query = client
      .from('suppliers')
      .select('*')
      .order('created_at', { ascending: false });

    if (type) {
      query = query.eq('type', type);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`查询供应商失败: ${error.message}`);
    }

    // 为每个供应商计算统计数据
    const suppliersWithStats = await Promise.all(
      (data || []).map(async (supplier) => {
        // 获取供应商的合同列表（不限制状态，只要有合同就算已签订）
        const { data: contracts } = await client
          .from('supplier_contracts')
          .select('id')
          .eq('supplier_id', supplier.id);

        const contractIds = (contracts || []).map((c: any) => c.id);
        const has_contract = contractIds.length > 0;
        let totalSettlement = 0;
        let totalPayment = 0;

        if (contractIds.length > 0) {
          const { data: settlementSum } = await client
            .from('supplier_settlements')
            .select('settlement_amount')
            .in('contract_id', contractIds);

          const { data: paymentSum } = await client
            .from('supplier_payments')
            .select('payment_amount')
            .in('contract_id', contractIds);

          totalSettlement = (settlementSum || []).reduce((sum, s: any) => sum + (parseFloat(s.settlement_amount) || 0), 0);
          totalPayment = (paymentSum || []).reduce((sum, p: any) => sum + (parseFloat(p.payment_amount) || 0), 0);
        }

        return {
          ...supplier,
          has_contract,
          contract_count: contractIds.length,
          total_settlement: totalSettlement,
          total_payment: totalPayment,
          unpaid_amount: totalSettlement - totalPayment,
        };
      })
    );

    return NextResponse.json({ success: true, suppliers: suppliersWithStats });
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
    const body = await request.json();
    const { name, type, contact_person, phone, remark } = body;

    if (!name || !type) {
      return NextResponse.json({ error: '请填写供应商名称和类型' }, { status: 400 });
    }

    const client = getSupabaseClient();
    
    const { data, error } = await insertWithSequenceFix('suppliers', {
        name,
        type,
        contact_person: contact_person || null,
        phone: phone || null,
        remark: remark || null,
      }, client);

    const supplierData = Array.isArray(data) ? data[0] : data;

    if (error) {
      throw new Error(`创建供应商失败: ${error.message}`);
    }

    // 记录审计日志
    await auditLog({
      operationType: 'create',
      resourceType: 'supplier',
      resourceId: supplierData?.id,
      details: { name, type, contact_person, phone },
      request,
    });

    return NextResponse.json({ success: true, supplier: supplierData });
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
    const body = await request.json();
    const { id: bodyId, name, type, contact_person, phone, remark } = body;

    // 优先使用 body 中的 id，其次使用 query 参数
    const { searchParams } = new URL(request.url);
    const queryId = searchParams.get('id');
    const id = bodyId || queryId;

    if (!id) {
      return NextResponse.json({ error: '缺少供应商ID' }, { status: 400 });
    }

    // 解析 id（支持字符串和数字）
    const supplierId = parseInt(String(id).replace(/[^\d]/g, ''));
    if (isNaN(supplierId) || supplierId <= 0) {
      return NextResponse.json({ error: '无效的供应商ID' }, { status: 400 });
    }

    const client = getSupabaseClient();
    
    // 构建更新对象，只更新提供的字段（排除银行相关字段）
    const updateData: Record<string, any> = {};
    if (name !== undefined) updateData.name = name;
    if (type !== undefined) updateData.type = type;
    if (contact_person !== undefined) updateData.contact_person = contact_person || null;
    if (phone !== undefined) updateData.phone = phone || null;
    if (remark !== undefined) updateData.remark = remark || null;
    // 明确将银行字段设为 null，确保数据库中这些字段被清除
    updateData.bank_account = null;
    updateData.bank_name = null;

    const { data, error } = await client
      .from('suppliers')
      .update(updateData)
      .eq('id', supplierId)
      .select()
      .maybeSingle();

    if (error) {
      console.error('Update supplier error:', error);
      throw new Error(`更新供应商失败: ${error.message}`);
    }

    // 如果返回null，说明没有匹配记录
    if (!data) {
      // 尝试返回乐观更新结果
      return NextResponse.json({ 
        success: true, 
        supplier: { id: supplierId, ...updateData },
        message: '记录可能不存在，但更新请求已处理'
      });
    }

    // 记录审计日志
    await auditLog({
      operationType: 'update',
      resourceType: 'supplier',
      resourceId: supplierId,
      details: { name, type, changes: Object.keys(updateData) },
      request,
    });

    return NextResponse.json({ success: true, supplier: data });
  } catch (error: any) {
    console.error('API PUT Error:', error);
    return NextResponse.json(
      { error: error.message || '更新失败' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const ids = searchParams.get('ids');

    if (!ids) {
      return NextResponse.json({ error: '请提供要删除的供应商ID' }, { status: 400 });
    }

    const idArray = ids.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));

    if (idArray.length === 0) {
      return NextResponse.json({ error: '无效的供应商ID' }, { status: 400 });
    }

    const client = getSupabaseClient();
    
    // 检查是否有关联的结算或付款记录
    const { data: settlements } = await client
      .from('settlements')
      .select('id')
      .in('supplier_id', idArray)
      .limit(1);

    const { data: payments } = await client
      .from('payments')
      .select('id')
      .in('supplier_id', idArray)
      .limit(1);

    if ((settlements && settlements.length > 0) || (payments && payments.length > 0)) {
      return NextResponse.json({ 
        error: '该供应商有关联的结算或付款记录，无法删除' 
      }, { status: 400 });
    }
    
    const { error } = await client
      .from('suppliers')
      .delete()
      .in('id', idArray);

    if (error) {
      throw new Error(`删除供应商失败: ${error.message}`);
    }

    // 记录审计日志
    await auditLog({
      operationType: 'delete',
      resourceType: 'supplier',
      details: { deletedIds: idArray, deletedCount: idArray.length },
      request,
    });

    return NextResponse.json({ success: true, deletedCount: idArray.length });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error.message || '删除失败' },
      { status: 500 }
    );
  }
}
