'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Loader2,
  Zap,
  Building2,
  Users,
  BarChart3,
  BookOpen,
  Calculator,
  ClipboardList,
  ReceiptText,
  Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePermission } from '@/contexts/permission-context';
import { FloatingAIAssistant } from '@/components/floating-ai-assistant';
import NotificationBell from '@/components/notification-bell';

// 菜单权限映射 - 用于判断哪些一级菜单对当前角色可见
// 使用各 Tab 中权限最宽松的 code（通常是 :view 或 :list），用户拥有其中任意一个即可看到菜单
const MENU_VISIBILITY: Record<string, string[]> = {
  '/workspace': [],  // 工作台所有人都可见
  '/project-center': ['projects:view', 'work_items:view', 'visas:view', 'client_reports:view', 'client_payments:view'],
  '/hr-salary': ['workers:view', 'certificates:view', 'salaries:view', 'salaries:pay', 'salaries:query'],
  '/supplier-expense': ['suppliers:view', 'settlements:view', 'supplier_payments:view', 'comprehensive_expenses:view', 'miscellaneous_materials:view'],
  '/business-analysis': ['cost_center:view', 'data_board:worker_cost_view', 'data_board:supplier_cost_view', 'data_board:fund_management_view', 'reports:monthly_view', 'suppliers:view', 'settlements:view', 'supplier_payments:view', 'comprehensive_expenses:view', 'miscellaneous_materials:view'],
  '/construction-logs': [],
  '/cost-estimation': [],
  '/knowledge': [],
  '/system-management': ['system:manage', 'system:permission_manage', 'system:dingtalk_manage', 'notifications:view', 'system:ai_manage', 'audit:view'],
};

// 一级导航
const TOP_LEVEL_MENUS = [
  { name: '工作台', href: '/workspace', icon: LayoutDashboard },
  { name: '项目管理', href: '/project-center', icon: Building2 },
  { name: '施工管理', href: '/construction-logs', icon: ClipboardList },
  { name: '人力资源', href: '/hr-salary', icon: Users },
  { name: '供应商与费用', href: '/supplier-expense', icon: ReceiptText },
  { name: '经营分析', href: '/business-analysis', icon: BarChart3 },
  { name: '投标测算', href: '/cost-estimation/bid', icon: Calculator },
  { name: '知识库', href: '/knowledge', icon: BookOpen },
  { name: '系统管理', href: '/system-management', icon: Settings },
];

// 页面标题映射
const PAGE_TITLE_MAP: Record<string, string> = {
  '/': '业务工作台',
  '/workspace': '工作台',
  '/project-center': '项目管理',
  '/quantity-reporting': '报量管理',
  '/hr-salary': '人力资源',
  '/supplier-expense': '供应商与费用',
  '/business-analysis': '经营分析',
  '/construction-logs': '施工管理',
  '/cost-estimation': '投标测算',
  '/knowledge': '知识库',
  '/system-management': '系统管理',
  // 保留旧路由标题映射
  '/projects': '项目管理',
  '/work-items': '报量管理',
  '/limit-prices': '限价管理',
  '/visas': '签证管理',
  '/workers/roster': '花名册',
  '/workers/salaries': '月度工资',
  '/workers/query': '工资查询',
  '/workers/payments': '工资发放',
  '/certificates': '证件管理',
  '/client-reports': '产值结算',
  '/client-payments': '甲方回款',
  '/cost-center': '成本利润中心',
  '/data-board/supplier-cost': '供应商成本看板',
  '/data-board/worker-cost': '工人成本看板',
  '/data-board/fund-management': '资金管理看板',
  '/notifications': '消息通知中心',
  '/supplier-contracts/account': '供应商库',
  '/supplier-contracts/settlement': '结算管理',
  '/payments': '付款记录',
  '/comprehensive-expenses': '综合费用',
  '/miscellaneous-materials': '零星材料',
  '/settings/backup': '数据备份管理',
  '/system/dingtalk-binding': '钉钉通讯录绑定',
  '/system/ai-config': 'AI 助手配置',
  '/system/permission': '权限管理中心',
  '/system/audit-logs': '日志管理',
  '/system/approval-config': '审批流程配置',
  '/admin': '后台管理',
  '/ai-assistant': 'AI 劳务助手',
  '/reports/monthly': '月度经营月报',
};

// 桌面端阈值
const DESKTOP_BREAKPOINT = 768;

