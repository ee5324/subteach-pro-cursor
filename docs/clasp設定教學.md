# 用 clasp 把本機 .gs 推到 Google Apps Script（逐步設定）

照著下面步驟做，之後改完 `gas/` 裡的程式，只要執行 **`npm run gas:push`** 就會同步到 GAS，不用再手動貼上。

---

## 步驟 1：安裝 clasp

在終端機執行（需要 Node.js）：

```bash
npm install -g @google/clasp
```

若希望只裝在專案裡、用 npm 執行，可以改成：

```bash
cd "/Users/chengjuyang/Downloads/代課管理系統(firebase測試)"
npm install --save-dev @google/clasp
```

裝好後可用下面指令確認：

```bash
npx clasp --version
```

---

## 步驟 2：登入 Google 帳號

在專案目錄執行：

```bash
cd "/Users/chengjuyang/Downloads/代課管理系統(firebase測試)"
npx clasp login
```

- 會開啟瀏覽器，請用**與 GAS 專案相同的 Google 帳號**登入並授權。
- 授權完成後終端機會顯示登入成功。

---

## 步驟 3：取得 GAS 專案的「指令碼 ID」

1. 打開 [Google Apps Script](https://script.google.com)
2. 開啟你的**代課管理系統** GAS 專案（綁定試算表的那個）
3. 左側點 **「專案設定」**（齒輪圖示）
4. 在 **「指令碼 ID」** 那欄，點複製，會得到一長串像：  
   `1a2b3c4d5e6f7g8h9i0j...`

先複製起來，下一步會用到。

---

## 步驟 4：把指令碼 ID 寫進專案

專案裡已經有 `.clasp.json` 範例，你要把裡面的 `你的GAS指令碼ID` 換成剛複製的 ID。

1. 開啟專案根目錄的 **`.clasp.json`**
2. 找到這行：
   ```json
   "scriptId": "你的GAS指令碼ID"
   ```
3. 改成（保留引號，只換中間）：
   ```json
   "scriptId": "1a2b3c4d5e6f7g8h9i0j..."
   ```
   貼上你複製的指令碼 ID 後存檔。

存檔後就完成綁定，之後 push 都會推到這個 GAS 專案。

---

## 步驟 5：第一次推送到 GAS（可選）

若你想先確認「本機 gas 資料夾」和「GAS 專案」是否一致，可以執行：

```bash
npx clasp push
```

- 這會把本機 `gas/` 底下的 `.gs`、`.html` 全部上傳到 GAS 專案。
- **注意**：會覆蓋 GAS 線上現有的檔案內容，所以請確認本機程式是最新、正確的再執行。

若 GAS 專案裡已經有程式、你只是要「之後改完再同步」，也可以先不做這步，直接從步驟 6 開始。

---

## 步驟 6：之後每次改完 .gs 要同步時

在專案目錄執行：

```bash
npm run gas:push
```

或：

```bash
npx clasp push
```

就會把 `gas/` 裡所有檔案推送到 GAS，**不需要再手動複製貼上**。

---

## 步驟 7：一鍵 push + 自動部署（可選）

若希望**同時更新 GAS 程式碼、建立新部署版本、並推到 Git**，請用：

```bash
npm run push
```

這會依序執行：

1. **gas:push** — 把 `gas/` 推到 GAS 專案  
2. **gas:deploy** — 在 GAS 建立新版本（描述為「自動部署」）  
3. **git push** — 推到遠端儲存庫  

**自動部署前置條件：**

- 需先開啟 **Apps Script API**：到 [https://script.google.com/home/usersettings](https://script.google.com/home/usersettings) 啟用「Google Apps Script API」。
- 若希望 Web App 網址**自動跑最新程式**，在 GAS 的 **部署** → **管理部署** → 該 Web App 部署的 **版本** 請選 **「新版本」**（Head），不要固定在某個版本號。

若只更新程式、不建立新版本，可只執行 `npm run gas:push`，再依需要手動在 GAS 裡部署。

---

## 常見問題

**Q：push 後網頁 / Web App 要重新部署嗎？**  
A：若使用 `npm run push`，會自動執行 `gas:deploy` 建立新版本。若你的 Web App 部署版本設為 **「新版本」**，則 push 後程式碼更新即會生效；若部署綁定在固定版本號，需在「管理部署」中改選剛建立的新版本。

**Q：可以只 push 某一個檔案嗎？**  
A：`clasp push` 會推送整個 `gas/`。若要只改單檔，可以 push 後在 GAS 編輯器裡只改那一檔，或接受每次都整包 push。

**Q：GAS 專案裡我手動加過的檔案會不見嗎？**  
A：`clasp push` 會用本機 `gas/` 的檔案**覆蓋** GAS 專案裡「同名」的檔案；本機沒有的檔案，在 GAS 裡可能會被當成「多出來的」而保留（依 clasp 版本而異）。建議以本機 `gas/` 為準，重要檔案都放在 `gas/` 裡。

**Q：忘記指令碼 ID 怎麼辦？**  
A：到 [script.google.com](https://script.google.com) → 開啟該專案 → 專案設定（齒輪）→ 指令碼 ID。

---

## 快速對照

| 要做的事                 | 指令 |
|--------------------------|------|
| 登入 Google              | `npx clasp login` |
| 推送 gas/ 到 GAS         | `npm run gas:push` 或 `npx clasp push` |
| 建立新部署版本           | `npm run gas:deploy` 或 `npx clasp deploy` |
| 推送 + 部署 + Git        | `npm run push` |
| 從 GAS 拉回本機          | `npx clasp pull`（慎用，會覆蓋本機） |

完成以上設定後，.gs 就可以用 push 的方式同步到 GAS，不必手動貼上。
