/**
 * Crm.gs — sends a completed Free Build application to Less Annoying CRM (API v2).
 * Needs one Script Property: LACRM_API_KEY. The key is never stored in code or in the Sheet.
 * Steps: find or create the contact, add a pipeline item in "Keyona HQ" at the "Applied" stage,
 * and add a note with every answer and the UTM data.
 * It never blocks a submission. Every failure is written to the crm_status column.
 * Optional Script Properties: LACRM_USER_ID, LACRM_PIPELINE (default Keyona HQ), LACRM_STAGE (default Applied).
 */
var CRM = {
  URL: 'https://api.lessannoyingcrm.com/v2/',
  PIPELINE: 'Keyona HQ',
  STAGE: 'Applied',
  FORM_ID: 'letstalk-v2',
  CAMPAIGN: 'The Replaceables'
};

var Crm = {
  prop_: function (k) {
    try { return String(PropertiesService.getScriptProperties().getProperty(k) || '').trim(); } catch (e) { return ''; }
  },

  call_: function (fn, params) {
    var key = this.prop_('LACRM_API_KEY');
    if (!key) throw new Error('no_key');
    var r = UrlFetchApp.fetch(CRM.URL, {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { Authorization: key },
      payload: JSON.stringify({ Function: fn, Parameters: params || {} })
    });
    var code = r.getResponseCode(), txt = r.getContentText(), j = null;
    try { j = JSON.parse(txt); } catch (e) {}
    if (code < 200 || code >= 300) throw new Error(fn + ' HTTP ' + code + ' ' + String(txt).slice(0, 200));
    return j || {};
  },

  userId_: function () {
    var p = this.prop_('LACRM_USER_ID');
    if (p) return Number(p) || p;
    var u = this.call_('GetUser', {});
    var id = u.UserId || (u.Result && u.Result.UserId);
    if (!id) throw new Error('GetUser returned no UserId');
    return id;
  },

  /** Returns { pipelineId, statusId } or null when the pipeline or stage is missing. */
  stage_: function () {
    var pName = (this.prop_('LACRM_PIPELINE') || CRM.PIPELINE).toLowerCase();
    var sName = (this.prop_('LACRM_STAGE') || CRM.STAGE).toLowerCase();
    var res = this.call_('GetPipelines', {});
    var list = Array.isArray(res) ? res : (res.Results || res.Pipelines || res.Result || []);
    if (!Array.isArray(list)) list = [];
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (String(p.Name || '').toLowerCase() !== pName) continue;
      var st = p.Statuses || p.Stages || [];
      for (var k = 0; k < st.length; k++) {
        if (String(st[k].Name || st[k].StatusName || '').toLowerCase() === sName) {
          return { pipelineId: p.PipelineId || p.Id, statusId: st[k].StatusId || st[k].Id };
        }
      }
      return { pipelineId: p.PipelineId || p.Id, statusId: null };
    }
    return null;
  },

  findContact_: function (email) {
    var res = this.call_('GetContacts', { SearchTerms: email });
    var list = res.Results || [];
    for (var i = 0; i < list.length; i++) {
      var em = list[i].Email || [];
      for (var k = 0; k < em.length; k++) {
        var t = String(em[k].Text || em[k].Email || '').toLowerCase();
        if (t === email.toLowerCase()) return list[i].ContactId;
      }
    }
    return null;
  },

  /** Splits a full name on the last space: "Ada May Lovelace" -> { FirstName: "Ada May", LastName: "Lovelace" }. */
  splitName_: function (name) {
    var s = String(name || '').trim().replace(/\s+/g, ' ');
    var i = s.lastIndexOf(' ');
    if (i <= 0) return { FirstName: s, LastName: '' };
    return { FirstName: s.slice(0, i), LastName: s.slice(i + 1) };
  },

  createContact_: function (name, email, userId) {
    var base = { IsCompany: false, AssignedTo: userId, Name: this.splitName_(name) };
    try {
      var r = this.call_('CreateContact', Object.assign({}, base, { Email: [{ Email: email, Type: 'Work' }] }));
      return r.ContactId;
    } catch (e) {
      var r2 = this.call_('CreateContact', Object.assign({}, base, { Email: [{ Text: email, Type: 'Work' }] }));
      return r2.ContactId;
    }
  },

  noteText_: function (d, a, meta, status, priority) {
    var lines = ['Free build application (' + CRM.CAMPAIGN + ')', 'Result: ' + status + (priority !== '' ? ' (score ' + priority + ')' : ''), ''];
    d.questions.forEach(function (q) {
      if (LAYOUT_TYPES[q.type]) return;
      var v = a[q.id];
      lines.push((q.label || q.id) + ': ' + (v == null || v === '' ? '(blank)' : v));
    });
    lines.push('', 'Source data');
    ATTR_COLS.forEach(function (k) { lines.push(k + ': ' + (meta[k] || '(none)')); });
    return lines.join('\n');
  },

  /** Main entry. Returns a short status string for the sheet. */
  push: function (d, a, sid, meta, status, priority) {
    if (d.priv.formId.toLowerCase() !== CRM.FORM_ID.toLowerCase()) return 'skipped';
    if (!this.prop_('LACRM_API_KEY')) return 'no_key';
    var email = String(a.q_email || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return 'no_email';
    if (Letstalk.isTest_(a)) return 'test_skipped';

    var userId = this.userId_();
    var contactId = this.findContact_(email), made = false;
    if (!contactId) {
      contactId = this.createContact_(String(a.q_name || email).trim(), email, userId);
      made = true;
    }
    if (!contactId) throw new Error('no ContactId');

    var out = made ? 'contact_created' : 'contact_found';
    var note = this.noteText_(d, a, meta, status, priority === undefined ? '' : priority);
    var st = null;
    try { st = this.stage_(); } catch (e) { console.error('crm stage lookup failed: ' + errMsg_(e)); }
    if (st && st.statusId) {
      this.call_('CreatePipelineItem', { ContactId: contactId, PipelineId: st.pipelineId, StatusId: st.statusId, Note: note });
      out += '+pipeline';
    } else {
      this.call_('CreateNote', { ContactId: contactId, Note: note });
      out += st ? '+note_only(no_Applied_stage)' : '+note_only(no_pipeline)';
    }
    return out;
  }
};

/** Writes the CRM result into the crm_status column of the response row. */
function crmSync_(d, a, sid, status, priority) {
  var msg = '';
  var tgt = target_(d), at = Letstalk.rowOf_(tgt.sheet, sid);
  try {
    var meta = Attribution.read_(tgt.sheet, at);
    msg = Crm.push(d, a, sid, meta, status, priority);
  } catch (e) {
    msg = 'error: ' + String(errMsg_(e)).slice(0, 180);
    console.error('crm failed: ' + errMsg_(e));
  }
  try {
    if (at > 0) tgt.sheet.getRange(at, Letstalk.col_(tgt.sheet, 'crm_status', true)).setValue(safe_(msg));
  } catch (e2) {}
  return msg;
}

/** Run once from the editor to check the key and stage setup. Reads only. */
function crmCheck() {
  var out = { key: !!Crm.prop_('LACRM_API_KEY') };
  if (!out.key) return out;
  try { out.userId = Crm.userId_(); } catch (e) { out.userError = errMsg_(e); }
  try { out.stage = Crm.stage_(); } catch (e2) { out.stageError = errMsg_(e2); }
  return out;
}
