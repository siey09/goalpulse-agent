import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { SignalIntelligencePanel } from "./components/SignalIntelligencePanel";
import { MarketMakerPanel } from "./components/MarketMakerPanel";
import { SteamMoveDetectionPanel } from "./components/SteamMoveDetectionPanel";
import { ArenaPanel } from "./components/ArenaPanel";
import { ResultsSettlementPanel } from "./components/ResultsSettlementPanel";
import { VerifiedCaseStudiesPanel } from "./components/VerifiedCaseStudiesPanel";
import { WhatChangedPanel } from "./components/WhatChangedPanel";
import { SignalArchivePanel } from "./components/SignalArchivePanel";
import { SignalPerformancePanel } from "./components/SignalPerformancePanel";
import { ConfidenceCalibrationPanel } from "./components/ConfidenceCalibrationPanel";
import { SignalCorrelationPanel } from "./components/SignalCorrelationPanel";
import { AnalystChatWidget } from "./components/AnalystChatWidget";
import { useScrollSpy } from "./hooks/useScrollSpy";
import { AppShell } from "./app/AppShell";
import { DEFAULT_DESTINATION, type DestinationId } from "./app/navigation";
import { GUIDE_STEPS } from "./app/guideSteps";
import {
  clearGuideSpotlight as clearPreviewGuideSpotlight,
  applyGuideSpotlight as applyPreviewGuideSpotlight,
  getGuideStepElement,
} from "./app/guideSpotlight";
// Lazy-loaded: only one destination is ever visible at a time in the
// Command Center preview, so there's no reason to bundle all 9 pages'
// code into the initial chunk a default-page (non-preview) visitor
// never needs. Named-export modules, so each resolves .default via
// .then() rather than requiring the page files themselves to change.
const CommandCenterPage = lazy(() =>
  import("./features/overview/CommandCenterPage").then((m) => ({ default: m.CommandCenterPage }))
);
const SignalsPage = lazy(() =>
  import("./features/signals/SignalsPage").then((m) => ({ default: m.SignalsPage }))
);
const AgentArenaPage = lazy(() =>
  import("./features/arena/AgentArenaPage").then((m) => ({ default: m.AgentArenaPage }))
);
const MarketMakerPage = lazy(() =>
  import("./features/market-maker/MarketMakerPage").then((m) => ({ default: m.MarketMakerPage }))
);
const ArchivePage = lazy(() =>
  import("./features/archive/ArchivePage").then((m) => ({ default: m.ArchivePage }))
);
const LiveMarketsPage = lazy(() =>
  import("./features/markets/LiveMarketsPage").then((m) => ({ default: m.LiveMarketsPage }))
);
const ReplayLabPage = lazy(() =>
  import("./features/replay/ReplayLabPage").then((m) => ({ default: m.ReplayLabPage }))
);
const VerificationPage = lazy(() =>
  import("./features/verification/VerificationPage").then((m) => ({ default: m.VerificationPage }))
);
const SystemHealthPage = lazy(() =>
  import("./features/health/SystemHealthPage").then((m) => ({ default: m.SystemHealthPage }))
);
import { VerificationReceipt } from "./components/VerificationReceipt";
import { SignalAuditDrawer } from "./components/signals/SignalAuditDrawer";
import type {
  Odds,
  Match,
  AgentSignal,
  OnChainVerifyData,
  ReplayBacktest,
  Health,
  SimilarSignalsResult,
} from "./types";
import {
  formatNumber,
  formatPercent,
  formatOdds,
  formatTime,
  severityMarkerStyle,
  getOdds,
  severityStyle,
  preciseStatusLabel,
  matchClockLabel,
  dataFreshnessLabel,
  matchStatusTone,
  signalTypeLabel,
  marketTypeLabel,
  discordAlertBadge,
  getSignalType,
  getSignalTarget,
  formatOddsChange,
  getThresholdLabel,
  getSignalOutcome,
} from "./lib/formatters";
import { getOnchainVerifyTarget } from "./lib/verification";
import {
  Activity,
  BarChart3,
  Bot,
  ChevronDown,
  Gauge,
  History,
  LayoutDashboard,
  Radio,
  RefreshCw,
  Search,
  Server,
  ShieldCheck,
  Swords,
  Target,
  TrendingDown,
  TrendingUp,
  Wifi,
  X,
  Zap,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceDot, ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type AgentRun = {
  id?: string;
  startedAt?: string;
  finishedAt?: string;
  message?: string;
};

type AgentStats = {
  txlineUpdates?: number;
  signalsGenerated?: number;
  highSeverity?: number;
  pendingSignals?: number;
  correctSignals?: number;
  incorrectSignals?: number;
  closedSignals?: number;
  strategyAccuracy?: number;
};

type OddsSnapshot = {
  id?: string;
  matchId?: string;
  timestamp?: string;
  createdAt?: string;
  homeOdds?: number;
  drawOdds?: number;
  awayOdds?: number;
  market?: Odds;
};

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "https://goalpulse-agent-api.onrender.com";

async function request<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`);

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${API_BASE_URL}${path}`);
  }

  return response.json();
}

function asArray<T>(payload: unknown, keys: string[] = []): T[] {
  if (Array.isArray(payload)) return payload as T[];

  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;

    for (const key of keys) {
      if (Array.isArray(record[key])) {
        return record[key] as T[];
      }
    }
  }

  return [];
}

function findNearestSnapshot(
  history: OddsSnapshot[],
  targetTimestamp?: string
): OddsSnapshot | undefined {
  if (!targetTimestamp || history.length === 0) return undefined;

  const targetMs = new Date(targetTimestamp).getTime();
  if (Number.isNaN(targetMs)) return undefined;

  let closest: OddsSnapshot | undefined;
  let closestDelta = Infinity;

  for (const snapshot of history) {
    const snapshotMs = new Date(snapshot.timestamp ?? "").getTime();
    if (Number.isNaN(snapshotMs)) continue;

    const delta = Math.abs(snapshotMs - targetMs);
    if (delta < closestDelta) {
      closestDelta = delta;
      closest = snapshot;
    }
  }

  return closest;
}

function PipelineStageLabel({
  index,
  title,
  description,
}: {
  index: number;
  title: string;
  description: string;
}) {
  return (
    <div className="mb-1 flex items-baseline gap-3 border-b border-border pb-2">
      <span className="font-mono text-xs text-accent-soft">0{index}</span>
      <h2 className="font-display text-lg font-semibold uppercase tracking-[0.08em] text-white">{title}</h2>
      <span className="ml-auto hidden text-xs text-stone-500 sm:block">{description}</span>
    </div>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl bg-black/25 p-3">
      <p className="text-[11px] text-stone-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-stone-100">{value}</p>
    </div>
  );
}

/**
 * Mirrors the agent's real automated pipeline as already narrated in the
 * Agent Timeline card ("Feed ingested -> Snapshots created -> Signal
 * engine ran -> Outcomes evaluated"), extended one stage further to
 * cover the permanent audit trail. Not an arbitrary numbered list - this
 * is the literal sequence GoalPulse runs on every match.
 */
const PIPELINE_STAGES = [
  { id: "markets", label: "Ingest", icon: Wifi },
  { id: "pipeline-detect", label: "Detect", icon: Activity },
  { id: "pipeline-decide", label: "Decide", icon: Swords },
  { id: "pipeline-verify", label: "Verify", icon: Target },
  { id: "pipeline-audit", label: "Audit", icon: History },
] as const;

const PIPELINE_STAGE_IDS = PIPELINE_STAGES.map((stage) => stage.id);

