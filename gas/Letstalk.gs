/**
 * Letstalk.gs — Free Build campaign: qualification, result screens, emails.
 * Responses.save calls Letstalk.process when a COMPLETE submission arrives
 * for LETSTALK.FORM_ID. Partial saves are never scored and never send email.
 * The booking link lives in Script Properties or the Settings tab. It never
 * reaches the public form JSON.
 * HTML layouts for the emails live in LetstalkMail.gs. Every email still sends
 * the plain-text body as the fallback.
 */

// ===== Free Build campaign: qualification rules (edit freely) =====
var LETSTALK = {
  FORM_ID: 'letstalk-v2',   // change to 'letstalk' if you rename the form at cutover
  // Who counts as a decision-maker (answers to q_approve)
  APPROVER_ANSWERS: ['Yes, I make the call', 'I share the decision with one other person'],
  // Budget: qualifies at or above this band
  BUDGET_ORDER: ['Not yet', 'Under $1K', '$1K–$2.5K', '$2.5K–$5K', '$5K+'],
  BUDGET_MIN: '$1K–$2.5K',
  BUDGET_REVIEW: 'Under $1K',          // one band below the minimum goes to manual review
  // Timeline: qualifies within 90 days
  TIMELINE_OK: ['This month', 'In 1–3 months'],
  TIMELINE_REVIEW: 'In 3–6 months',
  // A "real workflow" = at least this many characters in q_workflow
  WORKFLOW_MIN_CHARS: 40,
  // Hard no's
  EXCLUDED_ROLES: ['Student or job seeker'],
  EXCLUDED_STAGES: [],                 // e.g. ['Pre-revenue, not funded'] to tighten
  // Capacity
  QUALIFIED_CAP: 10,   // matches the public "10 free builds" promise. After this many qualified applicants, new ones become "review"
  // Priority score points
  PTS_BUDGET: { 'Not yet': 0, 'Under $1K': 10, '$1K–$2.5K': 25, '$2.5K–$5K': 35, '$5K+': 40 },
  PTS_TIMELINE: { 'This month': 25, 'In 1–3 months': 20, 'In 3–6 months': 5, 'Just exploring': 0 },
  PTS_HOURS: { 'Under 2': 0, '2–5': 10, '5–10': 15, '10+': 20 },
  PTS_TEAM: { 'Just me': 5, '2–10': 10, '11–50': 15, '51–200': 15, '200+': 15 },
  PTS_FOUNDER: 5,
  // Deposit variant (off by default)
  DEPOSIT_ENABLED: false,
  DEPOSIT_AMOUNT: 100,
  SEND_NOT_FIT_EMAIL: true,
  // Submissions whose name or company starts with this text are tests. Their emails get a [TEST] subject prefix and a TEST banner.
  TEST_MARKER: 'SYNTHETIC TEST',
  // Links and people
  OWNER_EMAIL: 'keyona@rerev.io',
  NEWSLETTER_URL: 'https://keyonameeks.substack.com',
  DIY_URL: '',   // TODO (Keyona): a free guide or resource. Empty = hidden.
  // Per-tool access line for the confirmation email. TODO (Keyona): confirm each.
  TOOL_ACCESS_DEFAULT: 'the Google account you want it built in',
  TOOL_ACCESS: {}   // e.g. { 'Linktree': 'your website domain settings' }
};

var LT_EXTRA_COLS = ['qual_status', 'qual_reasons', 'qual_priority', 'reviewed_by_keyona', 'session_booked'];

