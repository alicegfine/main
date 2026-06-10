// ============================================================
// Payroll Gross-Up Reconciliation (from Leanna's email replies)
// ============================================================
// When an approved reimbursement is sent to payroll, the script emails
// Leanna; she replies in the same thread with the grossed-up amount for
// that single reimbursement. This reads her replies, matches each one to
// its request (using the requester + amount in the original email in the
// same thread), records the ACTUAL gross-up and a paid date, and DMs Alice
// a summary. Anything it can't read or match cleanly is flagged, not guessed.
//
// This is per-request and exact — unlike the old payroll-journal importer,
// which gave one lumped total per person per pay run and so mis-attributed
// people who had more than one reimbursement in a run.
//
// Turn-on: paste this file, run runGrossUpReplies once, then add a daily
// time-based trigger for runGrossUpReplies. Remove the old runPayrollImport
// trigger.
// ============================================================

function runGrossUpReplies() {
  ingestGrossUpReplies_();
}

function ingestGrossUpReplies_() {
  var threads = GmailApp.search('from:' + CONFIG.PAYROLL_EMAIL + ' subject:"Flex Fund Reimbursement" newer_than:365d');

  var props = PropertiesService.getScriptProperties();
  var processed = {};
  try { processed = JSON.parse(props.getProperty('grossup_processed_msgs') || '{}'); } catch (e) { processed = {}; }

  var requests = getRequestsForMatch_();
  var summary = [];
  var changed = false;

  for (var t = 0; t < threads.length; t++) {
    var msgs = threads[t].getMessages();

    for (var m = 0; m < msgs.length; m++) {
      var msg = msgs[m];
      if (msg.getFrom().toLowerCase().indexOf(CONFIG.PAYROLL_EMAIL.toLowerCase()) === -1) continue;  // only Leanna's
      var id = msg.getId();
      if (processed[id]) continue;

      processed[id] = new Date().toISOString();
      changed = true;

      // Each of Leanna's replies quotes the original request email, so we read
      // the request identity and the grossed-up amount from this one message.
      var body = msg.getPlainBody();
      var who = matchField_(body, /Submitted by:\s*([^\s<>]+@[^\s<>]+)/i);
      var baseAmt = parseAmount_(matchField_(body, /Reimbursement amount \(USD\):\s*\$?([0-9.,]+)/i));
      var grossed = grossUpFromReply_(body);

      if (!who || !(baseAmt > 0)) {
        summary.push(':warning: A reply from Leanna couldn’t be tied to a request (couldn’t read the original email) — please record by hand.');
        continue;
      }
      if (grossed === null) {
        summary.push(':warning: ' + formatName_(who) + ' ($' + baseAmt.toFixed(2) + '): couldn’t read the grossed-up amount in the reply — please record by hand.');
        continue;
      }

      // Find the request: same requester + amount.
      var key = who.toLowerCase();
      var same = requests.filter(function(r) { return r.email === key && Math.abs(r.amount - baseAmt) < 0.01; });
      var open = same.filter(function(r) { return !r.done; });

      if (open.length === 0 && same.length > 0) {
        summary.push(':warning: ' + formatName_(who) + ' ($' + baseAmt.toFixed(2) + '): already recorded — likely a *duplicate* payroll email; please verify this reimbursement wasn’t paid twice.');
        continue;
      }
      if (open.length > 1) {
        summary.push(':warning: ' + formatName_(who) + ' ($' + baseAmt.toFixed(2) + '): more than one matching request — please record by hand.');
        continue;
      }
      if (open.length === 0) {
        summary.push(':warning: ' + formatName_(who) + ' ($' + baseAmt.toFixed(2) + '): no matching request found — please check.');
        continue;
      }
      if (grossed + 0.01 < baseAmt) {
        summary.push(':warning: ' + formatName_(who) + ': grossed-up $' + grossed.toFixed(2) + ' is less than the $' + baseAmt.toFixed(2) + ' request — please check row ' + open[0].rowIndex + '.');
        continue;
      }

      var req = open[0];
      var actualGrossUp = round2_(grossed - baseAmt);
      var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.FORM_RESPONSES_SHEET);
      sheet.getRange(req.rowIndex, CONFIG.FORM_COL.ACTUAL_GROSS_UP).setValue(actualGrossUp);
      sheet.getRange(req.rowIndex, CONFIG.FORM_COL.PAID).setValue(formatDate_(msg.getDate()));
      req.done = true;  // don't match it again in this run
      summary.push(':white_check_mark: ' + formatName_(who) + ': $' + baseAmt.toFixed(2) +
        ' → grossed $' + grossed.toFixed(2) + ' (gross-up $' + actualGrossUp.toFixed(2) + '), row ' + req.rowIndex + '.');
    }
  }

  if (changed) {
    props.setProperty('grossup_processed_msgs', JSON.stringify(processed));
    if (summary.length) {
      sendSlackDM_(CONFIG.ALICE_SLACK_USER_ID, [':inbox_tray: *Gross-up updates from payroll*', ''].concat(summary).join('\n'));
    }
  }
}

