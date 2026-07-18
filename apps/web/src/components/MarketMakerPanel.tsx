import { Activity, Gauge, TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";
import { Card } from "./ui/Card";
import { SectionHeader } from "./ui/SectionHeader";
import { StatusBadge, type StatusTone } from "./ui/StatusBadge";
import { EmptyState } from "./ui/EmptyState";
import { EvidenceStamp } from "./ui/EvidenceStamp";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "https://goalpulse-agent-api.onrender.com";

type MarketMakerQuote = {
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
};

function formatOdds(value?: number) {
  if (value === undefined || Number.isNaN(value)) return "--";
  return value.toFixed(2);
}

function spreadWidthTone(width: MarketMakerQuote["spreadWidth"]): StatusTone {
  if (width === "NARROW") return "positive";
  if (width === "MODERATE") return "warning";
  return "danger";
}

function reliabilityTone(reliability: MarketMakerQuote["reliability"]): StatusTone {
  if (reliability === "RELIABLE") return "positive";
  if (reliability === "UNRELIABLE") return "warning";
  if (reliability === "SUSPENDED") return "danger";
  return "neutral";
}

const MARKET_ROWS: Array<{ key: "home" | "draw" | "away"; label: string }> = [
  { key: "home", label: "Home" },
  { key: "draw", label: "Draw" },
  { key: "away", label: "Away" },
];

/**
 * One market's Bid/Fair/Ask reading as a row inside the shared quote
 * table. Replaces the old pattern of three separately-labeled boxes
 * (one per market, each repeating its own "Bid/Fair/Ask" header) with a
 * single table body, so the column meaning is stated once at the top
 * instead of three times.
 */
function QuoteTableRow({
  label,
  fair,
  bid,
  ask,
}: {
  label: string;
  fair: number;
  bid: number;
  ask: number;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_repeat(3,minmax(0,1fr))] items-center gap-2 border-t border-border/60 px-3 py-2.5 first:border-t-0">
      <p className="text-xs font-semibold text-stone-200">{label}</p>
      <p className="text-center font-mono text-sm font-semibold text-positive">{formatOdds(bid)}</p>
      <p className="text-center font-mono text-sm font-semibold text-white">{formatOdds(fair)}</p>
      <p className="text-center font-mono text-sm font-semibold text-accent-soft">{formatOdds(ask)}</p>
    </div>
  );
}

