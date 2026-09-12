// Generates the TruffleTrade master marks: a photoreal black truffle
// (Tuber melanosporum) built from a lobed silhouette covered in ~140
// individually-shaded pyramidal warts, with three gold candlesticks set into
// the circumference. Deterministic (seeded) — regenerate any time:
//   node scripts/gen-truffle-logo.mjs
// Emits: electron/icons/icon.svg (app tile), src/app/icon.svg (favicon),
//        public/logo.svg (site mark, circular tile).

import { writeFileSync } from "node:fs";

// ── deterministic PRNG (mulberry32) ───────────────────────────────────────
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(20260911);

/**
 * Lobed truffle silhouette as a smooth closed path through N angular points.
 * Radius wobbles with layered sine harmonics + per-point noise → organic lump.
 */
function trufflePath(cx, cy, R, points = 26) {
  const h1 = 0.075 + rng() * 0.05; // harmonic amplitudes
  const h2 = 0.05 + rng() * 0.04;
  const h3 = 0.03 + rng() * 0.025;
  const p1 = rng() * Math.PI * 2;
  const p2 = rng() * Math.PI * 2;
  const p3 = rng() * Math.PI * 2;
  const pts = [];
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2;
    const wob =
      1 +
      h1 * Math.sin(2 * a + p1) +
      h2 * Math.sin(3 * a + p2) +
      h3 * Math.sin(5 * a + p3) +
      (rng() - 0.5) * 0.03;
    pts.push([cx + Math.cos(a) * R * wob, cy + Math.sin(a) * R * wob * 0.94]); // slightly squashed
  }
  // Catmull-Rom → cubic Bézier for smooth organic closure
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < points; i++) {
    const p0 = pts[(i - 1 + points) % points];
    const p1p = pts[i];
    const p2p = pts[(i + 1) % points];
    const p3p = pts[(i + 2) % points];
    const c1 = [p1p[0] + (p2p[0] - p0[0]) / 6, p1p[1] + (p2p[1] - p0[1]) / 6];
    const c2 = [p2p[0] - (p3p[0] - p1p[0]) / 6, p2p[1] - (p3p[1] - p1p[1]) / 6];
    d += `C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2p[0].toFixed(1)} ${p2p[1].toFixed(1)}`;
  }
  return d + "Z";
}

/** Sample points across the disc, rejecting those outside the silhouette. */
function wartPositions(cx, cy, R, count) {
  const out = [];
  let guard = 0;
  while (out.length < count && guard++ < count * 40) {
    const a = rng() * Math.PI * 2;
    const r = Math.sqrt(rng()) * R * 0.93;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r * 0.94;
    const shade = 0.5 - 0.45 * (y - cy) / R; // top warts catch light, bottom in shadow
    out.push({ x, y, r: 0.055 * R * (0.7 + rng() * 0.7), rot: rng() * 360, shade: Math.max(0.05, Math.min(0.95, shade + (rng() - 0.5) * 0.2)) });
  }
  return out;
}

/**
 * One pyramidal wart: three stacked polygons (base shadow → body → lit facet)
 * rotated to position. The variation in tone is what sells "real truffle".
 */
function wart({ x, y, r, rot, shade }) {
  const g = Math.round(38 + shade * 88); // grey-brown body value 38..126
  const dark = Math.max(4, Math.round(g * 0.3));
  const lit = Math.min(205, Math.round(g * 1.8 + 34));
  const body = `rgb(${Math.round(g * 0.82)},${Math.round(g * 0.74)},${Math.round(g * 0.6)})`;
  const dk = `rgb(${dark},${dark},${Math.round(dark * 1.15)})`;
  const lt = `rgb(${lit},${Math.round(lit * 0.9)},${Math.round(lit * 0.72)})`;
  const t = (a, rad) => {
    const radr = (a * Math.PI) / 180;
    return `${(x + Math.cos(radr) * rad).toFixed(1)} ${(y + Math.sin(radr) * rad).toFixed(1)}`;
  };
  return (
    `<g transform="rotate(${rot.toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})">` +
    `<polygon points="${t(0, r * 1.5)} ${t(120, r * 1.5)} ${t(240, r * 1.5)}" fill="${dk}" opacity=".9"/>` +
    `<polygon points="${t(10, r * 1.18)} ${t(130, r * 1.18)} ${t(250, r * 1.18)}" fill="${body}"/>` +
    `<polygon points="${t(20, r * 0.72)} ${t(140, r * 0.72)} ${t(260, r * 0.72)}" fill="${lt}" opacity=".85"/>` +
    `</g>`
  );
}

