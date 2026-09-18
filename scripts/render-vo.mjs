// Voiceover via Windows SAPI (Microsoft David Desktop, en-US male).
// Prosody tuned for a low, calm documentary read; per-line WAVs + timings.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import ffmpegPath from "ffmpeg-static";

const OUT_DIR = path.join(import.meta.dirname, "..", "dist-video");
fs.mkdirSync(OUT_DIR, { recursive: true });

const LINES = [
  { id: "l1", text: "Every chart hides an argument." },
  { id: "l2", text: "Nine analysts argue over it. A red team tries to tear it apart." },
  { id: "l3", text: "It refuses to guess." },
  { id: "l4", text: "And it keeps score. Every call. The wrong ones too." },
  { id: "l5", text: "TruffleTrade. See every side. Then decide." },
];

// SSML: rate -12%, pitch -8% => deliberate, low, premium documentary read.
function ssml(text) {
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">` +
    `<voice name="Microsoft David Desktop">` +
    `<prosody rate="-14%" pitch="-8%">${text}</prosody>` +
    `</voice></speak>`;
}

const psLines = LINES.map((l) => {
  const wav = path.join(OUT_DIR, `vo-${l.id}.wav`).replace(/'/g, "''");
  const ssmlPath = path.join(OUT_DIR, `vo-${l.id}.ssml`).replace(/'/g, "''");
  return `$null = [System.IO.File]::WriteAllText('${ssmlPath}', @'
${ssml(l.text)}
'@);
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer;
$s.SelectVoice('Microsoft David Desktop');
$fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(48000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono);
$s.SetOutputToWaveFile('${wav}', $fmt);
$s.SpeakSsml(([System.IO.File]::ReadAllText('${ssmlPath}')));
$s.Dispose();`;
});
const psScript = `Add-Type -AssemblyName System.Speech
${psLines.join("\n")}
Write-Output "VO-DONE"`;
fs.writeFileSync(path.join(OUT_DIR, "gen-vo.ps1"), psScript);

execFileSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(OUT_DIR, "gen-vo.ps1")], { stdio: "inherit" });

const timings = [];
for (const l of LINES) {
  const wav = path.join(OUT_DIR, `vo-${l.id}.wav`);
  // ffprobe-style duration via ffprobe if present, else ffmpeg stderr
  let dur = 2;
  try {
    const ffprobePath = ffmpegPath.replace(/ffmpeg(\.exe)?$/, "ffprobe$1");
    const j = JSON.parse(execFileSync(ffprobePath, ["-v", "quiet", "-print_format", "json", "-show_format", wav], { stdio: ["ignore", "pipe", "ignore"] }).toString());
    dur = parseFloat(j.format.duration);
  } catch {
    try {
      execFileSync(ffmpegPath, ["-i", wav, "-f", "null", "NUL"], { stdio: ["ignore", "ignore", "pipe"] });
    } catch (e) {
      const m = String(e.stderr ?? "").match(/time=(\d+):(\d+):(\d+\.\d+)/);
      if (m) dur = +m[1] * 3600 + +m[2] * 60 + +m[3];
    }
  }
  timings.push({ ...l, dur });
  console.log(`${l.id}: ${dur.toFixed(2)}s — "${l.text}"`);
}
fs.writeFileSync(path.join(OUT_DIR, "vo-timings.json"), JSON.stringify(timings, null, 2));
console.log("vo-timings.json written");
