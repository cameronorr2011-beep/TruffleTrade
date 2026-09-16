export default async function run(page, ui) {
  const results = {};
  const base = "https://truffletrade.vercel.app";
  for (const path of ["/buy", "/install", "/blog", "/blog/memory-that-trains-itself", "/privacy", "/terms"]) {
    const resp = await page.goto(base + path, { waitUntil: "domcontentloaded" });
    const h1 = await page.locator("h1").first().textContent().catch(() => null);
    results[path] = { status: resp.status(), h1: (h1 ?? "(none)").trim().slice(0, 60) };
  }
  return results;
}
