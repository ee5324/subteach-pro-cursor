# 教學組事務管理系統

## 在 Cursor 中查看程式運作（方便知道哪邊要調整）

1. **啟動開發伺服器**：在 Cursor 終端機執行  
   ```bash
   npm run dev
   ```
2. **用本機瀏覽器開啟**（最穩定）：
   - 本專案預設網址為 **http://localhost:5180**（見 `vite.config.ts` 的 `server.port`）
   - 或執行 **`npm run dev:open`**，會自動用預設瀏覽器開啟
3. 若 Cursor 的 Simple Browser 無法開網址，請一律改用上述本機瀏覽器開啟。

目前預設為 **Sandbox 模式**（`.env` 的 `VITE_SANDBOX=true`），不需 Firebase/GAS 就能完整操作。

---

## 程式對照（畫面 / 功能 → 要改的檔案）

| 畫面／功能 | 前端元件 | 資料／API 層 |
|------------|----------|--------------|
| 左側選單、整體版面 | `components/Layout.tsx` | — |
| 行政行事曆、待辦、**每月固定事項** | `components/TodoCalendar.tsx`、`components/modals/MonthlyRecurringModal.tsx` | `services/api.ts`：getTodos…；**每月固定** `getMonthlyRecurringTodoRules`、`saveMonthlyRecurringTodoRule`、`deleteMonthlyRecurringTodoRule`、`updateMonthlyRecurringMonthStatus`（Firestore `edutrack_monthly_recurring_todos`） |
| 本土語點名單 · 點名單製作 | `AttendanceGenerator.tsx` | api：getHistory, getCourseStudents, saveCourseConfig, importFromSpreadsheet |
| 本土語點名單 · 學生語言選修登錄 | `components/LanguageElectiveRoster.tsx` | api：getLanguageElectiveRoster, getAllLanguageElectiveRosters, saveLanguageElectiveRoster（Firestore `edutrack_language_elective`） |
| 語言選修儀表板 | `components/LanguageElectiveDashboard.tsx` | 各語言年級人數、開班班別、**週課表**（由班別「上課時間」解析週一至週五） |
| 頒獎通知 | `AwardGenerator.tsx` | api：getAwardHistory, saveAwardRecord, getAllKnownStudents, createAwardDocs… |
| 廠商管理 | `VendorManager.tsx` | api：getVendors, saveVendor, deleteVendor |
| 考卷存檔 | `components/ExamPapersTab.tsx` | api：getExamPaperFolders, getExamPapers… |
| 計畫專案 | `components/BudgetPlansTab.tsx`、`components/BudgetPlanLedgerPanel.tsx` | 清單＋單筆專屬頁；**巢狀支用明細**存於 `edutrack_budget_plans/{planId}/ledger_entries`（資料夾／支用列；支用列含**預估金額**、**實支金額**、**支付狀態**：預定／已執行待核銷／核銷完畢；計入「已支出」的實支依狀態篩選）；api 含 `getBudgetPlanLedgerEntries`、`saveBudgetPlanLedgerEntry`、`deleteBudgetPlanLedgerEntry` 等；刪除計畫會清空子集合 |
| **計畫代墊** | `components/BudgetAdvancesTab.tsx` | api：getBudgetPlanAdvances, saveBudgetPlanAdvance, deleteBudgetPlanAdvance（`edutrack_budget_plan_advances`；**budgetPlanId 可空**＝未綁計畫、日後可改掛；**settledDate** 補款／核銷日；刪除計畫僅刪除該計畫底下已綁定之代墊） |
| 事項列檔 | `ArchiveManager.tsx` | api：getArchiveTasks, saveArchiveTask, deleteArchiveTask |
| 系統設定 | `App.tsx`（SettingsTab） | api：setupSystem |

- **統一 API**：`services/api.ts`（Firebase / GAS 呼叫都在這裡，Sandbox 時改走 `services/sandboxStore.ts`）
- **型別**：`types.ts`

