import React, { useState } from 'react';
import { HelpCircle, ChevronDown, ChevronUp } from 'lucide-react';

interface InstructionPanelProps {
  title?: string;
  children: React.ReactNode;
  isOpenDefault?: boolean;
}

export const CollapsibleItem: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="border border-slate-100 rounded-lg mb-2 overflow-hidden">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-2 flex items-center justify-between bg-slate-50 hover:bg-slate-100 transition-colors text-slate-700 font-medium text-left"
      >
        <span>{title}</span>
        {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {isOpen && (
        <div className="px-4 py-3 text-xs text-slate-500 bg-white border-t border-slate-100">
          {children}
        </div>
      )}
    </div>
  );
};

const InstructionPanel: React.FC<InstructionPanelProps> = ({ 
  title = "使用說明", 
  children, 
  isOpenDefault = false 
}) => {
  const [isOpen, setIsOpen] = useState(isOpenDefault);

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl mb-6 overflow-hidden transition-all duration-300 shadow-sm">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-5 py-4 flex items-center justify-between bg-white hover:bg-slate-50 transition-colors text-slate-800 font-bold border-b border-slate-100"
      >
        <div className="flex items-center">
          <HelpCircle size={20} className="mr-3 text-indigo-500" />
          {title}
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
