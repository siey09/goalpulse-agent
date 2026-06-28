export type TeamSide = "home" | "away";
export type SignalType = "SHARP_MOVE" | "WATCH" | "MOMENTUM_SHIFT" | "NO_ACTION";
export type Severity = "HIGH" | "MEDIUM" | "LOW" | "NONE";

export type MatchStatus = "scheduled" | "live" | "finished";

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
  explanation: string;
  createdAt: string;
  resultStatus: "pending" | "correct" | "incorrect";
  evidence?: TxLineEvidence;
}

export interface AgentRun {
  id: string;
  startedAt: string;
  finishedAt: string;
  matchesProcessed: number;
  snapshotsCreated: number;
  signalsCreated: number;
  status: "success" | "error";
  message: string;
}
