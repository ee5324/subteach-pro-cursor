# Vercel 公開缺額頁面 (#/public) 不更新 — 檢查清單

公開頁 https://subteach-pro-cursor.vercel.app/#/public 的資料來自 **Firebase Firestore**（`publicBoard/vacancies`），與 GAS 脫鉤。若已發佈缺額但頁面沒更新，請依序檢查：

---

## 1. Firebase 授權網域（必做）

Vercel 網域必須加入 Firebase，否則可能無法連線。

1. 開啟 [Firebase Console](https://console.firebase.google.com/) → 專案 **jcpsacadamicsubteachpro**
2. 左側 **Build** → **Authentication** → **Settings**（設定）分頁
3. 捲到 **Authorized domains**（授權的網域）
4. 點 **Add domain**，輸入：**`subteach-pro-cursor.vercel.app`**
5. 儲存

參考：[Adding Vercel to Firebase Authorized Domains](https://www.youtube.com/watch?v=Ltzg8aFkfsY)

---

## 2. 確認「發佈」是寫入 Firebase

- 在**後台**（代課系統）→ **待聘課務清單** → 將要公開的項目設為「公開」→ 點 **發佈公開**
- 目前版本會寫入 **Firestore** `publicBoard/vacancies`（不再寫 GAS）
- 若你上次發佈時還是舊版（寫 GAS），請**再按一次「發佈公開」**，讓資料寫入 Firebase

---

## 3. Vercel 已部署最新程式碼

- 若剛 push 過，Vercel 通常會自動部署
- 到 [Vercel Dashboard](https://vercel.com/dashboard) → 該專案 → **Deployments**，確認最新一次部署成功且是最新 commit
- 必要時手動 **Redeploy** 一次

---

## 4. 瀏覽器除錯

開啟 https://subteach-pro-cursor.vercel.app/#/public → 按 **F12** → **Console**：

- 若出現 **Firebase 未初始化**：代表 Vercel 上環境變數或建置有問題
- 若出現 **Permission denied** 或 **Missing permissions**：檢查 Firestore 規則是否已部署（`firestore.rules` 中 `publicBoard` 為 `allow read: if true`）
- 若沒有錯誤但仍「目前沒有代課缺額」：表示 Firestore 讀得到但 `vacancies` 為空或皆非「開放報名」，請回到步驟 2 再發佈一次

---

完成 **步驟 1** 後，重新整理公開頁，通常就會看到已發佈的缺額。
