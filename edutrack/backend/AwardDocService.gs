/**
 * 頒獎通知 Google Doc 產生服務 (AwardDocService.gs)
 */

function createAwardDocs(payload) {
  var opts = payload.exportOptions || {};
  if (opts.mergeNotificationSingleDoc) {
    return createAwardDocsMerged(payload);
  }
  const { date, time, title, students } = payload;
  const folder = DriveApp.getFolderById(ROOT_FOLDER_ID);
  
  // 1. 分類學生 (低、中、高年級)
  const categories = {
    'low': { name: '低年級', grades: [1, 2], students: [] },
    'mid': { name: '中年級', grades: [3, 4], students: [] },
    'high': { name: '高年級', grades: [5, 6], students: [] },
    'other': { name: '其他', grades: [0], students: [] }
  };

  students.forEach(s => {
    const grade = getGradeFromClassName(s.className);
    if (grade === 1 || grade === 2) categories.low.students.push(s);
    else if (grade === 3 || grade === 4) categories.mid.students.push(s);
    else if (grade === 5 || grade === 6) categories.high.students.push(s);
    else categories.other.students.push(s);
  });

  const results = [];

  // 2. 為每個有學生的類別產生一個 Google Doc
  for (const key in categories) {
    const cat = categories[key];
    if (cat.students.length === 0) continue;

    const docName = `[頒獎通知] ${title} - ${cat.name} - ${date}`;
    const doc = DocumentApp.create(docName);
    const docFile = DriveApp.getFileById(doc.getId());
    folder.addFile(docFile);
    DriveApp.getRootFolder().removeFile(docFile); // 從根目錄移除，只留在目標資料夾

    const body = doc.getBody();
    
    // 設定頁面邊距 (公釐轉點數, 1mm = 2.83pt)
    // 使用 setAttributes 以確保相容性
    const attributes = {};
    attributes[DocumentApp.Attribute.MARGIN_TOP] = 28.3;
    attributes[DocumentApp.Attribute.MARGIN_BOTTOM] = 28.3;
    attributes[DocumentApp.Attribute.MARGIN_LEFT] = 42.5;
    attributes[DocumentApp.Attribute.MARGIN_RIGHT] = 42.5;
    body.setAttributes(attributes);

    // 按班級分組
    const classMap = {};
    cat.students.forEach(s => {
      if (!classMap[s.className]) classMap[s.className] = [];
      classMap[s.className].push(s);
    });

    const sortedClasses = Object.keys(classMap).sort((a, b) => {
      const numA = parseInt(a.replace(/\D/g, '')) || 0;
      const numB = parseInt(b.replace(/\D/g, '')) || 0;
      return numA - numB;
    });

    sortedClasses.forEach((className, index) => {
      // 每班一個區塊
      
      // 標題標籤
      const label = body.appendParagraph(`頒獎通知 (${cat.name})`);
      label.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
      label.setFontSize(12);
      label.setBold(true);

      // 主標題
      const mainTitle = body.appendParagraph(title);
      mainTitle.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
      mainTitle.setFontSize(24);
      mainTitle.setBold(true);
      mainTitle.setSpacingBefore(10);

      // 日期時間
      const dateTime = body.appendParagraph(`頒獎日期：${date} ${time || ''}`);
      dateTime.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
      dateTime.setFontSize(14);
      dateTime.setSpacingAfter(20);

      // 導師問候
      const greeting = body.appendParagraph(`${className} 班導師 您好：`);
      greeting.setFontSize(14);
      greeting.setBold(true);
      greeting.setSpacingAfter(10);

      // 內文
      const content = body.appendParagraph(`貴班下列學生表現優異，將於 ${date} ${time || ''} ${title} 進行公開表揚，敬請 惠予協助提醒學生準時出席受獎。`);
      content.setFontSize(12);
      content.setIndentFirstLine(24);
      content.setSpacingAfter(15);

      // 表格
      const tableData = [['姓名', '獲獎項目 / 榮譽']];
      classMap[className].forEach(s => {
        tableData.push([s.name, s.awardName]);
      });

      const table = body.appendTable(tableData);
      table.setBorderWidth(1);
      
      // 表格樣式
      for (let r = 0; r < table.getNumRows(); r++) {
        const row = table.getRow(r);
        for (let c = 0; c < row.getNumCells(); c++) {
          const cell = row.getCell(c);
          cell.setVerticalAlignment(DocumentApp.VerticalAlignment.CENTER);
          const para = cell.getChild(0).asParagraph();
          para.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
          if (r === 0) {
            cell.setBackgroundColor('#F3F3F3');
            para.setBold(true);
          } else {
            if (c === 0) para.setBold(true).setFontSize(14);
          }
        }
      }
      table.setAttributes({
        [DocumentApp.Attribute.FONT_FAMILY]: 'MSung' // 嘗試使用標楷體，若無則預設
      });

      // 結尾
      const footer = body.appendParagraph('教學組 敬啟');
      footer.setAlignment(DocumentApp.HorizontalAlignment.RIGHT);
      footer.setFontSize(16);
      footer.setBold(true);
      footer.setSpacingBefore(20);

      const printDate = body.appendParagraph(`製表日期：${Utilities.formatDate(new Date(), "GMT+8", "yyyy/MM/dd")}`);
      printDate.setAlignment(DocumentApp.HorizontalAlignment.RIGHT);
      printDate.setFontSize(10);

      // 換頁 (除了最後一班)
      if (index < sortedClasses.length - 1) {
        body.appendPageBreak();
      }
    });

    doc.saveAndClose();
    results.push({
      category: cat.name,
      url: doc.getUrl(),
      name: docName
    });
  }

  return { success: true, docs: results };
}

