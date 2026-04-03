# Google Drive 在本系統的機制說明

本系統的**文字／結構化資料**存在 **Firebase Firestore**，**檔案類資料**則一律經由 **Google Drive** 存放，並透過 **Google Apps Script (GAS)** 代為建立與上傳，前端不直接呼叫 Drive API。

---

## 一、整體分工

| 類型 | 存放位置 | 由誰寫入 |
|------|----------|----------|
| 課程、學生、頒獎、廠商、事項列檔、待辦（文字） | Firebase Firestore | 前端 → Firebase SDK |
| 點名單試算表、頒獎通知 Doc、待辦附檔 | Google Drive | 前端 → GAS Web App → Drive |

也就是說：**Drive 只負責「檔案」**（試算表、Doc、使用者上傳的附檔），**不負責**課程名單、待辦內容等結構化資料。

---

## 二、Drive 根目錄與設定

- 所有 Drive 檔案都放在**同一個根資料夾**底下。
- 根資料夾 ID 在 GAS 的 **`Config.gs`** 裡設定：
  - 變數：`ROOT_FOLDER_ID`
  - 範例：`'14y8SRY_pffwRsVE66-25F_vuli7rqsB_'`（請改成你自己的 Drive 資料夾 ID）
- 前端**不**知道、也不傳這個 ID；一律透過 GAS 的 Web App 網址呼叫，由 GAS 用 `DriveApp.getFolderById(ROOT_FOLDER_ID)` 操作 Drive。

---

## 三、三種會用到 Drive 的情境

### 1. 點名單試算表（本土語點名單製作）

- **流程**：使用者在本系統儲存一筆「課程＋學生」→ 前端先呼叫 GAS 的 **`CREATE_ATTENDANCE_FILE`**（或相容的 `SAVE_CONFIG`）→ GAS 僅在 Drive 建立一份**新試算表**當作點名單；**課程與學生名單只寫入 Firestore，不寫入 Google 試算表**。
- **GAS 實作**：`DriveService.gs` 的 **`createAttendanceFileInDrive`**。
- **Drive 結構**：
  - 根目錄：`ROOT_FOLDER_ID`
  - 底下依「學年／學期」建子資料夾：`{學年}學年` → `第{學期}學期`
  - 在該學期資料夾裡建立試算表，檔名如：`{課程名}_{教師名}_點名單`
- **範本**：點名單格式來自 GAS 綁定試算表裡的 **Template** 工作表（標楷體、欄位等），由 GAS 複製到新試算表再填資料。
- **回傳**：GAS 回傳新試算表的 **URL**，前端再把它存進 Firestore 的課程資料（例如 `fileUrl`），之後列表可點連結開啟該 Drive 檔案。

### 2. 頒獎通知 / 頒獎總表（Google Doc）

- **流程**：使用者在「頒獎通知」頁選好名單並按下產生 → 前端呼叫 GAS 的 **`CREATE_AWARD_DOCS`** 或 **`CREATE_AWARD_SUMMARY_DOCS`** → GAS 用 **DocumentApp** 建立 Google Doc，並把檔案**放進同一個 Drive 根資料夾**。
- **GAS 實作**：`AwardDocService.gs` 的 **`createAwardDocs`**、**`createAwardSummaryDocs`**。
- **Drive 位置**：`DriveApp.getFolderById(ROOT_FOLDER_ID)`，Doc 直接建在根資料夾（或你之後在 GAS 裡改成子資料夾也可）。
- **回傳**：GAS 回傳每個 Doc 的 **URL**，前端顯示連結讓使用者開啟；Doc 內容與筆數**不**寫進 Firestore，只留「有產生過」的結果在畫面上。

### 3. 待辦附檔（行政行事曆的附件）

- **流程**：使用者在行事曆某筆待辦上傳檔案（PDF、圖片等）→ 前端將檔案轉成 **base64**，連同檔名、MIME、選填的 prefix（例如主題）一起送給 GAS 的 **`UPLOAD_ATTACHMENT`** → GAS 在 Drive 建立實體檔案，並設為「知道連結可檢視」。
- **GAS 實作**：`CalendarService.gs` 的 **`uploadAttachment`**。
- **Drive 結構**：
  - 根目錄：同上 `ROOT_FOLDER_ID`
  - 底下若有 **Attachments** 資料夾就用，沒有就建立 **Attachments**
  - 檔案存在 **Attachments** 裡；檔名可加前綴，例如：`【科展】計畫書.pdf`
- **回傳**：GAS 回傳檔案的 **id、name、url、mimeType**；前端把這筆 **url（及 id/name）** 存進 Firestore 該筆待辦的 `attachments`（或共用附檔欄位），之後列表/詳情只顯示連結，不存檔案內容。

---

## 四、前端與 GAS 的對應關係

- 前端**不**直接使用 Drive API，也不帶 Drive 金鑰或資料夾 ID。
- 所有 Drive 操作都透過**同一個 GAS Web App 網址**（例如 `VITE_GAS_API_URL`）以 **POST** 呼叫，body 裡帶 `action` 與 `payload`：
  - `CREATE_ATTENDANCE_FILE` → 建立點名單試算表，回傳 URL
  - `UPLOAD_ATTACHMENT` → 上傳附檔，回傳檔案 url / id / name
  - `CREATE_AWARD_DOCS` / `CREATE_AWARD_SUMMARY_DOCS` → 產生頒獎 Doc，回傳 Doc URL 列表
- 也就是說：**Google Drive 的「實際寫入／建立檔案」全部發生在 GAS 端**，前端只負責：
  - 觸發（按儲存、按產生、選檔案上傳）
  - 把 GAS 回傳的 **url（及必要欄位）** 寫進 **Firebase Firestore**，供日後顯示與權限（Firestore 規則）使用。

---

## 五、小結（一句話對照）

- **點名單**：GAS 依學年/學期在 Drive 建試算表，回傳連結 → 連結存 Firestore 課程。
- **頒獎 Doc**：GAS 在 Drive 根資料夾建 Google Doc，回傳連結 → 僅供當次下載/開啟，不寫入 Firestore。
- **待辦附檔**：GAS 在 Drive 的 Attachments 資料夾建檔案，回傳 url → url 存 Firestore 待辦的 `attachments`。

若你要調整「放在哪一層資料夾」或「檔名規則」，只需改 **GAS**（`DriveService.gs`、`CalendarService.gs`、`AwardDocService.gs`）與 **Config.gs** 的 `ROOT_FOLDER_ID`，前端不必改。
