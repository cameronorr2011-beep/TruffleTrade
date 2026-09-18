// TruffleTrade — "MY HEDGE FUND IS ONE APP" 30s Short renderer.
// Every frame is drawn programmatically (no assets, no stock footage):
//   720x1280 @ 30fps = 900 frames, piped as raw RGB into ffmpeg.
// Audio is synthesized from waveforms (cowbell, kick, sub, hats, noise bed,
// sidechain pumping) and mixed into the same encode.
// Output: dist-video/truffletrade-short.mp4 (+ 6 preview stills).
//
// Timeline (seconds):
//   0.0-4.0   cold open: candle chart draws itself, caption slams
//   4.0-8.7   nine analyst panels snap on, one bass hit each
//   8.7-13.3  RED TEAM crosses the thesis out in slow-mo
//   13.3-18.3 the ledger: past predictions graded, including the misses
//   18.3-25.0 terms as flexes: ~$1/month, no account, runs on your machine
//   25.0-30.0 music cuts dead; breathing logo; end card
import fs from "node:fs";
import path from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import ffmpegPath from "ffmpeg-static";
import { spawn, execFileSync } from "node:child_process";

const W = 720, H = 1280, FPS = 30, DUR = 30, FRAMES = DUR * FPS;
const OUT_DIR = path.join(import.meta.dirname, "..", "dist-video");
fs.mkdirSync(OUT_DIR, { recursive: true });

// ---------- deterministic randomness ----------
let seed = 1337;
const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;

// ---------- palette ----------
const INK = "#e9efe6", GREEN = "#3ddc7a", GREEN_DIM = "#1f7a4a", RED = "#ff4d4d",
  GREY = "#7a857c", BLACK = "#050705", PANEL_BG = "#0b110c";

// ---------- text helpers ----------
function setFont(ctx, size, weight = "bold", mono = true) {
  ctx.font = `${weight} ${size}px ${mono ? '"Courier New", monospace' : '"Arial", sans-serif'}`;
}
function tracked(ctx, text, x, y, spacing) {
  let cx = x;
  for (const ch of text) { ctx.fillText(ch, cx, y); cx += ctx.measureText(ch).width + spacing; }
  return cx - spacing;
}
function trackedWidth(ctx, text, spacing) {
  let w = 0;
  for (const ch of text) w += ctx.measureText(ch).width + spacing;
  return w - spacing;
}
function centerTracked(ctx, text, y, spacing, size, color, weight = "bold") {
  setFont(ctx, size, weight);
  ctx.fillStyle = color;
  tracked(ctx, text, (W - trackedWidth(ctx, text, spacing)) / 2, y, spacing);
}

// ---------- easing ----------
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const easeOutCubic = (v) => 1 - Math.pow(1 - clamp01(v), 3);
const easeOutBack = (v) => { const c = 1.70158; const x = clamp01(v) - 1; return 1 + (c + 1) * x * x * x + c * x * x; };

// ---------- candle chart (draws progressively) ----------
const CANDLES = (() => {
  const arr = []; let price = 140; seed = 90210;
  for (let i = 0; i < 60; i++) {
    const drift = Math.sin(i / 9) * 1.6 + (rnd() - 0.42) * 4.2;
    const open = price, close = price + drift;
    const high = Math.max(open, close) + rnd() * 3.2;
    const low = Math.min(open, close) - rnd() * 3.2;
    arr.push({ open, close, high, low }); price = close;
  }
  return arr;
})();
function drawChart(ctx, x, y, w, h, progress, glow) {
  const visible = Math.max(2, Math.floor(CANDLES.length * progress));
  const min = Math.min(...CANDLES.map(c => c.low)), max = Math.max(...CANDLES.map(c => c.high));
  const cy = (v) => y + h - ((v - min) / (max - min)) * h;
  const cw = w / CANDLES.length;
  ctx.save();
  ctx.strokeStyle = GREEN_DIM; ctx.lineWidth = 1;
  for (let g = 0; g <= 4; g++) { const gy = y + (h / 4) * g; ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x + w, gy); ctx.stroke(); }
  for (let i = 0; i < visible; i++) {
    const c = CANDLES[i], up = c.close >= c.open, col = up ? GREEN : RED, cx = x + cw * i + cw / 2;
    if (glow) { ctx.shadowColor = col; ctx.shadowBlur = 10; }
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(cx, cy(c.high)); ctx.lineTo(cx, cy(c.low)); ctx.stroke();
    const top = cy(Math.max(c.open, c.close)), bot = cy(Math.min(c.open, c.close));
    ctx.fillRect(cx - cw * 0.3, top, cw * 0.6, Math.max(2, bot - top));
    ctx.shadowBlur = 0;
  }
  ctx.restore();
}

