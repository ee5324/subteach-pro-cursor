
// 6. Setup.gs
// 快速初始化腳本

function runQuickSetup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    if (CONFIG.SPREADSHEET_ID && CONFIG.SPREADSHEET_ID.length > 10) {
      ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    } else {
      throw new Error("請將此腳本綁定在 Google Sheet 中執行，或在 AppConfig 設定正確的 ID。");
    }
  }

  Logger.log("🚀 開始初始化系統...");

  var root = DriveApp.getRootFolder();
  var folderName = "教學組代課系統_輸出檔案";
  var outputFolderId = "";
  var folders = root.getFoldersByName(folderName);
  if (folders.hasNext()) {
    outputFolderId = folders.next().getId();
    Logger.log("✅ 使用現有資料夾: " + folderName);
  } else {
    var newFolder = root.createFolder(folderName);
    outputFolderId = newFolder.getId();
    Logger.log("✅ 已建立新資料夾: " + folderName);
  }

  setupRawDataSheet(ss);
  setupTeacherSheet(ss);
  setupSummaryTemplate(ss); 
  setupVoucherTemplate(ss); 
  setupDispatchTemplate(ss); 
  
  // 固定兼課 (Fixed Overtime)
  setupFixedOvertimeTemplate(ss);
  
  // 超鐘點 (Overtime) - NEW
  setupOvertimeTemplate(ss);
  
  setupSalaryTableSheet(ss);
  setupPublicVacancySheet(ss);
  setupApplicationSheet(ss);
  setupSpecialActivitySheet(ss);
  setupRequestSheet(ss);
  setupGradeEventsSheet(ss);
  setupHolidaysSheet(ss);
  
  // 新增：系統參數 (取代原本的 FixedOvertimeParamSheet)
  setupSystemParamsSheet(ss);
  
  // 新增：超鐘點紀錄 (Overtime Records)
  setupOvertimeRecordSheet(ss);
  
  // 新增：語言教師薪資清冊 (Language Payrolls)
  setupLanguagePayrollSheet(ss);
  
  // 新增：語言教師設定 (Language Settings - Schedule, Host School, etc.)
  setupLanguageSettingsSheet(ss);
  
  setupSubPoolSheet(ss);

  Logger.log("\n=======================================================");
  Logger.log("🎉 初始化完成！請將以下資訊更新至 gas/AppConfig.gs");
  Logger.log("OUTPUT_FOLDER_ID: '" + outputFolderId + "',");
  Logger.log("=======================================================");
}

