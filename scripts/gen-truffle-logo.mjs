// Generates the TruffleTrade master marks: a highly detailed FLAT 2D truffle
// in a woodcut/engraving style — lobed silhouette, skin covered in a sunflower
// (phyllotaxis) spiral of crisp pentagonal warts with thin cream outlines,
// subtle interior veining, and three gold candlesticks set into the rim.
// No fake-3D gradients: flat fills only, so it reads as intentional design at
// 16px and as intricate detail at 512px. Deterministic (seeded) — regenerate:
//   node scripts/gen-truffle-logo.mjs
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
const rng = mulberry32(20260912);

// ── Palette: warm charcoal body, cream engraving lines, truffle gold ──────
const INK = "#241a12"; // deepest crevice
const BODY = "#3a2a1c"; // base skin
const BODY_WARM = "#4a3524"; // warm facets
const BODY_DARK = "#2e2116"; // cool facets
const CREAM = "#e8d9b8"; // wart outlines (truffle veining is cream on black)
const CREAM_DIM = "rgba(232,217,184,0.55)";
const GOLD = "#e8ae52";
const GOLD_DIM = "#a97e33";

// ── Lobed organic silhouette (same proven construction as v3) ────────────
function trufflePath(cx, cy, R, points = 26) {
  const h1 = 0.075 + rng() * 0.05;
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
    pts.push([cx + Math.cos(a) * R * wob, cy + Math.sin(a) * R * wob * 0.94]);
  }
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

/**
 * Phyllotaxis (sunflower) layout — the real arrangement pattern of truffle
 * warts. Each wart is a crisp pentagon whose fill tone alternates across a
 * fixed palette (woodcut = flat inks, no gradient blends) and whose cream
 * outline is what reads as "detail" at every size.
 */
function wartPositions(cx, cy, R, count) {
  const golden = Math.PI * (3 - Math.sqrt(5)); // ~2.39996 rad
  const out = [];
  for (let i = 0; i < count; i++) {
    const r = R * 0.96 * Math.sqrt((i + 0.5) / count);
    const a = i * golden;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r * 0.94;
    const tone = i % 3 === 0 ? BODY_WARM : i % 3 === 1 ? BODY : BODY_DARK;
    const sizeK = 0.62 + 0.5 * Math.sqrt((i + 0.5) / count); // outer warts slightly larger
    out.push({ x, y, r: 0.058 * R * sizeK, rot: (a * 180) / Math.PI + 12, tone });
  }
  return out;
}

/** One pentagonal wart: flat fill + thin cream outline + tiny ink core. */
function wart({ x, y, r, rot, tone }, detail) {
  const pts = [];
  for (let k = 0; k < 5; k++) {
    const a = ((-90 + k * 72) * Math.PI) / 180;
    pts.push([x + Math.cos(a) * r, y + Math.sin(a) * r]);
  }
  const poly = pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const core =
    detail &&
    `<polygon points="${pts
      .map((p) => `${(x + (p[0] - x) * 0.34).toFixed(1)},${(y + (p[1] - y) * 0.34).toFixed(1)}`)
      .join(" ")}" fill="${INK}"/>`;
  return (
    `<g transform="rotate(${rot.toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})">` +
    `<polygon points="${poly}" fill="${tone}" stroke="${CREAM}" stroke-width="${(r * 0.34).toFixed(2)}" stroke-linejoin="round"/>` +
    `</g>` +
    (core ?? "")
  );
}

/** Faint cream veins between wart rows — the marbling real truffles show. */
function veins(cx, cy, R) {
  let out = "";
  for (let v = 0; v < 7; v++) {
    const a0 = rng() * Math.PI * 2;
    let d = "";
    for (let s = 0; s <= 6; s++) {
      const t = s / 6;
      const r = R * (0.12 + 0.78 * t);
      const a = a0 + Math.sin(t * 4.2 + v) * 0.34;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r * 0.94;
      d += `${s === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    }
    out += `<path d="${d}" fill="none" stroke="${v % 2 ? CREAM_DIM : CREAM}" stroke-width="${(R * 0.008).toFixed(2)}" stroke-linecap="round"/>`;
  }
  return out;
}

function candle(x, y1, y2, w, bodyY, bodyH, fill) {
  return (
    `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${fill}" stroke-width="${w * 0.42}" stroke-linecap="round"/>` +
    `<rect x="${x - w / 2}" y="${bodyY}" width="${w}" height="${bodyH}" rx="${w * 0.18}" fill="${fill}"/>`
  );
}

/** Build one full mark. size = viewBox, tile = background shape fn. */
function buildMark({ size, tile, pad, showRim, detail }) {
  const cx = size / 2;
  const cy = size / 2 + size * 0.03;
  const R = size / 2 - pad;
  const sil = trufflePath(cx, cy, R);
  const warts = wartPositions(cx, cy, R, detail ? 150 : 34);

  // candlesticks: left-upper rim (bearish, dim), top (tall bull), right-lower rim (bull)
  const cs = showRim
    ? [
        candle(size * 0.155, cy - R * 0.62, cy - R * 0.1, size * 0.055, cy - R * 0.5, R * 0.26, GOLD_DIM),
        candle(cx, size * 0.055, cy - R * 0.52, size * 0.055, size * 0.1, R * 0.34, GOLD),
        candle(size * 0.845, cy + R * 0.16, cy + R * 0.78, size * 0.055, cy + R * 0.28, R * 0.26, GOLD),
      ].join("")
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" role="img" aria-label="TruffleTrade">
${tile}
<g>
<path d="${sil}" fill="${BODY}"/>
<g clip-path="url(#sil)">
${veins(cx, cy, R)}
${warts.map((w) => wart(w, detail)).join("")}
</g>
<path d="${sil}" fill="none" stroke="${INK}" stroke-opacity=".8" stroke-width="${(size * 0.011).toFixed(2)}"/>
</g>
${cs}
<defs><clipPath id="sil"><path d="${sil}"/></clipPath></defs>
</svg>
`;
}

const icon = buildMark({
  size: 512,
  pad: 118,
  showRim: true,
  detail: true,
  tile: `<rect width="512" height="512" rx="112" fill="#0b110d"/>`,
});

const favicon = buildMark({
  size: 64,
  pad: 14.5,
  showRim: true,
  detail: false, // 16–32px: 34 chunky warts stay legible; 150 would mush
  tile: `<rect width="64" height="64" rx="14" fill="#0b110d"/>`,
});

const logo = buildMark({
  size: 240,
  pad: 4,
  showRim: true,
  detail: true,
  tile: `<circle cx="120" cy="120" r="118" fill="#0b110d"/>`,
});

writeFileSync("electron/icons/icon.svg", icon);
writeFileSync("src/app/icon.svg", favicon);
writeFileSync("public/logo.svg", logo);
console.log("truffle marks written: electron/icons/icon.svg, src/app/icon.svg, public/logo.svg");
