// Original ODESZA-"A Moment Apart"-style score for the TruffleTrade Short.
// Warm plucked arpeggios with echoes, lush detuned pads, soft four-on-floor
// kick, sub roots, offbeat shakers, sidechain pumping — synthesized from raw
// waveforms (100% original, no samples). Muxed onto the existing video master.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import ffmpegPath from "ffmpeg-static";

const SR = 48000, DUR = 30, N = SR * DUR;
const OUT_DIR = path.join(import.meta.dirname, "..", "dist-video");
const L = new Float32Array(N), R = new Float32Array(N);

let seed = 20260918;
const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;

const BPM = 115, BEAT = 60 / BPM, BAR = BEAT * 4;

// Chords (D — A — Bm — G, warm and open): [bass, root, fifth, color tone]
const CHORDS = [
  [73.42, 146.83, 220.0, 293.66, 369.99],   // D2 D3 A3 D4 F#4
  [55.0, 110.0, 164.81, 220.0, 329.63],     // A1 A2 E3 A3 E4
  [61.74, 123.47, 185.0, 246.94, 369.99],   // B1 B2 F#3 B3 F#4
  [49.0, 98.0, 146.83, 196.0, 293.66],      // G1 G2 D3 G3 D4
];

function add(t0, dur, gen, gain, pan = 0) {
  const s0 = Math.max(0, Math.floor(t0 * SR)), n = Math.min(N - s0, Math.floor(dur * SR));
  for (let i = 0; i < n; i++) {
    const v = gen(i / SR, i / n) * gain;
    L[s0 + i] += v * (1 - Math.max(0, pan)); R[s0 + i] += v * (1 + Math.min(0, pan));
  }
}

// gentle kick (soft attack transient, low tail) — four on the floor, never aggressive
const kick = (t) => Math.sin(2 * Math.PI * (42 + 90 * Math.exp(-t * 28)) * t) * Math.exp(-t * 10);
// warm pluck: sine + soft octave, exponential decay, tiny detune shimmer
const pluck = (t, f) => (Math.sin(2 * Math.PI * f * t) + 0.35 * Math.sin(2 * Math.PI * f * 2 * t) + 0.12 * Math.sin(2 * Math.PI * f * 2.003 * t)) * Math.exp(-t * 5.2);
// pad voice: slow attack, chorus via detune pairs
const padVoice = (t, f, a) => {
  const atk = Math.min(1, t / 0.9);
  const vib = 1 + 0.0016 * Math.sin(2 * Math.PI * 0.7 * t);
  return atk * a * 0.5 * (Math.sin(2 * Math.PI * f * vib * t) + Math.sin(2 * Math.PI * f * 1.004 * t) + 0.4 * Math.sin(2 * Math.PI * f * 0.997 * t));
};
const shaker = (t) => ((rnd() * 2 - 1)) * Math.exp(-t * 60) * 0.16;
const swell = (t, p) => Math.sin(p * Math.PI) * (Math.sin(2 * Math.PI * 220 * t) * 0.3 + Math.sin(2 * Math.PI * 440 * t) * 0.15);
const click = (t) => ((rnd() * 2 - 1)) * Math.exp(-t * 160) * 0.5;

// ---- arrangement (sync points match the video timeline) ----
// 0.0-4.0  cold open: sparse plucks + pad swell (chart draws)
// 4.0      kick enters, full arpeggio (panels)
// 13.3     minor-weight: pad thickens (ledger)
// 18.3     lift (terms cards)
// 22.0     fullest moment
// 25.0     everything falls away: pad + lone pluck echo (silence outro)
// 29.0-30  fade to zero
const hits = [4.0, 8.7, 13.3, 18.3, 22.0].map((s) => ({ t: s, done: false }));

