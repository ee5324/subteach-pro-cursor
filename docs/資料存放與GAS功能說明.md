# 資料存放與 GAS 功能說明

## 一、單純文字／資料儲存：Firebase

以下資料**全部存在 Firebase（Firestore）**，不需 GAS 即可正常讀寫：

| 資料類型 | 說明 |
|----------|------|
| 代課紀錄、教師、薪級、學期、假日、固定超鐘點設定等 | 代課清冊、教師管理、設定等頁面之主要資料 |
| 教師請假申請（本系統表單） | 老師從「老師填寫請假單」送出的申請，存在 `teacherLeaveRequests` |
| 公開缺額、公開缺額報名、語文薪資清冊、專案活動等 | 各功能頁面之清單與設定 |
| 系統設定（含 GAS URL） | 存在 Firebase / 本機，依專案設定 |

**結論**：日常新增、編輯、刪除、查詢都在 Firebase 完成，不依賴 GAS。

---

## 二、需 GAS 的功能（匯出報表、檔案產生）

以下功能會**呼叫 Google Apps Script (GAS)** 產生檔案或報表，**必須先設定 GAS Web App URL** 且連線正常才能使用：

| 頁面／功能 | GAS 用途 | 對應 action |
|------------|----------|-------------|
| **代課清冊 (Records)** | 產生報表（清冊/憑證）、單張代課單、批次代課單、同步至試算表、取得輸出資料夾／試算表連結 | `GENERATE_REPORTS`、`GENERATE_FORM`、`BATCH_GENERATE_FORMS`、`SYNC_DATA`、`GET_OUTPUT_FOLDER_URL`、`GET_SPREADSHEET_URL` |
| **超鐘點 (Overtime)** | 產生超鐘點報表 | `GENERATE_OVERTIME_REPORT` |
| **固定超鐘點 (FixedOvertime)** | 產生固定超鐘點報表 | `GENERATE_FIXED_OVERTIME_REPORT` |
| **客語/族語專職薪水 (LanguageSalary)** | 族語專職印領清冊、客語領據 | `GENERATE_INDIGENOUS_RECEIPT`、`GENERATE_HAKKA_RECEIPT` |
| **語言教師 (LanguageTeachers)** | 匯出語文薪資清冊至試算表 | `EXPORT_LANGUAGE_PAYROLL` |
| **專案活動－額外憑證 (ExtraVoucher)** | 產生額外憑證試算表 | `GENERATE_EXTRA_VOUCHER` |
| **教師管理 (TeacherManagement)** | 上傳教師相關檔案至 Drive | `UPLOAD_TEACHER_DOCUMENT` |
| **系統設定－資料遷移** | 從舊版 GAS/試算表載入資料、遷移至 Firebase | `LOAD_DATA` |
| **公開缺額**（若 GAS 有參與） | 同步公開缺額至 GAS 端 | `SYNC_PUBLIC_VACANCIES` |
| **外部請假申請（選用）** | 讀取／歸檔「GAS 表單」送出的請假單（本系統表單不需 GAS） | `GET_TEACHER_REQUESTS`、`ARCHIVE_REQUEST`、`RESTORE_REQUEST` |

**結論**：**匯出報表、代課單、各類報表與檔案產生**都需 GAS；未設定或未連線時，這些按鈕會提示「請先設定 GAS URL」或無法執行。

---

## 三、側欄狀態說明

- **GAS 選用（未設定）**：未填 GAS URL，僅影響上述「需 GAS」功能；日常資料與本系統表單正常。
- **GAS 已連線**：已設定且連線成功，匯出／報表功能可用。
- **GAS 未連線（報表/匯出需 GAS）**：已設定但連線失敗，請檢查 URL、部署權限（Anyone）與網路；不影響 Firebase 資料讀寫。