// ---------- analyst panels ----------
const ANALYSTS = [
  ["FUNDAMENTALS", "F"], ["VALUATION", "V"], ["TECHNICALS", "T"],
  ["MACRO", "M"], ["COMPETITION", "C"], ["NEWS", "N"],
  ["PATTERNS", "P"], ["SCENARIO", "S"], ["BACKTEST", "B"],
];
function drawPanels(ctx, shown, appearFrame, frame) {
  const gx = 396, gy = 372, gw = 288, gh = 300, cols = 3, pw = (gw - 16) / 3, ph = (gh - 16) / 3;
  for (let i = 0; i < shown; i++) {
    const [name, letter] = ANALYSTS[i];
    const col = i % 3, row = Math.floor(i / 3);
    const px = gx + col * (pw + 8), py = gy + row * (ph + 8);
    const since = frame - (appearFrame + i * 15);
    let scale = 1, alpha = 1;
    if (since < 0) continue;
    if (since < 8) { scale = 0.7 + 0.3 * easeOutBack(since / 8); alpha = easeOutCubic(since / 5); }
    ctx.save(); ctx.globalAlpha = alpha;
    ctx.translate(px + pw / 2, py + ph / 2); ctx.scale(scale, scale); ctx.translate(-(px + pw / 2), -(py + ph / 2));
    ctx.fillStyle = PANEL_BG; ctx.strokeStyle = since < 8 ? GREEN : GREEN_DIM; ctx.lineWidth = since < 8 ? 2.5 : 1.2;
    ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 10); ctx.fill(); ctx.stroke();
    ctx.fillStyle = GREEN; setFont(ctx, 26, "bold"); ctx.textAlign = "center";
    ctx.fillText(letter, px + pw / 2, py + ph / 2 + 2);
    setFont(ctx, 8.5, "bold"); ctx.fillStyle = GREY;
    ctx.fillText(name, px + pw / 2, py + ph - 9);
    ctx.textAlign = "left"; ctx.restore();
  }
  if (shown < 9) {
    const [name, letter] = ANALYSTS[shown];
    const col = shown % 3, row = Math.floor(shown / 3);
    const px = gx + col * (pw + 8), py = gy + row * (ph + 8);
    ctx.save(); ctx.globalAlpha = 0.35; ctx.setLineDash([4, 4]);
    ctx.strokeStyle = GREY; ctx.fillStyle = PANEL_BG;
    ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 10); ctx.fill(); ctx.stroke();
    ctx.fillStyle = GREY; setFont(ctx, 26, "bold"); ctx.textAlign = "center";
    ctx.fillText(letter, px + pw / 2, py + ph / 2 + 2); ctx.textAlign = "left";
    ctx.restore();
  }
}

