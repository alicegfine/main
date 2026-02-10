// ============================================================
// Web App Endpoint
// ============================================================
// Handles incoming POST requests from Slack:
//   1. Slack Events API (reaction_added)
//   2. Slash commands (/balance)
//   3. Slack URL verification challenge
// ============================================================

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
 */
function handleSlashCommand_(e) {
  var params = {};
  var pairs = e.postData.contents.split('&');
  for (var i = 0; i < pairs.length; i++) {
    var kv = pairs[i].split('=');
    params[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || '').replace(/\+/g, ' ');
  }

  var command = params.command;
  var userId = params.user_id;
  var responseUrl = params.response_url;

  if (command === '/balance' || command === '%2Fbalance') {
    // Look up the user's email from Slack
    var email = getSlackUserEmail_(userId);

    if (!email) {
      respondToSlashCommand_(responseUrl, ':x: Sorry, I couldn\'t look up your email address. Please contact the ops team.');
      return ContentService.createTextOutput('');
    }

    var balance = getBalance_(email);

    if (!balance) {
      respondToSlashCommand_(responseUrl, ':x: No Flex Fund balance found for ' + email + '. If you think this is an error, please contact the ops team.');
      return ContentService.createTextOutput('');
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

    respondToSlashCommand_(responseUrl, message);
  }

  // Must return 200 quickly to avoid Slack timeout
  return ContentService.createTextOutput('');
}
