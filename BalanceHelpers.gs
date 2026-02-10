// ============================================================
// Balance & Spreadsheet Helpers
// ============================================================

/**
 * Look up a person's current balance from the Math sheet.
 * Returns { pdRemaining, wlRemaining, totalRemaining, pdAllocated, wlAllocated } or null.
 */
function getBalance_(email) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.MATH_SHEET);
  var data = sheet.getDataRange().getValues();
  var normalizedEmail = email.toString().trim().toLowerCase();

  for (var i = 1; i < data.length; i++) {  // Skip header row
    var rowEmail = data[i][CONFIG.MATH_COL.EMAIL - 1].toString().trim().toLowerCase();
    if (rowEmail === normalizedEmail) {
      return {
        pdAllocated: parseFloat(data[i][CONFIG.MATH_COL.PD_ALLOCATED - 1]) || 0,
        wlAllocated: parseFloat(data[i][CONFIG.MATH_COL.WL_ALLOCATED - 1]) || 0,
        pdUsed: parseFloat(data[i][CONFIG.MATH_COL.PD_USED - 1]) || 0,
        wlUsed: parseFloat(data[i][CONFIG.MATH_COL.WL_USED - 1]) || 0,
        pdRemaining: parseFloat(data[i][CONFIG.MATH_COL.PD_REMAINING - 1]) || 0,
        wlRemaining: parseFloat(data[i][CONFIG.MATH_COL.WL_REMAINING - 1]) || 0,
        totalRemaining: parseFloat(data[i][CONFIG.MATH_COL.TOTAL_REMAINING - 1]) || 0
      };
    }
  }

  return null;
}

/**
 * Get all balances from the Math sheet.
 * Returns an array of { email, pdRemaining, wlRemaining, totalRemaining }.
 */
function getAllBalances_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.MATH_SHEET);
  var data = sheet.getDataRange().getValues();
  var balances = [];

  for (var i = 1; i < data.length; i++) {  // Skip header row
    var email = data[i][CONFIG.MATH_COL.EMAIL - 1].toString().trim();
    if (!email) continue;

    balances.push({
      email: email,
      name: email.split('@')[0].split('.').map(function(part) {
        return part.charAt(0).toUpperCase() + part.slice(1);
      }).join(' '),
      pdRemaining: parseFloat(data[i][CONFIG.MATH_COL.PD_REMAINING - 1]) || 0,
      wlRemaining: parseFloat(data[i][CONFIG.MATH_COL.WL_REMAINING - 1]) || 0,
      totalRemaining: parseFloat(data[i][CONFIG.MATH_COL.TOTAL_REMAINING - 1]) || 0
    });
  }

  return balances;
}

/**
 * Calculate the gross-up estimate for a given amount.
 * At a 30% tax rate: employee gets amount, BB pays amount / (1 - 0.30).
 * Gross-up = total - amount.
 */
function calculateGrossUp_(amount) {
  var total = amount / (1 - CONFIG.GROSS_UP_TAX_RATE);
  return Math.round((total - amount) * 100) / 100;  // Round to 2 decimal places
}

/**
 * Parse a dollar amount string (e.g. "$100.65" or "100.65") to a number.
 */
function parseAmount_(value) {
  if (typeof value === 'number') return value;
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
