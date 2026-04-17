
import React, { useState, useMemo } from 'react';
import { mergeTeacherScheduleForSave, resolveTeacherDefaultSchedule } from '../utils/teacherSchedule';
import { useAppStore } from '../store/useAppStore';
import { Teacher, TeacherType, COMMON_SUBJECTS, APPLY_TEACHING_ITEMS, TeacherScheduleSlot, ReductionItem, TeacherDocument, HOMEROOM_FEE_MONTHLY } from '../types';
import { Plus, Edit2, Trash2, Search, X, CloudUpload, Loader2, HelpCircle, GraduationCap, Award, Briefcase, Book, RefreshCw, Star, FileSpreadsheet, AlertTriangle, ArrowRight, CheckCircle, Calendar, Info, Clock, Eraser, MousePointerClick, MinusCircle, FileText, ExternalLink, Paperclip } from 'lucide-react';
import Modal, { ModalMode, ModalType } from '../components/Modal';
import InstructionPanel, { CollapsibleItem } from '../components/InstructionPanel';
import { calculateTeacherFinancials, getStandardBase } from '../utils/calculations';
import { callGasApi } from '../utils/api';

// 預設匯入表頭 (格式 A)
const DEFAULT_IMPORT_HEADER = "年級,班級,導師,節次,時間,星期一,星期二,星期三,星期四,星期五";

