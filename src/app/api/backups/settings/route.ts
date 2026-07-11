import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

export async function GET() {
  const supabase = getSupabaseClient();
  try {
    const { data, error } = await supabase
      .from("backup_settings")
      .select("*")
      .order("setting_key");

    if (error) throw error;

    // 转换为键值对格式
    const settings: Record<string, { value: any; enabled: boolean; description: string }> = {};
    data?.forEach((item) => {
      settings[item.setting_key] = {
        value: item.setting_value,
        enabled: item.enabled,
        description: item.description,
      };
    });

    return NextResponse.json({ data, settings });
  } catch (error: any) {
    console.error("Backup settings error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    const body = await request.json();
    const { key, value, enabled, description } = body;

    if (!key) {
      return NextResponse.json({ error: "缺少设置键名" }, { status: 400 });
    }

    // 检查是否存在
    const { data: existing } = await supabase
      .from("backup_settings")
      .select("id")
      .eq("setting_key", key)
      .single();

    if (existing) {
      // 更新
      const { data, error } = await supabase
        .from("backup_settings")
        .update({
          setting_value: value,
          enabled: enabled !== undefined ? enabled : true,
          description: description,
          updated_at: new Date().toISOString(),
        })
        .eq("setting_key", key)
        .select()
        .single();

      if (error) throw error;
      return NextResponse.json({ success: true, data });
    } else {
      // 新增
      const { data, error } = await supabase
        .from("backup_settings")
        .insert({
          setting_key: key,
          setting_value: value,
          enabled: enabled !== undefined ? enabled : true,
          description: description,
        })
        .select()
        .single();

      if (error) throw error;
      return NextResponse.json({ success: true, data });
    }
  } catch (error: any) {
    console.error("Backup settings update error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
