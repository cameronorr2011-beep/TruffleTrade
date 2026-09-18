// TruffleTrade — cinematic 27s cut for the NCS track "Recall" (gabriawll).
// 1080x1920 @ 30fps = 810 frames, every frame drawn in code:
//   - 3D-feel parallax scenes (layered depth, slow drift, camera zooms)
//   - real-people staging with NO faces: silhouettes, hands, back-of-head,
//     glasses close-up catching chart reflections
//   - zoom IN on downbeats, zoom OUT on midpoint bars, cut on bar lines
//   - persistent truffletrade. wordmark in every frame
//   - ends on NCS attribution card
// Audio: 27s excerpt from 81.96s of the song, beat grid from analyze-track.mjs.
import fs from "node:fs";
import path from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import ffmpegPath from "ffmpeg-static";
import { spawn, execFileSync } from "node:child_process";

const W = 1080, H = 1920, FPS = 30, DUR = 27, FRAMES = DUR * FPS;
const OUT_DIR = path.join(import.meta.dirname, "..", "dist-video");
fs.mkdirSync(OUT_DIR, { recursive: true });
const analysis = JSON.parse(fs.readFileSync(path.join(OUT_DIR, "track-analysis.json"), "utf8"));
const GRID = analysis.grid; // beat times (s, relative to excerpt)
const BAR = analysis.beatSec * 4;

const INK = "#eef3ec", GREEN = "#4fe08a", DIM = "#1d5c3c", RED = "#ff5252", GREY = "#8a978c", BLACK = "#04060a", NAVY = "#070c12";

let seed = 777;
const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;

// ---------- beat helpers ----------
const beatIndexAt = (t) => { let k = 0; while (k + 1 < GRID.length && GRID[k + 1] <= t) k++; return k; };
const sinceBeat = (t) => { const k = beatIndexAt(t); return t - GRID[k]; };
const beatFrac = (t) => clamp01(sinceBeat(t) / (analysis.beatSec));
const isDownbeat = (t) => beatIndexAt(t) % 4 === 0;

// ---------- easing ----------
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const easeOutCubic = (v) => 1 - Math.pow(1 - clamp01(v), 3);
const easeInOut = (v) => (v < 0.5 ? 2 * v * v : 1 - Math.pow(-2 * v + 2, 2) / 2);
const easeOutBack = (v) => { const c = 1.4; const x = clamp01(v) - 1; return 1 + (c + 1) * x * x * x + c * x * x; };

// ---------- draw helpers ----------
function setFont(ctx, size, weight = "bold", mono = true) {
  ctx.font = `${weight} ${size}px ${mono ? '"Courier New", monospace' : '"Arial", sans-serif'}`;
}
function tracked(ctx, text, x, y, sp) { let cx = x; for (const ch of text) { ctx.fillText(ch, cx, y); cx += ctx.measureText(ch).width + sp; } }
function trackedW(ctx, text, sp) { let w = 0; for (const ch of text) w += ctx.measureText(ch).width + sp; return w - sp; }
function centerTracked(ctx, text, y, sp, size, color, weight = "bold", mono = true) {
  setFont(ctx, size, weight, mono); ctx.fillStyle = color;
  tracked(ctx, text, (W - trackedW(ctx, text, sp)) / 2, y, sp);
}
// rounded rect path (napi-rs canvas has roundRect)
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }

// ---------- persistent wordmark ----------
function drawWordmark(ctx, alpha = 0.92) {
  ctx.save(); ctx.globalAlpha = alpha;
  setFont(ctx, 30, "bold", false);
  const txt = "truffle";
  const txt2 = "trade.";
  const sp = 1;
  const w1 = ctx.measureText(txt).width, w2 = ctx.measureText(txt2).width;
  const x0 = W - w1 - w2 - 44, y0 = 96;
  ctx.fillStyle = INK; ctx.fillText(txt, x0, y0);
  ctx.fillStyle = GREEN; ctx.fillText(txt2, x0 + w1, y0);
  // small mark left of the wordmark
  ctx.fillStyle = "#0c1410"; ctx.strokeStyle = DIM; ctx.lineWidth = 2;
  rr(ctx, x0 - 56, y0 - 30, 40, 40, 11); ctx.fill(); ctx.stroke();
  ctx.fillStyle = GREEN; setFont(ctx, 22, "bold");
  ctx.fillText("T", x0 - 46, y0 - 2);
  ctx.restore();
}