for (let bar = 0; bar * BAR < DUR - 0.1; bar++) {
  const t0 = bar * BAR;
  const ch = CHORDS[bar % 4];

  // pad: from the first bar, but ducks out after 25s
  if (t0 < 25.5) {
    for (let v = 1; v < ch.length; v++) {
      const f = ch[v];
      add(t0, Math.min(BAR + 0.4, DUR - t0), (t) => padVoice(t, f, v === 1 ? 0.5 : 0.36), 0.16);
    }
  }

  // pluck arpeggio: 8 eighth notes per bar; sparse (2/bar) in the first two bars and after 25s
  const sparse = bar < 2 || t0 >= 25;
  const pattern = sparse ? [0, 4] : [0, 1, 2, 3, 4, 5, 6, 7];
  for (const step of pattern) {
    const t = t0 + step * (BEAT / 2);
    if (t >= DUR - 0.3) continue;
    const tones = ch.slice(2);
    const f = tones[(step + bar) % tones.length] * (step % 4 === 3 ? 2 : 1);
    const g = 0.34 + 0.1 * rnd();
    add(t, 0.7, (tt) => pluck(tt, f), g, ((step % 2) * 2 - 1) * 0.25);
    // delay echo (dotted-8th), characteristic dreamy trail
    add(t + BEAT * 0.75, 0.6, (tt) => pluck(tt, f), g * 0.42, ((step % 2) * 2 - 1) * -0.2);
    add(t + BEAT * 1.5, 0.5, (tt) => pluck(tt, f), g * 0.18);
  }

  // kick: enters at 4.0, four-on-floor until 25s, soft
  if (t0 >= 4.0 && t0 < 25.0) {
    for (let b = 0; b < 4; b++) {
      const t = t0 + b * BEAT;
      if (t < 24.9) add(t, 0.5, kick, 0.55);
    }
  }

  // sub roots on beats 1 & 3 while the groove runs
  if (t0 >= 4.0 && t0 < 25.0) {
    for (const b of [0, 2]) {
      add(t0 + b * BEAT, BEAT * 1.6, (t) => Math.sin(2 * Math.PI * ch[0] * t) * Math.exp(-t * 2.4), 0.3);
    }
  }

  // shakers: offbeat 8ths, only while the groove runs
  if (t0 >= 6.0 && t0 < 25.0) {
    for (let s = 1; s < 8; s += 2) add(t0 + s * (BEAT / 2), 0.12, shaker, 0.5);
  }
}

// warm accents on the visual hit moments (pad swell + soft low bloom)
for (const f of [120, 135, 150, 165, 180, 195, 210, 225, 240, 255, 300, 330, 360, 390, 429, 489, 519, 555, 624, 690]) {
  const t = f / 30;
  add(t, 1.4, (tt, p) => swell(tt, p) * Math.exp(-p * 2), 0.12);
}

// door click at the drop-out, then one last distant pluck for the logo
add(25.02, 0.06, click, 0.6);
add(26.5, 1.2, (t) => pluck(t, 293.66), 0.22);
add(27.25, 1.0, (t) => pluck(t, 220.0), 0.15);

// sidechain: duck the whole mix ~14% after each kick while the groove runs
for (let i = 0; i < N; i++) {
  const t = i / SR;
  if (t >= 4.0 && t < 25.0) {
    const since = (t - 4.0) % BEAT;
    const duck = 0.86 + 0.14 * Math.min(1, since / 0.22);
    L[i] *= duck; R[i] *= duck;
  }
}

// master: soft clip + intro/outro fades
for (let i = 0; i < N; i++) {
  const t = i / SR;
  let l = Math.tanh(L[i] * 1.25), r = Math.tanh(R[i] * 1.25);
  if (t < 0.4) { l *= t / 0.4; r *= t / 0.4; }
  if (t > 28.6) { const g = Math.max(0, 1 - (t - 28.6) / 1.4); l *= g * g; r *= g * g; }
  L[i] = l; R[i] = r;
}

// write WAV (16-bit stereo)
const wav = Buffer.alloc(44 + N * 4);
wav.write("RIFF", 0); wav.writeUInt32LE(36 + N * 4, 4); wav.write("WAVE", 8);
wav.write("fmt ", 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22);
wav.writeUInt32LE(SR, 24); wav.writeUInt32LE(SR * 4, 28); wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34);
wav.write("data", 36); wav.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) {
  wav.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(L[i] * 32767))), 44 + i * 4);
  wav.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(R[i] * 32767))), 46 + i * 4);
}
const wavPath = path.join(OUT_DIR, "audio-odesza.wav");
fs.writeFileSync(wavPath, wav);
console.log("score written:", wavPath);

// ---- mux onto the existing master (video stream is copied, not re-rendered) ----
const master = path.join(OUT_DIR, "truffletrade-short.mp4");
const withScore = path.join(OUT_DIR, "truffletrade-short-odesza.mp4");
execFileSync(ffmpegPath, [
  "-y", "-i", master, "-i", wavPath,
  "-map", "0:v:0", "-map", "1:a:0",
  "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart",
  withScore,
], { stdio: ["ignore", "ignore", "inherit"] });
console.log("muxed:", withScore);
