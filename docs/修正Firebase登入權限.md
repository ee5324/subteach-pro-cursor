# 修正 Firebase 登入權限（firebase-tools update check failed）

## 重要：請用專案內的 Firebase CLI

本專案已將 **firebase-tools** 裝在專案裡，請**不要**直接打 `firebase`（會出現 `command not found`），改為：

```bash
npx firebase login
```
或
```bash
npm run firebase:login
```

---

## 若出現「firebase-tools update check failed」

表示 Firebase CLI 無法寫入 `~/.config`（權限不足）。請在本機終端機執行：

### 1. 修正 .config 目錄擁有者

```bash
sudo chown -R $(whoami):$(id -gn) /Users/chengjuyang/.config
```

- 會要求輸入**你這台 Mac 的登入密碼**（輸入時畫面不會顯示字元，輸入完按 Enter 即可）。
- 若出現 "Sorry, try again." 表示密碼錯誤，請再試一次。

### 2. 再次執行 Firebase 登入（用 npx）

```bash
cd "/Users/chengjuyang/Downloads/代課管理系統(firebase測試)"
npx firebase login
```

或：

```bash
npm run firebase:login
```

完成瀏覽器授權後，即可使用 `npm run firebase:deploy` 或 `npm run push` 推送 Firestore 規則。

---

## 一鍵腳本（權限＋登入一次完成）

若希望一次執行「修正權限 + 登入」，請在**本機終端機**執行（會先要求輸入 Mac 密碼，再開瀏覽器授權）：

```bash
cd "/Users/chengjuyang/Downloads/代課管理系統(firebase測試)"
./scripts/fix-firebase-and-login.sh
```

---

## 專案已調整

- `npm run firebase:login` 已改為使用 **npx firebase**（不需全域安裝），並加上略過更新檢查，減少權限錯誤。
- `npm run firebase:deploy` 已改為 **npx firebase deploy**。
