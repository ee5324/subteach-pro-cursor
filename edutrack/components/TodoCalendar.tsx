
import React, { useState, useEffect, useRef } from 'react';
import { Calendar, ChevronLeft, ChevronRight, Plus, User, Trash2, CheckCircle, Clock, Loader2, FileText, MessageSquare, PhoneIncoming, ShieldCheck, Sun, Moon, FileCheck, List, Layers, X, Repeat, LayoutGrid } from 'lucide-react';
import { TodoItem, Attachment, MonthlyRecurringTodoRule } from '../types';
import Modal from './Modal';
import DutyListModal from './modals/DutyListModal';
import BatchDutyModal from './modals/BatchDutyModal';
import SeriesViewModal from './modals/SeriesViewModal';
import EditTodoModal from './modals/EditTodoModal';
import MonthlyRecurringModal from './modals/MonthlyRecurringModal';
import { getTodos, saveTodo, saveBatchTodos, deleteTodo, cancelSeries as apiCancelSeries, toggleTodoStatus, uploadAttachment, getMonthlyRecurringTodoRules, updateMonthlyRecurringMonthStatus } from '../services/api';
import { ruleMatchesCalendarDate, statusForRuleOnDate, yearMonthKeyFromDate } from '../utils/monthlyRecurringTodos';

type MobileSegment = 'calendar' | 'day' | 'memos';

