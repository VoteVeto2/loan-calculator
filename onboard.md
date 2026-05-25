# Onboarding: Loan Calculator

A developer's map of this repo. The [README](./README.md) tells you how to *use*
the app; this file tells you how the *code* is organized, how data flows, and
where to look when you want to change something.

## 30-second summary

A static, dependency-free web app. You open `index.html` by double-click (it
runs straight from `file://`, no server). It computes how a loan accrues
interest over time, splits each repayment into interest and principal, and shows
running balances. Every calculation is saved as a named "session" in the
browser's `localStorage`, so your numbers are still there next time you open it.

There is no build step. The browser loads five plain `<script>` files in order.
The same math files are reused by the Node tests.

## Run and test

```bash
# open the app
start index.html        # Windows  (open / xdg-open on mac / linux)

# run the tests
npm install             # one time: pulls jsdom (only the DOM test needs it)
npm test                # engine test (5/5) + DOM integration test (25/25)
```

## Repo map

```
loan-calculator/
├─ index.html         markup shell only. No data, no logic, no styling.
├─ styles.css         all visuals. The Anthropic color palette lives in :root.
├─ js/
│  ├─ engine.js       PURE loan math. The only file with the formulas.
│  ├─ fixtures.js     the 5 test scenarios + their expected numbers.
│  ├─ store.js        reads/writes your saved sessions in localStorage.
│  ├─ render.js       turns data into HTML (the tables and the summary).
│  └─ app.js          the brain: live state, button/keystroke handling, autosave, boot.
├─ PRD.html           the spec: palette, data model, rules, acceptance tests.
├─ README.md          user-facing: how to use the app.
├─ onboard.md         this file.
├─ test-engine.mjs    Node test of the math (no dependencies).
├─ test-dom.mjs       Node + jsdom test of the whole UI.
├─ package.json       declares jsdom + the `npm test` scripts.
└─ node_modules/      jsdom. Only needed to run test-dom.mjs.
```

## How the pieces connect

The scripts load in dependency order (see the bottom of `index.html`):

```
engine.js  →  fixtures.js  →  store.js  →  render.js  →  app.js
(math)        (test data)     (disk)       (paint)       (brain, boots last)
```

Each attaches itself to a global namespace, so later files can call earlier ones:

| File | Global it exposes | Responsibility | Knows about the DOM? | Knows about storage? |
|------|-------------------|----------------|:---:|:---:|
| `engine.js` | `LoanEngine` | the formulas, date math, number formatting | no | no |
| `fixtures.js` | `LoanFixtures` | 5 canned scenarios + `approxEqual` | no | no |
| `store.js` | `LoanStore` | CRUD over sessions in `localStorage` | no | yes |
| `render.js` | `LoanRender` | builds HTML from data, writes it into the page | yes | no |
| `app.js` | (nothing) | owns live `state`, wires events, calls the others | yes | via `LoanStore` |

The mental model: **`index.html` is the empty stage, `styles.css` is the
lighting, `app.js` is the director, `engine.js` does the arithmetic,
`render.js` paints the scenery, and `store.js` is the filing cabinet.**

## Where is...? (navigation FAQ)

### Where is my data stored? (the question that started this file)

**Not in `index.html`.** That file only contains empty placeholders that get
filled in at runtime. For example the total you see on screen is just
`<span id="sumOwed">0.00</span>`; the real number is written into it by
JavaScript.

Your data lives in two places:

1. **While the app is open**, in memory, in the `state` object inside
   `js/app.js`:
   ```js
   var state = { loan: {...}, penalties: [...], repayments: [...] };
   ```
   Plus `activeSession`, which is the saved record `state` belongs to.

2. **Between visits**, on disk, in the browser's `localStorage`, written by
   `js/store.js` under two keys:
   ```
   localStorage["loanCalc.sessions.v1"]      // JSON array of every session
   localStorage["loanCalc.activeSession.v1"] // id of the one you're viewing
   ```

Each session is one object:

```js
{
  id: "s...",            // unique id
  name: "Example loan",
  createdAt: "2026-...",
  updatedAt: "2026-...",
  loan:       { principal, baseRate, startDate, endDate, asOfDate, dayBasis },
  penalties:  [ { id, start, end, rate }, ... ],
  repayments: [ { id, date, amount, note }, ... ]
}
```

