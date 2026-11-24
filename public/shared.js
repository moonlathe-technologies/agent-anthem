// Rules for the shared city, used by both the page and the city server, so the two always agree.
// A builder sends only numbers: the shape numbers of their newest towers and their totals. Never code, prompts,
// file or project names. The name is a random one unless the builder changes it.

import { newTower, capacity, FRONT, MAX_ROWS } from "./city.js";

export const CITY_API = "https://anthem.moonlathetechnologies.com";
export const PER_NEIGHBOURHOOD = 100;
export const ACTIVE_MS = 10 * 60 * 1000;          // lights stay on this long after a builder's last report
export const KEEP_MS = 30 * 24 * 60 * 60 * 1000;  // after this a quiet builder joins the old town
export const REPORT_GAP_MS = 15 * 1000;           // reports closer together than this are ignored

const FIRST = ["Copper", "Amber", "Silver", "Velvet", "Quiet", "Brass", "Cobalt", "Lunar", "Ember", "Willow", "Saffron", "Indigo", "Harbour", "Granite", "Juniper", "Marble"];
const SECOND = ["Heron", "Otter", "Lantern", "Fox", "Comet", "Badger", "Kestrel", "Wren", "Harbour", "Falcon", "Moth", "Beacon", "Lark", "Pike", "Hare", "Owl"];
export const randomName = (random = Math.random) => `${FIRST[Math.floor(random() * FIRST.length)]} ${SECOND[Math.floor(random() * SECOND.length)]}`;

// Letters, numbers, spaces and a few marks; 2 to 24 characters. Anything else falls back to a random name.
export function cleanName(name, random = Math.random) {
  const n = String(name ?? "").replace(/\s+/g, " ").trim();
  return /^[\p{L}\p{N} .'_]{2,24}$/u.test(n) ? n : randomName(random);
}

const int = (v, max) => (Number.isInteger(v) && v >= 0 && v <= max ? v : null);

// Check a report from the page. Returns { name, towers, total } with every number in range, or null.
export function cleanReport(body) {
  if (!body || typeof body !== "object" || !Array.isArray(body.towers) || !body.total) return null;
  const towers = [];
  for (const t of body.towers.slice(-FRONT)) {
    if (!Array.isArray(t)) return null;
    const n = int(t[0], 1e7), r = int(t[1], MAX_ROWS);
    if (n === null || r === null || r < 3) return null;
    const l = int(t[2], capacity({ c: newTower(n).c, r }));
    if (l === null) return null;
    towers.push([n, r, l]);
  }
  const tw = int(body.total.towers, 1e7), wi = int(body.total.windows, 1e9);
  if (tw === null || wi === null || tw < towers.length) return null;
  return { name: cleanName(body.name), towers, total: { towers: tw, windows: wi } };
}

export const neighbourhoodOf = joinedBefore => Math.floor(joinedBefore / PER_NEIGHBOURHOOD);
export const isActive = (seen, now) => now - seen < ACTIVE_MS;
export const isKept = (seen, now) => now - seen < KEEP_MS;

// What the page sends: the newest towers and the totals of the city in this browser.
export const reportOf = (city, name) => ({
  name,
  towers: city.towers.slice(-FRONT).map(t => [t.n, t.r, t.l]),
  total: { towers: city.old.towers + city.towers.length, windows: city.old.windows + city.towers.reduce((a, t) => a + t.l, 0) },
});

// Turn the server's view into towers the city drawing understands, in name order so each keeps its place.
export const othersOf = (builders, now) => builders
  .filter(b => !b.me)
  .sort((a, b) => a.name.localeCompare(b.name))
  .map(b => ({ name: b.name, active: isActive(b.seen, now), towers: b.towers.map(([n, r, l]) => ({ ...newTower(n), r, l })) }));
