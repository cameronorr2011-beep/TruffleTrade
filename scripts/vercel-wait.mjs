// Poll the newest production deployment until Ready (or timeout).
import fs from "node:fs";
import os from "node:os";

const token = JSON.parse(fs.readFileSync(`${os.homedir()}/AppData/Roaming/com.vercel.cli/Data/auth.json`, "utf8")).token;
const projectId = JSON.parse(fs.readFileSync(`${process.cwd()}/.vercel/project.json`, "utf8")).projectId;

const deadline = Date.now() + 300_000;
while (Date.now() < deadline) {
  const res = await fetch(`https://api.vercel.com/v6/deployments?projectId=${projectId}&target=production&limit=1`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const j = await res.json();
  const d = j.deployments?.[0];
  if (d) {
    console.log(`${d.readyState ?? d.state} commit=${d.meta?.githubCommitSha?.slice(0, 7) ?? "?"}`);
    if (d.readyState === "READY") { console.log("DEPLOY_READY"); process.exit(0); }
    if (["ERROR", "CANCELED"].includes(d.readyState)) { console.log("DEPLOY_FAILED"); process.exit(1); }
  }
  await new Promise((r) => setTimeout(r, 15_000));
}
console.log("TIMEOUT");
process.exit(1);
