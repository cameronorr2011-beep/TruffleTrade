// Post-build step: replace Turbopack's .next/node_modules symlinks with real
// copies. Turbopack externalizes native/complex packages (better-sqlite3, pg)
// into hashed symlink entries under .next/node_modules; electron-builder
// cannot recreate those symlinks on Windows without admin rights/Developer
// Mode (EPERM), and inside an asar they are unresolvable entirely. Real
// directories behave identically at runtime — the server chunks resolve the
// hashed names through normal node_modules resolution.
//
// Wired as the "postbuild" npm script so `npm run build` (and app:dist) always
// produces a symlink-free .next ready for packaging.
import fs from "node:fs";
import path from "node:path";

const externalsDir = path.join(process.cwd(), ".next", "node_modules");

function isSymlink(p) {
  try {
    return fs.lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else if (entry.isSymbolicLink()) {
      // A symlink inside a package (rare) — copy its target's content.
      const target = fs.realpathSync(s);
      if (fs.statSync(target).isDirectory()) copyDir(target, d);
      else fs.copyFileSync(target, d);
    } else fs.copyFileSync(s, d);
  }
}

if (fs.existsSync(externalsDir)) {
  let flattened = 0;
  for (const name of fs.readdirSync(externalsDir)) {
    const p = path.join(externalsDir, name);
    if (!isSymlink(p)) continue;
    const target = fs.realpathSync(p);
    if (!fs.statSync(target).isDirectory()) {
      fs.copyFileSync(target, p);
    } else {
      fs.rmSync(p, { recursive: true, force: true });
      copyDir(target, p);
    }
    flattened++;
    console.log(`[flatten-next-externals] ${name} → real directory`);
  }
  if (!flattened) console.log("[flatten-next-externals] no symlinks under .next/node_modules — nothing to do");
} else {
  console.log("[flatten-next-externals] no .next/node_modules — nothing to do");
}
