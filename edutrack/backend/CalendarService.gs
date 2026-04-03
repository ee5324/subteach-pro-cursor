
/**
 * CalendarService.gs
 * 負責處理行事曆與待辦事項的邏輯
 */

const TODO_SHEET_NAME = 'Todos_Data';

/**
 * 初始化待辦事項工作表
 * 如果欄位不足，自動補齊 (Migration)
 */
function initTodoSheet() {
  const ss = getDb();
  let sheet = ss.getSheetByName(TODO_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(TODO_SHEET_NAME);
    // 欄位: id, date, title, type, status, priority, series_id, contacts, memo, created_at, academic_year, attachments, common_attachments, official_docs, topic, common_contacts, period
    sheet.appendRow([
      'id', 'date', 'title', 'type', 'status', 'priority', 'series_id', 'contacts', 'memo', 'created_at', 'academic_year', 'attachments', 'common_attachments', 'official_docs', 'topic', 'common_contacts', 'period'
    ]);
    sheet.setFrozenRows(1);
  } else {
    // 檢查並補齊新欄位
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    
    // 簡單的補欄位邏輯 (依序檢查)
    if (headers.indexOf('academic_year') === -1) sheet.getRange(1, 11).setValue('academic_year');
    if (headers.indexOf('attachments') === -1) sheet.getRange(1, 12).setValue('attachments');
    if (headers.indexOf('common_attachments') === -1) sheet.getRange(1, 13).setValue('common_attachments');
    if (headers.indexOf('official_docs') === -1) sheet.getRange(1, 14).setValue('official_docs');
    if (headers.indexOf('topic') === -1) sheet.getRange(1, 15).setValue('topic');
    if (headers.indexOf('common_contacts') === -1) sheet.getRange(1, 16).setValue('common_contacts');
    if (headers.indexOf('period') === -1) sheet.getRange(1, 17).setValue('period'); // 新增 shift/period
  }
}

/**
 * 取得指定月份(或是全部)的待辦事項
 */
function getTodos() {
  initTodoSheet();
  const ss = getDb();
  const sheet = ss.getSheetByName(TODO_SHEET_NAME);
  
  if (sheet.getLastRow() <= 1) return []; // Only header

  const data = sheet.getDataRange().getValues();
  const headers = data.shift(); // Remove headers

  return data.map(row => ({
    id: row[0],
    // Fix Timezone: Use Utilities.formatDate to ensure we get the date string as seen in the sheet (Script TimeZone)
    date: row[1] ? (row[1] instanceof Date ? Utilities.formatDate(row[1], Session.getScriptTimeZone(), 'yyyy-MM-dd') : row[1]) : '',
    title: row[2],
    type: row[3],
    status: row[4],
    priority: row[5],
    seriesId: row[6],
    contacts: parseJSONSafe(row[7]), // JSON string
    memo: row[8],
    createdAt: row[9],
    academicYear: row[10] || '114', 
    attachments: parseJSONSafe(row[11]), 
    commonAttachments: parseJSONSafe(row[12]),
    officialDocs: parseJSONSafe(row[13]),
    topic: row[14] || '', // Topic
    commonContacts: parseJSONSafe(row[15]), // Common Contacts
    period: row[16] || 'full' // New: Period/Shift (full, am, pm)
  }));
}

/**
 * Helper to parse JSON safely
 */
function parseJSONSafe(str) {
    try {
        const parsed = typeof str === 'string' && str.trim() !== '' ? JSON.parse(str) : [];
        // Ensure it is an array and filter out nulls
        return Array.isArray(parsed) ? parsed.filter(item => item !== null && item !== undefined) : [];
    } catch (e) {
        return [];
    }
}

/**
 * 儲存或更新待辦事項
 */
