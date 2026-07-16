import { Radio, WifiOff } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { StatusBadge, type StatusTone } from "../../components/ui/StatusBadge";
import { formatHealthDuration, formatHealthTime, type MetricsStreamState } from "./systemHealthModel";

export interface HealthStreamFacts {
  connected?: boolean;
  lastEventAt?: string | null;
  totalEventsReceived?: number;
  totalReconnects?: number;
  lastError?: string | null;
}

export interface StreamMonitorCardProps {
  title: string;
  stream: HealthStreamFacts | null;
  metrics: MetricsStreamState | null;
  isSimulated: boolean;
}

const STATUS_TONE: Record<MetricsStreamState["status"], StatusTone> = {
  STREAMING: "positive",
  STALE: "warning",
  RECONNECTING: "danger",
  STOPPED: "neutral",
};

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="font-mono text-[9px] uppercase tracking-[0.12em] text-stone-600">{label}</dt>
      <dd className="mt-1 truncate font-mono text-sm font-semibold tabular-nums text-stone-100">{value}</dd>
    </div>
  );
}

export function StreamMonitorCard({ title, stream, metrics, isSimulated }: StreamMonitorCardProps) {
  const status = metrics?.status;
  const explanation = status === "STOPPED" && isSimulated
    ? "Intentionally disabled in simulated mode"
    : status === "STALE"
      ? "Stream is stale"
      : status === "RECONNECTING"
        ? stream?.lastError ?? "Connection retry in progress"
        : status === "STREAMING"
          ? "Valid events are arriving"
          : stream
            ? "Status data unavailable; health counters retained"
            : "Stream data unavailable";

  return (
    <Card className="relative overflow-hidden p-4 sm:p-5" aria-labelledby={`${title.replaceAll(" ", "-")}-title`}>
      <div className="absolute inset-y-0 left-0 w-px bg-gradient-to-b from-transparent via-info/60 to-transparent" aria-hidden="true" />
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="rounded-lg border border-info/20 bg-info/10 p-2 text-info" aria-hidden="true">
            {status === "STOPPED" || status === "RECONNECTING" ? <WifiOff size={16} /> : <Radio size={16} />}
          </span>
          <div className="min-w-0">
            <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-stone-600">Stream monitor</p>
            <h2 id={`${title.replaceAll(" ", "-")}-title`} className="truncate font-display text-base font-bold text-white">
              {title}
            </h2>
          </div>
        </div>
        {status && <StatusBadge label={status} tone={STATUS_TONE[status]} withDot />}
      </div>

      <p className={`mt-4 text-xs ${status === "RECONNECTING" ? "text-danger" : status === "STALE" ? "text-warning" : "text-stone-400"}`}>
        {explanation}
      </p>

      {stream && (
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border pt-4 sm:grid-cols-4">
          <Fact label="Connection" value={(metrics?.connected ?? stream.connected) ? "Connected" : "Disconnected"} />
          <Fact label="Last valid event" value={metrics ? formatHealthDuration(metrics.staleForMs) : formatHealthTime(stream.lastEventAt)} />
          <Fact label="Events received" value={stream.totalEventsReceived?.toLocaleString() ?? "Unavailable"} />
          <Fact label="Reconnects" value={(metrics?.totalReconnects ?? stream.totalReconnects)?.toLocaleString() ?? "Unavailable"} />
        </dl>
      )}
    </Card>
  );
}
