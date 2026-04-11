import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import FloatingCalculator from './components/FloatingCalculator';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';

const Layout: React.FC = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const location = useLocation();
  /** 教學組事務為內建側欄，隱藏主站 Sidebar，避免雙層選單 */
  const isEduTrackShell = location.pathname === '/edutrack';
  /** 教師請假／代課查詢：精簡版面，隱藏主站 Sidebar */
  const isTeacherPortalShell = location.pathname === '/teacher-portal';
  const hideMainSidebar = isEduTrackShell || isTeacherPortalShell;

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'transparent' }}>
      {/* Mobile Header（教學組／教師查詢全螢幕時改顯示返回列，不顯示主站漢堡） */}
      {!hideMainSidebar && (
        <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-white border-b border-slate-200 z-40 flex items-center px-4 justify-between shadow-sm">
          <div className="font-bold text-lg text-slate-800">SubTeach Pro</div>
          <button
            type="button"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg"
          >
            {isSidebarOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      )}

      {isEduTrackShell && (
        <div className="md:hidden fixed top-0 left-0 right-0 z-40 flex items-center gap-3 h-12 px-3 bg-white border-b border-slate-200 shadow-sm">
          <Link
            to="/dashboard"
            className="text-sm font-medium text-indigo-600 hover:text-indigo-800 shrink-0"
          >
            ← 返回
          </Link>
          <span className="text-slate-400 text-xs truncate">教學組事務</span>
        </div>
      )}
      {isTeacherPortalShell && (
        <div className="md:hidden fixed top-0 left-0 right-0 z-40 flex items-center gap-3 h-12 px-3 bg-white border-b border-slate-200 shadow-sm">
          <Link to="/dashboard" className="text-sm font-medium text-indigo-600 hover:text-indigo-800 shrink-0">
            ← 返回
          </Link>
          <span className="text-slate-400 text-xs truncate">教師請假／代課查詢</span>
        </div>
      )}

      {/* 主站 Sidebar：教學組模組不顯示 */}
      {!hideMainSidebar && (
        <div
          className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 transition-transform duration-300 ease-in-out transform
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        md:translate-x-0 md:static md:inset-auto md:flex md:flex-col
      `}
        >
          <Sidebar onClose={() => setIsSidebarOpen(false)} />
        </div>
      )}

      {/* Mobile Overlay */}
      {!hideMainSidebar && isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Main Content */}
      <main
        className={`flex flex-col flex-1 min-h-0 overflow-hidden w-full relative ${
          isEduTrackShell || isTeacherPortalShell ? 'pt-12 md:pt-0' : 'pt-16 md:pt-0'
        }`}
      >
        {isEduTrackShell && (
          <div className="hidden md:flex shrink-0 items-center gap-3 px-4 py-2.5 bg-white border-b border-slate-200 text-sm shadow-sm z-20">
            <Link to="/dashboard" className="text-indigo-600 hover:text-indigo-800 font-medium inline-flex items-center gap-1">
              ← 返回系統儀表板
            </Link>
            <span className="text-slate-300">|</span>
            <span className="text-slate-600">教學組事務（功能選單見左側）</span>
          </div>
        )}
        {isTeacherPortalShell && (
          <div className="hidden md:flex shrink-0 items-center gap-3 px-4 py-2.5 bg-white border-b border-slate-200 text-sm shadow-sm z-20">
            <Link to="/dashboard" className="text-indigo-600 hover:text-indigo-800 font-medium inline-flex items-center gap-1">
              ← 返回系統儀表板
            </Link>
            <span className="text-slate-300">|</span>
            <span className="text-slate-600">教師請假／代課查詢</span>
          </div>
        )}
        <div className="flex-1 min-h-0 overflow-auto w-full">
          <Outlet />
        </div>
      </main>
      <FloatingCalculator />
    </div>
  );
};

export default Layout;