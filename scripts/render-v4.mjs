// TruffleTrade v4 — "the flythrough".
// A real 3D room (bedroom-study): floor, walls, window with light shafts,
// desk, monitor on the desk showing the REAL dashboard, wall posters.
// The camera starts at the door, flies through the room toward the desk,
// banks around the monitor, dives INTO the screen (product tour inside),
// then pulls out to the end card. ElevenLabs VO (7 lines, auto-timed from
// your master) over Deaf Kev - Invincible (NCS) with sidechain ducking.
// No flashing. Every move motivated by the VO.
import fs from "node:fs";
import path from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import ffmpegPath from "ffmpeg-static";
import { spawn, execFileSync } from "node:child_process";

const W = 1080, H = 1920, FPS = 30;
const OUT = path.join(import.meta.dirname, "..", "dist-video");
const VO = JSON.parse(fs.readFileSync(path.join(OUT, "vo-v4-timings.json"), "utf8"));

// ---------- timeline: VO-driven ----------
// Each scene starts shortly before its VO line (0.7s lead-in).
const at = {};
{
  let t = 1.0;
  for (const line of VO) { at[line.id] = t; t += line.dur + 1.15; }
}
const DUR = Math.ceil(at.l7 + VO.find((v) => v.id === "l7").dur + 4.2); // end card breathing
const FRAMES = DUR * FPS;
console.log(`timeline:`, Object.fromEntries(Object.entries(at).map(([k, v]) => [k, +v.toFixed(2)])), `total ${DUR}s`);

// scene boundaries (camera chapters)
const C_DOOR = 0, C_FLY = at.l2 - 0.7, C_DESK = at.l3 - 0.7, C_DIVE = at.l4 - 0.7,
      C_SCORE = at.l5 - 0.7, C_MEMORY = at.l6 - 0.7, C_OUT = at.l7 - 0.9;

// ---------- assets ----------
const LOGO = await loadImage(fs.readFileSync(path.join(import.meta.dirname, "..", "public/logo.svg")));
const SHOT_DASH = await loadImage(fs.readFileSync(path.join(OUT, "shot-dashboard.png")));
const SHOT_ANALYST = await loadImage(fs.readFileSync(path.join(OUT, "shot-analyst.png")));

// ---------- 3D core ----------
// world: y up, x right, z into scene. camera at (cx,cy,cz) looking +z,
// yaw rotates around y, pitch around x. perspective f = focal in px.
function proj(wx, wy, wz, cam, f) {
  const dx = wx - cam.x, dy = wy - cam.y, dz = wz - cam.z;
  const cy = Math.cos(-cam.yaw), sy = Math.sin(-cam.yaw);
  let x = dx * cy - dz * sy;
  let z = dx * sy + dz * cy;
  const cp = Math.cos(-cam.pitch), sp = Math.sin(-cam.pitch);
  let y = dy * cp - z * sp;
  z = dy * sp + z * cp;
  if (z <= 8) return null;
  const s = f / z;
  return { x: W / 2 + x * s, y: H / 2 - y * s, s, z };
}
// quad (4 world corners) -> screen path
function quadPath(ctx, corners, cam, f) {
  const p = corners.map((c) => proj(c[0], c[1], c[2], cam, f));
  if (p.some((q) => q === null)) return null;
  ctx.beginPath();
  ctx.moveTo(p[0].x, p[0].y);
  for (let i = 1; i < 4; i++) ctx.lineTo(p[i].x, p[i].y);
  ctx.closePath();
  return p;
}
function plane(ctx, img, cx, cy, cz, w, h, cam, f, opts = {}) {
  const hw = w / 2, hh = h / 2;
  const corners = [
    [cx - hw, cy + hh, cz], [cx + hw, cy + hh, cz], [cx + hw, cy - hh, cz], [cx - hw, cy - hh, cz],
  ];
  const p = quadPath(ctx, corners, cam, f);
  if (!p) return;
  ctx.save();
  if (opts.shadow) { ctx.shadowColor = "rgba(0,0,0,0.5)"; ctx.shadowBlur = 30; ctx.shadowOffsetY = 12; }
  ctx.fillStyle = opts.fill ?? "#0a0f0c";
  ctx.fill();
  ctx.shadowBlur = 0;
  if (img) {
    ctx.clip();
    // affine map from corners: origin p0, u = p1-p0, v = p3-p0
    const p0 = p[0], u = { x: p[1].x - p0.x, y: p[1].y - p0.y }, v = { x: p[3].x - p0.x, y: p[3].y - p0.y };
    ctx.transform(u.x / img.width, u.y / img.width, v.x / img.height, v.y / img.height, p0.x, p0.y);
    ctx.drawImage(img, 0, 0);
    if (opts.dim) { ctx.globalAlpha = opts.dim; ctx.fillStyle = "#000"; ctx.fillRect(0, 0, img.width, img.height); }
  }
  ctx.restore();
  if (opts.glow) {
    ctx.save(); ctx.globalAlpha = 0.55; ctx.strokeStyle = "rgba(110,220,160,0.7)"; ctx.lineWidth = 2;
    quadPath(ctx, corners, cam, f); ctx.stroke(); ctx.restore();
  }
}
function solidQuad(ctx, corners, color, cam, f) {
  const p = quadPath(ctx, corners, cam, f);
  if (!p) return;
  ctx.fillStyle = color; ctx.fill();
}

