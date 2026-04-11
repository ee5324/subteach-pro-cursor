
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';
import { Trash2, Settings, X, Loader2, Edit2, AlertTriangle, Wifi, FileText, ExternalLink, Save, CloudUpload, Filter, RefreshCw, Calendar as CalendarIcon, ChevronDown, CheckCircle, FileOutput, Printer, ChevronLeft, ChevronRight, CheckSquare, Square, MinusSquare, FolderOpen, Phone, Image as ImageIcon, Calculator, Search, MessageSquare, UserSearch } from 'lucide-react';
import html2canvas from 'html2canvas';
import { PayType, SubstituteDetail, LeaveRecord, LeaveType, ProcessingStatus, TimetableSlot, HOURLY_RATE, PROCESSING_STATUS_OPTIONS, TeacherType } from '../types';
import { Link, useNavigate } from 'react-router-dom';
import { callGasApi } from '../utils/api';
import { convertSlotsToDetails, getExpectedDailyRate, getDaysInMonth, deduplicateDetails } from '../utils/calculations';
import { calculateSubstituteMonthlyBreakdown } from '../utils/substituteCompensation';
import Modal, { ModalMode, ModalType } from '../components/Modal';
import InstructionPanel, { CollapsibleItem } from '../components/InstructionPanel';
import SubstituteSalaryReferencePanel, { CHC_SALARY_TABLE_114_PDF } from '../components/SubstituteSalaryReferencePanel';

type ViewMode = 'byLeaveTeacher' | 'bySubstituteTeacher';

const PERIOD_ROWS = [
  { id: '早', label: '早' },
  { id: '1', label: '1' },
  { id: '2', label: '2' },
  { id: '3', label: '3' },
  { id: '4', label: '4' },
  { id: '午', label: '午' },
  { id: '5', label: '5' },
  { id: '6', label: '6' },
  { id: '7', label: '7' },
];

const getMonday = (dateStr: string) => {
    const d = new Date(dateStr);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diff));
    return monday.toISOString().split('T')[0];
};

