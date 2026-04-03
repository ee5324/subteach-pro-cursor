import React from 'react';
import { X, AlertTriangle, Info, CheckCircle } from 'lucide-react';
import { ModalProps } from '../types';

const Modal: React.FC<ModalProps> = ({
  isOpen,
  title,
  content,
  onConfirm,
  onCancel,
  confirmText = "確定",
  cancelText = "取消",
  type = 'info'
}) => {
  if (!isOpen) return null;

  const handleConfirm = () => {
    const result = onConfirm?.();
    if (result != null && typeof (result as Promise<unknown>)?.then === 'function') {
      (result as Promise<unknown>).then(() => onCancel?.()).catch(() => onCancel?.());
    } else {
      onCancel?.();
    }
  };

  const typeStyles = {
    info: { icon: Info, color: 'text-blue-500', bg: 'bg-blue-50', btn: 'bg-blue-600 hover:bg-blue-700' },
    warning: { icon: AlertTriangle, color: 'text-orange-500', bg: 'bg-orange-50', btn: 'bg-orange-600 hover:bg-orange-700' },
    danger: { icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-50', btn: 'bg-red-600 hover:bg-red-700' },
    success: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-50', btn: 'bg-green-600 hover:bg-green-700' }
  };

  const StyleConfig = typeStyles[type] || typeStyles.info;
  const Icon = StyleConfig.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-0 no-print">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 transition-opacity" 
        onClick={onCancel}
        aria-hidden="true"
      />

      {/* Modal Content */}
      <div className="relative bg-white rounded-lg shadow-xl transform transition-all sm:max-w-lg w-full overflow-hidden">
        <div className="px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
          <div className="sm:flex sm:items-start">
            <div className={`mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full ${StyleConfig.bg} sm:mx-0 sm:h-10 sm:w-10`}>
              <Icon className={`h-6 w-6 ${StyleConfig.color}`} aria-hidden="true" />
            </div>
            <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left w-full">
              <h3 className="text-lg leading-6 font-medium text-gray-900" id="modal-title">
                {title}
              </h3>
              <div className="mt-2">
                <div className="text-sm text-gray-500">
                  {content}
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
          {onConfirm && (
            <button
              type="button"
              className={`w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 ${StyleConfig.btn} text-base font-medium text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:ml-3 sm:w-auto sm:text-sm`}
              onClick={handleConfirm}
            >
              {confirmText}
            </button>
          )}
          <button
            type="button"
            className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
            onClick={onCancel}
          >
            {cancelText}
          </button>
        </div>
        <button 
            onClick={onCancel}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-500"
        >
            <X className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
};

export default Modal;