const TodoCalendar: React.FC = () => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [isLgUp, setIsLgUp] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 1024px)').matches : true,
  );
  const [mobileSegment, setMobileSegment] = useState<MobileSegment>('calendar');
  const swipeRef = useRef<{ x: number; y: number } | null>(null);
  
  // Data States
  const [todos, setTodos] = useState<TodoItem[]>([]); 
  const [memos, setMemos] = useState<TodoItem[]>([]);
  const [monthlyRecurringRules, setMonthlyRecurringRules] = useState<MonthlyRecurringTodoRule[]>([]);
  
  const [loading, setLoading] = useState(false);
  
  // Modal States
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingTodo, setEditingTodo] = useState<Partial<TodoItem>>({});
  const [modalState, setModalState] = useState<{ isOpen: boolean; title: string; content: React.ReactNode; onConfirm?: () => void; type?: any }>({ isOpen: false, title: '', content: null });
  
  const [isSeriesViewOpen, setIsSeriesViewOpen] = useState(false);
  const [seriesList, setSeriesList] = useState<TodoItem[]>([]);

  const [isDutyListOpen, setIsDutyListOpen] = useState(false);
  const [isBatchDutyModalOpen, setIsBatchDutyModalOpen] = useState(false);
  const [isMonthlyRecurringOpen, setIsMonthlyRecurringOpen] = useState(false);

  // File Upload State
  const [uploading, setUploading] = useState<'individual' | 'common' | null>(null);

  // Initial Fetch
  useEffect(() => {
    fetchTodos();
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const onChange = () => setIsLgUp(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const onCalendarTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    swipeRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };

  const onCalendarTouchEnd = (e: React.TouchEvent) => {
    const start = swipeRef.current;
    swipeRef.current = null;
    if (!start || e.changedTouches.length !== 1) return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    if (Math.abs(dx) < 64) return;
    if (Math.abs(dx) < Math.abs(dy) * 1.15) return;
    if (dx > 0) handlePrevMonth();
    else handleNextMonth();
  };

  const fetchTodos = async () => {
    setLoading(true);
    try {
      const [allItems, recurring] = await Promise.all([getTodos(), getMonthlyRecurringTodoRules()]);
      setTodos(allItems.filter((t: TodoItem) => t.type !== 'memo'));
      setMemos(allItems.filter((t: TodoItem) => t.type === 'memo'));
      setMonthlyRecurringRules(recurring);
    } catch (e) {
      console.error(e);
      showModal('錯誤', '無法讀取待辦事項', 'danger');
    } finally {
      setLoading(false);
    }
  };

  // Calendar Logic
  const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

  const handlePrevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  const handleNextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));

  const handleDateClick = (day: number) => {
    const newDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
    setSelectedDate(newDate);
    if (!isLgUp) setMobileSegment('day');
  };

  const formatDateYMD = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const getUrgencyLevel = (todo: TodoItem) => {
    if (todo.type === 'duty') return 'none';
    if (todo.status === 'done' || todo.status === 'cancelled') return 'none';
    const today = new Date();
    today.setHours(0,0,0,0);
    const target = new Date(todo.date);
    const diffTime = target.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return 'overdue';
    if (diffDays <= 3 && todo.priority === 'High') return 'critical';
    if (diffDays <= 7 && (todo.priority === 'High' || todo.priority === 'Medium')) return 'warning';
    return 'normal';
  };

  const recurringAsTodoForUrgency = (rule: MonthlyRecurringTodoRule, dateStr: string, st: 'pending' | 'done' | 'cancelled'): TodoItem => ({
    id: rule.id,
    academicYear: '114',
    date: dateStr,
    title: rule.title,
    type: rule.type,
    status: st === 'cancelled' ? 'cancelled' : st === 'done' ? 'done' : 'pending',
    priority: rule.priority,
    contacts: [],
    attachments: [],
  });

  const existingTopics = Array.from(new Set(todos.map(t => t.topic).filter(Boolean)));

  const getDefaultAcademicState = () => {
      return { year: '114', semester: '第2學期' };
  };

  const getVoucherReminderDate = (year: number, month: number) => {
      const d = new Date(year, month, 3);
      const day = d.getDay();
      if (day === 0) d.setDate(1);
      else if (day === 6) d.setDate(2);
      return formatDateYMD(d);
  };

  // CRUD Operations
  const handleAddTodo = () => {
    const defaults = getDefaultAcademicState();
    setEditingTodo({
      date: formatDateYMD(selectedDate),
      type: '行政',
      priority: 'Medium',
      contacts: [],
      commonContacts: [],
      attachments: [],
      commonAttachments: [],
      officialDocs: [],
      status: 'pending',
      academicYear: defaults.year,
      memo: '',
      topic: '',
      period: 'full'
    });
    setIsEditModalOpen(true);
  };

  const handleOpenBatchDuty = () => {
      setIsBatchDutyModalOpen(true);
  };

  const handleAddDuty = () => {
    const defaults = getDefaultAcademicState();
    setEditingTodo({
      date: formatDateYMD(selectedDate),
      type: 'duty',
      title: '教學組輪值',
      priority: 'Medium',
      status: 'pending',
      academicYear: defaults.year,
      period: 'full',
      memo: '',
      contacts: [],
      attachments: [],
      officialDocs: []
    });
    setIsEditModalOpen(true);
  };

  const handleSaveBatchDuty = async (start: string, end: string, days: number[], period: 'full' | 'am' | 'pm') => {
      if(!start || !end || days.length === 0) {
          showModal('設定不完整', '請選擇起訖日期與星期', 'warning');
          return;
      }

      setLoading(true);
      setIsBatchDutyModalOpen(false);

      const defaults = getDefaultAcademicState();
      const newTodos: Partial<TodoItem>[] = [];
      const curr = new Date(start);
      const endDate = new Date(end);

      while (curr <= endDate) {
          if (days.includes(curr.getDay())) {
              newTodos.push({
                  date: formatDateYMD(curr),
                  type: 'duty',
                  title: '教學組輪值',
                  priority: 'Medium',
                  status: 'pending',
                  academicYear: defaults.year,
                  period: period,
                  memo: ''
              });
          }
          curr.setDate(curr.getDate() + 1);
      }

      try {
          await saveBatchTodos({ todos: newTodos });
          await fetchTodos();
          // 成功不顯示 modal，僅失敗時提示
      } catch (e: any) {
          showModal('失敗', `批次儲存失敗: ${e.message}`, 'danger');
      } finally {
          setLoading(false);
      }
  };

  const handleAddMemo = () => {
      const defaults = getDefaultAcademicState();
      setEditingTodo({
          date: formatDateYMD(new Date()),
          type: 'memo',
          priority: 'Medium',
          status: 'pending',
          title: '', 
          topic: '', 
          contacts: [{ name: '', role: '來電者', phone: '' }],
          academicYear: defaults.year,
          memo: ''
      });
      setIsEditModalOpen(true);
  };

  const handleEditTodo = (todo: TodoItem) => {
    setEditingTodo({ ...todo, period: todo.period || 'full' });
    setIsEditModalOpen(true);
  };

  const handleOpenSeriesView = (topic: string, year: string) => {
      if (!topic) return;
      const related = [...todos, ...memos].filter(t => t.topic === topic && t.academicYear === year);
      related.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      setSeriesList(related);
      setIsSeriesViewOpen(true);
  };

  const handleJumpToEvent = (todo: TodoItem) => {
      setEditingTodo({ ...todo, period: todo.period || 'full' });
      setIsSeriesViewOpen(false); 
      setIsEditModalOpen(true); 
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, target: 'individual' | 'common') => {
      if (!e.target.files || e.target.files.length === 0) return;
      const file = e.target.files[0];
      
      if (file.size > 5 * 1024 * 1024) {
          showModal('檔案過大', '請上傳小於 5MB 的檔案。', 'warning');
          return;
      }

      setUploading(target);
      
      const reader = new FileReader();
      reader.onload = async () => {
          const base64String = (reader.result as string).split(',')[1];
          // 取得當前主題，用於檔名自動更名
          const prefix = editingTodo.topic ? editingTodo.topic.trim() : '';

          try {
              const result = await uploadAttachment({
                  name: file.name,
                  mimeType: file.type,
                  base64Data: base64String,
                  prefix: prefix || undefined
              });
              const fileData = (result as any)?.file ?? result;
              if (fileData?.url) {
                  const newAttachment: Attachment = { id: fileData.id, name: fileData.name, url: fileData.url, mimeType: fileData.mimeType };
                  if (target === 'individual') {
                      setEditingTodo(prev => ({ ...prev, attachments: [...(prev.attachments || []), newAttachment] }));
                  } else {
                      setEditingTodo(prev => ({ ...prev, commonAttachments: [...(prev.commonAttachments || []), newAttachment] }));
                  }
              } else {
                  throw new Error((result as any)?.message || "Upload failed");
              }
          } catch (err: any) {
              console.error(err);
              showModal('上傳失敗', `檔案上傳過程發生錯誤: ${err.message}`, 'danger');
          } finally {
              setUploading(null);
          }
      };
      reader.readAsDataURL(file);
  };

  const handleRemoveAttachment = (index: number, target: 'individual' | 'common') => {
      if (target === 'individual') {
          setEditingTodo(prev => ({ ...prev, attachments: (prev.attachments || []).filter((_, i) => i !== index) }));
      } else {
          setEditingTodo(prev => ({ ...prev, commonAttachments: (prev.commonAttachments || []).filter((_, i) => i !== index) }));
      }
  };

  const handleSaveTodo = async () => {
    if (!editingTodo.title || !editingTodo.date) {
        showModal('欄位缺漏', '內容/姓名與日期為必填', 'warning');
        return;
    }
    
    setLoading(true);
    setIsEditModalOpen(false);

    try {
      // 確保送出前去除 topic 的前後空白，避免同步失敗
      const payload = { 
          ...editingTodo,
          topic: editingTodo.topic?.trim() 
      };

      await saveTodo(payload as any);
      await fetchTodos();
      // 成功不顯示 modal，僅失敗時提示
    } catch (e: any) {
        showModal('失敗', e?.message || '儲存時發生錯誤', 'danger');
    } finally {
        setLoading(false);
    }
  };

  const handleDeleteClick = (todo: TodoItem) => {
      const isSeries = !!todo.topic || !!todo.seriesId;

      if (isSeries && todo.type !== 'memo' && todo.type !== 'duty') {
          setModalState({
              isOpen: true,
              title: '系列活動處理',
              content: (
                  <div className="space-y-4">
                      <p>偵測到此為系列活動「{todo.title}」({todo.academicYear}學年 {todo.topic ? `- ${todo.topic}` : ''})。</p>
                      <div className="flex flex-col gap-2">
                          <button onClick={() => { deleteSingle(todo.id); setModalState(prev=>({...prev, isOpen:false}))}} className="w-full p-2 bg-red-100 text-red-700 rounded hover:bg-red-200 text-left px-4">
                              1. 僅刪除此事件 (Delete Only This)
                          </button>
                          <button onClick={() => { cancelSeries(todo); setModalState(prev=>({...prev, isOpen:false}))}} className="w-full p-2 bg-orange-100 text-orange-700 rounded hover:bg-orange-200 text-left px-4">
                              2. 取消此學年後續所有同主題事件 (Cancel Future Series)
                          </button>
                      </div>
                  </div>
              ),
              type: 'info'
          });

      } else {
          showModal('刪除確認', '確定要刪除此紀錄嗎？', 'danger', () => deleteSingle(todo.id!));
      }
  };

  const deleteSingle = async (id: string) => {
    setLoading(true);
    await deleteTodo({ id });
    await fetchTodos();
    setLoading(false);
  };

  const cancelSeries = async (todo: TodoItem) => {
    setLoading(true);
    await apiCancelSeries({ seriesId: todo.seriesId, topic: todo.topic, pivotDate: todo.date, academicYear: todo.academicYear });
    await fetchTodos();
    setLoading(false);
  };

  const toggleStatus = async (todo: TodoItem) => {
      const newStatus = todo.status === 'done' ? 'pending' : 'done';
      if (todo.type === 'memo') {
          setMemos(prev => prev.map(t => t.id === todo.id ? { ...t, status: newStatus } : t));
      } else {
          setTodos(prev => prev.map(t => t.id === todo.id ? { ...t, status: newStatus } : t));
      }
      
      await toggleTodoStatus({ id: todo.id!, newStatus });
  };

  const toggleRecurringMonthDone = async (rule: MonthlyRecurringTodoRule, selected: Date) => {
    const ym = yearMonthKeyFromDate(selected);
    const cur = statusForRuleOnDate(rule, selected);
    const next: 'pending' | 'done' = cur === 'done' ? 'pending' : 'done';
    setMonthlyRecurringRules((prev) =>
      prev.map((r) => {
        if (r.id !== rule.id) return r;
        const mc = { ...(r.monthCompletions ?? {}) };
        if (next === 'pending') delete mc[ym];
        else mc[ym] = 'done';
        return { ...r, monthCompletions: mc };
      })
    );
    try {
      await updateMonthlyRecurringMonthStatus({ id: rule.id, yearMonth: ym, status: next });
    } catch (e) {
      console.error(e);
      await fetchTodos();
      showModal('錯誤', '無法更新每月事項狀態', 'danger');
    }
  };

  const showModal = (title: string, content: React.ReactNode, type: any, onConfirm?: () => void) => {
    setModalState({ isOpen: true, title, content, type, onConfirm });
  };

  const handleCleanupDuties = async (oldDuties: TodoItem[]) => {
      showModal('清理確認', `確定要刪除 ${oldDuties.length} 筆過期的輪值資料嗎？`, 'danger', async () => {
          setLoading(true);
          for (const d of oldDuties) {
              await deleteTodo({ id: d.id! });
          }
          await fetchTodos();
          setLoading(false);
          setModalState(prev => ({...prev, isOpen: false}));
      });
  };

  const renderCalendarGrid = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    const days = [];
    const voucherReminderDate = getVoucherReminderDate(year, month);

    for (let i = 0; i < firstDay; i++) {
      days.push(
        <div
          key={`empty-${i}`}
          className="min-h-[4.25rem] lg:min-h-[6rem] bg-gray-50/50 border border-gray-100"
        />,
      );
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = formatDateYMD(new Date(year, month, day));
      const cellDate = new Date(year, month, day);
      const dayRecurring = monthlyRecurringRules.filter((r) => ruleMatchesCalendarDate(r, cellDate));
      const dayTodos = todos.filter(t => t.date === dateStr && t.type !== 'duty');
      const dayDuties = todos.filter(t => t.date === dateStr && t.type === 'duty');
      
      const isSelected = selectedDate.getDate() === day && selectedDate.getMonth() === month && selectedDate.getFullYear() === year;
      const hasDuty = dayDuties.length > 0;
      const isVoucherDay = dateStr === voucherReminderDate;
      const eventCount = dayTodos.length + dayRecurring.length;
      
      let dailyUrgency = 'none';
      const urgencyCandidates = [
        ...dayTodos.map((t) => getUrgencyLevel(t)),
        ...dayRecurring.map((r) => getUrgencyLevel(recurringAsTodoForUrgency(r, dateStr, statusForRuleOnDate(r, cellDate)))),
      ];
      if (urgencyCandidates.includes('critical')) dailyUrgency = 'critical';
      else if (urgencyCandidates.includes('warning')) dailyUrgency = 'warning';

      days.push(
        <div 
            key={day} 
            onClick={() => handleDateClick(day)}
            className={`min-h-[4.25rem] lg:min-h-[6rem] h-auto border p-1.5 lg:p-2 relative cursor-pointer transition-colors hover:bg-blue-50 active:bg-blue-100 flex flex-col touch-manipulation rounded-sm
                ${hasDuty ? 'border-2 border-red-500 bg-red-50/30' : 'border-gray-100 bg-white'} 
                ${isSelected ? '!ring-2 !ring-blue-500 !bg-blue-50' : ''}
                ${dailyUrgency === 'critical' ? 'bg-red-50' : ''}
            `}
        >
          <div className="flex justify-between items-start mb-0.5 lg:mb-1 gap-0.5">
              <span className={`text-xs lg:text-sm font-semibold tabular-nums ${isSelected ? 'text-blue-700' : 'text-gray-700'}`}>{day}</span>
              <div className="flex items-center gap-0.5 shrink-0">
                {isVoucherDay && (
                  <span className="lg:hidden w-1.5 h-1.5 rounded-full bg-orange-500" title="憑證製作日" aria-hidden />
                )}
                {hasDuty && <span className="lg:hidden w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" aria-hidden />}
                {dailyUrgency === 'critical' && <span className="animate-pulse w-2 h-2 rounded-full bg-red-500 shrink-0" />}
                {dailyUrgency === 'warning' && (
                  <span className="lg:hidden w-2 h-2 rounded-full bg-orange-400 shrink-0" aria-hidden />
                )}
              </div>
          </div>

          {/* 手機：僅顯示摘要；桌機：完整標題列表 */}
          <div className="mt-auto lg:hidden flex flex-wrap items-center gap-0.5">
            {eventCount > 0 && (
              <span className="text-[9px] font-bold px-1 py-px rounded bg-blue-100 text-blue-800 tabular-nums">
                {eventCount}
              </span>
            )}
          </div>

          <div className="hidden lg:block">
          {isVoucherDay && (
              <div className="mb-1">
                  <div className="text-[10px] font-bold text-orange-700 bg-orange-100 px-1 rounded flex items-center gap-0.5 truncate">
                      <FileCheck size={8}/> 憑證製作
                  </div>
              </div>
          )}

          {hasDuty && (
              <div className="mb-1 space-y-0.5">
                  {dayDuties.map(d => (
                      <div key={d.id} className="text-[10px] text-red-600 flex justify-center items-center gap-0.5">
                          {d.period === 'am' ? <><Sun size={12}/>(上)</> : d.period === 'pm' ? <><Moon size={12}/>(下)</> : null}
                      </div>
                  ))}
              </div>
          )}

          <div className="space-y-1">
             {dayRecurring.map((r) => {
               const st = statusForRuleOnDate(r, cellDate);
               const done = st === 'done';
               return (
                 <div
                   key={`mr-${r.id}`}
                   className={`text-xs rounded px-1 py-0.5 break-words whitespace-normal leading-tight flex items-center gap-0.5 ${
                     done ? 'bg-gray-100 text-gray-400 line-through' : 'bg-teal-50 text-teal-800 border border-teal-100'
                   }`}
                 >
                   <Repeat size={10} className="shrink-0 opacity-70" />
                   {r.title}
                 </div>
               );
             })}
             {dayTodos.map((todo, idx) => (
                 <div key={idx} className={`text-xs rounded px-1 py-0.5 break-words whitespace-normal leading-tight ${
                     todo.status === 'done' ? 'bg-gray-100 text-gray-400 line-through' :
                     todo.priority === 'High' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                 }`}>
                     {todo.title}
                 </div>
             ))}
          </div>
          </div>
        </div>
      );
    }
    return days;
  };

  const selectedDateStr = formatDateYMD(selectedDate);
  const selectedDayTodos = todos.filter(t => t.date === selectedDateStr);
  const selectedDayDuties = selectedDayTodos.filter((t) => t.type === 'duty');
  const selectedDayOtherTodos = selectedDayTodos.filter((t) => t.type !== 'duty');
  const recurringOnSelectedDate = monthlyRecurringRules.filter((r) => ruleMatchesCalendarDate(r, selectedDate));
  const priorityScore = { High: 3, Medium: 2, Low: 1 } as const;
  const mergedNonDuty = [
    ...recurringOnSelectedDate.map((rule) => ({ kind: 'recurring' as const, rule })),
    ...selectedDayOtherTodos.map((todo) => ({ kind: 'todo' as const, todo })),
  ].sort((a, b) => {
    const pa = a.kind === 'recurring' ? priorityScore[a.rule.priority] : priorityScore[a.todo.priority];
    const pb = b.kind === 'recurring' ? priorityScore[b.rule.priority] : priorityScore[b.todo.priority];
    return pb - pa;
  });
  const selectedDayOrdered = [
    ...selectedDayDuties.map((todo) => ({ kind: 'todo' as const, todo })),
    ...mergedNonDuty,
  ];

  const sortedMemos = [...memos].sort((a, b) => {
      if (a.status === 'pending' && b.status === 'done') return -1;
      if (a.status === 'done' && b.status === 'pending') return 1;
      return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

  const currentVoucherDate = getVoucherReminderDate(selectedDate.getFullYear(), selectedDate.getMonth());
  const isVoucherDaySelected = formatDateYMD(selectedDate) === currentVoucherDate;

  const renderAttachmentItem = (file: Attachment, idx: number, type: 'individual' | 'common', isEditing: boolean) => (
      <div key={idx} className={`flex items-center gap-2 p-2 rounded border text-sm ${type === 'common' ? 'bg-purple-50 border-purple-100' : 'bg-gray-50 border-gray-200'}`}>
         {type === 'common' ? <Layers size={14} className="text-purple-600"/> : <FileText size={14} className="text-gray-500"/>}
         <a href={file.url} target="_blank" rel="noreferrer" className={`flex-1 truncate hover:underline ${type === 'common' ? 'text-purple-700' : 'text-gray-700'}`}>{file.name}</a>
         {isEditing && (
             <button onClick={() => handleRemoveAttachment(idx, type)} className="text-gray-400 hover:text-red-500"><X size={14}/></button>
         )}
      </div>
  );

  const mobileTabBtn = (seg: MobileSegment, label: string, icon: React.ReactNode) => (
    <button
      type="button"
      role="tab"
      aria-selected={mobileSegment === seg}
      onClick={() => setMobileSegment(seg)}
      className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-lg text-xs font-semibold touch-manipulation transition-colors ${
        mobileSegment === seg
          ? 'bg-white text-indigo-700 shadow-sm border border-indigo-100'
          : 'text-slate-600 border border-transparent'
      }`}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div className="h-full flex flex-col lg:flex-row gap-4 lg:gap-6 min-h-0">
      <Modal {...modalState} onCancel={() => setModalState(prev => ({ ...prev, isOpen: false }))} />

      {/* Extracted Modals */}
      <DutyListModal
        isOpen={isDutyListOpen}
        onClose={() => setIsDutyListOpen(false)}
        todos={todos}
        onEdit={(todo) => { handleEditTodo(todo); setIsDutyListOpen(false); }}
        onDelete={handleDeleteClick}
        onCleanup={handleCleanupDuties}
      />

      <BatchDutyModal
        isOpen={isBatchDutyModalOpen}
        onClose={() => setIsBatchDutyModalOpen(false)}
        onSave={handleSaveBatchDuty}
        loading={loading}
        defaultDate={currentDate}
      />

      <MonthlyRecurringModal
        isOpen={isMonthlyRecurringOpen}
        onClose={() => setIsMonthlyRecurringOpen(false)}
        onSaved={() => void fetchTodos()}
      />

      <SeriesViewModal
        isOpen={isSeriesViewOpen}
        onClose={() => setIsSeriesViewOpen(false)}
        topic={editingTodo.topic || ''}
        seriesList={seriesList}
        currentId={editingTodo.id}
        onJump={handleJumpToEvent}
      />

      <EditTodoModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        todo={editingTodo}
        setTodo={setEditingTodo}
        onSave={handleSaveTodo}
        loading={loading}
        existingTopics={existingTopics}
        onOpenSeriesView={handleOpenSeriesView}
        onFileUpload={handleFileUpload}
        uploading={uploading}
        onRemoveAttachment={handleRemoveAttachment}
      />

      {!isLgUp && (
        <div
          className="flex gap-1 p-1 rounded-xl bg-slate-100 border border-slate-200 shrink-0"
          role="tablist"
          aria-label="行政行事曆檢視"
        >
          {mobileTabBtn('calendar', '月曆', <LayoutGrid size={16} className="shrink-0 text-indigo-600" />)}
          {mobileTabBtn('day', '本日', <Calendar size={16} className="shrink-0 text-indigo-600" />)}
          {mobileTabBtn('memos', '留言', <MessageSquare size={16} className="shrink-0 text-indigo-600" />)}
        </div>
      )}

      {/* Left Column: Calendar */}
      <div
        className={`flex-1 flex flex-col bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden min-h-[280px] lg:min-h-[500px] ${
          !isLgUp && mobileSegment !== 'calendar' ? 'hidden' : ''
        } lg:flex`}
      >
        {/* Calendar Header */}
        <div className="p-3 sm:p-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between border-b border-gray-100 bg-gray-50">
          <div className="flex flex-col gap-3 min-w-0">
             <div className="flex flex-wrap items-center gap-2 sm:gap-3">
               <h2 className="text-lg sm:text-xl font-bold text-gray-800 tabular-nums">
                  {currentDate.getFullYear()}年 {currentDate.getMonth() + 1}月
               </h2>
               <div className="flex items-center gap-0.5 shrink-0">
                 <button
                   type="button"
                   onClick={handlePrevMonth}
                   className="p-2 min-w-[40px] min-h-[40px] inline-flex items-center justify-center hover:bg-gray-200 rounded-lg touch-manipulation"
                   aria-label="上個月"
                 >
                   <ChevronLeft size={22} />
                 </button>
                 <button
                   type="button"
                   onClick={handleNextMonth}
                   className="p-2 min-w-[40px] min-h-[40px] inline-flex items-center justify-center hover:bg-gray-200 rounded-lg touch-manipulation"
                   aria-label="下個月"
                 >
                   <ChevronRight size={22} />
                 </button>
                 <button
                   type="button"
                   onClick={() => setCurrentDate(new Date())}
                   className="ml-1 inline-flex items-center justify-center min-h-[40px] py-0 px-3 text-xs font-medium bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700 touch-manipulation"
                 >
                   今天
                 </button>
               </div>
             </div>
             <div className="flex gap-1.5 items-stretch overflow-x-auto pb-0.5 -mx-0.5 px-0.5 touch-pan-x">
               <div className="h-8 w-px bg-gray-300 shrink-0 self-center hidden sm:block" aria-hidden />
               <button
                 type="button"
                 onClick={() => setIsDutyListOpen(true)}
                 className="inline-flex items-center justify-center gap-1 min-h-[40px] py-2 px-3 text-xs font-medium whitespace-nowrap rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-colors shrink-0 touch-manipulation"
                 title="輪值列表管理"
               >
                 <List size={14} className="shrink-0" aria-hidden /> 輪值列表
               </button>
               <button
                 type="button"
                 onClick={handleOpenBatchDuty}
                 className="inline-flex items-center justify-center gap-1 min-h-[40px] py-2 px-3 text-xs font-medium whitespace-nowrap rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 transition-colors shrink-0 touch-manipulation"
                 title="設定處室輪值"
               >
                 <ShieldCheck size={14} className="shrink-0" aria-hidden /> 輪值設定
               </button>
               <button
                 type="button"
                 onClick={() => setIsMonthlyRecurringOpen(true)}
                 className="inline-flex items-center justify-center gap-1 min-h-[40px] py-2 px-3 text-xs font-medium whitespace-nowrap rounded-lg border border-teal-200 bg-teal-50 text-teal-800 hover:bg-teal-100 transition-colors shrink-0 touch-manipulation"
                 title="每月固定出現的事項，可指定西曆月份"
               >
                 <Repeat size={14} className="shrink-0" aria-hidden /> 每月固定事項
               </button>
             </div>
          </div>
          <div className="hidden sm:flex flex-wrap gap-3 text-[11px] text-gray-600 shrink-0">
              <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />緊急 (3天內)</div>
              <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-400 shrink-0" />注意 (7天內)</div>
          </div>
        </div>

        {/* Calendar Body */}
        <div
          className="flex-1 overflow-auto p-2 sm:p-4 min-h-0"
          onTouchStart={onCalendarTouchStart}
          onTouchEnd={onCalendarTouchEnd}
        >
             <div className="grid grid-cols-7 text-center mb-1 lg:mb-2">
                 {['日','一','二','三','四','五','六'].map(d => (
                   <div key={d} className="text-[10px] lg:text-xs font-bold text-gray-500 py-0.5 lg:py-1">
                     {d}
                   </div>
                 ))}
             </div>
             {!isLgUp && (
               <p className="text-[10px] text-gray-400 text-center mb-2">左右滑動可切換月份；點選日期可開啟「本日」事項</p>
             )}
             <div className="grid grid-cols-7 gap-0.5 lg:gap-1">
                 {renderCalendarGrid()}
             </div>
        </div>
      </div>

      {/* Right Column: Daily Tasks / Office Memos */}
      <div
        className={`w-full lg:w-96 rounded-xl shadow-sm border border-gray-200 flex flex-col min-h-0 overflow-hidden bg-white max-lg:min-h-[min(62dvh,560px)] max-lg:flex-1 ${
          !isLgUp && mobileSegment === 'calendar' ? 'hidden' : ''
        } lg:flex h-[600px] lg:h-auto`}
      >
          
          {/* Section 1: Daily Tasks (Top Half) */}
          <div
            className={`flex-1 flex flex-col min-h-0 border-b border-gray-200 ${
              !isLgUp && mobileSegment !== 'day' ? 'hidden' : ''
            } lg:flex`}
          >
             <div className="p-3 border-b border-gray-100 flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-center bg-blue-50/50">
                <div className="min-w-0">
                    <h3 className="font-bold text-gray-800 flex items-center gap-2 text-sm sm:text-base">
                        <Calendar size={18} className="text-blue-600 shrink-0"/>
                        <span className="tabular-nums">{selectedDate.getMonth() + 1}/{selectedDate.getDate()} 待辦</span>
                    </h3>
                </div>
                <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={handleAddTodo}
                      className="flex items-center justify-center min-h-[40px] px-3 py-2 bg-slate-800 text-white text-xs font-medium rounded-lg hover:bg-slate-900 transition-colors touch-manipulation"
                    >
                        <Plus size={14} className="mr-1 shrink-0"/> 新增待辦
                    </button>
                    <button
                      type="button"
                      onClick={handleAddDuty}
                      className="flex items-center justify-center min-h-[40px] px-3 py-2 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700 transition-colors touch-manipulation"
                    >
                        <ShieldCheck size={14} className="mr-1 shrink-0"/> 新增輪值
                    </button>
                </div>
             </div>

             <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-white">
                 {isVoucherDaySelected && (
                     <div className="bg-orange-50 rounded border border-orange-200 shadow-sm p-2 relative group hover:shadow">
                         <div className="flex items-center gap-2">
                             <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 shrink-0">
                                 <FileCheck size={16}/>
                             </div>
                             <div className="flex-1">
                                 <h4 className="font-bold text-sm text-orange-800">每月憑證製作提醒</h4>
                                 <p className="text-xs text-orange-600">請於5日前完成並送出憑證</p>
                             </div>
                         </div>
                     </div>
                 )}

                 {loading ? <div className="flex justify-center p-4"><Loader2 className="animate-spin text-blue-500"/></div> :
                 selectedDayOrdered.length === 0 && !isVoucherDaySelected ? (
                    <div className="text-center py-6 text-gray-400 text-sm">
                        <p>本日無事項</p>
                    </div>
                 ) : (
                    selectedDayOrdered.map((entry) => {
                        if (entry.kind === 'recurring') {
                          const rule = entry.rule;
                          const st = statusForRuleOnDate(rule, selectedDate);
                          const isDone = st === 'done';
                          const isCancelled = st === 'cancelled';
                          const urgency = getUrgencyLevel(recurringAsTodoForUrgency(rule, selectedDateStr, st));
                          let urgencyClass = 'border-l-4 border-l-teal-400';
                          if (urgency === 'critical') urgencyClass = 'border-l-4 border-l-red-500 shadow-red-100';
                          else if (urgency === 'warning') urgencyClass = 'border-l-4 border-l-orange-400';
                          else if (isDone) urgencyClass = 'border-l-4 border-l-gray-300 opacity-60';
                          else if (isCancelled) urgencyClass = 'border-l-4 border-l-gray-300 bg-gray-100 opacity-60';
                          return (
                            <div
                              key={`mr-${rule.id}`}
                              className={`bg-white rounded border border-teal-100 shadow-sm p-2 relative group hover:shadow ${urgencyClass}`}
                            >
                              <div className="flex items-start gap-2">
                                <button
                                  type="button"
                                  onClick={() => void toggleRecurringMonthDone(rule, selectedDate)}
                                  className={`mt-0.5 flex-shrink-0 ${isDone ? 'text-green-500' : 'text-gray-300 hover:text-teal-500'}`}
                                  title="標記本月已完成"
                                >
                                  {isDone ? <CheckCircle size={16} /> : <div className="w-4 h-4 rounded-full border-2 border-current" />}
                                </button>
                                <div className="flex-1 min-w-0">
                                  <h4
                                    className={`font-bold text-sm text-gray-800 truncate flex items-center gap-1 ${isDone || isCancelled ? 'line-through text-gray-500' : ''}`}
                                  >
                                    <Repeat size={14} className="text-teal-600 shrink-0" />
                                    {rule.title}
                                  </h4>
                                  <div className="flex flex-wrap gap-1 text-[10px] text-gray-500 mt-0.5">
                                    <span className="bg-teal-50 text-teal-800 px-1 rounded border border-teal-100">每月固定</span>
                                    <span className="bg-gray-100 px-1 rounded">{rule.type}</span>
                                  </div>
                                  {rule.memo ? <p className="text-xs text-slate-600 mt-1 whitespace-pre-wrap">{rule.memo}</p> : null}
                                </div>
                              </div>
                              <div className="absolute top-2 right-2 max-lg:opacity-100 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  type="button"
                                  onClick={() => setIsMonthlyRecurringOpen(true)}
                                  className="p-1 min-w-[44px] min-h-[32px] text-gray-500 hover:text-teal-600 text-[10px] touch-manipulation"
                                  title="至「每月固定事項」編輯"
                                >
                                  編輯規則
                                </button>
                              </div>
                            </div>
                          );
                        }
                        const todo = entry.todo;
                        if (todo.type === 'duty') {
                             return (
                                <div key={todo.id} className="bg-red-50 rounded border border-red-200 shadow-sm p-2 relative group hover:shadow">
                                    <div className="flex items-center gap-2">
                                        <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center text-red-600 shrink-0">
                                            {todo.period === 'am' ? <Sun size={16}/> : todo.period === 'pm' ? <Moon size={16}/> : <ShieldCheck size={16}/>}
                                        </div>
                                        <div className="flex-1">
                                            <h4 className="font-bold text-sm text-red-800">{todo.title}</h4>
                                            <p className="text-xs text-red-600">
                                                處室輪值 {todo.period === 'am' ? '(上午)' : todo.period === 'pm' ? '(下午)' : '(全日)'}
                                            </p>
                                        </div>
                                        <div className="max-lg:opacity-100 opacity-0 group-hover:opacity-100 transition-opacity flex gap-0.5">
                                            <button type="button" onClick={() => handleEditTodo(todo)} className="p-2 min-w-[40px] min-h-[40px] inline-flex items-center justify-center text-gray-500 hover:text-blue-600 touch-manipulation" aria-label="編輯"><Clock size={16}/></button>
                                            <button type="button" onClick={() => handleDeleteClick(todo)} className="p-2 min-w-[40px] min-h-[40px] inline-flex items-center justify-center text-gray-500 hover:text-red-600 touch-manipulation" aria-label="刪除"><Trash2 size={16}/></button>
                                        </div>
                                    </div>
                                </div>
                             );
                        }
                        
                        const urgency = getUrgencyLevel(todo);
                        const isDone = todo.status === 'done';
                        const isCancelled = todo.status === 'cancelled';
                        
                        let urgencyClass = 'border-l-4 border-l-blue-400';
                        if(urgency === 'critical') urgencyClass = 'border-l-4 border-l-red-500 shadow-red-100';
                        else if(urgency === 'warning') urgencyClass = 'border-l-4 border-l-orange-400';
                        else if(isDone) urgencyClass = 'border-l-4 border-l-gray-300 opacity-60';
                        else if(isCancelled) urgencyClass = 'border-l-4 border-l-gray-300 bg-gray-100 opacity-60';

                        return (
                            <div key={todo.id} className={`bg-white rounded border border-gray-100 shadow-sm p-2 relative group hover:shadow ${urgencyClass}`}>
                                <div className="flex items-start gap-2">
                                    <button onClick={() => toggleStatus(todo)} className={`mt-0.5 flex-shrink-0 ${isDone ? 'text-green-500' : 'text-gray-300 hover:text-blue-500'}`}>
                                        {isDone ? <CheckCircle size={16} /> : <div className="w-4 h-4 rounded-full border-2 border-current"></div>}
                                    </button>
                                    <div className="flex-1 min-w-0">
                                        <h4 onClick={() => handleEditTodo(todo)} className={`font-bold text-sm text-gray-800 cursor-pointer hover:text-blue-600 truncate ${isDone || isCancelled ? 'line-through text-gray-500' : ''}`}>
                                            {todo.title}
                                        </h4>
                                        <div className="flex flex-wrap gap-1 text-[10px] text-gray-500 mt-0.5">
                                            <span className="bg-gray-100 px-1 rounded">{todo.type}</span>
                                            {todo.topic && <span className="text-purple-600 bg-purple-50 px-1 rounded border border-purple-100">{todo.topic}</span>}
                                        </div>
                                    </div>
                                </div>
                                <div className="absolute top-2 right-2 max-lg:opacity-100 opacity-0 group-hover:opacity-100 transition-opacity flex gap-0.5">
                                    <button type="button" onClick={() => handleEditTodo(todo)} className="p-2 min-w-[40px] min-h-[40px] inline-flex items-center justify-center text-gray-500 hover:text-blue-600 touch-manipulation" aria-label="編輯"><Clock size={14}/></button>
                                    <button type="button" onClick={() => handleDeleteClick(todo)} className="p-2 min-w-[40px] min-h-[40px] inline-flex items-center justify-center text-gray-500 hover:text-red-600 touch-manipulation" aria-label="刪除"><Trash2 size={14}/></button>
                                </div>
                            </div>
                        );
                    })
                 )}
             </div>
          </div>

          {/* Section 2: Office Memos (Bottom Half) */}
          <div
            className={`flex-1 flex flex-col min-h-0 bg-indigo-50/30 ${
              !isLgUp && mobileSegment !== 'memos' ? 'hidden' : ''
            } lg:flex`}
          >
              <div className="p-3 border-b border-indigo-100 flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-center bg-indigo-50">
                  <div className="min-w-0">
                      <h3 className="font-bold text-indigo-900 flex items-center gap-2 flex-wrap text-sm sm:text-base">
                          <MessageSquare size={18} className="text-indigo-600 shrink-0"/> 
                          傳達留言
                          {memos.filter(m => m.status === 'pending').length > 0 && (
                              <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                                  {memos.filter(m => m.status === 'pending').length}
                              </span>
                          )}
                      </h3>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddMemo}
                    className="flex items-center justify-center min-h-[40px] px-3 py-2 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 transition-colors touch-manipulation shrink-0"
                  >
                      <Plus size={14} className="mr-1 shrink-0"/> 新增
                  </button>
              </div>

              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                  {loading ? <div className="flex justify-center p-4"><Loader2 className="animate-spin text-indigo-500"/></div> :
                  sortedMemos.length === 0 ? (
                      <div className="text-center py-6 text-gray-400 text-sm">
                          <p>目前無留言</p>
                      </div>
                  ) : (
                      sortedMemos.map(memo => {
                          const isDone = memo.status === 'done';
                          return (
                              <div key={memo.id} className={`bg-white rounded border border-gray-100 shadow-sm p-2 relative group hover:shadow border-l-4 ${isDone ? 'border-gray-300 opacity-60' : 'border-indigo-400'}`}>
                                  <div className="flex items-start gap-2">
                                      <button onClick={() => toggleStatus(memo)} className={`mt-0.5 flex-shrink-0 ${isDone ? 'text-green-500' : 'text-gray-300 hover:text-indigo-500'}`} title="標記為已處理">
                                          {isDone ? <CheckCircle size={16} /> : <div className="w-4 h-4 rounded-full border-2 border-current"></div>}
                                      </button>
                                      
                                      <div className="flex-1 min-w-0">
                                          <div className="flex justify-between items-start">
                                              <div className="flex items-center text-[10px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded mb-1 w-max">
                                                  <User size={10} className="mr-1"/> 給: {memo.topic || '未指定'}
                                              </div>
                                              <span className="text-[10px] text-gray-400">{memo.date}</span>
                                          </div>
                                          
                                          <div className={`text-sm font-medium text-gray-800 mb-1 whitespace-pre-wrap ${isDone ? 'line-through text-gray-500' : ''}`}>
                                              {memo.title}
                                          </div>

                                          {memo.contacts && memo.contacts.length > 0 && (
                                              <div className="text-[10px] text-gray-500 flex items-center gap-2">
                                                  <span className="flex items-center"><PhoneIncoming size={10} className="mr-1"/>{memo.contacts[0].name || '未知'}</span>
                                                  {memo.contacts[0].phone && <span>({memo.contacts[0].phone})</span>}
                                              </div>
                                          )}
                                      </div>
                                  </div>
                                  <div className="absolute top-2 right-2 max-lg:opacity-100 opacity-0 group-hover:opacity-100 transition-opacity flex gap-0.5">
                                      <button type="button" onClick={() => handleEditTodo(memo)} className="p-2 min-w-[40px] min-h-[40px] inline-flex items-center justify-center text-gray-500 hover:text-indigo-600 touch-manipulation" aria-label="編輯"><Clock size={14}/></button>
                                      <button type="button" onClick={() => handleDeleteClick(memo)} className="p-2 min-w-[40px] min-h-[40px] inline-flex items-center justify-center text-gray-500 hover:text-red-600 touch-manipulation" aria-label="刪除"><Trash2 size={14}/></button>
                                  </div>
                              </div>
                          );
                      })
                  )}
              </div>
          </div>
      </div>
    </div>
  );
};

export default TodoCalendar;
