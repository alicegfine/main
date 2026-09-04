// ============================================================
// Balance & Spreadsheet Helpers
// ============================================================
// Balances are computed IN CODE here, not read from the Math
// sheet's "used/remaining" formulas. Those formulas double-counted
// expenses (a row written on submission was subtracted by the sheet,
// then subtracted again by the approval code) and counted declined
// requests against the balance. We instead read only the per-person
// ALLOCATIONS from the Math sheet (which carry Alice's FTE% / partial-
// year proration) and compute "used" and "remaining" from the request
// rows themselves.
// ============================================================

/**
 * Read per-person allocations from the Math sheet.
 * Returns a map: { normalizedEmail: { pdAllocated, wlAllocated } }.
 * The Math sheet carries proration (FTE%, partial year) in these columns.
 */
function getAllocations_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.MATH_SHEET);
  var data = sheet.getDataRange().getValues();
  var map = {};

  for (var i = 1; i < data.length; i++) {  // Skip header row
    var email = data[i][CONFIG.MATH_COL.EMAIL - 1];
    if (!email) continue;
    var key = email.toString().trim().toLowerCase();
    if (key.indexOf('@') === -1) continue;  // skip helper rows like "Year:"

    var pd = parseFloat(data[i][CONFIG.MATH_COL.PD_ALLOCATED - 1]);
    var wl = parseFloat(data[i][CONFIG.MATH_COL.WL_ALLOCATED - 1]);
    var end = data[i][CONFIG.MATH_COL.END_DATE - 1];
    var mgr = data[i][CONFIG.MATH_COL.MANAGER_EMAIL - 1];

    map[key] = {
      email: email.toString().trim(),
      pdAllocated: isNaN(pd) ? CONFIG.PD_FULL_ALLOCATION : pd,
      wlAllocated: isNaN(wl) ? CONFIG.WL_FULL_ALLOCATION : wl,
      endDate: (end === '' || end === null || end === undefined) ? null : end,
      managerEmail: (mgr === '' || mgr === null || mgr === undefined) ? '' : mgr.toString().trim().toLowerCase()
    };
  }

  return map;
}

/**
 * Read all request rows from the Form Responses sheet.
 * Returns an array of { rowIndex, email, category, amount, grossUp, status }.
 * rowIndex is the 1-based sheet row. grossUp is the ACTUAL gross-up if payroll
 * has recorded one, otherwise the estimate. Prof-dev rows never carry a gross-up.
 */
function getRequestRows_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.FORM_RESPONSES_SHEET);
  var data = sheet.getDataRange().getValues();
  var rows = [];

  for (var i = 1; i < data.length; i++) {  // Skip header row
    var email = data[i][CONFIG.FORM_COL.EMAIL - 1];
    if (!email) continue;

    var category = (data[i][CONFIG.FORM_COL.CATEGORY - 1] || '').toString().trim();
    var amount = parseAmount_(data[i][CONFIG.FORM_COL.AMOUNT - 1]);

    // Status defaults to pending for legacy rows that predate the column.
    var status = (data[i][CONFIG.FORM_COL.STATUS - 1] || CONFIG.STATUS_PENDING)
      .toString().trim().toLowerCase();

    var grossUp = 0;
    if (category === CONFIG.CATEGORY_WORK_LIFE) {
      var actual = parseFloat(data[i][CONFIG.FORM_COL.ACTUAL_GROSS_UP - 1]);
      var estimate = parseFloat(data[i][CONFIG.FORM_COL.GROSS_UP_ESTIMATE - 1]);
      grossUp = !isNaN(actual) && actual > 0 ? actual : (isNaN(estimate) ? 0 : estimate);
    }

    rows.push({
      rowIndex: i + 1,  // 1-based sheet row
      email: email.toString().trim().toLowerCase(),
      category: category,
      amount: amount,
      grossUp: grossUp,
      status: status
    });
  }

  return rows;
}

/**
 * Core balance computation for one person.
 *
 * Bucket rules:
 *   - Work-Life ($3k, taxable): grossed-up cost draws the Work-Life bucket only.
 *   - Prof-Dev ($2k, not taxable): draws the Prof-Dev bucket first, then
 *     overflows into Work-Life (work-life funds may also be used for prof dev).
 *
 * Only non-declined rows count as "used". Pass `excludeRowIndex` to leave a
 * specific sheet row out of the tally (used to compute the "before" balance of
 * a request that has already been written to the sheet).
 *
 * Returns { pdAllocated, wlAllocated, pdUsed, wlUsed, pdRemaining,
 *           wlRemaining, totalRemaining } or null if the person is unknown.
 */
