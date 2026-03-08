# 從 Cursor 將專案上傳到 GitHub 逐步教學

## 前置準備

- 已安裝 Git（終端機輸入 `git --version` 可確認）
- 已有 GitHub 帳號

---

## 步驟一：在 Cursor 裡初始化 Git 並做第一次提交

1. **開啟終端機**  
   在 Cursor 按 `` Ctrl+` ``（或 `Cmd+` `）開啟終端機，或選單 **Terminal → New Terminal**。

2. **確認在專案目錄**  
   終端機路徑應在專案根目錄（例如：`代課管理系統(firebase測試)`）。  
   若不在，輸入：
   ```bash
   cd "/Users/chengjuyang/Downloads/代課管理系統(firebase測試)"
   ```

3. **初始化 Git**（若尚未做過）  
   ```bash
   git init
   ```

4. **設定使用者名稱與信箱**（若從未設定過 Git）  
   ```bash
   git config user.name "你的名字或暱稱"
   git config user.email "你的GitHub信箱"
   ```

5. **加入所有檔案並提交**  
   ```bash
   git add .
   git status
   git commit -m "Initial commit: 代課管理系統"
   ```
   - `git status` 可檢查有哪些檔案會被提交（`node_modules`、`dist` 等已由 `.gitignore` 排除）。

---

## 步驟二：在 GitHub 建立新倉庫

1. 登入 [GitHub](https://github.com)。
2. 右上角 **+** → **New repository**。
3. 填寫：
   - **Repository name**：例如 `subteach-pro` 或 `代課管理系統`
   - **Description**（選填）：例如「國小代課/超鐘點管理系統」
   - 選擇 **Public**。
   - **不要**勾選 "Add a README file"（專案已有檔案，避免衝突）。
4. 點 **Create repository**。

---

## 步驟三：在 Cursor 終端機連到 GitHub 並推送

建立好倉庫後，GitHub 會顯示倉庫網址，例如：  
`https://github.com/你的帳號/倉庫名稱.git`

在 Cursor 終端機執行（請把網址換成你的）：

```bash
git remote add origin https://github.com/你的帳號/倉庫名稱.git
git branch -M main
git push -u origin main
```

- 若 GitHub 已改為要求 **SSH**，則用：
  ```bash
  git remote add origin git@github.com:你的帳號/倉庫名稱.git
  git branch -M main
  git push -u origin main
  ```

- **第一次 push 可能跳出登入**：  
  - 用 HTTPS：會要求 GitHub 帳密或 Personal Access Token。  
  - 用 SSH：需先在 GitHub 設定 SSH Key。

---

## 步驟四：之後要更新程式時

在 Cursor 終端機：

```bash
git add .
git status
git commit -m "說明這次改了什麼"
git push
```

---

## 注意事項

- **機密資訊**：若有 `.env` 或含 API 金鑰的檔案，請勿上傳；可加入 `.gitignore`（本專案已有 `.gitignore`，可檢查是否包含 `.env`）。
- **檔名含括號**：路徑中有括號時，請用引號包住路徑，例如：  
  `cd "/Users/chengjuyang/Downloads/代課管理系統(firebase測試)"`。

---

## 快速指令總覽

| 步驟           | 指令 |
|----------------|------|
| 初始化         | `git init` |
| 加入所有檔案   | `git add .` |
| 第一次提交     | `git commit -m "Initial commit"` |
| 連到 GitHub    | `git remote add origin 你的倉庫網址` |
| 推送到 main    | `git push -u origin main` |
| 之後每次更新   | `git add .` → `git commit -m "訊息"` → `git push` |
