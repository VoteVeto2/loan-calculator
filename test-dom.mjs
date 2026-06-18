// DOM integration test. Loads index.html + the real JS modules into jsdom,
// then drives the UI the way a user would: edits, autosave, session
// create/switch/duplicate/delete, and the self-test button. Verifies the
// controller wiring and localStorage persistence end to end.
//
//   bun install && bun test-dom.mjs

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { JSDOM } from 'jsdom';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(__dirname, p), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
function ok(cond, label, extra) {
  if (cond) { pass++; console.log('PASS  ' + label); }
  else { fail++; console.log('FAIL  ' + label + (extra ? '  →  ' + extra : '')); }
}

// Load markup without the external <script src> tags; we eval the modules
// ourselves for deterministic load order, then fire DOMContentLoaded.
const html = read('index.html').replace(/<script src="[^"]*"><\/script>\s*/g, '');
const dom = new JSDOM(html, { url: 'https://loan.test/', runScripts: 'dangerously', pretendToBeVisual: true });
const win = dom.window;
const doc = win.document;
win.confirm = () => true; // auto-accept delete confirmations

for (const f of ['engine', 'fixtures', 'store', 'render', 'app']) {
  win.eval(read(`js/${f}.js`));
}
doc.dispatchEvent(new win.Event('DOMContentLoaded'));

const $ = (s) => doc.querySelector(s);
const fire = (el, type) => el.dispatchEvent(new win.Event(type, { bubbles: true }));
const sessions = () => JSON.parse(win.localStorage.getItem('loanCalc.sessions.v1') || '[]');
const activeId = () => win.localStorage.getItem('loanCalc.activeSession.v1');
const optCount = () => $('#sessionSelect').querySelectorAll('option').length;

async function run() {
  await win.__loanReady; // boot is async now (store picks a backend before first render)

  // ---- 1. modules registered ----
  ok(win.LoanEngine && win.LoanStore && win.LoanRender && win.LoanFixtures, 'all modules registered on window');

  // ---- 2. first run seeds the example session and renders it ----
  ok(optCount() === 1, 'one session seeded on first run', 'options=' + optCount());
  ok(sessions().length === 1 && sessions()[0].name === 'Example loan', 'seeded session is "Example loan"');
  ok($('#scheduleArea').querySelector('table.schedule') != null, 'schedule table rendered');
  ok($('#sumOwed').textContent === '54,568.96', 'example owed = 54,568.96', $('#sumOwed').textContent);
  ok($('#sumPrincipal').textContent === '52,975.34', 'example outstanding = 52,975.34', $('#sumPrincipal').textContent);

  const exampleId = activeId();

  // ---- 3. edit recomputes live (example session stays penalty-free) ----
  $('#principal').value = '200000';
  fire($('#principal'), 'input');
  ok($('#sumPrincipal').textContent === '155,950.68', 'editing principal recomputes outstanding', $('#sumPrincipal').textContent);

  // ---- 4. edit autosaves to localStorage (debounced) ----
  await sleep(700);
  const saved = sessions().find((s) => s.id === exampleId);
  ok(saved && saved.loan.principal === 200000, 'edit persisted to localStorage', saved && saved.loan.principal);
  ok(/All changes saved/.test($('#saveStatus').textContent), 'save status shows saved', $('#saveStatus').textContent);

  // ---- 5. new session, isolated so the penalty test below can't pollute the example ----
  $('#newSession').click();
  ok(optCount() === 2, 'new session adds an option', 'options=' + optCount());
  ok(activeId() !== exampleId, 'active switched to the new session');
  ok($('#principal').value === '100000', 'new session loads blank defaults (100000)', $('#principal').value);
  ok($('#penaltyList .list-empty') != null, 'new session has no penalty rows');
  const newId = activeId();

  // ---- 6. add a penalty window to the NEW session and confirm it persists ----
  $('#addPenalty').click();
  ok($('#penaltyList input[data-field="rate"]') != null, 'penalty row added and rendered');
  await sleep(700);
  ok(sessions().find((s) => s.id === newId).penalties.length === 1, 'penalty persisted',
     'len=' + (sessions().find((s) => s.id === newId) || {}).penalties);

  // ---- 7. switch back to the example session (which must be unaffected) ----
  const sel = $('#sessionSelect');
  sel.value = exampleId;
  fire(sel, 'change');
  ok(activeId() === exampleId, 'switched back to example session');
  ok($('#principal').value === '200000', 'example session restored its edited principal', $('#principal').value);
  ok($('#penaltyList .list-empty') != null, 'example session still has no penalty (no cross-session leak)');
  ok($('#sumPrincipal').textContent === '155,950.68', 'restored session recomputes correctly', $('#sumPrincipal').textContent);

  // ---- 8. rename ----
  $('#sessionName').value = 'Renamed loan';
  fire($('#sessionName'), 'input');
  ok(sessions().find((s) => s.id === exampleId).name === 'Renamed loan', 'rename persisted');

  // ---- 9. duplicate ----
  const beforeDup = optCount();
  $('#dupSession').click();
  ok(optCount() === beforeDup + 1, 'duplicate adds an option');
  ok(/\(copy\)$/.test(sessions().find((s) => s.id === activeId()).name), 'duplicate name ends with (copy)');

  // ---- 10. delete (confirm auto-accepted) ----
  const beforeDel = optCount();
  $('#delSession').click();
  ok(optCount() === beforeDel - 1, 'delete removes an option', 'options=' + optCount());

  // ---- 11. self-test button ----
  $('#runTests').click();
  ok(/5\/5 passed/.test($('#testResults').textContent), 'in-browser self-tests report 5/5', $('#testResults').textContent.replace(/\s+/g, ' ').slice(-40));

  // ---- 12. persistence across a fresh load (simulate reopening the app) ----
  const dom2 = new JSDOM(html, { url: 'https://loan.test/', runScripts: 'dangerously', pretendToBeVisual: true });
  const win2 = dom2.window;
  // Copy the persisted storage into the second instance.
  win2.localStorage.setItem('loanCalc.sessions.v1', win.localStorage.getItem('loanCalc.sessions.v1'));
  win2.localStorage.setItem('loanCalc.activeSession.v1', win.localStorage.getItem('loanCalc.activeSession.v1'));
  for (const f of ['engine', 'fixtures', 'store', 'render', 'app']) win2.eval(read(`js/${f}.js`));
  dom2.window.document.dispatchEvent(new win2.Event('DOMContentLoaded'));
  await win2.__loanReady;
  const sameCount = win2.document.querySelectorAll('#sessionSelect option').length;
  ok(sameCount === optCount(), 'reopening the app restores all sessions', 'reopened=' + sameCount + ' vs ' + optCount());

  console.log('');
  console.log(`${pass}/${pass + fail} checks passed${fail ? `, ${fail} failed` : ''}.`);
  process.exit(fail ? 1 : 0);
}

run().catch((e) => { console.error(e); process.exit(2); });
