// ============================================================
// Payroll Ingestion
// ============================================================
// Reads the "Payroll Journal Report" CSV that Leanna emails each pay
// run (straight from the script owner's inbox — no forwarding needed)
// and reconciles it against the Form Responses sheet:
//   - "Taxable Reimbursement (amount USD)"  -> work-life, grossed up.
//        actual gross-up = taxable amount - original request amount.
//   - "Expense Reimbursement (amount USD)"  -> prof-dev, not taxable.
//   - Pay Date -> the "Paid" date written onto the request row.
//
// Safety: the report totals per pay run per person, not per request, and
// carries no request id. So we only auto-apply when a person has exactly
// ONE unpaid request of the matching type. Anything ambiguous (no match,
// multiple matches, or amounts that don't add up) is left untouched and
// flagged to Alice in a Slack DM for a human to handle. Paid rows and
// processed emails are remembered so nothing is applied twice.
//
// Turn-on (see SETUP_GUIDE.md): paste this file, run runPayrollImport
// once to authorize Gmail access, then add a daily time-based trigger.
// ============================================================

/**
 * Public entry point (no trailing underscore) so it appears in the
 * editor's Run menu and the trigger picker. Use this for the manual run
 * and as the trigger's target function.
 */
function runPayrollImport() {
  ingestPayrollEmails_();
}

/**
 * Trigger entry point. Finds unprocessed payroll emails from Leanna,
 * parses any Payroll Journal CSV attachments, applies them, and DMs
 * Alice a summary. Safe to run on a daily trigger — it de-duplicates.
 */
function ingestPayrollEmails_() {
  var threads = GmailApp.search('from:' + CONFIG.PAYROLL_EMAIL + ' has:attachment filename:csv newer_than:90d');

  var props = PropertiesService.getScriptProperties();
  var processed = {};
  try { processed = JSON.parse(props.getProperty('payroll_processed_msgs') || '{}'); } catch (e) { processed = {}; }

  var summary = [];
  var changed = false;

  for (var t = 0; t < threads.length; t++) {
    var messages = threads[t].getMessages();
    for (var m = 0; m < messages.length; m++) {
      var msg = messages[m];
      var msgId = msg.getId();
      if (processed[msgId]) continue;

      var handled = false;
      var attachments = msg.getAttachments();
      for (var a = 0; a < attachments.length; a++) {
        var att = attachments[a];
        if (att.getName().toLowerCase().indexOf('.csv') === -1) continue;

        var parsed;
        try {
          parsed = parsePayrollJournalCsv_(att.getDataAsString());
        } catch (err) {
          parsed = null;
        }
        if (!parsed) continue;  // not a journal report (e.g. cash requirements)

        summary.push('*Pay date ' + (parsed.payDate || 'unknown') + '*  _(' + att.getName() + ')_');
        summary = summary.concat(applyPayrollReport_(parsed));
        summary.push('');
        handled = true;
      }

      if (handled) {
        processed[msgId] = new Date().toISOString();
        changed = true;
      }
    }
  }

  if (changed) {
    props.setProperty('payroll_processed_msgs', JSON.stringify(processed));
    if (summary.length) {
      sendSlackDM_(CONFIG.ALICE_SLACK_USER_ID,
        [':inbox_tray: *Payroll import results*', ''].concat(summary).join('\n'));
    }
  }
}

/**
 * Parse a Payroll Journal Report CSV into { payDate, rows }, where each
 * row is { name, taxable, expense }. Returns null if the CSV isn't a
 * journal report (so other attachments are safely ignored).
 */
function parsePayrollJournalCsv_(csv) {
  var table = Utilities.parseCsv(csv);
  var payDate = '';
  var headerIdx = -1;

  for (var i = 0; i < table.length; i++) {
    var row = table[i];
    if (row.length >= 2 && row[0] && row[0].toString().trim() === 'Pay Date') {
      payDate = row[1].toString().trim();
    }
    if (headerIdx === -1 && rowHas_(row, 'Name') && rowHas_(row, 'Taxable Reimbursement (amount USD)')) {
      headerIdx = i;
    }
  }

  if (headerIdx === -1) return null;

  var header = table[headerIdx];
  var col = {};
  for (var c = 0; c < header.length; c++) {
    col[header[c].toString().trim()] = c;
  }

  var nameC = col['Name'];
  var taxC = col['Taxable Reimbursement (amount USD)'];
  var expC = col['Expense Reimbursement (amount USD)'];
  if (nameC === undefined || (taxC === undefined && expC === undefined)) return null;

  var rows = [];
  for (var r = headerIdx + 1; r < table.length; r++) {
    var dr = table[r];
    var name = (dr[nameC] || '').toString().trim();
    if (!name) continue;
    var taxable = taxC === undefined ? 0 : parseAmount_(dr[taxC]);
    var expense = expC === undefined ? 0 : parseAmount_(dr[expC]);
    if (taxable === 0 && expense === 0) continue;  // no reimbursement this run
    rows.push({ name: name, taxable: taxable, expense: expense });
  }

  return { payDate: payDate, rows: rows };
}

/**
 * Apply one parsed report. Returns an array of human-readable summary
 * lines (matches applied + anything that needs review).
 */
