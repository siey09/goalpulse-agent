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
  GameState?: string | null;
  InRunning?: boolean;
  MarketParameters?: string | null;
  MarketPeriod?: string | null;
  PriceNames?: string[];
  Prices?: number[];
  Pct?: string[];
}

let cachedGuestJwt = "";
let cachedGuestJwtCreatedAt = 0;

const oddsUpdatesCache = new Map<
  number,
  {
    fetchedAt: number;
    data: TxLineOddsSnapshot[];
  }
>();

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
    throw new Error(
      `TxLINE guest auth failed: ${response.status} ${response.statusText}`
    );
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
      `TxLINE request failed ${path}: ${response.status} ${
        response.statusText
      } ${text.slice(0, 300)}`
    );
  }

  return (await response.json()) as T;
}

async function getOddsUpdates(
  fixtureId: number,
  jwt: string
): Promise<TxLineOddsSnapshot[]> {
  const cached = oddsUpdatesCache.get(fixtureId);
  const now = Date.now();

  if (cached && now - cached.fetchedAt < 60 * 1000) {
    return cached.data;
  }

  const data = await txlineGet<TxLineOddsSnapshot[]>(
    `/api/odds/updates/${fixtureId}`,
    jwt
  );

  oddsUpdatesCache.set(fixtureId, {
    fetchedAt: now,
    data,
  });

  return data;
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

function is1x2Odds(item: TxLineOddsSnapshot): boolean {
  return (
    item.SuperOddsType === "1X2_PARTICIPANT_RESULT" &&
    Array.isArray(item.PriceNames) &&
    Array.isArray(item.Prices) &&
    item.Prices.length >= 3 &&
    item.PriceNames.includes("part1") &&
    item.PriceNames.includes("draw") &&
    item.PriceNames.includes("part2")
  );
}

function preferMainMarket(item: TxLineOddsSnapshot): boolean {
  return item.MarketPeriod === null || item.MarketPeriod === undefined;
}

function getPrice(item: TxLineOddsSnapshot, name: "part1" | "draw" | "part2") {
  const index = item.PriceNames?.indexOf(name) ?? -1;

  return index >= 0 ? priceToDecimal(item.Prices?.[index]) : 1.01;
}

function findLatest1x2Odds(
  odds: TxLineOddsSnapshot[]
): TxLineOddsSnapshot | undefined {
  const mainMarket = odds
    .filter(is1x2Odds)
    .filter(preferMainMarket)
    .sort((a, b) => (b.Ts ?? 0) - (a.Ts ?? 0));

  if (mainMarket[0]) {
    return mainMarket[0];
  }

  return odds
    .filter(is1x2Odds)
    .sort((a, b) => (b.Ts ?? 0) - (a.Ts ?? 0))[0];
}

function selectMovementOdds(
  odds: TxLineOddsSnapshot[],
  limit = 8
): TxLineOddsSnapshot[] {
  const mainMarket = odds
    .filter(is1x2Odds)
    .filter(preferMainMarket)
    .sort((a, b) => (a.Ts ?? 0) - (b.Ts ?? 0));

  const fallback = odds
    .filter(is1x2Odds)
    .sort((a, b) => (a.Ts ?? 0) - (b.Ts ?? 0));

  const candidates = mainMarket.length > 0 ? mainMarket : fallback;

  const uniqueByMessage = new Map<string, TxLineOddsSnapshot>();

  for (const item of candidates) {
    const key =
      item.MessageId ??
      `${item.FixtureId}-${item.Ts}-${item.Prices?.join("-")}`;

    uniqueByMessage.set(key, item);
  }

  const unique = [...uniqueByMessage.values()].sort(
    (a, b) => (a.Ts ?? 0) - (b.Ts ?? 0)
  );

  let strongestPair: [TxLineOddsSnapshot, TxLineOddsSnapshot] | null = null;
  let strongestCompression = 0;

  for (let index = 1; index < unique.length; index += 1) {
    const previous = unique[index - 1];
    const current = unique[index];

    const previousHome = getPrice(previous, "part1");
    const currentHome = getPrice(current, "part1");
    const previousAway = getPrice(previous, "part2");
    const currentAway = getPrice(current, "part2");

    const homeCompression =
      previousHome > 0 ? ((previousHome - currentHome) / previousHome) * 100 : 0;

    const awayCompression =
      previousAway > 0 ? ((previousAway - currentAway) / previousAway) * 100 : 0;

    const bestCompression = Math.max(homeCompression, awayCompression);

    if (bestCompression > strongestCompression) {
      strongestCompression = bestCompression;
      strongestPair = [previous, current];
    }
  }

  const selected = new Map<string, TxLineOddsSnapshot>();

  for (const item of unique.slice(-limit)) {
    selected.set(item.MessageId ?? `${item.FixtureId}-${item.Ts}`, item);
  }

  if (strongestPair && strongestCompression >= 4) {
    for (const item of strongestPair) {
      selected.set(item.MessageId ?? `${item.FixtureId}-${item.Ts}`, item);
    }
  }

  return [...selected.values()].sort((a, b) => (a.Ts ?? 0) - (b.Ts ?? 0));
}

function normalizeOddsSnapshot(
  match: Match,
  odds: TxLineOddsSnapshot,
  endpointUsed: string
): OddsSnapshot {
  const createdAt = odds.Ts
    ? new Date(odds.Ts).toISOString()
    : new Date().toISOString();

  return {
    id: `txline-${match.id}-${odds.Ts ?? Date.now()}-${
      odds.MessageId ?? "snapshot"
    }`,
    matchId: match.id,
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    homeOdds: getPrice(odds, "part1"),
    awayOdds: getPrice(odds, "part2"),
    drawOdds: getPrice(odds, "draw"),
    homeScore: match.homeScore,
    awayScore: match.awayScore,
    minute: match.minute,
    source: "txline",
    createdAt,
    evidence: {
      source: "txline",
      fixtureId: match.id,
      endpointUsed,
      bookmaker: odds.Bookmaker,
      messageId: odds.MessageId,
      marketType: odds.SuperOddsType,
      marketPeriod: odds.MarketPeriod,
      marketParameters: odds.MarketParameters,
      currentTimestamp: createdAt,
      proofLabel: "Generated from real TxLINE odds movement data",
    },
  };
}

function sortSnapshotsChronologically(
  snapshots: OddsSnapshot[]
): OddsSnapshot[] {
  return snapshots.sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
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

  for (const fixture of fixtures.slice(0, 14)) {
    const match = normalizeFixture(fixture, nowIso);

    let latestOdds: TxLineOddsSnapshot | undefined;
    let movementOdds: TxLineOddsSnapshot[] = [];

    try {
      const currentOdds = await txlineGet<TxLineOddsSnapshot[]>(
        `/api/odds/snapshot/${fixture.FixtureId}`,
        jwt
      );

      latestOdds = findLatest1x2Odds(currentOdds);

      const historicalOdds = await getOddsUpdates(fixture.FixtureId, jwt);
      movementOdds = selectMovementOdds(historicalOdds, 8);
    } catch (error) {
      console.warn(
        `TxLINE odds enrichment skipped for fixture ${fixture.FixtureId}:`,
        error instanceof Error ? error.message : error
      );
    }

    const selectedOdds = latestOdds ? [...movementOdds, latestOdds] : movementOdds;

    if (selectedOdds.length === 0) {
      continue;
    }

    matches.push(match);

    for (const item of selectedOdds) {
      const endpointUsed =
        item.MessageId === latestOdds?.MessageId
          ? `/api/odds/snapshot/${fixture.FixtureId}`
          : `/api/odds/updates/${fixture.FixtureId}`;

      snapshots.push(normalizeOddsSnapshot(match, item, endpointUsed));
    }
  }

  const uniqueSnapshots = new Map<string, OddsSnapshot>();

  for (const snapshot of snapshots) {
    uniqueSnapshots.set(snapshot.id, snapshot);
  }

  const normalizedSnapshots = sortSnapshotsChronologically([
    ...uniqueSnapshots.values(),
  ]);

  console.log(
    `TxLINE feed normalized: ${matches.length} matches, ${normalizedSnapshots.length} snapshots with strongest movement evidence`
  );

  return {
    matches,
    snapshots: normalizedSnapshots,
  };
}
