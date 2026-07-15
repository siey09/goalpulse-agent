export type LiveMarketSeriesKey = "home" | "draw" | "away";

/** Unknown or legacy sides retain the historical home-series fallback. */
export function chartDataKeyForSignalSide(side?: string): LiveMarketSeriesKey {
  const normalizedSide = side?.toLowerCase();
  if (normalizedSide === "away") return "away";
  if (normalizedSide === "draw") return "draw";
  return "home";
}