const Records: React.FC = () => {
  const navigate = useNavigate();
  const { records, teachers, fixedOvertimeConfig, overtimeRecords, activeSemesterId, deleteRecord, updateRecord, settings, updateSettings, holidays, salaryGrades } = useAppStore(); // Added updateRecord
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [tempUrl, setTempUrl] = useState('');
  
  // Month Selection State
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  // View Mode
  const [viewMode, setViewMode] = useState<ViewMode>('byLeaveTeacher');

  // Selection State (New)
  const [selectedRecordIds, setSelectedRecordIds] = useState<Set<string>>(new Set());
  /** 多選批次變更憑證狀態時的目標值 */
  const [batchVoucherStatus, setBatchVoucherStatus] = useState<ProcessingStatus>('已印代課單');

  // Search State（searchInput：輸入框顯示；searchTerm：篩選用。組字期間只更新前者，避免 Mac 中文輸入法選字被重繪打斷）
  const [searchTerm, setSearchTerm] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const searchComposingRef = useRef(false);
  /** 代課清冊假別篩選（與代課單 LeaveType 一致） */
  const [leaveTypeFilter, setLeaveTypeFilter] = useState<LeaveType | 'all'>('all');

  // Sync States
  const [isSyncing, setIsSyncing] = useState(false);
  const [isGeneratingBatch, setIsGeneratingBatch] = useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [errorLog, setErrorLog] = useState<string | null>(null);

  // Export Picker Modal
  const EXPORT_TYPE_OPTIONS: { key: string; label: string; description?: string }[] = [
    { key: '公假', label: '公假' },
    { key: '喪病產', label: '喪病產假' },
    { key: '身心假', label: '身心假' },
    { key: '學輔事務', label: '學輔事務' },
    { key: '其他事務', label: '其他事務' },
    { key: '公付其他', label: '公付其他' },
    { key: '自理', label: '課務自理' },
    { key: '家長會', label: '家長會' },
  ];
  const [isExportPickerOpen, setIsExportPickerOpen] = useState(false);
  const [selectedLedgerTypes, setSelectedLedgerTypes] = useState<Set<string>>(
    () => new Set(EXPORT_TYPE_OPTIONS.map(o => o.key))
  );
  const [selectedVoucherTypes, setSelectedVoucherTypes] = useState<Set<string>>(
    () => new Set(EXPORT_TYPE_OPTIONS.map(o => o.key))
  );
  
  // Doc Generation States
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  
  // Test Connection States
  const [isTesting, setIsTesting] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');

  // New: Folder Opening State (Track specific record ID)
  const [openingFolderId, setOpeningFolderId] = useState<string | null>(null);

  // Modal State
  const [modal, setModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: ModalType;
    mode: ModalMode;
    onConfirm?: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    type: 'info',
    mode: 'alert'
  });

  const closeModal = () => setModal(prev => ({ ...prev, isOpen: false }));
  const showModal = (props: Partial<typeof modal>) => {
      setModal({
          isOpen: true,
          title: props.title || '訊息',
          message: props.message || '',
          type: props.type || 'info',
          mode: props.mode || 'alert',
          onConfirm: props.onConfirm
      });
  };

  const openPendingTab = () => {
    const tab = window.open('', '_blank');
    if (tab) {
      tab.document.write(`
        <html>
          <head><title>載入中...</title></head>
          <body style="font-family: sans-serif; padding: 24px; color: #334155;">
            正在產生文件，請稍候...
          </body>
        </html>
      `);
      tab.document.close();
    }
    return tab;
  };

  const navigateOpenedTab = (tab: Window | null, url: string) => {
    if (tab) {
      tab.location.href = url;
      return true;
    }
    return false;
  };

  // --- Helpers ---

  // 格式化簡短日期 (M/D)
  const formatDateSimple = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };

  // 月份切換處理
  const handleMonthChange = (direction: 'prev' | 'next') => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const current = new Date(year, month - 1, 1);
    current.setMonth(current.getMonth() + (direction === 'next' ? 1 : -1));
    const newYear = current.getFullYear();
    const newMonth = String(current.getMonth() + 1).padStart(2, '0');
    setSelectedMonth(`${newYear}-${newMonth}`);
  };

  // Status Styling Helper
  const getStatusColor = (status: ProcessingStatus | undefined) => {
      switch (status) {
          case '已印代課單': return 'bg-blue-100 text-blue-700 border-blue-200';
          case '跑章中': return 'bg-orange-100 text-orange-700 border-orange-200';
          case '結案待算': return 'bg-green-100 text-green-700 border-green-200';
          default: return 'bg-slate-100 text-slate-600 border-slate-200'; // 待處理
      }
  };

  // --- Computed Data ---

  // Calculate month boundaries for filtering and display
  const { monthStartStr, monthEndStr } = useMemo(() => {
      const [year, month] = selectedMonth.split('-').map(Number);
      const lastDay = new Date(year, month, 0).getDate();
      return {
          monthStartStr: `${selectedMonth}-01`,
          monthEndStr: `${selectedMonth}-${String(lastDay).padStart(2, '0')}`
      };
  }, [selectedMonth]);

  // 正規化為 YYYY-MM-DD 以便正確比較（相容不同寫入格式）
  const toYMD = (d: string | number | undefined | null): string => {
    if (d == null) return '';
    const s = String(d).trim();
    if (!s) return '';
    const normalized = s.replace(/\//g, '-');
    const match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (match) return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
    return normalized;
  };

  // 1a. 該月 + 假別（不含文字搜尋）：供總計、快速標籤、與後續搜尋篩選共用
  const recordsInMonthBase = useMemo(() => {
    const filtered = records.filter(r => {
        const details = r.details || [];
        const slots = r.slots || [];
        let start = toYMD(r.startDate || '');
        let end = toYMD(r.endDate || '');
        if (!start || !end) {
          const dates = (slots.length > 0 ? slots.map(s => s.date) : details.map(d => d.date))
            .map(toYMD)
            .filter(Boolean)
            .sort();
          if (dates.length > 0) {
            start = start || dates[0];
            end = end || dates[dates.length - 1];
          } else {
            start = start || monthStartStr;
            end = end || monthEndStr;
          }
        }
        const inMonthByRange = start <= monthEndStr && end >= monthStartStr;
        const hasAnyDateInMonth = [...details.map(d => toYMD(d.date)), ...slots.map(s => toYMD(s.date))]
          .some(date => date >= monthStartStr && date <= monthEndStr);
        const inMonth = inMonthByRange || hasAnyDateInMonth;
        if (!inMonth) return false;
        if (leaveTypeFilter !== 'all' && r.leaveType !== leaveTypeFilter) return false;
        return true;
    });
    return filtered.sort((a, b) => b.createdAt - a.createdAt);
  }, [records, monthStartStr, monthEndStr, leaveTypeFilter]);

  // 1b. 文字搜尋（在 recordsInMonthBase 之上）
  const filteredRecords = useMemo(() => {
    if (!searchTerm.trim()) return recordsInMonthBase;
    const term = searchTerm.toLowerCase();
    return recordsInMonthBase.filter(r => {
        const originalTeacher = teachers.find(t => t.id === r.originalTeacherId)?.name || r.originalTeacherId;
        const subTeachers = (r.details || []).map(d => {
             return d.substituteTeacherId === 'pending' ? '待聘' : (teachers.find(t => t.id === d.substituteTeacherId)?.name || d.substituteTeacherId);
        }).join(' ');
        return (
            originalTeacher.toLowerCase().includes(term) ||
            subTeachers.toLowerCase().includes(term) ||
            (r.reason || '').toLowerCase().includes(term) ||
            (r.docId || '').toLowerCase().includes(term)
        );
    });
  }, [recordsInMonthBase, searchTerm, teachers]);

  /** 依請假人模式：該月有紀錄且請假者為校內教師者，供快速點選篩選 */
  const leaveTeacherQuickTags = useMemo(() => {
    const byId = new Map<string, string>();
    for (const r of recordsInMonthBase) {
      const t =
        teachers.find((x) => x.id === r.originalTeacherId) ||
        teachers.find((x) => x.name === r.originalTeacherId);
      if (!t || t.type !== TeacherType.INTERNAL) continue;
      byId.set(t.id, t.name);
    }
    return [...byId.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant', { numeric: true }));
  }, [recordsInMonthBase, teachers]);

  /** 依代課人模式：與清冊「依代課人」列舉邏輯一致（當月 slots + 當月明細），供快速篩選 */
  const substituteTeacherQuickTags = useMemo(() => {
    const fromDetails = new Set<string>();
    const fromSlots = new Set<string>();
    for (const r of recordsInMonthBase) {
      if (!r.slots || r.slots.length === 0) continue;
      const detailsDeduped = deduplicateDetails(r.details || []);
      detailsDeduped.forEach(d => {
        if (d.substituteTeacherId && toYMD(d.date).startsWith(selectedMonth)) {
          fromDetails.add(d.substituteTeacherId);
        }
      });
      r.slots.forEach(s => {
        if (!s.substituteTeacherId) return;
        const ymd = toYMD(s.date);
        if (!ymd || !ymd.startsWith(selectedMonth)) return;
        if (s.isOvertime === true) return;
        fromSlots.add(s.substituteTeacherId);
      });
    }
    const ids = Array.from(new Set([...fromDetails, ...fromSlots]));
    return ids
      .map((id) => ({
        id,
        name: id === 'pending' ? '待聘' : (teachers.find((t) => t.id === id)?.name || id),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant', { numeric: true }));
  }, [recordsInMonthBase, selectedMonth, teachers]);

  // Reset selection when month changes
  useEffect(() => {
      setSelectedRecordIds(new Set());
  }, [selectedMonth]);

  // 2. Data Transformation for "View by Substitute" (Based on Filtered Records)
  const substituteGroups = useMemo(() => {
    if (viewMode !== 'bySubstituteTeacher') return [];

    type Row = {
      subTeacherId: string;
      date: string;
      originalTeacherId: string;
      note: string;
      amount: number;
      payType: PayType;
      periods?: string[];
      recordId: string;
    };

    const periodOrder = ['早', '1', '2', '3', '4', '午', '5', '6', '7'];
    const sortPeriodsLocal = (periods: string[]) =>
      [...periods].sort((a, b) => periodOrder.indexOf(String(a)) - periodOrder.indexOf(String(b)));

    // 保留原本的明細（用於匯出課表圖片/週表）
    const allDetails: (SubstituteDetail & { originalTeacherId: string; recordId: string; slots: TimetableSlot[] })[] = [];

    const allRows: Row[] = [];

    filteredRecords.forEach(r => {
      if (!r.slots || r.slots.length === 0) return;
      const detailsDeduped = deduplicateDetails(r.details || []);

      // 供週表匯出用：依明細（含 slots）保留
      detailsDeduped.forEach(d => {
        if (d.substituteTeacherId && toYMD(d.date).startsWith(selectedMonth)) {
          const matchingSlots = r.slots ? r.slots.filter(s =>
            toYMD(s.date) === toYMD(d.date) &&
            s.substituteTeacherId === d.substituteTeacherId &&
            s.payType === d.payType
          ) : [];
          allDetails.push({ ...d, originalTeacherId: r.originalTeacherId, recordId: r.id, slots: matchingSlots });
        }
      });

      // 依「代課教師 + 日期 + 支薪方式」彙整（同一請假老師的同一天不要合併到其他請假老師：因為 record 本身就是一位請假老師）
      const keyOf = (subId: string, date: string, payType: PayType) => `${r.id}__${subId}__${date}__${payType}`;
      const map = new Map<string, { subId: string; date: string; payType: PayType; periods: string[] }>();

      r.slots.forEach(s => {
        if (!s.substituteTeacherId) return;
        const ymd = toYMD(s.date);
        if (!ymd || !ymd.startsWith(selectedMonth)) return;
        if (s.isOvertime === true) return; // 超鐘點不列入一般清冊備註（避免重複）
        const payType = s.payType as PayType;
        const k = keyOf(s.substituteTeacherId, ymd, payType);
        if (!map.has(k)) map.set(k, { subId: s.substituteTeacherId, date: ymd, payType, periods: [] });
        if (payType === PayType.HOURLY) {
          map.get(k)!.periods.push(String(s.period));
        }
      });

      map.forEach(v => {
        const periodsSorted = v.payType === PayType.HOURLY ? sortPeriodsLocal(v.periods) : [];
        const periodCount = periodsSorted.length;

        // 備註文字（依你提供的格式）
        let note = '';
        if (v.payType === PayType.HOURLY) note = `0日${periodCount}節`;
        else if (v.payType === PayType.HALF_DAY) note = '半日0節';
        else note = '1日0節';

        // 金額：鐘點費用 slots 計算（避免 details 匯總不含請假老師維度造成難拆）
        // 日薪/半日薪：用該 record 的 details（同一 record 不會跨請假老師）
        let amount = 0;
        if (v.payType === PayType.HOURLY) {
          amount = periodCount * HOURLY_RATE;
        } else {
          const d = detailsDeduped.find(x =>
            toYMD(x.date) === v.date &&
            x.substituteTeacherId === v.subId &&
            x.payType === v.payType &&
            x.isOvertime !== true
          );
          amount = Number(d?.calculatedAmount) || 0;
        }

        allRows.push({
          subTeacherId: v.subId,
          recordId: r.id,
          date: v.date,
          originalTeacherId: r.originalTeacherId,
          note,
          amount,
          payType: v.payType,
          periods: periodsSorted.length ? periodsSorted : undefined,
        });
      });
    });

    const bySub: Record<string, Row[]> = {};
    allRows.forEach(r => {
      if (!bySub[r.subTeacherId]) bySub[r.subTeacherId] = [];
      bySub[r.subTeacherId].push(r);
    });

    const itemsBySub: Record<string, typeof allDetails> = {};
    allDetails.forEach(d => {
      if (!itemsBySub[d.substituteTeacherId]) itemsBySub[d.substituteTeacherId] = [];
      itemsBySub[d.substituteTeacherId].push(d);
    });

    const allSubIds = Array.from(new Set([...Object.keys(itemsBySub), ...Object.keys(bySub)])).sort();

    return allSubIds.map(subId => ({
      subTeacherId: subId,
      items: (itemsBySub[subId] || []).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
      rows: (bySub[subId] || [])
        .filter(r => r.amount !== 0 || r.note !== '0日0節')
        .sort((a, b) => a.date.localeCompare(b.date) || a.originalTeacherId.localeCompare(b.originalTeacherId))
    }));

  }, [filteredRecords, viewMode, selectedMonth]);

  const substituteCompensationMap = useMemo(() => {
    const map = new Map<string, ReturnType<typeof calculateSubstituteMonthlyBreakdown>>();
    substituteGroups.forEach((group) => {
      map.set(
        group.subTeacherId,
        calculateSubstituteMonthlyBreakdown({
          teacherId: group.subTeacherId,
          yearMonth: selectedMonth,
          records,
          teachers,
          overtimeRecords,
          fixedOvertimeConfig,
          holidays,
          settings,
          activeSemesterId,
        }),
      );
    });
    return map;
  }, [substituteGroups, selectedMonth, records, teachers, overtimeRecords, fixedOvertimeConfig, holidays, settings, activeSemesterId]);

  // Calculate Monthly Total (僅計當月明細，每筆明細只算一次；去重避免同一邏輯明細重複加總)
  const monthlyTotal = useMemo(() => {
     return filteredRecords.reduce((sum, r) => {
         const deduped = deduplicateDetails(r.details || []);
         return sum + deduped.reduce((dSum, d) => {
             return d.date && d.date.startsWith(selectedMonth) ? dSum + d.calculatedAmount : dSum;
         }, 0);
     }, 0);
  }, [filteredRecords, selectedMonth]);


  // --- Handlers ---

  const handleStatusChange = (record: LeaveRecord, newStatus: string) => {
      const updatedRecord = { ...record, processingStatus: newStatus as ProcessingStatus };
      updateRecord(updatedRecord);
  };

  /** 將憑證狀態（processingStatus）批次套用至已勾選的代課單 */
  const handleBatchApplyVoucherStatus = () => {
      if (selectedRecordIds.size === 0) {
          showModal({ title: '未選取', message: '請先勾選至少一筆代課紀錄。', type: 'warning' });
          return;
      }
      const ids = [...selectedRecordIds];
      let applied = 0;
      ids.forEach((id) => {
          const record = records.find((r) => r.id === id);
          if (record) {
              updateRecord({ ...record, processingStatus: batchVoucherStatus });
              applied += 1;
          }
      });
      showModal({
          title: '已更新',
          message: `已將 ${applied} 筆紀錄的憑證狀態設為「${batchVoucherStatus}」。`,
          type: 'success',
      });
  };

  const handleDeleteRecord = (record: LeaveRecord) => {
      const originalName = teachers.find(t => t.id === record.originalTeacherId)?.name || record.originalTeacherId;
      const dateRange = (record.startDate && record.endDate) ? `${record.startDate}～${record.endDate}` : '（無日期）';
      showModal({
          title: '確認刪除',
          message: `確定要刪除此筆代課清冊與憑證嗎？\n\n請假教師：${originalName}\n日期：${dateRange}\n\n此動作無法復原。`,
          type: 'warning',
          mode: 'confirm',
          onConfirm: () => {
              deleteRecord(record.id);
              showModal({ title: '已刪除', message: '該筆代課清冊與憑證已刪除。', type: 'success' });
          }
      });
  };

  // Selection Logic
  const handleToggleSelect = (id: string) => {
      const next = new Set(selectedRecordIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setSelectedRecordIds(next);
  };

  const handleSelectAll = () => {
      if (selectedRecordIds.size === filteredRecords.length && filteredRecords.length > 0) {
          setSelectedRecordIds(new Set());
      } else {
          const allIds = filteredRecords.map(r => r.id);
          setSelectedRecordIds(new Set(allIds));
      }
  };

  const handleOpenSettings = () => {
    setTempUrl(settings.gasWebAppUrl || '');
    setTestStatus('idle');
    setTestMessage('');
    setIsSettingsOpen(true);
  };

  const handleSaveSettings = () => {
    if (tempUrl && !tempUrl.includes('/exec')) {
        showModal({
            title: '網址格式錯誤',
            message: '警告：網址似乎不正確。\n請確保網址結尾包含 "/exec"，而不是 "/edit" 或 "/dev"。',
            type: 'warning'
        });
        return;
    }
    updateSettings({ ...settings, gasWebAppUrl: tempUrl });
    setIsSettingsOpen(false);
  };

  const handleTestConnection = async () => {
    if (!tempUrl) {
        setTestStatus('error');
        setTestMessage('請先輸入網址');
        return;
    }

    setIsTesting(true);
    setTestMessage('正在連線中...');
    setTestStatus('idle');

    try {
        const result = await callGasApi(tempUrl, 'TEST_CONNECTION');
        setTestStatus('success');
        setTestMessage(result.message || '連線成功');
    } catch (e: any) {
        setTestStatus('error');
        // Fix: Explicitly handle unknown error type safely to avoid TS error
        const errorMsg = e instanceof Error ? e.message : (typeof e === 'string' ? e : '發生未知錯誤');
        setTestMessage(String(errorMsg));
    } finally {
        setIsTesting(false);
    }
  };

  const handleEditRecord = (id: string) => {
    navigate(`/entry/${id}`);
  };

  // 固定兼課教師為「請假人」、他人代課：該筆應入「固定兼課」印領清冊（固定兼課頁匯出），
  // 不應入一般「代課」清冊／憑證。頁面列表仍完整顯示，僅匯出代課清冊時整筆排除。
  // 辨識來源：(1) 教師管理「固定兼課教師」勾選 (2) 固定兼課設定內的教師（避免只設時段未勾選時漏判）
  // 同時納入教師「姓名」：舊紀錄的 originalTeacherId 可能存姓名而非 id。
  const fixedOvertimeTeacherIdSet = useMemo(() => {
    const s = new Set<string>();
    const add = (v: string | undefined | null) => {
      const x = String(v ?? '').trim();
      if (x) s.add(x);
    };
    (teachers || []).forEach(t => {
      if (t.isFixedOvertimeTeacher) {
        add(t.id);
        add(t.name);
      }
    });
    (fixedOvertimeConfig || []).forEach(c => {
      add(c.teacherId);
      const t = (teachers || []).find(x => x.id === c.teacherId);
      add(t?.name);
    });
    return s;
  }, [teachers, fixedOvertimeConfig]);

  const shouldExcludeFromSubteachLedgerExport = (record: LeaveRecord) => {
    const oid = String(record.originalTeacherId ?? '').trim();
    if (!oid) return false;
    if (fixedOvertimeTeacherIdSet.has(oid)) return true;
    // 若紀錄存 id，但集合裡只有曾用別名：再比對教師物件
    const byId = (teachers || []).find(t => t.id === oid);
    if (byId && (byId.isFixedOvertimeTeacher || (fixedOvertimeConfig || []).some(c => c.teacherId === byId.id))) {
      return true;
    }
    return false;
  };

  const sliceRecordToSelectedMonth = (record: LeaveRecord): LeaveRecord | null => {
    const detailsDeduped = deduplicateDetails(record.details || []);
    // 匯出代課清冊/憑證時，超鐘點（isOvertime=true）明細應只出現在超鐘點清冊，
    // 不要在代課清冊再扣一次；因此匯出前移除超鐘點明細。
    const monthDetails = detailsDeduped
      .filter(d => {
      const ymd = toYMD(d.date);
      return ymd >= monthStartStr && ymd <= monthEndStr;
      })
      .filter(d => d.isOvertime !== true);
    const monthSlots = (record.slots || []).filter(s => {
      const ymd = toYMD(s.date);
      return ymd >= monthStartStr && ymd <= monthEndStr;
    });

    if (monthDetails.length === 0 && monthSlots.length === 0) return null;

    const allDates = [...monthDetails.map(d => toYMD(d.date)), ...monthSlots.map(s => toYMD(s.date))].filter(Boolean).sort();
    const startDate = allDates[0] || record.startDate;
    const endDate = allDates[allDates.length - 1] || record.endDate;

    return {
      ...record,
      startDate,
      endDate,
      details: monthDetails,
      slots: monthSlots
    };
  };

  const handleRecalculateRecord = (record: LeaveRecord) => {
      if (!salaryGrades || salaryGrades.length === 0) {
          showModal({ title: '無薪級表', message: '系統尚未載入薪級表，無法進行計算。', type: 'warning' });
          return;
      }

      showModal({
          title: '確認更新金額',
          message: '這將依據目前的「教師薪級」與「薪級級距表」重新計算此筆代課單的金額。\n(適用於補登薪級後修正金額)',
          type: 'info',
          mode: 'confirm',
          onConfirm: () => {
              try {
                  const newDetails = convertSlotsToDetails(record.slots, teachers, salaryGrades);
                  const updatedRecord = { ...record, details: newDetails };
                  updateRecord(updatedRecord);
                  showModal({ title: '更新成功', message: '金額已重新計算並儲存。', type: 'success' });
              } catch (e: any) {
                  showModal({ title: '計算失敗', message: e.message, type: 'error' });
              }
          }
      });
  };

  const performSave = async () => {
    closeModal();
    setIsSyncing(true);
    setErrorLog(null);

    try {
      console.log("Syncing to:", settings.gasWebAppUrl);
      
      const result = await callGasApi(settings.gasWebAppUrl, 'SYNC_DATA', {
          records: records, 
          teachers: teachers,
          syncTime: new Date().toISOString()
      });
      
      showModal({
          title: '同步成功',
          message: `處理了 ${result.processedCount} 筆資料。\nGoogle Sheet (清冊與憑證) 已更新。`,
          type: 'success'
      });

    } catch (error: any) {
      console.error(error);
      const errorMsg = error instanceof Error ? error.message : String(error);
      const detailedError = `[${new Date().toLocaleString()}] 同步失敗:\n${errorMsg}\n\nStack:\n${error.stack || 'No stack'}\n\n請確認:\n1. GAS 是否已部署為新版本?\n2. 權限是否為 Anyone?`;
      setErrorLog(detailedError);
      
      showModal({
          title: '同步失敗',
          message: `${errorMsg}\n\n已在頁面上方顯示詳細錯誤日誌。`,
          type: 'error'
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSyncToGas = async () => {
    if (!settings.gasWebAppUrl) {
      showModal({
        title: '未設定連線',
        message: "請先點擊設定圖示，輸入您的 Google Apps Script Web App URL。",
        type: 'warning',
        onConfirm: handleOpenSettings
      });
      return;
    }

    showModal({
        title: '確認同步',
        message: "確定要將所有紀錄同步至後端資料庫？\n此動作將更新 Google Sheet 中的「印領清冊」與「憑證」工作表。",
        type: 'info',
        mode: 'confirm',
        onConfirm: performSave
    });
  };

  const handleManualSave = () => {
      showModal({
          title: '確認強制存檔',
          message: "強制手動存檔會嘗試將目前資料覆蓋至 Google Sheet，確定嗎？",
          type: 'warning',
          mode: 'confirm',
          onConfirm: performSave
      });
  };

  // --- New Export Handlers ---

  const handleGenerateReport = async () => {
      if (!settings.gasWebAppUrl) {
          showModal({ title: '錯誤', message: "請先設定 GAS URL", type: 'error' });
          return;
      }

      setIsGeneratingReport(true);
      try {
          const recordsForExport = filteredRecords
            .filter(r => !shouldExcludeFromSubteachLedgerExport(r))
            .map(r => sliceRecordToSelectedMonth(r))
            .filter((r): r is LeaveRecord => r != null);
          const result = await callGasApi(settings.gasWebAppUrl, 'GENERATE_REPORTS', {
              records: recordsForExport,
              teachers: teachers,
              exportOptions: {
                  ledgers: Array.from(selectedLedgerTypes),
                  vouchers: Array.from(selectedVoucherTypes),
                  // GAS 以此為準，避免 teachers JSON 缺欄位或試算表教師表未同步「固定兼課」旗標
                  fixedOvertimeTeacherIds: Array.from(fixedOvertimeTeacherIdSet),
              }
          });
          
          if (result.data && result.data.urls && result.data.urls.length > 0) {
              result.data.urls.forEach((url: any) => window.open(String(url), '_blank'));
              showModal({ title: '產生成功', message: "已依勾選項目產生清冊/憑證並自動開啟。", type: 'success' });
          } else {
              showModal({ title: '產生成功', message: "已產生至指定資料夾，但未回傳網址。", type: 'success' });
          }

      } catch (e: any) {
          const msg = e instanceof Error ? e.message : String(e);
          showModal({ title: '產生失敗', message: String(msg), type: 'error' });
      } finally {
          setIsGeneratingReport(false);
      }
  };

  const handleOpenExportPicker = () => {
      if (!settings.gasWebAppUrl) {
          showModal({ title: '未設定連線', message: "請先設定 GAS Web App URL。", type: 'warning', onConfirm: handleOpenSettings });
          return;
      }
      if (filteredRecords.length === 0) {
          showModal({ title: '無資料', message: "該月份無代課紀錄 (含跨月)。", type: 'warning' });
          return;
      }
      setIsExportPickerOpen(true);
  };

  const toggleSetItem = (set: Set<string>, key: string) => {
      const next = new Set(set);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
  };

  const handleBatchGenerateDispatch = async () => {
      if (!settings.gasWebAppUrl) {
          showModal({ title: '錯誤', message: "請先設定 GAS URL", type: 'error' });
          return;
      }
      
      if (filteredRecords.length === 0) {
          showModal({ title: '無資料', message: "該月份無代課紀錄", type: 'warning' });
          return;
      }

      // 決定要匯出的資料集：若有選取則只匯出選取，否則匯出全部；明細去重避免重複
      let targetRecords = filteredRecords;
      if (selectedRecordIds.size > 0) {
          targetRecords = filteredRecords.filter(r => selectedRecordIds.has(r.id));
      }
      const targetRecordsDeduped = targetRecords.map(r => ({ ...r, details: deduplicateDetails(r.details || []) }));

      setIsGeneratingBatch(true);
      try {
          const result = await callGasApi(settings.gasWebAppUrl, 'BATCH_GENERATE_FORMS', {
              records: targetRecordsDeduped,
              teachers: teachers,
              yearMonth: selectedMonth
          });
          
          if (result.data && result.data.url) {
             window.open(String(result.data.url), '_blank');
             showModal({ title: '匯出成功', message: `已成功匯出 ${targetRecords.length} 筆代課單彙整表。`, type: 'success' });
          } else {
             showModal({ title: '匯出成功', message: "檔案已產生，但無法自動開啟。", type: 'success' });
          }
      } catch (e: any) {
          const msg = e instanceof Error ? e.message : String(e);
          showModal({ title: '匯出失敗', message: String(msg), type: 'error' });
      } finally {
          setIsGeneratingBatch(false);
      }
  };

  const handleOpenFolderForRecord = async (record: LeaveRecord) => {
      if (!settings.gasWebAppUrl) {
          showModal({ title: '錯誤', message: "請先設定 GAS URL", type: 'error' });
          return;
      }

      setOpeningFolderId(record.id);
      try {
          // 計算該筆紀錄所屬的 Year-Month
          // 注意：使用 record.startDate 來決定開啟哪個月份的資料夾
          const dateObj = new Date(record.startDate);
          const ym = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`;

          const result = await callGasApi(settings.gasWebAppUrl, 'GET_OUTPUT_FOLDER_URL', {
              yearMonth: ym
          });
          
          if (result.status === 'success' && result.data.url) {
              window.open(String(result.data.url), '_blank');
          } else {
              showModal({ title: '失敗', message: "無法取得資料夾連結", type: 'error' });
          }
      } catch (e: any) {
          const msg = e instanceof Error ? e.message : String(e);
          showModal({ title: '連線失敗', message: String(msg), type: 'error' });
      } finally {
          setOpeningFolderId(null);
      }
  };

  // --- End New Export Handlers ---

  const handleGenerateDoc = async (record: any) => {
    if (!settings.gasWebAppUrl) {
        showModal({ title: '錯誤', message: "請先設定 GAS URL", type: 'error' });
        return;
    }
    
    setGeneratingId(record.id);
    try {
        const result = await callGasApi(settings.gasWebAppUrl, 'GENERATE_FORM', {
            record: record,
            teachers: teachers
        });
        
        if (result.data && result.data.url) {
            window.open(String(result.data.url), '_blank');
        } else {
            showModal({ title: '通知', message: "產生成功，但未回傳網址。", type: 'warning' });
        }
    } catch (e: any) {
        const msg = e instanceof Error ? e.message : String(e);
        showModal({ title: '產生失敗', message: String(msg), type: 'error' });
    } finally {
        setGeneratingId(null);
    }
  };

  const handleOpenSpreadsheet = () => {
      if (!settings.gasWebAppUrl) {
          showModal({ title: '錯誤', message: "請先設定 Web App URL", type: 'error' });
          return;
      }
      
      callGasApi(settings.gasWebAppUrl, 'GET_SPREADSHEET_URL')
        .then(res => {
            if (res.data && res.data.url) {
                window.open(String(res.data.url), '_blank');
            } else {
                window.open('https://docs.google.com/spreadsheets', '_blank');
            }
        })
        .catch(() => {
            window.open('https://docs.google.com/spreadsheets', '_blank');
        });
  };

  const handleExportImage = async (teacherId: string, teacherName: string) => {
    const element = document.getElementById(`export-card-${teacherId}`);
    if (!element) return;

    try {
      // Temporarily move the element into view or ensure it's renderable
      // html2canvas can capture elements that are in the DOM but might have issues if they are display:none
      // Our template is fixed -left-[9999px] which should work.
      
      const canvas = await html2canvas(element, {
        backgroundColor: '#ffffff',
        scale: 2,
        logging: false,
        useCORS: true,
        windowWidth: 800 // Match our template width
      });
      
      const image = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = image;
      link.download = `${teacherName}_代課課表_${selectedMonth}.png`;
      link.click();
    } catch (error) {
      console.error('Export image error:', error);
      showModal({ title: '匯出失敗', message: '無法產生圖片，請稍後再試。', type: 'error' });
    }
  };

  return (
    <div className="p-4 sm:p-6 md:p-8 h-full flex flex-col" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom, 0px))' }}>
      <Modal 
        isOpen={modal.isOpen} 
        onClose={closeModal} 
        onConfirm={modal.onConfirm}
        title={modal.title}
        message={modal.message} 
        type={modal.type}
        mode={modal.mode}
      />

      <Modal
        isOpen={isExportPickerOpen}
        onClose={() => setIsExportPickerOpen(false)}
        onConfirm={async () => {
            // basic guard
            if (selectedLedgerTypes.size === 0 && selectedVoucherTypes.size === 0) {
                showModal({ title: '未選擇任何項目', message: '請至少勾選 1 種清冊或憑證再匯出。', type: 'warning' });
                return;
            }
            setIsExportPickerOpen(false);
            await handleGenerateReport();
        }}
        title="選擇匯出項目"
        type="info"
        mode="confirm"
        confirmText="開始匯出"
        cancelText="取消"
        maxWidth="max-w-2xl"
      >
        <div className="space-y-4">
          <div className="text-sm text-slate-600">
            你可以分別選擇要匯出的「清冊」與「憑證」。未勾選的類型不會產生對應工作表。
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border border-slate-200 rounded-xl p-4 bg-white">
              <div className="flex items-center justify-between mb-3">
                <div className="font-bold text-slate-800">清冊（工作表）</div>
                <div className="flex gap-2">
                  <button
                    className="text-xs px-2 py-1 rounded border border-slate-200 hover:bg-slate-50"
                    onClick={() => setSelectedLedgerTypes(new Set(EXPORT_TYPE_OPTIONS.map(o => o.key)))}
                    type="button"
                  >
                    全選
                  </button>
                  <button
                    className="text-xs px-2 py-1 rounded border border-slate-200 hover:bg-slate-50"
                    onClick={() => setSelectedLedgerTypes(new Set())}
                    type="button"
                  >
                    全不選
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                {EXPORT_TYPE_OPTIONS.map(opt => {
                  const checked = selectedLedgerTypes.has(opt.key);
                  return (
                    <label key={`ledger-${opt.key}`} className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 cursor-pointer">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => setSelectedLedgerTypes(prev => toggleSetItem(prev, opt.key))}
                        />
                        <span className="text-sm font-medium text-slate-700">{opt.label}</span>
                      </div>
                      <span className="text-xs text-slate-400">{opt.key}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="border border-slate-200 rounded-xl p-4 bg-white">
              <div className="flex items-center justify-between mb-3">
                <div className="font-bold text-slate-800">憑證（工作表）</div>
                <div className="flex gap-2">
                  <button
                    className="text-xs px-2 py-1 rounded border border-slate-200 hover:bg-slate-50"
                    onClick={() => setSelectedVoucherTypes(new Set(EXPORT_TYPE_OPTIONS.map(o => o.key)))}
                    type="button"
                  >
                    全選
                  </button>
                  <button
                    className="text-xs px-2 py-1 rounded border border-slate-200 hover:bg-slate-50"
                    onClick={() => setSelectedVoucherTypes(new Set())}
                    type="button"
                  >
                    全不選
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                {EXPORT_TYPE_OPTIONS.map(opt => {
                  const checked = selectedVoucherTypes.has(opt.key);
                  return (
                    <label key={`voucher-${opt.key}`} className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 cursor-pointer">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => setSelectedVoucherTypes(prev => toggleSetItem(prev, opt.key))}
                        />
                        <span className="text-sm font-medium text-slate-700">{opt.label}</span>
                      </div>
                      <span className="text-xs text-slate-400">{opt.label}_憑證</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-3">
            小提醒：若你只勾選「憑證」不勾選「清冊」，系統仍會以當月資料計算合計金額並產生憑證工作表。
          </div>
        </div>
      </Modal>

      {/* Header Area */}
      <header className="mb-4 md:mb-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 md:gap-4">
            <div className="min-w-0">
                <h1 className="text-xl md:text-3xl font-bold text-slate-800 truncate">代課清冊與憑證</h1>
                <p className="text-slate-500 mt-1 md:mt-2 text-sm md:text-base hidden sm:block">查看並匯出每月代課紀錄、清冊與相關憑證</p>
            </div>
            
            <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                <Link
                    to="/teacher-portal"
                    className="min-h-[44px] flex-1 sm:flex-none px-4 py-2.5 bg-violet-50 text-violet-800 border border-violet-200 rounded-lg hover:bg-violet-100 flex items-center justify-center space-x-2 text-sm font-medium transition-colors"
                    title="依假別檢視教師請假與代課金額（須 Google 登入且於白名單內）"
                >
                    <UserSearch size={18} />
                    <span>教師請假／代課查詢</span>
                </Link>
                <a
                    href={CHC_SALARY_TABLE_114_PDF}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[44px] flex-1 sm:flex-none px-4 py-2.5 bg-indigo-50 text-indigo-800 border border-indigo-200 rounded-lg hover:bg-indigo-100 flex items-center justify-center space-x-2 text-sm font-medium transition-colors"
                    title="彰化縣 114 學年度學校公教待遇一覽表（PDF）"
                >
                    <FileText size={18} />
                    <span>114教師薪水表</span>
                </a>
                <button 
                    onClick={handleOpenSpreadsheet}
                    className="min-h-[44px] flex-1 sm:flex-none px-4 py-2.5 bg-green-50 text-green-700 border border-green-200 rounded-lg hover:bg-green-100 flex items-center justify-center space-x-2 text-sm font-medium transition-colors"
                    title="開啟 Google Sheet 以列印清冊或憑證"
                >
                    <ExternalLink size={18} />
                    <span>開啟 Sheet</span>
                </button>
                <button 
                    onClick={handleOpenSettings}
                    className={`min-h-[44px] min-w-[44px] p-2.5 border rounded-lg transition-colors relative flex items-center justify-center ${!settings.gasWebAppUrl ? 'border-amber-400 bg-amber-50 text-amber-600 animate-pulse' : 'border-slate-300 text-slate-600 hover:bg-slate-50 hover:text-indigo-600'}`}
                    title="設定 GAS 連線"
                >
                    <Settings size={20} />
                    {!settings.gasWebAppUrl && (
                        <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-amber-500 rounded-full border border-white"></span>
                    )}
                </button>
            </div>
        </div>
      </header>

      <SubstituteSalaryReferencePanel salaryGrades={salaryGrades} />

      <InstructionPanel title="使用說明：代課清冊與憑證" shortTitle="使用說明">
        <div className="space-y-1">
          <CollapsibleItem title="檢視模式切換">
            <p>可切換「依請假人」或「依代課人」檢視。依請假人適合核對假單；依代課人適合核對薪資與發放清冊。</p>
            <p>在「依代課人」模式中，摘要金額會整合顯示代課、超鐘點、固定兼課，並附導師費估算拆分；可搭配右上角圖片按鈕匯出。</p>
            <p>工具列下方會依檢視模式顯示該月姓名標籤：依請假人時為<strong>校內請假教師</strong>，依代課人時為<strong>當月有代課之代課教師</strong>（與清冊列舉邏輯一致）；可一鍵帶入搜尋，再點同一標籤或「清除搜尋」可還原。標籤名單會隨月份與假別篩選更新。</p>
          </CollapsibleItem>
          <CollapsibleItem title="假別篩選">
            <p>工具列可選「假別」僅顯示該類請假之代課紀錄，與代課單編輯頁之假別選項相同；選「全部」則不篩假別。</p>
          </CollapsibleItem>
          <CollapsibleItem title="假日與異常警示">
            <p>若請假日期包含週末或系統設定之假日，系統會以紅色文字警示。請務必確認是否為誤登，或該日是否有實際代課需求。</p>
          </CollapsibleItem>
          <CollapsibleItem title="報表匯出功能">
            <p><strong>匯出清冊/憑證：</strong>產生當月的印領清冊與黏貼憑證 (Google Doc/Sheet)，用於核銷。</p>
            <p><strong>匯出彙整表：</strong>產生代課單彙整表 (Excel/Sheet)，方便進行大數據分析或存檔。</p>
          </CollapsibleItem>
          <CollapsibleItem title="備註與憑證狀態">
            <p><strong>備註：</strong>每筆紀錄有「備註」欄，點擊即可填寫或修改（例：已列印 3/8、未印、跑章中），方便辨識該筆是否已列印紙本代課單。</p>
            <p><strong>憑證狀態：</strong>列印紙本後請改為「已印代課單」，可搭配備註記錄列印日期。</p>
            <p><strong>多選批次：</strong>在「依請假人」檢視勾選左側方框後，可用上方「批次變更憑證狀態」一次套用至多筆紀錄。</p>
          </CollapsibleItem>
          <CollapsibleItem title="重新計算金額">
            <p>若代課教師的薪級有變動 (例如補登證書或薪級)，可點擊列表右側的「計算機圖示」按鈕，系統將依據最新薪級重新計算該筆紀錄的代課費。</p>
          </CollapsibleItem>
          <CollapsibleItem title="雲端同步與儲存">
            <p>所有資料皆即時儲存於 Firebase 雲端資料庫。若需將資料匯出至 Google Sheets 進行二次編輯，請使用「同步至 Google Sheets」功能。</p>
          </CollapsibleItem>
        </div>
      </InstructionPanel>

      {/* Toolbar & Filter：橫向緊湊排版 */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6 flex flex-col xl:flex-row justify-between items-center gap-4">
          <div className="flex bg-slate-100 rounded-lg p-1 w-full xl:w-auto justify-center">
                <button 
                    onClick={() => setViewMode('byLeaveTeacher')}
                    className={`flex-1 xl:flex-none px-3 py-1.5 text-sm font-medium rounded-md transition-all flex items-center justify-center ${viewMode === 'byLeaveTeacher' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    <Filter size={16} className="mr-1"/> 依請假人
                </button>
                <button 
                    onClick={() => setViewMode('bySubstituteTeacher')}
                    className={`flex-1 xl:flex-none px-3 py-1.5 text-sm font-medium rounded-md transition-all flex items-center justify-center ${viewMode === 'bySubstituteTeacher' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    <RefreshCw size={16} className="mr-1"/> 依代課人
                </button>
           </div>

           <div className="flex flex-col sm:flex-row gap-2 w-full xl:w-auto xl:min-w-0 xl:flex-1 xl:max-w-xl">
             <label className="flex items-center gap-2 shrink-0">
               <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">假別</span>
               <select
                 className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 min-w-[10rem] max-w-full"
                 value={leaveTypeFilter}
                 onChange={(e) => setLeaveTypeFilter(e.target.value === 'all' ? 'all' : (e.target.value as LeaveType))}
               >
                 <option value="all">全部</option>
                 {Object.values(LeaveType).map((t) => (
                   <option key={t} value={t}>{t}</option>
                 ))}
               </select>
             </label>
             <div className="relative flex-1 min-w-0">
               <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search size={18} className="text-slate-400" />
               </div>
               <input
                  type="text"
                  placeholder="搜尋教師、事由、文號…（可點下方標籤快速篩選）"
                  className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  value={searchInput}
                  onChange={(e) => {
                    const v = e.target.value;
                    setSearchInput(v);
                    if (!searchComposingRef.current) {
                      setSearchTerm(v);
                    }
                  }}
                  onCompositionStart={() => {
                    searchComposingRef.current = true;
                  }}
                  onCompositionEnd={(e) => {
                    searchComposingRef.current = false;
                    const v = e.currentTarget.value;
                    setSearchInput(v);
                    setSearchTerm(v);
                  }}
                  autoComplete="off"
               />
             </div>
           </div>

           <div className="flex flex-wrap items-center gap-3 justify-center w-full xl:w-auto">
                <button 
                    onClick={handleBatchGenerateDispatch}
                    disabled={isGeneratingBatch || filteredRecords.length === 0}
                    className="px-3 py-2 bg-white border border-slate-300 text-slate-600 hover:text-indigo-600 hover:border-indigo-300 rounded-lg text-sm flex items-center shadow-sm transition-colors whitespace-nowrap"
                    title={selectedRecordIds.size > 0 ? "匯出選取的代課單" : "匯出本月全部代課單"}
                >
                     {isGeneratingBatch ? <Loader2 size={16} className="animate-spin mr-2"/> : <FileOutput size={16} className="mr-2"/>}
                     <span className="font-bold">{selectedRecordIds.size > 0 ? `匯出選取 (${selectedRecordIds.size})` : '匯出全部'}</span>
                </button>
                <button 
                    onClick={handleOpenExportPicker}
                    disabled={isGeneratingReport}
                    className="px-3 py-2 bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 rounded-lg text-sm flex items-center shadow-sm font-medium whitespace-nowrap"
                    title="匯出本月印領清冊與憑證至 Google Drive"
                >
                     {isGeneratingReport ? <Loader2 size={16} className="animate-spin mr-2"/> : <Printer size={16} className="mr-2"/>}
                     匯出清冊/憑證
                </button>
                <div className="hidden xl:block h-6 w-px bg-slate-300 mx-1"></div>
                <div className="flex items-center space-x-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 whitespace-nowrap">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">本月總計</span>
                    <span className="text-lg font-bold text-slate-700">${monthlyTotal.toLocaleString()}</span>
                </div>
                <div className="flex items-center bg-white border border-slate-300 rounded-lg shadow-sm">
                    <button 
                        onClick={() => handleMonthChange('prev')}
                        className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-slate-50 border-r border-slate-200"
                        title="上個月"
                    >
                        <ChevronLeft size={16} />
                    </button>
                    <div className="px-4 py-2 flex items-center font-bold text-slate-700 min-w-[100px] justify-center whitespace-nowrap">
                        <CalendarIcon size={16} className="text-slate-400 mr-2" />
                        {selectedMonth}
                    </div>
                    <button 
                        onClick={() => handleMonthChange('next')}
                        className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-slate-50 border-l border-slate-200"
                        title="下個月"
                    >
                        <ChevronRight size={16} />
                    </button>
                </div>
           </div>
      </div>

      {/* 該月姓名快速篩選（依檢視模式切換標籤來源） */}
      {(() => {
        const tags = viewMode === 'byLeaveTeacher' ? leaveTeacherQuickTags : substituteTeacherQuickTags;
        if (tags.length === 0) return null;
        const q = searchTerm.trim().toLowerCase();
        const applyTag = (name: string) => {
          const n = name.trim();
          if (q === n.toLowerCase()) {
            setSearchInput('');
            setSearchTerm('');
          } else {
            setSearchInput(n);
            setSearchTerm(n);
          }
        };
        return (
          <div className="mb-4 flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-slate-600">
                {viewMode === 'byLeaveTeacher' ? '本月請假（校內）' : '本月代課教師'}
              </span>
              <span className="text-xs text-slate-400">點姓名篩選；再點一次取消</span>
              {searchTerm.trim() ? (
                <button
                  type="button"
                  className="text-xs font-medium text-indigo-600 hover:text-indigo-800 underline decoration-indigo-300"
                  onClick={() => {
                    setSearchInput('');
                    setSearchTerm('');
                  }}
                >
                  清除搜尋
                </button>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {tags.map((row) => {
                const active = q === row.name.trim().toLowerCase();
                return (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => applyTag(row.name)}
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                      active
                        ? 'border-indigo-500 bg-indigo-600 text-white shadow-sm'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-300 hover:bg-indigo-50'
                    }`}
                  >
                    {row.name}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* 多選：批次變更憑證狀態（依請假人 + 有勾選時顯示） */}
      {viewMode === 'byLeaveTeacher' && selectedRecordIds.size > 0 && (
        <div className="mb-6 flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3 bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-bold text-indigo-900">
            <CheckSquare size={18} className="text-indigo-600 shrink-0" />
            <span>已選 {selectedRecordIds.size} 筆</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 flex-1">
            <label className="text-xs font-semibold text-indigo-800 whitespace-nowrap">憑證狀態改為</label>
            <select
              className="min-h-[40px] px-3 py-2 rounded-lg border border-indigo-200 bg-white text-sm font-medium text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              value={batchVoucherStatus}
              onChange={(e) => setBatchVoucherStatus(e.target.value as ProcessingStatus)}
            >
              {PROCESSING_STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleBatchApplyVoucherStatus}
              className="min-h-[40px] px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 shadow-sm"
            >
              套用至已選
            </button>
            <button
              type="button"
              onClick={() => setSelectedRecordIds(new Set())}
              className="min-h-[40px] px-3 py-2 rounded-lg border border-indigo-200 bg-white text-sm text-indigo-700 hover:bg-white/80"
            >
              清除選取
            </button>
          </div>
        </div>
      )}
      
      {/* Error Log Section */}
      {errorLog && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4 animate-fade-in">
            <div className="flex items-center text-red-800 font-bold mb-2">
                <AlertTriangle size={20} className="mr-2"/>
                同步錯誤報告
                <button onClick={() => setErrorLog(null)} className="ml-auto text-sm text-red-500 hover:text-red-700 underline">關閉</button>
            </div>
            <pre className="text-xs text-red-700 whitespace-pre-wrap font-mono overflow-auto max-h-40 bg-white/50 p-2 rounded border border-red-100">
                {errorLog}
            </pre>
            <div className="mt-2 text-xs text-red-600">
                * 如果遇到 "ScriptError" 或 "HTML" 錯誤，通常表示 Google Apps Script 端發生例外狀況，請檢查 GAS 專案的執行項目 (Executions) 以獲取詳細資訊。
            </div>
        </div>
      )}

      {/* Main Table Content：表頭不換行、可橫向捲動 */}
      <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
        <div className="overflow-x-auto -mx-px">
          {viewMode === 'byLeaveTeacher' ? (
              <table className="w-full text-left min-w-[720px]">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-4 w-12 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center cursor-pointer text-indigo-600 min-h-[44px]" onClick={handleSelectAll}>
                            {filteredRecords.length > 0 && selectedRecordIds.size === filteredRecords.length ? (
                                <CheckSquare size={20} />
                            ) : selectedRecordIds.size > 0 ? (
                                <MinusSquare size={20} />
                            ) : (
                                <Square size={20} className="text-slate-300 hover:text-indigo-400" />
                            )}
                        </div>
                    </th>
                    <th className="px-6 py-4 font-semibold text-slate-700 whitespace-nowrap">建立日期</th>
                    <th className="px-6 py-4 font-semibold text-slate-700 whitespace-nowrap">請假教師</th>
                    <th className="px-6 py-4 font-semibold text-slate-700 whitespace-nowrap">假別/事由</th>
                    <th className="px-6 py-4 font-semibold text-slate-700 whitespace-nowrap">期間</th>
                    <th className="px-6 py-4 font-semibold text-slate-700 whitespace-nowrap">代課明細 ({selectedMonth})</th>
                    <th className="px-6 py-4 font-semibold text-slate-700 text-right whitespace-nowrap">當月總金額</th>
                    <th className="px-4 py-4 font-semibold text-slate-700 text-center w-32 whitespace-nowrap">憑證狀態</th>
                    <th className="px-4 py-4 font-semibold text-slate-700 text-center w-28 whitespace-nowrap">備註</th>
                    <th className="px-6 py-4 font-semibold text-slate-700 text-right whitespace-nowrap">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredRecords.length === 0 ? (
                    <tr>
                       <td colSpan={10} className="text-center py-16 text-slate-400 flex flex-col items-center justify-center w-full">
                           <div className="bg-slate-50 p-4 rounded-full mb-3">
                               <CalendarIcon size={32} className="text-slate-300" />
                           </div>
                           <span>{selectedMonth} 月份沒有代課紀錄 (含跨月)</span>
                           <p className="mt-2 text-sm text-slate-400 max-w-md">若待聘清單有資料但這裡沒有，請用上方 ◀ ▶ 切換到請假日期所在的月份（例如 4/2 請選 4 月）</p>
                       </td>
                    </tr>
                  ) : (
                    filteredRecords.map(record => {
                      const originalTeacher = teachers.find(t => t.id === record.originalTeacherId);
                      
                      // 只計算與顯示當月相關的細項；去重避免重複明細（含非超鐘點造成的重複）
                      const dedupedDetails = deduplicateDetails(record.details || []);
                      const currentMonthDetails = dedupedDetails.filter(d => d.date && d.date.startsWith(selectedMonth));
                      const monthTotalAmount = currentMonthDetails.reduce((sum, d) => sum + d.calculatedAmount, 0);
                      
                      const isGenerating = generatingId === record.id;
                      const isSelected = selectedRecordIds.has(record.id);
                      
                      // Check for holidays and weekends in details
                      const isWeekend = (dateStr: string) => { const d = new Date(dateStr); return d.getDay() === 0 || d.getDay() === 6; };
                      const holidayConflicts = (record.details || []).filter(d => holidays && holidays.includes(d.date)).map(d => d.date);
                      const weekendConflicts = (record.details || []).filter(d => isWeekend(d.date)).map(d => d.date);
                      const allConflicts = Array.from(new Set([...holidayConflicts, ...weekendConflicts])).sort();

                      // Loading state for opening folder
                      const isOpeningThis = openingFolderId === record.id;

                      const status = record.processingStatus || '待處理';

                      // Calculate Display Dates (Clamped to selected month)
                      const startStr = record.startDate || (record.slots?.length ? record.slots.map(s => s.date).sort()[0] : monthStartStr) || monthStartStr;
                      const endStr = record.endDate || (record.slots?.length ? record.slots.map(s => s.date).sort().pop() : monthEndStr) || monthEndStr;
                      const displayStart = startStr < monthStartStr ? monthStartStr : startStr;
                      const displayEnd = endStr > monthEndStr ? monthEndStr : endStr;

                      return (
                        <tr key={record.id} className={`hover:bg-slate-50 transition-colors ${isSelected ? 'bg-indigo-50/50' : ''}`}>
                          <td className="px-4 py-4 text-center">
                              <div 
                                className={`flex items-center justify-center cursor-pointer ${isSelected ? 'text-indigo-600' : 'text-slate-300 hover:text-indigo-400'}`}
                                onClick={() => handleToggleSelect(record.id)}
                              >
                                  {isSelected ? <CheckSquare size={20} /> : <Square size={20} />}
                              </div>
                          </td>
                          <td className="px-6 py-4 text-slate-500 text-sm">
                            {record.applicationDate ? formatDateSimple(record.applicationDate) : new Date(record.createdAt).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-4 font-medium text-slate-800">
                            <div>{originalTeacher?.name || record.originalTeacherId || '未知'}</div>
                            {originalTeacher?.phone && (
                                <div className="text-xs text-slate-400 flex items-center mt-1">
                                    <Phone size={10} className="mr-1" />
                                    {originalTeacher.phone}
                                </div>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <span className={`block text-xs mb-1 ${record.leaveType.includes('公付') ? 'text-blue-600' : 'text-orange-600'}`}>
                              {record.leaveType.split(' ')[0]}
                            </span>
                            <span className="text-sm text-slate-600">{record.reason || '-'}</span>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600 font-mono">
                            {formatDateSimple(displayStart)} - {formatDateSimple(displayEnd)}
                            {allConflicts.length > 0 && (
                                <div className="text-red-500 text-xs mt-1 flex items-center">
                                    <AlertTriangle size={12} className="mr-1" />
                                    包含假日/週末: {allConflicts.length} 天
                                </div>
                            )}
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600">
                            {currentMonthDetails.length > 0 ? (
                                <div className="space-y-1">
                                {currentMonthDetails
                                    .sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                                    .map((d, idx) => {
                                    const sub = teachers.find(t => t.id === d.substituteTeacherId);
                                    const isOvertime = d.isOvertime;
                                    return (
                                    <div key={d.id} className="flex items-center space-x-2 text-xs border-b border-slate-200 last:border-0 pb-1">
                                        <span className="text-slate-500 font-mono min-w-[60px]">{formatDateSimple(d.date)}</span>
                                        <div className="min-w-[80px]">
                                            <span className="font-medium text-indigo-600 block">{sub?.name || '待聘'}</span>
                                            {sub?.phone && (
                                                <span className="text-slate-400 flex items-center scale-90 origin-left">
                                                    <Phone size={8} className="mr-1" />
                                                    {sub.phone}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex-1 flex items-center justify-between">
                                            <span className="text-slate-600 flex items-center">
                                                {d.payType === PayType.HOURLY ? 
                                                    `${d.periodCount}節 (${d.selectedPeriods?.join(',') || ''})` : 
                                                    d.payType === PayType.HALF_DAY ? '半日' : `${d.periodCount}天`
                                                }
                                                {isOvertime && <span className="ml-1 text-[10px] bg-purple-100 text-purple-700 px-1 rounded font-bold">超鐘</span>}
                                            </span>
                                            <div className="flex items-center space-x-1">
                                                <span className={`font-medium ${isOvertime ? 'text-slate-400 line-through' : 'text-slate-700'}`}>${d.calculatedAmount.toLocaleString()}</span>
                                                {d.payType === PayType.DAILY && sub && (() => {
                                                    const daysInMonth = getDaysInMonth(d.date);
                                                    const expectedRate = getExpectedDailyRate(sub, daysInMonth, true); // Assume homeroom for daily
                                                    if (expectedRate !== null && Math.abs(d.calculatedAmount - expectedRate) > 30) {
                                                        return (
                                                            <div className="group relative flex items-center">
                                                                <AlertTriangle size={14} className="text-amber-500 cursor-help" />
                                                                <div className="absolute bottom-full right-0 mb-1 hidden group-hover:block w-48 p-2 bg-slate-800 text-white text-xs rounded shadow-lg z-10">
                                                                    系統試算日薪為 ${d.calculatedAmount}，但根據薪級表標準應為 ${expectedRate} (差距大於30元)。請確認教師薪級或手動調整金額。
                                                                </div>
                                                            </div>
                                                        );
                                                    }
                                                    return null;
                                                })()}
                                            </div>
                                        </div>
                                    </div>
                                    );
                                })}
                                </div>
                            ) : (
                                <span className="text-xs text-slate-400 italic">本月無明細 (跨月紀錄)</span>
                            )}
                            
                            {/* Holiday Warning Indicator */}
                            {allConflicts.length > 0 && (
                                <div className="mt-2 bg-red-50 border border-red-100 text-red-600 text-xs px-2 py-1 rounded inline-flex items-start">
                                    <AlertTriangle size={12} className="mr-1 mt-0.5 shrink-0"/>
                                    <div>
                                        包含假日/週末: {allConflicts.map((d: string) => formatDateSimple(d)).join(', ')}
                                    </div>
                                </div>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right font-bold text-slate-700">
                            ${monthTotalAmount.toLocaleString()}
                          </td>
                          
                          {/* Status Column */}
                          <td className="px-4 py-4 text-center">
                              <select 
                                className={`text-xs font-bold px-2 py-1 rounded-full border appearance-none text-center cursor-pointer outline-none shadow-sm w-24 ${getStatusColor(record.processingStatus)}`}
                                value={status}
                                onChange={(e) => handleStatusChange(record, e.target.value)}
                                title="憑證／行政處理狀態"
                              >
                                  {PROCESSING_STATUS_OPTIONS.map((s) => (
                                    <option key={s} value={s}>{s}</option>
                                  ))}
                              </select>
                              {status === '待處理' && (
                                <p className="text-[10px] text-amber-600 mt-1 whitespace-nowrap" title="列印紙本後請改為「已印代課單」並可填備註">列印後請改狀態</p>
                              )}
                          </td>

                          {/* 備註：點擊可編輯，方便記錄是否已列印紙本 */}
                          <td className="px-2 py-4 text-center max-w-[140px]">
                            <button
                              type="button"
                              onClick={() => {
                                const value = window.prompt('備註（例：已列印 3/8、未印、跑章中）', record.adminNote || '');
                                if (value !== null) updateRecord({ ...record, adminNote: value.trim() || undefined });
                              }}
                              className="w-full text-left px-2 py-1 rounded border border-dashed border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50 text-xs text-slate-600 min-h-[32px] flex items-center justify-center gap-1"
                              title="點擊填寫或修改備註"
                            >
                              {record.adminNote ? (
                                <span className="truncate block w-full">{record.adminNote}</span>
                              ) : (
                                <span className="text-slate-400 flex items-center gap-1"><MessageSquare size={12} />填備註</span>
                              )}
                            </button>
                          </td>

                          <td className="px-6 py-4 text-right">
                             <div className="flex justify-end space-x-2">
                               <button 
                                onClick={() => handleOpenFolderForRecord(record)} 
                                disabled={isOpeningThis}
                                className={`p-2 rounded-lg transition-colors ${isOpeningThis ? 'text-slate-400 bg-slate-100' : 'text-blue-600 hover:bg-blue-50'}`}
                                title="開啟此案件的雲端附件資料夾 (依據日期)"
                               >
                                 {isOpeningThis ? <Loader2 size={18} className="animate-spin" /> : <FolderOpen size={18} />}
                               </button>
                               <button 
                                onClick={() => handleGenerateDoc(record)} 
                                disabled={isGenerating}
                                className={`p-2 rounded-lg transition-colors ${isGenerating ? 'text-slate-400 bg-slate-100' : 'text-green-600 hover:bg-green-50'}`}
                                title="產生代課單檔案"
                               >
                                 {isGenerating ? <Loader2 size={18} className="animate-spin" /> : <FileText size={18} />}
                               </button>
                               <button onClick={() => handleRecalculateRecord(record)} className="text-orange-500 hover:text-orange-700 p-2" title="重新計算金額 (更新薪級後使用)">
                                 <Calculator size={18} />
                               </button>
                               <button onClick={() => handleEditRecord(record.id)} className="text-indigo-500 hover:text-indigo-700 p-2" title="編輯">
                                 <Edit2 size={18} />
                               </button>
                               <button onClick={() => handleDeleteRecord(record)} className="text-red-400 hover:text-red-600 p-2" title="刪除">
                                 <Trash2 size={18} />
                               </button>
                             </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
          ) : (
            <table className="w-full text-left min-w-[400px]">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-4 font-semibold text-slate-700 whitespace-nowrap">代課教師</th>
                    <th className="px-6 py-4 font-semibold text-slate-700 whitespace-nowrap">代課詳情 ({selectedMonth})</th>
                    <th className="px-6 py-4 font-semibold text-slate-700 text-right whitespace-nowrap">本月收入整合（代課+超鐘+固定兼課）</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                    {substituteGroups.length === 0 ? (
                        <tr>
                            <td colSpan={3} className="text-center py-16 text-slate-400 flex flex-col items-center justify-center w-full">
                                <div className="bg-slate-50 p-4 rounded-full mb-3">
                                    <RefreshCw size={32} className="text-slate-300" />
                                </div>
                                <span>{selectedMonth} 月份沒有代課分配資料</span>
                            </td>
                        </tr>
                    ) : (
                        substituteGroups.map(group => {
                            const subTeacher = teachers.find(t => t.id === group.subTeacherId);
                            const pay = substituteCompensationMap.get(group.subTeacherId);
                            const substituteIncome = (group.rows || []).reduce((sum: number, r: any) => sum + (Number(r.amount) || 0), 0);
                            const totalIncome = pay?.grandTotal ?? substituteIncome;
                            
                            return (
                                <tr key={group.subTeacherId} className="hover:bg-slate-50">
                                    <td className="px-6 py-4 align-top">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <div className="font-bold text-lg text-slate-800">{subTeacher?.name || '未知/待聘'}</div>
                                                <div className="text-xs text-slate-500 mt-1">{subTeacher?.type}</div>
                                                {pay && (
                                                  <div className="mt-2 grid grid-cols-2 gap-1 text-[11px] text-slate-600">
                                                    <div className="bg-slate-50 border border-slate-200 rounded px-1.5 py-1">代課 ${pay.substituteTotal.toLocaleString()}</div>
                                                    <div className="bg-slate-50 border border-slate-200 rounded px-1.5 py-1">超鐘 ${pay.overtimeTotal.toLocaleString()}</div>
                                                    <div className="bg-slate-50 border border-slate-200 rounded px-1.5 py-1">固定兼課 ${pay.fixedOvertimeTotal.toLocaleString()}</div>
                                                    <div className="bg-slate-50 border border-slate-200 rounded px-1.5 py-1">導師費(估) ${pay.homeroomFeeEstimate.toLocaleString()}</div>
                                                  </div>
                                                )}
                                                {subTeacher?.phone && (
                                                    <div className="text-xs text-slate-400 flex items-center mt-1">
                                                        <Phone size={12} className="mr-1" />
                                                        {subTeacher.phone}
                                                    </div>
                                                )}
                                            </div>
                                            <button 
                                                onClick={() => handleExportImage(group.subTeacherId, subTeacher?.name || 'teacher')}
                                                className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                                title="匯出課表圖片"
                                            >
                                                <ImageIcon size={20} />
                                            </button>
                                        </div>

                                        {/* Export Template (Hidden from view, used by html2canvas) */}
                                        <div 
                                            id={`export-card-${group.subTeacherId}`} 
                                            className="fixed -left-[9999px] top-0 bg-white p-10 w-[800px] border border-slate-200 rounded-xl"
                                            style={{ fontFamily: "'Noto Sans TC', sans-serif" }}
                                        >
                                            <div className="mb-8 border-b-2 border-indigo-500 pb-4 flex justify-between items-end">
                                                <div>
                                                    <h2 className="text-3xl font-bold text-slate-800">{subTeacher?.name} 代課課表</h2>
                                                    <p className="text-slate-500 font-medium mt-1">{selectedMonth} 月份代課彙整</p>
                                                    {pay && (
                                                      <p className="text-sm text-slate-600 mt-2">
                                                        代課 ${pay.substituteTotal.toLocaleString()} + 超鐘 ${pay.overtimeTotal.toLocaleString()} + 固定兼課 ${pay.fixedOvertimeTotal.toLocaleString()} = 合計 ${pay.grandTotal.toLocaleString()}
                                                      </p>
                                                    )}
                                                </div>
                                                <div className="text-right">
                                                    {subTeacher?.phone && <p className="text-slate-600 font-bold text-lg mb-1">📞 {subTeacher.phone}</p>}
                                                    <p className="text-xs text-slate-400">系統產出日期: {new Date().toLocaleDateString()}</p>
                                                </div>
                                            </div>

                                            {/* Group items by week */}
                                            {(() => {
                                                const weeks: Record<string, typeof group.items> = {};
                                                group.items.forEach(item => {
                                                    const m = getMonday(item.date);
                                                    if (!weeks[m]) weeks[m] = [];
                                                    weeks[m].push(item);
                                                });
                                                const sortedWeeks = Object.entries(weeks).sort((a, b) => a[0].localeCompare(b[0]));

                                                return sortedWeeks.map(([monday, weekItems], weekIdx) => (
                                                    <div key={monday} className="mb-12 last:mb-0">
                                                        <div className="flex items-center mb-4">
                                                            <div className="bg-indigo-600 text-white px-3 py-1 rounded-md font-bold text-sm mr-3">第 {weekIdx + 1} 週</div>
                                                            <div className="text-slate-700 font-bold text-lg">
                                                                期間：{monday} ~ {(() => {
                                                                    const d = new Date(monday);
                                                                    d.setDate(d.getDate() + 4);
                                                                    return d.toISOString().split('T')[0];
                                                                })()}
                                                            </div>
                                                        </div>

                                                        <div className="grid grid-cols-6 border-2 border-slate-800 rounded-lg overflow-hidden shadow-sm">
                                                            {/* Header */}
                                                            <div className="border border-slate-800 bg-slate-100 p-2 text-center font-bold text-slate-700">節次</div>
                                                            <div className="border border-slate-800 bg-slate-100 p-2 text-center font-bold text-slate-700">週一</div>
                                                            <div className="border border-slate-800 bg-slate-100 p-2 text-center font-bold text-slate-700">週二</div>
                                                            <div className="border border-slate-800 bg-slate-100 p-2 text-center font-bold text-slate-700">週三</div>
                                                            <div className="border border-slate-800 bg-slate-100 p-2 text-center font-bold text-slate-700">週四</div>
                                                            <div className="border border-slate-800 bg-slate-100 p-2 text-center font-bold text-slate-700">週五</div>

                                                            {/* Rows */}
                                                            {PERIOD_ROWS.map(period => (
                                                                <React.Fragment key={period.id}>
                                                                    <div className="border border-slate-800 bg-slate-50 p-2 text-center font-bold flex items-center justify-center text-slate-600">
                                                                        {period.label}
                                                                    </div>
                                                                    {[1, 2, 3, 4, 5].map(day => {
                                                                        const matches = weekItems.flatMap(item => {
                                                                            if (item.slots && item.slots.length > 0) {
                                                                                return item.slots.filter(s => {
                                                                                    const d = new Date(s.date).getDay();
                                                                                    return d === day && s.period === period.id;
                                                                                }).map(s => ({
                                                                                    date: s.date,
                                                                                    subject: s.subject,
                                                                                    className: s.className,
                                                                                    originalTeacherId: item.originalTeacherId
                                                                                }));
                                                                            } else {
                                                                                const d = new Date(item.date).getDay();
                                                                                if (d === day && item.selectedPeriods?.includes(period.id)) {
                                                                                    return [{
                                                                                        date: item.date,
                                                                                        subject: item.subject,
                                                                                        className: item.className,
                                                                                        originalTeacherId: item.originalTeacherId
                                                                                    }];
                                                                                }
                                                                                return [];
                                                                            }
                                                                        });
                                                                        return (
                                                                            <div key={day} className="border border-slate-800 p-1 min-h-[70px] bg-white flex flex-col justify-center">
                                                                                {matches.length > 0 ? (
                                                                                    matches.map((match, idx) => (
                                                                                        <div key={idx} className={`flex flex-col ${idx > 0 ? 'border-t border-dashed border-slate-300 pt-1 mt-1' : ''}`}>
                                                                                            <div className="font-bold text-indigo-700 text-xs leading-tight mb-0.5">
                                                                                                {match.date.split('-')[2]}日
                                                                                            </div>
                                                                                            <div className="text-slate-800 text-[11px] font-bold leading-tight">
                                                                                                代 {teachers.find(t => t.id === match.originalTeacherId)?.name}
                                                                                            </div>
                                                                                            <div className="text-slate-500 text-[10px] leading-tight mt-0.5 break-words">
                                                                                                {match.subject || ''} {match.className || ''}
                                                                                            </div>
                                                                                        </div>
                                                                                    ))
                                                                                ) : null}
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </React.Fragment>
                                                            ))}
                                                        </div>
                                                    </div>
                                                ));
                                            })()}

                                            <div className="mt-12 pt-4 border-t border-slate-200 flex justify-between items-center">
                                                <span className="text-[10px] text-slate-300 italic">產自 SubTeach Pro 代課管理系統</span>
                                                <span className="text-[10px] text-slate-300 font-mono">Teacher ID: {group.subTeacherId.slice(0,8)}</span>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="border border-slate-200 rounded-lg overflow-hidden">
                                            <table className="w-full text-sm">
                                                <thead className="bg-slate-50 border-b border-slate-200">
                                                    <tr>
                                                        <th className="px-3 py-2 text-xs font-bold text-slate-600 whitespace-nowrap">代課日期</th>
                                                        <th className="px-3 py-2 text-xs font-bold text-slate-600 whitespace-nowrap">請假人</th>
                                                        <th className="px-3 py-2 text-xs font-bold text-slate-600 whitespace-nowrap">備註</th>
                                                        <th className="px-3 py-2 text-xs font-bold text-slate-600 text-right whitespace-nowrap">代課鐘點費</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100">
                                                    {(group.rows || []).length === 0 ? (
                                                        <tr>
                                                            <td colSpan={4} className="px-3 py-6 text-center text-slate-400">本月無代課明細</td>
                                                        </tr>
                                                    ) : (
                                                        (group.rows || []).map((r: any, idx: number) => {
                                                            const originalTeacher = teachers.find(t => t.id === r.originalTeacherId);
                                                            return (
                                                                <tr key={`${r.date}_${r.originalTeacherId}_${r.payType}_${idx}`} className="hover:bg-slate-50/60">
                                                                    <td className="px-3 py-2 font-mono text-slate-600 whitespace-nowrap">{formatDateSimple(r.date)}</td>
                                                                    <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{originalTeacher?.name || r.originalTeacherId || '未知'}</td>
                                                                    <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{r.note || '-'}</td>
                                                                    <td className="px-3 py-2 text-right font-bold text-slate-700 whitespace-nowrap">{Number(r.amount || 0).toLocaleString()}</td>
                                                                </tr>
                                                            );
                                                        })
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right align-top font-bold text-green-700">
                                        ${totalIncome.toLocaleString()}
                                    </td>
                                </tr>
                            );
                        })
                    )}
                </tbody>
            </table>
          )}
        </div>
      </div>

       {/* Settings Modal (Same as before) */}
       {isSettingsOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 animate-fade-in">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-slate-800 flex items-center">
                 <Settings className="mr-2" size={20}/> GAS 連線設定
              </h2>
              <button onClick={() => setIsSettingsOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={24} />
              </button>
            </div>
            
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-xs text-amber-800">
               <div className="flex items-start">
                  <AlertTriangle size={14} className="mr-1 mt-0.5 shrink-0"/>
                  <div>
                    請務必確認您的 Google Apps Script 部署設定：
                    <ul className="list-disc ml-4 mt-1 space-y-1">
                       <li>Execute as: <strong>Me (您的帳號)</strong></li>
                       <li>Who has access: <strong>Anyone (任何人)</strong></li>
                       <li>URL 結尾應為 <code>/exec</code></li>
                    </ul>
                  </div>
               </div>
            </div>

            <p className="text-sm text-slate-500 mb-4">
              請將專案目錄下的 <code>gas/</code> (*.gs) 程式碼部署為 Web App，並將產生的網址貼於下方。
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Web App URL</label>
                <div className="flex space-x-2">
                    <input 
                    type="text" 
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none text-sm"
                    placeholder="https://script.google.com/macros/s/.../exec"
                    value={tempUrl}
                    onChange={e => setTempUrl(e.target.value)}
                    />
                    <button 
                        onClick={() => handleTestConnection()}
                        disabled={isTesting}
                        className="px-3 py-2 bg-slate-100 text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-200 flex items-center"
                        title="測試連線"
                    >
                        {isTesting ? <Loader2 size={18} className="animate-spin"/> : <Wifi size={18}/>}
                    </button>
                </div>
                {/* Test Result Message */}
                {testMessage && (
                    <div className={`mt-2 text-xs flex items-center ${testStatus === 'success' ? 'text-green-600' : testStatus === 'error' ? 'text-red-600' : 'text-slate-500'}`}>
                        {testStatus === 'success' ? <CheckCircle size={14} className="mr-1"/> : testStatus === 'error' ? <AlertTriangle size={14} className="mr-1"/> : null}
                        {testMessage}
                    </div>
                )}
              </div>
              
              <div className="pt-2 flex space-x-3">
                <button onClick={() => setIsSettingsOpen(false)} className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50">
                  取消
                </button>
                <button onClick={handleSaveSettings} className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
                  儲存設定
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Records;
