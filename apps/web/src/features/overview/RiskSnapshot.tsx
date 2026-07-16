import { useId } from "react";
import { Card } from "../../components/ui/Card";
import type { CommandCenterPnlSummary } from "./commandCenterOverview";

export interface RiskSnapshotProps {
  pnl: CommandCenterPnlSummary | null;
}

function signedPercent(value: number) {
  return `${value > 0 ? "+" : ""}${value}%`;
}

function unitValue(value: number) {
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}u`;
}

function valueTone(value: number) {
  return value > 0 ? "text-positive" : value < 0 ? "text-danger" : "text-stone-300";
}

export function RiskSnapshot({ pnl }: RiskSnapshotProps) {
  const titleId = useId();

  return (
    <Card className="h-full p-0">
      <section aria-labelledby={titleId} className="p-4">
        <h2 id={titleId} className="font-display text-sm font-bold tracking-tight text-white">
          Risk and P&amp;L
        </h2>
        <p className="mt-0.5 text-[11px] leading-4 text-stone-500">Simulated exposure and settled return</p>

        {pnl ? (
          <>
            <div className="mt-4">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-stone-500">Net units</p>
                  <p className={`mt-1 font-mono text-2xl font-bold tabular-nums ${valueTone(pnl.netUnits)}`}>
                    {unitValue(pnl.netUnits)}
                  </p>
                </div>
                <p className={`font-mono text-sm font-bold tabular-nums ${valueTone(pnl.roiPercent)}`}>
                  {signedPercent(pnl.roiPercent)}
                </p>
              </div>

              <div className="relative mt-3 grid h-2 grid-cols-2 overflow-hidden rounded-full bg-white/5" aria-hidden="true">
                <span className="relative border-r border-white/25">
                  {pnl.roiPercent < 0 && (
                    <span
                      data-testid="risk-roi-fill"
                      data-direction="negative"
                      className="absolute inset-y-0 right-0 rounded-l-full bg-danger motion-safe:transition-[width] motion-safe:duration-500 motion-reduce:transition-none"
                      style={{ width: `${Math.min(Math.abs(pnl.roiPercent), 100)}%` }}
                    />
                  )}
                </span>
                <span className="relative">
                  {pnl.roiPercent >= 0 && (
                    <span
                      data-testid="risk-roi-fill"
                      data-direction={pnl.roiPercent > 0 ? "positive" : "neutral"}
                      className="absolute inset-y-0 left-0 rounded-r-full bg-positive motion-safe:transition-[width] motion-safe:duration-500 motion-reduce:transition-none"
                      style={{ width: `${Math.min(Math.abs(pnl.roiPercent), 100)}%` }}
                    />
                  )}
                </span>
              </div>
              <div className="mt-1 flex justify-between font-mono text-[8px] text-stone-600" aria-hidden="true">
                <span>-100%</span><span>0</span><span>+100%</span>
              </div>
            </div>

            <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-3">
              <div>
                <dt className="text-[9px] uppercase tracking-wide text-stone-500">Open</dt>
                <dd className="mt-1 font-mono text-sm font-bold tabular-nums text-warning-200">{pnl.openPositions}</dd>
              </div>
              <div>
                <dt className="text-[9px] uppercase tracking-wide text-stone-500">Exposure</dt>
                <dd className="mt-1 font-mono text-sm font-bold tabular-nums text-warning-200">{pnl.openExposure.toFixed(2)}u</dd>
              </div>
              <div>
                <dt className="text-[9px] uppercase tracking-wide text-stone-500">Settled</dt>
                <dd className="mt-1 font-mono text-sm font-bold tabular-nums text-stone-200">{pnl.settledBets}</dd>
              </div>
            </dl>
          </>
        ) : (
          <p className="mt-4 rounded-lg border border-dashed border-border bg-black/15 px-3 py-4 text-xs text-stone-400">
            P&amp;L data unavailable.
          </p>
        )}
      </section>
    </Card>
  );
}
