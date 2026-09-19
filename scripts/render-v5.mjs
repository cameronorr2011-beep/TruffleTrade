// TruffleTrade v5 — "See every side."
// A vertical (1080×1920) 30s brand film rendered frame-by-frame in node-canvas
// with a tiny perspective camera. Seven chapters, each motivated by one VO
// line (ElevenLabs clips + timings from render-vo-v4.mjs):
//   1 canyon   — camera flies low through a 3D candlestick canyon
//   2 monolith — "one model": a lone grey orb with a flat opinion line
//   3 council  — nine analyst nodes orbit a holographic chart
//   4 redteam  — red strikes cut through the thesis card, line by line
//   5 refuse   — nodes go dark; INSUFFICIENT EVIDENCE stamp
//   6 memory   — a ledger wall of past calls lights up, misses included
//   7 room     — flythrough to the real dashboard, then the end card
// Music sits at ~-8 dB vs. v4 (0.42 vs 0.85) and ducks to 12% under VO.
// Captions are burned in for muted autoplay on the homepage.
import fs from "node:fs";
import path from "node:path";
import { createCanvas, loadImage, GlobalFonts } from "@napi-rs/canvas";
import ffmpegPath from "ffmpeg-static";
import { spawn, execFileSync } from "node:child_process";

const W = 1080, H = 1920, FPS = 30;
const ROOT = path.join(import.meta.dirname, "..");
const OUT = path.join(ROOT, "dist-video");
const VO = JSON.parse(fs.readFileSync(path.join(OUT, "vo-v4-timings.json"), "utf8"));
const MUSIC_GAIN = Number(process.env.TT_MUSIC_GAIN ?? 0.42);   // v4 was 0.85
const DUCK_FLOOR = Number(process.env.TT_DUCK_FLOOR ?? 0.12);   // v4 was 0.20
const PREVIEW = process.env.TT_PREVIEW === "1";                  // render every 15th frame to PNGs only

// fonts (Windows system fonts; fall back silently)
for (const [file, family] of [["bahnschrift.ttf", "Bahnschrift"], ["consola.ttf", "Consolas"], ["consolab.ttf", "Consolas"]]) {
  const p = path.join("C:/Windows/Fonts", file);
  if (fs.existsSync(p)) { try { GlobalFonts.registerFromPath(p, family); } catch { /* ignore */ } }
}
const DISPLAY = GlobalFonts.has("Bahnschrift") ? "Bahnschrift" : "Arial";
const MONO = GlobalFonts.has("Consolas") ? "Consolas" : "Courier New";

// ---------- timeline ----------
const at = {};
{ let t = 1.0; for (const line of VO) { at[line.id] = t; t += line.dur + 1.15; } }
const l7 = VO.find((v) => v.id === "l7");
const DUR = Math.ceil(at.l7 + l7.dur + 4.2);
const FRAMES = DUR * FPS;
const CH = {
  canyon: 0,
  monolith: at.l2 - 0.6,
  council: at.l3 - 0.6,
  redteam: at.l4 - 0.6,
  refuse: at.l5 - 0.6,
  memory: at.l6 - 0.6,
  room: at.l7 - 0.9,
  end: at.l7 + 1.7,
};
console.log("timeline", Object.fromEntries(Object.entries(CH).map(([k, v]) => [k, +v.toFixed(2)])), `total ${DUR}s`);

// ---------- assets ----------
const LOGO = await loadImage(fs.readFileSync(path.join(ROOT, "public/logo.svg")));
const SHOT_DASH = await loadImage(fs.readFileSync(path.join(OUT, "shot-dashboard.png")));
const SHOT_ANALYST = await loadImage(fs.readFileSync(path.join(OUT, "shot-analyst.png")));

// ---------- palette ----------
const GOLD = "#e6b95f", GOLD_HI = "#fbe2a0", GOLD_LO = "#a8752a";
const GREEN = "#5ccf8a", RED = "#ef7a5f", BONE = "#f3ede3", BONE_SOFT = "#b3a797", FAINT = "#8c8073";
const VOID = "#0b0908";

// ---------- math ----------
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (v) => (v < 0.5 ? 2 * v * v : 1 - Math.pow(-2 * v + 2, 2) / 2);
const easeOut = (v) => 1 - Math.pow(1 - v, 3);
const seg = (t, a, b) => ease(clamp((t - a) / (b - a)));
const segOut = (t, a, b) => easeOut(clamp((t - a) / (b - a)));
let seed = 1;
const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;

// ---------- camera / projection ----------
function proj(wx, wy, wz, cam) {
  const dx = wx - cam.x, dy = wy - cam.y, dz = wz - cam.z;
  const cy = Math.cos(-cam.yaw), sy = Math.sin(-cam.yaw);
  const x = dx * cy - dz * sy;
  let z = dx * sy + dz * cy;
  const cp = Math.cos(-cam.pitch), sp = Math.sin(-cam.pitch);
  const y = dy * cp - z * sp;
  z = dy * sp + z * cp;
  if (z <= 6) return null;
  const s = cam.f / z;
  return { x: W / 2 + x * s, y: H / 2 - y * s, s, z };
}
function quad(ctx, corners, cam) {
  const p = corners.map((c) => proj(c[0], c[1], c[2], cam));
  if (p.some((q) => q === null)) return null;
  ctx.beginPath();
  ctx.moveTo(p[0].x, p[0].y);
  for (let i = 1; i < p.length; i++) ctx.lineTo(p[i].x, p[i].y);
  ctx.closePath();
  return p;
}
function solid(ctx, corners, color, cam, stroke) {
  const p = quad(ctx, corners, cam);
  if (!p) return null;
  ctx.fillStyle = color; ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
  return p;
}
/** Textured/filled plane facing +z (or any orientation given 4 corners). */
function plane(ctx, img, corners, cam, opts = {}) {
  const p = quad(ctx, corners, cam);
  if (!p) return null;
  ctx.save();
  if (opts.shadow) { ctx.shadowColor = "rgba(0,0,0,0.55)"; ctx.shadowBlur = 40; ctx.shadowOffsetY = 18; }
  ctx.fillStyle = opts.fill ?? "#0a0f0c";
  ctx.fill();
  ctx.shadowBlur = 0;
  if (img) {
    ctx.clip();
    const p0 = p[0], u = { x: p[1].x - p0.x, y: p[1].y - p0.y }, v = { x: p[3].x - p0.x, y: p[3].y - p0.y };
    ctx.transform(u.x / img.width, u.y / img.width, v.x / img.height, v.y / img.height, p0.x, p0.y);
    ctx.drawImage(img, 0, 0);
    if (opts.dim) { ctx.globalAlpha = opts.dim; ctx.fillStyle = "#000"; ctx.fillRect(0, 0, img.width, img.height); }
  }
  ctx.restore();
  if (opts.glow) {
    ctx.save(); ctx.globalAlpha = opts.glow; ctx.strokeStyle = opts.glowColor ?? GOLD; ctx.lineWidth = 2.5;
    ctx.shadowColor = opts.glowColor ?? GOLD; ctx.shadowBlur = 24;
    quad(ctx, corners, cam); ctx.stroke(); ctx.restore();
  }
  return p;
}
const rect3 = (cx, cy, cz, w, h) => [[cx - w / 2, cy + h / 2, cz], [cx + w / 2, cy + h / 2, cz], [cx + w / 2, cy - h / 2, cz], [cx - w / 2, cy - h / 2, cz]];

