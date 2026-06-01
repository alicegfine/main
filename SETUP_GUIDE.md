# Flex Fund Automation — Setup Guide

This guide walks you through setting up the Flex Fund automation from scratch. It replaces your existing Zapier workflow.

**What this automation does:**
1. Gives employees a **web app** to see their correct live balance and submit reimbursement requests (replacing the Google Form)
2. On submit, posts an approval message to #flex-fund-approvals with balance info and over-budget warnings (legacy Google Form submissions still work too)
3. When Siobhan or Jake reacts with :white_check_mark:, sends a payroll email to Leanna and DMs you about the gross-up; reacting with :x: declines it and frees up the balance
4. Posts a monthly summary of all remaining balances to #flex-fund-approvals on the last business day of each month

**How balances are calculated:** balances are computed **in code** (see `BalanceHelpers.gs`), not by formulas in the Math sheet. The code reads each person's *allocations* from the Math sheet (which carry your FTE% / partial-year proration) and computes "used" and "remaining" from the request rows themselves — counting each request once, ignoring declined requests, and using the actual gross-up once payroll reports it. Rules applied:
- **Work-Life ($3,000, taxable):** grossed-up cost draws the work-life budget only.
- **Professional development ($2,000, not taxable):** draws the prof-dev budget first, then overflows into any remaining work-life budget.
- Balances reset January 1; unused funds do not carry over.

---

## Step 1: Add the code to Google Apps Script

1. Open your Flex Fund Google Sheet (the one with the **Current Year Form Responses** and **Current Year Balances** tabs)
2. Go to **Extensions → Apps Script**
3. This opens the Apps Script editor. You'll see a default `Code.gs` file — you can delete it
4. Create the following files by clicking the **+** next to "Files" and choosing "Script":
   - `Config.gs` — paste the contents of `Config.gs`
   - `FormHandler.gs` — paste the contents of `FormHandler.gs`
   - `SlackHelpers.gs` — paste the contents of `SlackHelpers.gs`
   - `BalanceHelpers.gs` — paste the contents of `BalanceHelpers.gs`
   - `ReactionHandler.gs` — paste the contents of `ReactionHandler.gs`
   - `WebApp.gs` — paste the contents of `WebApp.gs`
   - `MonthlySummary.gs` — paste the contents of `MonthlySummary.gs`
   - `WeeklyDigest.gs` — paste the contents of `WeeklyDigest.gs`
   - `Payroll.gs` — paste the contents of `Payroll.gs`
   - `Index.html` — click **+ → HTML**, name it `Index`, and paste the contents of `Index.html`

5. Click **Save** (Ctrl+S / Cmd+S)

## Step 2: Add the automation columns to your Form Responses sheet

The web app and balance math share the **Current Year Form Responses** sheet. Columns **A–H** are the original Google Form fields and column **I** is `Estimated Gross-Up`. Add these headers in the first empty columns after them:

| Column | Header |
|--------|--------|
| I | `Estimated Gross-Up` |
| J | `Status` |
| K | `Actual Gross-Up` |
| L | `Paid` |
| M | `Request ID` |

The automation populates these automatically. (If your form has a different number of fields, adjust the `FORM_COL` indices in `Config.gs` to match.)

## Step 3: Check your Current Year Balances sheet — allocations only

Balances are now computed in code, so you **do not** need the old "Budget Used / Remaining" formulas, and you should not add gross-up sums to them (that caused the double-counting bug). The code only reads each person's **allocation** columns from the **Current Year Balances** sheet:

- Column F — `PD Allocated` (prof-dev budget for the person, after FTE%/partial-year proration)
- Column G — `WL Allocated` (work-life budget for the person, after proration)

Make sure those two columns hold the correct prorated allocations for each person (e.g. a 50% FTE who started mid-year). The "used/remaining" columns can stay for your reference but are no longer used by the automation. If your Math sheet columns are laid out differently, update the `MATH_COL` indices in `Config.gs`.

## Step 4: Create a Slack App

1. Go to https://api.slack.com/apps
2. Click **Create New App** → **From scratch**
3. Name it something like `Flex Fund Bot`
4. Choose your Blueprint Biosecurity workspace
5. Click **Create App**

### 4a: Bot Token Scopes

