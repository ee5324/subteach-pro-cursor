
// 4. FormManager.gs
// 負責代課單產生
//
// 【列印邊界 0.5 cm】GAS/Sheets API 無法以程式設定列印邊界，請在「派代單範本」手動設定一次：
// 1. 開啟 CONFIG 指定的試算表，切到工作表「派代單範本」
// 2. 檔案 > 列印（或 Ctrl+P）> 邊界 > 自訂，上/下/左/右皆設為 0.5 cm
// 3. 關閉列印預覽即可（不需真的列印）。之後由此範本複製產生的代課單都會沿用 0.5 cm 邊界。

var FormManager = {
  /**
   * 產生單張派代單 (管理員用，存於 OUTPUT 底下年/月 資料夾)
   */
  generateSubstituteForm: function(record, teacherMap) {
     return this._createFormInSpreadsheet(null, record, teacherMap);
  },

  /**
   * 批次產生代課單
   */
  batchGenerateForms: function(records, teacherMap, yearMonthStr) { 
    if (!records || records.length === 0) return null;

    var rootFolderId = CONFIG.OUTPUT_FOLDER_ID;
    var rootFolder = rootFolderId ? DriveApp.getFolderById(rootFolderId) : DriveApp.getRootFolder();
    var parts = yearMonthStr.split('-');
    var yearStr = parts[0];
    var monthStr = parts[1];
    
    var yearFolder = getOrCreateSubFolder(rootFolder, yearStr);
    var targetFolder = getOrCreateSubFolder(yearFolder, monthStr);
    
    var fileName = yearStr + "年" + monthStr + "月_代課單彙整";
    
    var existingFiles = targetFolder.getFilesByName(fileName);
    if (existingFiles.hasNext()) existingFiles.next().setTrashed(true);

    var newSS = SpreadsheetApp.create(fileName);
    var newFile = DriveApp.getFileById(newSS.getId());
    newFile.moveTo(targetFolder); 

    var createdUrl = newSS.getUrl();
    var that = this;

    records.forEach(function(record) {
        that._createFormInSpreadsheet(newSS, record, teacherMap);
    });

    var defaultSheet = newSS.getSheets()[0];
    if (defaultSheet.getName().indexOf("Sheet") > -1 || defaultSheet.getName().indexOf("工作表") > -1) {
      if (newSS.getSheets().length > 1) {
          newSS.deleteSheet(defaultSheet);
      }
    }

    return createdUrl;
  },

  /**
   * 內部函式：在指定 SS (或新建) 中建立代課單 Sheet
   * UPDATE: 依據代課教師分流，若同一筆紀錄有多位代課教師，會拆分成多個 Sheet
   */
  _createFormInSpreadsheet: function(targetSS, record, teacherMap) {
    var templateName = CONFIG.DISPATCH_TEMPLATE_SHEET_NAME || CONFIG.TEMPLATE_SHEET_NAME || '派代單範本';
    var sourceSS = getSpreadsheet();
    var templateSheet = sourceSS.getSheetByName(templateName);
    // 列印邊界：複製時會沿用範本的列印設定，請在範本設 檔案>列印>邊界 為 0.5 cm
    if (!templateSheet) throw new Error("找不到名為 '" + templateName + "' 的工作表");

    var isSingleMode = false;
    if (!targetSS) {
        isSingleMode = true;
        var dateObj = parseDateString(record.startDate);
        var originalTeacherName = teacherMap[record.originalTeacherId] || '未知';
        var fileName = formatDate(dateObj) + '_' + originalTeacherName + '_派代單';
        targetSS = SpreadsheetApp.create(fileName);
    }

    var originalTeacherName = teacherMap[record.originalTeacherId] || record.originalTeacherId || '未知';

    // --- 1. 將課務依據「代課教師」分組 ---
    var slotsBySubId = {};
    
    if (record.slots && record.slots.length > 0) {
        record.slots.forEach(function(slot) {
            var subId = slot.substituteTeacherId || 'pending';
            if (!slotsBySubId[subId]) slotsBySubId[subId] = [];
            slotsBySubId[subId].push(slot);
        });
    } else {
        // 若完全無設定課務，歸類為待聘
        slotsBySubId['pending'] = []; 
    }

    // --- 2. 針對每一位代課教師產生對應的 Sheet ---
    Object.keys(slotsBySubId).forEach(function(subId) {
        var subSpecificSlots = slotsBySubId[subId];
        var subName = (subId === 'pending') ? '待聘' : (teacherMap[subId] || subId);
        
        // 2a. 將這位代課教師的課務依「週次」分組
        var slotsByWeek = {};
        
        if (subSpecificSlots.length > 0) {
            subSpecificSlots.forEach(function(slot) {
                var d = parseDateString(slot.date);
                var day = d.getDay();
                // 計算該週週一日期
                var diff = d.getDate() - day + (day == 0 ? -6 : 1);
                var monday = new Date(d);
                monday.setDate(diff);
                
                var weekKey = formatDate(monday);
                if (!slotsByWeek[weekKey]) slotsByWeek[weekKey] = [];
                slotsByWeek[weekKey].push(slot);
            });
        } else {
            // 若該教師無課務 (例如剛建立)，以開始日期決定週次，產生空表
            var d = parseDateString(record.startDate);
            var day = d.getDay();
            var diff = d.getDate() - day + (day == 0 ? -6 : 1);
            var monday = new Date(d);
            monday.setDate(diff);
            slotsByWeek[formatDate(monday)] = [];
        }

        var weekKeys = Object.keys(slotsByWeek).sort();

        // 2b. 產生每週的 Sheet
        weekKeys.forEach(function(weekKey, index) {
            var weekSlots = slotsByWeek[weekKey];
            
            // Sheet 名稱：原師_日期_代師_週次
            // 避免代師名字太長導致 Sheet Name 錯誤
            var shortSubName = subName.length > 4 ? subName.substring(0,4) : subName;
            var sheetName = originalTeacherName + "_" + record.startDate.substring(5) + "_" + shortSubName + "_W" + (index+1);
            
            // 避免同名衝突
            if (targetSS.getSheetByName(sheetName)) {
                sheetName += "_" + Math.floor(Math.random()*100);
            }

            var targetSheet = templateSheet.copyTo(targetSS);
            targetSheet.setName(sheetName);

            // --- 填寫資料 ---
            
            // 計算該代課師的總節數
            var totalPeriods = 0;
            weekSlots.forEach(function(s) {
                if (s.payType === '鐘點費') totalPeriods++;
            });

            // 公文文號處理
            var docText = "";
            if (record.leaveType && record.leaveType.indexOf("公付") > -1) {
                docText = record.docId || ""; 
            }

            // 申請日期
            var appDateStr = "";
            if (record.applicationDate) {
                // Fix: Use GMT+8 for date formatting
                var appD = new Date(record.applicationDate);
                var rocYear = parseInt(Utilities.formatDate(appD, "GMT+8", "yyyy")) - 1911;
                var month = Utilities.formatDate(appD, "GMT+8", "M");
                var day = Utilities.formatDate(appD, "GMT+8", "d");
                appDateStr = rocYear + " 年 " + month + " 月 " + day + " 日";
            }

            // 填入表頭
            targetSheet.getRange("D2").setValue(originalTeacherName);
            targetSheet.getRange("F2").setValue(subName); // 僅顯示此張單據的代課師
            targetSheet.getRange("H2").setValue(totalPeriods > 0 ? totalPeriods : "-");
            targetSheet.getRange("B3").setValue(record.leaveType);
            targetSheet.getRange("D3").setValue(record.reason || '');
            
            // 日期格式化
            var formatTW = function(val) {
                if (!val) return '';
                // Fix: Use GMT+8 for date formatting
                // new Date(val) creates UTC 00:00. Formatting to GMT+8 gives 08:00 (Same Day).
                return Utilities.formatDate(new Date(val), "GMT+8", "MM/dd");
            };
            
            var startStr = formatTW(record.startDate);
            var endStr = formatTW(record.endDate);
            targetSheet.getRange("B4").setValue(startStr + "-" + endStr).setFontSize(14);
            targetSheet.getRange("F4").setValue(docText).setFontSize(14);
            targetSheet.getRange("B18").setValue(appDateStr);

            // --- 新增：更新 D8-H8 的星期日期標題 (例如：星期一\n2/23) ---
            // Fix: Use GMT+8 logic for header dates
            // weekKey is YYYY-MM-DD of Monday. new Date(weekKey) is UTC 00:00.
            var mondayDate = new Date(weekKey); 
            var headerValues = [];
            var dayNames = ['星期一', '星期二', '星期三', '星期四', '星期五'];
            
            for (var i = 0; i < 5; i++) {
                // Add days in UTC context (safe as long as we don't cross DST boundaries weirdly, but GAS handles UTC well)
                var currentD = new Date(mondayDate.getTime() + i * 24 * 60 * 60 * 1000);
                // Format to GMT+8
                var dateStr = Utilities.formatDate(currentD, "GMT+8", "M/d");
                // 組合字串，使用 \n 換行
                headerValues.push(dayNames[i] + "\n" + dateStr);
            }
            
            // D8 是第 8 列，第 4 欄 (D)，寫入 1 列 5 欄
            var headerRange = targetSheet.getRange(8, 4, 1, 5);
            headerRange.setValues([headerValues]);
            headerRange.setWrap(true); // 啟用自動換行，讓 \n 生效
            // -------------------------------------------------------

            // 清空課表區域
            targetSheet.getRange("D9:H17").clearContent();

            // 填入課表 (僅填入屬於此代課師的節次)
            weekSlots.forEach(function(slot) {
                 var d = parseDateString(slot.date);
                 var day = d.getDay(); 
                 if (day < 1 || day > 5) return; 
                 var colIndex = 3 + day; // D欄是週一 (Index 4), E週二... (Wait: Template D9 is Mon?)
                 // Check template coordinates:
                 // D2=Original, F2=Sub
                 // Weekdays usually: D=Mon, E=Tue, F=Wed, G=Thu, H=Fri based on loop below
                 // Loop: 3 + day. If day=1(Mon), col=4(D). Correct.
                 
                 var rowIndex = -1;
                 switch(String(slot.period)) {
                     case '早': rowIndex = 9; break;
                     case '1': rowIndex = 10; break;
                     case '2': rowIndex = 11; break;
                     case '3': rowIndex = 12; break;
                     case '4': rowIndex = 13; break;
                     case '午': rowIndex = 14; break;
                     case '5': rowIndex = 15; break;
                     case '6': rowIndex = 16; break;
                     case '7': rowIndex = 17; break;
                 }
                 if (rowIndex !== -1) {
                     var cell = targetSheet.getRange(rowIndex, colIndex);
                     
                     // === NEW: Check Overtime ===
                     // Use the isOvertime property directly from the slot data
                     var isOvertime = slot.isOvertime === true;
                     // === END NEW ===

                     var content = slot.subject + "\n" + slot.className;
                     if (isOvertime) {
                         content += "(超)";
                     }

                     var oldContent = cell.getValue();
                     if (oldContent) content = oldContent + "\n" + content;
                     cell.setValue(content).setFontSize(14);
                 }
            });
        });
    });

    if (isSingleMode) {
        var defaultSheet = targetSS.getSheets()[0];
        if (defaultSheet.getName().indexOf("Sheet") > -1 || defaultSheet.getName().indexOf("工作表") > -1) {
            targetSS.deleteSheet(defaultSheet);
        }
        return targetSS.getUrl();
    }
  }
};
