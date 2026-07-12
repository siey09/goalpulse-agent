import type { ReactNode } from "react";
import { Gauge } from "lucide-react";

export interface EmptyStateProps {
  /** Always state the specific reason - "no data" is never acceptable copy here. */
  reason: ReactNode;
  action?: ReactNode;
}

/**
 * An empty state must name why the module is empty (no live match, no
 * threshold crossed, no settled sample, no proof available, etc.) - never
 * a generic "no data" placeholder.
 */
export function EmptyState({ reason, action }: EmptyStateProps) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-dashed border-border bg-black/15 p-4 text-sm text-stone-400">
      <Gauge className="mt-0.5 h-4 w-4 shrink-0 text-stone-600" aria-hidden="true" />
      <div>
        <p>{reason}</p>
        {action && <div className="mt-2">{action}</div>}
      </div>
    </div>
  );
}
