// kick-locked beat fit: low-band (<~110Hz) onset flux, weighted grid fit
import fs from "node:fs"; import path from "node:path"; import os from "node:os";
import { execFileSync } from "node:child_process"; import ffmpegPath from "ffmpeg-static";
const file = process.argv[2], from = +process.argv[3], to = +process.argv[4];
const SR = 48000, tmp = path.join(os.tmpdir(), `fk-${process.pid}.pcm`);
execFileSync(ffmpegPath, ["-y","-ss",String(from),"-t",String(to-from),"-i",file,"-ac","1","-ar",String(SR),"-f","s16le",tmp],{stdio:["ignore","ignore","ignore"]});
const pcm = fs.readFileSync(tmp), n = pcm.length>>1;
const sig = new Float32Array(n); for(let i=0;i<n;i++) sig[i]=pcm.readInt16LE(i*2)/32768;
// one-pole lowpass ~110Hz
const lp = new Float32Array(n); let v=0;
for(let i=0;i<n;i++){ v += 0.0185*(sig[i]-v); lp[i]=v; }
const HOP=48, H=Math.floor(n/HOP);
const env=new Float32Array(H);
for(let h=0;h<H;h++){let s=0;for(let j=0;j<HOP;j++){const x=lp[h*HOP+j];s+=x*x;}env[h]=Math.sqrt(s/HOP);}
const flux=new Float32Array(H); for(let h=1;h<H;h++) flux[h]=Math.max(0,env[h]-env[h-1]);
const cands=[];
for(let h=2;h<H-2;h++){ if(flux[h]>=flux[h-1]&&flux[h]>=flux[h+1]&&flux[h]>0.01){cands.push({t:h/1000,w:flux[h]});} }
const merged=[];
for(const o of cands){const p=merged[merged.length-1]; if(p&&o.t-p.t<0.08){if(o.w>p.w){p.t=o.t;p.w=o.w;}} else merged.push({...o});}
merged.sort((a,b)=>b.w-a.w);
const top=merged.slice(0,20).sort((a,b)=>a.t-b.t);
console.log("kick onsets:", top.map(o=>`${o.t.toFixed(2)}(${o.w.toFixed(2)})`).join(" "));
let bestP=0,bestScore=-1,bestPh=0;
for(let P=0.555;P<=0.665;P+=0.0002){
  let sx=0,sy=0;
  for(const o of top){const a=2*Math.PI*(o.t%P)/P;sx+=Math.cos(a)*o.w;sy+=Math.sin(a)*o.w;}
  const ph=(Math.atan2(sy,sx)/(2*Math.PI)*P+P)%P;
  let s=0;
  for(const o of top){const d=Math.min(Math.abs(((o.t-ph)%P+P)%P),P-Math.abs(((o.t-ph)%P+P)%P));s+=o.w*Math.exp(-d/(0.025));}
  if(s>bestScore){bestScore=s;bestP=P;bestPh=ph;}
}
console.log(`grid: ${(bestP*1000).toFixed(1)}ms (${(60/bestP).toFixed(2)} BPM) phase ${bestPh.toFixed(3)} (+${from}) score ${bestScore.toFixed(2)}`);
console.log("residuals(ms):", top.map(o=>{const k=Math.round((o.t-bestPh)/bestP);const g=bestPh+k*bestP;return ((o.t-g)*1000).toFixed(0);}).join(" "));
console.log(`absolute phase: ${(from+bestPh).toFixed(3)}s`);
