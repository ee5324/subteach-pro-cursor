
// gas/OvertimeManager.gs
// 處理 "超鐘點" 相關邏輯 (Overtime Only)
// 核心邏輯：計算該月週次結構，需排除學期外的日期

var OvertimeManager = {

  // 1. 產生超鐘點報表 (Weekly Based)
  generateReport: function(year, month, reportData, semesterStart, semesterEnd, docNumber, targetTemplateName, holidays) {
    var rocYear = year - 1911;
    var rocDateStr = rocYear + "年" + month + "月";
    var fileName = rocDateStr + "_超鐘點印領清冊";
    
    var templateName = targetTemplateName || CONFIG.OVERTIME_TEMPLATE_NAME || '超鐘點清冊範例';
    
    try {
        var ss = getSpreadsheet();
        var templateSheet = ss.getSheetByName(templateName);
        if (!templateSheet) throw new Error("找不到範本工作表：" + templateName);
        
        var rootId = CONFIG.OUTPUT_FOLDER_ID;
        var rootFolder = rootId ? DriveApp.getFolderById(rootId) : DriveApp.getRootFolder();
        var yearFolder = getOrCreateSubFolder(rootFolder, year + '年');
        var monthFolder = getOrCreateSubFolder(yearFolder, month + '月');
        
        var existingFiles = monthFolder.getFilesByName(fileName);
        while (existingFiles.hasNext()) { existingFiles.next().setTrashed(true); }

        var newSS = SpreadsheetApp.create(fileName);
        var newFile = DriveApp.getFileById(newSS.getId());
        newFile.moveTo(monthFolder);
        
        var sheet = templateSheet.copyTo(newSS);
        sheet.setName("印領清冊");
        var defaultSheet = newSS.getSheets()[0];
        if (defaultSheet.getName() !== "印領清冊") newSS.deleteSheet(defaultSheet);

        var lastDay = new Date(year, month, 0).getDate();

        // --- 計算週次結構 (需過濾學期) ---
        var weeklyStructure = this._getMonthlyWeeksStructure(year, month, semesterStart, semesterEnd, holidays);
        
        // --- 填寫表頭 ---
        // N1: OOO年OO月 (ROC)
        sheet.getRange("N1").setValue(rocDateStr);
        
        sheet.getRange("A2").setValue("計算區間： " + month + "/1 - " + month + "/" + lastDay);
        if (docNumber) sheet.getRange("E2").setValue("公文文號：" + docNumber);
        
        // --- 填寫資料 ---
        this._fillOvertimeReport(sheet, reportData, weeklyStructure);

        // --- 黏貼憑證（與代課清冊相同邏輯）---
        SpreadsheetApp.flush();
        var totalRow = sheet.getLastRow();
        var sumTotal = sheet.getRange(totalRow, 14).getValue() || 0; // N 欄為金額合計
        var title = "加昌國小" + rocDateStr + "超鐘點印領清冊";
        if (typeof SheetManager === 'undefined') {
            throw new Error('SheetManager 未定義。請在 GAS 專案中確認已加入「SheetManager.gs」檔案並重新部署。');
        }
        SheetManager.addVoucherSheetToSpreadsheet(newSS, sumTotal, title, rocYear, month, year);

        SpreadsheetApp.flush();
        return { url: newSS.getUrl(), success: true };

    } catch (e) {
        throw new Error("超鐘點報表產生失敗: " + e.toString());
    }
  },

  // 內部函式：填寫「超鐘點」報表
  _fillOvertimeReport: function(sheet, reportData, weeklyStructure) {
      
      // --- 1. 職稱排序 (主任 > 組長 > 導師 > 科任) ---
      reportData.sort(function(a, b) {
          function getRank(title) {
              if (!title) return 5;
              // 簡單關鍵字判斷職等
              if (title.indexOf('主任') > -1) return 1;
              if (title.indexOf('組長') > -1) return 2;
              if (title.indexOf('導師') > -1) return 3;
              if (title.indexOf('科任') > -1 || title.indexOf('教師') > -1 || title.indexOf('專任') > -1) return 4;
              return 5; // 其他
          }
          var rankA = getRank(a.jobTitle);
          var rankB = getRank(b.jobTitle);
          if (rankA !== rankB) return rankA - rankB;
          
          // 若職等相同，依姓名排序 (中文排序可能不準確，僅做輔助)
          return (a.teacherName || '').localeCompare(b.teacherName || '');
      });

      // H4-L4: 週次區間
      sheet.getRange("H4:L4").clearContent(); 
      weeklyStructure.slice(0, 5).forEach(function(week, idx) {
          var colIndex = 8 + idx; // H starts at 8
          sheet.getRange(4, colIndex).setValue(week.label).setHorizontalAlignment("center");
      });

      var startRow = 6;
      var rowsData = [];

      reportData.forEach(function(item) {
          var weeklyCounts = [];
          for (var w = 0; w < 5; w++) {
              var count = null;
              var week = weeklyStructure[w];
              if (week) {
                  var val = 0;
                  if (item.isSimpleMode) {
                      // 簡單模式：只要該週有任何「有效工作日」，就算一週
                      if (week.hasDays) val = item.weeklyOvertime;
                  } else {
                      // 精確模式：依照當週實際有效天數計算
                      for (var d = 0; d < 5; d++) {
                          if (week.days[d] === 1) val += (item.overtimePattern[d] || 0);
                      }
                  }
                  count = val;
              }
              weeklyCounts.push(count);
          }

          var adjustment = item.adjustment || 0;
          // 將調整值加到最後一個有效週次
          for(var i = weeklyCounts.length-1; i>=0; i--) {
              if (weeklyCounts[i] !== null) {
                  weeklyCounts[i] += adjustment;
                  break;
              }
          }

          var currentRowNum = startRow + rowsData.length; 
          var totalColFormula = "=SUM(H" + currentRowNum + ":L" + currentRowNum + ")";
          var amountFormula = "=ROUND(M" + currentRowNum + "*405, 0)";

          var row = [
              item.jobTitle,       // A
              item.teacherName,    // B
              item.standard,       // C
              item.weeklyActual,   // D
              item.adminReduction, // E
              item.weeklyOvertime, // F
              ''                   // G
          ];
          row = row.concat(weeklyCounts); // H-L
          row.push(totalColFormula); // M
          row.push(amountFormula);   // N
          row.push(item.slotDetail); // O
          row.push(item.reductionDetail); // P

          rowsData.push(row);
      });

      if (rowsData.length > 0) {
          var numCols = rowsData[0].length;
          var range = sheet.getRange(startRow, 1, rowsData.length, numCols);
          range.setValues(rowsData);
          range.setHorizontalAlignment("center").setVerticalAlignment("middle")
               .setBorder(true, true, true, true, true, true).setFontSize(11);
          sheet.getRange(startRow, 14, rowsData.length, 1).setNumberFormat("#,##0"); // Amount
          sheet.getRange(startRow, 15, rowsData.length, 2).setWrap(true).setFontSize(9); // Details
      }

      // Total Row
      var totalRow = startRow + rowsData.length;
      sheet.getRange(totalRow, 1).setValue("合計");
      for (var col = 8; col <= 14; col++) { // H to N
          var colLetter = this._colIndexToLetter(col);
          var formula = "=SUM(" + colLetter + startRow + ":" + colLetter + (totalRow - 1) + ")";
          sheet.getRange(totalRow, col).setFormula(formula).setNumberFormat(col === 14 ? "#,##0" : "0");
      }
      sheet.getRange(totalRow, 1, 1, 16).setFontWeight("bold").setBorder(true, true, true, true, true, true);

      // --- 2. 核章區 (修正版面配置) ---
      var signRow = totalRow + 2; // 與合計列保持 1 行間隔
      
      // 第一列
      sheet.getRange(signRow, 1).setValue("製表人：");    // A
      sheet.getRange(signRow, 5).setValue("教務主任：");  // E
      sheet.getRange(signRow, 9).setValue("稅款代扣：");  // I
      sheet.getRange(signRow, 14).setValue("校長：");     // N (置於右側)
      
      // 第二列 (與第一列保持 2 行間隔，以便蓋章)
      var nextSignRow = signRow + 3;
      sheet.getRange(nextSignRow, 5).setValue("人事主任："); // E (對齊教務主任)
      sheet.getRange(nextSignRow, 9).setValue("會計主任："); // I (對齊稅款代扣)
      
      // 設定字體樣式
      sheet.getRange(signRow, 1, 4, 15).setFontWeight("bold").setFontSize(11);

      // 清冊列高放大為原本約 1.25 倍，讓行距更舒適
      this._scaleRowHeights(sheet, 4, nextSignRow, 1.25);
  },

  /**
   * 計算該月份的週次結構 (需過濾學期)
   */
  _getMonthlyWeeksStructure: function(year, month, semesterStartStr, semesterEndStr, passedHolidays) {
      var holidays = passedHolidays || SheetManager.getHolidays();
      var daysInMonth = new Date(year, month, 0).getDate();
      
      var semStart = semesterStartStr ? parseDateString(semesterStartStr) : null;
      var semEnd = semesterEndStr ? parseDateString(semesterEndStr) : null;

      var weeks = [];
      var currentWeekDays = [0, 0, 0, 0, 0]; // Mon..Fri flags
      var hasDaysInWeek = false; // 該週是否有任何有效工作日
      var rangeStart = -1;
      
      for (var d = 1; d <= daysInMonth; d++) {
          var dateStr = year + '-' + ('0' + month).slice(-2) + '-' + ('0' + d).slice(-2);
          var dateObj = new Date(year, month - 1, d, 12, 0, 0);
          var dayOfWeek = dateObj.getDay(); 
          
          var isWorking = true;
          // 學期檢查
          if (semStart && dateObj < semStart) isWorking = false;
          if (semEnd && dateObj > semEnd) isWorking = false;
          // 假日檢查
          if (holidays.indexOf(dateStr) > -1) isWorking = false;
          
          if (dayOfWeek >= 1 && dayOfWeek <= 5) {
              if (rangeStart === -1) rangeStart = d;
              if (isWorking) {
                  currentWeekDays[dayOfWeek - 1] = 1;
                  hasDaysInWeek = true;
              }
          }

          // 週六或月底結算當週
          if (dayOfWeek === 6 || d === daysInMonth) {
              if (rangeStart !== -1) {
                  var rangeEnd = d;
                  if (dayOfWeek === 6) rangeEnd = d - 1; // 回推到週五
                  if (dayOfWeek === 0) rangeEnd = d - 2;
                  if (rangeEnd > daysInMonth) rangeEnd = daysInMonth;
                  
                  // 只要該週有「被記錄為當月」的日期範圍，即使沒有有效上課日(例如整週寒假)，
                  // 也應該產生結構，但在 hasDaysInWeek 會標記為 false
                  var label = (Number(month)) + "/" + rangeStart + "-" + (Number(month)) + "/" + rangeEnd;
                  weeks.push({ 
                      label: label, 
                      days: currentWeekDays, 
                      hasDays: hasDaysInWeek 
                  });
              }
              currentWeekDays = [0, 0, 0, 0, 0];
              hasDaysInWeek = false;
              rangeStart = -1;
          }
      }
      return weeks;
  },

  _colIndexToLetter: function(colIndex) {
    var temp, letter = '';
    while (colIndex > 0) {
      temp = (colIndex - 1) % 26;
      letter = String.fromCharCode(temp + 65) + letter;
      colIndex = (colIndex - temp - 1) / 26;
    }
    return letter;
  },

  _scaleRowHeights: function(sheet, startRow, endRow, factor) {
    for (var row = startRow; row <= endRow; row++) {
      var currentHeight = sheet.getRowHeight(row);
      sheet.setRowHeight(row, Math.round(currentHeight * factor));
    }
  }
};
