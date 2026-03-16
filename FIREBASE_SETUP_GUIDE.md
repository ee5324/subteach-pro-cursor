# Firebase Setup Guide

為了將您的應用程式後端遷移至 Firebase，請按照以下步驟操作：

## 1. 建立 Firebase 專案

1.  前往 [Firebase Console](https://console.firebase.google.com/)。
2.  點擊「新增專案 (Add project)」。
3.  輸入專案名稱（例如：`school-admin-app`），然後點擊「繼續」。
4.  您可以選擇是否啟用 Google Analytics（非必要），然後點擊「建立專案」。

## 2. 啟用 Firestore 資料庫

1.  在左側選單中，點擊「建置 (Build)」>「Firestore Database」。
2.  點擊「建立資料庫 (Create database)」。
3.  選擇資料庫位置（建議選擇 `asia-east1` (台灣) 或 `asia-northeast1` (東京) 以獲得較佳速度）。
4.  在安全規則設定中，選擇「以測試模式啟動 (Start in test mode)」（這允許在開發期間讀寫，之後我們會設定更嚴格的規則）。
5.  點擊「啟用 (Enable)」。

## 3. 啟用 Authentication (身份驗證)

雖然您主要使用文字資料，但為了安全起見，建議啟用基本的身份驗證。

1.  在左側選單中，點擊「建置 (Build)」>「Authentication」。
2.  點擊「開始使用 (Get started)」。
3.  在「登入方式 (Sign-in method)」標籤頁中，選擇「Google」。
4.  點擊「啟用 (Enable)」，設定專案支援電子郵件，然後儲存。
5.  (選用) 您也可以啟用「電子郵件/密碼」登入方式。

## 4. 取得 Firebase 設定檔

1.  點擊左上角的「專案總覽 (Project Overview)」旁的齒輪圖示 >「專案設定 (Project settings)」。
2.  在「一般 (General)」標籤頁下方，找到「您的應用程式 (Your apps)」區塊。
3.  點擊 `</>` 圖示 (Web) 來新增網頁應用程式。
4.  輸入應用程式暱稱（例如：`School Admin Web`），然後點擊「註冊應用程式 (Register app)」。
5.  您會看到一段 `firebaseConfig` 程式碼。請複製其中的內容（`apiKey`, `authDomain`, `projectId` 等）。

## 5. 設定環境變數

在您的專案根目錄中建立一個 `.env` 檔案（如果沒有），並填入以下內容（請將值替換為您剛剛複製的內容）：

```env
VITE_FIREBASE_API_KEY=您的apiKey
VITE_FIREBASE_AUTH_DOMAIN=您的authDomain
VITE_FIREBASE_PROJECT_ID=您的projectId
VITE_FIREBASE_STORAGE_BUCKET=您的storageBucket
VITE_FIREBASE_MESSAGING_SENDER_ID=您的messagingSenderId
VITE_FIREBASE_APP_ID=您的appId
```

## 6. 遷移現有資料

應用程式現在包含一個「遷移資料」的功能。
1.  啟動應用程式。
2.  確認 Firebase 已正確連接（如果沒有錯誤訊息）。
3.  在應用程式中找到「系統設定」或「開發者工具」區域（我們稍後會新增）。
4.  點擊「將本地資料遷移至 Firebase」按鈕。這會讀取您目前的 `localStorage` 資料並寫入 Firestore。

## 7. Google Apps Script (GAS) 調整

由於您將複製 Google Sheet，請記得：
1.  複製 Google Sheet 後，開啟新的 Sheet。
2.  點擊「擴充功能」>「Apps Script」。
3.  部署新的 Web App：
    *   點擊「部署」>「新增部署」。
    *   選擇類型：「網頁應用程式」。
    *   執行身份：「我 (Me)」。
    *   誰可以存取：「任何人 (Anyone)」。
    *   點擊「部署」。
4.  複製新的 **Web App URL**。
5.  在您的 `.env` 檔案中更新 `VITE_GAS_WEB_APP_URL`：

```env
VITE_GAS_WEB_APP_URL=您的新Web_App_URL
```

完成以上步驟後，您的應用程式將會使用 Firebase 作為主要資料庫，並使用 GAS 處理檔案生成任務。

---

## 8. 白名單與第一位管理員

本系統僅允許**白名單內**且已驗證 Email 的帳號登入使用。第一位管理員必須在 Firestore 手動建立：

1.  開啟 [Firebase Console](https://console.firebase.google.com/) → 您的專案 → **Firestore Database**。
2.  若尚無 `subteach_allowed_users` 集合，點擊「**新增集合**」，集合 ID 輸入：`subteach_allowed_users`。
3.  在該集合下點「**新增文件**」：
    - **文件 ID**：管理員的 Email（例如：`y.chengju@gmail.com`）。
    - **欄位**：
      - `email`（字串）：`y.chengju@gmail.com`
      - `enabled`（布林）：`true`
      - `role`（字串）：`admin`
      - （選用）`updatedAt`（數字）：例如 `Date.now()` 的毫秒值
4.  儲存後，該帳號即可登入並在「系統設定」的「白名單管理」中新增／編輯其他使用者。