/** Axis-aligned box drawn as three shaded faces (painter's order handled by caller sorting on z). */
function box(ctx, x, y0, y1, z, w, d, color, cam, glow) {
  const hw = w / 2, hd = d / 2;
  const shade = (c, k) => { const m = c.match(/\w\w/g).map((h) => parseInt(h, 16)); return `rgb(${m.map((v) => clamp(Math.round(v * k), 0, 255)).join(",")})`; };
  // front (facing camera, -z side)
  solid(ctx, [[x - hw, y1, z - hd], [x + hw, y1, z - hd], [x + hw, y0, z - hd], [x - hw, y0, z - hd]], shade(color, 0.85), cam);
  // side (whichever side faces the camera)
  const sx = cam.x < x ? x - hw : x + hw;
  solid(ctx, [[sx, y1, z - hd], [sx, y1, z + hd], [sx, y0, z + hd], [sx, y0, z - hd]], shade(color, 0.6), cam);
  // top
  solid(ctx, [[x - hw, y1, z - hd], [x + hw, y1, z - hd], [x + hw, y1, z + hd], [x - hw, y1, z + hd]], shade(color, 1.15), cam);
  if (glow) {
    ctx.save(); ctx.globalAlpha = glow; ctx.shadowColor = color; ctx.shadowBlur = 30; ctx.strokeStyle = color; ctx.lineWidth = 1.5;
    quad(ctx, [[x - hw, y1, z - hd], [x + hw, y1, z - hd], [x + hw, y0, z - hd], [x - hw, y0, z - hd]], cam); ctx.stroke(); ctx.restore();
  }
}
function line3(ctx, a, b, color, width, cam, alpha = 1) {
  const p = proj(a[0], a[1], a[2], cam), q = proj(b[0], b[1], b[2], cam);
  if (!p || !q) return;
  ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = width;
  ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke(); ctx.restore();
}
function orb(ctx, x, y, z, r, color, cam, alpha = 1, label) {
  const p = proj(x, y, z, cam);
  if (!p) return null;
  const rr = r * p.s;
  ctx.save(); ctx.globalAlpha = alpha;
  const g = ctx.createRadialGradient(p.x - rr * 0.3, p.y - rr * 0.3, rr * 0.1, p.x, p.y, rr);
  g.addColorStop(0, "#ffffff"); g.addColorStop(0.25, color); g.addColorStop(1, "rgba(0,0,0,0.6)");
  ctx.shadowColor = color; ctx.shadowBlur = rr * 1.6;
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, rr, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;
  if (label) {
    ctx.font = `600 ${Math.max(14, 20 * p.s)}px ${MONO}`; ctx.textAlign = "center"; ctx.fillStyle = BONE;
    ctx.fillText(label, p.x, p.y + rr + 26 * p.s);
  }
  ctx.restore();
  return p;
}

// ---------- text ----------
function txt(ctx, str, x, y, size, opts = {}) {
  if ((opts.alpha ?? 1) <= 0) return;
  ctx.save();
  ctx.globalAlpha = opts.alpha ?? 1;
  ctx.font = `${opts.weight ?? 700} ${size}px ${opts.font ?? DISPLAY}`;
  ctx.textAlign = opts.align ?? "center";
  ctx.textBaseline = "middle";
  if (opts.glow) { ctx.shadowColor = opts.glow; ctx.shadowBlur = opts.glowBlur ?? 30; }
  ctx.fillStyle = opts.color ?? BONE;
  const track = opts.track ?? 0;
  if (!track) { ctx.fillText(str, x, y); ctx.restore(); return; }
  let w = 0; for (const ch of str) w += ctx.measureText(ch).width + track; w -= track;
  let cx = (opts.align === "left" ? x : x - w / 2);
  ctx.textAlign = "left";
  for (const ch of str) { ctx.fillText(ch, cx, y); cx += ctx.measureText(ch).width + track; }
  ctx.restore();
}
function chip(ctx, str, y, color, alpha, size = 30) {
  if (alpha <= 0) return;
  ctx.save(); ctx.globalAlpha = alpha;
  ctx.font = `700 ${size}px ${MONO}`;
  const w = ctx.measureText(str).width + 64;
  ctx.fillStyle = "rgba(11,9,8,0.82)";
  ctx.beginPath(); ctx.roundRect(W / 2 - w / 2, y - size, w, size * 2.1, 18); ctx.fill();
  ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.globalAlpha = alpha * 0.8; ctx.stroke();
  ctx.globalAlpha = alpha; ctx.fillStyle = color; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(str, W / 2, y + size * 0.08);
  ctx.restore();
}
function caption(ctx, t) {
  const cap = VO.find((v) => t >= at[v.id] - 0.1 && t <= at[v.id] + v.dur + 0.6);
  if (!cap) return;
  const a = Math.min(1, (t - (at[cap.id] - 0.1)) / 0.25, (at[cap.id] + cap.dur + 0.6 - t) / 0.3);
  const words = cap.text.toUpperCase().split(" ");
  const lines = []; let cur = "";
  for (const w of words) { if ((cur + " " + w).trim().length > 30) { lines.push(cur.trim()); cur = w; } else cur += " " + w; }
  if (cur.trim()) lines.push(cur.trim());
  ctx.save(); ctx.globalAlpha = a;
  const size = 34, lh = 46, boxH = lines.length * lh + 34;
  const y0 = H * 0.845 - boxH / 2;
  ctx.fillStyle = "rgba(11,9,8,0.72)";
  ctx.beginPath(); ctx.roundRect(70, y0, W - 140, boxH, 16); ctx.fill();
  ctx.fillStyle = GOLD; ctx.fillRect(70, y0, 5, boxH);
  ctx.font = `600 ${size}px ${DISPLAY}`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = BONE;
  lines.forEach((l, i) => ctx.fillText(l, W / 2 + 2, y0 + 17 + lh * i + lh / 2));
  ctx.restore();
}
function brand(ctx, alpha = 0.9) {
  ctx.save(); ctx.globalAlpha = alpha;
  ctx.drawImage(LOGO, 70, 78, 74, 74);
  ctx.font = `800 40px ${DISPLAY}`; ctx.textBaseline = "middle"; ctx.textAlign = "left";
  ctx.fillStyle = BONE; ctx.fillText("truffle", 162, 116);
  const w = ctx.measureText("truffle").width;
  ctx.fillStyle = GOLD; ctx.font = `600 40px ${DISPLAY}`; ctx.fillText("trade", 162 + w, 116);
  const w2 = ctx.measureText("trade").width;
  ctx.fillStyle = GREEN; ctx.fillText(".", 162 + w + w2, 116);
  ctx.restore();
}
function bg(ctx, glowColor = GOLD, k = 0.16, cx = W * 0.5, cy = -200) {
  ctx.fillStyle = VOID; ctx.fillRect(0, 0, W, H);
  const g = ctx.createRadialGradient(cx, cy, 50, cx, cy, H * 0.7);
  g.addColorStop(0, hexA(glowColor, k)); g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}
