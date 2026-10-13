# forms-engine

ReRev Forms Engine. A Typeform-style form system. A Google Sheet is the backend. One Apps Script serves many live forms.

Version: 1.0.2

## Parts

| Folder | What it is |
|---|---|
| `gas/` | Apps Script project (bound to the Sheet). JSON API: form definition, save, upload. |
| `form/index.html` | Form page. Replace `__API_BASE__` with your web app `/exec` URL. Deploy to Netlify. |
| `wizard/` | Client setup wizard (`index.html`), version history, and a copy of the form page. |

## Live links

- Setup wizard: http://rerev-forms-engine-setup.netlify.app
- Form page: http://rerev-forms.netlify.app (form link: `/?f=FORMID`)
- Template Sheet: https://docs.google.com/spreadsheets/d/1W9iea0-AVzgc_RjnLsamp3fsywPC_HDlKajNCpnfNrw/edit

## How it works

1. The Sheet has three tabs: `Forms`, `Questions`, `Settings`. Each form also gets an `R_<FormID>` response tab.
2. The web app reads the form from the Sheet and returns JSON.
3. The form page shows one question at a time and saves answers as the person goes.
4. A form has a status: `draft`, `live`, or `closed`. Only `live` forms save answers.

## API

- `GET ?action=ping`
- `GET ?action=form&id=FORMID[&key=PREVIEW_KEY]`
- `POST {action:'save'}` — body is `text/plain` JSON (no CORS preflight)
- `POST {action:'upload'}` — file or signature to Drive

## Question types (24)

welcome, statement, short_text, long_text, email, phone, url, number, multiple_choice, checkbox, dropdown, yes_no, rating, opinion_scale, nps, ranking, date, time, file_upload, matrix, picture_choice, legal, signature, payment

- Split options with `|`. `Other*` adds an Other box.
- Picture options: `Label~https://url`.
- Matrix: rows in `Rows`, columns in `Options`.
- Answer piping: `{{q_name}}` in a Label or Description.

## Logic

In the `Logic` column: `q_budget = No => q_rate; q_size > 50 => q_big; * => end`

Operators: `=`, `!=`, `>`, `<`, `>=`, `<=`, `contains`. Targets: a QuestionID or `end`. Jumps go forward only.

## Set up a copy

1. Open the wizard and follow the steps.
2. Make a copy of the template Sheet.
3. In the copy, open Extensions → Apps Script. Run `menuSetup`. Click Allow.
4. Deploy as a web app: execute as you, access Anyone.
5. Put the `/exec` URL into `form/index.html` (replace `__API_BASE__`) and deploy it.

## Notes

- Every new Apps Script deployment makes a new `/exec` URL. Update the form page after a redeploy.
- Private fields (`NotifyEmail`, `SheetID`) never reach the public JSON.
- Code is in the `gas/` folder. The live copy of the script is bound to the template Sheet.
