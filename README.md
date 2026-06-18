# Loan Calculator

**English** | [简体中文](./README.cn.md)

A single-page loan tracker. Enter a loan, apply custom penalty-rate (罚息) windows, log partial repayments, and see how every payment splits between interest (利息) and principal (本金), with running balances. Each calculation is saved as a named **session** you can return to later.

No build step. Run it two ways: **double-click `index.html`** (saves to the browser), or **`bun start`** to serve it with a small API that writes each calculation to a git-tracked JSON file — so your history travels with `git pull`.

## Project layout

```
loan-calculator/
  index.html        markup only
  styles.css        palette + layout
  js/
    engine.js       pure loan math + formatting (no DOM, no storage)
    fixtures.js     the 5 acceptance scenarios + expected figures
    store.js        session persistence: server files (git-tracked) or localStorage
    render.js       view layer: data in, DOM out
    app.js          controller: state, events, autosave, boot
  server.mjs        Bun dev server: serves the app + a REST API over data/sessions/
  data/sessions/    one JSON file per saved calculation (tracked in git)
  PRD.html          product requirements (open in a browser)
  onboard.md        developer's map of the repo (start here to contribute)
  test-engine.mjs   headless engine test (no deps)
  test-dom.mjs      DOM integration test (jsdom, localStorage path)
  test-server.mjs   server integration test (spawns server.mjs, drives store.js)
  package.json      Bun scripts + the jsdom dev dependency
```

The browser loads the JS as classic `<script>` tags in dependency order
(`engine → fixtures → store → render → app`). They are intentionally **not** ES
modules, because ES module imports are blocked by CORS when a page is opened
directly from disk (`file://`); classic scripts work by double-click.

## Run it

**With history tracked in git (recommended).** Needs [Bun](https://bun.sh).

```bash
bun install     # one-time: pulls jsdom (tests only)
bun start       # serves http://localhost:5173
```

Open http://localhost:5173 and use the app. Every saved calculation is written
to `data/sessions/<id>.json`; commit and push those files and your history
travels with the repo. After a `git pull` on another machine, restart the server
and the sessions are there.

**Standalone, no server.** Double-click `index.html` (or `open` / `start` /
`xdg-open` it). It runs straight from `file://` and saves to the browser's
`localStorage` instead — handy, but that data lives on one machine and is not
tracked by git.

## Sessions (your data is saved)

Every calculation is a named **session**. Where it is saved depends on how you
opened the app:

- **Served by `bun start`** → JSON files under `data/sessions/`, one per
  calculation. They diff cleanly and are tracked by git, so `git pull` brings in
  history saved elsewhere.
- **Opened as a `file://` page** → the browser's `localStorage` (per browser,
  per machine). If it is unavailable (private mode), the app still runs but keeps
  data only for that visit, and the status line says so.

The session bar has a **dropdown** of all sessions and a **Name** field. **+ New**
starts a fresh one, **Duplicate** clones it, **Delete** removes it (one always
remains). Edits **autosave** a moment after you stop typing ("All changes saved ·
HH:MM:SS"). On launch the app reopens the session you last used; first-time users
get a seeded "Example loan". The first time you start the server, any sessions
already saved in your browser are migrated up into `data/sessions/`.

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

[Bun](https://bun.sh) runs all three test layers. Use **`bun run test`** — bare
`bun test` invokes Bun's own runner, not these scripts.

```bash
bun install      # jsdom, for the DOM test
bun run test     # engine 5/5 · DOM 25/25 · server 18/18
```

The engine test (`bun run test:engine`) checks the math with no dependencies:

```
PASS  Test 1 — Simple, no repayments, no penalty
PASS  Test 2 — Single mid-year repayment, no penalty
PASS  Test 3 — Penalty window mid-period, no repayments
PASS  Test 4 — Full payoff at maturity
PASS  Test 5 — Overdue with penalty + partial repayment

5/5 passed.
```

The DOM test (`test:dom`) drives the real UI in jsdom — edits, autosave, session
create/switch/duplicate/delete, cross-session isolation, and persistence across a
simulated reload. The server test (`test:server`) spawns `server.mjs` against a
throwaway data dir and drives the real `store.js` client through it, proving a
new calculation lands in a git-trackable file and is read back on a fresh load.

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
- Under the server, sessions are JSON files in `data/sessions/` (commit them to track history); in `file://` mode they are per-browser localStorage and clearing browser data removes them.
- Not legal or financial advice.
