import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Database,
  Gauge,
  Server,
  ShieldAlert,
} from "lucide-react";
import type { ReactNode } from "react";
import { Card } from "../../components/ui/Card";
import { StatusBadge, type StatusTone } from "../../components/ui/StatusBadge";
import type { Health } from "../../types";
import { HealthDiagnosticSpine } from "./HealthDiagnosticSpine";
import { StreamMonitorCard } from "./StreamMonitorCard";
import {
  deriveHealthIncidents,
  deriveHealthStages,
  formatHealthDuration,
  formatHealthTime,
  summarizeHealthVerdict,
  type ArchiveHealthSummary,
  type HealthIncident,
} from "./systemHealthModel";
import { useSystemObservability, type ObservabilitySourceState } from "./useSystemObservability";

export interface SystemHealthPageProps {
  health: Health | null;
  archiveStatus: ArchiveHealthSummary | null;
}

const VERDICT_STYLE = {
  healthy: {
    border: "border-positive/30",
    glow: "from-positive/16 via-transparent to-transparent",
    text: "text-positive",
    tone: "positive" as StatusTone,
    icon: CheckCircle2,
  },
  degraded: {
    border: "border-warning/30",
    glow: "from-warning/16 via-transparent to-transparent",
    text: "text-warning",
    tone: "warning" as StatusTone,
    icon: AlertTriangle,
  },
  down: {
    border: "border-danger/35",
    glow: "from-danger/18 via-transparent to-transparent",
    text: "text-danger",
    tone: "danger" as StatusTone,
    icon: ShieldAlert,
  },
  unknown: {
    border: "border-border",
    glow: "from-stone-500/10 via-transparent to-transparent",
    text: "text-stone-300",
    tone: "neutral" as StatusTone,
    icon: Activity,
  },
};

function TelemetryCard({
  icon,
  label,
  value,
  detail,
  children,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
  children?: ReactNode;
}) {
  return (
    <Card className="min-w-0 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-stone-600">{label}</p>
          <p className="mt-2 truncate font-mono text-xl font-bold tabular-nums text-white">{value}</p>
        </div>
        <span className="rounded-lg border border-border bg-surface-3 p-2 text-stone-400" aria-hidden="true">
          {icon}
        </span>
      </div>
      <p className="mt-2 text-[11px] leading-4 text-stone-500">{detail}</p>
      {children}
    </Card>
  );
}

function sourceNotice(label: string, state: ObservabilitySourceState): string | null {
  if (state === "stale") return `${label} refresh failed; showing the last successful reading.`;
  if (state === "unavailable") return `${label} data is unavailable.`;
  if (state === "loading") return `${label} data is loading.`;
  return null;
}

