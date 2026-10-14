/**
 * Menu.gs — the "Forms Engine" menu inside the Sheet. Runs only in the Sheets UI.
 */
function onOpen() {
  try {
    SpreadsheetApp.getUi().createMenu('Forms Engine')
      .addItem('1. Set up / repair tabs', 'menuSetup')
      .addItem('2. Add demo forms', 'seedDemoForms')
      .addItem('3. Check all forms', 'menuCheck')
      .addItem('4. Show my form links', 'menuLinks')
      .addItem('Clear form cache', 'menuClearCache')
      .addSeparator()
      .addItem('Run diagnostics', 'runDiagnostics')
      .addToUi();
  } catch (e) {}
  try { PropertiesService.getScriptProperties().setProperty('SS_ID', SpreadsheetApp.getActiveSpreadsheet().getId()); } catch (e) {}
}

function menuSetup() {
  Data.ensure();
  CacheService.getScriptCache().put('ens', '1', 21600);
  alert_('Tabs are ready: Forms, Questions, Settings.');
}

function menuCheck() {
  var issues = Forms.validate();
  alert_(issues.length ? 'Fix these:\n\n' + issues.join('\n') : 'All forms look good.');
}

function menuClearCache() {
  CacheService.getScriptCache().put('ver', String(Date.now()), 21600);
  alert_('Cache cleared. Changes show on the next page load.');
}

function menuLinks() {
  var base = Data.setting('FRONTEND_URL') || '(set FRONTEND_URL in the Settings tab first)';
  var key = Data.setting('PREVIEW_KEY');
  var lines = Data.table('Forms').map(function (f) {
    var id = String(f.FormID).trim(), st = String(f.Status || 'draft').toLowerCase();
    return id + ' [' + st + ']: ' + base + '?f=' + id + (st === 'draft' ? '&key=' + key : '');
  });
  alert_(lines.length ? lines.join('\n\n') : 'No forms yet. Use Add demo forms.');
}

function alert_(msg) {
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { console.log(msg); }
}
