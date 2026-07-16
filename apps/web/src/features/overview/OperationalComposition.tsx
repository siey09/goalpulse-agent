import { useId } from "react";
import { ArrowUpRight } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { toCompositionSegments, type CompositionItem, type CompositionTone } from "./commandCenterOverview";

const toneClass: Record<CompositionTone, string> = {
  positive: "bg-positive",
  danger: "bg-danger",
  warning: "bg-warning",
  info: "bg-info",
  neutral: "bg-stone-500",
};

const toneTextClass: Record<CompositionTone, string> = {
  positive: "text-positive-200",
  danger: "text-danger-200",
  warning: "text-warning-200",
  info: "text-info-200",
  neutral: "text-stone-300",
};

export interface OperationalCompositionProps {
  title: string;
  description: string;
  items: CompositionItem[] | null;
  emptyMessage: string;
  unavailableMessage: string;
  secondaryReadout?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function OperationalComposition({
  title,
  description,
  items,
  emptyMessage,
  unavailableMessage,
  secondaryReadout,
  actionLabel,
  onAction,
}: OperationalCompositionProps) {
  const titleId = useId();
  const composition = items ? toCompositionSegments(items) : null;

  return (
    <Card className="h-full overflow-hidden p-0">
      <section aria-labelledby={titleId} className="flex h-full min-w-0 flex-col p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id={titleId} className="font-display text-sm font-bold tracking-tight text-white">
              {title}
            </h2>
            <p className="mt-0.5 text-[11px] leading-4 text-stone-500">{description}</p>
          </div>
          {composition && (
            <div className="shrink-0 text-right">
              <p className="font-mono text-xl font-bold tabular-nums text-white">{composition.total}</p>
              <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-stone-500">total</p>
            </div>
          )}
        </div>

        {composition ? (
          <>
            {composition.total > 0 ? (
              <div
                className="mt-4 flex h-2.5 w-full overflow-hidden rounded-full bg-white/5"
                aria-hidden="true"
              >
                {composition.segments.map((segment) => (
                  <span
                    key={segment.id}
                    data-testid={`composition-segment-${segment.id}`}
                    className={`${toneClass[segment.tone]} h-full min-w-px motion-safe:transition-[width] motion-safe:duration-500 motion-safe:ease-out motion-reduce:transition-none`}
                    style={{ width: `${segment.percent}%` }}
                  />
                ))}
              </div>
            ) : (
              <p className="mt-4 rounded-lg border border-dashed border-border bg-black/15 px-3 py-3 text-xs text-stone-400">
                {emptyMessage}
              </p>
            )}

            <ul className="mt-3 grid grid-cols-3 gap-2" aria-label={`${title} values`}>
              {composition.segments.map((segment) => (
                <li key={segment.id} className="min-w-0 rounded-lg bg-black/15 px-2.5 py-2">
                  <div className="flex items-center gap-1.5">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${toneClass[segment.tone]}`} aria-hidden="true" />
                    <span className="truncate text-[10px] text-stone-400">{segment.label}</span>
                  </div>
                  <div className="mt-1 flex items-baseline justify-between gap-1">
                    <span className={`font-mono text-sm font-bold tabular-nums ${toneTextClass[segment.tone]}`}>
                      {segment.count}
                    </span>
                    <span className="font-mono text-[9px] tabular-nums text-stone-600">
                      {Math.round(segment.percent)}%
                    </span>
                  </div>
                </li>
              ))}
            </ul>

            {secondaryReadout && (
              <p className="mt-3 font-mono text-[10px] text-stone-400">{secondaryReadout}</p>
            )}
          </>
        ) : (
          <p className="mt-4 rounded-lg border border-dashed border-border bg-black/15 px-3 py-4 text-xs text-stone-400">
            {unavailableMessage}
          </p>
        )}

        {actionLabel && onAction && (
          <button
            type="button"
            onClick={onAction}
            className="mt-auto inline-flex min-h-11 items-center justify-between gap-2 rounded-lg px-2 pt-3 text-left text-xs font-semibold text-stone-300 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          >
            {actionLabel}
            <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-stone-500" aria-hidden="true" />
          </button>
        )}
      </section>
    </Card>
  );
}