/** All non-declined requests, flagged as already done if a gross-up or paid date is recorded. */
function getRequestsForMatch_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.FORM_RESPONSES_SHEET);
  var data = sheet.getDataRange().getValues();
  var rows = [];
  for (var i = 1; i < data.length; i++) {
    var email = (data[i][CONFIG.FORM_COL.EMAIL - 1] || '').toString().trim().toLowerCase();
    if (!email) continue;
    var status = (data[i][CONFIG.FORM_COL.STATUS - 1] || CONFIG.STATUS_PENDING).toString().trim().toLowerCase();
    if (status === CONFIG.STATUS_DECLINED) continue;

    var actual = data[i][CONFIG.FORM_COL.ACTUAL_GROSS_UP - 1];
    var paid = data[i][CONFIG.FORM_COL.PAID - 1];
    var done = (actual !== '' && actual !== null && actual !== undefined) ||
               (paid !== '' && paid !== null && paid !== undefined);

    rows.push({
      rowIndex: i + 1,
      email: email,
      amount: parseAmount_(data[i][CONFIG.FORM_COL.AMOUNT - 1]),
      done: done
    });
  }
  return rows;
}

/** Read the grossed-up amount from Leanna's reply. Anchors on her standard
 *  phrasing ("the grossed up amount is X"), which appears only in her reply,
 *  never in the quoted original. Falls back to a single bare amount. */
function grossUpFromReply_(body) {
  var m = body.match(/grossed[-\s]?up\s+amount\s+is\s*\$?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i);
  if (m) return parseAmount_(m[1]);
  return singleAmount_(newReplyText_(body));
}

/** The portion of an email body above the quoted original (i.e. Leanna's new text). */
function newReplyText_(body) {
  var markers = [body.search(/\nOn .+wrote:/i), body.indexOf('Hi Leanna'), body.search(/\n>/)];
  var cut = -1;
  for (var i = 0; i < markers.length; i++) {
    if (markers[i] > 0 && (cut === -1 || markers[i] < cut)) cut = markers[i];
  }
  return cut === -1 ? body : body.substring(0, cut);
}

/** First regex capture group in text, or '' if none. */
function matchField_(text, re) {
  var m = text.match(re);
  return m ? m[1].toString().trim() : '';
}

/** The single dollar amount in text, or null if there are zero or more than one.
 *  Handles "$766.14", "766.14", "2,278.42", or a whole number — with or without a $. */
function singleAmount_(text) {
  var found = [];
  var m, re = /\$?\s*([0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/g;
  while ((m = re.exec(text)) !== null) {
    var v = parseAmount_(m[1]);
    if (v > 0) found.push(v);
  }
  var uniq = [];
  found.forEach(function(v) { if (uniq.indexOf(v) === -1) uniq.push(v); });
  return uniq.length === 1 ? uniq[0] : null;
}

/** Clear the processed-reply record so replies can be re-read (for testing). */
function resetGrossUpProcessed() {
  PropertiesService.getScriptProperties().deleteProperty('grossup_processed_msgs');
  Logger.log('Gross-up processed-reply record cleared.');
}

/**
 * One-time cleanup: blank the Actual Gross-Up and Paid columns and the
 * processed-reply record, so runGrossUpReplies can repopulate everything
 * from Leanna's replies (the source of truth). Use this once to clear the
 * bad data the old journal importer wrote, then run runGrossUpReplies.
 * Does not touch amounts, categories, or statuses.
 */
function resetGrossUpData() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.FORM_RESPONSES_SHEET);
  var last = sheet.getLastRow();
  if (last >= 2) {
    sheet.getRange(2, CONFIG.FORM_COL.ACTUAL_GROSS_UP, last - 1, 1).clearContent();
    sheet.getRange(2, CONFIG.FORM_COL.PAID, last - 1, 1).clearContent();
  }
  PropertiesService.getScriptProperties().deleteProperty('grossup_processed_msgs');
  Logger.log('Cleared Actual Gross-Up + Paid columns and processed-reply record.');
}
