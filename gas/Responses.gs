/**
 * Responses.gs — saves answers (partial or complete) and uploads.
 * One response tab per form (R_<FormID>). The form ID decides the tab, so forms never mix.
 * Response tabs are plain-text formatted. Values that start with = + - @ get a leading
 * apostrophe so Sheets never runs them as formulas.
 * Google calls that fail for a short time are retried with backoff (retry_).
 * Uploads go to Drive by default. Settings tab key UPLOAD_STORAGE: drive (default), cloudinary, auto.
 * v1.1.1: the notify email is HTML (styled with the form accent color) with a plain-text fallback.
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
    var wasComplete = false, late = false;
    try {
      retry_(function () {
      wasComplete = false; late = false;
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
        if (wasComplete && !complete) { late = true; return; } // late partial: keep final answers
      } else {
        vals = []; for (var c = 0; c < width; c++) vals.push('');
        vals[0] = now; vals[1] = sid;
      }
      vals[2] = complete ? 'complete' : 'partial';
      vals[3] = now;
      Object.keys(clean).forEach(function (k) { if (tgt.cols[k]) vals[tgt.cols[k] - 1] = safe_(clean[k]); });
      var rowAt = at > 0 ? at : tgt.sheet.getLastRow() + 1;
      tgt.sheet.getRange(rowAt, 1, 1, width).setValues([vals]);
      try { Attribution.write_(tgt.sheet, rowAt, p.meta); } catch (me) { console.error('attribution failed: ' + errMsg_(me)); }
      });
    } catch (err) {
      console.error('save failed: ' + errMsg_(err));
      return { ok: false, error: 'storage_unavailable' };
    } finally {
      lock.releaseLock();
    }
    if (late) return { ok: true, status: 'complete' };
    // Free Build campaign: score, email, and return a result screen. Never fail the save over this.
    var result = null;
    if (complete && Letstalk.handles(d.priv.formId)) {
      try { result = wasComplete ? Letstalk.again(d, clean, sid) : Letstalk.process(d, clean, sid); }
      catch (err2) { console.error('letstalk failed: ' + errMsg_(err2)); result = null; }
    }
    if (complete && !wasComplete) {
      try { crmSync_(d, clean, sid, result ? result.status : 'complete', ''); } catch (e3) { console.error('crmSync failed: ' + errMsg_(e3)); }
    }
    if (complete && !wasComplete && !result) notify_(d, clean, p.meta);
    var out = { ok: true, status: complete ? 'complete' : 'partial' };
    if (result) out.result = result;
    return out;
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

    var mode = String(Data.setting('UPLOAD_STORAGE') || 'drive').toLowerCase();
    var order = mode === 'cloudinary' ? ['cloudinary', 'drive'] : mode === 'auto' ? ['drive', 'cloudinary'] : ['drive'];
    var fileName = sid.slice(0, 8) + '_' + q.id + '_' + name;
    for (var k = 0; k < order.length; k++) {
      try {
        var url = order[k] === 'drive'
          ? retry_(function () { return driveSave_(b64, mime, fileName, d.priv.formId); })
          : cloudSave_(b64, mime, d.priv.formId);
        return { ok: true, url: url, name: name };
      } catch (err) {
        console.error('upload to ' + order[k] + ' failed: ' + errMsg_(err));
      }
    }
    return { ok: false, error: 'storage_unavailable' };
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

function notifyEsc_(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Owner email for a finished response. HTML with inline styles (email clients ignore style tags),
 * plus a plain-text body for clients that cannot show HTML. The accent color comes from the form theme.
 * Reply-To is the respondent's email when the form has an email question, so Reply goes to them.
 */