1. In the left sidebar, click **OAuth & Permissions**
2. Scroll down to **Scopes → Bot Token Scopes**
3. Add these scopes:
   - `chat:write` (post messages)
   - `chat:write.public` (post to channels the bot isn't in)
   - `reactions:read` (read emoji reactions)
   - `im:write` (send DMs)

### 4b: Install the App

1. Scroll up to **OAuth Tokens** and click **Install to Workspace**
2. Authorize the app
3. Copy the **Bot User OAuth Token** (starts with `xoxb-`) — you'll need this in Step 6

### 4c: Get the Signing Secret

1. In the left sidebar, click **Basic Information**
2. Under **App Credentials**, copy the **Signing Secret** — you'll need this in Step 6

## Step 5: Deploy the Apps Script — TWO web app deployments

You need **two** deployments of the same script, because they need different access settings:

- **Slack** sends webhooks that are *not* signed in to Google, so its endpoint must be open to `Anyone`.
- **The employee web app** must require a Google sign-in so the script knows *who* is submitting (`Session.getActiveUser()`), so it must be restricted to your Workspace.

Both run the same code; `doPost` handles Slack and `doGet` serves the web app.

### Deployment A — Slack endpoint
1. **Deploy → New deployment** → gear icon → **Web app**
2. Set:
   - **Description:** `Flex Fund — Slack`
   - **Execute as:** `Me`
   - **Who has access:** `Anyone`
3. **Deploy**, authorize when prompted (it needs Gmail + Sheets access), and copy the **Web app URL** — this is the URL you'll paste into Slack (Steps 7 & 8).

### Deployment B — Employee web app
1. **Deploy → New deployment** → gear icon → **Web app**
2. Set:
   - **Description:** `Flex Fund — Web app`
   - **Execute as:** `Me`
   - **Who has access:** `Anyone within Blueprint Biosecurity`
3. **Deploy** and copy this **Web app URL** — this is the link you share with employees to check balances and submit requests.

> **Why "Execute as: Me" for the web app?** The script runs as you (so it can read the Sheet and post to Slack), but because employees sign in with their `@blueprintbiosecurity.org` account in the same Workspace, `Session.getActiveUser().getEmail()` still returns *their* email. That's how each person sees their own balance.

> **Important:** Every time you change the code, update **both** deployments via **Deploy → Manage deployments → Edit (pencil) → Version: New version → Deploy**.

## Step 6: Configure Script Properties

1. In the Apps Script editor, click the **gear icon** (Project Settings) in the left sidebar
2. Scroll down to **Script Properties**
3. Click **Add script property** and add each of these:

| Property | Value |
|----------|-------|
| `SLACK_BOT_TOKEN` | The `xoxb-` token from Step 4b |
| `SLACK_SIGNING_SECRET` | The signing secret from Step 4c |
| `APPROVAL_CHANNEL_ID` | The channel ID for #flex-fund-approvals (see below) |
| `APPROVER_USER_IDS` | Comma-separated Slack user IDs for Siobhan and Jake (see below) |
| `ALICE_SLACK_USER_ID` | Your Slack user ID (see below) |

### How to find a Slack channel ID:
1. In Slack, right-click on #flex-fund-approvals
2. Click **View channel details**
3. At the bottom of the panel, you'll see the Channel ID (starts with `C`)

### How to find a Slack user ID:
1. Click on the person's name in Slack
2. Click the **...** (more) button
3. Click **Copy member ID**

## Step 7: Enable Events API (for reaction handling)

1. In the left sidebar, click **Event Subscriptions**
2. Toggle **Enable Events** to On
3. In **Request URL**, paste the **Deployment A (Slack)** URL from Step 5
   - Slack will send a verification challenge — the script handles this automatically
   - You should see a green "Verified" checkmark
4. Under **Subscribe to bot events**, click **Add Bot User Event** and add:
   - `reaction_added`
5. Click **Save Changes**

> If the URL verification fails, make sure you deployed Deployment A (Step 5) and that it's set to "Anyone" access.

## Step 8: Invite the Bot to the Channel

1. In Slack, go to #flex-fund-approvals
2. Type `/invite @Flex Fund Bot` (or whatever you named your app)

## Step 9: Set Up Triggers in Apps Script

1. In the Apps Script editor, click the **clock icon** (Triggers) in the left sidebar
2. Click **Add Trigger** in the bottom right

### Trigger 1: Form submission handler
- **Function:** `onFormSubmit`
- **Event source:** `From spreadsheet`
- **Event type:** `On form submit`
- Click **Save**

### Trigger 2: Monthly summary
- **Function:** `postMonthlySummaryIfLastBusinessDay`
- **Event source:** `Time-driven`
- **Type of time-based trigger:** `Day timer`
- **Time of day:** `9am to 10am` (or whenever you'd like)
- Click **Save**

### Trigger 3: Weekly digest of unapproved requests
- **Function:** `postWeeklyDigest`
- **Event source:** `Time-driven`
- **Type of time-based trigger:** `Week timer`
- **Day of week:** `Monday`
- **Time of day:** `9am to 10am`
- Click **Save**

### Trigger 4 (optional): Clean up old message mappings
- **Function:** `cleanupOldMappings`
- **Event source:** `Time-driven`
- **Type of time-based trigger:** `Month timer`
- Click **Save**

> **Payroll ingestion is not set up yet.** `ingestPayrollEmails_` is a stub until we have one real sample of Leanna's payroll data — see "Payroll ingestion" below. Do not add a trigger for it yet.

## Step 10: Share the web app with the team

Send employees the **Deployment B (Web app)** URL from Step 5. They open it, sign in with their Blueprint Google account, and can see their balance and submit requests there instead of the old Google Form. The first time, Google will ask them to authorize viewing — that's expected.

## Step 11: Disable Your Zapier Automation

Once you've verified the new automation is working (test by submitting a request through the web app), disable or delete your existing Zapier zaps.

## Step 12: Test!

1. **Test the web app:** Open the Deployment B URL, sign in, and confirm your balance shows correctly. Submit a small test request and check that a message appears in #flex-fund-approvals within a few seconds.
2. **Test the math:** Submit a request and verify the "Balance before this expense" matches what you expect *before* the purchase, and "Remaining after this expense" = before − (amount + gross-up). It should no longer double-count.
3. **Test approval:** React with :white_check_mark: using Siobhan or Jake's account (or temporarily add your own user ID to the approvers list). Check that the payroll email arrives.
4. **Test decline:** React with :x: on a test request and confirm its balance is freed up (the row's Status becomes `declined` and the web app balance goes back up).
5. **Test monthly summary:** Run `postMonthlySummary` manually from the Apps Script editor (function dropdown → `postMonthlySummary` → Run).

---

## Payroll ingestion (not yet enabled)

The goal is for Leanna's payroll data to automatically mark requests **paid** and record the **actual gross-up**, with no extra step for her or for you. The scaffolding is in `Payroll.gs`, but the parser is a deliberate stub: we don't yet know the format of what Leanna sends.

To turn it on, we need **one real sample** of her payroll data — ideally answering:
- Is it a standard report she already produces each pay run, or something new?
- Format: CSV, Excel, PDF, or prose in the email body?
- Does it itemize reimbursements per person, with the gross-up broken out?
- How often does payroll run, and how soon after does she send it?

Once we have a sample, we implement `parsePayrollMessage_()`, set up a Gmail filter that labels her messages `Flex Fund Payroll`, and add a time-based trigger for `ingestPayrollEmails_`. Until then, the actual gross-up can be entered by hand in the **Actual Gross-Up** column (K) of the Form Responses sheet, which the balance math will pick up automatically.

---

## Troubleshooting

### Messages not appearing in Slack
- Check that `SLACK_BOT_TOKEN` is set correctly in Script Properties
- Check that `APPROVAL_CHANNEL_ID` is the channel ID (starts with C), not the channel name
- Check that the bot is invited to the channel
- Check the Apps Script execution log: **Executions** in the left sidebar

### Web app shows the wrong balance / "no allocation found"
- Confirm the person's email in the Math sheet matches their Google login email
- Confirm columns F/G of the Math sheet hold their prorated PD/WL allocations
- Make sure you redeployed Deployment B after any code changes

### Reactions not triggering payroll email
- Check that `APPROVER_USER_IDS` contains the correct Slack user IDs (comma-separated, no spaces)
- Check that `reaction_added` is subscribed under Event Subscriptions
- Check the execution log for errors

### Payroll email not sending
- The script sends email from whatever Google account owns the Apps Script project
- Make sure you authorized Gmail access when deploying

### "Estimated Gross-Up" column not populating
- Make sure column I is the first empty column after your form fields
- If your form has more or fewer columns, update `FORM_COL.GROSS_UP_ESTIMATE` in `Config.gs`
