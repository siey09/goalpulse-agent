import { Activity, Gauge } from "lucide-react";
import { useEffect, useState } from "react";

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

function spreadWidthClass(width: MarketMakerQuote["spreadWidth"]) {
  if (width === "NARROW") return "border-emerald-400/20 bg-emerald-400/10 text-emerald-200";
  if (width === "MODERATE") return "border-amber-400/20 bg-amber-400/10 text-amber-200";
  return "border-red-400/20 bg-red-400/10 text-red-200";
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
    <div className="rounded-2xl bg-black/25 p-3">
      <p className="text-[10px] uppercase tracking-[0.18em] text-stone-500">{label}</p>
      <div className="mt-2 grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-[9px] text-stone-500">Bid</p>
          <p className="text-sm font-semibold text-emerald-200">{formatOdds(bid)}</p>
        </div>
        <div>
          <p className="text-[9px] text-stone-500">Fair</p>
          <p className="text-sm font-semibold text-white">{formatOdds(fair)}</p>
        </div>
        <div>
          <p className="text-[9px] text-stone-500">Ask</p>
          <p className="text-sm font-semibold text-orange-200">{formatOdds(ask)}</p>
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
    <section
      id="market-maker"
      className="rounded-[28px] border border-sky-400/20 bg-gradient-to-br from-[#0d1420] via-[#10141d] to-[#070708] p-5 shadow-2xl shadow-sky-950/20"
    >
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.25em] text-sky-300">
            <Gauge className="h-4 w-4" />
            In-Play Market Maker
          </div>
          <h2 className="mt-2 text-2xl font-semibold text-white">
            Live bid/ask quotes
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-stone-400">
            Quotes a bid/ask spread around TxLINE's own de-margined fair odds.
            The spread widens with field pressure and data-reliability
            problems, and narrows in calm, reliable conditions.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="rounded-2xl border border-white/10 bg-black/25 p-5 text-sm text-stone-400">
          Loading market maker quotes...
        </div>
      ) : bestQuote ? (
        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-3xl border border-white/10 bg-black/25 p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-lg font-semibold text-white">{bestQuote.match}</h3>
              <span
                className={`rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] ${spreadWidthClass(bestQuote.spreadWidth)}`}
              >
                {bestQuote.spreadWidth} · {bestQuote.spreadPct}%
              </span>
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
          </div>

          <div className="rounded-3xl border border-white/10 bg-black/25 p-5">
            <div className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-stone-400">
              <Activity className="h-4 w-4" />
              Spread inputs
            </div>
            <div className="space-y-3">
              <div className="rounded-2xl bg-[#0b0806] p-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-stone-500">Field Pressure Score</p>
                <p className="mt-1 text-xl font-semibold text-white">{bestQuote.fieldPressureScore}/45</p>
              </div>
              <div className="rounded-2xl bg-[#0b0806] p-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-stone-500">Reliability</p>
                <p className="mt-1 text-xl font-semibold text-white">{bestQuote.reliability}</p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/10 bg-black/25 p-5 text-sm text-stone-400">
          Waiting for a live match with odds history to quote.
        </div>
      )}
    </section>
  );
}