// ---------- overlays (pre-rendered) ----------
function makeNoiseTile() {
  const c = createCanvas(256, 256), x = c.getContext("2d");
  const img = x.createImageData(256, 256);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.floor(rnd() * 255);
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 26;
  }
  x.putImageData(img, 0, 0); return c;
}
const NOISE = Array.from({ length: 10 }, makeNoiseTile);
const SCANLINES = (() => {
  const c = createCanvas(W, H), x = c.getContext("2d");
  x.fillStyle = "rgba(0,0,0,0.09)";
  for (let yy = 0; yy < H; yy += 4) x.fillRect(0, yy, W, 2);
  return c;
})();
const VIGNETTE = (() => {
  const c = createCanvas(W, H), x = c.getContext("2d");
  const g = x.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.72);
  g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,0.55)");
  x.fillStyle = g; x.fillRect(0, 0, W, H); return c;
})();
function applyOverlays(ctx, frame) {
  const tile = NOISE[frame % NOISE.length];
  const ox = -Math.floor(rnd() * 128), oy = -Math.floor(rnd() * 128);
  for (let ty = oy; ty < H; ty += 256) for (let tx = ox; tx < W; tx += 256) ctx.drawImage(tile, tx, ty);
  ctx.drawImage(SCANLINES, 0, 0);
  ctx.drawImage(VIGNETTE, 0, 0);
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, 44); ctx.fillRect(0, H - 44, W, 44); // letterbox
}
function roomGlow(ctx, cx, cy, r, color, a) {
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, color.replace("A", String(a))); g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}
function slamCaption(ctx, frame, hitFrame, text, y, size, color, sub) {
  if (frame < hitFrame) return;
  const since = frame - hitFrame;
  const pop = since < 7 ? 1 + 0.32 * (1 - since / 7) : 1;
  const alpha = since < 3 ? since / 3 : 1;
  ctx.save(); ctx.globalAlpha = alpha;
  ctx.translate(W / 2, y); ctx.scale(pop, pop); ctx.translate(-W / 2, -y);
  centerTracked(ctx, text, y, size * 0.14, size, color);
  if (sub) { setFont(ctx, 15, "bold"); ctx.fillStyle = GREY; ctx.textAlign = "center";
    ctx.fillText(sub, W / 2, y + size * 0.75); ctx.textAlign = "left"; }
  ctx.restore();
}
function strikeThrough(ctx, x1, x2, y, progress) {
  ctx.strokeStyle = RED; ctx.lineWidth = 3.5; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x1 + (x2 - x1) * progress, y); ctx.stroke();
}

