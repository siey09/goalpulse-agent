import { useEffect, useState } from "react";
import { AreaChart, Area, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Activity, ArrowUpRight, BadgeCheck, Crosshair, Radio, ShieldCheck, Signal as SignalIcon, Wallet } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { SectionHeader } from "../../components/ui/SectionHeader";
import { EmptyState } from "../../components/ui/EmptyState";
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
  const [isArenaUnavailable, setIsArenaUnavailable] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadArena() {
      try {
        const response = await fetch(`${API_BASE_URL}/api/arena`);
        const payload = (await response.json()) as { data?: ArenaResponse };

        if (!mounted) return;

        setArena(payload.data ?? null);
        setIsArenaUnavailable(false);
      } catch {
        if (mounted) setIsArenaUnavailable(true);
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

  const liveMetrics = [
    { label: "Live fixtures", value: kpis.liveFixtures, icon: Radio, tone: "text-info" },
    { label: "Feed freshness", value: kpis.feedFreshnessLabel, icon: Activity, tone: "text-positive" },
    { label: "Signals in window", value: kpis.signalsInWindow, icon: SignalIcon, tone: "text-accent-200" },
    { label: "Open positions", value: kpis.openSimulatedPositions, icon: Wallet, tone: "text-warning" },
  ];

  return (
    <div id="guide-command-center-overview" className="mx-auto w-full max-w-[1600px] space-y-4 lg:space-y-6">
      <section aria-label="Priority signal rail">
        <Card className="overflow-hidden border-accent/25 bg-surface-3 p-0">
          {latestSignal ? (
            <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)_auto]">
              <div className="min-w-0 p-4 lg:p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-accent-200">Priority signal</span>
                  <span className="rounded-full border border-accent/25 bg-accent/10 px-2 py-0.5 font-mono text-[9px] font-bold text-accent-200">
                    {latestSignal.severityLabel}
                  </span>
                </div>
                <p className="mt-2 truncate text-xs text-stone-400">{latestSignal.matchLabel}</p>
                <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <p className="font-display text-xl font-bold tracking-tight text-white">{latestSignal.target}</p>
                  <p className="font-mono text-lg font-bold tabular-nums text-accent-200">{latestSignal.priceMoveLabel}</p>
                </div>
                <div className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-semibold text-positive-200">
                  <Crosshair className="h-3.5 w-3.5" aria-hidden="true" />
                  {latestSignal.evidenceLabel}
                </div>
              </div>

              <div className="min-w-0 border-t border-border p-4 lg:border-l lg:border-t-0 lg:p-5">
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-stone-500">Signal rationale</p>
                <p className="mt-2 text-sm leading-6 text-stone-200" title={latestSignal.explanation}>
                  {latestSignal.target} compressed {latestSignal.priceMoveLabel}; {latestSignal.explanation}
                </p>
              </div>

              <div className="flex min-w-[13rem] flex-col justify-between gap-3 border-t border-border p-4 lg:border-l lg:border-t-0 lg:p-5">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-stone-500">Confidence</p>
                  <p className="mt-1 font-mono text-xl font-bold tabular-nums text-white">{latestSignal.confidenceLabel}</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                  <button
                    type="button"
                    onClick={() => onNavigate("signals")}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-accent px-4 text-xs font-bold text-canvas transition-colors hover:bg-accent-soft"
                  >
                    Inspect signal
                    <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate("verification")}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-white/5 px-4 text-xs font-semibold text-stone-200 transition-colors hover:bg-white/10"
                  >
                    <ShieldCheck className="h-3.5 w-3.5 text-proof-200" aria-hidden="true" />
                    Open verification
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 lg:p-5">
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-accent-200">Priority signal</p>
              <EmptyState reason="No signal crossed the deterministic threshold in this window." />
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onNavigate("signals")}
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-accent px-4 text-xs font-bold text-canvas transition-colors hover:bg-accent-soft"
                >
                  Inspect signal
                  <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate("verification")}
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-white/5 px-4 text-xs font-semibold text-stone-200 transition-colors hover:bg-white/10"
                >
                  <ShieldCheck className="h-3.5 w-3.5 text-proof-200" aria-hidden="true" />
                  Open verification
                </button>
              </div>
            </div>
          )}
        </Card>
      </section>

      <section aria-label="Live status" className="overflow-hidden rounded-xl border border-border bg-surface-2">
        <div className="grid grid-cols-2 divide-x divide-y divide-border md:grid-cols-5 md:divide-y-0">
          {liveMetrics.map((metric) => {
            const Icon = metric.icon;
            return (
              <div key={metric.label} className="min-w-0 p-3 sm:p-4">
                <div className="flex items-center gap-1.5">
                  <Icon className={`h-3.5 w-3.5 shrink-0 ${metric.tone}`} aria-hidden="true" />
                  <p className="truncate text-[9px] uppercase tracking-[0.08em] text-stone-500">{metric.label}</p>
                </div>
                <p className={`mt-1 truncate font-mono text-sm font-bold tabular-nums ${metric.tone}`}>{metric.value}</p>
              </div>
            );
          })}
          <div className="col-span-2 min-w-0 p-3 sm:p-4 md:col-span-1">
            <div className="flex items-center gap-1.5">
              <Activity className={`h-3.5 w-3.5 shrink-0 ${isSystemHealthy ? "text-positive" : "text-warning"}`} aria-hidden="true" />
              <p className="truncate text-[9px] uppercase tracking-[0.08em] text-stone-500">System health</p>
            </div>
            <p className={`mt-1 truncate font-mono text-sm font-bold ${isSystemHealthy ? "text-positive" : "text-warning"}`}>
              {isSystemHealthy ? "Online" : "Degraded"}
            </p>
            <p className="truncate text-[10px] text-stone-500">{systemHealthLabel}</p>
          </div>
        </div>
      </section>

      <div
        data-testid="command-workbench"
        data-layout="signal-rail"
        className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-12 lg:gap-4"
      >
        <div className="contents lg:col-span-8 lg:block lg:space-y-4">
          <section aria-label="Market workspace" className="order-4 md:col-span-2 lg:order-none">
            <Card className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <SectionHeader
                  eyebrow="Selected fixture"
                  title="Market Pulse"
                  subtitle={selectedFixtureLabel}
                  size="standard"
                />
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
                <div className="h-52 sm:h-60 lg:h-72">
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
                            <div className="rounded-xl border border-border bg-surface-1/95 p-3 text-xs shadow-lg shadow-black/40">
                              <p className="mb-2 text-[10px] uppercase tracking-[0.14em] text-stone-500">{label}</p>
                              <div className="grid gap-1.5">
                                <div className="flex items-center justify-between gap-4">
                                  <span className="text-stone-400">Home</span>
                                  <span className="font-mono font-semibold text-accent-200">{point.home?.toFixed(2) ?? "—"}</span>
                                </div>
                                <div className="flex items-center justify-between gap-4">
                                  <span className="text-stone-400">Away</span>
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
          </section>
        </div>

        <aside aria-label="Command actions and live context" className="contents lg:col-span-4 lg:block lg:space-y-4">
          <Card className="order-2 p-3 sm:p-4 lg:order-none">
            <SectionHeader eyebrow="Next action" title="Operator brief" size="compact" />
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => onNavigate(isSystemHealthy ? "live-markets" : "system-health")}
                className="flex min-h-11 w-full items-center justify-between rounded-lg border border-border bg-black/15 px-3 text-left transition-colors hover:border-border-strong hover:bg-white/5"
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
                className="flex min-h-11 w-full items-center justify-between rounded-lg border border-border bg-black/15 px-3 text-left transition-colors hover:border-border-strong hover:bg-white/5"
              >
                <span>
                  <span className="block text-xs font-semibold text-white">Check historical precedent</span>
                  <span className="mt-0.5 block text-[11px] text-stone-500">Settled outcomes and calibration</span>
                </span>
                <ArrowUpRight className="h-4 w-4 text-stone-500" aria-hidden="true" />
              </button>
            </div>
          </Card>

          <section
            id="guide-decision-feed"
            aria-label="Decision activity"
            className="order-5 md:col-span-2 lg:order-none"
          >
            <Card className="p-3 sm:p-4">
              <SectionHeader eyebrow="Autonomous flow" title="Decision Feed" size="compact" />
              <ol className="divide-y divide-border">
                {decisionFeed.map((step) => (
                  <li key={step.title} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-semibold text-white">{step.title}</p>
                      <p className="shrink-0 font-mono text-[9px] uppercase tracking-[0.08em] text-stone-500">{step.time}</p>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-stone-400">{step.detail}</p>
                  </li>
                ))}
              </ol>
            </Card>
          </section>
        </aside>
      </div>

      <section aria-label="Trust evidence" className="overflow-x-auto">
        <Card className="min-w-[28rem] overflow-hidden p-0 md:min-w-0">
          <div className="grid grid-cols-2 divide-x divide-border">
            <div className="p-4">
              <p className="text-[10px] uppercase tracking-[0.1em] text-stone-500">Strategy leader</p>
              {leaderScoreboard ? (
                <div className="mt-2 flex items-end justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">{leaderScoreboard.label}</p>
                    <p className="text-[11px] text-stone-500">{leaderScoreboard.settledCount} settled</p>
                  </div>
                  <p className={`font-mono text-lg font-bold ${leaderScoreboard.roiPercent >= 0 ? "text-positive" : "text-danger"}`}>
                    {formatRoi(leaderScoreboard.roiPercent)}
                  </p>
                </div>
              ) : (
                <p className="mt-2 text-xs text-stone-400">
                  {isArenaUnavailable ? "Arena data unavailable." : recommendation.message}
                </p>
              )}
            </div>

            <div className="p-4">
              <div className="flex items-center gap-2">
                <BadgeCheck className="h-4 w-4 text-proof-200" aria-hidden="true" />
                <p className="text-[10px] uppercase tracking-[0.1em] text-stone-500">Verification</p>
              </div>
              {arena ? (
                <div className="mt-2">
                  <p className="text-sm font-semibold text-white">
                    {arena.proof.verifiableStat ? "Ready to verify" : "No settled signal yet"}
                  </p>
                  <p className="mt-0.5 truncate font-mono text-[10px] text-proof-200">Hash {arena.proof.hash.slice(0, 12)}…</p>
                </div>
              ) : (
                <p className="mt-2 text-xs text-stone-400">
                  {isArenaUnavailable ? "Arena data unavailable." : "Waiting for arena data."}
                </p>
              )}
            </div>

          </div>
        </Card>
      </section>
    </div>
  );
}