function hexA(hex, a) { const m = hex.match(/\w\w/g).map((h) => parseInt(h, 16)); return `rgba(${m[0]},${m[1]},${m[2]},${a})`; }
function floorGrid(ctx, cam, y, color, alpha, zFrom, zTo, step = 60, xHalf = 600) {
  ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = 1;
  for (let z = Math.ceil(zFrom / step) * step; z <= zTo; z += step) {
    const a = proj(-xHalf, y, z, cam), b = proj(xHalf, y, z, cam);
    if (a && b) { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
  }
  for (let x = -xHalf; x <= xHalf; x += step) {
    const a = proj(x, y, Math.max(zFrom, cam.z + 8), cam), b = proj(x, y, zTo, cam);
    if (a && b) { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
  }
  ctx.restore();
}

// ---------- procedural chart texture (for holograms) ----------
function chartTexture(w, h, seedv, upBias = 0.55) {
  const c = createCanvas(w, h), x = c.getContext("2d");
  seed = seedv;
  x.fillStyle = "#0e0c0a"; x.fillRect(0, 0, w, h);
  x.strokeStyle = "rgba(230,185,95,0.12)"; x.lineWidth = 1;
  for (let i = 1; i < 6; i++) { x.beginPath(); x.moveTo(0, (h / 6) * i); x.lineTo(w, (h / 6) * i); x.stroke(); }
  let price = h * 0.62; const n = 46, bw = w / n;
  for (let i = 0; i < n; i++) {
    const o = price, cl = clamp(price + (rnd() - (1 - upBias)) * h * 0.09, h * 0.12, h * 0.9);
    const hi = Math.min(o, cl) - rnd() * h * 0.03, lo = Math.max(o, cl) + rnd() * h * 0.03;
    const up = cl < o; const col = up ? GREEN : RED;
    x.strokeStyle = col; x.lineWidth = 2; x.beginPath(); x.moveTo(i * bw + bw / 2, hi); x.lineTo(i * bw + bw / 2, lo); x.stroke();
    x.fillStyle = col; x.fillRect(i * bw + bw * 0.22, Math.min(o, cl), bw * 0.56, Math.max(2, Math.abs(cl - o)));
    price = cl;
  }
  x.font = `600 ${Math.round(h * 0.05)}px ${MONO}`; x.fillStyle = FAINT; x.textAlign = "left";
  x.fillText("NVDA · DAILY · COUNCIL ACTIVE", 16, h * 0.08);
  return c;
}
const CHART_TEX = chartTexture(900, 560, 7);
const CHART_TEX_FLAT = (() => {
  const c = createCanvas(900, 560), x = c.getContext("2d");
  x.fillStyle = "#121110"; x.fillRect(0, 0, 900, 560);
  x.strokeStyle = "#5b5650"; x.lineWidth = 6; x.beginPath(); x.moveTo(40, 300); x.lineTo(860, 300); x.stroke();
  x.font = `600 30px ${MONO}`; x.fillStyle = "#7a746c"; x.textAlign = "left"; x.fillText("ONE OPINION · ONE MODEL", 30, 60);
  return c;
})();

// ---------- analysts ----------
const ANALYSTS = [
  ["FUNDAMENTALS", GREEN], ["VALUATION", GOLD], ["TECHNICALS", "#6cc3cf"], ["MACRO", "#b39ddb"], ["COMPETITION", "#e0a27a"],
  ["NEWS", "#e08c8c"], ["PATTERNS", "#7fa8e0"], ["SCENARIO", "#b9c86f"], ["BACKTEST", "#c99ac9"],
];

// ---------- chapter renderers ----------
function chCanyon(ctx, t) {
  const k = t / (CH.monolith);
  bg(ctx, GOLD, 0.18, W * 0.5, H * 0.25);
  const cam = { x: 0, y: 70 + 20 * Math.sin(t * 0.8), z: -120 + t * 150, yaw: 0.08 * Math.sin(t * 0.6), pitch: -0.10, f: 820 };
  floorGrid(ctx, cam, 0, GOLD, 0.14, cam.z, cam.z + 1400, 70, 700);
  // candle rows: two walls of candles flanking a corridor, heights on a random walk
  seed = 99;
  const candles = [];
  let hl = 120, hr = 150;
  for (let i = 0; i < 40; i++) {
    const z = i * 55;
    hl = clamp(hl + (rnd() - 0.45) * 40, 40, 300); hr = clamp(hr + (rnd() - 0.45) * 40, 40, 300);
    const upL = rnd() > 0.42, upR = rnd() > 0.42;
    candles.push({ x: -150 - rnd() * 30, h: hl, z, up: upL, w: 26 });
    candles.push({ x: 150 + rnd() * 30, h: hr, z, up: upR, w: 26 });
    if (i % 3 === 0) candles.push({ x: -330 - rnd() * 60, h: hl * 0.8, z, up: upL, w: 22 });
    if (i % 3 === 1) candles.push({ x: 330 + rnd() * 60, h: hr * 0.8, z, up: upR, w: 22 });
  }
  candles.sort((a, b) => b.z - a.z);
  for (const c of candles) {
    if (c.z < cam.z + 10) continue;
    const col = c.up ? "#5ccf8a" : "#ef7a5f";
    // wick
    line3(ctx, [c.x, c.h, c.z], [c.x, c.h + 40 + (c.h % 30), c.z], col, 2, cam, 0.9);
    box(ctx, c.x, 0, c.h, c.z, c.w, c.w, col, cam, 0.25);
  }
  // gold trend line racing down the corridor
  const pts = []; for (let i = 0; i <= 24; i++) { const z = cam.z + 60 + i * 60; pts.push([Math.sin(i * 0.6) * 18, 110 + Math.sin(i * 0.9 + t) * 26 + i * 6, z]); }
  ctx.save(); ctx.strokeStyle = GOLD; ctx.lineWidth = 6; ctx.lineCap = "round"; ctx.shadowColor = GOLD; ctx.shadowBlur = 24;
  ctx.beginPath(); let first = true;
  for (const p of pts) { const q = proj(p[0], p[1], p[2], cam); if (!q) continue; if (first) { ctx.moveTo(q.x, q.y); first = false; } else ctx.lineTo(q.x, q.y); }
  ctx.stroke(); ctx.restore();
  // title
  const a1 = segOut(t, 0.3, 1.1);
  brand(ctx, a1);
  txt(ctx, "EVERY CHART", W / 2, H * 0.30 + (1 - a1) * 30, 96, { alpha: a1, track: 4 });
  txt(ctx, "HIDES AN ARGUMENT.", W / 2, H * 0.30 + 110 + (1 - a1) * 30, 96, { alpha: a1, color: GOLD, track: 2, glow: hexA(GOLD, 0.5) });
  void k;
}

function chMonolith(ctx, t) {
  const l = t - CH.monolith;
  ctx.fillStyle = "#0a0a0b"; ctx.fillRect(0, 0, W, H);
  const g = ctx.createRadialGradient(W / 2, H * 0.42, 40, W / 2, H * 0.42, H * 0.6);
  g.addColorStop(0, "rgba(120,116,110,0.16)"); g.addColorStop(1, "rgba(0,0,0,0)"); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const cam = { x: 90 * Math.sin(l * 0.35), y: 40, z: -520 + segOut(l, 0, 3.5) * 120, yaw: 0.16 * Math.sin(l * 0.35), pitch: -0.03, f: 900 };
  floorGrid(ctx, cam, -160, "#8a8580", 0.08, -400, 900, 80, 700);
  // flat opinion screen
  plane(ctx, CHART_TEX_FLAT, rect3(0, 60, 200, 520, 324), cam, { fill: "#121110", shadow: true, glow: 0.35, glowColor: "#7a746c" });
  // the lone grey orb
  const pulse = 1 + 0.04 * Math.sin(l * 2.2);
  orb(ctx, 0, 240, 200, 58 * pulse, "#8d877f", cam, 1, "ONE MODEL");
  // blind spot: a black wedge that grows over the screen
  const bs = seg(l, 2.4, 4.2);
  if (bs > 0) {
    const p = proj(200, 60, 199, cam);
    if (p) { ctx.save(); ctx.globalAlpha = 0.85 * bs; ctx.fillStyle = "#000"; ctx.beginPath(); ctx.arc(p.x, p.y, 40 + 260 * bs, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      chip(ctx, "ONE BLIND SPOT.", p.y, "#a29b92", bs, 28); }
  }
  txt(ctx, "MOST TOOLS", W / 2, H * 0.17, 72, { alpha: segOut(l, 0.2, 0.9), color: "#c9c2b8", track: 4 });
  txt(ctx, "HAND YOU ONE OPINION.", W / 2, H * 0.17 + 84, 72, { alpha: segOut(l, 0.5, 1.2), color: "#c9c2b8", track: 2 });
}

function councilScene(ctx, t, opts) {
  const { l, dim = 0, red = 0, refuse = 0 } = opts;
  bg(ctx, refuse ? RED : GOLD, refuse ? 0.10 : 0.16, W * 0.5, H * 0.35);
  const cam = { x: 0, y: 60, z: -560 + segOut(l, 0, 2.6) * 90, yaw: 0, pitch: -0.02, f: 900 };
  floorGrid(ctx, cam, -200, refuse ? RED : GOLD, 0.09, -300, 900, 80, 800);
  // holographic chart at center
  const chartCorners = rect3(0, 40, 220, 560, 348);
  plane(ctx, CHART_TEX, chartCorners, cam, { fill: "#0e0c0a", shadow: true, glow: 0.7 - 0.5 * refuse, glowColor: refuse ? "#6a3a30" : GOLD, dim: refuse ? 0.6 : 0 });
  // nine nodes orbit on a tilted ring
  const ring = [];
  for (let i = 0; i < 9; i++) {
    const ang = (i / 9) * Math.PI * 2 + l * 0.55;
    const R = 330;
    const x = Math.cos(ang) * R, z = 220 + Math.sin(ang) * 120, y = 40 + Math.sin(ang) * 150 + Math.sin(l * 1.3 + i) * 8;
    ring.push({ i, x, y, z, ang });
  }
  ring.sort((a, b) => b.z - a.z);
  for (const n of ring) {
    const appear = segOut(l, 0.15 + n.i * 0.12, 0.7 + n.i * 0.12);
    if (appear <= 0) continue;
    const [label, colorRaw] = ANALYSTS[n.i];
    const color = refuse ? "#4a423b" : colorRaw;
    if (n.z > 220) { line3(ctx, [n.x, n.y, n.z], [0, 40, 220], color, 1.5, cam, 0.35 * appear * (1 - refuse)); }
    orb(ctx, n.x, n.y, n.z, 26 * appear, color, cam, appear * (1 - dim), label);
    if (n.z <= 220) { line3(ctx, [n.x, n.y, n.z], [0, 40, 220], color, 1.5, cam, 0.5 * appear * (1 - refuse)); }
  }
  // red team strikes
  if (red > 0) {
    const CW = 560, CHh = 250, CY = -200, CZ = 150;
    const card = rect3(0, CY, CZ, CW, CHh);
    const pc = plane(ctx, null, card, cam, { fill: "rgba(20,17,16,0.96)", shadow: true, glow: 0.5, glowColor: RED });
    if (pc) {
      // text laid out in card space: size scales with the projected card width so it always fits
      const cardPxW = pc[1].x - pc[0].x, cardPxH = pc[3].y - pc[0].y;
      const lines = ["THESIS v3 · BULLISH · 0.74", "margins expand on pricing power", "multiple holds at 38× forward", "no macro sensitivity", "peers confirm the trend"];
      const fs = cardPxW / 21, lh = cardPxH / (lines.length + 0.6);
      ctx.save(); ctx.textAlign = "left"; ctx.textBaseline = "middle";
      ctx.beginPath(); ctx.rect(pc[0].x, pc[0].y, cardPxW, cardPxH); ctx.clip();
      lines.forEach((s, i) => {
        const y = pc[0].y + lh * (i + 0.8), x = pc[0].x + cardPxW * 0.05;
        ctx.font = `${i === 0 ? 700 : 500} ${fs}px ${MONO}`; ctx.fillStyle = i === 0 ? GOLD : BONE_SOFT; ctx.globalAlpha = 1;
        ctx.fillText(s, x, y);
        const strike = seg(l, 1.0 + i * 0.55, 1.35 + i * 0.55) * red;
        if (i > 0 && strike > 0) {
          const w = ctx.measureText(s).width;
          ctx.strokeStyle = RED; ctx.lineWidth = Math.max(3, fs * 0.16); ctx.shadowColor = RED; ctx.shadowBlur = 18;
          ctx.beginPath(); ctx.moveTo(x - 4, y); ctx.lineTo(x - 4 + w * strike, y); ctx.stroke(); ctx.shadowBlur = 0;
        }
      });
      ctx.restore();
      // strike beam from the red node to the line currently being cut
      const cur = lines.findIndex((_, i) => i > 0 && seg(l, 1.0 + i * 0.55, 1.35 + i * 0.55) * red > 0 && seg(l, 1.0 + i * 0.55, 1.35 + i * 0.55) < 1);
      if (cur > 0) { ctx.save(); ctx.globalAlpha = 0.75; ctx.strokeStyle = RED; ctx.lineWidth = 2.5; ctx.shadowColor = RED; ctx.shadowBlur = 16;
        ctx.beginPath(); ctx.moveTo(W / 2, H * 0.13); ctx.lineTo(pc[0].x + cardPxW * 0.05, pc[0].y + lh * (cur + 0.8)); ctx.stroke(); ctx.restore(); }
    }
    orb(ctx, 0, 380, 60, 34 + 4 * Math.sin(l * 6), RED, cam, red, "RED TEAM");
  }
  return cam;
}
function chCouncil(ctx, t) {
  const l = t - CH.council;
  councilScene(ctx, t, { l });
  txt(ctx, "NINE RIVAL ANALYSTS.", W / 2, H * 0.16, 74, { alpha: segOut(l, 0.4, 1.1), track: 3 });
  txt(ctx, "ONE CHART.", W / 2, H * 0.16 + 88, 74, { alpha: segOut(l, 0.8, 1.5), color: GOLD, track: 3, glow: hexA(GOLD, 0.5) });
}
function chRedTeam(ctx, t) {
  const l = t - CH.redteam;
  councilScene(ctx, t, { l: l + 3.2, red: segOut(l, 0.2, 0.8), dim: 0.25 });
  // red flash + subtle shake handled by caller via translate
  ctx.save(); ctx.globalAlpha = 0.10 + 0.05 * Math.sin(l * 9); ctx.fillStyle = RED; ctx.fillRect(0, 0, W, H); ctx.restore();
  txt(ctx, "THEN THE RED TEAM", W / 2, H * 0.16, 70, { alpha: segOut(l, 0.3, 1.0), track: 3 });
  txt(ctx, "TEARS IT APART.", W / 2, H * 0.16 + 84, 70, { alpha: segOut(l, 0.7, 1.4), color: RED, track: 3, glow: hexA(RED, 0.55) });
}
function chRefuse(ctx, t) {
  const l = t - CH.refuse;
  const refuse = segOut(l, 0.3, 1.4);
  councilScene(ctx, t, { l: l + 6.5, refuse, dim: 0.6 * refuse });
  // stamp
  const s = segOut(l, 0.9, 1.35);
  if (s > 0) {
    ctx.save(); ctx.translate(W / 2, H * 0.50); ctx.rotate(-0.09); ctx.scale(1.6 - 0.6 * s, 1.6 - 0.6 * s); ctx.globalAlpha = s;
    ctx.strokeStyle = RED; ctx.lineWidth = 10; ctx.shadowColor = RED; ctx.shadowBlur = 30;
    ctx.beginPath(); ctx.roundRect(-430, -120, 860, 240, 22); ctx.stroke(); ctx.shadowBlur = 0;
    ctx.fillStyle = hexA(RED, 0.10); ctx.fill();
    ctx.font = `800 74px ${DISPLAY}`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = RED;
    ctx.fillText("INSUFFICIENT", 0, -36); ctx.fillText("EVIDENCE", 0, 46);
    ctx.restore();
    chip(ctx, "NO THESIS ISSUED · FAIL-CLOSED", H * 0.665, BONE_SOFT, segOut(l, 1.6, 2.1), 26);
  }
  txt(ctx, "IF THE EVIDENCE IS THIN,", W / 2, H * 0.16, 62, { alpha: segOut(l, 0.2, 0.9), track: 2 });
  txt(ctx, "IT REFUSES TO GUESS.", W / 2, H * 0.16 + 78, 62, { alpha: segOut(l, 0.6, 1.3), color: RED, track: 2, glow: hexA(RED, 0.5) });
}
function chMemory(ctx, t) {
  const l = t - CH.memory;
  bg(ctx, GREEN, 0.12, W * 0.2, H * 0.3);
  const cam = { x: -260 + segOut(l, 0, 4.2) * 520, y: 40, z: -640, yaw: -0.18 + segOut(l, 0, 4.2) * 0.36, pitch: -0.01, f: 950 };
  floorGrid(ctx, cam, -420, GREEN, 0.07, -500, 900, 90, 900);
  // ledger wall: 10 columns × 16 rows of tiles on a plane at z=260
  seed = 2026;
  const cols = 10, rows = 13, tw = 74, th = 62, gap = 12;
  const x0 = -((cols * (tw + gap)) / 2), y0 = 300;
  let lit = 0, hits = 0;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const idx = r * cols + c;
    const reveal = segOut(l, 0.2 + idx * 0.014, 0.5 + idx * 0.014);
    const correct = rnd() < 0.63;
    if (reveal > 0) { lit++; if (correct) hits++; }
    const x = x0 + c * (tw + gap) + tw / 2, y = y0 - r * (th + gap) - th / 2;
    const col = correct ? GREEN : RED;
    const corners = rect3(x, y, 260, tw * reveal, th * reveal);
    if (reveal > 0) plane(ctx, null, corners, cam, { fill: hexA(col, 0.18 + 0.5 * reveal), glow: correct ? 0.35 * reveal : 0.6 * reveal, glowColor: col });
  }
  // legend
  const a = segOut(l, 1.2, 1.8);
  const ly = H * 0.745;
  ctx.save(); ctx.globalAlpha = a;
  ctx.fillStyle = "rgba(11,9,8,0.82)"; ctx.beginPath(); ctx.roundRect(70, ly - 26, W - 140, 104, 14); ctx.fill();
  ctx.font = `600 24px ${MONO}`; ctx.textAlign = "left"; ctx.textBaseline = "middle";
  ctx.fillStyle = GREEN; ctx.fillRect(98, ly - 2, 20, 20); ctx.fillStyle = BONE_SOFT; ctx.fillText("RESOLVED CORRECT", 132, ly + 8);
  ctx.fillStyle = RED; ctx.fillRect(98, ly + 40, 20, 20); ctx.fillStyle = BONE_SOFT; ctx.fillText("RESOLVED WRONG — KEPT ON THE RECORD", 132, ly + 50);
  ctx.restore();
  txt(ctx, "IT REMEMBERS", W / 2, H * 0.16, 76, { alpha: segOut(l, 0.2, 0.9), track: 4 });
  txt(ctx, "EVERY CALL IT MADE.", W / 2, H * 0.16 + 90, 76, { alpha: segOut(l, 0.6, 1.3), color: GREEN, track: 2, glow: hexA(GREEN, 0.5) });
  chip(ctx, "THE MISSES TOO.", H * 0.29 + 36, RED, segOut(l, 2.2, 2.7), 30);
  void lit; void hits;
}

// ---------- the room (from v4, warmed to the brand palette) ----------
const ROOM = { w: 560, h: 320, d: 520 };
const DESK = { x: 0, y: 96, z: 330, w: 240, d: 90 };
const MON = { x: 0, y: 152, z: 322, w: 150, h: 92 };
function drawRoom(ctx, cam, t, glow) {
  const R = ROOM;
  const amb = ctx.createRadialGradient(W / 2, H * 0.55, H * 0.1, W / 2, H * 0.55, H * 0.75);
  amb.addColorStop(0, "rgba(58,44,30,0.55)"); amb.addColorStop(1, "rgba(7,5,4,0.95)");
  ctx.fillStyle = amb; ctx.fillRect(0, 0, W, H);
  solid(ctx, [[-R.w / 2, 0, -60], [R.w / 2, 0, -60], [R.w / 2, 0, R.d], [-R.w / 2, 0, R.d]], "#1b1511", cam);
  solid(ctx, [[-R.w / 2, R.h, -60], [R.w / 2, R.h, -60], [R.w / 2, R.h, R.d], [-R.w / 2, R.h, R.d]], "#0d0a08", cam);
  solid(ctx, [[-R.w / 2, 0, R.d], [R.w / 2, 0, R.d], [R.w / 2, R.h, R.d], [-R.w / 2, R.h, R.d]], "#161210", cam);
  solid(ctx, [[-R.w / 2, 0, -60], [-R.w / 2, 0, R.d], [-R.w / 2, R.h, R.d], [-R.w / 2, R.h, -60]], "#120e0b", cam);
  solid(ctx, [[R.w / 2, 0, -60], [R.w / 2, 0, R.d], [R.w / 2, R.h, R.d], [R.w / 2, R.h, -60]], "#120e0b", cam);
  // window + gold light shaft on the left wall
  plane(ctx, null, [[-R.w / 2 + 2, 255, 120], [-R.w / 2 + 2, 255, 220], [-R.w / 2 + 2, 145, 220], [-R.w / 2 + 2, 145, 120]], cam, { fill: "rgba(230,185,95,0.28)" });
  solid(ctx, [[-R.w / 2, 1, 120], [-R.w / 2 + 130, 1, 210], [-R.w / 2 + 160, 1, 300], [-R.w / 2 + 40, 1, 260]], "rgba(230,185,95,0.09)", cam);
  // poster: logo
  plane(ctx, LOGO, [[R.w / 2 - 2, 233, 120], [R.w / 2 - 2, 233, 166], [R.w / 2 - 2, 187, 166], [R.w / 2 - 2, 187, 120]], cam, { fill: "#0c110d" });
  // rug
  solid(ctx, [[-110, 1.5, 140], [110, 1.5, 140], [130, 1.5, 260], [-130, 1.5, 260]], "rgba(70,52,38,0.9)", cam);
  // desk top
  solid(ctx, [[DESK.x - DESK.w / 2, DESK.y, DESK.z - DESK.d / 2], [DESK.x + DESK.w / 2, DESK.y, DESK.z - DESK.d / 2], [DESK.x + DESK.w / 2, DESK.y, DESK.z + DESK.d / 2], [DESK.x - DESK.w / 2, DESK.y, DESK.z + DESK.d / 2]], "#2a211a", cam);
  solid(ctx, [[DESK.x - DESK.w / 2, DESK.y, DESK.z - DESK.d / 2], [DESK.x + DESK.w / 2, DESK.y, DESK.z - DESK.d / 2], [DESK.x + DESK.w / 2, DESK.y - 6, DESK.z - DESK.d / 2], [DESK.x - DESK.w / 2, DESK.y - 6, DESK.z - DESK.d / 2]], "#1c1610", cam);
  // monitor stand + screen
  plane(ctx, null, rect3(MON.x, MON.y - 26, MON.z + 4, 10, 26), cam, { fill: "#15110e" });
  plane(ctx, null, rect3(MON.x, MON.y - 40, MON.z + 4, 44, 6), cam, { fill: "#1a1512" });
  plane(ctx, SHOT_DASH, rect3(MON.x, MON.y, MON.z, MON.w, MON.h), cam, { fill: "#050a07", glow, glowColor: "#58a97b", shadow: true });
  solid(ctx, [[MON.x - MON.w * 0.7, DESK.y + 0.5, DESK.z - DESK.d / 2], [MON.x + MON.w * 0.7, DESK.y + 0.5, DESK.z - DESK.d / 2], [MON.x + MON.w * 0.9, DESK.y + 0.5, DESK.z + DESK.d / 2], [MON.x - MON.w * 0.9, DESK.y + 0.5, DESK.z + DESK.d / 2]], "rgba(88,169,123,0.10)", cam);
  // second, smaller screen with the analyst (laptop) to the right
  plane(ctx, SHOT_ANALYST, [[52, 132, 300], [122, 132, 318], [122, 100, 318], [52, 100, 300]], cam, { fill: "#050a07", glow: 0.3, glowColor: "#58a97b" });
  // chair
  plane(ctx, null, rect3(DESK.x + 150, 60, DESK.z + 30, 46, 12), cam, { fill: "#1f1813" });
  plane(ctx, null, rect3(DESK.x + 150, 92, DESK.z + 52, 46, 60), cam, { fill: "#1a140f" });
  void t;
}
function chRoom(ctx, t) {
  const l = t - CH.room;
  const mix = (a, b, k) => Object.fromEntries(Object.keys(a).map((key) => [key, lerp(a[key], b[key], k)]));
  const atDoor = { x: -180, y: 130, z: -40, yaw: 0.5, pitch: -0.03, f: 800 };
  const atDesk = { x: -6, y: 138, z: 190, yaw: 0.03, pitch: -0.02, f: 880 };
  const cam = mix(atDoor, atDesk, seg(l, 0, 2.6));
  drawRoom(ctx, cam, t, 0.5 + 0.15 * Math.sin(t * 2));
  txt(ctx, "TRUFFLETRADE.", W / 2, H * 0.16, 84, { alpha: segOut(l, 0.3, 1.0), track: 6, glow: hexA(GOLD, 0.35) });
}
function endCard(ctx, t) {
  const l = t - CH.end;
  bg(ctx, GOLD, 0.2, W / 2, H * 0.34);
  const fade = (a, b) => segOut(l, a, b);
  const s = 260 + 10 * Math.sin(t * 1.2);
  ctx.save(); ctx.globalAlpha = fade(0, 0.5); ctx.shadowColor = hexA(GOLD, 0.45); ctx.shadowBlur = 60;
  ctx.drawImage(LOGO, W / 2 - s / 2, H * 0.34 - s / 2 - 40, s, s); ctx.restore();
  txt(ctx, "SEE EVERY SIDE.", W / 2, H * 0.50 + 10, 78, { alpha: fade(0.35, 0.8), track: 4 });
  txt(ctx, "THEN DECIDE.", W / 2, H * 0.50 + 104, 78, { alpha: fade(0.6, 1.05), color: GOLD, track: 4, glow: hexA(GOLD, 0.5) });
  chip(ctx, "FREE WINDOWS APP · AI 1,000 SATS/MO · NO KYC", H * 0.622, GREEN, fade(1.0, 1.4), 24);
  txt(ctx, "truffletrade.vercel.app", W / 2, H * 0.685, 40, { alpha: fade(1.2, 1.6), color: BONE, weight: 600, font: MONO });
  txt(ctx, "18+ · ANALYSIS, NOT ADVICE · OPEN SOURCE (MIT)", W / 2, H * 0.735, 22, { alpha: fade(1.5, 1.9), color: FAINT, weight: 600, font: MONO });
  txt(ctx, 'MUSIC: "INVINCIBLE" — DEAF KEV · NCS', W / 2, H * 0.77, 19, { alpha: fade(1.8, 2.2), color: FAINT, weight: 600, font: MONO });
}

// ---------- post ----------
const NOISE = Array.from({ length: 8 }, () => {
  const c = createCanvas(256, 256), x = c.getContext("2d");
  const img = x.createImageData(256, 256);
  for (let i = 0; i < img.data.length; i += 4) { const v = (Math.random() * 255) | 0; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 11; }
  x.putImageData(img, 0, 0); return c;
});
const VIG = (() => { const c = createCanvas(W, H), x = c.getContext("2d");
  const g = x.createRadialGradient(W / 2, H / 2, H * 0.28, W / 2, H / 2, H * 0.8);
  g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,0.62)");
  x.fillStyle = g; x.fillRect(0, 0, W, H); return c; })();

// ---------- audio ----------
function buildAudio() {
  const SR = 48000, N = SR * DUR;
  const L = new Float32Array(N), R = new Float32Array(N);
  const raw = path.join(OUT, "v5-song.pcm");
  execFileSync(ffmpegPath, ["-y", "-ss", "6.0", "-t", String(DUR), "-i", path.join(OUT, "invincible.mp3"), "-ac", "2", "-ar", String(SR), "-f", "s16le", raw], { stdio: ["ignore", "ignore", "ignore"] });
  const pcm = fs.readFileSync(raw);
  const frames = pcm.length >> 2;
  for (let i = 0; i < Math.min(frames, N); i++) { L[i] = pcm.readInt16LE(i * 4) / 32768; R[i] = pcm.readInt16LE(i * 4 + 2) / 32768; }
  // sidechain duck under VO (0.35s ramps), plus a gentle overall envelope: quieter intro, swell at the end card
  const duck = new Float32Array(N).fill(1);
  for (const line of VO) {
    const s = at[line.id] * SR, e = (at[line.id] + line.dur) * SR, F = 0.35 * SR;
    for (let i = Math.max(0, s - F); i < Math.min(N, e + F); i++) {
      let g = DUCK_FLOOR;
      if (i < s) g = 1 - (1 - DUCK_FLOOR) * (i - (s - F)) / F;
      else if (i > e) g = DUCK_FLOOR + (1 - DUCK_FLOOR) * (i - e) / F;
      duck[i] = Math.min(duck[i], clamp(g, DUCK_FLOOR, 1));
    }
  }
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    const env = t < 2.5 ? 0.7 + 0.3 * (t / 2.5) : t > CH.end ? 1.0 : 0.92;
    L[i] *= duck[i] * MUSIC_GAIN * env; R[i] *= duck[i] * MUSIC_GAIN * env;
  }
  for (const line of VO) {
    const tmp = path.join(OUT, "v5-votmp.pcm");
    execFileSync(ffmpegPath, ["-y", "-i", line.file, "-ac", "2", "-ar", String(SR), "-f", "s16le", tmp], { stdio: ["ignore", "ignore", "ignore"] });
    const v = fs.readFileSync(tmp);
    const start = Math.floor(at[line.id] * SR);
    const vf = v.length >> 2;
    for (let i = 0; i < vf; i++) {
      const idx = start + i; if (idx >= N) break;
      const tin = i / SR, tout = vf / SR - tin;
      const env = Math.min(1, tin / 0.02, tout / 0.05) * 0.95;
      L[idx] += v.readInt16LE(i * 4) / 32768 * env;
      R[idx] += v.readInt16LE(i * 4 + 2) / 32768 * env;
    }
  }
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    let l = Math.tanh(L[i] * 1.05), r = Math.tanh(R[i] * 1.05);
    if (t < 0.5) { l *= t / 0.5; r *= t / 0.5; }
    if (t > DUR - 1.0) { const g = Math.max(0, 1 - (t - (DUR - 1.0)) / 1.0); l *= g; r *= g; }
    L[i] = l; R[i] = r;
  }
  const wav = Buffer.alloc(44 + N * 4);
  wav.write("RIFF", 0); wav.writeUInt32LE(36 + N * 4, 4); wav.write("WAVE", 8);
  wav.write("fmt ", 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22);
  wav.writeUInt32LE(SR, 24); wav.writeUInt32LE(SR * 4, 28); wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34);
  wav.write("data", 36); wav.writeUInt32LE(N * 4, 40);
  for (let i = 0; i < N; i++) {
    wav.writeInt16LE(Math.max(-32768, Math.min(32767, (L[i] * 32767) | 0)), 44 + i * 4);
    wav.writeInt16LE(Math.max(-32768, Math.min(32767, (R[i] * 32767) | 0)), 46 + i * 4);
  }
  const p = path.join(OUT, "v5-audio.wav");
  fs.writeFileSync(p, wav);
  return p;
}

