/**
 * Data.gs — the only file that reads Sheet tabs for config. Batch reads, ISO dates.
 */
var FORMS_HEADERS = ['FormID', 'Title', 'Status', 'Description', 'WelcomeTitle', 'WelcomeText', 'StartButton',
  'ThankYouTitle', 'ThankYouText', 'RedirectURL', 'NotifyEmail', 'ThemeBg', 'ThemeText', 'ThemeAccent',
  'Font', 'LogoURL', 'SheetID', 'CreatedAt'];
var QUESTIONS_HEADERS = ['FormID', 'Order', 'QuestionID', 'Type', 'Label', 'Description', 'Required', 'Options',
  'Rows', 'Min', 'Max', 'LeftLabel', 'RightLabel', 'Placeholder', 'Link', 'Logic'];
var SETTINGS_HEADERS = ['Key', 'Value', 'Notes'];
var TYPE_LIST = ['welcome', 'statement', 'short_text', 'long_text', 'email', 'phone', 'url', 'number',
  'multiple_choice', 'checkbox', 'dropdown', 'yes_no', 'rating', 'opinion_scale', 'nps', 'ranking',
  'date', 'time', 'file_upload', 'matrix', 'picture_choice', 'legal', 'signature', 'payment'];

var Data = {
  ss: function () {
    try {
      var a = SpreadsheetApp.getActiveSpreadsheet();
      if (a) return a;
    } catch (e) {}
    var id = PropertiesService.getScriptProperties().getProperty('SS_ID');
    if (id) return SpreadsheetApp.openById(id);
    throw new Error('No spreadsheet found. Open the Sheet once so the script can store its ID.');
  },

  table: function (name) {
    var sh = this.ss().getSheetByName(name);
    if (!sh || sh.getLastRow() < 2) return [];
    var v = sh.getDataRange().getValues();
    var h = v[0].map(String);
    var out = [];
    for (var i = 1; i < v.length; i++) {
      var o = {}, any = false;
      for (var j = 0; j < h.length; j++) {
        var c = v[i][j];
        if (c instanceof Date) c = c.toISOString();
        o[h[j]] = c;
        if (c !== '' && c !== null) any = true;
      }
      if (any) out.push(o);
    }
    return out;
  },

  tab: function (ss, name, headers) {
    var sh = ss.getSheetByName(name);
    if (sh) return sh;
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
    return sh;
  },

  ensure: function () {
    var lock = LockService.getScriptLock();
    lock.waitLock(15000);
    try {
      var ss = this.ss();
      var forms = this.tab(ss, 'Forms', FORMS_HEADERS);
      var qs = this.tab(ss, 'Questions', QUESTIONS_HEADERS);
      this.tab(ss, 'Settings', SETTINGS_HEADERS);
      this.validation_(forms, qs);
      if (!this.setting('PREVIEW_KEY')) {
        this.setSetting('PREVIEW_KEY', Utilities.getUuid().replace(/-/g, '').slice(0, 16),
          'Add &key=THIS to a draft form link to preview it. Draft forms never save answers.');
      }
      if (this.setting('FRONTEND_URL') === null) {
        this.setSetting('FRONTEND_URL', '', 'Your form page URL from the setup wizard. Used by the Show my form links menu.');
      }
      try { PropertiesService.getScriptProperties().setProperty('SS_ID', ss.getId()); } catch (e) {}
    } finally {
      lock.releaseLock();
    }
  },

  validation_: function (forms, qs) {
    var rule = function (list) {
      return SpreadsheetApp.newDataValidation().requireValueInList(list, true).setAllowInvalid(false).build();
    };
    if (forms.getLastRow() < 2 || !forms.getRange(2, 3).getDataValidation()) {
      forms.getRange(2, 3, 500, 1).setDataValidation(rule(['draft', 'live', 'closed']));
    }
    if (qs.getLastRow() < 2 || !qs.getRange(2, 4).getDataValidation()) {
      qs.getRange(2, 4, 2000, 1).setDataValidation(rule(TYPE_LIST));
      qs.getRange(2, 7, 2000, 1).setDataValidation(rule(['TRUE', 'FALSE']));
    }
  },

  setting: function (key) {
    var rows = this.table('Settings');
    for (var i = 0; i < rows.length; i++) if (String(rows[i].Key) === key) return String(rows[i].Value);
    return null;
  },

  setSetting: function (key, value, notes) {
    var sh = this.ss().getSheetByName('Settings');
    var v = sh.getDataRange().getValues();
    for (var i = 1; i < v.length; i++) {
      if (String(v[i][0]) === key) { sh.getRange(i + 1, 2).setValue(value); return; }
    }
    sh.appendRow([key, value, notes || '']);
  }
};
