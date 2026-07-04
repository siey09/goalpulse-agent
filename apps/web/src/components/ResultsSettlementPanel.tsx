import { CheckCircle2, Clock, Database, Flag, ShieldCheck, Trophy } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "https://goalpulse-agent-api.onrender.com";

type Match = {
  id: string;
  competition?: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  minute: number;
  status: "scheduled" | "live" | "finished";
  statusId?: number;
  statusLabel?: string;
  clockSeconds?: number;
  clockLabel?: string;
  lastUpdated?: string;
};

type ScoresContext = {
  fixtureId?: string;
  endpointUsed?: string;
  actionLabel?: string;
  latestAction?: string;
  statusId?: number;
  statusName?: string;
  minute?: number;
  clockSeconds?: number;
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
  reliability?: "RELIABLE" | "UNRELIABLE" | "SUSPENDED" | "UNKNOWN";
  reliabilityReason?: string;
  proofLabel?: string;
};

type AgentSignal = {
  id: string;
  matchId: string;
  match: string;
  target: string;
  signalType: string;
  severity: string;
  oddsBefore: number;
  oddsAfter: number;
  oddsChangePct: number;
  resultStatus: "pending" | "correct" | "incorrect";
  evidence?: {
    source?: string;
    endpointUsed?: string;
    messageId?: string;
    bookmaker?: string;
    scoresContext?: ScoresContext;
  };
};

function getWinner(match: Match) {
  if (match.status !== "finished") return "Pending";
  if (match.homeScore > match.awayScore) return match.homeTeam;
  if (match.awayScore > match.homeScore) return match.awayTeam;
  return "Draw";
}

function getFinalScore(match?: Match) {
  if (!match) return "Pending";
  if (match.status === "scheduled") return "—";
  return `${match.homeScore}-${match.awayScore}`;
}

function getStatusLabel(match?: Match) {
  if (!match) return "WAITING";
  return match.statusLabel?.toUpperCase() ?? match.status.toUpperCase();
}

function getClockLabel(match?: Match) {
  if (!match) return "—";
  if (match.status === "scheduled") return "Pre-match";
  if (match.status === "finished") return match.statusLabel ?? "Final";
  return match.clockLabel ?? `${match.minute}'`;
}

function getSignalSettlement(signal: AgentSignal, match?: Match) {
  if (!match || match.status !== "finished") return "Awaiting final result";

  const winner = getWinner(match);
  const target = signal.target ?? "";

  if (winner === "Draw") return target.toLowerCase().includes("draw") ? "Correct" : "Incorrect";
  return winner.toLowerCase() === target.toLowerCase() ? "Correct" : "Incorrect";
}

function getSettlementReason(signal: AgentSignal, match?: Match) {
  if (!match || match.status !== "finished") {
    return "The fixture has not reached a final TXODDS score state yet.";
  }

  const winner = getWinner(match);
  const settlement = getSignalSettlement(signal, match);
  const finalScore = getFinalScore(match);

  if (settlement === "Correct") {
    return `The signal target matched the final winner: ${winner}. Final score was ${finalScore}.`;
  }

  return `The signal target did not match the final winner. Winner: ${winner}. Final score was ${finalScore}.`;
}

function compact(value?: string, max = 58) {
  if (!value) return "—";
  if (value.length <= max) return value;
  return `${value.slice(0, max)}...`;
}

