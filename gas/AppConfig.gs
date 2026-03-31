
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

  // 課務自理「一日導師費」專用清冊範本（與一般印領清冊分開；工作表名稱須與試算表內一致）
  PERSONAL_HOMEROOM_FEE_TEMPLATE_SHEET_NAME: '課務自理導師費範本',

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

  // 族語專職教師印領清冊範本（以 Spreadsheet ID + 工作表 GID 鎖定，避免抓錯格式）
  INDIGENOUS_RECEIPT_TEMPLATE_SPREADSHEET_ID: '1k0t09n4JZJSuQu8lq3bPlqvRjQZ24Fp4bD494UXlPKE',
  INDIGENOUS_RECEIPT_TEMPLATE_GID: 2030591178,
  INDIGENOUS_RECEIPT_TEMPLATE_SHEET_NAME: '族語專職教師超鐘點費印領清冊',
  
  // 指定輸出資料夾 ID
  OUTPUT_FOLDER_ID: '1mYwmXX9DZSeBbltuaWd2Pkuu_gGo6wyo',

  // LINE 通知 API 共用金鑰（可選；若留空則不驗證，建議正式環境填入長字串）
  LINE_NOTIFY_SHARED_KEY: '',
  // LINE Messaging API Channel access token（建議填 Script Properties: LINE_CHANNEL_ACCESS_TOKEN）
  LINE_CHANNEL_ACCESS_TOKEN: '',
  // LINE 通知目標：一對一 userId（U…）；若改發群組請用 LINE_TARGET_GROUP_ID（C…）
  LINE_TARGET_USER_ID: '',
  // 群組 ID（C…）；若同時設 user 與群組，推播優先用群組（測試／發佈用）
  LINE_TARGET_GROUP_ID: '',
  // 測試模式：true 時所有推播／回覆前加「[測試] 」（Script Properties: LINE_NOTIFY_TEST_MODE = true）
  LINE_NOTIFY_TEST_MODE: false,
  // 除錯：LINE_NOTIFY_DEBUG_WEBHOOK=true、「缺額查id」reply；低調取群組 ID：LINE_NOTIFY_CAPTURE_ON_JOIN / LINE_NOTIFY_SILENT_CAPTURE_FROM_MESSAGE（見 LineNotifyManager）
  
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
