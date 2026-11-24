import { test } from "node:test";
import assert from "node:assert/strict";
import { allowedOrigin, preflight, json } from "../city-server/http.mjs";

const req = origin => new Request("https://anthem.example/api/report", { method: "OPTIONS", headers: origin ? { origin } : {} });

test("the browser's check before a report gets an empty 204 that allows the post", () => {
  // Regression: this used to throw, because a 204 reply was given a body, so every report failed.
  const r = preflight("http://127.0.0.1:4777");
  assert.equal(r.status, 204);
  assert.equal(r.body, null);
  assert.equal(r.headers.get("access-control-allow-origin"), "http://127.0.0.1:4777");
  assert.match(r.headers.get("access-control-allow-methods"), /POST/);
  assert.match(r.headers.get("access-control-allow-headers"), /content-type/);
});

test("only pages on this machine may call the city server", () => {
  assert.equal(allowedOrigin(req("http://127.0.0.1:4777")), "http://127.0.0.1:4777");
  assert.equal(allowedOrigin(req("http://localhost:4777")), "http://localhost:4777");
  assert.equal(allowedOrigin(req("https://evil.example")), "null");
  assert.equal(allowedOrigin(req(null)), "null");
});

test("replies are JSON and never cached", async () => {
  const r = json({ ok: true }, 200, "null");
  assert.deepEqual(await r.json(), { ok: true });
  assert.equal(r.headers.get("cache-control"), "no-store");
});
