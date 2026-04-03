/**
 * 服務層 (Service.gs)
 * 處理業務邏輯
 */

/**
 * 系統初始化 (Setup)
 */
function setupSystem() {
  const ss = getDb();
  let messages = [];
  let rootFolder = null;

  // 1. 初始化資料庫工作表
  try {
    initSheets();
    messages.push("✅ 資料庫工作表 (Courses, Students, Awards, Vendors, Archive) 檢查/建立完成。");
  } catch (e) {
    messages.push(`❌ 資料庫初始化失敗: ${e.toString()}`);
  }

  // 2. 檢查 Google Drive 根目錄連線
  try {
    // 改為檢查指定的 Folder ID 是否可存取
    rootFolder = DriveApp.getFolderById(ROOT_FOLDER_ID);
    messages.push(`✅ Google Drive 根目錄已連接 (ID: ${ROOT_FOLDER_ID})。`);
    messages.push(`   資料夾名稱: ${rootFolder.getName()}`);
  } catch (e) {
    messages.push(`❌ Drive 連接失敗: 無法存取 ID 為 ${ROOT_FOLDER_ID} 的資料夾。請確認 ID 正確且具有編輯權限。`);
  }

  // 3. 檢查/建立 點名單範本工作表 (Internal Sheet)
  try {
    const templateSheet = getOrCreateTemplateSheet();
    messages.push(`✅ 內建範本工作表 (${TEMPLATE_SHEET_NAME}) 檢查/建立完成。`);
    messages.push(`   位置: 主試算表內的 "${TEMPLATE_SHEET_NAME}" 分頁`);
    messages.push(`   說明: 已設定為標楷體，產生新點名單時會從此分頁複製格式。`);
  } catch (e) {
    messages.push(`❌ 範本工作表建立失敗: ${e.toString()}`);
  }

  return { success: true, logs: messages };
}

/**
 * 僅在 Google Drive 建立點名單檔案並回傳 URL（供 Firebase 版前端使用，文字資料存 Firestore）
 */
function createAttendanceFileOnly(payload) {
  try {
    const driveFileResult = createAttendanceFileInDrive(payload);
    return { url: driveFileResult.url, id: driveFileResult.id, path: driveFileResult.path };
  } catch (e) {
    console.error("Error creating Drive file: " + e.toString());
    return { error: e.toString() };
  }
}

/**
 * 儲存前端傳來的點名單設定（僅建立 Drive 點名單檔案，不寫入試算表）
 * 本土語名單紀錄已改由前端寫入 Firebase，此處僅回傳 Drive 檔案資訊，供舊版或相容用。
 */
function saveCourseConfig(payload) {
  const courseId = Utilities.getUuid();
  let driveFileResult = null;
  try {
    driveFileResult = createAttendanceFileInDrive(payload);
  } catch (e) {
    console.error("Error creating Drive file: " + e.toString());
    driveFileResult = { error: e.toString() };
  }
  const recordCount = (payload.students && Array.isArray(payload.students)) ? payload.students.length : 0;
  return {
    courseId: courseId,
    recordCount: recordCount,
    driveFile: driveFileResult,
    message: 'Drive file created (course/student records are stored in Firebase only).'
  };
}

/**
 * 取得歷史課程列表 (含檔案連結)
 */
function getHistory() {
  const ss = getDb();
  const sheet = ss.getSheetByName(SHEETS.COURSES);
  if (!sheet) return [];
  
  const data = sheet.getDataRange().getValues();
  // Headers: id, academic_year, semester, course_name, instructor, class_time, location, created_at, file_url, start_date, end_date, selected_days
  const headers = data.shift(); 
  
  // 反轉陣列，讓最新的在最上面
  const reversedData = data.reverse();

  return reversedData.map(r => ({
    id: r[0],
    academicYear: r[1] ? String(r[1]) : '', // Force string to avoid Frontend TypeError
    semester: r[2] ? String(r[2]) : '',     // Force string
    courseName: r[3],
    instructor: r[4],
    classTime: r[5],
    location: r[6],
    createdAt: r[7],
    fileUrl: r[8] || '',
    // Use Utilities.formatDate to strictly handle Date objects without timezone shifts
    startDate: r[9] ? (r[9] instanceof Date ? Utilities.formatDate(r[9], Session.getScriptTimeZone(), 'yyyy-MM-dd') : r[9]) : '',
    endDate: r[10] ? (r[10] instanceof Date ? Utilities.formatDate(r[10], Session.getScriptTimeZone(), 'yyyy-MM-dd') : r[10]) : '',
    selectedDays: r[11] || '[]'
  }));
}

/**
 * 取得特定課程的學生名單
 */