function IncidentRow({ incident }: { incident: HealthIncident }) {
  const critical = incident.severity === "critical";
  return (
    <li className="border-t border-border px-4 py-3 first:border-t-0 sm:px-5">
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 ${critical ? "text-danger" : "text-warning"}`} aria-hidden="true">
          {critical ? <ShieldAlert size={16} /> : <AlertTriangle size={16} />}
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`font-mono text-[9px] font-bold uppercase tracking-[0.12em] ${critical ? "text-danger" : "text-warning"}`}>
              {critical ? "Critical" : "Warning"}
            </span>
            <p className="text-xs font-semibold text-stone-100">{incident.title}</p>
          </div>
          <p className="mt-1 text-[11px] leading-4 text-stone-500">{incident.evidence}</p>
        </div>
      </div>
    </li>
  );
}

export function SystemHealthPage({ health, archiveStatus }: SystemHealthPageProps) {
  const {
    metrics,
    feedHealth,
    metricsState,
    feedHealthState,
    lastSuccessfulRefreshAt,
  } = useSystemObservability();
  const verdict = summarizeHealthVerdict(feedHealth);
  const verdictStyle = VERDICT_STYLE[verdict.tone];
  const VerdictIcon = verdictStyle.icon;
  const stages = deriveHealthStages({ health, feedHealth, archiveStatus });
  const incidents = deriveHealthIncidents({ health, metrics, feedHealth, archiveStatus });
  const notices = [
    sourceNotice("Metrics", metricsState),
    sourceNotice("Feed health", feedHealthState),
  ].filter((notice): notice is string => Boolean(notice));
  const evidenceComplete = Boolean(
    health && archiveStatus && metricsState === "fresh" && feedHealthState === "fresh"
  );
  const coverage = feedHealth?.fixtureCoverage;
  const coverageRatio = coverage?.lastRunEligibleFixtureCount && coverage.lastRunProcessedCount !== null
    ? Math.min(100, (coverage.lastRunProcessedCount / coverage.lastRunEligibleFixtureCount) * 100)
    : null;
  const duplicateCount = metrics
    ? metrics.duplicatesDropped.snapshots + metrics.duplicatesDropped.signals
    : null;

  return (
    <div className="space-y-4 overflow-x-clip">
      <Card
        elevated
        role="status"
        aria-label="Overall system health"
        aria-live="polite"
        className={`relative overflow-hidden p-4 sm:p-5 ${verdictStyle.border}`}
      >
        <div className={`pointer-events-none absolute inset-0 bg-gradient-to-r ${verdictStyle.glow}`} aria-hidden="true" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <span className={`rounded-xl border border-current/20 bg-black/20 p-3 ${verdictStyle.text}`} aria-hidden="true">
              <VerdictIcon size={22} />
            </span>
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-stone-500">Overall system health</p>
              <div className="mt-1 flex flex-wrap items-center gap-3">
                <h1 className={`font-display text-3xl font-bold tracking-tight ${verdictStyle.text}`}>{verdict.label}</h1>
                <StatusBadge
                  label={health?.useSimulatedFeed ? "Simulated feed" : "Real TxLINE"}
                  tone={health?.useSimulatedFeed ? "neutral" : "accent"}
                />
              </div>
              <p className="mt-1 text-xs text-stone-400">
                {incidents.length > 0
                  ? `${incidents.length} active issue${incidents.length === 1 ? "" : "s"} require operator attention.`
                  : evidenceComplete
                    ? "Every required health source is current and clear."
                    : "Some required evidence is still loading or unavailable."}
              </p>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 border-t border-border pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
            <div>
              <dt className="font-mono text-[9px] uppercase tracking-[0.12em] text-stone-600">Last refresh</dt>
              <dd className="mt-1 font-mono text-xs tabular-nums text-stone-200">{formatHealthTime(lastSuccessfulRefreshAt)}</dd>
            </div>
            <div>
              <dt className="font-mono text-[9px] uppercase tracking-[0.12em] text-stone-600">API state</dt>
              <dd className="mt-1 font-mono text-xs uppercase text-stone-200">{health?.status ?? (health?.ok ? "running" : "unavailable")}</dd>
            </div>
          </dl>
        </div>
      </Card>

      {notices.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2" aria-label="Observability source notices">
          {notices.map((notice) => (
            <p key={notice} className="rounded-lg border border-warning/20 bg-warning/5 px-3 py-2 text-[11px] text-warning">
              {notice}
            </p>
          ))}
        </div>
      )}

      <section aria-labelledby="telemetry-title">
        <div className="mb-2 flex items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-stone-600">Current evidence</p>
            <h2 id="telemetry-title" className="font-display text-base font-bold text-white">Operational telemetry</h2>
          </div>
          <p className="hidden font-mono text-[10px] text-stone-600 sm:block">
            {duplicateCount === null ? "Duplicate data unavailable" : `${duplicateCount} total duplicates dropped`}
          </p>
        </div>
        <div data-testid="health-telemetry-grid" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <TelemetryCard
            icon={<Server size={16} />}
            label="API uptime"
            value={metrics ? formatHealthDuration(metrics.uptimeSeconds * 1000) : "Unavailable"}
            detail={health?.ok ? "API responds to health checks" : "API status unavailable"}
          />
          <TelemetryCard
            icon={<Clock3 size={16} />}
            label="Agent cycle"
            value={feedHealth ? formatHealthDuration(feedHealth.cycleHealth.cycleGapMs) : "Unavailable"}
            detail={metrics?.lastAgentCycle
              ? `${formatHealthDuration(metrics.lastAgentCycle.decisionLatencyMs)} decision latency`
              : "Decision latency unavailable"}
          />
          <TelemetryCard
            icon={<Gauge size={16} />}
            label="Odds freshness"
            value={feedHealth ? `${feedHealth.oddsFreshness.staleLiveMatchCount} stale` : "Unavailable"}
            detail={feedHealth
              ? `${formatHealthDuration(feedHealth.oddsFreshness.staleThresholdMs)} backend threshold`
              : "Freshness threshold unavailable"}
          />
          <TelemetryCard
            icon={<Database size={16} />}
            label="Fixture coverage"
            value={coverage?.lastRunProcessedCount !== null && coverage?.lastRunProcessedCount !== undefined && coverage.lastRunEligibleFixtureCount !== null
              ? `${coverage.lastRunProcessedCount}/${coverage.lastRunEligibleFixtureCount}`
              : "Unavailable"}
            detail={coverage
              ? `${coverage.lastRunRawFixtureCount ?? "Unknown"} discovered · ${coverage.lastRunOddsEnrichmentFailures} enrichment failure(s)`
              : "Coverage data unavailable"}
          >
            {coverageRatio !== null && (
              <div className="mt-3 h-1 overflow-hidden rounded-full bg-surface-3" aria-label={`${Math.round(coverageRatio)}% fixture coverage`}>
                <div
                  className="h-full rounded-full bg-info transition-[width] duration-500 motion-reduce:transition-none"
                  style={{ width: `${coverageRatio}%` }}
                />
              </div>
            )}
          </TelemetryCard>
        </div>
        <p className="mt-2 font-mono text-[10px] text-stone-600 sm:hidden">
          {duplicateCount === null ? "Duplicate data unavailable" : `${duplicateCount} total duplicates dropped`}
        </p>
      </section>

      <div data-testid="health-cockpit-grid" className="grid gap-4 xl:grid-cols-12">
        <div className="min-w-0 xl:col-span-8">
          <HealthDiagnosticSpine stages={stages} />
        </div>
        <Card className="min-w-0 overflow-hidden xl:col-span-4" aria-labelledby="incidents-title">
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-stone-600">Issue first</p>
              <h2 id="incidents-title" className="font-display text-base font-bold text-white">Active incidents</h2>
            </div>
            <StatusBadge
              label={incidents.length ? `${incidents.length} active` : evidenceComplete ? "Clear" : "Checking"}
              tone={incidents.length ? "danger" : evidenceComplete ? "positive" : "neutral"}
            />
          </div>
          {incidents.length > 0 ? (
            <ul aria-label="Active health incidents">{incidents.map((incident) => <IncidentRow key={incident.id} incident={incident} />)}</ul>
          ) : evidenceComplete ? (
            <div className="flex items-start gap-3 px-4 py-5 text-positive sm:px-5">
              <CheckCircle2 size={16} aria-hidden="true" />
              <p className="text-xs">No active health incidents.</p>
            </div>
          ) : (
            <div className="space-y-2 px-4 py-5 text-xs text-stone-400 sm:px-5">
              {!archiveStatus && <p>Archive data unavailable.</p>}
              {feedHealthState !== "fresh" && <p>Feed-health evidence is not current.</p>}
              {metricsState !== "fresh" && <p>Metrics evidence is not current.</p>}
              {!health && <p>API health evidence is unavailable.</p>}
            </div>
          )}
        </Card>
      </div>

      <div data-testid="health-stream-grid" className="grid gap-4 lg:grid-cols-2">
        <StreamMonitorCard
          title="TxLINE push stream"
          stream={health?.liveStream ?? null}
          metrics={metrics?.liveStream ?? null}
          isSimulated={health?.useSimulatedFeed === true}
        />
        <StreamMonitorCard
          title="Live odds stream"
          stream={health?.liveOddsStream ?? null}
          metrics={metrics?.liveOddsStream ?? null}
          isSimulated={health?.useSimulatedFeed === true}
        />
      </div>

      <Card className="p-4" aria-labelledby="threshold-reference-title">
        <div className="grid gap-4 lg:grid-cols-[1fr_3fr] lg:items-center">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-stone-600">Detection constants</p>
            <h2 id="threshold-reference-title" className="font-display text-sm font-bold text-white">Signal threshold reference</h2>
          </div>
          <dl className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-3">
            {[
              ["Watch", "≥ 4%"],
              ["Momentum shift", "≥ 8%"],
              ["Sharp move", "≥ 15%"],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-3 bg-surface-3 px-3 py-2">
                <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-stone-400">{label}</dt>
                <dd className="font-mono text-xs font-bold tabular-nums text-accent-soft">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Card>
    </div>
  );
}
