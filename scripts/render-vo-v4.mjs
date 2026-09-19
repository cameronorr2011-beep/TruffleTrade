// v4 VO assembly: prefers ElevenLabs files (vo-el-l1.mp3 … vo-el-l7.mp3)
// that the user drops into dist-video; falls back to SAPI David per line.
// Writes measured timings to vo-v4-timings.json.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import ffmpegPath from "ffmpeg-static";

const OUT = path.join(import.meta.dirname, "..", "dist-video");
fs.mkdirSync(OUT, { recursive: true });

const LINES = [
  { id: "l1", text: "Every chart hides an argument." },
  { id: "l2", text: "Most tools hand you one opinion. One model. One blind spot." },
  { id: "l3", text: "TruffleTrade sends nine rival analysts at the same chart." },
  { id: "l4", text: "Then a red team tears the thesis apart — line by line." },
  { id: "l5", text: "If the evidence is thin, it refuses to guess." },
  { id: "l6", text: "And it remembers every call it ever made. The misses too." },
  { id: "l7", text: "TruffleTrade. See every side. Then decide." },
];

function durationOf(file) {
  // ffprobe first, ffmpeg-parse fallback
  try {
    const ffprobePath = ffmpegPath.replace(/ffmpeg(\.exe)?$/, "ffprobe$1");
    const j = JSON.parse(execFileSync(ffprobePath, ["-v", "quiet", "-print_format", "json", "-show_format", file], { stdio: ["ignore", "pipe", "ignore"] }).toString());
    const d = parseFloat(j.format?.duration);
    if (Number.isFinite(d)) return d;
  } catch { /* fall through */ }
  try {
    execFileSync(ffmpegPath, ["-i", file, "-f", "null", "NUL"], { stdio: ["ignore", "ignore", "pipe"] });
  } catch (e) {
    const m = String(e.stderr ?? "").match(/time=(\d+):(\d+):(\d+\.\d+)/);
    if (m) return +m[1] * 3600 + +m[2] * 60 + +m[3];
  }
  return 2;
}

// 1) collect ElevenLabs files if present
const el = {};
for (const l of LINES) {
  const f = path.join(OUT, `vo-el-${l.id}.mp3`);
  if (fs.existsSync(f)) el[l.id] = f;
}
const usingEL = Object.keys(el).length === LINES.length;
console.log(usingEL ? "ElevenLabs set complete — using your files." : `ElevenLabs files found: ${Object.keys(el).length}/7 — filling gaps with SAPI.`);

// 2) SAPI fallback for missing lines
const missing = LINES.filter((l) => !el[l.id]);
if (missing.length) {
  const psLines = missing.map((l) => {
    const wav = path.join(OUT, `vo-${l.id}.wav`).replace(/'/g, "''");
    return `$s = New-Object System.Speech.Synthesis.SpeechSynthesizer;
$s.SelectVoice('Microsoft David Desktop');
$fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(48000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono);
$s.SetOutputToWaveFile('${wav}', $fmt);
$s.Rate = -3;
$s.Speak('${l.text.replace(/'/g, "''")}');
$s.Dispose();`;
  });
  const ps = `Add-Type -AssemblyName System.Speech
${psLines.join("\n")}
Write-Output "VO-DONE"`;
  const ps1 = path.join(OUT, "gen-vo-v4.ps1");
  fs.writeFileSync(ps1, ps);
  execFileSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps1], { stdio: "inherit" });
}

// 3) normalize every line to 48k stereo wav + measure
const timings = [];
for (const l of LINES) {
  const src = el[l.id] ?? path.join(OUT, `vo-${l.id}.wav`);
  const norm = path.join(OUT, `v4-${l.id}.wav`);
  execFileSync(ffmpegPath, ["-y", "-i", src, "-ac", "2", "-ar", "48000", "-af", "loudnorm=I=-16:TP=-1.5", norm], { stdio: ["ignore", "ignore", "ignore"] });
  const dur = durationOf(norm);
  timings.push({ id: l.id, text: l.text, dur: +dur.toFixed(2), file: norm, source: el[l.id] ? "elevenlabs" : "sapi" });
  console.log(`${l.id}: ${dur.toFixed(2)}s (${el[l.id] ? "EL" : "SAPI"}) — "${l.text}"`);
}

fs.writeFileSync(path.join(OUT, "vo-v4-timings.json"), JSON.stringify(timings, null, 2));
const total = timings.reduce((a, t) => a + t.dur, 0);
console.log(`total speech: ${total.toFixed(1)}s — vo-v4-timings.json written`);
