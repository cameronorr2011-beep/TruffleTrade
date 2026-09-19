import type { BlogPost } from "./posts";

/**
 * Long-form field notes, part A. Each article targets one search intent and
 * teaches the underlying idea honestly before explaining how TruffleTrade
 * applies it. No price targets, no performance claims.
 */
export const ARTICLES_A: BlogPost[] = [
  {
    slug: "reverse-dcf-what-the-price-already-believes",
    title: "Reverse DCF: what the stock price already believes",
    description:
      "A normal DCF asks what a company is worth. A reverse DCF asks what growth the current price already assumes — and that is the question that actually protects you. How it works, how to read it, and why TruffleTrade exposes every assumption.",
    date: "2026-09-12",
    minutes: 8,
    tags: ["valuation", "DCF", "fundamentals"],
    body: [
      {
        paragraphs: [
          "Every discounted-cash-flow model is a machine for turning assumptions into a number. Feed it a growth rate, a discount rate, and a terminal value, and it hands you a 'fair value' with two decimal places of false precision. The trouble is that the output is only as honest as the inputs, and the inputs are exactly where wishful thinking lives. A reverse DCF flips the machine around. Instead of asking what the business is worth, it takes the price the market is charging today and solves for the growth the company would have to deliver to justify it. The answer is not a forecast. It is a confession — the market telling you, in plain numbers, what it already expects.",
        ],
      },
      {
        heading: "Why the forward DCF fools people",
        paragraphs: [
          "The classic DCF has a structural weakness: most of its value sits in the terminal period, the part of the future nobody can see. Change the terminal growth rate from 2.5% to 3.5% and the fair value of a mature company can move 20–30%. Change the discount rate by one point and the whole picture flips. Analysts know this, which is why professional models come with sensitivity tables — but retail tools almost never show them. They show a single 'fair value', paint it green or red against the current price, and call it analysis.",
          "That single number invites a specific mistake. You start with a view — 'I like this company' — then you nudge the growth assumption until the fair value confirms the view. You didn't do valuation; you did rationalization with a spreadsheet. The reverse DCF makes this harder because it removes the dial you were tempted to turn.",
        ],
      },
      {
        heading: "How a reverse DCF actually works",
        paragraphs: [
          "Start with the things you can observe: the current share price, the share count, net debt, and trailing free cash flow. From those, the market capitalization and the enterprise value are arithmetic, not opinion. Then hold the discount rate and the terminal growth rate fixed — use the same values you would use in a forward model, and write them down. Now solve for the one unknown: the annual free-cash-flow growth rate over the explicit forecast period (usually five years) that makes the present value of all future cash flows equal to today's enterprise value.",
          "There is no closed-form answer, so the model iterates: try 8% growth, compute the present value, compare with the market price, adjust, repeat. Within a few dozen steps it converges on the implied growth rate. If a company trades at a price that implies 24% annual FCF growth for five years, that is the bar it must clear just to be worth what it costs today. Everything above that is upside; everything below is disappointment already priced for perfection.",
        ],
      },
      {
        heading: "Reading the implied growth rate",
        paragraphs: [
          "The implied number is only useful in comparison. Three anchors help. First, the company's own history: has it ever grown free cash flow at the implied rate for five consecutive years? Second, the base rates for its size: very few companies with more than $10 billion in revenue sustain 20%+ FCF growth for half a decade, and the ones that did are famous precisely because it is rare. Third, the peer set: if the implied growth is double the median for comparable businesses, the market is either seeing something the peers lack, or it is wrong.",
          "A low implied growth rate is not automatically a bargain, either. Sometimes the market is correctly pricing a business in decline, a balance sheet under strain, or an industry losing pricing power. The reverse DCF tells you what belief you are buying; it does not tell you whether the belief is right. That judgment still belongs to you.",
        ],
      },
      {
        heading: "What TruffleTrade does with it",
        paragraphs: [
          "Inside TruffleTrade, the DCF and the reverse DCF are deterministic code, not AI. They run before any analyst is consulted, and the Valuation analyst receives their output with every assumption spelled out: base free cash flow, discount rate, terminal growth, net debt, the sensitivity range across a grid of inputs, and the implied five-year growth rate. The analyst's mandate is narrow — attack or defend those assumptions using the data pack. It is forbidden from quoting a fair value without naming the assumptions that produce it, and if fundamentals are gated or missing it must answer 'insufficient evidence' rather than estimate.",
          "The red team then gets the same numbers and a checklist that includes: does the valuation depend on one fragile assumption? A thesis that only works if terminal growth is 4% gets flagged. The point is not that the model is smarter than a spreadsheet. It is that nobody in the pipeline — human or machine — is allowed to hide the dial they turned.",
        ],
      },
      {
        heading: "Doing it yourself",
        paragraphs: [
          "You do not need software to run a rough reverse DCF. Take enterprise value, divide by trailing free cash flow to get the EV/FCF multiple, and compare it with the multiple a plausible growth path would justify at your discount rate. A 40× EV/FCF multiple at a 9% discount rate implies growth in the high teens for years; a 15× multiple implies mid-single digits. Then ask the only question that matters: do I actually believe that, and what would I need to see to stop believing it? Write the answer down before you buy. It is the cheapest insurance in investing.",
        ],
      },
    ],
  },
  {
    slug: "reading-rsi-without-lying-to-yourself",
    title: "How to read RSI without lying to yourself",
    description:
      "RSI is the most-quoted and most-misread indicator in retail trading. What it actually measures, why 'overbought' is not a sell signal, how regime changes the rules, and how TruffleTrade keeps its AI from inventing indicator values.",
    date: "2026-09-13",
    minutes: 7,
    tags: ["technicals", "indicators", "RSI"],
    body: [
      {
        paragraphs: [
          "The Relative Strength Index is a fourteen-period ratio of average gains to average losses, squashed into a 0–100 scale. That is all it is. It does not know about earnings, it does not know about the Fed, and it has no opinion about the future. Yet it is quoted in more retail trade rationales than any other number, usually in the form 'RSI is 72, it's overbought, I'm selling'. That sentence contains one fact and two mistakes.",
        ],
      },
      {
        heading: "What RSI measures",
        paragraphs: [
          "Over the last fourteen bars, RSI compares the average size of up-closes to the average size of down-closes. If every bar closed higher, RSI approaches 100. If every bar closed lower, it approaches 0. A reading of 50 means gains and losses have been roughly balanced. The 70 and 30 lines that everyone quotes are not laws; they are the defaults J. Welles Wilder chose in 1978 for daily commodity charts. They describe how one-sided the recent tape has been. They do not describe what happens next.",
          "The first mistake is calling 70 'overbought' as if it meant 'about to fall'. In a strong uptrend, RSI can sit above 70 for weeks while the price keeps rising — the indicator is correctly reporting that buyers have dominated, and buyers often keep dominating. Selling because RSI crossed 70 in a trending market is a reliable way to exit early and watch from the sidelines.",
        ],
      },
      {
        heading: "Regime first, indicator second",
        paragraphs: [
          "The second mistake is reading RSI without asking what kind of market you are in. In a range-bound market, RSI extremes do tend to mean-revert: 30 often marks a bounce and 70 often marks a fade, because price is oscillating between levels. In a trending market, the same readings mean the opposite: RSI pulling back to 40–50 during an uptrend is frequently where the trend resumes, and readings above 70 confirm momentum rather than exhaust it. The indicator has not changed. The context has.",
          "This is why TruffleTrade computes a trend regime before any analyst sees RSI. Using moving-average alignment, realized volatility and drawdown, the data pack labels the current state — calm uptrend, volatile downtrend, high-vol chop, and so on — and hands the label to the Technicals analyst alongside the indicator values. The analyst's instruction is explicit: regime first, chart second. An RSI of 68 in a calm uptrend and an RSI of 68 in a volatile range are different pieces of evidence, and the system is required to treat them differently.",
        ],
      },
      {
        heading: "Divergence, the honest version",
        paragraphs: [
          "The one RSI pattern with real information content is divergence: price makes a new high while RSI makes a lower high, or price makes a new low while RSI makes a higher low. It means the most recent leg was driven by smaller average gains than the previous one — momentum is fading even as price extends. That is worth noticing. It is also worth noticing how often divergences resolve by price simply continuing, especially on daily charts in strong trends. Divergence is a yellow flag, not a signal. Combine it with structure — a break of the prior swing, a failed retest — before you act on it.",
        ],
      },
      {
        heading: "Why the AI is not allowed to compute RSI",
        paragraphs: [
          "Large language models are fluent and confident, and they will happily tell you a stock's RSI is 61.4 without having any way to know. In TruffleTrade, every indicator — RSI, MACD, ATR, moving averages, support and resistance, relative strength versus SPY — is computed deterministically in code from the actual candle series. The AI receives the numbers as text and is forbidden from inventing or recomputing them. Then a fact-checker extracts every numeric claim from the analyst's prose and verifies it against the metric table, with a tolerance of ±2 points for RSI. An analyst that cites an RSI value the data does not support loses confidence weight and has the number stripped from its report.",
          "It sounds like overkill for one indicator. It is not. Once you allow a model to generate one number from thin air, you have no principled way to trust any of the others.",
        ],
      },
      {
        heading: "A short checklist",
        paragraphs: [
          "Before you let an RSI reading change a decision: name the regime; ask whether 70/30 are even the right thresholds for this instrument's volatility; look for divergence against the prior swing, not against last week; and check the historical replay — how did this ticker actually behave the last twenty times it was in this regime with RSI in this bucket? TruffleTrade's Backtest analyst answers that last question with the ticker's own three-year history and cites the sample size. If the sample is under eight occurrences, it says so and declines to conclude. You should hold yourself to the same standard.",
        ],
      },
    ],
  },
  {
    slug: "fact-checking-ai-stock-analysis",
    title: "Why every number an AI says about a stock must be fact-checked",
    description:
      "Language models produce fluent, confident, and occasionally invented numbers. For financial research that is disqualifying. How hallucinated figures happen, why prompts alone don't fix it, and how a deterministic fact-checker keeps AI stock analysis honest.",
    date: "2026-09-14",
    minutes: 8,
    tags: ["AI safety", "hallucination", "architecture"],
    body: [
      {
        paragraphs: [
          "Ask a general-purpose chatbot for a company's gross margin and it will answer instantly, in a complete sentence, with a percentage to one decimal place. Sometimes the number is right. Sometimes it is from three years ago. Sometimes it belongs to a different company with a similar name. And sometimes it is simply generated — a plausible-sounding figure assembled from the statistical shape of ten thousand earnings reports the model read during training. The sentence looks identical in every case. That is the problem.",
        ],
      },
      {
        heading: "Why models invent numbers",
        paragraphs: [
          "A language model does not look things up; it predicts the next token. When the prompt says 'the gross margin is', the highest-probability continuation is a percentage, because that is what follows those words in the training data. Whether the specific percentage is true is not a quantity the model is optimizing. Retrieval-augmented setups help — if the real figure is in the context window, the model will usually prefer it — but 'usually' is not a standard you can build financial research on. Models also blend: given a P/E of 31 and a forward P/E of 26 in the context, a model asked about valuation may cheerfully report 28.",
          "Prompting reduces this. Telling the model 'only cite numbers present in the data' cuts fabrication noticeably. It does not eliminate it, and you cannot tell from the output which cases slipped through. If your product is a research terminal, an unverifiable 5% error rate on numbers is not a rough edge; it is a defect in the one thing the product is for.",
        ],
      },
      {
        heading: "The fact-checker: extraction and verification",
        paragraphs: [
          "TruffleTrade treats every analyst's output as a claim to be audited, not a result to be displayed. The pipeline has three deterministic steps. First, the data pack is compiled into a metric table — price, RSI, moving averages, margins, growth rates, multiples, drawdown, relative strength — every value computed in code from primary sources. Second, a claim extractor scans the analyst's prose for numbers and pairs each one with the metric phrase nearest to it: '38× forward' becomes a claim about forward P/E, 'RSI near 62' becomes a claim about RSI. Third, each claim is verified against the table within a tolerance appropriate to the metric: ±2 points for RSI, 5% for mid-sized values, 3% for large ones.",
          "A claim that fails is recorded as a violation with a reason — unsupported number, contradicted value, or stale data — and the consequences are mechanical. The analyst's verified confidence is reduced by 35% per violation, its weight in the consensus drops, and the offending number is stripped from the final report so it cannot mislead a reader who skims. Nothing about this depends on the model being well-behaved.",
        ],
      },
      {
        heading: "Design consequences",
        paragraphs: [
          "Once you commit to auditing numbers, the rest of the architecture follows. Analysts must receive their data as structured text, so the checker knows what the ground truth is. Indicators must be computed in code, never by the model. Missing data must be represented honestly — 'DATA UNAVAILABLE' — because a model asked to fill a gap will fill it. Every prompt carries a version string that is stored with every output, so when a change in wording shifts the violation rate you can see it. And the red team, whose job is to attack the council, gets the violation list as input: an analyst that cited two unsupported numbers is an analyst whose whole reasoning deserves suspicion.",
          "There is also a subtle benefit for the models themselves. Knowing that every figure will be checked, and being told so in the system prompt, measurably changes their behavior toward hedged, sourced language — 'evidence suggests', 'data unavailable' — which is exactly the register financial research should be written in.",
        ],
      },
      {
        heading: "What the checker cannot do",
        paragraphs: [
          "Honesty requires listing the limits. The fact-checker verifies numbers against the data pack; it cannot verify qualitative claims like 'management is strong' or 'the moat is widening'. Those are handled differently — analysts must ground them in specific headlines or metrics, and the red team is instructed to object to any that are not — but they are not mechanically checkable. The checker also inherits the quality of its sources: if the fundamentals provider serves stale data, the checker will faithfully verify stale numbers. That is why the data pack records retrieval and as-of timestamps and why 'stale data' is its own violation class.",
          "None of this makes the analysis right. It makes the analysis auditable, which is the precondition for finding out whether it is right. Every TruffleTrade run stores who claimed what, which claims survived, and how the forecast resolved. Over time, that record — hits and misses alike — is the only honest measure of an AI research system. A tool that will not show you its misses has not earned your trust on its hits.",
        ],
      },
    ],
  },
];
