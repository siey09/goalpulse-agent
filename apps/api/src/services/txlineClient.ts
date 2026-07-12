import { config } from "../config";
import { Match, OddsSnapshot, TxLineScoresContext } from "../types";
import { isScoresContextFresh, SCORES_CONTEXT_TOLERANCE_MS } from "../logic/scoresContextFreshness";
import { store } from "../store";

export interface TxLineFeedResult {
  matches: Match[];
  snapshots: OddsSnapshot[];
  rawFixtureCount?: number;
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

interface TxLineScoreSnapshot {
  FixtureId?: number;
  Ts?: number;
  GameState?: string | null;
  Status?: string | null;
  StatusId?: number;
  Action?: string;
  Confirmed?: boolean;
  Clock?: unknown;
  Score?: unknown;
  HomeScore?: number;
  AwayScore?: number;
  Participant1Score?: number;
  Participant2Score?: number;
  Scores?: unknown;
  Participant?: number | null;
  Possession?: number | null;
  PossessionType?: string | null;
  PossibleEvent?: unknown;
  Data?: Record<string, unknown> | null;
  Seq?: number;
  Id?: number;
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


const STATUS_LABELS: Record<number, string> = {
  1: "Not Started",
  2: "1st Half",
  3: "Half Time",
  4: "2nd Half",
  5: "Finished",
  6: "Waiting for Extra Time",
  7: "1st Half Extra Time",
  8: "Half Time Extra Time",
  9: "2nd Half Extra Time",
  10: "Finished After Extra Time",
  11: "Waiting for Penalty Shootout",
  12: "Penalty Shootout",
  13: "Finished After Penalty Shootout",
  14: "Interrupted",
  15: "Abandoned",
  16: "Cancelled",
  17: "TX Coverage Cancelled",
  18: "TX Coverage Suspended",
};

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function latestMeaningfulScoreEvent(
  score: TxLineScoreSnapshot | TxLineScoreSnapshot[]
): TxLineScoreSnapshot | undefined {
  const importantActions = new Set([
    "goal",
    "shot",
    "corner",
    "free_kick",
    "penalty",
    "penalty_outcome",
    "var",
    "var_end",
    "red_card",
    "yellow_card",
    "danger_possession",
    "high_danger_possession",
    "attack_possession",
    "possible",
    "suspend",
    "unreliable_corners",
    "unreliable_yellow_cards",
    "score_adjustment",
    "action_discarded",
    "action_amend",
  ]);

  const events = Array.isArray(score) ? score : [score];

  return events
    .filter((event) => event && typeof event === "object")
    .filter((event) => importantActions.has((event.Action ?? "").toLowerCase()))
    .sort((a, b) => (b.Ts ?? 0) - (a.Ts ?? 0))[0];
}

function actionLabel(action?: string): string | undefined {
  if (!action) return undefined;

  return action
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function participantToSide(
  participant: unknown,
  fixture: TxLineFixture
): TxLineScoresContext["actionTeam"] {
  const participantNumber = toNumber(participant);

  if (participantNumber !== 1 && participantNumber !== 2) {
    return "unknown";
  }

  const participantOneIsHome = fixture.Participant1IsHome !== false;

  if (participantNumber === 1) {
    return participantOneIsHome ? "home" : "away";
  }

  return participantOneIsHome ? "away" : "home";
}

function pressureFromAction(
  action?: string,
  possessionType?: string
): Pick<TxLineScoresContext, "pressureLevel" | "fieldPressureScore"> {
  const normalizedAction = (action ?? "").toLowerCase();
  const normalizedPossession = (possessionType ?? "").toLowerCase();

  if (
    normalizedAction.includes("goal") ||
    normalizedAction.includes("penalty") ||
    normalizedAction.includes("red_card") ||
    normalizedAction.includes("var") ||
    normalizedAction.includes("high_danger") ||
    normalizedPossession.includes("highdanger")
  ) {
    return { pressureLevel: "HIGH_DANGER", fieldPressureScore: 45 };
  }

  if (
    normalizedAction.includes("shot") ||
    normalizedAction.includes("danger") ||
    normalizedPossession.includes("danger")
  ) {
    return { pressureLevel: "DANGER", fieldPressureScore: 32 };
  }

  if (
    normalizedAction.includes("corner") ||
    normalizedAction.includes("free_kick") ||
    normalizedAction.includes("attack") ||
    normalizedPossession.includes("attack")
  ) {
    return { pressureLevel: "ATTACK", fieldPressureScore: 22 };
  }

  if (
    normalizedAction.includes("safe_possession") ||
    normalizedPossession.includes("safe")
  ) {
    return { pressureLevel: "SAFE", fieldPressureScore: 8 };
  }

  return { pressureLevel: "NONE", fieldPressureScore: 0 };
}

function reliabilityFromEvent(
  event?: TxLineScoreSnapshot
): Pick<TxLineScoresContext, "reliability" | "reliabilityReason"> {
  if (!event) {
    return {
      reliability: "UNKNOWN",
      reliabilityReason: "No scores event was available for this fixture.",
    };
  }

  const action = (event.Action ?? "").toLowerCase();
  const data = event.Data ?? {};
  const reliableFlag = readBoolean(data.Reliable);
  const unreliableFlag = readBoolean(data.Unreliable);

  if (event.StatusId === 18 || action === "suspend" || reliableFlag === false) {
    return {
      reliability: "SUSPENDED",
      reliabilityReason:
        "TXODDS marked the fixture or coverage as suspended/unreliable.",
    };
  }

  if (
    unreliableFlag === true ||
    action === "unreliable_corners" ||
    action === "unreliable_yellow_cards" ||
    action === "action_discarded" ||
    action === "action_amend"
  ) {
    return {
      reliability: "UNRELIABLE",
      reliabilityReason:
        "TXODDS emitted an amend, discard, or unreliable-stat event.",
    };
  }

  return {
    reliability: "RELIABLE",
    reliabilityReason: "No TXODDS reliability warning was found.",
  };
}

function buildScoresContext(
  score: TxLineScoreSnapshot | TxLineScoreSnapshot[] | undefined,
  fixture: TxLineFixture,
  match: Match,
  endpointUsed: string
): TxLineScoresContext | undefined {
  if (!score) return undefined;

  const latestEvent = latestScoreEvent(score);
  const meaningfulEvent = latestMeaningfulScoreEvent(score) ?? latestEvent;

  if (!meaningfulEvent) return undefined;

  const scoreEvent = latestEventWithScore(score) ?? latestEvent ?? meaningfulEvent;
  const scores = scoreEvent ? extractScores(scoreEvent) : {
    homeScore: match.homeScore,
    awayScore: match.awayScore,
  };

  const data = meaningfulEvent.Data ?? {};
  const statusId =
    toNumber(meaningfulEvent.StatusId) ??
    toNumber(data.StatusId) ??
    toNumber(latestEvent?.StatusId);

  const clockSeconds =
    readObjectNumber(meaningfulEvent.Clock, ["Seconds", "seconds"]) ??
    readObjectNumber(latestEvent?.Clock, ["Seconds", "seconds"]);

  const possessionType =
    readString(meaningfulEvent.PossessionType) ??
    readString(data.PossessionType) ??
    readString(data.FreeKickType) ??
    readString(data.ThrowInType);

  const pressure = pressureFromAction(meaningfulEvent.Action, possessionType);
  const reliability = reliabilityFromEvent(meaningfulEvent);
  const timestamp = meaningfulEvent.Ts
    ? new Date(meaningfulEvent.Ts).toISOString()
    : undefined;

  return {
    fixtureId: String(fixture.FixtureId),
    endpointUsed,
    latestAction: meaningfulEvent.Action,
    actionLabel: actionLabel(meaningfulEvent.Action),
    actionTeam: participantToSide(
      meaningfulEvent.Participant ?? data.Participant ?? meaningfulEvent.Possession,
      fixture
    ),
    statusId,
    statusName: statusId ? STATUS_LABELS[statusId] : undefined,
    clockSeconds,
    minute: extractMinute(meaningfulEvent.Clock ?? latestEvent?.Clock, match.minute),
    homeScore: scores.homeScore,
    awayScore: scores.awayScore,
    scoreline: `${match.homeTeam} ${scores.homeScore} - ${scores.awayScore} ${match.awayTeam}`,
    scoreBreakdown: scoreEvent ? extractScoreBreakdown(scoreEvent) : undefined,
    possessionType,
    ...pressure,
    ...reliability,
    confirmed: meaningfulEvent.Confirmed,
    sequence: meaningfulEvent.Seq,
    timestamp,
    proofLabel: "Generated from real TXODDS Scores event context",
  };
}

const RECENT_RESULT_FIXTURES: TxLineFixture[] = [
  {
    FixtureId: 17588325,
    StartTime: 1782612000000,
    Competition: "World Cup",
    Participant1: "Jordan",
    Participant2: "Argentina",
    Participant1IsHome: true,
  },
  {
    FixtureId: 17588326,
    StartTime: 1782612000000,
    Competition: "World Cup",
    Participant1: "Algeria",
    Participant2: "Austria",
    Participant1IsHome: true,
  },
];


const TXLINE_REQUEST_TIMEOUT_MS = 12000;

async function fetchWithTimeout(input: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TXLINE_REQUEST_TIMEOUT_MS);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`TxLINE request timed out after ${TXLINE_REQUEST_TIMEOUT_MS}ms: ${input}`);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
export async function getGuestJwt(): Promise<string> {
  const now = Date.now();

  if (cachedGuestJwt && now - cachedGuestJwtCreatedAt < 10 * 60 * 1000) {
    return cachedGuestJwt;
  }

  const response = await fetchWithTimeout(`${config.txlineApiBaseUrl}/auth/guest/start`, {
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
  const response = await fetchWithTimeout(`${config.txlineApiBaseUrl}${path}`, {
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

/**
 * Raw entry shape as documented by TxLINE's /api/scores/historical/{fixtureId}
 * example (lowercase: seq, ts, gameState). The live snapshot/update endpoints
 * return PascalCase (Seq, Ts, GameState) per the TXODDS Scores Product API doc.
 * This normalizer accepts either casing defensively so a future response-shape
 * change on either endpoint does not silently produce blank field context.
 */
function normalizeHistoricalScoreEntry(raw: Record<string, unknown>): TxLineScoreSnapshot {
  const pick = (pascalKey: string, camelKey: string) =>
    raw[pascalKey] ?? raw[camelKey];

  return {
    FixtureId: pick("FixtureId", "fixtureId") as number | undefined,
    Ts: pick("Ts", "ts") as number | undefined,
    GameState: pick("GameState", "gameState") as string | null | undefined,
    Status: pick("Status", "status") as string | null | undefined,
    StatusId: pick("StatusId", "statusId") as number | undefined,
    Action: pick("Action", "action") as string | undefined,
    Confirmed: pick("Confirmed", "confirmed") as boolean | undefined,
    Clock: pick("Clock", "clock"),
    Score: pick("Score", "score"),
    HomeScore: pick("HomeScore", "homeScore") as number | undefined,
    AwayScore: pick("AwayScore", "awayScore") as number | undefined,
    Participant1Score: pick("Participant1Score", "participant1Score") as number | undefined,
    Participant2Score: pick("Participant2Score", "participant2Score") as number | undefined,
    Scores: pick("Scores", "scores"),
    Participant: pick("Participant", "participant") as number | null | undefined,
    Possession: pick("Possession", "possession") as number | null | undefined,
    PossessionType: pick("PossessionType", "possessionType") as string | null | undefined,
    PossibleEvent: pick("PossibleEvent", "possibleEvent"),
    Data: pick("Data", "data") as Record<string, unknown> | null | undefined,
    Seq: pick("Seq", "seq") as number | undefined,
    Id: pick("Id", "id") as number | undefined,
  };
}

/**
 * Fetches the complete sequence of score updates for a finished/recent fixture
 * using TxLINE's dedicated historical endpoint (only available for fixtures
 * that started between two weeks and six hours ago). This replaces relying on
 * a single /api/scores/snapshot current-state call for the recent-results
 * backfill path, giving the Scores Intelligence Layer the full play-by-play
 * history to pick the strongest field-context match from, instead of just
 * whatever the last snapshot happened to be.
 */
async function fetchHistoricalScores(
  fixtureId: number,
  jwt: string
): Promise<TxLineScoreSnapshot[]> {
  const raw = await txlineGet<Array<Record<string, unknown>>>(
    `/api/scores/historical/${fixtureId}`,
    jwt
  );

  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.map(normalizeHistoricalScoreEntry);
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
  const isParticipant1Home = fixture.Participant1IsHome !== false;
  const homeTeam = isParticipant1Home ? fixture.Participant1 : fixture.Participant2;
  const awayTeam = isParticipant1Home ? fixture.Participant2 : fixture.Participant1;

  return {
    id: String(fixture.FixtureId),
    competition: fixture.Competition ?? "World Cup",
    homeTeam: homeTeam ?? "Home",
    awayTeam: awayTeam ?? "Away",
    homeScore: 0,
    awayScore: 0,
    minute: inferMinute(fixture.StartTime),
    status: inferStatus(fixture.StartTime),
    lastUpdated: nowIso,
  };
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function readObjectNumber(
  value: unknown,
  keys: string[]
): number | undefined {
  if (!value || typeof value !== "object") return undefined;

  const record = value as Record<string, unknown>;

  for (const key of keys) {
    const numberValue = toNumber(record[key]);
    if (numberValue !== undefined) return numberValue;
  }

  return undefined;
}

function readNestedNumber(
  value: unknown,
  path: string[]
): number | undefined {
  let current: unknown = value;

  for (const key of path) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }

  return toNumber(current);
}

function formatScorePair(home?: number, away?: number): string | undefined {
  if (home === undefined && away === undefined) return undefined;
  return `${home ?? 0}-${away ?? 0}`;
}

function readParticipantStat(
  scoreValue: unknown,
  participant: "Participant1" | "Participant2",
  periods: string[],
  stats: string[]
): number | undefined {
  for (const period of periods) {
    for (const stat of stats) {
      const value = readNestedNumber(scoreValue, [participant, period, stat]);
      if (value !== undefined) return value;
    }
  }

  for (const stat of stats) {
    const value = readNestedNumber(scoreValue, [participant, stat]);
    if (value !== undefined) return value;
  }

  return undefined;
}

function readScorePair(
  scoreValue: unknown,
  periods: string[],
  stats: string[]
): string | undefined {
  const home = readParticipantStat(scoreValue, "Participant1", periods, stats);
  const away = readParticipantStat(scoreValue, "Participant2", periods, stats);

  return formatScorePair(home, away);
}

function extractScoreBreakdown(
  score: TxLineScoreSnapshot
): TxLineScoresContext["scoreBreakdown"] | undefined {
  const scoreValue = score.Score ?? score.Scores;

  const breakdown: TxLineScoresContext["scoreBreakdown"] = {
    h1: readScorePair(scoreValue, ["H1", "HT", "FirstHalf", "1H"], ["Goals", "goals"]),
    h2: readScorePair(scoreValue, ["H2", "SecondHalf", "2H"], ["Goals", "goals"]),
    total: readScorePair(scoreValue, ["Total", "FT", "FullTime"], ["Goals", "goals"]),
    goals: readScorePair(scoreValue, ["Total", "FT", "FullTime"], ["Goals", "goals"]),
    corners: readScorePair(scoreValue, ["Total", "FT", "FullTime"], ["Corners", "corners", "Corner"]),
    redCards: readScorePair(scoreValue, ["Total", "FT", "FullTime"], ["RedCards", "redCards", "RedCard"]),
    yellowCards: readScorePair(scoreValue, ["Total", "FT", "FullTime"], ["YellowCards", "yellowCards", "YellowCard"]),
  };

  return Object.values(breakdown).some(Boolean) ? breakdown : undefined;
}
function latestScoreEvent(
  score: TxLineScoreSnapshot | TxLineScoreSnapshot[]
): TxLineScoreSnapshot | undefined {
  const events = Array.isArray(score) ? score : [score];

  return events
    .filter((event) => event && typeof event === "object")
    .sort((a, b) => (b.Ts ?? 0) - (a.Ts ?? 0))[0];
}

function latestEventWithScore(
  score: TxLineScoreSnapshot | TxLineScoreSnapshot[]
): TxLineScoreSnapshot | undefined {
  const events = Array.isArray(score) ? score : [score];

  return events
    .filter((event) => event && typeof event === "object" && event.Score)
    .sort((a, b) => (b.Ts ?? 0) - (a.Ts ?? 0))[0];
}

function parseScoreText(value: unknown): [number, number] | undefined {
  if (typeof value !== "string") return undefined;

  const match = value.match(/(\d+)\s*[-:]\s*(\d+)/);
  if (!match) return undefined;

  return [Number(match[1]), Number(match[2])];
}

function extractScores(score: TxLineScoreSnapshot): {
  homeScore: number;
  awayScore: number;
} {
  const directHome =
    toNumber(score.HomeScore) ?? toNumber(score.Participant1Score);
  const directAway =
    toNumber(score.AwayScore) ?? toNumber(score.Participant2Score);

  if (directHome !== undefined && directAway !== undefined) {
    return {
      homeScore: directHome,
      awayScore: directAway,
    };
  }

  const scoreValue = score.Score ?? score.Scores;

  const nestedHomeGoals =
    readNestedNumber(scoreValue, ["Participant1", "Total", "Goals"]) ??
    readNestedNumber(scoreValue, ["Participant1", "FT", "Goals"]) ??
    readNestedNumber(scoreValue, ["Participant1", "H2", "Goals"]) ??
    readNestedNumber(scoreValue, ["Participant1", "H1", "Goals"]);

  const nestedAwayGoals =
    readNestedNumber(scoreValue, ["Participant2", "Total", "Goals"]) ??
    readNestedNumber(scoreValue, ["Participant2", "FT", "Goals"]) ??
    readNestedNumber(scoreValue, ["Participant2", "H2", "Goals"]) ??
    readNestedNumber(scoreValue, ["Participant2", "H1", "Goals"]);

  if (nestedHomeGoals !== undefined || nestedAwayGoals !== undefined) {
    return {
      homeScore: nestedHomeGoals ?? 0,
      awayScore: nestedAwayGoals ?? 0,
    };
  }

  if (Array.isArray(scoreValue)) {
    return {
      homeScore: toNumber(scoreValue[0]) ?? 0,
      awayScore: toNumber(scoreValue[1]) ?? 0,
    };
  }

  const parsedText = parseScoreText(scoreValue);
  if (parsedText) {
    return {
      homeScore: parsedText[0],
      awayScore: parsedText[1],
    };
  }

  const homeScore =
    readObjectNumber(scoreValue, [
      "home",
      "Home",
      "homeScore",
      "HomeScore",
      "participant1",
      "Participant1",
      "participant1Score",
      "Participant1Score",
      "part1",
      "Part1",
    ]) ?? 0;

  const awayScore =
    readObjectNumber(scoreValue, [
      "away",
      "Away",
      "awayScore",
      "AwayScore",
      "participant2",
      "Participant2",
      "participant2Score",
      "Participant2Score",
      "part2",
      "Part2",
    ]) ?? 0;

  return {
    homeScore,
    awayScore,
  };
}

function extractMinute(clock: unknown, fallbackMinute: number): number {
  const directMinute = toNumber(clock);
  if (directMinute !== undefined) {
    return Math.max(0, Math.min(130, directMinute));
  }

  const seconds =
    readObjectNumber(clock, ["seconds", "Seconds", "gameSeconds", "GameSeconds"]) ??
    undefined;

  if (seconds !== undefined) {
    return Math.max(0, Math.min(130, Math.floor(seconds / 60)));
  }

  const minute =
    readObjectNumber(clock, ["minute", "Minute", "minutes", "Minutes"]) ??
    undefined;

  if (minute !== undefined) {
    return Math.max(0, Math.min(130, minute));
  }

  return fallbackMinute;
}

function statusFromStatusId(
  statusId: number | undefined,
  fallbackStatus: Match["status"]
): Match["status"] {
  if (!statusId) return fallbackStatus;

  if (statusId === 1) return "scheduled";

  if ([5, 10, 13, 15, 16, 17, 100].includes(statusId)) {
    return "finished";
  }

  return "live";
}

function formatClockLabel(seconds: number | undefined, fallbackMinute: number) {
  if (seconds === undefined) {
    return fallbackMinute > 0 ? `${fallbackMinute}'` : undefined;
  }

  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;

  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}
function statusFromScoreState(
  state: string | null | undefined,
  fallbackStatus: Match["status"]
): Match["status"] {
  const normalized = (state ?? "").toLowerCase();

  if (
    normalized.includes("finish") ||
    normalized.includes("ended") ||
    normalized.includes("full") ||
    normalized.includes("closed") ||
    normalized.includes("complete")
  ) {
    return "finished";
  }

  if (
    normalized.includes("live") ||
    normalized.includes("running") ||
    normalized.includes("progress") ||
    normalized.includes("half") ||
    normalized.includes("period")
  ) {
    return "live";
  }

  return fallbackStatus;
}

function applyScoreSnapshot(
  match: Match,
  score: TxLineScoreSnapshot | TxLineScoreSnapshot[] | undefined,
  nowIso: string
): Match {
  if (!score) return match;

  const scoreEvent = latestEventWithScore(score) ?? latestScoreEvent(score);

  if (!scoreEvent) return match;

  const scores = extractScores(scoreEvent);
  const statusId = toNumber(scoreEvent.StatusId);
  const clockSeconds = readObjectNumber(scoreEvent.Clock, ["Seconds", "seconds", "gameSeconds", "GameSeconds"]);
  const minute = extractMinute(scoreEvent.Clock, match.minute);
  const genericStatus = statusFromScoreState(
    scoreEvent.GameState ?? scoreEvent.Status,
    match.status
  );

  return {
    ...match,
    homeScore: scores.homeScore,
    awayScore: scores.awayScore,
    minute,
    status: statusFromStatusId(statusId, genericStatus),
    statusId,
    statusLabel: statusId ? STATUS_LABELS[statusId] : scoreEvent.Status ?? scoreEvent.GameState ?? undefined,
    clockSeconds,
    clockLabel: formatClockLabel(clockSeconds, minute),
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

/**
 * Full-match (not per-half) Over/Under Total Goals market. SuperOddsType
 * "OVERUNDER_PARTICIPANT_GOALS" with an empty MarketPeriod is the
 * full-match version (MarketPeriod "half=1"/"half=2" are first/
 * second-half-only lines, intentionally excluded here).
 */
function isTotalsOdds(item: TxLineOddsSnapshot): boolean {
  return (
    item.SuperOddsType === "OVERUNDER_PARTICIPANT_GOALS" &&
    (item.MarketPeriod === null || item.MarketPeriod === undefined) &&
    Array.isArray(item.PriceNames) &&
    Array.isArray(item.Prices) &&
    item.PriceNames.includes("over") &&
    item.PriceNames.includes("under")
  );
}

function getTotalsPrice(item: TxLineOddsSnapshot, name: "over" | "under") {
  const index = item.PriceNames?.indexOf(name) ?? -1;

  return index >= 0 ? priceToDecimal(item.Prices?.[index]) : 1.01;
}

function getTotalsLine(item: TxLineOddsSnapshot): string {
  const match = item.MarketParameters?.match(/line=([\d.]+)/);
  return match ? match[1] : "?";
}

function findLatestTotalsOdds(
  odds: TxLineOddsSnapshot[]
): TxLineOddsSnapshot | undefined {
  return odds
    .filter(isTotalsOdds)
    .sort((a, b) => (b.Ts ?? 0) - (a.Ts ?? 0))[0];
}

/**
 * A fixture can offer more than one total-goals line at once (e.g. 2.5 and
 * 3.5 simultaneously). Movement history is only meaningful when compared
 * against the same line, so this locks onto whichever line the latest
 * update used and only returns history for that exact line.
 */
function selectTotalsMovementOdds(
  odds: TxLineOddsSnapshot[],
  limit = 8
): TxLineOddsSnapshot[] {
  const latest = findLatestTotalsOdds(odds);

  if (!latest) return [];

  const line = getTotalsLine(latest);

  const candidates = odds
    .filter(isTotalsOdds)
    .filter((item) => getTotalsLine(item) === line)
    .sort((a, b) => (a.Ts ?? 0) - (b.Ts ?? 0));

  const uniqueByMessage = new Map<string, TxLineOddsSnapshot>();

  for (const item of candidates) {
    const key = item.MessageId ?? `${item.FixtureId}-${item.Ts}-${item.Prices?.join("-")}`;
    uniqueByMessage.set(key, item);
  }

  return [...uniqueByMessage.values()].slice(-limit);
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
  endpointUsed: string,
  scoresContext?: TxLineScoresContext
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
      scoresContext,
      proofLabel: scoresContext
        ? "Generated from real TxLINE odds movement data and TXODDS Scores event context"
        : "Generated from real TxLINE odds movement data",
    },
  };
}

/**
 * Builds an OddsSnapshot for the full-match Over/Under Total Goals market.
 * Uses a distinct matchId ("<fixtureId>-totals-<line>") so this market's
 * snapshot history is tracked completely separately from the 1X2 market in
 * the store. Mixing the two under one matchId would let the signal engine
 * compare a 1X2 price against a totals price as if they were the same
 * market, producing meaningless "movement" — the same class of bug fixed
 * earlier for chronological snapshot ordering.
 */
function normalizeTotalsSnapshot(
  match: Match,
  odds: TxLineOddsSnapshot,
  endpointUsed: string,
  scoresContext?: TxLineScoresContext
): OddsSnapshot {
  const createdAt = odds.Ts
    ? new Date(odds.Ts).toISOString()
    : new Date().toISOString();

  const line = getTotalsLine(odds);

  return {
    id: `txline-totals-${match.id}-${line}-${odds.Ts ?? Date.now()}-${
      odds.MessageId ?? "snapshot"
    }`,
    matchId: `${match.id}-totals-${line}`,
    matchLabel: `${match.homeTeam} vs ${match.awayTeam}`,
    homeTeam: `Over ${line}`,
    awayTeam: `Under ${line}`,
    homeOdds: getTotalsPrice(odds, "over"),
    awayOdds: getTotalsPrice(odds, "under"),
    drawOdds: 1,
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
      scoresContext,
      proofLabel: scoresContext
        ? "Generated from real TxLINE odds movement data and TXODDS Scores event context"
        : "Generated from real TxLINE odds movement data",
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

/**
 * A single fixtures/snapshot response can contain far more entries than we
 * process per cycle (bounded to 14 below for TxLINE rate/latency reasons).
 * Without sorting, a currently in-play match could be pushed past that limit
 * by unrelated future-scheduled fixtures, silently dropping live coverage.
 * This prioritizes fixtures whose kickoff has already passed and are still
 * within a plausible in-play window (kickoff to kickoff + 3 hours, covering
 * full time plus stoppage/extra time/penalties) ahead of everything else,
 * then falls back to soonest-kickoff-first for the remaining slots.
 */

/**
 * A fixture already confirmed finished in the previous poll cycle's
 * store.matches should never be reprocessed - prioritizeLikelyLiveFixtures
 * only re-ranks by a StartTime heuristic, it never filters, so without
 * this a long-finished fixture can keep occupying a rotation slot
 * indefinitely, wasting TxLINE calls and eventually producing a "new"
 * signal for the same historical tick once it outlives the odds-cache
 * and dedup windows. Matched by fixture ID against whatever store.matches
 * held at the start of this cycle (agent.ts replaces store.matches with
 * this cycle's own results only after fetchTxLineFeed returns, so the
 * previous cycle's confirmed statuses are still there to read).
 */
export function filterOutConfirmedFinishedFixtures(
  fixtures: TxLineFixture[],
  priorMatchesById: Map<string, Match>
): TxLineFixture[] {
  return fixtures.filter((fixture) => {
    const priorMatch = priorMatchesById.get(String(fixture.FixtureId));
    return !priorMatch || priorMatch.status !== "finished";
  });
}

function prioritizeLikelyLiveFixtures(fixtures: TxLineFixture[]): TxLineFixture[] {
  const nowMs = Date.now();
  const maxLikelyMatchDurationMs = 3 * 60 * 60 * 1000;

  const isLikelyInPlay = (fixture: TxLineFixture) => {
    if (!fixture.StartTime) {
      return false;
    }

    const elapsed = nowMs - fixture.StartTime;
    return elapsed >= 0 && elapsed <= maxLikelyMatchDurationMs;
  };

  return [...fixtures].sort((a, b) => {
    const aLive = isLikelyInPlay(a);
    const bLive = isLikelyInPlay(b);

    if (aLive !== bLive) {
      return aLive ? -1 : 1;
    }

    return (a.StartTime ?? 0) - (b.StartTime ?? 0);
  });
}

export async function fetchTxLineFeed(): Promise<TxLineFeedResult> {
  if (!config.txlineApiKey) {
    throw new Error(
      "TXLINE_API_TOKEN is missing. Set USE_SIMULATED_FEED=true for demo mode or add a valid TxLINE API token."
    );
  }

  const jwt = await getGuestJwt();
  const fixtures = await txlineGet<TxLineFixture[]>("/api/fixtures/snapshot", jwt);
  const priorMatchesById = new Map(store.matches.map((match) => [match.id, match]));
  const liveFixtures = filterOutConfirmedFinishedFixtures(fixtures, priorMatchesById);
  const prioritizedFixtures = prioritizeLikelyLiveFixtures(liveFixtures);

  const nowIso = new Date().toISOString();
  const matches: Match[] = [];
  const snapshots: OddsSnapshot[] = [];

  for (const fixture of prioritizedFixtures.slice(0, 14)) {
    let match = normalizeFixture(fixture, nowIso);
    let scoreSnapshot: TxLineScoreSnapshot | TxLineScoreSnapshot[] | undefined;

    try {
      scoreSnapshot = await txlineGet<TxLineScoreSnapshot | TxLineScoreSnapshot[]>(
        `/api/scores/snapshot/${fixture.FixtureId}`,
        jwt
      );

      match = applyScoreSnapshot(match, scoreSnapshot, nowIso);
    } catch (error) {
      console.warn(
        `TxLINE score enrichment skipped for fixture ${fixture.FixtureId}:`,
        error instanceof Error ? error.message : error
      );
    }

    let latestOdds: TxLineOddsSnapshot | undefined;
    let movementOdds: TxLineOddsSnapshot[] = [];
    let latestTotalsOdds: TxLineOddsSnapshot | undefined;
    let totalsMovementOdds: TxLineOddsSnapshot[] = [];

    try {
      const currentOdds = await txlineGet<TxLineOddsSnapshot[]>(
        `/api/odds/snapshot/${fixture.FixtureId}`,
        jwt
      );

      latestOdds = findLatest1x2Odds(currentOdds);
      latestTotalsOdds = findLatestTotalsOdds(currentOdds);

      const historicalOdds = await getOddsUpdates(fixture.FixtureId, jwt);
      movementOdds = selectMovementOdds(historicalOdds, 8);
      totalsMovementOdds = selectTotalsMovementOdds(historicalOdds, 8);
    } catch (error) {
      console.warn(
        `TxLINE odds enrichment skipped for fixture ${fixture.FixtureId}:`,
        error instanceof Error ? error.message : error
      );
    }

    const selectedOdds = latestOdds ? [...movementOdds, latestOdds] : movementOdds;
    const selectedTotalsOdds = latestTotalsOdds
      ? [...totalsMovementOdds, latestTotalsOdds]
      : totalsMovementOdds;

    if (selectedOdds.length === 0 && selectedTotalsOdds.length === 0) {
      continue;
    }

    const scoresContext = buildScoresContext(
      scoreSnapshot,
      fixture,
      match,
      `/api/scores/snapshot/${fixture.FixtureId}`
    );

    matches.push(match);

    for (const item of selectedOdds) {
      const endpointUsed =
        item.MessageId === latestOdds?.MessageId
          ? `/api/odds/snapshot/${fixture.FixtureId}`
          : `/api/odds/updates/${fixture.FixtureId}`;

      const contextForItem = isScoresContextFresh(
        item.Ts,
        scoresContext?.timestamp,
        SCORES_CONTEXT_TOLERANCE_MS
      )
        ? scoresContext
        : undefined;

      snapshots.push(normalizeOddsSnapshot(match, item, endpointUsed, contextForItem));
    }

    for (const item of selectedTotalsOdds) {
      const endpointUsed =
        item.MessageId === latestTotalsOdds?.MessageId
          ? `/api/odds/snapshot/${fixture.FixtureId}`
          : `/api/odds/updates/${fixture.FixtureId}`;

      const contextForItem = isScoresContextFresh(
        item.Ts,
        scoresContext?.timestamp,
        SCORES_CONTEXT_TOLERANCE_MS
      )
        ? scoresContext
        : undefined;

      snapshots.push(normalizeTotalsSnapshot(match, item, endpointUsed, contextForItem));
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
    rawFixtureCount: fixtures.length,
  };
}





export async function fetchRecentTxLineResults(): Promise<TxLineFeedResult> {
  if (!config.txlineApiKey) {
    return {
      matches: [],
      snapshots: [],
    };
  }

  const jwt = await getGuestJwt();
  const nowIso = new Date().toISOString();
  const matches: Match[] = [];
  const snapshots: OddsSnapshot[] = [];

  for (const fixture of RECENT_RESULT_FIXTURES) {
    try {
      let match = normalizeFixture(fixture, nowIso);

      let scoreSnapshot: TxLineScoreSnapshot | TxLineScoreSnapshot[];
      let scoresEndpointUsed = `/api/scores/historical/${fixture.FixtureId}`;

      try {
        const historicalScores = await fetchHistoricalScores(fixture.FixtureId, jwt);

        if (historicalScores.length === 0) {
          throw new Error("Historical endpoint returned no score updates.");
        }

        scoreSnapshot = historicalScores;
      } catch (error) {
        console.warn(
          `TxLINE historical scores unavailable for fixture ${fixture.FixtureId}, falling back to current snapshot:`,
          error instanceof Error ? error.message : error
        );

        scoresEndpointUsed = `/api/scores/snapshot/${fixture.FixtureId}`;
        scoreSnapshot = await txlineGet<TxLineScoreSnapshot | TxLineScoreSnapshot[]>(
          scoresEndpointUsed,
          jwt
        );
      }

      match = applyScoreSnapshot(match, scoreSnapshot, nowIso);

      if (match.status !== "finished") {
        continue;
      }

      const scoresContext = buildScoresContext(
        scoreSnapshot,
        fixture,
        match,
        scoresEndpointUsed
      );

      matches.push(match);

      let latestOdds: TxLineOddsSnapshot | undefined;
      let movementOdds: TxLineOddsSnapshot[] = [];

      try {
        const currentOdds = await txlineGet<TxLineOddsSnapshot[]>(
          `/api/odds/snapshot/${fixture.FixtureId}`,
          jwt
        );

        latestOdds = findLatest1x2Odds(currentOdds);
      } catch (error) {
        console.warn(
          `TxLINE recent odds snapshot skipped for fixture ${fixture.FixtureId}:`,
          error instanceof Error ? error.message : error
        );
      }

      try {
        const oddsUpdates = await getOddsUpdates(fixture.FixtureId, jwt);
        movementOdds = selectMovementOdds(oddsUpdates);
      } catch (error) {
        console.warn(
          `TxLINE recent odds updates skipped for fixture ${fixture.FixtureId}:`,
          error instanceof Error ? error.message : error
        );
      }

      const selectedOdds = [...movementOdds];

      if (
        latestOdds &&
        !selectedOdds.some(
          (item) =>
            (item.MessageId && item.MessageId === latestOdds?.MessageId) ||
            item.Ts === latestOdds?.Ts
        )
      ) {
        selectedOdds.push(latestOdds);
      }

      for (const item of selectedOdds) {
        const endpointUsed =
          item.MessageId === latestOdds?.MessageId
            ? `/api/odds/snapshot/${fixture.FixtureId}`
            : `/api/odds/updates/${fixture.FixtureId}`;

        const contextForItem = isScoresContextFresh(
          item.Ts,
          scoresContext?.timestamp,
          SCORES_CONTEXT_TOLERANCE_MS
        )
          ? scoresContext
          : undefined;

        snapshots.push(normalizeOddsSnapshot(match, item, endpointUsed, contextForItem));
      }
    } catch (error) {
      console.warn(
        `TxLINE recent result bootstrap skipped for fixture ${fixture.FixtureId}:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  const uniqueSnapshots = new Map<string, OddsSnapshot>();

  for (const snapshot of snapshots) {
    uniqueSnapshots.set(snapshot.id, snapshot);
  }

  return {
    matches,
    snapshots: sortSnapshotsChronologically([...uniqueSnapshots.values()]),
  };
}
