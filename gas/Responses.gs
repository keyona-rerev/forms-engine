/**
 * Responses.gs — saves answers (partial or complete) and uploads.
 * One response tab per form (R_<FormID>). The form ID decides the tab, so forms never mix.
 * Response tabs are plain-text formatted. Values that start with = + - @ get a leading
 * apostrophe so Sheets never runs them as formulas.
 */
var MAX_UPLOAD_B64 = 20000000; // about 15 MB of file
var BLOCKED_EXT = /\.(exe|bat|cmd|com|scr|js|jse|vbs|html?|svg|sh|msi|jar|ps1|apk|dll)$/i;

var Responses = {
  save: function (p) {
    var sid = String(p.sessionId || '');
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(sid)) return { ok: false, error: 'bad_session' };
    if (p.hp) return { ok: true }; // honeypot: bots fill hidden fields
    if (!rate_('sv:' + sid, 80, 600)) return { ok: false, error: 'rate_limited' };

    var d = Forms.def(p.formId);
    if (!d) return { ok: false, error: 'not_found' };
    if (d.pub.status !== 'live') return { ok: false, error: 'closed' };

    var answers = p.answers && typeof p.answers === 'object' ? p.answers : {};
    var qmap = {};
    d.questions.forEach(function (q) { if (!LAYOUT_TYPES[q.type]) qmap[q.id] = q; });

    var complete = p.complete === true;
    if (complete) {
      var visited = Array.isArray(p.visited) ? p.visited : [];
      for (var i = 0; i < d.questions.length; i++) {
        var q = d.questions[i];
        if (q.required && qmap[q.id] && visited.indexOf(q.id) >= 0 && norm_(q, answers[q.id]) === '') {
          return { ok: false, error: 'required', questionId: q.id };
        }
      }
    }

    var clean = {};
    Object.keys(answers).forEach(function (k) { if (qmap[k]) clean[k] = norm_(qmap[k], answers[k]); });

    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    var wasComplete = false;
    try {
      var tgt = target_(d);
      var row = tgt.sheet.getLastRow() > 1 ? tgt.sheet.getRange(2, 2, tgt.sheet.getLastRow() - 1, 1).getValues() : [];
      var at = -1;
      for (var r = 0; r < row.length; r++) if (String(row[r][0]) === sid) { at = r + 2; break; }
      var now = new Date().toISOString();
      var width = tgt.sheet.getLastColumn();
      var vals;
      if (at > 0) {
        vals = tgt.sheet.getRange(at, 1, 1, width).getValues()[0].map(String);
        wasComplete = vals[2] === 'complete';
        if (wasComplete && !complete) return { ok: true, status: 'complete' }; // late partial: keep final answers
      } else {
        vals = []; for (var c = 0; c < width; c++) vals.push('');
        vals[0] = now; vals[1] = sid;
      }
      vals[2] = complete ? 'complete' : 'partial';
      vals[3] = now;
      Object.keys(clean).forEach(function (k) { if (tgt.cols[k]) vals[tgt.cols[k] - 1] = safe_(clean[k]); });
      tgt.sheet.getRange(at > 0 ? at : tgt.sheet.getLastRow() + 1, 1, 1, width).setValues([vals]);
    } finally {
      lock.releaseLock();
    }
    if (complete && !wasComplete) notify_(d, clean);
    return { ok: true, status: complete ? 'complete' : 'partial' };
  },

  upload: function (p) {
    var sid = String(p.sessionId || '');
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(sid)) return { ok: false, error: 'bad_session' };
    if (!rate_('up:' + sid, 12, 3600)) return { ok: false, error: 'rate_limited' };
    var d = Forms.def(p.formId);
    if (!d) return { ok: false, error: 'not_found' };
    if (d.pub.status !== 'live') return { ok: false, error: 'closed' };
    var q = null;
    d.questions.forEach(function (x) { if (x.id === p.questionId) q = x; });
    if (!q || (q.type !== 'file_upload' && q.type !== 'signature')) return { ok: false, error: 'bad_question' };
    var b64 = String(p.data || '');
    if (!b64 || b64.length > MAX_UPLOAD_B64) return { ok: false, error: 'too_large' };

    var name = String(p.fileName || 'file').replace(/[^A-Za-z0-9._ -]/g, '_').slice(0, 80) || 'file';
    var mime = /^[\w.+-]+\/[\w.+-]+$/.test(String(p.mime || '')) ? String(p.mime) : 'application/octet-stream';
    if (q.type === 'signature') { name = 'signature.png'; mime = 'image/png'; }
    if (BLOCKED_EXT.test(name)) return { ok: false, error: 'file_type_blocked' };

    try {
      var blob = Utilities.newBlob(Utilities.base64Decode(b64), mime, sid.slice(0, 8) + '_' + q.id + '_' + name);
      var file = folder_(d.priv.formId).createFile(blob);
      return { ok: true, url: file.getUrl(), name: name };
    } catch (err) {
      // Drive refused the file (storage full or a Drive limit). Log it. Tell the page in plain terms.
      console.error('upload failed: ' + (err && err.message ? err.message : err));
      return { ok: false, error: 'storage_unavailable' };
    }
  }
};

