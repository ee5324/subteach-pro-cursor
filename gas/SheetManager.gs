
// 3. SheetManager.gs
// 負責試算表寫入邏輯

var SheetManager = {
  // ... (保留先前的 syncTeachers, getTeachers, upsertRecords 等函式)

  /**
   * 同步教師名單到 "教師資料庫" Sheet (保持全量更新)
   * 安全修正：若 teachers 為空，禁止執行，避免誤刪資料。
   */
  syncTeachers: function(teachers) {
    // 1. 安全檢查：防止空陣列覆蓋資料庫
    if (!teachers || !Array.isArray(teachers) || teachers.length === 0) {
        Logger.log("⚠️ 警告：收到空的教師列表，系統拒絕同步以保護資料庫。");
        return; 
    }
    
    var ss = getSpreadsheet();
    var sheetName = '教師資料庫';
    var sheet = ss.getSheetByName(sheetName);
    
    if (!sheet) { sheet = ss.insertSheet(sheetName); }
    
    // 2. 只有在確定有資料要寫入時，才清除舊資料
    sheet.clear(); 
    var headers = [
      '教師姓名', '目前薪級', '有無教證', '最高學歷', '類別', '備註', '是否退休', 
      '任課班級', '任教科目', '電話', '職別', '特教教師', '畢業班導師', '行政減授(JSON)', 
      '教師角色', '本俸', '學術研究費', '專長科目', '預設課表', '入職資料(JSON)', '預設超鐘點(JSON)', 'ID'
    ];
    sheet.appendRow(headers);
    sheet.getRange("A:A").setNumberFormat("@"); 
    sheet.getRange("J:J").setNumberFormat("@"); 
    sheet.getRange("V:V").setNumberFormat("@"); 
    
    var rows = teachers.map(function(t) {
      var expertiseStr = (t.expertise && Array.isArray(t.expertise)) ? t.expertise.join(',') : '';
      var scheduleStr = (t.defaultSchedule) ? JSON.stringify(t.defaultSchedule) : '[]';
      var documentsStr = (t.entryDocuments) ? JSON.stringify(t.entryDocuments) : '[]';
      var overtimeSlotsStr = (t.defaultOvertimeSlots) ? JSON.stringify(t.defaultOvertimeSlots) : '[]';
      
      // Handle Reductions: Store as JSON string if exists, else number (legacy compatible)
      var reductionVal = 0;
      if (t.reductions && t.reductions.length > 0) {
          reductionVal = JSON.stringify(t.reductions);
      } else {
          reductionVal = Number(t.adminReduction) || 0;
      }
      
      return [
        t.name, Number(t.salaryPoints) || 0, t.hasCertificate ? '有' : '無', t.education || '',
        t.type, t.note || '', t.isRetired ? '是' : '否', t.teachingClasses || '',
        t.subjects || '', t.phone || '', t.jobTitle || '', t.isSpecialEd ? '是' : '否',
        t.isGraduatingHomeroom ? '是' : '否', reductionVal, t.teacherRole || '',
        Number(t.baseSalary) || 0, Number(t.researchFee) || 0,
        expertiseStr, scheduleStr, documentsStr, overtimeSlotsStr, t.id || t.name
      ];
    });
    
    if (rows.length > 0) {
      sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
    }
  },

  getTeachers: function() {
    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName('教師資料庫');
    if (!sheet) return [];
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];
    var lastCol = sheet.getLastColumn();
    // Read up to column 22 (V)
    var readCols = lastCol < 22 ? lastCol : 22;
    var data = sheet.getRange(2, 1, lastRow - 1, readCols).getValues();
    
    return data.map(function(row) {
      var name = row[0];
      var id = row[21] || name; // Use column 22 for ID, fallback to name
      var teacherRole = row[14] || ''; 
      var isHomeroom = (teacherRole.indexOf('導師') > -1) || (row[12] === '是');
      var expertiseStr = row[17] || '';
      var expertise = [];
      if (expertiseStr && typeof expertiseStr === 'string') {
          expertise = expertiseStr.split(',').filter(function(s){ return s && s.trim().length > 0; });
      }
      
      var defaultSchedule = [];
      try {
          if (row[18] && typeof row[18] === 'string') {
              defaultSchedule = JSON.parse(row[18]);
          }
      } catch(e) { defaultSchedule = []; }

      var entryDocuments = [];
      try {
          if (row[19] && typeof row[19] === 'string') {
              entryDocuments = JSON.parse(row[19]);
          }
      } catch(e) { entryDocuments = []; }

      var defaultOvertimeSlots = [];
      try {
          if (row[20] && typeof row[20] === 'string') {
              defaultOvertimeSlots = JSON.parse(row[20]);
          }
      } catch(e) { defaultOvertimeSlots = []; }

      // Handle Reductions (Mixed Type: JSON string or Number)
      var reductions = [];
      var adminReduction = 0;
      var rawReduction = row[13];
      
      try {
          // If it starts with '[', assume JSON string
          if (typeof rawReduction === 'string' && rawReduction.trim().indexOf('[') === 0) {
              reductions = JSON.parse(rawReduction);
              // Calculate total for legacy field
              adminReduction = reductions.reduce(function(sum, item){ return sum + (item.periods || 0); }, 0);
          } else {
              // Legacy Number
              adminReduction = Number(rawReduction) || 0;
              // Optional: auto-convert to reduction item for consistency, but keeping array empty is safer to denote "legacy"
              if (adminReduction > 0) {
                  reductions = [{ title: '基本減授', periods: adminReduction }];
              }
          }
      } catch(e) {
          adminReduction = 0;
          reductions = [];
      }

      return {
        id: id, name: name, salaryPoints: Number(row[1]) || 0, hasCertificate: row[2] === '有',
        education: row[3] || '', type: row[4], note: row[5], isRetired: row[6] === '是',
        teachingClasses: row[7] || '', subjects: row[8] || '', phone: String(row[9]), 
        jobTitle: row[10] || '', isSpecialEd: row[11] === '是', 
        isGraduatingHomeroom: row[12] === '是', // Legacy field
        adminReduction: adminReduction, // Keeping legacy number populated
        reductions: reductions,         // Populating new array
        teacherRole: teacherRole,
        baseSalary: Number(row[15]) || 0, researchFee: Number(row[16]) || 0, isHomeroom: isHomeroom,
        expertise: expertise,
        defaultSchedule: defaultSchedule,
        entryDocuments: entryDocuments,
        defaultOvertimeSlots: defaultOvertimeSlots
      };
    });
  },

  getSalaryGrades: function() {
    var ss = getSpreadsheet();
    var sheetName = CONFIG.SALARY_TABLE_SHEET_NAME || '薪級級距表';
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) return [];
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];
    var data = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
    var grades = [];
    data.forEach(function(row) {
      if (row[0]) {
         grades.push({
           id: String(row[0]), // Added ID
           points: Number(row[0]), salary: Number(row[1]),
           researchFeeCertBachelor: Number(row[2]) || 0, researchFeeCertMaster: Number(row[3]) || 0,
           researchFeeNoCertBachelor: Number(row[4]) || 0, researchFeeNoCertMaster: Number(row[5]) || 0
         });
      }
    });
    return grades;
  },

  _recordToRows: function(r) {
      var rows = [];
      var partialStr = r.allowPartial ? '是' : '否';
      var status = r.processingStatus || '待處理';
      
      // Ensure dates are strings YYYY-MM-DD
      var appDate = r.applicationDate ? this._formatDate(r.applicationDate) : '';
      var startDate = r.startDate ? this._formatDate(r.startDate) : '';
      var endDate = r.endDate ? this._formatDate(r.endDate) : '';

      var commonData = [r.id, new Date(r.createdAt).toISOString(), r.originalTeacherId, r.leaveType, r.reason || '', r.docId || '', appDate, startDate, endDate];

      if (r.slots && r.slots.length > 0) {
         var that = this;
         r.slots.forEach(function(s) {
            var isOvertimeStr = s.isOvertime ? '是' : '否';
            var slotDate = s.date ? that._formatDate(s.date) : '';
            rows.push(commonData.concat([slotDate, s.period, s.subject, s.className, s.substituteTeacherId || '', s.payType, partialStr, status, isOvertimeStr]));
         });
      } else {
         rows.push(commonData.concat(['', '', '', '', '', '', partialStr, status, '否']));
      }
      return rows;
  },

  _formatDate: function(date) {
      if (!date) return '';
      var d;
      if (Object.prototype.toString.call(date) === "[object Date]") {
          d = date;
      } else if (typeof date === 'string') {
          // Replace slashes with dashes for parsing
          var normalized = date.replace(/\//g, '-');
          if (normalized.indexOf('-') > -1) {
              // Try to parse parts to ensure it's a valid date string
              var parts = normalized.split('-');
              if (parts.length === 3) {
                  // Ensure YYYY-MM-DD
                  var y = parts[0];
                  var m = parts[1].length === 1 ? '0' + parts[1] : parts[1];
                  var day = parts[2].length === 1 ? '0' + parts[2] : parts[2];
                  if (day.length > 2) day = day.substring(0, 2); // Handle "25 00:00:00"
                  return y + '-' + m + '-' + day;
              }
          }
          d = new Date(date);
      } else {
          d = new Date(date);
      }
      
      try {
          if (isNaN(d.getTime())) return String(date);
          return Utilities.formatDate(d, "GMT+8", "yyyy-MM-dd");
      } catch(e) {
          return String(date);
      }
  },

  upsertRecords: function(records) {
      if (!records || records.length === 0) return 0;
      var idsToDelete = records.map(function(r) { return r.id; });
      this.deleteRecords(idsToDelete);
      
      var ss = getSpreadsheet();
      var sheetName = CONFIG.RAW_DATA_SHEET_NAME || '原始紀錄資料庫';
      var sheet = ss.getSheetByName(sheetName);
      if (!sheet) return 0; 

      var allRows = [];
      var that = this;
      records.forEach(function(r) {
          var rows = that._recordToRows(r);
          allRows = allRows.concat(rows);
      });

      if (allRows.length > 0) {
          sheet.getRange(sheet.getLastRow() + 1, 1, allRows.length, 18).setValues(allRows);
      }
      return records.length;
  },

  deleteRecords: function(recordIds) {
      if (!recordIds || recordIds.length === 0) return 0;
      var idSet = {};
      recordIds.forEach(function(id) { idSet[id] = true; });

      var ss = getSpreadsheet();
      var sheetName = CONFIG.RAW_DATA_SHEET_NAME || '原始紀錄資料庫';
      var sheet = ss.getSheetByName(sheetName);
      if (!sheet) return 0;

      var lastRow = sheet.getLastRow();
      if (lastRow < 2) return 0;

      var data = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      var deleteCount = 0;
      for (var i = data.length - 1; i >= 0; i--) {
          var id = String(data[i][0]);
          if (idSet[id]) {
              sheet.deleteRow(i + 2); 
              deleteCount++;
          }
      }
      return deleteCount;
  },

  saveRawRecords: function(records) {
    if (!records) return;
    var ss = getSpreadsheet();
    var sheetName = CONFIG.RAW_DATA_SHEET_NAME || '原始紀錄資料庫';
    var sheet = ss.getSheetByName(sheetName);
    var headers = ['ID', '建立時間', '請假教師', '假別', '事由', '公文文號', '申請日期', '開始日期', '結束日期', '代課日期', '節次', '科目', '班級', '代課教師', '支薪方式', '允許分段', '狀態', '超鐘點'];

    if (!sheet) { sheet = ss.insertSheet(sheetName); }
    sheet.clear();
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight("bold").setBackground("#e0e0e0");
    sheet.setFrozenRows(1);
    sheet.getRange("A:A").setNumberFormat("@");
    sheet.getRange("J:J").setNumberFormat("@");
    
    if (records.length === 0) return;
    
    var rows = [];
    var that = this;
    records.forEach(function(r) {
        var rRows = that._recordToRows(r);
        rows = rows.concat(rRows);
    });
    
    if (rows.length > 0) {
        sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
    }
  },
  
  getRawRecords: function() {
    var ss = getSpreadsheet();
    var sheetName = CONFIG.RAW_DATA_SHEET_NAME || '原始紀錄資料庫';
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) return [];
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];
    var lastCol = sheet.getLastColumn();
    var numCols = lastCol < 18 ? 18 : lastCol;
    var data = sheet.getRange(2, 1, lastRow - 1, numCols).getValues();
    
    var recordsMap = {};
    var that = this;
    data.forEach(function(row) {
       var id = String(row[0]);
       if (!id) return;
       if (!recordsMap[id]) {
          recordsMap[id] = {
             id: id,
             createdAt: new Date(row[1]).getTime(),
             originalTeacherId: row[2],
             leaveType: row[3],
             reason: row[4],
             docId: row[5],
             applicationDate: that._formatDate(row[6]),
             startDate: that._formatDate(row[7]),
             endDate: that._formatDate(row[8]),
             slots: [],
             details: [],
             allowPartial: row[15] === '是',
             processingStatus: row[16] || '待處理' 
          };
       }
       if (row[9]) {
          recordsMap[id].slots.push({
             date: that._formatDate(row[9]), 
             period: String(row[10]),
             subject: row[11],
             className: row[12],
             substituteTeacherId: row[13] === '' ? null : row[13],
             payType: row[14],
             isOvertime: row[17] === '是'
          });
       }
    });
    
    var records = [];
    for (var key in recordsMap) { records.push(recordsMap[key]); }
    records.sort(function(a, b) { return b.createdAt - a.createdAt; });
    return records;
  },

  // === NEW: Overtime Records Management ===
  saveOvertimeRecords: function(records) {
      var ss = getSpreadsheet();
      var sheetName = CONFIG.OVERTIME_RECORD_SHEET_NAME || '超鐘點紀錄';
      var sheet = ss.getSheetByName(sheetName);
      if (!sheet) { sheet = ss.insertSheet(sheetName); }
      
      sheet.clear();
      var headers = ['ID', 'TeacherID', 'YearMonth', 'WeeklyBasic', 'WeeklyActual', 'WeeksCount', 'Adjustment', 'Reason', 'Note', 'UpdatedAt', 'OvertimeSlots'];
      sheet.appendRow(headers);
      sheet.getRange("A1:K1").setFontWeight("bold").setBackground("#fff2cc");
      sheet.setFrozenRows(1);
      sheet.getRange("A:A").setNumberFormat("@");
      
      if (records && records.length > 0) {
          var rows = records.map(function(r) {
              return [
                  r.id, r.teacherId, r.yearMonth, 
                  r.weeklyBasic, r.weeklyActual, r.weeksCount, 
                  r.adjustment, r.adjustmentReason, r.note, 
                  new Date(r.updatedAt).toISOString(),
                  JSON.stringify(r.overtimeSlots || [])
              ];
          });
          sheet.getRange(2, 1, rows.length, 11).setValues(rows);
      }
  },

  getOvertimeRecords: function() {
      var ss = getSpreadsheet();
      var sheetName = CONFIG.OVERTIME_RECORD_SHEET_NAME || '超鐘點紀錄';
      var sheet = ss.getSheetByName(sheetName);
      if (!sheet) return [];
      
      var lastRow = sheet.getLastRow();
      if (lastRow < 2) return [];
      
      var data = sheet.getRange(2, 1, lastRow - 1, 11).getValues();
      return data.map(function(row) {
          var slots = [];
          try { slots = JSON.parse(row[10]); } catch(e) {}
          return {
              id: String(row[0]), teacherId: String(row[1]), yearMonth: String(row[2]),
              weeklyBasic: Number(row[3]) || 0, weeklyActual: Number(row[4]) || 0, weeksCount: Number(row[5]) || 0,
              adjustment: Number(row[6]) || 0, adjustmentReason: String(row[7]), note: String(row[8]),
              updatedAt: new Date(row[9]).getTime(),
              overtimeSlots: slots
          };
      });
  },
  // === END NEW ===

  // === NEW: Language Payrolls Management ===
  syncLanguagePayrolls: function(payrolls) {
      // 1. 安全檢查
      if (!payrolls || !Array.isArray(payrolls)) {
          Logger.log("⚠️ 警告：收到無效的語言教師薪資列表。");
          return; 
      }
      
      var ss = getSpreadsheet();
      var sheetName = CONFIG.LANGUAGE_PAYROLL_SHEET_NAME || '語言教師薪資紀錄';
      var sheet = ss.getSheetByName(sheetName);
      
      if (!sheet) { 
          setupLanguagePayrollSheet(ss);
          sheet = ss.getSheetByName(sheetName);
      }
      
      // 2. 全量更新 (先清除舊資料)
      sheet.clearContents();
      var headers = ['ID', 'TeacherID', 'YearMonth', 'HostSchool', 'TeachingSchool', 'Language', 'EntriesJSON', 'UpdatedAt'];
      sheet.appendRow(headers);
      
      if (payrolls.length === 0) return;
      
      var rows = payrolls.map(function(p) {
          return [
              p.id,
              p.teacherId,
              p.yearMonth,
              p.hostSchool || '',
              p.teachingSchool || '',
              p.language || '',
              JSON.stringify(p.entries || []),
              new Date(p.updatedAt).toISOString()
          ];
      });
      
      sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  },

  getLanguagePayrolls: function() {
      var ss = getSpreadsheet();
      var sheetName = CONFIG.LANGUAGE_PAYROLL_SHEET_NAME || '語言教師薪資紀錄';
      var sheet = ss.getSheetByName(sheetName);
      if (!sheet) return [];
      
      var lastRow = sheet.getLastRow();
      if (lastRow < 2) return [];
      
      var data = sheet.getRange(2, 1, lastRow - 1, 8).getValues();
      return data.map(function(row) {
          var entries = [];
          try { entries = JSON.parse(row[6]); } catch(e) {}
          
          return {
              id: String(row[0]),
              teacherId: String(row[1]),
              yearMonth: String(row[2]),
              hostSchool: String(row[3]),
              teachingSchool: String(row[4]),
              language: String(row[5]),
              entries: entries,
              updatedAt: new Date(row[7]).getTime()
          };
      });
  },
  // === END NEW ===

  // === NEW: Language Settings Management ===
  syncLanguageSettings: function(teachers) {
      if (!teachers || !Array.isArray(teachers)) return;
      
      var ss = getSpreadsheet();
      var sheetName = CONFIG.LANGUAGE_SETTINGS_SHEET_NAME || '語言教師設定';
      var sheet = ss.getSheetByName(sheetName);
      
      if (!sheet) { 
          setupLanguageSettingsSheet(ss);
          sheet = ss.getSheetByName(sheetName);
      }
      
      sheet.clearContents();
      var headers = ['TeacherID', 'TeacherName', 'HostSchool', 'Language', 'HourlyRate', 'Category', 'ScheduleJSON', 'UpdatedAt'];
      sheet.appendRow(headers);
      
      var rows = [];
      var timestamp = new Date().toISOString();
      
      teachers.forEach(function(t) {
          // Only save if it's a language teacher or has language settings
          if (t.type === '語言教師' || t.languageSpecialty || (t.languageSchedule && t.languageSchedule.length > 0)) {
              rows.push([
                  t.id,
                  t.name,
                  t.hostSchool || '',
                  t.languageSpecialty || '',
                  t.defaultHourlyRate || '',
                  t.teacherCategory || '',
                  JSON.stringify(t.languageSchedule || []),
                  timestamp
              ]);
          }
      });
      
      if (rows.length > 0) {
          sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
      }
  },

  getLanguageSettings: function() {
      var ss = getSpreadsheet();
      var sheetName = CONFIG.LANGUAGE_SETTINGS_SHEET_NAME || '語言教師設定';
      var sheet = ss.getSheetByName(sheetName);
      if (!sheet) return {};
      
      var lastRow = sheet.getLastRow();
      if (lastRow < 2) return {};
      
      var data = sheet.getRange(2, 1, lastRow - 1, 8).getValues();
      var settingsMap = {};
      
      data.forEach(function(row) {
          var teacherId = String(row[0]);
          if (!teacherId) return;
          
          var schedule = [];
          try { schedule = JSON.parse(row[6]); } catch(e) {}
          
          settingsMap[teacherId] = {
              hostSchool: String(row[2]),
              languageSpecialty: String(row[3]),
              defaultHourlyRate: Number(row[4]) || 0,
              teacherCategory: String(row[5]),
              languageSchedule: schedule
          };
      });
      
      return settingsMap;
  },
  // === END NEW ===

  saveSpecialActivities: function(activities) {
      var ss = getSpreadsheet();
      var sheetName = CONFIG.SPECIAL_ACTIVITY_SHEET_NAME || '專案活動紀錄';
      var sheet = ss.getSheetByName(sheetName);
      if (!sheet) { sheet = ss.insertSheet(sheetName); }
      sheet.clear();
      var headers = ['ID', '日期', '活動名稱', '領款教師', '支薪方式', '數量', '金額', '備註'];
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight("bold").setBackground("#d9d2e9");
      sheet.setFrozenRows(1);
      sheet.getRange("A:A").setNumberFormat("@");
      if (!activities || activities.length === 0) return;
      var rows = activities.map(function(a) { return [a.id, a.date, a.title, a.teacherId, a.payType, a.units, a.amount, a.note || '']; });
      sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  },

  getSpecialActivities: function() {
      var ss = getSpreadsheet();
      var sheetName = CONFIG.SPECIAL_ACTIVITY_SHEET_NAME || '專案活動紀錄';
      var sheet = ss.getSheetByName(sheetName);
      if (!sheet) return [];
      var lastRow = sheet.getLastRow();
      if (lastRow < 2) return [];
      var data = sheet.getRange(2, 1, lastRow - 1, 8).getValues();
      return data.map(function(row) {
          var dateStr = row[1];
          if (Object.prototype.toString.call(dateStr) === "[object Date]") { dateStr = Utilities.formatDate(dateStr, Session.getScriptTimeZone(), "yyyy-MM-dd"); }
          return { id: String(row[0]), date: String(dateStr), title: String(row[2]), teacherId: String(row[3]), payType: String(row[4]), units: Number(row[5]), amount: Number(row[6]), note: String(row[7]) };
      });
  },

  saveGradeEvents: function(events) {
      var ss = getSpreadsheet();
      var sheetName = CONFIG.GRADE_EVENTS_SHEET_NAME || '年級活動設定';
      var sheet = ss.getSheetByName(sheetName);
      if (!sheet) { sheet = ss.insertSheet(sheetName); }
      sheet.clear();
      var headers = ['ID', '日期', '活動名稱', '受影響年級(JSON)'];
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight("bold").setBackground("#fce5cd");
      sheet.setFrozenRows(1);
      sheet.getRange("A:A").setNumberFormat("@");
      if (!events || events.length === 0) return;
      var rows = events.map(function(e) { return [e.id, e.date, e.title, JSON.stringify(e.targetGrades)]; });
      sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  },

  getGradeEvents: function() {
      var ss = getSpreadsheet();
      var sheetName = CONFIG.GRADE_EVENTS_SHEET_NAME || '年級活動設定';
      var sheet = ss.getSheetByName(sheetName);
      if (!sheet) return [];
      var lastRow = sheet.getLastRow();
      if (lastRow < 2) return [];
      var data = sheet.getRange(2, 1, lastRow - 1, 4).getValues();
      return data.map(function(row) {
          var dateStr = row[1];
          if (Object.prototype.toString.call(dateStr) === "[object Date]") { dateStr = Utilities.formatDate(dateStr, Session.getScriptTimeZone(), "yyyy-MM-dd"); }
          var grades = []; try { grades = JSON.parse(row[3]); } catch(e) { grades = []; }
          return { id: String(row[0]), date: String(dateStr), title: String(row[2]), targetGrades: grades };
      });
  },

  saveHolidays: function(dates) {
      var ss = getSpreadsheet();
      var sheetName = CONFIG.HOLIDAYS_SHEET_NAME || '國定假日設定';
      var sheet = ss.getSheetByName(sheetName);
      if (!sheet) { sheet = ss.insertSheet(sheetName); }
      sheet.clear();
      var headers = ['日期 (YYYY-MM-DD)'];
      sheet.getRange(1, 1).setValue(headers[0]).setFontWeight('bold').setBackground("#f4cccc");
      sheet.setFrozenRows(1);
      sheet.getRange("A:A").setNumberFormat("@");
      if (!dates || dates.length === 0) return;
      var uniqueDates = dates.filter(function(item, pos) { return dates.indexOf(item) == pos; }).sort();
      var rows = uniqueDates.map(function(d) { return [d]; });
      if (rows.length > 0) { sheet.getRange(2, 1, rows.length, 1).setValues(rows); }
  },

  getHolidays: function() {
      var ss = getSpreadsheet();
      var sheetName = CONFIG.HOLIDAYS_SHEET_NAME || '國定假日設定';
      var sheet = ss.getSheetByName(sheetName);
      if (!sheet) return [];
      var lastRow = sheet.getLastRow();
      if (lastRow < 2) return [];
      var data = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      return data.map(function(row) {
          var val = row[0];
          if (Object.prototype.toString.call(val) === "[object Date]") { return Utilities.formatDate(val, Session.getScriptTimeZone(), "yyyy-MM-dd"); }
          return String(val);
      }).filter(function(d) { return d && d.length > 0; });
  },
  
  // 新增：系統參數存取
  saveSystemSettings: function(settings) {
      var ss = getSpreadsheet();
      var sheetName = '系統參數';
      var sheet = ss.getSheetByName(sheetName);
      if (!sheet) {
          sheet = ss.insertSheet(sheetName);
          sheet.appendRow(['參數名稱', '參數值']);
      }
      sheet.clearContents();
      sheet.appendRow(['參數名稱', '參數值']);
      
      var rows = [];
      for (var key in settings) {
          rows.push([key, settings[key]]);
      }
      if (rows.length > 0) {
          sheet.getRange(2, 1, rows.length, 2).setValues(rows);
      }
  },
  
  getSystemSettings: function() {
      var ss = getSpreadsheet();
      var sheetName = '系統參數';
      var sheet = ss.getSheetByName(sheetName);
      var settings = {};
      if (!sheet) return settings;
      
      var lastRow = sheet.getLastRow();
      if (lastRow < 2) return settings;
      
      var data = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
      data.forEach(function(row) {
          var key = row[0];
          var val = row[1];
          if (Object.prototype.toString.call(val) === "[object Date]") {
              val = Utilities.formatDate(val, Session.getScriptTimeZone(), "yyyy-MM-dd");
          }
          settings[key] = String(val);
      });
      return settings;
  },

  // ... (其他方法保持不變：updatePublicVacancies, getPublicVacanciesData, submitApplication, saveLeaveRequest, getTeacherRequests, archiveRequest, restoreRequest, syncRecords, _formatDateRanges, _formatRange) ...
  
  updatePublicVacancies: function(newVacancies) {
      var ss = getSpreadsheet();
      var sheetName = CONFIG.PUBLIC_VACANCY_SHEET_NAME || '公開待聘缺額';
      var sheet = ss.getSheetByName(sheetName);
      if (!sheet) return;
      var headers = ['唯一編號', '日期', '節次', '原請假教師', '科目', '班級', '事由', '支薪方式', '狀態', '更新時間', '紀錄編號', '允許分段'];
      var lastRow = sheet.getLastRow();
      var existingDataMap = {}; 
      if (lastRow > 1) {
          var currentData = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
          currentData.forEach(function(row) { var id = String(row[0]); if(id) existingDataMap[id] = row; });
      }
      var updateTime = new Date().toLocaleString();
      var processedIds = {}; 
      var finalRows = [];
      if (newVacancies && newVacancies.length > 0) {
          newVacancies.forEach(function(v) {
              processedIds[v.id] = true;
              finalRows.push([ v.id, v.date, v.period, v.originalTeacherName, v.subject, v.className, v.reason, v.payType || '', '開放報名', updateTime, v.recordId || '', v.allowPartial ? '是' : '否' ]);
          });
      }
      for (var id in existingDataMap) {
          if (!processedIds[id]) {
              var oldRow = existingDataMap[id];
              var currentStatus = oldRow[8];
              if (currentStatus === '開放報名') { oldRow[8] = '已媒合'; oldRow[9] = updateTime; }
              finalRows.push(oldRow);
          }
      }
      finalRows.sort(function(a, b) {
          if (a[1] < b[1]) return -1;
          if (a[1] > b[1]) return 1;
          return String(a[2]).localeCompare(String(b[2]));
      });
      sheet.clearContents(); 
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight("bold").setBackground("#fff2cc"); 
      sheet.getRange("A:A").setNumberFormat("@");
      sheet.getRange("K:K").setNumberFormat("@");
      sheet.setFrozenRows(1);
      if (finalRows.length > 0) { sheet.getRange(2, 1, finalRows.length, headers.length).setValues(finalRows); }
      return newVacancies ? newVacancies.length : 0;
  },

  getPublicVacanciesData: function() {
      var ss = getSpreadsheet();
      var vSheet = ss.getSheetByName(CONFIG.PUBLIC_VACANCY_SHEET_NAME || '公開待聘缺額');
      var vacancies = [];
      var spreadsheetTimeZone = ss.getSpreadsheetTimeZone();

      if (vSheet && vSheet.getLastRow() > 1) {
          var lastCol = vSheet.getLastColumn();
          var vData = vSheet.getRange(2, 1, vSheet.getLastRow() - 1, lastCol).getValues();
          vacancies = vData.map(function(r) {
              var id = String(r[0]);
              var d = r[1];
              var dateStr = "";
              if (Object.prototype.toString.call(d) === "[object Date]") { 
                  dateStr = Utilities.formatDate(d, spreadsheetTimeZone, "yyyy-MM-dd"); 
              } else { 
                  dateStr = String(d).substring(0, 10); 
              }
              var colH = String(r[7]).trim(); 
              var payType = '';
              var status = '';
              if (colH === '開放報名' || colH === '已媒合' || colH === '已關閉' || colH === '待審核') { status = colH; payType = ''; } else { payType = colH; status = String(r[8]).trim(); }
              var recordId = (r.length > 10) ? String(r[10]) : '';
              var allowPartial = (r.length > 11) ? (r[11] === '是') : false; 
              if (!recordId && id.indexOf('_') > -1) { var parts = id.split('_'); if (parts.length >= 3) { recordId = parts[0]; } }
              return { id: id, date: dateStr, period: r[2], originalTeacherName: r[3], subject: r[4], className: r[5], reason: r[6], payType: payType, status: status, recordId: recordId, allowPartial: allowPartial };
          });
      }
      var aSheet = ss.getSheetByName(CONFIG.APPLICATIONS_SHEET_NAME || '代課報名紀錄');
      var counts = {}; 
      if (aSheet && aSheet.getLastRow() > 1) {
          var aData = aSheet.getRange(2, 1, aSheet.getLastRow() - 1, 1).getValues();
          aData.forEach(function(r) { var vid = String(r[0]); counts[vid] = (counts[vid] || 0) + 1; });
      }
      return { vacancies: vacancies, applicationCounts: counts };
  },

  submitApplication: function(data) {
      var lock = LockService.getScriptLock();
      lock.waitLock(10000); 
      try {
          var ss = getSpreadsheet();
          var sheetName = CONFIG.APPLICATIONS_SHEET_NAME || '代課報名紀錄';
          var sheet = ss.getSheetByName(sheetName);
          if (!sheet) throw new Error("資料庫錯誤：找不到報名表");
          var timestamp = new Date();
          var status = '待審核';
          sheet.appendRow([ data.vacancyId, data.name, String(data.phone), data.note || '', timestamp, status, '' ]);
          var lastRow = sheet.getLastRow();
          var allData = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
          var count = 0;
          for (var i = 0; i < allData.length; i++) { if (String(allData[i][0]) === String(data.vacancyId)) { count++; } }
          return { success: true, queueOrder: count };
      } catch (e) { throw e; } finally { lock.releaseLock(); }
  },

  saveLeaveRequest: function(data, fileUrl) {
    var ss = getSpreadsheet();
    var sheetName = CONFIG.REQUEST_SHEET_NAME || '請假申請候審區';
    var sheet = ss.getSheetByName(sheetName);
    var headers = ['UUID', '申請時間', '申請人', '假別', '事由', '公文文號', '開始日期', '結束日期', '支薪方式', '預定代課教師', '申請節數詳情', '證明文件', '狀態'];
    if (!sheet) { sheet = ss.insertSheet(sheetName); sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight("bold").setBackground("#fce5cd"); sheet.setFrozenRows(1); }
    var uuid = Utilities.getUuid();
    var timestamp = new Date();
    var detailsJson = JSON.stringify(data.details || []);
    sheet.appendRow([ uuid, timestamp, data.teacherName, data.leaveType, data.reason, data.docId || '', data.startDate, data.endDate, data.payType || '', data.substituteTeacher || '', detailsJson, fileUrl || '', 'Pending' ]);
    return uuid;
  },

  getTeacherRequests: function() {
    var ss = getSpreadsheet();
    var sheetName = CONFIG.REQUEST_SHEET_NAME || '請假申請候審區';
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) return [];
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];
    var lastCol = sheet.getLastColumn();
    var data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
    var requests = [];
    data.forEach(function(row) {
        requests.push({ uuid: row[0], timestamp: row[1], teacherName: row[2], leaveType: row[3], reason: row[4], docId: row[5], startDate: row[6], endDate: row[7], payType: row[8], substituteTeacher: row[9], detailsJson: row[10], fileUrl: row[11], status: row[12] || 'Pending' });
    });
    requests.sort(function(a, b) { return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(); });
    return requests;
  },

  archiveRequest: function(uuid) {
    var ss = getSpreadsheet();
    var sheetName = CONFIG.REQUEST_SHEET_NAME || '請假申請候審區';
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) throw new Error("找不到申請記錄表");
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) throw new Error("無資料");
    var uuids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    var rowIndex = -1;
    for (var i = 0; i < uuids.length; i++) { if (String(uuids[i][0]) === String(uuid)) { rowIndex = i + 2; break; } }
    if (rowIndex > 0) { sheet.getRange(rowIndex, 13).setValue('Processed'); return true; } else { throw new Error("找不到該筆申請紀錄 (UUID: " + uuid + ")"); }
  },

  restoreRequest: function(uuid) {
    var ss = getSpreadsheet();
    var sheetName = CONFIG.REQUEST_SHEET_NAME || '請假申請候審區';
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) throw new Error("找不到申請記錄表");
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) throw new Error("無資料");
    var uuids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    var rowIndex = -1;
    for (var i = 0; i < uuids.length; i++) { if (String(uuids[i][0]) === String(uuid)) { rowIndex = i + 2; break; } }
    if (rowIndex > 0) { sheet.getRange(rowIndex, 13).setValue('Pending'); return true; } else { throw new Error("找不到該筆申請紀錄 (UUID: " + uuid + ")"); }
  },

  syncRecords: function(records, teachers, exportOptions) {
    if (!records || records.length === 0) return { count: 0, urls: [] };
    var ss = getSpreadsheet(); 
    var teacherMap = {};
    if (teachers) { teachers.forEach(function(t) { teacherMap[t.id] = t; }); }
    var sheetsData = {};
    
    records.forEach(function(record) {
      if (!record.details) return;
      // 公派(家長會) 整筆只入家長會清冊，不進入依假別分類的一般清冊
      if (record.leaveType === '公派(家長會)') return;
      record.details.forEach(function(detail) {
        // 超鐘點：前端已單獨為「鐘點費」明細，納入清冊一次，不跳過以免報表少算
        var sheetName = SheetManagerHelpers.getSafeSheetName(detail.date, record.leaveType);
        
        if (!sheetsData[sheetName]) sheetsData[sheetName] = {};
        var subTeacherName = detail.substituteTeacherId === 'pending' || !detail.substituteTeacherId ? '待聘' : detail.substituteTeacherId;
        if (!sheetsData[sheetName][subTeacherName]) {
            sheetsData[sheetName][subTeacherName] = { 
                dates: [], 
                fullDates: [], 
                originalTeachers: [], 
                leaveTypes: [], 
                reasons: [], 
                notes: [], 
                // 新增：逐筆明細（同一列多欄位同一格換行，且各欄位行數需一一對應；0 也不可省略）
                // 每筆明細對應欄位：
                // A 代課日期、E 代課天數、F 代課節數、G 代課鐘點費、H 請假人、K 備註、L 代導日數、M 導師費
                lineItems: [],
                subTeacherObj: teacherMap[subTeacherName] || null, 
                totalDays: 0, 
                totalPeriods: 0, 
                hourlyTotal: 0, 
                homeroomDays: 0, 
                homeroomFee: 0, 
                finalAmount: 0 
            };
        }
        var group = sheetsData[sheetName][subTeacherName];
        var dateStr = detail.date.substring(5).replace('-', '/'); 
        if (group.dates.indexOf(dateStr) === -1) group.dates.push(dateStr);
        if (group.fullDates.indexOf(detail.date) === -1) group.fullDates.push(detail.date);

        var origName = record.originalTeacherId;
        if (group.originalTeachers.indexOf(origName) === -1) group.originalTeachers.push(origName);
        if (group.leaveTypes.indexOf(record.leaveType) === -1) group.leaveTypes.push(record.leaveType);
        var reason = record.reason || '';
        if (reason && group.reasons.indexOf(reason) === -1) group.reasons.push(reason);
        
        var daysInMonth = SheetManagerHelpers.getSafeDaysInMonth(detail.date);
        
        var subDays = 0;
        var subPeriods = 0;
        if (detail.payType === '鐘點費') {
            subPeriods = Number(detail.periodCount) || 0;
            group.totalPeriods += subPeriods;
            group.hourlyTotal += detail.calculatedAmount;
        } else if (detail.payType === '半日薪') {
            subDays = 0.5;
            group.totalDays += subDays;
            var hDays = 0.5;
            var hFee = Math.round((4000 / daysInMonth) * hDays);
            group.homeroomDays += hDays;
            group.homeroomFee += hFee;
            group.hourlyTotal += (detail.calculatedAmount - hFee);
        } else {
            subDays = Number(detail.periodCount) || 0;
            group.totalDays += subDays;
            var hDays = subDays;
            var hFee = Math.round((4000 / daysInMonth) * hDays);
            group.homeroomDays += hDays;
            group.homeroomFee += hFee;
            group.hourlyTotal += (detail.calculatedAmount - hFee);
        }
        group.finalAmount += detail.calculatedAmount;
        var note = "";
        if (detail.payType === '鐘點費') {
            note = "0日" + subPeriods + "節";
            if(detail.selectedPeriods && detail.selectedPeriods.length > 0) note += "(" + detail.selectedPeriods.join(',') + ")";
        } else if (detail.payType === '半日薪') {
            note = "半日0節";
        } else {
            note = subDays + "日0節";
        }
        group.notes.push(note);

        // === NEW：逐筆明細（同一列多欄位同一格換行） ===
        // 注意：不新增列；每個欄位同一格以「換行」呈現多筆，且各欄位第 N 行需對應同一筆明細
        try {
            var leaveTeacherName = teacherMap[record.originalTeacherId] ? teacherMap[record.originalTeacherId].name : record.originalTeacherId;
            var dateMD = String(detail.date).substring(5).replace('-', '/');
            var payAmount = Number(detail.calculatedAmount) || 0;
            // G 欄：逐筆金額（先不含導師費；N 欄再做合計）
            // - 鐘點費：原樣顯示 calculatedAmount
            // - 日薪/半日薪：扣掉導師費後的金額
            var payAmountStr = String(payAmount);

            // 逐筆欄位：天數/節數/代導日數/導師費（0 也要顯示）
            var lineDaysStr = '0';
            var linePeriodsStr = '0';
            var lineHomeroomDaysStr = '0';
            var lineHomeroomFeeStr = '0';

            if (detail.payType === '鐘點費') {
                // 鐘點：0 日 + N 節；導師費 0
                lineDaysStr = '0';
                linePeriodsStr = String(Number(detail.periodCount) || 0);
                lineHomeroomDaysStr = '0';
                lineHomeroomFeeStr = '0';
            } else if (detail.payType === '半日薪') {
                // 半日：0.5 日 + 0 節；導師費依 0.5 日計
                lineDaysStr = '0.5';
                linePeriodsStr = '0';
                lineHomeroomDaysStr = '0.5';
                lineHomeroomFeeStr = String(Math.round((4000 / daysInMonth) * 0.5) || 0);
                // G 欄顯示不含導師費
                payAmountStr = String((Number(detail.calculatedAmount) || 0) - (Number(lineHomeroomFeeStr) || 0));
            } else {
                // 日薪：N 日 + 0 節；導師費依 N 日計
                lineDaysStr = String(Number(detail.periodCount) || 0);
                linePeriodsStr = '0';
                lineHomeroomDaysStr = String(Number(detail.periodCount) || 0);
                lineHomeroomFeeStr = String(Math.round((4000 / daysInMonth) * (Number(detail.periodCount) || 0)) || 0);
                // G 欄顯示不含導師費
                payAmountStr = String((Number(detail.calculatedAmount) || 0) - (Number(lineHomeroomFeeStr) || 0));
            }

            group.lineItems.push({
                date: String(detail.date),
                dateMD: dateMD,
                leaveTeacherName: String(leaveTeacherName),
                note: String(note),
                amountStr: payAmountStr,
                daysStr: String(lineDaysStr),
                periodsStr: String(linePeriodsStr),
                homeroomDaysStr: String(lineHomeroomDaysStr),
                homeroomFeeStr: String(lineHomeroomFeeStr)
            });
        } catch(e) {}
      });
    });

    // 家長會清冊：情況一 公派(家長會) 整筆；情況二 家長會支出鐘點(ptaPaysHourly) 鐘點費入清冊；情況三 家長會支出導師費(半天)(homeroomFeeByPta) 僅半日導師費入清冊。
    var ptaSheetsData = {};
    records.forEach(function(record) {
      if (!record.details) return;
      record.details.forEach(function(detail) {
        // 超鐘點：前端已為鐘點費明細，納入家長會清冊一次
        var ym = detail.date.substring(0, 7);
        var sheetName = ym + '_家長會';
        if (!ptaSheetsData[sheetName]) ptaSheetsData[sheetName] = {};
        var subTeacherName = detail.substituteTeacherId === 'pending' || !detail.substituteTeacherId ? '待聘' : detail.substituteTeacherId;
        if (!ptaSheetsData[sheetName][subTeacherName]) {
            ptaSheetsData[sheetName][subTeacherName] = {
                dates: [], fullDates: [], originalTeachers: [], leaveTypes: [], reasons: [], notes: [],
                subTeacherObj: teacherMap[subTeacherName] || null,
                totalDays: 0, totalPeriods: 0, hourlyTotal: 0, homeroomDays: 0, homeroomFee: 0, finalAmount: 0
            };
        }
        var group = ptaSheetsData[sheetName][subTeacherName];
        var dateStr = detail.date.substring(5).replace('-', '/');
        var daysInMonth = SheetManagerHelpers.getSafeDaysInMonth(detail.date);
        var isCase1 = (record.leaveType === '公派(家長會)');
        var isCase2a = (record.ptaPaysHourly && detail.payType === '鐘點費');
        var isCase2b = (record.homeroomFeeByPta && record.leaveType !== '自理 (事假/病假)');
        if (!isCase1 && !isCase2a && !isCase2b) return;

        if (group.dates.indexOf(dateStr) === -1) group.dates.push(dateStr);
        if (group.fullDates.indexOf(detail.date) === -1) group.fullDates.push(detail.date);
        if (group.originalTeachers.indexOf(record.originalTeacherId) === -1) group.originalTeachers.push(record.originalTeacherId);
        if (group.leaveTypes.indexOf(record.leaveType) === -1) group.leaveTypes.push(record.leaveType);
        var reason = record.reason || '';
        if (reason && group.reasons.indexOf(reason) === -1) group.reasons.push(reason);

        if (isCase1) {
            var subDays = 0, subPeriods = 0;
            if (detail.payType === '鐘點費') {
                subPeriods = Number(detail.periodCount) || 0;
                group.totalPeriods += subPeriods;
                group.hourlyTotal += detail.calculatedAmount;
                group.notes.push("0日" + subPeriods + "節" + (detail.selectedPeriods && detail.selectedPeriods.length ? "(" + detail.selectedPeriods.join(',') + ")" : ""));
            } else if (detail.payType === '半日薪') {
                group.totalDays += 0.5;
                group.homeroomDays += 0.5;
                var hFee = Math.round((4000 / daysInMonth) * 0.5);
                group.homeroomFee += hFee;
                group.hourlyTotal += (detail.calculatedAmount - hFee);
                group.notes.push("半日0節");
            } else {
                subDays = Number(detail.periodCount) || 0;
                group.totalDays += subDays;
                group.homeroomDays += subDays;
                var hFee = Math.round((4000 / daysInMonth) * subDays);
                group.homeroomFee += hFee;
                group.hourlyTotal += (detail.calculatedAmount - hFee);
                group.notes.push(subDays + "日0節");
            }
            group.finalAmount += detail.calculatedAmount;
        } else if (isCase2a) {
            var subPeriods = Number(detail.periodCount) || 0;
            group.totalPeriods += subPeriods;
            group.hourlyTotal += detail.calculatedAmount;
            group.finalAmount += detail.calculatedAmount;
            group.notes.push("家長會支出鐘點 0日" + subPeriods + "節" + (detail.selectedPeriods && detail.selectedPeriods.length ? "(" + detail.selectedPeriods.join(',') + ")" : ""));
        } else if (isCase2b) {
            group.homeroomDays += 0.5;
            var feeOnly = Math.round((4000 / daysInMonth) * 0.5);
            group.homeroomFee += feeOnly;
            group.finalAmount += feeOnly;
            group.notes.push("半日導師費家長會");
        }
      });
    });

    var processedCount = 0;
    var generatedUrls = [];
    var templateName = CONFIG.SUMMARY_TEMPLATE_SHEET_NAME || '導師請假範本';
    var templateSheet = ss.getSheetByName(templateName);
    var voucherTemplate = CONFIG.VOUCHER_TEMPLATE_SHEET_NAME ? ss.getSheetByName(CONFIG.VOUCHER_TEMPLATE_SHEET_NAME) : null;
    
    if (!templateSheet) return { count: 0, urls: [] };
    
    var rootFolderId = CONFIG.OUTPUT_FOLDER_ID;
    var rootFolder = rootFolderId ? DriveApp.getFolderById(rootFolderId) : DriveApp.getRootFolder();
    var ptaTemplateSheet = (CONFIG.PTA_SUMMARY_TEMPLATE_SHEET_NAME && ss.getSheetByName(CONFIG.PTA_SUMMARY_TEMPLATE_SHEET_NAME)) || templateSheet;
    var typeOrder = ['公假', '喪病產', '身心假', '學輔事務', '其他事務', '公付其他', '自理', '家長會'];
    exportOptions = exportOptions || {};
    // 僅當明確傳入陣列時才依勾選過濾；否則視為未指定，匯出全部
    var selectedLedgers = (exportOptions.ledgers !== undefined && Array.isArray(exportOptions.ledgers)) ? exportOptions.ledgers : (Array.isArray(exportOptions.ledgerTypes) ? exportOptions.ledgerTypes : null);
    var selectedVouchers = (exportOptions.vouchers !== undefined && Array.isArray(exportOptions.vouchers)) ? exportOptions.vouchers : (Array.isArray(exportOptions.voucherTypes) ? exportOptions.voucherTypes : null);

    function normalizeSelection(arr) {
        if (arr == null || !Array.isArray(arr)) return null;
        var set = {};
        arr.forEach(function(x) { if (x !== null && x !== undefined) set[String(x)] = true; });
        return set;
    }
    var selectedLedgersSet = normalizeSelection(selectedLedgers);
    var selectedVouchersSet = normalizeSelection(selectedVouchers);

    function isLedgerSelected(typeRaw) {
        if (selectedLedgersSet == null) return true;
        return !!selectedLedgersSet[String(typeRaw)];
    }
    function isVoucherSelected(typeRaw) {
        if (selectedVouchersSet == null) return true;
        return !!selectedVouchersSet[String(typeRaw)];
    }

    function typeRawToStr(typeRaw) {
        if (typeRaw === '自理') return '課務自理';
        if (typeRaw === '喪病產') return '喪病產假';
        if (typeRaw === '身心障礙') return '身心假';
        return typeRaw || '其他';
    }

    function buildRowsFromGroups(groups, teacherMap) {
        var rows = [];
        for (var subName in groups) {
            var g = groups[subName];
            // A 欄：代課日期（逐筆、多行、需與其他欄位行數對應）
            var dateDisplay = SheetManagerHelpers.formatDateRanges(g.fullDates);
            var subTeacherInfo = g.subTeacherObj || teacherMap[subName];
            var salaryGradeDisplay = '';
            if (subTeacherInfo && subTeacherInfo.salaryPoints) {
                var certStatus = subTeacherInfo.hasCertificate ? '(有證)' : '(無證)';
                salaryGradeDisplay = subTeacherInfo.salaryPoints + "\n" + certStatus;
            }
            // D 欄（日薪）：用薪級計算（不含導師費）；不再用 (N-M)/E 反推平均
            var daysInMonthForRate = (g.fullDates && g.fullDates.length > 0) ? SheetManagerHelpers.getSafeDaysInMonth(g.fullDates[0]) : 0;
            var dailyRateDisplay = SheetManagerHelpers.getExpectedDailyRateNoHomeroom(subTeacherInfo, daysInMonthForRate);
            // H 欄：請假人（逐筆、多行、需與 A/K/G/E/F/L/M 行數對應）
            var origDisplay = (g.originalTeachers || []).join('\n');
            var typeDisplay = (g.leaveTypes || []).map(function(t) { return t.replace(/\s*[\(（]/g, '\n(').replace(/[）\)]/g, ')'); }).join('\n');
            var reasonDisplay = (g.reasons || []).join('\n');

            // 逐筆明細（同一列多欄位同一格換行），若有 lineItems 就用逐筆；否則維持舊格式 fallback
            var noteDisplay = '';
            var dayLines = '';
            var periodLines = '';
            var amountLines = '';
            var homeroomDayLines = '';
            var homeroomFeeLines = '';

            if (g.lineItems && g.lineItems.length > 0) {
                // 依日期排序，確保 A/E/F/G/H/K/L/M 各欄位行對齊
                g.lineItems.sort(function(a, b) {
                    var da = String(a.date || '');
                    var db = String(b.date || '');
                    if (da < db) return -1;
                    if (da > db) return 1;
                    return String(a.leaveTeacherName || '').localeCompare(String(b.leaveTeacherName || ''));
                });

                dateDisplay = g.lineItems.map(function(x){ return String(x.dateMD || ''); }).join('\n');
                origDisplay = g.lineItems.map(function(x){ return String(x.leaveTeacherName || ''); }).join('\n');
                noteDisplay = g.lineItems.map(function(x){ return String(x.note || ''); }).join('\n');
                amountLines = g.lineItems.map(function(x){ return String(x.amountStr || '0'); }).join('\n');
                dayLines = g.lineItems.map(function(x){ return String(x.daysStr || '0'); }).join('\n');
                periodLines = g.lineItems.map(function(x){ return String(x.periodsStr || '0'); }).join('\n');
                homeroomDayLines = g.lineItems.map(function(x){ return String(x.homeroomDaysStr || '0'); }).join('\n');
                homeroomFeeLines = g.lineItems.map(function(x){ return String(x.homeroomFeeStr || '0'); }).join('\n');
            } else {
                // fallback：維持舊格式
                noteDisplay = (g.totalDays > 0 && g.totalPeriods === 0) ? (g.totalDays + "日") : (g.notes || []).join('\n');
                dayLines = String(g.totalDays || 0);
                periodLines = String(g.totalPeriods || 0);
                amountLines = String(g.hourlyTotal || 0);
                homeroomDayLines = String(g.homeroomDays || 0);
                homeroomFeeLines = String(g.homeroomFee || 0);
            }

            // 欄位維持原位置：A 日期、B 代課老師、E 天數、F 節數、G 金額、H 請假人、K 備註、L 代導日數、M 導師費
            rows.push([ dateDisplay, subName, salaryGradeDisplay, dailyRateDisplay, dayLines, periodLines, amountLines, origDisplay, typeDisplay, reasonDisplay, noteDisplay, homeroomDayLines, homeroomFeeLines, g.finalAmount, '', '', '', '', '' ]);
        }
        return rows;
    }

    function writeLedgerToSheet(summarySheet, rows, typeStr, rocYear, month, titlePrefix, options) {
        var startRow = 3;
        var dataCount = rows.length;
        var endRow = startRow + dataCount - 1;
        var sumDays = 0, sumPeriods = 0, sumHourly = 0, sumHDays = 0, sumHFee = 0, sumTotal = 0;
        rows.forEach(function(r) { sumDays += Number(r[4]) || 0; sumPeriods += Number(r[5]) || 0; sumHourly += Number(r[6]) || 0; sumHDays += Number(r[11]) || 0; sumHFee += Number(r[12]) || 0; sumTotal += Number(r[13]) || 0; });
        var title = titlePrefix + typeStr;
        summarySheet.getRange("A1").setValue(title);
        if (dataCount > 0) {
            if (dataCount > 1) summarySheet.insertRowsAfter(startRow, dataCount - 1);
            // getRange(row, column, numRows, numColumns)：第三參數是「列數」不是結束列號
            summarySheet.getRange(startRow, 1, dataCount, 19).setValues(rows);
            var rangeToFormat = summarySheet.getRange(startRow, 1, dataCount, 19);
            rangeToFormat.setBorder(true, true, true, true, true, true);
            summarySheet.getRange(startRow, 1, dataCount, 1).setNumberFormat("@");
            rangeToFormat.setVerticalAlignment("middle").setHorizontalAlignment("center");
            summarySheet.getRange(startRow, 1, dataCount, 2).setWrap(true);
            summarySheet.getRange(startRow, 8, dataCount, 4).setWrap(true);
            var totalRowIndex = startRow + dataCount;
            summarySheet.getRange(totalRowIndex, 1, 1, 19).setBorder(true, true, true, true, true, true);
            summarySheet.getRange(totalRowIndex, 1, 1, 2).merge().setValue("合計").setHorizontalAlignment("center");
            summarySheet.getRange(totalRowIndex, 5).setValue(sumDays);
            summarySheet.getRange(totalRowIndex, 6).setValue(sumPeriods);
            summarySheet.getRange(totalRowIndex, 7).setValue(sumHourly);
            summarySheet.getRange(totalRowIndex, 12).setValue(sumHDays);
            summarySheet.getRange(totalRowIndex, 13).setValue(sumHFee);
            summarySheet.getRange(totalRowIndex, 14).setValue(sumTotal);
            // 僅 E、F、G、H、K、L、M 欄（資料列 + 合計列）設 14 號字；其餘維持範本
            var ledgerFontRows = totalRowIndex - startRow + 1;
            summarySheet.getRange(startRow, 5, ledgerFontRows, 4).setFontSize(14); // E～H
            summarySheet.getRange(startRow, 11, ledgerFontRows, 1).setFontSize(14); // K 備註
            summarySheet.getRange(startRow, 12, ledgerFontRows, 2).setFontSize(14); // L～M
            var footerStartRow = totalRowIndex + 1;
            summarySheet.getRange(footerStartRow, 1).setValue("製表人：");
            summarySheet.getRange(footerStartRow, 8).setValue("勞保承辦：");
            summarySheet.getRange(footerStartRow, 14).setValue("校長：");
            summarySheet.getRange(footerStartRow + 3, 1).setValue("教務主任：");
            summarySheet.getRange(footerStartRow + 3, 8).setValue("人事主任：");
            summarySheet.getRange(footerStartRow + 6, 8).setValue("會計主任：");
            summarySheet.getRange(footerStartRow, 1, 10, 19).setFontWeight("bold").setFontSize(11);
            for (var rowIndex = startRow; rowIndex <= footerStartRow + 9; rowIndex++) {
                summarySheet.setRowHeight(rowIndex, Math.round(summarySheet.getRowHeight(rowIndex) * 1.25));
            }
            if (options && options.deleteExtraRows) {
                var maxRows = summarySheet.getMaxRows();
                if (maxRows > footerStartRow + 9) summarySheet.deleteRows(footerStartRow + 10, maxRows - footerStartRow - 9);
            }
        }
        return { sumTotal: sumTotal, title: title };
    }

    function addVoucherSheet(newSS, sumTotal, title, rocYear, month, year, sheetName) {
        if (!voucherTemplate) return;
        var voucherSheet = voucherTemplate.copyTo(newSS);
        voucherSheet.setName(sheetName || "黏貼憑證");
        var moneyStr = Math.round(Number(sumTotal) || 0).toString();
        var len = moneyStr.length;
        voucherSheet.getRange("J6:O6").clearContent();
        for (var i = 0; i < 6; i++) {
            var colIndex = 15 - i;
            var charIndex = len - 1 - i;
            if (charIndex >= 0) voucherSheet.getRange(6, colIndex).setValue(moneyStr.charAt(charIndex));
            else voucherSheet.getRange(6, colIndex).setValue("-");
        }
        voucherSheet.getRange("C6").setValue(title);
        voucherSheet.getRange("P6").setValue(title);
        voucherSheet.getRange("A22").setValue(title);
        voucherSheet.getRange("P22").setValue(title);
        voucherSheet.getRange("M22").setValue(Number(sumTotal) || 0);
        voucherSheet.getRange("H19").setValue(rocYear);
        voucherSheet.getRange("J19").setValue(month);
        var lastDay = new Date(year, month, 0).getDate();
        voucherSheet.getRange("L19").setValue(lastDay);
    }

    var monthsSeen = {};
    for (var sheetName in sheetsData) { var ym = sheetName.split('_')[0]; monthsSeen[ym] = true; }
    for (var ptaSheetName in ptaSheetsData) { var ym = ptaSheetName.split('_')[0]; monthsSeen[ym] = true; }
    var monthsList = Object.keys(monthsSeen).sort();

    for (var mi = 0; mi < monthsList.length; mi++) {
        var ym = monthsList[mi];
        var year = ym.split('-')[0];
        var month = ym.split('-')[1];
        var rocYear = parseInt(year) - 1911;
        var titlePrefix = "加昌國小" + rocYear + "年" + month + "月代課教師印領清冊~~【級科任教師】";
        var monthItems = [];
        for (var ti = 0; ti < typeOrder.length; ti++) {
            var typeRaw = typeOrder[ti];
            var sheetNameKey = ym + '_' + (typeRaw === '家長會' ? '家長會' : typeRaw);
            var groups = typeRaw === '家長會' ? ptaSheetsData[sheetNameKey] : sheetsData[sheetNameKey];
            if (!groups) continue;
            var rows = buildRowsFromGroups(groups, teacherMap);
            // 家長會清冊：只顯示應發金額 > 0 的教師（有實際支領家長會薪水者）
            if (typeRaw === '家長會') {
                rows = rows.filter(function(r) { return (Number(r[13]) || 0) > 0; });
            }
            if (rows.length === 0) continue;
            var needLedger = isLedgerSelected(typeRaw);
            var needVoucher = isVoucherSelected(typeRaw);
            if (!needLedger && !needVoucher) continue;
            monthItems.push({ typeRaw: typeRaw, typeStr: typeRaw === '家長會' ? '家長會' : typeRawToStr(typeRaw), rows: rows, isPta: typeRaw === '家長會', needLedger: needLedger, needVoucher: needVoucher });
        }
        if (monthItems.length === 0) continue;

        var yFolder = getOrCreateSubFolder(rootFolder, year);
        var mFolder = getOrCreateSubFolder(yFolder, month);
        var fileName = rocYear + "年" + month + "月_代課印領清冊";
        var existingFiles = mFolder.getFilesByName(fileName);
        while (existingFiles.hasNext()) { existingFiles.next().setTrashed(true); }
        var newSS = SpreadsheetApp.create(fileName);
        DriveApp.getFileById(newSS.getId()).moveTo(mFolder);
        generatedUrls.push(newSS.getUrl());

        for (var si = 0; si < monthItems.length; si++) {
            var item = monthItems[si];
            processedCount += item.rows.length;
            var ledgerInfo = null;
            if (item.needLedger) {
                var srcTemplate = item.isPta ? ptaTemplateSheet : templateSheet;
                var newSheet = srcTemplate.copyTo(newSS);
                newSheet.setName(item.typeStr);
                if (item.isPta) {
                    var ptaDaysInMonth = new Date(parseInt(year), parseInt(month), 0).getDate();
                    var ptaFeePerDay = Math.round(4000 / ptaDaysInMonth);
                    newSheet.getRange("D2").setValue("日薪\n(" + ptaDaysInMonth + "日)");
                    var m2Text = "導師費(" + parseInt(month) + "月" + ptaFeePerDay + "元/日)";
                    var m2Rich = SpreadsheetApp.newRichTextValue().setText(m2Text)
                        .setTextStyle(0, 3, SpreadsheetApp.newTextStyle().setFontSize(14).build())
                        .setTextStyle(3, m2Text.length, SpreadsheetApp.newTextStyle().setFontSize(10).build())
                        .build();
                    newSheet.getRange("M2").setRichTextValue(m2Rich);
                    ledgerInfo = writeLedgerToSheet(newSheet, item.rows, '公假家長會', rocYear, month, titlePrefix, { deleteExtraRows: true });
                } else {
                    ledgerInfo = writeLedgerToSheet(newSheet, item.rows, item.typeStr, rocYear, month, titlePrefix, {});
                }
            } else {
                // Only voucher requested — still need title and sumTotal
                var sumTotal = 0;
                item.rows.forEach(function(r) { sumTotal += Number(r[13]) || 0; });
                var title = item.isPta ? (titlePrefix + '公假家長會') : (titlePrefix + item.typeStr);
                ledgerInfo = { sumTotal: sumTotal, title: title };
            }
            if (item.needVoucher) {
                var voucherName = (item.isPta ? '家長會' : item.typeStr) + '_憑證';
                addVoucherSheet(newSS, ledgerInfo.sumTotal, ledgerInfo.title, rocYear, month, year, voucherName);
            }
        }

        var sheets = newSS.getSheets();
        for (var si = 0; si < sheets.length; si++) {
            if (sheets[si].getName() === '工作表1' || sheets[si].getName() === 'Sheet1') {
                newSS.deleteSheet(sheets[si]);
                break;
            }
        }
    }
    return { count: processedCount, urls: generatedUrls };
  },

  _formatDateRanges: function(dateStrings) {
      if (!dateStrings || dateStrings.length === 0) return "";
      var sorted = dateStrings.sort();
      var ranges = [];
      var start = sorted[0];
      var end = sorted[0];
      
      for (var i = 1; i < sorted.length; i++) {
          var current = sorted[i];
          var prev = end;
          var dCurrent = parseDateString(current);
          var dPrev = parseDateString(prev);
          var diffTime = Math.abs(dCurrent - dPrev);
          var diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
          
          if (diffDays === 1) {
              end = current;
          } else {
              ranges.push(this._formatRange(start, end));
              start = current;
              end = current;
          }
      }
      ranges.push(this._formatRange(start, end));
      return ranges.join('\n');
  },

  _formatRange: function(start, end) {
      var s = start.substring(5).replace('-', '/');
      if (start === end) return s;
      var e = end.substring(5).replace('-', '/');
      return s + '-' + e;
  },

  /**
   * 在既有試算表中加入「黏貼憑證」工作表（複製憑證範本並填入金額、標題、日期）
   */
  addVoucherSheetToSpreadsheet: function(newSS, sumTotal, title, rocYear, month, year) {
    var ss = getSpreadsheet();
    var voucherTemplate = ss.getSheetByName(CONFIG.VOUCHER_TEMPLATE_SHEET_NAME || '憑證範本');
    if (!voucherTemplate) return;
    var voucherSheet = voucherTemplate.copyTo(newSS);
    voucherSheet.setName("黏貼憑證");
    var moneyStr = Math.round(Number(sumTotal) || 0).toString();
    var len = moneyStr.length;
    voucherSheet.getRange("J6:O6").clearContent();
    for (var i = 0; i < 6; i++) {
      var colIndex = 15 - i;
      var charIndex = len - 1 - i;
      if (charIndex >= 0) voucherSheet.getRange(6, colIndex).setValue(moneyStr.charAt(charIndex));
      else voucherSheet.getRange(6, colIndex).setValue("-");
    }
    voucherSheet.getRange("C6").setValue(title);
    voucherSheet.getRange("P6").setValue(title);
    voucherSheet.getRange("A22").setValue(title);
    voucherSheet.getRange("P22").setValue(title);
    voucherSheet.getRange("M22").setValue(Number(sumTotal) || 0);
    voucherSheet.getRange("H19").setValue(rocYear);
    voucherSheet.getRange("J19").setValue(month);
    var lastDay = new Date(year, month, 0).getDate();
    voucherSheet.getRange("L19").setValue(lastDay);
  },

  /**
   * 產生「額外憑證」：僅含黏貼憑證工作表的試算表（用於未預期的其他憑證）
   */
  generateExtraVoucher: function(title, amount, year, month) {
    year = year || new Date().getFullYear();
    month = month || new Date().getMonth() + 1;
    var rocYear = year - 1911;
    var rocStr = rocYear + "年" + month + "月";
    var fileName = "額外憑證_" + rocStr + "_" + (title || "未命名").substring(0, 20);
    var rootId = CONFIG.OUTPUT_FOLDER_ID;
    var rootFolder = rootId ? DriveApp.getFolderById(rootId) : DriveApp.getRootFolder();
    var yearFolder = getOrCreateSubFolder(rootFolder, year + '年');
    var monthFolder = getOrCreateSubFolder(yearFolder, month + '月');
    var newSS = SpreadsheetApp.create(fileName);
    var newFile = DriveApp.getFileById(newSS.getId());
    newFile.moveTo(monthFolder);
    var defaultSheet = newSS.getSheets()[0];
    SheetManager.addVoucherSheetToSpreadsheet(newSS, amount, title || rocStr + " 額外憑證", rocYear, month, year);
    newSS.deleteSheet(defaultSheet);
    SpreadsheetApp.flush();
    return { url: newSS.getUrl() };
  }
};

