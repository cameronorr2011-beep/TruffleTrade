// TruffleTrade cinematic v3 — "the premium one".
// Fixes every v2 critique:
//   DEPTH   → real perspective projection (a tiny 3D engine: planes in
//             camera space, painter-sorted, projected per-frame). The
//             monitor plane carries the REAL product screenshot; the room
//             is layered geometry with parallax; the camera dollies.
//   LOGO    → the official truffletrade mark (public/logo.svg rasterized
//             at 720px) as the opening hero and closing card.
//   PRODUCT → actual screenshots (dashboard, analyst) captured from the
//             running app, shown as "the works" with slow camera moves.
//   FLASH   → none. Cuts are clean; only fades and camera motion.
//   BEAT    → zooms/cuts land on detected onsets of the actual song
//             (Mortals, NCS), not a guessed grid.
//   VOICE   → neural-style VO lines (Windows SAPI neural-ish David, SSML
//             prosody) mixed UNDER the track, ducking it -12dB while
//             speaking. VO timing drives the edit.
// Length: 28s (VO total ~22s of speech across 5 lines).
import fs from "node:fs";
import path from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import ffmpegPath from "ffmpeg-static";
import { spawn, execFileSync } from "node:child_process";

const W = 1080, H = 1920, FPS = 30, DUR = 28, FRAMES = DUR * FPS;
const OUT = path.join(import.meta.dirname, "..", "dist-video");
fs.mkdirSync(OUT, { recursive: true });

// ---------- assets ----------
const LOGO = await loadImage(fs.readFileSync(path.join(import.meta.dirname, "..", "public/logo.svg")));
const SHOTS = {
  dashboard: await loadImage(fs.readFileSync(path.join(OUT, "shot-dashboard.png"))),
  analyst: await loadImage(fs.readFileSync(path.join(OUT, "shot-analyst.png"))),
};

// ---------- audio analysis (onsets of the chosen excerpt) ----------
// Song: Warriyo - Mortals (feat. Laura Brehm) [NCS Release]
// Excerpt 26.0-54.0 (28s): quiet build 26-32, first swell 32-38,
// drive 38-46, full drop 46-54. Onsets measured from the decoded PCM.
const SRC = path.join(OUT, "mortals.mp3");
const EXCERPT_START = 26.0;
const ONSETS = (() => {
  const RAW = path.join(OUT, "v3.pcm");
  execFileSync(ffmpegPath, ["-y", "-ss", String(EXCERPT_START), "-t", String(DUR), "-i", SRC, "-ac", "1", "-ar", "48000", "-f", "s16le", RAW], { stdio: ["ignore", "ignore", "ignore"] });
  const pcm = fs.readFileSync(RAW);
  const n = pcm.length >> 1;
  const sig = new Float32Array(n);
  for (let i = 0; i < n; i++) sig[i] = pcm.readInt16LE(i * 2) / 32768;
  const SR = 48000, HOP = 480; // 10ms
  const envLen = Math.floor(n / HOP);
  const env = new Float32Array(envLen);
  for (let i = 0; i < envLen; i++) { let s = 0; for (let j = 0; j < HOP; j++) { const v = sig[i * HOP + j]; s += v * v; } env[i] = Math.sqrt(s / HOP); }
  const flux = new Float32Array(envLen);
  for (let i = 1; i < envLen; i++) flux[i] = Math.max(0, env[i] - env[i - 1]);
  // adaptive-threshold onset picking
  const onsets = [];
  const WIN = 30; // 300ms
  for (let i = WIN; i < envLen - 1; i++) {
    let mean = 0; for (let j = i - WIN; j <= i + WIN; j++) mean += flux[j];
    mean /= 2 * WIN + 1;
    if (flux[i] > mean * 2.2 && flux[i] >= flux[i - 1] && flux[i] > flux[i + 1]) {
      const t = i / 100;
      if (onsets.length === 0 || t - onsets[onsets.length - 1] > 0.25) onsets.push(+t.toFixed(2));
    }
  }
  return onsets;
})();
const onsetsNear = (t, tol = 0.18) => ONSETS.some((o) => Math.abs(o - t) < tol);
console.log(`onsets in excerpt: ${ONSETS.length}; first 8:`, ONSETS.slice(0, 8));

