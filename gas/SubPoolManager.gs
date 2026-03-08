
// gas/SubPoolManager.gs
// 獨立管理代課人力庫的讀取與寫入，不影響主要 SheetManager

var SubPoolManager = {
  
  /**
   * 儲存人力庫資料 (全量覆蓋更新)
   * @param {Array} poolData - 包含 {teacherId, status, note, updatedAt, ...} 的陣列
   */
  saveSubPool: function(poolData) {
    if (!poolData) return;
    
    var ss = getSpreadsheet();
    var sheetName = CONFIG.SUB_POOL_SHEET_NAME || '代課人力庫';
    var sheet = ss.getSheetByName(sheetName);
    
    // 如果工作表不存在，建立之
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
    }
    
    // 清空舊資料
    sheet.clear();
    
    // 設定表頭 (Updated: 8 Columns)
    var headers = ['TeacherID', '狀態 (Available/Busy/Observe)', '備註', '更新時間', '代課時間', '願意代課學年', '專長領域', '不接課時段'];
    sheet.appendRow(headers);
    sheet.getRange("A1:H1").setFontWeight("bold").setBackground("#d9ead3"); // 淺綠色背景
    sheet.setFrozenRows(1);
    sheet.getRange("A:A").setNumberFormat("@"); // ID 強制為文字
    
    if (poolData.length > 0) {
      var rows = poolData.map(function(item) {
        return [
            item.teacherId, 
            item.status, 
            item.note || '', 
            new Date(item.updatedAt).toISOString(),
            item.availableTime || '',
            item.preferredGrades || '',
            item.teachingSubject || '',
            item.unavailableTime || ''
        ];
      });
      
      // 寫入資料
      sheet.getRange(2, 1, rows.length, 8).setValues(rows);
    }
    
    return poolData.length;
  },

  /**
   * 讀取人力庫資料
   * @returns {Array} - SubPoolItem 陣列
   */
  getSubPool: function() {
    var ss = getSpreadsheet();
    var sheetName = CONFIG.SUB_POOL_SHEET_NAME || '代課人力庫';
    var sheet = ss.getSheetByName(sheetName);
    
    if (!sheet) return [];
    
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];
    
    // 讀取資料 (Read 8 columns)
    var lastCol = sheet.getLastColumn();
    var colsToRead = lastCol < 8 ? lastCol : 8; 
    var data = sheet.getRange(2, 1, lastRow - 1, colsToRead).getValues();
    
    return data.map(function(row) {
      return {
        teacherId: String(row[0]),
        status: String(row[1]),
        note: String(row[2]),
        updatedAt: new Date(row[3]).getTime(),
        availableTime: (row[4] ? String(row[4]) : ''),
        preferredGrades: (row[5] ? String(row[5]) : ''),
        teachingSubject: (row[6] ? String(row[6]) : ''),
        unavailableTime: (row[7] ? String(row[7]) : '')
      };
    });
  }
};