// ================= SCENES =================
function scene1(ctx, frame) { // 0-119: cold open, chart draws, caption
  ctx.fillStyle = BLACK; ctx.fillRect(0, 0, W, H);
  roomGlow(ctx, W * 0.42, H * 0.42, 620, "rgba(35,120,70,A)", 0.16 + 0.02 * Math.sin(frame / 9));
  drawChart(ctx, 40, 340, 640, 420, easeOutCubic(frame / 95), true);
  ctx.fillStyle = GREY; setFont(ctx, 15, "bold");
  ctx.fillText("NVDA · 1:00 AM", 40, 320);
  ctx.fillStyle = "rgba(233,239,230,0.55)"; setFont(ctx, 13, "bold");
  ctx.fillText("LIVE CANDLES · KEYLESS DATA", 40, 790);
  slamCaption(ctx, frame, 58, "MY HEDGE FUND", 980, 52, INK);
  slamCaption(ctx, frame, 70, "IS ONE APP", 1058, 52, GREEN);
}
function scene2(ctx, frame) { // 120-259: nine panels
  ctx.fillStyle = BLACK; ctx.fillRect(0, 0, W, H);
  roomGlow(ctx, W * 0.5, H * 0.38, 660, "rgba(35,120,70,A)", 0.12);
  ctx.fillStyle = GREY; setFont(ctx, 15, "bold");
  ctx.fillText("NVDA · 1:00 AM", 40, 320);
  drawChart(ctx, 40, 340, 340, 420, 1, true);
  const shown = clamp01((frame - 120) / 135);
  drawPanels(ctx, Math.min(9, Math.floor((frame - 120) / 15) + 1), 120, frame);
  slamCaption(ctx, frame, 222, "9 ANALYSTS. 1 CHART.", 950, 44, INK);
  slamCaption(ctx, frame, 234, "0 AGREEMENT.", 1030, 44, GREEN);
  void shown;
}
function scene3(ctx, frame) { // 260-399: red team
  ctx.fillStyle = BLACK; ctx.fillRect(0, 0, W, H);
  roomGlow(ctx, W * 0.5, H * 0.4, 700, "rgba(160,30,30,A)", 0.15 + 0.03 * Math.sin(frame / 6));
  ctx.fillStyle = "rgba(20,6,6,0.6)"; ctx.fillRect(60, 240, 600, 560);
  ctx.strokeStyle = "rgba(255,77,77,0.55)"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(60, 240, 600, 560, 18); ctx.stroke();
  centerTracked(ctx, "RED TEAM", 320, 14, 46, RED);
  const claims = [
    "\"EARNINGS BEAT EXPECTATIONS\"", "\"MOMENTUM IS STRONG\"", "\"ANALYSTS ARE BULLISH\"", "\"DIP IS A GIFT\"",
  ];
  const strike = [300, 330, 360, 390];
  setFont(ctx, 24, "bold");
  claims.forEach((c, i) => {
    const since = frame - strike[i];
    const appear = clamp01(since / 8);
    const y = 400 + i * 68;
    ctx.globalAlpha = appear;
    ctx.fillStyle = INK; ctx.fillText(c, 100, y);
    ctx.globalAlpha = 1;
    if (since > 0) strikeThrough(ctx, 96, 100 + ctx.measureText(c).width + 8, y - 8, easeOutCubic(since / 26));
  });
  const verdict = frame > 372 ? clamp01((frame - 372) / 10) : 0;
  if (verdict > 0) {
    ctx.globalAlpha = verdict;
    centerTracked(ctx, "VERDICT: INSUFFICIENT EVIDENCE", 800, 4, 22, INK);
    centerTracked(ctx, "NO THESIS ISSUED", 838, 6, 26, RED);
    ctx.globalAlpha = 1;
  }
  // unbothered sip: glass rises to the silhouette between 330-390
  const sip = Math.sin(clamp01((frame - 330) / 60) * Math.PI);
  ctx.fillStyle = "rgba(233,239,230,0.14)";
  ctx.beginPath(); ctx.ellipse(580, 1052, 70, 92, 0, 0, Math.PI * 2); ctx.fill(); // head silhouette
  ctx.fillRect(510, 1120, 140, 90);
  ctx.fillStyle = "rgba(233,239,230,0.35)";
  ctx.fillRect(636, 1052 - sip * 60, 16, 46); // glass
  slamCaption(ctx, frame, 356, "IT REFUSES TO GUESS.", 972, 40, RED);
}
function scene4(ctx, frame) { // 400-549: the ledger
  ctx.fillStyle = BLACK; ctx.fillRect(0, 0, W, H);
  roomGlow(ctx, W * 0.5, H * 0.4, 640, "rgba(35,120,70,A)", 0.12);
  centerTracked(ctx, "THE LEDGER", 250, 10, 34, GREY);
  const rows = [
    ["AAPL", "PREDACTED 22 DAYS AGO", "CORRECT", GREEN, 429],
    ["TSLA", "PREDICTED 31 DAYS AGO", "WRONG", RED, 489],
    ["MSFT", "PREDICTED 12 DAYS AGO", "CORRECT", GREEN, 519],
    ["NVDA", "PREDICTED TODAY", "PENDING", GREY, 540],
  ];
  rows.forEach(([tk, when, grade, col, hit], i) => {
    const since = frame - hit; if (since < 0) return;
    const a = easeOutCubic(since / 8);
    const y = 330 + i * 120;
    ctx.save(); ctx.globalAlpha = a;
    ctx.translate(W / 2, y); const s = since < 8 ? 0.9 + 0.1 * easeOutBack(since / 8) : 1;
    ctx.scale(s, s); ctx.translate(-W / 2, -y);
    ctx.fillStyle = PANEL_BG; ctx.strokeStyle = i === 1 ? "rgba(255,77,77,0.5)" : "rgba(61,220,122,0.4)";
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(70, y - 52, 580, 96, 14); ctx.fill(); ctx.stroke();
    setFont(ctx, 30, "bold"); ctx.fillStyle = INK; ctx.fillText(tk, 100, y + 8);
    setFont(ctx, 13, "bold"); ctx.fillStyle = GREY; ctx.fillText(when, 100, y + 32);
    setFont(ctx, 22, "bold"); ctx.fillStyle = col;
    const badge = (grade === "CORRECT" ? "✓ " : grade === "WRONG" ? "✗ " : "· ") + grade;
    ctx.fillText(badge, 470, y + 8);
    ctx.restore();
  });
  slamCaption(ctx, frame, 519, "IT KEEPS SCORE", 950, 46, INK);
  slamCaption(ctx, frame, 531, "ON ITSELF", 1028, 46, GREEN);
}
function termsCard(ctx, frame, hit, line1, line2) {
  if (frame < hit) return;
  const since = frame - hit;
  const out = since > 60 ? 1 - (since - 60) / 14 : 1;
  if (out <= 0) return;
  const pop = since < 7 ? 1 + 0.3 * (1 - since / 7) : 1;
  ctx.save(); ctx.globalAlpha = out;
  ctx.translate(W / 2, 600); ctx.scale(pop, pop); ctx.translate(-W / 2, -600);
  centerTracked(ctx, line1, 585, 10, 50, INK);
  centerTracked(ctx, line2, 668, 10, 50, GREEN);
  ctx.restore();
}
function scene5(ctx, frame) { // 550-749: terms as flexes
  ctx.fillStyle = BLACK; ctx.fillRect(0, 0, W, H);
  roomGlow(ctx, W * 0.5, H * 0.45, 700, "rgba(35,120,70,A)", 0.1 + 0.02 * Math.sin(frame / 7));
  termsCard(ctx, frame, 555, "≈ $1 / MONTH", "PAID IN BITCOIN");
  termsCard(ctx, frame, 624, "NO ACCOUNT", "NO ID");
  termsCard(ctx, frame, 690, "RUNS ON YOUR MACHINE", "DATA NEVER LEAVES");
  ctx.fillStyle = GREY; setFont(ctx, 14, "bold"); ctx.textAlign = "center";
  ctx.fillText("truffletrade.vercel.app", W / 2, 1140); ctx.textAlign = "left";
}
function scene6(ctx, frame) { // 750-899: silence, logo, end card
  ctx.fillStyle = BLACK; ctx.fillRect(0, 0, W, H);
  const breathe = 1 + 0.03 * Math.sin((frame - 750) / 11);
  ctx.save(); ctx.translate(W / 2, 470); ctx.scale(breathe, breathe);
  ctx.fillStyle = PANEL_BG; ctx.strokeStyle = GREEN_DIM; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(-64, -64, 128, 128, 30); ctx.fill(); ctx.stroke();
  setFont(ctx, 64, "bold"); ctx.fillStyle = GREEN; ctx.textAlign = "center";
  ctx.fillText("T", 0, 24); ctx.restore(); ctx.textAlign = "left";
  if (frame >= 795) centerTracked(ctx, "truffletrade.", 620, 4, 46, INK);
  if (frame >= 825) centerTracked(ctx, "SEE EVERY SIDE.", 780, 8, 34, GREY);
  if (frame >= 837) centerTracked(ctx, "THEN DECIDE.", 832, 8, 34, GREEN);
  if (frame >= 855) { ctx.fillStyle = "rgba(122,133,124,0.8)"; setFont(ctx, 14, "bold"); ctx.textAlign = "center";
    ctx.fillText("18+ · analysis, not advice · truffletrade.vercel.app", W / 2, 1130); ctx.textAlign = "left"; }
}
function renderScene(ctx, frame) {
  if (frame < 120) scene1(ctx, frame);
  else if (frame < 260) scene2(ctx, frame);
  else if (frame < 400) scene3(ctx, frame);
  else if (frame < 550) scene4(ctx, frame);
  else if (frame < 750) scene5(ctx, frame);
  else scene6(ctx, frame);
}