function getCourseStudents(courseId) {
  const ss = getDb();
  const sheet = ss.getSheetByName(SHEETS.STUDENTS);
  if (!sheet) return [];

  const data = sheet.getDataRange().getValues();
  data.shift(); // Remove header

  // Headers: course_id, student_id, period, class_name, student_name
  // Filter by course_id (Index 0)
  const students = data
    .filter(row => row[0] === courseId)
    .map(row => ({
      id: row[1],
      period: row[2],
      className: row[3],
      name: row[4]
    }));
    
  return students;
}

/**
 * 批次取得某學期的所有課程資料 (含學生名單)
 * 用於一鍵匯出通知單
 */
function getSemesterData(payload) {
  const { academicYear, semester } = payload;
  
  // 1. 取得所有歷史課程
  const allCourses = getHistory();
  
  // 2. 篩選指定學期
  // 注意：比對時轉為字串避免型別問題
  const targetCourses = allCourses.filter(c => 
    String(c.academicYear) === String(academicYear) && 
    String(c.semester) === String(semester)
  );

  // 3. 為每個課程撈取學生名單
  // 若課程數量很大，這裡可能會執行較久，但在 Web App 中通常可接受
  const result = targetCourses.map(c => ({
    academicYear: c.academicYear,
    semester: c.semester,
    courseName: c.courseName,
    instructor: c.instructor,
    classTime: c.classTime,
    location: c.location,
    students: getCourseStudents(c.id)
  }));
  
  // 按照課程名稱排序，方便列印
  result.sort((a, b) => a.courseName.localeCompare(b.courseName));

  return result;
}

/**
 * 從指定的 Spreadsheet URL 讀取資料並還原為點名單設定
 */
function importFromSpreadsheet(payload) {
  const { url } = payload;
  if (!url) throw new Error("Missing URL");

  try {
    const ss = SpreadsheetApp.openByUrl(url);
    const sheet = ss.getSheets()[0]; // 假設資料在第一個分頁
    const data = sheet.getDataRange().getValues();

    // 解析標題以獲取基本資訊
    // 標題格式通常是: "113 學年下學期加昌國小閩南語點名單"
    const title = data[0][0] || "";
    const academicYearMatch = title.match(/(\d+)\s*學年/);
    const semesterMatch = title.match(/學年(.*?學期)/);
    const courseMatch = title.match(/加昌國小(.*?)點名單/);

    const academicYear = academicYearMatch ? academicYearMatch[1] : "113";
    const semester = semesterMatch ? semesterMatch[1] : "下學期";
    const courseName = courseMatch ? courseMatch[1] : "";

    // 授課教師在第二列右側
    const instructorLine = data[1][0] || "";
    const instructorMatch = instructorLine.match(/授課教師：(.*)/);
    const instructorName = instructorMatch ? instructorMatch[1].trim() : "";

    // 上課時間與地點在第三、四列
    const timeLine = data[2][0] || "";
    const locationLine = data[3][0] || "";
    const classTime = timeLine.replace("上課時間：", "").trim();
    const location = locationLine.replace("上課地點：", "").trim();

    // 解析學生名單
    // 標頭在第 6 列 (Index 5)
    // 欄位: 編號, 上課時間, 班級, 姓名, ...日期...
    const students = [];
    for (let i = 6; i < data.length; i++) {
        const row = data[i];
        if (!row[0] || row[0] === "教師簽名") break; // 結束標記

        students.push({
            id: String(row[0]),
            period: String(row[1]),
            className: String(row[2]),
            name: String(row[3])
        });
    }

    return {
        success: true,
        data: {
            academicYear,
            semester,
            courseName,
            instructorName,
            classTime,
            location,
            students
        }
    };
  } catch (e) {
    throw new Error("無法讀取試算表，請確認連結正確且具有存取權限。" + e.toString());
  }
}

/**
 * 取得最近的課程 (舊版相容，可考慮移除或保留)
 */
function getRecentCourses() {
  return getHistory().slice(0, 5);
}

// ---------------- 頒獎系統功能 ----------------

/**
 * 儲存頒獎紀錄
 */
function saveAwardRecord(payload) {
  initSheets();
  const id = Utilities.getUuid();
  const timestamp = new Date();
  
  // 為了節省查詢效能，將學生名單直接存為 JSON 字串
  const contentJson = JSON.stringify(payload.students || []);
  
  const row = [
    id,
    payload.date, // YYYY-MM-DD
    payload.title,
    contentJson,
    timestamp
  ];
  
  dbInsert(SHEETS.AWARDS, row);
  
  return { success: true, id: id };
}

/**
 * 取得頒獎歷史紀錄
 */
