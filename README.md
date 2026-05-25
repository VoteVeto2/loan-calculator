# Loan Calculator

**English** | [简体中文](./README.cn.md)

A single-page loan tracker. Enter a loan, apply custom penalty-rate (罚息) windows, log partial repayments, and see how every payment splits between interest (利息) and principal (本金), with running balances. Each calculation is saved as a named **session** you can return to later.

No build step and no runtime dependencies (apart from Google Fonts). Open `index.html` and use it.

## Project layout

```
loan-calculator/
  index.html        markup only
  styles.css        palette + layout
  js/
    engine.js       pure loan math + formatting (no DOM, no storage)
    fixtures.js     the 5 acceptance scenarios + expected figures
    store.js        session persistence over localStorage
    render.js       view layer: data in, DOM out
    app.js          controller: state, events, autosave, boot
  PRD.html          product requirements (open in a browser)
  onboard.md        developer's map of the repo (start here to contribute)
  test-engine.mjs   headless engine test (Node, no deps)
  test-dom.mjs      DOM integration test (Node + jsdom)
  package.json      declares the jsdom dev dependency + test scripts
```

The browser loads the JS as classic `<script>` tags in dependency order
(`engine → fixtures → store → render → app`). They are intentionally **not** ES
modules, because ES module imports are blocked by CORS when a page is opened
directly from disk (`file://`); classic scripts work by double-click.

## Open the app

Double-click `index.html`, or from a terminal:

```powershell
start index.html        # Windows
```

```bash
open index.html         # macOS
xdg-open index.html     # Linux
```

## Sessions (your data is saved)

Every calculation is a session stored in the browser's `localStorage`, so your
work is still there the next time you open the app.

- The session bar at the top has a **dropdown** of all your sessions and a **Name** field for the current one.
- **+ New** starts a fresh session (today's date, blank repayments). **Duplicate** clones the current one. **Delete** removes it (one session always remains).
- Edits **autosave** automatically a moment after you stop typing; the status line reads "All changes saved · HH:MM:SS".
- On launch, the app reopens the session you last used. First-time users get a seeded "Example loan".

Storage is per browser, per machine. If `localStorage` is unavailable (private
mode, locked-down browser), the app still runs but keeps data only for that
visit, and the status line says so.

## How to use

1. **Loan setup**
   - **Loan amount** (本金): the principal disbursed, in CNY.
   - **Annual rate** (年利率): base interest rate, entered as a percent (e.g. `6` for 6%).
   - **Start date** (起息日): interest begins accruing on this date.
   - **Maturity** (到期日): informational. It does not by itself change the rate; use a penalty window for that.
   - **As-of date** (计算截止日): the date you are calculating up to. Interest accrues from start through this date.
   - **Day basis**: `365` (民间借贷 convention) or `360` (PBOC bank-loan notice). Daily rate = annual rate / basis.

2. **Penalty windows** (optional)
   - Click **+ Add window**. Each window is a date range `[start, end)` with its own annual rate that overrides the base rate inside that range.
   - Typical use: model an overdue period by adding a window that starts on the maturity date at the higher 罚息 rate.
   - The default new window spans the loan period at 1.5x the base rate; edit as needed.
   - If windows overlap, the one added later wins.

3. **Repayments** (optional)
   - Click **+ Add repayment**. Enter a date and amount. Each repayment is allocated in this order (PRC Civil Code Art. 561):
     1. **Interest first**: pays down accrued unpaid interest.
     2. **Principal next**: any remainder reduces the principal.
     3. **Overpayment**: anything beyond principal + interest is shown as a credit.
   - Repayments before the start date are flagged and ignored. Repayments after the as-of date are flagged and not yet applied.

4. **Read the results**
   - **Summary** shows four figures: outstanding principal, accrued unpaid interest, total interest paid, total principal paid, plus the total owed at the as-of date.
   - **Schedule** is a chronological ledger. Each accrual row shows the day count, rate, and interest added for that segment; each repayment row shows the interest/principal split and the resulting balances.

Everything recomputes live as you type. There is no Calculate button.

### Shortcuts

- **Load example** creates a new session containing a 100,000 loan at 6% with a single 50,000 repayment on 2025-07-01 (non-destructive — it does not overwrite your current session).
- **Run self-tests** executes the 5 acceptance scenarios inside the browser and prints pass/fail for each.

## How interest is computed

The timeline is split at every event boundary: the start date, each penalty-window edge, each repayment date, and the as-of date. Within each segment the rate is constant and simple interest accrues:

```
segmentInterest = principalAtSegmentStart * (annualRate / dayBasis) * segmentDays
```

Day counts are half-open: the start of a segment is counted, the end is not. So 2025-01-01 to 2025-12-31 is 364 days. Unpaid interest carries forward but is never capitalized into principal (no compounding).

All arithmetic runs in full double precision; values are rounded to two decimals only for display. The total-owed figure is `round(principal + accruedInterest)`, so it can differ by one cent from visually adding the two rounded components.

## Verify the math

The engine test has no dependencies:

```bash
node test-engine.mjs
```

```
PASS  Test 1 — Simple, no repayments, no penalty
PASS  Test 2 — Single mid-year repayment, no penalty
PASS  Test 3 — Penalty window mid-period, no repayments
PASS  Test 4 — Full payoff at maturity
PASS  Test 5 — Overdue with penalty + partial repayment

5/5 passed.
```

The DOM integration test drives the real UI (edits, autosave, session
create/switch/duplicate/delete, cross-session isolation, persistence across a
simulated reload). It needs jsdom:

```bash
npm install        # installs jsdom (dev dependency)
node test-dom.mjs  # 25/25 checks passed.
```

Or run both at once with `npm test`.

The five scenarios and their expected figures (365-day basis):

| # | Scenario | Outstanding | Accrued | Interest paid | Principal paid | Total owed |
|---|----------|------------:|--------:|--------------:|---------------:|-----------:|
| 1 | 100,000 @ 6%, no repayments, to 2025-12-31 | 100,000.00 | 5,983.56 | 0.00 | 0.00 | 105,983.56 |
| 2 | + 50,000 repaid on 2025-07-01 | 52,975.34 | 1,593.61 | 2,975.34 | 47,024.66 | 54,568.96 |
| 3 | Penalty 12% over 2025-04-01 to 2025-07-01 | 100,000.00 | 7,479.45 | 0.00 | 0.00 | 107,479.45 |
| 4 | 50,000 @ 8% paid off at maturity | 0.00 | 0.00 | 1,972.60 | 50,000.00 | 0.00 |
| 5 | 200,000 @ 5%, 10% penalty from 07-01, 50,000 repaid 09-30 | 159,945.21 | 4,031.50 | 9,945.21 | 40,054.79 | 163,976.70 |

## Notes and limits

- Simple interest only. No compounding, no 等额本息 / 等额本金 amortization schedules.
- Statutory caps (4x LPR, 24%/36% thresholds) are not enforced; the app computes whatever rates you enter.
- Sessions are stored per browser on your machine; clearing browser data removes them.
- Not legal or financial advice.
