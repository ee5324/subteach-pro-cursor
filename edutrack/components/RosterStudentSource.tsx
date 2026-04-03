/**
 * 學生名單來源：可拖曳學生至頒獎通知／點名單等
 * 與學生名單（語言選修登錄）整合，供其他功能從名單拖曳加入
 */
import React, { useState, useEffect, useMemo } from 'react';
import { Users, Loader2, ChevronDown, ChevronRight, Search } from 'lucide-react';
import { getLanguageElectiveRoster } from '../services/api';
import type { LanguageElectiveStudent } from '../types';

export const ROSTER_DRAG_TYPE = 'application/x-edutrack-roster-student';

export interface RosterStudentSourceProps {
  /** 學年度，用於載入該學年學生名單 */
  academicYear: string;
  /** 是否預設收合 */
  defaultCollapsed?: boolean;
  /** 標題旁說明（選填） */
  hint?: string;
}

export const RosterStudentSource: React.FC<RosterStudentSourceProps> = ({
  academicYear,
  defaultCollapsed = true,
  hint,
}) => {
  const [open, setOpen] = useState(!defaultCollapsed);
  const [students, setStudents] = useState<LanguageElectiveStudent[]>([]);
  const [loading, setLoading] = useState(false);
  const [classFilter, setClassFilter] = useState<string>('');
  const [rosterSearch, setRosterSearch] = useState('');

  useEffect(() => {
    setRosterSearch('');
    if (!academicYear.trim()) {
      setStudents([]);
      return;
    }
    setLoading(true);
    getLanguageElectiveRoster(academicYear)
      .then((doc) => {
        setStudents(doc?.students ?? []);
      })
      .catch(() => setStudents([]))
      .finally(() => setLoading(false));
  }, [academicYear]);

  const classNames = useMemo(
    () =>
      Array.from(new Set(students.map((s) => s.className))).sort((a, b) =>
        String(a).localeCompare(String(b), undefined, { numeric: true })
      ),
    [students]
  );
  const filteredStudents = useMemo(() => {
    let list = !classFilter ? students : students.filter((s) => s.className === classFilter);
    const q = rosterSearch.trim();
    if (!q) return list;
    return list.filter((s) => {
      const name = String(s.name ?? '');
      const seat = String(s.seat ?? '');
      const cn = String(s.className ?? '');
      return name.includes(q) || seat.includes(q) || cn.includes(q);
    });
  }, [students, classFilter, rosterSearch]);

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-slate-100"
      >
        <span className="font-medium text-slate-800 flex items-center gap-2 text-sm">
          <Users size={16} />
          從學生名單
          {hint && <span className="text-slate-500 font-normal">{hint}</span>}
        </span>
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      </button>
      {open && (
        <div className="px-3 pb-3 pt-0">
          {loading ? (
            <div className="flex items-center justify-center py-6 text-slate-500">
              <Loader2 size={20} className="animate-spin" />
            </div>
          ) : students.length === 0 ? (
            <p className="text-sm text-slate-500 py-2">
              {academicYear ? `${academicYear} 學年尚無名單，請先至「學生名單」建置名單。` : '請選擇學年度'}
            </p>
          ) : (
            <>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <label className="text-xs text-slate-600 whitespace-nowrap">班級</label>
                <select
                  value={classFilter}
                  onChange={(e) => setClassFilter(e.target.value)}
                  className="px-2 py-1.5 border border-slate-200 rounded text-xs bg-white min-w-[5rem]"
                >
                  <option value="">全部</option>
                  {classNames.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div className="mb-2">
                <label className="block text-xs text-slate-600 mb-0.5">搜尋（姓名、座號或班級關鍵字）</label>
                <div className="relative">
                  <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" aria-hidden />
                  <input
                    type="search"
                    value={rosterSearch}
                    onChange={(e) => setRosterSearch(e.target.value)}
                    placeholder="例：明、12、101"
                    className="w-full pl-8 pr-2 py-1.5 border border-slate-200 rounded text-xs bg-white"
                  />
                </div>
              </div>
              <div className="max-h-48 overflow-y-auto border border-slate-200 rounded bg-white">
                <table className="w-full text-xs">
                  <thead className="bg-slate-100 sticky top-0">
                    <tr>
                      <th className="px-2 py-1.5 text-left font-medium text-slate-600">班級</th>
                      <th className="px-2 py-1.5 text-left font-medium text-slate-600 w-12">座號</th>
                      <th className="px-2 py-1.5 text-left font-medium text-slate-600">姓名</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredStudents.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-2 py-4 text-center text-slate-500 text-xs">
                          {rosterSearch.trim() ? '無符合搜尋的學生，請改關鍵字或班級篩選。' : '（無資料）'}
                        </td>
                      </tr>
                    ) : (
                    filteredStudents.map((s, i) => (
                      <tr
                        key={`${s.className}-${s.seat}-${s.name}-${i}`}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData(ROSTER_DRAG_TYPE, JSON.stringify({ className: s.className, seat: s.seat, name: s.name }));
                          e.dataTransfer.effectAllowed = 'copy';
                        }}
                        className="cursor-grab active:cursor-grabbing hover:bg-slate-50"
                      >
                        <td className="px-2 py-1.5 font-medium text-slate-800">{s.className}</td>
                        <td className="px-2 py-1.5 text-slate-700">{s.seat}</td>
                        <td className="px-2 py-1.5 text-slate-700">{s.name}</td>
                      </tr>
                    ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default RosterStudentSource;
