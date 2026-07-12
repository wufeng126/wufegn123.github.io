'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Bell, AlertTriangle, FileText, TrendingDown, CreditCard, Users, CheckCircle } from 'lucide-react';

interface NotifItem {
  id: number; title: string; content: string; type: string;
  severity: string; is_read: boolean; created_at: string; related_type: string; related_id: number;
}

const iconMap: Record<string, any> = {
  construction_log_alert: AlertTriangle,
  monthly_analysis_workflow: FileText,
  salary_alert: CreditCard,
  default: Bell,
};

export default function NotificationBell() {
  const [count, setCount] = useState(0);
  const [notifs, setNotifs] = useState<NotifItem[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // 点击外部关闭
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  async function fetchUnread() {
    try {
      const res = await fetch('/api/notifications?isRead=false&limit=8');
      const json = await res.json();
      if (json.success) {
        setCount(json.stats?.unread ?? 0);
        setNotifs(json.notifications?.slice(0, 8) ?? []);
      }
    } catch {}
  }

  useEffect(() => {
    fetchUnread();
    const timer = setInterval(fetchUnread, 30000); // 每30秒刷新
    return () => clearInterval(timer);
  }, []);

  async function markRead(id: number) {
    await fetch('/api/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, isRead: true }) });
    fetchUnread();
  }

  const severityColor: Record<string, string> = {
    danger: '#F53F3F', warning: '#FA8C16', info: '#165DFF',
  };

  return (
    <div ref={ref} className="relative">
      <button onClick={() => { setOpen(!open); if (!open) fetchUnread(); }} className="relative flex items-center justify-center w-9 h-9 rounded-lg transition-colors hover:bg-[#F2F3F5]" title="消息通知">
        <Bell className="w-[18px] h-[18px]" style={{ color: count > 0 ? '#165DFF' : '#4E5969' }} />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-[#F53F3F] text-[10px] font-bold text-white flex items-center justify-center leading-none shadow">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 w-[380px] bg-white rounded-xl shadow-xl border border-[#E5E6EB] z-50 overflow-hidden">
          {/* 头部 */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#E5E6EB]">
            <span className="text-sm font-semibold text-[#1D2129]">消息通知</span>
            <div className="flex items-center gap-2">
              {count > 0 && (
                <button onClick={async () => { await fetch('/api/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ all: true, isRead: true }) }); fetchUnread(); }}
                  className="text-xs text-[#165DFF] hover:underline">全部已读</button>
              )}
              <Link href="/notifications" onClick={() => setOpen(false)} className="text-xs text-[#86909C] hover:text-[#165DFF]">查看全部</Link>
            </div>
          </div>

          {/* 列表 */}
          <div className="max-h-[400px] overflow-y-auto">
            {notifs.length === 0 ? (
              <div className="py-10 text-center text-sm text-[#86909C]">暂无未读消息</div>
            ) : (
              notifs.map(n => {
                const Icon = iconMap[n.type] || iconMap.default;
                return (
                  <Link key={n.id} href={`/notifications`} onClick={() => { markRead(n.id); setOpen(false); }}
                    className="flex items-start gap-3 px-4 py-3 hover:bg-[#F8FAFF] transition border-b border-[#F2F3F5] last:border-0">
                    <div className="mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${severityColor[n.severity] || '#86909C'}15` }}>
                      <Icon className="h-4 w-4" style={{ color: severityColor[n.severity] || '#86909C' }} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[#1D2129] line-clamp-1">{n.title}</p>
                      <p className="text-xs text-[#86909C] mt-0.5 line-clamp-2">{n.content}</p>
                      <p className="text-[10px] text-[#A9AEB8] mt-1">{formatTimeAgo(n.created_at)}</p>
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function formatTimeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min}分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}小时前`;
  const days = Math.floor(hr / 24);
  if (days < 7) return `${days}天前`;
  return new Date(dateStr).toLocaleDateString('zh-CN');
}
