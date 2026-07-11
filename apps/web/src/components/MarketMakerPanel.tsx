import { Activity, Gauge } from "lucide-react";
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

function QuoteRow({
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
    <div className="rounded-xl border border-border bg-surface-3 p-3">
      <p className="text-[10px] uppercase tracking-[0.18em] text-stone-500">{label}</p>
      <div className="mt-2 grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-[9px] text-stone-500">Bid</p>
          <p className="font-mono text-sm font-semibold text-positive">{formatOdds(bid)}</p>
        </div>
        <div>
          <p className="text-[9px] text-stone-500">Fair</p>
          <p className="font-mono text-sm font-semibold text-white">{formatOdds(fair)}</p>
        </div>
        <div>
          <p className="text-[9px] text-stone-500">Ask</p>
          <p className="font-mono text-sm font-semibold text-accent-soft">{formatOdds(ask)}</p>
        </div>
      </div>
    </div>
  );
}

export function MarketMakerPanel() {
  const [quotes, setQuotes] = useState<MarketMakerQuote[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function loadQuotes() {
      try {
        const response = await fetch(`${API_BASE_URL}/api/market-maker`);
        const payload = (await response.json()) as { data?: MarketMakerQuote[] };

        if (!mounted) return;

        setQuotes(payload.data ?? []);
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

  const bestQuote = quotes[0];

  return (
    <Card id="market-maker" className="p-5">
      <SectionHeader
        eyebrow="In-Play Market Maker"
        title="Live bid/ask quotes"
        action={
          <div className="hidden items-center gap-2 rounded-xl border border-border bg-surface-3 px-3 py-2 sm:flex">
            <Gauge className="h-3.5 w-3.5 text-info" />
            <span className="text-[10px] uppercase tracking-[0.1em] text-stone-400">De-margined fair odds</span>
          </div>
        }
      />
      <p className="-mt-2 mb-5 max-w-3xl text-sm leading-6 text-stone-400">
        Quotes a bid/ask spread around TxLINE's own de-margined fair odds.
        The spread widens with field pressure and data-reliability
        problems, and narrows in calm, reliable conditions.
      </p>

      {isLoading ? (
        <EmptyState reason="Loading market maker quotes..." />
      ) : bestQuote ? (
        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-xl border border-border bg-surface-3 p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-lg font-semibold text-white">{bestQuote.match}</h3>
              <StatusBadge
                label={`${bestQuote.spreadWidth} · ${bestQuote.spreadPct}%`}
                tone={spreadWidthTone(bestQuote.spreadWidth)}
              />
            </div>

            <p className="mb-4 text-xs leading-5 text-stone-400">{bestQuote.reason}</p>

            <div className="grid gap-2">
              <QuoteRow
                label="Home"
                fair={bestQuote.fairOdds.home}
                bid={bestQuote.bidOdds.home}
                ask={bestQuote.askOdds.home}
              />
              <QuoteRow
                label="Draw"
                fair={bestQuote.fairOdds.draw}
                bid={bestQuote.bidOdds.draw}
                ask={bestQuote.askOdds.draw}
              />
              <QuoteRow
                label="Away"
                fair={bestQuote.fairOdds.away}
                bid={bestQuote.bidOdds.away}
                ask={bestQuote.askOdds.away}
              />
            </div>

            <EvidenceStamp
              rule="SPREAD WIDENS WITH FIELD PRESSURE"
              delta={`${bestQuote.spreadPct}% spread`}
              reference={`#${bestQuote.matchId}`}
              tone="info"
            />
          </div>

          <div className="rounded-xl border border-border bg-surface-3 p-5">
            <div className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-stone-400">
              <Activity className="h-4 w-4" />
              Spread inputs
            </div>
            <div className="space-y-3">
              <div className="rounded-xl border border-border bg-black/20 p-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-stone-500">Field Pressure Score</p>
                <p className="mt-1 font-mono text-xl font-semibold text-white">{bestQuote.fieldPressureScore}/45</p>
              </div>
              <div className="rounded-xl border border-border bg-black/20 p-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-stone-500">Reliability</p>
                <p className="mt-1">
                  <StatusBadge label={bestQuote.reliability} tone={reliabilityTone(bestQuote.reliability)} withDot />
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <EmptyState reason="Waiting for a live match with odds history to quote." />
      )}
    </Card>
  );
}