function applyPayrollReport_(parsed) {
  var lines = [];

  // Build a display-name -> email map from the people in the balances sheet.
  var allocations = getAllocations_();
  var nameToEmail = {};
  for (var key in allocations) {
    nameToEmail[formatName_(allocations[key].email).toLowerCase()] = key;
  }

  var open = getOpenRequests_();

  for (var i = 0; i < parsed.rows.length; i++) {
    var pr = parsed.rows[i];
    var email = nameToEmail[pr.name.toLowerCase()];
    if (!email) {
      lines.push(':warning: ' + pr.name + ': not found in the balances sheet — skipped.');
      continue;
    }
    if (pr.taxable > 0) {
      lines = lines.concat(matchAndPay_(email, pr.name, CONFIG.CATEGORY_WORK_LIFE, pr.taxable, parsed.payDate, open, true));
    }
    if (pr.expense > 0) {
      lines = lines.concat(matchAndPay_(email, pr.name, CONFIG.CATEGORY_PROF_DEV, pr.expense, parsed.payDate, open, false));
    }
  }

  if (lines.length === 0) lines.push('_No reimbursements to apply in this report._');
  return lines;
}

/**
 * Match a paid amount to a single unpaid request of the given category for
 * a person, and write the actual gross-up (work-life) and Paid date. Flags
 * (without writing) when the match is ambiguous.
 */
function matchAndPay_(email, name, category, paidTotal, payDate, open, isTaxable) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.FORM_RESPONSES_SHEET);
  var label = isTaxable ? 'work-life' : 'prof-dev';

  var list = (open[email] || []).filter(function(r) { return r.category === category; });

  if (list.length === 0) {
    return [':warning: ' + name + ': payroll paid $' + paidTotal.toFixed(2) + ' (' + label +
            '), but no unpaid ' + label + ' request was found — please check.'];
  }
  if (list.length > 1) {
    var rowList = list.map(function(r) { return r.rowIndex; }).join(', ');
    return [':warning: ' + name + ': payroll paid $' + paidTotal.toFixed(2) + ' (' + label + '), but ' +
            list.length + ' unpaid ' + label + ' requests exist (rows ' + rowList + ') — please reconcile by hand.'];
  }

  var req = list[0];

  if (isTaxable) {
    var actualGrossUp = round2_(paidTotal - req.amount);
    if (actualGrossUp < -0.01) {
      return [':warning: ' + name + ': taxable reimbursement ($' + paidTotal.toFixed(2) +
              ') is less than the request amount ($' + req.amount.toFixed(2) + ') — please check row ' + req.rowIndex + '.'];
    }
    sheet.getRange(req.rowIndex, CONFIG.FORM_COL.ACTUAL_GROSS_UP).setValue(actualGrossUp);
    sheet.getRange(req.rowIndex, CONFIG.FORM_COL.PAID).setValue(payDate || formatDate_(new Date()));
    removeOpen_(open, email, req.rowIndex);
    return [':white_check_mark: ' + name + ': work-life $' + req.amount.toFixed(2) +
            ' paid — actual gross-up $' + actualGrossUp.toFixed(2) + ' (total $' + paidTotal.toFixed(2) +
            '), row ' + req.rowIndex + '.'];
  }

  // Prof-dev: no gross-up; just record the Paid date. Note any amount mismatch.
  var note = (Math.abs(paidTotal - req.amount) > 1)
    ? ' :grey_question: (payroll $' + paidTotal.toFixed(2) + ' vs request $' + req.amount.toFixed(2) + ')'
    : '';
  sheet.getRange(req.rowIndex, CONFIG.FORM_COL.PAID).setValue(payDate || formatDate_(new Date()));
  removeOpen_(open, email, req.rowIndex);
  return [':white_check_mark: ' + name + ': prof-dev $' + req.amount.toFixed(2) + ' paid, row ' + req.rowIndex + '.' + note];
}

/**
 * Read unpaid, non-declined requests grouped by email.
 * Returns { email: [ { rowIndex, category, amount } ] }.
 */
function getOpenRequests_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.FORM_RESPONSES_SHEET);
  var data = sheet.getDataRange().getValues();
  var map = {};

  for (var i = 1; i < data.length; i++) {
    var email = (data[i][CONFIG.FORM_COL.EMAIL - 1] || '').toString().trim().toLowerCase();
    if (!email) continue;

    var status = (data[i][CONFIG.FORM_COL.STATUS - 1] || CONFIG.STATUS_PENDING).toString().trim().toLowerCase();
    if (status === CONFIG.STATUS_DECLINED) continue;

    var paid = data[i][CONFIG.FORM_COL.PAID - 1];
    if (paid !== '' && paid !== null && paid !== undefined) continue;  // already paid

    if (!map[email]) map[email] = [];
    map[email].push({
      rowIndex: i + 1,
      category: (data[i][CONFIG.FORM_COL.CATEGORY - 1] || '').toString().trim(),
      amount: parseAmount_(data[i][CONFIG.FORM_COL.AMOUNT - 1])
    });
  }

  return map;
}

/** Remove a matched request from the open map so it isn't matched twice. */
function removeOpen_(open, email, rowIndex) {
  if (!open[email]) return;
  open[email] = open[email].filter(function(r) { return r.rowIndex !== rowIndex; });
}

/** True if any cell in the row trims to the target string. */
function rowHas_(row, target) {
  for (var i = 0; i < row.length; i++) {
    if (row[i] && row[i].toString().trim() === target) return true;
  }
  return false;
}
