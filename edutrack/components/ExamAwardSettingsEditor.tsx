import React, { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { ExamAwardItem, ExamAwardsConfig } from '../types';
import {
  EXAM_AWARD_GRADE_NUMBERS,
  filterExamAwardsConfigForGrade,
  formatGradesApplicableShort,
} from '../utils/examAwardGrade';

interface Props {
  awardsConfig: ExamAwardsConfig;
  setAwardsConfig: React.Dispatch<React.SetStateAction<ExamAwardsConfig>>;
  isAdmin: boolean;
}

function toggleItemGrade(item: ExamAwardItem, g: number): ExamAwardItem {
  const arr = item.gradesApplicable ?? [];
  const has = arr.includes(g);
  const next = has ? arr.filter((x) => x !== g) : [...arr, g].sort((a, b) => a - b);
  if (next.length === 0) return { ...item, gradesApplicable: undefined };
  return { ...item, gradesApplicable: next };
}

function setItemGradesPreset(item: ExamAwardItem, preset: number[]): ExamAwardItem {
  return { ...item, gradesApplicable: [...preset].sort((a, b) => a - b) };
}

const ExamAwardSettingsEditor: React.FC<Props> = ({ awardsConfig, setAwardsConfig, isAdmin }) => {
  const [previewGrade, setPreviewGrade] = useState<number | 'all'>('all');

  const previewFiltered = useMemo(() => {
    if (previewGrade === 'all') return awardsConfig;
    return filterExamAwardsConfigForGrade(awardsConfig, previewGrade);
  }, [awardsConfig, previewGrade]);

  const updateItem = (catIdx: number, itemIdx: number, patch: Partial<ExamAwardItem>) => {
    setAwardsConfig((p) => {
      const categories = [...p.categories];
      const cat = { ...categories[catIdx] };
      const items = [...(cat.items ?? [])];
      const cur = items[itemIdx];
      if (!cur) return p;
      items[itemIdx] = { ...cur, ...patch };
      cat.items = items;
      categories[catIdx] = cat;
      return { ...p, categories };
    });
  };

  const removeItem = (catIdx: number, itemIdx: number) => {
    setAwardsConfig((p) => {
      const categories = [...p.categories];
      const cat = { ...categories[catIdx] };
      cat.items = (cat.items ?? []).filter((_, i) => i !== itemIdx);
      categories[catIdx] = cat;
      return { ...p, categories };
    });
  };

  const addItem = (catIdx: number) => {
    setAwardsConfig((p) => {
      const categories = [...p.categories];
      const cat = { ...categories[catIdx] };
      const id = `item-${Date.now()}`;
      cat.items = [...(cat.items ?? []), { id, label: '新細項', gradesApplicable: undefined }];
      categories[catIdx] = cat;
      return { ...p, categories };
    });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <label className="block text-xs font-medium text-slate-600">給導師的填報說明（顯示於對外填報頁）</label>
        <textarea
          className="w-full border rounded p-2 text-sm min-h-[88px]"
          placeholder="例：優異／進步之認定依教務處公告；名額與成績標準請見校網連結…"
          value={awardsConfig.teacherInstructions ?? ''}
          onChange={(e) => setAwardsConfig((p) => ({ ...p, teacherInstructions: e.target.value }))}
          disabled={!isAdmin}
        />
        <p className="text-xs text-slate-500">可寫得獎標準、公告連結、洽詢方式；導師於對外頁會一併看到。</p>
      </div>

      <div className="rounded-lg border border-indigo-100 bg-indigo-50/50 p-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-indigo-950">預覽：導師畫面會看到哪些細項</span>
          <select
            className="border rounded px-2 py-1.5 text-sm bg-white"
            value={previewGrade === 'all' ? '' : String(previewGrade)}
            onChange={(e) => {
              const v = e.target.value;
              setPreviewGrade(v === '' ? 'all' : parseInt(v, 10));
            }}
          >
            <option value="">不篩選（全部細項列表）</option>
            {EXAM_AWARD_GRADE_NUMBERS.map((g) => (
              <option key={g} value={g}>
                僅 {g} 年級導師
              </option>
            ))}
          </select>
        </div>
        <p className="text-xs text-indigo-900/80">
          依班級代碼（如 701→七年級）判斷導師年級；在此選年級可預覽該年級會出現的細項（已套用下方「適用年級」設定）。
        </p>
        <ul className="text-sm text-slate-800 space-y-1.5 list-none pl-0 border-t border-indigo-100 pt-2">
          {previewFiltered.categories.length === 0 ? (
            <li className="text-slate-500">尚無分類</li>
          ) : (
            previewFiltered.categories.map((cat) => (
              <li key={cat.id}>
                <span className="font-semibold">{cat.label}</span>
                <span className="text-slate-600">
                  ：
                  {(cat.items ?? []).length > 0 ? (cat.items ?? []).map((it) => it.label).join('、') : '（此年級無細項）'}
                </span>
              </li>
            ))
          )}
        </ul>
      </div>

      <p className="text-sm text-slate-700">
        <span className="font-semibold">獎項細項</span>：每一分類下可新增多個「細項」；各細項可設定
        <span className="font-semibold"> 僅哪些年級要填 </span>
        （依導師班級代碼之年級顯示）。未勾選「僅限特定年級」＝全部年級都會看到該細項。
      </p>

      <div className="space-y-4">
        {awardsConfig.categories.map((cat, catIdx) => (
          <div key={cat.id} className="border rounded-xl border-slate-200 overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border-b border-slate-200">
              <span className="text-xs text-slate-500 shrink-0">分類名稱</span>
              <input
                className="flex-1 min-w-0 border rounded px-2 py-1.5 text-sm font-semibold"
                value={cat.label}
                onChange={(e) => {
                  const v = e.target.value;
                  setAwardsConfig((p) => {
                    const next = { ...p, categories: [...p.categories] };
                    next.categories[catIdx] = { ...next.categories[catIdx], label: v };
                    return next;
                  });
                }}
                disabled={!isAdmin}
              />
              {isAdmin && (
                <button
                  type="button"
                  onClick={() =>
                    setAwardsConfig((p) => ({
                      ...p,
                      categories: p.categories.filter((_, i) => i !== catIdx),
                    }))
                  }
                  className="text-slate-400 hover:text-red-600 p-1"
                  title="刪除分類"
                >
                  <Trash2 size={18} />
                </button>
              )}
            </div>
            <div className="p-3 space-y-3">
              {(cat.items ?? []).length === 0 && <p className="text-sm text-slate-500">請新增細項</p>}
              {(cat.items ?? []).map((item, itemIdx) => {
                const restricted = (item.gradesApplicable?.length ?? 0) > 0;
                return (
                  <div key={item.id} className="rounded-lg border border-slate-100 bg-slate-50/80 p-3 space-y-2">
                    <div className="flex flex-wrap items-start gap-2">
                      <div className="flex-1 min-w-[160px]">
                        <label className="block text-xs text-slate-500 mb-0.5">細項名稱</label>
                        <input
                          className="w-full border rounded px-2 py-1.5 text-sm"
                          value={item.label}
                          onChange={(e) => updateItem(catIdx, itemIdx, { label: e.target.value })}
                          disabled={!isAdmin}
                        />
                      </div>
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => removeItem(catIdx, itemIdx)}
                          className="mt-5 text-xs px-2 py-1 rounded border border-red-200 text-red-700 hover:bg-red-50"
                        >
                          移除
                        </button>
                      )}
                    </div>
                    <div className="space-y-1">
                      <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={restricted}
                          onChange={(e) => {
                            if (e.target.checked) {
                              updateItem(catIdx, itemIdx, { gradesApplicable: [7, 8, 9] });
                            } else {
                              updateItem(catIdx, itemIdx, { gradesApplicable: undefined });
                            }
                          }}
                          disabled={!isAdmin}
                        />
                        僅限特定年級（不勾＝全部年級皆顯示此細項）
                      </label>
                      {restricted && (
                        <div className="space-y-2 pl-1">
                          <div className="flex flex-wrap gap-1">
                            {EXAM_AWARD_GRADE_NUMBERS.map((g) => {
                              const on = (item.gradesApplicable ?? []).includes(g);
                              return (
                                <button
                                  key={g}
                                  type="button"
                                  disabled={!isAdmin}
                                  onClick={() => updateItem(catIdx, itemIdx, toggleItemGrade(item, g))}
                                  className={`px-2 py-1 rounded text-xs border transition-colors ${
                                    on
                                      ? 'bg-slate-800 text-white border-slate-800'
                                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                                  }`}
                                >
                                  {g}年級
                                </button>
                              );
                            })}
                          </div>
                          {isAdmin && (
                            <div className="flex flex-wrap gap-1.5">
                              <button
                                type="button"
                                className="text-xs px-2 py-1 rounded bg-white border border-slate-200 hover:bg-slate-100"
                                onClick={() => updateItem(catIdx, itemIdx, setItemGradesPreset(item, [7, 8, 9]))}
                              >
                                快捷：國中 7–9
                              </button>
                              <button
                                type="button"
                                className="text-xs px-2 py-1 rounded bg-white border border-slate-200 hover:bg-slate-100"
                                onClick={() => updateItem(catIdx, itemIdx, setItemGradesPreset(item, [10, 11, 12]))}
                              >
                                快捷：高中 10–12
                              </button>
                              <button
                                type="button"
                                className="text-xs px-2 py-1 rounded bg-white border border-slate-200 hover:bg-slate-100"
                                onClick={() => updateItem(catIdx, itemIdx, setItemGradesPreset(item, [1, 2, 3, 4, 5, 6]))}
                              >
                                快捷：國小 1–6
                              </button>
                            </div>
                          )}
                          <p className="text-xs text-slate-500">目前：{formatGradesApplicableShort(item.gradesApplicable)}</p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => addItem(catIdx)}
                  className="text-sm px-3 py-1.5 rounded border border-dashed border-slate-300 text-slate-600 hover:bg-slate-50 w-full"
                >
                  ＋ 新增細項
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {isAdmin && (
        <button
          type="button"
          onClick={() =>
            setAwardsConfig((p) => ({
              ...p,
              categories: [...p.categories, { id: `cat-${Date.now()}`, label: '新分類', items: [] }],
            }))
          }
          className="px-3 py-1.5 rounded text-sm bg-slate-200 text-slate-700 hover:bg-slate-300 inline-flex items-center gap-2"
        >
          <Plus size={16} /> 新增分類
        </button>
      )}
    </div>
  );
};

export default ExamAwardSettingsEditor;