export function ResultsSettlementPanel() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [signals, setSignals] = useState<AgentSignal[]>([]);

  useEffect(() => {
    let mounted = true;

    async function loadResults() {
      try {
        const [matchesResponse, recentResultsResponse, signalsResponse] = await Promise.all([
          fetch(`${API_BASE_URL}/api/matches`),
          fetch(`${API_BASE_URL}/api/recent-results`),
          fetch(`${API_BASE_URL}/api/signals`),
        ]);

        const matchesData = (await matchesResponse.json()) as Match[] | { matches?: Match[]; data?: Match[] };
        const recentResultsData = (await recentResultsResponse.json()) as Match[] | { matches?: Match[]; data?: Match[] };
        const signalsData = (await signalsResponse.json()) as AgentSignal[] | { signals?: AgentSignal[]; data?: AgentSignal[] };

        if (!mounted) return;

        const currentMatches = Array.isArray(matchesData) ? matchesData : matchesData.matches ?? matchesData.data ?? [];
        const recentResults = Array.isArray(recentResultsData)
          ? recentResultsData
          : recentResultsData.matches ?? recentResultsData.data ?? [];

        const mergedMatches = new Map<string, Match>();

        for (const match of currentMatches) {
          mergedMatches.set(match.id, match);
        }

        for (const match of recentResults) {
          mergedMatches.set(match.id, match);
        }

        setMatches([...mergedMatches.values()]);
        setSignals(Array.isArray(signalsData) ? signalsData : signalsData.signals ?? signalsData.data ?? []);
      } catch (error) {
        console.error("Unable to load results settlement panel", error);
      }
    }

    loadResults();
    const timer = window.setInterval(loadResults, 30000);

    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, []);

  const finishedMatches = useMemo(
    () => matches.filter((match) => match.status === "finished").slice(0, 4),
    [matches]
  );

  const settlementItems = useMemo(() => {
    return signals
      .map((signal) => {
        const match = matches.find((item) => item.id === signal.matchId);
        return {
          signal,
          match,
          settlement: getSignalSettlement(signal, match),
        };
      })
      .filter((item) => item.match?.status === "finished")
      .slice(0, 4);
  }, [matches, signals]);

  return (
    <section className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
      <div className="rounded-[24px] border border-white/10 bg-[#15100c] p-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-stone-500">Final score feed</p>
            <h2 className="text-base font-semibold text-white">TXODDS recent results</h2>
          </div>
          <Trophy className="h-4 w-4 text-emerald-300" />
        </div>

        <div className="space-y-2">
          {finishedMatches.length > 0 ? (
            finishedMatches.map((match) => (
              <div key={match.id} className="rounded-2xl bg-black/25 p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="rounded-full bg-emerald-400/10 px-2 py-1 text-[10px] font-semibold text-emerald-200">
                    {getStatusLabel(match)}
                  </span>
                  <span className="text-[10px] text-stone-500">
                    {getClockLabel(match)}
                  </span>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-medium text-white">{match.homeTeam}</span>
                    <span className="font-semibold text-white">{match.homeScore}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-medium text-white">{match.awayTeam}</span>
                    <span className="font-semibold text-white">{match.awayScore}</span>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                  <div className="rounded-xl bg-black/25 p-2">
                    <p className="text-stone-500">Winner</p>
                    <p className="truncate font-semibold text-stone-100">{getWinner(match)}</p>
                  </div>
                  <div className="rounded-xl bg-black/25 p-2">
                    <p className="text-stone-500">TXODDS status</p>
                    <p className="truncate font-semibold text-stone-100">
                      {match.statusId ? `#${match.statusId}` : "—"}
                    </p>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-2xl bg-black/25 p-4 text-sm text-stone-500">
              No finished matches from the current TxLINE feed yet.
            </div>
          )}
        </div>
      </div>

      <div className="rounded-[24px] border border-white/10 bg-[#15100c] p-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-stone-500">Post-match audit</p>
            <h2 className="text-base font-semibold text-white">Signal settlement center</h2>
          </div>
          <ShieldCheck className="h-4 w-4 text-sky-300" />
        </div>

        <div className="space-y-2">
          {settlementItems.length > 0 ? (
            settlementItems.map(({ signal, match, settlement }) => {
              const scoresContext = signal.evidence?.scoresContext;

              return (
                <div key={signal.id} className="rounded-2xl bg-black/25 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">
                        {signal.match} → {signal.target}
                      </p>
                      <p className="mt-1 text-xs text-stone-500">
                        Odds {signal.oddsBefore} → {signal.oddsAfter} • {signal.oddsChangePct}% move
                      </p>
                    </div>

                    <span
                      className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                        settlement === "Correct"
                          ? "bg-emerald-400/10 text-emerald-200"
                          : "bg-rose-400/10 text-rose-200"
                      }`}
                    >
                      {settlement}
                    </span>
                  </div>

                  <p className="mt-3 rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-[11px] leading-5 text-stone-400">
                    {getSettlementReason(signal, match)}
                  </p>

                  {match && (
                    <div className="mt-3 grid grid-cols-2 gap-2 text-center text-[11px] md:grid-cols-4">
                      <div className="rounded-xl bg-black/25 p-2">
                        <Flag className="mx-auto mb-1 h-3.5 w-3.5 text-stone-500" />
                        <p className="text-stone-500">Final</p>
                        <p className="font-semibold text-white">{getFinalScore(match)}</p>
                      </div>
                      <div className="rounded-xl bg-black/25 p-2">
                        <CheckCircle2 className="mx-auto mb-1 h-3.5 w-3.5 text-stone-500" />
                        <p className="text-stone-500">Winner</p>
                        <p className="truncate font-semibold text-white">{getWinner(match)}</p>
                      </div>
                      <div className="rounded-xl bg-black/25 p-2">
                        <Clock className="mx-auto mb-1 h-3.5 w-3.5 text-stone-500" />
                        <p className="text-stone-500">Status</p>
                        <p className="truncate font-semibold text-white">{getStatusLabel(match)}</p>
                      </div>
                      <div className="rounded-xl bg-black/25 p-2">
                        <Database className="mx-auto mb-1 h-3.5 w-3.5 text-stone-500" />
                        <p className="text-stone-500">Source</p>
                        <p className="truncate font-semibold text-white">
                          {signal.evidence?.source ?? "txline"}
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="mt-3 grid gap-2 text-[11px] md:grid-cols-2">
                    <AuditRow label="Odds endpoint" value={signal.evidence?.endpointUsed} />
                    <AuditRow label="Scores endpoint" value={scoresContext?.endpointUsed} />
                    <AuditRow label="Scores scoreline" value={scoresContext?.scoreline} />
                    <AuditRow label="Scores reliability" value={scoresContext?.reliability} />
                    <AuditRow label="H1 goals" value={scoresContext?.scoreBreakdown?.h1} />
                    <AuditRow label="H2 goals" value={scoresContext?.scoreBreakdown?.h2} />
                    <AuditRow label="Total goals" value={scoresContext?.scoreBreakdown?.total ?? scoresContext?.scoreBreakdown?.goals} />
                    <AuditRow label="Corners" value={scoresContext?.scoreBreakdown?.corners} />
                    <AuditRow label="Red cards" value={scoresContext?.scoreBreakdown?.redCards} />
                    <AuditRow label="Yellow cards" value={scoresContext?.scoreBreakdown?.yellowCards} />
                    <AuditRow label="Bookmaker" value={signal.evidence?.bookmaker} />
                    <AuditRow label="Message ID" value={compact(signal.evidence?.messageId)} mono />
                  </div>
                </div>
              );
            })
          ) : (
            <div className="rounded-2xl bg-black/25 p-4 text-sm text-stone-500">
              Finished-match signal settlements will appear once a signal matches a completed fixture.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function AuditRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value?: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-xl bg-black/20 p-2">
      <p className="text-[10px] uppercase tracking-[0.16em] text-stone-500">{label}</p>
      <p className={`mt-1 break-words text-stone-200 ${mono ? "font-mono text-[10px]" : "text-xs font-semibold"}`}>
        {value || "—"}
      </p>
    </div>
  );
}

