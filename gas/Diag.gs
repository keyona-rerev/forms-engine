/**
 * Diag.gs — diagnostics and an hourly health check.
 *
 * Menu: Forms Engine > Run diagnostics        (13 tests, report in a copy box)
 *       Forms Engine > Turn on hourly health check / Turn off hourly health check
 *
 * The tests use two paths. The built-in services (DriveApp, SpreadsheetApp) give vague errors.
 * The Google Drive REST API names the real reason (userRateLimitExceeded, storageQuotaExceeded, ...).
 * Test files go to the Drive trash. Nothing is deleted.
 */
function diagRest_(method, url, body) {
  var o = { method: method, headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true };
  if (body) { o.contentType = 'application/json'; o.payload = JSON.stringify(body); }
  var r = UrlFetchApp.fetch(url, o), txt = r.getContentText(), code = r.getResponseCode(), reason = '';
  try {
    var j = JSON.parse(txt);
    if (j.error) reason = (j.error.errors && j.error.errors[0] ? j.error.errors[0].reason : j.error.status) + ' | ' + j.error.message;
  } catch (x) {}
  return { code: code, txt: txt, reason: reason, ok: code >= 200 && code < 300 };
}

function diagErr_(e) {
  var s = (e && e.name ? e.name + ': ' : '') + (e && e.message ? e.message : String(e));
  var st = e && e.stack ? String(e.stack).split('\n')[1] : '';
  return s + (st ? ' @' + st.trim() : '');
}

function runDiagnostics() {
  var R = [];
  function step(name, fn) {
    var s = Date.now();
    try {
      var out = fn();
      R.push({ t: name, ok: true, ms: Date.now() - s, d: out === undefined ? '' : String(out) });
    } catch (e) {
      R.push({ t: name, ok: false, ms: Date.now() - s, d: diagErr_(e) });
    }
  }
  function need(r) {
    if (!r.ok) throw new Error('HTTP ' + r.code + ' ' + (r.reason || r.txt.slice(0, 300)));
    return 'HTTP ' + r.code;
  }

  step('1 Time and script version', function () {
    return 'now=' + new Date().toISOString() + ' | version=' + (typeof VERSION !== 'undefined' ? VERSION : '?');
  });
  step('2 Drive storage (DriveApp)', function () {
    return 'used=' + Math.round(DriveApp.getStorageUsed() / 1e6) + ' MB | limit=' + Math.round(DriveApp.getStorageLimit() / 1e9) + ' GB';
  });
  step('3 Drive READ (DriveApp)', function () { return 'root=' + DriveApp.getRootFolder().getName(); });
  step('4 Drive WRITE: make file, then trash (DriveApp)', function () {
    DriveApp.createFile('rerev_diag_' + Date.now() + '.txt', 'x').setTrashed(true);
    return 'created and trashed';
  });
  step('5 Drive WRITE: make folder, then trash (DriveApp)', function () {
    DriveApp.createFolder('rerev_diag_' + Date.now()).setTrashed(true);
    return 'created and trashed';
  });
  step('6 Sheets READ (SpreadsheetApp)', function () {
    return 'Forms tab rows=' + Data.ss().getSheetByName('Forms').getLastRow();
  });
  step('7 Sheets WRITE and read back (SpreadsheetApp)', function () {
    var ss = Data.ss(), sh = ss.getSheetByName('Diagnostics') || ss.insertSheet('Diagnostics');
    var v = 'w' + Date.now();
    sh.getRange('A1').setValue(v);
    SpreadsheetApp.flush();
    if (String(sh.getRange('A1').getValue()) !== v) throw new Error('read back did not match');
    return 'ok';
  });
  step('8 Cache write and read', function () {
    var c = CacheService.getScriptCache();
    c.put('diag', 'ok', 60);
    if (c.get('diag') !== 'ok') throw new Error('cache read back failed');
    return 'ok';
  });
  step('9 Script lock', function () {
    var l = LockService.getScriptLock();
    l.waitLock(5000);
    l.releaseLock();
    return 'ok';
  });
  step('10 REST Drive: about (storage and user)', function () {
    var r = diagRest_('GET', 'https://www.googleapis.com/drive/v3/about?fields=storageQuota,user(emailAddress)');
    need(r);
    return r.txt.replace(/\s+/g, ' ').slice(0, 400);
  });
  step('11 REST Drive WRITE: make empty file, then trash', function () {
    var r = diagRest_('POST', 'https://www.googleapis.com/drive/v3/files?fields=id', { name: 'rerev_diag_rest_' + Date.now() + '.txt', mimeType: 'text/plain' });
    need(r);
    need(diagRest_('PATCH', 'https://www.googleapis.com/drive/v3/files/' + JSON.parse(r.txt).id, { trashed: true }));
    return 'created and trashed';
  });
  step('12 Five quick Drive writes in a row (speed check)', function () {
    var ms = [];
    for (var i = 0; i < 5; i++) {
      var s = Date.now(), f = DriveApp.createFile('rerev_diag_burst_' + i + '_' + s + '.txt', 'x');
      ms.push(Date.now() - s);
      f.setTrashed(true);
    }
    return 'ms each: ' + ms.join(', ');
  });

  var lines = ['ReRev Forms Engine diagnostics', new Date().toISOString(), ''];
  var bad = 0;
  R.forEach(function (x) {
    if (!x.ok) bad++;
    lines.push((x.ok ? 'PASS ' : 'FAIL ') + x.t + ' (' + x.ms + ' ms)');
    if (x.d) lines.push('     ' + x.d);
  });
  lines.push('', bad ? bad + ' test(s) failed. Send this whole report to Claude.' : 'All tests passed.');
  var report = lines.join('\n');
  Logger.log(report);
  console.log(report);
  try {
    var sh = Data.ss().getSheetByName('Diagnostics') || Data.ss().insertSheet('Diagnostics');
    sh.getRange(3, 1).setValue('Last report');
    sh.getRange(4, 1).setValue(report);
  } catch (e) {}
  try {
    var html = '<textarea style="width:98%;height:390px;font:12px monospace">' +
      report.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</textarea>';
    SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(760).setHeight(470), 'Diagnostics: copy all of this');
  } catch (e) {}
  return report;
}

