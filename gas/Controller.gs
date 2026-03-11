
// 5. Controller.gs
// 程式進入點 - 處理 HTTP 請求

/**
 * 處理 POST 請求 (React 管理後台 API)
 */
function doPost(e) {
  var result = {};
  
  try {
    // 1. 基礎檢查
    if (!e || !e.postData) {
       return responseJSON({ status: 'error', message: 'Invalid Request: No postData' });
    }

    // 解析 JSON
    var payload = null;
    try {
       payload = JSON.parse(e.postData.contents);
    } catch(err) {
       return responseJSON({ status: 'error', message: 'Invalid JSON: ' + err.message });
    }

    if (!payload) return responseJSON({ status: 'error', message: 'Empty Payload' });

    var action = payload.action;
    var data = payload.data; 
    
    // 3. 處理各種 Action
    if (action === 'TEST_CONNECTION') {
      result = { status: 'success', message: '連線成功！(Service Online)' };

    } else if (action === 'GET_SPREADSHEET_URL') {
      var ss = getSpreadsheet();
      result = { status: 'success', data: { url: ss.getUrl() } };

    } else if (action === 'GET_OUTPUT_FOLDER_URL') {
      var rootId = CONFIG.OUTPUT_FOLDER_ID;
      if (!rootId) throw new Error("未設定輸出資料夾 ID");
      var targetUrl = "";
      var rootFolder = DriveApp.getFolderById(rootId);
      targetUrl = rootFolder.getUrl();
      if (data.yearMonth) {
          try {
              var parts = data.yearMonth.split('-');
              var year = parts[0];
              var month = parts[1];
              var yearFolders = rootFolder.getFoldersByName(year);
              if (yearFolders.hasNext()) {
                  var yFolder = yearFolders.next();
                  var monthFolders = yFolder.getFoldersByName(month);
                  if (monthFolders.hasNext()) targetUrl = monthFolders.next().getUrl();
                  else targetUrl = yFolder.getUrl();
              }
          } catch (e) {}
      }
      result = { status: 'success', data: { url: targetUrl } };

    } else if (action === 'GENERATE_FORM') {
      var record = data.record;
      var teachers = data.teachers;
      if (!record) throw new Error("Missing record data");
      var teacherMap = {};
      if (teachers) teachers.forEach(function(t) { teacherMap[t.id] = t.name; });
      var formUrl = FormManager.generateSubstituteForm(record, teacherMap);
      result = { status: 'success', data: { url: formUrl }, message: '代課單產生成功' };

    } else if (action === 'BATCH_GENERATE_FORMS') {
      var records = data.records;
      var teachers = data.teachers;
      var yearMonth = data.yearMonth; 
      if (!records || records.length === 0) throw new Error("沒有紀錄可產生");
      var teacherMap = {};
      if (teachers) teachers.forEach(function(t) { teacherMap[t.id] = t.name; });
      var fileUrl = FormManager.batchGenerateForms(records, teacherMap, yearMonth);
      result = { status: 'success', data: { url: fileUrl }, message: '批次代課單產生成功' };

    } else if (action === 'GENERATE_REPORTS') {
      var records = data.records;
      var teachers = data.teachers;
      var options = data.exportOptions || data.options || {};
      var resultObj = SheetManager.syncRecords(records, teachers, options);
      result = { 
        status: 'success', 
        message: '報表產生成功 (共處理 ' + resultObj.count + ' 筆資料)',
        data: { urls: resultObj.urls }
      };

    } else if (action === 'SYNC_DATA') {
      var statusMessages = [];
      
      // Full Sync Objects
      if (data.teachers) {
        try { SheetManager.syncTeachers(data.teachers); statusMessages.push("教師資料已更新"); } 
        catch(e) { statusMessages.push("教師同步錯誤: " + e.message); }
      }
      if (data.specialActivities) {
          try { SheetManager.saveSpecialActivities(data.specialActivities); statusMessages.push("專案活動已存檔"); }
          catch(e) { statusMessages.push("專案同步錯誤: " + e.message); }
      }
      if (data.fixedOvertimeConfig) {
          // 固定兼課設定仍由 FixedOvertimeManager 管理
          try { FixedOvertimeManager.saveConfig(data.fixedOvertimeConfig); statusMessages.push("固定兼課設定已存檔"); }
          catch(e) { statusMessages.push("固定兼課同步錯誤: " + e.message); }
      }
      if (data.gradeEvents) {
          try { SheetManager.saveGradeEvents(data.gradeEvents); statusMessages.push("年級活動設定已存檔"); }
          catch(e) { statusMessages.push("活動同步錯誤: " + e.message); }
      }
      if (data.holidays) {
          try { SheetManager.saveHolidays(data.holidays); statusMessages.push("假日設定已存檔"); }
          catch(e) { statusMessages.push("假日同步錯誤: " + e.message); }
      }
      // 新增：同步系統參數
      if (data.systemSettings) {
          try { SheetManager.saveSystemSettings(data.systemSettings); statusMessages.push("系統參數已存檔"); }
          catch(e) { statusMessages.push("參數同步錯誤: " + e.message); }
      }
      // 新增：同步超鐘點紀錄
      if (data.overtimeRecords) {
          try { SheetManager.saveOvertimeRecords(data.overtimeRecords); statusMessages.push("超鐘點紀錄已存檔"); }
          catch(e) { statusMessages.push("超鐘點同步錯誤: " + e.message); }
      }
      // 新增：同步語言教師薪資清冊
      if (data.languagePayrolls) {
          try { SheetManager.syncLanguagePayrolls(data.languagePayrolls); statusMessages.push("語言教師薪資已存檔"); }
          catch(e) { statusMessages.push("語言薪資同步錯誤: " + e.message); }
      }

      // 新增：同步語言教師設定
      if (data.teachers) {
          try { SheetManager.syncLanguageSettings(data.teachers); }
          catch(e) { statusMessages.push("語言教師設定同步錯誤: " + e.message); }
      }

      // Delta Sync for Records
      // Handle Deletions
      if (data.deleteRecordIds && data.deleteRecordIds.length > 0) {
          try {
              var delCount = SheetManager.deleteRecords(data.deleteRecordIds);
              statusMessages.push("刪除紀錄: " + delCount + "筆");
          } catch(e) {
              statusMessages.push("刪除失敗: " + e.message);
          }
      }

      // Handle Upserts (Update or Insert)
      if (data.upsertRecords && data.upsertRecords.length > 0) {
          try {
              var upsertCount = SheetManager.upsertRecords(data.upsertRecords);
              statusMessages.push("新增/更新紀錄: " + upsertCount + "筆");
          } catch(e) {
              statusMessages.push("更新失敗: " + e.message);
          }
      } else if (data.records) {
          // Fallback: If payload has full records (legacy or force full sync), use old method
          SheetManager.saveRawRecords(data.records);
          statusMessages.push("全量紀錄已更新");
      }
      
      result = {
        status: 'success',
        processedCount: (data.upsertRecords ? data.upsertRecords.length : 0),
        data: { urls: [] },
        message: '資料庫同步完成！' + statusMessages.join('，')
      };
      
    } else if (action === 'LOAD_DATA') {
      var teachers = SheetManager.getTeachers();
      var records = SheetManager.getRawRecords();
      var salaryGrades = SheetManager.getSalaryGrades();
      var specialActivities = SheetManager.getSpecialActivities(); 
      var fixedOvertimeConfig = FixedOvertimeManager.getConfig(); // Load Fixed Config
      var gradeEvents = SheetManager.getGradeEvents(); 
      var holidays = SheetManager.getHolidays(); 
      var systemSettings = SheetManager.getSystemSettings();
      var subPool = SubPoolManager.getSubPool();
      var overtimeRecords = SheetManager.getOvertimeRecords(); // Load Overtime Records
      var languagePayrolls = SheetManager.getLanguagePayrolls(); // Load Language Payrolls
      var languageSettings = SheetManager.getLanguageSettings(); // Load Language Settings
      
      // Merge Language Settings into Teachers
      if (teachers && teachers.length > 0) {
          teachers.forEach(function(t) {
              if (languageSettings[t.id]) {
                  var s = languageSettings[t.id];
                  t.hostSchool = s.hostSchool;
                  t.languageSpecialty = s.languageSpecialty;
                  t.defaultHourlyRate = s.defaultHourlyRate;
                  t.teacherCategory = s.teacherCategory;
                  t.languageSchedule = s.languageSchedule;
              }
          });
      }
      
      result = {
        status: 'success',
        data: {
          teachers: teachers,
          records: records,
          salaryGrades: salaryGrades,
          specialActivities: specialActivities,
          fixedOvertimeConfig: fixedOvertimeConfig,
          gradeEvents: gradeEvents,
          holidays: holidays,
          systemSettings: systemSettings,
          subPool: subPool,
          overtimeRecords: overtimeRecords,
          languagePayrolls: languagePayrolls
        },
        message: '從 Google Sheet 載入成功'
      };

    } else if (action === 'SYNC_SUB_POOL') {
      var poolData = data.subPool;
      var count = SubPoolManager.saveSubPool(poolData);
      result = { status: 'success', message: '已更新 ' + count + ' 筆代課人力資料' };

    } else if (action === 'SYNC_PUBLIC_VACANCIES') {
      var vacancies = data.vacancies;
      var count = SheetManager.updatePublicVacancies(vacancies);
      result = { status: 'success', message: '已發佈 ' + count + ' 筆缺額' };

    } else if (action === 'SUBMIT_APPLICATION') {
      var res = SheetManager.submitApplication(data.application);
      result = { status: 'success', data: res, message: '報名成功' };

    } else if (action === 'GET_TEACHER_REQUESTS') {
      var requests = SheetManager.getTeacherRequests();
      result = { status: 'success', data: requests };

    } else if (action === 'ARCHIVE_REQUEST') {
      SheetManager.archiveRequest(data.uuid);
      result = { status: 'success', message: '紀錄已封存' };

    } else if (action === 'RESTORE_REQUEST') {
      SheetManager.restoreRequest(data.uuid);
      result = { status: 'success', message: '紀錄已還原' };

    } else if (action === 'GENERATE_FIXED_OVERTIME_REPORT') {
      var res = FixedOvertimeManager.generateReport(data.year, data.month, data.reportData, data.semesterStart, data.semesterEnd, data.docNumber, null, data.holidays, data.substituteTeachers);
      result = { status: 'success', data: { url: res.url }, message: '固定兼課報表產生成功' };

    } else if (action === 'GENERATE_OVERTIME_REPORT') {
      // 呼叫 OvertimeManager
      var res = OvertimeManager.generateReport(data.year, data.month, data.reportData, data.semesterStart, data.semesterEnd, data.docNumber, CONFIG.OVERTIME_TEMPLATE_NAME, data.holidays);
      result = { status: 'success', data: { url: res.url }, message: '超鐘點報表產生成功' };

    } else if (action === 'EXPORT_LANGUAGE_PAYROLL') {
      var month = data.month;
      var payrolls = data.payrolls;
      var templateName = data.templateName || "語言教師清冊範本";
      var templateSpreadsheetId = data.templateSpreadsheetId; // Get ID from frontend
      
      var resultObj = LanguagePayroll.exportPayroll(month, payrolls, templateName, templateSpreadsheetId);
      
      result = { status: 'success', data: { url: resultObj.url, fileId: resultObj.fileId }, message: '語言教師薪資清冊匯出成功' };

    } else if (action === 'GENERATE_HAKKA_RECEIPT') {
      var teacherName = data.teacherName;
      var calculatedData = data.calculatedData;
      var hourlyRate = data.hourlyRate;
      var templateName = data.templateName || "客語領據範本";
      
      var resultObj = LanguagePayroll.generateHakkaReceipt(teacherName, calculatedData, hourlyRate, templateName);
      result = { status: 'success', data: { url: resultObj.url }, message: '客語薪資領據產生成功' };

    } else if (action === 'GENERATE_INDIGENOUS_RECEIPT') {
      var resultObj = LanguagePayroll.generateIndigenousReceipt(data);
      result = { status: 'success', data: { url: resultObj.url }, message: '族語專職教師領據產生成功' };

    } else if (action === 'GENERATE_EXTRA_VOUCHER') {
      var res = SheetManager.generateExtraVoucher(data.title, data.amount, data.year, data.month);
      result = { status: 'success', data: { url: res.url }, message: '額外憑證已產生' };

    } else if (action === 'UPLOAD_TEACHER_DOCUMENT') {
      var url = DriveManager.saveTeacherDocument(data.fileData.base64, data.fileData.mimeType, data.fileData.name);
      var doc = {
          id: Utilities.getUuid(),
          name: data.fileData.name,
          url: url,
          uploadDate: new Date().toISOString().split('T')[0]
      };
      result = { status: 'success', data: { doc: doc }, message: '上傳成功' };

    } else {
      throw new Error('Unknown Action: ' + action);
    }
    
    return responseJSON(result);
    
  } catch (error) {
    Logger.log("❌ Server Error: " + error.toString());
    return responseJSON({ status: 'error', message: error.toString() });
  }
}

