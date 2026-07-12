import { useEffect, useState } from "react";
import { AreaChart, Area, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Activity, BadgeCheck, Radio, Signal as SignalIcon, Wallet } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { SectionHeader } from "../../components/ui/SectionHeader";
import { EmptyState } from "../../components/ui/EmptyState";
import { StatusCapsule } from "../../components/ui/widgets/StatusCapsule";
import { ProgressCapsule } from "../../components/ui/widgets/ProgressCapsule";
import { SegmentedGauge } from "../../components/ui/widgets/SegmentedGauge";
import { DeltaTicker } from "../../components/ui/widgets/DeltaTicker";
import { RadialDial } from "../../components/ui/widgets/RadialDial";
import { getMetaAgentRecommendation, formatRoi, type ArenaResponse } from "../../lib/arena";

const SEVERITY_SEGMENT: Record<string, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };
const SEVERITY_TONE: Record<string, "neutral" | "accent" | "danger"> = { LOW: "neutral", MEDIUM: "accent", HIGH: "danger" };

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
  isSystemHealthy: boolean;
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
  isSystemHealthy,
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
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatusCapsule
          label="Live fixtures"
          value={kpis.liveFixtures}
          tone="info"
          icon={<Radio className="h-4 w-4" />}
        />
        <StatusCapsule
          label="Feed freshness"
          value={kpis.feedFreshnessLabel}
          tone="positive"
          pulse
          icon={<Activity className="h-4 w-4" />}
        />
        <ProgressCapsule
          label="Signals in window"
          value={kpis.signalsInWindow}
          cap={50}
          tone="accent"
          icon={<SignalIcon className="h-4 w-4" />}
        />
        <ProgressCapsule
          label="Open simulated positions"
          value={kpis.openSimulatedPositions}
          cap={20}
          tone="warning"
          icon={<Wallet className="h-4 w-4" />}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
        <Card className="p-4 xl:col-span-8">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <SectionHeader eyebrow="Selected fixture" title="Market Pulse" />
              <p className="-mt-3 text-xs text-stone-500">{selectedFixtureLabel}</p>
            </div>
            <div className="flex items-center gap-3 text-[10px] text-stone-400">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-accent" aria-hidden="true" />
                Home odds
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-info" aria-hidden="true" />
                Away odds
              </span>
            </div>
          </div>
          {chartData.length >= 2 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <pattern id="ccPixelHome" width="8" height="8" patternUnits="userSpaceOnUse">
                      <rect width="8" height="8" fill="transparent" />
                      <rect width="4" height="4" fill="#ffb020" fillOpacity={0.6} />
                    </pattern>
                    <pattern id="ccPixelAway" width="8" height="8" patternUnits="userSpaceOnUse">
                      <rect width="8" height="8" fill="transparent" />
                      <rect width="4" height="4" fill="#5aa9ff" fillOpacity={0.4} />
                    </pattern>
                  </defs>
                  <CartesianGrid strokeDasharray="1 7" strokeLinecap="round" stroke="rgba(158,196,224,0.35)" />
                  <XAxis dataKey="name" stroke="#78716c" fontSize={10} />
                  <YAxis stroke="#78716c" fontSize={10} />
                  <Tooltip
                    cursor={{ stroke: "rgba(255,255,255,0.3)", strokeWidth: 1, strokeDasharray: "4 4" }}
                    wrapperStyle={{ zIndex: 50 }}
                    content={({ payload, label }) => {
                      const point = payload?.[0]?.payload as CommandCenterChartPoint | undefined;
                      if (!point) return null;

                      return (
                        <div className="rounded-xl border border-border bg-surface-1/95 p-3 text-xs shadow-2xl shadow-black/50">
                          <p className="mb-2 text-[10px] uppercase tracking-[0.14em] text-stone-500">{label}</p>
                          <div className="grid gap-1.5">
                            <div className="flex items-center justify-between gap-4">
                              <span className="flex items-center gap-1.5 text-stone-400">
                                <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
                                Home
                              </span>
                              <span className="font-mono font-semibold text-accent-200">{point.home?.toFixed(2) ?? "—"}</span>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                              <span className="flex items-center gap-1.5 text-stone-400">
                                <span className="h-1.5 w-1.5 rounded-full bg-info" aria-hidden="true" />
                                Away
                              </span>
                              <span className="font-mono font-semibold text-info-200">{point.away?.toFixed(2) ?? "—"}</span>
                            </div>
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Area type="monotone" dataKey="home" stroke="#ffb020" fill="url(#ccPixelHome)" />
                  <Area type="monotone" dataKey="away" stroke="#5aa9ff" fill="url(#ccPixelAway)" />
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
            <SegmentedGauge
              label={latestSignal.target}
              value={latestSignal.priceMoveLabel}
              segmentCount={3}
              activeSegment={SEVERITY_SEGMENT[latestSignal.severityLabel] ?? 0}
              tone={SEVERITY_TONE[latestSignal.severityLabel] ?? "neutral"}
            />
          ) : (
            <EmptyState reason="No signal crossed the deterministic threshold in this window." />
          )}
        </Card>

        <Card className="p-4">
          <SectionHeader eyebrow="Strategy snapshot" title="Strategy Leader" />
          {leaderScoreboard ? (
            <DeltaTicker
              label={leaderScoreboard.label}
              value={formatRoi(leaderScoreboard.roiPercent)}
              delta={`${leaderScoreboard.settledCount} settled`}
              deltaTone={leaderScoreboard.roiPercent >= 0 ? "positive" : "danger"}
              tone={leaderScoreboard.roiPercent >= 0 ? "positive" : "danger"}
            />
          ) : (
            <EmptyState reason={recommendation.message} />
          )}
        </Card>

        <Card className="p-4">
          <SectionHeader eyebrow="Trust" title="Verification" />
          {arena ? (
            <StatusCapsule
              label={`Hash ${arena.proof.hash.slice(0, 12)}…`}
              value={arena.proof.verifiableStat ? "Ready to verify" : "No settled signal yet"}
              tone="proof"
              icon={<BadgeCheck className="h-4 w-4" />}
            />
          ) : (
            <EmptyState reason="Waiting for arena data." />
          )}
        </Card>

        <Card className="p-4">
          <SectionHeader eyebrow="Trust" title="System Health" />
          <RadialDial
            label={systemHealthLabel}
            value={isSystemHealthy ? "Online" : "Degraded"}
            percent={isSystemHealthy ? 100 : 0}
            tone={isSystemHealthy ? "positive" : "warning"}
          />
        </Card>
      </div>
    </div>
  );
}
