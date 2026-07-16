export type Odds = {
  homeOdds?: number;
  drawOdds?: number;
  awayOdds?: number;
};

export type Match = {
  id: string;
  homeTeam?: string;
  awayTeam?: string;
  homeScore?: number;
  awayScore?: number;
  minute?: number;
  status?: string;
  statusId?: number;
  statusLabel?: string;
  clockSeconds?: number;
  clockLabel?: string;
  lastUpdated?: string;
  market?: Odds;
  odds?: Odds;
};

export type AgentSignal = {
  id?: string;
  matchId?: string;
  match?: string;
  team?: string;
  target?: string;
  side?: string;
  type?: string;
  signalType?: string;
  severity?: string;
  oddsBefore?: number;
  oddsAfter?: number;
  oddsChangePct?: number;
  probabilityPointShiftPct?: number;
  momentumScore?: number;
  confidence?: number;
  confidenceScore?: number;
  explanation?: string;
  reason?: string;
  createdAt?: string;
  resultStatus?: string;
  trapStatus?: string;
  trapScore?: number;
  trapReason?: string;
  reversalRisk?: string;
  reversalReason?: string;
  finalScore?: string;
  scoreRealityStatus?: string;
  scoreRealityReason?: string;
  evidence?: {
    marketType?: string;
    fixtureId?: string;
    currentSnapshotId?: string;
    scoresContext?: {
      sequence?: number;
      fieldPressureScore?: number;
      minute?: number;
      homeScore?: number;
      awayScore?: number;
      scoreline?: string;
      pressureLevel?: "NONE" | "SAFE" | "ATTACK" | "DANGER" | "HIGH_DANGER";
      reliability?: "RELIABLE" | "UNRELIABLE" | "SUSPENDED" | "UNKNOWN";
      reliabilityReason?: string;
    };
  };
  discordAlertStatus?: "sent" | "failed" | "not_configured";
};

export type OnChainVerifyData = {
  available: boolean;
  reason?: string;
  isValid?: boolean;
  provenStat?: { key: number; value: number; period: number };
  dailyScoresPda?: string;
};

export type ReplayBacktest = {
  datasetId?: string;
  mode?: string;
  status?: string;
  summary?: {
    snapshotsProcessed?: number;
    signalsDetected?: number;
    correctSignals?: number;
    incorrectSignals?: number;
    accuracyPct?: number;
    smartMoneyTraps?: number;
    confirmedTraps?: number;
    possibleTraps?: number;
  };
  timeline?: {
    step?: string;
    detail?: string;
  }[];
  events?: {
    id?: string;
    matchId?: string;
    minute?: number;
    team?: string;
    type?: string;
    description?: string;
    createdAt?: string;
  }[];
  signals?: AgentSignal[];
  councilVotes?: {
    signalId?: string;
    matchId?: string;
    target?: string;
    decision?: string;
    approvals?: number;
    totalAgents?: number;
    votes?: {
      agent?: string;
      vote?: string;
      reason?: string;
    }[];
  }[];
  proof?: {
    type?: string;
    hash?: string;
    network?: string;
    anchoringStatus?: string;
    walletConfigured?: boolean;
    transactionSignature?: string | null;
    explorerUrl?: string | null;
    note?: string;
  };
};

export type Health = {
  ok?: boolean;
  agentIntervalMs?: number;
  useSimulatedFeed?: boolean;
  liveStream?: {
    connected?: boolean;
    lastEventAt?: string | null;
    totalEventsReceived?: number;
    totalReconnects?: number;
    lastError?: string | null;
  };
};

export type SimilarSignalEntry = {
  matchId?: string;
  signalType?: string;
  severity?: string;
  oddsChangePct?: number;
  fieldPressureScore?: number;
  resultStatus?: "correct" | "incorrect";
  archivedAt?: string;
};

export type SimilarSignalsResult = {
  count: number;
  correctCount: number;
  incorrectCount: number;
  accuracyPct: number;
  signals: SimilarSignalEntry[];
};
