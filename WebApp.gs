// ============================================================
// Web App Endpoint
// ============================================================
// doGet  — serves the Flex Fund web app (balance + request form)
// doPost — handles incoming requests from Slack:
//   1. Slack Events API (reaction_added)
//   2. Slack URL verification challenge
//
// Deploy TWICE (see SETUP_GUIDE.md): one "Anyone" deployment for the
// Slack doPost endpoint, and one "Anyone within Blueprint Biosecurity"
// deployment for the employee web app. Both run "Execute as: Me" so the
// script can reach the Sheet/Slack token while Session.getActiveUser()
// still returns the signed-in visitor on the domain-restricted one.
// ============================================================

/**
 * Serve the web app. Renders Index.html for the signed-in employee.
 */
function doGet(e) {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Flex Fund')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

/**
 * Allow HTML templates to pull in other files (CSS/JS partials).
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Web-callable: return the signed-in user's identity and current balance.
 * Called from the page via google.script.run.
 */
function getMyBalance() {
  var email = (Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  if (!email) {
    return { ok: false, error: 'Could not determine your Google account. Please make sure you are signed in with your Blueprint email.' };
  }

  var balance = computeBalance_(email);
  if (!balance) {
    return { ok: false, email: email, error: 'No Flex Fund allocation found for ' + email + '. Please contact the ops team.' };
  }

  return {
    ok: true,
    email: email,
    name: formatName_(email),
    balance: balance
  };
}

// Drive folder where uploaded receipts are stored (created if missing).
var RECEIPTS_FOLDER_NAME = 'Flex Fund Receipts';

/**
 * Web-callable: submit a new Flex Fund request from the web app.
 * Receives the HTML form element, so the receipt file input arrives as a
 * Blob. The submitter's identity comes from their Google session, never
 * the client. Form fields: date, description, amount, category, receipt
 * (file), explanation.
 */
function submitFlexFundRequest(form) {
  var email = (Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  if (!email) {
    return { ok: false, error: 'Could not determine your Google account. Please sign in with your Blueprint email.' };
  }

  // --- Validate input ---
  form = form || {};
  var category = (form.category || '').toString().trim();
  if (category !== CONFIG.CATEGORY_WORK_LIFE && category !== CONFIG.CATEGORY_PROF_DEV) {
    return { ok: false, error: 'Please choose a valid reimbursement category.' };
  }
  var amount = parseAmount_(form.amount);
  if (!(amount > 0)) {
    return { ok: false, error: 'Please enter a reimbursement amount greater than $0.' };
  }
  var description = (form.description || '').toString().trim();
  if (!description) {
    return { ok: false, error: 'Please enter a description of the purchase.' };
  }
  var date = (form.date || '').toString().trim();
  var explanation = (form.explanation || '').toString().trim();

  // Confirm the person has an allocation before recording anything.
  if (!getAllocations_()[email]) {
    return { ok: false, error: 'No Flex Fund allocation found for ' + email + '. Please contact the ops team.' };
  }

  // --- Save the uploaded receipt to Drive (optional) ---
  var receipt = '';
  try {
    var blob = form.receipt;
    if (blob && typeof blob === 'object' && blob.getBytes && blob.getBytes().length > 0) {
      receipt = saveReceipt_(blob, email, date);
    }
  } catch (recErr) {
    Logger.log('Receipt save failed: ' + recErr.toString());
    return { ok: false, error: 'Your request was not submitted — the receipt upload failed. Please try a smaller file (or a PDF/image) and submit again.' };
  }

  // --- Append the row, then process (single source of truth = the sheet) ---
  var lock = LockService.getScriptLock();
  lock.tryLock(10000);
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.FORM_RESPONSES_SHEET);
    var newRow = [
      new Date(),   // A timestamp
      email,        // B email
      date,         // C date of purchase
      description,  // D description
      amount,       // E amount
      category,     // F category
      receipt,      // G receipt (Drive link to the uploaded file)
      explanation   // H explanation
    ];
    sheet.appendRow(newRow);
    var rowIndex = sheet.getLastRow();

    var submission = {
      timestamp: newRow[0],
      email: email,
      date: formatDate_(date) || date,
      description: description,
      amount: amount,
      category: category,
      receipt: receipt,
      explanation: explanation,
      row: rowIndex
    };

    var result = processNewRequest_(submission);

    return {
      ok: true,
      requestId: result.requestId,
      needsGrossUp: (category === CONFIG.CATEGORY_WORK_LIFE),
      grossUpEstimate: result.grossUpEstimate,
      totalCost: result.totalCost,
      isOverBudget: result.isOverBudget,
      remainingAfter: result.remainingAfter,
      balance: computeBalance_(email)  // refreshed balance incl. this request
    };
  } catch (err) {
    Logger.log('submitFlexFundRequest error: ' + err.toString());
    return { ok: false, error: 'Something went wrong submitting your request. Please try again or contact the ops team.' };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Required for the Slack Events API (reaction_added) and URL verification.
 * The /balance slash command was removed — the web app shows balances now.
 */
function doPost(e) {
  // Ignore anything that isn't a JSON Events API callback (e.g. stray
  // form-encoded posts now that the slash command is gone).
  if (!e || !e.postData || e.postData.type !== 'application/json') {
    return ContentService.createTextOutput('ok');
  }

  var body = JSON.parse(e.postData.contents);

  // Handle Slack URL verification challenge (one-time setup)
  if (body.type === 'url_verification') {
    return ContentService.createTextOutput(body.challenge);
  }

  // Handle Events API callbacks
  if (body.type === 'event_callback') {
    var event = body.event;

    if (event.type === 'reaction_added') {
      handleReactionAdded_(event);
    }
  }

  return ContentService.createTextOutput('ok');
}

/**
 * Save an uploaded receipt Blob to the receipts folder in Drive and return a
 * shareable link. The file is shared so anyone at Blueprint with the link can
 * view it (so approvers can open it), falling back to anyone-with-link.
 */
function saveReceipt_(blob, email, dateStr) {
  var folder = getOrCreateFolder_(RECEIPTS_FOLDER_NAME);
  var stamp = dateStr || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var original = blob.getName() || 'receipt';
  blob.setName('Flex Fund - ' + formatName_(email) + ' - ' + stamp + ' - ' + original);

  var file = folder.createFile(blob);
  try {
    file.setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (e) {
    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (e2) {
      Logger.log('Could not set receipt sharing: ' + e2.toString());
    }
  }
  return file.getUrl();
}

/**
 * Get a Drive folder by name, creating it if it doesn't exist.
 */
function getOrCreateFolder_(name) {
  var it = DriveApp.getFoldersByName(name);
  return it.hasNext() ? it.next() : DriveApp.createFolder(name);
}

