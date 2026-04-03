/**
 * API 入口層 (Main.gs)
 * 處理 HTTP 請求與路由
 */

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('EduTrack 系統')
      .addItem('🚀 系統初始化 (Setup)', 'triggerSetupFromMenu')
      .addSeparator()
      .addItem('檢查連線狀態', 'checkStatus')
      .addToUi();
}

function triggerSetupFromMenu() {
  const ui = SpreadsheetApp.getUi();
  try {
    const result = setupSystem();
    if (result.success) {
      ui.alert('✅ 初始化成功', result.logs.join('\n'), ui.ButtonSet.OK);
    } else {
      ui.alert('⚠️ 初始化完成但有警告', result.logs.join('\n'), ui.ButtonSet.OK);
    }
  } catch (e) {
    ui.alert('❌ 發生錯誤', e.toString(), ui.ButtonSet.OK);
  }
}

function checkStatus() {
  const ui = SpreadsheetApp.getUi();
  const id = SpreadsheetApp.getActiveSpreadsheet().getId();
  ui.alert('系統狀態', `運作正常。\n目前的試算表 ID: ${id}`, ui.ButtonSet.OK);
}

function doGet(e) {
  return createRes(null, true, "GAS Service is running. Please use POST requests.");
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return createRes(null, false, "Server is busy, please try again later.");
  }

  try {
    if (!e.postData || !e.postData.contents) {
      throw new Error("No data received");
    }
    
    const request = JSON.parse(e.postData.contents);
    const action = request.action;
    const payload = request.payload;

    let result;

    switch (action) {
      // 僅建立點名單檔案於 Google Drive（文字資料改由 Firebase 儲存時使用）
      case 'CREATE_ATTENDANCE_FILE':
        result = createAttendanceFileOnly(payload);
        break;
      case 'SAVE_CONFIG':
        result = saveCourseConfig(payload);
        break;
        
      case 'GET_RECENT': // 舊 API，保留
      case 'GET_HISTORY': // 新 API，取得所有歷史紀錄
        result = getHistory();
        break;

      case 'GET_COURSE_STUDENTS': // 新 API，取得特定課程學生
        result = getCourseStudents(payload.courseId);
        break;

      case 'GET_SEMESTER_DATA': // 新 API，取得學期批次資料
        result = getSemesterData(payload);
        break;
      case 'IMPORT_FROM_URL': // 新 API，從 Spreadsheet URL 匯入
        result = importFromSpreadsheet(payload);
        break;

      // --- New Calendar Actions ---
      case 'GET_TODOS':
        result = getTodos();
        break;
      case 'SAVE_TODO':
        result = saveTodo(payload);
        break;
      case 'SAVE_BATCH_TODOS': // 新增：批次儲存待辦 (輪值)
        result = saveBatchTodos(payload);
        break;
      case 'DELETE_TODO':
        result = deleteTodo(payload);
        break;
      case 'CANCEL_SERIES':
        result = cancelSeries(payload);
        break;
      case 'TOGGLE_TODO_STATUS':
        result = toggleTodoStatus(payload);
        break;
      case 'UPLOAD_ATTACHMENT':
        result = uploadAttachment(payload);
        break;
      // ----------------------------
      
      // --- Award Actions (New) ---
      case 'SAVE_AWARD':
        result = saveAwardRecord(payload);
        break;
      case 'GET_AWARD_HISTORY':
        result = getAwardHistory();
        break;
      case 'GET_ALL_STUDENTS': // 新增：取得已知學生名單(Autocomplete)
        result = getAllKnownStudents();
        break;
      case 'CREATE_AWARD_DOCS': // 新增：產生 Google Doc 頒獎通知
        result = createAwardDocs(payload);
        break;
      case 'CREATE_AWARD_SUMMARY_DOCS': // 新增：產生 Google Doc 頒獎總表
        result = createAwardSummaryDocs(payload);
        break;
      // ----------------------------

      // --- Vendor Actions (New) ---
      case 'GET_VENDORS':
        result = getVendors();
        break;
      case 'SAVE_VENDOR':
        result = saveVendor(payload);
        break;
      case 'DELETE_VENDOR':
        result = deleteVendor(payload);
        break;
      // ----------------------------

      // --- Archive Actions (New) ---
      case 'GET_ARCHIVE':
        result = getArchiveTasks();
        break;
      case 'SAVE_ARCHIVE':
        result = saveArchiveTask(payload);
        break;
      case 'DELETE_ARCHIVE':
        result = deleteArchiveTask(payload);
        break;
      // ----------------------------

      case 'SETUP':
        result = setupSystem();
        break;
        
      case 'TEST_CONNECTION':
        result = { status: 'Connected', time: new Date() };
        break;

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return createRes(result, true, "Success");

  } catch (error) {
    return createRes(null, false, error.toString());
  } finally {
    lock.releaseLock();
  }
}