
import React, { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';
import { Users, FileText, DollarSign, Calendar, CloudDownload, Loader2, Database } from 'lucide-react';
import { Link } from 'react-router-dom';
import Modal, { ModalMode, ModalType } from '../components/Modal';
import InstructionPanel, { CollapsibleItem } from '../components/InstructionPanel';

const StatCard: React.FC<{ title: string; value: string | number; icon: React.ReactNode; color: string }> = ({ title, value, icon, color }) => (
  <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex items-center space-x-4">
    <div className={`p-4 rounded-full ${color} text-white`}>
      {icon}
    </div>
    <div>
      <h3 className="text-sm font-medium text-slate-500">{title}</h3>
      <p className="text-2xl font-bold text-slate-800">{value}</p>
    </div>
  </div>
);

const Dashboard: React.FC = () => {
  const { teachers, records, loadFromGas, settings, loading: storeLoading } = useAppStore();
  const [isLoading, setIsLoading] = useState(false);
  const hasAutoLoaded = useRef(false);

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

  const totalCost = records.reduce((sum, record) => {
    return sum + record.details.reduce((dSum, detail) => dSum + detail.calculatedAmount, 0);
  }, 0);

  const currentMonth = new Date().getMonth();
  const thisMonthRecords = records.filter(r => {
      const isThisMonth = new Date(r.startDate).getMonth() === currentMonth;
      const isPending = r.processingStatus === '待處理';
      return isThisMonth && isPending;
  });

  // Auto-load data on mount - REMOVED
  // useEffect(() => { ... }, []);

  // Helper to format date string simply
  const formatDate = (dateStr: string) => {
      if (!dateStr) return '-';
      // Handle ISO strings (e.g., 2026-03-08T16:00...) or simple YYYY-MM-DD
      return dateStr.split('T')[0];
  };

  const hasData = teachers.length > 0 || records.length > 0;

  return (
    <div className="p-8 space-y-8">
      <Modal 
        isOpen={modal.isOpen} 
        onClose={closeModal} 
        onConfirm={modal.onConfirm}
        title={modal.title}
        message={modal.message}
        type={modal.type}
        mode={modal.mode}
      />

      <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 md:gap-0">
        <div>
           <h1 className="text-2xl md:text-3xl font-bold text-slate-800">系統儀表板</h1>
           <p className="text-slate-500 mt-2 text-sm md:text-base">歡迎回來，查看本月代課概況。</p>
        </div>
      </header>

      <InstructionPanel title="使用說明：系統儀表板">
        <div className="space-y-1">
          <CollapsibleItem title="系統概況">
            <p>顯示目前的教師總數、代課紀錄與本月待處理案件，讓您快速掌握行政進度。</p>
          </CollapsibleItem>
          <CollapsibleItem title="資料來源與儲存">
            <p>系統已全面遷移至 Firebase 雲端資料庫。所有資料皆為即時讀取與自動儲存，無需手動點擊存檔按鈕。</p>
          </CollapsibleItem>
          <CollapsibleItem title="快速操作指引">
            <p>點擊下方的「建立新代課單」可開始登記請假與代課；「管理教師名單」則用於維護校內外教師的基本資料與薪級。</p>
          </CollapsibleItem>
        </div>
      </InstructionPanel>

      {!hasData && !storeLoading ? (
        <div className="bg-white rounded-xl shadow-sm border-2 border-dashed border-slate-300 p-12 text-center flex flex-col items-center">
             <div className="bg-slate-100 p-4 rounded-full mb-4">
                <Database size={48} className="text-slate-400" />
             </div>
             <h2 className="text-xl font-bold text-slate-800 mb-2">尚未建立資料</h2>
             <p className="text-slate-500 mb-6 max-w-md">
                您的系統目前是空的。請前往「教師管理」新增教師，或「建立新代課單」開始使用。
             </p>
             <Link 
                to="/teachers"
                className="bg-indigo-600 text-white px-6 py-3 rounded-lg hover:bg-indigo-700 shadow-md flex items-center space-x-2"
             >
                <Users size={20} />
                <span>前往教師管理</span>
             </Link>
        </div>
      ) : (
        <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard 
                title="教師總數" 
                value={storeLoading ? '-' : teachers.length} 
                icon={<Users size={24} />} 
                color="bg-blue-500" 
                />
                <StatCard 
                title="代課紀錄 (總計)" 
                value={storeLoading ? '-' : records.length} 
                icon={<FileText size={24} />} 
                color="bg-emerald-500" 
                />
                <StatCard 
                title="本月待處理" 
                value={storeLoading ? '-' : thisMonthRecords.length} 
                icon={<Calendar size={24} />} 
                color="bg-amber-500" 
                />
                <StatCard 
                title="累積金額 (估算)" 
                value={storeLoading ? '-' : `$${totalCost.toLocaleString()}`} 
                icon={<DollarSign size={24} />} 
                color="bg-indigo-500" 
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold text-slate-800">快速操作</h2>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <Link to="/entry" className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-indigo-200 rounded-xl hover:bg-indigo-50 hover:border-indigo-400 transition-all group">
                    <div className="bg-indigo-100 p-3 rounded-full text-indigo-600 mb-3 group-hover:scale-110 transition-transform">
                        <FileText size={24} />
                    </div>
                    <span className="font-semibold text-slate-700">建立新代課單</span>
                    </Link>
                    <Link to="/teachers" className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-slate-200 rounded-xl hover:bg-slate-50 hover:border-slate-400 transition-all group">
                    <div className="bg-slate-100 p-3 rounded-full text-slate-600 mb-3 group-hover:scale-110 transition-transform">
                        <Users size={24} />
                    </div>
                    <span className="font-semibold text-slate-700">管理教師名單</span>
                    </Link>
                </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold text-slate-800">近期紀錄</h2>
                    <Link to="/records" className="text-indigo-600 hover:text-indigo-800 text-sm font-medium">查看全部</Link>
                </div>
                <div className="space-y-4">
                    {records.slice(0, 5).map(record => {
                    const teacherObj = teachers.find(t => t.id === record.originalTeacherId);
                    // 修正：如果找不到 Teacher 物件，直接顯示 originalTeacherId (因系統常將姓名作為 ID)
                    const teacherName = teacherObj ? teacherObj.name : (record.originalTeacherId || '未知');
                    
                    return (
                        <div key={record.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                        <div>
                            <p className="font-medium text-slate-800">{teacherName} 請假</p>
                            <p className="text-xs text-slate-500 font-mono mt-1">
                                {formatDate(record.startDate)} ~ {formatDate(record.endDate)}
                            </p>
                        </div>
                        <div className="text-right">
                            <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${record.leaveType.includes('公付') ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
                            {record.leaveType.split(' ')[0]}
                            </span>
                        </div>
                        </div>
                    );
                    })}
                    {records.length === 0 && <p className="text-center text-slate-400 py-4">尚無資料</p>}
                </div>
                </div>
            </div>
        </>
      )}
    </div>
  );
};

export default Dashboard;