function saveTodo(payload) {
  initTodoSheet();
  const ss = getDb();
  const sheet = ss.getSheetByName(TODO_SHEET_NAME);
  
  // Filter out null/undefined AND ensure valid structure (must have url)
  // 這可以防止存入損壞的附件物件
  const contactsJson = JSON.stringify((payload.contacts || []).filter(i => i));
  const commonContactsJson = JSON.stringify((payload.commonContacts || []).filter(i => i));
  const attachmentsJson = JSON.stringify((payload.attachments || []).filter(i => i && i.url)); 
  const commonAttachmentsJson = JSON.stringify((payload.commonAttachments || []).filter(i => i && i.url));
  const officialDocsJson = JSON.stringify((payload.officialDocs || []).filter(i => i));
  
  const seriesId = payload.seriesId || (payload.isSeries ? Utilities.getUuid() : '');
  const academicYear = payload.academicYear || '114';
  const topic = (payload.topic || '').trim(); // 去除前後空白
  const period = payload.period || 'full';

  // 1. 處理當前這筆資料的儲存
  let rowIndex = -1;
  if (payload.id) {
    const ids = sheet.getRange(2, 1, Math.max(sheet.getLastRow() - 1, 1), 1).getValues().flat();
    rowIndex = ids.indexOf(payload.id);
  }

  const rowData = [
    payload.id || Utilities.getUuid(),
    payload.date, // Expecting 'YYYY-MM-DD' string from frontend
    payload.title,
    payload.type,
    payload.status || 'pending',
    payload.priority || 'Medium',
    seriesId,
    contactsJson,
    payload.memo || '',
    payload.createdAt || new Date(),
    academicYear,
    attachmentsJson,
    commonAttachmentsJson,
    officialDocsJson,
    topic,
    commonContactsJson, // Index 15
    period // Index 16
  ];

  if (rowIndex > -1) {
    sheet.getRange(rowIndex + 2, 1, 1, rowData.length).setValues([rowData]);
  } else {
    sheet.appendRow(rowData);
  }

  // 重要：強制刷新，確保資料已寫入，讓後續的 syncSeriesDataByTopic 能讀到最新狀態
  SpreadsheetApp.flush();

  // 2. 如果有設定主題 (Topic)，同步共用資料 (附件 & 聯絡人)
  if (topic) {
     syncSeriesDataByTopic(sheet, topic, academicYear, commonAttachmentsJson, commonContactsJson);
  } else if (seriesId) {
     // Fallback: 如果沒有 topic 但有 seriesId (舊資料)，僅同步附件
     syncSeriesCommonAttachments(sheet, seriesId, academicYear, commonAttachmentsJson);
  }

  return { success: true, message: 'Saved successfully', seriesId: seriesId };
}

/**
 * 批次儲存待辦事項 (用於批次輪值設定)
 */
function saveBatchTodos(payload) {
  initTodoSheet();
  const ss = getDb();
  const sheet = ss.getSheetByName(TODO_SHEET_NAME);
  
  const todos = payload.todos;
  if (!todos || !Array.isArray(todos) || todos.length === 0) {
    return { success: false, message: 'No data to save' };
  }

  const rows = todos.map(todo => {
    return [
      todo.id || Utilities.getUuid(),
      todo.date,
      todo.title || '',
      todo.type || 'duty',
      todo.status || 'pending',
      todo.priority || 'Medium',
      '', // seriesId
      '[]', // contacts
      todo.memo || '',
      new Date(), // createdAt
      todo.academicYear || '114',
      '[]', // attachments
      '[]', // commonAttachments
      '[]', // officialDocs
      '', // topic
      '[]', // commonContacts
      todo.period || 'full'
    ];
  });

  // 批次寫入以提升效能
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);

  return { success: true, message: `Batch saved ${rows.length} items` };
}

/**
 * 同步系列活動的共用附件與聯絡人 (依據 Topic)
 */
function syncSeriesDataByTopic(sheet, topic, academicYear, commonAttachmentsJson, commonContactsJson) {
  const targetTopic = String(topic).trim();
  
  // 關鍵修正：如果 Topic 是空的，絕對不能執行同步，否則會覆蓋所有無主題活動的附件
  if (!targetTopic) return;

  const data = sheet.getDataRange().getValues();
  // Headers row 0. Data starts row 1.
  // Col 10 (idx 10): academicYear
  // Col 12 (idx 12): commonAttachments (target column 13)
  // Col 14 (idx 14): topic
  // Col 15 (idx 15): commonContacts (target column 16)
  
  for (let i = 1; i < data.length; i++) {
    const rowYear = data[i][10] || '114';
    const rowTopic = String(data[i][14] || '').trim(); // 確保轉為字串並去除空白
    
    // 使用較寬鬆的字串比對，確保 "114" == 114
    if (rowTopic === targetTopic && String(rowYear) === String(academicYear)) {
       // 更新附件 (Index 12 -> Col 13) 和 聯絡人 (Index 15 -> Col 16)
       sheet.getRange(i + 1, 13).setValue(commonAttachmentsJson);
       sheet.getRange(i + 1, 16).setValue(commonContactsJson);
    }
  }
}

