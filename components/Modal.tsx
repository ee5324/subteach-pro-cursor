import React from 'react';
import { X, CheckCircle, AlertTriangle, Info, AlertCircle } from 'lucide-react';

export type ModalType = 'success' | 'error' | 'warning' | 'info';
export type ModalMode = 'alert' | 'confirm';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm?: () => void;
  title: string;
  message?: React.ReactNode;
  children?: React.ReactNode;
  type?: ModalType;
  mode?: ModalMode;
  confirmText?: string;
  cancelText?: string;
  maxWidth?: string; // New prop for custom width
}

const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  children,
  type = 'info',
  mode = 'alert',
  confirmText = '確定',
  cancelText = '取消',
  maxWidth = 'max-w-md', // Default width
}) => {
  if (!isOpen) return null;

  const getIcon = () => {
    switch (type) {
      case 'success': return <CheckCircle size={28} className="text-green-500" />;
      case 'error': return <AlertCircle size={28} className="text-red-500" />;
      case 'warning': return <AlertTriangle size={28} className="text-amber-500" />;
      default: return <Info size={28} className="text-indigo-500" />;
    }
  };

  const getHeaderColor = () => {
     switch (type) {
      case 'success': return 'bg-green-50';
      case 'error': return 'bg-red-50';
      case 'warning': return 'bg-amber-50';
      default: return 'bg-indigo-50';
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className={`bg-white rounded-2xl shadow-2xl w-full ${maxWidth} overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-100 flex flex-col max-h-[90vh]`}>
        
        {/* Header */}
        <div className={`px-6 py-4 flex items-center space-x-3 flex-shrink-0 ${getHeaderColor()}`}>
          <div className="bg-white p-2 rounded-full shadow-sm">
             {getIcon()}
          </div>
          <h3 className="text-lg font-bold text-slate-800 flex-1">{title}</h3>
          {mode === 'alert' && (
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
              <X size={20} />
            </button>
          )}
        </div>

        {/* Body - Scrollable */}
        <div className="px-6 py-6 overflow-y-auto flex-1">
          {children ? children : (
            <div className="text-slate-600 text-sm leading-relaxed whitespace-pre-line">
              {message}
            </div>
          )}
        </div>

        {/* Footer - Fixed at bottom */}
        {(!children || onConfirm) && (
          <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end space-x-3 flex-shrink-0">
            {mode === 'confirm' && (
              <button
                onClick={onClose}
                className="px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-medium transition-colors focus:ring-2 focus:ring-slate-200"
              >
                {cancelText}
              </button>
            )}
            <button
              onClick={() => {
                if (onConfirm) onConfirm();
                if (mode === 'alert') onClose();
              }}
              className={`px-6 py-2 rounded-lg text-white font-bold shadow-md transition-transform active:scale-95 focus:ring-2 focus:ring-offset-1 ${
                  type === 'error' ? 'bg-red-500 hover:bg-red-600 focus:ring-red-300' :
                  type === 'warning' ? 'bg-amber-500 hover:bg-amber-600 focus:ring-amber-300' :
                  type === 'success' ? 'bg-green-600 hover:bg-green-700 focus:ring-green-300' :
                  'bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-300'
              }`}
            >
              {confirmText}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Modal;
