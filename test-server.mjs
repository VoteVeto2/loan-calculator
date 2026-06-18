// Server integration test. Spawns server.mjs against a throwaway data dir, then
// (A) checks the REST contract + on-disk file format directly, and (B) drives
// the REAL js/store.js client (server backend) the way the browser does, proving
// that a new calculation persists to a git-tracked file and is read back on a
// fresh load — i.e. it would survive a `git pull`.
//
//   bun test-server.mjs
//
// Requires Bun (uses Bun.spawn + Bun.Glob via the server). Run from the repo root.

import { readFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 5199;
const BASE = `http://localhost:${PORT}`;
const DATA = path.join(tmpdir(), 'loancalc-test-' + process.pid);

let pass = 0, fail = 0;
function ok(cond, label, extra) {
  if (cond) { pass++; console.log('PASS  ' + label); }
  else { fail++; console.log('FAIL  ' + label + (extra != null ? '  →  ' + extra : '')); }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms, label) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    try { if (await fn()) return true; } catch (e) { /* keep polling */ }
    await sleep(50);
  }
  throw new Error('timeout waiting for ' + label);
}

// The loan the prototype is being signed off against.
const TEST_LOAN = {
  loan: { principal: 92300, baseRate: 0.144, startDate: '2025-11-17', endDate: '2026-11-17', asOfDate: '2026-11-17', dayBasis: 365 },
  penalties: [],
  repayments: [
    { id: 'r1', date: '2026-06-18', amount: 16000, note: '' },
    { id: 'r2', date: '2026-07-18', amount: 16000, note: '' },
    { id: 'r3', date: '2026-08-18', amount: 16000, note: '' },
  ],
};

mkdirSync(DATA, { recursive: true });
const proc = Bun.spawn(['bun', 'server.mjs'], {
  cwd: __dirname,
  env: { ...process.env, PORT: String(PORT), LOAN_DATA: DATA },
  stdout: 'pipe', stderr: 'pipe',
});

async function run() {
  await waitFor(async () => (await fetch(BASE + '/api/sessions')).ok, 5000, 'server start');

  // ---------- A. REST contract + file format ----------
  let res = await fetch(BASE + '/api/sessions');
  ok(res.ok && JSON.stringify(await res.json()) === '[]', 'empty store returns []');

  res = await fetch(BASE + '/');
  ok(res.ok && (await res.text()).includes('<title>Loan Calculator</title>'), 'serves index.html at /');

  res = await fetch(BASE + '/js/store.js');
  ok(res.ok && res.headers.get('content-type')?.includes('javascript'), 'serves js with a js content-type');

  const direct = { id: 'stest0001', name: 'Direct PUT', createdAt: '2026-06-18T00:00:00.000Z', updatedAt: '2026-06-18T00:00:00.000Z', ...TEST_LOAN };
  res = await fetch(BASE + '/api/sessions/stest0001', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(direct) });
  ok(res.status === 200, 'PUT new session → 200', res.status);

  const file = path.join(DATA, 'stest0001.json');
  ok(existsSync(file), 'PUT wrote <id>.json to disk');
  const raw = readFileSync(file, 'utf8');
  ok(raw.endsWith('\n'), 'file ends with a trailing newline');
  ok(/^\{\n  "createdAt":/.test(raw), 'top-level keys are sorted (createdAt first)', raw.slice(0, 24).replace(/\n/g, '\\n'));
  ok(raw.indexOf('"asOfDate"') < raw.indexOf('"baseRate"'), 'nested loan keys are sorted too');
  const onDisk = JSON.parse(raw);
  ok(onDisk.loan.principal === 92300 && onDisk.repayments.length === 3, 'persisted loan matches what was PUT');

  res = await fetch(BASE + '/api/sessions/stest0001');
  ok(res.ok && (await res.json()).loan.baseRate === 0.144, 'GET /api/sessions/:id returns it');

  res = await fetch(BASE + '/api/sessions/notvalid', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: 'notvalid' }) });
  ok(res.status === 400, 'rejects an id that does not match the session-id shape', res.status);
  res = await fetch(BASE + '/api/sessions/stest0001', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: 'someoneelse' }) });
  ok(res.status === 400, 'rejects a body whose id mismatches the URL', res.status);

  res = await fetch(BASE + '/api/sessions/stest0001', { method: 'DELETE' });
  ok(res.status === 204 && !existsSync(file), 'DELETE removes the file');

  // ---------- B. the real store.js client, as the browser drives it ----------
  // Shim the two browser globals store.js needs, with the API base folded in.
  const lsMap = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (k) => (lsMap.has(k) ? lsMap.get(k) : null),
      setItem: (k, v) => lsMap.set(k, String(v)),
      removeItem: (k) => lsMap.delete(k),
    },
  };
  const realFetch = globalThis.fetch;
  globalThis.fetch = (input, init) =>
    realFetch(typeof input === 'string' && input.startsWith('/') ? BASE + input : input, init);

  const storeCode = readFileSync(path.join(__dirname, 'js/store.js'), 'utf8');
  (0, eval)(storeCode); // attaches globalThis.LoanStore, same as the browser's <script>
  const Store = globalThis.LoanStore;

  await Store.ready();
  ok(Store.remote === true && Store.available === true, 'store.ready() connects to the server backend');

  const created = Store.create('Sample · 92,300 @ 14.4%', TEST_LOAN);
  ok(Store.list().some((s) => s.id === created.id), 'create() shows up immediately in the in-memory list');

  // The write fans out async; wait until the server (the files) actually has it.
  await waitFor(async () => (await (await fetch(BASE + '/api/sessions')).json()).some((s) => s.id === created.id), 3000, 'session persisted to disk');
  ok(existsSync(path.join(DATA, created.id + '.json')), 'create() wrote a git-trackable file via the server');

  // Simulate a fresh load on another machine after `git pull`: brand-new store,
  // empty localStorage, data can only come from the files the server reads.
  lsMap.clear();
  (0, eval)(storeCode); // re-evaluate → fresh module state, fresh cache
  const Store2 = globalThis.LoanStore;
  await Store2.ready();
  const reloaded = Store2.get(created.id);
  ok(reloaded != null, 'fresh load reads the session back from the server files');
  ok(reloaded && reloaded.loan.principal === 92300 && reloaded.repayments.length === 3, 'reloaded loan is intact (92,300, 3 repayments)', reloaded && reloaded.loan.principal);

  console.log('');
  console.log(`${pass}/${pass + fail} checks passed${fail ? `, ${fail} failed` : ''}.`);
}

try {
  await run();
} catch (e) {
  fail++;
  console.error('ERROR ', e && e.message ? e.message : e);
} finally {
  proc.kill();
  try { rmSync(DATA, { recursive: true, force: true }); } catch (e) { /* ignore */ }
}

process.exit(fail ? 1 : 0);
