// Instant desktop download: resolves the newest GitHub Release asset and
// redirects the browser straight to the .exe — the visitor just clicks
// "Download TruffleTrade" and the file lands; no GitHub pages, no cloning.
// Short cache so a fresh release is picked up quickly without hammering the
// GitHub API on every click.

export const runtime = "nodejs";
export const revalidate = 300;

const LATEST = "https://api.github.com/repos/cameronorr2011-beep/TruffleTrade/releases/latest";
const FALLBACK = "https://github.com/cameronorr2011-beep/TruffleTrade/releases/latest";

interface ReleaseAsset {
  name: string;
  browser_download_url: string;
}

export async function GET(req: Request) {
  const assetUrl = await latestInstallerUrl();
  if (assetUrl) {
    return Response.redirect(assetUrl, 302);
  }
  // GitHub unreachable or no asset yet — don't dead-end the visitor.
  return Response.redirect(FALLBACK, 302);
}

async function latestInstallerUrl(): Promise<string | null> {
  try {
    const res = await fetch(LATEST, {
      headers: {
        accept: "application/vnd.github+json",
        "user-agent": "truffletrade-site",
        // GITHUB_TOKEN is optional; without it the public API still allows
        // 60 req/h per IP, and this route caches for 5 minutes.
        ...(process.env.GITHUB_TOKEN?.trim() ? { authorization: `Bearer ${process.env.GITHUB_TOKEN.trim()}` } : {}),
      },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { assets?: ReleaseAsset[] };
    const exe = (j.assets ?? []).find(
      (a) => /\.exe$/i.test(a.name) && a.browser_download_url.startsWith("https://"),
    );
    return exe?.browser_download_url ?? null;
  } catch {
    return null;
  }
}