// ---------- VO ----------
const VO = JSON.parse(fs.readFileSync(path.join(OUT, "vo-timings.json"), "utf8"));
// VO schedule (start times in the 28s timeline) — drives the edit.
const VO_AT = { l1: 1.2, l2: 5.4, l3: 13.0, l4: 17.2, l5: 22.6 };

// ---------- scenes (VO-driven) ----------
// S1 hero logo (0 - 4.8)      l1 over it
// S2 the desk / monitor 3D    l2 over it (5.4-11.4)
// S3 the works: product tour  l3 (13.0) + l4 (17.2)
// S4 end card + logo          l5 (22.6-28)
const SCENE_CUTS = [0, 4.8, 12.2, 21.4];

// ---------- tiny 3D engine ----------
// Camera at origin looking down +z. Plane: center (x,y,z), size (w,h),
// rotation (rx around x-axis = pitch back). Project perspective.
function project(px, py, pz, camX, camY, camZ, f) {
  const dz = pz - camZ;
  const s = f / dz;
  return { x: W / 2 + (px - camX) * s, y: H / 2 + (py - camY) * s, s, z: dz };
}
function drawPlane3D(ctx, img, cx, cy, cz, w, h, pitch, cam, opts = {}) {
  const f = opts.f ?? 900;
  // corners in world space (pitch rotates around the plane's center x-axis)
  const cos = Math.cos(pitch), sin = Math.sin(pitch);
  const corners = [
    [-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2],
  ].map(([lx, ly]) => {
    // rotate around x axis: y' = ly*cos - z*sin ; z' = ly*sin + z*cos (z=0 plane)
    const wy = cy + ly * cos;
    const wz = cz + ly * sin;
    return { wx: cx + lx, wy, wz };
  });
  const proj = corners.map((c) => project(c.wx, c.wy, c.wz, cam.x, cam.y, cam.z, f));
  // painter: skip if any corner behind camera
  if (proj.some((p) => p.z <= 10)) return;
  ctx.save();
  if (opts.shadow) {
    ctx.shadowColor = "rgba(0,0,0,0.55)"; ctx.shadowBlur = 40; ctx.shadowOffsetY = 24;
  }
  ctx.beginPath();
  ctx.moveTo(proj[0].x, proj[0].y);
  for (let i = 1; i < 4; i++) ctx.lineTo(proj[i].x, proj[i].y);
  ctx.closePath();
  ctx.fillStyle = opts.fill ?? "#000";
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.clip();
  // fill-only plane (no texture) — depth geometry layer
  if (!img) { ctx.restore(); return; }
  // draw the texture with an affine approximation of the quad (top edge + height mapping)
  const x0 = proj[0], x1 = proj[1], x3 = proj[3];
  const ax = x1.x - x0.x, ay = x1.y - x0.y;
  const bx = x3.x - x0.x, by = x3.y - x0.y;
  ctx.transform(ax / img.width, ay / img.width, bx / img.height, by / img.height, x0.x, x0.y);
  ctx.drawImage(img, 0, 0);
  ctx.restore();
  if (opts.glow) {
    ctx.save();
    ctx.globalAlpha = 0.5 + 0.2 * Math.sin(opts.glow * 6);
    ctx.strokeStyle = "rgba(110,220,160,0.8)"; ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(proj[0].x, proj[0].y);
    for (let i = 1; i < 4; i++) ctx.lineTo(proj[i].x, proj[i].y);
    ctx.closePath(); ctx.stroke();
    ctx.restore();
  }
}

