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
  // Sheet names (tabs) in the Google Sheet
  FORM_RESPONSES_SHEET: 'Form Responses 1',
  MATH_SHEET: 'Math',

  // Column indices in the Form Responses sheet (1-based)
  // Adjust if your columns are in a different order
  FORM_COL: {
    TIMESTAMP: 1,
    EMAIL: 2,
    DATE: 3,
    DESCRIPTION: 4,
    AMOUNT: 5,
    CATEGORY: 6,
    RECEIPT: 7,
    EXPLANATION: 8,
    GROSS_UP_ESTIMATE: 9  // New column we'll add
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
  // Estimated marginal tax rate for gross-up calculation
  GROSS_UP_TAX_RATE: 0.30,

  // --- Categories ---
  CATEGORY_WORK_LIFE: 'Work-life improvement',
  CATEGORY_PROF_DEV: 'Professional development'
};
