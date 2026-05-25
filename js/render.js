/*
 * render.js — view layer. Pure functions that take data and write DOM.
 * They emit markup with data-* attributes; app.js handles events via delegation.
 * Depends on window.LoanEngine for formatting. Exposes window.LoanRender.
 */
(function (root) {
  'use strict';

  var E = root.LoanEngine;
  var fmtMoney = E.fmtMoney;
  var fmtPct = E.fmtPct;

  function $(sel) { return document.querySelector(sel); }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function shortStamp(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return '';
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    return pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function clockStamp(iso) {
    var d = iso ? new Date(iso) : new Date();
    if (isNaN(d)) d = new Date();
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }

  function sessionBar(sessions, activeId) {
    var sel = $('#sessionSelect');
    sel.innerHTML = sessions.map(function (s) {
      var label = escapeHtml(s.name) + ' · ' + shortStamp(s.updatedAt);
      return '<option value="' + s.id + '"' + (s.id === activeId ? ' selected' : '') + '>' + label + '</option>';
    }).join('');
    var active = sessions.filter(function (s) { return s.id === activeId; })[0];
    $('#sessionName').value = active ? active.name : '';
    $('#delSession').disabled = sessions.length <= 1;
  }

  function saveStatus(kind, iso, storeAvailable) {
    var el = $('#saveStatus');
    el.className = 'save-status ' + kind;
    var text;
    if (!storeAvailable) {
      text = 'Storage unavailable — changes last only for this visit';
    } else if (kind === 'saved') {
      text = 'All changes saved · ' + clockStamp(iso);
    } else if (kind === 'dirty') {
      text = 'Saving…';
    } else {
      text = '';
    }
    el.innerHTML = '<span class="dot"></span>' + escapeHtml(text);
  }

  function penalties(rows) {
    var host = $('#penaltyList');
    $('#penaltyCount').textContent = rows.length ? '· ' + rows.length : '';
    if (!rows.length) {
      host.innerHTML = '<p class="list-empty">No penalty windows. The base rate applies to the entire period.</p>';
      return;
    }
    var body = rows.map(function (p) {
      return '<tr>' +
        '<td><input type="date" data-id="' + p.id + '" data-field="start" value="' + escapeHtml(p.start || '') + '"></td>' +
        '<td><input type="date" data-id="' + p.id + '" data-field="end" value="' + escapeHtml(p.end || '') + '"></td>' +
        '<td><input type="number" min="0" step="0.01" data-id="' + p.id + '" data-field="rate" value="' + (p.rate != null && isFinite(p.rate) ? (p.rate * 100).toFixed(2) : '') + '"></td>' +
        '<td style="text-align:right;"><button class="btn icon" data-id="' + p.id + '" data-action="remove-penalty" title="Remove">×</button></td>' +
      '</tr>';
    }).join('');
    host.innerHTML =
      '<table class="list"><thead><tr>' +
        '<th style="width:32%">Window start</th>' +
        '<th style="width:32%">Window end</th>' +
        '<th style="width:24%">Annual rate (%)</th>' +
        '<th style="width:12%"></th>' +
      '</tr></thead><tbody>' + body + '</tbody></table>';
  }

  function repayments(rows) {
    var host = $('#repaymentList');
    $('#repaymentCount').textContent = rows.length ? '· ' + rows.length : '';
    if (!rows.length) {
      host.innerHTML = '<p class="list-empty">No repayments yet. Add one to see how it splits between interest and principal.</p>';
      return;
    }
    var body = rows.map(function (r) {
      return '<tr>' +
        '<td><input type="date" data-id="' + r.id + '" data-field="date" value="' + escapeHtml(r.date || '') + '"></td>' +
        '<td><input type="number" min="0" step="0.01" data-id="' + r.id + '" data-field="amount" value="' + (r.amount != null && isFinite(r.amount) ? r.amount : '') + '"></td>' +
        '<td><input type="text" data-id="' + r.id + '" data-field="note" value="' + escapeHtml(r.note || '') + '" placeholder="optional"></td>' +
        '<td style="text-align:right;"><button class="btn icon" data-id="' + r.id + '" data-action="remove-repayment" title="Remove">×</button></td>' +
      '</tr>';
    }).join('');
    host.innerHTML =
      '<table class="list"><thead><tr>' +
        '<th style="width:30%">Repayment date</th>' +
        '<th style="width:30%">Amount (CNY)</th>' +
        '<th style="width:30%">Note</th>' +
        '<th style="width:10%"></th>' +
      '</tr></thead><tbody>' + body + '</tbody></table>';
  }

  function schedule(result) {
    var host = $('#scheduleArea');
    if (result.errors.length) {
      host.innerHTML = '<p class="empty-schedule">Resolve the errors above to see the ledger.</p>';
      return;
    }
    if (!result.ledger.length) {
      host.innerHTML = '<p class="empty-schedule">Add a loan to see the schedule.</p>';
      return;
    }
    var rows = result.ledger.map(function (row) {
      if (row.type === 'start') {
        return '<tr class="boundary">' +
          '<td class="date">' + row.date + '</td>' +
          '<td><span class="tag start">Loan start</span></td>' +
          '<td class="num">—</td><td class="num">—</td><td class="num">—</td><td class="num">—</td>' +
          '<td class="num">' + fmtMoney(row.principal) + '</td>' +
          '<td class="num">' + fmtMoney(row.accrued) + '</td></tr>';
      }
      if (row.type === 'accrual') {
        return '<tr class="accrual">' +
          '<td class="date">' + row.from + ' → ' + row.to + '</td>' +
          '<td><span class="tag">Accrual</span></td>' +
          '<td class="num">' + row.days + '</td>' +
          '<td class="num">' + fmtPct(row.rate) + '</td>' +
          '<td class="num amt-pos">+' + fmtMoney(row.interest) + '</td>' +
          '<td class="num">—</td>' +
          '<td class="num">' + fmtMoney(row.principalAfter) + '</td>' +
          '<td class="num">' + fmtMoney(row.accruedAfter) + '</td></tr>';
      }
      if (row.type === 'repayment') {
        var over = row.overpayment > 0 ? ' (over ' + fmtMoney(row.overpayment) + ')' : '';
        var note = row.note ? ' <span style="font-style:italic;color:var(--cloudy);">' + escapeHtml(row.note) + '</span>' : '';
        return '<tr class="repayment">' +
          '<td class="date">' + row.date + '</td>' +
          '<td><span class="tag repay">Repayment ¥' + fmtMoney(row.amount) + over + '</span>' + note + '</td>' +
          '<td class="num">—</td><td class="num">—</td>' +
          '<td class="num amt-neg">−' + fmtMoney(row.toInterest) + '</td>' +
          '<td class="num amt-neg">−' + fmtMoney(row.toPrincipal) + '</td>' +
          '<td class="num">' + fmtMoney(row.principalAfter) + '</td>' +
          '<td class="num">' + fmtMoney(row.accruedAfter) + '</td></tr>';
      }
      // asof
      return '<tr class="boundary">' +
        '<td class="date">' + row.date + '</td>' +
        '<td><span class="tag end">As-of</span></td>' +
        '<td class="num">—</td><td class="num">—</td><td class="num">—</td><td class="num">—</td>' +
        '<td class="num">' + fmtMoney(row.principal) + '</td>' +
        '<td class="num">' + fmtMoney(row.accrued) + '</td></tr>';
    }).join('');

    host.innerHTML =
      '<table class="schedule"><thead><tr>' +
        '<th style="width:14%">Date</th>' +
        '<th style="width:14%">Event</th>' +
        '<th class="num" style="width:8%">Days</th>' +
        '<th class="num" style="width:10%">Rate</th>' +
        '<th class="num" style="width:14%">Interest</th>' +
        '<th class="num" style="width:14%">→ Principal</th>' +
        '<th class="num" style="width:13%">Outstanding</th>' +
        '<th class="num" style="width:13%">Accrued unpaid</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table>';
  }

  function summary(result, asOfDate) {
    $('#sumPrincipal').textContent = fmtMoney(result.outstandingPrincipal);
    $('#sumAccrued').textContent = fmtMoney(result.accruedUnpaidInterest);
    $('#sumIntPaid').textContent = fmtMoney(result.totalInterestPaid);
    $('#sumPrinPaid').textContent = fmtMoney(result.totalPrincipalPaid);
    $('#sumOwed').textContent = fmtMoney(result.totalOwedAsOf);
    $('#asOfLabel').textContent = asOfDate || 'as-of date';
    if (result.overpayment > 0.005) {
      $('#overpaymentLine').style.display = 'flex';
      $('#sumOver').textContent = fmtMoney(result.overpayment);
    } else {
      $('#overpaymentLine').style.display = 'none';
    }
    var box = $('#errorBox');
    if (result.errors.length) {
      box.innerHTML = '<div class="error-list"><ul>' +
        result.errors.map(function (e) { return '<li>' + escapeHtml(e) + '</li>'; }).join('') +
        '</ul></div>';
    } else {
      box.innerHTML = '';
    }
  }

  function testResults(rows, passes, total) {
    var host = $('#testResults');
    host.style.display = 'block';
    var html = '<h3>Self-test results</h3>';
    html += rows.map(function (r) {
      return '<div class="test-row ' + (r.passed ? 'pass' : 'fail') + '">' +
        '<div class="icon-cell">' + (r.passed ? '✓' : '✕') + '</div>' +
        '<div><div class="title">' + escapeHtml(r.name) + '</div>' +
        '<div class="details">' + escapeHtml(r.detail) + '</div></div>' +
        '<div class="verdict">' + (r.passed ? 'pass' : 'fail') + '</div></div>';
    }).join('');
    var fails = total - passes;
    html += '<div class="test-summary" style="color:' + (fails === 0 ? 'var(--ok)' : 'var(--bad)') + '">' +
      passes + '/' + total + ' passed' + (fails ? ', ' + fails + ' failed' : '') + '.</div>';
    host.innerHTML = html;
  }

  root.LoanRender = {
    sessionBar: sessionBar,
    saveStatus: saveStatus,
    penalties: penalties,
    repayments: repayments,
    schedule: schedule,
    summary: summary,
    testResults: testResults,
  };
})(typeof self !== 'undefined' ? self : this);
