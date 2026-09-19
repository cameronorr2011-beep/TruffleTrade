// QA the mixed v6-audio.wav: per-second RMS (pump check), integrated loudness, peak
import fs from "node:fs";
const SR = 48000;
const wav = fs.readFileSync("dist-video/v6-audio.wav");
const N = (wav.length - 44) >> 2;
const dur = N / SR;
let peak = 0;
const secRms = [];
for (let s = 0; s < Math.floor(dur); s++) {
  let sum = 0, cnt = 0;
  for (let i = s * SR; i < (s + 1) * SR && i < N; i++) {
    const l = wav.readInt16LE(44 + i * 4) / 32768, r = wav.readInt16LE(46 + i * 4) / 32768;
    const m = (l * l + r * r) / 2; sum += m; cnt++;
    const a = Math.max(Math.abs(l), Math.abs(r)); if (a > peak) peak = a;
  }
  secRms.push(Math.sqrt(sum / cnt));
}
console.log(`duration ${dur.toFixed(1)}s  peak ${peak.toFixed(3)} (${(20*Math.log10(peak)).toFixed(2)} dBFS)`);
// integrated loudness approximation: -0.691 + 10*log10(mean square) over 400ms blocks
const blocks = [];
const B = Math.floor(SR * 0.4);
for (let b = 0; b + B < N; b += B) {
  let sum = 0;
  for (let i = b; i < b + B; i++) { const l = wav.readInt16LE(44 + i * 4) / 32768, r = wav.readInt16LE(46 + i * 4) / 32768; sum += (l*l + r*r)/2; }
  blocks.push(sum / B);
}
const meanSq = blocks.reduce((a,b)=>a+b,0)/blocks.length;
const lufs = -0.691 + 10 * Math.log10(meanSq);
console.log(`integrated loudness ≈ ${lufs.toFixed(1)} LUFS`);
console.log("\nper-second RMS (VO windows marked):");
const at = { l1:1.0, l2:2.74, l3:7.65, l4:11.15, l5:15.24, l6:18.42, l7:22.54 };
const voEnd = { l1:1.59, l2:6.5, l3:10.0, l4:14.09, l5:17.27, l6:21.39, l7:25.78 };
for (let s = 0; s < secRms.length; s++) {
  const inVO = Object.entries(at).find(([k,v]) => s >= Math.floor(v) && s <= Math.ceil(voEnd[k]));
  console.log(`${String(s).padStart(2)} ${"█".repeat(Math.round(secRms[s]*180)).padEnd(30)} ${secRms[s].toFixed(3)} ${inVO ? "VO" : ""}`);
}
