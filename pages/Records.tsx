
import React, { useState, useMemo, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { Trash2, Settings, X, Loader2, Edit2, AlertTriangle, Wifi, FileText, ExternalLink, Save, CloudUpload, Filter, RefreshCw, Calendar as CalendarIcon, ChevronDown, CheckCircle, FileOutput, Printer, ChevronLeft, ChevronRight, CheckSquare, Square, MinusSquare, FolderOpen, Phone, Image as ImageIcon, Calculator, Search } from 'lucide-react';
import html2canvas from 'html2canvas';
import { PayType, SubstituteDetail, LeaveRecord, ProcessingStatus, TimetableSlot } from '../types';
import { useNavigate } from 'react-router-dom';
import { callGasApi } from '../utils/api';
import { convertSlotsToDetails, getExpectedDailyRate, getDaysInMonth } from '../utils/calculations';
import Modal, { ModalMode, ModalType } from '../components/Modal';
import InstructionPanel, { CollapsibleItem } from '../components/InstructionPanel';

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
  const { records, teachers, deleteRecord, updateRecord, settings, updateSettings, holidays, salaryGrades } = useAppStore(); // Added updateRecord
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

  // Search State
  const [searchTerm, setSearchTerm] = useState('');

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

  // 1. Filter records by Selected Month (Handle Cross-Month Overlap)
  const filteredRecords = useMemo(() => {
    const filtered = records.filter(r => {
        const details = r.details || [];
        const slots = r.slots || [];
        // 若 startDate/endDate 缺失或無效，改由 details/slots 推斷
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
        // 若 details/slots 任一日落在所選月份，也納入（避免漏顯示）
        const hasAnyDateInMonth = [...details.map(d => toYMD(d.date)), ...slots.map(s => toYMD(s.date))]
          .some(date => date >= monthStartStr && date <= monthEndStr);
        const inMonth = inMonthByRange || hasAnyDateInMonth;
        if (!inMonth) return false;

        if (searchTerm) {
            const term = searchTerm.toLowerCase();
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
        }
        return true;
    });

    // Sort by createdAt descending (newest first)
    return filtered.sort((a, b) => b.createdAt - a.createdAt);
  }, [records, monthStartStr, monthEndStr, searchTerm, teachers]);

  // Reset selection when month changes
  useEffect(() => {
      setSelectedRecordIds(new Set());
  }, [selectedMonth]);

  // 2. Data Transformation for "View by Substitute" (Based on Filtered Records)
  const substituteGroups = useMemo(() => {
    if (viewMode !== 'bySubstituteTeacher') return [];

    const allDetails: (SubstituteDetail & { originalTeacherId: string, recordId: string, slots: TimetableSlot[] })[] = [];
    filteredRecords.forEach(r => {
        r.details.forEach(d => {
            // Only include details that fall within the selected month
            if (d.substituteTeacherId && d.date.startsWith(selectedMonth)) {
                const matchingSlots = r.slots ? r.slots.filter(s => 
                    s.date === d.date && 
                    s.substituteTeacherId === d.substituteTeacherId && 
                    s.payType === d.payType
                ) : [];
                allDetails.push({ ...d, originalTeacherId: r.originalTeacherId, recordId: r.id, slots: matchingSlots });
            }
        });
    });

    // Group by substitute teacher
    const groups: Record<string, typeof allDetails> = {};
    allDetails.forEach(d => {
        if (!groups[d.substituteTeacherId]) groups[d.substituteTeacherId] = [];
        groups[d.substituteTeacherId].push(d);
    });

    return Object.keys(groups).map(subId => ({
        subTeacherId: subId,
        items: groups[subId].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    }));

  }, [filteredRecords, viewMode, selectedMonth]);

  // Calculate Monthly Total (Only count details in this month)
  const monthlyTotal = useMemo(() => {
     return filteredRecords.reduce((sum, r) => {
         return sum + r.details.reduce((dSum, d) => {
             // Filter amount by month
             return d.date.startsWith(selectedMonth) ? dSum + d.calculatedAmount : dSum;
         }, 0);
     }, 0);
  }, [filteredRecords, selectedMonth]);


  // --- Handlers ---

  const handleStatusChange = (record: LeaveRecord, newStatus: string) => {
      const updatedRecord = { ...record, processingStatus: newStatus as ProcessingStatus };
      updateRecord(updatedRecord);
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
          const result = await callGasApi(settings.gasWebAppUrl, 'GENERATE_REPORTS', {
              records: filteredRecords,
              teachers: teachers,
              exportOptions: {
                  ledgers: Array.from(selectedLedgerTypes),
                  vouchers: Array.from(selectedVoucherTypes),
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

      // 決定要匯出的資料集：若有選取則只匯出選取，否則匯出全部
      let targetRecords = filteredRecords;
      if (selectedRecordIds.size > 0) {
          targetRecords = filteredRecords.filter(r => selectedRecordIds.has(r.id));
      }

      setIsGeneratingBatch(true);
      try {
          const result = await callGasApi(settings.gasWebAppUrl, 'BATCH_GENERATE_FORMS', {
              records: targetRecords,
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
            
            <div className="flex gap-2 w-full sm:w-auto">
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

      <InstructionPanel title="使用說明：代課清冊與憑證" shortTitle="使用說明">
        <div className="space-y-1">
          <CollapsibleItem title="檢視模式切換">
            <p>可切換「依請假人」或「依代課人」檢視。依請假人適合核對假單；依代課人適合核對薪資與發放清冊。</p>
          </CollapsibleItem>
          <CollapsibleItem title="假日與異常警示">
            <p>若請假日期包含週末或系統設定之假日，系統會以紅色文字警示。請務必確認是否為誤登，或該日是否有實際代課需求。</p>
          </CollapsibleItem>
          <CollapsibleItem title="報表匯出功能">
            <p><strong>匯出清冊/憑證：</strong>產生當月的印領清冊與黏貼憑證 (Google Doc/Sheet)，用於核銷。</p>
            <p><strong>匯出彙整表：</strong>產生代課單彙整表 (Excel/Sheet)，方便進行大數據分析或存檔。</p>
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

           <div className="relative w-full xl:w-64">
             <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search size={18} className="text-slate-400" />
             </div>
             <input
                type="text"
                placeholder="搜尋教師、事由、文號..."
                className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
             />
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
                    </div>
                </div>
           </div>
      </div>
      
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
                    <th className="px-4 py-4 font-semibold text-slate-700 text-center w-32 whitespace-nowrap">狀態</th>
                    <th className="px-6 py-4 font-semibold text-slate-700 text-right whitespace-nowrap">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRecords.length === 0 ? (
                    <tr>
                       <td colSpan={9} className="text-center py-16 text-slate-400 flex flex-col items-center justify-center w-full">
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
                      
                      // 只計算與顯示當月相關的細項
                      const currentMonthDetails = (record.details || []).filter(d => d.date && d.date.startsWith(selectedMonth));
                      // Exclude overtime slots from total amount calculation for the main report to avoid double counting
                      const monthTotalAmount = currentMonthDetails.reduce((sum, d) => {
                          return d.isOvertime ? sum : sum + d.calculatedAmount;
                      }, 0);
                      
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
                                    <div key={d.id} className="flex items-center space-x-2 text-xs border-b border-slate-100 last:border-0 pb-1">
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
                              >
                                  <option value="待處理">待處理</option>
                                  <option value="已印代課單">已印代課單</option>
                                  <option value="跑章中">跑章中</option>
                                  <option value="結案待算">結案待算</option>
                              </select>
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
                               <button onClick={() => deleteRecord(record.id)} className="text-red-400 hover:text-red-600 p-2" title="刪除">
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
                    <th className="px-6 py-4 font-semibold text-slate-700 text-right whitespace-nowrap">本月收入估算</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
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
                            const totalIncome = group.items.reduce((sum, item) => sum + item.calculatedAmount, 0);
                            
                            return (
                                <tr key={group.subTeacherId} className="hover:bg-slate-50">
                                    <td className="px-6 py-4 align-top">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <div className="font-bold text-lg text-slate-800">{subTeacher?.name || '未知/待聘'}</div>
                                                <div className="text-xs text-slate-500 mt-1">{subTeacher?.type}</div>
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

                                            <div className="mt-12 pt-4 border-t border-slate-100 flex justify-between items-center">
                                                <span className="text-[10px] text-slate-300 italic">產自 SubTeach Pro 代課管理系統</span>
                                                <span className="text-[10px] text-slate-300 font-mono">Teacher ID: {group.subTeacherId.slice(0,8)}</span>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="space-y-2">
                                            {group.items.map(item => {
                                                const originalTeacher = teachers.find(t => t.id === item.originalTeacherId);
                                                return (
                                                    <div key={item.id} className="flex items-center text-sm border-b border-slate-100 pb-1 last:border-0">
                                                        <span className="font-mono text-slate-500 mr-3">{formatDateSimple(item.date)}</span>
                                                        <div className="mr-2">
                                                            <span className="text-slate-800">代 {originalTeacher?.name}</span>
                                                            {originalTeacher?.phone && (
                                                                <span className="text-xs text-slate-400 flex items-center scale-90 origin-left">
                                                                    <Phone size={8} className="mr-1" />
                                                                    {originalTeacher.phone}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded text-xs mr-2">
                                                            {item.payType === PayType.HOURLY ? `${item.periodCount}節` : item.payType === PayType.HALF_DAY ? '半日' : `${item.periodCount}天`}
                                                        </span>
                                                        <div className="ml-auto flex items-center space-x-1">
                                                            <span className="text-slate-400 text-xs">${item.calculatedAmount.toLocaleString()}</span>
                                                            {item.payType === PayType.DAILY && subTeacher && (() => {
                                                                const daysInMonth = getDaysInMonth(item.date);
                                                                const expectedRate = getExpectedDailyRate(subTeacher, daysInMonth, true); // Assume homeroom for daily
                                                                if (expectedRate !== null && Math.abs(item.calculatedAmount - expectedRate) > 30) {
                                                                    return (
                                                                        <div className="group relative flex items-center">
                                                                            <AlertTriangle size={12} className="text-amber-500 cursor-help" />
                                                                            <div className="absolute bottom-full right-0 mb-1 hidden group-hover:block w-48 p-2 bg-slate-800 text-white text-xs rounded shadow-lg z-10">
                                                                                系統試算日薪為 ${item.calculatedAmount}，但根據薪級表標準應為 ${expectedRate} (差距大於30元)。請確認教師薪級或手動調整金額。
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                }
                                                                return null;
                                                            })()}
                                                        </div>
                                                    </div>
                                                );
                                            })}
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
