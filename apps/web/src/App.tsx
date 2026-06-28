import { useEffect, useMemo, useRef, useState } from "react";
import { SignalIntelligencePanel } from "./components/SignalIntelligencePanel";
import {
  BarChart3,
  Bot,
  ChevronDown,
  Gauge,
  LayoutDashboard,
  Radio,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
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

type Odds = {
  homeOdds?: number;
  drawOdds?: number;
  awayOdds?: number;
};

type Match = {
  id: string;
  homeTeam?: string;
  awayTeam?: string;
  homeScore?: number;
  awayScore?: number;
  minute?: number;
  status?: string;
  market?: Odds;
  odds?: Odds;
};

type AgentSignal = {
  id?: string;
  matchId?: string;
  match?: string;
  team?: string;
  target?: string;
  side?: string;
  type?: string;
  signalType?: string;
  severity?: string;
  oddsBefore?: number;
  oddsAfter?: number;
  oddsChangePct?: number;
  momentumScore?: number;
  confidence?: number;
  explanation?: string;
  reason?: string;
  createdAt?: string;
  resultStatus?: string;
};

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
  homeOdds?: number;
  drawOdds?: number;
  awayOdds?: number;
  market?: Odds;
};
type ReplayBacktest = {
  datasetId?: string;
  mode?: string;
  status?: string;
  summary?: {
    snapshotsProcessed?: number;
    signalsDetected?: number;
    correctSignals?: number;
    incorrectSignals?: number;
    accuracyPct?: number;
  };
  timeline?: {
    step?: string;
    detail?: string;
  }[];
  events?: {
    id?: string;
    matchId?: string;
    minute?: number;
    team?: string;
    type?: string;
    description?: string;
    createdAt?: string;
  }[];
  signals?: AgentSignal[];
  councilVotes?: {
    signalId?: string;
    matchId?: string;
    target?: string;
    decision?: string;
    approvals?: number;
    totalAgents?: number;
    votes?: {
      agent?: string;
      vote?: string;
      reason?: string;
    }[];
  }[];
  proof?: {
    type?: string;
    hash?: string;
    network?: string;
    anchoringStatus?: string;
    walletConfigured?: boolean;
    transactionSignature?: string | null;
    explorerUrl?: string | null;
    note?: string;
  };
};

type Health = {
  ok?: boolean;
  agentIntervalMs?: number;
  useSimulatedFeed?: boolean;
};

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "https://goalpulse-agent-api.onrender.com";

