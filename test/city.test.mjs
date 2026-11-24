import { test } from "node:test";
import assert from "node:assert/strict";
import { newCity, grow, save, load, capacity, newTower, windowsLit, towerCount, KEEP, MAX_ROWS, effect, alive, addEffect } from "../public/city.js";

const run = (city, kind, times) => { for (let i = 0; i < times; i++) grow(city, kind); return city; };

test("a tool call lights a window in the tower being built", () => {
  const city = run(newCity(), "tool", 2);
  assert.equal(city.towers.at(-1).l, 2);
  assert.equal(city.tools, 2);
});

test("a full tower grows another floor", () => {
  const city = newCity(), t = city.towers[0];
  run(city, "tool", capacity(t) + 1);
  assert.equal(t.r, 4);
  assert.equal(t.l, capacity({ c: t.c, r: 3 }) + 1);
});

test("a topped out tower starts the next one", () => {
  const city = newCity();
  run(city, "tool", city.towers[0].c * MAX_ROWS + 1);
  assert.equal(city.towers.length, 2);
  assert.equal(city.towers[0].r, MAX_ROWS);
  assert.equal(city.towers[1].l, 1);
});

test("a finished task starts a new tower, but not twice on an empty one", () => {
  const city = run(newCity(), "tool", 3);
  grow(city, "done"); grow(city, "done");
  assert.equal(city.towers.length, 2);
});

test("tower shapes come from their number, so they survive a reload", () => {
  assert.deepEqual(newTower(12), newTower(12));
  const city = run(newCity(), "tool", 20);
  grow(city, "done"); run(city, "tool", 5);
  assert.deepEqual(load(save(city)), city);
});

test("old towers fold into old town and the saved city stays small", () => {
  const city = newCity();
  for (let i = 0; i < 2000; i++) { run(city, "tool", 15); grow(city, "done"); }
  assert.equal(city.towers.length, KEEP);
  assert.equal(towerCount(city), 2001);
  assert.equal(windowsLit(city), 30000);
  assert.ok(save(city).length < 2000, `saved city is ${save(city).length} bytes`);
});

test("a broken save starts a fresh city", () => {
  assert.deepEqual(load("not json"), newCity());
  assert.deepEqual(load(null), newCity());
});

test("effects only for events that show one, and they end", () => {
  assert.equal(effect("tool", 0), null);
  const f = effect("done", 0, () => 0.5);
  assert.equal(f.bursts.length, 3);
  assert.ok(alive(f, 100) && !alive(f, 5000));
});

test("a burst of finished tasks keeps at most two fireworks going", () => {
  let fx = [];
  for (let i = 0; i < 50; i++) fx = addEffect(fx, effect("done", i));
  fx = addEffect(fx, effect("prompt", 60));
  fx = addEffect(fx, effect("tool", 61));
  assert.deepEqual(fx.map(f => f.kind), ["done", "done", "prompt"]);
});
