import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  BarChart3,
  Bot,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Database,
  Gauge,
  LayoutDashboard,
  Radio,
  RefreshCw,
  Search,
  ShieldCheck,
  Zap,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
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
  team?: string;
  side?: string;
  type?: string;
  severity?: string;
  momentumScore?: number;
  confidence?: number;
  explanation?: string;
  reason?: string;
  createdAt?: string;
  status?: string;
  outcome?: string;
  wasCorrect?: boolean;
};

type AgentRun = {
  id?: string;
  startedAt?: string;
  finishedAt?: string;
  message?: string;
  matchesProcessed?: number;
  signalsGenerated?: number;
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
  lastAgentRun?: string;
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

type Health = {
  ok?: boolean;
  service?: string;
  status?: string;
  agentIntervalMs?: number;
  useSimulatedFeed?: boolean;
  txlineBaseUrl?: string;
  timestamp?: string;
};

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ??
  (import.meta.env.DEV
    ? "http://localhost:4000"
    : "https://goalpulse-agent-api.onrender.com");

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

function getOdds(match: Match) {
  return match.market ?? match.odds ?? {};
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

function MiniStat({
  label,
  value,
  icon,
  helper,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  helper: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#19140f]/80 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="rounded-xl bg-white/8 p-2 text-orange-200">{icon}</div>
        <span className="h-2 w-2 rounded-full bg-emerald-400" />
      </div>
      <p className="text-xs text-stone-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-white">{value}</p>
      <p className="mt-2 text-[11px] leading-4 text-stone-500">{helper}</p>
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
  const [error, setError] = useState("");

  async function loadDashboard() {
    try {
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

    } catch (currentError) {
      setError(
        currentError instanceof Error
          ? currentError.message
          : "Unable to load dashboard data."
      );
    }
  }

  useEffect(() => {
    loadDashboard();

    const interval = window.setInterval(loadDashboard, 5000);

    return () => window.clearInterval(interval);
  }, [selectedMatchId]);

  const selectedMatch = useMemo(
    () => matches.find((match) => match.id === selectedMatchId) ?? matches[0],
    [matches, selectedMatchId]
  );

  const chartData = useMemo(
    () =>
      oddsHistory.slice(-18).map((snapshot, index) => {
        const odds = snapshot.market ?? snapshot;

        return {
          name: snapshot.timestamp ? formatTime(snapshot.timestamp) : `${index + 1}`,
          home: odds.homeOdds,
          draw: odds.drawOdds,
          away: odds.awayOdds,
        };
      }),
    [oddsHistory]
  );


  return (
    <main className="min-h-screen bg-[#0b0806] p-3 text-stone-100">
      <div className="mx-auto grid max-w-[1380px] grid-cols-[70px_1fr_330px] gap-4">
        <aside className="sticky top-3 h-[calc(100vh-24px)] rounded-[26px] border border-white/10 bg-[#15100c] p-3">
          <div className="mb-7 flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500 text-lg font-black text-[#07100b]">
            GP
          </div>

          <nav className="space-y-3">
            <button className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-500 text-white">
              <LayoutDashboard className="h-5 w-5" />
            </button>
            <button className="flex h-11 w-11 items-center justify-center rounded-2xl text-stone-500 hover:bg-white/8 hover:text-white">
              <BarChart3 className="h-5 w-5" />
            </button>
            <button className="flex h-11 w-11 items-center justify-center rounded-2xl text-stone-500 hover:bg-white/8 hover:text-white">
              <Bot className="h-5 w-5" />
            </button>
            <button className="flex h-11 w-11 items-center justify-center rounded-2xl text-stone-500 hover:bg-white/8 hover:text-white">
              <ShieldCheck className="h-5 w-5" />
            </button>
          </nav>

          <div className="absolute bottom-4 left-3 space-y-3">
            <button className="flex h-11 w-11 items-center justify-center rounded-2xl text-stone-500 hover:bg-white/8 hover:text-white">
              <RefreshCw className="h-5 w-5" />
            </button>
          </div>
        </aside>

        <section className="space-y-4">
          <header className="flex items-center justify-between rounded-[28px] border border-white/10 bg-[#15100c] px-5 py-4">
            <div className="flex min-w-[320px] items-center gap-3 rounded-2xl bg-black/25 px-4 py-3 text-sm text-stone-400">
              <Search className="h-4 w-4" />
              <span>Search matches, signals, odds movement</span>
            </div>

            <div className="flex items-center gap-3">
              <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-xs font-medium text-emerald-200">
                Agent running
              </span>
              <span className="rounded-full border border-orange-400/20 bg-orange-400/10 px-3 py-2 text-xs font-medium text-orange-200">
                {health === null
                  ? "Connecting"
                  : health.useSimulatedFeed
                    ? "Demo feed"
                    : "TxLINE live"}
              </span>
              <div className="flex items-center gap-3 rounded-2xl bg-black/25 px-3 py-2">
                <div className="h-8 w-8 rounded-full bg-gradient-to-br from-orange-300 to-emerald-400" />
                <div>
                  <p className="text-xs font-semibold text-white">GoalPulse</p>
                  <p className="text-[11px] text-stone-500">Hackathon build</p>
                </div>
                <ChevronDown className="h-4 w-4 text-stone-500" />
              </div>
            </div>
          </header>

          {error && (
            <div className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          )}

          <section className="grid grid-cols-[1fr_250px] gap-4">
            <div className="rounded-[30px] border border-white/10 bg-[#15100c] p-5">
              <div className="mb-3 flex items-start justify-between">
                <div>
                  <p className="text-xs text-stone-500">Autonomous odds intelligence</p>
                  <h1 className="mt-1 text-3xl font-semibold tracking-tight text-white">
                    GoalPulse Agent
                  </h1>
                  <p className="mt-2 max-w-xl text-sm leading-6 text-stone-400">
                    Tracks World Cup-style odds movement, detects momentum shifts,
                    and explains each signal with deterministic logic.
                  </p>
                </div>

                <div className="rounded-2xl bg-black/25 px-4 py-3 text-right">
                  <p className="text-xs text-stone-500">Backend</p>
                  <p className="text-sm font-semibold text-emerald-200">
                    {health?.ok ? "Online" : "Checking"}
                  </p>
                </div>
              </div>

              <div className="mt-5 h-[250px]">
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="home" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#fb923c" stopOpacity={0.55} />
                          <stop offset="95%" stopColor="#fb923c" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="away" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#34d399" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                      <XAxis dataKey="name" tick={{ fill: "#78716c", fontSize: 11 }} />
                      <YAxis tick={{ fill: "#78716c", fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{
                          background: "#15100c",
                          border: "1px solid rgba(255,255,255,0.12)",
                          borderRadius: "14px",
                          color: "#fff",
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="home"
                        stroke="#fb923c"
                        strokeWidth={2}
                        fill="url(#home)"
                        name="Home odds"
                      />
                      <Area
                        type="monotone"
                        dataKey="away"
                        stroke="#34d399"
                        strokeWidth={2}
                        fill="url(#away)"
                        name="Away odds"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center rounded-3xl bg-black/25 text-sm text-stone-500">
                    Waiting for odds history
                  </div>
                )}
              </div>
            </div>

            <div className="grid gap-4">
              <MiniStat
                label="Updates"
                value={formatNumber(stats?.txlineUpdates)}
                icon={<Database className="h-4 w-4" />}
                helper="Processed snapshots"
              />
              <MiniStat
                label="Signals"
                value={formatNumber(stats?.signalsGenerated)}
                icon={<Zap className="h-4 w-4" />}
                helper="Generated alerts"
              />
              <MiniStat
                label="Accuracy"
                value={formatPercent(stats?.strategyAccuracy)}
                icon={<CheckCircle2 className="h-4 w-4" />}
                helper={`${stats?.correctSignals ?? 0} correct • ${stats?.closedSignals ?? 0} closed`}
              />
            </div>
          </section>

          <section className="grid grid-cols-2 gap-4">
            <div className="rounded-[30px] border border-white/10 bg-[#15100c] p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-xs text-stone-500">Live matches</p>
                  <h2 className="text-xl font-semibold">Market board</h2>
                </div>
                <Radio className="h-4 w-4 text-emerald-300" />
              </div>

              <div className="space-y-3">
                {matches.length > 0 ? (
                  matches.map((match) => {
                    const odds = getOdds(match);

                    return (
                      <button
                        key={match.id}
                        onClick={() => setSelectedMatchId(match.id)}
                        className={`w-full rounded-2xl border p-3 text-left transition ${
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

                        <div className="mt-3 flex items-center justify-between">
                          <div className="space-y-1">
                            <p className="text-sm font-medium text-white">{match.homeTeam}</p>
                            <p className="text-sm font-medium text-white">{match.awayTeam}</p>
                          </div>
                          <div className="space-y-1 text-right text-lg font-semibold">
                            <p>{match.homeScore ?? 0}</p>
                            <p>{match.awayScore ?? 0}</p>
                          </div>
                        </div>

                        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px]">
                          <div className="rounded-xl bg-black/25 px-2 py-2">
                            <p className="text-stone-500">Home</p>
                            <p className="font-semibold text-orange-200">
                              {formatOdds(odds.homeOdds)}
                            </p>
                          </div>
                          <div className="rounded-xl bg-black/25 px-2 py-2">
                            <p className="text-stone-500">Draw</p>
                            <p className="font-semibold text-stone-200">
                              {formatOdds(odds.drawOdds)}
                            </p>
                          </div>
                          <div className="rounded-xl bg-black/25 px-2 py-2">
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
                    Waiting for match data
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-[30px] border border-white/10 bg-[#15100c] p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-xs text-stone-500">Signal engine</p>
                  <h2 className="text-xl font-semibold">Latest signals</h2>
                </div>
                <Gauge className="h-4 w-4 text-orange-300" />
              </div>

              <div className="space-y-3">
                {signals.length > 0 ? (
                  signals.slice(0, 5).map((signal, index) => (
                    <div
                      key={signal.id ?? index}
                      className="rounded-2xl border border-white/8 bg-black/20 p-3"
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
                        {(signal.type ?? "WATCH").replaceAll("_", " ")}
                      </p>

                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-stone-400">
                        {signal.explanation ??
                          signal.reason ??
                          "Agent detected meaningful market movement."}
                      </p>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl bg-black/25 p-4 text-sm text-stone-500">
                    Waiting for signal threshold
                  </div>
                )}
              </div>
            </div>
          </section>
        </section>

        <aside className="space-y-4">
          <div className="rounded-[30px] border border-white/10 bg-gradient-to-br from-orange-400 to-[#2a1810] p-5 text-white">
            <p className="text-sm text-orange-50/80">Selected match</p>
            <h2 className="mt-2 text-2xl font-semibold">
              {selectedMatch
                ? `${selectedMatch.homeTeam} vs ${selectedMatch.awayTeam}`
                : "No match yet"}
            </h2>

            <div className="mt-6 rounded-3xl bg-[#17100c]/80 p-4">
              <div className="flex items-center justify-between text-sm text-stone-300">
                <span>{selectedMatch?.homeTeam ?? "Home"}</span>
                <span className="text-2xl font-semibold text-white">
                  {selectedMatch?.homeScore ?? 0}
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between text-sm text-stone-300">
                <span>{selectedMatch?.awayTeam ?? "Away"}</span>
                <span className="text-2xl font-semibold text-white">
                  {selectedMatch?.awayScore ?? 0}
                </span>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-white/15 p-3">
                <p className="text-xs text-white/70">Minute</p>
                <p className="text-xl font-semibold">{selectedMatch?.minute ?? 0}'</p>
              </div>
              <div className="rounded-2xl bg-white/15 p-3">
                <p className="text-xs text-white/70">Status</p>
                <p className="text-sm font-semibold">{statusLabel(selectedMatch?.status)}</p>
              </div>
            </div>
          </div>

          <div className="rounded-[30px] border border-white/10 bg-[#15100c] p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-stone-500">Agent runs</p>
                <h2 className="text-xl font-semibold">Activity log</h2>
              </div>
              <Activity className="h-4 w-4 text-emerald-300" />
            </div>

            <div className="space-y-3">
              {runs.length > 0 ? (
                runs.slice(0, 5).map((run, index) => (
                  <div key={run.id ?? index} className="flex gap-3 rounded-2xl bg-black/20 p-3">
                    <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-orange-300" />
                    <div>
                      <p className="line-clamp-2 text-xs leading-5 text-stone-300">
                        {run.message ?? "Agent cycle completed."}
                      </p>
                      <p className="mt-1 text-[11px] text-stone-600">
                        {formatTime(run.finishedAt ?? run.startedAt)}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl bg-black/25 p-4 text-sm text-stone-500">
                  Waiting for agent logs
                </div>
              )}
            </div>
          </div>

          <div className="rounded-[30px] border border-white/10 bg-[#15100c] p-5">
            <div className="mb-4 flex items-center gap-3">
              <div className="rounded-xl bg-emerald-400/10 p-2 text-emerald-200">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs text-stone-500">Compliance</p>
                <h2 className="text-lg font-semibold">Analytics only</h2>
              </div>
            </div>

            <p className="text-xs leading-5 text-stone-400">
              GoalPulse does not place wagers, custody funds, execute trades, or
              facilitate illegal betting. It is a market monitoring layer with a
              TxLINE-ready adapter boundary.
            </p>
          </div>
        </aside>
      </div>
    </main>
  );
}

export default App;

