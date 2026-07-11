import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { verifyRequest } from "@/lib/auth";
import { S3Storage } from "coze-coding-dev-sdk";

// 删除签证附件
export async function DELETE(request: NextRequest) {
  try {
    const auth = await verifyRequest(request);
    if (!auth?.id) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    const userId = auth.id;

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

    // 获取用户信息
    const { data: user } = await supabase
      .from("users")
      .select("role, managed_projects")
      .eq("id", userId)
      .single();

    // 非超级管理员需要验证项目权限
    const projectId = attachment.visas?.project_id;
    if ((user as any)?.role !== "super_admin" && userId !== 1) {
      if (projectId && (user as any)?.managed_projects && Array.isArray((user as any).managed_projects)) {
        if (!((user as any).managed_projects as number[]).includes(projectId)) {
          return NextResponse.json(
            { error: "无权删除此附件" },
            { status: 403 }
          );
        }
      }
    }

    // 删除文件
    const storage = new S3Storage({
      endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
      bucketName: process.env.COZE_BUCKET_NAME,
    });
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
