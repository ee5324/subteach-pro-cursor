# Firebase 部署環境設定（一次性）

要讓 `npm run push` 在變更 `firestore.rules` 時**自動部署到 Firebase**，本機需先完成一次登入。

## 步驟（本機終端機執行）

1. **開啟終端機**（PowerShell 或 CMD），進入專案目錄：
   ```bash
   cd "d:\Users\user\代課系統\subteach-pro-cursor"
   ```

2. **登入 Firebase**（會開啟瀏覽器，請用與 Firebase 專案相同的 Google 帳號授權）：
   ```bash
   npm run firebase:login
   ```
   或：
   ```bash
   npx firebase login
   ```

3. 授權完成後，終端機會顯示登入成功。**之後不用再登入**，憑證會存在本機。

## 之後的用法

- 修改 `firestore.rules` 後執行 **`npm run push`**，腳本會偵測到變更並自動執行 `firebase deploy --only firestore`，把規則推上 Firebase。
- 若只想手動部署 Firestore、不跑 git：執行 **`npm run firebase:deploy`**。

## 專案對應

- 專案 ID：`jcpsacadamicsubteachpro`（已寫在 `.firebaserc`）
- 若有多個 Firebase 專案，可執行 `npx firebase use 專案ID` 切換

完成以上設定後，就可以直接 push Firebase 出去。
