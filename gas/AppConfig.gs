
// 1. AppConfig.gs
// 存放系統全域設定

var CONFIG = {
  // 您的 Google Sheet ID
  // 請執行 Setup.gs 中的 runQuickSetup()，然後將執行結果中的 ID 貼過來
  SPREADSHEET_ID: '1_eCag8m8TRqVlySC5dAtOryDQu-6-bc0dgIJdGr9JTw', 
  
  // 主要使用的代課單範本名稱 (現在使用派代單)
  TEMPLATE_SHEET_NAME: '派代單範本',
  
  // 為了相容性保留此變數，同樣指向派代單
  DISPATCH_TEMPLATE_SHEET_NAME: '派代單範本',

  // 月份清冊的範本工作表名稱 (印領清冊)
  SUMMARY_TEMPLATE_SHEET_NAME: '導師請假範本',

  // 家長會清冊範本（若存在則使用，否則用導師請假範本）
  PTA_SUMMARY_TEMPLATE_SHEET_NAME: '家長會清冊範本',

  // 黏貼憑證的範本工作表名稱
  VOUCHER_TEMPLATE_SHEET_NAME: '憑證範本',
  
  // 固定兼課清冊範本
  FIXED_OVERTIME_TEMPLATE_NAME: '固定兼課清冊範本',

  // 超鐘點清冊範本 (New)
  OVERTIME_TEMPLATE_NAME: '超鐘點清冊範例',
  
  // 薪級級距表
  SALARY_TABLE_SHEET_NAME: '薪級級距表',

  // 原始資料儲存工作表 (用於系統還原與備份)
  RAW_DATA_SHEET_NAME: '原始紀錄資料庫',
  
  // 超鐘點紀錄 (New - 用於儲存 OvertimeRecords)
  OVERTIME_RECORD_SHEET_NAME: '超鐘點紀錄',
  
  // 公開待聘缺額 (New)
  PUBLIC_VACANCY_SHEET_NAME: '公開待聘缺額',

  // 代課報名紀錄 (New)
  APPLICATIONS_SHEET_NAME: '代課報名紀錄',

  // 專案活動紀錄 (New)
  SPECIAL_ACTIVITY_SHEET_NAME: '專案活動紀錄',

  // 請假申請候審區 (New - Teacher Request)
  REQUEST_SHEET_NAME: '請假申請候審區',
  
  // 年級活動設定 (New - Fixed Overtime Events)
  GRADE_EVENTS_SHEET_NAME: '年級活動設定',

  // 國定假日設定 (New)
  HOLIDAYS_SHEET_NAME: '國定假日設定',
  
  // 代課人力庫 (New)
  SUB_POOL_SHEET_NAME: '代課人力庫',
  
  // 語言教師薪資紀錄 (New)
  LANGUAGE_PAYROLL_SHEET_NAME: '語言教師薪資紀錄',

  // 語言教師設定 (New)
  LANGUAGE_SETTINGS_SHEET_NAME: '語言教師設定',
  
  // 指定輸出資料夾 ID
  OUTPUT_FOLDER_ID: '1mYwmXX9DZSeBbltuaWd2Pkuu_gGo6wyo',
  
  // 表頭定義 (符合印領清冊格式 A-S)
  SHEET_HEADERS: [
    '代課日期', 
    '代課教師', 
    '薪級', 
    '日薪', 
    '代課天數', 
    '代課節數', 
    '代課鐘點費', 
    '請假人', 
    '假別', 
    '請假事由', 
    '備註', 
    '代導師日數', 
    '導師費', 
    '應發金額',
    '勞保',
    '健保',
    '代扣補充保費',
    '實領金額',
    '代課教師簽名'
  ],

  // 全域時段設定 (早自習、午休、第1~7節)
  TIME_SLOTS: {
    '早': '07:55~08:35',
    '1': '08:45~09:25',
    '2': '09:35~10:15',
    '3': '10:30~11:10',
    '4': '11:20~12:00',
    '午': '12:40~13:20',
    '5': '13:30~14:10',
    '6': '14:20~15:00',
    '7': '15:20~16:00'
  },
  
  // 節次排序順序
  PERIOD_ORDER: ['早', '1', '2', '3', '4', '午', '5', '6', '7']
};
