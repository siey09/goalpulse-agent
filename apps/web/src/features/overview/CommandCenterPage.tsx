import { useEffect, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  BadgeCheck,
  Crosshair,
  DatabaseZap,
  Radio,
  ShieldCheck,
  Signal as SignalIcon,
  Wallet,
} from "lucide-react";
import { Card } from "../../components/ui/Card";
import { EmptyState } from "../../components/ui/EmptyState";
import type { ArenaResponse } from "../../lib/arena";
import type { DestinationId } from "../../app/navigation";
import { OperationalComposition } from "./OperationalComposition";
import { RiskSnapshot } from "./RiskSnapshot";
import { StrategyRoiComparison } from "./StrategyRoiComparison";
import type {
  CommandCenterPnlSummary,
  FixturePipelineSummary,
  SignalOutcomeSummary,
} from "./commandCenterOverview";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "https://goalpulse-agent-api.onrender.com";

export interface CommandCenterKpis {
  liveFixtures: number;
  feedFreshnessLabel: string;
  signalsInWindow: number | null;
  openSimulatedPositions: number | null;
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

export interface CommandCenterArchiveStatus {
  pending: number;
  failures: number;
}

export interface CommandCenterPageProps {
  kpis: CommandCenterKpis;
  fixturePipeline: FixturePipelineSummary;
  signalOutcomes: SignalOutcomeSummary | null;
  pnl: CommandCenterPnlSummary | null;
  archiveStatus: CommandCenterArchiveStatus | null;
  decisionFeed: CommandCenterDecisionStep[];
  latestSignal: CommandCenterLatestSignal | null;
  systemHealthLabel: string;
  isSystemHealthy: boolean;
  onNavigate: (destination: DestinationId) => void;
}

export function CommandCenterPage({
  kpis,
  fixturePipeline,
  signalOutcomes,
  pnl,
  archiveStatus,
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
        if (!response.ok) throw new Error(`Arena request failed with ${response.status}`);

        const payload = (await response.json()) as { data?: ArenaResponse };
        if (!mounted) return;

        setArena(payload.data ?? null);
        setIsArenaUnavailable(false);
      } catch {
        if (mounted) {
          setArena(null);
          setIsArenaUnavailable(true);
        }
      }
    }

