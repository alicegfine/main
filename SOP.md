# Flex Fund — Standard Operating Procedure

**Owner:** Operations (Alice Fine) · **Last updated:** 2026-06-04

This SOP documents how Flex Fund reimbursements are requested, approved, paid,
recorded, and reconciled, and the financial controls that govern the process.
For policy (eligibility, eligible expenses, tax treatment, dollar limits), see the
**[Flex Fund pilot procedure (Coda)](https://coda.io/d/_dXjoZt3s5rz/Flex-Fund-pilot-procedure_suniNBqo)** —
that page governs policy; this SOP governs operations.

---

## 1. Roles & responsibilities

| Role | Person | Title | Responsibility |
|------|--------|-------|----------------|
| Requester | Any eligible employee | — | Submit a request + receipt via the web app |
| Approver | Jake Swett | Executive Director | Review and approve/decline requests |
| Approver | Siobhan Brenton | COO | Review and approve/decline requests |
| System & records admin | Alice Fine | Operations Associate | Maintain allocations, oversee payroll reconciliation, handle exceptions, year-end reset |
| Payroll processor | Leanna Williams | Payroll & HR Technology Specialist (contractor, AJG/Gallagher) | Add approved reimbursements to payroll, apply tax gross-up, pay via paycheck, send the payroll journal |

**Separation of duties:** submission (employee), approval (ED or COO), recording &
reconciliation (Operations), and payment (external payroll contractor) are performed
by four different parties.

---

## 2. Policy summary (see Coda for full detail)

- Annual per-person allocation: **$3,000 work-life improvement** + **$2,000 professional development**.
- Work-life funds may also be used for professional development; the $2,000 prof-dev
  allocation is prof-dev only. (A prof-dev expense draws the prof-dev bucket first, then
  any remaining work-life balance.)
- **Work-life** reimbursements may be taxable and are **grossed up** so the employee nets
  the full amount; the gross-up counts against the work-life balance. **Professional
  development** reimbursements are not taxable.
- Allocations **reset January 1**; unused funds **do not carry over**.
- Allocations are **prorated** for FTE % and partial-year employment (start/departure
  within the calendar year).

---

## 3. Systems & records (audit trail)

| System | What it holds |
|--------|---------------|
| **Flex Fund web app** (Google Apps Script, domain-restricted sign-in) | Request submission + live balance |
| **Google Sheet — "Current Year Form Responses"** | Every request: timestamp, requester, purchase date, description, amount, category, receipt link, explanation, estimated gross-up, **status**, **actual gross-up**, **paid date**, unique **request ID**. Prior years archived (e.g., "2025 Form Responses"). |
| **Google Sheet — "Current Year Balances"** | Per-person allocations with start/end dates and FTE %; maintained by Operations |
| **Google Drive — "Flex Fund Receipts"** | Uploaded receipts, auto-shared so approvers can view |
| **Slack — #flex-fund-approvals** | Approval record: the approver's ✅ reaction and timestamp |
| **Payroll (AJG/Gallagher)** | Actual payment + tax gross-up; **Payroll Journal Report (CSV)** issued each pay run |

Balances are **computed from the request records** (allocation − non-declined requests,
using the actual gross-up once payroll reports it), not hand-entered.

---

## 4. Employee procedure — submitting a request

1. Open the **Flex Fund web app** and sign in with your Blueprint Google account:
   `https://script.google.com/a/macros/blueprintbiosecurity.org/s/AKfycbxsADPGztKqEXKGtU3h8W0hGgpUTSktR_H_GV1F5EEQQ-mpPsFjLAseoEP8bKFhkMW0xA/exec`
2. Review your remaining balance (Prof Dev / Work-Life / Total) at the top.
3. Complete the form: purchase date, description, amount, category (Work-life
   improvement or Professional development), **upload your receipt (required — photo
   or PDF)**, and a brief explanation.
4. The app shows the estimated tax gross-up (~40%) for work-life expenses and warns if
   the request would exceed your balance. **Do not submit over-budget requests** — they
   will be declined.
5. Submit. The request goes to the approvers; you'll see confirmation and your updated balance.
6. After approval, payroll reimburses you on an upcoming paycheck (payroll runs
   **semi-monthly**). Work-life reimbursements are grossed up for taxes.

*One receipt per request — submit a separate request for additional expenses.*

---

## 5. Approver procedure (Jake / Siobhan)

1. New requests post to **#flex-fund-approvals** with the requester, amount, category,
   gross-up estimate, receipt link, explanation, and before/after balance (plus an
   **over-budget warning** when applicable).
2. **Review:** expense is eligible (per Coda policy), a receipt is attached, and the
   request is within the remaining balance.
3. **Approve** by reacting with ✅. This emails the reimbursement to payroll and notifies
   Operations to capture the gross-up.
   - **Either** approver may approve; **one** approval is sufficient.
   - **No self-approval:** an approver's own request (and any request from Operations) is
     approved by the **other** approver.
   - **Over-budget or ineligible** requests are **declined** (react ❌, or leave unapproved
     and notify Operations to release the reserved balance).
4. The approval (who and when) is recorded in Slack.

---

## 6. Admin procedure (Operations — Alice)

### 6a. Maintain allocations — "Current Year Balances"
- **New hire:** add a row with email, start date, FTE %, and the prorated PD/WL allocations.
- **Departure:** enter the end date and prorate the allocation to the departure date.
- **FTE change:** update FTE % and re-prorate.
- This sheet is the source of truth the app reads for allocations.

### 6b. Reconcile payroll — each pay run
- Leanna emails the **Payroll Journal Report (CSV)** after each semi-monthly run.
- The automated importer (daily job) reads it from the Operations inbox and, per person,
  matches each reimbursement to the open request, records the **actual gross-up**
  (work-life) and the **paid date**, then DMs Operations a summary of what it applied and
  anything it flagged.
- **Review the summary.** Resolve flagged items by hand (e.g., when a person has multiple
  same-amount open requests) by entering the paid date / actual gross-up on the correct row.

### 6c. Exceptions
- **Abandoned/withdrawn request:** set the row's **Status** to `declined` to release the
  reserved balance.
- **Name mismatch / missing allocation / amount discrepancy:** flagged in the import
  summary; investigate and correct on the relevant row.

### 6d. Monthly review
- A monthly balance summary posts to #flex-fund-approvals on the last business day.
  Review for anomalies.

### 6e. Year-end reset (January 1)
- Rename the prior year's tabs (e.g., "Current Year Balances" → "2026 Balances", and the
  same for Form Responses) and create fresh **"Current Year …"** tabs for the new year.
  Because the system always reads the "Current Year …" tabs, no code change is needed.
