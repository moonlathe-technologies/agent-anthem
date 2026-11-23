import { test } from "node:test";
import assert from "node:assert/strict";
import { songOf } from "../public/song.js";

const at = (min, kind, project = "shop") => ({ kind, at: min * 60000, project });

test("a session becomes bars: busy slices are louder, failures are minor", () => {
  const events = [at(0, "prompt"), ...Array.from({ length: 9 }, (_, i) => at(1 + i * 0.1, "tool")), at(8, "fail"), at(15, "tool"), at(16, "done")];
  const song = songOf(events, 16);
  assert.equal(song.bars.length, 16);
  assert.equal(song.bars[1].level, 3, "the busiest stretch (minute 1) is the loudest");
  assert.equal(song.bars[3].level, 0, "a quiet stretch rests");
  assert.ok(song.bars[8].minor && !song.bars[1].minor, "the failure lands where it happened");
  assert.deepEqual([song.minutes, song.tools, song.fails, song.project], [16, 10, 1, "shop"]);
});

test("too little to make a song from", () => {
  assert.equal(songOf([at(0, "prompt"), at(1, "waiting")]), null);
});
