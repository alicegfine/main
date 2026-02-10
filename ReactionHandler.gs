// ============================================================
// Reaction Handler & Payroll Email
// ============================================================
// When an approver reacts with :white_check_mark: on an
// approval message, sends the payroll email and DMs Alice
// about the gross-up.
// ============================================================

/**
 * Handle a reaction_added event from Slack.
 * Called from doPost() in WebApp.gs.
 */
function handleReactionAdded_(event) {
  // Only process white_check_mark reactions
  if (event.reaction !== 'white_check_mark') return;

  // Only process reactions from authorized approvers
  var reactorId = event.user;
  if (CONFIG.APPROVER_USER_IDS.indexOf(reactorId) === -1) return;

  // Only process reactions on messages in the approval channel
  if (event.item.channel !== CONFIG.APPROVAL_CHANNEL_ID) return;

  // Look up the submission data from the message timestamp
  var messageTs = event.item.ts;
  var submission = getMessageMapping_(messageTs);
  if (!submission) {
    Logger.log('No submission found for message ts: ' + messageTs);
    return;
  }

  // Send payroll email
  sendPayrollEmail_(submission);

  // If needs gross-up, DM Alice to verify later
  if (submission.needsGrossUp) {
    sendGrossUpReminder_(submission);
  }

  // Clean up the stored mapping (optional, saves property storage space)
  PropertiesService.getScriptProperties().deleteProperty('msg_' + messageTs);
}

/**
 * Send reimbursement email to payroll.
 */
function sendPayrollEmail_(submission) {
  var subject = 'Flex Fund Reimbursement — ' + submission.email.split('@')[0].split('.').map(function(part) {
    return part.charAt(0).toUpperCase() + part.slice(1);
  }).join(' ');

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
  var name = submission.email.split('@')[0].split('.').map(function(part) {
    return part.charAt(0).toUpperCase() + part.slice(1);
  }).join(' ');

  var message = [
    ':memo: *Gross-up verification needed*',
    '',
    'Payroll email sent for *' + name + '*\'s $' + submission.amount.toFixed(2) + ' ' + submission.category.toLowerCase() + ' expense.',
    'Estimated gross-up: *$' + submission.grossUpEstimate.toFixed(2) + '* (est. total: $' + submission.totalCost.toFixed(2) + ')',
    '',
    'When Leanna replies with the actual gross-up amount, please update the Estimated Gross-Up column in row ' + submission.row + ' of the Form Responses sheet.'
  ].join('\n');

  sendSlackDM_(CONFIG.ALICE_SLACK_USER_ID, message);
}