var Letstalk = {
  handles: function (formId) {
    return String(formId || '').toLowerCase() === LETSTALK.FORM_ID.toLowerCase();
  },

  /** Score, store, email. Returns the result screen object for the form page. */
  process: function (d, a, sid) {
    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    var res, row;
    try {
      res = this.score_(a);
      if (res.status === 'qualified' && this.countQualified_(d, sid) >= LETSTALK.QUALIFIED_CAP) {
        res.status = 'review';
        res.reasons.push('qualified cap reached (' + LETSTALK.QUALIFIED_CAP + ')');
      }
      row = this.writeRow_(d, sid, res);
    } finally {
      lock.releaseLock();
    }
    var screen = this.screen_(res.status, a);
    try { this.emails_(d, a, res, screen, row); } catch (e) { console.error('letstalk emails failed: ' + errMsg_(e)); }
    return screen;
  },

  /** Same session submitted again: show the stored result. No scoring, no email. */
  again: function (d, a, sid) {
    var tgt = target_(d), col = this.col_(tgt.sheet, 'qual_status', false);
    var status = 'review';
    if (col) {
      var at = this.rowOf_(tgt.sheet, sid);
      if (at > 0) status = String(tgt.sheet.getRange(at, col).getValue() || 'review');
    }
    return this.screen_(status, a);
  },

  score_: function (a) {
    var L = LETSTALK, hard = [], miss = [];
    var role = a.q_role || '', appr = a.q_approve || '', stage = a.q_stage || '';
    var budget = a.q_budget || '', tl = a.q_timeline || '', call = a.q_call || '';
    var wf = String(a.q_workflow || '').trim();
    var bi = L.BUDGET_ORDER.indexOf(budget), min = L.BUDGET_ORDER.indexOf(L.BUDGET_MIN);

    // Rule 1: not_fit
    if (call !== 'Yes') hard.push('declined the 60-minute call');
    if (L.EXCLUDED_ROLES.indexOf(role) >= 0) hard.push('role excluded: ' + role);
    if (L.EXCLUDED_STAGES.indexOf(stage) >= 0) hard.push('stage excluded: ' + stage);
    if (budget === 'Not yet') hard.push('no budget yet');
    if (bi < 0) hard.push('budget answer missing');

    // Misses against "qualified"
    if (L.APPROVER_ANSWERS.indexOf(appr) < 0) miss.push('not the decision-maker');
    if (bi >= 0 && bi < min) {
      if (budget === L.BUDGET_REVIEW) miss.push('budget below min');
      else if (hard.indexOf('no budget yet') < 0) hard.push('budget well below min');
    }
    if (L.TIMELINE_OK.indexOf(tl) < 0) {
      if (tl === L.TIMELINE_REVIEW) miss.push('timeline 3–6 mo');
      else hard.push('timeline: ' + (tl || 'missing'));
    }
    if (wf.length > 0 && wf.length < L.WORKFLOW_MIN_CHARS) miss.push('workflow answer too short');

    var priority = this.priority_(a);
    if (hard.length) return { status: 'not_fit', reasons: hard.concat(miss), priority: priority };
    if (miss.length === 0) return { status: 'qualified', reasons: [], priority: priority };
    if (miss.length === 1) return { status: 'review', reasons: miss, priority: priority };
    return { status: 'not_fit', reasons: miss, priority: priority };
  },

  priority_: function (a) {
    var L = LETSTALK;
    var n = (L.PTS_BUDGET[a.q_budget] || 0) + (L.PTS_TIMELINE[a.q_timeline] || 0) +
      (L.PTS_HOURS[a.q_hours] || 0) + (L.PTS_TEAM[a.q_team] || 0) +
      (a.q_role === 'Founder / CEO / Owner' ? L.PTS_FOUNDER : 0);
    return Math.min(100, n);
  },

  /* ---------- sheet ---------- */
  rowOf_: function (sheet, sid) {
    var last = sheet.getLastRow();
    if (last < 2) return -1;
    var v = sheet.getRange(2, 2, last - 1, 1).getValues();
    for (var r = 0; r < v.length; r++) if (String(v[r][0]) === sid) return r + 2;
    return -1;
  },

  /** Column number for a header. Creates the column when create is true. */
  col_: function (sheet, name, create) {
    var width = Math.max(sheet.getLastColumn(), 1);
    var header = sheet.getRange(1, 1, 1, width).getValues()[0].map(String);
    var i = header.indexOf(name);
    if (i >= 0) return i + 1;
    if (!create) return 0;
    var c = width + 1;
    if (sheet.getMaxColumns() < c) sheet.insertColumnsAfter(sheet.getMaxColumns(), c - sheet.getMaxColumns());
    sheet.getRange(1, c, sheet.getMaxRows(), 1).setNumberFormat('@');
    sheet.getRange(1, c).setValue(name).setFontWeight('bold');
    return c;
  },

  countQualified_: function (d, sid) {
    var tgt = target_(d), col = this.col_(tgt.sheet, 'qual_status', false);
    if (!col || tgt.sheet.getLastRow() < 2) return 0;
    var n = tgt.sheet.getLastRow() - 1;
    var st = tgt.sheet.getRange(2, col, n, 1).getValues();
    var ids = tgt.sheet.getRange(2, 2, n, 1).getValues();
    var c = 0;
    for (var i = 0; i < n; i++) if (String(st[i][0]) === 'qualified' && String(ids[i][0]) !== sid) c++;
    return c;
  },

  /** Writes status, reasons, priority on the submission row. Returns { sheet, row, gid }. */
  writeRow_: function (d, sid, res) {
    var tgt = target_(d), sh = tgt.sheet;
    var at = this.rowOf_(sh, sid);
    LT_EXTRA_COLS.forEach(function (n) { Letstalk.col_(sh, n, true); });
    if (at < 0) return { sheet: sh, row: 0 };
    sh.getRange(at, this.col_(sh, 'qual_status', true)).setValue(res.status);
    sh.getRange(at, this.col_(sh, 'qual_reasons', true)).setValue(safe_(res.reasons.join('; ')));
    sh.getRange(at, this.col_(sh, 'qual_priority', true)).setValue(String(res.priority));
    return { sheet: sh, row: at };
  },

  /* ---------- copy ---------- */
  prop_: function (key) {
    var v = '';
    try { v = PropertiesService.getScriptProperties().getProperty(key) || ''; } catch (e) {}
    if (!v) { try { v = Data.setting(key) || ''; } catch (e2) {} }
    v = String(v).trim();
    return /^https:\/\//i.test(v) ? v : '';
  },

  vars_: function (a) {
    var tool = String(a.q_tool || ''), m = tool.match(/\(replaces\s+([^)]+)\)\s*$/i);
    var oldTool = m ? m[1].trim() : 'old tool';
    var toolName = tool.replace(/\s*\(replaces[^)]*\)\s*$/i, '').trim() || 'tool';
    var wf = String(a.q_workflow || '').replace(/\s+/g, ' ').trim();
    return {
      first: String(a.q_name || '').trim().split(/\s+/)[0] || 'there',
      company: String(a.q_company || '').trim() || 'your team',
      toolName: toolName,
      oldTool: oldTool,
      workflowShort: wf.slice(0, 120),
      access: LETSTALK.TOOL_ACCESS[oldTool] || LETSTALK.TOOL_ACCESS_DEFAULT
    };
  },

  bookingUrl_: function () {
    return LETSTALK.DEPOSIT_ENABLED ? this.prop_('LETSTALK_DEPOSIT_URL') : this.prop_('LETSTALK_BOOKING_URL');
  },

  screen_: function (status, a) {
    var v = this.vars_(a), L = LETSTALK;
    if (status === 'qualified') {
      var url = this.bookingUrl_();
      var s = {
        status: 'qualified',
        title: "You're in, " + v.first + '.',
        text: 'Pick a time for your 60-minute session below. The first 20 minutes we install your ' + v.toolName +
          '; the next 40 we talk about how ' + v.company + ' thinks about AI agents and automation. We also just emailed you this link.'
      };
      if (url) {
        s.buttonLabel = L.DEPOSIT_ENABLED ? 'Hold my spot ($' + L.DEPOSIT_AMOUNT + ', credited to a sprint)' : 'Book my session';
        s.buttonUrl = url;
      } else {
        // Fail safe: no booking link is set yet. Never fall back to the 20-minute link.
        s.text = "You're approved. Keyona will email you a link to book your 60-minute session within 1 business day.";
      }
      return s;
    }
    if (status === 'review') {
      return {
        status: 'review',
        title: 'Thanks, ' + v.first + ". We'll be in touch.",
        text: 'Spots are limited, so Keyona reviews some applications personally. You\'ll hear back within 2 business days.'
      };
    }
    var t = 'This round is for teams planning to invest in automation in the next 90 days, so it isn\'t the right fit yet. In the meantime, our newsletter shares the systems we build for small teams, free.';
    if (L.DIY_URL) t += " Here's a free guide to get started: " + L.DIY_URL;
    return { status: 'not_fit', title: 'Thank you, ' + v.first + '.', text: t, buttonLabel: 'Get the newsletter', buttonUrl: L.NEWSLETTER_URL };
  },

  /* ---------- email ---------- */
  /** Sends plain text always. Adds htmlBody when a layout was built. */
  send_: function (to, subject, body, html) {
    if (!to) return;
    var opt = { to: to, subject: subject, body: body, replyTo: LETSTALK.OWNER_EMAIL, name: 'Keyona Meeks, ReRev Labs' };
    if (html) opt.htmlBody = html;
    try {
      MailApp.sendEmail(opt);
    } catch (e) {
      console.error('letstalk send failed: ' + errMsg_(e));
      if (html) {
        // The HTML layout was refused. Never lose the email: retry as plain text.
        try { delete opt.htmlBody; MailApp.sendEmail(opt); } catch (e2) { console.error('letstalk plain retry failed: ' + errMsg_(e2)); }
      }
    }
  },

  /** Builds an HTML layout. A layout bug must never block the plain-text email. */
  html_: function (fn) {
    try { return fn(); } catch (e) { console.error('letstalk html build failed: ' + errMsg_(e)); return ''; }
  },

  isTest_: function (a) {
    var m = String(LETSTALK.TEST_MARKER || '').toLowerCase();
    if (!m) return false;
    return String(a.q_name || '').trim().toLowerCase().indexOf(m) === 0 || String(a.q_company || '').trim().toLowerCase().indexOf(m) === 0;
  },

  emails_: function (d, a, res, screen, row) {
    var L = LETSTALK, v = this.vars_(a), email = String(a.q_email || '').trim();
    var test = this.isTest_(a), tSub = test ? '[TEST] ' : '', tTxt = test ? 'TEST EMAIL: synthetic submission, not a real applicant.\n\n' : '';
    var okEmail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);

    if (res.status === 'qualified' && okEmail && screen.buttonUrl) {
      this.send_(email, tSub + 'Your ReRev free build: book your session',
        tTxt + 'Hi ' + v.first + ',\n\n' +
        "Thanks for applying. You're one of our 10 free builds.\n\n" +
        'Book your 60-minute session here: ' + screen.buttonUrl + '\n\n' +
        'How it goes: in the first 20 minutes I install and customize your ' + v.toolName + ' on your own accounts. ' +
        'In the next 40, I\'ll ask how ' + v.company + ' thinks about AI agents and automation' + (v.workflowShort ? ', including what you wrote about "' + v.workflowShort + '"' : '') + '. ' +
        "That's the trade, and there's no pitch.\n\n" +
        'Before the call, please have access to ' + v.access + ' so we can install live.\n\n' +
        'See you soon,\nKeyona\nReRev Labs · rerev.io',
        this.html_(function () { return LetstalkMail.qualified(v, screen.buttonUrl, test); }));
    }

    if (res.status === 'not_fit' && okEmail && L.SEND_NOT_FIT_EMAIL) {
      this.send_(email, tSub + "Thanks for applying to ReRev's free build",
        tTxt + 'Hi ' + v.first + ',\n\n' +
        'Thanks for applying. This round is for teams planning to invest in automation in the next 90 days, so it isn\'t the right fit yet.\n\n' +
        'In the meantime, our newsletter shares the systems we build for small teams, free: ' + L.NEWSLETTER_URL +
        (L.DIY_URL ? '\nHere\'s a free guide to get started: ' + L.DIY_URL : '') + '\n\n' +
        'Keyona\nReRev Labs · rerev.io',
        this.html_(function () { return LetstalkMail.notFit(v, L.NEWSLETTER_URL, L.DIY_URL, test); }));
    }

    if (res.status === 'qualified' || res.status === 'review') {
      var link = '';
      try {
        link = row && row.sheet ? Data.ss().getUrl() + '#gid=' + row.sheet.getSheetId() + (row.row ? '&range=A' + row.row : '') : '';
      } catch (e) {}
      var noBooking = res.status === 'qualified' && !screen.buttonUrl;
      var lines = ['Status: ' + res.status, 'Reasons: ' + (res.reasons.join('; ') || '(none)'), 'Priority: ' + res.priority, ''];
      var rows = [];
      d.questions.forEach(function (q) {
        if (LAYOUT_TYPES[q.type]) return;
        lines.push((q.label || q.id) + ': ' + (a[q.id] || '(blank)'));
        var val = a[q.id];
        rows.push({
          label: String(q.label || q.id).replace(/\{\{\s*([\w-]+)\s*\}\}/g, function (m, k) { return a[k] == null ? '' : String(a[k]); }),
          value: Array.isArray(val) ? val.join(', ') : (val == null ? '' : (typeof val === 'object' ? JSON.stringify(val) : String(val))),
          kind: q.type === 'email' ? 'email' : q.type === 'url' ? 'url' : 'text'
        });
      });
      if (noBooking) {
        lines.unshift('NO BOOKING URL SET. Email this applicant a booking link by hand, then set LETSTALK_BOOKING_URL in the Settings tab.', '');
      }
      if (res.status === 'review') lines.push('', 'To approve: reply to ' + email + ' with your booking link.');
      lines.push('', 'Sheet row: ' + link);
      lines.unshift('INTERNAL NOTIFICATION (not sent to the applicant)', '');
      if (test) lines.unshift('TEST EMAIL: synthetic submission, not a real applicant.', '');
      this.send_(L.OWNER_EMAIL,
        tSub + '[Free build] ' + res.status + ': ' + v.company + ' (' + (a.q_budget || '?') + ', ' + (a.q_timeline || '?') + '), score ' + res.priority,
        lines.join('\n'),
        this.html_(function () {
          return LetstalkMail.owner({
            status: res.status, reasons: res.reasons, priority: res.priority, company: v.company,
            rows: rows, noBooking: noBooking, approveEmail: res.status === 'review' ? email : '', sheetLink: link, test: test
          });
        }));
    }
  }
};
