import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { S3Storage } from "coze-coding-dev-sdk";

// Excel 工具函数（简单实现）
function generateExcelSimple(data: any[]): Buffer {
  if (data.length === 0) return Buffer.from("");

  const headers = Object.keys(data[0]);
  const rows = data.map((row) =>
    headers.map((h) => {
      const val = row[h];
      if (val === null || val === undefined) return "";
      const str = String(val);
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    }).join(",")
  );

  return Buffer.from([headers.join(","), ...rows].join("\n"));
}

export async function POST(request: NextRequest) {
  const supabase = getSupabaseClient();
  let recordId: number | null = null;
  let userId: number | null = null;
  let userName: string | null = null;

  try {
    const body = await request.json();
    recordId = body.record_id;
    userId = body.user_id;
    userName = body.user_name;
    const modules = body.modules || ["suppliers", "contracts", "settlements", "workers", "limit_prices", "payments"];

    // 更新记录状态为运行中
    if (recordId) {
      await supabase
        .from("backup_records")
        .update({ status: "running" })
        .eq("id", recordId);
    }

    // 初始化存储
    const storage = new S3Storage({
      endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
      bucketName: process.env.COZE_BUCKET_NAME,
    });

    const date = new Date().toISOString().split("T")[0];
    const timestamp = Date.now();
    let totalRecords = 0;
    const results: string[] = [];
    const fileKeys: string[] = [];

    // 导出供应商台账
    if (modules.includes("suppliers")) {
      const { data } = await supabase
        .from("suppliers")
        .select(`
          id, name, contact_person, phone, remark, created_at
        `)
        .order("id");

      const exportData = data?.map((s: any) => ({
        编号: s.id,
        供应商名称: s.name,
        联系人: s.contact_person || "",
        联系电话: s.phone || "",
        备注: s.remark || "",
        创建时间: s.created_at ? new Date(s.created_at).toLocaleString("zh-CN") : "",
      })) || [];

      if (exportData.length > 0) {
        const buffer = generateExcelSimple(exportData);
        const fileKey = await storage.uploadFile({
          fileContent: buffer,
          fileName: `backups/${date}/suppliers_${timestamp}.csv`,
          contentType: "text/csv",
        });
        fileKeys.push(fileKey);
        totalRecords += exportData.length;
        results.push(`供应商台账: ${exportData.length} 条记录`);
      }
    }

    // 导出合同数据
    if (modules.includes("contracts")) {
      const { data } = await supabase
        .from("supplier_contracts")
        .select(`
          id, contract_no, contract_amount, 
          payment_ratio_active, payment_ratio_complete,
          contract_status, project_id, created_at
        `)
        .order("id");

      const exportData = data?.map((c: any) => ({
        编号: c.id,
        合同编号: c.contract_no,
        合同金额: c.contract_amount,
        履约中比例: `${c.payment_ratio_active || 0}%`,
        结算完比例: `${c.payment_ratio_complete || 0}%`,
        合同状态: c.contract_status,
        创建时间: c.created_at ? new Date(c.created_at).toLocaleString("zh-CN") : "",
      })) || [];

      if (exportData.length > 0) {
        const buffer = generateExcelSimple(exportData);
        const fileKey = await storage.uploadFile({
          fileContent: buffer,
          fileName: `backups/${date}/contracts_${timestamp}.csv`,
          contentType: "text/csv",
        });
        fileKeys.push(fileKey);
        totalRecords += exportData.length;
        results.push(`合同管理: ${exportData.length} 条记录`);
      }
    }

    // 导出结算单数据
    if (modules.includes("settlements")) {
      const { data } = await supabase
        .from("supplier_settlements")
        .select(`
          id, settlement_no, settlement_type, settlement_amount,
          payment_ratio, payable_amount, settlement_date, status, created_at
        `)
        .order("id");

      const exportData = data?.map((s: any) => ({
        编号: s.id,
        结算单号: s.settlement_no,
        结算类型: s.settlement_type,
        结算金额: s.settlement_amount,
        付款比例: `${s.payment_ratio || 0}%`,
        应付金额: s.payable_amount,
        结算日期: s.settlement_date || "",
        状态: s.status,
        创建时间: s.created_at ? new Date(s.created_at).toLocaleString("zh-CN") : "",
      })) || [];

      if (exportData.length > 0) {
        const buffer = generateExcelSimple(exportData);
        const fileKey = await storage.uploadFile({
          fileContent: buffer,
          fileName: `backups/${date}/settlements_${timestamp}.csv`,
          contentType: "text/csv",
        });
        fileKeys.push(fileKey);
        totalRecords += exportData.length;
        results.push(`结算单: ${exportData.length} 条记录`);
      }
    }

    // 导出工人花名册
    if (modules.includes("workers")) {
      const { data } = await supabase
        .from("workers")
        .select(`
          id, name, work_type, id_card, phone, bank_card,
          entry_date, team, status
        `)
        .order("id");

      const exportData = data?.map((w: any) => ({
        编号: w.id,
        姓名: w.name,
        工种: w.work_type || "",
        身份证号: w.id_card || "",
        联系电话: w.phone || "",
        银行卡号: w.bank_card || "",
        入职日期: w.entry_date || "",
        班组: w.team || "",
        状态: w.status === "active" ? "在职" : "离职",
      })) || [];

      if (exportData.length > 0) {
        const buffer = generateExcelSimple(exportData);
        const fileKey = await storage.uploadFile({
          fileContent: buffer,
          fileName: `backups/${date}/workers_${timestamp}.csv`,
          contentType: "text/csv",
        });
        fileKeys.push(fileKey);
        totalRecords += exportData.length;
        results.push(`工人花名册: ${exportData.length} 条记录`);
      }
    }

    // 导出项目限价
    if (modules.includes("limit_prices")) {
      const { data } = await supabase
        .from("limit_prices")
        .select(`
          id, item_name, unit, budget_price, limit_price,
          labor_unit_price, material_unit_price,
          status, created_at
        `)
        .order("id");

      const exportData = data?.map((l: any) => ({
        编号: l.id,
        劳务子项: l.item_name,
        单位: l.unit || "",
        预算单价: l.budget_price,
        限价单价: l.limit_price,
        人工费: l.labor_unit_price,
        材料费: l.material_unit_price,
        状态: l.status === "approved" ? "已审核" : l.status === "pending" ? "待审核" : "草稿",
        创建时间: l.created_at ? new Date(l.created_at).toLocaleString("zh-CN") : "",
      })) || [];

      if (exportData.length > 0) {
        const buffer = generateExcelSimple(exportData);
        const fileKey = await storage.uploadFile({
          fileContent: buffer,
          fileName: `backups/${date}/limit_prices_${timestamp}.csv`,
          contentType: "text/csv",
        });
        fileKeys.push(fileKey);
        totalRecords += exportData.length;
        results.push(`项目限价: ${exportData.length} 条记录`);
      }
    }

    // 导出付款记录
    if (modules.includes("payments")) {
      const { data } = await supabase
        .from("supplier_payments")
        .select(`
          id, payment_no, payment_amount, payment_date,
          payment_method, created_at
        `)
        .order("id");

      const exportData = data?.map((p: any) => ({
        编号: p.id,
        付款单号: p.payment_no || "",
        付款金额: p.payment_amount,
        付款日期: p.payment_date || "",
        付款方式: p.payment_method || "",
        创建时间: p.created_at ? new Date(p.created_at).toLocaleString("zh-CN") : "",
      })) || [];

      if (exportData.length > 0) {
        const buffer = generateExcelSimple(exportData);
        const fileKey = await storage.uploadFile({
          fileContent: buffer,
          fileName: `backups/${date}/payments_${timestamp}.csv`,
          contentType: "text/csv",
        });
        fileKeys.push(fileKey);
        totalRecords += exportData.length;
        results.push(`付款记录: ${exportData.length} 条记录`);
      }
    }

    // 生成汇总文件
    const summaryData = [{
      备份日期: date,
      总记录数: totalRecords,
      模块数量: modules.length,
      详情: results.join("; "),
    }];
    const summaryBuffer = generateExcelSimple(summaryData);
    const summaryKey = await storage.uploadFile({
      fileContent: summaryBuffer,
      fileName: `backups/${date}/summary_${timestamp}.csv`,
      contentType: "text/csv",
    });

    // 更新记录状态为成功
    if (recordId) {
      await supabase
        .from("backup_records")
        .update({
          status: "success",
          file_name: `backup_${date}`,
          file_size: summaryBuffer.length,
          file_key: summaryKey,
          modules: modules.join(","),
          record_count: totalRecords,
          completed_at: new Date().toISOString(),
        })
        .eq("id", recordId);
    }

    console.log("[Backup] Export completed:", { totalRecords, results, fileKeys });

    return NextResponse.json({
      success: true,
      date: date,
      totalRecords,
      results,
      fileKeys,
      summaryKey,
    });
  } catch (error: any) {
    console.error("[Backup] Export error:", error);

    // 更新记录状态为失败
    if (recordId) {
      await supabase
        .from("backup_records")
        .update({
          status: "failed",
          error_message: error.message,
          completed_at: new Date().toISOString(),
        })
        .eq("id", recordId);
    }

    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