function target_(d) {
  var ss = d.priv.sheetId ? SpreadsheetApp.openById(d.priv.sheetId) : Data.ss();
  var name = ('R_' + d.priv.formId).slice(0, 90);
  var sh = ss.getSheetByName(name);
  var qs = d.questions.filter(function (q) { return !LAYOUT_TYPES[q.type]; });
  var base = ['Timestamp', 'SessionID', 'Status', 'Updated'];
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).setNumberFormat('@');
    sh.getRange(1, 1, 1, base.length).setValues([base]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  var width = Math.max(sh.getLastColumn(), base.length);
  var header = sh.getRange(1, 1, 1, width).getValues()[0].map(String);
  var cols = {};
  header.forEach(function (h, i) { var m = h.match(/\[([^\]]+)\]$/); if (m) cols[m[1]] = i + 1; });
  var add = qs.filter(function (q) { return !cols[q.id]; });
  if (add.length) {
    var start = Math.max(sh.getLastColumn(), base.length) + 1;
    if (sh.getMaxColumns() < start + add.length - 1) sh.insertColumnsAfter(sh.getMaxColumns(), start + add.length - 1 - sh.getMaxColumns());
    sh.getRange(1, start, sh.getMaxRows(), add.length).setNumberFormat('@');
    sh.getRange(1, start, 1, add.length).setValues([add.map(function (q) { return safe_((q.label || q.id).slice(0, 80)) + ' [' + q.id + ']'; })]).setFontWeight('bold');
    add.forEach(function (q, i) { cols[q.id] = start + i; });
  }
  return { sheet: sh, cols: cols };
}

function norm_(q, v) {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.map(String).join(q.type === 'ranking' ? ' > ' : ' | ').slice(0, 5000);
  if (typeof v === 'object') return Object.keys(v).map(function (k) { return k + ': ' + v[k]; }).join('; ').slice(0, 5000);
  return String(v).slice(0, 10000);
}

/** A leading apostrophe makes Sheets store the value as text, so answers never run as formulas. */
function safe_(s) {
  s = String(s);
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
}

function folder_(formId) {
  var name = 'Form Uploads - ' + formId, it = DriveApp.getFoldersByName(name);
  return it.hasNext() ? it.next() : DriveApp.createFolder(name);
}

function rate_(key, max, ttl) {
  var c = CacheService.getScriptCache();
  var n = Number(c.get(key) || 0) + 1;
  c.put(key, String(n), ttl);
  return n <= max;
}

function notify_(d, clean) {
  if (!d.priv.notify) return;
  try {
    var lines = d.questions.filter(function (q) { return !LAYOUT_TYPES[q.type]; }).map(function (q) {
      return (q.label || q.id) + ': ' + (clean[q.id] || '(blank)');
    });
    MailApp.sendEmail(d.priv.notify, 'New response: ' + d.pub.title, lines.join('\n\n'));
  } catch (e) { console.error('notify failed', e); }
}
