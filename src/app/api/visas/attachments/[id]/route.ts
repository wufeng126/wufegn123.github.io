import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { requireAuth } from "@/lib/api-auth";
import { assertProjectAccess } from "@/lib/api-project-scope";
import { OSSStorage } from '@/lib/oss-storage';

// 删除签证附件
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const attachmentId = searchParams.get("id");

    if (!attachmentId) {
      return NextResponse.json(
        { error: "请提供附件ID" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseClient();

    // 获取附件记录
    const { data: attachment, error: fetchError } = await supabase
      .from("visa_attachments")
      .select("*, visas(project_id)")
      .eq("id", attachmentId)
      .single();

    if (fetchError || !attachment) {
      return NextResponse.json({ error: "附件不存在" }, { status: 404 });
    }

    // 项目范围校验
    const projectId = (attachment as { visas?: { project_id?: number } }).visas?.project_id;
    const access = await assertProjectAccess(supabase, auth.user, projectId);
    if (!access.ok) return access.response;

    // 删除文件
    const storage = new OSSStorage();
    await storage.deleteFile({ fileKey: attachment.file_key });

    // 删除数据库记录
    const { error: deleteError } = await supabase
      .from("visa_attachments")
      .delete()
      .eq("id", attachmentId);

    if (deleteError) {
      return NextResponse.json(
        { error: "删除附件记录失败" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Visa Attachment] Delete error:", error);
    return NextResponse.json({ error: "删除失败" }, { status: 500 });
  }
}
