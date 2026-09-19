import fs from "node:fs"; import path from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";
const dir = process.argv[2] ? path.join("dist-video", process.argv[2]) : "dist-video/v7-preview";
const files = fs.readdirSync(dir).filter(f=>f.endsWith(".jpg")).sort();
const c = createCanvas(108, 192), x = c.getContext("2d");
let prev = null, report = [];
for (const f of files) {
  const img = await loadImage(fs.readFileSync(path.join(dir, f)));
  x.drawImage(img, 0, 0, 108, 192);
  const d = x.getImageData(0, 0, 108, 192).data;
  let sum = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) { sum += (d[i]+d[i+1]+d[i+2])/3; n++; }
  const avg = sum/n;
  let diff = 0;
  if (prev) { for (let i = 0; i < d.length; i += 4) diff += Math.abs(d[i]-prev[i]) + Math.abs(d[i+1]-prev[i+1]) + Math.abs(d[i+2]-prev[i+2]); diff /= n*3; }
  prev = d;
  report.push(`${f} avg=${avg.toFixed(1)} diff=${diff.toFixed(1)}`);
}
console.log(report.join("\n"));
const black = report.filter(r=>parseFloat(r.match(/avg=([\d.]+)/)[1])<6).length;
console.log(`\nblack frames: ${black}/${report.length}`);
