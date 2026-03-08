import React, { useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { callGasApi } from '../utils/api';
import { FileOutput, Loader2, AlertCircle } from 'lucide-react';
import Modal from '../components/Modal';
import InstructionPanel from '../components/InstructionPanel';

const ExtraVoucher: React.FC = () => {
  const { settings } = useAppStore();
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState<string>('');
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [month, setMonth] = useState(() => new Date().getMonth() + 1);
  const [isGenerating, setIsGenerating] = useState(false);
  const [modal, setModal] = useState<{ isOpen: boolean; title: string; message: string; type: 'success' | 'error' | 'warning' | 'info' }>({ isOpen: false, title: '', message: '', type: 'info' });

  const handleGenerate = async () => {
    if (!settings?.gasWebAppUrl) {
      setModal({ isOpen: true, title: '錯誤', message: '請先於「系統設定」設定 GAS Web App URL', type: 'error' });
      return;
    }
    const numAmount = Number(amount);
    if (!title.trim()) {
      setModal({ isOpen: true, title: '請填寫', message: '請輸入憑證標題', type: 'warning' });
      return;
    }
    if (isNaN(numAmount) || numAmount < 0) {
      setModal({ isOpen: true, title: '請填寫', message: '請輸入有效金額（數字）', type: 'warning' });
      return;
    }

    setIsGenerating(true);
    try {
      const result = await callGasApi(settings.gasWebAppUrl, 'GENERATE_EXTRA_VOUCHER', {
        title: title.trim(),
        amount: numAmount,
        year,
        month,
      });
      if (result.status === 'success' && result.data?.url) {
        window.open(result.data.url, '_blank');
        setModal({ isOpen: true, title: '成功', message: '額外憑證已產生並於新分頁開啟。', type: 'success' });
        setTitle('');
        setAmount('');
      } else {
        setModal({ isOpen: true, title: '通知', message: result.message || '已產生，但未回傳網址。', type: 'info' });
      }
    } catch (e: any) {
      setModal({ isOpen: true, title: '產生失敗', message: e?.message || String(e), type: 'error' });
    } finally {
      setIsGenerating(false);
    }
  };

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);
  const months = Array.from({ length: 12 }, (_, i) => i + 1);

  return (
    <div className="p-8 pb-32">
      <Modal isOpen={modal.isOpen} onClose={() => setModal({ ...modal, isOpen: false })} title={modal.title} message={modal.message} type={modal.type} />

      <header className="mb-6">
        <h1 className="text-3xl font-bold text-slate-800 flex items-center">
          <FileOutput className="mr-3 text-amber-600" size={28} />
          額外憑證
        </h1>
        <p className="text-slate-500 mt-2">製作未預期的其他黏貼憑證（格式與代課/固定兼課/超鐘點憑證相同）</p>
      </header>

      <InstructionPanel title="使用說明">
        <ul className="list-disc pl-5 space-y-1 text-sm text-slate-600">
          <li>用於臨時需要產生的黏貼憑證，不屬於代課清冊、固定兼課或超鐘點清冊時使用。</li>
          <li>請填寫憑證標題與金額，選擇年份、月份後點擊「產生憑證」；系統會依 GAS 憑證範本產出試算表並開啟。</li>
          <li>需先在「系統設定」設定 GAS Web App URL，且 Google 試算表內須有「憑證範本」工作表。</li>
        </ul>
      </InstructionPanel>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 max-w-lg mt-6">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">憑證標題</label>
            <input
              type="text"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none"
              placeholder="例：113年3月其他鐘點費"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">金額（元）</label>
            <input
              type="number"
              min="0"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none"
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">年份</label>
              <select
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
              >
                {years.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">月份</label>
              <select
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none"
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
              >
                {months.map((m) => (
                  <option key={m} value={m}>{m} 月</option>
                ))}
              </select>
            </div>
          </div>
          {!settings?.gasWebAppUrl && (
            <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">
              <AlertCircle size={18} />
              <span>請先至「系統設定」設定 GAS Web App URL</span>
            </div>
          )}
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isGenerating || !settings?.gasWebAppUrl}
            className="w-full py-3 bg-amber-600 hover:bg-amber-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold rounded-lg shadow-md flex items-center justify-center gap-2 transition-colors"
          >
            {isGenerating ? <Loader2 size={20} className="animate-spin" /> : <FileOutput size={20} />}
            <span>{isGenerating ? '產生中…' : '產生憑證'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExtraVoucher;
