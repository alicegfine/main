// ============================================================
// Weekly Digest of Unapproved Requests
// ============================================================
// Posts a summary of all pending (unapproved) Flex Fund requests
// to #flex-fund-requests every Monday morning.
// Set up as a weekly time-based trigger.
// ============================================================

/**
 * Post a digest of all pending requests to the approval channel.
 * Set this up as a time-based trigger: weekly, every Monday, 9am-10am.
 */
function postWeeklyDigest() {
  var props = PropertiesService.getScriptProperties();
  var allProps = props.getProperties();
  var pending = [];

  for (var key in allProps) {
    if (key.indexOf('msg_') !== 0) continue;

    var submission;
    try {
      submission = JSON.parse(allProps[key]);
    } catch (e) {
      continue;
    }

    if (submission.status !== 'pending') continue;

    // Calculate how long it's been waiting
    var submittedDate = new Date(submission.submittedAt);
    var daysAgo = Math.floor((Date.now() - submittedDate.getTime()) / (1000 * 60 * 60 * 24));

    pending.push({
      name: formatName_(submission.email),
      amount: submission.amount,
      category: submission.category,
      date: submission.date,
      description: submission.description,
      daysAgo: daysAgo,
      submittedDate: submittedDate
    });
  }

  // Nothing pending — don't post
  if (pending.length === 0) return;

  // Sort by oldest first
  pending.sort(function(a, b) {
    return a.submittedDate - b.submittedDate;
  });

  var lines = [];
  lines.push(':clipboard: *Weekly Digest: ' + pending.length + ' Flex Fund request' + (pending.length === 1 ? '' : 's') + ' awaiting approval*');
  lines.push('');

  for (var i = 0; i < pending.length; i++) {
    var p = pending[i];
    var ageLabel = p.daysAgo === 0 ? 'today' :
                   p.daysAgo === 1 ? '1 day ago' :
                   p.daysAgo + ' days ago';

    lines.push('• *' + p.name + '* — $' + p.amount.toFixed(2) + ' (' + p.category + ')');
    lines.push('  _' + p.description + '_ — submitted ' + p.date + ' (' + ageLabel + ')');
  }

  lines.push('');
  lines.push('Please react with :white_check_mark: to approve or :x: to decline.');

  postToSlack_(CONFIG.APPROVAL_CHANNEL_ID, lines.join('\n'));
}

/**
 * Clean up old resolved mappings to prevent Script Properties from filling up.
 * Removes approved/declined mappings older than 90 days.
 * Run this on a monthly time-based trigger, or manually as needed.
 */
function cleanupOldMappings() {
  var props = PropertiesService.getScriptProperties();
  var allProps = props.getProperties();
  var cutoff = Date.now() - (90 * 24 * 60 * 60 * 1000); // 90 days ago

  var cleaned = 0;
  for (var key in allProps) {
    if (key.indexOf('msg_') !== 0) continue;

    var submission;
    try {
      submission = JSON.parse(allProps[key]);
    } catch (e) {
      props.deleteProperty(key);
      cleaned++;
      continue;
    }

    // Only clean up resolved (non-pending) submissions
    if (submission.status === 'pending') continue;

    if (submission.resolvedAt) {
      var resolvedDate = new Date(submission.resolvedAt);
      if (resolvedDate.getTime() < cutoff) {
        props.deleteProperty(key);
        cleaned++;
      }
    }
  }

  if (cleaned > 0) {
    Logger.log('Cleaned up ' + cleaned + ' old message mappings.');
  }
}
