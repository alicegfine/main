// ============================================================
// Web App Endpoint
// ============================================================
// doGet  — serves the Flex Fund web app (balance + request form)
// doPost — handles incoming requests from Slack:
//   1. Slack Events API (reaction_added)
//   2. Slash commands (/balance)
//   3. Slack URL verification challenge
//
// Deploy with "Execute as: Me" and "Who has access: anyone within
// Blueprint Biosecurity" so the script can reach the Sheet/Slack token
// while Session.getActiveUser() still returns the signed-in visitor.
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
 * Required for Slack Events API URL verification and all incoming requests.
 */
function doPost(e) {
  var body;

  // Slack slash commands come as form-encoded, events come as JSON
  if (e.postData.type === 'application/x-www-form-urlencoded') {
    return handleSlashCommand_(e);
  }

  body = JSON.parse(e.postData.contents);

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
 * Handle /balance slash command.
 * Adds the request to a queue in Script Properties and returns immediately.
 * processBalanceRequests() picks it up on its 1-minute trigger.
 */
function handleSlashCommand_(e) {
  var params = {};
  var pairs = e.postData.contents.split('&');
  for (var i = 0; i < pairs.length; i++) {
    var kv = pairs[i].split('=');
    params[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || '').replace(/\+/g, ' ');
  }

  var command = params.command;

  if (command === '/balance' || command === '%2Fbalance') {
    // Append to the balance request queue
    var props = PropertiesService.getScriptProperties();
    var lock = LockService.getScriptLock();
    lock.tryLock(5000);

    var queue = [];
    var queueJson = props.getProperty('balance_queue');
    if (queueJson) {
      try { queue = JSON.parse(queueJson); } catch (err) { queue = []; }
    }

    queue.push({
      user_id: params.user_id,
      response_url: params.response_url,
      timestamp: Date.now()
    });

    props.setProperty('balance_queue', JSON.stringify(queue));
    lock.releaseLock();

    return slashResponse_(':hourglass_flowing_sand: Looking up your balance...');
  }

  return slashResponse_('Unknown command.');
}

/**
 * Processes all pending /balance requests.
 * Set this up as a time-based trigger that runs every 1 minute.
 */
function processBalanceRequests() {
  var props = PropertiesService.getScriptProperties();
  var lock = LockService.getScriptLock();
  lock.tryLock(5000);

  var queueJson = props.getProperty('balance_queue');
  if (!queueJson) {
    lock.releaseLock();
    return;
  }

  var queue;
  try {
    queue = JSON.parse(queueJson);
  } catch (e) {
    props.deleteProperty('balance_queue');
    lock.releaseLock();
    return;
  }

  // Clear the queue so new requests don't get lost
  props.deleteProperty('balance_queue');
  lock.releaseLock();

  if (!queue.length) return;

  for (var i = 0; i < queue.length; i++) {
    var request = queue[i];

    // Skip requests older than 5 minutes (response_url expires after 30 min,
    // but no point processing very stale ones)
    if (Date.now() - request.timestamp > 300000) continue;

    var email = getSlackUserEmail_(request.user_id);

    if (!email) {
      respondToSlashCommand_(request.response_url,
        ':x: Sorry, I couldn\'t look up your email address. Please contact the ops team.');
      continue;
    }

    var balance = getBalance_(email);

    if (!balance) {
      respondToSlashCommand_(request.response_url,
        ':x: No Flex Fund balance found for ' + email + '. If you think this is an error, please contact the ops team.');
      continue;
    }

    var message = [
      ':moneybag: *Your Flex Fund Balance*',
      '',
      '*Professional Development:*',
      '  Allocated: $' + balance.pdAllocated.toFixed(2),
      '  Used: $' + balance.pdUsed.toFixed(2),
      '  Remaining: *$' + balance.pdRemaining.toFixed(2) + '*',
      '',
      '*Work-Life Improvement:*',
      '  Allocated: $' + balance.wlAllocated.toFixed(2),
      '  Used: $' + balance.wlUsed.toFixed(2),
      '  Remaining: *$' + balance.wlRemaining.toFixed(2) + '*',
      '',
      '*Total Remaining: $' + balance.totalRemaining.toFixed(2) + '*',
      '',
      '_Note: Work-life improvement balances include estimated tax gross-ups at 30%. Actual gross-up amounts may vary slightly._'
    ].join('\n');

    respondToSlashCommand_(request.response_url, message);
  }
}

/**
 * Return an ephemeral JSON response directly to Slack.
 */
function slashResponse_(text) {
  var response = {
    response_type: 'ephemeral',
    text: text
  };
  return ContentService.createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}
