import type { OddsSnapshot, TeamSide } from "../types";

const MIN_CONSECUTIVE_MOVES = 3;
const MIN_TICK_MOVE_PCT = 1;

export const STEAM_WINDOW_MS = 5 * 60 * 1000;

function round(value: number, decimals = 2): number {
  return Number(value.toFixed(decimals));
}

function compressionPct(previousOdds: number, currentOdds: number): number {
  return ((previousOdds - currentOdds) / previousOdds) * 100;
}

function oddsForSide(snapshot: OddsSnapshot, side: TeamSide): number {
  if (side === "home") return snapshot.homeOdds;
  if (side === "draw") return snapshot.drawOdds;
  return snapshot.awayOdds;
}

export interface SteamMove {
  matchId: string;
  match: string;
  side: TeamSide;
  tickCount: number;
  totalMovePct: number;
  windowMs: number;
  firstOdds: number;
  lastOdds: number;
  firstTickAt: string;
  lastTickAt: string;
}

function findSteamForSide(sorted: OddsSnapshot[], side: TeamSide): SteamMove | null {
  let streakLength = 0;

  for (let i = sorted.length - 1; i > 0; i -= 1) {
    const movePct = compressionPct(
      oddsForSide(sorted[i - 1], side),
      oddsForSide(sorted[i], side)
    );

    if (movePct >= MIN_TICK_MOVE_PCT) {
      streakLength += 1;
    } else {
      break;
    }
  }

  if (streakLength < MIN_CONSECUTIVE_MOVES) return null;

  const runStartIndex = sorted.length - 1 - streakLength;
  const runStart = sorted[runStartIndex];
  const runEnd = sorted[sorted.length - 1];

  const windowMs = new Date(runEnd.createdAt).getTime() - new Date(runStart.createdAt).getTime();
  if (windowMs > STEAM_WINDOW_MS) return null;

  const firstOdds = oddsForSide(runStart, side);
  const lastOdds = oddsForSide(runEnd, side);

  return {
    matchId: runEnd.matchId,
    match: runEnd.matchLabel ?? `${runEnd.homeTeam} vs ${runEnd.awayTeam}`,
    side,
    tickCount: streakLength,
    totalMovePct: round(compressionPct(firstOdds, lastOdds)),
    windowMs,
    firstOdds,
    lastOdds,
    firstTickAt: runStart.createdAt,
    lastTickAt: runEnd.createdAt,
  };
}

/**
 * Detects sustained same-direction pressure across a SEQUENCE of ticks -
 * distinct from the existing signal engine, which only ever compares the
 * single latest tick to the one immediately before it. Only the trailing
 * (most recent) run is considered - this answers "is a steam move
 * happening right now," not a historical scan. Checks home, then draw,
 * then away; a match moving on multiple sides simultaneously is not
 * expected given how compression is calculated, so at most one SteamMove
 * is returned per call. matchId/match display fields are derived directly
 * from the snapshots themselves (matchLabel if present, otherwise
 * homeTeam/awayTeam) - no separate Match lookup needed, which sidesteps
 * the totals-matchId suffix problem entirely.
 */
export function detectSteamMove(snapshots: OddsSnapshot[]): SteamMove | null {
  if (snapshots.length < MIN_CONSECUTIVE_MOVES + 1) return null;

  const sorted = [...snapshots].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  return (
    findSteamForSide(sorted, "home") ??
    findSteamForSide(sorted, "draw") ??
    findSteamForSide(sorted, "away")
  );
}
