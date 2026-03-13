
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Search, X, Check, Plus } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
  subLabel?: string;
  className?: string; // Allow custom styling for specific options (e.g., Pending)
}

interface SearchableSelectProps {
  options: SelectOption[];
  value: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  required?: boolean;
  allowCreate?: boolean; // 新增：是否允許建立新選項
}

const SearchableSelect: React.FC<SearchableSelectProps> = ({
  options,
  value,
  onChange,
  placeholder = "請選擇...",
  className = "",
  disabled = false,
  required = false,
  allowCreate = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [wrapperRef]);

  // Find selected option label
  // If not found in options but we have a value (likely a newly created one), use value as label
  const selectedOption = useMemo(() => {
    const found = options.find(opt => opt.value === value);
    if (!found && value && allowCreate) {
        return { value: value, label: value };
    }
    return found;
  }, [options, value, allowCreate]);

  // Filter options
  const filteredOptions = useMemo(() => {
    if (!searchTerm) return options;
    const lowerTerm = searchTerm.toLowerCase();
    return options.filter(opt => 
      opt.label.toLowerCase().includes(lowerTerm) || 
      (opt.subLabel && opt.subLabel.toLowerCase().includes(lowerTerm))
    );
  }, [options, searchTerm]);

  // Check if we should show "Create" option
  const showCreateOption = allowCreate && searchTerm && !options.some(opt => opt.label === searchTerm);

  // Handle Input Change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    setIsOpen(true);
  };

  // Handle Option Click
  const handleOptionClick = (optionValue: string) => {
    onChange(optionValue);
    setIsOpen(false);
    setSearchTerm(''); // Reset search after selection
  };

  // Handle Create Click
  const handleCreateClick = () => {
    onChange(searchTerm); // Pass the raw search term as the new value
    setIsOpen(false);
    setSearchTerm('');
  };

  // Handle Focus
  const handleFocus = () => {
    if (!disabled) {
        setIsOpen(true);
    }
  };

  // Clear Selection
  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setSearchTerm('');
    inputRef.current?.focus();
  };

  // Determine display text
  const displayValue = isOpen ? searchTerm : (selectedOption ? selectedOption.label : '');

  return (
    <div className={`relative ${className}`} ref={wrapperRef}>
      <div 
        className={`
          flex items-center w-full px-3 py-2 border rounded-lg bg-white transition-all
          ${isOpen ? 'ring-2 ring-indigo-500 border-transparent' : 'border-slate-300 hover:border-slate-400'}
          ${disabled ? 'bg-slate-100 cursor-not-allowed opacity-70' : 'cursor-text'}
          ${required && !value && !isOpen ? 'border-red-300' : ''}
        `}
        onClick={() => {
            if(!disabled) {
                setIsOpen(true);
                inputRef.current?.focus();
            }
        }}
      >
        <Search size={16} className="text-slate-400 mr-2 flex-shrink-0" />
        
        <input
          ref={inputRef}
          type="text"
          className="flex-1 bg-transparent border-none outline-none text-sm text-slate-800 placeholder-slate-400 min-w-0"
          placeholder={selectedOption ? selectedOption.label : placeholder}
          value={displayValue}
          onChange={handleInputChange}
          onFocus={handleFocus}
          disabled={disabled}
        />

        <div className="flex items-center flex-shrink-0 ml-1">
            {value && !disabled && (
                <button 
                    type="button"
                    onClick={handleClear}
                    className="p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 mr-1"
                >
                    <X size={14} />
                </button>
            )}
            <ChevronDown size={16} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {/* Dropdown Menu */}
      {isOpen && !disabled && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-60 overflow-y-auto animate-in fade-in zoom-in-95 duration-100">
          {filteredOptions.length === 0 && !showCreateOption ? (
            <div className="px-4 py-3 text-sm text-slate-400 text-center">
              找不到符合 "{searchTerm}" 的結果
            </div>
          ) : (
            <ul className="py-1">
              {filteredOptions.map((opt) => {
                const isSelected = opt.value === value;
                return (
                    <li 
                        key={opt.value}
                        onClick={() => handleOptionClick(opt.value)}
                        className={`
                            px-4 py-2 text-sm cursor-pointer flex items-center justify-between group
                            ${isSelected ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700 hover:bg-slate-50'}
                            ${opt.className || ''}
                        `}
                    >
                        <div>
                            <div className="font-medium">{opt.label}</div>
                            {opt.subLabel && <div className="text-xs text-slate-400 group-hover:text-slate-500">{opt.subLabel}</div>}
                        </div>
                        {isSelected && <Check size={16} className="text-indigo-600" />}
                    </li>
                );
              })}

              {/* Create New Option */}
              {showCreateOption && (
                  <li 
                    onClick={handleCreateClick}
                    className="px-4 py-2 text-sm cursor-pointer flex items-center text-blue-600 bg-blue-50 hover:bg-blue-100 border-t border-slate-200"
                  >
                      <Plus size={16} className="mr-2" />
                      <div>
                          <span className="font-bold">新增 "{searchTerm}"</span>
                          <div className="text-xs text-blue-400">將自動加入教師名單 (請記得後續補齊資料)</div>
                      </div>
                  </li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

export default SearchableSelect;
