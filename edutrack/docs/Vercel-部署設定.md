# Vercel 部署設定

專案已內建預設 Firebase 專案設定，**部署到 Vercel 不需再設定環境變數**，推上去即可使用登入與 Firestore。

若日後要改用其他 Firebase 專案，才在 Vercel → Settings → Environment Variables 加入 `VITE_FIREBASE_PROJECT_ID` 等變數覆寫。
