// ============================================================
// Flex Fund Automation — Configuration
// ============================================================
// Fill in these values after setting up your Slack app and
// deploying this script. See SETUP_GUIDE.md for instructions.
// ============================================================

// --- Slack ---
var CONFIG = {
  // Slack Bot OAuth Token (starts with xoxb-)
  SLACK_BOT_TOKEN: PropertiesService.getScriptProperties().getProperty('SLACK_BOT_TOKEN'),

  // Slack Signing Secret (used to verify requests come from Slack)
  SLACK_SIGNING_SECRET: PropertiesService.getScriptProperties().getProperty('SLACK_SIGNING_SECRET'),

  // Channel ID for #flex-fund-approvals (not the name — the C-prefixed ID)
  APPROVAL_CHANNEL_ID: PropertiesService.getScriptProperties().getProperty('APPROVAL_CHANNEL_ID'),

  // Slack user IDs for approvers (Siobhan and Jake)
  // Find these in Slack: click their profile → "..." → "Copy member ID"
  APPROVER_USER_IDS: (PropertiesService.getScriptProperties().getProperty('APPROVER_USER_IDS') || '').split(','),

  // Slack user ID for Alice (to receive gross-up verification DMs)
  ALICE_SLACK_USER_ID: PropertiesService.getScriptProperties().getProperty('ALICE_SLACK_USER_ID'),

  // --- Payroll ---
  PAYROLL_EMAIL: 'leanna_williams@ajg.com',
  SENDER_EMAIL: 'alice.fine@blueprintbiosecurity.org',

  // --- Spreadsheet ---
  // Sheet names (tabs) in the Google Sheet. These point at the CURRENT
  // year's tabs; at year-end, repoint them (or rename last year's tabs).
  FORM_RESPONSES_SHEET: 'Current Year Form Responses',
  MATH_SHEET: 'Current Year Balances',

  // Column indices in the Form Responses sheet (1-based)
  // Adjust if your columns are in a different order.
  // Columns A–H mirror the original Google Form fields so legacy data
  // and the web app share one sheet. Columns I–M are added by this
  // automation (see SETUP_GUIDE.md).
  FORM_COL: {
    TIMESTAMP: 1,
    EMAIL: 2,
    DATE: 3,
    DESCRIPTION: 4,
    AMOUNT: 5,
    CATEGORY: 6,
    RECEIPT: 7,
    EXPLANATION: 8,
    GROSS_UP_ESTIMATE: 9,   // I — estimated gross-up at GROSS_UP_TAX_RATE
    STATUS: 10,             // J — pending | approved | declined
    ACTUAL_GROSS_UP: 11,    // K — actual gross-up from payroll (overrides estimate)
    PAID: 12,               // L — date/flag set when payroll confirms payment
    REQUEST_ID: 13          // M — unique id for this request
  },

  // Column indices in the Math sheet (1-based)
  MATH_COL: {
    EMAIL: 1,
    START_DATE: 2,
    END_DATE: 3,
    PCT_YEAR: 4,
    PCT_FTE: 5,
    PD_ALLOCATED: 6,
    WL_ALLOCATED: 7,
    PD_USED: 8,
    WL_USED: 9,
    PD_REMAINING: 10,
    WL_REMAINING: 11,
    TOTAL_REMAINING: 12
  },

  // --- Gross-Up ---
  // Up-front estimate used to reserve budget at submission time. The ACTUAL
  // gross-up comes back from payroll (Leanna's reply) and overrides this per
  // request. Observed actuals are mostly ~7.65% (FICA only) up to ~19% for
  // higher earners, so 15% is a slightly-conservative placeholder.
  // Lower = more accurate; higher = more cushion against over-budget.
  GROSS_UP_TAX_RATE: 0.15,

  // --- Allocations (full annual, per person, before proration) ---
  // Proration for FTE% and partial years is read from the Math sheet's
  // PD_ALLOCATED / WL_ALLOCATED columns; these constants are the
  // full-year reference values and a fallback when the sheet is blank.
  WL_FULL_ALLOCATION: 3000,   // Work-life improvement (taxable; may also fund prof dev)
  PD_FULL_ALLOCATION: 2000,   // Professional development only (not taxable)

  // --- Categories ---
  CATEGORY_WORK_LIFE: 'Work-life improvement',
  CATEGORY_PROF_DEV: 'Professional development',

  // --- Request statuses ---
  STATUS_PENDING: 'pending',
  STATUS_APPROVED: 'approved',
  STATUS_DECLINED: 'declined'
};
