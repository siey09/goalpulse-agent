import { CheckCircle2, Clock, Flag, ShieldCheck, Trophy } from "lucide-react";
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
  lastUpdated?: string;
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
  };
};

function getWinner(match: Match) {
  if (match.status !== "finished") return "Pending";
  if (match.homeScore > match.awayScore) return match.homeTeam;
  if (match.awayScore > match.homeScore) return match.awayTeam;
  return "Draw";
}

function getSignalSettlement(signal: AgentSignal, match?: Match) {
  if (!match || match.status !== "finished") return "Awaiting final result";

  const winner = getWinner(match);
  const target = signal.target ?? "";

  if (winner === "Draw") return target.toLowerCase().includes("draw") ? "Correct" : "Incorrect";
  return winner.toLowerCase() === target.toLowerCase() ? "Correct" : "Incorrect";
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
            <h2 className="text-base font-semibold text-white">Recent results</h2>
          </div>
          <Trophy className="h-4 w-4 text-emerald-300" />
        </div>

        <div className="space-y-2">
          {finishedMatches.length > 0 ? (
            finishedMatches.map((match) => (
              <div key={match.id} className="rounded-2xl bg-black/25 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="rounded-full bg-emerald-400/10 px-2 py-1 text-[10px] font-semibold text-emerald-200">
                    FINISHED
                  </span>
                  <span className="text-[10px] text-stone-500">90'</span>
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

                <p className="mt-2 text-[11px] text-stone-500">
                  Winner: <span className="text-stone-200">{getWinner(match)}</span>
                </p>
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
            settlementItems.map(({ signal, match, settlement }) => (
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

                {match && (
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px]">
                    <div className="rounded-xl bg-black/25 p-2">
                      <Flag className="mx-auto mb-1 h-3.5 w-3.5 text-stone-500" />
                      <p className="text-stone-500">Final</p>
                      <p className="font-semibold text-white">
                        {match.homeScore}-{match.awayScore}
                      </p>
                    </div>
                    <div className="rounded-xl bg-black/25 p-2">
                      <CheckCircle2 className="mx-auto mb-1 h-3.5 w-3.5 text-stone-500" />
                      <p className="text-stone-500">Winner</p>
                      <p className="truncate font-semibold text-white">{getWinner(match)}</p>
                    </div>
                    <div className="rounded-xl bg-black/25 p-2">
                      <Clock className="mx-auto mb-1 h-3.5 w-3.5 text-stone-500" />
                      <p className="text-stone-500">Source</p>
                      <p className="truncate font-semibold text-white">
                        {signal.evidence?.source ?? "txline"}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ))
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