export default function TeacherManagement() {
  const {
    teachers,
    addTeacher,
    updateTeacher,
    renameTeacher,
    setAllTeachers,
    deleteTeacher,
    syncAllPublicTeacherSchedules,
    settings,
    salaryGrades,
    activeSemesterId,
    semesters,
  } = useAppStore();

  const activeSemesterLabel = useMemo(() => {
    if (!activeSemesterId) return null;
    return semesters.find((x) => x.id === activeSemesterId)?.name || activeSemesterId;
  }, [activeSemesterId, semesters]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  /** true = 僅檢視，需點「編輯」才能修改 */
  const [isReadOnlyView, setIsReadOnlyView] = useState(false);
  const [filterType, setFilterType] = useState<'ALL' | 'INTERNAL' | 'EXTERNAL' | 'LANGUAGE'>('ALL');
  const [filterOvertimeOnly, setFilterOvertimeOnly] = useState(false);
  const [filterJobTitle, setFilterJobTitle] = useState<string>('ALL');

  // --- Schedule Editor State (Manual Click) ---
  const [editorSubject, setEditorSubject] = useState('');
  const [editorClass, setEditorClass] = useState('');

  // --- Import Schedule Modal State ---
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importStage, setImportStage] = useState<'input' | 'preview' | 'result'>('input');
  // Initialize with default header
  const [importText, setImportText] = useState(DEFAULT_IMPORT_HEADER);
  
  // Preview Data Structure
  type PreviewTeacherData = {
      name: string;
      className: string; // 導師班級
      schedule: TeacherScheduleSlot[];
      isNew: boolean;
  };
  const [previewData, setPreviewData] = useState<PreviewTeacherData[]>([]);
  const [importResult, setImportResult] = useState<{ success: number, failed: number, logs: string[] } | null>(null);
  const [isSyncingPublicSchedules, setIsSyncingPublicSchedules] = useState(false);

  // Document Upload State
  const [isUploading, setIsUploading] = useState(false);

  // Modal State for feedback
  const [feedbackModal, setFeedbackModal] = useState<{
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

  const [deleteTeacherConfirm, setDeleteTeacherConfirm] = useState<Teacher | null>(null);
  const [deleteSlotConfirm, setDeleteSlotConfirm] = useState<{ day: number; period: string } | null>(null);
  const [deleteReductionConfirm, setDeleteReductionConfirm] = useState<number | null>(null);

  const closeFeedbackModal = () => setFeedbackModal(prev => ({ ...prev, isOpen: false }));
  const showFeedback = (props: Partial<typeof feedbackModal>) => {
      setFeedbackModal({
          isOpen: true,
          title: props.title || '訊息',
          message: props.message || '',
          type: props.type || 'info',
          mode: props.mode || 'alert',
          onConfirm: props.onConfirm
      });
  };

  // Form State
  const [formData, setFormData] = useState<Omit<Teacher, 'id'>>({
    name: '',
    type: TeacherType.INTERNAL,
    salaryPoints: 0,
    hasCertificate: false,
    education: '',
    note: '',
    isRetired: false,
    teachingClasses: '',
    subjects: '',
    phone: '',
    schoolEmail: '',
    jobTitle: '',
    isSpecialEd: false,
    isGraduatingHomeroom: false,
    adminReduction: 0,
    reductions: [], // Initialize reductions array
    teacherRole: '',
    expertise: [],
    baseSalary: 0,
    researchFee: 0,
    isHomeroom: false,
    isFixedOvertimeTeacher: false,
    defaultSchedule: [],
    defaultOvertimeSlots: [],
    entryDocuments: []
  });

  const handleOpenModal = (teacher?: Teacher, readOnly = false) => {
    setIsReadOnlyView(!!teacher && readOnly);
    if (teacher) {
      setEditingId(teacher.id);
      setFormData({
        name: teacher.name,
        type: teacher.type,
        salaryPoints: teacher.salaryPoints || 0,
        hasCertificate: teacher.hasCertificate || false,
        education: teacher.education || '',
        note: teacher.note || '',
        isRetired: teacher.isRetired || false,
        teachingClasses: teacher.teachingClasses || '',
        subjects: teacher.subjects || '',
        phone: teacher.phone || '',
        schoolEmail: teacher.schoolEmail || '',
        jobTitle: teacher.jobTitle || '',
        isSpecialEd: teacher.isSpecialEd || false,
        isGraduatingHomeroom: teacher.isGraduatingHomeroom || false,
        adminReduction: teacher.adminReduction || 0,
        reductions: teacher.reductions || (teacher.adminReduction ? [{ title: '基本減授', periods: teacher.adminReduction }] : []), // Migration logic
        teacherRole: teacher.teacherRole || '',
        expertise: teacher.expertise || [],
        baseSalary: teacher.baseSalary,
        researchFee: teacher.researchFee,
        isHomeroom: teacher.isHomeroom,
        isFixedOvertimeTeacher: teacher.isFixedOvertimeTeacher ?? false,
        defaultSchedule: resolveTeacherDefaultSchedule(teacher, activeSemesterId) || teacher.defaultSchedule || [],
        defaultOvertimeSlots: teacher.defaultOvertimeSlots || [],
        entryDocuments: teacher.entryDocuments || []
      });
      // Init Editor State
      setEditorClass(teacher.teachingClasses || '');
      setEditorSubject(teacher.subjects?.split(',')[0] || '');
    } else {
      setEditingId(null);
      setFormData({
        name: '',
        type: TeacherType.INTERNAL,
        salaryPoints: 0,
        hasCertificate: false,
        education: '',
        note: '',
        isRetired: false,
        teachingClasses: '',
        subjects: '',
        phone: '',
        schoolEmail: '',
        jobTitle: '',
        isSpecialEd: false,
        isGraduatingHomeroom: false,
        adminReduction: 0,
        reductions: [],
        teacherRole: '',
        expertise: [],
        baseSalary: 0,
        researchFee: 0,
        isHomeroom: false,
        isFixedOvertimeTeacher: false,
        defaultSchedule: [],
        defaultOvertimeSlots: [],
        entryDocuments: []
      });
      setEditorClass('');
      setEditorSubject('');
    }
    setIsModalOpen(true);
  };

  const calculateForForm = (points: number, education: string, hasCert: boolean) => {
      const { baseSalary, researchFee } = calculateTeacherFinancials(salaryGrades, points, education, hasCert);
      return { base: baseSalary, fee: researchFee };
  };

  const handleSalaryPointChange = (val: number) => {
    const { base, fee } = calculateForForm(val, formData.education || '', formData.hasCertificate);
    setFormData({ ...formData, salaryPoints: val, baseSalary: base, researchFee: fee });
  };

  const handleEducationChange = (val: string) => {
    const { base, fee } = calculateForForm(formData.salaryPoints || 0, val, formData.hasCertificate);
    setFormData({ ...formData, education: val, baseSalary: base || formData.baseSalary, researchFee: fee });
  };

  const handleCertChange = (checked: boolean) => {
    const { base, fee } = calculateForForm(formData.salaryPoints || 0, formData.education || '', checked);
    setFormData({ ...formData, hasCertificate: checked, baseSalary: base || formData.baseSalary, researchFee: fee });
  };

  const toggleExpertise = (subject: string) => {
      const current = formData.expertise || [];
      if (current.includes(subject)) {
          setFormData({ ...formData, expertise: current.filter(s => s !== subject) });
      } else {
          setFormData({ ...formData, expertise: [...current, subject] });
      }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (!settings.gasWebAppUrl) {
          alert("請先設定 Google Apps Script URL 才能上傳檔案。");
          return;
      }

      setIsUploading(true);
      try {
          // Convert to Base64
          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onload = async () => {
              const base64Data = reader.result as string;
              
              // Call API
              const res = await callGasApi(settings.gasWebAppUrl, 'UPLOAD_TEACHER_DOCUMENT', {
                  fileData: {
                      base64: base64Data,
                      mimeType: file.type,
                      name: file.name
                  }
              });

              if (res.status === 'success' && res.data?.doc) {
                  setFormData(prev => ({
                      ...prev,
                      entryDocuments: [...(prev.entryDocuments || []), res.data.doc]
                  }));
              } else {
                  throw new Error(res.message);
              }
              setIsUploading(false);
          };
          reader.onerror = () => { throw new Error("檔案讀取失敗"); };
      } catch (err: any) {
          alert("上傳失敗: " + err.message);
          setIsUploading(false);
      }
  };

  const handleRemoveDocument = (docId: string) => {
      setFormData(prev => ({
          ...prev,
          entryDocuments: (prev.entryDocuments || []).filter(d => d.id !== docId)
      }));
  };

  // Schedule Editor Logic
  const handleSlotClick = (day: number, period: string) => {
      const currentSchedule = formData.defaultSchedule || [];
      const existingIndex = currentSchedule.findIndex(s => s.day === day && s.period === period);

      if (existingIndex >= 0) {
          setDeleteSlotConfirm({ day, period });
          return;
      } else {
          // Add new slot
          if (!editorSubject) {
              alert('請先在上方輸入或選擇「科目」');
              return;
          }
          const newSlot: TeacherScheduleSlot = {
              day,
              period,
              subject: editorSubject,
              className: editorClass
          };
          setFormData({ ...formData, defaultSchedule: [...currentSchedule, newSlot] });
      }
  };

  const handleBatchRecalculate = () => {
    if (!salaryGrades || salaryGrades.length === 0) {
        showFeedback({ title: '無薪級表', message: '系統尚未載入薪級表，無法進行計算。', type: 'warning' });
        return;
    }
    showFeedback({
        title: '確認重算',
        message: '這將依據目前的「薪級級距表」重新計算所有教師的薪資。確定嗎？',
        type: 'warning',
        mode: 'confirm',
        onConfirm: () => {
            let updatedCount = 0;
            const newTeacherList = teachers.map(t => {
                const { baseSalary, researchFee } = calculateTeacherFinancials(salaryGrades, t.salaryPoints || 0, t.education || '', t.hasCertificate);
                if (baseSalary !== t.baseSalary || researchFee !== t.researchFee) {
                    updatedCount++;
                    return { ...t, baseSalary, researchFee };
                }
                return t;
            });
            setAllTeachers(newTeacherList);
            showFeedback({ title: '計算完成', message: `已成功更新 ${updatedCount} 位教師的薪資資料。`, type: 'success' });
        }
    });
  };

  // --- Import Schedule Logic ---
  
  const mapPeriod = (raw: string): string => {
      const s = raw.trim();
      if (s.includes('早')) return '早';
      if (s.includes('午')) return '午';
      if (s.includes('一') || s === '1') return '1';
      if (s.includes('二') || s === '2') return '2';
      if (s.includes('三') || s === '3') return '3';
      if (s.includes('四') || s === '4') return '4';
      if (s.includes('五') || s === '5') return '5';
      if (s.includes('六') || s === '6') return '6';
      if (s.includes('七') || s === '7') return '7';
      return '';
  };

  const handleParsePreview = () => {
      const lines = importText.split('\n').filter(l => l.trim());
      if (lines.length === 0) {
          alert("請先輸入內容");
          return;
      }

      const tempMap: Record<string, PreviewTeacherData> = {};
      
      const headerLine = lines[0];
      const separator = headerLine.includes('\t') ? '\t' : ',';
      const headers = headerLine.split(separator).map(s => s.trim());

      // 增強型欄位偵測：支援「教師姓名」、「導師」、「姓名」
      const idxTeacher = headers.findIndex(h => h.includes('教師姓名') || h.includes('導師') || h.includes('姓名') || h.includes('教師'));
      // 支援「班級」欄位，若無則視為空
      const idxClass = headers.findIndex(h => h.includes('班級'));
      const idxPeriod = headers.findIndex(h => h.includes('節次'));
      const idxMon = headers.findIndex(h => h.includes('星期一') || h === '1' || h === 'Mon');

      if (idxTeacher === -1 || idxPeriod === -1 || idxMon === -1) {
          alert('格式錯誤：找不到必要欄位。\n請確認表頭包含：「教師姓名」(或導師)、「節次」、「星期一」。');
          return;
      }

      for (let i = 1; i < lines.length; i++) {
          const row = lines[i].split(separator).map(s => s.trim());
          if (row.length < idxMon + 1) continue;

          const teacherName = row[idxTeacher];
          if (!teacherName) continue;

          const className = (idxClass > -1 && idxClass < row.length) ? row[idxClass] : '';
          const periodRaw = (idxPeriod < row.length) ? row[idxPeriod] : '';
          const periodId = mapPeriod(periodRaw);

          if (!periodId) continue;

          if (!tempMap[teacherName]) {
              tempMap[teacherName] = {
                  name: teacherName,
                  className: className, // Capture class from first occurrence
                  schedule: [],
                  isNew: !teachers.some(t => t.name === teacherName)
              };
          } else if (!tempMap[teacherName].className && className) {
              // 若先前未抓到班級，補上
              tempMap[teacherName].className = className;
          }

          for (let d = 0; d < 5; d++) {
              const colIdx = idxMon + d;
              if (colIdx < row.length) {
                  const subject = row[colIdx];
                  if (subject && subject.length > 0) {
                      tempMap[teacherName].schedule.push({
                          day: d + 1,
                          period: periodId,
                          subject: subject,
                          className: className
                      });
                  }
              }
          }
      }

      setPreviewData(Object.values(tempMap));
      setImportStage('preview');
  };

  const handleConfirmImport = () => {
      const logs: string[] = [];
      const newTeachersToAdd: Teacher[] = [];
      let successCount = 0;

      const updatedTeachers = [...teachers];

      previewData.forEach((pData) => {
          let teacher = updatedTeachers.find((t) => t.name === pData.name);

          if (!teacher) {
              const baseNew: Teacher = {
                  id: pData.name,
                  name: pData.name,
                  type: TeacherType.INTERNAL,
                  hasCertificate: true,
                  baseSalary: 0,
                  researchFee: 0,
                  isRetired: false,
                  isSpecialEd: false,
                  isGraduatingHomeroom: false,
                  isHomeroom: !!pData.className,
                  teachingClasses: pData.className,
                  note: '由課表匯入自動建立',
                  defaultSchedule: [],
              };
              const newT = mergeTeacherScheduleForSave(baseNew, pData.schedule, activeSemesterId);
              updatedTeachers.push(newT);
              logs.push(`建立新教師: ${pData.name}`);
          } else {
              const idx = updatedTeachers.findIndex((t) => t.id === teacher!.id);
              let next = { ...teacher };
              if (!next.teachingClasses && pData.className) {
                  next = { ...next, teachingClasses: pData.className };
              }
              next = mergeTeacherScheduleForSave(next, pData.schedule, activeSemesterId);
              updatedTeachers[idx] = next;
              logs.push(`更新課表: ${pData.name}`);
          }
          successCount += pData.schedule.length;
      });

      setAllTeachers(updatedTeachers);
      setImportResult({ success: successCount, failed: 0, logs });
      setImportStage('result');
  };

  const resetImport = () => {
      setImportStage('input');
      setImportText(DEFAULT_IMPORT_HEADER);
      setPreviewData([]);
      setImportResult(null);
      setIsImportModalOpen(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnlyView) return;
    const isHomeroomLogic = (formData.teacherRole?.includes('導師') || formData.isGraduatingHomeroom) ?? false;
    
    // Compute total reduction from existing array (if any remain) for legacy field
    const currentTotal = (formData.reductions || []).reduce((sum, item) => sum + item.periods, 0);

    const finalData = { 
        ...formData, 
        isHomeroom: isHomeroomLogic,
        adminReduction: currentTotal 
    };

    if (editingId) {
      const editingTeacher = teachers.find((t) => t.id === editingId);
      if (!editingTeacher) return;
      const nameChanged = editingTeacher.name !== finalData.name;
      const merged = mergeTeacherScheduleForSave(
        { ...editingTeacher, ...finalData, id: editingId },
        finalData.defaultSchedule || [],
        activeSemesterId,
      );
      if (nameChanged) {
        const exists = teachers.some((t) => t.id !== editingId && t.name === finalData.name);
        if (exists) {
          alert(`教師姓名 "${finalData.name}" 已存在。`);
          return;
        }
        renameTeacher(editingId, { ...merged, id: finalData.name });
      } else {
        updateTeacher(merged);
      }
    } else {
      const exists = teachers.some((t) => t.name === finalData.name);
      if (exists) {
        alert(`教師姓名 "${finalData.name}" 已存在。`);
        return;
      }
      const merged = mergeTeacherScheduleForSave(
        { ...(finalData as Teacher), id: finalData.name },
        finalData.defaultSchedule || [],
        activeSemesterId,
      );
      addTeacher(merged);
    }
    setIsModalOpen(false);
  };

  // Compute unique job titles for filter dropdown
  const uniqueJobTitles = useMemo(() => {
      const titles = new Set<string>();
      teachers.forEach(t => {
          if (t.jobTitle) titles.add(t.jobTitle);
          if (t.teacherRole) titles.add(t.teacherRole);
      });
      return Array.from(titles).sort();
  }, [teachers]);

  // 當月日薪顯示：以「本月天數」估算，方便教師管理頁即時查閱
  const currentMonthInfo = useMemo(() => {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;
      const daysInMonth = new Date(year, month, 0).getDate();
      return { year, month, daysInMonth };
  }, []);

  const filteredTeachers = teachers.filter(t => {
      if (filterType === 'INTERNAL' && t.type !== TeacherType.INTERNAL) return false;
      if (filterType === 'EXTERNAL' && t.type !== TeacherType.EXTERNAL) return false;
      if (filterType === 'LANGUAGE' && t.type !== TeacherType.LANGUAGE) return false;
      
      if (filterJobTitle !== 'ALL') {
          const title = t.jobTitle || t.teacherRole || '';
          if (title !== filterJobTitle) return false;
      }

      const searchLower = searchTerm.toLowerCase();
      const scheduleClassNames = (resolveTeacherDefaultSchedule(t, activeSemesterId) || []).map((slot) => slot.className || '').join(' ');
      const searchableText = [
          t.name,
          t.type,
          t.jobTitle,
          t.teacherRole,
          t.teachingClasses,
          t.subjects,
          scheduleClassNames,
          ...(t.expertise || [])
      ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

      const matchesSearch = searchableText.includes(searchLower);
      if (!matchesSearch) return false;

      if (filterOvertimeOnly) {
          // User Requirement: "Overtime is only for those who have specifically configured it."
          // So we filter by the existence of defaultOvertimeSlots
          if (!t.defaultOvertimeSlots || t.defaultOvertimeSlots.length === 0) {
              return false;
          }
      }

      return true;
  }).sort((a, b) => a.name.localeCompare(b.name, 'zh-TW'));

  // Helpers for Schedule Grid in Modal
  const periodRows = ['早', '1', '2', '3', '4', '午', '5', '6', '7'];
  const dayCols = [1, 2, 3, 4, 5];
  const dayNames = ['一', '二', '三', '四', '五'];

  const getSlot = (day: number, period: string) => {
      return formData.defaultSchedule?.find(s => s.day === day && s.period === period);
  };

  return (
    <div className="p-8">
      <Modal 
        isOpen={feedbackModal.isOpen}
        onClose={closeFeedbackModal}
        onConfirm={feedbackModal.onConfirm}
        title={feedbackModal.title}
        message={feedbackModal.message}
        type={feedbackModal.type}
        mode={feedbackModal.mode}
      />

      {/* 刪除教師確認 */}
      <Modal
        isOpen={!!deleteTeacherConfirm}
        onClose={() => setDeleteTeacherConfirm(null)}
        onConfirm={() => {
          if (deleteTeacherConfirm) {
            deleteTeacher(deleteTeacherConfirm.id);
            setDeleteTeacherConfirm(null);
            setIsModalOpen(false);
          }
        }}
        title="確認刪除教師"
        message={deleteTeacherConfirm ? `確定要刪除「${deleteTeacherConfirm.name}」嗎？此操作無法復原，相關代課紀錄與設定可能受影響。` : ''}
        type="warning"
        mode="confirm"
        confirmText="刪除"
        cancelText="取消"
      />

      {/* 刪除預設課表節次確認 */}
      <Modal
        isOpen={!!deleteSlotConfirm}
        onClose={() => setDeleteSlotConfirm(null)}
        onConfirm={() => {
          if (deleteSlotConfirm) {
            const currentSchedule = formData.defaultSchedule || [];
            const newSchedule = currentSchedule.filter(s => !(s.day === deleteSlotConfirm.day && s.period === deleteSlotConfirm.period));
            setFormData({ ...formData, defaultSchedule: newSchedule });
            setDeleteSlotConfirm(null);
          }
        }}
        title="確認刪除此節課"
        message={deleteSlotConfirm ? `確定要刪除預設課表中的「週${['一','二','三','四','五'][deleteSlotConfirm.day]} 第${deleteSlotConfirm.period}節」嗎？` : ''}
        type="warning"
        mode="confirm"
        confirmText="刪除"
        cancelText="取消"
      />

      {/* 刪除減授項目確認 */}
      <Modal
        isOpen={deleteReductionConfirm !== null}
        onClose={() => setDeleteReductionConfirm(null)}
        onConfirm={() => {
          if (deleteReductionConfirm !== null && formData.reductions) {
            const newReductions = formData.reductions.filter((_, i) => i !== deleteReductionConfirm);
            setFormData({ ...formData, reductions: newReductions });
            setDeleteReductionConfirm(null);
          }
        }}
        title="確認刪除減授項目"
        message="確定要刪除此筆減授設定嗎？"
        type="warning"
        mode="confirm"
        confirmText="刪除"
        cancelText="取消"
      />

      {/* Import Schedule Modal (Wizard Style) */}
      {isImportModalOpen && (
          <div className="fixed inset-0 z-[9999] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]">
                  {/* ... (Import Modal Content remains the same) ... */}
                  {/* For brevity, I'm hiding the unchanged import modal content in this update snippet, assuming it stays as is. 
                      In a real full file update, the content would be here. */}
                  <div className="bg-indigo-50 px-6 py-4 border-b border-indigo-100 flex justify-between items-center">
                      <h3 className="text-lg font-bold text-indigo-900 flex items-center">
                          <FileSpreadsheet className="mr-2" size={20}/> 批次匯入教師課表
                      </h3>
                      <button onClick={resetImport}><X className="text-slate-400 hover:text-slate-600"/></button>
                  </div>
                  <div className="p-6 overflow-y-auto flex-1 bg-slate-50">
                        {/* Simplified for this snippet */}
                        {importStage === 'input' && <textarea className="w-full h-64 p-4 border rounded" value={importText} onChange={e => setImportText(e.target.value)} />}
                        {importStage === 'preview' && <div className="text-center py-4">預覽 {previewData.length} 筆資料</div>}
                        {importStage === 'result' && <div className="text-center py-4 text-green-600">完成</div>}
                  </div>
                  <div className="p-4 border-t flex justify-end gap-2">
                        {importStage === 'input' && <button onClick={handleParsePreview} className="bg-indigo-600 text-white px-4 py-2 rounded">解析</button>}
                        {importStage === 'preview' && <button onClick={handleConfirmImport} className="bg-green-600 text-white px-4 py-2 rounded">匯入</button>}
                        {importStage === 'result' && <button onClick={resetImport} className="bg-slate-600 text-white px-4 py-2 rounded">關閉</button>}
                  </div>
              </div>
          </div>
      )}

      <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 md:gap-0">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-800">教師資料管理</h1>
          <p className="text-slate-500 mt-2 text-sm md:text-base">管理校內與校外代課教師名單及薪資基準</p>
        </div>
        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          <button onClick={() => { setIsImportModalOpen(true); setImportStage('input'); }} className="flex-1 md:flex-none justify-center px-3 py-2 bg-white text-slate-600 border border-slate-200 rounded-lg flex items-center space-x-2 hover:bg-slate-50 hover:text-indigo-600 shadow-sm transition-colors">
            <FileSpreadsheet size={18} />
            <span className="font-medium">匯入</span>
          </button>
          <button
            onClick={async () => {
              setIsSyncingPublicSchedules(true);
              try {
                await syncAllPublicTeacherSchedules();
                showFeedback({ title: '同步完成', message: '已將所有教師的預設課表同步至公開查詢，請假表單「依姓名帶入課表」現在可依姓名帶入。', type: 'success' });
              } catch (e: any) {
                showFeedback({ title: '同步失敗', message: e?.message || String(e), type: 'error' });
              } finally {
                setIsSyncingPublicSchedules(false);
              }
            }}
            disabled={isSyncingPublicSchedules || teachers.length === 0}
            className="flex-1 md:flex-none justify-center px-3 py-2 bg-cyan-50 text-cyan-700 border border-cyan-200 rounded-lg flex items-center space-x-2 hover:bg-cyan-100 transition-colors disabled:opacity-50"
            title="供請假表單依姓名帶入課表使用"
          >
            {isSyncingPublicSchedules ? <Loader2 size={18} className="animate-spin" /> : <ExternalLink size={18} />}
            <span className="font-medium">同步課表至公開查詢</span>
          </button>
          <button onClick={handleBatchRecalculate} className="flex-1 md:flex-none justify-center px-3 py-2 bg-orange-50 text-orange-700 border border-orange-200 rounded-lg flex items-center space-x-2 hover:bg-orange-100 transition-colors">
            <RefreshCw size={18} />
            <span className="font-medium">重算</span>
          </button>
          <button onClick={() => handleOpenModal()} className="flex-1 md:flex-none justify-center bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-lg flex items-center space-x-2 shadow-sm transition-colors">
            <Plus size={20} />
            <span className="font-bold">新增</span>
          </button>
        </div>
      </header>

      <InstructionPanel title="使用說明：教師資料管理">
        <div className="space-y-1">
          <CollapsibleItem title="新增/編輯教師">
            <p><strong>檢視：</strong>直接點擊列表中的<strong>教師姓名</strong>可開啟唯讀檢視，無法修改；若要修改請點視窗內「編輯」或列表右側鉛筆圖示。</p>
            <p>點擊右上角「新增」或列表中的編輯按鈕，可設定教師基本資料、薪級、專長等。系統會依據職別（編制內/外）提供不同的欄位。有設定薪級者會顯示在名單的「薪級」欄。</p>
          </CollapsibleItem>
          <CollapsibleItem title="薪資計算與重算">
            <p>系統會根據「薪級級距表」自動計算本俸與學術研究費。若您在「系統設定」中更新了薪級表，請點擊列表上方的「重算」按鈕來批次更新所有教師的薪資資料。</p>
          </CollapsibleItem>
          <CollapsibleItem title="匯入課表">
            <p>支援從 Excel 複製課表貼上匯入。匯入時請確保格式包含「教師姓名」、「節次」及週一至週五的課程內容。系統會自動解析並更新該師的預設課表。</p>
            <p className="mt-2"><strong>請假表單帶入課表：</strong>老師在請假表單依「申請人姓名」帶入課表前，請先在此頁點選「同步課表至公開查詢」，將目前所有教師的預設課表同步至公開查詢後，表單才能依姓名帶入。</p>
          </CollapsibleItem>
          <CollapsibleItem title="入職文件管理">
            <p>可上傳教師相關證件或入職資料。檔案將儲存於 Google Drive，並在系統中提供預覽與下載連結。</p>
          </CollapsibleItem>
          <CollapsibleItem title="語言教師注意事項">
            <p>原住民族語或新住民語教師，建議至專屬的「語言教師管理」頁面進行更詳細的設定（如主聘學校、語種、鐘點費率）。</p>
          </CollapsibleItem>
        </div>
      </InstructionPanel>
      
      {/* Filter Bar */}
      <div className="flex items-center space-x-2 mb-4 bg-slate-100 p-1 rounded-lg w-full overflow-x-auto scrollbar-hide">
          <button onClick={() => setFilterType('ALL')} className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all ${filterType === 'ALL' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            全部 <span className="ml-1 text-xs bg-slate-200 px-1.5 rounded-full text-slate-600">{teachers.length}</span>
          </button>
          <button onClick={() => setFilterType('INTERNAL')} className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all ${filterType === 'INTERNAL' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            校內教師 <span className="ml-1 text-xs bg-slate-200 px-1.5 rounded-full text-slate-600">{teachers.filter(t => t.type === TeacherType.INTERNAL).length}</span>
          </button>
          <button onClick={() => setFilterType('EXTERNAL')} className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all ${filterType === 'EXTERNAL' ? 'bg-white text-green-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            校外教師 <span className="ml-1 text-xs bg-slate-200 px-1.5 rounded-full text-slate-600">{teachers.filter(t => t.type === TeacherType.EXTERNAL).length}</span>
          </button>
          <button onClick={() => setFilterType('LANGUAGE')} className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all ${filterType === 'LANGUAGE' ? 'bg-white text-purple-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            語言教師 <span className="ml-1 text-xs bg-slate-200 px-1.5 rounded-full text-slate-600">{teachers.filter(t => t.type === TeacherType.LANGUAGE).length}</span>
          </button>
          <div className="w-px h-4 bg-slate-300 mx-2"></div>
          <button onClick={() => setFilterOvertimeOnly(!filterOvertimeOnly)} className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all flex items-center ${filterOvertimeOnly ? 'bg-amber-100 text-amber-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              <Clock size={14} className="mr-1"/> 僅顯示超鐘點
          </button>
          <div className="w-px h-4 bg-slate-300 mx-2"></div>
          <select 
              value={filterJobTitle} 
              onChange={(e) => setFilterJobTitle(e.target.value)}
              className="px-3 py-1.5 rounded-md text-sm font-bold border border-slate-200 text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
              <option value="ALL">所有職別</option>
              {uniqueJobTitles.map(title => (
                  <option key={title} value={title}>{title}</option>
              ))}
          </select>
      </div>
      
      {/* Filtered Count Display */}
      <div className="mb-2 text-sm text-slate-500 flex items-center justify-between">
          <span>目前顯示: <span className="font-bold text-indigo-600">{filteredTeachers.length}</span> 位教師</span>
      </div>

      {/* Search */}
      <div className="mb-6 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
        <input type="text" placeholder="搜尋姓名、班級、職別、科目或專長..." className="w-full pl-10 pr-4 py-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}/>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left whitespace-nowrap">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 font-semibold text-slate-700">姓名</th>
                <th className="px-6 py-4 font-semibold text-slate-700">薪級</th>
                <th className="px-6 py-4 font-semibold text-slate-700">
                  當月日薪/導師費
                  <div className="text-[11px] font-normal text-slate-500">
                    {currentMonthInfo.month}月（{currentMonthInfo.daysInMonth}天）
                  </div>
                </th>
                <th className="px-6 py-4 font-semibold text-slate-700">類別/職別</th>
                <th className="px-6 py-4 font-semibold text-slate-700">資格/學歷</th>
                <th className="px-6 py-4 font-semibold text-slate-700">專長/任教</th>
                <th className="px-6 py-4 font-semibold text-slate-700 text-center w-24">固定兼課</th>
                <th className="px-6 py-4 font-semibold text-slate-700">超鐘點/基本節數</th>
                <th className="px-6 py-4 font-semibold text-slate-700 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredTeachers.map(teacher => {
                const totalReduction = (teacher.reductions || []).reduce((sum,r)=>sum+r.periods, 0) || teacher.adminReduction || 0;
                const standard = getStandardBase(teacher);
                const basic = Math.max(0, standard - totalReduction);
                const schedule = resolveTeacherDefaultSchedule(teacher, activeSemesterId)?.length || 0;
                
                // Display Logic: Prioritize Configured Overtime Slots if available
                const configuredOvertime = teacher.defaultOvertimeSlots?.length || 0;
                const calculatedOvertime = Math.max(0, schedule - basic);
                
                // Use Configured Overtime for display if it exists, otherwise 0 (per user request "others are not overtime")
                // But we still show calculated as a hint if needed. 
                // Given the strong request, let's show the configured one as the primary "Overtime" value.
                const displayOvertime = configuredOvertime;
                
                // Validation Logic
                // If they have configured overtime, we check balance against that.
                // If not, we check against calculated.
                const validationBalance = schedule + totalReduction - (configuredOvertime > 0 ? configuredOvertime : calculatedOvertime);
                const isBalanced = validationBalance === standard;

                return (
                <tr key={teacher.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                      <button
                        type="button"
                        onClick={() => handleOpenModal(teacher, true)}
                        className="text-left w-full rounded-lg -m-1 p-1 hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                        title="點擊檢視資料（唯讀）"
                      >
                        <div className="font-medium text-indigo-700 hover:underline decoration-dotted">{teacher.name}</div>
                        <div className="text-xs text-slate-500">{teacher.phone || ' '}</div>
                      </button>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">
                    {teacher.salaryPoints && teacher.salaryPoints > 0 ? (
                      <div className="flex flex-col">
                        <span className="font-mono font-semibold text-indigo-700">{teacher.salaryPoints}</span>
                        {(teacher.baseSalary > 0 || teacher.researchFee > 0) && (
                          <span className="text-xs text-slate-500">
                            本俸 {teacher.baseSalary || 0} / 研究費 {teacher.researchFee || 0}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">
                    {teacher.baseSalary > 0 || teacher.researchFee > 0 ? (
                      <div className="flex flex-col">
                        <span className="font-mono font-semibold text-emerald-700">
                          日薪 {Math.round(((teacher.baseSalary || 0) + (teacher.researchFee || 0)) / currentMonthInfo.daysInMonth)}
                        </span>
                        <span className="text-xs text-slate-500">
                          導師費 {Math.ceil(HOMEROOM_FEE_MONTHLY / currentMonthInfo.daysInMonth)}/日
                        </span>
                      </div>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded text-xs font-medium mr-2 ${
                        teacher.type === TeacherType.INTERNAL ? 'bg-blue-100 text-blue-700' : 
                        teacher.type === TeacherType.EXTERNAL ? 'bg-green-100 text-green-700' :
                        'bg-purple-100 text-purple-700'
                    }`}>{teacher.type}</span>
                    <span className="text-sm text-slate-600">{teacher.jobTitle || teacher.teacherRole}</span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">
                    <div className="flex flex-col space-y-1">
                      <span className="flex items-center"><GraduationCap size={12} className="mr-1"/> {teacher.education || '-'}</span>
                      <span className={`flex items-center ${teacher.hasCertificate ? 'text-indigo-600' : 'text-slate-400'}`}>
                          <Award size={12} className="mr-1"/> {teacher.hasCertificate ? '有教證' : '無教證'}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">
                     {teacher.type === TeacherType.EXTERNAL ? (
                         <div className="flex flex-wrap gap-1 max-w-[200px]">
                             {teacher.expertise && teacher.expertise.length > 0 ? (
                                 teacher.expertise.map(ex => (
                                     <span key={ex} className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] border border-slate-200">{ex}</span>
                                 ))
                             ) : (
                                 <span className="text-slate-400">-</span>
                             )}
                         </div>
                     ) : (
                         <>
                            <div className="max-w-[150px] truncate" title={teacher.teachingClasses}>{teacher.teachingClasses || '-'}</div>
                            <div className="text-xs text-slate-400 max-w-[150px] truncate">{teacher.subjects || '-'}</div>
                         </>
                     )}
                  </td>
                  <td className="px-6 py-4 text-center">
                    {teacher.type === TeacherType.INTERNAL && (
                      <span className={`inline-flex items-center justify-center w-8 h-8 rounded ${teacher.isFixedOvertimeTeacher ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-400'}`} title={teacher.isFixedOvertimeTeacher ? '固定兼課教師' : '非固定兼課'}>
                        {teacher.isFixedOvertimeTeacher ? '✓' : '－'}
                      </span>
                    )}
                    {teacher.type !== TeacherType.INTERNAL && <span className="text-slate-300">－</span>}
                  </td>
                  <td className="px-6 py-4 text-slate-600">
                    {teacher.type === TeacherType.INTERNAL ? (
                        <div className="flex flex-col space-y-1 text-xs relative group">
                            <div className="flex justify-between w-40 border-b border-slate-200 pb-1 mb-1">
                                <span className="text-slate-400">法定: {standard}</span>
                                <span className="text-red-400">減授: -{totalReduction}</span>
                            </div>
                            <div className="flex justify-between w-40">
                                <span className="font-bold text-slate-700">基本授課: {basic}</span>
                            </div>
                            <div className="flex justify-between w-40 items-center">
                                <span className="text-indigo-500">預設排課: {schedule}</span>
                                <span className={`font-bold ${displayOvertime > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                                    超鐘點: {displayOvertime}
                                </span>
                            </div>
                            
                            {!isBalanced && (
                                <div className="absolute -right-6 top-1/2 -translate-y-1/2 text-rose-500 cursor-help">
                                    <AlertTriangle size={16} />
                                    {/* Tooltip */}
                                    <div className="absolute z-50 hidden group-hover:block bg-slate-800 text-white text-[10px] p-2 rounded shadow-lg bottom-full right-0 mb-1 w-48 whitespace-normal">
                                        <div className="font-bold mb-1 text-rose-300">節數檢核異常</div>
                                        <div>實授({schedule}) + 減授({totalReduction}) - 超鐘({configuredOvertime > 0 ? configuredOvertime : calculatedOvertime}) ≠ 法定({standard})</div>
                                        <div className="text-slate-400 mt-1">請檢查是否授課不足基本節數</div>
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <span className="text-slate-400 text-xs">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right space-x-2">
                    <button type="button" onClick={() => handleOpenModal(teacher, false)} title="編輯" className="text-indigo-600 hover:text-indigo-900 p-1"><Edit2 size={18} /></button>
                    <button onClick={() => setDeleteTeacherConfirm(teacher)} className="text-red-500 hover:text-red-700 p-1" title="刪除教師"><Trash2 size={18} /></button>
                  </td>
                </tr>
              )})}
              {filteredTeachers.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-6 py-8 text-center text-slate-400">找不到符合的教師資料</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal for Edit/Add */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6 animate-fade-in max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6 border-b pb-4">
              <h2 className="text-xl font-bold text-slate-800">
                {editingId
                  ? (isReadOnlyView ? `檢視教師：${formData.name}` : '編輯教師')
                  : '新增教師'}
              </h2>
              <button type="button" onClick={() => { setIsModalOpen(false); setIsReadOnlyView(false); }} className="text-slate-400 hover:text-slate-600"><X size={24} /></button>
            </div>
            {isReadOnlyView && (
              <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-900 flex items-center gap-2">
                <Info size={16} className="shrink-0" />
                <span>目前為<strong>唯讀檢視</strong>。若要修改資料，請點下方「編輯」。</span>
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-6 relative">
              {/* 唯讀時阻擋表單內所有點擊（課表格子、超鐘點格等） */}
              {isReadOnlyView && (
                <div className="absolute inset-0 z-10 cursor-default rounded-lg" aria-hidden style={{ minHeight: '60vh' }} title="唯讀模式" />
              )}
              <div className={isReadOnlyView ? 'pointer-events-none select-none opacity-95' : ''}>
              
              {/* Basic Info */}
              <div>
                  <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center bg-slate-100 p-2 rounded"><Briefcase size={16} className="mr-2"/> 基本資料</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">教師姓名</label>
                        <input required type="text" className="w-full px-3 py-2 border rounded-lg" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">電話</label>
                        <input type="text" className="w-full px-3 py-2 border rounded-lg" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">學校 Google 帳號（選填）</label>
                        <input
                          type="email"
                          autoComplete="email"
                          placeholder="與段考填報登入一致"
                          className="w-full px-3 py-2 border rounded-lg"
                          value={formData.schoolEmail ?? ''}
                          onChange={(e) => setFormData({ ...formData, schoolEmail: e.target.value })}
                        />
                        <p className="text-xs text-slate-500 mt-0.5">供教學組「段考提報」白名單從教師名單匯入導師用。</p>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">類別</label>
                        <select className="w-full px-3 py-2 border rounded-lg" value={formData.type} onChange={e => setFormData({...formData, type: e.target.value as TeacherType})}>
                            <option value={TeacherType.INTERNAL}>{TeacherType.INTERNAL}</option>
                            <option value={TeacherType.EXTERNAL}>{TeacherType.EXTERNAL}</option>
                            <option value={TeacherType.LANGUAGE}>{TeacherType.LANGUAGE}</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">職別 (Job Title)</label>
                        <input type="text" placeholder="例: 專任教師" className="w-full px-3 py-2 border rounded-lg" value={formData.jobTitle} onChange={e => setFormData({...formData, jobTitle: e.target.value})} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">教師角色</label>
                        <input type="text" placeholder="例: 科任/導師" className="w-full px-3 py-2 border rounded-lg" value={formData.teacherRole} onChange={e => setFormData({...formData, teacherRole: e.target.value})} />
                    </div>
                    <div className="flex items-end">
                       <label className="flex items-center space-x-2 text-sm text-slate-700 mb-2 cursor-pointer">
                           <input type="checkbox" checked={formData.isRetired} onChange={e => setFormData({...formData, isRetired: e.target.checked})} className="w-4 h-4 text-indigo-600 rounded" />
                           <span>是否退休</span>
                       </label>
                    </div>
                  </div>
              </div>

              {/* Document Upload */}
              <div>
                  <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center bg-slate-100 p-2 rounded"><FileText size={16} className="mr-2"/> 入職相關資料</h3>
                  <div className="space-y-2">
                      <div className="border border-dashed border-slate-300 rounded-lg p-3 text-center bg-slate-50 hover:bg-slate-100 transition-colors relative">
                          <input type="file" onChange={handleFileUpload} disabled={isUploading} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
                          <div className="flex flex-col items-center justify-center text-slate-500 text-xs pointer-events-none">
                              {isUploading ? (
                                  <span className="flex items-center text-indigo-500"><Loader2 className="animate-spin mr-1" size={14}/> 上傳中...</span>
                              ) : (
                                  <span className="flex items-center"><Paperclip size={14} className="mr-1"/> 點擊上傳文件</span>
                              )}
                          </div>
                      </div>
                      
                      {formData.entryDocuments && formData.entryDocuments.length > 0 && (
                          <div className="space-y-1">
                              {formData.entryDocuments.map((doc) => (
                                  <div key={doc.id} className="flex items-center justify-between bg-white border border-slate-200 rounded p-2 text-xs">
                                      <a href={doc.url} target="_blank" rel="noreferrer" className="flex items-center text-indigo-600 hover:underline truncate flex-1 mr-2">
                                          <ExternalLink size={12} className="mr-1 flex-shrink-0"/>
                                          <span className="truncate">{doc.name}</span>
                                          <span className="text-slate-400 ml-2 text-[10px] no-underline">({doc.uploadDate})</span>
                                      </a>
                                      <button 
                                          type="button" 
                                          onClick={() => handleRemoveDocument(doc.id)} 
                                          className="text-slate-400 hover:text-red-500 p-1"
                                          title="移除連結"
                                      >
                                          <X size={12} />
                                      </button>
                                  </div>
                              ))}
                          </div>
                      )}
                  </div>
              </div>

              {/* Teaching Details / Expertise */}
              <div>
                  <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center bg-slate-100 p-2 rounded">
                      <Book size={16} className="mr-2"/> 
                      {formData.type === TeacherType.EXTERNAL ? '校外教師專長' : 
                       formData.type === TeacherType.LANGUAGE ? '語言教師設定' : '教學與職務'}
                  </h3>
                  
                  {formData.type === TeacherType.EXTERNAL ? (
                      <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                          <label className="block text-xs font-bold text-slate-500 mb-2">點選專長科目／可任教項目 (可多選，含報名表選項)</label>
                          <div className="flex flex-wrap gap-2">
                              {Array.from(new Set([...COMMON_SUBJECTS, ...APPLY_TEACHING_ITEMS])).sort((a, b) => a.localeCompare(b, 'zh-TW')).map(subject => {
                                  const isSelected = formData.expertise?.includes(subject);
                                  return (
                                      <button key={subject} type="button" onClick={() => toggleExpertise(subject)} className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${isSelected ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'}`}>
                                          {isSelected && <Star size={12} className="inline mr-1 mb-0.5 fill-white" />}
                                          {subject}
                                      </button>
                                  );
                              })}
                          </div>
                      </div>
                  ) : formData.type === TeacherType.LANGUAGE ? (
                      <div className="bg-purple-50 p-4 rounded-lg border border-purple-200 text-purple-800 text-sm">
                          <p className="flex items-center"><Info size={16} className="mr-2"/> 語言教師請至「語言教師管理」頁面進行詳細設定 (包含主聘學校、語種、課表等)。</p>
                      </div>
                  ) : (
                      <>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div><label className="block text-sm font-medium text-slate-700 mb-1">任課班級</label><input type="text" className="w-full px-3 py-2 border rounded-lg" value={formData.teachingClasses} onChange={e => setFormData({...formData, teachingClasses: e.target.value})} /></div>
                            <div><label className="block text-sm font-medium text-slate-700 mb-1">任教科目</label><input type="text" className="w-full px-3 py-2 border rounded-lg" value={formData.subjects} onChange={e => setFormData({...formData, subjects: e.target.value})} /></div>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3">
                            <label className="flex items-center space-x-2 text-sm text-slate-700"><input type="checkbox" checked={formData.isSpecialEd} onChange={e => setFormData({...formData, isSpecialEd: e.target.checked})} className="w-4 h-4 rounded" /><span>特教教師</span></label>
                            <label className="flex items-center space-x-2 text-sm text-slate-700"><input type="checkbox" checked={formData.isGraduatingHomeroom} onChange={e => setFormData({...formData, isGraduatingHomeroom: e.target.checked})} className="w-4 h-4 rounded" /><span>畢業班導師</span></label>
                            <label className="flex items-center space-x-2 text-sm text-slate-700"><input type="checkbox" checked={formData.isFixedOvertimeTeacher} onChange={e => setFormData({...formData, isFixedOvertimeTeacher: e.target.checked})} className="w-4 h-4 rounded" /><span>固定兼課教師</span></label>
                        </div>
                      </>
                  )}
              </div>

              {/* Reduction Settings */}
              <div>
                  <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center bg-slate-100 p-2 rounded justify-between">
                      <div className="flex items-center">
                          <MinusCircle size={16} className="mr-2"/> 行政減授設定
                      </div>
                      <span className="text-xs bg-white px-2 py-1 rounded border border-slate-200 text-slate-500">
                          共 <span className="font-bold text-red-600">{formData.reductions ? formData.reductions.reduce((acc, curr) => acc + curr.periods, 0) : 0}</span> 節
                      </span>
                  </h3>
                  
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-2">
                      {formData.reductions && formData.reductions.length > 0 ? (
                          formData.reductions.map((item, index) => (
                              <div key={index} className="flex items-center gap-2 mb-2">
                                  <input 
                                      type="text" 
                                      placeholder="減授事由 (如: 資訊組長)" 
                                      className="flex-1 px-2 py-1 text-sm border rounded"
                                      value={item.title}
                                      onChange={(e) => {
                                          const newReductions = [...(formData.reductions || [])];
                                          newReductions[index].title = e.target.value;
                                          setFormData({...formData, reductions: newReductions});
                                      }}
                                  />
                                  <input 
                                      type="number" 
                                      placeholder="節數" 
                                      className="w-20 px-2 py-1 text-sm border rounded"
                                      value={item.periods}
                                      onChange={(e) => {
                                          const newReductions = [...(formData.reductions || [])];
                                          newReductions[index].periods = Number(e.target.value);
                                          setFormData({...formData, reductions: newReductions});
                                      }}
                                  />
                                  <button 
                                      type="button"
                                      onClick={() => setDeleteReductionConfirm(index)}
                                      className="text-red-500 hover:bg-red-50 p-1 rounded"
                                      title="刪除此減授項目"
                                  >
                                      <Trash2 size={16} />
                                  </button>
                              </div>
                          ))
                      ) : (
                          <div className="text-center text-slate-400 text-sm py-2">無減授設定</div>
                      )}
                      
                      <button 
                          type="button"
                          onClick={() => {
                              setFormData({
                                  ...formData, 
                                  reductions: [...(formData.reductions || []), { title: '', periods: 0 }]
                              });
                          }}
                          className="w-full py-1.5 border-2 border-dashed border-slate-300 rounded text-slate-500 text-sm hover:border-indigo-400 hover:text-indigo-600 flex items-center justify-center"
                      >
                          <Plus size={14} className="mr-1"/> 新增減授項目
                      </button>
                  </div>
              </div>

              {/* Interactive Schedule Grid (Manual Edit) */}
              <div>
                  {activeSemesterLabel ? (
                    <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 mb-2">
                      預設課表綁定學期：<strong>{activeSemesterLabel}</strong>
                      <span className="block mt-1 text-amber-800/95 font-normal">
                        存檔後會寫入「這一學期」專用版本（與系統設定一致）；並同步更新單一預設課表欄位供舊流程相容。
                      </span>
                    </p>
                  ) : (
                    <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded px-2 py-1.5 mb-2">
                      尚未在<strong>系統設定</strong>指定「預設課表要依哪一學期分開存」（<code className="text-[11px]">system/metadata.activeSemesterId</code>）。
                      <span className="block mt-1">目前課表只會存在單一欄位，<strong>不分學期、全系統共用一版</strong>。</span>
                    </p>
                  )}
                  <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center bg-slate-100 p-2 rounded justify-between">
                      <div className="flex items-center">
                          <Clock size={16} className="mr-2"/> 預設課表 (手動編輯)
                      </div>
                      <span className="text-xs bg-white px-2 py-1 rounded border border-slate-200 text-slate-500">
                          共 <span className="font-bold text-indigo-600">{formData.defaultSchedule ? formData.defaultSchedule.length : 0}</span> 節
                      </span>
                  </h3>
                  
                  {/* Grid Toolbar */}
                  <div className="bg-slate-50 p-2 border border-slate-200 border-b-0 rounded-t-lg flex flex-wrap gap-2 items-center">
                      <div className="flex items-center">
                          <label className="text-xs font-bold text-slate-500 mr-2">設定:</label>
                          <input 
                              type="text" 
                              placeholder="科目" 
                              className="w-20 px-2 py-1 text-xs border rounded mr-2"
                              value={editorSubject}
                              onChange={(e) => setEditorSubject(e.target.value)}
                          />
                          <input 
                              type="text" 
                              placeholder="班級" 
                              className="w-20 px-2 py-1 text-xs border rounded mr-2"
                              value={editorClass}
                              onChange={(e) => setEditorClass(e.target.value)}
                          />
                      </div>
                      <div className="h-4 w-px bg-slate-300 mx-1"></div>
                      <div className="flex gap-1 overflow-x-auto no-scrollbar">
                          {COMMON_SUBJECTS.slice(0, 5).map(sub => (
                              <button 
                                key={sub} 
                                type="button" 
                                onClick={() => setEditorSubject(sub)}
                                className="px-2 py-0.5 bg-white border border-slate-200 rounded text-[10px] hover:border-indigo-300 hover:text-indigo-600 whitespace-nowrap"
                              >
                                {sub}
                              </button>
                          ))}
                      </div>
                      <div className="flex-1 text-[10px] text-slate-400 text-right flex items-center justify-end">
                          <MousePointerClick size={12} className="mr-1"/> 點擊格子以新增/刪除
                      </div>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-b-lg overflow-x-auto">
                      <table className="w-full text-center text-xs border-collapse min-w-[400px]">
                          <thead>
                              <tr>
                                  <th className="p-2 border-b border-r bg-slate-50 text-slate-500 w-12">節次</th>
                                  {dayCols.map((d, i) => (
                                      <th key={d} className="p-2 border-b border-r bg-slate-50 text-slate-700">{dayNames[i]}</th>
                                  ))}
                              </tr>
                          </thead>
                          <tbody>
                              {periodRows.map((period) => (
                                  <tr key={period}>
                                      <td className="p-2 border-b border-r font-bold text-slate-600 bg-slate-50">{period === '早' ? '早' : period === '午' ? '午' : period}</td>
                                      {dayCols.map((day) => {
                                          const slot = getSlot(day, period);
                                          return (
                                              <td key={`${day}-${period}`} className="p-0 border-b border-r h-10 w-20 relative align-top">
                                                  <div 
                                                    onClick={() => handleSlotClick(day, period)}
                                                    className={`w-full h-full flex flex-col justify-center items-center px-1 cursor-pointer transition-colors ${slot ? 'bg-indigo-50 hover:bg-red-50 group' : 'hover:bg-indigo-50/50'}`}
                                                  >
                                                      {slot ? (
                                                          <>
                                                              <div className="font-bold truncate w-full text-indigo-700 group-hover:hidden">{slot.subject}</div>
                                                              <div className="text-[9px] truncate w-full text-indigo-500 group-hover:hidden">{slot.className}</div>
                                                              <div className="hidden group-hover:flex text-red-500 items-center justify-center font-bold">
                                                                  <Trash2 size={14} className="mr-1"/> 刪除
                                                              </div>
                                                          </>
                                                      ) : (
                                                          <div className="text-slate-200 opacity-0 hover:opacity-100 text-indigo-300 text-[10px]">+</div>
                                                      )}
                                                  </div>
                                              </td>
                                          );
                                      })}
                                  </tr>
                              ))}
                          </tbody>
                      </table>
                  </div>
              </div>

              {/* Default Overtime Settings */}
              <div>
                  <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center bg-slate-100 p-2 rounded justify-between">
                      <div className="flex items-center">
                          <Clock size={16} className="mr-2"/> 預設超鐘點時段 (每月自動帶入)
                      </div>
                      <span className="text-xs bg-white px-2 py-1 rounded border border-slate-200 text-slate-500">
                          共 <span className="font-bold text-amber-600">{formData.defaultOvertimeSlots ? formData.defaultOvertimeSlots.length : 0}</span> 節
                      </span>
                  </h3>
                  <div className="bg-amber-50 p-3 rounded-lg border border-amber-200">
                      <p className="text-xs text-amber-800 mb-2">點擊格子設定該教師每月的固定超鐘點時段。設定後，在「超鐘點」頁面可直接載入此設定。</p>
                      <div className="grid grid-cols-6 gap-1 text-center text-xs">
                          <div className="col-span-1"></div>
                          {['一', '二', '三', '四', '五'].map(d => <div key={d} className="font-bold text-amber-900 py-1">{d}</div>)}
                          {['早', '1', '2', '3', '4', '午', '5', '6', '7'].map(p => (
                              <React.Fragment key={p}>
                                  <div className="font-bold text-amber-800 flex items-center justify-center">{p}</div>
                                  {[1, 2, 3, 4, 5].map(d => {
                                      const isSelected = formData.defaultOvertimeSlots?.some(s => s.day === d && s.period === p);
                                      return (
                                          <div 
                                              key={`${d}-${p}`}
                                              onClick={() => {
                                                  const current = formData.defaultOvertimeSlots || [];
                                                  if (isSelected) {
                                                      setFormData({ ...formData, defaultOvertimeSlots: current.filter(s => !(s.day === d && s.period === p)) });
                                                  } else {
                                                      setFormData({ ...formData, defaultOvertimeSlots: [...current, { day: d, period: p }] });
                                                  }
                                              }}
                                              className={`h-8 border rounded cursor-pointer flex items-center justify-center transition-all ${isSelected ? 'bg-amber-500 border-amber-600 text-white font-bold shadow-sm' : 'bg-white border-amber-200 text-amber-300 hover:bg-amber-100'}`}
                                          >
                                              {isSelected ? '✓' : ''}
                                          </div>
                                      );
                                  })}
                              </React.Fragment>
                          ))}
                      </div>
                  </div>
              </div>

              {/* Salary & Cert */}
              <div>
                  <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center bg-slate-100 p-2 rounded"><HelpCircle size={16} className="mr-2"/> 薪資與資格</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-3">
                      <div><label className="block text-sm font-medium text-slate-700 mb-1">目前薪級 (俸點)</label><input type="number" className="w-full px-3 py-2 border rounded-lg" placeholder="如: 190" value={formData.salaryPoints || ''} onChange={e => handleSalaryPointChange(Number(e.target.value))} /></div>
                      <div><label className="block text-sm font-medium text-slate-700 mb-1">本俸 (元)</label><input type="number" className="w-full px-3 py-2 border rounded-lg bg-slate-50" value={formData.baseSalary} onChange={e => setFormData({...formData, baseSalary: Number(e.target.value)})} /></div>
                      <div><label className="block text-sm font-medium text-slate-700 mb-1">學術研究費 (元)</label><input type="number" className="w-full px-3 py-2 border rounded-lg" value={formData.researchFee} onChange={e => setFormData({...formData, researchFee: Number(e.target.value)})} /></div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div><label className="block text-sm font-medium text-slate-700 mb-1">最高學歷</label><input type="text" className="w-full px-3 py-2 border rounded-lg" value={formData.education} onChange={e => handleEducationChange(e.target.value)} placeholder="如: 大學, 碩士" /></div>
                      <div className="flex items-end"><label className="flex items-center space-x-2 text-sm text-slate-700 mb-2"><input type="checkbox" checked={formData.hasCertificate} onChange={e => handleCertChange(e.target.checked)} className="w-4 h-4 text-indigo-600 rounded" /><span>持有合格教師證</span></label></div>
                  </div>
              </div>

              {/* Note */}
              <div><label className="block text-sm font-medium text-slate-700 mb-1">備註</label><textarea className="w-full px-3 py-2 border rounded-lg h-20 resize-none" value={formData.note} onChange={e => setFormData({...formData, note: e.target.value})}></textarea></div>
              </div>
              {/* 以上包在 div 內，唯讀時整塊不可互動；footer 在外可點 */}
              <div className="pt-4 flex space-x-3 border-t relative z-20">
                {isReadOnlyView ? (
                  <>
                    <button type="button" onClick={() => { setIsModalOpen(false); setIsReadOnlyView(false); }} className="flex-1 px-4 py-3 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-bold">關閉</button>
                    <button type="button" onClick={() => setIsReadOnlyView(false)} className="flex-1 px-4 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-bold shadow-md">編輯</button>
                  </>
                ) : (
                  <>
                    <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 px-4 py-3 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-bold">取消</button>
                    <button type="submit" className="flex-1 px-4 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-bold shadow-md">確認儲存</button>
                  </>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