/**
 * 整併版：低中高分年級全部做進同一份「總通知單」Doc（年級段之間分頁）
 */
function createAwardDocsMerged(payload) {
  const { date, time, title, students } = payload;
  const opts = payload.exportOptions || {};
  const folder = DriveApp.getFolderById(ROOT_FOLDER_ID);
  const categories = {
    'low': { name: '低年級', students: [] },
    'mid': { name: '中年級', students: [] },
    'high': { name: '高年級', students: [] },
    'other': { name: '其他', students: [] }
  };
  students.forEach(function (s) {
    const grade = getGradeFromClassName(s.className);
    if (grade === 1 || grade === 2) categories.low.students.push(s);
    else if (grade === 3 || grade === 4) categories.mid.students.push(s);
    else if (grade === 5 || grade === 6) categories.high.students.push(s);
    else categories.other.students.push(s);
  });
  const suffix = opts.mergedDocTitleSuffix ? ' ' + opts.mergedDocTitleSuffix : '';
  const docName = '[頒獎通知·總單] ' + title + suffix + ' - ' + date;
  const doc = DocumentApp.create(docName);
  const docFile = DriveApp.getFileById(doc.getId());
  folder.addFile(docFile);
  DriveApp.getRootFolder().removeFile(docFile);
  const body = doc.getBody();
  const attributes = {};
  attributes[DocumentApp.Attribute.MARGIN_TOP] = 28.3;
  attributes[DocumentApp.Attribute.MARGIN_BOTTOM] = 28.3;
  attributes[DocumentApp.Attribute.MARGIN_LEFT] = 42.5;
  attributes[DocumentApp.Attribute.MARGIN_RIGHT] = 42.5;
  body.setAttributes(attributes);

  const order = ['low', 'mid', 'high', 'other'];
  let firstCategory = true;
  order.forEach(function (key) {
    const cat = categories[key];
    if (cat.students.length === 0) return;
    if (!firstCategory) body.appendPageBreak();
    firstCategory = false;
    const sectionTitle = body.appendParagraph('══ ' + cat.name + ' ══');
    sectionTitle.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    sectionTitle.setFontSize(14).setBold(true).setSpacingAfter(12);

    const classMap = {};
    cat.students.forEach(function (s) {
      if (!classMap[s.className]) classMap[s.className] = [];
      classMap[s.className].push(s);
    });
    const sortedClasses = Object.keys(classMap).sort(function (a, b) {
      const numA = parseInt(a.replace(/\D/g, '')) || 0;
      const numB = parseInt(b.replace(/\D/g, '')) || 0;
      return numA - numB;
    });
    sortedClasses.forEach(function (className, index) {
      const label = body.appendParagraph('頒獎通知 (' + cat.name + ')');
      label.setAlignment(DocumentApp.HorizontalAlignment.CENTER).setFontSize(12).setBold(true);
      const mainTitle = body.appendParagraph(title);
      mainTitle.setAlignment(DocumentApp.HorizontalAlignment.CENTER).setFontSize(22).setBold(true).setSpacingBefore(8);
      const dateTime = body.appendParagraph('頒獎日期：' + date + ' ' + (time || ''));
      dateTime.setAlignment(DocumentApp.HorizontalAlignment.CENTER).setFontSize(14).setSpacingAfter(16);
      const greeting = body.appendParagraph(className + ' 班導師 您好：');
      greeting.setFontSize(14).setBold(true).setSpacingAfter(10);
      const content = body.appendParagraph('貴班下列學生表現優異，將於 ' + date + ' ' + (time || '') + ' ' + title + ' 進行公開表揚，敬請 惠予協助提醒學生準時出席受獎。');
      content.setFontSize(12).setIndentFirstLine(24).setSpacingAfter(15);
      const tableData = [['姓名', '獲獎項目 / 榮譽']];
      classMap[className].forEach(function (s) {
        tableData.push([s.name, s.awardName]);
      });
      const table = body.appendTable(tableData);
      table.setBorderWidth(1);
      for (var r = 0; r < table.getNumRows(); r++) {
        const row = table.getRow(r);
        for (var c = 0; c < row.getNumCells(); c++) {
          const cell = row.getCell(c);
          cell.setVerticalAlignment(DocumentApp.VerticalAlignment.CENTER);
          const para = cell.getChild(0).asParagraph();
          para.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
          if (r === 0) {
            cell.setBackgroundColor('#F3F3F3');
            para.setBold(true);
          } else if (c === 0) para.setBold(true).setFontSize(14);
        }
      }
      const footer = body.appendParagraph('教學組 敬啟');
      footer.setAlignment(DocumentApp.HorizontalAlignment.RIGHT).setFontSize(16).setBold(true).setSpacingBefore(16);
      const printDate = body.appendParagraph('製表日期：' + Utilities.formatDate(new Date(), 'GMT+8', 'yyyy/MM/dd'));
      printDate.setAlignment(DocumentApp.HorizontalAlignment.RIGHT).setFontSize(10);
      if (index < sortedClasses.length - 1) body.appendPageBreak();
    });
  });
  doc.saveAndClose();
  return {
    success: true,
    docs: [{ category: '總通知單', url: doc.getUrl(), name: docName }]
  };
}

