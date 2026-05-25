// Headless test of the loan-calculator engine.
// Loads the same modules the browser uses (js/engine.js, js/fixtures.js) via
// require, runs the 5 acceptance tests, and prints a verdict plus a pass count.
//
//   node test-engine.mjs

import { createRequire } from 'node:module';
import path from 'node:path';
import url from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

const { compute, fmtMoney } = require(path.join(__dirname, 'js', 'engine.js'));
const { TESTS, approxEqual } = require(path.join(__dirname, 'js', 'fixtures.js'));

let passes = 0, fails = 0;
for (const t of TESTS) {
  const r = compute(t.state);
  const diffs = [];
  for (const key of Object.keys(t.expect)) {
    const exp = t.expect[key];
    const got = r[key];
    if (!approxEqual(got, exp, 0.01)) {
      diffs.push(`  ${key}: expected ${fmtMoney(exp)}, got ${fmtMoney(got)} (Δ ${fmtMoney(got - exp)})`);
    }
  }
  if (diffs.length === 0) {
    passes++;
    console.log(`PASS  ${t.name}`);
    console.log(`        outstanding ${fmtMoney(r.outstandingPrincipal)} · accrued ${fmtMoney(r.accruedUnpaidInterest)} · int-paid ${fmtMoney(r.totalInterestPaid)} · prin-paid ${fmtMoney(r.totalPrincipalPaid)} · owed ${fmtMoney(r.totalOwedAsOf)}`);
  } else {
    fails++;
    console.log(`FAIL  ${t.name}`);
    diffs.forEach(d => console.log(d));
  }
}
console.log('');
console.log(`${passes}/${TESTS.length} passed${fails ? `, ${fails} failed` : ''}.`);
process.exit(fails ? 1 : 0);
