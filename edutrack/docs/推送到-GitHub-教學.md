# 推送到 GitHub 逐步教學

專案目前尚未使用 Git。依照以下步驟即可將「教學組事務管理系統」推送到 GitHub。

---

## 一、確認 .env 不要被提交（機密設定）

專案使用 `.env` 存放 Firebase 等設定，**不應上傳到 GitHub**。

請確認 `.gitignore` 裡有這一行（若沒有請手動加入）：

```
.env
```

本專案的 `.gitignore` 已包含 `node_modules`、`dist`、日誌等，建議補上 `.env`。

---

## 二、在 GitHub 建立新倉庫

1. 登入 [GitHub](https://github.com)。
2. 點右上角 **+** → **New repository**。
3. 填寫：
   - **Repository name**：例如 `edutrack` 或 `teaching-affairs-system`（自訂英文名稱）。
   - **Description**（選填）：例如「教學組事務管理系統」。
   - 選擇 **Public**。
   - **不要**勾選 "Add a README file"（專案已有檔案，本地會推送）。
4. 點 **Create repository**。
5. 建立完成後，記下倉庫網址，例如：
   - HTTPS：`https://github.com/你的帳號/倉庫名稱.git`
   - SSH：`git@github.com:你的帳號/倉庫名稱.git`

---

## 三、在本機專案資料夾執行 Git 指令

在終端機中 **進入專案目錄**（路徑請依你的實際位置調整）：

```bash
cd "/Users/chengjuyang/Downloads/教學組事務管理系統"
```

### 步驟 1：初始化 Git

```bash
git init
```

### 步驟 2：加入所有檔案（.gitignore 會自動排除 node_modules、.env 等）

```bash
git add .
```

### 步驟 3：第一次提交

```bash
git commit -m "Initial commit: 教學組事務管理系統"
```

### 步驟 4：設定主分支名稱（選用，GitHub 預設為 main）

```bash
git branch -M main
```

### 步驟 5：連結到你的 GitHub 倉庫

把下面的 `你的帳號` 和 `倉庫名稱` 換成你在第二步建立的倉庫：

**使用 HTTPS：**

```bash
git remote add origin https://github.com/你的帳號/倉庫名稱.git
```

**使用 SSH（若已設定 SSH key）：**

```bash
git remote add origin git@github.com:你的帳號/倉庫名稱.git
```

### 步驟 6：推送到 GitHub

```bash
git push -u origin main
```

若使用 HTTPS，會提示輸入 GitHub 帳號、密碼（或 Personal Access Token）。  
若使用 SSH，且已設定好 key，通常不需再輸入密碼。

---

## 四、之後要再推送時

修改程式後，只需三行：

```bash
git add .
git commit -m "說明這次改了什麼"
git push
```

---

## 常見問題

| 狀況 | 處理方式 |
|------|----------|
| 提示 `Permission denied` 或 403 | 使用 **Personal Access Token** 當密碼（GitHub → Settings → Developer settings → Personal access tokens），或改用 SSH。 |
| 已存在 `origin` | 先查詢：`git remote -v`；若要改網址：`git remote set-url origin 新網址`。 |
| 推送被拒（例如分支保護） | 確認倉庫權限、分支名稱是否為 `main`，或依 GitHub 提示操作。 |

---

## 快速複製指令（替換後一次執行）

請先到 GitHub 建立倉庫，取得 **你的倉庫網址**，然後在專案目錄執行：

```bash
cd "/Users/chengjuyang/Downloads/教學組事務管理系統"
git init
git add .
git commit -m "Initial commit: 教學組事務管理系統"
git branch -M main
git remote add origin https://github.com/你的帳號/倉庫名稱.git
git push -u origin main
```

將 `https://github.com/你的帳號/倉庫名稱.git` 換成你的實際倉庫網址即可。
