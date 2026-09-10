import type { AccountState, CouncilDecision, MarketSnapshot, RedTeamVerdict, Side } from "./types";
import { tallyVotes } from "./tally";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

interface GroqResponse {
  choices?: { message?: { content?: string } }[];
  error?: { message?: string };
}

async function groqJson<T>(
  apiKey: string,
  model: string,
  system: string,
  user: string,
  maxTokens = 2500,
): Promise<T> {
  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
      temperature: 0.4,
      max_completion_tokens: maxTokens,
      reasoning_effort: "low",
    }),
    signal: AbortSignal.timeout(60_000),
  });
  const j = (await res.json()) as GroqResponse;
  if (!res.ok || j.error) {
    throw new Error(`Groq: ${j.error?.message ?? `HTTP ${res.status}`}`);
  }
  const text = j.choices?.[0]?.message?.content ?? "";
  return JSON.parse(text) as T;
}

const MARKET_PRIMER = (s: MarketSnapshot) => ({
  btc: {
    price: s.btcPrice,
    rsi14: Math.round(s.featurePack.rsi14 * 10) / 10,
    macdHist: Math.round(s.featurePack.macdHist * 100) / 100,
    sma20: Math.round(s.featurePack.sma20),
    sma50: Math.round(s.featurePack.sma50),
    atrPct: Math.round(s.featurePack.atrPct * 100) / 100,
    bbPctB: Math.round(s.featurePack.bbPctB * 100) / 100,
    donchian20High: Math.round(s.featurePack.donchian20High),
    donchian20Low: Math.round(s.featurePack.donchian20Low),
    volZ: Math.round(s.featurePack.volZ * 100) / 100,
    ret24hPct: Math.round(s.featurePack.ret24h * 100) / 100,
    ret7dPct: Math.round(s.featurePack.ret7d * 100) / 100,
    ret30dPct: Math.round(s.featurePack.ret30d * 100) / 100,
    realizedVolDailyPct: Math.round(s.realizedVol1dPct * 100) / 100,
  },
  macro: {
    spy: `${s.macro.spy.changePct.toFixed(2)}%`,
    vixy: `${s.macro.vixy.changePct.toFixed(2)}%`,
    dxy: s.macro.dxy.changePct.toFixed(2) + "%",
    riskOn: s.macro.riskOn,
    btcSpyCorr: s.macro.btcSpyCorrelation == null ? null : Math.round(s.macro.btcSpyCorrelation * 100) / 100,
  },
});

interface RawVote {
  agent: string;
  style: string;
  side: string;
  confidence: number;
  rationale: string;
}

const AGENTS: { name: string; style: string; brief: string }[] = [
  {
    name: "Momentum",
    style: "trend-follower",
    brief:
      "You are MOMENTUM, a trend-follower. You buy strength and sell weakness. You care about breakouts, MACD, Donchian channels, and 30d return. You are wrong in chop but ride big trends.",
  },
  {
    name: "Reversion",
    style: "mean-reverter",
    brief:
      "You are REVERSION, a mean-reverter. You fade extended moves. You care about RSI extremes, Bollinger %B, and distance from SMA20. You are wrong in strong trends but nail exhaustions.",
  },
  {
    name: "Macro",
    style: "macro-strategist",
    brief:
      "You are MACRO, a top-down strategist. You care about SPY direction, VIXY fear, DXY pressure on BTC, and the BTC-SPY correlation. You size based on regime, not price patterns.",
  },
  {
    name: "Flow",
    style: "volume-analyst",
    brief:
      "You are FLOW, a volume/flow analyst. You care about volume z-score confirming or denying moves, vol-of-vol, and whether candles have conviction. You distrust low-volume breakouts.",
  },
  {
    name: "Sentinel",
    style: "risk-guardian",
    brief:
      "You are SENTINEL, a capital-preservation specialist. Your default is HOLD or SELL into strength. You oppose entries when realized vol is elevated, drawdowns are fresh, or the structure is broken. You would rather miss a trade than take a bad one.",
  },
];

