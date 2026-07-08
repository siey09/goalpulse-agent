export type TeamSide = "home" | "away";
export type SignalType = "SHARP_MOVE" | "WATCH" | "MOMENTUM_SHIFT" | "NO_ACTION";
export type Severity = "HIGH" | "MEDIUM" | "LOW" | "NONE";

export type MatchStatus = "scheduled" | "live" | "finished";

export interface TxLineScoresContext {
  fixtureId?: string;
  endpointUsed?: string;
  latestAction?: string;
  actionLabel?: string;
  actionTeam?: "home" | "away" | "neutral" | "unknown";
  statusId?: number;
  statusName?: string;
  clockSeconds?: number;
  minute?: number;
  homeScore?: number;
  awayScore?: number;
  scoreline?: string;
  scoreBreakdown?: {
    h1?: string;
    h2?: string;
    total?: string;
    goals?: string;
    corners?: string;
    redCards?: string;
    yellowCards?: string;
  };
  possessionType?: string;
  pressureLevel?: "NONE" | "SAFE" | "ATTACK" | "DANGER" | "HIGH_DANGER";
  fieldPressureScore?: number;
  reliability?: "RELIABLE" | "UNRELIABLE" | "SUSPENDED" | "UNKNOWN";
  reliabilityReason?: string;
  confirmed?: boolean;
  sequence?: number;
  timestamp?: string;
  proofLabel?: string;
}

export interface TxLineEvidence {
  source: "txline" | "simulated_txline";
  fixtureId?: string;
  endpointUsed?: string;
  bookmaker?: string;
  messageId?: string;
  marketType?: string;
  marketPeriod?: string | null;
  marketParameters?: string | null;
  previousSnapshotId?: string;
  currentSnapshotId?: string;
  previousTimestamp?: string;
  currentTimestamp?: string;
  scoresContext?: TxLineScoresContext;
  proofLabel?: string;
}

export interface Match {
  id: string;
  competition: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  minute: number;
  status: MatchStatus;
  statusId?: number;
  statusLabel?: string;
  clockSeconds?: number;
  clockLabel?: string;
  lastUpdated: string;
}

export interface OddsSnapshot {
  id: string;
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  homeOdds: number;
  awayOdds: number;
  drawOdds: number;
  homeScore: number;
  awayScore: number;
  minute: number;
  source: "simulated_txline" | "txline";
  createdAt: string;
  /**
   * Optional real-match display label (e.g. "Portugal vs Spain"), used when
   * homeTeam/awayTeam have been repurposed to describe a non-1X2 market
   * outcome (e.g. "Over 3.5" / "Under 3.5" for a total goals market) so the
   * signal's `match` field can still show the actual fixture context.
   */
  matchLabel?: string;
  evidence?: TxLineEvidence;
}

export interface AgentSignal {
  id: string;
  matchId: string;
  match: string;
  target: string;
  side: TeamSide;
  signalType: SignalType;
  severity: Severity;
  oddsBefore: number;
  oddsAfter: number;
  oddsChangePct: number;
  momentumScore: number;
  confidenceScore?: number;
  explanation: string;
  createdAt: string;
  resultStatus: "pending" | "correct" | "incorrect";
  evidence?: TxLineEvidence;
  discordAlertStatus?: "sent" | "failed" | "not_configured";
}

export interface ArchiveFilters {
  matchId?: string;
  status?: "pending" | "correct" | "incorrect";
  market?: "1x2" | "totals";
  event?: "created" | "settled";
}

export interface ArchivePagination {
  page: number;
  pageSize: number;
}

export interface ArchiveEntry {
  signalId: string;
  event: "created" | "settled";
  matchId: string;
  side: TeamSide;
  signalType: SignalType;
  severity: Severity;
  resultStatus: "pending" | "correct" | "incorrect";
  momentumScore: number;
  oddsChangePct: number;
  archivedAt: string;
  signalData: AgentSignal;
}

export interface ArchiveQueryResult {
  data: ArchiveEntry[];
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
}

export interface AgentRun {
  id: string;
  startedAt: string;
  finishedAt: string;
  matchesProcessed: number;
  snapshotsCreated: number;
  signalsCreated: number;
  rawFixtureCount: number;
  status: "success" | "error";
  message: string;
}

export interface MarketMakerQuote {
  matchId: string;
  match: string;
  fairOdds: { home: number; away: number; draw: number };
  bidOdds: { home: number; away: number; draw: number };
  askOdds: { home: number; away: number; draw: number };
  spreadPct: number;
  spreadWidth: "NARROW" | "MODERATE" | "WIDE";
  reason: string;
  fieldPressureScore: number;
  reliability: "RELIABLE" | "UNRELIABLE" | "SUSPENDED" | "UNKNOWN";
  computedAt: string;
}

export type ArenaAgentId = "momentum_follower" | "contrarian" | "kelly_criterion";

export interface ArenaPosition {
  agentId: ArenaAgentId;
  signalId: string;
  matchId: string;
  match: string;
  side: TeamSide;
  target: string;
  oddsTaken: number;
  stakeUnits: number;
  resultStatus: "pending" | "correct" | "incorrect";
  profitUnits: number;
}

export interface ArenaScoreboard {
  agentId: ArenaAgentId;
  label: string;
  positions: ArenaPosition[];
  settledCount: number;
  correctCount: number;
  incorrectCount: number;
  winRatePct: number;
  netUnits: number;
  roiPercent: number;
  openPositions: number;
}

export interface ArenaProof {
  type: "sha256";
  hash: string;
  verifiableStat: { fixtureId: number; seq: number; statKey: number } | null;
  note: string;
}
