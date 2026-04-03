import React, { useState, useCallback, useEffect, useRef } from 'react';
import { MapPinned, Building2, TreeDeciduous, ChevronDown, ChevronRight, Tag, Search, X } from 'lucide-react';
import {
  CAMPUS_TITLE,
  BUILDINGS,
  OUTDOOR_AREAS,
  LEGEND_ITEMS,
  searchRoom,
  type BuildingPlan,
} from '../data/campusPlan';

const ANNOTATIONS_KEY = 'edutrack_campus_annotations';

export interface MapAnnotation {
  id: string;
  x: number;
  y: number;
  text: string;
}

function loadAnnotations(): MapAnnotation[] {
  try {
    const raw = localStorage.getItem(ANNOTATIONS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (_) {}
  return [];
}

function saveAnnotations(list: MapAnnotation[]) {
  localStorage.setItem(ANNOTATIONS_KEY, JSON.stringify(list));
}

/**
 * 校園平面圖：可標註浮動資訊、搜尋班級／教室並紅框顯示。
 */
const CampusMap: React.FC = () => {
  const [selectedBuilding, setSelectedBuilding] = useState<BuildingPlan | null>(null);
  const [expandedFloors, setExpandedFloors] = useState<Set<string>>(new Set());
  const [annotations, setAnnotations] = useState<MapAnnotation[]>(loadAnnotations);
  const [addMode, setAddMode] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedBuildingIds, setHighlightedBuildingIds] = useState<Set<string>>(new Set());
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    saveAnnotations(annotations);
  }, [annotations]);

  const toggleFloor = (buildingId: string, floor: string) => {
    const key = `${buildingId}-${floor}`;
    setExpandedFloors((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  /** 將 SVG 內點擊的螢幕座標轉成 viewBox 0~100 */
  const screenToViewBox = useCallback((clientX: number, clientY: number): { x: number; y: number } => {
    const svg = svgRef.current;
    if (!svg) return { x: 50, y: 50 };
    const rect = svg.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 100;
    const y = ((clientY - rect.top) / rect.height) * 100;
    return { x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) };
  }, []);

  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (addMode && e.target === e.currentTarget) {
      const { x, y } = screenToViewBox(e.clientX, e.clientY);
      setAnnotations((prev) => [
        ...prev,
        { id: `ann-${Date.now()}-${Math.random().toString(36).slice(2)}`, x, y, text: '標註' },
      ]);
      setAddMode(false);
    }
  };

  const handleAnnotationMouseDown = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (addMode) return;
    setDraggingId(id);
  };

  useEffect(() => {
    if (!draggingId) return;
    const onMove = (e: MouseEvent) => {
      const { x, y } = screenToViewBox(e.clientX, e.clientY);
      setAnnotations((prev) => prev.map((a) => (a.id === draggingId ? { ...a, x, y } : a)));
    };
    const onUp = () => setDraggingId(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [draggingId, screenToViewBox]);

  const updateAnnotationText = (id: string, text: string) => {
    setAnnotations((prev) => prev.map((a) => (a.id === id ? { ...a, text } : a)));
  };

  const removeAnnotation = (id: string) => {
    setAnnotations((prev) => prev.filter((a) => a.id !== id));
  };

  const handleSearch = () => {
    const results = searchRoom(searchQuery);
    const ids = new Set(results.map((r) => r.buildingId));
    setHighlightedBuildingIds(ids);
    if (results.length > 0) {
      const first = results[0];
      setSelectedBuilding(first.building);
      setExpandedFloors((prev) => new Set(prev).add(first.floorKey));
    }
  };

  const viewBox = '0 0 100 100';
  const padding = 1;

  const buildingColor = (id: string) => {
    const palette: Record<string, string> = {
      'red-brick': '#c2410c',
      'xingshan': '#1e40af',
      'jingye': '#15803d',
      'chengzheng': '#a16207',
      'zhixin': '#7c3aed',
      'east-wing': '#0d9488',
    };
    return palette[id] ?? '#475569';
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 lg:p-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-sm font-medium">
          <MapPinned size={16} />
          校園平面圖
        </div>
        <h2 className="mt-3 text-2xl lg:text-3xl font-bold text-slate-900">{CAMPUS_TITLE}</h2>
        <p className="mt-2 text-slate-600 leading-7">
          依 114.06.02 平面圖重新繪製。可新增浮動標註、搜尋班級／教室並紅框顯示；標註名稱請自行雙擊編輯。
        </p>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 平面圖區：搜尋列 + SVG */}
        <section className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-4 overflow-auto">
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <div className="flex flex-1 min-w-[200px] items-center gap-2">
              <Search size={18} className="text-slate-500 flex-shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="搜尋班級／教室（如 三.1、音樂教室）"
                className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 focus:border-blue-400"
              />
              <button
                type="button"
                onClick={handleSearch}
                className="px-3 py-2 rounded-lg bg-slate-700 text-white text-sm hover:bg-slate-800"
              >
                搜尋
              </button>
            </div>
            <button
              type="button"
              onClick={() => setAddMode((v) => !v)}
              className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${addMode ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
            >
              <Tag size={16} />
              {addMode ? '點擊圖上放置標註' : '新增標註'}
            </button>
          </div>

          <div className="min-h-[420px] flex items-center justify-center relative">
            <svg
              ref={svgRef}
              viewBox={viewBox}
              className="w-full max-w-2xl h-auto border border-slate-200 rounded-xl bg-slate-50 touch-none"
              style={{ aspectRatio: '1' }}
              onClick={handleSvgClick}
            >
              {/* 戶外區域 */}
              {OUTDOOR_AREAS.map((area) => (
                <g key={area.id}>
                  <rect
                    x={area.x + padding}
                    y={area.y + padding}
                    width={area.w - padding * 2}
                    height={area.h - padding * 2}
                    fill={area.id === 'road' ? '#e2e8f0' : area.name.includes('庭') || area.name.includes('場') || area.name.includes('園') ? '#dcfce7' : '#f1f5f9'}
                    stroke="#94a3b8"
                    strokeWidth="0.2"
                    rx="0.3"
                  />
                  {(area.h >= 6 && area.w >= 6) && (
                    <text
                      x={area.x + area.w / 2}
                      y={area.y + area.h / 2}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      className="fill-slate-600"
                      style={{ fontSize: area.w > 10 ? 2.2 : 1.6 }}
                    >
                      {area.name.replace('（永續校園示範區）', '')}
                    </text>
                  )}
                </g>
              ))}

              {/* 建築物 */}
              {BUILDINGS.map((b) => (
                <g
                  key={b.id}
                  onClick={(e) => {
                    if (!addMode) {
                      e.stopPropagation();
                      setSelectedBuilding(b);
                    }
                  }}
                  className="cursor-pointer"
                >
                  <rect
                    x={b.x + padding}
                    y={b.y + padding}
                    width={b.w - padding * 2}
                    height={b.h - padding * 2}
                    fill={buildingColor(b.id)}
                    fillOpacity={selectedBuilding?.id === b.id ? 1 : 0.85}
                    stroke={highlightedBuildingIds.has(b.id) ? '#dc2626' : selectedBuilding?.id === b.id ? '#0f172a' : '#64748b'}
                    strokeWidth={highlightedBuildingIds.has(b.id) ? 0.7 : selectedBuilding?.id === b.id ? 0.4 : 0.25}
                    rx="0.4"
                  />
                  {highlightedBuildingIds.has(b.id) && (
                    <rect
                      x={b.x + padding - 0.3}
                      y={b.y + padding - 0.3}
                      width={b.w - padding * 2 + 0.6}
                      height={b.h - padding * 2 + 0.6}
                      fill="none"
                      stroke="#dc2626"
                      strokeWidth="0.5"
                      rx="0.5"
                    />
                  )}
                  <text
                    x={b.x + b.w / 2}
                    y={b.y + b.h / 2}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="white"
                    style={{ fontSize: b.w > 14 ? 2.4 : 1.8, fontWeight: 600 }}
                  >
                    {b.name.split('（')[0]}
                  </text>
                </g>
              ))}

              {/* 浮動標註 */}
              {annotations.map((a) => {
                const label = a.text || '標註';
                const tw = Math.max(16, Math.min(50, label.length * 1.8));
                return (
                  <g
                    key={a.id}
                    onMouseDown={(e) => handleAnnotationMouseDown(e, a.id)}
                    style={{ cursor: draggingId === a.id ? 'grabbing' : addMode ? 'default' : 'grab' }}
                    className={draggingId === a.id ? '' : 'select-none'}
                  >
                    <rect
                      x={a.x - tw / 2}
                      y={a.y - 2.5}
                      width={tw}
                      height={5}
                      rx="0.5"
                      fill="white"
                      stroke="#64748b"
                      strokeWidth="0.2"
                    />
                    <text
                      x={a.x}
                      y={a.y + 0.2}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill="#334155"
                      style={{ fontSize: 1.8 }}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        if (draggingId) return;
                        const newText = window.prompt('標註名稱', a.text);
                        if (newText != null) updateAnnotationText(a.id, newText);
                      }}
                    >
                      {label}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          <p className="mt-3 text-xs text-slate-500 text-center">
            {addMode ? '點擊圖上任意處放置標註' : '點選建築可查看樓層；雙擊標註可編輯名稱；拖曳可移動標註'}
          </p>

          {/* 標註列表：可刪除 */}
          {annotations.length > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-100">
              <p className="text-xs font-medium text-slate-500 mb-2">浮動標註（點 X 刪除）</p>
              <ul className="flex flex-wrap gap-2">
                {annotations.map((a) => (
                  <li key={a.id} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-100 text-slate-700 text-sm">
                    <span>{a.text || '標註'}</span>
                    <button
                      type="button"
                      onClick={() => removeAnnotation(a.id)}
                      className="text-slate-400 hover:text-red-600 p-0.5"
                      title="刪除此標註"
                    >
                      <X size={12} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* 右側：建築與樓層 */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 overflow-auto">
          <h3 className="font-semibold text-slate-800 flex items-center gap-2">
            <Building2 size={18} />
            建築與樓層
          </h3>
          {selectedBuilding ? (
            <div className="mt-4 space-y-3">
              <p className="text-sm text-slate-600">{selectedBuilding.name}</p>
              {selectedBuilding.note && (
                <p className="text-xs text-slate-500">{selectedBuilding.note}</p>
              )}
              {highlightedBuildingIds.has(selectedBuilding.id) && (
                <p className="text-xs text-red-600 font-medium">↑ 搜尋結果紅框標示</p>
              )}
              <div className="space-y-1">
                {selectedBuilding.floors.map((f) => {
                  const key = `${selectedBuilding.id}-${f.floor}`;
                  const open = expandedFloors.has(key);
                  return (
                    <div key={f.floor} className="border border-slate-200 rounded-lg overflow-hidden">
                      <button
                        type="button"
                        onClick={() => toggleFloor(selectedBuilding.id, f.floor)}
                        className="w-full flex items-center gap-2 px-3 py-2 bg-slate-50 hover:bg-slate-100 text-left text-sm font-medium text-slate-800"
                      >
                        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        {f.label}（{f.floor}）
                      </button>
                      {open && (
                        <ul className="px-3 py-2 bg-white text-slate-600 text-sm flex flex-wrap gap-1.5 list-none">
                          {f.rooms.map((r, i) => (
                            <li key={i} className="px-2 py-0.5 rounded bg-slate-100">
                              {r.name}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-500">請在左側平面圖點選建築，或搜尋班級／教室</p>
          )}

          <div className="mt-6 pt-4 border-t border-slate-100">
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1">
              <TreeDeciduous size={12} />
              前庭廣場內
            </h4>
            <ul className="mt-2 text-xs text-slate-600 space-y-0.5">
              {LEGEND_ITEMS.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
};

export default CampusMap;