async function request<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`);

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
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

function formatNumber(value?: number) {
  if (value === undefined || Number.isNaN(value)) return "0";
  return value.toLocaleString();
}

function formatPercent(value?: number) {
  if (value === undefined || Number.isNaN(value)) return "0%";
  return `${Math.round(value)}%`;
}

function formatOdds(value?: number) {
  if (value === undefined || Number.isNaN(value)) return "--";
  return value.toFixed(2);
}

function formatTime(value?: string) {
  if (!value) return "Waiting";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Waiting";

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getOdds(match?: Match) {
  return match?.market ?? match?.odds ?? {};
}

function severityStyle(severity?: string) {
  const value = (severity ?? "LOW").toUpperCase();

  if (value === "HIGH") return "bg-red-500/15 text-red-200 border-red-400/20";
  if (value === "MEDIUM") return "bg-orange-500/15 text-orange-200 border-orange-400/20";

  return "bg-emerald-500/15 text-emerald-200 border-emerald-400/20";
}

function statusLabel(status?: string) {
  if (!status) return "WAITING";
  return status.toUpperCase();
}

function signalTypeLabel(type?: string) {
  return (type ?? "WATCH").replaceAll("_", " ");
}

function getSignalType(signal?: AgentSignal | null) {
  return signal?.type ?? signal?.signalType ?? "WATCH";
}

function getSignalTarget(signal?: AgentSignal | null) {
  return signal?.team ?? signal?.target ?? signal?.side ?? "Market side";
}

function formatOddsChange(value?: number) {
  if (value === undefined || Number.isNaN(value)) return "Calculated by engine";
  return `${value.toFixed(2)}%`;
}

function getThresholdLabel(signal?: AgentSignal | null) {
  const severity = (signal?.severity ?? "LOW").toUpperCase();

  if (severity === "HIGH") return "Sharp movement threshold crossed: >= 15%";
  if (severity === "MEDIUM") return "Momentum shift threshold crossed: >= 8%";

  return "Watch threshold crossed: >= 4%";
}

function getSignalOutcome(signal?: AgentSignal | null) {
  return (signal?.resultStatus ?? "pending").toUpperCase();
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl bg-black/25 p-3">
      <p className="text-[11px] text-stone-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-stone-100">{value}</p>
    </div>
  );
}

function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [signals, setSignals] = useState<AgentSignal[]>([]);
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [stats, setStats] = useState<AgentStats | null>(null);
  const [oddsHistory, setOddsHistory] = useState<OddsSnapshot[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState("");
  const [selectedSignal, setSelectedSignal] = useState<AgentSignal | null>(null);
  const [activeSection, setActiveSection] = useState("overview");
  const [searchTerm, setSearchTerm] = useState("");
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [replayStep, setReplayStep] = useState(-1);
  const [isJudgeMode, setIsJudgeMode] = useState(false);
  const [judgeStep, setJudgeStep] = useState(0);
  const [guidePanelPosition, setGuidePanelPosition] = useState({ top: 16, left: 16 });
  const [lastRefresh, setLastRefresh] = useState("");
  const [isConnecting, setIsConnecting] = useState(true);
  const [error, setError] = useState("");
  const [replayBacktest, setReplayBacktest] = useState<ReplayBacktest | null>(null);
  const [isReplayRunning, setIsReplayRunning] = useState(false);
  const hasLoadedOnceRef = useRef(false);

  const judgeDemoSteps = [
    {
      title: "1. Dashboard overview",
      detail: "Start with the live autonomous odds intelligence dashboard, agent status, key metrics, and search.",
    },
    {
      title: "2. Odds movement chart",
      detail: "This chart visualizes home and away odds movement with signal markers placed on meaningful shifts.",
    },
    {
      title: "3. Market board",
      detail: "Live matches are normalized here with home, draw, and away odds for quick market scanning.",
    },
    {
      title: "4. Latest signals",
      detail: "The signal engine lists detected odds movements, severity, explanation, and detail entry points.",
    },
    {
      title: "5. Outcome verification",
      detail: "Signals are audited after detection so judges can see before odds, after odds, move size, and proof preview.",
    },
    {
      title: "6. Selected match pressure",
      detail: "The selected match card summarizes the current match and converts signal momentum into market pressure.",
    },
    {
      title: "7. Agent timeline",
      detail: "This shows the autonomous flow: feed ingestion, snapshot creation, signal execution, and outcome review.",
    },
    {
      title: "8. Historical backtest",
      detail: "Run a saved World Cup replay through the same deterministic engine to prove the logic works offline.",
    },
    {
      title: "9. Event correlation",
      detail: "The replay connects odds movement with match events like shots, goals, and sustained attacking pressure.",
    },
    {
      title: "10. Oracle council",
      detail: "Agent A, Agent B, and Agent C vote before a replay signal is approved.",
    },
    {
      title: "11. Proof readiness",
      detail: "The replay result generates a SHA-256 proof hash with Solana devnet anchoring readiness.",
    },
    {
      title: "12. Signal thresholds",
      detail: "These rules explain the deterministic thresholds used by the signal engine.",
    },
    {
      title: "13. Compliance boundary",
      detail: "GoalPulse is analytics-only: no wagers, no custody, no trading execution, and no illegal betting facilitation.",
    },
  ];
  const outcomeVerificationItems = useMemo(() => {
    const replayItems =
      replayBacktest?.signals?.map((signal) => ({
        signal,
        source: "Historical replay",
        proofHash: replayBacktest.proof?.hash,
      })) ?? [];

    const liveItems = signals.slice(0, 4).map((signal) => ({
      signal,
      source: "Live monitor",
      proofHash: undefined,
    }));

    return [...replayItems, ...liveItems].slice(0, 5);
  }, [signals, replayBacktest]);
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
  const guideTargets = [
    { id: "overview", text: "GoalPulse Agent" },
    { text: "Selected market" },
    { text: "Market board" },
    { id: "agent", text: "Latest signals" },
    { text: "Outcome verification" },
    { text: "Selected match" },
    { text: "Agent timeline" },
    { id: "guide-backtest-card", text: "Backtest mode" },
    { id: "guide-event-correlation", text: "Event correlation" },
    { id: "guide-oracle-council", text: "Oracle council" },
    { id: "guide-proof-readiness", text: "Proof network" },
    { text: "Signal thresholds" },
    { id: "compliance", text: "Analytics only" },
  ];

  const guideSpotlightClasses = [
    "relative",
    "z-[60]",
    "scale-[1.01]",
    "ring-2",
    "ring-orange-400/70",
    "shadow-2xl",
    "shadow-orange-500/30",
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
        className.includes("rounded-[24px]") ||
        className.includes("rounded-[28px]") ||
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

    if (nextStep >= 8 && nextStep <= 10 && !replayBacktest) {
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

      const [healthPayload, matchesPayload, signalsPayload, runsPayload, statsPayload] =
        await Promise.all([
          request<Health>("/health"),
          request<unknown>("/api/matches"),
          request<unknown>("/api/signals"),
          request<unknown>("/api/agent-runs"),
          request<AgentStats>("/api/stats"),
        ]);

      const matchList = asArray<Match>(matchesPayload, ["matches", "data"]);
      const signalList = asArray<AgentSignal>(signalsPayload, ["signals", "data"]);
      const runList = asArray<AgentRun>(runsPayload, ["runs", "agentRuns", "data"]);

      const activeMatchId = selectedMatchId || matchList[0]?.id || "";

      setHealth(healthPayload);
      setMatches(matchList);
      setSignals(signalList);
      setRuns(runList);
      setStats(statsPayload);
      setSelectedMatchId(activeMatchId);

      if (activeMatchId) {
        const oddsPayload = await request<unknown>(
          `/api/odds-history?matchId=${activeMatchId}`
        );

        setOddsHistory(asArray<OddsSnapshot>(oddsPayload, ["history", "snapshots", "data"]));
      }

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
  }, [selectedMatchId]);

  function goToSection(sectionId: string) {
    setActiveSection(sectionId);
    document.getElementById(sectionId)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  const selectedMatch = useMemo(
    () => matches.find((match) => match.id === selectedMatchId) ?? matches[0],
    [matches, selectedMatchId]
  );

  const selectedSignalMatch = useMemo(
    () => matches.find((match) => match.id === selectedSignal?.matchId),
    [matches, selectedSignal]
  );
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

  const filteredMatches = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    if (!query) return matches;

    return matches.filter((match) =>
      `${match.homeTeam ?? ""} ${match.awayTeam ?? ""} ${match.status ?? ""}`
        .toLowerCase()
        .includes(query)
    );
  }, [matches, searchTerm]);

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

  const chartData = useMemo(
    () =>
      oddsHistory.slice(-18).map((snapshot, index) => {
        const odds = snapshot.market ?? snapshot;

        return {
          name: snapshot.timestamp ? formatTime(snapshot.timestamp) : `${index + 1}`,
          rawTimestamp: snapshot.timestamp ?? "",
          home: odds.homeOdds,
          draw: odds.drawOdds,
          away: odds.awayOdds,
        };
      }),
    [oddsHistory]
  );
  const chartSignalMarkers = useMemo(() => {
    if (!selectedMatch || chartData.length === 0) return [];

    const relatedSignals = signals.filter((signal) => signal.matchId === selectedMatch.id);

    return relatedSignals.slice(0, 3).map((signal, index) => {
      const side = (signal.side ?? "").toLowerCase();
      const dataKey = side === "away" ? "away" : "home";
      const fallbackPoint = chartData[Math.max(chartData.length - 1 - index * 3, 0)];

      const nearestPoint =
        chartData.find((point) => {
          if (!point.rawTimestamp || !signal.createdAt) return false;

          return formatTime(point.rawTimestamp) === formatTime(signal.createdAt);
        }) ?? fallbackPoint;

      return {
        id: signal.id ?? `${signal.matchId}-${index}`,
        x: nearestPoint.name,
        y: Number(signal.oddsAfter ?? nearestPoint[dataKey]),
        dataKey,
        label: signalTypeLabel(getSignalType(signal)),
      };
    });
  }, [selectedMatch, chartData, signals]);
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
        detail: `${stats?.correctSignals ?? 0} correct • ${stats?.incorrectSignals ?? 0} incorrect`,
        time: runTime,
      },
    ];
  }, [runs, signals, matches.length, stats]);

  return (
    <main className="min-h-screen bg-[#0b0806] p-3 text-stone-100">
      {isJudgeMode && (
        <div className="fixed inset-0 z-40 bg-black/55 backdrop-blur-[2px] transition-opacity duration-500 pointer-events-none" />
      )}

      <button
        onClick={startGuideTour}
        className="fixed bottom-4 right-4 z-[80] rounded-full border border-orange-400/30 bg-orange-500 px-4 py-2 text-xs font-bold text-white shadow-2xl shadow-orange-500/25 transition hover:bg-orange-400"
      >
        Guide
      </button>

      {isJudgeMode && (
        <div
          data-guide-panel="true"
          className="fixed z-[70] w-[340px] rounded-[26px] border border-orange-400/30 bg-[#15100c]/95 p-4 shadow-2xl shadow-orange-500/20 backdrop-blur-xl ring-1 ring-white/10 transition-[top,left,transform] duration-500"
          style={{
            top: guidePanelPosition.top,
            left: guidePanelPosition.left,
          }}
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.24em] text-orange-200/70">
                Guided tour
              </p>
              <h2 className="mt-1 text-sm font-semibold text-white">
                GoalPulse guided tour
              </h2>
            </div>
            <span className="rounded-full bg-orange-400/10 px-2.5 py-1 text-[10px] font-semibold text-orange-200">
              {judgeStep + 1}/{judgeDemoSteps.length}
            </span>
          </div>

          <div className="rounded-2xl border border-orange-400/15 bg-black/30 p-3 shadow-inner">
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
                  index <= judgeStep ? "bg-orange-400" : "bg-white/10"
                }`}
              />
            ))}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              onClick={skipGuideTour}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-[11px] font-medium text-stone-300 transition hover:bg-white/10 hover:text-white"
            >
              Skip
            </button>
            <button
              onClick={nextGuideStep}
              className="rounded-full border border-orange-400/30 bg-orange-500 px-3 py-2 text-[11px] font-bold text-white transition hover:bg-orange-400"
            >
              {judgeStep + 1 >= judgeDemoSteps.length ? "Finish" : "Next"}
            </button>
          </div>
        </div>
      )}
      <div className="mx-auto grid max-w-[1380px] grid-cols-[70px_minmax(0,1fr)_300px] gap-4">
        <aside className="sticky top-3 h-[calc(100vh-24px)] rounded-[26px] border border-white/10 bg-[#15100c] p-3">
          <div className="mb-7 flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500 text-lg font-black text-[#07100b]">
            GP
          </div>

          <nav className="space-y-2">
            <button
              onClick={() => goToSection("overview")}
              title="Overview"
              className={`flex h-11 w-11 items-center justify-center rounded-2xl transition-all duration-300 ${
                activeSection === "overview"
                  ? "bg-orange-500 text-white scale-105 shadow-lg shadow-orange-500/30"
                  : "text-stone-500 hover:bg-white/8 hover:text-white"
              }`}
            >
              <LayoutDashboard className="h-5 w-5" />
            </button>

            <button
              onClick={() => goToSection("markets")}
              title="Markets"
              className={`flex h-11 w-11 items-center justify-center rounded-2xl transition-all duration-300 ${
                activeSection === "markets"
                  ? "bg-orange-500 text-white scale-105 shadow-lg shadow-orange-500/30"
                  : "text-stone-500 hover:bg-white/8 hover:text-white"
              }`}
            >
              <BarChart3 className="h-5 w-5" />
            </button>

            <button
              onClick={() => goToSection("agent")}
              title="Agent"
              className={`flex h-11 w-11 items-center justify-center rounded-2xl transition-all duration-300 ${
                activeSection === "agent"
                  ? "bg-orange-500 text-white scale-105 shadow-lg shadow-orange-500/30"
                  : "text-stone-500 hover:bg-white/8 hover:text-white"
              }`}
            >
              <Bot className="h-5 w-5" />
            </button>

            <button
              onClick={() => goToSection("compliance")}
              title="Compliance"
              className={`flex h-11 w-11 items-center justify-center rounded-2xl transition-all duration-300 ${
                activeSection === "compliance"
                  ? "bg-orange-500 text-white scale-105 shadow-lg shadow-orange-500/30"
                  : "text-stone-500 hover:bg-white/8 hover:text-white"
              }`}
            >
              <ShieldCheck className="h-5 w-5" />
            </button>
          </nav>

          <div className="absolute bottom-4 left-3">
            <button
              onClick={loadDashboard}
              title="Refresh data"
              className="flex h-11 w-11 items-center justify-center rounded-2xl text-stone-500 hover:bg-white/8 hover:text-white"
            >
              <RefreshCw className="h-5 w-5" />
            </button>
          </div>
        </aside>

        <section className="space-y-4">
          <header className="flex items-center justify-between rounded-[28px] border border-white/10 bg-[#15100c] px-5 py-4">
            <div className="flex min-w-[320px] items-center gap-3 rounded-2xl bg-black/25 px-4 py-3 text-sm text-stone-400">
              <Search className="h-4 w-4" />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="w-full bg-transparent text-sm text-stone-200 outline-none placeholder:text-stone-500"
                placeholder="Search matches, signals, odds movement"
              />
            </div>

            <div className="flex items-center gap-3">
              <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-xs font-medium text-emerald-200">
                {isConnecting ? "Connecting agent" : "Agent running"}
              </span>

              <span className="rounded-full border border-orange-400/20 bg-orange-400/10 px-3 py-2 text-xs font-medium text-orange-200">
                {isConnecting
                  ? "Waking backend"
                  : health === null
                    ? "Connecting"
                    : health.useSimulatedFeed
                      ? "Sandbox feed"
                      : "Real TxLINE feed"}
              </span>
              <span className="rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-2 text-xs font-medium text-sky-200">
                TxLINE-ready
              </span>

              <span className="rounded-full border border-white/10 bg-black/25 px-3 py-2 text-xs text-stone-400">
                Updated {lastRefresh || "waiting"}
              </span>

              <div className="relative">
                <button
                  onClick={() => setIsProfileOpen((value) => !value)}
                  className="flex items-center gap-3 rounded-2xl bg-black/25 px-3 py-2"
                >
                  <div className="h-8 w-8 rounded-full bg-gradient-to-br from-orange-300 to-emerald-400" />
                  <div className="text-left">
                    <p className="text-xs font-semibold text-white">GoalPulse</p>
                    <p className="text-[11px] text-stone-500">Hackathon build</p>
                  </div>
                  <ChevronDown className="h-4 w-4 text-stone-500" />
                </button>

                {isProfileOpen && (
                  <div className="absolute right-0 top-12 z-20 w-56 rounded-2xl border border-white/10 bg-[#15100c] p-3 shadow-2xl shadow-black/40">
                    <p className="text-xs font-semibold text-white">GoalPulse Agent</p>
                    <p className="mt-1 text-[11px] leading-4 text-stone-500">
                      TxLINE-ready autonomous odds intelligence dashboard.
                    </p>
                    <div className="mt-3 space-y-2 rounded-xl border border-white/10 bg-black/20 p-3 text-[11px]">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-stone-500">Feed mode</span>
                        <span className="font-medium text-orange-200">
                          {health?.useSimulatedFeed ? "Sandbox" : "Live"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-stone-500">Adapter</span>
                        <span className="font-medium text-sky-200">TxLINE-ready</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-stone-500">Schema</span>
                        <span className="font-medium text-emerald-200">Compatible</span>
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
              className={`rounded-2xl border px-4 py-3 text-sm ${
                error
                  ? "border-red-400/20 bg-red-500/10 text-red-200"
                  : "border-orange-400/20 bg-orange-400/10 text-orange-100"
              }`}
            >
              {error
                ? `Connection issue: ${error}`
                : "Connecting to the autonomous agent. If the backend is waking up, this may take a few seconds."}
            </div>
          )}

                                                            <section
            id="overview"
            className={`scroll-mt-4 rounded-[28px] border p-1.5 transition-all duration-500 ${
              activeSection === "overview"
                ? "border-orange-400/40 bg-orange-400/5 shadow-[0_0_28px_rgba(251,146,60,0.10)]"
                : "border-transparent"
            }`}
          >
            <div className="rounded-[26px] border border-white/10 bg-[#15100c] p-4">
              <div className="mb-3 flex items-center justify-between gap-4">
                <div>
                  <p className="text-[11px] text-stone-500">Autonomous odds intelligence</p>
                  <h1 className="mt-0.5 text-2xl font-semibold tracking-tight text-white">
                    GoalPulse Agent
                  </h1>
                </div>

                <div className="flex items-center gap-2">
                  <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2">
                    <p className="text-[10px] text-stone-500">Updates</p>
                    <p className="text-lg font-semibold text-white">
                      {formatNumber(stats?.txlineUpdates)}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2">
                    <p className="text-[10px] text-stone-500">Signals</p>
                    <p className="text-lg font-semibold text-white">
                      {formatNumber(stats?.signalsGenerated)}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2">
                    <p className="text-[10px] text-stone-500">Accuracy</p>
                    <p className="text-lg font-semibold text-white">
                      {formatPercent(stats?.strategyAccuracy)}
                    </p>
                  </div>

                  <div className="rounded-2xl bg-black/25 px-3 py-2 text-right">
                    <p className="text-[10px] text-stone-500">Backend</p>
                    <p className="text-xs font-semibold text-emerald-200">
                      {health?.ok ? "Online" : "Checking"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="overflow-hidden rounded-[26px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(251,146,60,0.22),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.055),rgba(0,0,0,0.18))] p-4">
                <div className="mb-3 flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs text-stone-400">Selected market</p>
                    <div className="mt-1 flex items-end gap-3">
                      <p className="text-3xl font-semibold tracking-tight text-white">
                        {formatOdds(chartData[chartData.length - 1]?.home)}
                      </p>
                      <span className="mb-1 rounded-full bg-emerald-400/10 px-2.5 py-1 text-xs font-medium text-emerald-300">
                        Home odds
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-stone-500">
                      {selectedMatch
                        ? `${selectedMatch.homeTeam} vs ${selectedMatch.awayTeam}`
                        : "Waiting for match selection"}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 text-[10px]">
                    <span className="rounded-full bg-white/8 px-3 py-1.5 text-stone-300">
                      1 min
                    </span>
                    <span className="rounded-full bg-orange-400/15 px-3 py-1.5 text-orange-100">
                      5 min
                    </span>
                    <span className="rounded-full bg-white/8 px-3 py-1.5 text-stone-300">
                      15 min
                    </span>
                    <span className="rounded-full bg-white/8 px-3 py-1.5 text-stone-300">
                      Live
                    </span>
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
                            <stop offset="0%" stopColor="#fb923c" stopOpacity={0.78} />
                            <stop offset="45%" stopColor="#fb923c" stopOpacity={0.28} />
                            <stop offset="100%" stopColor="#fb923c" stopOpacity={0.02} />
                          </linearGradient>
                          <linearGradient id="referenceAway" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#34d399" stopOpacity={0.30} />
                            <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
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
                        />

                        <Tooltip
                          cursor={{
                            stroke: "rgba(255,255,255,0.35)",
                            strokeWidth: 1,
                          }}
                          formatter={(value) => Number(value).toFixed(2)}
                          contentStyle={{
                            background: "rgba(255,255,255,0.96)",
                            border: "0",
                            borderRadius: "14px",
                            color: "#111827",
                            boxShadow: "0 18px 50px rgba(0,0,0,0.35)",
                            fontSize: "12px",
                          }}
                          labelStyle={{ color: "#111827", fontWeight: 700 }}
                        />

                        <Area
                          type="monotone"
                          dataKey="home"
                          stroke="#fb923c"
                          strokeWidth={2.8}
                          fill="url(#referenceHome)"
                          dot={false}
                          activeDot={{ r: 5, strokeWidth: 2 }}
                          isAnimationActive={false}
                          name="Home odds"
                        />

                        <Area
                          type="monotone"
                          dataKey="away"
                          stroke="#34d399"
                          strokeWidth={2}
                          fill="url(#referenceAway)"
                          dot={false}
                          activeDot={{ r: 4 }}
                          isAnimationActive={false}
                          name="Away odds"
                        />
                        {chartSignalMarkers.map((marker) => (
                          <ReferenceDot
                            key={marker.id}
                            x={marker.x}
                            y={marker.y}
                            r={5}
                            stroke="#fff7ed"
                            strokeWidth={2}
                            fill={marker.dataKey === "away" ? "#34d399" : "#fb923c"}
                            label={{
                              value: "Signal",
                              position: "top",
                              fill: "#fed7aa",
                              fontSize: 10,
                            }}
                          />
                        ))}

                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-full items-center justify-center rounded-3xl bg-black/25 text-sm text-stone-500">
                      Waiting for odds history
                    </div>
                  )}
                </div>

                <div className="mt-3 flex items-center justify-between gap-4">
                  <div className="flex flex-1 items-center gap-2">
                    <div className="h-2 flex-1 rounded-full bg-white/8">
                      <div className="h-2 w-[72%] rounded-full bg-gradient-to-r from-orange-500 to-emerald-400" />
                    </div>
                    <span className="text-[10px] text-stone-500">Live odds stream</span>
                  </div>

                  <div className="flex gap-4 text-[11px] text-stone-400">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-orange-400" />
                      Home
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-emerald-400" />
                      Away
                    </span>
                                        <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full border border-orange-100 bg-orange-400" />
                      Signal marker
                    </span>
                    <span>{(stats?.correctSignals ?? 0)} correct • {(stats?.closedSignals ?? 0)} closed</span>
                  </div>
                </div>
              </div>
            </div>
          </section>
          <section id="markets" className="scroll-mt-4 grid grid-cols-2 gap-3">
            <div
              className={`rounded-[24px] border p-4 transition-all duration-500 ${
                activeSection === "markets"
                  ? "border-orange-400/50 bg-orange-400/10 shadow-[0_0_35px_rgba(251,146,60,0.16)]"
                  : "border-white/10 bg-[#15100c]"
              }`}
            >
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-xs text-stone-500">Live matches</p>
                  <h2 className="text-xl font-semibold">Market board</h2>
                </div>
                <Radio className="h-4 w-4 text-emerald-300" />
              </div>

              <div className="space-y-2">
                {filteredMatches.length > 0 ? (
                  filteredMatches.map((match) => {
                    const odds = getOdds(match);

                    return (
                      <button
                        key={match.id}
                        onClick={() => setSelectedMatchId(match.id)}
                        className={`w-full rounded-xl border p-2.5 text-left transition ${
                          selectedMatchId === match.id
                            ? "border-orange-400/30 bg-orange-400/10"
                            : "border-white/8 bg-black/20 hover:bg-white/6"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="rounded-full bg-white/8 px-2 py-1 text-[10px] font-semibold text-stone-300">
                            {statusLabel(match.status)}
                          </span>
                          <span className="text-xs text-stone-500">
                            {match.minute ?? 0}'
                          </span>
                        </div>

                        <div className="mt-2 flex items-center justify-between">
                          <div className="space-y-1">
                            <p className="text-sm font-medium text-white">{match.homeTeam}</p>
                            <p className="text-sm font-medium text-white">{match.awayTeam}</p>
                          </div>
                          <div className="space-y-1 text-right text-lg font-semibold">
                            <p>{match.homeScore ?? 0}</p>
                            <p>{match.awayScore ?? 0}</p>
                          </div>
                        </div>

                        <div className="mt-2 grid grid-cols-3 gap-1.5 text-center text-[10px]">
                          <div className="rounded-lg bg-black/25 px-2 py-1.5">
                            <p className="text-stone-500">Home</p>
                            <p className="font-semibold text-orange-200">
                              {formatOdds(odds.homeOdds)}
                            </p>
                          </div>
                          <div className="rounded-lg bg-black/25 px-2 py-1.5">
                            <p className="text-stone-500">Draw</p>
                            <p className="font-semibold text-stone-200">
                              {formatOdds(odds.drawOdds)}
                            </p>
                          </div>
                          <div className="rounded-lg bg-black/25 px-2 py-1.5">
                            <p className="text-stone-500">Away</p>
                            <p className="font-semibold text-emerald-200">
                              {formatOdds(odds.awayOdds)}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <div className="rounded-2xl bg-black/25 p-4 text-sm text-stone-500">
                    No matches found
                  </div>
                )}
              </div>
            </div>
          <SignalIntelligencePanel />

            <div
              id="agent"
              className={`scroll-mt-4 rounded-[24px] border p-4 transition-all duration-500 ${
                activeSection === "agent"
                  ? "border-orange-400/50 bg-orange-400/10 shadow-[0_0_35px_rgba(251,146,60,0.16)]"
                  : "border-white/10 bg-[#15100c]"
              }`}
            >
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-xs text-stone-500">Signal engine</p>
                  <h2 className="text-xl font-semibold">Latest signals</h2>
                </div>
                <Gauge className="h-4 w-4 text-orange-300" />
              </div>

              <div className="space-y-2">
                {filteredSignals.length > 0 ? (
                  filteredSignals.slice(0, 5).map((signal, index) => (
                    <button
                      key={signal.id ?? index}
                      onClick={() => setSelectedSignal(signal)}
                      className="w-full rounded-xl border border-white/8 bg-black/20 p-2.5 text-left transition hover:border-orange-400/40 hover:bg-orange-400/10"
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <span
                          className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${severityStyle(
                            signal.severity
                          )}`}
                        >
                          {(signal.severity ?? "LOW").toUpperCase()}
                        </span>
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

                      <p className="mt-1.5 text-[10px] font-medium text-orange-200">
                        View details
                      </p>
                    </button>
                  ))
                ) : (
                  <div className="rounded-2xl bg-black/25 p-4 text-sm text-stone-500">
                    No signals found
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-[24px] border border-white/10 bg-[#15100c] p-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-xs text-stone-500">Post-signal audit</p>
                  <h2 className="text-xl font-semibold">Outcome verification</h2>
                </div>
                <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-[11px] font-medium text-emerald-200">
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
                        className="w-full rounded-xl border border-white/8 bg-black/20 p-3 text-left transition hover:border-emerald-400/30 hover:bg-emerald-400/10"
                      >
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-white">
                              {signalTypeLabel(getSignalType(item.signal))}
                            </p>
                            <p className="mt-0.5 text-[11px] text-stone-500">
                              {item.source} • {getSignalTarget(item.signal)}
                            </p>
                          </div>

                          <span
                            className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${
                              isCorrect
                                ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
                                : isIncorrect
                                  ? "border-red-400/30 bg-red-400/10 text-red-200"
                                  : "border-orange-400/30 bg-orange-400/10 text-orange-200"
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
                            <p className="mt-1 font-semibold text-orange-200">
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
                <div className="rounded-2xl bg-black/25 p-4 text-sm text-stone-500">
                  Run the backtest or wait for live signals to verify outcomes.
                </div>
              )}
            </div>
          </section>
        </section>

        <aside className="space-y-2">
          <div className="rounded-[24px] border border-white/10 bg-gradient-to-br from-orange-400 to-[#2a1810] p-4 text-white">
            <p className="text-sm text-orange-50/80">Selected match</p>
            <h2 className="mt-1 text-xl font-semibold leading-tight">
              {selectedMatch
                ? `${selectedMatch.homeTeam} vs ${selectedMatch.awayTeam}`
                : "No match yet"}
            </h2>

            <div className="mt-4 rounded-2xl bg-[#17100c]/80 p-3">
              <div className="flex items-center justify-between text-sm text-stone-300">
                <span>{selectedMatch?.homeTeam ?? "Home"}</span>
                <span className="text-xl font-semibold text-white">
                  {selectedMatch?.homeScore ?? 0}
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between text-sm text-stone-300">
                <span>{selectedMatch?.awayTeam ?? "Away"}</span>
                <span className="text-xl font-semibold text-white">
                  {selectedMatch?.awayScore ?? 0}
                </span>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-white/15 p-2.5">
                <p className="text-xs text-white/70">Minute</p>
                <p className="text-xl font-semibold">{selectedMatch?.minute ?? 0}'</p>
              </div>
              <div className="rounded-xl bg-white/15 p-2.5">
                <p className="text-xs text-white/70">Status</p>
                <p className="text-sm font-semibold">{statusLabel(selectedMatch?.status)}</p>
              </div>
            </div>
            <div className="mt-3 rounded-2xl bg-[#17100c]/75 p-3">
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
                      className="h-2 rounded-full bg-orange-200"
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
                      className="h-2 rounded-full bg-emerald-300"
                      style={{
                        width: `${selectedMatchMarketPressure.awayPressure}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-[24px] border border-white/10 bg-[#15100c] p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-xs text-stone-500">Autonomous flow</p>
                <h2 className="text-lg font-semibold">Agent timeline</h2>
              </div>
              <button
                onClick={startAgentReplay}
                className="rounded-full border border-orange-400/20 bg-orange-400/10 px-3 py-1.5 text-[11px] font-medium text-orange-200 transition hover:border-orange-300/40 hover:bg-orange-400/20"
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
                      ? "border-orange-300/60 bg-orange-400/15 shadow-[0_0_24px_rgba(251,146,60,0.2)]"
                      : "border-white/8 bg-black/20"
                  }`}
                >
                  <div className="flex flex-col items-center">
                    <div
                      className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold transition-all duration-300 ${
                        replayStep === index
                          ? "bg-orange-300 text-black"
                          : "bg-orange-400/15 text-orange-200"
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

          <div
            id="guide-backtest-card"
            className={`rounded-[24px] border border-white/10 bg-[#15100c] p-4 transition-all ${
              isJudgeMode && judgeStep === 7 ? "relative z-[60] scale-[1.01] ring-2 ring-orange-400/70 shadow-2xl shadow-orange-500/30" : ""
            }`}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs text-stone-500">Historical replay</p>
                <h2 className="text-base font-semibold">Backtest mode</h2>
              </div>
              <button
                onClick={runReplayBacktest}
                disabled={isReplayRunning}
                className="rounded-full border border-orange-400/20 bg-orange-400/10 px-3 py-1.5 text-[11px] font-medium text-orange-200 transition hover:border-orange-300/40 hover:bg-orange-400/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isReplayRunning ? "Running..." : "Run backtest"}
              </button>
            </div>

            {replayBacktest ? (
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
                    <p className="text-[10px] text-stone-500">Accuracy</p>
                    <p className="mt-1 text-sm font-semibold text-emerald-200">
                      {replayBacktest.summary?.accuracyPct ?? 0}%
                    </p>
                  </div>
                </div>

                <div
                  id="guide-proof-readiness"
                  className={`rounded-xl border border-emerald-400/15 bg-emerald-400/10 p-3 transition-all ${
                    isJudgeMode && judgeStep === 10 ? "relative z-[60] scale-[1.01] ring-2 ring-orange-400/70 shadow-2xl shadow-orange-500/30" : ""
                  }`}
                >
                  <div className="flex items-center justify-between gap-3 text-[11px]">
                    <span className="text-stone-400">Result</span>
                    <span className="font-medium text-emerald-200">
                      {replayBacktest.summary?.correctSignals ?? 0} correct •{" "}
                      {replayBacktest.summary?.incorrectSignals ?? 0} incorrect
                    </span>
                  </div>

                  <div className="mt-3 rounded-lg bg-black/20 p-2">
                    <div className="flex items-center justify-between gap-3 text-[10px]">
                      <span className="text-stone-500">Proof network</span>
                      <span className="font-medium text-sky-200">
                        {replayBacktest.proof?.network ?? "solana-devnet"}
                      </span>
                    </div>

                    <div className="mt-1 flex items-center justify-between gap-3 text-[10px]">
                      <span className="text-stone-500">Anchoring</span>
                      <span className="font-medium text-orange-200">
                        {(replayBacktest.proof?.anchoringStatus ?? "pending_wallet_configuration")
                          .replaceAll("_", " ")}
                      </span>
                    </div>

                    <p className="mt-2 truncate text-[10px] text-stone-500">
                      Hash: {replayBacktest.proof?.hash ?? "pending"}
                    </p>
                  </div>
                </div>
                {(replayBacktest.events ?? []).length > 0 && (
                  <div
                    id="guide-event-correlation"
                    className={`rounded-xl border border-orange-400/15 bg-orange-400/10 p-3 transition-all ${
                      isJudgeMode && judgeStep === 8 ? "relative z-[60] scale-[1.01] ring-2 ring-orange-400/70 shadow-2xl shadow-orange-500/30" : ""
                    }`}
                  >
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[10px] text-orange-200/80">Event correlation</p>
                        <p className="text-xs font-semibold text-white">
                          {(replayBacktest.events ?? []).length} supporting event(s)
                        </p>
                      </div>
                      <span className="rounded-full bg-black/25 px-2.5 py-1 text-[10px] font-medium text-orange-100">
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
                            <span className="shrink-0 text-[10px] text-orange-200">
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
                    className={`rounded-xl border border-sky-400/15 bg-sky-400/10 p-3 transition-all ${
                      isJudgeMode && judgeStep === 9 ? "relative z-[60] scale-[1.01] ring-2 ring-orange-400/70 shadow-2xl shadow-orange-500/30" : ""
                    }`}
                  >
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[10px] text-sky-200/80">Oracle council</p>
                        <p className="text-xs font-semibold text-white">
                          {(replayBacktest.councilVotes ?? [])[0]?.decision?.toUpperCase() ??
                            "PENDING"}
                        </p>
                      </div>
                      <span className="rounded-full bg-black/25 px-2.5 py-1 text-[10px] font-medium text-sky-100">
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
                                    ? "bg-emerald-400/10 text-emerald-200"
                                    : vote.vote === "reject"
                                      ? "bg-red-400/10 text-red-200"
                                      : "bg-orange-400/10 text-orange-200"
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
                the logic still works even when live matches are unavailable.
              </p>
            )}
          </div>
          <div className="rounded-[24px] border border-white/10 bg-[#15100c] p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-xs text-stone-500">Detection rules</p>
                <h2 className="text-base font-semibold">Signal thresholds</h2>
              </div>
              <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-medium text-emerald-200">
                Active
              </span>
            </div>

            <div className="space-y-2">
              <div className="rounded-xl bg-black/20 p-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-stone-100">WATCH</span>
                  <span className="text-orange-200">≥ 4%</span>
                </div>
                <p className="mt-1 text-[11px] text-stone-500">
                  Early movement detected, but not yet strong enough for a major alert.
                </p>
              </div>

              <div className="rounded-xl bg-black/20 p-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-stone-100">MOMENTUM SHIFT</span>
                  <span className="text-orange-200">≥ 8%</span>
                </div>
                <p className="mt-1 text-[11px] text-stone-500">
                  Odds compression suggests meaningful market pressure.
                </p>
              </div>

              <div className="rounded-xl bg-black/20 p-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-stone-100">SHARP MOVE</span>
                  <span className="text-orange-200">≥ 15%</span>
                </div>
                <p className="mt-1 text-[11px] text-stone-500">
                  High-severity movement that the agent flags for review.
                </p>
              </div>
            </div>
          </div>
          <div
            id="compliance"
            className={`scroll-mt-4 rounded-[24px] border p-4 transition-all duration-500 ${
              activeSection === "compliance"
                ? "border-orange-400/40 bg-orange-400/10 shadow-[0_0_35px_rgba(251,146,60,0.12)]"
                : "border-white/10 bg-[#15100c]"
            }`}
          >
            <div className="mb-3 flex items-center gap-2">
              <div className="rounded-xl bg-emerald-400/10 p-2 text-emerald-200">
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
          <div className="w-full max-w-xl rounded-[24px] border border-white/10 bg-[#15100c] p-4 shadow-2xl shadow-black/50">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs text-stone-500">Signal details</p>
                <h2 className="mt-1 text-2xl font-semibold text-white">
                  {signalTypeLabel(getSignalType(selectedSignal))}
                </h2>
              </div>

              <button
                onClick={() => setSelectedSignal(null)}
                className="rounded-2xl bg-white/8 p-2 text-stone-400 transition hover:bg-white/12 hover:text-white"
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

              <span className="rounded-full border border-white/10 bg-black/25 px-3 py-1 text-xs text-stone-300">
                {formatTime(selectedSignal.createdAt)}
              </span>
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

            <div className="mt-4 rounded-2xl bg-black/25 p-4">
              <p className="text-[11px] text-stone-500">Agent explanation</p>
              <p className="mt-2 text-sm leading-6 text-stone-200">
                {selectedSignal.explanation ??
                  selectedSignal.reason ??
                  "The agent detected meaningful market movement based on the current odds snapshot and prior movement history."}
              </p>
            </div>

            <div className="mt-4 rounded-2xl border border-emerald-400/15 bg-emerald-400/10 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] text-emerald-200/80">Confidence explanation</p>
                  <h3 className="mt-1 text-sm font-semibold text-white">
                    Why the agent trusted this signal
                  </h3>
                </div>
                <span className="rounded-full bg-black/25 px-3 py-1 text-[11px] text-emerald-100">
                  Explainable signal
                </span>
              </div>

              <div className="mt-3 grid gap-2 text-xs text-stone-300">
                <div className="rounded-xl bg-black/20 p-3">
                  <span className="font-semibold text-emerald-200">+ Compression rule:</span>{" "}
                  Odds movement reached {formatOddsChange(selectedSignal.oddsChangePct)}, so the
                  signal crossed the configured trigger level.
                </div>

                <div className="rounded-xl bg-black/20 p-3">
                  <span className="font-semibold text-emerald-200">+ Momentum weight:</span>{" "}
                  Momentum score registered at{" "}
                  {Math.round(selectedSignal.momentumScore ?? selectedSignal.confidence ?? 0)},
                  giving the agent enough strength to classify the move.
                </div>

                <div className="rounded-xl bg-black/20 p-3">
                  <span className="font-semibold text-emerald-200">+ Target tracked:</span>{" "}
                  The agent attached the movement to {getSignalTarget(selectedSignal)} instead of
                  creating a generic market alert.
                </div>

                <div className="rounded-xl bg-black/20 p-3">
                  <span className="font-semibold text-emerald-200">+ Audit status:</span>{" "}
                  Current outcome is {getSignalOutcome(selectedSignal)}, so the signal can be
                  reviewed after the market closes.
                </div>
              </div>
            </div>
            <div className="mt-4 rounded-2xl border border-orange-400/20 bg-orange-400/10 p-4">
              <p className="text-[11px] text-orange-200/80">Decision path</p>
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
                  <span className="font-semibold text-orange-100">
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
                  <span className="font-semibold text-emerald-200">
                    {getSignalOutcome(selectedSignal)}
                  </span>.
                </li>
              </ol>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default App;








































