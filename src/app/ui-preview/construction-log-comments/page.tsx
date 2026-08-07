import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  FileText,
  ImageIcon,
  MapPin,
  MessageSquareMore,
  Send,
  Users,
} from 'lucide-react';

const comments = [
  {
    id: 1,
    user: '王建军',
    time: '2026-08-03 10:24',
    content: '这里需要补一张甲方变更确认单，下午项目经理同步一下签证流程。',
    mentions: ['项目经理', '预算员'],
  },
  {
    id: 2,
    user: '赵鹏',
    time: '2026-08-03 09:18',
    content: '人员出勤和施工内容看起来一致，照片也齐了，可以先留档。',
    mentions: [],
  },
];

const photos = [
  'https://images.unsplash.com/photo-1517048676732-d65bc937f952?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1523413651479-597eb2da0ad6?auto=format&fit=crop&w=800&q=80',
];

export default function ConstructionLogCommentsPreviewPage() {
  return (
    <main className="min-h-screen bg-[#F5F6FA] px-3 py-4 sm:p-4 md:p-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-5 flex items-center justify-between gap-3">
          <Link
            href="/ui-preview/construction-logs"
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#E5E6EB] bg-white px-3 text-sm font-medium text-[#4E5969]"
          >
            <ArrowLeft className="h-4 w-4" />
            返回预览列表
          </Link>
        </div>

        <div className="space-y-4">
          <section className="rounded-xl border border-[#E5E6EB] bg-white p-4 sm:p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-sm text-[#86909C]">施工日志详情</p>
                <h1 className="mt-1 text-xl font-bold text-[#1D2129] sm:text-2xl">南京中交智慧港项目</h1>
                <div className="mt-3 flex flex-wrap gap-3 text-sm text-[#4E5969]">
                  <span className="inline-flex items-center gap-1"><CalendarDays className="h-4 w-4 text-[#165DFF]" />2026-08-03</span>
                  <span className="inline-flex items-center gap-1"><Users className="h-4 w-4 text-[#7C3AED]" />王建军</span>
                  <span className="inline-flex items-center gap-1"><MapPin className="h-4 w-4 text-[#10B981]" />主体三层东区</span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-[#10B981]/30 bg-[#E8FFEA] px-2 py-0.5 text-xs font-medium text-[#047857]">
                    已提交
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full border border-[#F7BA1E]/30 bg-[#FFF7E8] px-3 py-1 text-xs font-medium text-[#B45309]">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  风险提醒
                </span>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-[#E5E6EB] bg-white p-4 sm:p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#1D2129]">
              <FileText className="h-4 w-4 text-[#165DFF]" />
              现场记录
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-lg bg-[#F7F8FA] p-3">
                <p className="text-xs text-[#86909C]">出勤人数</p>
                <p className="mt-1 text-lg font-semibold text-[#1D2129]">14 人</p>
              </div>
              <div className="rounded-lg bg-[#F7F8FA] p-3">
                <p className="text-xs text-[#86909C]">总工时</p>
                <p className="mt-1 text-lg font-semibold text-[#1D2129]">126.5 小时</p>
              </div>
              <div className="rounded-lg bg-[#F7F8FA] p-3">
                <p className="text-xs text-[#86909C]">图片</p>
                <p className="mt-1 text-lg font-semibold text-[#1D2129]">3 张</p>
              </div>
            </div>
            <div className="mt-4 whitespace-pre-wrap rounded-lg border border-[#E5E6EB] bg-[#FBFCFF] p-4 text-sm leading-7 text-[#1D2129]">
              上午完成三层东区模板加固和钢筋绑扎，下午配合质检复核，现场整体进度正常，局部需要补充签证资料。
            </div>

            <div className="mt-4 rounded-lg border border-[#E5E6EB] bg-white p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="inline-flex items-center gap-2 text-sm font-medium text-[#1D2129]">
                  <ImageIcon className="h-4 w-4 text-[#165DFF]" />
                  现场照片
                </p>
                <span className="rounded-full bg-[#E8F3FF] px-2.5 py-1 text-xs font-medium text-[#165DFF]">3 张</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {photos.map((photo) => (
                  <img key={photo} src={photo} alt="施工照片预览" className="h-36 w-full rounded-lg object-cover" />
                ))}
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-[#E5E6EB] bg-white p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <MessageSquareMore className="h-4 w-4 text-[#165DFF]" />
                <h2 className="text-sm font-semibold text-[#1D2129]">评论提醒</h2>
              </div>
              <span className="text-xs text-[#86909C]">评论会通知项目经理、预算员、日志作者及被提及人员</span>
            </div>

            <div className="mt-4 space-y-3">
              <textarea
                rows={4}
                defaultValue="这里需要补一张甲方变更确认单，下午项目经理同步一下签证流程。"
                className="w-full rounded-lg border border-[#E5E6EB] bg-[#FBFCFF] p-3 text-sm outline-none"
              />
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-emerald-600">评论已提交，已提醒 4 人</p>
                <button className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#165DFF] px-4 text-sm font-medium text-white">
                  <Send className="h-4 w-4" />
                  提交评论
                </button>
              </div>
            </div>

            <div className="mt-5 border-t border-[#F2F3F5] pt-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-medium text-[#1D2129]">历史评论</p>
                <span className="text-xs text-[#86909C]">{comments.length} 条</span>
              </div>
              <div className="space-y-3">
                {comments.map((comment) => (
                  <div key={comment.id} className="rounded-lg border border-[#E5E6EB] bg-[#FBFCFF] p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-[#E8F3FF] px-2 py-0.5 text-xs font-medium text-[#165DFF]">
                          {comment.user}
                        </span>
                        <span className="text-xs text-[#86909C]">{comment.time}</span>
                      </div>
                      {comment.mentions.length > 0 && (
                        <span className="rounded-full bg-[#F0F5FF] px-2 py-0.5 text-xs text-[#165DFF]">
                          @ {comment.mentions.join(' / ')}
                        </span>
                      )}
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-[#1D2129]">{comment.content}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-[#F7BA1E]/30 bg-[#FFF7E8] px-4 py-3 text-sm text-[#B45309]">
              风险提醒只做确认，后续签证、月报、结算资料仍按业务页处理。
            </div>

            <div className="mt-4 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-[#10B981]" />
              <span className="text-sm text-[#4E5969]">评论提醒、风险确认和照片查看都保留在同一页。</span>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
