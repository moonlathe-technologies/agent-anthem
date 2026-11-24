// The night city: the session builds a skyline. A tool call lights a window, a finished task starts a new tower,
// a prompt sweeps a searchlight, a failure flashes a window red and a wait puts a signal in the sky.
// The saved city stays small however long it grows: only the newest towers are kept in detail, older ones fold
// into "old town" totals drawn as a far silhouette, and every shape is rebuilt from its index, so nothing but
// a few numbers per tower is stored.

export const KEEP = 40;      // towers kept in detail
export const FRONT = 16;     // of those, how many stand in the front row
export const MAX_ROWS = 24;  // a tower this tall is topped out and the next one starts
export const MAX_OTHERS = 160; // other builders' towers drawn at once

// A small seeded random source, so tower n always has the same shape.
export const rng = seed => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

export const newTower = n => ({ n, c: 3 + Math.floor(rng(n + 1)() * 3), r: 3, l: 0 });
export const capacity = t => t.c * t.r;
export const newCity = () => ({ built: 1, towers: [newTower(0)], old: { towers: 0, windows: 0 }, tools: 0 });

function fold(city) {
  while (city.towers.length > KEEP) {
    const t = city.towers.shift();
    city.old.towers += 1;
    city.old.windows += t.l;
  }
}

function startTower(city) {
  city.towers.push(newTower(city.built++));
  fold(city);
}

// Apply one session event. Returns the city for chaining.
export function grow(city, kind) {
  const t = city.towers[city.towers.length - 1];
  if (kind === "tool") {
    city.tools += 1;
    if (t.l >= capacity(t)) {
      if (t.r >= MAX_ROWS) { startTower(city); return grow(city, kind); }
      t.r += 1;
    }
    city.towers[city.towers.length - 1].l += 1;
  } else if (kind === "done" && t.l > 0) {
    startTower(city);
  }
  return city;
}

export const save = city => JSON.stringify({ b: city.built, t: city.towers.map(t => [t.n, t.r, t.l]), o: [city.old.towers, city.old.windows], x: city.tools });

export function load(text) {
  try {
    const d = JSON.parse(text);
    const towers = d.t.map(([n, r, l]) => ({ ...newTower(n), r, l }));
    if (!towers.length) return newCity();
    return { built: d.b, towers, old: { towers: d.o[0], windows: d.o[1] }, tools: d.x };
  } catch { return newCity(); }
}

export const windowsLit = city => city.old.windows + city.towers.reduce((a, t) => a + t.l, 0);
export const towerCount = city => city.old.towers + city.towers.length;

// Weather for each music style.
export const WEATHER = {
  drift: { sky: "#0a1026", ground: "#121a3a", lit: "#ffcf5a", dark: "#1e2a5c", towers: ["#18224a", "#1b2756", "#20306a", "#263a80"], far: "#151d40" },
  classical: { sky: "#283058", ground: "#3a4270", lit: "#ffe6b0", dark: "#38406e", towers: ["#2f3866", "#353f72", "#3b467e", "#434f8a"], far: "#2c3460" },
  dance: { sky: "#170a2c", ground: "#241140", lit: "#ff6fb1", dark: "#2c1850", towers: ["#22123e", "#2a1648", "#321a54", "#3a1f60"], far: "#1f0f38" },
  rock: { sky: "#0c0e13", ground: "#181b22", lit: "#f4f4f4", dark: "#22262f", towers: ["#1a1d25", "#1f232c", "#252a34", "#2b313c"], far: "#14161c" },
};

const FX_TIME = { prompt: 2200, done: 1400, fail: 1600 };