// ---------- cinematic backdrop (depth layers) ----------
function drawRoom(ctx, t, hue) {
  // far wall gradient
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, hue === "red" ? "#160708" : "#05080d");
  g.addColorStop(0.5, hue === "red" ? "#0c0405" : NAVY);
  g.addColorStop(1, "#020304");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // window blinds light shafts (parallax layer 1)
  ctx.save(); ctx.globalAlpha = 0.16;
  for (let i = 0; i < 7; i++) {
    const x = 90 + i * 150 + Math.sin(t * 0.21 + i) * 8;
    const grad = ctx.createLinearGradient(x, 0, x + 90, H);
    grad.addColorStop(0, hue === "red" ? "rgba(255,80,80,0.35)" : "rgba(120,190,150,0.30)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 90, 0); ctx.lineTo(x + 260, H); ctx.lineTo(x + 90, H); ctx.fill();
  }
  ctx.restore();
  // dust motes (parallax layer 2)
  ctx.save();
  for (let i = 0; i < 26; i++) {
    const px = (i * 137.5 + t * (6 + (i % 5) * 2.4)) % W;
    const py = (i * 331.7 + Math.sin(t * 0.4 + i) * 30 + t * 3) % H;
    const r = 1.2 + (i % 3);
    ctx.globalAlpha = 0.05 + 0.05 * Math.sin(t * 0.8 + i * 1.7);
    ctx.fillStyle = "#cfe8d6";
    ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

// ---------- candles (shared) ----------
function candlePath(ctx, candles, x, y, w, h, upTo, glow) {
  const vis = Math.max(2, Math.floor(candles.length * upTo));
  const min = Math.min(...candles.map(c => c.low)), max = Math.max(...candles.map(c => c.high));
  const cy = (v) => y + h - ((v - min) / (max - min)) * h;
  const cw = w / candles.length;
  for (let i = 0; i < vis; i++) {
    const c = candles[i], up = c.close >= c.open, col = up ? GREEN : RED, cx = x + cw * i + cw / 2;
    if (glow) { ctx.shadowColor = col; ctx.shadowBlur = 14; }
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx, cy(c.high)); ctx.lineTo(cx, cy(c.low)); ctx.stroke();
    const top = cy(Math.max(c.open, c.close)), bot = cy(Math.min(c.open, c.close));
    ctx.fillRect(cx - cw * 0.32, top, cw * 0.64, Math.max(2.5, bot - top));
    ctx.shadowBlur = 0;
  }
}
const CANDLES = (() => { let price = 132; seed = 4242; const arr = [];
  for (let i = 0; i < 72; i++) { const o = price, c = price + Math.sin(i / 8) * 1.8 + (rnd() - 0.42) * 4.6;
    arr.push({ open: o, close: c, high: Math.max(o, c) + rnd() * 3.4, low: Math.min(o, c) - rnd() * 3.4 }); price = c; }
  return arr; })();

// ---------- people (no faces) ----------
// desk silhouette from behind: shoulders + head, back of head only
function personFromBehind(ctx, cx, baseY, scale, rimColor, rimAlpha) {
  ctx.save();
  // rim light on shoulders/head outline
  ctx.fillStyle = "rgba(3,5,7,0.96)";
  ctx.beginPath();
  ctx.moveTo(cx - 300 * scale, baseY);
  ctx.quadraticCurveTo(cx - 260 * scale, baseY - 200 * scale, cx - 120 * scale, baseY - 230 * scale);
  ctx.quadraticCurveTo(cx - 60 * scale, baseY - 238 * scale, cx - 40 * scale, baseY - 300 * scale); // neck->head
  ctx.arc(cx, baseY - 330 * scale, 78 * scale, Math.PI * 0.95, Math.PI * 0.05); // head circle
  ctx.quadraticCurveTo(cx + 60 * scale, baseY - 238 * scale, cx + 120 * scale, baseY - 230 * scale);
  ctx.quadraticCurveTo(cx + 260 * scale, baseY - 200 * scale, cx + 300 * scale, baseY);
  ctx.closePath(); ctx.fill();
  // rim light stroke
  ctx.strokeStyle = rimColor; ctx.globalAlpha = rimAlpha; ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(cx - 300 * scale, baseY);
  ctx.quadraticCurveTo(cx - 260 * scale, baseY - 200 * scale, cx - 120 * scale, baseY - 230 * scale);
  ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, baseY - 330 * scale, 78 * scale, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
  ctx.restore();
}
// hand on mouse, side close-up
function handOnMouse(ctx, x, y, scale, t) {
  ctx.save();
  ctx.fillStyle = "rgba(4,6,8,0.97)";
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + 40 * scale, y - 90 * scale, x + 150 * scale, y - 96 * scale + Math.sin(t * 1.1) * 3);
  ctx.quadraticCurveTo(x + 240 * scale, y - 80 * scale, x + 250 * scale, y);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "rgba(150,220,180,0.5)"; ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x + 150 * scale, y - 96 * scale + Math.sin(t * 1.1) * 3);
  ctx.quadraticCurveTo(x + 236 * scale, y - 82 * scale, x + 248 * scale, y);
  ctx.stroke();
  // mouse
  ctx.fillStyle = "#0a0f0c"; ctx.strokeStyle = "rgba(79,224,138,0.55)"; ctx.lineWidth = 2.5;
  rr(ctx, x + 250 * scale, y - 46 * scale, 110 * scale, 62 * scale, 30 * scale); ctx.fill(); ctx.stroke();
  ctx.restore();
}
// glasses close-up: dark lens reflecting a candle chart, no face visible
function glassesCloseup(ctx, t, frame, energy) {
  const cx = W / 2, cy = H * 0.46;
  // head silhouette filling frame (back/side, face never visible)
  ctx.fillStyle = "rgba(2,4,5,0.985)";
  ctx.beginPath(); ctx.ellipse(cx, cy + 240, 560, 640, 0, 0, Math.PI * 2); ctx.fill();
  // glasses: two lenses + temple arm, drawn large
  const lw = 300, lh = 190, gap = 70, gy = cy - 60;
  const lx = cx - lw - gap / 2, rx = cx + gap / 2;
  for (const [x0, mirror] of [[lx, 1], [rx, -1]]) {
    ctx.save();
    // lens glass
    const lg = ctx.createLinearGradient(x0, gy, x0 + lw, gy + lh);
    lg.addColorStop(0, "#0a1410"); lg.addColorStop(1, "#050a07");
    ctx.fillStyle = lg;
    rr(ctx, x0, gy, lw, lh, 46); ctx.fill();
    // chart reflection inside lens (scrolled by time, pulsing with energy)
    ctx.save(); rr(ctx, x0 + 8, gy + 8, lw - 16, lh - 16, 40); ctx.clip();
    const scroll = (t * 90) % 240;
    ctx.translate(-scroll * mirror, 0);
    candlePath(ctx, CANDLES, x0 + scroll * mirror - 120, gy + 30, lw + 480, lh - 70, 1, false);
    ctx.restore();
    // rim + glint
    ctx.strokeStyle = "rgba(190,230,205,0.75)"; ctx.lineWidth = 5;
    rr(ctx, x0, gy, lw, lh, 46); ctx.stroke();
    ctx.strokeStyle = `rgba(255,255,255,${0.10 + energy * 0.12})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x0 + 30, gy + lh * 0.75); ctx.lineTo(x0 + lw * 0.55, gy + 18); ctx.stroke();
    ctx.restore();
  }
  // bridge + temple arm
  ctx.strokeStyle = "rgba(190,230,205,0.6)"; ctx.lineWidth = 8;
  ctx.beginPath(); ctx.moveTo(lx + lw, gy + 60); ctx.quadraticCurveTo(cx, gy + 30, rx, gy + 60); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(rx + lw, gy + 70); ctx.quadraticCurveTo(rx + lw + 130, gy + 90, rx + lw + 210, gy + 160); ctx.stroke();
  // faint screen glow from front (light source off-frame left)
  const gl = ctx.createRadialGradient(cx - 500, cy - 300, 40, cx - 500, cy - 300, 900);
  gl.addColorStop(0, "rgba(110,220,160,0.20)"); gl.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gl; ctx.fillRect(0, 0, W, H);
}

// ---------- caption card ----------
function caption(ctx, t, hitT, text, sub, y, size, color) {
  if (t < hitT) return;
  const since = t - hitT;
  const pop = since < 0.22 ? 1 + 0.24 * (1 - since / 0.22) : 1;
  const alpha = Math.min(1, since / 0.1) * (since > 3.4 ? Math.max(0, 1 - (since - 3.4) / 0.5) : 1);
  if (alpha <= 0) return;
  ctx.save(); ctx.globalAlpha = alpha;
  ctx.translate(W / 2, y); ctx.scale(pop, pop); ctx.translate(-W / 2, -y);
  centerTracked(ctx, text, y, size * 0.12, size, color);
  if (sub) centerTracked(ctx, sub, y + size * 0.92, 5, 26, GREY);
  ctx.restore();
}

// ---------- scenes (t = seconds in excerpt) ----------
function scGlasses(ctx, t, f) {
  drawRoom(ctx, t, "green");
  glassesCloseup(ctx, t, f, 1 - beatFrac(t));
  caption(ctx, t, GRID[3], "EVERY DECISION", "HAS AN ARGUMENT BEHIND IT", H * 0.76, 64, INK);
}
function scDesk(ctx, t, f) {
  drawRoom(ctx, t, "green");
  // monitor: bright chart panel seen over the shoulder
  const mx = W / 2 - 380, my = 380, mw = 760, mh = 520;
  ctx.fillStyle = "#050a07"; ctx.strokeStyle = "rgba(79,224,138,0.4)"; ctx.lineWidth = 3;
  rr(ctx, mx, my, mw, mh, 20); ctx.fill(); ctx.stroke();
  candlePath(ctx, CANDLES, mx + 40, my + 50, mw - 80, mh - 130, 1, true);
  setFont(ctx, 20, "bold"); ctx.fillStyle = GREY;
  ctx.fillText("NVDA · LIVE", mx + 42, my + mh - 28);
  // light spill onto desk
  const sp = ctx.createRadialGradient(W / 2, my + mh, 60, W / 2, my + mh, 700);
  sp.addColorStop(0, "rgba(90,210,140,0.20)"); sp.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = sp; ctx.fillRect(0, my + mh - 100, W, 500);
  // person from behind (no face)
  personFromBehind(ctx, W / 2, H + 40, 1.15, "rgba(140,230,180,0.65)", 0.8);
  handOnMouse(ctx, W / 2 + 210, H - 180, 1.1, t);
  caption(ctx, t, GRID[7], "NINE ANALYSTS", "ONE CHART", H * 0.8, 60, INK);
}
function scRedteam(ctx, t, f) {
  drawRoom(ctx, t, "red");
  // verdict panel
  const px = 120, py = 420, pw = W - 240, ph = 700;
  ctx.fillStyle = "rgba(16,5,6,0.82)"; ctx.strokeStyle = "rgba(255,82,82,0.55)"; ctx.lineWidth = 3;
  rr(ctx, px, py, pw, ph, 26); ctx.fill(); ctx.stroke();
  centerTracked(ctx, "RED TEAM", py + 110, 16, 54, RED);
  const claims = ["\"EARNINGS BEAT\"", "\"MOMENTUM STRONG\"", "\"ANALYSTS BULLISH\""];
  setFont(ctx, 40, "bold");
  claims.forEach((c, i) => {
    const y = py + 260 + i * 120;
    const appear = clamp01((t - (GRID[12] + i * 0.9)) / 0.3);
    ctx.globalAlpha = appear; ctx.fillStyle = INK; ctx.fillText(c, px + 80, y);
    ctx.globalAlpha = 1;
    if (t > GRID[12] + i * 0.9) {
      const prog = easeOutCubic((t - GRID[12] - i * 0.9) / 1.1);
      ctx.strokeStyle = RED; ctx.lineWidth = 6; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(px + 70, y - 14); ctx.lineTo(px + 70 + (ctx.measureText(c).width + 20) * prog, y - 14); ctx.stroke();
    }
  });
  centerTracked(ctx, "NO THESIS ISSUED", py + ph - 60, 8, 40, RED);
  personFromBehind(ctx, W / 2, H + 40, 1.15, "rgba(255,120,120,0.6)", 0.75);
  caption(ctx, t, GRID[16], "IT REFUSES TO GUESS.", null, H * 0.16, 56, RED);
}
function scLedger(ctx, t, f) {
  drawRoom(ctx, t, "green");
  const rows = [["AAPL", "CORRECT", GREEN], ["TSLA", "WRONG", RED], ["MSFT", "CORRECT", GREEN], ["NVDA", "PENDING", GREY]];
  rows.forEach(([tk, grade, col], i) => {
    const y = 470 + i * 250;
    const appear = clamp01((t - (GRID[20] + i * 0.7)) / 0.35);
    if (appear <= 0) return;
    ctx.save(); ctx.globalAlpha = appear;
    ctx.translate(W / 2, y); const s = 0.94 + 0.06 * easeOutBack(clamp01((t - GRID[20] - i * 0.7) / 0.35));
    ctx.scale(s, s); ctx.translate(-W / 2, -y);
    ctx.fillStyle = "rgba(8,13,10,0.9)";
    ctx.strokeStyle = grade === "WRONG" ? "rgba(255,82,82,0.5)" : "rgba(79,224,138,0.45)";
    ctx.lineWidth = 2.5;
    rr(ctx, 110, y - 90, W - 220, 180, 24); ctx.fill(); ctx.stroke();
    setFont(ctx, 52, "bold"); ctx.fillStyle = INK; ctx.fillText(tk, 160, y + 14);
    setFont(ctx, 34, "bold"); ctx.fillStyle = col;
    const mark = grade === "CORRECT" ? "✓" : grade === "WRONG" ? "✗" : "·";
    ctx.fillText(`${mark} ${grade}`, W - 520, y + 14);
    ctx.restore();
  });
  caption(ctx, t, GRID[24], "IT KEEPS SCORE", "ON ITSELF", H * 0.17, 58, INK);
}
function scEnd(ctx, t, f) {
  drawRoom(ctx, t, "green");
  const breathe = 1 + 0.035 * Math.sin(t * 1.4);
  ctx.save(); ctx.translate(W / 2, H * 0.4); ctx.scale(breathe, breathe);
  ctx.fillStyle = "#0a120d"; ctx.strokeStyle = DIM; ctx.lineWidth = 4;
  rr(ctx, -110, -110, 220, 220, 52); ctx.fill(); ctx.stroke();
  setFont(ctx, 110, "bold"); ctx.fillStyle = GREEN; ctx.textAlign = "center";
  ctx.fillText("T", 0, 40); ctx.restore(); ctx.textAlign = "left";
  if (t > 23.2) centerTracked(ctx, "SEE EVERY SIDE.", H * 0.56, 12, 58, INK);
  if (t > 23.8) centerTracked(ctx, "THEN DECIDE.", H * 0.56 + 100, 12, 58, GREEN);
  if (t > 24.4) centerTracked(ctx, "truffletrade.vercel.app", H * 0.56 + 220, 4, 28, GREY);
  // NCS attribution
  if (t > 24.9) {
    ctx.save(); ctx.globalAlpha = 0.85;
    centerTracked(ctx, "MUSIC: \"RECALL\" — GABRIAWLL", H * 0.845, 3, 20, GREY);
    centerTracked(ctx, "NCS RELEASE · NOSCOPYRIGHTSOUNDS.COM", H * 0.845 + 44, 3, 18, GREY);
    ctx.restore();
  }
}

const SCENES = [scGlasses, scDesk, scRedteam, scLedger, scEnd];
const CUTS = [0, GRID[7] ?? 1.98, GRID[12] ?? 5.89, GRID[20] ?? 9.8, GRID[28] ?? 13.7]; // scene start times
function sceneAt(t) {
  let s = 0;
  for (let i = 0; i < CUTS.length; i++) if (t >= CUTS[i]) s = i;
  return s;
}

// ---------- post fx overlays ----------
const NOISE_TILES = Array.from({ length: 12 }, () => {
  const c = createCanvas(256, 256), x = c.getContext("2d");
  const img = x.createImageData(256, 256);
  for (let i = 0; i < img.data.length; i += 4) { const v = Math.floor(rnd() * 255); img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 22; }
  x.putImageData(img, 0, 0); return c;
});
const SCAN = (() => { const c = createCanvas(W, H), x = c.getContext("2d");
  x.fillStyle = "rgba(0,0,0,0.08)";
  for (let y = 0; y < H; y += 5) x.fillRect(0, y, W, 2);
  return c; })();
const VIG = (() => { const c = createCanvas(W, H), x = c.getContext("2d");
  const g = x.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.78);
  g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,0.6)");
  x.fillStyle = g; x.fillRect(0, 0, W, H); return c; })();

// ---------- camera: alternating zoom in/out per bar, punch on downbeats ----------
function camera(t, f) {
  const barIdx = Math.floor(t / BAR);
  const barT = (t % BAR) / BAR;
  const dir = barIdx % 2 === 0 ? 1 : -1; // even bars zoom in, odd zoom out
  const slow = dir === 1 ? 1.06 - 0.06 * easeInOut(barT) : 1.0 + 0.06 * easeInOut(barT);
  const sb = sinceBeat(t);
  const punch = sb < 0.18 ? 1 + 0.05 * (1 - sb / 0.18) : 1;
  const shake = sb < 0.18 ? (1 - sb / 0.18) * 5 : 0;
  return { zoom: slow * punch, ox: (rnd() - 0.5) * shake, oy: (rnd() - 0.5) * shake };
}

// ---------- ffmpeg ----------
const excerptStart = analysis.startSec;
const srcMp3 = "C:/Users/Cameron/Downloads/gabriawll - Recall [NCS Release].mp3";
const outMp4 = path.join(OUT_DIR, "truffletrade-cinematic.mp4");
const ff = spawn(ffmpegPath, [
  "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", `${W}x${H}`, "-r", String(FPS), "-i", "-",
  "-ss", String(excerptStart), "-t", String(DUR), "-i", srcMp3,
  "-c:v", "libx264", "-preset", "medium", "-crf", "21", "-pix_fmt", "yuv420p",
  "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart",
  outMp4,
], { stdio: ["pipe", "inherit", "inherit"] });
ff.on("exit", (c) => { if (c !== 0) process.exit(c); });

// ---------- render loop ----------
const scCanvas = createCanvas(W, H), sc = scCanvas.getContext("2d");
const main = createCanvas(W, H), ctx = main.getContext("2d");
const raw = Buffer.alloc(W * H * 3);
let lastCut = -1;

for (let f = 0; f < FRAMES; f++) {
  seed = 90210 + f * 7919;
  const t = f / FPS;
  const sIdx = sceneAt(t);
  const local = t - CUTS[sIdx];

  // scene wipe: 0.35s diagonal reveal on each cut
  sc.clearRect(0, 0, W, H);
  sc.save();
  if (local < 0.35) {
    const p = easeOutCubic(local / 0.35);
    sc.beginPath(); sc.moveTo(0, 0); sc.lineTo(W * p, 0); sc.lineTo(W * (p - 0.4), H); sc.lineTo(0, H); sc.closePath(); sc.clip();
  }
  SCENES[sIdx](sc, t, f);
  sc.restore();
  // scene number ghost (premium editorial touch)
  sc.save(); sc.globalAlpha = 0.25;
  setFont(sc, 26, "bold"); sc.fillStyle = GREY;
  sc.fillText(`0${sIdx + 1} / 05`, 44, H - 60);
  sc.restore();

  // camera transform
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
  const { zoom, ox, oy } = camera(t, f);
  ctx.save();
  ctx.translate(W / 2 + ox, H / 2 + oy); ctx.scale(zoom, zoom); ctx.translate(-W / 2, -H / 2);
  ctx.drawImage(scCanvas, 0, 0);
  ctx.restore();

  // downbeat flash (subtle, premium)
  const sb = sinceBeat(t);
  if (sb < 0.1 && isDownbeat(t)) {
    ctx.fillStyle = `rgba(200,255,225,${0.10 * (1 - sb / 0.1)})`;
    ctx.fillRect(0, 0, W, H);
  }

  // letterbox bars for cinematic ratio
  ctx.fillStyle = "#000";
  const barH = 90;
  ctx.fillRect(0, 0, W, barH); ctx.fillRect(0, H - barH, W, barH);

  drawWordmark(ctx);
  ctx.drawImage(SCAN, 0, 0); ctx.drawImage(VIG, 0, 0);
  const tile = NOISE_TILES[f % NOISE_TILES.length];
  const tox = -Math.floor(rnd() * 128), toy = -Math.floor(rnd() * 128);
  for (let ty = toy; ty < H; ty += 256) for (let tx = tox; tx < W; tx += 256) ctx.drawImage(tile, tx, ty);

  // fade in/out
  if (t < 0.5) { ctx.fillStyle = `rgba(0,0,0,${1 - t / 0.5})`; ctx.fillRect(0, 0, W, H); }
  if (t > DUR - 0.7) { ctx.fillStyle = `rgba(0,0,0,${(t - (DUR - 0.7)) / 0.7})`; ctx.fillRect(0, 0, W, H); }

  const img = ctx.getImageData(0, 0, W, H).data;
  let o = 0;
  for (let i = 0; i < img.length; i += 4) { raw[o++] = img[i]; raw[o++] = img[i + 1]; raw[o++] = img[i + 2]; }
  if (!ff.stdin.write(raw)) await new Promise((r) => ff.stdin.once("drain", r));
  if (f % 120 === 0) console.log(`frame ${f}/${FRAMES}`);
}
ff.stdin.end();
await new Promise((r) => ff.on("close", r));
console.log("DONE:", outMp4);
