# 本機 Firebase 環境建置（與另一台電腦相同）

在**這台電腦**要能像另一台一樣「直接 push 規則到 Firebase」，需完成下列一次性設定。

---

## 一、已具備的專案設定（無需改）

- **`.firebaserc`**：專案 ID 已為 `jcpsacadamicsubteachpro`，與另一台一致。
- **`firebase.json`**：Firestore 規則檔為 `firestore.rules`。
- **`package.json`**：已含 `firebase-tools`、指令 `firebase:login`、`firebase:deploy`。
- **`scripts/push-with-gas.cjs`**：執行 `npm run push` 時會偵測 `firestore.rules` / `firebase.json` / `.firebaserc` 變更，並自動執行 `firebase deploy --only firestore`。

---

## 二、這台電腦要做的步驟

### 1. 安裝依賴（若尚未執行）

```bash
cd "/Users/chengjuyang/Downloads/代課管理系統(firebase測試)"
npm install
```

### 2. 登入 Firebase（必做，一次性）

在**本機終端機**執行（會開啟瀏覽器，無法在非互動環境執行）：

```bash
npm run firebase:login
```

或：

```bash
npx firebase login
```

- 使用**與 Firebase 專案相同的 Google 帳號**授權。
- 授權完成後，這台電腦即可執行 `firebase deploy --only firestore`，不需再次登入。

### 3. 環境變數（可選，與另一台一致時建議做）

若另一台有使用 **`.env`**（Firebase 設定或 GAS URL），可讓這台與其一致：

- 從另一台電腦複製 **`.env`** 到本專案根目錄；或  
- 在本機複製範本後手動填寫：
  ```bash
  cp .env.example .env
  ```
  再編輯 `.env`，填入與另一台相同的：
  - `VITE_FIREBASE_API_KEY`、`VITE_FIREBASE_AUTH_DOMAIN`、`VITE_FIREBASE_PROJECT_ID` 等（若需覆寫預設）
  - `VITE_GAS_WEB_APP_URL`（GAS Web App 網址）

**說明**：程式碼內已有專案 `jcpsacadamicsubteachpro` 的預設設定，未設 `.env` 時仍可連線 Firebase；設 `.env` 可與另一台環境完全一致或覆寫 GAS URL。

---

## 三、之後的用法（與另一台相同）

| 要做的事 | 指令 |
|----------|------|
| 只部署 Firestore 規則 | `npm run firebase:deploy` |
| 推送程式碼並依變更自動部署 GAS / Firestore，再 git push | `npm run push` |

修改 `firestore.rules` 後執行 **`npm run push`**，腳本會偵測到變更並自動執行 `firebase deploy --only firestore`，再 commit 並 push 到 Git。

---

## 四、檢查是否建置成功

- 終端機執行 `npx firebase projects:list`，若列出 `jcpsacadamicsubteachpro` 且無登入錯誤，表示登入成功。
- 執行 `npm run firebase:deploy`，若無錯誤即表示這台電腦已可推送規則，與另一台環境一致。