function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [signals, setSignals] = useState<AgentSignal[]>([]);
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [stats, setStats] = useState<AgentStats | null>(null);
  const [pnl, setPnl] = useState<{
    unitStake: number;
    settledBets: number;
    totalStaked: number;
    netUnits: number;
    roiPercent: number;
    openPositions: number;
    openExposure: number;
    bySeverity: Array<{ severity: string; bets: number; netUnits: number; roiPercent: number }>;
    note: string;
  } | null>(null);
  const [oddsHistory, setOddsHistory] = useState<OddsSnapshot[]>([]);
  const [isOddsStreamLive, setIsOddsStreamLive] = useState(false);
  const [oddsStreamLastUpdate, setOddsStreamLastUpdate] = useState("");
  const [isReplayStreamMode, setIsReplayStreamMode] = useState(false);
  const [replayStreamProgress, setReplayStreamProgress] = useState("");
  const [streamProgressPercent, setStreamProgressPercent] = useState(0);
  const [selectedMatchId, setSelectedMatchId] = useState("");
  const [selectedSignal, setSelectedSignal] = useState<AgentSignal | null>(null);
  const [similarSignals, setSimilarSignals] = useState<SimilarSignalsResult | null>(null);
  const [isSimilarSignalsLoading, setIsSimilarSignalsLoading] = useState(false);
  const [activeSection, setActiveSection] = useState("overview");
  const activePipelineStage = useScrollSpy(PIPELINE_STAGE_IDS);
  const [previewDestination, setPreviewDestination] = useState<DestinationId>(DEFAULT_DESTINATION);
  const [isPreviewGuideMode, setIsPreviewGuideMode] = useState(false);
  const [previewGuideStep, setPreviewGuideStep] = useState(0);
  const [previewGuidePanelPosition, setPreviewGuidePanelPosition] = useState({ top: 16, left: 16 });
  const [searchTerm, setSearchTerm] = useState("");
  const [matchStatusFilter, setMatchStatusFilter] = useState<"all" | Match["status"]>("all");
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [replayStep, setReplayStep] = useState(-1);
  const [isAnalystChatOpen, setIsAnalystChatOpen] = useState(false);
  const [isAnalystReplying, setIsAnalystReplying] = useState(false);
  const [analystQuestion, setAnalystQuestion] = useState("");
  const [analystMessages, setAnalystMessages] = useState<
    { role: "user" | "assistant"; content: string }[]
  >([
    {
      role: "assistant",
      content:
        "Ask me about the latest signal, failed continuation patterns, reversal radar, score reality checks, or the outcome audit.",
    },
  ]);
  const [isJudgeMode, setIsJudgeMode] = useState(false);
  const [judgeStep, setJudgeStep] = useState(0);
  const [guidePanelPosition, setGuidePanelPosition] = useState({ top: 16, left: 16 });
  const [lastRefresh, setLastRefresh] = useState("");
  const [isConnecting, setIsConnecting] = useState(true);
  const [error, setError] = useState("");
  const [replayBacktest, setReplayBacktest] = useState<ReplayBacktest | null>(null);
  const [isReplayRunning, setIsReplayRunning] = useState(false);
  const [onchainVerify, setOnchainVerify] = useState<
    Record<string, { loading: boolean; data: OnChainVerifyData | null }>
  >({});
  const hasLoadedOnceRef = useRef(false);

  const judgeDemoSteps = [
    {
      title: "1. Autonomous intelligence overview",
      detail: "GoalPulse ingests TxLINE data, normalizes match markets, monitors odds movement, and explains signals without manual analyst work.",
    },
    {
      title: "2. Odds movement timeline",
      detail: "The chart shows how market prices move over time. Signal markers appear only when movement crosses deterministic compression thresholds.",
    },
    {
      title: "3. TxLINE market board",
      detail: "The market board shows normalized home, draw, and away prices plus precise TXODDS status and clock labels.",
    },
    {
      title: "4. Scores intelligence signals",
      detail: "Signals combine odds movement with TXODDS Scores context: goals, shots, VAR, penalties, cards, danger possession, and reliability warnings.",
    },
    {
      title: "5. Final score audit",
      detail: "Signals are checked after final score settlement so judges can see whether each movement was confirmed or rejected.",
    },
    {
      title: "6. Field pressure context",
      detail: "GoalPulse separates field-backed moves from market-only moves using Field Pressure Index and TXODDS play-by-play events.",
    },
    {
      title: "7. In-Play Market Maker",
      detail: "The Market Maker quotes a live bid/ask spread around TxLINE's de-margined fair odds, widening under field pressure or unreliable data and narrowing when conditions are calm.",
    },
    {
      title: "8. Steam move detection",
      detail: "Steam Move Detection scans every match every 5 seconds for sustained same-direction odds movement, flagging genuine momentum building before it becomes an obvious signal.",
    },
    {
      title: "9. Agent vs Agent Arena",
      detail: "Three strategies compete on the same live signal feed: Momentum Follower trusts the signal, Contrarian fades signals without real field support, and Kelly Criterion sizes its stake by confidence — settlement is on-chain-verified.",
    },
    {
      title: "10. Meta-agent & Skeptic Check",
      detail: "The Arena doesn't just race three strategies — it audits its own leaderboard. A Meta-agent recommendation ranks strategies fairly by ROI, not raw units, and only names a leader once there's enough settled data. A Skeptic Check then questions that lead directly: if it's concentrated in one real match, it says so plainly instead of implying more confidence than the data supports.",
    },
    {
      title: "11. Autonomous agent timeline",
      detail: "The timeline explains the agent loop: ingest feed, capture snapshots, compare odds, attach scores context, score reliability, and store evidence.",
    },
    {
      title: "12. Real TxLINE replay",
      detail: "Replay mode runs stored TxLINE snapshots through the same engine, making the demo repeatable even when live matches are quiet.",
    },
    {
      title: "13. Evidence chain",
      detail: "The evidence chain links odds endpoints, scores endpoints, message IDs, bookmakers, scoreline context, and proof labels for judge-verifiable review.",
    },
    {
      title: "14. Signal review council",
      detail: "Multiple agent checks review movement strength, field context, reliability, reversion risk, and evidence quality before surfacing a signal.",
    },
    {
      title: "15. Proof hash",
      detail: "The replay generates a SHA-256 proof hash so the audit trail can become tamper-evident and independently reviewable.",
    },
    {
      title: "16. Signal detail: precedent & verification",
      detail: "Click \"View details\" on any signal card to open its full evidence trail yourself. Scroll down and you'll find two more things: \"Similar past signals\" searches the permanent archive for precedent of the same signal type and shows honestly how those resolved, and a Verification Depth badge shows whether that specific signal's underlying data has actually been checked on Solana mainnet — never a percentage, always a plain, honest status.",
    },
    {
      title: "17. Transparent thresholds",
      detail: "The engine uses explainable thresholds: watch, momentum shift, and sharp move. No black-box betting recommendation is required.",
    },
    {
      title: "18. Full tournament archive",
      detail: "The archive permanently records every settled signal — status, severity, and market — independent of the dashboard's in-memory caps, giving judges the complete, unfiltered track record.",
    },
    {
      title: "19. Signal performance",
      detail: "Signal Performance breaks accuracy down by signal type — sharp move, momentum shift, watch — showing correct-versus-settled counts so judges can see where the model's calls actually hold up.",
    },
    {
      title: "20. Confidence calibration",
      detail: "Confidence Calibration checks whether the model's own confidence score is honest: higher-confidence signals should settle correct more often, and this panel proves whether that pattern actually holds.",
    },
    {
      title: "21. Signal correlation",
      detail: "Signal Correlation finds clusters of the same pattern firing across multiple real matches — side, severity, and market aligned — evidence the model is detecting a real phenomenon, not noise.",
    },
    {
      title: "22. Compliance boundary",
      detail: "GoalPulse is analytics-only: it explains sports market movement and evidence context. It does not place wagers, custody funds, or facilitate betting execution.",
    },
  ];
  const outcomeVerificationItems = useMemo(() => {
    const replayItems =
      replayBacktest?.signals?.map((signal) => ({
        signal,
        source: "TxLINE replay audit",
        proofHash: replayBacktest.proof?.hash,
      })) ?? [];

    const liveItems = signals.slice(0, 4).map((signal) => ({
      signal,
      source: "Live monitor",
      proofHash: undefined,
    }));

    return [...replayItems, ...liveItems].slice(0, 5);
  }, [signals, replayBacktest]);
  type ArenaScoreboardReply = {
    agentId: string;
    label: string;
    netUnits: number;
    roiPercent: number;
    correctCount: number;
    settledCount: number;
  };

  type ArenaReplyResponse = {
    momentumFollower: ArenaScoreboardReply;
    contrarian: ArenaScoreboardReply;
    kellyCriterion: ArenaScoreboardReply;
  };

  type MarketMakerReplyQuote = {
    matchId: string;
    match: string;
    fairOdds: { home: number; away: number; draw: number };
    bidOdds: { home: number; away: number; draw: number };
    askOdds: { home: number; away: number; draw: number };
    spreadPct: number;
    spreadWidth: "NARROW" | "MODERATE" | "WIDE";
    reason: string;
  };

  type SignalTypePerformanceReply = {
    signalType: string;
    settledCount: number;
    correctCount: number;
    accuracyPct: number;
  };

  type ConfidenceBucketReply = {
    bucket: string;
    settledCount: number;
    correctCount: number;
    accuracyPct: number;
  };

  type SteamMoveReply = {
    match: string;
    side: "home" | "away" | "draw";
    tickCount: number;
    totalMovePct: number;
    firstOdds: number;
    lastOdds: number;
  };

  type PatternClusterReply = {
    side: string;
    severity: string;
    market: string;
    matchIds: string[];
    matchCount: number;
    signalCount: number;
  };

  async function generateAnalystReply(question: string): Promise<string> {
    const normalizedQuestion = question.toLowerCase();

    try {
      const replaySignals = replayBacktest?.signals ?? [];
      const trapSignals = replaySignals
        .filter(
          (signal) =>
            signal.trapStatus === "OUTCOME_REJECTED_MOVE" ||
            signal.trapStatus === "POSSIBLE_TRAP"
        )
        .sort((a, b) => (b.trapScore ?? 0) - (a.trapScore ?? 0));
      const topTrap = trapSignals[0];
      const latestSignal = signals[0];
      const summary = replayBacktest?.summary;

      if (normalizedQuestion.includes("trap") || normalizedQuestion.includes("suspicious")) {
        if (!topTrap) {
          return "I do not see an outcome-rejected move pattern yet. Run the Outcome Audit first so I can inspect rejected market moves.";
        }

        return `Top suspicious move: ${topTrap.match ?? topTrap.matchId ?? "Unknown match"} · ${getSignalTarget(topTrap)}. Reversal score ${topTrap.trapScore ?? 0}. ${topTrap.trapReason ?? "The odds movement was rejected by the final result."}`;
      }

      if (normalizedQuestion.includes("reversal")) {
        if (!topTrap) {
          return "No reversal pattern is available yet. Run the Outcome Audit first.";
        }

        return `Market Reversal Radar shows ${(topTrap.reversalRisk ?? "REVERSAL_SCAN").replaceAll("_", " ")} for ${getSignalTarget(topTrap)}. ${topTrap.reversalReason ?? "The move may have become overextended or failed score confirmation."}`;
      }

      if (
        (normalizedQuestion.includes("score") && !normalizedQuestion.includes("confidence")) ||
        normalizedQuestion.includes("final")
      ) {
        if (!topTrap) {
          return "Score Reality Check needs a finished match. Run the Outcome Audit to compare odds moves against final scores.";
        }

        return `Score Reality Check: ${(topTrap.scoreRealityStatus ?? "WAITING_FOR_FINAL_SCORE").replaceAll("_", " ")}. Final score: ${topTrap.finalScore ?? "pending"}. ${topTrap.scoreRealityReason ?? "GoalPulse compares the odds move against the final result."}`;
      }

      if (normalizedQuestion.includes("audit") || normalizedQuestion.includes("outcome")) {
        if (!summary) {
          return "The Outcome Audit has not been run yet. Click Run audit to replay stored TxLINE odds snapshots and verify what happened.";
        }

        return `Outcome Audit processed ${summary.signalsDetected ?? 0} signal(s), found ${summary.smartMoneyTraps ?? 0} failed continuation pattern(s), with ${summary.confirmedTraps ?? 0} rejected and ${summary.possibleTraps ?? 0} possible.`;
      }

      if (
        normalizedQuestion.includes("arena") ||
        normalizedQuestion.includes("kelly") ||
        normalizedQuestion.includes("contrarian") ||
        normalizedQuestion.includes("momentum follower") ||
        normalizedQuestion.includes("which agent") ||
        normalizedQuestion.includes("best strategy") ||
        normalizedQuestion.includes("best agent")
      ) {
        const payload = await request<{ data?: ArenaReplyResponse }>("/api/arena");
        const data = payload.data;

        if (!data) {
          return "Arena data isn't available right now — try again in a moment.";
        }

        const boards = [data.momentumFollower, data.contrarian, data.kellyCriterion];
        const leader = boards.reduce((best, board) =>
          board.netUnits > best.netUnits ? board : best
        );
        const boardSummary = boards
          .map(
            (board) =>
              `${board.label}: ${board.netUnits.toFixed(2)}u (${board.roiPercent.toFixed(1)}% ROI, ${board.correctCount}/${board.settledCount} correct)`
          )
          .join(". ");

        return `Agent vs Agent Arena — three strategies on the same live signal feed. ${boardSummary}. ${leader.label} currently leads by net units. Settlement is on-chain-verified; no funds move.`;
      }

      if (
        normalizedQuestion.includes("market maker") ||
        normalizedQuestion.includes("bid") ||
        normalizedQuestion.includes("spread") ||
        normalizedQuestion.includes("fair odds")
      ) {
        const payload = await request<unknown>("/api/market-maker");
        const quotes = asArray<MarketMakerReplyQuote>(payload, ["data"]);
        const quote =
          quotes.find((item) => item.matchId === selectedMatchId) ?? quotes[0];

        if (!quote) {
          return "No Market Maker quote is available yet — quotes need at least one prior odds snapshot for a match.";
        }

        return `Market Maker for ${quote.match}: home bid ${formatOdds(quote.bidOdds.home)}/fair ${formatOdds(quote.fairOdds.home)}/ask ${formatOdds(quote.askOdds.home)}. Spread is ${quote.spreadWidth.toLowerCase()} (${quote.spreadPct.toFixed(1)}%) — ${quote.reason}`;
      }

      if (
        normalizedQuestion.includes("archive") ||
        normalizedQuestion.includes("permanent record")
      ) {
        const payload = await request<{ pagination?: { totalCount?: number } }>(
          "/api/archive?page=1&pageSize=1"
        );
        const totalCount = payload.pagination?.totalCount ?? 0;

        return `The Signal Archive permanently records every settled signal — ${totalCount} archived so far, independent of the dashboard's in-memory caps. There's also a separate match_archive table recording every match's final state, write-only with no dashboard panel yet.`;
      }

      if (
        normalizedQuestion.includes("signal performance") ||
        normalizedQuestion.includes("track record") ||
        normalizedQuestion.includes("win rate") ||
        (normalizedQuestion.includes("accuracy") && !normalizedQuestion.includes("confidence"))
      ) {
        const payload = await request<unknown>("/api/signal-performance");
        const rows = asArray<SignalTypePerformanceReply>(payload, ["data"]);

        if (rows.length === 0) {
          return "No signal performance data is settled yet.";
        }

        const rowSummary = rows
          .map(
            (row) =>
              `${row.signalType}: ${formatPercent(row.accuracyPct)} (${row.correctCount}/${row.settledCount})`
          )
          .join(". ");

        return `Signal Performance by type — ${rowSummary}.`;
      }

      if (
        normalizedQuestion.includes("confidence calibration") ||
        normalizedQuestion.includes("confidence score") ||
        normalizedQuestion.includes("calibrated") ||
        normalizedQuestion.includes("calibration")
      ) {
        const payload = await request<unknown>("/api/signal-performance/by-confidence");
        const rows = asArray<ConfidenceBucketReply>(payload, ["data"]);

        if (rows.length === 0) {
          return "No confidence-bucketed signals are settled yet.";
        }

        const rowSummary = rows
          .map(
            (row) =>
              `${row.bucket}: ${formatPercent(row.accuracyPct)} (${row.correctCount}/${row.settledCount})`
          )
          .join(". ");

        return `Confidence Calibration checks whether higher-confidence signals settle correct more often. Current buckets — ${rowSummary}. Small sample sizes so far, not yet a statistically confirmed pattern.`;
      }

      if (
        normalizedQuestion.includes("steam move") ||
        normalizedQuestion.includes("sustained movement") ||
        normalizedQuestion.includes("scanning")
      ) {
        const payload = await request<{
          data?: SteamMoveReply[];
          summary?: { matchesScanned?: number };
        }>("/api/steam-moves");
        const moves = payload.data ?? [];
        const matchesScanned = payload.summary?.matchesScanned ?? 0;

        if (moves.length === 0) {
          return `Steam Move Detection scans every match every 5 seconds for sustained same-direction odds movement. Scanning ${matchesScanned} match(es) — no steam move right now.`;
        }

        const top = moves[0];

        return `Steam move detected: ${top.match}, ${top.side} side, ${formatOdds(top.firstOdds)} → ${formatOdds(top.lastOdds)} over ${top.tickCount} ticks (${top.totalMovePct.toFixed(1)}% move).`;
      }

      if (
        normalizedQuestion.includes("correlation") ||
        normalizedQuestion.includes("cluster") ||
        normalizedQuestion.includes("cross-match")
      ) {
        const payload = await request<unknown>("/api/signal-correlation/patterns");
        const clusters = asArray<PatternClusterReply>(payload, ["data"]);

        if (clusters.length === 0) {
          return "No genuine cross-match signal correlation clusters right now — Signal Correlation looks for the same pattern (side/severity/market) firing across 2+ distinct real matches.";
        }

        const top = clusters[0];

        return `Signal Correlation found ${clusters.length} genuine cluster(s) across multiple real matches. Top: ${top.side}/${top.severity}/${top.market}, ${top.signalCount} signals across ${top.matchCount} real matches.`;
      }

      if (
        normalizedQuestion.includes("on-chain") ||
        normalizedQuestion.includes("onchain") ||
        normalizedQuestion.includes("blockchain") ||
        normalizedQuestion.includes("solana") ||
        normalizedQuestion.includes("verify")
      ) {
        const chatVerifyTarget = getOnchainVerifyTarget(selectedSignal);
        const chatVerifyKey = chatVerifyTarget
          ? `${chatVerifyTarget.fixtureId}-${chatVerifyTarget.sequence}`
          : null;
        const chatVerifyData = chatVerifyKey ? onchainVerify[chatVerifyKey]?.data : undefined;

        if (chatVerifyData?.available) {
          const statDetail = chatVerifyData.provenStat
            ? ` — proven stat key ${chatVerifyData.provenStat.key}, value ${chatVerifyData.provenStat.value}`
            : "";

          return `On-chain verification: ${chatVerifyData.isValid ? "PROOF VALID" : "PROOF FAILED"}${statDetail}, via a real Solana mainnet Merkle proof check. Separately, GoalPulse's local SHA-256 audit fingerprint has its own Solana devnet anchoring readiness flag, pending wallet configuration — not yet live.`;
        }

        return `Run "Verify on Solana" from the Outcome Audit section for a real, independently-verifiable Solana mainnet Merkle proof check on a specific signal. Separately, GoalPulse's local SHA-256 audit fingerprint has its own Solana devnet anchoring readiness flag, pending wallet configuration — not yet live.`;
      }

      if (
        normalizedQuestion.includes("tech stack") ||
        normalizedQuestion.includes("architecture") ||
        normalizedQuestion.includes("how is this built") ||
        normalizedQuestion.includes("what technology") ||
        normalizedQuestion.includes("built with")
      ) {
        return "GoalPulse is built on: live TxLINE market data (real-time odds + TXODDS Scores field context), a Node/Express + TypeScript backend running a 5-second autonomous agent cycle, a React + TypeScript frontend, and Solana mainnet for real on-chain Merkle proof verification (separate from the local SHA-256 audit fingerprint). Backend runs on Render, frontend on Vercel.";
      }

      if (normalizedQuestion.includes("latest")) {
        if (!latestSignal) {
          return "There is no latest live signal yet. The agent is waiting for a meaningful odds movement threshold.";
        }

        return `Latest live signal: ${latestSignal.match ?? latestSignal.matchId ?? "Unknown match"} · ${getSignalTarget(latestSignal)}. Odds moved from ${formatOdds(latestSignal.oddsBefore)} to ${formatOdds(latestSignal.oddsAfter)}, a ${formatOddsChange(latestSignal.oddsChangePct)} move.`;
      }

      if (normalizedQuestion.includes("advice") || normalizedQuestion.includes("bet")) {
        return "GoalPulse is analytics only. It explains odds movement, trap risk, reversal risk, and score reality checks. It does not recommend bets.";
      }

      return "I can help with: latest signal, failed continuation patterns, market reversal radar, score reality checks, the Outcome Audit, Agent Arena (Momentum Follower/Contrarian/Kelly Criterion), Market Maker spreads, the Signal Archive, Signal Performance, Confidence Calibration, Steam Move Detection, Signal Correlation, on-chain verification, or the tech stack. Ask me about any of these.";
    } catch (error) {
      console.error("Analyst chat reply failed", error);
      return "I couldn't reach that data right now — try again in a moment.";
    }
  }

  async function sendAnalystMessage() {
    const trimmedQuestion = analystQuestion.trim();

    if (!trimmedQuestion || isAnalystReplying) return;

    setAnalystMessages((currentMessages) => [
      ...currentMessages,
      { role: "user", content: trimmedQuestion },
    ]);
    setAnalystQuestion("");
    setIsAnalystReplying(true);

    try {
      const reply = await generateAnalystReply(trimmedQuestion);

      setAnalystMessages((currentMessages) => [
        ...currentMessages,
        { role: "assistant", content: reply },
      ]);
    } finally {
      setIsAnalystReplying(false);
    }
  }
  async function runReplayBacktest() {
    try {
      setIsReplayRunning(true);

      const payload = await request<unknown>("/api/replay/backtest");
      const replay =
        payload && typeof payload === "object" && "data" in payload
          ? (payload as { data: ReplayBacktest }).data
          : (payload as ReplayBacktest);

      setReplayBacktest(replay);
    } catch (currentError) {
      setError(
        currentError instanceof Error
          ? currentError.message
          : "Unable to run replay backtest."
      );
    } finally {
      setIsReplayRunning(false);
    }
  }

  async function runOnchainVerify(signal: AgentSignal | null) {
    const target = getOnchainVerifyTarget(signal);

    if (!target) return;

    const key = `${target.fixtureId}-${target.sequence}`;

    try {
      setOnchainVerify((current) => ({ ...current, [key]: { loading: true, data: null } }));

      const payload = await request<{ data: OnChainVerifyData }>(
        `/api/onchain/validate-stat?fixtureId=${encodeURIComponent(
          target.fixtureId
        )}&seq=${target.sequence}&statKey=1002`
      );

      setOnchainVerify((current) => ({
        ...current,
        [key]: { loading: false, data: payload.data },
      }));
    } catch (currentError) {
      setOnchainVerify((current) => ({
        ...current,
        [key]: {
          loading: false,
          data: {
            available: false,
            reason:
              currentError instanceof Error
                ? currentError.message
                : "Unable to reach the on-chain validation endpoint.",
          },
        },
      }));
    }
  }
  const guideTargets = [
    { id: "overview", text: "GoalPulse Agent" },
    { text: "Selected market" },
    { text: "Market board" },
    { id: "agent", text: "Latest signals" },
    { text: "Outcome verification" },
    { text: "Selected match" },
    { text: "Live bid/ask quotes" },
    { text: "Steam move detection" },
    { text: "Momentum Follower vs Contrarian vs Kelly Criterion" },
    { id: "guide-meta-skeptic", text: "Meta-agent recommendation" },
    { text: "Agent timeline" },
    { id: "guide-backtest-card", text: "Outcome audit" },
    { id: "guide-event-correlation", text: "Evidence chain" },
    { id: "guide-oracle-council", text: "Signal review" },
    { id: "guide-proof-readiness", text: "Proof network" },
    { id: "agent", text: "Latest signals" },
    { text: "Signal thresholds" },
    { text: "Full tournament archive" },
    { text: "Signal performance" },
    { text: "Confidence calibration" },
    { text: "Signal correlation" },
    { id: "compliance", text: "Analytics only" },
  ];

  const guideSpotlightClasses = [
    "relative",
    "z-[60]",
    "scale-[1.01]",
    "ring-2",
    "ring-accent/70",
    "shadow-2xl",
    "shadow-accent/20",
  ];
  function clearGuideSpotlight() {
    document.querySelectorAll("[data-guide-active='true']").forEach((element) => {
      element.classList.remove(...guideSpotlightClasses);
      element.removeAttribute("data-guide-active");
    });
  }

  function findCardByText(text: string) {
    const candidates = Array.from(
      document.querySelectorAll("section, aside, div")
    ) as HTMLElement[];

    const matches = candidates.filter((element) => {
      const className = `${element.className}`;
      const isGuidePanel = Boolean(element.closest("[data-guide-panel='true']"));
      const isCardLike =
        className.includes("rounded-2xl") ||
        className.includes("rounded-2xl") ||
        className.includes("rounded-xl") ||
        element.tagName.toLowerCase() === "section" ||
        element.tagName.toLowerCase() === "aside";

      return (
        !isGuidePanel &&
        isCardLike &&
        element.offsetParent !== null &&
        Boolean(element.textContent?.includes(text))
      );
    });

    return (
      matches.sort(
        (first, second) =>
          first.getBoundingClientRect().height - second.getBoundingClientRect().height
      )[0] ?? null
    );
  }

  function getGuideTargetElement(step: number) {
    const target = guideTargets[step];

    if (!target) return document.getElementById("overview");

    if (target.id) {
      const byId = document.getElementById(target.id);
      if (byId) return byId;
    }

    if (target.text) {
      return findCardByText(target.text);
    }

    return document.getElementById("overview");
  }

  function applyGuideSpotlight(target: HTMLElement | null) {
    clearGuideSpotlight();

    if (!target) return;

    target.setAttribute("data-guide-active", "true");
    target.classList.add(...guideSpotlightClasses);
  }

  function updateGuidePanelPosition(step: number) {
    window.setTimeout(() => {
      const target = getGuideTargetElement(step);
      const panelWidth = 340;
      const panelHeight = 260;
      const margin = 18;

      if (!target) {
        setGuidePanelPosition({
          top: margin,
          left: Math.max(margin, window.innerWidth - panelWidth - margin),
        });
        return;
      }

      const rect = target.getBoundingClientRect();
      const canPlaceRight = rect.right + margin + panelWidth <= window.innerWidth;
      const canPlaceLeft = rect.left - margin - panelWidth >= margin;

      const left = canPlaceRight
        ? rect.right + margin
        : canPlaceLeft
          ? rect.left - panelWidth - margin
          : Math.max(margin, window.innerWidth - panelWidth - margin);

      const centeredTop = rect.top + rect.height / 2 - panelHeight / 2;
      const top = Math.min(
        Math.max(margin, centeredTop),
        Math.max(margin, window.innerHeight - panelHeight - margin)
      );

      setGuidePanelPosition({ top, left });
    }, 260);
  }

  function focusGuideTarget(step: number) {
    window.setTimeout(() => {
      const target = getGuideTargetElement(step);

      target?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });

      applyGuideSpotlight(target);
      updateGuidePanelPosition(step);
    }, 120);
  }

  function startGuideTour() {
    setIsJudgeMode(true);
    setJudgeStep(0);
    focusGuideTarget(0);
  }

  function nextGuideStep() {
    const nextStep = judgeStep + 1;

    if (nextStep >= judgeDemoSteps.length) {
      clearGuideSpotlight();
      setIsJudgeMode(false);
      return;
    }

    setJudgeStep(nextStep);
    focusGuideTarget(nextStep);

    if (nextStep === 6) {
      startAgentReplay();
      window.setTimeout(() => focusGuideTarget(nextStep), 500);
    }

    if (nextStep === 7) {
      void runReplayBacktest();
      window.setTimeout(() => focusGuideTarget(nextStep), 700);
    }

    if (nextStep >= 8 && nextStep <= 11 && !replayBacktest) {
      void runReplayBacktest();
      window.setTimeout(() => focusGuideTarget(nextStep), 700);
    }

    window.setTimeout(() => focusGuideTarget(nextStep), 350);
  }

  function skipGuideTour() {
    clearGuideSpotlight();
    setIsJudgeMode(false);
    setJudgeStep(0);
  }

  function updatePreviewGuidePanelPosition(target: HTMLElement | null) {
    const panelWidth = 340;
    const panelHeight = 260;
    const margin = 18;

    if (!target) {
      setPreviewGuidePanelPosition({
        top: margin,
        left: Math.max(margin, window.innerWidth - panelWidth - margin),
      });
      return;
    }

    const rect = target.getBoundingClientRect();
    const canPlaceRight = rect.right + margin + panelWidth <= window.innerWidth;
    const canPlaceLeft = rect.left - margin - panelWidth >= margin;

    const left = canPlaceRight
      ? rect.right + margin
      : canPlaceLeft
        ? rect.left - panelWidth - margin
        : Math.max(margin, window.innerWidth - panelWidth - margin);

    const centeredTop = rect.top + rect.height / 2 - panelHeight / 2;
    const top = Math.min(
      Math.max(margin, centeredTop),
      Math.max(margin, window.innerHeight - panelHeight - margin)
    );

    setPreviewGuidePanelPosition({ top, left });
  }

  // Single controller for the Command Center preview tour: switches
  // previewDestination when a step targets a different page, then lets
  // this effect (which reruns after the new page commits) do the actual
  // scroll/spotlight/panel-position work - one imperative mechanism per
  // step, no scattered per-component judgeStep===N conditionals.
  useEffect(() => {
    if (!isPreviewGuideMode) return;

    const step = GUIDE_STEPS[previewGuideStep];
    if (!step) return;

    if (step.requiresReplayBacktest && !replayBacktest && !isReplayRunning) {
      void runReplayBacktest();
    }

    const timeout = window.setTimeout(() => {
      const target = getGuideStepElement(step);
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
      applyPreviewGuideSpotlight(target);
      updatePreviewGuidePanelPosition(target);
    }, 220);

    return () => window.clearTimeout(timeout);
  }, [isPreviewGuideMode, previewGuideStep, previewDestination, replayBacktest, isReplayRunning]);

  function startPreviewGuideTour() {
    setIsPreviewGuideMode(true);
    setPreviewGuideStep(0);
    setPreviewDestination(GUIDE_STEPS[0].destination);
  }

  function nextPreviewGuideStep() {
    const nextIndex = previewGuideStep + 1;

    if (nextIndex >= GUIDE_STEPS.length) {
      clearPreviewGuideSpotlight();
      setIsPreviewGuideMode(false);
      return;
    }

    const nextGuideStepData = GUIDE_STEPS[nextIndex];
    setPreviewGuideStep(nextIndex);
    if (nextGuideStepData.destination !== previewDestination) {
      setPreviewDestination(nextGuideStepData.destination);
    }
  }

  function skipPreviewGuideTour() {
    clearPreviewGuideSpotlight();
    setIsPreviewGuideMode(false);
    setPreviewGuideStep(0);
  }

  function startAgentReplay() {
    setReplayStep(0);

    window.setTimeout(() => setReplayStep(1), 550);
    window.setTimeout(() => setReplayStep(2), 1100);
    window.setTimeout(() => setReplayStep(3), 1650);
    window.setTimeout(() => setReplayStep(-1), 2500);
  }
  async function loadDashboard() {
    try {
      if (!hasLoadedOnceRef.current) {
        setIsConnecting(true);
      }

      setError("");

      const [
        healthPayload,
        matchesPayload,
        recentResultsPayload,
        signalsPayload,
        runsPayload,
        statsPayload,
        pnlPayload,
      ] = await Promise.all([
        request<Health>("/health"),
        request<unknown>("/api/matches"),
        request<unknown>("/api/recent-results"),
        request<unknown>("/api/signals"),
        request<unknown>("/api/agent-runs"),
        request<AgentStats | { data?: AgentStats }>("/api/stats"),
        request<{ data?: typeof pnl }>("/api/pnl").catch(() => null),
      ]);

      const currentMatchList = asArray<Match>(matchesPayload, ["matches", "data"]);
      const recentResultList = asArray<Match>(recentResultsPayload, ["matches", "data"]);
      const mergedMatchMap = new Map<string, Match>();

      for (const match of currentMatchList) {
        mergedMatchMap.set(match.id, match);
      }

      for (const match of recentResultList) {
        mergedMatchMap.set(match.id, match);
      }

      const matchList = [...mergedMatchMap.values()];
      const signalList = asArray<AgentSignal>(signalsPayload, ["signals", "data"]);
      const runList = asArray<AgentRun>(runsPayload, ["runs", "agentRuns", "data"]);

      const statsData =
        (statsPayload as { data?: AgentStats }).data ?? (statsPayload as AgentStats);

      const fallbackMatchId = matchList[0]?.id || "";

      setHealth(healthPayload);
      setMatches(matchList);
      setSignals(signalList);
      setRuns(runList);
      setStats(statsData);
      if (pnlPayload?.data) {
        setPnl(pnlPayload.data);
      }
      setSelectedMatchId((currentMatchId) => currentMatchId || fallbackMatchId);

      setLastRefresh(new Date().toLocaleTimeString());
      hasLoadedOnceRef.current = true;
      setIsConnecting(false);
    } catch (currentError) {
      setError(
        currentError instanceof Error
          ? currentError.message
          : "Unable to load dashboard data."
      );
      hasLoadedOnceRef.current = true;
      setIsConnecting(false);
    }
  }

  useEffect(() => {
    loadDashboard();

    const interval = window.setInterval(loadDashboard, 5000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!selectedMatchId) {
      setOddsHistory([]);
      setIsOddsStreamLive(false);
      return;
    }

    const streamEndpoint = isReplayStreamMode
      ? "/api/live/replay-stream"
      : "/api/live/odds-stream";
    const streamUrl = `${API_BASE_URL}${streamEndpoint}?matchId=${encodeURIComponent(
      selectedMatchId
    )}`;
    const stream = new EventSource(streamUrl);

    stream.addEventListener("open", () => {
      setIsOddsStreamLive(true);
    });

    stream.addEventListener("odds-update", (event) => {
      try {
        const payload = JSON.parse((event as MessageEvent).data) as {
          history?: OddsSnapshot[];
          match?: Match;
          signals?: AgentSignal[];
          stats?: AgentStats;
          timestamp?: string;
          streamMode?: "live" | "replay_test";
          replayCursor?: number;
          replayTotal?: number;
          replayComplete?: boolean;
        };

        if (payload.history) {
          setOddsHistory(
        payload.history.map((snapshot) => ({
          ...snapshot,
          timestamp: snapshot.timestamp ?? snapshot.createdAt,
        }))
      );
        }

        if (payload.match) {
          setMatches((currentMatches) => {
            const existingIndex = currentMatches.findIndex(
              (match) => match.id === payload.match?.id
            );

            if (existingIndex < 0) {
              return [payload.match as Match, ...currentMatches];
            }

            return currentMatches.map((match, index) =>
              index === existingIndex ? (payload.match as Match) : match
            );
          });
        }

        if (payload.signals?.length) {
          setSignals((currentSignals) => {
            const mergedSignals = [...payload.signals!, ...currentSignals];
            const uniqueSignals = new Map<string, AgentSignal>();

            for (const signal of mergedSignals) {
              uniqueSignals.set(signal.id ?? `${signal.matchId}-${signal.createdAt}`, signal);
            }

            return Array.from(uniqueSignals.values()).slice(0, 100);
          });
        }

        if (payload.stats) {
          setStats(payload.stats);
        }

        if (payload.streamMode === "replay_test" && payload.replayCursor && payload.replayTotal) {
          setReplayStreamProgress(`Demo tick ${payload.replayCursor}/${payload.replayTotal}`);
          setStreamProgressPercent(
            Math.min(100, Math.round((payload.replayCursor / payload.replayTotal) * 100))
          );
        } else {
          setReplayStreamProgress("");
        }

        setOddsStreamLastUpdate(formatTime(payload.timestamp));
        setIsOddsStreamLive(true);
      } catch (currentError) {
        console.error("Unable to parse odds stream update", currentError);
      }
    });

    stream.addEventListener("error", () => {
      setIsOddsStreamLive(false);
    });

    return () => {
      stream.close();
      setIsOddsStreamLive(false);
    };
  }, [selectedMatchId, isReplayStreamMode]);

  useEffect(() => {
    if (!selectedSignal) {
      setSimilarSignals(null);
      return;
    }

    let cancelled = false;
    setIsSimilarSignalsLoading(true);

    const params = new URLSearchParams();
    params.set("signalType", getSignalType(selectedSignal));
    if (typeof selectedSignal.oddsChangePct === "number") {
      params.set("oddsChangePct", String(selectedSignal.oddsChangePct));
    }
    const fieldPressureScore = selectedSignal.evidence?.scoresContext?.fieldPressureScore;
    if (typeof fieldPressureScore === "number") {
      params.set("fieldPressureScore", String(fieldPressureScore));
    }
    if (selectedSignal.matchId) {
      params.set("excludeMatchId", selectedSignal.matchId);
    }

    fetch(`${API_BASE_URL}/api/archive/similar-signals?${params.toString()}`)
      .then((response) => response.json())
      .then((payload: { data?: SimilarSignalsResult }) => {
        if (cancelled) return;
        setSimilarSignals(payload.data ?? null);
      })
      .catch(() => {
        if (!cancelled) setSimilarSignals(null);
      })
      .finally(() => {
        if (!cancelled) setIsSimilarSignalsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedSignal]);

  function goToSection(sectionId: string) {
    setActiveSection(sectionId);
    document.getElementById(sectionId)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  function scrollToCaseStudies() {
    document.getElementById("verified-case-studies")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  const selectedMatch = useMemo(
    () =>
      matches.find((match) => match.id === selectedMatchId) ??
      (selectedMatchId ? undefined : matches[0]),
    [matches, selectedMatchId]
  );

  const selectedSignalMatch = useMemo(
    () => matches.find((match) => match.id === selectedSignal?.matchId),
    [matches, selectedSignal]
  );
  const selectedSignalProofHash = useMemo(() => {
    if (!selectedSignal?.id || !replayBacktest?.signals) return undefined;
    const wasInReplayRun = replayBacktest.signals.some((signal) => signal.id === selectedSignal.id);
    return wasInReplayRun ? replayBacktest.proof?.hash : undefined;
  }, [selectedSignal, replayBacktest]);
  const selectedMatchMarketPressure = useMemo(() => {
    if (!selectedMatch) {
      return {
        homePressure: 0,
        awayPressure: 0,
        leader: "Waiting",
      };
    }

    const homeName = selectedMatch.homeTeam ?? "Home";
    const awayName = selectedMatch.awayTeam ?? "Away";
    const matchLabel = `${homeName} vs ${awayName}`.toLowerCase();

    let homePressure = 34;
    let awayPressure = 34;

    const relatedSignals = signals.filter((signal) => {
      const signalMatch = `${signal.match ?? ""}`.toLowerCase();

      return signal.matchId === selectedMatch.id || signalMatch === matchLabel;
    });

    for (const signal of relatedSignals) {
      const target = getSignalTarget(signal).toLowerCase();
      const side = (signal.side ?? "").toLowerCase();
      const momentum = Math.round(
        Math.min(100, Math.max(0, (signal.momentumScore ?? signal.confidence ?? 0) * 10))
      );

      if (side === "home" || target.includes(homeName.toLowerCase())) {
        homePressure = Math.max(homePressure, momentum);
      }

      if (side === "away" || target.includes(awayName.toLowerCase())) {
        awayPressure = Math.max(awayPressure, momentum);
      }
    }

    return {
      homePressure,
      awayPressure,
      leader:
        homePressure > awayPressure
          ? homeName
          : awayPressure > homePressure
            ? awayName
            : "Balanced",
    };
  }, [selectedMatch, signals]);

  const matchStatusCounts = useMemo(
    () => ({
      all: matches.length,
      live: matches.filter((match) => match.status === "live").length,
      scheduled: matches.filter((match) => match.status === "scheduled").length,
      finished: matches.filter((match) => match.status === "finished").length,
    }),
    [matches]
  );

  const filteredMatches = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    const statusFilteredMatches =
      matchStatusFilter === "all"
        ? matches
        : matches.filter((match) => match.status === matchStatusFilter);

    if (!query) return statusFilteredMatches;

    return statusFilteredMatches.filter((match) =>
      `${match.homeTeam ?? ""} ${match.awayTeam ?? ""} ${match.status ?? ""}`
        .toLowerCase()
        .includes(query)
    );
  }, [matches, searchTerm, matchStatusFilter]);

  const filteredSignals = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    if (!query) return signals;

    return signals.filter((signal) =>
      `${signal.type ?? ""} ${signal.severity ?? ""} ${signal.team ?? ""} ${
        signal.side ?? ""
      } ${signal.explanation ?? ""} ${signal.reason ?? ""}`
        .toLowerCase()
        .includes(query)
    );
  }, [signals, searchTerm]);

  const chartData = useMemo(() => {
    const MAX_NON_SIGNAL_CHART_POINTS = 18;

    const relatedSignals = selectedMatch
      ? signals.filter((signal) => signal.matchId === selectedMatch.id).slice(0, 3)
      : [];

    const mustKeepIds = new Set<string>();
    for (const signal of relatedSignals) {
      const nearest = findNearestSnapshot(oddsHistory, signal.createdAt);
      if (nearest?.id) mustKeepIds.add(nearest.id);
    }

    const mustKeepSnapshots = oddsHistory.filter(
      (snapshot) => snapshot.id && mustKeepIds.has(snapshot.id)
    );
    const nonSignalSnapshots = oddsHistory.filter(
      (snapshot) => !snapshot.id || !mustKeepIds.has(snapshot.id)
    );
    const recentNonSignal = nonSignalSnapshots.slice(-MAX_NON_SIGNAL_CHART_POINTS);

    const merged = [...mustKeepSnapshots, ...recentNonSignal].sort((a, b) => {
      const aMs = new Date(a.timestamp ?? "").getTime();
      const bMs = new Date(b.timestamp ?? "").getTime();
      return aMs - bMs;
    });

    return merged.map((snapshot, index) => {
      const odds = snapshot.market ?? snapshot;
      const snapshotNumber = index + 1;
      const hasTimestamp = Boolean(snapshot.timestamp);

      return {
        name: hasTimestamp ? formatTime(snapshot.timestamp) : `S${snapshotNumber}`,
        snapshotLabel: `TxLINE snapshot ${snapshotNumber}`,
        timelineLabel: hasTimestamp
          ? `Captured at ${formatTime(snapshot.timestamp)}`
          : `Replay snapshot ${snapshotNumber}`,
        rawTimestamp: snapshot.timestamp ?? "",
        home: odds.homeOdds,
        draw: odds.drawOdds,
        away: odds.awayOdds,
      };
    });
  }, [oddsHistory, selectedMatch, signals]);
  const chartSignalMarkers = useMemo(() => {
    if (!selectedMatch || chartData.length === 0) return [];

    const relatedSignals = signals.filter((signal) => signal.matchId === selectedMatch.id);

    return relatedSignals.slice(0, 3).flatMap((signal, index) => {
      const side = (signal.side ?? "").toLowerCase();
      const dataKey = side === "away" ? "away" : "home";

      const nearestSnapshot = findNearestSnapshot(oddsHistory, signal.createdAt);
      const nearestPoint = nearestSnapshot
        ? chartData.find((point) => point.rawTimestamp === (nearestSnapshot.timestamp ?? ""))
        : undefined;

      if (!nearestPoint) return [];

      return [
        {
          id: signal.id ?? `${signal.matchId}-${index}`,
          x: nearestPoint.name,
          y: Number(signal.oddsAfter ?? nearestPoint[dataKey]),
          dataKey,
          label: signalTypeLabel(getSignalType(signal)),
          target: getSignalTarget(signal),
          severity: signal.severity,
          confidenceScore: signal.confidenceScore,
          fieldPressureScore: signal.evidence?.scoresContext?.fieldPressureScore,
          explanation: signal.explanation,
          oddsBefore: signal.oddsBefore,
          oddsAfter: signal.oddsAfter,
          oddsChangePct: signal.oddsChangePct,
          trapStatus: signal.trapStatus,
          reversalRisk: signal.reversalRisk,
          scoreRealityStatus: signal.scoreRealityStatus,
        },
      ];
    });
  }, [selectedMatch, chartData, signals, oddsHistory]);
  const chartReadout = useMemo(() => {
    const latestPoint = chartData[chartData.length - 1];
    const firstPoint = chartData[0];

    if (!selectedMatch || !latestPoint || !firstPoint) {
      return {
        homeCurrent: "—",
        awayCurrent: "—",
        dominantSide: "Waiting",
        dominantMove: "—",
        meaning: "Select a market with odds history to see the readout.",
        signalStatus: "No chart signal yet",
        severity: {
          tier: "Waiting",
          dotClass: "bg-stone-500",
          textClass: "text-stone-400",
          badgeClass: "border-border bg-white/5 text-stone-400",
          cardClass: "border-border bg-white/5",
        },
        verdict: "Select a match to see today's market verdict",
      };
    }

    const homeStart = Number(firstPoint.home);
    const homeEnd = Number(latestPoint.home);
    const awayStart = Number(firstPoint.away);
    const awayEnd = Number(latestPoint.away);

    const homeCompression =
      Number.isFinite(homeStart) && homeStart > 0 && Number.isFinite(homeEnd)
        ? ((homeStart - homeEnd) / homeStart) * 100
        : 0;
    const awayCompression =
      Number.isFinite(awayStart) && awayStart > 0 && Number.isFinite(awayEnd)
        ? ((awayStart - awayEnd) / awayStart) * 100
        : 0;

    const isAwayDominant = awayCompression > homeCompression;
    const dominantSide = isAwayDominant
      ? selectedMatch.awayTeam ?? "Away"
      : selectedMatch.homeTeam ?? "Home";
    const dominantMove = Math.max(homeCompression, awayCompression);

    const relatedMarkers = chartSignalMarkers.length;

    const severity =
      dominantMove >= 15
        ? {
            tier: "Sharp move",
            dotClass: "bg-danger",
            textClass: "text-danger-200",
            badgeClass: "border-danger/30 bg-danger/10 text-danger-100",
            cardClass: "border-danger/20 bg-danger/10",
          }
        : dominantMove >= 8
          ? {
              tier: "Momentum",
              dotClass: "bg-accent",
              textClass: "text-accent-200",
              badgeClass: "border-accent/30 bg-accent/10 text-accent-100",
              cardClass: "border-accent/20 bg-accent/10",
            }
          : dominantMove >= 4
            ? {
                tier: "Building",
                dotClass: "bg-warning",
                textClass: "text-warning-200",
                badgeClass: "border-warning/30 bg-warning/10 text-warning-100",
                cardClass: "border-warning/20 bg-warning/10",
              }
            : {
                tier: "Balanced",
                dotClass: "bg-stone-400",
                textClass: "text-stone-300",
                badgeClass: "border-border bg-white/5 text-stone-300",
                cardClass: "border-border bg-white/5",
              };

    const favoredSide = homeEnd <= awayEnd ? selectedMatch.homeTeam ?? "Home" : selectedMatch.awayTeam ?? "Away";

    const verdict =
      dominantMove < 4
        ? `${selectedMatch.homeTeam ?? "Home"} vs ${selectedMatch.awayTeam ?? "Away"}: no clear market move yet`
        : `${dominantSide}'s odds moved ${dominantMove.toFixed(1)}% — market now favors ${favoredSide}`;

    return {
      homeCurrent: formatOdds(homeEnd),
      awayCurrent: formatOdds(awayEnd),
      dominantSide,
      dominantMove:
        dominantMove > 0 ? `${dominantMove.toFixed(1)}% compression` : "No compression",
      meaning:
        dominantMove > 8
          ? "Sharp odds compression detected. This may indicate stronger market confidence."
          : "Movement is mild. GoalPulse is still watching for a stronger signal.",
      signalStatus:
        relatedMarkers > 0
          ? `${relatedMarkers} historical signal marker(s)`
          : "No signal marker on this chart yet",
      severity,
      verdict,
    };
  }, [selectedMatch, chartData, chartSignalMarkers]);
  const agentTimeline = useMemo(() => {
    const latestRun = runs[0];
    const latestSignal = signals[0];
    const runTime = formatTime(latestRun?.finishedAt ?? latestRun?.startedAt);

    return [
      {
        title: "Feed ingested",
        detail: `${matches.length} match record(s) normalized`,
        time: runTime,
      },
      {
        title: "Snapshots created",
        detail: `${formatNumber(stats?.txlineUpdates)} total odds update(s) processed`,
        time: runTime,
      },
      {
        title: "Signal engine ran",
        detail: latestSignal
          ? `${signalTypeLabel(getSignalType(latestSignal))} detected`
          : "Waiting for threshold movement",
        time: formatTime(latestSignal?.createdAt),
      },
      {
        title: "Outcomes evaluated",
        detail: `${stats?.correctSignals ?? 0} confirmed • ${stats?.incorrectSignals ?? 0} rejected`,
        time: runTime,
      },
    ];
  }, [runs, signals, matches.length, stats]);

  // Same minimum-sample-size precedent as the Arena's meta-agent recommendation
  // (settledCount >= 5 before declaring a leader) - below this, an accuracy
  // percentage isn't meaningful enough to color-code as good/bad.
  const MIN_MEANINGFUL_ACCURACY_SAMPLE = 5;
  const hasMeaningfulAccuracySample =
    (stats?.closedSignals ?? 0) >= MIN_MEANINGFUL_ACCURACY_SAMPLE;

  // Command Center is now the default experience - the two-surface split
  // (this vs. the legacy single-scroll dashboard below) was confusing to
  // navigate and gave the app two different looks depending on the URL.
  // `?preview=classic` is the escape hatch to the old dashboard, kept for
  // reference rather than deleted outright; `?preview=command-center`
  // still works too (now redundant with the default, harmless to keep).
  const isLegacyDashboardRequested =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("preview") === "classic";

  const isCommandCenterPreview = !isLegacyDashboardRequested;

  if (isCommandCenterPreview) {
    const latestSignal = signals[0];

    const shellProps = {
      title: "Autonomous World Cup Market Intelligence",
      agentStatus: (health?.ok ? "RUNNING" : "DEGRADED") as "RUNNING" | "DEGRADED",
      feedMode: "LIVE TxLINE" as const,
      freshnessLabel: dataFreshnessLabel(selectedMatch?.lastUpdated) ?? undefined,
      lastDecisionLabel: agentTimeline[2]?.title,
    };

    let destinationContent: ReactNode;

    switch (previewDestination) {
      case "signals":
        destinationContent = (
          <SignalsPage outcomeVerificationItems={outcomeVerificationItems} onSelectSignal={setSelectedSignal} />
        );
        break;
      case "agent-arena":
        destinationContent = (
          <AgentArenaPage
            onSelectSignalId={(signalId) => setSelectedSignal(signals.find((signal) => signal.id === signalId) ?? null)}
          />
        );
        break;
      case "market-maker":
        destinationContent = <MarketMakerPage />;
        break;
      case "archive":
        destinationContent = <ArchivePage onSelectSignal={setSelectedSignal} />;
        break;
      case "live-markets":
        destinationContent = (
          <LiveMarketsPage
            selectedMatch={selectedMatch}
            chartData={chartData}
            chartSignalMarkers={chartSignalMarkers}
            chartReadout={chartReadout}
            isReplayStreamMode={isReplayStreamMode}
            onToggleReplayStreamMode={() => setIsReplayStreamMode((current) => !current)}
            isOddsStreamLive={isOddsStreamLive}
            oddsStreamLastUpdate={oddsStreamLastUpdate}
            replayStreamProgress={replayStreamProgress}
            streamProgressPercent={streamProgressPercent}
            health={health}
            correctSignals={stats?.correctSignals ?? 0}
            closedSignals={stats?.closedSignals ?? 0}
            selectedMatchMarketPressure={selectedMatchMarketPressure}
            matches={filteredMatches}
            matchStatusFilter={matchStatusFilter}
            onChangeMatchStatusFilter={setMatchStatusFilter}
            matchStatusCounts={matchStatusCounts}
            selectedMatchId={selectedMatchId}
            onSelectMatch={setSelectedMatchId}
            onSelectSignalId={(signalId) => setSelectedSignal(signals.find((signal) => signal.id === signalId) ?? null)}
          />
        );
        break;
      case "replay-lab":
        destinationContent = (
          <ReplayLabPage
            replayBacktest={replayBacktest}
            pnl={pnl}
            isReplayRunning={isReplayRunning}
            onRunAudit={runReplayBacktest}
            selectedSignal={selectedSignal}
            onSelectSignal={setSelectedSignal}
            onchainVerify={onchainVerify}
            onVerify={runOnchainVerify}
          />
        );
        break;
      case "verification":
        destinationContent = (
          <VerificationPage selectedSignal={selectedSignal} onchainVerify={onchainVerify} onVerify={runOnchainVerify} />
        );
        break;
      case "system-health":
        destinationContent = <SystemHealthPage health={health} />;
        break;
      case "command-center":
      default:
        destinationContent = (
          <CommandCenterPage
            kpis={{
              liveFixtures: matchStatusCounts.live,
              feedFreshnessLabel: dataFreshnessLabel(selectedMatch?.lastUpdated) ?? "—",
              signalsInWindow: stats?.signalsGenerated ?? 0,
              openSimulatedPositions: pnl?.openPositions ?? 0,
            }}
            selectedFixtureLabel={
              selectedMatch ? `${selectedMatch.homeTeam} vs ${selectedMatch.awayTeam}` : "No match selected"
            }
            chartData={chartData.map((point) => ({ name: point.name, home: point.home, away: point.away }))}
            decisionFeed={agentTimeline}
            latestSignal={
              latestSignal
                ? {
                    severityLabel: (latestSignal.severity ?? "LOW").toUpperCase(),
                    target: getSignalTarget(latestSignal),
                    priceMoveLabel: formatOddsChange(latestSignal.oddsChangePct),
                  }
                : null
            }
            systemHealthLabel={health?.liveStream?.connected ? "Streams connected" : "Stream issue"}
            isSystemHealthy={health?.liveStream?.connected ?? false}
          />
        );
    }

    const previewGuideStepData = GUIDE_STEPS[previewGuideStep];

    return (
      <>
        {isPreviewGuideMode && (
          <div className="fixed inset-0 z-40 bg-black/55 backdrop-blur-[2px] transition-opacity duration-500 pointer-events-none" />
        )}

        <AppShell
          active={previewDestination}
          onSelectDestination={setPreviewDestination}
          {...shellProps}
        >
          <Suspense
            fallback={
              <div className="rounded-xl border border-border bg-surface-2 p-5 text-sm text-stone-400">
                Loading...
              </div>
            }
          >
            {destinationContent}
          </Suspense>
        </AppShell>

        <SignalAuditDrawer
          signal={selectedSignal}
          match={selectedSignalMatch}
          onClose={() => setSelectedSignal(null)}
          onchainVerify={onchainVerify}
          onVerify={runOnchainVerify}
          similarSignals={similarSignals}
          isSimilarSignalsLoading={isSimilarSignalsLoading}
          proofHash={selectedSignalProofHash}
        />

        <AnalystChatWidget
          isOpen={isAnalystChatOpen}
          onToggleOpen={() => setIsAnalystChatOpen((isOpen) => !isOpen)}
          onClose={() => setIsAnalystChatOpen(false)}
          messages={analystMessages}
          question={analystQuestion}
          onQuestionChange={setAnalystQuestion}
          onSend={sendAnalystMessage}
          isReplying={isAnalystReplying}
        />

        <button
          onClick={startPreviewGuideTour}
          className="fixed bottom-4 right-4 z-[80] rounded-full border border-accent/30 bg-accent px-4 py-2 text-xs font-bold text-white shadow-2xl shadow-accent/25 transition hover:bg-accent"
        >
          Guide
        </button>

        {isPreviewGuideMode && previewGuideStepData && (
          <div
            data-guide-panel="true"
            className="fixed z-[70] w-[340px] rounded-2xl border border-accent/30 bg-[#10161d]/95 p-4 shadow-2xl shadow-accent/20 backdrop-blur-xl ring-1 ring-white/10 transition-[top,left,transform] duration-500"
            style={{
              top: previewGuidePanelPosition.top,
              left: previewGuidePanelPosition.left,
            }}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.24em] text-accent-200/70">Guided tour</p>
                <h2 className="mt-1 text-sm font-semibold text-white">GoalPulse guided tour</h2>
              </div>
              <span className="rounded-full bg-accent/10 px-2.5 py-1 text-[10px] font-semibold text-accent-200">
                {previewGuideStep + 1}/{GUIDE_STEPS.length}
              </span>
            </div>

            <div className="rounded-xl border border-accent/15 bg-black/30 p-3 shadow-inner">
              <p className="text-sm font-semibold text-white">{previewGuideStepData.title}</p>
              <p className="mt-1 text-[11px] leading-5 text-stone-400">{previewGuideStepData.detail}</p>
            </div>

            <div className="mt-3 grid grid-cols-6 gap-1.5">
              {GUIDE_STEPS.map((step, index) => (
                <div
                  key={step.title}
                  className={`h-1.5 rounded-full ${index <= previewGuideStep ? "bg-accent" : "bg-white/10"}`}
                />
              ))}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                onClick={skipPreviewGuideTour}
                className="rounded-full border border-border bg-white/5 px-3 py-2 text-[11px] font-medium text-stone-300 transition hover:bg-white/10 hover:text-white"
              >
                Skip
              </button>
              <button
                onClick={nextPreviewGuideStep}
                className="rounded-full border border-accent/30 bg-accent px-3 py-2 text-[11px] font-bold text-white transition hover:bg-accent"
              >
                {previewGuideStep + 1 >= GUIDE_STEPS.length ? "Finish" : "Next"}
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <main className="min-h-screen bg-[#0a0e13] p-3 text-stone-100">
      <AnalystChatWidget
        isOpen={isAnalystChatOpen}
        onToggleOpen={() => setIsAnalystChatOpen((isOpen) => !isOpen)}
        onClose={() => setIsAnalystChatOpen(false)}
        messages={analystMessages}
        question={analystQuestion}
        onQuestionChange={setAnalystQuestion}
        onSend={sendAnalystMessage}
        isReplying={isAnalystReplying}
      />
      {isJudgeMode && (
        <div className="fixed inset-0 z-40 bg-black/55 backdrop-blur-[2px] transition-opacity duration-500 pointer-events-none" />
      )}

      <button
        onClick={startGuideTour}
        className="fixed bottom-4 right-4 z-[80] rounded-full border border-accent/30 bg-accent px-4 py-2 text-xs font-bold text-white shadow-2xl shadow-accent/25 transition hover:bg-accent"
      >
        Guide
      </button>

      {isJudgeMode && (
        <div
          data-guide-panel="true"
          className="fixed z-[70] w-[340px] rounded-2xl border border-accent/30 bg-[#10161d]/95 p-4 shadow-2xl shadow-accent/20 backdrop-blur-xl ring-1 ring-white/10 transition-[top,left,transform] duration-500"
          style={{
            top: guidePanelPosition.top,
            left: guidePanelPosition.left,
          }}
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.24em] text-accent-200/70">
                Guided tour
              </p>
              <h2 className="mt-1 text-sm font-semibold text-white">
                GoalPulse guided tour
              </h2>
            </div>
            <span className="rounded-full bg-accent/10 px-2.5 py-1 text-[10px] font-semibold text-accent-200">
              {judgeStep + 1}/{judgeDemoSteps.length}
            </span>
          </div>

          <div className="rounded-xl border border-accent/15 bg-black/30 p-3 shadow-inner">
            <p className="text-sm font-semibold text-white">
              {judgeDemoSteps[judgeStep]?.title}
            </p>
            <p className="mt-1 text-[11px] leading-5 text-stone-400">
              {judgeDemoSteps[judgeStep]?.detail}
            </p>
          </div>

          <div className="mt-3 grid grid-cols-6 gap-1.5">
            {judgeDemoSteps.map((step, index) => (
              <div
                key={step.title}
                className={`h-1.5 rounded-full ${
                  index <= judgeStep ? "bg-accent" : "bg-white/10"
                }`}
              />
            ))}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              onClick={skipGuideTour}
              className="rounded-full border border-border bg-white/5 px-3 py-2 text-[11px] font-medium text-stone-300 transition hover:bg-white/10 hover:text-white"
            >
              Skip
            </button>
            <button
              onClick={nextGuideStep}
              className="rounded-full border border-accent/30 bg-accent px-3 py-2 text-[11px] font-bold text-white transition hover:bg-accent"
            >
              {judgeStep + 1 >= judgeDemoSteps.length ? "Finish" : "Next"}
            </button>
          </div>
        </div>
      )}
      <div className="mx-auto grid max-w-[1380px] grid-cols-[70px_minmax(0,1fr)_300px] gap-4">
        <aside className="sticky top-3 h-[calc(100vh-24px)] rounded-2xl border border-border bg-[#10161d] p-3">
          <div className="mb-7 flex h-11 w-11 items-center justify-center rounded-xl bg-positive-500 text-lg font-black text-[#0a0e13]">
            GP
          </div>

          <nav className="space-y-2">
            <button
              onClick={() => goToSection("overview")}
              title="Overview"
              className={`flex h-11 w-11 items-center justify-center rounded-xl transition-all duration-300 ${
                activeSection === "overview"
                  ? "bg-accent text-white scale-105 shadow-lg shadow-accent/30"
                  : "text-stone-500 hover:bg-white/8 hover:text-white"
              }`}
            >
              <LayoutDashboard className="h-5 w-5" />
            </button>

            <button
              onClick={() => goToSection("markets")}
              title="Markets"
              className={`flex h-11 w-11 items-center justify-center rounded-xl transition-all duration-300 ${
                activeSection === "markets"
                  ? "bg-accent text-white scale-105 shadow-lg shadow-accent/30"
                  : "text-stone-500 hover:bg-white/8 hover:text-white"
              }`}
            >
              <BarChart3 className="h-5 w-5" />
            </button>

            <button
              onClick={() => goToSection("agent")}
              title="Agent"
              className={`flex h-11 w-11 items-center justify-center rounded-xl transition-all duration-300 ${
                activeSection === "agent"
                  ? "bg-accent text-white scale-105 shadow-lg shadow-accent/30"
                  : "text-stone-500 hover:bg-white/8 hover:text-white"
              }`}
            >
              <Bot className="h-5 w-5" />
            </button>

            <button
              onClick={() => goToSection("compliance")}
              title="Compliance"
              className={`flex h-11 w-11 items-center justify-center rounded-xl transition-all duration-300 ${
                activeSection === "compliance"
                  ? "bg-accent text-white scale-105 shadow-lg shadow-accent/30"
                  : "text-stone-500 hover:bg-white/8 hover:text-white"
              }`}
            >
              <ShieldCheck className="h-5 w-5" />
            </button>

            <div className="my-3 h-px bg-white/8" />

            {PIPELINE_STAGES.map((stage, index) => {
              const StageIcon = stage.icon;
              const isActive = activePipelineStage === stage.id;

              return (
                <button
                  key={stage.id}
                  onClick={() =>
                    document.getElementById(stage.id)?.scrollIntoView({ behavior: "smooth", block: "start" })
                  }
                  title={`${index + 1}. ${stage.label}`}
                  className={`relative flex h-11 w-11 items-center justify-center rounded-xl transition-all duration-300 ${
                    isActive
                      ? "bg-accent text-white scale-105 shadow-lg shadow-accent/30"
                      : "text-stone-500 hover:bg-white/8 hover:text-white"
                  }`}
                >
                  <span className="absolute left-1 top-1 font-mono text-[8px] leading-none text-stone-600">
                    {index + 1}
                  </span>
                  <StageIcon className="h-5 w-5" />
                </button>
              );
            })}
          </nav>

          <div className="absolute bottom-4 left-3">
            <button
              onClick={loadDashboard}
              title="Refresh data"
              className="flex h-11 w-11 items-center justify-center rounded-xl text-stone-500 hover:bg-white/8 hover:text-white"
            >
              <RefreshCw className="h-5 w-5" />
            </button>
          </div>
        </aside>

        <section className="space-y-4">
          <header className="flex items-center justify-between rounded-2xl border border-border bg-[#10161d] px-5 py-4">
            <div className="flex min-w-[320px] items-center gap-3 rounded-xl bg-black/25 px-4 py-3 text-sm text-stone-400">
              <Search className="h-4 w-4" />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="w-full bg-transparent text-sm text-stone-200 outline-none placeholder:text-stone-500"
                placeholder="Search matches, signals, odds movement"
              />
            </div>

            <div className="flex items-center gap-3">
              <span className="rounded-full border border-positive/20 bg-positive/10 px-3 py-2 text-xs font-medium text-positive-200">
                {isConnecting ? "Connecting agent" : "Agent running"}
              </span>

              <span className="rounded-full border border-accent/20 bg-accent/10 px-3 py-2 text-xs font-medium text-accent-200">
                {isConnecting
                  ? "Waking backend"
                  : health === null
                    ? "Connecting"
                    : health.useSimulatedFeed
                      ? "Sandbox feed"
                      : "Real TxLINE feed"}
              </span>
              <span className="rounded-full border border-info/20 bg-info/10 px-3 py-2 text-xs font-medium text-info-200">
                TxLINE-ready
              </span>

              <span className="rounded-full border border-border bg-black/25 px-3 py-2 text-xs text-stone-400">
                Updated {lastRefresh || "waiting"}
              </span>

              <div className="relative">
                <button
                  onClick={() => setIsProfileOpen((value) => !value)}
                  className="flex items-center gap-3 rounded-xl bg-black/25 px-3 py-2"
                >
                  <div className="h-8 w-8 rounded-full bg-gradient-to-br from-accent-300 to-positive" />
                  <div className="text-left">
                    <p className="text-xs font-semibold text-white">GoalPulse</p>
                    <p className="text-[11px] text-stone-500">Hackathon build</p>
                  </div>
                  <ChevronDown className="h-4 w-4 text-stone-500" />
                </button>

                {isProfileOpen && (
                  <div className="absolute right-0 top-12 z-20 w-56 rounded-xl border border-border bg-[#10161d] p-3 shadow-2xl shadow-black/40">
                    <p className="text-xs font-semibold text-white">GoalPulse Agent</p>
                    <p className="mt-1 text-[11px] leading-4 text-stone-500">
                      TxLINE-ready autonomous odds intelligence dashboard.
                    </p>
                    <div className="mt-3 space-y-2 rounded-xl border border-border bg-black/20 p-3 text-[11px]">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-stone-500">Feed mode</span>
                        <span className="font-medium text-accent-200">
                          {health?.useSimulatedFeed ? "Sandbox" : "Live"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-stone-500">Adapter</span>
                        <span className="font-medium text-info-200">TxLINE-ready</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-stone-500">Schema</span>
                        <span className="font-medium text-positive-200">Compatible</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-stone-500">Switch</span>
                        <span className="font-medium text-stone-200">API key ready</span>
                      </div>
                    </div>
                    <button
                      onClick={() => goToSection("compliance")}
                      className="mt-3 w-full rounded-xl bg-white/8 px-3 py-2 text-left text-xs text-stone-300 hover:bg-white/12"
                    >
                      View safety note
                    </button>
                  </div>
                )}
              </div>
            </div>
          </header>

          {(error || isConnecting) && (
            <div
              className={`rounded-xl border px-4 py-3 text-sm ${
                error
                  ? "border-danger/20 bg-danger-500/10 text-danger-200"
                  : "border-accent/20 bg-accent/10 text-accent-100"
              }`}
            >
              {error
                ? `Connection issue: ${error}`
                : "Connecting to the autonomous agent. If the backend is waking up, this may take a few seconds."}
            </div>
          )}

                                                            <section
            id="overview"
            className={`scroll-mt-4 rounded-2xl border p-1.5 transition-all duration-500 ${
              activeSection === "overview"
                ? "border-accent/40 bg-accent/5 shadow-[0_0_28px_rgba(251,146,60,0.10)]"
                : "border-transparent"
            }`}
          >
            <div className="rounded-2xl border border-border bg-[#10161d] p-4">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 animate-fade-in-up">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-accent-600 shadow-[0_0_24px_rgba(251,146,60,0.4)]">
                    <Zap className="h-5 w-5 text-white" fill="white" />
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.15em] text-stone-500">Autonomous odds intelligence</p>
                    <h1 className="text-2xl font-bold tracking-tight text-white">
                      GoalPulse Agent
                    </h1>
                  </div>
                </div>

                <div className="flex flex-1 flex-wrap items-stretch gap-2 sm:flex-none sm:justify-end">
                  <div
                    className={`flex min-w-[172px] items-center gap-2.5 rounded-xl border px-3.5 py-2.5 transition-shadow ${
                      health?.useSimulatedFeed
                        ? "border-warning/30 bg-gradient-to-br from-warning/15 to-warning-600/5 animate-glow-pulse-amber"
                        : "border-positive/30 bg-gradient-to-br from-positive/15 to-positive-600/5 animate-glow-pulse"
                    }`}
                  >
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
                        health?.useSimulatedFeed ? "bg-warning/20" : "bg-positive/20"
                      }`}
                    >
                      <Wifi className={`h-4 w-4 ${health?.useSimulatedFeed ? "text-warning-300" : "text-positive-300"}`} />
                    </div>
                    <div>
                      <p
                        className={`flex items-center gap-1.5 text-xs font-bold uppercase leading-tight tracking-[0.1em] ${
                          health?.useSimulatedFeed ? "text-warning-200" : "text-positive-200"
                        }`}
                      >
                        <span className="relative flex h-1.5 w-1.5">
                          <span
                            className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${
                              health?.useSimulatedFeed ? "bg-warning" : "bg-positive"
                            }`}
                          />
                          <span
                            className={`relative inline-flex h-1.5 w-1.5 rounded-full ${
                              health?.useSimulatedFeed ? "bg-warning" : "bg-positive"
                            }`}
                          />
                        </span>
                        {health?.useSimulatedFeed ? "Lab mode" : "Live feed"}
                      </p>
                      <p className="text-[10px] leading-tight text-stone-400">
                        {health?.useSimulatedFeed ? "Demo data" : "Real TxLINE API"}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:flex sm:items-stretch">
                    <div className="flex min-w-[104px] items-center gap-2.5 rounded-xl border border-info/20 bg-gradient-to-br from-info/10 to-transparent px-3.5 py-2.5 transition-all hover:scale-[1.03] hover:border-info/40">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-info/15">
                        <Activity className="h-4 w-4 text-info-300" />
                      </div>
                      <div>
                        <p className="text-[9px] uppercase tracking-[0.1em] text-stone-500">Updates</p>
                        <p className="text-xl font-bold tabular-nums text-white">
                          {formatNumber(stats?.txlineUpdates)}
                        </p>
                      </div>
                    </div>

                    <div className="flex min-w-[104px] items-center gap-2.5 rounded-xl border border-proof/20 bg-gradient-to-br from-proof/10 to-transparent px-3.5 py-2.5 transition-all hover:scale-[1.03] hover:border-proof/40">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-proof/15">
                        <Zap className="h-4 w-4 text-proof-300" />
                      </div>
                      <div>
                        <p className="text-[9px] uppercase tracking-[0.1em] text-stone-500">Signals</p>
                        <p className="text-xl font-bold tabular-nums text-white">
                          {formatNumber(stats?.signalsGenerated)}
                        </p>
                      </div>
                    </div>

                    <div
                      className={`flex min-w-[104px] items-center gap-2.5 rounded-xl border px-3.5 py-2.5 transition-all hover:scale-[1.03] ${
                        !hasMeaningfulAccuracySample
                          ? "border-stone-500/20 bg-gradient-to-br from-stone-500/10 to-transparent hover:border-stone-400/40"
                          : (stats?.strategyAccuracy ?? 0) >= 60
                            ? "border-positive/20 bg-gradient-to-br from-positive/10 to-transparent hover:border-positive/40"
                            : (stats?.strategyAccuracy ?? 0) >= 40
                              ? "border-warning/20 bg-gradient-to-br from-warning/10 to-transparent hover:border-warning/40"
                              : "border-danger/20 bg-gradient-to-br from-danger/10 to-transparent hover:border-danger/40"
                      }`}
                    >
                      <div
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
                          !hasMeaningfulAccuracySample
                            ? "bg-stone-500/15"
                            : (stats?.strategyAccuracy ?? 0) >= 60
                              ? "bg-positive/15"
                              : (stats?.strategyAccuracy ?? 0) >= 40
                                ? "bg-warning/15"
                                : "bg-danger/15"
                        }`}
                      >
                        <Target
                          className={`h-4 w-4 ${
                            !hasMeaningfulAccuracySample
                              ? "text-stone-400"
                              : (stats?.strategyAccuracy ?? 0) >= 60
                                ? "text-positive-300"
                                : (stats?.strategyAccuracy ?? 0) >= 40
                                  ? "text-warning-300"
                                  : "text-danger-300"
                          }`}
                        />
                      </div>
                      <div>
                        <p className="text-[9px] uppercase tracking-[0.1em] text-stone-500">Accuracy</p>
                        {(stats?.closedSignals ?? 0) > 0 ? (
                          <p
                            className={`text-xl font-bold tabular-nums ${
                              !hasMeaningfulAccuracySample
                                ? "text-stone-300"
                                : (stats?.strategyAccuracy ?? 0) >= 60
                                  ? "text-positive-300"
                                  : (stats?.strategyAccuracy ?? 0) >= 40
                                    ? "text-warning-300"
                                    : "text-danger-300"
                            }`}
                          >
                            {formatPercent(stats?.strategyAccuracy)}
                          </p>
                        ) : (
                          <p className="text-sm font-semibold text-stone-400">Building…</p>
                        )}
                        <button
                          type="button"
                          onClick={scrollToCaseStudies}
                          className="mt-1 block text-left text-[10px] font-semibold leading-tight text-stone-300 underline decoration-dotted hover:text-stone-100"
                        >
                          {hasMeaningfulAccuracySample
                            ? `n=${stats?.closedSignals ?? 0} closed · See verified case studies`
                            : `n=${stats?.closedSignals ?? 0} closed — too small to be meaningful yet`}
                        </button>
                      </div>
                    </div>

                    <div className="flex min-w-[104px] items-center gap-2.5 rounded-xl border border-positive/20 bg-gradient-to-br from-positive/10 to-transparent px-3.5 py-2.5 transition-all hover:scale-[1.03] hover:border-positive/40">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-positive/15">
                        <Server className="h-4 w-4 text-positive-300" />
                      </div>
                      <div>
                        <p className="text-[9px] uppercase tracking-[0.1em] text-stone-500">Backend</p>
                        <p className="flex items-center gap-1.5 text-sm font-bold text-positive-200">
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              health?.ok ? "bg-positive" : "bg-stone-500"
                            }`}
                          />
                          {health?.ok ? "Online" : "Checking"}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="overflow-hidden rounded-2xl border border-border bg-[radial-gradient(circle_at_top_left,rgba(251,146,60,0.22),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.055),rgba(0,0,0,0.18))] p-4">
                <div className="mb-3 flex items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs text-stone-400">Selected market</p>
                      <span className="rounded-full border border-border bg-black/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-300">
                        {isReplayStreamMode
                          ? "Demo replay"
                          : selectedMatch?.status === "scheduled"
                            ? "Pre-match odds"
                            : selectedMatch?.status === "live"
                              ? "Live odds"
                              : selectedMatch?.status === "finished"
                                ? "Finished audit"
                                : "Waiting"}
                      </span>
                    </div>
                    <div className="mt-1 flex items-end gap-3">
                      <p className="text-3xl font-semibold tracking-tight text-white">
                        {formatOdds(chartData[chartData.length - 1]?.home)}
                      </p>
                      <span className="mb-1 rounded-full bg-positive/10 px-2.5 py-1 text-xs font-medium text-positive-300">
                        {isReplayStreamMode
                          ? "Demo replay tracked odds"
                          : selectedMatch?.status === "scheduled"
                            ? "Pre-match tracked odds"
                            : selectedMatch?.status === "live"
                              ? "Live tracked odds"
                              : selectedMatch?.status === "finished"
                                ? "Finished audit tracked odds"
                                : "Primary tracked odds"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-stone-500">
                      {selectedMatch
                        ? `${selectedMatch.homeTeam} vs ${selectedMatch.awayTeam}`
                        : "Waiting for match selection"}
                    </p>
                    <p className="mt-2 max-w-md text-[11px] leading-5 text-stone-500">
                      Lower odds usually mean stronger market confidence. GoalPulse explains movement for analytics only.
                    </p>
                  </div>

                  <div className="max-w-[260px] rounded-xl border border-border bg-black/25 px-3 py-2 text-right">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-stone-500">
                      Timeline view
                    </p>
                    <p className="mt-1 text-xs font-semibold text-white">
                      Last {chartData.length} TxLINE snapshots
                    </p>
                    <p className="mt-1 text-[10px] leading-4 text-stone-500">
                      S1-S{chartData.length} are odds captures, not match minutes.
                    </p>
                    <p className={`mt-2 text-[10px] font-semibold ${isReplayStreamMode ? "text-info-200" : isOddsStreamLive ? "text-positive-200" : "text-warning-200"}`}>
                      {isReplayStreamMode ? "DEMO REPLAY STREAM" : isOddsStreamLive ? "DATA STREAM ACTIVE" : "CONNECTING DATA STREAM"}
                    </p>
                    {oddsStreamLastUpdate && (
                      <p className="mt-1 text-[10px] text-stone-500">
                        Last tick: {oddsStreamLastUpdate}
                      </p>
                    )}
                    {health?.liveStream && (
                      <p
                        className={`mt-2 text-[10px] font-semibold ${
                          health.liveStream.connected ? "text-positive-200" : "text-stone-500"
                        }`}
                        title={health.liveStream.lastError ?? undefined}
                      >
                        {health.liveStream.connected
                          ? `⛓ TxLINE push feed connected (${health.liveStream.totalEventsReceived ?? 0} events)`
                          : "⛓ TxLINE push feed reconnecting…"}
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => setIsReplayStreamMode((current) => !current)}
                      className={`mt-3 w-full rounded-xl border px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] transition ${
                        isReplayStreamMode
                          ? "border-info/40 bg-info-500/15 text-info-100"
                          : "border-border bg-white/5 text-stone-300 hover:border-white/20"
                      }`}
                    >
                      {isReplayStreamMode ? "Stop demo replay" : "Start demo replay"}
                    </button>
                    {isReplayStreamMode && (
                      <p className="mt-2 rounded-xl border border-info/20 bg-info-500/10 px-3 py-2 text-[10px] leading-4 text-info-100">
                        {replayStreamProgress || "Demo replay using saved real TxLINE snapshots"}
                      </p>
                    )}
                  </div>
                </div>

                <div className="mb-3 space-y-2 animate-fade-in-up">
                  <div className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3.5 transition-all duration-500 ${chartReadout.severity.cardClass}`}>
                    <div className="flex items-center gap-3">
                      <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-black/20">
                        {(chartReadout.severity.tier === "Sharp move" || chartReadout.severity.tier === "Momentum") && (
                          <span className={`absolute inline-flex h-full w-full animate-ping rounded-xl opacity-20 ${chartReadout.severity.dotClass}`} />
                        )}
                        {chartReadout.severity.tier === "Sharp move" || chartReadout.severity.tier === "Momentum" ? (
                          <TrendingDown className={`relative h-5 w-5 ${chartReadout.severity.textClass}`} />
                        ) : chartReadout.severity.tier === "Building" ? (
                          <TrendingUp className={`relative h-5 w-5 ${chartReadout.severity.textClass}`} />
                        ) : (
                          <Activity className={`relative h-5 w-5 ${chartReadout.severity.textClass}`} />
                        )}
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.2em] text-stone-400">
                          Market verdict
                        </p>
                        <h3 className="mt-0.5 text-lg font-bold leading-tight text-white">
                          {chartReadout.verdict}
                        </h3>
                      </div>
                    </div>
                    <span className={`shrink-0 rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] ${chartReadout.severity.badgeClass}`}>
                      {chartReadout.severity.tier}
                    </span>
                  </div>

                  <p className="px-1 text-[11px] leading-5 text-stone-400">
                    {chartReadout.meaning} {chartReadout.signalStatus !== "No signal marker on this chart yet" ? `• ${chartReadout.signalStatus}` : ""}
                  </p>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl border border-accent/15 bg-gradient-to-br from-accent/10 to-black/30 p-3">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-stone-500">
                        {selectedMatch?.homeTeam ?? "Home"} odds now
                      </p>
                      <p className="mt-2 text-2xl font-bold text-accent-200">
                        {chartReadout.homeCurrent}

                      </p>
                    </div>

                    <div className="rounded-xl border border-positive/15 bg-gradient-to-br from-positive/10 to-black/30 p-3">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-stone-500">
                        {selectedMatch?.awayTeam ?? "Away"} odds now
                      </p>
                      <p className="mt-2 text-2xl font-bold text-positive-200">
                        {chartReadout.awayCurrent}
                      </p>
                    </div>
                  </div>
                  <p className="px-1 text-[10px] text-stone-500">
                    Decimal odds — the lower number is the side the market currently favors.
                  </p>
                </div>

                <div className="mb-2 flex items-end justify-between px-1">
                  <div>
                    <p className="text-xs font-semibold text-white">Odds movement over time</p>
                    <p className="text-[10px] text-stone-500">
                      Each point is a real TxLINE odds update, not a match minute. The line going down means the market favors that side more.
                    </p>
                  </div>
                </div>
                <div className="h-[285px] w-full rounded-[22px] bg-black/18 p-2">
                  {chartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={chartData}
                        margin={{ top: 8, right: 18, left: 0, bottom: 4 }}
                      >
                        <defs>
                          <linearGradient id="referenceHome" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#ffb020" stopOpacity={0.78} />
                            <stop offset="45%" stopColor="#ffb020" stopOpacity={0.28} />
                            <stop offset="100%" stopColor="#ffb020" stopOpacity={0.02} />
                          </linearGradient>
                          <linearGradient id="referenceAway" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#2fd6b4" stopOpacity={0.30} />
                            <stop offset="100%" stopColor="#2fd6b4" stopOpacity={0} />
                          </linearGradient>
                        </defs>

                        <CartesianGrid
                          stroke="rgba(255,255,255,0.08)"
                          strokeDasharray="3 9"
                          vertical={false}
                        />

                        <XAxis
                          dataKey="name"
                          axisLine={false}
                          tickLine={false}
                          tick={{ fill: "#a8a29e", fontSize: 10 }}
                        />

                        <YAxis
                          orientation="right"
                          axisLine={false}
                          tickLine={false}
                          width={42}
                          tick={{ fill: "#a8a29e", fontSize: 10 }}
                          tickFormatter={(value) => Number(value).toFixed(2)}
                          domain={["dataMin - 0.05", "dataMax + 0.05"]}
                          label={{
                            value: "Odds ↓ = favorite",
                            angle: -90,
                            position: "insideRight",
                            fill: "#78716c",
                            fontSize: 9,
                            dx: 14,
                          }}
                        />

                        <Tooltip
                          cursor={{
                            stroke: "rgba(255,255,255,0.35)",
                            strokeWidth: 1,
                          }}
                          wrapperStyle={{ zIndex: 50 }}
                          content={(tooltipProps) => {
                            const payload = tooltipProps.payload ?? [];
                            const point = payload[0]?.payload;
                            const marker = chartSignalMarkers.find(
                              (currentMarker) => currentMarker.x === tooltipProps.label
                            );

                            if (!point) return null;

                            return (
                              <div className="w-[240px] rounded-xl border border-border bg-[#10161d]/95 p-3 text-xs text-stone-100 shadow-2xl shadow-black/50">
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <p className="text-[10px] uppercase tracking-[0.18em] text-info-200/70">
                                      {point.snapshotLabel ?? "TxLINE snapshot"}
                                    </p>
                                    <p className="mt-1 text-[11px] text-stone-400">
                                      {point.timelineLabel ?? "Odds history point"}
                                    </p>
                                  </div>
                                  {marker && (
                                    <span className="rounded-full bg-accent/15 px-2 py-1 text-[10px] font-semibold text-accent-100">
                                      Signal
                                    </span>
                                  )}
                                </div>

                                <div className="mt-3 grid gap-1.5">
                                  <div className="flex justify-between rounded-xl bg-white/5 px-3 py-2">
                                    <span className="text-stone-400">{selectedMatch?.homeTeam ?? "Home"}</span>
                                    <span className="font-semibold text-accent-200">{formatOdds(point.home)}</span>
                                  </div>
                                  <div className="flex justify-between rounded-xl bg-white/5 px-3 py-2">
                                    <span className="text-stone-400">{selectedMatch?.awayTeam ?? "Away"}</span>
                                    <span className="font-semibold text-positive-200">{formatOdds(point.away)}</span>
                                  </div>
                                </div>

                                <p className="mt-2 rounded-xl bg-info/10 px-3 py-2 text-[11px] leading-5 text-info-100">
                                  Lower odds = stronger market confidence.
                                </p>

                                {marker && (
                                  <div className="mt-2 rounded-xl border border-accent/20 bg-accent/10 px-3 py-2 text-[11px] leading-5 text-orange-50/90">
                                    <p className="font-semibold text-accent-100">{marker.label}</p>
                                    <p>Target: {marker.target ?? "Tracked side"}</p>
                                    <p>
                                      Odds: {formatOdds(marker.oddsBefore)} → {formatOdds(marker.oddsAfter)}
                                    </p>
                                    <p>Move: {formatOddsChange(marker.oddsChangePct)}</p>
                                    <p>
                                      Confidence:{" "}
                                      {marker.confidenceScore != null ? `${marker.confidenceScore}%` : "—"}
                                    </p>
                                    <p>
                                      Field pressure:{" "}
                                      {marker.fieldPressureScore != null ? marker.fieldPressureScore : "—"}
                                    </p>
                                    {marker.explanation && (
                                      <p className="mt-1 text-orange-50/80">{marker.explanation}</p>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          }}
                        />

                        <Area
                          type="monotone"
                          dataKey="home"
                          stroke="#ffb020"
                          strokeWidth={2.8}
                          fill="url(#referenceHome)"
                          dot={false}
                          activeDot={{ r: 5, strokeWidth: 2 }}
                          isAnimationActive={true}
                          animationDuration={650}
                          animationEasing="ease-out"
                          name="Primary tracked odds"
                        />

                        <Area
                          type="monotone"
                          dataKey="away"
                          stroke="#2fd6b4"
                          strokeWidth={2}
                          fill="url(#referenceAway)"
                          dot={false}
                          activeDot={{ r: 4 }}
                          isAnimationActive={true}
                          animationDuration={650}
                          animationEasing="ease-out"
                          name="Away odds"
                        />
                        {chartSignalMarkers.map((marker) => {
                          const markerStyle = severityMarkerStyle(marker.severity);

                          return (
                            <ReferenceDot
                              key={marker.id}
                              x={marker.x}
                              y={marker.y}
                              r={markerStyle.radius}
                              stroke="#ffecc7"
                              strokeWidth={2}
                              fill={markerStyle.fill}
                              label={{
                                value: "Signal",
                                position: "top",
                                fill: "#ffd98f",
                                fontSize: 10,
                              }}
                            />
                          );
                        })}

                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-full items-center justify-center rounded-3xl bg-black/25 text-sm text-stone-500">
                      Select a market or start demo replay to load TxLINE snapshots
                    </div>
                  )}
                </div>

                <div className="mt-3 space-y-2.5">
                  <div className="flex items-center gap-2">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/8">
                      <div
                        className="h-2 rounded-full bg-gradient-to-r from-accent to-positive transition-all duration-700 ease-out"
                        style={{
                          width: isReplayStreamMode
                            ? `${streamProgressPercent}%`
                            : isOddsStreamLive
                              ? "100%"
                              : "8%",
                        }}
                      />
                    </div>
                    <span className="shrink-0 text-[10px] text-stone-500">
                      {isReplayStreamMode
                        ? replayStreamProgress || "Demo replay ready"
                        : isOddsStreamLive
                          ? "Data stream active"
                          : "Data stream connecting"}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 rounded-xl bg-black/15 px-3 py-2 text-[10px] text-stone-400">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-accent" />
                        {selectedMatch?.homeTeam ?? "Home"} odds
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-positive" />
                        {selectedMatch?.awayTeam ?? "Away"} odds
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full border border-accent-100 bg-[#ff6161]" />
                        High severity
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full border border-accent-100 bg-[#f2c14e]" />
                        Medium severity
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full border border-accent-100 bg-[#7c8ba1]" />
                        Low severity
                      </span>
                    </div>
                    <span className="text-stone-500">
                      Outcome audit so far: {(stats?.correctSignals ?? 0)} confirmed, {(stats?.closedSignals ?? 0)} closed
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </section>
          <PipelineStageLabel
            index={1}
            title="Ingest"
            description="Live TxLINE odds pulled and normalized into snapshots"
          />
          <section id="markets" className="scroll-mt-4 grid grid-cols-1 gap-3 2xl:grid-cols-2">
            <div
              className={`rounded-2xl border p-4 transition-all duration-500 ${
                activeSection === "markets"
                  ? "border-accent/50 bg-accent/10 shadow-[0_0_35px_rgba(251,146,60,0.16)]"
                  : "border-border bg-[#10161d]"
              }`}
            >
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-xs text-stone-500">Market feed</p>
                  <h2 className="text-xl font-semibold">Market board</h2>
                </div>
                <Radio className="h-4 w-4 text-positive-300" />
              </div>


              <p className="mb-3 rounded-xl border border-border bg-black/25 px-3 py-2 text-[11px] leading-5 text-stone-400">
                Odds shown here are market prices, not match scores. Upcoming matches show pre-match odds before kickoff.
              </p>

              <div className="mb-3 grid grid-cols-4 gap-1.5 rounded-xl bg-black/20 p-1">
                {(["all", "live", "scheduled", "finished"] as const).map((status) => (
                  <button
                    key={status}
                    onClick={() => setMatchStatusFilter(status)}
                    className={`rounded-xl px-2 py-2 text-[10px] font-semibold transition ${
                      matchStatusFilter === status
                        ? "bg-accent/15 text-accent-200"
                        : "text-stone-500 hover:bg-white/6 hover:text-stone-200"
                    }`}
                  >
                    <span>
                      {status === "all"
                        ? "All"
                        : status === "scheduled"
                          ? "Upcoming"
                          : status.charAt(0).toUpperCase() + status.slice(1)}
                    </span>
                    <span className="ml-1 opacity-70">
                      {matchStatusCounts[status]}
                    </span>
                  </button>
                ))}
              </div>

              <div className="space-y-2">
                {filteredMatches.length === 0 && (
                  <div className="rounded-xl bg-black/25 p-4 text-sm text-stone-500">
                    No matches found
                  </div>
                )}
                {filteredMatches.map((match) => {
                  const odds = getOdds(match);

                  return (
                    <button
                      key={match.id}
                      onClick={() => setSelectedMatchId(match.id)}
                      className={`w-full rounded-xl border p-2.5 text-left transition ${
                        selectedMatchId === match.id
                          ? "border-accent/30 bg-accent/10"
                          : "border-white/8 bg-black/20 hover:bg-white/6"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${matchStatusTone(match)}`}>
                          {preciseStatusLabel(match)}
                        </span>
                        <span className="text-right text-xs text-stone-500">
                          <span className="block">{matchClockLabel(match)}</span>
                          {dataFreshnessLabel(match.lastUpdated) && (
                            <span className="block text-[9px] text-stone-600">
                              {dataFreshnessLabel(match.lastUpdated)}
                            </span>
                          )}
                        </span>
                      </div>

                      <div className="mt-2 flex items-center justify-between">
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-white">{match.homeTeam}</p>
                          <p className="text-sm font-medium text-white">{match.awayTeam}</p>
                        </div>
                        <div className="space-y-1 text-right text-lg font-semibold">
                          <p>{match.status === "scheduled" ? "—" : match.homeScore ?? 0}</p>
                          <p>{match.status === "scheduled" ? "—" : match.awayScore ?? 0}</p>
                        </div>
                      </div>

                      <div className="mt-2 grid grid-cols-3 gap-1.5 text-center text-[10px]">
                        <div className="rounded-lg bg-black/25 px-2 py-1.5">
                          <p className="text-stone-500">{match.status === "scheduled" ? "Pre-match Home" : "Home"}</p>
                          <p className="font-semibold text-accent-200">
                            {formatOdds(odds.homeOdds)}
                          </p>
                        </div>
                        <div className="rounded-lg bg-black/25 px-2 py-1.5">
                          <p className="text-stone-500">{match.status === "scheduled" ? "Pre-match Draw" : "Draw"}</p>
                          <p className="font-semibold text-stone-200">
                            {formatOdds(odds.drawOdds)}
                          </p>
                        </div>
                        <div className="rounded-lg bg-black/25 px-2 py-1.5">
                          <p className="text-stone-500">{match.status === "scheduled" ? "Pre-match Away" : "Away"}</p>
                          <p className="font-semibold text-positive-200">
                            {formatOdds(odds.awayOdds)}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          <div id="pipeline-detect" className="scroll-mt-4 space-y-4 2xl:col-span-2">
            <PipelineStageLabel
              index={2}
              title="Detect"
              description="Deterministic thresholds flag odds movement as it happens"
            />
            <SignalIntelligencePanel />
            <div className="grid gap-4 md:grid-cols-2">
              <MarketMakerPanel />
              <SteamMoveDetectionPanel />
            </div>
          </div>

          <div id="pipeline-decide" className="scroll-mt-4 2xl:col-span-2">
            <PipelineStageLabel
              index={3}
              title="Decide"
              description="Three agents trade the same signal feed under different strategies"
            />
            <ArenaPanel />
          </div>

          <div id="pipeline-verify" className="scroll-mt-4 space-y-4 2xl:col-span-2">
            <PipelineStageLabel
              index={4}
              title="Verify"
              description="Every claim is checked against the final result and the track record"
            />
            <ResultsSettlementPanel />
            <div className="grid gap-4 lg:grid-cols-2">
              <SignalArchivePanel />
              <SignalPerformancePanel />
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <ConfidenceCalibrationPanel />
              <SignalCorrelationPanel />
            </div>
            <VerifiedCaseStudiesPanel />
          </div>

          <div id="pipeline-audit" className="scroll-mt-4 2xl:col-span-2">
            <PipelineStageLabel
              index={5}
              title="Audit"
              description="A live, permanent trail of everything the agent just did"
            />
            <WhatChangedPanel />
          </div>

            <div
              id="agent"
              className={`scroll-mt-4 rounded-2xl border p-4 transition-all duration-500 ${
                activeSection === "agent"
                  ? "border-accent/50 bg-accent/10 shadow-[0_0_35px_rgba(251,146,60,0.16)]"
                  : "border-border bg-[#10161d]"
              }`}
            >
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-xs text-stone-500">Signal engine</p>
                  <h2 className="text-xl font-semibold">Latest signals</h2>
                </div>
                <Gauge className="h-4 w-4 text-accent-300" />
              </div>

              <div className="space-y-2">
                {filteredSignals.length > 0 ? (
                  filteredSignals.slice(0, 5).map((signal, index) => (
                    <button
                      key={signal.id ?? index}
                      onClick={() => setSelectedSignal(signal)}
                      className="w-full rounded-xl border border-white/8 bg-black/20 p-2.5 text-left transition hover:border-accent/40 hover:bg-accent/10"
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${severityStyle(
                              signal.severity
                            )}`}
                          >
                            {(signal.severity ?? "LOW").toUpperCase()}
                          </span>
                          {marketTypeLabel(signal.evidence?.marketType) && (
                            <span className="rounded-full border border-info/20 bg-info/10 px-2 py-1 text-[10px] font-semibold text-info-200">
                              {marketTypeLabel(signal.evidence?.marketType)}
                            </span>
                          )}
                          {signal.severity === "HIGH" &&
                            discordAlertBadge(signal.discordAlertStatus) && (
                              <span
                                className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${
                                  discordAlertBadge(signal.discordAlertStatus)!.className
                                }`}
                              >
                                {discordAlertBadge(signal.discordAlertStatus)!.label}
                              </span>
                            )}
                        </div>
                        <span className="text-[11px] text-stone-500">
                          {formatTime(signal.createdAt)}
                        </span>
                      </div>

                      <p className="text-sm font-semibold text-white">
                        {signalTypeLabel(getSignalType(signal))}
                      </p>

                      <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-stone-400">
                        {signal.explanation ??
                          signal.reason ??
                          "Agent detected meaningful market movement."}
                      </p>

                      <p className="mt-1.5 text-[10px] font-medium text-accent-200">
                        View details
                      </p>
                    </button>
                  ))
                ) : (
                  <div className="rounded-xl bg-black/25 p-4 text-sm text-stone-500">
                    No signals found
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-[#10161d] p-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-xs text-stone-500">Post-signal audit</p>
                  <h2 className="text-xl font-semibold">Outcome verification</h2>
                </div>
                <span className="rounded-full border border-positive/20 bg-positive/10 px-3 py-1.5 text-[11px] font-medium text-positive-200">
                  Verifiable
                </span>
              </div>

              {outcomeVerificationItems.length > 0 ? (
                <div className="space-y-2">
                  {outcomeVerificationItems.map((item, index) => {
                    const outcome = getSignalOutcome(item.signal);
                    const isCorrect = outcome.toLowerCase().includes("correct");
                    const isIncorrect = outcome.toLowerCase().includes("incorrect");
                    const proofPreview = item.proofHash
                      ? `${item.proofHash.slice(0, 12)}...${item.proofHash.slice(-6)}`
                      : "pending";

                    return (
                      <button
                        key={`${item.source}-${item.signal.id ?? index}`}
                        onClick={() => setSelectedSignal(item.signal)}
                        className="w-full rounded-xl border border-white/8 bg-black/20 p-3 text-left transition hover:border-positive/30 hover:bg-positive/10"
                      >
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-white">
                              {signalTypeLabel(getSignalType(item.signal))}
                            </p>
                            <p className="mt-0.5 text-[11px] text-stone-500">
                              {item.source} • {getSignalTarget(item.signal)}
                              {marketTypeLabel(item.signal.evidence?.marketType)
                                ? ` • ${marketTypeLabel(item.signal.evidence?.marketType)}`
                                : ""}
                              {item.signal.severity === "HIGH" &&
                              discordAlertBadge(item.signal.discordAlertStatus)
                                ? ` • ${discordAlertBadge(item.signal.discordAlertStatus)!.label}`
                                : ""}
                            </p>
                          </div>

                          <span
                            className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${
                              isCorrect
                                ? "border-positive/30 bg-positive/10 text-positive-200"
                                : isIncorrect
                                  ? "border-danger/30 bg-danger/10 text-danger-200"
                                  : "border-accent/30 bg-accent/10 text-accent-200"
                            }`}
                          >
                            {outcome}
                          </span>
                        </div>

                        <div className="grid grid-cols-3 gap-2 text-[11px]">
                          <div className="rounded-lg bg-black/25 p-2">
                            <p className="text-stone-500">Before</p>
                            <p className="mt-1 font-semibold text-stone-100">
                              {formatOdds(item.signal.oddsBefore)}
                            </p>
                          </div>

                          <div className="rounded-lg bg-black/25 p-2">
                            <p className="text-stone-500">After</p>
                            <p className="mt-1 font-semibold text-stone-100">
                              {formatOdds(item.signal.oddsAfter)}
                            </p>
                          </div>

                          <div className="rounded-lg bg-black/25 p-2">
                            <p className="text-stone-500">Move</p>
                            <p className="mt-1 font-semibold text-accent-200">
                              {formatOddsChange(item.signal.oddsChangePct)}
                            </p>
                          </div>
                        </div>

                        <div className="mt-2 flex items-center justify-between gap-3 text-[10px] text-stone-500">
                          <span>Proof: {proofPreview}</span>
                          <span>{formatTime(item.signal.createdAt)}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-xl bg-black/25 p-4 text-sm text-stone-500">
                  Run the backtest or wait for live signals to verify outcomes.
                </div>
              )}
            </div>
          </section>
        </section>

        <aside className="space-y-2">
          <div className="rounded-2xl border border-border bg-gradient-to-br from-accent to-[#0a0e13] p-4 text-white">
            <p className="text-sm text-orange-50/80">Selected match</p>
            <h2 className="mt-1 text-xl font-semibold leading-tight">
              {selectedMatch
                ? `${selectedMatch.homeTeam} vs ${selectedMatch.awayTeam}`
                : "No match yet"}
            </h2>

            <div className="mt-4 rounded-xl bg-[#10161d]/80 p-3">
              <div className="flex items-center justify-between text-sm text-stone-300">
                <span>{selectedMatch?.homeTeam ?? "Home"}</span>
                <span className="text-xl font-semibold text-white">
                  {selectedMatch?.status === "scheduled" ? "—" : selectedMatch?.homeScore ?? 0}
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between text-sm text-stone-300">
                <span>{selectedMatch?.awayTeam ?? "Away"}</span>
                <span className="text-xl font-semibold text-white">
                  {selectedMatch?.status === "scheduled" ? "—" : selectedMatch?.awayScore ?? 0}
                </span>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-white/15 p-2.5">
                <p className="text-xs text-white/70">
                  {selectedMatch?.status === "live" ? "Clock" : "Timing"}
                </p>
                <p className="text-xl font-semibold">
                  {matchClockLabel(selectedMatch)}
                </p>
              </div>
              <div className="rounded-xl bg-white/15 p-2.5">
                <p className="text-xs text-white/70">Status</p>
                <p className="text-sm font-semibold">{preciseStatusLabel(selectedMatch)}</p>
              </div>
            </div>
            <div className="mt-3 rounded-xl bg-[#10161d]/75 p-3">
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <p className="text-[11px] text-white/60">Market pressure</p>
                  <p className="text-sm font-semibold text-white">
                    {selectedMatchMarketPressure.leader}
                  </p>
                </div>
                <p className="text-[11px] text-white/60">Momentum weighted</p>
              </div>

              <div className="space-y-2">
                <div>
                  <div className="mb-1 flex items-center justify-between text-[11px] text-white/70">
                    <span>{selectedMatch?.homeTeam ?? "Home"}</span>
                    <span>{selectedMatchMarketPressure.homePressure}</span>
                  </div>
                  <div className="h-2 rounded-full bg-white/15">
                    <div
                      className="h-2 rounded-full bg-accent-200"
                      style={{
                        width: `${selectedMatchMarketPressure.homePressure}%`,
                      }}
                    />
                  </div>
                </div>

                <div>
                  <div className="mb-1 flex items-center justify-between text-[11px] text-white/70">
                    <span>{selectedMatch?.awayTeam ?? "Away"}</span>
                    <span>{selectedMatchMarketPressure.awayPressure}</span>
                  </div>
                  <div className="h-2 rounded-full bg-white/15">
                    <div
                      className="h-2 rounded-full bg-positive-300"
                      style={{
                        width: `${selectedMatchMarketPressure.awayPressure}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-[#10161d] p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-xs text-stone-500">Autonomous flow</p>
                <h2 className="text-lg font-semibold">Agent timeline</h2>
              </div>
              <button
                onClick={startAgentReplay}
                className="rounded-full border border-accent/20 bg-accent/10 px-3 py-1.5 text-[11px] font-medium text-accent-200 transition hover:border-accent-300/40 hover:bg-accent/20"
              >
                Replay cycle
              </button>
            </div>

            <div className="space-y-2">
              {agentTimeline.map((item, index) => (
                <div
                  key={item.title}
                  className={`flex gap-2 rounded-xl border p-2.5 transition-all duration-300 ${
                    replayStep === index
                      ? "border-accent-300/60 bg-accent/15 shadow-[0_0_24px_rgba(251,146,60,0.2)]"
                      : "border-white/8 bg-black/20"
                  }`}
                >
                  <div className="flex flex-col items-center">
                    <div
                      className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold transition-all duration-300 ${
                        replayStep === index
                          ? "bg-accent-300 text-black"
                          : "bg-accent/15 text-accent-200"
                      }`}
                    >
                      {index + 1}
                    </div>
                    {index < agentTimeline.length - 1 && (
                      <div className="mt-1 h-6 w-px bg-white/10" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-xs font-semibold text-stone-100">
                        {item.title}
                      </p>
                      <span className="shrink-0 text-[10px] text-stone-600">
                        {item.time}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-stone-400">
                      {item.detail}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-[#10161d] p-4">
            <div
              id="guide-backtest-card"
              className={`transition-all ${
                isJudgeMode && judgeStep === 11 ? "relative z-[60] scale-[1.01] rounded-xl ring-2 ring-accent/70 shadow-2xl shadow-accent/30" : ""
              }`}
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs text-stone-500">
                    {replayBacktest?.mode === "real_txline_replay"
                      ? "Real TxLINE replay"
                      : "Stored replay"}
                  </p>
                  <h2 className="text-base font-semibold">Outcome audit mode</h2>
                </div>
                <button
                  onClick={runReplayBacktest}
                  disabled={isReplayRunning}
                  className="rounded-full border border-accent/20 bg-accent/10 px-3 py-1.5 text-[11px] font-medium text-accent-200 transition hover:border-accent-300/40 hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isReplayRunning ? "Running..." : "Run audit"}
                </button>
              </div>

              {pnl && (
                <div className="mb-3 rounded-xl border border-border bg-black/25 p-3.5">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-stone-500">
                      Simulated P&amp;L — flat 1 unit per signal
                    </p>
                    <span
                      className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${
                        pnl.netUnits > 0
                          ? "border-positive/30 bg-positive/10 text-positive-200"
                          : pnl.netUnits < 0
                            ? "border-danger/30 bg-danger/10 text-danger-200"
                            : "border-border bg-white/5 text-stone-300"
                      }`}
                    >
                      {pnl.netUnits > 0 ? "+" : ""}
                      {pnl.netUnits.toFixed(2)}u · {pnl.roiPercent > 0 ? "+" : ""}
                      {pnl.roiPercent}% ROI
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-lg font-bold tabular-nums text-white">{pnl.settledBets}</p>
                      <p className="text-[9px] uppercase tracking-[0.1em] text-stone-500">Settled bets</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold tabular-nums text-white">{pnl.totalStaked}u</p>
                      <p className="text-[9px] uppercase tracking-[0.1em] text-stone-500">Total staked</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold tabular-nums text-warning-200">{pnl.openPositions}</p>
                      <p className="text-[9px] uppercase tracking-[0.1em] text-stone-500">Open positions</p>
                    </div>
                  </div>
                  <p className="mt-2 text-[9px] leading-4 text-stone-500">{pnl.note}</p>
                  <button
                    type="button"
                    onClick={scrollToCaseStudies}
                    className="mt-1 block text-left text-[9px] leading-4 text-stone-500 underline decoration-dotted hover:text-stone-300"
                  >
                    Based on {pnl.settledBets} settled bet(s) — see verified case studies for permanently confirmed historical examples
                  </button>
                </div>
              )}

              {replayBacktest && (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-xl bg-black/20 p-2.5">
                      <p className="text-[10px] text-stone-500">Snapshots</p>
                      <p className="mt-1 text-sm font-semibold text-white">
                        {replayBacktest.summary?.snapshotsProcessed ?? 0}
                      </p>
                    </div>
                    <div className="rounded-xl bg-black/20 p-2.5">
                      <p className="text-[10px] text-stone-500">Signals</p>
                      <p className="mt-1 text-sm font-semibold text-white">
                        {replayBacktest.summary?.signalsDetected ?? 0}
                      </p>
                    </div>
                    <div className="rounded-xl bg-black/20 p-2.5">
                      <p className="text-[10px] text-stone-500">Settled checks</p>
                      <p className="mt-1 text-sm font-semibold text-positive-200">
                        {(replayBacktest.summary?.correctSignals ?? 0) +
                          (replayBacktest.summary?.incorrectSignals ?? 0)}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-danger/20 bg-danger/10 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.2em] text-danger-200/70">
                          Failed Continuation Detector
                        </p>
                        <p className="mt-1 text-sm font-semibold text-white">
                          {replayBacktest.summary?.smartMoneyTraps ?? 0} trap pattern(s) detected
                        </p>
                      </div>
                      <span className="rounded-full bg-black/25 px-2.5 py-1 text-[10px] font-semibold text-danger-100">
                        {(replayBacktest.summary?.confirmedTraps ?? 0)} rejected •{" "}
                        {(replayBacktest.summary?.possibleTraps ?? 0)} possible
                      </span>
                    </div>

                    <p className="mt-2 text-[11px] leading-5 text-stone-300">
                      GoalPulse checks whether sharp odds movements were later rejected by the final result.
                      This helps expose possible false market moves instead of treating every strong move as a good signal.
                    </p>

                    <div className="mt-3 space-y-2">
                      {(replayBacktest.signals ?? [])
                        .filter(
                          (signal) =>
                            signal.trapStatus === "OUTCOME_REJECTED_MOVE" ||
                            signal.trapStatus === "POSSIBLE_TRAP"
                        )
                        .sort((a, b) => (b.trapScore ?? 0) - (a.trapScore ?? 0))
                        .slice(0, 5)
                        .map((signal, index) => (
                          <button
                            key={`${signal.id ?? "trap"}-${index}`}
                            onClick={() => setSelectedSignal(signal)}
                            className="w-full rounded-lg bg-black/25 p-2 text-left transition hover:bg-danger/10"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <p className="truncate text-[11px] font-semibold text-white">
                                #{index + 1} · {signal.match ?? signal.matchId ?? "Unknown match"} · {getSignalTarget(signal)}
                              </p>
                              <span className="shrink-0 rounded-full bg-danger/10 px-2 py-0.5 text-[10px] font-semibold text-danger-100">
                                Reversal score {signal.trapScore ?? 0}
                              </span>
                            </div>
                            <p className="mt-1 text-[10px] font-semibold text-proof-200">
                              {(signal.reversalRisk ?? "REVERSAL_SCAN").replaceAll("_", " ")}
                            </p>
                            <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-stone-400">
                              {signal.trapReason ?? "Rejected market move flagged for review."}
                            </p>
                          </button>
                        ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {replayBacktest ? (
              <div className="mt-3 space-y-3">
                <div
                  id="guide-proof-readiness"
                  className={`rounded-xl border border-positive/15 bg-positive/10 p-3 transition-all ${
                    isJudgeMode && judgeStep === 14 ? "relative z-[60] scale-[1.01] ring-2 ring-accent/70 shadow-2xl shadow-accent/30" : ""
                  }`}
                >
                  <div className="flex items-center justify-between gap-3 text-[11px]">
                    <span className="text-stone-400">Outcome audit</span>
                    <span className="font-medium text-positive-200">
                      {replayBacktest.summary?.correctSignals ?? 0} confirmed •{" "}
                      {replayBacktest.summary?.incorrectSignals ?? 0} rejected
                    </span>
                  </div>

                  <div className="mt-3 rounded-lg bg-black/20 p-2">
                    <div className="flex items-center justify-between gap-3 text-[10px]">
                      <span className="text-stone-500">Proof network</span>
                      <span className="font-medium text-info-200">
                        {replayBacktest.proof?.network ?? "solana-devnet"}
                      </span>
                    </div>

                    <div className="mt-1 flex items-center justify-between gap-3 text-[10px]">
                      <span className="text-stone-500">Anchoring</span>
                      <span className="font-medium text-accent-200">
                        {(replayBacktest.proof?.anchoringStatus ?? "pending_wallet_configuration")
                          .replaceAll("_", " ")}
                      </span>
                    </div>

                    <p className="mt-2 truncate text-[10px] text-stone-500">
                      Hash: {replayBacktest.proof?.hash ?? "pending"}
                    </p>

                    <VerificationReceipt
                      selectedSignal={selectedSignal}
                      onchainVerify={onchainVerify}
                      onVerify={runOnchainVerify}
                    />
                  </div>
                </div>
                {(replayBacktest.events ?? []).length > 0 && (
                  <div
                    id="guide-event-correlation"
                    className={`rounded-xl border border-accent/15 bg-accent/10 p-3 transition-all ${
                      isJudgeMode && judgeStep === 12 ? "relative z-[60] scale-[1.01] ring-2 ring-accent/70 shadow-2xl shadow-accent/30" : ""
                    }`}
                  >
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[10px] text-accent-200/80">Evidence chain</p>
                        <p className="text-xs font-semibold text-white">
                          {(replayBacktest.events ?? []).length} supporting event(s)
                        </p>
                      </div>
                      <span className="rounded-full bg-black/25 px-2.5 py-1 text-[10px] font-medium text-accent-100">
                        Dual-feed
                      </span>
                    </div>

                    <div className="space-y-2">
                      {(replayBacktest.events ?? []).slice(0, 3).map((event, index) => (
                        <div key={event.id ?? index} className="rounded-lg bg-black/20 p-2">
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-[11px] font-semibold text-stone-100">
                              {event.type?.replaceAll("_", " ").toUpperCase()}
                            </p>
                            <span className="shrink-0 text-[10px] text-accent-200">
                              {event.minute}'
                            </span>
                          </div>
                          <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-stone-500">
                            {event.description}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {(replayBacktest.councilVotes ?? []).length > 0 && (
                  <div
                    id="guide-oracle-council"
                    className={`rounded-xl border border-info/15 bg-info/10 p-3 transition-all ${
                      isJudgeMode && judgeStep === 13 ? "relative z-[60] scale-[1.01] ring-2 ring-accent/70 shadow-2xl shadow-accent/30" : ""
                    }`}
                  >
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[10px] text-info-200/80">Signal review council</p>
                        <p className="text-xs font-semibold text-white">
                          {(replayBacktest.councilVotes ?? [])[0]?.decision?.toUpperCase() ??
                            "PENDING"}
                        </p>
                      </div>
                      <span className="rounded-full bg-black/25 px-2.5 py-1 text-[10px] font-medium text-info-100">
                        {(replayBacktest.councilVotes ?? [])[0]?.approvals ?? 0}/
                        {(replayBacktest.councilVotes ?? [])[0]?.totalAgents ?? 3} approvals
                      </span>
                    </div>

                    <div className="space-y-2">
                      {((replayBacktest.councilVotes ?? [])[0]?.votes ?? []).map(
                        (vote, index) => (
                          <div key={`${vote.agent}-${index}`} className="rounded-lg bg-black/20 p-2">
                            <div className="flex items-center justify-between gap-2">
                              <p className="truncate text-[11px] font-semibold text-stone-100">
                                {vote.agent}
                              </p>
                              <span
                                className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold ${
                                  vote.vote === "approve"
                                    ? "bg-positive/10 text-positive-200"
                                    : vote.vote === "reject"
                                      ? "bg-danger/10 text-danger-200"
                                      : "bg-accent/10 text-accent-200"
                                }`}
                              >
                                {vote.vote}
                              </span>
                            </div>
                            <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-stone-500">
                              {vote.reason}
                            </p>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                )}
                <div className="space-y-2">
                  {(replayBacktest.timeline ?? []).slice(0, 3).map((item, index) => (
                    <div key={`${item.step}-${index}`} className="rounded-xl bg-black/20 p-2.5">
                      <p className="text-[11px] font-semibold text-stone-100">
                        {index + 1}. {item.step}
                      </p>
                      <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-stone-500">
                        {item.detail}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-[11px] leading-5 text-stone-500">
                Replay a saved World Cup odds sequence through the same signal engine to prove
                the logic still works even when real-time matches are unavailable.
              </p>
            )}
          </div>
          <div className="rounded-2xl border border-border bg-[#10161d] p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-xs text-stone-500">Detection rules</p>
                <h2 className="text-base font-semibold">Signal thresholds</h2>
              </div>
              <span className="rounded-full border border-positive/20 bg-positive/10 px-2.5 py-1 text-[10px] font-medium text-positive-200">
                Active
              </span>
            </div>

            <div className="space-y-2">
              <div className="rounded-xl bg-black/20 p-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-stone-100">WATCH</span>
                  <span className="text-accent-200">≥ 4%</span>
                </div>
                <p className="mt-1 text-[11px] text-stone-500">
                  Early movement detected, but not yet strong enough for a major alert.
                </p>
              </div>

              <div className="rounded-xl bg-black/20 p-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-stone-100">MOMENTUM SHIFT</span>
                  <span className="text-accent-200">≥ 8%</span>
                </div>
                <p className="mt-1 text-[11px] text-stone-500">
                  Odds compression suggests meaningful market pressure.
                </p>
              </div>

              <div className="rounded-xl bg-black/20 p-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-stone-100">SHARP MOVE</span>
                  <span className="text-accent-200">≥ 15%</span>
                </div>
                <p className="mt-1 text-[11px] text-stone-500">
                  High-severity movement that the agent flags for review.
                </p>
              </div>
            </div>
          </div>
          <div
            id="compliance"
            className={`scroll-mt-4 rounded-2xl border p-4 transition-all duration-500 ${
              activeSection === "compliance"
                ? "border-accent/40 bg-accent/10 shadow-[0_0_35px_rgba(251,146,60,0.12)]"
                : "border-border bg-[#10161d]"
            }`}
          >
            <div className="mb-3 flex items-center gap-2">
              <div className="rounded-xl bg-positive/10 p-2 text-positive-200">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs text-stone-500">Compliance</p>
                <h2 className="text-base font-semibold">Analytics only</h2>
              </div>
            </div>

            <p className="text-[11px] leading-5 text-stone-400">
              GoalPulse does not place wagers, custody funds, execute trades, or
              facilitate illegal betting. It is a market monitoring layer with a
              TxLINE-ready adapter boundary.
            </p>
          </div>
        </aside>
      </div>

      {selectedSignal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-border bg-[#10161d] p-4 shadow-2xl shadow-black/50">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs text-stone-500">Signal details</p>
                <h2 className="mt-1 text-2xl font-semibold text-white">
                  {signalTypeLabel(getSignalType(selectedSignal))}
                </h2>
              </div>

              <button
                onClick={() => setSelectedSignal(null)}
                className="rounded-xl bg-white/8 p-2 text-stone-400 transition hover:bg-white/12 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mb-4 flex flex-wrap gap-2">
              <span
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${severityStyle(
                  selectedSignal.severity
                )}`}
              >
                {(selectedSignal.severity ?? "LOW").toUpperCase()}
              </span>

              <span className="rounded-full border border-border bg-black/25 px-3 py-1 text-xs text-stone-300">
                {formatTime(selectedSignal.createdAt)}
              </span>
            </div>

            {(selectedSignal.trapStatus || selectedSignal.scoreRealityStatus) && (
              <div className="mb-4 rounded-xl border border-accent/25 bg-accent/10 p-4">
                <p className="text-[11px] uppercase tracking-[0.22em] text-accent-200/70">
                  Agent verdict
                </p>
                <h3 className="mt-1 text-lg font-black text-white">
                  {selectedSignal.scoreRealityStatus === "REJECTED_BY_SCORE" &&
                  selectedSignal.trapStatus === "OUTCOME_REJECTED_MOVE"
                    ? "Market move rejected by outcome"
                    : selectedSignal.scoreRealityStatus === "CONFIRMED_BY_SCORE"
                      ? "Market move validated"
                      : selectedSignal.trapStatus === "POSSIBLE_TRAP"
                        ? "Possible trap under review"
                        : "Market move under review"}
                </h3>
                <p className="mt-2 text-xs leading-5 text-stone-300">
                  {selectedSignal.scoreRealityStatus === "REJECTED_BY_SCORE"
                    ? "GoalPulse compared the odds movement against the final score and found that reality did not confirm the market move."
                    : selectedSignal.scoreRealityStatus === "CONFIRMED_BY_SCORE"
                      ? "GoalPulse compared the odds movement against the final score and found that the result confirmed the market move."
                      : "GoalPulse is still tracking this movement until enough outcome evidence is available."}
                </p>
              </div>
            )}
            {(selectedSignal.trapStatus || selectedSignal.reversalRisk || selectedSignal.scoreRealityStatus) && (
              <div className="mb-4 rounded-xl border border-border bg-black/25 p-4">
                <p className="text-[11px] uppercase tracking-[0.22em] text-stone-400">
                  Autonomous decision chain
                </p>

                <div className="mt-3 grid gap-2 text-xs text-stone-300">
                  <div className="rounded-xl bg-black/25 p-3">
                    <span className="font-semibold text-white">1. Market movement detected:</span>{" "}
                    {formatOdds(selectedSignal.oddsBefore)} moved to {formatOdds(selectedSignal.oddsAfter)} for {getSignalTarget(selectedSignal)}.
                  </div>

                  <div className="rounded-xl bg-black/25 p-3">
                    <span className="font-semibold text-white">2. Trap detector:</span>{" "}
                    {(selectedSignal.trapStatus ?? "WATCHING").replaceAll("_", " ")}
                    {typeof selectedSignal.trapScore === "number" ? ` · score ${selectedSignal.trapScore}` : ""}
                  </div>

                  <div className="rounded-xl bg-black/25 p-3">
                    <span className="font-semibold text-white">3. Reversal radar:</span>{" "}
                    {(selectedSignal.reversalRisk ?? "REVERSAL_SCAN").replaceAll("_", " ")}
                  </div>

                  <div className="rounded-xl bg-black/25 p-3">
                    <span className="font-semibold text-white">4. Score reality:</span>{" "}
                    {(selectedSignal.scoreRealityStatus ?? "WAITING_FOR_FINAL_SCORE").replaceAll("_", " ")}
                    {selectedSignal.finalScore ? ` · ${selectedSignal.finalScore}` : ""}
                  </div>

                  <div className="rounded-xl bg-black/25 p-3">
                    <span className="font-semibold text-white">5. Final verdict:</span>{" "}
                    {selectedSignal.scoreRealityStatus === "REJECTED_BY_SCORE" &&
                    selectedSignal.trapStatus === "OUTCOME_REJECTED_MOVE"
                      ? "Market move rejected by outcome"
                      : selectedSignal.scoreRealityStatus === "CONFIRMED_BY_SCORE"
                        ? "Market move validated"
                        : "Market move under review"}
                  </div>
                </div>
              </div>
            )}
            <div className="mb-4 rounded-xl border border-info/15 bg-info/10 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.2em] text-info-200/70">
                    How to read this signal
                  </p>
                  <h3 className="mt-1 text-sm font-semibold text-white">
                    The agent detected a meaningful odds movement for {getSignalTarget(selectedSignal)}.
                  </h3>
                </div>
                <span className="rounded-full bg-black/25 px-2.5 py-1 text-[10px] font-semibold text-info-100">
                  Analytics only
                </span>
              </div>

              <p className="mt-3 text-xs leading-5 text-stone-300">
                Previous odds were <span className="font-semibold text-white">{formatOdds(selectedSignal.oddsBefore)}</span>, then moved to{" "}
                <span className="font-semibold text-white">{formatOdds(selectedSignal.oddsAfter)}</span>. That creates a{" "}
                <span className="font-semibold text-info-100">{formatOddsChange(selectedSignal.oddsChangePct)}</span> movement, which crossed the
                configured signal threshold. This does not recommend a bet; it explains what changed in the market and why the agent flagged it.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <DetailRow
                label="Match"
                value={
                  selectedSignalMatch
                    ? `${selectedSignalMatch.homeTeam} vs ${selectedSignalMatch.awayTeam}`
                    : selectedSignal.match ?? selectedSignal.matchId ?? "Unknown match"
                }
              />
              <DetailRow
                label="Target"
                value={getSignalTarget(selectedSignal)}
              />
              <DetailRow
                label="Previous odds"
                value={formatOdds(selectedSignal.oddsBefore)}
              />
              <DetailRow
                label="Current odds"
                value={formatOdds(selectedSignal.oddsAfter)}
              />
              <DetailRow
                label="Odds compression"
                value={formatOddsChange(selectedSignal.oddsChangePct)}
              />
              <DetailRow
                label="Momentum score"
                value={`${Math.round(
                  selectedSignal.momentumScore ?? selectedSignal.confidence ?? 0
                )}`}
              />
              <DetailRow
                label="Threshold"
                value={getThresholdLabel(selectedSignal)}
              />
              <DetailRow
                label="Outcome"
                value={getSignalOutcome(selectedSignal)}
              />
            </div>

            {selectedSignal.trapStatus && (
              <div className="mt-4 rounded-xl border border-danger/20 bg-danger/10 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.2em] text-danger-200/70">
                      Failed Continuation Assessment
                    </p>
                    <h3 className="mt-1 text-sm font-semibold text-white">
                      {selectedSignal.trapStatus.replaceAll("_", " ")}
                    </h3>
                  </div>
                  <span className="rounded-full bg-black/25 px-2.5 py-1 text-[10px] font-semibold text-danger-100">
                    Reversal score {selectedSignal.trapScore ?? 0}
                  </span>
                </div>

                <p className="mt-3 text-xs leading-5 text-stone-300">
                  {selectedSignal.trapReason ??
                    "GoalPulse reviewed this odds move against the final result to detect whether the market movement was confirmed or rejected."}
                </p>
              </div>
            )}
            {selectedSignal.reversalRisk && (
              <div className="mt-4 rounded-xl border border-proof/20 bg-proof/10 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.2em] text-proof-200/70">
                      Market Reversal Radar
                    </p>
                    <h3 className="mt-1 text-sm font-semibold text-white">
                      {selectedSignal.reversalRisk.replaceAll("_", " ")}
                    </h3>
                  </div>
                  <span className="rounded-full bg-black/25 px-2.5 py-1 text-[10px] font-semibold text-proof-100">
                    Reversal scan
                  </span>
                </div>

                <p className="mt-3 text-xs leading-5 text-stone-300">
                  {selectedSignal.reversalReason ??
                    "GoalPulse checks whether the odds move became overextended or failed final-result confirmation."}
                </p>
              </div>
            )}
            {selectedSignal.scoreRealityStatus && (
              <div className="mt-4 rounded-xl border border-warning/20 bg-warning/10 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.2em] text-warning-200/70">
                      Score Reality Check
                    </p>
                    <h3 className="mt-1 text-sm font-semibold text-white">
                      {selectedSignal.scoreRealityStatus.replaceAll("_", " ")}
                    </h3>
                  </div>
                  <span className="rounded-full bg-black/25 px-2.5 py-1 text-[10px] font-semibold text-warning-100">
                    {selectedSignal.finalScore ?? "Final score pending"}
                  </span>
                </div>

                <p className="mt-3 text-xs leading-5 text-stone-300">
                  {selectedSignal.scoreRealityReason ??
                    "GoalPulse compares the odds movement against the final score to check if the market move was confirmed by reality."}
                </p>
              </div>
            )}
            <div className="mt-4 rounded-xl bg-black/25 p-4">
              <p className="text-[11px] text-stone-500">Agent explanation</p>
              <p className="mt-2 text-sm leading-6 text-stone-200">
                {selectedSignal.explanation ??
                  selectedSignal.reason ??
                  "The agent detected meaningful market movement based on the current odds snapshot and prior movement history."}
              </p>
            </div>

            <div className="mt-4 rounded-xl border border-positive/15 bg-positive/10 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] text-positive-200/80">Confidence explanation</p>
                  <h3 className="mt-1 text-sm font-semibold text-white">
                    Why the agent trusted this signal
                  </h3>
                </div>
                <span className="rounded-full bg-black/25 px-3 py-1 text-[11px] text-positive-100">
                  Explainable signal
                </span>
              </div>

              <div className="mt-3 grid gap-2 text-xs text-stone-300">
                <div className="rounded-xl bg-black/20 p-3">
                  <span className="font-semibold text-positive-200">+ Compression rule:</span>{" "}
                  Odds movement reached {formatOddsChange(selectedSignal.oddsChangePct)}, so the
                  signal crossed the configured trigger level.
                </div>

                <div className="rounded-xl bg-black/20 p-3">
                  <span className="font-semibold text-positive-200">+ Momentum weight:</span>{" "}
                  Momentum score registered at{" "}
                  {Math.round(selectedSignal.momentumScore ?? selectedSignal.confidence ?? 0)},
                  giving the agent enough strength to classify the move.
                </div>

                <div className="rounded-xl bg-black/20 p-3">
                  <span className="font-semibold text-positive-200">+ Target tracked:</span>{" "}
                  The agent attached the movement to {getSignalTarget(selectedSignal)} instead of
                  creating a generic market alert.
                </div>

                <div className="rounded-xl bg-black/20 p-3">
                  <span className="font-semibold text-positive-200">+ Audit status:</span>{" "}
                  Current outcome is {getSignalOutcome(selectedSignal)}, so the signal can be
                  reviewed after the market closes.
                </div>
              </div>
            </div>
            <div className="mt-4 rounded-xl border border-accent/20 bg-accent/10 p-4">
              <p className="text-[11px] text-accent-200/80">Decision path</p>
              <ol className="mt-2 space-y-2 text-xs leading-5 text-stone-300">
                <li>1. Agent received a new match and odds snapshot.</li>
                <li>
                  2. It compared previous odds{" "}
                  <span className="font-semibold text-white">
                    {formatOdds(selectedSignal.oddsBefore)}
                  </span>{" "}
                  against current odds{" "}
                  <span className="font-semibold text-white">
                    {formatOdds(selectedSignal.oddsAfter)}
                  </span>.
                </li>
                <li>
                  3. Odds compression reached{" "}
                  <span className="font-semibold text-accent-100">
                    {formatOddsChange(selectedSignal.oddsChangePct)}
                  </span>.
                </li>
                <li>
                  4. {getThresholdLabel(selectedSignal)}.
                </li>
                <li>
                  5. Agent classified the signal as{" "}
                  <span className="font-semibold text-white">
                    {signalTypeLabel(getSignalType(selectedSignal))}
                  </span>.
                </li>
                <li>
                  6. Evaluation status:{" "}
                  <span className="font-semibold text-positive-200">
                    {getSignalOutcome(selectedSignal)}
                  </span>.
                </li>
              </ol>
            </div>

            <div className="mt-4 rounded-xl border border-info/15 bg-info/5 p-4">
              <p className="text-[11px] text-info-200/80">Historical precedent</p>
              <h3 className="mt-1 text-sm font-semibold text-white">Similar past signals</h3>

              {isSimilarSignalsLoading ? (
                <p className="mt-3 text-xs text-stone-400">Checking historical precedent...</p>
              ) : !similarSignals || similarSignals.count < 3 ? (
                <p className="mt-3 text-xs text-stone-400">Not enough similar past signals yet.</p>
              ) : (
                <>
                  <p className="mt-2 text-xs leading-5 text-stone-300">
                    {similarSignals.correctCount} of {similarSignals.count} similar past signals
                    resolved correct ({similarSignals.accuracyPct}%).
                  </p>

                  <div className="mt-3 space-y-2">
                    {similarSignals.signals.map((entry, index) => (
                      <div
                        key={`${entry.matchId ?? "match"}-${index}`}
                        className="flex items-center justify-between gap-3 rounded-xl bg-black/25 p-3 text-xs"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-stone-100">
                            Match {entry.matchId ?? "Unknown"}
                          </p>
                          <p className="mt-0.5 text-stone-500">
                            {formatOddsChange(entry.oddsChangePct)} compression ·{" "}
                            {entry.fieldPressureScore != null
                              ? `${entry.fieldPressureScore} field pressure`
                              : "no field pressure"}{" "}
                            · {formatTime(entry.archivedAt)}
                          </p>
                        </div>

                        <span
                          className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${
                            entry.resultStatus === "correct"
                              ? "border-positive/30 bg-positive/10 text-positive-200"
                              : "border-danger/30 bg-danger/10 text-danger-200"
                          }`}
                        >
                          {(entry.resultStatus ?? "unknown").toUpperCase()}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default App;
