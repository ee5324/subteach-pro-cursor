import React, { useState, useEffect } from 'react';
import { ShieldCheck, X, Sun, Moon } from 'lucide-react';

interface BatchDutyModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (start: string, end: string, days: number[], period: 'full' | 'am' | 'pm') => void;
    loading: boolean;
    defaultDate: Date;
}

const BatchDutyModal: React.FC<BatchDutyModalProps> = ({ isOpen, onClose, onSave, loading, defaultDate }) => {
    const [start, setStart] = useState('');
    const [end, setEnd] = useState('');
    const [period, setPeriod] = useState<'full' | 'am' | 'pm'>('full');
    const [days, setDays] = useState<number[]>([1,2,3,4,5]);

    useEffect(() => {
        if (isOpen) {
            const s = new Date(defaultDate.getFullYear(), defaultDate.getMonth(), 1);
            const e = new Date(defaultDate.getFullYear(), defaultDate.getMonth() + 1, 0);
            const formatDate = (d: Date) => {
                const y = d.getFullYear();
                const m = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                return `${y}-${m}-${day}`;
            };
            setStart(formatDate(s));
            setEnd(formatDate(e));
        }
    }, [isOpen, defaultDate]);

    if (!isOpen) return null;

    const handleSave = () => {
        onSave(start, end, days, period);
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-white rounded-lg shadow-2xl w-full max-w-md flex flex-col">
                <div className="p-4 bg-red-50 border-b border-red-100 rounded-t-lg flex justify-between items-center">
                    <h3 className="font-bold text-lg text-red-800 flex items-center">
                        <ShieldCheck className="mr-2"/> 批次設定輪值
                    </h3>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-700"><X size={20}/></button>
                </div>
                <div className="p-6 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">開始日期</label>
                            <input type="date" value={start} onChange={e => setStart(e.target.value)} className="w-full border rounded p-2"/>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">結束日期</label>
                            <input type="date" value={end} onChange={e => setEnd(e.target.value)} className="w-full border rounded p-2"/>
                        </div>
                    </div>
                    
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">輪值星期</label>
                        <div className="flex flex-wrap gap-2">
                            {['日','一','二','三','四','五','六'].map((d, i) => (
                                <button 
                                key={i}
                                onClick={() => setDays(prev => prev.includes(i) ? prev.filter(x => x!==i) : [...prev, i])}
                                className={`w-8 h-8 rounded-full text-sm font-bold border transition-colors ${days.includes(i) ? 'bg-red-500 text-white border-red-500' : 'bg-white text-gray-500 border-gray-300'}`}
                                >
                                    {d}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">輪值時段</label>
                    <div className="flex gap-4">
                        <label className="flex items-center cursor-pointer">
                            <input type="radio" name="batchPeriod" checked={period === 'full'} onChange={() => setPeriod('full')} className="mr-2"/>
                            <span className="text-sm">全日</span>
                        </label>
                        <label className="flex items-center cursor-pointer">
                            <input type="radio" name="batchPeriod" checked={period === 'am'} onChange={() => setPeriod('am')} className="mr-2"/>
                            <span className="text-sm flex items-center"><Sun size={14} className="mr-1 text-orange-500"/> 上午</span>
                        </label>
                        <label className="flex items-center cursor-pointer">
                            <input type="radio" name="batchPeriod" checked={period === 'pm'} onChange={() => setPeriod('pm')} className="mr-2"/>
                            <span className="text-sm flex items-center"><Moon size={14} className="mr-1 text-blue-500"/> 下午</span>
                        </label>
                    </div>
                </div>
                </div>
                <div className="p-4 border-t flex justify-end gap-2 bg-gray-50 rounded-b-lg">
                    <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">取消</button>
                    <button onClick={handleSave} disabled={loading} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50">
                        {loading ? '儲存中...' : '確認批次建立'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default BatchDutyModal;