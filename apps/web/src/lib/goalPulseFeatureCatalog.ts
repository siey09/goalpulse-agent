export type FeatureCategory = "live-intelligence" | "strategy" | "trust" | "operations";

export interface GoalPulseFeature {
  id: string;
  name: string;
  shortName: string;
  aliases: string[];
  category: FeatureCategory;
  summary: string;
  implementation: string[];
  formulas: string[];
  evidence: string;
  limitation: string;
}

export type AnalystReply =
  | { kind: "text"; content: string }
  | { kind: "feature-index"; content: string; featureIds: string[] }
  | { kind: "feature-detail"; content: string; featureId: string }
  | { kind: "help"; content: string };

export const FEATURE_CATEGORY_LABELS: Record<FeatureCategory, string> = {
  "live-intelligence": "Live intelligence",
  strategy: "Strategy",
  trust: "Trust & verification",
  operations: "Operations",
};

export const GOALPULSE_FEATURES: GoalPulseFeature[] = [
  {
    id: "live-markets",
    name: "Live Markets & Odds Movement",
    shortName: "Live Markets",
    aliases: ["live markets", "odds movement", "odds", "txline"],
    category: "live-intelligence",
    summary: "Tracks live 1X2 and total-goals prices as an explainable market tape.",
    implementation: [
      "Normalize TxLINE prices into isolated histories for each fixture, outcome, and market.",
      "Compare adjacent snapshots, preserve their real timestamps, and plot the selected price tape.",
      "Keep finished fixtures inspectable when historical snapshots are available.",
    ],
    formulas: [
      "Implied probability = (1 / decimal odds) × 100.",
      "Odds compression = ((odds before - odds after) / odds before) × 100.",
    ],
    evidence: "TxLINE odds snapshots, fixture metadata, and TXODDS Scores context.",
    limitation: "GoalPulse receives a stable consensus price, not separate prices from multiple bookmakers.",
  },
  {
    id: "signal-detection",
    name: "Signal Detection & Severity",
    shortName: "Signal Detection",
    aliases: ["signals", "signal detection", "severity", "sharp move", "momentum shift"],
    category: "live-intelligence",
    summary: "Turns meaningful price compression into deterministic WATCH, MOMENTUM_SHIFT, or SHARP_MOVE signals.",
    implementation: [
      "Measure compression on the home, draw, away, and supported total-goals sides.",
      "Choose the side with the strongest qualifying move instead of defaulting to the home side.",
      "Attach the original and current snapshots, field context, and a plain-language explanation.",
    ],
    formulas: [
      "LOW / WATCH: compression ≥ 4%; MEDIUM / MOMENTUM_SHIFT: ≥ 8%; HIGH / SHARP_MOVE: ≥ 15%.",
      "Probability-point shift = (1 / odds after - 1 / odds before) × 100; it is reported separately from compression.",
    ],
    evidence: "The signal stores both compared TxLINE snapshots and the selected market target.",
    limitation: "Crossing a threshold identifies market movement; it does not guarantee the final result.",
  },
  {
    id: "confidence-score",
    name: "Composite Confidence Score",
    shortName: "Confidence",
    aliases: ["confidence", "confidence score", "composite confidence", "calibration"],
    category: "live-intelligence",
    summary: "Scores signal quality from movement magnitude, field pressure, and context freshness without calling it a win probability.",
    implementation: [
      "Normalize compression against the 15% high-severity reference and field pressure against its 45-point maximum.",
      "Blend available components and renormalize weights when field context is unavailable.",
      "Apply the archived-data-derived longshot adjustment after the base composite.",
    ],
    formulas: [
      "Base score = weighted mean of magnitude (0.5), field pressure (0.3), and freshness tightness (0.2).",
      "Magnitude = clamp(compression / 15 × 100, 0, 100); field pressure = clamp(pressure / 45 × 100, 0, 100).",
      "When odds after ≥ 3.0, confidence = base score × 0.3.",
    ],
    evidence: "Weights and the 3.0 longshot boundary are implemented in the signal engine; the penalty ratio came from settled archive data.",
    limitation: "This is a quality score, not a literal probability of winning, and calibration remains sample-size dependent.",
  },
  {
    id: "field-pressure",
    name: "Field Pressure & Reliability",
    shortName: "Field Pressure",
    aliases: ["field pressure", "pressure", "scores context", "reliability"],
    category: "live-intelligence",
    summary: "Explains whether a price move is supported by recent match action or is market-only.",
    implementation: [
      "Attach the nearest eligible TXODDS Scores action to the market snapshot.",
      "Classify pressure from possession and match actions such as shots, goals, penalties, VAR, and cards.",
      "Reduce trust when the feed marks context suspended, unreliable, amended, or discarded.",
    ],
    formulas: [
      "Field-backed threshold: field pressure score ≥ 22; lower values are treated as market-only context.",
      "Momentum score subtracts 10 for UNRELIABLE context or 18 for SUSPENDED context.",
    ],
    evidence: "TXODDS Scores action, team side, timestamp, scoreline, pressure level, and reliability flag.",
    limitation: "A nearby event is contextual evidence, not proof that the event caused the odds move.",
  },
  {
    id: "steam-detection",
    name: "Steam Move Detection",
    shortName: "Steam Moves",
    aliases: ["steam", "steam move", "steam moves", "sustained movement"],
    category: "live-intelligence",
    summary: "Finds sustained same-direction pressure across a sequence of recent ticks rather than one price pair.",
    implementation: [
      "Sort snapshots by their real timestamps and inspect the trailing run for each side.",
      "Count consecutive qualifying compressions, stopping at the first non-qualifying move.",
      "Return at most one current steam side per fixture with its first and last prices.",
    ],
    formulas: [
      "Requires at least 3 consecutive moves, each with compression ≥ 1%.",
      "The complete qualifying run must fit within 5 minutes.",
    ],
    evidence: "The returned first tick, last tick, tick count, elapsed window, and aggregate compression come from stored snapshots.",
    limitation: "It answers whether steam is happening now; it is not a scan of every historical run.",
  },
  {
    id: "signal-correlation",
    name: "Cross-Match Signal Correlation",
    shortName: "Correlation",
    aliases: ["correlation", "signal correlation", "clusters", "cross match"],
    category: "live-intelligence",
    summary: "Surfaces the same signal pattern appearing across multiple real fixtures in a short window.",
    implementation: [
      "Group signals by side, severity, and market pattern.",
      "Require distinct match ids so repeated signals from one fixture cannot masquerade as correlation.",
      "Rank the genuine multi-match clusters and expose their member fixtures.",
    ],
    formulas: ["A reported cluster must span at least 2 distinct real matches."],
    evidence: "Signal ids, timestamps, match ids, selected sides, severities, and market types.",
    limitation: "Correlation is shared pattern evidence, not proof that fixtures influence one another.",
  },
  {
    id: "outcome-audit",
    name: "Outcome Audit & Reversal Radar",
    shortName: "Outcome Audit",
    aliases: ["outcome audit", "audit", "reversal", "trap", "score reality"],
    category: "trust",
    summary: "Replays stored signals against finished scores to distinguish continuation from rejected market moves.",
    implementation: [
      "Replay the stored TxLINE snapshot sequence through the same deterministic signal logic.",
      "Settle each signal against the relevant 1X2 or total-goals final result.",
      "Classify failed continuation, reversal risk, council votes, and score-reality evidence.",
    ],
    formulas: ["Council consensus = agreeing agent votes / 3; dissent remains visible in the receipt."],
    evidence: "Compared odds, final score breakdown, result status, three-agent vote, and SHA-256 audit hash.",
    limitation: "A local SHA-256 hash is tamper-evident only when compared with another copy; it is not automatically on-chain.",
  },
  {
    id: "agent-arena",
    name: "Agent vs Agent Arena",
    shortName: "Agent Arena",
    aliases: ["arena", "agent arena", "agents", "strategies", "momentum follower", "contrarian"],
    category: "strategy",
    summary: "Compares Momentum Follower, Contrarian, and Kelly Criterion strategies on the same settled signal feed.",
    implementation: [
      "Generate strategy-specific simulated positions from identical signal evidence.",
      "Settle positions against audited outcomes and retain rejection reasons.",
      "Rank eligible agents by recorded performance while showing sample size and concentration caveats.",
    ],
    formulas: [
      "Win rate = correct settled positions / all settled positions × 100.",
      "ROI = net units / total units staked × 100.",
    ],
    evidence: "Per-position signal id, side, odds, stake, result, profit, and tamper-evident ledger hash.",
    limitation: "All positions and units are simulated; GoalPulse does not move funds or place wagers.",
  },
  {
    id: "kelly-criterion",
    name: "Kelly Criterion Risk Sizing",
    shortName: "Kelly Criterion",
    aliases: ["kelly", "kelly criterion", "kelly sizing", "stake sizing"],
    category: "strategy",
    summary: "Uses confidence to scale a bounded assumed edge over the market price, then applies a strict risk limit.",
    implementation: [
      "Convert decimal odds into the market break-even probability.",
      "Add a confidence-scaled edge capped at 15%, then calculate the raw Kelly fraction.",
      "Reject positions above the 20% raw risk limit; scale accepted fractions to a 10-unit comparison bankroll.",
    ],
    formulas: [
      "p = clamp(1 / odds + confidence / 100 × 0.15, 0, 1); b = odds - 1; q = 1 - p.",
      "Raw Kelly fraction = (b × p - q) / b; accepted stake = clamped fraction × 10 units.",
    ],
    evidence: "The position records confidence, odds taken, stake units, risk rejection code, and settled profit.",
    limitation: "Confidence is not treated as win probability, and the feature is a simulation—not staking advice.",
  },
  {
    id: "market-maker",
    name: "In-Play Market Maker",
    shortName: "Market Maker",
    aliases: ["market maker", "spread", "bid ask", "fair odds", "quote"],
    category: "strategy",
    summary: "Builds independent fair, bid, and ask quotes and widens uncertainty when pressure or feed risk rises.",
    implementation: [
      "Normalize the latest outcome probabilities into an independent fair-price book.",
      "Add a pressure contribution and a reliability penalty to the base spread.",
      "Apply half the resulting spread around fair probability, then convert back to decimal odds.",
    ],
    formulas: [
      "Spread % = clamp(2 + pressure / 45 × 6 + reliability penalty, 2, 20).",
      "Reliability penalty = 0 normally, 4 when UNRELIABLE, or 8 when SUSPENDED.",
    ],
    evidence: "Latest normalized snapshot, field pressure, reliability status, fair odds, bid/ask odds, and reason text.",
    limitation: "These are analytical simulated quotes; GoalPulse does not operate an exchange or accept orders.",
  },
  {
    id: "replay-lab",
    name: "Replay Lab",
    shortName: "Replay Lab",
    aliases: ["replay", "replay lab", "demo", "timeline"],
    category: "operations",
    summary: "Replays stored snapshots in timestamp order so the autonomous decision flow can be demonstrated repeatably.",
    implementation: [
      "Load a bounded historical snapshot sequence with original source timestamps.",
      "Advance the cursor at the selected playback speed and run the normal signal interpretation.",
      "Keep replay state visually distinct from the live stream and expose deterministic reset controls.",
    ],
    formulas: ["Replay progress = processed snapshots / total snapshots × 100."],
    evidence: "Original snapshot timestamp, replay cursor, total count, detected signals, and audit output.",
    limitation: "Replay time is controlled demo playback; it must not be presented as the current live clock.",
  },
  {
    id: "signal-archive",
    name: "Signal Archive & Historical Match",
    shortName: "Signal Archive",
    aliases: ["archive", "signal archive", "historical", "similar signals", "pattern match"],
    category: "trust",
    summary: "Keeps settled signal evidence beyond in-memory caps and retrieves comparable historical cases.",
    implementation: [
      "Insert settled signal receipts into the permanent Supabase signal archive.",
      "Filter and paginate records without rewriting prior evidence.",
      "Rank similar cases by closeness in movement, pressure, severity, and available context.",
    ],
    formulas: ["Historical accuracy = correct archived signals / settled archived signals × 100."],
    evidence: "Archived signal payload, result status, timestamps, match identifiers, final state, and evidence metadata.",
    limitation: "Similarity is nearest historical context, not a prediction; small or concentrated samples must be read cautiously.",
  },
  {
    id: "solana-verification",
    name: "Solana Verification & Audit Fingerprint",
    shortName: "Solana Verification",
    aliases: ["solana", "verification", "verify", "onchain", "on chain", "merkle"],
    category: "trust",
    summary: "Separates a real Solana mainnet Merkle proof check from GoalPulse's local SHA-256 audit fingerprint.",
    implementation: [
      "Select a signal whose TxLINE fixture and sequence are eligible for proof validation.",
      "Call the real Txoracle program through a Solana mainnet view simulation and validate the returned Merkle proof.",
      "Display the proven statistic and receipt; separately label local anchoring readiness without implying it is posted.",
    ],
    formulas: ["Verification depth reports confirmed proof layers / available proof layers; unavailable layers are never inferred."],
    evidence: "Fixture id, sequence, program response, proven stat key/value, validation state, and local audit hash boundary.",
    limitation: "Only eligible TxLINE statistics can be verified on-chain; the local fingerprint is not posted to Solana without configured anchoring.",
  },
  {
    id: "system-health",
    name: "System Health Cockpit",
    shortName: "System Health",
    aliases: ["system health", "health", "feed health", "uptime", "stream"],
    category: "operations",
    summary: "Shows whether collection, stream connectivity, fixture coverage, persistence, and agent cycles are operational.",
    implementation: [
      "Combine backend health, feed-health diagnostics, agent metrics, and stream state.",
      "Separate healthy, degraded, unavailable, and not-configured states instead of forcing every tile green.",
      "Expose timestamps and reasons so judges can distinguish stale data from a stopped system.",
    ],
    formulas: ["Fixture coverage = monitored eligible fixtures / eligible fixtures discovered × 100."],
    evidence: "Health endpoint, agent cycle timestamps, odds freshness, fixture coverage, persistence state, and SSE metrics.",
    limitation: "A healthy service does not guarantee that a meaningful market signal exists at that moment.",
  },
  {
    id: "discord-community",
    name: "Discord Alerts & Community",
    shortName: "Discord",
    aliases: ["discord", "community", "alerts", "webhook"],
    category: "operations",
    summary: "Routes high-severity intelligence alerts to Discord and gives dashboard users a direct community entry point.",
    implementation: [
      "Format qualifying HIGH-severity signals into a bounded webhook payload.",
      "Send only when the Discord webhook is configured and surface configuration health separately.",
      "Expose the Join community link in the dashboard header without coupling it to webhook delivery.",
    ],
    formulas: ["Discord alert eligibility = signal severity is HIGH and webhook configuration is available."],
    evidence: "Signal severity, webhook configuration state, delivery attempt result, and public community link.",
    limitation: "Joining the community does not prove alert delivery; the invite link and webhook are separate mechanisms.",
  },
];

