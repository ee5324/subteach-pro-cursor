import React from 'react';
import { X, CheckCircle, GitCommit } from 'lucide-react';
import { TodoItem } from '../../types';

interface SeriesViewModalProps {
    isOpen: boolean;
    onClose: () => void;
    topic: string;
    seriesList: TodoItem[];
    currentId?: string;
    onJump: (todo: TodoItem) => void;
}

const SeriesViewModal: React.FC<SeriesViewModalProps> = ({ isOpen, onClose, topic, seriesList, currentId, onJump }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-white rounded-lg shadow-2xl w-full max-w-md flex flex-col max-h-[85vh]">
                <div className="p-4 bg-purple-50 border-b border-purple-100 rounded-t-lg flex justify-between items-center">
                    <div>
                        <span className="text-xs font-bold text-purple-600 uppercase tracking-wider">系列活動時間軸</span>
                        <h3 className="font-bold text-lg text-gray-800">{topic}</h3>
                    </div>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-700"><X size={20}/></button>
                </div>
                <div className="p-6 overflow-y-auto bg-white relative">
                    <div className="absolute left-9 top-6 bottom-6 w-0.5 bg-gray-200"></div>
                    <div className="space-y-6">
                        {seriesList.length === 0 ? <p className="text-center text-gray-500 italic">無相關活動</p> : 
                        seriesList.map((event, idx) => {
                            const isCurrent = event.id === currentId;
                            const isDone = event.status === 'done';
                            const eventDate = new Date(event.date);
                            const isPast = eventDate < new Date() && !isCurrent;
                            
                            return (
                                <div key={idx} className="relative flex gap-4 group">
                                    <div className={`relative z-10 w-10 h-10 rounded-full flex items-center justify-center border-2 shrink-0 transition-all
                                        ${isCurrent ? 'bg-blue-600 border-blue-600 text-white shadow-lg scale-110' : 
                                            isDone ? 'bg-green-100 border-green-500 text-green-600' :
                                            isPast ? 'bg-gray-100 border-gray-300 text-gray-400' : 'bg-white border-purple-300 text-purple-600'}
                                    `}>
                                        {isDone ? <CheckCircle size={18}/> : <GitCommit size={18}/>}
                                    </div>
                                    <div 
                                        onClick={() => onJump(event)}
                                        className={`flex-1 p-3 rounded-lg border cursor-pointer transition-all 
                                            ${isCurrent ? 'bg-blue-50 border-blue-200 ring-1 ring-blue-300' : 'bg-white border-gray-100 hover:border-purple-200 hover:shadow-md'}
                                        `}
                                    >
                                        <div className="flex justify-between items-start">
                                            <div className={`text-xs font-bold mb-1 ${isCurrent ? 'text-blue-600' : 'text-gray-400'}`}>
                                                {event.date}
                                            </div>
                                            {isCurrent && <span className="text-[10px] bg-blue-600 text-white px-1.5 rounded">編輯中</span>}
                                        </div>
                                        <h4 className={`font-medium ${isPast && !isCurrent ? 'text-gray-500' : 'text-gray-800'}`}>{event.title}</h4>
                                        {event.type && <span className="text-[10px] text-gray-400 bg-gray-50 px-1 rounded mt-1 inline-block">{event.type}</span>}
                                    </div>
                                </div>
                            );
                        })
                        }
                    </div>
                </div>
                <div className="p-3 border-t bg-gray-50 text-center text-xs text-gray-500">
                    點擊項目可快速跳轉編輯
                </div>
            </div>
        </div>
    );
};

export default SeriesViewModal;