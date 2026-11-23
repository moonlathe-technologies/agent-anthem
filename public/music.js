// Music made on the fly in the browser with Web Audio. Recorded instruments (free CC BY 3.0 samples, loaded on
// demand) where a style uses them, synthesised sound otherwise and while they load. Each style is a set of rules
// played one sixteenth note at a time. The session sets the level (0 calm, 1 to 3 busier as the agent works), a
// failure turns the chords minor for a few bars, and finishing plays a cadence that settles on home.
//
// So it never loops: the music moves in 8 bar sections, each with its own chord progression, arpeggio shape,
// rhythm and a short melody motif, and it changes key every few sections.

const RECORD_LIFT = 2.5;
let ctx, master, out, echo, reverbSend, noiseBuffer, driveCurve, ampCurve, recordTap;

const hz = m => 440 * Math.pow(2, (m - 69) / 12);
const pick = list => list[Math.floor(Math.random() * list.length)];

// Recorded instruments, shipped with the plugin in public/samples: from Nicholas Brosowsky's tonejs-instruments,
// CC BY 3.0 (sources in NOTICE). Served by the local server, so nothing is fetched from the internet.
const SAMPLE_ROOT = "/samples/";
const SETS = {
  piano: "C2 Ds2 Fs2 A2 C3 Ds3 Fs3 A3 C4 Ds4 Fs4 A4 C5 Ds5 Fs5 A5 C6",
  cello: "C2 E2 G2 C3 E3 G3 C4 E4 G4",
  violin: "G3 C4 E4 G4 C5 E5 G5 C6",
  contrabass: "G1 C2 D2 E2 A2",
  "guitar-acoustic": "E2 A2 D3 G3 B3 E4 A4 C5",
  "guitar-electric": "E2 A2 C3 Fs3 C4 Fs4 A4 C5",
  "bass-electric": "E1 G1 As1 Cs2 E2 G2 As2 Cs3 E3",
};
const loaded = {}, loading = {};
const noteMidi = n => { const [, l, s, o] = n.match(/^([A-G])(s?)(\d)$/); return 12 * (+o + 1) + { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[l] + (s ? 1 : 0); };
function loadSet(name) {
  if (loaded[name] || loading[name]) return loading[name];
  loading[name] = Promise.all(SETS[name].split(" ").map(async n => {
    const res = await fetch(`${SAMPLE_ROOT}${name}/${n}.mp3`);
    return [noteMidi(n), await ctx.decodeAudioData(await res.arrayBuffer())];
  })).then(list => { loaded[name] = list.sort((a, b) => a[0] - b[0]); }).catch(() => { delete loading[name]; });
  return loading[name];
}

// Harmony. Chords are scale degrees in the current key, so any progression works in any key.
const DEGREES = { 1: [0, "M", 0], 2: [2, "m", 1], 3: [4, "m", 2], 4: [5, "M", 3], 5: [7, "M", 4], 6: [9, "m", 5], b3: [3, "M", 2], b6: [8, "M", 5], b7: [10, "M", 6] };
const MAJOR_PROGS = [[1, 5, 6, 4], [6, 4, 1, 5], [1, 6, 4, 5], [4, 1, 5, 6], [1, 3, 4, 5], [2, 5, 1, 6], [1, 4, 6, 5], [4, 5, 3, 6], [1, 5, 4, 4], [6, 5, 4, 5]];
const MINOR_PROGS = [[6, 4, 1, 5], [6, 2, 5, 6], [6, 3, 4, 6], [6, 5, 4, 3]];
const KEY_MOVES = [2, 5, -3, -2, 7, -5];
const ARPS = [[0, 1, 2, 3], [0, 1, 2, 3, 2, 1], [0, 2, 1, 3], [0, 2, 4, 1, 3, 5], [3, 2, 1, 0], [0, 1, 2, 1, 3, 1]];
const BASE = 48; // C3
const chordOf = (key, degree) => {
  const [offset, quality, place] = DEGREES[degree];
  let root = BASE + key + offset;
  while (root > 55) root -= 12;
  return { root, quality, place, tones: { M: [0, 4, 7], m: [0, 3, 7], 7: [0, 4, 7, 10] }[quality].map(i => root + i) };
};
const CADENCE = key => [chordOf(key, 4), { ...chordOf(key, 5), tones: chordOf(key, 5).tones.concat(chordOf(key, 5).root + 10) }, chordOf(key, 1)];
const SCALE = [0, 2, 4, 5, 7, 9, 11];

export const state = {
  style: "drift", working: false, waiting: false, energy: 0, minorBars: 0, cadence: [], final: false,
  step: 0, nextTime: 0, chord: chordOf(0, 1), level: 0, timer: null,
  key: 0, bar: 0, sectionsInKey: 0, section: null, script: null, onBar: null,
};

const level = () => (state.working ? Math.min(3, 1 + Math.floor(state.energy / 5)) : 0);

function newSection() {
  const last = state.section;
  if (last && ++state.sectionsInKey >= 3 + Math.floor(Math.random() * 3)) {
    state.key = ((state.key + pick(KEY_MOVES)) % 12 + 12) % 12;
    if (state.key > 7) state.key -= 12;
    state.sectionsInKey = 0;
  }
  let prog;
  const bank = STYLES[state.style].progs ?? MAJOR_PROGS;
  do prog = [...pick(bank), ...pick(bank)]; while (last && prog.join() === last.prog.join());
  const motif = Array.from({ length: 4 }, () => Math.floor(Math.random() * 5));
  state.section = { prog, arp: pick(ARPS), busy: pick([0, 0, 1, -1]), motif, rest: Math.random() < 0.3 };
}

function nextChord() {
  if (state.cadence.length) {
    const c = state.cadence.shift();
    if (!state.cadence.length) { state.final = true; state.working = false; state.energy = 0; }
    return c;
  }
  if (!state.section || state.bar % 8 === 0) newSection();
  const minor = state.minorBars > 0;
  state.minorNow = minor;
  if (minor) state.minorBars--;
  const degree = minor ? MINOR_PROGS[Math.floor(state.bar / 4) % MINOR_PROGS.length][state.bar % 4] : state.section.prog[state.bar % 8];
  state.bar++;
  return chordOf(state.key, degree);
}

// Every sound goes through one chain: optional drive and filter, an envelope, a pan, and sends to reverb and echo.
function chain(source, t, { gain = 0.1, attack = 0.005, dur = 0.1, release = 0.3, cutoff, q = 0.7, drive = false, amp = 0, verb = 0.2, delay = 0, pan = 0 }) {
  let node = source;
  if (amp) {
    const pre = ctx.createGain(), ws = ctx.createWaveShaper(), low = ctx.createBiquadFilter(), mid = ctx.createBiquadFilter(), cab = ctx.createBiquadFilter();
    pre.gain.value = amp; ws.curve = ampCurve; ws.oversample = "4x";
    low.type = "highpass"; low.frequency.value = 85;
    mid.type = "peaking"; mid.frequency.value = 900; mid.gain.value = 4; mid.Q.value = 0.8;
    cab.type = "lowpass"; cab.frequency.value = cutoff ?? 4800; cab.Q.value = 0.9;
    node.connect(pre); pre.connect(ws); ws.connect(low); low.connect(mid); mid.connect(cab); node = cab; cutoff = null;
  }
  if (drive) { const ws = ctx.createWaveShaper(); ws.curve = driveCurve; ws.oversample = "2x"; node.connect(ws); node = ws; }
  if (cutoff) { const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = cutoff; f.Q.value = q; node.connect(f); node = f; }
  const hold = Math.max(attack, dur), g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.setValueAtTime(gain, t + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t + hold + release);
  node.connect(g);
  const p = ctx.createStereoPanner();
  p.pan.value = pan;
  g.connect(p);
  p.connect(master);
  if (verb) { const s = ctx.createGain(); s.gain.value = verb; p.connect(s); s.connect(reverbSend); }
  if (delay) { const s = ctx.createGain(); s.gain.value = delay; p.connect(s); s.connect(echo); }
  return t + hold + release + 0.05;
}

function tone({ freq, t, type = "sine", detune = 0, ...shape }) {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  osc.detune.value = detune;
  osc.start(t);
  osc.stop(chain(osc, t, shape));
}

// A recorded note: the nearest sample, retuned. Returns false while the set is still loading.
function sample(set, m, t, shape = {}) {
  const list = loaded[set];
  if (!list) return false;
  let best = list[0];
  for (const e of list) if (Math.abs(e[0] - m) < Math.abs(best[0] - m)) best = e;
  const src = ctx.createBufferSource();
  src.buffer = best[1];
  src.playbackRate.value = Math.pow(2, (m - best[0]) / 12);
  src.start(t);
  src.stop(Math.min(chain(src, t, { dur: 1, release: 0.6, ...shape }), t + best[1].duration / src.playbackRate.value));
  return true;
}

function noise(t, { dur = 0.05, gain = 0.15, type = "highpass", freq = 7000, verb = 0 } = {}) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f); f.connect(g); g.connect(master);
  if (verb) { const s = ctx.createGain(); s.gain.value = verb; g.connect(s); s.connect(reverbSend); }
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.02);
}

