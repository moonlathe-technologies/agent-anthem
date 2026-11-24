// Save a real session and play it back, sped up, for testing and for recording a video.
//   node tools/replay.mjs save <name>                     saves the latest session to recordings/<name>.json
//   node tools/replay.mjs play <name> [speed] [maxGapSec]   plays it into the local server (default 10x, 3s gaps)
// A recording holds only what the page hears: the kind of event, the tool name, the folder name and the time.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const BASE = `http://127.0.0.1:${Number(process.env.AGENT_ANTHEM_PORT || 4777)}`;
const RECORDINGS = new URL("../recordings/", import.meta.url);

// Turn a recorded event back into the hook JSON Claude Code would have sent.
export function toHook(event, session) {
  const base = { session_id: session, cwd: `/replay/${event.project || "project"}` };
  switch (event.kind) {
    case "prompt": return { ...base, hook_event_name: "UserPromptSubmit" };
    case "tool": return { ...base, hook_event_name: "PreToolUse", tool_name: event.tool };
    case "fail": return { ...base, hook_event_name: "PostToolUseFailure", tool_name: event.tool };
    case "done": return { ...base, hook_event_name: "Stop" };
    case "waiting": return { ...base, hook_event_name: "Notification" };
    default: return null;
  }
}

// How long to wait before each event: real gaps divided by speed, and no quiet spell longer than maxGap.
export const schedule = (events, { speed, maxGap }) =>
  events.map((event, i) => ({ event, wait: i === 0 ? 0 : Math.min(maxGap, Math.round((event.at - events[i - 1].at) / speed)) }));

async function save(name) {
  const history = await (await fetch(`${BASE}/history`)).json();
  await mkdir(RECORDINGS, { recursive: true });
  await writeFile(new URL(`${name}.json`, RECORDINGS), JSON.stringify(history));
  console.log(`Saved ${history.length} events to recordings/${name}.json`);
}

async function play(name, speed = 10, maxGapSec = 3) {
  const events = JSON.parse(await readFile(new URL(`${name}.json`, RECORDINGS), "utf8"));
  const plan = schedule(events, { speed: Number(speed), maxGap: Number(maxGapSec) * 1000 });
  const session = `replay-${Date.now()}`, total = plan.reduce((a, p) => a + p.wait, 0);
  console.log(`Playing ${plan.length} events over ${Math.round(total / 1000)}s. Open ${BASE} first.`);
  for (const { event, wait } of plan) {
    await new Promise(r => setTimeout(r, wait));
    const hook = toHook(event, session);
    if (hook) await fetch(`${BASE}/event`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(hook) });
  }
  console.log("Done.");
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const [command, name = "session", ...rest] = process.argv.slice(2);
  const run = { save: () => save(name), play: () => play(name, ...rest) }[command];
  if (!run) { console.log("Use: node tools/replay.mjs save <name> | play <name> [speed] [maxGapSec]"); process.exit(1); }
  await run();
}