function setupRawDataSheet(ss) {
  var sheetName = CONFIG.RAW_DATA_SHEET_NAME || '原始紀錄資料庫';
  var sheet = ss.getSheetByName(sheetName);
  if (sheet) return; // 安全檢查：已存在則跳過
  
  sheet = ss.insertSheet(sheetName);
  var headers = ['ID', '建立時間', '請假教師', '假別', '事由', '公文文號', '申請日期', '開始日期', '結束日期', '代課日期', '節次', '科目', '班級', '代課教師', '支薪方式', '允許分段', '狀態'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight("bold").setBackground("#e0e0e0");
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(1, 100); 
  sheet.setColumnWidth(2, 120); 
  sheet.setColumnWidth(3, 100); 
  sheet.setColumnWidth(5, 150); 
}

function setupTeacherSheet(ss) {
  var sheetName = '教師資料庫';
  var sheet = ss.getSheetByName(sheetName);
  if (sheet) return; // 安全檢查：已存在則跳過
  
  sheet = ss.insertSheet(sheetName);
  var headers = ['教師姓名', '目前薪級', '有無教證', '最高學歷', '類別', '備註', '是否退休', '任課班級', '任教科目', '電話', '職別', '特教教師', '畢業班導師', '行政減授(JSON)', '教師角色', '本俸', '學術研究費', '專長科目', '預設課表', '入職資料(JSON)', '預設超鐘點(JSON)'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight("bold").setBackground("#cfe2f3");
  sheet.getRange("A:A").setNumberFormat("@"); 
  sheet.getRange("J:J").setNumberFormat("@");
}

function setupSalaryTableSheet(ss) {
  var sheetName = CONFIG.SALARY_TABLE_SHEET_NAME || '薪級級距表';
  var sheet = ss.getSheetByName(sheetName);
  if (sheet) return;
  sheet = ss.insertSheet(sheetName);
  var headers = ['俸點', '本俸', '有教證學術研究費 (學士)', '有教證學術研究費 (碩士以上)', '無教證學術研究費 (學士)', '無教證學術研究費 (碩士以上)'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight("bold").setBackground("#d9ead3");
  if (sheet.getLastRow() < 2) {
      var data = [
        [150, 21990, 0, 0, 18464, 18464],
        [190, 25050, 23080, 23080, 18464, 18464],
        [200, 25820, 23080, 23080, 18464, 18464]
      ];
      sheet.getRange(2, 1, data.length, 6).setValues(data);
  }
}

function setupDispatchTemplate(ss) {
  var sheetName = CONFIG.DISPATCH_TEMPLATE_SHEET_NAME || '派代單範本';
  var sheet = ss.getSheetByName(sheetName);
  if (sheet) return;
  sheet = ss.insertSheet(sheetName);
  sheet.getRange("A1").setValue("請在此工作表貼上您的「派代單」格式，系統將依據欄位座標填入資料。");
}

function setupFixedOvertimeTemplate(ss) {
  var sheetName = CONFIG.FIXED_OVERTIME_TEMPLATE_NAME || '固定兼課清冊範本';
  var sheet = ss.getSheetByName(sheetName);
  if (sheet) return; 
  sheet = ss.insertSheet(sheetName);
  sheet.getRange("A1").setValue("請在此工作表設定您的「固定兼課清冊範本」(格式 A-S欄)，系統將從第6列開始填入資料。");
}

function setupOvertimeTemplate(ss) {
  var sheetName = CONFIG.OVERTIME_TEMPLATE_NAME || '超鐘點清冊範例';
  var sheet = ss.getSheetByName(sheetName);
  if (sheet) return; 
  sheet = ss.insertSheet(sheetName);
  sheet.getRange("A1").setValue("請在此工作表設定您的「超鐘點清冊範例」(格式 A-S欄)，系統將從第6列開始填入資料。");
}

function setupSummaryTemplate(ss) {
  var sheetName = CONFIG.SUMMARY_TEMPLATE_SHEET_NAME || '導師請假範本';
  var sheet = ss.getSheetByName(sheetName);
  if (sheet) return;
  sheet = ss.insertSheet(sheetName);
  var headers = CONFIG.SHEET_HEADERS;
  sheet.getRange("A1:N1").merge().setValue("【範本】加昌國小代課教師印領清冊");
  sheet.getRange("2:2").setFontWeight("bold").setHorizontalAlignment("center");
  sheet.getRange(2, 1, 1, headers.length).setValues([headers]);
}

function setupVoucherTemplate(ss) {
  var sheetName = CONFIG.VOUCHER_TEMPLATE_SHEET_NAME || '憑證範本';
  var sheet = ss.getSheetByName(sheetName);
  if (sheet) return;
  sheet = ss.insertSheet(sheetName);
  sheet.getRange("B3:P3").merge().setValue("黏  貼  憑  證  用  紙");
}

function setupPublicVacancySheet(ss) {
  var sheetName = CONFIG.PUBLIC_VACANCY_SHEET_NAME || '公開待聘缺額';
  var sheet = ss.getSheetByName(sheetName);
  if (sheet) return;
  sheet = ss.insertSheet(sheetName);
  var headers = ['唯一編號', '日期', '節次', '原請假教師', '科目', '班級', '事由', '支薪方式', '狀態', '更新時間', '紀錄編號', '允許分段'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight("bold").setBackground("#fff2cc");
  sheet.getRange("A:A").setNumberFormat("@"); 
  sheet.getRange("K:K").setNumberFormat("@"); 
  sheet.setFrozenRows(1);
}

function setupApplicationSheet(ss) {
  var sheetName = CONFIG.APPLICATIONS_SHEET_NAME || '代課報名紀錄';
  var sheet = ss.getSheetByName(sheetName);
  if (sheet) return;
  sheet = ss.insertSheet(sheetName);
  var headers = ['缺額編號', '報名者姓名', '電話', '備註', '報名時間', '狀態', '處理備註'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight("bold").setBackground("#d0e0e3");
  sheet.getRange("A:A").setNumberFormat("@"); 
  sheet.getRange("C:C").setNumberFormat("@"); 
  sheet.setFrozenRows(1);
}

function setupSpecialActivitySheet(ss) {
  var sheetName = CONFIG.SPECIAL_ACTIVITY_SHEET_NAME || '專案活動紀錄';
  var sheet = ss.getSheetByName(sheetName);
  if (sheet) return;
  sheet = ss.insertSheet(sheetName);
  var headers = ['ID', '日期', '活動名稱', '領款教師', '支薪方式', '數量', '金額', '備註'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight("bold").setBackground("#d9d2e9"); 
  sheet.getRange("A:A").setNumberFormat("@"); 
  sheet.setFrozenRows(1);
}

function setupRequestSheet(ss) {
  var sheetName = CONFIG.REQUEST_SHEET_NAME || '請假申請候審區';
  var sheet = ss.getSheetByName(sheetName);
  if (sheet) return;
  sheet = ss.insertSheet(sheetName);
  var headers = ['UUID', '申請時間', '申請人', '假別', '事由', '公文文號', '開始日期', '結束日期', '支薪方式', '預定代課教師', '申請節數詳情', '證明文件', '狀態'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight("bold").setBackground("#fce5cd");
  sheet.setFrozenRows(1);
}

function setupGradeEventsSheet(ss) {
  var sheetName = CONFIG.GRADE_EVENTS_SHEET_NAME || '年級活動設定';
  var sheet = ss.getSheetByName(sheetName);
  if (sheet) return;
  sheet = ss.insertSheet(sheetName);
  var headers = ['ID', '日期', '活動名稱', '受影響年級(JSON)'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight("bold").setBackground("#fce5cd");
  sheet.setFrozenRows(1);
}

function setupHolidaysSheet(ss) {
  var sheetName = CONFIG.HOLIDAYS_SHEET_NAME || '國定假日設定';
  var sheet = ss.getSheetByName(sheetName);
  if (sheet) return;
  sheet = ss.insertSheet(sheetName);
  var headers = ['日期 (YYYY-MM-DD)'];
  sheet.getRange(1, 1).setValue(headers[0]).setFontWeight('bold').setBackground("#f4cccc");
  sheet.setFrozenRows(1);
  sheet.getRange("A:A").setNumberFormat("@");
}

function setupSystemParamsSheet(ss) {
  var sheetName = '系統參數';
  var sheet = ss.getSheetByName(sheetName);
  if (sheet) return; // 安全檢查：已存在則跳過
  
  sheet = ss.insertSheet(sheetName);
  sheet.appendRow(['參數名稱', '參數值']);
  sheet.setFrozenRows(1);
  sheet.getRange("1:1").setFontWeight("bold").setBackground("#eee");
  // 預設值
  sheet.appendRow(['semesterStart', '']);
  sheet.appendRow(['semesterEnd', '']);
}

function setupOvertimeRecordSheet(ss) {
  var sheetName = CONFIG.OVERTIME_RECORD_SHEET_NAME || '超鐘點紀錄';
  var sheet = ss.getSheetByName(sheetName);
  if (sheet) return;
  
  sheet = ss.insertSheet(sheetName);
  var headers = ['ID', 'TeacherID', 'YearMonth', 'WeeklyBasic', 'WeeklyActual', 'WeeksCount', 'Adjustment', 'Reason', 'Note', 'UpdatedAt', 'OvertimeSlots'];
  sheet.appendRow(headers);
  sheet.getRange("A1:K1").setFontWeight("bold").setBackground("#fff2cc");
  sheet.setFrozenRows(1);
  sheet.getRange("A:A").setNumberFormat("@");
}

function setupLanguagePayrollSheet(ss) {
  var sheetName = CONFIG.LANGUAGE_PAYROLL_SHEET_NAME || '語言教師薪資紀錄';
  var sheet = ss.getSheetByName(sheetName);
  if (sheet) return;
  
  sheet = ss.insertSheet(sheetName);
  var headers = ['ID', 'TeacherID', 'YearMonth', 'HostSchool', 'TeachingSchool', 'Language', 'EntriesJSON', 'UpdatedAt'];
  sheet.appendRow(headers);
  sheet.getRange("A1:H1").setFontWeight("bold").setBackground("#e6b8af"); // Light red/pink background
  sheet.setFrozenRows(1);
  sheet.getRange("A:A").setNumberFormat("@"); // ID as text
  sheet.getRange("B:B").setNumberFormat("@"); // TeacherID as text
  sheet.getRange("C:C").setNumberFormat("@"); // YearMonth as text
}

function setupLanguageSettingsSheet(ss) {
  var sheetName = CONFIG.LANGUAGE_SETTINGS_SHEET_NAME || '語言教師設定';
  var sheet = ss.getSheetByName(sheetName);
  if (sheet) return;
  
  sheet = ss.insertSheet(sheetName);
  var headers = ['TeacherID', 'TeacherName', 'HostSchool', 'Language', 'HourlyRate', 'ScheduleJSON', 'UpdatedAt'];
  sheet.appendRow(headers);
  sheet.getRange("A1:G1").setFontWeight("bold").setBackground("#d9d2e9"); // Light purple background
  sheet.setFrozenRows(1);
  sheet.getRange("A:A").setNumberFormat("@"); // TeacherID as text
}

function setupSubPoolSheet(ss) {
  var sheetName = CONFIG.SUB_POOL_SHEET_NAME || '代課人力庫';
  var sheet = ss.getSheetByName(sheetName);
  var headers = ['TeacherID', '狀態 (Available/Busy/Observe)', '備註', '更新時間', '代課時間', '願意代課學年', '專長領域', '不接課時段'];
  if (sheet) {
      if (sheet.getLastColumn() < 8) {
          // 只做非破壞性的表頭檢查/補全
          sheet.getRange(1, 1, 1, 8).setValues([headers]);
          sheet.getRange(1, 1, 1, 8).setFontWeight("bold").setBackground("#d9ead3");
      }
      return;
  }
  sheet = ss.insertSheet(sheetName);
  sheet.appendRow(headers);
  sheet.getRange("A1:H1").setFontWeight("bold").setBackground("#d9ead3");
  sheet.setFrozenRows(1);
  sheet.getRange("A:A").setNumberFormat("@"); 
}
