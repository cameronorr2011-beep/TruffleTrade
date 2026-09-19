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
  await sharp(svg, { density: 72 * (s / 64) }).resize(s, s).png().toFile(`electron/icons/truffle-${s}.png`);
}
writeFileSync("electron/icons/truffle.ico", pngToIco([pngs[16], pngs[32], pngs[48], pngs[256]]));

// Web icons come from the site mark (public/logo.svg + public/icon.svg), not
// the desktop icon, so the two can evolve independently.
const siteLogo = readFileSync("public/logo.svg");
const siteFavicon = readFileSync("public/icon.svg");
await sharp(siteLogo, { density: 300 }).resize(512, 512).png().toFile("public/icon-512.png");
await sharp(siteFavicon, { density: 300 }).resize(192, 192).png().toFile("public/icon-192.png");
await sharp(siteLogo, { density: 300 }).resize(180, 180).png().toFile("public/apple-icon.png");
console.log("icons written: electron ico + pngs, public/icon-512.png, icon-192.png, apple-icon.png");