---

## 後端架構

- **文字資料**：Firebase Firestore（課程、學生、頒獎、廠商、事項列檔、待辦）
- **附檔與產出檔**：仍使用 Google Drive，經由 Google Apps Script (GAS) Web App 上傳／產生（點名單試算表、頒獎通知 Doc、附件等）

## 與其他系統共用 Firebase（外掛模式）

本系統設計成可與其他系統共用**同一個 Firebase 專案**，不另開新專案、也不影響其他系統：

- 所有 Firestore 集合都帶**前綴**（預設 `edutrack_`），例如：`edutrack_courses`、`edutrack_students`、`edutrack_awards`、`edutrack_vendors`、`edutrack_archive`、`edutrack_todos`、`edutrack_language_elective`、`edutrack_exam_papers`、`edutrack_exam_paper_folders`、`edutrack_exam_paper_checks`、`edutrack_allowed_users`
- 只會讀寫以上集合，不會碰到其他系統的 collections
- 前綴可在 `.env` 用 `VITE_FIREBASE_COLLECTION_PREFIX` 自訂（須與規則一致）

**Firestore 規則**：專案根目錄的 **`firestore.rules`** 已含本系統與其他系統的完整規則。部署時到 Firebase Console → Firestore → 規則，貼上 `firestore.rules` 內容並發布即可。換電腦後 pull 會一併取得最新規則，利於持續調整。

## 環境設定

1. 複製 `.env.example` 為 `.env`
2. 填入你**現有** Firebase 專案的 Web 應用程式設定（與其他系統共用同一專案即可）：
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_STORAGE_BUCKET`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`
3. （選填）`VITE_FIREBASE_COLLECTION_PREFIX` 預設 `edutrack_`；若改前綴，Firestore 規則裡的集合名要一致
4. （選填）若 GAS Web App URL 不同，可設定 `VITE_GAS_API_URL`

## Sandbox 模式（建議先使用以了解程式）

不需設定 Firebase 或 GAS，即可在本地跑完整流程：

1. 複製 `.env.example` 為 `.env`（或建立 `.env` 並設 `VITE_SANDBOX=true`）
2. `npm install` → `npm run dev`
3. 開啟瀏覽器即可操作：課程、頒獎、廠商、事項列檔、行事曆待辦等，資料存於記憶體，附檔／點名單／頒獎 Doc 為模擬連結
4. 重新整理頁面會還原為預設範例資料

正式環境請將 `VITE_SANDBOX` 設為 `false` 或移除，並設定 Firebase 與 GAS。

## 換電腦／協作（pull 後延續設定與紀錄）

在另一台電腦要接續開發或調整時：

1. **Clone 或 pull** 本專案後執行 `npm install`。
2. **環境**：複製 `.env.example` 為 `.env` 並填入 Firebase、GAS 等（`.env` 不提交，每台電腦需自建）。
3. **Firestore 規則**：repo 內的 `firestore.rules` 即為目前使用的規則；若在 Firebase Console 有改過規則，請把 Console 的規則同步回專案並 push，這樣 pull 到別台電腦時規則一致。
4. **資料與紀錄**：課程、學生、頒獎、廠商、事項列檔、待辦、**學生語言選修登錄**、考卷存檔等皆存於 Firebase Firestore，只要登入同一 Firebase 專案即可看到相同資料，無需另外搬移。
5. **GAS 部署**：若使用 clasp 自動 push／部署，請在該電腦依 `backend/README.md` 設定 `backend/.clasp.json`（Script ID 等）；未設定則不影響前端，僅無法從指令列部署 GAS。

如此即可在任一台電腦 pull 後持續調整，並透過 push 讓其他電腦與協作者取得最新程式與規則。

## 執行（正式環境）

1. `npm install`
2. 設定 Firebase 與（選填）GAS 於 `.env`，並關閉 Sandbox（`VITE_SANDBOX=false` 或刪除該行）
3. `npm run dev`
