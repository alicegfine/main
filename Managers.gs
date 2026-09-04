// ============================================================
// Manager Approval (for $500+ requests)
// ============================================================
// Purchases at/above CONFIG.MANAGER_APPROVAL_THRESHOLD are routed to the
// submitter's manager BEFORE the #flex-fund-approvals channel. The manager
// gets an email with Approve / Decline links that open the web app; because
// the web-app deployment is domain-restricted, the person clicking must be
// signed in to their Blueprint account, and we verify they ARE the assigned
// manager — so no tokens or secrets are needed.
//
// Approve  -> posts the request to #flex-fund-approvals for the normal
//             Jake/Siobhan sign-off (double approval).
// Decline  -> marks the request declined (drops it from balances) and emails
//             the submitter.
//
// The manager for each person comes from the "Manager Email" column of the
// Current Year Balances sheet; blank falls back to CONFIG.FALLBACK_MANAGER_EMAIL.
// ============================================================

/** The submitter's manager email, or the fallback approver if none on file. */
function getManagerEmail_(email) {
  var alloc = getAllocations_()[email.toString().trim().toLowerCase()];
  var mgr = alloc && alloc.managerEmail ? alloc.managerEmail : '';
  return mgr || CONFIG.FALLBACK_MANAGER_EMAIL;
}

/** Base URL of the employee web app (used to build approve/decline links). */
function webAppUrl_() {
  var prop = PropertiesService.getScriptProperties().getProperty('WEB_APP_URL');
  if (prop) return prop;
  try { return ScriptApp.getService().getUrl(); } catch (e) { return ''; }
}

/** Email the manager an approval request with Approve / Decline links. */
function sendManagerApprovalEmail_(submission, managerEmail, needsGrossUp, grossUpEstimate, totalCost) {
  var base = webAppUrl_();
  var approveUrl = base + '?action=managerApprove&id=' + encodeURIComponent(submission.requestId);
  var declineUrl = base + '?action=managerDecline&id=' + encodeURIComponent(submission.requestId);
  var who = formatName_(submission.email);

  var subject = 'Flex Fund approval needed — ' + who + ' ($' + submission.amount.toFixed(2) + ')';

  var lines = [
    'Hi ' + formatName_(managerEmail) + ',',
    '',
    who + ' submitted a Flex Fund reimbursement of $' + submission.amount.toFixed(2) +
      ' that needs your approval because it is $' + CONFIG.MANAGER_APPROVAL_THRESHOLD + ' or more.',
    '',
    'Date of purchase: ' + submission.date,
    'Description: ' + submission.description,
    'Amount: $' + submission.amount.toFixed(2),
    'Category: ' + submission.category
  ];
  if (needsGrossUp) lines.push('Estimated grossed-up total: $' + totalCost.toFixed(2));
  lines.push('Receipt: ' + submission.receipt);
  lines.push('Explanation: ' + submission.explanation);
  lines.push('');
  lines.push('APPROVE:  ' + approveUrl);
  lines.push('DECLINE:  ' + declineUrl);
  lines.push('');
  lines.push('(You may be asked to sign in with your Blueprint Google account.)');
  lines.push('Approving sends it on to Jake & Siobhan for the final Flex Fund sign-off.');
  lines.push('');
  lines.push('Thanks,');
  lines.push('Flex Fund');

  GmailApp.sendEmail(managerEmail, subject, lines.join('\n'), {
    name: 'Flex Fund',
    replyTo: CONFIG.SENDER_EMAIL
  });
}

/**
 * Handle a manager Approve/Decline link click (called from doGet in WebApp.gs).
 * Returns an HTML confirmation page.
 */
function handleManagerAction_(e) {
  var action = (e.parameter.action || '').toString();
  var id = (e.parameter.id || '').toString().trim();

  var found = findRequestRowById_(id);
  if (!found) {
    return confirmationPage_('Not found', 'We couldn’t find that request — it may have already been processed.');
  }

  var rowData = found.data;
  var rowIndex = found.rowIndex;
  var assignedMgr = (rowData[CONFIG.FORM_COL.MANAGER_APPROVER - 1] || '').toString().trim().toLowerCase();
  var mgrStatus = (rowData[CONFIG.FORM_COL.MANAGER_STATUS - 1] || '').toString().trim().toLowerCase();
  var submission = reconstructSubmission_(rowData, rowIndex);

  if (mgrStatus && mgrStatus !== CONFIG.STATUS_PENDING) {
    return confirmationPage_('Already ' + mgrStatus, 'This request has already been ' + mgrStatus + '. No further action is needed.');
  }

  var clicker = (Session.getActiveUser().getEmail() || '').toString().trim().toLowerCase();
  if (!clicker) {
    return confirmationPage_('Please sign in', 'Please open this link while signed in to your Blueprint Google account, then try again.');
  }
  if (clicker !== assignedMgr) {
    return confirmationPage_('Not your approval', 'This request was routed to ' + assignedMgr + ' for approval, so only they can approve or decline it.');
  }

  if (action === 'managerApprove') {
    setManagerStatus_(rowIndex, CONFIG.STATUS_APPROVED);
    postApprovalForSubmission_(submission);
    return confirmationPage_('Approved ✅',
      'Thanks! ' + formatName_(submission.email) + '’s $' + submission.amount.toFixed(2) +
      ' request has been sent to Jake & Siobhan for the final Flex Fund approval.');
  }

  if (action === 'managerDecline') {
    setManagerStatus_(rowIndex, CONFIG.STATUS_DECLINED);
    setRequestStatus_(rowIndex, CONFIG.STATUS_DECLINED);  // also removes it from balance calculations
    notifySubmitterDeclined_(submission);
    return confirmationPage_('Declined',
      'Declined. ' + formatName_(submission.email) + ' has been notified, and nothing further will happen with this request.');
  }

  return confirmationPage_('Unknown action', 'That link wasn’t recognized.');
}

