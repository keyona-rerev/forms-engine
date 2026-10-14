/**
 * ReRev Forms Engine — router only.
 * One deployment serves many forms. Every request names its form.
 * GET  ?action=form&id=FORMID[&key=PREVIEW_KEY]  -> form definition JSON
 * GET  ?action=ping                               -> health check
 * POST {action:'save', ...}                       -> save partial or complete answers
 * POST {action:'upload', ...}                     -> upload a file or signature to Drive
 * POST bodies are sent as text/plain JSON so browsers skip the CORS preflight.
 */
var VERSION = '1.0.3';

function doGet(e) {
  var p = (e && e.parameter) || {};
  try {
    ensureOnce_();
    if (p.action === 'ping') return out_({ ok: true, ts: new Date().toISOString(), version: VERSION });
    if (p.action === 'form') return out_(Forms.publicDef(p.id, p.key));
    return out_({ ok: true, service: 'ReRev Forms Engine', version: VERSION });
  } catch (err) {
    console.error(err && err.stack ? err.stack : err);
    return out_({ ok: false, error: 'server_error' });
  }
}

function doPost(e) {
  var body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (x) {
    return out_({ ok: false, error: 'bad_request' });
  }
  try {
    ensureOnce_();
    if (body.action === 'save') return out_(Responses.save(body));
    if (body.action === 'upload') return out_(Responses.upload(body));
    return out_({ ok: false, error: 'unknown_action' });
  } catch (err) {
    console.error(err && err.stack ? err.stack : err);
    return out_({ ok: false, error: 'server_error' });
  }
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** Simple trigger. Any edit in the Sheet makes the next request read fresh form definitions. */
function onEdit() {
  try { CacheService.getScriptCache().put('ver', String(Date.now()), 21600); } catch (e) {}
}

function ensureOnce_() {
  var c = CacheService.getScriptCache();
  if (c.get('ens')) return;
  Data.ensure();
  c.put('ens', '1', 21600);
}

function serverPing() {
  return { ok: true, ts: new Date().toISOString(), version: VERSION };
}