// ---------- the room ----------
const ROOM = { w: 560, h: 320, d: 520 };  // x: -280..280, y: 0..320, z: -60..460
const DESK = { x: 0, y: 96, z: 330, w: 240, d: 90, h: 8 };
const MON = { x: 0, y: 152, z: 322, w: 150, h: 92 };

function drawRoom(ctx, cam, f, t, opts = {}) {
  const R = ROOM;
  // ambient fill so geometry reads in the dark
  const amb = ctx.createRadialGradient(W/2, H*0.55, H*0.1, W/2, H*0.55, H*0.75);
  amb.addColorStop(0, "rgba(30,48,38,0.55)");
  amb.addColorStop(1, "rgba(4,7,5,0.9)");
  ctx.fillStyle = amb; ctx.fillRect(0, 0, W, H);
  // floor: dark wood-ish
  solidQuad(ctx, [[-R.w/2,0,-60],[R.w/2,0,-60],[R.w/2,0,R.d],[-R.w/2,0,R.d]], "#16211a", cam, f);
  // ceiling
  solidQuad(ctx, [[-R.w/2,R.h,-60],[R.w/2,R.h,-60],[R.w/2,R.h,R.d],[-R.w/2,R.h,R.d]], "#0a0f0d", cam, f);
  // back wall (behind desk)
  solidQuad(ctx, [[-R.w/2,0,R.d],[R.w/2,0,R.d],[R.w/2,R.h,R.d],[-R.w/2,R.h,R.d]], opts.backColor ?? "#122019", cam, f);
  // left wall + right wall
  solidQuad(ctx, [[-R.w/2,0,-60],[-R.w/2,0,R.d],[-R.w/2,R.h,R.d],[-R.w/2,R.h,-60]], "#0e1712", cam, f);
  solidQuad(ctx, [[R.w/2,0,-60],[R.w/2,0,R.d],[R.w/2,R.h,R.d],[R.w/2,R.h,-60]], "#0e1712", cam, f);
  // door (on back-left, tall dark panel with frame)
  plane(ctx, null, -R.w/2+70, 90, R.d-2, 76, 150, cam, f, { fill: "#1a241d" });
  // window on left wall: frame + light shaft
  plane(ctx, null, -R.w/2+2, 200, 160, 8, 110, cam, f, { fill: "rgba(140,220,170,0.28)" });
  // light pool on floor under window
  solidQuad(ctx, [[-R.w/2,1,120],[-R.w/2+120,1,210],[-R.w/2+150,1,300],[-R.w/2+40,1,260]], "rgba(120,200,150,0.10)", cam, f);
  // posters on right wall (logo + chart motif)
  plane(ctx, LOGO, R.w/2-2, 210, 140, 46, 46, cam, f, { fill: "#0c110d" });
  plane(ctx, null, R.w/2-2, 130, 240, 40, 52, cam, f, { fill: "#0d1410" });
  // rug
  solidQuad(ctx, [[-110,1.5,140],[110,1.5,140],[130,1.5,260],[-130,1.5,260]], "rgba(46,66,52,0.95)", cam, f);
  // desk: top + legs
  plane(ctx, null, DESK.x, DESK.y, DESK.z, DESK.w, DESK.d, cam, f, { fill: "#161b16", pitchless: true });
  solidQuad(ctx, [
    [DESK.x-DESK.w/2, DESK.y, DESK.z], [DESK.x+DESK.w/2, DESK.y, DESK.z],
    [DESK.x+DESK.w/2, DESK.y-70, DESK.z], [DESK.x-DESK.w/2, DESK.y-70, DESK.z],
  ].map(([x,y,z])=>[x, y-((DESK.d/2)*(0)), z+0]), "rgba(0,0,0,0)", cam, f); // (kept simple: top only)
  // monitor: stand + screen (dashboard texture)
  plane(ctx, null, MON.x, MON.y-26, MON.z+4, 10, 26, cam, f, { fill: "#11150f" });
  plane(ctx, null, MON.x, MON.y-40, MON.z+4, 44, 6, cam, f, { fill: "#141812" });
  const screen = opts.screen === "analyst" ? SHOT_ANALYST : SHOT_DASH;
  plane(ctx, screen, MON.x, MON.y, MON.z, MON.w, MON.h, cam, f, { fill: "#050a07", glow: opts.glowScreen, shadow: true });
  // screen light spill on desk
  solidQuad(ctx, [
    [MON.x-MON.w*0.7, DESK.y+0.5, DESK.z-DESK.d/2],
    [MON.x+MON.w*0.7, DESK.y+0.5, DESK.z-DESK.d/2],
    [MON.x+MON.w*0.9, DESK.y+0.5, DESK.z+DESK.d/2],
    [MON.x-MON.w*0.9, DESK.y+0.5, DESK.z+DESK.d/2],
  ], "rgba(110,220,160,0.10)", cam, f);
  // chair silhouette (simple box shapes) left of desk
  plane(ctx, null, DESK.x+150, 60, DESK.z+30, 46, 12, cam, f, { fill: "#1c231c" });
  plane(ctx, null, DESK.x+150, 92, DESK.z+52, 46, 60, cam, f, { fill: "#171d17" });
}

