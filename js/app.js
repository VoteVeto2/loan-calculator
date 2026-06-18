/*
 * app.js — controller and boot. Owns the working state (the active session),
 * wires DOM events, persists through LoanStore, renders through LoanRender,
 * and runs the in-browser self-tests.
 *
 * Load order (classic scripts): engine -> fixtures -> store -> render -> app.
 */
(function (root) {
  'use strict';

  var E = root.LoanEngine;
  var Store = root.LoanStore;
  var Render = root.LoanRender;
  var Fix = root.LoanFixtures;

  function $(sel) { return document.querySelector(sel); }
  function $all(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }

  // ---- date helpers ----
  function todayISO() {
    var d = new Date();
    var tz = d.getTimezoneOffset() * 60000;
    return new Date(d - tz).toISOString().slice(0, 10);
  }
  function addYearsISO(iso, n) {
    var p = (iso || todayISO()).split('-').map(Number);
    var d = new Date(Date.UTC(p[0] + n, p[1] - 1, p[2]));
    return d.toISOString().slice(0, 10);
  }

  // ---- seed data ----
  function exampleData() {
    return {
      loan: { principal: 100000, baseRate: 0.06, startDate: '2025-01-01', endDate: '2025-12-31', asOfDate: '2025-12-31', dayBasis: 365 },
      penalties: [],
      repayments: [{ id: Store.uid(), date: '2025-07-01', amount: 50000, note: '' }],
    };
  }
  function blankData() {
    var start = todayISO();
    return {
      loan: { principal: 100000, baseRate: 0.06, startDate: start, endDate: addYearsISO(start, 1), asOfDate: start, dayBasis: 365 },
      penalties: [],
      repayments: [],
    };
  }

  // ---- working state ----
  var activeSession = null;
  var state = { loan: null, penalties: null, repayments: null };
  var saveTimer = null;

  function bindSession(session) {
    activeSession = session;
    state.loan = session.loan;
    state.penalties = session.penalties;
    state.repayments = session.repayments;
  }

  function recompute() {
    var result = E.compute(state);
    Render.summary(result, state.loan.asOfDate);
    Render.schedule(result);
  }

  function renderLists() {
    Render.penalties(state.penalties);
    Render.repayments(state.repayments);
  }

  function syncLoanInputs() {
    var L = state.loan;
    $('#principal').value = (L.principal != null && isFinite(L.principal)) ? L.principal : '';
    $('#baseRate').value = (L.baseRate != null && isFinite(L.baseRate)) ? (L.baseRate * 100).toFixed(2) : '';
    $('#startDate').value = L.startDate || '';
    $('#endDate').value = L.endDate || '';
    $('#asOfDate').value = L.asOfDate || '';
    $all('#basisToggle button').forEach(function (b) {
      b.classList.toggle('on', Number(b.dataset.val) === L.dayBasis);
    });
  }

  function refreshSessionBar() {
    Render.sessionBar(Store.list(), activeSession ? activeSession.id : null);
  }

  // Re-render everything for the current active session.
  function refreshAll() {
    syncLoanInputs();
    renderLists();
    refreshSessionBar();
    recompute();
    Render.saveStatus('saved', activeSession ? activeSession.updatedAt : null, Store.available);
  }

  // ---- persistence ----
  function commit() {
    if (!activeSession) return;
    activeSession.loan = state.loan;
    activeSession.penalties = state.penalties;
    activeSession.repayments = state.repayments;
    Store.save(activeSession); // stamps updatedAt + marks active
    Render.saveStatus('saved', activeSession.updatedAt, Store.available);
  }

  function scheduleSave() {
    Render.saveStatus('dirty', null, Store.available);
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      saveTimer = null;
      commit();
    }, 400);
  }

  // An edit happened: recompute the view now and persist shortly after.
  function onEdit() {
    recompute();
    scheduleSave();
  }

  // ---- session actions ----
  function switchTo(id) {
    var s = Store.get(id);
    if (!s) return;
    Store.setActiveId(id);
    bindSession(s);
    refreshAll();
  }

  function newSession() {
    var s = Store.create('New loan', blankData());
    bindSession(s);
    refreshAll();
    $('#sessionName').focus();
    $('#sessionName').select();
  }

  function duplicateSession() {
    if (!activeSession) return;
    var s = Store.duplicate(activeSession.id);
    if (!s) return;
    bindSession(s);
    refreshAll();
  }

  function deleteSession() {
    if (!activeSession) return;
    if (Store.count() <= 1) return; // keep at least one
    var name = activeSession.name;
    if (!window.confirm('Delete session "' + name + '"? This cannot be undone.')) return;
    var nextId = Store.remove(activeSession.id);
    if (nextId) {
      switchTo(nextId);
    } else {
      var s = Store.create('New loan', blankData());
      bindSession(s);
      refreshAll();
    }
  }

  function loadExampleSession() {
    var s = Store.create('Example loan', exampleData());
    bindSession(s);
    refreshAll();
  }

  // ---- wiring ----
  function wireSessionControls() {
    $('#sessionSelect').addEventListener('change', function (e) { switchTo(e.target.value); });
    $('#newSession').addEventListener('click', newSession);
    $('#dupSession').addEventListener('click', duplicateSession);
    $('#delSession').addEventListener('click', deleteSession);
    $('#sessionName').addEventListener('input', function (e) {
      if (!activeSession) return;
      activeSession.name = e.target.value || 'Untitled loan';
      // persist name immediately, then refresh the dropdown label
      Store.save(activeSession);
      var sel = $('#sessionSelect');
      var opt = sel.options[sel.selectedIndex];
      if (opt) opt.textContent = activeSession.name + ' · ' + opt.textContent.split(' · ').slice(1).join(' · ');
      Render.saveStatus('saved', activeSession.updatedAt, Store.available);
    });
  }

  function wireLoanInputs() {
    $('#principal').addEventListener('input', function (e) {
      var v = parseFloat(e.target.value);
      state.loan.principal = isFinite(v) ? v : NaN;
      onEdit();
    });
    $('#baseRate').addEventListener('input', function (e) {
      var v = parseFloat(e.target.value);
      state.loan.baseRate = isFinite(v) ? v / 100 : NaN;
      onEdit();
    });
    $('#startDate').addEventListener('input', function (e) { state.loan.startDate = e.target.value; onEdit(); });
    $('#endDate').addEventListener('input', function (e) { state.loan.endDate = e.target.value; onEdit(); });
    $('#asOfDate').addEventListener('input', function (e) { state.loan.asOfDate = e.target.value; onEdit(); });
    $all('#basisToggle button').forEach(function (b) {
      b.addEventListener('click', function () {
        state.loan.dayBasis = Number(b.dataset.val);
        syncLoanInputs();
        onEdit();
      });
    });
  }

  function wirePenalty() {
    $('#addPenalty').addEventListener('click', function () {
      state.penalties.push({
        id: Store.uid(),
        start: state.loan.startDate,
        end: state.loan.endDate,
        rate: isFinite(state.loan.baseRate) ? state.loan.baseRate * 1.5 : 0.12,
      });
      renderLists();
      onEdit();
    });
    $('#penaltyList').addEventListener('input', function (e) {
      var t = e.target;
      if (!t.dataset.id) return;
      var p = state.penalties.filter(function (x) { return x.id === t.dataset.id; })[0];
      if (!p) return;
      if (t.dataset.field === 'start') p.start = t.value;
      else if (t.dataset.field === 'end') p.end = t.value;
      else if (t.dataset.field === 'rate') {
        var v = parseFloat(t.value);
        p.rate = isFinite(v) ? v / 100 : NaN;
      }
      onEdit();
    });
    $('#penaltyList').addEventListener('click', function (e) {
      var t = e.target.closest('[data-action="remove-penalty"]');
      if (!t) return;
      state.penalties = state.penalties.filter(function (p) { return p.id !== t.dataset.id; });
      renderLists();
      onEdit();
    });
  }

  function wireRepayment() {
    $('#addRepayment').addEventListener('click', function () {
      state.repayments.push({ id: Store.uid(), date: state.loan.asOfDate, amount: 0, note: '' });
      renderLists();
      onEdit();
    });
    $('#repaymentList').addEventListener('input', function (e) {
      var t = e.target;
      if (!t.dataset.id) return;
      var r = state.repayments.filter(function (x) { return x.id === t.dataset.id; })[0];
      if (!r) return;
      if (t.dataset.field === 'date') r.date = t.value;
      else if (t.dataset.field === 'amount') {
        var v = parseFloat(t.value);
        r.amount = isFinite(v) ? v : NaN;
      } else if (t.dataset.field === 'note') r.note = t.value;
      onEdit();
    });
    $('#repaymentList').addEventListener('click', function (e) {
      var t = e.target.closest('[data-action="remove-repayment"]');
      if (!t) return;
      state.repayments = state.repayments.filter(function (r) { return r.id !== t.dataset.id; });
      renderLists();
      onEdit();
    });
  }

  // ---- self tests ----
  function runSelfTests() {
    var rows = [];
    var passes = 0;
    Fix.TESTS.forEach(function (t) {
      var r = E.compute(t.state);
      var diffs = [];
      Object.keys(t.expect).forEach(function (key) {
        if (!Fix.approxEqual(r[key], t.expect[key])) {
          diffs.push(key + ': expected ' + E.fmtMoney(t.expect[key]) + ', got ' + E.fmtMoney(r[key]) + ' (Δ ' + E.fmtMoney(r[key] - t.expect[key]) + ')');
        }
      });
      var passed = diffs.length === 0;
      if (passed) passes++;
      rows.push({
        name: t.name,
        passed: passed,
        detail: passed
          ? 'outstanding ' + E.fmtMoney(r.outstandingPrincipal) + ' · accrued ' + E.fmtMoney(r.accruedUnpaidInterest) + ' · interest paid ' + E.fmtMoney(r.totalInterestPaid) + ' · principal paid ' + E.fmtMoney(r.totalPrincipalPaid) + ' · owed ' + E.fmtMoney(r.totalOwedAsOf)
          : diffs.join('\n'),
      });
    });
    Render.testResults(rows, passes, Fix.TESTS.length);
  }

  // ---- boot ----
  var booted = false;
  async function init() {
    if (booted) return; // guard against a duplicate DOMContentLoaded
    booted = true;
    await Store.ready(); // pick a backend (server files or localStorage), load the cache
    // Resume the active session, or the most recent one, or seed an example.
    var sessions = Store.list();
    var session;
    if (!sessions.length) {
      session = Store.create('Example loan', exampleData());
    } else {
      var activeId = Store.getActiveId();
      session = (activeId && Store.get(activeId)) || sessions[0];
      Store.setActiveId(session.id);
    }
    bindSession(session);

    wireSessionControls();
    wireLoanInputs();
    wirePenalty();
    wireRepayment();
    $('#loadExample').addEventListener('click', loadExampleSession);
    $('#runTests').addEventListener('click', runSelfTests);

    refreshAll();
  }

  // Expose the boot promise so tests (and any caller) can await first render.
  document.addEventListener('DOMContentLoaded', function () { root.__loanReady = init(); });
})(typeof self !== 'undefined' ? self : this);