function notify_(d, clean, meta) {
  if (!d.priv.notify) return;
  try {
    var qs = d.questions.filter(function (q) { return !LAYOUT_TYPES[q.type]; });
    var th = (d.pub && d.pub.theme) || {};
    var accent = /^#[0-9a-f]{6}$/i.test(String(th.accent || '')) ? th.accent : '#1A9E9E';
    var piped = function (t) {
      return String(t || '').replace(/\{\{\s*([\w-]+)\s*\}\}/g, function (m, k) { return clean[k] == null ? '' : String(clean[k]); });
    };
    var replyTo = '';
    qs.forEach(function (q) {
      var v = String(clean[q.id] || '');
      if (q.type === 'email' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) replyTo = v;
    });
    var when = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'MMM d, yyyy h:mm a z');

    var text = qs.map(function (q) {
      return piped(q.label || q.id) + ': ' + (clean[q.id] || '(blank)');
    }).join('\n\n');

    var rows = qs.map(function (q) {
      var v = String(clean[q.id] || '');
      var shown = v
        ? notifyEsc_(v).replace(/\n/g, '<br>')
        : '<span style="color:#6B7075;font-style:italic">Left blank</span>';
      return '<tr><td style="padding:14px 24px;border-top:1px solid #E7E2D8">' +
        '<div style="font:600 12px/1.4 Arial,Helvetica,sans-serif;letter-spacing:.04em;text-transform:uppercase;color:#4A4F55;margin:0 0 4px">' + notifyEsc_(piped(q.label || q.id)) + '</div>' +
        '<div style="font:16px/1.5 Arial,Helvetica,sans-serif;color:#22262B">' + shown + '</div></td></tr>';
    }).join('');

    var src = '';
    if (meta && typeof meta === 'object') {
      var parts = Object.keys(meta).slice(0, 12).map(function (k) {
        return '<tr><td style="padding:2px 12px 2px 0;color:#4A4F55">' + notifyEsc_(k) + '</td><td style="padding:2px 0;color:#22262B">' + notifyEsc_(String(meta[k]).slice(0, 200)) + '</td></tr>';
      });
      if (parts.length) {
        src = '<tr><td style="padding:14px 24px;border-top:1px solid #E7E2D8;background:#F6F3EC">' +
          '<div style="font:600 12px/1.4 Arial,Helvetica,sans-serif;letter-spacing:.04em;text-transform:uppercase;color:#4A4F55;margin:0 0 6px">Where they came from</div>' +
          '<table role="presentation" style="font:13px/1.5 Arial,Helvetica,sans-serif;border-collapse:collapse">' + parts.join('') + '</table></td></tr>';
        text += '\n\nWhere they came from:\n' + Object.keys(meta).slice(0, 12).map(function (k) { return k + ': ' + String(meta[k]).slice(0, 200); }).join('\n');
      }
    }

    var html = '<!doctype html><html><body style="margin:0;padding:0;background:#EFEBE2">' +
      '<table role="presentation" width="100%" style="background:#EFEBE2;border-collapse:collapse"><tr><td align="center" style="padding:24px 12px">' +
      '<table role="presentation" width="100%" style="max-width:600px;background:#FFFFFF;border-collapse:collapse;border-radius:8px;overflow:hidden">' +
      '<tr><td style="height:8px;background:' + accent + ';font-size:0;line-height:0">&nbsp;</td></tr>' +
      '<tr><td style="padding:24px 24px 18px">' +
        '<div style="font:600 12px/1.4 Arial,Helvetica,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:' + accent + ';margin:0 0 6px">New response</div>' +
        '<div style="font:700 24px/1.25 Arial,Helvetica,sans-serif;color:#22262B;margin:0 0 6px">' + notifyEsc_(d.pub.title) + '</div>' +
        '<div style="font:14px/1.4 Arial,Helvetica,sans-serif;color:#4A4F55">' + notifyEsc_(when) + '</div>' +
      '</td></tr>' + rows + src +
      '<tr><td style="padding:16px 24px;border-top:1px solid #E7E2D8;font:12px/1.5 Arial,Helvetica,sans-serif;color:#4A4F55">' +
        (replyTo ? 'Reply to this email to write to ' + notifyEsc_(replyTo) + '.' : 'Sent by your ReRev Forms Engine.') +
      '</td></tr></table></td></tr></table></body></html>';

    var opts = { htmlBody: html, name: String(d.pub.title || 'Forms') };
    if (replyTo) opts.replyTo = replyTo;
    MailApp.sendEmail(d.priv.notify, 'New response: ' + d.pub.title, text, opts);
  } catch (e) { console.error('notify failed', e); }
}

/** Run fn. If Google fails for a short time, wait and try again (3 retries, growing waits). */
function retry_(fn) {
  var waits = [400, 1200, 3000];
  for (var i = 0; ; i++) {
    try { return fn(); } catch (err) {
      if (i >= waits.length || !transient_(err)) throw err;
      Utilities.sleep(waits[i] + Math.floor(Math.random() * 200));
    }
  }
}

function transient_(err) {
  return /limit exceeded|too many times|rate limit|temporar|try again|internal error|timed out|unavailable|server error|service error|backend/i.test(errMsg_(err));
}

function errMsg_(err) { return err && err.message ? err.message : String(err); }

function driveSave_(b64, mime, fileName, formId) {
  var blob = Utilities.newBlob(Utilities.base64Decode(b64), mime, fileName);
  return folder_(formId).createFile(blob).getUrl();
}

/** Unsigned Cloudinary upload. Needs Settings: CLOUDINARY_CLOUD and CLOUDINARY_PRESET (an unsigned preset). No secret is stored. */
function cloudSave_(b64, mime, formId) {
  var cloud = String(Data.setting('CLOUDINARY_CLOUD') || ''), preset = String(Data.setting('CLOUDINARY_PRESET') || '');
  if (!cloud || !preset) throw new Error('Cloudinary is not set up in the Settings tab');
  var r = UrlFetchApp.fetch('https://api.cloudinary.com/v1_1/' + encodeURIComponent(cloud) + '/auto/upload', {
    method: 'post', muteHttpExceptions: true,
    payload: { file: 'data:' + mime + ';base64,' + b64, upload_preset: preset, folder: 'form-uploads/' + formId, public_id: Utilities.getUuid() }
  });
  var code = r.getResponseCode(), body = r.getContentText();
  if (code !== 200) throw new Error('Cloudinary HTTP ' + code + ' ' + body.slice(0, 200));
  return JSON.parse(body).secure_url;
}
