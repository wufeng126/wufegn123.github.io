import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get("status");
    const type = searchParams.get("type");
    const days = searchParams.get("days");

    let query = supabase
      .from("backup_records")
      .select("*")
      .order("created_at", { ascending: false });

    if (status) {
      query = query.eq("status", status);
    }
    if (type) {
      query = query.eq("backup_type", type);
    }
    if (days) {
      const date = new Date();
      date.setDate(date.getDate() - parseInt(days));
      query = query.gte("created_at", date.toISOString());
    }

    const { data, error } = await query.limit(100);

    if (error) throw error;

    // 获取统计数据
    const { data: stats } = await supabase
      .from("backup_records")
      .select("status, backup_type")
      .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

    const summary = {
      total: stats?.length || 0,
      success: stats?.filter(s => s.status === "success").length || 0,
      failed: stats?.filter(s => s.status === "failed").length || 0,
      manual: stats?.filter(s => s.backup_type === "manual").length || 0,
      auto: stats?.filter(s => s.backup_type === "auto").length || 0,
    };

    return NextResponse.json({ data: data || [], summary });
  } catch (error: any) {
    console.error("Backup records error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    const body = await request.json();
    const { action, record_id, module } = body;

    if (action === "trigger") {
      // 手动触发备份
      const { data: record, error: insertError } = await supabase
        .from("backup_records")
        .insert({
          backup_date: new Date().toISOString().split("T")[0],
          backup_type: "manual",
          status: "pending",
          modules: module || "suppliers,contracts,settlements,workers,limit_prices",
          created_by: body.user_id,
          created_by_name: body.user_name,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      return NextResponse.json({
        success: true,
        message: "备份任务已创建",
        data: { record_id: record.id },
      });
    }

    if (action === "retry" && record_id) {
      const { data, error } = await supabase
        .from("backup_records")
        .update({
          status: "pending",
          error_message: null,
          completed_at: null,
        })
        .eq("id", record_id)
        .select()
        .single();

      if (error) throw error;

      return NextResponse.json({
        success: true,
        message: "备份任务已重试",
        data,
      });
    }

    return NextResponse.json({ error: "未知操作" }, { status: 400 });
  } catch (error: any) {
    console.error("Backup trigger error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "缺少记录ID" }, { status: 400 });
    }

    const { error } = await supabase
      .from("backup_records")
      .delete()
      .eq("id", parseInt(id));

    if (error) throw error;

    return NextResponse.json({ success: true, message: "备份记录已删除" });
  } catch (error: any) {
    console.error("Backup delete error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
