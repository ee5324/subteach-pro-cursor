import React, { useState } from 'react';
import { MessageSquare, ShieldCheck, Calendar, X, User, Clock, PhoneIncoming, Layers, GitCommit, Hash, Paperclip, Loader2, Plus, Users, Sun, Moon } from 'lucide-react';
import { TodoItem, Attachment, Contact } from '../../types';
import RichTextEditor from '../RichTextEditor';

interface EditTodoModalProps {
    isOpen: boolean;
    onClose: () => void;
    todo: Partial<TodoItem>;
    setTodo: (todo: Partial<TodoItem>) => void;
    onSave: () => void;
    loading: boolean;
    existingTopics: string[];
    onOpenSeriesView: (topic: string, year: string) => void;
    onFileUpload: (e: React.ChangeEvent<HTMLInputElement>, target: 'individual' | 'common') => void;
    uploading: 'individual' | 'common' | null;
    onRemoveAttachment: (index: number, target: 'individual' | 'common') => void;
}

const EditTodoModal: React.FC<EditTodoModalProps> = ({ 
    isOpen, onClose, todo, setTodo, onSave, loading, 
    existingTopics, onOpenSeriesView, onFileUpload, uploading, onRemoveAttachment 
}) => {
    const [tempDocNum, setTempDocNum] = useState('');

    if (!isOpen) return null;

    // Contact Helper
    const handleUpdateContact = (index: number, field: keyof Contact, value: string, target: 'individual' | 'common') => {
        const fieldName = target === 'individual' ? 'contacts' : 'commonContacts';
        const list = [...(todo[fieldName] || [])];
        list[index] = { ...list[index], [field]: value };
        setTodo({ ...todo, [fieldName]: list });
    };

    const handleAddContact = (target: 'individual' | 'common') => {
        const fieldName = target === 'individual' ? 'contacts' : 'commonContacts';
        setTodo({ 
            ...todo, 
            [fieldName]: [...(todo[fieldName] || []), { name: '', role: '', phone: '' }] 
        });
    };

    const handleRemoveContact = (index: number, target: 'individual' | 'common') => {
        const fieldName = target === 'individual' ? 'contacts' : 'commonContacts';
        setTodo({ 
            ...todo, 
            [fieldName]: (todo[fieldName] || []).filter((_, i) => i !== index) 
        });
    };

    // Doc Num Helper
    const handleAddDocNum = () => {
        if (!tempDocNum.trim()) return;
        const currentDocs = todo.officialDocs || [];
        if (currentDocs.includes(tempDocNum.trim())) {
            setTempDocNum('');
            return;
        }
        setTodo({ ...todo, officialDocs: [...currentDocs, tempDocNum.trim()] });
        setTempDocNum('');
    };

    const handleRemoveDocNum = (index: number) => {
        const currentDocs = todo.officialDocs || [];
        setTodo({ ...todo, officialDocs: currentDocs.filter((_, i) => i !== index) });
    };

    // Render Attachment
    const renderAttachmentItem = (file: Attachment, idx: number, type: 'individual' | 'common') => (
        <div key={idx} className={`flex items-center gap-2 p-2 rounded border text-sm ${type === 'common' ? 'bg-purple-50 border-purple-100' : 'bg-gray-50 border-gray-200'}`}>
           <a href={file.url} target="_blank" rel="noreferrer" className={`flex-1 truncate hover:underline ${type === 'common' ? 'text-purple-700' : 'text-gray-700'}`}>{file.name}</a>
           <button onClick={() => onRemoveAttachment(idx, type)} className="text-gray-400 hover:text-red-500"><X size={14}/></button>
        </div>
    );

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
            <datalist id="topic-list">
                {existingTopics.map(t => <option key={t} value={t} />)}
            </datalist>

            <div className="bg-white rounded-lg shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[95vh]">
                <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
                    <h3 className="font-bold text-lg flex items-center">
                        {todo.type === 'memo' 
                        ? <><MessageSquare className="mr-2 text-indigo-600" size={20}/> 傳達業務留言</>
                        : todo.type === 'duty'
                        ? <><ShieldCheck className="mr-2 text-red-600" size={20}/> {todo.id ? '編輯輪值' : '新增輪值'}</>
                        : <><Calendar className="mr-2 text-blue-600" size={20}/> {todo.id ? '編輯事項' : '新增待辦'}</>
                        }
                    </h3>
                    <button onClick={onClose}><X size={20}/></button>
                </div>

                <div className="p-6 overflow-y-auto space-y-4">
                    {todo.type === 'memo' ? (
                    <>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-bold text-indigo-700 mb-1 flex items-center">
                                    <User size={16} className="mr-1"/> 留言給 (To)
                                </label>
                                <input 
                                    type="text" 
                                    value={todo.topic || ''} 
                                    onChange={e => setTodo({...todo, topic: e.target.value})} 
                                    className="w-full border rounded p-2 focus:ring-2 focus:ring-indigo-300" 
                                    placeholder="接收者姓名"
                                    autoFocus
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1 flex items-center">
                                    <Clock size={16} className="mr-1"/> 日期 (Date)
                                </label>
                                <input type="date" value={todo.date || ''} onChange={e => setTodo({...todo, date: e.target.value})} className="w-full border rounded p-2 bg-gray-50"/>
                            </div>
                        </div>

                        <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                            <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center">
                                <PhoneIncoming size={16} className="mr-1"/> 來電/留言者資訊 (From)
                            </label>
                            <div className="flex gap-2">
                                <input 
                                    type="text" 
                                    placeholder="姓名/單位"
                                    value={todo.contacts?.[0]?.name || ''}
                                    onChange={e => handleUpdateContact(0, 'name', e.target.value, 'individual')}
                                    className="w-1/2 border rounded p-2 text-sm"
                                />
                                <input 
                                    type="text" 
                                    placeholder="電話 (選填)"
                                    value={todo.contacts?.[0]?.phone || ''}
                                    onChange={e => handleUpdateContact(0, 'phone', e.target.value, 'individual')}
                                    className="w-1/2 border rounded p-2 text-sm"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">留言內容 (Message)</label>
                            <textarea 
                                value={todo.title || ''} 
                                onChange={e => setTodo({...todo, title: e.target.value})} 
                                className="w-full h-32 border rounded p-3 text-sm focus:ring-2 focus:ring-indigo-300"
                                placeholder="請輸入需要傳達的事項..."
                            />
                        </div>
                    </>
                    ) : todo.type === 'duty' ? (
                    <div className="space-y-5">
                        <div className="bg-red-50 p-4 rounded-lg border border-red-100">
                            <p className="text-sm text-red-800 font-bold mb-4 flex items-center"><ShieldCheck size={16} className="mr-2"/> 處室輪值設定</p>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">活動類別</label>
                                    <select value={todo.type || 'duty'} onChange={e => setTodo({...todo, type: e.target.value})} className="w-full border rounded p-2">
                                        <option value="duty">處室輪值</option>
                                        <option value="行政">行政事務</option>
                                        <option value="教學">教學活動</option>
                                        <option value="會議">會議研習</option>
                                        <option value="其他">其他</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">輪值人員 / 名稱</label>
                                    <input type="text" value={todo.title || ''} onChange={e => setTodo({...todo, title: e.target.value})} className="w-full border rounded p-2" placeholder="例如: 王小明 或 教學組輪值"/>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">輪值日期</label>
                                    <input type="date" value={todo.date || ''} onChange={e => setTodo({...todo, date: e.target.value})} className="w-full border rounded p-2"/>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">輪值時段 (寒暑假可分上下午)</label>
                                    <div className="flex gap-4">
                                        <label className="flex items-center cursor-pointer">
                                            <input type="radio" name="period" checked={todo.period === 'full'} onChange={() => setTodo({...todo, period: 'full'})} className="mr-2"/>
                                            <span className="text-sm">全日輪值</span>
                                        </label>
                                        <label className="flex items-center cursor-pointer">
                                            <input type="radio" name="period" checked={todo.period === 'am'} onChange={() => setTodo({...todo, period: 'am'})} className="mr-2"/>
                                            <span className="text-sm flex items-center"><Sun size={14} className="mr-1 text-orange-500"/> 上午 (AM)</span>
                                        </label>
                                        <label className="flex items-center cursor-pointer">
                                            <input type="radio" name="period" checked={todo.period === 'pm'} onChange={() => setTodo({...todo, period: 'pm'})} className="mr-2"/>
                                            <span className="text-sm flex items-center"><Moon size={14} className="mr-1 text-blue-500"/> 下午 (PM)</span>
                                        </label>
                                    </div>
                                </div>
                                
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">備註 (選填)</label>
                                    <input type="text" value={todo.memo || ''} onChange={e => setTodo({...todo, memo: e.target.value})} className="w-full border rounded p-2 text-sm" placeholder="例如: 代理人..."/>
                                </div>
                            </div>
                        </div>
                    </div>
                    ) : (
                    <>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">標題</label>
                            <input type="text" value={todo.title || ''} onChange={e => setTodo({...todo, title: e.target.value})} className="w-full border rounded p-2" placeholder="例如: 科展初賽"/>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">日期</label>
                                <input type="date" value={todo.date || ''} onChange={e => setTodo({...todo, date: e.target.value})} className="w-full border rounded p-2"/>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">重要性</label>
                                <select value={todo.priority || 'Medium'} onChange={e => setTodo({...todo, priority: e.target.value as any})} className="w-full border rounded p-2">
                                    <option value="High">🔴 高 (緊急)</option>
                                    <option value="Medium">🟠 中 (一般)</option>
                                    <option value="Low">🟢 低 (備忘)</option>
                                </select>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">活動類別</label>
                                <select value={todo.type || '行政'} onChange={e => setTodo({...todo, type: e.target.value})} className="w-full border rounded p-2">
                                    <option value="行政">行政事務</option>
                                    <option value="教學">教學活動</option>
                                    <option value="會議">會議研習</option>
                                    <option value="duty">處室輪值</option>
                                    <option value="其他">其他</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">歸屬學年</label>
                                <input type="text" value={todo.academicYear || '114'} onChange={e => setTodo({...todo, academicYear: e.target.value})} className="w-full border rounded p-2" placeholder="例: 114"/>
                            </div>
                        </div>
                        
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center justify-between">
                                <div className="flex items-center gap-1">
                                    <Layers size={14} className="text-purple-600"/> 活動主題 (系列活動連動用)
                                </div>
                                {todo.topic && (
                                    <button 
                                        onClick={() => onOpenSeriesView(todo.topic!, todo.academicYear!)}
                                        className="text-xs flex items-center text-purple-600 hover:text-purple-800 bg-purple-50 px-2 py-0.5 rounded border border-purple-100 hover:bg-purple-100 transition-colors"
                                    >
                                        <GitCommit size={12} className="mr-1"/> 查看完整時間軸
                                    </button>
                                )}
                            </label>
                            <input 
                                list="topic-list"
                                type="text" 
                                value={todo.topic || ''} 
                                onChange={e => setTodo({...todo, topic: e.target.value})} 
                                className="w-full border rounded p-2 bg-purple-50 focus:bg-white transition-colors"
                                placeholder="例如: 科展、語文競賽 (輸入相同主題即可自動串聯)"
                            />
                            <p className="text-xs text-gray-500 mt-1">設定相同主題與學年，即可自動同步「系列共用附件」與「共用聯絡人」。</p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">公文文號</label>
                            <div className="flex gap-2 mb-2">
                                <input 
                                    type="text" 
                                    value={tempDocNum} 
                                    onChange={e => setTempDocNum(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleAddDocNum()}
                                    className="flex-1 border rounded p-2 text-sm" 
                                    placeholder="輸入文號後按新增 (例如: 高市教小字第113xxxxxx號)"
                                />
                                <button onClick={handleAddDocNum} type="button" className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded text-sm text-gray-700">新增</button>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {(todo.officialDocs || []).map((doc, idx) => (
                                    <span key={idx} className="flex items-center bg-yellow-50 text-yellow-800 text-xs px-2 py-1 rounded border border-yellow-100">
                                        <Hash size={10} className="mr-1 opacity-50"/>
                                        {doc}
                                        <button onClick={() => handleRemoveDocNum(idx)} className="ml-2 text-yellow-600 hover:text-red-500"><X size={12}/></button>
                                    </span>
                                ))}
                                {(todo.officialDocs || []).length === 0 && <span className="text-xs text-gray-400 italic">尚無文號</span>}
                            </div>
                        </div>

                        <div className="h-52 flex flex-col">
                            <label className="block text-sm font-medium text-gray-700 mb-1">詳細備註</label>
                            <RichTextEditor 
                                key={todo.id || 'new'} 
                                initialValue={todo.memo || ''} 
                                onChange={val => setTodo({...todo, memo: val})} 
                            />
                        </div>

                        <div className="border-t pt-4 mt-4">
                            <div className="flex justify-between items-center mb-2">
                                <label className="text-sm font-medium text-gray-700 flex items-center">
                                    <Paperclip size={14} className="mr-1"/> 此活動附件
                                </label>
                                <label className={`cursor-pointer flex items-center text-xs px-2 py-1 rounded transition-colors ${uploading === 'individual' ? 'bg-gray-100 text-gray-400' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'}`}>
                                    {uploading === 'individual' ? <Loader2 size={12} className="animate-spin mr-1"/> : <Plus size={12} className="mr-1"/>}
                                    {uploading === 'individual' ? '上傳中...' : '新增'}
                                    <input type="file" className="hidden" onChange={(e) => onFileUpload(e, 'individual')} disabled={!!uploading}/>
                                </label>
                            </div>
                            <div className="space-y-2">
                                {(todo.attachments || []).map((f, i) => renderAttachmentItem(f, i, 'individual'))}
                                {(todo.attachments || []).length === 0 && <p className="text-xs text-gray-400 italic">無個別附件</p>}
                            </div>
                        </div>

                        {todo.topic && (
                            <div className="border-t pt-4">
                                <div className="flex justify-between items-center mb-2">
                                    <label className="text-sm font-bold text-purple-700 flex items-center">
                                        <Layers size={14} className="mr-1"/> 系列共用附件 ({todo.topic})
                                    </label>
                                    <label className={`cursor-pointer flex items-center text-xs px-2 py-1 rounded transition-colors ${uploading === 'common' ? 'bg-gray-100 text-gray-400' : 'bg-purple-50 text-purple-600 hover:bg-purple-100'}`}>
                                        {uploading === 'common' ? <Loader2 size={12} className="animate-spin mr-1"/> : <Plus size={12} className="mr-1"/>}
                                        {uploading === 'common' ? '上傳中...' : '新增共用'}
                                        <input type="file" className="hidden" onChange={(e) => onFileUpload(e, 'common')} disabled={!!uploading}/>
                                    </label>
                                </div>
                                <p className="text-xs text-gray-500 mb-2">上傳至此處的檔案將顯示於本學年所有「{todo.topic}」活動中。</p>
                                <div className="space-y-2">
                                    {(todo.commonAttachments || []).map((f, i) => renderAttachmentItem(f, i, 'common'))}
                                    {(todo.commonAttachments || []).length === 0 && <p className="text-xs text-gray-400 italic">無共用附件</p>}
                                </div>
                            </div>
                        )}

                        {todo.topic && (
                            <div className="border-t pt-4">
                                <div className="flex justify-between items-center mb-2">
                                    <label className="text-sm font-bold text-purple-700 flex items-center">
                                        <Users size={14} className="mr-1"/> 系列共用聯絡人 ({todo.topic})
                                    </label>
                                    <button type="button" onClick={() => handleAddContact('common')} className="text-xs text-purple-600 hover:underline flex items-center"><Plus size={12} className="mr-1"/>新增共用</button>
                                </div>
                                <div className="space-y-2">
                                    {(todo.commonContacts || []).map((contact, idx) => (
                                        <div key={idx} className="flex gap-2 items-center">
                                            <input placeholder="姓名" value={contact.name} onChange={e => handleUpdateContact(idx, 'name', e.target.value, 'common')} className="w-1/4 border rounded p-1 text-sm bg-purple-50 border-purple-200"/>
                                            <input placeholder="職稱" value={contact.role} onChange={e => handleUpdateContact(idx, 'role', e.target.value, 'common')} className="w-1/4 border rounded p-1 text-sm bg-purple-50 border-purple-200"/>
                                            <input placeholder="電話" value={contact.phone} onChange={e => handleUpdateContact(idx, 'phone', e.target.value, 'common')} className="flex-1 border rounded p-1 text-sm bg-purple-50 border-purple-200"/>
                                            <button onClick={() => handleRemoveContact(idx, 'common')} className="text-gray-400 hover:text-red-500"><X size={14}/></button>
                                        </div>
                                    ))}
                                    {(todo.commonContacts || []).length === 0 && <p className="text-xs text-gray-400 italic">無共用聯絡人</p>}
                                </div>
                            </div>
                        )}

                        <div className="border-t pt-4">
                            <div className="flex justify-between items-center mb-2">
                                <label className="text-sm font-medium text-gray-700">此活動外部聯絡人</label>
                                <button type="button" onClick={() => handleAddContact('individual')} className="text-xs text-blue-600 hover:underline flex items-center"><Plus size={12} className="mr-1"/>新增</button>
                            </div>
                            <div className="space-y-2">
                                {(todo.contacts || []).map((contact, idx) => (
                                    <div key={idx} className="flex gap-2 items-center">
                                        <input placeholder="姓名" value={contact.name} onChange={e => handleUpdateContact(idx, 'name', e.target.value, 'individual')} className="w-1/4 border rounded p-1 text-sm"/>
                                        <input placeholder="職稱" value={contact.role} onChange={e => handleUpdateContact(idx, 'role', e.target.value, 'individual')} className="w-1/4 border rounded p-1 text-sm"/>
                                        <input placeholder="電話" value={contact.phone} onChange={e => handleUpdateContact(idx, 'phone', e.target.value, 'individual')} className="flex-1 border rounded p-1 text-sm"/>
                                        <button onClick={() => handleRemoveContact(idx, 'individual')} className="text-gray-400 hover:text-red-500"><X size={14}/></button>
                                    </div>
                                ))}
                                {(todo.contacts || []).length === 0 && <p className="text-xs text-gray-400 italic">無聯絡人資訊</p>}
                            </div>
                        </div>
                    </>
                    )}
                </div>
                <div className="p-4 border-t flex justify-end gap-2 bg-gray-50">
                    <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">取消</button>
                    <button onClick={onSave} disabled={loading} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
                        {todo.type === 'memo' ? '儲存留言' : todo.type === 'duty' ? '儲存輪值' : '儲存事項'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default EditTodoModal;