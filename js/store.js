/*
 * store.js — session persistence with two interchangeable backends.
 *
 * A "session" is one named calculation:
 *   { id, name, createdAt, updatedAt, loan, penalties, repayments }
 *
 * Backend is chosen once at boot, by ready():
 *   - SERVER  — when the page is served by server.mjs, sessions live as files
 *     under data/sessions/ (git-tracked, shared via `git pull`). Reached over a
 *     small REST API at /api/sessions.
 *   - LOCAL   — when opened straight from file:// (or the server is down),
 *     sessions live in localStorage, exactly as before. If even localStorage is
 *     unavailable, an in-memory list keeps the app working for the visit.
 *
 * The public API stays synchronous: an in-memory `cache` is the source of truth
 * the UI reads from, and writes fan out to whichever backend is active. Call
 * ready() once and await it before the first read (app.js does this at boot).
 * The active-session pointer is always kept in localStorage — it is per-user
 * view state, not something to track in git.
 *
 * Exposes window.LoanStore.
 */
(function (root) {
  'use strict';

  var KEY_SESSIONS = 'loanCalc.sessions.v1';
  var KEY_ACTIVE = 'loanCalc.activeSession.v1';
  var API = '/api/sessions';

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

  var localAvailable = probe();
  var mem = { sessions: null, active: null };
  var cache = null;            // in-memory source of truth for the sync API
  var remote = false;          // true once the server backend is active
  var available = localAvailable; // "can we persist at all?" — drives the status line
  var readyPromise = null;

  // ---- localStorage backend ----
  function readLocal() {
    if (!localAvailable) return mem.sessions ? mem.sessions.slice() : [];
    try {
      var raw = window.localStorage.getItem(KEY_SESSIONS);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function writeLocal(list) {
    if (!localAvailable) { mem.sessions = list.slice(); return; }
    try {
      window.localStorage.setItem(KEY_SESSIONS, JSON.stringify(list));
    } catch (e) { /* quota or disabled; ignore */ }
  }

  // ---- server backend (REST over fetch) ----
  function serverPossible() { return typeof fetch === 'function'; }

  function loadServer() {
    var ctrl = (typeof AbortController === 'function') ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 2000) : null;
    var clear = function () { if (timer) clearTimeout(timer); };
    return fetch(API, { headers: { accept: 'application/json' }, signal: ctrl ? ctrl.signal : undefined })
      .then(function (res) {
        clear();
        if (!res.ok) throw new Error('GET ' + res.status);
        return res.json();
      }, function (e) { clear(); throw e; });
  }

  function putServer(session) {
    return fetch(API + '/' + encodeURIComponent(session.id), {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(session),
    }).then(function (res) { if (!res.ok) throw new Error('PUT ' + res.status); });
  }

  function delServer(id) {
    return fetch(API + '/' + encodeURIComponent(id), { method: 'DELETE' })
      .then(function (res) { if (!res.ok && res.status !== 404) throw new Error('DELETE ' + res.status); });
  }

  function warn(msg, e) { if (root.console && root.console.warn) root.console.warn(msg, e); }

  // Write a session through to the active backend. Cache is already updated.
  function persist(session) {
    if (remote) putServer(session).catch(function (e) { warn('session save failed', e); });
    else writeLocal(cache);
  }

  function persistRemoval(id) {
    if (remote) delServer(id).catch(function (e) { warn('session delete failed', e); });
    else writeLocal(cache);
  }

  // One-time lift: push any browser-only sessions up to a freshly connected
  // server so nothing made in file:// mode is lost when you start the server.
  function migrateLocalToServer() {
    if (!localAvailable) return Promise.resolve();
    var localList = readLocal();
    if (!localList.length) return Promise.resolve();
    var have = {};
    cache.forEach(function (s) { have[s.id] = true; });
    var missing = localList.filter(function (s) { return s && s.id && !have[s.id]; });
    if (!missing.length) return Promise.resolve();
    return Promise.all(missing.map(function (s) {
      return putServer(s).then(function () { cache.push(s); }, function (e) { warn('migrate failed', e); });
    }));
  }

  // Pick a backend and fill the cache. Resolves when the store is usable.
  function ready() {
    if (readyPromise) return readyPromise;
    readyPromise = new Promise(function (resolve) {
      if (!serverPossible()) {
        cache = readLocal(); remote = false; available = localAvailable;
        resolve(); return;
      }
      loadServer().then(function (list) {
        cache = Array.isArray(list) ? list : [];
        remote = true; available = true;
        return migrateLocalToServer();
      }).then(resolve, function () {
        cache = readLocal(); remote = false; available = localAvailable;
        resolve();
      });
    });
    return readyPromise;
  }

  function ensureCache() {
    if (!cache) cache = readLocal(); // lazy fallback if read before ready() resolves
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
    setActiveId(session.id);
    persist(session);
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
    var remaining = list();
    var nextId = remaining.length ? remaining[0].id : null;
    setActiveId(nextId);
    persistRemoval(id);
    return nextId;
  }

  function getActiveId() {
    if (!localAvailable) return mem.active;
    try { return window.localStorage.getItem(KEY_ACTIVE); } catch (e) { return null; }
  }

  function setActiveId(id) {
    if (!localAvailable) { mem.active = id; return; }
    try {
      if (id == null) window.localStorage.removeItem(KEY_ACTIVE);
      else window.localStorage.setItem(KEY_ACTIVE, id);
    } catch (e) { /* ignore */ }
  }

  root.LoanStore = {
    ready: ready,
    get available() { return available; },
    get remote() { return remote; },
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
