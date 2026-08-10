'use client';

import { useEffect, useState, useRef } from 'react';
import { Upload, FileText, Trash2, Download, Loader2, Sparkles } from 'lucide-react';

interface Contract {
  id: number; file_name: string; file_size: number; file_type: string; remark: string; created_at: string;
}

export default function ProjectContracts({ projectId }: { projectId: string }) {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [aiUploading, setAiUploading] = useState(false);
  const [aiMsg, setAiMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const aiFileRef = useRef<HTMLInputElement>(null);

  async function load() {
    try {
      const res = await fetch(`/api/project-contracts?projectId=${projectId}`);
      const json = await res.json();
      if (json.success) setContracts(json.data || []);
    } catch {} finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [projectId]);

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append('file', file);
        form.append('projectId', projectId);
        await fetch('/api/project-contracts', { method: 'POST', body: form });
      }
      load();
    } finally { setUploading(false); }
  }

  // 上传合同文件到 AI 知识库（供 AI 劳务助手检索问答：清单内容、单价等）
  async function uploadToAi(files: FileList | null) {
    if (!files || files.length === 0) return;
    setAiUploading(true);
    setAiMsg('');
    try {
      const results: string[] = [];
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append('file', file);
        form.append('title', file.name);
        form.append('category', 'contract');
        const res = await fetch('/api/ai/knowledge/upload', { method: 'POST', body: form });
        const json = await res.json();
        if (json.success) {
          results.push(file.name);
        } else {
          setAiMsg(json.error || `「${file.name}」入库失败`);
        }
      }
      if (results.length > 0) {
        setAiMsg(`✅ ${results.join('、')} 已入库 AI 知识库，可在「AI 劳务助手」中询问合同清单与单价`);
      }
    } catch (e) {
      setAiMsg('上传失败，请稍后重试');
    } finally { setAiUploading(false); }
  }

  async function remove(id: number) {
    if (!confirm('确认删除？')) return;
    await fetch(`/api/project-contracts?id=${id}`, { method: 'DELETE' });
    load();
  }

  function formatSize(bytes: number) {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-[#1D2129]">📄 合同文件</h3>
        <div className="flex items-center gap-2">
          <input ref={aiFileRef} type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.jpg,.jpeg,.png,.webp,.bmp" className="hidden"
            onChange={e => { uploadToAi(e.target.files); e.target.value = ''; }} />
          <button onClick={() => aiFileRef.current?.click()} disabled={aiUploading}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#00B42A] bg-[#E8FFEA] px-3 text-sm text-[#009A29] hover:bg-[#D6F5DB] disabled:opacity-50">
            {aiUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {aiUploading ? '入库中...' : '上传到 AI 助手'}
          </button>
          <input ref={fileRef} type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.png" className="hidden"
            onChange={e => { upload(e.target.files); e.target.value = ''; }} />
          <button onClick={() => fileRef.current?.click()} disabled={uploading}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#165DFF] px-4 text-sm text-white hover:bg-[#0E49D8] disabled:opacity-50">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {uploading ? '上传中...' : '上传合同'}
          </button>
        </div>
      </div>

      {aiMsg && (
        <div className={`rounded-lg px-3 py-2 text-xs ${aiMsg.startsWith('✅') ? 'bg-[#E8FFEA] text-[#009A29]' : 'bg-[#FFF1F0] text-[#F53F3F]'}`}>
          {aiMsg}
        </div>
      )}

      <p className="text-xs text-[#86909C] -mt-1">💡 提示：点「上传到 AI 助手」把合同清单和单价同步进知识库后，可在「AI 劳务助手」中直接询问（如"XX项目合同的清单内容有哪些""某清单项单价是多少"）。<span className="text-[#165DFF]">扫描件：图片（jpg/png）会自动 OCR 识别；扫描版 PDF 请先转成图片或文字版再传。</span></p>

      {loading ? (
        <div className="text-center py-8 text-sm text-[#86909C]">加载中...</div>
      ) : contracts.length === 0 ? (
        <div className="border border-dashed border-[#E5E6EB] rounded-xl p-8 text-center">
          <FileText className="h-10 w-10 text-[#C9CDD4] mx-auto mb-3" />
          <p className="text-sm text-[#86909C]">暂无合同文件</p>
          <p className="text-xs text-[#A9AEB8] mt-1">点击「上传合同」上传PDF、Word、Excel等文件</p>
        </div>
      ) : (
        <div className="space-y-2">
          {contracts.map(c => (
            <div key={c.id} className="flex items-center gap-3 p-3 rounded-xl border border-[#E5E6EB] hover:border-[#165DFF]/20 transition group">
              <FileText className="h-8 w-8 text-[#165DFF] shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-[#1D2129] truncate">{c.file_name}</p>
                <p className="text-xs text-[#86909C]">{formatSize(c.file_size)} · {c.created_at?.slice(0, 10)}{c.remark ? ` · ${c.remark}` : ''}</p>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                <a href={`/api/project-contracts/download?id=${c.id}`}
                  className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-[#F2F3F5] text-[#4E5969]">
                  <Download className="h-4 w-4" />
                </a>
                <button onClick={() => remove(c.id)}
                  className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-[#FFF1F0] text-[#F53F3F]">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
