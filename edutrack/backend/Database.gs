/**
 * 資料庫層 (Database.gs)
 * 負責所有與 Google Sheets 的直接互動
 */

function getDb() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

/**
 * 初始化工作表 (如果不存在則建立)
 * 這是為了防止手動刪除工作表後導致程式崩潰
 */
function initSheets() {
  const ss = getDb();
  
  // 1. 初始化課程設定表
  let courseSheet = ss.getSheetByName(SHEETS.COURSES);
  if (!courseSheet) {
    courseSheet = ss.insertSheet(SHEETS.COURSES);
    // 欄位: UUID, 學年, 學期, 課程名稱, 教師, 上課時間, 地點, 建立時間, 檔案連結, 開始日期, 結束日期, 選擇星期
    courseSheet.appendRow([
      'id', 'academic_year', 'semester', 'course_name', 'instructor', 
      'class_time', 'location', 'created_at', 'file_url',
      'start_date', 'end_date', 'selected_days'
    ]);
    courseSheet.setFrozenRows(1);
  } else {
    // 簡單的 Migration 檢查：如果欄位數少於 12，補上標題 (防止舊表頭錯誤)
    const lastCol = courseSheet.getLastColumn();
    if (lastCol < 12) {
       const headers = courseSheet.getRange(1, 1, 1, lastCol).getValues()[0];
       // 這裡不做複雜比對，直接假設如果是舊表，就在後面補欄位
       if (lastCol === 9) {
         courseSheet.getRange(1, 10).setValue('start_date');
         courseSheet.getRange(1, 11).setValue('end_date');
         courseSheet.getRange(1, 12).setValue('selected_days');
       }
    }
  }

  // 2. 初始化學生資料表
  let studentSheet = ss.getSheetByName(SHEETS.STUDENTS);
  if (!studentSheet) {
    studentSheet = ss.insertSheet(SHEETS.STUDENTS);
    // 欄位: 課程ID, 學生ID, 節次, 班級, 姓名
    studentSheet.appendRow(['course_id', 'student_id', 'period', 'class_name', 'student_name']);
    studentSheet.setFrozenRows(1);
  }

  // 3. 初始化頒獎紀錄表
  let awardSheet = ss.getSheetByName(SHEETS.AWARDS);
  if (!awardSheet) {
    awardSheet = ss.insertSheet(SHEETS.AWARDS);
    // 欄位: id, 日期, 標題, 內容JSON, 建立時間
    awardSheet.appendRow(['id', 'date', 'title', 'content_json', 'created_at']);
    awardSheet.setFrozenRows(1);
  }

  // 4. 初始化廠商資料表 (新增)
  let vendorSheet = ss.getSheetByName(SHEETS.VENDORS);
  if (!vendorSheet) {
    vendorSheet = ss.insertSheet(SHEETS.VENDORS);
    // 欄位: id, 名稱, 類別, 聯絡人, 電話, email, line_id, 地址, 備註, 關聯業務(JSON)
    vendorSheet.appendRow(['id', 'name', 'category', 'contact_person', 'phone', 'email', 'line_id', 'address', 'note', 'related_tasks']);
    vendorSheet.setFrozenRows(1);
  }

  // 5. 初始化事項列檔表 (新增)
  let archiveSheet = ss.getSheetByName(SHEETS.ARCHIVE);
  if (!archiveSheet) {
    archiveSheet = ss.insertSheet(SHEETS.ARCHIVE);
    // 欄位: id, 標題, 月份, 已列印, 已通知, 備註, 更新時間
    archiveSheet.appendRow(['id', 'title', 'month', 'is_printed', 'is_notified', 'notes', 'updated_at']);
    archiveSheet.setFrozenRows(1);
  }
}

/**
 * 新增一筆資料到指定工作表
 */
function dbInsert(sheetName, rowData) {
  const ss = getDb();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error(`Sheet ${sheetName} not found`);
  sheet.appendRow(rowData);
}

/**
 * 根據欄位值搜尋 (簡單實作)
 * @param {string} sheetName 工作表名稱
 * @param {number} columnIndex 欄位索引 (0-based)
 * @param {any} value 搜尋值
 */
function dbFind(sheetName, columnIndex, value) {
  const ss = getDb();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];
  
  const data = sheet.getDataRange().getValues();
  const headers = data.shift(); // 移除標題
  
  // 簡單過濾
  const rows = data.filter(row => row[columnIndex] == value);
  
  // 轉為物件陣列
  return rows.map(row => {
    let obj = {};
    headers.forEach((header, i) => {
      obj[header] = row[i];
    });
    return obj;
  });
}