// ================= AUDIO (48kHz stereo) =================
const SR = 48000, N = SR * DUR;
const L = new Float32Array(N), R = new Float32Array(N);
const add = (t0, dur, gen, gain, pan = 0) => {
  const s0 = Math.max(0, Math.floor(t0 * SR)), n = Math.min(N - s0, Math.floor(dur * SR));
  for (let i = 0; i < n; i++) {
    const t = i / SR, v = gen(t, i / n) * gain;
    L[s0 + i] += v * (1 - Math.max(0, pan)); R[s0 + i] += v * (1 + Math.min(0, pan));
  }
};
const kick = (t) => Math.sin(2 * Math.PI * (48 + 130 * Math.exp(-t * 34)) * t) * Math.exp(-t * 15);
const sub = (t) => Math.sin(2 * Math.PI * 55 * t) * Math.exp(-t * 4.2) * 0.9;
const cowbell = (t) => { const e = Math.exp(-t * 22); const s = Math.sin(2 * Math.PI * 540 * t) + Math.sin(2 * Math.PI * 810 * t); return s * e * 0.5; };
const hat = (t) => ((rnd() * 2 - 1)) * Math.exp(-t * 90) * 0.35;
const noiseBurst = (t) => ((rnd() * 2 - 1)) * Math.exp(-t * 30) * 0.5;
const downLift = (t, p) => Math.sin(2 * Math.PI * (140 - 220 * p) * t) * Math.sin(p * Math.PI) * 0.5;

