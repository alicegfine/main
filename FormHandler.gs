// ============================================================
// Form Submission Handler
// ============================================================
// Triggered automatically when a new Google Form response is
// submitted. Posts an approval message to Slack with balance
// info and over-budget warnings.
// ============================================================

/**
 * Installed trigger: runs on every form submission.
 * Set this up via Triggers > Add Trigger > onFormSubmit > From spreadsheet > On form submit.
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
      category: row[5],
      receipt: row[6],
      explanation: row[7],
      row: lastRow
    };

    // Calculate gross-up estimate if work-life improvement
    var grossUpEstimate = 0;
    var needsGrossUp = (submission.category === CONFIG.CATEGORY_WORK_LIFE);
    if (needsGrossUp) {
      grossUpEstimate = calculateGrossUp_(submission.amount);
    }
    var totalCost = submission.amount + grossUpEstimate;

    // Write gross-up estimate to the new column
    sheet.getRange(lastRow, CONFIG.FORM_COL.GROSS_UP_ESTIMATE).setValue(grossUpEstimate);

    // Look up current balance
    var balance = getBalance_(submission.email);

    // Calculate remaining balance after this expense
    var budgetField = needsGrossUp ? 'wlRemaining' : 'pdRemaining';
    var remainingAfter = balance ? balance[budgetField] - totalCost : null;
    var isOverBudget = (remainingAfter !== null && remainingAfter < 0);

    // Post to Slack
    var message = buildApprovalMessage_(submission, needsGrossUp, grossUpEstimate, totalCost, balance, remainingAfter, isOverBudget);
    var messageTs = postToSlack_(CONFIG.APPROVAL_CHANNEL_ID, message);

    // Store the message timestamp and row number for later reaction handling
    if (messageTs) {
      storeMessageMapping_(messageTs, submission, grossUpEstimate, totalCost);
    }

  } catch (err) {
    Logger.log('Error in onFormSubmit: ' + err.toString());
    // Post error notification to Slack so it doesn't silently fail
    try {
      postToSlack_(CONFIG.APPROVAL_CHANNEL_ID, ':warning: *Flex Fund automation error:* ' + err.toString());
    } catch (e2) {
      Logger.log('Failed to post error to Slack: ' + e2.toString());
    }
  }
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
    var categoryLabel = needsGrossUp ? 'Work-Life' : 'Prof Dev';
    var relevantRemaining = needsGrossUp ? balance.wlRemaining : balance.pdRemaining;

    lines.push('*Balance before this expense:*');
    lines.push('  Prof Dev: $' + balance.pdRemaining.toFixed(2) + ' remaining');
    lines.push('  Work-Life: $' + balance.wlRemaining.toFixed(2) + ' remaining');
    lines.push('  Total: $' + balance.totalRemaining.toFixed(2) + ' remaining');
    lines.push('');
    lines.push('*' + categoryLabel + ' balance after this expense:* $' + remainingAfter.toFixed(2));

    if (isOverBudget) {
      lines.push('');
      lines.push(':rotating_light: This expense would put ' + submission.email.split('@')[0] + ' *$' + Math.abs(remainingAfter).toFixed(2) + ' over* their ' + categoryLabel + ' budget.');
    }
  } else {
    lines.push(':warning: _Could not find balance for ' + submission.email + '. Please check the Math sheet._');
  }

  lines.push('');
  lines.push('React with :white_check_mark: to approve and send to payroll.');

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
    row: submission.row
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
