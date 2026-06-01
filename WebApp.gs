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
    .setTitle('Blueprint Flex Fund')
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

/**
 * Web-callable: submit a new Flex Fund request from the web app.
 * The submitter's identity comes from their Google session, never the client.
 * `data` = { date, description, amount, category, receipt, explanation }.
 */
function submitFlexFundRequest(data) {
  var email = (Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  if (!email) {
    return { ok: false, error: 'Could not determine your Google account. Please sign in with your Blueprint email.' };
  }

  // --- Validate input ---
  data = data || {};
  var category = (data.category || '').toString().trim();
  if (category !== CONFIG.CATEGORY_WORK_LIFE && category !== CONFIG.CATEGORY_PROF_DEV) {
    return { ok: false, error: 'Please choose a valid reimbursement category.' };
  }
  var amount = parseAmount_(data.amount);
  if (!(amount > 0)) {
    return { ok: false, error: 'Please enter a reimbursement amount greater than $0.' };
  }
  var description = (data.description || '').toString().trim();
  if (!description) {
    return { ok: false, error: 'Please enter a description of the purchase.' };
  }
  var date = (data.date || '').toString().trim();
  var receipt = (data.receipt || '').toString().trim();
  var explanation = (data.explanation || '').toString().trim();

  // Confirm the person has an allocation before recording anything.
  if (!getAllocations_()[email]) {
    return { ok: false, error: 'No Flex Fund allocation found for ' + email + '. Please contact the ops team.' };
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
      receipt,      // G receipt
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

