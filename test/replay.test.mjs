import { test } from "node:test";
import assert from "node:assert/strict";
import { toHook, schedule } from "../tools/replay.mjs";
import { classify } from "../server.mjs";
import { fakeBuilder } from "../tools/seed-city.mjs";
import { cleanReport } from "../public/shared.js";

const events = [
  { kind: "prompt", at: 0 },
  { kind: "tool", tool: "Read", at: 1000 },
  { kind: "fail", tool: "Bash", at: 3000 },
  { kind: "waiting", at: 600000 },
  { kind: "done", at: 601000 },
];

test("every recorded event turns back into a hook the server hears the same way", () => {
  for (const e of events) {
    const heard = classify(toHook(e, "replay"));
    assert.equal(heard.kind, e.kind);
    if (e.tool) assert.equal(heard.tool, e.tool);
  }
});

test("a replay keeps the order, speeds it up and shortens long quiet gaps", () => {
  const plan = schedule(events, { speed: 10, maxGap: 3000 });
  assert.deepEqual(plan.map(p => p.event.kind), events.map(e => e.kind));
  assert.deepEqual(plan.map(p => p.wait), [0, 100, 200, 3000, 100]);
});

test("a replay of nothing is empty", () => {
  assert.deepEqual(schedule([], { speed: 10, maxGap: 3000 }), []);
});

test("made-up builders send reports the city server accepts", () => {
  let seed = 1;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 50; i++) {
    const b = fakeBuilder(random);
    assert.ok(cleanReport(b.report), `builder ${i} was refused`);
    assert.match(b.id, /^[a-f0-9-]{36}$/);
  }
});