export default function SidebarLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [hoverExpanded, setHoverExpanded] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isMobile, setIsMobile] = useState(true);
  const [viewportWidth, setViewportWidth] = useState(768);
  const pathname = usePathname();
  const router = useRouter();

  const { user, isSuperAdmin, isLoading, permissions } = usePermission();
  const isLoginPage = pathname === '/login' || pathname === '/dingtalk' || pathname === '/ui-preview';

  useEffect(() => {
    const checkMobile = () => {
      const width = window.innerWidth;
      setViewportWidth(width);
      const ua = navigator.userAgent.toLowerCase();
      const isDingTalk = ua.includes('dingtalk') || ua.includes('ddclient');
      const mobile = width < DESKTOP_BREAKPOINT || (isDingTalk && width < 900);
      setIsMobile(mobile);
      if (mobile) {
        setSidebarOpen(false);
        setCollapsed(false);
      }
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      setSidebarOpen(false);
    });
  }, [pathname]);

  const hasAnyPermission = (perms?: string[]) => {
    if (!perms || perms.length === 0) return true;
    if (isSuperAdmin) return true;
    return perms.some(p => permissions.includes(p) || p === '*');
  };

  // 判断一级菜单是否对当前角色可见
  const isMenuVisible = (menuHref: string) => {
    const requiredPerms = MENU_VISIBILITY[menuHref];
    return hasAnyPermission(requiredPerms);
  };

  // 判断哪个一级菜单当前激活
  const getActiveMenu = () => {
    // 工作台特殊处理
    if (pathname === '/' || pathname === '/workspace') return '/workspace';
    if (pathname.startsWith('/ai-assistant')) return '/workspace';

    // 项目管理
    if (['/project-center', '/projects', '/quantity-reporting', '/work-items', '/limit-prices', '/visas', '/client-reports', '/client-payments'].some(p => pathname.startsWith(p))) return '/project-center';

    // 人力资源
    if (['/hr-salary', '/workers', '/certificates'].some(p => pathname.startsWith(p))) return '/hr-salary';

    // 施工管理
    if (pathname.startsWith('/construction-logs') || pathname.startsWith('/construction-attendance') || pathname.startsWith('/reports/monthly')) return '/construction-logs';

    // 供应商与费用
    if (['/supplier-expense', '/supplier-contracts', '/payments', '/settlement', '/settlements', '/suppliers', '/comprehensive-expenses', '/miscellaneous-materials'].some(p => pathname.startsWith(p))) return '/supplier-expense';

    // 经营分析
    if (['/business-analysis', '/cost-center', '/data-board'].some(p => pathname.startsWith(p))) return '/business-analysis';

    // 投标测算
    if (pathname.startsWith('/cost-estimation')) return '/cost-estimation/bid';

    // 知识库
    if (pathname.startsWith('/knowledge')) return '/knowledge';

    // 系统管理
    if (['/system-management', '/system/', '/notifications', '/settings/', '/admin', '/dingtalk'].some(p => pathname.startsWith(p))) return '/system-management';

    return '';
  };

  if (isLoginPage) {
    return <>{children}</>;
  }

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
    } catch {
      router.push('/login');
    } finally {
      setIsLoggingOut(false);
    }
  };

  const isEffectivelyCollapsed = !isMobile && collapsed && !hoverExpanded;
  const sidebarWidth = isMobile ? 280 : (isEffectivelyCollapsed ? 64 : 220);

  const activeMenu = getActiveMenu();

  // 获取当前页面标题
  const getPageTitle = () => {
    for (const [path, title] of Object.entries(PAGE_TITLE_MAP)) {
      if (path === '/' ? pathname === '/' : pathname.startsWith(path)) {
        return title;
      }
    }
    return '建筑劳务管理系统';
  };

  // ========== 侧边栏样式 ==========
  const asideStyle: React.CSSProperties = isMobile
    ? {
        position: 'fixed',
        top: 0,
        left: 0,
        bottom: 0,
        width: Math.min(280, viewportWidth * 0.8) + 'px',
        zIndex: 50,
        background: '#FFFFFF',
        borderRight: '1px solid #E5E7EB',
        boxShadow: sidebarOpen ? '4px 0 24px rgba(15, 23, 42, 0.12)' : 'none',
        transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        overflowY: 'hidden',
        WebkitOverflowScrolling: 'touch',
      }
    : {
        position: 'relative',
        width: `${sidebarWidth}px`,
        minWidth: `${sidebarWidth}px`,
        zIndex: 'auto',
        background: '#FFFFFF',
        borderRight: '1px solid #E5E7EB',
        transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1), min-width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        overflowY: 'hidden',
        WebkitOverflowScrolling: 'touch',
      };

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--background)' }}>
      {/* 科技感背景网格 */}
      <div style={{
        position: 'fixed',
        inset: 0,
        backgroundImage: 'radial-gradient(circle, rgba(22,93,255,0.04) 1px, transparent 1px)',
        backgroundSize: '24px 24px',
        pointerEvents: 'none',
        zIndex: 0,
      }} />
      {/* 顶部渐变色带 */}
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: '1px',
        background: 'linear-gradient(90deg, transparent, #165DFF, #7C3AED, transparent)',
        opacity: 0.6,
        zIndex: 100,
        pointerEvents: 'none',
      }} />
      {/* 移动端遮罩层 */}
      {isMobile && sidebarOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 40,
            background: 'rgba(0,0,0,0.3)',
            backdropFilter: 'blur(4px)',
          }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* 侧边栏 */}
      <aside
        style={asideStyle}
        className="flex flex-col"
        onMouseEnter={() => { if (!isMobile && collapsed) setHoverExpanded(true); }}
        onMouseLeave={() => { if (!isMobile && collapsed) setHoverExpanded(false); }}
      >
        {/* Logo 区域 */}
        <div
          style={{
            position: 'relative',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            height: '56px',
            minHeight: '56px',
            padding: isEffectivelyCollapsed ? '0 10px' : '0 16px',
            justifyContent: isEffectivelyCollapsed ? 'center' : undefined,
            background: '#FFFFFF',
            borderBottom: '1px solid #E5E7EB',
          }}
        >
          {/* Logo图标 */}
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              background: '#2563EB',
              boxShadow: '0 4px 12px rgba(37, 99, 235, 0.22)',
            }}
          >
            <Zap className="w-5 h-5 text-white" />
          </div>
          {!isEffectivelyCollapsed && (
            <div style={{ flex: 1, minWidth: 0, marginLeft: '12px' }}>
              <h1 style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                建筑劳务管理
              </h1>
              <p style={{ fontSize: '10px', color: '#64748B', letterSpacing: '0.5px' }}>
                Construction Management
              </p>
            </div>
          )}
          {/* 移动端关闭按钮 */}
          {isMobile && (
            <button
              onClick={() => setSidebarOpen(false)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '36px',
                height: '36px',
                marginRight: '-8px',
                borderRadius: '8px',
                color: '#64748B',
                flexShrink: 0,
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              aria-label="关闭菜单"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* 导航菜单 */}
        <nav
          className="sidebar-nav-scroll flex-1"
          style={{
            overflowY: 'auto',
            overflowX: 'hidden',
            WebkitOverflowScrolling: 'touch',
            scrollbarWidth: 'thin',
            padding: isEffectivelyCollapsed ? '12px 8px' : '12px 12px',
          }}
        >
          <div className="space-y-1">
            {TOP_LEVEL_MENUS
              .filter(menu => isMenuVisible(menu.href))
              .map((menu) => {
                const isActive = activeMenu === menu.href;
                const Icon = menu.icon;
                return (
                  <Link
                    key={menu.href}
                    href={menu.href}
                    className={cn(
                      'flex items-center gap-3 rounded-lg transition-all duration-200 relative group',
                      isEffectivelyCollapsed ? 'justify-center px-0 py-3' : 'px-3 py-3'
                    )}
                    style={{
                      background: isActive ? '#EFF6FF' : 'transparent',
                      color: isActive ? '#1D4ED8' : '#475569',
                    }}
                    onMouseOver={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.background = '#F8FAFC'; }}
                    onMouseOut={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                    title={isEffectivelyCollapsed ? menu.name : undefined}
                    onClick={() => { setSidebarOpen(false); setHoverExpanded(false); }}
                  >
                    {/* 左侧激活指示条 */}
                    {isActive && (
                      <div
                        className="absolute left-0 top-1/2 -translate-y-1/2 rounded-r-full"
                        style={{
                          width: '3px',
                          height: '60%',
                          background: '#2563EB',
                          transition: 'all 0.2s ease',
                        }}
                      />
                    )}
                    <div
                      className={cn(
                        'flex items-center justify-center flex-shrink-0 transition-all duration-200',
                        isEffectivelyCollapsed ? 'w-8 h-8' : 'w-8 h-8'
                      )}
                      style={{
                        borderRadius: '8px',
                        background: isActive ? '#DBEAFE' : '#F1F5F9',
                      }}
                    >
                      <Icon
                        className="w-[18px] h-[18px] transition-colors duration-200"
                        style={{ color: isActive ? '#2563EB' : '#64748B' }}
                      />
                    </div>
                    {!isEffectivelyCollapsed && (
                      <span
                        className="text-[13px] transition-colors duration-200"
                        style={{
                          color: isActive ? '#1D4ED8' : '#475569',
                          fontWeight: isActive ? 600 : 400,
                        }}
                      >
                        {menu.name}
                      </span>
                    )}
                    {/* 激活指示圆点 */}
                    {isActive && !isEffectivelyCollapsed && (
                      <div style={{
                        position: 'absolute',
                        right: '12px',
                        width: '5px',
                        height: '5px',
                        borderRadius: '50%',
                        background: '#2563EB',
                      }} />
                    )}
                  </Link>
                );
              })}
          </div>
        </nav>

        {/* 底部固定区域：折叠按钮 */}
        <div style={{ borderTop: '1px solid var(--border-color)', flexShrink: 0 }}>
          {!isMobile && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '40px',
                minHeight: '40px',
              }}
            >
              <button
                onClick={() => { setCollapsed(!collapsed); setHoverExpanded(false); }}
                className="flex items-center justify-center w-full h-full transition-colors duration-200"
                style={{
                  color: 'var(--color-text-3)',
                  fontSize: '12px',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                }}
                onMouseOver={(e) => { (e.currentTarget as HTMLElement).style.background = '#F7F8FA'; }}
                onMouseOut={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                aria-label={collapsed ? '展开菜单' : '折叠菜单'}
              >
                {collapsed ? (
                  <ChevronRight className="w-4 h-4" />
                ) : (
                  <>
                    <ChevronLeft className="w-4 h-4" style={{ marginRight: '4px' }} />
                    <span>收起</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* 主内容区 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0, position: 'relative', zIndex: 1 }}>
        {/* 顶部导航栏 */}
        <header
          style={{
            height: '56px',
            minHeight: '56px',
            display: 'flex',
            alignItems: 'center',
            padding: isMobile ? '0 12px' : '0 24px',
            background: '#FFFFFF',
            borderBottom: '1px solid var(--border-color)',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
            flexShrink: 0,
            zIndex: 10,
            position: 'relative',
          }}
        >
          {/* 移动端汉堡按钮 */}
          {isMobile && (
            <button
              onClick={() => setSidebarOpen(true)}
              className="flex items-center justify-center mr-2 -ml-2 w-10 h-10 rounded-lg text-[var(--color-text-2)] bg-transparent border-none cursor-pointer"
              aria-label="打开菜单"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}

          {/* 页面标题 */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2
              className="text-[15px] font-semibold truncate"
              style={{ color: 'var(--color-text-1)' }}
            >
              {getPageTitle()}
            </h2>
          </div>

          {/* 右侧操作区 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* 通知铃铛 */}
            <NotificationBell />

            {/* 用户信息 */}
            <div className="flex items-center gap-2">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{
                  background: 'var(--primary)',
                  color: '#FFFFFF',
                  fontSize: '12px',
                  fontWeight: 600,
                  boxShadow: '0 2px 6px rgba(22, 93, 255, 0.2)',
                }}
              >
                {user?.name?.charAt(0) || 'U'}
              </div>
              {!isMobile && (
                <div className="flex flex-col">
                  <span className="text-[13px] font-medium" style={{ color: 'var(--color-text-1)' }}>
                    {user?.name || '用户'}
                  </span>
                  <span className="text-[11px]" style={{ color: 'var(--color-text-3)' }}>
                    {isSuperAdmin ? '超级管理员' : user?.role || '用户'}
                  </span>
                </div>
              )}
              <button
                onClick={handleLogout}
                disabled={isLoggingOut}
                className="flex items-center justify-center w-8 h-8 rounded-lg transition-colors duration-200 ml-1"
                style={{ color: 'var(--color-text-3)', background: 'transparent', border: 'none', cursor: 'pointer' }}
                onMouseOver={(e) => { (e.currentTarget as HTMLElement).style.background = '#F2F3F5'; }}
                onMouseOut={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                aria-label="退出登录"
              >
                {isLoggingOut ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </header>

        {/* 内容区 */}
        <main
          className="flex-1 overflow-auto"
          style={{ background: 'var(--background)' }}
        >
          {children}
        </main>
      </div>

      {/* 全局悬浮AI助手 */}
      <FloatingAIAssistant />
    </div>
  );
}
