import { config } from "../config";
import { Match, OddsSnapshot } from "../types";

export interface TxLineFeedResult {
  matches: Match[];
  snapshots: OddsSnapshot[];
}

interface TxLineFixture {
  Ts?: number;
  StartTime?: number;
  Competition?: string;
  FixtureId: number;
  Participant1?: string;
  Participant2?: string;
  Participant1IsHome?: boolean;
}

interface TxLineOddsSnapshot {
  FixtureId: number;
  MessageId?: string;
  Ts?: number;
  Bookmaker?: string;
  SuperOddsType?: string;
  PriceNames?: string[];
  Prices?: number[];
  Pct?: string[];
}

let cachedGuestJwt = "";
let cachedGuestJwtCreatedAt = 0;

async function getGuestJwt(): Promise<string> {
  const now = Date.now();

  if (cachedGuestJwt && now - cachedGuestJwtCreatedAt < 10 * 60 * 1000) {
    return cachedGuestJwt;
  }

  const response = await fetch(`${config.txlineApiBaseUrl}/auth/guest/start`, {
    method: "POST",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`TxLINE guest auth failed: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as { token?: string };

  if (!data.token) {
    throw new Error("TxLINE guest auth did not return a JWT token.");
  }

  cachedGuestJwt = data.token;
  cachedGuestJwtCreatedAt = now;

  return cachedGuestJwt;
}

async function txlineGet<T>(path: string, jwt: string): Promise<T> {
  const response = await fetch(`${config.txlineApiBaseUrl}${path}`, {
    headers: {
      Authorization: `Bearer ${jwt}`,
      "X-Api-Token": config.txlineApiKey,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `TxLINE request failed ${path}: ${response.status} ${response.statusText} ${text.slice(0, 300)}`
    );
  }

  return (await response.json()) as T;
}

function priceToDecimal(price?: number): number {
  if (!price || !Number.isFinite(price)) {
    return 1.01;
  }

  return Number(Math.max(1.01, price / 1000).toFixed(2));
}

function inferStatus(startTime?: number): Match["status"] {
  if (!startTime) {
    return "scheduled";
  }

  const now = Date.now();
  const twoHoursMs = 2 * 60 * 60 * 1000;

  if (now < startTime) {
    return "scheduled";
  }

  if (now >= startTime && now <= startTime + twoHoursMs) {
    return "live";
  }

  return "finished";
}

function inferMinute(startTime?: number): number {
  if (!startTime) {
    return 0;
  }

  const elapsedMinutes = Math.floor((Date.now() - startTime) / 60000);

  return Math.max(0, Math.min(90, elapsedMinutes));
}

function normalizeFixture(fixture: TxLineFixture, nowIso: string): Match {
  return {
    id: String(fixture.FixtureId),
    competition: fixture.Competition ?? "World Cup",
    homeTeam: fixture.Participant1 ?? "Home",
    awayTeam: fixture.Participant2 ?? "Away",
    homeScore: 0,
    awayScore: 0,
    minute: inferMinute(fixture.StartTime),
    status: inferStatus(fixture.StartTime),
    lastUpdated: nowIso,
  };
}

function find1x2Odds(odds: TxLineOddsSnapshot[]): TxLineOddsSnapshot | undefined {
  return odds.find(
    (item) =>
      item.SuperOddsType === "1X2_PARTICIPANT_RESULT" &&
      Array.isArray(item.PriceNames) &&
      Array.isArray(item.Prices) &&
      item.Prices.length >= 3
  );
}

function normalizeOddsSnapshot(
  match: Match,
  odds: TxLineOddsSnapshot,
  nowIso: string
): OddsSnapshot {
  const priceNames = odds.PriceNames ?? [];
  const prices = odds.Prices ?? [];

  const part1Index = priceNames.indexOf("part1");
  const drawIndex = priceNames.indexOf("draw");
  const part2Index = priceNames.indexOf("part2");

  const homePrice = prices[part1Index >= 0 ? part1Index : 0];
  const drawPrice = prices[drawIndex >= 0 ? drawIndex : 1];
  const awayPrice = prices[part2Index >= 0 ? part2Index : 2];

  return {
    id: `txline-${match.id}-${odds.Ts ?? Date.now()}-${odds.MessageId ?? "snapshot"}`,
    matchId: match.id,
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    homeOdds: priceToDecimal(homePrice),
    awayOdds: priceToDecimal(awayPrice),
    drawOdds: priceToDecimal(drawPrice),
    homeScore: match.homeScore,
    awayScore: match.awayScore,
    minute: match.minute,
    source: "txline",
    createdAt: nowIso,
  };
}

export async function fetchTxLineFeed(): Promise<TxLineFeedResult> {
  if (!config.txlineApiKey) {
    throw new Error(
      "TXLINE_API_TOKEN is missing. Set USE_SIMULATED_FEED=true for demo mode or add a valid TxLINE API token."
    );
  }

  const jwt = await getGuestJwt();
  const fixtures = await txlineGet<TxLineFixture[]>("/api/fixtures/snapshot", jwt);

  const nowIso = new Date().toISOString();
  const matches: Match[] = [];
  const snapshots: OddsSnapshot[] = [];

  for (const fixture of fixtures.slice(0, 30)) {
    const odds = await txlineGet<TxLineOddsSnapshot[]>(
      `/api/odds/snapshot/${fixture.FixtureId}`,
      jwt
    );

    const oneXTwo = find1x2Odds(odds);

    if (!oneXTwo) {
      continue;
    }

    const match = normalizeFixture(fixture, nowIso);
    const snapshot = normalizeOddsSnapshot(match, oneXTwo, nowIso);

    matches.push(match);
    snapshots.push(snapshot);
  }

  console.log(
    `TxLINE feed normalized: ${matches.length} matches, ${snapshots.length} snapshots`
  );

  return {
    matches,
    snapshots,
  };
}
