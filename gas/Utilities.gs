
// 2. Utilities.gs
// 通用工具

/**
 * 取得試算表物件
 * 優先使用 CONFIG.SPREADSHEET_ID，若無則嘗試使用當前綁定的試算表
 */
function getSpreadsheet() {
  if (CONFIG.SPREADSHEET_ID && CONFIG.SPREADSHEET_ID.length > 0) {
    try {
      return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    } catch (e) {
      Logger.log("無法透過 ID 開啟試算表: " + e.toString());
    }
  }
  
  // Fallback: 嘗試取得當前綁定的試算表 (Container-bound script)
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (ss) return ss;
  } catch (e) {
    Logger.log("無法取得 Active Spreadsheet: " + e.toString());
  }
  
  throw new Error("無法取得 Google Sheet 實例。請在 AppConfig.gs 設定正確的 SPREADSHEET_ID，或確認腳本已綁定於試算表。");
}

/**
 * 回傳標準的 JSON 回應
 * 設定 MIME Type 為 JSON，確保前端 fetch 不會報錯
 */
function responseJSON(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * 取得指定月份的 Sheet 名稱，並加上假別後綴
 * 用於將不同性質的代課費分開列印
 * 例如: "2023-10_公假", "2023-10_學輔事務"
 */
function getMonthSheetName(dateString, leaveType) {
  var date = parseDateString(dateString); // Safe parse
  var year = date.getFullYear();
  var month = ('0' + (date.getMonth() + 1)).slice(-2);
  
  // 詳細分類邏輯
  var typeSuffix = '其他';
  
  if (leaveType) {
      if (leaveType.indexOf('公假') > -1) {
          typeSuffix = '公假';
      } else if (leaveType.indexOf('喪病') > -1 || leaveType.indexOf('產假') > -1) {
          typeSuffix = '喪病產';
      } else if (leaveType.indexOf('身心') > -1) {
          typeSuffix = '身心假';
      } else if (leaveType.indexOf('學輔') > -1) {
          typeSuffix = '學輔事務';
      } else if (leaveType.indexOf('其他事務') > -1) {
          typeSuffix = '其他事務';
      } else if (leaveType.indexOf('自理') > -1 || leaveType.indexOf('事假') > -1 || leaveType.indexOf('病假') > -1) {
          typeSuffix = '自理';
      } else if (leaveType.indexOf('公付') > -1) {
          // 剩下的公付 (若有漏網之魚)
          typeSuffix = '公付其他';
      }
  }
  
  return year + '-' + month + '_' + typeSuffix;
}

/**
 * 取得該月份的總天數 (28, 29, 30, 31)
 * 使用安全的日期拆解，避免時區問題
 * @param {string} dateString YYYY-MM-DD
 */
function getDaysInMonth(dateString) {
  var date = parseDateString(dateString);
  // 設定為下個月的第0天，即為本月最後一天
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

/**
 * 安全解析日期字串 YYYY-MM-DD
 * 避免直接 new Date("2023-10-25") 造成的 UTC 偏移問題
 * 會將時間設定為中午 12:00:00，確保在任何時區都不會跨日
 */
function parseDateString(dateStr) {
    if (!dateStr) return new Date();
    var parts = dateStr.split('-');
    if (parts.length === 3) {
        // Note: Month is 0-indexed in JS Date
        return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 12, 0, 0);
    }
    return new Date(dateStr);
}


/**
 * 格式化日期 YYYY-MM-DD
 */
function formatDate(dateObj) {
  var year = dateObj.getFullYear();
  var month = ('0' + (dateObj.getMonth() + 1)).slice(-2);
  var day = ('0' + dateObj.getDate()).slice(-2);
  return year + '-' + month + '-' + day;
}

/**
 * 取得或建立子資料夾
 * @param {Folder} parentFolder 
 * @param {string} name 
 * @returns {Folder}
 */
function getOrCreateSubFolder(parentFolder, name) {
  var folders = parentFolder.getFoldersByName(name);
  if (folders.hasNext()) {
    return folders.next();
  } else {
    return parentFolder.createFolder(name);
  }
}

/**
 * 將數字轉換為大寫中文金額 (新台幣格式)
 * @param {number} num 
 * @returns {string}
 */
function numberToChineseAmount(num) {
  var strOutput = "";
  var strUnit = '仟佰拾萬仟佰拾億仟佰拾元';
  var strNumber = '零壹貳參肆伍陸柒捌玖';
  var strAmount = Math.round(num).toString();
  
  // 補足單位長度 (從元開始往左推)
  var unit = strUnit.substring(strUnit.length - strAmount.length);
  
  for (var i = 0; i < strAmount.length; i++) {
    strOutput += strNumber.substring(parseInt(strAmount.substring(i, i + 1)), parseInt(strAmount.substring(i, i + 1)) + 1) + unit.substring(i, i + 1);
  }
  
  // 處理零的規則 (簡化版，適合一般金額)
  strOutput = strOutput.replace(/零拾/g, "零").replace(/零佰/g, "零").replace(/零仟/g, "零").replace(/零萬/g, "萬").replace(/零億/g, "億").replace(/零零/g, "零").replace(/零萬/g, "萬").replace(/零元/g, "元");
  strOutput = strOutput.replace(/億萬/g, "億零");
  if (strOutput.indexOf("元") === -1) strOutput += "元";
  if (strOutput.substring(strOutput.length - 1) === "元") strOutput += "整";
  
  return "新台幣  " + strOutput;
}
