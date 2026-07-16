# Loan Calculator

**English** | [简体中文](./README.cn.md)

A single-page loan tracker: enter a loan, add penalty-rate (罚息) windows and partial repayments, and see how each payment splits between interest and principal, with running balances. Every calculation is saved as a named session. No build step.

## Run it

**With git-tracked history (recommended).** Needs [Bun](https://bun.sh):

```bash
bun install
bun start       # http://localhost:5173
```

Sessions are written to `data/sessions/<id>.json` — commit them and your history travels with the repo.

**Standalone.** Double-click `index.html`; it runs from `file://` and saves to the browser's `localStorage` instead (per browser, per machine).

## Use it

1. **The loan** — amount, annual rate (as a percent), start date, and the date to compute the balance on. Advanced: day basis `365` (民间借贷) or `360` (PBOC).
2. **Payments** (optional) — each is allocated interest-first, then principal; overpayment shows as a credit (PRC Civil Code Art. 561).
3. **Penalty rate** (optional) — date ranges `[start, end)` whose rate overrides the base rate; later-added periods win on overlap.

Results recompute live: a sticky **Still owed** panel plus a day-by-day ledger. Header/footer shortcuts load a worked example and run the built-in checks.

## How interest is computed

The timeline splits at every event (start, penalty edges, payments, as-of date); each segment accrues simple interest:

```
segmentInterest = principalAtSegmentStart * (annualRate / dayBasis) * segmentDays
```

Day counts are half-open (start counted, end not). Unpaid interest carries forward but never compounds. Rounding to two decimals happens only at display time.

## Tests

```bash
bun install
bun run test    # engine 5/5 · DOM 25/25 · server 18/18
```

(Use `bun run test`, not `bun test`.) Layers: `test:engine` (pure math, no deps), `test:dom` (real UI in jsdom), `test:server` (spawns `server.mjs`, drives the real client).

## Layout

```
index.html      markup · styles.css  palette + layout
js/engine.js    pure loan math       js/store.js   persistence (server or localStorage)
js/render.js    view layer           js/app.js     controller
js/fixtures.js  acceptance scenarios
server.mjs      Bun server + REST API over data/sessions/
test-*.mjs      the three test layers · onboard.md  contributor guide
```

Scripts load as classic `<script>` tags (not ES modules) so double-clicking `index.html` works from `file://`.

## Limits

Simple interest only — no compounding or amortization schedules. Statutory caps (4x LPR, 24%/36%) are not enforced. Not legal or financial advice.
