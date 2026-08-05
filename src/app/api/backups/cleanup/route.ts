import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { S3Storage } from "coze-coding-dev-sdk";
import { requireSuperAdmin } from "@/lib/api-auth";

export async function POST(request: NextRequest) {
  const auth = await requireSuperAdmin(request);
  if (!auth.ok) {
    return auth.response;
  }

  const supabase = getSupabaseClient();
  try {
    const storage = new S3Storage({
      endpointUrl: process.env.OSS_ENDPOINT,
      accessKey: process.env.OSS_ACCESS_KEY_ID || '',
      secretKey: process.env.OSS_ACCESS_KEY_SECRET || '',
      bucketName: process.env.OSS_BUCKET_NAME,
      region: process.env.OSS_REGION || 'cn-beijing',
    });

    // 获取30天前的日期
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 30);
    const cutoffDateStr = cutoffDate.toISOString().split("T")[0];

    // 查询过期的备份记录
    const { data: oldRecords } = await supabase
      .from("backup_records")
      .select("id, file_key, backup_date")
      .lt("backup_date", cutoffDateStr)
      .eq("status", "success");

    if (!oldRecords || oldRecords.length === 0) {
      return NextResponse.json({
        success: true,
        message: "没有需要清理的过期备份",
        deleted_count: 0,
      });
    }

    let deletedCount = 0;
    const deletedIds: number[] = [];

    // 删除对象存储中的文件
    for (const record of oldRecords) {
      try {
        if (record.file_key) {
          await storage.deleteFile({ fileKey: record.file_key });
        }
        deletedCount++;
        deletedIds.push(record.id);
      } catch (deleteError) {
        console.error(`[Cleanup] Failed to delete ${record.file_key}:`, deleteError);
      }
    }

    // 从数据库删除记录
    if (deletedIds.length > 0) {
      await supabase
        .from("backup_records")
        .delete()
        .in("id", deletedIds);
    }

    console.log(`[Cleanup] Deleted ${deletedCount} expired backup records`);

    return NextResponse.json({
      success: true,
      message: `已清理 ${deletedCount} 条过期备份记录`,
      deleted_count: deletedCount,
    });
  } catch (error: any) {
    console.error("[Cleanup] Error:", error);
    return NextResponse.json(
      { success: false, error: `清理失败: ${error.message}` },
      { status: 500 }
    );
  }
}
