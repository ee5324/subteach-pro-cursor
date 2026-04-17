import React, { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  RefreshCw,
  Unlock,
  Save,
  UserPlus,
  Trash2,
  ExternalLink,
  Copy,
  Users,
  Pencil,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import type { AllowedUser, ExamAwardsConfig, ExamCampaign, ExamSubmitAllowedUser, ExamSubmission } from '../types';
import type { AwardStudent } from '../types';
import ExamAwardSettingsEditor from './ExamAwardSettingsEditor';
import type { HomeroomTeacherForExamWhitelistRow } from '../services/api';
import {
  createExamCampaign,
  getExamAwardsConfig,
  getExamCampaigns,
  getExamSubmitAllowedUsers,
  getExamSubmissions,
  getHomeroomTeachersForExamWhitelist,
  saveExamAwardsConfig,
  setExamSubmitAllowedUser,
  deleteExamSubmitAllowedUser,
  deleteExamSubmission,
  unlockExamSubmission,
  updateExamCampaign,
} from '../services/api';

interface Props {
  currentAccess: AllowedUser | null;
  currentUserEmail?: string | null;
  onNavigateToTab?: (tabId: string) => void;
}

/** 班級代碼如 301、701 → 年級（百位數）；無法解析則排最後 */
function gradeFromClassName(className: string | undefined | null): number {
  const s = (className || '').trim();
  const m = s.match(/^(\d{1,2})(\d{2})$/);
  if (m) return parseInt(m[1], 10);
  const d = s.replace(/\D/g, '');
  if (d.length >= 3) return parseInt(d.slice(0, 1), 10) || 999;
  if (d.length > 0) return parseInt(d[0], 10) || 999;
  return 999;
}

/** 同年級內依班級代碼數值排序 */
function classNumericFromClassName(className: string | undefined | null): number {
  const s = (className || '').trim();
  const m = s.match(/^(\d{1,2})(\d{2})$/);
  if (m) return parseInt(m[1] + m[2], 10);
  const d = s.replace(/\D/g, '');
  return d ? parseInt(d, 10) : 0;
}

function formatDateTimeInTaipei(value: string | undefined | null): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '-';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(d);
}

const EXAM_TO_AWARDS_DRAFT_KEY = 'edutrack.examSubmissions.awardsDraft';