// ---------- post ----------
const NOISE = Array.from({ length: 10 }, () => {
  const c = createCanvas(256, 256), x = c.getContext("2d");
  const img = x.createImageData(256, 256);
  for (let i = 0; i < img.data.length; i += 4) { const v = Math.floor(Math.random() * 255); img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 14; }
  x.putImageData(img, 0, 0); return c;
});
const VIG = (() => { const c = createCanvas(W, H), x = c.getContext("2d");
  const g = x.createRadialGradient(W / 2, H / 2, H * 0.32, W / 2, H / 2, H * 0.8);
  g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,0.62)");
  x.fillStyle = g; x.fillRect(0, 0, W, H); return c; })();

let seed = 31337;
const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const easeInOut = (v) => (v < 0.5 ? 2 * v * v : 1 - Math.pow(-2 * v + 2, 2) / 2);
const easeOutCubic = (v) => 1 - Math.pow(1 - clamp01(v), 3);
function setFont(ctx, size, weight = "bold", mono = true) { ctx.font = `${weight} ${size}px ${mono ? '"Courier New", monospace' : '"Arial", sans-serif'}`; }
function centerText(ctx, text, y, size, color, sp = 4, mono = true) {
  setFont(ctx, size, "bold", mono);
  let w = 0; for (const ch of text) w += ctx.measureText(ch).width + sp;
  w -= sp;
  let x = (W - w) / 2; ctx.fillStyle = color;
  for (const ch of text) { ctx.fillText(ch, x, y); x += ctx.measureText(ch).width + sp; }
}

