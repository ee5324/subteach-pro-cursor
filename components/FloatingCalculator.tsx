import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Calculator, ChevronDown, GripVertical } from 'lucide-react';

const STORAGE_KEY = 'floatingCalculatorPos';
const STORAGE_OPEN = 'floatingCalculatorOpen';
/** 舊版鍵名相容 */
const LEGACY_POS = 'settingsFloatingCalcPos';
const LEGACY_OPEN = 'settingsFloatingCalcOpen';

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function safeCompute(raw: string): string {
  const t = raw.trim();
  if (!t) return '';
  if (!/^[\d+\-*/.]+$/.test(t)) return '錯誤';
  try {
    const n = Function(`"use strict"; return (${t})`)() as number;
    if (typeof n !== 'number' || !Number.isFinite(n)) return '錯誤';
    const rounded = Math.round(n * 1e8) / 1e8;
    return String(rounded);
  } catch {
    return '錯誤';
  }
}

function sanitizeExpr(raw: string): string {
  const s = raw.replace(/[^0-9+\-*/.]/g, '');
  return s.slice(0, 200);
}

function isTypingInOtherFormField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const el = target.closest('input, textarea, select, [contenteditable="true"]');
  if (!el) return false;
  return !el.closest('[data-floating-calc]');
}

/**
 * 全站：固定於視窗、可收合、可拖曳；展開後可於算式欄鍵盤輸入，或在面板內（焦點不在算式欄時）用數字與運算子鍵操作。
 */