// Draw the city onto a 2D canvas context. fx is a list of { kind, at, ... } effects; now is the current time in ms.
export function draw(g, city, { w, h, style = "drift", fx = [], waiting = false, now = 0, others = [], far = 0 }) {
  const wx = WEATHER[style] || WEATHER.drift;
  g.fillStyle = wx.sky; g.fillRect(0, 0, w, h);

  const stars = rng(7);
  g.fillStyle = "rgba(255,255,255,0.7)";
  for (let i = 0; i < 40; i++) g.fillRect(Math.floor(stars() * w), Math.floor(stars() * h * 0.45), 2, 2);
  g.fillStyle = "#f4f1de"; g.beginPath(); g.arc(w * 0.86, h * 0.14, 20, 0, Math.PI * 2); g.fill();
  g.fillStyle = wx.sky; g.beginPath(); g.arc(w * 0.86 + 9, h * 0.14 - 6, 18, 0, Math.PI * 2); g.fill();

  const groundY = h - Math.round(h * 0.09);

  // Old town, plus the rest of the world when in the shared city: one far silhouette whatever its size,
  // so drawing it never gets slower.
  const distant = city.old.towers + far;
  if (distant) {
    const r = rng(99), n = Math.min(80, 10 + distant), bw = w / n;
    const tall = Math.min(0.42, 0.12 + distant / 2000);
    g.fillStyle = wx.far;
    for (let i = 0; i < n; i++) { const th = h * tall * (0.4 + r() * 0.6); g.fillRect(i * bw, groundY - th, bw + 1, th); }
  }

  const front = city.towers.slice(-FRONT), back = city.towers.slice(0, -FRONT);
  const row = (towers, scale, alpha, baseY, lightsOn = () => true) => {
    const widthOf = t => (t.c * 10 + 8) * scale, gap = 6 * scale;
    const total = towers.reduce((a, t) => a + widthOf(t) + gap, -gap);
    let x = (w - total) / 2;
    const placed = [];
    for (const t of towers) {
      const tw = widthOf(t), th = (t.r * 12 + 12) * scale;
      g.globalAlpha = alpha;
      g.fillStyle = wx.towers[t.n % 4]; g.fillRect(x, baseY - th, tw, th);
      for (let i = 0; i < capacity(t); i++) {
        const rr = Math.floor(i / t.c), cc = i % t.c, order = (t.r - 1 - rr) * t.c + cc;
        g.fillStyle = order < t.l && lightsOn(t) ? wx.lit : wx.dark;
        g.fillRect(x + (5 + cc * 10) * scale, baseY - th + (8 + rr * 12) * scale, 6 * scale, 8 * scale);
      }
      placed.push({ t, x, y: baseY - th, w: tw, h: th, scale });
      x += tw + gap;
    }
    g.globalAlpha = 1;
    return placed;
  };
  const fit = towers => towers.reduce((a, t) => a + t.c * 10 + 14, 0);
  // Other builders in the shared city: their two newest towers each, behind yours. Quiet builders go dark.
  const theirs = others.flatMap(b => b.towers.slice(-2).map(t => ({ ...t, on: b.active }))).slice(0, MAX_OTHERS);
  const tallest = list => Math.max(1, ...list.map(t => t.r * 12 + 12));
  if (theirs.length) row(theirs, Math.min(1.4, (w * 0.98) / fit(theirs), (groundY * 0.85) / tallest(theirs)), 0.7, groundY - 6, t => t.on);
  const frontScale = Math.min(2, (w * 0.94) / Math.max(1, fit(front)), (groundY * 0.8) / tallest(front));
  if (back.length) row(back, Math.min(frontScale * 0.55, (w * 0.98) / fit(back)), 0.55, groundY - 8);
  g.fillStyle = wx.ground; g.fillRect(0, groundY, w, h - groundY);
  const placed = row(front, frontScale, 1, groundY + 4);

  // The tower being built carries a crane.
  const cur = placed[placed.length - 1];
  if (cur) {
    const s = cur.scale, cx = cur.x + cur.w / 2;
    g.fillStyle = wx.lit;
    g.fillRect(cx, cur.y - 60 * s, 3 * s, 60 * s);
    g.fillRect(cx - 30 * s, cur.y - 60 * s, 110 * s, 3 * s);
    g.fillRect(cx + 70 * s, cur.y - 57 * s, 2 * s, 26 * s);
    g.fillRect(cx + 66 * s, cur.y - 31 * s, 10 * s, 7 * s);
  }

  for (const f of fx) {
    const p = Math.min(1, (now - f.at) / FX_TIME[f.kind]);
    if (f.kind === "prompt") {
      const ang = -0.5 + p * 1.0, bx = w * 0.22, len = h * 1.2;
      g.globalAlpha = 0.16 * Math.sin(Math.PI * p);
      g.fillStyle = "#9ad7ff";
      g.beginPath(); g.moveTo(bx - 8, groundY); g.lineTo(bx + 8, groundY);
      g.lineTo(bx + Math.sin(ang + 0.08) * len, groundY - Math.cos(ang + 0.08) * len);
      g.lineTo(bx + Math.sin(ang - 0.08) * len, groundY - Math.cos(ang - 0.08) * len); g.fill();
    } else if (f.kind === "done") {
      g.globalAlpha = 1 - p;
      for (const b of f.bursts) {
        g.strokeStyle = b.color; g.lineWidth = 3;
        for (let k = 0; k < 12; k++) {
          const a = (k / 12) * Math.PI * 2, r1 = 10 + p * 50, r2 = r1 + 10;
          g.beginPath(); g.moveTo(b.x * w + Math.cos(a) * r1, b.y * h + Math.sin(a) * r1);
          g.lineTo(b.x * w + Math.cos(a) * r2, b.y * h + Math.sin(a) * r2); g.stroke();
        }
      }
    } else if (f.kind === "fail" && cur) {
      const t = placed.filter(q => q.t.l > 0).pop() || cur, s = t.scale;
      const i = f.pick % Math.max(1, t.t.l), rr = t.t.r - 1 - Math.floor(i / t.t.c), cc = i % t.t.c;
      g.globalAlpha = 1 - p * 0.6;
      g.fillStyle = "#ff4d4d"; g.shadowColor = "#ff4d4d"; g.shadowBlur = 12;
      g.fillRect(t.x + (5 + cc * 10) * s, t.y + (8 + rr * 12) * s, 6 * s, 8 * s);
      g.shadowBlur = 0;
    }
    g.globalAlpha = 1;
  }

  if (waiting) {
    const pulse = 1 + 0.12 * Math.sin(now / 200), x = w * 0.56, y = h * 0.18, r = 28 * pulse;
    g.fillStyle = "rgba(124,242,200,0.18)"; g.strokeStyle = "#7cf2c8"; g.lineWidth = 2;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = "#7cf2c8"; g.font = "800 30px system-ui, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText("?", x, y + 1); g.textAlign = "start"; g.textBaseline = "alphabetic";
  }
}

// Start an effect for an event, or null when the event has none.
export function effect(kind, now, random = Math.random) {
  if (kind === "prompt" || kind === "fail") return { kind, at: now, pick: Math.floor(random() * 1000) };
  if (kind === "done") {
    const cols = ["#ff6fb1", "#ffcf5a", "#7cf2c8", "#9ad7ff"];
    return { kind, at: now, bursts: [0, 1, 2].map(() => ({ x: 0.15 + random() * 0.7, y: 0.1 + random() * 0.3, color: cols[Math.floor(random() * 4)] })) };
  }
  return null;
}
export const alive = (f, now) => now - f.at < FX_TIME[f.kind];

// Add an effect, keeping at most two of each kind so a burst of events never piles up.
export function addEffect(fx, f) {
  if (!f) return fx;
  const same = fx.filter(x => x.kind === f.kind);
  return [...fx.filter(x => x.kind !== f.kind), ...same.slice(-1), f];
}