    loadArena();
    const timer = window.setInterval(loadArena, 5000);

    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, []);

  const liveMetrics = [
    { label: "Live fixtures", value: kpis.liveFixtures, icon: Radio, tone: "text-info", divider: "border-b border-r lg:border-b-0" },
    { label: "Feed freshness", value: kpis.feedFreshnessLabel, icon: Activity, tone: "text-positive", divider: "border-b md:border-r lg:border-b-0" },
    { label: "Signals in window", value: kpis.signalsInWindow ?? "—", icon: SignalIcon, tone: "text-accent-200", divider: "border-b border-r md:border-r-0 lg:border-b-0 lg:border-r" },
    { label: "Open positions", value: kpis.openSimulatedPositions ?? "—", icon: Wallet, tone: "text-warning", divider: "border-b md:border-b-0 md:border-r" },
  ];

  const fixtureItems = [
    { id: "live", label: "Live", count: fixturePipeline.live, tone: "positive" as const },
    { id: "upcoming", label: "Upcoming", count: fixturePipeline.upcoming, tone: "info" as const },
    { id: "finished", label: "Finished", count: fixturePipeline.finished, tone: "neutral" as const },
  ];

  const outcomeItems = signalOutcomes
    ? [
        { id: "confirmed", label: "Confirmed", count: signalOutcomes.confirmed, tone: "positive" as const },
        { id: "rejected", label: "Rejected", count: signalOutcomes.rejected, tone: "danger" as const },
        { id: "pending", label: "Pending", count: signalOutcomes.pending, tone: "warning" as const },
      ]
    : null;
  const settledSignals = signalOutcomes ? signalOutcomes.confirmed + signalOutcomes.rejected : 0;
  const accuracyReadout =
    settledSignals > 0 && signalOutcomes?.strategyAccuracy != null
      ? `${signalOutcomes.strategyAccuracy}% reported accuracy`
      : undefined;

  const proofState = arena
    ? arena.proof.verifiableStat
      ? "Ready to verify"
      : "No settled signal yet"
    : isArenaUnavailable
      ? "Arena data unavailable."
      : "Waiting for arena data.";
  const archiveState = archiveStatus
    ? archiveStatus.failures > 0
      ? `${archiveStatus.failures} archive failure${archiveStatus.failures === 1 ? "" : "s"}`
      : archiveStatus.pending > 0
        ? `${archiveStatus.pending} archive write${archiveStatus.pending === 1 ? "" : "s"} pending`
        : "Archive healthy"
    : "Archive status unavailable.";

  return (
    <div id="guide-command-center-overview" className="mx-auto w-full max-w-[1600px] space-y-4 lg:space-y-5">
      <section aria-label="Priority signal rail">
        <Card className="overflow-hidden border-accent/25 bg-surface-3 p-0">
          {latestSignal ? (
            <div
              data-testid="priority-signal-grid"
              className="grid md:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)_auto]"
            >
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

              <div className="min-w-0 border-t border-border p-4 md:border-l md:border-t-0 lg:p-5">
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-stone-400">Signal rationale</p>
                <p className="mt-2 line-clamp-2 text-sm leading-6 text-stone-200" title={latestSignal.explanation}>
                  {latestSignal.explanation}
                </p>
              </div>

              <div
                data-testid="priority-signal-actions"
                className="flex min-w-0 flex-col justify-between gap-3 border-t border-border p-4 md:col-span-2 lg:col-span-1 lg:min-w-52 lg:border-l lg:border-t-0 lg:p-5"
              >
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-stone-400">Confidence</p>
                  <p className="mt-1 font-mono text-xl font-bold tabular-nums text-white">{latestSignal.confidenceLabel}</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                  <button
                    type="button"
                    onClick={() => onNavigate("signals")}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-accent px-4 text-xs font-bold text-canvas transition-colors hover:bg-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                  >
                    Inspect signal
                    <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate("verification")}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-white/5 px-4 text-xs font-semibold text-stone-200 transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-proof/60"
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
                <button type="button" onClick={() => onNavigate("signals")} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-accent px-4 text-xs font-bold text-canvas">
                  Inspect signal <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                <button type="button" onClick={() => onNavigate("verification")} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-white/5 px-4 text-xs font-semibold text-stone-200">
                  <ShieldCheck className="h-3.5 w-3.5 text-proof-200" aria-hidden="true" /> Open verification
                </button>
              </div>
            </div>
          )}
        </Card>
      </section>

      <section aria-label="Live status" className="overflow-hidden rounded-xl border border-border bg-surface-2">
        <div data-testid="live-status-grid" className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
          {liveMetrics.map((metric) => {
            const Icon = metric.icon;
            return (
              <div key={metric.label} className={`min-w-0 border-border p-3 sm:p-4 ${metric.divider}`}>
                <div className="flex items-center gap-1.5">
                  <Icon className={`h-3.5 w-3.5 shrink-0 ${metric.tone}`} aria-hidden="true" />
                  <p className="truncate text-[9px] uppercase tracking-[0.08em] text-stone-400">{metric.label}</p>
                </div>
                <p className={`mt-1 truncate font-mono text-sm font-bold tabular-nums ${metric.tone}`}>{metric.value}</p>
              </div>
            );
          })}
          <div className="col-span-2 min-w-0 p-3 sm:p-4 md:col-span-2 lg:col-span-1">
            <div className="flex items-center gap-1.5">
              <Activity className={`h-3.5 w-3.5 shrink-0 ${isSystemHealthy ? "text-positive" : "text-warning"}`} aria-hidden="true" />
              <p className="truncate text-[9px] uppercase tracking-[0.08em] text-stone-400">System health</p>
            </div>
            <p className={`mt-1 truncate font-mono text-sm font-bold ${isSystemHealthy ? "text-positive" : "text-warning"}`}>
              {isSystemHealthy ? "Online" : "Degraded"}
            </p>
            <p className="truncate text-[10px] text-stone-400">{systemHealthLabel}</p>
            <button
              type="button"
              aria-label={isSystemHealthy ? "Compare live market context" : "Resolve degraded stream state"}
              onClick={() => onNavigate(isSystemHealthy ? "live-markets" : "system-health")}
              className="mt-2 inline-flex min-h-11 w-full items-center justify-between gap-2 rounded-lg bg-white/5 px-3 text-left text-[10px] font-semibold text-stone-200 transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
            >
              <span className="truncate">{isSystemHealthy ? "Compare live market context" : "Resolve degraded stream state"}</span>
              <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-stone-400" aria-hidden="true" />
            </button>
          </div>
        </div>
      </section>

      <div
        data-testid="command-workbench"
        data-layout="operational-overview"
        className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-12"
      >
        <section id="guide-decision-feed" aria-label="Decision activity" className="min-w-0 lg:col-span-7">
          <Card className="h-full p-3 sm:p-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div>
                <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-info-200/70">Agent activity</p>
                <h2 className="font-display text-base font-bold tracking-tight text-white">Decision Feed</h2>
              </div>
              <button
                type="button"
                onClick={() => onNavigate("archive")}
                className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-stone-300 transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
              >
                Open archive <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
            {decisionFeed.length > 0 ? (
              <ol className="divide-y divide-border">
                {decisionFeed.map((step) => (
                  <li key={`${step.title}-${step.time}`} className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-x-3 py-3.5 first:pt-2 last:pb-1">
                    <span className="mt-1.5 h-2 w-2 rounded-full border border-info/60 bg-info/25" aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-white" title={step.title}>{step.title}</p>
                      <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-stone-400" title={step.detail}>{step.detail}</p>
                    </div>
                    <time className="shrink-0 font-mono text-[9px] tabular-nums text-stone-500">{step.time}</time>
                  </li>
                ))}
              </ol>
            ) : (
              <EmptyState reason="No decision event is available yet. Open the archive to inspect earlier runs." />
            )}
          </Card>
        </section>

        <aside aria-label="Operational horizon" className="grid min-w-0 gap-4 sm:grid-cols-2 lg:col-span-5 lg:grid-cols-1">
          <OperationalComposition
            title="Fixture pipeline"
            description="Current coverage across the match lifecycle"
            items={fixtureItems}
            emptyMessage="No fixtures in the current feed."
            unavailableMessage="Fixture data unavailable."
            actionLabel="Open Live Markets"
            onAction={() => onNavigate("live-markets")}
          />
          <OperationalComposition
            title="Signal outcomes"
            description="Audited engine decisions and pending evidence"
            items={outcomeItems}
            emptyMessage="No signals have entered the audit yet."
            unavailableMessage="Signal audit data unavailable."
            secondaryReadout={accuracyReadout}
          />
        </aside>
      </div>

      <div data-testid="command-insight-grid" className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-12">
        <div className="min-w-0 xl:col-span-5">
          <StrategyRoiComparison arena={arena} isUnavailable={isArenaUnavailable} />
        </div>
        <div className="min-w-0 xl:col-span-3">
          <RiskSnapshot pnl={pnl} />
        </div>
        <div className="min-w-0 md:col-span-2 xl:col-span-4">
          <Card className="h-full p-0">
            <section aria-label="Trust evidence" className="p-4">
              <div>
                <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-proof-200/70">Evidence chain</p>
                <h2 className="font-display text-sm font-bold tracking-tight text-white">Trust and verification</h2>
              </div>

              <div className="mt-4 divide-y divide-border rounded-lg border border-border bg-black/15">
                <div className="flex items-start gap-3 p-3">
                  <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-proof-200" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-wide text-stone-500">Proof</p>
                    <p className="mt-1 text-xs font-semibold text-white">{proofState}</p>
                    {arena && <p className="mt-0.5 truncate font-mono text-[9px] text-proof-200">Hash {arena.proof.hash.slice(0, 12)}</p>}
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3">
                  <Activity className={`mt-0.5 h-4 w-4 shrink-0 ${isSystemHealthy ? "text-positive" : "text-warning"}`} aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-wide text-stone-500">Live stream</p>
                    <p className={`mt-1 text-xs font-semibold ${isSystemHealthy ? "text-positive-200" : "text-warning-200"}`}>
                      {isSystemHealthy ? "Connected" : "Degraded"}
                    </p>
                    <p className="mt-0.5 truncate text-[10px] text-stone-500">{systemHealthLabel}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3">
                  <DatabaseZap className={`mt-0.5 h-4 w-4 shrink-0 ${archiveStatus?.failures ? "text-danger" : "text-info"}`} aria-hidden="true" />
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-stone-500">Odds archive</p>
                    <p className="mt-1 text-xs font-semibold text-white">{archiveState}</p>
                  </div>
                </div>
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => onNavigate("verification")}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-proof/10 px-3 text-xs font-semibold text-proof-100 transition-colors hover:bg-proof/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-proof/60"
                >
                  Review proof <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate("system-health")}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-white/5 px-3 text-xs font-semibold text-stone-200 transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                >
                  Review system health <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            </section>
          </Card>
        </div>
      </div>
    </div>
  );
}
