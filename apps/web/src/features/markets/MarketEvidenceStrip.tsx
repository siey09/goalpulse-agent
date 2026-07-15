import type { Health } from "../../types";
import type { LiveMarketsFieldContext } from "./LiveMarketsPage";

export interface MarketEvidenceStripProps {
  chartDataCount: number;
  health: Health | null;
  correctSignals: number;
  closedSignals: number;
  fieldContext: LiveMarketsFieldContext;
  signalCount: number;
}

function EvidenceCell({ label, value, detail, valueClass = "text-white" }: { label: string; value: string; detail: string; valueClass?: string }) {
  return (
    <div className="min-w-0 border-border p-3 max-sm:border-b sm:border-r sm:last:border-r-0">
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-stone-500">{label}</p>
      <p className={`mt-1 truncate font-mono text-sm font-semibold tabular-nums ${valueClass}`}>{value}</p>
      <p className="mt-0.5 truncate text-[10px] text-stone-500">{detail}</p>
    </div>
  );
}

export function MarketEvidenceStrip({
  chartDataCount,
  health,
  correctSignals,
  closedSignals,
  fieldContext,
  signalCount,
}: MarketEvidenceStripProps) {
  const isFeedConnected = health?.liveStream?.connected === true;
  const feedCoverage = isFeedConnected ? `${health.liveStream?.totalEventsReceived ?? 0} events` : "Unavailable";

  return (
    <section aria-label="Selected market evidence" className="grid border-t border-border bg-black/10 sm:grid-cols-2 lg:grid-cols-4">
      <EvidenceCell label="Snapshots" value={`${chartDataCount}`} detail="selected fixture timeline" valueClass="text-info-200" />
      <EvidenceCell
        label="Field context"
        value={fieldContext.label}
        detail={fieldContext.tone === "positive" ? "scores evidence attached" : "market-only evidence"}
        valueClass={fieldContext.tone === "positive" ? "text-positive-200" : "text-stone-300"}
      />
      <EvidenceCell label="Outcome audit" value={`${correctSignals} / ${closedSignals}`} detail="confirmed vs closed" valueClass="text-proof-200" />
      <EvidenceCell label="Feed coverage" value={feedCoverage} detail={`${signalCount} signal${signalCount === 1 ? "" : "s"} plotted`} valueClass={isFeedConnected ? "text-positive-200" : "text-stone-400"} />
    </section>
  );
}