// ---------- frame ----------
function renderFrame(sc, t) {
  sc.setTransform(1, 0, 0, 1, 0, 0);
  sc.fillStyle = "#000"; sc.fillRect(0, 0, W, H);
  if (t >= CH.redteam && t < CH.refuse) { // subtle impact shake
    const l = t - CH.redteam; const k = Math.max(0, 1 - l / 1.6) * 6;
    sc.translate((rnd() - 0.5) * k, (rnd() - 0.5) * k);
  }
  if (t < CH.monolith) chCanyon(sc, t);
  else if (t < CH.council) chMonolith(sc, t);
  else if (t < CH.redteam) chCouncil(sc, t);
  else if (t < CH.refuse) chRedTeam(sc, t);
  else if (t < CH.memory) chRefuse(sc, t);
  else if (t < CH.room) chMemory(sc, t);
  else if (t < CH.end) chRoom(sc, t);
  else endCard(sc, t);
  sc.setTransform(1, 0, 0, 1, 0, 0);
  if (t >= CH.monolith && t < CH.end) brand(sc, 0.85);
  caption(sc, t);
  // chapter dips (no hard cuts): 0.3s dip to 70% black around each boundary
  for (const cut of [CH.monolith, CH.council, CH.redteam, CH.refuse, CH.memory, CH.room, CH.end]) {
    const d = Math.abs(t - cut);
    if (d < 0.3) { sc.fillStyle = `rgba(0,0,0,${0.7 * (1 - d / 0.3)})`; sc.fillRect(0, 0, W, H); }
  }
  if (t > DUR - 0.8) { sc.fillStyle = `rgba(0,0,0,${(t - (DUR - 0.8)) / 0.8})`; sc.fillRect(0, 0, W, H); }
}