function doGet(e) {
  var page = e.parameter.page;
  var htmlOutput;
  if (page === 'request') {
    htmlOutput = HtmlService.createTemplateFromFile('TeacherRequest').evaluate();
    htmlOutput.setTitle('教師請假申請 | SubTeach Pro');
  } else {
    htmlOutput = HtmlService.createTemplateFromFile('PublicBoard').evaluate();
    htmlOutput.setTitle('代課缺額公告 | SubTeach Pro');
  }
  return htmlOutput
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ... (Public Bridge Functions remain unchanged) ...
function apiGetPublicData() { try { var data = SheetManager.getPublicVacanciesData(); return { status: 'success', data: data }; } catch(e) { return { status: 'error', message: e.toString() }; } }
function apiSubmitApplication(data) { try { var res = SheetManager.submitApplication(data.application); return { status: 'success', data: res }; } catch(e) { return { status: 'error', message: e.toString() }; } }
function apiGetTeacherList() { try { var teachers = SheetManager.getTeachers(); var names = teachers.map(function(t) { return t.name; }); return { status: 'success', data: names }; } catch(e) { return { status: 'error', message: e.toString() }; } }
function apiHandleTeacherRequest(data) { try { var fileUrl = ''; if (data.fileData && data.fileData.base64) { fileUrl = DriveManager.saveProofFile(data.fileData.base64, data.fileData.mimeType, data.fileData.name, data.form.startDate); } var uuid = SheetManager.saveLeaveRequest(data.form, fileUrl); return { status: 'success', data: { uuid: uuid } }; } catch(e) { return { status: 'error', message: e.toString() }; } }
