// Generates the TruffleTrade master marks — matching the brand reference:
// a black lobed truffle (raspberry-like clustered lobes with soft sheen) with
// a gold ascending zigzag trend arrow cutting across it from lower-left to an
// arrowhead at the upper-right rim. Deterministic (seeded) — regenerate:
//   node scripts/gen-truffle-logo.mjs && node scripts/gen-icons.mjs
// Emits: electron/icons/icon.svg (app tile), src/app/icon.svg (favicon),
//        public/logo.svg (site mark, circular tile).

import { writeFileSync } from "node:fs";

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 0xffffffff;
  };
}
const rng = mulberry32(913771);

// Palette: glossy black body, graphite lobes, truffle gold arrow.
const BODY = "#1b1512"; // deep black base
const LOBE_DARK = "#241c17";
const LOBE_MID = "#2f2620";
const LOBE_LIT = "#463a30"; // soft top-light sheen
const RIM_DARK = "#0c0907";
const GOLD = "#e8b452";
const GOLD_HI = "#f6d488";
const GOLD_DEEP = "#8a5f1e";

// ── Lobed truffle silhouette: the reference reads as a cloud/raspberry of
// ~9 overlapping lobes. Union of circles → one closed path via sampled
// boundary: densely sample each lobe circle, keep points on the union hull.
function trufflePath(cx, cy, R) {
  const lobes = [
    { x: -0.52, y: -0.18, r: 0.5 },
    { x: -0.05, y: -0.62, r: 0.48 },
    { x: 0.45, y: -0.4, r: 0.44 },
    { x: 0.68, y: 0.08, r: 0.42 },
    { x: 0.38, y: 0.55, r: 0.46 },
    { x: -0.12, y: 0.68, r: 0.44 },
    { x: -0.6, y: 0.38, r: 0.46 },
    { x: -0.72, y: -0.62, r: 0.4 },
    { x: 0.1, y: -0.05, r: 0.5 },
  ].map((l) => ({ x: cx + l.x * R, y: cy + l.y * R, r: l.r * R }));

  // Sample all circle boundaries; a point is on the union hull if it is not
  // strictly inside any OTHER lobe. Sort survivors by angle → smooth path.
  const pts = [];
  for (const L of lobes) {
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * Math.PI * 2;
      const px = L.x + Math.cos(a) * L.r;
      const py = L.y + Math.sin(a) * L.r;
      let insideOther = false;
      for (const O of lobes) {
        if (O === L) continue;
        const dx = px - O.x;
        const dy = py - O.y;
        if (dx * dx + dy * dy < O.r * O.r * 0.995) {
          insideOther = true;
          break;
        }
      }
      if (!insideOther) pts.push([px, py]);
    }
  }
  // angular sort around centroid, then Catmull-Rom → bezier closure
  const mx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const my = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  pts.sort((a, b) => Math.atan2(a[1] - my, a[0] - mx) - Math.atan2(b[1] - my, b[0] - mx));
  // decimate near-duplicate angles
  const clean = [];
  for (const p of pts) {
    const q = clean[clean.length - 1];
    if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > R * 0.05) clean.push(p);
  }
  const n = clean.length;
  let d = `M${clean[0][0].toFixed(1)} ${clean[0][1].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const p0 = clean[(i - 1 + n) % n];
    const p1 = clean[i];
    const p2 = clean[(i + 1) % n];
    const p3 = clean[(i + 2) % n];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d + "Z";
}

/** One lobe: radial glossy bubble (dark base, mid body, top-left sheen, rim light). */
function lobeBubble(cx, cy, r) {
  return (
    `<radialGradient id="lg${Math.round(cx)}_${Math.round(cy)}" cx=".38" cy=".32" r=".78">` +
    `<stop offset="0" stop-color="${LOBE_LIT}"/>` +
    `<stop offset=".45" stop-color="${LOBE_MID}"/>` +
    `<stop offset="1" stop-color="${LOBE_DARK}"/>` +
    `</radialGradient>` +
    `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="url(#lg${Math.round(cx)}_${Math.round(cy)})"/>` +
    `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="none" stroke="${RIM_DARK}" stroke-opacity=".55" stroke-width="${(r * 0.05).toFixed(2)}"/>`
  );
}

function lobesSvg(cx, cy, R) {
  const defs = [];
  const circles = [];
  const lobes = [
    { x: -0.52, y: -0.18, r: 0.5 },
    { x: -0.05, y: -0.62, r: 0.48 },
    { x: 0.45, y: -0.4, r: 0.44 },
    { x: 0.68, y: 0.08, r: 0.42 },
    { x: 0.38, y: 0.55, r: 0.46 },
    { x: -0.12, y: 0.68, r: 0.44 },
    { x: -0.6, y: 0.38, r: 0.46 },
    { x: -0.72, y: -0.62, r: 0.4 },
    { x: 0.1, y: -0.05, r: 0.5 },
  ];
  for (const l of lobes) {
    const x = cx + l.x * R;
    const y = cy + l.y * R;
    const r = l.r * R;
    defs.push(lobeBubble(x, y, r).split("<circle")[0]); // defs part
    circles.push("<circle" + lobeBubble(x, y, r).split("<circle").slice(1).join("<circle"));
  }
  return `<defs>${defs.join("")}</defs>${circles.join("")}`;
}

/** Gold ascending zigzag arrow: 3 rising segments + solid arrowhead. */
function arrowSvg(cx, cy, R) {
  const x0 = cx - R * 0.78;
  const y0 = cy + R * 0.52;
  const pts = [
    [x0, y0],
    [cx - R * 0.34, cy + R * 0.1],
    [cx - R * 0.08, cy + R * 0.28],
    [cx + R * 0.42, cy - R * 0.22],
    [cx + R * 0.6, cy - R * 0.1],
    [cx + R * 0.82, cy - R * 0.52],
  ];
  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const tip = pts[pts.length - 1];
  const prev = pts[pts.length - 2];
  const ang = Math.atan2(tip[1] - prev[1], tip[0] - prev[0]);
  const ah = R * 0.24;
  const spread = 0.46;
  const p1 = [tip[0] - Math.cos(ang - spread) * ah, tip[1] - Math.sin(ang - spread) * ah];
  const p2 = [tip[0] - Math.cos(ang + spread) * ah, tip[1] - Math.sin(ang + spread) * ah];
  return (
    `<linearGradient id="goldA" x1="0" y1="1" x2="1" y2="0">` +
    `<stop offset="0" stop-color="${GOLD_DEEP}"/>` +
    `<stop offset=".5" stop-color="${GOLD}"/>` +
    `<stop offset="1" stop-color="${GOLD_HI}"/>` +
    `</linearGradient>` +
    `<path d="${d}" fill="none" stroke="url(#goldA)" stroke-width="${(R * 0.13).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="M${tip[0].toFixed(1)} ${tip[1].toFixed(1)} L${p1[0].toFixed(1)} ${p1[1].toFixed(1)} L${p2[0].toFixed(1)} ${p2[1].toFixed(1)} Z" fill="${GOLD_HI}"/>`
  );
}

