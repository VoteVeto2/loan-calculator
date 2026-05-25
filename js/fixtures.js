/*
 * fixtures.js — the 5 acceptance scenarios and their expected figures.
 * Shared by the in-browser self-test runner and the headless Node test.
 * UMD: window.LoanFixtures in the browser, module.exports in Node.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LoanFixtures = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var TESTS = [
    {
      name: 'Test 1 — Simple, no repayments, no penalty',
      state: {
        loan: { principal: 100000, baseRate: 0.06, startDate: '2025-01-01', endDate: '2025-12-31', asOfDate: '2025-12-31', dayBasis: 365 },
        penalties: [],
        repayments: [],
      },
      expect: {
        outstandingPrincipal: 100000,
        accruedUnpaidInterest: 5983.56,
        totalInterestPaid: 0,
        totalPrincipalPaid: 0,
        totalOwedAsOf: 105983.56,
      },
    },
    {
      name: 'Test 2 — Single mid-year repayment, no penalty',
      state: {
        loan: { principal: 100000, baseRate: 0.06, startDate: '2025-01-01', endDate: '2025-12-31', asOfDate: '2025-12-31', dayBasis: 365 },
        penalties: [],
        repayments: [{ id: 't2r1', date: '2025-07-01', amount: 50000 }],
      },
      expect: {
        outstandingPrincipal: 52975.34,
        accruedUnpaidInterest: 1593.61,
        totalInterestPaid: 2975.34,
        totalPrincipalPaid: 47024.66,
        totalOwedAsOf: 54568.96,
      },
    },
    {
      name: 'Test 3 — Penalty window mid-period, no repayments',
      state: {
        loan: { principal: 100000, baseRate: 0.06, startDate: '2025-01-01', endDate: '2025-12-31', asOfDate: '2025-12-31', dayBasis: 365 },
        penalties: [{ id: 't3p1', start: '2025-04-01', end: '2025-07-01', rate: 0.12 }],
        repayments: [],
      },
      expect: {
        outstandingPrincipal: 100000,
        accruedUnpaidInterest: 7479.45,
        totalInterestPaid: 0,
        totalPrincipalPaid: 0,
        totalOwedAsOf: 107479.45,
      },
    },
    {
      name: 'Test 4 — Full payoff at maturity',
      state: {
        loan: { principal: 50000, baseRate: 0.08, startDate: '2025-01-01', endDate: '2025-06-30', asOfDate: '2025-06-30', dayBasis: 365 },
        penalties: [],
        repayments: [{ id: 't4r1', date: '2025-06-30', amount: 51972.60 }],
      },
      expect: {
        outstandingPrincipal: 0,
        accruedUnpaidInterest: 0,
        totalInterestPaid: 1972.60,
        totalPrincipalPaid: 50000.00,
        totalOwedAsOf: 0,
      },
    },
    {
      name: 'Test 5 — Overdue with penalty + partial repayment',
      state: {
        loan: { principal: 200000, baseRate: 0.05, startDate: '2025-01-01', endDate: '2025-06-30', asOfDate: '2025-12-31', dayBasis: 365 },
        penalties: [{ id: 't5p1', start: '2025-07-01', end: '2026-01-01', rate: 0.10 }],
        repayments: [{ id: 't5r1', date: '2025-09-30', amount: 50000 }],
      },
      expect: {
        outstandingPrincipal: 159945.21,
        accruedUnpaidInterest: 4031.50,
        totalInterestPaid: 9945.21,
        totalPrincipalPaid: 40054.79,
        totalOwedAsOf: 163976.70,
      },
    },
  ];

  function approxEqual(a, b, eps) {
    eps = eps == null ? 0.01 : eps;
    return Math.abs(a - b) <= eps;
  }

  return { TESTS: TESTS, approxEqual: approxEqual };
});
