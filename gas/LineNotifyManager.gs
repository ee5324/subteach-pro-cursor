// LineNotifyManager.gs
// 最小版：由前端在「發布公開職缺」時呼叫，登記當日有新職缺（供中午通知流程使用）

var LineNotifyManager = (function () {
  var TZ = 'Asia/Taipei';
  var KEY_PREFIX = 'LINE_NOTIFY_PENDING_';

  function todayKey_(dateObj) {
    var d = dateObj || new Date();
    return Utilities.formatDate(d, TZ, 'yyyy-MM-dd');
  }

  function stateKey_(day) {
    return KEY_PREFIX + String(day || todayKey_());
  }

  function addDays_(dateObj, n) {
    var d = new Date(dateObj.getTime());
    d.setDate(d.getDate() + n);
    return d;
  }

  /**
   * 規則：
   * - 12:00 前新增 => 今天中午
   * - 12:00 後新增 => 明天中午
   */
  function resolveNotifyDate_(dateObj) {
    var d = dateObj || new Date();
    var hour = Number(Utilities.formatDate(d, TZ, 'H'));
    return hour < 12 ? todayKey_(d) : todayKey_(addDays_(d, 1));
  }

  function ensureAuthorized_(provided) {
    var expected = String(CONFIG.LINE_NOTIFY_SHARED_KEY || '').trim();
    if (!expected) return; // 未設定金鑰時先不擋（開發期）
    if (String(provided || '') !== expected) {
      throw new Error('LINE_NOTIFY unauthorized');
    }
  }

  function truthyProp_(props, key) {
    var v = String(props.getProperty(key) || '').trim().toLowerCase();
    return v === 'true' || v === '1' || v === 'yes';
  }

  /** 清理從 LINE／試算表貼上的 recipient ID，避免 400 invalid "to" */
  function sanitizeLineRecipientId_(raw) {
    var s = String(raw || '').trim();
    s = s.replace(/[\r\n\t\u200b\uFEFF]/g, '');
    s = s.replace(/^LINE_TARGET_GROUP_ID\s*=\s*/i, '');
    s = s.replace(/^LINE_TARGET_USER_ID\s*=\s*/i, '');
    s = s.replace(/^["']|["']$/g, '');
    return s.trim();
  }

  function assertValidLineRecipientId_(id, label) {
    if (!id) throw new Error(label + ' 為空，請在指令碼屬性設定 LINE_TARGET_GROUP_ID（群，C 開頭）或 LINE_TARGET_USER_ID（一對一，U 開頭）');
    if (/\s/.test(id)) throw new Error(label + ' 含空白或換行，請只貼純 ID。目前長度 ' + id.length);
    var head = id.charAt(0);
    if (head !== 'U' && head !== 'C' && head !== 'R') {
      throw new Error(label + ' 須以 U（一對一）、C（群組）或 R（多人房）開頭，請勿貼錯欄位。');
    }
    if (id.length < 10) throw new Error(label + ' 長度異常（過短），請重新從「缺額查id」或 LINE_NOTIFY_CAPTURED_GROUP_ID 複製。');
  }

  /**
   * 不在群組回覆任何文字，只把 groupId 寫入指令碼屬性 LINE_NOTIFY_CAPTURED_GROUP_ID：
   * - LINE_NOTIFY_CAPTURE_ON_JOIN：Bot 被邀進群時的 join 事件（大群最低調，常不需任何人發言）
   * - LINE_NOTIFY_SILENT_CAPTURE_FROM_MESSAGE：群內任一人發訊息觸發 webhook 時覆寫寫入（Bot 仍不回覆）
   * 取得後請關閉兩者、複製 ID 到 LINE_TARGET_GROUP_ID，並刪除 LINE_NOTIFY_CAPTURED_* 以免混淆。
   */
  function silentLineWebhookCapture_(events, props) {
    for (var si = 0; si < events.length; si++) {
      var sev = events[si] || {};
      var src = sev.source || {};
      var gid = src.groupId;
      if (!gid) continue;

      if (sev.type === 'join' && truthyProp_(props, 'LINE_NOTIFY_CAPTURE_ON_JOIN')) {
        props.setProperty('LINE_NOTIFY_CAPTURED_GROUP_ID', gid);
        props.setProperty('LINE_NOTIFY_CAPTURED_GROUP_AT', new Date().toISOString());
        props.setProperty('LINE_NOTIFY_CAPTURED_GROUP_REASON', 'join');
        Logger.log('[LINE silent capture] join groupId=' + gid);
        continue;
      }

      if (sev.type === 'message' && truthyProp_(props, 'LINE_NOTIFY_SILENT_CAPTURE_FROM_MESSAGE')) {
        props.setProperty('LINE_NOTIFY_CAPTURED_GROUP_ID', gid);
        props.setProperty('LINE_NOTIFY_CAPTURED_GROUP_AT', new Date().toISOString());
        props.setProperty('LINE_NOTIFY_CAPTURED_GROUP_REASON', 'message');
        Logger.log('[LINE silent capture] message groupId=' + gid);
      }
    }
  }

  function getLineConfig_() {
    var props = PropertiesService.getScriptProperties();
    var channelToken = String(props.getProperty('LINE_CHANNEL_ACCESS_TOKEN') || CONFIG.LINE_CHANNEL_ACCESS_TOKEN || '').trim();
    var groupId = sanitizeLineRecipientId_(props.getProperty('LINE_TARGET_GROUP_ID') || CONFIG.LINE_TARGET_GROUP_ID || '');
    var userId = sanitizeLineRecipientId_(props.getProperty('LINE_TARGET_USER_ID') || CONFIG.LINE_TARGET_USER_ID || '');
    var targetUserId = groupId || userId;
    var testRaw = String(props.getProperty('LINE_NOTIFY_TEST_MODE') || '').trim().toLowerCase();
    var testMode =
      testRaw === 'true' ||
      testRaw === '1' ||
      testRaw === 'yes' ||
      Boolean(CONFIG.LINE_NOTIFY_TEST_MODE);
    return {
      channelToken: channelToken,
      targetUserId: targetUserId,
      groupId: groupId,
      userId: userId,
      testMode: testMode
    };
  }

  function formatLineText_(text, testMode) {
    if (!testMode) return String(text || '');
    return '[測試] ' + String(text || '');
  }

  function pushLineText_(to, text, channelToken, testMode) {
    var toNorm = sanitizeLineRecipientId_(to);
    assertValidLineRecipientId_(toNorm, 'LINE push 的 to');
    if (!channelToken) throw new Error('LINE channel access token is empty');
    text = formatLineText_(text, testMode);
    var url = 'https://api.line.me/v2/bot/message/push';
    var payload = {
      to: toNorm,
      messages: [{ type: 'text', text: String(text || '') }]
    };
    var resp = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + channelToken },
      muteHttpExceptions: true,
      payload: JSON.stringify(payload)
    });
    var code = resp.getResponseCode();
    if (code < 200 || code >= 300) {
      throw new Error('LINE push failed: HTTP ' + code + ' / ' + resp.getContentText());
    }
    return { ok: true, code: code };
  }

  function replyLineText_(replyToken, text, channelToken, testMode) {
    if (!replyToken) throw new Error('LINE replyToken is empty');
    if (!channelToken) throw new Error('LINE channel access token is empty');
    text = formatLineText_(text, testMode);
    var url = 'https://api.line.me/v2/bot/message/reply';
    var payload = {
      replyToken: String(replyToken),
      messages: [{ type: 'text', text: String(text || '') }]
    };
    var resp = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + channelToken },
      muteHttpExceptions: true,
      payload: JSON.stringify(payload)
    });
    var code = resp.getResponseCode();
    if (code < 200 || code >= 300) {
      throw new Error('LINE reply failed: HTTP ' + code + ' / ' + resp.getContentText());
    }
    return { ok: true, code: code };
  }

  function listPendingDates_() {
    var all = PropertiesService.getScriptProperties().getProperties();
    var out = [];
    for (var k in all) {
      if (!Object.prototype.hasOwnProperty.call(all, k)) continue;
      if (k.indexOf(KEY_PREFIX) !== 0) continue;
      out.push(k.substring(KEY_PREFIX.length));
    }
    out.sort();
    return out;
  }

  function getLatestConfirmSentDate_() {
    var dates = listPendingDates_();
    var props = PropertiesService.getScriptProperties();
    for (var i = dates.length - 1; i >= 0; i--) {
      var day = dates[i];
      var raw = props.getProperty(stateKey_(day));
      if (!raw) continue;
      try {
        var s = JSON.parse(raw);
        if (s && s.status === 'confirm_sent') return day;
      } catch (e) {}
    }
    return '';
  }

  function normalizeCommand_(text) {
    var t = String(text || '').trim();
    if (!t) return '';
    if (t === '送出') return 'send';
    if (t === '略過') return 'skip';
    return '';
  }

  function registerPublicVacancyEvent(data) {
    data = data || {};
    ensureAuthorized_(data.apiKey);

    var now = new Date();
    var day = resolveNotifyDate_(now);
    var props = PropertiesService.getScriptProperties();
    var key = stateKey_(day);
    var prevRaw = props.getProperty(key);
    var prev = null;
    try { prev = prevRaw ? JSON.parse(prevRaw) : null; } catch (e) { prev = null; }

    var nextState = {
      date: day,
      hasNewPublicVacancy: true,
      firstEventAt: prev && prev.firstEventAt ? prev.firstEventAt : now.toISOString(),
      lastEventAt: now.toISOString(),
      count: (prev && Number(prev.count) ? Number(prev.count) : 0) + 1,
      source: 'publicBoard',
      status: prev && prev.status ? prev.status : 'pending'
    };

    props.setProperty(key, JSON.stringify(nextState));
    return nextState;
  }

  function getPendingState(data) {
    data = data || {};
    ensureAuthorized_(data.apiKey);
    var day = String(data.date || todayKey_());
    var raw = PropertiesService.getScriptProperties().getProperty(stateKey_(day));
    return raw ? JSON.parse(raw) : null;
  }

  function clearPendingState(data) {
    data = data || {};
    ensureAuthorized_(data.apiKey);
    var day = String(data.date || todayKey_());
    PropertiesService.getScriptProperties().deleteProperty(stateKey_(day));
    return { ok: true, date: day };
  }

  /**
   * 中午檢查用（目前僅回傳摘要，不發 LINE）
   */
  function getNoonPendingSummary(data) {
    data = data || {};
    ensureAuthorized_(data.apiKey);
    var now = new Date();
    var day = String(data.date || todayKey_(now));
    var key = stateKey_(day);
    var props = PropertiesService.getScriptProperties();
    var raw = props.getProperty(key);
    if (!raw) {
      return {
        date: day,
        hasPending: false,
        message: '今日無待通知職缺'
      };
    }
    var state = JSON.parse(raw);
    state.lastNoonCheckAt = now.toISOString();
    props.setProperty(key, JSON.stringify(state));
    return {
      date: day,
      hasPending: Boolean(state.hasNewPublicVacancy),
      count: Number(state.count) || 0,
      firstEventAt: state.firstEventAt || '',
      lastEventAt: state.lastEventAt || '',
      status: state.status || 'pending',
      message: '今日待通知職缺 ' + (Number(state.count) || 0) + ' 筆'
    };
  }

  /**
   * 中午發「確認訊息」骨架（固定文案，先測通）
   */
  function sendNoonConfirmPrompt(data) {
    data = data || {};
    ensureAuthorized_(data.apiKey);
    var day = String(data.date || todayKey_(new Date()));
    var key = stateKey_(day);
    var props = PropertiesService.getScriptProperties();
    var raw = props.getProperty(key);
    if (!raw) {
      return { sent: false, date: day, reason: 'no_pending' };
    }
    var state = JSON.parse(raw);
    if (!state.hasNewPublicVacancy) {
      return { sent: false, date: day, reason: 'no_new_vacancy' };
    }

    var cfg = getLineConfig_();
    var msg = '【代課系統提醒】\n' +
      day + ' 待通知職缺 ' + (Number(state.count) || 0) + ' 筆。\n' +
      '請回覆：送出 或 略過';
    pushLineText_(cfg.targetUserId, msg, cfg.channelToken, cfg.testMode);

    state.confirmPromptSentAt = new Date().toISOString();
    state.status = 'confirm_sent';
    props.setProperty(key, JSON.stringify(state));
    return { sent: true, date: day, count: Number(state.count) || 0, status: state.status };
  }

  /**
   * 接收 LINE webhook 的最小版處理：
   * - 回覆「送出」：狀態改 approved，並回覆確認文字
   * - 回覆「略過」：狀態改 skipped，並回覆確認文字
   */
  function handleLineWebhook(payload) {
    var cfg = getLineConfig_();
    var events = payload && payload.events && Array.isArray(payload.events) ? payload.events : [];
    var results = [];
    var props = PropertiesService.getScriptProperties();

    var dbg = String(props.getProperty('LINE_NOTIFY_DEBUG_WEBHOOK') || '').trim().toLowerCase();
    if (dbg === 'true' || dbg === '1') {
      if (!events.length) {
        props.setProperty('LINE_NOTIFY_LAST_WEBHOOK_SOURCE', JSON.stringify({ note: 'events 陣列為空' }));
        props.setProperty('LINE_NOTIFY_LAST_WEBHOOK_DEBUG_AT', new Date().toISOString());
        Logger.log('[LINE webhook debug] events 陣列為空');
      }
      for (var di = 0; di < events.length; di++) {
        var evd = events[di] || {};
        var srcJson = JSON.stringify(evd.source || {});
        props.setProperty('LINE_NOTIFY_LAST_WEBHOOK_SOURCE', srcJson);
        props.setProperty('LINE_NOTIFY_LAST_WEBHOOK_DEBUG_AT', new Date().toISOString());
        Logger.log('[LINE webhook debug] type=' + evd.type + ' source=' + srcJson);
      }
    }

    silentLineWebhookCapture_(events, props);

    var dbgOn = dbg === 'true' || dbg === '1';

    for (var i = 0; i < events.length; i++) {
      var ev = events[i] || {};
      if (ev.type !== 'message' || !ev.message || ev.message.type !== 'text') continue;
      var rawText = String(ev.message.text || '').trim();

      if (dbgOn && rawText === '缺額查id') {
        var src = ev.source || {};
        var lines = [];
        lines.push('[除錯] 複製到 GAS「指令碼屬性」：');
        if (src.groupId) lines.push('LINE_TARGET_GROUP_ID=' + src.groupId);
        if (src.userId) lines.push('LINE_TARGET_USER_ID=' + src.userId);
        if (src.roomId) lines.push('roomId=' + src.roomId);
        lines.push('source.type=' + String(src.type || ''));
        var replyBody = lines.join('\n').slice(0, 4800);
        try {
          replyLineText_(ev.replyToken, replyBody, cfg.channelToken, cfg.testMode);
        } catch (eDbg) {}
        results.push({ ok: true, action: 'debug_id_reply' });
        continue;
      }

      var cmd = normalizeCommand_(rawText);
      if (!cmd) continue;

      var day = getLatestConfirmSentDate_();
      if (!day) {
        try {
          replyLineText_(ev.replyToken, '目前沒有待確認通知。', cfg.channelToken, cfg.testMode);
        } catch (e1) {}
        results.push({ ok: false, reason: 'no_confirm_sent_state' });
        continue;
      }

      var raw = props.getProperty(stateKey_(day));
      if (!raw) {
        results.push({ ok: false, reason: 'state_missing', date: day });
        continue;
      }
      var state = JSON.parse(raw);
      if (cmd === 'send') {
        state.status = 'approved';
        state.approvedAt = new Date().toISOString();
        props.setProperty(stateKey_(day), JSON.stringify(state));
        try {
          replyLineText_(ev.replyToken, '已收到「送出」。今日職缺通知已確認。', cfg.channelToken, cfg.testMode);
        } catch (e2) {
          if (ev.source && ev.source.userId) {
            pushLineText_(ev.source.userId, '已收到「送出」。今日職缺通知已確認。', cfg.channelToken, cfg.testMode);
          }
        }
        results.push({ ok: true, action: 'approved', date: day });
      } else if (cmd === 'skip') {
        state.status = 'skipped';
        state.skippedAt = new Date().toISOString();
        props.setProperty(stateKey_(day), JSON.stringify(state));
        try {
          replyLineText_(ev.replyToken, '已收到「略過」。本次不發送。', cfg.channelToken, cfg.testMode);
        } catch (e3) {
          if (ev.source && ev.source.userId) {
            pushLineText_(ev.source.userId, '已收到「略過」。本次不發送。', cfg.channelToken, cfg.testMode);
          }
        }
        results.push({ ok: true, action: 'skipped', date: day });
      }
    }
    return { processed: results.length, results: results };
  }

  /**
   * 連線測試：推一則文字到目前設定的群組或一對一目標
   */
  function sendTestPing(data) {
    data = data || {};
    ensureAuthorized_(data.apiKey);
    var cfg = getLineConfig_();
    if (!cfg.targetUserId) {
      throw new Error('LINE push 目標為空（請設 LINE_TARGET_GROUP_ID 或 LINE_TARGET_USER_ID）');
    }
    var msg = data.message || '代課系統 LINE 連線測試';
    pushLineText_(cfg.targetUserId, msg, cfg.channelToken, cfg.testMode);
    return { ok: true, testMode: cfg.testMode, usedGroup: Boolean(cfg.groupId) };
  }

  return {
    registerPublicVacancyEvent: registerPublicVacancyEvent,
    getPendingState: getPendingState,
    clearPendingState: clearPendingState,
    getNoonPendingSummary: getNoonPendingSummary,
    sendNoonConfirmPrompt: sendNoonConfirmPrompt,
    handleLineWebhook: handleLineWebhook,
    sendTestPing: sendTestPing,
  };
})();

/**
 * GAS 編輯器：選此函式 → 執行。會用 Script Properties 的 LINE_NOTIFY_SHARED_KEY 當 apiKey（若有設）。
 */
function lineNotifyRunTestPingFromEditor() {
  var key = PropertiesService.getScriptProperties().getProperty('LINE_NOTIFY_SHARED_KEY') || '';
  return LineNotifyManager.sendTestPing({ apiKey: key });
}

/**
 * 給 GAS time-driven trigger 用：
 * 每日中午可綁這個函式，先做摘要檢查（目前不發 LINE）。
 */
function lineNotifyNoonTrigger() {
  var summary = LineNotifyManager.getNoonPendingSummary({});
  Logger.log('[lineNotifyNoonTrigger] summary=' + JSON.stringify(summary));
  if (!summary.hasPending) return;
  var res = LineNotifyManager.sendNoonConfirmPrompt({});
  Logger.log('[lineNotifyNoonTrigger] send=' + JSON.stringify(res));
}

