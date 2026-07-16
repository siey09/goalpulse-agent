import { Card } from "../../components/ui/Card";
import { StatusBadge, type StatusTone } from "../../components/ui/StatusBadge";
import type { HealthStage, HealthStageStatus } from "./systemHealthModel";

const STATUS_META: Record<HealthStageStatus, { label: string; tone: StatusTone; rail: string }> = {
  healthy: { label: "Healthy", tone: "positive", rail: "bg-positive" },
  degraded: { label: "Degraded", tone: "warning", rail: "bg-warning" },
  down: { label: "Down", tone: "danger", rail: "bg-danger" },
  unknown: { label: "Unknown", tone: "neutral", rail: "bg-stone-600" },
};

export interface HealthDiagnosticSpineProps {
  stages: HealthStage[];
}

export function HealthDiagnosticSpine({ stages }: HealthDiagnosticSpineProps) {
  return (
    <Card className="overflow-hidden" aria-labelledby="diagnostic-spine-title">
      <div className="border-b border-border px-4 py-3 sm:px-5">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-stone-500">Diagnostic spine</p>
        <h2 id="diagnostic-spine-title" className="font-display text-base font-bold text-white">
          System diagnostic pipeline
        </h2>
      </div>
      <ol
        aria-label="System diagnostic pipeline"
        className="grid gap-px bg-border lg:grid-cols-5 xl:grid-cols-5"
      >
        {stages.map((stage, index) => {
          const status = STATUS_META[stage.status];
          return (
            <li key={stage.id} className="relative min-w-0 bg-surface-2 px-4 py-4 sm:px-5">
              <div
                data-testid="diagnostic-rail"
                className={`absolute inset-x-0 top-0 h-0.5 origin-left transition-transform duration-500 motion-reduce:transition-none ${status.rail}`}
              />
              {index < stages.length - 1 && (
                <span
                  data-testid="diagnostic-connector"
                  aria-hidden="true"
                  className="absolute -right-px top-7 z-10 hidden h-px w-3 bg-border-strong lg:block"
                />
              )}
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-[10px] tabular-nums text-stone-600">0{index + 1}</span>
                <StatusBadge label={status.label} tone={status.tone} withDot />
              </div>
              <p className="mt-4 text-xs font-semibold uppercase tracking-[0.08em] text-stone-400">{stage.label}</p>
              <p className="mt-1 truncate font-mono text-lg font-bold tabular-nums text-white">{stage.value}</p>
              <p className="mt-1 text-[11px] leading-4 text-stone-500">{stage.detail}</p>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
