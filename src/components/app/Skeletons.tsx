/** Skeleton kit — geometry-preserving placeholders (spec: no layout shift, one shimmer treatment). */
export function SkeletonText({ w = "100%" }: { w?: number | string }) {
  return <span className="tt-skel tt-skel-text" style={{ width: w }} aria-hidden />;
}

export function SkeletonRows({ rows = 8 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Loading data" className="w-full">
      {Array.from({ length: rows }, (_, i) => (
        <div className="tt-skel-row" key={i} aria-hidden>
          <SkeletonText w={64} />
          <SkeletonText w="30%" />
          <span style={{ flex: 1 }} />
          <span className="tt-skel tt-skel-spark" />
          <span className="tt-skel tt-skel-price" />
          <span className="tt-skel tt-skel-chip" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonCards({ n = 4 }: { n?: number }) {
  return (
    <div role="status" aria-label="Loading data" className="tt-skel-grid" aria-live="polite">
      {Array.from({ length: n }, (_, i) => (
        <div className="tt-skel-card" key={i} aria-hidden>
          <SkeletonText w="55%" />
          <div style={{ height: 10 }} />
          <span className="tt-skel tt-skel-big" />
          <div style={{ height: 12 }} />
          <SkeletonText w="80%" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonChart({ h = 180 }: { h?: number }) {
  return (
    <div role="status" aria-label="Loading chart" aria-hidden>
      <span className="tt-skel tt-skel-chart" style={{ height: h, display: "block" }} />
    </div>
  );
}
