import type { ArchiveFilters } from "../types";
import type { SimilarSignalsParams } from "./historicalPatternMatch";

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

export function parsePageParam(raw: unknown): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : DEFAULT_PAGE;
}

export function parsePageSizeParam(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.floor(n), MAX_PAGE_SIZE);
}

export function parseArchiveFilters(query: Record<string, unknown>): ArchiveFilters {
  const filters: ArchiveFilters = {};

  if (typeof query.matchId === "string" && query.matchId.length > 0) {
    filters.matchId = query.matchId;
  }

  if (query.status === "pending" || query.status === "correct" || query.status === "incorrect") {
    filters.status = query.status;
  }

  if (query.market === "1x2" || query.market === "totals") {
    filters.market = query.market;
  }

  if (query.event === "created" || query.event === "settled") {
    filters.event = query.event;
  }

  return filters;
}

export function parseSimilarSignalsParams(
  query: Record<string, unknown>
): SimilarSignalsParams {
  const params: SimilarSignalsParams = {};

  if (typeof query.signalType === "string" && query.signalType.length > 0) {
    params.signalType = query.signalType;
  }

  const oddsChangePct = Number(query.oddsChangePct);
  if (Number.isFinite(oddsChangePct)) {
    params.oddsChangePct = oddsChangePct;
  }

  const fieldPressureScore = Number(query.fieldPressureScore);
  if (Number.isFinite(fieldPressureScore)) {
    params.fieldPressureScore = fieldPressureScore;
  }

  if (typeof query.excludeMatchId === "string" && query.excludeMatchId.length > 0) {
    params.excludeMatchId = query.excludeMatchId;
  }

  return params;
}
