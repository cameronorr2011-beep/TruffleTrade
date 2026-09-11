import { macroQuotes, yahooChart } from "@core/research/providers";
import LiveQuotes from "@/components/market/LiveQuotes";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard" };

const INDICES = ["^GSPC", "^IXIC", "^DJI", "^VIX"] as const;
const MOVERS = ["NVDA", "AAPL", "MSFT", "GOOGL", "TSLA", "AMZN", "META", "AMD"] as const;

async function safeQuote(ticker: string) {
  try {
    const { quote } = await yahooChart(ticker, "5d", "1d");
    return { ticker, name: quote.name, price: quote.price, changePct: quote.changePct };
  } catch {
    return { ticker, name: null, price: null, changePct: null };
  }
}

export default async function DashboardPage() {
  const [indices, movers, macro] = await Promise.all([
    Promise.all(INDICES.map(safeQuote)),
    Promise.all(MOVERS.map(safeQuote)),
    macroQuotes().catch(() => []),
  ]);

  return (
    <div className="flex min-h-[calc(100vh-57px)]">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[224px] flex-col overflow-y-auto border-r border-soil-600 bg-soil-950 px-4 pb-5 pt-[76px] lg:flex">
        <p className="px-3 pb-2.5 text-[9px] font-bold uppercase tracking-[1.3px] text-faint">Workspace</p>
        <nav className="flex flex-col gap-1">
          {[
            { href: "/dashboard", label: "Overview", icon: "▦", active: true },
            { href: "/markets", label: "Markets", icon: "◍" },
            { href: "/desk", label: "Council desk", icon: "✦", badge: "6+1" },
            { href: "/watchlist", label: "Watchlist", icon: "★" },
            { href: "/compare", label: "Compare", icon: "⇄" },
          ].map((n) => (
            <a
              key={n.href}
              href={n.href}
              className={`flex min-h-[38px] items-center gap-2.5 rounded-lg px-3 text-[12px] ${
                "active" in n && n.active
                  ? "bg-truffle-200/70 font-bold text-truffle-600"
                  : "text-bone-soft hover:bg-soil-700 hover:text-ink"
              }`}
            >
              <span aria-hidden className="w-4 text-center text-[13px]">{n.icon}</span>
              <span className="flex-1">{n.label}</span>
              {"badge" in n && n.badge && (
                <span className="rounded border border-soil-500 bg-white px-1.5 py-0.5 text-[9px] text-bone-soft">{n.badge}</span>
              )}
            </a>
          ))}
        </nav>
        <p className="mt-7 px-3 pb-2.5 text-[9px] font-bold uppercase tracking-[1.3px] text-faint">Tools</p>
        <nav className="flex flex-col gap-1">
          {[
            { href: "/research", label: "Research history", icon: "⧗" },
            { href: "/blog", label: "Field notes", icon: "✉" },
            { href: "/buy", label: "Subscription", icon: "◇" },
          ].map((n) => (
            <a
              key={n.href}
              href={n.href}
              className="flex min-h-[38px] items-center gap-2.5 rounded-lg px-3 text-[12px] text-bone-soft hover:bg-soil-700 hover:text-ink"
            >
              <span aria-hidden className="w-4 text-center text-[13px]">{n.icon}</span>
              <span className="flex-1">{n.label}</span>
            </a>
          ))}
        </nav>
        <div className="mt-auto pt-10">
          <div className="relative isolate overflow-hidden rounded-xl p-4 text-white" style={{ background: "#234e37" }}>
            <div aria-hidden className="absolute -right-14 -top-16 h-40 w-40 rounded-full border border-white/10" />
            <div aria-hidden className="absolute -right-8 -top-10 h-28 w-28 rounded-full border border-white/10" />
            <p className="relative text-[9px] font-bold uppercase tracking-[1.2px] text-mint/80">The council</p>
            <p className="relative mt-2 text-[15px] font-semibold leading-snug">Six analysts. One verdict you can argue with.</p>
            <a
              href="/desk"
              className="relative mt-4 flex items-center justify-between rounded-md bg-mint px-3 py-2 text-[10px] font-bold text-forest"
            >
              Run an analysis <span aria-hidden>→</span>
            </a>
          </div>
          <p className="mt-4 flex items-center gap-2 px-2 text-[9px] text-faint">
            <span className="live-dot" style={{ width: 5, height: 5 }} /> live data · keyless yahoo
          </p>
        </div>
      </aside>

      {/* Main */}
      <div className="min-w-0 flex-1 lg:ml-[224px]">
        <div className="mx-auto max-w-[1220px] px-5 pb-16 pt-7 sm:px-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[1.6px] text-faint">Your daily advantage</p>
              <h1 className="mt-1.5 text-[28px] font-bold tracking-[-1.2px] text-ink">Less noise. More signal.</h1>
              <p className="mt-1 text-[12px] text-bone-soft">
                Live candles, real-time quotes, and headlines the AI actually reads — one quiet workspace.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <a href="/desk" className="btn-primary">Run analysis</a>
              <a href="/buy" className="btn-secondary">Get access</a>
            </div>
          </div>

          <LiveQuotes
            initialIndices={indices.map((i) => ({
              ticker: i.ticker,
              name: i.name ?? i.ticker,
              price: i.price,
              changePct: i.changePct,
            }))}
            initialMovers={movers}
            initialTicker="NVDA"
          />

          {/* Mobile nav */}
          <nav className="mt-6 flex flex-wrap gap-2 lg:hidden">
            {["/dashboard", "/markets", "/desk", "/watchlist", "/compare", "/research", "/blog", "/buy"].map((href) => (
              <a
                key={href}
                href={href}
                className="rounded-lg border border-soil-500 bg-white px-3 py-2 text-[11px] font-semibold text-bone-soft"
              >
                {href.replace("/", "") || "home"}
              </a>
            ))}
          </nav>

          <p className="mt-8 text-[11px] leading-relaxed text-faint">
            Market data is live but delayed per exchange rules; news headlines link to their publishers. Everything here
            is research, not investment advice. Council analysis requires an active access code —{" "}
            <a href="/buy" className="font-semibold text-forest hover:text-truffle-600">get access</a>.
          </p>
          <p className="mt-2 text-[10px] text-faint">{macro.length} macro series connected · news via Google News RSS</p>
        </div>
      </div>
    </div>
  );
}
