// Split the ElevenLabs VO master (28.45s) into per-line WAVs at the
// measured silence boundaries, then write vo-v4-timings.json for the
// v4 renderer. Line text order matches the 7-line script.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import ffmpegPath from "ffmpeg-static";

const OUT = path.join(import.meta.dirname, "..", "dist-video");
const MASTER = path.join(OUT, "vo-el-full.mp3");

// Speech segments = regions between silences (from silencedetect -30dB/0.3s).
// Boundaries merged from the detect pass:
const SEGMENTS = [
  [0.00, 0.59],   // l1 "Every chart hides an argument."
  [1.11, 1.94],   // l2a
  [3.00, 4.87],   // l2b  (l2 spans 1.11-4.87 with internal pause)
  [5.65, 6.04],   // l3a
  [6.91, 8.00],   // l3b  (l3 spans 5.65-8.00)
  [9.22, 12.16],  // l4   "Then a red team tears the thesis apart..."
  [13.43, 15.46], // l5   "If the evidence is thin..."
  [16.30, 17.03], // l6a
  [18.26, 19.27], // l6b  (l6 spans 16.30-19.27)
  [19.93, 20.78], // l7a
  [21.55, 23.17], // l7b  (l7 spans 19.93-23.17)
];
// Merge into the 7 logical lines (pauses inside a line stay part of it):
const LINES = [
  { id: "l1", seg: [0] },
  { id: "l2", seg: [1, 2] },
  { id: "l3", seg: [3, 4] },
  { id: "l4", seg: [5] },
  { id: "l5", seg: [6] },
  { id: "l6", seg: [7, 8] },
  { id: "l7", seg: [9, 10] },
];
const TEXT = {
  l1: "Every chart hides an argument.",
  l2: "Most tools hand you one opinion. One model. One blind spot.",
  l3: "TruffleTrade sends nine rival analysts at the same chart.",
  l4: "Then a red team tears the thesis apart — line by line.",
  l5: "If the evidence is thin, it refuses to guess.",
  l6: "And it remembers every call it ever made. The misses too.",
  l7: "TruffleTrade. See every side. Then decide.",
};

const timings = [];
for (const line of LINES) {
  const [a, b] = [SEGMENTS[line.seg[0]][0], SEGMENTS[line.seg[line.seg.length - 1]][1]];
  const dur = b - a;
  const out = path.join(OUT, `v4-${line.id}.wav`);
  execFileSync(ffmpegPath, [
    "-y", "-i", MASTER, "-ss", String(a), "-t", String(dur),
    "-ac", "2", "-ar", "48000", "-af", "loudnorm=I=-16:TP=-1.5", out,
  ], { stdio: ["ignore", "ignore", "ignore"] });
  timings.push({ id: line.id, text: TEXT[line.id], dur: +dur.toFixed(2), file: out, source: "elevenlabs" });
  console.log(`${line.id}: ${dur.toFixed(2)}s — "${TEXT[line.id]}"`);
}
fs.writeFileSync(path.join(OUT, "vo-v4-timings.json"), JSON.stringify(timings, null, 2));
console.log(`total speech: ${timings.reduce((a, t) => a + t.dur, 0).toFixed(1)}s`);
