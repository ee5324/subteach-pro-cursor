# Google Apps Script (GAS) 更新指南

您的判斷是正確的。前端雖然已經新增了「預設超鐘點」的欄位，但後端 (GAS) 的程式碼也需要對應更新，才能將這些資料儲存到 Google Sheets 中。

請依照以下步驟更新您的 GAS 專案：

## 1. 新增試算表欄位

請開啟您的資料庫 Google Sheet，切換到 **`Teachers` (教師資料)** 工作表。
在最後一欄（通常是 `EntryDocuments` 或 `DefaultSchedule` 之後），新增一個欄位標題：

**`DefaultOvertimeSlots`**

## 2. 更新 GAS 程式碼 (`Code.gs` 或 `API.gs`)

請找到處理 `SYNC_DATA` 和 `LOAD_DATA` 的部分，並更新 `saveTeachers` 與 `loadTeachers` 函式。

### 更新 `saveTeachers` 函式

請確保在儲存教師資料時，有將 `defaultOvertimeSlots` 轉為 JSON 字串並寫入對應欄位。

```javascript
function saveTeachers(teachers) {
  const sheet = getSheet('Teachers');
  // 取得標題列以對應欄位索引
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  
  // 準備寫入的資料陣列
  const data = teachers.map(t => {
    const row = [];
    headers.forEach(header => {
      switch (header) {
        case 'ID': row.push(t.id); break;
        case 'Name': row.push(t.name); break;
        case 'Type': row.push(t.type); break;
        // ... 其他現有欄位 ...
        case 'SalaryPoints': row.push(t.salaryPoints || ''); break;
        case 'HasCertificate': row.push(t.hasCertificate); break;
        case 'DefaultSchedule': row.push(JSON.stringify(t.defaultSchedule || [])); break;
        
        // ★★★ 新增這行 ★★★
        case 'DefaultOvertimeSlots': row.push(JSON.stringify(t.defaultOvertimeSlots || [])); break;
        
        case 'EntryDocuments': row.push(JSON.stringify(t.entryDocuments || [])); break;
        // ... 其他欄位 ...
        default: row.push(''); // 未知欄位留空
      }
    });
    return row;
  });

  // 寫入資料 (跳過標題列)
  if (data.length > 0) {
    sheet.getRange(2, 1, data.length, headers.length).setValues(data);
  }
  
  // 清除多餘的舊資料列
  const lastRow = sheet.getLastRow();
  if (lastRow > data.length + 1) {
    sheet.deleteRows(data.length + 2, lastRow - (data.length + 1));
  }
}
```

### 更新 `loadTeachers` 函式

請確保讀取時能正確解析該欄位。

```javascript
function loadTeachers() {
  const sheet = getSheet('Teachers');
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const teachers = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const teacher = {};
    
    headers.forEach((header, index) => {
      const value = row[index];
      switch (header) {
        case 'ID': teacher.id = String(value); break;
        case 'Name': teacher.name = String(value); break;
        // ... 其他現有欄位 ...
        
        case 'DefaultSchedule': 
          try { teacher.defaultSchedule = value ? JSON.parse(value) : []; } catch(e) { teacher.defaultSchedule = []; }
          break;
          
        // ★★★ 新增這行 ★★★
        case 'DefaultOvertimeSlots':
          try { teacher.defaultOvertimeSlots = value ? JSON.parse(value) : []; } catch(e) { teacher.defaultOvertimeSlots = []; }
          break;
          
        case 'EntryDocuments':
          try { teacher.entryDocuments = value ? JSON.parse(value) : []; } catch(e) { teacher.entryDocuments = []; }
          break;
          
        // ... 其他欄位 ...
      }
    });
    teachers.push(teacher);
  }
  return teachers;
}
```

## 3. 重新部署

修改完 GAS 程式碼後，請記得：
1. 點擊「部署」 -> 「管理部署作業」。
2. 點擊「編輯」 (鉛筆圖示)。
3. **版本** 選擇 「新版本」。
4. 點擊「部署」。

這樣前端才能正確讀寫新的超鐘點設定欄位。