const ExamSubmissionsTab: React.FC<Props> = ({ currentAccess, currentUserEmail, onNavigateToTab }) => {
  const isAdmin = currentAccess?.role === 'admin';
  const [expandedSubmissionId, setExpandedSubmissionId] = useState<string | null>(null);

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
  const [newWhitelistNote, setNewWhitelistNote] = useState('');
  /** 修改白名單：表單草稿（Email 不可改） */
  const [editWhitelistDraft, setEditWhitelistDraft] = useState<ExamSubmitAllowedUser | null>(null);
  const [batchWhitelistText, setBatchWhitelistText] = useState('');
  const [whitelistLoading, setWhitelistLoading] = useState(false);
  const [homeroomImporting, setHomeroomImporting] = useState(false);
  /** 匯入按鈕下方即時說明（讀取中／錯誤／成功），避免「點了沒反應」 */
  const [importHomeroomFeedback, setImportHomeroomFeedback] = useState<{
    tone: 'info' | 'error' | 'success';
    text: string;
  } | null>(null);
  /** 匯入時教師主檔無 Email：帶入姓名／班級後，請在此手填 Email 再寫入白名單 */
  const [pendingHomeroomRows, setPendingHomeroomRows] = useState<HomeroomTeacherForExamWhitelistRow[]>([]);
  const [pendingHomeroomEmailInputs, setPendingHomeroomEmailInputs] = useState<Record<string, string>>({});
  /** 對外填報白名單區塊收合 */
  const [whitelistSectionOpen, setWhitelistSectionOpen] = useState(false);

  const whitelistSortedByGrade = useMemo(() => {
    return [...whitelist].sort((a, b) => {
      const ga = gradeFromClassName(a.className);
      const gb = gradeFromClassName(b.className);
      if (ga !== gb) return ga - gb;
      const ca = classNumericFromClassName(a.className);
      const cb = classNumericFromClassName(b.className);
      if (ca !== cb) return ca - cb;
      return (a.email || '').localeCompare(b.email || '');
    });
  }, [whitelist]);

  const pendingHomeroomSortedByGrade = useMemo(() => {
    return [...pendingHomeroomRows].sort((a, b) => {
      const ga = gradeFromClassName(a.className);
      const gb = gradeFromClassName(b.className);
      if (ga !== gb) return ga - gb;
      const ca = classNumericFromClassName(a.className);
      const cb = classNumericFromClassName(b.className);
      if (ca !== cb) return ca - cb;
      return (a.teacherName || '').localeCompare(b.teacherName || '', 'zh-Hant');
    });
  }, [pendingHomeroomRows]);

  const [submissions, setSubmissions] = useState<ExamSubmission[]>([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);

  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const submissionsByClass = useMemo(
    () =>
      [...submissions].sort((a, b) =>
        String(a.className ?? '').localeCompare(String(b.className ?? ''), undefined, { numeric: true })
      ),
    [submissions]
  );

  const awardStudentsForSummary = useMemo<AwardStudent[]>(() => {
    const rows: AwardStudent[] = [];
    for (const submission of submissionsByClass) {
      for (const stu of submission.students ?? []) {
        for (const key of stu.awards ?? []) {
          rows.push({
            className: String(stu.className ?? submission.className ?? '').trim(),
            name: String(stu.name ?? '').trim(),
            seat: String(stu.seat ?? '').trim() || undefined,
            awardName: key,
          });
        }
      }
    }
    return rows;
  }, [submissionsByClass]);

  const publicSubmitUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    const basePath = window.location.pathname.replace(/#.*$/, '');
    // Use hash route to stay compatible with deployments under subpaths.
    return `${window.location.origin}${basePath}#/exam-submit`;
  }, []);
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
        note: newWhitelistNote.trim() || null,
      });
      setNewWhitelistEmail('');
      setNewWhitelistClassName('');
      setNewWhitelistTeacherName('');
      setNewWhitelistNote('');
      await reloadWhitelist();
      setMsg('已加入白名單');
    } catch (e: any) {
      setErr(e?.message || '加入白名單失敗');
    }
  };

  const importHomeroomTeachersFromRoster = async () => {
    if (!isAdmin) {
      setImportHomeroomFeedback({
        tone: 'error',
        text: '目前帳號不是教學組管理者，無法匯入白名單。請以具 admin 身分之帳號登入。',
      });
      return;
    }
    setErr(null);
    setMsg(null);
    setPendingHomeroomRows([]);
    setPendingHomeroomEmailInputs({});
    setImportHomeroomFeedback({ tone: 'info', text: '正在讀取主系統「teachers」集合並篩選導師…' });
    setHomeroomImporting(true);
    try {
      const { rows, error } = await getHomeroomTeachersForExamWhitelist();
      if (error) {
        setImportHomeroomFeedback({ tone: 'error', text: error });
        setErr(error);
        return;
      }
      if (rows.length === 0) {
        const hint =
          '讀取成功，但沒有符合條件的導師。請在代課主系統「教師管理」標註導師身分（或畢業班導師／職稱含「導師」）、且非退休。';
        setImportHomeroomFeedback({ tone: 'error', text: hint });
        setErr(hint);
        return;
      }
      const withEmail = rows.filter((r) => r.email.includes('@'));
      const noEmail = rows.filter((r) => !r.email.includes('@'));
      const emailInputs: Record<string, string> = {};
      noEmail.forEach((r) => {
        emailInputs[r.teacherId] = '';
      });
      setPendingHomeroomRows(noEmail);
      setPendingHomeroomEmailInputs(emailInputs);

      setImportHomeroomFeedback({
        tone: 'info',
        text:
          withEmail.length > 0
            ? `已讀取 ${rows.length} 位導師：其中 ${withEmail.length} 位有學校信箱，將自動寫入白名單…`
            : `已讀取 ${rows.length} 位導師（皆無學校信箱）：請在下方表格手填 Email 後加入白名單。`,
      });

      let ok = 0;
      let fail = 0;
      for (const r of withEmail) {
        try {
          await setExamSubmitAllowedUser(r.email, {
            enabled: true,
            className: r.className,
            teacherName: r.teacherName,
          });
          ok += 1;
        } catch {
          fail += 1;
        }
      }
      await reloadWhitelist();

      let doneText = '';
      if (withEmail.length > 0) {
        doneText = `已自動寫入有信箱者 ${ok} 筆${fail > 0 ? `（${fail} 筆失敗）` : ''}。`;
      }
      if (noEmail.length > 0) {
        doneText += `${doneText ? ' ' : ''}另有 ${noEmail.length} 位無學校信箱：已帶入姓名與班級，請在下方「手填 Email」欄位輸入後按「加入白名單」。`;
      }
      if (!doneText) {
        doneText = '未寫入任何筆（請檢查資料）。';
      }
      setImportHomeroomFeedback({
        tone: fail > 0 ? 'error' : 'success',
        text: doneText,
      });
      if (withEmail.length > 0) {
        setMsg(`已從教師名單寫入 ${ok} 筆${fail > 0 ? `（${fail} 筆失敗）` : ''}${noEmail.length > 0 ? `；${noEmail.length} 筆待手填 Email。` : ''}`);
      } else if (noEmail.length > 0) {
        setMsg(`已帶入 ${noEmail.length} 位導師之姓名與班級，請手填 Email 後加入白名單。`);
      }
    } catch (e: any) {
      const m = e?.message || '從教師名單匯入失敗';
      setImportHomeroomFeedback({ tone: 'error', text: `發生錯誤：${m}` });
      setErr(m);
    } finally {
      setHomeroomImporting(false);
    }
  };

  const addPendingHomeroomToWhitelist = async (row: HomeroomTeacherForExamWhitelistRow) => {
    if (!isAdmin) return;
    const raw = (pendingHomeroomEmailInputs[row.teacherId] ?? '').trim().toLowerCase();
    if (!raw || !raw.includes('@')) {
      setErr('請輸入有效的 Google 帳號（Email），與導師登入段考填報時一致。');
      return;
    }
    setErr(null);
    setMsg(null);
    try {
      await setExamSubmitAllowedUser(raw, {
        enabled: true,
        className: row.className,
        teacherName: row.teacherName,
      });
      setPendingHomeroomRows((prev) => prev.filter((x) => x.teacherId !== row.teacherId));
      setPendingHomeroomEmailInputs((prev) => {
        const next = { ...prev };
        delete next[row.teacherId];
        return next;
      });
      await reloadWhitelist();
      setMsg(`已加入白名單：${row.teacherName}（${raw}）`);
    } catch (e: any) {
      setErr(e?.message || '加入失敗');
    }
  };

  const addAllPendingHomeroomWithFilledEmails = async () => {
    if (!isAdmin || pendingHomeroomRows.length === 0) return;
    setErr(null);
    setMsg(null);
    let ok = 0;
    let skip = 0;
    let fail = 0;
    const stillPending: HomeroomTeacherForExamWhitelistRow[] = [];
    for (const r of pendingHomeroomRows) {
      const raw = (pendingHomeroomEmailInputs[r.teacherId] ?? '').trim().toLowerCase();
      if (!raw.includes('@')) {
        stillPending.push(r);
        skip += 1;
        continue;
      }
      try {
        await setExamSubmitAllowedUser(raw, {
          enabled: true,
          className: r.className,
          teacherName: r.teacherName,
        });
        ok += 1;
      } catch {
        fail += 1;
        stillPending.push(r);
      }
    }
    setPendingHomeroomRows(stillPending);
    const nextInputs: Record<string, string> = {};
    stillPending.forEach((r) => {
      nextInputs[r.teacherId] = pendingHomeroomEmailInputs[r.teacherId] ?? '';
    });
    setPendingHomeroomEmailInputs(nextInputs);
    await reloadWhitelist();
    setMsg(`批次加入：成功 ${ok} 筆${skip > 0 ? `，略過未填 Email ${skip} 筆` : ''}${fail > 0 ? `，失敗 ${fail} 筆` : ''}。`);
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

  const startEditWhitelist = (u: ExamSubmitAllowedUser) => {
    setEditWhitelistDraft({ ...u });
    setErr(null);
    setMsg(null);
  };

  const saveWhitelistEdit = async () => {
    if (!isAdmin || !editWhitelistDraft) return;
    setErr(null);
    setMsg(null);
    try {
      await setExamSubmitAllowedUser(editWhitelistDraft.email, {
        enabled: editWhitelistDraft.enabled,
        className: editWhitelistDraft.className?.trim() || null,
        teacherName: editWhitelistDraft.teacherName?.trim() || null,
        note: editWhitelistDraft.note?.trim() || null,
        displayName: editWhitelistDraft.displayName?.trim() || null,
      });
      setEditWhitelistDraft(null);
      await reloadWhitelist();
      setMsg('已更新白名單');
    } catch (e: any) {
      setErr(e?.message || '更新失敗');
    }
  };

  const removeWhitelist = async (email: string) => {
    if (!isAdmin) return;
    if (!confirm(`確定從段考填報白名單刪除 ${email}？`)) return;
    setErr(null);
    setMsg(null);
    try {
      await deleteExamSubmitAllowedUser(email);
      if (editWhitelistDraft?.email === email) setEditWhitelistDraft(null);
      await reloadWhitelist();
      setMsg('已刪除白名單');
    } catch (e: any) {
      setErr(e?.message || '刪除失敗');
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

  const deleteOneSubmission = async (s: ExamSubmission) => {
    if (!isAdmin) return;
    if (!confirm(`確定刪除 ${s.className} 的提報資料？刪除後無法復原。`)) return;
    setErr(null);
    setMsg(null);
    try {
      await deleteExamSubmission(s.id);
      if (selectedCampaignId) await reloadSubmissions(selectedCampaignId);
      setMsg(`已刪除 ${s.className} 的提報資料`);
    } catch (e: any) {
      setErr(e?.message || '刪除提報資料失敗');
    }
  };

  const formatAwardLabel = (awardKey: string) => {
    const idx = awardKey.indexOf(':');
    if (idx <= 0) return awardKey;
    const catId = awardKey.slice(0, idx);
    const itemId = awardKey.slice(idx + 1);
    const cat = awardsConfig.categories.find((c) => c.id === catId);
    const item = cat?.items?.find((it) => it.id === itemId);
    return `${cat?.label ?? catId}・${item?.label ?? itemId}`;
  };

  const aggregatedAwards = useMemo(() => {
    const byAward = new Map<string, AwardStudent[]>();
    for (const row of awardStudentsForSummary) {
      const awardKey = row.awardName;
      const arr = byAward.get(awardKey) ?? [];
      arr.push(row);
      byAward.set(awardKey, arr);
    }
    return [...byAward.entries()]
      .map(([awardKey, rows]) => ({
        awardKey,
        awardLabel: formatAwardLabel(awardKey),
        count: rows.length,
        rows: [...rows],
      }))
      ;
  }, [awardStudentsForSummary]);

  const exportSummaryToExcel = () => {
    if (aggregatedAwards.length === 0) {
      setErr('目前沒有可匯出的彙整資料。');
      return;
    }
    const detailRows = submissionsByClass
      .flatMap((submission) =>
        (submission.students ?? []).flatMap((stu) => {
          const awards = Array.isArray(stu.awards) && stu.awards.length > 0 ? stu.awards : [''];
          return awards.map((key) => ({
            活動: selectedCampaign?.title || '',
            班級: stu.className || submission.className || '',
            座號: stu.seat ?? '',
            姓名: stu.name ?? '',
            獎項分類細項: key ? formatAwardLabel(key) : '未勾選獎項',
            提報時間: submission.submittedAt || '',
            送出者: submission.submittedByEmail || '',
            鎖定: submission.locked ? '是' : '否',
          }));
        })
      );
    const summaryRows = aggregatedAwards.flatMap((g) =>
      g.rows.map((r, idx) => ({
        獎項分類細項: g.awardLabel,
        人數: idx === 0 ? g.count : '',
        班級: r.className,
        座號: r.seat ?? '',
        姓名: r.name,
      }))
    );
    const wsDetail = XLSX.utils.json_to_sheet(detailRows);
    const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsDetail, '彙整清冊');
    XLSX.utils.book_append_sheet(wb, wsSummary, '獎項彙整');
    const fileName = `${selectedCampaign?.title || 'exam-submissions'}_彙整.xlsx`;
    XLSX.writeFile(wb, fileName);
    setMsg(`已匯出 Excel：${fileName}`);
    setErr(null);
  };

  const pushToAwards = () => {
    if (awardStudentsForSummary.length === 0) {
      setErr('目前沒有可帶入頒獎通知的資料。');
      return;
    }
    const payload = {
      title: selectedCampaign?.title ? `${selectedCampaign.title} 段考頒獎` : '段考頒獎',
      students: awardStudentsForSummary.map((r) => ({
        className: r.className,
        name: r.name,
        awardName: formatAwardLabel(r.awardName),
        seat: r.seat ?? '',
      })),
      source: 'exam-submissions',
      campaignId: selectedCampaignId,
      createdAt: new Date().toISOString(),
    };
    localStorage.setItem(EXAM_TO_AWARDS_DRAFT_KEY, JSON.stringify(payload));
    onNavigateToTab?.('awards');
    setMsg('已帶入頒獎通知（請到「頒獎通知」頁確認後儲存/輸出）。');
    setErr(null);
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
                <span className="font-semibold">獎項分類 / 細項 / 年級</span>：例如「優異／進步」是分類；底下的「國語、數學…」為細項。各細項可設定「僅限特定年級」，導師畫面會依班級代碼之年級只顯示該年級適用的細項。後台可用「預覽」下拉選單檢查。
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
          <h3 className="font-semibold text-slate-800">獎項設定（分類／細項／年級）</h3>
          {isAdmin && (
            <button type="button" onClick={saveAwards} disabled={awardsSaving} className="px-3 py-1.5 rounded text-sm bg-slate-800 text-white hover:bg-slate-900 disabled:opacity-50 inline-flex items-center gap-2">
              <Save size={16} /> {awardsSaving ? '儲存中…' : '儲存'}
            </button>
          )}
        </div>
        {isAdmin && (
          <label className="inline-flex items-start gap-2 text-sm text-slate-700 cursor-pointer select-none">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4"
              checked={awardsConfig.allowPublicSubmitNoLogin === true}
              onChange={(e) =>
                setAwardsConfig((p) => ({
                  ...p,
                  allowPublicSubmitNoLogin: e.target.checked,
                }))
              }
            />
            <span>
              允許未登入直接填寫段考名單
              <span className="block text-xs text-slate-500">
                開啟後，老師可不經 Google 登入與白名單驗證直接填報；送出者將記錄為 public（匿名）。
              </span>
            </span>
          </label>
        )}
        <ExamAwardSettingsEditor awardsConfig={awardsConfig} setAwardsConfig={setAwardsConfig} isAdmin={isAdmin} />
        {!isAdmin && <p className="text-xs text-slate-500">（僅管理者可編輯獎項設定）</p>}
      </div>

      {/* 白名單管理 */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
        <button
          type="button"
          onClick={() => setWhitelistSectionOpen((o) => !o)}
          className="w-full flex flex-wrap items-center justify-between gap-2 text-left rounded-lg -m-1 p-1 hover:bg-slate-50/80 transition-colors"
          aria-expanded={whitelistSectionOpen}
        >
          <span className="flex items-center gap-2 min-w-0">
            {whitelistSectionOpen ? (
              <ChevronDown className="shrink-0 text-slate-500" size={20} aria-hidden />
            ) : (
              <ChevronRight className="shrink-0 text-slate-500" size={20} aria-hidden />
            )}
            <span className="font-semibold text-slate-800">對外填報白名單（導師）</span>
            <span className="text-xs text-slate-500 font-normal">（共 {whitelist.length} 筆，依年級排序）</span>
          </span>
          {whitelistLoading && <span className="text-xs text-slate-500 shrink-0">載入中…</span>}
        </button>
        {whitelistSectionOpen && (
          <>
            {!isAdmin ? (
              <p className="text-xs text-slate-500">（僅管理者可管理白名單）</p>
            ) : (
              <>
            <div className="text-sm font-medium text-slate-700">新增</div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-2 items-end">
              <div className="lg:col-span-2">
                <label className="block text-xs text-slate-500 mb-0.5">Google 帳號（Email）</label>
                <input
                  className="w-full border rounded px-2 py-1.5 text-sm"
                  placeholder="teacher@example.com"
                  value={newWhitelistEmail}
                  onChange={(e) => setNewWhitelistEmail(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-0.5">班級</label>
                <input
                  className="w-full border rounded px-2 py-1.5 text-sm"
                  placeholder="例：301"
                  value={newWhitelistClassName}
                  onChange={(e) => setNewWhitelistClassName(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-0.5">導師姓名</label>
                <input
                  className="w-full border rounded px-2 py-1.5 text-sm"
                  placeholder="例：王小明"
                  value={newWhitelistTeacherName}
                  onChange={(e) => setNewWhitelistTeacherName(e.target.value)}
                />
              </div>
              <div className="lg:col-span-2">
                <label className="block text-xs text-slate-500 mb-0.5">備註（選填）</label>
                <input
                  className="w-full border rounded px-2 py-1.5 text-sm"
                  placeholder="內部註記"
                  value={newWhitelistNote}
                  onChange={(e) => setNewWhitelistNote(e.target.value)}
                />
              </div>
              <div>
                <button type="button" onClick={addWhitelist} className="w-full md:w-auto px-3 py-1.5 rounded text-sm bg-blue-600 text-white hover:bg-blue-700 inline-flex items-center justify-center gap-2">
                  <UserPlus size={16} /> 新增
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void importHomeroomTeachersFromRoster()}
                disabled={homeroomImporting || whitelistLoading}
                className="px-3 py-1.5 rounded text-sm bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 inline-flex items-center gap-2"
              >
                <Users size={16} />
                {homeroomImporting ? '匯入中…' : '從教師名單匯入導師'}
              </button>
              <span className="text-xs text-slate-500">
                依「教師管理」篩選導師；班級取自「任課班級」。有學校信箱者自動寫入白名單；無信箱者帶入姓名與班級，請在下方手填 Email。
              </span>
            </div>
            {importHomeroomFeedback && (
              <div
                role="status"
                className={`rounded-lg border px-3 py-2 text-sm whitespace-pre-wrap ${
                  importHomeroomFeedback.tone === 'info'
                    ? 'bg-sky-50 border-sky-200 text-sky-900'
                    : importHomeroomFeedback.tone === 'success'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : 'bg-red-50 border-red-200 text-red-800'
                }`}
              >
                {importHomeroomFeedback.text}
              </div>
            )}

            {pendingHomeroomRows.length > 0 && (
              <div className="rounded-lg border border-violet-200 bg-violet-50/50 p-3 space-y-3">
                <div className="text-sm font-semibold text-violet-950">
                  手填 Email（教師主檔無學校信箱）：已帶入姓名與班級，請輸入與段考登入一致的 Google 帳號後加入白名單
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border border-violet-100 rounded-lg bg-white">
                    <thead className="bg-violet-100/80">
                      <tr>
                        <th className="px-2 py-2 text-left">導師姓名</th>
                        <th className="px-2 py-2 text-left">班級</th>
                        <th className="px-2 py-2 text-left min-w-[220px]">Email（手填）</th>
                        <th className="px-2 py-2 text-left w-28"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-violet-100">
                      {pendingHomeroomSortedByGrade.map((r) => (
                        <tr key={r.teacherId}>
                          <td className="px-2 py-2 font-medium">{r.teacherName}</td>
                          <td className="px-2 py-2">{r.className || '—'}</td>
                          <td className="px-2 py-2">
                            <input
                              type="email"
                              autoComplete="off"
                              className="w-full border rounded px-2 py-1.5 text-sm font-mono"
                              placeholder="teacher@school.edu.tw"
                              value={pendingHomeroomEmailInputs[r.teacherId] ?? ''}
                              onChange={(e) =>
                                setPendingHomeroomEmailInputs((p) => ({ ...p, [r.teacherId]: e.target.value }))
                              }
                            />
                          </td>
                          <td className="px-2 py-2">
                            <button
                              type="button"
                              onClick={() => void addPendingHomeroomToWhitelist(r)}
                              className="px-2 py-1 rounded text-xs bg-violet-600 text-white hover:bg-violet-700 whitespace-nowrap"
                            >
                              加入白名單
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void addAllPendingHomeroomWithFilledEmails()}
                    className="px-3 py-1.5 rounded text-sm bg-violet-700 text-white hover:bg-violet-800"
                  >
                    批次加入（僅寫入已填 Email 的列）
                  </button>
                  <span className="text-xs text-violet-900/80">未填 Email 的列會略過；失敗列會保留在表中。</span>
                </div>
              </div>
            )}

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
                    <th className="px-3 py-2 text-left">備註</th>
                    <th className="px-3 py-2 text-left">啟用</th>
                    <th className="px-3 py-2 text-left w-36">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {whitelistSortedByGrade.map((u) => (
                    <tr key={u.email}>
                      <td className="px-3 py-2 font-mono text-xs">{u.email}</td>
                      <td className="px-3 py-2">
                        {editWhitelistDraft?.email === u.email ? (
                          <input
                            className="w-full border rounded px-2 py-1 text-xs"
                            value={editWhitelistDraft.className ?? ''}
                            onChange={(e) => setEditWhitelistDraft((d) => (d ? { ...d, className: e.target.value } : null))}
                            placeholder="例：301"
                          />
                        ) : (
                          u.className || '-'
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {editWhitelistDraft?.email === u.email ? (
                          <div className="space-y-1">
                            <input
                              className="w-full border rounded px-2 py-1 text-xs"
                              value={editWhitelistDraft.teacherName ?? ''}
                              onChange={(e) => setEditWhitelistDraft((d) => (d ? { ...d, teacherName: e.target.value } : null))}
                              placeholder="導師姓名"
                            />
                            <input
                              className="w-full border rounded px-2 py-1 text-xs"
                              value={editWhitelistDraft.displayName ?? ''}
                              onChange={(e) => setEditWhitelistDraft((d) => (d ? { ...d, displayName: e.target.value } : null))}
                              placeholder="顯示名稱（選填）"
                            />
                          </div>
                        ) : (
                          u.teacherName || u.displayName || '-'
                        )}
                      </td>
                      <td className="px-3 py-2 text-slate-600 max-w-[220px]">
                        {editWhitelistDraft?.email === u.email ? (
                          <input
                            className="w-full border rounded px-2 py-1 text-xs"
                            value={editWhitelistDraft.note ?? ''}
                            onChange={(e) => setEditWhitelistDraft((d) => (d ? { ...d, note: e.target.value } : null))}
                            placeholder="備註（選填）"
                          />
                        ) : (
                          <span className="block truncate" title={u.note ?? ''}>
                            {u.note || '-'}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {editWhitelistDraft?.email === u.email ? (
                          <label className="inline-flex items-center gap-1 text-xs text-slate-700 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={editWhitelistDraft.enabled}
                              onChange={(e) => setEditWhitelistDraft((d) => (d ? { ...d, enabled: e.target.checked } : null))}
                            />
                            啟用
                          </label>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setWhitelistEnabled(u.email, !u.enabled)}
                            className={`px-2 py-1 rounded text-xs ${u.enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'}`}
                          >
                            {u.enabled ? '啟用' : '停用'}
                          </button>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {editWhitelistDraft?.email === u.email ? (
                            <>
                              <button
                                type="button"
                                onClick={() => void saveWhitelistEdit()}
                                className="px-2 py-1 rounded text-xs bg-amber-700 text-white hover:bg-amber-800 inline-flex items-center gap-1"
                                title="儲存修改"
                              >
                                <Save size={12} /> 儲存
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditWhitelistDraft(null)}
                                className="px-2 py-1 rounded text-xs bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
                                title="取消"
                              >
                                取消
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => startEditWhitelist(u)}
                              className="px-2 py-1 rounded text-xs bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1"
                              title="修改"
                            >
                              <Pencil size={12} /> 修改
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => void removeWhitelist(u.email)}
                            className="px-2 py-1 rounded text-xs bg-white border border-red-200 text-red-700 hover:bg-red-50 inline-flex items-center gap-1"
                            title="刪除"
                          >
                            <Trash2 size={12} /> 刪除
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {whitelistSortedByGrade.length === 0 && (
                    <tr>
                      <td className="px-3 py-3 text-slate-500 text-sm" colSpan={6}>
                        尚無白名單
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
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
                {submissionsByClass.map((s) => {
                  const isExpanded = expandedSubmissionId === s.id;
                  const students = [...(s.students ?? [])];
                  return (
                    <React.Fragment key={s.id}>
                      <tr>
                        <td className="px-3 py-2 font-medium">{s.className}</td>
                        <td className="px-3 py-2 font-mono text-xs">{formatDateTimeInTaipei(s.submittedAt)}</td>
                        <td className="px-3 py-2 font-mono text-xs">{s.submittedByEmail}</td>
                        <td className="px-3 py-2">{s.locked ? '是' : '否'}</td>
                        <td className="px-3 py-2 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setExpandedSubmissionId(isExpanded ? null : s.id)}
                              className="px-2 py-1 rounded text-xs bg-slate-100 text-slate-700 hover:bg-slate-200"
                            >
                              {isExpanded ? '收合名單' : '查看名單'}
                            </button>
                            {isAdmin && s.locked && (
                              <button type="button" onClick={() => unlockOne(s.id)} className="px-2 py-1 rounded text-xs bg-amber-600 text-white hover:bg-amber-700 inline-flex items-center gap-1">
                                <Unlock size={14} /> 解鎖
                              </button>
                            )}
                            {isAdmin && (
                              <button
                                type="button"
                                onClick={() => void deleteOneSubmission(s)}
                                className="px-2 py-1 rounded text-xs bg-white border border-red-200 text-red-700 hover:bg-red-50 inline-flex items-center gap-1"
                              >
                                <Trash2 size={12} /> 刪除
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={5} className="px-3 py-3 bg-slate-50/60">
                            {students.length === 0 ? (
                              <div className="text-xs text-slate-500">此班目前無學生提報明細。</div>
                            ) : (
                              <div className="space-y-1.5">
                                {students.map((stu) => (
                                  <div key={`${stu.className}_${stu.seat}_${stu.name}`} className="text-xs text-slate-700 border border-slate-200 bg-white rounded px-2 py-1.5">
                                    <span className="font-mono mr-2">{stu.seat}號</span>
                                    <span className="font-medium mr-2">{stu.name}</span>
                                    <span className="text-slate-500 mr-2">({stu.className})</span>
                                    <span className="text-slate-600">
                                      {Array.isArray(stu.awards) && stu.awards.length > 0
                                        ? stu.awards.map((k) => formatAwardLabel(k)).join('、')
                                        : '未勾選獎項'}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
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

      {/* 彙整結果 */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold text-slate-800">彙整結果（依獎項）</h3>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={pushToAwards}
              disabled={aggregatedAwards.length === 0}
              className="px-3 py-1.5 rounded text-sm bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50"
            >
              帶入頒獎通知
            </button>
            <button
              type="button"
              onClick={exportSummaryToExcel}
              disabled={aggregatedAwards.length === 0}
              className="px-3 py-1.5 rounded text-sm bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              匯出 Excel
            </button>
          </div>
        </div>
        {aggregatedAwards.length === 0 ? (
          <p className="text-sm text-slate-500">目前無可彙整資料（請先有班級提報且學生有勾選獎項）。</p>
        ) : (
          <div className="space-y-2">
            {aggregatedAwards.map((g) => (
              <details key={g.awardKey} className="border border-slate-200 rounded-lg bg-slate-50/60">
                <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium text-slate-800 flex items-center justify-between">
                  <span>{g.awardLabel}</span>
                  <span className="text-xs text-slate-500">{g.count} 人</span>
                </summary>
                <div className="px-3 pb-3 text-xs text-slate-700 space-y-1">
                  {g.rows.map((r, idx) => (
                    <div key={`${g.awardKey}_${idx}`} className="bg-white border border-slate-200 rounded px-2 py-1">
                      {r.className} {r.seat ? `${r.seat}號` : ''} {r.name}
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ExamSubmissionsTab;

