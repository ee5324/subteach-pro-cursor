/**
 * 設定檔 (Config.gs)
 * 包含試算表ID與工作表名稱設定
 */

// 自動取得當前綁定的試算表 ID
// 如果此腳本是 "容器綁定 (Container-bound)" 於試算表中，這會自動運作
// 如果是獨立腳本，則會使用後方的備用字串 (請填入您的 ID)
const SPREADSHEET_ID = SpreadsheetApp.getActiveSpreadsheet() 
  ? SpreadsheetApp.getActiveSpreadsheet().getId() 
  : '1sUlcMjOWy4ZS_4yI7It6cnsj3hU60PLDYdhQvWMPPl4';

// Google Drive 根目錄 ID (存放點名單檔案)
// 用戶指定的資料夾: https://drive.google.com/drive/folders/14y8SRY_pffwRsVE66-25F_vuli7rqsB_
const ROOT_FOLDER_ID = '14y8SRY_pffwRsVE66-25F_vuli7rqsB_';

// 範本工作表名稱 (位於主試算表中)
const TEMPLATE_SHEET_NAME = 'Template';

// 工作表名稱定義
const SHEETS = {
  COURSES: 'Courses_Config',      // 儲存課程設定 (表頭資訊)
  STUDENTS: 'Students_Data',      // 儲存學生名單 (關聯資料)
  LOGS: 'System_Logs',            // 系統紀錄 (預留擴充)
  AWARDS: 'Awards_Data',          // 頒獎紀錄
  VENDORS: 'Vendors_Data',        // 新增：廠商資料
  ARCHIVE: 'Archive_Data'         // 新增：事項列檔
};

// 回傳標準 JSON 格式的 Helper Function
function createRes(data, success = true, message = '') {
  return ContentService.createTextOutput(JSON.stringify({
    success: success,
    message: message,
    data: data
  })).setMimeType(ContentService.MimeType.JSON);
}