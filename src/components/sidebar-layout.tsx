'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  LayoutDashboard,
  Menu,
  X,
  ChevronDown,
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
  FileSpreadsheet,
  ReceiptText,
  Settings,
  CalendarClock,
  FileText,
  HandCoins,
  ShieldCheck,
  Search,
  FileCheck2,
  BellRing,
  ClipboardCheck,
  WalletCards,
  Package,
  Database,
  FileSignature,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { BrandIconContainer, BrandLogo, type BrandIconName } from '@/components/ui/brand-icon';
import { usePermission } from '@/contexts/permission-context';
import { FloatingAIAssistant } from '@/components/floating-ai-assistant';
import NotificationBell from '@/components/notification-bell';
import NotificationReadMarker from '@/components/notification-read-marker';

// 菜单权限映射 - 用于判断哪些一级菜单对当前角色可见
// 使用各 Tab 中权限最宽松的 code（通常是 :view 或 :list），用户拥有其中任意一个即可看到菜单
const MENU_VISIBILITY: Record<string, string[]> = {
  '/workspace': [],  // 工作台所有人都可见
  '/project-center': ['projects:view', 'work_items:view', 'visas:view', 'evidence_chain:view', 'client_reports:view', 'client_payments:view'],
  '/hr-salary': ['workers:view', 'certificates:view', 'salaries:view', 'salaries:pay', 'salaries:query'],
  '/supplier-expense': ['suppliers:view', 'settlements:view', 'supplier_payments:view', 'comprehensive_expenses:view', 'miscellaneous_materials:view'],
  '/team-management': ['team_groups:view', 'team_settlements:view'],
  '/team-management/groups': ['team_groups:view', 'team_settlements:view'],
  '/team-settlement': ['team_groups:view', 'team_settlements:view'],
  '/business-analysis': ['business_overview:view', 'cost_center:view', 'data_board:worker_cost_view', 'data_board:supplier_cost_view', 'data_board:fund_management_view', 'reports:monthly_view', 'suppliers:view', 'settlements:view', 'supplier_payments:view', 'comprehensive_expenses:view', 'miscellaneous_materials:view'],
  '/construction-logs': [],
  '/cost-estimation': [],
  '/knowledge': [],
  '/system-management': ['system:manage', 'system:permission_manage', 'system:dingtalk_manage', 'notifications:view', 'system:ai_manage', 'audit:view'],
};

// 一级导航（group: 业务 / 决策 / 系统，用于分组标题）
const TOP_LEVEL_MENUS: Array<{ name: string; href: string; icon: BrandIconName; group?: string }> = [
  { name: '工作台', href: '/workspace', icon: 'trend' },
  { name: '项目管理', href: '/project-center', icon: 'building', group: '业务' },
  { name: '施工管理', href: '/construction-logs', icon: 'crane', group: '业务' },
  { name: '人力与工资', href: '/hr-salary', icon: 'worker', group: '业务' },
  { name: '供应商与费用', href: '/supplier-expense', icon: 'wrench', group: '业务' },
  { name: '班组管理', href: '/team-management/groups', icon: 'chart', group: '业务' },
  { name: '经营分析', href: '/business-analysis', icon: 'chart', group: '决策' },
  { name: '投标测算', href: '/cost-estimation/bid', icon: 'calculator', group: '决策' },
  { name: '知识库', href: '/knowledge', icon: 'book', group: '决策' },
  { name: '系统管理', href: '/system-management', icon: 'doc', group: '系统' },
];

