// ============================================================
// Monthly Summary
// ============================================================
// Posts a summary of remaining balances per person to the
// approval channel on the last business day of each month.
// ============================================================

/**
 * Post the monthly summary to #flex-fund-approvals.
 * Set this up as a time-based trigger that runs daily; the function
 * checks if today is the last business day and only posts then.
 */
function postMonthlySummaryIfLastBusinessDay() {
  if (!isLastBusinessDayOfMonth_()) return;
  postMonthlySummary();
}

/**
 * Post the monthly summary. Can also be run manually at any time.
 */
function postMonthlySummary() {
  var balances = getAllBalances_();

  if (balances.length === 0) {
    postToSlack_(CONFIG.APPROVAL_CHANNEL_ID, ':warning: No balance data found for monthly summary.');
    return;
  }

  // Sort by name
  balances.sort(function(a, b) {
    return a.name.localeCompare(b.name);
  });

  var now = new Date();
  var monthName = now.toLocaleString('en-US', { month: 'long', year: 'numeric' });

  var lines = [];
  lines.push(':bar_chart: *Flex Fund Monthly Summary — ' + monthName + '*');
  lines.push('');
  lines.push('| Name | Prof Dev | Work-Life | Total |');
  lines.push('|------|---------|-----------|-------|');

  for (var i = 0; i < balances.length; i++) {
    var b = balances[i];
    lines.push('| ' + b.name + ' | $' + b.pdRemaining.toFixed(2) + ' | $' + b.wlRemaining.toFixed(2) + ' | $' + b.totalRemaining.toFixed(2) + ' |');
  }

  lines.push('');
  lines.push('_Balances include estimated gross-ups at 30% for work-life improvement expenses._');

  postToSlack_(CONFIG.APPROVAL_CHANNEL_ID, lines.join('\n'));
}

/**
 * Check if today is the last business day of the month.
 * Business days = Monday–Friday.
 */
function isLastBusinessDayOfMonth_() {
  var today = new Date();
  var year = today.getFullYear();
  var month = today.getMonth();

  // Find the last day of this month
  var lastDay = new Date(year, month + 1, 0);

  // Walk backwards to find the last business day (Mon-Fri)
  while (lastDay.getDay() === 0 || lastDay.getDay() === 6) {
    lastDay.setDate(lastDay.getDate() - 1);
  }

  // Compare dates (ignoring time)
  return today.getDate() === lastDay.getDate() &&
         today.getMonth() === lastDay.getMonth() &&
         today.getFullYear() === lastDay.getFullYear();
}
