# Onboarding: Loan Calculator

A developer's map of this repo. The [README](./README.md) tells you how to *use*
the app; this file tells you how the *code* is organized, how data flows, and
where to look when you want to change something.

## 30-second summary

A no-build web app. It computes how a loan accrues interest over time, splits
each repayment into interest and principal, and shows running balances. Every
calculation is saved as a named "session".

Two ways to run, and that decides where sessions are stored:
- **`bun start`** serves the app at http://localhost:5173 and persists each
  session as a file under `data/sessions/` — plain text, tracked by git, shared
  via `git pull`.
- **Double-click `index.html`** runs straight from `file://` and falls back to
  the browser's `localStorage` — no server, but data stays on one machine.

The browser loads five plain `<script>` files in order; the same math files are
reused by the tests, which run under Bun.

## Run and test

```bash
# run with git-tracked history (needs Bun)
bun install             # one time: pulls jsdom (tests only)
bun start               # → http://localhost:5173

# or just open it (file://, localStorage)
open index.html         # start / xdg-open on Windows / Linux

# tests — use `bun run test`, NOT `bun test` (that runs Bun's own test runner)
bun run test            # engine 5/5 + DOM 25/25 + server 18/18
```

## Repo map

```
loan-calculator/
├─ index.html         markup shell only. No data, no logic, no styling.
├─ styles.css         all visuals. The Anthropic color palette lives in :root.
├─ js/
│  ├─ engine.js       PURE loan math. The only file with the formulas.
│  ├─ fixtures.js     the 5 test scenarios + their expected numbers.
│  ├─ store.js        reads/writes sessions: server files (git-tracked) or localStorage.
│  ├─ render.js       turns data into HTML (the tables and the summary).
│  └─ app.js          the brain: live state, button/keystroke handling, autosave, boot.
├─ server.mjs         Bun dev server: serves the app + REST API over data/sessions/.
├─ data/sessions/     one <id>.json per saved calculation. Tracked in git.
├─ PRD.html           the spec: palette, data model, rules, acceptance tests.
├─ README.md          user-facing: how to use the app.
├─ onboard.md         this file.
├─ test-engine.mjs    test of the math (no dependencies).
├─ test-dom.mjs       jsdom test of the whole UI (localStorage path).
├─ test-server.mjs    spawns server.mjs, drives store.js against it.
├─ package.json       Bun scripts + the jsdom dev dependency.
└─ node_modules/      jsdom. Only needed for the tests.
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
| `store.js` | `LoanStore` | CRUD over sessions (server files or `localStorage`) | no | yes |
| `render.js` | `LoanRender` | builds HTML from data, writes it into the page | yes | no |
| `app.js` | (nothing) | owns live `state`, wires events, calls the others | yes | via `LoanStore` |

The mental model: **`index.html` is the empty stage, `styles.css` is the
lighting, `app.js` is the director, `engine.js` does the arithmetic,
`render.js` paints the scenery, and `store.js` is the filing cabinet.**

## Where is...? (navigation FAQ)

### Where is my data stored? (the question that started this file)

**Not in `index.html`.** That file only contains empty placeholders filled in at
runtime — the total on screen is just `<span id="sumOwed">0.00</span>`; the real
number is written into it by JavaScript.

While the app is open, your live data is in memory in the `state` object inside
`js/app.js` (`{ loan, penalties, repayments }`), plus `activeSession`, the saved
record it belongs to.

Between visits it is persisted by `js/store.js`, which picks a backend once at
boot (`ready()`):

- **Server backend** (served by `bun start`): each session is a file
  `data/sessions/<id>.json`, read and written over `/api/sessions` by
  `server.mjs`. These are git-tracked — that is what makes history survive a
  `git pull`.
- **localStorage backend** (`file://`, or the server is down): sessions live
  under `localStorage["loanCalc.sessions.v1"]`, exactly as before.

Either way the **active-session pointer** stays in
`localStorage["loanCalc.activeSession.v1"]` — per-user view state, not something
to track in git. `store.js` keeps an in-memory `cache` as the synchronous source
of truth the UI reads from; each save updates the cache and fans out to whichever
backend is active.

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

*Served by `bun start`, that same `save()` instead issues `PUT
/api/sessions/<id>`, which `server.mjs` writes to `data/sessions/<id>.json`. On
reopen, `Store.ready()` loads the folder via `GET /api/sessions` rather than
reading localStorage — so a `git pull` shows up the next time you open the app.*

On reopen:

```
app.js init()
   store.js getActiveId() + list()   ◄── reads localStorage
   bindSession(thatSession)          → state points at it
   render everything                 → you are back where you left off
```

## Your saved data: view, edit, reset

**Under the server**, sessions are just files: look in `data/sessions/`, edit or
delete the `<id>.json` files directly, or run `git log -p data/sessions/` to see
how a loan changed over time. The server re-reads the folder on every load.

**In `file://` mode**, data is in `localStorage`. To inspect it:

1. Open the app, then DevTools (F12).
2. **Application** tab → **Local Storage** → the `file://` entry.
3. Look at `loanCalc.sessions.v1` (all sessions) and `loanCalc.activeSession.v1`
   (the active id).

To reset, delete those keys (or click **Delete** per session in the app — one
always remains). If `localStorage` is blocked (private window), `store.js` detects
it in `probe()` and falls back to an in-memory list: the app still works for the
visit but nothing is written, and the status line says so.

## Common changes (recipes)

**Add a new loan input (say, a fee).**
1. Add the `<input id="fee">` in `index.html` (Loan setup card).
2. Add `fee` to the loan objects in `app.js` `exampleData()` / `blankData()`.
3. Read it in `app.js` `wireLoanInputs` and write it in `syncLoanInputs`.
4. Use it in `engine.js` `compute()`.
5. Add an `expect` for it in a `fixtures.js` case, run `bun run test`.

**Change a color.** Edit the variable in `styles.css` `:root`. It updates
everywhere that references it.

**Change the day-count or rounding.** Day-count and the daily-rate formula are
in `engine.js` `compute()` (`basis`, `dailyRate`). Display rounding is in
`engine.js` `fmtMoney()`.

**Change the autosave delay.** `app.js` `scheduleSave()`, the `400` (ms).

**Add a 6th test.** Append to `TESTS` in `js/fixtures.js`. It is picked up by
both the in-app button and `bun run test` automatically.

## Conventions and gotchas

- **Classic scripts, not ES modules.** There are no `import`/`export`
  statements. Opening from `file://` blocks ES module loading (CORS), so the
  files are plain `<script>` tags that share globals (`LoanEngine`, etc.). The
  same files must work both under the server and by double-click, so keep it that
  way.
- **Boot is async.** `app.js init()` awaits `Store.ready()`, which probes
  `/api/sessions` to pick the server backend and otherwise falls back to
  localStorage. It exposes `window.__loanReady` so the tests can await first
  render; do not turn boot back into a synchronous function.
- **Two backends, one synchronous API.** `store.js` keeps `list/get/save/remove`
  synchronous via the in-memory `cache`; writes fan out to server files (a `PUT`)
  or localStorage. The active-session pointer always stays in localStorage.
- **Bun, not Node.** Run scripts with `bun run test` — bare `bun test` invokes
  Bun's own test runner and finds nothing. `server.mjs` uses Bun APIs
  (`Bun.serve`, `Bun.file`, `Bun.Glob`).
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