// 二级菜单（子页面显性化；不设 permissions 即按一级菜单可见性控制）
const SECONDARY_MENUS: Record<string, Array<{ name: string; href: string; icon: BrandIconName; permissions?: string[] }>> = {
  '/construction-logs': [
    { name: '施工日志', href: '/construction-logs', icon: 'crane' },
    { name: '项目日报', href: '/construction-daily-reports', icon: 'doc' },
    { name: '进度计划', href: '/progress-management', icon: 'trend' },
    { name: '日历视图', href: '/construction-logs?tab=calendar', icon: 'doc' },
    { name: '出勤统计', href: '/construction-attendance', icon: 'worker' },
  ],
  '/project-center': [
    { name: '项目管理', href: '/project-center', icon: 'building' },
    { name: '报量管理', href: '/quantity-reporting', icon: 'crane' },
    { name: '签证管理', href: '/visas', icon: 'doc' },
    { name: '甲方报量', href: '/client-reports', icon: 'chart' },
    { name: '甲方回款', href: '/client-payments', icon: 'money' },
    { name: '结算证据链', href: '/evidence-chain', icon: 'doc' },
  ],
  '/hr-salary': [
    { name: '花名册', href: '/workers/roster', icon: 'worker' },
    { name: '月度工资', href: '/workers/salaries', icon: 'money' },
    { name: '工资发放', href: '/workers/payments', icon: 'money' },
    { name: '工资查询', href: '/workers/query', icon: 'doc' },
    { name: '证件管理', href: '/certificates', icon: 'doc' },
  ],
  '/supplier-expense': [
    { name: '供应商库', href: '/suppliers', icon: 'building' },
    { name: '合同管理', href: '/supplier-contracts', icon: 'doc' },
    { name: '结算管理', href: '/settlements', icon: 'chart' },
    { name: '付款记录', href: '/payments', icon: 'money' },
    { name: '综合费用', href: '/comprehensive-expenses', icon: 'wrench' },
    { name: '零星材料', href: '/miscellaneous-materials', icon: 'wrench' },
  ],
  '/team-management/groups': [
    { name: '班组列表', href: '/team-management/groups', icon: 'worker' },
    { name: '班组结算', href: '/team-management/settlements', icon: 'chart' },
  ],
  '/business-analysis': [
    { name: '经营分析', href: '/business-analysis', icon: 'chart' },
    { name: '成本利润中心', href: '/cost-center', icon: 'calculator' },
    { name: '供应商成本看板', href: '/data-board/supplier-cost', icon: 'wrench' },
    { name: '工人成本看板', href: '/data-board/worker-cost', icon: 'worker' },
    { name: '资金管理看板', href: '/data-board/fund-management', icon: 'money' },
    { name: '月度经营月报', href: '/reports/monthly', icon: 'doc' },
  ],
  '/cost-estimation/bid': [
    { name: '测算中心', href: '/cost-estimation/bid', icon: 'calculator' },
    { name: '历史标段库', href: '/cost-estimation/bid/library', icon: 'book' },
  ],
  '/knowledge': [],
  '/system-management': [
    { name: '权限中心', href: '/system/permission', icon: 'doc' },
    { name: '通知中心', href: '/notifications', icon: 'alert' },
    { name: '钉钉绑定', href: '/system/dingtalk-binding', icon: 'doc' },
    { name: 'AI 助手配置', href: '/system/ai-config', icon: 'doc' },
    { name: '审批流程', href: '/system/approval-config', icon: 'doc' },
    { name: '数据备份', href: '/settings/backup', icon: 'doc' },
    { name: '日志管理', href: '/system/audit-logs', icon: 'doc' },
  ],
};

