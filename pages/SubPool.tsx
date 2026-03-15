
import React, { useState, useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';
import { Search, Plus, Trash2, Save, Users, UserCheck, AlertCircle, Loader2, Filter, Clock, BookOpen, GraduationCap, CalendarX, X } from 'lucide-react';
import Modal, { ModalMode, ModalType } from '../components/Modal';
import { SubPoolItem, COMMON_SUBJECTS, COMMON_GRADES } from '../types';
import TableTagInput from '../components/TableTagInput';
import InstructionPanel from '../components/InstructionPanel';

const SubPool: React.FC = () => {
  const { teachers, subPool, addToSubPool, removeFromSubPool, updateSubPoolItem } = useAppStore();
  
  // Search & Filter State for Left Panel
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'INTERNAL' | 'EXTERNAL'>('EXTERNAL'); // Default to external

  // Search & Filter for Right Panel
  const [poolSearchTerm, setPoolSearchTerm] = useState('');
  const [poolFilters, setPoolFilters] = useState({
      status: '',
      day: '',
      grade: '',
      subject: ''
  });

  // Modal
  const [modal, setModal] = useState<{
      isOpen: boolean; title: string; message: string; type: ModalType
  }>({ isOpen: false, title: '', message: '', type: 'info' });
  const [deleteFromPoolTeacherId, setDeleteFromPoolTeacherId] = useState<string | null>(null);

  // IME 組字期間不更新父層 state，避免中文輸入被中斷（key: teacherId_fieldName）
  const [imeState, setImeState] = useState<{ composingKey: string; localValue: string } | null>(null);
  const imeKey = (teacherId: string, field: string) => `${teacherId}_${field}`;
  const isComposing = (key: string) => imeState?.composingKey === key;
  const imeValue = (key: string) => imeState?.composingKey === key ? imeState.localValue : undefined;

  // --- Left Panel Logic (Source) ---
  const sourceTeachers = useMemo(() => {
      // 1. Exclude already in pool
      const poolIds = new Set(subPool.map(item => item.teacherId));
      
      return teachers.filter(t => {
          if (poolIds.has(t.id)) return false;
          if (filterType !== 'ALL' && t.type !== (filterType === 'INTERNAL' ? '校內教師' : '校外教師')) return false;
          
          const matchName = t.name.toLowerCase().includes(searchTerm.toLowerCase());
          const matchExpertise = t.expertise?.some(ex => ex.includes(searchTerm));
          return matchName || matchExpertise;
      });
  }, [teachers, subPool, filterType, searchTerm]);

  // --- Right Panel Logic (Pool) ---
  const poolList = useMemo(() => {
      return subPool.map(item => {
          const teacher = teachers.find(t => t.id === item.teacherId);
          
          return {
              ...item,
              teacherName: teacher?.name || item.teacherId,
              teacherPhone: teacher?.phone || '',
              teacherExpertise: teacher?.expertise || [],
              teacherType: teacher?.type
          };
      }).filter(item => {
          // 1. Text Search
          const term = poolSearchTerm.toLowerCase();
          const matchesText = (
              item.teacherName.toLowerCase().includes(term) || 
              (item.teachingSubject && item.teachingSubject.includes(term)) ||
              (item.preferredGrades && item.preferredGrades.includes(term)) ||
              (item.availableTime && item.availableTime.includes(term)) ||
              (item.note && item.note.includes(term))
          );
          if (!matchesText) return false;

          // 2. Advanced Filters
          if (poolFilters.status && item.status !== poolFilters.status) return false;
          if (poolFilters.day && !item.availableTime?.includes(poolFilters.day)) return false;
          if (poolFilters.grade && !item.preferredGrades?.includes(poolFilters.grade)) return false;
          if (poolFilters.subject && !item.teachingSubject?.includes(poolFilters.subject)) return false;

          return true;
      });
  }, [subPool, teachers, poolSearchTerm, poolFilters]);

  // --- Handlers ---

  const handleAddWithDefaults = (teacherId: string) => {
      const teacher = teachers.find(t => t.id === teacherId);
      const defaultExpertise = teacher?.expertise?.join(',') || '';
      
      addToSubPool(teacherId);
      
      // If adding, we can immediately pre-fill the teachingSubject with existing expertise
      if (defaultExpertise) {
          setTimeout(() => {
              updateSubPoolItem({ 
                  teacherId, 
                  status: 'available', 
                  note: '', 
                  updatedAt: Date.now(), 
                  teachingSubject: defaultExpertise 
              });
          }, 50);
      }
  };

  const clearFilters = () => {
      setPoolFilters({ status: '', day: '', grade: '', subject: '' });
      setPoolSearchTerm('');
  };

  const statusColors: Record<string, string> = {
      'available': 'bg-green-100 text-green-700 border-green-200',
      'busy': 'bg-red-100 text-red-700 border-red-200',
      'observation': 'bg-amber-100 text-amber-700 border-amber-200'
  };

  const hasActiveFilters = poolSearchTerm || Object.values(poolFilters).some(Boolean);

  return (
    <div className="p-8 h-full flex flex-col">
      <Modal isOpen={modal.isOpen} onClose={() => setModal({ ...modal, isOpen: false })} title={modal.title} message={modal.message} type={modal.type} />
      <Modal
        isOpen={!!deleteFromPoolTeacherId}
        onClose={() => setDeleteFromPoolTeacherId(null)}
        onConfirm={() => { if (deleteFromPoolTeacherId) { removeFromSubPool(deleteFromPoolTeacherId); setDeleteFromPoolTeacherId(null); } }}
        title="確認從人力庫移除"
        message={deleteFromPoolTeacherId ? `確定要將「${teachers.find(t => t.id === deleteFromPoolTeacherId)?.name ?? deleteFromPoolTeacherId}」從代課人力庫移除嗎？` : ''}
        type="warning"
        mode="confirm"
        confirmText="移除"
        cancelText="取消"
      />

      <header className="mb-6 flex justify-between items-center">
        <div>
           <h1 className="text-3xl font-bold text-slate-800 flex items-center">
              <UserCheck className="mr-3 text-indigo-600" />
              代課人力庫管理
           </h1>
           <p className="text-slate-500 mt-2">
               從教師名單中挑選並維護常用代課人力，記錄可配合時間、學年與專長。
           </p>
        </div>
      </header>

      <InstructionPanel title="使用說明：代課人力庫管理">
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>加入人力庫：</strong>從左側「候選名單」搜尋教師，點擊「+」按鈕加入右側人力庫。</li>
          <li><strong>資料維護：</strong>
             <ul className="list-circle pl-5 mt-1 text-slate-500">
               <li>在右側列表可直接編輯教師的「狀態」、「代課時間」、「不接課時段」、「願意代課學年」與「專長領域」。</li>
               <li>使用標籤輸入框時，輸入文字後按 Enter 即可新增標籤。</li>
             </ul>
          </li>
          <li><strong>資料儲存：</strong>所有變更皆會自動儲存至 Firebase 資料庫。</li>
        </ul>
      </InstructionPanel>

      <div className="flex gap-6 flex-1 h-0">
          
          {/* Left Panel: Source List */}
          <div className="w-80 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden shrink-0">
              <div className="p-4 border-b border-slate-200 bg-slate-50">
                  <h3 className="font-bold text-slate-700 mb-3 flex items-center">
                      <Users size={18} className="mr-2"/> 候選名單
                  </h3>
                  
                  {/* Filters */}
                  <div className="flex bg-white rounded-lg p-1 border border-slate-200 mb-3">
                      <button onClick={() => setFilterType('EXTERNAL')} className={`flex-1 text-xs py-1.5 rounded font-bold transition-colors ${filterType === 'EXTERNAL' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500 hover:bg-slate-50'}`}>校外</button>
                      <button onClick={() => setFilterType('INTERNAL')} className={`flex-1 text-xs py-1.5 rounded font-bold transition-colors ${filterType === 'INTERNAL' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500 hover:bg-slate-50'}`}>校內</button>
                      <button onClick={() => setFilterType('ALL')} className={`flex-1 text-xs py-1.5 rounded font-bold transition-colors ${filterType === 'ALL' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500 hover:bg-slate-50'}`}>全部</button>
                  </div>

                  <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                      <input 
                          type="text" 
                          placeholder="搜尋姓名或專長..." 
                          className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                      />
                  </div>
              </div>
              
              <div className="flex-1 overflow-y-auto p-2">
                  {sourceTeachers.length === 0 ? (
                      <div className="text-center py-10 text-slate-400 text-sm">沒有符合的教師</div>
                  ) : (
                      sourceTeachers.map(teacher => (
                          <div key={teacher.id} className="p-3 mb-2 bg-white border border-slate-200 rounded-lg hover:border-indigo-300 hover:shadow-sm transition-all group flex justify-between items-center">
                              <div>
                                  <div className="font-bold text-slate-700">{teacher.name}</div>
                                  <div className="text-xs text-slate-500 mt-0.5">
                                      {teacher.expertise && teacher.expertise.length > 0 ? (
                                          <span className="text-indigo-500">{teacher.expertise.join(', ')}</span>
                                      ) : (
                                          <span>{teacher.type}</span>
                                      )}
                                  </div>
                              </div>
                              <button 
                                  onClick={() => handleAddWithDefaults(teacher.id)}
                                  className="w-8 h-8 rounded-full bg-slate-100 text-slate-400 group-hover:bg-indigo-600 group-hover:text-white flex items-center justify-center transition-colors"
                              >
                                  <Plus size={18} />
                              </button>
                          </div>
                      ))
                  )}
              </div>
          </div>

          {/* Right Panel: Pool List */}
          <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
              <div className="p-4 border-b border-slate-200 bg-indigo-50">
                  <div className="flex justify-between items-center mb-3">
                      <h3 className="font-bold text-indigo-900 flex items-center">
                          <UserCheck size={18} className="mr-2"/> 目前人力庫 ({poolList.length})
                      </h3>
                      {hasActiveFilters && (
                          <button onClick={clearFilters} className="text-xs text-slate-500 hover:text-red-500 flex items-center bg-white px-2 py-1 rounded border border-slate-200 hover:border-red-200 transition-colors">
                              <X size={12} className="mr-1"/> 清除篩選
                          </button>
                      )}
                  </div>
                  
                  {/* Filter Toolbar */}
                  <div className="flex flex-wrap gap-2">
                      <div className="relative flex-1 min-w-[150px]">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-300" size={16} />
                          <input 
                              type="text" 
                              placeholder="搜尋關鍵字..." 
                              className="w-full pl-9 pr-3 py-1.5 border border-indigo-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white/80"
                              value={poolSearchTerm}
                              onChange={(e) => setPoolSearchTerm(e.target.value)}
                          />
                      </div>
                      
                      <select 
                          className="px-3 py-1.5 border border-indigo-200 rounded-lg text-sm bg-white/80 focus:ring-2 focus:ring-indigo-500 outline-none text-slate-700 min-w-[100px]"
                          value={poolFilters.status}
                          onChange={(e) => setPoolFilters({...poolFilters, status: e.target.value})}
                      >
                          <option value="">所有狀態</option>
                          <option value="available">可排課</option>
                          <option value="busy">忙碌</option>
                          <option value="observation">觀察中</option>
                      </select>

                      <select 
                          className="px-3 py-1.5 border border-indigo-200 rounded-lg text-sm bg-white/80 focus:ring-2 focus:ring-indigo-500 outline-none text-slate-700 min-w-[100px]"
                          value={poolFilters.day}
                          onChange={(e) => setPoolFilters({...poolFilters, day: e.target.value})}
                      >
                          <option value="">所有時間</option>
                          <option value="週一">週一</option>
                          <option value="週二">週二</option>
                          <option value="週三">週三</option>
                          <option value="週四">週四</option>
                          <option value="週五">週五</option>
                      </select>

                      <select 
                          className="px-3 py-1.5 border border-indigo-200 rounded-lg text-sm bg-white/80 focus:ring-2 focus:ring-indigo-500 outline-none text-slate-700 min-w-[100px]"
                          value={poolFilters.grade}
                          onChange={(e) => setPoolFilters({...poolFilters, grade: e.target.value})}
                      >
                          <option value="">所有年級</option>
                          {COMMON_GRADES.map(g => <option key={g} value={g}>{g}</option>)}
                      </select>

                      <select 
                          className="px-3 py-1.5 border border-indigo-200 rounded-lg text-sm bg-white/80 focus:ring-2 focus:ring-indigo-500 outline-none text-slate-700 min-w-[100px]"
                          value={poolFilters.subject}
                          onChange={(e) => setPoolFilters({...poolFilters, subject: e.target.value})}
                      >
                          <option value="">所有專長</option>
                          {COMMON_SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                  </div>
              </div>

              <div className="flex-1 overflow-y-auto">
                  <table className="w-full text-left border-collapse">
                      <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase">
                          <tr>
                              <th className="px-4 py-3 w-32">授課老師</th>
                              <th className="px-2 py-3 w-24 text-center">狀態</th>
                              <th className="px-3 py-3 w-32">代課時間</th>
                              <th className="px-3 py-3 w-32">不接課時段</th>
                              <th className="px-3 py-3 w-40">願意代課學年</th>
                              <th className="px-3 py-3 w-40">專長領域</th>
                              <th className="px-3 py-3">備註</th>
                              <th className="px-2 py-3 w-12 text-center"></th>
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 text-sm">
                          {poolList.map(item => (
                              <tr key={item.teacherId} className="hover:bg-slate-50 transition-colors">
                                  <td className="px-4 py-3">
                                      <div className="font-bold text-slate-800">{item.teacherName}</div>
                                      <div className="text-xs text-slate-500 mt-0.5">{item.teacherPhone}</div>
                                  </td>
                                  
                                  <td className="px-2 py-3 text-center">
                                      <select 
                                          className={`text-xs font-bold px-2 py-1 rounded-full border outline-none cursor-pointer shadow-sm appearance-none text-center w-20 ${statusColors[item.status]}`}
                                          value={item.status}
                                          onChange={(e) => updateSubPoolItem({ ...item, status: e.target.value as any })}
                                      >
                                          <option value="available">可排課</option>
                                          <option value="busy">忙碌</option>
                                          <option value="observation">觀察</option>
                                      </select>
                                  </td>

                                  <td className="px-3 py-3 align-top">
                                      <div className="relative pt-1">
                                          <Clock size={12} className="absolute left-0 top-2.5 text-slate-400"/>
                                          <input 
                                              type="text" 
                                              className="w-full pl-4 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-indigo-500 outline-none text-slate-700 transition-colors placeholder-slate-300 text-xs py-1"
                                              placeholder="例:週一"
                                              value={isComposing(imeKey(item.teacherId, 'availableTime')) ? imeValue(imeKey(item.teacherId, 'availableTime'))! : (item.availableTime || '')}
                                              onCompositionStart={() => setImeState({ composingKey: imeKey(item.teacherId, 'availableTime'), localValue: item.availableTime || '' })}
                                              onCompositionEnd={(e) => {
                                                  const v = (e.target as HTMLInputElement).value;
                                                  updateSubPoolItem({ ...item, availableTime: v });
                                                  setImeState(null);
                                              }}
                                              onChange={(e) => {
                                                  const key = imeKey(item.teacherId, 'availableTime');
                                                  if (isComposing(key)) setImeState(s => s ? { ...s, localValue: e.target.value } : null);
                                                  else updateSubPoolItem({ ...item, availableTime: e.target.value });
                                              }}
                                          />
                                      </div>
                                  </td>

                                  <td className="px-3 py-3 align-top">
                                      <div className="relative pt-1">
                                          <CalendarX size={12} className="absolute left-0 top-2.5 text-rose-400"/>
                                          <input 
                                              type="text" 
                                              className="w-full pl-4 bg-transparent border-b border-transparent hover:border-rose-300 focus:border-rose-500 outline-none text-rose-700 transition-colors placeholder-slate-300 text-xs py-1"
                                              placeholder="不接時段"
                                              value={isComposing(imeKey(item.teacherId, 'unavailableTime')) ? imeValue(imeKey(item.teacherId, 'unavailableTime'))! : (item.unavailableTime || '')}
                                              onCompositionStart={() => setImeState({ composingKey: imeKey(item.teacherId, 'unavailableTime'), localValue: item.unavailableTime || '' })}
                                              onCompositionEnd={(e) => {
                                                  const v = (e.target as HTMLInputElement).value;
                                                  updateSubPoolItem({ ...item, unavailableTime: v });
                                                  setImeState(null);
                                              }}
                                              onChange={(e) => {
                                                  const key = imeKey(item.teacherId, 'unavailableTime');
                                                  if (isComposing(key)) setImeState(s => s ? { ...s, localValue: e.target.value } : null);
                                                  else updateSubPoolItem({ ...item, unavailableTime: e.target.value });
                                              }}
                                          />
                                      </div>
                                  </td>

                                  <td className="px-3 py-3 align-top">
                                      <div className="flex items-start">
                                          <GraduationCap size={14} className="mt-2 mr-1 text-slate-400 flex-shrink-0"/>
                                          <TableTagInput
                                              value={item.preferredGrades || ''}
                                              onChange={(val) => updateSubPoolItem({ ...item, preferredGrades: val })}
                                              suggestions={COMMON_GRADES}
                                              placeholder="年級標籤"
                                              colorTheme="amber"
                                          />
                                      </div>
                                  </td>

                                  <td className="px-3 py-3 align-top">
                                      <div className="flex items-start">
                                          <BookOpen size={14} className="mt-2 mr-1 text-slate-400 flex-shrink-0"/>
                                          <TableTagInput
                                              value={item.teachingSubject || ''}
                                              onChange={(val) => updateSubPoolItem({ ...item, teachingSubject: val })}
                                              suggestions={COMMON_SUBJECTS}
                                              placeholder="專長標籤"
                                              colorTheme="indigo"
                                          />
                                      </div>
                                  </td>

                                  <td className="px-3 py-3 align-top">
                                      <textarea 
                                          className="w-full bg-transparent border border-transparent hover:border-slate-300 focus:border-indigo-500 outline-none text-slate-700 transition-colors placeholder-slate-300 text-xs py-1 rounded resize-none h-16"
                                          placeholder="備註..."
                                          value={isComposing(imeKey(item.teacherId, 'note')) ? imeValue(imeKey(item.teacherId, 'note'))! : (item.note ?? '')}
                                          onCompositionStart={() => setImeState({ composingKey: imeKey(item.teacherId, 'note'), localValue: item.note ?? '' })}
                                          onCompositionEnd={(e) => {
                                              const v = (e.target as HTMLTextAreaElement).value;
                                              updateSubPoolItem({ ...item, note: v });
                                              setImeState(null);
                                          }}
                                          onChange={(e) => {
                                              const key = imeKey(item.teacherId, 'note');
                                              if (isComposing(key)) setImeState(s => s ? { ...s, localValue: e.target.value } : null);
                                              else updateSubPoolItem({ ...item, note: e.target.value });
                                          }}
                                      />
                                  </td>

                                  <td className="px-2 py-3 text-center align-middle">
                                      <button 
                                          type="button"
                                          onClick={() => setDeleteFromPoolTeacherId(item.teacherId)}
                                          className="text-slate-300 hover:text-red-500 p-1.5 rounded-full hover:bg-red-50 transition-colors"
                                          title="從人力庫移除"
                                      >
                                          <Trash2 size={16} />
                                      </button>
                                  </td>
                              </tr>
                          ))}
                          {poolList.length === 0 && (
                              <tr>
                                  <td colSpan={8} className="py-12 text-center text-slate-400">
                                      <div className="bg-slate-50 p-4 rounded-full inline-block mb-3">
                                          {hasActiveFilters ? <Filter size={32} className="text-slate-300"/> : <AlertCircle size={32} className="text-slate-300"/>}
                                      </div>
                                      <div>{hasActiveFilters ? '沒有符合篩選條件的資料' : '人力庫目前為空，請從左側加入教師'}</div>
                                  </td>
                              </tr>
                          )}
                      </tbody>
                  </table>
              </div>
          </div>

      </div>
    </div>
  );
};

export default SubPool;