// cowbell intro (0 - 3.2s), alternating pitch feel via gain accents
for (let i = 0; i < 8; i++) add(i * 0.4, 0.35, cowbell, i % 2 ? 0.5 : 0.75);
// groove 3.2 - 25.0s @ 128bpm
const BPM = 128, BEAT = 60 / BPM;
for (let b = 0; b * BEAT + 3.2 < 24.9; b++) {
  const t0 = 3.2 + b * BEAT;
  const accent = b % 4 === 0;
  add(t0, 0.4, kick, accent ? 1.0 : 0.8);
  if (accent) add(t0, 0.5, sub, 0.8);
  add(t0 + BEAT / 2, 0.08, hat, 0.5);
  if (b % 2 === 1) add(t0, 0.08, hat, 0.3);
}
// impact hits on visual beats (frames / FPS)
const HITS = [120, 135, 150, 165, 180, 195, 210, 225, 240, 255, 300, 330, 360, 390, 429, 489, 519, 555, 624, 690];
for (const f of HITS) { const t0 = f / FPS; add(t0, 0.5, kick, 1.05); add(t0, 0.6, sub, 0.9); add(t0, 0.25, noiseBurst, 0.5); }
// riser into the drop-out
add(24.5, 0.5, downLift, 0.9);
// door click + low thud in the silence
add(25.02, 0.05, noiseBurst, 0.8);
add(25.1, 0.3, (t) => Math.sin(2 * Math.PI * 70 * t) * Math.exp(-t * 30), 0.5);
// continuous dark bed with sidechain pumping (dips after every kick)
for (let i = 0; i < N; i++) {
  const t = i / SR;
  if (t > 3.2 && t < 25.0) {
    const beatIdx = Math.floor((t - 3.2) / BEAT);
    const sinceKick = t - (3.2 + beatIdx * BEAT);
    const duck = 0.55 + 0.45 * Math.min(1, sinceKick / 0.18);
    const brown = (rnd() * 2 - 1) * 0.02;
    const bed = brown + Math.sin(2 * Math.PI * 55 * t) * 0.022 + Math.sin(2 * Math.PI * 220 * t) * 0.006;
    L[i] += bed * duck; R[i] += bed * duck;
  }
}
// master: soft-clip + fades
for (let i = 0; i < N; i++) {
  let l = Math.tanh(L[i] * 1.1), r = Math.tanh(R[i] * 1.1);
  const t = i / SR;
  if (t < 0.15) { l *= t / 0.15; r *= t / 0.15; }
  if (t > 29.3) { const g = Math.max(0, 1 - (t - 29.3) / 0.7); l *= g; r *= g; }
  L[i] = l; R[i] = r;
}
// write wav (16-bit PCM)
const wav = Buffer.alloc(44 + N * 4);
wav.write("RIFF", 0); wav.writeUInt32LE(36 + N * 4, 4); wav.write("WAVE", 8);
wav.write("fmt ", 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22);
wav.writeUInt32LE(SR, 24); wav.writeUInt32LE(SR * 4, 28); wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34);
wav.write("data", 36); wav.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) {
  wav.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(L[i] * 32767))), 44 + i * 4);
  wav.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(R[i] * 32767))), 46 + i * 4);
}
const wavPath = path.join(OUT_DIR, "audio.wav");
fs.writeFileSync(wavPath, wav);
console.log("audio.wav written:", (fs.statSync(wavPath).size / 1e6).toFixed(1), "MB");

