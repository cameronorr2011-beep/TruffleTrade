/** The logo mark, inlined as SVG so satori (next/og) can rasterize it. */
export function OgMark({ size = 72 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 240 240">
      <defs>
        <linearGradient id="og-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2a1f16" />
          <stop offset="1" stopColor="#0b0806" />
        </linearGradient>
        <linearGradient id="og-gold" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#a8752a" />
          <stop offset=".5" stopColor="#e8b452" />
          <stop offset="1" stopColor="#fbe2a0" />
        </linearGradient>
      </defs>
      <rect width="240" height="240" rx="56" fill="url(#og-bg)" />
      <rect x="2" y="2" width="236" height="236" rx="54" fill="none" stroke="#f6d488" strokeOpacity="0.2" strokeWidth="3" />
      <path
        d="M112 74C130 68 150 76 158 92C172 96 181 112 175 128C184 142 177 162 161 170C155 186 133 194 117 186C99 194 77 186 71 168C53 162 47 140 57 126C49 110 59 92 77 88C83 74 99 68 112 74Z"
        fill="#3a2c21"
        stroke="#080604"
        strokeWidth="3"
      />
      <path d="M40 180L86 134L112 154L150 110L168 126L204 66" fill="none" stroke="url(#og-gold)" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M176 66L204 66L204 94" fill="none" stroke="#fbe2a0" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="40" cy="180" r="9" fill="#fbe2a0" />
    </svg>
  );
}
