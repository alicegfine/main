// ============================================================
// Reaction Handler & Payroll Email
// ============================================================
// When an approver reacts with :white_check_mark: on an
// approval message, sends the payroll email and DMs Alice
// about the gross-up. When reacted with :x:, marks as declined.
// ============================================================

/**
 * Handle a reaction_added event from Slack.
 * Called from doPost() in WebApp.gs.
 */
function handleReactionAdded_(event) {
  // Only process reactions from authorized approvers
  var reactorId = event.user;
  if (CONFIG.APPROVER_USER_IDS.indexOf(reactorId) === -1) return;

  // Only process reactions on messages in the approval channel
  if (event.item.channel !== CONFIG.APPROVAL_CHANNEL_ID) return;

  var messageTs = event.item.ts;
  var submission = getMessageMapping_(messageTs);
  if (!submission) return;

  // Already processed — don't send duplicate emails
  if (submission.status !== 'pending') return;

  if (event.reaction === 'white_check_mark') {
    // Send payroll email
    sendPayrollEmail_(submission);

    // If needs gross-up, DM Alice to verify later
    if (submission.needsGrossUp) {
      sendGrossUpReminder_(submission);
    }

    // Mark as approved (keep the mapping for digest tracking)
    submission.status = 'approved';
    submission.resolvedAt = new Date().toISOString();
    PropertiesService.getScriptProperties().setProperty('msg_' + messageTs, JSON.stringify(submission));
    setRequestStatus_(submission.row, CONFIG.STATUS_APPROVED);

  } else if (event.reaction === 'x') {
    // Mark as declined — this also removes it from balance calculations
    submission.status = 'declined';
    submission.resolvedAt = new Date().toISOString();
    PropertiesService.getScriptProperties().setProperty('msg_' + messageTs, JSON.stringify(submission));
    setRequestStatus_(submission.row, CONFIG.STATUS_DECLINED);
  }
}

/**
 * Write a status value to a request's row in the Form Responses sheet.
 * Keeps the sheet (the source of truth for balances) in sync with the
 * Slack approval/decline action.
 */
function setRequestStatus_(row, status) {
  if (!row) return;
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.FORM_RESPONSES_SHEET);
  sheet.getRange(row, CONFIG.FORM_COL.STATUS).setValue(status);
}

/**
 * Send reimbursement email to payroll.
 */
function sendPayrollEmail_(submission) {
  var subject = 'Flex Fund Reimbursement — ' + formatName_(submission.email);

  var body = [
    'Hi Leanna,',
    '',
    'Could you please add the following reimbursement to payroll? If it needs to be grossed up, please respond with the grossed-up amount as you\'re able. Thanks so much!',
    '',
    'Submitted by: ' + submission.email,
    'Date of purchase: ' + submission.date,
    'Description of purchase: ' + submission.description,
    'Reimbursement amount (USD): $' + submission.amount.toFixed(2),
    'Reimbursement category: ' + submission.category,
    'Gross up? ' + (submission.needsGrossUp ? 'Yes' : 'No'),
    'Link to receipt: ' + submission.receipt,
    'Explanation of purchase: ' + submission.explanation,
    '',
    'Best,',
    'Alice'
  ].join('\n');

  GmailApp.sendEmail(CONFIG.PAYROLL_EMAIL, subject, body, {
    name: 'Alice Fine',
    replyTo: CONFIG.SENDER_EMAIL
  });

  Logger.log('Payroll email sent for ' + submission.email + ' — $' + submission.amount.toFixed(2));
}

/**
 * DM Alice in Slack to verify gross-up amount when payroll replies.
 */
function sendGrossUpReminder_(submission) {
  var name = formatName_(submission.email);

  var message = [
    ':memo: *Gross-up verification needed*',
    '',
    'Payroll email sent for *' + name + '*\'s $' + submission.amount.toFixed(2) + ' ' + submission.category.toLowerCase() + ' expense.',
    'Estimated gross-up: *$' + submission.grossUpEstimate.toFixed(2) + '* (est. total: $' + submission.totalCost.toFixed(2) + ')',
    '',
    'When the actual gross-up amount comes back from payroll, enter it in the *Actual Gross-Up* column (K), row ' + submission.row + ', of the Form Responses sheet. The balance math will use it automatically.'
  ].join('\n');

  sendSlackDM_(CONFIG.ALICE_SLACK_USER_ID, message);
}

/**
 * Format an email address as a display name.
 * e.g. "jacob.swett@blueprintbiosecurity.org" → "Jacob Swett"
 */
function formatName_(email) {
  return email.split('@')[0].split('.').map(function(part) {
    return part.charAt(0).toUpperCase() + part.slice(1);
  }).join(' ');
}