/**
 * 產生頒獎總表 Google Doc (依獎項分類，再依班級排序)
 */
function createAwardSummaryDocs(payload) {
  try {
    var opts = payload.exportOptions || {};
    if (opts.mergeSummarySingleDoc) {
      return createAwardSummaryDocsMerged(payload);
    }
    const { date, time, title, students } = payload;
    
    if (!ROOT_FOLDER_ID) {
      throw new Error('ROOT_FOLDER_ID 未設定');
    }
    const folder = DriveApp.getFolderById(ROOT_FOLDER_ID);
    
    const categories = {
      'low': { name: '低年級', grades: [1, 2], students: [] },
      'mid': { name: '中年級', grades: [3, 4], students: [] },
      'high': { name: '高年級', grades: [5, 6], students: [] },
      'other': { name: '其他', grades: [0], students: [] }
    };

    students.forEach(s => {
      const grade = getGradeFromClassName(s.className);
      if (grade === 1 || grade === 2) categories.low.students.push(s);
      else if (grade === 3 || grade === 4) categories.mid.students.push(s);
      else if (grade === 5 || grade === 6) categories.high.students.push(s);
      else categories.other.students.push(s);
    });

    const results = [];

    for (const key in categories) {
      const cat = categories[key];
      if (cat.students.length === 0) continue;

      const docName = `[獲獎總表] ${title} - ${cat.name} - ${date}`;
      const doc = DocumentApp.create(docName);
      const docFile = DriveApp.getFileById(doc.getId());
      folder.addFile(docFile);
      DriveApp.getRootFolder().removeFile(docFile);

      const body = doc.getBody();
      
      // 設定為直向 (Portrait) A4，因為條列式直向比較好閱讀
      const attributes = {};
      attributes[DocumentApp.Attribute.PAGE_WIDTH] = 595.276;
      attributes[DocumentApp.Attribute.PAGE_HEIGHT] = 841.89;
      attributes[DocumentApp.Attribute.MARGIN_TOP] = 40;
      attributes[DocumentApp.Attribute.MARGIN_BOTTOM] = 40;
      attributes[DocumentApp.Attribute.MARGIN_LEFT] = 50;
      attributes[DocumentApp.Attribute.MARGIN_RIGHT] = 50;
      body.setAttributes(attributes);

      // 標題
      const mainTitle = body.appendParagraph(`${title} - ${cat.name} 獲獎總表`);
      mainTitle.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
      mainTitle.setFontSize(22).setBold(true);

      const dateTime = body.appendParagraph(`頒獎日期：${date} ${time || ''}`);
      dateTime.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
      dateTime.setFontSize(14);
      dateTime.setSpacingAfter(20);

      // 取得該年級段的所有獎項
      const awards = [...new Set(cat.students.map(s => s.awardName))];

      // 依獎項分區塊
      awards.forEach(award => {
          // 獎項大標題
          const awardTitle = body.appendParagraph(`🏆 ${award}`);
          awardTitle.setFontSize(16).setBold(true);
          awardTitle.setBackgroundColor('#F0F4F8'); // 淺藍色背景突顯獎項
          awardTitle.setSpacingBefore(15);
          awardTitle.setSpacingAfter(10);

          // 整理該獎項的學生，依班級分組
          const studentsInAward = cat.students.filter(s => s.awardName === award);
          const classMap = {};
          studentsInAward.forEach(s => {
              if (!classMap[s.className]) classMap[s.className] = [];
              classMap[s.className].push(s.name);
          });

          // 班級排序
          const sortedClasses = Object.keys(classMap).sort((a, b) => {
              const numA = parseInt(a.replace(/\D/g, '')) || 0;
              const numB = parseInt(b.replace(/\D/g, '')) || 0;
              if (numA !== numB) return numA - numB;
              return a.localeCompare(b);
          });

          // 建立該獎項的表格 (兩欄：班級、學生名單)
          const table = body.appendTable();
          table.setBorderWidth(1);
          table.setBorderColor('#CCCCCC');

          sortedClasses.forEach(cls => {
              const row = table.appendTableRow();
              
              // 班級欄
              const classCell = row.appendTableCell(cls);
              classCell.setWidth(80);
              classCell.setVerticalAlignment(DocumentApp.VerticalAlignment.CENTER);
              classCell.setBackgroundColor('#FAFAFA');
              classCell.getChild(0).asParagraph().setAlignment(DocumentApp.HorizontalAlignment.CENTER).setBold(true);

              // 學生名單欄 (用頓號分隔)
              const names = classMap[cls].join('、');
              const nameCell = row.appendTableCell(names);
              nameCell.setVerticalAlignment(DocumentApp.VerticalAlignment.CENTER);
              nameCell.getChild(0).asParagraph().setLineSpacing(1.5);
          });
          
          body.appendParagraph(""); // 區塊間距
      });
      
      const footer = body.appendParagraph(`製表日期：${Utilities.formatDate(new Date(), "GMT+8", "yyyy/MM/dd")}`);
      footer.setAlignment(DocumentApp.HorizontalAlignment.RIGHT);
      footer.setFontSize(10);
      footer.setSpacingBefore(30);
      
      doc.saveAndClose();
      results.push({
        category: cat.name,
        url: doc.getUrl(),
        name: docName
      });
    }

    return { success: true, docs: results };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}

/**
 * 整併版總表：低中高分年級全部做進同一份 Doc（年級段之間分頁），獎項仍依區塊分組
 */
function createAwardSummaryDocsMerged(payload) {
  const { date, time, title, students } = payload;
  const opts = payload.exportOptions || {};
  if (!ROOT_FOLDER_ID) throw new Error('ROOT_FOLDER_ID 未設定');
  const folder = DriveApp.getFolderById(ROOT_FOLDER_ID);
  const categories = {
    'low': { name: '低年級', students: [] },
    'mid': { name: '中年級', students: [] },
    'high': { name: '高年級', students: [] },
    'other': { name: '其他', students: [] }
  };
  students.forEach(function (s) {
    const grade = getGradeFromClassName(s.className);
    if (grade === 1 || grade === 2) categories.low.students.push(s);
    else if (grade === 3 || grade === 4) categories.mid.students.push(s);
    else if (grade === 5 || grade === 6) categories.high.students.push(s);
    else categories.other.students.push(s);
  });
  const suffix = opts.mergedDocTitleSuffix ? ' ' + opts.mergedDocTitleSuffix : '';
  const docName = '[獲獎總表·整併] ' + title + suffix + ' - ' + date;
  const doc = DocumentApp.create(docName);
  const docFile = DriveApp.getFileById(doc.getId());
  folder.addFile(docFile);
  DriveApp.getRootFolder().removeFile(docFile);
  const body = doc.getBody();
  const attributes = {};
  attributes[DocumentApp.Attribute.MARGIN_TOP] = 40;
  attributes[DocumentApp.Attribute.MARGIN_BOTTOM] = 40;
  attributes[DocumentApp.Attribute.MARGIN_LEFT] = 50;
  attributes[DocumentApp.Attribute.MARGIN_RIGHT] = 50;
  body.setAttributes(attributes);

  const mainTitle = body.appendParagraph(title + ' — 獲獎總表（整併）');
  mainTitle.setAlignment(DocumentApp.HorizontalAlignment.CENTER).setFontSize(22).setBold(true);
  const dateTime = body.appendParagraph('頒獎日期：' + date + ' ' + (time || ''));
  dateTime.setAlignment(DocumentApp.HorizontalAlignment.CENTER).setFontSize(14).setSpacingAfter(20);

  const order = ['low', 'mid', 'high', 'other'];
  let firstCategory = true;
  order.forEach(function (key) {
    const cat = categories[key];
    if (cat.students.length === 0) return;
    if (!firstCategory) body.appendPageBreak();
    firstCategory = false;
    const sectionTitle = body.appendParagraph('■ ' + cat.name);
    sectionTitle.setFontSize(18).setBold(true).setSpacingAfter(12);

    const awards = [];
    const seen = {};
    cat.students.forEach(function (s) {
      if (!seen[s.awardName]) {
        seen[s.awardName] = true;
        awards.push(s.awardName);
      }
    });
    awards.forEach(function (award) {
      const awardTitle = body.appendParagraph('🏆 ' + award);
      awardTitle.setFontSize(16).setBold(true).setBackgroundColor('#F0F4F8').setSpacingBefore(12).setSpacingAfter(8);
      const studentsInAward = cat.students.filter(function (s) { return s.awardName === award; });
      const classMap = {};
      studentsInAward.forEach(function (s) {
        if (!classMap[s.className]) classMap[s.className] = [];
        classMap[s.className].push(s.name);
      });
      const sortedClasses = Object.keys(classMap).sort(function (a, b) {
        const numA = parseInt(a.replace(/\D/g, '')) || 0;
        const numB = parseInt(b.replace(/\D/g, '')) || 0;
        if (numA !== numB) return numA - numB;
        return a.localeCompare(b);
      });
      const table = body.appendTable();
      table.setBorderWidth(1);
      table.setBorderColor('#CCCCCC');
      sortedClasses.forEach(function (cls) {
        const row = table.appendTableRow();
        const classCell = row.appendTableCell(cls);
        classCell.setWidth(80).setVerticalAlignment(DocumentApp.VerticalAlignment.CENTER).setBackgroundColor('#FAFAFA');
        classCell.getChild(0).asParagraph().setAlignment(DocumentApp.HorizontalAlignment.CENTER).setBold(true);
        const nameCell = row.appendTableCell(classMap[cls].join('、'));
        nameCell.setVerticalAlignment(DocumentApp.VerticalAlignment.CENTER);
        nameCell.getChild(0).asParagraph().setLineSpacing(1.5);
      });
      body.appendParagraph('');
    });
  });

  const footer = body.appendParagraph('製表日期：' + Utilities.formatDate(new Date(), 'GMT+8', 'yyyy/MM/dd'));
  footer.setAlignment(DocumentApp.HorizontalAlignment.RIGHT).setFontSize(10).setSpacingBefore(20);
  doc.saveAndClose();
  return { success: true, docs: [{ category: '總表整併', url: doc.getUrl(), name: docName }] };
}

/**
 * 從班級名稱判斷年級 (與前端邏輯一致)
 */
function getGradeFromClassName(className) {
  const cleanName = className.trim();
  const numMatch = cleanName.match(/^(\d)/);
  if (numMatch) return parseInt(numMatch[1]);

  const chineseMap = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6 };
  const zhMatch = cleanName.match(/^([一二三四五六])/);
  if (zhMatch) return chineseMap[zhMatch[1]];

  return 0;
}
