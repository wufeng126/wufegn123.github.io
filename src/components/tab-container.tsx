'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { usePermission } from '@/contexts/permission-context';

export interface TabItem {
  key: string;
  label: string;
  href: string;
  content: React.ComponentType;
  /** 访问该 Tab 所需的权限码，未配置则所有人可见 */
  permission?: string;
}

interface TabContainerProps {
  tabs: TabItem[];
  defaultTab?: string;
}

export function TabContainer({ tabs, defaultTab }: TabContainerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { hasPermission } = usePermission();
  const [activeTab, setActiveTab] = useState<string>('');

  // 按权限过滤 Tab
  const visibleTabs = useMemo(
    () => tabs.filter(tab => !tab.permission || hasPermission(tab.permission)),
    [tabs, hasPermission]
  );

  // 从URL参数或默认值确定当前tab（仅从可见Tab中选取）
  useEffect(() => {
    const urlTab = searchParams.get('tab');
    // URL 指定的 Tab 在可见列表中 → 直接使用
    if (urlTab && visibleTabs.some(t => t.key === urlTab)) {
      setActiveTab(urlTab);
      return;
    }
    // defaultTab 在可见列表中 → 使用默认
    if (defaultTab && visibleTabs.some(t => t.key === defaultTab)) {
      setActiveTab(defaultTab);
      return;
    }
    // 否则选第一个可见 Tab
    setActiveTab(visibleTabs[0]?.key || '');
  }, [searchParams, defaultTab, visibleTabs]);

  const handleTabChange = useCallback((key: string) => {
    const tab = visibleTabs.find(t => t.key === key);
    if (tab) {
      setActiveTab(key);
      // 更新URL但不刷新页面
      const currentPath = pathname;
      router.push(`${currentPath}?tab=${key}`, { scroll: false });
    }
  }, [visibleTabs, pathname, router]);

  const activeTabItem = visibleTabs.find(t => t.key === activeTab);
  const ContentComponent = activeTabItem?.content;

  return (
    <div className="flex flex-col h-full">
      {/* Tab 栏 */}
      <div
        className="flex items-center gap-1 px-4 pt-3 pb-0 border-b overflow-x-auto flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        {visibleTabs.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => handleTabChange(tab.key)}
              className={cn(
                'relative flex items-center px-4 py-2.5 text-[13px] rounded-t-lg transition-all duration-200 whitespace-nowrap bg-transparent border-none cursor-pointer',
              )}
              style={{
                color: isActive ? 'var(--primary)' : 'var(--color-text-2)',
                fontWeight: isActive ? 600 : 400,
                background: isActive ? 'var(--primary)/8' : 'transparent',
              }}
              onMouseOver={(e) => {
                if (!isActive) {
                  (e.currentTarget as HTMLElement).style.background = '#F2F3F5';
                }
              }}
              onMouseOut={(e) => {
                if (!isActive) {
                  (e.currentTarget as HTMLElement).style.background = 'transparent';
                }
              }}
            >
              {tab.label}
              {/* 底部激活指示条 */}
              {isActive && (
                <div
                  className="absolute bottom-0 left-2 right-2 rounded-t-full"
                  style={{
                    height: '2px',
                    background: 'var(--primary)',
                  }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Tab 内容区 */}
      <div className="flex-1 overflow-auto">
        {ContentComponent ? <ContentComponent /> : (
          <div className="flex items-center justify-center h-full text-[var(--color-text-3)]">
            选择一个标签页查看内容
          </div>
        )}
      </div>
    </div>
  );
}