/**
 * 同步系列活動的共用附件 (舊版: 依據 SeriesId)
 */
function syncSeriesCommonAttachments(sheet, seriesId, academicYear, commonJson) {
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const rowSeriesId = data[i][6];
    const rowYear = data[i][10] || '114';
    if (rowSeriesId === seriesId && String(rowYear) === String(academicYear)) {
       sheet.getRange(i + 1, 13).setValue(commonJson);
    }
  }
}

/**
 * 刪除事項
 */
function deleteTodo(payload) {
  const ss = getDb();
  const sheet = ss.getSheetByName(TODO_SHEET_NAME);
  if (!sheet) return;

  const data = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][0] == payload.id) {
      sheet.deleteRow(i + 1);
      break; 
    }
  }
  return { success: true };
}

/**
 * 取消系列事件 (支援 Topic 或 SeriesId)
 */
function cancelSeries(payload) {
  const ss = getDb();
  const sheet = ss.getSheetByName(TODO_SHEET_NAME);
  if (!sheet) return;

  const { seriesId, topic, pivotDate, academicYear } = payload;
  const pDate = new Date(pivotDate);

  const data = sheet.getDataRange().getValues();
  const targetTopic = topic ? String(topic).trim() : '';

  for (let i = 1; i < data.length; i++) {
    const rowSeriesId = data[i][6];
    const rowYear = data[i][10] || '114';
    const rowTopic = String(data[i][14] || '').trim();
    const rowDateStr = data[i][1];
    
    // 判斷是否為同系列: 有 Topic 對 Topic，沒 Topic 對 SeriesId
    let isMatch = false;
    if (targetTopic && rowTopic === targetTopic) isMatch = true;
    else if (!targetTopic && seriesId && rowSeriesId === seriesId) isMatch = true;

    if (isMatch && (!academicYear || String(rowYear) === String(academicYear))) {
      const rowDate = new Date(rowDateStr);
      if (rowDate >= pDate) {
        sheet.getRange(i + 1, 5).setValue('cancelled'); 
      }
    }
  }
  return { success: true, message: 'Series cancelled' };
}

/**
 * 切換狀態
 */
function toggleTodoStatus(payload) {
  const ss = getDb();
  const sheet = ss.getSheetByName(TODO_SHEET_NAME);
  if (!sheet) return;

  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] == payload.id) {
      sheet.getRange(i + 1, 5).setValue(payload.newStatus);
      break;
    }
  }
  return { success: true };
}

/**
 * 上傳附件至 Google Drive (支援自動更名)
 */
function uploadAttachment(payload) {
    try {
        // 使用 Config.gs 定義的 ROOT_FOLDER_ID
        const rootFolderId = typeof ROOT_FOLDER_ID !== 'undefined' ? ROOT_FOLDER_ID : '14y8SRY_pffwRsVE66-25F_vuli7rqsB_';
        const rootFolder = DriveApp.getFolderById(rootFolderId);
        let folder;
        const folders = rootFolder.getFoldersByName("Attachments");
        if (folders.hasNext()) {
            folder = folders.next();
        } else {
            folder = rootFolder.createFolder("Attachments");
        }

        const data = Utilities.base64Decode(payload.base64Data);
        
        // 自動更名邏輯：如果有提供 prefix (通常是 topic)，則加在檔名前面
        // 例如：[科展] 計畫書.pdf
        const fileName = payload.prefix ? `【${payload.prefix}】${payload.name}` : payload.name;

        const blob = Utilities.newBlob(data, payload.mimeType, fileName);
        const file = folder.createFile(blob);
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

        return {
            success: true,
            file: {
                id: file.getId(),
                name: file.getName(), // 回傳新的檔名供前端顯示
                url: file.getUrl(),
                mimeType: file.getMimeType()
            }
        };
    } catch (e) {
        return { success: false, message: e.toString() };
    }
}
