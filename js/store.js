/*
 * store.js — session persistence over localStorage.
 *
 * A "session" is one named calculation:
 *   { id, name, createdAt, updatedAt, loan, penalties, repayments }
 *
 * Sessions survive page reloads and browser restarts (localStorage works over
 * file://). If localStorage is unavailable (private mode, locked-down browser),
 * we fall back to an in-memory list so the app still runs for the current visit.
 *
 * Exposes window.LoanStore.
 */
(function (root) {
  'use strict';

  var KEY_SESSIONS = 'loanCalc.sessions.v1';
  var KEY_ACTIVE = 'loanCalc.activeSession.v1';

  function probe() {
    try {
      var k = '__loanCalcProbe__';
      window.localStorage.setItem(k, '1');
      window.localStorage.removeItem(k);
      return true;
    } catch (e) {
      return false;
    }
  }

  var available = probe();
  var mem = { sessions: null, active: null };
  var cache = null;

  function readRaw() {
    if (!available) return mem.sessions ? mem.sessions.slice() : [];
    try {
      var raw = window.localStorage.getItem(KEY_SESSIONS);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function writeRaw(list) {
    if (!available) { mem.sessions = list.slice(); return; }
    try {
      window.localStorage.setItem(KEY_SESSIONS, JSON.stringify(list));
    } catch (e) { /* quota or disabled; ignore */ }
  }

  function ensureCache() {
    if (!cache) cache = readRaw();
    return cache;
  }

  function byUpdatedDesc(a, b) {
    return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
  }

  function uid() {
    return 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function nowISO() { return new Date().toISOString(); }

  // ---- public API ----

  function list() {
    return ensureCache().slice().sort(byUpdatedDesc);
  }

  function count() { return ensureCache().length; }

  function get(id) {
    var c = ensureCache();
    for (var i = 0; i < c.length; i++) if (c[i].id === id) return c[i];
    return null;
  }

  // Upsert a session and mark it active. Stamps updatedAt unless keepStamp is true.
  function save(session, keepStamp) {
    var c = ensureCache();
    if (!keepStamp) session.updatedAt = nowISO();
    var found = false;
    for (var i = 0; i < c.length; i++) {
      if (c[i].id === session.id) { c[i] = session; found = true; break; }
    }
    if (!found) c.push(session);
    writeRaw(c);
    setActiveId(session.id);
    return session.updatedAt;
  }

  function create(name, data) {
    var s = {
      id: uid(),
      name: name || 'Untitled loan',
      createdAt: nowISO(),
      updatedAt: nowISO(),
      loan: data.loan,
      penalties: data.penalties || [],
      repayments: data.repayments || [],
    };
    save(s, true);
    return s;
  }

  function duplicate(id) {
    var src = get(id);
    if (!src) return null;
    var clone = JSON.parse(JSON.stringify(src));
    clone.id = uid();
    clone.name = src.name + ' (copy)';
    clone.createdAt = nowISO();
    clone.updatedAt = nowISO();
    save(clone, true);
    return clone;
  }

  // Remove a session. Returns the id that should become active next
  // (most-recently-updated remaining session, or null if none left).
  function remove(id) {
    var c = ensureCache();
    cache = c.filter(function (s) { return s.id !== id; });
    writeRaw(cache);
    var remaining = list();
    var nextId = remaining.length ? remaining[0].id : null;
    setActiveId(nextId);
    return nextId;
  }

  function getActiveId() {
    if (!available) return mem.active;
    try { return window.localStorage.getItem(KEY_ACTIVE); } catch (e) { return null; }
  }

  function setActiveId(id) {
    if (!available) { mem.active = id; return; }
    try {
      if (id == null) window.localStorage.removeItem(KEY_ACTIVE);
      else window.localStorage.setItem(KEY_ACTIVE, id);
    } catch (e) { /* ignore */ }
  }

  root.LoanStore = {
    available: available,
    list: list,
    count: count,
    get: get,
    save: save,
    create: create,
    duplicate: duplicate,
    remove: remove,
    getActiveId: getActiveId,
    setActiveId: setActiveId,
    uid: uid,
  };
})(typeof self !== 'undefined' ? self : this);
