const COLORS: Record<string, string> = {
  bullish: "text-jade border-jade/40 bg-jade/10",
  bearish: "text-blood border-blood/40 bg-blood/10",
  caution: "text-gold border-gold/40 bg-gold/10",
  neutral: "text-bone-soft border-soil-500 bg-soil-800",
  "insufficient-evidence": "text-bone-soft border-soil-600 bg-soil-950",
};

export default function StanceBadge({ stance }: { stance: string }) {
  const cls = COLORS[stance] ?? COLORS.neutral;
  return (
    <span
      className={`inline-block rounded-full border px-2.5 py-1 font-mono text-[0.58rem] uppercase tracking-[0.18em] ${cls}`}
    >
      {stance.replace("-", " ")}
    </span>
  );
}
