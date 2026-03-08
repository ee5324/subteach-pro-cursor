
// 7. DriveManager.gs
// 負責 Google Drive 檔案與資料夾管理

var DriveManager = {
  /**
   * 儲存證明文件 (Base64)
   * 自動歸檔至: 根目錄 / 年 / 月 / 檔名
   * @param {string} base64Data 
   * @param {string} mimeType 
   * @param {string} fileName 
   * @param {string} dateString YYYY-MM-DD (用於決定歸檔月份)
   */
  saveProofFile: function(base64Data, mimeType, fileName, dateString) {
    if (!base64Data) return null;

    var rootId = CONFIG.OUTPUT_FOLDER_ID;
    var rootFolder = rootId ? DriveApp.getFolderById(rootId) : DriveApp.getRootFolder();
    
    // 解析日期
    var date = parseDateString(dateString);
    var year = String(date.getFullYear());
    var month = ('0' + (date.getMonth() + 1)).slice(-2);
    
    // 取得或建立年份資料夾
    var yearFolder = getOrCreateSubFolder(rootFolder, year + '年');
    
    // 取得或建立月份資料夾
    var monthFolder = getOrCreateSubFolder(yearFolder, month + '月');
    
    // 處理 Base64 (移除 data:image/jpeg;base64, 前綴)
    var decoded = Utilities.base64Decode(base64Data.split(',')[1] || base64Data);
    var blob = Utilities.newBlob(decoded, mimeType, fileName);
    
    // 存檔
    var file = monthFolder.createFile(blob);
    
    // 設定權限 (視需求，若要讓 React 前端直接檢視可能需要設為 Anyone with link)
    // 這裡保守起見，只回傳 View URL，權限繼承資料夾設定
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    return file.getUrl();
  },

  /**
   * 儲存教師入職資料文件
   * 歸檔至: 根目錄 / 教師檔案 / 檔名
   */
  saveTeacherDocument: function(base64Data, mimeType, fileName) {
    if (!base64Data) return null;

    var rootId = CONFIG.OUTPUT_FOLDER_ID;
    var rootFolder = rootId ? DriveApp.getFolderById(rootId) : DriveApp.getRootFolder();
    
    // 取得或建立「教師檔案」資料夾
    var teacherFolder = getOrCreateSubFolder(rootFolder, '教師檔案');
    
    // 處理 Base64
    var decoded = Utilities.base64Decode(base64Data.split(',')[1] || base64Data);
    var blob = Utilities.newBlob(decoded, mimeType, fileName);
    
    // 存檔
    var file = teacherFolder.createFile(blob);
    
    // 設定權限
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    return file.getUrl();
  }
};