// ================= VIDEO ENCODE =================
const ff = spawnFfmpeg();
function spawnFfmpeg() {
  const args = [
    "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", `${W}x${H}`, "-r", String(FPS), "-i", "-",
    "-i", wavPath, "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart",
    path.join(OUT_DIR, "truffletrade-short.mp4"),
  ];
  const p = spawn(ffmpegPath, args, { stdio: ["pipe", "inherit", "inherit"] });
  p.on("exit", (code) => { if (code !== 0) process.exit(code); });
  return p;
}

const sc = createCanvas(W, H), sctx = sc.getContext("2d");
const main = createCanvas(W, H), ctx = main.getContext("2d");
const raw = Buffer.alloc(W * H * 3);

let lastHit = -99;
const hitSet = new Set([120, 135, 150, 165, 180, 195, 210, 225, 240, 255, 300, 330, 360, 390, 429, 489, 519, 555, 624, 690]);

for (let frame = 0; frame < FRAMES; frame++) {
  seed = 424242 + frame * 7919; // per-frame deterministic grain/shake
  if (hitSet.has(frame)) lastHit = frame;

  // scene on offscreen canvas
  sctx.clearRect(0, 0, W, H);
  renderScene(sctx, frame);

  // camera: punch zoom + shake decaying after each hit
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
  const sinceHit = frame - lastHit;
  const punch = sinceHit < 6 ? 1 + 0.045 * (1 - sinceHit / 6) : 1;
  const shake = sinceHit < 6 ? (1 - sinceHit / 6) * 7 : 0;
  ctx.save();
  ctx.translate(W / 2 + (rnd() - 0.5) * shake, H / 2 + (rnd() - 0.5) * shake);
  ctx.scale(punch, punch);
  ctx.translate(-W / 2, -H / 2);
  ctx.drawImage(sc, 0, 0);
  ctx.restore();

  // impact flash
  if (sinceHit < 5) {
    ctx.fillStyle = (frame >= 260 && frame < 400) ? `rgba(255,60,60,${0.22 * (1 - sinceHit / 5)})` : `rgba(220,255,230,${0.18 * (1 - sinceHit / 5)})`;
    ctx.fillRect(0, 0, W, H);
  }
  // end fade to black
  if (frame >= 880) { ctx.fillStyle = `rgba(0,0,0,${(frame - 880) / 20})`; ctx.fillRect(0, 0, W, H); }

  applyOverlays(ctx, frame);

  // push rgb24 to ffmpeg
  const img = ctx.getImageData(0, 0, W, H).data;
  let o = 0;
  for (let i = 0; i < img.length; i += 4) { raw[o++] = img[i]; raw[o++] = img[i + 1]; raw[o++] = img[i + 2]; }
  if (!ff.stdin.write(raw)) await new Promise((r) => ff.stdin.once("drain", r));
  if (frame % 90 === 0) console.log(`frame ${frame}/${FRAMES}`);
}
ff.stdin.end();
await new Promise((r) => ff.on("close", r));

// preview stills for review
for (const s of [1.5, 6.5, 11.5, 16.5, 21.5, 28.0]) {
  execFileSync(ffmpegPath, ["-y", "-ss", String(s), "-i", path.join(OUT_DIR, "truffletrade-short.mp4"),
    "-frames:v", "1", path.join(OUT_DIR, `preview-${s}s.png`)]);
}
console.log("DONE:", path.join(OUT_DIR, "truffletrade-short.mp4"));
