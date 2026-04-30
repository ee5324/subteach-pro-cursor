import React, { useEffect, useMemo, useState } from 'react';
import {
  addSchoolYearMeeting,
  deleteSchoolYearMeeting,
  getSchoolYearMeetings,
  updateSchoolYearMeeting,
} from '../services/api';
import type { SchoolYearMeetingRecord } from '../types';

type FormState = {
  meetingDate: string;
  academicYear: string;
  title: string;
  notes: string;
};

const emptyForm: FormState = {
  meetingDate: '',
  academicYear: '',
  title: '',
  notes: '',
};

const SchoolYearMeetingsTab: React.FC = () => {
  const [rows, setRows] = useState<SchoolYearMeetingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState<string | null>(null);

  const isEditMode = useMemo(() => Boolean(editingId), [editingId]);

  const loadRows = async () => {
    setLoading(true);
    try {
      const data = await getSchoolYearMeetings();
      setRows(data);
    } catch (e: any) {
      setError(e?.message ?? '讀取學年會議資料失敗');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRows();
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setForm(emptyForm);
  };

  const handleSubmit = async (evt: React.FormEvent) => {
    evt.preventDefault();
    const meetingDate = form.meetingDate.trim();
    const title = form.title.trim();
    if (!meetingDate || !title) {
      setError('請填寫會議日期與標題');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (editingId) {
        await updateSchoolYearMeeting(editingId, {
          meetingDate,
          academicYear: form.academicYear.trim(),
          title,
          notes: form.notes.trim(),
        });
      } else {
        await addSchoolYearMeeting({
          meetingDate,
          academicYear: form.academicYear.trim(),
          title,
          notes: form.notes.trim(),
        });
      }
      resetForm();
      await loadRows();
    } catch (e: any) {
      setError(e?.message ?? '儲存失敗，請稍後再試');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (row: SchoolYearMeetingRecord) => {
    setEditingId(row.id);
    setForm({
      meetingDate: row.meetingDate ?? '',
      academicYear: row.academicYear ?? '',
      title: row.title ?? '',
      notes: row.notes ?? '',
    });
    setError(null);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('確定要刪除這筆學年會議紀錄？')) return;
    setError(null);
    try {
      await deleteSchoolYearMeeting(id);
      if (editingId === id) resetForm();
      await loadRows();
    } catch (e: any) {
      setError(e?.message ?? '刪除失敗，請稍後再試');
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          {isEditMode ? '編輯學年會議' : '新增學年會議'}
        </h2>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="block text-sm">
              <span className="text-gray-700">會議日期 *</span>
              <input
                type="date"
                value={form.meetingDate}
                onChange={(e) => setForm((prev) => ({ ...prev, meetingDate: e.target.value }))}
                className="mt-1 w-full border border-gray-300 rounded px-3 py-2"
                required
              />
            </label>
            <label className="block text-sm">
              <span className="text-gray-700">學年</span>
              <input
                type="text"
                placeholder="例：114"
                value={form.academicYear}
                onChange={(e) => setForm((prev) => ({ ...prev, academicYear: e.target.value }))}
                className="mt-1 w-full border border-gray-300 rounded px-3 py-2"
              />
            </label>
            <label className="block text-sm md:col-span-1">
              <span className="text-gray-700">標題 *</span>
              <input
                type="text"
                placeholder="例：114學年上學期第一次學年會議"
                value={form.title}
                onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                className="mt-1 w-full border border-gray-300 rounded px-3 py-2"
                required
              />
            </label>
          </div>
          <label className="block text-sm">
            <span className="text-gray-700">內容 / 決議</span>
            <textarea
              rows={5}
              value={form.notes}
              onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
              className="mt-1 w-full border border-gray-300 rounded px-3 py-2"
              placeholder="可記錄會議內容、決議、待辦事項..."
            />
          </label>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? '儲存中...' : isEditMode ? '更新資料' : '新增資料'}
            </button>
            {isEditMode && (
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                取消編輯
              </button>
            )}
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </form>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">學年會議紀錄</h3>
        {loading ? (
          <p className="text-sm text-gray-500">讀取中...</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-gray-500">尚無會議紀錄</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-600">
                  <th className="py-2 pr-3">日期</th>
                  <th className="py-2 pr-3">學年</th>
                  <th className="py-2 pr-3">標題</th>
                  <th className="py-2 pr-3">內容摘要</th>
                  <th className="py-2 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-gray-100 align-top">
                    <td className="py-2 pr-3 whitespace-nowrap">{row.meetingDate || '-'}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">{row.academicYear || '-'}</td>
                    <td className="py-2 pr-3">{row.title}</td>
                    <td className="py-2 pr-3 text-gray-600">{(row.notes ?? '').slice(0, 60) || '-'}</td>
                    <td className="py-2 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => startEdit(row)}
                        className="text-blue-600 hover:text-blue-800 mr-3"
                      >
                        編輯
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(row.id)}
                        className="text-red-600 hover:text-red-800"
                      >
                        刪除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default SchoolYearMeetingsTab;
