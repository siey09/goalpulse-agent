import { useEffect, useState } from "react";
import { AreaChart, Area, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Activity, Radio, Signal as SignalIcon, Wallet } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { MetricCard } from "../../components/ui/MetricCard";
import { SectionHeader } from "../../components/ui/SectionHeader";
import { EmptyState } from "../../components/ui/EmptyState";
import { getMetaAgentRecommendation, formatRoi, type ArenaResponse } from "../../lib/arena";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "https://goalpulse-agent-api.onrender.com";

export interface CommandCenterKpis {
  liveFixtures: number;
  feedFreshnessLabel: string;
  signalsInWindow: number;
  /** From the already-fetched /api/pnl endpoint's own openPositions count - a real
   * count of currently-pending simulated positions, not the Arena's per-strategy
   * count (that lives behind a separate, not-yet-centrally-fetched endpoint). */
  openSimulatedPositions: number;
}

export interface CommandCenterChartPoint {
  name: string;
  home?: number;
  away?: number;
}

export interface CommandCenterDecisionStep {
  title: string;
  detail: string;
  time: string;
}

export interface CommandCenterLatestSignal {
  severityLabel: string;
  target: string;
  priceMoveLabel: string;
}

export interface CommandCenterPageProps {
  kpis: CommandCenterKpis;
  selectedFixtureLabel: string;
  chartData: CommandCenterChartPoint[];
  decisionFeed: CommandCenterDecisionStep[];
  latestSignal: CommandCenterLatestSignal | null;
  systemHealthLabel: string;
}

/**
 * Most of this page is composed entirely from data App.tsx already fetches
 * on its normal 5s poll - no new API calls. Strategy Leader and
 * Verification are the exception: they self-fetch /api/arena directly
 * (same endpoint and cadence as ArenaPanel/AgentArenaPage), reusing
 * getMetaAgentRecommendation from lib/arena so the summary here can never
 * disagree with the full Agent Arena page's own callout.
 */
export function CommandCenterPage({
  kpis,
  selectedFixtureLabel,
  chartData,
  decisionFeed,
  latestSignal,
  systemHealthLabel,
}: CommandCenterPageProps) {
  const [arena, setArena] = useState<ArenaResponse | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadArena() {
      try {
        const response = await fetch(`${API_BASE_URL}/api/arena`);
        const payload = (await response.json()) as { data?: ArenaResponse };

        if (!mounted) return;

        setArena(payload.data ?? null);
      } catch (error) {
        console.error("Unable to load arena summary for Command Center overview", error);
      }
    }

    loadArena();

    const timer = window.setInterval(loadArena, 5000);

    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, []);

  const recommendation = getMetaAgentRecommendation(arena);
  const leaderScoreboard =
    arena && recommendation.agentId
      ? recommendation.agentId === "momentum_follower"
        ? arena.momentumFollower
        : recommendation.agentId === "contrarian"
          ? arena.contrarian
          : arena.kellyCriterion
      : null;

  return (
    <div id="guide-command-center-overview" className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard
          label="Live fixtures"
          value={kpis.liveFixtures}
          icon={<Radio className="h-4 w-4 text-info" />}
        />
        <MetricCard
          label="Feed freshness"
          value={kpis.feedFreshnessLabel}
          icon={<Activity className="h-4 w-4 text-positive" />}
        />
        <MetricCard
          label="Signals in window"
          value={kpis.signalsInWindow}
          icon={<SignalIcon className="h-4 w-4 text-accent-soft" />}
        />
        <MetricCard
          label="Open simulated positions"
          value={kpis.openSimulatedPositions}
          icon={<Wallet className="h-4 w-4 text-warning" />}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
        <Card className="p-4 xl:col-span-8">
          <SectionHeader eyebrow="Selected fixture" title="Market Pulse" />
          <p className="mb-3 text-xs text-stone-500">{selectedFixtureLabel}</p>
          {chartData.length >= 2 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <pattern id="ccPixelHome" width="8" height="8" patternUnits="userSpaceOnUse">
                      <rect width="8" height="8" fill="transparent" />
                      <rect width="4" height="4" fill="#f97316" fillOpacity={0.6} />
                    </pattern>
                    <pattern id="ccPixelAway" width="8" height="8" patternUnits="userSpaceOnUse">
                      <rect width="8" height="8" fill="transparent" />
                      <rect width="4" height="4" fill="#38bdf8" fillOpacity={0.4} />
                    </pattern>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="name" stroke="#78716c" fontSize={10} />
                  <YAxis stroke="#78716c" fontSize={10} />
                  <Tooltip
                    contentStyle={{ background: "#15191d", border: "1px solid rgba(255,255,255,0.08)" }}
                  />
                  <Area type="monotone" dataKey="home" stroke="#f97316" fill="url(#ccPixelHome)" />
                  <Area type="monotone" dataKey="away" stroke="#38bdf8" fill="url(#ccPixelAway)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState reason="Fewer than two comparable odds points yet - the chart will populate once the next tick arrives." />
          )}
        </Card>

        <Card id="guide-decision-feed" className="p-4 xl:col-span-4">
          <SectionHeader eyebrow="Autonomous flow" title="Decision Feed" />
          <ol className="space-y-3">
            {decisionFeed.map((step) => (
              <li key={step.title} className="border-l-2 border-accent/30 pl-3">
                <p className="text-[10px] uppercase tracking-[0.1em] text-stone-500">{step.time}</p>
                <p className="text-sm font-semibold text-white">{step.title}</p>
                <p className="text-xs text-stone-400">{step.detail}</p>
              </li>
            ))}
          </ol>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <Card className="p-4">
          <SectionHeader eyebrow="Autonomous decision" title="Latest Signal" />
          {latestSignal ? (
            <div>
              <p className="text-sm font-semibold text-white">
                {latestSignal.severityLabel} · {latestSignal.target}
              </p>
              <p className="text-xs text-stone-400">{latestSignal.priceMoveLabel}</p>
            </div>
          ) : (
            <EmptyState reason="No signal crossed the deterministic threshold in this window." />
          )}
        </Card>

        <Card className="p-4">
          <SectionHeader eyebrow="Strategy snapshot" title="Strategy Leader" />
          {leaderScoreboard ? (
            <div>
              <p className="text-sm font-semibold text-white">{leaderScoreboard.label}</p>
              <p className="text-xs text-stone-400">
                {formatRoi(leaderScoreboard.roiPercent)} ROI · {leaderScoreboard.settledCount} settled
              </p>
            </div>
          ) : (
            <EmptyState reason={recommendation.message} />
          )}
        </Card>

        <Card className="p-4">
          <SectionHeader eyebrow="Trust" title="Verification" />
          {arena ? (
            <div>
              <p className="text-sm font-semibold text-white">
                {arena.proof.verifiableStat ? "Live stat ready to verify" : "No settled signal to verify yet"}
              </p>
              <p className="truncate font-mono text-xs text-stone-400">
                Hash {arena.proof.hash.slice(0, 12)}…
              </p>
            </div>
          ) : (
            <EmptyState reason="Waiting for arena data." />
          )}
        </Card>

        <Card className="p-4">
          <SectionHeader eyebrow="Trust" title="System Health" />
          <p className="text-sm font-semibold text-white">{systemHealthLabel}</p>
        </Card>
      </div>
    </div>
  );
}
