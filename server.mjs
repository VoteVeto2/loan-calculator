// server.mjs — Bun dev server for the loan calculator.
//
// Serves the static app AND a tiny REST API that persists each saved session as
// one JSON file under data/sessions/. Your calculation history becomes plain
// text in the repo, so it diffs cleanly and travels with `git pull`.
//
//   bun server.mjs              # then open http://localhost:5173
//   PORT=8080 bun server.mjs    # custom port
//
// Endpoints:
//   GET    /api/sessions        → array of every saved session
//   GET    /api/sessions/:id    → one session (404 if absent)
//   PUT    /api/sessions/:id    → upsert; writes data/sessions/<id>.json
//   DELETE /api/sessions/:id    → remove that file
// Everything else is served as a static file from the repo root.

import { mkdirSync, renameSync, unlinkSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = import.meta.dir;
const DATA = process.env.LOAN_DATA ? resolve(process.env.LOAN_DATA) : resolve(ROOT, "data", "sessions");
const PORT = Number(process.env.PORT) || 5173;
const ID = /^s[a-z0-9]+$/i; // matches LoanStore.uid(); also blocks path traversal

mkdirSync(DATA, { recursive: true });

let tmpSeq = 0; // unique temp-file suffix so concurrent writes never collide

// Deterministic JSON: keys sorted at every depth, 2-space indent, trailing
// newline. Two equal sessions always serialize identically → minimal git diffs.
function canonical(value) {
  const sortDeep = (v) => {
    if (Array.isArray(v)) return v.map(sortDeep);
    if (v && typeof v === "object") {
      return Object.keys(v).sort().reduce((o, k) => ((o[k] = sortDeep(v[k])), o), {});
    }
    return v;
  };
  return JSON.stringify(sortDeep(value), null, 2) + "\n";
}

const json = (data, status = 200) => Response.json(data, { status });

async function readAll() {
  const out = [];
  for await (const name of new Bun.Glob("*.json").scan(DATA)) {
    try {
      out.push(await Bun.file(resolve(DATA, name)).json());
    } catch {
      /* skip an unreadable or half-written file */
    }
  }
  return out;
}

Bun.serve({
  port: PORT,
  async fetch(req) {
    const { pathname } = new URL(req.url);

    // ---------- REST API: /api/sessions[/:id] ----------
    const api = pathname.match(/^\/api\/sessions(?:\/([^/]+))?$/);
    if (api) {
      const id = api[1];

      if (!id) {
        if (req.method === "GET") return json(await readAll());
        return json({ error: "method not allowed" }, 405);
      }
      if (!ID.test(id)) return json({ error: "invalid id" }, 400);

      const file = resolve(DATA, id + ".json");

      if (req.method === "GET") {
        return existsSync(file)
          ? json(await Bun.file(file).json())
          : json({ error: "not found" }, 404);
      }
      if (req.method === "PUT") {
        let body;
        try {
          body = await req.json();
        } catch {
          return json({ error: "bad json" }, 400);
        }
        if (!body || body.id !== id) return json({ error: "id mismatch" }, 400);
        const tmp = file + "." + tmpSeq++ + ".tmp";
        await Bun.write(tmp, canonical(body));
        renameSync(tmp, file); // atomic swap; a crash mid-write can't corrupt the file
        return json(body);
      }
      if (req.method === "DELETE") {
        if (existsSync(file)) unlinkSync(file);
        return new Response(null, { status: 204 });
      }
      return json({ error: "method not allowed" }, 405);
    }

    // ---------- static files ----------
    if (req.method !== "GET") return new Response("method not allowed", { status: 405 });
    const rel = pathname === "/" ? "/index.html" : pathname;
    const full = resolve(ROOT, "." + rel);
    if (full !== ROOT && !full.startsWith(ROOT + "/")) {
      return new Response("forbidden", { status: 403 }); // no escaping the repo root
    }
    const file = Bun.file(full);
    if (!(await file.exists())) return new Response("not found", { status: 404 });
    return new Response(file);
  },
});

console.log(`Loan calculator → http://localhost:${PORT}  (history in data/sessions/)`);
