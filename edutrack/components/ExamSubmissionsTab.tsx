import React, { useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw, Unlock, Save, UserPlus, Trash2, ExternalLink, Copy } from 'lucide-react';
import type { AllowedUser, ExamAwardsConfig, ExamCampaign, ExamSubmitAllowedUser, ExamSubmission } from '../types';
import {
  createExamCampaign,
  getExamAwardsConfig,
  getExamCampaigns,
  getExamSubmitAllowedUsers,
  getExamSubmissions,
  saveExamAwardsConfig,
  setExamSubmitAllowedUser,
  unlockExamSubmission,
  updateExamCampaign,
} from '../services/api';

interface Props {
  currentAccess: AllowedUser | null;
  currentUserEmail?: string | null;
}

const ExamSubmissionsTab: React.FC<Props> = ({ currentAccess, currentUserEmail }) => {
  const isAdmin = currentAccess?.role === 'admin';

  const [campaigns, setCampaigns] = useState<ExamCampaign[]>([]);
  const [campaignLoading, setCampaignLoading] = useState(false);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('');

  const selectedCampaign = useMemo(
    () => campaigns.find((c) => c.id === selectedCampaignId) ?? null,
    [campaigns, selectedCampaignId]
  );

  const [newCampaign, setNewCampaign] = useState<{ title: string; academicYear: string; semester: string; examNo: string; lockedByDefault: boolean }>({
    title: '',
    academicYear: '114',
    semester: '下學期',
    examNo: '1',
    lockedByDefault: true,
  });

  const [awardsConfig, setAwardsConfig] = useState<ExamAwardsConfig>({ categories: [] });
  const [awardsSaving, setAwardsSaving] = useState(false);

  const [whitelist, setWhitelist] = useState<ExamSubmitAllowedUser[]>([]);
  const [newWhitelistEmail, setNewWhitelistEmail] = useState('');
  const [newWhitelistClassName, setNewWhitelistClassName] = useState('');
  const [newWhitelistTeacherName, setNewWhitelistTeacherName] = useState('');
  const [batchWhitelistText, setBatchWhitelistText] = useState('');
  const [whitelistLoading, setWhitelistLoading] = useState(false);

  const [submissions, setSubmissions] = useState<ExamSubmission[]>([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);

  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const publicSubmitUrl = typeof window !== 'undefined' ? `${window.location.origin}/exam-submit` : '';
  const openPublicUrl = () => {
    if (publicSubmitUrl) window.open(publicSubmitUrl, '_blank', 'noopener,noreferrer');
  };
  const copyPublicUrl = async () => {
    if (!publicSubmitUrl) return;
    try {
      await navigator.clipboard.writeText(publicSubmitUrl);
      setMsg('已複製對外填報網址');
      setErr(null);
    } catch {
      setErr('無法複製，請手動複製網址');
    }
  };

  const reloadCampaigns = async () => {
    setCampaignLoading(true);
    setErr(null);
    try {
      const list = await getExamCampaigns();
      setCampaigns(list);
      if (!selectedCampaignId && list.length > 0) setSelectedCampaignId(list[0].id);
    } catch (e: any) {
      setErr(e?.message || '載入段考活動失敗');
    } finally {
      setCampaignLoading(false);
    }
  };

  const reloadAwardsConfig = async () => {
    setErr(null);
    try {
      const cfg = await getExamAwardsConfig();
      setAwardsConfig(cfg);
    } catch (e: any) {
      setErr(e?.message || '載入獎項設定失敗');
    }
  };

  const reloadWhitelist = async () => {
    setWhitelistLoading(true);
    setErr(null);
    try {
      const list = await getExamSubmitAllowedUsers();
      setWhitelist(list);
    } catch (e: any) {
      setErr(e?.message || '載入白名單失敗');
    } finally {
      setWhitelistLoading(false);
    }
  };

  const reloadSubmissions = async (campaignId: string) => {
    setSubmissionsLoading(true);
    setErr(null);
    try {
      const list = await getExamSubmissions(campaignId);
      setSubmissions(list);
    } catch (e: any) {
      setErr(e?.message || '載入提報資料失敗');
    } finally {
      setSubmissionsLoading(false);
    }
  };

  useEffect(() => {
    reloadCampaigns();
    reloadAwardsConfig();
    if (isAdmin) reloadWhitelist();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedCampaignId) reloadSubmissions(selectedCampaignId);
  }, [selectedCampaignId]);

  const addCampaign = async () => {
    if (!isAdmin) return;
    const title = newCampaign.title.trim();
    if (!title) return;
    setErr(null);
    setMsg(null);
    try {
      const created = await createExamCampaign({
        title,
        academicYear: newCampaign.academicYear.trim(),
        semester: newCampaign.semester,
        examNo: newCampaign.examNo.trim(),
        lockedByDefault: newCampaign.lockedByDefault,
        closeAt: null,
      });
      await reloadCampaigns();
      setSelectedCampaignId(created.id);
      setNewCampaign((p) => ({ ...p, title: '' }));
      setMsg('已新增段考活動');
    } catch (e: any) {
      setErr(e?.message || '新增失敗');
    }
  };

  const toggleCampaignLockedDefault = async () => {
    if (!isAdmin || !selectedCampaign) return;
    try {
      await updateExamCampaign(selectedCampaign.id, { lockedByDefault: !selectedCampaign.lockedByDefault });
      await reloadCampaigns();
      setMsg('已更新活動設定');
    } catch (e: any) {
      setErr(e?.message || '更新失敗');
    }
  };

  const saveAwards = async () => {
    if (!isAdmin) return;
    setAwardsSaving(true);
    setErr(null);
    setMsg(null);
    try {
      await saveExamAwardsConfig(awardsConfig);
      setMsg('已儲存獎項設定');
    } catch (e: any) {
      setErr(e?.message || '儲存獎項設定失敗');
    } finally {
      setAwardsSaving(false);
    }
  };

  const addWhitelist = async () => {
    if (!isAdmin) return;
    const email = newWhitelistEmail.trim().toLowerCase();
    if (!email) return;
    setErr(null);
    setMsg(null);
    try {
      await setExamSubmitAllowedUser(email, {
        enabled: true,
        className: newWhitelistClassName.trim() || null,
        teacherName: newWhitelistTeacherName.trim() || null,
      });
      setNewWhitelistEmail('');
      setNewWhitelistClassName('');
      setNewWhitelistTeacherName('');
      await reloadWhitelist();
      setMsg('已加入白名單');
    } catch (e: any) {
      setErr(e?.message || '加入白名單失敗');
    }
  };

  const addWhitelistBatch = async () => {
    if (!isAdmin) return;
    const raw = batchWhitelistText.trim();
    if (!raw) return;
    setErr(null);
    setMsg(null);
    const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const rows = lines
      .map((line) => {
        // 支援：email,班級,導師 或 email\t班級\t導師
        const parts = line.split(/\s*,\s*|\t+/g).map((x) => x.trim()).filter(Boolean);
        const email = (parts[0] ?? '').toLowerCase();
        if (!email) return null;
        const className = parts[1] ?? '';
        const teacherName = parts[2] ?? '';
        return { email, className, teacherName };
      })
      .filter(Boolean) as { email: string; className: string; teacherName: string }[];

    if (rows.length === 0) return;
    try {
      for (const r of rows) {
        await setExamSubmitAllowedUser(r.email, {
          enabled: true,
          className: r.className.trim() || null,
          teacherName: r.teacherName.trim() || null,
        });
      }
      setBatchWhitelistText('');
      await reloadWhitelist();
      setMsg(`已批次加入白名單（${rows.length} 筆）`);
    } catch (e: any) {
      setErr(e?.message || '批次加入白名單失敗');
    }
  };

  const setWhitelistEnabled = async (email: string, enabled: boolean) => {
    if (!isAdmin) return;
    setErr(null);
    try {
      await setExamSubmitAllowedUser(email, { enabled });
      await reloadWhitelist();
    } catch (e: any) {
      setErr(e?.message || '更新白名單失敗');
    }
  };

  const unlockOne = async (id: string) => {
    if (!isAdmin || !currentUserEmail) return;
    setErr(null);
    setMsg(null);
    try {
      await unlockExamSubmission(id, currentUserEmail);
      if (selectedCampaignId) await reloadSubmissions(selectedCampaignId);
      setMsg('已解鎖，導師可重新送出');
    } catch (e: any) {
      setErr(e?.message || '解鎖失敗');
    }
  };

  return (
    <div className="max-w-6xl mx-auto py-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">段考名單提報</h2>
          <p className="text-sm text-slate-500 mt-1">管理段考活動、獎項細項、對外填報白名單，以及各班提報與解鎖。</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {publicSubmitUrl && (
            <>
              <button
                type="button"
                onClick={openPublicUrl}
                className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm inline-flex items-center gap-2"
                title={publicSubmitUrl}
              >
                <ExternalLink size={16} /> 開啟對外網址
              </button>
              <button
                type="button"
                onClick={copyPublicUrl}
                className="px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm inline-flex items-center gap-2"
                title={publicSubmitUrl}
              >
                <Copy size={16} /> 複製網址
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => {
              reloadCampaigns();
              reloadAwardsConfig();
              if (isAdmin) reloadWhitelist();
              if (selectedCampaignId) reloadSubmissions(selectedCampaignId);
            }}
            className="px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm inline-flex items-center gap-2"
          >
            <RefreshCw size={16} /> 重新整理
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
        <details className="group">
          <summary className="cursor-pointer select-none flex items-center justify-between gap-3">
            <span className="font-semibold text-slate-800">使用說明（可摺疊）</span>
            <span className="text-xs text-slate-500 group-open:hidden">展開</span>
            <span className="text-xs text-slate-500 hidden group-open:inline">收合</span>
          </summary>
          <div className="mt-3 text-sm text-slate-700 space-y-2">
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <span className="font-semibold">獎項分類 / 細項是什麼？</span> 例如「優異 / 進步」是分類；分類底下的「國語、數學…」等為細項。導師在對外填報時可依學生勾選一或多個細項（可複選）。
              </li>
              <li>
                <span className="font-semibold">活動的「預設鎖定 / 不鎖定」差異</span>：此設定是活動層級的規則，代表系統希望導師送出後是否以「鎖定」為主流程。
                <span className="font-semibold">預設鎖定</span>較能避免反覆修改造成資料混亂；若選<span className="font-semibold">不鎖定</span>，通常表示允許導師在期限內自行反覆調整（仍建議搭配清楚的截止時間與管理方式）。
              </li>
              <li>
                <span className="font-semibold">提報資料的「鎖定」是什麼？</span> 導師每班每次段考送出後，該班資料會標記為 <span className="font-mono">locked=true</span>。若需修改，請管理者在下方「提報總覽」按 <span className="font-semibold">解鎖</span>，導師才能重新送出更新。
              </li>
              <li>
                <span className="font-semibold">同一班重複提報</span>：以最後一次送出為準，並記錄送出者 Email 與時間。
              </li>
            </ul>
          </div>
        </details>
      </div>

      {(err || msg) && (
        <div className={`rounded-lg border p-3 text-sm ${err ? 'bg-red-50 border-red-200 text-red-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
          {err ?? msg}
        </div>
      )}

      {/* 活動管理 */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-800">段考活動</h3>
          {campaignLoading && <span className="text-xs text-slate-500">載入中…</span>}
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <select
            value={selectedCampaignId}
            onChange={(e) => setSelectedCampaignId(e.target.value)}
            className="border rounded px-2 py-1.5 text-sm min-w-[16rem]"
          >
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
          {isAdmin && selectedCampaign && (
            <button type="button" onClick={toggleCampaignLockedDefault} className="px-3 py-1.5 rounded text-sm bg-slate-700 text-white hover:bg-slate-800">
              預設{selectedCampaign.lockedByDefault ? '鎖定' : '不鎖定'}
            </button>
          )}
        </div>

        {isAdmin && (
          <div className="border-t pt-3">
            <div className="text-sm font-medium text-slate-700 mb-2">新增活動</div>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
              <input className="border rounded px-2 py-1.5 text-sm md:col-span-2" placeholder="活動名稱（例：114下 第1次段考）" value={newCampaign.title} onChange={(e) => setNewCampaign((p) => ({ ...p, title: e.target.value }))} />
              <input className="border rounded px-2 py-1.5 text-sm" placeholder="學年（例：114）" value={newCampaign.academicYear} onChange={(e) => setNewCampaign((p) => ({ ...p, academicYear: e.target.value }))} />
              <select className="border rounded px-2 py-1.5 text-sm" value={newCampaign.semester} onChange={(e) => setNewCampaign((p) => ({ ...p, semester: e.target.value }))}>
                <option value="上學期">上學期</option>
                <option value="下學期">下學期</option>
              </select>
              <div className="flex gap-2">
                <input className="border rounded px-2 py-1.5 text-sm w-20" placeholder="次" value={newCampaign.examNo} onChange={(e) => setNewCampaign((p) => ({ ...p, examNo: e.target.value }))} />
                <button type="button" onClick={addCampaign} className="flex-1 px-3 py-1.5 rounded text-sm bg-blue-600 text-white hover:bg-blue-700 inline-flex items-center justify-center gap-1">
                  <Plus size={16} /> 新增
                </button>
              </div>
            </div>
          </div>
        )}
        {!isAdmin && <p className="text-xs text-slate-500">（僅管理者可新增/修改活動設定）</p>}
      </div>

      {/* 獎項設定 */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-800">獎項設定（優異 / 進步 細項）</h3>
          {isAdmin && (
            <button type="button" onClick={saveAwards} disabled={awardsSaving} className="px-3 py-1.5 rounded text-sm bg-slate-800 text-white hover:bg-slate-900 disabled:opacity-50 inline-flex items-center gap-2">
              <Save size={16} /> {awardsSaving ? '儲存中…' : '儲存'}
            </button>
          )}
        </div>
        <p className="text-xs text-slate-500">格式：每行一個細項（例：國語、數學…）。</p>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {awardsConfig.categories.map((cat, idx) => (
            <div key={cat.id} className="border rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <input
                  className="border rounded px-2 py-1 text-sm font-medium"
                  value={cat.label}
                  onChange={(e) => {
                    const v = e.target.value;
                    setAwardsConfig((p) => {
                      const next = { ...p, categories: [...p.categories] };
                      next.categories[idx] = { ...next.categories[idx], label: v };
                      return next;
                    });
                  }}
                  disabled={!isAdmin}
                />
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => setAwardsConfig((p) => ({ ...p, categories: p.categories.filter((_, i) => i !== idx) }))}
                    className="text-slate-400 hover:text-red-600"
                    title="刪除分類"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
              <textarea
                className="w-full border rounded p-2 text-sm min-h-[120px]"
                value={(cat.items ?? []).map((x) => x.label).join('\n')}
                onChange={(e) => {
                  const lines = e.target.value.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
                  setAwardsConfig((p) => {
                    const next = { ...p, categories: [...p.categories] };
                    next.categories[idx] = {
                      ...next.categories[idx],
                      items: lines.map((label) => ({ id: label, label })),
                    };
                    return next;
                  });
                }}
                disabled={!isAdmin}
              />
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
        {!isAdmin && <p className="text-xs text-slate-500">（僅管理者可編輯獎項設定）</p>}
      </div>

      {/* 白名單管理 */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-800">對外填報白名單（導師）</h3>
          {whitelistLoading && <span className="text-xs text-slate-500">載入中…</span>}
        </div>
        {!isAdmin ? (
          <p className="text-xs text-slate-500">（僅管理者可管理白名單）</p>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2 items-center">
              <input className="border rounded px-2 py-1.5 text-sm" placeholder="teacher@example.com" value={newWhitelistEmail} onChange={(e) => setNewWhitelistEmail(e.target.value)} />
              <input className="border rounded px-2 py-1.5 text-sm" placeholder="班級（例：301）" value={newWhitelistClassName} onChange={(e) => setNewWhitelistClassName(e.target.value)} />
              <input className="border rounded px-2 py-1.5 text-sm" placeholder="導師姓名（例：王小明）" value={newWhitelistTeacherName} onChange={(e) => setNewWhitelistTeacherName(e.target.value)} />
              <button type="button" onClick={addWhitelist} className="px-3 py-1.5 rounded text-sm bg-blue-600 text-white hover:bg-blue-700 inline-flex items-center gap-2">
                <UserPlus size={16} /> 加入
              </button>
            </div>

            <div className="border rounded-lg p-3 bg-slate-50 space-y-2">
              <div className="text-sm font-medium text-slate-700">批次新增</div>
              <div className="text-xs text-slate-600">
                每行一筆，格式：<span className="font-mono">email,班級,導師姓名</span>（也支援 tab 分隔）。例如：
                <span className="font-mono ml-2">t1@example.com,301,王老師</span>
              </div>
              <textarea className="w-full border rounded p-2 text-sm min-h-[120px]" value={batchWhitelistText} onChange={(e) => setBatchWhitelistText(e.target.value)} placeholder="teacher1@example.com,301,王老師&#10;teacher2@example.com,302,李老師" />
              <div className="flex items-center justify-end">
                <button type="button" onClick={addWhitelistBatch} className="px-3 py-1.5 rounded text-sm bg-slate-800 text-white hover:bg-slate-900">
                  批次加入
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm border border-slate-200 rounded-lg">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left">Email</th>
                    <th className="px-3 py-2 text-left">班級</th>
                    <th className="px-3 py-2 text-left">導師</th>
                    <th className="px-3 py-2 text-left">啟用</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {whitelist.map((u) => (
                    <tr key={u.email}>
                      <td className="px-3 py-2 font-mono text-xs">{u.email}</td>
                      <td className="px-3 py-2">{u.className || '-'}</td>
                      <td className="px-3 py-2">{u.teacherName || u.displayName || '-'}</td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => setWhitelistEnabled(u.email, !u.enabled)}
                          className={`px-2 py-1 rounded text-xs ${u.enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'}`}
                        >
                          {u.enabled ? '啟用' : '停用'}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {whitelist.length === 0 && (
                    <tr>
                      <td className="px-3 py-3 text-slate-500 text-sm" colSpan={4}>
                        尚無白名單
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* 提報總覽 */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-800">提報總覽（依班級一筆，最新覆蓋）</h3>
          {submissionsLoading && <span className="text-xs text-slate-500">載入中…</span>}
        </div>
        {!selectedCampaignId ? (
          <p className="text-sm text-slate-500">請先選擇段考活動</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border border-slate-200 rounded-lg">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left">班級</th>
                  <th className="px-3 py-2 text-left">最後送出</th>
                  <th className="px-3 py-2 text-left">送出者</th>
                  <th className="px-3 py-2 text-left">鎖定</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {submissions.map((s) => (
                  <tr key={s.id}>
                    <td className="px-3 py-2 font-medium">{s.className}</td>
                    <td className="px-3 py-2 font-mono text-xs">{s.submittedAt}</td>
                    <td className="px-3 py-2 font-mono text-xs">{s.submittedByEmail}</td>
                    <td className="px-3 py-2">{s.locked ? '是' : '否'}</td>
                    <td className="px-3 py-2 text-right">
                      {isAdmin && s.locked && (
                        <button type="button" onClick={() => unlockOne(s.id)} className="px-2 py-1 rounded text-xs bg-amber-600 text-white hover:bg-amber-700 inline-flex items-center gap-1">
                          <Unlock size={14} /> 解鎖
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {submissions.length === 0 && (
                  <tr>
                    <td className="px-3 py-3 text-slate-500 text-sm" colSpan={5}>
                      尚無提報資料
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default ExamSubmissionsTab;