function computeBalance_(email, rows, allocations, excludeRowIndex) {
  var key = email.toString().trim().toLowerCase();
  allocations = allocations || getAllocations_();
  var alloc = allocations[key];
  if (!alloc) return null;

  rows = rows || getRequestRows_();

  // Sum spend by category (gross-up included for work-life).
  var pdExpense = 0;  // prof-dev purchases (no gross-up)
  var wlExpense = 0;  // work-life purchases + their gross-ups
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (r.email !== key) continue;
    if (r.status === CONFIG.STATUS_DECLINED) continue;
    if (excludeRowIndex && r.rowIndex === excludeRowIndex) continue;
    if (r.category === CONFIG.CATEGORY_WORK_LIFE) {
      wlExpense += r.amount + r.grossUp;
    } else {
      pdExpense += r.amount;
    }
  }

  // Prof-dev draws its own bucket first, then overflows into work-life.
  var pdOverflowToWl = Math.max(0, pdExpense - alloc.pdAllocated);
  var pdRemaining = alloc.pdAllocated - Math.min(pdExpense, alloc.pdAllocated);
  var wlRemaining = alloc.wlAllocated - (wlExpense + pdOverflowToWl);

  return {
    pdAllocated: round2_(alloc.pdAllocated),
    wlAllocated: round2_(alloc.wlAllocated),
    pdUsed: round2_(pdExpense),
    wlUsed: round2_(wlExpense),
    pdRemaining: round2_(pdRemaining),
    wlRemaining: round2_(wlRemaining),
    totalRemaining: round2_(pdRemaining + wlRemaining)
  };
}

/**
 * Look up a person's current balance. Backwards-compatible wrapper used by
 * the web app, the approval flow, and the monthly summary.
 */
function getBalance_(email) {
  return computeBalance_(email);
}

/**
 * Get all balances. Returns an array of
 * { email, name, pdRemaining, wlRemaining, totalRemaining }.
 */
function getAllBalances_() {
  var allocations = getAllocations_();
  var rows = getRequestRows_();
  var balances = [];

  for (var key in allocations) {
    var alloc = allocations[key];
    if (alloc.endDate) continue;  // exclude departed employees from the summary (their rows stay in the sheet)
    var b = computeBalance_(key, rows, allocations);
    if (!b) continue;
    balances.push({
      email: alloc.email,
      name: formatName_(alloc.email),
      pdRemaining: b.pdRemaining,
      wlRemaining: b.wlRemaining,
      totalRemaining: b.totalRemaining
    });
  }

  return balances;
}

/**
 * Funds available to cover a NEW expense of the given category, given a
 * balance snapshot. Work-life expenses can only use the work-life bucket;
 * prof-dev expenses can use prof-dev plus any leftover work-life.
 */
function availableFor_(category, balance) {
  if (category === CONFIG.CATEGORY_WORK_LIFE) {
    return balance.wlRemaining;
  }
  return balance.pdRemaining + balance.wlRemaining;
}

/**
 * Calculate the gross-up estimate for a given amount.
 * At a 30% tax rate: employee nets `amount`, BB pays amount / (1 - 0.30).
 * Gross-up = total - amount.
 */
function calculateGrossUp_(amount) {
  var total = amount / (1 - CONFIG.GROSS_UP_TAX_RATE);
  return round2_(total - amount);
}

/**
 * Round to 2 decimal places.
 */
function round2_(n) {
  return Math.round((n || 0) * 100) / 100;
}

/**
 * Parse a dollar amount string (e.g. "$100.65" or "100.65") to a number.
 */
function parseAmount_(value) {
  if (typeof value === 'number') return value;
  if (value === null || value === undefined) return 0;
  var cleaned = value.toString().replace(/[$,\s]/g, '');
  return parseFloat(cleaned) || 0;
}

/**
 * Format a date value to M/D/YYYY string.
 */
function formatDate_(value) {
  if (!value) return '';
  var date;
  if (value instanceof Date) {
    date = value;
  } else {
    date = new Date(value);
  }
  if (isNaN(date.getTime())) return value.toString();
  return (date.getMonth() + 1) + '/' + date.getDate() + '/' + date.getFullYear();
}
