export default function EquityCurve({ points }: { points: { ts: number; equityUsd: number }[] }) {
  if (points.length < 2) {
    return (
      <p className="mt-6 font-mono text-[0.72rem] text-bone-soft">
        The curve draws itself as cycles complete. Run the engine and come back.
      </p>
    );
  }
  const w = 640;
  const h = 180;
  const vals = points.map((p) => p.equityUsd);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const step = w / (points.length - 1);
  const coords = points.map((p, i) => [i * step, h - ((p.equityUsd - min) / span) * (h - 20) - 10] as const);
  const path = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${path} L${w},${h} L0,${h} Z`;
  const up = vals[vals.length - 1] >= vals[0];
  const stroke = up ? "#35c98e" : "#d1462f";

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-5 w-full" role="img" aria-label="Equity curve">
      <defs>
        <linearGradient id="eqfill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.25" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#eqfill)" />
      <path d={path} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={coords[coords.length - 1][0]} cy={coords[coords.length - 1][1]} r="3.5" fill={stroke} />
    </svg>
  );
}
