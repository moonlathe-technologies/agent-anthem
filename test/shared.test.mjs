import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanName, randomName, cleanReport, reportOf, othersOf, neighbourhoodOf, isActive, isKept, ACTIVE_MS, KEEP_MS } from "../public/shared.js";
import { newCity, grow, newTower, capacity, FRONT } from "../public/city.js";

const built = () => { const c = newCity(); for (let i = 0; i < 30; i++) { for (let j = 0; j < 12; j++) grow(c, "tool"); grow(c, "done"); } return c; };

test("random names are two words", () => {
  assert.match(randomName(() => 0), /^Copper Heron$/);
});

test("names: plain ones are kept, odd ones become random", () => {
  assert.equal(cleanName("  Night   Owl "), "Night Owl");
  assert.equal(cleanName("Zoë 2"), "Zoë 2");
  assert.equal(cleanName("<script>", () => 0), "Copper Heron");
  assert.equal(cleanName("x", () => 0), "Copper Heron");
  assert.equal(cleanName("a".repeat(25), () => 0), "Copper Heron");
});

test("a report holds only numbers and a name, and the newest towers only", () => {
  const r = reportOf(built(), "Night Owl");
  assert.deepEqual(Object.keys(r).sort(), ["name", "total", "towers"]);
  assert.equal(r.towers.length, FRONT);
  assert.ok(r.towers.flat().every(Number.isInteger));
  assert.deepEqual(cleanReport(r), r);
});

test("reports with impossible numbers are refused", () => {
  const good = reportOf(built(), "Night Owl");
  const n = good.towers[0][0], c = newTower(n).c;
  assert.equal(cleanReport({ ...good, towers: [[n, 3, capacity({ c, r: 3 }) + 1]] }), null, "more lit windows than the tower has");
  assert.equal(cleanReport({ ...good, towers: [[n, 99, 0]] }), null, "taller than any tower can be");
  assert.equal(cleanReport({ ...good, towers: [[n, 3, 1.5]] }), null, "not whole numbers");
  assert.equal(cleanReport({ ...good, total: { towers: -1, windows: 0 } }), null);
  assert.equal(cleanReport({ ...good, total: { towers: 1, windows: 0 } }), null, "fewer towers in total than were sent");
  assert.equal(cleanReport({ towers: "lots" }), null);
  assert.equal(cleanReport(null), null);
});

test("extra fields never get through", () => {
  const r = cleanReport({ ...reportOf(built(), "Owl Two"), project: "secret-client", prompt: "fix the login" });
  assert.deepEqual(Object.keys(r).sort(), ["name", "total", "towers"]);
});

test("a hundred builders to a neighbourhood", () => {
  assert.deepEqual([0, 99, 100, 250].map(neighbourhoodOf), [0, 0, 1, 2]);
});

test("lights go off after ten quiet minutes, and builders leave after thirty days", () => {
  assert.ok(isActive(0, ACTIVE_MS - 1) && !isActive(0, ACTIVE_MS));
  assert.ok(isKept(0, KEEP_MS - 1) && !isKept(0, KEEP_MS));
});

test("other builders become drawable towers, without me", () => {
  const view = [{ name: "Me", towers: [[4, 3, 2]], seen: 0, me: true }, { name: "Owl", towers: [[5, 4, 6]], seen: 0 }];
  const others = othersOf(view, 1000);
  assert.equal(others.length, 1);
  assert.deepEqual(others[0], { name: "Owl", active: true, towers: [{ ...newTower(5), r: 4, l: 6 }] });
});
