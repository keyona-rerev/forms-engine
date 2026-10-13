/**
 * Demo.gs — two live demo forms. Safe to run more than once: it skips forms that already exist.
 */
function seedDemoForms() {
  Data.ensure();
  var ss = Data.ss();
  var forms = ss.getSheetByName('Forms'), qs = ss.getSheetByName('Questions');
  var have = {};
  Data.table('Forms').forEach(function (f) { have[String(f.FormID).trim()] = true; });
  var now = new Date().toISOString();
  var fRows = [], qRows = [];
  var P = 'https://placehold.co/400x300/';

  if (!have['all-types-demo']) {
    fRows.push(['all-types-demo', 'Every Question Type', 'live', 'A tour of every question type.', 'Every question type', 'This demo shows all of them. It takes about 3 minutes.', 'Start the tour',
      'You finished!', 'Thank you. Your answers are in the Sheet.', '', '', '#F0F7F7', '#0D1F2D', '#1A9E9E', 'Outfit', '', '', now]);
    var A = 'all-types-demo';
    qRows.push(
      [A, 1, 'w1', 'welcome', 'Welcome', 'Press Enter or click Start.', '', '', '', '', '', '', '', '', '', ''],
      [A, 2, 'q_name', 'short_text', 'What is your name?', '', 'TRUE', '', '', '', '', '', '', 'Type here', '', ''],
      [A, 3, 'q_email', 'email', 'Nice to meet you, {{q_name}}. What is your email?', '', 'TRUE', '', '', '', '', '', '', 'name@example.com', '', ''],
      [A, 4, 'q_phone', 'phone', 'Phone number', 'Optional.', 'FALSE', '', '', '', '', '', '', '', '', ''],
      [A, 5, 'q_site', 'url', 'Your website', 'Optional.', 'FALSE', '', '', '', '', '', '', 'https://', '', ''],
      [A, 6, 'q_team', 'number', 'How many people are on your team?', '', 'FALSE', '', '', 1, 500, '', '', '', '', ''],
      [A, 7, 'q_role', 'multiple_choice', 'Which best describes you?', 'Press a letter key to choose.', 'TRUE', 'Founder|Operator|Investor|Student|Other*', '', '', '', '', '', '', '', ''],
      [A, 8, 'q_tools', 'checkbox', 'Which tools do you use today?', 'Choose all that apply.', 'FALSE', 'Google Sheets|Typeform|Airtable|Notion|Zapier', '', '', '', '', '', '', '', ''],
      [A, 9, 'q_stage', 'dropdown', 'Company stage', '', 'FALSE', 'Idea|Pre-seed|Seed|Series A|Growth', '', '', '', '', '', '', '', ''],
      [A, 10, 'q_budget', 'yes_no', 'Do you have a budget for this?', 'Choose No to skip the next question (logic jump).', 'TRUE', '', '', '', '', '', '', '', '', 'q_budget = No => q_rate'],
      [A, 11, 'q_amount', 'number', 'What is your budget in USD?', '', 'FALSE', '', '', 0, '', '', '', '', '', ''],
      [A, 12, 'q_rate', 'rating', 'How would you rate your current process?', '', 'FALSE', '', '', '', 5, '', '', '', '', ''],
      [A, 13, 'q_scale', 'opinion_scale', 'How likely are you to automate this year?', '', 'FALSE', '', '', 1, 10, 'Not likely', 'Very likely', '', '', ''],
      [A, 14, 'q_nps', 'nps', 'How likely are you to recommend us to a friend?', '', 'FALSE', '', '', '', '', 'Not at all', 'Extremely', '', '', ''],
      [A, 15, 'q_rank', 'ranking', 'Rank these by priority.', 'Drag, or use the arrows.', 'FALSE', 'Speed|Cost|Quality|Support', '', '', '', '', '', '', '', ''],
      [A, 16, 'q_date', 'date', 'When do you want to start?', '', 'FALSE', '', '', '', '', '', '', '', '', ''],
      [A, 17, 'q_time', 'time', 'Best time for a call?', '', 'FALSE', '', '', '', '', '', '', '', '', ''],
      [A, 18, 'q_matrix', 'matrix', 'How do you feel about each?', '', 'FALSE', 'Low|Medium|High', 'Automation|AI|Reporting', '', '', '', '', '', '', ''],
      [A, 19, 'q_pic', 'picture_choice', 'Pick a vibe.', '', 'FALSE', 'Calm~' + P + '1A9E9E/ffffff?text=Calm|Bold~' + P + '7C3AED/ffffff?text=Bold|Dark~' + P + '0D1F2D/ffffff?text=Dark', '', '', '', '', '', '', '', ''],
      [A, 20, 'q_notes', 'long_text', 'Anything else we should know?', 'Shift+Enter adds a new line.', 'FALSE', '', '', '', '', '', '', '', '', ''],
      [A, 21, 'q_file', 'file_upload', 'Upload a file.', 'Optional. Up to 15 MB.', 'FALSE', '', '', '', '', '', '', '', '', ''],
      [A, 22, 'q_consent', 'legal', 'I agree to be contacted about this request.', '', 'TRUE', '', '', '', '', '', '', '', '', ''],
      [A, 23, 'q_sig', 'signature', 'Sign here.', 'Use your finger or mouse.', 'FALSE', '', '', '', '', '', '', '', '', ''],
      [A, 24, 'q_pay', 'payment', 'Optional deposit', 'This opens a demo payment link in a new tab.', 'FALSE', '', '', '', '', '', '', '', 'https://stripe.com/payments/payment-links', ''],
      [A, 25, 's_end', 'statement', 'That is everything.', 'Press Submit to save your answers.', '', '', '', '', '', '', '', '', '', '']
    );
  }
  if (!have['quick-feedback']) {
    fRows.push(['quick-feedback', 'Quick Feedback', 'live', '', '', '', 'Start',
      'Thanks for the feedback!', 'We read every response.', '', '', '#0D1F2D', '#F0F7F7', '#7C3AED', 'Inter', '', '', now]);
    var B = 'quick-feedback';
    qRows.push(
      [B, 1, 'f_rate', 'rating', 'How was your experience?', '', 'TRUE', '', '', '', 5, '', '', '', '', ''],
      [B, 2, 'f_like', 'multiple_choice', 'What did you like most?', '', 'FALSE', 'Speed|Price|Support|Design', '', '', '', '', '', '', '', ''],
      [B, 3, 'f_say', 'long_text', 'Tell us more.', '', 'FALSE', '', '', '', '', '', '', '', '', ''],
      [B, 4, 'f_mail', 'email', 'Your email, if you want a reply.', '', 'FALSE', '', '', '', '', '', '', '', '', '']
    );
  }
  if (fRows.length) forms.getRange(forms.getLastRow() + 1, 1, fRows.length, FORMS_HEADERS.length).setValues(fRows);
  if (qRows.length) qs.getRange(qs.getLastRow() + 1, 1, qRows.length, QUESTIONS_HEADERS.length).setValues(qRows);
  CacheService.getScriptCache().put('ver', String(Date.now()), 21600);
  alert_('Added ' + fRows.length + ' demo form(s).');
}
