import sharp from "sharp";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { pngToIco } from "./png-to-ico.mjs";

const svg = readFileSync("electron/icons/icon.svg");
mkdirSync("electron/icons", { recursive: true });
mkdirSync("public", { recursive: true });

const sizes = [16, 32, 48, 64, 128, 256, 512];
const pngs = {};
for (const s of sizes) {
  const buf = await sharp(svg, { density: 72 * (s / 64) }).resize(s, s).png().toBuffer();
  pngs[s] = buf;
  await sharp(svg, { density: 72 * (s / 64) }).resize(s, s).png().toFile(s === 512 ? "public/icon-512.png" : `electron/icons/truffle-${s}.png`);
}
writeFileSync("electron/icons/truffle.ico", pngToIco([pngs[16], pngs[32], pngs[48], pngs[256]]));
console.log("icons written: ico + pngs + public/icon-512.png");
