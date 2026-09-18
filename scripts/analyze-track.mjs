// Analyze the NCS track: decode to mono PCM, onset-energy envelope, best
// 27s window (highest sustained energy), tempo estimate, beat grid.
// Output: dist-video/track-analysis.json
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import ffmpegPath from "ffmpeg-static";

const OUT_DIR = path.join(import.meta.dirname, "..", "dist-video");
fs.mkdirSync(OUT_DIR, { recursive: true });
const SRC = "C:/Users/Cameron/Downloads/gabriawll - Recall [NCS Release].mp3";
const RAW = path.join(OUT_DIR, "track.pcm");

// decode to 48k mono s16le
execFileSync(ffmpegPath, ["-y", "-i", SRC, "-ac", "1", "-ar", "48000", "-f", "s16le", RAW], { stdio: ["ignore", "ignore", "ignore"] });
const pcm = fs.readFileSync(RAW);
const n = pcm.length / 2;
const sig = new Float32Array(n);
for (let i = 0; i < n; i++) sig[i] = pcm.readInt16LE(i * 2) / 32768;
const SR = 48000;
console.log(`decoded ${(n / SR).toFixed(1)}s`);

// onset envelope: RMS per 10ms hop
const HOP = Math.floor(SR / 100);
const envLen = Math.floor(n / HOP);
const env = new Float32Array(envLen);
for (let i = 0; i < envLen; i++) {
  let s = 0;
  for (let j = 0; j < HOP; j++) { const v = sig[i * HOP + j]; s += v * v; }
  env[i] = Math.sqrt(s / HOP);
}
// spectral-flux-ish: positive difference
const flux = new Float32Array(envLen);
for (let i = 1; i < envLen; i++) flux[i] = Math.max(0, env[i] - env[i - 1]);

// best 27s window: maximize sum of flux (sustained energy), 100ms resolution
const WIN = 2700; // 27s * 100 hops/s
let best = 0, bestStart = 0;
let run = 0;
for (let i = 0; i < WIN; i++) run += flux[i];
best = run;
for (let i = WIN; i < envLen; i++) {
  run += flux[i] - flux[i - WIN];
  if (run > best) { best = run; bestStart = i - WIN; }
}
const startSec = bestStart / 100;
console.log(`best window starts at ${startSec.toFixed(2)}s`);

// tempo estimate: autocorrelation of flux within the window (60-180 BPM)
const w = flux.slice(bestStart, bestStart + WIN);
const mean = w.reduce((a, b) => a + b, 0) / w.length;
const centered = w.map((v) => v - mean);
let bestLag = 0, bestCorr = -Infinity;
for (let lag = Math.floor(100 * (60 / 180)); lag <= Math.ceil(100 * (60 / 60)); lag++) {
  let c = 0;
  for (let i = 0; i + lag < centered.length; i++) c += centered[i] * centered[i + lag];
  c /= centered.length - lag;
  if (c > bestCorr) { bestCorr = c; bestLag = lag; }
}
const bpm = 6000 / bestLag;
console.log(`estimated BPM: ${bpm.toFixed(2)}`);

// beat grid anchored on the strongest onset in the window
let peakIdx = 0, peakVal = -1;
for (let i = 0; i < WIN; i++) if (flux[bestStart + i] > peakVal) { peakVal = flux[bestStart + i]; peakIdx = i; }
const beatSec = 60 / bpm;
let firstBeat = (bestStart + peakIdx) / 100;
// walk the grid backwards to the window start so the whole 27s is covered
while (firstBeat - beatSec >= startSec) firstBeat -= beatSec;
const grid = [];
for (let t = firstBeat; t < startSec + 27; t += beatSec) if (t >= startSec) grid.push(+(t - startSec).toFixed(3));
console.log(`beat grid: ${grid.length} beats, first at ${grid[0]}s`);

fs.writeFileSync(
  path.join(OUT_DIR, "track-analysis.json"),
  JSON.stringify({ startSec, bpm, beatSec, grid, src: SRC }, null, 2),
);
console.log("analysis written");
