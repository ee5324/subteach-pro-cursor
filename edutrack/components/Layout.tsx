import React, { useState } from 'react';
import { Menu, X, ClipboardList, Settings, CalendarDays, Trophy, Store, Archive, LogOut, Map, FileText, ChevronDown, ChevronRight, Users, Award, Wallet, FlaskConical, Banknote } from 'lucide-react';
import { isSandbox, isPinBypassActive, setPinBypass } from '../services/sandboxStore';
import type { User } from 'firebase/auth';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  onTabChange: (tab: string) => void;
  archiveCount?: number;
  /** 計畫專案：結案日 30 天內或已逾期之筆數（進行中計畫） */
  budgetPlansAlertCount?: number;
  /** 上述筆數中是否含「已逾期」 */
  budgetPlansAlertOverdue?: boolean;
  user?: User | null;
  onSignOut?: () => void;
  /** 嵌入「手機查詢中心」時：以父層高度為準，避免 h-screen 撐破版面 */
  embeddedMobileHub?: boolean;
}

/** 單一選單項目 */
interface MenuItemFlat {
  id: string;
  label: string;
  icon: typeof CalendarDays;
  badge?: number;
}
/** 巢狀群組：語言選修 > 儀表板、點名單製作 */
interface MenuItemGroup {
  id: string;
  label: string;
  icon: typeof ClipboardList;
  children: { id: string; label: string }[];
}

