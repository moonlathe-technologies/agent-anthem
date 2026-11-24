// The shared city server. Builders who join send only numbers (see public/shared.js). Each builder gets a
// neighbourhood of about 100 people when they first report; each neighbourhood is one Durable Object, and one
// more keeps the world totals. Nothing here stores IP addresses, code, prompts or file names.

import { DurableObject } from "cloudflare:workers";
import { cleanReport, neighbourhoodOf, isKept, REPORT_GAP_MS } from "../public/shared.js";
import { allowedOrigin, json, preflight } from "./http.mjs";

const ID = /^[a-f0-9-]{36}$/;

export class World extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec("CREATE TABLE IF NOT EXISTS members (id TEXT PRIMARY KEY, k INTEGER)");
    this.sql.exec("CREATE TABLE IF NOT EXISTS totals (one INTEGER PRIMARY KEY, builders INTEGER, towers INTEGER, windows INTEGER)");
    this.sql.exec("INSERT OR IGNORE INTO totals VALUES (1, 0, 0, 0)");
  }
  lookup(id) {
    const row = this.sql.exec("SELECT k FROM members WHERE id = ?", id).toArray()[0];
    return row ? row.k : null;
  }
  assign(id) {
    const k = this.lookup(id);
    if (k !== null) return k;
    const count = this.sql.exec("SELECT COUNT(*) AS n FROM members").one().n;
    const nk = neighbourhoodOf(count);
    this.sql.exec("INSERT INTO members VALUES (?, ?)", id, nk);
    return nk;
  }
  forget(id) { this.sql.exec("DELETE FROM members WHERE id = ?", id); }
  add(d) { this.sql.exec("UPDATE totals SET builders = builders + ?, towers = towers + ?, windows = windows + ? WHERE one = 1", d.builders, d.towers, d.windows); }
  totals() { const t = this.sql.exec("SELECT builders, towers, windows FROM totals").one(); return { builders: t.builders, towers: t.towers, windows: t.windows }; }
}

export class Neighbourhood extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec("CREATE TABLE IF NOT EXISTS builders (id TEXT PRIMARY KEY, name TEXT, towers TEXT, tw INTEGER, wi INTEGER, seen INTEGER)");
  }
  // Store a cleaned report and return how the world totals change.
  report(id, r, now) {
    const old = this.sql.exec("SELECT tw, wi, seen FROM builders WHERE id = ?", id).toArray()[0];
    if (old && now - old.seen < REPORT_GAP_MS) return { builders: 0, towers: 0, windows: 0 };
    this.sql.exec("INSERT OR REPLACE INTO builders VALUES (?, ?, ?, ?, ?, ?)", id, r.name, JSON.stringify(r.towers), r.total.towers, r.total.windows, now);
    return { builders: old ? 0 : 1, towers: r.total.towers - (old?.tw ?? 0), windows: r.total.windows - (old?.wi ?? 0) };
  }
  leave(id) {
    const old = this.sql.exec("SELECT tw, wi FROM builders WHERE id = ?", id).toArray()[0];
    if (!old) return { builders: 0, towers: 0, windows: 0 };
    this.sql.exec("DELETE FROM builders WHERE id = ?", id);
    return { builders: -1, towers: -old.tw, windows: -old.wi };
  }
  view(id, now) {
    const rows = this.sql.exec("SELECT id, name, towers, seen FROM builders ORDER BY seen DESC LIMIT 120").toArray();
    return rows.filter(b => isKept(b.seen, now)).map(b => ({ name: b.name, towers: JSON.parse(b.towers), seen: b.seen, me: b.id === id }));
  }
}

export default {
  async fetch(request, env) {
    const allow = allowedOrigin(request);
    if (request.method === "OPTIONS") return preflight(allow);
    const url = new URL(request.url), now = Date.now();
    const world = env.WORLD.get(env.WORLD.idFromName("world"));
    const hood = k => env.HOOD.get(env.HOOD.idFromName(`n${k}`));

    if (url.pathname === "/api/city" && request.method === "GET") {
      const id = url.searchParams.get("id") || "";
      const k = ID.test(id) ? await world.lookup(id) : null;
      const builders = await hood(k ?? 0).view(id, now);
      return json({ neighbourhood: k, builders, world: await world.totals() }, 200, allow);
    }
    if ((url.pathname === "/api/report" || url.pathname === "/api/leave") && request.method === "POST") {
      const body = await request.json().catch(() => null);
      if (!body || !ID.test(body.id || "")) return json({ error: "bad id" }, 400, allow);
      if (url.pathname === "/api/leave") {
        const k = await world.lookup(body.id);
        if (k === null) return json({ ok: true }, 200, allow);
        await world.add(await hood(k).leave(body.id));
        await world.forget(body.id);
        return json({ ok: true }, 200, allow);
      }
      const clean = cleanReport(body);
      if (!clean) return json({ error: "bad report" }, 400, allow);
      const k = await world.assign(body.id);
      await world.add(await hood(k).report(body.id, clean, now));
      return json({ ok: true, neighbourhood: k, name: clean.name }, 200, allow);
    }
    return json({ error: "not found" }, 404, allow);
  },
};
