/**
 * 考卷存檔：僅白名單內 Google 帳號可上傳、刪除、分享；支援資料夾分類
 * 資料存 Firestore（edutrack_exam_papers / edutrack_exam_paper_folders），檔案經 GAS 上傳至 Google Drive
 */
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { FileText, Upload, Trash2, Share2, Loader2, ShieldCheck, Check, Folder, FolderPlus, Pencil, ClipboardCheck, ExternalLink } from 'lucide-react';
import type { ExamPaper, ExamPaperFolder, ExamPaperCheck } from '../types';
import {
  getExamPapers,
  getExamPaperFolders,
  saveExamPaper,
  saveExamPaperFolder,
  deleteExamPaper,
  deleteExamPaperFolder,
  uploadAttachment,
  getExamPaperChecks,
  setExamPaperCheck,
} from '../services/api';
import type { User } from 'firebase/auth';

const EXAM_TYPE_OPTIONS = ['期中考', '期末考', '平時考', '複習考', '其他'];
const GRADE_OPTIONS = ['1', '2', '3', '4', '5', '6'] as const;
/** 一、二年級考科 */
const DOMAINS_GRADE_12 = ['國語', '數學'];
/** 三～六年級考科 */
const DOMAINS_GRADE_36 = ['國語', '數學', '自然', '社會'];
/** 檢核表表頭（固定四欄，1-2 年級僅前兩欄有效） */
const CHECKLIST_DOMAINS = ['國語', '數學', '自然', '社會'];

const getDomainsForGrade = (grade: string): string[] =>
  grade === '1' || grade === '2' ? DOMAINS_GRADE_12 : DOMAINS_GRADE_36;

const FOLDER_ALL = 'all';
const FOLDER_NONE = 'none';

interface ExamPapersTabProps {
  user: User | null;
}