// ---------- camera path ----------
const V = { lerp: (a, b, t) => a + (b - a) * t, ease: (v) => (v < 0.5 ? 2*v*v : 1 - Math.pow(-2*v+2, 2)/2) };
function seg(t, a, b) { return V.ease(Math.max(0, Math.min(1, (t - a) / (b - a)))); }
function cameraAt(t) {
  // chapters: door -> fly -> desk -> dive(inside screen) -> score(inside) -> memory -> pull-out
  let cam = { x: -180, y: 130, z: -40, yaw: 0.5, pitch: -0.03, f: 800 };
  const mix = (from, to, k) => ({
    x: V.lerp(from.x, to.x, k), y: V.lerp(from.y, to.y, k), z: V.lerp(from.z, to.z, k),
    yaw: V.lerp(from.yaw, to.yaw, k), pitch: V.lerp(from.pitch, to.pitch, k), f: V.lerp(from.f ?? 800, to.f ?? 800, k),
  });
  const atDoor = { x: -180, y: 130, z: -40, yaw: 0.5, pitch: -0.03, f: 800 };
  const atMid  = { x: -60,  y: 120, z: 60,  yaw: 0.28, pitch: -0.02, f: 820 };
  const atDesk = { x: -8,   y: 132, z: 176, yaw: 0.04, pitch: -0.02, f: 860 };
  const atDive = { x: 0,    y: 148, z: 268, yaw: 0.0,  pitch: -0.01, f: 900 };
  const inside = { x: 0,    y: 0,   z: 240, yaw: 0.0,  pitch: 0.0,  f: 1000 };
  if (t < C_FLY) return mix(atDoor, atMid, seg(t, 0.3, C_FLY));
  if (t < C_DESK) return mix(atMid, atDesk, seg(t, C_FLY, C_DESK));
  if (t < C_DIVE) return mix(atDesk, atDive, seg(t, C_DESK, C_DIVE - 0.8));
  if (t < C_SCORE) return mix(atDive, inside, seg(t, C_DIVE - 0.8, C_DIVE)); // dive through screen
  if (t < C_MEMORY) return { ...inside, x: 30 * Math.sin(t * 0.3), z: 240 - 60 * seg(t, C_SCORE, C_MEMORY) };
  if (t < C_OUT) return { ...inside, z: 240 - 80 * seg(t, C_SCORE, C_MEMORY) };
  // pull back out to the logo world: interpolate to a final wide shot
  const k = seg(t, C_OUT, C_OUT + 1.4);
  return mix(inside, { x: 0, y: 148, z: 120, yaw: 0, pitch: 0, f: 820 }, k);
}

