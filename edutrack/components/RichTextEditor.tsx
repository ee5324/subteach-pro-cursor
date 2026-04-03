import React, { useEffect, useRef } from 'react';
import { Bold, Italic, Underline, Type, Link as LinkIcon, Eraser } from 'lucide-react';

interface RichTextEditorProps {
  initialValue: string;
  onChange: (val: string) => void;
}

const RichTextEditor: React.FC<RichTextEditorProps> = ({ initialValue, onChange }) => {
    const editorRef = useRef<HTMLDivElement>(null);
    const hasInit = useRef(false);

    useEffect(() => {
        if (editorRef.current && !hasInit.current) {
            editorRef.current.innerHTML = initialValue || '';
            hasInit.current = true;
        }
    }, []); // Only run on mount to prevent cursor jumping

    const handleInput = () => {
        if (editorRef.current) {
            const html = editorRef.current.innerHTML;
            // Only trigger change if content is meaningful
            if (html === '<br>') onChange('');
            else onChange(html);
        }
    };

    const exec = (command: string, value: string | undefined = undefined) => {
        document.execCommand(command, false, value);
        if (editorRef.current) editorRef.current.focus();
        handleInput();
    };

    const Btn = ({ onClick, children, title, className = "" }: any) => (
        <button 
            type="button"
            onClick={(e) => { e.preventDefault(); onClick(); }} 
            title={title} 
            className={`p-1.5 rounded hover:bg-gray-200 text-gray-700 transition-colors ${className}`}
        >
            {children}
        </button>
    );

    return (
        <div className="border rounded-md border-gray-300 overflow-hidden bg-white flex flex-col h-full">
            <div className="flex flex-wrap items-center gap-0.5 bg-gray-50 p-1 border-b border-gray-200">
                <Btn onClick={() => exec('bold')} title="粗體"><Bold size={14}/></Btn>
                <Btn onClick={() => exec('italic')} title="斜體"><Italic size={14}/></Btn>
                <Btn onClick={() => exec('underline')} title="底線"><Underline size={14}/></Btn>
                <div className="w-px h-4 bg-gray-300 mx-1"></div>
                <Btn onClick={() => exec('fontSize', '1')} title="字體: 小"><span className="text-xs font-serif">A</span></Btn>
                <Btn onClick={() => exec('fontSize', '3')} title="字體: 中"><span className="text-sm font-serif">A</span></Btn>
                <Btn onClick={() => exec('fontSize', '5')} title="字體: 大"><span className="text-lg font-bold font-serif">A</span></Btn>
                <div className="w-px h-4 bg-gray-300 mx-1"></div>
                <Btn onClick={() => exec('foreColor', '#ef4444')} title="文字顏色: 紅" className="text-red-500"><Type size={14}/></Btn>
                <Btn onClick={() => exec('foreColor', '#2563eb')} title="文字顏色: 藍" className="text-blue-600"><Type size={14}/></Btn>
                <Btn onClick={() => exec('foreColor', '#16a34a')} title="文字顏色: 綠" className="text-green-600"><Type size={14}/></Btn>
                <Btn onClick={() => exec('foreColor', '#000000')} title="文字顏色: 黑" className="text-black"><Type size={14}/></Btn>
                <div className="w-px h-4 bg-gray-300 mx-1"></div>
                <Btn onClick={() => { const url = prompt('輸入連結網址:'); if(url) exec('createLink', url); }} title="插入連結"><LinkIcon size={14}/></Btn>
                <Btn onClick={() => exec('removeFormat')} title="清除格式"><Eraser size={14}/></Btn>
            </div>
            <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                className="flex-1 p-3 overflow-y-auto outline-none text-sm prose prose-sm max-w-none min-h-[120px]"
                onInput={handleInput}
                style={{ lineHeight: '1.5' }}
            />
        </div>
    );
};

export default RichTextEditor;