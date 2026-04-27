import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Download, Users, ChevronDown, ChevronRight, Save, Loader2, RefreshCw, Search, Plus, Trash2, AlertTriangle } from 'lucide-react';
import type { LanguageElectiveStudent, LanguageClassSetting } from '../types';
import {
  getLanguageElectiveRoster,
  getAllLanguageElectiveRosters,
  buildNameToLanguageFromRosters,
  buildStudentIdToLanguageFromRosters,
  saveLanguageElectiveRoster,
  getLanguageOptions,
} from '../services/api';
import { loadLanguageOptions } from '../utils/languageOptions';

/** 跨學年衝突警示：辨識同一學生（優先學號，否則 trim 後姓名） */
function crossYearStableKey(s: LanguageElectiveStudent): string {
  const id = (s.studentId ?? '').trim();
  if (id) return `id:${id}`;
  return `n:${(s.name ?? '').trim()}`;
}

const LanguageElectiveRoster: React.FC = () => {
  const [academicYear, setAcademicYear] = useState('114');
  const [students, setStudents] = useState<LanguageElectiveStudent[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [languageOptions, setLanguageOptions] = useState<string[]>(() => loadLanguageOptions());
  const [batchLanguage, setBatchLanguage] = useState(() => loadLanguageOptions()[0] ?? '閩南語');
  useEffect(() => {
    getLanguageOptions().then((opts) => {
      setLanguageOptions(opts);
      setBatchLanguage((prev) => (opts.includes(prev) ? prev : opts[0] ?? prev));
    });
  }, []);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [inheriting, setInheriting] = useState(false);
  /** 本 session 內手動改過選修語言的列索引，繼承時不覆蓋 */
  const [manualEditIndices, setManualEditIndices] = useState<Set<number>>(new Set());
  /** 跨學年語言衝突：已按「以本學年為主」關閉警示的學生鍵（載入名單時清空） */
  const [crossYearDismissedKeys, setCrossYearDismissedKeys] = useState<Set<string>>(() => new Set());
  /** 搜尋：姓名或座號（空白則顯示全部）；輸入值，即時顯示於 input */
  const [searchQuery, setSearchQuery] = useState('');
  /** 搜尋篩選值：debounce 後才套用，避免每鍵觸發 1500+ 筆重算造成 INP 卡頓 */
  const [searchFilter, setSearchFilter] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setSearchFilter(searchQuery), 280);
    return () => clearTimeout(t);
  }, [searchQuery]);
  /** 班級篩選：下拉選單，空白＝全部 */
  const [classFilter, setClassFilter] = useState('');
  /** 選修語言篩選：下拉選單，空白＝全部 */
  const [languageFilter, setLanguageFilter] = useState('');
  /** 篩選／分區用快照：僅在載入、儲存、新增、刪除時更新，編輯班級／座號／姓名時不變，避免打一字就跳走 */
  const [filterSnapshot, setFilterSnapshot] = useState<LanguageElectiveStudent[]>([]);
  /** 語言班別設定（僅讀取，供下拉與儲存時帶入；編輯請至「點名單製作」頁） */
  const [languageClassSettings, setLanguageClassSettings] = useState<LanguageClassSetting[]>([]);
  /** 批次設定語言班別時選的班別 */
  const [batchLanguageClass, setBatchLanguageClass] = useState('');
  /** 所有學年名單（用於跨學年語言選修不同警示） */
  const [allRosters, setAllRosters] = useState<{ academicYear: string; students: LanguageElectiveStudent[] }[]>([]);
  /** 語言班別警示區塊是否展開（預設收合，有需要再點開） */
  const [noLanguageClassWarningOpen, setNoLanguageClassWarningOpen] = useState(false);
  /** 新增學生表單 */
  const [showAddForm, setShowAddForm] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [newSeat, setNewSeat] = useState('');
  const [newName, setNewName] = useState('');
  const [newLanguage, setNewLanguage] = useState(() => loadLanguageOptions()[0] ?? '');
  const [newLanguageClass, setNewLanguageClass] = useState('');

  const hasRoster = students.length > 0;
  const classNames = useMemo(
    () =>
      Array.from(new Set((filterSnapshot.length ? filterSnapshot : students).map((s) => s.className))).sort((a, b) =>
        String(a).localeCompare(String(b), undefined, { numeric: true })
      ),
    [filterSnapshot, students]
  );
  const languageClassNames = useMemo(() => languageClassSettings.map((s) => s.name), [languageClassSettings]);

  /** 選修語言選項：系統設定選項 ＋ 名單中實際出現的語言（避免資料有「越南語」等但篩選沒有） */
  const effectiveLanguageOptions = useMemo(() => {
    const snap = filterSnapshot.length === students.length ? filterSnapshot : students;
    const fromData = new Set(snap.map((s) => (s.language ?? '').trim()).filter(Boolean));
    const combined = new Set([...languageOptions, ...fromData]);
    return Array.from(combined).filter(Boolean).sort((a, b) => a.localeCompare(b, 'zh-TW'));
  }, [languageOptions, filterSnapshot, students]);

  /** 依搜尋條件篩選（以 filterSnapshot 判斷，使用 debounced searchFilter 避免每鍵重算） */
  const filteredWithIndex = useMemo(() => {
    const snap = filterSnapshot.length === students.length ? filterSnapshot : students;
    const q = searchFilter.trim().toLowerCase();
    if (!q) return students.map((s, i) => ({ s, i }));
    const qTrim = searchFilter.trim();
    return students
      .map((s, i) => ({ s, i }))
      .filter((_, i) => {
        const fs = snap[i];
        if (!fs) return false;
        return fs.name.toLowerCase().includes(q) || fs.seat === qTrim || String(fs.seat).includes(q);
      });
  }, [students, filterSnapshot, searchFilter]);

  /** 依班級篩選（以 filterSnapshot 判斷） */
  const filteredByClass = useMemo(() => {
    const snap = filterSnapshot.length === students.length ? filterSnapshot : students;
    if (!classFilter.trim()) return filteredWithIndex;
    return filteredWithIndex.filter(({ i }) => snap[i]?.className === classFilter);
  }, [filteredWithIndex, classFilter, filterSnapshot, students.length]);

  /** 依選修語言篩選（以 filterSnapshot 判斷） */
  const filteredByLanguage = useMemo(() => {
    const snap = filterSnapshot.length === students.length ? filterSnapshot : students;
    if (!languageFilter.trim()) return filteredByClass;
    return filteredByClass.filter(({ i }) => (snap[i]?.language ?? '') === languageFilter);
  }, [filteredByClass, languageFilter, filterSnapshot, students.length]);

  /** 目前畫面可見列的原始索引（供全選與批次操作） */
  const visibleIndices = useMemo(() => filteredByLanguage.map(({ i }) => i), [filteredByLanguage]);
  const selectedVisibleCount = useMemo(
    () => visibleIndices.filter((i) => selectedIds.has(i)).length,
    [visibleIndices, selectedIds]
  );
  const allVisibleSelected = visibleIndices.length > 0 && selectedVisibleCount === visibleIndices.length;

  /** 依班級分區（以 filterSnapshot 之班級分區，顯示用 students[i]） */
  const groupedByClass = useMemo(() => {
    const snap = filterSnapshot.length === students.length ? filterSnapshot : students;
    const map = new Map<string, { s: LanguageElectiveStudent; i: number }[]>();
    for (const { s, i } of filteredByLanguage) {
      const key = snap[i]?.className ?? s.className;
      const list = map.get(key) ?? [];
      list.push({ s, i });
      map.set(key, list);
    }
    const names = Array.from(map.keys()).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    return names.map((className) => ({
      className,
      rows: (map.get(className) ?? []).sort((a, b) => parseInt(a.s.seat, 10) - parseInt(b.s.seat, 10)),
    }));
  }, [filteredByLanguage, filterSnapshot, students.length]);
  const defaultLanguage = languageOptions[0] ?? '無／未選';

  /** 載入所有學年名單（供跨學年語言比對） */
  useEffect(() => {
    getAllLanguageElectiveRosters()
      .then((rosters) => setAllRosters(rosters.map((r) => ({ academicYear: r.academicYear, students: r.students ?? [] }))))
      .catch(() => setAllRosters([]));
  }, []);

  /** 是否為「未選」：未選的不納入跨學年不同警示 */
  const isLanguageUnset = (lang: string) => {
    const t = (lang ?? '').trim();
    return t === '' || t === '未選' || t === '無／未選' || t === '無/未選';
  };

  /** 本學年與他學年選修語言不同的學生（任一方為未選則不警示） */
  const crossYearLanguageDiffs = useMemo(() => {
    const otherRosters = allRosters.filter((r) => r.academicYear !== academicYear);
    if (otherRosters.length === 0) return [];
    const nameToOtherLangs = new Map<string, { year: string; lang: string }[]>();
    for (const r of otherRosters) {
      const key = (s: LanguageElectiveStudent) => (s.name ?? '').trim();
      for (const s of r.students) {
        const k = key(s);
        if (!k) continue;
        const lang = (s.language ?? '').trim();
        if (!nameToOtherLangs.has(k)) nameToOtherLangs.set(k, []);
        const list = nameToOtherLangs.get(k)!;
        if (!list.some((x) => x.year === r.academicYear)) list.push({ year: r.academicYear, lang });
      }
    }
    const result: { index: number; name: string; currentLang: string; others: { year: string; lang: string }[] }[] = [];
    students.forEach((s, i) => {
      if (crossYearDismissedKeys.has(crossYearStableKey(s))) return;
      const k = (s.name ?? '').trim();
      const others = nameToOtherLangs.get(k);
      if (!others?.length) return;
      const currentLang = (s.language ?? '').trim();
      if (isLanguageUnset(currentLang)) return;
      const different = others.filter((o) => !isLanguageUnset(o.lang) && o.lang !== currentLang);
      if (different.length > 0) result.push({ index: i, name: s.name || k, currentLang, others: different });
    });
    return result;
  }, [allRosters, academicYear, students, crossYearDismissedKeys]);

  /** 除閩南語外，已選其他語言但未設定語言班別者（閩南語可免填，不顯示） */
  const noLanguageClassWarnings = useMemo(() => {
    const result: { index: number; name: string; language: string }[] = [];
    students.forEach((s, i) => {
      const lang = String(s.language ?? '').trim();
      if (isLanguageUnset(lang) || lang === '閩南語') return;
      const lc = String(s.languageClass ?? '').trim();
      if (lc.length > 0) return;
      result.push({
        index: i,
        name: (s.name && String(s.name).trim()) || '—',
        language: lang,
      });
    });
    return result;
  }, [students]);

  useEffect(() => {
    if (effectiveLanguageOptions.length && !effectiveLanguageOptions.includes(batchLanguage)) setBatchLanguage(effectiveLanguageOptions[0]);
  }, [effectiveLanguageOptions]);

  const loadSavedRoster = useCallback(async () => {
    setLoadingRoster(true);
    setError(null);
    try {
      const doc = await getLanguageElectiveRoster(academicYear);
      const list = doc?.students?.length ? doc.students : [];
      setStudents(list);
      setFilterSnapshot(list);
      setLanguageClassSettings(doc?.languageClassSettings ?? []);
      setManualEditIndices(new Set());
      setCrossYearDismissedKeys(new Set());
    } catch (e: any) {
      setError(e?.message || '載入失敗');
    } finally {
      setLoadingRoster(false);
    }
  }, [academicYear]);

  useEffect(() => {
    loadSavedRoster();
  }, [loadSavedRoster]);

  const updateStudentLanguage = (index: number, language: string) => {
    setManualEditIndices((prev) => new Set(prev).add(index));
    setStudents((prev) => {
      const next = [...prev];
      if (next[index]) next[index] = { ...next[index], language };
      return next;
    });
  };

  const updateStudentName = (index: number, name: string) => {
    setStudents((prev) => {
      const next = [...prev];
      if (next[index]) next[index] = { ...next[index], name: name.trim() || next[index].name };
      return next;
    });
  };

  const updateStudentStudentId = (index: number, studentId: string) => {
    setStudents((prev) => {
      const next = [...prev];
      if (next[index]) {
        const t = studentId.trim();
        next[index] = { ...next[index], studentId: t || undefined };
      }
      return next;
    });
  };

  const updateStudentSeat = (index: number, seat: string) => {
    setStudents((prev) => {
      const next = [...prev];
      if (next[index]) next[index] = { ...next[index], seat: String(seat).trim() || next[index].seat };
      return next;
    });
  };

  const updateStudentClass = (index: number, className: string) => {
    setStudents((prev) => {
      const next = [...prev];
      if (next[index]) next[index] = { ...next[index], className: className.trim() || next[index].className };
      return next;
    });
  };

  /** 使用者確認「以本學年為主」：不修改他學年資料，僅關閉本 session 的跨學年衝突提示 */
  const dismissCrossYearKeepCurrent = (name: string) => {
    const trimmedName = (name ?? '').trim();
    if (!trimmedName) return;
    setCrossYearDismissedKeys((prev) => {
      const next = new Set(prev);
      students.forEach((s) => {
        if ((s.name ?? '').trim() === trimmedName) next.add(crossYearStableKey(s));
      });
      return next;
    });
  };

  /** 解決衝突：將同一姓名之所有列改為指定選修語言（採用所選學年），並標記為手動編輯；警示會在與他學年語言一致後自動消失 */
  const applyConflictResolution = (name: string, language: string) => {
    const trimmedName = (name ?? '').trim();
    if (!trimmedName) return;
    setStudents((prev) =>
      prev.map((s) =>
        (s.name ?? '').trim() === trimmedName ? { ...s, language } : s
      )
    );
    setManualEditIndices((p) => {
      const n = new Set(p);
      students.forEach((s, i) => {
        if ((s.name ?? '').trim() === trimmedName) n.add(i);
      });
      return n;
    });
  };

  const removeStudent = (index: number) => {
    setStudents((prev) => prev.filter((_, i) => i !== index));
    setFilterSnapshot((prev) => prev.filter((_, i) => i !== index));
    setSelectedIds((prev) => {
      const out = new Set<number>();
      prev.forEach((i) => {
        if (i === index) return;
        out.add(i > index ? i - 1 : i);
      });
      return out;
    });
    setManualEditIndices((prev) => {
      const out = new Set<number>();
      prev.forEach((i) => {
        if (i === index) return;
        out.add(i > index ? i - 1 : i);
      });
      return out;
    });
  };

  const handleAddStudent = () => {
    const cn = newClassName.trim();
    const seat = newSeat.trim();
    const name = newName.trim();
    if (!cn || !seat || !name) return;
    const newEntry: LanguageElectiveStudent = {
      className: cn,
      seat,
      name,
      language: newLanguage || defaultLanguage,
      languageClass: newLanguageClass || undefined,
    };
    setStudents((prev) => [...prev, newEntry]);
    setFilterSnapshot((prev) => [...prev, newEntry]);
    setNewClassName('');
    setNewSeat('');
    setNewName('');
    setNewLanguage(defaultLanguage);
    setNewLanguageClass('');
    setShowAddForm(false);
  };

  const updateStudentLanguageClass = (index: number, languageClass: string) => {
    setStudents((prev) => {
      const next = [...prev];
      if (next[index]) next[index] = { ...next[index], languageClass: languageClass || undefined };
      return next;
    });
  };

  const toggleSelect = (index: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const selectAll = () => {
    if (visibleIndices.length === 0) {
      setSelectedIds(new Set());
      return;
    }
    if (allVisibleSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        visibleIndices.forEach((i) => next.delete(i));
        return next;
      });
      return;
    }
    setSelectedIds((prev) => {
      const next = new Set(prev);
      visibleIndices.forEach((i) => next.add(i));
      return next;
    });
  };

  const applyBatchLanguage = () => {
    if (selectedIds.size === 0) return;
    setManualEditIndices((prev) => {
      const next = new Set(prev);
      selectedIds.forEach((i) => next.add(i));
      return next;
    });
    setStudents((prev) =>
      prev.map((s, i) => (selectedIds.has(i) ? { ...s, language: batchLanguage } : s))
    );
    setSelectedIds(new Set());
  };

  /** 依姓名從「上一學年度」繼承選修語言：僅當新學年為「無／未選」或未填時才繼承，已有填寫則保留。 */
  const isUnsetLanguage = (lang: string | undefined) => {
    const v = (lang ?? '').trim();
    return v === '' || v === '無／未選' || v === '無/未選';
  };

  const handleInheritLanguages = async () => {
    if (students.length === 0) return;
    setInheriting(true);
    setError(null);
    try {
      const prevYear = String(parseInt(academicYear, 10) - 1);
      const allRosters = await getAllLanguageElectiveRosters();
      const prevRoster = allRosters.find((r) => r.academicYear === prevYear);
      const nameToLanguage = prevRoster ? buildNameToLanguageFromRosters([prevRoster]) : {};
      const studentIdToLanguage = prevRoster ? buildStudentIdToLanguageFromRosters([prevRoster]) : {};
      const matched = Object.keys(nameToLanguage).length + Object.keys(studentIdToLanguage).length;
      const nameKey = (name: string) => (name && String(name).trim()) || '';
      setStudents((prev) =>
        prev.map((s) => {
          const sid = (s.studentId ?? '').trim();
          const fromId = sid ? studentIdToLanguage[sid] : undefined;
          const fromName = nameToLanguage[nameKey(s.name)];
          const inherited = fromId ?? fromName;
          return {
            ...s,
            language: isUnsetLanguage(s.language) ? (inherited ?? s.language) : s.language,
          };
        })
      );
      if (matched === 0) setError(`${prevYear} 學年無名單可繼承，或學號／姓名皆無對應。`);
      else setError(null);
    } catch (e: any) {
      setError(e?.message || '繼承失敗');
    } finally {
      setInheriting(false);
    }
  };

  const handleSave = async () => {
    if (students.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const doc = await getLanguageElectiveRoster(academicYear);
      const latestSettings = doc?.languageClassSettings ?? languageClassSettings;
      await saveLanguageElectiveRoster(academicYear, students, latestSettings);
      setLanguageClassSettings(latestSettings);
      setFilterSnapshot([...students]);
    } catch (e: any) {
      setError(e?.message || '儲存失敗');
    } finally {
      setSaving(false);
    }
  };

  const downloadJson = () => {
    const roster: Record<string, Record<string, string>> = {};
    students.forEach((s) => {
      if (!roster[s.className]) roster[s.className] = {};
      roster[s.className][s.seat] = `${s.name}（${s.language}）`;
    });
    const blob = new Blob([JSON.stringify(roster, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `language_elective_${academicYear}_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <Users className="text-blue-600" />
          學生名單
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          學年名單之編輯、查詢、儲存；可設定選修語言與語言班別。名單來源請至「系統設定」以 Excel/CSV 上傳（每年約一次）；語言班別之教室、時間、教師請至「點名單製作」頁設定。建置完成後可於「點名單製作」產出點名單、於「頒獎通知」從名單拖曳加入受獎學生。
        </p>
      </div>

      {/* 學年 + 載入名單 + 搜尋 */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-4">
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
          <button
            type="button"
            onClick={loadSavedRoster}
            disabled={loadingRoster}
            className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-sm hover:bg-slate-200 disabled:opacity-50 flex items-center gap-1"
          >
            {loadingRoster ? <Loader2 size={14} className="animate-spin" /> : null}
            載入名單
          </button>
          {hasRoster && (
            <>
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-slate-700 whitespace-nowrap">班級</label>
                <select
                  value={classFilter}
                  onChange={(e) => setClassFilter(e.target.value)}
                  className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm min-w-[5rem] focus:ring-2 focus:ring-blue-300"
                >
                  <option value="">全部</option>
                  {classNames.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-slate-700 whitespace-nowrap">選修語言</label>
                <select
                  value={languageFilter}
                  onChange={(e) => setLanguageFilter(e.target.value)}
                  className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm min-w-[6rem] focus:ring-2 focus:ring-blue-300"
                >
                  <option value="">全部</option>
                  {effectiveLanguageOptions.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2 ml-auto">
                <Search size={16} className="text-slate-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="搜尋姓名或座號…"
                  className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm w-56 focus:ring-2 focus:ring-blue-300"
                />
                {(searchQuery.trim() || classFilter || languageFilter) && (
                  <span className="text-xs text-slate-500">符合 {filteredByLanguage.length} 人</span>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* 尚無名單時：可新增第一筆或引導至系統設定匯入 */}
      {!hasRoster && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <p className="text-slate-600 mb-3">尚無名單。請至「系統設定」匯入 Excel，或在此新增學生：</p>
          <button
            type="button"
            onClick={() => setShowAddForm((v) => !v)}
            className="inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-100 text-emerald-800 rounded-lg hover:bg-emerald-200 text-sm"
          >
            <Plus size={14} />
            新增學生
          </button>
          {showAddForm && (
            <div className="mt-4 p-4 rounded-xl border border-emerald-200 bg-emerald-50/50">
              <p className="text-sm font-medium text-slate-700 mb-3">新增一筆學生</p>
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-0.5">班級</label>
                  <input type="text" value={newClassName} onChange={(e) => setNewClassName(e.target.value)} placeholder="例：609" className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm w-24" />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-0.5">座號</label>
                  <input type="text" value={newSeat} onChange={(e) => setNewSeat(e.target.value)} placeholder="例：1" className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm w-20" />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-0.5">姓名</label>
                  <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="姓名" className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm w-28" />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-0.5">選修語言</label>
                  <select value={newLanguage} onChange={(e) => setNewLanguage(e.target.value)} className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm min-w-[6rem]">
                    {effectiveLanguageOptions.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-0.5">語言班別</label>
                  <select value={newLanguageClass} onChange={(e) => setNewLanguageClass(e.target.value)} className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm min-w-[5rem]">
                    <option value="">—</option>
                    {languageClassNames.map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>
                <button type="button" onClick={handleAddStudent} disabled={!newClassName.trim() || !newSeat.trim() || !newName.trim()} className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 disabled:opacity-50">
                  確認新增
                </button>
                <button type="button" onClick={() => setShowAddForm(false)} className="px-3 py-1.5 bg-slate-200 text-slate-700 rounded-lg text-sm hover:bg-slate-300">
                  取消
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 名單表格：手動修改 + 批次 */}
      {hasRoster && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
            <h2 className="text-lg font-semibold text-slate-800">
              {academicYear} 學年名單（{students.length} 人）
            </h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowAddForm((v) => !v)}
                className="inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-100 text-emerald-800 rounded-lg hover:bg-emerald-200 text-sm"
              >
                <Plus size={14} />
                新增學生
              </button>
              <button
                type="button"
                onClick={downloadJson}
                className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 text-sm"
              >
                <Download size={14} />
                下載 JSON
              </button>
              <button
                type="button"
                onClick={handleInheritLanguages}
                disabled={inheriting || students.length === 0}
                title="僅當選修語言為「無／未選」或未填時才從上一學年帶入；優先依學號對應，否則依姓名；已有填寫則保留不覆蓋"
                className="inline-flex items-center gap-2 px-3 py-1.5 bg-amber-100 text-amber-800 rounded-lg hover:bg-amber-200 text-sm disabled:opacity-50"
              >
                {inheriting ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                依上一學年繼承語言
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm disabled:opacity-50"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                儲存至 Firebase
              </button>
            </div>
          </div>

          {/* 批次調整 */}
          <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={selectAll}
              className="text-sm font-medium text-amber-800 hover:underline"
            >
              {allVisibleSelected ? '取消全選（目前篩選）' : '全選（目前篩選）'}
            </button>
            <span className="text-amber-700 text-sm">
              已選 {selectedIds.size} 人（目前篩選 {selectedVisibleCount}/{visibleIndices.length}）
            </span>
            <select
              value={batchLanguage}
              onChange={(e) => setBatchLanguage(e.target.value)}
              className="border rounded px-2 py-1 text-sm"
            >
              {effectiveLanguageOptions.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={applyBatchLanguage}
              disabled={selectedIds.size === 0}
              className="px-3 py-1.5 bg-amber-600 text-white rounded text-sm hover:bg-amber-700 disabled:opacity-50"
            >
              將選取學生設為上述語言
            </button>
            {languageClassNames.length > 0 && (
              <>
                <select
                  value={batchLanguageClass}
                  onChange={(e) => setBatchLanguageClass(e.target.value)}
                  className="border rounded px-2 py-1 text-sm"
                >
                  <option value="">— 語言班別 —</option>
                  {languageClassNames.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => {
                    if (!batchLanguageClass || selectedIds.size === 0) return;
                    setStudents((prev) =>
                      prev.map((s, i) =>
                        selectedIds.has(i) ? { ...s, languageClass: batchLanguageClass } : s
                      )
                    );
                    setSelectedIds(new Set());
                  }}
                  disabled={selectedIds.size === 0 || !batchLanguageClass}
                  className="px-3 py-1.5 bg-slate-600 text-white rounded text-sm hover:bg-slate-700 disabled:opacity-50"
                >
                  將選取學生設為上述班別
                </button>
              </>
            )}
          </div>

          {showAddForm && (
            <div className="mb-4 p-4 rounded-xl border border-emerald-200 bg-emerald-50/50">
              <p className="text-sm font-medium text-slate-700 mb-3">新增一筆學生</p>
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-0.5">班級</label>
                  <input
                    type="text"
                    value={newClassName}
                    onChange={(e) => setNewClassName(e.target.value)}
                    placeholder="例：609"
                    className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm w-24"
                    list="roster-class-list"
                  />
                  <datalist id="roster-class-list">
                    {classNames.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-0.5">座號</label>
                  <input
                    type="text"
                    value={newSeat}
                    onChange={(e) => setNewSeat(e.target.value)}
                    placeholder="例：1"
                    className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm w-20"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-0.5">姓名</label>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="姓名"
                    className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm w-28"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-0.5">選修語言</label>
                  <select
                    value={newLanguage}
                    onChange={(e) => setNewLanguage(e.target.value)}
                    className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm min-w-[6rem]"
                  >
                    {effectiveLanguageOptions.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-0.5">語言班別</label>
                  <select
                    value={newLanguageClass}
                    onChange={(e) => setNewLanguageClass(e.target.value)}
                    className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm min-w-[5rem]"
                  >
                    <option value="">—</option>
                    {languageClassNames.map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={handleAddStudent}
                  disabled={!newClassName.trim() || !newSeat.trim() || !newName.trim()}
                  className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 disabled:opacity-50"
                >
                  確認新增
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="px-3 py-1.5 bg-slate-200 text-slate-700 rounded-lg text-sm hover:bg-slate-300"
                >
                  取消
                </button>
              </div>
            </div>
          )}

          {crossYearLanguageDiffs.length > 0 && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="font-medium">以下學生於其他學年度選修語言與本學年（{academicYear}）不同，可選擇以哪一學年為主：</p>
                <ul className="mt-2 space-y-2 text-amber-900">
                  {crossYearLanguageDiffs.map((d) => (
                    <li key={`${d.index}-${d.name}`} className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{d.name}</span>
                      <span className="text-amber-700">
                        本學年：{d.currentLang || '（未選）'}
                        {d.others.map((o) => `；${o.year} 學年：${o.lang || '（未選）'}`).join('')}
                      </span>
                      <span className="inline-flex flex-wrap gap-1">
                        <button
                          type="button"
                          onClick={() => dismissCrossYearKeepCurrent(d.name)}
                          className="rounded border border-amber-300 bg-white px-2 py-0.5 text-xs font-medium text-amber-800 hover:bg-amber-100"
                        >
                          以本學年為主
                        </button>
                        {d.others.map((o) => (
                          <button
                            key={o.year}
                            type="button"
                            onClick={() => applyConflictResolution(d.name, o.lang ?? '')}
                            className="rounded border border-amber-300 bg-white px-2 py-0.5 text-xs font-medium text-amber-800 hover:bg-amber-100"
                          >
                            以{o.year}學年為主
                          </button>
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {noLanguageClassWarnings.length > 0 && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 text-sm text-amber-800 overflow-hidden">
              <button
                type="button"
                onClick={() => setNoLanguageClassWarningOpen((v) => !v)}
                className="w-full flex items-center gap-2 p-3 text-left hover:bg-amber-100/80 transition-colors"
              >
                {noLanguageClassWarningOpen ? (
                  <ChevronDown size={18} className="flex-shrink-0 text-amber-700" />
                ) : (
                  <ChevronRight size={18} className="flex-shrink-0 text-amber-700" />
                )}
                <AlertTriangle size={18} className="flex-shrink-0" />
                <span className="font-medium flex-1">以下學生已選擇閩南語以外之選修語言，但未設定語言班別：</span>
                <span className="text-amber-600 text-xs">（{noLanguageClassWarnings.length} 人）</span>
              </button>
              {noLanguageClassWarningOpen && (
                <div className="px-3 pb-3 pt-0 flex items-start gap-2">
                  <div className="w-[18px] flex-shrink-0" aria-hidden />
                  <ul className="mt-1 list-disc list-inside space-y-0.5 text-amber-900 flex-1 min-w-0">
                    {noLanguageClassWarnings.map((w) => (
                      <li key={w.index}>
                        {w.name} — 選修語言：{w.language}，語言班別：未設定
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <p className="mb-2 text-sm text-slate-600">
            以下依班級分區顯示；可編輯班級、座號、學號、姓名、選修語言、語言班別。篩選與分區以「儲存前」的資料為準，編輯後按「儲存至 Firebase」才會一併更新。
            若該生原為暫存主檔（無學號），補上學號後儲存會自動合併歷年資料到學號主檔並刪除舊的暫存文件。
          </p>

          <div className="overflow-x-auto max-h-[520px] overflow-y-auto border border-slate-200 rounded-lg">
            {groupedByClass.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-sm">
                {(searchQuery.trim() || classFilter || languageFilter) ? '無符合條件的學生' : '尚無名單'}
              </div>
            ) : (
              <div className="divide-y divide-slate-200">
                {groupedByClass.map(({ className, rows }) => (
                  <div key={className} className="bg-white">
                    <div className="sticky top-0 z-10 bg-slate-100 px-4 py-2 font-semibold text-slate-800 border-b border-slate-200">
                      {className} 班（{rows.length} 人）
                    </div>
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-2 py-2 w-10 text-center">
                            <input
                              type="checkbox"
                              checked={rows.every(({ i }) => selectedIds.has(i)) && rows.length > 0}
                              onChange={() => {
                                const allSelected = rows.every(({ i }) => selectedIds.has(i));
                                setSelectedIds((prev) => {
                                  const next = new Set(prev);
                                  rows.forEach(({ i }) => (allSelected ? next.delete(i) : next.add(i)));
                                  return next;
                                });
                              }}
                            />
                          </th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600">班級</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600">座號</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600">學號</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600">姓名</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600">選修語言</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600">語言班別</th>
                          <th className="px-2 py-2 w-10"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {rows.map(({ s, i }) => (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="px-2 py-2 text-center">
                              <input
                                type="checkbox"
                                checked={selectedIds.has(i)}
                                onChange={() => toggleSelect(i)}
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="text"
                                value={s.className}
                                onChange={(e) => updateStudentClass(i, e.target.value)}
                                className="border border-slate-200 rounded px-2 py-1 text-sm w-20 bg-white"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="text"
                                value={s.seat}
                                onChange={(e) => updateStudentSeat(i, e.target.value)}
                                className="border border-slate-200 rounded px-2 py-1 text-sm w-14 bg-white"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="text"
                                value={s.studentId ?? ''}
                                onChange={(e) => updateStudentStudentId(i, e.target.value)}
                                placeholder="選填"
                                className="border border-slate-200 rounded px-2 py-1 text-sm w-24 bg-white"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="text"
                                value={s.name}
                                onChange={(e) => updateStudentName(i, e.target.value)}
                                className="border border-slate-200 rounded px-2 py-1 text-sm w-24 bg-white"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-1">
                                <select
                                  value={s.language}
                                  onChange={(e) => updateStudentLanguage(i, e.target.value)}
                                  className="border rounded px-2 py-1 text-sm w-full max-w-[140px]"
                                >
                                  {(() => {
                                    const opts = new Set(effectiveLanguageOptions);
                                    if (s.language && !opts.has(s.language)) opts.add(s.language);
                                    return Array.from(opts).map((opt) => (
                                      <option key={opt} value={opt}>{opt}</option>
                                    ));
                                  })()}
                                </select>
                                {crossYearLanguageDiffs.some((d) => d.index === i) && (
                                  <span
                                    title={(() => {
                                      const d = crossYearLanguageDiffs.find((x) => x.index === i);
                                      if (!d) return '';
                                      return `他學年選修不同：${d.others.map((o) => `${o.year} 學年 ${o.lang || '（未選）'}`).join('、')}`;
                                    })()}
                                    className="text-amber-600 flex-shrink-0"
                                  >
                                    <AlertTriangle size={14} />
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-1">
                                <select
                                  value={s.languageClass ?? ''}
                                  onChange={(e) => updateStudentLanguageClass(i, e.target.value)}
                                  className="border rounded px-2 py-1 text-sm w-full max-w-[120px]"
                                >
                                  <option value="">—</option>
                                  {languageClassNames.map((n) => (
                                    <option key={n} value={n}>{n}</option>
                                  ))}
                                  {s.languageClass && !languageClassNames.includes(s.languageClass) && (
                                    <option value={s.languageClass}>{s.languageClass}</option>
                                  )}
                                </select>
                                {noLanguageClassWarnings.some((w) => w.index === i) && (
                                  <span
                                    title="已選閩南語以外之語言，請設定語言班別"
                                    className="text-amber-600 flex-shrink-0"
                                  >
                                    <AlertTriangle size={14} />
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-2 py-2">
                              <button
                                type="button"
                                onClick={() => removeStudent(i)}
                                className="text-slate-400 hover:text-red-600 p-1"
                                title="刪除此筆"
                              >
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default LanguageElectiveRoster;
