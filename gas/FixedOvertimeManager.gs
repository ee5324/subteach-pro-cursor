
// gas/FixedOvertimeManager.gs
// 處理 "固定兼課" 相關邏輯 (Fixed Overtime Only)
// 核心邏輯：計算當月週一、週二...的實際天數 (需扣除學期外日期)，並依此計算總金額

var FixedOvertimeManager = {
  
  // 1. 儲存設定
  saveConfig: function(configList) {
    if (!configList) return;
    
    var ss = getSpreadsheet();
    var sheetName = '固定兼課設定';
    var sheet = ss.getSheetByName(sheetName);
    
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
    }
    
    sheet.clear();
    var headers = ['TeacherID', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Adjustment', 'Reason', 'IgnoredEventIds', 'ScheduleSlots'];
    sheet.appendRow(headers);
    
    if (configList.length > 0) {
      var rows = configList.map(function(c) {
        return [
            c.teacherId, 
            c.periods[0], c.periods[1], c.periods[2], c.periods[3], c.periods[4],
            c.adjustment || 0,
            c.adjustmentReason || '',
            c.ignoredEventIds ? JSON.stringify(c.ignoredEventIds) : '[]',
            c.scheduleSlots ? JSON.stringify(c.scheduleSlots) : '[]'
        ];
      });
      sheet.getRange(2, 1, rows.length, 10).setValues(rows);
    }
  },

  // 2. 讀取設定
  getConfig: function() {
    var ss = getSpreadsheet();
    var sheetName = '固定兼課設定';
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) return [];
    
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];
    
    var lastCol = sheet.getLastColumn();
    var colsToRead = lastCol < 10 ? lastCol : 10;
    var data = sheet.getRange(2, 1, lastRow - 1, colsToRead).getValues();
    
    return data.map(function(row) {
      var ignored = [];
      try { if (row[8]) ignored = JSON.parse(row[8]); } catch(e) { ignored = []; }
      var slots = [];
      try { if (row[9]) slots = JSON.parse(row[9]); } catch(e) { slots = []; }

      return {
        teacherId: String(row[0]),
        periods: [Number(row[1]), Number(row[2]), Number(row[3]), Number(row[4]), Number(row[5])],
        adjustment: Number(row[6]) || 0,
        adjustmentReason: String(row[7]) || '',
        ignoredEventIds: ignored,
        scheduleSlots: slots
      };
    });
  },

  // 3. 產生固定兼課報表 (Daily Based)，含固定兼課教師與當月協助代課教師
  generateReport: function(year, month, reportData, semesterStart, semesterEnd, docNumber, targetTemplateName, holidays, substituteTeachers) {
    var rocYear = year - 1911;
    var rocDateStr = rocYear + "年" + month + "月";
    var fileName = rocDateStr + "_固定兼課印領清冊";
    
    var templateName = targetTemplateName || CONFIG.FIXED_OVERTIME_TEMPLATE_NAME || '固定兼課清冊範本';
    
    try {
        var ss = getSpreadsheet();
        var templateSheet = ss.getSheetByName(templateName);
        if (!templateSheet) throw new Error("找不到範本工作表：" + templateName);
        
        // 1. 準備資料夾
        var rootId = CONFIG.OUTPUT_FOLDER_ID;
        var rootFolder = rootId ? DriveApp.getFolderById(rootId) : DriveApp.getRootFolder();
        var yearFolder = getOrCreateSubFolder(rootFolder, year + '年');
        var monthFolder = getOrCreateSubFolder(yearFolder, month + '月');
        
        // 2. 刪除舊檔
        var existingFiles = monthFolder.getFilesByName(fileName);
        while (existingFiles.hasNext()) { existingFiles.next().setTrashed(true); }

        // 3. 建立新檔
        var newSS = SpreadsheetApp.create(fileName);
        var newFile = DriveApp.getFileById(newSS.getId());
        newFile.moveTo(monthFolder);
        
        var sheet = templateSheet.copyTo(newSS);
        sheet.setName("印領清冊");
        var defaultSheet = newSS.getSheets()[0];
        if (defaultSheet.getName() !== "印領清冊") newSS.deleteSheet(defaultSheet);

        var lastDay = new Date(year, month, 0).getDate();

        // --- 表頭設定 ---
        // Title Update (A1)
        var titleCell = sheet.getRange("A1");
        var title = titleCell.getValue();
        // 替換範本中的佔位符
        title = title.replace(/000年00月/, rocDateStr);
        title = title.replace(/(\d+)年(\d+)月/, rocDateStr); 
        titleCell.setValue(title);

        // A3: 計算區間
        var rangeText = "計算區間： " + month + "/1 - " + month + "/" + lastDay;
        // 如果有設定學期開始日且在當月，提示使用者
        if (semesterStart) {
            var sDate = parseDateString(semesterStart);
            if (sDate.getFullYear() == year && (sDate.getMonth() + 1) == month) {
                rangeText += " (學期開始: " + (sDate.getMonth()+1) + "/" + sDate.getDate() + ")";
            }
        }
        sheet.getRange("A3").setValue(rangeText);
        
        // 新增：公文文號 (I3)
        if (docNumber) {
            sheet.getRange("I3").setValue("公文文號：" + docNumber);
        }
        
        // --- 計算天數 (核心) ---
        // 必須傳入 semesterStart/End 以過濾非學期日
        var dayCounts = this._getMonthlyWeekdayCounts(year, month, semesterStart, semesterEnd, holidays);
        
        // --- 填寫資料（固定兼課教師 + 協助代課教師）---
        this._fillFixedOvertimeReport(sheet, reportData, dayCounts, substituteTeachers || []);

        // --- 黏貼憑證（總額含固定兼課與協助代課）---
        var sumTotal = 0;
        if (reportData && reportData.length > 0) {
            reportData.forEach(function(item) { sumTotal += Number(item.pay) || 0; });
        }
        if (substituteTeachers && substituteTeachers.length > 0) {
            substituteTeachers.forEach(function(item) { sumTotal += Number(item.pay) || 0; });
        }
        if (typeof SheetManager === 'undefined') {
            throw new Error('SheetManager 未定義。請在 GAS 專案中確認已加入「SheetManager.gs」檔案並重新部署。');
        }
        SheetManager.addVoucherSheetToSpreadsheet(newSS, sumTotal, title, rocYear, month, year);

        SpreadsheetApp.flush();
        return { url: newSS.getUrl(), success: true };

    } catch (e) {
        throw new Error("固定兼課報表產生失敗: " + e.toString());
    }
  },

  // 內部函式：填寫資料（reportData = 固定兼課教師，substituteTeachers = 當月協助代課教師）
  _fillFixedOvertimeReport: function(sheet, reportData, dayCounts, substituteTeachers) {
      substituteTeachers = substituteTeachers || [];
      var weekDays = ['一', '二', '三', '四', '五'];
      
      for (var i = 0; i < 5; i++) {
          sheet.getRange(5, 3 + i).setValue(weekDays[i] + "\n(" + dayCounts[i] + "次)");
      }
      sheet.getRange(5, 8).setValue("小計");

      var startRow = 6;
      var rowsData = [];

      reportData.forEach(function(item) {
          var periods = item.overtimePattern || [0,0,0,0,0];
          var r = startRow + rowsData.length;
          var calcParts = [];
          var cols = ['C', 'D', 'E', 'F', 'G'];
          for(var i=0; i<5; i++) {
              calcParts.push(cols[i] + r + "*" + dayCounts[i]);
          }
          var grossFormula = "=" + calcParts.join("+");
          var netFormula = "=I" + r + "+J" + r;
          var amountFormula = "=ROUND(K" + r + "*405, 0)";

          // J 欄「本次增減」須含活動扣除、請假扣除（與憑證一致），前端傳入 item.adjustment = 手動 - 活動扣除 - 請假扣除
          var netAdjustment = (item.adjustment != null && item.adjustment !== '') ? Number(item.adjustment) : (item.manualAdjustment || 0);

          var row = [
              item.teacherName,
              "固定兼課教師",
              periods[0], periods[1], periods[2], periods[3], periods[4],
              "=SUM(C"+r+":G"+r+")",
              grossFormula,
              netAdjustment,
              netFormula,
              405,
              amountFormula,
              '', '', '', '',
              item.adjustmentReason,
              ''
          ];
          rowsData.push(row);
      });

      // 協助代課教師列（職別「代課」、節數與金額）
      substituteTeachers.forEach(function(item) {
          var r = startRow + rowsData.length;
          var sessions = Number(item.substituteSessions) || 0;
          var pay = Number(item.pay) || 0;
          var detailStr = (item.substituteDetails && item.substituteDetails.length) ? item.substituteDetails.join('；') : '';
          var row = [
              item.teacherName,    // A: 姓名
              "代課",              // B: 職別
              0, 0, 0, 0, 0,      // C~G: 週一～五留 0
              sessions,            // H: 小計（代課節數）
              0,                  // I: 本次應上節數
              0,                  // J: 本次增減
              sessions,            // K: 本次實際
              405,                 // L: 鐘點費
              pay,                 // M: 本次金額（數字，納入合計）
              '', '', '', '',
              detailStr,           // R: 備註（代課明細）
              ''
          ];
          rowsData.push(row);
      });

      if (rowsData.length > 0) {
          var numCols = rowsData[0].length;
          var range = sheet.getRange(startRow, 1, rowsData.length, numCols);
          range.setValues(rowsData);
          
          range.setHorizontalAlignment("center").setVerticalAlignment("middle")
               .setBorder(true, true, true, true, true, true).setFontSize(11);
          
          // 格式化金額
          sheet.getRange(startRow, 13, rowsData.length, 1).setNumberFormat("#,##0"); 
          // 備註自動換行
          sheet.getRange(startRow, 18, rowsData.length, 1).setWrap(true).setFontSize(9); 
      }

      // Total Row
      var totalRow = startRow + rowsData.length;
      sheet.getRange(totalRow, 1).setValue("合計");
      
      // Sum Amounts (M欄 = Index 13)
      var colLetter = 'M';
      var formula = "=SUM(" + colLetter + startRow + ":" + colLetter + (totalRow-1) + ")";
      sheet.getRange(totalRow, 13).setFormula(formula).setNumberFormat("#,##0");
      
      sheet.getRange(totalRow, 1, 1, 19).setFontWeight("bold").setBorder(true, true, true, true, true, true);
      
      // 簽核區 (根據截圖位置約略調整)
      var signRow = totalRow + 2;
      sheet.getRange(signRow, 1).setValue("製表：");
      sheet.getRange(signRow, 5).setValue("教務主任：");
      sheet.getRange(signRow, 9).setValue("稅款代扣：");
      sheet.getRange(signRow, 13).setValue("人事主任：");
      sheet.getRange(signRow, 16).setValue("會計主任：");
      sheet.getRange(signRow + 2, 16).setValue("校長：");

      // 清冊列高放大為原本約 1.25 倍，讓行距更舒適
      this._scaleRowHeights(sheet, 5, signRow + 2, 1.25);
  },

  // 計算該月份 週一~週五 各有幾天 (扣除假日 & 學期外)
  // 重要：此處實作學期日期過濾
  _getMonthlyWeekdayCounts: function(year, month, semesterStartStr, semesterEndStr, passedHolidays) {
      // 優先使用前端傳入的 holidays，若無則回退到 SheetManager 讀取
      var holidays = passedHolidays || SheetManager.getHolidays(); // ['YYYY-MM-DD', ...]
      var daysInMonth = new Date(year, month, 0).getDate();
      
      // 解析學期邊界 (設定時間為中午 12:00 以避免時區問題)
      var semStart = semesterStartStr ? parseDateString(semesterStartStr) : null;
      var semEnd = semesterEndStr ? parseDateString(semesterEndStr) : null;

      var counts = [0, 0, 0, 0, 0];
      
      for (var d = 1; d <= daysInMonth; d++) {
          var dateStr = year + '-' + ('0' + month).slice(-2) + '-' + ('0' + d).slice(-2);
          // 注意：Month 0-indexed
          var dateObj = new Date(year, month - 1, d, 12, 0, 0); 
          var dayOfWeek = dateObj.getDay(); // 0=Sun, 1=Mon...
          
          var isWorking = true;
          
          // 1. 檢查學期開始 (例如: 2/1 < 2/23 -> 排除)
          if (semStart && dateObj < semStart) isWorking = false;
          
          // 2. 檢查學期結束
          if (semEnd && dateObj > semEnd) isWorking = false;
          
          // 3. 檢查國定假日
          if (holidays.indexOf(dateStr) > -1) isWorking = false;
          
          if (dayOfWeek >= 1 && dayOfWeek <= 5 && isWorking) {
              counts[dayOfWeek - 1]++;
          }
      }
      return counts;
  },

  _scaleRowHeights: function(sheet, startRow, endRow, factor) {
      for (var row = startRow; row <= endRow; row++) {
          var currentHeight = sheet.getRowHeight(row);
          sheet.setRowHeight(row, Math.round(currentHeight * factor));
      }
  }
};
