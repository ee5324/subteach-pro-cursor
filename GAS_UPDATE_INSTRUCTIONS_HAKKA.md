# Google Apps Script 更新說明 (Hakka)

請將以下程式碼新增或更新至您的 Google Apps Script 專案中，以支援客語薪資領據的產生。

## 1. 更新 `Controller.gs`

請確認 `doPost` 函式中有處理 `GENERATE_HAKKA_RECEIPT` 的邏輯。

```javascript
function doPost(e) {
  // ... (前面的程式碼)

  if (action === 'GENERATE_HAKKA_RECEIPT') {
    return LanguagePayroll.generateHakkaReceipt(data);
  }

  // ... (後面的程式碼)
}
```

## 2. 新增或更新 `LanguagePayroll.gs`

請建立或更新 `LanguagePayroll.gs` 檔案，並貼上以下內容。

**重要：請確保您的 Google Sheet 中有一個名為「客語領據範本」的工作表。**

```javascript
var LanguagePayroll = {
  // ... (其他現有的函式)

  generateHakkaReceipt: function(data) {
    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const templateName = data.templateName || '客語領據範本';
      const templateSheet = ss.getSheetByName(templateName);
      
      if (!templateSheet) {
        // 嘗試搜尋是否有類似名稱的範本 (容錯處理)
        const sheets = ss.getSheets();
        const potentialTemplate = sheets.find(s => s.getName().includes('客語') && s.getName().includes('範本'));
        
        if (potentialTemplate) {
           return this.createHakkaReceiptFromTemplate(ss, potentialTemplate, data);
        }
        
        return ContentService.createTextOutput(JSON.stringify({
          status: 'error',
          message: '找不到名為「' + templateName + '」的工作表，請確認範本名稱是否正確。'
        })).setMimeType(ContentService.MimeType.JSON);
      }

      return this.createHakkaReceiptFromTemplate(ss, templateSheet, data);

    } catch (e) {
      return ContentService.createTextOutput(JSON.stringify({
        status: 'error',
        message: '產生領據失敗: ' + e.toString()
      })).setMimeType(ContentService.MimeType.JSON);
    }
  },

  createHakkaReceiptFromTemplate: function(ss, templateSheet, data) {
      const teacherName = data.teacherName;
      const calculatedData = data.calculatedData; // Array of { month: 'YYYY-MM', sessions: [...] }
      const hourlyRate = data.hourlyRate;
      
      // 產生新工作表名稱: 老師姓名_YYYY-MM(起)_YYYY-MM(迄)
      const startMonth = calculatedData[0].month;
      const endMonth = calculatedData[calculatedData.length - 1].month;
      const sheetName = `${teacherName}_${startMonth}${startMonth !== endMonth ? '_' + endMonth : ''}_客語薪資`;
      
      // 檢查是否已存在同名工作表，若有則刪除舊的
      const oldSheet = ss.getSheetByName(sheetName);
      if (oldSheet) {
        ss.deleteSheet(oldSheet);
      }

      // 複製範本
      const newSheet = templateSheet.copyTo(ss);
      newSheet.setName(sheetName);
      newSheet.activate(); // Optional: make it active

      // --- 填寫資料邏輯 (需依據實際範本欄位調整) ---
      // 假設範本有特定的儲存格用於填寫資料
      // 以下為範例，請根據您的實際範本位置修改
      
      // 填寫基本資料
      // newSheet.getRange('B2').setValue(teacherName); // 範例：B2 為姓名
      // newSheet.getRange('D2').setValue(hourlyRate);  // 範例：D2 為鐘點費

      // 填寫授課明細
      // 這邊需要根據 calculatedData 來填寫
      // calculatedData 結構: [{ month: '2023-10', sessions: [{date: '2023-10-02', periods: ['1', '2'], count: 2}, ...] }, ...]
      
      let currentRow = 5; // 假設從第 5 列開始填寫
      let totalAmount = 0;

      calculatedData.forEach(monthData => {
          monthData.sessions.forEach(session => {
             // newSheet.getRange(currentRow, 1).setValue(session.date); // 日期
             // newSheet.getRange(currentRow, 2).setValue(session.periods.join(', ')); // 節次
             // newSheet.getRange(currentRow, 3).setValue(session.count); // 節數
             // const amount = session.count * hourlyRate;
             // newSheet.getRange(currentRow, 4).setValue(amount); // 金額
             
             // totalAmount += amount;
             // currentRow++;
          });
      });

      // newSheet.getRange('D20').setValue(totalAmount); // 範例：總金額位置

      // --- 結束填寫 ---

      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        message: '已產生領據',
        data: {
          url: ss.getUrl() + '#gid=' + newSheet.getSheetId()
        }
      })).setMimeType(ContentService.MimeType.JSON);
  }
};
```