const FloatingCalculator: React.FC = () => {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_OPEN) === '1' || localStorage.getItem(LEGACY_OPEN) === '1';
    } catch {
      return false;
    }
  });
  const [expr, setExpr] = useState('');
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: 16, top: 120 });
  const [mounted, setMounted] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);
  const exprInputRef = useRef<HTMLInputElement>(null);
  const posRef = useRef(pos);
  posRef.current = pos;

  const dragRef = useRef<{
    active: boolean;
    pid: number | null;
    startX: number;
    startY: number;
    origLeft: number;
    origTop: number;
  }>({ active: false, pid: null, startX: 0, startY: 0, origLeft: 0, origTop: 0 });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_POS);
      if (raw) {
        const p = JSON.parse(raw) as { left?: number; top?: number };
        if (typeof p.left === 'number' && typeof p.top === 'number') {
          setPos({
            left: clamp(p.left, 8, window.innerWidth - 64),
            top: clamp(p.top, 8, window.innerHeight - 64),
          });
        }
      } else {
        setPos({
          left: window.innerWidth - 72,
          top: window.innerHeight - 96,
        });
      }
    } catch {
      setPos({ left: window.innerWidth - 72, top: window.innerHeight - 96 });
    }
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(pos));
    } catch {
      /* ignore */
    }
  }, [pos, mounted]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_OPEN, open ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => exprInputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  const append = useCallback((ch: string) => {
    setExpr((prev) => {
      if (prev === '錯誤') return ch === '.' ? '.' : ch;
      if (prev === '') return ch;
      // 單獨一個 0 後接數字：改為新數字開頭，避免 05、012 等
      if (prev === '0' && /[\d]/.test(ch) && ch !== '.') return ch;
      return prev + ch;
    });
  }, []);

  const backspace = useCallback(() => {
    setExpr((prev) => {
      if (prev.length <= 1) return '';
      return prev.slice(0, -1);
    });
  }, []);

  const clearAll = useCallback(() => setExpr(''), []);

  const equals = useCallback(() => {
    setExpr((prev) => safeCompute(prev));
  }, []);

  /** 面板內且焦點不在算式欄時，由鍵盤輸入數字與運算子 */
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingInOtherFormField(e.target)) return;
      const panel = panelRef.current;
      if (!panel) return;
      const t = e.target as Node | null;
      if (!t || !panel.contains(t)) return;
      if (t instanceof HTMLInputElement && t.matches('[data-calc-expr]')) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        equals();
        return;
      }
      if (e.key === 'Backspace') {
        e.preventDefault();
        backspace();
        return;
      }
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        append(e.key);
        return;
      }
      if (e.key === '+' || e.key === '-' || e.key === '*' || e.key === '/') {
        e.preventDefault();
        append(e.key);
        return;
      }
      if (e.key === '.' || e.key === '。') {
        e.preventDefault();
        append('.');
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open, append, backspace, equals]);

  const endDrag = useCallback(() => {
    const d = dragRef.current;
    d.active = false;
    d.pid = null;
  }, []);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d.active || d.pid !== e.pointerId) return;
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      const w = open ? 220 : 72;
      const h = open ? 340 : 56;
      setPos({
        left: clamp(d.origLeft + dx, 8, window.innerWidth - w - 8),
        top: clamp(d.origTop + dy, 8, window.innerHeight - h - 8),
      });
    };
    const onUp = (e: PointerEvent) => {
      if (dragRef.current.pid === e.pointerId) endDrag();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [endDrag, open]);

  useEffect(() => {
    const onResize = () => {
      setPos((p) => ({
        left: clamp(p.left, 8, window.innerWidth - 72),
        top: clamp(p.top, 8, window.innerHeight - 72),
      }));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const startDrag = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    dragRef.current = {
      active: true,
      pid: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origLeft: posRef.current.left,
      origTop: posRef.current.top,
    };
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const keys: string[][] = [
    ['7', '8', '9', '/'],
    ['4', '5', '6', '*'],
    ['1', '2', '3', '-'],
    ['.', '0', '⌫', '+'],
  ];

  if (!mounted) return null;

  return (
    <div
      className="fixed z-[9980] flex flex-col items-end gap-1 pointer-events-none [&>*]:pointer-events-auto"
      style={{ left: pos.left, top: pos.top }}
      aria-live="polite"
    >
      {open && (
        <div
          ref={panelRef}
          data-floating-calc
          className="w-[220px] rounded-xl border border-slate-200 bg-white shadow-2xl shadow-slate-400/40 overflow-hidden"
        >
          <div
            data-drag-handle
            onPointerDown={startDrag}
            className="flex items-center gap-1 px-2 py-2 bg-indigo-600 text-white cursor-grab active:cursor-grabbing border-b border-indigo-500/80 select-none"
            title="拖曳此列可移動計算機"
          >
            <GripVertical size={16} className="shrink-0 opacity-90" aria-hidden />
            <Calculator size={16} className="shrink-0" aria-hidden />
            <span className="text-xs font-bold flex-1 truncate">計算機</span>
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => setOpen(false)}
              className="p-1 rounded-md hover:bg-white/15 shrink-0"
              aria-label="收合計算機"
              title="收合（Esc）"
            >
              <ChevronDown size={18} />
            </button>
          </div>
          <div className="px-2 py-2 bg-slate-50 border-b border-slate-200 space-y-1">
            <input
              ref={exprInputRef}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              spellCheck={false}
              data-calc-expr
              value={expr}
              onChange={(e) => setExpr(sanitizeExpr(e.target.value))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  equals();
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setOpen(false);
                }
              }}
              className="w-full font-mono text-right text-sm text-slate-800 px-2 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
              aria-label="算式（可鍵盤輸入數字與加減乘除）"
              placeholder="輸入算式…"
            />
            <p className="text-[10px] text-slate-500 leading-tight px-0.5">
              鍵盤：數字與 + − * / . 、Enter 計算、Esc 收合；勿與本頁其他表單同時輸入。
            </p>
          </div>
          <div className="p-2 grid gap-1 select-none">
            {keys.map((row, ri) => (
              <div key={ri} className="grid grid-cols-4 gap-1">
                {row.map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => {
                      if (k === '⌫') backspace();
                      else append(k);
                    }}
                    className="py-2 text-sm font-semibold rounded-lg border border-slate-200 bg-white hover:bg-indigo-50 text-slate-800"
                  >
                    {k}
                  </button>
                ))}
              </div>
            ))}
            <div className="grid grid-cols-2 gap-1">
              <button
                type="button"
                onClick={clearAll}
                className="py-2 text-sm font-bold rounded-lg border border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100"
              >
                C
              </button>
              <button
                type="button"
                onClick={equals}
                className="py-2 text-sm font-bold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
              >
                ＝
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-stretch gap-0 rounded-full shadow-lg border-2 border-white overflow-hidden bg-indigo-600">
        <button
          type="button"
          onPointerDown={startDrag}
          className="w-5 shrink-0 flex items-center justify-center bg-indigo-700/90 hover:bg-indigo-800 text-indigo-100 cursor-grab active:cursor-grabbing"
          title="拖曳移動位置"
          aria-label="拖曳移動計算機位置"
        >
          <GripVertical size={14} className="opacity-90" />
        </button>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={`flex h-14 w-14 items-center justify-center transition-colors ${
            open ? 'bg-indigo-100 text-indigo-800' : 'bg-indigo-600 text-white hover:bg-indigo-700'
          }`}
          title={open ? '收合計算機' : '展開計算機'}
          aria-expanded={open}
          aria-label={open ? '收合計算機' : '展開計算機'}
        >
          <Calculator size={26} />
        </button>
      </div>
    </div>
  );
};

export default FloatingCalculator;