- Set the new year's allocations (prorated for anyone mid-year). Unused funds do not carry over.

---

## 7. Financial controls (audit reference)

- **Authorization:** no reimbursement is paid without an approver's recorded ✅ in Slack;
  payroll acts only on the resulting approval email.
- **Separation of duties:** request, approve, record/reconcile, and pay are performed by
  four different parties; no one approves their own request.
- **Documentation:** a receipt is **required** for every request and retained in Drive;
  description and business-purpose explanation are captured.
- **Budget limits:** per-person annual caps via allocations; balances are displayed and
  the system warns on over-budget; over-budget requests are declined.
- **Tax compliance:** taxable (work-life) reimbursements are grossed up through payroll;
  the actual gross-up is recorded per request.
- **Completeness & accuracy:** each request carries a unique ID, timestamp, and status;
  balances are computed from the records; payroll is **reconciled each run** to confirm
  payment and the actual amounts.
- **Monitoring & review:** monthly balance summary; payroll-import exception flags reviewed
  by Operations.

---

## 8. Control notes / known manual steps (transparency for audit)

- **Self-approval prevention is a procedural control** — the approval tool does not
  technically block an approver from reacting to their own request; policy and practice
  require the other approver to act.
- **Two intake paths during rollout:** the web app (receipt required, balance shown) is
  the controlled path; a legacy Google Form remains available. Recommendation: retire the
  legacy form once the team has adopted the web app, or ensure the form also requires a
  receipt, so the receipt control is uniform.
- **Releasing reserved balance** for an unapproved/withdrawn request is a manual step
  (Operations sets Status = `declined`).