/** Build one full mark. size = viewBox, tile = background shape fn. */
function buildMark({ size, tile, pad, silhouetteStroke }) {
  const cx = size / 2;
  const cy = size / 2;
  const R = size / 2 - pad;
  const sil = trufflePath(cx, cy, R);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" role="img" aria-label="TruffleTrade">
${tile}
<path d="${sil}" fill="${BODY}"/>
${lobesSvg(cx, cy, R)}
<path d="${sil}" fill="none" stroke="${RIM_DARK}" stroke-opacity=".9" stroke-width="${(size * (silhouetteStroke ?? 0.008)).toFixed(2)}"/>
${arrowSvg(cx, cy, R)}
</svg>
`;
}

const icon = buildMark({
  size: 512,
  pad: 96,
  tile: `<rect width="512" height="512" rx="112" fill="#0d0b09"/>`,
});

const favicon = buildMark({
  size: 64,
  pad: 12,
  tile: `<rect width="64" height="64" rx="14" fill="#0d0b09"/>`,
  silhouetteStroke: 0.02,
});

const logo = buildMark({
  size: 240,
  pad: 45,
  tile: `<circle cx="120" cy="120" r="118" fill="#0d0b09"/>`,
});

writeFileSync("electron/icons/icon.svg", icon);
writeFileSync("src/app/icon.svg", favicon);
writeFileSync("public/logo.svg", logo);
console.log("truffle marks written: electron/icons/icon.svg, src/app/icon.svg, public/logo.svg");
