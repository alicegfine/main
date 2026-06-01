// ============================================================
// Request Handler
// ============================================================
// Shared logic for a new Flex Fund request, whether it arrives
// from the legacy Google Form (onFormSubmit) or the web app
// (submitFlexFundRequest in WebApp.gs). Posts an approval message
// to Slack with correct balance info and over-budget warnings.
// ============================================================

/**
 * Installed trigger: runs on every legacy Google Form submission.
 * The form has already written the row; we annotate it and process.
 * Set up via Triggers > Add Trigger > onFormSubmit > On form submit.
 */
function onFormSubmit(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.FORM_RESPONSES_SHEET);
    var lastRow = sheet.getLastRow();
    var row = sheet.getRange(lastRow, 1, 1, 8).getValues()[0];

    var submission = {
      timestamp: row[0],
      email: row[1].toString().trim().toLowerCase(),
      date: formatDate_(row[2]),
      description: row[3],
      amount: parseAmount_(row[4]),
      category: (row[5] || '').toString().trim(),
      receipt: row[6],
      explanation: row[7],
      row: lastRow
    };

    processNewRequest_(submission);

  } catch (err) {
    Logger.log('Error in onFormSubmit: ' + err.toString());
    try {
      postToSlack_(CONFIG.APPROVAL_CHANNEL_ID, ':warning: *Flex Fund automation error:* ' + err.toString());
    } catch (e2) {
      Logger.log('Failed to post error to Slack: ' + e2.toString());
    }
  }
}

/**
 * Core handler for a new request whose row already exists in the
 * Form Responses sheet (submission.row is its 1-based sheet row).
 *
 * Computes the gross-up estimate, writes the automation columns
 * (estimate, status, request id), computes the CORRECT before/after
 * balance — counting this request exactly once — and posts the Slack
 * approval message.
 *
 * Returns { grossUpEstimate, totalCost, balance, remainingAfter,
 *           isOverBudget, requestId }.
 */
function processNewRequest_(submission) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.FORM_RESPONSES_SHEET);

  var needsGrossUp = (submission.category === CONFIG.CATEGORY_WORK_LIFE);
  var grossUpEstimate = needsGrossUp ? calculateGrossUp_(submission.amount) : 0;
  var totalCost = round2_(submission.amount + grossUpEstimate);

  // Write the automation columns onto this request's row.
  var requestId = Utilities.getUuid();
  sheet.getRange(submission.row, CONFIG.FORM_COL.GROSS_UP_ESTIMATE).setValue(grossUpEstimate);
  sheet.getRange(submission.row, CONFIG.FORM_COL.STATUS).setValue(CONFIG.STATUS_PENDING);
  sheet.getRange(submission.row, CONFIG.FORM_COL.REQUEST_ID).setValue(requestId);
  submission.requestId = requestId;

  // Balance BEFORE this expense: compute from all non-declined rows but
  // exclude this request's own row, so it is never double-counted.
  var balance = computeBalance_(submission.email, null, null, submission.row);

  // Funds available for THIS expense (work-life draws work-life only;
  // prof-dev draws prof-dev first, then overflows into work-life).
  var remainingAfter = null;
  var isOverBudget = false;
  if (balance) {
    var available = availableFor_(submission.category, balance);
    remainingAfter = round2_(available - totalCost);
    isOverBudget = (remainingAfter < 0);
  }

  var message = buildApprovalMessage_(submission, needsGrossUp, grossUpEstimate, totalCost, balance, remainingAfter, isOverBudget);
  var messageTs = postToSlack_(CONFIG.APPROVAL_CHANNEL_ID, message);

  if (messageTs) {
    storeMessageMapping_(messageTs, submission, grossUpEstimate, totalCost);
  }

  return {
    grossUpEstimate: grossUpEstimate,
    totalCost: totalCost,
    balance: balance,
    remainingAfter: remainingAfter,
    isOverBudget: isOverBudget,
    requestId: requestId
  };
}

/**
 * Build the Slack approval message with balance info.
 */
function buildApprovalMessage_(submission, needsGrossUp, grossUpEstimate, totalCost, balance, remainingAfter, isOverBudget) {
  var lines = [];

  if (isOverBudget) {
    lines.push(':rotating_light: *OVER BUDGET WARNING* :rotating_light:');
    lines.push('');
  }

  lines.push('*New Flex Fund Request*');
  lines.push('');
  lines.push('*Submitted by:* ' + submission.email);
  lines.push('*Date of purchase:* ' + submission.date);
  lines.push('*Description of purchase:* ' + submission.description);
  lines.push('*Reimbursement amount (USD):* $' + submission.amount.toFixed(2));
  lines.push('*Reimbursement category:* ' + submission.category);
  lines.push('*Gross up?* ' + (needsGrossUp ? 'Yes' : 'No'));

  if (needsGrossUp) {
    lines.push('*Estimated gross-up amount:* $' + grossUpEstimate.toFixed(2) + ' (est. total: $' + totalCost.toFixed(2) + ')');
  }

  lines.push('*Link to receipt:* ' + submission.receipt);
  lines.push('*Explanation of purchase:* ' + submission.explanation);

  lines.push('');
  lines.push('---');

  if (balance) {
    var poolLabel = needsGrossUp ? 'Work-Life' : 'Prof Dev (+ Work-Life overflow)';

    lines.push('*Balance before this expense:*');
    lines.push('  Prof Dev: $' + balance.pdRemaining.toFixed(2) + ' remaining');
    lines.push('  Work-Life: $' + balance.wlRemaining.toFixed(2) + ' remaining');
    lines.push('  Total: $' + balance.totalRemaining.toFixed(2) + ' remaining');
    lines.push('');
    lines.push('*Available for this ' + poolLabel + ' expense:* $' + availableFor_(submission.category, balance).toFixed(2));
    lines.push('*Remaining after this expense:* $' + remainingAfter.toFixed(2));

    if (isOverBudget) {
      lines.push('');
      lines.push(':rotating_light: This expense would put ' + submission.email.split('@')[0] + ' *$' + Math.abs(remainingAfter).toFixed(2) + ' over* their available ' + (needsGrossUp ? 'Work-Life' : 'Prof Dev') + ' budget.');
    }
  } else {
    lines.push(':warning: _Could not find an allocation for ' + submission.email + '. Please check the Math sheet._');
  }

  lines.push('');
  lines.push('React with :white_check_mark: to approve and send to payroll, or :x: to decline.');

  return lines.join('\n');
}

/**
 * Store mapping between Slack message timestamp and submission data.
 * Uses Script Properties as a simple key-value store.
 */
function storeMessageMapping_(messageTs, submission, grossUpEstimate, totalCost) {
  var data = {
    email: submission.email,
    date: submission.date,
    description: submission.description,
    amount: submission.amount,
    category: submission.category,
    receipt: submission.receipt,
    explanation: submission.explanation,
    grossUpEstimate: grossUpEstimate,
    totalCost: totalCost,
    needsGrossUp: (submission.category === CONFIG.CATEGORY_WORK_LIFE),
    row: submission.row,
    requestId: submission.requestId || '',
    status: 'pending',
    submittedAt: new Date().toISOString()
  };
  PropertiesService.getScriptProperties().setProperty('msg_' + messageTs, JSON.stringify(data));
}

/**
 * Retrieve submission data by Slack message timestamp.
 */
function getMessageMapping_(messageTs) {
  var json = PropertiesService.getScriptProperties().getProperty('msg_' + messageTs);
  if (!json) return null;
  return JSON.parse(json);
}