const ExamPapersTab: React.FC<ExamPapersTabProps> = ({ user }) => {
  const [list, setList] = useState<ExamPaper[]>([]);
  const [folders, setFolders] = useState<ExamPaperFolder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string>(FOLDER_ALL);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderParentId, setNewFolderParentId] = useState('');
  const [newFolderDriveUrl, setNewFolderDriveUrl] = useState('');
  const [addingFolder, setAddingFolder] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState('');
  const [savingFolderName, setSavingFolderName] = useState(false);
  const [uploadGrade, setUploadGrade] = useState<string>('');
  const [uploadDomain, setUploadDomain] = useState<string>('');
  const [uploadSchoolYear, setUploadSchoolYear] = useState('');
  const [uploadSemester, setUploadSemester] = useState('');
  const [uploadAuthorName, setUploadAuthorName] = useState('');
  const [uploadAuthorNote, setUploadAuthorNote] = useState('');
  const [checks, setChecks] = useState<ExamPaperCheck[]>([]);
  const [editingPaperId, setEditingPaperId] = useState<string | null>(null);
  const [editingAuthorName, setEditingAuthorName] = useState('');
  const [editingAuthorNote, setEditingAuthorNote] = useState('');
  const [editingSchoolYear, setEditingSchoolYear] = useState('');
  const [editingSemester, setEditingSemester] = useState('');
  const [savingAuthor, setSavingAuthor] = useState(false);
  const [filterSchoolYear, setFilterSchoolYear] = useState('');
  const [filterSemester, setFilterSemester] = useState('');
  const [updatingCheck, setUpdatingCheck] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadFolders = async () => {
    try {
      const data = await getExamPaperFolders();
      setFolders(data);
    } catch (e: any) {
      setMessage({ type: 'error', text: e?.message || '無法載入資料夾' });
    }
  };

  const loadList = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const [papers, folderList, checkList] = await Promise.all([
        getExamPapers(),
        getExamPaperFolders(),
        getExamPaperChecks(),
      ]);
      setList(papers);
      setFolders(folderList);
      setChecks(checkList);
    } catch (e: any) {
      const msg = e?.message || '';
      const isPermissionError = /permission|Permission/i.test(msg);
      const text = isPermissionError
        ? '權限不足：請確認 Firestore 規則已部署（含 edutrack_exam_papers），且您的帳號在白名單且已啟用。'
        : msg || '無法載入考卷列表';
      setMessage({ type: 'error', text });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadList();
  }, []);

  useEffect(() => {
    if (uploadGrade && uploadDomain && !getDomainsForGrade(uploadGrade).includes(uploadDomain)) {
      setUploadDomain('');
    }
  }, [uploadGrade]);

  const gradeOrder = (g: string | undefined) => {
    if (!g) return 99;
    const n = parseInt(g, 10);
    return !Number.isNaN(n) && n >= 1 && n <= 6 ? n : 99;
  };

  const rootFolders = folders
    .filter((f) => !f.parentId || f.parentId === '')
    .sort((a, b) => a.order - b.order);
  const childrenByParent = folders.reduce<Record<string, ExamPaperFolder[]>>((acc, f) => {
    const pid = f.parentId ?? '';
    if (!pid) return acc;
    if (!acc[pid]) acc[pid] = [];
    acc[pid].push(f);
    return acc;
  }, {});
  Object.keys(childrenByParent).forEach((pid) => {
    childrenByParent[pid].sort((a, b) => a.order - b.order);
  });

  const filteredList = (() => {
    let base =
      selectedFolderId === FOLDER_ALL
        ? [...list]
        : selectedFolderId === FOLDER_NONE
          ? list.filter((p) => !p.folderId || p.folderId === '')
          : list.filter((p) => p.folderId === selectedFolderId);
    if (filterSchoolYear) base = base.filter((p) => (p.schoolYear ?? '') === filterSchoolYear);
    if (filterSemester) base = base.filter((p) => (p.semester ?? '') === filterSemester);
    return base.sort((a, b) => {
      const ga = gradeOrder(a.grade);
      const gb = gradeOrder(b.grade);
      if (ga !== gb) return ga - gb;
      return (b.uploadedAt || '').localeCompare(a.uploadedAt || '');
    });
  })();

  const uniqueSchoolYears = useMemo(() => Array.from(new Set(list.map((p) => p.schoolYear).filter(Boolean))) as string[], [list]);
  const uniqueSemesters = useMemo(() => Array.from(new Set(list.map((p) => p.semester).filter(Boolean))) as string[], [list]);

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const uploadFolderId = selectedFolderId === FOLDER_ALL || selectedFolderId === FOLDER_NONE ? undefined : selectedFolderId;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !user?.email) return;
    if (file.size > 20 * 1024 * 1024) {
      setMessage({ type: 'error', text: '單檔請勿超過 20MB' });
      return;
    }

    setUploading(true);
    setMessage(null);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          resolve(dataUrl.split(',')[1] || '');
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const uploadResult = await uploadAttachment({
        base64Data: base64,
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        prefix: '考卷',
      });
      const fileData = (uploadResult as any)?.file ?? uploadResult;
      if (!fileData?.url) throw new Error('上傳後未取得連結');

      const grade = uploadGrade || undefined;
      const domain = uploadDomain || undefined;
      await saveExamPaper({
        folderId: uploadFolderId ?? null,
        grade,
        domain,
        schoolYear: uploadSchoolYear.trim() || undefined,
        semester: uploadSemester.trim() || undefined,
        authorTeacherName: uploadAuthorName.trim() || undefined,
        authorTeacherNote: uploadAuthorNote.trim() || undefined,
        fileName: fileData.name || file.name,
        fileUrl: fileData.url,
        mimeType: fileData.mimeType || file.type || 'application/octet-stream',
        fileId: fileData.id,
        uploadedBy: user.email,
        uploadedAt: new Date().toISOString(),
        examType: '期中考',
      });
      if (grade && domain) {
        await setExamPaperCheck({ grade, domain, checked: true });
        setChecks((prev) => {
          const rest = prev.filter((c) => !(c.grade === grade && c.domain === domain));
          return [...rest, { grade, domain, checked: true }];
        });
      }
      setMessage({ type: 'success', text: '已存檔，考卷列表已更新' });
      loadList();
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || '上傳或存檔失敗' });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (item: ExamPaper) => {
    if (!confirm(`確定要刪除「${item.fileName}」？此操作無法復原。`)) return;
    try {
      await deleteExamPaper({ id: item.id });
      setMessage({ type: 'success', text: '已刪除' });
      loadList();
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || '刪除失敗' });
    }
  };

  const handleSaveAuthorEdit = async (item: ExamPaper) => {
    setSavingAuthor(true);
    setMessage(null);
    try {
      await saveExamPaper({
        ...item,
        schoolYear: editingSchoolYear.trim() || undefined,
        semester: editingSemester.trim() || undefined,
        authorTeacherName: editingAuthorName.trim() || undefined,
        authorTeacherNote: editingAuthorNote.trim() || undefined,
      });
      setMessage({ type: 'success', text: '已更新出題教師資訊' });
      setEditingPaperId(null);
      loadList();
    } catch (e: any) {
      setMessage({ type: 'error', text: e?.message || '儲存失敗' });
    } finally {
      setSavingAuthor(false);
    }
  };

  const handleShare = async (item: ExamPaper) => {
    try {
      await navigator.clipboard.writeText(item.fileUrl);
      setCopiedId(item.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      setMessage({ type: 'error', text: '無法複製連結' });
    }
  };

  const handleAddFolder = async () => {
    const name = newFolderName.trim();
    if (!name) return;
    setAddingFolder(true);
    setMessage(null);
    try {
      const parentId = newFolderParentId || null;
      const siblings = folders.filter((f) => (f.parentId ?? null) === parentId);
      const maxOrder = siblings.length ? Math.max(...siblings.map((f) => f.order), 0) : 0;
      await saveExamPaperFolder({
        name,
        order: maxOrder + 1,
        parentId,
        driveFolderUrl: newFolderDriveUrl.trim() || null,
      });
      setNewFolderName('');
      setNewFolderDriveUrl('');
      setMessage({ type: 'success', text: '已新增資料夾' });
      loadFolders();
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || '新增資料夾失敗' });
    } finally {
      setAddingFolder(false);
    }
  };

  const handleRenameFolder = async (folder: ExamPaperFolder, newName: string) => {
    const name = newName.trim();
    if (!name || name === folder.name) {
      setEditingFolderId(null);
      return;
    }
    setSavingFolderName(true);
    setMessage(null);
    try {
      await saveExamPaperFolder({ id: folder.id, name, order: folder.order });
      setMessage({ type: 'success', text: '已重新命名' });
      setEditingFolderId(null);
      loadFolders();
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || '重新命名失敗' });
    } finally {
      setSavingFolderName(false);
    }
  };

  const handleMoveToFolder = async (item: ExamPaper, targetFolderId: string) => {
    const newFolderId = targetFolderId === FOLDER_NONE ? null : targetFolderId;
    if (item.folderId === newFolderId || (item.folderId == null && newFolderId == null)) return;
    setMovingId(item.id);
    setMessage(null);
    try {
      await saveExamPaper({ ...item, folderId: newFolderId });
      setMessage({ type: 'success', text: '已移動至資料夾' });
      loadList();
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || '移動失敗' });
    } finally {
      setMovingId(null);
    }
  };

  const isCheckChecked = (grade: string, domain: string) =>
    checks.some((c) => c.grade === grade && c.domain === domain && c.checked);

  const handleCheckToggle = async (grade: string, domain: string) => {
    const key = `${grade}-${domain}`;
    setUpdatingCheck(key);
    const next = !isCheckChecked(grade, domain);
    try {
      await setExamPaperCheck({ grade, domain, checked: next });
      setChecks((prev) => {
        const rest = prev.filter((c) => !(c.grade === grade && c.domain === domain));
        return [...rest, { grade, domain, checked: next }];
      });
    } catch (e: any) {
      setMessage({ type: 'error', text: e?.message || '更新檢核失敗' });
    } finally {
      setUpdatingCheck(null);
    }
  };

  const handleDeleteFolder = async (folder: ExamPaperFolder) => {
    const inFolder = list.filter((p) => p.folderId === folder.id);
    const msg =
      inFolder.length > 0
        ? `確定要刪除資料夾「${folder.name}」？此資料夾內 ${inFolder.length} 份考卷將改為「未分類」。`
        : `確定要刪除資料夾「${folder.name}」？`;
    if (!confirm(msg)) return;
    try {
      for (const p of inFolder) {
        await saveExamPaper({ ...p, folderId: null });
      }
      await deleteExamPaperFolder({ id: folder.id });
      setMessage({ type: 'success', text: '已刪除資料夾' });
      if (selectedFolderId === folder.id) setSelectedFolderId(FOLDER_ALL);
      loadList();
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || '刪除資料夾失敗' });
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-100 text-violet-700 text-sm font-medium">
                <ShieldCheck size={16} />
                僅白名單帳號可存取
              </span>
              <a
                href="#exam-papers-folders"
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById('exam-papers-folders')?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-sm font-medium hover:bg-slate-200"
              >
                <Folder size={14} />
                資料夾
              </a>
            </div>
            <h2 className="mt-3 text-2xl font-bold text-slate-900">考卷存檔</h2>
            <p className="mt-1 text-slate-600 text-sm">
              上傳、刪除與分享皆需通過 Google 登入且在白名單內；檔案存於 Google Drive，可依資料夾分類。
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-sm text-slate-600">年級</label>
              <select
                value={uploadGrade}
                onChange={(e) => setUploadGrade(e.target.value)}
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
              >
                <option value="">—</option>
                {GRADE_OPTIONS.map((g) => (
                  <option key={g} value={g}>{['一','二','三','四','五','六'][parseInt(g, 10) - 1]}年級</option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-sm text-slate-600">領域</label>
              <select
                value={uploadDomain}
                onChange={(e) => setUploadDomain(e.target.value)}
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white min-w-[5rem]"
              >
                <option value="">—</option>
                {(uploadGrade ? getDomainsForGrade(uploadGrade) : CHECKLIST_DOMAINS).map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-sm text-slate-600">學年</label>
              <input
                type="text"
                value={uploadSchoolYear}
                onChange={(e) => setUploadSchoolYear(e.target.value)}
                placeholder="選填，如 114"
                className="w-16 px-3 py-2 border border-slate-200 rounded-lg text-sm"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-sm text-slate-600">學期</label>
              <select
                value={uploadSemester}
                onChange={(e) => setUploadSemester(e.target.value)}
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white min-w-[5rem]"
              >
                <option value="">— 選填 —</option>
                <option value="上學期">上學期</option>
                <option value="下學期">下學期</option>
              </select>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-sm text-slate-600">出題教師</label>
              <input
                type="text"
                value={uploadAuthorName}
                onChange={(e) => setUploadAuthorName(e.target.value)}
                placeholder="姓名"
                className="w-24 px-3 py-2 border border-slate-200 rounded-lg text-sm"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-sm text-slate-600">出題備註</label>
              <input
                type="text"
                value={uploadAuthorNote}
                onChange={(e) => setUploadAuthorNote(e.target.value)}
                placeholder="選填"
                className="min-w-[8rem] flex-1 max-w-xs px-3 py-2 border border-slate-200 rounded-lg text-sm"
              />
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.odt,image/*"
              className="hidden"
              onChange={handleFileChange}
            />
            <button
              type="button"
              onClick={handleUploadClick}
              disabled={uploading}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-800 text-white rounded-lg hover:bg-slate-900 disabled:opacity-50"
            >
              {uploading ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
              {uploading ? '上傳中…' : '上傳考卷'}
            </button>
          </div>
        </div>

        {message && (
          <div
            className={`mt-4 px-4 py-3 rounded-lg text-sm ${
              message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
            }`}
          >
            {message.text}
          </div>
        )}
      </section>

      {/* 檢核區塊：年級 × 領域，上傳後自動打勾、可手動編輯 */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-2">
          <ClipboardCheck size={18} className="text-slate-600" />
          <span className="font-semibold text-slate-900">檢核區塊</span>
          <span className="text-xs text-slate-500">上傳時選年級與領域即會打勾，也可直接點選格子在這裡勾選／取消</span>
        </div>
        <div className="p-4 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="text-left p-2 border-b border-slate-200 text-slate-600 font-medium">年級</th>
                {CHECKLIST_DOMAINS.map((d) => (
                  <th key={d} className="p-2 border-b border-slate-200 text-slate-600 font-medium text-center min-w-[2.5rem]">
                    {d}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {GRADE_OPTIONS.map((g) => {
                const domainsForGrade = getDomainsForGrade(g);
                return (
                  <tr key={g}>
                    <td className="p-2 border-b border-slate-100 text-slate-700">
                      {['一','二','三','四','五','六'][parseInt(g, 10) - 1]}年級
                    </td>
                    {CHECKLIST_DOMAINS.map((domain) => {
                      const key = `${g}-${domain}`;
                      const enabled = domainsForGrade.includes(domain);
                      const checked = isCheckChecked(g, domain);
                      const busy = updatingCheck === key;
                      return (
                        <td key={domain} className="p-1 border-b border-slate-100 text-center">
                          {enabled ? (
                            <button
                              type="button"
                              onClick={() => handleCheckToggle(g, domain)}
                              disabled={busy}
                              className={`inline-flex h-8 w-8 items-center justify-center rounded border-2 transition-colors ${
                                checked
                                  ? 'border-green-500 bg-green-50 text-green-700'
                                  : 'border-slate-200 bg-slate-50 text-slate-400 hover:border-slate-300'
                              } ${busy ? 'opacity-60' : ''}`}
                              title={`${['一','二','三','四','五','六'][parseInt(g, 10) - 1]}年級 ${domain}`}
                            >
                              {busy ? <Loader2 size={14} className="animate-spin" /> : checked ? <Check size={16} /> : null}
                            </button>
                          ) : (
                            <span className="inline-flex h-8 w-8 items-center justify-center text-slate-300">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="flex flex-col md:flex-row gap-6">
        {/* 資料夾列：固定高度、列表可捲動，「新增資料夾」區塊固定於底部避免被遮蔽 */}
        <aside id="exam-papers-folders" className="w-full md:w-56 shrink-0 flex flex-col bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden scroll-mt-4 max-h-[70vh] md:max-h-[75vh]">
          <div className="px-4 py-3 border-b border-slate-200 shrink-0">
            <div className="flex items-center gap-2">
              <Folder size={18} className="text-slate-600" />
              <span className="font-semibold text-slate-900">資料夾</span>
            </div>
            <p className="mt-1 text-xs text-slate-500">拖曳考卷至此可變更所屬資料夾；可設上層彙整、直連 Google Drive</p>
          </div>
          <nav className="flex flex-col flex-1 min-h-0 p-2">
            <div className="flex-1 min-h-0 overflow-y-auto space-y-0.5">
            <button
              type="button"
              onClick={() => setSelectedFolderId(FOLDER_ALL)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm ${
                selectedFolderId === FOLDER_ALL ? 'bg-slate-100 text-slate-900 font-medium' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <FileText size={16} />
              全部
            </button>
            <div
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDropTargetId(FOLDER_NONE); }}
              onDragLeave={() => setDropTargetId(null)}
              onDrop={(e) => {
                e.preventDefault();
                setDropTargetId(null);
                setDraggingId(null);
                try {
                  const raw = e.dataTransfer.getData('application/x-edutrack-exampaper');
                  if (!raw) return;
                  const item = JSON.parse(raw) as ExamPaper;
                  handleMoveToFolder(item, FOLDER_NONE);
                } catch (_) {}
              }}
              className={dropTargetId === FOLDER_NONE ? 'rounded-lg ring-2 ring-violet-400 ring-inset bg-violet-50' : ''}
            >
              <button
                type="button"
                onClick={() => setSelectedFolderId(FOLDER_NONE)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm ${
                  selectedFolderId === FOLDER_NONE ? 'bg-slate-100 text-slate-900 font-medium' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Folder size={16} />
                未分類
              </button>
            </div>
            {rootFolders.map((f) => (
              <React.Fragment key={f.id}>
                <div
                  className={`group flex items-center gap-1 ${dropTargetId === f.id ? 'rounded-lg ring-2 ring-violet-400 ring-inset bg-violet-50' : ''}`}
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDropTargetId(f.id); }}
                  onDragLeave={() => setDropTargetId(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDropTargetId(null);
                    setDraggingId(null);
                    try {
                      const raw = e.dataTransfer.getData('application/x-edutrack-exampaper');
                      if (!raw) return;
                      const item = JSON.parse(raw) as ExamPaper;
                      handleMoveToFolder(item, f.id);
                    } catch (_) {}
                  }}
                >
                  {editingFolderId === f.id ? (
                    <div className="flex-1 flex items-center gap-2 px-2 py-1.5">
                      <input
                        type="text"
                        value={editingFolderName}
                        onChange={(e) => setEditingFolderName(e.target.value)}
                        onBlur={() => handleRenameFolder(f, editingFolderName)}
                        className="flex-1 min-w-0 px-2 py-1 border border-slate-200 rounded text-sm"
                        autoFocus
                      />
                      <button type="button" onClick={() => handleRenameFolder(f, editingFolderName)} disabled={savingFolderName || !editingFolderName.trim()} className="shrink-0 px-2 py-1 text-xs rounded bg-slate-200 text-slate-700 hover:bg-slate-300 disabled:opacity-50">{savingFolderName ? '…' : '確定'}</button>
                      <button type="button" onClick={() => { setEditingFolderId(null); setEditingFolderName(''); }} className="shrink-0 px-2 py-1 text-xs rounded text-slate-500 hover:bg-slate-100">取消</button>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => setSelectedFolderId(f.id)}
                        className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm min-w-0 ${
                          selectedFolderId === f.id ? 'bg-slate-100 text-slate-900 font-medium' : 'text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <Folder size={16} className="shrink-0" />
                        <span className="truncate">{f.name}</span>
                        {f.driveFolderUrl && (
                          <a href={f.driveFolderUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="shrink-0 p-0.5 rounded text-blue-600 hover:bg-blue-50" title="開啟 Google Drive"> <ExternalLink size={12} /> </a>
                        )}
                        <span className="ml-auto text-slate-400 text-xs shrink-0">{list.filter((p) => p.folderId === f.id).length}</span>
                      </button>
                      <button type="button" onClick={(e) => { e.stopPropagation(); setEditingFolderId(f.id); setEditingFolderName(f.name); }} className="p-1.5 rounded text-slate-500 hover:text-slate-700 hover:bg-slate-100 shrink-0" title="重新命名"><Pencil size={14} /></button>
                      <button type="button" onClick={(e) => { e.stopPropagation(); handleDeleteFolder(f); }} className="p-1.5 rounded text-slate-500 hover:text-red-600 hover:bg-red-50 shrink-0" title="刪除資料夾"><Trash2 size={14} /></button>
                    </>
                  )}
                </div>
                {(childrenByParent[f.id] ?? []).map((sub) => (
                  <div key={sub.id} className="pl-4">
                    <div
                      className={`group flex items-center gap-1 ${dropTargetId === sub.id ? 'rounded-lg ring-2 ring-violet-400 ring-inset bg-violet-50' : ''}`}
                      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDropTargetId(sub.id); }}
                      onDragLeave={() => setDropTargetId(null)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDropTargetId(null);
                        setDraggingId(null);
                        try {
                          const raw = e.dataTransfer.getData('application/x-edutrack-exampaper');
                          if (!raw) return;
                          const item = JSON.parse(raw) as ExamPaper;
                          handleMoveToFolder(item, sub.id);
                        } catch (_) {}
                      }}
                    >
                      {editingFolderId === sub.id ? (
                        <div className="flex-1 flex items-center gap-2 px-2 py-1.5">
                          <input type="text" value={editingFolderName} onChange={(e) => setEditingFolderName(e.target.value)} onBlur={() => handleRenameFolder(sub, editingFolderName)} className="flex-1 min-w-0 px-2 py-1 border border-slate-200 rounded text-sm" autoFocus />
                          <button type="button" onClick={() => handleRenameFolder(sub, editingFolderName)} disabled={savingFolderName || !editingFolderName.trim()} className="shrink-0 px-2 py-1 text-xs rounded bg-slate-200 text-slate-700"> {savingFolderName ? '…' : '確定'} </button>
                          <button type="button" onClick={() => { setEditingFolderId(null); setEditingFolderName(''); }} className="shrink-0 px-2 py-1 text-xs rounded text-slate-500 hover:bg-slate-100">取消</button>
                        </div>
                      ) : (
                        <>
                          <button type="button" onClick={() => setSelectedFolderId(sub.id)} className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm min-w-0 ${selectedFolderId === sub.id ? 'bg-slate-100 text-slate-900 font-medium' : 'text-slate-600 hover:bg-slate-50'}`}>
                            <Folder size={16} className="shrink-0" />
                            <span className="truncate">{sub.name}</span>
                            {sub.driveFolderUrl && <a href={sub.driveFolderUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="shrink-0 p-0.5 rounded text-blue-600 hover:bg-blue-50" title="開啟 Google Drive"><ExternalLink size={12} /></a>}
                            <span className="ml-auto text-slate-400 text-xs shrink-0">{list.filter((p) => p.folderId === sub.id).length}</span>
                          </button>
                          <button type="button" onClick={(e) => { e.stopPropagation(); setEditingFolderId(sub.id); setEditingFolderName(sub.name); }} className="p-1.5 rounded text-slate-500 hover:text-slate-700 hover:bg-slate-100 shrink-0" title="重新命名"><Pencil size={14} /></button>
                          <button type="button" onClick={(e) => { e.stopPropagation(); handleDeleteFolder(sub); }} className="p-1.5 rounded text-slate-500 hover:text-red-600 hover:bg-red-50 shrink-0" title="刪除資料夾"><Trash2 size={14} /></button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </React.Fragment>
            ))}
            </div>
            {/* 新增資料夾區塊固定於底部，不隨列表捲動而消失 */}
            <div className="pt-2 mt-1 border-t border-slate-200 shrink-0 space-y-2 bg-white">
              <div className="flex gap-2">
                <input type="text" value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} placeholder="新資料夾名稱" className="flex-1 min-w-0 px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                <button type="button" onClick={handleAddFolder} disabled={addingFolder || !newFolderName.trim()} className="shrink-0 p-2 rounded-lg bg-violet-100 text-violet-700 hover:bg-violet-200 disabled:opacity-50" title="新增資料夾">
                  {addingFolder ? <Loader2 size={18} className="animate-spin" /> : <FolderPlus size={18} />}
                </button>
              </div>
              <div className="flex flex-wrap gap-2 items-center text-xs">
                <span className="text-slate-500">所屬上層</span>
                <select value={newFolderParentId} onChange={(e) => setNewFolderParentId(e.target.value)} className="px-2 py-1.5 border border-slate-200 rounded bg-white text-slate-700">
                  <option value="">無（最上層）</option>
                  {rootFolders.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
                <span className="text-slate-500">Drive 連結</span>
                <input type="url" value={newFolderDriveUrl} onChange={(e) => setNewFolderDriveUrl(e.target.value)} placeholder="選填" className="flex-1 min-w-0 px-2 py-1.5 border border-slate-200 rounded text-slate-700" />
              </div>
            </div>
          </nav>
        </aside>

        {/* 考卷列表 */}
        <section className="flex-1 min-w-0 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center gap-3">
            <FileText size={18} className="text-slate-600" />
            <span className="font-semibold text-slate-900">
              {selectedFolderId === FOLDER_ALL ? '已存檔考卷' : selectedFolderId === FOLDER_NONE ? '未分類' : folders.find((f) => f.id === selectedFolderId)?.name ?? '考卷'}
            </span>
            <span className="text-slate-400">|</span>
            <label className="text-xs text-slate-500">學年</label>
            <select value={filterSchoolYear} onChange={(e) => setFilterSchoolYear(e.target.value)} className="px-2 py-1 border border-slate-200 rounded text-sm bg-white">
              <option value="">全部</option>
              {uniqueSchoolYears.sort().map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <label className="text-xs text-slate-500">學期</label>
            <select value={filterSemester} onChange={(e) => setFilterSemester(e.target.value)} className="px-2 py-1 border border-slate-200 rounded text-sm bg-white">
              <option value="">全部</option>
              {uniqueSemesters.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          {loading ? (
            <div className="p-8 flex justify-center">
              <Loader2 size={28} className="animate-spin text-slate-400" />
            </div>
          ) : filteredList.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-sm">
              {list.length === 0 ? '尚無考卷，請點「上傳考卷」新增。' : '此資料夾尚無考卷。'}
            </div>
          ) : (
            <ul className="divide-y divide-slate-200">
              {filteredList.map((item) => (
                <li
                  key={item.id}
                  draggable
                  onDragStart={(e) => {
                    setDraggingId(item.id);
                    e.dataTransfer.setData('application/x-edutrack-exampaper', JSON.stringify(item));
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragEnd={() => setDraggingId(null)}
                  className={`px-4 py-4 flex flex-wrap items-center gap-3 ${draggingId === item.id ? 'opacity-50' : ''} ${movingId === item.id ? 'opacity-60' : ''} cursor-grab active:cursor-grabbing`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-900 truncate">{item.fileName}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {(item.schoolYear || item.semester) && (
                        <>
                          <span className="text-slate-600">{[item.schoolYear, item.semester].filter(Boolean).join(' ')}</span>
                          {' · '}
                        </>
                      )}
                      {item.grade && (
                        <span className="text-slate-600">{['一','二','三','四','五','六'][parseInt(item.grade, 10) - 1] || item.grade}年級</span>
                      )}
                      {item.grade && item.domain && ' · '}
                      {item.domain && <span className="text-slate-600">{item.domain}</span>}
                      {(item.grade || item.domain) && ' · '}
                      {item.uploadedBy} · {item.uploadedAt ? new Date(item.uploadedAt).toLocaleString('zh-TW') : ''}
                      {item.examType && ` · ${item.examType}`}
                    </p>
                    {(item.authorTeacherName || item.authorTeacherNote || item.schoolYear || item.semester || editingPaperId === item.id) && (
                      <div className="mt-1.5 text-xs text-slate-600">
                        {editingPaperId === item.id ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <input type="text" value={editingSchoolYear} onChange={(e) => setEditingSchoolYear(e.target.value)} placeholder="學年" className="w-14 px-2 py-1 border border-slate-200 rounded text-sm" />
                            <select value={editingSemester} onChange={(e) => setEditingSemester(e.target.value)} className="px-2 py-1 border border-slate-200 rounded text-sm bg-white">
                              <option value="">學期</option>
                              <option value="上學期">上學期</option>
                              <option value="下學期">下學期</option>
                            </select>
                            <input type="text" value={editingAuthorName} onChange={(e) => setEditingAuthorName(e.target.value)} placeholder="出題教師姓名" className="w-28 px-2 py-1 border border-slate-200 rounded text-sm" />
                            <input type="text" value={editingAuthorNote} onChange={(e) => setEditingAuthorNote(e.target.value)} placeholder="出題備註" className="min-w-[10rem] flex-1 px-2 py-1 border border-slate-200 rounded text-sm" />
                            <button type="button" onClick={() => handleSaveAuthorEdit(item)} disabled={savingAuthor} className="px-2 py-1 rounded bg-slate-200 text-slate-700 text-xs disabled:opacity-50">儲存</button>
                            <button type="button" onClick={() => { setEditingPaperId(null); }} className="px-2 py-1 rounded text-slate-500 text-xs hover:bg-slate-100">取消</button>
                          </div>
                        ) : (
                          <>
                            {(item.schoolYear || item.semester) && <span>學年學期：{[item.schoolYear, item.semester].filter(Boolean).join(' ')}</span>}
                            {(item.schoolYear || item.semester) && (item.authorTeacherName || item.authorTeacherNote) && ' · '}
                            {item.authorTeacherName && <span>出題教師：{item.authorTeacherName}</span>}
                            {item.authorTeacherName && item.authorTeacherNote && ' · '}
                            {item.authorTeacherNote && <span>備註：{item.authorTeacherNote}</span>}
                            <button type="button" onClick={() => { setEditingPaperId(item.id); setEditingAuthorName(item.authorTeacherName ?? ''); setEditingAuthorNote(item.authorTeacherNote ?? ''); setEditingSchoolYear(item.schoolYear ?? ''); setEditingSemester(item.semester ?? ''); }} className="ml-2 text-blue-600 hover:underline">編輯</button>
                          </>
                        )}
                      </div>
                    )}
                    {!item.authorTeacherName && !item.authorTeacherNote && !item.schoolYear && !item.semester && editingPaperId !== item.id && (
                      <button type="button" onClick={() => { setEditingPaperId(item.id); setEditingAuthorName(''); setEditingAuthorNote(''); setEditingSchoolYear(item.schoolYear ?? ''); setEditingSemester(item.semester ?? ''); }} className="mt-1 text-xs text-slate-500 hover:text-slate-700">＋ 填寫學年學期／出題教師／備註</button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <a
                      href={item.fileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200"
                    >
                      開啟
                    </a>
                    <button
                      type="button"
                      onClick={() => handleShare(item)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100"
                    >
                      {copiedId === item.id ? <Check size={14} /> : <Share2 size={14} />}
                      {copiedId === item.id ? '已複製' : '複製連結'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(item)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-red-50 text-red-700 hover:bg-red-100"
                    >
                      <Trash2 size={14} />
                      刪除
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
};

export default ExamPapersTab;
