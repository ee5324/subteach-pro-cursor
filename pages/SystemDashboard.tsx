import React, { useMemo } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  CalendarDays,
  ClipboardList,
  Smartphone,
  Settings,
  FileText,
  FilePlus,
  Users,
  Globe,
  ExternalLink,
  Coins,
  Clock,
  Briefcase,
  Languages,
} from 'lucide-react';

type Tile = {
  to: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  accent: string;
  /** 另開分頁（對外網址） */
  external?: boolean;
};

const tiles: Tile[] = [
  {
    to: '/',
    title: '代課資料總表',
    description: '代課登錄、總表與待聘檢視',
    icon: <CalendarDays size={22} />,
    accent: 'from-indigo-500 to-violet-600',
  },
  {
    to: '/edutrack',
    title: '教學組事務',
    description: '行事曆、選修、段考、計畫預算等（EduTrack）',
    icon: <ClipboardList size={22} />,
    accent: 'from-emerald-500 to-teal-600',
  },
  {
    to: '/mobile-query',
    title: '手機查詢中心',
    description: '週課總表、教師課表、代課薪資（手機友善）',
    icon: <Smartphone size={22} />,
    accent: 'from-cyan-500 to-blue-600',
  },
  {
    to: '/entry',
    title: '新增代課單',
    description: '建立新的代課登錄',
    icon: <FilePlus size={22} />,
    accent: 'from-violet-500 to-purple-600',
  },
  {
    to: '/records',
    title: '代課清冊／憑證',
    description: '清冊、憑證狀態與匯出',
    icon: <FileText size={22} />,
    accent: 'from-slate-600 to-slate-800',
  },
  {
    to: '/teachers',
    title: '教師管理',
    description: '名單、預設課表與薪級',
    icon: <Users size={22} />,
    accent: 'from-amber-500 to-orange-600',
  },
  {
    to: '/overtime',
    title: '超鐘點計算',
    description: '超鐘點清冊與匯出',
    icon: <Coins size={22} />,
    accent: 'from-rose-500 to-pink-600',
  },
  {
    to: '/fixed-overtime',
    title: '固定兼課',
    description: '固定兼課設定與清冊',
    icon: <Clock size={22} />,
    accent: 'from-fuchsia-500 to-purple-700',
  },
  {
    to: '/hakka-salary',
    title: '客語／族語薪資',
    description: '語言教師領據與薪資',
    icon: <Languages size={22} />,
    accent: 'from-sky-500 to-indigo-600',
  },
  {
    to: '/special',
    title: '專案活動',
    description: '非常態活動紀錄',
    icon: <Briefcase size={22} />,
    accent: 'from-lime-600 to-green-700',
  },
  {
    to: '/settings',
    title: '系統設定',
    description: '學期、GAS、假日與權限',
    icon: <Settings size={22} />,
    accent: 'from-gray-600 to-gray-800',
  },
  {
    to: '/public',
    title: '公開缺額看板',
    description: '對外缺額（新分頁瀏覽）',
    icon: <Globe size={22} />,
    accent: 'from-blue-500 to-indigo-700',
    external: true,
  },
];

function hashHref(path: string): string {
  if (typeof window === 'undefined') return `#${path}`;
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${window.location.origin}${window.location.pathname.replace(/#.*$/, '')}#${p}`;
}

const SystemDashboard: React.FC = () => {
  const examSubmitHref = useMemo(() => hashHref('/exam-submit'), []);
  const teacherRequestHref = useMemo(() => hashHref('/teacher-request'), []);
  const subWeeklyHref = useMemo(() => hashHref('/sub-weekly'), []);

  return (
    <div className="min-h-full bg-gradient-to-b from-slate-50 to-slate-100/90 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <header className="mb-8 md:mb-10">
          <div className="flex items-center gap-3 text-indigo-900">
            <div className="p-2.5 rounded-xl bg-indigo-600 text-white shadow-lg shadow-indigo-500/25">
              <LayoutDashboard size={28} />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900">系統儀表板</h1>
              <p className="text-sm text-slate-600 mt-1">
                快速進入代課系統各功能與教學組事務；無需從左側選單逐層尋找。
              </p>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
          {tiles.map((tile) => {
            const inner = (
              <>
                <div
                  className={`inline-flex p-2.5 rounded-lg bg-gradient-to-br ${tile.accent} text-white shadow-md mb-3`}
                >
                  {tile.icon}
                </div>
                <h2 className="text-base font-semibold text-slate-900 group-hover:text-indigo-800 transition-colors">
                  {tile.title}
                </h2>
                <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">{tile.description}</p>
                {tile.external && (
                  <span className="inline-flex items-center gap-1 mt-3 text-[11px] text-indigo-600 font-medium">
                    <ExternalLink size={12} />
                    另開新分頁
                  </span>
                )}
              </>
            );

            if (tile.external) {
              return (
                <a
                  key={tile.to}
                  href={hashHref(tile.to)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group block rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm hover:shadow-md hover:border-indigo-200/80 transition-all"
                >
                  {inner}
                </a>
              );
            }

            return (
              <NavLink
                key={tile.to}
                to={tile.to}
                className={({ isActive }) =>
                  `group block rounded-2xl border p-5 shadow-sm transition-all ${
                    isActive
                      ? 'border-indigo-400 bg-indigo-50/80 shadow-md ring-1 ring-indigo-200'
                      : 'border-slate-200/80 bg-white hover:shadow-md hover:border-indigo-200/80'
                  }`
                }
              >
                {inner}
              </NavLink>
            );
          })}
        </div>

        <div className="mt-8 p-5 rounded-2xl border border-dashed border-slate-300 bg-white/60 text-sm text-slate-600">
          <p className="font-medium text-slate-800 mb-2">對外填報與表單</p>
          <p className="text-xs text-slate-500 mb-3">無需登入主系統；可複製連結或另開分頁提供給老師。</p>
          <ul className="space-y-2">
            <li>
              <a
                href={examSubmitHref}
                className="text-indigo-600 hover:underline inline-flex items-center gap-1"
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink size={14} />
                段考用卷／提報填報
              </a>
            </li>
            <li>
              <a
                href={teacherRequestHref}
                className="text-indigo-600 hover:underline inline-flex items-center gap-1"
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink size={14} />
                教師請假申請表單
              </a>
            </li>
            <li>
              <a
                href={subWeeklyHref}
                className="text-indigo-600 hover:underline inline-flex items-center gap-1"
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink size={14} />
                代課老師週課表查詢（手機全碼驗證）
              </a>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default SystemDashboard;
