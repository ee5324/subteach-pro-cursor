/**
 * DriveService.gs
 * 負責處理 Google Drive 檔案與資料夾結構
 */

/**
 * 取得或建立資料夾 (層級式)
 */
function getOrCreateFolder(parentFolder, name) {
  const folders = parentFolder.getFoldersByName(name);
  if (folders.hasNext()) {
    return folders.next();
  } else {
    return parentFolder.createFolder(name);
  }
}

/**
 * 取得或建立範本工作表 (Initialize Template Sheet)
 * 直接在主試算表中建立一個 'Template' 分頁
 */
function getOrCreateTemplateSheet() {
  const ss = getDb(); // 開啟主試算表
  let sheet = ss.getSheetByName(TEMPLATE_SHEET_NAME);
  
  if (!sheet) {
    // 如果不存在，建立新工作表
    sheet = ss.insertSheet(TEMPLATE_SHEET_NAME);
    
    // 初始化範本設定 (設定標楷體)
    const maxRows = 100; // 預設給個夠用的列數
    const maxCols = 26;
    
    // 清空並設定基本格式
    sheet.clear();
    sheet.getRange(1, 1, maxRows, maxCols)
         .setFontFamily("KaiTi")
         .setFontSize(12)
         .setVerticalAlignment("middle")
         .setHorizontalAlignment("center");
         
    // 設定稍微大一點的行高，比較美觀
    sheet.setRowHeights(1, maxRows, 30);
    
    // 隱藏此工作表，避免誤刪，但 Script 仍可存取
    // sheet.hideSheet(); 
    // 註解掉 hideSheet，方便使用者打開主試算表確認字型
  }
  
  return sheet;
}

/**
 * 產生點名單檔案 (從內部範本工作表複製出去)
 */
function createAttendanceFileInDrive(data) {
  // 1. 取得根目錄與資料夾結構
  const rootFolder = DriveApp.getFolderById(ROOT_FOLDER_ID);
  const yearFolder = getOrCreateFolder(rootFolder, `${data.academicYear}學年`);
  const semesterFolder = getOrCreateFolder(yearFolder, `第${data.semester}學期`);

  // 2. 取得內建的範本工作表
  const templateSheet = getOrCreateTemplateSheet();

  // 3. 建立一個全新的試算表檔案
  const fileName = `${data.courseName}_${data.instructorName}_點名單`;
  const newSS = SpreadsheetApp.create(fileName);
  
  // 4. 將範本工作表複製到新檔案中 (copyTo 會保留字型與格式)
  const copiedSheet = templateSheet.copyTo(newSS);
  copiedSheet.setName('點名單'); // 重新命名
  
  // 5. 刪除新檔案中預設的 '工作表1' (Sheet1)
  const defaultSheet = newSS.getSheets()[0];
  if (defaultSheet.getName() !== '點名單') {
    newSS.deleteSheet(defaultSheet);
  }
  
  // 6. 將新檔案移動到指定資料夾 (SpreadsheetApp.create 預設在根目錄)
  const file = DriveApp.getFileById(newSS.getId());
  file.moveTo(semesterFolder);

  // 7. 針對新檔案進行排版與資料填寫
  // 注意：這邊傳入的是新檔案中的工作表
  formatAttendanceSheet(copiedSheet, data);

  return {
    url: newSS.getUrl(),
    id: newSS.getId(),
    path: `${rootFolder.getName()}/${yearFolder.getName()}/${semesterFolder.getName()}/${fileName}`
  };
}

/**
 * 將 Spreadsheet 排版成點名單格式 (Fill & Format)
 */