// ---------- scenes inside the screen (product tour) ----------
function insideScreen(ctx, cam, f, t) {
  // black space with three floating panels: analyst, dashboard, ledger strip
  ctx.fillStyle = "#03060a"; ctx.fillRect(0, 0, W, H);
  const drift = Math.sin(t * 0.25) * 14;
  const slide = V.ease(Math.max(0, Math.min(1, (t - C_SCORE) / 2.2)));
  plane(ctx, SHOT_ANALYST, -260 + slide * 90, 40 + drift * 0.4, 420, 620, 400, cam, f, { shadow: true, glow: 1 });
  plane(ctx, SHOT_DASH, 320 - slide * 90, -10 - drift * 0.4, 520, 760, 490, cam, f, { shadow: true, glow: 1 });
  // floating caption chips
  const chip = (text, y, color, show) => {
    if (!show) return;
    ctx.save(); ctx.globalAlpha = Math.min(1, (t - show) / 0.5);
    setFont(ctx, 34, "bold"); let w = 0; for (const ch of text) w += ctx.measureText(ch).width + 4;
    ctx.fillStyle = "rgba(6,10,8,0.85)";
    const x0 = W/2 - w/2 - 26;
    ctx.beginPath(); ctx.roundRect(x0, y - 44, w + 52, 62, 16); ctx.fill();
    ctx.strokeStyle = color; ctx.globalAlpha *= 0.6; ctx.stroke(); ctx.globalAlpha = Math.min(1, (t - show) / 0.5);
    ctx.fillStyle = color;
    let x = W/2 - w/2; for (const ch of text) { ctx.fillText(ch, x, y); x += ctx.measureText(ch).width + 4; }
    ctx.restore();
  };
  chip("IT REFUSES TO GUESS.", H*0.14, "#ff6b6b", at.l5);
  chip("IT KEEPS SCORE — EVEN THE MISSES.", H*0.14, "#eef3ec", at.l6);
  // logo watermark while inside
  ctx.save(); ctx.globalAlpha = 0.5;
  ctx.drawImage(LOGO, W - 150, 60, 84, 84);
  ctx.restore();
}

// ---------- hero + end ----------
function heroOrEnd(ctx, cam, f, t, isEnd) {
  // logo floats high, text stacked cleanly below it (no overlap)
  const breathe = 1 + 0.03 * Math.sin(t * 1.2);
  plane(ctx, LOGO, 0, 300, 240, 130 * breathe, 130 * breathe, cam, 900, { fill: "#0a0f0b", shadow: true });
  if (isEnd) {
    const l = t - C_OUT;
    const fade = (a, b) => Math.max(0, Math.min(1, (t - a) / (b - a)));
    if (l > 0.55) text(ctx, "SEE EVERY SIDE.", H*0.42, 62, "#eef3ec", fade(C_OUT+0.55, C_OUT+1.0));
    if (l > 1.0) text(ctx, "THEN DECIDE.", H*0.42+90, 62, "#4fe08a", fade(C_OUT+1.0, C_OUT+1.45));
    if (l > 1.6) text(ctx, "truffletrade.vercel.app", H*0.42+190, 28, "#8a978c", fade(C_OUT+1.6, C_OUT+2.0));
    if (l > 2.1) text(ctx, "18+ · ANALYSIS, NOT ADVICE", H*0.42+244, 20, "#5a675c", fade(C_OUT+2.1, C_OUT+2.5));
    if (l > 2.6) text(ctx, 'MUSIC: "INVINCIBLE" — DEAF KEV · NCS', H*0.42+300, 17, "#5a675c", fade(C_OUT+2.6, C_OUT+3.0));
  }
}
function text(ctx, str, y, size, color, alpha = 1) {
  if (alpha <= 0) return;
  setFont(ctx, size, "bold");
  let w = 0; for (const ch of str) w += ctx.measureText(ch).width + size * 0.1;
  w -= size * 0.1;
  let x = (W - w) / 2; ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = color;
  for (const ch of str) { ctx.fillText(ch, x, y); x += ctx.measureText(ch).width + size * 0.1; }
  ctx.restore();
}
function setFont(ctx, size, weight = "bold", mono = true) { ctx.font = `${weight} ${size}px ${mono ? '"Courier New", monospace' : '"Arial", sans-serif'}`; }