/** Find a request row by its Request ID. Returns { rowIndex, data } or null. */
function findRequestRowById_(id) {
  if (!id) return null;
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.FORM_RESPONSES_SHEET);
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    var rid = (data[i][CONFIG.FORM_COL.REQUEST_ID - 1] || '').toString().trim();
    if (rid && rid === id) return { rowIndex: i + 1, data: data[i] };
  }
  return null;
}

/** Rebuild a submission object from a Form Responses row. */
function reconstructSubmission_(rowData, rowIndex) {
  return {
    email: (rowData[CONFIG.FORM_COL.EMAIL - 1] || '').toString().trim().toLowerCase(),
    date: formatDate_(rowData[CONFIG.FORM_COL.DATE - 1]),
    description: rowData[CONFIG.FORM_COL.DESCRIPTION - 1],
    amount: parseAmount_(rowData[CONFIG.FORM_COL.AMOUNT - 1]),
    category: (rowData[CONFIG.FORM_COL.CATEGORY - 1] || '').toString().trim(),
    receipt: rowData[CONFIG.FORM_COL.RECEIPT - 1],
    explanation: rowData[CONFIG.FORM_COL.EXPLANATION - 1],
    row: rowIndex,
    requestId: (rowData[CONFIG.FORM_COL.REQUEST_ID - 1] || '').toString().trim()
  };
}

/** Write the manager-approval status onto a request row. */
function setManagerStatus_(rowIndex, status) {
  SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName(CONFIG.FORM_RESPONSES_SHEET)
    .getRange(rowIndex, CONFIG.FORM_COL.MANAGER_STATUS).setValue(status);
}

/** Email the submitter that their manager declined the request. */
function notifySubmitterDeclined_(submission) {
  try {
    GmailApp.sendEmail(submission.email,
      'Flex Fund request declined by your manager',
      'Hi ' + formatName_(submission.email) + ',\n\n' +
      'Your Flex Fund reimbursement request for $' + submission.amount.toFixed(2) +
      ' (' + submission.description + ') was declined by your manager, so it will not be processed.\n\n' +
      'If you have questions, please reach out to your manager or the ops team.\n\n' +
      'Thanks,\nFlex Fund',
      { name: 'Flex Fund', replyTo: CONFIG.SENDER_EMAIL });
  } catch (e) {
    Logger.log('notifySubmitterDeclined_ failed: ' + e.toString());
  }
}

/** A simple HTML confirmation page shown to the manager after they click. */
function confirmationPage_(title, message) {
  var html =
    '<!DOCTYPE html><html><head><base target="_top">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<style>' +
    'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;background:#f5f7fa;color:#1b2733;margin:0;padding:48px 16px;}' +
    '.card{max-width:520px;margin:0 auto;background:#fff;border:1px solid #e3e8ef;border-radius:12px;padding:28px;box-shadow:0 1px 2px rgba(16,24,40,.05);}' +
    'h1{font-size:20px;margin:0 0 10px;color:#0f2a43;}' +
    'p{font-size:15px;line-height:1.5;margin:0;color:#3a4a5c;}' +
    '</style></head><body><div class="card"><h1>' + escapeHtml_(title) + '</h1><p>' + escapeHtml_(message) + '</p></div></body></html>';
  return HtmlService.createHtmlOutput(html).setTitle('Flex Fund');
}

/** Minimal HTML escaping for the confirmation page. */
function escapeHtml_(s) {
  return (s || '').toString()
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Monthly reminder (set up as a time-based trigger) to keep the Manager Email
 * mapping current as people join, leave, or change reporting lines.
 */
function runManagerMappingReminder() {
  sendSlackDM_(CONFIG.ALICE_SLACK_USER_ID,
    ':busts_in_silhouette: *Monthly reminder:* please review the *Manager Email* column in the *Current Year Balances* sheet so $500+ requests route to the right managers — update it for any new hires, departures, or reporting changes.');
}