var SheetManagerHelpers = {
    getSafeSheetName: function(dateStr, leaveType) {
        return getMonthSheetName(dateStr, leaveType);
    },
    getSafeDaysInMonth: function(dateStr) {
        return getDaysInMonth(dateStr);
    },
    formatDateRanges: function(dates) {
        return SheetManager._formatDateRanges(dates);
    },
    // D 欄（日薪）：依前端 DAILY_RATE_TABLE 規則，用薪級表推算（不含導師費）
    getExpectedDailyRateNoHomeroom: function(teacher, daysInMonth) {
        if (!teacher || !teacher.salaryPoints || !daysInMonth) return '';

        // 與 utils/calculations.ts DAILY_RATE_TABLE 保持一致
        var DAILY_RATE_TABLE = {
            "170": { 31: 1354, 30: 1399, 29: 1448, 28: 1499 },
            "180無教證": { 31: 1379, 30: 1425, 29: 1474, 28: 1527 },
            "190": { 31: 1553, 30: 1604, 29: 1660, 28: 1719 },
            "245無教證": { 31: 1630, 30: 1684, 29: 1742, 28: 1804 },
            "245有教證": { 31: 1801, 30: 1861, 29: 1925, 28: 1994 },
            "625有教證": { 31: 2901, 30: 2998, 29: 3101, 28: 3212 },
            "650有教證": { 31: 2951, 30: 3049, 29: 3154, 28: 3267 },
            "編制內教師": { 31: 405, 30: 405, 29: 405, 28: 405 },
            "退休教師": { 31: 405, 30: 405, 29: 405, 28: 405 },
            "180有教證": { 31: 1528, 30: 1579, 29: 1633, 28: 1692 }
        };

        var points = Number(teacher.salaryPoints) || 0;
        if (!points) return '';
        var key = String(points);
        if (points === 180 || points === 245 || points === 625 || points === 650) {
            key += (teacher.hasCertificate ? '有教證' : '無教證');
        }

        var rates = DAILY_RATE_TABLE[key];
        if (!rates) return '';
        var rate = rates[Number(daysInMonth)];
        if (!rate) return '';
        return rate;
    }
};
