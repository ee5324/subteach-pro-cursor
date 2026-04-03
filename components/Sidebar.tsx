
import React, { useEffect, useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { Users, FilePlus, FileText, Settings, Loader2, AlertCircle, Coins, Briefcase, Inbox, Clock, UserCheck, UserPlus, CalendarDays, X, Languages, FileOutput, LogOut, BookOpenText, Globe, MessageSquare, Ban, Mic2, Smartphone, ClipboardList } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { signOut } from 'firebase/auth';
import { auth } from '../src/lib/firebase';

const Sidebar: React.FC<{ onClose?: () => void }> = ({ onClose }) => {
  const { settings, checkGasConnection, records, loading, currentUser, publicBoardApplications, teacherLeaveRequests } = useAppStore();
  const hasGasUrl = Boolean(settings?.gasWebAppUrl?.trim());
  const [connectionStatus, setConnectionStatus] = useState<'checking' | 'online' | 'offline' | 'unset'>(hasGasUrl ? 'checking' : 'unset');
  const navigate = useNavigate();
  const location = useLocation();
  const isOverviewGroupActive =
    location.pathname === '/' ||
    location.pathname === '/overview' ||
    location.pathname === '/substitute-busy';

  // Calculate pending items count (待聘清單)
  const pendingCount = records.reduce((acc, r) => {
      return acc + (r.slots?.filter(s => !s.substituteTeacherId).length || 0);
  }, 0);

  // 教師自行申請假單待處理筆數（teacherLeaveRequests status 為 pending）
  const externalRequestsCount = (teacherLeaveRequests || []).filter(r => r.status === 'pending').length;

  // 公開缺額報名筆數（有新報名時於導覽列顯示提示）
  const publicApplicationsCount = publicBoardApplications?.length ?? 0;

  useEffect(() => {
    if (loading) return;
    if (!hasGasUrl) {
      setConnectionStatus('unset');
      return;
    }
    let mounted = true;
    const verify = async () => {
        const isConnected = await checkGasConnection();
        if (mounted) {
            setConnectionStatus(isConnected ? 'online' : 'offline');
        }
    };
    verify();
    return () => { mounted = false; };
  }, [loading, hasGasUrl]);

  const handleLogout = async () => {
    try {
      if (auth) {
        await signOut(auth);
        navigate('/login');
      }
    } catch (error) {
      console.error("Logout failed", error);
    }
  };

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center space-x-3 px-4 py-2.5 rounded-lg transition-colors relative text-sm font-medium ${
      isActive ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
    }`;

  /** 代課總表巢狀子項目 */
  const overviewSubLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2.5 pl-3 pr-3 py-2 rounded-md transition-colors text-sm font-medium border-l-2 ml-2 ${
      isActive
        ? 'border-indigo-400 bg-indigo-600/25 text-white'
        : 'border-transparent text-slate-400 hover:bg-slate-800/90 hover:text-white'
    }`;

  const groupTitleClass = "px-4 pt-4 pb-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider";

  return (
    <div className="h-full w-full bg-slate-900 text-slate-100 flex flex-col overflow-y-auto shadow-xl scrollbar-hide">
      <div className="p-6 border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm sticky top-0 z-10 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">
            SubTeach Pro
          </h1>
          <p className="text-xs text-slate-500 mt-1">代課薪資管理系統</p>
        </div>
        <button onClick={onClose} className="md:hidden text-slate-400 hover:text-white">
            <X size={20} />
        </button>
      </div>

      <nav className="flex-1 px-3 py-2 space-y-1 mt-4">
        {/* 代課總表（巢狀：資料總表 + 忙碌時段） */}
        <div
          className={`rounded-xl border overflow-hidden ${
            isOverviewGroupActive ? 'border-indigo-500/35 bg-slate-800/40' : 'border-slate-800/80 bg-slate-800/15'
          }`}
        >
          <div className="px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-700/50 flex items-center gap-2">
            <CalendarDays size={15} className="text-indigo-400 shrink-0" />
            <span>代課總表</span>
          </div>
          <div className="py-1.5 space-y-0.5">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                overviewSubLinkClass({
                  isActive: isActive || location.pathname === '/overview',
                })
              }
              onClick={onClose}
            >
              <CalendarDays size={16} className="shrink-0 opacity-90" />
              <span>代課資料總表</span>
            </NavLink>
            <NavLink to="/substitute-busy" className={overviewSubLinkClass} onClick={onClose}>
              <Ban size={16} className="shrink-0 opacity-90" />
              <span>忙碌／不接時段</span>
            </NavLink>
          </div>
        </div>

        <NavLink to="/entry" className={linkClass} onClick={onClose}>
          <FilePlus size={18} />
          <span>新增代課單</span>
        </NavLink>

        <NavLink to="/records" className={linkClass} onClick={onClose}>
          <FileText size={18} />
          <span>代課清冊/憑證</span>
        </NavLink>

        <NavLink to="/mobile-query" className={linkClass} onClick={onClose}>
          <Smartphone size={18} />
          <span>手機查詢中心</span>
        </NavLink>

        <NavLink to="/edutrack" className={linkClass} onClick={onClose}>
          <ClipboardList size={18} />
          <span>教學組事務</span>
        </NavLink>

        <NavLink to="/leave-rules" className={linkClass} onClick={onClose}>
          <BookOpenText size={18} />
          <span>請假規則</span>
        </NavLink>

        {/* Group 1: 日常作業 */}
        <div className={groupTitleClass}>日常作業</div>
        
        <NavLink to="/pending" className={linkClass} onClick={onClose}>
          <AlertCircle size={18} />
          <span>待聘清單</span>
          {pendingCount > 0 && (
             <span className="absolute right-3 top-1/2 -translate-y-1/2 bg-rose-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow-sm">
                 {pendingCount}
             </span>
          )}
        </NavLink>
        
        <NavLink to="/requests" className={linkClass} onClick={onClose}>
          <Inbox size={18} />
          <span>教師自行申請假單</span>
          {externalRequestsCount > 0 && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 bg-rose-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow-sm" title={`${externalRequestsCount} 筆待處理`}>
              {externalRequestsCount}
            </span>
          )}
        </NavLink>

        <NavLink to="/public-applications" className={linkClass} onClick={onClose}>
          <Globe size={18} />
          <span>公開缺額報名</span>
          {publicApplicationsCount > 0 && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow-sm" title={`${publicApplicationsCount} 筆新報名`}>
              {publicApplicationsCount}
            </span>
          )}
        </NavLink>

        <NavLink to="/contact-exchange" className={linkClass} onClick={onClose}>
          <MessageSquare size={18} />
          <span>代課聯絡資訊交換</span>
        </NavLink>

        {/* Group 2: 人力資源 */}
        <div className={groupTitleClass}>人力資源</div>
        
        <NavLink to="/sub-pool" className={linkClass} onClick={onClose}>
          <UserCheck size={18} />
          <span>代課人力庫</span>
        </NavLink>

        <NavLink to="/substitute-applications" className={linkClass} onClick={onClose}>
          <UserPlus size={18} />
          <span>代課教師報名審核</span>
        </NavLink>
        
        <NavLink to="/teachers" className={linkClass} onClick={onClose}>
          <Users size={18} />
          <span>教師管理</span>
        </NavLink>

        <NavLink to="/language-teachers" className={linkClass} onClick={onClose}>
          <Users size={18} />
          <span>語言教師</span>
        </NavLink>

        {/* Group 3: 薪資與報表 */}
        <div className={groupTitleClass}>薪資結算</div>
        
        <NavLink to="/extra-voucher" className={linkClass} onClick={onClose}>
          <FileOutput size={18} />
          <span>額外憑證</span>
        </NavLink>
        
        <NavLink to="/fixed-overtime" className={linkClass} onClick={onClose}>
          <Clock size={18} />
          <span>固定兼課</span>
        </NavLink>
        
        <NavLink to="/overtime" className={linkClass} onClick={onClose}>
          <Coins size={18} />
          <span>超鐘點計算</span>
        </NavLink>

        <NavLink to="/overtime-indigenous" className={linkClass} onClick={onClose}>
          <Mic2 size={18} />
          <span>族語專職超鐘點</span>
        </NavLink>

        <NavLink to="/hakka-salary" className={linkClass} onClick={onClose}>
          <Languages size={18} />
          <span>客語/族語專職薪水</span>
        </NavLink>
        
        <NavLink to="/special" className={linkClass} onClick={onClose}>
          <Briefcase size={18} />
          <span>專案活動</span>
        </NavLink>
      </nav>

      <div className="p-4 border-t border-slate-800 space-y-3 bg-slate-900/50 sticky bottom-0">
        {/* GAS 狀態：未設定時不檢查連線，僅在已設定時顯示已連線／未連線 */}
        <div className="flex items-center space-x-2 px-3 py-2 text-xs rounded bg-slate-800/80 border border-slate-700/50">
            {connectionStatus === 'unset' && (
                <>
                    <div className="w-2 h-2 rounded-full bg-slate-500"></div>
                    <span className="text-slate-400">GAS 選用（未設定）</span>
                </>
            )}
            {connectionStatus === 'checking' && (
                <>
                    <Loader2 size={12} className="animate-spin text-slate-400" />
                    <span className="text-slate-400">連線檢查中...</span>
                </>
            )}
            {connectionStatus === 'online' && (
                <>
                    <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]"></div>
                    <span className="text-emerald-400 font-medium">GAS 已連線</span>
                </>
            )}
            {connectionStatus === 'offline' && (
                <>
                    <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                    <span className="text-amber-400 font-medium">GAS 未連線（報表/匯出需 GAS）</span>
                </>
            )}
        </div>

        <div className="px-1">
            <NavLink to="/settings" className="flex items-center space-x-2 text-slate-400 text-sm hover:text-indigo-400 transition-colors w-full p-2 rounded-lg hover:bg-slate-800" onClick={onClose}>
                <Settings size={18} />
                <span>系統設定</span>
            </NavLink>
        </div>

        {currentUser && (
          <div className="px-1">
            <div className="px-3 py-2 text-[11px] text-slate-500 truncate">
              目前登入：{currentUser.displayName || currentUser.email || '已登入使用者'}
            </div>
            <button
              type="button"
              onClick={async () => {
                await handleLogout();
                onClose?.();
              }}
              className="flex items-center space-x-2 text-slate-400 text-sm hover:text-rose-400 transition-colors w-full p-2 rounded-lg hover:bg-slate-800"
            >
              <LogOut size={18} />
              <span>登出</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Sidebar;
