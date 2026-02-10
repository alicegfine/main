// ============================================================
// Slack API Helpers
// ============================================================

/**
 * Post a message to a Slack channel. Returns the message timestamp (ts).
 */
function postToSlack_(channelId, text) {
  var payload = {
    channel: channelId,
    text: text,
    unfurl_links: false,
    unfurl_media: false
  };

  var options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'Authorization': 'Bearer ' + CONFIG.SLACK_BOT_TOKEN
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  var response = UrlFetchApp.fetch('https://slack.com/api/chat.postMessage', options);
  var result = JSON.parse(response.getContentText());

  if (!result.ok) {
    Logger.log('Slack postMessage error: ' + result.error);
    return null;
  }

  return result.ts;
}

/**
 * Send an ephemeral message (visible only to one user) in a channel.
 */
function postEphemeral_(channelId, userId, text) {
  var payload = {
    channel: channelId,
    user: userId,
    text: text
  };

  var options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'Authorization': 'Bearer ' + CONFIG.SLACK_BOT_TOKEN
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  var response = UrlFetchApp.fetch('https://slack.com/api/chat.postEphemeral', options);
  var result = JSON.parse(response.getContentText());

  if (!result.ok) {
    Logger.log('Slack postEphemeral error: ' + result.error);
  }

  return result.ok;
}

/**
 * Send a DM to a user by opening a conversation and posting to it.
 */
function sendSlackDM_(userId, text) {
  // Open a DM channel with the user
  var openPayload = {
    users: userId
  };

  var openOptions = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'Authorization': 'Bearer ' + CONFIG.SLACK_BOT_TOKEN
    },
    payload: JSON.stringify(openPayload),
    muteHttpExceptions: true
  };

  var openResponse = UrlFetchApp.fetch('https://slack.com/api/conversations.open', openOptions);
  var openResult = JSON.parse(openResponse.getContentText());

  if (!openResult.ok) {
    Logger.log('Slack conversations.open error: ' + openResult.error);
    return false;
  }

  var dmChannelId = openResult.channel.id;
  postToSlack_(dmChannelId, text);
  return true;
}

/**
 * Look up a Slack user's email address from their user ID.
 */
function getSlackUserEmail_(userId) {
  var options = {
    method: 'get',
    headers: {
      'Authorization': 'Bearer ' + CONFIG.SLACK_BOT_TOKEN
    },
    muteHttpExceptions: true
  };

  var response = UrlFetchApp.fetch('https://slack.com/api/users.info?user=' + userId, options);
  var result = JSON.parse(response.getContentText());

  if (!result.ok) {
    Logger.log('Slack users.info error: ' + result.error);
    return null;
  }

  return result.user.profile.email;
}

/**
 * Respond to a Slack slash command via the response_url.
 * This sends an ephemeral response only the user can see.
 */
function respondToSlashCommand_(responseUrl, text) {
  var payload = {
    response_type: 'ephemeral',
    text: text
  };

  var options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  UrlFetchApp.fetch(responseUrl, options);
}
