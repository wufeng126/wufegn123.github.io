import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { requireAuth } from "@/lib/api-auth";
import { assertProjectAccess } from "@/lib/api-project-scope";
import { OSSStorage } from '@/lib/oss-storage';

function createStorage() {
  return new OSSStorage();
}

// 上传签证附件
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const formData = await request.formData();
    const file = formData.get("file") as File;
    const visaId = formData.get("visaId") as string;
    const shouldReplace = formData.get("replace") === "true";

    if (!file || !visaId) {
      return NextResponse.json(
        { error: "请选择文件和签证记录" },
        { status: 400 }
      );
    }

    // 项目范围校验：只能给自己有权限项目的签证上传附件
    {
      const supabase = getSupabaseClient();
      const { data: visaRow } = await supabase
        .from("visas")
        .select("project_id")
        .eq("id", Number(visaId))
        .maybeSingle();
      if (!visaRow) {
        return NextResponse.json({ error: "签证记录不存在" }, { status: 404 });
      }
      const access = await assertProjectAccess(supabase, auth.user, (visaRow as { project_id?: number }).project_id);
      if (!access.ok) return access.response;
    }

    // 验证文件大小（10MB）
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: "文件大小不能超过10MB" },
        { status: 400 }
      );
    }

    // 验证文件类型
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "不支持的文件类型" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseClient();

    // 验证签证记录存在
    const { data: visa, error: visaError } = await supabase
      .from("visas")
      .select("id, project_id")
      .eq("id", visaId)
      .single();

    if (visaError || !visa) {
      return NextResponse.json(
        { error: "签证记录不存在" },
        { status: 404 }
      );
    }

    // 上传到对象存储
    const storage = createStorage();
    const uniqueFileName = `${Date.now()}-${file.name}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    
    // 使用 SDK 的 uploadFile 方法
    const actualFileKey = await storage.uploadFile({
      fileContent: buffer,
      fileName: `visa-attachments/${visaId}/${uniqueFileName}`,
      contentType: file.type,
    });

    // 保存附件记录
    const { data: attachment, error: insertError } = await supabase
      .from("visa_attachments")
      .insert({
        visa_id: visaId,
        file_name: file.name,
        file_key: actualFileKey,
        file_size: file.size,
        file_type: file.type,
        uploaded_by: auth.user.id,
      })
      .select()
      .single();

    if (insertError) {
      // 清理已上传的文件
      await storage.deleteFile({ fileKey: actualFileKey });
      return NextResponse.json(
        { error: "保存附件记录失败" },
        { status: 500 }
      );
    }

    if (shouldReplace) {
      const { data: oldAttachments } = await supabase
        .from("visa_attachments")
        .select("id,file_key")
        .eq("visa_id", visaId)
        .neq("id", attachment.id);

      if (oldAttachments && oldAttachments.length > 0) {
        for (const oldAttachment of oldAttachments) {
          if (oldAttachment.file_key) {
            await storage.deleteFile({ fileKey: oldAttachment.file_key }).catch((err) => {
              console.error("删除旧签证附件文件失败:", err);
            });
          }
        }

        await supabase
          .from("visa_attachments")
          .delete()
          .in("id", oldAttachments.map((item: { id: string | number }) => item.id));
      }
    }

    return NextResponse.json({
      success: true,
      data: attachment,
    });
  } catch (error) {
    console.error("上传签证附件失败:", error);
    return NextResponse.json(
      { error: "服务器错误" },
      { status: 500 }
    );
  }
}
