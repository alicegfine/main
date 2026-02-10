# Flex Fund Automation — Setup Guide

This guide walks you through setting up the Flex Fund automation from scratch. It replaces your existing Zapier workflow.

**What this automation does:**
1. When someone submits the Flex Fund Google Form, posts an approval message to #flex-fund-approvals with balance info and over-budget warnings
2. When Siobhan or Jake reacts with :white_check_mark:, sends a payroll email to Leanna and DMs you about the gross-up
3. Employees can type `/balance` in Slack to see their remaining Flex Fund balance (visible only to them)
4. Posts a monthly summary of all remaining balances to #flex-fund-approvals on the last business day of each month

---

## Step 1: Add the code to Google Apps Script

1. Open your Flex Fund Google Sheet (the one with the Form Responses and Math tabs)
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

5. Click **Save** (Ctrl+S / Cmd+S)

## Step 2: Add the "Estimated Gross-Up" column to your Form Responses sheet

1. In your Form Responses sheet, add a header in **column I** (the first empty column after your form fields): `Estimated Gross-Up`
2. That's it — the automation will populate this column automatically

## Step 3: Update your Math sheet formulas

Your Math sheet's "WL Budget Used" column needs to include gross-up estimates. Update the formula for each person's WL Budget Used to also sum their gross-up amounts from the new column I.

For example, if your current WL Budget Used formula for a row looks something like:
```
=SUMIFS('Form Responses 1'!E:E, 'Form Responses 1'!B:B, A2, 'Form Responses 1'!F:F, "Work-life improvement")
```

Change it to:
```
=SUMIFS('Form Responses 1'!E:E, 'Form Responses 1'!B:B, A2, 'Form Responses 1'!F:F, "Work-life improvement") + SUMIFS('Form Responses 1'!I:I, 'Form Responses 1'!B:B, A2)
```

This adds the estimated gross-up amounts (column I) for that person to their work-life budget used.

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
   - `users:read` (look up user profiles)
   - `users:read.email` (look up user emails)
   - `im:write` (send DMs)

### 4b: Install the App

1. Scroll up to **OAuth Tokens** and click **Install to Workspace**
2. Authorize the app
3. Copy the **Bot User OAuth Token** (starts with `xoxb-`) — you'll need this in Step 6

### 4c: Get the Signing Secret

1. In the left sidebar, click **Basic Information**
2. Under **App Credentials**, copy the **Signing Secret** — you'll need this in Step 6

## Step 5: Deploy the Apps Script as a Web App

1. In the Apps Script editor, click **Deploy → New deployment**
2. Click the gear icon next to "Select type" → choose **Web app**
3. Set:
   - **Description:** `Flex Fund Bot v1`
   - **Execute as:** `Me` (your Google account)
   - **Who has access:** `Anyone`
4. Click **Deploy**
5. **Authorize** the app when prompted (it needs access to your Gmail and Sheets)
6. Copy the **Web app URL** — you'll need this for the Slack app configuration

> **Important:** Every time you change the code, you need to create a new deployment or update the existing one via **Deploy → Manage deployments → Edit (pencil icon) → Version: New version → Deploy**.

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

## Step 7: Set Up the Slash Command

1. Go back to your Slack app settings at https://api.slack.com/apps
2. In the left sidebar, click **Slash Commands**
3. Click **Create New Command**
4. Fill in:
   - **Command:** `/balance`
   - **Request URL:** The Web app URL from Step 5
   - **Short Description:** `Check your Flex Fund balance`
   - **Usage Hint:** (leave blank)
5. Click **Save**

## Step 8: Enable Events API (for reaction handling)

1. In the left sidebar, click **Event Subscriptions**
2. Toggle **Enable Events** to On
3. In **Request URL**, paste the Web app URL from Step 5
   - Slack will send a verification challenge — the script handles this automatically
   - You should see a green "Verified" checkmark
4. Under **Subscribe to bot events**, click **Add Bot User Event** and add:
   - `reaction_added`
5. Click **Save Changes**

> If the URL verification fails, make sure you deployed the web app (Step 5) and that it's set to "Anyone" access.

## Step 9: Invite the Bot to the Channel

1. In Slack, go to #flex-fund-approvals
2. Type `/invite @Flex Fund Bot` (or whatever you named your app)

## Step 10: Set Up Triggers in Apps Script

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

## Step 11: Disable Your Zapier Automation

Once you've verified the new automation is working (test by submitting a form response), disable or delete your existing Zapier zaps.

## Step 12: Test!

1. **Test form submission:** Submit a test entry through the Google Form. You should see a message appear in #flex-fund-approvals within a few seconds.
2. **Test approval:** React to the message with :white_check_mark: using Siobhan or Jake's account (or temporarily add your own user ID to the approvers list). Check that the email arrives.
3. **Test /balance:** Type `/balance` in any Slack channel. You should see an ephemeral message with your balance.
4. **Test monthly summary:** Run `postMonthlySummary` manually from the Apps Script editor (click the function dropdown → select `postMonthlySummary` → click Run).

---

## Troubleshooting

### Messages not appearing in Slack
- Check that `SLACK_BOT_TOKEN` is set correctly in Script Properties
- Check that `APPROVAL_CHANNEL_ID` is the channel ID (starts with C), not the channel name
- Check that the bot is invited to the channel
- Check the Apps Script execution log: **Executions** in the left sidebar

### /balance not working
- Make sure the slash command Request URL matches your web app URL exactly
- Make sure you redeployed after any code changes
- Check that the bot has `users:read` and `users:read.email` scopes

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
