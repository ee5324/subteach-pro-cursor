import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Calculator, ChevronDown, GripVertical } from 'lucide-react';

const STORAGE_OPEN = 'floatingCalculatorOpen';
/** 舊版鍵名相容 */
const LEGACY_OPEN = 'settingsFloatingCalcOpen';
/** 舊版位置鍵：已不再讀寫，載入時清除以免誤解 */
const LEGACY_POS_KEYS = ['floatingCalculatorPos', 'settingsFloatingCalcPos'] as const;

const PANEL_W = 220;
const PANEL_H = 340;
const FAB_W = 72;
const FAB_H = 56;
const CALC_GAP = 4;

function outerSize(isOpen: boolean): { w: number; h: number } {
  if (!isOpen) return { w: FAB_W, h: FAB_H };
  return { w: Math.max(PANEL_W, FAB_W), h: PANEL_H + CALC_GAP + FAB_H };
}

/** 視窗右下角預設：以距離右、下邊緣的像素錨定（收合／展開僅改高度，角點不漂移） */
function defaultCorner(): { right: number; bottom: number } {
  return { right: 16, bottom: 16 };
}

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
  /** 固定以右下角為錨（CSS right／bottom），避免展開時用 top+大高度、收合後僅剩 FAB 造成視覺位移 */
  const [corner, setCorner] = useState<{ right: number; bottom: number }>({ right: 16, bottom: 16 });
  const [mounted, setMounted] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);
  const exprInputRef = useRef<HTMLInputElement>(null);
  const cornerRef = useRef(corner);
  cornerRef.current = corner;

  const dragRef = useRef<{
    active: boolean;
    pid: number | null;
    startX: number;
    startY: number;
    origRight: number;
    origBottom: number;
  }>({ active: false, pid: null, startX: 0, startY: 0, origRight: 16, origBottom: 16 });

  useEffect(() => {
    try {
      for (const k of LEGACY_POS_KEYS) localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
    setCorner(defaultCorner());
    setMounted(true);
  }, []);

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
      if (e.key === 'Delete') {
        e.preventDefault();
        clearAll();
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
  }, [open, append, backspace, clearAll, equals]);

  const endDrag = useCallback(() => {
    const d = dragRef.current;
    d.active = false;
    d.pid = null;
  }, []);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d.active || d.pid !== e.pointerId) return;
      const { w, h } = outerSize(open);
      const iw = window.innerWidth;
      const ih = window.innerHeight;
      const minR = 8;
      const minB = 8;
      const maxR = Math.max(minR, iw - w - 8);
      const maxB = Math.max(minB, ih - h - 8);
      // 游標往右移 → 元件往右跟 → right 變小
      const newRight = d.origRight - (e.clientX - d.startX);
      const newBottom = d.origBottom - (e.clientY - d.startY);
      setCorner({
        right: clamp(newRight, minR, maxR),
        bottom: clamp(newBottom, minB, maxB),
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
    if (!mounted) return;
    const onResize = () => {
      const { w, h } = outerSize(open);
      const iw = window.innerWidth;
      const ih = window.innerHeight;
      const minR = 8;
      const minB = 8;
      const maxR = Math.max(minR, iw - w - 8);
      const maxB = Math.max(minB, ih - h - 8);
      setCorner((c) => ({
        right: clamp(c.right, minR, maxR),
        bottom: clamp(c.bottom, minB, maxB),
      }));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [mounted, open]);

  const startDrag = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    dragRef.current = {
      active: true,
      pid: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origRight: cornerRef.current.right,
      origBottom: cornerRef.current.bottom,
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
      style={{ right: corner.right, bottom: corner.bottom, left: 'auto', top: 'auto' }}
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
                if (e.key === 'Delete') {
                  e.preventDefault();
                  clearAll();
                  return;
                }
                if (e.key === 'Enter') {
                  e.preventDefault();
                  equals();
                  return;
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
              鍵盤：數字與 + − * / . 、Enter 計算、Esc 收合、Delete 清空欄位；勿與本頁其他表單同時輸入。
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
