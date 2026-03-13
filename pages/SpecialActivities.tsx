
import React, { useState, useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';
import { SpecialActivity, PayType, HOURLY_RATE, Teacher } from '../types';
import { calculatePay } from '../utils/calculations';
import { Plus, Edit2, Trash2, Search, X, Briefcase, Calendar, Calculator, Save, AlertCircle } from 'lucide-react';
import SearchableSelect from '../components/SearchableSelect';
import Modal, { ModalMode, ModalType } from '../components/Modal';
import InstructionPanel from '../components/InstructionPanel';

// Helper: Get Local Date String
const getLocalTodayDate = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const SpecialActivities: React.FC = () => {
  const { specialActivities, teachers, addActivity, updateActivity, deleteActivity, salaryGrades } = useAppStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  // Filter State
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  // Modal Feedback
  const [modal, setModal] = useState<{
      isOpen: boolean;
      title: string;
      message: string;
      type: ModalType;
      mode: ModalMode;
      onConfirm?: () => void;
  }>({ isOpen: false, title: '', message: '', type: 'info', mode: 'alert' });

  const showFeedback = (title: string, message: string, type: ModalType = 'info') => {
      setModal({ isOpen: true, title, message, type, mode: 'alert', onConfirm: undefined });
  };

  // Form State
  const [formData, setFormData] = useState<Omit<SpecialActivity, 'id'>>({
      title: '',
      date: getLocalTodayDate(),
      teacherId: '',
      payType: PayType.HOURLY,
      units: 1,
      amount: HOURLY_RATE,
      note: ''
  });

  // Derived Data
  const filteredActivities = useMemo(() => {
      return specialActivities
          .filter(a => a.date.startsWith(selectedMonth))
          .filter(a => a.title.includes(searchTerm) || a.teacherId.includes(searchTerm))
          .sort((a, b) => b.date.localeCompare(a.date));
  }, [specialActivities, selectedMonth, searchTerm]);

  const totalAmount = useMemo(() => {
      return filteredActivities.reduce((sum, a) => sum + a.amount, 0);
  }, [filteredActivities]);

  const teacherOptions = useMemo(() => {
      return teachers.map(t => ({ value: t.id, label: t.name, subLabel: t.type }));
  }, [teachers]);

  // Handlers
  const handleOpenModal = (activity?: SpecialActivity) => {
      if (activity) {
          setEditingId(activity.id);
          setFormData({
              title: activity.title,
              date: activity.date,
              teacherId: activity.teacherId,
              payType: activity.payType,
              units: activity.units,
              amount: activity.amount,
              note: activity.note || ''
          });
      } else {
          setEditingId(null);
          setFormData({
              title: '',
              date: getLocalTodayDate(),
              teacherId: '',
              payType: PayType.HOURLY,
              units: 1,
              amount: HOURLY_RATE,
              note: ''
          });
      }
      setIsModalOpen(true);
  };

  const handleCalculate = () => {
      if (!formData.teacherId) return;
      const teacher = teachers.find(t => t.id === formData.teacherId);
      
      // Reuse the existing calculation logic
      // Note: isHomeroomSubstitute is defaulted to false here unless we want to add a checkbox
      const amount = calculatePay(
          formData.payType, 
          teacher, 
          formData.date, 
          formData.units, 
          salaryGrades, 
          false
      );
      setFormData(prev => ({ ...prev, amount }));
  };

  // Auto-calculate when dependencies change
  React.useEffect(() => {
      handleCalculate();
  }, [formData.payType, formData.units, formData.teacherId, formData.date]);

  const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (!formData.teacherId || !formData.title) {
          showFeedback('資料不完整', '請填寫活動名稱與領款教師', 'warning');
          return;
      }

      if (editingId) {
          updateActivity({ ...formData, id: editingId });
          showFeedback('成功', '活動紀錄已更新', 'success');
      } else {
          addActivity({ ...formData, id: crypto.randomUUID() });
          showFeedback('成功', '新增活動紀錄成功', 'success');
      }
      setIsModalOpen(false);
  };

  const handleDelete = (id: string) => {
      setModal({
          isOpen: true,
          title: '確認刪除',
          message: '確定要刪除此筆活動紀錄嗎？',
          type: 'warning',
          mode: 'confirm',
          onConfirm: () => {
              deleteActivity(id);
              setModal(prev => ({ ...prev, isOpen: false }));
          }
      });
  };

  return (
    <div className="p-8 pb-32">
      <Modal 
        isOpen={modal.isOpen} 
        onClose={() => setModal({...modal, isOpen: false})} 
        onConfirm={modal.onConfirm}
        title={modal.title}
        message={modal.message}
        type={modal.type}
        mode={modal.mode}
      />

      <header className="mb-6 flex justify-between items-end">
        <div>
           <h1 className="text-3xl font-bold text-slate-800 flex items-center">
              <Briefcase className="mr-3 text-emerald-600" />
              專案活動核銷
           </h1>
           <p className="text-slate-500 mt-2">
               管理非常態性代課或活動薪資 (如：社團、補救教學、研習講師費)。
           </p>
        </div>
        
        <div className="flex items-center space-x-4">
             {/* Month Selector */}
             <input 
                type="month" 
                className="px-4 py-2 border border-slate-300 rounded-lg shadow-sm font-bold text-slate-700"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
             />
             
             <button 
                onClick={() => handleOpenModal()}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors shadow-sm font-bold"
             >
                <Plus size={20} />
                <span>新增活動</span>
             </button>
        </div>
      </header>

      <InstructionPanel title="使用說明：專案活動核銷">
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>功能概述：</strong>管理非常態性的代課或活動薪資，例如社團、補救教學、研習講師費等。</li>
          <li><strong>新增活動：</strong>
             <ul className="list-circle pl-5 mt-1 text-slate-500">
               <li>點擊「新增活動」按鈕，填寫活動名稱、日期與領款教師。</li>
               <li>系統會根據教師職級自動計算建議金額，您也可以手動修改總金額。</li>
             </ul>
          </li>
          <li><strong>查詢與管理：</strong>上方可選擇月份篩選，或使用搜尋框查找特定活動或教師。</li>
        </ul>
      </InstructionPanel>

      {/* Stats Bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
              <span className="text-slate-500 text-sm font-bold">本月活動數</span>
              <span className="text-2xl font-bold text-slate-800">{filteredActivities.length}</span>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
              <span className="text-slate-500 text-sm font-bold">總金額</span>
              <span className="text-2xl font-bold text-emerald-600">${totalAmount.toLocaleString()}</span>
          </div>
          <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
              <input 
                type="text" 
                placeholder="搜尋活動或教師..." 
                className="w-full pl-10 pr-4 py-4 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm h-full"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
          </div>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
         <div className="overflow-x-auto">
             <table className="w-full text-left whitespace-nowrap">
                 <thead className="bg-slate-50 border-b border-slate-200">
                     <tr>
                         <th className="px-6 py-4 font-semibold text-slate-700">日期</th>
                         <th className="px-6 py-4 font-semibold text-slate-700">活動名稱</th>
                         <th className="px-6 py-4 font-semibold text-slate-700">領款教師</th>
                         <th className="px-6 py-4 font-semibold text-slate-700">計算方式</th>
                         <th className="px-6 py-4 font-semibold text-slate-700 text-right">金額</th>
                         <th className="px-6 py-4 font-semibold text-slate-700">備註</th>
                         <th className="px-6 py-4 font-semibold text-slate-700 text-right">操作</th>
                     </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-200">
                     {filteredActivities.map((activity) => {
                         const teacher = teachers.find(t => t.id === activity.teacherId);
                         return (
                             <tr key={activity.id} className="hover:bg-slate-50 transition-colors">
                                 <td className="px-6 py-4 font-mono text-slate-600">{activity.date}</td>
                                 <td className="px-6 py-4 font-bold text-slate-800">{activity.title}</td>
                                 <td className="px-6 py-4">
                                     <div className="text-slate-800 font-medium">{teacher?.name || activity.teacherId}</div>
                                     <div className="text-xs text-slate-400">{teacher?.type}</div>
                                 </td>
                                 <td className="px-6 py-4 text-sm text-slate-600">
                                     <span className={`px-2 py-0.5 rounded text-xs mr-2 ${activity.payType === PayType.HOURLY ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-600'}`}>
                                         {activity.payType}
                                     </span>
                                     <span>{activity.units} {activity.payType === PayType.HOURLY ? '節' : '日'}</span>
                                 </td>
                                 <td className="px-6 py-4 text-right font-bold text-emerald-600">
                                     ${activity.amount.toLocaleString()}
                                 </td>
                                 <td className="px-6 py-4 text-sm text-slate-500 max-w-xs truncate">
                                     {activity.note || '-'}
                                 </td>
                                 <td className="px-6 py-4 text-right space-x-2">
                                     <button onClick={() => handleOpenModal(activity)} className="text-indigo-600 hover:text-indigo-900 p-1">
                                         <Edit2 size={18} />
                                     </button>
                                     <button onClick={() => handleDelete(activity.id)} className="text-red-500 hover:text-red-700 p-1">
                                         <Trash2 size={18} />
                                     </button>
                                 </td>
                             </tr>
                         );
                     })}
                     {filteredActivities.length === 0 && (
                         <tr>
                             <td colSpan={7} className="py-12 text-center text-slate-400 flex flex-col items-center justify-center w-full">
                                 <div className="bg-slate-50 p-4 rounded-full mb-3">
                                     <Calendar size={32} className="text-slate-300" />
                                 </div>
                                 <span>此月份尚無活動紀錄</span>
                             </td>
                         </tr>
                     )}
                 </tbody>
             </table>
         </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 animate-in zoom-in-95">
            <div className="flex justify-between items-center mb-6 border-b pb-4">
              <h2 className="text-xl font-bold text-slate-800 flex items-center">
                  {editingId ? <Edit2 size={20} className="mr-2"/> : <Plus size={20} className="mr-2"/>}
                  {editingId ? '編輯活動' : '新增活動'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={24} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              
              <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">活動名稱</label>
                  <input required type="text" className="w-full px-3 py-2 border rounded-lg" placeholder="例: 週三社團、補救教學" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                  <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">日期</label>
                      <input required type="date" className="w-full px-3 py-2 border rounded-lg" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} />
                  </div>
                  <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">領款教師</label>
                      <SearchableSelect 
                          options={teacherOptions}
                          value={formData.teacherId}
                          onChange={(val) => setFormData({...formData, teacherId: val})}
                          placeholder="選擇教師..."
                      />
                  </div>
              </div>

              <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                  <h3 className="text-xs font-bold text-slate-500 uppercase mb-3 flex items-center">
                      <Calculator size={14} className="mr-1"/> 薪資計算
                  </h3>
                  <div className="grid grid-cols-2 gap-4 mb-3">
                      <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">支薪方式</label>
                          <select className="w-full px-2 py-1.5 border rounded text-sm" value={formData.payType} onChange={e => setFormData({...formData, payType: e.target.value as PayType})}>
                              <option value={PayType.HOURLY}>鐘點費</option>
                              <option value={PayType.DAILY}>日薪</option>
                          </select>
                      </div>
                      <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">數量 ({formData.payType === PayType.HOURLY ? '節' : '日'})</label>
                          <input type="number" step="0.5" className="w-full px-2 py-1.5 border rounded text-sm" value={formData.units} onChange={e => setFormData({...formData, units: Number(e.target.value)})} />
                      </div>
                  </div>
                  <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">總金額 (可手動修改)</label>
                      <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                          <input type="number" className="w-full pl-6 pr-3 py-2 border border-emerald-200 rounded text-emerald-700 font-bold focus:ring-emerald-500" value={formData.amount} onChange={e => setFormData({...formData, amount: Number(e.target.value)})} />
                      </div>
                  </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">備註</label>
                <textarea className="w-full px-3 py-2 border rounded-lg h-20 resize-none text-sm" value={formData.note} onChange={e => setFormData({...formData, note: e.target.value})} placeholder="選填"></textarea>
              </div>

              <div className="pt-4 flex space-x-3 border-t">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 px-4 py-3 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-bold">
                  取消
                </button>
                <button type="submit" className="flex-1 px-4 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-bold shadow-md flex items-center justify-center">
                  <Save size={18} className="mr-2"/>
                  儲存活動
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default SpecialActivities;
