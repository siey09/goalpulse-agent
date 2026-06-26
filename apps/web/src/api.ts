const API_BASE_URL = "http://localhost:4000";

export interface Match {
  id: string;
  competition: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  minute: number;
  status: "scheduled" | "live" | "finished";
  lastUpdated: string;
}

export interface AgentSignal {
  id: string;
  matchId: string;
  match: string;
  target: string;
  side: "home" | "away";
  signalType: "SHARP_MOVE" | "WATCH" | "MOMENTUM_SHIFT" | "NO_ACTION";
  severity: "HIGH" | "MEDIUM" | "LOW" | "NONE";
  oddsBefore: number;
  oddsAfter: number;
  oddsChangePct: number;
  momentumScore: number;
  explanation: string;
  createdAt: string;
  resultStatus: "pending" | "correct" | "incorrect";
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
}

export interface AgentStats {
  txlineUpdates: number;
  signalsGenerated: number;
  highSeverity: number;
  pendingSignals: number;
  strategyAccuracy: number;
  lastAgentRun: {
    id: string;
    startedAt: string;
    finishedAt: string;
    matchesProcessed: number;
    snapshotsCreated: number;
    signalsCreated: number;
    status: "success" | "error";
    message: string;
  } | null;
}

async function request<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`);

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }

  const json = await response.json();
  return json.data as T;
}

export function getMatches() {
  return request<Match[]>("/api/matches");
}

export function getSignals() {
  return request<AgentSignal[]>("/api/signals");
}

export function getStats() {
  return request<AgentStats>("/api/stats");
}

export function getOddsHistory(matchId: string) {
  return request<OddsSnapshot[]>(`/api/odds-history?matchId=${matchId}`);
}
