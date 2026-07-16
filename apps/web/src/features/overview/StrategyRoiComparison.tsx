import { useId } from "react";
import { Card } from "../../components/ui/Card";
import { formatRoi, getMetaAgentRecommendation, type ArenaResponse } from "../../lib/arena";
import { toRoiGeometry } from "./commandCenterOverview";

export interface StrategyRoiComparisonProps {
  arena: ArenaResponse | null;
  isUnavailable: boolean;
}

export function StrategyRoiComparison({ arena, isUnavailable }: StrategyRoiComparisonProps) {
  const titleId = useId();

  if (!arena) {
    return (
      <Card className="h-full p-0">
        <section aria-labelledby={titleId} className="p-4">
          <h2 id={titleId} className="font-display text-sm font-bold tracking-tight text-white">
            Strategy ROI comparison
          </h2>
          <p className="mt-4 rounded-lg border border-dashed border-border bg-black/15 px-3 py-4 text-xs text-stone-400">
            {isUnavailable ? "Arena data unavailable." : "Waiting for arena data."}
          </p>
        </section>
      </Card>
    );
  }

  const scoreboards = [arena.momentumFollower, arena.contrarian, arena.kellyCriterion];
  const roiValues = scoreboards.map((scoreboard) => scoreboard.roiPercent);
  const recommendation = getMetaAgentRecommendation(arena);

  return (
    <Card className="h-full p-0">
      <section aria-labelledby={titleId} className="p-4">
        <div>
          <h2 id={titleId} className="font-display text-sm font-bold tracking-tight text-white">
            Strategy ROI comparison
          </h2>
          <p className="mt-0.5 text-[11px] leading-4 text-stone-500">Zero-centered return on settled simulated positions</p>
        </div>

        <div className="mt-4 space-y-4">
          {scoreboards.map((scoreboard) => {
            const geometry = toRoiGeometry(scoreboard.roiPercent, roiValues);
            return (
              <div key={scoreboard.agentId}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-white">{scoreboard.label}</p>
                    <p className="mt-0.5 font-mono text-[9px] text-stone-500">
                      {scoreboard.settledCount} settled · {scoreboard.openPositions} open
                    </p>
                  </div>
                  <p
                    className={`shrink-0 font-mono text-sm font-bold tabular-nums ${
                      geometry.direction === "positive"
                        ? "text-positive-200"
                        : geometry.direction === "negative"
                          ? "text-danger-200"
                          : "text-stone-300"
                    }`}
                  >
                    {formatRoi(scoreboard.roiPercent)}
                  </p>
                </div>

                <div
                  data-testid={`roi-bar-${scoreboard.agentId}`}
                  data-direction={geometry.direction}
                  className="relative mt-2 grid h-2 grid-cols-2 overflow-hidden rounded-full bg-white/5"
                  aria-hidden="true"
                >
                  <span className="relative border-r border-white/25">
                    {geometry.direction === "negative" && (
                      <span
                        className="absolute inset-y-0 right-0 rounded-l-full bg-danger motion-safe:transition-[width] motion-safe:duration-500 motion-reduce:transition-none"
                        style={{ width: `${geometry.widthPercent}%` }}
                      />
                    )}
                  </span>
                  <span className="relative">
                    {geometry.direction === "positive" && (
                      <span
                        className="absolute inset-y-0 left-0 rounded-r-full bg-positive motion-safe:transition-[width] motion-safe:duration-500 motion-reduce:transition-none"
                        style={{ width: `${geometry.widthPercent}%` }}
                      />
                    )}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <p className="mt-4 border-t border-border pt-3 text-[11px] leading-5 text-stone-400">
          {recommendation.message}
        </p>
      </section>
    </Card>
  );
}
