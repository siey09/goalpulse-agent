import { useEffect, useState } from "react";
import { AreaChart, Area, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Activity, ArrowUpRight, BadgeCheck, Crosshair, Radio, ShieldCheck, Signal as SignalIcon, Wallet } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { SectionHeader } from "../../components/ui/SectionHeader";
import { EmptyState } from "../../components/ui/EmptyState";
import { StatusCapsule } from "../../components/ui/widgets/StatusCapsule";
import { ProgressCapsule } from "../../components/ui/widgets/ProgressCapsule";
import { DeltaTicker } from "../../components/ui/widgets/DeltaTicker";
import { RadialDial } from "../../components/ui/widgets/RadialDial";
import { getMetaAgentRecommendation, formatRoi, type ArenaResponse } from "../../lib/arena";
import type { DestinationId } from "../../app/navigation";

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
  matchLabel: string;
  confidenceLabel: string;
  evidenceLabel: string;
  explanation: string;
}

export interface CommandCenterPageProps {
  kpis: CommandCenterKpis;
  selectedFixtureLabel: string;
  chartData: CommandCenterChartPoint[];
  decisionFeed: CommandCenterDecisionStep[];
  latestSignal: CommandCenterLatestSignal | null;
  systemHealthLabel: string;
  isSystemHealthy: boolean;
  onNavigate: (destination: DestinationId) => void;
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
  onNavigate,
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

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        <Card elevated className="relative overflow-hidden p-5 lg:col-span-8">
          <span className="absolute inset-y-0 left-0 w-1 bg-accent" aria-hidden="true" />
          <div className="flex flex-wrap items-start justify-between gap-4">
            <SectionHeader eyebrow="Priority intelligence" title="Most important signal now" />
            {latestSignal && (
              <span className="rounded-full border border-accent/25 bg-accent/10 px-2.5 py-1 font-mono text-[10px] font-bold text-accent-200">
                {latestSignal.severityLabel} · {latestSignal.confidenceLabel} confidence
              </span>
            )}
          </div>

          {latestSignal ? (
            <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.35fr)]">
              <div>
                <p className="text-xs text-stone-400">{latestSignal.matchLabel}</p>
                <p className="mt-1 font-display text-2xl font-bold tracking-tight text-white">
                  {latestSignal.target}
                  <span className="ml-2 font-mono text-accent-200">{latestSignal.priceMoveLabel}</span>
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-positive/20 bg-positive/8 px-2.5 py-1.5 text-[11px] font-semibold text-positive-200">
                    <Crosshair className="h-3.5 w-3.5" aria-hidden="true" />
                    {latestSignal.evidenceLabel}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-black/20 px-2.5 py-1.5 text-[11px] text-stone-300">
                    Deterministic threshold crossed
                  </span>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="border-l border-border pl-3">
                  <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-stone-500">What changed</p>
                  <p className="mt-1 text-sm leading-5 text-stone-200">
                    {latestSignal.target} compressed {latestSignal.priceMoveLabel} from its earlier market price.
                  </p>
                </div>
                <div className="border-l border-border pl-3">
                  <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-stone-500">Why it matters</p>
                  <p className="mt-1 text-sm leading-5 text-stone-200">{latestSignal.explanation}</p>
                </div>
              </div>
            </div>
          ) : (
            <EmptyState reason="No signal crossed the deterministic threshold in this window." />
          )}

          <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4">
            <button
              type="button"
              onClick={() => onNavigate("signals")}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-accent px-3.5 text-xs font-bold text-canvas transition-colors hover:bg-accent-soft"
            >
              Inspect signal
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => onNavigate("verification")}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border bg-white/5 px-3.5 text-xs font-semibold text-stone-200 transition-colors hover:bg-white/10"
            >
              <ShieldCheck className="h-3.5 w-3.5 text-proof-200" aria-hidden="true" />
              Open verification
            </button>
          </div>
        </Card>

        <Card className="p-5 lg:col-span-4">
          <SectionHeader eyebrow="Operator brief" title="What to inspect next" />
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => onNavigate(isSystemHealthy ? "live-markets" : "system-health")}
              className="flex min-h-12 w-full items-center justify-between rounded-lg border border-border bg-black/15 px-3 text-left transition-colors hover:border-border-strong hover:bg-white/5"
            >
              <span>
                <span className="block text-xs font-semibold text-white">
                  {isSystemHealthy ? "Compare live market context" : "Resolve degraded stream state"}
                </span>
                <span className="mt-0.5 block text-[11px] text-stone-500">{systemHealthLabel}</span>
              </span>
              <ArrowUpRight className="h-4 w-4 text-stone-500" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => onNavigate("archive")}
              className="flex min-h-12 w-full items-center justify-between rounded-lg border border-border bg-black/15 px-3 text-left transition-colors hover:border-border-strong hover:bg-white/5"
            >
              <span>
                <span className="block text-xs font-semibold text-white">Check historical precedent</span>
                <span className="mt-0.5 block text-[11px] text-stone-500">Compare settled outcomes and calibration</span>
              </span>
              <ArrowUpRight className="h-4 w-4 text-stone-500" aria-hidden="true" />
            </button>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        <Card className="p-4 lg:col-span-8">
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

        <Card id="guide-decision-feed" className="p-4 lg:col-span-4">
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

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
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
