
import React, { useState, useRef, useEffect } from 'react';
import { X, Plus } from 'lucide-react';

interface TableTagInputProps {
  value: string; // Comma separated string
  onChange: (value: string) => void;
  suggestions?: string[];
  placeholder?: string;
  colorTheme?: 'indigo' | 'green' | 'amber';
}

const TableTagInput: React.FC<TableTagInputProps> = ({ 
  value, 
  onChange, 
  suggestions = [], 
  placeholder = "輸入...", 
  colorTheme = 'indigo' 
}) => {
  const [inputValue, setInputValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [imeComposing, setImeComposing] = useState(false);
  const [imeLocalValue, setImeLocalValue] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const tags = value ? value.split(',').filter(Boolean) : [];

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
        setIsFocused(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const addTag = (tag: string) => {
    const trimmed = tag.trim();
    if (trimmed && !tags.includes(trimmed)) {
      const newTags = [...tags, trimmed];
      onChange(newTags.join(','));
    }
    setInputValue('');
    inputRef.current?.focus();
  };

  const removeTag = (indexToRemove: number) => {
    const newTags = tags.filter((_, index) => index !== indexToRemove);
    onChange(newTags.join(','));
  };

  const displayValue = imeComposing ? imeLocalValue : inputValue;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag(displayValue);
    } else if (e.key === 'Backspace' && !displayValue && tags.length > 0) {
      removeTag(tags.length - 1);
    }
  };

  const filteredSuggestions = suggestions.filter(s => 
    !tags.includes(s) && s.toLowerCase().includes(displayValue.toLowerCase())
  );

  const themeClasses = {
    indigo: {
      bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-100', hover: 'hover:bg-indigo-100'
    },
    green: {
      bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-100', hover: 'hover:bg-green-100'
    },
    amber: {
      bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-100', hover: 'hover:bg-amber-100'
    }
  }[colorTheme];

  return (
    <div className="relative w-full" ref={wrapperRef}>
      <div 
        className={`flex flex-wrap items-center gap-1.5 min-h-[34px] w-full p-1 rounded-lg transition-all ${isFocused ? 'bg-white ring-2 ring-indigo-100 border-indigo-300' : 'bg-transparent border border-transparent hover:border-slate-200'}`}
        onClick={() => {
          setIsFocused(true);
          setIsDropdownOpen(true);
          inputRef.current?.focus();
        }}
      >
        {tags.map((tag, index) => (
          <span 
            key={index} 
            className={`text-xs px-2 py-0.5 rounded-full border flex items-center space-x-1 ${themeClasses.bg} ${themeClasses.text} ${themeClasses.border}`}
          >
            <span>{tag}</span>
            <button 
              onClick={(e) => { e.stopPropagation(); removeTag(index); }}
              className={`rounded-full p-0.5 ${themeClasses.hover} transition-colors`}
            >
              <X size={10} />
            </button>
          </span>
        ))}
        
        <input
          ref={inputRef}
          type="text"
          className="flex-1 min-w-[60px] bg-transparent outline-none text-xs text-slate-700 placeholder-slate-300 py-1"
          placeholder={tags.length === 0 ? placeholder : ""}
          value={displayValue}
          onCompositionStart={() => {
            setImeComposing(true);
            setImeLocalValue(inputValue);
          }}
          onCompositionEnd={(e) => {
            const v = (e.target as HTMLInputElement).value;
            setInputValue(v);
            setImeComposing(false);
          }}
          onChange={(e) => {
            if (imeComposing) setImeLocalValue(e.target.value);
            else setInputValue(e.target.value);
            setIsDropdownOpen(true);
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            setIsFocused(true);
            setIsDropdownOpen(true);
          }}
        />
      </div>

      {/* Suggestions Dropdown */}
      {isDropdownOpen && isFocused && (filteredSuggestions.length > 0 || displayValue) && (
        <div className="absolute left-0 top-full mt-1 z-50 w-full min-w-[150px] bg-white rounded-lg shadow-lg border border-slate-100 py-1 max-h-48 overflow-y-auto">
          {filteredSuggestions.map(suggestion => (
            <div
              key={suggestion}
              className="px-3 py-2 text-xs text-slate-700 hover:bg-indigo-50 hover:text-indigo-600 cursor-pointer transition-colors"
              onClick={() => addTag(suggestion)}
            >
              {suggestion}
            </div>
          ))}
          
          {displayValue && !filteredSuggestions.includes(displayValue) && !tags.includes(displayValue) && (
             <div
              className="px-3 py-2 text-xs text-indigo-600 font-bold bg-indigo-50/50 hover:bg-indigo-100 cursor-pointer border-t border-slate-100 flex items-center"
              onClick={() => addTag(displayValue)}
            >
              <Plus size={12} className="mr-1"/>
              新增 "{displayValue}"
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TableTagInput;