function formatAttendanceSheet(sheet, data) {
  // 0. 清除內容 (保留格式，因為我們是從範本 copy 過來的)
  sheet.clearContents(); 
  // 清除舊的背景色，避免格式殘留
  sheet.clearFormats(); 

  // 確保語系設定
  sheet.getParent().setSpreadsheetLocale('zh_TW');

  // 1. 資料準備
  const rawDates = data.dates || [];
  
  // 修正：解析日期時忽略時區
  // 傳來的格式已經是 "YYYY-MM-DD" (由前端確保)，直接切割字串建立 Date 物件
  const dates = rawDates.map(d => {
    if (typeof d === 'string' && d.indexOf('-') > -1) {
      // 移除可能存在的時間部分，只留日期
      const datePart = d.split('T')[0]; 
      const [year, month, day] = datePart.split('-').map(Number);
      // 注意：Month 是 0-indexed
      return new Date(year, month - 1, day);
    }
    // Fallback for unexpected formats
    return new Date(d);
  });

  const students = data.students || [];
  
  // 計算總欄數: 4 (編號, 時間, 班級, 姓名) + 日期數量 + 1 (成績)
  const dateColCount = dates.length;
  // 如果沒有日期，至少保留 5 個日期格預留位置
  const effectiveDateCount = dateColCount > 0 ? dateColCount : 5;
  const totalCols = 4 + effectiveDateCount + 1;

  // 預先擴充欄位與列數 (避免資料寫入時發生錯誤)
  const currentMaxCols = sheet.getMaxColumns();
  if (currentMaxCols < totalCols) {
    sheet.insertColumnsAfter(currentMaxCols, totalCols - currentMaxCols);
  }
  
  // --- 2. 字型與全域設定 (再次強制設定，確保萬無一失) ---
  const activeRange = sheet.getRange(1, 1, Math.max(20, students.length + 10), totalCols);
  activeRange.setFontFamily("KaiTi").setFontSize(12);
  // 預設全白背景
  activeRange.setBackground(null);

  // --- 3. 設定欄寬 ---
  // A: 編號 (窄)
  sheet.setColumnWidth(1, 40); 
  // B: 上課時間 (加大寬度，確保 12號字 四個字不換行)
  sheet.setColumnWidth(2, 90);
  // C: 班級 (加大寬度，確保 12號字 兩個字不換行)
  sheet.setColumnWidth(3, 70);
  // D: 姓名 (寬)
  sheet.setColumnWidth(4, 110);
  
  // 日期欄位 (MM/DD 12號字需要寬一點)
  for (let i = 0; i < effectiveDateCount; i++) {
    sheet.setColumnWidth(5 + i, 45);
  }
  // 最後一欄: 成績
  sheet.setColumnWidth(4 + effectiveDateCount + 1, 45);

  // --- 4. 標題與資訊區塊 ---
  
  // 處理學期顯示
  let displaySemester = data.semester || '';
  if (displaySemester && String(displaySemester).indexOf('學期') === -1) {
    displaySemester += '學期';
  }

  // Row 1: 大標題
  const title = `${data.academicYear} 學年${displaySemester}加昌國小${data.courseName}點名單`;
  sheet.getRange(1, 1, 1, totalCols).merge()
       .setValue(title)
       .setHorizontalAlignment('center')
       .setVerticalAlignment('middle')
       .setFontSize(18) 
       .setFontWeight('bold');

  // Row 2: 授課教師
  sheet.getRange(2, 1, 1, totalCols).merge()
       .setValue(`授課教師：${data.instructorName}`)
       .setHorizontalAlignment('right')
       .setVerticalAlignment('middle')
       .setFontSize(12);

  // Row 3: 上課時間
  sheet.getRange(3, 1, 1, totalCols).merge()
       .setValue(`上課時間：${data.classTime}`)
       .setHorizontalAlignment('left')
       .setVerticalAlignment('bottom')
       .setFontSize(12);

  // Row 4: 上課地點
  sheet.getRange(4, 1, 1, totalCols).merge()
       .setValue(`上課地點：${data.location}`)
       .setHorizontalAlignment('left')
       .setVerticalAlignment('bottom')
       .setFontSize(12);

  // --- 5. 表格標題 (Row 5) ---
  const headerRowIdx = 5;
  
  sheet.getRange(headerRowIdx, 1).setValue('編\n號'); 
  sheet.getRange(headerRowIdx, 2).setValue('上課時間'); 
  sheet.getRange(headerRowIdx, 3).setValue('班級');    
  sheet.getRange(headerRowIdx, 4).setValue('姓名');
  
  // 日期標題 (MM/DD)
  if (dateColCount > 0) {
    dates.forEach((d, i) => {
      const mm = (d.getMonth() + 1).toString().padStart(2, '0');
      const dd = d.getDate().toString().padStart(2, '0');
      const dateStr = `${mm}/${dd}`;
      sheet.getRange(headerRowIdx, 5 + i).setValue(dateStr); 
    });
  } else {
      for(let i=0; i<effectiveDateCount; i++) {
          sheet.getRange(headerRowIdx, 5 + i).setValue("");
      }
  }

  // 成績欄
  sheet.getRange(headerRowIdx, 4 + effectiveDateCount + 1).setValue('成\n績');

  // 格式化 Header Row (加上淺灰底色)
  const headerRange = sheet.getRange(headerRowIdx, 1, 1, totalCols);
  headerRange.setBorder(true, true, true, true, true, true)
             .setHorizontalAlignment('center')
             .setVerticalAlignment('middle')
             .setBackground('#F3F3F3') 
             .setWrap(true) 
             .setFontSize(12);


  // --- 6. 學生資料 (Row 6+) ---
  const dataStartRow = headerRowIdx + 1;

  if (students.length > 0) {
    const studentRows = students.map(s => {
      const row = [s.id, s.period, s.className, s.name];
      // 補上日期空白格
      for (let k = 0; k < effectiveDateCount; k++) row.push('');
      // 補上成績空白格
      row.push('');
      return row;
    });

    const dataRange = sheet.getRange(dataStartRow, 1, studentRows.length, totalCols);
    dataRange.setValues(studentRows);
    dataRange.setBorder(true, true, true, true, true, true)
             .setHorizontalAlignment('center')
             .setVerticalAlignment('middle')
             .setFontSize(12)
             .setWrap(false); 
    
    // --- 新增：處理不同節次的背景色 (白/灰/白/灰) ---
    // 規則：群組0(起始)為白，群組1為灰，群組2為白...
    let currentPeriod = students[0].period;
    let groupIndex = 0;
    let groupStartIdx = 0; // 陣列中的 index

    for (let i = 0; i < students.length; i++) {
        // 如果節次改變了
        if (students[i].period !== currentPeriod) {
            // 結算上一個群組：如果是奇數群組 (1, 3, 5...)，上色
            if (groupIndex % 2 !== 0) {
                // 列號 = dataStartRow + groupStartIdx
                // 列數 = i - groupStartIdx
                sheet.getRange(dataStartRow + groupStartIdx, 1, i - groupStartIdx, totalCols)
                     .setBackground('#EEEEEE'); // 淺灰色
            }
            
            // 開始新群組
            currentPeriod = students[i].period;
            groupIndex++;
            groupStartIdx = i;
        }
    }
    // 處理最後一個群組
    if (groupIndex % 2 !== 0) {
        sheet.getRange(dataStartRow + groupStartIdx, 1, students.length - groupStartIdx, totalCols)
             .setBackground('#EEEEEE');
    }
  }

  // --- 7. 頁尾: 教師簽名 ---
  const lastRowIdx = headerRowIdx + (students.length > 0 ? students.length : 1) + 1;
  
  sheet.getRange(lastRowIdx, 1, 1, 4).merge()
       .setValue("教師簽名")
       .setHorizontalAlignment('center')
       .setVerticalAlignment('middle')
       .setFontSize(12)
       .setBorder(true, true, true, true, null, null);

  // 簽名格框線
  sheet.getRange(lastRowIdx, 5, 1, effectiveDateCount).setBorder(true, true, true, true, true, true);
  sheet.getRange(lastRowIdx, 4 + effectiveDateCount + 1).setBorder(true, true, true, true, true, true);

  // --- 8. 最後修飾 ---
  // 調整列高
  sheet.setRowHeights(headerRowIdx, 1, 45); 
  sheet.setRowHeights(lastRowIdx, 1, 40);   
  
  if (students.length > 0) {
      sheet.setRowHeights(headerRowIdx + 1, students.length, 30);
  }

  // 強制寫入
  SpreadsheetApp.flush();
}