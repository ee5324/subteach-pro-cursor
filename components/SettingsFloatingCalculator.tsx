import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Calculator, ChevronDown, GripVertical } from 'lucide-react';

const STORAGE_KEY = 'settingsFloatingCalcPos';
const STORAGE_OPEN = 'settingsFloatingCalcOpen';

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function safeCompute(raw: string): string {
  const t = raw.trim();
  if (!t) return '0';
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

/**
 * 系統設定頁用：固定於視窗（捲動時仍看得見），可收合、可拖曳標題列調整位置。
 */
const SettingsFloatingCalculator: React.FC = () => {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_OPEN) === '1';
    } catch {
      return false;
    }
  });
  const [expr, setExpr] = useState('0');
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: 16, top: 120 });
  const [mounted, setMounted] = useState(false);

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
      const raw = localStorage.getItem(STORAGE_KEY);
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
          top: window.innerHeight - (open ? 320 : 96),
        });
      }
    } catch {
      setPos({ left: window.innerWidth - 72, top: window.innerHeight - 96 });
    }
    setMounted(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 僅掛載時初始化
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
      const h = open ? 300 : 56;
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
      origLeft: pos.left,
      origTop: pos.top,
    };
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const append = (ch: string) => {
    setExpr((prev) => {
      if (prev === '0' && /[\d.]/.test(ch) && ch !== '.') return ch;
      if (prev === '錯誤') return ch === '.' ? '0.' : ch;
      return prev + ch;
    });
  };

  const backspace = () => {
    setExpr((prev) => {
      if (prev.length <= 1) return '0';
      return prev.slice(0, -1);
    });
  };

  const clearAll = () => setExpr('0');

  const equals = () => {
    setExpr((prev) => safeCompute(prev));
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
        <div className="w-[220px] rounded-xl border border-slate-200 bg-white shadow-2xl shadow-slate-400/40 overflow-hidden select-none">
          <div
            data-drag-handle
            onPointerDown={startDrag}
            className="flex items-center gap-1 px-2 py-2 bg-indigo-600 text-white cursor-grab active:cursor-grabbing border-b border-indigo-500/80"
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
              title="收合"
            >
              <ChevronDown size={18} />
            </button>
          </div>
          <div className="px-2 py-2 bg-slate-50 border-b border-slate-200">
            <div className="font-mono text-right text-sm text-slate-800 min-h-[2.25rem] break-all leading-snug px-1">
              {expr}
            </div>
          </div>
          <div className="p-2 grid gap-1">
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

export default SettingsFloatingCalculator;
