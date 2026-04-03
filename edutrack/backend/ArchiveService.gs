/**
 * 事項列檔服務 (ArchiveService.gs)
 * 處理事項列檔的 CRUD
 */

function getArchiveTasks() {
  const ss = getDb();
  const sheet = ss.getSheetByName(SHEETS.ARCHIVE);
  if (!sheet) return [];
  
  const data = sheet.getDataRange().getValues();
  const headers = data.shift();
  
  return data.map(row => {
    let obj = {};
    headers.forEach((header, i) => {
      let val = row[i];
      // 處理布林值
      if (header === 'is_printed' || header === 'is_notified') {
        val = (val === true || val === 'TRUE');
      }
      obj[header] = val;
    });
    
    // 轉換為前端需要的格式
    return {
      id: obj.id,
      title: obj.title,
      month: obj.month,
      isPrinted: obj.is_printed,
      isNotified: obj.is_notified,
      notes: obj.notes,
      updatedAt: obj.updated_at
    };
  });
}

function saveArchiveTask(payload) {
  const ss = getDb();
  const sheet = ss.getSheetByName(SHEETS.ARCHIVE);
  if (!sheet) throw new Error("Archive sheet not found");
  
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const idIndex = headers.indexOf('id');
  
  const now = new Date().toISOString();
  const rowData = [
    payload.id || Utilities.getUuid(),
    payload.title,
    payload.month,
    payload.isPrinted,
    payload.isNotified,
    payload.notes || '',
    now
  ];
  
  let rowIndex = -1;
  if (payload.id) {
    for (let i = 1; i < data.length; i++) {
      if (data[i][idIndex] == payload.id) {
        rowIndex = i + 1;
        break;
      }
    }
  }
  
  if (rowIndex > 0) {
    sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
  } else {
    sheet.appendRow(rowData);
  }
  
  return { success: true, id: rowData[0] };
}

function deleteArchiveTask(payload) {
  const ss = getDb();
  const sheet = ss.getSheetByName(SHEETS.ARCHIVE);
  if (!sheet) throw new Error("Archive sheet not found");
  
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const idIndex = headers.indexOf('id');
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][idIndex] == payload.id) {
      sheet.deleteRow(i + 1);
      return { success: true };
    }
  }
  
  return { success: false, message: "Task not found" };
}