// ---------- post ----------
const NOISE = Array.from({ length: 10 }, () => {
  const c = createCanvas(256, 256), x = c.getContext("2d");
  const img = x.createImageData(256, 256);
  for (let i = 0; i < img.data.length; i += 4) { const v = (Math.random()*255)|0; img.data[i]=img.data[i+1]=img.data[i+2]=v; img.data[i+3]=13; }
  x.putImageData(img, 0, 0); return c;
});
const VIG = (() => { const c = createCanvas(W, H), x = c.getContext("2d");
  const g = x.createRadialGradient(W/2, H/2, H*0.3, W/2, H/2, H*0.78);
  g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,0.6)");
  x.fillStyle = g; x.fillRect(0, 0, W, H); return c; })();

let seed = 20260918;
const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;

// ---------- audio ----------
function buildAudio() {
  const SR = 48000, N = SR * DUR;
  const L = new Float32Array(N), R = new Float32Array(N);
  // song: Invincible — pick 6.0s in (post-intro, full drive)
  const raw = path.join(OUT, "v4-song.pcm");
  execFileSync(ffmpegPath, ["-y", "-ss", "6.0", "-t", String(DUR), "-i", path.join(OUT, "invincible.mp3"), "-ac", "2", "-ar", String(SR), "-f", "s16le", raw], { stdio: ["ignore", "ignore", "ignore"] });
  const pcm = fs.readFileSync(raw);
  const frames = pcm.length >> 2;
  for (let i = 0; i < Math.min(frames, N); i++) {
    L[i] = pcm.readInt16LE(i * 4) / 32768;
    R[i] = pcm.readInt16LE(i * 4 + 2) / 32768;
  }
  // duck under VO lines (smooth 0.3s ramps)
  const duck = new Float32Array(N).fill(1);
  for (const line of VO) {
    const s = at[line.id] * SR, e = (at[line.id] + line.dur) * SR, F = 0.3 * SR;
    for (let i = Math.max(0, s - F); i < Math.min(N, e + F); i++) {
      let g = 0.20;
      if (i < s) g = 1 - 0.8 * (i - (s - F)) / F;
      else if (i > e) g = 0.2 + 0.8 * (i - e) / F;
      duck[i] = Math.min(duck[i], Math.max(0.2, Math.min(1, g)));
    }
  }
  for (let i = 0; i < N; i++) { L[i] *= duck[i] * 0.85; R[i] *= duck[i] * 0.85; }
  // VO lines
  for (const line of VO) {
    execFileSync(ffmpegPath, ["-y", "-i", line.file, "-f", "s16le", path.join(OUT, "v4-votmp.pcm")], { stdio: ["ignore", "ignore", "ignore"] });
    const v = fs.readFileSync(path.join(OUT, "v4-votmp.pcm"));
    const start = Math.floor(at[line.id] * SR);
    const vf = v.length >> 2;
    for (let i = 0; i < vf; i++) {
      const idx = start + i; if (idx >= N) break;
      const tin = i / SR, tout = vf / SR - tin;
      const env = Math.min(1, tin / 0.02, tout / 0.05);
      L[idx] += v.readInt16LE(i * 4) / 32768 * env;
      R[idx] += v.readInt16LE(i * 4 + 2) / 32768 * env;
    }
  }
  // master
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    let l = Math.tanh(L[i] * 1.15), r = Math.tanh(R[i] * 1.15);
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
    wav.writeInt16LE(Math.max(-32768, Math.min(32767, L[i] * 32767 | 0)), 44 + i * 4);
    wav.writeInt16LE(Math.max(-32768, Math.min(32767, R[i] * 32767 | 0)), 46 + i * 4);
  }
  const p = path.join(OUT, "v4-audio.wav");
  fs.writeFileSync(p, wav);
  return p;
}
console.log("audio mix…");
const audioWav = buildAudio();

// ---------- encode ----------
const outMp4 = path.join(OUT, "truffletrade-v4.mp4");
const ff = spawn(ffmpegPath, [
  "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", `${W}x${H}`, "-r", String(FPS), "-i", "-",
  "-i", audioWav, "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
  "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", outMp4,
], { stdio: ["pipe", "inherit", "inherit"] });
ff.on("exit", (c) => { if (c !== 0) process.exit(c); });