export function MarketMakerPanel() {
  const [quotes, setQuotes] = useState<MarketMakerQuote[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadQuotes() {
      try {
        const response = await fetch(`${API_BASE_URL}/api/market-maker`);
        const payload = (await response.json()) as { data?: MarketMakerQuote[] };

        if (!mounted) return;

        const nextQuotes = payload.data ?? [];
        setQuotes(nextQuotes);
        setSelectedMatchId((current) =>
          current && nextQuotes.some((quote) => quote.matchId === current)
            ? current
            : (nextQuotes[0]?.matchId ?? null)
        );
      } catch (error) {
        console.error("Unable to load market maker quotes", error);
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    loadQuotes();

    const timer = window.setInterval(loadQuotes, 5000);

    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, []);

  const activeQuote = quotes.find((quote) => quote.matchId === selectedMatchId) ?? quotes[0];

  return (
    <Card id="market-maker" className="p-5">
      <SectionHeader
        eyebrow="In-Play Market Maker"
        title="Live bid/ask quotes"
        subtitle="Quotes a bid/ask spread around TxLINE's own de-margined fair odds. The spread widens with field pressure and data-reliability problems, and narrows in calm, reliable conditions."
        action={
          <div className="hidden items-center gap-2 rounded-xl border border-border bg-surface-3 px-3 py-2 sm:flex">
            <Gauge className="h-3.5 w-3.5 text-info" />
            <span className="text-[10px] uppercase tracking-[0.1em] text-stone-400">De-margined fair odds</span>
          </div>
        }
      />

      {isLoading ? (
        <EmptyState reason="Loading market maker quotes..." />
      ) : activeQuote ? (
        <div className="space-y-4">
          {quotes.length > 1 && (
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Quoted matches">
              {quotes.map((quote) => (
                <button
                  key={quote.matchId}
                  type="button"
                  role="tab"
                  aria-selected={quote.matchId === activeQuote.matchId}
                  onClick={() => setSelectedMatchId(quote.matchId)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    quote.matchId === activeQuote.matchId
                      ? "border-accent/40 bg-accent/15 text-accent-soft"
                      : "border-border bg-surface-3 text-stone-400 hover:border-white/20 hover:text-stone-200"
                  }`}
                >
                  {quote.match}
                </button>
              ))}
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-xl border border-border bg-surface-3 p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h3 className="font-display text-lg font-bold tracking-tight text-white">{activeQuote.match}</h3>
                <StatusBadge
                  label={`${activeQuote.spreadWidth} · ${activeQuote.spreadPct}%`}
                  tone={spreadWidthTone(activeQuote.spreadWidth)}
                />
              </div>

              <p className="mb-3 text-xs leading-5 text-stone-400">{activeQuote.reason}</p>

              <p className="mb-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] uppercase tracking-[0.1em] text-stone-500">
                <span>
                  <span className="text-positive">Bid</span> — price a seller gets
                </span>
                <span>
                  <span className="text-white">Fair</span> — de-margined true odds
                </span>
                <span>
                  <span className="text-accent-soft">Ask</span> — price a buyer pays
                </span>
              </p>

              <div className="overflow-hidden rounded-xl border border-border bg-black/20">
                <div className="grid grid-cols-[minmax(0,1fr)_repeat(3,minmax(0,1fr))] gap-2 bg-black/25 px-3 py-2 text-[9px] uppercase tracking-[0.16em] text-stone-500">
                  <span>Market</span>
                  <span className="text-center">Bid</span>
                  <span className="text-center">Fair</span>
                  <span className="text-center">Ask</span>
                </div>
                {MARKET_ROWS.map(({ key, label }) => (
                  <QuoteTableRow
                    key={key}
                    label={label}
                    fair={activeQuote.fairOdds[key]}
                    bid={activeQuote.bidOdds[key]}
                    ask={activeQuote.askOdds[key]}
                  />
                ))}
              </div>

              <EvidenceStamp
                rule="SPREAD WIDENS WITH FIELD PRESSURE"
                delta={`${activeQuote.spreadPct}% spread`}
                reference={`#${activeQuote.matchId}`}
                tone="info"
                gauge={{ threshold: 2, value: activeQuote.spreadPct, max: 20, unit: "%" }}
              />
            </div>

            <div className="rounded-xl border border-border bg-surface-3 p-5">
              <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-stone-400">
                <Activity className="h-4 w-4" />
                Spread inputs
              </div>
              <p className="mb-4 text-[11px] leading-4 text-stone-500">
                These two readings are what widen or narrow the spread on the left.
              </p>
              <div className="space-y-3">
                <div className="rounded-xl border border-border bg-black/20 p-3">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-stone-500">Field Pressure Score</p>
                  <p className="mt-1 font-mono text-xl font-semibold text-white">{activeQuote.fieldPressureScore}/45</p>
                </div>
                <div className="rounded-xl border border-border bg-black/20 p-3">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-stone-500">Reliability</p>
                  <p className="mt-1">
                    <StatusBadge label={activeQuote.reliability} tone={reliabilityTone(activeQuote.reliability)} withDot />
                  </p>
                </div>
              </div>
              {quotes.length > 1 && (
                <p className="mt-4 flex items-center gap-1.5 text-[10px] text-stone-500">
                  <TrendingUp className="h-3 w-3" aria-hidden="true" />
                  {quotes.length} live matches quoted — switch above to compare.
                </p>
              )}
            </div>
          </div>
        </div>
      ) : (
        <EmptyState reason="Waiting for a live match with odds history to quote." />
      )}
    </Card>
  );
}
