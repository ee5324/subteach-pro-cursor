
var LanguagePayroll = (function() {

  /**
   * 匯出語言教師薪資清冊
   * @param {string} month - YYYY-MM
   * @param {Array} payrolls - 清冊資料陣列
   * @param {string} templateName - 範本工作表名稱 (預設: 語言教師清冊範本)
   * @param {string} templateSpreadsheetId - (Optional) 範本所在的 Spreadsheet ID
   */
  function exportPayroll(month, payrolls, templateName, templateSpreadsheetId) {
    // 1. 取得範本來源
    var templateSheet;
    var templateSpreadsheet;

    // 優先嘗試使用前端傳來的 Spreadsheet ID
    if (templateSpreadsheetId) {
      try {
        templateSpreadsheet = SpreadsheetApp.openById(templateSpreadsheetId);
        // 嘗試取得指定名稱的工作表，若無則取第一個
        templateSheet = templateSpreadsheet.getSheetByName(templateName) || templateSpreadsheet.getSheets()[0];
      } catch (e) {
        console.error("無法透過 ID 開啟試算表: " + e);
      }
    }

    // 若上述失敗，嘗試舊邏輯：在 Drive 搜尋檔名
    if (!templateSheet) {
      var files = DriveApp.getFilesByName(templateName || '語言教師清冊範本');
      if (files.hasNext()) {
        var file = files.next();
        templateSpreadsheet = SpreadsheetApp.open(file);
        templateSheet = templateSpreadsheet.getSheets()[0];
      }
    }

    if (!templateSheet) {
      throw new Error("找不到範本：" + (templateName || '未指定') + "。請確認 ID 正確或檔案存在。");
    }

    // 2. 準備輸出資料夾與檔案
    var folderId = CONFIG.OUTPUT_FOLDER_ID;
    if (!folderId) throw new Error("未設定輸出資料夾 ID (CONFIG.OUTPUT_FOLDER_ID)");
    
    var rootFolder = DriveApp.getFolderById(folderId);
    
    // 建立年月資料夾結構
    var parts = month.split('-');
    var year = parts[0];
    var mon = parts[1];
    
    var yearFolder = getOrCreateSubFolder(rootFolder, year);
    var monthFolder = getOrCreateSubFolder(yearFolder, mon);
    
    var fileName = year + "年" + mon + "月_語言教師薪資清冊_" + Utilities.formatDate(new Date(), "GMT+8", "yyyyMMdd_HHmmss");
    var newSs = SpreadsheetApp.create(fileName);
    var newFile = DriveApp.getFileById(newSs.getId());
    newFile.moveTo(monthFolder);

    // 3. 處理每一筆清冊 (每位老師一個工作表)
    payrolls.forEach(function(p) {
      // 複製範本工作表到新檔案
      var sheet = templateSheet.copyTo(newSs);
      var sheetName = (p.teacherName || "未命名") + "_" + (p.language || "");
      
      // 避免工作表名稱重複
      var existing = newSs.getSheetByName(sheetName);
      if (existing) {
          sheetName = sheetName + "_" + Math.floor(Math.random() * 1000);
      }
      sheet.setName(sheetName);
      
      // 判斷語言類別 (原民語 vs 新民語)
      var isIndigenous = false;
      if (p.teacherCategory) {
          isIndigenous = p.teacherCategory === 'Indigenous';
      } else {
          // Fallback to name detection
          isIndigenous = (p.language || "").indexOf("族") !== -1;
      }
      
      // A1: 表頭
      var headerText = "";
      if (isIndigenous) {
        headerText = "表2：國中小原住民語文教學支援老師鐘點費印領清冊\n【從聘學校按月填寫】";
      } else {
        headerText = "表5：國中、小新住民語文教學支援老師鐘點費印領清冊\n【從聘學校按月填寫】";
      }
      sheet.getRange("A1").setValue(headerText);
      
      // A2: 上課月份 (民國年)
      var rocYear = parseInt(year) - 1911;
      sheet.getRange("A2").setValue("上課月份：" + rocYear + "年 " + parseInt(mon) + " 月");
      
      // A3: 所屬主聘學校
      sheet.getRange("A3").setValue("所屬主聘學校：" + (p.hostSchool || ""));
      
      // A4: 上課學校名稱
      sheet.getRange("A4").setValue("上課學校名稱：" + (p.teachingSchool || ""));

      // A5: 語言別
      var langLabel = isIndigenous ? "原住民語言別：" : "新住民語言別：";
      var langText = p.language || "";
      if (langText.indexOf("語") === -1 && langText.indexOf("文") === -1) {
          langText += "語";
      }
      sheet.getRange("A5").setValue(langLabel + langText);

      // D5: 老師姓名
      sheet.getRange("D5").setValue("教支老師姓名：" + (p.teacherName || ""));
      
      // 設定表頭 (Row 6)
      sheet.getRange("A6").setValue("編號");
      sheet.getRange("B6").setValue("上課時間");
      sheet.getRange("C6").setValue("節數");
      sheet.getRange("D6").setValue("鐘點費單價");
      sheet.getRange("E6").setValue("合計");
      sheet.getRange("F6").setValue("上課老師簽章");

      // 填寫清單資料 (從第 7 列開始)
      var startRow = 7;
      var entries = p.entries || [];
      
      // 依日期排序
      entries.sort(function(a, b) { return new Date(a.date) - new Date(b.date); });
      
      // 1. 偵測範本中的「總計」列位置，以判斷表格範圍
      var lastRow = sheet.getLastRow();
      // 讀取 B 欄 (假設總計在 B 欄)
      var bColumn = sheet.getRange("B1:B" + lastRow).getValues();
      var templateTotalRow = -1;
      
      for (var i = startRow - 1; i < bColumn.length; i++) {
        if (String(bColumn[i][0]).indexOf("總計") > -1) {
          templateTotalRow = i + 1; // 轉為 1-based index
          break;
        }
      }
      
      // 若找不到總計，預設為第 15 列 (假設範本有 8 列資料空間: 7~14)
      if (templateTotalRow === -1) templateTotalRow = 15;
      
      var currentDataSlots = templateTotalRow - startRow;
      var neededSlots = Math.max(entries.length, 1); // 至少保留一列
      
      // 2. 動態調整列數 (新增或刪除)
      if (neededSlots > currentDataSlots) {
        // 需要更多列：在總計列之前插入
        var insertCount = neededSlots - currentDataSlots;
        sheet.insertRowsBefore(templateTotalRow, insertCount);
      } else if (neededSlots < currentDataSlots) {
        // 列數過多：刪除多餘列
        var deleteStart = startRow + neededSlots;
        var deleteCount = currentDataSlots - neededSlots;
        sheet.deleteRows(deleteStart, deleteCount);
      }
      
      // 重新計算總計列位置
      var finalTotalRow = startRow + neededSlots;
      
      var totalPeriods = 0;
      var totalAmount = 0;

      // 3. 寫入資料
      if (entries.length > 0) {
        entries.forEach(function(entry, index) {
            var row = startRow + index;
            var dateObj = new Date(entry.date);
            var dateStr = Utilities.formatDate(dateObj, "GMT+8", "M月d日");
            
            // Get Weekday (0-6) -> Chinese
            var dayMap = ['日', '一', '二', '三', '四', '五', '六'];
            var weekday = dayMap[dateObj.getDay()];
            
            // Format: ○月○日星期○第○節
            var periodLabels = entry.periodLabels || "";
            // 移除所有「節」字，避免重複
            periodLabels = periodLabels.replace(/節/g, "");
            
            // 分割並處理每個節次
            var parts = periodLabels.split(/[、,，]/);
            var formattedParts = parts.map(function(p) {
                p = p.trim();
                if (p === "午" || p === "午休") return "午休";
                if (p === "早" || p === "早自修") return "早";
                return p;
            });
            
            // 重新組合
            var finalLabels = formattedParts.join("、");
            
            // 組合最終字串：日期 + 星期 + " 第" + 節次 + "節"
            // 注意：若 finalLabels 為空，則不顯示「第...節」
            var timeStr = dateStr + "星期" + weekday;
            if (finalLabels) {
                timeStr += " 第" + finalLabels + "節";
            }

            sheet.getRange("A" + row).setValue(index + 1);
            sheet.getRange("B" + row).setValue(timeStr).setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);
            sheet.getRange("C" + row).setValue(entry.periodCount);
            sheet.getRange("D" + row).setValue(entry.hourlyRate);
            sheet.getRange("E" + row).setFormula("=C" + row + "*D" + row);
            
            totalPeriods += entry.periodCount;
            totalAmount += (entry.periodCount * entry.hourlyRate);
        });
      } else {
        // 無資料：清空第一列
        sheet.getRange(startRow, 1, 1, 6).clearContent();
        sheet.getRange("A" + startRow).setValue(1); // 填個編號 1
      }
        
      // 4. 畫框線 (A6 到 F[finalTotalRow])
      // 表頭(6) + 資料列 + 總計列(finalTotalRow)
      var dataRange = sheet.getRange(6, 1, (finalTotalRow - 6) + 1, 6); 
      dataRange.setBorder(true, true, true, true, true, true, '#000000', SpreadsheetApp.BorderStyle.SOLID);
        
      // 5. 更新總計列
      // B欄: 總計
      sheet.getRange("B" + finalTotalRow).setValue("總計").setHorizontalAlignment("center");
        
      // C欄: 節數合計
      sheet.getRange("C" + finalTotalRow).setValue(totalPeriods + " 節");
        
      // E欄: 金額合計
      sheet.getRange("E" + finalTotalRow).setValue(totalAmount + " 元");
      
      // 6. 更新頁尾說明
      // 說明文字 1 (固定文字)
      var note1 = "●請各校按每月實際上課情形填寫，紙本核章後，於每月3日前公文交換或郵寄至主聘學校，以利主聘學校核算鐘點費。";
      
      // 說明文字 2 (費率說明)
      var note2 = isIndigenous 
          ? "●國小鐘點費每節360元、國中鐘點費每節400元" 
          : "●國小鐘點費每節336元、國中鐘點費每節378元";
          
      // 策略：
      // 1. 搜尋總計列下方的列
      // 2. 若找到包含「請各校按每月」的列，更新為 note1
      // 3. 若找到包含「鐘點費」的列，更新為 note2
      // 4. 若都沒找到，則依序寫入 Total+2 與 Total+3
      
      var foundNote1 = false;
      var foundNote2 = false;
      
      // 往下搜尋 6 列
      for (var r = 1; r <= 6; r++) {
          var checkRow = finalTotalRow + r;
          if (checkRow > sheet.getMaxRows()) break;
          
          var cell = sheet.getRange("A" + checkRow);
          var val = String(cell.getValue());
          
          if (val.indexOf("請各校按每月") > -1) {
              cell.setValue(note1);
              foundNote1 = true;
          } else if (val.indexOf("鐘點費") > -1) {
              // 避免重複：若已經寫過一次 note2，則清空後續重複的列
              if (foundNote2) {
                  cell.clearContent();
              } else {
                  cell.setValue(note2);
                  foundNote2 = true;
              }
          }
      }
      
      // 若沒找到位置，則強制寫入預設位置
      if (!foundNote1) {
          sheet.getRange("A" + (finalTotalRow + 2)).setValue(note1);
      }
      
      if (!foundNote2) {
          // 若 Note2 沒找到，強制寫在 Note1 下方 (假設 Note1 在 Total+2)
          // 為了保險，我們直接寫在 Total+3
          sheet.getRange("A" + (finalTotalRow + 3)).setValue(note2);
      }
      
      // 不再重新寫入 Note 1 (說明文字) 與 核章欄位，保留範本原樣
    });
    
    // 刪除預設的 Sheet1
    var defaultSheet = newSs.getSheetByName("工作表1");
    if (defaultSheet) newSs.deleteSheet(defaultSheet);
    
    return {
        url: newSs.getUrl(),
        fileId: newSs.getId()
    };
  }

  /**
   * 產生客語薪資領據 (使用前端計算好的資料)
   */
  function generateHakkaReceipt(teacherName, calculatedData, hourlyRate, templateName) {
    // 1. 取得範本
    var templateSheet;
    var templateSpreadsheetId = '1k0t09n4JZJSuQu8lq3bPlqvRjQZ24Fp4bD494UXlPKE'; // 指定的試算表 ID
    var targetGid = 1593682705; // 指定的 GID

    try {
      var ss = SpreadsheetApp.openById(templateSpreadsheetId);
      var sheets = ss.getSheets();
      
      // 優先嘗試使用 GID 尋找
      templateSheet = sheets.find(function(s) { return s.getSheetId() === targetGid; });
      
      // 若 GID 找不到，嘗試使用名稱尋找
      if (!templateSheet) {
        templateSheet = ss.getSheetByName(templateName || "客語領據範本");
      }
      
      // 若名稱也找不到，嘗試模糊搜尋
      if (!templateSheet) {
         templateSheet = sheets.find(function(s) { return s.getName().indexOf("客語") > -1 && s.getName().indexOf("範本") > -1; });
      }

    } catch (e) {
      console.error("Error opening template spreadsheet: " + e);
      throw new Error("無法開啟範本試算表 (ID: " + templateSpreadsheetId + "): " + e.message);
    }

    if (!templateSheet) throw new Error("在指定試算表中找不到範本 (GID: " + targetGid + " 或 名稱包含 '客語...範本')");

    // 2. 建立新檔案
    var folderId = CONFIG.OUTPUT_FOLDER_ID;
    var rootFolder = DriveApp.getFolderById(folderId);
    
    // 使用第一個月來決定資料夾
    var firstMonth = calculatedData[0].month; // YYYY-MM
    var parts = firstMonth.split('-');
    var yearFolder = getOrCreateSubFolder(rootFolder, parts[0]);
    var monthFolder = getOrCreateSubFolder(yearFolder, parts[1]);
    
    // 檔名：YYYY-MM_YYYY-MM_客語教學領據_姓名
    var monthStr = calculatedData.map(function(d) { return d.month; }).join('_');
    var fileName = monthStr + "_客語教學領據_" + teacherName;
    
    var newSs = SpreadsheetApp.create(fileName);
    var newFile = DriveApp.getFileById(newSs.getId());
    newFile.moveTo(monthFolder);
    
    var sheet = templateSheet.copyTo(newSs);
    sheet.setName("領據");
    var defaultSheet = newSs.getSheetByName("工作表1");
    if (defaultSheet) newSs.deleteSheet(defaultSheet);

    // 3. 填寫資料
    calculatedData.forEach(function(data, mIndex) {
      var month = data.month; // YYYY-MM
      var sessions = data.sessions; // Array of {date, periods, count}
      
      if (!month) return;

      var startRow = mIndex === 0 ? 1 : 13;
      var rocYear = parseInt(month.split('-')[0]) - 1911;
      var mon = parseInt(month.split('-')[1]);

      // A1/A13: 標題
      sheet.getRange(startRow, 1).setValue("高雄市加昌國小" + rocYear + "年" + mon + "月份辦理客語教學領據");

      // B3/B15: 收到...
      sheet.getRange(startRow + 2, 2).setValue("收到擔任加昌國小本土語--客家語教學工作" + mon + "月份鐘點費(客語A、B、C、D班)");

      // B4/B16: 教學日期與節數
      // 定義時段對照表 (使用全域設定)
      var timeMap = CONFIG.TIME_SLOTS || {
        '早': '07:55~08:35',
        '1': '08:45~09:25',
        '2': '09:35~10:15',
        '3': '10:30~11:10',
        '4': '11:20~12:00',
        '午': '12:40~13:20',
        '5': '13:30~14:10',
        '6': '14:20~15:00',
        '7': '15:20~16:00'
      };
      var pOrder = CONFIG.PERIOD_ORDER || ['早', '1', '2', '3', '4', '午', '5', '6', '7'];
      var numMap = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

      var groups = {
        'A': { day: 1, dayName: '一', dates: [], count: 0, prefix: '', periods: {} },
        'B': { day: 3, dayName: '三', dates: [], count: 0, prefix: '', periods: {} },
        'C': { day: 4, dayName: '四', dates: [], count: 0, prefix: '', periods: {} },
        'D': { day: -1, dayName: '', dates: [], count: 0, prefix: '', periods: {} }
      };

      sessions.forEach(function(entry) {
        var d = new Date(entry.date);
        // Force GMT+8 for date calculations
        var day = parseInt(Utilities.formatDate(d, "GMT+8", "u")); // 1=Mon...7=Sun
        // Convert 7(Sun) to 0 to match getDay() logic (0=Sun...6=Sat)
        if (day === 7) day = 0;
        
        var shortDate = parseInt(Utilities.formatDate(d, "GMT+8", "d"));

        var targetGroup = 'D';
        if (day === 1) targetGroup = 'A';
        else if (day === 3) targetGroup = 'B';
        else if (day === 4) targetGroup = 'C';

        groups[targetGroup].dates.push(shortDate);
        // Frontend sends 'count', backend logic used 'periodCount'. Use entry.count || entry.periodCount
        var c = entry.count || entry.periodCount || 0;
        groups[targetGroup].count += c;
        
        // Collect periods
        if (entry.periods && Array.isArray(entry.periods)) {
            entry.periods.forEach(function(p) { groups[targetGroup].periods[p] = true; });
        }

        if (!groups[targetGroup].prefix) {
          // Use GMT+8 for year/month prefix
          var y = Utilities.formatDate(d, "GMT+8", "yyyy");
          var m = Utilities.formatDate(d, "GMT+8", "M");
          groups[targetGroup].prefix = (parseInt(y) - 1911) + "/" + m + "/";
        }
        
        // Dynamic day name for D
        if (targetGroup === 'D') {
             var dayMap = ['日', '一', '二', '三', '四', '五', '六'];
             if (groups['D'].dayName.indexOf(dayMap[day]) === -1) {
                 groups['D'].dayName += (groups['D'].dayName ? '、' : '') + dayMap[day];
             }
        }
      });

      // Generate Labels automatically
      ['A', 'B', 'C', 'D'].forEach(function(key) {
          var g = groups[key];
          if (g.dates.length > 0) {
              var pList = Object.keys(g.periods).sort(function(a, b) { return pOrder.indexOf(a) - pOrder.indexOf(b); });
              var timeStr = pList.map(function(p) { return timeMap[p] || ''; }).join('、');
              var pCount = pList.length;
              var countStr = numMap[pCount] || pCount;
              
              // Format: 每週[Day][Time][Count]節
              g.label = "每週" + g.dayName + timeStr + countStr + "節";
          }
      });

      var dateText = "";
      ['A', 'B', 'C', 'D'].forEach(function(key) {
        var g = groups[key];
        if (g.dates.length > 0) {
          dateText += key + "：" + g.prefix + g.dates.join('.') + "(" + g.label + ")共" + g.count + "節\n";
        } else if (key !== 'D') {
          dateText += key + "：\n";
        }
      });
      sheet.getRange(startRow + 3, 2).setValue(dateText);

      // B5/B17: 單價
      sheet.getRange(startRow + 4, 2).setValue(hourlyRate);
      
      // D5/B17: 數量
      var totalPeriods = sessions.reduce(function(sum, e) { return sum + (e.count || e.periodCount || 0); }, 0);
      sheet.getRange(startRow + 4, 4).setValue(totalPeriods);

      // F5/F17: 小計
      var subtotal = totalPeriods * hourlyRate;
      sheet.getRange(startRow + 4, 6).setValue(subtotal);

      // B7/B19: 大寫金額
      sheet.getRange(startRow + 6, 2).setValue(numberToChineseAmount(subtotal));
    });

    return { url: newSs.getUrl() };
  }

  /**
   * 產生族語專職教師領據
   */
  function generateIndigenousReceipt(data) {
    var teacherName = data.teacherName;
    var jobTitle = data.jobTitle;
    var month = data.month; // YYYY-MM
    var weeklySchedule = data.weeklySchedule; // [Mon, Tue, Wed, Thu, Fri]
    var weeklySubtotal = data.weeklySubtotal;
    var monthlyRequired = data.monthlyRequired;
    var adjustment = data.adjustment;
    var actual = data.actual;
    var hourlyRate = data.hourlyRate;
    var totalAmount = data.totalAmount;
    var weekdayCounts = data.weekdayCounts; // [Mon, Tue, Wed, Thu, Fri]
    
    var templateSpreadsheetId = '1k0t09n4JZJSuQu8lq3bPlqvRjQZ24Fp4bD494UXlPKE';
    var targetGid = 2030591178;

    // 1. 取得範本
    var templateSheet;
    try {
      var ss = SpreadsheetApp.openById(templateSpreadsheetId);
      var sheets = ss.getSheets();
      templateSheet = sheets.find(function(s) { return s.getSheetId() === targetGid; });
      
      if (!templateSheet) {
          // Fallback by name if GID fails
          templateSheet = ss.getSheetByName("族語專職教師超鐘點費印領清冊");
      }
    } catch (e) {
      throw new Error("無法開啟範本試算表: " + e.message);
    }

    if (!templateSheet) throw new Error("找不到族語專職教師範本 (GID: " + targetGid + ")");

    // 2. 建立新檔案
    var folderId = CONFIG.OUTPUT_FOLDER_ID;
    var rootFolder = DriveApp.getFolderById(folderId);
    var parts = month.split('-');
    var yearFolder = getOrCreateSubFolder(rootFolder, parts[0]);
    var monthFolder = getOrCreateSubFolder(yearFolder, parts[1]);
    
    var fileName = month + "_族語專職教師超鐘點費_" + teacherName;
    var newSs = SpreadsheetApp.create(fileName);
    var newFile = DriveApp.getFileById(newSs.getId());
    newFile.moveTo(monthFolder);
    
    var sheet = templateSheet.copyTo(newSs);
    sheet.setName("印領清冊");
    var defaultSheet = newSs.getSheetByName("工作表1");
    if (defaultSheet) newSs.deleteSheet(defaultSheet);

    // 3. 填寫資料
    var rocYear = parseInt(parts[0]) - 1911;
    var mon = parseInt(parts[1]);

    // Title: A1
    var title = rocYear + "年" + mon + "月族語專職老師國中超鐘點費印領清冊";
    sheet.getRange("A1").setValue(title);

    // Date Range: B2
    // Calculate last day of the month
    var lastDay = new Date(parseInt(parts[0]), mon, 0).getDate();
    var dateRangeStr = "計算區間：" + parts[0] + "/" + parts[1] + "/01-" + parts[0] + "/" + parts[1] + "/" + lastDay;
    sheet.getRange("B2").setValue(dateRangeStr);

    // Row 7: Weekday Counts (C7-G7)
    if (weekdayCounts) {
        sheet.getRange("C7").setValue(weekdayCounts[0] || 0); // Mon Count
        sheet.getRange("D7").setValue(weekdayCounts[1] || 0); // Tue Count
        sheet.getRange("E7").setValue(weekdayCounts[2] || 0); // Wed Count
        sheet.getRange("F7").setValue(weekdayCounts[3] || 0); // Thu Count
        sheet.getRange("G7").setValue(weekdayCounts[4] || 0); // Fri Count
    }

    // Row 8: Data Row
    // A8: Job Title
    sheet.getRange("A8").setValue(jobTitle || "民族語專職老師");
    // B8: Name
    sheet.getRange("B8").setValue(teacherName);
    
    // C8-G8: Mon-Fri Schedule
    sheet.getRange("C8").setValue(weeklySchedule[0] || 0); // Mon
    sheet.getRange("D8").setValue(weeklySchedule[1] || 0); // Tue
    sheet.getRange("E8").setValue(weeklySchedule[2] || 0); // Wed
    sheet.getRange("F8").setValue(weeklySchedule[3] || 0); // Thu
    sheet.getRange("G8").setValue(weeklySchedule[4] || 0); // Fri
    
    // H8: Subtotal
    sheet.getRange("H8").setValue(weeklySubtotal);
    
    // I8: Required
    sheet.getRange("I8").setValue(monthlyRequired);
    
    // J8: Adjustment
    sheet.getRange("J8").setValue(adjustment);
    
    // K8: Actual
    sheet.getRange("K8").setValue(actual);
    
    // L8: Rate
    sheet.getRange("L8").setValue(hourlyRate);
    
    // M8: Total Amount
    sheet.getRange("M8").setValue(totalAmount);

    return { url: newSs.getUrl() };
  }

  return {
    exportPayroll: exportPayroll,
    generateHakkaReceipt: generateHakkaReceipt,
    generateIndigenousReceipt: generateIndigenousReceipt
  };

})();