/**
 * Hourly health check. One tiny Drive write and one Sheet write.
 * Each run adds one row to the "Health log" tab: time, Drive result, Sheet result.
 * A failure row holds the real Google error reason. If the Sheet cannot be written,
 * the row goes to the Apps Script log instead (Executions page).
 */
function healthProbe() {
  var row = [new Date().toISOString(), '', ''];
  try {
    var r = diagRest_('POST', 'https://www.googleapis.com/drive/v3/files?fields=id', { name: 'rerev_health_' + Date.now() + '.txt', mimeType: 'text/plain' });
    if (r.ok) {
      diagRest_('PATCH', 'https://www.googleapis.com/drive/v3/files/' + JSON.parse(r.txt).id, { trashed: true });
      row[1] = 'ok';
    } else {
      row[1] = 'FAIL HTTP ' + r.code + ' ' + (r.reason || r.txt.slice(0, 200));
    }
  } catch (e) { row[1] = 'FAIL ' + diagErr_(e); }
  try {
    var ss = Data.ss(), log = ss.getSheetByName('Health log');
    if (!log) { log = ss.insertSheet('Health log'); log.appendRow(['Time (UTC)', 'Drive write', 'Sheet write']); log.setFrozenRows(1); }
    row[2] = 'ok';
    log.appendRow(row);
  } catch (e) {
    row[2] = 'FAIL ' + diagErr_(e);
    console.error('HEALTH ' + row.join(' | '));
    return;
  }
  if (row[1] !== 'ok') console.error('HEALTH ' + row.join(' | '));
}

function menuHealthOn() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'healthProbe') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('healthProbe').timeBased().everyHours(1).create();
  healthProbe();
  alert_('Hourly health check is on. See the "Health log" tab.');
}

function menuHealthOff() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'healthProbe') ScriptApp.deleteTrigger(t); });
  alert_('Hourly health check is off.');
}