function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function findGoalPulseFeature(query: string): GoalPulseFeature | null {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return null;

  const exactMatch = GOALPULSE_FEATURES.find((feature) =>
    [feature.id, feature.name, feature.shortName, ...feature.aliases]
      .map(normalize)
      .includes(normalizedQuery)
  );
  if (exactMatch) return exactMatch;

  return (
    GOALPULSE_FEATURES.find((feature) =>
      [feature.id, feature.name, feature.shortName, ...feature.aliases]
        .map(normalize)
        .some((candidate) => candidate.length >= 4 && normalizedQuery.includes(candidate))
    ) ?? null
  );
}

export function parseGoalPulseCommand(question: string): AnalystReply | null {
  const trimmed = question.trim();

  if (/^\/help\s*$/i.test(trimmed)) {
    return {
      kind: "help",
      content: "Use /features to explore the whole system, or /features <name> for one technical explanation. You can still ask ordinary live-data questions such as ‘latest signal’ or ‘current steam move’. GoalPulse is analytics only.",
    };
  }

  const match = trimmed.match(/^\/features?\s*(.*)$/i);
  if (!match) return null;

  const query = match[1].trim();
  if (!query) {
    return {
      kind: "feature-index",
      content: "Explore how GoalPulse works. Select a feature for its workflow, formulas, evidence, and limits.",
      featureIds: GOALPULSE_FEATURES.map((feature) => feature.id),
    };
  }

  const feature = findGoalPulseFeature(query);
  if (feature) {
    return {
      kind: "feature-detail",
      content: feature.summary,
      featureId: feature.id,
    };
  }

  return {
    kind: "text",
    content: `I couldn't find “${query}” in the implemented feature catalog. Type /features to see every available feature.`,
  };
}