See [Your saved data](#your-saved-data-view-edit-reset) below for how to view
and clear it.

### Where is the actual loan math?

`js/engine.js`, function `compute(state)`. It is the only place interest is
calculated. It splits the timeline into segments at every event boundary (start,
each penalty edge, each repayment, as-of date), accrues simple interest per
segment, and applies repayments interest-first then principal. Helpers
`parseISO`, `dayDiff`, `fmtMoney`, `fmtPct` live in the same file.

### Where are the input fields defined?

`index.html`, by `id`. Quick reference for Ctrl+F:

| On screen | Element id | Read/written in |
|-----------|-----------|-----------------|
| Loan amount | `#principal` | `app.js` `wireLoanInputs` |
| Annual rate | `#baseRate` | `app.js` `wireLoanInputs` |
| Start / Maturity / As-of | `#startDate` `#endDate` `#asOfDate` | `app.js` `wireLoanInputs` |
| 365/360 toggle | `#basisToggle` | `app.js` `wireLoanInputs` |
| Penalty rows | `#penaltyList` (+ `#addPenalty`) | `render.js` `penalties`, `app.js` `wirePenalty` |
| Repayment rows | `#repaymentList` (+ `#addRepayment`) | `render.js` `repayments`, `app.js` `wireRepayment` |
| Session dropdown / name | `#sessionSelect` `#sessionName` | `app.js` `wireSessionControls` |

### Where do the result numbers get filled in?

`js/render.js`. `summary()` writes `#sumPrincipal`, `#sumAccrued`,
`#sumIntPaid`, `#sumPrinPaid`, `#sumOwed`. `schedule()` builds the ledger table
in `#scheduleArea`. These run on every change via `app.js` `recompute()`.

### Where are the colors and fonts?

`styles.css`, top of the file, the `:root { ... }` block. Every color is a CSS
variable (`--crail`, `--pampas`, `--book`, and so on). Fonts are loaded from
Google Fonts in `index.html` and assigned in `:root` (`--sans`, `--serif`,
`--money`).

### Where is the session logic (new / duplicate / delete / switch)?

Split in two layers:
- `js/store.js` does the persistence: `create`, `duplicate`, `remove`, `save`,
  `list`, `get`, `getActiveId`, `setActiveId`.
- `js/app.js` does the UI glue: `newSession`, `duplicateSession`,
  `deleteSession`, `switchTo`, wired up in `wireSessionControls`.

### Where is the autosave?

`js/app.js`. Edits call `onEdit()` which runs `recompute()` then
`scheduleSave()`. `scheduleSave` waits 400 ms (so it does not save on every
keystroke), then `commit()` copies `state` into `activeSession` and calls
`LoanStore.save()`. Change the `400` in `scheduleSave` to adjust the delay.

### Where do the 5 test numbers come from?

`js/fixtures.js`. Each entry has a `state` (inputs) and an `expect` (the figures
that must come out). Both the in-app "Run self-tests" button (`app.js`
`runSelfTests`) and `test-engine.mjs` read this same file, so the browser and
Node always test identical cases.

## Data flow: from keystroke to saved result

```
You edit a field            index.html  <input id="principal">
        │ 'input' event
        ▼
app.js  wireLoanInputs()
        state.loan.principal = <value>          ← live data now lives in `state`
        onEdit()
        │
        ├─► recompute()
        │      engine.js compute(state)         ← does the math
        │      render.js summary() / schedule() ← paints the page (NOT saved yet)
        │
        └─► scheduleSave()  (debounced 400 ms)
               commit()
                 store.js save(activeSession)
                   localStorage["loanCalc.sessions.v1"] = JSON   ← now on disk
                 render.js saveStatus("saved")  ← "All changes saved · HH:MM:SS"
```

On reopen:

```
app.js init()
   store.js getActiveId() + list()   ◄── reads localStorage
   bindSession(thatSession)          → state points at it
   render everything                 → you are back where you left off
```

## Your saved data: view, edit, reset

To inspect what is persisted:

1. Open the app, then open DevTools (F12).
2. **Application** tab → **Local Storage** → the `file://` entry (or
   `https://...` if you serve it).
3. Look at `loanCalc.sessions.v1` (all your sessions as JSON) and
   `loanCalc.activeSession.v1` (the active id).

To reset everything, delete those two keys (or click **Delete** on each session
in the app, which removes them one by one but always keeps one). Clearing the
browser's site data for this origin also wipes them.

If `localStorage` is blocked (private window, locked-down browser), `store.js`
detects it in `probe()` and falls back to an in-memory list: the app still works
for the current visit but nothing is written to disk, and the status line says
so.

## Common changes (recipes)

**Add a new loan input (say, a fee).**
1. Add the `<input id="fee">` in `index.html` (Loan setup card).
2. Add `fee` to the loan objects in `app.js` `exampleData()` / `blankData()`.
3. Read it in `app.js` `wireLoanInputs` and write it in `syncLoanInputs`.
4. Use it in `engine.js` `compute()`.
5. Add an `expect` for it in a `fixtures.js` case, run `npm test`.

**Change a color.** Edit the variable in `styles.css` `:root`. It updates
everywhere that references it.

**Change the day-count or rounding.** Day-count and the daily-rate formula are
in `engine.js` `compute()` (`basis`, `dailyRate`). Display rounding is in
`engine.js` `fmtMoney()`.

**Change the autosave delay.** `app.js` `scheduleSave()`, the `400` (ms).

**Add a 6th test.** Append to `TESTS` in `js/fixtures.js`. It is picked up by
both the in-app button and `npm test` automatically.

## Conventions and gotchas

- **Classic scripts, not ES modules.** There are no `import`/`export`
  statements. Opening from `file://` blocks ES module loading (CORS), so the
  files are plain `<script>` tags that share globals (`LoanEngine`, etc.). Keep
  it that way unless you add a server or a build step.
- **UMD in `engine.js` and `fixtures.js`.** The little wrapper at the top of
  those two files lets them attach to `window` in the browser *and* be
  `require()`d by the Node tests. The other three files are browser-only.
- **Load order matters.** `app.js` must load last; it uses all the others.
- **`init()` has a boot guard.** It runs once even if `DOMContentLoaded` fires
  twice. Do not remove it.
- **Rounding.** All math runs in full precision; numbers are rounded only when
  displayed. So the on-screen total can differ by one cent from adding the two
  displayed components by hand. This is intentional.
- **Half-open day count.** A segment counts its start day but not its end day,
  so 2025-01-01 to 2025-12-31 is 364 days.
- **`loan.endDate` (maturity) does not change the rate by itself.** Rate
  changes come only from penalty windows. To model an overdue penalty, add a
  window starting at the maturity date.