const main = createCanvas(W, H), ctx = main.getContext("2d");
const scC = createCanvas(W, H), sc = scC.getContext("2d");

if (PREVIEW) {
  fs.mkdirSync(path.join(OUT, "v5-preview"), { recursive: true });
  for (let fr = 0; fr < FRAMES; fr += 15) {
    seed = 424242 + fr * 7919;
    renderFrame(sc, fr / FPS);
    ctx.drawImage(scC, 0, 0); ctx.drawImage(VIG, 0, 0);
    fs.writeFileSync(path.join(OUT, "v5-preview", `f${String(fr).padStart(4, "0")}.jpg`), main.toBuffer("image/jpeg", 72));
  }
  console.log("preview frames written to dist-video/v5-preview");
  process.exit(0);
}

console.log("audio mix…");
const audioWav = buildAudio();

const outMp4 = path.join(OUT, "truffletrade-v5.mp4");
const ff = spawn(ffmpegPath, [
  "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", `${W}x${H}`, "-r", String(FPS), "-i", "-",
  "-i", audioWav, "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p",
  "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", outMp4,
], { stdio: ["pipe", "inherit", "inherit"] });
ff.on("exit", (c) => { if (c !== 0) process.exit(c); });

const raw = Buffer.alloc(W * H * 3);
for (let fr = 0; fr < FRAMES; fr++) {
  seed = 424242 + fr * 7919;
  renderFrame(sc, fr / FPS);
  ctx.drawImage(scC, 0, 0);
  ctx.drawImage(VIG, 0, 0);
  const tile = NOISE[fr % NOISE.length];
  const ox = -((rnd() * 100) | 0), oy = -((rnd() * 100) | 0);
  for (let ty = oy; ty < H; ty += 256) for (let tx = ox; tx < W; tx += 256) ctx.drawImage(tile, tx, ty);
  const img = ctx.getImageData(0, 0, W, H).data;
  let o = 0;
  for (let i = 0; i < img.length; i += 4) { raw[o++] = img[i]; raw[o++] = img[i + 1]; raw[o++] = img[i + 2]; }
  if (!ff.stdin.write(raw)) await new Promise((r) => ff.stdin.once("drain", r));
  if (fr % 150 === 0) console.log(`frame ${fr}/${FRAMES}`);
}
ff.stdin.end();
await new Promise((r) => ff.on("close", r));

// web copy: 720×1280, tuned for the homepage autoplay card (small, faststart)
const webMp4 = path.join(ROOT, "public/video/truffletrade-short.mp4");
execFileSync(ffmpegPath, ["-y", "-i", outMp4, "-vf", "scale=720:1280", "-c:v", "libx264", "-preset", "slow", "-crf", "27", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", webMp4], { stdio: "ignore" });
// poster frame for the <video poster>
execFileSync(ffmpegPath, ["-y", "-ss", "8.4", "-i", outMp4, "-frames:v", "1", "-vf", "scale=720:1280", "-update", "1", path.join(ROOT, "public/video/truffletrade-short-poster.jpg")], { stdio: "ignore" });
for (const s of [1.5, 4, 9, 12.5, 16.5, 20, 24, DUR - 2.5]) {
  execFileSync(ffmpegPath, ["-y", "-ss", String(s), "-i", outMp4, "-frames:v", "1", "-vf", "scale=306:544", "-update", "1", path.join(OUT, `v5ps-${String(s).replace(".", "_")}.png`)], { stdio: "ignore" });
}
console.log("DONE:", outMp4, "→", webMp4, `(${(fs.statSync(webMp4).size / 1e6).toFixed(2)} MB)`);
