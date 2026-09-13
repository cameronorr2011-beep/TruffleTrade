/** MarketPulse — MARKET OPEN/CLOSED chip. US equity session (NYSE calendar approx): Mon–Fri 9:30–16:00 ET. */
const ET_OPTS: Intl.DateTimeFormatOptions = { timeZone: "America/New_York", hour12: false, weekday: "short", hour: "2-digit", minute: "2-digit" };

function etNow(): { day: string; mins: number } {
  const parts = new Intl.DateTimeFormat("en-US", ET_OPTS).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const day = get("weekday");
  const h = Number(get("hour"));
  const m = Number(get("minute"));
  return { day, mins: (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0) };
}

export default function MarketPulse({ compact = false }: { compact?: boolean }) {
  const { day, mins } = etNow();
  const open = !["Sat", "Sun"].includes(day) && mins >= 570 && mins < 960; // 9:30–16:00 ET
  return (
    <span className={`tt-market-pulse ${open ? "" : "closed"}`} title="US equity session (ET)">
      <span className="dot" aria-hidden />
      {compact ? (open ? "OPEN" : "CLOSED") : open ? "MARKET OPEN" : "MARKET CLOSED"}
    </span>
  );
}
