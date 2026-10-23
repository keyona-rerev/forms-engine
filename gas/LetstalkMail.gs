/**
 * LetstalkMail.gs — HTML email layouts for the Free Build campaign.
 * Pure string builders. No Apps Script services are used here, so every
 * function can be run and previewed outside Apps Script.
 * Layout rules: table layout, inline CSS only, 560px card (600px for the owner
 * email), every user value HTML-escaped, https-only links, plain-text twin sent
 * by Letstalk.send_ as the fallback body.
 */
var LetstalkMail = {
  C: { bg: '#F0F7F7', ink: '#0D1F2D', body: '#3D5166', muted: '#4A5D70', accent: '#1A9E9E', accentInk: '#0D7E7E', line: '#D5E3E3', white: '#FFFFFF' },
  // Existing ReRev Labs logo (white lettering), trimmed and resized by Cloudinary's URL transform.
  LOGO: 'https://res.cloudinary.com/dialhpycd/image/upload/e_trim/w_320,f_png/v1770670281/rerev_labs_title_logo_afrgnu.png',
  SITE: 'https://rerev.io',
  FONT: "-apple-system,'Segoe UI','Helvetica Neue',Helvetica,Arial,sans-serif",

  esc: function (s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  },
  nl2br: function (s) { return this.esc(s).replace(/\r?\n/g, '<br>'); },
  safeUrl: function (u) {
    u = String(u == null ? '' : u).trim();
    return /^https:\/\/[^\s"'<>]+$/i.test(u) ? u : '';
  },
  mailto: function (e) {
    e = String(e == null ? '' : e).trim();
    return /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']{2,}$/.test(e) ? 'mailto:' + e : '';
  },

  /* ---------- building blocks ---------- */
  p: function (html, extra) {
    return '<p style="margin:0 0 16px 0;font-family:' + this.FONT + ';font-size:16px;line-height:26px;color:' + this.C.body + ';' + (extra || '') + '">' + html + '</p>';
  },
  h1: function (text) {
    return '<h1 style="margin:0 0 16px 0;font-family:' + this.FONT + ';font-size:26px;line-height:33px;font-weight:700;color:' + this.C.ink + ';">' + this.esc(text) + '</h1>';
  },
  /** Bulletproof full-width button. Dark text on the teal accent (5.1:1). */
  button: function (url, label) {
    var u = this.safeUrl(url); if (!u) return '';
    return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 12px 0;"><tr>' +
      '<td align="center" bgcolor="' + this.C.accent + '" style="background:' + this.C.accent + ';border-radius:10px;">' +
      '<a href="' + this.esc(u) + '" target="_blank" style="display:block;padding:17px 24px;font-family:' + this.FONT + ';font-size:18px;line-height:24px;font-weight:700;color:' + this.C.ink + ';text-decoration:none;border-radius:10px;">' + this.esc(label) + '</a>' +
      '</td></tr></table>';
  },
  /** Small readable fallback under a button. */
  fallback: function (url) {
    var u = this.safeUrl(url); if (!u) return '';
    return '<p style="margin:0 0 24px 0;font-family:' + this.FONT + ';font-size:14px;line-height:22px;color:' + this.C.muted + ';">' +
      'Button not working? Copy this link into your browser:<br>' +
      '<a href="' + this.esc(u) + '" target="_blank" style="color:' + this.C.accentInk + ';text-decoration:underline;word-break:break-all;">' + this.esc(u) + '</a></p>';
  },
  signoff: function (lead) {
    return '<p style="margin:8px 0 0 0;font-family:' + this.FONT + ';font-size:16px;line-height:26px;color:' + this.C.body + ';">' +
      (lead ? this.esc(lead) + '<br>' : '') +
      '<strong style="color:' + this.C.ink + ';">Keyona</strong><br>' +
      '<span style="color:' + this.C.muted + ';">ReRev Labs · <a href="' + this.SITE + '" target="_blank" style="color:' + this.C.accentInk + ';text-decoration:underline;">rerev.io</a></span></p>';
  },

  /** Wraps content rows in the branded shell. width = card max width in px. */
  shell: function (title, preheader, inner, width, footerHtml) {
    var C = this.C, F = this.FONT, w = width || 560;
    return '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">' +
      '<title>' + this.esc(title) + '</title></head>' +
      '<body style="margin:0;padding:0;background:' + C.bg + ';-webkit-text-size-adjust:100%;">' +
      '<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;font-size:1px;line-height:1px;">' + this.esc(preheader) + '</div>' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="' + C.bg + '" style="background:' + C.bg + ';"><tr><td align="center" style="padding:24px 12px;">' +
      '<!--[if mso]><table role="presentation" width="' + w + '" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:' + w + 'px;">' +
      // header band: the logo is white lettering, so it sits on the brand ink color
      '<tr><td bgcolor="' + C.ink + '" style="background:' + C.ink + ';border-radius:12px 12px 0 0;padding:18px 28px;" align="left">' +
      '<a href="' + this.SITE + '" target="_blank" style="text-decoration:none;"><img src="' + this.LOGO + '" width="108" alt="ReRev Labs" style="display:block;border:0;outline:none;width:108px;max-width:108px;height:auto;font-family:' + F + ';font-size:18px;font-weight:700;color:#FFFFFF;"></a>' +
      '</td></tr>' +
      '<tr><td bgcolor="' + C.accent + '" style="background:' + C.accent + ';height:4px;line-height:4px;font-size:4px;">&nbsp;</td></tr>' +
      '<tr><td bgcolor="' + C.white + '" style="background:' + C.white + ';border:1px solid ' + C.line + ';border-top:0;border-radius:0 0 12px 12px;padding:32px 28px;">' + inner + '</td></tr>' +
      '<tr><td align="left" style="padding:18px 8px 0 8px;font-family:' + F + ';font-size:13px;line-height:20px;color:' + C.muted + ';">' + (footerHtml || '') + '</td></tr>' +
      '</table>' +
      '<!--[if mso]></td></tr></table><![endif]-->' +
      '</td></tr></table></body></html>';
  },

  /* ---------- applicant: qualified ---------- */
  qualified: function (v, bookingUrl) {
    var E = this, C = this.C;
    function step(label, text) {
      return '<tr><td style="padding:0 0 14px 0;">' +
        '<div style="font-family:' + E.FONT + ';font-size:12px;line-height:16px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:' + C.accentInk + ';margin:0 0 4px 0;">' + label + '</div>' +
        '<div style="font-family:' + E.FONT + ';font-size:16px;line-height:25px;color:' + C.ink + ';">' + text + '</div></td></tr>';
    }
    var inner =
      this.p('Hi ' + this.esc(v.first) + ',', 'font-size:18px;margin:0 0 12px 0;color:' + C.ink + ';') +
      this.h1("Thanks for applying. You're one of our 10 free builds.") +
      this.p('Book your 60-minute session here:', 'margin:0 0 4px 0;') +
      this.button(bookingUrl, 'Book my session') +
      this.fallback(bookingUrl) +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="' + C.bg + '" style="background:' + C.bg + ';border-radius:10px;margin:0 0 24px 0;"><tr><td style="padding:22px 22px 8px 22px;">' +
      '<div style="font-family:' + E.FONT + ';font-size:18px;line-height:24px;font-weight:700;color:' + C.ink + ';margin:0 0 14px 0;">How it goes</div>' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">' +
      step('First 20 minutes', 'I install and customize your ' + this.esc(v.toolName) + ' on your own accounts.') +
      step('Next 40 minutes', 'I’ll ask how ' + this.esc(v.company) + ' thinks about AI agents and automation, including what you wrote about “' + this.esc(v.workflowShort) + '”. That’s the trade, and there’s no pitch.') +
      '</table></td></tr></table>' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0;"><tr>' +
      '<td width="4" bgcolor="' + C.accent + '" style="background:' + C.accent + ';width:4px;font-size:1px;line-height:1px;">&nbsp;</td>' +
      '<td style="padding:2px 0 2px 16px;font-family:' + E.FONT + ';font-size:16px;line-height:26px;color:' + C.ink + ';">Before the call, please have access to <strong>' + this.esc(v.access) + '</strong> so we can install live.</td></tr></table>' +
      this.signoff('See you soon,');
    return this.shell('Your ReRev free build: book your session', 'Pick a time for your 60-minute session.', inner, 560,
      'You’re getting this because you applied for a ReRev free build. Just reply to this email to reach Keyona.');
  },

  /* ---------- applicant: not a fit ---------- */
  notFit: function (v, newsletterUrl, diyUrl) {
    var C = this.C;
    var diy = this.safeUrl(diyUrl);
    var inner =
      this.p('Hi ' + this.esc(v.first) + ',', 'font-size:18px;margin:0 0 12px 0;color:' + C.ink + ';') +
      this.h1('Thanks for applying.') +
      this.p('This round is for teams planning to invest in automation in the next 90 days, so it isn’t the right fit yet.') +
      this.p('In the meantime, our newsletter shares the systems we build for small teams, free:', 'margin:0 0 4px 0;') +
      this.button(newsletterUrl, 'Get the newsletter') +
      this.fallback(newsletterUrl) +
      (diy ? this.p('Here’s a free guide to get started: <a href="' + this.esc(diy) + '" target="_blank" style="color:' + C.accentInk + ';text-decoration:underline;word-break:break-all;">' + this.esc(diy) + '</a>') : '') +
      this.signoff('');
    return this.shell("Thanks for applying to ReRev's free build", 'This round isn’t the right fit yet. Our newsletter is free.', inner, 560,
      'You’re getting this because you applied for a ReRev free build.');
  },

  /* ---------- owner notification ---------- */
  /**
   * ctx: { status, reasons[], priority, company, rows:[{label, value, kind}], noBooking, approveEmail, sheetLink }
   * Every row is shown, blank answers included.
   */
  owner: function (ctx) {
    var E = this, C = this.C, F = this.FONT;
    var isQ = ctx.status === 'qualified';
    var pillBg = isQ ? '#DDF3F0' : '#FFF1CC', pillFg = isQ ? '#0B5E5E' : '#7A4B00';
    function stat(label, valueHtml) {
      return '<td valign="top" style="padding:14px 16px;border:1px solid ' + C.line + ';border-radius:8px;" width="33%">' +
        '<div style="font-family:' + F + ';font-size:12px;line-height:16px;font-weight:700;letter-spacing:1.1px;text-transform:uppercase;color:' + C.muted + ';margin:0 0 4px 0;">' + label + '</div>' +
        '<div style="font-family:' + F + ';font-size:18px;line-height:24px;font-weight:700;color:' + C.ink + ';">' + valueHtml + '</div></td>';
    }
    var rows = (ctx.rows || []).map(function (r) {
      var val;
      var raw = r.value == null ? '' : String(r.value);
      if (!raw.trim()) val = '<span style="color:' + C.muted + ';font-style:italic;">(blank)</span>';
      else if (r.kind === 'email' && E.mailto(raw)) val = '<a href="' + E.esc(E.mailto(raw)) + '" style="color:' + C.accentInk + ';text-decoration:underline;word-break:break-all;">' + E.esc(raw) + '</a>';
      else if (r.kind === 'url' && E.safeUrl(raw)) val = '<a href="' + E.esc(E.safeUrl(raw)) + '" target="_blank" style="color:' + C.accentInk + ';text-decoration:underline;word-break:break-all;">' + E.esc(raw) + '</a>';
      else val = E.nl2br(raw);
      return '<tr><td style="padding:14px 0;border-top:1px solid ' + C.line + ';">' +
        '<div style="font-family:' + F + ';font-size:13px;line-height:19px;color:' + C.muted + ';margin:0 0 3px 0;">' + E.esc(r.label) + '</div>' +
        '<div style="font-family:' + F + ';font-size:16px;line-height:24px;color:' + C.ink + ';word-break:break-word;">' + val + '</div></td></tr>';
    }).join('');

    var warn = ctx.noBooking
      ? '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px 0;"><tr><td bgcolor="#FFF1CC" style="background:#FFF1CC;border:1px solid #E8C766;border-radius:8px;padding:14px 16px;font-family:' + F + ';font-size:15px;line-height:23px;color:#5E3A00;font-weight:700;">NO BOOKING URL SET. Email this applicant a booking link by hand, then set LETSTALK_BOOKING_URL in the Settings tab.</td></tr></table>'
      : '';
    var approve = '';
    if (ctx.status === 'review' && ctx.approveEmail) {
      var mt = this.mailto(ctx.approveEmail);
      approve = '<p style="margin:0 0 4px 0;font-family:' + F + ';font-size:16px;line-height:26px;color:' + C.ink + ';"><strong>To approve:</strong> reply to ' +
        (mt ? '<a href="' + this.esc(mt) + '" style="color:' + C.accentInk + ';text-decoration:underline;">' + this.esc(ctx.approveEmail) + '</a>' : this.esc(ctx.approveEmail)) +
        ' with your booking link.</p>';
    }
    var sheet = this.safeUrl(ctx.sheetLink);
    var inner =
      '<div style="font-family:' + F + ';font-size:12px;line-height:16px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:' + C.accentInk + ';margin:0 0 6px 0;">New free-build application</div>' +
      '<h1 style="margin:0 0 14px 0;font-family:' + F + ';font-size:26px;line-height:32px;font-weight:700;color:' + C.ink + ';word-break:break-word;">' + this.esc(ctx.company) + '</h1>' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px 0;"><tr>' +
      stat('Status', '<span style="display:inline-block;padding:3px 10px;border-radius:999px;background:' + pillBg + ';color:' + pillFg + ';font-size:15px;line-height:22px;">' + this.esc(ctx.status) + '</span>') +
      '<td width="10" style="font-size:1px;line-height:1px;">&nbsp;</td>' +
      stat('Priority', this.esc(ctx.priority) + '<span style="font-size:13px;color:' + C.muted + ';font-weight:400;"> / 100</span>') +
      '</tr></table>' +
      '<div style="margin:0 0 20px 0;font-family:' + F + ';font-size:15px;line-height:23px;color:' + C.body + ';"><strong style="color:' + C.ink + ';">Reasons:</strong> ' + this.esc((ctx.reasons || []).join('; ') || '(none)') + '</div>' +
      warn + approve +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:12px 0 8px 0;">' + rows + '<tr><td style="border-top:1px solid ' + C.line + ';font-size:1px;line-height:1px;">&nbsp;</td></tr></table>' +
      (sheet ? this.button(sheet, 'Open sheet row') + this.fallback(sheet) : '');
    return this.shell('[Free build] ' + ctx.status + ': ' + ctx.company, ctx.status + ' · ' + ctx.company + ' · score ' + ctx.priority, inner, 600, 'Internal notification from the ReRev Forms Engine.');
  }
};