function candle(x, y1, y2, w, bodyY, bodyH, fill, op = 1) {
  return (
    `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${fill}" stroke-width="${w * 0.42}" stroke-linecap="round"${op < 1 ? ` opacity="${op}"` : ""}/>` +
    `<rect x="${x - w / 2}" y="${bodyY}" width="${w}" height="${bodyH}" rx="${w * 0.18}" fill="${fill}"${op < 1 ? ` opacity="${op}"` : ""}/>`
  );
}

/** Build one full mark. size = viewBox, tile = background shape fn. */
function buildMark({ size, tile, pad, showRim }) {
  const cx = size / 2;
  const cy = size / 2 + size * 0.03;
  const R = size / 2 - pad;
  const warts = wartPositions(cx, cy, R, 140);

  // candlesticks: left-upper rim (bearish, dim), top (tall bull), right-lower rim (bull)
  const gold = "url(#gold)";
  const goldDim = "url(#goldDim)";
  const cs = showRim
    ? [
        candle(size * 0.155, cy - R * 0.62, cy - R * 0.1, size * 0.055, cy - R * 0.5, R * 0.26, goldDim),
        candle(cx, size * 0.055, cy - R * 0.52, size * 0.055, size * 0.1, R * 0.34, gold),
        candle(size * 0.845, cy + R * 0.16, cy + R * 0.78, size * 0.055, cy + R * 0.28, R * 0.26, gold),
      ].join("")
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" role="img" aria-label="TruffleTrade">
<defs>
<linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#ffe9b8"/><stop offset=".5" stop-color="#e8ae52"/><stop offset="1" stop-color="#9a611e"/>
</linearGradient>
<linearGradient id="goldDim" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#c9973f"/><stop offset="1" stop-color="#6e4514"/>
</linearGradient>
<radialGradient id="glow" cx=".5" cy=".52" r=".6">
<stop offset="0" stop-color="#28382f"/><stop offset="1" stop-color="#28382f" stop-opacity="0"/>
</radialGradient>
<radialGradient id="keylight" cx=".3" cy=".2" r=".72">
<stop offset="0" stop-color="#a08a66" stop-opacity=".62"/>
<stop offset=".4" stop-color="#6b5940" stop-opacity=".28"/>
<stop offset="1" stop-color="#000" stop-opacity="0"/>
</radialGradient>
<radialGradient id="core" cx=".54" cy=".66" r=".66">
<stop offset="0" stop-color="#000" stop-opacity=".48"/>
<stop offset=".7" stop-color="#000" stop-opacity=".1"/>
<stop offset="1" stop-color="#000" stop-opacity="0"/>
</radialGradient>
<radialGradient id="bounce" cx=".62" cy=".96" r=".55">
<stop offset="0" stop-color="#7a5a32" stop-opacity=".3"/>
<stop offset="1" stop-color="#7a5a32" stop-opacity="0"/>
</radialGradient>
<radialGradient id="floorshadow" cx=".5" cy=".5" r=".5">
<stop offset="0" stop-color="#000" stop-opacity=".55"/>
<stop offset="1" stop-color="#000" stop-opacity="0"/>
</radialGradient>
<clipPath id="sil"><path d="${trufflePath(cx, cy, R)}"/></clipPath>
</defs>
${tile}
<ellipse cx="${cx}" cy="${cy + R * 0.98}" rx="${R * 0.86}" ry="${R * 0.16}" fill="url(#floorshadow)"/>
<path d="${trufflePath(cx, cy, R)}" fill="#0d0906"/>
<g clip-path="url(#sil)">
<rect width="${size}" height="${size}" fill="url(#keylight)"/>
${warts.map(wart).join("")}
<rect width="${size}" height="${size}" fill="url(#core)"/>
<rect width="${size}" height="${size}" fill="url(#bounce)"/>
<path d="${trufflePath(cx, cy, R)}" fill="none" stroke="#000" stroke-opacity=".65" stroke-width="${size * 0.012}"/>
</g>
${cs}
</svg>
`;
}

const icon = buildMark({
  size: 512,
  pad: 118,
  showRim: true,
  tile: `<rect width="512" height="512" rx="112" fill="#0b110d"/><rect width="512" height="512" rx="112" fill="url(#glow)"/>`,
});

const favicon = buildMark({
  size: 64,
  pad: 14.5,
  showRim: true,
  tile: `<rect width="64" height="64" rx="14" fill="#0b110d"/>`,
});

const logo = buildMark({
  size: 240,
  pad: 4,
  showRim: true,
  tile: `<circle cx="120" cy="120" r="118" fill="#0b110d"/><circle cx="120" cy="120" r="118" fill="url(#glow)"/>`,
});

writeFileSync("electron/icons/icon.svg", icon);
writeFileSync("src/app/icon.svg", favicon);
writeFileSync("public/logo.svg", logo);
console.log("truffle marks written: electron/icons/icon.svg, src/app/icon.svg, public/logo.svg");
