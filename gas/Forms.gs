/**
 * Forms.gs — loads and caches one form definition. Public output never includes
 * the notify email, the response Sheet ID, or any other private field.
 */
var DEF_TTL = 120; // seconds
var LAYOUT_TYPES = { welcome: 1, statement: 1 };

var Forms = {
  def: function (id) {
    id = String(id || '').trim();
    if (!/^[A-Za-z0-9_-]{1,60}$/.test(id)) return null;
    var cache = CacheService.getScriptCache();
    var key = 'form:' + (cache.get('ver') || '0') + ':' + id.toLowerCase();
    var hit = cache.get(key);
    if (hit) return JSON.parse(hit);

    var f = null, forms = Data.table('Forms');
    for (var i = 0; i < forms.length; i++) {
      if (String(forms[i].FormID).trim().toLowerCase() === id.toLowerCase()) { f = forms[i]; break; }
    }
    if (!f) return null;

    var fid = String(f.FormID).trim();
    var rows = Data.table('Questions').filter(function (r) {
      return String(r.FormID).trim().toLowerCase() === fid.toLowerCase();
    }).sort(function (a, b) { return Number(a.Order) - Number(b.Order); });

    var status = String(f.Status || 'draft').trim().toLowerCase();
    if (['live', 'draft', 'closed'].indexOf(status) < 0) status = 'draft';

    var d = {
      priv: { formId: fid, notify: str_(f.NotifyEmail), sheetId: str_(f.SheetID) },
      pub: {
        id: fid, title: str_(f.Title) || fid, status: status, description: str_(f.Description),
        welcomeTitle: str_(f.WelcomeTitle), welcomeText: str_(f.WelcomeText), startButton: str_(f.StartButton) || 'Start',
        thankYouTitle: str_(f.ThankYouTitle) || 'Thank you!', thankYouText: str_(f.ThankYouText) || 'Your response was saved.',
        redirectUrl: url_(f.RedirectURL), logoUrl: url_(f.LogoURL), font: str_(f.Font) || 'Inter',
        theme: { bg: color_(f.ThemeBg, '#F0F7F7'), text: color_(f.ThemeText, '#0D1F2D'), accent: color_(f.ThemeAccent, '#1A9E9E') }
      },
      questions: rows.map(function (r, idx) { return question_(r, idx); })
    };
    try { cache.put(key, JSON.stringify(d), DEF_TTL); } catch (e) {}
    return d;
  },

  publicDef: function (id, key) {
    var d = this.def(id);
    if (!d) return { ok: false, error: 'not_found' };
    if (d.pub.status === 'live') return { ok: true, form: d.pub, questions: d.questions };
    if (d.pub.status === 'draft' && key && key === Data.setting('PREVIEW_KEY')) {
      return { ok: true, preview: true, form: d.pub, questions: d.questions };
    }
    return { ok: false, error: 'closed', title: d.pub.title };
  },

  validate: function () {
    var issues = [];
    var forms = Data.table('Forms'), qs = Data.table('Questions');
    var ids = {};
    forms.forEach(function (f) {
      var fid = String(f.FormID).trim();
      if (ids[fid.toLowerCase()]) issues.push('Duplicate FormID: ' + fid);
      ids[fid.toLowerCase()] = true;
      var mine = qs.filter(function (r) { return String(r.FormID).trim().toLowerCase() === fid.toLowerCase(); });
      if (!mine.length) issues.push(fid + ': no questions');
      var seen = {};
      mine.forEach(function (r) { seen[String(r.QuestionID || ('q' + r.Order)).trim()] = true; });
      var used = {};
      mine.forEach(function (r) {
        var qid = String(r.QuestionID || ('q' + r.Order)).trim(), t = String(r.Type).trim();
        if (used[qid]) issues.push(fid + ': duplicate QuestionID ' + qid);
        used[qid] = true;
        if (TYPE_LIST.indexOf(t) < 0) issues.push(fid + '/' + qid + ': unknown Type "' + t + '"');
        if (['multiple_choice', 'checkbox', 'dropdown', 'ranking', 'picture_choice', 'matrix'].indexOf(t) >= 0 && !list_(r.Options).length) issues.push(fid + '/' + qid + ': Options are empty');
        if (t === 'matrix' && !list_(r.Rows).length) issues.push(fid + '/' + qid + ': Rows are empty');
        if (t === 'payment' && !url_(r.Link)) issues.push(fid + '/' + qid + ': Link must start with https://');
        parseLogic_(r.Logic).forEach(function (rule) {
          if (rule.goto !== 'end' && !seen[rule.goto]) issues.push(fid + '/' + qid + ': Logic jumps to unknown ' + rule.goto);
          if (rule.q !== '*' && !seen[rule.q]) issues.push(fid + '/' + qid + ': Logic reads unknown ' + rule.q);
        });
      });
    });
    return issues;
  }
};

function question_(r, idx) {
  var t = String(r.Type || '').trim();
  if (TYPE_LIST.indexOf(t) < 0) t = 'short_text';
  return {
    id: String(r.QuestionID || ('q' + (r.Order || idx + 1))).trim(),
    type: t, label: str_(r.Label), description: str_(r.Description), required: isTrue_(r.Required),
    options: list_(r.Options), rows: list_(r.Rows), min: num_(r.Min), max: num_(r.Max),
    left: str_(r.LeftLabel), right: str_(r.RightLabel), placeholder: str_(r.Placeholder),
    link: url_(r.Link), logic: parseLogic_(r.Logic)
  };
}

/** Logic text: "q3 = Yes => q7; q3 contains No => end; * => q9". Rules run in order. */
function parseLogic_(text) {
  var out = [];
  String(text || '').split(';').forEach(function (part) {
    var m = part.match(/^\s*(\*|\S+)\s*(?:(!=|>=|<=|=|>|<|contains)\s*(.*?))?\s*=>\s*(\S+)\s*$/i);
    if (!m) return;
    out.push({ q: m[1], op: (m[2] || '').toLowerCase(), val: m[3] || '', goto: m[4] });
  });
  return out;
}

function str_(v) { return v === null || v === undefined ? '' : String(v).trim(); }
function isTrue_(v) { return v === true || /^(true|yes|1|y)$/i.test(String(v).trim()); }
function num_(v) { var n = Number(v); return v === '' || v === null || isNaN(n) ? null : n; }
function list_(v) { return String(v || '').split('|').map(function (s) { return s.trim(); }).filter(Boolean); }
function url_(v) { var s = str_(v); return /^https:\/\//i.test(s) ? s : ''; }
function color_(v, d) { var s = str_(v); return /^#[0-9a-f]{3,8}$/i.test(s) ? s : d; }