// 页面标题映射
const PAGE_TITLE_MAP: Record<string, string> = {
  '/': '业务工作台',
  '/workspace': '工作台',
  '/project-center': '项目管理',
  '/quantity-reporting': '报量管理',
  '/progress-management': '进度计划',
  '/hr-salary': '人力资源',
  '/supplier-expense': '供应商与费用',
  '/team-management': '班组管理',
  '/team-settlement': '班组管理',
  '/business-analysis': '经营分析',
  '/construction-logs': '施工管理',
  '/construction-attendance': '人员出勤统计',
  '/construction-daily-reports': '项目日报汇总',
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
  '/evidence-chain': '结算证据链',
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
  const [expandedMenu, setExpandedMenu] = useState<string | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isMobile, setIsMobile] = useState(true);
  const [viewportWidth, setViewportWidth] = useState(768);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  const { user, isSuperAdmin, isLoading, permissions } = usePermission();
  const isLoginPage = pathname === '/login' || pathname === '/dingtalk' || pathname === '/ui-preview' || pathname.startsWith('/ui-preview/');

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
    const ua = navigator.userAgent.toLowerCase();
    const isDingTalk = ua.includes('dingtalk') || ua.includes('ddclient');
    document.documentElement.dataset.dingtalk = isDingTalk ? 'true' : 'false';
    document.body.classList.toggle('is-dingtalk', isDingTalk);
    return () => {
      document.documentElement.removeAttribute('data-dingtalk');
      document.body.classList.remove('is-dingtalk');
    };
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
    if (['/project-center', '/projects', '/quantity-reporting', '/work-items', '/limit-prices', '/visas', '/evidence-chain', '/client-reports', '/client-payments'].some(p => pathname.startsWith(p))) return '/project-center';

    // 人力资源
    if (['/hr-salary', '/workers', '/certificates'].some(p => pathname.startsWith(p))) return '/hr-salary';

    // 施工管理
    if (pathname.startsWith('/construction-logs') || pathname.startsWith('/construction-attendance') || pathname.startsWith('/construction-daily-reports') || pathname.startsWith('/progress-management')) return '/construction-logs';

    // 供应商与费用
    if (['/supplier-expense', '/supplier-contracts', '/payments', '/settlement', '/settlements', '/suppliers', '/comprehensive-expenses', '/miscellaneous-materials'].some(p => pathname.startsWith(p))) return '/supplier-expense';

    // 班组管理
    if (pathname.startsWith('/team-management') || pathname.startsWith('/team-settlement')) return '/team-management/groups';

    // 经营分析
    if (['/business-analysis', '/cost-center', '/data-board', '/reports/monthly'].some(p => pathname.startsWith(p))) return '/business-analysis';

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
  const activeConstructionTab = pathname === '/construction-logs'
    ? searchParams.get('tab') || 'logs'
    : '';
  const activeProjectTab = pathname === '/project-center'
    ? searchParams.get('tab') || 'projects'
    : '';
  const activeHrTab = pathname === '/hr-salary'
    ? searchParams.get('tab') || 'roster'
    : '';
  const preferredMobileMenuHrefs = ['/workspace', '/construction-logs', '/project-center', '/hr-salary', '/business-analysis'];
  const mobileBottomMenus = preferredMobileMenuHrefs
    .map((href) => TOP_LEVEL_MENUS.find((menu) => menu.href === href))
    .filter((menu): menu is (typeof TOP_LEVEL_MENUS)[number] => Boolean(menu && isMenuVisible(menu.href)))
    .slice(0, 4);

  const isSecondaryActive = (href: string) => {
    if (href.startsWith('/construction-logs?tab=')) {
      const tab = new URLSearchParams(href.split('?')[1] || '').get('tab');
      return pathname === '/construction-logs' && activeConstructionTab === tab;
    }
    if (href === '/construction-logs') {
      return pathname === '/construction-logs' && activeConstructionTab === 'logs';
    }
    if (pathname === '/project-center') {
      const projectTabHref: Record<string, string> = {
        projects: '/project-center',
        'quantity-reporting': '/quantity-reporting',
        'work-items': '/quantity-reporting',
        visas: '/visas',
        'client-reports': '/client-reports',
        'client-payments': '/client-payments',
        'evidence-chain': '/evidence-chain',
      };
      return projectTabHref[activeProjectTab] === href;
    }
    if (pathname === '/hr-salary') {
      const hrTabHref: Record<string, string> = {
        roster: '/workers/roster',
        workers: '/workers/roster',
        certificates: '/certificates',
        salaries: '/workers/salaries',
        payments: '/workers/payments',
        query: '/workers/query',
      };
      return hrTabHref[activeHrTab] === href;
    }
    return pathname.startsWith(href);
  };

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
    <div className="app-shell" style={{ display: 'flex', height: '100vh', background: 'var(--background)' }}>
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
          {/* Logo图标：v2 精装容器（浅色底 + 描边 + 蓝色光晕） */}
          <div
            style={{
              width: '52px',
              height: '52px',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <BrandLogo size={42} />
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
              .map((menu, idx, arr) => {
                const isActive = activeMenu === menu.href;
                const secondaryMenus = SECONDARY_MENUS[menu.href]?.filter(item => hasAnyPermission(item.permissions)) || [];
                // 分组标题：仅在该组第一个菜单前显示
                const showGroup = menu.group && (idx === 0 || arr[idx - 1].group !== menu.group);
                return (
                  <div key={menu.href}>
                    {showGroup && !isEffectivelyCollapsed && (
                      <div
                        style={{
                          fontSize: '10px',
                          color: 'var(--color-text-3)',
                          letterSpacing: '0.6px',
                          padding: '14px 12px 4px',
                          lineHeight: 1.4,
                        }}
                      >
                        {menu.group}
                      </div>
                    )}
                    <Link
                      href={menu.href}
                      className={cn(
                        'flex items-center gap-3 rounded-lg transition-all duration-200 relative group',
                        isEffectivelyCollapsed ? 'justify-center px-0 py-3' : 'px-3 py-3'
                      )}
                      style={{
                        background: isActive ? 'var(--bg-active)' : 'transparent',
                        color: isActive ? 'var(--color-primary-dark)' : '#475569',
                      }}
                      onMouseOver={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.background = '#F8FAFC'; }}
                      onMouseOut={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                      title={isEffectivelyCollapsed ? menu.name : undefined}
                      onClick={(e) => {
                        // 有二级菜单：手风琴展开/收起（不跳转，点二级再跳）
                        if (secondaryMenus.length > 0) {
                          e.preventDefault();
                          setExpandedMenu(prev => (prev === menu.href ? null : menu.href));
                          setHoverExpanded(false);
                          return;
                        }
                        setSidebarOpen(false);
                        setHoverExpanded(false);
                      }}
                    >
                      {/* 左侧激活指示条 */}
                      {isActive && (
                        <div
                          className="absolute left-0 top-1/2 -translate-y-1/2 rounded-r-full"
                          style={{
                            width: '3px',
                            height: '60%',
                            background: 'var(--color-primary)',
                            transition: 'all 0.2s ease',
                          }}
                        />
                      )}
                      <div
                        className={cn(
                          'flex items-center justify-center flex-shrink-0 transition-all duration-200',
                          isEffectivelyCollapsed ? 'w-8 h-8' : 'w-8 h-8'
                        )}
                      >
                        <BrandIconContainer
                          name={menu.icon}
                          size={16}
                          className="rounded-md p-1 shadow-sm"
                        />
                      </div>
                      {!isEffectivelyCollapsed && (
                        <span
                          className="text-[13px] transition-colors duration-200"
                          style={{
                            color: isActive ? 'var(--color-primary-dark)' : '#475569',
                            fontWeight: isActive ? 600 : 400,
                          }}
                        >
                          {menu.name}
                        </span>
                      )}
                      {/* 二级展开箭头 */}
                      {!isEffectivelyCollapsed && secondaryMenus.length > 0 && (
                        <ChevronDown
                          className="ml-auto h-3.5 w-3.5 shrink-0 transition-transform duration-200"
                          style={{
                            color: (isActive || expandedMenu === menu.href) ? 'var(--color-primary)' : '#94A3B8',
                            transform: (isActive || expandedMenu === menu.href) ? 'rotate(180deg)' : undefined,
                          }}
                        />
                      )}
                      {/* 激活指示圆点 */}
                      {isActive && !isEffectivelyCollapsed && secondaryMenus.length === 0 && (
                        <div style={{
                          position: 'absolute',
                          right: '12px',
                          width: '5px',
                          height: '5px',
                          borderRadius: '50%',
                          background: 'var(--color-primary)',
                        }} />
                      )}
                    </Link>

                    {(isActive || expandedMenu === menu.href) && !isEffectivelyCollapsed && secondaryMenus.length > 0 ? (
                      <div className="mt-1 space-y-1 pb-1 pl-11">
                        {secondaryMenus.map((item) => {
                          const isSubActive = isSecondaryActive(item.href);
                          return (
                            <Link
                              key={item.href}
                              href={item.href}
                              className="flex items-center gap-2 rounded-md px-3 py-2 text-xs transition"
                              style={{
                                background: isSubActive ? '#F1F5FF' : 'transparent',
                                color: isSubActive ? 'var(--color-primary-dark)' : '#64748B',
                                fontWeight: isSubActive ? 600 : 400,
                              }}
                              onClick={() => { setSidebarOpen(false); setHoverExpanded(false); }}
                            >
                              <BrandIconContainer
                                name={item.icon}
                                size={13}
                                className="rounded p-0.5 shadow-none"
                              />
                              <span>{item.name}</span>
                            </Link>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
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
          className="app-mobile-header"
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
          className="app-main-scroll flex-1 overflow-auto"
          style={{ background: 'var(--background)' }}
        >
          <Suspense fallback={null}>
            <NotificationReadMarker />
          </Suspense>
          {children}
        </main>
      </div>

      {/* 全局悬浮AI助手 */}
      {isMobile && (
        <nav className="mobile-bottom-nav safe-area-bottom" aria-label="移动端快捷导航">
          <div className="mobile-bottom-nav__items">
            {mobileBottomMenus.map((menu) => {
              const isActive = activeMenu === menu.href;
              return (
                <Link
                  key={menu.href}
                  href={menu.href}
                  className={cn('mobile-bottom-nav__item', isActive && 'mobile-bottom-nav__item--active')}
                  onClick={() => {
                    setSidebarOpen(false);
                    setHoverExpanded(false);
                  }}
                >
                  <BrandIconContainer name={menu.icon} size={18} className="rounded-md p-1 shadow-none" />
                  <span>{menu.name}</span>
                </Link>
              );
            })}
            <button
              type="button"
              className="mobile-bottom-nav__item"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="h-5 w-5" strokeWidth={1.8} />
              <span>更多</span>
            </button>
          </div>
        </nav>
      )}

      <FloatingAIAssistant />
    </div>
  );
}