// A rock kit: a kick with a click, a snare with body, toms for fills, a crash to open a section.
const rockKick = t => { kick(t, 1); noise(t, { dur: 0.012, gain: 0.12, freq: 3000 }); };
const rockSnare = t => {
  noise(t, { dur: 0.22, gain: 0.32, type: "bandpass", freq: 2600, verb: 0.3 });
  noise(t, { dur: 0.12, gain: 0.12, freq: 6000 });
  const osc = ctx.createOscillator(), g = ctx.createGain();
  osc.type = "triangle"; osc.frequency.setValueAtTime(230, t); osc.frequency.exponentialRampToValueAtTime(160, t + 0.08);
  g.gain.setValueAtTime(0.35, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
  osc.connect(g); g.connect(master); osc.start(t); osc.stop(t + 0.15);
};
const tom = (t, f) => {
  const osc = ctx.createOscillator(), g = ctx.createGain(), s = ctx.createGain();
  osc.frequency.setValueAtTime(f * 1.4, t); osc.frequency.exponentialRampToValueAtTime(f, t + 0.08);
  g.gain.setValueAtTime(0.55, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
  s.gain.value = 0.2; osc.connect(g); g.connect(master); g.connect(s); s.connect(reverbSend); osc.start(t); osc.stop(t + 0.4);
};
const crash = t => noise(t, { dur: 1.8, gain: 0.1, freq: 5500, verb: 0.35 });

function kick(t, gain = 0.8) {
  const osc = ctx.createOscillator(), g = ctx.createGain();
  osc.frequency.setValueAtTime(140, t);
  osc.frequency.exponentialRampToValueAtTime(42, t + 0.12);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
  osc.connect(g); g.connect(master);
  osc.start(t); osc.stop(t + 0.4);
}
const hat = (t, open = false, gain = 0.07) => noise(t, { dur: open ? 0.22 : 0.035, gain, freq: 8000 });
const snare = t => { noise(t, { dur: 0.16, gain: 0.25, type: "bandpass", freq: 1900, verb: 0.15 }); tone({ freq: 185, t, dur: 0.01, type: "triangle", gain: 0.12, release: 0.08, verb: 0 }); };
const clap = t => [0, 0.012, 0.024].forEach(d => noise(t + d, { dur: 0.09, gain: 0.14, type: "bandpass", freq: 1300, verb: 0.25 }));
const piano = (m, t, gain = 0.09, delay = 0) =>
  sample("piano", m, t, { gain: gain * 3.2, dur: 1.6, release: 0.8, verb: 0.35, delay }) ||
  (tone({ freq: hz(m), t, dur: 0.02, type: "triangle", gain, release: 1.4, verb: 0.35, delay }), tone({ freq: hz(m + 12), t, dur: 0.01, gain: gain * 0.3, release: 0.6 }));
const keys = (m, t, gain = 0.07, delay = 0.35) => { tone({ freq: hz(m), t, dur: 0.05, gain, release: 1.1, verb: 0.4, delay }); tone({ freq: hz(m) * 2.01, t, dur: 0.01, gain: gain * 0.25, release: 0.35, verb: 0.2 }); };
const pad = (c, t, dur, { gain = 0.022, cutoff = 900, octave = 12, attack = 0.8 } = {}) =>
  c.tones.forEach((m, k) => [-7, 7].forEach(d => tone({ freq: hz(m + octave), t, dur, type: "sawtooth", gain, attack, release: 1.6, cutoff, detune: d, verb: 0.5, pan: (k - 1) * 0.35 })));
const strings = (c, t, dur, gain = 0.05) => {
  if (!sample("cello", c.root - 12, t, { gain: gain * 1.4, attack: 0.5, dur, release: 1, verb: 0.45, pan: -0.3 })) return pad(c, t, dur, { gain: 0.016, cutoff: 1000, attack: 1 });
  c.tones.slice(1).forEach((m, k) => sample("violin", m + 12, t, { gain, attack: 0.7, dur, release: 1.2, verb: 0.5, pan: 0.2 + k * 0.2 }));
};

// Notes of the chord spread over two octaves, walked in this section's arpeggio shape.
const arpNote = (c, n, lift = 12) => { const notes = [...c.tones.slice(0, 3), ...c.tones.slice(0, 3).map(m => m + 12)]; return notes[state.section.arp[n % state.section.arp.length] % notes.length] + lift; };
// This section's motif, walked over the key's scale near the chord.
const motifNote = (c, n, lift = 12) => { const idx = state.section.motif[n % 4] + c.place; return BASE + state.key + lift + SCALE[idx % 7] + 12 * Math.floor(idx / 7); };
const rate = (lvl, table) => table[Math.max(0, Math.min(3, lvl + state.section.busy))];

// The styles. step(i, t, c, lvl, sd): i is the sixteenth within the bar, sd the length of a sixteenth.
export const STYLES = {
  drift: {
    name: "Drift", note: "analog pads, echoing arps, electric piano", tempo: 84, uses: [],
    step(i, t, c, lvl, sd) {
      if (i === 0) pad(c, t, sd * 16, { cutoff: 700 + lvl * 350 });
      const every = rate(lvl, [4, 2, 2, 1]);
      if (i % every === 0 && !(state.section.rest && lvl === 0 && i >= 8)) keys(arpNote(c, i / every), t, 0.045 + lvl * 0.01);
      if (lvl >= 2 && i % 8 === 0) tone({ freq: hz(c.root - 12), t, dur: sd * 7, type: "triangle", gain: 0.09, attack: 0.05, release: 0.4, verb: 0.1 });
      if (lvl >= 3 && (i === 0 || i === 6 || i === 10)) keys(motifNote(c, i / 2), t, 0.035, 0.5);
    },
    final(t, c) { pad(c, t, 3, { cutoff: 1100 }); c.tones.forEach((m, k) => keys(m + 12, t + k * 0.08, 0.06)); },
  },
  classical: {
    name: "Classical", note: "recorded piano, cello and violins", tempo: 76, uses: ["piano", "cello", "violin", "contrabass"],
    step(i, t, c, lvl, sd) {
      if (i === 0 && (lvl > 0 || !state.section.rest)) strings(c, t, sd * 15, 0.035 + lvl * 0.012);
      const every = rate(lvl, [4, 2, 1, 1]);
      if (i % every === 0) piano(arpNote(c, i / every), t, 0.06 + lvl * 0.012);
      if (lvl >= 2 && i % 8 === 0) sample("contrabass", c.root - 12, t, { gain: 0.25, attack: 0.05, dur: sd * 7, release: 0.4, verb: 0.3 }) || tone({ freq: hz(c.root - 12), t, dur: sd * 7, type: "sawtooth", gain: 0.05, attack: 0.12, release: 0.5, cutoff: 450, verb: 0.35 });
      if (lvl >= 3 && i % 4 === 0) sample("violin", motifNote(c, i / 4), t, { gain: 0.08, attack: 0.08, dur: sd * 3.5, release: 0.4, verb: 0.5 });
    },
    final(t, c) { strings(c, t, 3, 0.06); [c.root - 12, ...c.tones, c.root + 12].forEach((m, k) => piano(m + 12, t + k * 0.06, 0.08)); },
  },
  dance: {
    name: "Dance", note: "four to the floor, plucks, house piano", tempo: 122, uses: ["piano"],
    step(i, t, c, lvl, sd) {
      if (i === 0) pad(c, t, sd * 16, { gain: 0.015, cutoff: 500 + lvl * 700, attack: 0.3 });
      const drop = state.section.rest && state.bar % 8 === 7; // a breath before the next section
      if (lvl >= 1 && i % 4 === 0 && !drop) kick(t);
      if (lvl >= 1 && i % 4 === 2) hat(t, lvl >= 3);
      if (lvl >= 3 && i % 2 === 1) hat(t, false, 0.035);
      if (lvl >= 2 && (i === 4 || i === 12)) clap(t);
      if (lvl >= 1 && i % 4 === 2 && !drop) tone({ freq: hz(c.root - 12), t, dur: sd * 1.4, type: "sawtooth", gain: 0.1, release: 0.08, cutoff: 380 + lvl * 160, q: 5 });
      if (lvl >= 2 && (i === 6 || i === 14) && state.section.busy >= 0) c.tones.forEach(m => sample("piano", m + 12, t, { gain: 0.12, dur: sd * 1.5, release: 0.2, verb: 0.3 }));
      const every = rate(lvl, [4, 2, 1, 1]);
      if (i % every === 0) tone({ freq: hz(arpNote(c, i / every, 24)), t, dur: 0.03, type: "square", gain: 0.026, release: 0.2, cutoff: 1600 + lvl * 700, verb: 0.25, delay: 0.25 });
    },
    final(t, c) { kick(t); pad(c, t, 3, { gain: 0.03, cutoff: 2500, attack: 0.02 }); c.tones.forEach(m => sample("piano", m + 12, t, { gain: 0.15, dur: 2, release: 1.5, verb: 0.4 })); },
  },
  rock: {
    name: "Rock", note: "driven guitars, bass and a full kit", tempo: 118, uses: ["guitar-electric", "bass-electric"],
    progs: [[1, "b7", 4, 1], [1, 4, 5, 4], [6, 4, 1, 5], [1, "b6", "b7", 1], [1, 5, "b7", 4], [4, 1, 5, 5], [6, 5, 4, 4], [1, "b3", 4, 1]],
    step(i, t, c, lvl, sd) {
      const r = c.root >= 47 ? c.root - 12 : c.root; // power chords low on the neck, E2 to D3
      const guitar = (m, at, shape) => [-0.75, 0.75].forEach((pan, k) => // two takes, hard left and right
        sample("guitar-electric", m, at + k * 0.012, { pan, ...shape }) || tone({ freq: hz(m), t: at + k * 0.012, type: "sawtooth", detune: k ? 6 : -6, pan, ...shape, gain: shape.gain * 0.5 }));
      if (lvl === 0) { // clean electric guitar, chiming with the echo
        const every = state.section.busy > 0 ? 2 : 4;
        if (i % every === 0) sample("guitar-electric", arpNote(c, i / every, 12), t, { gain: 0.22, dur: 1, release: 0.7, cutoff: 3500, verb: 0.35, delay: 0.3 }) ||
          tone({ freq: hz(arpNote(c, i / every, 12)), t, dur: 0.02, type: "triangle", gain: 0.06, release: 0.7, cutoff: 2600, verb: 0.3, delay: 0.3 });
        return;
      }
      const fill = lvl >= 2 && state.bar % 8 === 0 && i >= 12; // the last beat before a new section
      // Level 1 chugs muted eighths. Level 2 and 3 ring out on a pushed rock rhythm.
      const hits = lvl === 1 ? [0, 2, 4, 6, 8, 10, 12, 14] : state.section.busy < 0 ? [0, 6, 8, 14] : [0, 3, 6, 8, 10, 11, 14];
      if (hits.includes(i) && !fill) {
        const ring = lvl === 1 ? 0.85 : i === 0 || i === 8 ? 3.5 : 1.6;
        [r, r + 7, r + 12].forEach(m => guitar(m, t, { gain: 0.05, amp: 9, dur: sd * ring, release: lvl === 1 ? 0.04 : 0.15, cutoff: lvl === 1 ? 2400 : 4800 }));
      }
      if ((lvl === 1 ? i % 2 === 0 : hits.includes(i)) && !fill) sample("bass-electric", r - 12, t, { gain: 0.42, dur: sd * (lvl === 1 ? 1.6 : 1.9), release: 0.06, cutoff: 1400 }) ||
        tone({ freq: hz(r - 12), t, dur: sd * 1.6, type: "sawtooth", gain: 0.1, release: 0.05, cutoff: 650 });
      if (fill) { if (i % 1 === 0) tom(t, [196, 165, 131, 98][i - 12]); return; }
      if (i === 0 && state.bar % 8 === 1 && lvl >= 2) crash(t);
      if (i === 0 || i === 8 || (lvl >= 2 && (i === 3 || i === 10))) rockKick(t);
      if (i === 4 || i === 12) rockSnare(t);
      if (i % 2 === 0 && !(i === 0 && state.bar % 8 === 1 && lvl >= 2)) hat(t, lvl >= 3 && i % 4 === 2, lvl >= 2 ? 0.07 : 0.05);
      if (lvl >= 3 && i % 4 === 2) { // a lead line on the blues scale, sung over the riff
        const m = BASE + state.key + 12 + [0, 3, 5, 7, 10, 12][state.section.motif[(i / 4 | 0) % 4] + (state.bar % 2)];
        sample("guitar-electric", m, t, { gain: 0.045, attack: 0.01, dur: sd * 3.5, release: 0.4, amp: 14, cutoff: 4200, verb: 0.35, delay: 0.25 });
      }
    },
    final(t, c) {
      const r = c.root >= 47 ? c.root - 12 : c.root;
      [r, r + 7, r + 12, r + 16].forEach((m, k) => [-0.75, 0.75].forEach(pan => sample("guitar-electric", m, t + k * 0.025, { gain: 0.05, amp: 9, dur: 2.2, release: 1.8, pan, verb: 0.4 })));
      sample("bass-electric", r - 12, t, { gain: 0.45, dur: 2, release: 1.2 });
      rockKick(t); crash(t);
    },
  },
};

function tick() {
  const style = STYLES[state.style], sd = 60 / style.tempo / 4;
  while (state.nextTime < ctx.currentTime + 0.15) {
    const i = state.step % 16, t = state.nextTime;
    if (i === 0) {
      if (state.final) { state.final = false; if (state.script) { state.script.done?.(); state.script = null; } }
      if (state.script?.bars.length) {
        const bar = state.script.bars.shift();
        state.working = true; state.minorBars = bar.minor ? 1 : 0;
        if (!state.script.bars.length) state.cadence = CADENCE(state.key);
        state.chord = nextChord();
        state.level = bar.level;
      } else {
        state.chord = nextChord();
        state.energy *= 0.8;
        state.level = state.final ? 0 : level();
      }
      if (state.final) style.final(t, state.chord, sd);
      state.onBar?.({ level: state.level, minor: !!state.minorNow, final: state.final });
    }
    if (!state.final) style.step(i, t, state.chord, state.level, sd);
    if (state.waiting && !state.working && (i === 0 || i === 6)) keys(BASE + state.key + (i ? 31 : 36), t, 0.035, 0.4);
    state.nextTime += sd;
    state.step++;
  }
  state.timer = setTimeout(tick, 25);
}

export function start(volume = 0.7) {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 4;
    // Everything plays into master; the volume slider only sets what you hear, so a saved video is
    // always recorded at the same level, lifted and limited to sit near social video loudness.
    master = ctx.createGain();
    out = ctx.createGain();
    master.connect(comp); comp.connect(out); out.connect(ctx.destination);
    const lift = ctx.createGain(), limit = ctx.createDynamicsCompressor();
    lift.gain.value = RECORD_LIFT;
    limit.threshold.value = -4; limit.knee.value = 0; limit.ratio.value = 20; limit.attack.value = 0.002; limit.release.value = 0.1;
    recordTap = ctx.createMediaStreamDestination();
    comp.connect(lift); lift.connect(limit); limit.connect(recordTap);
    const len = ctx.sampleRate * 2.8, impulse = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = impulse.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
    const verb = ctx.createConvolver();
    verb.buffer = impulse;
    reverbSend = ctx.createGain(); reverbSend.gain.value = 0.5;
    reverbSend.connect(verb); verb.connect(master);
    echo = ctx.createDelay(1);
    const feedback = ctx.createGain(), darken = ctx.createBiquadFilter();
    darken.type = "lowpass"; darken.frequency.value = 2200; feedback.gain.value = 0.38;
    echo.connect(darken); darken.connect(feedback); feedback.connect(echo); darken.connect(master);
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const n = noiseBuffer.getChannelData(0); for (let i = 0; i < n.length; i++) n[i] = Math.random() * 2 - 1;
    driveCurve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = (i / 1023) * 2 - 1; driveCurve[i] = Math.tanh(x * 4); }
    ampCurve = new Float32Array(4096);
    for (let i = 0; i < 4096; i++) { const x = (i / 4095) * 2 - 1; ampCurve[i] = x >= 0 ? Math.tanh(x * 3) : Math.tanh(x * 2.2) * 0.9; }
  }
  setVolume(volume);
  setStyle(state.style);
  ctx.resume();
  clearTimeout(state.timer);
  state.nextTime = ctx.currentTime + 0.1;
  state.step = 0;
  tick();
  return ctx.state;
}