// ---------- scenes ----------
function drawRoomBackdrop(ctx, t, cam, warm = false) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, warm ? "#140a08" : "#05080d");
  g.addColorStop(1, "#01030 4".replace(" ", ""));
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // far window planes in 3D (real parallax as camera moves)
  for (let i = 0; i < 3; i++) {
    const wx = -700 + i * 700 + Math.sin(t * 0.1 + i) * 10;
    drawPlane3D(ctx, null, wx, 200, 1400 + i * 300, 260, 700, 0, cam, {
      f: 900, fill: warm ? "rgba(120,60,40,0.10)" : "rgba(90,160,120,0.08)",
    });
  }
  // floor plane
  drawPlane3D(ctx, null, 0, 640, 1200, 3000, 1600, -Math.PI / 2 + 0.18, cam, { f: 900, fill: "rgba(12,20,15,0.9)" });
  // dust
  ctx.save();
  for (let i = 0; i < 30; i++) {
    const px = (i * 231.7 + t * (4 + (i % 4) * 2)) % W;
    const py = (i * 411.3 + Math.sin(t * 0.35 + i) * 24) % H;
    ctx.globalAlpha = 0.05 + 0.04 * Math.sin(t * 0.7 + i * 1.9);
    ctx.fillStyle = "#cfe8d6";
    ctx.beginPath(); ctx.arc(px, py, 1 + (i % 3), 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function s1Hero(ctx, t, cam) {
  drawRoomBackdrop(ctx, t, cam);
  // logo floats in 3D, slow approach, gentle tilt
  const appear = easeOutCubic(clamp01(t / 1.4));
  const drift = Math.sin(t * 0.5) * 0.03;
  const zoom = 1 + 0.05 * easeInOut(clamp01(t / 28));
  ctx.save();
  ctx.globalAlpha = appear;
  drawPlane3D(ctx, LOGO, 0, -40, 620 - 60 * easeInOut(clamp01(t / 4.8)), 420 * zoom, 420 * zoom, drift, cam, { f: 900 });
  ctx.restore();
  centerText(ctx, "truffletrade.", H * 0.62, 58, "#eef3ec", 6, false);
  if (t > 2.2) centerText(ctx, "RESEARCH TERMINAL", H * 0.62 + 62, 24, "#8a978c", 8);
}

function s2Desk(ctx, t, cam, f) {
  drawRoomBackdrop(ctx, t, cam);
  const local = t - SCENE_CUTS[1];
  // the monitor: REAL dashboard screenshot on a 3D plane, slow dolly-in
  const z = 760 - 90 * easeInOut(clamp01(local / 7));
  const pitch = -0.06 + Math.sin(t * 0.3) * 0.015;
  drawPlane3D(ctx, SHOTS.dashboard, 0, -60, z, 980, 620, pitch, cam, { f: 950, shadow: true, glow: 0.4 + 0.1 * Math.sin(t) });
  // caption at the VO beat
  if (t > 6.2) centerText(ctx, "NINE ANALYSTS. ONE CHART.", H * 0.82, 46, "#eef3ec", 6);
  if (t > 8.4) centerText(ctx, "A RED TEAM THAT SAYS NO.", H * 0.82 + 66, 40, "#ff6b6b", 5);
}

function s3Works(ctx, t, cam, f) {
  drawRoomBackdrop(ctx, t, cam);
  const local = t - SCENE_CUTS[2];
  // product tour: two screenshots as parallel planes, camera slides between
  const slide = easeInOut(clamp01((local - 2.5) / 2.2)); // switch at local 2.5-4.7
  const zA = 700, zB = 760;
  const xA = slide * -1400;
  const xB = (1 - slide) * 1400;
  drawPlane3D(ctx, SHOTS.analyst, xA, -50, zA, 1000, 640, -0.05, cam, { f: 950, shadow: true });
  drawPlane3D(ctx, SHOTS.dashboard, xB, -50, zB, 1000, 640, -0.05, cam, { f: 950, shadow: true });
  // captions crossfade: refusal fades 17.3-17.9, keeps-score fades in 18.0+
  const refAlpha = t > 13.6 ? (t < 17.3 ? 1 : Math.max(0, 1 - (t - 17.3) / 0.6)) : 0;
  if (refAlpha > 0) {
    ctx.save(); ctx.globalAlpha = refAlpha;
    centerText(ctx, "IT REFUSES TO GUESS.", H * 0.16, 52, "#ff6b6b", 6);
    ctx.restore();
  }
  const scoreAlpha = t > 18.0 ? Math.min(1, (t - 18.0) / 0.5) : 0;
  if (scoreAlpha > 0) {
    ctx.save(); ctx.globalAlpha = scoreAlpha;
    centerText(ctx, "IT KEEPS SCORE.", H * 0.16, 52, "#eef3ec", 6);
    ctx.restore();
  }
  if (t > 19.2) centerText(ctx, "EVEN THE MISSES.", H * 0.16 + 62, 34, "#8a978c", 5);
}

function s4End(ctx, t, cam) {
  drawRoomBackdrop(ctx, t, cam);
  const local = t - SCENE_CUTS[3];
  const breathe = 1 + 0.03 * Math.sin(local * 1.3);
  ctx.save(); ctx.globalAlpha = easeOutCubic(clamp01(local / 0.9));
  drawPlane3D(ctx, LOGO, 0, -220, 640, 360 * breathe, 360 * breathe, Math.sin(local * 0.4) * 0.02, cam, { f: 900 });
  ctx.restore();
  if (local > 0.7) centerText(ctx, "SEE EVERY SIDE.", H * 0.47, 62, "#eef3ec", 8);
  if (local > 1.3) centerText(ctx, "THEN DECIDE.", H * 0.47 + 96, 62, "#4fe08a", 8);
  if (local > 2.0) centerText(ctx, "truffletrade.vercel.app", H * 0.47 + 210, 30, "#8a978c", 4);
  if (local > 2.6) centerText(ctx, "18+ · ANALYSIS, NOT ADVICE", H * 0.47 + 280, 20, "#5a675c", 4);
}

const SCENES = [s1Hero, s2Desk, s3Works, s4End];
function sceneAt(t) { let s = 0; for (let i = 0; i < SCENE_CUTS.length; i++) if (t >= SCENE_CUTS[i]) s = i; return s; }

// ---------- camera ----------
// gentle dolly; on strong onsets a tiny push (no flash)
function camera(t) {
  const base = { x: 0, y: 0, z: -600 };
  const drift = Math.sin(t * 0.22) * 18;
  let push = 0;
  for (const o of ONSETS) {
    const d = t - o;
    if (d >= 0 && d < 0.4) push = Math.max(push, (1 - d / 0.4) * 26);
  }
  return { x: drift, y: Math.cos(t * 0.17) * 10, z: base.z + push + t * 6 };
}

// ---------- audio mix ----------
function buildAudio() {
  const SR = 48000, N = SR * DUR;
  const L = new Float32Array(N), R = new Float32Array(N);
  // decode song excerpt to PCM
  const raw = path.join(OUT, "v3.pcm");
  execFileSync(ffmpegPath, ["-y", "-ss", String(EXCERPT_START), "-t", String(DUR), "-i", SRC, "-ac", "2", "-ar", String(SR), "-f", "s16le", raw], { stdio: ["ignore", "ignore", "ignore"] });
  const pcm = fs.readFileSync(raw);
  const frames = pcm.length >> 2;
  for (let i = 0; i < Math.min(frames, N); i++) {
    L[i] = pcm.readInt16LE(i * 4) / 32768;
    R[i] = pcm.readInt16LE(i * 4 + 2) / 32768;
  }
  // VO on top with music duck -13dB while speaking (simple envelope)
  const voGain = new Float32Array(N).fill(1);
  for (const line of VO) {
    const start = (VO_AT[line.id] ?? 0) * SR;
    const end = start + line.dur * SR;
    const fade = 0.25 * SR;
    for (let i = Math.max(0, start - fade); i < Math.min(N, end + fade); i++) {
      const t = i / SR;
      let g = 0.22; // ducked music level
      if (i < start) g = 1 + (0.22 - 1) * ((i - (start - fade)) / fade);
      if (i > end) g = 0.22 + (1 - 0.22) * ((i - end) / fade);
      voGain[i] = Math.max(0.22, Math.min(1, g));
    }
  }
  for (let i = 0; i < N; i++) { L[i] *= voGain[i]; R[i] *= voGain[i]; }
  // decode each VO wav and add
  for (const line of VO) {
    const wavP = path.join(OUT, `vo-${line.id}.wav`);
    execFileSync(ffmpegPath, ["-y", "-i", wavP, "-ac", "2", "-ar", String(SR), "-f", "s16le", path.join(OUT, "vo-tmp.pcm")], { stdio: ["ignore", "ignore", "ignore"] });
    const vpcm = fs.readFileSync(path.join(OUT, "vo-tmp.pcm"));
    const start = Math.floor((VO_AT[line.id] ?? 0) * SR);
    const vframes = vpcm.length >> 2;
    for (let i = 0; i < vframes; i++) {
      const idx = start + i;
      if (idx >= N) break;
      const inF = i / SR;
      const env = Math.min(1, inF / 0.03, (vframes / SR - inF) / 0.08);
      L[idx] += vpcm.readInt16LE(i * 4) / 32768 * 1.5 * env;
      R[idx] += vpcm.readInt16LE(i * 4 + 2) / 32768 * 1.5 * env;
    }
  }
  // master soft clip + fades
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    let l = Math.tanh(L[i] * 1.1), r = Math.tanh(R[i] * 1.1);
    if (t < 0.4) { l *= t / 0.4; r *= t / 0.4; }
    if (t > DUR - 0.8) { const g = Math.max(0, 1 - (t - (DUR - 0.8)) / 0.8); l *= g; r *= g; }
    L[i] = l; R[i] = r;
  }
  const wav = Buffer.alloc(44 + N * 4);
  wav.write("RIFF", 0); wav.writeUInt32LE(36 + N * 4, 4); wav.write("WAVE", 8);
  wav.write("fmt ", 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22);
  wav.writeUInt32LE(SR, 24); wav.writeUInt32LE(SR * 4, 28); wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34);
  wav.write("data", 36); wav.writeUInt32LE(N * 4, 40);
  for (let i = 0; i < N; i++) {
    wav.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(L[i] * 32767))), 44 + i * 4);
    wav.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(R[i] * 32767))), 46 + i * 4);
  }
  const wavPath = path.join(OUT, "v3-audio.wav");
  fs.writeFileSync(wavPath, wav);
  return wavPath;
}
console.log("mixing audio…");
const audioWav = buildAudio();