const Layout: React.FC<LayoutProps> = ({
  children,
  activeTab,
  onTabChange,
  archiveCount,
  budgetPlansAlertCount = 0,
  budgetPlansAlertOverdue = false,
  user,
  onSignOut,
  embeddedMobileHub = false,
}) => {
  const [isNavOpen, setIsNavOpen] = useState(false);
  const [nativeLangOpen, setNativeLangOpen] = useState(true);

  const menuGroups: MenuItemGroup[] = [
    {
      id: 'native-lang',
      label: '語言選修',
      icon: ClipboardList,
      children: [
        { id: 'language-dashboard', label: '語言選修儀表板' },
        { id: 'language-homeroom-notice', label: '導師通知' },
        { id: 'new-immigrant-grouping', label: '新住民語能力分組' },
        { id: 'attendance', label: '點名單製作' },
      ],
    },
  ];

  const menuItemsFlat: MenuItemFlat[] = [
    { id: 'calendar', label: '行政行事曆', icon: CalendarDays },
    { id: 'student-roster', label: '學生名單', icon: Users },
    { id: 'budget-plans', label: '計畫專案', icon: Wallet },
    { id: 'budget-advances', label: '計畫代墊', icon: Banknote },
    { id: 'campus-map', label: '校園平面圖', icon: Map },
    { id: 'awards', label: '頒獎通知', icon: Trophy },
    { id: 'exam-submissions', label: '段考提報', icon: Award },
    { id: 'school-year-meetings', label: '學年會議', icon: Users },
    { id: 'vendors', label: '廠商管理', icon: Store },
    { id: 'exam-papers', label: '考卷存檔', icon: FileText },
    { id: 'archive', label: '事項列檔', icon: Archive, badge: archiveCount },
    { id: 'settings', label: '系統設定', icon: Settings },
    { id: 'version-updates', label: '版本更新', icon: FileText },
  ];

  /** 依 activeTab 取得目前頁面標題（含巢狀子項目） */
  const getActiveLabel = (): string => {
    for (const g of menuGroups) {
      const child = g.children.find((c) => c.id === activeTab);
      if (child) return `${g.label} · ${child.label}`;
    }
    const flat = menuItemsFlat.find((i) => i.id === activeTab);
    return flat?.label ?? '';
  };

  /** 選單順序：行政行事曆、學生名單、計畫專案、計畫代墊，其餘依 menuItemsFlat 順序；巢狀群組插在上述之後 */
  const menuItemsFirst = menuItemsFlat.filter(
    (i) =>
      i.id === 'calendar' ||
      i.id === 'student-roster' ||
      i.id === 'budget-plans' ||
      i.id === 'budget-advances'
  );
  const menuItemsRest = menuItemsFlat.filter(
    (i) =>
      i.id !== 'calendar' &&
      i.id !== 'student-roster' &&
      i.id !== 'budget-plans' &&
      i.id !== 'budget-advances'
  );

  const navContent = (
    <nav
      className={`flex flex-col gap-0.5 w-full py-3 ${
        embeddedMobileHub ? '[&_button]:min-h-[44px] [&_button]:items-center touch-manipulation' : ''
      }`}
    >
      {/* 行政行事曆、學生名單、計畫專案、計畫代墊 */}
      {menuItemsFirst.map((item) => {
        const Icon = item.icon;
        const isBudget = item.id === 'budget-plans';
        const budgetN = isBudget ? budgetPlansAlertCount : 0;
        const showArchiveBadge = !isBudget && item.badge != null && item.badge > 0;
        const showBudgetBadge = isBudget && budgetN > 0;
        const badgeNum = isBudget ? budgetN : item.badge ?? 0;
        const budgetBadgeClass =
          budgetPlansAlertOverdue ? 'bg-red-500' : 'bg-amber-500';
        return (
          <button
            key={item.id}
            type="button"
            title={
              isBudget && showBudgetBadge
                ? `有 ${budgetN} 筆計畫已逾期或距結案日 30 天內（進行中）`
                : undefined
            }
            onClick={() => {
              onTabChange(item.id);
              setIsNavOpen(false);
            }}
            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left w-full ${
              activeTab === item.id
                ? 'bg-blue-600 text-white'
                : 'text-slate-300 hover:bg-slate-700 hover:text-white'
            }`}
          >
            <Icon size={18} className="flex-shrink-0" />
            <span className="truncate flex-1">{item.label}</span>
            {showArchiveBadge && (
              <span className="flex-shrink-0 min-w-[1.25rem] text-center text-xs bg-amber-500 text-white rounded-full px-1.5">
                {item.badge}
              </span>
            )}
            {showBudgetBadge && (
              <span
                className={`flex-shrink-0 min-w-[1.25rem] text-center text-xs ${budgetBadgeClass} text-white rounded-full px-1.5 font-semibold`}
              >
                {badgeNum > 99 ? '99+' : badgeNum}
              </span>
            )}
          </button>
        );
      })}
      {/* 巢狀：本土語點名單 */}
      {menuGroups.map((group) => {
        const GroupIcon = group.icon;
        const isActive = group.children.some((c) => c.id === activeTab);
        return (
          <div key={group.id} className="flex flex-col gap-0.5">
            <button
              type="button"
              onClick={() => setNativeLangOpen(!nativeLangOpen)}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left w-full ${
                isActive ? 'text-white bg-slate-600' : 'text-slate-300 hover:bg-slate-700 hover:text-white'
              }`}
            >
              <GroupIcon size={18} className="flex-shrink-0" />
              <span className="truncate flex-1">{group.label}</span>
              {nativeLangOpen ? (
                <ChevronDown size={16} className="flex-shrink-0" />
              ) : (
                <ChevronRight size={16} className="flex-shrink-0" />
              )}
            </button>
            {nativeLangOpen &&
              group.children.map((child) => (
                <button
                  key={child.id}
                  onClick={() => {
                    onTabChange(child.id);
                    setIsNavOpen(false);
                  }}
                  className={`flex items-center gap-2.5 pl-8 pr-3 py-2 rounded-lg text-sm font-medium transition-colors text-left w-full ${
                    activeTab === child.id
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                  }`}
                >
                  <span className="truncate">{child.label}</span>
                </button>
              ))}
          </div>
        );
      })}
      {/* 其餘單一項目 */}
      {menuItemsRest.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            onClick={() => {
              onTabChange(item.id);
              setIsNavOpen(false);
            }}
            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left w-full ${
              activeTab === item.id
                ? 'bg-blue-600 text-white'
                : 'text-slate-300 hover:bg-slate-700 hover:text-white'
            }`}
          >
            <Icon size={18} className="flex-shrink-0" />
            <span className="truncate">{item.label}</span>
            {item.badge !== undefined && item.badge > 0 && (
              <span className="min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1 ml-auto">
                {item.badge > 99 ? '99+' : item.badge}
              </span>
            )}
          </button>
        );
      })}
      {!isSandbox() && user && onSignOut && (
        <button
          onClick={onSignOut}
          className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:bg-slate-700 hover:text-white transition-colors text-left w-full mt-2"
        >
          <LogOut size={18} className="flex-shrink-0" />
          <span className="truncate">登出</span>
        </button>
      )}
    </nav>
  );

  return (
    <div
      className={
        embeddedMobileHub
          ? 'flex h-full min-h-0 max-h-full bg-gray-100 overflow-hidden'
          : 'flex h-screen bg-gray-100 overflow-hidden'
      }
    >
      {/* 左側導覽列（縱向） */}
      <aside
        className={`no-print bg-slate-800 text-white border-r border-slate-700 flex-shrink-0 ${
          isNavOpen
            ? 'fixed inset-y-0 left-0 z-20 w-56 shadow-xl lg:relative lg:shadow-none'
            : 'hidden lg:flex lg:w-56'
        } flex flex-col`}
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-700 lg:border-b">
          <span className="font-semibold text-white text-sm">功能選單</span>
          <button
            onClick={() => setIsNavOpen(false)}
            className="lg:hidden p-2 rounded-md text-slate-400 hover:bg-slate-700 hover:text-white"
          >
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-2">
          {navContent}
        </div>
      </aside>

      {/* 手機版：點擊遮罩關閉導覽 */}
      {isNavOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-10 lg:hidden"
          onClick={() => setIsNavOpen(false)}
          aria-hidden
        />
      )}

      {/* 右側：Header + 內容區 */}
      <div className="flex flex-col flex-1 min-w-0">
        <header
          className={`flex-shrink-0 bg-white shadow-sm flex items-center justify-between px-3 sm:px-4 lg:px-6 no-print ${
            embeddedMobileHub ? 'h-12 min-h-12 sm:h-14 sm:min-h-14' : 'h-14 lg:h-16'
          }`}
        >
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              onClick={() => setIsNavOpen(!isNavOpen)}
              className="lg:hidden p-2.5 -ml-1 rounded-md text-gray-600 hover:bg-gray-100 touch-manipulation"
              aria-label={isNavOpen ? '關閉選單' : '開啟選單'}
            >
              {isNavOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
            <span
              className={`font-semibold text-gray-800 truncate ${
                embeddedMobileHub ? 'text-base sm:text-lg' : 'text-lg'
              }`}
            >
              {getActiveLabel() || menuItemsFlat.find(i => i.id === activeTab)?.label}
            </span>
          </div>
        </header>

        {isSandbox() && (
          <div className="flex-shrink-0 bg-amber-100 border-b border-amber-300 px-4 py-2 flex flex-wrap items-center gap-2 text-amber-800 text-sm no-print">
            <FlaskConical size={18} />
            <span className="font-medium">
              {import.meta.env.VITE_SANDBOX === 'true' ? 'Sandbox 模式' : 'PIN 測試模式'}
            </span>
            <span className="text-amber-700">— 資料僅存於記憶體。</span>
            {isPinBypassActive() && import.meta.env.VITE_SANDBOX !== 'true' && (
              <button
                type="button"
                onClick={() => {
                  setPinBypass(false);
                  window.location.reload();
                }}
                className="ml-auto px-2 py-1 rounded bg-amber-600 text-white text-xs font-medium hover:bg-amber-700"
              >
                結束測試（回登入）
              </button>
            )}
          </div>
        )}

        <main
          className={`flex-1 overflow-auto min-h-0 ${
            embeddedMobileHub ? 'p-3 sm:p-4 lg:p-6' : 'p-4 lg:p-8'
          }`}
        >
          {children}
        </main>
      </div>
    </div>
  );
};

export default Layout;
