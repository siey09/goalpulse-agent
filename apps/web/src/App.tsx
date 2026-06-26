import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  Bot,
  Clock,
  Database,
  Radio,
  ShieldCheck,
  TrendingUp,
  Zap,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  getMatches,
  getOddsHistory,
  getSignals,
  getStats,
  type AgentSignal,
  type AgentStats,
  type Match,
  type OddsSnapshot,
} from "./api";

function App() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [signals, setSignals] = useState<AgentSignal[]>([]);
  const [stats, setStats] = useState<AgentStats | null>(null);
  const [oddsHistory, setOddsHistory] = useState<OddsSnapshot[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState("wc-usa-bra");
  const [lastRefresh, setLastRefresh] = useState<string>("Loading...");
  const [apiStatus, setApiStatus] = useState<"connected" | "error" | "loading">(
    "loading"
  );

  async function loadDashboardData() {
    try {
      const [matchesData, signalsData, statsData, historyData] =
        await Promise.all([
          getMatches(),
          getSignals(),
          getStats(),
          getOddsHistory(selectedMatchId),
        ]);

      setMatches(matchesData);
      setSignals(signalsData);
      setStats(statsData);
      setOddsHistory(historyData);
      setLastRefresh(new Date().toLocaleTimeString());
      setApiStatus("connected");
    } catch (error) {
      console.error(error);
      setApiStatus("error");
    }
  }

  useEffect(() => {
    loadDashboardData();

    const interval = window.setInterval(() => {
      loadDashboardData();
    }, 5000);

    return () => window.clearInterval(interval);
  }, [selectedMatchId]);

  const selectedMatch = useMemo(
    () => matches.find((match) => match.id === selectedMatchId) ?? matches[0],
    [matches, selectedMatchId]
  );

  const chartData = oddsHistory.map((snapshot) => ({
    time: `${snapshot.minute}'`,
    home: snapshot.homeOdds,
    away: snapshot.awayOdds,
    draw: snapshot.drawOdds,
  }));

  return (
    <main className="min-h-screen bg-[#07111f] text-white">
      <section className="border-b border-white/10 bg-[#09182b]">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-8 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-sm text-cyan-200">
              <Radio size={15} />
              TxLINE-powered autonomous World Cup agent
            </div>

            <h1 className="text-4xl font-bold tracking-tight md:text-5xl">
              GoalPulse Agent
            </h1>

            <p className="mt-3 max-w-2xl text-slate-300">
              An autonomous odds movement and match momentum detector that
              ingests TxLINE-style live feeds, detects sharp market shifts,
              explains every signal, and tracks strategy activity.
            </p>
          </div>

          <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-5 py-4">
            <div className="flex items-center gap-3">
              <Bot className="text-emerald-300" />
              <div>
                <p className="text-sm text-emerald-200">Agent Status</p>
                <p className="text-xl font-semibold">
                  {apiStatus === "connected"
                    ? "Running every 5s"
                    : apiStatus === "loading"
                    ? "Connecting..."
                    : "API Error"}
                </p>
                <p className="text-xs text-emerald-100/80">
                  Last refresh: {lastRefresh}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-5 px-6 py-6 md:grid-cols-4">
        <StatCard
          icon={<Database />}
          title="TxLINE Updates"
          value={String(stats?.txlineUpdates ?? 0)}
          subtitle="Snapshots processed"
        />
        <StatCard
          icon={<Zap />}
          title="Signals Generated"
          value={String(stats?.signalsGenerated ?? 0)}
          subtitle={`${stats?.highSeverity ?? 0} high severity`}
        />
        <StatCard
          icon={<TrendingUp />}
          title="Strategy Accuracy"
          value={`${stats?.strategyAccuracy ?? 0}%`}
          subtitle={`${stats?.pendingSignals ?? 0} pending signals`}
        />
        <StatCard
          icon={<Clock />}
          title="Last Agent Run"
          value={stats?.lastAgentRun?.status ?? "waiting"}
          subtitle={stats?.lastAgentRun?.message ?? "No run yet"}
        />
      </section>

      <section className="mx-auto grid max-w-7xl gap-6 px-6 pb-10 lg:grid-cols-[1.2fr_1fr]">
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
          <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-semibold">Live Matches</h2>
              <p className="text-sm text-slate-400">
                Simulated TxLINE live feed for demo mode
              </p>
            </div>

            <select
              value={selectedMatchId}
              onChange={(event) => setSelectedMatchId(event.target.value)}
              className="rounded-xl border border-white/10 bg-[#0b1628] px-4 py-2 text-sm text-white outline-none"
            >
              {matches.map((match) => (
                <option key={match.id} value={match.id}>
                  {match.homeTeam} vs {match.awayTeam}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {matches.map((match) => (
              <button
                key={match.id}
                onClick={() => setSelectedMatchId(match.id)}
                className={`rounded-2xl border p-4 text-left transition ${
                  selectedMatchId === match.id
                    ? "border-cyan-400/50 bg-cyan-400/10"
                    : "border-white/10 bg-[#0b1628] hover:bg-white/[0.06]"
                }`}
              >
                <p className="text-sm text-slate-400">{match.competition}</p>
                <p className="mt-2 font-semibold">
                  {match.homeTeam} vs {match.awayTeam}
                </p>
                <p className="mt-3 text-2xl font-bold">
                  {match.homeScore} - {match.awayScore}
                </p>
                <p className="mt-1 text-sm text-slate-400">
                  {match.minute}' • {match.status}
                </p>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
          <div className="mb-5">
            <h2 className="text-xl font-semibold">Agent Decision Logic</h2>
            <p className="text-sm text-slate-400">
              Deterministic rules used for every signal
            </p>
          </div>

          <div className="space-y-4">
            <LogicItem
              title="High Sharp Movement"
              detail="Odds change ≥ 15% within the comparison window"
            />
            <LogicItem
              title="Medium Momentum Shift"
              detail="Odds change ≥ 8% with sustained direction"
            />
            <LogicItem
              title="Watch Signal"
              detail="Odds change ≥ 4%; continue monitoring"
            />
            <LogicItem
              title="No Action"
              detail="Movement below configured threshold"
            />
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-6 px-6 pb-10 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">Live Odds Movement</h2>
              <p className="text-sm text-slate-400">
                {selectedMatch
                  ? `${selectedMatch.homeTeam} vs ${selectedMatch.awayTeam}`
                  : "Waiting for match data"}
              </p>
            </div>
            <Activity className="text-cyan-300" />
          </div>

          <div className="h-[360px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,255,255,0.08)"
                />
                <XAxis dataKey="time" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip
                  contentStyle={{
                    background: "#0f172a",
                    border: "1px solid rgba(255,255,255,0.15)",
                    borderRadius: "12px",
                    color: "white",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="home"
                  stroke="#22d3ee"
                  strokeWidth={3}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="away"
                  stroke="#a78bfa"
                  strokeWidth={3}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="draw"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
          <div className="mb-5">
            <h2 className="text-xl font-semibold">Selected Match Feed</h2>
            <p className="text-sm text-slate-400">
              Latest odds snapshots from the agent
            </p>
          </div>

          <div className="space-y-3">
            {oddsHistory.slice(-5).reverse().map((snapshot) => (
              <div
                key={snapshot.id}
                className="rounded-2xl border border-white/10 bg-[#0b1628] p-4"
              >
                <p className="text-sm text-slate-400">
                  Minute {snapshot.minute}' • Score {snapshot.homeScore}-
                  {snapshot.awayScore}
                </p>
                <p className="mt-2 text-sm">
                  Home: <span className="font-semibold">{snapshot.homeOdds}</span>{" "}
                  • Draw:{" "}
                  <span className="font-semibold">{snapshot.drawOdds}</span> •
                  Away:{" "}
                  <span className="font-semibold">{snapshot.awayOdds}</span>
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-12">
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">Autonomous Signal Feed</h2>
              <p className="text-sm text-slate-400">
                Signals produced by the agent without manual input
              </p>
            </div>
            <Bot className="text-emerald-300" />
          </div>

          <div className="space-y-4">
            {signals.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-[#0b1628] p-5 text-slate-400">
                No signals yet. The agent is waiting for meaningful odds
                movement.
              </div>
            ) : (
              signals.map((item) => (
                <div
                  key={item.id}
                  className="rounded-2xl border border-white/10 bg-[#0b1628] p-5"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="font-semibold">{item.match}</p>
                      <p className="text-sm text-slate-400">
                        Target: {item.target} • Odds Movement:{" "}
                        {item.oddsChangePct}% • Momentum Score:{" "}
                        {item.momentumScore}
                      </p>
                    </div>

                    <div className="flex gap-2">
                      <span className="rounded-full bg-cyan-400/10 px-3 py-1 text-sm text-cyan-200">
                        {item.signalType}
                      </span>
                      <span className="rounded-full bg-orange-400/10 px-3 py-1 text-sm text-orange-200">
                        {item.severity}
                      </span>
                    </div>
                  </div>

                  <p className="mt-3 text-sm text-slate-300">
                    {item.explanation}
                  </p>
                </div>
              ))
            )}
          </div>

          <div className="mt-6 rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-4">
            <div className="flex gap-3">
              <ShieldCheck className="mt-1 text-cyan-300" />
              <p className="text-sm text-cyan-100">
                GoalPulse is built as an analytics and market intelligence tool.
                It does not execute wagers, custody funds, or place trades.
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function StatCard({
  icon,
  title,
  value,
  subtitle,
}: {
  icon: ReactNode;
  title: string;
  value: string;
  subtitle: string;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-400/10 text-cyan-300">
        {icon}
      </div>
      <p className="text-sm text-slate-400">{title}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
      <p className="mt-1 line-clamp-2 text-sm text-slate-500">{subtitle}</p>
    </div>
  );
}

function LogicItem({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0b1628] p-4">
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-sm text-slate-400">{detail}</p>
    </div>
  );
}

export default App;
