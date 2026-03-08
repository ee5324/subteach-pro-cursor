# Google Apps Script 更新指南 (針對新 Google Sheet)

由於您已經建立了新的 Google Sheet 副本，我們需要更新對應的 Apps Script 設定，並重新部署 Web App。

## 步驟 1：開啟 Apps Script 編輯器

1. 開啟您的新 Google Sheet：[連結](https://docs.google.com/spreadsheets/d/1_eCag8m8TRqVlySC5dAtOryDQu-6-bc0dgIJdGr9JTw/edit)
2. 點擊上方選單的 **「擴充功能 (Extensions)」** > **「Apps Script」**。

## 步驟 2：更新 AppConfig.gs

1. 在左側檔案列表中，找到 `AppConfig.gs`。
2. 將內容完全替換為以下程式碼（已包含您的新 Sheet ID）：

```javascript
// 1. AppConfig.gs
// 存放系統全域設定

var CONFIG = {
  // 您的 Google Sheet ID
  SPREADSHEET_ID: '1_eCag8m8TRqVlySC5dAtOryDQu-6-bc0dgIJdGr9JTw', 
  
  // 主要使用的代課單範本名稱 (現在使用派代單)
  TEMPLATE_SHEET_NAME: '派代單範本',
  
  // 為了相容性保留此變數，同樣指向派代單
  DISPATCH_TEMPLATE_SHEET_NAME: '派代單範本',

  // 月份清冊的範本工作表名稱 (印領清冊)
  SUMMARY_TEMPLATE_SHEET_NAME: '導師請假範本',

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
  
  // 指定輸出資料夾 ID (請確認此資料夾 ID 是否正確，或需更換)
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
```

## 步驟 3：部署為 Web App

1. 點擊右上角的 **「部署 (Deploy)」** > **「新增部署 (New deployment)」**。
2. 點擊左上角的齒輪圖示，選擇 **「網頁應用程式 (Web app)」**。
3. 設定如下：
   - **說明 (Description)**: `Update Sheet ID` (或任意名稱)
   - **執行身分 (Execute as)**: `Me` (您的 Google 帳號)
   - **誰可以存取 (Who has access)**: `Anyone` (任何使用者) **<-- 這點非常重要！**
4. 點擊 **「部署 (Deploy)」**。
5. **複製** 顯示的 **Web App URL** (以 `/exec` 結尾的網址)。

## 步驟 4：更新系統設定

1. 回到本系統的 **「系統設定 (Settings)」** 頁面。
2. 在 **「連線設定 (Google Apps Script)」** 區塊中，將剛剛複製的 Web App URL 貼上。
3. 點擊 **「儲存」**。

## 步驟 5：驗證與遷移

1. 在設定頁面下方，點擊 **「從 GAS 載入舊資料」**。
   - 如果成功顯示「載入成功」，代表連線正常。
2. 接著點擊 **「遷移至 Firebase」**。
   - 這會將 Google Sheet 中的資料寫入 Firebase 資料庫。
3. 完成後，您可以嘗試在系統中新增一筆測試代課單，確認資料是否能正常儲存與顯示。
