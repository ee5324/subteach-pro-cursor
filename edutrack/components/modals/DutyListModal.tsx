import React, { useState } from 'react';
import { List, X, Filter, Trash2, ShieldCheck, Sun, Moon } from 'lucide-react';
import { TodoItem } from '../../types';

interface DutyListModalProps {
    isOpen: boolean;
    onClose: () => void;
    todos: TodoItem[];
    onEdit: (todo: TodoItem) => void;
    onDelete: (todo: TodoItem) => void;
    onCleanup: (duties: TodoItem[]) => void;
}

const DutyListModal: React.FC<DutyListModalProps> = ({ isOpen, onClose, todos, onEdit, onDelete, onCleanup }) => {
    const [filter, setFilter] = useState('');

    if (!isOpen) return null;

    const dutyList = todos
        .filter(t => t.type === 'duty')
        .filter(t => !filter || t.date.includes(filter))
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const handleCleanup = () => {
        const today = new Date();
        today.setHours(0,0,0,0);
        const oldDuties = dutyList.filter(d => new Date(d.date) < today);
        onCleanup(oldDuties);
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl flex flex-col max-h-[85vh]">
                <div className="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-lg">
                    <h3 className="font-bold text-lg text-gray-800 flex items-center">
                        <List className="mr-2"/> 輪值總表管理
                    </h3>
                    <button onClick={onClose}><X size={20}/></button>
                </div>
                
                <div className="p-3 bg-white border-b flex items-center gap-2">
                    <Filter size={16} className="text-gray-500"/>
                    <input 
                    type="month" 
                    value={filter} 
                    onChange={e => setFilter(e.target.value)}
                    className="border rounded p-1 text-sm"
                    />
                    <div className="flex-1"></div>
                    <button onClick={handleCleanup} className="text-xs text-red-600 hover:underline flex items-center">
                        <Trash2 size={12} className="mr-1"/> 清除過期輪值
                    </button>
                </div>

                <div className="p-0 overflow-y-auto flex-1 bg-gray-50">
                    {dutyList.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-10 text-gray-400">
                            <ShieldCheck size={48} className="opacity-20 mb-2"/>
                            <p>無符合的輪值資料</p>
                        </div>
                    ) : (
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-100 text-gray-500 sticky top-0">
                                <tr>
                                    <th className="px-4 py-2">日期</th>
                                    <th className="px-4 py-2">時段</th>
                                    <th className="px-4 py-2">備註</th>
                                    <th className="px-4 py-2 text-right">操作</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 bg-white">
                                {dutyList.map(item => (
                                    <tr key={item.id} className="hover:bg-blue-50">
                                        <td className="px-4 py-2 font-medium">{item.date}</td>
                                        <td className="px-4 py-2">
                                            {item.period === 'am' ? <span className="flex items-center text-orange-600"><Sun size={14} className="mr-1"/>上午</span> :
                                            item.period === 'pm' ? <span className="flex items-center text-blue-600"><Moon size={14} className="mr-1"/>下午</span> :
                                            <span className="flex items-center text-gray-600">全日</span>}
                                        </td>
                                        <td className="px-4 py-2 text-gray-500 truncate max-w-[150px]">{item.memo}</td>
                                        <td className="px-4 py-2 text-right">
                                            <button onClick={() => onEdit(item)} className="text-blue-600 hover:text-blue-800 mr-2 p-1">編輯</button>
                                            <button onClick={() => onDelete(item)} className="text-red-600 hover:text-red-800 p-1">刪除</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
                <div className="p-3 border-t bg-gray-50 text-right text-xs text-gray-500">
                    共 {dutyList.length} 筆資料
                </div>
            </div>
        </div>
    );
};

export default DutyListModal;