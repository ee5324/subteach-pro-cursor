import React, { useState, useEffect, useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';
import { Teacher, TeacherType, LanguagePayroll, LanguagePayrollEntry } from '../types';
import { Plus, Save, Trash2, FileDown, Edit, Search, UserPlus, Calendar, Calculator, CheckSquare, Square, CloudUpload, Loader2, Printer } from 'lucide-react';
import Modal from '../components/Modal';
import SearchableSelect from '../components/SearchableSelect';
import InstructionPanel, { CollapsibleItem } from '../components/InstructionPanel';
import { getDaysInMonth, sortPeriods } from '../utils/calculations';
import { callGasApi } from '../utils/api';

const LanguageTeachers: React.FC = () => {
  const { teachers, updateTeacher, addTeacher, languagePayrolls, addLanguagePayroll, updateLanguagePayroll, deleteLanguagePayroll, settings, holidays } = useAppStore();
  const [activeTab, setActiveTab] = useState<'teachers' | 'payroll'>('payroll');
  
  // Message Modal State
  const [messageModal, setMessageModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: 'success' | 'error' | 'warning' | 'info';
    mode: 'alert' | 'confirm';
    onConfirm?: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    type: 'info',
    mode: 'alert'
  });

  const showMessage = (props: Partial<typeof messageModal>) => {
      setMessageModal({
          isOpen: true,
          title: props.title || '訊息',
          message: props.message || '',
          type: props.type || 'info',
          mode: props.mode || 'alert',
          onConfirm: props.onConfirm
      });
  };

  const closeMessage = () => setMessageModal(prev => ({ ...prev, isOpen: false }));

  // Teacher Management State
  const [isTeacherModalOpen, setIsTeacherModalOpen] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Teacher Schedule State (in Modal)
  const [schedule, setSchedule] = useState<{dayOfWeek: number, periods: string[], isSixthGrade?: boolean}[]>([]);

  // Payroll Management State
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>('');
  const [currentPayroll, setCurrentPayroll] = useState<LanguagePayroll | null>(null);

  // Batch Export State
  const [selectedPayrollIds, setSelectedPayrollIds] = useState<Set<string>>(new Set());
  const [isExporting, setIsExporting] = useState(false);

  // Filtered Teachers (Exclude Hakka teachers as they are managed in HakkaSalary)
  const languageTeachers = useMemo(() => teachers.filter(t => 
    (t.type === TeacherType.LANGUAGE || (t.type === TeacherType.EXTERNAL && t.languageSpecialty)) &&
    !(t.languageSpecialty?.includes('客'))
  ), [teachers]);

  // Unique Lists for Dropdowns
  const uniqueHostSchools = useMemo(() => Array.from(new Set(teachers.map(t => t.hostSchool).filter(Boolean) as string[])), [teachers]);
  const uniqueLanguages = useMemo(() => Array.from(new Set(teachers.map(t => t.languageSpecialty).filter(Boolean) as string[])), [teachers]);

  // Helper for default rate
  const getDefaultRate = (language: string) => {
      return language.includes('族') ? 360 : 336;
  };

  // Refactored Teacher Form State
  const [formHostSchool, setFormHostSchool] = useState('');
  const [formLanguage, setFormLanguage] = useState('');
  const [formCategory, setFormCategory] = useState<'Indigenous' | 'NewImmigrant' | 'IndigenousFullTime' | ''>('');
  const [formJobTitle, setFormJobTitle] = useState('');

  // Initialize Schedule when editing teacher
  useEffect(() => {
    if (editingTeacher) {
      setSchedule(editingTeacher.languageSchedule || []);
      setFormHostSchool(editingTeacher.hostSchool || '');
      setFormLanguage(editingTeacher.languageSpecialty || '');
      setFormCategory(editingTeacher.teacherCategory || '');
      setFormJobTitle(editingTeacher.jobTitle || '');
    } else {
      setSchedule([]);
      setFormHostSchool('');
      setFormLanguage('');
      setFormCategory('');
      setFormJobTitle('');
    }
  }, [editingTeacher]);

  // Update default hourly rate when language changes in form (if adding new teacher)
  useEffect(() => {
      if (!editingTeacher && formLanguage) {
          // Auto-detect category if possible
          if (formLanguage.includes('族')) setFormCategory('Indigenous');
          else if (formLanguage.includes('語')) setFormCategory('NewImmigrant');
      }
  }, [formLanguage, editingTeacher]);

  const [formHourlyRate, setFormHourlyRate] = useState(400);

  useEffect(() => {
      if (editingTeacher) {
          setFormHourlyRate(editingTeacher.defaultHourlyRate || 400);
      } else {
          setFormHourlyRate(getDefaultRate(formLanguage));
      }
  }, [editingTeacher, formLanguage]);


  const handleSaveTeacherWithState = (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);

    const newTeacher: Teacher = {
      id: editingTeacher?.id || crypto.randomUUID(),
      name: formData.get('name') as string,
      type: editingTeacher?.type || TeacherType.LANGUAGE,
      hasCertificate: false, 
      baseSalary: 0,
      researchFee: 0,
      isHomeroom: false,
      isRetired: false,
      isSpecialEd: false,
      isGraduatingHomeroom: false,
      
      // Language Specifics
      languageSpecialty: formLanguage,
      hostSchool: formHostSchool,
      teacherCategory: formCategory as any,
      jobTitle: formJobTitle,
      defaultHourlyRate: formHourlyRate || getDefaultRate(formLanguage),
      phone: formData.get('phone') as string,
      note: formData.get('note') as string,
      languageSchedule: schedule,
    };

    if (editingTeacher) {
      updateTeacher({ ...editingTeacher, ...newTeacher });
    } else {
      addTeacher(newTeacher);
    }
    setIsTeacherModalOpen(false);
    setEditingTeacher(null);
  };

  const toggleScheduleSlot = (day: number, period: string) => {
      setSchedule(prev => {
          const existingSlotIndex = prev.findIndex(s => s.dayOfWeek === day && s.periods.includes(period));
          let newSchedule = [...prev];
          
          if (existingSlotIndex !== -1) {
              // Remove it
              const existingSlot = { ...newSchedule[existingSlotIndex] };
              existingSlot.periods = existingSlot.periods.filter(p => p !== period);
              
              if (existingSlot.periods.length === 0) {
                  newSchedule.splice(existingSlotIndex, 1);
              } else {
                  newSchedule[existingSlotIndex] = existingSlot;
              }
          } else {
              // Add it (default to normal)
              const normalSlotIndex = newSchedule.findIndex(s => s.dayOfWeek === day && !s.isSixthGrade);
              if (normalSlotIndex !== -1) {
                  const slot = { ...newSchedule[normalSlotIndex] };
                  slot.periods = [...slot.periods, period].sort();
                  newSchedule[normalSlotIndex] = slot;
              } else {
                  newSchedule.push({
                      dayOfWeek: day,
                      periods: [period],
                      isSixthGrade: false
                  });
              }
          }
          
          return newSchedule;
      });
  };

  const toggleSixthGrade = (day: number, period: string, isSixth: boolean) => {
      setSchedule(prev => {
          let newSchedule = [...prev];
          const currentIndex = newSchedule.findIndex(s => s.dayOfWeek === day && s.periods.includes(period));
          if (currentIndex === -1) return prev; // Should not happen

          const currentSlot = { ...newSchedule[currentIndex] };
          
          // Remove period from current slot
          currentSlot.periods = currentSlot.periods.filter(p => p !== period);
          if (currentSlot.periods.length === 0) {
              newSchedule.splice(currentIndex, 1);
          } else {
              newSchedule[currentIndex] = currentSlot;
          }

          // Add to the target slot
          const targetIndex = newSchedule.findIndex(s => s.dayOfWeek === day && !!s.isSixthGrade === isSixth);
          if (targetIndex !== -1) {
              const targetSlot = { ...newSchedule[targetIndex] };
              targetSlot.periods = [...targetSlot.periods, period].sort();
              newSchedule[targetIndex] = targetSlot;
          } else {
              newSchedule.push({ dayOfWeek: day, periods: [period], isSixthGrade: isSixth });
          }

          return newSchedule;
      });
  };

  const allSelectedPeriods = useMemo(() => {
      const periods: { day: number, dayName: string, period: string, isSixthGrade: boolean }[] = [];
      const dayNames = ['週一', '週二', '週三', '週四', '週五'];
      const periodOrder = ['早', '1', '2', '3', '4', '午', '5', '6', '7'];
      
      schedule.forEach(slot => {
          slot.periods.forEach(p => {
              periods.push({
                  day: slot.dayOfWeek,
                  dayName: dayNames[slot.dayOfWeek - 1],
                  period: p,
                  isSixthGrade: !!slot.isSixthGrade
              });
          });
      });
      
      // Sort by day then period
      periods.sort((a, b) => {
          if (a.day !== b.day) return a.day - b.day;
          return periodOrder.indexOf(a.period) - periodOrder.indexOf(b.period);
      });
      
      return periods;
  }, [schedule]);

  // --- Payroll Management ---

  useEffect(() => {
    if (selectedTeacherId && selectedMonth) {
      const existing = languagePayrolls.find(p => p.teacherId === selectedTeacherId && p.yearMonth === selectedMonth);
      if (existing) {
        setCurrentPayroll(existing);
      } else {
        // Create draft
        const teacher = teachers.find(t => t.id === selectedTeacherId);
        setCurrentPayroll({
          id: crypto.randomUUID(),
          teacherId: selectedTeacherId,
          yearMonth: selectedMonth,
          hostSchool: teacher?.hostSchool || '',
          teachingSchool: '高雄市楠梓區加昌國小', 
          language: teacher?.languageSpecialty || '',
          entries: [],
          updatedAt: Date.now()
        });
      }
    } else {
      setCurrentPayroll(null);
    }
  }, [selectedTeacherId, selectedMonth, languagePayrolls, teachers]);

  const handleAutoCalculate = () => {
    if (!currentPayroll || !selectedTeacherId || !selectedMonth) return;
    
    const teacher = teachers.find(t => t.id === selectedTeacherId);
    if (!teacher || !teacher.languageSchedule || teacher.languageSchedule.length === 0) {
        showMessage({ title: '無法計算', message: '該教師尚未設定上課時間，請先至「教師設定」中設定。', type: 'warning' });
        return;
    }

    const daysInMonth = getDaysInMonth(`${selectedMonth}-01`);
    
    const newEntries: LanguagePayrollEntry[] = [];
    
    // Semester Check
    const semStart = settings.semesterStart ? new Date(settings.semesterStart) : null;
    const semEnd = settings.semesterEnd ? new Date(settings.semesterEnd) : null;
    const graduationDate = settings.graduationDate ? new Date(settings.graduationDate) : null;

    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${selectedMonth}-${String(d).padStart(2, '0')}`;
        const dateObj = new Date(dateStr);
        const dayOfWeek = dateObj.getDay(); // 0=Sun, 1=Mon...

        // Check Semester Range
        if (semStart && dateObj < semStart) continue;
        if (semEnd && dateObj > semEnd) continue;

        // Check Holidays (if available)
        if (holidays.includes(dateStr)) continue;

        // Check Schedule
        const daySchedules = teacher.languageSchedule.filter(s => s.dayOfWeek === dayOfWeek);
        if (daySchedules.length > 0) {
            const periods: string[] = [];
            daySchedules.forEach(slot => {
                // Check graduation date for 6th grade slots
                if (slot.isSixthGrade && graduationDate && dateObj > graduationDate) {
                    return;
                }
                periods.push(...slot.periods);
            });

            if (periods.length > 0) {
                const rate = teacher.defaultHourlyRate || getDefaultRate(teacher.languageSpecialty || '');
                newEntries.push({
                    id: crypto.randomUUID(),
                    date: dateStr,
                    periodLabels: sortPeriods(periods).join('、'),
                    periodCount: periods.length,
                    hourlyRate: rate,
                    totalAmount: rate * periods.length
                });
            }
        }
    }

    if (newEntries.length === 0) {
        showMessage({ title: '無上課日', message: '在此月份範圍內未找到符合的上課日 (可能因學期起訖或假日)。', type: 'info' });
        return;
    }

    showMessage({
        title: '確認覆蓋',
        message: `計算出 ${newEntries.length} 筆上課紀錄，是否覆蓋現有紀錄？`,
        type: 'warning',
        mode: 'confirm',
        onConfirm: () => {
            setCurrentPayroll({ ...currentPayroll, entries: newEntries });
            showMessage({ title: '計算完成', message: `已自動產生 ${newEntries.length} 筆紀錄。`, type: 'success' });
        }
    });
  };

  const handleAddEntry = () => {
    if (!currentPayroll) return;
    const teacher = teachers.find(t => t.id === selectedTeacherId);
    const rate = teacher?.defaultHourlyRate || getDefaultRate(teacher?.languageSpecialty || '');
    const newEntry: LanguagePayrollEntry = {
      id: crypto.randomUUID(),
      date: `${selectedMonth}-01`,
      periodLabels: '',
      periodCount: 1,
      hourlyRate: rate,
      totalAmount: rate
    };
    
    setCurrentPayroll({
      ...currentPayroll,
      entries: [...currentPayroll.entries, newEntry]
    });
  };

  const handleUpdateEntry = (id: string, field: keyof LanguagePayrollEntry, value: any) => {
    if (!currentPayroll) return;
    
    const updatedEntries = currentPayroll.entries.map(entry => {
      if (entry.id === id) {
        const updated = { ...entry, [field]: value };
        // Auto-calc total
        if (field === 'periodCount' || field === 'hourlyRate') {
            updated.totalAmount = updated.periodCount * updated.hourlyRate;
        }
        return updated;
      }
      return entry;
    });

    setCurrentPayroll({ ...currentPayroll, entries: updatedEntries });
  };

  const [deleteEntryConfirm, setDeleteEntryConfirm] = useState<string | null>(null);

  const handleDeleteEntry = (id: string) => {
    if (!currentPayroll) return;
    setDeleteEntryConfirm(id);
  };

  const confirmDeleteEntry = () => {
    if (!currentPayroll || !deleteEntryConfirm) return;
    setCurrentPayroll({
      ...currentPayroll,
      entries: currentPayroll.entries.filter(e => e.id !== deleteEntryConfirm)
    });
    setDeleteEntryConfirm(null);
  };

  const handleSavePayroll = () => {
    if (!currentPayroll) return;
    
    const existingIndex = languagePayrolls.findIndex(p => p.id === currentPayroll.id);
    if (existingIndex >= 0) {
      updateLanguagePayroll(currentPayroll);
    } else {
      addLanguagePayroll(currentPayroll);
    }
    showMessage({ title: '儲存成功', message: '清冊已儲存至本地資料庫。', type: 'success' });
  };

  // --- Batch Export ---
  
  const payrollsInMonth = useMemo(() => {
      return languagePayrolls.filter(p => p.yearMonth === selectedMonth);
  }, [languagePayrolls, selectedMonth]);

  const togglePayrollSelection = (id: string) => {
      const newSet = new Set(selectedPayrollIds);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      setSelectedPayrollIds(newSet);
  };

  const handleBatchExport = async () => {
      if (selectedPayrollIds.size === 0) {
          showMessage({ title: '未選取', message: '請先勾選要匯出的清冊', type: 'warning' });
          return;
      }
      
      const targetPayrolls = languagePayrolls.filter(p => selectedPayrollIds.has(p.id));
      const exportData = targetPayrolls.map(p => {
          const teacher = teachers.find(t => t.id === p.teacherId);
          return {
              ...p,
              teacherName: teacher?.name,
              teacherCategory: teacher?.teacherCategory,
              teacherIdNumber: 'A123456789',
              teacherAddress: 'Address...',
              teacherBank: 'Bank...',
          };
      });

      setIsExporting(true);
      try {
          const targetUrl = settings.gasWebAppUrl;
          if (!targetUrl) throw new Error('未設定 GAS URL');
          
          await callGasApi(targetUrl, 'EXPORT_LANGUAGE_PAYROLL', {
              month: selectedMonth,
              payrolls: exportData,
              templateName: '語言教師清冊範本',
              templateSpreadsheetId: '1k0t09n4JZJSuQu8lq3bPlqvRjQZ24Fp4bD494UXlPKE'
          }).then(res => {
              if (res.data && res.data.url) {
                  window.open(res.data.url, '_blank');
              }
          });
          showMessage({ title: '匯出成功', message: '已匯出至 Google Sheet。', type: 'success' });
      } catch (e: any) {
          const msg = e.message || String(e);
          if (msg.includes('找不到範本檔案')) {
             showMessage({ 
                 title: '範本讀取失敗', 
                 message: `後端程式 (GAS) 無法找到範本。\n\n原因：目前的 GAS 程式可能僅支援「依檔名搜尋檔案」，尚未支援「依 ID 讀取工作表」。\n\n請更新您的 Google Apps Script 程式碼以支援 templateSpreadsheetId 參數，並讀取指定 Spreadsheet 中的工作表。`, 
                 type: 'error' 
             });
          } else {
             showMessage({ title: '匯出失敗', message: msg, type: 'error' });
          }
      } finally {
          setIsExporting(false);
      }
  };

  const handleRenderPrint = () => {
      if (selectedPayrollIds.size === 0) {
          showMessage({ title: '未選取', message: '請先勾選要列印的清冊', type: 'warning' });
          return;
      }

      const escapeHtml = (value: string) =>
        value
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');

      const targetPayrolls = languagePayrolls.filter(p => selectedPayrollIds.has(p.id));
      const monthDate = new Date(`${selectedMonth}-01`);
      const rocYear = monthDate.getFullYear() - 1911;
      const monthNum = monthDate.getMonth() + 1;

      const pagesHtml = targetPayrolls.map((payroll) => {
          const teacher = teachers.find(t => t.id === payroll.teacherId);
          const teacherName = teacher?.name || '未命名教師';
          const language = payroll.language || teacher?.languageSpecialty || '';
          const isIndigenous = teacher?.teacherCategory === 'Indigenous' || language.includes('族');
          const title = isIndigenous
            ? '表2：國中小原住民語文教學支援老師鐘點費印領清冊'
            : '表5：國中、小新住民語文教學支援老師鐘點費印領清冊';
          const languageLabel = isIndigenous ? '原住民語別' : '新住民語別';

          const sortedEntries = [...(payroll.entries || [])].sort((a, b) => a.date.localeCompare(b.date));
          const rowHtml = sortedEntries.length > 0
            ? sortedEntries.map((entry, idx) => {
                const lessonText = `${entry.date} 星期${['日', '一', '二', '三', '四', '五', '六'][new Date(entry.date).getDay()]}\n第${entry.periodLabels || ''}節`;
                return `
                  <tr>
                    <td>${idx + 1}</td>
                    <td class="class-time">${escapeHtml(lessonText)}</td>
                    <td>${entry.periodCount}</td>
                    <td>${entry.hourlyRate}</td>
                    <td>${entry.totalAmount}</td>
                    <td></td>
                  </tr>
                `;
              }).join('')
            : `
              <tr>
                <td>1</td>
                <td class="class-time"></td>
                <td>0</td>
                <td>0</td>
                <td>0</td>
                <td></td>
              </tr>
            `;

          const totalPeriods = sortedEntries.reduce((sum, item) => sum + item.periodCount, 0);
          const totalAmount = sortedEntries.reduce((sum, item) => sum + item.totalAmount, 0);

          return `
            <section class="page">
              <div class="inner">
                <h1>${escapeHtml(title)}</h1>
                <h2>【從聘學校按月填寫】</h2>
                <div class="meta-row">上課月份：${rocYear}年 ${monthNum} 月</div>
                <div class="meta-row">所屬主聘學校：${escapeHtml(payroll.hostSchool || '')}</div>
                <div class="meta-row">上課學校名稱：${escapeHtml(payroll.teachingSchool || '')}</div>
                <div class="meta-inline">
                  <span>${languageLabel}：${escapeHtml(language)}</span>
                  <span>教支老師姓名：${escapeHtml(teacherName)}</span>
                </div>

                <table>
                  <thead>
                    <tr>
                      <th style="width: 8%;">編號</th>
                      <th style="width: 36%;">上課時間</th>
                      <th style="width: 10%;">節數</th>
                      <th style="width: 18%;">鐘點費單價</th>
                      <th style="width: 14%;">合計</th>
                      <th style="width: 14%;">上課老師簽章</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${rowHtml}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colspan="2" class="center"><b>總計</b></td>
                      <td>${totalPeriods} 節</td>
                      <td></td>
                      <td>${totalAmount} 元</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>

                <div class="notes">●請各校按每月實際上課情形核實，紙本核章後，於每月3日前公文交換或郵寄至主聘學校，以利核計薪資。</div>
                <div class="notes">●國小族語每節360元、國中族語每節400元。</div>

                <table class="sign-table" aria-label="核章欄">
                  <tr>
                    <td>承辦人：</td>
                    <td>教務主任：</td>
                    <td>會計單位：</td>
                    <td>校長：</td>
                  </tr>
                </table>
              </div>
            </section>
          `;
      });

      const printHtml = `
        <!doctype html>
        <html lang="zh-Hant">
          <head>
            <meta charset="utf-8" />
            <title>語言教師清冊 A4 列印</title>
            <style>
              @page { size: A4 portrait; margin: 8mm 10mm; }
              body { margin: 0; background: #fff; font-family: "DFKai-SB", "KaiTi", "PMingLiU", "Microsoft JhengHei", serif; color: #000; }
              .page { width: 100%; min-height: calc(297mm - 16mm); page-break-after: always; }
              .page:last-child { page-break-after: auto; }
              .inner { width: 186mm; margin: 8mm auto 0 auto; }
              h1 { margin: 0; text-align: center; font-size: 16px; line-height: 1.2; }
              h2 { margin: 0 0 8px 0; text-align: center; font-size: 14px; line-height: 1.1; }
              .meta-row { font-size: 15px; line-height: 1.25; margin: 1px 0; }
              .meta-inline { display: flex; justify-content: space-between; gap: 12px; font-size: 15px; margin: 1px 0 4px 0; }
              table { width: 100%; border-collapse: collapse; table-layout: fixed; }
              th, td { border: 1px solid #000; font-size: 14px; padding: 1px 3px; text-align: center; vertical-align: middle; line-height: 1.2; }
              thead th { font-weight: 600; }
              .class-time { text-align: left; white-space: pre-line; line-height: 1.15; }
              tbody tr { height: 30px; }
              tfoot tr { height: 24px; }
              .center { text-align: center; }
              .notes { font-size: 12px; margin-top: 4px; line-height: 1.25; }
              /* 四欄等寬，與常見紙本清冊「整列均分」一致，避免 flex+gap 造成右側大片空白 */
              .sign-table { width: 100%; margin-top: 16px; border-collapse: collapse; table-layout: fixed; font-size: 16px; }
              .sign-table td { width: 25%; border: none; padding: 8px 6px 0 0; text-align: left; vertical-align: bottom; line-height: 1.3; }
            </style>
          </head>
          <body>
            ${pagesHtml.join('')}
            <script>
              window.onload = function () { window.print(); };
            </script>
          </body>
        </html>
      `;

      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        showMessage({ title: '列印失敗', message: '瀏覽器已阻擋彈出視窗，請允許彈出視窗後再試一次。', type: 'error' });
        return;
      }
      printWindow.document.open();
      printWindow.document.write(printHtml);
      printWindow.document.close();
      showMessage({ title: '列印頁已開啟', message: '已開啟 A4 渲染列印頁（每位老師一頁）。', type: 'success' });
  };

  // Calculate Total
  const totalAmount = currentPayroll?.entries.reduce((sum, entry) => sum + entry.totalAmount, 0) || 0;
  const totalPeriods = currentPayroll?.entries.reduce((sum, entry) => sum + entry.periodCount, 0) || 0;

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">原住民族語教師管理</h1>
          <p className="text-slate-500 mt-1">管理語言教師資料與薪資印領清冊</p>
        </div>
        <div className="flex space-x-2">
           <button 
             onClick={() => setActiveTab('payroll')}
             className={`px-4 py-2 rounded-lg font-medium transition-colors ${activeTab === 'payroll' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
           >
             薪資清冊
           </button>
           <button 
             onClick={() => setActiveTab('teachers')}
             className={`px-4 py-2 rounded-lg font-medium transition-colors ${activeTab === 'teachers' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
           >
             教師設定
           </button>
        </div>
      </div>

      <InstructionPanel title="使用說明：原住民族語教師管理">
        <div className="space-y-1">
          <CollapsibleItem title="教師基本設定">
            <p>請先至「教師設定」分頁新增語言教師資料。設定「每週上課時間」後，系統可自動計算每月應發節數與金額。預設鐘點費：族語 360 元/節，新住民語 336 元/節 (可依實際情況手動修改)。</p>
          </CollapsibleItem>
          <CollapsibleItem title="自動計算薪資">
            <p>在「薪資清冊」分頁選擇月份與教師後，點擊「自動計算本月節數」。系統會依據該師的固定課表，並扣除國定假日、補假與畢業典禮後日期，自動產生代課明細。</p>
          </CollapsibleItem>
          <CollapsibleItem title="批次匯出清冊">
            <p>勾選多筆已儲存的清冊後，點擊「匯出選取清冊」。系統會將資料填入指定的 Google Sheet 範本中，方便您直接列印核銷。</p>
          </CollapsibleItem>
          <CollapsibleItem title="資料同步問題">
            <p>若無法儲存授課語種，請檢查 Google Sheet 資料庫中是否有「languageSpecialty」或「授課語種」欄位。若無，請手動新增該欄位後再試。</p>
          </CollapsibleItem>
        </div>
      </InstructionPanel>

      {/* Message Modal */}
      <Modal
        isOpen={messageModal.isOpen}
        onClose={closeMessage}
        onConfirm={messageModal.onConfirm}
        title={messageModal.title}
        message={messageModal.message}
        type={messageModal.type}
        mode={messageModal.mode}
      />

      <Modal
        isOpen={!!deleteEntryConfirm}
        onClose={() => setDeleteEntryConfirm(null)}
        onConfirm={confirmDeleteEntry}
        title="確認刪除此筆上課紀錄"
        message="確定要刪除此筆紀錄嗎？"
        type="warning"
        mode="confirm"
        confirmText="刪除"
        cancelText="取消"
      />

      {activeTab === 'teachers' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex justify-between mb-6">
             <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  type="text" 
                  placeholder="搜尋教師..." 
                  className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
             </div>
             <button 
               onClick={() => { setEditingTeacher(null); setIsTeacherModalOpen(true); }}
               className="flex items-center bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
             >
               <UserPlus size={18} className="mr-2" /> 新增語言教師
             </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 text-sm">
                  <th className="py-3 px-4">姓名</th>
                  <th className="py-3 px-4">類別</th>
                  <th className="py-3 px-4">語種</th>
                  <th className="py-3 px-4">主聘學校</th>
                  <th className="py-3 px-4">預設鐘點費</th>
                  <th className="py-3 px-4">每週節數</th>
                  <th className="py-3 px-4">電話</th>
                  <th className="py-3 px-4 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {languageTeachers.filter(t => t.name.includes(searchTerm)).map(teacher => (
                  <tr key={teacher.id} className="border-b border-slate-200 hover:bg-slate-50">
                    <td className="py-3 px-4 font-medium text-slate-800">{teacher.name}</td>
                    <td className="py-3 px-4 text-slate-600">
                      {teacher.teacherCategory === 'Indigenous' ? '原住民' : 
                       teacher.teacherCategory === 'NewImmigrant' ? '新住民' : '-'}
                    </td>
                    <td className="py-3 px-4 text-slate-600">{teacher.languageSpecialty || '-'}</td>
                    <td className="py-3 px-4 text-slate-600">{teacher.hostSchool || '-'}</td>
                    <td className="py-3 px-4 text-slate-600">${teacher.defaultHourlyRate}</td>
                    <td className="py-3 px-4 text-slate-600">
                        {teacher.languageSchedule ? teacher.languageSchedule.reduce((acc, s) => acc + s.periods.length, 0) : 0} 節
                    </td>
                    <td className="py-3 px-4 text-slate-600">{teacher.phone || '-'}</td>
                    <td className="py-3 px-4 text-right">
                      <button 
                        onClick={() => { setEditingTeacher(teacher); setIsTeacherModalOpen(true); }}
                        className="text-indigo-600 hover:text-indigo-800 mr-3"
                      >
                        <Edit size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
                {languageTeachers.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">尚無語言教師資料</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'payroll' && (
        <div className="space-y-6">
          {/* Controls */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <div className="flex flex-wrap gap-4 items-end mb-6">
                <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">月份</label>
                <input 
                    type="month" 
                    value={selectedMonth}
                    onChange={e => setSelectedMonth(e.target.value)}
                    className="px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                </div>
                <div className="flex-1 min-w-[200px]">
                <label className="block text-sm font-medium text-slate-700 mb-1">編輯單一教師</label>
                <select 
                    value={selectedTeacherId}
                    onChange={e => setSelectedTeacherId(e.target.value)}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                    <option value="">請選擇教師...</option>
                    {languageTeachers.map(t => (
                    <option key={t.id} value={t.id}>{t.name} ({t.languageSpecialty})</option>
                    ))}
                </select>
                </div>
            </div>
            
            {/* Batch Export Section */}
            <div className="border-t border-slate-200 pt-4">
                <h3 className="text-sm font-bold text-slate-600 mb-3">批次匯出清冊 ({selectedMonth})</h3>
                <div className="flex flex-wrap gap-2 mb-3">
                    {payrollsInMonth.length > 0 ? payrollsInMonth.map(p => {
                        const t = teachers.find(tea => tea.id === p.teacherId);
                        const isSelected = selectedPayrollIds.has(p.id);
                        return (
                            <div 
                                key={p.id} 
                                onClick={() => togglePayrollSelection(p.id)}
                                className={`
                                    cursor-pointer px-3 py-1.5 rounded-full border text-sm flex items-center space-x-2 transition-colors
                                    ${isSelected ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}
                                `}
                            >
                                {isSelected ? <CheckSquare size={14} /> : <Square size={14} />}
                                <span>{t?.name}</span>
                                <span className="text-xs opacity-70">(${p.entries.reduce((sum, e) => sum + e.totalAmount, 0).toLocaleString()})</span>
                            </div>
                        );
                    }) : (
                        <span className="text-sm text-slate-400">本月尚無已建立的清冊資料</span>
                    )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button 
                      onClick={handleBatchExport}
                      disabled={isExporting || selectedPayrollIds.size === 0}
                      className="flex items-center px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                      {isExporting ? '匯出中...' : <><FileDown size={18} className="mr-2" /> 匯出選取清冊至 Google Sheet</>}
                  </button>
                  <button
                      onClick={handleRenderPrint}
                      disabled={selectedPayrollIds.size === 0}
                      className="flex items-center px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                      <Printer size={18} className="mr-2" /> A4 渲染列印（每師一頁）
                  </button>
                </div>
            </div>
          </div>

          {/* Editor */}
          {currentPayroll ? (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8">
              {/* Header Info */}
              <div className="grid grid-cols-2 gap-6 mb-8 p-4 bg-slate-50 rounded-lg border border-slate-200">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">所屬主聘學校</label>
                  <SearchableSelect
                    options={uniqueHostSchools.map(s => ({ value: s, label: s }))}
                    value={currentPayroll.hostSchool}
                    onChange={(val) => setCurrentPayroll({...currentPayroll, hostSchool: val})}
                    allowCreate={true}
                    placeholder="選擇或輸入學校..."
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">上課學校名稱</label>
                  <input 
                    type="text" 
                    value={currentPayroll.teachingSchool}
                    onChange={e => setCurrentPayroll({...currentPayroll, teachingSchool: e.target.value})}
                    className="w-full bg-transparent border-b border-slate-300 focus:border-indigo-500 focus:outline-none py-1 font-medium"
                    placeholder="例如：高雄市楠梓區加昌國小"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">族語方言別</label>
                  <SearchableSelect
                    options={uniqueLanguages.map(l => ({ value: l, label: l }))}
                    value={currentPayroll.language}
                    onChange={(val) => setCurrentPayroll({...currentPayroll, language: val})}
                    allowCreate={true}
                    placeholder="選擇或輸入語種..."
                  />
                </div>
                <div>
                   <label className="block text-xs font-bold text-slate-500 uppercase mb-1">老師姓名</label>
                   <div className="py-1 font-medium text-slate-800">
                     {teachers.find(t => t.id === currentPayroll.teacherId)?.name}
                   </div>
                </div>
              </div>

              {/* Table */}
              <div className="border border-slate-300 rounded-lg overflow-hidden mb-6">
                <table className="w-full text-center border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 font-bold text-sm">
                      <th className="border-r border-b border-slate-300 py-2 w-16">編號</th>
                      <th className="border-r border-b border-slate-300 py-2">上課時間 (日期；節次)</th>
                      <th className="border-r border-b border-slate-300 py-2 w-20">節數</th>
                      <th className="border-r border-b border-slate-300 py-2 w-24">鐘點費單價</th>
                      <th className="border-r border-b border-slate-300 py-2 w-24">合計</th>
                      <th className="border-b border-slate-300 py-2 w-16">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentPayroll.entries.map((entry, index) => (
                      <tr key={entry.id} className="border-b border-slate-200 hover:bg-slate-50">
                        <td className="border-r border-slate-200 py-2">{index + 1}</td>
                        <td className="border-r border-slate-200 py-2 px-4 text-left">
                          <div className="flex items-center space-x-2">
                             <input 
                               type="date" 
                               value={entry.date}
                               onChange={e => handleUpdateEntry(entry.id, 'date', e.target.value)}
                               className="border border-slate-300 rounded px-2 py-1 text-sm w-36"
                             />
                             <span className="text-slate-400">：</span>
                             <input 
                               type="text" 
                               value={entry.periodLabels}
                               onChange={e => handleUpdateEntry(entry.id, 'periodLabels', e.target.value)}
                               className="border border-slate-300 rounded px-2 py-1 text-sm flex-1"
                               placeholder="早自修、第1節..."
                             />
                          </div>
                        </td>
                        <td className="border-r border-slate-200 py-2">
                          <input 
                            type="number" 
                            value={entry.periodCount}
                            onChange={e => handleUpdateEntry(entry.id, 'periodCount', Number(e.target.value))}
                            className="w-16 text-center border border-slate-300 rounded py-1 text-sm"
                          />
                        </td>
                        <td className="border-r border-slate-200 py-2">
                          <input 
                            type="number" 
                            value={entry.hourlyRate}
                            onChange={e => handleUpdateEntry(entry.id, 'hourlyRate', Number(e.target.value))}
                            className="w-20 text-center border border-slate-300 rounded py-1 text-sm"
                          />
                        </td>
                        <td className="border-r border-slate-200 py-2 font-medium">
                          {entry.totalAmount}
                        </td>
                        <td className="py-2 text-center">
                          <button 
                            onClick={() => handleDeleteEntry(entry.id)}
                            className="text-red-500 hover:text-red-700"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {currentPayroll.entries.length === 0 && (
                       <tr>
                         <td colSpan={6} className="py-8 text-slate-400">點擊下方按鈕新增上課紀錄，或使用自動計算</td>
                       </tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 font-bold text-slate-800">
                      <td colSpan={2} className="py-3 px-4 text-right border-r border-slate-300">總計</td>
                      <td className="py-3 border-r border-slate-300">{totalPeriods} 節</td>
                      <td className="py-3 border-r border-slate-300"></td>
                      <td className="py-3 border-r border-slate-300 text-green-700">${totalAmount.toLocaleString()}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="flex justify-between">
                <div className="space-x-3">
                    <button 
                    onClick={handleAddEntry}
                    className="flex items-center text-indigo-600 hover:bg-indigo-50 px-4 py-2 rounded-lg transition-colors border border-indigo-200"
                    >
                    <Plus size={18} className="mr-2" /> 新增紀錄
                    </button>
                    <button 
                    onClick={handleAutoCalculate}
                    className="flex items-center text-amber-600 hover:bg-amber-50 px-4 py-2 rounded-lg transition-colors border border-amber-200"
                    title="根據教師設定的每週上課時間自動產生"
                    >
                    <Calculator size={18} className="mr-2" /> 自動計算本月節數
                    </button>
                </div>
                
                <div className="space-x-3">
                  <button 
                    onClick={handleSavePayroll}
                    className="flex items-center bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 shadow-sm transition-colors"
                  >
                    <Save size={18} className="mr-2" /> 儲存清冊
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl p-12 text-center text-slate-400">
              請選擇月份與教師以開始編輯
            </div>
          )}
        </div>
      )}

      {/* Teacher Modal */}
      <Modal 
        isOpen={isTeacherModalOpen} 
        onClose={() => setIsTeacherModalOpen(false)}
        title={editingTeacher ? "編輯語言教師" : "新增語言教師"}
        maxWidth="max-w-2xl"
      >
        <form onSubmit={handleSaveTeacherWithState} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">姓名</label>
            <input 
              name="name" 
              defaultValue={editingTeacher?.name} 
              required 
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">授課語種</label>
              <SearchableSelect
                options={uniqueLanguages.map(l => ({ value: l, label: l }))}
                value={formLanguage}
                onChange={setFormLanguage}
                allowCreate={true}
                placeholder="選擇或輸入語種..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">預設鐘點費</label>
              <input 
                name="defaultHourlyRate" 
                type="number"
                value={formHourlyRate}
                onChange={e => setFormHourlyRate(Number(e.target.value))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">教師類別</label>
            <div className="flex flex-wrap gap-4 mt-1">
              <label className="flex items-center cursor-pointer">
                <input 
                  type="radio" 
                  name="teacherCategory" 
                  value="Indigenous"
                  checked={formCategory === 'Indigenous'}
                  onChange={() => setFormCategory('Indigenous')}
                  className="w-4 h-4 text-indigo-600 border-slate-300 focus:ring-indigo-500"
                />
                <span className="ml-2 text-sm text-slate-700">原住民族語</span>
              </label>
              <label className="flex items-center cursor-pointer">
                <input 
                  type="radio" 
                  name="teacherCategory" 
                  value="NewImmigrant"
                  checked={formCategory === 'NewImmigrant'}
                  onChange={() => setFormCategory('NewImmigrant')}
                  className="w-4 h-4 text-indigo-600 border-slate-300 focus:ring-indigo-500"
                />
                <span className="ml-2 text-sm text-slate-700">新住民語</span>
              </label>
              <label className="flex items-center cursor-pointer">
                <input 
                  type="radio" 
                  name="teacherCategory" 
                  value="IndigenousFullTime"
                  checked={formCategory === 'IndigenousFullTime'}
                  onChange={() => setFormCategory('IndigenousFullTime')}
                  className="w-4 h-4 text-indigo-600 border-slate-300 focus:ring-indigo-500"
                />
                <span className="ml-2 text-sm text-slate-700">族語專職教師</span>
              </label>
            </div>
          </div>

          {formCategory === 'IndigenousFullTime' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">職別 (例如：民族語專職老師)</label>
              <input 
                value={formJobTitle}
                onChange={(e) => setFormJobTitle(e.target.value)}
                placeholder="民族語專職老師"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">主聘學校</label>
            <SearchableSelect
                options={uniqueHostSchools.map(s => ({ value: s, label: s }))}
                value={formHostSchool}
                onChange={setFormHostSchool}
                allowCreate={true}
                placeholder="選擇或輸入學校..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">電話</label>
            <input 
              name="phone" 
              defaultValue={editingTeacher?.phone} 
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>
          
          {/* Schedule Editor */}
          <div className="border-t border-slate-200 pt-4 mt-2">
            <div className="flex justify-between items-center mb-2">
                <h3 className="text-sm font-bold text-slate-600 flex items-center">
                    <Calendar size={16} className="mr-1"/> 每週上課時間設定
                </h3>
            </div>
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div className="grid grid-cols-6 gap-2 text-xs text-center font-bold text-slate-500 mb-2">
                    <div></div>
                    <div>週一</div>
                    <div>週二</div>
                    <div>週三</div>
                    <div>週四</div>
                    <div>週五</div>
                </div>
                {['早', '1', '2', '3', '4', '午', '5', '6', '7'].map(period => (
                    <div key={period} className="grid grid-cols-6 gap-2 items-center mb-1">
                        <div className="text-xs font-bold text-slate-400 text-center">{period}</div>
                        {[1, 2, 3, 4, 5].map(day => {
                            const slot = schedule.find(s => s.dayOfWeek === day && s.periods.includes(period));
                            const isSelected = !!slot;
                            const isSixthGrade = slot?.isSixthGrade;
                            return (
                                <div 
                                    key={`${day}-${period}`}
                                    onClick={() => toggleScheduleSlot(day, period)}
                                    className={`
                                        h-6 rounded cursor-pointer border transition-all flex items-center justify-center text-[10px] font-bold
                                        ${isSelected 
                                            ? (isSixthGrade 
                                                ? 'bg-orange-500 border-orange-600 text-white' 
                                                : 'bg-indigo-500 border-indigo-600 text-white') 
                                            : 'bg-white border-slate-200 hover:border-indigo-300'}
                                    `}
                                >
                                    {isSelected && (isSixthGrade ? '六' : '')}
                                </div>
                            );
                        })}
                    </div>
                ))}
            </div>
            <div className="flex items-center space-x-4 mt-2 text-xs text-slate-500">
                <div className="flex items-center">
                    <div className="w-3 h-3 bg-indigo-500 rounded mr-1"></div>
                    <span>一般課程</span>
                </div>
                <div className="flex items-center">
                    <div className="w-3 h-3 bg-orange-500 rounded mr-1"></div>
                    <span>六年級課程 (畢業後中斷)</span>
                </div>
                <div className="flex-1 text-right text-slate-400">
                    點擊格子以選取/取消課程
                </div>
            </div>

            {/* Sixth Grade Settings List */}
            {allSelectedPeriods.length > 0 && (
                <div className="mt-4 border-t border-slate-200 pt-3">
                    <h4 className="text-xs font-bold text-slate-600 mb-2">設定六年級課程 (畢業後中斷)</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {allSelectedPeriods.map(p => (
                            <label key={`${p.day}-${p.period}`} className="flex items-center space-x-2 bg-white border border-slate-200 p-2 rounded cursor-pointer hover:bg-slate-50">
                                <input 
                                    type="checkbox" 
                                    checked={p.isSixthGrade}
                                    onChange={(e) => toggleSixthGrade(p.day, p.period, e.target.checked)}
                                    className="rounded text-orange-500 focus:ring-orange-500"
                                />
                                <span className="text-xs text-slate-700">{p.dayName} 第 {p.period} 節</span>
                            </label>
                        ))}
                    </div>
                </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">備註</label>
            <textarea 
              name="note" 
              defaultValue={editingTeacher?.note} 
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              rows={2}
            />
          </div>
          <div className="flex justify-end pt-4">
            <button 
              type="button"
              onClick={() => setIsTeacherModalOpen(false)}
              className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg mr-2"
            >
              取消
            </button>
            <button 
              type="submit"
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              儲存
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default LanguageTeachers;
