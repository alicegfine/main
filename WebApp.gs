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
 * Returns an immediate acknowledgment, then processes the balance
 * lookup asynchronously and sends the real response via response_url.
 * This avoids Slack's 3-second timeout on cold starts.
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
    // Queue the request for async processing
    var requestId = 'bal_' + params.user_id + '_' + Date.now();
    PropertiesService.getScriptProperties().setProperty(requestId, JSON.stringify({
      user_id: params.user_id,
      response_url: params.response_url
    }));

    // Create a trigger to process it asynchronously (fires within a few seconds)
    ScriptApp.newTrigger('processBalanceRequests')
      .timeBased()
      .after(1)
      .create();

    // Return immediate acknowledgment (under 3 seconds)
    return slashResponse_(':hourglass_flowing_sand: Looking up your balance...');
  }

  return slashResponse_('Unknown command.');
}

/**
 * Async handler: processes all pending /balance requests.
 * Fired by a time-based trigger created in handleSlashCommand_.
 */
function processBalanceRequests() {
  var props = PropertiesService.getScriptProperties();
  var allProps = props.getProperties();

  for (var key in allProps) {
    if (key.indexOf('bal_') !== 0) continue;

    var request;
    try {
      request = JSON.parse(allProps[key]);
    } catch (e) {
      props.deleteProperty(key);
      continue;
    }
    props.deleteProperty(key);

    // Look up the user's email from Slack
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

  // Clean up all processBalanceRequests triggers to avoid accumulation
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'processBalanceRequests') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
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
