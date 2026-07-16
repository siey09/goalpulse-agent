import { Match, OddsSnapshot } from "../types";

let tick = 0;

const matches: Match[] = [
  {
    id: "wc-usa-bra",
    competition: "World Cup 2026",
    homeTeam: "USA",
    awayTeam: "Brazil",
    homeScore: 0,
    awayScore: 0,
    minute: 12,
    status: "live",
    lastUpdated: new Date().toISOString(),
  },
  {
    id: "wc-jpn-esp",
    competition: "World Cup 2026",
    homeTeam: "Japan",
    awayTeam: "Spain",
    homeScore: 1,
    awayScore: 1,
    minute: 54,
    status: "live",
    lastUpdated: new Date().toISOString(),
  },
  {
    id: "wc-mex-ger",
    competition: "World Cup 2026",
    homeTeam: "Mexico",
    awayTeam: "Germany",
    homeScore: 0,
    awayScore: 1,
    minute: 71,
    status: "live",
    lastUpdated: new Date().toISOString(),
  },
];

function roundOdds(value: number) {
  return Number(Math.max(1.05, value).toFixed(2));
}

export function fetchSimulatedTxLineFeed(): {
  matches: Match[];
  snapshots: OddsSnapshot[];
  rawFixtureCount: number;
  eligibleFixtureCount: number;
  oddsEnrichmentFailures: number;
} {
  tick += 1;

  const now = new Date().toISOString();

  const updatedMatches: Match[] = matches.map((match): Match => {
    const minuteIncrement = match.status === "finished" ? 0 : 3;

    const homeGoal = match.id === "wc-usa-bra" && tick === 8 ? 1 : 0;
    const awayGoal = match.id === "wc-jpn-esp" && tick === 7 ? 1 : 0;

    const updatedMinute = Math.min(90, match.minute + minuteIncrement);
    const updatedStatus: Match["status"] =
      updatedMinute >= 90 ? "finished" : "live";

    return {
      ...match,
      homeScore: match.homeScore + homeGoal,
      awayScore: match.awayScore + awayGoal,
      minute: updatedMinute,
      status: updatedStatus,
      lastUpdated: now,
    };
  });

  for (let i = 0; i < matches.length; i += 1) {
    matches[i] = updatedMatches[i];
  }

  const snapshots: OddsSnapshot[] = updatedMatches.map((match, index) => {
    const baseHome = [2.4, 3.1, 4.2][index];
    const baseAway = [2.9, 2.2, 1.85][index];
    const baseDraw = [3.25, 3.0, 3.4][index];

    const homeCompression =
      match.id === "wc-usa-bra" && match.status !== "finished"
        ? Math.max(0, tick - 2) * 0.09
        : 0;

    const awayCompression =
      match.id === "wc-jpn-esp" && match.status !== "finished"
        ? Math.max(0, tick - 2) * 0.06
        : 0;

    const germanyCompression =
      match.id === "wc-mex-ger" && match.status !== "finished"
        ? Math.max(0, tick - 1) * 0.03
        : 0;

    const marketNoise = Math.sin(tick + index) * 0.03;

    const homeOdds = roundOdds(baseHome - homeCompression + marketNoise);
    const awayOdds = roundOdds(
      baseAway - awayCompression - germanyCompression - marketNoise
    );
    const drawOdds = roundOdds(baseDraw + Math.sin(tick / 2 + index) * 0.04);

    return {
      id: `${match.id}-${Date.now()}-${index}`,
      matchId: match.id,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      homeOdds,
      awayOdds,
      drawOdds,
      homeScore: match.homeScore,
      awayScore: match.awayScore,
      minute: match.minute,
      source: "simulated_txline",
      createdAt: now,
    };
  });

  return {
    matches: updatedMatches,
    snapshots,
    rawFixtureCount: updatedMatches.length,
    eligibleFixtureCount: updatedMatches.length,
    oddsEnrichmentFailures: 0,
  };
}
