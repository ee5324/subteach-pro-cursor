/**
 * 點名單製作：依「學生名單」產出點名單；語言班別設定（教室、時間、教師）在此頁編輯並與名單一併儲存。
 */
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { FileText, Calendar as CalendarIcon, Printer, ChevronDown, ChevronRight, Loader2, X, BookOpen, Plus, Trash2, Save } from 'lucide-react';
import AttendanceSheet from './AttendanceSheet';
import { getLanguageElectiveRoster, saveLanguageElectiveRoster, getCalendarSettings } from '../services/api';
import type { LanguageElectiveStudent, LanguageClassSetting, AttendanceTableData, Student, CalendarSettings } from '../types';
import { buildAttendanceSheetsPrintHtml, mergeSheetsByLanguageAndTeacher } from '../utils/attendancePrintHtml';

const AttendanceSheetPage: React.FC = () => {
  const [academicYear, setAcademicYear] = useState('114');
  const [semester, setSemester] = useState('下學期');
  const [students, setStudents] = useState<LanguageElectiveStudent[]>([]);
  const [languageClassSettings, setLanguageClassSettings] = useState<LanguageClassSetting[]>([]);
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [dates, setDates] = useState<Date[]>([]);
  const [dateInput, setDateInput] = useState('');
  const [genDayOfWeek, setGenDayOfWeek] = useState('1');
  const [datesSettingOpen, setDatesSettingOpen] = useState(true);
  const [languageClassSettingsOpen, setLanguageClassSettingsOpen] = useState(false);
  const [printSelectionOpen, setPrintSelectionOpen] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [calendarSettings, setCalendarSettings] = useState<CalendarSettings | null>(null);
  const [calendarSettingsError, setCalendarSettingsError] = useState<string | null>(null);

  const addLanguageClassSetting = useCallback(() => {
    setLanguageClassSettings((prev) => [
      ...prev,
      { id: `lc-${Date.now()}-${Math.random().toString(36).slice(2)}`, name: '', classroom: '', time: '', teacher: '' },
    ]);
  }, []);

  const updateLanguageClassSetting = useCallback((id: string, field: keyof LanguageClassSetting, value: string) => {
    setLanguageClassSettings((prev) =>
      prev.map((row) => (row.id === id ? { ...row, [field]: value } : row))
    );
  }, []);

  const removeLanguageClassSetting = useCallback((id: string) => {
    setLanguageClassSettings((prev) => prev.filter((row) => row.id !== id));
  }, []);

  const handleSaveLanguageClassSettings = useCallback(async () => {
    setSavingSettings(true);
    setSettingsError(null);
    try {
      await saveLanguageElectiveRoster(academicYear, students, languageClassSettings);
    } catch (e: any) {
      setSettingsError(e?.message || '儲存失敗');
    } finally {
      setSavingSettings(false);
    }
  }, [academicYear, students, languageClassSettings]);

  const loadRoster = useCallback(async () => {
    setLoadingRoster(true);
    try {
      const doc = await getLanguageElectiveRoster(academicYear);
      setStudents(doc?.students ?? []);
      setLanguageClassSettings(doc?.languageClassSettings ?? []);
    } finally {
      setLoadingRoster(false);
    }
  }, [academicYear]);

  useEffect(() => {
    loadRoster();
  }, [loadRoster]);

  const loadCalendarSettings = useCallback(async () => {
    try {
      setCalendarSettingsError(null);
      const sem = semester.includes('學期') ? semester : `${semester}學期`;
      const cal = await getCalendarSettings(academicYear, sem);
      setCalendarSettings(cal ?? null);
    } catch (e: any) {
      setCalendarSettings(null);
      setCalendarSettingsError(e?.message || '載入學期設定失敗（可能是權限或 Firebase 專案不一致）');
    }
  }, [academicYear, semester]);

  useEffect(() => {
    loadCalendarSettings();
  }, [loadCalendarSettings]);

  const handleAddDate = () => {
    if (dateInput) {
      const d = new Date(dateInput);
      if (!isNaN(d.getTime())) {
        setDates((prev) => [...prev, d].sort((a, b) => a.getTime() - b.getTime()));
        setDateInput('');
      }
    }
  };

  const handleRemoveDate = (index: number) => {
    setDates((prev) => prev.filter((_, i) => i !== index));
  };

  const toYYYYMMDD = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  /** 批次生成：直接依 Firebase 學期開始/結束與放假日，依選定星期幾生成日期（不提供手動區間） */
  const handleGenerateDates = () => {
    const startStr = calendarSettings?.startDate;
    const endStr = calendarSettings?.endDate;
    if (!startStr || !endStr) {
      alert('尚未載入學期設定（學期開始/結束日），請確認 Firebase 已設定該學年學期。');
      return;
    }
    const start = new Date(startStr);
    const end = new Date(endStr);
    const holidaySet = new Set(calendarSettings?.holidays ?? []);
    const targetDay = parseInt(genDayOfWeek, 10);
    const newDates: Date[] = [];
    let current = new Date(start);
    while (current <= end) {
      if (current.getDay() === targetDay && !holidaySet.has(toYYYYMMDD(current))) {
        newDates.push(new Date(current));
      }
      current.setDate(current.getDate() + 1);
    }
    setDates((prev) => {
      const combined = [...prev, ...newDates];
      const unique = Array.from(new Set(combined.map((d) => d.getTime()))).map((t) => new Date(t));
      return unique.sort((a, b) => a.getTime() - b.getTime());
    });
  };

  const periodFromClassTime = (t: string): string => {
    const s = (t ?? '').trim();
    const m = s.match(/^W[1-5]-(.+)$/i);
    if (!m) return '第一節';
    const suffix = m[1].trim();
    if (suffix === '早') return '早自習';
    if (/^\d+$/.test(suffix)) return `第${parseInt(suffix, 10)}節`;
    return suffix;
  };

  const sheetDataList = useMemo((): AttendanceTableData[] => {
    const list: AttendanceTableData[] = [];
    for (const setting of languageClassSettings) {
      const name = setting.name?.trim();
      if (!name) continue;
      const rosterStudents = students
        .filter((s) => (s.languageClass ?? '').trim() === name)
        .sort((a, b) => {
          const c = a.className.localeCompare(b.className, undefined, { numeric: true });
          return c !== 0 ? c : parseInt(a.seat, 10) - parseInt(b.seat, 10);
        });
      if (rosterStudents.length === 0) continue;
      const period = periodFromClassTime(setting.time ?? '');
      const sheetStudents: Student[] = rosterStudents.map((s, i) => ({
        id: String(i + 1),
        period,
        className: s.className,
        name: s.name,
      }));
      list.push({
        academicYear,
        semester: semester.includes('學期') ? semester : `${semester}學期`,
        courseName: name,
        instructorName: setting.teacher ?? '',
        classTime: setting.time ?? '',
        location: setting.classroom ?? '',
        dates,
        students: sheetStudents,
      });
    }
    return list;
  }, [academicYear, semester, languageClassSettings, students, dates]);

  /** 列印輸出勾選：以課程/班別名稱（courseName）為 key */
  const [selectedSheetNames, setSelectedSheetNames] = useState<Set<string>>(new Set());
  const [selectionInitialized, setSelectionInitialized] = useState(false);
  useEffect(() => {
    const names = sheetDataList.map((d) => d.courseName).filter(Boolean);
    setSelectedSheetNames((prev) => {
      // 首次有資料時：預設全選
      if (!selectionInitialized) return new Set(names);
      // 之後：保留既有勾選（若班別消失則自動移除），不自動加回使用者取消的勾選
      const current = new Set(names);
      return new Set(Array.from(prev).filter((n) => current.has(n)));
    });
    if (!selectionInitialized && names.length > 0) setSelectionInitialized(true);
  }, [sheetDataList, selectionInitialized]);

  const selectedSheetDataList = useMemo(() => {
    if (selectedSheetNames.size === 0) return [];
    return sheetDataList.filter((d) => selectedSheetNames.has(d.courseName));
  }, [sheetDataList, selectedSheetNames]);

  const mergedSelectedSheetDataList = useMemo(() => {
    if (selectedSheetDataList.length === 0) return [];
    return mergeSheetsByLanguageAndTeacher(selectedSheetDataList);
  }, [selectedSheetDataList]);

  const classCount = useMemo(() => {
    const names = new Set(languageClassSettings.map((s) => s.name?.trim()).filter(Boolean));
    return names.size;
  }, [languageClassSettings]);

  /** 列印：開新視窗寫入整份 HTML，載入完成後縮放（若超出一頁）、列印、關閉；若無法開新視窗則提示允許彈出 */
  const handlePrintWithNewWindow = useCallback(() => {
    if (mergedSelectedSheetDataList.length === 0) return;
    const win = window.open('', '_blank');
    if (!win) {
      alert('無法開啟列印視窗，請允許瀏覽器的彈出視窗後再試。');
      return;
    }
    const html = buildAttendanceSheetsPrintHtml(mergedSelectedSheetDataList);
    win.document.write(html);
    win.document.close();
    const doPrint = () => {
      win.focus();
      win.onafterprint = () => win.close();
      win.print();
    };
    if (win.document.readyState === 'complete') setTimeout(doPrint, 50);
    else win.onload = doPrint;
  }, [mergedSelectedSheetDataList]);

  return (
    <div className="max-w-6xl mx-auto space-y-6 print:max-w-none print:mx-0 print:my-0 print:space-y-0">
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 8mm; }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
            overflow: visible !important;
            height: auto !important;
          }
          .no-print { display: none !important; }
          .print-sheets-container {
            margin: 0 !important;
            padding: 0 !important;
            max-width: none !important;
          }
          /* 每張點名表 = 一頁 A4 橫向：固定高度 210mm（A4 短邊），預覽與列印皆一表一頁 */
          .print-page {
            width: 100% !important;
            height: 210mm !important;
            min-height: 210mm !important;
            max-height: 210mm !important;
            box-sizing: border-box;
            margin: 0 !important;
            padding: 0 !important;
            page-break-after: always;
            break-after: page;
            overflow: hidden;
            display: block;
          }
          .print-page:first-child {
            page-break-before: auto;
          }
          .print-page:not(:first-child) {
            page-break-before: always;
            break-before: page;
          }
          .print-page:last-child {
            page-break-after: auto;
            break-after: auto;
          }
          .attendance-sheet-root {
            width: 100% !important;
            max-width: 100% !important;
            padding: 2mm 0 0 0 !important;
            margin: 0 !important;
            box-sizing: border-box;
            page-break-inside: avoid;
            break-inside: avoid;
          }
          .attendance-sheet-root table { table-layout: fixed; width: 100% !important; }
          .print-date-cell { width: 8mm !important; min-width: 8mm !important; max-width: 8mm !important; }
        }
      `}</style>
      <div className="no-print">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <FileText className="text-blue-600" />
          點名單製作
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          依學年讀取「學生名單」，在此頁可編輯語言班別設定（教室、時間、教師）並儲存；設定點名單日期後即可依班別產出點名單。
        </p>
      </div>

      <div className="no-print bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-slate-700">學年度</label>
            <input
              type="text"
              value={academicYear}
              onChange={(e) => setAcademicYear(e.target.value)}
              className="w-20 border rounded px-2 py-1.5 text-sm"
              placeholder="114"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-slate-700">學期</label>
            <select value={semester} onChange={(e) => setSemester(e.target.value)} className="border rounded px-2 py-1.5 text-sm">
              <option value="上學期">上學期</option>
              <option value="下學期">下學期</option>
            </select>
          </div>
          <button
            type="button"
            onClick={loadRoster}
            disabled={loadingRoster}
            className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-sm hover:bg-slate-200 disabled:opacity-50 flex items-center gap-1"
          >
            {loadingRoster ? <Loader2 size={14} className="animate-spin" /> : null}
            載入名單
          </button>
        </div>
        {students.length >= 0 && (
          <p className="text-sm text-slate-600">
            目前名單：{students.length} 人、{classCount} 個語言班別，可產出 {sheetDataList.length} 張點名單。
          </p>
        )}
      </div>

      {/* 語言班別設定：教室、時間、教師（與名單一併儲存） */}
      <div className="no-print bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={() => setLanguageClassSettingsOpen(!languageClassSettingsOpen)}
          className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 text-left"
        >
          <span className="font-semibold text-slate-800 flex items-center gap-2">
            <BookOpen size={18} />
            語言班別設定（教室、時間、教師）
          </span>
          {languageClassSettingsOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </button>
        {languageClassSettingsOpen && (
          <div className="p-4 pt-0 space-y-3">
            <p className="text-sm text-slate-600">
              班別名稱需與學生名單中「語言班別」選項一致；此處可記錄各班別的教室、上課時間、授課教師。修改後請按「儲存」與名單一併寫入。
            </p>
            {settingsError && (
              <p className="text-sm text-red-600">{settingsError}</p>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm border border-slate-200 rounded-lg">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-slate-700">班別名稱</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-700">教室</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-700">時間</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-700">教師</th>
                    <th className="px-2 py-2 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {languageClassSettings.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={row.name}
                          onChange={(e) => updateLanguageClassSetting(row.id, 'name', e.target.value)}
                          placeholder="例：閩南語A"
                          className="border rounded px-2 py-1 w-full max-w-[120px]"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={row.classroom ?? ''}
                          onChange={(e) => updateLanguageClassSetting(row.id, 'classroom', e.target.value)}
                          placeholder="教室"
                          className="border rounded px-2 py-1 w-full max-w-[100px]"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={row.time ?? ''}
                          onChange={(e) => updateLanguageClassSetting(row.id, 'time', e.target.value)}
                          placeholder="例：週一 08:00"
                          className="border rounded px-2 py-1 w-full max-w-[120px]"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={row.teacher ?? ''}
                          onChange={(e) => updateLanguageClassSetting(row.id, 'teacher', e.target.value)}
                          placeholder="教師"
                          className="border rounded px-2 py-1 w-full max-w-[100px]"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <button
                          type="button"
                          onClick={() => removeLanguageClassSetting(row.id)}
                          className="text-slate-400 hover:text-red-600"
                          title="刪除此班別"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={addLanguageClassSetting}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-200 text-slate-700 text-sm hover:bg-slate-300"
              >
                <Plus size={14} /> 新增班別
              </button>
              <button
                type="button"
                onClick={handleSaveLanguageClassSettings}
                disabled={savingSettings}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-700 text-white text-sm hover:bg-slate-800 disabled:opacity-50"
              >
                {savingSettings ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {savingSettings ? '儲存中...' : '儲存語言班別設定'}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="no-print bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={() => setDatesSettingOpen(!datesSettingOpen)}
          className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 text-left"
        >
          <span className="font-semibold text-slate-800 flex items-center gap-2">
            <CalendarIcon size={18} />
            點名單日期設定
          </span>
          {datesSettingOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </button>
        {datesSettingOpen && (
          <div className="p-4 pt-0 space-y-3">
            <div className="bg-blue-50 p-4 rounded-lg">
              <h4 className="font-bold text-blue-800 text-sm mb-2">批次生成（每週固定）</h4>
              <p className="text-xs text-blue-700 mb-2">
                時間直接參照 Firebase 學期開始與結束日，並自動排除法定放假日。僅可選擇星期幾後生成；仍可手動加入或刪除日期。
              </p>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <label className="text-sm text-slate-700">星期：</label>
                <select value={['1','2','3','4','5'].includes(genDayOfWeek) ? genDayOfWeek : '1'} onChange={(e) => setGenDayOfWeek(e.target.value)} className="border rounded p-1 text-sm">
                  <option value="1">週一</option>
                  <option value="2">週二</option>
                  <option value="3">週三</option>
                  <option value="4">週四</option>
                  <option value="5">週五</option>
                </select>
                <button
                  type="button"
                  onClick={handleGenerateDates}
                  className="px-3 py-1.5 rounded text-sm bg-blue-600 text-white hover:bg-blue-700"
                >
                  生成日期
                </button>
              </div>
              {calendarSettingsError && (
                <p className="text-xs text-red-600 mt-1 whitespace-pre-wrap">學期設定載入失敗：{calendarSettingsError}</p>
              )}
              {calendarSettings?.startDate && calendarSettings?.endDate && (
                <p className="text-xs text-slate-600">學期區間：{calendarSettings.startDate} ～ {calendarSettings.endDate}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">手動加入日期</label>
              <div className="flex gap-2">
                <input type="date" value={dateInput} onChange={(e) => setDateInput(e.target.value)} className="flex-1 border rounded p-2 text-sm" />
                <button type="button" onClick={handleAddDate} className="bg-slate-700 text-white px-4 rounded text-sm hover:bg-slate-800">加入</button>
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className="text-sm font-bold text-slate-700">已選日期（{dates.length}）</p>
                <button
                  type="button"
                  onClick={() => setDates([])}
                  disabled={dates.length === 0}
                  className="px-2 py-1 rounded text-xs bg-slate-200 text-slate-700 hover:bg-slate-300 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  一鍵清除
                </button>
              </div>
              <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                {dates.map((d, i) => (
                  <span key={i} className="bg-slate-100 border border-slate-300 px-2 py-1 rounded text-sm flex items-center">
                    {d.toLocaleDateString('zh-TW')}
                    <button type="button" onClick={() => handleRemoveDate(i)} className="ml-2 text-slate-400 hover:text-red-500">
                      <X size={12} />
                    </button>
                  </span>
                ))}
                {dates.length === 0 && <span className="text-slate-400 text-sm">尚未設定日期</span>}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-6 pb-20 print:space-y-0 print:pb-0">
        <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg flex justify-between items-center no-print">
          <div className="text-sm text-blue-800 flex-1 min-w-0">
            <strong>點名單預覽</strong> — 依語言班別共 {sheetDataList.length} 張；目前勾選輸出 {mergedSelectedSheetDataList.length} 張。
            <div className="mt-2">
              <button
                type="button"
                onClick={() => setPrintSelectionOpen((v) => !v)}
                className="text-blue-800 hover:underline inline-flex items-center gap-1"
              >
                {printSelectionOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                選擇要輸出的點名單
              </button>
              {printSelectionOpen && (
                <div className="mt-2 bg-white/70 border border-blue-200 rounded-lg p-3">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <button
                      type="button"
                      onClick={() => setSelectedSheetNames(new Set(sheetDataList.map((d) => d.courseName).filter(Boolean)))}
                      className="px-2 py-1 rounded bg-blue-600 text-white text-xs hover:bg-blue-700"
                    >
                      全選
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedSheetNames(new Set())}
                      className="px-2 py-1 rounded bg-slate-200 text-slate-700 text-xs hover:bg-slate-300"
                    >
                      全不選
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {sheetDataList.map((d) => (
                      <label key={d.courseName} className="flex items-start gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={selectedSheetNames.has(d.courseName)}
                          onChange={() => {
                            setSelectedSheetNames((prev) => {
                              const next = new Set(prev);
                              if (next.has(d.courseName)) next.delete(d.courseName);
                              else next.add(d.courseName);
                              return next;
                            });
                          }}
                          className="mt-1"
                        />
                        <span className="min-w-0">
                          <span className="font-medium">{d.courseName}</span>
                          <span className="text-slate-500">（{d.students.length}人）</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={handlePrintWithNewWindow}
            disabled={mergedSelectedSheetDataList.length === 0}
            className="flex items-center bg-slate-800 text-white px-4 py-2 rounded hover:bg-slate-900 disabled:opacity-50 disabled:hover:bg-slate-800"
            title={mergedSelectedSheetDataList.length === 0 ? '請先勾選要輸出的點名單' : '列印'}
          >
            <Printer size={18} className="mr-2" /> 列印
          </button>
        </div>
        {sheetDataList.length === 0 && (
          <div className="no-print bg-amber-50 border border-amber-200 p-6 rounded-lg text-amber-800 text-sm">
            <p className="font-medium mb-1">尚無可渲染的點名單。</p>
            <p>請先至「<strong>學生名單</strong>」建置名單，在此頁載入後可編輯語言班別設定並儲存，再設定點名單日期。</p>
          </div>
        )}
        <div className="print-sheets-container">
          {mergedSelectedSheetDataList.map((data) => (
            <div key={data.courseName} className="print-page">
              <AttendanceSheet data={data} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AttendanceSheetPage;
