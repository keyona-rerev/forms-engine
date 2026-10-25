/**
 * Attribution.gs — saves where a lead came from.
 * The form page sends meta (utm_*, fbclid, landing_page, referrer) with every save.
 * Each key gets its own column on the response tab. First touch wins: a filled cell is never overwritten.
 */
var ATTR_COLS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'landing_page', 'referrer', 'fbclid'];

var Attribution = {
  clean_: function (meta) {
    var out = {};
    if (!meta || typeof meta !== 'object') return out;
    ATTR_COLS.forEach(function (k) {
      var v = meta[k];
      if (v === undefined || v === null || typeof v === 'object') return;
      v = String(v).replace(/[\r\n\t]+/g, ' ').trim().slice(0, 300);
      if (v) out[k] = v;
    });
    return out;
  },

  /** Writes the meta values onto row `at` of `sheet`. Skips cells that already hold a value. */
  write_: function (sheet, at, meta) {
    var m = this.clean_(meta), keys = Object.keys(m);
    if (!keys.length || !(at > 0)) return m;
    keys.forEach(function (k) {
      var c = Letstalk.col_(sheet, k, true);
      var cell = sheet.getRange(at, c);
      if (String(cell.getValue() || '') === '') cell.setValue(safe_(m[k]));
    });
    return m;
  },

  /** Reads stored meta back from a row (used by the CRM sync). */
  read_: function (sheet, at) {
    var out = {};
    ATTR_COLS.forEach(function (k) {
      var c = Letstalk.col_(sheet, k, false);
      if (c && at > 0) { var v = String(sheet.getRange(at, c).getValue() || ''); if (v) out[k] = v.replace(/^'/, ''); }
    });
    return out;
  }
};
