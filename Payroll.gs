// ============================================================
// Payroll Ingestion (SCAFFOLD — parser not yet implemented)
// ============================================================
// Goal (from Alice): Leanna at AJG/Gallagher is external and should
// not have a login or an extra confirmation step. Instead, the payroll
// data she sends becomes the single source of truth for:
//   (a) "paid"  — deduct from balance when actually paid, and
//   (b) the ACTUAL gross-up — no manual entry by Alice or Leanna.
//
// Intended flow:
//   1. A Gmail filter auto-labels Leanna's payroll messages (or Alice
//      auto-forwards them to the script owner's inbox).
//   2. A time-based trigger runs ingestPayrollEmails_() on that label.
//   3. We parse each message/attachment, match rows by request id or
//      email + amount, and call recordPayrollPayment_() to write the
//      actual gross-up + paid date back to the Form Responses sheet.
//
// ⚠️ The PARSER below is intentionally a stub. We do not yet have a real
// sample of Leanna's payroll data (format, whether it itemizes
// reimbursements and gross-ups per person, cadence). Building a parser
// blind would silently mis-post money. Once we have one real example,
// fill in parsePayrollMessage_() and enable the trigger (see SETUP_GUIDE).
// ============================================================

// Gmail label that payroll messages get filtered into.
var PAYROLL_LABEL = 'Flex Fund Payroll';

/**
 * Time-based trigger entry point. Scans unprocessed payroll emails and
 * records payments. No-op until parsePayrollMessage_() is implemented.
 */
function ingestPayrollEmails_() {
  var label = GmailApp.getUserLabelByName(PAYROLL_LABEL);
  if (!label) {
    Logger.log('Payroll label "' + PAYROLL_LABEL + '" not found — nothing to ingest.');
    return;
  }

  var threads = label.getThreads(0, 20);
  for (var t = 0; t < threads.length; t++) {
    var messages = threads[t].getMessages();
    for (var m = 0; m < messages.length; m++) {
      var msg = messages[m];

      var payments = parsePayrollMessage_(msg);  // [] until implemented
      for (var p = 0; p < payments.length; p++) {
        recordPayrollPayment_(payments[p]);
      }
    }
    // Once parsing is implemented, mark the thread processed, e.g.:
    // threads[t].removeLabel(label).addLabel(processedLabel);
  }
}

/**
 * Parse a payroll email into payment records.
 * Each record: { requestId?, email, amount, actualGrossUp, paidDate }.
 *
 * STUB: returns [] until we have a real sample of Leanna's data to parse
 * reliably. Do not guess the format here.
 */
function parsePayrollMessage_(message) {
  Logger.log('parsePayrollMessage_ is a stub — payroll ingestion is not yet enabled. Subject: ' + message.getSubject());
  return [];
}

/**
 * Record an actual payroll payment against a request row: writes the
 * actual gross-up (overriding the estimate in balance math) and the paid
 * date. Matches by request id when available, else by email + amount.
 * Returns true if a row was updated.
 */
function recordPayrollPayment_(payment) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.FORM_RESPONSES_SHEET);
  var data = sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    var rowId = (data[i][CONFIG.FORM_COL.REQUEST_ID - 1] || '').toString().trim();
    var rowEmail = (data[i][CONFIG.FORM_COL.EMAIL - 1] || '').toString().trim().toLowerCase();
    var rowAmount = parseAmount_(data[i][CONFIG.FORM_COL.AMOUNT - 1]);

    var matches = payment.requestId
      ? (rowId && rowId === payment.requestId)
      : (rowEmail === (payment.email || '').toLowerCase() && Math.abs(rowAmount - parseAmount_(payment.amount)) < 0.005);

    if (!matches) continue;

    var sheetRow = i + 1;
    if (payment.actualGrossUp !== undefined && payment.actualGrossUp !== null) {
      sheet.getRange(sheetRow, CONFIG.FORM_COL.ACTUAL_GROSS_UP).setValue(round2_(parseAmount_(payment.actualGrossUp)));
    }
    sheet.getRange(sheetRow, CONFIG.FORM_COL.PAID).setValue(payment.paidDate || new Date());
    return true;
  }

  Logger.log('recordPayrollPayment_: no matching request row for ' + JSON.stringify(payment));
  return false;
}
