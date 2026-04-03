# Google Apps Script Deployment Guide

## 自動 Push 與部署 (clasp)

本專案可用 **clasp** 從指令列推送程式碼到 Apps Script 並自動部署，無需手動複製貼上。

### 第一次設定

1. **安裝並登入 clasp**（專案已含 `@google/clasp`）  
   ```bash
   npx clasp login
   ```
   瀏覽器會開啟，用與試算表相同的 Google 帳號授權。

2. **取得 Script ID**  
   - 開啟試算表 → **擴充功能** → **Apps Script**  
   - 左側 **專案設定**（齒輪）→ 複製 **指令碼 ID**  
   - 或從網址列取得：`https://script.google.com/home/projects/這裡是SCRIPT_ID/edit`

3. **建立 `backend/.clasp.json`**  
   ```bash
   cp backend/.clasp.json.example backend/.clasp.json
   ```
   編輯 `backend/.clasp.json`，將 `YOUR_SCRIPT_ID_HERE` 改為上面的指令碼 ID。

4. **（選用）取得 Deployment ID（用於一鍵更新既有 Web App）**  
   ```bash
   npm run gs:push
   cd backend && npx clasp deployments
   ```
   複製「Web app」那一行的 Deployment ID（第二欄），之後設為環境變數用於 `gs:release`。

### 指令說明

| 指令 | 說明 |
|------|------|
| `npm run gs:push` | 僅將 `backend/*.gs` 與 `appsscript.json` 推送到 Apps Script，不部署。 |
| `npm run gs:deploy` | Push 後建立**新版本**（Deploy > Test deployments 會看到新版本）。 |
| `npm run gs:release` | Push 後若已設 `CLASP_DEPLOYMENT_ID`，會**更新既有 Web App 部署**為新版本；未設則等同 `gs:deploy`。 |

### 自動更新既有部署（同一個 Web App 網址）

設好 Deployment ID 後，每次執行即會 push 並把該部署指到新版本：

- **Windows (PowerShell)**  
  ```powershell
  $env:CLASP_DEPLOYMENT_ID="你的Deployment_ID"
  npm run gs:release
  ```
- **Mac / Linux**  
  ```bash
  CLASP_DEPLOYMENT_ID=你的Deployment_ID npm run gs:release
  ```

可將 `CLASP_DEPLOYMENT_ID` 寫入 `.env.local`（勿提交），再用 `dotenv-cli` 或同類工具在執行前載入。

---

## 手動 Setup（未使用 clasp 時）

1.  Open your Google Sheet: `1sUlcMjOWy4ZS_4yI7It6cnsj3hU60PLDYdhQvWMPPl4`
2.  Click **Extensions** > **Apps Script**.
3.  Create 4 files in the script editor:
    *   `Config.gs`
    *   `Database.gs`
    *   `Service.gs`
    *   `Main.gs`
4.  Copy and paste the content from the files in this folder into the corresponding files in the script editor.

## Deployment

1.  In the Apps Script editor, click **Deploy** > **New deployment**.
2.  Click the gear icon next to "Select type" and choose **Web app**.
3.  Configure as follows:
    *   **Description**: `v1`
    *   **Execute as**: `Me` (your account)
    *   **Who has access**: `Anyone` (Recommended for simplest frontend integration, or `Anyone with Google account` if you want auth).
4.  Click **Deploy**.
5.  Copy the **Web App URL**. You will use this URL in your frontend React application to send data.

## API Usage

**Endpoint**: `YOUR_WEB_APP_URL`
**Method**: `POST`

**本土語名單紀錄**：課程與學生名單由前端寫入 **Firebase Firestore**，不寫入 Google 試算表。GAS 僅負責建立 Drive 點名單檔案（`CREATE_ATTENDANCE_FILE` 或 `SAVE_CONFIG` 皆只建立檔案、不回寫 GS）。

**Example Payload for Creating Attendance File (records go to Firebase in frontend):**
```json
{
  "action": "CREATE_ATTENDANCE_FILE",
  "payload": {
     "academicYear": "113",
     "semester": "上學期",
     "courseName": "阿美語",
     "instructorName": "王小明",
     "classTime": "週一 09:00",
     "location": "教室A",
     "students": [
       { "id": "1", "period": "1", "className": "101", "name": "張三" }
     ]
  }
}
```