function getAwardHistory() {
  initSheets();
  const ss = getDb();
  const sheet = ss.getSheetByName(SHEETS.AWARDS);
  if (!sheet) return [];
  
  const data = sheet.getDataRange().getValues();
  data.shift(); // Remove header
  
  const reversedData = data.reverse();
  
  return reversedData.map(row => ({
    id: row[0],
    date: row[1] ? (row[1] instanceof Date ? Utilities.formatDate(row[1], Session.getScriptTimeZone(), 'yyyy-MM-dd') : row[1]) : '',
    title: row[2],
    students: row[3] ? JSON.parse(row[3]) : [],
    createdAt: row[4]
  }));
}

/**
 * 取得所有已知學生名單 (用於自動完成)
 * 來源：1. 學生資料表(Courses_Students) 2. 歷史頒獎紀錄(Awards_Data)
 */
function getAllKnownStudents() {
  const ss = getDb();
  const studentsMap = new Map(); // Key: "ClassName_StudentName", Value: Object

  // Helper to add to map
  const addStudent = (className, name) => {
    if (!className || !name) return;
    const key = `${className}_${name}`;
    if (!studentsMap.has(key)) {
      studentsMap.set(key, { className: String(className), name: String(name) });
    }
  };

  // 1. 掃描 Students_Data (課程名單)
  // Structure: course_id, student_id, period, class_name, student_name
  const studentSheet = ss.getSheetByName(SHEETS.STUDENTS);
  if (studentSheet) {
    const data = studentSheet.getDataRange().getValues();
    // Skip header
    for (let i = 1; i < data.length; i++) {
      addStudent(data[i][3], data[i][4]);
    }
  }

  // 2. 掃描 Awards_Data (歷史頒獎)
  // Structure: id, date, title, content_json, created_at
  const awardSheet = ss.getSheetByName(SHEETS.AWARDS);
  if (awardSheet) {
    const data = awardSheet.getDataRange().getValues();
    // Skip header
    for (let i = 1; i < data.length; i++) {
      try {
        const jsonStr = data[i][3];
        if (jsonStr) {
          const students = JSON.parse(jsonStr);
          if (Array.isArray(students)) {
            students.forEach(s => addStudent(s.className, s.name));
          }
        }
      } catch (e) {
        // ignore parse error
      }
    }
  }

  // Convert map to array and sort
  const result = Array.from(studentsMap.values());
  
  // Sort by Class then Name
  result.sort((a, b) => {
    if (a.className !== b.className) return a.className.localeCompare(b.className, undefined, { numeric: true });
    return a.name.localeCompare(b.name);
  });

  return result;
}

// ---------------- 廠商管理功能 (Vendor) ----------------

/**
 * 取得所有廠商
 */
function getVendors() {
  initSheets();
  const ss = getDb();
  const sheet = ss.getSheetByName(SHEETS.VENDORS);
  if (!sheet || sheet.getLastRow() <= 1) return [];

  const data = sheet.getDataRange().getValues();
  data.shift(); // Remove header

  // Headers: id, name, category, contact_person, phone, email, line_id, address, note, related_tasks
  return data.map(row => ({
    id: row[0],
    name: row[1],
    category: row[2],
    contactPerson: row[3],
    phone: row[4],
    email: row[5],
    lineId: row[6],
    address: row[7],
    note: row[8],
    relatedTasks: row[9] ? JSON.parse(row[9]) : []
  }));
}

/**
 * 儲存/更新廠商
 */
function saveVendor(payload) {
  initSheets();
  const ss = getDb();
  const sheet = ss.getSheetByName(SHEETS.VENDORS);
  
  const id = payload.id || Utilities.getUuid();
  const relatedTasksJson = JSON.stringify(payload.relatedTasks || []);

  let rowIndex = -1;
  // 如果有傳 ID，嘗試尋找該列
  if (payload.id) {
    const ids = sheet.getRange(2, 1, Math.max(sheet.getLastRow() - 1, 1), 1).getValues().flat();
    rowIndex = ids.indexOf(payload.id);
  }

  const rowData = [
    id,
    payload.name,
    payload.category,
    payload.contactPerson,
    payload.phone,
    payload.email,
    payload.lineId,
    payload.address,
    payload.note,
    relatedTasksJson
  ];

  if (rowIndex > -1) {
    // Update
    sheet.getRange(rowIndex + 2, 1, 1, rowData.length).setValues([rowData]);
  } else {
    // Create
    sheet.appendRow(rowData);
  }

  return { success: true, id: id };
}

/**
 * 刪除廠商
 */
function deleteVendor(payload) {
  initSheets();
  const ss = getDb();
  const sheet = ss.getSheetByName(SHEETS.VENDORS);
  
  const data = sheet.getDataRange().getValues();
  // Loop backwards to delete correctly
  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][0] == payload.id) {
      sheet.deleteRow(i + 1);
      break;
    }
  }
  return { success: true };
}