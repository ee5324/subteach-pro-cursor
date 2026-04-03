
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
        periods: [parseNumberish(row[1], 0), parseNumberish(row[2], 0), parseNumberish(row[3], 0), parseNumberish(row[4], 0), parseNumberish(row[5], 0)],
        adjustment: parseNumberish(row[6], 0),
        adjustmentReason: String(row[7]) || '',
        ignoredEventIds: ignored,
        scheduleSlots: slots
      };
    });
  },

  // 3. 產生固定兼課報表 (Daily Based)，含固定兼課教師與當月協助代課教師
  // formatOptions（可選）：templateSheetName、useIndigenousTemplateLayout、fileNameSuffix、identityLabel、sheetTitleText、voucherTitle、replaceTitlePhraseFrom/To
  generateReport: function(year, month, reportData, semesterStart, semesterEnd, docNumber, targetTemplateName, holidays, substituteTeachers, formatOptions) {
    formatOptions = formatOptions || {};
    var rocYear = year - 1911;
    var rocDateStr = rocYear + "年" + month + "月";
    var fileName = rocDateStr + (formatOptions.fileNameSuffix || "_固定兼課印領清冊");
    
    var templateName = targetTemplateName
      || (formatOptions.templateSheetName ? String(formatOptions.templateSheetName) : '')
      || CONFIG.FIXED_OVERTIME_TEMPLATE_NAME
      || '固定兼課清冊範本';
    
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
        var title;
        if (formatOptions.sheetTitleText) {
          title = String(formatOptions.sheetTitleText);
        } else {
          title = String(titleCell.getValue());
          title = title.replace(/000年00月/, rocDateStr);
          title = title.replace(/(\d+)年(\d+)月/, rocDateStr);
          if (formatOptions.replaceTitlePhraseFrom) {
            var fromP = String(formatOptions.replaceTitlePhraseFrom);
            var toP = String(formatOptions.replaceTitlePhraseTo || '');
            title = title.split(fromP).join(toP);
          }
        }
        // 族語專職超鐘點清冊：標題固定為民國年月 + 指定用語（與範本西元或占位無關）
        if (formatOptions.useIndigenousTemplateLayout && !formatOptions.sheetTitleText) {
          title = rocDateStr + '民族語專職老師「國中」超鐘點費印領清冊';
        }
        titleCell.setValue(title);
        var voucherTitle = formatOptions.voucherTitle ? String(formatOptions.voucherTitle) : title;

        // 計算區間本體（族語清冊範本 B2 已含「計算區間：」字樣，僅寫入日期區段）
        var rangeCore = month + "/1 - " + month + "/" + lastDay;
        if (semesterStart) {
            var sDate = parseDateString(semesterStart);
            if (sDate.getFullYear() == year && (sDate.getMonth() + 1) == month) {
                rangeCore += " (學期開始: " + (sDate.getMonth()+1) + "/" + sDate.getDate() + ")";
            }
        }
        if (formatOptions.useIndigenousTemplateLayout) {
          sheet.getRange("B2").setValue(rangeCore);
        } else {
          sheet.getRange("A3").setValue("計算區間： " + rangeCore);
        }
        
        // 新增：公文文號 (I3)
        if (docNumber) {
            sheet.getRange("I3").setValue("公文文號：" + docNumber);
        }
        
        // --- 計算天數 (核心) ---
        // 必須傳入 semesterStart/End 以過濾非學期日
        var dayCounts = this._getMonthlyWeekdayCounts(year, month, semesterStart, semesterEnd, holidays);
        
        // --- 填寫資料（固定兼課教師 + 協助代課教師）---
        this._fillFixedOvertimeReport(sheet, reportData, dayCounts, substituteTeachers || [], formatOptions);

        // --- 黏貼憑證（總額含固定兼課與協助代課）---
        var sumTotal = 0;
        if (reportData && reportData.length > 0) {
            reportData.forEach(function(item) { sumTotal += parseNumberish(item.pay, 0); });
        }
        if (substituteTeachers && substituteTeachers.length > 0) {
            substituteTeachers.forEach(function(item) { sumTotal += parseNumberish(item.pay, 0); });
        }
        if (typeof SheetManager === 'undefined') {
            throw new Error('SheetManager 未定義。請在 GAS 專案中確認已加入「SheetManager.gs」檔案並重新部署。');
        }
        SheetManager.addVoucherSheetToSpreadsheet(newSS, sumTotal, voucherTitle, rocYear, month, year);

        SpreadsheetApp.flush();
        return { url: newSS.getUrl(), success: true };

    } catch (e) {
        throw new Error("固定兼課報表產生失敗: " + e.toString());
    }
  },

  // 內部函式：填寫資料（reportData = 固定兼課教師，substituteTeachers = 當月協助代課教師）
  // item.payablePeriods：若提供，則 I 欄為「週節數×當月平日次數」加總數字，J = payablePeriods - I（與族語專職超鐘點等淨節數對齊）
  _fillFixedOvertimeReport: function(sheet, reportData, dayCounts, substituteTeachers, formatOptions) {
      formatOptions = formatOptions || {};
      var identityLabel = formatOptions.identityLabel || '固定兼課教師';
      var indigenousLayout = formatOptions.useIndigenousTemplateLayout === true;
      substituteTeachers = substituteTeachers || [];
      var weekDays = ['一', '二', '三', '四', '五'];
      var substituteMap = {};
      
      // 族語清冊：週次標題於第 6 列 C–G，H6「總計」；固定兼課範本維持原列位
      var weekdayRow = indigenousLayout ? 6 : 5;
      for (var i = 0; i < 5; i++) {
          sheet.getRange(weekdayRow, 3 + i).setValue(weekDays[i] + "\n(" + dayCounts[i] + "次)");
      }
      if (indigenousLayout) {
          sheet.getRange(weekdayRow, 8).setValue("總計");
      } else {
          sheet.getRange(weekdayRow, 8).setValue("小計");
      }

      var startRow = indigenousLayout ? 7 : 6;
      var rowsData = [];

      substituteTeachers.forEach(function(item) {
          var originalTeacherId = item.originalTeacherId || '';
          if (!substituteMap[originalTeacherId]) {
              substituteMap[originalTeacherId] = [];
          }
          substituteMap[originalTeacherId].push(item);
      });

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

          var grossI = 0;
          for (var gi = 0; gi < 5; gi++) {
            grossI += parseNumberish(periods[gi], 0) * dayCounts[gi];
          }
          var usePayableOverride = (item.payablePeriods != null && item.payablePeriods !== '');

          var iCell;
          var jCell;
          if (usePayableOverride) {
            var targetPayable = parseNumberish(item.payablePeriods, 0);
            iCell = grossI;
            jCell = targetPayable - grossI;
          } else {
            // J 欄「本次增減」須含活動扣除、請假扣除（與憑證一致），前端傳入 item.adjustment = 手動 - 活動扣除 - 請假扣除
            var netAdjustment = (item.adjustment != null && item.adjustment !== '') ? parseNumberish(item.adjustment, 0) : parseNumberish(item.manualAdjustment, 0);
            iCell = grossFormula;
            jCell = netAdjustment;
          }

          var jobTitleForExport = (item.jobTitle != null && String(item.jobTitle).trim() !== '') ? String(item.jobTitle) : identityLabel;
          var row = indigenousLayout ? [
              jobTitleForExport,
              item.teacherName,
              periods[0], periods[1], periods[2], periods[3], periods[4],
              "=SUM(C"+r+":G"+r+")",
              iCell,
              jCell,
              netFormula,
              405,
              amountFormula,
              '', '', '', '',
              item.adjustmentReason,
              ''
          ] : [
              item.teacherName,
              identityLabel,
              periods[0], periods[1], periods[2], periods[3], periods[4],
              "=SUM(C"+r+":G"+r+")",
              iCell,
              jCell,
              netFormula,
              405,
              amountFormula,
              '', '', '', '',
              item.adjustmentReason,
              ''
          ];
          rowsData.push(row);

          // 代課教師依前端頁面順序，直接接在對應固定兼課教師下方
          var relatedSubs = substituteMap[item.teacherId] || [];
          relatedSubs.forEach(function(subItem) {
              var subSessions = parseNumberish(subItem.substituteSessions, 0);
              var subPay = parseNumberish(subItem.pay, 0);
              var subDetailStr = (subItem.substituteDetails && subItem.substituteDetails.length) ? subItem.substituteDetails.join('；') : '';
              rowsData.push(indigenousLayout ? [
                  "代課",
                  subItem.teacherName,
                  0, 0, 0, 0, 0,
                  subSessions,
                  0,
                  0,
                  subSessions,
                  405,
                  subPay,
                  '', '', '', '',
                  subDetailStr,
                  ''
              ] : [
                  subItem.teacherName,
                  "代課",
                  0, 0, 0, 0, 0,
                  subSessions,
                  0,
                  0,
                  subSessions,
                  405,
                  subPay,
                  '', '', '', '',
                  subDetailStr,
                  ''
              ]);
          });
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
      
      // 簽核區
      var signRow = totalRow + 2;
      sheet.getRange(signRow, 1).setValue("製表：");
      sheet.getRange(signRow, 5).setValue("教務主任：");
      sheet.getRange(signRow, 9).setValue("稅款代扣：");
      var signRowPersonnel = signRow + 2;
      if (indigenousLayout) {
          // 教務主任下兩列：人事主任（與教務同欄）；稅款代扣下兩列：會計主任（14 號字）
          sheet.getRange(signRowPersonnel, 5).setValue("人事主任：");
          sheet.getRange(signRowPersonnel, 9).setValue("會計主任：").setFontSize(14);
          sheet.getRange(signRowPersonnel + 2, 16).setValue("校長：");
      } else {
          sheet.getRange(signRow, 13).setValue("人事主任：");
          sheet.getRange(signRow, 16).setValue("會計主任：");
          sheet.getRange(signRow + 2, 16).setValue("校長：");
      }

      // 清冊列高放大為原本約 1.25 倍，讓行距更舒適
      var signEndRow = indigenousLayout ? signRow + 4 : signRow + 2;
      this._scaleRowHeights(sheet, weekdayRow, signEndRow, 1.25);

      if (indigenousLayout) {
          sheet.getRange(1, 1, sheet.getMaxRows(), sheet.getMaxColumns()).setFontFamily('標楷體');
          sheet.getRange(signRowPersonnel, 9).setFontSize(14);
      }
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