const voteSchema =
  'Respond ONLY with JSON: {"side":"buy"|"hold"|"sell","confidence":<0..1>,"rationale":"<=2 sentences"}';

export async function runCouncil(
  apiKey: string,
  model: string,
  snap: MarketSnapshot,
  account: AccountState,
): Promise<CouncilDecision> {
  const market = JSON.stringify(MARKET_PRIMER(snap));
  const acct = JSON.stringify({
    equityUsd: Math.round(account.equityUsd),
    position: account.position,
    peakEquityUsd: Math.round(account.peakEquityUsd),
    killSwitchDd: 0.15,
  });

  const votes = await Promise.all(
    AGENTS.map(async (agent) => {
      const system = `${agent.brief}\n${voteSchema}\nNever hedge with prose outside JSON. Confidence below 0.35 means abstain (report side "hold").`;
      const user = `Live market state:\n${market}\n\nDesk account:\n${acct}\n\nCast your vote for the next 1-4h horizon.`;
      try {
        const v = await groqJson<RawVote>(apiKey, model, system, user, 1200);
        const side: Side = v.side === "buy" || v.side === "sell" ? v.side : "hold";
        return {
          agent: agent.name,
          style: agent.style,
          side,
          confidence: Math.min(1, Math.max(0, Number(v.confidence) || 0)),
          rationale: String(v.rationale ?? "").slice(0, 400),
        };
      } catch (err) {
        return {
          agent: agent.name,
          style: agent.style,
          side: "hold" as Side,
          confidence: 0,
          rationale: `vote failed: ${(err as Error).message}`.slice(0, 400),
        };
      }
    }),
  );

  // Weighted tally: conviction-weighted net vote (shared, tested logic)
  const tally = tallyVotes(votes);
  const net = tally.net;
  let side: Side = tally.side;

  // Red team: adversarial check on any non-hold direction
  let redTeam: RedTeamVerdict = { approved: false, confidence: 0, objections: [], notes: "no proposal on table" };
  if (side !== "hold") {
    const rtSystem =
      'You are RED TEAM, a hostile risk committee. Your job is to find reasons the desk should NOT take this trade. Attack the weak votes, the regime, the vol, the macro. If the case survives your attack, approve it. Respond ONLY with JSON: {"approved":true|false,"confidence":<0..1>,"objections":["..."],"notes":"<=2 sentences"}';
    const rtUser = `Market:\n${market}\n\nAccount:\n${acct}\n\nCouncil votes:\n${JSON.stringify(votes)}\n\nCouncil direction: ${side} (net conviction ${net.toFixed(2)}). Tear it apart.`;
    try {
      redTeam = await groqJson<RedTeamVerdict>(apiKey, model, rtSystem, rtUser, 1500);
      redTeam.objections = (redTeam.objections ?? []).slice(0, 6).map((o) => String(o).slice(0, 300));
    } catch (err) {
      redTeam = {
        approved: false,
        confidence: 0,
        objections: [`red team unreachable: ${(err as Error).message}`],
        notes: "fail-closed: proposal rejected",
      };
    }
    if (!redTeam.approved) side = "hold";
  }

  const conviction = side === "hold" ? 0 : tally.conviction;

  return {
    side,
    conviction: Math.round(conviction * 100) / 100,
    entry: side === "hold" ? null : snap.btcPrice,
    stop: null,
    target: null,
    riskUsd: null,
    rationale:
      side === "hold"
        ? `No trade: net conviction ${net.toFixed(2)}${redTeam.approved ? "" : `; red team blocked (${redTeam.objections[0] ?? redTeam.notes})`}`
        : `Council ${side} @ net ${net.toFixed(2)}, red team approved (${Math.round((redTeam.confidence ?? 0) * 100)}%)`,
    votes,
    redTeam,
    model,
  };
}
