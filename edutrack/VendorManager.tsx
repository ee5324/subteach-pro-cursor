import React, { useState, useRef, useEffect } from 'react';
import { Store, Plus, Search, Phone, Mail, MapPin, Edit2, Trash2, Filter, Loader2, MessageCircle, Briefcase, X, Save, QrCode, Upload } from 'lucide-react';
import { Vendor } from './types';
import Modal from './components/Modal';
import { getVendors, saveVendor, deleteVendor } from './services/api';

// 預設常見類別
const DEFAULT_CATEGORIES = ['全部', '遊覽車', '印刷', '餐盒/食品', '文具/用品', '維修/水電', '資訊設備', '其他'];

const VendorManager: React.FC = () => {
    const [vendors, setVendors] = useState<Vendor[]>([]);
    const [loading, setLoading] = useState(false);
    const [filterCategory, setFilterCategory] = useState('全部');
    const [searchTerm, setSearchTerm] = useState('');
    
    // Modal & Editing
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingVendor, setEditingVendor] = useState<Partial<Vendor>>({});
    const [saving, setSaving] = useState(false);
    const [modalState, setModalState] = useState<{ isOpen: boolean; title: string; content: React.ReactNode; onConfirm?: () => void; type?: any }>({ isOpen: false, title: '', content: null });
    const [qrcodePreview, setQrcodePreview] = useState<string | null>(null);

    // New Task Input
    const [newTask, setNewTask] = useState('');

    useEffect(() => {
        fetchVendors();
    }, []);

    const fetchVendors = async () => {
        setLoading(true);
        try {
            const data = await getVendors();
            setVendors(data);
        } catch (e) {
            console.error(e);
            showModal('錯誤', '無法讀取廠商資料', 'danger');
        } finally {
            setLoading(false);
        }
    };

    const handleAddVendor = () => {
        setEditingVendor({
            category: '其他',
            relatedTasks: []
        });
        setIsEditModalOpen(true);
    };

    const handleEditVendor = (vendor: Vendor) => {
        setEditingVendor({ ...vendor });
        setIsEditModalOpen(true);
    };

    const handleDeleteVendor = (vendor: Vendor) => {
        showModal('刪除確認', `確定要刪除廠商「${vendor.name}」嗎？`, 'danger', async () => {
            setLoading(true);
            try {
                await deleteVendor({ id: vendor.id });
                setModalState(prev => ({...prev, isOpen: false}));
                fetchVendors();
            } catch(e) {
                showModal('失敗', '刪除失敗', 'danger');
            } finally {
                setLoading(false);
            }
        });
    };

    const handleSaveVendor = async () => {
        if (!editingVendor.name) {
            showModal('欄位缺漏', '廠商名稱為必填', 'warning');
            return;
        }

        setSaving(true);
        try {
            await saveVendor(editingVendor as any);
            setIsEditModalOpen(false);
            fetchVendors();
            showModal('成功', '廠商資料已儲存', 'success');
        } catch (e: any) {
            showModal('失敗', `儲存失敗: ${e.message}`, 'danger');
        } finally {
            setSaving(false);
        }
    };

    const handleAddTask = () => {
        if(!newTask.trim()) return;
        setEditingVendor(prev => ({
            ...prev,
            relatedTasks: [...(prev.relatedTasks || []), newTask.trim()]
        }));
        setNewTask('');
    };

    const handleRemoveTask = (idx: number) => {
        setEditingVendor(prev => ({
            ...prev,
            relatedTasks: (prev.relatedTasks || []).filter((_, i) => i !== idx)
        }));
    };

    const qrcodeInputRef = useRef<HTMLInputElement>(null);
    const handleQrcodeUrlChange = (url: string) => {
        setEditingVendor(prev => ({ ...prev, qrcodeUrl: url.trim() || undefined }));
    };
    const handleQrcodeFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !file.type.startsWith('image/')) return;
        const reader = new FileReader();
        reader.onload = () => {
            const dataUrl = reader.result as string;
            setEditingVendor(prev => ({ ...prev, qrcodeUrl: dataUrl }));
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    };
    const clearQrcode = () => {
        setEditingVendor(prev => ({ ...prev, qrcodeUrl: undefined }));
    };

    const showModal = (title: string, content: React.ReactNode, type: any, onConfirm?: () => void) => {
        setModalState({ isOpen: true, title, content, type, onConfirm });
    };

    // Filter Logic
    const filteredVendors = vendors.filter(v => {
        const matchesCategory = filterCategory === '全部' || v.category === filterCategory;
        const matchesSearch = v.name.includes(searchTerm) || 
                              (v.contactPerson && v.contactPerson.includes(searchTerm)) ||
                              (v.note && v.note.includes(searchTerm));
        return matchesCategory && matchesSearch;
    });

    const categories = Array.from(new Set([...DEFAULT_CATEGORIES, ...vendors.map(v => v.category)])).filter(c => c !== '全部').sort();
    
    // Color mapping for categories
    const getCategoryColor = (cat: string) => {
        const map: Record<string, string> = {
            '遊覽車': 'bg-blue-100 text-blue-800',
            '印刷': 'bg-yellow-100 text-yellow-800',
            '餐盒/食品': 'bg-green-100 text-green-800',
            '文具/用品': 'bg-purple-100 text-purple-800',
            '維修/水電': 'bg-orange-100 text-orange-800',
            '資訊設備': 'bg-cyan-100 text-cyan-800',
            '其他': 'bg-gray-100 text-gray-800'
        };
        return map[cat] || 'bg-gray-100 text-gray-800';
    };

    return (
        <div className="max-w-7xl mx-auto space-y-6 pb-20">
            <Modal {...modalState} onCancel={() => setModalState(prev => ({ ...prev, isOpen: false }))} />
            {qrcodePreview && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={() => setQrcodePreview(null)}>
                    <div className="bg-white rounded-xl p-4 shadow-xl max-w-sm" onClick={e => e.stopPropagation()}>
                        <p className="text-sm font-medium text-gray-700 mb-3">聯繫方式 QR Code</p>
                        <img src={qrcodePreview} alt="QR Code" className="w-64 h-64 object-contain mx-auto"/>
                        <div className="mt-3 flex justify-end gap-2">
                            {qrcodePreview.startsWith('data:') && (
                                <a href={qrcodePreview} download="qrcode.png" className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700">下載</a>
                            )}
                            <button onClick={() => setQrcodePreview(null)} className="px-3 py-1.5 text-gray-600 hover:bg-gray-100 rounded">關閉</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Modal */}
            {isEditModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl flex flex-col max-h-[90vh]">
                        <div className="p-4 border-b bg-gray-50 flex justify-between items-center rounded-t-lg">
                            <h3 className="font-bold text-lg flex items-center text-gray-800">
                                <Store className="mr-2 text-blue-600" size={20}/> 
                                {editingVendor.id ? '編輯廠商資料' : '新增廠商'}
                            </h3>
                            <button onClick={() => setIsEditModalOpen(false)}><X size={20}/></button>
                        </div>
                        
                        <div className="p-6 overflow-y-auto space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">廠商名稱 *</label>
                                    <input 
                                        type="text" 
                                        value={editingVendor.name || ''} 
                                        onChange={e => setEditingVendor({...editingVendor, name: e.target.value})} 
                                        className="w-full border rounded p-2 focus:ring-2 focus:ring-blue-300" 
                                        placeholder="例如: XX印刷廠"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">類別</label>
                                    <input 
                                        list="category-options"
                                        type="text" 
                                        value={editingVendor.category || '其他'} 
                                        onChange={e => setEditingVendor({...editingVendor, category: e.target.value})} 
                                        className="w-full border rounded p-2" 
                                        placeholder="選擇或輸入新類別"
                                    />
                                    <datalist id="category-options">
                                        {categories.map(c => <option key={c} value={c} />)}
                                    </datalist>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">聯絡人</label>
                                    <input 
                                        type="text" 
                                        value={editingVendor.contactPerson || ''} 
                                        onChange={e => setEditingVendor({...editingVendor, contactPerson: e.target.value})} 
                                        className="w-full border rounded p-2" 
                                        placeholder="姓名"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">電話</label>
                                    <input 
                                        type="text" 
                                        value={editingVendor.phone || ''} 
                                        onChange={e => setEditingVendor({...editingVendor, phone: e.target.value})} 
                                        className="w-full border rounded p-2" 
                                        placeholder="市話或手機"
                                    />
                                </div>
                            </div>

                             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                                    <input 
                                        type="email" 
                                        value={editingVendor.email || ''} 
                                        onChange={e => setEditingVendor({...editingVendor, email: e.target.value})} 
                                        className="w-full border rounded p-2" 
                                        placeholder="example@mail.com"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">LINE ID</label>
                                    <input 
                                        type="text" 
                                        value={editingVendor.lineId || ''} 
                                        onChange={e => setEditingVendor({...editingVendor, lineId: e.target.value})} 
                                        className="w-full border rounded p-2" 
                                        placeholder="LINE ID"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">地址</label>
                                <input 
                                    type="text" 
                                    value={editingVendor.address || ''} 
                                    onChange={e => setEditingVendor({...editingVendor, address: e.target.value})} 
                                    className="w-full border rounded p-2" 
                                    placeholder="公司地址"
                                />
                            </div>

                            <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                                <label className="block text-sm font-bold text-blue-800 mb-2 flex items-center">
                                    <Briefcase size={16} className="mr-1"/> 關聯業務 / 用途
                                </label>
                                <div className="flex gap-2 mb-2">
                                    <input 
                                        type="text" 
                                        value={newTask}
                                        onChange={e => setNewTask(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && handleAddTask()}
                                        className="flex-1 border border-blue-200 rounded p-2 text-sm focus:ring-2 focus:ring-blue-300"
                                        placeholder="輸入業務名稱 (例: 運動會, 畢業典禮) 按 Enter 新增"
                                    />
                                    <button onClick={handleAddTask} className="bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 text-sm">新增</button>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {(editingVendor.relatedTasks || []).map((task, idx) => (
                                        <span key={idx} className="bg-white text-blue-700 px-2 py-1 rounded border border-blue-200 text-sm flex items-center">
                                            {task}
                                            <button onClick={() => handleRemoveTask(idx)} className="ml-2 text-blue-400 hover:text-red-500"><X size={14}/></button>
                                        </span>
                                    ))}
                                    {(editingVendor.relatedTasks || []).length === 0 && <span className="text-gray-400 text-sm italic">尚無標記業務</span>}
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">備註</label>
                                <textarea 
                                    value={editingVendor.note || ''} 
                                    onChange={e => setEditingVendor({...editingVendor, note: e.target.value})} 
                                    className="w-full border rounded p-2 h-20" 
                                    placeholder="其他說明..."
                                />
                            </div>

                            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                                <label className="block text-sm font-bold text-gray-800 mb-2 flex items-center">
                                    <QrCode size={16} className="mr-1 text-indigo-600"/> 聯繫方式 QR Code
                                </label>
                                <p className="text-xs text-gray-500 mb-3">可貼上圖片網址，或上傳 QR Code 圖片（將儲存於資料庫）</p>
                                <div className="flex flex-col sm:flex-row gap-4 items-start">
                                    <div className="flex-1 w-full space-y-2">
                                        <input
                                            type="url"
                                            value={editingVendor.qrcodeUrl?.startsWith('data:') ? '' : (editingVendor.qrcodeUrl || '')}
                                            onChange={e => handleQrcodeUrlChange(e.target.value)}
                                            className="w-full border rounded p-2 text-sm"
                                            placeholder="https://... 或留空後用下方上傳"
                                        />
                                        <div className="flex gap-2">
                                            <input
                                                ref={qrcodeInputRef}
                                                type="file"
                                                accept="image/*"
                                                className="hidden"
                                                onChange={handleQrcodeFile}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => qrcodeInputRef.current?.click()}
                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-100 text-indigo-700 rounded text-sm hover:bg-indigo-200"
                                            >
                                                <Upload size={16}/> 上傳圖片
                                            </button>
                                            {(editingVendor.qrcodeUrl) && (
                                                <button type="button" onClick={clearQrcode} className="flex items-center gap-1.5 px-3 py-1.5 text-gray-600 hover:bg-gray-200 rounded text-sm">
                                                    <X size={16}/> 清除
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    {editingVendor.qrcodeUrl && (
                                        <div className="flex-shrink-0 border rounded-lg overflow-hidden bg-white p-1">
                                            <img src={editingVendor.qrcodeUrl} alt="QR Code" className="w-24 h-24 object-contain"/>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="p-4 border-t flex justify-end gap-2 bg-gray-50 rounded-b-lg">
                            <button onClick={() => setIsEditModalOpen(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">取消</button>
                            <button onClick={handleSaveVendor} disabled={saving} className="flex items-center px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
                                {saving ? <Loader2 className="animate-spin mr-2" size={16}/> : <Save className="mr-2" size={16}/>}
                                儲存
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Header / Controls */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800 flex items-center">
                        <Store className="mr-2 text-blue-600" /> 廠商管理
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">集中管理常用廠商通訊錄，並標記相關業務用途。</p>
                </div>
                <div className="flex gap-2">
                    <button 
                        onClick={handleAddVendor}
                        className="flex items-center px-4 py-2 bg-slate-800 text-white rounded hover:bg-slate-900 shadow-sm"
                    >
                        <Plus size={18} className="mr-2" /> 新增廠商
                    </button>
                </div>
            </div>

            {/* Search & Filter Bar */}
            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 flex flex-col md:flex-row gap-4 items-center">
                <div className="relative flex-1 w-full">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                    <input 
                        type="text" 
                        placeholder="搜尋廠商名稱、聯絡人或備註..." 
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border rounded-md focus:ring-2 focus:ring-blue-200 outline-none"
                    />
                </div>
                <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-2 md:pb-0">
                    <Filter size={18} className="text-gray-500 shrink-0"/>
                    <button 
                        onClick={() => setFilterCategory('全部')}
                        className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors ${filterCategory === '全部' ? 'bg-slate-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                    >
                        全部
                    </button>
                    {categories.map(cat => (
                         <button 
                            key={cat}
                            onClick={() => setFilterCategory(cat)}
                            className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors ${filterCategory === cat ? 'bg-slate-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                        >
                            {cat}
                        </button>
                    ))}
                </div>
            </div>

            {/* Vendor Grid */}
            {loading ? (
                <div className="flex justify-center py-20"><Loader2 className="animate-spin text-blue-600" size={48}/></div>
            ) : filteredVendors.length === 0 ? (
                <div className="text-center py-20 text-gray-400 bg-white rounded-lg border border-dashed border-gray-300">
                    <Store size={48} className="mx-auto mb-4 opacity-20"/>
                    <p className="text-lg">無符合的廠商資料</p>
                    <button onClick={handleAddVendor} className="mt-4 text-blue-600 hover:underline">新增一筆？</button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredVendors.map(vendor => (
                        <div key={vendor.id} className="bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow flex flex-col group">
                            <div className="p-5 flex-1">
                                <div className="flex justify-between items-start mb-3">
                                    <div>
                                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium mb-2 ${getCategoryColor(vendor.category)}`}>
                                            {vendor.category}
                                        </span>
                                        <h3 className="text-xl font-bold text-gray-800">{vendor.name}</h3>
                                        {vendor.contactPerson && (
                                            <p className="text-sm text-gray-500 mt-1 flex items-center">
                                                聯絡人: {vendor.contactPerson}
                                            </p>
                                        )}
                                    </div>
                                    <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                                        <button onClick={() => handleEditVendor(vendor)} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded hover:text-blue-600"><Edit2 size={16}/></button>
                                        <button onClick={() => handleDeleteVendor(vendor)} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded hover:text-red-600"><Trash2 size={16}/></button>
                                    </div>
                                </div>

                                <div className="space-y-2 mt-4">
                                    {vendor.phone && (
                                        <div className="flex items-center text-sm text-gray-700">
                                            <div className="w-8 flex justify-center"><Phone size={16} className="text-gray-400"/></div>
                                            <a href={`tel:${vendor.phone}`} className="hover:text-blue-600 hover:underline">{vendor.phone}</a>
                                        </div>
                                    )}
                                    {vendor.lineId && (
                                        <div className="flex items-center text-sm text-gray-700">
                                            <div className="w-8 flex justify-center"><MessageCircle size={16} className="text-green-500"/></div>
                                            <span>{vendor.lineId}</span>
                                        </div>
                                    )}
                                    {vendor.email && (
                                        <div className="flex items-center text-sm text-gray-700">
                                            <div className="w-8 flex justify-center"><Mail size={16} className="text-gray-400"/></div>
                                            <a href={`mailto:${vendor.email}`} className="hover:text-blue-600 hover:underline truncate">{vendor.email}</a>
                                        </div>
                                    )}
                                    {vendor.address && (
                                        <div className="flex items-start text-sm text-gray-700">
                                            <div className="w-8 flex justify-center mt-0.5"><MapPin size={16} className="text-gray-400"/></div>
                                            <a 
                                                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(vendor.address)}`} 
                                                target="_blank" 
                                                rel="noreferrer"
                                                className="hover:text-blue-600 hover:underline leading-tight"
                                            >
                                                {vendor.address}
                                            </a>
                                        </div>
                                    )}
                                </div>

                                {/* QR Code 縮圖 */}
                                {vendor.qrcodeUrl && (
                                    <div className="mt-4 pt-4 border-t border-gray-100 flex items-center gap-2">
                                        <span className="text-xs font-bold text-gray-500 flex items-center">
                                            <QrCode size={12} className="mr-1"/> 聯繫 QR Code
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => setQrcodePreview(vendor.qrcodeUrl!)}
                                            className="border rounded-lg overflow-hidden bg-white p-0.5 hover:ring-2 hover:ring-indigo-300 focus:outline-none"
                                            title="點擊預覽"
                                        >
                                            <img src={vendor.qrcodeUrl} alt="QR Code" className="w-12 h-12 object-contain"/>
                                        </button>
                                    </div>
                                )}

                                {/* Related Tasks */}
                                {vendor.relatedTasks && vendor.relatedTasks.length > 0 && (
                                    <div className="mt-5 pt-4 border-t border-gray-100">
                                        <p className="text-xs font-bold text-gray-500 mb-2 flex items-center">
                                            <Briefcase size={12} className="mr-1"/> 相關業務
                                        </p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {vendor.relatedTasks.map((task, idx) => (
                                                <span key={idx} className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs">
                                                    {task}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                
                                {vendor.note && (
                                    <div className="mt-3 text-sm text-gray-500 italic bg-gray-50 p-2 rounded">
                                        {vendor.note}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default VendorManager;