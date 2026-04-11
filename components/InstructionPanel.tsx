import React, { useState } from 'react';
import { HelpCircle, ChevronDown, ChevronUp } from 'lucide-react';

interface InstructionPanelProps {
  title?: string;
  /** 手機版顯示的短標題（未提供則用 title） */
  shortTitle?: string;
  children: React.ReactNode;
  isOpenDefault?: boolean;
  /** 外層容器額外 class（例如與他欄並排時去掉下邊距） */
  className?: string;
}

export const CollapsibleItem: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="border border-slate-200 rounded-lg mb-2 overflow-hidden">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-2 flex items-center justify-between bg-slate-50 hover:bg-slate-100 transition-colors text-slate-700 font-medium text-left"
      >
        <span>{title}</span>
        {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {isOpen && (
        <div className="px-4 py-3 text-xs text-slate-500 bg-white border-t border-slate-200">
          {children}
        </div>
      )}
    </div>
  );
};

const InstructionPanel: React.FC<InstructionPanelProps> = ({ 
  title = "使用說明", 
  shortTitle,
  children, 
  isOpenDefault = false,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(isOpenDefault);

  return (
    <div className={`bg-slate-50 border border-slate-200 rounded-xl mb-2 md:mb-3 overflow-hidden transition-all duration-300 shadow-sm ${className}`.trim()}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 md:px-5 py-2.5 md:py-3 flex items-center justify-between bg-white hover:bg-slate-50 transition-colors text-slate-800 font-bold border-b border-slate-200 min-h-[44px]"
      >
        <div className="flex items-center min-w-0">
          <HelpCircle size={20} className="mr-2 md:mr-3 text-indigo-500 shrink-0" />
          <span className="sm:hidden truncate">{shortTitle ?? title}</span>
          <span className="hidden sm:inline">{title}</span>
        </div>
        <div className="flex items-center text-slate-400 text-xs font-normal">
          <span className="mr-2">{isOpen ? '收合' : '展開'}</span>
          {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </div>
      </button>
      
      {isOpen && (
        <div className="px-6 py-5 text-sm text-slate-600 bg-white leading-relaxed">
          {children}
        </div>
      )}
    </div>
  );
};

export default InstructionPanel;
