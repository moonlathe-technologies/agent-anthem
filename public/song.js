// Your session as a song: the session's events cut into BARS slices, each a bar whose level is how busy the agent
// was then (relative to the busiest slice) and minor where something failed. The music adds the closing cadence.
export const BARS = 16;

export function songOf(events, bars = BARS) {
  const timed = events.filter(e => e.kind !== "waiting");
  if (timed.length < 3) return null;
  const t0 = timed[0].at, span = Math.max(1, timed.at(-1).at - t0);
  const slices = Array.from({ length: bars }, () => ({ count: 0, fail: false }));
  for (const e of timed) {
    const s = slices[Math.min(bars - 1, Math.floor(((e.at - t0) / span) * bars))];
    if (e.kind === "fail") s.fail = true; else s.count++;
  }
  const most = Math.max(...slices.map(s => s.count));
  return {
    bars: slices.map(s => ({ level: s.count ? 1 + Math.min(2, Math.floor((3 * s.count) / (most + 1))) : 0, minor: s.fail })),
    minutes: Math.round(span / 60000),
    tools: timed.filter(e => e.kind === "tool").length,
    fails: timed.filter(e => e.kind === "fail").length,
    project: timed.at(-1).project || "a project",
  };
}
