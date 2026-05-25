/*
 * engine.js — pure loan math. No DOM, no storage.
 * UMD: attaches to window.LoanEngine in the browser, module.exports in Node.
 *
 * Conventions:
 *   - Simple interest, no compounding. Unpaid interest carries forward but is
 *     never capitalized into principal.
 *   - Day count is half-open: start counted, end not (2025-01-01..2025-12-31 = 364 days).
 *   - Daily rate = annualRate / dayBasis (365 or 360).
 *   - Repayments allocate interest first, then principal (PRC Civil Code Art. 561).
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LoanEngine = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function parseISO(str) {
    if (!str || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return null;
    var parts = str.split('-').map(Number);
    var y = parts[0], m = parts[1], d = parts[2];
    var dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
    return dt;
  }

  function dayDiff(aStr, bStr) {
    var a = parseISO(aStr);
    var b = parseISO(bStr);
    if (!a || !b) return 0;
    return Math.round((b - a) / 86400000);
  }

  function fmtMoney(n) {
    if (!isFinite(n)) return '—';
    var sign = n < 0 ? '-' : '';
    var abs = Math.abs(n);
    return sign + abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function fmtPct(r) {
    return (r * 100).toFixed(2) + '%';
  }

  function compute(s) {
    var errors = [];
    var loan = s.loan;
    var basis = loan.dayBasis === 360 ? 360 : 365;

    var start = parseISO(loan.startDate);
    var asOf = parseISO(loan.asOfDate);
    if (!start) errors.push('Start date is invalid.');
    if (!asOf) errors.push('As-of date is invalid.');
    if (!(loan.principal > 0)) errors.push('Loan amount must be positive.');
    if (!isFinite(loan.baseRate)) errors.push('Annual rate is invalid.');
    if (start && asOf && asOf < start) errors.push('As-of date must be on or after the start date.');

    if (errors.length) {
      return {
        errors: errors,
        ledger: [],
        outstandingPrincipal: 0,
        accruedUnpaidInterest: 0,
        totalInterestPaid: 0,
        totalPrincipalPaid: 0,
        totalOwedAsOf: 0,
        overpayment: 0,
      };
    }

    var penalties = (s.penalties || [])
      .filter(function (p) { return p.start && p.end && p.start < p.end && isFinite(p.rate); })
      .map(function (p, idx) { return Object.assign({}, p, { _order: idx }); });

    var repayments = (s.repayments || [])
      .filter(function (r) { return r.date && isFinite(r.amount) && r.amount > 0; })
      .map(function (r) { return Object.assign({}, r); })
      .sort(function (a, b) { return a.date.localeCompare(b.date); });

    for (var ri = 0; ri < repayments.length; ri++) {
      var rr = repayments[ri];
      if (rr.date < loan.startDate) errors.push('Repayment ' + rr.date + ' is before the loan start; ignored.');
      if (rr.date > loan.asOfDate) errors.push('Repayment ' + rr.date + ' is after the as-of date; not yet applied.');
    }

    var effectiveRepayments = repayments.filter(function (r) {
      return r.date >= loan.startDate && r.date <= loan.asOfDate;
    });

    function applicableRate(dateStr) {
      var rate = loan.baseRate;
      for (var i = 0; i < penalties.length; i++) {
        var p = penalties[i];
        if (dateStr >= p.start && dateStr < p.end) rate = p.rate;
      }
      return rate;
    }

    var markerSet = {};
    markerSet[loan.startDate] = true;
    markerSet[loan.asOfDate] = true;
    penalties.forEach(function (p) {
      if (p.start > loan.startDate && p.start < loan.asOfDate) markerSet[p.start] = true;
      if (p.end > loan.startDate && p.end < loan.asOfDate) markerSet[p.end] = true;
    });
    effectiveRepayments.forEach(function (r) { markerSet[r.date] = true; });
    var markers = Object.keys(markerSet).sort();

    var principal = loan.principal;
    var accrued = 0;
    var totalInterestPaid = 0;
    var totalPrincipalPaid = 0;
    var overpayment = 0;
    var ledger = [];

    ledger.push({ type: 'start', date: loan.startDate, principal: principal, accrued: accrued });

    for (var i = 1; i < markers.length; i++) {
      var prev = markers[i - 1];
      var cur = markers[i];
      var days = dayDiff(prev, cur);
      if (days > 0) {
        var rate = applicableRate(prev);
        var dailyRate = rate / basis;
        var interest = principal * dailyRate * days;
        accrued += interest;
        ledger.push({
          type: 'accrual',
          from: prev,
          to: cur,
          days: days,
          rate: rate,
          principalAtStart: principal,
          interest: interest,
          principalAfter: principal,
          accruedAfter: accrued,
        });
      }

      var ons = effectiveRepayments.filter(function (r) { return r.date === cur; });
      for (var k = 0; k < ons.length; k++) {
        var r = ons[k];
        var remaining = r.amount;
        var toInterest = Math.min(remaining, accrued);
        accrued -= toInterest;
        remaining -= toInterest;
        totalInterestPaid += toInterest;

        var toPrincipal = Math.min(remaining, principal);
        principal -= toPrincipal;
        remaining -= toPrincipal;
        totalPrincipalPaid += toPrincipal;

        if (remaining > 0) overpayment += remaining;

        ledger.push({
          type: 'repayment',
          date: cur,
          amount: r.amount,
          note: r.note || '',
          toInterest: toInterest,
          toPrincipal: toPrincipal,
          overpayment: remaining,
          principalAfter: principal,
          accruedAfter: accrued,
        });
      }
    }

    ledger.push({ type: 'asof', date: loan.asOfDate, principal: principal, accrued: accrued });

    return {
      errors: errors,
      ledger: ledger,
      outstandingPrincipal: principal,
      accruedUnpaidInterest: accrued,
      totalInterestPaid: totalInterestPaid,
      totalPrincipalPaid: totalPrincipalPaid,
      overpayment: overpayment,
      totalOwedAsOf: principal + accrued,
    };
  }

  return {
    parseISO: parseISO,
    dayDiff: dayDiff,
    fmtMoney: fmtMoney,
    fmtPct: fmtPct,
    compute: compute,
  };
});
