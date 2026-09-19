/**
 * TruffleTrade mark — inline so it renders crisp at any size with no request.
 * Keep in sync with public/logo.svg (the file used by JSON-LD / manifest).
 */
export default function Logo({ size = 34, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 240 240"
      role="img"
      aria-label="TruffleTrade"
      className={`shrink-0 rounded-[22%] shadow-[0_6px_18px_rgba(0,0,0,0.45)] ${className}`}
    >
      <defs>
        <linearGradient id="tt-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#231a13" />
          <stop offset="1" stopColor="#090705" />
        </linearGradient>
        <radialGradient id="tt-truffle" cx=".36" cy=".3" r=".8">
          <stop offset="0" stopColor="#5a4736" />
          <stop offset=".55" stopColor="#2d221a" />
          <stop offset="1" stopColor="#17110d" />
        </radialGradient>
        <linearGradient id="tt-gold" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#a8752a" />
          <stop offset=".5" stopColor="#e8b452" />
          <stop offset="1" stopColor="#fbe2a0" />
        </linearGradient>
      </defs>
      <rect width="240" height="240" rx="56" fill="url(#tt-bg)" />
      <rect x="1" y="1" width="238" height="238" rx="55" fill="none" stroke="#f6d488" strokeOpacity=".16" strokeWidth="2" />
      <path
        d="M112 74C130 68 150 76 158 92C172 96 181 112 175 128C184 142 177 162 161 170C155 186 133 194 117 186C99 194 77 186 71 168C53 162 47 140 57 126C49 110 59 92 77 88C83 74 99 68 112 74Z"
        fill="url(#tt-truffle)"
        stroke="#080604"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <g fill="#6b5543" opacity=".55">
        <circle cx="96" cy="98" r="9" />
        <circle cx="128" cy="92" r="7.5" />
        <circle cx="150" cy="118" r="8" />
        <circle cx="84" cy="130" r="8.5" />
        <circle cx="118" cy="128" r="10" />
        <circle cx="142" cy="152" r="8" />
        <circle cx="100" cy="162" r="9" />
      </g>
      <path
        d="M40 180L86 134L112 154L150 110L168 126L204 66"
        fill="none"
        stroke="url(#tt-gold)"
        strokeWidth="13"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M176 66L204 66L204 94" fill="none" stroke="#fbe2a0" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="40" cy="180" r="8" fill="#fbe2a0" />
    </svg>
  );
}