const main = createCanvas(W, H), ctx = main.getContext("2d");
const scC = createCanvas(W, H), sc = scC.getContext("2d");
const raw = Buffer.alloc(W * H * 3);

for (let fr = 0; fr < FRAMES; fr++) {
  seed = 424242 + fr * 7919;
  const t = fr / FPS;
  const cam = cameraAt(t);
  sc.fillStyle = "#000"; sc.fillRect(0, 0, W, H);

  if (t < C_DIVE - 0.6 || (t >= C_OUT && t >= C_OUT)) {
    // world mode: room flythrough (or final pull-back with logo world)
    drawRoom(sc, cam, cam.f ?? 850, t, {
      screen: t >= at.l5 ? "analyst" : "dashboard",
      glowScreen: 0.5 + 0.15 * Math.sin(t * 2),
      backColor: t >= at.l4 ? "#100a0a" : "#0a100c",
    });
    if (t < C_FLY + 0.2) text(sc, "truffletrade.", H * 0.16, 46, "#eef3ec", Math.max(0, 1 - (t - (C_FLY - 0.8)) / 0.8));
  }
  if (t >= C_DIVE - 0.6 && t < C_OUT) {
    insideScreen(sc, cam, cam.f ?? 1000, t);
  }
  if (t >= C_OUT) {
    // clean black void for the end card — no room geometry behind the text
    const k = seg(t, C_OUT, C_OUT + 0.8); // quick fade of the room to black
    if (k < 1) drawRoom(sc, cam, cam.f ?? 850, t, { screen: "dashboard", glowScreen: 0.4, backColor: "#122019" });
    sc.fillStyle = `rgba(0,0,0,${k})`; sc.fillRect(0, 0, W, H);
    heroOrEnd(sc, { x: 0, y: 0, z: -400, yaw: 0, pitch: 0, f: 900 }, 900, t, true);
  }
  // VO captions (minimal, lower third) while inside
  const cap = VO.find((v) => t >= at[v.id] && t <= at[v.id] + v.dur);
  if (cap && t >= C_DIVE - 0.6 && t < C_OUT) text(sc, cap.text.toUpperCase(), H * 0.88, 26, "#9fb3a6", 0.85);

  // fade chapters (no flash)
  for (const [cut, prev] of [[C_FLY, 0], [C_DESK, C_FLY], [C_DIVE, C_DESK], [C_SCORE, null], [C_OUT, C_MEMORY]]) {
    if (prev !== null && Math.abs(t - cut) < 0.01) { /* boundary handled by camera */ }
  }
  if (t > DUR - 0.7) { sc.fillStyle = `rgba(0,0,0,${(t - (DUR - 0.7)) / 0.7})`; sc.fillRect(0, 0, W, H); }

  ctx.drawImage(scC, 0, 0);
  ctx.drawImage(VIG, 0, 0);
  const tile = NOISE[fr % NOISE.length];
  const ox = -((rnd() * 100) | 0), oy = -((rnd() * 100) | 0);
  for (let ty = oy; ty < H; ty += 256) for (let tx = ox; tx < W; tx += 256) ctx.drawImage(tile, tx, ty);
  if (t < 0.5) { ctx.fillStyle = `rgba(0,0,0,${1 - t / 0.5})`; ctx.fillRect(0, 0, W, H); }

  const img = ctx.getImageData(0, 0, W, H).data;
  let o = 0;
  for (let i = 0; i < img.length; i += 4) { raw[o++] = img[i]; raw[o++] = img[i + 1]; raw[o++] = img[i + 2]; }
  if (!ff.stdin.write(raw)) await new Promise((r) => ff.stdin.once("drain", r));
  if (fr % 150 === 0) console.log(`frame ${fr}/${FRAMES}`);
}
ff.stdin.end();
await new Promise((r) => ff.on("close", r));
for (const s of [2, 8, 14, 20, 26, DUR - 3]) {
  execFileSync(ffmpegPath, ["-y", "-ss", String(s), "-i", outMp4, "-frames:v", "1", "-update", "1", path.join(OUT, `v4p-${s}.png`)], { stdio: ["ignore", "ignore", "ignore"] });
  execFileSync(ffmpegPath, ["-y", "-i", path.join(OUT, `v4p-${s}.png`), "-vf", "scale=306:544", path.join(OUT, `v4ps-${s}.png`)], { stdio: ["ignore", "ignore", "ignore"] });
}
console.log("DONE:", outMp4);
