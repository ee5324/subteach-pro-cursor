import React, { useState, useEffect } from 'react';
import { 
  Archive, 
  Plus, 
  Search, 
  Printer, 
  Bell, 
  MoreVertical, 
  Trash2, 
  Edit2, 
  CheckCircle2, 
  Circle, 
  ChevronRight,
  ChevronLeft,
  Calendar,
  Loader2,
  AlertCircle
} from 'lucide-react';
import { ArchiveTask } from './types';
import Modal from './components/Modal';
import { getArchiveTasks, saveArchiveTask, deleteArchiveTask } from './services/api';

interface ArchiveManagerProps {
  onTasksChange?: (count: number) => void;
}

const ArchiveManager: React.FC<ArchiveManagerProps> = ({ onTasksChange }) => {
  const [tasks, setTasks] = useState<ArchiveTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [filterTab, setFilterTab] = useState<'all' | 'pending' | 'completed'>('all');
  
  // Modal states
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [currentTask, setCurrentTask] = useState<Partial<ArchiveTask>>({});

  const fetchTasks = async () => {
    setIsLoading(true);
    try {
      const data = await getArchiveTasks();
      setTasks(data);
      const pendingCount = data.filter(t => !t.isPrinted || !t.isNotified).length;
      onTasksChange?.(pendingCount);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  const handleSaveTask = async () => {
    if (!currentTask.title || !currentTask.month) {
      alert('請填寫標題與月份');
      return;
    }

    setIsLoading(true);
    try {
      await saveArchiveTask(currentTask as any);
      await fetchTasks();
      setIsEditModalOpen(false);
      setCurrentTask({});
    } catch (e: any) {
      alert(e.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteTask = async (id: string) => {
    if (!confirm('確定要刪除此事項嗎？')) return;

    setIsLoading(true);
    try {
      await deleteArchiveTask({ id });
      await fetchTasks();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleStatus = async (task: ArchiveTask, field: 'isPrinted' | 'isNotified') => {
    const updatedTask = { ...task, [field]: !task[field] };
    
    // Optimistic update
    const newTasks = tasks.map(t => t.id === task.id ? updatedTask : t);
    setTasks(newTasks);
    const pendingCount = newTasks.filter(t => !t.isPrinted || !t.isNotified).length;
    onTasksChange?.(pendingCount);

    try {
      await saveArchiveTask(updatedTask as any);
    } catch (e: any) {
      setTasks(tasks);
      const oldPendingCount = tasks.filter(t => !t.isPrinted || !t.isNotified).length;
      onTasksChange?.(oldPendingCount);
      alert(e.message);
    }
  };

  // Group tasks by month
  const groupedTasks = tasks.reduce((acc, task) => {
    const month = task.month;
    if (!acc[month]) acc[month] = [];
    acc[month].push(task);
    return acc;
  }, {} as Record<string, ArchiveTask[]>);

  // Sort months descending
  const sortedMonths = Object.keys(groupedTasks).sort((a, b) => b.localeCompare(a));

  const filteredTasks = (selectedMonth ? groupedTasks[selectedMonth] : [])
    .filter(task => {
      const matchesSearch = task.title.toLowerCase().includes(searchTerm.toLowerCase());
      const isCompleted = task.isPrinted && task.isNotified;
      if (filterTab === 'pending') return matchesSearch && !isCompleted;
      if (filterTab === 'completed') return matchesSearch && isCompleted;
      return matchesSearch;
    });

  if (isLoading && tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-4" />
        <p className="text-gray-500">載入事項列檔中...</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center">
            <Archive className="mr-2 text-blue-600" /> 事項列檔
          </h1>
          <p className="text-gray-500 mt-1">追蹤行政事項的列印與通知狀態</p>
        </div>
        <button
          onClick={() => {
            const now = new Date();
            const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            setCurrentTask({ month: monthStr, isPrinted: false, isNotified: false });
            setIsEditModalOpen(true);
          }}
          className="flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
        >
          <Plus size={20} className="mr-1" /> 新增事項
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg flex items-center">
          <AlertCircle className="mr-2" size={20} />
          {error}
        </div>
      )}

      {!selectedMonth ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {sortedMonths.length > 0 ? (
            sortedMonths.map(month => {
              const monthTasks = groupedTasks[month];
              const completedCount = monthTasks.filter(t => t.isPrinted && t.isNotified).length;
              
              return (
                <div 
                  key={month}
                  onClick={() => setSelectedMonth(month)}
                  className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all cursor-pointer group"
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className="bg-blue-50 p-3 rounded-lg text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                      <Calendar size={24} />
                    </div>
                    <ChevronRight className="text-gray-300 group-hover:text-blue-600 transition-colors" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-1">{month}</h3>
                  <p className="text-gray-500 text-sm mb-4">{monthTasks.length} 個事項</p>
                  
                  <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                    <div 
                      className="bg-green-500 h-full transition-all duration-500" 
                      style={{ width: `${(completedCount / monthTasks.length) * 100}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-2 text-xs text-gray-400">
                    <span>進度</span>
                    <span>{completedCount} / {monthTasks.length} 已完成</span>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="col-span-full py-20 text-center bg-white rounded-xl border border-dashed border-gray-300">
              <Archive className="mx-auto h-12 w-12 text-gray-300 mb-4" />
              <p className="text-gray-500">目前尚無資料，請點擊右上角新增事項。</p>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <button 
              onClick={() => setSelectedMonth(null)}
              className="flex items-center text-blue-600 hover:text-blue-800 font-medium self-start"
            >
              <ChevronLeft size={20} /> 返回月份列表
            </button>
            
            <div className="flex bg-gray-100 p-1 rounded-lg self-start">
              <button
                onClick={() => setFilterTab('all')}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                  filterTab === 'all' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                全部
              </button>
              <button
                onClick={() => setFilterTab('pending')}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                  filterTab === 'pending' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                待處理
              </button>
              <button
                onClick={() => setFilterTab('completed')}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                  filterTab === 'completed' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                已完成
              </button>
            </div>

            <div className="relative w-full max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                placeholder="搜尋事項..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              />
            </div>
          </div>

          <h2 className="text-xl font-bold text-gray-800 flex items-center">
            <span className="bg-blue-600 text-white px-3 py-1 rounded-md mr-3">{selectedMonth}</span>
            {filterTab === 'pending' ? '待處理事項' : filterTab === 'completed' ? '已完成事項' : '事項列表'}
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredTasks.map(task => (
              <div key={task.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden hover:border-blue-300 transition-colors">
                <div className="p-5">
                  <div className="flex justify-between items-start mb-3">
                    <h3 className="text-lg font-bold text-gray-900 leading-tight">{task.title}</h3>
                    <div className="flex space-x-1">
                      <button 
                        onClick={() => {
                          setCurrentTask(task);
                          setIsEditModalOpen(true);
                        }}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button 
                        onClick={() => handleDeleteTask(task.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                  
                  {task.notes && (
                    <p className="text-sm text-gray-500 mb-4 line-clamp-2">{task.notes}</p>
                  )}

                  <div className="grid grid-cols-2 gap-3 mt-auto">
                    <button
                      onClick={() => toggleStatus(task, 'isPrinted')}
                      className={`flex items-center justify-center py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                        task.isPrinted 
                          ? 'bg-green-50 text-green-700 border border-green-200' 
                          : 'bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100'
                      }`}
                    >
                      {task.isPrinted ? <CheckCircle2 size={16} className="mr-2" /> : <Circle size={16} className="mr-2" />}
                      已列印
                    </button>
                    <button
                      onClick={() => toggleStatus(task, 'isNotified')}
                      className={`flex items-center justify-center py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                        task.isNotified 
                          ? 'bg-blue-50 text-blue-700 border border-blue-200' 
                          : 'bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100'
                      }`}
                    >
                      {task.isNotified ? <Bell size={16} className="mr-2" /> : <Circle size={16} className="mr-2" />}
                      已通知
                    </button>
                  </div>
                </div>
                <div className="bg-gray-50 px-5 py-2 border-t border-gray-100 flex justify-between items-center text-[10px] text-gray-400">
                  <span>ID: {task.id.substring(0, 8)}</span>
                  <span>更新於: {new Date(task.updatedAt).toLocaleString()}</span>
                </div>
              </div>
            ))}
            
            {filteredTasks.length === 0 && (
              <div className="col-span-full py-12 text-center bg-gray-50 rounded-xl border border-dashed border-gray-300">
                <p className="text-gray-500">此月份尚無符合條件的事項</p>
              </div>
            )}
          </div>
        </div>
      )}

      <Modal
        isOpen={isEditModalOpen}
        title={currentTask.id ? '編輯事項' : '新增事項'}
        onCancel={() => setIsEditModalOpen(false)}
        onConfirm={handleSaveTask}
        confirmText="儲存"
        content={
          <div className="space-y-4 pt-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">事項名稱</label>
              <input
                type="text"
                value={currentTask.title || ''}
                onChange={(e) => setCurrentTask({ ...currentTask, title: e.target.value })}
                placeholder="例如：本土語補助申請"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">月份</label>
              <input
                type="month"
                value={currentTask.month || ''}
                onChange={(e) => setCurrentTask({ ...currentTask, month: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">備註</label>
              <textarea
                value={currentTask.notes || ''}
                onChange={(e) => setCurrentTask({ ...currentTask, notes: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div className="flex space-x-4">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={currentTask.isPrinted || false}
                  onChange={(e) => setCurrentTask({ ...currentTask, isPrinted: e.target.checked })}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <span className="text-sm text-gray-700">已列印</span>
              </label>
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={currentTask.isNotified || false}
                  onChange={(e) => setCurrentTask({ ...currentTask, isNotified: e.target.checked })}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <span className="text-sm text-gray-700">已通知</span>
              </label>
            </div>
          </div>
        }
      />
    </div>
  );
};

export default ArchiveManager;