export const running = () => ctx?.state === "running" && state.timer !== null;
export function stop() { clearTimeout(state.timer); state.timer = null; ctx?.suspend(); }
export const setVolume = v => out && out.gain.setTargetAtTime(v * 0.6, ctx.currentTime, 0.1);
export function setStyle(name) {
  state.style = name;
  if (!ctx) return;
  STYLES[name].uses.forEach(loadSet);
  echo.delayTime.setValueAtTime((60 / STYLES[name].tempo) * 0.75, ctx.currentTime); // a dotted eighth
}
export const loadedFor = name => STYLES[name].uses.every(s => loaded[s]);
export const recordStream = () => recordTap.stream;

// Plays a session back as a song: one bar per slice of the session, then the cadence. Calls done at the end.
export function playSong(bars, done) {
  state.cadence = []; state.final = false; state.energy = 0; state.waiting = false;
  state.section = null; state.bar = 0; state.key = 0; state.sectionsInKey = 0;
  state.script = { bars: [{ level: 0, minor: false }, ...bars], done };
  state.step = Math.ceil(state.step / 16) * 16; // start on a bar line
}

export function hear(event) {
  if (state.script) return; // a song is playing; the live session waits
  switch (event.kind) {
    case "prompt": state.working = true; state.waiting = false; state.cadence = []; state.energy = Math.max(state.energy, 1); break;
    case "tool": state.working = true; state.waiting = false; state.energy += 1; break;
    case "fail": state.working = true; state.minorBars = 4; state.energy += 2; break;
    case "done": if (state.working && !state.cadence.length) state.cadence = CADENCE(state.key); state.waiting = false; break;
    case "waiting": state.waiting = true; break;
  }
}