// ---------- encode ----------
const outMp4 = path.join(OUT, "truffletrade-v3.mp4");
const ff = spawn(ffmpegPath, [
  "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", `${W}x${H}`, "-r", String(FPS), "-i", "-",
  "-i", audioWav, "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
  "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", outMp4,
], { stdio: ["pipe", "inherit", "inherit"] });
ff.on("exit", (c) => { if (c !== 0) process.exit(c); });

const main = createCanvas(W, H), ctx = main.getContext("2d");
const scCanvas = createCanvas(W, H), sc = scCanvas.getContext("2d");
const raw = Buffer.alloc(W * H * 3);

(async () => {
  for (let f = 0; f < FRAMES; f++) {
    seed = 777 + f * 7919;
    const t = f / FPS;
    const cam = camera(t);
    const s = sceneAt(t);
    sc.clearRect(0, 0, W, H);
    sc.fillStyle = "#000"; sc.fillRect(0, 0, W, H);
    SCENES[s](sc, t, cam, f);
    // cut transition: 0.3s crossfade into black between scenes (no flash)
    const sinceCut = t - SCENE_CUTS[s];
    if (sinceCut < 0.3 && s > 0) {
      sc.fillStyle = `rgba(0,0,0,${1 - sinceCut / 0.3})`; sc.fillRect(0, 0, W, H);
    }
    ctx.drawImage(scCanvas, 0, 0);
    ctx.drawImage(VIG, 0, 0);
    const tile = NOISE[f % NOISE.length];
    const tox = -Math.floor(rnd() * 100), toy = -Math.floor(rnd() * 100);
    for (let ty = toy; ty < H; ty += 256) for (let tx = tox; tx < W; tx += 256) ctx.drawImage(tile, tx, ty);
    if (t < 0.5) { ctx.fillStyle = `rgba(0,0,0,${1 - t / 0.5})`; ctx.fillRect(0, 0, W, H); }
    if (t > DUR - 0.6) { ctx.fillStyle = `rgba(0,0,0,${(t - (DUR - 0.6)) / 0.6})`; ctx.fillRect(0, 0, W, H); }
    const img = ctx.getImageData(0, 0, W, H).data;
    let o = 0;
    for (let i = 0; i < img.length; i += 4) { raw[o++] = img[i]; raw[o++] = img[i + 1]; raw[o++] = img[i + 2]; }
    if (!ff.stdin.write(raw)) await new Promise((r) => ff.stdin.once("drain", r));
    if (f % 120 === 0) console.log(`frame ${f}/${FRAMES}`);
  }
  ff.stdin.end();
  await new Promise((r) => ff.on("close", r));
  // preview stills
  for (const s of [1.5, 8.0, 15.0, 24.5]) {
    execFileSync(ffmpegPath, ["-y", "-ss", String(s), "-i", outMp4, "-frames:v", "1", "-update", "1", path.join(OUT, `v3p-${s}.png`)], { stdio: ["ignore", "ignore", "ignore"] });
    execFileSync(ffmpegPath, ["-y", "-i", path.join(OUT, `v3p-${s}.png`), "-vf", "scale=306:544", path.join(OUT, `v3ps-${s}.png`)], { stdio: ["ignore", "ignore", "ignore"] });
  }
  console.log("DONE:", outMp4);
})();
